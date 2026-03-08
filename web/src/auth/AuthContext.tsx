import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, setCsrfToken } from "../lib/apiClient";

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  is_active: boolean;
  is_root?: boolean;
};

export type AuthBusinessUnit = { id: string; name: string; address?: string | null };

type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  csrfToken: string | null;
  businessUnits: AuthBusinessUnit[];
  activeBu: AuthBusinessUnit | null;
  activeBuRole: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refreshCsrf(): Promise<void>;
  refreshMe(): Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider />");
  return ctx;
}

type MeResponse = {
  user: AuthUser;
  business_units: AuthBusinessUnit[];
  active_bu: AuthBusinessUnit | null;
  active_bu_role: string | null;
};

type LoginResponse = {
  user: AuthUser;
  csrf_token: string;
  business_units: AuthBusinessUnit[];
  active_bu: AuthBusinessUnit;
  active_bu_role: string | null;
};

function dispatchBu(detail: { business_units?: AuthBusinessUnit[]; active_bu?: AuthBusinessUnit | null }) {
  window.dispatchEvent(new CustomEvent("claric:bu", { detail }));
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let t: any;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error("Timeout ao inicializar sessão")), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csrfToken, setCsrf] = useState<string | null>(null);
  const [businessUnits, setBusinessUnits] = useState<AuthBusinessUnit[]>([]);
  const [activeBu, setActiveBu] = useState<AuthBusinessUnit | null>(null);
  const [activeBuRole, setActiveBuRole] = useState<string | null>(null);

  async function refreshMe() {
    const me = await apiFetch<MeResponse>("/auth/me");
    setUser(me.user);
    setBusinessUnits(me.business_units ?? []);
    setActiveBu(me.active_bu ?? null);
    setActiveBuRole(me.active_bu_role ?? null);

    dispatchBu({
      business_units: me.business_units ?? [],
      active_bu: me.active_bu ?? null,
    });

    try {
      await refreshCsrf();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await withTimeout(() => refreshMe(), 4000);
      } catch {
        if (!mounted) return;
        setUser(null);
        setBusinessUnits([]);
        setActiveBu(null);
        setActiveBuRole(null);
        dispatchBu({ business_units: [], active_bu: null });
      } finally {
        if (!mounted) return;
        setReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });

    setUser(res.user);
    setCsrf(res.csrf_token);
    setBusinessUnits(res.business_units ?? []);
    setActiveBu(res.active_bu ?? null);
    setActiveBuRole(res.active_bu_role ?? null);
    setCsrfToken(res.csrf_token);

    dispatchBu({
      business_units: res.business_units ?? [],
      active_bu: res.active_bu ?? null,
    });
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setCsrf(null);
    setBusinessUnits([]);
    setActiveBu(null);
    setActiveBuRole(null);
    setCsrfToken(null);

    dispatchBu({ business_units: [], active_bu: null });
  }

  async function refreshCsrf() {
    const res = await apiFetch<{ csrf_token: string }>("/auth/csrf");
    setCsrf(res.csrf_token);
    setCsrfToken(res.csrf_token);
  }

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      csrfToken,
      businessUnits,
      activeBu,
      activeBuRole,
      login,
      logout,
      refreshCsrf,
      refreshMe,
    }),
    [ready, user, csrfToken, businessUnits, activeBu, activeBuRole],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}