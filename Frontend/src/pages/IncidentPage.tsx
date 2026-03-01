// Shows detailed info for one incident
// Shows CCTV / latest frame
// Allows confirmation / false alarm
// Allows responders to mark "I'm responding" and see count
// Allows case completion (CLOSED)
// Publishes advisory to public (only after CONFIRMED)

//Shows detailed info for one incident
//Shows CCTV / latest frame
//Allows confirmation / false alarm
//Publishes advisory to public

import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  addDoc,
  collection,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Incident } from "../types/incident";
import { TopBar } from "./TopBar";
import { useAuth } from "../auth/AuthContext";

function safeNum(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function respondersCount(inc: Incident) {
  const r = inc.responders;
  if (!r) return 0;
  return Object.values(r).filter(Boolean).length;
}

export function IncidentPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [inc, setInc] = useState<(Incident & { id: string }) | null>(null);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("A confirmed incident is being handled. Please avoid the area temporarily.");
  const [radius, setRadius] = useState(2000);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "incidents", id);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setInc(null);
        return;
      }
      const data = { id: snap.id, ...(snap.data() as any) } as any;
      setInc(data);
      setNotes(data.notes ?? "");
    });
    return () => unsub();
  }, [id]);

  const frameSrc = useMemo(() => {
    if (!inc?.latestFrameJpeg) return null;
    return inc.latestFrameJpeg; // can be data: URL or storage URL
  }, [inc]);

  const previewUrl = useMemo(() => {
    return inc?.previewUrl ?? null;
  }, [inc]);

  const iAmResponding = useMemo(() => {
    if (!inc || !user?.uid) return false;
    return !!inc.responders?.[user.uid];
  }, [inc, user?.uid]);

  async function patchIncident(patch: Record<string, any>) {
    if (!id) return;
    setErr("");
    await updateDoc(doc(db, "incidents", id), {
      ...patch,
      notes,
      updatedAt: serverTimestamp(),
    });
  }

  async function verifyIncident() {
    if (!id || !inc) return;
    setBusy("verify");
    setErr("");

    try {
      // best-effort “first responder wins”: re-check current status
      const snap = await getDoc(doc(db, "incidents", id));
      if (!snap.exists()) throw new Error("Incident not found.");
      const current = snap.data() as any;

      if (current.status !== "NEW") {
        throw new Error(`Cannot verify. Incident is already ${current.status}.`);
      }

      await patchIncident({
        status: "CONFIRMED",
        confirmedBy: user?.uid ?? "unknown",
        confirmedAt: serverTimestamp(),
      });
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to verify incident");
    } finally {
      setBusy(null);
    }
  }

  async function rejectIncident() {
    if (!id || !inc) return;
    setBusy("reject");
    setErr("");

    try {
      const snap = await getDoc(doc(db, "incidents", id));
      if (!snap.exists()) throw new Error("Incident not found.");
      const current = snap.data() as any;

      if (current.status !== "NEW") {
        throw new Error(`Cannot reject. Incident is already ${current.status}.`);
      }

      await patchIncident({
        status: "FALSE_ALARM",
        rejectedBy: user?.uid ?? "unknown",
        rejectedAt: serverTimestamp(),
      });
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to reject incident");
    } finally {
      setBusy(null);
    }
  }

  async function toggleResponding() {
    if (!id || !inc || !user?.uid) return;
    setBusy("responding");
    setErr("");

    try {
      if (inc.status !== "CONFIRMED") {
        throw new Error("You can only respond after the incident is CONFIRMED.");
      }

      const key = `responders.${user.uid}`;
      await patchIncident({
        [key]: !iAmResponding,
      });
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to update responding");
    } finally {
      setBusy(null);
    }
  }

  async function completeCase() {
    if (!id || !inc) return;
    setBusy("close");
    setErr("");

    try {
      await patchIncident({
        status: "CLOSED",
        closedBy: user?.uid ?? "unknown",
        closedAt: serverTimestamp(),
      });
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to close case");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!id || !inc) return;
    setErr("");

    if (inc.status !== "CONFIRMED") {
      setErr("Only CONFIRMED incidents can be published.");
      return;
    }

    setBusy("publish");
    try {
      await addDoc(collection(db, "advisories"), {
        incidentId: id,
        title: `Police Advisory: Avoid area`,
        message: msg,
        lat: safeNum(inc.lat, 0),
        lng: safeNum(inc.lng, 0),
        radiusM: radius,
        published: true,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? "unknown",
      });
    } catch (ex: any) {
      setErr(ex?.message ?? "Publish failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link className="badge" to="/responder">
            ← Back
          </Link>
          {inc && <span className="badge">Risk {safeNum(inc.riskScore, 0).toFixed(1)}</span>}
        </div>

        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Incident Details</h2>

            {!inc ? (
              <div className="small">Incident not found.</div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <b>ID:</b> {inc.id}
                    <div className="small">{inc.category ?? "—"}</div>
                    {inc.metadataLabel && (
                      <div className="small" style={{ opacity: 0.8 }}>
                        AI flagged: <b>{inc.metadataLabel}</b>
                      </div>
                    )}
                  </div>
                  <span className="badge">{inc.status}</span>
                </div>

                <hr />

                <div className="grid2">
                  <div className="card" style={{ padding: 12 }}>
                    <div className="small">Lat</div>
                    <b>{safeNum(inc.lat, 0).toFixed(5)}</b>
                  </div>
                  <div className="card" style={{ padding: 12 }}>
                    <div className="small">Lng</div>
                    <b>{safeNum(inc.lng, 0).toFixed(5)}</b>
                  </div>
                </div>

                <div style={{ marginTop: 10 }} className="small">
                  Responders responding: <b>{respondersCount(inc)}</b>
                </div>

                <hr />

                <label className="small">Responder notes</label>
                <textarea className="input" style={{ minHeight: 90 }} value={notes} onChange={(e) => setNotes(e.target.value)} />

                <div className="row" style={{ flexWrap: "wrap", marginTop: 12, gap: 8 }}>
                  <button
                    className="button"
                    disabled={busy !== null || inc.status !== "NEW"}
                    onClick={verifyIncident}
                  >
                    {busy === "verify" ? "Verifying..." : "Verify (CONFIRM)"}
                  </button>

                  <button
                    className="button secondary"
                    disabled={busy !== null || inc.status !== "NEW"}
                    onClick={rejectIncident}
                  >
                    {busy === "reject" ? "Rejecting..." : "Reject (FALSE)"}
                  </button>

                  <button
                    className="button secondary"
                    disabled={busy !== null || inc.status !== "CONFIRMED"}
                    onClick={toggleResponding}
                  >
                    {busy === "responding"
                      ? "Updating..."
                      : iAmResponding
                      ? "Cancel responding"
                      : "I’m responding"}
                  </button>

                  <button className="button secondary" disabled={busy !== null} onClick={completeCase}>
                    {busy === "close" ? "Closing..." : "Case completed (CLOSE)"}
                  </button>
                </div>

                <hr />

                <h3 style={{ margin: "6px 0" }}>Publish Advisory</h3>
                <div className="small">Only publish after verifying the CCTV/latest frame (CONFIRMED).</div>

                <label className="small">Message</label>
                <textarea className="input" style={{ minHeight: 80 }} value={msg} onChange={(e) => setMsg(e.target.value)} />

                <label className="small">Radius (m)</label>
                <input className="input" type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} />

                <button className="button" disabled={busy !== null} onClick={publish} style={{ marginTop: 10 }}>
                  {busy === "publish" ? "Publishing..." : "Publish"}
                </button>
              </>
            )}

            {err && <div style={{ color: "#b00020", marginTop: 12 }}>{err}</div>}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>CCTV / Latest Frame</h2>
            <div className="small">Listening to <code>incidents/{id}.latestFrameJpeg</code> and <code>previewUrl</code>.</div>

            <hr />

            {previewUrl && (
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <div className="small">Live preview link (Responder-only)</div>
                <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                  <div className="small" style={{ overflowWrap: "anywhere", opacity: 0.85 }}>
                    {previewUrl}
                  </div>
                  <button className="button secondary" onClick={() => window.open(previewUrl, "_blank")}>
                    Open
                  </button>
                </div>
              </div>
            )}

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