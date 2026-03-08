export type AppManifest = {
  id: string;
  name: string;
  category: "Comercial" | "Acadêmico" | "Financeiro";
  description: string;
  accent?: "blue" | "cyan" | "violet" | "emerald" | "amber";
  menu: Array<{ label: string; to: string }>;
};

export const manifest: AppManifest = {
  id: "academico",
  name: "Acadêmico",
  category: "Acadêmico",
  description: "Matrículas, turmas, alunos e calendário.",
  accent: "blue",
  menu: [
    { label: "Visão geral", to: "/apps/academico" },
    { label: "Lista", to: "/apps/academico/lista" },
    { label: "Novo", to: "/apps/academico/novo" },
  ],
};
