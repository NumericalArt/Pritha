import { Bot, Code2, Mic, Settings } from "lucide-react";

export const desktopNavItems = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/voice", label: "Voice", icon: Mic },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/dev", label: "Dev (Read-only)", icon: Code2 },
] as const;

export const mobileNavItems = [
  { href: "/voice", label: "Voice", icon: Mic },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
