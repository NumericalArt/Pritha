---
id: 2026-05-17-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal
type: signal
status: superseded
created: 2026-05-17
updated: 2026-05-17
topics:
  - telegram
  - inbox
  - signal-extraction
tools:
  - telegram-bot
  - agent
  - agents
  - llm
  - codex
  - prompt
  - workflow
  - security
  - eval
  - test
  - lint
  - review
  - qa
  - source
sources:
  - 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
  - https://t.me/tosoltaime/42
  - 01_sources/raw/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.json
related:
  sources:
    - 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
generated_from:
  - 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: superseded
superseded_by:
  - 01_sources/signals/2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal.md
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: 2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex

Date: 2026-05-17
Status: superseded
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: superseded

## Core signal

- Потом возвращаем эти тесты в Codex, желательно как файлы: docs/evals/ , tests/ , fixtures/ , acceptance.md
- В конце Codex проверяет результат не словами, а командами: npm test , npm run lint , smoke checks, eval run
- Формула: Spec → External tests/evals → Codex plan → failing tests → implementation → passing tests → verification
- После этого Codex сначала делает план на основании спеки и тестов: какие файлы создать, какие модули нужны, какие проверки должны пройти и в каком порядке реализовывать.
- Главный принцип: Codex не должен сам себе придумывать проверку после того, как уже написал ответ.
- Насколько это полезно для программирования, LLM-агентов, coding agents или agent workflows?
- Дальше тесты лучше готовить с другой моделью, которая думает как независимый QA/product reviewer, а не как исполнитель кода.
- Затем Codex реализует код так, чтобы тесты проходили: сначала тест падает, потом пишется код, потом тест становится зелёным.
- Как использовать Superpowers в Codex.
- В Codex /using superpowers брейнштормишь идею: понятная спека, scope MVP, user flows, ограничения и критерии готовности.

## Technical details

- Raw update: `01_sources/raw/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.json`
- # Intake: 2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex
- Forwarded to Techscope for later expert assessment.
- Forwarded from: Tosol Taimeframes #42

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- После этого Codex сначала делает план на основании спеки и тестов: какие файлы создать, какие модули нужны, какие проверки должны пройти и в каком порядке реализовывать.
- Главный принцип: Codex не должен сам себе придумывать проверку после того, как уже написал ответ.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.
- Full source text/transcript is not copied into this signal.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official OpenAI docs/source materials.
- Проверить security implications отдельно перед стандартом.

## Codex refinement required

- Superseded by earlier refined Superpowers/Codex signal.

## Source links

- 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
- https://t.me/tosoltaime/42
- 01_sources/raw/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.json
