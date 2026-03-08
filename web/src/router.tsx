// crm/web/src/router.tsx
import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "./shell/AppShell";
import { HomePage } from "./pages/HomePage";
import { AppsPage } from "./pages/AppsPage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ErrorPage } from "./pages/ErrorPage";

import { SettingsLayout } from "./settings/SettingsLayout";
import { SettingsIndexPage } from "./settings/pages/SettingsIndexPage";
import { UsersListPage } from "./settings/pages/UsersListPage";
import { UserNewPage } from "./settings/pages/UserNewPage";
import { UserDetailPage } from "./settings/pages/UserDetailPage";
import { UserEditPage } from "./settings/pages/UserEditPage";

import { BusinessUnitsListPage } from "./settings/pages/BusinessUnitsListPage";
import { BusinessUnitNewPage } from "./settings/pages/BusinessUnitNewPage";
import { BusinessUnitEditPage } from "./settings/pages/BusinessUnitEditPage";

import { RolesListPage } from "./settings/pages/RolesListPage";
import { RoleNewPage } from "./settings/pages/RoleNewPage";
import { RoleEditPage } from "./settings/pages/RoleEditPage";

import { CustomObjectsListPage } from "./settings/pages/CustomObjectsListPage";
import { CustomObjectNewPage } from "./settings/pages/CustomObjectNewPage";
import { EmailSettingsPage } from "./settings/pages/EmailSettingsPage";
import { ProvisioningFieldsPage } from "./settings/pages/ProvisioningFieldsPage";
import { AppObjectsConfigPage } from "./settings/pages/AppObjectsConfigPage";
import { CommercialProductsConfigPage } from "./settings/pages/CommercialProductsConfigPage";
import { OrderFormTemplateConfigPage } from "./settings/pages/OrderFormTemplateConfigPage";

import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRoot } from "./auth/RequireRoot";

import { routes as comercialRoutes } from "./apps/comercial/routes";
import { routes as academicoRoutes } from "./apps/academico/routes";
import { routes as financeiroRoutes } from "./apps/financeiro/routes";

import { ModuleAliasRedirect } from "./redirects/ModuleAliasRedirect";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/settings",
    element: (
      <RequireAuth>
        <SettingsLayout />
      </RequireAuth>
    ),
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <SettingsIndexPage /> },

      { path: "admin/users", element: <UsersListPage /> },
      { path: "admin/users/new", element: <UserNewPage /> },
      { path: "admin/users/:id", element: <UserDetailPage /> },
      { path: "admin/users/:id/edit", element: <UserEditPage /> },

      { path: "admin/business-units", element: <Navigate to="/settings/root/business-units" replace /> },
      { path: "admin/business-units/new", element: <Navigate to="/settings/root/business-units/new" replace /> },

      {
        path: "root/business-units",
        element: (
          <RequireRoot>
            <BusinessUnitsListPage />
          </RequireRoot>
        ),
      },
      {
        path: "root/business-units/new",
        element: (
          <RequireRoot>
            <BusinessUnitNewPage />
          </RequireRoot>
        ),
      },
      {
        path: "root/business-units/:id/edit",
        element: (
          <RequireRoot>
            <BusinessUnitEditPage />
          </RequireRoot>
        ),
      },

      { path: "admin/roles", element: <RolesListPage /> },
      { path: "admin/roles/new", element: <RoleNewPage /> },
      { path: "admin/roles/:id", element: <RoleEditPage /> },
      { path: "admin/apps/:appKey", element: <AppObjectsConfigPage /> },
      { path: "admin/apps/comercial/produtos", element: <Navigate to="/settings/admin/apps/comercial/produtos/catalogo" replace /> },
      { path: "admin/apps/comercial/produtos/catalogo", element: <CommercialProductsConfigPage section="catalogo" /> },
      {
        path: "admin/apps/comercial/produtos/lista-de-precos",
        element: <CommercialProductsConfigPage section="lista-precos" />,
      },
      { path: "admin/apps/comercial/order-form", element: <OrderFormTemplateConfigPage /> },

      { path: "objects/provisioning/fields", element: <ProvisioningFieldsPage /> },

      { path: "objects/custom", element: <CustomObjectsListPage /> },
      { path: "objects/custom/new", element: <CustomObjectNewPage /> },
      { path: "email", element: <EmailSettingsPage /> },
    ],
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "apps", element: <AppsPage /> },

      // Canonical module routes
      { path: "apps/comercial", element: <AppDetailPage />, children: comercialRoutes },
      { path: "apps/academico", element: <AppDetailPage />, children: academicoRoutes },
      { path: "apps/financeiro", element: <AppDetailPage />, children: financeiroRoutes },

      // Aliases (fix: /comercial -> /apps/comercial)
      { path: "comercial", element: <ModuleAliasRedirect appId="comercial" /> },
      { path: "comercial/*", element: <ModuleAliasRedirect appId="comercial" /> },

      { path: "academico", element: <ModuleAliasRedirect appId="academico" /> },
      { path: "academico/*", element: <ModuleAliasRedirect appId="academico" /> },

      { path: "financeiro", element: <ModuleAliasRedirect appId="financeiro" /> },
      { path: "financeiro/*", element: <ModuleAliasRedirect appId="financeiro" /> },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
