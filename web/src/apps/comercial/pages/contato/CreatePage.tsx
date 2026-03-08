import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { useAuth } from "../../../../auth/AuthContext";
import {
  CustomFieldsBySession,
  type CustomFieldDef,
  type CustomFieldSession,
} from "../../components/CustomFieldsBySession";

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

type ContactRoleOption = {
  id: string;
  value: string;
  is_active: boolean;
};

type ContactIn = {
  account_id: string;
  name: string;
  contact_role: string;
  owner_id?: string | null;
  custom_fields: Record<string, any>;
};

type ContactOut = ContactIn & {
  id: string;
  external_id: string;
  created_at: string;
  updated_at: string;
};

function userLabel(u: UserOut): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
}

function accountOptionLabel(a: AccountOut): string {
  return `${a.name} · ${a.id}`;
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

function normalizeCustomLayout(defsData: CustomFieldDef[], sessionsData: CustomFieldSession[]) {
  const fallbackSessionId = "__default__";
  const hasConfiguredSessions = (sessionsData || []).length > 0;
  const normalizedDefs = (defsData || [])
    .filter((d) => d.is_active)
    .map((d) => ({
      ...d,
      session_id: hasConfiguredSessions ? d.session_id || fallbackSessionId : fallbackSessionId,
    }));

  const normalizedSessions = [...(sessionsData || [])];
  const needFallbackSession =
    normalizedDefs.some((d) => d.session_id === fallbackSessionId) &&
    !normalizedSessions.some((s) => s.id === fallbackSessionId);

  if (needFallbackSession) {
    normalizedSessions.push({
      id: fallbackSessionId,
      label: "Campos customizados",
      layout_columns: 2,
      sort_order: 9999,
    });
  }

  return { normalizedDefs, normalizedSessions };
}

export function ContatoCreatePage() {
  const nav = useNavigate();
  const { user } = useAuth();

  const accountDatalistId = "contact-create-account-options";
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [sessions, setSessions] = useState<CustomFieldSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [accountId, setAccountId] = useState<string>("");
  const [accountQuery, setAccountQuery] = useState<string>("");
  const [name, setName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [users, setUsers] = useState<UserOut[]>([]);
  const [accounts, setAccounts] = useState<AccountOut[]>([]);
  const [contactRoles, setContactRoles] = useState<ContactRoleOption[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});

  const canSave = useMemo(
    () => !!accountId.trim() && !!name.trim() && !!contactRole.trim() && !!ownerId.trim() && !saving,
    [accountId, name, contactRole, ownerId, saving],
  );

  const accountLabelToId = useMemo(() => {
    const out = new Map<string, string>();
    for (const a of accounts) out.set(accountOptionLabel(a), a.id);
    return out;
  }, [accounts]);

  function resolveAccountIdFromInput(inputValue: string): string {
    const byLabel = accountLabelToId.get(inputValue);
    if (byLabel) return byLabel;

    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) return "";

    const exactByName = accounts.filter((a) => a.name.trim().toLowerCase() === normalized);
    return exactByName.length === 1 ? exactByName[0].id : "";
  }

  async function loadCustomLayout(signal?: AbortSignal) {
    setErr(null);
    try {
      const [sessionsData, defsData] = await Promise.all([
        apiFetch<CustomFieldSession[]>(
          `/crm/provisioning/field-sessions?entity_type=${encodeURIComponent("contact")}`,
          { signal } as any,
        ).catch(() => [] as CustomFieldSession[]),
        apiFetch<CustomFieldDef[]>(`/crm/provisioning/fields?entity_type=${encodeURIComponent("contact")}`, {
          signal,
        } as any),
      ]);

      const { normalizedDefs, normalizedSessions } = normalizeCustomLayout(defsData || [], sessionsData || []);
      setDefs(normalizedDefs);
      setSessions(normalizedSessions);
    } catch (e) {
      if (isAbortError(e)) return;
      setErr(extractApiErrorMessage(e));
    }
  }

  useEffect(() => {
    if (user?.id) setOwnerId(user.id);
  }, [user?.id]);

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
    const ac = new AbortController();
    setLoading(true);

    (async () => {
      try {
        await Promise.all([
          loadCustomLayout(ac.signal),
          (async () => {
            const [us, accs, roles] = await Promise.all([
              apiFetch<UserOut[]>("/users", { signal: ac.signal } as any).catch(() => [] as UserOut[]),
              apiFetch<AccountOut[]>("/crm/accounts", { signal: ac.signal } as any).catch(() => [] as AccountOut[]),
              apiFetch<ContactRoleOption[]>("/crm/contact-roles", { signal: ac.signal } as any).catch(
                () => [] as ContactRoleOption[],
              ),
            ]);
            setUsers(us.filter((u) => u.is_active !== false));
            setAccounts(accs);
            setContactRoles(roles.filter((r) => r.is_active !== false));
          })(),
        ]);
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  async function save() {
    if (!canSave) return;

    const missing = missingRequired(defs, customFields);
    if (missing.length) {
      setErr(`Preencha os campos obrigatórios: ${missing.join(", ")}`);
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const payload: ContactIn = {
        account_id: accountId.trim(),
        name: name.trim(),
        contact_role: contactRole.trim(),
        owner_id: ownerId.trim(),
        custom_fields: customFields,
      };
      const created = await apiFetch<ContactOut>("/crm/contacts", { method: "POST", csrf: true, body: payload });
      nav(`/apps/comercial/contatos/${created.id}`);
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
            <div className="text-base font-semibold">Novo Contato</div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Layout estilo grid com sessões e frames do Provisionamento.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={() => nav("/apps/comercial/contatos")} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-success" onClick={() => void save()} disabled={!canSave}>
              {saving ? "Salvando..." : "Salvar contato"}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {err && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

            <section className="overflow-hidden border-t border-[rgb(var(--border))]">
              <div className="sf-band bg-[#d1e1f8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Detalhes do Contato
              </div>

              <div className="bg-[rgb(var(--panel))]">
                <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Conta *</label>
                    <input
                      className="input mt-1 w-full"
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
                      disabled={loading || saving}
                    />
                    <datalist id={accountDatalistId}>
                      {accounts.map((a) => (
                        <option key={a.id} value={accountOptionLabel(a)} />
                      ))}
                    </datalist>
                    <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                      {accountId ? `Conta selecionada: ${accountId}` : "Digite o nome da conta e selecione uma opção da lista."}
                    </div>
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Nome *</label>
                    <input
                      className="input mt-1 w-full"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={loading || saving}
                    />
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Contact Role *</label>
                    <select
                      className="input mt-1 w-full"
                      value={contactRole}
                      onChange={(e) => setContactRole(e.target.value)}
                      disabled={loading || saving}
                    >
                      <option value="">
                        {contactRoles.length ? "Selecione..." : "Cadastre em Configurações > Contact Roles"}
                      </option>
                      {contactRoles.map((r) => (
                        <option key={r.id} value={r.value}>
                          {r.value}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                      Os valores são definidos em Configurações → Apps → Comercial → Contato → Contact Roles.
                    </div>
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Owner *</label>
                    <select
                      className="input mt-1 w-full"
                      value={ownerId}
                      onChange={(e) => setOwnerId(e.target.value)}
                      disabled={loading || saving}
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

            <div className="border-t border-[rgb(var(--border))]">
              <CustomFieldsBySession
                sessions={sessions}
                defs={defs}
                values={customFields}
                onChange={setCustomFields}
                mode="create"
                emptyLabel="Nenhum campo customizado ativo para Contato."
                defaultExpanded={true}
                variant="salesforce"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
