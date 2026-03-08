#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f "package.json" ]]; then
  echo "ERRO: rode dentro da pasta web/ (onde existe package.json)."
  exit 1
fi

mkdir -p src/pages
mkdir -p src/apps/{comercial,academico}
mkdir -p src/apps/comercial/{pages,features,services,types}
mkdir -p src/apps/academico/{pages,features,services,types}

cat > src/apps/app.types.ts <<'TS'
import type { ReactNode } from "react";

export type AppId = "comercial" | "academico";

export type AppManifest = {
  id: AppId;
  label: string;
  basePath: `/${string}`;
  description?: string;
  icon?: ReactNode;
};
TS

cat > src/apps/comercial/manifest.ts <<'TS'
import type { AppManifest } from "../app.types";

export const comercialManifest: AppManifest = {
  id: "comercial",
  label: "Comercial",
  basePath: "/comercial",
  description: "Vendas, pipeline, contas, contatos e propostas."
};
TS

cat > src/apps/academico/manifest.ts <<'TS'
import type { AppManifest } from "../app.types";

export const academicoManifest: AppManifest = {
  id: "academico",
  label: "Acadêmico",
  basePath: "/academico",
  description: "Alunos, turmas, matrículas e rotinas acadêmicas."
};
TS

cat > src/apps/index.ts <<'TS'
import type { AppManifest } from "./app.types";
import { comercialManifest } from "./comercial/manifest";
import { academicoManifest } from "./academico/manifest";

export const apps: AppManifest[] = [comercialManifest, academicoManifest];
TS

cat > src/pages/HomePage.tsx <<'TSX'
import { Link } from "react-router-dom";
import { apps } from "../apps";

export function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ margin: 0 }}>Home</h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>Escolha um aplicativo para continuar.</p>

      <div style={{ display: "grid", gap: 12, marginTop: 16, maxWidth: 560 }}>
        {apps.map((app) => (
          <Link
            key={app.id}
            to={app.basePath}
            style={{
              display: "block",
              padding: 16,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              textDecoration: "none",
              color: "inherit"
            }}
          >
            <div style={{ fontWeight: 900 }}>{app.label}</div>
            {app.description && <div style={{ marginTop: 6, opacity: 0.75 }}>{app.description}</div>}
          </Link>
        ))}
      </div>
    </main>
  );
}
TSX

cat > src/pages/NotFoundPage.tsx <<'TSX'
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ margin: 0 }}>404</h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>Página não encontrada.</p>
      <Link to="/" style={{ display: "inline-block", marginTop: 12 }}>Voltar para Home</Link>
    </main>
  );
}
TSX

cat > src/apps/comercial/pages/ComercialHomePage.tsx <<'TSX'
import { comercialManifest } from "../manifest";

export function ComercialHomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ margin: 0 }}>{comercialManifest.label}</h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>Módulo criado. As páginas do Comercial serão definidas depois.</p>
    </main>
  );
}
TSX

cat > src/apps/academico/pages/AcademicoHomePage.tsx <<'TSX'
import { academicoManifest } from "../manifest";

export function AcademicoHomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ margin: 0 }}>{academicoManifest.label}</h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>Módulo criado. As páginas do Acadêmico serão definidas depois.</p>
    </main>
  );
}
TSX

cat > src/router.tsx <<'TSX'
import { Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ComercialHomePage } from "./apps/comercial/pages/ComercialHomePage";
import { AcademicoHomePage } from "./apps/academico/pages/AcademicoHomePage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/comercial" element={<ComercialHomePage />} />
      <Route path="/academico" element={<AcademicoHomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
TSX

cat > src/App.tsx <<'TSX'
import { AppRouter } from "./router";
export default function App() { return <AppRouter />; }
TSX

cat > src/main.tsx <<'TSX'
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
TSX

echo "OK ✅ Estrutura criada/atualizada."
