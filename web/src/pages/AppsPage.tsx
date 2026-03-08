import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { APPS, APP_CATEGORIES } from "../apps/apps";

export function AppsPage() {
  return (
    <div className="grid gap-4">
      <Card title="Aplicativos" subtitle="Lista completa de apps instalados.">
        <div className="flex flex-wrap gap-2">
          {APP_CATEGORIES.map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map((a) => (
          <Link key={a.id} to={`/apps/${a.id}`} className="panel rounded-2xl p-4 hover:brightness-105">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] text-sm font-semibold">
                {a.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{a.name}</h3>
                  <span className="chip">{a.category}</span>
                </div>
                <p className="mt-1 text-xs text-[rgb(var(--muted))]">{a.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
