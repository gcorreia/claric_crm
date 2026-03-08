// FILE: crm/web/src/settings/pages/UserNewPage.tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";
import { useAuth } from "../../auth/AuthContext";

type CreateUserPayload = {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  is_active: boolean;
  profile_id?: string | null;
};

type RoleOption = { id: string; name: string; key: string; kind: string; is_locked: boolean };

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function randInt(maxExclusive: number) {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function generateTempPassword(length = 14) {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*?";

  const pools = [lower, upper, digits, symbols];
  const all = pools.join("");

  const chars: string[] = [];
  // guarantee at least one from each pool
  for (const p of pools) chars.push(p[randInt(p.length)]);
  while (chars.length < length) chars.push(all[randInt(all.length)]);

  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function UserNewPage() {
  const nav = useNavigate();
  const { user: me, activeBuRole } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const username = useMemo(() => email.trim().toLowerCase(), [email]);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [isActive, setIsActive] = useState(true);

  const canChangeProfile = !!me && (me.is_root || activeBuRole === "BU_ADMIN_ROOT");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [profileId, setProfileId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    if (!canChangeProfile) return () => { alive = false; };
    (async () => {
      try {
        const rs = await apiFetch<RoleOption[]>("/roles");
        if (!alive) return;
        setRoles(rs);
        const ceo = rs.find((r) => r.key === "ceo") ?? rs.find((r) => r.name.toLowerCase() === "ceo");
        if (ceo) setProfileId(String(ceo.id));
      } catch {
        // ignore (backend defaults to CEO)
      }
    })();
    return () => { alive = false; };
  }, [canChangeProfile]);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate() {
    if (!firstName.trim()) return "Informe o nome.";
    if (!lastName.trim()) return "Informe o sobrenome.";
    if (!isEmail(username)) return "Email inválido.";
    if (!password) return "Informe a senha.";
    if (password.length < 8) return "Senha deve ter no mínimo 8 caracteres.";
    if (password !== password2) return "Senhas não coincidem.";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    const v = validate();
    if (v) {
      setErr(v);
      return;
    }

    const payload: CreateUserPayload = {
      email: username,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      password,
      is_active: isActive,
      ...(canChangeProfile && profileId ? { profile_id: profileId } : {}),
    };

    setLoading(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        csrf: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setOk("Usuário criado com sucesso.");
      nav("/settings/admin/users", { replace: true });
    } catch (e: any) {
      const msg = (e as ApiError)?.message ?? "Falha ao criar usuário";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onGeneratePassword() {
    const p = generateTempPassword();
    setPassword(p);
    setPassword2(p);
  }

  async function onCopyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setOk("Senha copiada.");
    } catch {
      setErr("Não foi possível copiar a senha.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Novo usuário</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">Administração • Criar usuário</div>
          </div>

          <div className="flex gap-2">
            <button className="btn" type="button" onClick={() => nav("/settings/admin/users")}>
              Voltar
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
        {ok && (
          <div className="mt-4 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
            {ok}
          </div>
        )}
      </div>

      <div className="panel rounded-2xl p-6">
        <form className="grid gap-4" onSubmit={onSubmit}>
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
              <span className="text-[rgb(var(--muted))]">Email (username)</span>
              <input
                className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
              <span className="text-xs text-[rgb(var(--muted))]">Username: {username || "—"}</span>
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
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
                  value="CEO"
                  readOnly
                />
              )}
              {!canChangeProfile ? (
                <span className="text-xs text-[rgb(var(--muted))]">Padrão: CEO (somente Admin pode alterar).</span>
              ) : (
                <span className="text-xs text-[rgb(var(--muted))]">Padrão: CEO.</span>
              )}
            </label>
            <div />
          </div>

          <div className="panel rounded-2xl p-4">
            <div className="text-sm font-medium">Senha</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">
              Dica: gere uma senha temporária e envie ao usuário.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-[rgba(255,255,255,0.04)]"
                onClick={onGeneratePassword}
              >
                Gerar senha temporária
              </button>
              <button
                type="button"
                className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-60"
                onClick={onCopyPassword}
                disabled={!password}
              >
                Copiar senha
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-[rgb(var(--muted))]">Senha</span>
              <input
                type="password"
                className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-[rgb(var(--muted))]">Confirmar senha</span>
              <input
                type="password"
                className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Salvando..." : "Criar usuário"}
            </button>

            <button
              type="button"
              className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-[rgba(255,255,255,0.04)]"
              onClick={() => nav("/settings/admin/users")}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UserNewPage;
