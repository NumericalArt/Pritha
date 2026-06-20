import { MobileShell } from "./MobileShell";
import { Sidebar } from "./Sidebar";
import { PrithaRealtimeProvider } from "@/components/voice/usePrithaRealtime";
import { controlCenterStatusForClient, getControlCenterStatus } from "@/lib/control-center/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const initialStatus = controlCenterStatusForClient(await getControlCenterStatus());

  return (
    <PrithaRealtimeProvider>
      <div className="app-shell">
        <Sidebar initialStatus={initialStatus} />
        <div className="content-shell">
          <MobileShell />
          <main className="app-main">{children}</main>
        </div>
      </div>
    </PrithaRealtimeProvider>
  );
}
