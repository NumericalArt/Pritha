import { Bot, Mic, Orbit, UsersRound } from "lucide-react";
import type { ComponentType } from "react";

type Segment = {
  icon: ComponentType<{ size?: number }>;
  title: string;
  value: string;
  valueTone?: "ready" | "connected" | "off";
  dot?: "green" | "orange" | "red";
};

export function StatusStrip({ variant = "agents", agentTotal }: { variant?: "agents" | "voice" | "dev"; agentTotal?: number }) {
  const baseSegments: Segment[] = [
    { icon: Bot, title: "Pritha", value: "Ready", valueTone: "ready", dot: "green" },
    variant === "agents"
      ? { icon: Mic, title: "Voice", value: "Off", valueTone: "off" }
      : { icon: Bot, title: "Codex", value: "Planned", valueTone: "off" },
    { icon: Orbit, title: "Proactivity", value: "Off", valueTone: "off" },
  ];
  const segments: Segment[] =
    variant === "dev"
      ? [
          baseSegments[0],
          baseSegments[1],
          { icon: Mic, title: "Voice", value: "Off", valueTone: "off" },
          baseSegments[2],
        ]
      : variant === "agents"
        ? [...baseSegments, { icon: UsersRound, title: "Agents", value: typeof agentTotal === "number" ? `${agentTotal} total` : "From registry", valueTone: "off" }]
        : baseSegments;

  return (
    <div className="status-strip" aria-label="Pritha status">
      {segments.map((segment) => {
        const Icon = segment.icon;
        return (
          <div className="status-segment" key={`${segment.title}-${segment.value}`}>
            <span className="status-icon">
              <Icon size={18} />
            </span>
            <span>
              <span className="status-label">
                {segment.title}
                {segment.dot ? <span className={`dot ${segment.dot}`} /> : null}
              </span>
              <span className={`status-value ${segment.valueTone || ""}`}>{segment.value}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
