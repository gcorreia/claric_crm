import { ReactNode } from "react";

export function Modal(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-[min(640px,calc(100vw-2rem))] rounded-2xl border bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="text-lg font-semibold">{props.title}</div>
          <button className="btn btn-ghost -mr-2 -mt-2" onClick={props.onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="mt-3">{props.children}</div>
        {props.footer ? <div className="mt-5 flex items-center justify-end gap-2">{props.footer}</div> : null}
      </div>
    </div>
  );
}
