import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, type ApiError } from "../../../../lib/apiClient";
import { DataTable, type DataTableColumn, type DataTableView } from "../../../../ui/DataTable";
import { LimitStatusCard, useLimitBanner, useLimitGate } from "../../components/LimitGate";

type Contact = {
  id: string;
  account_id: string;
  name: string;
  external_id: string;
  contact_role: string;
  owner_id: string;
  owner_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  custom_fields?: Record<string, any>;
};

const VIEWS: DataTableView[] = [{ id: "todas", label: "Todas" }];

function isAbortError(e: any): boolean {
  return e?.name === "AbortError" || String(e?.message || "").includes("signal is aborted");
}

export function ContatoListPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: limit0 } = useLimitBanner("comercial.contacts");
  const { guard, LimitModal } = useLimitGate("comercial.contacts");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<Contact[]>("/crm/contacts", { signal });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (isAbortError(e)) return;
      const ae = e as ApiError;
      setErr(ae?.message ?? "Falha ao carregar contatos");
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

  const columns: Array<DataTableColumn<Contact>> = useMemo(
    () => [
      {
        key: "name",
        header: "Contato",
        sortable: true,
        render: (r) => (
          <button className="hover:underline" onClick={() => nav(`/apps/comercial/contatos/${r.id}`)}>
            {r.name}
          </button>
        ),
        sortValue: (r) => r.name,
      },
      {
        key: "external_id",
        header: "ID",
        sortable: true,
        render: (r) => <span className="font-mono">{r.external_id}</span>,
        sortValue: (r) => r.external_id,
      },
      {
        key: "contact_role",
        header: "Role",
        sortable: true,
        render: (r) => r.contact_role,
        sortValue: (r) => r.contact_role,
      },
      {
        key: "owner_name",
        header: "Owner",
        sortable: true,
        render: (r) => r.owner_name || r.owner_id,
        sortValue: (r) => r.owner_name || r.owner_id,
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
      <LimitStatusCard objectLabel="Contatos" data={limit0} onOpenContract={() => nav("/settings/contract")} />
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="min-h-0 flex-1">
        <DataTable<Contact>
          title="Contatos"
          subtitle={loading ? "Lista • Comercial • Carregando..." : `Lista • Comercial • ${rows.length} contato(s)`}
          variant="salesforce"
          stretch
          views={VIEWS}
          activeViewId="todas"
          onChangeView={() => {}}
          primaryAction={{
            label: "Novo contato",
            onClick: () => void guard("Contatos", 1, () => nav("/apps/comercial/contatos/novo"), () => nav("/settings/contract")),
          }}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowActions={[
            { label: "Abrir", onClick: (r) => nav(`/apps/comercial/contatos/${r.id}`) },
            { label: "Editar", onClick: (r) => nav(`/apps/comercial/contatos/${r.id}`) },
          ]}
          searchPlaceholder="Buscar por nome, email, telefone..."
          searchFn={(r, q) => {
            const s = q.toLowerCase();
            return (
              (r.name ?? "").toLowerCase().includes(s) ||
              (r.email ?? "").toLowerCase().includes(s) ||
              (r.phone ?? "").toLowerCase().includes(s) ||
              (r.title ?? "").toLowerCase().includes(s)
            );
          }}
        />
      </div>

      <LimitModal />
    </div>
  );
}
