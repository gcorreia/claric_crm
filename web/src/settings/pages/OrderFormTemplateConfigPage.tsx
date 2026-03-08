import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/apiClient";

type OrderFormTemplateOut = {
  id: string;
  template_name: string;
  file_name_pattern: string;
  locale: string;
  paper_size: "A4" | "LETTER";
  orientation: "portrait" | "landscape";
  primary_color: string;
  include_signature_block: boolean;
  header_text: string;
  footer_text: string;
  body_template: string;
  terms_template: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type TemplateDraft = {
  template_name: string;
  file_name_pattern: string;
  locale: string;
  paper_size: "A4" | "LETTER";
  orientation: "portrait" | "landscape";
  primary_color: string;
  include_signature_block: boolean;
  header_text: string;
  footer_text: string;
  body_template: string;
  terms_template: string;
};

const DEFAULT_DRAFT: TemplateDraft = {
  template_name: "Template padrão",
  file_name_pattern: "order-form-{opportunity_id}",
  locale: "pt-BR",
  paper_size: "A4",
  orientation: "portrait",
  primary_color: "#166534",
  include_signature_block: true,
  header_text: "",
  footer_text: "",
  body_template: "",
  terms_template: "",
};

const TOKENS = [
  "{order_form_id}",
  "{opportunity_id}",
  "{opportunity_name}",
  "{account_id}",
  "{account_name}",
  "{owner_name}",
  "{today}",
];

function extractApiErrorMessage(e: unknown): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (detail?.message) return String(detail.message);
  if (typeof detail === "string") return detail;
  return String(ae?.message || "Erro inesperado");
}

function mapOutToDraft(row: OrderFormTemplateOut): TemplateDraft {
  return {
    template_name: row.template_name || DEFAULT_DRAFT.template_name,
    file_name_pattern: row.file_name_pattern || DEFAULT_DRAFT.file_name_pattern,
    locale: row.locale || DEFAULT_DRAFT.locale,
    paper_size: row.paper_size || DEFAULT_DRAFT.paper_size,
    orientation: row.orientation || DEFAULT_DRAFT.orientation,
    primary_color: row.primary_color || DEFAULT_DRAFT.primary_color,
    include_signature_block: Boolean(row.include_signature_block),
    header_text: row.header_text || "",
    footer_text: row.footer_text || "",
    body_template: row.body_template || "",
    terms_template: row.terms_template || "",
  };
}

export function OrderFormTemplateConfigPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(DEFAULT_DRAFT);

  const previewFileName = useMemo(() => {
    return draft.file_name_pattern
      .replaceAll("{order_form_id}", "ORD0001")
      .replaceAll("{opportunity_id}", "OPP0001")
      .replaceAll("{opportunity_name}", "Nova Conta Enterprise")
      .replaceAll("{account_id}", "ACC0001")
      .replaceAll("{account_name}", "Empresa Exemplo")
      .replaceAll("{owner_name}", "Admin")
      .replaceAll("{today}", "2026-02-28");
  }, [draft.file_name_pattern]);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    setOk(null);
    try {
      const row = await apiFetch<OrderFormTemplateOut>("/crm/order-form-template", { signal } as any);
      setDraft(mapOutToDraft(row));
      setUpdatedAt(row.updated_at ?? null);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const row = await apiFetch<OrderFormTemplateOut>("/crm/order-form-template", {
        method: "PATCH",
        csrf: true,
        body: draft,
      });
      setDraft(mapOutToDraft(row));
      setUpdatedAt(row.updated_at ?? null);
      setOk("Template PDF salvo com sucesso.");
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Comercial · Objeto Order Form</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">
              Configure o template usado para gerar PDF quando o Order Form for finalizado/assinado.
            </div>
            {updatedAt && <div className="mt-1 text-xs text-[rgb(var(--muted))]">Última atualização: {updatedAt}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={() => void load()} disabled={loading || saving}>
              Recarregar
            </button>
            <button className="btn btn-success" onClick={() => void save()} disabled={loading || saving}>
              {saving ? "Salvando..." : "Salvar template"}
            </button>
          </div>
        </div>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</div>}

      <section className="panel rounded-2xl p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Nome do template *</label>
            <input
              className="input mt-1 w-full"
              value={draft.template_name}
              onChange={(e) => setDraft((d) => ({ ...d, template_name: e.target.value }))}
              disabled={loading || saving}
            />
          </div>

          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Padrão do nome do arquivo *</label>
            <input
              className="input mt-1 w-full"
              value={draft.file_name_pattern}
              onChange={(e) => setDraft((d) => ({ ...d, file_name_pattern: e.target.value }))}
              disabled={loading || saving}
            />
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">Preview: {previewFileName}.pdf</div>
          </div>

          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Idioma</label>
            <input
              className="input mt-1 w-full"
              value={draft.locale}
              onChange={(e) => setDraft((d) => ({ ...d, locale: e.target.value }))}
              disabled={loading || saving}
            />
          </div>

          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Cor principal (hex)</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                className="input w-full"
                value={draft.primary_color}
                onChange={(e) => setDraft((d) => ({ ...d, primary_color: e.target.value }))}
                disabled={loading || saving}
              />
              <span
                className="h-8 w-8 rounded-md border border-[rgb(var(--border))]"
                style={{ backgroundColor: draft.primary_color }}
                aria-hidden="true"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Tamanho do papel</label>
            <select
              className="input mt-1 w-full"
              value={draft.paper_size}
              onChange={(e) => setDraft((d) => ({ ...d, paper_size: e.target.value as "A4" | "LETTER" }))}
              disabled={loading || saving}
            >
              <option value="A4">A4</option>
              <option value="LETTER">Letter</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Orientação</label>
            <select
              className="input mt-1 w-full"
              value={draft.orientation}
              onChange={(e) => setDraft((d) => ({ ...d, orientation: e.target.value as "portrait" | "landscape" }))}
              disabled={loading || saving}
            >
              <option value="portrait">Retrato</option>
              <option value="landscape">Paisagem</option>
            </select>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.include_signature_block}
              onChange={(e) => setDraft((d) => ({ ...d, include_signature_block: e.target.checked }))}
              disabled={loading || saving}
            />
            Incluir bloco de assinaturas no PDF
          </label>
        </div>
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="text-sm font-semibold">Cabeçalho e Rodapé</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Texto do cabeçalho</label>
            <input
              className="input mt-1 w-full"
              value={draft.header_text}
              onChange={(e) => setDraft((d) => ({ ...d, header_text: e.target.value }))}
              disabled={loading || saving}
            />
          </div>
          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Texto do rodapé</label>
            <input
              className="input mt-1 w-full"
              value={draft.footer_text}
              onChange={(e) => setDraft((d) => ({ ...d, footer_text: e.target.value }))}
              disabled={loading || saving}
            />
          </div>
        </div>
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="text-sm font-semibold">Conteúdo do PDF</div>
        <div className="mt-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3 text-xs text-[rgb(var(--muted))]">
          Tokens disponíveis: {TOKENS.join(" · ")}
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Template do corpo</label>
            <textarea
              className="input mt-1 min-h-[180px] w-full"
              value={draft.body_template}
              onChange={(e) => setDraft((d) => ({ ...d, body_template: e.target.value }))}
              disabled={loading || saving}
              placeholder="Ex.: Dados comerciais, vigência, itens e condições principais."
            />
          </div>
          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Termos e condições padrão</label>
            <textarea
              className="input mt-1 min-h-[180px] w-full"
              value={draft.terms_template}
              onChange={(e) => setDraft((d) => ({ ...d, terms_template: e.target.value }))}
              disabled={loading || saving}
              placeholder="Ex.: cláusulas jurídicas e condições de renovação."
            />
          </div>
        </div>
      </section>
    </div>
  );
}
