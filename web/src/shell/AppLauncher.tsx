import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { APPS, APP_CATEGORIES, type AppDefinition } from "../apps/apps";
import { IconChevronRight, IconSearch } from "../ui/Icon";
import { Card } from "../ui/Card";

function accentStyle(app: AppDefinition) {
  const map: Record<string, string> = {
    blue: "rgba(var(--accent),0.55)",
    cyan: "rgba(var(--accent-2),0.55)",
    violet: "rgba(167,139,250,0.55)",
    emerald: "rgba(74,222,128,0.50)",
    amber: "rgba(251,191,36,0.55)",
  };
  const c = map[app.accent ?? "blue"] ?? map.blue;
  return {
    borderColor: c,
    background: `linear-gradient(135deg, ${c} 0%, rgba(var(--panel-2),0.0) 65%)`,
  } as const;
}

export function AppLauncher(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return APPS;
    return APPS.filter((a) => (a.name + " " + a.description + " " + a.category).toLowerCase().includes(needle));
  }, [q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/50"
        aria-label="Fechar aplicativos"
        onClick={onClose}
      />
      <div className="relative mx-auto mt-16 w-[min(980px,calc(100%-24px))]">
        <div className="panel rounded-3xl p-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Aplicativos</h2>
            <span className="chip">Launcher</span>
            <div className="ml-auto flex w-[420px] max-w-full items-center gap-2">
              <div className="panel-2 flex w-full items-center gap-2 rounded-xl px-3 py-2">
                <IconSearch />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[rgb(var(--muted))]"
                  placeholder="Encontrar um aplicativo..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                />
              </div>
              <button className="btn" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
            <Card title="Categorias" className="h-fit">
              <div className="flex flex-wrap gap-2">
                {APP_CATEGORIES.map((c) => (
                  <span key={c} className="chip">{c}</span>
                ))}
              </div>
              <p className="mt-3 text-xs text-[rgb(var(--muted))]">
                Este launcher é inspirado em consoles corporativos modernos — sem referências de marca de terceiros.
              </p>
            </Card>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((app) => (
                <Link
                  key={app.id}
                  to={`/apps/${app.id}`}
                  onClick={onClose}
                  className="panel group rounded-2xl p-4 transition hover:translate-y-[-1px]"
                  style={accentStyle(app)}
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl border border-[rgba(var(--border),0.8)] bg-[rgba(var(--panel),0.55)] text-sm font-semibold">
                      {app.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{app.name}</h3>
                        <span className="chip">{app.category}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--muted))]">{app.description}</p>
                    </div>
                    <span className="ml-auto mt-1 opacity-60 transition group-hover:opacity-100">
                      <IconChevronRight />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-[rgb(var(--muted))]">
            <span>{filtered.length} apps</span>
            <Link className="hover:text-[rgb(var(--text))]" to="/apps" onClick={onClose}>
              Ver lista completa
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
