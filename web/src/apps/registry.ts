import { manifest as comercial } from "./comercial/manifest";
import { manifest as academico } from "./academico/manifest";
import { manifest as financeiro } from "./financeiro/manifest";

export const APP_REGISTRY = [comercial, academico, financeiro] as const;

export type AppId = (typeof APP_REGISTRY)[number]["id"];
export type AppCategory = (typeof APP_REGISTRY)[number]["category"];

export function getAppById(id: string) {
  return APP_REGISTRY.find((a) => a.id === id) ?? null;
}
