---
id: 2026-10-21-agent-updates-for-pritha-assessment
type: assessment
status: draft
created: 2026-10-21
updated: 2026-10-21
topics:
  - agent-engineering
  - frontier-updates
  - pritha-improvement
  - agent-memory
  - context-engineering
  - agent-evals
  - model-routing
  - voice-control
  - long-running-agents
tools:
  - Pritha
  - Codex
  - OpenAI Agents API
  - OpenAI Decisions API
  - GPT-Live
  - Claude
  - Gemini
  - EmbeddingGemma 2
  - Microsoft Agent Framework
  - LangSmith
  - SQLite
agent_platforms: [Pritha, Codex, Claude, Google Antigravity, Microsoft Agent Framework, LangChain]
model_context: [GPT-6.1 Sol, GPT-6 Luna, GPT-Live 1, Claude Opus 5.5, Claude Sonnet 5.5, Claude Haiku 5.5, Gemini 4 Argon, EmbeddingGemma 2, multilingual MiniLM]
runtime_environment: [local desktop, browser, API, cloud sandbox]
config_surfaces: [agent-contract, agent-outcome-spec, AGENTS.md, skills, MCP, runtime settings, eval fixtures]
portability: adapter-needed
sources:
  - source-28d570ef-5e69-49c6-94a0-d0e6ce818cf1
  - https://developers.openai.com/api/docs/changelog
  - https://developers.openai.com/api/docs/guides/agents-api/overview
  - https://developers.openai.com/api/docs/guides/decisions
  - https://developers.openai.com/api/docs/guides/decisions-voice
  - https://developers.openai.com/api/docs/guides/live
  - https://developers.openai.com/api/docs/guides/prompt-caching
  - https://www.anthropic.com/claude-opus-5-5
  - https://www.anthropic.com/claude-sonnet-5-5
  - https://www.anthropic.com/claude-haiku-5-5
  - https://www.anthropic.com/news/an-update-on-independent-evaluators
  - https://www.anthropic.com/research/redesigning-source-control
  - https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/
  - https://developers.googleblog.com/embeddinggemma-2-the-developer-guide/
  - https://developers.googleblog.com/en/the-outer-loop-insights-first-an-ambient-quality-agent-that-diagnoses-your-production-agent/
  - https://developers.googleblog.com/introducing-support-for-local-ai-models-in-the-antigravity-sdk/
  - https://devblogs.microsoft.com/agent-framework/interactive-experiences-memory-and-resilient-execution/
  - https://www.langchain.com/blog/october-2026-langchain-newsletter
related:
  intakes:
    - 00_inbox/texts/2026-10-21-agent-updates-research-intake.md
  signals:
    - 01_sources/signals/2026-10-21-agent-updates-research-signal.md
  assessments:
    - 03_reviews/2026-10-21-agent-stack-repository-assessment.md
    - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
    - 03_reviews/2026-08-22-agent-feedback-sensors-and-evaluation-loops-assessment.md
    - 03_reviews/2026-07-24-production-agent-operating-layer-assessment.md
  reviews:
    - 03_reviews/2026-09-11-pritha-live-voice-migration.md
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
  standards:
    - 04_standards/pritha-self-model.md
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/memory-structure.md
    - 04_standards/user-memory-privacy.md
  workflows:
    - 07_workflows/agent-sensor-and-eval-design.md
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/privacy-preserving-intake.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-10 to 2026-10-20
source_updated: unknown
source_version: official September-October 2026 releases and documentation checked 2026-10-21; per-source context below
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: research agenda as of 2026-10-21; recheck availability and versions before implementation
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

# Assessment: обновления агентных систем для Pritha

Дата проверки: 21 октября 2026 года.
Статус: исследовательская повестка для обсуждения.

## One-paragraph read

Наиболее полезные кандидаты для Pritha: проверка качества по реальным сбоям,
сравнение нового локального поиска и экономная маршрутизация повторяющихся
шагов. Свежие релизы также развивают длительные сессии, голосовую делегацию и
кеширование. Значительная часть архитектурных принципов уже есть в Pritha;
поэтому ценность новости нужно оценивать по конкретному пробелу между
описанным правилом и работающей возможностью. Это обзор и предложения к
экспериментам; изменения runtime и принятых стандартов в эту работу не входят.

## Метод и границы доказательств

- Основное окно — сентябрь и октябрь 2026 года, до 21 октября включительно.
- «Горячая тема» здесь означает свежие релизы и повторение инженерной темы
  у нескольких поставщиков. Статистика упоминаний в социальных сетях и
  сопоставимый количественный рейтинг популярности не собирались.
- Продуктовые возможности проверены по открытым официальным страницам.
  Результаты производительности производителей считаются их заявлениями,
  пока нет сравнения на сценариях Pritha.
- Использованы FTS, curated Markdown, текущий код и Good State Alignment.
  Generated wiki не использовалась как основание для выводов.
- Проверка наличия кода не подтверждает текущую live-конфигурацию каждого
  экземпляра или качество реального голосового взаимодействия.

## Проверенные новости и версии

Все строки получены и проверены 2026-10-21. Если отдельная дата обновления
страницы не указана автором, она остается `unknown`; дата retrieval ее не
заменяет. Для живой документации версионный контекст дает именованный API
и соответствующая датированная запись changelog.

| Поставщик / reference | Публикация или release | Версия и установленный факт |
| --- | --- | --- |
| [OpenAI changelog](https://developers.openai.com/api/docs/changelog) | 2026-09-29 | GPT-6.1 Sol; обновление семейства моделей и multi-agent beta. |
| [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview) | 2026-09-10 по changelog | Public beta; managed Codex harness, durable sessions, compaction, recovery. |
| [OpenAI changelog](https://developers.openai.com/api/docs/changelog) | 2026-10-09; 2026-10-16 | Prewarming sandbox; Artifact SDK в hosted sandbox. |
| [Decisions](https://developers.openai.com/api/docs/guides/decisions) | 2026-10-06 по changelog | Public beta; GPT-6 Luna, типы predicate / choice / score. |
| [GPT-Live](https://developers.openai.com/api/docs/guides/live) | 2026-09-10 по changelog | GPT-Live 1 GA; разговор и backend могут работать одновременно. |
| [Voice Decisions](https://developers.openai.com/api/docs/guides/decisions-voice) | 2026-10-15 по changelog | Native Decisions integration в Live. |
| [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) | 2026-10-20 по changelog | Для поддерживаемых API-запросов добавлен TTL 12h. |
| [Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5) | 2026-09-22 | Новая модель для agentic coding и knowledge work. |
| [Claude Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5) | 2026-09-28 | Обновление модели; экономичность — заявление производителя. |
| [Claude Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5) | 2026-10-07 | Малая модель для частых шагов и субагентов. |
| [Gemini 4 Argon](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/) | 2026-10-13 | Расширенная доступность frontier-модели через API и продукты Google. |
| [EmbeddingGemma 2](https://developers.googleblog.com/embeddinggemma-2-the-developer-guide/) | 2026-10-06 | Локальная модульная embedding-модель для текста, кода и медиа. |
| [Google AQuA](https://developers.googleblog.com/en/the-outer-loop-insights-first-an-ambient-quality-agent-that-diagnoses-your-production-agent/) | 2026-10-08 | Reference для анализа сбоев по trajectories и deployed source snapshot. |
| [Microsoft Agent Framework](https://devblogs.microsoft.com/agent-framework/interactive-experiences-memory-and-resilient-execution/) | 2026-09-24 | AG-UI, память и восстановление workflow; зрелость различается по языку и модулю. |
| [LangChain newsletter](https://www.langchain.com/blog/october-2026-langchain-newsletter) | 2026-10-15 | LangSmith AI Search, Trajectories, Engine v2; Managed Deep Agents v0.9. |
| [Anthropic independent evaluators](https://www.anthropic.com/news/an-update-on-independent-evaluators) | 2026-10-15 | Расширенный доступ независимых оценщиков METR. |
| [Anthropic source control](https://www.anthropic.com/research/redesigning-source-control) | 2026-10-13; updated 2026-10-15 | Scion — внутренняя система для необычно большого масштаба. |
| [Antigravity local models](https://developers.googleblog.com/introducing-support-for-local-ai-models-in-the-antigravity-sdk/) | 2026-09-23 | SDK поддерживает локальные модели; пример Gemma 4 26B A4B / LiteRT. |

## 1. Качество: реальный сбой превращается в проверку

**Новость.** Google опубликовала AQuA: анализ рабочих сессий, группировка
повторяющихся ошибок, независимая проверка находок и диагностика на версии
кода, которая обслуживала сессию. LangSmith развивает поиск по traces и
представление всей последовательности действий.

**Что уже есть.** Стандарт `agent-feedback-sensors-and-evaluation-loops`
прямо отмечает в inventory от 2026-09-06: Trials, protected inputs,
revision-bound результаты и ручные probes реализованы; универсальный sensor
runtime и calibrated LLM judges остаются предложениями. Наличие стандарта
не означает наличие работающей службы анализа качества.

**Кандидат.** Ручной локальный разбор небольшой обезличенной выборки сбоев:
ожидалось / произошло / подтверждающее evidence / причина / regression Trial.
Приоритет — ложное завершение, потеря ограничения, лишний approval,
неверный поиск памяти и повтор действия после retry.

- Pritha/Agents Mother fit: **experiment**, высокий приоритет.
- Отношение к памяти: **confirms + refines**.
- Альтернатива: существующие ручные post-creation reviews без нового runtime.
- Цена и риски: средняя стоимость; модельный judge может ошибаться, а traces
  содержать приватные данные. Исходные traces остаются instance-local;
  curated память получает только проверенный обезличенный вывод.
- Критерий: каждая принятая находка воспроизводится отдельным сценарием;
  предлагаемый fix проходит прежние Trials и независимую проверку.

## 2. Память: сравнить новое локальное retrieval

**Новость.** EmbeddingGemma 2 предлагает локальный text/code encoder и
опциональные медиа-модули. В guide указан минимум `sentence-transformers`
6.1.0; это версия внешнего кандидата, а не требование текущей Pritha.

**Что уже есть.** `scripts/embed-memory.py` и `scripts/semantic-search.py`
используют `paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions. SQLite,
FTS, домены, curated Markdown и приватный контур уже существуют.

**Кандидат.** Отдельный индекс и сравнение текущей модели с новой на 30–50
русских и смешанных запросах по стандартам, решениям и коду. Число запросов —
предложение для небольшого пилота, а не внешний benchmark. Сравнить FTS,
нынешний semantic search и гибридное ранжирование.

- Pritha/Agents Mother fit: **experiment**, высокий приоритет.
- Отношение к памяти: **refines**; Markdown остается canonical knowledge.
- Альтернатива: сначала исправить chunking, фильтрацию домена и ранжирование
  на существующей embedding-модели.
- Цена и риски: средняя; новые зависимости, RAM, повторная векторизация и
  несовместимые embedding spaces. Одинаковая размерность не делает векторы
  разных моделей совместимыми. Не смешивать их в одном retrieval запросе.
- Критерий: полезность top-5/top-10 на размеченных запросах, задержка,
  корректность domain/privacy фильтра и цена полного rebuild. Заявления
  Google о benchmark не доказывают улучшение русского поиска Pritha.
- Медиа-поиск остается отдельным вопросом: он не разрешает сохранять raw
  аудио, видео и пользовательские документы вопреки retention policy.

## 3. Экономика: отдельная модель для отдельного шага

**Новость.** Свежие линейки GPT-6.1 / Claude 5.5 / Gemini 4 расширяют выбор,
а Decisions API и Haiku 5.5 специально выделяют быстрые повторяющиеся шаги.
Decisions возвращает ограниченные типы ответа; это не универсальная замена
генерации JSON, reasoning или tool calling.

**Что уже есть.** `agent-runtime-placement` требует task-based routing,
eval fixtures, fallback и подсчет стоимости. В Live-коде backend по умолчанию
пока `gpt-5.6-terra`; выбранная live-конфигурация здесь не менялась.

**Кандидат.** Проверить классификацию intake, выбор домена памяти и поиск
дубликатов на малой модели; сложный research и coding оставить текущему
основному исполнителю до результатов сравнения. Сравнение frontier-моделей
проводить на одинаковых задачах, инструментах, лимитах и критериях результата.

- Pritha/Agents Mother fit: **experiment**, высокий приоритет.
- Отношение к памяти: **confirms + refines**.
- Альтернатива: детерминированная маршрутизация или текущая единая модель.
- Цена и риски: средняя интеграция, дополнительные credentials/provider
  boundaries, ошибочная маршрутизация и усложнение диагностики.
- Критерий: стоимость успешно завершенной задачи вместе с повторными
  попытками и проверкой, качество классификации, доля fallback, p95 latency.
- Скоростные множители производителей и взаимные model rankings здесь
  не принимаются за независимые результаты для Pritha.

## 4. Голос: октябрьское расширение существующего GPT-Live

**Новость.** С 15 октября документирована native Decisions integration:
быстрые решения по разговору, включая события во время речи.

**Что уже есть.** Review от 2026-09-11 и
`interfaces/control-center/src/lib/realtime/live-session.ts` подтверждают,
что GPT-Live 1 уже интегрирован. Есть отдельные conversation/backend
instructions, Responses delegation, сохранение call results и защита от
повторного выполнения. Settings поддерживают выбор Live / Realtime.

**Кандидат.** Сначала измерить существующий голосовой путь и сравнить backend.
Decisions пробовать только на узком выборе намерения. `delegation.type`
фиксирован на время Live-сессии; новая схема требует отдельной конфигурации
и не является добавлением поля к текущей Responses delegation.

- Pritha/Agents Mother fit: **experiment**, средний приоритет.
- Отношение к памяти: **refines**, без повторного предложения миграции на Live.
- Альтернатива: сохранить текущую Responses delegation и улучшить latency.
- Цена и риски: средняя/высокая сложность protocol adapter; частичная фраза
  может менять смысл, поздний результат — относиться к старому намерению.
- Критерий: русский голос, перебивания, исправление намерения, late results,
  память, музыка, deep-task handoff и отсутствие повторных действий.
- Решение модели не служит approval и не подтверждает фактическое выполнение.

## 5. Долгие задачи: durable execution становится услугой

**Новость.** OpenAI Agents API оформляет managed harness с durable sessions,
восстановлением и выбором environment. Microsoft развивает checkpoint/resume,
а LangChain объявляет Managed Deep Agents v0.9. Разные сервисы имеют разные
стадии доступности; версия v0.9 сама по себе не доказывает public GA.

**Что уже есть.** В Pritha реализованы delivery ledger v2, bounded delivery
loop, separate outcome approval, workspace revision и Trials. Self-model
явно ограничивает v1 одним host и запрещает считать локальный backend sandbox.

**Кандидат.** Прежде внешнего runtime проверить восстановление после потери
соединения, restart процесса и устаревания workspace на текущем control plane.
Managed backend имеет смысл как будущий адаптер для конкретного child
contract, когда он снимает подтвержденную операционную проблему.

- Pritha/Agents Mother fit: **watch** для нового managed provider;
  переносимые recovery-сценарии уже соответствуют имеющемуся направлению.
- Отношение к памяти: **confirms + refines** августовский control-plane review.
- Альтернатива: существующий Codex App Server и локальная delivery.
- Цена и риски: высокая стоимость смены backend, provider state, cloud
  privacy boundary, sandbox/tool permissions и риск повторения side effects.
- Критерий будущего пилота: сохранение intent, approvals, artifact revisions
  и idempotency после сбоя, измеренный выигрыш в сопровождении.
- Сентябрьско-октябрьские релизы не делают августовские snapshots ошибочными;
  они требуют нового выбора доступности перед будущей интеграцией.

## 6. Контекст: кеширование как измеряемая экономика

**Новость.** OpenAI добавила 12-часовое prompt caching. В актуальной
документации запись такого кеша стоит 2.5x обычного input; выгода зависит
от повторного чтения. API-настройки отличаются между семействами моделей.

**Что уже есть.** У Pritha есть структурированные summaries и curated
retrieval, но FTS-проверка не обнаружила отдельного актуального артефакта
о политике prompt caching. Отсутствие FTS-результата не является полным
аудитом всех runtime-настроек.

**Кандидат.** Стабилизировать общий префикс инструкций и tool catalog;
логировать cache read/write usage и итоговую стоимость на выбранном
API-пути. Настройки кеша API нельзя автоматически приписывать Codex App.

- Pritha/Agents Mother fit: **experiment**, средний приоритет.
- Отношение к памяти: **refines** управление контекстом.
- Альтернатива: default retention и более короткий релевантный контекст.
- Цена и риски: низкая/средняя после выбора контролируемого API-пути;
  платные записи, cache misses, privacy/accounting между экземплярами.
- Критерий: чистая экономия с учетом cache writes и задержка до ответа;
  отдельные accounting keys и соблюдение текущей data policy.
- Prompt cache не заменяет память, retrieval или проверку свежести evidence.

## 7. Независимая проверка и инфраструктура вокруг агента

**Новость.** Anthropic расширяет независимую оценку через METR. Ее Scion
показывает другой масштабный эффект agentic coding: проверка и инфраструктура
могут стать ограничением раньше генерации кода. Это не доказательство,
что Pritha нужна новая система контроля версий.

**Что уже есть.** Protected Trials, host-owned approvals, disposable
worktrees и отделение verified / accepted уже закреплены в Pritha.

**Кандидат.** При оценке любого пункта выше проверять, что исполняющий агент
не может переписать проверку, расширить permissions или сам объявить
пользовательское принятие. Новые failure cases пополняют существующие Trials.

- Pritha/Agents Mother fit: **adopt** существующие инварианты при будущих
  изменениях; **skip** миграцию Git ради чужого масштаба.
- Отношение к памяти: **confirms**; нового service или approval слоя этот
  обзор не вводит.
- Цена и риски: низкая для сохранения действующих границ; высокая для
  необоснованной замены инфраструктуры.
- Критерий: checker integrity, запрет ложного completion и сохранение
  пользовательских исправлений и approvals на regression-сценариях.

## Что оставить во втором эшелоне

- **Локальные generative workers.** Antigravity SDK показывает практический
  интерес к local/hybrid execution. Для указанного Gemma-примера Google
  рекомендует больше 24 GB VRAM/unified memory. Это hardware cost, нагрузка,
  качество и сопровождение; малая локальная модель не считается бесплатной.
  Fit: **watch**, пока нет выбранной задачи и hardware/eval evidence.
- **MCP / Agent Skills / A2A.** Это уже существенная часть curated памяти.
  MCP 2026-07-28 и version-aware адаптеры рассмотрены в августовском review
  и текущем connector standard. Их нельзя выдавать за октябрьское открытие
  или автоматически включать всем descendants.
- **Массовая делегация.** Новая доступность субагентов не доказывает пользу
  команды для каждой задачи; сначала сравнить результат, context sprawl,
  latency и стоимость с одним исполнителем.

## Existing knowledge check

| Curated память | Отношение | Практическое следствие |
| --- | --- | --- |
| Feedback sensors, inventory 2026-09-06 | confirms + refines | Дополнить существующие Trials ручным разбором рабочих сбоев в будущем пилоте. |
| Runtime placement | confirms + refines | Новые модели — кандидаты для известных task classes. |
| Memory structure / privacy | refines | Сравнить retrieval, сохраняя Markdown и разделение доменов. |
| Live migration 2026-09-11 и текущий Live-код | refines | Базовый Live уже сделан; исследовать только дополнительные возможности. |
| Control-plane assessment 2026-08-09 | confirms + refines | Новые managed API не отменяют собственные lifecycle и policy contracts. |
| Outcome delivery / ledger v2 | confirms | Подтверждение результата остается вне исполнителя. |
| MCP connector lifecycle | confirms | Сохранить version-aware адаптацию и явный выбор extensions. |

Противоречий, требующих автоматически пометить старый curated артефакт как
outdated/superseded, не установлено. Исторические review сохраняют свой
версионный контекст; это исследование дополняет их.

## Agent environment profile

- Codex остается текущей средой проектирования Pritha.
- Live / Decisions / Agents API, Claude API, Gemini и Microsoft Framework
  требуют собственных adapter и contract-specific проверок.
- Нельзя переносить provider hooks, session identifiers, sandbox обещания
  или manifests между платформами как единый универсальный контракт.
- Benchmarks сравнивать при согласованных tools, effort, budgets и harness.

## Techscope adoption check

Pritha/Agents Mother fit: **experiment** как направление следующего
обсуждения; overall recommendation: **review**. Приоритеты:

| Очередность | Кандидат | Минимальный следующий результат |
| --- | --- | --- |
| 1 | Качество по реальным сбоям | Согласованная таблица failure classes и один воспроизводимый Trial. |
| 2 | Локальный поиск памяти | Небольшой retrieval eval с текущим baseline и отдельным candidate index. |
| 3 | Малая модель / Decisions | Один выбранный task class и сравнение с текущим маршрутом. |
| 4 | Voice Decisions / backend | Измеренная baseline-сессия и ограниченный protocol spike. |
| 5 | Prompt cache | Usage/cost отчет на одном доступном API-пути. |
| Позже | Новый managed runtime | Contract, privacy boundary и recovery-сравнение до интеграции. |

Пилоты не запускались. Существующие workflows уже описывают sensor design,
runtime placement и staged release; новые defaults до обсуждения не нужны.

## Expert lenses

| Угол оценки | Вывод |
| --- | --- |
| Programming | Менять один adapter или task class за раз; фиксировать versions и recovery behavior. |
| Agent Engineering | Наиболее заметный пробел — общий quality loop; базовые durable primitives уже есть. |
| DX | Нужны понятные причины сбоев и полезный поиск, а не дополнительная панель ради панели. |
| Security | Сохранить private state, защищенный verifier и host-owned approvals; output модели не расширяет полномочия. |
| Evidence / Research | Первичные страницы подтверждают доступные механизмы; эффект на Pritha пока гипотеза. |
| Product Pragmatism | Начать с одного пользовательского сбоя или поиска, который сейчас дает слабый результат. |
| Architecture | Сохранить Codex-native core и подключать vendor возможности адаптерами по контракту. |
| Standards Editor | Сначала experiment/review; подтверждения старых принципов не требуют нового стандарта. |

## Scores

Оценки — экспертный приоритет этой исследовательской подборки, не результаты
benchmark и не формальная сумма несопоставимых измерений.

| Dimension | 0–5 |
| --- | --- |
| Programming relevance | 5 |
| Agent engineering relevance | 5 |
| Novelty для Pritha | 3 |
| DX impact | 4 |
| Evidence для наличия механизмов | 4 |
| Evidence для выигрыша на Pritha | 1 |
| Practicality | 4 |
| Leverage | 4 |
| Risk | 3 |

## Good State Alignment

Сверка выполнена через `good-state-alignment` с limit 3 по затронутым темам.
Релевантны baseline Voice Ducking And Control Centers от 2026-07-02 и
Reliable Codex Control Center от 2026-08-28. Классификация: **aligned** —
добавляются knowledge artifacts; runtime, music, native history, approvals,
instance isolation и production lifecycle не меняются. В signal/intake нет
прямых source URLs, raw conversation, credentials и runtime paths.

## Decision

Сохранить как research assessment и разбирать пункты отдельно. Начать с
качества по реальным сбоям или retrieval памяти, затем выбирать конкретный
измеримый эксперимент. Не делать автоматическую миграцию моделей,
инфраструктуры или voice transport на основании этого обзора.

## Проверка артефактов и ограничения диагностики

- Privacy audit в strict-режиме и Markdown validation пройдены.
- Выполнены FTS и semantic-поиск по существующей памяти. Semantic-поиск
  работает с кешированной моделью в offline-режиме.
- Индекс и embeddings пересобираются после финальной записи артефактов;
  проверка результата включает наличие трех новых документов и embedding
  coverage их chunks.
- В последующем выполнении плана полный initial `self-test --no-write` завершён: pass, 869/869 tests, memory/privacy/health checks pass. Финальные изменения и проверки находятся в связанном execution review; первоначальная прерванная попытка не считается pass.

## Next artifact

Отдельный brief выбранного кандидата: текущая проблема, существующая
реализация, альтернативы, границы v1, критерии пользы, стоимость и rollback.

## Дополнительная проверка конкретных инструментов

MCP Apps, OpenAI/Claude SDK, DeepSeek Harness и Codex CLI отдельно рассмотрены
в [assessment агентного стека](2026-10-21-agent-stack-repository-assessment.md).
Там зафиксированы repository/release context, текущие adapters Pritha,
кандидаты экспериментов и исправление исторической рекомендации о Codex
MCP server transport.
