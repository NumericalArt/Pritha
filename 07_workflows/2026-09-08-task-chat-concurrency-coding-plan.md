---
id: task-chat-concurrency-coding-plan-2026-09-08
type: workflow
status: in-progress
created: 2026-09-08
updated: 2026-09-08
topics: [task-chat, voice-control, concurrency, idempotency, execution-ownership, worktree, themes, canonical-fleet, github, macbook, staged-release]
tools: [Pritha, Codex App Server, Codex CLI, TypeScript, React, Node.js, SQLite, Git]
agent_platforms: [Pritha, Codex]
model_context: [runtime-advertised-models]
runtime_environment: [canonical-mac-mini, canonical-clones, macbook-preparation, control-center, local-app-server, cli-sidecar]
config_surfaces: [Task Chat, Voice Control, Settings appearance, instance-runtime, private-execution-state]
portability: adapter-needed
sources:
  - operator-task-chat-concurrency-coding-plan-request-2026-09-08
  - operator-canonical-theme-and-fleet-plan-extension-2026-09-08
  - operator-local-pritha-canonical-theme-update-instruction-2026-09-08
  - neuraldeep-theme-ce88ae0071ff7e0f6dcdec830ef9610faa1e4fe9
  - neuraldeep-theme-a3820b5f5a4ea990b59e32e3e6b2d2f407c59fdc
  - 03_reviews/2026-09-07-task-chat-parallel-execution-audit.md
  - 03_reviews/2026-09-08-task-chat-voice-concurrency-audit.md
  - pritha-source-11a3c016a7b2ec0f078484937e794df13d196969
  - https://learn.chatgpt.com/docs/app-server#turns
  - https://learn.chatgpt.com/docs/non-interactive-mode
related:
  reviews:
    - 03_reviews/2026-09-07-task-chat-parallel-execution-audit.md
    - 03_reviews/2026-09-08-task-chat-voice-concurrency-audit.md
  standards:
    - 04_standards/control-center-codex-chat-api-contract.md
    - 04_standards/control-center-runtime-reliability.md
    - 04_standards/pritha-good-state-alignment.md
  decisions:
    - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
  workflows:
    - docs/neuraldeep-task-chat-concurrency-implementation.md
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/task-chat-evolution-roadmap.md
    - docs/macbook-task-chat-concurrency-and-themes-update.md
    - docs/update-second-local-macbook.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-08
source_updated: 2026-09-08
source_version: "Planning checkout 11a3c016; audited mother files unchanged since 8406a535; local schemas bundled Codex 0.153.4 and standalone CLI 0.153.0"
plan_revision: 3
theme_instruction_sha256: fd1be1e14794bacb701914f07f2232645f2af8d11ef39080b8a735f7aa21f0ec
retrieved: 2026-09-08
verified: 2026-09-08
valid_for: "Implementation planning; exact Mac Mini source, runtime and compiled build must be verified in P0"
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge, governance]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: draft
confidence: medium
---

# Pritha: параллельный Task Chat, три темы и канонический выпуск

## 1. Назначение и границы

Реализовать улучшения сначала на канонической основной Pritha на Mac Mini.
План охватывает Direct Chats, задачи Voice Control, оба используемых матерью
транспорта, сообщения во время работы, восстановление, изоляцию задач разработки
и три темы оформления по локальной инструкции `pritha-canonical-theme-update.md`.
Mac Mini — первый целевой production-экземпляр и место основной приёмки.
Название каталога, текущий checkout агента и Git HEAD сами по себе не доказывают,
какая сборка установлена на Mac Mini.

Этот документ — задание на реализацию, а не отчёт о выполнении. При его подготовке
код и службы не изменялись. Новые модули, маршруты, флаги и состояния ниже являются
проектируемыми. Точные release commits появятся после реализации и проверки.

Отдельная [инструкция Pritha ND / NeuralDeep](../docs/neuraldeep-task-chat-concurrency-implementation.md)
создаётся вместе с планом. Она сохраняет постоянный Codex CLI и провайдера ND.
После реализации матери её необходимо дополнить точными commits, контрактами
и переносимыми fixtures. ND остаётся отдельной адаптацией CLI и не включается
в канонический rollout. Она является read-only источником двух новых палитр.

Дополнение пользователя от 2026-09-08 расширяет полный результат исполнения:
опубликовать проверенный код в `NumericalArt/Pritha`, установить итоговый кандидат
последовательно на **матери → Даше → Саше → Марине**, затем передать готовый
пакет обновления MacBook. Подготовка MacBook не означает его автоматическое
обновление. Другие найденные clones и child interfaces в этот перечень не входят.

Исходный файл инструкции прочитан; его SHA-256 записан в metadata. Ниже сохранены
все обязательные условия переноса темы. Первоначальные запреты этой инструкции
на обновление Даши/Саши/Марины и подготовку MacBook заменены прямым дополнением
пользователя. Остальные ограничения — узкий цветовой патч, собственные данные,
тесты, staged release и lifecycle boundary — сохраняются. Частный URL и локальные
пути из исходного файла не копируются в публикуемые артефакты; target определяется
по проверенной конфигурации менеджера.

## 2. Наблюдаемый результат

1. Пока A выполняется, пользователь открывает или создаёт B и C, пишет сообщения,
   добавляет вложения и отправляет их. Задержка подтверждения A не блокирует B.
2. Несколько новых черновиков существуют независимо. Поздний ответ сервера
   не переключает пользователя из выбранного чата и не стирает новые правки.
3. Разные допустимые задачи выполняются одновременно в пределах общего лимита.
   При занятости ресурса видны причина ожидания, владелец и доступное действие.
4. Завершение, ошибка и запрос пользователя в фоновой задаче видны в списке.
   Переключение страницы и закрытие подписки не отменяют выполнение.
5. В работающий чат можно направить явное уточнение через поддерживаемый `steer`
   или сохранить сообщение для исполнения после завершения. Очередь не выдаётся
   за уже доставленный модели ввод.
6. Voice и текстовый интерфейс согласованно управляют одной задачей: ответ на
   вопрос, остановка и передача управления адресуют точное исполнение.
7. Несколько задач разработки одного проекта используют изолированные worktrees;
   общий checkout, общие сервисы и внешние изменяемые ресурсы имеют правила доступа.
8. Потеря подтверждения, reconnect и restart не создают повторную задачу.
   История, receipts, Voice links и оригиналы вложений сохраняются.
9. Settings предлагает ровно три темы: «Классическая» (`classic`, по умолчанию),
   «Тёмная» (`dark`) и «Светлая» (`light`). Переключение мгновенное и локальное
   для браузера/origin; классическое оформление совпадает с исходной матерью.
10. Мать, Даша, Саша и Марина получают один проверенный source pin с собственными
    build identities и state. GitHub содержит код, планы и итоговый отчёт;
    MacBook получает инструкцию с точным pin, проверками, миграцией и откатом.

## 3. Покрытие аудита

| Основание | Исправление | Этап / обязательная проверка |
| --- | --- | --- |
| F1: общий `sending` и pending первого сообщения | Состояние доставки по чату/черновику | P3 / задержать A, отправить B |
| F2: concurrent create создаёт два native threads | Durable reservation и идемпотентный create + first message | P1 / два одновременных одинаковых запроса |
| F3: позднее создание меняет навигацию | Draft ID, revision и navigation epoch | P3 / переключиться в B до ответа A |
| F4: подписка только выбранного чата | Общая лента кратких статусов и reconciliation | P3 / фоновое завершение без активности выбранного чата |
| F5: общий cwd | Resource admission, worktree и проверяемая политика писателей | P2, P5 / конфликтующие записи и разные проекты |
| F6: lease только в Map и по provider | Process-shared ownership по реальному хранилищу/native ID | P1, P2 / разные providers одного home и два Node-процесса |
| V1: busy/unknown уходит в CLI fallback | Stage-aware dispatch и общий admission для всех путей | P1, P2 / busy, lost ack, ошибка после первого шага |
| V2: отчёт Voice пишет в занятый thread | Любая native mutation требует текущего владельца | P2 / после отказа нет resume/inject/start |
| V3: Voice отпускает thread между шагами | Владение всей logical task, точный answer/handoff | P2, P4 / planner, межшаговая пауза, waiting/decision |
| V4: Voice refresh затирает свежий binding | Узкая транзакционная мутация актуальной записи | P1 / refresh одновременно с receipt/archive/attachments |
| Аудит: нет готовых steer/stop/request handlers | Реализованные capability-gated операции и история уточнений | P4 / гонки, reconnect, двойной ответ |
| Аудит: cold probes и общий App Server | Асинхронные bounded probes, учёт общего отказа | P6 / slow probe, падение соединения с A/B/C |
| Аудит: небезопасный PID fallback после restart | Проверка process ownership и generation при каждом сигнале | P4 / старый PID и delayed kill |
| Новая инструкция оформления | Три темы, Classic compatibility, Three.js/Canvas и visual regression | T1 / три темы × шесть ширин, старый storage key |
| Расширение канонического выпуска | Проверенный GitHub pin, последовательные clones и пакет MacBook | P8/P9 / per-instance receipts и полный комплект передачи |

Исходные findings относятся к прочитанному коду и изолированным воспроизведениям.
Ранее прошли 56 существующих тестов Voice/Chat; они не доказывают готовность
production concurrency. До реализации повторить исходные сценарии на актуальном
pin. Good State Alignment нашёл baseline от 2026-07-02 и 2026-08-28: сохраняются
native history, отсутствие replay, private state, managed lifecycle, страницы/
chunks и работа Voice с music ducking. План эти требования уточняет, не отменяет.

## 4. Архитектурный контракт

### 4.1. Один путь допуска, несколько адаптеров

Все Pritha-запуски из Task Chat, Voice, planner/steps и разрешённого CLI fallback
проходят один instance-local execution coordinator. UI, gateway и Voice не имеют
своих независимых лимитов или обходного прямого spawn. Связанные Agents Mother
build/probe/summary вызовы интегрируются через существующий run/attempt контракт,
если используют тот же ресурс или заявленный общий capacity pool.
Сам delivery engine и его бюджет не переписывать в рамках этой интеграции.

На матери сохранить App Server manager: multiplexing независимых threads уже
есть, отдельный OS-процесс на каждый Direct Chat не требуется. Координатор
не объединяет принудительно Voice sidecars с этим соединением. Перевод Voice на
общую connection — отдельное решение только при доказанной необходимости.

### 4.2. Разделить идентичности

| Сущность | Назначение |
| --- | --- |
| `draftId`, `draftRevision` | Локальный черновик и версия редактирования |
| `clientThreadId`, `clientMessageId`, `operationId` | Устойчивое намерение пользователя и идемпотентность операции |
| `executionId`, `logicalTaskId`, `stepId` | Исполнение, карточка Voice/Direct и конкретный шаг |
| `attemptId`, `ownerGeneration` | Одна попытка dispatch и поколение владельца |
| `storageNamespace`, `nativeThreadId`, `nativeTurnId` | Проверенный runtime target; provider сам по себе не определяет хранилище |
| `workspaceId`, `resourceClaims` | Каталог/снимок, права и общие изменяемые ресурсы |
| `requestId`, `requestRevision` | Конкретный вопрос или approval, требующий ответа |

Это проектируемая модель; имена согласовать с существующими типами, не создавать
дубли `runId` и `turnId` без явного mapping. Native ID становится подтверждённым
только из runtime evidence. Временный UI ID не выдаётся за native ID.

Ключ блокировки native thread строится из canonical storage namespace и native ID,
не из `providerId:threadId` и не из выбранного чата. Aliases одного хранилища
конкурируют за одну lease. Разные хранилища с совпавшими строковыми IDs различаются.
До появления native ID резервируется create/routing scope; назначение ID
атомарно связывается с этой reservation до следующей mutation.

Локальная координация не блокирует независимый внешний Codex/Desktop, который
не участвует в протоколе. Такой active owner должен обнаруживаться и запрещать
конкурирующее продолжение; не заявлять абсолютную защиту от внешнего старта
между проверкой и dispatch. Не менять CODEX_HOME старых чатов ради блокировки.
Общее native хранилище нескольких экземпляров требует отдельной проверенной
координации либо ограничения concurrent resume; один instance-local DB этого не решает.

### 4.3. Владение, слоты и состояния

- Logical owner сохраняется на весь Voice workflow, включая planner, переходы
  между шагами и ожидание оператора. Чужой typed start не занимает его thread.
- Native turn lease действует до подтверждённого terminal outcome/reconciliation.
  Истечение TTL, закрытие браузера и HTTP timeout не доказывают завершение.
- Capacity slot учитывает фактическое исполнение. Ожидание оператора вне active
  runtime может освободить слот, сохранив logical owner. Живой CLI/turn или
  неизвестный расход provider concurrency учитывается консервативно. Отдельно
  ограничить число живых процессов, открытых запросов и объём очереди.
- Не удерживать вычислительный слот, ожидая workspace/thread lock. Допуск всех
  необходимых ресурсов — короткая атомарная операция; порядок одинаков для всех
  путей. FIFO по одной задаче и выбор следующей допустимой независимой задачи
  предотвращают блокировку всей очереди одним занятым ресурсом.
- Первое предложение для пилота — максимум 3 активных независимых исполнения,
  после проверки Mac Mini. Это новый настраиваемый предел, не лимит Codex или
  провайдера. Снижение предела не убивает уже запущенные задачи; новые ожидают.

Внутренние состояния: `queued`, `admitted`, `dispatching`, `running`,
`waiting_for_operator`, `waiting_for_approval`, `stop_requested`,
`reconciling`, `delivery_unknown`, `completed`, `failed`, `cancelled`.
Не смешивать доставку сообщения, состояние native turn и результат всей задачи.
Терминальный шаг не делает многошаговую Voice task завершённой.

### 4.4. Durable storage и граница идемпотентности

Предпочтительный вариант — отдельный private SQLite execution store с короткими
транзакциями, uniqueness/CAS и проверкой поколений. Он не является memory index
и не удаляется при rebuild памяти. В P0 проверить поддерживаемый Node/SQLite
на Mac Mini и способ bounded доступа без блокировки HTTP event loop; существующий
ND `node:sqlite` ledger — reference, не доказательство совместимости матери.
Redis, внешний брокер и распределённый service не нужны для этого scope.

Зафиксировать одно место истины для каждой сущности: execution intents, attempts,
resource ownership, permanent message guards, pending requests и события outbox.
Не хранить два независимо изменяемых canonical receipt в JSON и SQLite.
Для Task Chat metadata сохранить интерфейс private-store, но выполнять narrow
mutations по последней версии: receipt, archive, attachments, settings,
continuation и Voice links не затирают поля друг друга. При переносе registry
в транзакционный backend старый JSON становится migration input/совместимой
проекцией, а не вторым writer. Native transcript остаётся в native storage.

Минимальный алгоритм dispatch:

1. Проверить actor/instance, body, target, capabilities, attachments и permissions.
2. В транзакции зарезервировать уникальное намерение и неизменяемый payload hash;
   одинаковый ключ/содержимое возвращает прежний результат, другое содержимое — conflict.
3. Получить resources/capacity и сохранить `attemptId`, owner generation и
   `dispatching` **до** внешней mutation/spawn. Не держать DB transaction на время RPC.
4. Отправить ровно одну попытку. Записать native IDs/receipt и события для UI.
5. При потере ответа сверить native evidence и journal. Возможный dispatch без
   доказанного исхода остаётся `delivery_unknown`; нового spawn автоматически нет.

Create с первым сообщением — один durable intent с раздельными checkpoints
создания native thread и старта первого turn. Повтор после успешного create и
ошибки first turn использует тот же thread. Не удалять reservation при timeout.
Окно crash после native create, но до записи ID нельзя закрыть догадкой: если
runtime не умеет доказуемо сопоставить create key, сохранить unknown и предложить
reconciliation, не создавать второй thread. Это защита от повторов, а не обещание
exactly-once для произвольного внешнего side effect.

24-часовой HTTP cache не заменяет постоянный `clientMessageId` guard.
Сохранить компактные guard/tombstone записи после очистки подробных receipts.
Дисковая ошибка, повреждённый registry или неподдерживаемая schema не превращаются
в пустую очередь с разрешением запуска. Чтение доступной истории сохраняется.

### 4.5. Контракты UI/API

Сохранить текущие v1 start/create тела и явный `409 turn_active`. Автоматическую
постановку в очередь не добавлять скрыто к старому Send. Предлагаемые новые пути:

| Операция | Контракт |
| --- | --- |
| `GET /api/codex-chat/v1/activity` | Краткий instance snapshot, sequence/cursor, очередь и aggregate counts |
| `GET /api/codex-chat/v1/activity/stream` | Одна summary SSE-подписка; restart/gap вызывает snapshot |
| `POST /threads/{chatId}/queue` под v1 | Явная постановка неизменяемого сообщения; receipt означает queued |
| Queue cancel/edit | Только ещё не dispatched запись, expected revision; edit создаёт новую версию intent |
| Steer / interrupt / requests resolve | Маршруты уже описаны стандартом; реализовать точный adapter mapping |
| Voice answer / handoff | Единый backend command с task/request/owner revision, доступный двум UI |

Точные схемы и error codes оформить до handlers. Additive поля допускаются в v1;
несовместимая смена существующей семантики требует versioning. Сохраняются API guard,
same-origin checks, input bounds и redaction. В браузер не попадают credentials,
частные пути, raw JSONL/RPC, chain-of-thought и внутренние дампы ошибок.

## 5. Последовательность реализации

Рабочий порядок: **P0 → P1 → P2 → P3 → P4 → P5 → интеграция T1 → P6.1
(recovery, нагрузка и финальные проверки) → P8.1 (публикация кандидата) →
P6.2 (мать) → P7 → P8.2 (clones) → P9**.
Узкий T1 можно готовить после P0 независимо от backend-изменений, но проверять
его нужно на итоговом UI P3/P4. Публикация до production необходима, поскольку
updater проверяет `origin/main`. Draft guides входят в исходный кандидат;
фактические release receipts и итоговые reports публикуются после серии apply.
Номера P0–P7 сохранены для ссылок из инструкции ND.

### P0. Проверить материнский экземпляр и зафиксировать основание

На Mac Mini, из checkout, принадлежность которого подтверждена менеджером:

```sh
git status --short --branch
git rev-parse HEAD
node scripts/good-state-alignment.mjs --scope "Task Chat Voice Control concurrency" --limit 3
node scripts/control-center-runtime.mjs plan
node scripts/control-center-runtime.mjs status --json
```

Сверить локально, без публикации private значений: instance ID, checkout,
state-root, agent parent, native homes/profile, служебную конфигурацию,
Node/CLI versions, compiled commit/BUILD_ID, существующие active tasks,
свободные RAM/disk и фактическое число runtime writers. Выполнить свежий self-test
в правильном state-root; baseline warnings отделить от новых failures.

Создать изолированный dev worktree от проверенного source pin с веткой `codex/…`.
Не reset/stash чужие изменения и не переписывать live `.next`. Dev/tests используют
отдельные state-root, Codex home, временные проекты и synthetic fixtures; production
credentials, очереди и реальные prompts туда не копируются. Незакоммиченные
изменения текущего checkout не являются автоматически частью кандидата.

Deliverables: короткий architecture decision draft по store/ownership, snapshot
schema и migration map, baseline evidence, измеримые test cases F/V. Версионный
pin P0 заменяет ориентир этого плана; изменение изученных файлов требует сверки
findings, не безусловного применения старых строк.

### P1. Сделать создание и запись состояния устойчивыми к гонкам

Затронуть `src/lib/codex-chat/{private-store,gateway,voice-links,types}.ts`, create/
turn routes; добавить общий private execution-store/transaction layer и fixtures.
Все пути ниже отсчитываются от `interfaces/control-center/`, если не указан корень.

- Реализовать durable create reservation до первого await с внешним эффектом,
  atomic payload comparison, permanent message guards и crash recovery.
- Заменить snapshot `store.put` из Voice reconciliation на транзакционное
  объединение разрешённых Voice-полей. Два Voice links одного thread сохраняются.
- Провести versioned migration на копиях fixtures; хранить schema/revision и
  migration receipt. Коррупция сохраняется для восстановления, не перезаписывается.
- Ввести typed dispatch failures. Уже на этом этапе запретить CLI fallback для
  busy, нарушения permissions, abort и любого возможно принятого исполнения.
  Planner fallback также не должен маскировать эти ошибки synthetic success.
- Подготовить совместимость старых callers, read-only plan/dry-run миграции
  и безопасную точку отката перед активацией нового writer.

Gate: F2/V4 воспроизводятся старым кодом и проходят новым; crash до/после native
acceptance, два процесса и disk-write failure не дают второй dispatch.

### P2. Объединить admission Task Chat и Voice

Затронуть `codex-chat/native-turn-coordinator.ts`, gateway,
`realtime/codex-task/codex-app-server-client.ts`, `realtime/pritha-runtime.ts`,
Voice routing/continuation и общий execution coordinator.

- Перед каждым resume/inject/start/CLI spawn проверять owner generation.
  Известный thread резервировать до mutating resume. Для нового subject scope
  сначала reserve, затем resolve/create, затем bind. После отказа lease остаётся
  только private operational log, без native «failed» user item.
- Передать единый logical owner через planner и каждый orchestrator step.
  Ожидание вопроса не разрешает прямой чужой start в паузе.
- Сохранить принятое `subject_scoped` продолжение. Явную независимую задачу
  маршрутизировать в отдельный native thread/generation, не полагаться только
  на новый task ID или `continuation_mode=force_new`. Не менять весь Voice default.
- CLI fallback получает тот же admission, workspace policy и permissions.
  Разрешён только доказанный отказ до возможной внешней доставки; отсутствие
  `turn.started` при сетевой потере само по себе ничего не доказывает.
  Ранее завершённые шаги workflow никогда не исполняются повторно из-за сбоя следующего.
- Ввести server capacity/queue bounds и начальную политику одного писателя
  в общий checkout. «Read-only» подтверждается sandbox/tool permissions, а не
  словами в prompt; недоказанный write scope считается конфликтующим.
- Защитить отдельные Node workers общей транзакцией. Долговременное native
  ownership не перехватывается по TTL: fencing не остановит старый процесс,
  уже выполняющий внешний эффект. Сначала reconcile/подтверждённая остановка.

Gate: оба порядка Voice/Direct, два Voice tasks одного scope, разные providers
одного home, межшаговые паузы, общий лимит и terminal events адресуют только
своего владельца. Неучаствующий в coordinator путь запуска — blocker выпуска.

### P3. Разблокировать интерфейс и показать фоновые задачи

Затронуть `src/components/codex/CodexChatPage.tsx`, `useChatAttachments.ts`,
activity API/client и отображение task rows. Включать после P1/P2.

- Заменить global `sending`/`pendingNewChatDelivery` на записи по draft/chat ID.
  Синхронная локальная защита от двойного клика дополняет серверную идемпотентность.
- При submit сохранить snapshot text/settings/attachments и draft revision.
  Очистить только отправленную версию. Новые правки во время await сохраняются.
  При binding нового чата атомарно перенести его оставшийся draft и attachments.
- Применять позднюю навигацию только если выбран тот же draft и navigation epoch
  не изменился. Фоновый результат добавляет строку/статус, не меняет URL/selection.
- Сохранить per-chat error, retry/reconcile, upload cancellation и независимые
  AbortControllers. Отмена HTTP ожидания не становится отменой runtime.
- Реализовать одну summary SSE с private durable sequence/outbox, bounded replay
  и snapshot при пропуске. Полная история подписана только у выбранного чата.
  Ограниченный recursive polling допустим как восстановление при отсутствии SSE;
  без полного чтения всех историй, глобального вечного interval и watchdog службы.
- Показать `В очереди`, причину ожидания, количество active/queued, operator request,
  failed/completed и recovery. Archive скрывает чат, но не отменяет его работу.
- Сохранить A/B/C: Restore access, правильные alias links, Copy Markdown,
  оригиналы вложений, capability checks выбранной модели и старые deep links.

Gate: браузерные сценарии A/B/C из раздела 6 на desktop/mobile; нет глобальной
блокировки ввода, навигации или соседней отправки. Завершение фона обновляется
без ручного reload и без загрузки его transcript целиком.

### P4. Уточнение, очередь, остановка и вопросы

Затронуть gateway/app-server/types/normalize, turn/request routes, composer,
Voice answer/abort/handoff handlers и private pending-request storage.

1. **Очередь.** Пользователь явно выбирает «Отправить после завершения».
   Сохранить intent, target, predecessor, model/settings, attachments и границу
   `после всей Voice task` либо `после Direct turn`. Между Voice steps очередь
   не вклинивается. Перед dispatch повторить eligibility/capability/budget checks.
   Изменение прав, binding, модели или неопределённый predecessor приостанавливает
   запись. Reconnect не отправляет второй раз. После server restart queued work
   сначала сверяется; неопределённые attempts требуют решения, не auto-resume.
2. **Steer.** Реализовать `expectedTurnId`, свой message receipt и поддержку
   нескольких user messages внутри turn. `normalize.ts` больше не теряет второе
   уточнение. Успешный steer не ждёт нового `turn.started` и не меняет model/cwd/
   sandbox. Ошибка target ended сохраняет draft; новый turn/queue требует явного
   выбора. Потеря ack — reconciliation, не повторная инъекция. У Voice steer
   сохраняет текущего logical owner и structured-output контракт; неподдерживаемый
   этап предлагает очередь или адресный answer вместо обхода контракта.
3. **Stop.** App Server использует `turn/interrupt` точного turn. Нельзя закрывать
   общее provider connection ради A. CLI останавливает только принадлежащий attempt
   процесс/группу; проверка включает start identity, generation, cwd и wrapper-child
   relationship. Проверять повторно перед отложенным сильным сигналом. `child.killed`
   или ack interrupt не равны подтверждённому exit. Старый PID без доказанного
   владельца даёт recovery state. Stop running и cancel queued — разные действия.
4. **Вопросы Voice.** Текстовый и голосовой answer проходят один CAS по точным
   task/request/revision. Один ответ запускает максимум одно продолжение;
   противоречащий второй ответ — conflict, устаревший — expired. Свободный текст
   в общий chat сам по себе не одобряет действие и не закрывает чужой request.
5. **Native approvals/input.** Реализовать разрешённые server-initiated request
   handlers, durable pending requests и точную связь с connection generation.
   UI/Voice могут ответить через общий command; grant ограничен запрошенными
   правами. Не менять глобальный `approvalPolicy`/sandbox, не включать auto-approval.
   Возможность объявляется только при работающем adapter. После потери connection
   старый RPC ID не переиспользуется: reconcile или expired, без фиктивного ответа.
6. **Передача в Task Chat.** Для terminal Voice task — явный CAS переход владельца.
   Для продолжающейся — безопасная граница/подтверждённая остановка и checkpoint,
   затем transfer. Старые delayed callbacks и answers не могут возобновить Voice.
   Сохранить карточку, links, progress, budget и историю; не создавать копию работы.

Поведение steer/interrupt сверено с [официальным App Server контрактом](https://learn.chatgpt.com/docs/app-server#turns).
Наличие метода в schema не означает готовый UI или CLI capability. Если конкретный
runtime не поддерживает интерактивный request, показать ограничение и сохранить
состояние; не расширять права и не подменять провайдера.

Gate: race завершения/steer, двойной answer из двух вкладок/Voice, stale stop,
server restart, paused logical task и очередь не создают дополнительный side effect.

### P5. Изолировать параллельные задачи разработки

Использовать `scripts/agents-mother/delivery-worktree.mjs` и его tests как reference
для reusable узких helpers. Не менять существующий delivery branch/recovery contract
ради Task Chat. Создать отдельный workspace binding/lifecycle слой.

- Для новой mutating задачи Git-проекта — worktree от точной проверенной revision,
  собственная ветка `codex/…`, private metadata и минимальные writable roots.
  Сохранять source/base/revision/worktree mapping до исполнения.
- При dirty исходном проекте не stash/reset и не включать пользовательские
  изменения молча. Предложить точный committed base или проверяемый snapshot
  выбранных изменений; non-Git проект использует сериализацию, пока не реализован
  явно описанный безопасный snapshot mode.
- Worktree не изолирует shared Git refs, network, порты, общую SQLite, launchd,
  child projects и MCP side effects. Отдельные resource claims защищают эти цели;
  операция с неизвестным scope не допускает произвольных конкурентных writers.
  Не раздавать всем задачам write access к родителю всех child agents.
- Проверить filesystem sandbox и реальные пути: один cwd не ограничивает запись.
  Secrets/private state не копируются; разрешённые инструменты получают только
  необходимые endpoints/roots. Symlink не расширяет разрешённую область.
- Существующий native thread остаётся привязан к прежнему workspace. Не переписывать
  cwd старой истории. Для переноса — явный новый thread/fork/handoff с проверенным
  происхождением; старое продолжение может использовать сериализованный writer mode.
- Результат сначала становится reviewable diff/artifact. Применение в canonical
  checkout сверяет base и текущую revision, получает writer claim и повторяет
  затронутые проверки. Конфликты сохраняются для решения; auto-reset/force-push нет.
- Cleanup после terminal state проверяет ownership, refs, dirty/untracked файлы,
  receipts и незавершённые процессы. Неперенесённый результат сохраняется.
  Нельзя удалять worktree по возрасту или только по завершению UI карточки.

Gate: A/B меняют одинаковый файл изолированно; два merge/apply сериализуются;
изменение source во время A, non-Git, dirty tree, crash и cleanup не теряют работу.

### T1. Выполнить инструкцию канонических тем

Источник — локальный файл `Documents/pritha-canonical-theme-update.md` в домашнем
каталоге оператора, от 2026-09-08, с hash из frontmatter. Выполнять на актуальном каноническом коде матери;
ссылка/имя каталога из источника не заменяют проверку instance identity P0.
Если исходный файл недоступен на целевом хосте, этот раздел содержит его
нормализованные требования; несовпадающую редакцию сначала сравнить по содержанию.

**T1.1. Проверить источники и сохранить эталон Classic.**

- Read-only проверить два full commits в ND: graphite
  `ce88ae0071ff7e0f6dcdec830ef9610faa1e4fe9` и three-themes/light
  `a3820b5f5a4ea990b59e32e3e6b2d2f407c59fdc`. Их наличие и перечисленные ниже
  файлы на втором pin проверены при расширении плана; это не visual acceptance
  переноса в мать. Не брать незакоммиченные или более новые цвета без сверки.
- Изучить на этих revisions: `UI-design/2026-09-06-neuraldeep-three-themes.md`,
  `interfaces/control-center/src/lib/theme.ts`, `src/components/shell/ThemeSync.tsx`,
  `src/styles/neuraldeep-palette.css`, `src/styles/neuraldeep-light.css`, `src/styles/neuraldeep-classic.css`
  и `src/components/voice/PrithaStarScene.tsx`. После первого полного пути `src/`
  в этом перечне отсчитывается от `interfaces/control-center/` ND.
- Сохранить исходный diff, compiled build/rollback reference и private screenshots
  матери. Для детерминированного сравнения снять тот же baseline в изолированном
  приложении на synthetic данных. Classic — исходные цвета/рендеринг матери.
  Theme-only before/after сравнивает одну и ту же функциональную версию P1–P5:
  новый queue/composer UI не считается дефектом переноса цвета только потому,
  что его не было в P0. Существующие поверхности сохраняют цветовой эталон P0;
  геометрию T1 проверять относительно интегрированного приложения до theme patch.
- Не cherry-pick commits ND целиком, не заменять её файлами материнские
  `layout.tsx`, `SettingsControlPage.tsx`, `globals.css` и renderer звезды.
  `neuraldeep-classic.css` исправляет исторические изменения ND и не задаёт Classic
  матери. Не переносить ND runtime/provider/Voice/Settings functionality.

**T1.2. Реализовать browser-local theme contract.**

В существующем appearance-разделе Settings — ровно `classic`, `dark`, `light`
с русскими названиями из раздела 2. Не добавлять «Системную» тему; OS changes
не меняют выбор. Раздел и остальные настройки сохраняют свою структуру.

Единственный новый storage key — `pritha-control-center-theme-v2`.
Старый `pritha-control-center-theme` не изменяется и не мигрирует: его `dark`
обозначает прежний Classic, а не новую graphite palette. При первом визите,
отсутствующем/некорректном v2, недоступном storage, удалении выбора и SSR —
`classic`. Mount Settings не перезаписывает сохранённый v2 default-значением.

Синхронизировать bootstrap до первого кадра, React state, DOM attribute,
Three.js/Canvas и `storage` events между вкладками одного origin. Обрабатывать
удаление key/clear, неверные значения и storage exceptions. Другой origin/порт
сохраняет собственный выбор: тема не синхронизируется сервером между clones.
Вводить новый server settings field, cookie/API contract или network mutation
ради темы не нужно. Сохранить текущие ограничения выполнения init script/CSP.

Без атрибута темы оформление остаётся Classic. Новые palette rules включаются
только точными `:root[data-theme="dark"]` и `:root[data-theme="light"]`.
Не использовать правило «не light и не classic». Удалить прежнее влияние
system preference только в рамках нового theme selector. Сохранить действующий
`export const dynamic = "force-dynamic"`, SSR instance state, caching и build logic
материнского layout. Устранить flash и hydration mismatch, а не скрывать новые
ошибки гидратации глобальными исключениями.

**T1.3. Перенести семантические цвета без изменения геометрии.**

- Выделить tokens для background/surface/text/action/selection/link/success/
  warning/error/border/accent. Fallback каждой замены — точное исходное значение
  матери. Цвет одинакового hex может выполнять разные функции; массовой замены нет.
- Dark: graphite surfaces, светлый текст, pastel peach/pink/lilac action gradient.
  Light: насыщенные серо-зелёные/серо-синие surfaces; sidebar и Pritha Status в
  Agents — согласованные более тёмные поверхности, без простой белой инверсии.
- Покрыть shell, Agents и agent pages, Voice, Task Chat, все Settings sections,
  Dev, dialogs, мобильные и редкие loading/error/empty/disabled состояния.
  Цветовые изменения не меняют routes, тексты вне selector, fonts, spacing,
  dimensions, responsive behavior, animation или доступность управления.
- Новые декоративные линии только Dark/Light: 1 px × 96 px, на основной Voice
  panel — 144 px длиной; без layout shift, pointer interception и свечения.
  Яркие акценты занимают небольшую площадь.
- Не перекрашивать QR, user images и внешние brand assets. Сохранить original
  logo asset; в Light обеспечить согласованное светлое отображение без заметной
  отдельной подложки. Не фильтровать контейнеры с пользовательскими изображениями.
- В `PrithaStarScene.tsx` сохранить Three.js и Canvas fallback, геометрию,
  размеры, line widths, motion и voice-state response. Classic сохраняет исходные
  colors/glow/blending. Для Dark/Light перенести только согласованные gradients
  и необходимые color rendering parameters из pin; preview-star не заменяет renderer.

Технические deliverables: узкий theme commit; общий theme helper и sync при
необходимости; scoped palette styles; точечные изменения потребителей цветов;
tests. Это не отдельный redesign. Новые зависимости, remotes, service/network
настройки и функциональные изменения ND не входят в T1.

**T1.4. Изолированная полная приёмка.**

| Проверка | Ожидаемый результат |
| --- | --- |
| Первый кадр / SSR / нет DOM attribute | Classic, без flash и hydration errors |
| Только старый key=`dark` или `system`, v2 отсутствует | Classic; старый key не изменён |
| V2 valid / invalid / removed / storage blocked | Сохранение valid; Classic fallback для остальных; отсутствие падения |
| Settings mount, выбор, navigation, reload, вторая вкладка | Нет default overwrite, мгновенное согласованное переключение и persistence |
| Другой origin / другой clone | Независимый выбор, без записи в server settings |
| Classic before/after | Те же исходные цвета, assets, glow/blend и layout |
| Dark/Light | Принятые palettes, читаемые состояния, semantic accents |
| Three.js и принудительный Canvas fallback | Согласованные темы при сохранении движения, размеров и voice-state logic |
| Concurrency UI | Queue, active/stop, operator request, attachments, errors и recovery читаемы во всех темах |

Проверить **1440, 1200, 768, 767, 390, 320 px** и hover/selected/focus/disabled/
loading/error/warning states. Geometry delta — не более 1 px браузерного округления.
Для screenshot comparison использовать одинаковые browser/font/scale и
детерминированный animation frame в test harness; не менять production animation.
В новых темах ordinary text contrast ≥ 4.5:1, large text и значимые control
outlines ≥ 3:1. Старые недостатки Classic записать отдельно, не исправлять попутно.

Typecheck, staged production build, theme behavior tests и browser visual evidence
обязательны. Создание задач, Voice sessions и изменение прочих Settings — только
synthetic data изолированной сборки. Production theme smoke ограничен чтением
страниц и browser-local выбором в тестовом контексте: без пользовательских задач,
нагрузки и изменения рабочих server settings. Экземпляр ND не изменяется.

Gate: отдельный reviewed theme diff и интегрированный candidate сохраняют Classic,
полностью покрывают Dark/Light, проходят matrix и не меняют функциональность.
Если узкий theme patch нельзя отделить от чужих правок или release требует
несогласованного функционального diff, сохранить подготовленную работу и вынести
конкретное несовместимое изменение на решение, не перезаписывать его автоматически.

### P6. Восстановление, нагрузка и выпуск матери

**P6.1 — код и проверки до публикации кандидата.**

- Убрать синхронные cold version/schema probes из HTTP critical path: bounded
  async worker, shared pending probe, cache по точному binary/version и корректная
  инвалидизация. Timeout возвращает unavailable, не зависание страницы.
- При потере shared App Server сверять все затронутые attempts. Не перезапускать
  задачу, скрытую в другой вкладке. Сохранять loaded history при временной ошибке.
- Измерить на Mac Mini admission/ack latency, event-loop lag, память/RSS, CPU,
  число процессов, queue wait и задержку фоновых статусов при 1/2/3 задачах.
  Прогнозы лимитов не выдавать за фактические показатели модели/аккаунта.
- Диагностика использует opaque IDs, state transitions и durations. Prompt,
  credentials, private URL и raw logs не попадают в tracked отчёт.
- Перед выпуском выполнить полную проверку T1 на интегрированном кандидате
  concurrency + themes, включая appearance нового composer, queue, requests,
  recovery и stop UI. Чистый theme-only preview не заменяет этот gate.
- До live pilot использовать fake runtimes; реальный ограниченный model smoke
  запускать в изолированном разрешённом тестовом scope с synthetic задачами
  и учётом расхода. Подготовить release/rollback evidence из раздела 7.

**P6.2 — выпуск матери после публикации exact candidate в P8.1.** Выполнить
раздел 7 с готовыми T1 и P6.1 evidence, непосредственным lifecycle approval и
точным pin. Новые исправления после публикации требуют нового проверенного
кандидата; не включать их незаметно в сборку под старым release receipt.

### P7. Завершить инструкции переноса

Обновить API contract, architecture decision, текущий roadmap и руководство
пользователя по queue/steer/stop/answer. Устаревшую формулировку fallback
«нет ack — можно повторить» заменить на доказанное отсутствие возможного dispatch.
Не ослаблять no-replay правило ради совместимости со старой реализацией.

Довести отдельную ND-инструкцию до пакета передачи: полный mother commit для
каждого этапа, schemas, state transitions, fixtures, обязательные отличия CLI,
migration/rollback constraints и known limitations. Оставить поля local ND commit
и live provider evidence pending до её собственного выполнения. Наличие плана
или source commit не считать признаком установки улучшений в ND.

### P8. GitHub и последовательный выпуск канонических clones

**P8.1 — публикация кандидата до production apply.** Подготовить итоговый
кандидат P1–P5 + T1 + P6.1, отдельные reviewable commits и зелёные интеграционные проверки.
В публикацию включить относящиеся к этому плану аудиты, планы и guides; явно
проверить staged paths и исключить чужие WIP, private state и generated artifacts.
Согласованный source base не пересобирается из случайного текущего dirty checkout.

Опубликовать проверенный код в существующий `NumericalArt/Pritha` без force-push
и без новых remotes. Сохранить repository branch protection и обычный review/merge
порядок, если он настроен. После публикации read-only подтвердить exact remote
`main` SHA и доступность этого commit, затем выпустить тот же pin на матери P6.
Не объявлять push выполненным только по наличию local commit.

На время последовательного rollout зафиксировать один полный 40-символьный
`targetCommit`. Текущий updater требует совпадения с `origin/main`: не публиковать
между apply произвольные новые commits, не менять target молча и не обходить guard.
Если remote продвинулся, остановить progression, проверить diff и заново подготовить
проверяемый pin. Итоговый documentation commit публикуется после завершения серии;
report различает source HEAD, deployed code SHA и BUILD_ID.

**P8.2 — мать → Даша → Саша → Марина.** Сначала пройти полную приёмку матери P6/T1.
До изменения каждого следующего экземпляра проверить его собственные runtime
identity, roots/home/agent parent, clean/divergent state, managed owner, disk,
active/unknown tasks, migration plan и rollback compatibility. Не копировать
runtime.env, credentials, queues, history, attachments, browser storage и live agents.

Read-only fleet preparation с проверенной конфигурацией основного экземпляра:

```sh
node scripts/pritha-fleet.mjs status --json
node scripts/pritha-fleet.mjs rollout --target-sha <full-release-sha> --json
```

До apply проверить, что manifest/plan содержит только согласованные четыре
instance IDs `main`, `dasha`, `sasha`, `marina` в этом порядке. Mother, уже
выпущенную в P6, не перезапускать повторно без необходимости: использовать
проверенный per-instance update для оставшихся clones либо только доказанный
noop/skip данного fleet helper. Не предполагать наличие несуществующего фильтра.

После готовности всех previews/plans получить необходимое непосредственное
lifecycle approval с указанием точного pin, перечисленных экземпляров и rollback.
Если одобрена вся эта конкретная последовательная транзакция, не запрашивать то же
разрешение повторно для каждой её штатной стадии. Новая topology, чужой процесс,
непредусмотренный teardown или изменившийся scope не маскируются этим approval.

Для каждой копии — managed staged update в её окружении, then strict health и
own-state self-test. До следующей копии проверить exact compiled commit/BUILD_ID,
все обязательные страницы/chunks, Classic default и Dark/Light persistence,
старую историю/Voice links и isolation fingerprints. Full unit/build и targeted
desktop/mobile tests выполняются на локальном release candidate; production smoke
остаётся ограниченным. Несколько чистых browser contexts не меняют theme пользователя.

При failure откатить только затронутый экземпляр по разделу 7 и остановить
progression. Уже проверенные экземпляры зафиксировать как обновлённые, последующие
оставить без изменений; временную смешанную версию показать явно. Весь fleet
не откатывается автоматически поверх новой пользовательской работы.

Gate P8: опубликованный код подтверждён на GitHub; четыре отдельных receipts
подтверждают один candidate pin и собственные BUILD_ID/roots; каждый health/test
результат принадлежит своему экземпляру. ND и child interfaces не затронуты.

### P9. Подготовить MacBook и завершить публикацию результатов

Подготовить отдельный
[MacBook update guide](../docs/macbook-task-chat-concurrency-and-themes-update.md)
на основе текущего manager workflow и фактического результата P8. В комплекте:
full release SHA, per-stage commits, prerequisites, Node/CLI/schema context,
migration/recovery limits, точные plan/apply commands, test matrix и rollback floor.
Не включать конфигурацию или данные Mac Mini; MacBook использует свои roots,
native history, credentials и service identity. Самостоятельное обновление MacBook
не является выполненным, пока оно не запущено и проверено на нём.

Статус пакета до реализации — `release-pin-pending`. После P8 проверить все paths,
commands по актуальному updater, заполнить pins и checklist, сделать пакет доступным
через GitHub. Если к моменту исполнения MacBook его pin уже не равен `origin/main`,
инструкция требует сверки нового target; ни переход на latest без проверки,
ни bypass old-pin guard не допускаются. Documentation-only follow-up тоже
фиксируется явно, если именно он становится новым проверенным target.

Опубликовать итоговый sanitized release report и guides в том же GitHub repository.
Записать для матери/Даши/Саши/Марины: before/after source/build references,
точные checks, допустимые warnings, сохранение Classic и rollback outcome.
Для MacBook записать `prepared`, отдельно от `deployed`; для ND — отдельная
инструкция, отсутствие установки этого канонического пакета. Проверить remote
receipt финального push. Private evidence/URL остаются только в state соответствующего
экземпляра; пользовательские ссылки можно передать приватно вне tracked Markdown.

Обновить knowledge links и instance-local memory/embeddings штатными scripts
после authored документации, затем проверить retrieval и privacy. Generated DB,
embeddings, журналы и native transcript не включать в GitHub publication.

Gate P9: готовый воспроизводимый комплект MacBook и ND, доступный опубликованный
итоговый отчёт, никаких незаполненных обязательных полей release package.
Если реальное обновление экземпляра осталось blocked, весь rollout не маркируется
completed; указать конкретно выполненные stages и оставшийся blocker.

## 6. Проверки и критерии готовности

Тесты поведения используют barriers/fake timers и synthetic state, а не только
поиск строк в исходниках. Существующие AST/shape tests сохранить по назначению.

| Набор | Обязательные сценарии |
| --- | --- |
| Durable intents | Concurrent identical create; conflicting body; attachment-only; ack lost; restart at every dispatch boundary; expired HTTP cache; failed disk write |
| Ownership | Две вкладки, два Node-процесса, provider aliases одного home, разные homes, старый owner callback, denied resume/inject/start |
| Voice | A→B и B→A; два tasks одного subject; независимый новый task; planner/steps; waiting/decision; duplicate answer; handoff и delayed Voice callback |
| Fallback | Busy, pre-dispatch failure, uncertain acceptance, timeout после tool activity, ошибка второго шага; нет повторного CLI/model start |
| Composer | A slow/unknown, B отправляется; несколько new drafts; поздняя навигация; изменение draft при await; вложения/ошибка/отмена не смешиваются |
| Background | Terminal/request события невидимого чата; reconnect/gap/out-of-order; bounded subscribers; archive не останавливает выполнение |
| Same-thread | Steer без нового turn; ended target; unknown ack; очередь после logical task; edit/cancel до dispatch; точный stop без влияния на B |
| Requests | UI+Voice CAS, expired native request, connection generation, scope grants, отсутствие обхода permissions через обычное сообщение |
| Workspace | Same-file worktrees, same checkout writer conflict, общие refs/ports/DB, dirty/non-Git, crash, apply conflict и сохранение cleanup evidence |
| Regression | Старые native/mirrored истории, recovery binding, aliases, archive/copy, модель и originals, бюджеты, Voice dictation/music, приватность |
| Themes | Classic no-diff, v2/legacy storage, first frame, three themes, six widths, states/contrast, Three.js/Canvas, Task Chat concurrency surfaces |
| Fleet/GitHub | Exact remote pin, mother-first, четыре отдельных health/build/state receipts, rollback stop-on-failure, MacBook package без private data |

Существующий узкий regression набор:

```sh
node --test tests/control-center-codex-chat.test.mjs tests/control-center-chat-evolution.test.mjs tests/pritha-voice-control.test.mjs tests/control-center-codex-thread-routing.test.mjs tests/control-center-codex-continuation.test.mjs tests/control-center-codex-planning.test.mjs tests/control-center-codex-safety.test.mjs
npm --prefix interfaces/control-center run typecheck
node scripts/validate-memory.mjs
node scripts/privacy-audit.mjs --strict
git diff --check
```

Добавить отдельные execution-store/admission/concurrency/queue/process-ownership
tests и Playwright cases в `interfaces/control-center/tests/e2e/`.
Перед выпуском обязательны полный применимый unit suite, self-test, staged build
и desktop/mobile browser tests по release workflow. Время ожидания в tests bounded;
никаких настоящих пользовательских prompts, Keychain secrets или paid probes
в обычном test command. Проверка реального телефона и provider smoke имеют
собственное evidence; viewport fixture их не заменяет.

Целевой UI gate для контролируемых fixtures: переключение/ввод не ждут HTTP A;
после server event фоновые изменения видны не позднее 5 секунд при здоровом
соединении, после recovery polling — 10 секунд. Это критерии реализации,
не уже измеренная гарантия. Производительность provider отдельно от UI latency.

## 7. Миграция, staged release и rollback на Mac Mini

1. Подготовить exact source pin, схемы, migration dry-run и тестовые evidence
   до вмешательства в работающий экземпляр. Проверить, что выбранный updater
   действительно поддерживает этот pin; не обходить его `origin/main` guard.
2. Получить согласованную границу выпуска: перестать принимать новые dispatch,
   сохранить возможность чтения и черновиков, дождаться завершения owned задач
   либо заранее согласовать адресную остановку. Unknown attempt не считать idle.
   Drain/maintenance command, если нужен, реализовать и проверить в P1/P2;
   в текущем коде его наличие не предполагается.
3. Создать приватный согласованный recovery snapshot registry, receipts, Voice
   links/requests, очереди, migration metadata и native history по локальной
   backup policy. Для SQLite использовать корректный consistent backup с учётом
   WAL, не копировать один открытый DB-файл. Сохранить attachment originals.
4. Первый совместимый выпуск содержит readers/recovery и защиту запуска;
   новые форматы очереди и параллельный dispatch активируются после strict health.
   Зафиксировать минимальный rollback-compatible commit. До этого старый build
   должен оставаться безопасной целью автоматического rollback менеджера.
5. После готовности кандидата выполнить read-only `update --plan` и получить
   отдельное непосредственное lifecycle approval по
   [staged-release workflow](control-center-staged-release.md).
   Текущее поручение подготовить план не является таким approval.
6. Только после него — managed pinned update на `main` Mac Mini. Никаких raw
   kills по порту, `npm run serve` для production, live-build swap из dev session,
   Tailscale/Telegram/cron изменений и обновления экземпляров вне согласованного P8.
7. Проверить compiled commit и BUILD_ID, instance isolation, `/voice`, `/agents`,
   `/task-chat`, `/codex`, `/settings` и все referenced JavaScript chunks.
   Смешанный synthetic pilot Direct A + Voice B + новый C, answer/queue/stop/reload
   выполняется заранее в изолированной сборке итогового кандидата. Production
   smoke ограничен страницами, доступом к известной старой истории без replay и
   browser-local переключением Classic/Dark/Light в чистом контексте. Не создавать
   production tasks/Voice sessions и не менять рабочие server settings ради тестов.
8. При сбое остановить дальнейшее включение через проверенный менеджер и сохранить
   evidence. После записи новых intents нельзя просто запустить старый writer или
   восстановить весь старый state: он потеряет новые receipts/работу. Использовать
   совместимый rollback build либо проверенную targeted обратную миграцию при drain.
   Код, который не понимает актуальную schema, должен отказать в dispatch.

Существующие команды подготовки и применения, где SHA берётся из готового
release report, а окружение — из проверенной конфигурации именно Mac Mini:

```sh
node scripts/pritha-instance.mjs update --plan --expected-commit <full-release-sha> --json
```

Следующая команда допустима только после описанного lifecycle approval:

```sh
node scripts/pritha-instance.mjs update --apply --yes --expected-commit <full-release-sha> --json
```

Feature rollback не отключает idempotency/ownership. Безопасный degraded mode
ограничивает новые исполнения одним слотом или приостанавливает dispatch,
сохраняя историю, receipts, вопросы, очередь и управление уже запущенными задачами.
Успех фиксируется delivery/release report с exact pins, проверками и ограничениями.
Good State signal фиксировать после реального acceptance, Git/tag baseline —
по отдельному recovery-point запросу пользователя.

## 8. Объём, альтернативы и завершение

| Этап | Рабочие дни одного знакомого с кодом разработчика |
| --- | ---: |
| P0: baseline, contract, fixtures | 1–2 |
| P1: durable state, create/metadata/fallback guards | 2–4 |
| P2: общий admission и Voice lifecycle | 2–4 |
| P3: независимый UI и фоновые статусы | 1–2 |
| P4: queue, steer, stop, input/approval/handoff | 3–5 |
| P5: worktree/resources и перенос результата | 5–10 |
| T1: три темы, совместимость Classic и visual matrix | 3–6 |
| P6: нагрузка, recovery и один managed release матери | 2–4 |
| P7: финальные контракты и пакет ND | 1–2 |
| P8: GitHub и последовательные Даша/Саша/Марина | 0,5–2 |
| P9: пакет MacBook и итоговые reports | 0,5–1 |
| Полный расширенный scope | **21–42** |

Это предварительная инженерная оценка с тестами и review, без ожидания оператора
и разработки в самой ND. Обновление MacBook на самом устройстве в эту оценку
не входит; включена подготовка проверенного пакета. Прежние 5–9 дней относились к первому ограниченному
смешанному этапу. Здесь P0–P3 оцениваются в 6–12 дней: добавлены явный durable
межпроцессный контракт и миграция. Полный scope включает P4/P5, которые прежде
оценивались отдельно. Предыдущие 17–33 дня всего плана не включали T1, rollout
clones и MacBook package; расширение добавляет ориентировочно 4–9 дней.
После P0 и P2 пересчитать оценку по фактическим результатам.

Минимальное снятие UI-флагов дешевле, но оставляет F2/V1/V3/V4. Только writer
serialization проще worktrees, но задачи одного проекта ждут друг друга.
Выбранный local coordinator даёт проверяемые границы ценой state machine,
миграции и recovery tests. Внешняя очередь и distributed workers добавят
операционный scope без необходимости для первой материнской установки.

План `refines` оба аудита и существующий API contract. Он не объявляет findings
устранёнными, перенос ND выполненным или runtime capabilities измеренными.
Завершение реализации требует закрытой матрицы F/V/T1, приёмки на Mac Mini,
успешного последовательного выпуска Даши/Саши/Марины, проверенной публикации
кода и отчётов на GitHub, безопасного rollback evidence и готовых отдельных
инструкций MacBook и ND с точными pins. Остановка после кода, preview или одной
матери не закрывает весь расширенный план. MacBook отмечается как подготовленный
к обновлению; фактическую установку без её локального evidence не заявлять.


## 9. Уточнение реализации от 2026-09-08

План выполняется в изолированной ветке. Источник истины по сущностям, versioned
migration guards, private IPC и граница совместимости зафиксированы в
[решении по координатору](../05_decisions/2026-09-08-task-chat-execution-coordination.md).
Фактические команды управления и границы восстановления — в
[операционной инструкции](../docs/task-chat-concurrency-operations.md).

Пилотный предел — 3, настраивается в private execution store. Активация primary/
replica отделена от установки: после strict health выполнить `activate` с точным
BUILD_ID каждого экземпляра. Runtime manager закрывает допуск перед stop, требует
нулевые active/unknown owners и запрещает несовместимый rollback после записи нового
execution state. Эти действия включаются в финальное конкретное lifecycle approval.

JSON registry format 1 сохранён для metadata. Legacy message guards импортируются
в schema-1 execution store с migration receipt; новые receipts в JSON — проекция
SQLite intents. Все JSON mutations сериализуются общей межпроцессной metadata lease.
Это выбранная реализация условного пункта о переносе registry, а не двойная authority.

Queue edit реализован как cancel + новый immutable intent. Summary route называется
`activity/stream`. Worktree apply v1 допускает только checked fast-forward, изменение
source требует отдельного review. ND получает отдельную инструкцию; наличие общего
модуля не означает, что ND runtime уже обновлён. Финальные source/deployed SHA,
полный последний test report, fleet receipts и MacBook release pin ещё должны быть
зафиксированы перед завершением плана.

## 10. Фактическое выполнение

См. [implementation review](../03_reviews/2026-09-08-task-chat-concurrency-implementation-review.md).
P0–P5 реализованы; T1 и P6 проходят финальную проверку. Новый selector workspace
позволяет изолировать новый чат при глобальном full access, сохраняя существующие
треды и явно выбранный configured mode. P8 production требует release receipts;
наличие commit и документации не переводит fleet/MacBook/ND в installed.
