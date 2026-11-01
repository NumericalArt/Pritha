---
id: pritha-provider-convergence-deployment-2026-11-01
type: agent-deployment-report
status: prepared-not-activated
created: 2026-11-01
updated: 2026-11-01
topics: [provider-convergence, staged-release, manual-acceptance, recovery]
tools: [Pritha, Node.js, Next.js, Playwright, SQLite]
sources: [operator-request-2026-11-01, NumericalArt/Pritha-NeuralDeep@2ab22aeff5f1c167c86e925ec30311942b76023b]
related:
  workflows:
    - 07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md
    - 07_workflows/control-center-staged-release.md
  assessments:
    - 03_reviews/2026-11-01-provider-convergence-dependency-audit.md
supersedes: []
superseded_by: []
subject: {kind: pritha, id: pritha}
privacy: public
retention: durable
review_status: pending-manual-acceptance
confidence: medium
---

# Canonical Pritha: local activation and acceptance

This report covers only the canonical Mac mini instance. GitHub and both
MacBook instances remain outside the transaction. No production service action
has been performed. Exact machine paths, endpoints, build IDs and recovery
receipts are private under the instance state root.

## Prepared evidence

- Tested candidate baseline: `0c10dd0fd9c4dcf97489115887fc9b1023ef5e00`.
  The subsequent CLI path repair has a separate 15/15 targeted gate. Final exact
  local commit/build identity is recorded in the private preparation receipt
  after staging is refreshed; activation must match that receipt.
- Full quality gate: all eight check groups passed, including 1410/1410 unit
  tests and zero skips. Self-test: 1408/1408, no warnings/regressions. Targeted
  bootstrap repair: 13/13; subsequent instance-path CLI repair: 15/15.
- Final full browser run: **161/161**. The earlier 159/160 run and one read-only
  voice-status ECONNRESET remain recorded; no assertion or retry policy changed.
- Real production staging copied into an isolated `.next`: 5 pages and 12
  referenced JS chunks passed; all owned probe processes exited.
  An initial probe compared the full source SHA to the health contract's
  12-character SHA; its checker was corrected to the actual contract and the
  exact expected prefix verified. The original failed probe is retained.
- Synthetic credential audit 18/18 and real OS/network boundary audit 67/67,
  zero skips. No real credentials or paid provider requests used by these audits.
- Fresh Local bootstrap passed through real dependency installation, memory,
  offline cached embeddings, search, typecheck and production build. Connecting
  a real model remains pending. Minimal ZIP preparation/idempotence passed earlier.
- Private recovery contains the previous build, source archive and separately
  installed dependencies from its exact lockfile. Nine unrelated untracked files
  have recorded hashes and must remain unchanged.
- Dependency audit retains one transitive Zod advisory (two package records).
  Bounded host-authored sandbox configuration mitigations and limits are in the
  linked assessment. This is not a clean dependency audit.

## Controlled activation sequence

1. Finish remaining required implementation; record final local commit and
   staging build ID, source/provenance checks and final regression receipts.
2. Refresh managed runtime identity and execution status. Require no active or
   ambiguous owned work. Record whether admission was intentionally paused by
   the operator. A paused instance must not be silently enabled.
3. Verify private recovery materials and all unrelated-file hashes. No source
   reset, origin fast-forward or Git operation is part of activation.
4. Obtain immediate approval for this concrete managed stop / migration / build
   swap / managed start transaction. AGENTS.md requires separate lifecycle approval.
5. Stop only through `control-center-runtime.mjs stop --yes`. Verify owned
   processes stopped. Re-plan state-name migration while offline; apply only
   that current verified plan. Current preflight proposes SQLite filename only.
6. Preserve the current `.next`; atomically move the tested staging artifact
   into place. Start only through `control-center-runtime.mjs start --yes`.
7. Require strict health with exact instance/source/state, commit and build ID;
   `/codex`, `/agents`, `/voice`, `/task-chat`, `/settings` and every referenced
   same-origin JavaScript chunk must pass.
8. If admission was previously active, run execution activation with the exact
   verified build ID, then strict operational health. Preserve an intentional
   operator pause. Do not equate process startup with readiness to accept work.
9. Write a private deployment receipt before cleanup. Retain old build/source/
   dependencies until manual acceptance and recovery review are complete.

Any failed identity, chunk, admission or ownership check aborts the release.
Rollback uses the managed lifecycle and retained matching build/source/dependency
materials; never kill arbitrary port listeners, run live builds, discard work,
clear ambiguous receipts or install a watchdog. Verify recovery health before
reporting recovery. State-name migration has its own verified reverse operation.
Before any source rollback, require a clean tracked checkout and retained
candidate commit. Restore the previous Git revision without deleting the nine
untracked files; match its lockfile to the prepared previous dependencies and
build. Never label an old build on mismatched source/dependencies as recovered.

## Manual acceptance script

Each row is **pending operator execution** until an actual result is recorded.
Automated fixtures do not establish live authentication, microphone quality,
provider billing, local model compatibility or user acceptance.

| Step | Observable result required | Evidence to record |
| --- | --- | --- |
| 1. Open existing and new native Codex chats | History preserved; exact provider/model and response visible | Chat IDs privately, success/failure, no content or keys in tracked report |
| 2. During an active native turn, Queue then Edit/Cancel; attach a file | Enter queues once; Edit restores text/files; Cancel prevents execution; queue drains once | Desktop and narrow viewport; exact turn/queue states |
| 3. Native Steer and Stop | Cmd/Ctrl+Enter targets the active turn; attachments cannot steer; Stop ends owned execution | No extra queued turn or orphaned process |
| 4. Switch all configured providers and return | Per-provider model/effort/timeout preserved; only ready providers in fast selector | Existing chats keep their pinned provider/model; errors do not fall back |
| 5. NeuralDeep task and resume | Own key, selected model, limits/wallet display, text/file/verified PNG and host tools work | One bounded live task, usage/receipt, approval result |
| 6. Claude API task and resume | Own API key, exact model, guarded tools, stop/queue, billing/cache usage | No extraction of native CLI OAuth or inherited credentials |
| 7. OpenRouter task and resume | Own key and exact model; tool approvals and usage correct | No silent model routing or fallback |
| 8. Owned Local model | Configured command/model starts as owned process; real answer/file access succeeds offline | Remote and foreign loopback denied; process tree exits; no cloud key reads |
| 9. Agent pilot | Interview, separate contract/outcome reviews, research, scaffold, delivery and protected Trials | Selected backend, budget/cache/turns, real output and isolation; no mocked claim |
| 10. Realtime 2 | Default engine, nine tools, private Good State capture, memory and task handoff | Actual mic/speaker interaction; no spurious task for a Good State signal |
| 11. Voice continuity | Interruption, reconnect/browser restart, persistent topic, handoff recovery and decision answers | Task identity unchanged; no duplicate dispatch; music ducking and manual volume preserved |
| 12. Explicit Live and NeuralDeep Voice | Only explicitly selected engine runs; Auto preview matches configured provider | Real session, stop/reconnect; unavailable credentials remain explicit |
| 13. Voice to child workspace and factory | Correct instance/child context and selected task provider; separate creation approvals | No other instance or sibling access; unresolved creation mode remains pending |
| 14. Reviewed Brief Desk example | Own settings, offline demo, separate child artifacts and safe repeated import | No inherited parent key or Telegram send; actual sending requires its own instruction |
| 15. Branding and restart | Primary Pritha names, legacy state preserved, migrated SQLite and setup readable | Before/after document counts; health after managed restart; recovery receipt |

## Remaining limits

- Claude local CLI session authentication and external-provider voice creation
  are not yet implemented. The operator explicitly chose to finish both in this
  task. Claude API and five factory build executors already exist.
  Official [authentication](https://code.claude.com/docs/en/authentication) and
  [credential-use](https://code.claude.com/docs/en/legal-and-compliance) documentation
  was rechecked on 2026-11-01: a native session must use the unmodified CLI and
  Anthropic's own sign-in flow; Pritha must not collect or intermediate its OAuth
  credentials. The API-key proxy is not evidence that this separate lane works.
- No real local engine/model is installed for this acceptance run; its selection
  and live proof are pending. Synthetic owned-model tests passed.
- Unsupported image formats/providers remain visibly gated, rather than silently
  dropping attachments. The verified PNG path is NeuralDeep with the pinned CLI.
- Manual microphone, provider auth, real child pilot and operator acceptance are
  pending. No Git/tag Good State baseline or publication has been performed.
