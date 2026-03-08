import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function CreatePage() {
  const nav = useNavigate();
  const [nome, setNome] = useState("");

  return (
    <div className="h-full min-h-0">
      <section className="panel flex h-full min-h-0 flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none">
        <header className="shrink-0 flex flex-col gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold">Novo Registro Acadêmico</div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Layout estilo grid alinhado ao padrão Salesforce.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={() => nav("/apps/academico/lista")}>
              Cancelar
            </button>
            <button className="btn btn-success" disabled={!nome.trim()}>
              Salvar registro
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            <section className="overflow-hidden border-t border-[rgb(var(--border))]">
              <div className="sf-band bg-[#d1e1f8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Detalhes
              </div>

              <div className="bg-[rgb(var(--panel))]">
                <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Nome *</label>
                    <input
                      className="input mt-1 w-full"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Digite..."
                    />
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Status</label>
                    <input className="input mt-1 w-full" placeholder="Placeholder" disabled />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
