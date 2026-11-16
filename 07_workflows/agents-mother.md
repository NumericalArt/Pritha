---
id: agents-mother
type: workflow
status: experimental
created: 2026-05-18
updated: 2026-11-15
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - codex
tools:
  - Codex
  - AGENTS.md
  - Telegram
  - CLI
  - OpenAI Agents SDK
  - OpenAI Realtime API
  - gpt-realtime-2
  - Pritha
  - A2A Protocol
sources:
  - 03_reviews/2026-05-18-techscope-agents-mother-scenario-review.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-environment-compatibility.md
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-26-funny-teacher-agent-user-interaction-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  - 04_standards/agent-runtime-placement.md
  - 04_standards/agent-harness-evaluation.md
  - 04_standards/agent-team-operating-model.md
  - 04_standards/agent-skill-pack-lifecycle.md
  - 04_standards/agent-mcp-connector-lifecycle.md
  - 04_standards/agent-a2a-interoperability.md
  - 04_standards/agent-ai-safe-security-checklist.md
  - 01_sources/registries/github-agent-building-repos.md
  - 01_sources/signals/2026-06-28-open-source-agent-building-repos-signal.md
  - 03_reviews/2026-06-28-open-source-agent-building-repos-review.md
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
  - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
  - 07_workflows/agent-sensor-and-eval-design.md
  - 05_decisions/2026-10-21-curated-retrieval-promotion.md
  - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
related:
  decisions:
    - 05_decisions/2026-10-21-curated-retrieval-promotion.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-a2a-interoperability.md
    - 04_standards/agent-ai-safe-security-checklist.md
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
  templates:
    - 08_templates/agent-project-contract.md
    - 08_templates/agent-outcome-spec.md
    - 08_templates/agent-scaffold-report.md
    - 08_templates/agent-delivery-report.md
    - 08_templates/github-source-registry-entry.md
  workflows:
    - 07_workflows/agents-mother-roadmap.md
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
    - 07_workflows/agent-skill-pack-selection.md
    - 07_workflows/agent-mcp-connector-selection.md
    - 07_workflows/agent-a2a-communication-selection.md
    - 07_workflows/agent-sensor-and-eval-design.md
supersedes: []
superseded_by: []
---

# Workflow: agents-mother / Pritha

Status: experimental

## Goal

Use Pritha as an outcome-driven agent factory: jointly define the desired
product, design its architecture, build it to executable acceptance evidence,
and hand off a working agent from a user request.

Pritha is the public alias and product name for this layer. Existing `agents-mother` paths and artifact types remain valid for compatibility; new user-facing CLI/docs should prefer Pritha vocabulary.

The default v1 target is a production-testable sibling project. The first
implementation path is `codex-native + optional interface adapters`.

FESPA26 is the first successful external agent captured in this lifecycle. It is
not a template to copy blindly, but it provides the first evidence-backed event
and reportage agent pattern: `event material -> source memory -> Codex
processing -> reviewed feed card -> explicit publication`. Its current voice
architecture also upgrades the reusable voice-control pattern to `Realtime
dispatcher + deterministic server tools + Codex App/thread transport + Codex
CLI/queue fallback`.

Funny Teacher is the first successful language-learning voice agent. It adds
evidence for `Realtime teacher + durable SQLite lesson memory + semantic
retrieval + explicit selected-memory-focus/reset controls`.

Funny Teacher is also the canonical Pritha feedback-loop example: the useful
agent shape emerged through user corrections, mobile testing, memory UX
questions, idempotency fixes and version fixation, not from the initial scaffold
alone. Use `11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md`
when comparing a future voice or learning agent against proven lineage evidence.

## Core rule

For a new supported local API child in Task Chat, use the model-led route:

1. Read factory status, then `propose` the behavior, examples and bounded build
   limits. The host records the creation request and its own document decisions;
   the standard route asks no Contract or Outcome confirmation questions.
2. Read the saved memory research. Consult primary sources for concrete
   uncertainties when useful, then `research_decide` with the implementation
   rationale and remaining unknowns. A fixed external-topic checklist is not a
   prerequisite to local construction.
3. Let the factory scaffold, build, test and repair. Repeated failing assertions
   go to the builder with an instruction to reconsider its approach. They do not
   create an operator question merely because a counter reached a threshold.
4. Present the checked local agent with its first-use instructions, observed
   output and any unverified requirements. Explain whether model testing used a
   local responder or the real selected provider. Invite use and improvements.

The creation request survives a repairable draft. Correcting a Contract keeps
its product examples and lets the host resume preparation; it does not silently
switch the session to the reviewed workflow. A profile outside the local scope
still requires its actual user reviews. Proposals explicitly choose the child
API provider and model, independently of the builder, or choose deterministic
behavior. Missing model fields must not silently become a model-free agent.

New research reports pin their topic derivation. Use selected runtime and
interface choices; a local application does not imply local inference, and
retrieved patterns cannot add an unselected Telegram interface or service.
Existing reports retain their original topic derivation and evidence locks.

This route is host-bound, local, without repository adoption or autostart. Model
connections use existing Pritha credentials. It retains budgets, process
ownership, protected verifiers and unrelated-work protection. Requests to change
those boundaries require a real decision. The host never records a user vote
that did not happen. See
[the model-led creation decision](../05_decisions/2026-11-13-model-led-local-agent-creation.md).

The following detailed reviewed workflow remains applicable to older sessions
and profiles outside that scope.


Do not scaffold a new agent directly from a vague idea. First turn the idea into
a concrete proposal, then create two separately approved and locked artifacts:
an `agent-contract` for the architecture and an `agent-outcome-spec` for the
observable final result. Validate them against Pritha memory and current
sources, compile the Outcome Spec into executable Trials, and continue through
the bounded delivery loop until the Trials pass for a committed revision or a
typed blocker requires a user decision. A scaffold is an intermediate result,
not the completion condition. The low-level compatibility scaffold may still
run from an accepted contract before Outcome approval, but it must report the
missing lifecycle gate and cannot be presented as delivered. A draft contract
may be scaffolded only with an explicit experimental
`--allow-draft-scaffold` override.

For Voice Control and Predictive Voice Control creation tasks, a visible Agents
card is part of the minimum successful outcome. The card can show explicit
runtime blockers, but creation is not complete while the agent is missing from
`11_agents/registry.md` or the Control Center Agents model.

## Workflow

1. Capture the request as an intake or direct thread brief.
2. Run a proposal-first product interview. Pritha first synthesizes a concrete
   candidate and asks only about choices that materially change the result:
   - final user-visible result and primary user;
   - observable done conditions;
   - main interface and first end-to-end journey;
   - core v1 outcomes and deliberately excluded outcomes;
   - sensitive data, consequential actions and approval boundaries.
   Routine technical choices are filled by Pritha as an editable architecture
   proposal: runtime family and placement, team mode, memory, tools, skills,
   MCP/A2A, isolation, interface implementation, Git/repository research,
   operations and test strategy. Ask a follow-up only when uncertainty changes
   product behavior, material cost, privacy/security, an irreversible action or
   an external dependency. Creation, improvement, fixing and harness evolution
   are the same class of agent-development task and need the same quality of
   brief.
3. Create an `agent-contract` from `08_templates/agent-project-contract.md`.
   In Task Chat, inspect `factory_step` action `scaffold_plan` while the contract
   is still a draft. The Contract approval card shows the scaffold capability,
   build provider/model and separately selected child provider/model. Unsupported
   runtime/interface combinations stop before the approval card. The API process
   adapter supports primary web/API plus an optional secondary CLI. The structured
   brief accepts `secondaryInterfaces`, `cliEntrypoint` (a separate `scripts/*.mjs`
   entrypoint for this adapter), `childModelProvider` and `childModelId`.
3a. Create an `agent-outcome-spec` from
    `08_templates/agent-outcome-spec.md`. It must describe the final experience,
    observable success, deliverables, non-goals and Trial blocks. Validate its
    coverage, approve it independently from the contract, record host-side
    approval evidence, lock its content and compile it to `trial-plan.json` in
    `PRITHA_STATE_ROOT`.
   For an API process product, use `factory_step` action `prepare_product_trial`
   with the current draft Outcome's `expected_sha256` and a `trial` object before
   asking for Outcome approval. The HTTP case declares Node `argv`, the contract's
   `port_variable`, POST `path`, `input_json` and `expected_json`. A selected CLI
   also requires its exact `argv` and `expected_json`. The host prepares a bounded
   verifier under private `trial-inputs/verification/`, updates the draft Trials
   and includes the verifier's complete content and hash in the Outcome approval
   card. Preparation executes no command. Scaffold includes only the approved
   bytes in its Git baseline. Structural smoke alone cannot approve an API product.
   Bind lifecycle requirements using `trial.host_checks`, whose `model_connection`,
   `managed_start` and `managed_stop` arrays name the relevant `requiredCoverage`
   IDs. These bind protected host checks; ordinary HTTP/CLI `covers` cannot claim
   lifecycle evidence. For a Pritha-connected model the verifier also starts the
   server without a connection, requires working health and an explicit product
   service error, and checks Managed Start connection forwarding. The independent
   Stop verifier proves ownership and repeated Stop without model credentials.
   The host checks do not add product example cases or change the Contract.
   Draft approval verifies both the original verifier bytes and their coverage
   binding. Previously approved Outcomes keep their original evidence locks.
   Local responder Trials prove model integration, not live provider quality;
   their receipt explicitly retains `liveModelVerified: false`.
4. Create a reusable `agent-pattern-pack` in instance-local
   `<PRITHA_STATE_ROOT>/agents/research/`, or gitignored
   `.private/agents/research/` when no external state root is configured.
   Tracked `11_agents/` remains shared reference history.
   The pack must combine FTS search, domain-routed memory search and an
   attempted semantic/embedding search:
   - first, `agent-building-knowledge` for standards, workflows and reusable
     architecture patterns;
   - second, `pritha-self` for current capabilities and limitations;
   - third, `child-agents` for comparable lifecycle evidence and successful
     patterns, not templates to copy;
   - optionally, `user-model` local-private preferences only when available and
     permitted.
   The `agent-building-knowledge` factory branch uses accepted curated FTS v2,
   as recorded in
   [the current retrieval decision](../05_decisions/2026-10-21-curated-retrieval-promotion.md).
   The manual read-only entry point is
   `node scripts/query-memory.mjs curated "<query>"`. A scoped manual query for
   Pritha capabilities is
   `python3 scripts/memory-retrieve.py "<query>" --domain pritha-self --json`.
   This decision does not migrate generic memory or the other factory domain
   branches. Curated queries exclude child/private/sibling paths and historical
   statuses by default; permitted child evidence is researched separately.
   Semantic/hybrid remain explicitly selected alternatives with the cached
   model, not the default for the curated agent-building branch. The pattern
   pack still records the attempted semantic search. Report missing/stale
   capability rather than downloading a model or declaring success.
   Search hits are candidates: read the source section, status, version and
   applicable decision before drawing a conclusion. Generated wiki is a
   navigation layer, not evidence or approval for adoption.
   Select SDK/runtime using
   `02_briefs/2026-10-21-agent-backend-selection.md` and verify volatile pins.
   If semantic/embedding search is unavailable, stale or fails, continue with a
   warning, record the status in the pattern pack, and append the failure to
   `<PRITHA_STATE_ROOT>/private/agents-mother/semantic-memory-failures.jsonl`
   for later repair; the legacy fallback without an external state root is
   `.private/agents-mother/semantic-memory-failures.jsonl`.
5. Derive external research topics from both the contract and the selected
   pattern-pack seeds. Verify volatile architecture choices through current
   primary sources and trusted secondary sources.
   When the contract or pattern pack implies an external harness, memory/RAG
   layer, eval/security component, MCP/tool server, external skill source or
   declared dependency, run contract-aware GitHub repository research:
   - apply `Repository research policy`: `auto`, `required`, `registry-only` or
     `not-applicable`; `not-applicable` requires a recorded waiver reason;
   - derive only the relevant scopes: `agent-harness`, `agent-memory`,
     `agent-evals`, `mcp-tools`, `agent-skills`, `agent-interface`,
     `agent-voice` and/or `agent-operations`;
   - search the curated
     `01_sources/registries/github-agent-building-repos.md` first;
   - in `auto` or `online` mode, augment registry matches with bounded GitHub API
     discovery; default to five candidates and never exceed ten per research run;
   - merge and deduplicate candidates into the research report without mutating
     the registry;
   - preserve all explicitly selected repositories within a hard maximum of ten,
     even when the requested shortlist limit is lower;
   - treat the shortlist as advisory-only. Discovery must not clone, install,
     execute, vendor, link, activate or trust repository code.
   For `reference-only`, require current `github-repository-review` evidence for
   every exact canonical repository. For `selected-module` v1, require exactly
   one directory module verified as a tree at the immutable pin plus module-local
   license evidence bound to that pin. Treat GitHub HEAD license metadata as
   advisory only.
   If no volatile external choice or repository-relevant scope is present,
   record why that verification is not needed.
6. Record an architecture recommendation:
   - selected runtime family;
   - selected interface adapters;
   - interface experience profile, user controls, state model, rendering trust
     boundary and fallback;
   - UI framework choice and message/state contract when a web/workflow UI is
     selected;
   - raster asset purpose, generation path, prompt/spec, format/size policy,
     alt/fallback, privacy boundary and readiness check when a raster visual
     asset layer is selected;
   - 3D renderer/framework, scene state contract, asset policy, performance
     target and fallback when a 3D visual layer is selected;
   - Codex account/rate-limit telemetry mode, bucket/field display and privacy
     boundary when an app-server-backed UI is selected;
   - harness evaluation plan when a non-Codex or local-model harness is being considered;
   - harness inventory;
   - sensor and feedback design: critical completion verifier, pre-action
     controls, in-loop budgets/non-progress detection, post-action read-back,
     eval integrity, balanced metrics and human judgment boundaries;
   - security and permission model;
   - AI-SAFE layer review status for selected modules;
   - untrusted-input risk tier and scanner/quarantine path;
   - skill candidates, trust/risk score and activation decision;
   - MCP connector candidates, auth/readiness state, toolset scope and activation decision;
   - GitHub repository shortlist, research status and adoption mode;
   - for every selected repository module: canonical repository, exact
     verified commit/tree SHA, safe repository-relative directory path and
     module tree SHA; module-local LICENSE/manifest source URL, Git blob SHA,
     content SHA-256, detected SPDX and `license_scope: module-local`; compatible
     license decision; security and permission review,
     contract-specific eval result, current `github-repository-review` evidence,
     completed synthesis and explicit user approval;
   - testing and observability model.
7. Mark the contract `accepted` before scaffold. Separately approve the Outcome
   Spec before autonomous delivery, and verify both content locks immediately
   before use. A compatibility scaffold created before Outcome approval remains
   an intermediate artifact only.
   If `Repository adoption mode` is `selected-module`, keep scaffold blocked until
   the repository research is current and the selected-module gates above are
   complete. `candidate`, `accepted-for-review` and `reference-only` never grant
   runtime or vendoring permission.
8. Scaffold the new agent in a sibling folder unless the contract explicitly
   chooses another location. Embed contract/Outcome lineage in the generated
   child, but keep approval evidence and live delivery state outside the child
   repository. When `Build Git mode` is `disposable-worktree`, initialize a
   local repository and clean scaffold baseline commit without adding a remote,
   pushing or bypassing hooks.
9. Generate minimum project files:
   - `AGENTS.md` or runtime-native equivalent;
   - `README.md`;
   - `.env.example`;
   - workflow notes;
   - scripts or app entrypoints;
   - skill pack manifest, candidates and audit/status command;
   - MCP manifest, candidates and status command when MCP is selected;
   - smoke test or healthcheck;
   - user training guide.
10. If Telegram is selected, include a Telegram adapter profile:
   - one-user or multi-user mode;
   - queue for incoming updates;
   - text/link/media handling policy;
   - concise human-readable replies;
   - processing log;
   - token and user id only through environment variables.
11. Run the compiled Trials once before a build attempt. Use this as independent
    baseline evidence, not as a prompt-authored claim.
12. Create a `scaffold-report` from `08_templates/agent-scaffold-report.md`.
13. Start delivery in a clean disposable Git worktree and a single-writer run
    ledger. Refuse to use a dirty active target checkout because Pritha cannot
    safely distinguish user changes from build changes.
14. Repeat until verified or blocked:
    - run the immutable Trial plan through the selected portable backend;
    - give only bounded failure evidence and the locked goal to the build
      executor;
    - reject protected-spec/verifier mutation, stale evidence, symlink escapes,
      non-progress, repeated failure and budget overruns;
    - commit a green checkpoint on `pritha/build-*` without bypassing hooks;
    - rerun every Trial against that exact commit.
15. Create an `agent-delivery-report` at every typed blocker and at final
    verification. Redact absolute paths and keep the live ledger exclusively in
    runtime state. Every non-terminal ledger state must contain exactly one
    `next_action` or a non-empty typed blocker list.
16. Move a fully verified result to `awaiting_acceptance`. Only the user may
    transition it to `accepted`; Pritha must not push, merge, deploy or publish
    during delivery.
17. Rebuild the Pritha child-agent registry and run
    `node scripts/pritha.mjs card-readiness <agent-slug>`. If the status is
    `missing`, treat the creation task as blocked. If the status is `blocked`,
    report the card blockers and next operator tasks; do not hide the card
    behind unfinished runtime work.
18. After the first meaningful accepted version, create an
    `agent-post-creation-review` and record the interaction path: initial prompt,
    clarifications, user feedback, failed assumptions and product decisions
    discovered during the build.
19. Rebuild Pritha memory indexes so the contract, Outcome Spec and lifecycle
    reports become searchable.

## Current commands

```sh
node scripts/pritha.mjs questions
node scripts/pritha.mjs init --name "agent-name" --mission "mission"
node scripts/pritha.mjs outcome init 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs outcome validate 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/pritha.mjs outcome revise 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/pritha.mjs outcome approve 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --approved-by user
node scripts/pritha.mjs outcome compile 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/pritha.mjs create --name "agent-name" --mission "mission"
node scripts/pritha.mjs research 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --github-mode auto --github-limit 5
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs skills status
node scripts/pritha.mjs skills select 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs skills audit ../existing-or-generated-agent
node scripts/pritha.mjs test ../existing-or-generated-agent
node scripts/pritha.mjs publish ../existing-or-generated-agent
node scripts/pritha.mjs lineage
node scripts/pritha.mjs registry
node scripts/pritha.mjs card-readiness agent-name
node scripts/pritha.mjs trial run 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --project ../agent-name
node scripts/pritha.mjs deliver 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --project ../agent-name
node scripts/pritha.mjs delivery status <run-id>
node scripts/pritha.mjs delivery resume <run-id> --answer <option-id>
node scripts/pritha.mjs delivery accept <run-id> --accepted-by user

# Compatibility aliases retained for v0.1:
node scripts/agents-mother.mjs questions
node scripts/agents-mother.mjs interview
node scripts/agents-mother.mjs init --name "agent-name" --mission "mission"
node scripts/agents-mother.mjs outcome init 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs outcome validate 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/agents-mother.mjs outcome revise 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/agents-mother.mjs outcome approve 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --approved-by user
node scripts/agents-mother.mjs research 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs scaffold 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs test ../existing-or-generated-agent
node scripts/agents-mother.mjs handoff ../existing-or-generated-agent
node scripts/agents-mother.mjs operations ../existing-or-generated-agent
node scripts/agents-mother.mjs deploy ../existing-or-generated-agent plan
node scripts/agents-mother.mjs evolve ../existing-or-generated-agent --notes "lessons"
node scripts/agents-mother.mjs registry
node scripts/agents-mother.mjs card-readiness agent-name
node scripts/agents-mother.mjs deliver 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --project ../agent-name
node scripts/agents-mother.mjs delivery status <run-id>
node scripts/agents-mother.mjs delivery resume <run-id> --answer <option-id>
node scripts/agents-mother.mjs delivery accept <run-id> --accepted-by user
node scripts/agents-mother.mjs validate 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs list
```

Fresh generated contracts use `Target folder: sibling of Pritha`; scaffold
resolves that logical default through `PRITHA_AGENT_PARENT`. An explicit
contract path or `--output` remains an intentional override. Subsequent lifecycle
commands should use the actual scaffold path printed by Pritha rather than assume
the legacy `../agent-name` layout in an isolated instance.

Repository-research flags for `research`:

- `--github-mode auto|online|registry-only|skip`: `auto` is the normal
  registry-first path and performs bounded online discovery only for derived
  repository scopes; `online` requests online augmentation when contract policy
  permits it;
  `registry-only` disables network discovery; `skip` records a failed/pending
  result when repository research is required.
- `--github-limit <1..10>`: requested merged shortlist size; default `5`.
  Explicit contract selections raise the effective limit so none is silently
  dropped, while the hard maximum remains ten.
- `--github-timeout-ms <1000..60000>`: per GitHub request timeout; default
  `15000`. The full online discovery pass also has a 45-second fail-closed
  deadline so several unavailable scopes cannot block the workflow indefinitely.
- `--github-fixture <json>`: deterministic test/development input only. Fixture
  metadata remains untrusted and never counts as approval to adopt a module.

Invalid policy or mode values must fail before network access. Do not silently
fall back to `auto`. Policy `not-applicable` is invalid with every adoption mode
except `none`, including `reference-only`.

These flags control discovery, not adoption. The command only writes the
contract-specific research and pattern-pack artifacts; it does not alter the
curated GitHub registry.

Experimental scaffold overrides:

```sh
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --allow-draft-scaffold
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --allow-missing-research
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --allow-pending-external-verification
```

Use these only for explicit experiments, not production descendant readiness.

## Voice Control transport

When the request comes through Pritha Voice Control, child-agent creation and
evolution still use the same Codex task path as a Codex thread. Do not downgrade
voice tasks to read-only just because the transport is voice.

Risky actions are held at a UI decision gate before execution:

- service install/uninstall;
- scheduler, cron, launchd, heartbeat or queue-watcher enablement;
- deployment, publish, release or GitHub push;
- deletion or destructive migration;
- credential or secret writes;
- `danger-full-access` sandbox.

The task card must show Approve and Reject. Approve starts the saved Codex task;
Reject records a terminal rejection. Secret values must be entered through the
child-agent credential UI or local `.env` flow, not spoken into the Realtime
session.

## Pritha lineage vocabulary

- Seed: the user-facing specification for a new agent; technically this remains an `agent-contract`.
- Descendant: a generated child agent project.
- Lineage: the contract, scaffold report, test reports, handoff, operations and post-creation review chain.
- Traits: reusable capabilities and harness patterns proven by lifecycle evidence.
- Inheritance: base safety, memory, tool and operating rules carried into a descendant.
- Mutation: adaptation of inherited rules to the user's specific task and runtime.
- Trial: testing/evaluation before handoff or release.

Do not rename frontmatter `type` values, directories or memory schema as part of Pritha v0.1. The rebrand is a compatibility alias and narrative layer first.

## Default scaffold profile

- Location: sibling folder next to TechScope.
- Runtime: Codex-native project scaffold.
- Interface: project folder and instructions; Telegram optional if selected in the contract.
- Interface adapters: `interfaces/manifest.json`, `interfaces/README.md`, per-adapter notes and `scripts/interface-status.mjs`.
- Memory profile: `memory/manifest.json`, `memory/README.md` and `scripts/memory-status.mjs`.
- Tool profile: `tools/manifest.json`, `tools/README.md` and `scripts/tools-status.mjs`.
- Source of truth: Markdown plus runtime-specific files.
- Memory: start with local Markdown; add database/vector/graph layers only when the contract requires them.
- Safety: no copied secrets, no hidden long-running services, no deployment without explicit confirmation.

## Telegram decision point

Telegram is an interface adapter, not a mandatory property of every agent.

When Telegram is requested, decide whether it is:

- primary chat interface;
- intake/media upload channel;
- notification channel only;
- operator control channel;
- out of scope for v1.

Telegram-enabled agents must include an explicit queue and completion-status replies. User-facing bot responses should summarize the useful result, not expose internal file churn unless requested.

Current scaffold behavior:

- CLI/local status adapter is always generated for maintenance and smoke tests.
- Telegram files are generated only when `Telegram mode` is not `none`.
- Web/API/custom interfaces receive documented placeholders until a dedicated runtime layer is implemented.
- Telegram scaffold includes queue directories, dry-run polling, queue processing and healthcheck commands.

## Memory and tool profiles

Generated agents receive explicit memory and tool manifests:

- `minimal-markdown`: notes only;
- `markdown-first`: notes and decisions;
- `markdown-sqlite`: Markdown plus rebuildable SQLite placeholder;
- `markdown-embeddings`: Markdown plus index and embeddings placeholders;
- `external-or-specialized`: documented external/vector/graph integration placeholder.

Tool profiles are selected from the contract and can include `cli-script`, `workflow`, `mcp-api`, `browser-manual` and `telegram-adapter`.

MCP is an optional connector module, not a default property of every descendant.
When selected, use `04_standards/agent-mcp-connector-lifecycle.md` and
`07_workflows/agent-mcp-connector-selection.md`. External MCP servers should be
recommended, reviewed, scoped and marked for readiness; they should not be
installed silently or exposed with broad toolsets.

A2A is an optional peer-agent communication module, not a default property of
every descendant. When selected, use
`04_standards/agent-a2a-interoperability.md` and
`07_workflows/agent-a2a-communication-selection.md`. A2A should expose only
selected Agent Skills through an adapter layer, with private/direct discovery by
default for sibling agents, explicit trust registry, untrusted-input handling,
auth policy and readiness checks.

## Runtime Placement Decision Point

Every non-trivial agent must decide where each class of inference work runs.
Use:

```text
04_standards/agent-runtime-placement.md
```

Default placement heuristic:

- use deterministic code/scripts for validation, indexing, file movement and
  repeatable non-language work;
- use frontier hosted models or Codex for workflow discovery, coding, complex
  planning, architecture and high-risk analysis;
- use smaller hosted models for bounded structured tasks when local operation is
  not worth the maintenance;
- use local open-weight models for stable, repeated, privacy-sensitive or
  high-volume tasks after eval examples prove quality.

The contract should record task routes, provider fallbacks, budget policy,
privacy routing rules, eval fixtures and route healthchecks. Local inference is
not "free" by default: hardware, power, model quality, operations, fallback and
security costs must be explicit.

Multi-model routing is not mandatory complexity. Add it when the user asks to
use different models for different tasks, or when cost, privacy, latency, risk or
quality requirements make it necessary. Concrete model names, prices and quotas
are only date-stamped candidates; the reusable rule is the placement principle,
and current official docs must be rechecked before scaffold or deployment.

## GitHub Repository Research Decision Point

Repository research is a scoped part of the existing child-agent research gate,
not a package installer. Use it when a contract or pattern-pack seed creates a
real choice among external harness, memory, eval/security or MCP/tool modules.

The contract records:

- `Repository research policy`: `auto`, `required`, `registry-only` or
  `not-applicable`;
- `Repository research topics`: any of `agent-harness`, `agent-memory`,
  `agent-evals`, `mcp-tools`, `agent-skills`, `agent-interface`, `agent-voice`
  and `agent-operations`;
- `Repository research waiver reason` when policy is `not-applicable`;
- `Repository adoption mode`: `none`, `reference-only` or `selected-module`;
- selected repository/module and, for `selected-module`, the exact pin, license
  decision, security review, permission boundary, eval status and user approval.

Unknown scopes and a sentinel mixed with explicit scopes are contract errors and
must fail before any GitHub request without reflecting the raw rejected value.

The generated research review records these machine-readable fields:

```yaml
repository_research_required: true | false
repository_research_policy: auto | required | registry-only | not-applicable
repository_research_mode: auto | online | registry-only | skip
repository_research_status: complete | pending | not-applicable | failed
repository_research_completed_at: ISO-8601 | pending
repository_research_online_status: complete | fixture | failed | registry-only | skipped | not-applicable
repository_research_lock: sha256:... | pending | not-applicable
repository_candidate_count: 0
repository_adoption_status: none | reference-only | pending-review
repository_research_scopes:
  - agent-harness | agent-memory | agent-evals | mcp-tools | agent-skills | agent-interface | agent-voice | agent-operations | not-applicable
external_evidence_count: 0
external_evidence_topics: []
external_research_lock: sha256:... | pending
synthesis_lock: sha256:... | pending
research_content_lock: sha256:... | pending
```

The final synthesis must classify each relationship to current Pritha memory as
`confirms`, `refines`, `contradicts` or `makes-outdated`. Candidate discovery
may complete while adoption remains blocked: a shortlist proves only that
research ran. It does not prove license compatibility, code safety, permissions,
runtime fit or quality.

When repository adoption mode is `reference-only` or `selected-module`, the
locked synthesis payload must also contain
`repository_adoption_recommendation: proceed | hold | reject`. This enum, not
free-form architecture prose, controls scaffold authorization: `proceed` makes
an otherwise complete gate eligible, `hold` keeps it pending, and `reject`
makes the overall gate failed while preserving the completed research record.

For `reference-only`, current external evidence must use adoption decision
`reference-only` and bind to every exact selected canonical repository. Each
authorizing review must pass freshness independently; topic-level coverage from
another review cannot make a stale repository review current.

For a selected module, recheck current repository metadata and primary files,
then select exactly one public repository in the v1 contract. The module must be
a safe repository-relative directory verified as a Git tree at the immutable
commit/tree pin; a file/blob module is not accepted. Verify a module-local
LICENSE or supported manifest under that directory at the same pin and record
its exact GitHub blob URL, Git blob SHA, SHA-256 content identity, safely detected
SPDX and `license_scope: module-local`. A root-only license and GitHub current-HEAD
license metadata are advisory and cannot close this gate. Also record scripts
and dependency-manifest inspection, network/filesystem/secrets permissions,
prompt-injection/supply-chain review, contract-specific evals and explicit user
approval. The external evidence must include a valid
`github-repository-review` topic, and the evidence-to-memory synthesis must be
complete. Until every selected-module field is complete, keep the module
candidate-only and the production scaffold gate pending.
The evidence item must match the contract's canonical repository, module,
immutable pin, license decision, exact permission set, passing eval and explicit
approval; evidence for a different repository cannot close the gate.

Retrieval time alone does not establish freshness. Current evidence must provide
source publication/update dates, or substantive `version_context` and
`temporal_compatibility` plus locked
`temporal_compatibility_status: compatible | incompatible | unknown` when those
dates are unavailable. Only `compatible` may satisfy the version-based freshness
fallback. External narrative is
untrusted: redact sensitive values and quarantine instruction-like content before
coverage or synthesis. `repository_research_lock`, `external_research_lock`,
`synthesis_lock` and the full-document `research_content_lock` must all verify;
the repository payload additionally binds the visible rendered GitHub section.
The generated selected-module manifest must additionally remain a bounded
non-symlink regular file and match its generated SHA-256 plus the verified
`repository_research_lock` during child smoke/health checks.

## Harness Evaluation Decision Point

If a contract considers OpenCode, Pi, Hermes, OpenClaw or another external
harness instead of the Codex-native default, apply:

```text
04_standards/agent-harness-evaluation.md
```

The research step should define a small project-relevant eval pack before
choosing the harness. Exact public benchmark rankings are treated as temporal
evidence, not as a standing rule.

## Sensor and Feedback Design Decision Point

For every non-trivial new agent or material harness change, apply:

```text
04_standards/agent-feedback-sensors-and-evaluation-loops.md
07_workflows/agent-sensor-and-eval-design.md
```

Before accepting the contract, require an explicit sensor map. It must prove
completion from fresh durable state, prevent consequential invalid actions
before tool execution, bound repeated or stalled loops, verify critical side
effects after execution, protect evaluator integrity and name the remaining
human judgment boundary. Small local/manual agents may mark production or
periodic sensors not applicable with reasons, but cannot waive completion
verification, permission checks or bounded execution.

## Agent Team Decision Point

If the user wants one agent to cover multiple durable domains, or if the project
has separate roles, schedules, memories, notification streams or long-running
workers, apply:

```text
04_standards/agent-team-operating-model.md
```

Default is still one focused agent. Split into coordinator/specialists/workers
only when it reduces context/tool sprawl or matches real user workflows.

## Untrusted Input Decision Point

If a new agent reads external messages, email, websites, media transcripts,
uploads, screenshots, repository text or other user-forwarded media, apply:

```text
04_standards/agent-untrusted-input-security.md
```

The contract must explicitly choose:

- external sources that can reach the agent;
- whether raw content can reach the model context;
- whether raw content can update memory;
- per-item token/media/job budget caps;
- quarantine conditions;
- human approval gates;
- scanner model or deterministic validation layer;
- sensitive data that must be excluded from context.

External content must not directly select tools, mutate memory, spend budget or
send/publish data without passing through the chosen intake/security boundary.

## AI-SAFE Security Review Decision Point

For every non-trivial child agent, apply:

```text
04_standards/agent-ai-safe-security-checklist.md
```

The contract should record a layer-by-layer security profile:

- interface/input-output controls;
- reasoning and planning controls;
- knowledge, memory and RAG controls;
- execution, tool, MCP and skill controls;
- infrastructure, operations, scheduling and multi-agent controls.

Use `minimal` only for small local/manual agents with no external input, no
durable memory, no privileged tools, no deployment and no proactivity. Selected
but unready layers must be marked `selected-pending`, `selected-blocked` or
`unknown`, not silently treated as ready.

## Voice Agent Decision Point

If the user wants a voice interface, do not treat the Realtime model as the whole
agent. Start from the active standard:

```text
04_standards/realtime-voice-control-for-codex-agents.md
```

Default voice architecture candidate:

- Realtime model: low-latency speech, concise answers and tool-call dispatch.
- Server tools: deterministic validation, state changes, queueing and approval
  gates.
- Codex App/thread transport: preferred foreground route for complex tasks that
  need Codex context and structured output.
- Codex CLI/queue fallback: worker or fallback route for synthesis,
  verification, media/file work, code changes and background jobs.
- Durable memory: explicit local or external state chosen by the contract.

The contract must still decide:

- whether voice is the primary interface or one adapter among several;
- which model is used for Realtime;
- what tools the voice model can call;
- which actions require confirmation;
- whether heavy work goes through Codex App/thread, contract-file handoff,
  Codex CLI, queue worker, synchronous tools or is disabled;
- how transcripts and media are retained.

## Existing project inspection

Agents Mother can be pointed at an existing project folder. It must classify the folder before proposing changes:

- `techscope-generated-agent`: manifests and generated markers are present;
- `agent-project`: an instruction surface such as `AGENTS.md`, `CLAUDE.md` or `GEMINI.md` exists;
- `project-with-agent-signals`: some adapter/script signals exist, but the harness is incomplete;
- `project-without-agent-harness`: no meaningful agent harness found.

For existing projects, do not modify files during `test`. Create an `agent-test-report` and use it to discuss whether to add an agent contract or improve the existing harness.

## Handoff

Use `handoff` after scaffold or project inspection to create a user-facing operation guide. The handoff report should explain:

- how to start and test the agent;
- which secrets must be configured in `.env`;
- what is ready now;
- what is not ready or risky;
- the first user exercise;
- which layer should be improved next.

## Operations and service readiness

Generated agents must make service behavior explicit even when they are not services yet:

- `operations/manifest.json` records deployment target, deployment profile, service mode, autostart mode, proactivity model, start/stop commands, healthcheck and log path.
- `scripts/operations-status.mjs` prints the current operations profile.
- `scripts/deploy-service.mjs` automates deployment plan, status, install and uninstall.
- `launchd` support is generated only as a template when the contract selects `launchd` or `launchd-on-approval`.
- Scaffold, test, handoff and operations inspection must not start long-running processes or install autostart.
- Autostart is configurable, not globally forbidden: use `disabled` by default, then `optional`, `launchd-on-approval` or `external` only after the user explicitly chooses it.
- Deployment mutations require `--yes` and produce an `agent-deployment-report`.
- Before scaffold, ask where the agent will actually be deployed: local Mac, Mac mini, VPS, cloud, embedded/user device, external runtime or nowhere yet.
- Before scaffold, ask whether the agent should be proactive: none/manual, scheduled chrono/cron, heartbeat/pulse, event-driven webhook, queue watcher or hybrid.
- If any proactive mode other than `none` or `manual` is selected, apply
  `04_standards/agent-proactivity-scheduling.md`: record scheduler owner,
  schedule/timezone, concurrency policy, missed-run policy, retry/backoff,
  memory write policy, monitoring, alert channel and kill switch before
  scaffold marks operations ready.
- Do not add a background pulse, queue watcher, scheduler or notification loop unless the contract explicitly selects it.

Use:

```sh
node scripts/agents-mother.mjs operations <agent-path>
node scripts/agents-mother.mjs deploy <agent-path> plan
node scripts/agents-mother.mjs deploy <agent-path> status
node scripts/agents-mother.mjs deploy <agent-path> install --yes
node scripts/agents-mother.mjs deploy <agent-path> uninstall --yes
```

This creates `agent-operations-report` and `agent-deployment-report` artifacts in `11_agents/reports/`.

## Feedback and evolution

After an agent has lifecycle evidence, create a post-creation review and update the registry:

```sh
node scripts/agents-mother.mjs evolve <agent-path> --notes "what changed after real use"
node scripts/agents-mother.mjs registry
```

For a concrete improvement request, create an agent-development task brief
before implementation:

```sh
node scripts/pritha.mjs improve <agent-path> --task "describe the desired change"
```

This writes a development task and a pattern pack, then Codex App/CLI can use
that brief to implement the smallest verified change after required
current-source enrichment.

The post-creation review must separate:

- useful scaffold patterns;
- failed assumptions;
- reusable standard candidates;
- outdated or risky patterns.

For every agent that reaches a meaningful working version, also preserve the
interaction path with the user. This can be a dedicated
`agent-user-interaction-review`-style report using `type:
agent-post-creation-review`, or a clearly labeled section inside the
post-creation review for small agents. It must capture:

- the initial user request;
- clarifying prompts and answers;
- important user corrections;
- UX/product decisions discovered during real testing;
- assumptions that changed;
- reusable interaction patterns for future Agents Mother runs.

Do not promote a pattern into `04_standards/` from one lucky run. Promotion needs evidence from lifecycle reports and an explicit review/decision.

The realtime voice-control standard is active as of 2026-05-29 because FESPA26
and Funny Teacher confirm the shared boundary in two domains. Keep it
version-bound: recheck when Realtime APIs, Codex App transport or Codex CLI
sandbox behavior changes.

## Local HTTP/CLI factory and its approval boundary

A direct creation request in an empty Task Chat (for example “Создай агента…”
or “Create a local agent…”) opens the normal proposal workflow. A new name is
chosen if none is supplied. The operator's explicit workspace/subject choice
takes precedence. Text in attachments or an existing conversation cannot
silently acquire a new child workspace.

For a new API/process child the host checks the requested interfaces before
Contract review. The Outcome card shows different inputs and expected values
for each required interface. The real CLI and the product endpoint must pass;
health, a constant response, and scaffold creation do not demonstrate delivery.
Changing the Outcome or its protected verifier invalidates that review.
Previously approved documents keep their original locks and limitations.

For a new local API/process child, prefer `factory_propose` (or native
`factory_step` with `action: propose`). The model supplies a complete brief,
product input/output examples and proposed build limits in one request. Examples
refer to one-based `brief.coreFunctions` indexes. Pritha supplies entrypoints,
port variables, coverage IDs, protected verifiers and exact document hashes.
It validates interface support, product examples and coverage before presenting
the Contract. A malformed example leaves the same private draft available for
correction; it does not allocate another child or ask the operator to repair JSON.

With automatic continuation enabled, the controller presents the Contract card,
then prepares and presents the separate Outcome card. It never accepts either
decision itself. The model then reads the collected source passages and submits
its applicability synthesis through `research_apply`; this is model work, not
another operator confirmation. The existing controller proceeds through
scaffold, product Trials, builder repair and verified local application.
`factory_continue` resumes the saved phase and exact decisions after an
interrupted preparation turn. Accepted documents, measured usage, Stop and
decline retain their ordinary boundaries. It cannot turn an unknown execution
into a safe retry or extend an approved budget.

Stop, a timeout or a host restart can end a build step before its worker writes
a receipt. The next message in that chat lets `factory_continue` release the
step once the earlier process has provably exited, and the same delivery run
resumes from its ledger; no second build starts. If the stopped request never
reported its usage, it is charged at the amount the host reserved for it. A
build that Pritha leads herself does this without a separate answer (user
decision of 2026-11-15); a reviewed or custom build pauses and offers it as
`count-reserved`, which needs the user's approval. Document, research and scaffold steps are
not released this way.

A NeuralDeep builder never inherits an effort it does not document. The chat's
level becomes the strongest documented level that does not exceed it, so a
preset saved for another model never stops the build for an approval.

Sometimes the latest builder turns ended before finishing and the same checks
failed again. At the next budget pause, factory status and the budget card both
say so. Pritha then tells the user before suggesting more budget. On NeuralDeep
she offers `configure_build_model`, which runs the same build with a stronger
builder model. All options, including more budget, remain the user's decision.

At a budget pause, factory status also lists the fields an extension must
carry. For example, `add_elapsed_ms` is required once the run's time window
has ended. A refused extension returns the same list. Nothing is requested
until every required field is present, and Pritha does not report an
extension before the tool confirms it.

When a Trial whose verifier comes from a host template fails, the builder's
failure list carries Pritha's description of what that verifier expects. For
managed Stop, the description is in `scripts/agents-mother/host-trial-guidance.mjs`,
and new API children get the same text in AGENTS.md.

After the build, `factory_improve` changes how the agent behaves until the user
accepts it. It takes the complete revised product examples and a short note;
the accepted Contract, and with it the name, interfaces, port, model connection
and limits, stays as it is. The host prepares a successor Outcome and its
verifier, builds in a separate worktree on top of the applied version and
fast-forwards the project only when the revised Trials pass. Until then the
card shows and serves the applied version and names the pending build. A
running agent is stopped by the user before the revision is applied; `finish`
then applies it without a rebuild. See the 2026-11-14 and 2026-11-15 sections of
`05_decisions/2026-11-13-model-led-local-agent-creation.md`.

This route supports deterministic API children and Pritha-connected LLM children
with no repository adoption or autostart. Existing factories and custom runtimes
retain the lower-level tools. An explicit `write_draft` or `patch_draft` transfers
the unapproved proposal back to that custom workflow, so the controller cannot
overwrite the edited document. Changing a proposal's brief or limits requires
that normal revision path; correcting product examples before Outcome approval
keeps the original Contract and its decision.

The planner normally only reports its next step. When the operator enables
`PRITHA_FACTORY_CONTINUATION=execute` on the selected instance, the Contract
card identifies eligible local API children and explains the automatic build.
The host checks the reviewed Contract, including any draft corrections.
Approval records the profile for a supported API process with either no child
model or an explicitly selected Pritha model connection, no repository adoption,
and no autostart. Existing approvals retain their recorded
scope. Contract and Outcome are two separate operator decisions. Inside the
same execution owner, the host can collect approved primary sources, request
source-based synthesis, scaffold, run the approved Trials, commission the
pinned builder on a repairable failure, and prepare the verified first use.
One foreground session owns the work. Reading progress never resumes it.
Stop, decline, uncertain execution or usage, and exhausted budgets stay
effective after reload. A budget change is a separate exact decision.

The result identifies the tested worktree and commit and shows the first-use
form and observed output when the protected evidence still matches it. The
approved local-application profile can apply that verified commit to the new
child checkout; the agent card then offers **Try this agent**. The form uses the
approved product endpoint and checks the running process identity before sending
input. **Start agent and send** is one explicit operator action; merely opening
the card starts no process or inference. Final acceptance and service startup
remain separate from verification. A
blocked management card must be identified even when product Trials pass.

Contract and Outcome cards persist across a provider timeout or runtime restart.
An exact document decision is stored on the host and can resume the same factory
conversation without a second approval. Changed document bytes require a new
decision. This persistence applies only to those two document actions, never to
arbitrary command approvals or credential provisioning.

### Child model connection

The builder and the child's model are separate Contract selections. Codex,
Claude Code, and NeuralDeep builders can generate a child using any supported
configured API connection. Builder subscriptions do not supply child API keys.
Before Contract review the host verifies the managed API/process adapter and
reports whether the selected connection is configured in this Pritha instance.
This metadata check makes no inference and does not establish paid access.

For `childModelConnection: pritha`, provider credentials stay on the host. A card
Start issues a random, agent-scoped local token bound to the accepted Contract,
project, provider, model and output limit. The child receives only that connection
and a restricted process environment. Stop and a failed Start revoke it. The
new connection profile proposes 8,192 output tokens and allows up to three
minutes per model request during stabilization; a smaller explicit Contract
limit remains binding. These are ceilings, not requested answer lengths.
The local broker checks the current binding before each request; redirects, silent
model substitutions and ambiguous automatic retries are not allowed. Input,
output and provider keys are not recorded in its usage receipt. Other instances
and legacy child-owned credentials retain their existing scope.

The protected LLM product Trial pins the generated client and configuration. For
each input it supplies a fresh response through a local model responder and
requires the product output to contain that fresh value. A constant offline
answer cannot pass. The verifier checks the input sent to the model, call count,
configured limits and selected error cases; starting the server must not call
the model. The real Start command also runs up to an intercepted spawn boundary:
it must launch its own Node server and forward the scoped model connection and
port. This check creates no detached server; the independent product and Stop
Trials exercise the server with owned process handles. The UI labels these as
local connection/behavior verification, not a
live model result. The operator's first submitted request exercises the actual
selected API and exposes provider errors without repeating the request.

The worker and the production Control Center must use identical original client
source bytes for this proof. Keep their shared asset URLs literal so the
production bundler preserves each file. The isolated production E2E suite loads
the compiled approval host and checks worker-prepared Outcomes for all three
builders, including the five distinct client hashes and scaffold contents.
Source-only tests do not establish this compatibility.

The child configuration supports OpenAI, Anthropic, NeuralDeep and OpenRouter.
The OpenAI text client uses Chat Completions with `store: false` and
`max_completion_tokens`; the documented `gpt-4.1-mini` snapshot is the only
OpenAI alias accepted by this profile. Sources checked 2026-11-11:
[API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
and [model reference](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

A possible future delegated profile needs separate policy adoption. Record
its ID, version, signer, expiry and revocation, allowed new-child directory
and build worktree, pinned connector and model allowlist, token/iteration/time
limits, research sources, protected Trials, required isolation, and whether
application to the new target is permitted. It must exclude unrelated
projects, credentials, paid model changes, publishing, and service changes.
Evaluate Contract and Outcome separately against that scope, and record the
profile as the authority for each decision. No such profile is active here.

## Stability budget for the factory

During stabilization, prefer enough capacity to finish and improve a working
product. The host default is 10,000,000 tokens across preparation and build,
two hours of active provider work, and a proposed build allowance of 24
iterations within two hours. This applies to creation and subsequent work in
the same factory conversation. Smaller limits explicitly accepted by the
operator remain binding; new defaults do not amend existing Contracts.

`workflow-budget.json` is private, bound to the original child and conversation.
If an attempt ends before a Contract/session, target directory or builder exists,
a new chat may take over the same child budget only after the coordinator proves
the old turn finished and its process exited. The host records the handoff,
preserves every observation and limit, and prevents the old chat from taking it
back. Active, claimed or uncertain attempts cannot be transferred. This is
recovery of a failed preparation, not a fresh allowance.
Request-based transports reserve against the shared balance before dispatch;
completed receipts replace the reservation with measured usage. A resumed
turn or builder never starts a fresh shared allowance. Codex and native Claude
preparation use their observed counters, with a stop at an observed boundary;
they cannot promise an exact per-request upper bound. Builder-specific
accounting and protected verifier checks still apply.

A Responses request reserves its input, a margin of 8192 tokens and its
output cap. When it repeats the previous measured request exactly (same
instructions, tools and leading items) and only appends items, the measured
input tokens stand for that prefix and only the appended items count at one
token per UTF-8 byte. Otherwise the whole request counts by its bytes. Bytes
alone overstated kimi requests about 4.5 times, so builds paused for a budget
extension with half their tokens unspent (2026-11-16). Usage above a
reservation still stops the run as `provider_budget_overshoot`.

Count cached input as usage. Show observed tokens, outstanding reservations,
preparation/build subtotals and active provider time separately. Approval
waiting is excluded. Preserve pre-upgrade observations and identify their
incomplete coverage; never relabel an unknown old charge as zero or measured.
No request is repeated merely to recover a missing receipt.

For NeuralDeep factory preparation, a completed, measured empty response may
trigger at most two automatic continuations in the same native session and host
turn. The host first confirms process exit, retains the workspace claim and
history, and checks that no operator decision is pending. Every continuation
uses the remaining shared budget and original turn deadline; its usage, process
proof and notice are retained. A refusal, unknown output shape, missing usage,
output limit, uncertain exit or cancelled turn does not qualify. Successful
responses and other transports keep their ordinary execution path. If recovery
is exhausted, the chat explains the cause and preserves the saved creation for
explicit continuation. This does not approve documents or bypass evidence gates.

An undeclared partial tool call is withheld, never renamed or executed. The
protected NeuralDeep stream continues reading within the existing time and size
bounds, suppresses subsequent output, and records terminal usage before reporting
the original tool refusal. A completed response with measured usage and the exact
selected model may use the same two-continuation allowance to ask the model to
use declared tools. The shared counter, deadline, lease and pending-approval
checks remain unchanged. Truncated streams, unconfirmed usage, output limits,
wrong model identity and failed durable accounting do not authorize a repeat.
An old unknown receipt remains unknown; this fix does not invent its usage.

When a brief explicitly selects API process, web/API and no secondary interface,
`scripts/server.mjs` is the HTTP entrypoint, not a separate CLI. The host removes
only this redundant CLI field before rendering a new draft. For an existing
unapproved draft, `status`, `read_artifact` and `scaffold_plan` offer a hash-bound
`draftRepair` patch. Applying it changes only that line; normal Contract review
still follows. Custom entrypoints, selected CLI interfaces and accepted documents
are never silently changed.

A large context or several useful iterations is not itself a failure. After
substantial work without a changed artifact or phase, present a progress
review signal to the controller. This signal does not stop useful work or
change an accepted budget. Actual execution uncertainty, identity changes and
protected evidence failures keep their existing recovery boundaries. Tune
economic defaults later from recorded successful outcomes, token usage,
active time and correction histories.

## Agent card contract at handoff

The factory hands an agent over only when its card works. After `finish`
applies the verified version, the host reads the agent's card from the Control
Center that serves this instance. That is the same card the operator sees, so
the check and the card cannot disagree. The card must show:

- a confirmed agent identity;
- a documented mission;
- an assigned version;
- a verified result;
- "Try this agent" for an HTTP agent built from the API process scaffold;
- a Start that can be executed.

Any gap keeps the factory in `card-blocked`. The step names the gaps, and
`finish` can run again once they are fixed. Services stay stopped during the
check.

A Control Center of another instance is never used. Its health must report
this instance's id and port. A headless run without a Control Center keeps the
static card checks and records `cardContract: not-checked`.

### After the handoff

A working handoff completes the creation, also when the request asked for a
running agent. Nothing in the creation chat starts, stops or calls the agent:
the operator starts it with Start on its card and tries it there. With a Pritha
model connection the checks use a protected local responder, so
`liveModelVerified: false` is expected; the first live model call happens when
the operator tries the agent. The `finish` result and `factory_status` say
this, and the model ends its turn with a short report: what was built, where
its project is, what was verified, and that the agent starts from its card. It
does not search the code for a start command or request commands for it.

Observed 2026-11-16: without this guidance a builder asked for a "running"
agent spent the second half of its turn on that search and on three command
requests that expired, until the turn reached its time limit. Task Chat now
reports a turn that used up its time as a time limit with the saved work kept,
not as a provider error.

## Removing an agent

The agent's action panel offers "Remove agent…". Only children built by the
factory qualify; their project carries `delivery/outcome-lineage.json` with
schema `pritha-child-outcome-lineage-v1`. A folder without it is the user's
own project, and Pritha refuses to remove it. A running service, a running
factory step or an executing build blocks removal until it is stopped.

The plan lists what moves: the project folder, the agent's memory documents,
its factory session, build runs and their target claims, and its proposal.
Removal needs the unchanged plan hash and the typed phrase `REMOVE <name>`.
Everything moves into `archive/agents/<name>-<time>/` under the state root
with a `manifest.json`, and the registry is rebuilt without the agent. Nothing
is deleted. `node scripts/agents-mother/agent-removal.mjs restore <archive> --yes`
moves it back if none of its places is taken again. Task Chat histories stay.

## Completion criteria

An Agents Mother run is complete only when:

- an `agent-contract` exists and validates;
- a separate `agent-outcome-spec` exists, validates, has independent approval
  evidence and has a content lock that still matches;
- every core outcome and required deliverable has executable Trial coverage,
  with safety and recovery coverage where applicable;
- the selected architecture is grounded in TechScope memory, a pattern-pack
  artifact and current sources;
- any contract-relevant GitHub shortlist is recorded as advisory evidence, and
  every selected repository module has passed exact-pin, license, security,
  permission, eval, `github-repository-review`, synthesis and
  explicit-user-approval gates;
- a working scaffold exists in the chosen folder, but is not mistaken for the
  final result;
- the delivery ledger is either terminal or contains exactly one actionable
  next step or a non-empty typed blocker list;
- all required Trials pass against the exact verified commit after the final
  checkpoint, or a typed blocker states what decision or authority is missing;
- machine verification and user acceptance remain separate lifecycle states;
- the contract's sensor map covers completion verification, consequential
  actions, loop bounds, critical side effects, protected eval evidence,
  balanced metrics and human judgment boundaries;
- environment setup instructions are present;
- smoke tests or healthchecks pass, or failures are documented;
- the user has a short handoff guide explaining how to run and test the new agent;
- post-creation lessons are captured when the agent has meaningful lifecycle evidence.
- the user interaction/revision path is captured after the first successful working version.

## Non-goals for v1

- Universal generator for every agent platform.
- Automatic deployment.
- Automatic secret provisioning.
- Copying TechScope internals 1:1 into every new agent.
- Treating Telegram as mandatory.

## Roadmap

See `07_workflows/agents-mother-roadmap.md` for the full layered implementation roadmap.

## Host source research

Для сбора первичных страниц с checkpoints, deadline и точными passage IDs см.
[host research workflow](agents-mother-host-research.md). Существующие ручной
external research и независимые scaffold/delivery gates сохраняются.
