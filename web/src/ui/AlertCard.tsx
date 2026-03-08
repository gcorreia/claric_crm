import { ReactNode } from "react";

export type AlertTone = "info" | "warn" | "danger";

const TONES: Record<AlertTone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
};

export function AlertCard(props: { tone?: AlertTone; title: string; children?: ReactNode; actions?: ReactNode }) {
  const tone = props.tone ?? "info";
  return (
    <div className={`rounded-2xl border p-4 text-sm ${TONES[tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{props.title}</div>
          {props.children ? <div className="mt-1 opacity-90">{props.children}</div> : null}
        </div>
        {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
      </div>
    </div>
  );
}
