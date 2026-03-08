// FILE: crm/web/src/settings/pages/UserDetailPage.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";
import { isValidObjectId } from "../../lib/objectId";

type UserDetail = {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
  profile?: { id: string; key: string; name: string; kind: string; is_locked: boolean } | null;
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function isAbortError(e: unknown) {
  const anyE = e as any;
  return anyE?.name === "AbortError" || String(anyE?.message ?? "").toLowerCase().includes("aborted");
}

export function UserDetailPage() {
  const nav = useNavigate();
  const { id } = useParams();

  const userId = (id ?? "").trim();
  const [row, setRow] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !isValidObjectId(userId)) {
      setErr("ID inválido.");
      return;
    }

    const ctrl = new AbortController();

    (async () => {
      try {
        const data = await apiFetch<UserDetail>(`/users/${userId}`, { signal: ctrl.signal });
        setRow(data);
      } catch (e: any) {
        if (isAbortError(e)) return;
        const msg = (e as ApiError)?.message ?? "Falha ao carregar usuário";
        setErr(msg);
      }
    })();

    return () => ctrl.abort();
  }, [userId]);

  if (err) {
    return (
      <div className="space-y-4">
        <div className="panel rounded-2xl p-6">
          <div className="text-lg font-semibold">Usuário</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">Detalhes</div>
        </div>

        <div className="panel rounded-2xl p-4 text-sm text-red-400">{err}</div>

        <button className="btn" onClick={() => nav("/settings/admin/users")}>
          Voltar
        </button>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <div className="panel rounded-2xl p-6">
          <div className="text-lg font-semibold">Usuário</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">{row.name ?? "Admin"}</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">{row.email}</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">Perfil: {row.profile?.name ?? "—"}</div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => nav(`/settings/admin/users/${row.id}/edit`)}>
              Editar
            </button>
            <button className="btn" onClick={() => nav("/settings/admin/users")}>
              Voltar
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Status</span>
            <span className="chip w-fit">{row.is_active ? "Ativo" : "Inativo"}</span>
          </div>

          <div className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Último login</span>
            <span>{fmt(row.last_login_at)}</span>
          </div>

          <div className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Criado em</span>
            <span>{fmt(row.created_at)}</span>
          </div>

          <div className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Atualizado em</span>
            <span>{fmt(row.updated_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserDetailPage;
