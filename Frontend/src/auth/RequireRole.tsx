
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { UserRole } from "../types/user";

export function RequireRole({ allow, children }: { allow: UserRole[]; children: React.ReactNode }) {
  const { user, role, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!role || !allow.includes(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}