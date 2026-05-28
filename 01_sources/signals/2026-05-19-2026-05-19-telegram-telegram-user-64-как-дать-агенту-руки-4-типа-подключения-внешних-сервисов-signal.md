---
id: 2026-05-19-2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов-signal
type: signal
status: extracted
created: 2026-05-19
updated: 2026-05-19
topics:
  - telegram
  - inbox
  - signal-extraction
tools:
  - telegram-bot
  - agent
  - agents
  - llm
  - mcp
  - claude
  - api
  - workflow
  - ci
  - review
  - browser
  - source
sources:
  - 00_inbox/telegram/2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов.md
  - https://t.me/oestick/505
  - 01_sources/raw/telegram/2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов.json
related:
  sources:
    - 00_inbox/telegram/2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов.md
generated_from:
  - 00_inbox/telegram/2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов.md
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: 2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов

Date: 2026-05-19
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- Заметил, что стал объяснять эту штуку на воркшопах даже не технарям — с тех пор как Claude Code и Сodex перестали быть инструментами для разработчиков и превратились в агентские среды общего назначения.
- Ему не нужно думать на каждом шаге, потому что в документации API уже есть все нужные методы и не нужно смотреть на страницу, чтобы понять куда дальше кликать.
- Насколько это полезно для программирования, LLM-агентов, coding agents или agent workflows?
- Тип 2: скрипт, вызывающий API (сюда же идут все mcp/cli – это просто доп.
- В реальности, это часто не работает – В реальности мы часто не хотим ждать часы, пока агент кликает страницы, или не готовы платить за API.
- Поведение: агент притворяется фронтендом и дергает внутренний API, который мы нашли через "Network" в консоли разработчика.
- Media: document: agents.mp4; animation: CgACAgIAAxkBAANAagyslqlxs-uHSrBzfc5nncCi2jcAAnqTAAKRXElLO_ZlMFUtsCQ7BA
- Не все функции есть в публичном API: в GetCourse нельзя управлять домашками студентов через API
- Или в нем просто нет того, что нужно
- Нужно заранее знать, какие есть селекторы, как обходить пагинацию и т.д.

## Technical details

- Тип 2.2: Неофициальный API (притворяемся фронтендом)
- Аутентификация тут обычно по кукиз, либо вообще отсутствует, если страница доступна без логина (привет, api.hh.ru/search)
- Raw update: `01_sources/raw/telegram/2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов.json`
- Как дать агенту "руки": 4 типа подключения внешних сервисов

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Ему не нужно думать на каждом шаге, потому что в документации API уже есть все нужные методы и не нужно смотреть на страницу, чтобы понять куда дальше кликать.
- Или в нем просто нет того, что нужно
- Нужно заранее знать, какие есть селекторы, как обходить пагинацию и т.д.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.
- Full source text/transcript is not copied into this signal.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official MCP specification and client docs.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- Удалить случайные фразы, вопросы без пользы и source metadata, если они не являются technical signal.
- Добавить missing technical details, agent-design implications, risks, verification tasks and candidate rules.
- После ручного Codex-pass обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.

## Source links

- 00_inbox/telegram/2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов.md
- https://t.me/oestick/505
- 01_sources/raw/telegram/2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов.json
