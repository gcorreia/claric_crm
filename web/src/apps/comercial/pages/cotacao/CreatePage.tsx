import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { useAuth } from "../../../../auth/AuthContext";
import { formatMoneyBRL, MoneyInput } from "../../components/MoneyInput";
import { createQuoteWithFallback } from "../../quotesApi";

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

function userLabel(u: UserOut): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
}

function opportunityOptionLabel(o: OpportunityOut): string {
  return `${o.name} · ${o.id}`;
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

const STATUS_OPTIONS = ["Draft", "In Review", "Approved", "Sent", "Accepted", "Rejected", "Expired"];

export function CotacaoCreatePage() {
  const nav = useNavigate();
  const { user } = useAuth();

  const opportunityDatalistId = "quote-create-opportunity-options";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const canSave = useMemo(() => !!opportunityId.trim() && !!name.trim() && !!ownerId.trim() && !saving, [opportunityId, name, ownerId, saving]);

  const opportunityLabelToId = useMemo(() => {
    const out = new Map<string, string>();
    for (const o of opportunities) out.set(opportunityOptionLabel(o), o.id);
    return out;
  }, [opportunities]);

  function resolveOpportunityIdFromInput(inputValue: string): string {
    const byLabel = opportunityLabelToId.get(inputValue);
    if (byLabel) return byLabel;

    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) return "";

    const exactByName = opportunities.filter((o) => o.name.trim().toLowerCase() === normalized);
    return exactByName.length === 1 ? exactByName[0].id : "";
  }

  useEffect(() => {
    if (user?.id) setOwnerId(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!opportunityId) return;
    const selected = opportunities.find((o) => o.id === opportunityId);
    if (selected) {
      setOpportunityQuery(opportunityOptionLabel(selected));
      if (!name.trim()) setName(`Cotação - ${selected.name}`);
      if (!totalAmount || totalAmount <= 0) setTotalAmount(Number(selected.amount || 0));
      return;
    }
    setOpportunityQuery(opportunityId);
  }, [opportunityId, opportunities]);

  useEffect(() => {
    const next = Math.max((Number(totalAmount) || 0) - (Number(discountAmount) || 0), 0);
    setFinalAmount(next);
  }, [totalAmount, discountAmount]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const [us, opps] = await Promise.all([
          apiFetch<UserOut[]>("/users", { signal: ac.signal } as any).catch(() => [] as UserOut[]),
          apiFetch<OpportunityOut[]>("/crm/opportunities", { signal: ac.signal } as any).catch(() => [] as OpportunityOut[]),
        ]);
        setUsers(us.filter((u) => u.is_active !== false));
        setOpportunities(Array.isArray(opps) ? opps : []);
      } catch (e) {
        if (isAbortError(e)) return;
        setErr(extractApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  async function save() {
    if (!canSave) return;

    setSaving(true);
    setErr(null);
    try {
      const payload: QuoteIn = {
        opportunity_id: opportunityId.trim(),
        name: name.trim(),
        status: status.trim() || "Draft",
        valid_until: validUntil.trim() ? validUntil.trim() : null,
        total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
        discount_amount: Number.isFinite(discountAmount) ? discountAmount : 0,
        final_amount: Number.isFinite(finalAmount) ? finalAmount : 0,
        owner_id: ownerId.trim(),
      };
      const created = await createQuoteWithFallback<QuoteOut>(payload);
      nav(`/apps/comercial/cotacoes/${created.id}`);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full min-h-0">
      <section className="panel flex h-full min-h-0 flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none">
        <header className="shrink-0 flex flex-col gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold">Nova Cotação</div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">Fluxo CPQ da oportunidade com valores em reais.</div>
          </div>

          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={() => nav("/apps/comercial/cotacoes")} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-success" onClick={() => void save()} disabled={!canSave}>
              {saving ? "Salvando..." : "Salvar cotação"}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {err && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

            <section className="overflow-hidden border-t border-[rgb(var(--border))]">
              <div className="sf-band bg-[#d1e1f8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">Detalhes da Cotação</div>

              <div className="bg-[rgb(var(--panel))]">
                <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Oportunidade *</label>
                    <input
                      className="input mt-1 w-full"
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
                      disabled={loading || saving}
                    />
                    <datalist id={opportunityDatalistId}>
                      {opportunities.map((o) => (
                        <option key={o.id} value={opportunityOptionLabel(o)} />
                      ))}
                    </datalist>
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Nome *</label>
                    <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} disabled={loading || saving} />
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Status</label>
                    <select className="input mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value)} disabled={loading || saving}>
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Owner *</label>
                    <select className="input mt-1 w-full" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={loading || saving}>
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
                    <MoneyInput className="input mt-1 w-full" value={totalAmount} onChange={setTotalAmount} min={0} disabled={loading || saving} />
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Desconto (R$)</label>
                    <MoneyInput className="input mt-1 w-full" value={discountAmount} onChange={setDiscountAmount} min={0} disabled={loading || saving} />
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Valor final (R$)</label>
                    <input className="input mt-1 w-full" type="text" value={formatMoneyBRL(finalAmount)} disabled />
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Validade</label>
                    <input className="input mt-1 w-full" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={loading || saving} />
                  </div>

                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
