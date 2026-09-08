---
id: task-chat-voice-concurrency-audit-2026-09-08
type: review
status: draft
created: 2026-09-08
updated: 2026-09-08
topics: [task-chat, voice-control, concurrency, thread-ownership, fallback, idempotency]
tools: [Pritha, Codex App Server, Codex CLI, Node.js, React]
agent_platforms: [Codex]
model_context: [model-independent]
runtime_environment: [browser, local-app-server, cli-sidecar]
config_surfaces: [Task Chat, Voice Control, runtime-settings]
portability: adapter-needed
sources:
  - operator-voice-task-conflict-audit-request-2026-09-08
  - pritha-checkout-8406a535f67ddf5a559cc3355253f5b25772cff6
  - isolated-voice-chat-audit-probes-2026-09-08
related:
  reviews:
    - 03_reviews/2026-09-07-task-chat-parallel-execution-audit.md
  standards:
    - 04_standards/control-center-codex-chat-api-contract.md
    - 04_standards/control-center-runtime-reliability.md
    - 04_standards/pritha-good-state-alignment.md
  decisions:
    - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
  workflows:
    - 07_workflows/task-chat-evolution-roadmap.md
    - 07_workflows/control-center-staged-release.md
  reports:
    - 11_agents/reports/2026-08-28-pritha-good-state-baseline-reliable-codex-control-center.md
    - 11_agents/reports/2026-07-02-pritha-good-state-baseline-voice-ducking-control-centers.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-07
source_updated: 2026-09-07
source_version: "Pritha 8406a535f67ddf5a559cc3355253f5b25772cff6; installed Codex schema context from the preceding audit: bundled 0.153.4 and standalone 0.153.0"
retrieved: 2026-09-08
verified: 2026-09-08
valid_for: "Audited source checkout; mixed real-runtime execution and deployed fleet not verified"
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: draft
confidence: medium
---

# Task Chat и Voice Control: аудит совместной параллельности

Конфликты возможны. Существующая общая блокировка защищает отдельный активный
turn в одном процессе и provider, но не весь жизненный цикл голосовой задачи.
Для безопасного расширения параллельности нужен общий координатор запуска для
Task Chat, Voice App Server и Voice CLI fallback. Менять только UI недостаточно.

Аудит дополняет предыдущий разбор Direct Chats. Продуктовый код, настройки,
реальные задачи и службы не изменялись. HEAD checkout продвинулся после первого
аудита; diff между `4caa210` и `8406a53` не содержит изменений в исследованных
Gateway, Voice runtime/client и компонентах Task Chat.

## Как связаны сущности

- Direct Chat создаёт native thread и начинает turn через общий Gateway.
- Voice создаёт отдельную карточку задачи, при исполнении запускает свой
  App Server sidecar и выбирает native thread по configured routing policy.
- При `subject_scoped` две карточки одного субъекта могут использовать один
  native thread. Эксперимент с реальным resolver подтвердил это. Новый task ID
  не означает новый native thread ID.
- `continuation_mode=force_new` отключает поиск предыдущей карточки в Voice
  runtime. Само по себе это не переключает native routing в `per_task` и не
  равно `thread_reset`: payload передаёт routing и reset отдельно.
- Voice thread появляется в Task Chat через private link registry. Просмотр
  истории не запускает новую задачу. Для typed continuation существует явное
  действие `Continue in Task Chat`, однако оно пока не передаёт владение
  голосовой карточкой и не вызывает её `answer` endpoint.

Основание: `realtime/pritha-runtime.ts:4873`, `:5290`, `:6501`,
`realtime/codex-task/codex-app-server-client.ts:230`, `:301`,
`codex-chat/voice-links.ts:156`, `codex-chat/gateway.ts:707`.
Здесь и далее короткие пути отсчитываются от
`interfaces/control-center/src/lib/`, если не указан другой корень.

## Проверенные сценарии

| Сценарий | Результат и граница доказательства |
| --- | --- |
| Task Chat держит turn A; Voice пытается начать turn в A | Общая lease отказывает Voice при одинаковом provider и общей копии модуля. Второй `turn/start` не отправлен. Но выявлены V1 и V2 ниже. |
| Voice держит A; Task Chat отправляет в A | Gateway отказывает с `turn_active`; в эксперименте native read намеренно возвращал idle, поэтому защиту обеспечила именно общая lease. |
| Voice держит A; Task Chat отправляет в B | B стартует. Смоделированная отмена Voice A оставляет B активным. Реальный `runTask` и Gateway, подменён lifecycle соединения. |
| Voice task всё ещё running, но между native turns пауза | `Continue in Task Chat` и новый typed turn принимаются. Общего владельца логической задачи нет. |
| Voice task waiting_for_operator или decision_required, native thread idle | Те же операции принимаются. Это проверка отсутствия task-state gate в Gateway, а не выполнение запрещённого внешнего действия. |
| Voice refresh пересекается с новой записью Task Chat | При управляемом порядке операций старая полная запись binding перезаписывает новый receipt и `continuationEnabled`. Native transcript в эксперименте не удаляется. |
| Voice runner получает busy-thread либо timeout turn | Оба вида ошибок попадают в ветку CLI fallback, если CLI доступен. Проверена оригинальная функция с подменённым исполнителем; настоящего CLI запуска не было. |

## V1. Fallback обходит конфликт владельца — P1

`startCodexAppTask` перехватывает ошибки исполнения и, при доступном CLI,
вызывает `startCodexExec` без различения занятости треда, отказа до dispatch
и неизвестного результата уже начатого turn. Исключения для operator abort есть,
но отдельной классификации конфликта владельца нет.

Изолированная проверка точной функции, извлечённой через TypeScript AST,
подтвердила по одному вызову mock `startCodexExec` для ошибки занятого треда и
для ошибки ожидания завершения turn. `startCodexExec` использует отдельный
`codex exec`, иногда `--ephemeral`, с тем же рабочим корнем и не берёт общую
native-thread lease. Он не продолжает занятый native thread через `exec resume`.

Следствия: задача может продолжить действия в общем workspace вопреки отказу
на исходном треде; после неизвестного результата возможен повтор уже начатой
работы. Ни конфликт файлов, ни повтор реального внешнего side effect в аудите
не инициировались. Проверено условие, допускающее их.

Основание: `realtime/pritha-runtime.ts:6200`, `:6213`, `:6228`, `:6309`.
Рекомендация: typed ошибки `thread_busy`, `workspace_busy`, `delivery_unknown`;
busy приводит к ожиданию/явному конфликту, а unknown — к сверке. Fallback может
выбрать другой транспорт только до возможного принятия задачи и после общей
проверки владельца и разрешений. Он не должен повторять ранее завершённые шаги
при сбое следующего шага оркестратора.

## V2. После отказа lease Voice всё ещё пытается изменить тред — P2

В `runTask` catch вызывает `injectThreadReport("failed")`, если resolver уже
выбрал target. Успешное получение lease при этом не проверяется. Эксперимент
зафиксировал запрос `thread/inject_items` после отказа lease, хотя нового
`turn/start` не было. Входящая служебная запись представляет собой user item.

Также `thread/resume` и обновление Voice registry происходят ещё до lease.
Реальное влияние такого resume на чужой работающий App Server в этом аудите
не проверено; нельзя считать эту последовательность полностью read-only.

Основание: `realtime/codex-task/codex-app-server-client.ts:157`, `:168`, `:219`,
`:357`, `:441`. После отказа владельца допустим private operational log;
изменение native thread и запись отчётов требуют действующего владения.

## V3. Владение turn не покрывает логическую Voice task — P1 для общего треда

Planning и каждый шаг `step_orchestrator` вызывают `runTask` отдельно.
Его `finally` освобождает lease после каждого вызова. Между шагами есть
асинхронная запись прогресса, а ожидание operator input вообще оставляет
native thread без активного turn.

`summarizeThread` определяет continuation по native status; `createTaskLink`
и `startTurn` не проверяют актуальный lifecycle связанной Voice task. В
эксперименте typed turn принят при всех трёх статусах task: `running`,
`waiting_for_operator`, `decision_required`, если native thread idle.
Такая запись не закрывает вопрос в Voice-карточке. Поздний голосовой answer
может снова запустить её и встретить уже работающий typed turn.

Основание: `realtime/pritha-runtime.ts:5771`, `:5865`, `:6079`, `:7729`, `:7824`;
`realtime/codex-task/codex-app-server-client.ts:224`;
`codex-chat/normalize.ts:82`; `codex-chat/gateway.ts:707`, `:795`.
Нужно разделить владение logical task, активный native turn и потребление слота
исполнения. Ожидание ответа не обязано занимать вычислительный слот, но возвращение
Voice к этой задаче и typed continuation должны быть согласованы. Ответ из
любого интерфейса должен разрешать точный task/request ровно один раз.

## V4. Voice refresh может затереть новые метаданные Task Chat — P1

`reconcileTask` читает binding, строит из него полную новую запись и вызывает
`store.put`. Пока эта запись ожидает исполнения, другой путь может сохранить
receipt, настройку continuation или другие поля. Atomic rename и последовательная
запись файлов предотвращают повреждение JSON, но не отменяют устаревший snapshot.

Временный harness остановил reconciliation перед put, сохранил новый receipt
и `continuationEnabled=true` реальным store.patch, затем продолжил reconciliation.
После этого receipt отсутствовал, continuation вернулся к false. Использованы
реальный код reconciliation/store, синтетические карточка и native thread.
Это воспроизведение управляемого interleaving, не измерение частоты ошибки.

Основание: `codex-chat/voice-links.ts:169`, `:180`, `:208`;
`codex-chat/private-store.ts:175`. Нужен узкий merge Voice-полей с последней
версией binding внутри критической секции; receipt/attachments/archive/continuation
не должны возвращаться к старому состоянию. Аналогично требуется атомарное
объединение links нескольких Voice tasks, ведущих в один thread.

## Остальные границы

Общий coordinator — модульный Map с ключом `providerId:nativeThreadId`.
Он не даёт общей гарантии для разных providers одного Codex home, другой копии
модуля/Node worker или внешнего Codex. Этот вывод подтверждает F6 предыдущего
аудита. Нужны canonical storage identity, thread ID и явный execution owner;
варианты развёртывания с несколькими процессами требуют process-shared lease.

Отмена Voice штатно использует AbortController по task ID и принадлежащий
вызову sidecar. Это не общая команда остановки всех чатов. Но после рестарта
in-memory handle отсутствует; PID fallback проверяет лишь общий вид команды
Codex, без точной привязки к generation/start-time задачи. Для старого PID и
задержанного SIGKILL требуется более строгая проверка владельца. Повторное
использование PID в реальной системе не провоцировалось.
Основание: `realtime/pritha-runtime.ts:5995`, `:7509`, `:7516`, `:7591`.

Voice continuation resolver ищет среди Voice task cards, а не среди всех
Direct Chats (`realtime/pritha-runtime.ts:4711`). Он не заменяет общий admission
control. Оба пути имеют общий workspace и могут работать с теми же child projects,
файлами и сервисами. Отдельный thread не изолирует эти ресурсы. Предлагаемый
лимит параллельности должен учитывать оба интерфейса и все транспорты, иначе
Voice или CLI смогут обойти лимит, реализованный только в Task Chat.

## Предлагаемая архитектура и оценка

1. Один слой допуска задач для Direct, Voice, planner/steps и CLI fallback.
   Учитывать task ID, источник, native thread, storage identity и workspace.
2. Сохранить нынешний `subject_scoped` routing для привычного продолжения.
   Для независимой задачи явно выбирать отдельный thread; не переводить весь
   Voice в `per_task` молча. Новый task ID не использовать как доказательство
   изоляции native thread.
3. Согласовать владельца logical task на всём цикле, включая паузы и ответы
   пользователя; остановка и handoff адресуют точное исполнение.
4. Закрыть V1, V2, V4 и прежнюю гонку concurrent create до снятия UI-блокировок.
5. Общие статусы, capacity limit и единый путь ответов доступны обоим интерфейсам.
   Новый independent thread может работать параллельно; общие изменяемые ресурсы
   защищаются worktree или отдельными правилами писателей.

Для смешанного Voice + Task Chat первого этапа предварительная оценка становится
**5–9 рабочих дней** вместо прежних 3–5 для более узкого Direct Chat scope:
добавляются ориентировочно 2–4 дня на координацию и проверки пересечений.
Это оценка для одного экземпляра с review и тестами, без fleet rollout,
распределённых workers, полной автоматизации worktree и нового общего approval UX.
Проверка реального поведения двух App Server процессов может уточнить объём.

Architecture: общий execution owner вместо двух независимых диспетчеров.
Security: busy и unknown delivery не разрешают новый side effect через fallback.
DX: одинаковая причина ожидания и один адресный путь answer/stop в обоих UI.
Product: сохранить возможность свободно читать и готовить черновики, пока занято
исполнение; явно объяснять, какая задача владеет общим тредом или workspace.

## Проверки и ограничения

56/56 существующих тестов прошли: Voice Control, Codex Chat, routing,
continuation, planning и safety. Значительная часть проверяет форму исходного
кода и не покрывает описанные пересечения. Отдельные временные probes проверили
шесть групп сценариев из таблицы и находок; восемь тестов используемого fixture
модуля также прошли. Ошибка первоначального test payload была исправлена в
временном harness до получения результатов. Все выводы выше относятся к
успешному повторному прогону.

Финальная Markdown validation прошла для 841 файла. Strict privacy audit
tracked-файлов и отдельная проверка обоих новых review прошли; ошибок YAML
и завершающих пробелов не выявлено. Индексы памяти не пересобирались.

Проверки не запускали модель, настоящий CLI executor или production service.
Для приёмки нужны смешанные браузерные и реальные runtime испытания: оба порядка
Voice/Chat старта, два Voice задания одного scope, пауза между шагами, typed
ответ на Voice question, busy без fallback, неизвестная доставка без повторного
исполнения, потеря соединения после первого шага, конкурентный refresh/receipt,
точная остановка, разные providers общего home, server restart и общий лимит.

Good State Alignment: два релевантных baseline; документирование и исправление
этих дефектов `aligned` при сохранении истории, private state, no automatic
replay и managed lifecycle. Смена принятого routing по умолчанию не предлагается.
Перед реализацией нужен свежий self-test; deployment остаётся отдельным
staged-release действием.

Этот аудит **уточняет** предыдущий review, **подтверждает** необходимость
изоляции ресурсов и **выявляет несоответствие** Voice fallback заявленным в
архитектурном решении границам replay. Стандарты и baseline не ослабляются.
