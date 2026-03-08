import { APP_REGISTRY } from "./registry";

export type AppDefinition = {
  id: string;
  name: string;
  description: string;
  category: "Comercial" | "Acadêmico" | "Financeiro";
  accent?: "blue" | "cyan" | "violet" | "emerald" | "amber";
};

export const APPS: AppDefinition[] = APP_REGISTRY.map((a) => ({
  id: a.id,
  name: a.name,
  description: a.description,
  category: a.category,
  accent: a.accent,
}));

export const APP_CATEGORIES = ["Comercial", "Acadêmico", "Financeiro"] as const;
