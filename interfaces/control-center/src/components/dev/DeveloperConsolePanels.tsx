import { AlertTriangle, CheckCircle2, CircleDashed, Hammer, MessageSquare, PackageCheck, XCircle } from "lucide-react";
import type { DeveloperBuild, DeveloperConsole } from "@/lib/control-center/dev-console";

// Times on this page are Central European, whatever the machine clock says.
const berlin = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
export function cetTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : berlin.format(date);
}

const CHECK_LABELS: Record<string, string> = {
  strictHealth: "Strict health", operationalHealth: "Operational health", desktopMobileUi: "Desktop and phone pages",
  typecheck: "Typecheck", postInstallSelfTest: "Self-test", fleet: "Fleet", finalIsolation: "Instance isolation",
};

function Mark({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 size={15} className="dev-mark ok" aria-label="pass" /> : <XCircle size={15} className="dev-mark bad" aria-label="fail" />;
}

export function ReleasePanel({ data }: { data: DeveloperConsole }) {
  const release = data.release;
  return (
    <section className="dev-panel dev-console-panel" data-testid="dev-release">
      <div className="panel-heading-row">
        <h2><PackageCheck size={17} /> Installed release</h2>
        {release ? <span className={`status-pill ${release.status === "deployed-verified" ? "alive" : "needs_check"}`}>{release.status}</span> : null}
      </div>
      {release ? (
        <>
          <dl className="dev-facts">
            <div><dt>Commit</dt><dd><code>{release.commit}</code></dd></div>
            <div><dt>Build</dt><dd><code>{release.build}</code></dd></div>
            <div><dt>Installed</dt><dd>{cetTime(release.at)}</dd></div>
            <div><dt>Rollback</dt><dd>{release.rollbackRetained && release.previousBuild ? <>kept: <code>{release.previousBuild}</code></> : "not kept"}</dd></div>
          </dl>
          <ul className="dev-checks">
            {release.checks.map((check) => (
              <li key={check.id}><Mark ok={check.status === "pass"} /> {CHECK_LABELS[check.id] || check.id}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="dev-empty">No release record yet. Releases write one to the state folder.</p>
      )}
    </section>
  );
}

function buildState(build: DeveloperBuild) {
  if (["verified", "accepted", "awaiting_acceptance"].includes(build.status)) return "done";
  if (build.status === "blocked" || build.status === "failed") return "stuck";
  if (build.status === "abandoned") return "stopped";
  return "running";
}

export function BuildsPanel({ data }: { data: DeveloperConsole }) {
  return (
    <section className="dev-panel dev-console-panel" data-testid="dev-builds">
      <div className="panel-heading-row">
        <div>
          <h2><Hammer size={17} /> Agent builds</h2>
          <p>Latest factory runs, newest first. A stuck run says why and what failed.</p>
        </div>
      </div>
      {data.builds.length ? (
        <div className="dev-build-list">
          {data.builds.map((build) => {
            const state = buildState(build);
            return (
              <article className={`dev-build ${state}`} key={build.runId}>
                <header>
                  {state === "done" ? <CheckCircle2 size={16} className="dev-mark ok" /> : state === "stuck" ? <AlertTriangle size={16} className="dev-mark warn" /> : <CircleDashed size={16} className="dev-mark" />}
                  <strong>{build.agent}</strong>
                  <span className="dev-build-status">{build.status}{build.phase && build.phase !== build.status ? ` · ${build.phase}` : ""}</span>
                  {build.chatHref ? <a className="dev-build-chat" href={build.chatHref}><MessageSquare size={14} /> Chat</a> : null}
                </header>
                <dl className="dev-facts compact">
                  <div><dt>Tokens</dt><dd>{build.tokensUsed.toLocaleString("en-US")} / {build.maxTokens.toLocaleString("en-US")}</dd></div>
                  <div><dt>Attempts</dt><dd>{build.iteration} / {build.maxIterations}</dd></div>
                  <div><dt>Builder</dt><dd>{build.builder || "—"}</dd></div>
                  <div><dt>Updated</dt><dd>{cetTime(build.updatedAt)}</dd></div>
                  {state !== "done" && build.windowEndsAt ? <div><dt>Time window</dt><dd>{build.windowEnded ? "ended " : "until "}{cetTime(build.windowEndsAt)}</dd></div> : null}
                </dl>
                {build.blocker && state === "stuck" ? <p className="dev-build-blocker"><code>{build.blocker.code}</code> {build.blocker.summary}</p> : null}
                {build.failedChecks.length ? (
                  <ul className="dev-build-failures">
                    {build.failedChecks.map((check) => <li key={check.id}><code>{check.id}</code> {check.detail}</li>)}
                  </ul>
                ) : null}
                <small className="dev-build-run">{build.runId}</small>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="dev-empty">No factory builds yet.</p>
      )}
    </section>
  );
}

export function AttentionPanel({ data }: { data: DeveloperConsole }) {
  return (
    <section className="dev-panel dev-console-panel" data-testid="dev-attention">
      <div className="panel-heading-row">
        <h2><AlertTriangle size={17} /> Agents that need you</h2>
      </div>
      {data.attention.length ? (
        <ul className="dev-attention">
          {data.attention.map((row) => <li key={row.id}><strong>{row.name}</strong> <span>{row.reason}</span></li>)}
        </ul>
      ) : (
        <p className="dev-empty">Nothing needs attention.</p>
      )}
    </section>
  );
}
