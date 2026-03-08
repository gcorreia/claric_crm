// crm/web/src/settings/pages/BusinessUnitNewPage.tsx
import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/apiClient";

type TenantCreateIn = {
  name: string;
  address?: string;
  admin_root_user_id?: string | null;
};

function isId18(v: string) {
  return /^[A-Z0-9]{3}[A-Z0-9]{15}$/.test(v.trim());
}

export function BusinessUnitNewPage() {
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [adminRootUserId, setAdminRootUserId] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const payloadPreview = useMemo((): TenantCreateIn => {
    const out: TenantCreateIn = {
      name: name.trim(),
      address: address.trim(),
    };
    const admin = adminRootUserId.trim();
    out.admin_root_user_id = admin ? admin : null;
    return out;
  }, [name, address, adminRootUserId]);

  function validate() {
    if (!name.trim()) return "Informe o nome do Tenant.";
    if (name.trim().length > 200) return "Nome do Tenant deve ter no máximo 200 caracteres.";
    if (address.trim().length > 500) return "Endereço deve ter no máximo 500 caracteres.";
    if (adminRootUserId.trim() && !isId18(adminRootUserId.trim())) {
      return "Admin Root User ID inválido. Use um ID 18 chars (ex: USRxxxxxxxxxxxxxxx).";
    }
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const v = validate();
    if (v) return setErr(v);

    setSaving(true);
    try {
      await apiFetch("/root/tenants", { method: "POST", csrf: true, body: payloadPreview });
      nav("/settings/root/business-units");
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao criar tenant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Novo Tenant</div>
            <div className="mt-1 text-sm text-[rgb(var(--muted))]">Root-only. Backend usa “Business Unit”.</div>
          </div>

          <button
            type="button"
            className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm hover:bg-[rgb(var(--panel))]"
            onClick={() => nav(-1)}
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="panel rounded-2xl p-6">
        {err && (
          <div className="mb-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-3 text-sm">
            <div className="font-semibold">Atenção</div>
            <div className="mt-1 text-[rgb(var(--muted))]">{err}</div>
          </div>
        )}

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-[rgb(var(--muted))]">Nome do Tenant *</span>
              <input
                className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Acme Brasil"
                autoComplete="off"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-[rgb(var(--muted))]">Admin Root User ID (opcional)</span>
              <input
                className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
                value={adminRootUserId}
                onChange={(e) => setAdminRootUserId(e.target.value)}
                placeholder="Ex: USRxxxxxxxxxxxxxxx"
                autoComplete="off"
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="text-[rgb(var(--muted))]">Endereço</span>
            <textarea
              className="min-h-[88px] rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número, cidade, estado..."
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-[rgb(var(--muted))]">
              Payload: <span className="font-mono">{JSON.stringify(payloadPreview)}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm hover:bg-[rgb(var(--panel))]"
                onClick={() => nav("/settings/root/business-units")}
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}