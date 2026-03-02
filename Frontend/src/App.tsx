
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./ui/styles.css";
import { AuthProvider } from "./auth/AuthContext";
import { LandingPage } from "./pages/LandingPage";
import { PublicPage } from "./pages/PublicPage";
import { ResponderPage } from "./pages/ResponderPage";
import { IncidentPage } from "./pages/IncidentPage";
import { ProfileSettingsPage } from "./pages/ProfileSettingsPage";
import { RequireRole } from "./auth/RequireRole";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LandingPage />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />

          {/* Profile Settings */}
          <Route
            path="/profile"
            element={
              <RequireRole allow={["public", "responder"]}>
                <ProfileSettingsPage />
              </RequireRole>
            }
          />

          {/* Public view — any logged-in user */}
          <Route
            path="/public"
            element={
              <RequireRole allow={["public", "responder"]}>
                <PublicPage />
              </RequireRole>
            }
          />

          {/* Responder view — responder only */}
          <Route
            path="/responder"
            element={
              <RequireRole allow={["responder"]}>
                <ResponderPage />
              </RequireRole>
            }
          />

          <Route
            path="/incidents/:id"
            element={
              <RequireRole allow={["responder"]}>
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