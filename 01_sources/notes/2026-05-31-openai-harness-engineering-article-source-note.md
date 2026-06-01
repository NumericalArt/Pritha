---
id: 2026-05-31-openai-harness-engineering-article-source-note
type: source-note
status: processed
created: 2026-05-31
updated: 2026-05-31
topics:
  - harness-engineering
  - codex
  - coding-agents
  - agent-first-development
  - repository-knowledge
  - agent-legibility
tools:
  - OpenAI
  - Codex
  - AGENTS.md
  - Chrome DevTools
  - CI
  - observability
agent_platforms:
  - Codex
model_context:
  - GPT-5
runtime_environment:
  - git-worktree
  - local-dev
  - browser
  - ci
config_surfaces:
  - AGENTS.md
  - docs/
  - exec plans
  - linters
  - structural tests
  - observability stack
portability: codex-native
source_type: article
source_url: https://openai.com/ru-RU/index/harness-engineering/
sources:
  - https://openai.com/ru-RU/index/harness-engineering/
related:
  intakes:
    - 00_inbox/links/2026-05-31-openai-harness-engineering-article-intake.md
  signals:
    - 01_sources/signals/2026-05-31-openai-harness-engineering-agent-readable-repo-signal.md
  assessments:
    - 03_reviews/2026-05-31-openai-harness-engineering-agent-readable-repo-assessment.md
  previous:
    - 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
    - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
source_published: 2026-02-11
source_updated: unknown
source_version: OpenAI article observed 2026-05-31, Russian localized page
retrieved: 2026-05-31
verified: 2026-05-31
valid_for: OpenAI Codex harness-engineering lessons as published 2026-02-11 and rechecked 2026-05-31
temporal_status: current
---

# Source Note: OpenAI harness engineering article

Date: 2026-05-31
Status: processed

## Source snapshot

- Title: "Инженерия harness: Codex в мире, ориентированном на агентов"
- Author: Ryan Lopopolo, OpenAI technical staff.
- URL: https://openai.com/ru-RU/index/harness-engineering/
- Published: 2026-02-11.
- Retrieved and verified: 2026-05-31.
- Source type: official OpenAI article, Russian localized page.

## Primary-source claims

- OpenAI describes a five-month internal product experiment where Codex wrote application logic, tests, CI, docs, observability and internal tools while humans steered intent, priorities and feedback loops.
- The developer role shifts from writing code to designing environments, setting intent, creating constraints and building feedback loops that make Codex work reliable.
- A short `AGENTS.md` should act as a map/table of contents, not a large encyclopedia.
- Repository-local docs are the system of record for agent knowledge; information unavailable to the agent in the repository is operationally invisible to the agent.
- Agent-readable systems need more than prompts: local app instances per worktree, browser/DevTools control, screenshots, logs, metrics, traces, CI, linters and structural tests.
- Architecture boundaries should be mechanical and visible to agents: fixed dependency directions, explicit cross-cutting interfaces, custom linters, structural tests and remediation-oriented error messages.
- Review comments, user-visible failures and repeated human preferences should be turned into durable docs or executable checks.
- High agent throughput changes merge economics, but only inside a harness with strong feedback and recovery loops.
- Full feature autonomy is presented as specific to the repository's structure and tooling, not a generally transferable capability without comparable investment.
- Long-term risks remain open: architectural integrity over years, where human judgment matters most and how to formalize that judgment as models improve.

## Techscope relevance

This source strongly confirms existing Techscope/Pritha direction:

- Markdown artifacts as source of truth.
- `AGENTS.md` as routing layer, not dumping ground.
- Contracts, standards, workflows and reports as durable agent-readable knowledge.
- CI/self-test/quality gates as feedback to agents.
- Browser verification and observability as agent-readable environment signals.
- Post-creation reviews as a way to turn user feedback into future harness improvements.

## Evidence notes

- Evidence quality is high because the source is official OpenAI material and directly names Codex, AGENTS.md, repository knowledge, browser/DevTools, observability, CI and structural tests.
- The source is an experience report, not a neutral benchmark. Its throughput numbers should be treated as context from one OpenAI internal system, not a universal expectation.
- The article's own caveat matters: higher autonomy depends on the specific repository harness and should not be generalized without comparable tooling.

## Open questions

- Which Techscope checks should become mechanical next: AGENTS.md map lint, stale-doc checks, structural dependency tests or QA-plan requirements?
- Should Pritha scaffold every substantial descendant with a lightweight agent-legibility checklist?
- Which observability signals are worth exposing to Codex for small local agents without overbuilding?
