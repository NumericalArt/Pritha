---
id: 2026-05-17-medium-harness-engineering-six-layer-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [harness-engineering, ai-agents, context-engineering, agent-memory, evaluation, observability, tool-use, recovery, techscope]
tools: [medium, codex, anthropic, openai, langchain]
sources:
  - 01_sources/notes/2026-05-17-medium-harness-engineering-six-layer-source-note.md
  - 01_sources/signals/2026-05-17-medium-harness-engineering-six-layer-signal.md
  - 01_sources/raw/thread-media/2026-05-17-harness-engineering-screenshots/
  - https://medium.com/%40bollen_en_kersen/list/ai-engineering-302c79906afa
  - https://openai.com/index/harness-engineering/
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://www.anthropic.com/engineering/building-effective-agents
related:
  intakes:
    - 00_inbox/texts/2026-05-17-medium-harness-engineering-screenshots-intake.md
  notes:
    - 01_sources/notes/2026-05-17-medium-harness-engineering-six-layer-source-note.md
  signals:
    - 01_sources/signals/2026-05-17-medium-harness-engineering-six-layer-signal.md
  assessments:
    - 03_reviews/2026-05-17-medium-harness-engineering-six-layer-assessment.md
  standards:
    - 04_standards/agent-shell-evaluation.md
---

# Brief: Medium harness engineering six-layer model

Date: 2026-05-17
Source: local screenshots, Medium article dated 2026-04-06
Status: draft

## Summary

Скриншоты статьи дают компактную модель зрелого agent harness: агент - это не только model + prompt/context, а model + deterministic scaffolding around action. Самое ценное для Techscope - шесть слоев harness, которые хорошо ложатся на нашу архитектуру: границы информации, tool system, orchestration, memory/state, evaluation/observability, constraints/validation/recovery.

## Key claims

- Prompt engineering помогает выразить intent, но не дает фактов, памяти и надежной последовательности действий.
- Context engineering шире RAG: это управление тем, какие токены видит модель в каждый момент, включая state, tool outputs and summaries.
- Harness engineering переносит ответственность за порядок действий, проверки, recovery and constraints из вероятностной модели в детерминированную систему.
- Raw tool output should not go straight into context; it should be parsed, filtered and summarized.
- A mature harness separates generation from evaluation; self-grading by the same model has optimistic bias.
- "Done" means verified result, not generated text.

## Evidence

- Screenshot article: Nick T. (Ph.D.), `Harness Engineering: Understand this will make your AI Agent performs better than 80% of others`, 2026-04-06.
- Medium list/search metadata confirms the title, author/publication and date, but not a direct article URL.
- OpenAI harness engineering article, 2026-02-11, supports repository-local knowledge, tool/observability access, agent review loops and verification.
- Anthropic context engineering article, 2025-09-29, supports context as finite resource, tight tool/context design, compaction, note-taking and subagents for long-horizon tasks.
- Anthropic `Building effective agents`, 2024-12-19, supports simple composable workflows and careful agent design.

## Risks and caveats

- The article is secondary and partly rhetorical.
- Numerical claims about task success improvement are not evidence until reproduced.
- Some labels attributed to Anthropic need exact primary-source verification.
- The six-layer model is useful as a design lens, not a complete implementation recipe.

## Recommendation

Accept as a strong signal and use it to perform a Techscope harness-layer audit:

- map every active workflow to the six layers;
- identify missing validation/recovery;
- update `agent-shell-evaluation` rubric with `harness layers`;
- consider a draft `agent-harness-architecture` standard after audit.

## Next step

review | standard-draft | experiment

