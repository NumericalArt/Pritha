---
id: delivery-facts-reconciliation
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [agents-mother, delivery, reconciliation, revision-evidence, host-verification, recovery]
tools: [Pritha, Node.js, Git]
sources:
  - scripts/agents-mother/delivery-reconcile.mjs
  - scripts/agents-mother/delivery-loop.mjs
  - tests/agents-mother-delivery-reconcile.test.mjs
related:
  workflows:
    - 07_workflows/agent-result-readiness.md
    - 07_workflows/task-chat-delivery-host-actions.md
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  standards: [04_standards/child-agent-identity.md, 04_standards/agent-trajectory-control-and-evidence.md]
supersedes: []
superseded_by: []
source_version: delivery reconciliation v1; existing Trial and ledger schemas retained
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
subject:
  kind: workflow
  id: delivery-facts-reconciliation
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Сверка фактов завершения сборки

Результат в canonical checkout может быть проверен, пока история run всё ещё
содержит blocked. Read model карточки показывает эти факты раздельно. Явный
reconcile связывает их без новой сборки, merge, cleanup или приёмки.

```sh
node scripts/pritha.mjs delivery reconcile <run-id>
node scripts/pritha.mjs delivery reconcile <run-id> --apply --plan-lock <planLock-from-preview>
```

Первая команда только читает и возвращает план. `planLock` связывает конкретный
просмотренный snapshot с применением; это проверка актуальности действия.
План содержит instance/agent/run, target, version и hash ledger, актуальные
contract/Spec/approval через весь Trial plan, последний result, canonical HEAD
и полную revision token, candidate revision и handoff preparation receipt.
Запуск apply перечитывает факты под тем же execution lease, что CLI/Task Chat.
Изменившийся план не применяется к новой версии без её просмотра.

| Наблюдение | Результат |
| --- | --- |
| Canonical project чист и соответствует успешным approved Trials | Можно записать verification или awaiting_acceptance, сохранив usage и исходный run |
| Проверена только candidate ветка, canonical project отличается | Pending; adoption/merge остаётся отдельным действием |
| Dirty tree, изменённые Spec/result/locks, неизвестный revision | Pending; старые факты сохраняются |
| Build attempt не подтверждён terminal или claim принадлежит другой активной сборке | Pending; reconcile не вмешивается в продолжающуюся работу |
| Есть host handoff preparation с matching binding/spec/result/revision | Видно prepared_for_review; это не handed-off и не accepted |
| Есть лишь Markdown «готово» или поддельная запись приёмки | Не является основанием для acceptance |

Apply добавляет `delivery_facts_reconciled` в durable event log и собственный
receipt. Историческое blocked событие остаётся; новые события не выдают его
за успешную сборку в прошлом. Существующая приёмка не создаётся заново и не
переписывается. Release снимает только собственный target claim завершённого
run; worktree, файлы продукта, процессы и расписания не затрагиваются.

Повтор с тем же `planLock` возвращает записанный результат и отдельный текущий
статус. Такой receipt относится к прежнему snapshot; сегодняшнюю свежесть
показывает readiness reader. Обрыв между event, ledger snapshot и финальным
receipt восстанавливается по тому же событию без нового перехода. Если после
него работа продолжилась, более новый статус и активный claim сохраняются.

## Повторная проверка изменённого продукта

```sh
node scripts/pritha.mjs delivery verify <run-id>
```

Эта команда и host action Task Chat повторяют одобренные Trials на candidate
в рамках прежнего run, без build model turn и изменения бюджета. Предыдущие
Trial result files остаются неизменными; новый результат получает следующий
номер. Успешная прежняя проверка и устаревший reference больше не запрещают
новый явный verification request. Сохраняются обычные verified checkpoints
в disposable worktree; canonical checkout не меняется.

Текущий approved plan и существующий protected-input baseline проверяются
до повторного исполнения. Изменённый verifier нельзя заново объявить исходным
только потому, что запрошена проверка. Accepted, cancelled и abandoned run
не открываются таким запросом заново. Unknown usage остаётся unknown; host
verification требует подтверждённого terminal/archived attempt. Для следующего
model turn по-прежнему нужен разрешённый бюджет и полный accounting.

Синтетические тесты выполняют реальные CLI, Git, Trials и host receipts:
план без записи, apply/replay, stale product/Spec/result/ledger, отдельный
candidate, matching handoff, interrupted receipt/snapshot, более новый progress,
execution lease и подмена пути. Они не являются эмпирическим model pilot.
Host verifier provenance и negative control развиваются отдельно в 4.1;
authored profile и выдача первого сценария handoff — в 0.5/2.6/3.3.
