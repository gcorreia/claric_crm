import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type DataTableColumn, type DataTableView } from "../../../../ui/DataTable";
import { formatMoneyBRL } from "../../components/MoneyInput";
import { listOrderFormsWithFallback } from "../../orderformsApi";

type OrderForm = {
  id: string;
  opportunity_id: string;
  account_id: string | null;
  name: string;
  status: string;
  effective_start_date: string | null;
  effective_end_date: string | null;
  total_amount: number;
  currency: string;
  signed_at: string | null;
  contract_generated: boolean;
  owner_id?: string | null;
  owner_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

const VIEWS: DataTableView[] = [{ id: "todas", label: "Todas" }];

function formatMoney(value: number): string {
  return formatMoneyBRL(value);
}

export function OrderFormListPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<OrderForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listOrderFormsWithFallback<OrderForm[]>();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr((e as any)?.message ?? "Falha ao carregar order forms");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const columns: Array<DataTableColumn<OrderForm>> = useMemo(
    () => [
      {
        key: "name",
        header: "Order Form",
        sortable: true,
        render: (r) => (
          <button className="hover:underline" onClick={() => nav(`/apps/comercial/order-forms/${r.id}`)}>
            {r.name}
          </button>
        ),
        sortValue: (r) => r.name,
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (r) => (r.status ? <span className="chip">{r.status}</span> : <span className="text-[rgb(var(--muted))]">—</span>),
        sortValue: (r) => r.status || "",
      },
      {
        key: "opportunity_id",
        header: "Oportunidade",
        sortable: true,
        render: (r) => r.opportunity_id || "—",
        sortValue: (r) => r.opportunity_id || "",
      },
      {
        key: "owner_name",
        header: "Owner",
        sortable: true,
        render: (r) => r.owner_name || r.owner_id || <span className="text-[rgb(var(--muted))]">—</span>,
        sortValue: (r) => r.owner_name || r.owner_id || "",
      },
      {
        key: "total_amount",
        header: "Valor",
        sortable: true,
        render: (r) => formatMoney(typeof r.total_amount === "number" ? r.total_amount : 0),
        sortValue: (r) => (typeof r.total_amount === "number" ? r.total_amount : 0),
      },
      {
        key: "signed_at",
        header: "Assinado em",
        sortable: true,
        render: (r) => (r.signed_at ? new Date(r.signed_at).toLocaleString("pt-BR") : "—"),
        sortValue: (r) => (r.signed_at ? new Date(r.signed_at).getTime() : 0),
      },
      {
        key: "updated_at",
        header: "Atualizado",
        sortable: true,
        render: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleString("pt-BR") : "—"),
        sortValue: (r) => (r.updated_at ? new Date(r.updated_at).getTime() : 0),
      },
    ],
    [nav],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="min-h-0 flex-1">
        <DataTable<OrderForm>
          title="Order Forms"
          subtitle={loading ? "Lista • Comercial • Carregando..." : `Lista • Comercial • ${rows.length} registro(s)`}
          variant="salesforce"
          stretch
          views={VIEWS}
          activeViewId="todas"
          onChangeView={() => {}}
          primaryAction={{
            label: "Novo order form",
            onClick: () => nav("/apps/comercial/order-forms/novo"),
          }}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowActions={[
            { label: "Abrir", onClick: (r) => nav(`/apps/comercial/order-forms/${r.id}`) },
            { label: "Editar", onClick: (r) => nav(`/apps/comercial/order-forms/${r.id}`) },
          ]}
          searchPlaceholder="Buscar por nome, status, owner, oportunidade..."
          searchFn={(r, q) => {
            const s = q.toLowerCase();
            return (
              (r.name ?? "").toLowerCase().includes(s) ||
              (r.status ?? "").toLowerCase().includes(s) ||
              (r.owner_name ?? "").toLowerCase().includes(s) ||
              (r.opportunity_id ?? "").toLowerCase().includes(s)
            );
          }}
        />
      </div>
    </div>
  );
}
