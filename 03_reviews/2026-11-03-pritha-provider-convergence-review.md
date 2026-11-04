---
id: pritha-provider-convergence-review-2026-11-03
type: review
status: blocked
created: 2026-11-03
updated: 2026-11-04
topics: [pritha, provider-convergence, curated-memory, task-chat, voice, agent-factory, rebranding]
tools: [Codex, NeuralDeep, Claude Code, OpenRouter, llama.cpp, SQLite, Node.js, Next.js, Playwright]
agent_platforms: [Pritha]
model_context: [provider-bound-per-task]
runtime_environment: [macOS, local-development, managed-control-center]
config_surfaces: [provider-presets, voice-engine, instance-state-root]
portability: adapter-needed
sources:
  - operator-provider-convergence-request-2026-11-01
  - operator-mac-mini-manual-voice-acceptance-2026-11-03
  - https://github.com/NumericalArt/Pritha-NeuralDeep/tree/2ab22aeff5f1c167c86e925ec30311942b76023b
  - 03_reviews/2026-11-01-provider-convergence-source-inventory.json
  - 03_reviews/2026-11-01-provider-convergence-r1-inventory.json
  - 03_reviews/2026-11-01-provider-convergence-r4-adoption.json
  - 03_reviews/2026-11-01-provider-convergence-factory-history.json
  - 03_reviews/2026-11-02-provider-convergence-local-change-map.json
related:
  workflows:
    - 07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md
    - 07_workflows/control-center-staged-release.md
    - docs/claude-connection.md
  reviews:
    - 03_reviews/2026-11-02-provider-auth-onboarding-review.md
    - 03_reviews/2026-11-01-provider-convergence-dependency-audit.md
  reports:
    - 11_agents/reports/2026-11-01-pritha-provider-convergence-deployment-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-11-01
source_updated: 2026-11-04
source_version: installed ee5987b; unified factory implementation under verification
retrieved: 2026-11-04
verified: 2026-11-04
valid_for: the local executable candidate and recorded operator acceptance only
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, governance, agent-building-knowledge]
subject: {kind: pritha, id: pritha}
privacy: public
retention: durable
review_status: agent-creation-user-acceptance-failed
confidence: high
---

# Provider convergence: component evidence and failed agent-creation acceptance

## Current acceptance status — 2026-11-04

The operator rejected the agent-creation journey as unusable. Successful
component checks and earlier Voice acceptance do not establish a working
factory. The installed release is `ee5987b`; `aabdda1` is a prepared, uninstalled
candidate. The actual Voice Word Counter pilot has an accepted Contract but no
created project or completed build. Its separately approved Outcome has not yet
been applied to factory state. The newest native Voice attempt started Codex
but supplied a conflicting child path and requested an unavailable factory tool.

Checkpoint 65 records the bounded native handoff correction and the remaining
workflow gaps. These changes do not demonstrate full creation or recovery.
Final acceptance requires the actual user journey without ad hoc operator
repairs to internal state. Previous evidence below is historical and remains
useful only for the components and versions it tested.

## Component snapshot — 2026-11-03

The canonical Mac mini implementation now supports five task connectors while
preserving native Codex history, the October curated knowledge and the existing
Voice tools. The current installed release is `73aafb5`, build
`q6BhRZGywaiSeiVjqaTJX`, with the approved Interactive managed-service profile.
Its exact approved transaction and post-activation memory/HTTPS checks passed.
The full gate was 1515/1515 with 33 fixture browser cases and two additional
actual-catalog Claude composer cases. Native Claude image initial/resume also
passed after normal sign-in. The earlier ff33d8f was withdrawn and never installed.
A further operator-requested shared Task Chat / Voice default refinement is in
preparation; it is not installed and needs its own consolidated checks and
immediate lifecycle approval. The overall goal remains incomplete until the
remaining user journeys and final acceptance below are demonstrated.

All three supplied technical specifications remain verbatim in the roadmap.
Their architecture was reviewed before execution: work targets canonical Pritha,
NeuralDeep is a read-only exact-pin source, and no GitHub or MacBook rollout is
included. Original filenames that described a proposed implementation are mapped
to the actual shared modules and tests below.

## Requirement and evidence map

| Source requirement | Implementation or evidence | Current conclusion |
| --- | --- | --- |
| A §0 source direction and preservation | Source/R1 inventories, Git diff from `e1c00eb`, three verbatim roadmap appendices | Canonical changed locally; NeuralDeep GitHub source inspected at exact pin |
| A §1.1 Curated FTS v2 and portable Python | `pritha_memory_retrieval.py`, `memory-retrieve.py`, `curated-memory.mjs`, `python-runtime.mjs`; curated retrieval/bridge tests | Implemented; lexical path remains independent of ML imports |
| A §1.2 factory passage research and deadlines | `pattern-research.mjs`, host evidence preparation, factory research/deadline tests | Function-level adoption with durable evidence |
| A §1.3 October knowledge and workflows | R1 path/blob inventory, frozen corpus, original knowledge files | Preserved; no duplicate fork corpus |
| A §1.4 immutable retrieval evaluation | SHA `b6e60c6559288cce982770c64e4065f0645a54b4a45b6b724b9fe4d2dce89118`, retrieval/bridge tests | FTS 45/48 at 5, 46/48 at 10, holdout 23/24; no leaks/regressions |
| A §2.1 resolution and no provider fallback | `provider-profile.mjs`, typed bridge, profile/preset tests | Five connector IDs; explicit/environment/instance/setup precedence; invalid configuration fails |
| A §2.2 facade, drivers and history | `driver-types.ts`, `gateway.ts`, native/external drivers, `provider-chat-registry.mjs` | Provider/model/session bindings and native canonical history preserved |
| A §2.2 both UI feature sets | Composer, annotation, quotes, pagination, typed subject/phase and capacity UI; browser fixtures | Automated behavior verified; operator composer gate remains |
| A §2.3 shared Voice and Settings | `core/voice-tools-dispatcher.ts`, OpenAI hook/Live session, NeuralDeep transport, shared Voice contexts | Separate transport boundaries and shared tools; full legacy runtime is not rewritten |
| A §3.1 UTF-8 and ASCII scratch | `provider-process-environment.mjs`, temporary-directory helper, environment tests | Locale, bounded private scratch and clean child environment verified |
| A §3.2 model capability/output/recovery | Provider model services, build executors, exact model/session checks | Recovery pins the previous model and does not launch a new inference |
| A §3.3 host preparation/from-brief | Factory evidence/research gates, init-from-brief and enum diagnostics tests | Not-applicable research and durable bounded preparation verified |
| A §4 bootstrap/distribution/demo | `bootstrap.mjs`, `distribution-instance.mjs`, `install-brief-desk.mjs`, reviewed example | Profiles implemented; local import/edit/reimport technically verified |
| A execution checklist/audits/review | Full gate, scoped boundary audit commands, this review and local change map | Automated gate complete; final activation/operator acceptance open |
| B §0 three Claude layers | `claude-code-runner.mjs`, `ClaudeCodeBuildExecutor`, thin Messages child client | Task CLI, budgeted build and child API kept distinct |
| B §1 API/native auth and foreign secrets | Host credential boundary, native auth module, clean environment, native/Keychain tests | API and native sign-in independent; OAuth remains inside official CLI |
| B §2.1 launch and resume | Reviewed CLI flags, supervised process trees, exact session proofs | CLI 2.1.296 real sandbox/MCP initial and resume exercised |
| B §2.2 protocol, tool pairs and usage | `claude/stream-state.mjs`, parser/owned-runner/budget tests | Paired receipts, interrupted/unknown effects and cache-token accounting verified |
| B §2.3 roots and decisions | Host MCP tools, durable approvals, OS sandbox and protected-path tests | Approved command capability replaces reliance on a blocking hook alone |
| B §3 build probe/execute/recover | Shared build executors, immutable Trials, measured ledger and recovery tests | Actual Claude CLI child pilot accepted and applied; UI journey remains separate |
| B §4 driver/catalog/voice/CLAUDE.md | Claude driver, live catalog, Voice task bridge, root `CLAUDE.md` | Implemented; existing chats preserve native connector and selected auth mode |
| B §5 SDK | October experiment plus actual SDK/MCP live receipt | Tested CLI/SDK versions and live SDK result retained |
| B §5.4 UI child lifecycle | Explicit factory subject, phases, host factory tools and protected build controls | Real Voice → Claude UI journey remains open; CLI pilot does not prove it |
| C §1 exactly five connectors | Provider schema/facade and five driver families | Codex, NeuralDeep, Claude, OpenRouter, Local |
| C §1.1 OpenRouter health/models/child | Compatible runtime, account/catalog probes, child API and explicit provisioning | Automated verified; live acceptance explicitly deferred by operator |
| C §1.2 Local offline runtime | Loopback endpoint policy, owned llama.cpp process, egress sandbox and actual 4B test | Offline process and file/resume verified; compact-model quality caveat below |
| C §2 independent native panels/presets | Provider Settings and revision-aware presets; provider selector tests | Per-provider model/effort/timeout preserved; ready-only new-chat selector |
| C §3 Realtime default, explicit Live, Auto | Voice settings, engine routing, immutable session context and browser protocol tests | Realtime 2 accepted by operator; explicit Live/ND manual gates remain |
| C §4 available composer and Queue | `TaskChatControls`, provider runtime queues, idempotency/revision tests | All five connectors covered by desktop/mobile browser fixtures |
| C §4 Steer, Edit, Cancel, Stop | `task-chat-steer-queue.spec.ts`, native control and ownership tests | Steer uses exact turn; attachments retained; occupied draft not overwritten |
| C §5 combined acceptance | Unit/browser/provider tests and remaining manual script | Automated gate passes; not a substitute for operator acceptance |
| D Pritha naming migration | Root/state/memory/setup helpers, migration and compatibility tests | Primary Pritha names; tested legacy readers and conflict rejection retained |
| Later Claude image report | Chat-bound immutable MCP images and API original-byte restoration | Actual API and native image initial/resume pass |
| Later NeuralDeep microphone meter | Exact GitHub Voice page/hook blobs and shared existing-stream meter | RMS/mute/stop/reconnect browser checks pass; no second microphone request |

## Proposed names and actual modules

Eight literal proposed paths from the supplied specifications have reviewed
replacements. Existing files and matching source globs account for the remaining
53 of 61 unique path references. This accounts for naming; behavior still needs
the tests and live/manual evidence listed above.

| Proposed file | Actual equivalent | Reason |
| --- | --- | --- |
| `03_reviews/YYYY-MM-DD-pritha-neuraldeep-convergence-review.md` | This dated canonical convergence review | Transfer direction follows the user's canonical-only instruction |
| `drivers/claude-code-driver.ts` | `drivers/claude-driver.ts` | One provider-owned driver under the shared interface |
| `settings/anthropic-credentials.ts` | `settings/provider-credentials.ts`, `scripts/lib/provider-credential.mjs` | Shared instance credential boundary with Claude isolation |
| `settings/openrouter-credentials.ts` | The same shared credential boundary and provider Settings API | Provider IDs select the credential; no copied provider-specific storage |
| `scripts/claude-pre-tool-guard.mjs` | `provider-host-tools.mjs`, `provider-sandbox.mjs`, durable approvals | Host tools and OS enforcement cover effects and protected paths |
| `scripts/embed-memory-neuraldeep.mjs` | `scripts/embed-memory.py`, `python-runtime.mjs` | One portable instance interpreter and embedding implementation |
| `tests/claude-code-runner.test.mjs` | `claude-stream-state.test.mjs`, `claude-owned-runner.test.mjs`, native/proxy tests | Protocol, ownership, credentials and permissions have separate fixtures |
| `tests/task-chat-steer-and-queue.test.mjs` | `provider-task-runtime.test.mjs`, `task-chat-steer-queue.spec.ts` | Durable backend and rendered composer verified at their own boundaries |

## Verified executable base and subsequent alias correction

The following results belong to the preliminary executable base
`ff33d8fec1bbf11b7c23e7e9857ac36dbbca0636`. Its replacement must carry its own
consolidated verification receipt before activation:

- Full quality gate: **1514/1514** tests, all eight groups pass, zero skipped,
  cancelled or failed. This includes memory validation/rebuild, strict privacy,
  smoke, unit tests, Agents Mother and the Telegram dry run.
- Production staging build and independent TypeScript check pass with complete
  supervised process exit.
- The same production build passes **21/21** selected browser cases, including
  desktop/mobile Voice, native Claude onboarding UI, credential feedback and
  immutable attachment storage. The broader existing composer/selector matrix
  remains covered by its separate recorded acceptance; the 21 cases alone do
  not prove every UI feature.
- Strict candidate health passes five pages including `/codex` and all twelve
  referenced same-origin JavaScript chunks. Exact source/build identity checked.
- The installed `5f38f37` build passes an isolated rollback probe: five pages,
  twelve chunks, exact release identity and complete probe process exit. Existing
  Interactive profiles are backed up byte-for-byte; no profile migration is needed.
- Candidate isolated memory rebuilt/embedded offline. FTS remains 45/48 at 5 and
  46/48 at 10; semantic 31/48 and 35/48; hybrid 41/48 and 45/48. The fixture is
  unchanged; holdout and private-leak gates show no regression or leak.
- The explicitly named boundary audit CLI commands also pass on this candidate:
  `audit-neuraldeep-secret-leaks.mjs --connector all`: 26/26;
  `audit-neuraldeep-runtime-network.mjs --connector all`: 87/87. Their scope is
  offline synthetic credentials and real sandbox behavior; no live key scan is
  claimed. These are additional scoped receipts, not additional unique unit tests.

A failed first production-build probe lacked generated VAD files because a Git
archive excludes generated assets. Its two NeuralDeep failures are retained.
The corrected private probe prepares assets from locked local dependencies and
passes all 21 cases. Installed and candidate VAD manifests and all four file hashes
already match. No executable source was changed to obtain that result.

## Live evidence and its limits

- Claude API: real synthetic file/continuation and later image/continuation pass.
  A 2400×1400 synthetic image contained a code absent from the prompt. Initial
  read used the actual MCP tool; the same session recalled it with zero tools.
  Image check usage was 9491 + 7339 observed tokens. Original files stayed intact.
- Stock Claude CLI: synthetic-upstream PNG/JPEG/GIF/WebP initial/resume, including
  a large screenshot, verify exact original bytes at the API boundary without
  paid inference. CLI resizing is repaired only for this chat's verified
  `read_file` attachment URI, before token counting or budget reservation.
- Native Claude: real file/continuation and fresh-instance sign-in already passed.
  A later image attempt first failed for an expired OAuth session with zero
  observed tokens. After normal sign-in, actual image/read_file and same-session
  resume passed 2/2 with 18,926 observed tokens and complete owned process exit.
- NeuralDeep: actual file tool and continuation passed with exact model identity.
  Model prelude quarantine and measured accounting remain in place. Browser VAD,
  host receipts and engine selection are tested. A later finite real component
  check synthesizes a Russian phrase with Serena and Whisper recognizes it
  verbatim. A bounded voice-dialogue request returns the expected marker with
  exact `qwen3.6-35b-a3b-noreason` identity and 45 observed tokens. TTS/STT token
  billing is unknown, not zero. Browser/session/tool-routing and operator audio
  remain separate acceptance gates.
- Local: the same compact Qwen3 4B and CPU configuration completed a compiled
  file/read/continuation check with an explicit explanation of the inline text
  result. An earlier general prompt produced tool-shaped JSON rather than the
  answer; its failure is retained. This is a real model-quality limitation and
  not proof of general coding capability. Owned inference/CLI process trees exited.
- Child CLI pilot: measured 83335/90000 tokens and five iterations, independent
  verifier preserved, operator accepted and separately approved application of
  README/CLI. The applied child checkout is `98c3805`. It has no background service.
- Operator Voice acceptance on installed 5f38f37: Realtime 2 memory fact, README,
  interruption, same-topic reconnect, music ducking and volume restoration.

Private run receipts contain exact machine-specific recovery paths and session
identities. Public source maps contain file identities and safe provenance only.
No actual endpoint, tailnet, Keychain contents or credential is published here.

## Architecture and trade-offs

The selected design keeps a shared host protocol and provider-owned execution,
state and history. This adds adapter modules and version-specific checks, while
preserving canonical native capabilities. A bulk fork replacement would require
revalidating history, coordination and the October knowledge independently.

Model tool permissions are enforced by host capabilities and the OS sandbox.
API keys stay on the host. Official native Claude alone receives the scoped
configuration and Keychain access needed for its own login; model tools do not.
Opaque native TLS prevents host reservation of every request, so native mode is
not used for a factory build requiring a reserved token budget. Unknown process,
request or effect outcomes remain unknown and are not retried automatically.

Primary public naming is Pritha. Historical roots, setup/database readers and
versioned protocol markers remain in a bounded compatibility layer. Removing
those readers immediately would break existing state, so migration has explicit
conflict detection, offline execution, recovery copies and tests.

The compact Local engine demonstrates offline wiring with bounded resource use.
Its reasoning quality and latency remain different from the configured frontier
provider. Users can select another compatible local model without changing the
connector contract; this review does not recommend an untested model.

## Current factory recovery evidence (2026-11-04)

Installed 27890e2 passes managed activation, strict pages/chunks, operational
health, task admission and full self-test. Its release checks passed 1572 unit
tests and 68 browser scenarios. Both previously approved Claude pilot documents
are now accepted through the ordinary factory and product approval API, preserving
exact reviewed content and the original 40000-token/two-iteration/30-minute build
limits. No build has started and no factory state was repaired by hand.

Real research exposed irrelevant advisory patterns becoming mandatory headless
CLI dependencies and missing authorities for canonical pattern topics. The next
candidate narrows CLI research to selected requirements and supplies bounded
primary-source mappings, without accepting unknown sources. Native Codex created
and reviewed a real draft through the shared factory. Its runtime service-tier
preview and actionable brief validation are corrected in the candidate.

NeuralDeep returned a different terminal model for the configured Qwen request;
that mismatch remains blocked. A separate real candidate transport probe of
GPT OSS 120B passes after recognizing its exact publisher-qualified terminal ID.
This is not evidence that an arbitrary model alias is interchangeable, and the
saved user default remains unchanged. The UI now explains model mismatch instead
of reporting only a generic provider error.

## Required steps before final handoff

1. Verify and install the consolidated follow-up through the managed workflow,
   with rollback to installed 27890e2 and exact immediate lifecycle approval.
2. Continue the existing approved Claude factory through corrected research,
   scaffold, measured delivery and independent protected Trials. Preserve its
   identity, accepted documents and original build limits.
3. Complete real Codex and NeuralDeep factory delivery and the Voice/Task Chat
   continuation matrix. New contracts/outcomes need initial separate approvals;
   accepted documents must not ask again. No internal-state repair counts as a
   passing product journey.
4. Complete operator acceptance and separate application of verified child files;
   record remaining composer controls, explicit Live, NeuralDeep audio and Brief
   Desk acceptance. OpenRouter remains explicitly deferred.
5. Reconcile source/build/deployment and memory receipts with the roadmap. Working
   drafts, passing transport probes and automated tests do not establish finished
   agents or final user acceptance. The complete goal is not achieved yet.

This review records verified evidence without authorizing any service transaction.
The alias correction adds a regression test that fails before the fix and passes
after it; twelve provider-selector browser cases pass, including first-message
images on desktop/mobile. The immutable existing thread binding remains first
priority, and a read-only preview does not rewrite the saved alias preset.
