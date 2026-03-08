// crm/web/src/settings/SettingsNav.tsx
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { settingsNav } from "./nav";

type NavItem = { key: string; label: string; path?: string; children?: NavItem[] };

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d="M12 2.8c3 2.2 5.8 2.9 8 3.3v6.6c0 5.3-3.7 9-8 10.7-4.3-1.7-8-5.4-8-10.7V6.1c2.2-.4 5-1.1 8-3.3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevron(props: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 transition-transform ${props.open ? "rotate-90" : ""}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.5 5.5 12 10l-4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isActivePath(current: string, target?: string) {
  if (!target) return false;
  return current === target || current.startsWith(target + "/");
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function nodeMatchesPath(node: NavItem, currentPath: string): boolean {
  if (isActivePath(currentPath, node.path)) return true;
  return (node.children ?? []).some((c) => nodeMatchesPath(c, currentPath));
}

function filterNode(node: NavItem, queryNorm: string): NavItem | null {
  const hitSelf = normalize(node.label).includes(queryNorm);
  if (hitSelf) return { ...node, children: node.children ?? [] };

  const filteredChildren = (node.children ?? [])
    .map((c) => filterNode(c, queryNorm))
    .filter(Boolean) as NavItem[];

  if (filteredChildren.length) return { ...node, children: filteredChildren };
  return null;
}

function flattenNav(isRoot: boolean) {
  const sections = settingsNav as any[];
  const visible = sections.filter((sec) => sec.key !== "root" || isRoot);
  return visible.map((sec) => ({
    key: sec.key as string,
    label: sec.label as string,
    items: (sec.items as NavItem[]).map((it) => ({
      ...it,
      children: it.children ?? [],
    })),
  }));
}

export function SettingsNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isRoot = Boolean(user?.is_root);

  const [q, setQ] = useState("");
  const sections = useMemo(() => flattenNav(isRoot), [isRoot]);
  const qn = useMemo(() => normalize(q.trim()), [q]);

  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    for (const sec of sections) {
      for (const it of sec.items) {
        if (it.children?.length && nodeMatchesPath(it, pathname)) {
          setOpenKey(it.key);
          return;
        }
      }
    }
  }, [pathname, sections]);

  const filtered = useMemo(() => {
    if (!qn) return sections;

    return sections
      .map((sec) => {
        const items = sec.items
          .map((it) => filterNode(it, qn))
          .filter(Boolean) as NavItem[];

        return items.length ? { ...sec, items } : null;
      })
      .filter(Boolean) as Array<{ key: string; label: string; items: NavItem[] }>;
  }, [sections, qn]);

  useEffect(() => {
    if (!qn) return;
    const firstExpandable = filtered
      .flatMap((s) => s.items)
      .find((i) => (i.children?.length ?? 0) > 0);
    if (firstExpandable) setOpenKey(firstExpandable.key);
  }, [qn, filtered]);

  const rowBase = "group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors";
  const rowIdle = "text-[rgb(var(--text))] hover:bg-[rgb(var(--panel))]";
  const rowActive = "bg-[rgb(var(--panel))] font-semibold";

  const childBase = "flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors";
  const childIdle = "text-[rgb(var(--text))] hover:bg-[rgb(var(--panel))]";
  const childActive = "bg-[rgb(var(--panel))] font-semibold";

  const renderChildren = (nodes: NavItem[], depth = 0) => (
    <div className={cx(depth === 0 ? "ml-5" : "ml-4", "space-y-1 border-l border-[rgb(var(--border))] pl-3")}>
      {nodes.map((n) => {
        const activeNode = isActivePath(pathname, n.path);
        const hasChildren = (n.children?.length ?? 0) > 0;
        return (
          <div key={n.key} className="space-y-1">
            {n.path ? (
              <NavLink
                to={n.path}
                className={({ isActive }) => cx(childBase, isActive || activeNode ? childActive : childIdle, "relative")}
              >
                <span
                  className="absolute -left-[14px] top-1/2 h-[6px] w-[6px] -translate-y-1/2 rounded-full bg-[rgb(var(--muted))]"
                  aria-hidden="true"
                />
                <span className="truncate">{n.label}</span>
              </NavLink>
            ) : (
              <div className={cx(childBase, childIdle, "relative")}>
                <span
                  className="absolute -left-[14px] top-1/2 h-[6px] w-[6px] -translate-y-1/2 rounded-full bg-[rgb(var(--muted))]"
                  aria-hidden="true"
                />
                <span className="truncate">{n.label}</span>
              </div>
            )}
            {hasChildren && renderChildren(n.children!, depth + 1)}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="px-1">
        <div className="text-sm font-semibold text-[rgb(var(--text))]">Configurações</div>

        <div className="mt-2">
          <div className="panel-2 flex items-center gap-2 rounded-xl px-3 py-2">
            <span className="text-[rgb(var(--muted))]" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path
                  d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  opacity="0.9"
                />
                <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>

            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-[rgb(var(--muted))]"
              placeholder="Buscar nas configurações..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((sec) => (
          <div key={sec.key} className="space-y-1">
            <div className="px-2.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
              <div className="flex items-center gap-2">
                {sec.key === "root" && (
                  <span className="text-[rgb(var(--muted))]" aria-hidden="true">
                    <IconShield />
                  </span>
                )}
                <span>{sec.label}</span>
                {sec.key === "root" && (
                  <span className="rounded-full border border-[rgb(var(--border))] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[rgb(var(--text))]">
                    ROOT
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              {sec.items.map((it) => {
                const expandable = (it.children?.length ?? 0) > 0;
                const open = expandable && (qn ? true : openKey === it.key);
                const activeParent = nodeMatchesPath(it, pathname);

                return (
                  <div key={it.key} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (expandable) setOpenKey((k) => (k === it.key ? null : it.key));
                        if (it.path) navigate(it.path);
                      }}
                      className={cx(rowBase, activeParent ? rowActive : rowIdle, "relative")}
                    >
                      <span
                        className={cx(
                          "absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r",
                          activeParent ? "w-1 bg-[rgb(var(--text))]" : "w-0"
                        )}
                        aria-hidden="true"
                      />
                      {expandable && (
                        <span className="text-[rgb(var(--muted))]">
                          <IconChevron open={open} />
                        </span>
                      )}
                      {!expandable && <span className="w-4" aria-hidden="true" />}
                      <span className="truncate text-left">{it.label}</span>
                    </button>

                    {expandable && open && (
                      renderChildren(it.children!)
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
