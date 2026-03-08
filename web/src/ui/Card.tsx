import type { PropsWithChildren, ReactNode } from "react";

export function Card(props: PropsWithChildren<{ className?: string; title?: string; subtitle?: string; headerRight?: ReactNode }>) {
  const { className, title, subtitle, headerRight, children } = props;
  return (
    <section className={`panel rounded-2xl p-4 ${className ?? ""}`}>
      {(title || subtitle) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs text-[rgb(var(--muted))]">{subtitle}</p>}
          </div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}
