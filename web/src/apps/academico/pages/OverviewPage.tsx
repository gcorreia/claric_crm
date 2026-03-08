import { Card } from "../../../ui/Card";

export function OverviewPage() {
  return (
    <div className="grid gap-4">
      <Card title="Acadêmico · Visão geral" subtitle="Placeholder para dashboards e atalhos.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="panel-2 rounded-2xl p-4">
            <p className="text-xs text-[rgb(var(--muted))]">Indicador A</p>
            <p className="mt-2 text-2xl font-semibold">—</p>
          </div>
          <div className="panel-2 rounded-2xl p-4">
            <p className="text-xs text-[rgb(var(--muted))]">Indicador B</p>
            <p className="mt-2 text-2xl font-semibold">—</p>
          </div>
          <div className="panel-2 rounded-2xl p-4">
            <p className="text-xs text-[rgb(var(--muted))]">Indicador C</p>
            <p className="mt-2 text-2xl font-semibold">—</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
