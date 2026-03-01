
//Shows detailed info for one incident
//Shows CCTV / latest frame
//Allows confirmation / false alarm
//Publishes advisory to public

import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import type { Incident } from "../types/incident";
import { TopBar } from "./TopBar";
import { useAuth } from "../auth/AuthContext";
import { claimIncident, verifyIncident, attendIncident, completeIncident } from "../lib/api";

export function IncidentPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [inc, setInc] = useState<Incident | null>(null);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("A confirmed incident is being handled. Please avoid the area temporarily.");
  const [radius, setRadius] = useState(250);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiMsg, setApiMsg] = useState("");

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "incidents", id);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setInc(null);
        return;
      }
      const data = { id: snap.id, ...(snap.data() as any) } as Incident;
      setInc(data);
      setNotes(data.notes ?? "");
    });
    return () => unsub();
  }, [id]);

  const frameSrc = useMemo(() => {
    if (!inc?.latestFrameJpeg) return null;
    return inc.latestFrameJpeg.startsWith("data:") ? inc.latestFrameJpeg : inc.latestFrameJpeg;
  }, [inc]);

  function getOfficerId(): string {
    return user?.uid ?? "";
  }

  async function withApiAction(action: () => Promise<unknown>, successMessage: string) {
    setErr("");
    setApiMsg("");

    if (!id) return;
    const officerId = getOfficerId();
    if (!officerId) {
      setErr("You must be signed in as an officer to run backend actions.");
      return;
    }

    setApiBusy(true);
    try {
      await action();
      setApiMsg(successMessage);
    } catch (ex: any) {
      setErr(ex?.message ?? "Backend request failed");
    } finally {
      setApiBusy(false);
    }
  }

  async function onClaim() {
    if (!id) return;
    const officerId = getOfficerId();
    await withApiAction(() => claimIncident(id, officerId), "Incident claimed via backend.");
  }

  async function onVerify(isTruePositive: boolean) {
    if (!id) return;
    const officerId = getOfficerId();
    await withApiAction(
      () => verifyIncident(id, officerId, isTruePositive, notes),
      isTruePositive ? "Marked as true positive." : "Marked as false positive."
    );
  }

  async function onAttend() {
    if (!id) return;
    const officerId = getOfficerId();
    await withApiAction(() => attendIncident(id, officerId, notes), "Marked as attending via backend.");
  }

  async function onComplete() {
    if (!id) return;
    const officerId = getOfficerId();
    const summary = notes.trim() || "Incident completed by responder.";
    await withApiAction(
      () => completeIncident(id, officerId, summary, notes),
      "Incident completed and report generated via backend."
    );
  }

  async function publish() {
    if (!id || !inc) return;
    setErr("");

    if (inc.status !== "CONFIRMED") {
      setErr("Only CONFIRMED incidents can be published.");
      return;
    }

    try {
      await addDoc(collection(db, "advisories"), {
        incidentId: id,
        title: `Police Advisory: Avoid within ${radius}m`,
        message: msg,
        lat: inc.lat,
        lng: inc.lng,
        radiusM: radius,
        published: true,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? "unknown",
      });
    } catch (ex: any) {
      setErr(ex?.message ?? "Publish failed");
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link className="badge" to="/dashboard">← Back</Link>
          {inc && <span className="badge">Risk {Number(inc.riskScore ?? 0).toFixed(1)}</span>}
        </div>

        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Incident Details</h2>

            {!inc ? (
              <div className="small">Incident not found.</div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <b>ID:</b> {inc.id}
                    <div className="small">{inc.category}</div>
                  </div>
                  <span className="badge">{inc.status}</span>
                </div>

                <hr />

                <div className="grid2">
                  <div className="card" style={{ padding: 12 }}>
                    <div className="small">Lat</div>
                    <b>{inc.lat.toFixed(5)}</b>
                  </div>
                  <div className="card" style={{ padding: 12 }}>
                    <div className="small">Lng</div>
                    <b>{inc.lng.toFixed(5)}</b>
                  </div>
                </div>

                <hr />

                <label className="small">Responder notes</label>
                <textarea
                  className="input"
                  style={{ minHeight: 90 }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />

                <div className="row" style={{ flexWrap: "wrap", marginTop: 12 }}>
                  <button className="button secondary" onClick={onClaim} disabled={apiBusy}>Claim</button>
                  <button className="button secondary" onClick={onAttend} disabled={apiBusy}>Attend</button>
                  <button className="button secondary" onClick={() => onVerify(true)} disabled={apiBusy}>Verify True</button>
                  <button className="button secondary" onClick={() => onVerify(false)} disabled={apiBusy}>Verify False</button>
                  <button className="button secondary" onClick={onComplete} disabled={apiBusy}>Complete</button>
                </div>

                {apiMsg && <div style={{ color: "#0b6b32", marginTop: 10 }}>{apiMsg}</div>}

                <hr />

                <h3 style={{ margin: "6px 0" }}>Publish Advisory</h3>
                <div className="small">Only publish after verifying the CCTV/latest frame.</div>

                <label className="small">Message</label>
                <textarea className="input" style={{ minHeight: 80 }} value={msg} onChange={(e) => setMsg(e.target.value)} />

                <label className="small">Radius (m)</label>
                <input className="input" type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} />

                <button className="button" onClick={publish} style={{ marginTop: 10 }}>
                  Publish
                </button>
              </>
            )}

            {err && <div style={{ color: "#b00020", marginTop: 12 }}>{err}</div>}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>CCTV / Latest Frame</h2>
            <div className="small">
              Listening to `incidents/{`id`}.latestFrameJpeg`.
            </div>

            <hr />

            {!frameSrc ? (
              <div className="small" style={{ border: "1px dashed #bbb", borderRadius: 14, padding: 14 }}>
                No frames yet. Camera node should update latestFrameJpeg when motion is flagged.
              </div>
            ) : (
              <img src={frameSrc} alt="frame" style={{ width: "100%", borderRadius: 14, border: "1px solid #e6e6e6" }} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}