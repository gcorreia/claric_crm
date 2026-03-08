// FILE: crm/web/src/settings/pages/UserEditPage.tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";
import { useAuth } from "../../auth/AuthContext";

type UserDetail = {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile?: { id: string; key: string; name: string; kind: string; is_locked: boolean } | null;
};

type RoleOption = { id: string; name: string; key: string; kind: string; is_locked: boolean };

type UpdateUserPayload = {
  first_name: string;
  last_name: string;
  is_active: boolean;
  password?: string | null;
};

function splitName(full: string | null) {
  const raw = (full ?? "").trim();
  if (!raw) return { first: "", last: "" };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function isAbortError(e: unknown) {
  const anyE = e as any;
  return anyE?.name === "AbortError" || String(anyE?.message ?? "").toLowerCase().includes("aborted");
}

export function UserEditPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const userId = (id ?? "").trim();

  const { user: me, activeBuRole } = useAuth();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const canChangeProfile = !!me && (me.is_root || activeBuRole === "BU_ADMIN_ROOT");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [profileId, setProfileId] = useState<string>("");

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const fullName = useMemo(() => `${firstName} ${lastName}`.trim(), [firstName, lastName]);

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      setErr(null);
      try {
        const u = await apiFetch<UserDetail>(`/users/${userId}`, { signal: ctrl.signal });
        setUser(u);

        const { first, last } = splitName(u.name);
        setFirstName(first);
        setLastName(last);
        setIsActive(!!u.is_active);

        setProfileId(u.profile?.id ?? "");

        if (canChangeProfile) {
          const rs = await apiFetch<RoleOption[]>("/roles", { signal: ctrl.signal });
          setRoles(rs);
        }
      } catch (e: any) {
        if (isAbortError(e)) return;
        const msg = (e as ApiError)?.message ?? "Falha ao carregar usuário";
        setErr(msg);
      }
    })();

    return () => ctrl.abort();
  }, [userId, canChangeProfile]);

  async function onUpdateProfile(nextProfileId: string) {
    if (!canChangeProfile) return;
    if (!nextProfileId) return;

    await apiFetch(`/users/${userId}/profile`, {
      method: "PATCH",
      csrf: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: nextProfileId }),
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setErr(null);

    try {
      const payload: UpdateUserPayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        is_active: isActive,
      };

      if (password) payload.password = password;
      await apiFetch(`/users/${userId}`, {
        method: "PUT",
        csrf: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (canChangeProfile && profileId && profileId !== (user.profile?.id ?? "")) {
        await onUpdateProfile(profileId);
      }

      nav(`/settings/admin/users/${userId}`, { replace: true });
    } catch (e: any) {
      const msg = (e as ApiError)?.message ?? "Falha ao salvar usuário";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
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
            <div className="text-2xl font-semibold">{fullName || "Usuário"}</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">{user.email}</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">Perfil: {user.profile?.name ?? "—"}</div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary" form="user-edit-form" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button className="btn" type="button" onClick={() => nav(`/settings/admin/users/${userId}`)}>
              Voltar
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>

      <form id="user-edit-form" className="panel rounded-2xl p-6 grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Nome</span>
            <input
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Sobrenome</span>
            <input
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Email</span>
            <input
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none opacity-70"
              value={user.email}
              readOnly
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Status</span>
            <select
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={isActive ? "active" : "inactive"}
              onChange={(e) => setIsActive(e.target.value === "active")}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
        </div>

        <div className="grid gap-1 text-sm">
          <span className="text-[rgb(var(--muted))]">Perfil</span>
          {canChangeProfile ? (
            <select
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              <option value="" disabled>
                Selecione...
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none opacity-70"
              value={user.profile?.name ?? "—"}
              readOnly
            />
          )}
          {!canChangeProfile ? (
            <div className="text-xs text-[rgb(var(--muted))]">Somente Admin pode alterar o perfil.</div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Nova senha (opcional)</span>
            <input
              type="password"
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Confirmar nova senha</span>
            <input
              type="password"
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>

        {password && password !== password2 ? (
          <div className="text-sm text-red-400">As senhas não coincidem.</div>
        ) : null}
      </form>
    </div>
  );
}

export default UserEditPage;
