import { useEffect, useRef, useState } from "react";
import { apiFetch, type ApiError } from "../../../lib/apiClient";
import { AlertCard } from "../../../ui/AlertCard";
import { Modal } from "../../../ui/Modal";

export type LimitObjectKey =
  | "comercial.accounts"
  | "comercial.contacts"
  | "comercial.leads"
  | "comercial.opportunities";

export type LimitCheck = {
  status: "OK" | "WARN" | "BLOCK";
  limit: number | null;
  current: number;
  after: number;
  hard_max: number | null;
  overage_percent: number;
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(n);
}

async function check(objectKey: LimitObjectKey, delta: number): Promise<LimitCheck> {
  return apiFetch<LimitCheck>("/limits/check", { method: "POST", body: { object_key: objectKey, delta } });
}

export function useLimitBanner(objectKey: LimitObjectKey) {
  const [data, setData] = useState<LimitCheck | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setErr(null);
      try {
        const d = await check(objectKey, 0);
        setData(d);
      } catch (e) {
        const ae = e as ApiError;
        setErr(ae?.message ?? "Falha ao validar limites");
      }
    })();
    return () => ac.abort();
  }, [objectKey]);

  return { data, err };
}

export function LimitStatusCard(props: { objectLabel: string; data: LimitCheck | null; onOpenContract?: () => void }) {
  const d = props.data;
  if (!d) return null;

  // Only show persistent card when above limit (WARN/BLOCK for delta=0 => current > limit)
  if (d.status === "OK") return null;

  const tone = d.status === "BLOCK" ? "danger" : "warn";

  return (
    <AlertCard
      tone={tone}
      title={d.status === "BLOCK" ? "Uso bloqueado por limite de contrato" : "Limite de contrato ultrapassado"}
      actions={
        props.onOpenContract ? (
          <button className="btn btn-secondary" onClick={props.onOpenContract}>
            Ver contrato
          </button>
        ) : null
      }
    >
      <div className="mt-1">
        <div>
          Objeto: <b>{props.objectLabel}</b>
        </div>
        <div className="mt-1">
          Limite: <b>{fmt(d.limit)}</b> · Atual: <b>{d.current}</b> · Teto (+{d.overage_percent}%):{" "}
          <b>{fmt(d.hard_max)}</b>
        </div>
      </div>
    </AlertCard>
  );
}



export function useLimitGate(objectKey: LimitObjectKey) {
  const onAllowedRef = useRef<(() => void) | null>(null);
  const onOpenContractRef = useRef<(() => void) | null>(null);

  const [modal, setModal] = useState<{ open: boolean; data: LimitCheck | null; objectLabel: string }>({
    open: false,
    data: null,
    objectLabel: "",
  });

  async function guard(
    objectLabel: string,
    delta: number,
    onAllowed: () => void,
    onOpenContract?: () => void,
  ): Promise<void> {
    const d = await check(objectKey, delta);

    if (d.status === "OK") {
      onAllowed();
      return;
    }

    onAllowedRef.current = onAllowed;
    onOpenContractRef.current = onOpenContract ?? null;
    setModal({ open: true, data: d, objectLabel });
  }

  function close() {
    setModal((s) => ({ ...s, open: false }));
  }

  const LimitModal = () => {
    const d = modal.data;
    if (!d) return null;

    const isBlock = d.status === "BLOCK";
    const title = isBlock ? "Limite excedido — ação bloqueada" : "Limite excedido — você pode continuar";

    return (
      <Modal
        open={modal.open}
        title={title}
        onClose={close}
        footer={
          <>
            {onOpenContractRef.current ? (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  close();
                  onOpenContractRef.current?.();
                }}
              >
                Ver contrato
              </button>
            ) : null}

            {!isBlock ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  close();
                  onAllowedRef.current?.();
                }}
              >
                Continuar
              </button>
            ) : (
              <button className="btn btn-primary" onClick={close}>
                Entendi
              </button>
            )}
          </>
        }
      >
        <div className="text-sm">
          <div>
            Objeto: <b>{modal.objectLabel}</b>
          </div>

          <div className="mt-2 rounded-xl border bg-white p-3">
            <div>
              Limite do plano: <b>{fmt(d.limit)}</b>
            </div>
            <div>
              Uso atual: <b>{d.current}</b>
            </div>
            <div>
              Uso após ação: <b>{d.after}</b>
            </div>
            <div>
              Teto permitido (+{d.overage_percent}%): <b>{fmt(d.hard_max)}</b>
            </div>
          </div>

          <div className="mt-3 opacity-80">
            {isBlock
              ? "Seu tenant passou do teto permitido. Para continuar, ajuste o contrato."
              : "Seu tenant passou do limite do plano, mas ainda está dentro da tolerância. Você pode continuar."}
          </div>
        </div>
      </Modal>
    );
  };

  return { guard, LimitModal };
}
