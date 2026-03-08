import { Outlet, useNavigate } from "react-router-dom";
import { TopBar } from "../shell/TopBar";
import { FooterBar } from "../shell/FooterBar";
import { SettingsNav } from "./SettingsNav";

export function SettingsLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <TopBar
        title="Configurações"
        onOpenLauncher={() => navigate("/")}
        onGoHome={() => navigate("/")}
      />

      <div className="flex min-h-0 flex-1 w-full overflow-hidden">
        <aside className="min-h-0 w-[320px] shrink-0 border-r border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
          <div className="h-full overflow-y-auto p-3">
            <SettingsNav />
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
          <Outlet />
        </main>
      </div>

      <FooterBar />
    </div>
  );
}
