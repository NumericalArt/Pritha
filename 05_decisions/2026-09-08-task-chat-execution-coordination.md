---
id: task-chat-execution-coordination-2026-09-08
type: decision
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

# Решение: параллельный Task Chat и общее владение с Voice

Реализация использует один private SQLite execution store на экземпляр и
приватный Unix socket для обращения к живому владельцу процесса. Нового сервиса,
Redis, TCP broker, cron или launchd job для координатора нет.

## Границы источников истины

| Сущность | Источник истины | Совместимость |
| --- | --- | --- |
| Native transcript и native terminal state | Исходный Codex storage | Не копируется в execution database |
| Новые create/turn intents, постоянные guards, очередь, ownership, native requests | `codex-chat/execution/execution.sqlite`, schema 1 | Не является memory index; rebuild его не удаляет |
| Названия/архивирование чатов, Voice links, attachments, настройки continuation | `codex-chat/registry.json`, format 1 | Все narrow mutations читают свежую версию под общей SQLite metadata lease |
| Новые message receipts | Execution intent | JSON receipt — восстанавливаемая проекция; её отсутствие не разрешает повторный dispatch |
| Старые message receipts | Импортированные permanent guards + сохранённый JSON | Versioned migration receipt фиксирует checksum и количество; receipt не доказывает terminal outcome |
| Текущий RPC / AbortController / ChildProcess | Живой владелец и private IPC | Записанный PID не даёт права посылать сигнал |

Полный перенос всех пользовательских metadata в SQLite не требуется для этой
итерации. Это уточнение условного пункта P1 о переносе registry: у каждой сущности
остаётся одна authority, а совместимый JSON format и узкий интерфейс private-store
сохранены. SQLite и JSON не редактируют execution receipts независимо.

Миграция выполняется под metadata lock, идемпотентно импортирует legacy guards,
сохраняет schema/revision/source checksum. Неподдерживаемая схема, повреждение,
смена migration source или конфликт hash блокируют запись. Повреждённый primary
сохраняется побайтно в private quarantine до восстановления last-known-good копии.
Исходный JSON не удаляется. Смена format registry на v2 не производится.

## Допуск и управление

Пилотный предел — 3 одновременно учитываемых исполнения, с настройкой 1–16 через
`execution-control.mjs`. Снижение предела никого не останавливает. Учитываются
native turns, CLI и неизвестные исходы. Voice владеет workflow между шагами и во
время вопроса пользователю, не занимая вычислительный слот без живого исполнения.

Ключ native ownership: canonical storage identity + native thread ID. Alias
поставщика бинарника не создаёт второй ресурс. Workspace locks учитывают вложенные
пути, допускают несколько readers и конфликтуют с writer. Изолированные worktrees
разделяют файлы; Git management и применение результата получают отдельные locks.
Принятие native approval, расширяющего права, требует эксклюзивного владения общими
ресурсами. Создание агента получает конкретный sibling target и необходимые
instance-local roots фабрики; весь sibling parent не выдаётся как writable root.

`turn/steer` использует исходное соединение и expectedTurnId; model, cwd и schema
этим действием не заменяются. Stop указывает конкретный native turn либо реальный
принадлежащий задаче ChildProcess group. Отмена Voice адресуется владельцу всего
workflow, чтобы он не начал следующий шаг после остановки текущего turn.

IPC socket располагается в собственном каталоге 0700, сокет — 0600, проверяет
локальную capability, ограничивает размер пакета, время и число соединений.
Секретные ответы не сохраняются в mailbox, argv или SQLite; сохраняется только hash
ответа. Потеря ответа после отправки остаётся unknown. Старый owner generation
не может управлять новой задачей. Повторного подключения ради replay нет.

## Очередь, восстановление и UI

Отправка обычным Send не означает автоматическую очередь. Пользователь явно
выбирает «после завершения». Снимок сообщения неизменяем; FIFO связан с точным
предшественником, для Voice — с workflow целиком. Предельные количества: 128
ожидающих typed сообщений на экземпляр, 16 на чат, 64 Voice admissions и 128
неразрешённых native requests. Ограничения проверяются внутри транзакции.
Планирование выбирает следующие допустимые задачи по кругу; один заблокированный
проект не должен задерживать независимые проекты.

Summary SSE: `/api/codex-chat/v1/activity/stream`, bounded recursive polling как
fallback. Новый cursor, потерянный диапазон событий или рестарт требуют snapshot.
Отложенные события не теряются, пока браузер обновляет список/детали. Hidden tab
закрывает summary SSE и снижает частоту polling. История остаётся paginated.

Черновики, revisions и неподтверждённые client IDs сохраняются в tab-local
sessionStorage. Новая вкладка получает свой draft namespace. Перезагрузка не
отправляет сообщение повторно. Метаданные загруженных attachments сохраняются;
незавершённый upload после reload требует повторного выбора файла, пустой placeholder
не отправляется вместо исходника. Secret input не сохраняется в draft storage.

Voice recovery освобождает только фазу, для которой найден точный terminal native
receipt. При отсутствии turn ID нужны совпадение client ID и hash исходного текста.
Ни пустая история, ни idle, ни возраст записи не означают non-delivery. Полный
workflow сохраняет checkpoint и владельца; пользователь может закрыть оставшиеся
шаги адресным Stop после reconciliation и продолжить из сохранённой истории.
Неизвестный CLI исход после потери владельца требует ручной проверки, без kill по
сохранённому PID и без автоматического повторения команды.

## Выпуск и ограничения

У primary/replica новый execution store сначала закрыт для новых запусков.
После strict health конкретной установленной сборки `activate --expected-build`
включает допуск. Runtime manager сначала включает drain; active/unknown ownership
запрещает stop/swap. Первый execution claim устанавливает minimum protocol 1.
Сборка подтверждает протокол marker-файлом, привязанным к BUILD_ID; несовместимая
старая `.next` не стартует поверх нового execution state.

Локальный координатор не управляет внешним Codex/Desktop, который не использует
его протокол. Native active state проверяется перед dispatch, но внешняя гонка
после проверки не объявляется устранённой. Пересечение native bindings разных
экземпляров должно проверяться перед rollout; shared CODEX_HOME сам по себе не
означает безопасный concurrent resume одного thread.

Worktree apply v1 — проверенный fast-forward из исходной base revision с чистым
source и task worktree, затем выбранные проверки. Изменившийся source и конфликт
оставляют результат для отдельного review. Никаких stash/reset/force-push.
Cleanup — отдельная команда после verified apply; ignored/untracked файлы,
активный owner и неперенесённые результаты запрещают удаление.
