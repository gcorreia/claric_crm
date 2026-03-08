// crm/web/src/bu/BusinessUnitContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/apiClient";
import { useQueryClient } from "@tanstack/react-query";

export type BusinessUnit = { id: string; name: string; address?: string | null };

type State = {
  businessUnits: BusinessUnit[];
  activeBu: BusinessUnit | null;
};

type Ctx = State & {
  setActiveBu: (buId: string) => Promise<void>;
};

const BusinessUnitContext = createContext<Ctx | null>(null);

export function BusinessUnitProvider(props: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ businessUnits: [], activeBu: null });

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail ?? {};
      setState((prev) => ({
        businessUnits: detail.business_units ?? prev.businessUnits,
        activeBu: detail.active_bu ?? prev.activeBu,
      }));
    };

    window.addEventListener("claric:bu", handler);
    return () => window.removeEventListener("claric:bu", handler);
  }, []);

  const setActiveBu: Ctx["setActiveBu"] = async (buId) => {
    const res = await apiFetch<any>("/context/bu", {
      method: "POST",
      body: { bu_id: buId },
      csrf: true,
    });

    setState((prev) => ({
      businessUnits: res.business_units ?? prev.businessUnits,
      activeBu: res.active_bu ?? null,
    }));

    await queryClient.invalidateQueries();
    window.location.assign("/");
  };

  const value = useMemo<Ctx>(
    () => ({
      businessUnits: state.businessUnits,
      activeBu: state.activeBu,
      setActiveBu,
    }),
    [state],
  );

  return <BusinessUnitContext.Provider value={value}>{props.children}</BusinessUnitContext.Provider>;
}

export function useBusinessUnit() {
  const ctx = useContext(BusinessUnitContext);
  if (!ctx) throw new Error("useBusinessUnit must be used within BusinessUnitProvider");
  return ctx;
}