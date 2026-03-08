import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch, type ApiError } from "../../lib/apiClient";
import RolePermissionsEditor, { type PermissionDTO } from "../components/RolePermissionsEditor";

type RoleDTO = {
  id: string;
  key: string;
  name: string;
  kind: string;
  is_locked: boolean;
};

function isAbortError(e: unknown) {
  const anyE = e as any;
  return anyE?.name === "AbortError" || String(anyE?.message ?? "").toLowerCase().includes("aborted");
}

function toKey(p: PermissionDTO) {
  return `${p.app}|${p.resource}|${p.action}`;
}

function fromKey(k: string): PermissionDTO {
  const [app, resource, action] = k.split("|");
  return { app, resource, action: action as any };
}

function normalizeManual(perms: PermissionDTO[]) {
  return perms
    .map((p) => ({ app: p.app.trim(), resource: p.resource.trim(), action: p.action }))
    .filter((p) => p.app && p.resource && p.action && p.action !== "*");
}

export function RoleEditPage() {
  const { id } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [role, setRole] = useState<RoleDTO | null>(null);
  const [name, setName] = useState("");

  const [fullAccess, setFullAccess] = useState(false);
  const [permissionSet, setPermissionSet] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<PermissionDTO[]>([]);

  const isLocked = role?.is_locked ?? false;

  const canEdit = useMemo(() => {
    // Backend valida RBAC; aqui só melhora UX (desabilitar)
    return true;
  }, []);

  async function load() {
    if (!id) return;
    setLoading(true);
    setErr(null);

    const ctrl = new AbortController();
    try {
      const r = await apiFetch<RoleDTO>(`/roles/${id}`, { signal: ctrl.signal });
      const perms = await apiFetch<PermissionDTO[]>(`/roles/${id}/permissions`, { signal: ctrl.signal });

      setRole(r);
      setName(r.name);

      const hasFull = perms.some((p) => p.app === "*" && p.resource === "*" && p.action === "*");
      setFullAccess(hasFull);

      const s = new Set<string>();
      for (const p of perms) {
        if (p.app === "*" && p.resource === "*" && p.action === "*") continue;
        s.add(toKey(p));
      }
      setPermissionSet(s);

      // Permissões manuais: por padrão, vazio (usuario pode adicionar). Se quiser,
      // você pode popular a partir de recursos fora do catálogo, mas sem catálogo oficial não é confiável.
      setManual([]);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setErr((e as ApiError)?.message ?? "Falha ao carregar perfil");
    } finally {
      setLoading(false);
    }

    return () => ctrl.abort();
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!id || !role) return;

    setErr(null);

    if (!name.trim()) {
      setErr("Informe o nome do perfil.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/roles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });

      const permissions: PermissionDTO[] = fullAccess
        ? [{ app: "*", resource: "*", action: "*" }]
        : [
            ...Array.from(permissionSet.values()).map(fromKey),
            ...normalizeManual(manual),
          ].filter((p) => p.app && p.resource && p.action);

      await apiFetch(`/roles/${id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      });

      await load();
    } catch (e: any) {
      setErr((e as ApiError)?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || !role) return;
    if (role.is_locked) return;

    const ok = confirm("Deletar este perfil? Esta ação não pode ser desfeita.");
    if (!ok) return;

    setErr(null);
    setSaving(true);
    try {
      await apiFetch(`/roles/${id}`, { method: "DELETE" });
      nav("/settings/admin/roles");
    } catch (e: any) {
      setErr((e as ApiError)?.message ?? "Falha ao deletar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="panel rounded-2xl p-6">
        <div className="text-lg font-semibold">Perfil</div>
        <div className="mt-1 text-sm text-[rgb(var(--muted))]">Carregando...</div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="panel rounded-2xl p-6">
        <div className="text-lg font-semibold">Perfil</div>
        <div className="mt-1 text-sm text-[rgb(var(--muted))]">Não encontrado.</div>
        <div className="mt-4">
          <Link className="btn" to="/settings/admin/roles">
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="text-lg font-semibold">Editar Perfil</div>
            <div className="text-sm text-[rgb(var(--muted))]">
              <span className="font-mono text-xs">{role.key}</span> • {role.kind}{" "}
              {role.is_locked ? <span className="chip ml-2">Bloqueado</span> : <span className="chip ml-2">Editável</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link className="btn" to="/settings/admin/roles">
              Voltar
            </Link>
            {!role.is_locked && (
              <button className="btn" type="button" onClick={() => void remove()} disabled={saving}>
                Deletar
              </button>
            )}
            <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={saving || !canEdit}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
        )}

        <div className="mt-5 grid gap-4">
          <div className="rounded-xl border p-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nome</label>
              <input
                className="input max-w-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving || (isLocked && role.kind !== "CUSTOM")}
              />
              <div className="text-xs text-[rgb(var(--muted))]">
                Perfis bloqueados não podem ser renomeados (exceto “Customizado”, se permitido).
              </div>
            </div>
          </div>
        </div>
      </div>

      <RolePermissionsEditor
        title="Permissões"
        subtitle="App → Objeto → CRUD (create/read/update/delete). O backend valida tudo."
        fullAccess={fullAccess}
        onFullAccessChange={setFullAccess}
        permissionSet={permissionSet}
        onPermissionSetChange={setPermissionSet}
        manual={manual}
        onManualChange={setManual}
        disabled={saving}
      />
    </div>
  );
}

export default RoleEditPage;