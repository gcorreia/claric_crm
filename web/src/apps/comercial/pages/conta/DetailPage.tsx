import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { ActivityPanel } from "../../components/ActivityPanel";
import {
  CustomFieldsBySession,
  type CustomFieldDef,
  type CustomFieldSession,
} from "../../components/CustomFieldsBySession";
import { listOrderFormsWithFallback } from "../../orderformsApi";

type AccountOut = {
  id: string;
  name: string;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
  custom_fields: Record<string, any>;
};

type UserOut = {
  id: string;
  name?: string | null;
  email: string;
};

type RelatedKind = "contacts" | "leads" | "opportunities" | "order_forms" | "contract";

type RelatedContact = {
  id: string;
  account_id: string;
  name: string;
  external_id: string;
  contact_role: string;
  owner_id: string;
  owner_name?: string | null;
  updated_at?: string | null;
};

type RelatedLead = {
  id: string;
  account_id: string;
  name: string;
  status?: string | null;
  source?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  updated_at?: string | null;
};

type RelatedOpportunity = {
  id: string;
  account_id: string | null;
  name: string;
  stage: string;
  amount: number;
  close_date: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  updated_at?: string | null;
};

type RelatedOrderForm = {
  id: string;
  opportunity_id: string;
  account_id: string | null;
  name: string;
  status: string;
  total_amount: number;
  currency: string;
  signed_at?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  updated_at?: string | null;
};

type ContractCurrent = {
  tenant_id: string;
  plan: {
    id: string;
    name: string;
    scope: "GLOBAL" | "TENANT";
    limits?: any;
  };
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

function formatMoney(v?: number | null): string {
  if (typeof v !== "number") return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatLimit(v: any): string {
  if (typeof v === "number") return String(v);
  return "Sem limite";
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

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function ContaDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [customDefs, setCustomDefs] = useState<CustomFieldDef[]>([]);
  const [customSessions, setCustomSessions] = useState<CustomFieldSession[]>([]);
  const [row, setRow] = useState<AccountOut | null>(null);

  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");

  const [users, setUsers] = useState<UserOut[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedKind, setRelatedKind] = useState<RelatedKind>("contacts");
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedErr, setRelatedErr] = useState<string | null>(null);
  const [relatedQuery, setRelatedQuery] = useState("");
  const [relatedContacts, setRelatedContacts] = useState<RelatedContact[] | null>(null);
  const [relatedLeads, setRelatedLeads] = useState<RelatedLead[] | null>(null);
  const [relatedOpportunities, setRelatedOpportunities] = useState<RelatedOpportunity[] | null>(null);
  const [relatedOrderForms, setRelatedOrderForms] = useState<RelatedOrderForm[] | null>(null);
  const [relatedContract, setRelatedContract] = useState<ContractCurrent | null>(null);

  const requiredMissing = useMemo(() => missingRequired(customDefs, customValues), [customDefs, customValues]);
  const accountLabel = name || row?.name || "Conta";
  const accountKey = row?.id || id || "";

  const ownerLabel = useMemo(() => {
    if (!ownerId) return "—";
    const u = users.find((x) => x.id === ownerId);
    return (u?.name || u?.email || "—").trim();
  }, [ownerId, users]);

  const relatedLinks = useMemo(
    () => [
      { label: "Contatos", kind: "contacts" as RelatedKind },
      { label: "Leads", kind: "leads" as RelatedKind },
      { label: "Oportunidades", kind: "opportunities" as RelatedKind },
      { label: "Order Forms", kind: "order_forms" as RelatedKind },
      { label: "Contrato", kind: "contract" as RelatedKind },
    ],
    [],
  );

  const relatedTitle = useMemo(() => {
    if (relatedKind === "contacts") return "Contatos";
    if (relatedKind === "leads") return "Leads";
    if (relatedKind === "opportunities") return "Oportunidades";
    if (relatedKind === "order_forms") return "Order Forms";
    return "Contrato";
  }, [relatedKind]);

  async function loadRelated(kind: RelatedKind) {
    if (!accountKey && kind !== "contract") {
      setRelatedErr("Conta não carregada para filtrar itens relacionados.");
      return;
    }

    if (kind === "contacts" && relatedContacts) return;
    if (kind === "leads" && relatedLeads) return;
    if (kind === "opportunities" && relatedOpportunities) return;
    if (kind === "order_forms" && relatedOrderForms) return;
    if (kind === "contract" && relatedContract) return;

    setRelatedLoading(true);
    setRelatedErr(null);
    try {
      if (kind === "contacts") {
        const rows = await apiFetch<RelatedContact[]>("/crm/contacts");
        setRelatedContacts((rows || []).filter((r) => r.account_id === accountKey));
        return;
      }
      if (kind === "leads") {
        const rows = await apiFetch<RelatedLead[]>("/crm/leads");
        setRelatedLeads((rows || []).filter((r) => r.account_id === accountKey));
        return;
      }
      if (kind === "opportunities") {
        const rows = await apiFetch<RelatedOpportunity[]>("/crm/opportunities");
        setRelatedOpportunities((rows || []).filter((r) => (r.account_id || "") === accountKey));
        return;
      }
      if (kind === "order_forms") {
        const rows = await listOrderFormsWithFallback<RelatedOrderForm[]>();
        setRelatedOrderForms((rows || []).filter((r) => (r.account_id || "") === accountKey));
        return;
      }

      const c = await apiFetch<ContractCurrent>("/contracts/current");
      setRelatedContract(c);
    } catch (e: any) {
      setRelatedErr(String(e?.message || e));
    } finally {
      setRelatedLoading(false);
    }
  }

  function openRelated(kind: RelatedKind) {
    setRelatedKind(kind);
    setRelatedQuery("");
    setRelatedOpen(true);
    void loadRelated(kind);
  }

  function closeRelated() {
    setRelatedOpen(false);
    setRelatedErr(null);
    setRelatedQuery("");
  }

  function openRelatedListPage() {
    if (relatedKind === "contacts") {
      nav("/comercial/contatos");
      closeRelated();
      return;
    }
    if (relatedKind === "leads") {
      nav("/comercial/leads");
      closeRelated();
      return;
    }
    if (relatedKind === "opportunities") {
      nav("/comercial/oportunidades");
      closeRelated();
      return;
    }
    if (relatedKind === "order_forms") {
      nav("/comercial/order-forms");
      closeRelated();
      return;
    }
    nav("/settings/root/business-units");
    closeRelated();
  }

  const filteredContacts = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    const rows = relatedContacts || [];
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.contact_role || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q) ||
        (r.external_id || "").toLowerCase().includes(q)
      );
    });
  }, [relatedContacts, relatedQuery]);

  const filteredLeads = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    const rows = relatedLeads || [];
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.source || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q)
      );
    });
  }, [relatedLeads, relatedQuery]);

  const filteredOpportunities = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    const rows = relatedOpportunities || [];
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.stage || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q)
      );
    });
  }, [relatedOpportunities, relatedQuery]);

  const filteredOrderForms = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    const rows = relatedOrderForms || [];
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q) ||
        (r.opportunity_id || "").toLowerCase().includes(q)
      );
    });
  }, [relatedOrderForms, relatedQuery]);

  const relatedCount = useMemo(() => {
    if (relatedKind === "contacts") return filteredContacts.length;
    if (relatedKind === "leads") return filteredLeads.length;
    if (relatedKind === "opportunities") return filteredOpportunities.length;
    if (relatedKind === "order_forms") return filteredOrderForms.length;
    return relatedContract ? 1 : 0;
  }, [filteredContacts.length, filteredLeads.length, filteredOpportunities.length, filteredOrderForms.length, relatedContract, relatedKind]);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [sessions, defs, acc, us] = await Promise.all([
          apiFetch<CustomFieldSession[]>(`/crm/provisioning/field-sessions?entity_type=account`, {
            signal: ctrl.signal,
          } as any).catch(() => [] as CustomFieldSession[]),
          apiFetch<CustomFieldDef[]>(`/crm/provisioning/fields?entity_type=account`, { signal: ctrl.signal } as any),
          apiFetch<AccountOut>(`/crm/accounts/${id}`, { signal: ctrl.signal } as any),
          apiFetch<UserOut[]>("/users", { signal: ctrl.signal } as any).catch(() => [] as UserOut[]),
        ]);

        setCustomSessions(sessions || []);
        setCustomDefs((defs || []).filter((d) => d.is_active));
        setRow(acc);
        setUsers(us || []);

        setName(acc.name || "");
        setOwnerId(acc.owner_id || "");
        setCustomValues(acc.custom_fields || {});
      } catch (e: any) {
        if (isAbortError(e)) return;
        setErr(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [id]);

  useEffect(() => {
    setRelatedContacts(null);
    setRelatedLeads(null);
    setRelatedOpportunities(null);
    setRelatedOrderForms(null);
  }, [accountKey]);

  async function save() {
    if (!id) return;

    setErr(null);

    if (!name.trim()) {
      setErr("Nome é obrigatório.");
      return;
    }

    if (requiredMissing.length) {
      setErr(`Preencha os campos obrigatórios: ${requiredMissing.join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/crm/accounts/${id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          owner_id: ownerId || null,
          custom_fields: customValues,
        },
        csrf: true,
      });
      nav("/comercial/contas");
    } catch (e: any) {
      setErr(String(e?.message || e));
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
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Conta</div>
              <div className="text-lg font-semibold md:text-xl">{loading ? "Carregando conta..." : name || row?.name || "Conta"}</div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                ID: {row?.id || "—"} · Owner: {ownerLabel} · Atualizado em {formatDateTime(row?.updated_at)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="btn btn-secondary" onClick={() => nav("/comercial/contas")} disabled={saving}>
                Voltar
              </button>
              <button className="btn btn-success" onClick={save} disabled={saving || loading}>
                {saving ? "Salvando..." : "Salvar conta"}
              </button>
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
          <div className="grid min-h-full grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,2.2fr)_350px]">
            <div className="min-h-0 space-y-3">
              {err && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

              <section className="overflow-hidden border-t border-[rgb(var(--border))]">
                <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Detalhes da Conta
                </div>

                <div className="bg-[rgb(var(--panel))]">
                  <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Nome *</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={loading || saving}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Owner</label>
                      <select
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={ownerId}
                        onChange={(e) => setOwnerId(e.target.value)}
                        disabled={!users.length || loading || saving}
                        title={!users.length ? "Sem permissão para listar usuários ou lista vazia." : ""}
                      >
                        <option value="">—</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {(u.name || u.email || u.id).trim()}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <div className="border-t border-[rgb(var(--border))]">
                {loading ? (
                  <div className="px-2 py-3 text-sm text-[rgb(var(--muted))]">Carregando campos da conta...</div>
                ) : (
                  <CustomFieldsBySession
                    sessions={customSessions}
                    defs={customDefs}
                    values={customValues}
                    onChange={setCustomValues}
                    mode="edit"
                    emptyLabel="Nenhum campo customizado ativo para Conta."
                    defaultExpanded={true}
                    variant="salesforce"
                    compact={true}
                  />
                )}
              </div>
            </div>

            <aside className="space-y-3">
              <ActivityPanel
                title="Atividades"
                scope={accountKey ? { mode: "what", whatType: "account", whatId: accountKey } : null}
                accountId={accountKey}
                users={users}
                defaultOwnerId={ownerId}
              />
            </aside>
          </div>
        </div>
      </section>

      {relatedOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={closeRelated} aria-label="Fechar modal" />

          <section className="panel relative z-10 flex max-h-[calc(100vh-3rem)] w-[min(1100px,100%)] flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none shadow-2xl">
            <header className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Relacionados</div>
                  <div className="text-base font-semibold">
                    {relatedTitle} ({relatedCount})
                  </div>
                  <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                    Conta: {accountLabel} · {accountKey || "—"}
                  </div>
                </div>
                <button className="btn btn-ghost -mr-2 -mt-2" onClick={closeRelated} aria-label="Fechar">
                  ✕
                </button>
              </div>
            </header>

            {relatedKind !== "contract" && (
              <div className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-2">
                <input
                  className="input h-9 w-full rounded-md px-2 py-1.5 text-sm"
                  value={relatedQuery}
                  onChange={(e) => setRelatedQuery(e.target.value)}
                  placeholder={`Buscar em ${relatedTitle.toLowerCase()}...`}
                />
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto bg-[rgb(var(--panel))]">
              {relatedErr && <div className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{relatedErr}</div>}

              {!relatedErr && relatedLoading && (
                <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Carregando itens relacionados...</div>
              )}

              {!relatedErr && !relatedLoading && relatedKind === "contacts" && (
                filteredContacts.length ? (
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[rgb(var(--panel-2))] text-left text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                      <tr>
                        <th className="px-3 py-2">Contato</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Atualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map((r) => (
                        <tr key={r.id} className="border-t border-[rgb(var(--border))] hover:bg-[rgb(var(--panel-2))]">
                          <td className="px-3 py-2">
                            <button
                              className="font-medium hover:underline"
                              onClick={() => {
                                nav(`/apps/comercial/contatos/${r.id}`);
                                closeRelated();
                              }}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="px-3 py-2">{r.contact_role || "—"}</td>
                          <td className="px-3 py-2">{r.owner_name || r.owner_id || "—"}</td>
                          <td className="px-3 py-2">{formatDateTime(r.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Nenhum contato vinculado a esta conta.</div>
                )
              )}

              {!relatedErr && !relatedLoading && relatedKind === "leads" && (
                filteredLeads.length ? (
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[rgb(var(--panel-2))] text-left text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                      <tr>
                        <th className="px-3 py-2">Lead</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Origem</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Atualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((r) => (
                        <tr key={r.id} className="border-t border-[rgb(var(--border))] hover:bg-[rgb(var(--panel-2))]">
                          <td className="px-3 py-2">
                            <button
                              className="font-medium hover:underline"
                              onClick={() => {
                                nav(`/apps/comercial/leads/${r.id}`);
                                closeRelated();
                              }}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="px-3 py-2">{r.status || "—"}</td>
                          <td className="px-3 py-2">{r.source || "—"}</td>
                          <td className="px-3 py-2">{r.owner_name || r.owner_id || "—"}</td>
                          <td className="px-3 py-2">{formatDateTime(r.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Nenhum lead vinculado a esta conta.</div>
                )
              )}

              {!relatedErr && !relatedLoading && relatedKind === "opportunities" && (
                filteredOpportunities.length ? (
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[rgb(var(--panel-2))] text-left text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                      <tr>
                        <th className="px-3 py-2">Oportunidade</th>
                        <th className="px-3 py-2">Etapa</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2">Fechamento</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Atualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOpportunities.map((r) => (
                        <tr key={r.id} className="border-t border-[rgb(var(--border))] hover:bg-[rgb(var(--panel-2))]">
                          <td className="px-3 py-2">
                            <button
                              className="font-medium hover:underline"
                              onClick={() => {
                                nav(`/apps/comercial/oportunidades/${r.id}`);
                                closeRelated();
                              }}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="px-3 py-2">{r.stage || "—"}</td>
                          <td className="px-3 py-2">{formatMoney(r.amount)}</td>
                          <td className="px-3 py-2">{formatDate(r.close_date)}</td>
                          <td className="px-3 py-2">{r.owner_name || r.owner_id || "—"}</td>
                          <td className="px-3 py-2">{formatDateTime(r.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Nenhuma oportunidade vinculada a esta conta.</div>
                )
              )}

              {!relatedErr && !relatedLoading && relatedKind === "order_forms" && (
                filteredOrderForms.length ? (
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[rgb(var(--panel-2))] text-left text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                      <tr>
                        <th className="px-3 py-2">Order Form</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Oportunidade</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Assinado em</th>
                        <th className="px-3 py-2">Atualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrderForms.map((r) => (
                        <tr key={r.id} className="border-t border-[rgb(var(--border))] hover:bg-[rgb(var(--panel-2))]">
                          <td className="px-3 py-2">
                            <button
                              className="font-medium hover:underline"
                              onClick={() => {
                                nav(`/apps/comercial/order-forms/${r.id}`);
                                closeRelated();
                              }}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="px-3 py-2">{r.status || "—"}</td>
                          <td className="px-3 py-2">{r.opportunity_id || "—"}</td>
                          <td className="px-3 py-2">{formatMoney(r.total_amount)}</td>
                          <td className="px-3 py-2">{r.owner_name || r.owner_id || "—"}</td>
                          <td className="px-3 py-2">{formatDateTime(r.signed_at)}</td>
                          <td className="px-3 py-2">{formatDateTime(r.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Nenhum order form vinculado a esta conta.</div>
                )
              )}

              {!relatedErr && !relatedLoading && relatedKind === "contract" && (
                relatedContract ? (
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[rgb(var(--panel-2))] text-left text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                      <tr>
                        <th className="px-3 py-2">Plano</th>
                        <th className="px-3 py-2">Escopo</th>
                        <th className="px-3 py-2">Limite contas</th>
                        <th className="px-3 py-2">Limite contatos</th>
                        <th className="px-3 py-2">Limite leads</th>
                        <th className="px-3 py-2">Limite oportunidades</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[rgb(var(--border))]">
                        <td className="px-3 py-2 font-medium">{relatedContract.plan?.name || "—"}</td>
                        <td className="px-3 py-2">{relatedContract.plan?.scope || "—"}</td>
                        <td className="px-3 py-2">{formatLimit(relatedContract.plan?.limits?.apps?.comercial?.accounts)}</td>
                        <td className="px-3 py-2">{formatLimit(relatedContract.plan?.limits?.apps?.comercial?.contacts)}</td>
                        <td className="px-3 py-2">{formatLimit(relatedContract.plan?.limits?.apps?.comercial?.leads)}</td>
                        <td className="px-3 py-2">{formatLimit(relatedContract.plan?.limits?.apps?.comercial?.opportunities)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Contrato não disponível para visualização.</div>
                )
              )}
            </div>

            <footer className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <button className="btn btn-secondary" onClick={openRelatedListPage}>
                  Abrir página completa
                </button>
                <button className="btn btn-secondary" onClick={closeRelated}>
                  Fechar
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
