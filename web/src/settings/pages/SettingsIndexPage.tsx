import { useAuth } from "../../auth/AuthContext";

export function SettingsIndexPage() {
  const { user } = useAuth();
  const isRoot = Boolean(user?.is_root);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-semibold text-[rgb(var(--text))]">Configurações</div>
        <div className="mt-1 text-sm text-[rgb(var(--muted))]">
          Gerencie usuários, permissões e parâmetros do sistema.
        </div>
      </div>

      {isRoot && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[rgb(var(--border))] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[rgb(var(--text))]">
              ROOT
            </span>
            <div className="text-sm font-semibold text-[rgb(var(--text))]">Modo Root ativo</div>
          </div>
          <div className="mt-1 text-sm text-[rgb(var(--muted))]">
            Você tem acesso global a todas as Unidades de Negócio. Itens da seção Root ficam disponíveis no menu lateral.
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-4">
        <div className="text-sm font-semibold text-[rgb(var(--text))]">Dicas rápidas</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[rgb(var(--muted))]">
          <li>Use a busca no menu lateral para encontrar configurações rapidamente.</li>
          <li>Perfis controlam permissões e visibilidade de recursos no sistema.</li>
        </ul>
      </div>
    </div>
  );
}