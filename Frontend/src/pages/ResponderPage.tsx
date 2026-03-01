// Live incident dashboard
// Shows all flagged incidents
// Lets responder choose which one to inspect
// NEW requirement: Latest incident always pops up (prefer NEW, else CONFIRMED)

//Live incident dashboard
//Shows all flagged incidents
//Lets responder choose which one to inspect

import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import type { Incident } from "../types/incident";
import { TopBar } from "./TopBar";
import { Link } from "react-router-dom";

function chip(status: string) {
  const style: React.CSSProperties = {
    padding: "4px 10px",
    border: "1px solid #ddd",
    borderRadius: 999,
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  if (status === "CONFIRMED") return <span style={{ ...style, background: "#e8fff1", borderColor: "#bde8cc" }}>CONFIRMED</span>;
  if (status === "FALSE_ALARM") return <span style={{ ...style, background: "#ffe8ea", borderColor: "#ffb3bc" }}>FALSE</span>;
  if (status === "NEW") return <span style={{ ...style, background: "#eef5ff", borderColor: "#c8dbff" }}>NEW</span>;
  if (status === "CLOSED") return <span style={{ ...style, background: "#f2f2f2", borderColor: "#ddd" }}>CLOSED</span>;

  return <span style={style}>{status}</span>;
}

function safeNum(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function respondersCount(i: Incident) {
  const r = i.responders;
  if (!r) return 0;
  return Object.values(r).filter(Boolean).length;
}

export function ResponderPage() {
  const [incs, setIncs] = useState<Incident[]>([]);
  const [minRisk, setMinRisk] = useState(0);

  // controls dismissing the banner so it doesn’t annoy during demo
  const [dismissedBannerId, setDismissedBannerId] = useState<string | null>(null);

  useEffect(() => {
    // Pull all incidents ordered by updatedAt.
    // (Backend can decide who gets SMS; UI can show all, but banner prioritizes NEW/CONFIRMED.)
    const q1 = query(collection(db, "incidents"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q1, (snap) => {
      const items: Incident[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setIncs(items);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => incs.filter((i) => safeNum(i.riskScore, 0) >= minRisk), [incs, minRisk]);

  // Latest incident banner: prefer NEW (needs verification), else CONFIRMED (ongoing), ignore FALSE_ALARM/CLOSED
  const latestRelevant = useMemo(() => {
    const candidates = incs.filter((i) => i.status === "NEW" || i.status === "CONFIRMED");
    if (candidates.length === 0) return null;

    // Priority: NEW first, then CONFIRMED
    const priority = (s: string) => (s === "NEW" ? 0 : 1);

    const sorted = [...candidates].sort((a, b) => {
      const pa = priority(a.status);
      const pb = priority(b.status);
      if (pa !== pb) return pa - pb;

      const ta = (a.updatedAt as any)?.toMillis?.() ?? 0;
      const tb = (b.updatedAt as any)?.toMillis?.() ?? 0;
      return tb - ta;
    });

    return sorted[0] ?? null;
  }, [incs]);

  // Reset dismissal when a new latest incident appears
  useEffect(() => {
    if (!latestRelevant) return;
    if (dismissedBannerId && dismissedBannerId !== (latestRelevant as any).id) {
      setDismissedBannerId(null);
    }
  }, [latestRelevant, dismissedBannerId]);

  return (
    <>
      <TopBar />
      <div className="container">
        {/* Latest incident banner */}
        {latestRelevant && dismissedBannerId !== (latestRelevant as any).id && (
          <div className="card" style={{ padding: 14, border: "1px solid #ffe08a", background: "#fff8e1", marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Latest incident</div>
                <div className="small" style={{ marginTop: 6 }}>
                  <b>#{(latestRelevant as any).id.slice(0, 6)}</b> • {latestRelevant.category ?? "—"} • {chip(latestRelevant.status)}
                </div>
                <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                  Risk: {safeNum(latestRelevant.riskScore, 0).toFixed(1)}
                  {latestRelevant.metadataLabel ? ` • AI: ${latestRelevant.metadataLabel}` : ""}
                </div>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <Link className="button" to={`/responder/incidents/${(latestRelevant as any).id}`}>
                  Open
                </Link>
                <button className="button secondary" onClick={() => setDismissedBannerId((latestRelevant as any).id)}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid2">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Responder Queue</h2>
            <div className="small">Live updates via Firestore listener.</div>
            <hr />

            <label className="small">Minimum risk score</label>
            <input className="input" type="number" value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value))} />
            <hr />

            <div className="col">
              {filtered.length === 0 && <div className="small">No incidents.</div>}

              {filtered.map((i: any) => (
                <Link key={i.id} to={`/responder/incidents/${i.id}`} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>Incident #{i.id.slice(0, 6)}</b>
                    {chip(i.status)}
                  </div>

                  <div className="row" style={{ justifyContent: "space-between", marginTop: 8, gap: 10 }}>
                    <span className="badge">Risk {safeNum(i.riskScore, 0).toFixed(1)}</span>
                    <span className="small" style={{ textAlign: "right" }}>
                      {i.category ?? "—"} • Responders: <b>{respondersCount(i)}</b>
                    </span>
                  </div>

                  <div className="small" style={{ marginTop: 8, opacity: 0.7 }}>
                    {safeNum(i.lat, 0).toFixed(5)}, {safeNum(i.lng, 0).toFixed(5)}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Workflow</h2>
            <div className="small">
              View CCTV/latest frame → Verify or Reject → If verified, publish advisory → Mark case completed.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}