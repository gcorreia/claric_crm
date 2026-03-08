// crm/web/src/redirects/ModuleAliasRedirect.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";

type Props = {
  appId: "comercial" | "academico" | "financeiro";
};

export function ModuleAliasRedirect({ appId }: Props) {
  const { pathname, search, hash } = useLocation();

  // Supports:
  //   /comercial            -> /apps/comercial
  //   /comercial/contas     -> /apps/comercial/contas
  //   /comercial/contas/123 -> /apps/comercial/contas/123
  const normalized = pathname.replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);

  const aliasRoot = parts[0]; // comercial|academico|financeiro
  const rest = parts.slice(1).join("/");

  const target = `/apps/${appId}${rest ? `/${rest}` : ""}${search ?? ""}${hash ?? ""}`;

  // Safety: only redirect when aliasRoot matches, otherwise go to /apps
  if (aliasRoot !== appId) return <Navigate to="/apps" replace />;

  return <Navigate to={target} replace />;
}