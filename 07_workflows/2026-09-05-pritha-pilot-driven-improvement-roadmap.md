---
id: 2026-09-05-pritha-pilot-driven-improvement-roadmap
type: workflow
status: in-progress
created: 2026-09-05
updated: 2026-09-06
topics: [agents-mother, outcome-spec, autonomous-delivery, goal-budget, card-readiness, control-center, registry-identity, runtime-hardening, pilot-metrics]
tools: [Pritha, Codex, Codex App Server, Node.js, Next.js, Markdown]
agent_platforms: [Codex, Pritha Control Center]
model_context: [runtime-dependent]
runtime_environment: [local-mac, cli, control-center]
config_surfaces:
  - scripts/agents-mother/
  - scripts/pre-push-audit.mjs
  - scripts/pritha-promote.mjs
  - interfaces/control-center/src/lib/control-center/server.ts
  - interfaces/control-center/src/lib/codex-chat/
  - interfaces/control-center/src/components/agents/
  - interfaces/control-center/src/components/settings/
  - 08_templates/agent-project-contract.md
  - 08_templates/agent-outcome-spec.md
  - PRITHA_STATE_ROOT
portability: adapter-needed
sources:
  - 03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md
  - 03_reviews/2026-08-22-outcome-delivery-remediation-plan-applicability-assessment.md
  - 11_agents/reports/2026-09-05-pritha-integrated-fleet-release-report.md
  - 03_reviews/2026-09-05-pritha-budget-continuation-fleet-release-review.md
related:
  intakes: [00_inbox/texts/2026-09-05-pilot-driven-improvement-planning.md]
  reviews:
    - 03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md
    - 03_reviews/2026-09-05-pritha-pilot-guardrails-implementation-review.md
    - 03_reviews/2026-09-05-pritha-goal-lifecycle-accounting-implementation-review.md
    - 03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
    - 05_decisions/2026-08-19-instance-local-child-agent-ownership.md
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
    - 05_decisions/2026-09-05-delivery-budget-continuation.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-interface-experience.md
    - 04_standards/child-agent-lifecycle-metadata.md
    - 04_standards/child-agent-identity.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/pritha-good-state-alignment.md
  workflows:
    - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
    - 07_workflows/2026-08-22-outcome-delivery-remediation-execution-preparation.md
    - 07_workflows/control-center-staged-release.md
supersedes: []
superseded_by: []
refines: [07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md]
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-06
source_version: pilot roadmap revision 16; released base cf11419; completion work in codex/roadmap-completion
retrieved: 2026-09-05
verified: 2026-09-06
valid_for: next improvement cycle beginning on primary Mac mini
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Roadmap: проверяемое завершение агентов, начиная с материнской Pritha

**Реализация начата на материнской Pritha `main` на Mac mini.** Исходная
сверка выполнена по checkout `43baa16` от 2026-09-05. Пункты 0.1, 0.2 и 0.6
реализованы и проверены локально: 533/533 tests и staged build проходят.
Результат зафиксирован в
[review первого пакета](../03_reviews/2026-09-05-pritha-pilot-guardrails-implementation-review.md).
Следом реализован локальный пакет 1.0/1.5: persisted Goal lifecycle и recovery
проверены на CLI 0.153.0 и App 0.153.4 без model turns. Usage gates проверены
fixtures; mid-turn поведение 1.7 остаётся runtime-unverified. Подробности — в
[review Goal и учёта](../03_reviews/2026-09-05-pritha-goal-lifecycle-accounting-implementation-review.md).
Затем реализованы локальное ядро 1.1, UI/API 1.2 и delivery часть 1.4:
дополнительный бюджет продолжает тот же run, согласованные Trials могут
завершить готовый результат после лимита. Task Chat показывает бюджет Goal,
страница агента читает ledger v2. Состояние проверок и оставшиеся границы — в
[review продолжения](../03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md).
Текущий полный self-test: 581/581 тест, семь quality checks и strict live
health pass. Privacy/pre-push audit проходит для всего локального diff.
По отдельной команде пользователя `main` обновлён, пакет `68147d8` опубликован
в GitHub и установлен на основной Pritha и четырёх канонических экземплярах.
Self-test 581/581 и strict UI прошли на всех пяти; cold-start/latency exceptions
зафиксированы в [release report](../03_reviews/2026-09-05-pritha-budget-continuation-fleet-release-review.md).
Это не закрывает весь roadmap. Для архитектуры
CLI-only и провайдера NeuralDeep подготовлен
[отдельный roadmap ND](2026-09-05-pritha-neuraldeep-improvement-roadmap.md).

**Продолжение по полному roadmap:** пользователь поручил завершить необходимые
изменения, подготовить и обновить канонические экземпляры, расширить план ND
и опубликовать итог в GitHub перед ручным тестированием создания агентов на
материнской Pritha. Полный объём сохраняется. Текущая ветка
`codex/roadmap-completion` начинается от `cf11419`; список доказательств и
незакрытых требований ведётся в
[completion tracker](2026-09-05-pritha-roadmap-completion-tracker.md).

**Оставшийся объём:** 0.3, adoption локальных 0.4/0.7 и профили; adoption текстового budget intent 1.3,
budget intent для связанной сборки 1.3, полный accounting 1.5, live-проверка 1.7 и калибровка;
readiness/identity/handoff фаз 2–3; scaffold/Trials фазы 4; выбранные runtime
исправления фазы 5; повторные пилоты фазы 6; публичный путь фазы 7.

## 1. Задача и фактическая исходная точка

Довести путь «запрос → согласованный результат → реализация → проверка →
передача» до воспроизводимого завершения без ручных обходов оркестрации.
Имеющаяся реализация delivery и успешный конечный CLI-пилот дают основу,
но пока не доказывают полностью автономное прохождение этого пути.

Подробная сверка и источники находятся в
[assessment текущего состояния](../03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md).
Ключевые уточнения:

1. Self-test основного экземпляра проходит: 518/518 tests, пять UI страниц,
   13 chunks, без критических регрессий. Есть известные operational warnings.
2. Проверка остатка бюджета до build уже существует. Главный воспроизводимый
   blocker — Goal/get в ephemeral thread; отказ получен и на CLI 0.153.0,
   и на App binary 0.153.4. Методы Goal есть в обеих схемах.
3. Финальные 5/5 Trials пилота относятся к отдельно проверенному canonical
   checkout. Исходный delivery ledger остался blocked. Заявленные в draft
   токены/время/число сообщений не стали измеренной телеметрией.
4. Readiness требует manifest у CLI; registry читает subject.id, но отбрасывает
   report без name/path в body ещё до сопоставления. Это конкретные пробелы.
5. Generic scaffold допускает только codex-native. В пилоте понадобился
   contract-specific CLI scaffold — дополнительная причина трения до build.
6. Четыре source paths из draft не найдены; утверждение о четырёх проверенных
   аудитах снято. Новые выводы привязаны к доступным первоисточникам.

Первые сессии были ограничены локальными изменениями матери. Следующая команда
пользователя 2026-09-05 разрешила canonical fleet release этого пакета:
основная Pritha, Dasha, Sasha, Marina и MacBook. Экземпляры сохраняют собственные
private state и child checkouts. ND получает специализированный план; перенос
её исполняемого кода и service release остаются отдельной работой.

## 2. Что сохраняем

- Outcome-first proposal; Contract и Outcome Spec имеют отдельное одобрение.
- Disposable build worktree и его отдельная ветка; user worktree не подвергается
  stash/reset/overwrite. Native Chat history не переписывается и не replay'ится.
- Immutable Trial plan, approval store, protected verifier inputs, semantic,
  document, workspace и evidence locks; exact revision проверяется повторно.
- Verified, awaiting acceptance, accepted, promoted и handed-off различаются.
  Наличие handoff Markdown или зелёный HTTP health не заменяет эти доказательства.
- Local Trial isolation остаётся честно обозначенной `none`; требуемая
  изоляция не снижается автоматически ради продолжения.
- Новые child artifacts хранятся только в instance-local agent memory.
  Tracked `11_agents/` не становится новым live registry.
- Fail-closed publication/adoption; managed staged release и recovery anchor.
- Перед изменениями — Good State Alignment с разрешённым окружением main.
  Сверка не добавляет лишних запросов пользователя для совместимых изменений.
- В scripts не добавляются внешние runtime dependencies. Prompt counters
  могут служить подсказкой, но не заменяют host enforcement.

Уточнение пользователя 2026-09-05: лимиты и шаги не должны создавать тупик
при создании агента. Исчерпание бюджета сохраняет run, worktree, approvals и
расход. Уже разрешённое завершение выполняется, а для дополнительной
реализации предлагается конкретное продление того же run. Повышение токенов,
итераций и времени требует соответствующего разрешения, но не нового
Contract/Outcome Spec для неизменного результата. Это правило зафиксировано в
[decision о продолжении](../05_decisions/2026-09-05-delivery-budget-continuation.md).

## 3. Как исполнять план

Исходные IDs 0.1–7.3 сохранены для трассировки; добавлены 0.6, 0.7, 1.0 и 4.0.
Номер фазы группирует тему, а не задаёт календарную очередь. Размеры S/M/L
означают относительный объём и уточняются после первого failing test;
обещаний по неделям и точной длительности здесь нет.

Каждый рабочий пакет завершается: воспроизводимый случай → минимальный fix →
профильные проверки → запись результата. Изменения protocol/schema получают
version context и тест совместимости. В сомнительных местах сначала создаётся
короткий decision record с выбранной альтернативой, затем реализация;
обычные совместимые решения не требуют отдельного пользовательского опроса.

## 4. Фаза 0 — Локальные исправления и подготовка

### 0.1 Ограничить завершение синхронных probes — S

E1 подтверждён в `server.ts`. Проверить каждую timeout-пробу и добавить
обоснованное завершение, включая `killSignal: "SIGKILL"` там, где нужен жёсткий
предел. Это не устраняет блокировку event loop до timeout; async перенос — 5.1.
Готовность: отдельный процесс-тест с игнорированием SIGTERM завершается в
ограниченное время с допуском CI; timeout/error корректно отражены в результате.

**Результат 2026-09-05: реализовано и проверено локально.** Семь диагностик
используют общий helper с обязательным timeout и SIGKILL. Ошибка не позволяет
признать частичный вывод здоровым; tests и staged build проходят. Runtime
adoption выполнен на пяти экземплярах в `68147d8`. Event loop и деревья потомков остаются
вне доказанного scope этого fix; подробности — в review первого пакета.

### 0.2 Publication guard при неизвестной базе — S

E2: `pre-push-audit.mjs` возвращает пустой список без merge-base. Выбранный
план — **fail-closed**, без «предупреждения и успеха». Не смешивать это с
неявным fetch. Offline/full-scan режим, если понадобится, проектировать отдельно.
Готовность: отсутствующий origin/main, shallow/unrelated history и ошибка Git
не дают успешного guard; известная база и допустимый diff проходят. Проверить
untracked/deleted child artifacts и сохранение общего privacy scan.

**Результат 2026-09-05: реализовано и проверено.** Unknown, failed, empty и
malformed merge-base дают failed check без network fetch; остальные privacy
checks выполняются. Publication suite 7/7 и audit текущего diff проходят.

### 0.3 Согласовать русский getting-started — S

F3 подтверждён. README.ru описывает ту же реально поддерживаемую
последовательность Contract → Outcome approval → delivery → acceptance,
ссылку на guide и текущие ограничения CLI/scaffold/Goal.
Готовность: команды проверены по CLI help и fixture; простого `rg Outcome`
недостаточно. Не обещать работающий generic CLI путь до 4.0 и повторного пилота.

### 0.4 Один набор CHILD_AGENT_TYPES — S

F2: вынести одинаковую policy в общий модуль scripts/lib для promote и audit.
Готовность: один экспорт; поведенческие publication tests продолжают ловить
запрещённые типы. Удалять только тест дублирования, не coverage запрета.

**Результат 2026-09-05: реализовано локально.** `CHILD_AGENT_TYPES` вынесен в общий
`scripts/lib/child-agent-artifacts.mjs`; оба consumer используют один экспорт.
Семь publication regression tests проходят. Runtime adoption нового пакета
ещё не выполнен.

### 0.5 Canonical profile при handoff — M, после 3.1

C3 подтверждён. Профиль создавать в instance-local `agents/profiles/`, с
устойчивым ID и provenance из принятых authored inputs. Authored профиль
не перезаписывать. Повторный handoff идемпотентен; конфликт ID диагностируется.
Готовность: профиль правильно связан с агентом, не публикует private data и
не сообщает verification, если есть только обнаруженные файлы.

### 0.6 Good State helper использует окружение экземпляра — S

Добавлено по подготовке: helper без загруженного runtime env может читать
legacy index вместо памяти main. Согласовать его с общим env loader, сохраняя
приоритет уже заданных переменных и legacy fallback при отсутствии настройки.
Готовность: запуск из обычного shell и с явным external state-root возвращает
baseline нужного экземпляра; чужая память не читается. Для checkout до fix
в execution preparation сохранён проверенный env-first запуск.

**Результат 2026-09-05: реализовано и проверено.** Общий runtime env loader
подключён до выбора индекса. Пять regression tests проходят; обычный запуск
на main возвращает актуальные accepted baselines. Предварительная ручная
загрузка env больше не требуется.

### 0.7 Реальный page/chunk gate внутри обновлятора — M, до следующего UI release

Post-release inspection `68147d8` показал: `pritha-instance.mjs` проверяет
внутри transaction только `/api/health`; декларация steps о strict chunks
не соответствует коду. В текущем выпуске полные проверки выполнены отдельно.
Следующий пакет должен проверять обязательные страницы, все их JavaScript
chunks и build ID до признания update успешным, сохраняя verified shutdown
перед rollback. ND local updater и его regression tests — reference для
адаптации, без замены mother remote/pin semantics.

Готовность: недоступный chunk, неверный build ID/instance и page failure
вызывают проверенный rollback и остановку fleet. Cold-start budget явно
ограничен; одиночный медленный ответ не превращается в вечный retry или
network watchdog. Наблюдения Marina/MacBook связываются также с 5.1/5.2.

**Результат 2026-09-05 в ветке completion:** строгая проверка обязательных страниц,
всех найденных JS chunks, exact commit и staged BUILD_ID теперь включена в
release transaction. Rollback проверяет предыдущий BUILD_ID и страницы;
неподтверждённый managed stop по-прежнему запрещает замену файлов. Сроки
readiness, request, strict checker и rollback ограничены общей именованной
policy и валидируются до mutation. Профиль release/health/policy: 25/25 pass;
fleet stop-on-failure также проходит. Adoption ещё предстоит.

## 5. Фаза 1 — Goal, бюджет и продолжение

### 1.0 Согласовать срок жизни build thread и Goal — M, первый архитектурный gate

Статус: локально реализован persisted thread на попытку с run-wide host ledger.
Get/set/readback/reconnect и cleanup подтверждены на обеих установленных
версиях; выбранная архитектура зафиксирована в
[decision](../05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md).
Ни один из этих protocol checks не запускал модель.

Проверка 2026-09-05 воспроизвела несовместимость ephemeral + Goal.
Сравнены один run-bound persisted thread и отдельные iteration threads.
После bounded protocol test выбраны persisted iteration threads и host
ledger как run-wide учёт. Goal получает только подтверждённый остаток.
Не считать обновление бинарника или continue-without-goal исправлением.

Поверхности: execution-backends, build-executors, delivery-loop, binary
resolvers App/CLI. Готовность: выбранный backend проходит get/set/readback,
reconnect/resume и завершение в правильной lifetime; нет дублирующих turns,
избыточного сохранения private payload или неявного waiver. Реальная модельная
проверка, когда потребуется, имеет отдельный явно выбранный бюджет.

### 1.1 Preflight поверх существующего контроля — M, после 1.0 и 1.5

Локальное ядро реализовано: execution lease на run, used/cap/reserved/available,
user-authorized budget amendments и resume без новой задачи. Double dispatch
и idempotent extension проверены fixtures. Прогноз стоимости по сопоставимым
измерениям добавляется после получения таких данных.

Не дублировать проверку remaining > 0. Перед модельным шагом использовать
подтверждённый остаток, reserved/in-flight расход и консервативную оценку,
если есть сопоставимые данные. Unknown usage останавливает следующий
модельный шаг; прогноз не изображает точный hard cap.
Готовность: ниже требуемого резерва turn не стартует, double dispatch не
резервирует бюджет дважды; ledger содержит причину и числа. Использовать
существующие typed blocker codes либо явно версионировать новые.

### 1.2 Управление Goal из Task Chat — M

UI/API реализованы и выпущены в `68147d8`: отдельный GET, add/set total, явное
resume, private receipt перед RPC, readback/reconnect, сохранение objective и
usage. Reader v2 и отображение полноты учёта доступны на странице агента.
Actual component проверен в desktop/mobile browser с mocked HTTP; controller
проверен на обоих установленных runtime в paused probes без модели.
Полный `/codex` прошёл managed adoption и strict проверки; scope native Goal не
смешивается с budget amendment отдельного delivery run.

A2: конкретная native задача показывает used/cap/status и расширение бюджета.
Settings → Limits может показывать обзор; account quotas, prompt budget,
native Goal и delivery cap представлены раздельно. Сначала работоспособная
карточка восстановления, затем общие настройки.

Goal get/set/clear подтверждены документацией и установленными схемами.
«Добавить N» и «установить общий лимит N» — разные действия. При расширении
сохранять objective и usage, перечитывать результат. Clear/замена цели не
скрывают историю затрат. `usageLimited` не лечится увеличением tokenBudget.
Готовность: capability gating, instance/thread ownership, pending turn,
reconnect, повтор запроса, ошибка RPC и новый лимит ниже usage обработаны;
продолжение не требует новой пользовательской задачи.

### 1.3 Явный бюджет из текста — M, после 1.2

Task Chat превращает однозначную команду пользователя в то же типизированное
действие изменения конкретного бюджета. Это не prompt-only пожелание.
Уточнение нужно при неоднозначности «до N / ещё N» или объекта бюджета;
однозначный уже авторизованный intent не требует повторных подтверждений.
Готовность: кириллица, разделители чисел, invalid/overflow, цитата чужой команды,
повтор сообщения и несколько активных run'ов не изменяют неверную цель.

**Результат 2026-09-05 в ветке completion:** прямой текстовый intent для
бюджета выбранной native задачи преобразуется в те же Goal receipts и RPC.
`добавь 100 000 токенов к бюджету этой задачи` и
`установи бюджет этой задачи до 500 000 токенов` различаются; `и продолжай`
явно запрашивает resume. Цитаты не исполняются control plane, неясный scope
и invalid/overflow требуют конкретизации. Потерянный ответ повторяет тот же
request; нет нового model turn, нового chat или сброса usage/objective.
Actual Task Chat page проверен на 1280 и 390 px с mocked HTTP, включая
lost-response retry и reload.

**Дополнение 2026-09-06:** после exact binding 1.4 реализован budget intent
конкретной сборки. Run выбирается по явно названному ID, панели или единственной
связи; неверный выбор не перенаправляется на другую сборку. Typed action
сохраняется до mutation; UI/text/CLI поддерживают add и set total, ledger
сохраняет usage, iterations и дату начала. В панели также доступны дополнительные
итерации и минуты. Resume отдельный: явная команда продолжает существующий run,
повтор запроса не добавляет бюджет и не повторяет уже отправленную работу.
Browser actual page на 1280/390 px проверяет потерянный ответ, смену выбора,
explicit run, reload и неизменный parent Goal. Managed adoption впереди.

### 1.4 Завершение host-owned шагов при ограниченном Goal — M

Delivery часть реализована: после известного overshoot выполняются одобренные
Trials, а `delivery verify` позволяет повторить проверку без build turn.
Для unknown расхода требуется подтверждённый terminal + archived attempt;
готовность результата не меняет unknown на complete accounting.
Task Chat часть реализована локально через `task-control.json` и узкие host
actions: exact native task/storage/provider/instance → agent/project/run/approved
plan. Для verification не нужен Goal RPC или новый model turn. Подготовленный
demo доступен в панели с отдельным acceptance; deployed adoption впереди.

В CLI handoff/accept общего Goal gate не найдено. Новый Task Chat host путь
не проверяет Goal budget или наличие Goal capability; он проверяет native
ownership и разрешения конкретного run. Уже разрешённые host jobs должны иметь путь
через узкое действие control plane, не требующее нового модельного turn.
Проверено в synthetic integration: exhausted budget → approved Trials →
handoff preparation, без build iteration/Goal mutation; exact binding и
сохранённые request receipts переживают повтор/обрыв. Actual page browser
fixture проходит desktop/mobile. Реальный provider pilot относится к 1.7.
Workflow: `07_workflows/task-chat-delivery-host-actions.md`. Все прежние permission/evidence/acceptance gates сохраняются.

«Не создаёт turn» не значит «бесплатно и безопасно»: npm scripts, Trials и
подпроцессы способны вызвать модель, сеть или побочный эффект. Классифицировать
approved plan, cwd/argv, timeout, output, concurrency и isolation; не вводить
безусловный allowlist по имени `npm test` или команды.

### 1.5 Честный учёт расхода — M, до 1.1/1.6

Статус: build accounting выпущен, локально добавлен scoped overview. Receipts v2 сохраняются до/после
dispatch и на ошибках; ledger v2 дополнен явными unknown/legacy-unknown.
Восстановление не повторяет turn и не переписывает старые Trial results.
CLI/report показывают область build executor. `delivery usage` и Task Chat
показывают также parent thread counter с partial coverage и отдельные Trial
invocation receipts с неизвестными токенами. Actual billing parent/команд не
выводится из этих snapshots. Версия соединения и storage приходят от host,
а не из JSON модели; repeated events/Goal updates не увеличивают сумму.
Workflow: `07_workflows/delivery-usage-accounting.md`. UI reader v2 относится к 1.2.

Дополнить имеющиеся account records. Разделить parent Task Chat, build executor,
Trials и прочие phases, сохранить thread/turn/run binding приватно. Total Goal
usage и token updates не суммировать дважды. Unknown/missing usage хранить
отдельно; waived turn не выдавать за нулевой расход.

Фактический usage выше cap — допустимое наблюдение, требующее остановки,
а не повод отвергнуть запись. Migration ledger сохраняет старые locks/readers;
старый ноль нельзя автоматически объявить измеренным.
Готовность: overshoot, interrupted/failed turn, usage unavailable, reconnect
и repeated event сохраняются один раз; текущий run остаётся читаемым и не
может тратить новый бюджет без оснований.

### 1.6 Калибровка бюджета — S после измеримых повторов

Не повышать default автоматически. В текущем ledger legacy default уже
1000000 токенов, а 250000 пилота — выбранный пользователем cap.
Показывать источник оценки, тип/сложность задачи, модель, reasoning effort,
версии, N и диапазон; до данных — честная некалиброванная оценка.
Готовность: есть сопоставимые измеренные повторы; изменённый default имеет
обоснование и отдельный review. Четыре разнородных пилота недостаточны для
универсальной медианы и цели «меньше 20% упираются в лимит».

### 1.7 Проверить B7 по слоям — M

Текущий результат: host gates — implemented с fixture evidence; persisted Goal
lifecycle — runtime-verified без модели; mid-turn enforcement —
runtime-unverified. Reservations и контроль разрешённых host jobs остаются
в 1.1/1.4. B7 целиком не объявляется fixed.

Различить host iteration/time limits, Goal projection, preflight и mid-turn
поведение. Счётчики в prompt сами по себе не дефект, если host контролирует их.
Готовность: protocol test выбранной версии описывает overshoot/interruption,
восстановление evidence и условия продолжения. Статусы: implemented,
runtime-verified либо unresolved; accepted risk оформляется явно и не называется
fixed. Не редактировать отсутствующий remediation plan.

## 6. Фаза 2 — Readiness по применимости и evidence

### 2.1 Тип агента с совместимостью старых контрактов — M, после 3.1

`agent_kind`: service, one-shot-cli, job-runner, tool-server, library,
interactive-agent. Последний тип нужен для диалогового результата в Codex project.
Это характеристика результата, отдельная от runtime family, interface и
service mode; сама по себе не разрешает запуск процесса/расписания.
Существующие поля сначала картировать; неизвестный legacy тип отображать как
legacy-unclassified без массовой переинтерпретации принятых контрактов.
Готовность: versioned schema, adapter старых документов, roundtrip, unknown
значения и сохранение semantic locks проверены. Обязательность — для новой
версии authored contract, не для всех существующих accepted artifacts.
Локально реализованы contract schema v2, proposal-first выбор и общий adapter;
точные правила — `04_standards/agent-result-type.md`. Production adoption впереди.

### 2.2 Карточка с независимыми состояниями — M/L

Показывать verification/acceptance, runtime liveness и доступность действий
отдельно. CLI: последнее подтверждённое выполнение, N/N Trials и ревизия;
service: process/health; job-runner: последний job и только реально выбранное
расписание. Tool-server/library получают подходящий capabilities view.
Готовность: CLI понятен без URL; legacy «Alive» не выдаётся за проверенный
Outcome. Freshness утрачивается при изменении HEAD/spec. Run… появляется
только при проверенном command contract; произвольный текст Spec не исполняется.

**Локальный результат 2026-09-06:** общий readonly reader CLI/Control Center
проверяет current approval, весь Trial plan, result lock и revision. Canonical
checkout и candidate различаются; acceptance требует собственного host receipt.
Timeout/неполное покрытие дают unknown. Карточка и detail page показывают
результат отдельно от runtime и истории run, шесть типов проверены в browser
fixture на 1280/390 px. GET не запускает Trials/agent commands. Async worker и
FIFO deadline необходимы для этой проверки; общий server refactor остаётся 5.1.
Workflow: `07_workflows/agent-result-readiness.md`. Command probe и type-specific
первое действие остаются в 2.4/3.3; managed adoption впереди.

### 2.3 Manifest обязателен только по выбранным операциям — S/M

Исправить `card-readiness` и `localCardReady`: manifest не универсальная
предпосылка. Обязанности следуют из контракта и operations capability, а не
из одного ярлыка service/job-runner.
Готовность: отсутствие service manifest у one-shot CLI не блокирует
подтверждённый результат; отсутствие выбранного managed runtime остаётся
blocker. Stale/missing evidence не становится ready из-за типа агента.
Локально CLI/UI используют общую operations applicability и bounded manifest
reader. No-managed-operations contract допускает отсутствие manifest; состояние
Outcome проверяется отдельно в 2.2, а не выводится из card configuration readiness.

### 2.4 Безопасная проверка CLI — M

Использовать существующий `healthcheck_argv`; legacy `healthcheck_command`
сейчас является display/planning metadata. Не вводить параллельный wire field
и не выполнять строку через shell. Для one-shot liveness обычно not-applicable.
Готовность: явно запрошенный bounded probe использует approved command,
проверяет cwd, path/symlink boundary, timeout и результат; GET карточки не
исполняет непроверенный agent-controlled код. Exit 0 у --version подтверждает
запускаемость, а не Outcome verification.

### 2.5 Reconcile фактов завершения — M, после 3.1

Сначала read-only plan связывает canonical checkout, exact HEAD/tree,
Outcome/contract/approval, Trial evidence и handoff receipt с исходным run.
Далее идемпотентный apply добавляет события и обновляет read model по
доказанным переходам. Историческое blocked событие сохраняется.
Готовность: свежая прямая verification видна карточке, но отсутствие
acceptance receipt не позволяет выставить accepted/handed-off. Поддельный
Markdown, чужой run/instance, stale lock, dirty tree и повтор reconcile
отвергаются или дают точный pending state. Никакого автоматического merge,
cleanup или acceptance из одного наличия handoff.

**Локальный результат 2026-09-06:** `delivery reconcile` показывает exact plan;
apply с тем же planLock добавляет проверенное событие и replay receipt.
Canonical/candidate revision, current Spec/plan/result и matching handoff
preparation различаются; ни модель, ни Trials, merge/cleanup/acceptance этим
действием не запускаются. Interrupted receipt и более новый прогресс сохраняются.
`delivery verify` также умеет заново проверить изменённую candidate в прежнем
run, сохранив старые Trials и protected-input baseline. Существующая приёмка
не открывается заново. Подробности: `07_workflows/delivery-facts-reconciliation.md`.

### 2.6 Профиль и operations metadata при handoff — S/M

Объединить с 0.5; не делать вторую реализацию. Генерировать manifest только
когда он требуется выбранным operations contract, без изменения service mode
и без догадки о безопасном healthcheck на основе Trials.
Готовность: повторяемый handoff сохраняет authored файлы и HEAD/evidence.
Если изменились executable/locked inputs — требуется новая verification;
«ноль warnings любой ценой» не является критерием готовности.

## 7. Фаза 3 — Идентичность и передача результата

### 3.1 Stable ID и точное сопоставление — реализовано локально

Исправить body-only gate reportRepresentsChildAgent. Определить precedence
agent_id/subject.id и связи contract/outcome/run, квалифицированные экземпляром.
Конфликт ID/path не разрешать молча по substring; legacy attribution выдаёт
диагностику и не подменяет host-approved evidence.
Готовность: frontmatter-only report связан верно; rename, одинаковые имена,
чужой instance, conflicting IDs и неполный metadata не смешивают агентов.
Изменение identity не зависит от agent_kind; исходная зависимость удалена.

Реализация: общий `identity.mjs`, новые authored ID, exact own-instance
catalog, узкий legacy adapter, diagnosis конфликтов и тесты production
selectors. Native Task Chat → delivery binding реализован локально в 1.4;
production adoption и freshness/reconcile остаются отдельными gates.

### 3.2 Миссия из authored контракта/профиля — реализовано локально

Registry — generated projection. Card reader получает миссию из текущего
instance-local authored источника с явным fallback и invalidation кэша.
Готовность: после scaffold миссия появляется без ручного rebuild; неверный
путь и чужая instance память не читаются. Не добавлять частый полный обход
всех Markdown на каждый UI request.

Реализованы bounded parsed cache и отдельное чтение выбранной миссии; новые
артефакты видны без ручного registry rebuild. Host lookup выполняется fresh;
read model не заменяет approval/verification. Детали — стандарт
`04_standards/child-agent-identity.md`.

### 3.3 Handoff по типу результата — M

CLI: argv, входы/выходы, exit codes, пример и revision-bound evidence;
service: manager start/stop, health и выбранный доступ; job-runner: реальные
triggers и журнал; library/tool-server: потребитель и проверка интеграции.
Готовность: «guide подготовлен» не приравнен к verified; пользователь может
выполнить первый сценарий по созданному документу без ручной правки шаблона.

## 8. Фаза 4 — Совместимость scaffold и независимых проверок

### 4.0 Runtime family ↔ scaffold capability — M

Добавлено по проверенному пилоту. До mutation сопоставить accepted runtime
family, interface, operations, generated files и поддержку scaffold.
Предложить совместимый минимальный CLI adapter либо явный unsupported path;
не переписывать принятый contract в codex-native ради прохождения проверки.
Готовность: headless-only контракт получает соответствующий scaffold без
Control Center/service заготовок; unsupported комбинация останавливается
до записи файлов с конкретным следующим действием.

**Локальный результат 2026-09-06:** `scaffold-plan` показывает capability без
записи; actual scaffold проверяет её до создания папок. `cli` и `codex-native`
с CLI-only/no-managed-operations получают headless-cli-v1, выбранные общие
модули и локальный Git baseline. Service/Control Center scripts не создаются.
Unsupported комбинации дают следующий adapter step и сохраняют контракт.
Run entrypoint до реализации возвращает implementation-required; structural
checks не объявляют Outcome готовым. Report отражает реальные файлы/adapter;
неверный двойной relative project_path исправлен. Workflow:
`07_workflows/scaffold-capability-preflight.md`.

### 4.1 Preflight protected verifier inputs — M, после 4.0

Различить ещё не реализованный product target и host-trusted verification
input. Для второго допустим только отдельно проверенный host-owned template
или подготовленный verifier с provenance/hash до lock. Исполнитель build не
создаёт и не меняет собственный критерий успешности.
Готовность: недостающий verifier выявлен до дорогого build; approved template
проверяется на заведомо неверном продукте и не выдаёт false positive.
Если шаблона нет — typed blocker, а не доверенный автоматически созданный stub.
Изменение locked Trial semantics требует новой Spec revision/approval.

### 4.2 Согласовать waiver с текущей моделью — S/M

В коде уже есть `automated_trial_waiver`, влияющий на autonomous verification.
Не вводить рядом несовместимый `waiver_policy` и auto-for-non-critical.
Готовность: waiver виден в плане, сохраняет причину/актор/область действия,
не отменяет обязательный verifier и не позволяет autonomous verified при
невыполненных критериях. Отступление от accepted Outcome — отдельная ревизия.

## 9. Фаза 5 — Runtime и сопровождаемость

### 5.1 Постепенное разделение server.ts — L, после стабилизации затрагиваемой логики

Вынести probe execution, access cache и card projection по ответственности.
Готовность: probes тестируются без Next.js, есть bounded asynchronous I/O,
cache invalidation и прежний API/UX. Количество строк — индикатор сложности,
не повод переписать всё одновременно. Не совмещать большой refactor с 2.2/2.4.

### 5.2 Именованные timeout policies — M

Единые правила для подходящих классов операций и валидируемые bounded
overrides; не два расходящихся MJS/TS источника и не одно число для всех probes.
Готовность: неверные, отрицательные и неограниченные значения отвергаются;
defaults и runtime overrides задокументированы. Regex отсутствия чисел не DoD.

### 5.3 Cleanup и видимость ошибки — S/M

Сопоставить достижимые terminal statuses с auto-cleanup; сохранить recoverable
worktrees. Готовность: failure cleanup отражён в ledger/diagnostics, повтор
идемпотентен, evidence/recovery anchor не теряются, чужой/dirty worktree
не удаляется для исправления статуса.

### 5.4 Redaction research/improve — M

Инвентаризировать writers в `index.mjs`, pattern/external research и конечные
Markdown/JSON boundaries. Разделить private evidence и разрешённую публичную
проекцию. Redaction выполнять до relevant locks; не менять approvals/evidence
постфактум. Готовность: fixtures с host paths и private identifiers покрывают
каждый writer, strict privacy audit проходит. Короткий текущий --strict audit
сам по себе не проверяет все будущие входные строки.

### 5.5 Sensors: точный статус документации — S

Стандарт уже draft. Сначала проверить inventory implementation и пометить
unimplemented/experimental части; sensor harness не строить ради закрытия
документационного пункта. Готовность: shipped claims ссылаются на код/evals,
остальные остаются предложением.

### 5.6 Techscope compatibility — deferred

В текущем цикле оставить `.memory/techscope.sqlite`, state-root memory layout
и TECHSCOPE_* совместимость. Это явно разрешено AGENTS. SQLite rename/symlink
и env migration имеют operational риски без доказанной пользы для пилота.
Возврат к пункту — отдельный запрос/decision с migration и rollback tests;
критерий «ни одного слова techscope в runtime» удалён.

## 10. Фаза 6 — Пилоты и измерения

### 6.1 Ретроспектива первого CLI-пилота — S

Начать до новых fixes: определить measured/reported/unknown, source revision,
versions и причины обходов. Исходные pilot reports и bindings остаются в
instance state-root; в tracked assessment — только проверенная обезличенная
сводка с явно разрешённой областью. Отдельный новый artifact type не нужен:
private agent-post-creation-review плюс общий platform assessment.
Готовность: отдельно отмечены конечный результат и незавершённый run;
отсутствующие токены/время не восстановлены предположениями.

### 6.2 Повтор CLI, затем другие типы — L, по gate готовности

Сначала повторить тот же класс небольшого CLI на main с новой полной
телеметрией, без ручного кода/обходов. Затем отдельные bounded pilots:
service с локальным health, job-runner в ручном режиме, tool-server с
контрактом интеграции. Четыре типа — coverage, не статистическая выборка.
Реальное расписание/сервис включается только при отдельном разрешении.
Готовность: для каждого есть spec, verification, acceptance/handoff evidence,
usage coverage и причины всех interventions. Неподдерживаемый тип сначала
получает adapter; не создавать агента ради заранее назначенной даты.

### 6.3 Эмпирическая промоция — S после повторов

Разделить implementation complete, runtime verified и pilot validated.
Стандарт/default повышается только по evidence конкретного scope, с N,
ограничениями и review; успешный один service не доказывает весь harness.
Готовность: decision содержит проверенную область, альтернативы и regressions,
которые будущая версия обязана ловить.

## 11. Фаза 7 — Публичный путь после main acceptance

### 7.1 Минимальный CLI getting-started — M

Сверить существующие bootstrap profiles. Не изобретать название contract-only,
если такого профиля нет: документировать реальный headless путь после 4.0.
Готовность: clean fixture/checkout проходит от подготовки до работающего
CLI с необходимыми approvals; prerequisites и model/auth явно указаны.
Тридцать минут — будущий измеряемый ориентир, не обещание до такого прогона.

### 7.2 Обезличенная демонстрация — S

Подготовить отдельный синтетический demo-run и материалы для README/marketing.
Готовность: нет private history, endpoints, credentials и идентификаторов
реального пилота; сценарий соответствует реально поддерживаемой версии.
Публикация — отдельное действие, не следствие подготовки записи.

### 7.3 GitHub hygiene и release — S/M

Сначала read-only inventory topics, Discussions, CHANGELOG и releases. Затем
предложить актуальные изменения и задачи, которые всё ещё открыты.
Tagged release следует полному принятому пакету, а не только номеру фазы 2.
Готовность: одобренный публичный пакет, прошедшие guards, dated changelog и
release evidence; push/settings/publication выполняются по отдельной команде.

## 12. Порядок и первые рабочие сессии

| Очередь | Пакет | Условие перехода |
| --- | --- | --- |
| Подготовка — выполнена | Текущий assessment, baseline, self-test, probe и эта редакция | Документы валидны и доступны в памяти main |
| Сессия 1 — выполнена | 0.1 + 0.2 + малый 0.6 | Локальные проверки; затем общий выпуск `68147d8` |
| Сессия 2 — локальный и protocol пакет выполнен | 1.0 + 1.5 + границы 1.7; отдельно 0.3/0.4 при необходимости | 561 tests и live health pass; lifecycle проверен на CLI/App; mid-turn live pilot отдельно |
| Сессия 3 — выпущена на пяти экземплярах | Ядро 1.1, UI/API 1.2, delivery часть 1.4 | 581 tests, native paused controls, browser и post-release strict health pass |
| Completion пакет — локально реализован | Native Goal intent 1.3, shared policy 0.4, strict updater 0.7 | Text/API/browser и release rollback fixtures проходят; реальный rollout предстоит |
| Identity пакет — локально реализован | 3.1 + 3.2, единый Outcome document lock CLI/UI | 34 targeted tests; compatibility прежних карточек; production adoption впереди |
| Локальный пакет 1.4 | Exact task/agent/run binding, host verification и подготовка demo | Shared delivery lease, compiled-plan verification, request replay/recovery; acceptance отдельно; adoption впереди |
| Следующий пакет | Build budget intent 1.3 / полный accounting 1.5, затем readiness 2–3 | Точный scope бюджета; unknown coverage не превращается в нулевой расход; readiness следует типу агента |
| Следующий блок | 3.1 → 2.5; 2.1 → 2.3 → 2.2/2.4; 0.5/2.6/3.2/3.3 | Identity, verification и runtime не смешиваются |
| До повторного пилота | 4.0 → 4.1/4.2; 5.4 и нужные 5.3 fixes | Нет обхода scaffold/verifier/privacy |
| Пилотный блок | 6.1 → повтор CLI → новые типы 6.2 | Факты завершения и telemetry полны |
| После данных/acceptance | 1.6/6.3, выборочные 5.1/5.2/5.5, затем 7 | Есть конкретное основание для каждого расширения |

6.1 начинается уже в подготовке и не зависит от Goal fixes. 3.1 не зависит от
agent_kind. 0.5 и 2.6 — одна работа. 5.6 исключён из критического пути.
5.1 не выполняется одновременно с изменением card/probe semantics.
Критический путь: **совместимый Goal/учёт → контролируемое завершение →
identity/evidence/readiness + scaffold fit → повтор CLI → дальнейшие пилоты**.

Подробный вход следующей сессии, реальные файлы и проверки:
[execution preparation](2026-09-05-pritha-pilot-roadmap-execution-preparation.md).

## 13. Метрики и определение завершения

| Метрика | Как считать | Критерий ближайшего цикла |
| --- | --- | --- |
| End-to-end success | Verified + нужный acceptance + handoff / все начатые eligible runs; blockers и отмены отдельно | Один новый CLI run проходит без обхода; все неуспехи объяснены |
| Autonomous path | Runs без ручного изменения кода/состояния оркестратора и новых tasks ради лимита | Для повторного CLI — 1/1; без экстраполяции на ≥90% |
| Human input | Contract/Outcome/acceptance approvals, уточнения, коррекции и recovery отдельно | 0 лишних recovery-сообщений; обязательные approvals не оптимизировать away |
| Tokens/cost | Native task и executor usage отдельно; measured coverage, unknown, overshoot | Нет пропущенного известного расхода или скрытого превышения |
| Time to handoff | От verified до handoff; active work и ожидание пользователя отдельно | Измерить; ≤10 минут active host work — целевой ориентир |
| Card correctness | Type/operations applicability, evidence freshness, runtime, доступные действия | 0 ложных type blockers и 0 ложных verified/accepted |
| Safety/recovery | Wrong-instance, stale evidence, retry, interrupted usage, cleanup failure | Все профильные regression cases проходят |

Не использовать статистические проценты без знаменателя, единый default по
разным моделям/типам и LOC-лимит как меру качества. Public pilot summaries
не подменяют полные private receipts.

Пакет считается готовым к main review после профильных tests и checks.
UI-пакет дополнительно требует typecheck, staged build, browser scenarios и
strict `/codex`, `/task-chat`, `/agents`, `/settings`, `/voice` + chunks.
Production adoption проходит managed release отдельно; Good State signal
фиксируется по фактическому acceptance, Git/tag baseline — по отдельному
запросу на recovery point. Готовность подготовки не запускает эти действия.
