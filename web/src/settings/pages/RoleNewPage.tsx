import React from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

type RoleDTO = {
  id: number | string;
  name: string;
  key: string;
  kind: string;
  is_locked: boolean;
  business_unit_id: number | null;
};

type PermissionDTO = {
  app: string;
  resource: string;
  action: string; // create|read|update|delete|*
};

type CreateRoleBody = { name: string };
type UpdateRoleBody = { name: string };
type ReplacePermissionsBody = { permissions: PermissionDTO[] };

const CRUD: Array<PermissionDTO["action"]> = ["create", "read", "update", "delete"];

// Catálogo básico (você pode expandir depois).
const CATALOG: Array<{ app: string; resources: string[] }> = [
  { app: "settings", resources: ["users", "roles", "business_units"] },
  { app: "objects", resources: ["custom_objects"] },
  { app: "email", resources: ["settings"] },
  { app: "comercial", resources: ["leads", "deals", "contacts"] },
  { app: "academico", resources: ["students", "classes", "enrollments"] },
  { app: "financeiro", resources: ["invoices", "payments"] },
];

function uniqKey(app: string, resource: string) {
  return `${app}::${resource}`;
}

function toSet(perms: PermissionDTO[]) {
  const s = new Set<string>();
  for (const p of perms) s.add(`${p.app}|${p.resource}|${p.action}`);
  return s;
}

function fromSet(s: Set<string>): PermissionDTO[] {
  const out: PermissionDTO[] = [];
  for (const k of s.values()) {
    const [app, resource, action] = k.split("|");
    out.push({ app, resource, action: action as any });
  }
  return out;
}

export function RoleNewPage() {
  const nav = useNavigate();
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [fullAccess, setFullAccess] = React.useState(false);
  const [permSet, setPermSet] = React.useState<Set<string>>(new Set());
  const [manualRows, setManualRows] = React.useState<Array<PermissionDTO>>([]);

  function toggle(app: string, resource: string, action: PermissionDTO["action"]) {
    setPermSet((prev) => {
      const next = new Set(prev);
      const key = `${app}|${resource}|${action}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isChecked(app: string, resource: string, action: PermissionDTO["action"]) {
    return permSet.has(`${app}|${resource}|${action}`);
  }

  function addManual() {
    setManualRows((r) => [...r, { app: "", resource: "", action: "read" }]);
  }

  function updateManual(i: number, patch: Partial<PermissionDTO>) {
    setManualRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeManual(i: number) {
    setManualRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  function buildPermissions(): PermissionDTO[] {
    if (fullAccess) return [{ app: "*", resource: "*", action: "*" }];
    const base = fromSet(permSet);
    const manual = manualRows
      .map((r) => ({
        app: r.app.trim(),
        resource: r.resource.trim(),
        action: r.action,
      }))
      .filter((r) => r.app && r.resource && r.action);
    return [...base, ...manual];
  }

  async function onCreate() {
    setErr(null);
    if (!name.trim()) {
      setErr("Informe o nome do perfil.");
      return;
    }

    setSaving(true);
    try {
      const created = await apiFetch<RoleDTO>("/roles", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() } satisfies CreateRoleBody),
      });

      const permissions = buildPermissions();
      await apiFetch<void>(`/roles/${created.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions } satisfies ReplacePermissionsBody),
      });

      nav(`/settings/admin/roles/${created.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao criar perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Novo Perfil</h1>
        <p className="text-sm text-muted-foreground">Crie um perfil customizado para a unidade.</p>
      </div>

      {err && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="rounded-lg border p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Nome</label>
          <input
            className="w-full max-w-lg rounded-md border px-3 py-2 text-sm"
            placeholder="Ex.: Coordenador"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="fullaccess"
            type="checkbox"
            checked={fullAccess}
            onChange={(e) => setFullAccess(e.target.checked)}
          />
          <label htmlFor="fullaccess" className="text-sm">
            Acesso total (equivalente a <span className="font-mono text-xs">*</span>/<span className="font-mono text-xs">*</span>/
            <span className="font-mono text-xs">*</span>)
          </label>
        </div>
      </div>

      {!fullAccess && (
        <div className="rounded-lg border p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Permissões (App → Objeto → CRUD)</div>
            <div className="text-xs text-muted-foreground">
              Marque o que este perfil pode fazer. (O backend continua validando.)
            </div>
          </div>

          <div className="space-y-4">
            {CATALOG.map((section) => (
              <div key={section.app} className="rounded-md border">
                <div className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">{section.app}</div>
                <div className="p-3 space-y-3">
                  {section.resources.map((res) => (
                    <div key={uniqKey(section.app, res)} className="flex items-center justify-between gap-3">
                      <div className="text-sm font-mono">{res}</div>
                      <div className="flex items-center gap-3">
                        {CRUD.map((a) => (
                          <label key={a} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={isChecked(section.app, res, a)}
                              onChange={() => toggle(section.app, res, a)}
                            />
                            {a}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Permissões manuais</div>
                <div className="text-xs text-muted-foreground">Para recursos fora do catálogo (app/resource/action).</div>
              </div>
              <button className="rounded-md border px-3 py-2 text-xs" onClick={addManual}>
                + Adicionar
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {manualRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma permissão manual.</div>
              ) : (
                manualRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="col-span-4 rounded-md border px-2 py-2 text-sm"
                      placeholder="app"
                      value={row.app}
                      onChange={(e) => updateManual(i, { app: e.target.value })}
                    />
                    <input
                      className="col-span-5 rounded-md border px-2 py-2 text-sm"
                      placeholder="resource"
                      value={row.resource}
                      onChange={(e) => updateManual(i, { resource: e.target.value })}
                    />
                    <select
                      className="col-span-2 rounded-md border px-2 py-2 text-sm"
                      value={row.action}
                      onChange={(e) => updateManual(i, { action: e.target.value as any })}
                    >
                      {CRUD.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                      <option value="*">*</option>
                    </select>
                    <button className="col-span-1 rounded-md border px-2 py-2 text-xs" onClick={() => removeManual(i)}>
                      X
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button className="rounded-md border px-4 py-2 text-sm" onClick={() => nav("/settings/admin/roles")}>
          Cancelar
        </button>
        <button
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => void onCreate()}
          disabled={saving}
        >
          {saving ? "Salvando..." : "Criar"}
        </button>
      </div>
    </div>
  );
}