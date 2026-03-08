// web/src/apps/comercial/components/CustomFieldsBySession.tsx
import { useMemo, useState } from "react";

export type CustomFieldSession = {
  id: string;
  label: string;
  sort_order?: number;
  layout_columns?: 2 | 3;
};

export type CustomFieldDef = {
  id: string;
  session_id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  is_active: boolean;
  sort_order?: number;
  options: Record<string, any>;
};

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

function Chevron(props: { open: boolean }) {
  const rot = props.open ? "rotate-180" : "rotate-0";
  return (
    <svg className={`h-4 w-4 transition-transform ${rot}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function renderField(props: {
  def: CustomFieldDef;
  value: any;
  onChange: (nextVal: any) => void;
  mode: "create" | "edit";
  variant: "default" | "salesforce";
  compact?: boolean;
  wrapperClassName?: string;
}) {
  const { def, value, onChange, mode, variant, compact = false, wrapperClassName } = props;
  const isSalesforce = variant === "salesforce";
  const isCompact = compact;
  const labelClass = isSalesforce
    ? "text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]"
    : "text-sm font-medium";

  const common = (
    <div className={isCompact ? "mb-0.5 flex items-center justify-between gap-2" : "mb-1 flex items-center justify-between gap-2"}>
      <label className={labelClass}>
        {def.label} {def.required ? <span className="text-red-500">*</span> : null}
      </label>
      {mode === "edit" ? null : null}
    </div>
  );

  const inputBase = isCompact ? "input h-9 w-full rounded-md px-2 py-1.5 text-sm" : "input w-full";
  const fieldContainer = isSalesforce
    ? isCompact
      ? "bg-[rgb(var(--panel))] p-2"
      : "bg-[rgb(var(--panel))] p-3"
    : "rounded-2xl border border-[rgb(var(--border))] bg-white p-3";
  const containerClass = [fieldContainer, wrapperClassName ?? ""].join(" ").trim();

  if (def.type === "textarea") {
    return (
      <div key={def.id} className={containerClass}>
        {common}
        <textarea
          className={`${inputBase} ${isCompact ? "min-h-[72px]" : "min-h-[96px]"}`}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (def.type === "boolean") {
    return (
      <div key={def.id} className={containerClass}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span className="font-medium">{def.label}</span>
        </label>
      </div>
    );
  }

  if (def.type === "date") {
    return (
      <div key={def.id} className={containerClass}>
        {common}
        <input
          type="date"
          className={inputBase}
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </div>
    );
  }

  if (def.type === "datetime") {
    return (
      <div key={def.id} className={containerClass}>
        {common}
        <input
          type="datetime-local"
          className={inputBase}
          value={typeof value === "string" && value ? fromIsoToDatetimeLocal(value) : ""}
          onChange={(e) => onChange(e.target.value ? toDatetimeIso(e.target.value) : null)}
        />
      </div>
    );
  }

  if (def.type === "single_select") {
    const values = optionsValues(def);
    return (
      <div key={def.id} className={containerClass}>
        {common}
        <select className={inputBase} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Selecione...</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (def.type === "multi_select") {
    const values = optionsValues(def);
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div key={def.id} className={containerClass}>
        {common}
        <select
          multiple
          className={`${inputBase} ${isCompact ? "min-h-[96px]" : "min-h-[110px]"}`}
          value={selected}
          onChange={(e) => {
            const next = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange(next);
          }}
        >
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <div className="mt-1 text-xs text-[rgb(var(--muted))]">Ctrl/⌘ para selecionar múltiplos.</div>
      </div>
    );
  }

  const typeMap: Record<string, string> = {
    text: "text",
    number: "number",
    email: "email",
    phone: "tel",
    url: "url",
  };

  const inputType = typeMap[def.type] ?? "text";

  return (
    <div key={def.id} className={containerClass}>
      {common}
      <input className={inputBase} type={inputType} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function CustomFieldsBySession(props: {
  sessions: CustomFieldSession[];
  defs: CustomFieldDef[];
  values: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  mode: "create" | "edit";
  defaultExpanded?: boolean;
  emptyLabel?: string;
  variant?: "default" | "salesforce";
  compact?: boolean;
}) {
  const {
    sessions,
    defs,
    values,
    onChange,
    mode,
    defaultExpanded = true,
    emptyLabel,
    variant = "default",
    compact = false,
  } = props;
  const isSalesforce = variant === "salesforce";

  const [open, setOpen] = useState<Record<string, boolean>>({});

  const activeDefs = useMemo(() => (defs || []).filter((d) => d.is_active), [defs]);

  const defsBySession = useMemo(() => {
    const m = new Map<string, CustomFieldDef[]>();
    for (const d of activeDefs) {
      const list = m.get(d.session_id) ?? [];
      list.push(d);
      m.set(d.session_id, list);
    }
    for (const [sid, list] of m.entries()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      m.set(sid, list);
    }
    return m;
  }, [activeDefs]);

  const knownSessionIds = useMemo(() => new Set((sessions || []).map((s) => s.id)), [sessions]);

  const unknownSessionDefs = useMemo(() => {
    return activeDefs
      .filter((d) => !knownSessionIds.has(d.session_id))
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [activeDefs, knownSessionIds]);

  if (!activeDefs.length) {
    return <div className="text-sm text-[rgb(var(--muted))]">{emptyLabel || "Nenhum campo customizado ativo."}</div>;
  }

  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const Section = (p: { id: string; label: string; defs: CustomFieldDef[]; session?: CustomFieldSession }) => {
    const isOpen = open[p.id] ?? defaultExpanded;
    const gridColsClass = (p.session?.layout_columns ?? 2) === 3 ? "md:grid-cols-3" : "md:grid-cols-2";

    return (
      <div key={p.id} className={isSalesforce ? "overflow-hidden" : "overflow-hidden rounded-2xl border border-[rgb(var(--border))]"}>
        <button
          type="button"
          className={[
            "flex w-full items-center justify-between text-left",
            isSalesforce
              ? compact
                ? "sf-band bg-[#d1e1f8] px-4 py-2 text-slate-700"
                : "sf-band bg-[#d1e1f8] px-4 py-2.5 text-slate-700"
              : "border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-2",
          ].join(" ")}
          onClick={() => toggle(p.id)}
          aria-expanded={isOpen}
          aria-controls={`sec-${p.id}`}
        >
          <div className={isSalesforce ? "text-xs font-semibold uppercase tracking-wide" : "text-sm font-semibold"}>
            {p.label}
          </div>
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted))]">
            {isSalesforce ? null : <span>{isOpen ? "Recolher" : "Expandir"}</span>}
            <Chevron open={isOpen} />
          </div>
        </button>

        {isOpen && (
          <div id={`sec-${p.id}`} className={isSalesforce ? "bg-[rgb(var(--panel))]" : "p-4"}>
            <div
              className={
                isSalesforce
                  ? `grid grid-cols-1 ${gridColsClass}`
                  : `grid grid-cols-1 gap-3 ${gridColsClass}`
              }
            >
              {[...p.defs]
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((d) =>
                  renderField({
                    def: d,
                    value: values[d.key],
                    onChange: (nextVal) => onChange({ ...values, [d.key]: nextVal }),
                    mode,
                    variant,
                    compact,
                  }),
                )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const sessionBlocks = (
    <>
      {(sessions || []).map((s) => {
        const sDefs = defsBySession.get(s.id) || [];
        if (!sDefs.length) return null;
        return <Section id={s.id} label={s.label} defs={sDefs} session={s} />;
      })}

      {!!unknownSessionDefs.length && (
        <Section
          id="__others__"
          label="Outros"
          defs={unknownSessionDefs}
          session={{ id: "__others__", label: "Outros", layout_columns: 2 }}
        />
      )}
    </>
  );

  return (
    isSalesforce ? (
      <div className="space-y-2">
        {sessionBlocks}
      </div>
    ) : (
      <div className="space-y-4">{sessionBlocks}</div>
    )
  );
}
