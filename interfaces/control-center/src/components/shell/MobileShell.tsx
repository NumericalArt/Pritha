"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobileNavItems } from "@/lib/routes";
import { PrithaLogoPlaceholder } from "@/components/primitives/PrithaLogoPlaceholder";

export function MobileShell() {
  const pathname = usePathname();

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
      </header>
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
