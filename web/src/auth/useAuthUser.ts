import { useMemo } from "react";
import { useAuth } from "./AuthContext";

type DisplayUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  displayName: string;
};

export function useAuthUser(): DisplayUser {
  const { user } = useAuth();

  return useMemo(() => {
    const name = (user as any)?.name ?? (user as any)?.full_name ?? (user as any)?.nome ?? null;
    const email = (user as any)?.email ?? null;
    const id = (user as any)?.id ?? null;

    const displayName =
      (typeof name === "string" && name.trim().length > 0 && name.trim()) ||
      (typeof email === "string" && email.trim().length > 0 && email.trim()) ||
      "Usuário";

    return { id, name, email, displayName };
  }, [user]);
}