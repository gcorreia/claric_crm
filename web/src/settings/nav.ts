// crm/web/src/settings/nav.ts
export type SettingsNavItem = {
  key: string;
  label: string;
  path?: string; // se tiver children, path = rota da LISTA
  children?: SettingsNavItem[];
};

export type SettingsNavSection = {
  key: string;
  label: string;
  items: SettingsNavItem[];
};

export const settingsNav: SettingsNavSection[] = [
  {
    key: "admin",
    label: "Administração",
    items: [
      {
        key: "users",
        label: "Usuários",
        path: "/settings/admin/users",
        children: [
          { key: "users-new", label: "Novo", path: "/settings/admin/users/new" },
          { key: "roles", label: "Perfis", path: "/settings/admin/roles" },
        ],
      },
      {
        key: "apps",
        label: "Apps",
        children: [
          {
            key: "app-comercial",
            label: "Comercial",
            path: "/settings/admin/apps/comercial",
            children: [
              {
                key: "app-comercial-order-form",
                label: "Order Form",
                path: "/settings/admin/apps/comercial/order-form",
                children: [
                  {
                    key: "app-comercial-order-form-template",
                    label: "Template PDF",
                    path: "/settings/admin/apps/comercial/order-form",
                  },
                ],
              },
              {
                key: "app-comercial-produtos",
                label: "Produtos",
                path: "/settings/admin/apps/comercial/produtos/catalogo",
                children: [
                  {
                    key: "app-comercial-produtos-catalogo",
                    label: "Catalogo",
                    path: "/settings/admin/apps/comercial/produtos/catalogo",
                  },
                  {
                    key: "app-comercial-produtos-lista-precos",
                    label: "Lista de Preços",
                    path: "/settings/admin/apps/comercial/produtos/lista-de-precos",
                  },
                ],
              },
            ],
          },
          { key: "app-academico", label: "Acadêmico", path: "/settings/admin/apps/academico" },
          { key: "app-financeiro", label: "Financeiro", path: "/settings/admin/apps/financeiro" },
        ],
      },
      {
        key: "objects",
        label: "Objetos",
        path: "/settings/objects/provisioning/fields",
        children: [
          { key: "provisioning-fields", label: "Provisionamento · Campos", path: "/settings/objects/provisioning/fields" },
          { key: "custom-objects", label: "Objetos customizados", path: "/settings/objects/custom" },
        ],
      },
      {
        key: "email",
        label: "Email",
        path: "/settings/email",
        children: [{ key: "email-settings", label: "Configurações", path: "/settings/email" }],
      },
    ],
  },
  {
    key: "root",
    label: "Root",
    items: [
      {
        key: "tenants",
        label: "Tenants",
        path: "/settings/root/business-units",
        children: [{ key: "tenants-new", label: "Novo", path: "/settings/root/business-units/new" }],
      },
    ],
  },
];
