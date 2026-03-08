// crm/web/src/settings/pages/BusinessUnitEditPage.tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../lib/apiClient";
import { ContractPage } from "./ContractPage";

type TenantOut = {
  id: string;
  name: string;
  address: string;
  admin_root_user_id?: string | null;
};

type TenantAppOut = { key: string; label: string; enabled: boolean };

type TabKey = "dados" | "aplicativos" | "contrato";

function isId18(v: string) {
  return /^[A-Z0-9]{3}[A-Z0-9]{15}$/.test(v.trim());
}

function tabButton(active: boolean) {
  return [
    "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
    "border-[rgb(var(--border))]",
    active ? "bg-[rgb(var(--panel))]" : "bg-transparent hover:bg-[rgb(var(--panel))]",
  ].join(" ");
}

export function BusinessUnitEditPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [tab, setTab] = useState<TabKey>("dados");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantOut | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [adminRootUserId, setAdminRootUserId] = useState("");

  // Apps tab state
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsErr, setAppsErr] = useState<string | null>(null);
  const [apps, setApps] = useState<TenantAppOut[]>([]);
  const [appsDirty, setAppsDirty] = useState(false);
  const [appsSaving, setAppsSaving] = useState(false);

  async function loadTenant() {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<TenantOut>(`/root/tenants/${id}`);
      setTenant(data);
      setName(data.name ?? "");
      setAddress(data.address ?? "");
      setAdminRootUserId(data.admin_root_user_id ?? "");
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao carregar tenant.");
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadApps() {
    if (!id) return;
    setAppsLoading(true);
    setAppsErr(null);
    try {
      const data = await apiFetch<TenantAppOut[]>(`/root/tenants/${id}/apps`);
      setApps(data ?? []);
      setAppsDirty(false);
    } catch (e: any) {
      setAppsErr(e?.message ?? "Falha ao carregar aplicativos do tenant.");
      setApps([]);
    } finally {
      setAppsLoading(false);
    }
  }

  useEffect(() => {
    void loadTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === "aplicativos") void loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const payloadPreview = useMemo(() => {
    return {
      name: name.trim(),
      address: address.trim(),
      admin_root_user_id: adminRootUserId.trim() ? adminRootUserId.trim() : null,
    };
  }, [name, address, adminRootUserId]);

  function validateDados() {
    if (!name.trim()) return "Informe o nome do Tenant.";
    if (name.trim().length > 200) return "Nome do Tenant deve ter no máximo 200 caracteres.";
    if (address.trim().length > 500) return "Endereço deve ter no máximo 500 caracteres.";
    if (adminRootUserId.trim() && !isId18(adminRootUserId.trim())) {
      return "Admin Root User ID inválido. Use um ID 18 chars (ex: USRxxxxxxxxxxxxxxx).";
    }
    return null;
  }

  async function onSaveDados(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const v = validateDados();
    if (v) return setErr(v);
    if (!id) return setErr("ID inválido.");

    setSaving(true);
    try {
      const updated = await apiFetch<TenantOut>(`/root/tenants/${id}`, {
        method: "PATCH",
        csrf: true,
        body: payloadPreview,
      });
      setTenant(updated);
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  }

  function toggleApp(key: string) {
    setApps((prev) => prev.map((a) => (a.key === key ? { ...a, enabled: !a.enabled } : a)));
    setAppsDirty(true);
  }

  async function onSaveApps() {
    if (!id) return;
    setAppsSaving(true);
    setAppsErr(null);

    try {
      const payload: { apps: Record<string, boolean> } = { apps: {} };
      for (const a of apps) payload.apps[a.key] = a.enabled;

      const updated = await apiFetch<TenantAppOut[]>(`/root/tenants/${id}/apps`, {
        method: "PUT",
        csrf: true,
        body: payload,
      });

      setApps(updated ?? []);
      setAppsDirty(false);
    } catch (e: any) {
      setAppsErr(e?.message ?? "Falha ao salvar aplicativos.");
    } finally {
      setAppsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Editar Tenant</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">
              {tenant ? (
                <>
                  <span className="font-semibold text-[rgb(var(--text))]">{tenant.name}</span>{" "}
                  <span className="font-mono opacity-70">({tenant.id})</span>
                </>
              ) : (
                <span className="font-mono opacity-70">{id}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/settings/root/business-units"
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm hover:bg-[rgb(var(--panel))]"
            >
              Voltar
            </Link>
            <button
              type="button"
              className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm hover:bg-[rgb(var(--panel))]"
              onClick={() => nav(`/settings/root/business-units/${id}/edit`)}
              disabled={loading}
            >
              Recarregar
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={tabButton(tab === "dados")} onClick={() => setTab("dados")}>
            Dados
          </button>
          <button type="button" className={tabButton(tab === "aplicativos")} onClick={() => setTab("aplicativos")}>
            Aplicativos
          </button>
          <button type="button" className={tabButton(tab === "contrato")} onClick={() => setTab("contrato")}>
            Contrato
          </button>
        </div>
      </div>

      {err && (
        <div className="panel rounded-2xl p-6">
          <div className="text-sm font-semibold">Atenção</div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">{err}</div>
        </div>
      )}

      {loading && <div className="panel rounded-2xl p-6 text-sm text-[rgb(var(--muted))]">Carregando…</div>}

      {!loading && tab === "dados" && (
        <div className="panel rounded-2xl p-6">
          <div className="mb-4 text-sm text-[rgb(var(--muted))]">Dados do tenant.</div>

          <form className="grid gap-4" onSubmit={onSaveDados}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-[rgb(var(--muted))]">Nome *</span>
                <input
                  className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-[rgb(var(--muted))]">Admin Root User ID (opcional)</span>
                <input
                  className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                  value={adminRootUserId}
                  onChange={(e) => setAdminRootUserId(e.target.value)}
                  placeholder="Ex: USRxxxxxxxxxxxxxxx"
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="text-[rgb(var(--muted))]">Endereço</span>
              <textarea
                className="min-h-[88px] rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-xs text-[rgb(var(--muted))]">
                Payload: <span className="font-mono">{JSON.stringify(payloadPreview)}</span>
              </div>

              <button
                type="submit"
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && tab === "aplicativos" && (
        <div className="panel rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Aplicativos</div>
              <div className="mt-1 text-sm text-[rgb(var(--muted))]">
                Selecione os aplicativos contratados para este tenant (camada contrato).
              </div>
            </div>

            <button
              type="button"
              className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              disabled={!appsDirty || appsSaving}
              onClick={() => void onSaveApps()}
            >
              {appsSaving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>

          {appsErr && (
            <div className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-3 text-sm">
              <div className="font-semibold">Atenção</div>
              <div className="mt-1 text-[rgb(var(--muted))]">{appsErr}</div>
            </div>
          )}

          {appsLoading && <div className="mt-4 text-sm text-[rgb(var(--muted))]">Carregando aplicativos…</div>}

          {!appsLoading && apps.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[rgb(var(--border))]">
              <table className="w-full text-sm">
                <thead className="bg-[rgb(var(--panel-2))] text-[rgb(var(--muted))]">
                  <tr className="border-b border-[rgb(var(--border))]">
                    <th className="px-4 py-3 text-left font-semibold">Aplicativo</th>
                    <th className="px-4 py-3 text-left font-semibold">Chave</th>
                    <th className="px-4 py-3 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a, idx) => (
                    <tr
                      key={a.key}
                      className={[
                        "border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--panel))]",
                        idx % 2 === 1 ? "bg-[rgba(255,255,255,0.01)]" : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3 font-semibold text-[rgb(var(--text))]">{a.label}</td>
                      <td className="px-4 py-3 font-mono text-[rgb(var(--muted))]">{a.key}</td>
                      <td className="px-4 py-3 text-right">
                        <label className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={a.enabled} onChange={() => toggleApp(a.key)} />
                          <span className="text-sm text-[rgb(var(--muted))]">
                            {a.enabled ? "Habilitado" : "Desabilitado"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!appsLoading && apps.length === 0 && !appsErr && (
            <div className="mt-4 text-sm text-[rgb(var(--muted))]">Nenhum aplicativo disponível.</div>
          )}
        </div>
      )}

      {!loading && tab === "contrato" && (
        <div className="panel rounded-2xl p-6">
          <ContractPage tenantId={id!} embedded />
        </div>
      )}
    </div>
  );
}