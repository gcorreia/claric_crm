// crm/web/src/settings/pages/ProvisioningFieldsPage.tsx
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";

type CoreEntityType = "account" | "lead" | "contact" | "opportunity";

type CustomObjectOut = {
  id: string;
  key: string;
  label: string;
  plural_label: string;
  parent_entity_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Selection =
  | { kind: "core"; entity_type: CoreEntityType; label: string }
  | { kind: "custom"; object_id: string; key: string; label: string };

type FieldSessionRow = {
  id: string;
  entity_type: CoreEntityType | null;
  custom_object_id: string | null;
  key: string;
  label: string;
  sort_order: number;
  layout_columns: 2 | 3;
  fields_count: number;
  version: number;
};

type FieldRow = {
  id: string;
  session_id: string;
  entity_type: string | null;
  custom_object_id?: string | null;
  key: string;
  label: string;
  sort_order: number;
  version: number;
  type: string;
  required: boolean;
  is_active: boolean;
};

type ProvisioningFieldsPageProps = {
  coreEntityType?: CoreEntityType;
  embedded?: boolean;
  lockEntitySelection?: boolean;
};

const CORE_OPTIONS: Array<{ value: CoreEntityType; label: string }> = [
  { value: "account", label: "Conta" },
  { value: "lead", label: "Lead" },
  { value: "contact", label: "Contato" },
  { value: "opportunity", label: "Oportunidade" },
];

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Texto longo" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Verdadeiro/Falso" },
  { value: "date", label: "Data" },
  { value: "datetime", label: "Data/Hora" },
  { value: "single_select", label: "Lista (1 opção)" },
  { value: "multi_select", label: "Lista (múltiplas)" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "url", label: "URL" },
];

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

function selectionId(sel: Selection): string {
  return sel.kind === "core" ? `core:${sel.entity_type}` : `custom:${sel.object_id}`;
}

function buildSessionsUrl(sel: Selection): string {
  if (sel.kind === "core") return `/crm/provisioning/field-sessions?entity_type=${encodeURIComponent(sel.entity_type)}`;
  return `/crm/provisioning/field-sessions?custom_object_id=${encodeURIComponent(sel.object_id)}`;
}

function buildFieldsListUrl(sel: Selection): string {
  if (sel.kind === "core") return `/crm/provisioning/fields?entity_type=${encodeURIComponent(sel.entity_type)}`;
  return `/crm/provisioning/fields?custom_object_id=${encodeURIComponent(sel.object_id)}`;
}

function slugifyKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isValidKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{1,63}$/.test(key);
}

function extractApiErrorMessage(err: unknown): string {
  const ae = err as any;
  const detail = ae?.detail;

  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const loc = Array.isArray(first?.loc) ? first.loc.join(".") : "body";
    const msg = first?.msg || "Requisição inválida";
    return `${loc}: ${msg}`;
  }

  if (detail && typeof detail === "object") return (detail as any).message || (ae?.message as string) || "Erro ao salvar";
  return (ae?.message as string) || "Erro ao salvar";
}

function cn(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

function SortableRow(props: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {props.children}
    </div>
  );
}

export function ProvisioningFieldsPage(props: ProvisioningFieldsPageProps = {}) {
  const { coreEntityType, embedded = false, lockEntitySelection = false } = props;
  const [searchParams] = useSearchParams();
  const [selection, setSelection] = useState<Selection>(() => {
    const initialCore =
      coreEntityType ??
      CORE_OPTIONS.find((o) => o.value === (searchParams.get("entity_type") as CoreEntityType | null))?.value ??
      "account";
    const core = CORE_OPTIONS.find((o) => o.value === initialCore) ?? CORE_OPTIONS[0];
    return { kind: "core", entity_type: core.value, label: core.label };
  });

  const [customObjects, setCustomObjects] = useState<CustomObjectOut[]>([]);
  const [q, setQ] = useState("");

  const [sessions, setSessions] = useState<FieldSessionRow[]>([]);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [sessLabel, setSessLabel] = useState("");
  const [sessKey, setSessKey] = useState("");
  const [sessColumns, setSessColumns] = useState<2 | 3>(2);
  const [sessSaving, setSessSaving] = useState(false);
  const [sessErr, setSessErr] = useState<string | null>(null);

  const [createFieldOpen, setCreateFieldOpen] = useState(false);
  const [fieldSessionId, setFieldSessionId] = useState<string | null>(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const sessionsById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const fieldsBySession = useMemo(() => {
    const m = new Map<string, FieldRow[]>();
    for (const f of fields) {
      const list = m.get(f.session_id) ?? [];
      list.push(f);
      m.set(f.session_id, list);
    }
    for (const [sid, list] of m.entries()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      m.set(sid, list);
    }
    return m;
  }, [fields]);

  const filteredCore = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return CORE_OPTIONS;
    return CORE_OPTIONS.filter((o) => o.label.toLowerCase().includes(qq) || o.value.includes(qq));
  }, [q]);

  const filteredCustom = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const active = (customObjects ?? []).filter((o) => o.is_active);
    if (!qq) return active;
    return active.filter((o) => o.label.toLowerCase().includes(qq) || o.key.toLowerCase().includes(qq));
  }, [customObjects, q]);

  async function loadCustomObjects(signal?: AbortSignal) {
    try {
      const data = await apiFetch<CustomObjectOut[]>("/crm/provisioning/custom-objects", { signal });
      setCustomObjects(Array.isArray(data) ? data : []);
    } catch (e) {
      if (!isAbortError(e)) setCustomObjects([]);
    }
  }

  async function reloadAll(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    try {
      const [sess, flds] = await Promise.all([
        apiFetch<FieldSessionRow[]>(buildSessionsUrl(selection), { signal }),
        apiFetch<FieldRow[]>(buildFieldsListUrl(selection), { signal }),
      ]);
      setSessions((Array.isArray(sess) ? sess : []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      setFields(Array.isArray(flds) ? flds : []);
    } catch (e) {
      if (isAbortError(e)) return;
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void loadCustomObjects(ac.signal);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (coreEntityType) return;
    const fromUrl = searchParams.get("entity_type");
    if (!fromUrl) return;
    const core = CORE_OPTIONS.find((o) => o.value === fromUrl);
    if (!core) return;
    if (selection.kind === "core" && selection.entity_type === core.value) return;
    setSelection({ kind: "core", entity_type: core.value, label: core.label });
  }, [searchParams, coreEntityType, selection.kind, selection.entity_type]);

  useEffect(() => {
    if (!coreEntityType) return;
    const core = CORE_OPTIONS.find((o) => o.value === coreEntityType);
    if (!core) return;
    if (selection.kind === "core" && selection.entity_type === core.value) return;
    setSelection({ kind: "core", entity_type: core.value, label: core.label });
  }, [coreEntityType, selection.kind, selection.entity_type]);

  useEffect(() => {
    const ac = new AbortController();
    void reloadAll(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionId(selection)]);

  async function createSession() {
    setSessErr(null);
    setSessSaving(true);

    const key = slugifyKey(sessKey || sessLabel);
    if (!isValidKey(key)) {
      setSessErr("Key inválida. Ex: dados_basicos");
      setSessSaving(false);
      return;
    }

    const body: any = { key, label: sessLabel.trim(), sort_order: sessions.length, layout_columns: sessColumns };
    if (selection.kind === "core") body.entity_type = selection.entity_type;
    else body.custom_object_id = selection.object_id;

    try {
      await apiFetch<FieldSessionRow>("/crm/provisioning/field-sessions", { method: "POST", csrf: true, body });
      setCreateSessionOpen(false);
      setSessLabel("");
      setSessKey("");
      setSessColumns(2);
      await reloadAll();
    } catch (e) {
      setSessErr(extractApiErrorMessage(e));
    } finally {
      setSessSaving(false);
    }
  }

  async function updateSessionColumns(sessionId: string, layout: 2 | 3) {
    const s = sessionsById.get(sessionId);
    if (!s) return;

    try {
      await apiFetch(`/crm/provisioning/field-sessions/${sessionId}`, {
        method: "PATCH",
        csrf: true,
        body: { layout_columns: layout, expected_version: s.version },
      });
      await reloadAll();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
      await reloadAll();
    }
  }

  async function createField() {
    if (!fieldSessionId) return;

    setFieldErr(null);
    setFieldSaving(true);

    const key = slugifyKey(fieldKey || fieldLabel);
    if (!isValidKey(key)) {
      setFieldErr("Key inválida. Ex: segmento");
      setFieldSaving(false);
      return;
    }

    const opts =
      fieldType === "single_select" || fieldType === "multi_select"
        ? {
            options: {
              values: fieldOptions
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean),
            },
          }
        : {};

    const body: any = {
      session_id: fieldSessionId,
      key,
      label: fieldLabel.trim(),
      type: fieldType,
      required: fieldRequired,
      ...opts,
    };

    if (selection.kind === "core") body.entity_type = selection.entity_type;
    else body.custom_object_id = selection.object_id;

    try {
      await apiFetch<FieldRow>("/crm/provisioning/fields", { method: "POST", csrf: true, body });
      setCreateFieldOpen(false);
      setFieldSessionId(null);
      setFieldLabel("");
      setFieldKey("");
      setFieldType("text");
      setFieldRequired(false);
      setFieldOptions("");
      await reloadAll();
    } catch (e) {
      setFieldErr(extractApiErrorMessage(e));
    } finally {
      setFieldSaving(false);
    }
  }

  async function toggleFieldActive(row: FieldRow) {
    try {
      await apiFetch(`/crm/provisioning/fields/${row.id}`, {
        method: "PATCH",
        csrf: true,
        body: { is_active: !row.is_active, expected_version: row.version },
      });
      await reloadAll();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
      await reloadAll();
    }
  }

  // -------------------------
  // Drag & Drop: sessions
  // -------------------------
  async function onSessionDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;

    const oldIndex = sessions.findIndex((s) => s.id === active.id);
    const newIndex = sessions.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(sessions, oldIndex, newIndex).map((s, i) => ({ ...s, sort_order: i }));
    setSessions(next);

    try {
      const expected_versions: Record<string, number> = {};
      for (const s of sessions) expected_versions[s.id] = s.version;

      await apiFetch(`/crm/provisioning/field-sessions/order`, {
        method: "PATCH",
        csrf: true,
        body: { session_ids: next.map((s) => s.id), expected_versions },
      });
      await reloadAll();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
      await reloadAll();
    }
  }

  // -------------------------
  // Drag & Drop: fields (multi-container)
  // -------------------------
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);

  function findField(fieldId: string): FieldRow | undefined {
    return fields.find((f) => f.id === fieldId);
  }

  function sessionFieldIds(sessionId: string): string[] {
    return (fieldsBySession.get(sessionId) ?? []).map((f) => f.id);
  }

  function patchLocalMove(fieldId: string, toSessionId: string, toIndex: number) {
    const f = findField(fieldId);
    if (!f) return;

    const fromSessionId = f.session_id;
    const from = (fieldsBySession.get(fromSessionId) ?? []).filter((x) => x.id !== fieldId);
    const to = (fieldsBySession.get(toSessionId) ?? []).slice();

    const moved: FieldRow = { ...f, session_id: toSessionId };
    const idx = Math.max(0, Math.min(toIndex, to.length));
    to.splice(idx, 0, moved);

    const rebuilt: FieldRow[] = [];
    for (const s of sessions) {
      const sid = s.id;
      const list =
        sid === fromSessionId ? from : sid === toSessionId ? to : (fieldsBySession.get(sid) ?? []).slice();
      list.forEach((it, i) => rebuilt.push({ ...it, sort_order: i }));
    }
    setFields(rebuilt);
  }

  function getOverContainerId(overId: any): string | null {
    const oid = String(overId ?? "");
    if (sessionsById.has(oid)) return oid;
    const f = findField(oid);
    return f ? f.session_id : null;
  }

  function onFieldDragStart(ev: DragStartEvent) {
    setActiveFieldId(String(ev.active.id));
  }

  function onFieldDragOver(ev: DragOverEvent) {
    const activeId = String(ev.active.id);
    const overId = ev.over?.id;
    if (!overId) return;

    const activeField = findField(activeId);
    if (!activeField) return;

    const overContainer = getOverContainerId(overId);
    if (!overContainer) return;

    const fromContainer = activeField.session_id;
    if (fromContainer === overContainer) return;

    const overIndex = (() => {
      const overField = findField(String(overId));
      if (!overField) return (fieldsBySession.get(overContainer) ?? []).length;
      return (fieldsBySession.get(overContainer) ?? []).findIndex((x) => x.id === overField.id);
    })();

    patchLocalMove(activeId, overContainer, overIndex < 0 ? 0 : overIndex);
  }

  async function onFieldDragEnd(ev: DragEndEvent) {
    const activeId = String(ev.active.id);
    const overId = ev.over?.id;
    setActiveFieldId(null);
    if (!overId) return;

    const activeField = findField(activeId);
    if (!activeField) return;

    const overContainer = getOverContainerId(overId);
    if (!overContainer) return;

    const targetIndex = (() => {
      const overField = findField(String(overId));
      if (!overField) return (fieldsBySession.get(overContainer) ?? []).length;
      return (fieldsBySession.get(overContainer) ?? []).findIndex((x) => x.id === overField.id);
    })();

    const sourceSessionId = activeField.session_id;
    const targetSessionId = overContainer;

    try {
      if (sourceSessionId === targetSessionId) {
        const field_ids = sessionFieldIds(sourceSessionId);
        const expected_versions: Record<string, number> = {};
        for (const f of fieldsBySession.get(sourceSessionId) ?? []) expected_versions[f.id] = f.version;

        await apiFetch(`/crm/provisioning/field-sessions/${sourceSessionId}/fields/order`, {
          method: "PATCH",
          csrf: true,
          body: { field_ids, expected_versions },
        });
      } else {
        const sourceSession = sessionsById.get(sourceSessionId);
        const targetSession = sessionsById.get(targetSessionId);
        if (!sourceSession || !targetSession) throw new Error("Sessão inválida");

        await apiFetch(`/crm/provisioning/fields/${activeId}/move`, {
          method: "PATCH",
          csrf: true,
          body: {
            target_session_id: targetSessionId,
            target_index: Math.max(0, targetIndex),
            expected_field_version: activeField.version,
            expected_source_session_version: sourceSession.version,
            expected_target_session_version: targetSession.version,
          },
        });
      }

      await reloadAll();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
      await reloadAll();
    }
  }

  return (
    <div className={embedded ? "" : "p-6"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Configurações • Campos (Sessões)</div>
          <div className="text-sm text-[rgb(var(--muted))]">Drag & drop: sessões, ordenação e mover campos entre sessões.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateSessionOpen(true)}>
          Nova sessão
        </button>
      </div>

      {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className={cn("grid grid-cols-1 gap-4", !lockEntitySelection && "lg:grid-cols-[280px_1fr]")}>
        {!lockEntitySelection && (
          <aside className="rounded-2xl border bg-white p-3">
            <input className="input w-full" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-3 text-xs font-semibold text-[rgb(var(--muted))]">CORE</div>
            <div className="mt-2 space-y-1">
              {filteredCore.map((o) => (
                <button
                  key={o.value}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left text-sm",
                    selection.kind === "core" && selection.entity_type === o.value ? "bg-black text-white" : "hover:bg-neutral-50",
                  )}
                  onClick={() => setSelection({ kind: "core", entity_type: o.value, label: o.label })}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-xs font-semibold text-[rgb(var(--muted))]">OBJETOS CUSTOM</div>
            <div className="mt-2 space-y-1">
              {filteredCustom.map((o) => (
                <button
                  key={o.id}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left text-sm",
                    selection.kind === "custom" && selection.object_id === o.id ? "bg-black text-white" : "hover:bg-neutral-50",
                  )}
                  onClick={() => setSelection({ kind: "custom", object_id: o.id, key: o.key, label: o.label })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </aside>
        )}

        <main className="space-y-4">
          <div className="rounded-2xl border bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                Sessões ({sessions.length}) • {selection.kind === "core" ? selection.label : selection.label}
              </div>
              {loading && <div className="text-xs text-[rgb(var(--muted))]">Carregando…</div>}
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onSessionDragEnd(e)}>
              <SortableContext items={sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="mt-3 space-y-2">
                  {sessions.map((s) => (
                    <SortableRow key={s.id} id={s.id}>
                      <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{s.label}</div>
                          <div className="text-xs text-[rgb(var(--muted))]">{s.fields_count} campos</div>
                        </div>
                        <select
                          className="input h-9 w-[120px]"
                          value={s.layout_columns}
                          onChange={(e) => void updateSessionColumns(s.id, Number(e.target.value) as 2 | 3)}
                        >
                          <option value={2}>2 colunas</option>
                          <option value={3}>3 colunas</option>
                        </select>
                      </div>
                    </SortableRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onFieldDragStart}
            onDragOver={onFieldDragOver}
            onDragEnd={(e) => void onFieldDragEnd(e)}
          >
            <div className="space-y-4">
              {sessions.map((s) => {
                const list = fieldsBySession.get(s.id) ?? [];
                const gridCols = s.layout_columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2";

                return (
                  <div key={s.id} className="rounded-2xl border bg-white">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <div className="text-sm font-semibold">{s.label}</div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setFieldSessionId(s.id);
                          setCreateFieldOpen(true);
                        }}
                      >
                        Novo campo
                      </button>
                    </div>

                    <div className={cn("grid grid-cols-1 gap-3 p-4", gridCols)}>
                      <SortableContext items={list.map((f) => f.id)} strategy={rectSortingStrategy}>
                        {list.map((f) => (
                          <SortableRow key={f.id} id={f.id}>
                            <div className={cn("rounded-xl border p-3", activeFieldId === f.id && "ring-2 ring-black")}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{f.label}</div>
                                  <div className="truncate text-xs text-[rgb(var(--muted))]">
                                    {f.key} • {f.type}
                                    {f.required ? " • obrigatório" : ""}
                                  </div>
                                </div>
                               <button type="button" className="btn btn-secondary h-8 px-2" onPointerDownCapture={(e) => e.stopPropagation()} onMouseDownCapture={(e) => e.stopPropagation()} onTouchStartCapture={(e) => e.stopPropagation()} onClick={(e) => {e.stopPropagation();
void toggleFieldActive(f);
  }}
>
  {f.is_active ? "Ativo" : "Inativo"}
</button>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </SortableContext>
                    </div>
                  </div>
                );
              })}
            </div>
          </DndContext>
        </main>
      </div>

      {/* Modal: Create Session */}
      {createSessionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <div className="text-base font-semibold">Nova sessão</div>
            <div className="mt-3 grid gap-3">
              <div>
                <div className="text-sm font-medium">Label</div>
                <input className="input mt-1 w-full" value={sessLabel} onChange={(e) => setSessLabel(e.target.value)} />
              </div>
              <div>
                <div className="text-sm font-medium">Key (opcional)</div>
                <input className="input mt-1 w-full" value={sessKey} onChange={(e) => setSessKey(e.target.value)} />
                <div className="mt-1 text-xs text-[rgb(var(--muted))]">Se vazio, será gerada a partir do label.</div>
              </div>
              <div>
                <div className="text-sm font-medium">Colunas</div>
                <select className="input mt-1 w-full" value={sessColumns} onChange={(e) => setSessColumns(Number(e.target.value) as 2 | 3)}>
                  <option value={2}>2 colunas</option>
                  <option value={3}>3 colunas</option>
                </select>
              </div>
              {sessErr && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sessErr}</div>}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setCreateSessionOpen(false)} disabled={sessSaving}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => void createSession()} disabled={sessSaving || !sessLabel.trim()}>
                {sessSaving ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Field */}
      {createFieldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <div className="text-base font-semibold">Novo campo</div>
            <div className="mt-3 grid gap-3">
              <div>
                <div className="text-sm font-medium">Sessão</div>
                <select className="input mt-1 w-full" value={fieldSessionId ?? ""} onChange={(e) => setFieldSessionId(e.target.value || null)}>
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm font-medium">Label</div>
                <input className="input mt-1 w-full" value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} />
              </div>

              <div>
                <div className="text-sm font-medium">Key (opcional)</div>
                <input className="input mt-1 w-full" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} />
                <div className="mt-1 text-xs text-[rgb(var(--muted))]">Se vazio, será gerada a partir do label.</div>
              </div>

              <div>
                <div className="text-sm font-medium">Tipo</div>
                <select className="input mt-1 w-full" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {(fieldType === "single_select" || fieldType === "multi_select") && (
                <div>
                  <div className="text-sm font-medium">Opções (1 por linha)</div>
                  <textarea className="input mt-1 w-full min-h-[120px]" value={fieldOptions} onChange={(e) => setFieldOptions(e.target.value)} />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fieldRequired} onChange={(e) => setFieldRequired(e.target.checked)} />
                Obrigatório
              </label>

              {fieldErr && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fieldErr}</div>}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setCreateFieldOpen(false)} disabled={fieldSaving}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => void createField()} disabled={fieldSaving || !fieldSessionId || !fieldLabel.trim()}>
                {fieldSaving ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
