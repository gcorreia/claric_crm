export type AppManifest = {
  id: string;
  name: string;
  category: "Comercial" | "Acadêmico" | "Financeiro";
  description: string;
  accent?: "blue" | "cyan" | "violet" | "emerald" | "amber";
  menu: Array<{ label: string; to: string }>;
};

export const manifest: AppManifest = {
  id: "financeiro",
  name: "Financeiro",
  category: "Financeiro",
  description: "Cobranças, receitas, despesas e conciliação.",
  accent: "blue",
  menu: [
    { label: "Visão geral", to: "/apps/financeiro" },
    { label: "Lista", to: "/apps/financeiro/lista" },
    { label: "Novo", to: "/apps/financeiro/novo" },
  ],
};
