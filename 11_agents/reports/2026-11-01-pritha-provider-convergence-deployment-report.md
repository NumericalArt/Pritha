---
id: pritha-provider-convergence-deployment-2026-11-01
type: agent-deployment-report
status: activated-awaiting-acceptance
created: 2026-11-01
updated: 2026-11-02
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
MacBook instances remain outside the transaction. The operator explicitly
approved activation of `15a17c1`; the managed transaction is complete and
operational health passes. Final operator acceptance remains pending.
Exact machine paths, endpoints, build IDs and recovery
receipts are private under the instance state root.

## Activated evidence — 2026-11-02, Europe/Moscow

- Managed stop confirmed the service and listener were absent before migration
  and build replacement. The current offline migration plan moved only the
  memory database name from `techscope.sqlite` to `pritha.sqlite`. SQLite
  integrity and content checks passed: 993 documents, 11009 chunks, 3196
  entities, 22182 relations and 10788 embeddings were preserved.
- The reviewed staging build replaced the retired build atomically. Managed
  start cleared the circuit breaker. Exact instance, source and build identity,
  five pages and all twelve referenced JavaScript chunks passed. Admission was
  restored to its previous enabled state with capacity three. Operational
  checks confirmed runtime, agent catalog, chat list and existing history.
- A durable private deployment receipt was written before any cleanup. Previous
  source, matching dependencies and build are retained; no recovery cleanup or
  remote publication occurred. Nine unrelated untracked files remain unchanged.
- Post-activation self-test passed with 1443/1443 unit tests, seven check groups
  and no warnings. The initial attempt found the instance Python environment
  lacked `mlx-whisper`; all other groups passed. Installing the repository-pinned
  macOS requirements in that instance's Python 3.11 environment fixed the
  dependency gate. The repeated self-test also restored semantic embeddings.
- Actual Safari checks passed for existing native history, a new isolated
  native chat, Queue/Edit/Cancel, Steer on the same active turn, Stop, a real
  synthetic text attachment, and history restoration after reload. Interrupted
  execution released its slot; the cancelled queued message did not execute.
  These are Codex-observed technical checks, not operator acceptance.
- Live voice configuration reports `gpt-realtime-2`, nine core tools and a tenth
  optional music tool. No microphone session or audio acceptance is inferred
  from reading this configuration.
- Local startup from the service exposed sensitivity to macOS background CPU
  scheduling. The private model configuration now bounds CPU threads to four,
  disables polling and optional warmup, and uses the engine's medium thread
  priority for the owned process. A live service readiness probe passed with
  this configuration. Network/file isolation and process ownership are unchanged;
  no model service or autostart was installed. Live task checks continue.

### Local follow-up awaiting staged verification

A real Local Task Chat accepted an isolated workspace and started its owned
model, but did not return a response within the bounded observation period.
Its queued follow-up was cancelled, then its exact turn was interrupted through
the supported control API. Active leases returned to zero and the model process
and ownership receipt exited. No response, queued resume or performance pass is
claimed for this attempt.

Cold startup also exposed a fixed ten-second readiness limit that could reject
an otherwise valid CPU model in the macOS service context. The follow-up raises
the bounded startup window to thirty seconds while retaining a shorter attempt
deadline, and aligns metadata/CLI probes to a forty-five-second total lease.
Slow loading gets a dedicated error instead of asking the operator to select a
different model. Real sandboxed regressions cover loading after ten seconds
and early deadline cleanup; the targeted suite passes 13/13. This source change
is not yet active in the running `15a17c1` build. The private model's smaller CPU
batch profile still needs a completed inference check.

The compact Local model is an integration fixture, not a qualified autonomous
coding backend. A protected coding pilot failed its Trials and exhausted the
bounded repair budget after 61641 observed tokens; a separate thinking attempt
ended with unknown usage and retained its fail-closed receipt. A native Codex
technical BuildExecutor pilot passed the same six immutable Trials with 19159
measured tokens and an archived test thread. Neither pilot establishes the
full voice-to-agent lifecycle or human Contract/Outcome approval.

## Prepared evidence

- Tested implementation: `6a9402cc0c1fa3ca1b3beee07e4ad06664aef053`, including
  both required additional modes. A subsequent test-only repair has a separate
  24/24 targeted gate and refreshed full unit gate. Final exact
  local commit/build identity is recorded in the private preparation receipt
  after staging is refreshed; activation must match that receipt.
- Full quality gate: all eight check groups passed, including **1443/1443** unit
  tests and zero skips. Its first refreshed run had 1437 passes and two stale
  tests: a source-extraction delimiter and the superseded factory-creation
  blocker. Both are repaired; four public factory-route checks were added.
  Historical self-test before the two additional modes: 1408/1408, no warnings.
  Targeted bootstrap repair: 13/13; instance-path CLI repair: 15/15.
- Final full browser run: **163/163**. The earlier 159/160 run and one read-only
  voice-status ECONNRESET remain recorded; no assertion or retry policy changed.
- Real production staging copied into an isolated `.next`: 5 pages and 12
  referenced JS chunks passed; all owned probe processes exited.
  An initial probe compared the full source SHA to the health contract's
  12-character SHA; its checker was corrected to the actual contract and the
  exact expected prefix verified. The original failed probe is retained.
- Synthetic credential audit **23/23** and real OS/network boundary audit **80/80**,
  zero skips. No real credentials or paid provider requests used by these audits.
- Fresh Local bootstrap passed through real dependency installation, memory,
  offline cached embeddings, search, typecheck and production build. Real owned
  llama.cpp / Qwen3 4B CPU inference, host file-tool access and same-session resume
  now pass. Minimal ZIP preparation/idempotence passed earlier.
- Canonical instance Python 3.11 is installed with requirements-core. Memory
  rebuilt to 993 documents / 11008 chunks, with 10787 offline cached embeddings.
  Frozen retrieval acceptance passes: FTS Hit@5 45/48, Hit@10 46/48, holdout
  Hit@5 23/24, regressions@10=0, private leaks=0 across FTS/semantic/hybrid.
- Private recovery contains the previous build, source archive and separately
  installed dependencies from its exact lockfile. Nine unrelated untracked files
  have recorded hashes and must remain unchanged.
- Dependency audit retains one transitive Zod advisory (two package records).
  Bounded host-authored sandbox configuration mitigations and limits are in the
  linked assessment. This is not a clean dependency audit.

## Runtime incident found during preflight

Read-only inspection found the installed service loaded but stopped, with
`circuit_open` and no listener. Logs show automatic wrapper starts followed by
`ENOENT .next/server/preview-props.json`; the old retained build was produced
with Next 16.2.11 while installed dependencies are now Next 16.4.3. This supports
a build/dependency mismatch after automatic restart. No operator stop/start was
performed by this task; the reason for the initial automatic restart is unproven.

The new matched build/dependency pair passed isolated strict health. Activation
must replace the pair coherently, clear the circuit only through the managed
start operation, then verify operational health. Rollback must use the retained
old dependencies with the old source and build. Swapping only an old `.next`
into the new dependency tree is not a valid recovery. Future dependency updates
must preserve a runnable current pair until the managed activation transaction.

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

Operator acceptance of this matrix remains pending. Native technical checks
listed above have actual Safari results; the remaining provider/audio/child
rows still require their own live evidence and relevant user participation.
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
| 6a. Claude native CLI session | Explicit sign-in through the unmodified CLI; native task/resume and guarded tools | Separate instance account, no API fallback or OAuth extraction; factory API requirement remains explicit |
| 7. OpenRouter task and resume | Own key and exact model; tool approvals and usage correct | No silent model routing or fallback |
| 8. Owned Local model | Configured command/model starts as owned process; real answer/file access succeeds offline | Remote and foreign loopback denied; process tree exits; no cloud key reads |
| 9. Agent pilot | Interview, separate contract/outcome reviews, research, scaffold, delivery and protected Trials | Selected backend, budget/cache/turns, real output and isolation; no mocked claim |
| 10. Realtime 2 | Default engine, nine tools, private Good State capture, memory and task handoff | Actual mic/speaker interaction; no spurious task for a Good State signal |
| 11. Voice continuity | Interruption, reconnect/browser restart, persistent topic, handoff recovery and decision answers | Task identity unchanged; no duplicate dispatch; music ducking and manual volume preserved |
| 12. Explicit Live and NeuralDeep Voice | Only explicitly selected engine runs; Auto preview matches configured provider | Real session, stop/reconnect; unavailable credentials remain explicit |
| 13. Voice to child workspace and factory | Correct instance/child context and selected task provider; separate Contract/Outcome approvals, research, delivery and Trials | No other instance or sibling access; observe a real factory lifecycle and pending manual acceptance |
| 14. Reviewed Brief Desk example | Own settings, offline demo, separate child artifacts and safe repeated import | No inherited parent key or Telegram send; actual sending requires its own instruction |
| 15. Branding and restart | Primary Pritha names, legacy state preserved, migrated SQLite and setup readable | Before/after document counts; health after managed restart; recovery receipt |

## Remaining limits

- Claude local CLI session authentication is implemented in `c0c2ee2`;
  external-provider voice creation is implemented with private bound artifacts,
  two separate approvals and the canonical delivery gates. Focused synthetic
  and owned-process checks, refreshed full quality, browser and boundary gates
  pass. Real provider acceptance remains required. Both modes stay in scope.
  Official [authentication](https://code.claude.com/docs/en/authentication) and
  [credential-use](https://code.claude.com/docs/en/legal-and-compliance) documentation
  was rechecked on 2026-11-01: a native session must use the unmodified CLI and
  Anthropic's own sign-in flow; Pritha must not collect or intermediate its OAuth
  credentials. The API-key proxy is not evidence that this separate lane works.
- Local uses verified [llama.cpp v0.8.0 / b11960](https://github.com/ggml-org/llama.cpp/releases/tag/b11960)
  and official [Qwen3 4B Q4_K_M](https://huggingface.co/Qwen/Qwen3-4B-GGUF/tree/bc640142c66e1fdd12af0bd68f40445458f3869b).
  Revision, byte count and SHA-256 were verified. Real CPU Responses inference,
  host read_file and same-session resume passed, with three task requests and
  complete process-tree exit. The private configuration is saved without a
  background service or changing the active task provider. Metal remains denied
  by the existing sandbox; GPU performance is not verified. The initial 0.6B
  attempt failed tool use and is not the selected configuration. Installed CLI
  reports fallback model metadata and shortened skill descriptions; explicit
  context size is pinned, and this is not cloud/provider fallback. These checks
  establish integration, not general coding quality of the compact model.
- Unsupported image formats/providers remain visibly gated, rather than silently
  dropping attachments. The verified PNG path is NeuralDeep with the pinned CLI.
- Manual microphone, provider auth, real child pilot and operator acceptance are
  pending. No Git/tag Good State baseline or publication has been performed.
