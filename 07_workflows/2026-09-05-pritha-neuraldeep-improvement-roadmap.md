---
id: 2026-09-05-pritha-neuraldeep-improvement-roadmap
type: workflow
status: ready-for-implementation
created: 2026-09-05
updated: 2026-09-05
topics: [neuraldeep, agents-mother, codex-cli, delivery-budget, usage-accounting, recovery, task-chat]
tools: [Pritha, NeuralDeep, Codex CLI, Node.js, SQLite, Next.js]
agent_platforms: [Pritha NeuralDeep, Codex]
runtime_environment: [local-mac, cli, control-center]
portability: adapter-needed
sources:
  - operator-neuraldeep-specialized-roadmap-request-2026-09-05
  - neuraldeep-local-main-31b438e9d51ee0982f0ee4a3c18d6e6210117562
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md
  - https://learn.chatgpt.com/docs/config-file/config-advanced
  - https://neuraldeep.ru/docs
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - docs/neuraldeep-task-chat-adaptation.md
    - 07_workflows/control-center-staged-release.md
  decisions:
    - 05_decisions/2026-09-05-delivery-budget-continuation.md
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
refines: [docs/neuraldeep-task-chat-adaptation.md]
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: NeuralDeep main 31b438e; installed CLI 0.153.0; mother pilot continuation packet
retrieved: 2026-09-05
verified: 2026-09-05
valid_for: next NeuralDeep implementation cycle; recheck runtime and provider before live pilot
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: pritha
  id: pritha-neuraldeep
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Pritha ND: завершение агентов через Codex CLI и NeuralDeep

План подготовлен по фактическому NeuralDeep `main`
`31b438e9d51ee0982f0ee4a3c18d6e6210117562`. Он переносит цели улучшений
материнской Pritha на архитектуру ND. Реализация следующих пакетов ещё
не выполнена. Выпуск матери и четырёх канонических экземпляров не обновляет ND.

Результат: запрос проходит до проверенного агента и передачи результата;
лимит сохраняет работу и предлагает продолжение того же run. Токены, время,
итерации, ограничения аккаунта и неопределённость расхода различаются.
Лимит сам по себе не требует пересоздания агента или повторного согласования
неизменного результата.

## 1. Проверенная исходная точка

ND `main` чистый; private release manifest сообщает `deployed`, совпадение
HEAD с указанным pin и сохранение isolation fingerprints. Это evidence
предыдущего выпуска, а не новый тестовый прогон данного плана. Предыдущий
отчёт фиксирует 578 unit tests и browser evidence. Здесь выполнены чтение
кода, Git/runtime inventory и `codex --version`; модельные вызовы, смена
конфигурации и service lifecycle ND не запускались.

Путь: Task Chat или Agents Mother → `scripts/neuraldeep-codex.mjs` → stock
Codex CLI `exec`/`resume` → локальный Responses adapter → NeuralDeep.
App Server матери не является транспортом ND. Разрешённый launcher сообщает
CLI 0.153.0; fallback model slug в коде — `qwen3.6-35b-a3b`. Это не проверка
текущей доступности, цены или пригодности модели для конкретного агента.

| Источник в ND | Наблюдение | Следствие |
| --- | --- | --- |
| `scripts/neuraldeep-codex.mjs`, `codex-chat/cli-runtime.ts` | Отдельный Codex home, Keychain auth, provider `neuraldeep`, `exec_resume` | Сохранить CLI, profile и provider identity |
| `scripts/agents-mother/build-executors.mjs` | Build и отдельный модельный structured summary; capability probe тоже вызывает модель | Учитывать и резервировать каждый вызов, включая summary/probe |
| Тот же executor | Receipt возвращается после обоих успешных вызовов; timeout/failure бросает ошибку раньше; отсутствующий terminal usage сводится к нулю | Журнал до spawn; unknown и terminal result для каждого подшага |
| `scripts/agents-mother/delivery-loop.mjs` | Overshoot вызывает `token_usage_invalid`; budget revision предлагает новый run | Сохранять превышение в spent и продлевать тот же run |
| `scripts/neuraldeep/usage-ledger.mjs` | SQLite ledger v2, `usage_known`, session/model deltas, sources, billing snapshot/estimate | Развивать существующий ledger; исключить двойной учёт |
| `codex-chat/admission-coordinator.ts` | Очередь, ограничение одновременности, coordination keys и recovery | Общие lease/receipts для UI, Voice и delivery |
| `voice-topic-store.ts`, `voice-topic-routing.ts`, `voice-task-links.ts` | Темы/поколения связаны с CLI sessions и карточками | Сохранить связи при миграциях и продолжении |
| `scripts/neuraldeep/responses-adapter.mjs` | Loopback proxy, фиксированный HTTPS upstream, bounded тела, буферизация SSE | Не обещать live token cap или token-by-token streaming по одному UI |
| Updater: `07c234b`; canonical CLI path: `28cc130` | Pinned local release и verified rollback уже реализованы | Старые R0 blockers об origin и rollback больше не считать открытыми |

В ND есть подробный `docs/neuraldeep-task-chat-coding-plan.md` для A/B/C/M/S.
Его начало на `88a69c8`, dirty main и неподготовленном updater устарело после
консолидации. R0 реализован; остальные пункты проверяются по коду и tests,
а не по наличию документа. Этот roadmap дополняет его бюджетом и delivery.

[Codex Custom model providers](https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers)
подтверждает настройку provider и command-backed auth; совместимость будущих
параметров со старым binary всё равно требует локальной проверки.
[NeuralDeep Docs](https://neuraldeep.ru/docs) указывает на документацию
провайдера. Детальные Responses schemas, модели, тарифы и ограничения здесь
не подтверждены: получить датированное первичное evidence перед изменением
адаптера и live pilot. Retrieval date не заменяет source version/update date.

## 2. Сохранённые границы и правила переноса

- CLI-only execution, отдельный Codex home, Keychain, sandbox и profile identity;
  смена провайдера/модели только по разрешённому выбору.
- История, mirrors, request receipts, Voice topic/generation и private state.
  Archive не останавливает активный CLI процесс; старые prompts не replay'ятся.
- Accepted graphite palette, Settings и ND lockfile. Не понижать зависимости
  переносом release commit матери.
- Раздельные approvals Contract/Outcome, protected Trials, exact revision;
  verified, accepted и handed-off различаются.
- Agent artifacts и usage остаются instance-local. Shared evidence обезличено.

| Улучшение матери | Применение в ND |
| --- | --- |
| 0.1/0.2/0.6: probes, publication, env-first alignment | Небольшие helpers и поведенческие tests после проверки локального diff |
| 1.0/1.5: accounting/recovery | Инварианты поверх CLI receipt/session и существующего provider ledger |
| 1.1/1.4: amendments и host verification | Same-run API, versioned migration и общий admission |
| 1.2: Native Goal controller | Не копировать RPC; использовать host-owned run budget. Native Goal — только при доказанной CLI capability |
| 1.3: budget intent | Явный target run, scope, единицы и разрешённая величина |
| Фазы 2/3/4 | Identity/readiness/scaffold/Trials по применимости к CLI |
| Фазы 5/6/7 | Собственные provider fixtures, измерения и local release evidence |

## 3. ND-0 — контракт измерений и baseline

Оформить короткий decision: host run budget — основной механизм. Отсутствие
`thread/goal/*` в поддерживаемом CLI пути не блокирует создание агента и не
требует одноразового Goal waiver. Метка `host-budget-enforced` должна уточнять
границу: preflight между вызовами, timeout/process control и observed usage.
Остановка модели точно внутри токенного лимита остаётся `unverified` до
отдельного доказательства на этом runtime/provider.

Зафиксировать CLI/model/adapter versions и capability provenance. Проверить
расхождение custom `PRITHA_NEURALDEEP_CODEX_HOME` с identity/read paths старого
store: default normalization не доказывает происхождение старой записи.

Готовность: versioned accounting contract, Good State Alignment, private
snapshot registry/receipts/attachments/native history, fixtures старых budgets.
Probe с модельным вызовом явно объявляет расход до запуска.

## 4. ND-1 — полный расход и восстановление

До spawn каждый attempt получает durable ID/receipt с run, iteration, substep
(`probe`, `build`, `summary`), profile, model, reservation и worktree revision.
Launcher run ID связывается явно. `thread.started` сохраняет session ID
отдельно от attempt/turn ID; synthetic ID не выдаётся за native подтверждение.

Записывать terminal state и usage также при failed, interrupted, timeout и
summary failure. Известный overshoot увеличивает spent; неизвестный расход
остаётся unknown. Не складывать cumulative total с его delta, CLI usage с тем
же provider usage, reasoning/cached subsets с полным total. Смена модели,
reset counters и неполное событие получают coverage/reset признаки.
Wallet estimate, фактическое списание и subscription usage — разные величины.

Recovery сначала сверяет receipt, process ownership, session и worktree.
Потеря ответа не запускает build/summary повторно. Недоказанное завершение
оставляет recoverable reconciliation state и доступ к проверке результата.
Для следующего платного шага предлагается конкретное разрешение с видимой
неопределённостью, без стирания расхода.

Summary по возможности строится из проверенных outputs детерминированно.
Модельный summary, если нужен, имеет собственные reservation/receipt; его
ошибка не аннулирует build. Развивать существующий private ledger через
versioned migration и idempotent attempt key.

Готовность: failed build, successful build + failed summary, lost terminal,
restart, duplicate request, reset/model switch, overshoot и unknown fixtures.
Известный расход записан ровно один раз; recovery не повторяет side effects.

## 5. ND-2 — продолжение того же run

Адаптировать amendments матери: дополнительные токены/итерации/время с request
ID, actor и expected ledger version. Сохранить Contract/Outcome approval,
worktree, attempts и spent. Нет искусственного предела количества продлений;
каждое проверяет разрешённый объём. Elapsed extension даёт полезное время
от момента продолжения.

До следующего модельного вызова проверить остаток и reservations. Approved
Trials и сбор evidence готового результата доступны после лимита. Trial
subprocess не считается автоматически бесплатным: permissions и возможные
external costs сохраняются. Unknown не превращается в ноль.

Task Chat, Voice и Agents Mother используют общий binding к run и admission.
Живой CLI не получает конкурирующий resume; после tool activity нет
автоматического replay. Временный provider failure сохраняет очередь и работу.

Готовность: лимит в каждом подшаге допускает завершение в том же run;
повтор grant не удваивает cap, два контроллера не создают два процесса,
готовый результат проходит approved verification при исчерпанном бюджете.

## 6. ND-3 — UI, intent и ошибки провайдера

Показать цель результата, spent/cap/reserved, coverage, состояние продолжения,
«добавить бюджет» и «проверить готовый результат». Это бюджет run, а не Native
Codex Goal. Токены, модель, оценка рублей и ограничения аккаунта подписаны
отдельно. Числовые drafts и idempotency request сохраняются при reconnect.

«Продолжай» использует уже разрешённый остаток; «добавь N токенов» адресуется
выбранному run. Неоднозначные единицы/несколько runs требуют одного существенного
уточнения. Для неизменного результата весь Contract/Outcome не согласуется заново.

Различать credentials, billing, rate limit, access denied, model unavailable
и outage. Retry-After/ожидание не разрешает платный replay. Альтернативная модель
предлагается с объяснением совместимости, без молчаливой замены текущей.
Account API timeout не стирает историю или локальный ledger.

Готовность: desktop/mobile, lost response/reload, active/read-only session,
401/402/403/429/5xx, unknown price и stale account snapshot. Реальная
недоступность провайдера не скрывается обещанием безусловного завершения;
результат и путь восстановления остаются доступны.

## 7. ND-4 — identity, readiness, scaffold и handoff

Адаптировать mother 3.1 → 2.5 → 2.1/2.3 → 2.2/2.4, затем 0.5/2.6/3.2/3.3.
Stable ID берётся из authored inputs; путь/отчёт не подменяет identity.
CLI агент не требует web UI или service manifest без выбранной операции.
Readiness разделяет verification, runtime, acceptance и handoff. CLI probe
не исполняет произвольные команды непроверенного документа.

До повторного пилота закрыть 4.0/4.1/4.2: scaffold соответствует runtime family,
Trial inputs защищены до build, evidence независимо от executor. Отсутствующий
ND Goal RPC заменяется host accounting contract; permissions/Trials сохраняются.

Готовность: synthetic CLI от accepted inputs до handoff, instance-local
идемпотентный profile, карточка без ложных web/service blockers.

## 8. ND-5 — Task Chat A/B/C, память и Settings

Исполнять локальный `docs/neuraldeep-task-chat-coding-plan.md` с уточнённой
исходной точкой: A — proof-based history recovery; B — архив/полный Copy;
C — оригиналы вложений и весь CLI → Responses → NeuralDeep путь. CLI input,
adapter payload и model capabilities проверяются отдельно. Хранение оригинала
не доказывает его интерпретацию. Attachment receipt использует ND-1/ND-2.

M/S переносятся по оставшемуся diff: effective home, собственная память,
числовые Settings и provider fields. Уже исправленный canonical CLI Usage
не чинить повторно без регрессии. Streaming — отдельная измеренная работа
после стабилизации receipts, payload limits и backpressure.

Готовность: read/download оригинала, сохранение draft при несовместимой модели,
история/Voice associations после миграции, проверки поддержанных MIME/моделей,
применение Settings после reload.

## 9. ND-6 — пилоты, калибровка и выпуск

После offline fixtures провести один synthetic CLI pilot на доступной модели
с явно выбранным бюджетом. Включить продолжение после лимита и recovery без
replay; provider outage моделировать fixture. Не провоцировать сбой сервиса.

Измерять probes/build/summary/research/embeddings по разным sources;
known/unknown coverage, estimate/actual отдельно; active/queued/user-wait time;
полезные уточнения, verification/acceptance. Калибровать по сопоставимым
model/version/task samples с указанным знаменателем. Токенные defaults
OpenAI не являются эмпирическим бюджетом NeuralDeep.

Перед выпуском: focused tests, typecheck, staged build, privacy, self-test,
desktop/mobile, strict `/codex`, `/task-chat`, `/settings`, `/agents`, `/voice`
и другие обязательные ND страницы плюс chunks/build identity. Использовать
ND pinned **local** updater и подтверждённый manager с private recovery
artifacts; origin/main матери не назначается upstream ND. Trusted-peer
проверка фиксируется отдельно от локального viewport.

## 10. Очередь и критерий завершения

| Очередь | Пакет | Результат |
| --- | --- | --- |
| Подготовка — выполнена | Сверка ND main, этот roadmap, CLI version | Проверяемые исходные точки и отделённые неизвестные |
| Первая реализация | ND-0 + ND-1 | Decision, durable receipts и учёт build/summary/probe, recovery tests |
| Вторая реализация | ND-2 | Same-run extension и host verification без Goal RPC blocker |
| Третья реализация | ND-3 | UI/intent/provider recovery с общим admission |
| Следующий блок | ND-4 | Identity/readiness/scaffold для повторного CLI |
| Отдельные UI пакеты | ND-5: A → B → C; M/S по diff | История, файлы и Settings |
| Проверка результата | ND-6 | Измеренный CLI outcome, проверенный release и handoff |

ND-5 A/B может предшествовать ND-4 по пользовательскому приоритету; C зависит
от ND-1/2. Server refactor, timeout policies, cleanup/redaction, Sensors docs
и CLI getting-started соответствуют mother 0.3/0.4, 5.1–5.5 и 7.1–7.3, но
внедряются по конкретному ND diff. Techscope rename остаётся отложенным.

Закрытие roadmap требует доказанного end-to-end outcome и acceptance.
Публикация плана или выпуск материнской Pritha сами по себе его не закрывают.
