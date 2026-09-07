---
id: 2026-09-07-pritha-minor-cleanup
type: workflow
status: active
created: 2026-09-07
updated: 2026-09-07
topics: [agent-engineering, cleanup, release]
tools: [Pritha, Node.js, Codex]
sources:
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 03_reviews/2026-09-06-api-process-delivery-factory-review.md
related:
  workflows:
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
supersedes: []
superseded_by: []
source_version: mother 31e862c; reviewed cleanup instruction based on origin/main 50bf88c
memory_domain: pritha-self
subject:
  kind: workflow
  id: pritha-minor-cleanup
privacy: public
retention: durable
review_status: user-approved-plan
confidence: high
---

# Pritha: scoped cleanup and release

The eight API/Goal follow-up commits must reach GitHub before cleanup. A and F
change generated behavior and UI; they are not merely formatting. Existing TS
sync probes, timeout policies and CHILD_AGENT_TYPES remain the starting point.

## Implementation order

1. A1: one module selection for workspace, CLI and API process scaffolds. Explicit
   none/ephemeral wins over text heuristics; absent legacy choices preserve defaults.
   Optional files, commands, instructions and required-file checks agree. Skills,
   Telegram and untrusted intake retain needed redaction; host redaction is unconditional.
2. A2: child npm test, structural and API lifecycle tests, revision-bound private
   test receipts at handoff. Failed/missing/unrun tests are warnings, never acceptance
   or verification evidence. Exact approved npm execution remains separate from GET.
   Use tests/*.test.mjs because the supported local Node does not expand tests/.
3. C: bounded synchronous subprocesses with SIGKILL and shell:false. Preserve
   long test/build/media budgets, IO options and managed process ownership.
4. B: share only identical helpers. Keep both CLI grammars, text versus byte hashes,
   JSON failure policies and Unicode slug differences explicit.
5. D: inspect repository-wide, dynamic, test and documented consumers before removing
   exports. Internal repository/security implementations remain available to callers.
6. E: Russian guide, changelog, commit-message warnings for new commits only,
   docs/ui-design migration and visible failures for operator signals.
7. F: local links, file operations, placeholder report identity, and host-owned
   Start/Tailscale Serve decisions. Assistant prose cannot authorize execution.

## Validation and release

Run relevant tests after each group. Validate Markdown and private-data boundaries
when affected. Run the complete self-test and golden checks on the release candidate;
do not duplicate its unit suite through a second npm test. Unit subprocesses must
not inherit live instance configuration or nested NODE_TEST_CONTEXT.

Test scaffold matrices, failed/absent/stale child test receipts, SIGTERM-resistant
processes, safe links, identity placeholders and stale/duplicate operation decisions.
Exercise host-pulse in an isolated copy, keeping its canonical product untouched.

Publish the tested main commit and deploy one pinned candidate sequentially through
mother, Dasha, Sasha, Marina and MacBook using staged release. Verify private-state
isolation, memory, exact build identity, all five pages and their JS chunks; a failed
instance rolls back before progression. Record checkout SHA and compiled SHA separately.

NeuralDeep receives a matching revision 9 roadmap as a separate documentation commit,
preserving its Codex CLI executor, provider, accounting, themes and unrelated research.
Mother code and native Goal/App Server RPC are not bulk-merged into NeuralDeep.

## Deferred

The 41-template extraction, broad declaration coverage, server.ts split and Techscope
rename remain outside this cycle. Outcome approvals, protected Trials, publication
guards and persistent-service consent remain intact.
