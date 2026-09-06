---
id: 2026-09-05-pritha-roadmap-completion-tracker
type: workflow
status: in-progress
created: 2026-09-05
updated: 2026-09-05
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
source_version: cf11419 plus codex/roadmap-completion work
verified: 2026-09-05
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Завершение roadmap: требования и доказательства

Объём поручения сохраняется целиком: реализовать оставшиеся необходимые
изменения mother roadmap, подготовить все канонические Pritha, расширить
специализированный план ND и опубликовать итог в GitHub. После подготовки
пользователь начинает ручное тестирование создания агентов на материнской
Pritha Mac mini. Готовность одного пакета не означает завершения этой работы.

Исходная точка — чистый `main`/`origin/main` на `cf11419`. Изменения ведутся в
`codex/roadmap-completion`. Good State Alignment: compatible с accepted
Control Center baseline 2026-08-28 и voice baseline 2026-07-02. Native history,
instance isolation, verified managed shutdown и separate acceptance сохраняются.

## Матрица полного объёма

Статус «реализовано локально» требует отдельной проверки production adoption.
Пилотное доказательство, acceptance и калибровка не выводятся из fixtures.
Ни один открытый пункт не считается закрытым из-за отсутствия падений тестов.

| ID | Текущее состояние | Необходимое доказательство завершения |
| --- | --- | --- |
| 0.1, 0.2, 0.6 | Выпущены в предыдущем пакете | Сохраняющиеся regression tests, self-test и релевантные baseline invariants |
| 0.3 | Открыт; после 4.0 | Русский getting-started, реальные CLI help и clean fixture полного пути |
| 0.4 | Реализован локально | Один `scripts/lib/child-agent-artifacts.mjs`, оба consumer, 7 publication tests pass |
| 0.5 / 2.6 | Открыт; после 3.1 | Authored profile/provenance, идемпотентный handoff, manifest только по выбранным operations |
| 0.7 | Реализован локально | 25 release/health/policy tests pass; ещё нужен managed release на реальных экземплярах |
| 1.0 | Предыдущий persisted protocol пакет | Сохранение installed CLI/App lifecycle evidence; модельное поведение отдельно в 1.7 |
| 1.1 | Ядро выпущено; прогноз открыт | Lease/reservations/amendments, известный расход, оценка только по сопоставимым данным |
| 1.2 | Выпущен | Native Goal GET/add/set/readback и desktop/mobile regression, сохранение usage/objective |
| 1.3 | Native task intent реализован локально | Прямой текст → typed Goal action; 34 Goal/Chat tests и actual page browser pass; delivery scope после точного binding 1.4 |
| 1.4 | Delivery verification выпущена; Task Chat binding открыт | Exact task/run/instance связь; approved host verification/handoff без нового модельного turn и без ослабления locks |
| 1.5 | Build ledger выпущен; полный scope открыт | Раздельный parent/build/Trials accounting, coverage/unknown, version-bound receipts и отсутствие double-counting |
| 1.6 | Открыт; нужны измеримые повторы | N, модель/effort/version/task scope, диапазон и отдельное обоснование любого default |
| 1.7 | Host/protocol evidence есть; mid-turn открыт | Bounded model/runtime observation overshoot/interruption/recovery с явным бюджетом |
| 2.1 | Открыт; после 3.1 | Versioned agent_kind, legacy adapter, roundtrip, semantic lock compatibility |
| 2.2 | Открыт | Независимые verification/acceptance, runtime, actions; revision freshness; все типы результата |
| 2.3 | Открыт | Manifest applicability следует operations contract; CLI без service manifest не получает ложный blocker |
| 2.4 | Открыт | Явный approved argv probe, cwd/symlink/timeout, GET не исполняет agent-controlled код |
| 2.5 | Открыт; после 3.1 | Read-only reconcile plan и идемпотентный apply по exact HEAD/spec/approval/Trial/receipt; нет поддельного acceptance |
| 3.1 | Открыт | Instance-qualified stable identity; frontmatter-only, rename, совпадающие имена, чужой instance, ID/path conflict |
| 3.2 | Открыт | Mission из instance-local authored profile/contract, точное invalidation и отсутствие полного обхода на GET |
| 3.3 | Открыт | CLI/service/job/tool/library handoff соответствует реальному первому сценарию и revision evidence |
| 4.0 | Открыт | Runtime/interface/operations capability preflight до mutation; headless scaffold, конкретный adapter для unsupported |
| 4.1 | Открыт | Host-owned verifier provenance/hash до lock; заведомо неверный продукт проваливает Trial |
| 4.2 | Открыт | Один automated_trial_waiver contract, actor/reason/scope, waiver не даёт ложного verified |
| 5.1 | Открыт; отдельный refactor после semantics | Async bounded probes, access cache/card projection, invalidation, прежний API/UX |
| 5.2 | Release policy реализована локально; остальные классы открыты | Общий MJS/TS источник, bounded validated overrides для подходящих классов probes, документация |
| 5.3 | Открыт | Достижимые terminal states, cleanup error diagnostics, идемпотентность, сохранение dirty/foreign/recoverable worktrees |
| 5.4 | Открыт | Inventory каждого research/improve writer, redaction до locks, path/private identifier fixtures и strict audit |
| 5.5 | Открыт | Shipped sensors claims привязаны к коду/evals; proposed части явно помечены |
| 5.6 | Deferred самим roadmap | TECHSCOPE compatibility сохраняется; отдельная миграция не включается без нового решения |
| 6.1 | Открыт | Ретроспектива CLI-пилота: measured/reported/unknown и раздельные product/run результаты |
| 6.2 | Открыт; после implementation gates | Подготовленные автоматические сценарии и private telemetry; ручные pilots/acceptance после готовности mother |
| 6.3 | Открыт; после pilot evidence | Scope-specific decision по наблюдениям; fixtures не подменяют эмпирическое подтверждение |
| 7.1 | Открыт; после 4.0 | Рабочий минимальный CLI guide с prerequisites, auth, approvals и clean fixture |
| 7.2 | Открыт | Отдельная синтетическая демонстрация, без реальных private history/endpoints/identifiers |
| 7.3 | Открыт | GitHub inventory, актуальный changelog/public package, guards, commit/push и release evidence |
| Канонические экземпляры | Предыдущий пакет установлен на пяти | Новый exact commit, self-test, build/page/chunk health, own state/children на mother, Dasha, Sasha, Marina, MacBook |
| ND roadmap | Shared revision 2 расширена; итоговая сверка и ND copy открыты | Полная трассировка всех mother IDs, task/run/attempt evidence contract, provider failure matrix, dependencies и release gates; синхронизация после итоговой mother реализации |

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

Далее: завершить связь Task Chat → delivery run и narrow host actions (1.4),
потом identity (3.1), applicability/readiness/handoff (2–3), scaffold/Trials
(4), необходимые runtime/privacy изменения (5), подготовку pilots и public
path (6–7). После итогового review — опубликованный pinned release и обновление
пяти обычных канонических экземпляров. ND исполняемый код не получает mother
runtime путём общего merge; специализированный план остаётся самостоятельным.
