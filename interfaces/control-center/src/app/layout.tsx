import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Pritha Control Center",
  description: "Local control center for Pritha and child agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
