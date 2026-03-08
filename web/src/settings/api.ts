/**
 * Minimal API client for Settings pages.
 * Why: keep fetch/error handling consistent across pages.
 */
export const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  payload: any;

  constructor(status: number, message: string, payload: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const msg =
      (payload && (payload.detail || payload.message || payload.error)) ||
      (typeof payload === "string" && payload) ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, payload);
  }

  return payload as T;
}
