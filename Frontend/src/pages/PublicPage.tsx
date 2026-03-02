
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { auth } from "../firebase";
import type { Advisory } from "../types/advisory";
import { TopBar } from "./TopBar";
import { useLocationTracking } from "../hooks/useLocationTracking";
import { mockIncidents } from "../mockIncidents";

import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// Green pulsing dot for "You are here"
const meIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;border-radius:50%;
    background:#1976d2;border:2.5px solid white;
    box-shadow:0 0 0 4px rgba(25,118,210,0.25);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Grey dot for other online users
const userIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:12px;height:12px;border-radius:50%;
    background:#555;border:2px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const incidentPinIcon = L.divIcon({
  className: "",
  html: `<div class="pushpin-marker">
    <div class="pushpin-head"></div>
    <div class="pushpin-shine"></div>
    <div class="pushpin-neck"></div>
    <div class="pushpin-point"></div>
  </div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8],
});

type LiveUser = { uid: string; lat: number; lng: number };
type IncidentRecord = {
  id: string;
  category: string;
  status: "Active" | "Resolved";
  timestampMs: number;
  lat: number;
  lng: number;
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const INCIDENT_SOURCE: "mock" | "firebase" =
  import.meta.env.VITE_PUBLIC_INCIDENT_SOURCE === "mock" ? "mock" : "firebase";

function toMillis(value: any): number {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function humanizeCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeStatus(value: any): "Active" | "Resolved" {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "active") return "Active";
  if (text === "resolved") return "Resolved";
  return "Resolved";
}

function MapFocusController({ target }: { target: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [map, target]);

  return null;
}

export function PublicPage() {
  const [advs, setAdvs] = useState<Advisory[]>([]);
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [radiusM, setRadiusM] = useState(1500);
  const [viewMode, setViewMode] = useState<"advisories" | "incidents">("incidents");
  const [incidentFilter, setIncidentFilter] = useState<"all" | "active" | "resolved">("all");
  const [incidentSort, setIncidentSort] = useState<"newest" | "oldest">("newest");
  const [showMapControls, setShowMapControls] = useState(false);
  const [incidentRecords, setIncidentRecords] = useState<IncidentRecord[]>([]);
  const [locationCache, setLocationCache] = useState<Record<string, string>>({});
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
  const [focusedIncident, setFocusedIncident] = useState<[number, number] | null>(null);

  // Live location tracking — writes to Firestore locations/{uid}
  const me = useLocationTracking();

  // Listen to all published advisories
  useEffect(() => {
    const q1 = query(collection(db, "advisories"), where("published", "==", true));
    const unsub = onSnapshot(q1, (snap) => {
      const items: Advisory[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setAdvs(items);
    });
    return () => unsub();
  }, []);

  // Listen to all online users' locations from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "locations"), (snap) => {
      const myUid = auth.currentUser?.uid;
      const users: LiveUser[] = snap.docs
        .filter((d) => d.id !== myUid)          // exclude self
        .map((d) => ({ uid: d.id, ...(d.data() as any) }));
      setLiveUsers(users);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (INCIDENT_SOURCE === "mock") {
      setIncidentRecords(
        mockIncidents.map((incident) => ({
          id: incident.id,
          category: incident.category,
          status: normalizeStatus(incident.status),
          timestampMs: toMillis(incident.timestamp),
          lat: incident.lat,
          lng: incident.lng,
        }))
      );
      return;
    }

    const unsub = onSnapshot(collection(db, "incidents"), (snap) => {
      const rows: IncidentRecord[] = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() as any;
          if (
            typeof data?.category !== "string" ||
            typeof data?.lat !== "number" ||
            typeof data?.lng !== "number"
          ) {
            return null;
          }

          return {
            id: docSnap.id,
            category: data.category,
            status: normalizeStatus(data?.Status ?? data?.status),
            timestampMs: toMillis(data.timestamp),
            lat: data.lat,
            lng: data.lng,
          };
        })
        .filter((record): record is IncidentRecord => record !== null);

      setIncidentRecords(rows);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const keysToFetch = incidentRecords
      .map((record) => ({ key: coordKey(record.lat, record.lng), lat: record.lat, lng: record.lng }))
      .filter((entry) => !locationCache[entry.key]);

    if (keysToFetch.length === 0) return;

    let cancelled = false;

    async function runReverseGeocoding() {
      const uniqueEntries = keysToFetch.filter(
        (entry, index, arr) => arr.findIndex((x) => x.key === entry.key) === index
      );

      const resolved = await Promise.all(
        uniqueEntries.map(async ({ key, lat, lng }) => {
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
            );
            if (!response.ok) throw new Error("Failed reverse geocoding");
            const payload = (await response.json()) as { display_name?: string };
            return [key, payload.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`] as const;
          } catch {
            return [key, `${lat.toFixed(5)}, ${lng.toFixed(5)}`] as const;
          }
        })
      );

      if (cancelled) return;

      setLocationCache((prev) => {
        const next = { ...prev };
        for (const [key, location] of resolved) {
          next[key] = location;
        }
        return next;
      });
    }

    runReverseGeocoding();
    return () => {
      cancelled = true;
    };
  }, [incidentRecords, locationCache]);

  useEffect(() => {
    setSelectedIncidentIds((prev) => prev.filter((id) => incidentRecords.some((item) => item.id === id)));
  }, [incidentRecords]);

  const center = useMemo<[number, number]>(() => {
    if (me) return [me.lat, me.lng];
    return [1.3521, 103.8198]; // SG fallback
  }, [me]);

  const nearby = useMemo(() => {
    if (!me) return advs;
    return advs.filter((a) => haversineM(me.lat, me.lng, a.lat, a.lng) <= radiusM);
  }, [advs, me, radiusM]);

  const incidentRows = useMemo(() => {
    return incidentRecords.map((incident) => {
      const key = coordKey(incident.lat, incident.lng);
      return {
        id: incident.id,
        location: locationCache[key] ?? `${incident.lat.toFixed(5)}, ${incident.lng.toFixed(5)}`,
        type: humanizeCategory(incident.category),
        status: incident.status,
        time: new Date(incident.timestampMs).toLocaleString(),
        timestampMs: incident.timestampMs,
        lat: incident.lat,
        lng: incident.lng,
      };
    });
  }, [incidentRecords, locationCache]);

  // Filter and sort incidents
  const filteredIncidents = useMemo(() => {
    let filtered = [...incidentRows];
    
    if (incidentFilter === "active") {
      filtered = filtered.filter((i) => i.status === "Active");
    } else if (incidentFilter === "resolved") {
      filtered = filtered.filter((i) => i.status === "Resolved");
    }
    
    filtered.sort((a, b) => b.timestampMs - a.timestampMs);
    if (incidentSort === "oldest") filtered.reverse();
    
    return filtered;
  }, [incidentRows, incidentFilter, incidentSort]);

  const selectedIncidentRows = useMemo(
    () => incidentRows.filter((incident) => selectedIncidentIds.includes(incident.id)),
    [incidentRows, selectedIncidentIds]
  );

  const allVisibleSelected =
    filteredIncidents.length > 0 && filteredIncidents.every((incident) => selectedIncidentIds.includes(incident.id));

  function toggleIncidentSelection(incidentId: string) {
    setSelectedIncidentIds((prev) =>
      prev.includes(incidentId) ? prev.filter((id) => id !== incidentId) : [...prev, incidentId]
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredIncidents.map((incident) => incident.id);
    setSelectedIncidentIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  }

  function onIncidentRowClick(incident: { id: string; lat: number; lng: number }) {
    setFocusedIncident([incident.lat, incident.lng]);
    setSelectedIncidentIds((prev) => (prev.includes(incident.id) ? prev : [...prev, incident.id]));
  }

  return (
    <>
      <TopBar />
      <div style={{ minHeight: "calc(100vh - 57px)", background: "#fafafa" }}>
        <div className="public-page-container">
          <div className="public-grid">
            {/* Left: Information Board */}
            <div className="card info-panel">
              <div className="row info-header-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>Information Board</h2>
                <select 
                  className="input" 
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as any)}
                  style={{ width: "min(180px, 45vw)" }}
                >
                  <option value="advisories">Active Advisories</option>
                  <option value="incidents">Incident</option>
                </select>
              </div>

              {viewMode === "advisories" ? (
                <div className="col">
                  <div className="small" style={{ marginBottom: 12 }}>
                    Showing {nearby.length} advisor{nearby.length !== 1 ? "ies" : "y"} within {radiusM}m
                  </div>
                  {nearby.length === 0 && <div className="small">No advisories near you.</div>}
                  {nearby.map((a) => (
                    <div key={a.id} className="info-card">
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <b>{a.title}</b>
                        <span className="badge">{a.radiusM}m</span>
                      </div>
                      <div className="small" style={{ marginTop: 6 }}>{a.message}</div>
                      <div className="small" style={{ marginTop: 6, opacity: 0.65 }}>
                        Location: {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="col">
                  {/* Filters for Incidents */}
                  <div className="row incident-filters" style={{ gap: 12, marginBottom: 12 }}>
                    <select 
                      className="input" 
                      value={incidentFilter}
                      onChange={(e) => setIncidentFilter(e.target.value as any)}
                      style={{ flex: 1 }}
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="resolved">Resolved</option>
                    </select>
                    <select 
                      className="input" 
                      value={incidentSort}
                      onChange={(e) => setIncidentSort(e.target.value as any)}
                      style={{ flex: 1 }}
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                    </select>
                  </div>

                  <label className="incident-select-all">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                    <span>Select all</span>
                  </label>

                  {/* Incidents Table */}
                  <div className="incidents-table">
                    <div className="incidents-header">
                      <div></div>
                      <div>Location</div>
                      <div>Type</div>
                      <div>Status</div>
                      <div>Time</div>
                    </div>
                    {filteredIncidents.map((inc) => (
                      <div key={inc.id} className="incidents-row incident-row-clickable" onClick={() => onIncidentRowClick(inc)}>
                        <div>
                          <input
                            type="checkbox"
                            checked={selectedIncidentIds.includes(inc.id)}
                            onChange={() => toggleIncidentSelection(inc.id)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </div>
                        <div>{inc.location}</div>
                        <div>{inc.type}</div>
                        <div>
                          <span className={`status-badge ${inc.status.toLowerCase()}`}>
                            {inc.status}
                          </span>
                        </div>
                        <div>{inc.time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Map */}
            <div className="card map-panel" style={{ position: "relative" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>Map</h2>
                <button
                  type="button"
                  className="map-gear-btn"
                  onClick={() => setShowMapControls((prev) => !prev)}
                  aria-label="Toggle map controls"
                  title="Map controls"
                >
                  ⚙
                </button>
              </div>

              {showMapControls && (
                <div className="map-controls-popup">
                  <div className="col" style={{ gap: 12 }}>
                    <div className="col">
                      <label className="small" style={{ fontWeight: 600 }}>Radius Filter (m)</label>
                      <input 
                        className="input" 
                        type="number" 
                        value={radiusM} 
                        onChange={(e) => setRadiusM(Number(e.target.value))} 
                      />
                    </div>
                    <div className="col">
                      <label className="small" style={{ fontWeight: 600 }}>Your Location</label>
                      <div className="small">
                        {me ? `${me.lat.toFixed(5)}, ${me.lng.toFixed(5)}` : "Acquiring…"}
                      </div>
                      <div className="small" style={{ opacity: 0.6 }}>
                        {liveUsers.length} other user{liveUsers.length !== 1 ? "s" : ""} online
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mapWrap-large">
                <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
                  <MapFocusController target={focusedIncident} />
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />

                  {me && (
                    <>
                      <Marker position={[me.lat, me.lng]} icon={meIcon}>
                        <Popup>You are here</Popup>
                      </Marker>
                      <Circle center={[me.lat, me.lng]} radius={radiusM} color="#1976d2" fillOpacity={0.06} />
                    </>
                  )}

                  {/* Other online users */}
                  {liveUsers.map((u) => (
                    <Marker key={u.uid} position={[u.lat, u.lng]} icon={userIcon}>
                      <Popup>Another user nearby</Popup>
                    </Marker>
                  ))}

                  {selectedIncidentRows.map((incident) => (
                    <Marker key={`incident-${incident.id}`} position={[incident.lat, incident.lng]} icon={incidentPinIcon}>
                      <Popup>
                        <b>{incident.type}</b><br />
                        {incident.status}<br />
                        {incident.location}<br />
                        {incident.time}
                      </Popup>
                    </Marker>
                  ))}

                  {nearby.map((a) => (
                    <React.Fragment key={a.id}>
                      <Marker position={[a.lat, a.lng]}>
                        <Popup>
                          <b>{a.title}</b><br />
                          Radius: {a.radiusM}m<br />
                          {a.message}
                        </Popup>
                      </Marker>
                      <Circle center={[a.lat, a.lng]} radius={a.radiusM} />
                    </React.Fragment>
                  ))}
                </MapContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}