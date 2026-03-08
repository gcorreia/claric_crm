// crm/web/src/settings/pages/BusinessUnitsListPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/apiClient";

type TenantRow = {
  id: string;
  name: string;
  address: string;
  admin_root_user_id?: string | null;
};

type DeleteState = { open: boolean; id: string; name: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function BusinessUnitsListPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [q, setQ] = useState("");

  const [del, setDel] = useState<DeleteState>({ open: false, id: "", name: "" });

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<TenantRow[]>("/root/tenants");
      setRows(data ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao carregar tenants.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(qq) || (r.address ?? "").toLowerCase().includes(qq));
  }, [rows, q]);

  async function onConfirmDelete() {
    setErr(null);
    try {
      await apiFetch(`/root/tenants/${del.id}`, { method: "DELETE", csrf: true });
      setDel({ open: false, id: "", name: "" });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao excluir tenant.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Tenants</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">Root-only. Mutations exigem CSRF.</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm hover:bg-[rgb(var(--panel))]"
              onClick={() => void load()}
              disabled={loading}
            >
              Atualizar
            </button>

            <Link
              to="/settings/root/business-units/new"
              className="btn btn-success"
            >
              Novo Tenant
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <div className="panel-2 flex items-center gap-2 rounded-xl px-3 py-2">
            <span className="text-[rgb(var(--muted))]" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path
                  d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  opacity="0.9"
                />
                <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-[rgb(var(--muted))]"
              placeholder="Buscar por nome ou endereço..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {err && (
        <div className="panel rounded-2xl p-6">
          <div className="text-sm font-semibold">Atenção</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">{err}</div>
        </div>
      )}

      {!err && loading && <div className="panel rounded-2xl p-6 text-sm text-[rgb(var(--muted))]">Carregando…</div>}

      {!err && !loading && filtered.length === 0 && (
        <div className="panel rounded-2xl p-6">
          <div className="text-sm font-semibold">Nenhum tenant encontrado</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">Crie o primeiro tenant para começar.</div>
        </div>
      )}

      {!err && !loading && filtered.length > 0 && (
        <div className="panel rounded-2xl p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[rgb(var(--panel-2))] text-[rgb(var(--muted))]">
                <tr className="border-b border-[rgb(var(--border))]">
                  <th className="px-4 py-3 text-left font-semibold">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold">Endereço</th>
                  <th className="px-4 py-3 text-left font-semibold">Admin Root</th>
                  <th className="px-4 py-3 text-left font-semibold">Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={cx(
                      "border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--panel))]",
                      idx % 2 === 1 && "bg-[rgba(255,255,255,0.01)]"
                    )}
                  >
                    <td className="px-4 py-3 font-semibold text-[rgb(var(--text))]">{r.name}</td>
                    <td className="px-4 py-3 text-[rgb(var(--muted))]">{r.address || "—"}</td>
                    <td className="px-4 py-3 text-[rgb(var(--muted))]">{r.admin_root_user_id || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-1.5 text-sm hover:bg-[rgb(var(--panel))]"
                          onClick={() => nav(`/settings/root/business-units/${r.id}/edit`)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-1.5 text-sm hover:bg-[rgb(var(--panel))]"
                          onClick={() => setDel({ open: true, id: r.id, name: r.name })}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-[rgb(var(--muted))]">
            <div>{filtered.length} tenant(s)</div>
            <div className="font-mono opacity-80">GET /api/root/tenants</div>
          </div>
        </div>
      )}

      {del.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDel({ open: false, id: "", name: "" })} />
          <div className="relative w-full max-w-lg rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-6">
            <div className="text-lg font-semibold">Excluir Tenant</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">
              Você está prestes a excluir <span className="font-semibold text-[rgb(var(--text))]">{del.name}</span>.
            </div>
            <div className="mt-3 text-sm text-[rgb(var(--muted))]">
              Por segurança, a exclusão é bloqueada se existirem dados associados ao tenant.
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm hover:bg-[rgb(var(--panel-2))]"
                onClick={() => setDel({ open: false, id: "", name: "" })}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-2 text-sm font-semibold hover:opacity-90"
                onClick={() => void onConfirmDelete()}
              >
                Confirmar exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
