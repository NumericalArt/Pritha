---
id: 2026-10-21-agent-backend-selection
type: brief
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [agent-harness, agent-runtime, sdk, codex, permissions, history]
tools: [OpenAI Agents SDK, Claude Agent SDK, Codex App Server, Responses API]
agent_platforms: [Pritha, Codex, OpenAI, Anthropic, Google, DeepSeek, LangChain, Microsoft]
model_context: [version-bound; no provider performance claim adopted]
runtime_environment: [local research, API, CLI, browser]
config_surfaces: [agent-contract, agent-outcome-spec, memory, tools, permissions]
portability: adapter-needed
sources:
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
  - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
related:
  workflows:
    - 07_workflows/2026-10-21-pritha-agent-knowledge-enrichment-plan.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: brief
  id: 2026-10-21-agent-backend-selection
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2026-09-10 to 2026-10-21
source_updated: unknown
source_version: pinned October 2026 corpus; per-source dates and commits in repository deep review
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: reviewed source versions; runtime adoption requires contract-specific evidence
temporal_status: version-bound
---

# Выбор API SDK и runtime для нового агента

Маленький HTTP-сервис, который вызывает модель и один инструмент, начинает с обычного API client. Agents SDK нужен, когда полезны его loop, handoffs, sessions, tracing и управление approvals. Готовый coding worker выбирают отдельно от бизнес-логики сервиса.

## Матрица выбора

| Задача | Минимальный путь | Кто владеет состоянием и эксплуатацией | Обязательная проверка |
| --- | --- | --- | --- |
| Один structured ответ или небольшой tool loop | OpenAI/Anthropic client SDK и свой код | Приложение | Schema, timeout, budget, external readback. |
| Собственная оркестрация нескольких tools/agents | OpenAI Agents SDK Python или JS | Приложение и выбранный session store | Pending approvals, compaction, pair completeness, retry accounting. |
| Ограниченный Codex coding job | Codex SDK | Локальный runtime и приложение | Реальный runtime pin, итоговый diff, независимый Trial. |
| Нативная история, approvals, события и steering Codex | Codex App Server по stdio | Codex threads и host control plane | Resume, current policy, cancel, usage, ambiguous delivery. |
| Claude Code внутри своего процесса | Claude Agent SDK | Приложение запускает Claude Code binary | CLI parity, permissions/hooks, storage, API auth и Commercial Terms. |
| Удалённый долгоживущий harness | Managed Agents API/runtime при доказанной нужде | Provider и выбранная среда | Session vs environment, retention, recovery, egress, итоговая стоимость. |

[Официальная матрица OpenAI](https://developers.openai.com/api/docs/guides/agents) отделяет Responses, Agents SDK и managed Agents API. [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) запускает Claude Code binary; обычный Client SDK предоставляет API. У Claude TypeScript SDK действует Commercial Terms license; MIT metadata Python wrapper не определяет условия всех компонентов.

## Версии и Codex совместимость

На 21 октября 2026 GitHub stable Codex — **0.163.0**, опубликован 15 октября; **0.164.0-alpha.8** является prerelease. Локально проверен standalone **0.153.0**. Desktop binary в стандартных проверенных locations не найден; это не устанавливает версию работающего удалённого или иначе настроенного instance.

В первоначальном metadata probe из установленного binary получены 304 JSON schema files. В изолированном временном CODEX_HOME реально прошли initialize, thread/start, paused thread/goal/set/get/clear, thread/read и unsubscribe. Goal readback: paused, budget 1000, tokensUsed 0. В этом первоначальном metadata probe модельных turn не было. Schema содержит steer, interrupt, command/exec, approval requests и token usage notification; наличие schema не доказывает полноценную работу этих сценариев.

[Current App Server docs](https://learn.chatgpt.com/docs/app-server) рекомендуют stdio для local integration; WebSocket experimental. Текущая документация Codex SDK больше не рекомендует codex mcp-server; исторический июньский обзор в Pritha помечен outdated. Старый установленный binary может иметь команды, уже удалённые из новых версий.

## Последующая проверка исполнения 21 октября

Реальные модельные runs выполнены на standalone 0.153.0 и изолированной 0.163.0: synthetic MCP receipt, interrupt во время ожидания, cold resume, authoritative readback тем же ключом. Каждый успешный run дал 2 запроса и 1 effect; policy осталась on-request/read-only, usage получена. Для 0.153 выбран доступный gpt-6-astra, для 0.163 — доступный gpt-6.1-sol. Глобальный CLI не обновлялся; это разные измеренные runtime/model комбинации, не сравнение качества моделей.

Ранний probe обнаружил ошибку нашего adapter: resume без явного model выбрал иной account default и получил model-not-supported. Исправлено сохранение observed model при recovery в Pritha. Presence в model/list или schema не заменяет выполненный turn и readback policy/model.

Успешные receipt calls/results восстановились. Прерванный in-flight trial_wait не появился как completed native tool item; нельзя утверждать полноту всех cancelled tool pairs. Для таких calls нужен host cancellation/ambiguous receipt и reconcile. Native transcript остаётся каноническим; добавочная audit запись не подменяет историю.

OpenAI JS 0.21.0 реально прошёл offline scripted-model loop: параллельные calls, пауза до effect, serialized state, restore, narrow approval, reject и usage totals. Claude TS 0.3.306 реально прошёл регистрацию custom tools, MCP handshake и deny private-domain before handler. OpenAI JS дополнительно прошёл live API сравнение с минимальным Responses loop на gpt-5.6-terra: одинаковый Outcome, сохранённые approvals/state и полный call/result. В одном sample — 486 tokens SDK против 489 у baseline; это не general benchmark. Claude live agent loop ожидает API authorization; fixed offline tokens не являются измеренной ценой модели. Подробности: `03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md`.

## Что взять из SDK source

OpenAI Python **0.24.0** откладывает compaction для ожидающих approval и проверяет settling batches. JS **0.21.0** различает tool-call/result correlation и replay safety; failed attempts участвуют в usage. Claude Python **0.2.170** исправляет неполную историю параллельных calls/results; TypeScript **0.3.306** синхронизирован с Claude Code **2.1.306**. Эти версии не взаимозаменяемы между языками.

В новом executor Trial должен проверять множество всех call IDs и result IDs после resume, а не только последний ответ. Решение о повторе не должно опираться на один HTTP timeout: ответ мог потеряться после фактического действия.

## Применение в Pritha

**adopt**: матрица выбора, runtime/schema probe и проверки истории. Это refines текущий App Server backend, без замены транспорта. **watch**: production SDK executor — локальные conformance pilots пройдены, и один OpenAI live comparison пройдены; более широкий contract-specific quality/recovery набор ещё нужен. Добавление SDK без задачи увеличит поддержку и создаст ещё одного владельца состояния.

Для будущего pilot фиксировать provider/runtime versions, один и тот же Outcome, protected verifier, permission surface, tokens всех попыток, стоимость успешной задачи и recovery. Machine verified и user accepted остаются разными состояниями.
