---
id: pritha-integrated-release-plan-2026-09-05
type: review
status: in-progress
created: 2026-09-05
updated: 2026-09-05
topics: [task-chat, memory, settings, fleet, macbook]
tools: [Pritha, Git, Codex, Playwright, SSH]
sources: [operator-integrated-release-approval-2026-09-05]
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: review
  id: pritha-integrated-release
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Integrated release plan

The operator now explicitly authorizes committing all existing memory edits,
bringing local main and GitHub current, and updating main, Dasha, Sasha, Marina
and the MacBook. This authorizes the managed lifecycle transaction; no further
confirmation is inferred merely from completing preparation in this turn.
NeuralDeep remains separate and receives the adaptation guide. The current
instruction replaces the earlier hold on memory edits and requests one tested
cumulative target for the fleet. Keep the individual feature anchors in history.

## Preparation and coding

1. Review the nine existing memory edits, run their focused tests, commit them
   separately, and merge into the isolated Task Chat release branch. Preserve
   instance-local database/embeddings and credentials. Alignment is additive to
   the August 28 reliable Control Center and Voice baselines.
2. Confirm actual primary transport on each instance, plus default/explicit CLI
   and failure routing in code. Preserve native-history ownership and avoid
   replaying old tasks. Codex App stays the default; CLI remains fallback or an
   explicit Settings choice. Do not transplant this policy into NeuralDeep's
   separate architecture.
3. Fix numeric Settings editing: retain the string being typed, including an
   empty intermediate draft, validate on Save, show a readable error and retain
   failed drafts. Preserve existing values and units; allow Task Timeout to be
   entered in seconds or milliseconds without rounding away precision. Validate
   numeric ranges/types, transport/sandbox/boolean fields and malformed JSON in
   the API before any write. A save error must not masquerade as success or
   replace settings with defaults. No new persistent field or data migration.
4. Verify desktop/mobile edits, bounds, unit switching, transport selection,
   failed/successful save and reload using isolated fixtures. Run real isolated
   API validation/persistence checks without model turns or credentials changes.
   Add a bounded Python loader behavior test for env precedence and path-only
   loading without importing the embedding model.
5. Existing browser regression exposed build-time cached Settings summary data.
   Make the Settings page dynamic, matching the Dev page, so each request reads
   current instance status. Re-run the existing backend-driven status scenario.

## Verification and release

Run all applicable unit tests, standalone typecheck, production build, browser
tests, privacy/Markdown audit and self-test in isolated state. Fast-forward main
to the fully reviewed combined branch, push and pin a full commit. Recheck local
Git cleanliness and existing services; privately snapshot each affected registry
and protected local state before migration/restart. Do not copy private state
between instances. Stage and switch main, then Dasha, Sasha and Marina. Stop at
the first failed health/isolation check and restore the affected build/service.
Check /codex, /task-chat, /settings and their JavaScript chunks and exact release
identity after each instance. Preserve original chat and attachment data.

Use the configured trusted SSH connection to update the MacBook on that machine.
First inspect its own instructions, checkout, dirty changes, runtime/state roots
and manager ownership; never guess or overwrite a divergent checkout. Apply the
same pinned staged update after local preflight. Update generated local memory,
verify runtime/health and test private access from the other trusted machine.

Publish a sanitized operations report with exact final commits and real per-
instance results. Update the NeuralDeep guide with the final source pin and
numeric Settings adaptation; do not change or restart NeuralDeep. A code/build
rollback does not restore an old registry over newer user activity. Keep private
recovery data and defer any destructive cleanup.

## Implementation verification

- Memory edits committed separately as `8be310d89ce530aecbab470ba4d339295b8af40e`;
  normal merge `6f52bc3` brought them into the release branch.
- Whole-project isolated self-test: pass, 512/512 unit tests, privacy and Markdown
  validation pass, no critical regressions. The existing legacy launchd audit
  warning remains outside the isolated developer instance's service scope.
- Production build and standalone typecheck pass. Existing backend-driven
  Settings status regression now passes after making that page dynamic.
- Task Chat plus numeric/API browser scenarios: 13 passed. Final Settings suite:
  5 passed, including model catalog, unsupported choices, numeric drafts,
  milliseconds, explicit CLI/App selection, save failure and reload at desktop
  and mobile widths. These are isolated tests; no old model prompt was replayed.
- Strict /codex, /task-chat and /settings health: pass; all 13 chunks pass.
- An initial direct unit invocation inherited the shared isolated state into
  fixtures and failed fixture assumptions. The canonical self-test clears these
  instance variables for child unit tests and passed all 512. A concurrent
  self-test temporarily locked the test database; browser status was retested
  after it finished. No production database was used for those tests.
- All ordinary local checkouts are clean. The running MacBook checkout is clean,
  owned by its verified manager and uses explicit external runtime.env. An older
  study checkout is outside this release and remains untouched.

Deployment results and exact source pin are recorded in the integrated
operations report after the transaction.
