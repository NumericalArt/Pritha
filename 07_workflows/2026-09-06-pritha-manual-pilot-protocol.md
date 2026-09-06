---
id: 2026-09-06-pritha-manual-pilot-protocol
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [pritha, agents-mother, readiness, verification]
tools: [Pritha, Codex, Node.js, Git]
sources:
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-roadmap-completion-tracker.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-06
source_updated: 2026-09-06
source_version: roadmap completion candidate based on 8a26775
retrieved: 2026-09-06
verified: 2026-09-06
valid_for: preparation for manual mother CLI pilots
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: workflow
  id: 2026-09-06-pritha-manual-pilot-protocol
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Следующая сессия: ручное создание CLI на матери

Граница: первый реальный агент создаётся на материнской Pritha Mac mini из
обновлённого main. Пилот ещё не проведён. CLI guide и automated fixture готовы;
никакая synthetic acceptance не приписывается пользователю.

## Первый сценарий

Пользователь задаёт небольшой детерминированный CLI-результат. Pritha предлагает
contract и headless Outcome с реальными examples, exit codes, deliverables и
negative-control verifier. Отдельно согласуются контракт и Outcome; затем
research → scaffold → verifier preflight → delivery → review diff/demo →
canonical promotion → пользовательская acceptance → handoff.

При недостатке tokens/iterations/time продлевается тот же run. Unknown usage
не превращается в zero; сохраняется receipt, выбирается явное продолжение или
host verification. Ни новый run ради лимита, ни ручное изменение locked verifier
не являются штатным путём. Каждое исключение отмечается intervention.

## Приватная телеметрия

Сохранять в собственном state-root агента, не в Git:

| Поле | Источник |
| --- | --- |
| instance/agent/task/run/attempt | Catalog, exact task binding, ledger/receipts |
| Pritha SHA, Codex version, requested/observed model и effort | Release, runtime/executor receipt |
| class/complexity, v1 scope | Accepted contract и approved Outcome |
| parent/build/Trials/other | `delivery usage`; scopes раздельно, unknown сохраняется |
| reserved/used/cap/amendments/overshoot | Ledger и executor receipt |
| start/end/active/user-wait/queued | Реальные timestamps; отсутствующее время unknown |
| product/run/acceptance/canonical revision | Result readiness, Trial result и host acceptance |
| interruptions/recovery/interventions | Events и причина каждого действия оператора |

После каждого пилота — private agent-post-creation-review и обезличенная
platform assessment. Для калибровки нужны одинаковые task class/complexity,
модель/effort/runtime/Pritha version, полнота измерений и единый scope.
Показывать N, min/max и источник; fixtures, reported и unknown исключаются.
Default меняется только по отдельному review, не автоматически.

## Coverage после CLI

- Service: выбранный adapter, локальный health, отдельное разрешение на manager.
- Job-runner: первый запуск вручную; расписание само не включается.
- Tool-server: определённый consumer/transport и реальный вызов инструмента.
- Library / interactive-agent: соответствующий первый authored пример.

Четыре типа не являются статистической выборкой. Unsupported combination
сначала получает adapter; ради даты пилота contract/runtime не подменяется.
Критерий 6.3 — decision по проверенному scope и его ограничениям, без promotion
всего harness по одному успешному примеру.
