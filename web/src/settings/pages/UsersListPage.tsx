import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";
import { useAuth } from "../../auth/AuthContext";
import { DataTable, type DataTableColumn } from "../../ui/DataTable";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string; // ISO
  last_login_at: string | null; // ISO | null
  profile?: { id: string; key: string; name: string; kind: string; is_locked: boolean } | null;
};

function isAbortError(e: unknown) {
  const anyE = e as any;
  return (
    anyE?.name === "AbortError" ||
    String(anyE?.message ?? "").toLowerCase().includes("signal is aborted")
  );
}

function defaultSearch(row: UserRow, needle: string) {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (
    (row.name ?? "").toLowerCase().includes(n) ||
    row.email.toLowerCase().includes(n) ||
    String(row.id).toLowerCase().includes(n) ||
    (row.profile?.name ?? "").toLowerCase().includes(n) ||
    (row.profile?.key ?? "").toLowerCase().includes(n)
  );
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export function UsersListPage() {
  const nav = useNavigate();
  const { user: me } = useAuth();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiFetch<UserRow[]>("/users", { signal: ctrl.signal });
        setRows(data);
      } catch (e: any) {
        if (isAbortError(e)) return;
        const msg = (e as ApiError)?.message ?? "Falha ao carregar usuários";
        setErr(msg);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => ctrl.abort();
  }, []);

  const columns: Array<DataTableColumn<UserRow>> = useMemo(
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
              onClick={() => nav(`/settings/admin/users/${r.id}`)}
            >
              {r.name ?? "—"}
            </button>
            <div className="text-xs text-[rgb(var(--muted))]">{r.email}</div>
            {r.profile?.name ? (
              <div className="text-xs text-[rgb(var(--muted))]">Perfil: {r.profile.name}</div>
            ) : null}
          </div>
        ),
        sortValue: (r) => r.name ?? "",
      },
      {
        key: "email",
        header: "Username (Email)",
        sortable: true,
        render: (r) => r.email,
        sortValue: (r) => r.email,
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (r) => <span className="chip">{r.is_active ? "Ativo" : "Inativo"}</span>,
        sortValue: (r) => (r.is_active ? 1 : 0),
      },
      {
        key: "last_login_at",
        header: "Último login / Sessão",
        sortable: true,
        render: (r) => {
          const isSelf = !!me && me.id === r.id;
          if (isSelf && r.is_active) return <span className="chip">Sessão ativa</span>;
          return fmt(r.last_login_at);
        },
        sortValue: (r) => r.last_login_at ?? "",
      },
    ],
    [nav, me],
  );

  if (loading) {
    return (
      <div className="grid gap-4">
        <div className="panel rounded-2xl p-6">
          <div className="text-lg font-semibold">Usuários</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {err && (
        <div className="panel rounded-2xl p-6">
          <div className="text-lg font-semibold">Usuários</div>
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        </div>
      )}

      <DataTable<UserRow>
        title="Usuários"
        subtitle="Administração • Lista de usuários"
        primaryAction={{ label: "Novo usuário", onClick: () => nav("/settings/admin/users/new") }}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Buscar por nome, email ou ID..."
        searchValue={q}
        onSearchChange={setQ}
        searchFn={defaultSearch}
        showSelection={false}
      />
    </div>
  );
}

export default UsersListPage;