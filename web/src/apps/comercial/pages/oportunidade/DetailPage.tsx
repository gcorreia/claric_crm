import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { ActivityPanel } from "../../components/ActivityPanel";
import { formatMoneyBRL, MoneyInput } from "../../components/MoneyInput";
import { RelatedItemsModal, type RelatedKind } from "../../components/RelatedItemsModal";
import { createOrderFormWithFallback } from "../../orderformsApi";
import { createQuoteWithFallback } from "../../quotesApi";

type CustomFieldDef = {
  id: string;
  entity_type: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  is_active: boolean;
  options: Record<string, any>;
};

type UserOut = {
  id: string;
  name?: string | null;
  email?: string | null;
  is_active?: boolean;
};

type AccountOut = {
  id: string;
  name: string;
};

type OpportunityStageOption = {
  id: string;
  value: string;
  is_active: boolean;
  probability_percent?: number | null;
};

type OpportunityOut = {
  id: string;
  account_id: string | null;
  name: string;
  stage: string;
  amount: number;
  close_date: string | null;
  owner_id: string;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
  custom_fields: Record<string, any>;
};

type OrderFormIn = {
  opportunity_id: string;
  name: string;
  status: string;
  effective_start_date: string | null;
  effective_end_date: string | null;
  total_amount: number;
  currency: string;
  signed_at: string | null;
  contract_generated: boolean;
  owner_id: string;
  notes: string;
};

type OrderFormOut = OrderFormIn & {
  id: string;
  account_id: string | null;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
};

type QuoteIn = {
  opportunity_id: string;
  name: string;
  status: string;
  valid_until: string | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  owner_id: string;
};

type QuoteOut = QuoteIn & {
  id: string;
  account_id: string | null;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
};

const ORDER_FORM_STATUS_OPTIONS = ["Draft", "Sent", "Signed", "Cancelled"];
const QUOTE_STATUS_OPTIONS = ["Draft", "In Review", "Approved", "Sent", "Accepted", "Rejected", "Expired"];

function userLabel(u: UserOut): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
}

function accountOptionLabel(a: AccountOut): string {
  return `${a.name} · ${a.id}`;
}

function stageOptionLabel(s: OpportunityStageOption): string {
  const pct = Number(s.probability_percent);
  if (Number.isFinite(pct)) {
    const normalized = Math.max(0, Math.min(100, Math.round(pct)));
    return `${s.value} (${normalized}%)`;
  }
  return s.value;
}

function optionsValues(def: CustomFieldDef): string[] {
  const v = def.options?.values;
  return Array.isArray(v) ? v.map(String) : [];
}

function toDatetimeIso(localValue: string): string {
  const d = new Date(localValue);
  return d.toISOString();
}

function fromIsoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

function isEmptyRequired(type: string, value: any): boolean {
  if (value === null || value === undefined) return true;
  if (type === "boolean") return false;
  if (type === "multi_select") return !Array.isArray(value) || value.length === 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function missingRequired(defs: CustomFieldDef[], values: Record<string, any>): string[] {
  return defs
    .filter((d) => d.is_active && d.required)
    .filter((d) => isEmptyRequired(d.type, values[d.key]))
    .map((d) => d.label);
}

function extractApiErrorMessage(e: unknown): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (detail?.message) return String(detail.message);
  if (typeof detail === "string") return detail;
  return String(ae?.message || "Erro inesperado");
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function CustomFieldsForm(props: {
  defs: CustomFieldDef[];
  values: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { defs, values, onChange, disabled, compact = false } = props;
  const labelClass = compact
    ? "text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]"
    : "text-sm text-[rgb(var(--muted))]";
  const textInputClass = compact
    ? "input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
    : "input mt-1 w-full";
  const textAreaClass = compact
    ? "input mt-1 min-h-[72px] w-full rounded-md px-2 py-1.5 text-sm"
    : "input mt-1 h-24 w-full";
  const multiSelectClass = compact
    ? "input mt-1 min-h-[96px] w-full rounded-md px-2 py-1.5 text-sm"
    : "input mt-1 w-full";

  if (!defs.length) {
    return <div className="text-sm text-[rgb(var(--muted))]">Nenhum campo customizado ativo para Oportunidade.</div>;
  }

  return (
    <div className={compact ? "grid grid-cols-1 gap-2 md:grid-cols-2" : "grid grid-cols-1 gap-3 md:grid-cols-2"}>
      {defs.map((d) => {
        const v = values[d.key];
        const set = (nextVal: any) => onChange({ ...values, [d.key]: nextVal });

        if (d.type === "textarea") {
          return (
            <div key={d.id} className="md:col-span-2">
              <label className={labelClass}>
                {d.label} {d.required ? "*" : ""}
              </label>
              <textarea className={textAreaClass} value={v ?? ""} onChange={(e) => set(e.target.value)} disabled={disabled} />
            </div>
          );
        }

        if (d.type === "boolean") {
          return (
            <div key={d.id} className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} disabled={disabled} />
                {d.label} {d.required ? "*" : ""}
              </label>
            </div>
          );
        }

        if (d.type === "single_select") {
          const opts = optionsValues(d);
          return (
            <div key={d.id}>
              <label className={labelClass}>
                {d.label} {d.required ? "*" : ""}
              </label>
              <select className={textInputClass} value={v ?? ""} onChange={(e) => set(e.target.value)} disabled={disabled}>
                <option value="">—</option>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (d.type === "multi_select") {
          const opts = optionsValues(d);
          const cur: string[] = Array.isArray(v) ? v : [];
          return (
            <div key={d.id} className="md:col-span-2">
              <label className={labelClass}>
                {d.label} {d.required ? "*" : ""}
              </label>
              <select
                className={multiSelectClass}
                multiple
                value={cur}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                  set(selected);
                }}
                disabled={disabled}
              >
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">Segure Ctrl/⌘ para selecionar múltiplas.</div>
            </div>
          );
        }

        const inputType =
          d.type === "number"
            ? "number"
            : d.type === "email"
              ? "email"
              : d.type === "url"
                ? "url"
                : d.type === "phone"
                  ? "tel"
                  : d.type === "date"
                    ? "date"
                    : d.type === "datetime"
                      ? "datetime-local"
                      : "text";

        let inputValue = v ?? "";
        if (d.type === "datetime" && typeof v === "string" && v) inputValue = fromIsoToDatetimeLocal(v);

        return (
          <div key={d.id}>
            <label className={labelClass}>
              {d.label} {d.required ? "*" : ""}
            </label>
            <input
              className={textInputClass}
              type={inputType}
              value={inputValue}
              onChange={(e) => {
                if (d.type === "number") set(e.target.value === "" ? null : Number(e.target.value));
                else if (d.type === "datetime") set(e.target.value ? toDatetimeIso(e.target.value) : null);
                else set(e.target.value);
              }}
              disabled={disabled}
            />
          </div>
        );
      })}
    </div>
  );
}

export function OportunidadeDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const accountDatalistId = "opportunity-detail-account-options";

  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [opp, setOpp] = useState<OpportunityOut | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  const [accountId, setAccountId] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [name, setName] = useState("");
  const [stage, setStage] = useState("Inicial");
  const [amount, setAmount] = useState<number>(0);
  const [closeDate, setCloseDate] = useState<string>("");
  const [ownerId, setOwnerId] = useState("");
  const [users, setUsers] = useState<UserOut[]>([]);
  const [accounts, setAccounts] = useState<AccountOut[]>([]);
  const [opportunityStages, setOpportunityStages] = useState<OpportunityStageOption[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});

  const [snapshot, setSnapshot] = useState<{
    accountId: string;
    name: string;
    stage: string;
    amount: number;
    closeDate: string;
    ownerId: string;
    customFields: Record<string, any>;
  } | null>(null);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedKind, setRelatedKind] = useState<RelatedKind>("contacts");
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [createQuoteSaving, setCreateQuoteSaving] = useState(false);
  const [createQuoteErr, setCreateQuoteErr] = useState<string | null>(null);
  const [quoteName, setQuoteName] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("Draft");
  const [quoteValidUntil, setQuoteValidUntil] = useState("");
  const [quoteTotalAmount, setQuoteTotalAmount] = useState<number>(0);
  const [quoteDiscountAmount, setQuoteDiscountAmount] = useState<number>(0);
  const [quoteFinalAmount, setQuoteFinalAmount] = useState<number>(0);
  const [quoteOwnerId, setQuoteOwnerId] = useState("");
  const [createOrderFormOpen, setCreateOrderFormOpen] = useState(false);
  const [createOrderFormSaving, setCreateOrderFormSaving] = useState(false);
  const [createOrderFormErr, setCreateOrderFormErr] = useState<string | null>(null);
  const [orderFormName, setOrderFormName] = useState("");
  const [orderFormStatus, setOrderFormStatus] = useState("Draft");
  const [orderFormEffectiveStartDate, setOrderFormEffectiveStartDate] = useState("");
  const [orderFormEffectiveEndDate, setOrderFormEffectiveEndDate] = useState("");
  const [orderFormTotalAmount, setOrderFormTotalAmount] = useState<number>(0);
  const [orderFormSignedAtLocal, setOrderFormSignedAtLocal] = useState("");
  const [orderFormContractGenerated, setOrderFormContractGenerated] = useState(false);
  const [orderFormOwnerId, setOrderFormOwnerId] = useState("");
  const [orderFormNotes, setOrderFormNotes] = useState("");
  const relatedLinks = useMemo(
    () => [
      { label: "Contatos", kind: "contacts" as RelatedKind },
      { label: "Leads", kind: "leads" as RelatedKind },
      { label: "Oportunidades", kind: "opportunities" as RelatedKind },
      { label: "Cotações", kind: "quotes" as RelatedKind },
      { label: "Order Forms", kind: "order_forms" as RelatedKind },
      { label: "Contrato", kind: "contract" as RelatedKind },
    ],
    [],
  );

  const accountLabelToId = useMemo(() => {
    const out = new Map<string, string>();
    for (const a of accounts) out.set(accountOptionLabel(a), a.id);
    return out;
  }, [accounts]);
  const opportunityStageValues = useMemo(() => {
    const values = opportunityStages.map((s) => s.value);
    if (stage && !values.includes(stage)) return [stage, ...values];
    return values;
  }, [opportunityStages, stage]);
  const opportunityStageLabelByValue = useMemo(() => {
    const out = new Map<string, string>();
    for (const s of opportunityStages) out.set(s.value, stageOptionLabel(s));
    return out;
  }, [opportunityStages]);
  const selectedAccountName = useMemo(() => {
    const selected = accounts.find((a) => a.id === accountId);
    if (selected) return selected.name;
    return accountId ? accountId : "Sem conta";
  }, [accounts, accountId]);
  const ownerSummary = useMemo(() => {
    if (!ownerId) return "—";
    const selected = users.find((u) => u.id === ownerId);
    if (selected) return userLabel(selected);
    return opp?.owner_name || ownerId;
  }, [opp?.owner_name, ownerId, users]);
  const validOrderFormOwnerIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const preferredOrderFormOwnerId = useMemo(() => {
    if (ownerId && validOrderFormOwnerIds.has(ownerId)) return ownerId;
    if (opp?.owner_id && validOrderFormOwnerIds.has(opp.owner_id)) return opp.owner_id;
    return users[0]?.id || "";
  }, [opp?.owner_id, ownerId, users, validOrderFormOwnerIds]);
  const canCreateQuote = useMemo(
    () => !!opp?.id && !!quoteName.trim() && !!quoteOwnerId.trim() && validOrderFormOwnerIds.has(quoteOwnerId.trim()) && !createQuoteSaving,
    [createQuoteSaving, opp?.id, quoteName, quoteOwnerId, validOrderFormOwnerIds],
  );
  const canSave = useMemo(
    () => !!name.trim() && !!ownerId.trim() && (!opportunityStageValues.length || !!stage.trim()) && !saving && isEditing,
    [isEditing, name, opportunityStageValues.length, ownerId, saving, stage],
  );
  const canCreateOrderForm = useMemo(
    () =>
      !!opp?.id &&
      !!orderFormName.trim() &&
      !!orderFormOwnerId.trim() &&
      validOrderFormOwnerIds.has(orderFormOwnerId.trim()) &&
      !createOrderFormSaving,
    [createOrderFormSaving, opp?.id, orderFormName, orderFormOwnerId, validOrderFormOwnerIds],
  );

  function resolveAccountIdFromInput(inputValue: string): string {
    const byLabel = accountLabelToId.get(inputValue);
    if (byLabel) return byLabel;

    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) return "";

    const exactByName = accounts.filter((a) => a.name.trim().toLowerCase() === normalized);
    return exactByName.length === 1 ? exactByName[0].id : "";
  }

  async function loadAll(signal?: AbortSignal) {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const [defsData, oppData, usersData, accountsData, stagesData] = await Promise.all([
        apiFetch<CustomFieldDef[]>(`/crm/provisioning/fields?entity_type=${encodeURIComponent("opportunity")}`, { signal } as any),
        apiFetch<OpportunityOut>(`/crm/opportunities/${encodeURIComponent(id)}`, { signal } as any),
        apiFetch<UserOut[]>("/users", { signal } as any).catch(() => [] as UserOut[]),
        apiFetch<AccountOut[]>("/crm/accounts", { signal } as any).catch(() => [] as AccountOut[]),
        apiFetch<OpportunityStageOption[]>("/crm/opportunity-stages", { signal } as any).catch(() => [] as OpportunityStageOption[]),
      ]);

      setDefs(defsData.filter((d) => d.is_active));
      setOpp(oppData);
      setUsers(usersData.filter((u) => u.is_active !== false));
      setAccounts(accountsData);
      setOpportunityStages(stagesData.filter((s) => s.is_active !== false));

      setAccountId(oppData.account_id ?? "");
      setName(oppData.name ?? "");
      setStage(oppData.stage ?? "Inicial");
      setAmount(typeof oppData.amount === "number" ? oppData.amount : Number(oppData.amount || 0));
      setCloseDate(oppData.close_date ?? "");
      setOwnerId(oppData.owner_id ?? "");
      setCustomFields(oppData.custom_fields ?? {});

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
    if (!accountId) return;
    const selected = accounts.find((a) => a.id === accountId);
    if (selected) {
      setAccountQuery(accountOptionLabel(selected));
      return;
    }
    setAccountQuery(accountId);
  }, [accountId, accounts]);

  useEffect(() => {
    const next = Math.max((Number(quoteTotalAmount) || 0) - (Number(quoteDiscountAmount) || 0), 0);
    setQuoteFinalAmount(next);
  }, [quoteTotalAmount, quoteDiscountAmount]);

  function enterEditMode() {
    setErr(null);
    setSnapshot({
      accountId,
      name,
      stage,
      amount,
      closeDate,
      ownerId,
      customFields: clone(customFields),
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    if (snapshot) {
      setAccountId(snapshot.accountId);
      setName(snapshot.name);
      setStage(snapshot.stage);
      setAmount(snapshot.amount);
      setCloseDate(snapshot.closeDate);
      setOwnerId(snapshot.ownerId);
      setCustomFields(snapshot.customFields);
    }
    setErr(null);
    setIsEditing(false);
    setSnapshot(null);
  }

  function openRelated(kind: RelatedKind) {
    setRelatedKind(kind);
    setRelatedOpen(true);
  }

  function openCreateQuoteModal() {
    const opportunityName = (name || opp?.name || "").trim();
    const fallbackAmount = typeof opp?.amount === "number" ? opp.amount : Number(opp?.amount || 0);
    const nextAmount = Number.isFinite(amount) ? amount : fallbackAmount;

    setQuoteName(opportunityName ? `Cotação - ${opportunityName}` : "Cotação");
    setQuoteStatus("Draft");
    setQuoteValidUntil(closeDate || "");
    setQuoteTotalAmount(Number.isFinite(nextAmount) ? nextAmount : 0);
    setQuoteDiscountAmount(0);
    setQuoteFinalAmount(Math.max(Number.isFinite(nextAmount) ? nextAmount : 0, 0));
    setQuoteOwnerId(preferredOrderFormOwnerId);
    setCreateQuoteErr(null);
    setCreateQuoteOpen(true);
  }

  function closeCreateQuoteModal() {
    if (createQuoteSaving) return;
    setCreateQuoteOpen(false);
    setCreateQuoteErr(null);
  }

  async function createQuote() {
    const opportunityId = (opp?.id || "").trim();
    if (!opportunityId) {
      setCreateQuoteErr("Oportunidade não carregada para criar cotação.");
      return;
    }
    const normalizedOwnerId = quoteOwnerId.trim();
    if (!normalizedOwnerId || !validOrderFormOwnerIds.has(normalizedOwnerId)) {
      setCreateQuoteErr("Selecione um owner válido para salvar a cotação.");
      return;
    }
    if (!canCreateQuote) return;

    setCreateQuoteSaving(true);
    setCreateQuoteErr(null);
    try {
      const payload: QuoteIn = {
        opportunity_id: opportunityId,
        name: quoteName.trim(),
        status: quoteStatus.trim() || "Draft",
        valid_until: quoteValidUntil.trim() ? quoteValidUntil.trim() : null,
        total_amount: Number.isFinite(quoteTotalAmount) ? quoteTotalAmount : 0,
        discount_amount: Number.isFinite(quoteDiscountAmount) ? quoteDiscountAmount : 0,
        final_amount: Number.isFinite(quoteFinalAmount) ? quoteFinalAmount : 0,
        owner_id: normalizedOwnerId,
      };

      await createQuoteWithFallback<QuoteOut>(payload);
      setCreateQuoteOpen(false);
      setRelatedKind("quotes");
      setRelatedOpen(true);
    } catch (e) {
      const msg = extractApiErrorMessage(e);
      if (/opportunity not found/i.test(msg)) {
        setCreateQuoteErr(`A oportunidade ${opportunityId} não foi encontrada na BU ativa.`);
      } else if (/^not found$/i.test(msg) || /http 404/i.test(msg)) {
        setCreateQuoteErr("Endpoint não encontrado. Verifique /api/crm/quotes e /api/comercial/quotes no backend ativo.");
      } else {
        setCreateQuoteErr(msg);
      }
    } finally {
      setCreateQuoteSaving(false);
    }
  }

  function openCreateOrderFormModal() {
    const opportunityName = (name || opp?.name || "").trim();
    const fallbackAmount = typeof opp?.amount === "number" ? opp.amount : Number(opp?.amount || 0);
    const nextAmount = Number.isFinite(amount) ? amount : fallbackAmount;

    setOrderFormName(opportunityName ? `Order Form - ${opportunityName}` : "Order Form");
    setOrderFormStatus("Draft");
    setOrderFormEffectiveStartDate(closeDate || "");
    setOrderFormEffectiveEndDate("");
    setOrderFormTotalAmount(Number.isFinite(nextAmount) ? nextAmount : 0);
    setOrderFormSignedAtLocal("");
    setOrderFormContractGenerated(false);
    setOrderFormOwnerId(preferredOrderFormOwnerId);
    setOrderFormNotes("");
    setCreateOrderFormErr(null);
    setCreateOrderFormOpen(true);
  }

  function closeCreateOrderFormModal() {
    if (createOrderFormSaving) return;
    setCreateOrderFormOpen(false);
    setCreateOrderFormErr(null);
  }

  async function createOrderForm() {
    const opportunityId = (opp?.id || "").trim();
    if (!opportunityId) {
      setCreateOrderFormErr("Oportunidade não carregada para criar order form.");
      return;
    }
    const normalizedOwnerId = orderFormOwnerId.trim();
    if (!normalizedOwnerId || !validOrderFormOwnerIds.has(normalizedOwnerId)) {
      setCreateOrderFormErr("Selecione um owner válido para salvar o order form.");
      return;
    }
    if (!canCreateOrderForm) return;

    if (orderFormEffectiveStartDate && orderFormEffectiveEndDate && orderFormEffectiveEndDate < orderFormEffectiveStartDate) {
      setCreateOrderFormErr("A data final de vigência deve ser maior ou igual à data inicial.");
      return;
    }

    setCreateOrderFormSaving(true);
    setCreateOrderFormErr(null);
    try {
      const payload: OrderFormIn = {
        opportunity_id: opportunityId,
        name: orderFormName.trim(),
        status: orderFormStatus.trim() || "Draft",
        effective_start_date: orderFormEffectiveStartDate.trim() ? orderFormEffectiveStartDate.trim() : null,
        effective_end_date: orderFormEffectiveEndDate.trim() ? orderFormEffectiveEndDate.trim() : null,
        total_amount: Number.isFinite(orderFormTotalAmount) ? orderFormTotalAmount : 0,
        currency: "BRL",
        signed_at: orderFormSignedAtLocal ? toDatetimeIso(orderFormSignedAtLocal) : null,
        contract_generated: orderFormContractGenerated,
        owner_id: normalizedOwnerId,
        notes: orderFormNotes.trim(),
      };

      await createOrderFormWithFallback<OrderFormOut>(payload);
      setCreateOrderFormOpen(false);
      setRelatedKind("order_forms");
      setRelatedOpen(true);
    } catch (e) {
      const msg = extractApiErrorMessage(e);
      if (/opportunity not found/i.test(msg)) {
        setCreateOrderFormErr(`A oportunidade ${opportunityId} não foi encontrada na BU ativa.`);
      } else if (/^not found$/i.test(msg) || /http 404/i.test(msg)) {
        setCreateOrderFormErr("Endpoint não encontrado. Verifique /api/crm/order-forms e /api/comercial/order-forms no backend ativo.");
      } else {
        setCreateOrderFormErr(msg);
      }
    } finally {
      setCreateOrderFormSaving(false);
    }
  }

  async function save() {
    if (!id || !canSave) return;

    const missing = missingRequired(defs, customFields);
    if (missing.length) {
      setErr(`Preencha os campos obrigatórios: ${missing.join(", ")}`);
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const updated = await apiFetch<OpportunityOut>(`/crm/opportunities/${encodeURIComponent(id)}`, {
        method: "PATCH",
        csrf: true,
        body: {
          account_id: accountId.trim() ? accountId.trim() : null,
          name: name.trim(),
          stage: stage.trim() || "Inicial",
          amount: Number.isFinite(amount) ? amount : 0,
          close_date: closeDate.trim() ? closeDate.trim() : null,
          owner_id: ownerId.trim(),
          custom_fields: customFields,
        },
      });

      setOpp(updated);
      setAccountId(updated.account_id ?? "");
      setName(updated.name ?? "");
      setStage(updated.stage ?? "Inicial");
      setAmount(typeof updated.amount === "number" ? updated.amount : Number(updated.amount || 0));
      setCloseDate(updated.close_date ?? "");
      setOwnerId(updated.owner_id ?? "");
      setCustomFields(updated.custom_fields ?? {});
      setIsEditing(false);
      setSnapshot(null);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full min-h-0">
      <section className="panel flex h-full min-h-0 flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none">
        <header className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Oportunidade</div>
              <div className="text-lg font-semibold md:text-xl">{loading ? "Carregando oportunidade..." : name || opp?.name || "Oportunidade"}</div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                ID: {opp?.id || "—"} · Owner: {ownerSummary} · Atualizado em {formatDateTime(opp?.updated_at)}
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="btn btn-success h-8 px-3 text-xs !rounded-none"
                  onClick={openCreateQuoteModal}
                  disabled={loading || !opp?.id}
                >
                  Criar Cotação
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-secondary" onClick={() => nav("/apps/comercial/oportunidades")} disabled={saving}>
                  Voltar
                </button>
                {!isEditing ? (
                  <button className="btn btn-primary" onClick={enterEditMode} disabled={loading || saving}>
                    Editar
                  </button>
                ) : (
                  <>
                    <button className="btn btn-secondary" onClick={cancelEdit} disabled={saving}>
                      Cancelar
                    </button>
                    <button className="btn btn-success" onClick={() => void save()} disabled={!canSave}>
                      {saving ? "Salvando..." : "Salvar oportunidade"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {relatedLinks.map((l) => (
                <button
                  key={l.label}
                  type="button"
                  className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2.5 py-1 text-xs font-semibold hover:brightness-105"
                  onClick={() => openRelated(l.kind)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,2.2fr)_360px]">
            <div className="min-h-0 space-y-3">
              {err && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Detalhes da Oportunidade
                </div>
                <div className="bg-[rgb(var(--panel))]">
                  <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Conta</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        list={accountDatalistId}
                        value={accountQuery}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAccountQuery(next);
                          setAccountId(resolveAccountIdFromInput(next));
                        }}
                        onBlur={() => {
                          const resolved = resolveAccountIdFromInput(accountQuery);
                          setAccountId(resolved);
                          if (!resolved) return;
                          const selected = accounts.find((a) => a.id === resolved);
                          if (selected) setAccountQuery(accountOptionLabel(selected));
                        }}
                        placeholder="Digite para buscar por nome da conta"
                        disabled={loading || !isEditing}
                      />
                      <datalist id={accountDatalistId}>
                        {accounts.map((a) => (
                          <option key={a.id} value={accountOptionLabel(a)} />
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
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Etapa</label>
                      <select
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        disabled={loading || !isEditing}
                      >
                        {!opportunityStageValues.length && <option value="">Cadastre em Configurações &gt; Stages da Oportunidade</option>}
                        {opportunityStageValues.map((v) => (
                          <option key={v} value={v}>
                            {opportunityStageLabelByValue.get(v) || v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Valor</label>
                      <MoneyInput
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={amount}
                        onChange={setAmount}
                        min={0}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Data de fechamento</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        type="date"
                        value={closeDate}
                        onChange={(e) => setCloseDate(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Owner *</label>
                      <select
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={ownerId}
                        onChange={(e) => setOwnerId(e.target.value)}
                        disabled={loading || !isEditing}
                      >
                        <option value="">Selecione...</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {userLabel(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Campos customizados
                </div>
                <div className="bg-[rgb(var(--panel))] p-2.5">
                  <CustomFieldsForm
                    defs={defs}
                    values={customFields}
                    onChange={setCustomFields}
                    disabled={!isEditing || loading}
                    compact={true}
                  />
                </div>
              </section>
            </div>

            <aside className="space-y-3 xl:sticky xl:top-3 xl:h-fit">
              <ActivityPanel
                title="Atividades"
                scope={id ? { mode: "what", whatType: "opportunity", whatId: id } : null}
                accountId={accountId}
                users={users}
                defaultOwnerId={ownerId}
              />
            </aside>
          </div>
        </div>
      </section>

      {createQuoteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={closeCreateQuoteModal} aria-label="Fechar modal" />

          <section className="panel relative z-10 flex max-h-[calc(100vh-3rem)] w-[min(980px,100%)] flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none shadow-2xl">
            <header className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Oportunidade</div>
                  <div className="text-base font-semibold">Criar Cotação</div>
                  <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                    {name || opp?.name || "Oportunidade"} · {opp?.id || "—"}
                  </div>
                </div>
                <button className="btn btn-ghost -mr-2 -mt-2" onClick={closeCreateQuoteModal} aria-label="Fechar" disabled={createQuoteSaving}>
                  ✕
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[rgb(var(--panel))] p-4">
              {createQuoteErr && <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{createQuoteErr}</div>}

              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">Detalhes da Cotação</div>

                <div className="bg-[rgb(var(--panel))]">
                  <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Oportunidade</label>
                      <input className="input mt-1 w-full" value={name || opp?.name || ""} disabled />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">ID da oportunidade</label>
                      <input className="input mt-1 w-full" value={opp?.id || ""} disabled />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Nome *</label>
                      <input className="input mt-1 w-full" value={quoteName} onChange={(e) => setQuoteName(e.target.value)} disabled={createQuoteSaving} />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Status</label>
                      <select className="input mt-1 w-full" value={quoteStatus} onChange={(e) => setQuoteStatus(e.target.value)} disabled={createQuoteSaving}>
                        {QUOTE_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Owner *</label>
                      <select className="input mt-1 w-full" value={quoteOwnerId} onChange={(e) => setQuoteOwnerId(e.target.value)} disabled={createQuoteSaving}>
                        <option value="">Selecione...</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {userLabel(u)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Valor total (R$)</label>
                      <MoneyInput className="input mt-1 w-full" value={quoteTotalAmount} onChange={setQuoteTotalAmount} min={0} disabled={createQuoteSaving} />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Desconto (R$)</label>
                      <MoneyInput className="input mt-1 w-full" value={quoteDiscountAmount} onChange={setQuoteDiscountAmount} min={0} disabled={createQuoteSaving} />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Valor final (R$)</label>
                      <input className="input mt-1 w-full" type="text" value={formatMoneyBRL(quoteFinalAmount)} disabled />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Validade</label>
                      <input className="input mt-1 w-full" type="date" value={quoteValidUntil} onChange={(e) => setQuoteValidUntil(e.target.value)} disabled={createQuoteSaving} />
                    </div>

                  </div>
                </div>
              </section>
            </div>

            <footer className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <button className="btn btn-secondary" onClick={closeCreateQuoteModal} disabled={createQuoteSaving}>
                  Cancelar
                </button>
                <button className="btn btn-success !rounded-none" onClick={() => void createQuote()} disabled={!canCreateQuote}>
                  {createQuoteSaving ? "Salvando..." : "Salvar cotação"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {createOrderFormOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={closeCreateOrderFormModal} aria-label="Fechar modal" />

          <section className="panel relative z-10 flex max-h-[calc(100vh-3rem)] w-[min(980px,100%)] flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none shadow-2xl">
            <header className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Oportunidade</div>
                  <div className="text-base font-semibold">Criar Order Form</div>
                  <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                    {name || opp?.name || "Oportunidade"} · {opp?.id || "—"}
                  </div>
                </div>
                <button className="btn btn-ghost -mr-2 -mt-2" onClick={closeCreateOrderFormModal} aria-label="Fechar" disabled={createOrderFormSaving}>
                  ✕
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[rgb(var(--panel))] p-4">
              {createOrderFormErr && <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{createOrderFormErr}</div>}

              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">Detalhes do Order Form</div>

                <div className="bg-[rgb(var(--panel))]">
                  <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Oportunidade</label>
                      <input className="input mt-1 w-full" value={name || opp?.name || ""} disabled />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">ID da oportunidade</label>
                      <input className="input mt-1 w-full" value={opp?.id || ""} disabled />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Nome *</label>
                      <input className="input mt-1 w-full" value={orderFormName} onChange={(e) => setOrderFormName(e.target.value)} disabled={createOrderFormSaving} />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Status</label>
                      <select className="input mt-1 w-full" value={orderFormStatus} onChange={(e) => setOrderFormStatus(e.target.value)} disabled={createOrderFormSaving}>
                        {ORDER_FORM_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Owner *</label>
                      <select className="input mt-1 w-full" value={orderFormOwnerId} onChange={(e) => setOrderFormOwnerId(e.target.value)} disabled={createOrderFormSaving}>
                        <option value="">Selecione...</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {userLabel(u)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Valor total</label>
                      <MoneyInput className="input mt-1 w-full" value={orderFormTotalAmount} onChange={setOrderFormTotalAmount} min={0} disabled={createOrderFormSaving} />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Vigência inicial</label>
                      <input
                        className="input mt-1 w-full"
                        type="date"
                        value={orderFormEffectiveStartDate}
                        onChange={(e) => setOrderFormEffectiveStartDate(e.target.value)}
                        disabled={createOrderFormSaving}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Vigência final</label>
                      <input
                        className="input mt-1 w-full"
                        type="date"
                        value={orderFormEffectiveEndDate}
                        onChange={(e) => setOrderFormEffectiveEndDate(e.target.value)}
                        disabled={createOrderFormSaving}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="text-sm text-[rgb(var(--muted))]">Assinado em</label>
                      <input
                        className="input mt-1 w-full"
                        type="datetime-local"
                        value={orderFormSignedAtLocal}
                        onChange={(e) => setOrderFormSignedAtLocal(e.target.value)}
                        disabled={createOrderFormSaving}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={orderFormContractGenerated}
                          onChange={(e) => setOrderFormContractGenerated(e.target.checked)}
                          disabled={createOrderFormSaving}
                        />
                        Contrato gerado
                      </label>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-3 md:col-span-2">
                      <label className="text-sm text-[rgb(var(--muted))]">Observações</label>
                      <textarea
                        className="input mt-1 h-24 w-full"
                        value={orderFormNotes}
                        onChange={(e) => setOrderFormNotes(e.target.value)}
                        disabled={createOrderFormSaving}
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <footer className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <button className="btn btn-secondary" onClick={closeCreateOrderFormModal} disabled={createOrderFormSaving}>
                  Cancelar
                </button>
                <button className="btn btn-success !rounded-none" onClick={() => void createOrderForm()} disabled={!canCreateOrderForm}>
                  {createOrderFormSaving ? "Salvando..." : "Salvar order form"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <RelatedItemsModal
        open={relatedOpen}
        kind={relatedKind}
        accountId={accountId}
        accountLabel={selectedAccountName}
        opportunityId={opp?.id || id || ""}
        opportunityLabel={name || opp?.name || "Oportunidade"}
        onClose={() => setRelatedOpen(false)}
      />
    </div>
  );
}
