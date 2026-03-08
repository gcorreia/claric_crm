import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { APPS } from "../apps/apps";

export function HomePage() {
  return (
    <div className="grid gap-4">
      <Card
        title="Visão geral"
        subtitle="Layout novo, do zero, inspirado em consoles corporativos modernos (sem nomes de terceiros)."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="panel-2 rounded-2xl p-4">
            <p className="text-xs text-[rgb(var(--muted))]">Atividade hoje</p>
            <p className="mt-2 text-2xl font-semibold">12</p>
            <p className="mt-1 text-xs text-[rgb(var(--muted))]">tarefas / eventos</p>
          </div>
          <div className="panel-2 rounded-2xl p-4">
            <p className="text-xs text-[rgb(var(--muted))]">Em andamento</p>
            <p className="mt-2 text-2xl font-semibold">5</p>
            <p className="mt-1 text-xs text-[rgb(var(--muted))]">itens ativos</p>
          </div>
          <div className="panel-2 rounded-2xl p-4">
            <p className="text-xs text-[rgb(var(--muted))]">Alertas</p>
            <p className="mt-2 text-2xl font-semibold">2</p>
            <p className="mt-1 text-xs text-[rgb(var(--muted))]">pendências</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Acesso rápido" subtitle="Abra um app para começar.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {APPS.slice(0, 4).map((a) => (
              <Link key={a.id} to={`/apps/${a.id}`} className="panel-2 rounded-2xl p-3 hover:brightness-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{a.name}</p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">{a.description}</p>
                  </div>
                  <span className="chip">{a.category}</span>
                </div>
              </Link>
            ))}
          </div>
          <Link to="/apps" className="mt-3 inline-flex text-sm text-[rgba(var(--accent),1)] hover:underline">
            Ver todos os aplicativos
          </Link>
        </Card>

        <Card title="Feed" subtitle="Placeholder para eventos do sistema.">
          <div className="grid gap-2">
            {[
              "Novo lead importado (arquivo CSV).",
              "Ticket reaberto: Cliente ACME.",
              "Workflow atualizado: notificação pós-venda.",
            ].map((t) => (
              <div key={t} className="panel-2 rounded-2xl p-3 text-sm">
                <p>{t}</p>
                <p className="mt-1 text-xs text-[rgb(var(--muted))]">agora</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
