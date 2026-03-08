// FILE: crm/web/src/settings/pages/RolesListPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";
import { DataTable, type DataTableColumn } from "../../ui/DataTable";

type RoleRow = {
  id: string;
  key: string;
  name: string;
  kind: string;
  is_locked: boolean;
};

function isAbortError(e: unknown) {
  const anyE = e as any;
  return (
    anyE?.name === "AbortError" ||
    String(anyE?.message ?? "").toLowerCase().includes("signal is aborted")
  );
}

function defaultSearch(row: RoleRow, needle: string) {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (
    row.name.toLowerCase().includes(n) ||
    row.key.toLowerCase().includes(n) ||
    row.kind.toLowerCase().includes(n) ||
    String(row.id).toLowerCase().includes(n)
  );
}

export function RolesListPage() {
  const nav = useNavigate();

  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiFetch<RoleRow[]>("/roles", { signal: ctrl.signal });
        setRows(data);
      } catch (e: any) {
        if (isAbortError(e)) return;
        const msg = (e as ApiError)?.message ?? "Falha ao carregar perfis";
        setErr(msg);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => ctrl.abort();
  }, []);

  const columns: Array<DataTableColumn<RoleRow>> = useMemo(
    () => [
      {
        key: "name",
        header: "Nome",
        sortable: true,
        render: (r) => (
          <div className="grid">
            <button
              type="button"
              className="text-left font-medium hover:underline"
              onClick={() => nav(`/settings/admin/roles/${r.id}`)}
            >
              {r.name}
            </button>
            <div className="text-xs text-[rgb(var(--muted))]">
              <span className="font-mono">{r.key}</span> • {r.kind}
            </div>
          </div>
        ),
        sortValue: (r) => r.name,
      },
      {
        key: "key",
        header: "Chave",
        sortable: true,
        render: (r) => <span className="font-mono text-xs">{r.key}</span>,
        sortValue: (r) => r.key,
      },
      {
        key: "kind",
        header: "Tipo",
        sortable: true,
        render: (r) => r.kind,
        sortValue: (r) => r.kind,
      },
      {
        key: "is_locked",
        header: "Status",
        sortable: true,
        render: (r) => <span className="chip">{r.is_locked ? "Bloqueado" : "Editável"}</span>,
        sortValue: (r) => (r.is_locked ? 0 : 1),
      },
    ],
    [nav],
  );

  if (loading) {
    return (
      <div className="grid gap-4">
        <div className="panel rounded-2xl p-6">
          <div className="text-lg font-semibold">Perfis</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {err && (
        <div className="panel rounded-2xl p-6">
          <div className="text-lg font-semibold">Perfis</div>
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        </div>
      )}

      <DataTable<RoleRow>
        title="Perfis"
        subtitle="Administração • Perfis e permissões"
        primaryAction={{ label: "Novo perfil", onClick: () => nav("/settings/admin/roles/new") }}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Buscar por nome, chave, tipo ou ID..."
        searchValue={q}
        onSearchChange={setQ}
        searchFn={defaultSearch}
        showSelection={false}
      />
    </div>
  );
}

// ✅ mantém compatibilidade caso algum lugar use default import
export default RolesListPage;
