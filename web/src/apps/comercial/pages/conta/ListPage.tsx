import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../../../lib/apiClient";
import { DataTable, type DataTableColumn, type DataTableView } from "../../../../ui/DataTable";
import { LimitStatusCard, useLimitBanner, useLimitGate } from "../../components/LimitGate";

type Account = {
  id: string;
  name: string;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const VIEWS: DataTableView[] = [{ id: "todas", label: "Todas" }];

function isAbortError(e: unknown): boolean {
  const err = e as any;
  return err?.name === "AbortError" || String(err?.message || "").includes("signal is aborted");
}

function extractApiErrorMessage(e: unknown): string {
  const ae = e as ApiError & { detail?: any };
  if (typeof ae?.detail === "string") return ae.detail;
  if (ae?.detail?.message) return String(ae.detail.message);
  return String(ae?.message || "Falha ao carregar contas");
}

export function ContaListPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: limit0 } = useLimitBanner("comercial.accounts");
  const { guard, LimitModal } = useLimitGate("comercial.accounts");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<Account[]>("/crm/accounts", { signal } as any);
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

  const columns: Array<DataTableColumn<Account>> = useMemo(
    () => [
      {
        key: "name",
        header: "Conta",
        sortable: true,
        render: (r) => (
          <button className="hover:underline" onClick={() => nav(`/apps/comercial/contas/${r.id}`)}>
            {r.name}
          </button>
        ),
        sortValue: (r) => r.name,
      },
      {
        key: "id",
        header: "ID",
        sortable: true,
        render: (r) => <span className="font-mono text-xs text-[rgb(var(--muted))]">{r.id.slice(0, 8)}</span>,
        sortValue: (r) => r.id,
      },
      {
        key: "owner_name",
        header: "Owner",
        sortable: true,
        render: (r) => r.owner_name || r.owner_id || "—",
        sortValue: (r) => r.owner_name || r.owner_id || "",
      },
      {
        key: "created_at",
        header: "Criado",
        sortable: true,
        render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "—"),
        sortValue: (r) => (r.created_at ? new Date(r.created_at).getTime() : 0),
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
      <LimitStatusCard objectLabel="Contas" data={limit0} onOpenContract={() => nav("/settings/contract")} />
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="min-h-0 flex-1">
        <DataTable<Account>
          title="Contas"
          subtitle={loading ? "Lista • Comercial • Carregando..." : `Lista • Comercial • ${rows.length} conta(s)`}
          variant="salesforce"
          stretch
          views={VIEWS}
          activeViewId="todas"
          onChangeView={() => {}}
          primaryAction={{
            label: "Nova conta",
            onClick: () => void guard("Contas", 1, () => nav("/apps/comercial/contas/novo"), () => nav("/settings/contract")),
          }}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowActions={[
            { label: "Abrir", onClick: (r) => nav(`/apps/comercial/contas/${r.id}`) },
            { label: "Editar", onClick: (r) => nav(`/apps/comercial/contas/${r.id}`) },
          ]}
          searchPlaceholder="Buscar em Contas..."
          searchFn={(r, q) => {
            const s = q.toLowerCase();
            return (
              (r.name ?? "").toLowerCase().includes(s) ||
              (r.owner_name ?? "").toLowerCase().includes(s) ||
              (r.owner_id ?? "").toLowerCase().includes(s) ||
              (r.id ?? "").toLowerCase().includes(s)
            );
          }}
        />
      </div>

      <LimitModal />
    </div>
  );
}
