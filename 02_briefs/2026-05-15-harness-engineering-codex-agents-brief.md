---
id: 2026-05-15-harness-engineering-codex-agents-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [harness-engineering, coding-agents, agent-memory, agent-evals, ci, dx, software-engineering]
tools: [codex, agents-md, lint, ci, playwright, zod, pnpm, chrome-devtools, openai]
sources:
  - 01_sources/signals/2026-05-16-2026-05-15-openai-harness-engineering-source-note-signal.md
  - 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
  - 00_inbox/links/2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake.md
  - 03_reviews/2026-05-15-2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake-auto-assessment.md
  - 01_sources/raw/youtube-am_oeAoUhew/am_oeAoUhew-whisper-small.md
  - https://www.youtube.com/watch?v=am_oeAoUhew
  - https://openai.com/index/harness-engineering/
related:
  signals:
    - 01_sources/signals/2026-05-16-2026-05-15-openai-harness-engineering-source-note-signal.md
  sources:
    - 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
  intakes:
    - 00_inbox/links/2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake.md
  assessments:
    - 03_reviews/2026-05-15-2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake-auto-assessment.md
  standards:
    - 04_standards/expert-information-assessment.md
    - 04_standards/memory-structure.md
  workflows:
    - 07_workflows/media-intake-processing.md
    - 07_workflows/llm-wiki-layer.md
---

# Brief: harness-engineering-codex-agents

Date: 2026-05-15
Source: https://www.youtube.com/watch?v=am_oeAoUhew
Status: draft

## Summary

Ryan Lopopolo описывает harness engineering как инженерную дисциплину вокруг coding agents: человек больше не должен быть главным производителем кода, а должен проектировать среду, инструкции, guardrails, CI feedback loops, review agents, repo structure и проверяемые acceptance criteria, чтобы агенты могли выполнять полный цикл разработки. Главный сдвиг: implementation становится дешевой и параллелизуемой, а дефицитными ресурсами становятся human time, human/model attention и context window.

## Key claims

- В agent-first workflow код перестает быть главным дефицитом; дефицитными становятся внимание, контекст, качество спецификации и feedback loops.
- Важны не только prompts, но и все места, где агент получает управляемый feedback: `AGENTS.md`, rules files, skills, lint errors, test failures, review-agent comments, QA plans, runbooks.
- Репозиторий должен быть legible для агента: единообразные patterns, маленькие локальные domains, явные public/private boundaries, shared utilities, предсказуемые scripts and CI.
- Нефункциональные требования нужно записывать явно: reliability, security, QA plan, observability, retries/timeouts, source-code structure, file size/context constraints.
- Human review нужно переводить из повторяющихся комментариев в durable docs, lint rules, tests and reviewer agents.
- Ошибки агентов и людей нужно группировать в классы и устранять системно, например через weekly garbage collection day.
- Агент должен входить в workflow как разработчик: через ticket, локальные tools, devtools, observability, tests and acceptance criteria.

## Evidence

- Видео: AI Engineer talk by Ryan Lopopolo, OpenAI.
- Primary source: OpenAI article "Harness engineering: leveraging Codex in an agent-first world", published 2026-02-11.
- Локальный transcript создан на английском через `mlx-whisper`: `01_sources/raw/youtube-am_oeAoUhew/am_oeAoUhew-whisper-small.md`.

## Why it matters for Techscope

Это один из самых сильных материалов для нашей миссии на текущий момент. Он напрямую превращается в правила для будущих coding agents:

- проектировать репозитории как agent-readable systems;
- хранить durable instructions and standards рядом с кодом;
- превращать повторяющиеся review comments в автоматические checks;
- использовать reviewer agents по ролям;
- создавать harness layer: skills, local tooling, observability, browser/devtools control, CI feedback;
- считать человеческое внимание главным bottleneck.

## Risks and caveats

- Тезис "code is free" опасно понимать буквально: production risk, maintenance semantics, security and ownership никуда не исчезают.
- Практика OpenAI может опираться на модели, tooling и token budgets, недоступные маленьким проектам.
- Нужны локальные эксперименты: насколько наши проекты готовы к agent-first structure.
- Автоматизация review не должна выключать human accountability для security, privacy, product decisions and architecture.

## Recommendation

Создать отдельный review/experiment: `agent-harness-engineering-for-techscope`.

Минимальный эксперимент для ближайшего проекта:

- определить `AGENTS.md` as durable harness contract;
- добавить role-based review checklist: security, reliability, DX, product;
- добавить хотя бы один source-code structural test или lint с remediation prompt;
- описать "what good looks like" для QA plan;
- проверить, улучшает ли это качество Codex outputs и снижает ли ручной review.

## Next step

review | experiment
