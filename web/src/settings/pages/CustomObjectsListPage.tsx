import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";

type CustomObjectRow = {
  id: string;
  key: string;
  label: string;
  plural_label: string;
  parent_entity_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const PARENT_LABEL: Record<string, string> = {
  account: "Conta",
  lead: "Lead",
  contact: "Contato",
  opportunity: "Oportunidade",
};

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

export function CustomObjectsListPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<CustomObjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<CustomObjectRow[]>("/crm/provisioning/custom-objects", { signal });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (isAbortError(e)) return;
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao carregar objetos customizados");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, []);

  const countLabel = useMemo(() => {
    if (loading) return "Carregando...";
    return `${rows.length} objeto(s)`;
  }, [loading, rows.length]);

  async function toggleActive(row: CustomObjectRow) {
    try {
      await apiFetch<CustomObjectRow>(`/crm/provisioning/custom-objects/${row.id}`, {
        method: "PATCH",
        csrf: true,
        body: { is_active: !row.is_active },
      });
      await load();
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao atualizar objeto");
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Objetos customizados</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">
              Crie objetos adicionais para o CRM. Opcionalmente, defina um objeto core pai (1:N).
            </div>
          </div>

          <button className="btn btn-success" onClick={() => nav("/settings/objects/custom/new")}>
            Novo objeto
          </button>
        </div>

        <div className="mt-4 text-sm text-[rgb(var(--muted))]">{countLabel}</div>

        {err && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}
      </div>

      <div className="panel rounded-2xl p-6">
        {/* Scroll container: header sticky, body scroll */}
        <div className="max-h-[60vh] overflow-x-auto overflow-y-auto rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[rgb(var(--panel))] text-left text-[rgb(var(--muted))]">
              <tr className="border-b border-[rgb(var(--border))]">
                <th className="py-2 pr-4">Label</th>
                <th className="py-2 pr-4">Key</th>
                <th className="py-2 pr-4">Pai</th>
                <th className="py-2 pr-4">Ativo</th>
                <th className="py-2 pr-0"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[rgb(var(--border))]">
                  <td className="py-2 pr-4 font-medium">{r.label}</td>
                  <td className="py-2 pr-4 font-mono">{r.key}</td>
                  <td className="py-2 pr-4">
                    {r.parent_entity_type ? (
                      PARENT_LABEL[r.parent_entity_type] ?? r.parent_entity_type
                    ) : (
                      <span className="text-[rgb(var(--muted))]">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{r.is_active ? "Sim" : "Não"}</td>
                  <td className="py-2 pr-0 text-right">
                    <button className="btn btn-secondary" onClick={() => void toggleActive(r)}>
                      {r.is_active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td className="py-6 text-[rgb(var(--muted))]" colSpan={5}>
                    Nenhum objeto criado ainda.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="py-6 text-[rgb(var(--muted))]" colSpan={5}>
                    Carregando...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
