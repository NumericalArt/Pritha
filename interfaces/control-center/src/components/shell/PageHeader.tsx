import { ExternalLink } from "lucide-react";
import { StatusStrip } from "./StatusStrip";

type PageHeaderProps = {
  title: string;
  subtitle: string;
  count?: number;
  variant?: "agents" | "voice" | "dev";
  showCodexButton?: boolean;
};

export function PageHeader({ title, subtitle, count, variant = "agents", showCodexButton = false }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {typeof count === "number" ? <span className="count-pill">{count}</span> : null}
        </div>
        <p className="page-kicker">{subtitle}</p>
      </div>
      <div className="header-actions">
        <StatusStrip variant={variant} agentTotal={count} />
        {showCodexButton ? (
          <button className="open-codex-button" type="button">
            Open in Codex
            <ExternalLink size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
