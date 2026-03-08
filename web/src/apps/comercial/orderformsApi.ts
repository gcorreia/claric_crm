import { apiFetch } from "../../lib/apiClient";

const ORDER_FORM_COLLECTION_PATHS = [
  "/crm/order-forms",
  "/comercial/order-forms",
  "/crm/order-form",
  "/comercial/order-form",
];

function isNotFoundError(e: unknown): boolean {
  const msg = String((e as any)?.message || e || "").trim();
  return /^not found$/i.test(msg) || /http 404/i.test(msg) || /404 not found/i.test(msg);
}

async function withOrderFormPathFallback<T>(fn: (path: string) => Promise<T>): Promise<T> {
  let lastNotFound: unknown = null;
  for (const path of ORDER_FORM_COLLECTION_PATHS) {
    try {
      return await fn(path);
    } catch (e) {
      if (!isNotFoundError(e)) throw e;
      lastNotFound = e;
    }
  }
  throw lastNotFound || new Error("Not Found");
}

export async function listOrderFormsWithFallback<T = any>(): Promise<T> {
  return withOrderFormPathFallback((path) => apiFetch<T>(path));
}

export async function createOrderFormWithFallback<T = any>(payload: unknown): Promise<T> {
  return withOrderFormPathFallback((path) =>
    apiFetch<T>(path, {
      method: "POST",
      csrf: true,
      body: payload,
    }),
  );
}

export async function getOrderFormWithFallback<T = any>(id: string): Promise<T> {
  const encoded = encodeURIComponent(id);
  return withOrderFormPathFallback((path) => apiFetch<T>(`${path}/${encoded}`));
}

export async function patchOrderFormWithFallback<T = any>(id: string, payload: unknown): Promise<T> {
  const encoded = encodeURIComponent(id);
  return withOrderFormPathFallback((path) =>
    apiFetch<T>(`${path}/${encoded}`, {
      method: "PATCH",
      csrf: true,
      body: payload,
    }),
  );
}

