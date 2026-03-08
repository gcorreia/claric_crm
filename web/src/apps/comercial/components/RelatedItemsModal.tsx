import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../lib/apiClient";
import { listOrderFormsWithFallback } from "../orderformsApi";
import { listQuotesWithFallback } from "../quotesApi";

export type RelatedKind = "contacts" | "leads" | "opportunities" | "order_forms" | "quotes" | "contract";

export const RELATED_ITEMS: Array<{ label: string; kind: RelatedKind }> = [
  { label: "Contatos", kind: "contacts" },
  { label: "Leads", kind: "leads" },
  { label: "Oportunidades", kind: "opportunities" },
  { label: "Cotações", kind: "quotes" },
  { label: "Contrato", kind: "contract" },
];

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

type RelatedQuote = {
  id: string;
  opportunity_id: string;
  account_id: string | null;
  name: string;
  status: string;
  valid_until?: string | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
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

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function formatMoney(v?: number | null): string {
  if (typeof v !== "number") return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatLimit(v: any): string {
  if (typeof v === "number") return String(v);
  return "Sem limite";
}

export function RelatedItemsModal(props: {
  open: boolean;
  kind: RelatedKind;
  accountId?: string | null;
  accountLabel?: string;
  opportunityId?: string | null;
  opportunityLabel?: string;
  onClose: () => void;
}) {
  const { open, kind, accountId, accountLabel, opportunityId, opportunityLabel, onClose } = props;
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<RelatedContact[]>([]);
  const [leads, setLeads] = useState<RelatedLead[]>([]);
  const [opportunities, setOpportunities] = useState<RelatedOpportunity[]>([]);
  const [orderForms, setOrderForms] = useState<RelatedOrderForm[]>([]);
  const [quotes, setQuotes] = useState<RelatedQuote[]>([]);
  const [contract, setContract] = useState<ContractCurrent | null>(null);

  const normalizedAccountId = (accountId || "").trim();
  const normalizedOpportunityId = (opportunityId || "").trim();

  const title = useMemo(() => {
    if (kind === "contacts") return "Contatos";
    if (kind === "leads") return "Leads";
    if (kind === "opportunities") return "Oportunidades";
    if (kind === "order_forms") return "Order Forms";
    if (kind === "quotes") return "Cotações";
    return "Contrato";
  }, [kind]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setErr(null);
      return;
    }

    async function run() {
      if (kind === "order_forms" || kind === "quotes") {
        if (!normalizedOpportunityId && !normalizedAccountId) {
          setErr("Sem conta/oportunidade vinculada para filtrar os itens relacionados.");
          return;
        }
      } else if (kind !== "contract" && !normalizedAccountId) {
        setErr("Sem conta vinculada para filtrar os itens relacionados.");
        return;
      }

      setLoading(true);
      setErr(null);
      try {
        if (kind === "contacts") {
          const rows = await apiFetch<RelatedContact[]>("/crm/contacts");
          setContacts((rows || []).filter((r) => r.account_id === normalizedAccountId));
          return;
        }
        if (kind === "leads") {
          const rows = await apiFetch<RelatedLead[]>("/crm/leads");
          setLeads((rows || []).filter((r) => r.account_id === normalizedAccountId));
          return;
        }
        if (kind === "opportunities") {
          const rows = await apiFetch<RelatedOpportunity[]>("/crm/opportunities");
          setOpportunities((rows || []).filter((r) => (r.account_id || "") === normalizedAccountId));
          return;
        }
        if (kind === "order_forms") {
          const rows = await listOrderFormsWithFallback<RelatedOrderForm[]>();
          const filtered = (rows || []).filter((r) => {
            if (normalizedOpportunityId) return r.opportunity_id === normalizedOpportunityId;
            return (r.account_id || "") === normalizedAccountId;
          });
          setOrderForms(filtered);
          return;
        }
        if (kind === "quotes") {
          const rows = await listQuotesWithFallback<RelatedQuote[]>();
          const filtered = (rows || []).filter((r) => {
            if (normalizedOpportunityId) return r.opportunity_id === normalizedOpportunityId;
            return (r.account_id || "") === normalizedAccountId;
          });
          setQuotes(filtered);
          return;
        }
        const data = await apiFetch<ContractCurrent>("/contracts/current");
        setContract(data);
      } catch (e: any) {
        setErr(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [kind, normalizedAccountId, normalizedOpportunityId, open]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.contact_role || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q) ||
        (r.external_id || "").toLowerCase().includes(q)
      );
    });
  }, [contacts, query]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.source || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q)
      );
    });
  }, [leads, query]);

  const filteredOpportunities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return opportunities;
    return opportunities.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.stage || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q)
      );
    });
  }, [opportunities, query]);

  const filteredOrderForms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderForms;
    return orderForms.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q) ||
        (r.opportunity_id || "").toLowerCase().includes(q)
      );
    });
  }, [orderForms, query]);

  const filteredQuotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((r) => {
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.owner_name || r.owner_id || "").toLowerCase().includes(q) ||
        (r.opportunity_id || "").toLowerCase().includes(q)
      );
    });
  }, [quotes, query]);

  const count = useMemo(() => {
    if (kind === "contacts") return filteredContacts.length;
    if (kind === "leads") return filteredLeads.length;
    if (kind === "opportunities") return filteredOpportunities.length;
    if (kind === "order_forms") return filteredOrderForms.length;
    if (kind === "quotes") return filteredQuotes.length;
    return contract ? 1 : 0;
  }, [contract, filteredContacts.length, filteredLeads.length, filteredOpportunities.length, filteredOrderForms.length, filteredQuotes.length, kind]);

  function openFullPage() {
    if (kind === "contacts") {
      nav("/comercial/contatos");
      onClose();
      return;
    }
    if (kind === "leads") {
      nav("/comercial/leads");
      onClose();
      return;
    }
    if (kind === "opportunities") {
      nav("/comercial/oportunidades");
      onClose();
      return;
    }
    if (kind === "order_forms") {
      nav("/comercial/order-forms");
      onClose();
      return;
    }
    if (kind === "quotes") {
      nav("/comercial/cotacoes");
      onClose();
      return;
    }
    nav("/settings/root/business-units");
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Fechar modal" />

      <section className="panel relative z-10 flex max-h-[calc(100vh-3rem)] w-[min(1100px,100%)] flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none shadow-2xl">
        <header className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Relacionados</div>
              <div className="text-base font-semibold">
                {title} ({count})
              </div>
              {(kind === "order_forms" || kind === "quotes") && normalizedOpportunityId ? (
                <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                  Oportunidade: {opportunityLabel || "Oportunidade"} · {normalizedOpportunityId}
                </div>
              ) : (
                <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                  Conta: {accountLabel || "Conta"} · {normalizedAccountId || "—"}
                </div>
              )}
            </div>
            <button className="btn btn-ghost -mr-2 -mt-2" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          </div>
        </header>

        {kind !== "contract" && (
          <div className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-2">
            <input
              className="input h-9 w-full rounded-md px-2 py-1.5 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar em ${title.toLowerCase()}...`}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto bg-[rgb(var(--panel))]">
          {err && <div className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

          {!err && loading && <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Carregando itens relacionados...</div>}

          {!err && !loading && kind === "contacts" && (
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
                            onClose();
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

          {!err && !loading && kind === "leads" && (
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
                            onClose();
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

          {!err && !loading && kind === "opportunities" && (
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
                            onClose();
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

          {!err && !loading && kind === "quotes" && (
            filteredQuotes.length ? (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[rgb(var(--panel-2))] text-left text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                  <tr>
                    <th className="px-3 py-2">Cotação</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Valor total</th>
                    <th className="px-3 py-2">Desconto</th>
                    <th className="px-3 py-2">Valor final</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((r) => (
                    <tr key={r.id} className="border-t border-[rgb(var(--border))] hover:bg-[rgb(var(--panel-2))]">
                      <td className="px-3 py-2">
                        <button
                          className="font-medium hover:underline"
                          onClick={() => {
                            nav(`/apps/comercial/cotacoes/${r.id}`);
                            onClose();
                          }}
                        >
                          {r.name}
                        </button>
                      </td>
                      <td className="px-3 py-2">{r.status || "—"}</td>
                      <td className="px-3 py-2">{formatMoney(r.total_amount)}</td>
                      <td className="px-3 py-2">{formatMoney(r.discount_amount)}</td>
                      <td className="px-3 py-2">{formatMoney(r.final_amount)}</td>
                      <td className="px-3 py-2">{r.owner_name || r.owner_id || "—"}</td>
                      <td className="px-3 py-2">{formatDateTime(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Nenhuma cotação vinculada ao contexto atual.</div>
            )
          )}

          {!err && !loading && kind === "order_forms" && (
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
                            onClose();
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
              <div className="px-4 py-6 text-sm text-[rgb(var(--muted))]">Nenhum order form vinculado ao filtro atual.</div>
            )
          )}

          {!err && !loading && kind === "contract" && (
            contract ? (
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
                    <td className="px-3 py-2 font-medium">{contract.plan?.name || "—"}</td>
                    <td className="px-3 py-2">{contract.plan?.scope || "—"}</td>
                    <td className="px-3 py-2">{formatLimit(contract.plan?.limits?.apps?.comercial?.accounts)}</td>
                    <td className="px-3 py-2">{formatLimit(contract.plan?.limits?.apps?.comercial?.contacts)}</td>
                    <td className="px-3 py-2">{formatLimit(contract.plan?.limits?.apps?.comercial?.leads)}</td>
                    <td className="px-3 py-2">{formatLimit(contract.plan?.limits?.apps?.comercial?.opportunities)}</td>
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
            <button className="btn btn-secondary" onClick={openFullPage}>
              Abrir página completa
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
