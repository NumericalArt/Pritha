---
id: 2026-10-21-agent-stack-repository-assessment
type: assessment
status: draft
created: 2026-10-21
updated: 2026-10-21
topics: [agent-engineering, repository-review, agent-sdk, extension-surface, mcp-apps, codex-cli, runtime-compatibility, pritha-improvement]
tools: [Pritha, MCP Apps, OpenAI Agents SDK, Codex SDK, Claude Agent SDK, DeepSeek Harness, Codex CLI, Codex App Server, Cordis]
agent_platforms: [Pritha, Codex, Claude Code, DeepSeek Harness, MCP Apps hosts]
model_context: [runtime-dependent models; no model comparison performed]
runtime_environment: [local desktop, CLI, application backend, embedded chat UI]
config_surfaces: [AGENTS.md, agent-contract, agent-outcome-spec, SDK options, plugins, profiles, MCP resources, permissions]
portability: adapter-needed
sources:
  - source-9e75c076-d73b-42cf-a96f-c3d9c3c5082c
  - https://github.com/modelcontextprotocol/ext-apps
  - https://github.com/modelcontextprotocol/ext-apps/releases/tag/v2.0.3
  - https://github.com/modelcontextprotocol/ext-apps/blob/v2.0.3/LICENSE
  - https://apps.extensions.modelcontextprotocol.io/api/documents/quickstart.html
  - https://developers.openai.com/api/docs/guides/agents
  - https://developers.openai.com/api/docs/guides/agents/sdk
  - https://learn.chatgpt.com/docs/codex-sdk
  - https://learn.chatgpt.com/docs/app-server
  - https://platform.claude.com/docs/en/cli-sdks-libraries/overview
  - https://code.claude.com/docs/en/agent-sdk/overview
  - https://github.com/anthropics/claude-agent-sdk-typescript/releases/tag/v0.3.306
  - https://github.com/anthropics/claude-agent-sdk-typescript/blob/v0.3.306/README.md
  - https://github.com/anthropics/claude-agent-sdk-python/releases/tag/v0.2.170
  - https://github.com/deepseek-ai/deepseek-harness
  - https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2
  - https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/architecture.md
  - https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/SAFETY.md
  - https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/LICENSE
related:
  intakes:
    - 00_inbox/texts/2026-10-21-agent-stack-repository-intake.md
  signals:
    - 01_sources/signals/2026-10-21-agent-stack-repository-signal.md
  assessments:
    - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
    - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
  reviews:
    - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
    - 03_reviews/2026-06-02-agentic-ui-source-batch-review.md
    - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
    - 03_reviews/2026-09-06-api-process-delivery-factory-review.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-untrusted-input-security.md
  workflows:
    - 07_workflows/agent-sensor-and-eval-design.md
    - 07_workflows/control-center-staged-release.md
supersedes:
  - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
superseded_by: []
freshness_status: current
source_published: 2026-09-25 to 2026-10-21 for dated releases; unknown for live documentation
source_updated: unknown
source_version: MCP Apps 2.0.3; DeepSeek Harness 0.2.1-rc.2; Claude Agent SDK TS 0.3.306 and Python 0.2.170; local Codex CLI 0.153.0; current official SDK documentation
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: research and candidate selection; deployment requires a new version-pinned compatibility check
temporal_status: version-bound
recommendation: review
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self, governance]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Assessment: MCP Apps, агентные SDK, DeepSeek Harness и Codex CLI

Дата проверки: 21 октября 2026 года.

## One-paragraph read

Для Pritha наиболее непосредственно полезно развивать существующий Codex
adapter и проверить один MCP Apps сценарий. OpenAI Agents SDK подходит
будущим API-агентам с собственным loop, Claude Agent SDK — альтернативному
coding executor. DeepSeek Harness дает интересный reference для lifecycle
плагинов и профилей; смена ядра Pritha на developer preview не обоснована.
Это исследование, без установки, активации или выполнения найденного кода.

Граница этого assessment — чтение источников и выбор кандидатов. Последующие native Codex probes, MCP Apps browser pilot, SDK conformance и один OpenAI live comparison вынесены в [verification review](2026-10-21-pritha-retrieval-and-runtime-verification.md). Формулировки о незапущенных экспериментах ниже относятся к первичному source review; текущие результаты и оставшиеся ограничения проверяются по verification review.

## Идентификация и evidence

- MCP Apps рассмотрен как официальный `modelcontextprotocol/ext-apps`.
  Это spec и SDK для встраиваемых UI. Отдельный коммерческий сервис с
  похожим именем этим обзором не оценивался.
- Найден официальный `deepseek-ai/deepseek-harness`. Он отличается от
  LangChain Deep Agents, рассмотренного в предыдущем обзоре.
- SDK рассмотрены по слоям: API client, свой agent loop, управление готовым
  coding agent. Одна библиотека не заменяет все три слоя.
- Репозитории прочитаны через GitHub connector; OpenAI API/Codex guidance —
  через официальную документацию. Clone, install, vendoring и API model
  dispatch не выполнялись. Результатов сравнительного benchmark нет.
- FTS, semantic search, curated Markdown и текущие adapters Pritha дают
  основания для fit; generated wiki не служит доказательством.

## Версии и свежесть

Все references получены и проверены 2026-10-21. Дата отдельного обновления
живой документации неизвестна, если не указана в таблице. Retrieval не
подменяет release date или version context.

| Объект | Проверенный контекст |
| --- | --- |
| MCP Apps | Release `v2.0.3`, 2026-09-25; commit `82221c0c8ce7661efa6771c9d461511b1650495f`. |
| MCP Apps spec / dependencies | README ссылается на spec `2026-01-26`, MCP SDK peers `^2.0.0`; wire protocol 1.x/2.x заявлен совместимым. |
| OpenAI Agents SDK | Python 0.24.0, 2026-10-15; JS 0.21.0, 2026-10-20. Exact commits в связанном deep review. |
| Codex SDK / App Server | Current official documentation; TS и stable Python SDK имеют разные варианты интеграции. |
| Claude Agent SDK TypeScript | `v0.3.306`, 2026-10-21; release указывает parity с Claude Code `2.1.306`. |
| Claude Agent SDK Python | `v0.2.170`, 2026-10-21; исправлено неполное чтение session messages с parallel tool calls. |
| DeepSeek Harness | Prerelease `dsh-v0.2.1-rc.2`, 2026-10-17; manifest `0.2.1-rc.2`; commit `687f282e8625c6b8d11ff58211a90524be2e4317`. |
| Установленный standalone Codex CLI | `codex --version` вернул `0.153.0`; это не подтверждение версии bundled runtime или работающего App Server. |

GitHub releases/latest подтвердил stable Codex `0.163.0`, опубликованный 2026-10-15, commit `83086188ae0614bd882818ff1aa23f3194962012`. Prerelease `0.164.0-alpha.8` учитывается отдельно. Это не installed update target: before-update gate должен проверить выбранный binary/schema и regression Trials. Source reading и локальный no-turn probe описаны в `03_reviews/2026-10-21-agent-repository-deep-review.md`.

## Слои SDK

| Слой | Что дает | Когда выбирать |
| --- | --- | --- |
| OpenAI / Anthropic API client SDK | Типизированные API-запросы, streaming, errors/retries | Приложению нужен доступ к API; бизнес-состояние и loop определены отдельно. |
| OpenAI Agents SDK | Runner, tools, handoffs, guardrails и SDK state | Приложение владеет tools, storage, approvals и своим agent loop. |
| Codex SDK | Запуск, продолжение и resume готового локального Codex | Coding jobs, CI, небольшой программный worker. |
| Codex App Server | History, approvals, streaming events и богатый клиент | Текущий Control Center и delivery integration Pritha. |
| Claude Agent SDK | Claude Code agent loop и инструменты в управляемом приложением процессе | Отдельный Claude executor на Python/TypeScript. |

## 1. MCP Apps

**Подтверждено.** Tool связывается с HTML UI resource, host отображает View
в sandboxed iframe и посредничает в вызовах. Есть React helpers и AppBridge;
поддержка зависит от host. Репозиторий содержит example host, но не обещает
поддерживаемую production host implementation. Release 2.0.3 исправляет
dependency trees примеров, а не библиотечную функциональность.

**Pritha fit: experiment.** Один read-only memory explorer: результат поиска,
фильтры доменов, карточка curated артефакта и ссылка на оригинал. Это
предлагаемый сценарий, а не обнаруженный готовый модуль Pritha. Для child
agents формат может переносить один виджет между поддерживаемыми chat hosts.

**Альтернатива:** обычный React-компонент существующего Control Center.
Она дешевле, если перенос между hosts не нужен. UI framework сам по себе не
добавляет поддержку MCP Apps и не подтверждает capability текущего Codex host.

**Цена:** средняя для одного View; высокая для собственного production host.
Нужны resource/bridge routing, CSP, auth, доступ к данным и fallback.
**Критерий пилота:** реальный рендер на выбранном host, корректный domain
filter, приемлемый UX и отсутствие обхода host permissions через виджет.

**Лицензия:** LICENSE на release описывает переход к Apache-2.0, сохраняет
MIT для не перелицензированных вкладов и CC-BY-4.0 для документации вне spec.
Простой README badge не является полной license scope проверкой модуля.

## 2. OpenAI Agents SDK и Codex SDK

**Подтверждено.** Agents SDK дает приложение-владеющий loop; Codex SDK
программно управляет готовым Codex. Документация рекомендует App Server для
богатых клиентов с auth, history и approvals, SDK — для coding jobs/CI.
Сессия SDK, session Agents API и sandbox являются разными ресурсами.

**Pritha fit: experiment** для нового API child с явными tools/state/approval
требованиями; **watch** для переписывания ядра фабрики. В текущем
`build-executors.mjs` уже есть App Server backend, в `execution-backends.mjs`
— stdio JSON-RPC adapter. Review от 2026-09-06 отдельно установил, что
минимальный Node HTTP service не обязан зависеть от Agents SDK.

Практическая возможность: SDK adapter для выбранного contract вместо
копирования orchestration вручную. Для небольшого API-вызова сначала
сравнивать официальный client SDK с текущим прямым HTTP, без нового Runner.

**Цена:** средняя; две конкурирующие модели continuation, accounting и
approvals увеличивают сопровождение. SDK wrappers не заменяют внешнюю
проверку результата или isolation boundary.
**Критерий:** те же Outcome/Trials, полный usage, корректное resume,
отсутствие повторных side effects и сохранение protected verifier.

## 3. Claude Agent SDK

**Подтверждено.** Это программируемый Claude Code с loop, tools и context
management, Python/TypeScript, sessions, hooks и permissions. API client
Anthropic — другой слой. Текущая документация помечает TypeScript V2 как
removed; старые V2 примеры требуют пересмотра. Python release 0.2.170
исправляет потерю части parallel tool calls при чтении session history.

**Pritha fit: experiment.** Один альтернативный Claude executor для child
agent или отдельного review task, выдающий тот же результат и evidence.
Польза — выбор исполнителя и сравнение на задачах Pritha; superiority и
стоимостный выигрыш пока не доказаны.

**Цена:** средняя/высокая; отдельные credentials, permissions/hooks,
session schema, usage и process lifecycle. Hooks не становятся единственной
защитой. SDK не должен изменять approved Outcome, Trials или approval store.
**Критерий:** одинаковые fixtures, success rate, стоимость завершенного
результата, recovery и отсутствие потери tool evidence.

README TS SDK на указанном tag отсылает использование SDK к Anthropic
Commercial Terms, с исключениями для отдельно лицензированных компонентов.
Этот SDK нельзя считать MIT-пакетом по аналогии с другими agent libraries.

## 4. DeepSeek Harness

**Подтверждено.** Cordis-плагины регистрируют scoped services, events и
reversible effects. Profiles/bundles собирают варианты web/headless/SDK/ACP.
Durable session events отличаются от live agent/capability events. Manifest
задает Node `^22.19.0 || >=24.0.0`; root license — MIT.

**Pritha fit: watch** для runtime, **experiment** для узкого архитектурного
паттерна. Полезно сравнить manifest модулей, teardown подписок и разделение
журнала фактов от process events с уже принятым minimal-core standard.
Нужен небольшой сценарий с fake services, а не полная миграция control plane.

Возможный эффект для Pritha: меньше связности между memory/tools/voice и
явное отключение необязательного модуля без потерянных listeners. Это наша
гипотеза, которую нужно измерять. Полномочия, immutable Trials и host-owned
approvals должны оставаться обязательными вне сменяемого plugin tree.

**Риски:** developer preview и ожидаемые breaking changes; SAFETY прямо
сообщает об отсутствии security audit и production assurance. Sandbox,
permissions и approvals не объявлены достаточной самостоятельной защитой.
**Цена:** низкая для изучения паттерна, высокая для нового runtime.
**Критерий будущего spike:** unload/reload не оставляет tool grants,
subscriptions или незавершенных ресурсов; state восстанавливается и
необходимые safety gates сохраняются. Внешний код сейчас не запускался.

## 5. Codex CLI

**Pritha fit: adopt** существующий путь и **experiment** с version-pinned
совместимостью. Это уже рабочая основа Pritha, поэтому польза конкретна:
сохранить thread/Goal lifecycle, receipts, sandbox policy, usage, steering и
продолжение задач при изменениях протокола.

**Обнаруженная устаревшая рекомендация.** Текущая Codex SDK документация
сообщает: `codex mcp-server` и standalone `codex-mcp-server` удалены;
существующие интеграции переводятся на App Server. Июньский review предлагал
этот transport как текущую adopt-рекомендацию. Она помечена устаревшей и
заменена этим assessment именно в части worker transport; остальные
исторические материалы review сохранены.

Текущий код Pritha использует App Server через stdio. Поиск по выбранным
исполняемым каталогам не обнаружил использования удаленной команды. Это
подтверждает направление, но не является полным fleet/runtime audit.
App Server protocol и transport имеют собственные ограничения зрелости;
новый WebSocket listener нельзя автоматически подставлять вместо stdio.

**Следующий полезный результат:** compatibility checklist для выбранного
CLI pin: initialize/schema, Goal/accounting, approvals, history/resume,
interrupt/steer, command isolation, retries/idempotency. Проверять standalone
и фактически выбранный bundled binary отдельно.
**Цена:** низкая/средняя для probes и targeted regressions; выше для смены
runtime. Установка или автоматическое обновление CLI в обзор не входят.

## Existing knowledge check

| Память | Отношение и следствие |
| --- | --- |
| Agent interface / MCP connector standards | confirms + refines: MCP Apps является выбранным UI adapter, host support остается условием. |
| Minimal core / Pi patterns | confirms + refines: DeepSeek дает дополнительный plugin lifecycle reference, без смены принятого ядра. |
| Runtime placement / harness evaluation | confirms: SDK и executor выбираются по contract и проверяются на одинаковом результате. |
| API process delivery review 2026-09-06 | confirms: не делать Agents SDK обязательным для любого API-проекта. |
| Codex surfaces review 2026-06-02 | supersedes worker-transport guidance: старый Codex-as-MCP-server путь устарел. |
| Общий обзор обновлений 2026-10-21 | refines: новые конкретные candidate adapters и одна корректировка памяти. |

## Priorities and expert lenses

| Кандидат | Для самой Pritha | Для будущих child agents | Цена |
| --- | --- | --- | --- |
| Codex CLI/App Server compatibility | Высокая, существующая основа | Высокая для Codex-native | Низкая/средняя |
| Один MCP Apps View | Средняя при нужном host | Высокая для embedded UI | Средняя |
| OpenAI Agents SDK | Выборочно | Высокая для собственного API loop | Средняя |
| Claude Agent SDK executor | Средняя, сравнение исполнителей | Высокая при выбранном Claude runtime | Средняя/высокая |
| DeepSeek plugin lifecycle | Средняя как pattern | Пока исследование | Низкая для reference, высокая для migration |

Programming/Architecture: один adapter за раз, явное владение state.
Agent Engineering: сохранять evidence и независимый verifier при замене
исполнителя. DX: один полезный UI сценарий вместо общей платформенной
перестройки. Security: plugin unload не ослабляет host policy. Evidence:
release и README подтверждают механизмы, а не выигрыш на Pritha.
Product Pragmatism: сначала выбранная задача и одинаковые Trials.
Standards Editor: runtime defaults остаются прежними; проверенные сведения
уточняют knowledge и план обсуждения.

Оценки 0–5: programming relevance 5, agent engineering 5, evidence наличия
механизмов 4, evidence выигрыша на Pritha 1, practicality 4, DX 4,
leverage 4, risk 3. Это экспертная оценка, не benchmark.

## Good State Alignment and verification

Сверка с limit 3 нашла релевантные baselines 2026-07-02 и 2026-08-28.
Классификация **aligned**: knowledge update сохраняет current runtime,
native history, permissions, instance isolation и protected Trials.
Исследовательские артефакты проходят privacy audit и Markdown validation;
после финальной записи пересобираются memory index и embeddings.
При выполнении плана завершён полный initial self-test: pass, 869/869 tests, memory/privacy/health checks pass. Изолированный Codex schema/paused lifecycle probe прошёл без model turn. Финальные проверки нового retrieval и knowledge записываются в execution review.

## Decision and next artifact

Сохранить как review agenda. Сначала разбирать Codex compatibility или один
MCP Apps use case; для SDK выбрать конкретного child и Outcome; DeepSeek
использовать как архитектурный reference. Следующий brief должен зафиксировать
v1, версии, measurable benefit, проверку отказов и rollback. До такого выбора
новый runtime, SDK dependency, plugin или background process не вводится.
