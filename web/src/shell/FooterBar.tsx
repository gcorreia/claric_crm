import { useMemo } from "react";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function capitalize(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

export function FooterBar() {
  const todayLabel = useMemo(() => capitalize(DATE_FORMATTER.format(new Date())), []);
  const version = import.meta.env.VITE_APP_VERSION?.trim() || "0.0.0";

  return (
    <footer className="z-20 shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur">
      <div className="flex h-10 w-full items-center justify-between px-4 text-xs text-[rgb(var(--muted))]">
        <span>{todayLabel}</span>
        <span>Versão do sistema: v{version}</span>
      </div>
    </footer>
  );
}
