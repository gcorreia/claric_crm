export type AppManifest = {
  id: string;
  name: string;
  category: "Comercial" | "Acadêmico" | "Financeiro";
  description: string;
  accent?: "blue" | "cyan" | "violet" | "emerald" | "amber";
  menu: Array<{ label: string; to: string }>;
  objects?: Array<{ label: string; to: string }>;
};

export const manifest: AppManifest = {
  id: "comercial",
  name: "Comercial",
  category: "Comercial",
  description: "Pipeline, leads, contas e oportunidades.",
  accent: "blue",
  menu: [{ label: "Visão geral", to: "/apps/comercial" }],
  objects: [
    { label: "Conta", to: "/apps/comercial/contas" },
    { label: "Contato", to: "/apps/comercial/contatos" },
    { label: "Lead", to: "/apps/comercial/leads" },
    { label: "Oportunidade", to: "/apps/comercial/oportunidades" },
  ],
};
