import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../lib/apiClient";
import { Modal } from "../../ui/Modal";
import { ProvisioningFieldsPage } from "./ProvisioningFieldsPage";

type AppKey = "comercial" | "academico" | "financeiro";
type CoreEntityType = "account" | "lead" | "contact" | "opportunity";

type AppConfig = {
  label: string;
  description: string;
  coreObjects: Array<{ label: string; entityType: CoreEntityType }>;
};

type AppCoreObject = { label: string; entityType: CoreEntityType };
type ObjectTabKey = "field-config" | "contact-roles" | "opportunity-stages";
type ContactRoleOut = {
  id: string;
  value: string;
  sort_order: number;
  is_active: boolean;
};
type OpportunityStageOut = {
  id: string;
  value: string;
  sort_order: number;
  is_active: boolean;
  probability_percent?: number | null;
};

const FIXED_OPPORTUNITY_STAGE_KEYS = new Set(["inicial", "fechado", "perdido", "closed won", "closed lost", "won", "lost", "ganho"]);

function isFixedOpportunityStage(stage: OpportunityStageOut): boolean {
  return FIXED_OPPORTUNITY_STAGE_KEYS.has((stage.value || "").trim().toLowerCase());
}

const APP_CONFIG: Record<AppKey, AppConfig> = {
  comercial: {
    label: "Comercial",
    description: "Configure os objetos e campos usados no app Comercial.",
    coreObjects: [
      { label: "Conta", entityType: "account" },
      { label: "Contato", entityType: "contact" },
      { label: "Lead", entityType: "lead" },
      { label: "Oportunidade", entityType: "opportunity" },
    ],
  },
  academico: {
    label: "Acadêmico",
    description: "Configure os objetos e campos usados no app Acadêmico.",
    coreObjects: [],
  },
  financeiro: {
    label: "Financeiro",
    description: "Configure os objetos e campos usados no app Financeiro.",
    coreObjects: [],
  },
};

function extractApiErrorMessage(e: unknown): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (detail?.message) return String(detail.message);
  if (typeof detail === "string") return detail;
  return String(ae?.message || "Erro inesperado");
}

function ContactRolesTab() {
  const [roles, setRoles] = useState<ContactRoleOut[]>([]);
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadRoles(signal?: AbortSignal) {
    setErr(null);
    setLoading(true);
    try {
      const rows = await apiFetch<ContactRoleOut[]>("/crm/contact-roles?include_inactive=true", { signal } as any);
      setRoles(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void loadRoles(ac.signal);
    return () => ac.abort();
  }, []);

  async function createRole() {
    const value = newValue.trim();
    if (!value || saving) return;

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<ContactRoleOut>("/crm/contact-roles", {
        method: "POST",
        csrf: true,
        body: { value },
      });
      setNewValue("");
      await loadRoles();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(role: ContactRoleOut) {
    if (saving) return;

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<ContactRoleOut>(`/crm/contact-roles/${encodeURIComponent(role.id)}`, {
        method: "PATCH",
        csrf: true,
        body: { is_active: !role.is_active },
      });
      await loadRoles();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="rounded-xl border border-[rgb(var(--border))] bg-white p-4">
        <div className="text-sm font-semibold">Contact Roles</div>
        <div className="mt-1 text-sm text-[rgb(var(--muted))]">
          Cadastre aqui os valores disponíveis para o campo Contact Role no objeto Contato.
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <label className="text-sm text-[rgb(var(--muted))]">Novo valor</label>
            <input
              className="input mt-1 w-full"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Ex.: Tomador de decisão"
              disabled={saving}
            />
          </div>
          <button className="btn btn-primary" onClick={() => void createRole()} disabled={saving || !newValue.trim()}>
            {saving ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--border))] bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Valores cadastrados</div>
          {loading && <div className="text-xs text-[rgb(var(--muted))]">Carregando...</div>}
        </div>

        {roles.length === 0 ? (
          <div className="mt-3 text-sm text-[rgb(var(--muted))]">Nenhum Contact Role cadastrado.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{role.value}</div>
                  <div className="text-xs text-[rgb(var(--muted))]">
                    {role.is_active ? "Ativo" : "Inativo"} • Ordem: {role.sort_order}
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={() => void toggleActive(role)} disabled={saving}>
                  {role.is_active ? "Inativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OpportunityStagesTab() {
  const [stages, setStages] = useState<OpportunityStageOut[]>([]);
  const [newValue, setNewValue] = useState("");
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deletingStage, setDeletingStage] = useState<OpportunityStageOut | null>(null);
  const [replacementStageId, setReplacementStageId] = useState("");
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadStages(signal?: AbortSignal) {
    setErr(null);
    setLoading(true);
    try {
      const rows = await apiFetch<OpportunityStageOut[]>("/crm/opportunity-stages?include_inactive=true", { signal } as any);
      setStages(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void loadStages(ac.signal);
    return () => ac.abort();
  }, []);

  async function createStage() {
    const value = newValue.trim();
    if (!value || saving) return;

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<OpportunityStageOut>("/crm/opportunity-stages", {
        method: "POST",
        csrf: true,
        body: { value },
      });
      setNewValue("");
      await loadStages();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(stage: OpportunityStageOut) {
    if (saving) return;
    if (isFixedOpportunityStage(stage)) return;

    setSaving(true);
    setErr(null);
    if (editingStageId === stage.id) {
      setEditingStageId(null);
      setEditingValue("");
    }
    try {
      await apiFetch<OpportunityStageOut>(`/crm/opportunity-stages/${encodeURIComponent(stage.id)}`, {
        method: "PATCH",
        csrf: true,
        body: { is_active: !stage.is_active },
      });
      await loadStages();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(stage: OpportunityStageOut) {
    if (saving) return;
    if (isFixedOpportunityStage(stage)) return;
    setErr(null);
    setEditingStageId(stage.id);
    setEditingValue(stage.value);
  }

  function cancelEdit() {
    if (saving) return;
    setEditingStageId(null);
    setEditingValue("");
  }

  function getReplacementOptions(stageId: string): OpportunityStageOut[] {
    return stages.filter((item) => item.id !== stageId && item.is_active);
  }

  function openDeleteModal(stage: OpportunityStageOut) {
    if (saving) return;
    if (isFixedOpportunityStage(stage)) return;

    if (editingStageId === stage.id) {
      setEditingStageId(null);
      setEditingValue("");
    }

    const options = getReplacementOptions(stage.id);
    setDeleteErr(null);
    setErr(null);
    setDeletingStage(stage);
    setReplacementStageId(options[0]?.id ?? "");
  }

  function closeDeleteModal() {
    if (saving) return;
    setDeletingStage(null);
    setReplacementStageId("");
    setDeleteErr(null);
  }

  async function saveStageName(stage: OpportunityStageOut) {
    const value = editingValue.trim();
    if (!value || saving) return;

    setSaving(true);
    setErr(null);
    try {
      await apiFetch<OpportunityStageOut>(`/crm/opportunity-stages/${encodeURIComponent(stage.id)}`, {
        method: "PATCH",
        csrf: true,
        body: { value },
      });
      setEditingStageId(null);
      setEditingValue("");
      await loadStages();
    } catch (e) {
      setErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteStage() {
    if (!deletingStage || saving) return;

    const options = getReplacementOptions(deletingStage.id);
    if (!replacementStageId && options.length > 0) {
      setDeleteErr("Selecione um stage de destino para migrar as oportunidades.");
      return;
    }

    setSaving(true);
    setErr(null);
    setDeleteErr(null);
    try {
      await apiFetch<void>(`/crm/opportunity-stages/${encodeURIComponent(deletingStage.id)}`, {
        method: "DELETE",
        csrf: true,
        body: replacementStageId ? { replacement_stage_id: replacementStageId } : {},
      });
      closeDeleteModal();
      await loadStages();
    } catch (e) {
      setDeleteErr(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const replacementOptions = deletingStage ? getReplacementOptions(deletingStage.id) : [];

  return (
    <div className="mt-4 space-y-4">
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="rounded-xl border border-[rgb(var(--border))] bg-white p-4">
        <div className="text-sm font-semibold">Stages da Oportunidade</div>
        <div className="mt-1 text-sm text-[rgb(var(--muted))]">
          Cadastre aqui as etapas disponíveis para o campo Stage no objeto Oportunidade.
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <label className="text-sm text-[rgb(var(--muted))]">Nova etapa</label>
            <input
              className="input mt-1 w-full"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Ex.: Qualification"
              disabled={saving}
            />
          </div>
          <button className="btn btn-primary" onClick={() => void createStage()} disabled={saving || !newValue.trim()}>
            {saving ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--border))] bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Etapas cadastradas</div>
          {loading && <div className="text-xs text-[rgb(var(--muted))]">Carregando...</div>}
        </div>

        {stages.length === 0 ? (
          <div className="mt-3 text-sm text-[rgb(var(--muted))]">Nenhuma etapa cadastrada.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {stages.map((stage) => {
              const fixedStage = isFixedOpportunityStage(stage);
              return (
                <div key={stage.id} className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] px-3 py-2">
                  <div className="min-w-0">
                    {editingStageId === stage.id ? (
                      <input
                        className="input h-9 min-w-[260px] max-w-full"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        disabled={saving}
                      />
                    ) : (
                      <div className="truncate text-sm font-medium">{stage.value}</div>
                    )}
                    <div className="text-xs text-[rgb(var(--muted))]">
                      {stage.is_active ? "Ativo" : "Inativo"} • Ordem: {stage.sort_order}
                      {" • Prob.: " + String(Math.max(0, Math.min(100, Number(stage.probability_percent ?? 0)))) + "%"}
                      {fixedStage ? " • Fixo do sistema" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingStageId === stage.id ? (
                      <>
                        <button className="btn btn-secondary" onClick={cancelEdit} disabled={saving}>
                          Cancelar
                        </button>
                        <button className="btn btn-primary" onClick={() => void saveStageName(stage)} disabled={saving || !editingValue.trim()}>
                          Salvar
                        </button>
                      </>
                    ) : !fixedStage ? (
                      <button className="btn btn-secondary" onClick={() => beginEdit(stage)} disabled={saving}>
                        Editar
                      </button>
                    ) : null}
                    {!fixedStage ? (
                      <button className="btn btn-secondary" onClick={() => void toggleActive(stage)} disabled={saving}>
                        {stage.is_active ? "Inativar" : "Ativar"}
                      </button>
                    ) : null}
                    {!fixedStage ? (
                      <button
                        className="btn btn-secondary border-red-200 text-red-700"
                        onClick={() => openDeleteModal(stage)}
                        disabled={saving}
                      >
                        Deletar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={!!deletingStage}
        title="Deletar stage da oportunidade"
        onClose={closeDeleteModal}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeDeleteModal} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-secondary border-red-200 text-red-700" onClick={() => void deleteStage()} disabled={saving}>
              {saving ? "Deletando..." : "Deletar stage"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-[rgb(var(--muted))]">
            As oportunidades deste stage serão migradas para outro stage antes da exclusão.
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3 text-sm">
            Stage atual: <span className="font-semibold">{deletingStage?.value || "-"}</span>
          </div>
          <div>
            <label className="text-sm text-[rgb(var(--muted))]">Stage de destino (obrigatório)</label>
            <select
              className="input mt-1"
              value={replacementStageId}
              onChange={(e) => setReplacementStageId(e.target.value)}
              disabled={saving || replacementOptions.length === 0}
            >
              {replacementOptions.length === 0 ? (
                <option value="">Nenhum stage ativo disponível</option>
              ) : (
                replacementOptions.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.value} ({Math.max(0, Math.min(100, Number(stage.probability_percent ?? 0)))}%)
                  </option>
                ))
              )}
            </select>
          </div>
          {deleteErr && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{deleteErr}</div>}
        </div>
      </Modal>
    </div>
  );
}

export function AppObjectsConfigPage() {
  const nav = useNavigate();
  const { appKey } = useParams<{ appKey: AppKey }>();
  const [selectedObject, setSelectedObject] = useState<AppCoreObject | null>(null);
  const [activeTab, setActiveTab] = useState<ObjectTabKey>("field-config");

  const cfg = appKey ? APP_CONFIG[appKey] : undefined;

  useEffect(() => {
    setSelectedObject(null);
    setActiveTab("field-config");
  }, [appKey]);

  if (!cfg) {
    return (
      <div className="space-y-4">
        <div className="panel rounded-2xl p-6">
          <div className="text-lg font-semibold">App não encontrado</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">Selecione um app válido no menu lateral.</div>
          <button className="btn btn-secondary mt-4" onClick={() => nav("/settings")}>
            Voltar para Configurações
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="text-sm font-semibold">{cfg.label} - Objetos Core</div>
        {cfg.coreObjects.length > 0 ? (
          <div className="mt-3 space-y-3">
            <div className="text-xs text-[rgb(var(--muted))]">
              Selecione um objeto para abrir a configuração de campos desse objeto.
            </div>
            {appKey === "comercial" && (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary" onClick={() => nav("/settings/admin/apps/comercial/order-form")}>
                  Order Form
                </button>
                <button className="btn btn-secondary" onClick={() => nav("/settings/admin/apps/comercial/produtos/catalogo")}>
                  Produtos
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {cfg.coreObjects.map((o) => (
                <button
                  key={o.entityType}
                  className={selectedObject?.entityType === o.entityType ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => {
                    setSelectedObject(o);
                    setActiveTab("field-config");
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-[rgb(var(--muted))]">
            Defina os objetos deste app em Provisionamento de Campos e Objetos customizados.
          </div>
        )}
      </div>

      {selectedObject && (
        <div className="panel rounded-2xl p-6">
          <div className="text-sm font-semibold">{selectedObject.label} - Configuração</div>

          <div className="mt-4 flex flex-wrap gap-2 border-b border-[rgb(var(--border))] pb-3">
            <button
              className={activeTab === "field-config" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => setActiveTab("field-config")}
            >
              Configuração dos Campos
            </button>
            {selectedObject.entityType === "contact" && (
              <button
                className={activeTab === "contact-roles" ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setActiveTab("contact-roles")}
              >
                Contact Roles
              </button>
            )}
            {selectedObject.entityType === "opportunity" && (
              <button
                className={activeTab === "opportunity-stages" ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setActiveTab("opportunity-stages")}
              >
                Stages da Oportunidade
              </button>
            )}
          </div>

          {activeTab === "field-config" && (
            <div className="mt-4">
              <ProvisioningFieldsPage coreEntityType={selectedObject.entityType} embedded lockEntitySelection />
            </div>
          )}

          {activeTab === "contact-roles" && selectedObject.entityType === "contact" && (
            <ContactRolesTab />
          )}

          {activeTab === "opportunity-stages" && selectedObject.entityType === "opportunity" && (
            <OpportunityStagesTab />
          )}
        </div>
      )}
    </div>
  );
}
