import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { MoneyInput } from "../../components/MoneyInput";
import { getOrderFormWithFallback, patchOrderFormWithFallback } from "../../orderformsApi";

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

type OrderFormOut = {
  id: string;
  opportunity_id: string;
  account_id: string | null;
  name: string;
  status: string;
  effective_start_date: string | null;
  effective_end_date: string | null;
  total_amount: number;
  currency: string;
  signed_at: string | null;
  contract_generated: boolean;
  owner_id: string;
  owner_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type OrderFormPatch = {
  opportunity_id: string;
  name: string;
  status: string;
  effective_start_date: string | null;
  effective_end_date: string | null;
  total_amount: number;
  signed_at: string | null;
  contract_generated: boolean;
  owner_id: string;
  notes: string;
};

function userLabel(u: UserOut): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
}

function opportunityOptionLabel(o: OpportunityOut): string {
  return `${o.name} · ${o.id}`;
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

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
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

const STATUS_OPTIONS = ["Draft", "Sent", "Signed", "Cancelled"];

export function OrderFormDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const opportunityDatalistId = "order-form-detail-opportunity-options";

  const [orderForm, setOrderForm] = useState<OrderFormOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  const [opportunityId, setOpportunityId] = useState("");
  const [opportunityQuery, setOpportunityQuery] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Draft");
  const [effectiveStartDate, setEffectiveStartDate] = useState("");
  const [effectiveEndDate, setEffectiveEndDate] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const currency = "BRL";
  const [signedAtLocal, setSignedAtLocal] = useState("");
  const [contractGenerated, setContractGenerated] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [chatterDraft, setChatterDraft] = useState("");

  const [users, setUsers] = useState<UserOut[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityOut[]>([]);

  const [snapshot, setSnapshot] = useState<OrderFormPatch | null>(null);

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
    return orderForm?.owner_name || ownerId;
  }, [ownerId, orderForm?.owner_name, users]);

  const activities = useMemo(
    () => [
      {
        title: "Order Form criado",
        when: formatDateTime(orderForm?.created_at),
        detail: orderForm?.id ? `Registro ${orderForm.id}` : "Registro de order form",
      },
      {
        title: "Última atualização",
        when: formatDateTime(orderForm?.updated_at),
        detail: orderForm?.owner_name ? `Atualizado por ${orderForm.owner_name}` : "Atualização de dados",
      },
      {
        title: "Assinatura",
        when: formatDateTime(orderForm?.signed_at),
        detail: orderForm?.signed_at ? "Documento assinado" : "Aguardando assinatura",
      },
    ],
    [orderForm?.created_at, orderForm?.id, orderForm?.owner_name, orderForm?.updated_at, orderForm?.signed_at],
  );

  function resolveOpportunityIdFromInput(inputValue: string): string {
    const byLabel = opportunityLabelToId.get(inputValue);
    if (byLabel) return byLabel;

    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) return "";

    const exactByName = opportunities.filter((o) => o.name.trim().toLowerCase() === normalized);
    return exactByName.length === 1 ? exactByName[0].id : "";
  }

  async function loadAll(signal?: AbortSignal) {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const [ofData, usersData, opportunitiesData] = await Promise.all([
        getOrderFormWithFallback<OrderFormOut>(id),
        apiFetch<UserOut[]>("/users", { signal } as any).catch(() => [] as UserOut[]),
        apiFetch<OpportunityOut[]>("/crm/opportunities", { signal } as any).catch(() => [] as OpportunityOut[]),
      ]);

      setOrderForm(ofData);
      setUsers(usersData.filter((u) => u.is_active !== false));
      setOpportunities(Array.isArray(opportunitiesData) ? opportunitiesData : []);

      setOpportunityId(ofData.opportunity_id ?? "");
      setName(ofData.name ?? "");
      setStatus(ofData.status ?? "Draft");
      setEffectiveStartDate(ofData.effective_start_date ?? "");
      setEffectiveEndDate(ofData.effective_end_date ?? "");
      setTotalAmount(typeof ofData.total_amount === "number" ? ofData.total_amount : Number(ofData.total_amount || 0));
      setSignedAtLocal(ofData.signed_at ? fromIsoToDatetimeLocal(ofData.signed_at) : "");
      setContractGenerated(Boolean(ofData.contract_generated));
      setOwnerId(ofData.owner_id ?? "");
      setNotes(ofData.notes ?? "");

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

  function enterEditMode() {
    setErr(null);
    setSnapshot({
      opportunity_id: opportunityId,
      name,
      status,
      effective_start_date: effectiveStartDate || null,
      effective_end_date: effectiveEndDate || null,
      total_amount: totalAmount,
      signed_at: signedAtLocal ? toDatetimeIso(signedAtLocal) : null,
      contract_generated: contractGenerated,
      owner_id: ownerId,
      notes,
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    if (snapshot) {
      setOpportunityId(snapshot.opportunity_id);
      setName(snapshot.name);
      setStatus(snapshot.status);
      setEffectiveStartDate(snapshot.effective_start_date ?? "");
      setEffectiveEndDate(snapshot.effective_end_date ?? "");
      setTotalAmount(snapshot.total_amount);
      setSignedAtLocal(snapshot.signed_at ? fromIsoToDatetimeLocal(snapshot.signed_at) : "");
      setContractGenerated(snapshot.contract_generated);
      setOwnerId(snapshot.owner_id);
      setNotes(snapshot.notes);
    }
    setErr(null);
    setIsEditing(false);
    setSnapshot(null);
  }

  async function save() {
    if (!id || !canSave) return;

    if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
      setErr("A data final de vigência deve ser maior ou igual à data inicial.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const payload = {
        opportunity_id: opportunityId.trim(),
        name: name.trim(),
        status: status.trim() || "Draft",
        effective_start_date: effectiveStartDate.trim() ? effectiveStartDate.trim() : null,
        effective_end_date: effectiveEndDate.trim() ? effectiveEndDate.trim() : null,
        total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
        currency: "BRL",
        signed_at: signedAtLocal ? toDatetimeIso(signedAtLocal) : null,
        contract_generated: contractGenerated,
        owner_id: ownerId.trim(),
        notes: notes.trim(),
      };
      const updated = await patchOrderFormWithFallback<OrderFormOut>(id, payload);

      setOrderForm(updated);
      setOpportunityId(updated.opportunity_id ?? "");
      setName(updated.name ?? "");
      setStatus(updated.status ?? "Draft");
      setEffectiveStartDate(updated.effective_start_date ?? "");
      setEffectiveEndDate(updated.effective_end_date ?? "");
      setTotalAmount(typeof updated.total_amount === "number" ? updated.total_amount : Number(updated.total_amount || 0));
      setSignedAtLocal(updated.signed_at ? fromIsoToDatetimeLocal(updated.signed_at) : "");
      setContractGenerated(Boolean(updated.contract_generated));
      setOwnerId(updated.owner_id ?? "");
      setNotes(updated.notes ?? "");

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
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Order Form</div>
              <div className="text-lg font-semibold md:text-xl">{loading ? "Carregando..." : name || orderForm?.name || "Order Form"}</div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                ID: {orderForm?.id || "—"} · Oportunidade: {selectedOpportunityName} · Owner: {ownerSummary}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-secondary" onClick={() => nav("/apps/comercial/order-forms")} disabled={saving}>
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
                    {saving ? "Salvando..." : "Salvar order form"}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,2.2fr)_350px]">
            <div className="min-h-0 space-y-3">
              {err && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Detalhes do Order Form</div>
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
                      <select
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        disabled={loading || !isEditing}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
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

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Valor total</label>
                      <MoneyInput
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={totalAmount}
                        onChange={setTotalAmount}
                        min={0}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Moeda</label>
                      <input className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm" maxLength={3} value={currency} disabled />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Vigência inicial</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        type="date"
                        value={effectiveStartDate}
                        onChange={(e) => setEffectiveStartDate(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Vigência final</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        type="date"
                        value={effectiveEndDate}
                        onChange={(e) => setEffectiveEndDate(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Assinado em</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        type="datetime-local"
                        value={signedAtLocal}
                        onChange={(e) => setSignedAtLocal(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={contractGenerated}
                          onChange={(e) => setContractGenerated(e.target.checked)}
                          disabled={loading || !isEditing}
                        />
                        Contrato gerado
                      </label>
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5 md:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Observações</label>
                      <textarea
                        className="input mt-1 min-h-[100px] w-full rounded-md px-2 py-1.5 text-sm"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-3">
              <section className="overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Atividades</div>
                <div className="space-y-2 p-3">
                  {activities.map((a) => (
                    <div key={a.title} className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2.5 py-2">
                      <div className="text-xs font-semibold">{a.title}</div>
                      <div className="mt-0.5 text-xs text-[rgb(var(--muted))]">{a.detail}</div>
                      <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">{a.when}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Chatter</div>
                <div className="p-3">
                  <textarea
                    className="input min-h-[100px] w-full rounded-md"
                    value={chatterDraft}
                    onChange={(e) => setChatterDraft(e.target.value)}
                    placeholder="Compartilhe uma atualização sobre este order form..."
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-[rgb(var(--muted))]">Módulo de integração em preparação.</div>
                    <button className="btn btn-secondary" disabled>
                      Publicar
                    </button>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
