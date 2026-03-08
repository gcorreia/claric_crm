import { apiFetch } from "../../lib/apiClient";

export type ReportField = {
  key: string;
  label: string;
  data_type: "text" | "number" | "boolean" | "date" | "datetime" | "json";
  source: "core" | "custom";
  filterable: boolean;
  sortable: boolean;
  aggregatable: boolean;
};

export type ReportTypeKey = "account" | "contact" | "lead" | "opportunity";
export type ReportFolderKey = "public" | "private";
export type DashboardFolderKey = "public" | "private";

export type ReportTypeOut = {
  key: ReportTypeKey;
  label: string;
  entity_type: ReportTypeKey;
  fields: ReportField[];
};

export type ReportFilterIn = {
  field: string;
  op:
    | "eq"
    | "neq"
    | "contains"
    | "starts_with"
    | "in"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "between"
    | "is_empty"
    | "is_not_empty";
  value?: unknown;
  value_to?: unknown;
};

export type ReportSortIn = {
  field: string;
  direction: "asc" | "desc";
};

export type ReportAggregateIn = {
  fn: "count" | "sum" | "avg" | "min" | "max";
  field?: string | null;
  alias?: string | null;
};

export type ReportConfigIn = {
  columns: string[];
  filters: ReportFilterIn[];
  group_by: string[];
  sorts: ReportSortIn[];
  aggregate?: ReportAggregateIn | null;
  limit: number;
};

export type ReportDefinitionOut = {
  id: string;
  name: string;
  report_type: ReportTypeKey;
  folder: ReportFolderKey;
  description: string;
  config: ReportConfigIn;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ReportRunOut = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total_rows: number;
  truncated: boolean;
};

export type DashboardWidgetType =
  | "kpi"
  | "table"
  | "bar"
  | "line"
  | "donut"
  | "funnel"
  | "gauge"
  | "grouped_bar"
  | "grouped_column"
  | "grouped_donut"
  | "grouped_funnel";
export type DashboardGaugeMeasurement = "sum_values" | "record_count";
export type DashboardKpiConfig = {
  measurement?: DashboardGaugeMeasurement;
};

export type DashboardGroupedBarConfig = {
  group_field_1?: string;
  group_field_2?: string;
  measurement?: DashboardGaugeMeasurement;
  sum_field?: string | null;
  max_rows?: number;
};

export type DashboardGroupedColumnConfig = {
  x_field?: string;
  series_field?: string | null;
  measurement?: DashboardGaugeMeasurement;
  sum_field?: string | null;
  max_items?: number;
};

export type DashboardGroupedDonutConfig = {
  category_field?: string;
  measurement?: DashboardGaugeMeasurement;
  sum_field?: string | null;
  max_items?: number;
};

export type DashboardGaugeConfig = {
  min: number;
  max: number;
  yellow_from: number;
  green_from: number;
  measurement?: DashboardGaugeMeasurement;
  show_percentages?: boolean;
  show_values?: boolean;
  show_ranges?: boolean;
};

export type DashboardWidgetConfig = {
  id: string;
  title: string;
  type: DashboardWidgetType;
  report_id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  gauge?: DashboardGaugeConfig | null;
  kpi?: DashboardKpiConfig | null;
  grouped_bar?: DashboardGroupedBarConfig | null;
  grouped_column?: DashboardGroupedColumnConfig | null;
  grouped_donut?: DashboardGroupedDonutConfig | null;
};

export type DashboardLayout = {
  columns: number;
  widgets: DashboardWidgetConfig[];
};

export type DashboardDefinitionOut = {
  id: string;
  name: string;
  folder: DashboardFolderKey;
  description: string;
  layout: DashboardLayout;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function listReportTypes(signal?: AbortSignal) {
  return apiFetch<ReportTypeOut[]>("/crm/report-types", { signal });
}

export async function listReports(reportType?: ReportTypeKey, signal?: AbortSignal, folder?: ReportFolderKey) {
  const params = new URLSearchParams();
  if (reportType) params.set("report_type", reportType);
  if (folder) params.set("folder", folder);
  const qs = params.toString();
  const path = qs ? `/crm/reports?${qs}` : "/crm/reports";
  return apiFetch<ReportDefinitionOut[]>(path, { signal });
}

export async function getReport(reportId: string, signal?: AbortSignal) {
  return apiFetch<ReportDefinitionOut>(`/crm/reports/${encodeURIComponent(reportId)}`, { signal });
}

export async function createReport(payload: {
  name: string;
  report_type: ReportTypeKey;
  folder?: ReportFolderKey;
  description?: string;
  config: ReportConfigIn;
}) {
  return apiFetch<ReportDefinitionOut>("/crm/reports", {
    method: "POST",
    csrf: true,
    body: payload,
  });
}

export async function patchReport(
  reportId: string,
  payload: Partial<{
    name: string;
    report_type: ReportTypeKey;
    folder: ReportFolderKey;
    description: string;
    config: ReportConfigIn;
  }>,
) {
  return apiFetch<ReportDefinitionOut>(`/crm/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    csrf: true,
    body: payload,
  });
}

export async function deleteReport(reportId: string) {
  return apiFetch<void>(`/crm/reports/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
    csrf: true,
  });
}

export async function previewReport(payload: { report_type: ReportTypeKey; config: ReportConfigIn }, signal?: AbortSignal) {
  return apiFetch<ReportRunOut>("/crm/reports/preview", {
    method: "POST",
    body: payload,
    signal,
  });
}

export async function runSavedReport(reportId: string, signal?: AbortSignal) {
  return apiFetch<ReportRunOut>(`/crm/reports/${encodeURIComponent(reportId)}/run`, {
    method: "POST",
    body: {},
    signal,
  });
}

export async function listDashboards(folder?: DashboardFolderKey, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (folder) params.set("folder", folder);
  const qs = params.toString();
  const path = qs ? `/crm/dashboards?${qs}` : "/crm/dashboards";
  return apiFetch<DashboardDefinitionOut[]>(path, { signal });
}

export async function getDashboard(dashboardId: string, signal?: AbortSignal) {
  return apiFetch<DashboardDefinitionOut>(`/crm/dashboards/${encodeURIComponent(dashboardId)}`, { signal });
}

export async function createDashboard(payload: { name: string; folder?: DashboardFolderKey; description?: string; layout: DashboardLayout }) {
  return apiFetch<DashboardDefinitionOut>("/crm/dashboards", {
    method: "POST",
    csrf: true,
    body: payload,
  });
}

export async function patchDashboard(
  dashboardId: string,
  payload: Partial<{ name: string; folder: DashboardFolderKey; description: string; layout: DashboardLayout }>,
) {
  return apiFetch<DashboardDefinitionOut>(`/crm/dashboards/${encodeURIComponent(dashboardId)}`, {
    method: "PATCH",
    csrf: true,
    body: payload,
  });
}

export async function deleteDashboard(dashboardId: string) {
  return apiFetch<void>(`/crm/dashboards/${encodeURIComponent(dashboardId)}`, {
    method: "DELETE",
    csrf: true,
  });
}
