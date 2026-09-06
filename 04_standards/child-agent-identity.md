---
id: child-agent-identity
type: standard
status: active
created: 2026-09-05
updated: 2026-09-06
last_reviewed: 2026-09-06
owner: Pritha/user
topics: [child-agents, identity, instance-isolation, lifecycle-metadata]
tools: [Pritha, Node.js, Control Center]
sources:
  - scripts/agents-mother/identity.mjs
  - scripts/agents-mother/outcome-lock.mjs
  - tests/agents-mother-identity.test.mjs
  - tests/control-center-agent-identity.test.mjs
related:
  standards:
    - 04_standards/child-agent-lifecycle-metadata.md
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
supersedes: []
superseded_by: []
source_version: identity catalog v1
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
subject:
  kind: standard
  id: child-agent-identity
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Идентичность дочернего агента

Идентичность связывает артефакты одного агента. Она сама по себе не подтверждает
одобрение, прохождение Trials, acceptance или владение процессом. Эти решения
по-прежнему требуют отдельных доказательств от host.

## Выбор идентификатора

| Основание | Применение | Ограничение |
| --- | --- | --- |
| Отображаемое имя | Поиск и legacy-диагностика | Меняется; разные агенты могут называться одинаково |
| Путь проекта | Точная привязка каталога и run | Может измениться; чужой parent и symlink недопустимы |
| Постоянный authored ID и экземпляр | Основная идентичность | Перенос state-root требует отдельной сверки привязок |

Новые interview-контракты получают `agent_id`, производный от уникального ID
артефакта контракта. Следующие ревизии сохраняют его; одинаковое имя двух новых
проектов не делает их одним агентом. Outcome Spec наследует этот ID в
`subject.id`, scaffold report — в `agent_id`. Delivery report получает ID
только из точного контракта с совпавшим fingerprint. Формат immutable Trial
plan v1 сохранён: run связан через существующие Spec/contract locks и approval
receipt. `agent_slug` остаётся совместимой технической меткой.

Precedence: `agent_id`, затем `subject.id` только для `subject.kind: agent` или
`child-agent`. Если оба поля заданы, они должны совпадать. Неизвестный формат,
противоречие или не-child subject не исправляются нормализацией имени.
Outcome approval отклоняет ID, противоречащий ID связанного контракта.

`instance_key` вычисляется из канонического state-root. API ID включает этот
ключ и идентичность агента; кодовый checkout и отображаемое имя не являются
источником instance ownership. Если артефакт явно указывает чужой
`instance_key`, он исключается с диагностикой. При отсутствии поля приватное
расположение определяет экземпляр, но legacy attribution не становится approval.

## Связи и границы

Каталог читает только собственные contracts, profiles и reports из
instance-local agent memory. Внешний state-root исключает fallback к tracked
истории `11_agents/`. JSON/Markdown читаются как ограниченные обычные файлы;
symlink не используется для обхода memory или project boundary.

`contract_path` и единственный `related.agent_contracts` разрешаются точно
относительно code root, включая допустимый путь к собственному external
state-root. Сравнение по basename, substring имени файла или произвольному
упоминанию имени в тексте не допускается. Frontmatter-only отчёт с ID достаточен
для attribution. Конфликт ID и contract path исключает этот артефакт.

Для мигрированной истории есть один узкий adapter: относительный префикс
`11_agents/contracts/` может указывать на одноимённый файл только в собственной
agent memory. Он получает `legacy-memory-path-not-approval`; approval store и
locks не переписываются и не получают разрешение через этот adapter. Произвольный
путь с тем же basename по-прежнему отвергается.

Старые placeholder-пути sibling и простые записи в backticks используются
только для точной attribution внутри собственного parent. Пояснение со
смешанными путями остаётся `legacy-project-description-not-binding` и не
перекрывает однозначную декларацию. Машинный `project_path` таким пояснением
не считается. Legacy ревизии и отчёты без имени объединяются лишь при точном
единственном проекте, с сохранением legacy-диагностики.

Явный project path должен оставаться внутри `PRITHA_AGENT_PARENT`; допустим
явно выбранный вложенный каталог без symlink и без прохода через checkout
другой Pritha. Конфликт нескольких путей для одного ID или нескольких ID для
одного проекта требует reconciliation; первый найденный путь не выбирается.

Legacy документы могут сопоставляться по точному нормализованному имени или
technical slug, только если кандидат единственный. Диагностика сохраняется.
Одинаковые имена с разными ID и чужие экземпляры не объединяются. Старый URL
карточки остаётся alias только при единственном совпадении в этом экземпляре.
Старый snapshot ID допустим лишь при совпадении текущих project и contract;
остальные проверки snapshot и подтверждение восстановления сохраняются.

## Проекция карточек

Registry — производная проекция, общая для CLI и Control Center. Новая версия
registry не используется как повторный authored источник идентичности.
Миссия берётся из собственного профиля, затем контракта; неполные данные
остаются явно неполными. Подготовленный профиль не подтверждает delivery.

Индекс кеширует parsed metadata на ограниченный срок до двух секунд; изменение
состава каталогов сбрасывает его раньше. Выбранный источник миссии проверяется
при каждом чтении, поэтому её изменение видно без rebuild registry. Host
действия требуют fresh lookup и независимо проверяют свои locks/receipts.
Кеш не является разрешением на выполнение действия.

Live delivery показывается только при точном совпадении project, contract
fingerprint, Spec ID, semantic/document locks и approval receipt. Одинаковое
имя агента или target label не заменяет эту связь. Расчёт document lock общий
с CLI; ранее одобренные документы не требуют переподписания из-за refactor.
HEAD/Trial freshness, acceptance и Task Chat binding остаются отдельными
проверками соответствующих этапов roadmap.

## Проверка изменений

Regression fixtures покрывают frontmatter-only, rename, одинаковые имена,
чужой экземпляр, конфликт ID/path, legacy attribution, symlink, неправильный
contract binding, повтор registry и обновление миссии. Production selectors
проверяются с реальным созданием и одобрением синтетического Outcome Spec,
после чего по одному подменяются project, locks и host approval receipt.
Фикстуры не означают acceptance реального пользовательского агента.
