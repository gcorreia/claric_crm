import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { OverviewPage } from "./pages/overview/OverviewPage";

// Objeto: Conta
import { ContaListPage } from "./pages/conta/ListPage";
import { ContaCreatePage } from "./pages/conta/CreatePage";
import { ContaDetailPage } from "./pages/conta/DetailPage";

// Objeto: Contato
import { ContatoListPage } from "./pages/contato/ListPage";
import { ContatoCreatePage } from "./pages/contato/CreatePage";
import { ContatoDetailPage } from "./pages/contato/DetailPage";

// Objeto: Lead
import { LeadListPage } from "./pages/lead/ListPage";
import { LeadCreatePage } from "./pages/lead/CreatePage";
import { LeadDetailPage } from "./pages/lead/DetailPage";

// Objeto: Oportunidade
import { OportunidadeListPage } from "./pages/oportunidade/ListPage";
import { OportunidadeCreatePage } from "./pages/oportunidade/CreatePage";
import { OportunidadeDetailPage } from "./pages/oportunidade/DetailPage";

// Objeto: Order Form
import { OrderFormListPage } from "./pages/orderform/ListPage";
import { OrderFormCreatePage } from "./pages/orderform/CreatePage";
import { OrderFormDetailPage } from "./pages/orderform/DetailPage";

// Objeto: Cotacao (CPQ)
import { CotacaoListPage } from "./pages/cotacao/ListPage";
import { CotacaoCreatePage } from "./pages/cotacao/CreatePage";
import { CotacaoDetailPage } from "./pages/cotacao/DetailPage";
import { ReportsPage } from "./pages/reporting/ReportsPage";
import { DashboardsPage } from "./pages/reporting/DashboardsPage";

export const routes: RouteObject[] = [
  { index: true, element: <OverviewPage /> },

  { path: "contas", element: <ContaListPage /> },

  // ✅ alias antigo: /contas/nova -> /contas/novo
  { path: "contas/nova", element: <Navigate to="/comercial/contas/novo" replace /> },

  { path: "contas/novo", element: <ContaCreatePage /> },
  { path: "contas/:id", element: <ContaDetailPage /> },

  { path: "contatos", element: <ContatoListPage /> },
  { path: "contatos/novo", element: <ContatoCreatePage /> },
  { path: "contatos/:id", element: <ContatoDetailPage /> },

  { path: "leads", element: <LeadListPage /> },
  { path: "leads/novo", element: <LeadCreatePage /> },
  { path: "leads/:id", element: <LeadDetailPage /> },

  { path: "oportunidades", element: <OportunidadeListPage /> },
  { path: "oportunidades/novo", element: <OportunidadeCreatePage /> },
  { path: "oportunidades/:id", element: <OportunidadeDetailPage /> },

  { path: "order-forms", element: <OrderFormListPage /> },
  { path: "order-forms/novo", element: <OrderFormCreatePage /> },
  { path: "order-forms/:id", element: <OrderFormDetailPage /> },

  { path: "cotacoes", element: <CotacaoListPage /> },
  { path: "cotacoes/novo", element: <CotacaoCreatePage /> },
  { path: "cotacoes/:id", element: <CotacaoDetailPage /> },

  { path: "relatorios", element: <ReportsPage /> },
  { path: "dashboards", element: <DashboardsPage /> },
];
