import { apiFetch } from "../../lib/apiClient";

const QUOTE_COLLECTION_PATHS = ["/crm/quotes", "/comercial/quotes", "/crm/quote", "/comercial/quote"];

function isNotFoundError(e: unknown): boolean {
  const msg = String((e as any)?.message || e || "").trim();
  return /^not found$/i.test(msg) || /http 404/i.test(msg) || /404 not found/i.test(msg);
}

async function withQuotePathFallback<T>(fn: (path: string) => Promise<T>): Promise<T> {
  let lastNotFound: unknown = null;
  for (const path of QUOTE_COLLECTION_PATHS) {
    try {
      return await fn(path);
    } catch (e) {
      if (!isNotFoundError(e)) throw e;
      lastNotFound = e;
    }
  }
  throw lastNotFound || new Error("Not Found");
}

export async function listQuotesWithFallback<T = any>(): Promise<T> {
  return withQuotePathFallback((path) => apiFetch<T>(path));
}

export async function createQuoteWithFallback<T = any>(payload: unknown): Promise<T> {
  return withQuotePathFallback((path) =>
    apiFetch<T>(path, {
      method: "POST",
      csrf: true,
      body: payload,
    }),
  );
}

export async function getQuoteWithFallback<T = any>(id: string): Promise<T> {
  const encoded = encodeURIComponent(id);
  return withQuotePathFallback((path) => apiFetch<T>(`${path}/${encoded}`));
}

export async function patchQuoteWithFallback<T = any>(id: string, payload: unknown): Promise<T> {
  const encoded = encodeURIComponent(id);
  return withQuotePathFallback((path) =>
    apiFetch<T>(`${path}/${encoded}`, {
      method: "PATCH",
      csrf: true,
      body: payload,
    }),
  );
}

export async function listQuoteItemsWithFallback<T = any>(quoteId: string): Promise<T> {
  const encoded = encodeURIComponent(quoteId);
  return withQuotePathFallback((path) => apiFetch<T>(`${path}/${encoded}/items`));
}

export async function createQuoteItemWithFallback<T = any>(quoteId: string, payload: unknown): Promise<T> {
  const encoded = encodeURIComponent(quoteId);
  return withQuotePathFallback((path) =>
    apiFetch<T>(`${path}/${encoded}/items`, {
      method: "POST",
      csrf: true,
      body: payload,
    }),
  );
}

export async function patchQuoteItemWithFallback<T = any>(quoteId: string, itemId: string, payload: unknown): Promise<T> {
  const encodedQuote = encodeURIComponent(quoteId);
  const encodedItem = encodeURIComponent(itemId);
  return withQuotePathFallback((path) =>
    apiFetch<T>(`${path}/${encodedQuote}/items/${encodedItem}`, {
      method: "PATCH",
      csrf: true,
      body: payload,
    }),
  );
}

export async function deleteQuoteItemWithFallback(quoteId: string, itemId: string): Promise<void> {
  const encodedQuote = encodeURIComponent(quoteId);
  const encodedItem = encodeURIComponent(itemId);
  await withQuotePathFallback((path) =>
    apiFetch<void>(`${path}/${encodedQuote}/items/${encodedItem}`, {
      method: "DELETE",
      csrf: true,
    }),
  );
}

export async function convertQuoteToOrderFormWithFallback<T = any>(quoteId: string): Promise<T> {
  const encoded = encodeURIComponent(quoteId);
  return withQuotePathFallback((path) =>
    apiFetch<T>(`${path}/${encoded}/convert-to-order-form`, {
      method: "POST",
      csrf: true,
    }),
  );
}
