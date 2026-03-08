import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useBusinessUnit } from "../bu/BusinessUnitContext";
import { IconBell, IconSearch } from "../ui/Icon";

function LogoMark() {
  return (
    <svg viewBox="0 0 28 28" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M14 2.5c6.35 0 11.5 5.15 11.5 11.5S20.35 25.5 14 25.5 2.5 20.35 2.5 14 7.65 2.5 14 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.8"
      />
      <path
        d="M9.3 16.8c1.1 2.2 3.2 3.6 5.9 3.6 2.6 0 4.6-1.2 5.6-3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 11.2c.9-2.2 3-3.6 5.8-3.6 2.2 0 4 .9 5.1 2.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

function IconDots() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function TopBar(props: {
  onOpenLauncher: () => void;
  title: string;
  onGoHome: () => void;
}) {
  const { onOpenLauncher, onGoHome } = props;
  const [q, setQ] = useState("");
  const { user, logout } = useAuth();
  const { businessUnits, activeBu, setActiveBu } = useBusinessUnit();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(e: MouseEvent) {
      const el = menuRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setMenuOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const name = useMemo(() => {
    const v = (user as any)?.name ?? (user as any)?.full_name ?? (user as any)?.nome ?? null;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }, [user]);

  const email = useMemo(() => {
    const v = (user as any)?.email ?? null;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }, [user]);

  const displayName = useMemo(() => name ?? email ?? "Usuário", [name, email]);

  const initials = useMemo(() => {
    const source = name ?? email ?? "Usuário";
    const parts = source.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "U";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
    return (first + last).toUpperCase();
  }, [name, email]);

  return (
    <header className="sticky top-0 z-30 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
      <div className="flex h-14 w-full items-center gap-3 px-4">
        {/* LEFT */}
        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={onOpenLauncher}
            aria-label="Abrir aplicativos"
            title="Abrir aplicativos"
          >
            <LogoMark />
            <span className="hidden sm:inline">Claric CRM</span>
          </button>

          <button className="hidden text-sm font-semibold md:inline" onClick={onGoHome}>
            Claric CRM
          </button>
        </div>

        {/* CENTER (Search) */}
        <div className="hidden flex-1 justify-center md:flex">
          <div className="panel-2 flex w-[min(520px,100%)] items-center gap-2 rounded-xl px-3 py-2">
            <IconSearch />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-[rgb(var(--muted))]"
              placeholder="Buscar..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* RIGHT */}
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {/* Unidade (desktop) */}
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-xs text-[rgb(var(--muted))]">Unidade</span>
            <select
              className="panel-2 h-9 rounded-xl px-3 text-sm outline-none"
              value={activeBu?.id ?? ""}
              onChange={(e) => setActiveBu(e.target.value)}
              aria-label="Selecionar Unidade de Negócio"
              title="Unidade de Negócio"
              disabled={businessUnits.length <= 1}
            >
              {businessUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <button className="btn" aria-label="Notificações">
            <IconBell />
          </button>

          {/* Avatar com tooltip */}
          <div className="relative group">
            <div
              className="panel grid h-9 w-9 place-items-center rounded-full text-xs font-semibold"
              aria-label={`Usuário: ${displayName}`}
            >
              {initials}
            </div>

            <div
              className="pointer-events-none absolute left-1/2 top-full mt-2 hidden w-max max-w-[280px] -translate-x-1/2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2 text-xs text-[rgb(var(--text))] shadow-lg group-hover:block"
              role="tooltip"
            >
              <div className="font-semibold">{displayName}</div>
              {email && <div className="mt-0.5 text-[rgb(var(--muted))]">{email}</div>}
            </div>
          </div>

          {/* Menu 3 pontinhos (click) */}
          <div className="relative" ref={menuRef}>
            <button
              className="btn text-[rgb(var(--muted))]"
              aria-label="Menu do usuário"
              title="Menu"
              type="button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <IconDots />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-[rgb(var(--border))] bg-slate-100 p-1 shadow-lg">
                <a
                  href="/settings"
                  className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-white"
                  onClick={() => setMenuOpen(false)}
                >
                  Configurações
                </a>
                <div className="my-1 h-px bg-slate-200" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-white"
                >
                  Sair
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Search (mobile) */}
      <div className="w-full px-4 pb-3 md:hidden">
        <div className="panel-2 flex items-center gap-2 rounded-xl px-3 py-2">
          <IconSearch />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-[rgb(var(--muted))]"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Unidade (mobile) */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-[rgb(var(--muted))]">Unidade</span>
          <select
            className="panel-2 h-9 flex-1 rounded-xl px-3 text-sm outline-none"
            value={activeBu?.id ?? ""}
            onChange={(e) => setActiveBu(e.target.value)}
            aria-label="Selecionar Unidade de Negócio"
            title="Unidade de Negócio"
            disabled={businessUnits.length <= 1}
          >
            {businessUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}