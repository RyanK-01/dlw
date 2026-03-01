
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./ui/styles.css";
import { AuthProvider } from "./auth/AuthContext";
import { LandingPage } from "./pages/LandingPage";
import { PublicPage } from "./pages/PublicPage";
import { ResponderPage } from "./pages/ResponderPage";
import { IncidentPage } from "./pages/IncidentPage";
import { RequireRole } from "./auth/RequireRole";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LandingPage />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />

          {/* Public view — any logged-in user */}
          <Route
            path="/public"
            element={
              <RequireRole allow={["public", "responder", "admin"]}>
                <PublicPage />
              </RequireRole>
            }
          />

          {/* Responder view — responder/admin only */}
          <Route
            path="/responder"
            element={
              <RequireRole allow={["responder", "admin"]}>
                <ResponderPage />
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

          {/* Legacy / convenience redirects */}
          <Route path="/dashboard" element={<Navigate to="/public" replace />} />
          <Route path="/responder/incidents/:id" element={<Navigate to="/incidents/:id" replace />} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}