---
id: 2026-10-21-pritha-agent-knowledge-enrichment-plan
type: workflow
status: completed-with-limitations
created: 2026-10-21
updated: 2026-10-21
topics: [pritha, agent-building-knowledge, research, github-research, evidence-verification, memory-enrichment, harness-evolution]
tools: [Pritha, Codex, GitHub, Markdown, SQLite, MCP Apps, OpenAI Agents SDK, Claude Agent SDK, DeepSeek Harness]
agent_platforms: [Pritha, Codex, Claude, DeepSeek Harness, LangChain, Google, Microsoft]
model_context: [task-specific; versions must be pinned during research or experiment]
runtime_environment: [local research, API documentation, GitHub, isolated experiment]
config_surfaces: [agent-contract, agent-outcome-spec, standards, workflows, registry, SDK options, skills, MCP, runtime settings]
portability: adapter-needed
sources:
  - AGENTS.md
  - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
  - 03_reviews/2026-10-21-agent-stack-repository-assessment.md
  - 03_reviews/2026-10-21-agent-building-repository-shortlist.md
  - 01_sources/registries/github-agent-building-repos.md
  - scripts/lib/github-repository-radar.mjs
  - scripts/agents-mother/github-research.mjs
  - scripts/agents-mother/research-gate.mjs
  - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
  - 05_decisions/2026-10-21-curated-retrieval-promotion.md
related:
  assessments:
    - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
    - 03_reviews/2026-10-21-agent-stack-repository-assessment.md
  reviews:
    - 03_reviews/2026-10-21-agent-building-repository-shortlist.md
    - 03_reviews/2026-09-06-api-process-delivery-factory-review.md
    - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
  decisions:
    - 05_decisions/2026-10-21-curated-retrieval-promotion.md
  standards:
    - 04_standards/expert-information-assessment.md
    - 04_standards/source-retention-and-anonymization.md
    - 04_standards/memory-domains.md
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-minimal-core-extension-surface.md
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-mcp-connector-lifecycle.md
  workflows:
    - 07_workflows/expert-information-assessment.md
    - 07_workflows/privacy-preserving-intake.md
    - 07_workflows/memory-indexing.md
    - 07_workflows/agent-sensor-and-eval-design.md
    - 07_workflows/agents-mother.md
    - 07_workflows/control-center-staged-release.md
  templates:
    - 08_templates/assessment.md
    - 08_templates/brief.md
    - 08_templates/signal.md
    - 08_templates/github-source-registry-entry.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge, governance]
subject:
  kind: workflow
  id: pritha-agent-knowledge-enrichment
privacy: public
retention: durable
review_status: verified-with-limitations
confidence: medium
freshness_status: current
source_published: 2026-10-21
source_updated: 2026-10-21
source_version: enrichment plan v1 with content v2 verification and scoped retrieval promotion
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: executed research and selected improvements; initial results and subsequent content verification remain distinct
temporal_status: version-bound
---

# План обогащения Pritha знаниями об агентных системах

Дата: 21 октября 2026 года. Статус: **completed-with-limitations**. Первый этап сохранён в [историческом execution review](../03_reviews/2026-10-21-pritha-agent-enrichment-execution-review.md): 875 tests pass, filename-proxy retrieval gate failed. Последующее выполнение и текущие ограничения описаны в [verification review](../03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md): новый content eval пройден, curated FTS v2 принят для ручного поиска и agent-building factory research, native Codex и отдельный MCP Apps host проверены, OpenAI SDK имеет один live comparison. Claude live agent loop ожидает API authorization; production SDK executor и MCP host не внедрены.

## 1. Конечный результат

Pritha должна уметь находить проверенные инженерные решения для конкретного
нового агента: объяснять применимость, показывать первоисточник и версию,
отличать факт от гипотезы, предлагать минимальный подходящий набор модулей и
достоверно проверять результат.

Результат этой программы:

1. Карта существующих возможностей и пробелов Pritha с code/test evidence.
2. Содержательно проверенные тематические briefs/reviews по приоритетным темам.
3. Каталог GitHub references с применимостью к agent contracts и явными
   ограничениями; reviewed записи интегрированы в существующий registry.
4. Уточненные standards/workflows/templates там, где доказана повторяемая польза.
5. Retrieval-проверка: новые знания находятся и правильно интерпретируются.
6. Отдельные ограниченные эксперименты и минимальные изменения Pritha,
   которые показали пользу на ее задачах.
7. Итоговый отчет: что добавлено, что проверено, что отложено, что отвергнуто
   и какие открытые вопросы остались.

Успех измеряется полнотой ответов на инженерные вопросы и проверяемой пользой.
Число сохраненных страниц, звезд и установленных библиотек не служит
критерием завершения.

## 2. Исходное состояние перед выполнением

Таблица фиксирует состояние до запуска программы. Завершённые действия, отрицательные эксперименты и оставшиеся watch-направления перечислены в execution review.

| Область | Фактическое состояние на дату плана |
| --- | --- |
| Общий обзор новостей | Есть assessment с первоисточниками и предварительными fit-рекомендациями. |
| MCP Apps / SDK / DeepSeek / Codex | Есть отдельный assessment; глубина чтения различается по объектам. |
| Устаревший Codex-as-MCP transport | Историческая рекомендация помечена outdated и связана с новым assessment. |
| GitHub ссылки | Проверены identity, public visibility и non-archived status десяти candidates; отдельный draft-каталог создан. |
| Глубокое чтение релевантного source/test корпуса | Еще предстоит; README/release review не считается его завершением. |
| Промоция новых candidates в canonical registry | Еще предстоит отдельный curated review. |
| Эксперименты и новые runtime modules | Еще не выполнены этим исследованием. |
| Health Pritha | Предыдущая полная ручная self-test попытка не дала законченного результата; это отдельная незакрытая проверка. |

## 3. Карта тем и приоритетов

| ID | Тема | Главные вопросы подробного исследования | Ожидаемый выход |
| --- | --- | --- | --- |
| K1 | Codex CLI / SDK / App Server | Точный runtime pin; protocol/schema; Goal, history/resume, approvals, usage, steering, retry semantics. | Compatibility review и перечень нужных probes. |
| K2 | OpenAI / Claude SDK | API client vs свой agent loop vs готовый coding worker; state ownership, hooks, permissions, tracing, terms. | Decision matrix для типов будущих агентов. |
| K3 | MCP Apps | Resource/tool protocol, host support, AppBridge, CSP, UI events, fallback и стоимость собственного host. | Brief одного переносимого UI сценария. |
| K4 | DeepSeek / Deep Agents harness | Plugin lifecycle, scoped services, context assembly, durable/live events, recovery, platform-specific ограничения. | Переносимые паттерны и границы применимости. |
| K5 | Feedback и evals | Как обнаружить реальный сбой, подтвердить причину по версии кода и превратить в защищенный Trial. | Карта failure classes и ручной quality workflow. |
| K6 | Память и retrieval | Chunking, русские/смешанные запросы, domain routing, версия embedding, hybrid retrieval, приватность. | Retrieval baseline и сравнение кандидатов. |
| K7 | Быстрые решения и routing | Когда достаточно кода/малой модели; качество выбора, fallback и стоимость успешной задачи. | Один пригодный task class и eval. |
| K8 | Голос | Дополнения к уже существующему Live: backend choice, Decisions, interruptions, late results, intent version. | Ограниченный voice improvement proposal. |
| K9 | Контекст и caching | Стабильный prefix, write/read accounting, compaction, работа после смены модели или tools. | Измеряемая cost/latency рекомендация. |
| K10 | Длительная работа | Checkpoints, resume, environment/session separation, managed vs local, повторение side effects после сбоя. | Recovery review; новый managed provider только при доказанном fit. |

Общие для всех тем: permissions, private data boundaries, независимый
verifier, версии, operational cost и переносимость. Сначала K1 как проверка
основы; затем K5 и K6 как главные кандидаты улучшения самой Pritha. K2–K4
дают библиотеку решений для descendants. K7–K9 следуют после baseline
измерений; K10 остается условным направлением.

## 4. Этап A — установить исходное состояние

### Действия

1. Зафиксировать affected scopes и последние три релевантных accepted
   Good State Baseline. Сохранить их invariants в рабочем review.
2. Искать существующие материалы через FTS и semantic search: сначала
   `agent-building-knowledge`, затем `pritha-self`; `child-agents` читать
   только как evidence сравнительных паттернов.
3. Для каждого предполагаемого улучшения просмотреть код, manifests,
   документацию и относящиеся к нему тесты.
4. Заполнить состояние: `implemented`, `partial`, `planned`, `unknown` или
   `not-needed`. Для `implemented` указать конкретный code path и проверку;
   для `planned` — документ, а не несуществующую возможность.
5. Составить таблицу: проблема пользователя → нынешний механизм → пробел →
   уже имеющаяся альтернатива → ожидаемая польза изменения.
6. До runtime-изменений получить завершенный self-test в подходящем
   окружении, разобрать failures/warnings и отделить infrastructure error
   от product regression. Предыдущую прерванную попытку не считать pass.

### Gate A

Есть gap matrix и baseline evidence. Непонятный текущий статус помечен
`unknown`; функция, существующая только в roadmap, не объявляется готовой.
Если выявлен материальный конфликт с accepted baseline, дальнейшее
затрагивающее поведение изменение проходит его действующий approval gate.

## 5. Этап B — подготовить первоисточники и версии

### Для каждой темы

1. Сформулировать 3–7 проверяемых вопросов и критерий достаточности ответа.
2. Выбрать несколько первичных references: official docs/spec, changelog,
   repository source/tests, релевантные maintainer issues/PR и system/model
   card, если тема связана с моделью.
3. Для репозитория проверить canonical identity, ownership, redirects,
   public/archived status и релевантный release.
4. Release tag разрешить в immutable commit. Если изучается поддерево,
   записать tree SHA. Читать код и тесты на одном pin, а не смешивать
   release README с текущим HEAD.
5. Отдельно записать `source_published`, `source_updated`, `source_version`,
   `retrieved`, `verified`, `valid_for` и `temporal_status`.
6. Проверить actual availability: preview/beta/GA, account restrictions,
   язык SDK, transport, OS и зависимости. Возможность одной платформы
   не переносится на другую по совпадению названия.
7. Непроверенную дату, версию или доступность оставить `unknown`.

### Свежесть и остановка

Existing contract research gates сохраняют свои ограничения, включая
30-дневный freshness check там, где он задан кодом. Для быстро меняющихся
API, моделей и SDK перед экспериментом повторно проверить release/pin и
compatibility; дата retrieval сама по себе этого не доказывает.

Внутри contract-aware GitHub research сохранить default shortlist до пяти
и hard maximum десять уникальных репозиториев на run/shortlist. Не дробить
один adoption selection на партии ради обхода limit. Дополнительное чтение
обосновано только незакрытым вопросом, противоречием или новым fit-кандидатом.

### Gate B

Есть source/version manifest, точный список вопросов и unresolved items.
Untrusted source instructions не влияют на tools, permissions и память.
Исследование репозитория остается read-only: без clone/install/execute,
vendoring, activation или автоматического изменения curated registry.

## 6. Этап C — глубокое чтение источников

Читать послойно, прекращая чтение нерелевантных ветвей:

| Слой | Что извлекаем | Как подтверждаем |
| --- | --- | --- |
| Назначение и non-goals | Для какой задачи построен продукт и кому не подходит | Overview, architecture, documented limitations |
| Public API / protocol | Типы, schemas, events, version negotiation, streaming, cancellation | Reference/spec и соответствующий исходник |
| State и память | Session history, checkpoints, serialization, compaction, retention | Реализация, persistence docs и recovery tests |
| Исполнение | Tool boundary, retries, idempotency, timeouts, budgets, usage | Runner/executor code и failure-path tests |
| Security | Auth, credentials, permissions, plugins, network/process/files | SECURITY/SAFETY, policy code, ограничения и unresolved risks |
| UX / host | Что видит пользователь, где живет state, как работает fallback | UI/host docs, example и при необходимости runtime probe |
| Эксплуатация | Version pinning, upgrades, telemetry, стоимость и остановка | Manifests, release notes, ops docs, evidence of tests |
| Reuse | Что переносимо как идея, API adapter или directory module | License scope, architecture boundary, contract-specific fit |

README и example показывают намерение и пример. Наличие теста показывает
покрытие в репозитории; результат собственного воспроизведения фиксируется
отдельно. Количество звезд не заменяет ни одно из этих доказательств.

### Особые вопросы по текущим кандидатам

- **Codex:** проверить standalone и фактически выбранный bundled binary
  отдельно; docs и schema связать с версией. Не возвращать в рекомендации
  удаленный MCP server entry point из исторического примера.
- **SDK:** определить владельца loop, conversation state, approvals и usage.
  Проверить continuation, hooks, errors/retries, tool evidence и tracing.
  Различать лицензию клиентской библиотеки, runtime и условия API.
- **MCP Apps:** проверить точный host и UI bridge; iframe не заменяет
  авторизацию. Examples и готовность production host — разные объекты.
- **DeepSeek:** изучить scopes, plugin unload и persistence; обязательная
  host policy не должна исчезать при отключении plugin. Developer preview
  и breaking-change constraints сохранить в выводах.
- **Deep Agents:** отделить open-source harness от managed service и
  актуального access tier. Проверять реальные defaults и middleware costs.
- **Google eval tools / AQuA:** найти конкретный code path и pinned examples,
  проверить связь deployment revision, evidence, root-cause hypothesis и fix.
- **Microsoft:** проверить checkpoint/executor identity и различия Python/.NET;
  не предполагать feature parity.
- **Embedding / voice / Decisions / cache:** сначала current model/API card,
  version-specific ограничения, privacy и cost accounting; затем пилот.

### Gate C

По каждому вопросу есть ответ с точным evidence или explicit unknown.
Нет критического вывода, опирающегося только на маркетинговую формулировку.

## 7. Этап D — извлечь полезное в память

### Единица сохраняемого знания

Каждый вывод должен отвечать:

1. Какой инженерный вопрос он решает.
2. Что утверждается: факт, заявление производителя, вывод из исходников
   или гипотеза Pritha.
3. Каким source/version/pin и конкретным разделом или code path он подтвержден.
4. Как устроен reusable pattern или API contract.
5. Когда применять и когда выбрать более простой подход.
6. Какие ограничения, зависимости, permissions, стоимость и failure modes.
7. Насколько вывод переносим между Codex, Claude, API и другими средами.
8. Что есть в Pritha сейчас и какой пробел он закрывает.
9. Какая проверка способна подтвердить предполагаемую пользу.
10. Когда вывод нужно пересмотреть.

### Доказательства не смешивать

В review отдельно отмечать: documented, source-inspected, locally-reproduced,
Pritha-trial-passed и user-accepted. Это описательные отметки evidence,
а не новые автоматически внедренные runtime statuses. Прочитанный README
не повышается до `Pritha-trial-passed`, а модельная уверенность — до факта.

### Авторские артефакты

- `00_inbox/`: нейтральный intake и anonymous source identity.
- `01_sources/notes/`: краткие обработанные заметки без raw provenance.
- `01_sources/signals/`: Codex-refined signal по существующему harness.
- `02_briefs/`: самостоятельные технические объяснения конкретного паттерна.
- `03_reviews/`: evidence, сравнение, fit, GitHub references и открытые вопросы.
- `04_standards/`: только зрелое повторяемое правило после comparison/review.
- `05_decisions/`: решение, альтернативы и причины конкретного выбора.
- `07_workflows/`: проверенная последовательность действий и контроль результата.

Разбивать материал по самостоятельным вопросам, а не по одному файлу на
каждую ссылку. Удобный brief содержит правило, пример, counterexample,
trade-offs и проверку. Число файлов не является плановым KPI.

### Privacy и домены

Raw source payloads, полные README/transcripts, credentials, private logs,
пользовательские предпочтения и реальные private endpoints в tracked память
не переносятся. Официальные technical references допустимы в review и
curated registry; source-material notes/signals сохраняют нейтральные ссылки
на authored artifacts и anonymous source identity.

Общие паттерны получают `agent-building-knowledge`; сведения о текущей Pritha
— `pritha-self`; правила принятия и ограничений — `governance`. Live contracts,
research и reports детей остаются в instance-local agent memory; private
`user-model` не попадает в публичный индекс. Wiki производна от curated layer.

## 8. Этап E — сопоставить с памятью и вынести fit-решение

Для каждого вывода:

1. Найти related standard/decision/review и посмотреть source dates.
2. Записать `confirms`, `refines`, `contradicts`, `supersedes` или `uncertain`.
3. Если прежняя рекомендация устарела, отметить старый artifact и связать
   обе стороны через `supersedes` / `superseded_by`; сохранить историю и scope.
4. Сравнить минимум с текущим путем Pritha и релевантной внешней альтернативой.
5. Пройти lenses: Programming, Architecture, Agent Engineering, Security,
   DX, Evidence и Product Pragmatism.
6. Выбрать `adopt`, `experiment`, `watch` или `skip`, объяснив пользу,
   цену сопровождения и последствия для descendants.

| Решение | Что оно разрешает на этом этапе |
| --- | --- |
| adopt | Продвигать подтвержденное знание или правило в подходящий authored artifact; code adoption имеет собственные gates. |
| experiment | Подготовить проверяемый маленький эксперимент с baseline и rollback. |
| watch | Сохранить ограничения и повод вернуться; расписание не включается автоматически. |
| skip | Сохранить причину отказа, чтобы не повторять ту же оценку без новых данных. |

### Gate E

Есть fit и обоснование по каждому кандидату. Отсутствие выигрыша — допустимый
итог. Новый стандарт не создается, если текущий уже выражает то же правило;
лучше уточнить evidence и границы существующего документа.

## 9. Этап F — сформировать пригодный GitHub registry

Стартовый список находится в
`03_reviews/2026-10-21-agent-building-repository-shortlist.md`.
Он содержит ровно десять проверенных canonical links; это текущая выборка
для исследования, а не ограничение размера всей базы знаний на будущее.

После глубокого review подготовить карточку по
`08_templates/github-source-registry-entry.md`: repo identity, release/pin,
topics/scopes, полезный pattern или module, license evidence, permissions,
alternatives, limitations, contract pattern, relevant review и recheck trigger.

Только затем отдельным curated изменением дополнить
`01_sources/registries/github-agent-building-repos.md`:

- сохранить поддерживаемую таблицу из девяти колонок;
- deduplicate canonical URLs и проверить parser;
- использовать `candidate` / `accepted-for-review` как advisory states;
- различать registry state, Pritha fit и разрешение использовать код;
- вместо звезд как основания указывать конкретный use case и ограничения;
- не фиксировать `HEAD` как воспроизводимый adoption pin.

Для future child contract процесс остается прежним: registry-first, selected
scopes, bounded discovery, current evidence и locked synthesis. Для
`reference-only` — current `github-repository-review` на каждый exact repo.
Для `selected-module` v1 — ровно одна public repo и directory module,
immutable commit/tree pin, module tree SHA, module-local LICENSE/manifest на
том же pin, license blob SHA и content SHA-256, safely detected SPDX,
`license_scope: module-local`, security/permissions review, contract-specific
eval, explicit user approval и current external evidence.

Locked synthesis содержит
`repository_adoption_recommendation: proceed | hold | reject`.
`hold` сохраняет pending, `reject` означает failed; только `proceed` вместе
с остальными gates делает research пригодным для scaffold. Внешний
version-based fallback требует `temporal_compatibility_status: compatible`.
Текстовая рекомендация в review не заменяет эти машинные поля.

## 10. Этап G — проверить память как рабочий инструмент

### Техническая проверка после каждой законченной партии

```sh
node scripts/privacy-audit.mjs --strict
node scripts/validate-memory.mjs
node scripts/rebuild-memory.mjs
python3 scripts/embed-memory.py
node scripts/privacy-audit.mjs --strict
node scripts/query-memory.mjs stats
```

С кешированной установленной моделью допускается offline embedding run.
Generated indexes пишутся через существующий env-first resolver в
`PRITHA_STATE_ROOT`; временная копия внутри checkout не подменяет индекс
экземпляра. Не выполнять одновременно rebuild, embedding и self-test,
который также пересобирает память.

Проверить document IDs, metadata, related/supersedes edges и embedding
coverage измененных chunks. Удаленные/измененные chunks не должны сохранять
устаревшие embeddings. Проверки относятся к текущему index run.

### Содержательная проверка

Подготовить начальные 30 retrieval cases:

- 8 точных вопросов по APIs, modules и protocol;
- 10 смысловых перефразировок на русском и смешанном языке;
- 6 version/status вопросов: актуальное vs историческое, реализованное vs planned;
- 6 negative cases: нерелевантное, отсутствующий факт, synthetic private и
  cross-instance данные, которые не должны оказаться в public retrieval.

Для каждого записать question, правильный artifact/раздел, допустимый ответ,
недопустимый вывод и expected domain. Отдельно сравнить FTS и semantic top-5 /
top-10; при необходимости hybrid вариант. Контрольная часть набора остается
в стороне от настройки chunking и ranker.

Стартовые показатели — baseline, затем same-query comparison: доля найденных
правильных references, version/status accuracy и latency. Целевые пороги
зафиксировать до изменения retrieval. Любая утечка synthetic private data
или представление неподтвержденной гипотезы как verified fact блокирует
принятие соответствующего изменения.

Примеры вопросов: «Нужен ли Agents SDK маленькому HTTP-сервису?», «Чем
Codex SDK отличается от App Server?», «Можно ли копировать модуль по root
license?», «Есть ли в Pritha универсальный анализ рабочих сбоев?», «Что
сломается при unload plugin?», «Нужен ли MCP Apps для обычной web-страницы?».

### Gate G

Новые знания не только проиндексированы, но и доступны по осмысленным
запросам. Ответ возвращается к curated artifacts и первоисточникам,
сохраняет версии, unknown и отрицательные решения.

## 11. Этап H — ограниченные эксперименты

Каждый pilot имеет hypothesis, current baseline, один изменяемый фактор,
version pins, fixtures, бюджет времени/денег/API, pass/fail criteria,
retention boundary и rollback. Доступ к API и фактический provider usage
учитываются отдельно. Сначала cheapest adequate deterministic check;
model judge требует калибровки и не подтверждает acceptance самостоятельно.

| Порядок | Пилот | Что сравнить / проверить |
| --- | --- | --- |
| E0 | Codex compatibility | Версия binary/schema; thread/Goal, approvals, history/resume, interrupt/steer, usage и retry без duplicate effects. |
| E1 | Failure-to-Trial | Несколько synthetic/обезличенных сбоев → evidence → подтвержденная причина → protected regression Trial. |
| E2 | Retrieval | Текущая MiniLM/FTS против candidate index; русские запросы, качество, p95, RAM, rebuild и privacy. |
| E3 | Один MCP Apps View | Read-only memory explorer на подтвержденном host, fallback, корректные filters и запрет лишних tool effects. |
| E4 | Один SDK executor | Тот же Outcome и Trials, success rate, usage/cost, tool history и восстановление. |
| E5 | Fast routing / voice | Один task class; false route, fallback, partial speech, corrections и late results без новых полномочий. |
| E6 | Prompt caching | Один контролируемый API route; стабильный prefix, writes/reads, net cost и latency. |
| E7 | Plugin lifecycle | Изолированный fake-service сценарий load/unload/reload, subscriptions, grants и сохранность mandatory gates. |
| Позже | Managed runtime | Только при подтвержденной операционной проблеме: recovery, state ownership, privacy и полная стоимость. |

Список не обязывает реализовать все pilots. После каждого review оставляет
только эксперименты, отвечающие реальной задаче. Неудачный pilot закрывается
коротким отрицательным результатом и причиной, без навязывания зависимости.

## 12. Этап I — добавить доказанно нужное в Pritha

1. Описать принятую проблему, expected behavior, non-goals и критерий результата.
2. Повторить Good State Alignment для affected surface.
3. Выбрать минимальную форму изменения:
   - уточнение knowledge / standard / workflow;
   - улучшение template или manifest;
   - targeted check / Trial;
   - один adapter или существующий code path.
4. Подготовить минимальный diff и проверку, которая обнаружит исходный сбой
   или доказательно сравнит новый путь с baseline.
5. Выполнить relevant tests; полный self-test завершить перед необходимым
   release/readiness решением. В проекте serial suite ранее занимал около
   десяти минут: планировать достаточное окно в рамках текущих timeout,
   не считать короткую прерванную попытку проверкой здоровья.
6. Проверить accounting, recovery, permissions, private state и отсутствие
   изменения protected verifier со стороны executor.
7. Для UI — render/interaction на нужных viewport и required strict health
   с `/codex` и JavaScript chunks согласно staged-release workflow.
8. Выпуск выполнять через существующий runtime manager, staged pin и rollback;
   непосредственные operational approvals остаются требованиями этого workflow.
9. Сохранить implementation/eval report; обновить inventory, домены и indexes.

Это стадия исходной программы; фактическое выполнение зафиксировано отдельно. Исследование завершилось добавлением knowledge/workflows/eval tooling, без установки SDK, замены CLI, включения service/scheduler, cloud deployment или promotion непроверенного external module.

Для нового child отдельно действуют accepted architecture Contract и
independently approved Outcome Spec. Live artifacts размещаются в
instance-local agent memory, а не в tracked `11_agents/`.

## 13. Проверка результата на сценариях фабрики

Сформировать несколько synthetic briefs: маленький API agent, Codex-native
coding worker, read-only research agent с embedded UI и voice-controlled
agent. Для каждого проверить, что Pritha:

- начинает с результата и текущей памяти;
- выбирает только нужные modules/scopes;
- объясняет текущий путь и релевантную альтернативу;
- находит repo references и их ограничения;
- не требует SDK только потому, что агент использует API;
- не превращает reference-only в code adoption;
- переносит существенные risks и Trials в contract/outcome;
- честно показывает unknown и pending capability.

Это проверка качества архитектурного выбора. Она не требует создавать,
деплоить или публиковать четыре реальных агента ради самого теста.

## 14. Порядок выполнения и результаты каждой партии

| Партия | Содержание | Проверяемый результат |
| --- | --- | --- |
| 0 | Состояние, gaps, baseline, завершенный health check перед code work | Current-state matrix и список незакрытых operational вопросов. |
| 1 | K1/K2 и source identity/version verification | Compatibility review и SDK decision matrix. |
| 2 | K5/K6 и методы evidence / retrieval | Failure classes, reusable briefs и retrieval baseline. |
| 3 | K3/K4, глубокое repository reading | UI/plugin/context patterns, license/permission caveats и карточки candidates. |
| 4 | K7–K10 по фактическому fit | Cost/voice/recovery предложения и обоснованные watch/skip. |
| 5 | Curated memory, registry promotion, retrieval validation | Проверяемая библиотека знаний и корректный поиск. |
| 6 | Выбранные E0–E7 | Comparative evidence, отрицательные результаты и краткий implementation shortlist. |
| 7 | Только доказанно нужные изменения | Минимальные diff, relevant tests, readiness/release evidence по scope. |
| 8 | Synthetic factory cases и handoff | Итоговый отчет с покрытием, выгодой и остаточными вопросами. |

Партия — законченная единица исследования и памяти, а не обязательный день
или отдельный автоматический запуск. Knowledge validation выполняется
после каждой законченной authored партии; сложность runtime работ уточняется
после gap review. Рутинное продолжение не требует повторного согласования
каждого файла; существенные scope/approval границы сохраняются.

## 15. Финальные критерии готовности

- Каждая выбранная тема имеет verified выводы или явно закрыта как watch/skip/unknown.
- Каждый существенный claim связан с подходящим source/version evidence.
- Старые противоречащие рекомендации маркированы и связаны с заменой.
- Registry содержит reviewed candidates и ограничения, без ложных разрешений.
- Retrieval cases находят корректные версии и различают implemented/planned.
- Новые правила применимы к будущим agent contracts и имеют trade-offs.
- Реализованы только изменения, прошедшие свой baseline/eval gate.
- Нет незавершенной проверки, представленной как pass, или machine verification,
  выданной за user acceptance.
- Итоговый отчет показывает: added knowledge, changed behavior, measurements,
  rejected options, remaining questions и где искать первоисточники.

## 16. Результат выполнения

Good State Alignment: aligned с baselines 2026-07-02 и 2026-08-28. Initial self-test 869/869, завершение первого этапа 875/875; последующая verification 879/879 pass. Эти прогоны относятся к разным этапам и сохранены отдельно.

| Этап | Итог |
| --- | --- |
| A | Current-state matrix, limitations и completed baseline health. |
| B–C | 10 exact release commits/tree SHAs, 28 source/test/spec/license blobs с проверенными hashes. |
| D–E | Шесть briefs, deep review, manual Failure-to-Trial и сравнение K1–K10 с текущей памятью. |
| F | 10 curated accepted-for-review entries; registry 14 → 24 уникальных URL; no code-adoption grant. |
| G | Metadata/privacy/indexing проверены. Первоначальный 30-case filename proxy не прошёл gate; последующий 60-case content eval пройден: 45/48 @5, 46/48 @10, 23/24 нового positive holdout @5, leaks/regressions 0. |
| H | Первый этап E0/E1/E2 и E6 arithmetic сохранён. Затем выполнены native recovery/interrupt, отдельный MCP Apps browser pilot и SDK conformance; один OpenAI live comparison пройден. Claude live loop ожидает API authorization. |
| I | Приняты знания, workflow/template, eval tooling и curated FTS v2 только для ручного поиска и agent-building factory branch. Production runtime/SDK executor/MCP host этим решением не заменены. |
| Factory | Четыре synthetic architecture/reference cases pass; live child agents не создавались. |

Проверенные знания и отрицательные результаты входят в память. Непройденный первоначальный gate не переименован в pass: scoped promotion основан на отдельной content fixture v2, зафиксированной до изменения ranker. Раскрытый holdout нельзя использовать для последующей настройки; для следующего существенного изменения ranker нужна новая независимая validation часть. User acceptance, publication и production deployment остаются отдельными событиями.
