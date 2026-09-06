---
id: task-chat-delivery-host-actions
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [agents-mother, task-chat, delivery, goal-budget, host-verification, budget-continuation]
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
source_version: task-delivery control v1 with scoped budget actions; immutable Trial plan v1 retained
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

## Продление бюджета той же сборки

Для связанного run панель позволяет добавить токены, установить общий token
cap, добавить сборочные итерации и время. Пустые дополнительные поля не меняют
соответствующий лимит. Продление времени после истёкшего срока даёт новый запас
от текущего момента; исходная дата, потраченные токены и выполненные итерации
сохраняются. Результат остаётся в той же рабочей копии и том же run.

В composer поддерживаются полные прямые команды:

```text
Добавь 100 000 токенов к бюджету сборки
Установи бюджет сборки example-run до 500 000 токенов и продолжай
Add 100,000 tokens to this build budget
```

Run, указанный в тексте, имеет приоритет. Иначе используется выбранный в панели
run или единственная связанная сборка. Несколько связей без выбора требуют
конкретизации. Неверный или чужой выбранный run не заменяется другим. Команда
для «бюджета этой задачи» остаётся отдельным native Goal действием.

По умолчанию изменение бюджета не запускает работу. «И продолжай» или checkbox
в панели явно разрешает продолжение delivery loop. Этот путь может вызвать
сборочную модель в пределах approved contract; parent Goal RPC не используется.
Когда другие условия уже выполнены, run доходит до проверенного результата,
сохраняя отдельную пользовательскую приёмку. При оставшемся ограничении панель
показывает состояние текущего run и позволяет выбрать следующее действие.

CLI имеет те же add/set semantics:

```sh
node scripts/pritha.mjs delivery budget example-run --set-tokens 500000 --answered-by user --request-id budget-example-1
node scripts/pritha.mjs delivery resume example-run --add-iterations 3 --add-elapsed-ms 1800000 --answered-by user --request-id budget-example-2
```

Private registry сохраняет разрешённый scope запроса до изменения ledger.
Run receipt и budget amendment имеют постоянные request IDs; повтор не повышает
лимит и не увеличивает версию ledger второй раз. После обрыва между ledger commit
и ответом восстанавливается исходный amendment. Отдельная запись до dispatch
продолжения предотвращает автоматический повтор уже запущенного build. Если
run продвинулся после amendment, старый запрос не запускает новую работу.
Unknown usage остаётся unknown; понижение cap при неполном учёте не разрешается.
История native задачи с binding или budget receipts не считается пустой даже
при отсутствии обычного model turn. Конфликт scope между alias одной задачи
не перенаправляет команду и не отключает чтение истории.

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
provider pilot. Проверяются также add/set, continuation, потерянный ответ,
несколько run, смена выбора между отправкой и retry, reload и CLI set-tokens.
Полный accounting parent/Trials, readiness по типам агента и окончательный
handoff/reconcile продолжаются в следующих пунктах mother roadmap.
