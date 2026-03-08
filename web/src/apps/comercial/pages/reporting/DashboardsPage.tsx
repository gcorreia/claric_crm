import { useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, PointerSensor, type DragEndEvent, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
  listReports,
  patchDashboard,
  runSavedReport,
  type DashboardDefinitionOut,
  type DashboardFolderKey,
  type DashboardGaugeConfig,
  type DashboardGaugeMeasurement,
  type DashboardGroupedBarConfig,
  type DashboardGroupedColumnConfig,
  type DashboardGroupedDonutConfig,
  type DashboardKpiConfig,
  type DashboardWidgetConfig,
  type DashboardWidgetType,
  type ReportDefinitionOut,
  type ReportRunOut,
} from "../../reportsApi";

type WidgetResultMap = Record<string, ReportRunOut | undefined>;

type DraftWidget = DashboardWidgetConfig;

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

function newWidgetId() {
  return `wg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function reportLabel(reports: ReportDefinitionOut[], reportId: string): string {
  const found = reports.find((r) => r.id === reportId);
  return found?.name || reportId;
}

function formatCompactK(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}K`;
  return `${sign}${abs.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

function metricValueFromRun(run: ReportRunOut | undefined, measurement: DashboardGaugeMeasurement): number {
  if (!run) return 0;
  if (measurement === "record_count") {
    return Number.isFinite(Number(run.total_rows)) ? Number(run.total_rows) : run.rows.length;
  }
  if (!run.rows.length || !run.columns.length) return 0;
  let valueField = "";
  for (const col of run.columns) {
    if (run.rows.some((row) => toNumber((row || {})[col]) !== null)) {
      valueField = col;
      break;
    }
  }
  if (!valueField) return Number.isFinite(Number(run.total_rows)) ? Number(run.total_rows) : run.rows.length;
  let total = 0;
  for (const row of run.rows) {
    const n = toNumber((row || {})[valueField]);
    if (n !== null) total += n;
  }
  return total;
}

function kpiPrimaryText(value: number, measurement: DashboardGaugeMeasurement): string {
  if (measurement === "record_count") return value.toLocaleString("pt-BR");
  return `R$ ${formatCompactK(value)}`;
}

function KpiTile(props: {
  title: string;
  reportName: string;
  value: number;
  measurement: DashboardGaugeMeasurement;
}) {
  return (
    <div className="border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
      <div className="text-[28px] font-medium leading-tight text-[rgb(var(--text))]">{props.title || "KPI"}</div>
      <div className="py-8 text-center text-[64px] font-medium leading-none text-teal-700">{kpiPrimaryText(props.value, props.measurement)}</div>
      <div className="text-base font-medium text-[rgb(var(--muted))]">Ver relatório ({props.reportName || "—"})</div>
    </div>
  );
}

function tableColumns(run: ReportRunOut | undefined): string[] {
  if (!run) return [];
  return run.columns.slice(0, 5);
}

type SeriesPoint = {
  label: string;
  value: number;
  color: string;
};

const CHART_COLORS = ["#1d4ed8", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be123c", "#0f766e"];
const DEFAULT_GAUGE_MEASUREMENT: DashboardGaugeMeasurement = "sum_values";
const DEFAULT_KPI_CONFIG: DashboardKpiConfig = {
  measurement: DEFAULT_GAUGE_MEASUREMENT,
};
const DEFAULT_GROUPED_BAR_CONFIG: DashboardGroupedBarConfig = {
  group_field_1: "",
  group_field_2: "",
  measurement: "record_count",
  sum_field: null,
  max_rows: 20,
};
const DEFAULT_GROUPED_COLUMN_CONFIG: DashboardGroupedColumnConfig = {
  x_field: "",
  series_field: "",
  measurement: "record_count",
  sum_field: null,
  max_items: 20,
};
const DEFAULT_GROUPED_DONUT_CONFIG: DashboardGroupedDonutConfig = {
  category_field: "",
  measurement: "record_count",
  sum_field: null,
  max_items: 8,
};
const DEFAULT_GAUGE_CONFIG: DashboardGaugeConfig = {
  min: 0,
  max: 1500000,
  yellow_from: 600000,
  green_from: 900000,
  measurement: DEFAULT_GAUGE_MEASUREMENT,
  show_percentages: false,
  show_values: true,
  show_ranges: true,
};

function folderKey(value: string | null | undefined): DashboardFolderKey {
  return value === "public" ? "public" : "private";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function runSeries(run: ReportRunOut | undefined, maxItems = 8): SeriesPoint[] {
  if (!run || !run.rows.length || !run.columns.length) return [];
  const first = run.rows[0] || {};
  const cols = run.columns;

  let valueField = cols.find((c) => typeof first[c] === "number") || "";
  if (!valueField) {
    valueField = cols.find((c) => toNumber(first[c]) !== null) || "";
  }
  if (!valueField) return [];

  const labelField = cols.find((c) => c !== valueField && typeof first[c] !== "number") || cols[0];

  const points: SeriesPoint[] = [];
  for (let i = 0; i < run.rows.length; i += 1) {
    const row = run.rows[i] || {};
    const n = toNumber(row[valueField]);
    if (n === null) continue;
    const labelRaw = row[labelField];
    const label = String(labelRaw ?? `Item ${i + 1}`);
    points.push({
      label,
      value: n,
      color: CHART_COLORS[points.length % CHART_COLORS.length],
    });
    if (points.length >= maxItems) break;
  }
  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function widgetTypeTitle(type: DashboardWidgetType): string {
  if (type === "kpi") return "KPI";
  if (type === "grouped_bar") return "Barras agrupadas";
  if (type === "grouped_column") return "Colunas agrupadas";
  if (type === "grouped_donut") return "Donut agrupado";
  if (type === "grouped_funnel") return "Funil agrupado";
  return "Gauge";
}

function widgetGaugeConfig(widget: DraftWidget): DashboardGaugeConfig {
  const raw = widget.gauge || { min: 0, max: 100, yellow_from: 40, green_from: 70 };
  const min = Number.isFinite(raw.min) ? Number(raw.min) : 0;
  const maxRaw = Number.isFinite(raw.max) ? Number(raw.max) : 100;
  const max = maxRaw > min ? maxRaw : min + 1;
  const yellow = clamp(Number(raw.yellow_from ?? min + (max - min) * 0.4), min, max);
  const green = clamp(Number(raw.green_from ?? min + (max - min) * 0.7), yellow, max);
  const measurement = raw.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT;
  return {
    min,
    max,
    yellow_from: yellow,
    green_from: green,
    measurement,
    show_percentages: raw.show_percentages === true,
    show_values: raw.show_values !== false,
    show_ranges: raw.show_ranges !== false,
  };
}

function widgetKpiConfig(widget: DraftWidget): DashboardKpiConfig {
  const raw = widget.kpi || {};
  return {
    measurement: raw.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT,
  };
}

function runColumns(run: ReportRunOut | undefined): string[] {
  if (!run) return [];
  return Array.isArray(run.columns) ? run.columns.filter((c) => !!c) : [];
}

function runNumericColumns(run: ReportRunOut | undefined): string[] {
  const cols = runColumns(run);
  if (!run?.rows?.length) return [];
  return cols.filter((col) => run.rows.some((row) => toNumber((row || {})[col]) !== null));
}

function pickColumn(columns: string[], preferred: string, fallbackIndex = 0, except = ""): string {
  const desired = (preferred || "").trim();
  if (desired && columns.includes(desired) && desired !== except) return desired;
  const fromIndex = columns[fallbackIndex];
  if (fromIndex && fromIndex !== except) return fromIndex;
  return columns.find((c) => c !== except) || "";
}

function widgetGroupedBarConfig(widget: DraftWidget): DashboardGroupedBarConfig {
  const raw = widget.grouped_bar || {};
  const maxRowsRaw = Number(raw.max_rows);
  const maxRows = Number.isFinite(maxRowsRaw) ? Math.max(3, Math.min(200, Math.round(maxRowsRaw))) : 20;
  return {
    group_field_1: typeof raw.group_field_1 === "string" ? raw.group_field_1 : "",
    group_field_2: typeof raw.group_field_2 === "string" ? raw.group_field_2 : "",
    measurement: raw.measurement === "sum_values" ? "sum_values" : "record_count",
    sum_field: typeof raw.sum_field === "string" && raw.sum_field.trim() ? raw.sum_field.trim() : null,
    max_rows: maxRows,
  };
}

function resolveGroupedBarConfig(run: ReportRunOut | undefined, config: DashboardGroupedBarConfig): DashboardGroupedBarConfig {
  const cols = runColumns(run);
  const numericCols = runNumericColumns(run);
  const measurement = config.measurement === "sum_values" ? "sum_values" : "record_count";
  const group1 = pickColumn(cols, String(config.group_field_1 || ""), 0);
  const group2 = pickColumn(cols, String(config.group_field_2 || ""), 1, group1);
  const sumField = measurement === "sum_values" ? pickColumn(numericCols, String(config.sum_field || ""), 0) : "";
  const maxRowsRaw = Number(config.max_rows);
  const maxRows = Number.isFinite(maxRowsRaw) ? Math.max(3, Math.min(200, Math.round(maxRowsRaw))) : 20;
  return {
    group_field_1: group1,
    group_field_2: group2,
    measurement,
    sum_field: sumField || null,
    max_rows: maxRows,
  };
}

type GroupedBarRow = {
  key: string;
  group1: string;
  group2: string;
  value: number;
};

function groupedBarRows(run: ReportRunOut | undefined, config: DashboardGroupedBarConfig): GroupedBarRow[] {
  if (!run?.rows?.length) return [];
  const resolved = resolveGroupedBarConfig(run, config);
  const group1Field = String(resolved.group_field_1 || "");
  const group2Field = String(resolved.group_field_2 || "");
  if (!group1Field) return [];
  if (resolved.measurement === "sum_values" && !resolved.sum_field) return [];

  const acc = new Map<string, GroupedBarRow>();
  for (const row of run.rows) {
    const data = row || {};
    const group1 = String(data[group1Field] ?? "—");
    const group2 = group2Field ? String(data[group2Field] ?? "—") : "—";
    const key = `${group1}\u241f${group2}`;
    const current = acc.get(key) || { key, group1, group2, value: 0 };
    if (resolved.measurement === "sum_values") {
      const n = toNumber(data[String(resolved.sum_field || "")]);
      if (n === null) continue;
      current.value += n;
    } else {
      current.value += 1;
    }
    acc.set(key, current);
  }

  const rows = Array.from(acc.values()).sort((a, b) => b.value - a.value || a.group1.localeCompare(b.group1));
  return rows.slice(0, Math.max(1, Number(resolved.max_rows || 20)));
}

function groupedValueLabel(value: number, measurement: DashboardGaugeMeasurement): string {
  if (measurement === "sum_values") {
    return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return Math.round(value).toLocaleString("pt-BR");
}

function widgetGroupedColumnConfig(widget: DraftWidget): DashboardGroupedColumnConfig {
  const raw = widget.grouped_column || {};
  const maxItemsRaw = Number(raw.max_items);
  const maxItems = Number.isFinite(maxItemsRaw) ? Math.max(3, Math.min(200, Math.round(maxItemsRaw))) : 20;
  return {
    x_field: typeof raw.x_field === "string" ? raw.x_field : "",
    series_field: typeof raw.series_field === "string" ? raw.series_field : "",
    measurement: raw.measurement === "sum_values" ? "sum_values" : "record_count",
    sum_field: typeof raw.sum_field === "string" && raw.sum_field.trim() ? raw.sum_field.trim() : null,
    max_items: maxItems,
  };
}

function resolveGroupedColumnConfig(run: ReportRunOut | undefined, config: DashboardGroupedColumnConfig): DashboardGroupedColumnConfig {
  const cols = runColumns(run);
  const numericCols = runNumericColumns(run);
  const measurement = config.measurement === "sum_values" ? "sum_values" : "record_count";
  const xField = pickColumn(cols, String(config.x_field || ""), 0);
  const seriesField = pickColumn(cols, String(config.series_field || ""), 1, xField);
  const sumField = measurement === "sum_values" ? pickColumn(numericCols, String(config.sum_field || ""), 0) : "";
  const maxItemsRaw = Number(config.max_items);
  const maxItems = Number.isFinite(maxItemsRaw) ? Math.max(3, Math.min(200, Math.round(maxItemsRaw))) : 20;
  return {
    x_field: xField,
    series_field: seriesField || "",
    measurement,
    sum_field: sumField || null,
    max_items: maxItems,
  };
}

type GroupedColumnSeries = {
  name: string;
  color: string;
};

type GroupedColumnPoint = {
  category: string;
  series: string;
  value: number;
};

function groupedColumnData(
  run: ReportRunOut | undefined,
  config: DashboardGroupedColumnConfig,
): {
  categories: string[];
  series: GroupedColumnSeries[];
  points: GroupedColumnPoint[];
  measurement: DashboardGaugeMeasurement;
} {
  const resolved = resolveGroupedColumnConfig(run, config);
  if (!run?.rows?.length || !resolved.x_field) {
    return { categories: [], series: [], points: [], measurement: resolved.measurement || "record_count" };
  }
  if (resolved.measurement === "sum_values" && !resolved.sum_field) {
    return { categories: [], series: [], points: [], measurement: resolved.measurement || "record_count" };
  }
  const xField = String(resolved.x_field || "");
  const seriesField = String(resolved.series_field || "");
  const valueMap = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  const seriesNames = new Set<string>();

  for (const row of run.rows) {
    const data = row || {};
    const category = String(data[xField] ?? "—");
    const series = seriesField ? String(data[seriesField] ?? "—") : "Total";
    let inc = 0;
    if (resolved.measurement === "sum_values") {
      const n = toNumber(data[String(resolved.sum_field || "")]);
      if (n === null) continue;
      inc = n;
    } else {
      inc = 1;
    }
    const key = `${category}\u241f${series}`;
    valueMap.set(key, Number(valueMap.get(key) || 0) + inc);
    categoryTotals.set(category, Number(categoryTotals.get(category) || 0) + inc);
    seriesNames.add(series);
  }

  const categories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, Number(resolved.max_items || 20)))
    .map(([category]) => category);

  const seriesOrdered = Array.from(seriesNames.values()).sort((a, b) => a.localeCompare(b));
  const series = seriesOrdered.map((name, idx) => ({ name, color: CHART_COLORS[idx % CHART_COLORS.length] }));
  const points: GroupedColumnPoint[] = [];
  for (const category of categories) {
    for (const s of seriesOrdered) {
      const key = `${category}\u241f${s}`;
      const value = Number(valueMap.get(key) || 0);
      points.push({
        category,
        series: s,
        value,
      });
    }
  }
  return {
    categories,
    series,
    points,
    measurement: resolved.measurement || "record_count",
  };
}

function widgetGroupedDonutConfig(widget: DraftWidget): DashboardGroupedDonutConfig {
  const raw = widget.grouped_donut || {};
  const maxItemsRaw = Number(raw.max_items);
  const maxItems = Number.isFinite(maxItemsRaw) ? Math.max(3, Math.min(200, Math.round(maxItemsRaw))) : 8;
  return {
    category_field: typeof raw.category_field === "string" ? raw.category_field : "",
    measurement: raw.measurement === "sum_values" ? "sum_values" : "record_count",
    sum_field: typeof raw.sum_field === "string" && raw.sum_field.trim() ? raw.sum_field.trim() : null,
    max_items: maxItems,
  };
}

function resolveGroupedDonutConfig(run: ReportRunOut | undefined, config: DashboardGroupedDonutConfig): DashboardGroupedDonutConfig {
  const cols = runColumns(run);
  const numericCols = runNumericColumns(run);
  const measurement = config.measurement === "sum_values" ? "sum_values" : "record_count";
  const categoryField = pickColumn(cols, String(config.category_field || ""), 0);
  const sumField = measurement === "sum_values" ? pickColumn(numericCols, String(config.sum_field || ""), 0) : "";
  const maxItemsRaw = Number(config.max_items);
  const maxItems = Number.isFinite(maxItemsRaw) ? Math.max(3, Math.min(200, Math.round(maxItemsRaw))) : 8;
  return {
    category_field: categoryField,
    measurement,
    sum_field: sumField || null,
    max_items: maxItems,
  };
}

type GroupedDonutSlice = {
  label: string;
  value: number;
  color: string;
};

function groupedDonutData(
  run: ReportRunOut | undefined,
  config: DashboardGroupedDonutConfig,
): {
  slices: GroupedDonutSlice[];
  total: number;
  measurement: DashboardGaugeMeasurement;
  categoryField: string;
  sumField: string;
} {
  const resolved = resolveGroupedDonutConfig(run, config);
  if (!run?.rows?.length || !resolved.category_field) {
    return {
      slices: [],
      total: 0,
      measurement: resolved.measurement || "record_count",
      categoryField: String(resolved.category_field || ""),
      sumField: String(resolved.sum_field || ""),
    };
  }
  if (resolved.measurement === "sum_values" && !resolved.sum_field) {
    return {
      slices: [],
      total: 0,
      measurement: resolved.measurement || "record_count",
      categoryField: String(resolved.category_field || ""),
      sumField: String(resolved.sum_field || ""),
    };
  }

  const categoryField = String(resolved.category_field || "");
  const acc = new Map<string, number>();
  for (const row of run.rows) {
    const data = row || {};
    const label = String(data[categoryField] ?? "—");
    const current = Number(acc.get(label) || 0);
    if (resolved.measurement === "sum_values") {
      const n = toNumber(data[String(resolved.sum_field || "")]);
      if (n === null) continue;
      acc.set(label, current + n);
    } else {
      acc.set(label, current + 1);
    }
  }

  const ordered = Array.from(acc.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const maxItems = Math.max(3, Number(resolved.max_items || 8));
  let limited = ordered.slice(0, maxItems);
  if (ordered.length > maxItems) {
    const keep = ordered.slice(0, maxItems - 1);
    const otherValue = ordered.slice(maxItems - 1).reduce((sum, item) => sum + item[1], 0);
    limited = [...keep, ["Other", otherValue]];
  }
  const total = limited.reduce((sum, row) => sum + row[1], 0);
  const slices: GroupedDonutSlice[] = limited.map(([label, value], idx) => ({
    label,
    value,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }));

  return {
    slices,
    total,
    measurement: resolved.measurement || "record_count",
    categoryField,
    sumField: String(resolved.sum_field || ""),
  };
}

function GroupedBarTile(props: {
  title: string;
  reportName: string;
  run: ReportRunOut | undefined;
  config: DashboardGroupedBarConfig;
}) {
  const resolved = resolveGroupedBarConfig(props.run, props.config);
  const rows = groupedBarRows(props.run, resolved);
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const metricLabel = resolved.measurement === "sum_values" ? "Soma" : "Record Count";
  const fieldOneLabel = resolved.group_field_1 || "Grupo 1";
  const fieldTwoLabel = resolved.group_field_2 || "Grupo 2";

  return (
    <div className="border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
      <div className="mb-1 truncate text-sm font-semibold text-[rgb(var(--text))]">{props.title || "Barras agrupadas"}</div>
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]">
        <div className="truncate">
          {fieldOneLabel}
          {resolved.group_field_2 ? ` > ${fieldTwoLabel}` : ""}
        </div>
        <div className="shrink-0">{metricLabel}</div>
      </div>

      <div className="max-h-[230px] space-y-1.5 overflow-auto pr-1">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,132px)_minmax(0,132px)_1fr_auto] items-center gap-2">
              <div className="truncate text-xs font-medium text-[rgb(var(--text))]">{row.group1}</div>
              <div className="truncate text-xs text-[rgb(var(--muted))]">{row.group2}</div>
              <div className="h-6 overflow-hidden border border-[rgb(var(--border))] bg-white/70">
                <div
                  className="flex h-full items-center justify-end bg-[#3b8edb] pr-1 text-[11px] font-semibold text-slate-900"
                  style={{ width: `${Math.max(4, (row.value / maxValue) * 100)}%` }}
                />
              </div>
              <div className="text-xs font-semibold text-[rgb(var(--text))]">{groupedValueLabel(row.value, resolved.measurement || "record_count")}</div>
            </div>
          ))
        ) : (
          <div className="px-1 py-2 text-xs text-[rgb(var(--muted))]">Sem dados para o agrupamento selecionado.</div>
        )}
      </div>

      <div className="mt-2 text-sm font-medium text-[rgb(var(--muted))]">Ver relatório ({props.reportName || "—"})</div>
    </div>
  );
}

function GroupedColumnTile(props: {
  title: string;
  reportName: string;
  run: ReportRunOut | undefined;
  config: DashboardGroupedColumnConfig;
}) {
  const resolved = resolveGroupedColumnConfig(props.run, props.config);
  const data = groupedColumnData(props.run, resolved);
  const categories = data.categories;
  const series = data.series;
  const points = data.points;
  const pointMap = new Map<string, number>();
  for (const point of points) {
    pointMap.set(`${point.category}\u241f${point.series}`, point.value);
  }
  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const yMetricLabel = data.measurement === "sum_values" ? "Soma" : "Record Count";
  const xAxisLabel = resolved.x_field || "Categoria";
  const seriesLabel = resolved.series_field || "Série";

  const svgW = 560;
  const svgH = 270;
  const left = 56;
  const right = 18;
  const top = 18;
  const bottom = 82;
  const plotW = svgW - left - right;
  const plotH = svgH - top - bottom;
  const seriesCount = Math.max(1, series.length);
  const categoryCount = Math.max(1, categories.length);
  const band = plotW / categoryCount;
  const barGap = 2;
  const barsArea = Math.max(8, band - 10);
  const barW = Math.max(4, (barsArea - barGap * (seriesCount - 1)) / seriesCount);
  const barsTotal = barW * seriesCount + barGap * (seriesCount - 1);

  const tickValues = Array.from({ length: 5 }, (_, idx) => (maxValue * idx) / 4);
  const short = (label: string) => (label.length > 10 ? `${label.slice(0, 9)}...` : label);

  return (
    <div className="border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
      <div className="mb-2 truncate text-[22px] font-medium leading-tight text-[rgb(var(--text))]">{props.title || "Colunas agrupadas"}</div>

      {categories.length && series.length ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px]">
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-[240px] min-w-[520px] w-full">
              {tickValues.map((tick, idx) => {
                const y = top + plotH - (maxValue ? (tick / maxValue) * plotH : 0);
                return (
                  <g key={`tick_${idx}`}>
                    <line x1={left} y1={y} x2={left + plotW} y2={y} stroke="#cbd5e1" strokeWidth="1" />
                    <text x={left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">
                      {groupedValueLabel(tick, data.measurement)}
                    </text>
                  </g>
                );
              })}

              {categories.map((category, catIdx) => {
                return series.map((s, sIdx) => {
                  const key = `${category}\u241f${s.name}`;
                  const value = Number(pointMap.get(key) || 0);
                  const h = maxValue ? (value / maxValue) * plotH : 0;
                  const x = left + catIdx * band + (band - barsTotal) / 2 + sIdx * (barW + barGap);
                  const y = top + plotH - h;
                  return <rect key={`bar_${catIdx}_${sIdx}`} x={x} y={y} width={barW} height={Math.max(0.8, h)} fill={s.color} />;
                });
              })}

              {categories.map((category, idx) => {
                const x = left + idx * band + band / 2;
                return (
                  <text
                    key={`x_${idx}`}
                    transform={`translate(${x}, ${top + plotH + 24}) rotate(-38)`}
                    textAnchor="end"
                    fontSize="10"
                    fill="#334155"
                  >
                    {short(category)}
                  </text>
                );
              })}

              <text x={18} y={top + plotH / 2} transform={`rotate(-90 18 ${top + plotH / 2})`} textAnchor="middle" fontSize="10.5" fill="#334155">
                {yMetricLabel}
              </text>
              <text x={left + plotW / 2} y={svgH - 8} textAnchor="middle" fontSize="10.5" fill="#334155">
                {xAxisLabel}
              </text>
            </svg>
          </div>

          <div className="space-y-1.5">
            <div className="text-[12px] text-[rgb(var(--muted))]">{seriesLabel}</div>
            {series.map((s) => (
              <div key={`legend_${s.name}`} className="flex items-center gap-2 text-sm text-[rgb(var(--text))]">
                <span className="inline-block h-4 w-4 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-1 py-3 text-sm text-[rgb(var(--muted))]">Sem dados para o gráfico selecionado.</div>
      )}

      <div className="mt-2 text-sm font-medium text-[rgb(var(--muted))]">Ver relatório ({props.reportName || "—"})</div>
    </div>
  );
}

function GroupedDonutTile(props: {
  title: string;
  reportName: string;
  run: ReportRunOut | undefined;
  config: DashboardGroupedDonutConfig;
}) {
  const data = groupedDonutData(props.run, props.config);
  const slices = data.slices;
  const total = data.total;
  const metricTitle =
    data.measurement === "sum_values" ? `Soma de ${data.sumField || "Valores"}` : "Contagem de Registros";

  const centerText = data.measurement === "sum_values" ? formatCompactK(total) : Math.round(total).toLocaleString("pt-BR");
  const ring = useMemo(() => {
    if (!slices.length || total <= 0) return "conic-gradient(#e2e8f0 0 100%)";
    let acc = 0;
    const ranges: string[] = [];
    for (const slice of slices) {
      const start = acc;
      const pct = (slice.value / total) * 100;
      acc += pct;
      ranges.push(`${slice.color} ${start}% ${acc}%`);
    }
    return `conic-gradient(${ranges.join(", ")})`;
  }, [slices, total]);

  return (
    <div className="border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
      <div className="mb-1 truncate text-[22px] font-medium leading-tight text-[rgb(var(--text))]">{props.title || "Donut agrupado"}</div>

      {slices.length ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <div className="mb-1 text-[13px] text-[rgb(var(--muted))]">{metricTitle}</div>
            <div className="relative mx-auto h-[260px] max-w-[360px]">
              <div
                className="absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgb(var(--border))]"
                style={{ background: ring }}
              />
              <div className="absolute left-1/2 top-1/2 h-[112px] w-[112px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[38px] font-medium text-[rgb(var(--text))]">
                {centerText}
              </div>

              {slices.map((slice, idx) => {
                const startPct = slices.slice(0, idx).reduce((sum, row) => sum + (total > 0 ? row.value / total : 0), 0);
                const centerPct = startPct + (total > 0 ? slice.value / total : 0) / 2;
                const angle = centerPct * Math.PI * 2 - Math.PI / 2;
                const rx = Math.round(Math.cos(angle) * 95);
                const ry = Math.round(Math.sin(angle) * 95);
                const label =
                  data.measurement === "sum_values"
                    ? formatCompactK(slice.value)
                    : Math.round(slice.value).toLocaleString("pt-BR");
                return (
                  <div
                    key={`donut_value_${slice.label}_${idx}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-700"
                    style={{ left: `calc(50% + ${rx}px)`, top: `calc(50% + ${ry}px)` }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[12px] text-[rgb(var(--muted))]">{data.categoryField || "Categoria"}</div>
            {slices.map((slice) => (
              <div key={`legend_donut_grouped_${slice.label}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-[rgb(var(--text))]">{slice.label}</span>
                <span className="inline-block h-4 w-4 shrink-0 rounded-full" style={{ background: slice.color }} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-1 py-3 text-sm text-[rgb(var(--muted))]">Sem dados para o donut selecionado.</div>
      )}

      <div className="mt-2 text-sm font-medium text-[rgb(var(--muted))]">Ver relatório ({props.reportName || "—"})</div>
    </div>
  );
}

function GroupedFunnelTile(props: {
  title: string;
  reportName: string;
  run: ReportRunOut | undefined;
  config: DashboardGroupedDonutConfig;
}) {
  const data = groupedDonutData(props.run, props.config);
  const slices = data.slices;
  const total = data.total;
  const titleMetric =
    data.measurement === "sum_values"
      ? `Soma: ${formatCompactK(total)}`
      : `Record Count: ${Math.round(total).toLocaleString("pt-BR")}`;

  return (
    <div className="border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
      <div className="mb-2 truncate text-[22px] font-medium leading-tight text-[rgb(var(--text))]">{props.title || "Funil agrupado"}</div>

      {slices.length ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <div className="mb-1 text-[13px] text-[rgb(var(--muted))]">{titleMetric}</div>
            <svg viewBox="0 0 420 255" className="h-[255px] w-full max-w-[380px]">
              {slices.map((slice, idx) => {
                const n = slices.length;
                const topW = 210 - idx * (100 / Math.max(1, n - 1));
                const bottomW = 210 - (idx + 1) * (100 / Math.max(1, n - 1));
                const segH = 215 / n;
                const y0 = 16 + idx * segH;
                const y1 = y0 + segH;
                const cx = 170;
                const x0l = cx - topW / 2;
                const x0r = cx + topW / 2;
                const x1l = cx - bottomW / 2;
                const x1r = cx + bottomW / 2;
                return (
                  <g key={`grouped_funnel_${slice.label}_${idx}`}>
                    <polygon points={`${x0l},${y0} ${x0r},${y0} ${x1r},${y1} ${x1l},${y1}`} fill={slice.color} />
                    <text x={cx} y={y0 + segH / 2 + 5} textAnchor="middle" fontSize="20" fill="#111827" fontWeight="500">
                      {data.measurement === "sum_values" ? formatCompactK(slice.value) : Math.round(slice.value).toLocaleString("pt-BR")}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="space-y-1.5">
            <div className="text-[12px] text-[rgb(var(--muted))]">{data.categoryField || "Categoria"}</div>
            {slices.map((slice) => (
              <div key={`legend_funnel_${slice.label}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-[rgb(var(--text))]">{slice.label}</span>
                <span className="inline-block h-4 w-4 shrink-0 rounded-[4px]" style={{ background: slice.color }} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-1 py-3 text-sm text-[rgb(var(--muted))]">Sem dados para o funil selecionado.</div>
      )}

      <div className="mt-2 text-sm font-medium text-[rgb(var(--muted))]">Ver relatório ({props.reportName || "—"})</div>
    </div>
  );
}

function polarPoint(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const diff = Math.abs(startAngle - endAngle);
  const largeArc = diff > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function gaugeAngle(config: DashboardGaugeConfig, value: number): number {
  const range = Math.max(1, config.max - config.min);
  const ratio = clamp((value - config.min) / range, 0, 1);
  return 180 - ratio * 180;
}

function GaugeDial(props: {
  value: number;
  config: DashboardGaugeConfig;
  width?: number;
  height?: number;
}) {
  const width = props.width || 300;
  const height = props.height || 188;
  const cx = width / 2;
  const cy = height - 44;
  const radius = Math.max(44, Math.min(width * 0.42, height * 0.72));
  const cfg = props.config;

  const redStart = gaugeAngle(cfg, cfg.min);
  const redEnd = gaugeAngle(cfg, cfg.yellow_from);
  const yellowStart = redEnd;
  const yellowEnd = gaugeAngle(cfg, cfg.green_from);
  const greenStart = yellowEnd;
  const greenEnd = gaugeAngle(cfg, cfg.max);

  const valueAngle = gaugeAngle(cfg, props.value);
  const needleTip = polarPoint(cx, cy, radius - 12, valueAngle);

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const pct = (n: number) => {
    const range = Math.max(1, cfg.max - cfg.min);
    return Math.round(((n - cfg.min) / range) * 100);
  };
  const valuePct = pct(clamp(props.value, cfg.min, cfg.max));
  const showPercentages = cfg.show_percentages === true;
  const showValues = cfg.show_values !== false;
  const showRanges = cfg.show_ranges !== false;
  const measurement = cfg.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT;

  const marks = [
    { value: cfg.min, angle: gaugeAngle(cfg, cfg.min), label: `${pct(cfg.min)}%` },
    { value: cfg.yellow_from, angle: gaugeAngle(cfg, cfg.yellow_from), label: `${pct(cfg.yellow_from)}%` },
    { value: cfg.green_from, angle: gaugeAngle(cfg, cfg.green_from), label: `${pct(cfg.green_from)}%` },
    { value: cfg.max, angle: gaugeAngle(cfg, cfg.max), label: `${pct(cfg.max)}%` },
  ];

  function markAnchor(angle: number): "start" | "middle" | "end" {
    if (angle >= 135) return "start";
    if (angle <= 45) return "end";
    return "middle";
  }

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[168px] w-full">
        <path d={arcPath(cx, cy, radius, redStart, redEnd)} stroke="#b91c1c" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={arcPath(cx, cy, radius, yellowStart, yellowEnd)} stroke="#d97706" strokeWidth="14" fill="none" strokeLinecap="butt" />
        <path d={arcPath(cx, cy, radius, greenStart, greenEnd)} stroke="#16a34a" strokeWidth="14" fill="none" strokeLinecap="round" />

        {marks.map((m, idx) => {
          const p = polarPoint(cx, cy, radius + 22, m.angle);
          return (
            <text
              key={`gauge_pct_${idx}`}
              x={p.x}
              y={p.y + (m.angle >= 165 || m.angle <= 15 ? 10 : 3)}
              textAnchor={markAnchor(m.angle)}
              fontSize="9"
              fill="#64748b"
              fontWeight="600"
            >
              {m.label}
            </text>
          );
        })}

        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="8" fill="#0f172a" />

        <text x={cx - radius - 2} y={cy + 30} textAnchor="start" fontSize="10" fill="#64748b">
          {fmt(cfg.min)}
        </text>
        <text x={cx + radius + 2} y={cy + 30} textAnchor="end" fontSize="10" fill="#64748b">
          {fmt(cfg.max)}
        </text>
      </svg>
      {showValues ? (
        <div className="-mt-1 text-center text-2xl font-semibold text-[#b91c1c]">
          {measurement === "record_count" ? props.value.toLocaleString("pt-BR") : `R$ ${props.value.toLocaleString("pt-BR")}`}
        </div>
      ) : null}
      {showPercentages ? <div className="mt-1 text-center text-[11px] text-[rgb(var(--muted))]">Percentual atual: {valuePct}%</div> : null}
      {showRanges ? (
        <div className="mt-1 text-center text-[11px] text-[rgb(var(--muted))]">
          Amarelo: {fmt(cfg.yellow_from)} • Verde: {fmt(cfg.green_from)}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceGaugeWidget(props: {
  widget: DraftWidget;
  run: ReportRunOut | undefined;
  reports: ReportDefinitionOut[];
  editable: boolean;
  busy: boolean;
  onChange: (widgetId: string, patch: Partial<DraftWidget>) => void;
  onEdit: (widgetId: string) => void;
  onRemove: (widgetId: string) => void;
}) {
  const draggable = useDraggable({
    id: props.widget.id,
    disabled: !props.editable || props.busy,
  });
  const transform = draggable.transform;
  const isGauge = props.widget.type === "gauge";
  const isKpi = props.widget.type === "kpi";
  const isGroupedBar = props.widget.type === "grouped_bar";
  const isGroupedColumn = props.widget.type === "grouped_column";
  const isGroupedDonut = props.widget.type === "grouped_donut";
  const isGroupedFunnel = props.widget.type === "grouped_funnel";
  const gaugeCfg = widgetGaugeConfig(props.widget);
  const kpiCfg = widgetKpiConfig(props.widget);
  const groupedBarCfg = widgetGroupedBarConfig(props.widget);
  const groupedColumnCfg = widgetGroupedColumnConfig(props.widget);
  const groupedDonutCfg = widgetGroupedDonutConfig(props.widget);
  const measurement = isGauge
    ? gaugeCfg.measurement === "record_count"
      ? "record_count"
      : DEFAULT_GAUGE_MEASUREMENT
    : kpiCfg.measurement === "record_count"
      ? "record_count"
      : DEFAULT_GAUGE_MEASUREMENT;
  const metricValue = metricValueFromRun(props.run, measurement);

  const style: React.CSSProperties = {
    position: "absolute",
    left: props.widget.x ?? 24,
    top: props.widget.y ?? 24,
    width: props.widget.w ?? 360,
    minHeight: props.widget.h ?? 240,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: draggable.isDragging ? 20 : 2,
  };

  return (
    <article ref={draggable.setNodeRef} style={style} className="border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-sm">
      <div className="flex items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {props.editable ? (
            <button
              type="button"
              className="cursor-grab border border-[rgb(var(--border))] px-1.5 py-0.5 text-xs text-[rgb(var(--muted))] active:cursor-grabbing"
              {...draggable.listeners}
              {...draggable.attributes}
              title="Arrastar widget"
            >
              ::
            </button>
          ) : null}
          {props.editable ? (
            <button className="btn btn-secondary h-7 !rounded-none px-2 text-xs" onClick={() => props.onEdit(props.widget.id)} disabled={props.busy}>
              Editar
            </button>
          ) : (
            <div className="min-w-0 truncate text-sm font-semibold">{props.widget.title}</div>
          )}
        </div>
        {props.editable ? (
          <button className="btn btn-secondary h-7 !rounded-none px-2 text-xs" onClick={() => props.onRemove(props.widget.id)} disabled={props.busy}>
            Remover
          </button>
        ) : null}
      </div>

      <div className="space-y-2 p-2">
        {props.editable && (isGauge || isKpi || isGroupedBar || isGroupedColumn || isGroupedDonut || isGroupedFunnel) ? (
          <div className="py-1 text-center text-sm font-semibold">
            <span className="truncate">{props.widget.title}</span>
          </div>
        ) : null}
        {isGauge ? (
          <GaugeDial value={metricValue} config={gaugeCfg} />
        ) : isKpi ? (
          <KpiTile
            title={props.widget.title || "KPI"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            value={metricValue}
            measurement={measurement}
          />
        ) : isGroupedBar ? (
          <GroupedBarTile
            title={props.widget.title || "Barras agrupadas"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={groupedBarCfg}
          />
        ) : isGroupedColumn ? (
          <GroupedColumnTile
            title={props.widget.title || "Colunas agrupadas"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={groupedColumnCfg}
          />
        ) : isGroupedDonut ? (
          <GroupedDonutTile
            title={props.widget.title || "Donut agrupado"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={groupedDonutCfg}
          />
        ) : isGroupedFunnel ? (
          <GroupedFunnelTile
            title={props.widget.title || "Funil agrupado"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={groupedDonutCfg}
          />
        ) : (
          <div className="rounded border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-5 text-xs text-[rgb(var(--muted))]">
            Tipo <span className="font-semibold">{props.widget.type}</span> ainda não está disponível no canvas de edição.
          </div>
        )}
      </div>
    </article>
  );
}

function boardGridClass(columns: number): string {
  if (columns <= 1) return "grid-cols-1";
  if (columns === 2) return "grid-cols-1 md:grid-cols-2";
  if (columns === 3) return "grid-cols-1 md:grid-cols-3";
  return "grid-cols-1 md:grid-cols-4";
}

function SortableWidgetCard(props: {
  widget: DraftWidget;
  reports: ReportDefinitionOut[];
  run: ReportRunOut | undefined;
  busy: boolean;
  editable: boolean;
  onChange: (widgetId: string, patch: Partial<DraftWidget>) => void;
  onRemove: (widgetId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.widget.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  const cols = tableColumns(props.run);
  const series = runSeries(props.run, 8);
  const maxSeries = Math.max(...series.map((s) => s.value), 1);
  const totalSeries = series.reduce((sum, s) => sum + s.value, 0);

  const donutGradient = useMemo(() => {
    if (!series.length || totalSeries <= 0) return "conic-gradient(#e2e8f0 0 100%)";
    let acc = 0;
    const chunks: string[] = [];
    for (const point of series) {
      const start = acc;
      const pct = (point.value / totalSeries) * 100;
      acc += pct;
      chunks.push(`${point.color} ${start}% ${acc}%`);
    }
    return `conic-gradient(${chunks.join(", ")})`;
  }, [series, totalSeries]);

  const linePoints = useMemo(() => {
    if (!series.length) return "";
    const width = 300;
    const height = 130;
    const pad = 12;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    const step = series.length > 1 ? innerW / (series.length - 1) : 0;
    return series
      .map((p, idx) => {
        const x = pad + idx * step;
        const y = height - pad - (p.value / maxSeries) * innerH;
        return `${x},${y}`;
      })
      .join(" ");
  }, [series, maxSeries]);

  return (
    <article ref={setNodeRef} style={style} className="border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2 py-1.5">
        {props.editable ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="cursor-grab border border-[rgb(var(--border))] px-1.5 py-0.5 text-xs text-[rgb(var(--muted))] active:cursor-grabbing"
                {...attributes}
                {...listeners}
                title="Arrastar widget"
              >
                ::
              </button>
              <input
                className="input h-8 min-w-0 rounded-md px-2 py-1 text-xs"
                value={props.widget.title}
                onChange={(e) => props.onChange(props.widget.id, { title: e.target.value })}
                disabled={props.busy}
              />
            </div>

            <button className="btn btn-secondary h-8 !rounded-none px-2 text-xs" onClick={() => props.onRemove(props.widget.id)} disabled={props.busy}>
              Remover
            </button>
          </>
        ) : (
          <div className="min-w-0 truncate text-sm font-semibold">{props.widget.title}</div>
        )}
      </div>

      <div className="space-y-2 p-2.5">
        {props.editable ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_1fr]">
            <select
              className="input h-8 rounded-md px-2 py-1 text-xs"
              value={props.widget.type}
              onChange={(e) => props.onChange(props.widget.id, { type: e.target.value as DashboardWidgetType })}
              disabled={props.busy}
            >
              <option value="table">Tabela</option>
              <option value="kpi">KPI</option>
              <option value="grouped_bar">Barras agrupadas</option>
              <option value="grouped_column">Colunas agrupadas</option>
              <option value="grouped_donut">Donut agrupado</option>
              <option value="grouped_funnel">Funil agrupado</option>
              <option value="bar">Gráfico de barras</option>
              <option value="line">Gráfico de linha</option>
              <option value="donut">Gráfico de donut</option>
              <option value="funnel">Funil</option>
              <option value="gauge">Gauge</option>
            </select>

            <select
              className="input h-8 rounded-md px-2 py-1 text-xs"
              value={props.widget.report_id}
              onChange={(e) => props.onChange(props.widget.id, { report_id: e.target.value })}
              disabled={props.busy}
            >
              <option value="">Selecione relatório</option>
              {props.reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-[11px] text-[rgb(var(--muted))]">
            Tipo: {props.widget.type} • Fonte: {reportLabel(props.reports, props.widget.report_id)}
          </div>
        )}

        {props.editable ? <div className="text-[11px] text-[rgb(var(--muted))]">Fonte: {reportLabel(props.reports, props.widget.report_id)}</div> : null}

        {props.widget.type === "kpi" ? (
          <KpiTile
            title={props.widget.title || "KPI"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            value={metricValueFromRun(
              props.run,
              widgetKpiConfig(props.widget).measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT,
            )}
            measurement={widgetKpiConfig(props.widget).measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT}
          />
        ) : props.widget.type === "grouped_bar" ? (
          <GroupedBarTile
            title={props.widget.title || "Barras agrupadas"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={widgetGroupedBarConfig(props.widget)}
          />
        ) : props.widget.type === "grouped_column" ? (
          <GroupedColumnTile
            title={props.widget.title || "Colunas agrupadas"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={widgetGroupedColumnConfig(props.widget)}
          />
        ) : props.widget.type === "grouped_donut" ? (
          <GroupedDonutTile
            title={props.widget.title || "Donut agrupado"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={widgetGroupedDonutConfig(props.widget)}
          />
        ) : props.widget.type === "grouped_funnel" ? (
          <GroupedFunnelTile
            title={props.widget.title || "Funil agrupado"}
            reportName={reportLabel(props.reports, props.widget.report_id)}
            run={props.run}
            config={widgetGroupedDonutConfig(props.widget)}
          />
        ) : props.widget.type === "bar" ? (
          <div className="space-y-1.5 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-2.5">
            {series.length ? (
              series.map((s) => (
                <div key={`${props.widget.id}_${s.label}`} className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-[rgb(var(--muted))]">{s.label}</div>
                    <div className="mt-0.5 h-2 w-full bg-white/70">
                      <div className="h-2" style={{ width: `${Math.max(3, (s.value / maxSeries) * 100)}%`, background: s.color }} />
                    </div>
                  </div>
                  <div className="text-xs font-semibold">{s.value.toLocaleString("pt-BR")}</div>
                </div>
              ))
            ) : (
              <div className="px-1 py-1 text-xs text-[rgb(var(--muted))]">Sem dados para gráfico.</div>
            )}
          </div>
        ) : props.widget.type === "line" ? (
          <div className="space-y-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-2.5">
            {series.length ? (
              <>
                <svg viewBox="0 0 300 130" className="h-[130px] w-full">
                  <rect x="0" y="0" width="300" height="130" fill="transparent" />
                  <polyline points={linePoints} fill="none" stroke="#2563eb" strokeWidth="2.2" />
                  {linePoints
                    .split(" ")
                    .filter(Boolean)
                    .map((pt, idx) => {
                      const [x, y] = pt.split(",");
                      return <circle key={`dot_${idx}`} cx={x} cy={y} r="2.6" fill="#2563eb" />;
                    })}
                </svg>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-[rgb(var(--muted))]">
                  {series.slice(0, 6).map((s) => (
                    <div key={`legend_line_${s.label}`} className="truncate">
                      {s.label}: <span className="font-semibold text-[rgb(var(--text))]">{s.value.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="px-1 py-1 text-xs text-[rgb(var(--muted))]">Sem dados para gráfico.</div>
            )}
          </div>
        ) : props.widget.type === "donut" ? (
          <div className="space-y-2 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-2.5">
            {series.length ? (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="relative h-24 w-24 rounded-full border border-[rgb(var(--border))]"
                    style={{ background: donutGradient }}
                  >
                    <div className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--panel))]" />
                  </div>
                  <div className="text-sm">
                    <div className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">Total</div>
                    <div className="text-lg font-semibold">{totalSeries.toLocaleString("pt-BR")}</div>
                  </div>
                </div>
                <div className="space-y-1 text-[11px]">
                  {series.map((s) => (
                    <div key={`legend_donut_${s.label}`} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: s.color }} />
                        <span className="truncate text-[rgb(var(--muted))]">{s.label}</span>
                      </div>
                      <span className="font-semibold">{s.value.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="px-1 py-1 text-xs text-[rgb(var(--muted))]">Sem dados para gráfico.</div>
            )}
          </div>
        ) : props.widget.type === "gauge" ? (
          <div className="border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-2.5">
            <GaugeDial
              value={metricValueFromRun(props.run, widgetGaugeConfig(props.widget).measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT)}
              config={widgetGaugeConfig(props.widget)}
            />
          </div>
        ) : props.widget.type === "funnel" ? (
          <div className="space-y-1.5 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-2.5">
            {series.length ? (
              series.map((s, idx) => {
                const width = Math.max(24, (s.value / maxSeries) * 100);
                return (
                  <div key={`funnel_${idx}`} className="text-center">
                    <div className="mx-auto flex h-8 items-center justify-center text-[11px] font-semibold text-white" style={{ width: `${width}%`, background: s.color }}>
                      <span className="truncate px-2">{s.label} • {s.value.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-1 py-1 text-xs text-[rgb(var(--muted))]">Sem dados para gráfico.</div>
            )}
          </div>
        ) : (
          <div className="overflow-auto border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
            {props.run && cols.length ? (
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c} className="border-b border-[rgb(var(--border))] px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {props.run.rows.slice(0, 8).map((row, idx) => (
                    <tr key={`${props.widget.id}_${idx}`} className="border-b border-[rgb(var(--border))] last:border-b-0">
                      {cols.map((c) => (
                        <td key={`${idx}_${c}`} className="px-2 py-1.5 align-top">
                          {String(row[c] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-3 py-3 text-xs text-[rgb(var(--muted))]">Sem dados.</div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function DashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardDefinitionOut[]>([]);
  const [reports, setReports] = useState<ReportDefinitionOut[]>([]);

  const [viewMode, setViewMode] = useState<"browser" | "builder">("browser");
  const [builderMode, setBuilderMode] = useState<"view" | "edit">("edit");
  const [activeFolder, setActiveFolder] = useState<DashboardFolderKey>("private");
  const [dashboardFolder, setDashboardFolder] = useState<DashboardFolderKey>("private");
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [name, setName] = useState("Novo dashboard");
  const [description, setDescription] = useState("");
  const [dashboardMetaModalOpen, setDashboardMetaModalOpen] = useState(false);
  const [metaDraftName, setMetaDraftName] = useState("");
  const [metaDraftFolder, setMetaDraftFolder] = useState<DashboardFolderKey>("private");
  const [metaDraftDescription, setMetaDraftDescription] = useState("");
  const [widgetSetupModalOpen, setWidgetSetupModalOpen] = useState(false);
  const [widgetSetupStep, setWidgetSetupStep] = useState<"report" | "config">("report");
  const [widgetSetupFolder, setWidgetSetupFolder] = useState<DashboardFolderKey>("private");
  const [widgetSetupSearch, setWidgetSetupSearch] = useState("");
  const [widgetSetupReportId, setWidgetSetupReportId] = useState("");
  const [widgetSetupType, setWidgetSetupType] = useState<DashboardWidgetType>("gauge");
  const [widgetSetupTitle, setWidgetSetupTitle] = useState("Gauge");
  const [widgetSetupGauge, setWidgetSetupGauge] = useState<DashboardGaugeConfig>(DEFAULT_GAUGE_CONFIG);
  const [widgetSetupKpi, setWidgetSetupKpi] = useState<DashboardKpiConfig>(DEFAULT_KPI_CONFIG);
  const [widgetSetupGroupedBar, setWidgetSetupGroupedBar] = useState<DashboardGroupedBarConfig>(DEFAULT_GROUPED_BAR_CONFIG);
  const [widgetSetupGroupedColumn, setWidgetSetupGroupedColumn] = useState<DashboardGroupedColumnConfig>(DEFAULT_GROUPED_COLUMN_CONFIG);
  const [widgetSetupGroupedDonut, setWidgetSetupGroupedDonut] = useState<DashboardGroupedDonutConfig>(DEFAULT_GROUPED_DONUT_CONFIG);
  const [widgetSetupRun, setWidgetSetupRun] = useState<ReportRunOut | undefined>(undefined);
  const [widgetSetupRunLoading, setWidgetSetupRunLoading] = useState(false);
  const [widgetSetupErr, setWidgetSetupErr] = useState<string | null>(null);
  const [widgetSetupRangesError, setWidgetSetupRangesError] = useState<string | null>(null);
  const [widgetSetupEditingId, setWidgetSetupEditingId] = useState<string | null>(null);
  const widgetSetupRunAbortRef = useRef<AbortController | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [columns, setColumns] = useState(2);
  const [widgets, setWidgets] = useState<DraftWidget[]>([]);

  const [runsByReportId, setRunsByReportId] = useState<WidgetResultMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingWidgets, setRefreshingWidgets] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const folderCounts = useMemo(() => {
    return dashboards.reduce(
      (acc, row) => {
        const key = row.folder === "public" ? "public" : "private";
        acc[key] += 1;
        return acc;
      },
      { public: 0, private: 0 },
    );
  }, [dashboards]);

  const visibleDashboards = useMemo(
    () => dashboards.filter((d) => (d.folder === "public" ? "public" : "private") === activeFolder),
    [dashboards, activeFolder],
  );

  const distinctReportIds = useMemo(() => {
    const ids = widgets.map((w) => w.report_id).filter(Boolean);
    return Array.from(new Set(ids));
  }, [widgets]);

  const reportFolderCounts = useMemo(() => {
    return reports.reduce(
      (acc, row) => {
        const key = folderKey(row.folder);
        acc[key] += 1;
        return acc;
      },
      { public: 0, private: 0 },
    );
  }, [reports]);

  const widgetSetupVisibleReports = useMemo(() => {
    const currentFolder = folderKey(widgetSetupFolder);
    const search = widgetSetupSearch.trim().toLowerCase();
    return reports.filter((row) => {
      if (folderKey(row.folder) !== currentFolder) return false;
      if (!search) return true;
      const name = row.name?.toLowerCase() || "";
      const descriptionText = row.description?.toLowerCase() || "";
      const objectLabel = row.report_type?.toLowerCase() || "";
      return name.includes(search) || descriptionText.includes(search) || objectLabel.includes(search);
    });
  }, [reports, widgetSetupFolder, widgetSetupSearch]);

  const widgetSetupSelectedReport = useMemo(
    () => reports.find((row) => row.id === widgetSetupReportId) || null,
    [reports, widgetSetupReportId],
  );
  const widgetSetupColumns = useMemo(() => {
    if (widgetSetupRun?.columns?.length) return widgetSetupRun.columns;
    if (widgetSetupSelectedReport?.config?.columns?.length) return widgetSetupSelectedReport.config.columns;
    return [];
  }, [widgetSetupRun, widgetSetupSelectedReport]);
  const widgetSetupNumericColumns = useMemo(() => {
    if (!widgetSetupRun?.rows?.length) return [];
    return runNumericColumns(widgetSetupRun);
  }, [widgetSetupRun]);

  const widgetSetupGaugePreviewConfig = useMemo(
    () =>
      widgetGaugeConfig({
        id: "widget_setup_preview",
        title: "widget_setup_preview",
        type: "gauge",
        report_id: widgetSetupReportId || "report",
        gauge: widgetSetupGauge,
      }),
    [widgetSetupGauge, widgetSetupReportId],
  );

  const widgetSetupKpiPreviewConfig = useMemo(
    () =>
      widgetKpiConfig({
        id: "widget_setup_preview",
        title: "widget_setup_preview",
        type: "kpi",
        report_id: widgetSetupReportId || "report",
        kpi: widgetSetupKpi,
      }),
    [widgetSetupKpi, widgetSetupReportId],
  );

  const widgetSetupGroupedBarPreviewConfig = useMemo(
    () =>
      resolveGroupedBarConfig(
        widgetSetupRun,
        widgetGroupedBarConfig({
          id: "widget_setup_preview",
          title: "widget_setup_preview",
          type: "grouped_bar",
          report_id: widgetSetupReportId || "report",
          grouped_bar: widgetSetupGroupedBar,
        }),
      ),
    [widgetSetupGroupedBar, widgetSetupReportId, widgetSetupRun],
  );

  const widgetSetupGroupedColumnPreviewConfig = useMemo(
    () =>
      resolveGroupedColumnConfig(
        widgetSetupRun,
        widgetGroupedColumnConfig({
          id: "widget_setup_preview",
          title: "widget_setup_preview",
          type: "grouped_column",
          report_id: widgetSetupReportId || "report",
          grouped_column: widgetSetupGroupedColumn,
        }),
      ),
    [widgetSetupGroupedColumn, widgetSetupReportId, widgetSetupRun],
  );

  const widgetSetupGroupedDonutPreviewConfig = useMemo(
    () =>
      resolveGroupedDonutConfig(
        widgetSetupRun,
        widgetGroupedDonutConfig({
          id: "widget_setup_preview",
          title: "widget_setup_preview",
          type: "grouped_donut",
          report_id: widgetSetupReportId || "report",
          grouped_donut: widgetSetupGroupedDonut,
        }),
      ),
    [widgetSetupGroupedDonut, widgetSetupReportId, widgetSetupRun],
  );

  function stopWidgetSetupPreview() {
    if (widgetSetupRunAbortRef.current) {
      widgetSetupRunAbortRef.current.abort();
      widgetSetupRunAbortRef.current = null;
    }
  }

  function resetWidgetSetupDraft(nextFolder: DashboardFolderKey = activeFolder) {
    stopWidgetSetupPreview();
    const folder = folderKey(nextFolder);
    const firstInFolder = reports.find((row) => folderKey(row.folder) === folder);
    const fallback = firstInFolder || null;

    setWidgetSetupEditingId(null);
    setWidgetSetupStep("report");
    setWidgetSetupFolder(folder);
    setWidgetSetupSearch("");
    setWidgetSetupReportId(fallback?.id || "");
    setWidgetSetupType("gauge");
    setWidgetSetupTitle(widgetTypeTitle("gauge"));
    setWidgetSetupGauge({ ...DEFAULT_GAUGE_CONFIG });
    setWidgetSetupKpi({ ...DEFAULT_KPI_CONFIG });
    setWidgetSetupGroupedBar({ ...DEFAULT_GROUPED_BAR_CONFIG });
    setWidgetSetupGroupedColumn({ ...DEFAULT_GROUPED_COLUMN_CONFIG });
    setWidgetSetupGroupedDonut({ ...DEFAULT_GROUPED_DONUT_CONFIG });
    setWidgetSetupRun(undefined);
    setWidgetSetupRunLoading(false);
    setWidgetSetupErr(null);
    setWidgetSetupRangesError(null);
  }

  function closeWidgetSetupModal() {
    setWidgetSetupModalOpen(false);
    resetWidgetSetupDraft(widgetSetupFolder);
  }

  function resetDraft(nextFolder: DashboardFolderKey = activeFolder) {
    setBuilderMode("edit");
    setWidgetSetupModalOpen(false);
    setActiveDashboardId(null);
    setName("Novo dashboard");
    setDashboardFolder(nextFolder);
    setDescription("");
    setColumns(2);
    setWidgets([]);
    setRunsByReportId({});
    resetWidgetSetupDraft(nextFolder);
  }

  function loadDashboardDraft(d: DashboardDefinitionOut) {
    const folder = d.folder === "public" ? "public" : "private";
    setActiveDashboardId(d.id);
    setName(d.name || "Dashboard");
    setDashboardFolder(folder);
    setActiveFolder(folder);
    setDescription(d.description || "");
    setColumns(Math.max(1, Math.min(4, Number(d.layout?.columns || 2))));
    setWidgets(Array.isArray(d.layout?.widgets) ? d.layout.widgets : []);
  }

  async function reloadDashboards(signal?: AbortSignal) {
    const rows = await listDashboards(undefined, signal);
    setDashboards(Array.isArray(rows) ? rows : []);
  }

  function openDashboardMetaModal() {
    setMetaDraftName("Novo dashboard");
    setMetaDraftFolder(activeFolder);
    setMetaDraftDescription("");
    setErr(null);
    setDashboardMetaModalOpen(true);
  }

  function applyDashboardMetaFromModal() {
    const trimmedName = metaDraftName.trim();
    if (!trimmedName) {
      setErr("Informe o nome do dashboard.");
      return;
    }
    const folder = metaDraftFolder === "public" ? "public" : "private";
    resetDraft(folder);
    setName(trimmedName);
    setDescription(metaDraftDescription.trim());
    setDashboardFolder(folder);
    setActiveFolder(folder);
    setErr(null);
    setDashboardMetaModalOpen(false);
    setViewMode("builder");
  }

  function openBuilderForNewDashboard() {
    resetDraft(activeFolder);
    setErr(null);
    setViewMode("builder");
  }

  function openBuilderForSavedDashboard(d: DashboardDefinitionOut) {
    setWidgetSetupModalOpen(false);
    loadDashboardDraft(d);
    setBuilderMode("view");
    setErr(null);
    setViewMode("builder");
  }

  function goBackToBrowser() {
    setWidgetSetupModalOpen(false);
    setViewMode("browser");
    setErr(null);
  }

  function startDashboardEditing() {
    setWidgetSetupModalOpen(false);
    setBuilderMode("edit");
    setErr(null);
  }

  function cancelDashboardEditing() {
    setWidgetSetupModalOpen(false);
    if (!activeDashboardId) {
      setBuilderMode("view");
      return;
    }
    const current = dashboards.find((d) => d.id === activeDashboardId);
    if (current) {
      loadDashboardDraft(current);
    }
    setBuilderMode("view");
    setErr(null);
  }

  function openWidgetSetupModal() {
    if (!reports.length) {
      setErr("Crie um relatório antes de adicionar widgets.");
      return;
    }
    resetWidgetSetupDraft(activeFolder);
    setWidgetSetupModalOpen(true);
    setErr(null);
  }

  function openWidgetSetupEditModal(widgetId: string) {
    const widget = widgets.find((row) => row.id === widgetId);
    if (!widget) return;

    const relatedReport = reports.find((row) => row.id === widget.report_id) || null;
    const folder = folderKey(relatedReport?.folder || activeFolder);

    stopWidgetSetupPreview();
    setWidgetSetupEditingId(widget.id);
    setWidgetSetupStep("config");
    setWidgetSetupFolder(folder);
    setWidgetSetupSearch("");
    setWidgetSetupReportId(widget.report_id);
    const nextType: DashboardWidgetType =
      widget.type === "kpi"
        ? "kpi"
        : widget.type === "grouped_bar"
          ? "grouped_bar"
          : widget.type === "grouped_column"
            ? "grouped_column"
            : widget.type === "grouped_donut"
              ? "grouped_donut"
              : widget.type === "grouped_funnel"
                ? "grouped_funnel"
              : "gauge";
    setWidgetSetupType(nextType);
    setWidgetSetupTitle(widget.title || widgetTypeTitle(nextType));
    setWidgetSetupGauge(widgetGaugeConfig(widget));
    setWidgetSetupKpi(widgetKpiConfig(widget));
    setWidgetSetupGroupedBar(widgetGroupedBarConfig(widget));
    setWidgetSetupGroupedColumn(widgetGroupedColumnConfig(widget));
    setWidgetSetupGroupedDonut(widgetGroupedDonutConfig(widget));
    setWidgetSetupRun(undefined);
    setWidgetSetupRunLoading(false);
    setWidgetSetupErr(null);
    setWidgetSetupRangesError(null);
    setWidgetSetupModalOpen(true);
    setErr(null);
    void loadWidgetSetupPreview(widget.report_id);
  }

  function changeWidgetSetupFolder(folder: DashboardFolderKey) {
    const normalized = folderKey(folder);
    const firstInFolder = reports.find((row) => folderKey(row.folder) === normalized) || null;
    setWidgetSetupFolder(normalized);
    setWidgetSetupSearch("");
    setWidgetSetupReportId((current) => {
      if (current && reports.some((row) => row.id === current && folderKey(row.folder) === normalized)) {
        return current;
      }
      return firstInFolder?.id || "";
    });
    setWidgetSetupErr(null);
  }

  async function loadWidgetSetupPreview(reportId: string) {
    if (!reportId) {
      setWidgetSetupRun(undefined);
      return;
    }

    stopWidgetSetupPreview();
    const ac = new AbortController();
    widgetSetupRunAbortRef.current = ac;
    setWidgetSetupRunLoading(true);

    try {
      const run = await runSavedReport(reportId, ac.signal);
      setWidgetSetupRun(run);
    } catch (e) {
      if (isAbortError(e)) return;
      setWidgetSetupRun(undefined);
      setWidgetSetupErr(extractErr(e, "Falha ao carregar a prévia do relatório"));
    } finally {
      if (widgetSetupRunAbortRef.current === ac) {
        widgetSetupRunAbortRef.current = null;
        setWidgetSetupRunLoading(false);
      }
    }
  }

  async function continueWidgetSetupToConfig(reportIdOverride?: string) {
    const selectedReportId = reportIdOverride || widgetSetupReportId;
    if (!selectedReportId) {
      setWidgetSetupErr("Selecione um relatório para continuar.");
      return;
    }
    if (!widgetSetupTitle.trim()) {
      const selectedName = reports.find((row) => row.id === selectedReportId)?.name;
      const baseTitle = widgetTypeTitle(widgetSetupType);
      setWidgetSetupTitle(selectedName ? `${baseTitle} • ${selectedName}` : baseTitle);
    }

    setWidgetSetupReportId(selectedReportId);
    setWidgetSetupErr(null);
    setWidgetSetupRangesError(null);
    setWidgetSetupStep("config");
    await loadWidgetSetupPreview(selectedReportId);
  }

  function validateGaugeRanges(gauge: DashboardGaugeConfig): string | null {
    const min = Number(gauge.min);
    const yellow = Number(gauge.yellow_from);
    const green = Number(gauge.green_from);
    const max = Number(gauge.max);

    if ([min, yellow, green, max].some((v) => !Number.isFinite(v))) {
      return "Preencha todos os ranges com valores numéricos válidos.";
    }
    if ([min, yellow, green, max].some((v) => v < 0)) {
      return "Os ranges não podem conter valores negativos.";
    }
    if (!(min < yellow && yellow < green && green < max)) {
      return "A sequência deve ser crescente: início < amarelo < verde < fim.";
    }
    return null;
  }

  function validateGaugeRangesOnBlur() {
    const msg = validateGaugeRanges(widgetSetupGauge);
    setWidgetSetupRangesError(msg);
  }

  function updateWidgetSetupGauge(patch: Partial<DashboardGaugeConfig>) {
    setWidgetSetupGauge((prev) => {
      const draft = {
        ...prev,
        ...patch,
      };
      return {
        min: Number.isFinite(draft.min) ? Number(draft.min) : 0,
        max: Number.isFinite(draft.max) ? Number(draft.max) : 0,
        yellow_from: Number.isFinite(draft.yellow_from) ? Number(draft.yellow_from) : 0,
        green_from: Number.isFinite(draft.green_from) ? Number(draft.green_from) : 0,
        measurement: draft.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT,
        show_percentages: draft.show_percentages === true,
        show_values: draft.show_values !== false,
        show_ranges: draft.show_ranges !== false,
      };
    });
  }

  function updateWidgetSetupKpi(patch: Partial<DashboardKpiConfig>) {
    setWidgetSetupKpi((prev) => {
      const draft = {
        ...prev,
        ...patch,
      };
      return {
        measurement: draft.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT,
      };
    });
  }

  function updateWidgetSetupGroupedBar(patch: Partial<DashboardGroupedBarConfig>) {
    setWidgetSetupGroupedBar((prev) => {
      const draft = {
        ...prev,
        ...patch,
      };
      const maxRowsRaw = Number(draft.max_rows);
      const maxRows = Number.isFinite(maxRowsRaw) ? Math.max(3, Math.min(200, Math.round(maxRowsRaw))) : 20;
      return {
        group_field_1: String(draft.group_field_1 || ""),
        group_field_2: String(draft.group_field_2 || ""),
        measurement: draft.measurement === "sum_values" ? "sum_values" : "record_count",
        sum_field: draft.measurement === "sum_values" ? (String(draft.sum_field || "").trim() || null) : null,
        max_rows: maxRows,
      };
    });
  }

  function updateWidgetSetupGroupedColumn(patch: Partial<DashboardGroupedColumnConfig>) {
    setWidgetSetupGroupedColumn((prev) => {
      const draft = {
        ...prev,
        ...patch,
      };
      const maxItemsRaw = Number(draft.max_items);
      const maxItems = Number.isFinite(maxItemsRaw) ? Math.max(3, Math.min(200, Math.round(maxItemsRaw))) : 20;
      return {
        x_field: String(draft.x_field || ""),
        series_field: String(draft.series_field || ""),
        measurement: draft.measurement === "sum_values" ? "sum_values" : "record_count",
        sum_field: draft.measurement === "sum_values" ? (String(draft.sum_field || "").trim() || null) : null,
        max_items: maxItems,
      };
    });
  }

  function updateWidgetSetupGroupedDonut(patch: Partial<DashboardGroupedDonutConfig>) {
    setWidgetSetupGroupedDonut((prev) => {
      const draft = {
        ...prev,
        ...patch,
      };
      const maxItemsRaw = Number(draft.max_items);
      const maxItems = Number.isFinite(maxItemsRaw) ? Math.max(3, Math.min(200, Math.round(maxItemsRaw))) : 8;
      return {
        category_field: String(draft.category_field || ""),
        measurement: draft.measurement === "sum_values" ? "sum_values" : "record_count",
        sum_field: draft.measurement === "sum_values" ? (String(draft.sum_field || "").trim() || null) : null,
        max_items: maxItems,
      };
    });
  }

  function validateGroupedBarSetup(config: DashboardGroupedBarConfig, run: ReportRunOut | undefined): string | null {
    const resolved = resolveGroupedBarConfig(run, config);
    if (!resolved.group_field_1 || !resolved.group_field_2) {
      return "Selecione os dois campos de agrupamento do eixo Y.";
    }
    if (resolved.group_field_1 === resolved.group_field_2) {
      return "Use campos diferentes para Grupo 1 e Grupo 2.";
    }
    if (resolved.measurement === "sum_values" && !resolved.sum_field) {
      return "Selecione um campo numérico para Soma dos Valores.";
    }
    return null;
  }

  function validateGroupedColumnSetup(config: DashboardGroupedColumnConfig, run: ReportRunOut | undefined): string | null {
    const resolved = resolveGroupedColumnConfig(run, config);
    if (!resolved.x_field) {
      return "Selecione o campo do eixo X.";
    }
    if (resolved.measurement === "sum_values" && !resolved.sum_field) {
      return "Selecione um campo numérico para Soma dos Valores.";
    }
    return null;
  }

  function validateGroupedDonutSetup(config: DashboardGroupedDonutConfig, run: ReportRunOut | undefined): string | null {
    const resolved = resolveGroupedDonutConfig(run, config);
    if (!resolved.category_field) {
      return "Selecione o campo de categoria do donut.";
    }
    if (resolved.measurement === "sum_values" && !resolved.sum_field) {
      return "Selecione um campo numérico para Soma dos Valores.";
    }
    return null;
  }

  function addWidgetFromSetup() {
    const selectedReportId = widgetSetupReportId || "";
    if (!selectedReportId) {
      setWidgetSetupErr("Selecione um relatório para o widget.");
      return;
    }
    if (!widgetSetupTitle.trim()) {
      setWidgetSetupErr("Informe o título do widget.");
      return;
    }
    const normalizedType: DashboardWidgetType =
      widgetSetupType === "kpi"
        ? "kpi"
        : widgetSetupType === "grouped_bar"
          ? "grouped_bar"
          : widgetSetupType === "grouped_column"
            ? "grouped_column"
            : widgetSetupType === "grouped_donut"
              ? "grouped_donut"
              : widgetSetupType === "grouped_funnel"
                ? "grouped_funnel"
            : "gauge";
    if (normalizedType === "gauge") {
      const rangeMsg = validateGaugeRanges(widgetSetupGauge);
      if (rangeMsg) {
        setWidgetSetupRangesError(rangeMsg);
        setWidgetSetupErr(rangeMsg);
        return;
      }
      setWidgetSetupRangesError(null);
    } else if (normalizedType === "grouped_bar") {
      const groupedMsg = validateGroupedBarSetup(widgetSetupGroupedBar, widgetSetupRun);
      if (groupedMsg) {
        setWidgetSetupErr(groupedMsg);
        return;
      }
      setWidgetSetupRangesError(null);
    } else if (normalizedType === "grouped_column") {
      const groupedColumnMsg = validateGroupedColumnSetup(widgetSetupGroupedColumn, widgetSetupRun);
      if (groupedColumnMsg) {
        setWidgetSetupErr(groupedColumnMsg);
        return;
      }
      setWidgetSetupRangesError(null);
    } else if (normalizedType === "grouped_donut" || normalizedType === "grouped_funnel") {
      const groupedDonutMsg = validateGroupedDonutSetup(widgetSetupGroupedDonut, widgetSetupRun);
      if (groupedDonutMsg) {
        setWidgetSetupErr(groupedDonutMsg);
        return;
      }
      setWidgetSetupRangesError(null);
    } else {
      setWidgetSetupRangesError(null);
    }

    const widgetW = 440;
    const widgetH = 310;
    const idx = widgets.length;
    const suggestedX = 24 + (idx % 2) * 468;
    const suggestedY = 22 + Math.floor(idx / 2) * 340;
    const maxX = Math.max(0, workspaceSize.width - widgetW - 8);
    const maxY = Math.max(0, workspaceSize.height - widgetH - 8);
    const baseGauge = widgetGaugeConfig({
      id: "tmp",
      title: "tmp",
      type: "gauge",
      report_id: selectedReportId,
      gauge: widgetSetupGauge,
    });
    const baseKpi = widgetKpiConfig({
      id: "tmp",
      title: "tmp",
      type: "kpi",
      report_id: selectedReportId,
      kpi: widgetSetupKpi,
    });
    const baseGroupedBar = resolveGroupedBarConfig(
      widgetSetupRun,
      widgetGroupedBarConfig({
        id: "tmp",
        title: "tmp",
        type: "grouped_bar",
        report_id: selectedReportId,
        grouped_bar: widgetSetupGroupedBar,
      }),
    );
    const baseGroupedColumn = resolveGroupedColumnConfig(
      widgetSetupRun,
      widgetGroupedColumnConfig({
        id: "tmp",
        title: "tmp",
        type: "grouped_column",
        report_id: selectedReportId,
        grouped_column: widgetSetupGroupedColumn,
      }),
    );
    const baseGroupedDonut = resolveGroupedDonutConfig(
      widgetSetupRun,
      widgetGroupedDonutConfig({
        id: "tmp",
        title: "tmp",
        type: "grouped_donut",
        report_id: selectedReportId,
        grouped_donut: widgetSetupGroupedDonut,
      }),
    );

    if (widgetSetupEditingId) {
      setWidgets((prev) =>
        prev.map((row) =>
          row.id === widgetSetupEditingId
            ? {
                ...row,
                title: widgetSetupTitle.trim(),
                type: normalizedType,
                report_id: selectedReportId,
                gauge: normalizedType === "gauge" ? baseGauge : null,
                kpi: normalizedType === "kpi" ? baseKpi : null,
                grouped_bar: normalizedType === "grouped_bar" ? baseGroupedBar : null,
                grouped_column: normalizedType === "grouped_column" ? baseGroupedColumn : null,
                grouped_donut: normalizedType === "grouped_donut" || normalizedType === "grouped_funnel" ? baseGroupedDonut : null,
              }
            : row,
        ),
      );
    } else {
      setWidgets((prev) => [
        ...prev,
        {
          id: newWidgetId(),
          title: widgetSetupTitle.trim(),
          type: normalizedType,
          report_id: selectedReportId,
          x: clamp(suggestedX, 0, maxX || suggestedX),
          y: clamp(suggestedY, 0, maxY || suggestedY),
          w: widgetW,
          h: widgetH,
          gauge: normalizedType === "gauge" ? baseGauge : null,
          kpi: normalizedType === "kpi" ? baseKpi : null,
          grouped_bar: normalizedType === "grouped_bar" ? baseGroupedBar : null,
          grouped_column: normalizedType === "grouped_column" ? baseGroupedColumn : null,
          grouped_donut: normalizedType === "grouped_donut" || normalizedType === "grouped_funnel" ? baseGroupedDonut : null,
        },
      ]);
    }
    closeWidgetSetupModal();
    setErr(null);
  }

  function onWorkspaceDragEnd(event: DragEndEvent) {
    if (builderMode !== "edit") return;
    const id = String(event.active?.id || "");
    if (!id) return;
    const deltaX = Number(event.delta?.x || 0);
    const deltaY = Number(event.delta?.y || 0);
    if (!deltaX && !deltaY) return;

    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const ww = Math.max(220, Number(w.w || 360));
        const wh = Math.max(160, Number(w.h || 240));
        const maxX = Math.max(0, workspaceSize.width - ww - 8);
        const maxY = Math.max(0, workspaceSize.height - wh - 8);
        const nextX = clamp(Math.round(Number(w.x || 0) + deltaX), 0, maxX);
        const nextY = clamp(Math.round(Number(w.y || 0) + deltaY), 0, maxY);
        return { ...w, x: nextX, y: nextY };
      }),
    );
  }

  useEffect(() => {
    if (viewMode !== "builder" || builderMode !== "edit") return;
    const node = workspaceRef.current;
    if (!node) return;

    const applySize = () => setWorkspaceSize({ width: node.clientWidth, height: node.clientHeight });
    applySize();

    const ro = new ResizeObserver(() => applySize());
    ro.observe(node);
    return () => ro.disconnect();
  }, [viewMode, builderMode]);

  useEffect(() => {
    const ac = new AbortController();
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const [dbRows, allReports, accountReports, contactReports, leadReports, oppReports] = await Promise.all([
          listDashboards(undefined, ac.signal),
          listReports(undefined, ac.signal),
          listReports("account", ac.signal),
          listReports("contact", ac.signal),
          listReports("lead", ac.signal),
          listReports("opportunity", ac.signal),
        ]);
        setDashboards(Array.isArray(dbRows) ? dbRows : []);

        const dedup = new Map<string, ReportDefinitionOut>();
        for (const list of [allReports, accountReports, contactReports, leadReports, oppReports]) {
          for (const r of list || []) dedup.set(r.id, r);
        }
        setReports(Array.from(dedup.values()));
        setActiveFolder("private");
        resetDraft("private");
      } catch (e) {
        if (isAbortError(e)) return;
        setErr(extractErr(e, "Falha ao carregar dashboards"));
      } finally {
        setLoading(false);
      }
    }
    void run();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (viewMode !== "builder") return;

    const ac = new AbortController();
    async function run() {
      if (!distinctReportIds.length) {
        setRunsByReportId({});
        return;
      }
      setRefreshingWidgets(true);
      try {
        const entries = await Promise.all(
          distinctReportIds.map(async (reportId) => {
            try {
              const result = await runSavedReport(reportId, ac.signal);
              return [reportId, result] as const;
            } catch {
              return [reportId, undefined] as const;
            }
          }),
        );
        const next: WidgetResultMap = {};
        for (const [rid, run] of entries) next[rid] = run;
        setRunsByReportId(next);
      } finally {
        setRefreshingWidgets(false);
      }
    }
    void run();
    return () => ac.abort();
  }, [viewMode, distinctReportIds]);

  useEffect(() => {
    return () => {
      stopWidgetSetupPreview();
    };
  }, []);

  function onDragEnd(event: DragEndEvent) {
    if (builderMode !== "edit") return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setWidgets((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  function updateWidget(widgetId: string, patch: Partial<DraftWidget>) {
    setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)));
  }

  function removeWidget(widgetId: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
  }

  async function saveDashboard() {
    if (!name.trim()) {
      setErr("Informe o nome do dashboard.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        folder: dashboardFolder,
        description: description.trim(),
        layout: {
          columns,
          widgets,
        },
      };

      if (activeDashboardId) {
        const updated = await patchDashboard(activeDashboardId, payload);
        await reloadDashboards();
        loadDashboardDraft(updated);
      } else {
        const created = await createDashboard(payload);
        await reloadDashboards();
        loadDashboardDraft(created);
      }
    } catch (e) {
      setErr(extractErr(e, "Falha ao salvar dashboard"));
    } finally {
      setSaving(false);
    }
  }

  async function removeDashboard() {
    if (!activeDashboardId) return;
    if (!window.confirm("Excluir este dashboard?")) return;

    setSaving(true);
    setErr(null);
    try {
      await deleteDashboard(activeDashboardId);
      await reloadDashboards();
      resetDraft(activeFolder);
      setViewMode("browser");
    } catch (e) {
      setErr(extractErr(e, "Falha ao excluir dashboard"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {viewMode === "browser" ? (
        <section className="panel overflow-hidden border border-[rgb(var(--border))]">
          <div className="flex flex-col gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Dashboards</div>
              <h1 className="text-2xl font-semibold">Biblioteca de Dashboards</h1>
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">Navegue por pastas e abra um dashboard salvo para editar.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-success !rounded-none" onClick={openDashboardMetaModal} disabled={loading || saving}>
                Novo dashboard
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
                  <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Apenas seus dashboards • {folderCounts.private}</div>
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
                {activeFolder === "public" ? "Dashboards da Pasta Pública" : "Dashboards da Pasta Privada"}
              </div>

              <div className="max-h-[72vh] space-y-1 overflow-auto p-2">
                {visibleDashboards.map((d) => (
                  <button
                    key={`browser_${d.id}`}
                    onClick={() => openBuilderForSavedDashboard(d)}
                    className="w-full border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-2 py-2 text-left text-xs hover:brightness-105"
                  >
                    <div className="font-semibold">{d.name}</div>
                    <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">
                      {d.owner_name || "Sem owner"} • {d.updated_at ? new Date(d.updated_at).toLocaleString("pt-BR") : "—"}
                    </div>
                  </button>
                ))}
                {!visibleDashboards.length ? (
                  <div className="px-2 py-2 text-xs text-[rgb(var(--muted))]">
                    {activeFolder === "public" ? "Nenhum dashboard na pasta pública." : "Nenhum dashboard na sua pasta privada."}
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
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Dashboards</div>
                <h1 className="truncate text-[30px] font-semibold leading-8">{name || "Dashboard"}</h1>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]">
                  {dashboardFolder === "public" ? "Pasta pública" : "Pasta privada"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={goBackToBrowser} disabled={saving}>
                  Fechar
                </button>
                <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={openBuilderForNewDashboard} disabled={saving}>
                  Novo
                </button>
                {activeDashboardId && builderMode === "view" ? (
                  <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={startDashboardEditing} disabled={saving}>
                    Editar
                  </button>
                ) : null}
                {activeDashboardId && builderMode === "edit" ? (
                  <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={cancelDashboardEditing} disabled={saving}>
                    Cancelar edição
                  </button>
                ) : null}
                {activeDashboardId && builderMode === "edit" ? (
                  <button className="btn btn-secondary h-9 !rounded-none px-3 text-sm" onClick={() => void removeDashboard()} disabled={saving}>
                    Excluir
                  </button>
                ) : null}
                {builderMode === "edit" ? (
                  <button className="btn btn-success h-9 !rounded-none px-4 text-sm" onClick={() => void saveDashboard()} disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                ) : null}
              </div>
            </div>

            {err ? <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

            {builderMode === "edit" ? (
              <section className="min-h-0 flex-1 border-t border-[rgb(var(--border))]">
                <div className="flex items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Area de trabalho</div>
                  <button className="btn btn-secondary h-8 !rounded-none px-3 text-xs" onClick={openWidgetSetupModal}>
                    Novo Widget
                  </button>
                </div>

                <div
                  ref={workspaceRef}
                  className="relative h-full min-h-[520px] overflow-hidden bg-[rgb(var(--panel-2))]"
                  style={{
                    backgroundImage: "radial-gradient(rgba(148,163,184,0.45) 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-white/10" />

                  {widgets.length ? (
                    <DndContext onDragEnd={onWorkspaceDragEnd}>
                      {widgets.map((widget) => (
                        <WorkspaceGaugeWidget
                          key={`workspace_${widget.id}`}
                          widget={widget}
                          run={runsByReportId[widget.report_id]}
                          reports={reports}
                          editable
                          busy={saving || refreshingWidgets}
                          onChange={updateWidget}
                          onEdit={openWidgetSetupEditModal}
                          onRemove={removeWidget}
                        />
                      ))}
                    </DndContext>
                  ) : (
                    <div className="relative z-[1] flex h-full flex-col items-center justify-center px-6 text-center">
                      <div className="text-sm font-semibold text-[rgb(var(--text))]">Area de trabalho do dashboard</div>
                      <div className="mt-1 max-w-xl text-xs text-[rgb(var(--muted))]">
                        Clique em Novo Widget para adicionar o primeiro widget e comecar a organizar o layout.
                      </div>
                      <div className="mt-3 text-[11px] text-[rgb(var(--muted))]">
                        Widgets cadastrados: <span className="font-semibold text-[rgb(var(--text))]">{widgets.length}</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 border-t border-[rgb(var(--border))] p-4 xl:grid-cols-[260px_minmax(0,1fr)]">
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
                    <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Apenas seus dashboards • {folderCounts.private}</div>
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

                <div className="sf-band bg-[#d1e1f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  {activeFolder === "public" ? "Dashboards Públicos" : "Dashboards Privados"}
                </div>
                <div className="max-h-[60vh] space-y-1 overflow-auto p-2">
                  {visibleDashboards.map((d) => (
                    <button
                      key={`builder_${d.id}`}
                      onClick={() => {
                        loadDashboardDraft(d);
                        setBuilderMode("view");
                      }}
                      className={[
                        "w-full border px-2 py-2 text-left text-xs",
                        activeDashboardId === d.id
                          ? "border-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)]"
                          : "border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] hover:brightness-105",
                      ].join(" ")}
                    >
                      <div className="font-semibold">{d.name}</div>
                      <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">
                        {d.updated_at ? new Date(d.updated_at).toLocaleString("pt-BR") : "—"}
                      </div>
                    </button>
                  ))}
                  {!visibleDashboards.length ? <div className="px-2 py-2 text-xs text-[rgb(var(--muted))]">Nenhum dashboard nesta pasta.</div> : null}
                </div>
              </aside>

              <section className="flex min-h-0 flex-col overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
                <div className="flex flex-col gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-2 md:flex-row md:items-center">
                  <input
                    className="input h-9 flex-1 rounded-md px-2 py-1 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do dashboard"
                    disabled
                  />
                  <select
                    className="input h-9 w-[140px] rounded-md px-2 py-1 text-sm"
                    value={dashboardFolder}
                    onChange={(e) => setDashboardFolder(e.target.value as DashboardFolderKey)}
                    disabled
                  >
                    <option value="private">Pasta Privada</option>
                    <option value="public">Pasta Pública</option>
                  </select>
                  <input
                    className="input h-9 w-[92px] rounded-md px-2 py-1 text-sm"
                    type="number"
                    min={1}
                    max={4}
                    value={columns}
                    onChange={(e) => setColumns(Math.max(1, Math.min(4, Number(e.target.value || 2))))}
                    title="Colunas do painel"
                    disabled
                  />
                </div>

                <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-2">
                  <textarea
                    className="input min-h-[54px] w-full rounded-md"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descrição (opcional)"
                    disabled
                  />
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-3">
                  {widgets.length ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                        <div className={`grid gap-3 ${boardGridClass(columns)}`}>
                          {widgets.map((widget) => (
                            <SortableWidgetCard
                              key={widget.id}
                              widget={widget}
                              reports={reports}
                              run={runsByReportId[widget.report_id]}
                              editable={false}
                              busy={saving || refreshingWidgets}
                              onChange={updateWidget}
                              onRemove={removeWidget}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-3 py-5 text-sm text-[rgb(var(--muted))]">
                      Adicione widgets para começar.
                    </div>
                  )}
                </div>
              </section>

            </div>
            )}
          </section>
        </div>
      )}

      {widgetSetupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={closeWidgetSetupModal}
            aria-label="Fechar modal de configuração de widget"
          />

          <section className="relative z-[1] flex h-[min(92vh,860px)] w-[min(1180px,98vw)] min-h-[640px] flex-col overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-xl">
            <header className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Dashboards</div>
                <h2 className="truncate text-lg font-semibold">{widgetSetupEditingId ? "Editar Widget" : "Novo Widget"}</h2>
                <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                  {widgetSetupStep === "report" ? "Etapa 1 de 2 • Selecione o relatório" : "Etapa 2 de 2 • Configure o widget"}
                </div>
              </div>
              <button className="btn btn-secondary !rounded-none" onClick={closeWidgetSetupModal} disabled={saving || widgetSetupRunLoading}>
                Fechar
              </button>
            </header>

            {widgetSetupErr ? (
              <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{widgetSetupErr}</div>
            ) : null}

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
              {widgetSetupStep === "report" ? (
                <>
                  <aside className="min-h-0 border-r border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
                    <div className="sf-band bg-[#d1e1f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Pastas de relatórios</div>
                    <div className="space-y-1 p-2">
                      <button
                        className={[
                          "w-full border px-2 py-2 text-left text-xs",
                          widgetSetupFolder === "private"
                            ? "border-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)]"
                            : "border-[rgb(var(--border))] bg-[rgb(var(--panel))] hover:brightness-105",
                        ].join(" ")}
                        onClick={() => changeWidgetSetupFolder("private")}
                      >
                        <div className="font-semibold">Pasta Privada</div>
                        <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Meus relatórios • {reportFolderCounts.private}</div>
                      </button>
                      <button
                        className={[
                          "w-full border px-2 py-2 text-left text-xs",
                          widgetSetupFolder === "public"
                            ? "border-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)]"
                            : "border-[rgb(var(--border))] bg-[rgb(var(--panel))] hover:brightness-105",
                        ].join(" ")}
                        onClick={() => changeWidgetSetupFolder("public")}
                      >
                        <div className="font-semibold">Pasta Pública</div>
                        <div className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Compartilhados na BU • {reportFolderCounts.public}</div>
                      </button>
                    </div>
                  </aside>

                  <section className="min-h-0 overflow-hidden">
                    <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
                      <input
                        className="input h-9 w-full rounded-md px-2 py-1 text-sm"
                        value={widgetSetupSearch}
                        onChange={(e) => setWidgetSetupSearch(e.target.value)}
                        placeholder="Buscar relatório..."
                        autoFocus
                      />
                    </div>
                    <div className="max-h-full min-h-0 space-y-1 overflow-auto p-2">
                      {widgetSetupVisibleReports.length ? (
                        widgetSetupVisibleReports.map((row) => (
                          <button
                            key={`widget_setup_report_${row.id}`}
                            className={[
                              "w-full border px-3 py-2 text-left",
                              row.id === widgetSetupReportId
                                ? "border-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)]"
                                : "border-[rgb(var(--border))] bg-[rgb(var(--panel))] hover:brightness-105",
                            ].join(" ")}
                            onClick={() => void continueWidgetSetupToConfig(row.id)}
                          >
                            <div className="text-sm font-semibold">{row.name}</div>
                            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]">
                              {row.report_type} • {folderKey(row.folder) === "public" ? "Público" : "Privado"}
                            </div>
                            {row.description ? <div className="mt-1 line-clamp-2 text-xs text-[rgb(var(--muted))]">{row.description}</div> : null}
                          </button>
                        ))
                      ) : (
                        <div className="px-2 py-3 text-sm text-[rgb(var(--muted))]">Nenhum relatório encontrado nesta pasta.</div>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <aside className="h-full min-h-0 overflow-y-auto overflow-x-hidden border-r border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
                    <div className="space-y-3">
                      <div className="border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Relatório selecionado</div>
                        <div className="mt-1 text-sm font-semibold">{widgetSetupSelectedReport?.name || "—"}</div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]">
                          {widgetSetupSelectedReport?.report_type || "—"} • {widgetSetupFolder === "public" ? "Pasta Pública" : "Pasta Privada"}
                        </div>
                        <button className="btn btn-secondary mt-2 h-7 !rounded-none px-2 text-xs" onClick={() => setWidgetSetupStep("report")}>
                          Trocar relatório
                        </button>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Tipo de widget</div>
                        <select
                          className="input h-9 rounded-md px-2 py-1 text-sm"
                          value={widgetSetupType}
                          onChange={(e) => {
                            const nextType: DashboardWidgetType =
                              e.target.value === "kpi"
                                ? "kpi"
                                : e.target.value === "grouped_bar"
                                  ? "grouped_bar"
                                  : e.target.value === "grouped_column"
                                    ? "grouped_column"
                                    : e.target.value === "grouped_donut"
                                      ? "grouped_donut"
                                      : e.target.value === "grouped_funnel"
                                        ? "grouped_funnel"
                                    : "gauge";
                            setWidgetSetupType(nextType);
                            setWidgetSetupRangesError(null);
                            setWidgetSetupTitle((prev) => {
                              const trimmed = prev.trim();
                              const isDefaultTitle =
                                trimmed === "Gauge" ||
                                trimmed === "KPI" ||
                                trimmed === "Barras agrupadas" ||
                                trimmed === "Colunas agrupadas" ||
                                trimmed === "Donut agrupado" ||
                                trimmed === "Funil agrupado" ||
                                trimmed.startsWith("Gauge • ") ||
                                trimmed.startsWith("KPI • ") ||
                                trimmed.startsWith("Barras agrupadas • ") ||
                                trimmed.startsWith("Colunas agrupadas • ") ||
                                trimmed.startsWith("Donut agrupado • ") ||
                                trimmed.startsWith("Funil agrupado • ");
                              if (trimmed && !isDefaultTitle) {
                                return prev;
                              }
                              const baseTitle = widgetTypeTitle(nextType);
                              return widgetSetupSelectedReport?.name ? `${baseTitle} • ${widgetSetupSelectedReport.name}` : baseTitle;
                            });
                          }}
                        >
                          <option value="kpi">KPI</option>
                          <option value="grouped_bar">Barras agrupadas</option>
                          <option value="grouped_column">Colunas agrupadas</option>
                          <option value="grouped_donut">Donut agrupado</option>
                          <option value="grouped_funnel">Funil agrupado</option>
                          <option value="gauge">Gauge</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Título do widget</div>
                        <input
                          className="input h-9 rounded-md px-2 py-1 text-sm"
                          value={widgetSetupTitle}
                          onChange={(e) => setWidgetSetupTitle(e.target.value)}
                          placeholder="Título do widget"
                        />
                      </div>

                      {widgetSetupType === "gauge" ? (
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-[rgb(var(--text))]">Segment Ranges</div>
                          <div className="grid grid-cols-[minmax(0,1fr)_18px_28px] grid-rows-[repeat(4,36px)] items-center gap-x-2 gap-y-2">
                            <input
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              type="number"
                              value={widgetSetupGauge.min}
                              onChange={(e) => updateWidgetSetupGauge({ min: Number(e.target.value || 0) })}
                              onBlur={validateGaugeRangesOnBlur}
                              title="Início"
                            />
                            <div className="row-start-1 col-start-2 text-center text-xs text-[rgb(var(--muted))]">▶</div>

                            <input
                              className="input row-start-2 col-start-1 h-9 rounded-md px-2 py-1 text-sm"
                              type="number"
                              value={widgetSetupGauge.yellow_from}
                              onChange={(e) => updateWidgetSetupGauge({ yellow_from: Number(e.target.value || 0) })}
                              onBlur={validateGaugeRangesOnBlur}
                              title="Limite vermelho"
                            />
                            <div className="row-start-2 col-start-2 text-center text-xs text-[rgb(var(--muted))]">▶</div>

                            <input
                              className="input row-start-3 col-start-1 h-9 rounded-md px-2 py-1 text-sm"
                              type="number"
                              value={widgetSetupGauge.green_from}
                              onChange={(e) => updateWidgetSetupGauge({ green_from: Number(e.target.value || 0) })}
                              onBlur={validateGaugeRangesOnBlur}
                              title="Limite amarelo"
                            />
                            <div className="row-start-3 col-start-2 text-center text-xs text-[rgb(var(--muted))]">▶</div>

                            <input
                              className="input row-start-4 col-start-1 h-9 rounded-md px-2 py-1 text-sm"
                              type="number"
                              value={widgetSetupGauge.max}
                              onChange={(e) => updateWidgetSetupGauge({ max: Number(e.target.value || 0) })}
                              onBlur={validateGaugeRangesOnBlur}
                              title="Fim"
                            />
                            <div className="row-start-4 col-start-2 text-center text-xs text-[rgb(var(--muted))]">▶</div>

                            <div className="col-start-3 row-start-1 row-end-3 flex items-center justify-center">
                              <div className="h-12 w-7 border border-red-800 bg-red-700/80" />
                            </div>
                            <div className="col-start-3 row-start-2 row-end-4 flex items-center justify-center">
                              <div className="h-12 w-7 border border-amber-700 bg-amber-500/85" />
                            </div>
                            <div className="col-start-3 row-start-3 row-end-5 flex items-center justify-center">
                              <div className="h-12 w-7 border border-teal-800 bg-teal-700/85" />
                            </div>
                          </div>
                          {widgetSetupRangesError ? <div className="text-xs text-red-700">{widgetSetupRangesError}</div> : null}
                        </div>
                      ) : null}

                      {widgetSetupType === "grouped_donut" || widgetSetupType === "grouped_funnel" ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[rgb(var(--text))]">Categoria</div>
                            <div className="text-[11px] text-[rgb(var(--muted))]">
                              Campo que define as categorias do {widgetSetupType === "grouped_funnel" ? "funil" : "donut"}.
                            </div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedDonut.category_field || ""}
                              onChange={(e) => updateWidgetSetupGroupedDonut({ category_field: e.target.value })}
                            >
                              <option value="">Selecione campo de categoria</option>
                              {widgetSetupGroupedDonut.category_field && !widgetSetupColumns.includes(widgetSetupGroupedDonut.category_field) ? (
                                <option value={widgetSetupGroupedDonut.category_field}>{widgetSetupGroupedDonut.category_field}</option>
                              ) : null}
                              {widgetSetupColumns.map((col) => (
                                <option key={`donut_cat_${col}`} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[rgb(var(--text))]">Mensuração</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedDonut.measurement === "sum_values" ? "sum_values" : "record_count"}
                              onChange={(e) =>
                                updateWidgetSetupGroupedDonut({
                                  measurement: e.target.value === "sum_values" ? "sum_values" : "record_count",
                                })
                              }
                            >
                              <option value="record_count">Contagem de Registros</option>
                              <option value="sum_values">Soma dos Valores</option>
                            </select>
                          </div>

                          {widgetSetupGroupedDonut.measurement === "sum_values" ? (
                            <div className="space-y-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Campo para soma</div>
                              <select
                                className="input h-9 rounded-md px-2 py-1 text-sm"
                                value={widgetSetupGroupedDonut.sum_field || ""}
                                onChange={(e) => updateWidgetSetupGroupedDonut({ sum_field: e.target.value || null })}
                              >
                                <option value="">Selecione campo numérico</option>
                                {widgetSetupGroupedDonut.sum_field && !widgetSetupNumericColumns.includes(widgetSetupGroupedDonut.sum_field) ? (
                                  <option value={widgetSetupGroupedDonut.sum_field}>{widgetSetupGroupedDonut.sum_field}</option>
                                ) : null}
                                {widgetSetupNumericColumns.map((col) => (
                                  <option key={`donut_sum_${col}`} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Máximo de fatias</div>
                            <input
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              type="number"
                              min={3}
                              max={200}
                              value={Number(widgetSetupGroupedDonut.max_items || 8)}
                              onChange={(e) => updateWidgetSetupGroupedDonut({ max_items: Number(e.target.value || 8) })}
                            />
                          </div>
                        </div>
                      ) : widgetSetupType === "grouped_column" ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[rgb(var(--text))]">Eixo X</div>
                            <div className="text-[11px] text-[rgb(var(--muted))]">Selecione o campo que será usado como categoria.</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedColumn.x_field || ""}
                              onChange={(e) => updateWidgetSetupGroupedColumn({ x_field: e.target.value })}
                            >
                              <option value="">Selecione campo do eixo X</option>
                              {widgetSetupGroupedColumn.x_field && !widgetSetupColumns.includes(widgetSetupGroupedColumn.x_field) ? (
                                <option value={widgetSetupGroupedColumn.x_field}>{widgetSetupGroupedColumn.x_field}</option>
                              ) : null}
                              {widgetSetupColumns.map((col) => (
                                <option key={`x_axis_${col}`} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Legenda (série)</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedColumn.series_field || ""}
                              onChange={(e) => updateWidgetSetupGroupedColumn({ series_field: e.target.value })}
                            >
                              <option value="">Sem divisão de série</option>
                              {widgetSetupGroupedColumn.series_field && !widgetSetupColumns.includes(widgetSetupGroupedColumn.series_field) ? (
                                <option value={widgetSetupGroupedColumn.series_field}>{widgetSetupGroupedColumn.series_field}</option>
                              ) : null}
                              {widgetSetupColumns
                                .filter((col) => col !== (widgetSetupGroupedColumn.x_field || ""))
                                .map((col) => (
                                  <option key={`series_${col}`} value={col}>
                                    {col}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[rgb(var(--text))]">Mensuração</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedColumn.measurement === "sum_values" ? "sum_values" : "record_count"}
                              onChange={(e) =>
                                updateWidgetSetupGroupedColumn({
                                  measurement: e.target.value === "sum_values" ? "sum_values" : "record_count",
                                })
                              }
                            >
                              <option value="record_count">Contagem de Registros</option>
                              <option value="sum_values">Soma dos Valores</option>
                            </select>
                          </div>

                          {widgetSetupGroupedColumn.measurement === "sum_values" ? (
                            <div className="space-y-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Campo para soma</div>
                              <select
                                className="input h-9 rounded-md px-2 py-1 text-sm"
                                value={widgetSetupGroupedColumn.sum_field || ""}
                                onChange={(e) => updateWidgetSetupGroupedColumn({ sum_field: e.target.value || null })}
                              >
                                <option value="">Selecione campo numérico</option>
                                {widgetSetupGroupedColumn.sum_field && !widgetSetupNumericColumns.includes(widgetSetupGroupedColumn.sum_field) ? (
                                  <option value={widgetSetupGroupedColumn.sum_field}>{widgetSetupGroupedColumn.sum_field}</option>
                                ) : null}
                                {widgetSetupNumericColumns.map((col) => (
                                  <option key={`sum_col_${col}`} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Máximo de categorias</div>
                            <input
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              type="number"
                              min={3}
                              max={200}
                              value={Number(widgetSetupGroupedColumn.max_items || 20)}
                              onChange={(e) => updateWidgetSetupGroupedColumn({ max_items: Number(e.target.value || 20) })}
                            />
                          </div>
                        </div>
                      ) : widgetSetupType === "grouped_bar" ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[rgb(var(--text))]">Agrupamento no eixo Y</div>
                            <div className="text-[11px] text-[rgb(var(--muted))]">Selecione dois campos para formar as linhas do gráfico.</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedBar.group_field_1 || ""}
                              onChange={(e) => updateWidgetSetupGroupedBar({ group_field_1: e.target.value })}
                            >
                              <option value="">Selecione Grupo 1</option>
                              {widgetSetupGroupedBar.group_field_1 && !widgetSetupColumns.includes(widgetSetupGroupedBar.group_field_1) ? (
                                <option value={widgetSetupGroupedBar.group_field_1}>{widgetSetupGroupedBar.group_field_1}</option>
                              ) : null}
                              {widgetSetupColumns.map((col) => (
                                <option key={`group1_${col}`} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Grupo 2</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedBar.group_field_2 || ""}
                              onChange={(e) => updateWidgetSetupGroupedBar({ group_field_2: e.target.value })}
                            >
                              <option value="">Selecione Grupo 2</option>
                              {widgetSetupGroupedBar.group_field_2 && !widgetSetupColumns.includes(widgetSetupGroupedBar.group_field_2) ? (
                                <option value={widgetSetupGroupedBar.group_field_2}>{widgetSetupGroupedBar.group_field_2}</option>
                              ) : null}
                              {widgetSetupColumns.map((col) => (
                                <option key={`group2_${col}`} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[rgb(var(--text))]">Mensuração</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={widgetSetupGroupedBar.measurement === "sum_values" ? "sum_values" : "record_count"}
                              onChange={(e) =>
                                updateWidgetSetupGroupedBar({
                                  measurement: e.target.value === "sum_values" ? "sum_values" : "record_count",
                                })
                              }
                            >
                              <option value="record_count">Contagem de Registros</option>
                              <option value="sum_values">Soma dos Valores</option>
                            </select>
                          </div>

                          {widgetSetupGroupedBar.measurement === "sum_values" ? (
                            <div className="space-y-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Campo para soma</div>
                              <select
                                className="input h-9 rounded-md px-2 py-1 text-sm"
                                value={widgetSetupGroupedBar.sum_field || ""}
                                onChange={(e) => updateWidgetSetupGroupedBar({ sum_field: e.target.value || null })}
                              >
                                <option value="">Selecione campo numérico</option>
                                {widgetSetupGroupedBar.sum_field && !widgetSetupNumericColumns.includes(widgetSetupGroupedBar.sum_field) ? (
                                  <option value={widgetSetupGroupedBar.sum_field}>{widgetSetupGroupedBar.sum_field}</option>
                                ) : null}
                                {widgetSetupNumericColumns.map((col) => (
                                  <option key={`sum_${col}`} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Máximo de linhas</div>
                            <input
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              type="number"
                              min={3}
                              max={200}
                              value={Number(widgetSetupGroupedBar.max_rows || 20)}
                              onChange={(e) => updateWidgetSetupGroupedBar({ max_rows: Number(e.target.value || 20) })}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[rgb(var(--text))]">Mensuração</div>
                            <select
                              className="input h-9 rounded-md px-2 py-1 text-sm"
                              value={
                                (widgetSetupType === "kpi" ? widgetSetupKpi.measurement : widgetSetupGauge.measurement) === "record_count"
                                  ? "record_count"
                                  : DEFAULT_GAUGE_MEASUREMENT
                              }
                              onChange={(e) => {
                                const nextMeasurement = e.target.value === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT;
                                if (widgetSetupType === "kpi") {
                                  updateWidgetSetupKpi({ measurement: nextMeasurement });
                                } else {
                                  updateWidgetSetupGauge({ measurement: nextMeasurement });
                                }
                              }}
                            >
                              <option value="sum_values">Soma dos Valores</option>
                              <option value="record_count">Contagem de Registros</option>
                            </select>
                          </div>

                          {widgetSetupType === "gauge" ? (
                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-[rgb(var(--text))]">Unidades de Exibição</div>
                              <label className="flex items-center gap-2 text-sm text-[rgb(var(--text))]">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={widgetSetupGauge.show_percentages === true}
                                  onChange={(e) => updateWidgetSetupGauge({ show_percentages: e.target.checked })}
                                />
                                <span>Mostrar Porcentagens</span>
                              </label>
                              <label className="flex items-center gap-2 text-sm text-[rgb(var(--text))]">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={widgetSetupGauge.show_values !== false}
                                  onChange={(e) => updateWidgetSetupGauge({ show_values: e.target.checked })}
                                />
                                <span>Mostrar Valores</span>
                              </label>
                              <label className="flex items-center gap-2 text-sm text-[rgb(var(--text))]">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={widgetSetupGauge.show_ranges !== false}
                                  onChange={(e) => updateWidgetSetupGauge({ show_ranges: e.target.checked })}
                                />
                                <span>Mostrar Ranges</span>
                              </label>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </aside>

                  <section className="min-h-0 overflow-hidden">
                    <div className="sf-band bg-[#d1e1f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Prévia do widget</div>
                    <div className="max-h-full min-h-0 overflow-auto p-4">
                      <div className="mx-auto w-full max-w-[860px] border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-4">
                        <div className="text-sm font-semibold">{widgetSetupTitle.trim() || widgetTypeTitle(widgetSetupType)}</div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]">
                          {widgetSetupSelectedReport?.name || "Relatório não selecionado"}
                        </div>

                        <div className="mt-3 border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] p-3">
                          {widgetSetupRunLoading ? (
                            <div className="px-3 py-10 text-center text-sm text-[rgb(var(--muted))]">Carregando prévia do relatório...</div>
                          ) : widgetSetupType === "kpi" ? (
                            <KpiTile
                              title={widgetSetupTitle.trim() || "KPI"}
                              reportName={widgetSetupSelectedReport?.name || "—"}
                              value={metricValueFromRun(
                                widgetSetupRun,
                                widgetSetupKpiPreviewConfig.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT,
                              )}
                              measurement={widgetSetupKpiPreviewConfig.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT}
                            />
                          ) : widgetSetupType === "grouped_column" ? (
                            <GroupedColumnTile
                              title={widgetSetupTitle.trim() || "Colunas agrupadas"}
                              reportName={widgetSetupSelectedReport?.name || "—"}
                              run={widgetSetupRun}
                              config={widgetSetupGroupedColumnPreviewConfig}
                            />
                          ) : widgetSetupType === "grouped_donut" ? (
                            <GroupedDonutTile
                              title={widgetSetupTitle.trim() || "Donut agrupado"}
                              reportName={widgetSetupSelectedReport?.name || "—"}
                              run={widgetSetupRun}
                              config={widgetSetupGroupedDonutPreviewConfig}
                            />
                          ) : widgetSetupType === "grouped_funnel" ? (
                            <GroupedFunnelTile
                              title={widgetSetupTitle.trim() || "Funil agrupado"}
                              reportName={widgetSetupSelectedReport?.name || "—"}
                              run={widgetSetupRun}
                              config={widgetSetupGroupedDonutPreviewConfig}
                            />
                          ) : widgetSetupType === "grouped_bar" ? (
                            <GroupedBarTile
                              title={widgetSetupTitle.trim() || "Barras agrupadas"}
                              reportName={widgetSetupSelectedReport?.name || "—"}
                              run={widgetSetupRun}
                              config={widgetSetupGroupedBarPreviewConfig}
                            />
                          ) : (
                            <GaugeDial
                              value={metricValueFromRun(widgetSetupRun, widgetSetupGaugePreviewConfig.measurement === "record_count" ? "record_count" : DEFAULT_GAUGE_MEASUREMENT)}
                              config={widgetSetupGaugePreviewConfig}
                              width={560}
                              height={250}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              {widgetSetupStep === "config" ? (
                <button className="btn btn-secondary !rounded-none" onClick={() => setWidgetSetupStep("report")} disabled={widgetSetupRunLoading}>
                  Voltar
                </button>
              ) : null}
              <button className="btn btn-secondary !rounded-none" onClick={closeWidgetSetupModal} disabled={widgetSetupRunLoading}>
                Cancelar
              </button>
              {widgetSetupStep === "report" ? (
                <button
                  className="btn btn-success !rounded-none"
                  onClick={() => void continueWidgetSetupToConfig()}
                  disabled={!widgetSetupReportId || widgetSetupRunLoading}
                >
                  Avançar
                </button>
              ) : (
                <button
                  className="btn btn-success !rounded-none"
                  onClick={addWidgetFromSetup}
                  disabled={
                    !widgetSetupReportId ||
                    !widgetSetupTitle.trim() ||
                    widgetSetupRunLoading ||
                    (widgetSetupType === "gauge" && Boolean(widgetSetupRangesError))
                  }
                >
                  {widgetSetupEditingId ? "Salvar alterações" : "Adicionar widget"}
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}

      {dashboardMetaModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setDashboardMetaModalOpen(false)}
            aria-label="Fechar modal de criação de dashboard"
          />

          <section className="relative z-[1] flex w-[min(760px,96vw)] flex-col overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-xl">
            <header className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel-2))] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Dashboards</div>
                <h2 className="truncate text-lg font-semibold">Novo dashboard</h2>
              </div>
              <button className="btn btn-secondary !rounded-none" onClick={() => setDashboardMetaModalOpen(false)} disabled={saving}>
                Fechar
              </button>
            </header>

            <div className="space-y-3 p-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Nome do Dashboard</div>
                  <input
                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                    value={metaDraftName}
                    onChange={(e) => setMetaDraftName(e.target.value)}
                    placeholder="Nome do dashboard"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Pasta</div>
                  <select
                    className="input h-9 rounded-md px-2 py-1.5 text-sm"
                    value={metaDraftFolder}
                    onChange={(e) => setMetaDraftFolder((e.target.value as DashboardFolderKey) || "private")}
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
              <button className="btn btn-secondary !rounded-none" onClick={() => setDashboardMetaModalOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-success !rounded-none" onClick={applyDashboardMetaFromModal} disabled={saving}>
                Continuar
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
