---
id: 2026-09-05-pritha-goal-lifecycle-accounting-implementation-review
type: review
status: local-protocol-verified
created: 2026-09-05
updated: 2026-09-05
topics: [agents-mother, goal-budget, delivery-ledger, recovery, runtime-lifecycle]
tools: [Pritha, Codex App Server, Node.js, Git]
agent_platforms: [Codex, Pritha Control Center]
model_context: [no-model-protocol-probes, deterministic-fixtures]
runtime_environment: [local-mac, cli, app-server]
config_surfaces: [scripts/agents-mother/, tests/, PRITHA_STATE_ROOT]
portability: codex-native
sources:
  - scripts/agents-mother/build-executors.mjs
  - scripts/agents-mother/delivery-ledger.mjs
  - scripts/agents-mother/delivery-loop.mjs
  - scripts/agents-mother/execution-backends.mjs
  - scripts/agents-mother/index.mjs
  - https://learn.chatgpt.com/docs/app-server
related:
  decisions:
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
  reviews:
    - 03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md
    - 03_reviews/2026-09-05-pritha-pilot-guardrails-implementation-review.md
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/agent-trajectory-control-and-evidence.md
supersedes: []
superseded_by: []
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: Pritha 43baa16 with local delivery packet; Codex CLI 0.153.0 and App 0.153.4; Node 24.15.0
retrieved: 2026-09-05
verified: 2026-09-05
freshness_status: current
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

# Review: Goal lifecycle и учёт build-попыток

На материнской Pritha `main` реализован локальный пакет 1.0/1.5 и уточнены
границы 1.7. Persisted thread каждой попытки получает Goal с подтверждённым
остатком общего бюджета. Host сохраняет расход завершённых, failed и
interrupted turns; потеря ответа оставляет восстанавливаемый receipt.
Native lifecycle проверен на обеих установленных версиях без model turns.
Полный self-test: **561/561 тест**, семь quality checks и live health проходят.
Mid-turn enforcement остаётся **runtime-unverified**.

Рабочая ветка — `codex/pilot-guardrails`, исходный HEAD — `43baa16`.
Пакет находится в локальном diff вместе с предыдущими 0.1/0.2/0.6; отдельный
commit и deployment не выполнялись. Результаты этой проверки относятся к
рабочему дереву, а не к уже опубликованному commit или работающему UI release.

## Поведение и проверяемые границы

| Поверхность | Результат |
| --- | --- |
| Build executor | Persisted thread на попытку; run/iteration/worktree binding; Goal set и readback до модели; waiver явно отличается от measured usage |
| Durable dispatch | Receipt до `turn/start`, native turn ID после ответа; ошибка записи до отправки исключает model RPC |
| Recovery | Чтение только связанного native thread; проверка cwd и единственного turn; при незавершённом turn — resume/interrupt; повторный `turn/start` отсутствует |
| Завершение | Подтверждённый final usage сохраняется до archive; ошибка cleanup блокирует продолжение; повторное архивирование проверяется через native archived listing |
| Usage | Goal — основной источник; cumulative token update — запасной; источники не складываются; устаревшие/повторные updates не увеличивают расход |
| Ledger | Overshoot сохраняется целиком; неизвестный расход и незавершённый cleanup блокируют модель; malformed counts не превращаются в ноль; overflow и конфликт источников сохраняют blocker |
| Evidence | Resume не переписывает старые Trial results; после попытки нужен новый verifier run; исходный evaluator и Spec/approval locks остаются обязательными |
| CLI/report | Показаны observed build tokens и accounting status; parent Task Chat и Trials явно исключены из этой метрики |

Схема ledger остаётся v2 с `accounting_version: 1`, `usage_scope` и
`unaccounted_attempts`. Receipt executor становится v2; v1 receipts остаются
читаемыми. Старые ledgers без маркера учёта получают `legacy-unknown`, даже
если содержат ноль. Исторические locks и terminal status не переписываются;
новый model dispatch требует разрешённого учёта. Автоматическое признание
старого ledger полностью измеренным в этот пакет не входит.

Recovery исправляет текущий receipt, а ledger сохраняет изменения в истории
состояний. Exactly-once относится к учёту пары thread/turn: повтор одного
receipt может создать ещё одно служебное событие, но не второй расход.
Run-wide reservations и гонка двух одновременно запущенных orchestrators
остаются отдельным пунктом 1.1.

## Что доказал настоящий runtime

Проверка выполнена 2026-09-05 по местной дате на Codex CLI 0.153.0 и App 0.153.4.
Использованы temporary пустые workspaces и только созданные этой проверкой
native threads. Model turns: **0**. Fixture Goal был paused; probe Goal
очищен, материализованные threads архивированы. Raw IDs и runtime paths
не переносятся в authored knowledge; история остаётся в native private storage.

| Проверка | CLI 0.153.0 | App 0.153.4 |
| --- | --- | --- |
| Start persisted, get, set paused, readback, новый connection/resume, сохранённый Goal, clear | 7/7 | 7/7 |
| Обновлённый executor.probe: paused set/readback/clear/archive | Pass | Pass |
| Archived thread доступен через thread/read | Pass | Pass |
| Новый executor восстанавливает unstarted receipt и подтверждает archive | Pass | Pass |

Runtime выявил два отсутствовавших в старых fixtures условия. Сразу после
`thread/start` пустой thread может ещё не иметь rollout; paused Goal
материализует его. Повторный archive уже архивированного thread возвращает
ошибку `no rollout found`, поэтому recovery подтверждает архив через
ограниченный listing по точному cwd и thread ID. Он не делает unarchive.
Только для заведомо неотправленной попытки без rollout допустим unsubscribe
и статус cleanup `not-materialized`.

Управление Goal и семантика сохранённого thread сверены с
[официальной документацией App Server](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal)
и схемами установленных бинарников. Дата обновления страницы не указана;
совместимость привязана к проверенным версиям. Документация сама по себе не
заменяет результаты runtime probe.

## Проверки и оставшиеся ограничения

Профильные suites покрывают overshoot, failed/interrupted turn, отсутствие
usage, waiver без данных, overflow, дубли и stale updates, чужой run/cwd,
потерю dispatch acknowledgement, reconnect, archive acknowledgement и
ошибку checkpoint. Интеграционные fixtures показывают отсутствие повторного
dispatch, сохранение предыдущего Trial evidence, блокировку после recovered
overshoot и сохранение frozen evaluator. Они не вызывают модель.

| Проверка | Результат |
| --- | --- |
| Full self-test | Pass: 561/561 тест, без failures/skips, семь quality checks; 2026-09-06T02:59:30.029Z, местная дата 2026-09-05 |
| Live Control Center | Strict health pass: пять страниц, включая /codex, и 13 JavaScript chunks |
| Markdown | 772 документа проходят validate-memory |
| Privacy/publication | Strict pass, ноль findings/failures/warnings; все 25 файлов текущего diff, включая новые, проверены через temporary Git index; основной index сохранён |
| Memory в успешном self-test | Rebuild и embeddings pass: 772 документа, 7941 chunks, 7725 embeddings; после финальной редакции выполняется обычное обновление индекса |

Первый полный прогон обнаружил неподдерживаемую краткую YAML-форму `subject`
в новом decision; связанные CLI/bootstrap checks тоже завершились ошибкой.
Поля переведены во вложенную форму, затем полный self-test прошёл заново.
Известные warnings остались прежними: launchd-root-drift, рекомендация
Python 3.10+ при установленной 3.9.6 и нефатальное urllib3/LibreSSL warning.
Изменения сервисов для подавления warnings не выполнялись.

SHA-256 проверенного `git diff` пяти изменённых модулей `scripts/agents-mother/`
и четырёх профильных suites:
`98b9cb84c20b3053a57d3be55a32a8ebe77bbf978ce24c323ac430f476d56b85`.
После успешного self-test менялись только authored Markdown.

| Слой 1.7 | Статус |
| --- | --- |
| Host positive remaining budget, unknown/overshoot gates | Implemented, проверено fixtures |
| Persisted Goal projection, readback, reconnect и cleanup | Runtime-verified на двух указанных версиях без модели |
| Mid-turn overshoot/interruption и порядок финальных usage events настоящей модели | Runtime-unverified; нужен отдельный live pilot с выбранным бюджетом |
| Run-wide reservations и оценка минимального следующего шага | Pending 1.1 |
| Завершение разрешённых host jobs после исчерпания Goal | Pending 1.4; новый bypass в этот пакет не добавлен |
| Task Chat budget controls и отображение delivery v2 | Pending 1.2 |

В Control Center найден прежний reader, допускающий только ledger v1;
поддержка v2 и различение unknown usage должны войти в 1.2 с UI tests.
Настоящий расход parent Task Chat и Trials этим пакетом не измеряется.
Production Control Center не перестраивался и не перезапускался; бинарник
по умолчанию не переключался; другие экземпляры и child projects не менялись.

Good State Alignment проверен по релевантным accepted baseline. Архитектурная
оценка поддерживает host ledger и отдельный thread каждой попытки; security
оценка сохраняет native private history, instance boundary и frozen inputs;
DX оценка требует явного unknown и восстановления существующей попытки;
продуктовая оценка ограничивает выводы проверенными слоями.

Следующий пакет: 1.1/1.2/1.4, затем 1.3. Для проверки mid-turn поведения
подготовить отдельный disposable fixture и заранее выбрать размер live
бюджета; текущие protocol checks его не расходуют и не заменяют.
