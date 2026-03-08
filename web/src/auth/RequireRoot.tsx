import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireRoot({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const loc = useLocation();

  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!user.is_root) return <Navigate to="/settings" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}