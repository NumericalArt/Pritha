---
id: task-chat-concurrency-operations-2026-09-08
type: workflow
status: in-progress
created: 2026-09-08
updated: 2026-09-08
topics: [task-chat, voice-control, concurrency, execution-ownership, recovery, themes]
tools: [Pritha, Codex App Server, Codex CLI, SQLite, Node.js, Next.js, Git]
sources:
  - 07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md
  - interfaces/control-center/src/lib/codex-chat/gateway.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - scripts/lib/execution-coordinator.mjs
related:
  workflows:
    - 07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md
    - docs/task-chat-concurrency-operations.md
  standards:
    - 04_standards/control-center-codex-chat-api-contract.md
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
source_version: "Implementation based on 774b2d1d39fb47e966a5e7f4f5f344986fc5a26c; foundation f8331960fc01149adc83ff088b8dcd5777e5f2ec; workspace selector 1da4ea1fd8d2af1e1f4c4804d2264769dd919c88; release pin in handoff manifest"
verified: 2026-09-08
memory_domain: pritha-self
memory_domains: [pritha-self, governance, agent-building-knowledge]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: implementation-validation
confidence: medium
---

# Task Chat: эксплуатация параллельных задач

Использовать окружение конкретного экземпляра. Команды не должны наследовать
state-root соседней Pritha. Control Center требует Node.js ≥22.13; сборка проверялась
на Node.js 24.15.0. Секреты и runtime-state не входят в GitHub/MacBook пакет.

## Работа в интерфейсе

- Новый или существующий чат принимает свой черновик, пока соседние задачи работают.
- «Clarify this turn» уточняет именно текущий native turn. Для вложений используется
  следующее сообщение; runtime capability определяет доступность live steer.
- «Send after completion» фиксирует текст, настройки и вложения для очереди.
  Редактирование черновика после этого не изменяет уже принятую запись. Чтобы изменить
  её, отменить ещё не отправленную запись и добавить новую.
- Вопросы/approvals привязаны к request ID и revision. Voice-вопрос отвечает исходной
  задаче; он не создаёт новый чат или новый workflow.
- Stop означает запрос остановки. «stopping» сохраняется до подтверждения завершения.
  Unknown нельзя лечить кнопкой повторного Send с новым идентификатором.
- Для нового чата выбрать `Isolated workspace` (по умолчанию). При глобальном
  full access этот режим сужает доступ до своей Git worktree. `Read only` запрещает
  запись; `Configured access` сохраняет общие настройки и может ждать освобождения
  общих ресурсов. Существующие чаты и Voice сохраняют прежние scopes. При dirty source
  нужен явный committed base; несохранённые правки исходника не копируются.

## Read-only preflight и включение

```sh
node scripts/execution-control.mjs plan
node scripts/execution-control.mjs status
node scripts/control-center-runtime.mjs status --json
node scripts/control-center-health.mjs --strict --json
```

После согласованного managed rollout и strict health установленной сборки:

```sh
node scripts/execution-control.mjs activate --yes --expected-build <verified-BUILD_ID> --capacity 3
```

`activate` самостоятельно сверяет live instance/build, marker протокола, все страницы
и JavaScript chunks. BUILD_ID взять из release receipt данного экземпляра. Не
активировать несколько primary/replica по одному чужому receipt. При корректном
применении команды её receipt включить в отдельный deployment report.

## Drain, snapshot, restart и rollback

```sh
node scripts/execution-control.mjs drain --yes
node scripts/execution-control.mjs status
node scripts/execution-control.mjs backup --yes --destination <private-state-root>/snapshots/<release>/execution.sqlite
```

Drain останавливает новый допуск, сохраняет ответы/Stop существующих задач. Живой
Voice workflow может закончить уже принятые шаги. Waiting/unknown owners требуют
адресного решения; не удалять их SQL-строки для разблокировки. Backup требует drain
и нулевое число execution owners. `VACUUM INTO` включает committed WAL pages.
Отдельно сохранить registry, last-known-good/quarantine, attachment originals,
Voice requests/status/results/registry и относящуюся к ним native history по private
backup policy. Один скопированный live SQLite файл без WAL не является backup.

Lifecycle `install/start/stop/restart/uninstall` выполняется только по
[staged-release workflow](../07_workflows/control-center-staged-release.md), с
непосредственным approval конкретного действия. `stop` сам закрывает новый допуск
и отказывается прерывать active/unknown task owners. После restart или выпуска
новый допуск включается только отдельной проверенной активацией выше. Не запускать
старую сборку при `execution_rollback_incompatible`; использовать protocol-1 recovery
build и сохранённое актуальное состояние. Восстановление старого общего snapshot
поверх новых receipts запрещено. Для первой legacy-миграции отдельно проверить
старые активные native/Voice задачи, ещё не участвующие в новом координаторе.

## Результаты рабочих копий

```sh
node scripts/task-workspace.mjs list
node scripts/task-workspace.mjs review --id <workspace-id>
node scripts/task-workspace.mjs apply --id <workspace-id> --source-sha <base-SHA> --head-sha <task-SHA> --request-id <unique-ID> --check-script <reviewed-npm-script> --yes
node scripts/task-workspace.mjs cleanup --id <workspace-id> --head-sha <integrated-SHA> --yes
```

Перед apply просмотреть diff, закоммитить только результат задачи и выбрать
относящиеся к изменению проверки. CLI применяет только fast-forward: изменившийся
source требует отдельного разрешения конфликтов и нового review. Ошибка проверки
не откатывает файлы автоматически; результат остаётся `applied_checks_failed`.
Unknown сохраняет ownership до ручного восстановления доказательств. После cleanup
рабочая копия закрыта для продолжения: историю можно читать, новое исполнение
создаётся в новом чате. Не удалять ignored файлы ради прохождения cleanup без
отдельного решения пользователя.

## Отдельная NeuralDeep-линейка

Использовать [инструкцию ND](neuraldeep-task-chat-concurrency-implementation.md).
Stock App Server control/approval capabilities не переносятся в CLI-only transport
как будто они доступны. Общими являются ownership, guards, очередь, draft UI,
resource scopes, process identity, private IPC и release/drain contracts.
