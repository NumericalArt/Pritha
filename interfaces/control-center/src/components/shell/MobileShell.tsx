"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, SlidersHorizontal } from "lucide-react";
import { mobileNavItems } from "@/lib/routes";
import { PrithaLogoPlaceholder } from "@/components/primitives/PrithaLogoPlaceholder";

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isVoice = pathname.startsWith("/voice") || pathname === "/";

  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <Link href="/voice" className="mobile-brand">
          <PrithaLogoPlaceholder size={46} />
          <span>
            <span className="mobile-brand-title">Pritha</span>
            <span className="mobile-brand-subtitle">Control Center</span>
          </span>
        </Link>
        <button className="mobile-header-button" type="button" aria-label={isVoice ? "Voice controls" : "Open menu"}>
          {isVoice ? <SlidersHorizontal size={20} /> : <Menu size={20} />}
        </button>
      </header>
      <main className="mobile-page">{children}</main>
      <nav className="mobile-bottom-nav" aria-label="Mobile primary">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link href={item.href} className={`mobile-nav-item ${active ? "active" : ""}`} key={item.href}>
              <span className="mobile-nav-icon">
                <Icon size={21} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
