import { useEffect, useMemo, useRef, useState } from "react";
import {
  createReport,
  deleteReport,
  getReport,
  listReportTypes,
  listReports,
  patchReport,
  previewReport,
  type ReportConfigIn,
  type ReportDefinitionOut,
  type ReportField,
  type ReportFolderKey,
  type ReportFilterIn,
  type ReportRunOut,
  type ReportSortIn,
  type ReportTypeKey,
  type ReportTypeOut,
} from "../../reportsApi";

type FilterRow = {
  id: string;
  field: string;
  op: ReportFilterIn["op"];
  value: string;
  value_to: string;
};

const FILTER_OPS: Array<{ value: ReportFilterIn["op"]; label: string }> = [
  { value: "eq", label: "Igual" },
  { value: "neq", label: "Diferente" },
  { value: "contains", label: "Contém" },
  { value: "starts_with", label: "Começa com" },
  { value: "in", label: "Está em (lista)" },
  { value: "gt", label: "Maior que" },
  { value: "gte", label: "Maior/igual" },
  { value: "lt", label: "Menor que" },
  { value: "lte", label: "Menor/igual" },
  { value: "between", label: "Entre" },
  { value: "is_empty", label: "Vazio" },
  { value: "is_not_empty", label: "Não vazio" },
];

const PREVIEW_VISIBLE_ROWS = 50;
const SAVED_RUN_BATCH_SIZE = 150;

function extractErr(e: unknown, fallback: string): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.message) return String(detail.message);
  return String(ae?.message || fallback);
}

function isAbortError(e: unknown): boolean {
  const ae = e as any;
  if (String(ae?.name || "").toLowerCase() === "aborterror") return true;
  const detail = ae?.detail;
  const detailMsg = typeof detail === "string" ? detail : String(detail?.message || "");
  const msg = `${String(ae?.message || "")} ${detailMsg}`.toLowerCase();
  return msg.includes("signal is aborted") || msg.includes("aborted") || msg.includes("aborterror");
}

function newFilterId() {
  return `f_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function uniquePush(list: string[], item: string): string[] {
  if (!item || list.includes(item)) return list;
  return [...list, item];
}

function uniqueList(items: string[]): string[] {
  return Array.from(new Set(items.filter((x) => !!String(x || "").trim())));
}

function fieldLabel(fields: ReportField[], key: string): string {
  const found = fields.find((f) => f.key === key);
  return found?.label || key;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isEmptyOp(op: ReportFilterIn["op"]): boolean {
  return op === "is_empty" || op === "is_not_empty";
}

function isBetweenOp(op: ReportFilterIn["op"]): boolean {
  return op === "between";
}

function filterOpLabel(op: ReportFilterIn["op"]): string {
  return FILTER_OPS.find((x) => x.value === op)?.label || op;
}

function filterSummary(row: FilterRow): string {
  if (!row.field) return "Sem campo";
  if (isEmptyOp(row.op)) return filterOpLabel(row.op);
  if (isBetweenOp(row.op)) {
    const from = String(row.value || "").trim() || "—";
    const to = String(row.value_to || "").trim() || "—";
    return `${filterOpLabel(row.op)} ${from} e ${to}`;
  }
  const value = String(row.value || "").trim() || "—";
  return `${filterOpLabel(row.op)} ${value}`;
}

function coerceByField(field: ReportField | undefined, raw: string): unknown {
  const v = raw.trim();
  if (!v) return null;
  if (!field) return v;

  if (field.data_type === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  if (field.data_type === "boolean") {
    const low = v.toLowerCase();
    if (["true", "1", "yes", "sim"].includes(low)) return true;
    if (["false", "0", "no", "nao", "não"].includes(low)) return false;
    return v;
  }
  return v;
}

function keepOnlySelectedColumns(data: ReportRunOut, selectedColumns: string[]): ReportRunOut {
  const wanted = selectedColumns.filter((c) => data.columns.includes(c));
  if (!wanted.length) {
    return { ...data, columns: [], rows: [] };
  }

  const rows = (Array.isArray(data.rows) ? data.rows : []).map((row) => {
    const source = (row || {}) as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const col of wanted) filtered[col] = source[col];
    return filtered;
  });

  return {
    ...data,
    columns: wanted,
    rows,
  };
}

type GroupedPreviewRow =
  | {
      kind: "detail";
      source: Record<string, unknown>;
      groupLabels: string[];
      rowNumber: number;
    }
  | {
      kind: "subtotal";
      level: number;
      groupValue: string;
      count: number;
    };

function buildGroupedPreviewRows(rows: Array<Record<string, unknown>>, groupFields: string[]): GroupedPreviewRow[] {
  if (!groupFields.length || !rows.length) return [];

  const sorted = [...rows].sort((a, b) => {
    for (const field of groupFields) {
      const av = String(a[field] ?? "");
      const bv = String(b[field] ?? "");
      const cmp = av.localeCompare(bv, "pt-BR", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  const keyForLevel = (row: Record<string, unknown>, level: number): string =>
    groupFields.slice(0, level + 1).map((field) => String(row[field] ?? "")).join("||");

  const levelCounts = groupFields.map(() => new Map<string, number>());
  for (const row of sorted) {
    for (let level = 0; level < groupFields.length; level += 1) {
      const key = keyForLevel(row, level);
      const map = levelCounts[level];
      map.set(key, (map.get(key) || 0) + 1);
    }
  }

  const out: GroupedPreviewRow[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;

    const groupLabels = groupFields.map((field, level) => {
      const currentKey = keyForLevel(row, level);
      const previousKey = prev ? keyForLevel(prev, level) : null;
      const changed = !prev || currentKey !== previousKey;
      if (!changed) return "";
      const count = levelCounts[level].get(currentKey) || 0;
      return `${formatCell(row[field])} (${count})`;
    });

    out.push({
      kind: "detail",
      source: row,
      groupLabels,
      rowNumber: i + 1,
    });

    for (let level = groupFields.length - 1; level >= 0; level -= 1) {
      const currentKey = keyForLevel(row, level);
      const nextKey = next ? keyForLevel(next, level) : null;
      const ended = !next || currentKey !== nextKey;
      if (!ended) continue;

      out.push({
        kind: "subtotal",
        level,
        groupValue: formatCell(row[groupFields[level]]),
        count: levelCounts[level].get(currentKey) || 0,
      });
    }
  }

  return out;
}

export function ReportsPage() {
  const [types, setTypes] = useState<ReportTypeOut[]>([]);
  const [selectedType, setSelectedType] = useState<ReportTypeKey | "">("");
  const [savedReports, setSavedReports] = useState<ReportDefinitionOut[]>([]);

  const [viewMode, setViewMode] = useState<"browser" | "builder">("browser");
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<ReportFolderKey>("private");
  const [reportName, setReportName] = useState("Novo relatório");
  const [reportFolder, setReportFolder] = useState<ReportFolderKey>("private");
  const [reportDescription, setReportDescription] = useState("");
  const [reportMetaModalOpen, setReportMetaModalOpen] = useState(false);
  const [reportMetaMode, setReportMetaMode] = useState<"new" | "edit">("new");
  const [metaDraftName, setMetaDraftName] = useState("");
  const [metaDraftType, setMetaDraftType] = useState<ReportTypeKey | "">("");
  const [metaDraftFolder, setMetaDraftFolder] = useState<ReportFolderKey>("private");
  const [metaDraftDescription, setMetaDraftDescription] = useState("");

  const [columns, setColumns] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [sorts, setSorts] = useState<ReportSortIn[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);

  const [aggregateFn, setAggregateFn] = useState<"count" | "sum" | "avg" | "min" | "max">("count");
  const [aggregateField, setAggregateField] = useState("");
  const [aggregateAlias, setAggregateAlias] = useState("");
  const [limit, setLimit] = useState(200);

  const [fieldQuery, setFieldQuery] = useState("");
  const [fieldsListOpen, setFieldsListOpen] = useState(false);
  const [fieldsPanelTab, setFieldsPanelTab] = useState<"fields" | "filters">("fields");
  const fieldsSearchRef = useRef<HTMLDivElement | null>(null);

  const [preview, setPreview] = useState<ReportRunOut>({ columns: [], rows: [], total_rows: 0, truncated: false });
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningSaved, setRunningSaved] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<FilterRow | null>(null);
  const [lastSavedRunAt, setLastSavedRunAt] = useState<string | null>(null);
  const [savedRunViewOpen, setSavedRunViewOpen] = useState(false);
  const [savedRunViewName, setSavedRunViewName] = useState("");
  const [savedRunViewData, setSavedRunViewData] = useState<ReportRunOut | null>(null);
  const [savedRunVisibleRows, setSavedRunVisibleRows] = useState(SAVED_RUN_BATCH_SIZE);
  const savedRunScrollRef = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const currentType = useMemo(() => types.find((t) => t.key === selectedType) || null, [types, selectedType]);
  const availableFields = currentType?.fields || [];

  const availableFieldByKey = useMemo(() => {
    const map = new Map<string, ReportField>();
    for (const f of availableFields) map.set(f.key, f);
    return map;
  }, [availableFields]);

  const selectedFieldKeys = useMemo(() => {
    const keys: string[] = [];
    const add = (value: string | undefined | null) => {
      const key = String(value || "").trim();
      if (!key || keys.includes(key)) return;
      keys.push(key);
    };
    for (const key of columns) add(key);
    for (const key of groupBy) add(key);
    for (const row of sorts) add(row.field);
    for (const row of filters) add(row.field);
    return keys;
  }, [columns, groupBy, sorts, filters]);

  const searchableFields = useMemo(() => {
    const selected = new Set(selectedFieldKeys);
    const q = fieldQuery.trim().toLowerCase();
    return availableFields.filter((f) => {
      if (fieldsPanelTab === "fields" && selected.has(f.key)) return false;
      if (!q) return true;
      return f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q);
    });
  }, [availableFields, fieldQuery, selectedFieldKeys, fieldsPanelTab]);

  const config = useMemo<ReportConfigIn>(() => {
    const payloadFilters: ReportFilterIn[] = filters
      .map((f) => {
        const fieldMeta = availableFieldByKey.get(f.field);
        const base: ReportFilterIn = {
          field: f.field,
          op: f.op,
        };

        if (!isEmptyOp(f.op)) {
          base.value = coerceByField(fieldMeta, f.value);
        }
        if (isBetweenOp(f.op)) {
          base.value_to = coerceByField(fieldMeta, f.value_to);
        }
        return base;
      })
      .filter((f) => !!f.field);

    return {
      columns,
      filters: payloadFilters,
      group_by: groupBy,
      sorts,
      aggregate: groupBy.length
        ? {
            fn: aggregateFn,
            field: aggregateField || null,
            alias: aggregateAlias || null,
          }
        : null,
      limit,
    };
  }, [filters, availableFieldByKey, columns, groupBy, sorts, aggregateFn, aggregateField, aggregateAlias, limit]);

  async function reloadReports(signal?: AbortSignal) {
    const rows = await listReports(undefined, signal);
    setSavedReports(Array.isArray(rows) ? rows : []);
  }

  const folderCounts = useMemo(() => {
    return savedReports.reduce(
      (acc, row) => {
        const key = row.folder === "public" ? "public" : "private";
        acc[key] += 1;
        return acc;
      },
      { public: 0, private: 0 },
    );
  }, [savedReports]);

  const visibleSavedReports = useMemo(
    () => savedReports.filter((r) => (r.folder === "public" ? "public" : "private") === activeFolder),
    [savedReports, activeFolder],
  );

  function resetBuilder(nextType?: ReportTypeKey | "") {
    setActiveReportId(null);
    setFieldsListOpen(false);
    setFilterModalOpen(false);
    setFilterDraft(null);
    setFieldsPanelTab("fields");
    const label = types.find((t) => t.key === (nextType || selectedType))?.label || "Relatório";
    setReportName(`Novo relatório de ${label}`);
    setReportFolder(activeFolder);
    setReportDescription("");
    setColumns([]);
    setGroupBy([]);
    setSorts([]);
    setFilters([]);
    setAggregateFn("count");
    setAggregateField("");
    setAggregateAlias("");
    setLimit(200);
    setLastSavedRunAt(null);
    setSavedRunViewOpen(false);
    setSavedRunViewName("");
    setSavedRunViewData(null);
    setSavedRunVisibleRows(SAVED_RUN_BATCH_SIZE);
  }

  function loadDefinition(def: ReportDefinitionOut) {
    setActiveReportId(def.id);
    setFilterModalOpen(false);
    setFilterDraft(null);
    setFieldsPanelTab("fields");
    setSelectedType(def.report_type);
    setActiveFolder(def.folder === "public" ? "public" : "private");
    setReportName(def.name || "Relatório");
    setReportFolder(def.folder === "public" ? "public" : "private");
    setReportDescription(def.description || "");
    setColumns(Array.isArray(def.config?.columns) ? def.config.columns : []);
    setGroupBy(Array.isArray(def.config?.group_by) ? def.config.group_by : []);
    setSorts(Array.isArray(def.config?.sorts) ? def.config.sorts : []);
    setFilters(
      (Array.isArray(def.config?.filters) ? def.config.filters : []).map((f) => ({
        id: newFilterId(),
        field: f.field || "",
        op: f.op || "eq",
        value: String(f.value ?? ""),
        value_to: String(f.value_to ?? ""),
      })),
    );
    setAggregateFn(def.config?.aggregate?.fn || "count");
    setAggregateField(def.config?.aggregate?.field || "");
    setAggregateAlias(def.config?.aggregate?.alias || "");
    setLimit(def.config?.limit || 200);
    setLastSavedRunAt(null);
    setSavedRunViewOpen(false);
    setSavedRunViewName("");
    setSavedRunViewData(null);
    setSavedRunVisibleRows(SAVED_RUN_BATCH_SIZE);
  }

  useEffect(() => {
    const ac = new AbortController();
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const reportTypes = await listReportTypes(ac.signal);
        const sorted = Array.isArray(reportTypes) ? reportTypes : [];
        setTypes(sorted);
        const first = sorted[0]?.key || "";
        setSelectedType(first);
        const rows = await listReports(undefined, ac.signal);
        setSavedReports(Array.isArray(rows) ? rows : []);
        if (first) resetBuilder(first);
      } catch (e) {
        if (isAbortError(e)) return;
        const msg = extractErr(e, "Falha ao carregar metadados de relatórios");
        setErr(msg);
      } finally {
        setLoading(false);
      }
    }
    void run();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (viewMode !== "builder" || !selectedType) return;
    const selectedColumns = Array.isArray(config.columns) ? config.columns : [];
    const selectedGroups = Array.isArray(config.group_by) ? config.group_by : [];
    const previewColumns = uniqueList([...selectedColumns, ...selectedGroups]);
    if (!previewColumns.length) {
      setPreview({ columns: [], rows: [], total_rows: 0, truncated: false });
      setPreviewing(false);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewing(true);
      setErr(null);
      try {
        const previewConfig: ReportConfigIn = {
          ...config,
          columns: previewColumns,
          group_by: [],
          aggregate: null,
        };
        const data = await previewReport({ report_type: selectedType, config: previewConfig }, ac.signal);
        setPreview(keepOnlySelectedColumns(data, previewColumns));
      } catch (e) {
        if (isAbortError(e)) return;
        const msg = extractErr(e, "Falha ao gerar prévia");
        setErr(msg);
      } finally {
        setPreviewing(false);
      }
    }, 320);

    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [viewMode, selectedType, config]);

  useEffect(() => {
    if (activeReportId) return;
    setReportFolder(activeFolder);
  }, [activeFolder, activeReportId]);

  useEffect(() => {
    if (!fieldsListOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (fieldsSearchRef.current && !fieldsSearchRef.current.contains(target)) {
        setFieldsListOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [fieldsListOpen]);

  function onFieldDragStart(e: React.DragEvent<HTMLElement>, fieldKey: string) {
    e.dataTransfer.setData("text/report-field", fieldKey);
    e.dataTransfer.effectAllowed = "copy";
  }

  function droppedFieldKey(e: React.DragEvent<HTMLDivElement>): string {
    const key = (e.dataTransfer.getData("text/report-field") || "").trim();
    return key;
  }

  function onDropToColumns(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const fieldKey = droppedFieldKey(e);
    if (!fieldKey) return;
    setColumns((prev) => uniquePush(prev, fieldKey));
  }

  function onDropToGroupBy(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const fieldKey = droppedFieldKey(e);
    if (!fieldKey) return;
    setGroupBy((prev) => uniquePush(prev, fieldKey));
  }

  function onDropToSorts(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const fieldKey = droppedFieldKey(e);
    if (!fieldKey) return;
    setSorts((prev) => {
      if (prev.some((s) => s.field === fieldKey)) return prev;
      return [...prev, { field: fieldKey, direction: "asc" }];
    });
  }

  function onDropToFilters(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const fieldKey = droppedFieldKey(e);
    if (!fieldKey) return;
    openFilterModal({ field: fieldKey });
  }

  function openFilterModal(params?: { field?: string; filterId?: string }) {
    let next: FilterRow | null = null;

    if (params?.filterId) {
      const existing = filters.find((f) => f.id === params.filterId);
      if (existing) next = { ...existing };
    }
    if (!next) {
      next = { id: newFilterId(), field: "", op: "eq", value: "", value_to: "" };
    }
    if (params?.field) next.field = params.field;

    setErr(null);
    setFieldsListOpen(false);
    setFilterDraft(next);
    setFilterModalOpen(true);
  }

  function closeFilterModal() {
    setFilterModalOpen(false);
    setFilterDraft(null);
  }

  function applyFilterModal() {
    if (!filterDraft || !filterDraft.field) {
      setErr("Selecione um campo para o filtro.");
      return;
    }

    const normalized: FilterRow = {
      ...filterDraft,
      value: isEmptyOp(filterDraft.op) ? "" : filterDraft.value,
      value_to: isBetweenOp(filterDraft.op) ? filterDraft.value_to : "",
    };

    setFilters((prev) => {
      const idx = prev.findIndex((x) => x.id === normalized.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = normalized;
        return next;
      }
      return [...prev, normalized];
    });
    closeFilterModal();
  }

  function removeSelectedField(fieldKey: string) {
    setColumns((prev) => prev.filter((x) => x !== fieldKey));
    setGroupBy((prev) => prev.filter((x) => x !== fieldKey));
    setSorts((prev) => prev.filter((x) => x.field !== fieldKey));
    setFilters((prev) => prev.filter((x) => x.field !== fieldKey));
    if (aggregateField === fieldKey) {
      setAggregateField("");
      setAggregateAlias("");
    }
  }

  function resetConfigForTypeChange() {
    setColumns([]);
    setGroupBy([]);
    setSorts([]);
    setFilters([]);
    setAggregateFn("count");
    setAggregateField("");
    setAggregateAlias("");
    setPreview({ columns: [], rows: [], total_rows: 0, truncated: false });
  }

  function openReportMetaModal(mode: "new" | "edit") {
    setReportMetaMode(mode);
    setMetaDraftName(reportName || "");
    setMetaDraftType((selectedType as ReportTypeKey | "") || "");
    setMetaDraftFolder(reportFolder || "private");
    setMetaDraftDescription(reportDescription || "");
    setReportMetaModalOpen(true);
  }

  function applyReportMetaFromModal() {
    const trimmed = metaDraftName.trim();
    if (!trimmed) {
      setErr("Informe um nome para o relatório.");
      return;
    }
    if (!metaDraftType) {
      setErr("Selecione o objeto do relatório.");
      return;
    }
    const typeChanged = selectedType !== metaDraftType;
    setReportName(trimmed);
    setSelectedType(metaDraftType);
    setReportFolder(metaDraftFolder);
    setActiveFolder(metaDraftFolder);
    setReportDescription(metaDraftDescription.trim());
    if (typeChanged) {
      resetConfigForTypeChange();
    }
    setErr(null);
    setReportMetaModalOpen(false);
    if (reportMetaMode === "new") setViewMode("builder");
  }

  function openBuilderForNewReport() {
    const nextType = (selectedType || types[0]?.key || "") as ReportTypeKey | "";
    if (!nextType) {
      setErr("Nenhum tipo de relatório disponível.");
      return;
    }
    setSelectedType(nextType);
    resetBuilder(nextType);
    setErr(null);
    setReportMetaMode("new");
    setMetaDraftName(`Novo relatório de ${types.find((t) => t.key === nextType)?.label || "Relatório"}`);
    setMetaDraftType(nextType);
    setMetaDraftFolder(activeFolder);
    setMetaDraftDescription("");
    setReportMetaModalOpen(true);
  }

  function openBuilderForSavedReport(def: ReportDefinitionOut) {
    loadDefinition(def);
    setErr(null);
    setViewMode("builder");
  }

  function goBackToBrowser() {
    closeSavedRunView();
    setReportMetaModalOpen(false);
    setViewMode("browser");
  }

  async function saveReportDefinition() {
    if (!selectedType) return;
    if (!reportName.trim()) {
      setErr("Informe um nome para o relatório.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      if (activeReportId) {
        const updated = await patchReport(activeReportId, {
          name: reportName.trim(),
          description: reportDescription.trim(),
          report_type: selectedType,
          folder: reportFolder,
          config,
        });
        await reloadReports();
        loadDefinition(updated);
      } else {
        const created = await createReport({
          name: reportName.trim(),
          description: reportDescription.trim(),
          report_type: selectedType,
          folder: reportFolder,
          config,
        });
        await reloadReports();
        loadDefinition(created);
      }
    } catch (e) {
      setErr(extractErr(e, "Falha ao salvar relatório"));
    } finally {
      setSaving(false);
    }
  }

  async function runCurrentSavedReport() {
    if (!activeReportId) return;
    if (!selectedType) return;
    if (!reportName.trim()) {
      setErr("Informe um nome para o relatório.");
      return;
    }
    setRunningSaved(true);
    setPreviewing(true);
    setErr(null);
    try {
      const updated = await patchReport(activeReportId, {
        name: reportName.trim(),
        description: reportDescription.trim(),
        report_type: selectedType,
        folder: reportFolder,
        config,
      });
      await reloadReports();
      loadDefinition(updated);

      const selectedColumns = Array.isArray(updated.config?.columns) ? updated.config.columns : [];
      const selectedGroups = Array.isArray(updated.config?.group_by) ? updated.config.group_by : [];
      const selectedGridColumns = uniqueList([...selectedGroups, ...selectedColumns]);

      const baseConfig = updated.config || ({} as ReportConfigIn);
      const runConfig: ReportConfigIn = {
        columns: Array.isArray(baseConfig.columns) ? baseConfig.columns : [],
        filters: Array.isArray(baseConfig.filters) ? baseConfig.filters : [],
        group_by: Array.isArray(baseConfig.group_by) ? baseConfig.group_by : [],
        sorts: Array.isArray(baseConfig.sorts) ? baseConfig.sorts : [],
        aggregate: baseConfig.aggregate || null,
        limit: 5000,
      };

      const data = await previewReport({ report_type: updated.report_type, config: runConfig });
      const normalized = keepOnlySelectedColumns(data, selectedGridColumns);
      setPreview(normalized);
      setSavedRunViewName(updated.name || reportName || "Relatório");
      setSavedRunViewData(normalized);
      setSavedRunVisibleRows(Math.min(SAVED_RUN_BATCH_SIZE, normalized.rows.length || SAVED_RUN_BATCH_SIZE));
      setSavedRunViewOpen(true);
      setLastSavedRunAt(new Date().toISOString());
    } catch (e) {
      setSavedRunViewOpen(false);
      setSavedRunViewName("");
      setSavedRunViewData(null);
      setSavedRunVisibleRows(SAVED_RUN_BATCH_SIZE);
      setErr(extractErr(e, "Falha ao executar relatório salvo"));
    } finally {
      setRunningSaved(false);
      setPreviewing(false);
    }
  }

  async function deleteCurrentReport() {
    if (!activeReportId) return;
    if (!window.confirm("Excluir este relatório?")) return;

    setSaving(true);
    setErr(null);
    try {
      await deleteReport(activeReportId);
      await reloadReports();
      resetBuilder(selectedType);
      setPreview({ columns: [], rows: [], total_rows: 0, truncated: false });
      setViewMode("browser");
    } catch (e) {
      setErr(extractErr(e, "Falha ao excluir relatório"));
    } finally {
      setSaving(false);
    }
  }

  function closeSavedRunView() {
    setSavedRunViewOpen(false);
    setSavedRunVisibleRows(SAVED_RUN_BATCH_SIZE);
  }

  function maybeLoadMoreSavedRows(target: HTMLDivElement) {
    if (!savedRunViewData) return;
    if (savedRunVisibleRows >= savedRunViewData.rows.length) return;
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 120;
    if (!nearBottom) return;
    setSavedRunVisibleRows((prev) => Math.min(prev + SAVED_RUN_BATCH_SIZE, savedRunViewData.rows.length));
  }

  const visibleSavedRunRows = useMemo(
    () => (savedRunViewData ? savedRunViewData.rows.slice(0, savedRunVisibleRows) : []),
    [savedRunViewData, savedRunVisibleRows],
  );

  const aggregateCandidates = useMemo(
    () => availableFields.filter((f) => f.aggregatable),
    [availableFields],
  );
  const previewColumnsForGrid = useMemo(() => uniqueList([...groupBy, ...columns]), [groupBy, columns]);
  const previewForGrid = useMemo(() => keepOnlySelectedColumns(preview, previewColumnsForGrid), [preview, previewColumnsForGrid]);
  const groupFieldsForGrid = useMemo(
    () => groupBy.filter((field) => previewForGrid.columns.includes(field)),
    [groupBy, previewForGrid.columns],
  );
  const detailFieldsForGrid = useMemo(
    () => previewForGrid.columns.filter((field) => !groupFieldsForGrid.includes(field)),
    [previewForGrid.columns, groupFieldsForGrid],
  );
  const groupedPreviewRows = useMemo(
    () => buildGroupedPreviewRows((previewForGrid.rows.slice(0, PREVIEW_VISIBLE_ROWS) as Array<Record<string, unknown>>) || [], groupFieldsForGrid),
    [previewForGrid.rows, groupFieldsForGrid],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {viewMode === "browser" ? (
        <section className="panel overflow-hidden border border-[rgb(var(--border))]">
          <div className="flex flex-col gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Relatórios</div>
              <h1 className="text-2xl font-semibold">Biblioteca de Relatórios</h1>
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                Navegue por pastas e abra um relatório salvo para editar ou executar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-success !rounded-none" onClick={openBuilderForNewReport} disabled={loading || saving || !types.length}>
                Novo relatório
              </button>
            </div>
          </div>

          {err ? <div className="mx-4 mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

          <div className="grid min-h-0 grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
              <div className="sf-band bg-[#d1e1f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Pastas</div>
              <div className="space-y-1 p-2">
                <button
                  className={[
                    "w-full border px-2 py-2 text-left text-xs",
                    activeFolder === "private"
                      ? "border-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)]"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] hover:brightness-105",
                  ].join(" ")}
                  onClick={() => setActiveFolder("private")}
                >
                  <div className="font-semibold">Pasta Privada</div>
                  <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Apenas seus relatórios • {folderCounts.private}</div>
                </button>
                <button
                  className={[
                    "w-full border px-2 py-2 text-left text-xs",
                    activeFolder === "public"
                      ? "border-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)]"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] hover:brightness-105",
                  ].join(" ")}
                  onClick={() => setActiveFolder("public")}
                >
                  <div className="font-semibold">Pasta Pública</div>
                  <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Compartilhados na BU • {folderCounts.public}</div>
                </button>
              </div>
            </aside>

            <section className="min-h-0 overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
              <div className="sf-band bg-[#d1e1f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                {activeFolder === "public" ? "Relatórios da Pasta Pública" : "Relatórios da Pasta Privada"}
              </div>
              <div className="max-h-[72vh] space-y-1 overflow-auto p-2">
                {visibleSavedReports.map((r) => (
                  <button
                    key={`browser_${r.id}`}
                    onClick={() => openBuilderForSavedReport(r)}
                    className="w-full border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2 py-2 text-left text-xs hover:brightness-105"
                  >
                    <div className="font-semibold">{r.name}</div>
                    <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">
                      {r.report_type} • {r.owner_name || "Sem owner"} • {r.updated_at ? new Date(r.updated_at).toLocaleString("pt-BR") : "—"}
                    </div>
                  </button>
                ))}
                {!visibleSavedReports.length ? (
                  <div className="px-2 py-2 text-xs text-[rgb(var(--muted))]">
                    {activeFolder === "public"
                      ? "Nenhum relatório na pasta pública."
                      : "Nenhum relatório na sua pasta privada."}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      ) : (
        <div className="fixed inset-0 z-40 flex h-screen w-screen bg-black/20">
          <section className="relative z-[1] flex h-full w-full min-h-0 flex-col overflow-hidden bg-[rgb(var(--panel))]">
          <div className="flex flex-col gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Report</div>
              <h1 className="truncate text-[30px] font-semibold leading-8">{reportName || "Relatório"}</h1>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]">
                {currentType?.label || "—"} • {reportFolder === "public" ? "Pasta pública" : "Pasta privada"}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={goBackToBrowser} disabled={saving}>
                Fechar
              </button>
              {savedRunViewOpen ? (
                <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={closeSavedRunView}>
                  Voltar à edição
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={openBuilderForNewReport} disabled={saving || !types.length}>
                    Novo
                  </button>
                  <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={() => openReportMetaModal("edit")} disabled={saving}>
                    Editar
                  </button>
                  {activeReportId ? (
                    <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={() => void deleteCurrentReport()} disabled={saving}>
                      Excluir
                    </button>
                  ) : null}
                  {activeReportId ? (
                    <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={() => void runCurrentSavedReport()} disabled={saving || runningSaved}>
                      {runningSaved ? "Executando..." : "Salvar e executar"}
                    </button>
                  ) : null}
                  <button className="btn btn-success h-9 !rounded-none px-4 text-sm" onClick={() => void saveReportDefinition()} disabled={saving || !selectedType}>
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </>
              )}
            </div>
          </div>

          {err ? <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

          {savedRunViewOpen && savedRunViewData ? (
            <section className="flex min-h-0 flex-1 flex-col border-t border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
              <div className="flex items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-1.5">
                <div className="text-xs text-[rgb(var(--muted))]">
                  <span className="mr-2 font-semibold text-[rgb(var(--text))]">{savedRunViewName || reportName}</span>
                  Execução de {Math.min(savedRunVisibleRows, savedRunViewData.rows.length)} de {savedRunViewData.total_rows} registro(s)
                  {savedRunViewData.truncated ? " (limitado)" : ""}
                </div>
                <div className="text-[11px] text-[rgb(var(--muted))]">Role para carregar mais registros</div>
              </div>
              <div
                ref={savedRunScrollRef}
                onScroll={(e) => maybeLoadMoreSavedRows(e.currentTarget)}
                className="min-h-0 flex-1 overflow-x-auto overflow-y-auto"
                style={{ scrollbarGutter: "stable both-edges" }}
              >
                {savedRunViewData.columns.length ? (
                  <table className="w-max min-w-full table-auto border border-[rgb(var(--border))] text-xs">
                    <thead className="sticky top-0 z-[1] bg-[rgb(var(--panel-2))]">
                      <tr>
                        <th className="whitespace-nowrap border-b border-r border-[rgb(var(--border))] px-2 py-2 text-left font-semibold text-[rgb(var(--muted))]">#</th>
                        {savedRunViewData.columns.map((c) => (
                          <th
                            key={`saved_run_head_${c}`}
                            className="whitespace-nowrap border-b border-r border-[rgb(var(--border))] px-2 py-2 text-left font-semibold text-[rgb(var(--muted))] last:border-r-0"
                          >
                            {fieldLabel(availableFields, c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSavedRunRows.map((r, idx) => (
                        <tr key={`saved_run_row_${idx}`} className="border-b border-[rgb(var(--border))]">
                          <td className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 align-top text-[rgb(var(--muted))]">{idx + 1}</td>
                          {savedRunViewData.columns.map((c) => (
                            <td
                              key={`saved_run_cell_${idx}_${c}`}
                              className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 align-top text-[rgb(var(--text))] last:border-r-0"
                            >
                              {formatCell(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-4 text-sm text-[rgb(var(--muted))]">Nenhum dado retornado para este relatório.</div>
                )}

                {savedRunViewData.rows.length ? (
                  <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-2 text-xs text-[rgb(var(--muted))]">
                    {savedRunVisibleRows < savedRunViewData.rows.length
                      ? `Exibindo ${savedRunVisibleRows} de ${savedRunViewData.rows.length} registros carregados.`
                      : `Todos os ${savedRunViewData.rows.length} registros carregados.`}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-[rgb(var(--border))] xl:grid-cols-[360px_minmax(0,1fr)] xl:grid-rows-[auto_minmax(0,1fr)]">
            <aside className="order-2 flex min-h-0 flex-col overflow-hidden border-r border-[rgb(var(--border))] bg-[rgb(var(--panel))] xl:col-start-1 xl:row-start-2">
              <div className="relative border-b border-[rgb(var(--border))] px-2 py-2">
                <div
                  ref={fieldsSearchRef}
                  className="relative"
                  onFocus={() => setFieldsListOpen(true)}
                  onBlur={(e) => {
                    const next = e.relatedTarget as Node | null;
                    if (next && e.currentTarget.contains(next)) return;
                    setFieldsListOpen(false);
                  }}
                >
                  <input
                    className="input h-9 w-full rounded-none px-2 py-1.5 text-sm"
                    value={fieldQuery}
                    onChange={(e) => {
                      setFieldQuery(e.target.value);
                      setFieldsListOpen(true);
                    }}
                    placeholder="Search all fields..."
                    disabled={loading}
                  />

                  {fieldsListOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+2px)] z-20 max-h-[280px] overflow-y-auto border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-lg">
                      {searchableFields.map((f) => (
                        <button
                          key={f.key}
                          draggable
                          type="button"
                          onDragStart={(e) => onFieldDragStart(e, f.key)}
                          onClick={() => {
                            if (fieldsPanelTab === "filters") {
                              openFilterModal({ field: f.key });
                              return;
                            }
                            setColumns((prev) => uniquePush(prev, f.key));
                          }}
                          className="flex w-full items-center justify-between border-b border-[rgb(var(--border))] px-2 py-1.5 text-left text-sm hover:bg-[rgb(var(--panel-2))]"
                        >
                          <span className="min-w-0 truncate">{f.label}</span>
                          <span className="ml-2 shrink-0 text-[10px] uppercase text-[rgb(var(--muted))]">
                            {selectedFieldKeys.includes(f.key) ? "Selecionado" : f.source}
                          </span>
                        </button>
                      ))}
                      {!searchableFields.length ? <div className="px-2 py-2 text-sm text-[rgb(var(--muted))]">Nenhum campo encontrado.</div> : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2 py-1.5 text-sm font-semibold text-[rgb(var(--muted))]">
                Campos selecionados ({selectedFieldKeys.length})
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {selectedFieldKeys.length ? (
                  <>
                    {selectedFieldKeys.map((key) => (
                      <div
                        key={`selected_${key}`}
                        draggable
                        onDragStart={(e) => onFieldDragStart(e, key)}
                        className="flex cursor-grab items-center justify-between border-b border-[rgb(var(--border))] px-2 py-1.5 text-sm active:cursor-grabbing"
                      >
                        <span className="min-w-0 truncate">{fieldLabel(availableFields, key)}</span>
                        <button
                          type="button"
                          className="ml-2 h-5 w-5 shrink-0 border border-[rgb(var(--border))] text-xs leading-none text-[rgb(var(--muted))] hover:bg-[rgb(var(--panel-2))]"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSelectedField(key);
                          }}
                          aria-label={`Remover campo ${fieldLabel(availableFields, key)}`}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="px-2 py-2 text-sm text-[rgb(var(--muted))]">Nenhum campo selecionado.</div>
                )}
              </div>
            </aside>

            <section className="order-1 flex min-h-0 flex-col overflow-hidden border-b border-r border-[rgb(var(--border))] bg-[rgb(var(--panel))] xl:col-start-1 xl:row-start-1">
              <div className="grid grid-cols-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
                <button
                  className={[
                    "border-r border-[rgb(var(--border))] px-3 py-2 text-left text-sm font-semibold uppercase tracking-wide",
                    fieldsPanelTab === "fields" ? "bg-[rgb(var(--panel))] text-[rgb(var(--text))]" : "text-[rgb(var(--muted))]",
                  ].join(" ")}
                  onClick={() => setFieldsPanelTab("fields")}
                >
                  Outline
                </button>
                <button
                  className={[
                    "px-3 py-2 text-left text-sm font-semibold uppercase tracking-wide",
                    fieldsPanelTab === "filters" ? "bg-[rgb(var(--panel))] text-[rgb(var(--text))]" : "text-[rgb(var(--muted))]",
                  ].join(" ")}
                  onClick={() => setFieldsPanelTab("filters")}
                >
                  Filtros
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {fieldsPanelTab === "fields" ? (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Grupos</div>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDropToGroupBy}
                        className="min-h-[42px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2 py-2"
                      >
                        <div className="flex flex-wrap gap-1">
                          {groupBy.map((g) => (
                            <span key={g} className="inline-flex items-center gap-1 border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-1.5 py-0.5 text-xs">
                              <span className="max-w-[180px] truncate">{fieldLabel(availableFields, g)}</span>
                              <button className="text-[rgb(var(--muted))]" onClick={() => setGroupBy((prev) => prev.filter((x) => x !== g))}>
                                ×
                              </button>
                            </span>
                          ))}
                          {!groupBy.length ? <span className="text-xs text-[rgb(var(--muted))]">Add group...</span> : null}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Ordenação</div>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDropToSorts}
                        className="min-h-[42px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2 py-2"
                      >
                        <div className="flex flex-wrap gap-1">
                          {sorts.map((s) => (
                            <span key={s.field} className="inline-flex items-center gap-1 border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-1.5 py-0.5 text-xs">
                              <span className="max-w-[140px] truncate">{fieldLabel(availableFields, s.field)}</span>
                              <button
                                className="h-5 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-1 text-[10px] leading-none"
                                onClick={() =>
                                  setSorts((prev) => prev.map((x) => (x.field === s.field ? { ...x, direction: x.direction === "asc" ? "desc" : "asc" } : x)))
                                }
                              >
                                {s.direction.toUpperCase()}
                              </button>
                              <button className="text-[rgb(var(--muted))]" onClick={() => setSorts((prev) => prev.filter((x) => x.field !== s.field))}>
                                ×
                              </button>
                            </span>
                          ))}
                          {!sorts.length ? <span className="text-xs text-[rgb(var(--muted))]">Add sort...</span> : null}
                        </div>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Filtros do relatório</div>
                      <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={() => openFilterModal()}>
                        Adicionar filtro
                      </button>
                    </div>

                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={onDropToFilters}
                      className="space-y-1.5 border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-2"
                    >
                      {filters.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-2 py-1.5">
                          <button className="min-w-0 flex-1 text-left" onClick={() => openFilterModal({ filterId: f.id })}>
                            <div className="truncate text-xs font-semibold">{f.field ? fieldLabel(availableFields, f.field) : "Campo"}</div>
                            <div className="truncate text-[11px] text-[rgb(var(--muted))]">{filterSummary(f)}</div>
                          </button>
                          <button className="btn btn-secondary h-7 !rounded-none px-2 text-xs" onClick={() => setFilters((prev) => prev.filter((x) => x.id !== f.id))}>
                            Remover
                          </button>
                        </div>
                      ))}

                      {!filters.length ? <span className="text-xs text-[rgb(var(--muted))]">Arraste campos ou clique em Adicionar filtro.</span> : null}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="order-3 flex min-h-0 flex-col overflow-hidden bg-[rgb(var(--panel))] xl:col-start-2 xl:row-span-2">
              <div className="flex items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-1.5">
                <div className="text-xs text-[rgb(var(--muted))]">
                  {previewing
                    ? "Atualizando prévia..."
                    : `Prévia de ${Math.min(previewForGrid.rows.length, PREVIEW_VISIBLE_ROWS)} de ${previewForGrid.total_rows} registro(s)`}
                  {previewForGrid.truncated ? " (limitado)" : ""}
                </div>
                <div className="text-[11px] text-[rgb(var(--muted))]">Update Preview Automatically</div>
              </div>
              {lastSavedRunAt ? (
                <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-1 text-[11px] text-[rgb(var(--muted))]">
                  Última execução salva: {new Date(lastSavedRunAt).toLocaleString("pt-BR")}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-x-scroll overflow-y-scroll" style={{ scrollbarGutter: "stable both-edges" }}>
                {previewForGrid.columns.length ? (
                  <table className="w-max table-auto border border-[rgb(var(--border))] text-xs">
                    <thead className="sticky top-0 z-[1] bg-[rgb(var(--panel-2))]">
                      <tr>
                        <th className="whitespace-nowrap border-b border-r border-[rgb(var(--border))] px-2 py-2 text-left font-semibold text-[rgb(var(--muted))]">#</th>
                        {groupFieldsForGrid.length
                          ? [...groupFieldsForGrid, ...detailFieldsForGrid].map((c) => (
                              <th
                                key={c}
                                className="whitespace-nowrap border-b border-r border-[rgb(var(--border))] px-2 py-2 text-left font-semibold text-[rgb(var(--muted))] last:border-r-0"
                              >
                                {fieldLabel(availableFields, c)}
                              </th>
                            ))
                          : previewForGrid.columns.map((c) => (
                              <th
                                key={c}
                                className="whitespace-nowrap border-b border-r border-[rgb(var(--border))] px-2 py-2 text-left font-semibold text-[rgb(var(--muted))] last:border-r-0"
                              >
                                {fieldLabel(availableFields, c)}
                              </th>
                            ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupFieldsForGrid.length
                        ? groupedPreviewRows.map((row, idx) => (
                            row.kind === "detail" ? (
                              <tr key={`grouped_detail_${idx}`} className="border-b border-[rgb(var(--border))]">
                                <td className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 align-top text-[rgb(var(--muted))]">{row.rowNumber}</td>
                                {groupFieldsForGrid.map((field, level) => (
                                  <td
                                    key={`group_cell_${idx}_${field}`}
                                    className={[
                                      "whitespace-nowrap px-2 py-2 align-top",
                                      row.groupLabels[level]
                                        ? "border-r border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] font-semibold text-[rgb(var(--text))]"
                                        : "border-r border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] text-transparent",
                                    ].join(" ")}
                                  >
                                    {row.groupLabels[level] || "—"}
                                  </td>
                                ))}
                                {detailFieldsForGrid.map((c) => (
                                  <td key={`grouped_${idx}_${c}`} className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 align-top text-[rgb(var(--text))] last:border-r-0">
                                    {formatCell(row.source[c])}
                                  </td>
                                ))}
                              </tr>
                            ) : (
                              <tr key={`grouped_subtotal_${idx}`} className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
                                <td className="border-r border-[rgb(var(--border))] px-2 py-2 text-[rgb(var(--muted))]"> </td>
                                {groupFieldsForGrid.map((field, level) => (
                                  <td
                                    key={`subtotal_group_${idx}_${field}`}
                                    className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 font-semibold text-[rgb(var(--text))] last:border-r-0"
                                  >
                                    {level === row.level ? `Subtotal ${row.groupValue} (${row.count})` : ""}
                                  </td>
                                ))}
                                {detailFieldsForGrid.map((c, detailIdx) => (
                                  <td
                                    key={`subtotal_detail_${idx}_${c}`}
                                    className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 font-semibold text-[rgb(var(--muted))] last:border-r-0"
                                  >
                                    {detailIdx === 0 ? `${row.count} registro(s)` : ""}
                                  </td>
                                ))}
                              </tr>
                            )
                          ))
                        : previewForGrid.rows.slice(0, PREVIEW_VISIBLE_ROWS).map((r, idx) => (
                            <tr key={`row_${idx}`} className="border-b border-[rgb(var(--border))]">
                              <td className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 align-top text-[rgb(var(--muted))]">{idx + 1}</td>
                              {previewForGrid.columns.map((c) => (
                                <td key={`${idx}_${c}`} className="whitespace-nowrap border-r border-[rgb(var(--border))] px-2 py-2 align-top text-[rgb(var(--text))] last:border-r-0">
                                  {formatCell(r[c])}
                                </td>
                              ))}
                            </tr>
                          ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-3 py-4 text-sm text-[rgb(var(--muted))]">Adicione colunas no Outline para visualizar a prévia.</div>
                )}
              </div>
            </section>
          </div>
          )}
          </section>
        </div>
      )}

      {filterModalOpen && filterDraft ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={closeFilterModal} aria-label="Fechar modal de filtro" />

          <section className="relative z-[1] flex w-[min(640px,96vw)] flex-col overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-xl">
            <header className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Filtro</div>
                <h2 className="truncate text-lg font-semibold">Filtrar por</h2>
              </div>
              <button className="btn btn-secondary !rounded-none" onClick={closeFilterModal}>
                Fechar
              </button>
            </header>

            <div className="space-y-3 p-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Campo</div>
                <select
                  className="input h-9 rounded-none px-2 py-1.5 text-sm"
                  value={filterDraft.field}
                  onChange={(e) => setFilterDraft((prev) => (prev ? { ...prev, field: e.target.value } : prev))}
                >
                  <option value="">Selecione um campo</option>
                  {availableFields.map((af) => (
                    <option key={`filter_field_${af.key}`} value={af.key}>
                      {af.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Operador</div>
                <select
                  className="input h-9 rounded-none px-2 py-1.5 text-sm"
                  value={filterDraft.op}
                  onChange={(e) =>
                    setFilterDraft((prev) => {
                      if (!prev) return prev;
                      const nextOp = e.target.value as FilterRow["op"];
                      return {
                        ...prev,
                        op: nextOp,
                        value: isEmptyOp(nextOp) ? "" : prev.value,
                        value_to: isBetweenOp(nextOp) ? prev.value_to : "",
                      };
                    })
                  }
                >
                  {FILTER_OPS.map((op) => (
                    <option key={`filter_op_${op.value}`} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Valor</div>
                <input
                  className="input h-9 rounded-none px-2 py-1.5 text-sm"
                  value={filterDraft.value}
                  onChange={(e) => setFilterDraft((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
                  disabled={isEmptyOp(filterDraft.op)}
                  placeholder="Digite o valor"
                />
              </div>

              {isBetweenOp(filterDraft.op) ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Valor final</div>
                  <input
                    className="input h-9 rounded-none px-2 py-1.5 text-sm"
                    value={filterDraft.value_to}
                    onChange={(e) => setFilterDraft((prev) => (prev ? { ...prev, value_to: e.target.value } : prev))}
                    placeholder="Digite o valor final"
                  />
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <button className="btn btn-secondary !rounded-none" onClick={closeFilterModal}>
                Cancelar
              </button>
              <button className="btn btn-success !rounded-none" onClick={applyFilterModal}>
                Aplicar
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {reportMetaModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setReportMetaModalOpen(false)}
            aria-label="Fechar modal de dados do relatório"
          />

          <section className="relative z-[1] flex w-[min(760px,96vw)] flex-col overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-xl">
            <header className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Relatórios</div>
                <h2 className="truncate text-lg font-semibold">{reportMetaMode === "new" ? "Novo relatório" : "Editar dados do relatório"}</h2>
              </div>
              <button className="btn btn-secondary !rounded-none" onClick={() => setReportMetaModalOpen(false)} disabled={saving}>
                Fechar
              </button>
            </header>

            <div className="space-y-3 p-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Nome do Relatório</div>
                  <input
                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                    value={metaDraftName}
                    onChange={(e) => setMetaDraftName(e.target.value)}
                    placeholder="Nome do relatório"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Objeto</div>
                  <select
                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                    value={metaDraftType}
                    onChange={(e) => setMetaDraftType((e.target.value as ReportTypeKey) || "")}
                  >
                    <option value="">Selecione o objeto</option>
                    {types.map((t) => (
                      <option key={`meta_type_${t.key}`} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Pasta</div>
                  <select
                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                    value={metaDraftFolder}
                    onChange={(e) => setMetaDraftFolder((e.target.value as ReportFolderKey) || "private")}
                  >
                    <option value="private">Pasta Privada</option>
                    <option value="public">Pasta Pública</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Descrição</div>
                <textarea
                  className="input min-h-[96px] w-full rounded-md"
                  value={metaDraftDescription}
                  onChange={(e) => setMetaDraftDescription(e.target.value)}
                  placeholder="Descrição (opcional)"
                />
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <button className="btn btn-secondary !rounded-none" onClick={() => setReportMetaModalOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-success !rounded-none" onClick={applyReportMetaFromModal} disabled={saving}>
                {reportMetaMode === "new" ? "Continuar" : "Aplicar"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

    </div>
  );
}
