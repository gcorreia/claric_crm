import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { DataTable, type DataTableColumn, type DataTableView } from "../../../../ui/DataTable";
import { LimitStatusCard, useLimitBanner, useLimitGate } from "../../components/LimitGate";

type Lead = {
  id: string;
  account_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  source?: string | null;
  score?: number | null;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
};

const VIEWS: DataTableView[] = [{ id: "todas", label: "Todas" }];

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

function extractApiErrorMessage(e: unknown): string {
  const ae = e as any;
  const detail = ae?.detail;
  if (detail?.message) return String(detail.message);
  if (typeof detail === "string") return detail;
  return String(ae?.message || "Erro inesperado");
}

export function LeadListPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: limit0 } = useLimitBanner("comercial.leads");
  const { guard, LimitModal } = useLimitGate("comercial.leads");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<Lead[]>("/crm/leads", { signal } as any);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (isAbortError(e)) return;
      setErr(extractApiErrorMessage(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, []);

  const columns: Array<DataTableColumn<Lead>> = useMemo(
    () => [
      {
        key: "name",
        header: "Lead",
        sortable: true,
        render: (r) => (
          <button className="hover:underline" onClick={() => nav(`/apps/comercial/leads/${r.id}`)}>
            {r.name}
          </button>
        ),
        sortValue: (r) => r.name,
      },
      {
        key: "account_id",
        header: "Conta",
        sortable: true,
        render: (r) => r.account_id || <span className="text-[rgb(var(--muted))]">—</span>,
        sortValue: (r) => r.account_id || "",
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (r) => (r.status ? <span className="chip">{r.status}</span> : <span className="text-[rgb(var(--muted))]">—</span>),
        sortValue: (r) => r.status || "",
      },
      {
        key: "score",
        header: "Score",
        sortable: true,
        render: (r) => (r.score ?? "—"),
        sortValue: (r) => (typeof r.score === "number" ? r.score : Number.NEGATIVE_INFINITY),
      },
      {
        key: "owner_name",
        header: "Owner",
        sortable: true,
        render: (r) => r.owner_name || r.owner_id || <span className="text-[rgb(var(--muted))]">—</span>,
        sortValue: (r) => r.owner_name || r.owner_id || "",
      },
      {
        key: "updated_at",
        header: "Atualizado",
        sortable: true,
        render: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"),
        sortValue: (r) => (r.updated_at ? new Date(r.updated_at).getTime() : 0),
      },
    ],
    [nav],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <LimitStatusCard objectLabel="Leads" data={limit0} onOpenContract={() => nav("/settings/contract")} />
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="min-h-0 flex-1">
        <DataTable<Lead>
          title="Leads"
          subtitle={loading ? "Lista • Comercial • Carregando..." : `Lista • Comercial • ${rows.length} lead(s)`}
          variant="salesforce"
          stretch
          views={VIEWS}
          activeViewId="todas"
          onChangeView={() => {}}
          primaryAction={{
            label: "Novo lead",
            onClick: () => void guard("Leads", 1, () => nav("/apps/comercial/leads/novo"), () => nav("/settings/contract")),
          }}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowActions={[
            { label: "Abrir", onClick: (r) => nav(`/apps/comercial/leads/${r.id}`) },
            { label: "Editar", onClick: (r) => nav(`/apps/comercial/leads/${r.id}`) },
          ]}
          searchPlaceholder="Buscar por nome, conta, status..."
          searchFn={(r, q) => {
            const s = q.toLowerCase();
            return (
              (r.name ?? "").toLowerCase().includes(s) ||
              (r.account_id ?? "").toLowerCase().includes(s) ||
              (r.status ?? "").toLowerCase().includes(s) ||
              (r.source ?? "").toLowerCase().includes(s) ||
              (r.email ?? "").toLowerCase().includes(s) ||
              (r.phone ?? "").toLowerCase().includes(s) ||
              (r.owner_name ?? "").toLowerCase().includes(s)
            );
          }}
        />
      </div>

      <LimitModal />
    </div>
  );
}
