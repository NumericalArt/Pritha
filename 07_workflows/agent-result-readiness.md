---
id: agent-result-readiness
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [agents-mother, outcome-spec, readiness, acceptance, revision-evidence, control-center]
tools: [Pritha, Node.js, Git, Control Center]
sources:
  - scripts/agents-mother/result-readiness.mjs
  - scripts/agents-mother/result-readiness-async.mjs
  - scripts/agents-mother/workspace-revision.mjs
  - tests/agents-mother-result-readiness.test.mjs
related:
  standards: [04_standards/agent-result-type.md, 04_standards/child-agent-identity.md]
  workflows:
    - 07_workflows/task-chat-delivery-host-actions.md
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
supersedes: []
superseded_by: []
source_version: result readiness v1; existing Trial plan/result and ledger wire shapes retained
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
subject:
  kind: workflow
  id: agent-result-readiness
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Подтверждение готовности результата

Карточки Child Agents, страница агента и CLI `card-readiness` показывают
готовность результата отдельно от конфигурации, процесса и истории сборки.
У CLI без выбранного постоянного сервиса процесс не требуется. Сам факт
наличия папки, manifest или Markdown report не подтверждает Outcome.

```sh
node scripts/pritha.mjs card-readiness <agent-id> --no-control-center
```

JSON CLI содержит прежний `readinessScope: card-configuration-only` и
самостоятельный `resultReadiness`. Верхний `ready` не означает успешные Trials.

| Поле | Основание | Граница вывода |
| --- | --- | --- |
| Verification | Текущие собственные contract/Outcome/approval, весь compiled plan, lock Trial result и ревизия canonical project | `verified` только при успешных automated Trials без operator-only/waiver; ручные проверки дают `awaiting_operator` |
| Candidate | Те же доказательства и принадлежащая run ветка сборки | Успех candidate не означает, что commit принят в canonical checkout |
| Acceptance | Matching host event `delivery_accepted_by_user`, exact run/spec/result и версия ledger | Markdown и status ledger сами по себе недостаточны; приёмка прежней версии не становится приёмкой изменённого продукта |
| Runtime | Выбранные operations и отдельные health observations | Health не доказывает Outcome; библиотеке или CLI может не требоваться постоянный процесс |
| Action | Existing control plan и его permissions | Чтение карточки не запускает агент, Trials, merge, recovery или acceptance |

`stale` означает доказанное изменение revision, asserted artifact или Spec.
Недоступные данные, повреждённый lock, недостаточное покрытие файлов и timeout
дают `unknown`. При этом старое подтверждение приёмки и дата сохраняются как
история; текущая совместимость не предполагается. `unverified` означает
отсутствие подходящего доказательства. Старый blocked run остаётся в истории,
даже если его результат отдельно проверен и принят; read model не исправляет
историю без явно запрошенного reconcile.

Чтение revision выполняется в отдельном host worker с общим deadline. Есть
четыре места исполнения, ограниченная FIFO-очередь и объединение одинаковых
одновременных запросов; время очереди входит в deadline. Timeout завершает
только группу созданного worker и возвращает ограниченную диагностику без
сырых stderr. Это граница read-only проверки, которая не блокирует создание
или продолжение агента. Кэш completed verification здесь не используется,
чтобы изменение файлов сразу проверялось заново.

Именованные overrides валидируются общей policy до запуска:

| Policy / переменная | Default | Допустимые миллисекунды |
| --- | --- | --- |
| `workspaceRead` / `PRITHA_WORKSPACE_READ_TIMEOUT_MS` | 5000 ms на Git-команду | 50–30000 |
| `resultReadiness` / `PRITHA_RESULT_READINESS_TIMEOUT_MS` | 5000 ms на запрос вместе с очередью | 100–30000 |

Git read отключает fsmonitor, untracked cache, external diff и textconv.
Strict revision отвергает скрывающие изменения index flags и превышение
границ покрытия файлов. Неполный снимок не выдаётся за полный. Wire format
обычной ревизии и существующих Trial locks сохраняется. JSON evidence читается
только из своего state с ограничением размеров и проверкой symlink boundary.

Проверки используют synthetic approved Outcome, реальные Git/worktree/Trials
и host acceptance receipt: fresh/stale candidate, отдельный canonical checkout,
cleanup, отсутствие acceptance, поддельный report, изменённые locks и unknown
revision. Они не запускают build model и не заменяют ручной pilot. UI проверен
на исходных компонентах с CSS для шести типов результата на desktop/mobile.
Managed adoption, approved CLI command probe, reconcile и первый сценарий
handoff закрываются соответствующими пунктами общего roadmap.
