import { useMemo } from "react";

export type CrudAction = "create" | "read" | "update" | "delete" | "*";

export type PermissionDTO = {
  app: string;
  resource: string;
  action: CrudAction;
};

const CRUD: Exclude<CrudAction, "*">[] = ["create", "read", "update", "delete"];

export type CatalogSection = { app: string; resources: string[] };

export type RolePermissionsEditorProps = {
  title?: string;
  subtitle?: string;

  fullAccess: boolean;
  onFullAccessChange: (v: boolean) => void;

  permissionSet: Set<string>;
  onPermissionSetChange: (next: Set<string>) => void;

  manual: PermissionDTO[];
  onManualChange: (next: PermissionDTO[]) => void;

  catalog?: CatalogSection[];
  disabled?: boolean;
};

function permKey(app: string, resource: string, action: string) {
  return `${app}|${resource}|${action}`;
}

export function RolePermissionsEditor(props: RolePermissionsEditorProps) {
  const catalog: CatalogSection[] = useMemo(
    () =>
      props.catalog ?? [
        { app: "settings", resources: ["users", "roles", "business_units"] },
        { app: "objects", resources: ["custom_objects"] },
        { app: "email", resources: ["settings"] },
        { app: "comercial", resources: ["leads", "deals", "contacts"] },
        { app: "academico", resources: ["students", "classes", "enrollments"] },
        { app: "financeiro", resources: ["invoices", "payments"] },
      ],
    [props.catalog],
  );

  function toggle(app: string, resource: string, action: Exclude<CrudAction, "*">) {
    props.onPermissionSetChange(
      (() => {
        const next = new Set(props.permissionSet);
        const k = permKey(app, resource, action);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      })(),
    );
  }

  function checked(app: string, resource: string, action: Exclude<CrudAction, "*">) {
    return props.permissionSet.has(permKey(app, resource, action));
  }

  function addManual() {
    props.onManualChange([...props.manual, { app: "", resource: "", action: "read" }]);
  }

  function updateManual(i: number, patch: Partial<PermissionDTO>) {
    props.onManualChange(props.manual.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeManual(i: number) {
    props.onManualChange(props.manual.filter((_, idx) => idx !== i));
  }

  return (
    <div className="panel rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="text-lg font-semibold">{props.title ?? "Permissões"}</div>
          <div className="text-sm text-[rgb(var(--muted))]">
            {props.subtitle ?? "Defina o que este perfil pode criar/ler/editar/deletar."}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.fullAccess}
            onChange={(e) => props.onFullAccessChange(e.target.checked)}
            disabled={props.disabled}
          />
          Acesso total <span className="font-mono text-xs text-[rgb(var(--muted))]">(*/*/*)</span>
        </label>
      </div>

      {!props.fullAccess && (
        <div className="mt-5 grid gap-4">
          {catalog.map((section) => (
            <div key={section.app} className="rounded-xl border">
              <div className="flex items-center justify-between border-b bg-[rgb(var(--muted-bg))] px-4 py-3">
                <div className="font-medium">{section.app}</div>
                <div className="text-xs text-[rgb(var(--muted))]">Objeto → CRUD</div>
              </div>

              <div className="grid gap-2 p-4">
                {section.resources.map((res) => (
                  <div key={`${section.app}::${res}`} className="flex items-center justify-between gap-4">
                    <div className="font-mono text-sm">{res}</div>
                    <div className="flex items-center gap-4">
                      {CRUD.map((a) => (
                        <label key={a} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={checked(section.app, res, a)}
                            onChange={() => toggle(section.app, res, a)}
                            disabled={props.disabled}
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

          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b bg-[rgb(var(--muted-bg))] px-4 py-3">
              <div className="grid gap-0.5">
                <div className="font-medium">Permissões manuais</div>
                <div className="text-xs text-[rgb(var(--muted))]">Para recursos fora do catálogo (app/resource/action).</div>
              </div>

              <button className="btn" type="button" onClick={addManual} disabled={props.disabled}>
                + Adicionar
              </button>
            </div>

            <div className="p-4">
              {props.manual.length === 0 ? (
                <div className="text-sm text-[rgb(var(--muted))]">Nenhuma permissão manual.</div>
              ) : (
                <div className="grid gap-2">
                  {props.manual.map((row, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <input
                        className="col-span-4 input"
                        placeholder="app (ex.: comercial)"
                        value={row.app}
                        onChange={(e) => updateManual(i, { app: e.target.value })}
                        disabled={props.disabled}
                      />
                      <input
                        className="col-span-5 input"
                        placeholder="resource (ex.: leads)"
                        value={row.resource}
                        onChange={(e) => updateManual(i, { resource: e.target.value })}
                        disabled={props.disabled}
                      />
                      <select
                        className="col-span-2 input"
                        value={row.action}
                        onChange={(e) => updateManual(i, { action: e.target.value as CrudAction })}
                        disabled={props.disabled}
                      >
                        {CRUD.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                        <option value="*">*</option>
                      </select>
                      <button
                        className="col-span-1 btn"
                        type="button"
                        onClick={() => removeManual(i)}
                        disabled={props.disabled}
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RolePermissionsEditor;