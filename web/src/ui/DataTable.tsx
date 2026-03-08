import { useEffect, useMemo, useRef, useState } from "react";

export type DataTableView = { id: string; label: string };

export type DataTableColumn<T> = {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | boolean | null | undefined;
};

export type DataTableRowAction<T> = {
  label: string;
  onClick: (row: T) => void;
  variant?: "default" | "danger";
};

type RowActionsProp<T> = Array<DataTableRowAction<T>> | ((row: T) => Array<DataTableRowAction<T>>);

export type DataTableProps<T> = {
  title: string;
  subtitle?: string;
  variant?: "default" | "salesforce";
  stretch?: boolean;

  views?: DataTableView[];
  activeViewId?: string;
  onChangeView?: (viewId: string) => void;

  primaryAction?: { label: string; onClick: () => void };

  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowId: (row: T) => string;

  rowActions?: RowActionsProp<T>;

  /**
   * Mantido por compatibilidade, mas seleção por checkbox foi removida da UI.
   */
  showSelection?: boolean;

  initialPageSize?: number;
  pageSizeOptions?: number[];

  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchFn?: (row: T, needle: string) => boolean;

  scrollHeightClassName?: string;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M19.4 15a8.3 8.3 0 0 0 .1-1l1.6-1.2-1.7-3-1.9.5a8.6 8.6 0 0 0-1.7-1l-.3-2h-3.4l-.3 2a8.6 8.6 0 0 0-1.7 1l-1.9-.5-1.7 3L4.5 14c0 .3 0 .7.1 1l-1.6 1.2 1.7 3 1.9-.5c.5.4 1.1.7 1.7 1l.3 2h3.4l.3-2c.6-.3 1.2-.6 1.7-1l1.9.5 1.7-3L19.4 15Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type AnchorRect = { left: number; top: number; width: number; height: number };

function ActionMenu<T>(props: {
  open: boolean;
  anchorRect: AnchorRect | null;
  actions: Array<DataTableRowAction<T>>;
  row: T | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  useEffect(() => {
    if (!props.open) return;
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) props.onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [props.open, props.onClose]);

  if (!props.open || !props.anchorRect || !props.row) return null;
  if (!props.actions.length) return null;

  const padding = 8;
  const menuWidth = 220;

  let left = props.anchorRect.left + props.anchorRect.width - menuWidth;
  let top = props.anchorRect.top + props.anchorRect.height + 6;

  left = Math.max(padding, Math.min(left, window.innerWidth - menuWidth - padding));
  top = Math.max(padding, Math.min(top, window.innerHeight - padding));

  return (
    <div className="fixed inset-0 z-50">
      <div
        ref={ref}
        className="panel shadow-2xl"
        style={{
          position: "fixed",
          left,
          top,
          width: menuWidth,
          borderRadius: 10,
          padding: 6,
        }}
        role="menu"
        aria-label="Ações do registro"
      >
        <div className="grid">
          {props.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className={[
                "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                a.variant === "danger"
                  ? "text-red-400 hover:bg-[rgba(255,0,0,0.08)]"
                  : "hover:bg-[rgba(var(--panel-2),0.55)]",
              ].join(" ")}
              onClick={() => {
                if (!props.row) return;
                a.onClick(props.row);
                props.onClose();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    title,
    subtitle,
    variant = "default",
    stretch = false,
    views,
    activeViewId,
    onChangeView,
    primaryAction,
    columns,
    rows,
    getRowId,
    rowActions,
    initialPageSize = 20,
    pageSizeOptions = [20, 50, 100],
    searchPlaceholder = "Buscar...",
    searchValue,
    onSearchChange,
    searchFn,
    scrollHeightClassName,
  } = props;
  const isSalesforce = variant === "salesforce";
  const isStretch = stretch;
  const resolvedScrollHeightClassName =
    scrollHeightClassName ??
    (isStretch ? "h-full" : isSalesforce ? "h-[clamp(300px,calc(100dvh-340px),74vh)]" : "h-[clamp(260px,calc(100dvh-320px),70vh)]");

  const [localSearch, setLocalSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRow, setMenuRow] = useState<T | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [menuActions, setMenuActions] = useState<Array<DataTableRowAction<T>>>([]);

  const needle = searchValue ?? localSearch;

  const filtered = useMemo(() => {
    if (!needle.trim()) return rows;
    if (searchFn) return rows.filter((r) => searchFn(r, needle));
    const n = needle.trim().toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(n));
  }, [rows, needle, searchFn]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;

    const col = columns.find((c) => c.key === sort.key);
    const getter = col?.sortValue;
    const dir = sort.dir;

    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = getter ? getter(a) : (a as any)[sort.key];
      const bv = getter ? getter(b) : (b as any)[sort.key];

      if (av == null && bv == null) return 0;
      if (av == null) return dir === "asc" ? -1 : 1;
      if (bv == null) return dir === "asc" ? 1 : -1;

      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      if (typeof av === "boolean" && typeof bv === "boolean")
        return dir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);

      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return dir === "asc" ? -1 : 1;
      if (as > bs) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return copy;
  }, [filtered, sort, columns]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clamp(page, 1, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = sorted.slice(start, end);

  function toggleSort(key: string) {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function setSearch(v: string) {
    setPage(1);
    if (onSearchChange) onSearchChange(v);
    else setLocalSearch(v);
  }

  function resolveRowActions(r: T) {
    if (!rowActions) return [];
    return typeof rowActions === "function" ? rowActions(r) : rowActions;
  }

  function openMenu(row: T, buttonEl: HTMLElement) {
    const rect = buttonEl.getBoundingClientRect();
    setMenuRow(row);
    setMenuAnchor({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    setMenuActions(resolveRowActions(row));
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
    setMenuRow(null);
    setMenuAnchor(null);
    setMenuActions([]);
  }

  const headerBg = isSalesforce ? "bg-[rgb(var(--panel-2))]" : "bg-[#e5e7eb] dark:bg-[rgba(255,255,255,0.06)]";

  const anyRowHasActions = !!rowActions;
  const bodyLayoutClass = isStretch
    ? ["min-h-0 flex flex-1 flex-col", isSalesforce ? "gap-0" : "mt-4 gap-2"].join(" ")
    : isSalesforce
      ? "grid gap-0"
      : "mt-4 grid gap-2";

  return (
    <div className={["panel rounded-2xl", isSalesforce ? "overflow-hidden p-0" : "p-6", isStretch ? "flex h-full min-h-0 flex-col" : ""].join(" ")}>
      <header
        className={[
          "flex flex-col gap-3",
          isStretch ? "shrink-0" : "",
          isSalesforce
            ? "border-b border-[rgb(var(--border))] px-4 py-3 md:flex-row md:items-center md:justify-between"
            : "md:flex-row md:items-center md:justify-between",
        ].join(" ")}
      >
        <div>
          <div className={isSalesforce ? "text-base font-semibold" : "text-lg font-semibold"}>{title}</div>
          {subtitle ? <div className={isSalesforce ? "mt-1 text-xs text-[rgb(var(--muted))]" : "mt-1 text-sm text-[rgb(var(--muted))]"}>{subtitle}</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {views?.length ? (
            <select
              className={["input md:w-[220px]", isSalesforce ? "h-9" : ""].join(" ")}
              value={activeViewId ?? views[0].id}
              onChange={(e) => onChangeView?.(e.target.value)}
            >
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : null}

          <input
            className={["input md:w-[260px]", isSalesforce ? "h-9" : ""].join(" ")}
            value={needle}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
          />

          {primaryAction ? (
            <button className="btn btn-success" type="button" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          ) : null}
        </div>
      </header>

      <div className={bodyLayoutClass}>
        <div
          className={[
            "overflow-auto",
            isSalesforce ? "" : "rounded-xl border border-[rgb(var(--border))]",
            isStretch ? "min-h-0 flex-1" : "",
            resolvedScrollHeightClassName,
          ].join(" ")}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={["text-left", isSalesforce ? "text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]" : "text-sm font-semibold text-[rgb(var(--muted))]"].join(" ")}>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={[
                      "sticky top-0 z-20 border-b border-[rgb(var(--border))]",
                      isSalesforce ? "px-3 py-2.5" : "px-2 py-2",
                      headerBg,
                    ].join(" ")}
                    style={{ width: c.width }}
                  >
                    {c.sortable ? (
                      <button
                        className="inline-flex items-center gap-2 hover:text-[rgb(var(--text))]"
                        onClick={() => toggleSort(c.key)}
                        type="button"
                      >
                        <span>{c.header}</span>
                        <span className="opacity-70">{sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}

                {anyRowHasActions ? (
                  <th
                    className={[
                      "sticky top-0 z-20 w-[56px] border-b border-[rgb(var(--border))] text-right",
                      isSalesforce ? "px-3 py-2.5" : "px-2 py-2",
                      headerBg,
                    ].join(" ")}
                  />
                ) : null}
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (anyRowHasActions ? 1 : 0)} className="px-2 py-8 text-center text-[rgb(var(--muted))]">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const id = getRowId(r);
                  return (
                    <tr key={id} className={isSalesforce ? "hover:bg-[rgba(var(--panel-2),0.85)]" : "hover:bg-[rgba(var(--panel-2),0.55)]"}>
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={[
                            "border-b border-[rgb(var(--border))] align-middle",
                            isSalesforce ? "px-3 py-2.5" : "px-2 py-2",
                          ].join(" ")}
                        >
                          {c.render(r)}
                        </td>
                      ))}

                      {anyRowHasActions ? (
                        <td className={["border-b border-[rgb(var(--border))] text-right", isSalesforce ? "px-3 py-2.5" : "px-2 py-2"].join(" ")}>
                          <button
                            className={
                              isSalesforce
                                ? "grid h-8 w-8 place-items-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] hover:brightness-105"
                                : "btn"
                            }
                            type="button"
                            aria-label="Ações"
                            onClick={(e) => openMenu(r, e.currentTarget)}
                          >
                            <GearIcon />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer
          className={[
            "flex flex-col gap-2 md:flex-row md:items-center md:justify-between",
            isStretch ? "shrink-0" : "",
            isSalesforce ? "border-t border-[rgb(var(--border))] px-4 py-3" : "mt-2",
          ].join(" ")}
        >
          <div className="text-xs text-[rgb(var(--muted))]">
            {total} registro(s) • página {safePage} de {totalPages}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-[120px]"
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n} / pág
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <button className="btn" type="button" onClick={() => setPage(1)} disabled={safePage <= 1}>
                «
              </button>
              <button className="btn" type="button" onClick={() => setPage((p) => clamp(p - 1, 1, totalPages))} disabled={safePage <= 1}>
                ‹
              </button>
              <div className="px-2 text-sm">{safePage}</div>
              <button className="btn" type="button" onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))} disabled={safePage >= totalPages}>
                ›
              </button>
              <button className="btn" type="button" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}>
                »
              </button>
            </div>
          </div>
        </footer>
      </div>

      <ActionMenu<T> open={menuOpen} anchorRect={menuAnchor} actions={menuActions} row={menuRow} onClose={closeMenu} />
    </div>
  );
}
