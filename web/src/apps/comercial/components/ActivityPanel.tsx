import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/apiClient";

type ActivityType = "task" | "event" | "call" | "email";
type ActivityStatus = "Open" | "In Progress" | "Completed" | "Cancelled";
type ActivityPriority = "Low" | "Normal" | "High";
type ActivityView = "open" | "history";

type UserOption = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type ContactOption = {
  id: string;
  account_id: string;
  name: string;
};

type ActivityParticipantOut = {
  contact_id: string;
  contact_name?: string | null;
};

type ActivityOut = {
  id: string;
  type: ActivityType;
  subject: string;
  description?: string | null;
  status: ActivityStatus;
  priority: ActivityPriority;
  due_date?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  completed_at?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  participants?: ActivityParticipantOut[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ActivityScope =
  | { mode: "what"; whatType: "account" | "lead" | "opportunity"; whatId: string }
  | { mode: "who"; whoType: "contact"; whoId: string };

type ActivityFormState = {
  type: ActivityType;
  subject: string;
  description: string;
  status: ActivityStatus;
  priority: ActivityPriority;
  dueDate: string;
  startAtLocal: string;
  endAtLocal: string;
  ownerId: string;
  participantIds: string[];
  participantQuery: string;
};

function extractApiErrorMessage(e: unknown): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (detail?.message) return String(detail.message);
  if (typeof detail === "string") return detail;
  return String(ae?.message || "Erro inesperado");
}

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

function userLabel(u: UserOption): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
}

function toIso(localValue: string): string | null {
  const raw = (localValue || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
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

function isDone(status?: string | null): boolean {
  const s = (status || "").trim().toLowerCase();
  return s === "completed" || s === "cancelled" || s === "canceled";
}

function dateKeyFromValue(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "sem-data";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "sem-data";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function groupLabelFromDateKey(key: string): string {
  if (key === "sem-data") return "Sem data";
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;

  const today = new Date();
  const todayKey = dateKeyFromValue(today.toISOString());
  if (key === todayKey) return "Hoje";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === dateKeyFromValue(yesterday.toISOString())) return "Ontem";

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (key === dateKeyFromValue(tomorrow.toISOString())) return "Amanhã";

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function activityReferenceDateValue(a: ActivityOut): string | null {
  return a.due_date || a.start_at || a.completed_at || a.created_at || null;
}

export function ActivityPanel(props: {
  scope: ActivityScope | null;
  accountId?: string | null;
  users?: UserOption[];
  defaultOwnerId?: string | null;
  title?: string;
}) {
  const users = props.users || [];
  const title = props.title || "Atividades";
  const scope = props.scope;
  const accountId = (props.accountId || "").trim();
  const defaultOwnerId = (props.defaultOwnerId || "").trim();

  const [activities, setActivities] = useState<ActivityOut[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [view, setView] = useState<ActivityView>("open");

  const [filterType, setFilterType] = useState<"" | ActivityType>("");
  const [filterStatus, setFilterStatus] = useState<"" | ActivityStatus>("");
  const [filterOwnerId, setFilterOwnerId] = useState("");
  const [filterParticipantId, setFilterParticipantId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [composerOpen, setComposerOpen] = useState(true);

  const [createType, setCreateType] = useState<ActivityType>("task");
  const [createSubject, setCreateSubject] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createStatus, setCreateStatus] = useState<ActivityStatus>("Open");
  const [createPriority, setCreatePriority] = useState<ActivityPriority>("Normal");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createStartAtLocal, setCreateStartAtLocal] = useState("");
  const [createEndAtLocal, setCreateEndAtLocal] = useState("");
  const [createOwnerId, setCreateOwnerId] = useState("");
  const [createParticipantIds, setCreateParticipantIds] = useState<string[]>([]);
  const [participantQuery, setParticipantQuery] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ActivityFormState | null>(null);

  const canCreate = !!scope && !!createSubject.trim() && !saving;

  useEffect(() => {
    if (createOwnerId) return;
    if (defaultOwnerId) {
      setCreateOwnerId(defaultOwnerId);
      return;
    }
    if (users.length) {
      setCreateOwnerId(users[0].id);
    }
  }, [createOwnerId, defaultOwnerId, users]);

  function buildQueryParams(currentScope: ActivityScope | null): URLSearchParams | null {
    if (!currentScope) return null;
    const params = new URLSearchParams({
      view,
      limit: "250",
    });
    if (currentScope.mode === "what") {
      params.set("what_type", currentScope.whatType);
      params.set("what_id", currentScope.whatId);
    } else {
      params.set("who_type", currentScope.whoType);
      params.set("who_id", currentScope.whoId);
    }
    if (filterType) params.set("type", filterType);
    if (filterStatus) params.set("status", filterStatus);
    if (filterOwnerId) params.set("owner_id", filterOwnerId);
    if (filterParticipantId) params.set("participant_contact_id", filterParticipantId);
    if (filterDateFrom) params.set("date_from", filterDateFrom);
    if (filterDateTo) params.set("date_to", filterDateTo);
    return params;
  }

  useEffect(() => {
    if (!scope) {
      setActivities([]);
      return;
    }

    const ac = new AbortController();
    async function run() {
      const params = buildQueryParams(scope);
      if (!params) {
        setActivities([]);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const rows = await apiFetch<ActivityOut[]>(`/crm/activities?${params.toString()}`, { signal: ac.signal });
        setActivities(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (isAbortError(e)) return;
        setErr(extractApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    }

    void run();
    return () => ac.abort();
  }, [scope, view, filterType, filterStatus, filterOwnerId, filterParticipantId, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (!accountId) {
      setContacts([]);
      return;
    }
    const ac = new AbortController();
    async function run() {
      try {
        const rows = await apiFetch<ContactOption[]>("/crm/contacts", { signal: ac.signal });
        const scoped = (rows || []).filter((r) => (r.account_id || "") === accountId);
        setContacts(scoped);
      } catch (e) {
        if (isAbortError(e)) return;
      }
    }
    void run();
    return () => ac.abort();
  }, [accountId]);

  const selectedParticipantSet = useMemo(() => new Set(createParticipantIds), [createParticipantIds]);
  const selectedParticipants = useMemo(
    () => contacts.filter((c) => selectedParticipantSet.has(c.id)),
    [contacts, selectedParticipantSet],
  );
  const contactSuggestions = useMemo(() => {
    const q = participantQuery.trim().toLowerCase();
    const available = contacts.filter((c) => !selectedParticipantSet.has(c.id));
    if (!q) return available.slice(0, 20);
    return available.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 20);
  }, [contacts, participantQuery, selectedParticipantSet]);

  const editSelectedParticipantSet = useMemo(
    () => new Set(editForm?.participantIds || []),
    [editForm?.participantIds],
  );
  const editSelectedParticipants = useMemo(
    () => contacts.filter((c) => editSelectedParticipantSet.has(c.id)),
    [contacts, editSelectedParticipantSet],
  );
  const editSuggestions = useMemo(() => {
    if (!editForm) return [];
    const q = editForm.participantQuery.trim().toLowerCase();
    const available = contacts.filter((c) => !editSelectedParticipantSet.has(c.id));
    if (!q) return available.slice(0, 20);
    return available.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 20);
  }, [contacts, editForm, editSelectedParticipantSet]);

  const groupedActivities = useMemo(() => {
    const keys: string[] = [];
    const buckets = new Map<string, ActivityOut[]>();
    for (const activity of activities) {
      const key = dateKeyFromValue(activityReferenceDateValue(activity));
      if (!buckets.has(key)) {
        keys.push(key);
        buckets.set(key, []);
      }
      buckets.get(key)!.push(activity);
    }
    return keys.map((key) => ({
      key,
      label: groupLabelFromDateKey(key),
      rows: buckets.get(key) || [],
    }));
  }, [activities]);

  function clearFilters() {
    setFilterType("");
    setFilterStatus("");
    setFilterOwnerId("");
    setFilterParticipantId("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  function resetCreateForm() {
    setCreateSubject("");
    setCreateDescription("");
    setCreateStatus("Open");
    setCreatePriority("Normal");
    setCreateDueDate("");
    setCreateStartAtLocal("");
    setCreateEndAtLocal("");
    setCreateParticipantIds([]);
    setParticipantQuery("");
  }

  function closeEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function startEdit(a: ActivityOut) {
    setEditingId(a.id);
    setEditForm({
      type: a.type,
      subject: a.subject || "",
      description: a.description || "",
      status: a.status,
      priority: a.priority,
      dueDate: a.due_date || "",
      startAtLocal: toLocalDateTimeInput(a.start_at),
      endAtLocal: toLocalDateTimeInput(a.end_at),
      ownerId: (a.owner_id || createOwnerId || defaultOwnerId || users[0]?.id || "").trim(),
      participantIds: (a.participants || []).map((p) => p.contact_id).filter(Boolean),
      participantQuery: "",
    });
  }

  function updateEditForm(patch: Partial<ActivityFormState>) {
    setEditForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function reload() {
    const params = buildQueryParams(scope);
    if (!params) {
      setActivities([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const rows = await apiFetch<ActivityOut[]>(`/crm/activities?${params.toString()}`);
      setActivities(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function createActivity() {
    if (!scope || !canCreate) return;

    const startAt = toIso(createStartAtLocal);
    const endAt = toIso(createEndAtLocal);
    if (createType === "event" && startAt && endAt && endAt < startAt) {
      setErr("Data final do evento deve ser maior ou igual à data inicial.");
      return;
    }

    const body: Record<string, any> = {
      type: createType,
      subject: createSubject.trim(),
      description: createDescription.trim() || null,
      status: createStatus,
      priority: createPriority,
      owner_id: createOwnerId || null,
      participant_contact_ids: createParticipantIds,
    };
    if (scope.mode === "what") {
      body.what_type = scope.whatType;
      body.what_id = scope.whatId;
    } else {
      body.who_type = scope.whoType;
      body.who_id = scope.whoId;
    }
    if (createType === "event") {
      body.start_at = startAt;
      body.end_at = endAt;
      body.due_date = null;
    } else {
      body.due_date = createDueDate || null;
      body.start_at = null;
      body.end_at = null;
    }

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<ActivityOut>("/crm/activities", {
        method: "POST",
        csrf: true,
        body,
      });
      resetCreateForm();
      await reload();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function patchActivity(activityId: string, body: Record<string, any>): Promise<boolean> {
    if (!activityId || saving) return false;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch<ActivityOut>(`/crm/activities/${encodeURIComponent(activityId)}`, {
        method: "PATCH",
        csrf: true,
        body,
      });
      await reload();
      return true;
    } catch (e) {
      setErr(extractApiErrorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveEditActivity() {
    if (!editingId || !editForm || saving) return;

    if (!editForm.subject.trim()) {
      setErr("Assunto é obrigatório.");
      return;
    }

    const startAt = toIso(editForm.startAtLocal);
    const endAt = toIso(editForm.endAtLocal);
    if (editForm.type === "event" && startAt && endAt && endAt < startAt) {
      setErr("Data final do evento deve ser maior ou igual à data inicial.");
      return;
    }

    const body: Record<string, any> = {
      type: editForm.type,
      subject: editForm.subject.trim(),
      description: editForm.description.trim() || null,
      status: editForm.status,
      priority: editForm.priority,
      owner_id: editForm.ownerId || null,
      participant_contact_ids: editForm.participantIds,
    };

    if (editForm.type === "event") {
      body.start_at = startAt;
      body.end_at = endAt;
      body.due_date = null;
    } else {
      body.due_date = editForm.dueDate || null;
      body.start_at = null;
      body.end_at = null;
    }

    const ok = await patchActivity(editingId, body);
    if (ok) closeEdit();
  }

  async function completeActivity(activityId: string) {
    if (!activityId || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch<ActivityOut>(`/crm/activities/${encodeURIComponent(activityId)}/complete`, {
        method: "POST",
        csrf: true,
        body: {},
      });
      await reload();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(activityId: string, status: ActivityStatus) {
    await patchActivity(activityId, { status });
  }

  async function deleteActivity(activityId: string) {
    if (!activityId || saving) return;
    if (!window.confirm("Excluir esta atividade?")) return;

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<void>(`/crm/activities/${encodeURIComponent(activityId)}`, {
        method: "DELETE",
        csrf: true,
      });
      if (editingId === activityId) closeEdit();
      await reload();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function addCreateParticipant(contactId: string) {
    if (!contactId || selectedParticipantSet.has(contactId)) return;
    setCreateParticipantIds((prev) => [...prev, contactId]);
    setParticipantQuery("");
  }

  function removeCreateParticipant(contactId: string) {
    setCreateParticipantIds((prev) => prev.filter((id) => id !== contactId));
  }

  function addEditParticipant(contactId: string) {
    if (!editForm || !contactId || editSelectedParticipantSet.has(contactId)) return;
    updateEditForm({
      participantIds: [...editForm.participantIds, contactId],
      participantQuery: "",
    });
  }

  function removeEditParticipant(contactId: string) {
    if (!editForm) return;
    updateEditForm({
      participantIds: editForm.participantIds.filter((id) => id !== contactId),
    });
  }

  return (
    <section className="overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
      <div className="sf-band bg-[#d1e1f8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</div>

      <div className="space-y-3 p-2.5">
        <div className="flex items-center justify-between gap-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2.5 py-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Nova atividade</div>
          <button className="btn btn-secondary h-8 !rounded-none px-2.5 text-xs" onClick={() => setComposerOpen((v) => !v)} disabled={saving}>
            {composerOpen ? "Ocultar" : "Abrir"}
          </button>
        </div>

        {composerOpen ? (
          <div className="grid grid-cols-1 gap-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-2.5">
            <div className="grid grid-cols-[1fr_130px] gap-2">
              <select className="input h-9 rounded-md px-2 py-1.5 text-sm" value={createType} onChange={(e) => setCreateType(e.target.value as ActivityType)} disabled={saving}>
                <option value="task">Tarefa</option>
                <option value="event">Evento</option>
                <option value="call">Ligação</option>
                <option value="email">E-mail</option>
              </select>
              <select className="input h-9 rounded-md px-2 py-1.5 text-sm" value={createPriority} onChange={(e) => setCreatePriority(e.target.value as ActivityPriority)} disabled={saving}>
                <option value="Low">Baixa</option>
                <option value="Normal">Normal</option>
                <option value="High">Alta</option>
              </select>
            </div>

            <input
              className="input h-9 rounded-md px-2 py-1.5 text-sm"
              value={createSubject}
              onChange={(e) => setCreateSubject(e.target.value)}
              placeholder="Assunto da atividade"
              disabled={saving}
            />

            {createType === "event" ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                  type="datetime-local"
                  value={createStartAtLocal}
                  onChange={(e) => setCreateStartAtLocal(e.target.value)}
                  disabled={saving}
                />
                <input
                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                  type="datetime-local"
                  value={createEndAtLocal}
                  onChange={(e) => setCreateEndAtLocal(e.target.value)}
                  disabled={saving}
                />
              </div>
            ) : (
              <input
                className="input h-9 rounded-md px-2 py-1.5 text-sm"
                type="date"
                value={createDueDate}
                onChange={(e) => setCreateDueDate(e.target.value)}
                disabled={saving}
              />
            )}

            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr]">
              <select className="input h-9 rounded-md px-2 py-1.5 text-sm" value={createStatus} onChange={(e) => setCreateStatus(e.target.value as ActivityStatus)} disabled={saving}>
                <option value="Open">Aberta</option>
                <option value="In Progress">Em andamento</option>
                <option value="Completed">Concluída</option>
                <option value="Cancelled">Cancelada</option>
              </select>
              <select className="input h-9 rounded-md px-2 py-1.5 text-sm" value={createOwnerId} onChange={(e) => setCreateOwnerId(e.target.value)} disabled={saving || users.length === 0}>
                <option value="">Owner</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              className="input min-h-[64px] w-full rounded-md"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Descrição (opcional)"
              disabled={saving}
            />

            {contacts.length ? (
              <div className="space-y-2">
                <input
                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                  value={participantQuery}
                  onChange={(e) => setParticipantQuery(e.target.value)}
                  placeholder="Buscar participante (contato)"
                  disabled={saving}
                />
                {contactSuggestions.length ? (
                  <div className="max-h-28 overflow-auto border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
                    {contactSuggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center justify-between border-b border-[rgb(var(--border))] px-2 py-1.5 text-left text-xs hover:brightness-105"
                        onClick={() => addCreateParticipant(c.id)}
                        disabled={saving}
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="text-[rgb(var(--muted))]">Adicionar</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedParticipants.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedParticipants.map((p) => (
                      <button key={p.id} type="button" className="btn btn-secondary h-7 px-2 text-xs !rounded-none" onClick={() => removeCreateParticipant(p.id)} disabled={saving}>
                        {p.name} ×
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={resetCreateForm} disabled={saving}>
                Limpar
              </button>
              <button className="btn btn-success h-9 !rounded-none px-3 text-sm" onClick={() => void createActivity()} disabled={!canCreate}>
                {saving ? "Salvando..." : "Adicionar atividade"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button className={view === "open" ? "btn btn-primary h-8 px-2.5 text-xs !rounded-none" : "btn btn-secondary h-8 px-2.5 text-xs !rounded-none"} onClick={() => setView("open")} disabled={loading}>
            Abertas
          </button>
          <button className={view === "history" ? "btn btn-primary h-8 px-2.5 text-xs !rounded-none" : "btn btn-secondary h-8 px-2.5 text-xs !rounded-none"} onClick={() => setView("history")} disabled={loading}>
            Histórico
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <select className="input h-8 rounded-md px-2 py-1 text-xs" value={filterType} onChange={(e) => setFilterType((e.target.value || "") as "" | ActivityType)} disabled={loading}>
            <option value="">Tipo (todos)</option>
            <option value="task">Tarefa</option>
            <option value="event">Evento</option>
            <option value="call">Ligação</option>
            <option value="email">E-mail</option>
          </select>
          <select className="input h-8 rounded-md px-2 py-1 text-xs" value={filterStatus} onChange={(e) => setFilterStatus((e.target.value || "") as "" | ActivityStatus)} disabled={loading}>
            <option value="">Status (todos)</option>
            <option value="Open">Aberta</option>
            <option value="In Progress">Em andamento</option>
            <option value="Completed">Concluída</option>
            <option value="Cancelled">Cancelada</option>
          </select>
          <select className="input h-8 rounded-md px-2 py-1 text-xs" value={filterOwnerId} onChange={(e) => setFilterOwnerId(e.target.value)} disabled={loading || users.length === 0}>
            <option value="">Owner (todos)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
          <select className="input h-8 rounded-md px-2 py-1 text-xs" value={filterParticipantId} onChange={(e) => setFilterParticipantId(e.target.value)} disabled={loading || contacts.length === 0}>
            <option value="">Participante (todos)</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input className="input h-8 rounded-md px-2 py-1 text-xs" type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} disabled={loading} />
          <div className="flex items-center gap-2">
            <input className="input h-8 rounded-md px-2 py-1 text-xs" type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} disabled={loading} />
            <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={clearFilters} disabled={loading}>
              Limpar
            </button>
          </div>
        </div>

        {loading ? <div className="text-xs text-[rgb(var(--muted))]">Carregando atividades...</div> : null}
        {err ? <div className="border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div> : null}

        <div className="max-h-[520px] overflow-auto border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
          {activities.length === 0 ? (
            <div className="px-3 py-4 text-sm text-[rgb(var(--muted))]">Nenhuma atividade.</div>
          ) : (
            <div>
              {groupedActivities.map((group) => (
                <div key={group.key} className="border-b border-[rgb(var(--border))] last:border-b-0">
                  <div className="bg-[#e7eef8] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">{group.label}</div>

                  <div className="divide-y divide-[rgb(var(--border))]">
                    {group.rows.map((a) => {
                      const editing = editingId === a.id && !!editForm;
                      const done = isDone(a.status);
                      return (
                        <div key={a.id} className="px-3 py-2.5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="rounded-sm border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                  {a.type}
                                </span>
                                <span className="rounded-sm border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                  {a.status}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-sm font-semibold">{a.subject}</div>
                              {a.description ? <div className="mt-0.5 text-xs text-[rgb(var(--muted))]">{a.description}</div> : null}
                              <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                                Prioridade {a.priority}
                                {a.due_date ? ` • Vence ${a.due_date}` : ""}
                                {a.start_at ? ` • Início ${formatDateTime(a.start_at)}` : ""}
                                {a.end_at ? ` • Fim ${formatDateTime(a.end_at)}` : ""}
                                {a.completed_at ? ` • Concluída ${formatDateTime(a.completed_at)}` : ""}
                              </div>
                              {a.participants && a.participants.length ? (
                                <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                                  Participantes: {a.participants.map((p) => p.contact_name || p.contact_id).join(", ")}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {!done ? (
                                <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={() => void completeActivity(a.id)} disabled={saving}>
                                  Concluir
                                </button>
                              ) : (
                                <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={() => void quickStatus(a.id, "Open")} disabled={saving}>
                                  Reabrir
                                </button>
                              )}

                              {!done && a.status !== "In Progress" ? (
                                <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={() => void quickStatus(a.id, "In Progress")} disabled={saving}>
                                  Em andamento
                                </button>
                              ) : null}

                              {!done && a.status !== "Cancelled" ? (
                                <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={() => void quickStatus(a.id, "Cancelled")} disabled={saving}>
                                  Cancelar
                                </button>
                              ) : null}

                              <button
                                className="btn btn-secondary h-8 !rounded-none px-2 text-xs"
                                onClick={() => {
                                  if (editing) {
                                    closeEdit();
                                  } else {
                                    startEdit(a);
                                  }
                                }}
                                disabled={saving}
                              >
                                {editing ? "Fechar" : "Editar"}
                              </button>

                              <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={() => void deleteActivity(a.id)} disabled={saving}>
                                Excluir
                              </button>
                            </div>
                          </div>

                          {editing && editForm ? (
                            <div className="mt-2 space-y-2 border-t border-[rgb(var(--border))] pt-2">
                              <div className="grid grid-cols-[1fr_130px] gap-2">
                                <select
                                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                  value={editForm.type}
                                  onChange={(e) => updateEditForm({ type: e.target.value as ActivityType })}
                                  disabled={saving}
                                >
                                  <option value="task">Tarefa</option>
                                  <option value="event">Evento</option>
                                  <option value="call">Ligação</option>
                                  <option value="email">E-mail</option>
                                </select>
                                <select
                                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                  value={editForm.priority}
                                  onChange={(e) => updateEditForm({ priority: e.target.value as ActivityPriority })}
                                  disabled={saving}
                                >
                                  <option value="Low">Baixa</option>
                                  <option value="Normal">Normal</option>
                                  <option value="High">Alta</option>
                                </select>
                              </div>

                              <input
                                className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                value={editForm.subject}
                                onChange={(e) => updateEditForm({ subject: e.target.value })}
                                placeholder="Assunto da atividade"
                                disabled={saving}
                              />

                              {editForm.type === "event" ? (
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                  <input
                                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                    type="datetime-local"
                                    value={editForm.startAtLocal}
                                    onChange={(e) => updateEditForm({ startAtLocal: e.target.value })}
                                    disabled={saving}
                                  />
                                  <input
                                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                    type="datetime-local"
                                    value={editForm.endAtLocal}
                                    onChange={(e) => updateEditForm({ endAtLocal: e.target.value })}
                                    disabled={saving}
                                  />
                                </div>
                              ) : (
                                <input
                                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                  type="date"
                                  value={editForm.dueDate}
                                  onChange={(e) => updateEditForm({ dueDate: e.target.value })}
                                  disabled={saving}
                                />
                              )}

                              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr]">
                                <select
                                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                  value={editForm.status}
                                  onChange={(e) => updateEditForm({ status: e.target.value as ActivityStatus })}
                                  disabled={saving}
                                >
                                  <option value="Open">Aberta</option>
                                  <option value="In Progress">Em andamento</option>
                                  <option value="Completed">Concluída</option>
                                  <option value="Cancelled">Cancelada</option>
                                </select>
                                <select
                                  className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                  value={editForm.ownerId}
                                  onChange={(e) => updateEditForm({ ownerId: e.target.value })}
                                  disabled={saving || users.length === 0}
                                >
                                  <option value="">Owner</option>
                                  {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {userLabel(u)}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <textarea
                                className="input min-h-[64px] w-full rounded-md"
                                value={editForm.description}
                                onChange={(e) => updateEditForm({ description: e.target.value })}
                                placeholder="Descrição (opcional)"
                                disabled={saving}
                              />

                              {contacts.length ? (
                                <div className="space-y-2">
                                  <input
                                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                                    value={editForm.participantQuery}
                                    onChange={(e) => updateEditForm({ participantQuery: e.target.value })}
                                    placeholder="Buscar participante (contato)"
                                    disabled={saving}
                                  />

                                  {editSuggestions.length ? (
                                    <div className="max-h-28 overflow-auto border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
                                      {editSuggestions.map((c) => (
                                        <button
                                          key={c.id}
                                          type="button"
                                          className="flex w-full items-center justify-between border-b border-[rgb(var(--border))] px-2 py-1.5 text-left text-xs hover:brightness-105"
                                          onClick={() => addEditParticipant(c.id)}
                                          disabled={saving}
                                        >
                                          <span className="truncate">{c.name}</span>
                                          <span className="text-[rgb(var(--muted))]">Adicionar</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}

                                  {editSelectedParticipants.length ? (
                                    <div className="flex flex-wrap gap-1">
                                      {editSelectedParticipants.map((p) => (
                                        <button key={p.id} type="button" className="btn btn-secondary h-7 px-2 text-xs !rounded-none" onClick={() => removeEditParticipant(p.id)} disabled={saving}>
                                          {p.name} ×
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              <div className="flex items-center justify-end gap-2">
                                <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={closeEdit} disabled={saving}>
                                  Cancelar
                                </button>
                                <button className="btn btn-success h-9 !rounded-none px-3 text-sm" onClick={() => void saveEditActivity()} disabled={saving || !editForm.subject.trim()}>
                                  {saving ? "Salvando..." : "Salvar alterações"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
