import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { TopBar } from "./TopBar";
import { SideRail } from "./SideRail";
import { AppLauncher } from "./AppLauncher";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { FooterBar } from "./FooterBar";
import { APPS } from "../apps/apps";

export function AppShell() {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isInModule = location.pathname.startsWith("/apps/");
  const currentApp = useMemo(() => {
    const match = location.pathname.match(/^\/apps\/([^/]+)/);
    if (!match) return null;
    return APPS.find((a) => a.id === match[1]) ?? null;
  }, [location.pathname]);

  return (
    <div className="h-dvh w-full overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(900px 600px at 15% 0%, rgba(var(--accent),0.25), transparent 60%), radial-gradient(900px 600px at 85% 10%, rgba(var(--accent-2),0.16), transparent 60%)",
        }}
      />

      <div className="relative flex h-full w-full flex-col">
        <TopBar
          onOpenLauncher={() => setLauncherOpen(true)}
          title={currentApp?.name ?? "Home"}
          onGoHome={() => navigate("/")}
        />

        {/* FULL WIDTH: menu sempre colado à esquerda */}
        <div
          className={[
            "grid min-h-0 flex-1 w-full grid-cols-1 gap-4 overflow-hidden px-4",
            isInModule
              ? "md:grid-cols-[258px_minmax(0,1fr)]"
              : "md:grid-cols-[72px_minmax(0,1fr)]",
          ].join(" ")}
        >
          <SideRail onOpenLauncher={() => setLauncherOpen(true)} />

          <main className="min-h-0 min-w-0 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-4 shrink-0">
                <BreadcrumbBar />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                {/* opcional: limitar só o conteúdo, sem mexer no menu */}
                <div className="h-full w-full max-w-[1200px]">
                  <Outlet />
                </div>
              </div>
            </div>
          </main>
        </div>

        <AppLauncher open={launcherOpen} onClose={() => setLauncherOpen(false)} />
        <FooterBar />
      </div>
    </div>
  );
}
