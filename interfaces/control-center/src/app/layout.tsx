import type { Metadata } from "next";
import Script from "next/script";
import { AppShell } from "@/components/shell/AppShell";
import "@/styles/globals.css";
import { themeInitScript } from "@/lib/theme";
import { ThemeSync } from "@/components/shell/ThemeSync";

// AppShell reads the current instance's private status. Never bake that state
// into a release artifact or require a live memory database during compilation.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pritha Control Center",
  description: "Local control center for Pritha and child agents.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/pritha-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="pritha-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeSync />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
