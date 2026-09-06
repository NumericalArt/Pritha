---
id: agent-result-type
type: standard
status: active
created: 2026-09-06
updated: 2026-09-06
last_reviewed: 2026-09-06
owner: Pritha/user
topics: [agents-mother, agent-contract, result-type, readiness, operations, compatibility]
tools: [Pritha, Node.js, Control Center]
sources:
  - scripts/agents-mother/agent-kind.mjs
  - scripts/agents-mother/identity.mjs
  - tests/agents-mother-agent-kind.test.mjs
related:
  standards: [04_standards/child-agent-identity.md, 04_standards/agent-creation-harness.md]
  workflows: [07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md]
supersedes: []
superseded_by: []
source_version: contract schema v2; unchanged Trial plan v1 and contract fingerprint algorithm
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
subject:
  kind: standard
  id: agent-result-type
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Тип результата агента и применимость operations

Новый authored contract содержит `contract_schema_version: 2` и один
`agent_kind` в frontmatter. Это описание продукта, отдельное от runtime family,
интерфейса и service mode. Значение предлагает interview; `--agent-kind` задаёт
явный выбор. Обе формы создают draft, сохраняя отдельную Outcome approval.

| Тип | Результат |
| --- | --- |
| service | Сервис для запросов пользователя или других систем |
| one-shot-cli | Ограниченный запуск команды с входом, выходом и exit status |
| job-runner | Выполнение заданий по выбранным triggers |
| tool-server | Инструменты для внешнего потребителя |
| library | Импортируемый модуль и контракт интеграции |
| interactive-agent | Работа через диалог, например в Codex project |

`interactive-agent` уточняет исходный перечень roadmap: Codex project без
сервиса не обязательно является одноразовой CLI-программой. Для web/API
предлагается service; для CLI/headless — one-shot-cli. Явные operations и
proactivity также учитываются в предложении. Пользователь утверждает итоговый
контракт, а тип сам по себе не разрешает процессы, расписание или сеть.

Использование runtime family вместо типа смешивало бы способ исполнения и
пользовательский результат. Выведение типа из наличия manifest также неверно:
этот файл мог быть создан старым scaffold автоматически. Отдельное поле
добавляет одну обязанность новому контракту и даёт устойчивое основание для
readiness и handoff без переопределения operations.

## Совместимость и источник

Отсутствие schema version или версия 1 сохраняют `legacy-unclassified`.
Узкое сопоставление известных старых полей даёт только `suggestedKind`; это не
миграция и не подтверждение readiness. Неизвестное значение, версия или
дублированные schema/type поля получают диагностику без эха исходного ввода.

Каталог читает тип из своего authored контракта. Profile, отчёт и generated
registry не переопределяют его. Принятые v1 Markdown, fingerprint, Outcome
locks, approval receipts и immutable Trial plan v1 не переписываются.
Изменение типа в v2 является semantic revision: существующая Outcome approval
перестаёт соответствовать контракту и требует обычного пересмотра.

## Operations без ложной обязательности

CLI и Control Center используют общую `operationsApplicability`. Наличие типа
service или job-runner само по себе не требует local service manifest.
Обязанности определяют явно выбранные service/autostart/proactivity и уже
декларированные runtime/access capabilities manifest.

Accepted contract с `Service mode: none`, `Autostart: disabled | optional` и
`Proactive mode: none | manual` допускает отсутствие manifest. Карточка получает
готовность конфигурации; runtime имеет `not_applicable`. Это не означает
прохождение Trials, готовность Outcome или пользовательскую приёмку.

Выбранные managed operations сохраняют требования к metadata. Неизвестный
выбор остаётся диагностикой для review. Существующий повреждённый или symlink
manifest не считается отсутствующим необязательным файлом: reader сообщает
проблему. Он читает только bounded regular file внутри собственного проекта.
GET не исполняет команды из нового поля или из contract prose.

Следующие пакеты roadmap отдельно добавляют revision-bound result readiness,
approved command probes и handoff по типам. Эта схема не выдаёт их за готовые.
