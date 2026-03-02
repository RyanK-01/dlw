
//Live incident dashboard
//Shows all flagged incidents
//Lets responder choose which one to inspect

import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import type { Incident } from "../types/incident";
import { TopBar } from "./TopBar";
import { Link } from "react-router-dom";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";

const ACTIVE_STATUSES = new Set(["NEW", "TRIAGED", "CONFIRMED"]);

type PingState = "idle" | "sending" | "sent" | "error";

function chip(status: string) {
  const style: React.CSSProperties = { padding: "4px 10px", border: "1px solid #ddd", borderRadius: 999, fontSize: 12 };
  if (status === "CONFIRMED") return <span style={{ ...style, background: "#e8fff1", borderColor: "#bde8cc" }}>CONFIRMED</span>;
  if (status === "FALSE_ALARM") return <span style={{ ...style, background: "#ffe8ea", borderColor: "#ffb3bc" }}>FALSE</span>;
  if (status === "TRIAGED") return <span style={{ ...style, background: "#fff4e5", borderColor: "#ffd8a8" }}>TRIAGED</span>;
  return <span style={style}>{status}</span>;
}

export function ResponderPage() {
  const [incs, setIncs] = useState<Incident[]>([]);
  const [minRisk, setMinRisk] = useState(0);
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportErr, setReportErr] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");

  const backendBase = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
  const [pingStates, setPingStates] = useState<Record<string, PingState>>({});

  useEffect(() => {
    const q1 = query(collection(db, "incidents"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q1, (snap) => {
      const items: Incident[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setIncs(items);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => incs.filter((i) => (i.riskScore ?? 0) >= minRisk), [incs, minRisk]);
  const selectedIncident = useMemo(
    () => filtered.find((incident) => incident.id === selectedIncidentId) ?? filtered[0] ?? null,
    [filtered, selectedIncidentId]
  );

  useEffect(() => {
    if (!selectedIncident && filtered.length > 0) {
      setSelectedIncidentId(filtered[0].id);
      return;
    }
    if (selectedIncident && selectedIncident.id !== selectedIncidentId) {
      setSelectedIncidentId(selectedIncident.id);
    }
  }, [filtered, selectedIncident, selectedIncidentId]);

  useEffect(() => {
    if (!reportSuccess) return;
    const timer = window.setTimeout(() => setReportSuccess(""), 5000);
    return () => window.clearTimeout(timer);
  }, [reportSuccess]);

  async function generateReport() {
    if (!selectedIncident) return;

    setGeneratingReport(true);
    setReportErr("");
    setReportSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/incidents/${selectedIncident.id}/report/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody?.detail ?? `Failed with status ${res.status}`);
      }

      const body = await res.json().catch(() => ({}));
      const reportId = body?.reportId as string | undefined;
      if (reportId) {
        setReportSuccess(`Report generated successfully. Report ID: ${reportId}`);
      } else {
        setReportSuccess("Report generated successfully.");
      }
    } catch (error: any) {
      setReportErr(error?.message ?? "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handlePing(e: React.MouseEvent, incidentId: string) {
    e.preventDefault();
    e.stopPropagation();

    setPingStates((prev) => ({ ...prev, [incidentId]: "sending" }));
    try {
      const res = await fetch(`${BACKEND_URL}/api/incidents/${incidentId}/ping`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPingStates((prev) => ({ ...prev, [incidentId]: "sent" }));
      // Reset back to idle after 3 s
      setTimeout(() => setPingStates((prev) => ({ ...prev, [incidentId]: "idle" })), 3000);
    } catch {
      setPingStates((prev) => ({ ...prev, [incidentId]: "error" }));
      setTimeout(() => setPingStates((prev) => ({ ...prev, [incidentId]: "idle" })), 3000);
    }
  }

  function PingButton({ incident }: { incident: Incident }) {
    if (!ACTIVE_STATUSES.has(incident.status)) return null;
    const state = pingStates[incident.id] ?? "idle";
    return (
      <button
        className={`ping-btn${state === "sent" ? " ping-btn--sent" : ""}${state === "error" ? " ping-btn--error" : ""}`}
        disabled={state === "sending"}
        onClick={(e) => handlePing(e, incident.id)}
      >
        {state === "idle" && "🔔 Ping"}
        {state === "sending" && "Sending…"}
        {state === "sent" && "✓ Sent"}
        {state === "error" && "✗ Failed"}
      </button>
    );
  }

  return (
    <>
      <TopBar />
      <div style={{ minHeight: "calc(100vh - 57px)", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0e7490 100%)" }}>
      <div className="container">
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

              {filtered.map((i) => (
                <Link key={i.id} to={`/incidents/${i.id}`} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>Incident #{i.id.slice(0, 6)}</b>
                    {chip(i.status)}
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                    <span className="badge">Risk {Number(i.riskScore ?? 0).toFixed(1)}</span>
                    <span className="small">{i.category}</span>
                  </div>
                  <div className="small" style={{ marginTop: 8, opacity: 0.7 }}>
                    {i.lat.toFixed(5)}, {i.lng.toFixed(5)}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <PingButton incident={i} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Incident Report</h2>
            <div className="small">
              Generate an LLM-based responder report table for a selected incident.
            </div>
            <hr />

            <label className="small">Select incident</label>
            <select
              className="input"
              value={selectedIncident?.id ?? ""}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              disabled={filtered.length === 0}
            >
              {filtered.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.id.slice(0, 8)} • {incident.status} • Risk {Number(incident.riskScore ?? 0).toFixed(1)}
                </option>
              ))}
            </select>

            <button
              className="button"
              onClick={generateReport}
              disabled={!selectedIncident || generatingReport}
              style={{ marginTop: 10 }}
            >
              {generatingReport ? "Generating..." : "Generate Report (LLM)"}
            </button>

            {reportSuccess && <div style={{ color: "#0a7d34", marginTop: 10 }}>{reportSuccess}</div>}
            {reportErr && <div style={{ color: "#b00020", marginTop: 10 }}>{reportErr}</div>}

            {!selectedIncident?.llmReport ? (
              <div className="small" style={{ marginTop: 10 }}>
                No report generated yet for this incident.
              </div>
            ) : (
              <>
                <div className="small" style={{ marginTop: 12 }}>
                  {selectedIncident.llmReport.model ? `Model: ${selectedIncident.llmReport.model}` : "Model: configured backend default"}
                </div>

                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e6e6e6", padding: "8px 6px" }}>Field</th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e6e6e6", padding: "8px 6px" }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedIncident.llmReport.rows.map((row, idx) => (
                        <tr key={`${row.field}-${idx}`}>
                          <td style={{ borderBottom: "1px solid #f1f1f1", padding: "8px 6px", fontWeight: 600 }}>{row.field}</td>
                          <td style={{ borderBottom: "1px solid #f1f1f1", padding: "8px 6px" }}>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="small" style={{ fontWeight: 700, opacity: 0.9 }}>Summary</div>
                  <div style={{ marginTop: 4 }}>{selectedIncident.llmReport.summary}</div>
                </div>

                {!!selectedIncident.llmReport.recommendedActions?.length && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small" style={{ fontWeight: 700, opacity: 0.9 }}>Recommended Actions</div>
                    <ul style={{ marginTop: 6, paddingLeft: 20 }}>
                      {selectedIncident.llmReport.recommendedActions.map((action, idx) => (
                        <li key={`${action}-${idx}`}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}