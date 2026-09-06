---
id: 2026-09-05-pritha-budget-continuation-fleet-release-review
type: review
status: deployed
created: 2026-09-05
updated: 2026-09-05
topics: [pritha, fleet, delivery-budget, task-chat, goal, recovery, neuraldeep]
tools: [Git, Node.js, Codex, Next.js, Playwright, launchd]
sources:
  - operator-main-push-canonical-fleet-and-neuraldeep-roadmap-request-2026-09-05
  - https://github.com/NumericalArt/Pritha/commit/68147d8006d5f7c46de3c4acdb1feb64ecdd3662
  - 03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
    - 07_workflows/control-center-staged-release.md
    - docs/update-second-local-macbook.md
  decisions:
    - 05_decisions/2026-09-05-delivery-budget-continuation.md
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: code release 68147d8; five canonical instances; NeuralDeep roadmap handoff 87cc59a
retrieved: 2026-09-05
verified: 2026-09-05
valid_for: this release and the next roadmap session
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Review: выпуск продолжения по бюджету на пяти канонических Pritha

Обезличенный платформенный review по private per-instance release manifests.
Live lifecycle receipts остаются во внешнем state-root каждого экземпляра;
этот документ фиксирует общие изменения, проверку выпуска и дальнейшие задачи.

Пакет `68147d8006d5f7c46de3c4acdb1feb64ecdd3662` включён fast-forward в
`main` и опубликован в `NumericalArt/Pritha`. Основная Pritha, Dasha, Sasha,
Marina и MacBook обновлены через managed staged transactions. Полный roadmap
остаётся `in-progress`: этот выпуск закрывает подготовленные исправления,
учёт расхода и ядро продолжения, сохраняя дальнейшие фазы.

## Состав выпуска

- Bounded synchronous probes, env-first Good State Alignment и fail-closed
  publication guard при неизвестной базе.
- Persisted build thread/Goal, durable executor receipts, recovery без replay,
  ledger v2 и учёт failed/interrupted/overshoot с явным unknown.
- Продление токенов, времени и итераций в том же delivery run; идемпотентные
  amendments и проверка готового результата после лимита.
- Task Chat Goal panel/API с add/set, отдельным resume, readback/reconnect и
  сохранением objective/usage. Delivery accounting отображается на карточке.
- Актуализированный общий roadmap и отдельный CLI/provider roadmap NeuralDeep.

Native Goal задачи и бюджет delivery run остаются разными сущностями.
Текстовый budget intent, Task Chat → run binding для host actions, readiness,
scaffold и повторные live pilots ещё требуют реализации или проверки.

## Применение и изоляция

Перед обновлением сверены recent Good State Baselines, clean `main`, remote,
manager ownership, внешний state-root, agent parent и private fleet manifest.
MacBook выбран по действующему manager configuration; старый study checkout
не обновлялся. Каждый target закреплён полным SHA.

Сохранены пять private snapshots instance state: registry/receipts,
migration metadata, originals и настройки. Общий native Codex home на
основной машине и собственный native home MacBook сохранены отдельно;
SQLite backups использовали online backup API. Нативные transcripts не
replay'ились, private state не переносился между экземплярами.

| Экземпляр | Code/build adoption | State/child fingerprints | Финальный self-test | Strict UI |
| --- | --- | --- | --- | --- |
| Основная Pritha | `68147d8`, verified build ID | Совпадают | pass, 581/581 | 5 страниц, 13 chunks |
| Dasha | `68147d8`, verified build ID | Совпадают | pass, 581/581 | 5 страниц, 13 chunks |
| Sasha | `68147d8`, verified build ID | Совпадают | pass, 581/581 | 5 страниц, 13 chunks |
| Marina | `68147d8`, verified build ID, после rollback/retry | Совпадают | pass, 581/581 | 5 страниц, 13 chunks |
| MacBook | `68147d8`, verified build ID | Совпадают | pass, 581/581, после повторной проверки | 5 страниц, 13 chunks |

После code release память содержит соответственно 775/737/717/711/712
документов; разница отражает собственную instance-local agent memory.
Этот отчёт добавляет ещё один общий документ при заключительной синхронизации.
Git HEAD и build ID сверялись раздельно: HEAD после rollback сам по себе
не подтверждает, какая скомпилированная версия обслуживает пользователя.

На основной машине native SQLite thread inventory и файлы transcripts
сохранились: 258 записей до/после, отсутствующих или укороченных файлов нет.
На MacBook проверены имена и размеры native transcript files; SQLite row
comparison не использовался из-за ошибки read-only открытия у локального
Python SQLite. Это ограничение дополнительной проверки, а не отсутствие backup.

## Проверки и фактические исключения

GitHub [Quality Gate](https://github.com/NumericalArt/Pritha/actions/runs/34012856223)
успешен для Node 20 и Node 22. Strict privacy/pre-push audit всего пакета:
pass, без findings/warnings. Markdown validation, typecheck, staged builds и
семь self-test quality checks прошли. Полный unit набор на каждом экземпляре
содержит 581 тест, все проходят.

В работающей сборке проверен Goal panel на 1280 и 390 px с synthetic API
fixtures: lost response, тот же request ID при retry, сохранение расхода и
истории после reload, отсутствие page errors и неверных chunks. История,
archive/restore, Copy и вложения дополнительно прошли 9 browser scenarios;
один live-upload test пропущен согласно его требованию отдельного isolated
instance. Это не проверка реальных provider turns или мобильного file picker.

Первая транзакция Marina успешно собрала candidate, но не дождалась health.
Updater подтвердил shutdown, восстановил прежний build и проверил rollback;
первый fleet run остановился. Повторная адресная транзакция с 180 s общим
health budget и 20 s на запрос прошла. Затем обновлён MacBook с собственным
snapshot и теми же invocation-only cold-start budgets.

На MacBook первая post-release самопроверка прошла quality/unit проверки,
но зафиксировала timeout Settings при штатном HTTP budget 8 s. Отдельная
проверка с 20 s также поймала медленные ответы. Strict проверка с 45 s
прошла, затем полный self-test повторно прошёл со штатными настройками.
Постоянные таймауты не менялись; service не перезапускался ради скрытия
результата healthcheck. Медленные ответы остаются evidence для 5.1/5.2.

Также выяснено: `pritha-instance.mjs` проверяет внутри транзакции только
`/api/health`, хотя перечисление steps обещает pages/chunks. Поэтому для
этого выпуска полные strict page/chunk проверки выполнены отдельно и
подтверждены после установки. Автоматическое усиление этого gate добавлено
в roadmap как 0.7; работающий ND updater уже имеет полезный reference.

Сохраняются известные warnings: legacy launchd-root drift, рекомендация
обновления Python и прежний Next NFT tracing warning. Tailscale, Telegram,
cron, heartbeat и другие сервисы не перенастраивались. Проверка trusted peer
с телефона не выполнялась и не приравнивается к mobile viewport.

## Передача NeuralDeep

Специализированный roadmap записан в общую память матери и отдельным
документом в ND `07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md`.
Локальный ND commit документа:
`87cc59ae75c5fcd993554b66d120be28e91d741f`.
References матери закреплены на опубликованном `68147d8`; live архитектура
проверена по ND `31b438e`. Исполняемый код, настройки провайдера и build/service
ND не переносились; новый remote для ND не создавался.

План начинает с полного учёта CLI build/summary/probe и durable receipts,
затем даёт same-run extension, общий admission, UI/provider recovery и
readiness/scaffold. Native Goal RPC матери не становится обязательным gate.
Существующий локальный A/B/C/M/S план учтён с поправкой на уже готовый updater.
ND memory/локальные embeddings пересобраны; платных provider calls не было.

## Следующий шаг

Для обычной Pritha: 1.3 и task/run binding части 1.4; до следующего UI rollout
закрыть 0.7, отдельно уменьшить синхронную задержку 5.1/5.2. Для ND: ND-0/ND-1
по её локальному roadmap. Фазы identity/readiness/scaffold и реальные pilots
не объявляются завершёнными этим выпуском.

Заключительный documentation commit содержит этот отчёт и новые статусы
roadmap. Его синхронизация на пяти checkout выполняется fast-forward с
проверкой неизменности исполняемых файлов относительно `68147d8`, пересборкой
локальной памяти и сохранением уже проверенных build IDs.
