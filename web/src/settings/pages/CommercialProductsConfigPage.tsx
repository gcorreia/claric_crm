import { useEffect, useMemo, useState } from "react";
import { apiFetch, type ApiError } from "../../lib/apiClient";

type ProductsSection = "catalogo" | "lista-precos" | "all";

type CommercialProductsConfigPageProps = {
  section?: ProductsSection;
};

type ProductOut = {
  id: string;
  name: string;
  product_code?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type PriceListOut = {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type PriceListItemOut = {
  id: string;
  price_list_id: string;
  product_id: string;
  product_name?: string | null;
  unit_price: number;
  currency: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type PriceDraft = {
  unit_price: string;
  currency: string;
};

function isAbortError(e: unknown): boolean {
  const err = e as any;
  return err?.name === "AbortError" || String(err?.message || "").includes("signal is aborted");
}

function extractApiErrorMessage(e: unknown): string {
  const ae = e as ApiError & { detail?: any };
  if (typeof ae?.detail === "string") return ae.detail;
  if (ae?.detail?.message) return String(ae.detail.message);
  return String(ae?.message || "Erro inesperado");
}

export function CommercialProductsConfigPage(props: CommercialProductsConfigPageProps = {}) {
  const { section = "all" } = props;

  const [products, setProducts] = useState<ProductOut[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListOut[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState("");
  const [priceListItems, setPriceListItems] = useState<PriceListItemOut[]>([]);
  const [draftsByProduct, setDraftsByProduct] = useState<Record<string, PriceDraft>>({});

  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productDescription, setProductDescription] = useState("");

  const [newPriceListName, setNewPriceListName] = useState("");

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const selectedPriceList = useMemo(
    () => priceLists.find((pl) => pl.id === selectedPriceListId) ?? null,
    [priceLists, selectedPriceListId]
  );

  function makeDrafts(rows: PriceListItemOut[], productRows: ProductOut[]): Record<string, PriceDraft> {
    const byProduct = new Map(rows.map((r) => [r.product_id, r]));
    const out: Record<string, PriceDraft> = {};
    for (const p of productRows) {
      const found = byProduct.get(p.id);
      out[p.id] = {
        unit_price: found ? String(Number(found.unit_price ?? 0)) : "0",
        currency: (found?.currency || "BRL").toUpperCase(),
      };
    }
    return out;
  }

  async function loadBase(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    try {
      const [pRows, listRows] = await Promise.all([
        apiFetch<ProductOut[]>("/crm/products?include_inactive=true", { signal }),
        apiFetch<PriceListOut[]>("/crm/price-lists?include_inactive=true", { signal }),
      ]);
      const safeProducts = Array.isArray(pRows) ? pRows : [];
      const safeLists = Array.isArray(listRows) ? listRows : [];
      setProducts(safeProducts);
      setPriceLists(safeLists);

      setSelectedPriceListId((prev) => {
        if (prev && safeLists.some((x) => x.id === prev)) return prev;
        const firstActive = safeLists.find((x) => x.is_active);
        return firstActive?.id ?? safeLists[0]?.id ?? "";
      });
    } catch (e) {
      if (isAbortError(e)) return;
      setErr(extractApiErrorMessage(e));
      setProducts([]);
      setPriceLists([]);
      setSelectedPriceListId("");
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(priceListId: string, signal?: AbortSignal) {
    if (!priceListId) {
      setPriceListItems([]);
      setDraftsByProduct(makeDrafts([], products));
      return;
    }

    setLoadingItems(true);
    setErr(null);
    try {
      const rows = await apiFetch<PriceListItemOut[]>(`/crm/price-lists/${encodeURIComponent(priceListId)}/items`, { signal });
      const safeRows = Array.isArray(rows) ? rows : [];
      setPriceListItems(safeRows);
      setDraftsByProduct(makeDrafts(safeRows, products));
    } catch (e) {
      if (isAbortError(e)) return;
      setErr(extractApiErrorMessage(e));
      setPriceListItems([]);
      setDraftsByProduct(makeDrafts([], products));
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void loadBase(ac.signal);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    setDraftsByProduct((prev) => {
      const next = { ...prev };
      for (const p of products) {
        if (!next[p.id]) next[p.id] = { unit_price: "0", currency: "BRL" };
      }
      return next;
    });
  }, [products]);

  useEffect(() => {
    const ac = new AbortController();
    void loadItems(selectedPriceListId, ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPriceListId]);

  async function createProduct() {
    if (saving) return;
    const name = productName.trim();
    if (!name) return;

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<ProductOut>("/crm/products", {
        method: "POST",
        csrf: true,
        body: {
          name,
          product_code: productCode.trim() || null,
          description: productDescription.trim() || null,
        },
      });
      setProductName("");
      setProductCode("");
      setProductDescription("");
      await loadBase();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleProductActive(row: ProductOut) {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch<ProductOut>(`/crm/products/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        csrf: true,
        body: { is_active: !row.is_active },
      });
      await loadBase();
      if (selectedPriceListId) await loadItems(selectedPriceListId);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function createPriceList() {
    if (saving) return;
    const name = newPriceListName.trim();
    if (!name) return;

    setSaving(true);
    setErr(null);
    try {
      const created = await apiFetch<PriceListOut>("/crm/price-lists", {
        method: "POST",
        csrf: true,
        body: { name },
      });
      setNewPriceListName("");
      await loadBase();
      if (created?.id) setSelectedPriceListId(created.id);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function togglePriceListActive(row: PriceListOut) {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch<PriceListOut>(`/crm/price-lists/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        csrf: true,
        body: { is_active: !row.is_active },
      });
      await loadBase();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function setDraft(productId: string, patch: Partial<PriceDraft>) {
    setDraftsByProduct((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? { unit_price: "0", currency: "BRL" }), ...patch },
    }));
  }

  async function savePriceForProduct(productId: string) {
    if (saving || !selectedPriceListId) return;
    const draft = draftsByProduct[productId] ?? { unit_price: "0", currency: "BRL" };
    const unitPrice = Number(draft.unit_price);
    const currency = (draft.currency || "BRL").trim().toUpperCase();

    if (!Number.isFinite(unitPrice)) {
      setErr("Informe um preço numérico válido.");
      return;
    }
    if (currency.length !== 3) {
      setErr("Moeda deve ter 3 letras (ex.: BRL).");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<PriceListItemOut>(`/crm/price-lists/${encodeURIComponent(selectedPriceListId)}/items`, {
        method: "POST",
        csrf: true,
        body: {
          product_id: productId,
          unit_price: unitPrice,
          currency,
        },
      });
      await loadItems(selectedPriceListId);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const showCatalog = section === "all" || section === "catalogo";
  const showPriceLists = section === "all" || section === "lista-precos";

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="text-lg font-semibold">Comercial - Produtos</div>
        <div className="mt-1 text-sm text-[rgb(var(--muted))]">
          Catálogo de produtos e listas de preços com valores por produto em cada lista.
        </div>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {showCatalog && (
        <div className="panel rounded-2xl p-6">
          <div className="text-sm font-semibold">Catálogo de Produtos</div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-sm text-[rgb(var(--muted))]">Nome do produto</label>
              <input
                className="input mt-1 w-full"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Ex.: CRM Enterprise"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-sm text-[rgb(var(--muted))]">Código</label>
              <input
                className="input mt-1 w-full"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="Ex.: CRM-ENT"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-sm text-[rgb(var(--muted))]">Descrição</label>
              <input
                className="input mt-1 w-full"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Resumo do produto"
                disabled={saving}
              />
            </div>
          </div>

          <div className="mt-3">
            <button className="btn btn-primary" onClick={() => void createProduct()} disabled={saving || !productName.trim()}>
              {saving ? "Salvando..." : "Adicionar produto"}
            </button>
          </div>

          <div className="mt-4 max-h-[40vh] overflow-x-auto overflow-y-auto rounded-xl border border-[rgb(var(--border))]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[rgb(var(--panel))] text-left text-[rgb(var(--muted))]">
                <tr className="border-b border-[rgb(var(--border))]">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-[rgb(var(--border))]">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2">{p.product_code || "—"}</td>
                    <td className="px-3 py-2">{p.is_active ? "Ativo" : "Inativo"}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn btn-secondary" onClick={() => void toggleProductActive(p)} disabled={saving}>
                        {p.is_active ? "Inativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && !loading && (
                  <tr>
                    <td className="px-3 py-6 text-[rgb(var(--muted))]" colSpan={4}>
                      Nenhum produto cadastrado.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td className="px-3 py-6 text-[rgb(var(--muted))]" colSpan={4}>
                      Carregando...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPriceLists && (
        <div className="panel rounded-2xl p-6">
          <div className="text-sm font-semibold">Listas de Preços</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">
            Crie múltiplas listas e defina os preços dos produtos do catálogo para cada lista.
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <label className="text-sm text-[rgb(var(--muted))]">Nova lista</label>
              <input
                className="input mt-1 w-full"
                value={newPriceListName}
                onChange={(e) => setNewPriceListName(e.target.value)}
                placeholder="Ex.: Preço Público"
                disabled={saving}
              />
            </div>
            <button className="btn btn-primary" onClick={() => void createPriceList()} disabled={saving || !newPriceListName.trim()}>
              {saving ? "Salvando..." : "Adicionar lista"}
            </button>
          </div>

          <div className="mt-4 max-h-[28vh] overflow-x-auto overflow-y-auto rounded-xl border border-[rgb(var(--border))]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[rgb(var(--panel))] text-left text-[rgb(var(--muted))]">
                <tr className="border-b border-[rgb(var(--border))]">
                  <th className="px-3 py-2">Lista</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {priceLists.map((pl) => (
                  <tr key={pl.id} className="border-t border-[rgb(var(--border))]">
                    <td className="px-3 py-2 font-medium">{pl.name}</td>
                    <td className="px-3 py-2">{pl.is_active ? "Ativa" : "Inativa"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          className={selectedPriceListId === pl.id ? "btn btn-primary" : "btn btn-secondary"}
                          onClick={() => setSelectedPriceListId(pl.id)}
                        >
                          Selecionar
                        </button>
                        <button className="btn btn-secondary" onClick={() => void togglePriceListActive(pl)} disabled={saving}>
                          {pl.is_active ? "Inativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {priceLists.length === 0 && !loading && (
                  <tr>
                    <td className="px-3 py-6 text-[rgb(var(--muted))]" colSpan={3}>
                      Nenhuma lista de preços cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedPriceList ? (
            <div className="mt-4 rounded-xl border border-[rgb(var(--border))] p-4">
              <div className="text-sm font-semibold">Produtos da lista: {selectedPriceList.name}</div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                Itens com preço salvo nesta lista: {priceListItems.length}
              </div>

              <div className="mt-3 max-h-[40vh] overflow-x-auto overflow-y-auto rounded-xl border border-[rgb(var(--border))]">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[rgb(var(--panel))] text-left text-[rgb(var(--muted))]">
                    <tr className="border-b border-[rgb(var(--border))]">
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Preço</th>
                      <th className="px-3 py-2">Moeda</th>
                      <th className="px-3 py-2 text-right">Salvar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProducts.map((p) => {
                      const draft = draftsByProduct[p.id] ?? { unit_price: "0", currency: "BRL" };
                      return (
                        <tr key={p.id} className="border-t border-[rgb(var(--border))]">
                          <td className="px-3 py-2 font-medium">{p.name}</td>
                          <td className="px-3 py-2">
                            <input
                              className="input w-36"
                              type="number"
                              step="0.01"
                              value={draft.unit_price}
                              onChange={(e) => setDraft(p.id, { unit_price: e.target.value })}
                              disabled={saving}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input w-24 uppercase"
                              value={draft.currency}
                              onChange={(e) => setDraft(p.id, { currency: e.target.value.toUpperCase() })}
                              maxLength={3}
                              disabled={saving}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button className="btn btn-secondary" onClick={() => void savePriceForProduct(p.id)} disabled={saving}>
                              Salvar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {activeProducts.length === 0 && !loading && (
                      <tr>
                        <td className="px-3 py-6 text-[rgb(var(--muted))]" colSpan={4}>
                          Não há produtos ativos no catálogo.
                        </td>
                      </tr>
                    )}
                    {(loadingItems || loading) && (
                      <tr>
                        <td className="px-3 py-6 text-[rgb(var(--muted))]" colSpan={4}>
                          Carregando...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[rgb(var(--border))] p-4 text-sm text-[rgb(var(--muted))]">
              Selecione uma lista de preços para configurar os preços dos produtos.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
