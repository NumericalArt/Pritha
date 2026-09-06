---
id: 2026-09-05-pritha-roadmap-completion-tracker
type: workflow
status: in-progress
created: 2026-09-05
updated: 2026-09-06
topics: [pritha, agents-mother, roadmap, completion-evidence, neuraldeep, release]
tools: [Pritha, Codex, Node.js, Next.js, Git]
sources:
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
    - 07_workflows/control-center-staged-release.md
  reviews:
    - 03_reviews/2026-09-05-pritha-budget-continuation-fleet-release-review.md
supersedes: []
superseded_by: []
source_version: runtime release 66274b4; pre-pilot preparation
verified: 2026-09-06
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Завершение roadmap: требования и доказательства

Объём поручения сохраняется целиком: реализовать оставшиеся необходимые
изменения mother roadmap, подготовить все канонические Pritha, расширить
специализированный план ND и опубликовать итог в GitHub. После подготовки
пользователь начинает ручное тестирование создания агентов на материнской
Pritha Mac mini. Готовность одного пакета не означает завершения этой работы.

Историческая исходная точка — чистый `main`/`origin/main` на `cf11419`;
разработка велась в `codex/roadmap-completion`, затем вошла в `main`.
Good State Alignment: compatible с accepted
Control Center baseline 2026-08-28 и voice baseline 2026-07-02. Native history,
instance isolation, verified managed shutdown и separate acceptance сохраняются.

## Матрица полного объёма

Реализация подготовительного пакета опубликована в `main` на `66274b4`.
Применение и проверки каждого экземпляра сведены в отдельный итоговый отчёт:
`03_reviews/2026-09-06-pritha-canonical-fleet-readiness-report.md`.
Пилотное доказательство, acceptance и калибровка не выводятся из fixtures.
Ни один открытый пункт не считается закрытым из-за отсутствия падений тестов.

| ID | Текущее состояние | Необходимое доказательство завершения |
| --- | --- | --- |
| 0.1, 0.2, 0.6 | Выпущены в предыдущем пакете | Сохраняющиеся regression tests, self-test и релевантные baseline invariants |
| 0.3 | Реализован: русский guide и clean CLI fixture | Русский getting-started, реальные CLI help и clean fixture полного пути |
| 0.4 | Реализован; применение по release report | Один `scripts/lib/child-agent-artifacts.mjs`, оба consumer, 7 publication tests pass |
| 0.5 / 2.6 | Реализован: private authored profile, идемпотентный handoff, применимые operations | Authored profile/provenance, идемпотентный handoff, manifest только по выбранным operations |
| 0.7 | Реализован и проверен реальными managed release/rollback | Exact build/instance, все пять страниц и JS, ownership перед остановкой; результаты каждого экземпляра в release report |
| 1.0 | Предыдущий persisted protocol пакет | Сохранение installed CLI/App lifecycle evidence; модельное поведение отдельно в 1.7 |
| 1.1 | Preflight выпущен; прогноз после сопоставимых пилотов | Lease/reservations/amendments, известный расход, оценка только по сопоставимым данным |
| 1.2 | Выпущен | Native Goal GET/add/set/readback и desktop/mobile regression, сохранение usage/objective |
| 1.3 | Native и delivery intent реализованы | Exact task/run scope, add/set total, same-ID recovery, отдельный resume; UI также продлевает итерации и время; применение по release report |
| 1.4 | Реализован; применение по release report | Exact task/run/instance; host verification и reviewable demo, whole compiled-plan check, durable replay/recovery; provider pilot отдельно |
| 1.5 | Scoped overview реализован; применение по release report | Parent cumulative snapshots, build receipts и Trial invocation receipts раздельны; unknown/partial и version/identity сохранены; общий total не выдумывается; orphan recovery относится к 5.3 |
| 1.6 | Подготовлен протокол; эмпирическая калибровка после ручных пилотов | N, модель/effort/version/task scope, диапазон и отдельное обоснование любого default |
| 1.7 | Interruption/reconnect наблюдены на CLI 0.153.0; active-Goal mid-turn и overshoot остаются unknown | Bounded model/runtime observation overshoot/interruption/recovery с явным бюджетом |
| 2.1 | Реализован; применение по release report | Contract v2 с явным agent_kind и interactive-agent для диалога; legacy-unclassified/advisory mapping, roundtrip, invalid values и прежние locks |
| 2.2 | Read model, карточки и detail page реализованы; применение по release report | Exact approval/plan/result/revision, отдельные canonical/candidate/acceptance, runtime и actions; browser для шести типов; commands и первый сценарий относятся к 2.4/3.3 |
| 2.3 | Применимость и readiness реализованы; применение по release report | Общий reader/selection для CLI и UI; manifest следует operations contract, CLI без managed runtime не получает ложный blocker; повреждённые metadata остаются диагностикой |
| 2.4 | Реализован: reviewed plan → bounded argv; отдельный private receipt | Явный approved argv probe, cwd/symlink/timeout, GET не исполняет agent-controlled код |
| 2.5 | Реализован; применение по release report | Read-only plan и идемпотентный apply по exact revision/spec/approval/Trial/receipt; fresh host verification прежнего run, история сохраняется; нет поддельного acceptance |
| 3.1 | Реализован; применение по release report | Общий каталог CLI/UI; 34 targeted tests, legacy и current-state compatibility; exact run/Spec/approval projection |
| 3.2 | Реализован; применение по release report | Own authored profile/contract; bounded parsed cache, immediate selected mission read; fresh host lookup; staged build |
| 3.3 | Реализован: шесть типов, authored первый сценарий | CLI/service/job/tool/library handoff соответствует реальному первому сценарию и revision evidence |
| 4.0 | Реализован; применение по release report | Runtime/interface/operations preflight до записи; headless-cli-v1, local Git baseline, отдельный scaffold-only report и конкретный adapter для unsupported; contract не переписывается |
| 4.1 | Реализован: provenance/hash до approval; negative controls проходят | Host-owned verifier provenance/hash до lock; заведомо неверный продукт проваливает Trial |
| 4.2 | Реализован: один structured waiver, отдельная операторская приёмка | Один automated_trial_waiver contract, actor/reason/scope, waiver не даёт ложного verified |
| 5.1 | Реализован: async host diagnostics, bounded cache/invalidation и card identity projection | Async bounded probes, access cache/card projection, invalidation, прежний API/UX |
| 5.2 | Реализован: общий MJS/TS policy source и документация | Общий MJS/TS источник, bounded validated overrides для подходящих классов probes, документация |
| 5.3 | Реализован: durable cleanup receipt, safe retry, dirty/foreign preservation | Достижимые terminal states, cleanup error diagnostics, идемпотентность, сохранение dirty/foreign/recoverable worktrees |
| 5.4 | Реализован: writer inventory, text-leaf redaction до locks, decoded-payload fixtures | Inventory каждого research/improve writer, redaction до locks, path/private identifier fixtures и strict audit |
| 5.5 | Inventory проверен; непоставленные sensors явно proposed | Shipped sensors claims привязаны к коду/evals; proposed части явно помечены |
| 5.6 | Deferred самим roadmap | TECHSCOPE compatibility сохраняется; отдельная миграция не включается без нового решения |
| 6.1 | Обезличенная ретроспектива готова; product и исходный run разделены | Ретроспектива CLI-пилота: measured/reported/unknown и раздельные product/run результаты |
| 6.2 | Подготовлен протокол; реальные ручные пилоты начинаются после готовности mother | Подготовленные автоматические сценарии и private telemetry; ручные pilots/acceptance после готовности mother |
| 6.3 | После измеренных повторов; эмпирических promotion сейчас нет | Scope-specific decision по наблюдениям; fixtures не подменяют эмпирическое подтверждение |
| 7.1 | Реализован: русский CLI guide, реальные команды и clean fixture без overrides | Рабочий минимальный CLI guide с prerequisites, auth, approvals и clean fixture |
| 7.2 | Синтетический demo fixture и публичный текст готовы | Отдельная синтетическая демонстрация, без реальных private history/endpoints/identifiers |
| 7.3 | Код опубликован в main; GitHub Release не создавался | GitHub inventory, актуальный changelog/public package, guards, commit/push и release evidence |
| Канонические экземпляры | 66274b4 установлен на пяти | Exact build/page/chunk health и own state/children на mother, Dasha, Sasha, Marina, MacBook; self-test каждого в release report |
| ND roadmap | Revision 8 готова и сохранена в ND commit 45be624; копии совпадают | Полная трассировка всех mother IDs, task/run/attempt evidence contract, provider failure matrix, dependencies и release gates; реализация ND — следующий отдельный цикл |

## Завершающий пакет подготовки — 2026-09-06

Актуальный обзор: `03_reviews/2026-09-06-pritha-pre-pilot-readiness-review.md`.
Рабочая русская инструкция: `docs/getting-started.ru.md`. Clean fixture проходит
полный путь без research/scaffold overrides, включая отдельную Outcome approval,
независимый verifier, canonical fast-forward и synthetic acceptance/handoff.
Он не объявляется модельным пилотом. Исходный пакет прошёл 701/701 tests;
после исправлений реального запуска набор расширен до 708. Финальные
post-release результаты, BUILD_ID и transactional adoption каждого экземпляра
фиксирует `03_reviews/2026-09-06-pritha-canonical-fleet-readiness-report.md`.

Граница завершения подготовки: пользователь может начать ручное создание
агентов на mother. Прогноз по повторным данным, калибровка 1.6, реальные 6.2
и эмпирическая промоция 6.3 начинаются после этого по
`07_workflows/2026-09-06-pritha-manual-pilot-protocol.md`. Они остаются открытыми
как следующий наблюдательный этап; 5.6 deferred. Active-Goal mid-turn enforcement
не считается доказанным по одному interruption/reconnect observation.

Далее в документе сохранена история локальных пакетов и их тогдашних проверок.
Их старые количества tests не обозначают итоговую версию.

## Текущий пакет и следующий вход

0.7 теперь использует strict checker внутри transaction, фиксирует candidate и
previous BUILD_ID и проверяет rollback теми же page/chunk gates. Readiness
имеет конечный deadline; strict checker — отдельный ограниченный срок и
SIGKILL. Некорректная конфигурация отвергается до fetch/bootstrap/service.

1.3 распознаёт только полную прямую команду. Примеры:

```text
Добавь 100 000 токенов к бюджету этой задачи
Установи бюджет этой задачи до 500 000 токенов и продолжай
Add another 100,000 tokens to this task budget and continue
```

Scope не угадывается по соседним агентам, run или тексту модели. Неполная
команда предлагает уточнение; quotation остаётся разговором. Receipt хранит
typed request и hash текста приватно до RPC. Retry не добавляет бюджет дважды;
перезагрузка показывает текущий Goal и его сохранённое pending действие.
История native задач не подменяется синтетическими turn.

Проверки локального пакета: self-test pass, **595/595 unit tests**, семь
quality checks, typecheck и staged production build pass. Действующий mother
service отдельно проходит strict health: пять страниц и 13 JS chunks. Эта
live проверка относится к ранее установленной сборке; новая UI логика
проверена actual page browser fixture и staged build, managed adoption впереди.
Обнаруженные при подготовке test-loader dependency и неподдержанный inline
YAML object исправлены; итоговый полный self-test выполнен после исправлений.

Actual Task Chat page + проектные CSS проверены в Chromium 1280×900 и 390×900
через intercepted HTTP без сервера/модели: ambiguous command, lost reply,
same-message retry, quote, reload, сохранение предыдущего ответа, отсутствие
горизонтального overflow и JavaScript errors. Это UI evidence, а не реальный
provider pilot. Staged build не заменяет активную `.next`.

Далее: полный accounting (1.5),
applicability/readiness/handoff (2–3), scaffold/Trials
(4), необходимые runtime/privacy изменения (5), подготовку pilots и public
path (6–7). После итогового review — опубликованный pinned release и обновление
пяти обычных канонических экземпляров. ND исполняемый код не получает mother
runtime путём общего merge; специализированный план остаётся самостоятельным.


## Пакет identity catalog v1

3.1 и 3.2 реализованы общей MJS моделью для registry, CLI card-readiness и
Control Center. Новые контракты получают постоянный ID; Outcome Spec, scaffold
и delivery report сохраняют его. Immutable Trial plan v1 не меняет формат;
run использует существующий exact contract/Spec/approval binding. Existing accepted Markdown, approval audit, run
history и private registry не переписаны. Body-only и substring matching
удалены. Legacy adapter ограничен точным project/alias и известным старым
memory prefix; он не выдаёт approval.

Card projection проверяет current contract fingerprint, Outcome ID, оба locks
и approval receipt вместе с точным project path. Найдено и устранено различие
CLI/UI document-lock algorithm: теперь один `outcome-lock.mjs` сохраняет
канонический v1 алгоритм, включая mutable `superseded_by` и nested block.
Сам по себе этот пакет не доказывает HEAD/Trial freshness, acceptance или
Task Chat binding. Binding закрыт локально следующим пакетом 1.4;
HEAD/Trial freshness и acceptance в карточках ещё остаются открытыми.

Синтетические проверки проходят через реальное создание и approval Outcome
Spec, затем подменяют один binding за раз. Параллельная read-only сверка с
собственным state mother сохранила прежние карточки и выявила дополнительно
один authored проект во вложенном каталоге; foreign instance не сканируется.
Неполные legacy metadata остаются диагностикой. Shared Next imports требуют
code-root для Turbopack; staged build проходит, runtime/private files не попали
в NFT dependency traces. Итоговый self-test pass: **617/617 unit tests**,
семь quality checks и strict live health проходят. Typecheck и финальный
staged production build pass. Live health относится к предыдущему deployed
release; новый runtime не подменялся во время проверки. Повторный CLI fixture
проходит от Outcome approval через delivery до acceptance с новым ID, сохраняя
старую wire shape Trial plan v1. Strict publication audit и обновление памяти
завершают локальный пакет; main/push/fleet adoption остаются следующим выпуском.


## Пакет Task Chat host control v1

1.4 реализован локально: явный binding связывает exact native task, provider,
storage, instance, agent/project/run и полный approved plan. Нет Goal capability
gate; общий task/delivery lease защищает от параллельного исполнения. GET не
запускает команды агента. Сохранённый request даёт same-ID replay без повторных
Trials, а interrupted receipt имеет явный путь сверки и нового действия.

Readonly compiler теперь сравнивает целиком сохранённый Trial plan с текущей
одобренной Outcome Spec. Immutable v1 wire shape сохранён. Перед подготовкой
handoff проверяются revision и Trial evidence; demo виден в панели, acceptance
не устанавливается. Один и тот же подготовленный документ не переписывается
повторным запросом. Бюджеты parent/build/Trials остаются раздельными; здесь
показан подтверждённый build расход и unknown status, а полный scope — в 1.5.

Девять новых интеграционных тестов выполняют реальные CLI/Trial/worktree шаги
на синтетическом проекте и production gateway с запретом model/Goal RPC.
Browser fixture настоящей страницы с CSS проверяет desktop/mobile, lost reply,
replay, reload, сохранение истории и отдельную приёмку. Полный self-test pass: **626/626 unit tests**, семь quality checks и strict
live health проходят. Staged build и typecheck проходят; browser fixture
проверяет также показ demo и replay старого receipt вне краткой истории.
Publication audit и обновление памяти завершают локальный пакет. Live runtime и fleet
пока сохраняют предыдущий deployed release.

## Пакет Task Chat build budget

1.3 завершён локально для native Goal и точной связанной сборки. Общий token cap
и дополнительные токены различаются. Дополнительные iteration/time разрешения
доступны в панели и CLI; завершённые шаги, расход и исходная дата не сбрасываются.
Explicit resume продолжает ту же сборку и может вызвать её approved executor.
Изменение бюджета само по себе не запускает работу; parent Goal не изменяется.

Private task mapping записывается до mutation и повторно используется даже при
новой связанной сборке. Ledger amendment idempotent без новых событий на retry.
Отдельно проверены crash после ledger commit, ранее отправленный resume и более
новый прогресс run: сохранённый запрос не даёт повторного dispatch. UI/form и
text request IDs нельзя повторно использовать для native Goal или model turn.
Conflicting alias receipts не выбирают другую цель; история остаётся доступна.

54 профильных теста и полный self-test **637/637** проходят. Actual Task Chat
page/CSS browser fixture проходит на 1280 и 390 px: шесть HTTP запросов дают три
различных budget actions, parent Goal и native model turns не затронуты. Это
синтетическое evidence, а реальный mid-turn/provider scope остаётся в 1.7.

Первый staged build выявил build-time чтение локальной SQLite во время
пересборки памяти. `AppShell` получает private initial status; root layout теперь
dynamic, чтобы этот status не попадал в prerender artifact и не требовал live
БД при компиляции. Финальный staged build и typecheck проходят; в prerender
manifest нет страниц экземпляра, среди 1198 файлов зависимостей нет private/state
файлов. Build проверен отдельно от memory rebuild. Это точечное исправление;
полный async/cache refactor 5.1 остаётся открытым.
Публикация `main` и managed fleet adoption сохраняются на конец полного объёма.

## Scoped phase usage

Добавлен private `phase-usage-v1` без переписывания Trial plan/result locks.
Parent counter привязан к physical storage/thread и наблюдающему соединению;
snapshot не суммируется по turn/alias, Goal events не прибавляются. Source context
передаётся transport отдельно от входящего payload. Partial history и unknown
attempts остаются явными. Состояние native задачи и её budget не меняются.

Trial invocation receipt появляется до dispatch, затем сохраняет известный
command terminal и неизвестные tokens внутри команды. Build receipt дополнен
runtime/requested model/effort и observed model/provider. Панель и CLI дают один
обзор; общий total остаётся неопределённым для несопоставимых scopes.
Полный self-test проходит: **646/646** тестов и семь quality checks. После
уточнения exact Trial plan binding повторно проходят 27 профильных тестов.
Staged production build и typecheck проходят; prerender не содержит private
страниц, 1198 traced dependencies не содержат state/private файлов. Actual
Task Chat page/CSS проверены в Chromium на 1280 и 390 px, без model/Goal RPC.
Strict live health относится к предыдущему deployed release. Publication audit
и пересборка памяти завершают локальный пакет; main/push/fleet ещё впереди.
Подробности и границы: `07_workflows/delivery-usage-accounting.md`.

## Тип результата и operations applicability

Новые контракты используют schema v2 и явный `agent_kind`. Помимо пяти
исходных кандидатов добавлен `interactive-agent` для диалогового результата.
Тип не разрешает operations; legacy остаётся неклассифицированным с advisory
предложением. Profile/report не могут заменить тип своего контракта.

CLI `card-readiness` и Control Center читают общую применимость operations.
Accepted no-managed-operations contract допускает отсутствие service manifest;
неизвестные/selected операции и unsafe существующий manifest остаются видимой
диагностикой. Готовность относится только к конфигурации карточки. Revision-bound
Outcome/acceptance, type-specific controls и handoff — отдельные 2.2/2.4/2.5/3.3.

Профильные проверки проходят: шесть типов, реальный interview, отдельная Outcome
approval, сохранение v1 fingerprint и wire shape, type revision invalidation,
CLI без manifest, selected operations, symlink/corrupt file и production adapter.
Полный self-test проходит: **656/656** тестов и семь quality checks; staged build
и финальный typecheck проходят. Private страницы отсутствуют в prerender,
1198 traced dependencies не содержат state/private файлов. Existing strict
live health проходит на прежнем release; старое предупреждение launchd-root-drift
сохраняется отдельно от результата тестов. Первая проверка выявила два
недостающих служебных поля нового стандарта; финальная проверка выполнена
после их исправления. Main/push и managed adoption ещё впереди.
Подробности: `04_standards/agent-result-type.md`.

## Ревизия, результат и приёмка

2.2 связывает текущие собственные contract/Spec/approval с целым Trial plan,
result lock и canonical revision. Отдельная candidate ветка не считается
внесённой в основной проект. Host acceptance event проверяется по тому же run,
Spec и result; Markdown status не даёт права показать accepted. Cleanup
candidate не стирает подтверждённый результат canonical project. При changed
HEAD/files видно stale; при неполном или недоступном revision — unknown.

Reader использует отдельный worker, FIFO с четырьмя местами и общий конечный
deadline включая очередь. GET не запускает agent commands и не исправляет
ledger. Git fsmonitor/textconv отключены, неполный snapshot отвергается.
Это необходимая граница новой проверки, общий async/cache refactor 5.1
остаётся самостоятельным. Policies описаны в
`07_workflows/agent-result-readiness.md`.

39 профильных тестов и полный self-test **667/667** проходят, все семь quality
checks — pass. Staged production build и typecheck проходят; prerender содержит
только global error, 1199 traced dependencies не включают private/state файлы.
Browser actual AgentCard/CSS проверяет шесть типов результата на 1280/390 px,
отдельную приёмку, состояние процесса, stale candidate, unknown и сохранение
действий. Проверена также читаемая ширина мобильных details. Это synthetic UI
и host evidence, без build model и без ручного acceptance pilot.

Strict live health относится к предыдущему deployed release; прежний warning
launchd-root-drift остаётся отдельным операционным пунктом. Main/push/fleet ещё
не выполнялись. При подготовке теста выявлен конкретный вход 2.5:
повторный `delivery verify` изменённой candidate может сначала отклонить старое
Trial evidence. Нужен явный fresh verification/reconcile путь с сохранением
истории и verifier guards, а не автоматическое исправление при GET. Он реализован
следующим локальным пакетом; описание — `07_workflows/delivery-facts-reconciliation.md`.

## Fresh verification и сверка фактов

Явная verification повторно проверяет candidate в том же run даже после
предыдущего verified/awaiting_acceptance или stale evidence. Старые result
files и protected inputs не переписываются; принятый run не открывается заново.
Если причина текущей блокировки изменилась, новое событие содержит актуальную
диагностику и сохраняет предыдущую историю. Task Chat использует ту же
доступность host verification без Goal capability или build turn.

CLI `delivery reconcile` даёт read-only plan с exact instance/agent/run,
canonical/candidate revision, Spec/approval/Trial binding и handoff preparation.
Apply перечитывает план под execution lease; добавляет host event/receipt и
освобождает только собственный claim завершённого run. Receipt replay и recovery
не создают повторных событий и не перезаписывают более новый progress/claim.
Ни отсутствие acceptance, ни один handoff report не дают права выставить accepted.

49 профильных verification/Task Chat тестов проходят. Семь reconcile tests
проверяют также публичный CLI от plan до apply/replay; первая CLI проверка
выявила неверное место dispatch, оно исправлено до итоговых проверок.
Staged production build и финальный typecheck проходят; private/state файлы
отсутствуют в 1199 dependency traces, prerender содержит только global error.
Полный self-test после исправлений проходит **675/675**, все семь quality checks
— pass. Старый warning launchd-root-drift сохранён. Managed runtime и fleet
остаются на предыдущем release до завершения полного объёма.

Следующий вход: protected verifier 4.1 и waiver 4.2, approved command probe 2.4,
затем authored handoff/profile 0.5/2.6/3.3.


## Scaffold capability и минимальный CLI

4.0 реализован: preflight до записи, headless CLI adapter, выбранные общие
модули, локальный Git baseline и scaffold-only report. Runtime и accepted
contract сохранены. Составные интерфейсы CLI + Web/Telegram/API не теряют
вторую поверхность при выборе adapter. Unsupported возвращает конкретный
следующий шаг до создания project/report.

Полный self-test проходит **679/679**, все семь quality checks — pass. После
уточнения разбора составных интерфейсов повторены 23 профильные проверки
scaffold и прежних snapshots. CLI run до реализации возвращает exit 78;
structural checks не подменяют продуктовые Trials. End-to-end adapter fixture
использует явно отмеченные research overrides; approved clean path остаётся
в 4.1/7.1. Live runtime не менялся, старый launchd-root-drift сохранён.
