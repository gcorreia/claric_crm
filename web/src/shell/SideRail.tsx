// File: web/src/shell/SideRail.tsx
import { NavLink, useLocation } from "react-router-dom";
import { APP_REGISTRY, getAppById } from "../apps/registry";
import { IconGrid } from "../ui/Icon";

type AppObject = { label: string; to: string };

const CORE_OBJECT_LABELS = new Set(["Conta", "Contato", "Lead", "Oportunidade"]);

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function splitCoreAndCustom(objects: AppObject[]) {
  const core: AppObject[] = [];
  const custom: AppObject[] = [];

  for (const obj of objects) {
    if (CORE_OBJECT_LABELS.has(obj.label)) core.push(obj);
    else custom.push(obj);
  }

  return { core, custom };
}

function Tooltip(props: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-40 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-2 py-1 text-xs font-medium text-[rgb(var(--text))] shadow-xl group-hover:block">
      {props.label}
    </span>
  );
}

function IconRailAction(props: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className="group relative grid h-10 w-10 place-items-center rounded-xl text-white/85 transition hover:bg-white/12 hover:text-white"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
    >
      {props.icon}
      <Tooltip label={props.label} />
    </button>
  );
}

function IconRailLink(props: { to: string; label: string; icon: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={props.to}
      end={props.end ?? true}
      className={({ isActive }) =>
        [
          "group relative grid h-10 w-10 place-items-center rounded-xl transition",
          isActive ? "bg-white/22 text-white" : "text-white/80 hover:bg-white/12 hover:text-white",
        ].join(" ")
      }
      aria-label={props.label}
      title={props.label}
    >
      {props.icon}
      <Tooltip label={props.label} />
    </NavLink>
  );
}

function ModuleLink(props: { to: string; label: string; icon: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={props.to}
      end={props.end ?? true}
      className={({ isActive }) =>
        [
          "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[15px] font-medium transition",
          isActive
            ? "bg-[rgba(var(--accent),0.16)] text-[rgb(var(--text))]"
            : "text-[rgb(var(--muted))] hover:bg-[rgba(var(--panel-2),0.75)] hover:text-[rgb(var(--text))]",
        ].join(" ")
      }
    >
      <span className="opacity-85">{props.icon}</span>
      <span className="truncate">{props.label}</span>
    </NavLink>
  );
}

function IconModuleComercial() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <path d="M4 8.5h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconModuleAcademico() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <path d="M3 8.5 12 4l9 4.5L12 13 3 8.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 10.5V15c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconModuleFinanceiro() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 10.5h17" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="14.2" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function iconForModule(appId: string) {
  const key = normalize(appId);
  if (key === "comercial") return <IconModuleComercial />;
  if (key === "academico") return <IconModuleAcademico />;
  if (key === "financeiro") return <IconModuleFinanceiro />;
  return <IconGrid />;
}

function IconAccount() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <path d="M4 20V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13M3 20h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 10h2m4 0h2M8 14h2m4 0h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconContact() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 19c.9-3 3.6-5 7-5s6.1 2 7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconLead() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <path d="M12 3v6m0 0 2.6-2.6M12 9 9.4 6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 13.5a6 6 0 1 0 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconOpportunity() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 4.5V2.8m0 18.4v-1.7M4.5 12H2.8m18.4 0h-1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconCustom() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <path d="M12 3 4.5 7v10L12 21l7.5-4V7L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4.5 7 12 11l7.5-4M12 11v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconReport() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 15V9m4 6V6m4 9v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <path d="M4 12a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12 16.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <path d="M6.5 17h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function iconForObject(label: string) {
  const key = normalize(label);
  if (key === "conta") return <IconAccount />;
  if (key === "contato") return <IconContact />;
  if (key === "lead") return <IconLead />;
  if (key === "oportunidade") return <IconOpportunity />;
  return <IconCustom />;
}

function AppRailIcon(props: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <IconRailLink
      to={props.to}
      label={props.label}
      icon={props.icon}
    />
  );
}

export function SideRail(props: { onOpenLauncher: () => void }) {
  const { pathname } = useLocation();
  const isInModule = pathname.startsWith("/apps/");
  const match = pathname.match(/^\/apps\/([^/]+)/);
  const appId = match?.[1] ?? null;

  const app = appId ? getAppById(appId) : null;
  const objects = app?.objects ?? [];
  const { core: coreObjects, custom: customObjects } = splitCoreAndCustom(objects);
  const isCommercial = normalize(app?.id) === "comercial";
  const appLinks = APP_REGISTRY.map((a) => ({
    to: `/apps/${a.id}`,
    label: a.name,
    icon: iconForModule(a.id),
  }));

  if (!isInModule) {
    return (
      <aside className="hidden md:block">
        <div className="sticky top-0 self-start">
          <div className="flex w-[56px] flex-col items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[linear-gradient(180deg,#1c1955_0%,#181448_100%)] px-2 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.22)]">
            <IconRailAction label="Apps" onClick={props.onOpenLauncher} icon={<IconGrid />} />
            {appLinks.map((x) => (
              <AppRailIcon key={x.to} to={x.to} label={x.label} icon={x.icon} />
            ))}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden md:block">
      <div className="sticky top-0 self-start flex gap-1.5">
        <div className="flex w-[56px] flex-col items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[linear-gradient(180deg,#1c1955_0%,#181448_100%)] px-2 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.22)]">
          <IconRailAction label="Apps" onClick={props.onOpenLauncher} icon={<IconGrid />} />
          {appLinks.map((x) => (
            <AppRailIcon key={x.to} to={x.to} label={x.label} icon={x.icon} />
          ))}
        </div>

        <div className="panel w-[192px] rounded-2xl p-2">
          <div className="px-2 pb-2 pt-1">
            <div className="truncate text-sm font-semibold">{app?.name || "Módulo"}</div>
            <div className="mt-0.5 text-xs text-[rgb(var(--muted))]">Navegação do módulo</div>
          </div>

          <div className="space-y-0.5">
            {coreObjects.map((o) => (
              <ModuleLink key={o.to} to={o.to} label={o.label} icon={iconForObject(o.label)} />
            ))}
          </div>

          {customObjects.length ? (
            <>
              <div className="mx-2 my-2 h-px bg-[rgba(var(--border),0.7)]" />
              <div className="space-y-0.5">
                {customObjects.map((o) => (
                  <ModuleLink key={o.to} to={o.to} label={o.label} icon={iconForObject(o.label)} />
                ))}
              </div>
            </>
          ) : null}

          {isCommercial ? (
            <>
              <div className="mx-2 my-2 h-px bg-[rgba(var(--border),0.7)]" />
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                Relatórios e Painéis
              </div>
              <div className="space-y-0.5">
                <ModuleLink to="/apps/comercial/relatorios" label="Relatórios" icon={<IconReport />} />
                <ModuleLink to="/apps/comercial/dashboards" label="Dashboards" icon={<IconDashboard />} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
