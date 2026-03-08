import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";

type ParentEntityType = "account" | "lead" | "contact" | "opportunity" | "";

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

const PARENT_OPTIONS: Array<{ value: ParentEntityType; label: string }> = [
  { value: "", label: "Nenhum (objeto independente)" },
  { value: "account", label: "Conta" },
  { value: "lead", label: "Lead" },
  { value: "contact", label: "Contato" },
  { value: "opportunity", label: "Oportunidade" },
];

const SLUG_RE = /^[a-z][a-z0-9_]{1,63}$/;

function ensureMinKeyLen(k: string): string {
  const s = k.trim();
  if (s.length >= 2) return s;
  if (s.length === 1) return `${s}_`;
  return "c_";
}

function slugifyBase(input: string): string {
  let k = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!/^[a-z]/.test(k)) k = `c_${k}`;
  k = k.slice(0, 64);
  k = ensureMinKeyLen(k);

  // defensive cleanup + fallback
  if (!SLUG_RE.test(k)) {
    k = k.replace(/[^a-z0-9_]/g, "_");
    if (!/^[a-z]/.test(k)) k = `c_${k}`;
    k = k.slice(0, 64);
    k = ensureMinKeyLen(k);
    if (!SLUG_RE.test(k)) k = "c_obj";
  }

  return k;
}

function derivePlural(label: string): string {
  const v = label.trim();
  if (!v) return "";
  if (v.toLowerCase().endsWith("s")) return v;
  return `${v}s`;
}

function extractApiErrorMessage(e: unknown): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (detail?.message) return String(detail.message);
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first?.msg) return String(first.msg);
  }
  return (ae as ApiError)?.message ?? "Falha ao criar objeto";
}

function nextUniqueKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;

  for (let i = 2; i < 10_000; i += 1) {
    const suffix = `_${i}`;
    const maxBaseLen = 64 - suffix.length;
    const candidateBase = base.slice(0, Math.max(2, maxBaseLen));
    const candidate = `${candidateBase}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base.slice(0, 61)}_x`;
}

export function CustomObjectNewPage() {
  const nav = useNavigate();

  const [label, setLabel] = useState("");
  const [pluralLabel, setPluralLabel] = useState("");
  const [parent, setParent] = useState<ParentEntityType>("");

  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [loadingKeys, setLoadingKeys] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    async function loadExisting() {
      setLoadingKeys(true);
      try {
        const objs = await apiFetch<CustomObjectOut[]>("/crm/provisioning/custom-objects", { signal: ac.signal });
        const keys = new Set((objs ?? []).map((o) => String(o.key || "").trim()).filter(Boolean));
        setExistingKeys(keys);
      } catch (e) {
        // best-effort; if it fails we'll still rely on backend
      } finally {
        setLoadingKeys(false);
      }
    }

    void loadExisting();
    return () => ac.abort();
  }, []);

  const labelTrim = label.trim();

  const labelError = useMemo(() => {
    if (!labelTrim) return "Label é obrigatória.";
    if (labelTrim.length < 2) return "Label deve ter pelo menos 2 caracteres.";
    return null;
  }, [labelTrim]);

  const generatedKey = useMemo(() => {
    const base = slugifyBase(labelTrim || "");
    return nextUniqueKey(base, existingKeys);
  }, [labelTrim, existingKeys]);

  const canSave = useMemo(() => {
    return !labelError && !saving && !!generatedKey && SLUG_RE.test(generatedKey);
  }, [labelError, saving, generatedKey]);

  async function create() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);

    try {
      await apiFetch<CustomObjectOut>("/crm/provisioning/custom-objects", {
        method: "POST",
        csrf: true,
        body: {
          key: generatedKey,
          label: labelTrim,
          plural_label: pluralLabel.trim() || derivePlural(labelTrim),
          parent_entity_type: parent ? parent : null,
        },
      });

      nav("/settings/objects/custom");
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Novo objeto customizado</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">
              Defina o objeto e, opcionalmente, o objeto core pai. Se pai for definido, o vínculo será obrigatório em cada registro.
            </div>
          </div>

          <button className="btn btn-secondary" onClick={() => nav("/settings/objects/custom")} disabled={saving}>
            Voltar
          </button>
        </div>
      </div>

      {err && (
        <div className="panel rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="panel rounded-2xl p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-sm text-[rgb(var(--muted))]">Label *</label>
            <input
              className="input mt-1 w-full"
              value={label}
              onChange={(e) => {
                const v = e.target.value;
                setLabel(v);
                if (!pluralLabel.trim()) setPluralLabel(derivePlural(v));
              }}
              placeholder="Ex: Batatinha"
            />
            {labelError && <div className="mt-1 text-xs text-red-700">{labelError}</div>}
          </div>

          <div className="md:col-span-2">
            <div className="text-sm text-[rgb(var(--muted))]">Key (gerada automaticamente)</div>
            <div className="mt-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-3 font-mono text-sm">
              {labelTrim ? generatedKey : <span className="text-[rgb(var(--muted))]">—</span>}
            </div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Imutável após criar. {loadingKeys ? "Verificando duplicidade..." : "Sem duplicidade nesta BU (auto-sufixo)."}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-[rgb(var(--muted))]">Label (plural)</label>
            <input
              className="input mt-1 w-full"
              value={pluralLabel}
              onChange={(e) => setPluralLabel(e.target.value)}
              placeholder="Ex: Batatinhas"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-[rgb(var(--muted))]">Objeto pai (opcional)</label>
            <select className="input mt-1 w-full" value={parent} onChange={(e) => setParent(e.target.value as ParentEntityType)}>
              {PARENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Se definido, cada registro desse objeto deverá informar o ID do registro pai.
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => nav("/settings/objects/custom")} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => void create()} disabled={!canSave}>
            {saving ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
