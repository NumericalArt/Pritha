---
id: delivery-usage-accounting
type: workflow
status: active
created: 2026-09-06
updated: 2026-11-01
topics: [agents-mother, task-chat, delivery, token-usage, accounting, runtime-provenance]
tools: [Pritha, Codex, Node.js, Control Center]
sources:
  - scripts/agents-mother/phase-usage.mjs
  - scripts/agents-mother/build-executors.mjs
  - scripts/agents-mother/trial-runner.mjs
  - interfaces/control-center/src/lib/codex-chat/gateway.ts
  - https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs
  - https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadTokenUsageUpdatedNotification.json
related:
  workflows:
    - 07_workflows/task-chat-delivery-host-actions.md
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  decisions: [05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md]
supersedes: []
superseded_by: []
source_version: phase usage v1; existing build ledger and executor receipts v2 retained; upstream main observed 2026-09-06
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
subject:
  kind: workflow
  id: delivery-usage-accounting
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Учёт расхода сборки по областям

Панель сборки Task Chat и `node scripts/pritha.mjs delivery usage <run-id>`
показывают отдельные области. Отсутствие измерения не заменяется нулём.

| Область | Что известно | Что нельзя заключать |
| --- | --- | --- |
| Build executor | Подтверждённые receipts отдельного persisted attempt, source, runtime version, запрошенная модель/effort и наблюдаемая модель/provider при наличии | Нельзя прибавлять Goal usage и token update как два платежа; нельзя объявлять unknown бесплатным |
| Parent Task Chat | Наблюдения счётчика native thread, thread/turn binding, original storage и версия соединения, передавшего событие | Этот thread может обслуживать несколько сборок; его счётчик не является расходом одного run или полным billing total |
| Trials | Invocation, run, plan lock, command hash, backend/runtime и полученное свидетельство завершения команды | Успешная команда не доказывает нулевой расход моделей, вызванных внутри неё |
| Other phases | Явный `not-instrumented` до отдельного adapter | Отсутствующие данные нельзя добавлять как ноль |

`TokenUsageInfo` в исследованном upstream коде накапливает `last` в `total`.
Поэтому snapshots 100, 250, 250 не складываются в 600: сохраняется наблюдение
250. Parent reader использует максимум наблюдавшихся snapshots и всегда
обозначает coverage как partial или unknown. Это счётчик runtime, а не отчёт
провайдера о стоимости. Поля `total` и `last` сверены также с установленной
App Server schema; перенос семантики на другой provider требует отдельной
проверки. [Protocol source](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs),
[notification schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadTokenUsageUpdatedNotification.json).

## Сохранение и восстановление

Parent receipts размещаются в собственном `codex-chat/usage/`; при legacy
layout — в `.private/codex-chat/usage/`. Физические storage/thread имеют один
ключ даже при двух provider aliases. Запись содержит только accounting context,
без текста переписки и attachments. Transport origin передаётся host-кодом
от конкретного соединения, отдельно от входящего JSON. Несовпадающий storage
не авторизует наблюдение для сохранённой задачи.

Повтор одного event не создаёт нового расхода. Failed/interrupted attempt с
неизвестным usage остаётся неизвестным; поздний running event не возобновляет
terminal attempt в журнале. Понижение счётчика отмечается как regression, а не
стирает прежнее наблюдение. Некорректные, чужие и symlink receipts сохраняются
как проблема учёта; reader не выдаёт их за нулевой расход. Ограничение числа
читаемых receipts помечается `truncated`, не запрещая новые записи или работу.

Trials пишут `usage-trials/` внутри собственного run до command dispatch и после
ответа backend. Счётчик токенов этой области остаётся `null`, пока нет отдельного
проверенного adapter измерения. Потеря процесса/ответа оставляет unknown terminal.
Receipt не заменяет существующий Trial result, evidence lock или approval.
Новый явный invocation имеет новый ID; повтор host request использует исходный
результат и не создаёт повторные Trial receipts.

Build executor сохраняет прежние v2 receipts и добавляет runtime/model context.
Только реально полученная модель записывается как observed; запрошенное значение
остаётся отдельным. Старые записи без такой информации остаются читаемыми,
но не становятся доказательством сопоставимости для бюджетной калибровки.

## Границы доказательства

Поле `totalTokens` общего обзора остаётся `null`: shared native counter, build
receipts и непрозрачные команды нельзя представить как точную сумму одного run.
Его token cap продолжает управлять только build executor. При недоступной записи
parent telemetry переписка сохраняет возможность продолжения; coverage не
становится complete. Parent/Trials учёт сам по себе не создаёт Goal, turn или CLI
вызов модели и не сбрасывает существующий бюджет.

Синтетические тесты проверяют дедупликацию, чужие storage/turn/run, неизвестные и
некорректные счётчики, interrupted/failed observations, CLI view, настоящие
локальные Trials, сохранение locked evidence и отделение Goal notifications.
Эмпирические измерения provider, mid-turn overshoot и калибровка остаются
отдельными пунктами 1.6/1.7. Unconfirmed terminal subprocess требует дальнейшей
проверки владения и recovery; свободный lease родителя не доказывает отсутствие
оставшегося дочернего процесса.

## Сборка через выбранный connector

Delivery принимает `--executor codex-app-server|claude-code|neuraldeep|openrouter|local`.
Для внешнего provider явно передаются `--model` и поддерживаемый `--effort`;
исходный контракт сохраняет отдельный Build executor. Выбор исполнителя не
меняет принятые Outcome, Trials, права на проект или runtime ребёнка. Local
зарегистрирован, но reachable endpoint без доказанного offline isolation
остаётся `provider_offline_unverified` и не запускает сборку.

Claude API, NeuralDeep и OpenRouter используют общий протокол disposable Git
worktree, неизменяемых verifier paths, семи host tools, exact command approvals
и instance-private attempt receipts. Build Search выключен: источники заранее
собираются через host external-research. Provider slot общий с Task Chat;
одновременная задача не может обойти его отдельным запуском factory.

До HTTP dispatch host сохраняет резерв: размер текстового запроса в UTF-8 +
8192 framing reserve + разрешённый output. Это консервативная оценка, а не
точный tokenizer count или гарантия billing. Remote/media input, encrypted
reasoning, server-side history и hosted tools не допускаются в text-only build
budget. Output ограничен остатком бюджета и моделью; Gemma 4 thinking build
имеет cap 8192, Qwen/Kimi thinking — до 32768, остальные — до 16384. Независимый
thinking budget NeuralDeep Responses не подтверждён и отклоняется до запроса.

Терминальный tool output выдаётся CLI только после durable usage checkpoint.
При network ambiguity, отсутствующем usage, превышении резерва или ошибке
записи новые запросы закрыты. Unknown не равен нулю. Receipt привязан к
instance, worktree, run, iteration, model, session, process tree и budget ID;
recover не запускает модель и не использует текущий выбранный preset вместо
сохранённой модели. Повтор завершённой attempt возвращает прежний receipt.

Timeout каждой сборки ограничен оставшимся общим elapsed budget. После
истечения времени host подтверждает завершение дерева процессов; до этого
lease и неопределённый расход сохраняются для recovery. Проверки через
установленный CLI с synthetic upstream подтверждают защиту verifier, запись
продукта, measured usage и recovery без повторного dispatch. Они не заменяют
ручную приёмку выбранного реального provider.
