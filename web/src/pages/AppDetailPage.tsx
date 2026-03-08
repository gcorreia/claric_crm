import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { Card } from "../ui/Card";
import { getAppById } from "../apps/registry";

function getAppIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/apps\/([^/]+)/);
  return m ? m[1] : null;
}

export function AppDetailPage() {
  const { appId } = useParams();
  const location = useLocation();

  const id = appId ?? getAppIdFromPath(location.pathname) ?? "";
  const app = id ? getAppById(id) : null;

  if (!app) {
    return (
      <Card title="App não encontrado">
        <p className="text-sm text-[rgb(var(--muted))]">
          Não existe app com id: {id || "(vazio)"}
        </p>
        <Link
          to="/apps"
          className="mt-3 inline-flex text-sm text-[rgba(var(--accent),1)] hover:underline"
        >
          Voltar
        </Link>
      </Card>
    );
  }

  // Só mostra o "card do módulo" na rota raiz do módulo: /apps/<id>
  const isModuleRoot = location.pathname === `/apps/${app.id}`;

  if (!isModuleRoot) {
    return <Outlet />;
  }

  return (
    <div className="grid gap-4">
      <Card title={app.name} subtitle={app.description}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">{app.category}</span>
          <span className="chip">Módulo</span>
        </div>

        {app.menu?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {app.menu.map((m) => (
              <NavLink
                key={m.to}
                to={m.to}
                end={m.to === `/apps/${app.id}`}
                className={({ isActive }) =>
                  ["btn", isActive ? "btn-primary" : ""].join(" ")
                }
              >
                {m.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </Card>

      <Outlet />
    </div>
  );
}