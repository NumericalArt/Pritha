---
id: pritha-good-state-baseline
type: workflow
status: active
created: 2026-07-02
updated: 2026-07-02
topics:
  - pritha
  - good-state-baseline
  - git
  - memory
  - regression-recovery
tools:
  - Pritha
  - Codex
  - Git
  - GitHub
  - Node.js
sources:
  - source-pritha-good-state-baseline-protocol-2026-07-02
related:
  templates:
    - 08_templates/pritha-good-state-baseline-report.md
  reports:
    - 11_agents/reports/2026-07-02-pritha-good-state-baseline-voice-ducking-control-centers.md
  standards:
    - 04_standards/pritha-self-model.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-07-02
source_updated: 2026-07-02
source_version: pritha-good-state-baseline-v1
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha accepted-state capture and future regression recovery
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
  - agent-building-knowledge
subject:
  kind: workflow
  id: pritha-good-state-baseline
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Workflow: Pritha Good State Baseline

Date: 2026-07-02
Status: active

## Purpose

Capture moments when the operator accepts the current Pritha or child-agent
state as especially good, correct or desirable. The baseline should make that
state searchable in memory and recoverable through Git without storing private
runtime state.

## Trigger

Use this workflow when the operator says a variant of:

- "this is the Pritha we wanted";
- "this works exactly as needed";
- "great, keep this";
- "fix/record this state";
- "everything works now";
- "this configuration is good";
- "зафиксируем это состояние";
- "это то, что нам нужно".

The trigger can apply to all of Pritha, one clone, one child agent, one UI
surface or a focused feature.

## Procedure

1. Identify the accepted scope:
   - Pritha overall;
   - one or more Pritha clones;
   - one child agent;
   - a feature surface such as Voice Control, Agents, Tailscale or memory.
2. Record the recent work cycle:
   - what changed;
   - which commits are relevant;
   - which user-visible behavior is now accepted;
   - which problems were fixed.
3. Run proportionate checks:
   - at minimum `git status --short`;
   - focused tests for the accepted feature;
   - `node scripts/validate-memory.mjs` when adding memory artifacts;
   - `node scripts/privacy-audit.mjs --strict` before commit;
   - relevant UI health or build checks when the accepted state is a UI/runtime state.
4. Create a tracked Markdown report using
   `08_templates/pritha-good-state-baseline-report.md`.
5. Keep private runtime state out of the report:
   - no secrets;
   - no `.env` values;
   - no raw Tailscale URLs or tailnet identifiers;
   - no `.private`, `.memory-private`, `.logs`, `.queue`, `.snapshots` contents.
6. Commit the report and any supporting workflow/template changes.
7. Create an annotated tag:
   - format: `pritha-good-state-YYYY-MM-DD-short-title`;
   - message: one-line accepted state and the report path.
8. Push the commit and tag unless the operator explicitly asks not to publish.
9. Rebuild local memory indexes so keyword and semantic search can find the
   baseline.

## Report Contents

Each baseline report must include:

- accepted scope;
- operator acceptance signal;
- Git branch, tag and relevant commits;
- recent work summary;
- accepted behavior;
- checks and results;
- known acceptable warnings;
- private/runtime exclusions;
- regression signals;
- recovery notes.

## Recovery Use

When a future change breaks behavior, search memory for:

- `good-state-baseline`;
- the affected surface, for example `voice music ducking`;
- the child agent or clone name;
- the git tag name.

Then compare the current code and behavior against the baseline report and use
the tag as a complete or partial recovery anchor.
