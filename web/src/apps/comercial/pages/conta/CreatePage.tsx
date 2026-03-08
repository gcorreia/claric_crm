// web/src/apps/comercial/pages/conta/CreatePage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../../../lib/apiClient";
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

type AccountIn = {
  name: string;
  owner_id: string | null;
  custom_fields: Record<string, any>;
};

function userLabel(u: UserOut): string {
  const name = (u.name || "").trim();
  const email = (u.email || "").trim();
  return name || email || u.id;
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

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

export function ContaCreatePage() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");

  const [users, setUsers] = useState<UserOut[]>([]);
  const [customDefs, setCustomDefs] = useState<CustomFieldDef[]>([]);
  const [customSessions, setCustomSessions] = useState<CustomFieldSession[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const requiredMissing = useMemo(() => missingRequired(customDefs, customValues), [customDefs, customValues]);

  useEffect(() => {
    if (user?.id) setOwnerId(user.id);
  }, [user?.id]);

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        const [sessions, defs, us] = await Promise.all([
          apiFetch<CustomFieldSession[]>(`/crm/provisioning/field-sessions?entity_type=account`, {
            signal: ctrl.signal,
          } as any).catch(() => [] as CustomFieldSession[]),
          apiFetch<CustomFieldDef[]>(`/crm/provisioning/fields?entity_type=account`, { signal: ctrl.signal } as any),
          apiFetch<UserOut[]>("/users", { signal: ctrl.signal } as any).catch(() => [] as UserOut[]),
        ]);

        setCustomSessions(sessions || []);
        setCustomDefs((defs || []).filter((d) => d.is_active));
        setUsers(us || []);
      } catch (e: any) {
        if (isAbortError(e)) return;
        setErr(String(e?.message || e));
      }
    })();

    return () => ctrl.abort();
  }, []);

  async function save() {
    setErr(null);

    if (!name.trim()) {
      setErr("Nome é obrigatório.");
      return;
    }

    if (!ownerId) {
      setErr("Owner é obrigatório.");
      return;
    }

    if (requiredMissing.length) {
      setErr(`Preencha os campos obrigatórios: ${requiredMissing.join(", ")}`);
      return;
    }

    const payload: AccountIn = {
      name: name.trim(),
      owner_id: ownerId || null,
      custom_fields: customValues,
    };

    setSaving(true);
    try {
      await apiFetch("/crm/accounts", {
        method: "POST",
        body: payload,
        csrf: true,
      });
      nav("/comercial/contas");
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full min-h-0">
      <section className="panel flex h-full min-h-0 flex-col overflow-hidden border border-[rgb(var(--border))] !rounded-none">
        <header className="shrink-0 flex flex-col gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold">Nova Conta</div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Layout estilo grid com sessões e frames do Provisionamento.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={() => nav(-1)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-success" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar conta"}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {err && (
              <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
            )}

            <section className="overflow-hidden border-t border-[rgb(var(--border))]">
              <div className="sf-band bg-[#d1e1f8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Detalhes da Conta
              </div>
              <div className="bg-[rgb(var(--panel))]">
                <div className="grid grid-cols-1 border-t border-[rgb(var(--border))] md:grid-cols-2">
                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Nome *</label>
                    <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>

                  <div className="border-b border-[rgb(var(--border))] p-3">
                    <label className="text-sm text-[rgb(var(--muted))]">Owner *</label>
                    <select className="input mt-1 w-full" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {userLabel(u)}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-[rgb(var(--muted))]">Pré-selecionado como o usuário logado.</div>
                  </div>
                </div>
              </div>
            </section>

            <div className="border-t border-[rgb(var(--border))]">
              <CustomFieldsBySession
                sessions={customSessions}
                defs={customDefs}
                values={customValues}
                onChange={setCustomValues}
                mode="create"
                emptyLabel="Nenhum campo customizado ativo para Conta."
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
