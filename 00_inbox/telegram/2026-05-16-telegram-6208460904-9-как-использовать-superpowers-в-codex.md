---
id: 2026-05-16-telegram-6208460904-9-как-использовать-superpowers-в-codex
type: intake
status: new
created: 2026-05-16
updated: 2026-05-16
topics: [telegram, inbox]
tools: [telegram-bot]
source_type: telegram
source_url: https://t.me/tosoltaime/42
sources:
  - https://t.me/tosoltaime/42
  - 01_sources/raw/telegram/2026-05-16-telegram-6208460904-9-как-использовать-superpowers-в-codex.json
related: {}
telegram:
  user_id: 6208460904
  chat_id: 6208460904
  message_id: 9
  forwarded_from: Tosol Taimeframes #42
---

# Intake: 2026-05-16-telegram-6208460904-9-как-использовать-superpowers-в-codex

Date added: 2026-05-16
Type: telegram
Source: https://t.me/tosoltaime/42
Status: new

## Why this may matter

- Forwarded to Techscope for later expert assessment.

## Telegram metadata

- User: 6208460904
- Chat: 6208460904
- Message: 9
- Forwarded from: Tosol Taimeframes #42
- Date: 2026-05-16T06:16:40.000Z
- Media: none

## Raw material or link

- https://t.me/tosoltaime/42
- Raw update: `01_sources/raw/telegram/2026-05-16-telegram-6208460904-9-как-использовать-superpowers-в-codex.json`

## Message text

Как использовать Superpowers в Codex.

1. В Codex /using superpowers брейнштормишь идею: понятная спека, scope MVP, user flows, ограничения и критерии готовности.
2. Дальше тесты лучше готовить с другой моделью, которая думает как независимый QA/product reviewer, а не как исполнитель кода. Просим внешнюю модель найти:
- happy path
- плохие входные данные
- security / prompt injection
- UX-краевые случаи
- acceptance criteria
- eval examples
3. Потом возвращаем эти тесты в Codex, желательно как файлы: docs/evals/ , tests/ ,  fixtures/ , acceptance.md
4. После этого Codex сначала делает план на основании спеки и тестов: какие файлы создать, какие модули нужны, какие проверки должны пройти и в каком порядке реализовывать.
5. Затем Codex реализует код так, чтобы тесты проходили: сначала тест падает, потом пишется код, потом тест становится зелёным.
6. В конце Codex проверяет результат не словами, а командами: npm test , npm run lint , smoke checks, eval run

Формула: Spec → External tests/evals → Codex plan → failing tests → implementation → passing tests → verification

Главный принцип: Codex не должен сам себе придумывать проверку после того, как уже написал ответ.

## Initial questions

- Насколько это полезно для программирования, LLM-агентов, coding agents или agent workflows?
- Нужна ли проверка первоисточника?
- Стоит ли превратить это в brief, review, experiment или archive?

## Expected output

brief | review | experiment | archive
