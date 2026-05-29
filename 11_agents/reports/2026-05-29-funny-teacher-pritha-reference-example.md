---
id: 2026-05-29-funny-teacher-pritha-reference-example
type: agent-post-creation-review
status: accepted
created: 2026-05-29
updated: 2026-05-29
topics:
  - agent-engineering
  - agents-mother
  - pritha
  - funny-teacher
  - reference-example
  - feedback-loop
tools:
  - Codex
  - Pritha
  - OpenAI Realtime API
  - Next.js
  - SQLite
  - semantic-search
  - Tailscale
  - launchd
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - text-embedding-3-small
runtime_environment:
  - local-project
  - web-ui
  - mac-mini
config_surfaces:
  - AGENTS.md
  - README.md
  - docs/
  - interfaces/manifest.json
  - memory/manifest.json
  - tools/manifest.json
  - operations/manifest.json
  - scripts/
portability: adapter-needed
sources:
  - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-26-funny-teacher-agent-user-interaction-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-agent-test-report.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/README.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/AGENTS.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/v1-successful-version.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/architecture.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/creation-review.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/memory/manifest.json
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/tools/manifest.json
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/operations/manifest.json
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  scaffold_reports:
    - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
  agent_test_reports:
    - 11_agents/reports/2026-05-29-funny-teacher-agent-test-report.md
  agent_post_creation_reviews:
    - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
    - 11_agents/reports/2026-05-26-funny-teacher-agent-user-interaction-review.md
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-26
source_updated: 2026-05-26
source_version: Funny Teacher current local v1 snapshot inspected 2026-05-29
retrieved: 2026-05-29
verified: 2026-05-29
valid_for: Pritha reference example for voice learning agents and post-creation feedback capture
temporal_status: current
---

# Pritha Reference Example: Funny Teacher

Date: 2026-05-29
Status: accepted

## Summary

- Project path: `<SIBLING_AGENT_ROOT>/FunnyTeacher`
- Latest source snapshot inspected: local project files last changed on 2026-05-26; no project git commit is available.
- Classification: successful Pritha descendant and reference example for feedback-driven agent creation.
- Current operational shape: Next.js web voice app, Realtime session boundary, SQLite lesson memory, semantic retrieval, Tailscale HTTPS and explicit launchd service.
- Result: keep Funny Teacher in Pritha as a concrete example of how a broad seed became a working agent through contract, scaffold, real-device tests, user feedback, operations and post-creation review.

This artifact does not copy Funny Teacher runtime state into Techscope. It records the pattern and the feedback path only. Excluded materials: `.env.local`, SQLite database files, `.next`, `node_modules`, `.tools`, logs, cached media and learner-specific runtime state.

## Verification

- `node scripts/pritha.mjs test <SIBLING_AGENT_ROOT>/FunnyTeacher`: complete; report saved as `11_agents/reports/2026-05-29-funny-teacher-agent-test-report.md`.
- `npm test --silent`: pass, 3 tests.
- `npm run build --silent`: pass.
- `npm run health --silent`: pass.
- `npm run deploy:status --silent`: launchd service `com.local.funny-teacher` is loaded and running on port 3033.

## What Pritha Should Learn

- Start with a contract, but expect product truth to emerge during real use.
- A voice agent is not just a voice model. Funny Teacher works because Realtime handles live dialogue while deterministic server tools handle durable memory writes and search.
- User-visible memory controls matter. `Use for practice` and `Clear search` turned retrieval from hidden magic into a controllable learning workflow.
- Media intake needs idempotency from day one. Repeated YouTube URLs should reuse stable source records and skip derivative rebuilds unless the input changed.
- Mobile and deployment testing are product discovery tools, not just QA. The YouTube embed issue changed the architecture toward local cache plus fallback.
- Operations must stay explicit. launchd was enabled only after user approval, documented in `operations/manifest.json`, and exposed through plan/status/install/uninstall commands.
- Post-creation review should preserve the conversation path because the final code does not explain why the product became this shape.

## Reference Pattern

Use Funny Teacher as a reference when a future descendant needs:

- a browser-first voice UI;
- OpenAI Realtime with server-issued ephemeral client secrets;
- narrow server tools for durable actions;
- local SQLite operational memory;
- semantic search with lexical fallback;
- user-selected retrieval focus and explicit reset;
- media/source intake with stable ids;
- Tailscale access for a trusted single-user local service;
- launchd service mode gated by explicit user approval.

Do not copy it blindly when a future agent does not need live voice, media intake, learner progress, semantic retrieval, persistent local service behavior or trusted-tailnet access.

## Feedback Loop Example

Funny Teacher is valuable to Pritha because its best decisions came from feedback:

- The user moved the idea from generic English practice to a lesson lifecycle: paste URL, watch, practice by voice, assess, save, repeat.
- The YouTube anti-bot/mobile issue forced a cache/fallback architecture.
- The user question "what does memory search do?" exposed that retrieval needed workflow actions.
- Selected memory focus created a new risk, so `Clear search` became a required reset control.
- The repeated-URL question exposed that deduplicating rows was weaker than true idempotent source intake.
- The final "fix this version" request created the habit of preserving both the working state and the interaction history.

## Pritha Gaps Exposed

- The current detector reports Funny Teacher as `agent-project`, not `techscope-generated-agent`, because its manifests do not carry a `generated_by` field. Future scaffolds should include lineage metadata in manifests.
- `pritha test` does not run the full project-specific v1 success suite. For reference examples, pair it with domain commands such as `npm test`, `npm run build`, `npm run health` and read-only deploy status.
- The generated registry summarizes counts well, but the reusable narrative belongs in a curated post-creation review like this one.

## Promotion Path

- Keep Funny Teacher as an accepted reference example for Pritha.
- Use its lifecycle evidence when updating `agent-creation-harness` and `realtime-voice-control-for-codex-agents`.
- Promote individual patterns only after explicit review. Strong candidates are source-idempotent intake, selected-memory-focus/reset and voice-tool-boundary.

## Next Steps

- Rebuild the Pritha registry and Techscope memory index so this example is discoverable.
- When the next voice or learning agent is created, compare its contract against this artifact before scaffold.
- Add manifest lineage fields to future scaffolds so successful descendants are machine-detectable as Pritha-generated.
