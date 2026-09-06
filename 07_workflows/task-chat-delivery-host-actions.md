---
id: task-chat-delivery-host-actions
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [agents-mother, task-chat, delivery, goal-budget, host-verification]
tools: [Pritha, Codex, Node.js, Control Center]
sources:
  - scripts/agents-mother/task-delivery.mjs
  - scripts/agents-mother/delivery-loop.mjs
  - scripts/agents-mother/outcome-spec.mjs
  - interfaces/control-center/src/lib/codex-chat/gateway.ts
  - tests/agents-mother-task-delivery.test.mjs
related:
  standards: [04_standards/child-agent-identity.md]
  workflows: [07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md]
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: workflow
  id: task-chat-delivery-host-actions
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_version: task-delivery control v1; immutable Trial plan v1 retained
---

# Проверки и подготовка передачи из Task Chat

## Пользовательский путь

1. Открыть исходную задачу в Task Chat. Активный шаг и ожидающее подтверждение
   должны завершиться; исчерпанный Goal budget сам по себе не запрещает host action.
2. Раскрыть «Сборка агента», указать точный delivery run ID из результата
   `node scripts/pritha.mjs delivery status <run-id>` и показать сборку.
3. Сверить агента, run, Outcome Spec и одобренный план команд. Нажать
   «Связать эту сборку с задачей». После этого связь восстанавливается из private
   state. Несколько связанных сборок выбираются явно.
4. Нажать «Запустить одобренные проверки». Используются те же Trials и worktree,
   что в `delivery verify`. Host action не вызывает `turn/start`, не меняет
   native Goal, не добавляет build iteration и не создаёт новую задачу.
5. После verification нажать «Подготовить передачу результата». Host повторно
   сверяет Trial evidence, approved plan и рабочую ревизию. Сценарий демонстрации
   доступен в панели; подготовка не подтверждает пользовательскую приёмку.

Проверка выполняется последовательно через выбранный в контракте backend,
с одобренными argv, cwd, isolation и timeout. Вывод команды ограничен 1 MiB.
Delivery loop допускает первоначальную проверку и до трёх повторов после
checkpoint. Эти команды могут вызывать модель, сеть или побочные эффекты;
название `npm test` или `smoke` не является разрешением. Показанный план должен
точно совпадать с одобренной Outcome Spec, включая команды, assertions, demo
и delivery policy. Read-only compiler сохраняет существующий формат plan v1.

## Связь и сохранённые действия

`task-control.json` принадлежит конкретному run в собственном state-root.
Binding сохраняет instance key, постоянный API ID агента, authored ID при
наличии, project, Spec/contract/approval locks, hash всего плана и исходную
native task identity: provider, storage identity и thread ID. Отображаемое имя
не авторизует run. Binding не переносится в другой экземпляр или задачу.
Legacy attribution сама по себе не заменяет точные authored paths и approval.

Native ownership перечитывается до mutation. Операция использует native task
lease и тот же cross-process delivery lease, что CLI. Ожидающая приёмка,
archive и voice continuation сохраняют прежние границы доступа. Goal capability
не нужна для этого host пути. GET читает сведения и не запускает Trials,
agent scripts, build executor или handoff writer.

До выполнения записывается request receipt. Повтор с тем же ID и содержимым
возвращает существующий результат. Потеря HTTP ответа не означает повтор
подпроцесса. После перезапуска сервера незавершённый receipt сначала
сверяется под свободным delivery lease и помечается interrupted; пользователь
видит текущий run и может отдельно выбрать новый запуск. История Trials и
unknown accounting сохраняются. Временная недоступность панели не блокирует
переписку или CLI путь.

Подготовка передачи пишет private `handoff-preparation.json` с binding,
верифицированной ревизией, evidence lock, demo и отдельным acceptance.
Повтор для тех же данных сохраняет исходный документ. GET показывает ревизию,
для которой документ подготовлен; это не обещание свежести изменённого позднее
checkout. Новая подготовка повторяет проверку свежести. Merge, deployment,
публикация и запись user acceptance остаются отдельными действиями.

## Проверки и границы текущего этапа

Синтетические интеграционные тесты создают accepted contract, отдельную
Outcome approval и настоящий disposable Git worktree. Проверяются exhausted
budget → Trials → подготовка demo, неизменность usage и iteration, same-request
replay, interrupted receipt, чужие task/provider/instance, cwd и symlink,
изменение команд при сохранённых старых locks, изменённая рабочая ревизия.
Production gateway проверяется с runtime без Goal control; любой model/Goal RPC
в таком тесте является ошибкой.

Browser fixture использует настоящий Task Chat source и CSS с синтетическим
HTTP на desktop/mobile. Он не заменяет проверку deployed release или платный
provider pilot. Полный accounting parent/Trials, текстовое изменение бюджета
конкретной сборки, readiness по типам агента и окончательный handoff/reconcile
продолжаются в следующих пунктах mother roadmap.
