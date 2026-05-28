---
id: 2026-05-17-medium-harness-engineering-six-layer-assessment
type: assessment
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [harness-engineering, ai-agents, context-engineering, agent-memory, evaluation, observability, tool-use, recovery, techscope]
tools: [medium, codex, anthropic, openai, langchain]
sources:
  - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
  - 01_sources/notes/2026-05-17-medium-harness-engineering-six-layer-source-note.md
  - 01_sources/signals/2026-05-17-medium-harness-engineering-six-layer-signal.md
  - 01_sources/raw/thread-media/2026-05-17-harness-engineering-screenshots/
  - https://medium.com/%40bollen_en_kersen/list/ai-engineering-302c79906afa
  - https://openai.com/index/harness-engineering/
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://www.anthropic.com/engineering/building-effective-agents
related:
  briefs:
    - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
  standards:
    - 04_standards/agent-shell-evaluation.md
  reviews:
    - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
    - 03_reviews/2026-05-17-rethinking-ai-agents-harness-engineering-assessment.md
recommendation: review
---

# Assessment: Medium harness engineering six-layer model

Date: 2026-05-17
Status: draft
Recommendation: review

## One-paragraph read

Материал полезен и попадает прямо в ядро Techscope. Это не первоисточник и не benchmark, но он хорошо формулирует operational checklist для зрелого агента: контролировать видимый контекст, инструменты, порядок выполнения, state/memory, evaluation/observability and recovery. Его нужно использовать как вход для harness audit, а не сразу как active standard.

## Why it matters

- Techscope уже является harness: inbox, queues, Codex review, Markdown memory, wiki layer, validation, embeddings.
- Шесть слоев помогают увидеть, где у нас есть механические правила, а где пока только текстовые пожелания.
- Материал поддерживает свежие направления: agent-shell evaluation, mobile supervision, screenshot/log/test evidence, queue completion semantics.

## Technical claims

- More context can reduce focus when it mixes different information types without boundaries.
- Tool systems need use-policy and result filtering, not just availability.
- Workflow order should be encoded in harness, not rediscovered by the model every turn.
- Task state, intermediate conclusions and long-term preferences should be separated.
- Evaluation must be independent enough to counter optimistic self-assessment.
- Recovery requires constraints, validation gates, retry/fallback and rollback paths.

## Programming relevance

Score: 5/5

Directly affects coding-agent repo structure, CI/test loops, tool design, logs, screenshot-based UI validation and completion criteria.

## Agent engineering relevance

Score: 5/5

Core agent architecture topic: tools, memory, orchestration, evals, recovery and context management.

## DX impact

Score: 4/5

Improves reliability and user trust, but can add ceremony if not converted into small executable checks.

## Evidence quality

Score: 4/5

Secondary article is partially verified by primary OpenAI/Anthropic sources. Direct article URL still missing; screenshots are partial.

## Practicality

Score: 5/5

Immediately usable for auditing existing Techscope workflows.

## Leverage

Score: 5/5

High leverage because the model applies to every future agent we build or evaluate.

## Risk

Score: 2/5

Main risk is over-formalizing too early or copying rhetorical claims without local tests.

## Expert lenses

### Architecture

Use six layers as a map for future agent architecture reviews.

### Security

Layer 6 should explicitly include secret handling, permission boundaries, destructive action approvals and prompt-injection resistant parsing of external inputs.

### Developer Experience

Make checks executable and visible. Do not turn the rubric into a long manual ritual.

### Product Pragmatist

Start with a Techscope audit: Telegram intake, media review, wiki layer and query/search can each be mapped quickly.

### Research Scout

Find direct article URL if needed; verify `Context Reflect` label against primary Anthropic sources before using the term.

### Standards Editor

Candidate draft standard: `agent-harness-architecture`. Do not activate until one local audit and at least one experiment.

## Recommendation

Create a review/audit next: `techscope-harness-layer-audit`.

## Next artifact

review | standard-draft
