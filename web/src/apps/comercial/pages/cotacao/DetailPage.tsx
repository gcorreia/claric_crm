import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { formatMoneyBRL, MoneyInput } from "../../components/MoneyInput";
import {
  createQuoteItemWithFallback,
  deleteQuoteItemWithFallback,
  getQuoteWithFallback,
  listQuoteItemsWithFallback,
  patchQuoteItemWithFallback,
  patchQuoteWithFallback,
} from "../../quotesApi";

type UserOut = {
  id: string;
  name?: string | null;
  email?: string | null;
  is_active?: boolean;
};

type OpportunityOut = {
  id: string;
  account_id: string | null;
  name: string;
  stage: string;
  amount: number;
  close_date: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
};

type ProductOut = {
  id: string;
  name: string;
  product_code?: string | null;
  is_active?: boolean;
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

type QuoteOut = {
  id: string;
  opportunity_id: string;
  account_id: string | null;
  name: string;
  status: string;
  valid_until: string | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  owner_id: string;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
};

type QuotePatch = {
  opportunity_id: string;
  name: string;
  status: string;
  valid_until: string | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  owner_id: string;
};

type QuoteItemOut = {
  id: string;
  quote_id: string;
  product_id: string | null;
  product_name?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  line_total: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type QuoteItemUpsert = {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
};

type QuoteItemEdit = {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
};

function userLabel(u: UserOut): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
}

function opportunityOptionLabel(o: OpportunityOut): string {
  return `${o.name} · ${o.id}`;
}

function formatMoney(v?: number | null): string {
  if (typeof v !== "number") return "—";
  return formatMoneyBRL(v);
}

function lineTotalFromValues(quantity: number, unitPrice: number, discountPercent: number, discountAmount: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const up = Number.isFinite(unitPrice) ? unitPrice : 0;
  const dp = Number.isFinite(discountPercent) ? discountPercent : 0;
  const da = Number.isFinite(discountAmount) ? discountAmount : 0;
  const gross = q * up;
  const percentDiscount = gross * (dp / 100);
  return Math.max(gross - percentDiscount - da, 0);
}

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

function extractApiErrorMessage(e: unknown): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (detail?.message) return String(detail.message);
  if (typeof detail === "string") return detail;
  return String(ae?.message || "Erro inesperado");
}

function buildItemEdit(item: QuoteItemOut): QuoteItemEdit {
  return {
    product_id: item.product_id || "",
    description: item.description || "",
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    discount_percent: Number(item.discount_percent || 0),
    discount_amount: Number(item.discount_amount || 0),
  };
}

const STATUS_OPTIONS = ["Draft", "In Review", "Approved", "Sent", "Accepted", "Rejected", "Expired"];

export function CotacaoDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const opportunityDatalistId = "quote-detail-opportunity-options";

  const [quote, setQuote] = useState<QuoteOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  const [opportunityId, setOpportunityId] = useState("");
  const [opportunityQuery, setOpportunityQuery] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Draft");
  const [validUntil, setValidUntil] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [finalAmount, setFinalAmount] = useState<number>(0);
  const [ownerId, setOwnerId] = useState("");

  const [users, setUsers] = useState<UserOut[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListOut[]>([]);

  const [items, setItems] = useState<QuoteItemOut[]>([]);
  const [itemEdits, setItemEdits] = useState<Record<string, QuoteItemEdit>>({});
  const [itemErr, setItemErr] = useState<string | null>(null);
  const [itemSavingId, setItemSavingId] = useState<string | null>(null);
  const [itemDeletingId, setItemDeletingId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);

  const [selectedPriceListId, setSelectedPriceListId] = useState("");
  const [selectedPriceListItems, setSelectedPriceListItems] = useState<PriceListItemOut[]>([]);
  const [priceListItemsLoading, setPriceListItemsLoading] = useState(false);
  const [createItemQuery, setCreateItemQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [createItemModalOpen, setCreateItemModalOpen] = useState(false);
  const [createItemErr, setCreateItemErr] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<QuotePatch | null>(null);

  const canSave = useMemo(() => !!opportunityId.trim() && !!name.trim() && !!ownerId.trim() && !saving && isEditing, [
    opportunityId,
    name,
    ownerId,
    saving,
    isEditing,
  ]);

  const opportunityLabelToId = useMemo(() => {
    const out = new Map<string, string>();
    for (const o of opportunities) out.set(opportunityOptionLabel(o), o.id);
    return out;
  }, [opportunities]);

  const selectedOpportunityName = useMemo(() => {
    const selected = opportunities.find((o) => o.id === opportunityId);
    if (selected) return selected.name;
    return opportunityId || "—";
  }, [opportunities, opportunityId]);

  const ownerSummary = useMemo(() => {
    if (!ownerId) return "—";
    const selected = users.find((u) => u.id === ownerId);
    if (selected) return userLabel(selected);
    return quote?.owner_name || ownerId;
  }, [ownerId, quote?.owner_name, users]);

  const productsById = useMemo(() => {
    const out = new Map<string, ProductOut>();
    for (const p of products) out.set(p.id, p);
    return out;
  }, [products]);

  const selectedPriceListItemByProductId = useMemo(() => {
    const out = new Map<string, PriceListItemOut>();
    for (const item of selectedPriceListItems) {
      if (!out.has(item.product_id)) out.set(item.product_id, item);
    }
    return out;
  }, [selectedPriceListItems]);

  const selectedProductsInModal = useMemo(() => {
    return selectedProductIds
      .map((productId) => {
        const priceRow = selectedPriceListItemByProductId.get(productId);
        if (!priceRow) return null;
        const p = productsById.get(productId);
        return {
          id: productId,
          name: priceRow.product_name || p?.name || productId,
          product_code: p?.product_code || null,
          unit_price: Number.isFinite(priceRow.unit_price) ? priceRow.unit_price : Number(priceRow.unit_price || 0),
          currency: priceRow.currency || "BRL",
        };
      })
      .filter((row): row is { id: string; name: string; product_code: string | null; unit_price: number; currency: string } => !!row);
  }, [productsById, selectedPriceListItemByProductId, selectedProductIds]);

  const existingItemProductIds = useMemo(() => {
    const out = new Set<string>();
    for (const item of items) {
      if (item.product_id) out.add(item.product_id);
    }
    return out;
  }, [items]);

  const modalProductSuggestions = useMemo(() => {
    if (!selectedPriceListId) return [];
    const q = createItemQuery.trim().toLowerCase();
    const selectedIds = new Set(selectedProductIds);
    return Array.from(selectedPriceListItemByProductId.values())
      .map((row) => {
        const p = productsById.get(row.product_id);
        return {
          id: row.product_id,
          name: row.product_name || p?.name || row.product_id,
          product_code: p?.product_code || null,
          unit_price: Number.isFinite(row.unit_price) ? row.unit_price : Number(row.unit_price || 0),
          currency: row.currency || "BRL",
        };
      })
      .filter((row) => {
        if (selectedIds.has(row.id)) return false;
        if (existingItemProductIds.has(row.id)) return false;
        if (!q) return true;
        const name = (row.name || "").toLowerCase();
        const code = (row.product_code || "").toLowerCase();
        return name.includes(q) || code.includes(q);
      })
      .slice(0, 20);
  }, [createItemQuery, existingItemProductIds, productsById, selectedPriceListId, selectedPriceListItemByProductId, selectedProductIds]);

  function resolveOpportunityIdFromInput(inputValue: string): string {
    const byLabel = opportunityLabelToId.get(inputValue);
    if (byLabel) return byLabel;

    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) return "";

    const exactByName = opportunities.filter((o) => o.name.trim().toLowerCase() === normalized);
    return exactByName.length === 1 ? exactByName[0].id : "";
  }

  function applyQuoteData(quoteData: QuoteOut) {
    setQuote(quoteData);
    setOpportunityId(quoteData.opportunity_id ?? "");
    setName(quoteData.name ?? "");
    setStatus(quoteData.status ?? "Draft");
    setValidUntil(quoteData.valid_until ?? "");
    setTotalAmount(typeof quoteData.total_amount === "number" ? quoteData.total_amount : Number(quoteData.total_amount || 0));
    setDiscountAmount(typeof quoteData.discount_amount === "number" ? quoteData.discount_amount : Number(quoteData.discount_amount || 0));
    setFinalAmount(typeof quoteData.final_amount === "number" ? quoteData.final_amount : Number(quoteData.final_amount || 0));
    setOwnerId(quoteData.owner_id ?? "");
  }

  function applyItemsData(rows: QuoteItemOut[]) {
    setItems(rows);
    const next: Record<string, QuoteItemEdit> = {};
    for (const row of rows) next[row.id] = buildItemEdit(row);
    setItemEdits(next);
  }

  async function refreshQuoteAndItems(signal?: AbortSignal) {
    if (!id) return;
    const [quoteData, itemsData] = await Promise.all([
      getQuoteWithFallback<QuoteOut>(id),
      listQuoteItemsWithFallback<QuoteItemOut[]>(id),
    ]);
    applyQuoteData(quoteData);
    applyItemsData(Array.isArray(itemsData) ? itemsData : []);
  }

  async function loadAll(signal?: AbortSignal) {
    if (!id) return;
    setLoading(true);
    setErr(null);
    setItemErr(null);
    try {
      const [quoteData, usersData, opportunitiesData, productsData, priceListsData, itemsData] = await Promise.all([
        getQuoteWithFallback<QuoteOut>(id),
        apiFetch<UserOut[]>("/users", { signal } as any).catch(() => [] as UserOut[]),
        apiFetch<OpportunityOut[]>("/crm/opportunities", { signal } as any).catch(() => [] as OpportunityOut[]),
        apiFetch<ProductOut[]>("/crm/products", { signal } as any).catch(() => [] as ProductOut[]),
        apiFetch<PriceListOut[]>("/crm/price-lists", { signal } as any).catch(() => [] as PriceListOut[]),
        listQuoteItemsWithFallback<QuoteItemOut[]>(id),
      ]);

      applyQuoteData(quoteData);
      setUsers(usersData.filter((u) => u.is_active !== false));
      setOpportunities(Array.isArray(opportunitiesData) ? opportunitiesData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setPriceLists(Array.isArray(priceListsData) ? priceListsData : []);
      applyItemsData(Array.isArray(itemsData) ? itemsData : []);

      setIsEditing(false);
      setSnapshot(null);
    } catch (e) {
      if (isAbortError(e)) return;
      setErr(extractApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void loadAll(ac.signal);
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    if (!opportunityId) return;
    const selected = opportunities.find((o) => o.id === opportunityId);
    if (selected) {
      setOpportunityQuery(opportunityOptionLabel(selected));
      return;
    }
    setOpportunityQuery(opportunityId);
  }, [opportunityId, opportunities]);

  useEffect(() => {
    if (!createItemModalOpen) return;
    if (!selectedPriceListId) {
      setSelectedPriceListItems([]);
      return;
    }

    const ac = new AbortController();
    setPriceListItemsLoading(true);
    setCreateItemErr(null);

    (async () => {
      try {
        const rows = await apiFetch<PriceListItemOut[]>(`/crm/price-lists/${encodeURIComponent(selectedPriceListId)}/items`, { signal: ac.signal } as any).catch(() => [] as PriceListItemOut[]);
        setSelectedPriceListItems(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (isAbortError(e)) return;
        setSelectedPriceListItems([]);
        setCreateItemErr(extractApiErrorMessage(e));
      } finally {
        setPriceListItemsLoading(false);
      }
    })();

    return () => ac.abort();
  }, [createItemModalOpen, selectedPriceListId]);

  function enterEditMode() {
    setErr(null);
    setSnapshot({
      opportunity_id: opportunityId,
      name,
      status,
      valid_until: validUntil || null,
      total_amount: totalAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      owner_id: ownerId,
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    if (snapshot) {
      setOpportunityId(snapshot.opportunity_id);
      setName(snapshot.name);
      setStatus(snapshot.status);
      setValidUntil(snapshot.valid_until ?? "");
      setTotalAmount(snapshot.total_amount);
      setDiscountAmount(snapshot.discount_amount);
      setFinalAmount(snapshot.final_amount);
      setOwnerId(snapshot.owner_id);
    }
    setErr(null);
    setIsEditing(false);
    setSnapshot(null);
  }

  async function save() {
    if (!id || !canSave) return;

    setSaving(true);
    setErr(null);
    try {
      const payload: QuotePatch = {
        opportunity_id: opportunityId.trim(),
        name: name.trim(),
        status: status.trim() || "Draft",
        valid_until: validUntil.trim() ? validUntil.trim() : null,
        total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
        discount_amount: Number.isFinite(discountAmount) ? discountAmount : 0,
        final_amount: Number.isFinite(finalAmount) ? finalAmount : 0,
        owner_id: ownerId.trim(),
      };
      const updated = await patchQuoteWithFallback<QuoteOut>(id, payload);

      applyQuoteData(updated);
      setIsEditing(false);
      setSnapshot(null);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function updateItemEdit(itemId: string, patch: Partial<QuoteItemEdit>) {
    setItemEdits((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  function openCreateItemModal() {
    setSelectedPriceListId("");
    setSelectedPriceListItems([]);
    setCreateItemQuery("");
    setSelectedProductIds([]);
    setCreateItemErr(null);
    setCreateItemModalOpen(true);
  }

  function closeCreateItemModal() {
    if (addingItem) return;
    setCreateItemModalOpen(false);
    setCreateItemErr(null);
  }

  function changeSelectedPriceList(priceListId: string) {
    setSelectedPriceListId(priceListId);
    setSelectedProductIds([]);
    setCreateItemQuery("");
    setCreateItemErr(null);
  }

  function addProductToModalList(productId: string) {
    if (!productId) return;
    setSelectedProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
    setCreateItemQuery("");
    setCreateItemErr(null);
  }

  function removeProductFromModalList(productId: string) {
    setSelectedProductIds((prev) => prev.filter((id) => id !== productId));
  }

  async function addSelectedProducts() {
    if (!id) return;
    if (!selectedPriceListId) {
      setCreateItemErr("Selecione uma Price List para listar os produtos.");
      return;
    }
    if (!selectedProductIds.length) {
      setCreateItemErr("Selecione ao menos um produto para adicionar.");
      return;
    }

    setAddingItem(true);
    setItemErr(null);
    setCreateItemErr(null);
    try {
      const productById = productsById;
      const priceByProductId = selectedPriceListItemByProductId;
      const toCreate = selectedProductIds.filter((pid) => !existingItemProductIds.has(pid));

      if (!toCreate.length) {
        setCreateItemErr("Os produtos selecionados já estão na lista de configuração.");
        return;
      }

      const missingPriceProducts = toCreate.filter((productId) => !priceByProductId.has(productId));
      if (missingPriceProducts.length) {
        setCreateItemErr("Alguns produtos selecionados não possuem preço na Price List escolhida.");
        return;
      }

      await Promise.all(
        toCreate.map((productId) => {
          const p = productById.get(productId);
          const priceItem = priceByProductId.get(productId);
          const unitPrice = Number.isFinite(priceItem?.unit_price) ? Number(priceItem?.unit_price) : Number(priceItem?.unit_price || 0);
          const payload: QuoteItemUpsert = {
            product_id: productId,
            description: priceItem?.product_name || p?.name || "",
            quantity: 1,
            unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
            discount_percent: 0,
            discount_amount: 0,
          };
          return createQuoteItemWithFallback<QuoteItemOut>(id, payload);
        }),
      );

      await refreshQuoteAndItems();
      closeCreateItemModal();
    } catch (e) {
      const msg = extractApiErrorMessage(e);
      setCreateItemErr(msg);
    } finally {
      setAddingItem(false);
    }
  }

  async function saveItem(itemId: string) {
    if (!id) return;
    const edit = itemEdits[itemId];
    if (!edit) return;
    if (!edit.description.trim() && !edit.product_id.trim()) {
      setItemErr("Cada item precisa de produto ou descrição.");
      return;
    }

    setItemSavingId(itemId);
    setItemErr(null);
    try {
      const payload: QuoteItemUpsert = {
        product_id: edit.product_id.trim() || null,
        description: edit.description.trim(),
        quantity: Number.isFinite(edit.quantity) ? edit.quantity : 0,
        unit_price: Number.isFinite(edit.unit_price) ? edit.unit_price : 0,
        discount_percent: Number.isFinite(edit.discount_percent) ? edit.discount_percent : 0,
        discount_amount: Number.isFinite(edit.discount_amount) ? edit.discount_amount : 0,
      };
      await patchQuoteItemWithFallback<QuoteItemOut>(id, itemId, payload);
      await refreshQuoteAndItems();
    } catch (e) {
      setItemErr(extractApiErrorMessage(e));
    } finally {
      setItemSavingId(null);
    }
  }

  async function deleteItem(itemId: string) {
    if (!id) return;
    setItemDeletingId(itemId);
    setItemErr(null);
    try {
      await deleteQuoteItemWithFallback(id, itemId);
      await refreshQuoteAndItems();
    } catch (e) {
      setItemErr(extractApiErrorMessage(e));
    } finally {
      setItemDeletingId(null);
    }
  }

  return (
    <div className="h-full min-h-0">
      <section className="panel flex h-full min-h-0 flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none">
        <header className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Cotação</div>
              <div className="text-lg font-semibold md:text-xl">{loading ? "Carregando..." : name || quote?.name || "Cotação"}</div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                ID: {quote?.id || "—"} · Oportunidade: {selectedOpportunityName} · Owner: {ownerSummary}
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary !h-9 !rounded-none px-3 text-sm" onClick={openCreateItemModal} disabled={loading || saving || addingItem || !quote?.id}>
                  Adicionar Produtos
                </button>
                <button className="btn btn-secondary !h-9 !rounded-none px-3 text-sm" type="button" disabled={loading || saving || addingItem || !quote?.id}>
                  Aprovação
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-secondary" onClick={() => nav("/apps/comercial/cotacoes")} disabled={saving || addingItem}>
                  Voltar
                </button>
                {!isEditing ? (
                  <button className="btn btn-primary" onClick={enterEditMode} disabled={loading || saving || addingItem}>
                    Editar
                  </button>
                ) : (
                  <>
                    <button className="btn btn-secondary" onClick={cancelEdit} disabled={saving || addingItem}>
                      Cancelar
                    </button>
                    <button className="btn btn-success" onClick={() => void save()} disabled={!canSave || addingItem}>
                      {saving ? "Salvando..." : "Salvar cotação"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid content-start min-h-full grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,2.2fr)_350px] xl:gap-x-4 xl:gap-y-0">
            <div className="min-h-0 space-y-3 xl:col-span-2">
              {err && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Detalhes da Cotação</div>
                <div className="bg-[rgb(var(--panel))]">
                  <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Oportunidade *</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        list={opportunityDatalistId}
                        value={opportunityQuery}
                        onChange={(e) => {
                          const next = e.target.value;
                          setOpportunityQuery(next);
                          setOpportunityId(resolveOpportunityIdFromInput(next));
                        }}
                        onBlur={() => {
                          const resolved = resolveOpportunityIdFromInput(opportunityQuery);
                          setOpportunityId(resolved);
                          if (!resolved) return;
                          const selected = opportunities.find((o) => o.id === resolved);
                          if (selected) setOpportunityQuery(opportunityOptionLabel(selected));
                        }}
                        placeholder="Digite para buscar por nome da oportunidade"
                        disabled={loading || !isEditing}
                      />
                      <datalist id={opportunityDatalistId}>
                        {opportunities.map((o) => (
                          <option key={o.id} value={opportunityOptionLabel(o)} />
                        ))}
                      </datalist>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Nome *</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Status</label>
                      <select className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} disabled={loading || !isEditing}>
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Validade</label>
                      <input className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={loading || !isEditing} />
                    </div>

                  </div>
                </div>
              </section>

            </div>

            <section className="overflow-hidden border-t border-[rgb(var(--border))] xl:col-span-2">
              <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Itens da Cotação</div>
              <div className="flex min-h-0 flex-col bg-[rgb(var(--panel))]">
                {itemErr && <div className="m-2 border border-red-200 bg-red-50 p-2 text-xs text-red-700">{itemErr}</div>}

                {items.length ? (
                  <div className="max-h-[52vh] overflow-auto border-t border-[rgb(var(--border))]">
                    <table className="min-w-full table-fixed text-sm">
                      <thead className="bg-[rgb(var(--panel-2))] text-left text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                        <tr>
                          <th className="w-[44%] px-2 py-2">Produto</th>
                          <th className="w-[70px] px-2 py-2">Qtde</th>
                          <th className="w-[110px] px-2 py-2">Unit. (R$)</th>
                          <th className="w-[78px] px-2 py-2">Desc %</th>
                          <th className="w-[88px] px-2 py-2">Desc R$</th>
                          <th className="w-[110px] px-2 py-2">Total</th>
                          <th className="w-[160px] px-2 py-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
                          const edit = itemEdits[item.id] ?? buildItemEdit(item);
                          const effectiveUnitPrice = Number.isFinite(edit.unit_price) ? edit.unit_price : 0;
                          const lineTotal = lineTotalFromValues(edit.quantity, effectiveUnitPrice, edit.discount_percent, edit.discount_amount);
                          const busy = itemSavingId === item.id || itemDeletingId === item.id;
                          const productLabel = item.product_name || products.find((p) => p.id === edit.product_id)?.name || "Sem produto";
                          return (
                            <tr key={item.id} className="border-t border-[rgb(var(--border))]">
                              <td className="px-2 py-2 align-middle text-sm">
                                <span className="block truncate font-medium">{productLabel}</span>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input className="input h-8 w-[64px] rounded-md px-2 py-1 text-xs" type="number" step="0.01" value={edit.quantity} onChange={(e) => updateItemEdit(item.id, { quantity: Number(e.target.value || 0) })} disabled={busy || !isEditing} />
                              </td>
                              <td className="px-2 py-2 align-middle text-xs font-semibold">{formatMoney(effectiveUnitPrice)}</td>
                              <td className="px-2 py-2 align-top">
                                <input className="input h-8 w-[64px] rounded-md px-2 py-1 text-xs" type="number" step="0.01" value={edit.discount_percent} onChange={(e) => updateItemEdit(item.id, { discount_percent: Number(e.target.value || 0) })} disabled={busy || !isEditing} />
                              </td>
                              <td className="px-2 py-2 align-top">
                                <MoneyInput
                                  className="input h-8 w-[102px] rounded-md px-2 py-1 text-xs"
                                  value={edit.discount_amount}
                                  onChange={(next) => updateItemEdit(item.id, { discount_amount: next })}
                                  min={0}
                                  disabled={busy || !isEditing}
                                />
                              </td>
                              <td className="px-2 py-2 align-top text-xs font-semibold">{formatMoney(lineTotal)}</td>
                              <td className="px-2 py-2 align-top">
                                <div className="flex gap-1">
                                  <button className="btn btn-secondary h-8 px-2 text-xs" onClick={() => void saveItem(item.id)} disabled={busy || !isEditing}>
                                    {itemSavingId === item.id ? "Salvando..." : "Salvar"}
                                  </button>
                                  <button className="btn btn-secondary h-8 px-2 text-xs" onClick={() => void deleteItem(item.id)} disabled={busy || !isEditing}>
                                    {itemDeletingId === item.id ? "Excluindo..." : "Excluir"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="max-h-[52vh] overflow-auto border-t border-[rgb(var(--border))] px-3 py-4 text-sm text-[rgb(var(--muted))]">Nenhum item nesta cotação.</div>
                )}

                <footer className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
                  <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Resumo</div>
                  <div className="grid grid-cols-1 gap-2 p-3 text-sm md:grid-cols-3">
                    <div className="flex items-center justify-between gap-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2">
                      <span className="text-[rgb(var(--muted))]">Total bruto</span>
                      <span className="font-semibold">{formatMoney(totalAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2">
                      <span className="text-[rgb(var(--muted))]">Desconto</span>
                      <span className="font-semibold">{formatMoney(discountAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2">
                      <span className="text-[rgb(var(--muted))]">Valor final</span>
                      <span className="font-semibold">{formatMoney(finalAmount)}</span>
                    </div>
                  </div>
                </footer>
              </div>
            </section>
          </div>
        </div>
      </section>

      {createItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={closeCreateItemModal} aria-label="Fechar modal" />

          <section className="panel relative z-10 flex max-h-[calc(100vh-3rem)] w-[min(980px,100%)] flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none shadow-2xl">
            <header className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Cotação</div>
                  <div className="text-base font-semibold">Adicionar Produtos</div>
                  <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                    {name || quote?.name || "Cotação"} · {quote?.id || "—"}
                  </div>
                </div>
                <button className="btn btn-ghost -mr-2 -mt-2" onClick={closeCreateItemModal} aria-label="Fechar" disabled={addingItem}>
                  ✕
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[rgb(var(--panel))] p-4">
              {createItemErr && <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{createItemErr}</div>}

              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">Configuração de Preços</div>
                <div className="bg-[rgb(var(--panel))]">
                  <div className="border-t border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Price List *</label>
                    <select className="input mt-1 w-full" value={selectedPriceListId} onChange={(e) => changeSelectedPriceList(e.target.value)} disabled={addingItem}>
                      <option value="">Selecione uma price list</option>
                      {priceLists.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name}
                        </option>
                      ))}
                    </select>

                    <label className="text-sm text-[rgb(var(--muted))]">Buscar produto</label>
                    <input
                      className="input mt-1 w-full"
                      value={createItemQuery}
                      onChange={(e) => setCreateItemQuery(e.target.value)}
                      placeholder={selectedPriceListId ? "Digite nome ou código do produto" : "Selecione uma price list para listar produtos"}
                      disabled={addingItem || !selectedPriceListId}
                    />
                    <div className="mt-2 max-h-56 overflow-y-auto border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
                      {priceListItemsLoading ? (
                        <div className="px-3 py-2 text-sm text-[rgb(var(--muted))]">Carregando produtos da price list...</div>
                      ) : !selectedPriceListId ? (
                        <div className="px-3 py-2 text-sm text-[rgb(var(--muted))]">Selecione uma price list para carregar produtos.</div>
                      ) : modalProductSuggestions.length ? (
                        modalProductSuggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full items-center justify-between border-b border-[rgb(var(--border))] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[rgb(var(--panel))]"
                            onClick={() => addProductToModalList(p.id)}
                            disabled={addingItem}
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="ml-3 text-xs text-[rgb(var(--muted))]">
                              {(p.product_code || p.id) + " · " + formatMoney(p.unit_price)}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-[rgb(var(--muted))]">Nenhum produto disponível para adicionar.</div>
                      )}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="text-sm font-semibold">Produtos selecionados</div>
                    {selectedProductsInModal.length ? (
                      <div className="mt-2 space-y-2">
                        {selectedProductsInModal.map((p) => (
                          <div key={p.id} className="flex items-center justify-between border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{p.name}</div>
                              <div className="text-xs text-[rgb(var(--muted))]">{(p.product_code || p.id) + " · " + formatMoney(p.unit_price)}</div>
                            </div>
                            <button className="btn btn-secondary h-8 px-2 text-xs" onClick={() => removeProductFromModalList(p.id)} disabled={addingItem}>
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-[rgb(var(--muted))]">Nenhum produto selecionado.</div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <footer className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <button className="btn btn-secondary" onClick={closeCreateItemModal} disabled={addingItem}>
                  Cancelar
                </button>
                <button className="btn btn-success !rounded-none" onClick={() => void addSelectedProducts()} disabled={addingItem || !selectedPriceListId}>
                  {addingItem ? "Salvando..." : "Salvar produtos"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
