import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import "@/styles/globals.css";

const themeInitScript = `
(() => {
  const storageKey = "pritha-control-center-theme";
  const lightThemeEnabled = false;
  const allowed = new Set(lightThemeEnabled ? ["dark", "system", "light"] : ["dark"]);
  const root = document.documentElement;

  function storedPreference() {
    try {
      const value = window.localStorage.getItem(storageKey);
      return allowed.has(value || "") ? value : "dark";
    } catch {
      return "dark";
    }
  }

  function systemTheme() {
    if (!lightThemeEnabled) return "dark";
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  const preference = storedPreference();
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === "system" ? systemTheme() : preference;
})();
`;

export const metadata: Metadata = {
  title: "Pritha Control Center",
  description: "Local control center for Pritha and child agents.",
  icons: {
    icon: "/pritha-logo.png",
    shortcut: "/pritha-logo.png",
    apple: "/pritha-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
