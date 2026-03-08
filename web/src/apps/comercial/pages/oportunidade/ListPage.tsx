import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../../lib/apiClient";
import { DataTable, type DataTableColumn, type DataTableView } from "../../../../ui/DataTable";
import { LimitStatusCard, useLimitBanner, useLimitGate } from "../../components/LimitGate";

type Opportunity = {
  id: string;
  account_id: string | null;
  name: string;
  stage: string;
  amount: number;
  close_date: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
};

const VIEWS: DataTableView[] = [{ id: "todas", label: "Todas" }];

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

export function OportunidadeListPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: limit0 } = useLimitBanner("comercial.opportunities");
  const { guard, LimitModal } = useLimitGate("comercial.opportunities");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<Opportunity[]>("/crm/opportunities", { signal } as any);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (isAbortError(e)) return;
      setErr((e as any)?.message ?? "Falha ao carregar oportunidades");
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

  const columns: Array<DataTableColumn<Opportunity>> = useMemo(
    () => [
      {
        key: "name",
        header: "Oportunidade",
        sortable: true,
        render: (r) => (
          <button className="hover:underline" onClick={() => nav(`/apps/comercial/oportunidades/${r.id}`)}>
            {r.name}
          </button>
        ),
        sortValue: (r) => r.name,
      },
      {
        key: "stage",
        header: "Etapa",
        sortable: true,
        render: (r) => (r.stage ? <span className="chip">{r.stage}</span> : <span className="text-[rgb(var(--muted))]">—</span>),
        sortValue: (r) => r.stage || "",
      },
      {
        key: "owner_name",
        header: "Owner",
        sortable: true,
        render: (r) => r.owner_name || r.owner_id || <span className="text-[rgb(var(--muted))]">—</span>,
        sortValue: (r) => r.owner_name || r.owner_id || "",
      },
      {
        key: "amount",
        header: "Valor",
        sortable: true,
        render: (r) => (typeof r.amount === "number" ? r.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"),
        sortValue: (r) => (typeof r.amount === "number" ? r.amount : 0),
      },
      {
        key: "close_date",
        header: "Fechamento",
        sortable: true,
        render: (r) => (r.close_date ? new Date(r.close_date).toLocaleDateString("pt-BR") : "—"),
        sortValue: (r) => (r.close_date ? new Date(r.close_date).getTime() : 0),
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
      <LimitStatusCard objectLabel="Oportunidades" data={limit0} onOpenContract={() => nav("/settings/contract")} />
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="min-h-0 flex-1">
        <DataTable<Opportunity>
          title="Oportunidades"
          subtitle={loading ? "Lista • Comercial • Carregando..." : `Lista • Comercial • ${rows.length} oportunidade(s)`}
          variant="salesforce"
          stretch
          views={VIEWS}
          activeViewId="todas"
          onChangeView={() => {}}
          primaryAction={{
            label: "Nova oportunidade",
            onClick: () =>
              void guard("Oportunidades", 1, () => nav("/apps/comercial/oportunidades/novo"), () => nav("/settings/contract")),
          }}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowActions={[
            { label: "Abrir", onClick: (r) => nav(`/apps/comercial/oportunidades/${r.id}`) },
            { label: "Editar", onClick: (r) => nav(`/apps/comercial/oportunidades/${r.id}`) },
          ]}
          searchPlaceholder="Buscar por nome, etapa, owner..."
          searchFn={(r, q) => {
            const s = q.toLowerCase();
            return (
              (r.name ?? "").toLowerCase().includes(s) ||
              (r.stage ?? "").toLowerCase().includes(s) ||
              (r.owner_name ?? "").toLowerCase().includes(s)
            );
          }}
        />
      </div>

      <LimitModal />
    </div>
  );
}
