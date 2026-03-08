// crm/web/src/lib/apiClient.ts
export type ApiFetchOptions = {
  method?: string;
  body?: unknown;
  csrf?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const API_BASE = "/api";

let cachedCsrf: string | null = null;

/**
 * Compatibility shim for existing code (AuthContext) that sets the CSRF token manually.
 * Pass null to clear.
 */
export function setCsrfToken(token: string | null) {
  cachedCsrf = token && token.trim() ? token.trim() : null;
}

export function clearCsrfCache() {
  cachedCsrf = null;
}

async function readJsonSafely(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function getCsrfToken(): Promise<string> {
  if (cachedCsrf) return cachedCsrf;

  // 1) Preferred: /api/auth/csrf
  {
    const res = await fetch(`${API_BASE}/auth/csrf`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const json = await readJsonSafely(res);
      const token = json?.csrf_token;
      if (typeof token === "string" && token.length > 0) {
        cachedCsrf = token;
        return token;
      }
    }
  }

  // 2) Fallback: /api/auth/me returning csrf_token (if your backend provides it)
  {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const json = await readJsonSafely(res);
      const token = json?.csrf_token ?? json?.session?.csrf_token;
      if (typeof token === "string" && token.length > 0) {
        cachedCsrf = token;
        return token;
      }
    }
  }

  throw new Error("Não foi possível obter CSRF token.");
}

export async function apiFetch<T = any>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const url = path.startsWith("/api") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers ?? {}),
  };

  if (opts.csrf && method !== "GET") {
    const token = await getCsrfToken();
    headers["X-CSRF-Token"] = token;
  }

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    const json = await readJsonSafely(res);
    const detail = json?.detail ?? json?.message ?? json?.raw ?? `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
