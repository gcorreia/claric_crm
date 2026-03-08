import { useEffect, useMemo, useState } from "react";
import { apiFetch, type ApiError } from "../../lib/apiClient";
import { Card } from "../../ui/Card";
import { Modal } from "../../ui/Modal";

type Plan = {
  id: string;
  name: string;
  scope: "GLOBAL" | "TENANT";
  tenant_id?: string | null;
  based_on_plan_id?: string | null;
  limits: any;
};

type Contract = { tenant_id: string; plan: Plan };

type Limits = {
  general: { users: number | null; email_sender_profiles: number | null };
  apps: { comercial: { accounts: number | null; contacts: number | null; leads: number | null; opportunities: number | null } };
  policy?: { overage_percent?: number };
};

function asIntOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

function ensureLimits(x: any): Limits {
  const d: Limits = {
    general: { users: null, email_sender_profiles: null },
    apps: { comercial: { accounts: null, contacts: null, leads: null, opportunities: null } },
    policy: { overage_percent: 20 },
  };

  const src = x && typeof x === "object" ? x : {};
  d.general.users = typeof src?.general?.users === "number" ? src.general.users : null;
  d.general.email_sender_profiles =
    typeof src?.general?.email_sender_profiles === "number" ? src.general.email_sender_profiles : null;

  d.apps.comercial.accounts = typeof src?.apps?.comercial?.accounts === "number" ? src.apps.comercial.accounts : null;
  d.apps.comercial.contacts = typeof src?.apps?.comercial?.contacts === "number" ? src.apps.comercial.contacts : null;
  d.apps.comercial.leads = typeof src?.apps?.comercial?.leads === "number" ? src.apps.comercial.leads : null;
  d.apps.comercial.opportunities =
    typeof src?.apps?.comercial?.opportunities === "number" ? src.apps.comercial.opportunities : null;

  d.policy = { overage_percent: typeof src?.policy?.overage_percent === "number" ? src.policy.overage_percent : 20 };
  return d;
}

function formatLimit(n: number | null | undefined): string {
  if (n === null || typeof n === "undefined") return "Sem limite";
  return String(n);
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-[rgb(var(--muted))]">{props.label}</div>
      {props.hint ? <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))] opacity-80">{props.hint}</div> : null}
      <div className="mt-1">{props.children}</div>
    </div>
  );
}

function SectionTitle(props: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold">{props.title}</div>
      {props.subtitle ? <div className="mt-0.5 text-xs text-[rgb(var(--muted))]">{props.subtitle}</div> : null}
    </div>
  );
}

export function ContractPage(props: { tenantId?: string; embedded?: boolean }) {
  const tenantId = props.tenantId;
  const embedded = !!props.embedded;

  const withTenant = (url: string) => {
    if (!tenantId) return url;
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}tenant_id=${encodeURIComponent(tenantId)}`;
  };

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [current, setCurrent] = useState<Contract | null>(null);
  const [globals, setGlobals] = useState<Plan[]>([]);
  const [customs, setCustoms] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const selectedPlan = useMemo(() => {
    const all = [...globals, ...customs];
    return all.find((p) => p.id === selectedPlanId) ?? null;
  }, [globals, customs, selectedPlanId]);

  const [draft, setDraft] = useState<Limits>(() => ensureLimits(null));

  const [createOpen, setCreateOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanBase, setNewPlanBase] = useState<string>("");

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const [c, g, t] = await Promise.all([
        apiFetch<Contract>(withTenant("/contracts/current")),
        apiFetch<Plan[]>("/contracts/plans?scope=GLOBAL"),
        apiFetch<Plan[]>(withTenant("/contracts/plans?scope=TENANT")),
      ]);
      setCurrent(c);
      setGlobals(g);
      setCustoms(t);

      const initialId = c?.plan?.id ?? g?.[0]?.id ?? "";
      setSelectedPlanId(initialId);
      setDraft(ensureLimits(c?.plan?.limits));
      setNewPlanBase(g?.[0]?.id ?? "");
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao carregar contrato");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedPlan) return;
    setDraft(ensureLimits(selectedPlan.limits));
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function applySelected() {
    if (!selectedPlanId) return;
    setErr(null);
    try {
      const updated = await apiFetch<Contract>("/contracts/apply", {
        method: "PUT",
        csrf: true,
        body: tenantId ? { plan_id: selectedPlanId, tenant_id: tenantId } : { plan_id: selectedPlanId },
      });
      setCurrent(updated);
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao aplicar plano");
    }
  }

  async function savePlan() {
    if (!selectedPlan) return;
    setErr(null);
    try {
      const updated = await apiFetch<Plan>(`/contracts/plans/${selectedPlan.id}`, {
        method: "PUT",
        csrf: true,
        body: { limits: draft, name: selectedPlan.name },
      });

      if (updated.scope === "GLOBAL") {
        setGlobals((xs) => xs.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        setCustoms((xs) => xs.map((p) => (p.id === updated.id ? updated : p)));
      }
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao salvar plano");
    }
  }

  async function createCustomPlan() {
    const name = newPlanName.trim();
    if (!name) return;
    if (!newPlanBase) return;

    setErr(null);
    try {
      const created = await apiFetch<Plan>("/contracts/plans", {
        method: "POST",
        csrf: true,
        body: { name, scope: "TENANT", based_on_plan_id: newPlanBase },
      });

      setCustoms((xs) => [...xs, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedPlanId(created.id);
      setNewPlanName("");
      setCreateOpen(false);
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao criar plano customizado");
    }
  }

  const appliedName = current?.plan?.name ?? "—";
  const isRootContext = !!tenantId;
  const headerSubtitle = embedded
    ? "Configure limites de uso por plano (global ou customizado)."
    : "Configure limites de uso do tenant por plano (global ou customizado).";

  const planSummary = selectedPlan
    ? {
        users: formatLimit(draft.general.users),
        accounts: formatLimit(draft.apps.comercial.accounts),
        contacts: formatLimit(draft.apps.comercial.contacts),
        leads: formatLimit(draft.apps.comercial.leads),
        opportunities: formatLimit(draft.apps.comercial.opportunities),
        overage: `${draft.policy?.overage_percent ?? 20}%`,
      }
    : null;

  return (
    <div className="space-y-4">
      <Card title="Contrato" subtitle={headerSubtitle}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px]">
              <div className="text-xs font-semibold text-[rgb(var(--muted))]">Plano aplicado</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2.5 py-1 text-sm font-semibold">
                  {appliedName}
                </span>
                {selectedPlan?.scope === "TENANT" ? <span className="chip">Custom</span> : <span className="chip">Global</span>}
              </div>
            </div>

            <div className="min-w-[300px]">
              <div className="text-xs font-semibold text-[rgb(var(--muted))]">Selecionar plano</div>
              <select
                className="input mt-1"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                disabled={loading}
              >
                <optgroup label="Globais">
                  {globals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Custom do tenant">
                  {customs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <button className="btn btn-primary" onClick={() => void applySelected()} disabled={!selectedPlanId || loading}>
              Aplicar plano
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => setCreateOpen(true)}
              disabled={loading || globals.length === 0 || !isRootContext}
              title={!isRootContext ? "Selecione um tenant para criar um plano customizado" : undefined}
            >
              Criar plano customizado
            </button>
          </div>
        </div>

        {err ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </Card>

      <Card title="Limites do plano" subtitle={selectedPlan ? `Editando: ${selectedPlan.name}` : "Selecione um plano"}>
        {loading ? (
          <div className="text-sm text-[rgb(var(--muted))]">Carregando…</div>
        ) : !selectedPlan ? (
          <div className="text-sm text-[rgb(var(--muted))]">Nenhum plano selecionado.</div>
        ) : (
          <>
            <div className="panel-2 rounded-2xl p-4">
              <SectionTitle title="Resumo" subtitle="Visão rápida do que este plano libera. Edite abaixo e salve." />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-3">
                  <div className="text-xs font-semibold text-[rgb(var(--muted))]">Usuários</div>
                  <div className="mt-1 text-sm font-semibold">{planSummary?.users}</div>
                </div>
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-3">
                  <div className="text-xs font-semibold text-[rgb(var(--muted))]">Leads</div>
                  <div className="mt-1 text-sm font-semibold">{planSummary?.leads}</div>
                </div>
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-3">
                  <div className="text-xs font-semibold text-[rgb(var(--muted))]">Tolerância excedente</div>
                  <div className="mt-1 text-sm font-semibold">{planSummary?.overage}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="panel-2 rounded-2xl p-4 lg:col-span-2">
                <SectionTitle title="Aplicativo · Comercial" subtitle="Limites por entidade. Deixe vazio para sem limite." />
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      ["accounts", "Contas"],
                      ["contacts", "Contatos"],
                      ["leads", "Leads"],
                      ["opportunities", "Oportunidades"],
                    ] as const
                  ).map(([k, label]) => (
                    <div key={k} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-3">
                      <Field label={label}>
                        <input
                          className="input"
                          value={(draft.apps.comercial as any)[k] ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              apps: { ...d.apps, comercial: { ...d.apps.comercial, [k]: asIntOrNull(e.target.value) } as any },
                            }))
                          }
                          placeholder="Sem limite"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="panel-2 rounded-2xl p-4">
                  <SectionTitle title="Geral" />
                  <div className="space-y-3">
                    <Field label="Usuários" hint="Vazio = sem limite">
                      <input
                        className="input"
                        value={draft.general.users ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, general: { ...d.general, users: asIntOrNull(e.target.value) } }))}
                        placeholder="Sem limite"
                        inputMode="numeric"
                      />
                    </Field>

                    <Field label="Perfis de remetente (em breve)" hint="Vazio = sem limite">
                      <input
                        className="input"
                        value={draft.general.email_sender_profiles ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            general: { ...d.general, email_sender_profiles: asIntOrNull(e.target.value) },
                          }))
                        }
                        placeholder="Sem limite"
                        inputMode="numeric"
                      />
                    </Field>
                  </div>
                </div>

                <div className="panel-2 rounded-2xl p-4">
                  <SectionTitle title="Política" subtitle="Regras para excedente e controle de consumo." />
                  <Field label="Tolerância de excedente (%)">
                    <input
                      className="input"
                      value={draft.policy?.overage_percent ?? 20}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          policy: { ...(d.policy ?? {}), overage_percent: asIntOrNull(e.target.value) ?? 20 },
                        }))
                      }
                      inputMode="numeric"
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => void loadAll()} disabled={loading}>
                Recarregar
              </button>
              <button className="btn btn-primary" onClick={() => void savePlan()}>
                Salvar limites
              </button>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Criar plano customizado"
        onClose={() => {
          setCreateOpen(false);
          setNewPlanName("");
        }}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void createCustomPlan()} disabled={!newPlanName.trim() || !newPlanBase}>
              Criar plano
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-4">
            <SectionTitle title="Detalhes" subtitle="O plano customizado herda os limites do plano base e você pode ajustar depois." />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do plano" hint="Ex.: Gold + Leads">
                <input className="input" value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} placeholder="Nome" />
              </Field>

              <Field label="Baseado em">
                <select className="input" value={newPlanBase} onChange={(e) => setNewPlanBase(e.target.value)}>
                  {globals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4 text-xs text-[rgb(var(--muted))]">
              Dica: após criar, selecione o plano e ajuste os limites na seção “Limites do plano”.
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}