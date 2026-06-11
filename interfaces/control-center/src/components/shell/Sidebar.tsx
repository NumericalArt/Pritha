"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCode } from "lucide-react";
import { desktopNavItems } from "@/lib/routes";
import { PrithaLogoPlaceholder } from "@/components/primitives/PrithaLogoPlaceholder";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <PrithaLogoPlaceholder size={52} />
        <div>
          <div className="brand-title">Pritha</div>
          <div className="brand-subtitle">Control Center</div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {desktopNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/agents" && pathname.startsWith(item.href));
          return (
            <Link href={item.href} className={`nav-item ${active ? "active" : ""}`} key={item.href}>
              <span className="nav-icon">
                <Icon size={20} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="language-toggle" aria-label="Interface language">
        <button className="active" type="button">
          EN
        </button>
        <button type="button">RU</button>
      </div>

      <div className="access-card">
        <h2>Access</h2>
        <div className="access-status">
          <span className="dot green" />
          <span>LAN</span>
          <span className="connected-pill">Connected</span>
        </div>
        <p>http://192.168.1.50:3000</p>
        <button className="secondary-button" type="button">
          Show QR for Voice
          <QrCode size={15} />
        </button>
      </div>

      <div className="sidebar-version">
        <div>Pritha v0.3.0</div>
        <div>
          Uptime 2h 13m <span className="dot green" />
        </div>
      </div>
    </aside>
  );
}
