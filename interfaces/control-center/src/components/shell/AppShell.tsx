import { MobileShell } from "./MobileShell";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="desktop-shell">
        <Sidebar />
        <main className="desktop-main">{children}</main>
      </div>
      <MobileShell>{children}</MobileShell>
    </>
  );
}
