---
id: 2026-05-17-medium-harness-engineering-six-layer-source-note
type: source-note
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [harness-engineering, ai-agents, context-engineering, agent-memory, evaluation, observability, tool-use, recovery]
tools: [medium, codex, anthropic, openai, langchain]
source_type: screenshot
source_url: local-attachments://2026-05-17-harness-engineering-screenshots
source_published: 2026-04-06
sources:
  - 00_inbox/texts/2026-05-17-medium-harness-engineering-screenshots-intake.md
  - 01_sources/raw/thread-media/2026-05-17-harness-engineering-screenshots/
  - https://medium.com/%40bollen_en_kersen/list/ai-engineering-302c79906afa
  - https://openai.com/index/harness-engineering/
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://www.anthropic.com/engineering/building-effective-agents
related:
  intakes:
    - 00_inbox/texts/2026-05-17-medium-harness-engineering-screenshots-intake.md
  signals:
    - 01_sources/signals/2026-05-17-medium-harness-engineering-six-layer-signal.md
---

# Source Note: Medium harness engineering six-layer article

Date added: 2026-05-17
Source date: 2026-04-06
Source: local screenshots of Medium article
Status: draft

## What this source is

Screenshot set of a Medium article by Nick T. (Ph.D.) in `Artificial Intelligence in Plain English`, dated 2026-04-06. Search results confirm article metadata in Medium lists, but the direct article URL was not recovered during this pass.

The source is secondary analysis. It is useful because it compresses several production-agent reliability ideas into a six-layer harness model.

## Useful extracted structure

The article frames AI engineering maturity as:

- prompt engineering: expression and intent;
- context engineering: facts and grounding;
- harness engineering: supervision and execution.

It defines a mature harness as layered architecture around the model. The six layers visible in screenshots are:

1. Information boundaries: role, objective, success criteria and separation of information types.
2. Tool system: not only available tools, but when to use them and how tool outputs are filtered.
3. Execution orchestration: deterministic planning/routing rather than stream-of-consciousness execution.
4. Memory and state: separate task state, intermediate conclusions and user/profile preferences.
5. Evaluation and observability: independent validation, logs, metrics and error attribution.
6. Constraints, validation and recovery: rules, gating checks, retry/fallback/rollback.

## Primary-source cross-check

- OpenAI's 2026-02-11 harness engineering article supports the direction: agent work improves when environment, tools, docs, feedback loops, UI/log observability and repository-local knowledge are made legible to Codex.
- Anthropic's 2025-09-29 context engineering article supports the context claims: context is finite, should be curated, tool sets should be minimal/clear, and long-horizon work uses compaction, note-taking and subagents.
- Anthropic's `Building effective agents` supports simple composable workflows and the need to start with the simplest useful harness.

## Caveats

- Numeric success claims such as moving from roughly 70% to 95% are anecdotal in the screenshots; do not use as evidence without reproduction.
- The article names Anthropic concepts such as `Context Anxiety`/`Context Reflect`; official sources found in this pass more directly support context management, compaction and fresh context windows, but not necessarily the exact labels as shown in screenshots.
- The screenshots are partial and should not be treated as the full article.

