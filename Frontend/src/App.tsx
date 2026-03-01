
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./ui/styles.css";
import { AuthProvider } from "./auth/AuthContext";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { IncidentPage } from "./pages/IncidentPage";
import { RequireRole } from "./auth/RequireRole";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LandingPage />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />

          <Route
            path="/dashboard"
            element={
              <RequireRole allow={["public", "responder", "admin"]}>
                <DashboardPage />
              </RequireRole>
            }
          />

          <Route
            path="/incidents/:id"
            element={
              <RequireRole allow={["responder", "admin"]}>
                <IncidentPage />
              </RequireRole>
            }
          />

          {/* Legacy redirects */}
          <Route path="/public" element={<Navigate to="/dashboard" replace />} />
          <Route path="/responder" element={<Navigate to="/dashboard" replace />} />
          <Route path="/responder/incidents/:id" element={<Navigate to="/dashboard" replace />} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}