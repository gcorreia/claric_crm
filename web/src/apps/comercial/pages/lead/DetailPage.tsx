import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { ActivityPanel } from "../../components/ActivityPanel";
import { RELATED_ITEMS, RelatedItemsModal, type RelatedKind } from "../../components/RelatedItemsModal";

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

type LeadOut = {
  id: string;
  account_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  source?: string | null;
  score?: number | null;
  owner_id: string;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
  custom_fields: Record<string, any>;
};

function userLabel(u: UserOut): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
}

function accountOptionLabel(a: AccountOut): string {
  return `${a.name} · ${a.id}`;
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
    return <div className="text-sm text-[rgb(var(--muted))]">Nenhum campo customizado ativo para Lead.</div>;
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
              <textarea
                className={textAreaClass}
                value={v ?? ""}
                onChange={(e) => set(e.target.value)}
                disabled={disabled}
              />
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
              <select
                className={textInputClass}
                value={v ?? ""}
                onChange={(e) => set(e.target.value)}
                disabled={disabled}
              >
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

export function LeadDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const accountDatalistId = "lead-detail-account-options";

  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [lead, setLead] = useState<LeadOut | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  const [accountId, setAccountId] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("Novo");
  const [source, setSource] = useState("");
  const [score, setScore] = useState("0");
  const [ownerId, setOwnerId] = useState<string>("");
  const [users, setUsers] = useState<UserOut[]>([]);
  const [accounts, setAccounts] = useState<AccountOut[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});

  const [snapshot, setSnapshot] = useState<{
    accountId: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    source: string;
    score: string;
    ownerId: string;
    customFields: Record<string, any>;
  } | null>(null);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedKind, setRelatedKind] = useState<RelatedKind>("contacts");

  const canSave = useMemo(
    () => !!accountId.trim() && !!name.trim() && !!ownerId.trim() && !saving && isEditing,
    [accountId, name, ownerId, saving, isEditing],
  );
  const accountLabelToId = useMemo(() => {
    const out = new Map<string, string>();
    for (const a of accounts) out.set(accountOptionLabel(a), a.id);
    return out;
  }, [accounts]);
  const selectedAccountName = useMemo(() => {
    const selected = accounts.find((a) => a.id === accountId);
    if (selected) return selected.name;
    return accountId ? accountId : "Conta";
  }, [accounts, accountId]);
  const ownerSummary = useMemo(() => {
    if (!ownerId) return "—";
    const selected = users.find((u) => u.id === ownerId);
    if (selected) return userLabel(selected);
    return lead?.owner_name || ownerId;
  }, [lead?.owner_name, ownerId, users]);
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
      const [defsData, leadData, usersData, accountsData] = await Promise.all([
        apiFetch<CustomFieldDef[]>(`/crm/provisioning/fields?entity_type=${encodeURIComponent("lead")}`, { signal } as any),
        apiFetch<LeadOut>(`/crm/leads/${encodeURIComponent(id)}`, { signal } as any),
        apiFetch<UserOut[]>("/users", { signal } as any).catch(() => [] as UserOut[]),
        apiFetch<AccountOut[]>("/crm/accounts", { signal } as any).catch(() => [] as AccountOut[]),
      ]);

      setDefs(defsData.filter((d) => d.is_active));
      setLead(leadData);
      setUsers(usersData.filter((u) => u.is_active !== false));
      setAccounts(accountsData);

      setAccountId(leadData.account_id ?? "");
      setName(leadData.name ?? "");
      setEmail(leadData.email ?? "");
      setPhone(leadData.phone ?? "");
      setStatus(leadData.status ?? "Novo");
      setSource(leadData.source ?? "");
      setScore(String(leadData.score ?? 0));
      setOwnerId(leadData.owner_id ?? "");
      setCustomFields(leadData.custom_fields ?? {});

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

  function enterEditMode() {
    setErr(null);
    setSnapshot({
      accountId,
      name,
      email,
      phone,
      status,
      source,
      score,
      ownerId,
      customFields: clone(customFields),
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    if (snapshot) {
      setAccountId(snapshot.accountId);
      setName(snapshot.name);
      setEmail(snapshot.email);
      setPhone(snapshot.phone);
      setStatus(snapshot.status);
      setSource(snapshot.source);
      setScore(snapshot.score);
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

  async function save() {
    if (!id || !canSave) return;

    const missing = missingRequired(defs, customFields);
    if (missing.length) {
      setErr(`Preencha os campos obrigatórios: ${missing.join(", ")}`);
      return;
    }

    const normalizedScore = score.trim();
    if (normalizedScore && Number.isNaN(Number(normalizedScore))) {
      setErr("Score deve ser numérico");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const updated = await apiFetch<LeadOut>(`/crm/leads/${encodeURIComponent(id)}`, {
        method: "PATCH",
        csrf: true,
        body: {
          account_id: accountId.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          status: status.trim(),
          source: source.trim(),
          score: normalizedScore === "" ? 0 : Number(normalizedScore),
          owner_id: ownerId.trim(),
          custom_fields: customFields,
        },
      });

      setLead(updated);
      setAccountId(updated.account_id ?? "");
      setName(updated.name ?? "");
      setEmail(updated.email ?? "");
      setPhone(updated.phone ?? "");
      setStatus(updated.status ?? "Novo");
      setSource(updated.source ?? "");
      setScore(String(updated.score ?? 0));
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
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Lead</div>
              <div className="text-lg font-semibold md:text-xl">{loading ? "Carregando lead..." : name || lead?.name || "Lead"}</div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                ID: {lead?.id || "—"} · Owner: {ownerSummary} · Atualizado em {formatDateTime(lead?.updated_at)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-secondary" onClick={() => nav("/apps/comercial/leads")} disabled={saving}>
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
                    {saving ? "Salvando..." : "Salvar lead"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {RELATED_ITEMS.map((l) => (
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
                  Detalhes do Lead
                </div>
                <div className="bg-[rgb(var(--panel))]">
                  <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Conta *</label>
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
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Email</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Telefone</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Status</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Source</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        disabled={loading || !isEditing}
                      />
                    </div>

                    <div className="border-b border-[rgb(var(--border))] p-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Score</label>
                      <input
                        className="input mt-1 h-9 w-full rounded-md px-2 py-1.5 text-sm"
                        type="number"
                        value={score}
                        onChange={(e) => setScore(e.target.value)}
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

            <aside className="space-y-3">
              <ActivityPanel
                title="Atividades"
                scope={id ? { mode: "what", whatType: "lead", whatId: id } : null}
                accountId={accountId}
                users={users}
                defaultOwnerId={ownerId}
              />
            </aside>
          </div>
        </div>
      </section>

      <RelatedItemsModal
        open={relatedOpen}
        kind={relatedKind}
        accountId={accountId}
        accountLabel={selectedAccountName}
        onClose={() => setRelatedOpen(false)}
      />
    </div>
  );
}
