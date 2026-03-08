import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as any;

  const [email, setEmail] = useState("admin@claric.com");
  const [password, setPassword] = useState("Nimbus#12345");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextPath = useMemo(() => loc?.state?.from ?? "/apps", [loc]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      nav(nextPath, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">Use suas credenciais para acessar o Nimbus.</p>

        {err && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Email</span>
            <input
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Senha</span>
            <input
              type="password"
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button
            className="mt-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
