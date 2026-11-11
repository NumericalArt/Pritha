---
id: opencode-pritha-runtime-assessment-2026-11-01
type: assessment
status: reviewed
created: 2026-11-01
updated: 2026-11-01
topics: [pritha, coding-agents, runtime-adapters, provider-portability, sandbox, task-chat]
tools: [OpenCode, Codex CLI, Codex App Server, OpenRouter, NeuralDeep, MCP]
agent_platforms: [OpenCode, Codex, Claude Code]
model_context: [provider-selected, paired-evaluation-required]
runtime_environment: [CLI, local-server, API, Pritha Control Center]
config_surfaces: [AGENTS.md, SKILL.md, opencode.jsonc, MCP, permissions, provider-drivers]
portability: adapter-needed
sources:
  - https://opencode.ai/changelog
  - https://opencode.ai/v2/docs/providers
  - https://opencode.ai/v2/docs/cli
  - https://opencode.ai/v2/docs/api
  - https://opencode.ai/v2/docs/build/client/
  - https://opencode.ai/v2/docs/permissions/
  - https://opencode.ai/v2/docs/instructions/
  - https://opencode.ai/v2/docs/skills
  - https://opencode.ai/v2/docs/mcp-servers/
  - https://learn.chatgpt.com/docs/app-server
  - https://learn.chatgpt.com/docs/open-source
  - interfaces/control-center/src/lib/codex-chat/driver-types.ts
  - interfaces/control-center/src/lib/codex-chat/gateway.ts
  - scripts/lib/provider-profile.mjs
  - scripts/openai-compatible-codex.mjs
  - scripts/neuraldeep-codex.mjs
  - scripts/openai-compatible/provider-service.mjs
related:
  intakes: [00_inbox/texts/2026-11-01-opencode-runtime-intake.md]
  signals: [01_sources/signals/2026-11-01-opencode-runtime-signal.md]
  reviews:
    - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
    - 03_reviews/2026-10-29-paddock-agent-hub-assessment.md
  decisions:
    - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
    - 05_decisions/2026-11-01-codex-cli-primary-opencode-watch.md
  standards:
    - 04_standards/agent-runtime-placement.md
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/expert-information-assessment.md
  workflows:
    - 07_workflows/2026-11-01-opencode-runtime-experiment.md
    - 07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-10-30
source_updated: unknown
source_version: OpenCode v2.2.5 changelog; live V2 docs; Pritha working tree based on caf5977958e1
retrieved: 2026-11-01
verified: 2026-11-01
valid_for: architectural assessment of the inspected working tree and OpenCode V2 documentation
temporal_status: version-bound
recommendation: archive
pritha_fit: watch
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject: {kind: assessment, id: opencode-pritha-runtime}
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# OpenCode как потенциальный проект для Pritha

Pritha/Agents Mother fit: **watch**. OpenCode сохранён как потенциальный
проект для возможного возвращения в будущем. По принятому решению от
2026-11-01 Pritha продолжает использовать проверенный и отработанный
транспорт через Codex CLI для подключаемых провайдеров и моделей.

Первоначальная рекомендация эксперимента пересмотрена после решения
пользователя: сейчас нет потребности в пилоте, интеграции или замене
транспорта. Техническая оценка ниже остаётся справочным материалом;
преимущество OpenCode над текущим решением не установлено.

## Что уже есть в Pritha

В текущем коде зарегистрированы `codex`, `neuraldeep`, `claude`, `openrouter`
и `local`. Это перечень реализованных направлений подключения, а не проверка
их доступности на конкретной машине.

`TaskChatBackendDriver` уже отделяет операции чата от исполнителя. Gateway
маршрутизирует существующий чат по сохранённому провайдеру; смена default
не переносит его историю. При этом список типов и распознавание namespace
закрыты, а общий attachment manager берётся у Codex backend: добавить OpenCode
можно через развитие существующего слоя, но одной записи в конфигурации мало.
В будущем контракте следует различать task connector, поставщика модели
и execution runtime: OpenCode является исполнителем, а не ещё одним
поставщиком inference. Выбор исполнителя должен сохраняться в binding сессии.

NeuralDeep и OpenRouter вызывают Codex CLI как agent harness. В частности,
OpenRouter использует локальный адаптер протокола, отдельное состояние и
Pritha-owned tools. Поэтому другой поставщик модели пока не устраняет
зависимость этих направлений от поведения Codex. `local` намеренно остаётся
заблокированным для исполнения, пока не подтверждена изоляция сети.

## Проверенные возможности OpenCode

| Возможность | Следствие для Pritha |
| --- | --- |
| Собственные provider packages и совместимые API endpoints | Кандидат на замену части промежуточных адаптеров; экономию сложности нужно доказать. |
| CLI для пакетных заданий, HTTP API и TypeScript client | Можно начать с ограниченных заданий, затем рассмотреть отдельный Task Chat driver. |
| AGENTS.md, skills и MCP | Часть знаний и инструментов можно переиспользовать; Codex plugins и конкретные tool contracts автоматически не переносятся. |
| История и управление сессиями через API | Есть база для интеграции, но нет совместимости с native Codex thread IDs. |

Документация [инструкций](https://opencode.ai/v2/docs/instructions/),
[skills](https://opencode.ai/v2/docs/skills) и
[MCP](https://opencode.ai/v2/docs/mcp-servers/) подтверждает механизмы,
но не доказывает соблюдение правил Pritha конкретной моделью.

## Польза и ограничения

**Потенциальная польза при будущем пересмотре:** независимый исполнитель на случай проблем именно
Codex harness; второй проход review другой моделью; эксперименты с новыми
моделями без перестройки интерфейса Pritha. Вывод о снижении стоимости
остаётся гипотезой: учитывать повторы, проверку результата и сопровождение.

**Уже частично решено:** несколько провайдеров, локальные направления,
история и управление задачами. Их наличие в OpenCode не означает новый выигрыш.
Codex CLI и App Server также имеют
[открытые исходники](https://learn.chatgpt.com/docs/open-source).

**Лимиты:** по [описанию провайдеров OpenCode](https://opencode.ai/v2/docs/providers)
вход с ChatGPT расходует лимиты соответствующего плана. Другой интерфейс сам
по себе не даёт дополнительной квоты. Резерв при недоступности поставщика
требует другого поставщика или независимо доступной локальной модели.

**Права:** [OpenCode Permissions](https://opencode.ai/v2/docs/permissions/)
описывает permissive defaults и shell с полномочиями пользователя хоста.
Для Pritha нужны внешняя изоляция исполнения и явная политика доступа к
private state; одних правил инструментов недостаточно.

**Эксплуатация:** [CLI V2](https://opencode.ai/v2/docs/cli) по умолчанию
использует общий сервер пользователя. Для пилота нужен отдельный процесс
и проверенное раздельное состояние; `--standalone` само по себе ещё не
доказывает изоляцию хранилищ.

**Восстановление:** [TypeScript client](https://opencode.ai/v2/docs/build/client/)
не переигрывает пропущенные события и не восстанавливает подписку автоматически.
Pritha должна сверять состояние сессии после разрыва и сохранять запрет
повторного запуска задачи при неизвестной доставке.

**Сопровождение:** [HTTP API](https://opencode.ai/v2/docs/api) отмечен как
experimental. [Changelog](https://opencode.ai/changelog) фиксирует breaking
changes SDK и событий в 2.1. Нужны фиксация версии и контрактные проверки.
Отдельно проверяются Stop, approvals, attachments, usage и продолжение чатов.

## Сравнение вариантов

| Вариант | Выгода | Цена и рекомендация |
| --- | --- | --- |
| Продолжить текущие адаптеры | Проверенный транспорт, минимальные изменения, знакомый UX | Принятый основной путь; используем Codex CLI. |
| OpenCode для выбранных новых задач | Независимый agent loop и provider ecosystem | Потенциальный проект со статусом watch; пилот отложен. |
| Полная замена Codex | Возможна унификация вокруг OpenCode | Высокая стоимость переноса и регрессий; не планируется. |
| Собственный agent loop | Полный контроль | Наибольшая ответственность за tools, recovery и безопасность; сейчас не оправдан. |

Если вопрос интеграции будет открыт заново, Pritha сохраняет память, contracts, approvals, budgets,
execution ledger и verifier. OpenCode получает только полномочия исполнителя.
История Codex остаётся у прежнего backend; межсистемный переход требует
явной передачи контекста в новую сессию.

## Existing knowledge check

- **Confirms:** assessment control plane от 2026-08-09 — переносимые контракты
  и независимая проверка важнее единого vendor runtime.
- **Confirms:** решение Task Chat от 2026-08-26 — host-owned gateway,
  сохранение истории и отсутствие слепого replay.
- **Refines:** Paddock assessment от 2026-10-29 — общий UI и фактическая
  независимость исполнителей являются разными задачами.
- **Confirms/refines:** provider convergence roadmap от 2026-11-01 — сохраняются
  provider binding, host-owned queue и запрет тихого переключения при ошибке;
  независимость исполнения добавляет отдельную ось будущего выбора.
- Устаревших документов, требующих замены этой оценкой, не выявлено.
- Решение пользователя от 2026-11-01 заменяет первоначальную рекомендацию
  пилота статусом watch; технические факты исследования не пересматриваются.

Good State Alignment: **aligned** для сохранения принятого Codex CLI транспорта
и отложенного статуса OpenCode. Защищены история, instance boundaries и отсутствие повторных запусков
из baseline Reliable Codex Control Center от 2026-08-28. Полная замена
исполнителя этой оценкой не принимается.

## Expert lenses и оценка

Оценки выражают инженерное суждение, не benchmark продукта.

| Измерение | 0–5 | Основание |
| --- | --- | --- |
| Relevance | 5 | Прямо относится к executor layer Pritha. |
| Novelty | 3 | Новый независимый исполнитель; многие функции уже имеются. |
| Practicality | 3 | Пилот ограничен по объёму, интеграция требует проверок. |
| Leverage | 3 | Возможна экономия поддержки adapters; пока гипотеза. |
| Evidence | 4 | Официальные документы и локальный код, без испытаний OpenCode. |
| Freshness | 5 | Документация и release context проверены в день оценки. |
| Temporal context | 4 | Релиз датирован; live docs не закреплены на exact commit. |
| Risk | 3 | Права хоста, shared service, дрейф API и история. |
| Agent-fit | 4 | Подходит как модуль исполнения. |
| Pritha-fit | 2 | Потенциальная польза сохранена; текущей потребности во внедрении нет. |

Programming и Agent Engineering: сравнить выполнение tools и recovery.
DX: сохранить один Task Chat, показывать реальный backend и его возможности.
Security: сохранить host boundary и минимальные права.
Evidence: качество и стабильность неизвестны без парных прогонов.
Product Pragmatism: оценивать стоимость успешно проверенной задачи.

## Freshness и следующий шаг

Проверка — 2026-11-01. Версионный ориентир — v2.2.5 от 2026-10-30;
даты обновления отдельных live docs неизвестны. Исследован рабочий каталог
Pritha с существующими незакоммиченными изменениями на основе caf5977958e1.
Установка, запуск моделей и performance/security certification не выполнялись.

Активного следующего шага нет. [План эксперимента](../07_workflows/2026-11-01-opencode-runtime-experiment.md)
отложен и хранится как справка. Вернуться к вопросу можно при конкретном
ограничении текущего транспорта, существенной новой возможности OpenCode
или новом запросе пользователя. Автоматическое наблюдение и напоминания
не назначены. До сравнительных испытаний нельзя утверждать, что OpenCode
дешевле, быстрее или надёжнее текущих исполнителей Pritha.
