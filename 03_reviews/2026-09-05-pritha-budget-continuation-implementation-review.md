---
id: 2026-09-05-pritha-budget-continuation-implementation-review
type: review
status: local-verified
created: 2026-09-05
updated: 2026-09-05
topics: [agents-mother, delivery-continuation, goal-budget, host-verification, control-center]
tools: [Pritha, Codex App Server, Node.js, Next.js, Playwright, Git]
agent_platforms: [Codex, Pritha Control Center]
model_context: [no-model-protocol-probes, deterministic-fixtures]
runtime_environment: [local-mac, cli, app-server, browser]
config_surfaces: [scripts/agents-mother/, interfaces/control-center/src/, tests/, PRITHA_STATE_ROOT]
portability: codex-native
sources:
  - scripts/agents-mother/delivery-ledger.mjs
  - scripts/agents-mother/delivery-loop.mjs
  - scripts/agents-mother/index.mjs
  - interfaces/control-center/src/lib/codex-chat/goal-control.ts
  - interfaces/control-center/src/lib/codex-chat/gateway.ts
  - interfaces/control-center/src/lib/control-center/delivery-state.ts
  - interfaces/control-center/src/components/codex/GoalBudgetPanel.tsx
  - tests/control-center-goal-control.test.mjs
  - interfaces/control-center/tests/goal-budget-panel-browser.mjs
related:
  decisions:
    - 05_decisions/2026-09-05-delivery-budget-continuation.md
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
  reviews:
    - 03_reviews/2026-09-05-pritha-goal-lifecycle-accounting-implementation-review.md
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
    - 07_workflows/control-center-staged-release.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: Pritha 43baa16 with local continuation packet; CLI 0.153.0; App 0.153.4; Node 24.15.0; Next 16.2.11
retrieved: 2026-09-05
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

# Review: продолжение создания агента после лимита

На материнской Pritha `main` реализовано продолжение того же delivery run
с дополнительным разрешённым бюджетом. Уже готовый результат проходит
согласованные Trials после исчерпания модельного бюджета. Task Chat получил
панель бюджета native Goal, а экран агента — чтение ledger v2 с явным unknown.
Итоговый self-test: **581/581 тест**, семь quality checks и strict live
health проходят; критических регрессий нет.

Рабочая ветка `codex/pilot-guardrails`, исходный HEAD `43baa16`. Изменения
находятся в локальном diff вместе с предыдущими пакетами. Production build
собран в `.next-pritha-staging`; действующий `.next` и службы не заменялись.

## Реализованное поведение

| Поверхность | Проверяемый результат |
| --- | --- |
| Delivery budget | Дополнительные токены, итерации и время разрешаются независимо; request ID и значения до/после хранятся в private ledger |
| Same-run resume | Fixture использует 100/100, затем получает ещё 200, завершает с расходом 180/300; run, worktree, Spec/approval/Trial locks сохранены |
| Budget replay | Повтор разрешения не прибавляет сумму дважды; конфликт ID, неправильный actor, stale version и overflow отклоняются |
| Long-lived run/Goal | Более 1000 сохранённых разрешений не запрещают следующее продление и не требуют сброса истории |
| Preflight | Показаны used/cap/reserved/available; неизвестный расход не превращается в доступный остаток; конкурентный controller не запускает второй build |
| Host completion | Completed/failed/interrupted turn с overshoot 120/100 проходит Trials и достигает verified, если результат готов |
| Host-only recovery | Терминальная архивированная попытка с unknown usage может пройти проверку; unknown остаётся видимым. Неясный исход исполнения исключает этот путь |
| Task Chat Goal | Add и set total раздельны; objective/usage сохраняются, приватный intent предшествует RPC, readback и повтор запроса не удваивают добавление |
| Stale budget recovery | Неисполненное продление, ставшее недостаточным, не запрещает новое разрешение; прежний receipt помечается superseded, расход сохраняется |
| Existing task guards | Provider/storage/thread ownership, active turn/approval, voice continuation и archive сохраняют ограничения |
| UI availability | История загружается отдельно от Goal API; старый capability cache получает Goal из актуальной installed schema |
| Delivery reader | v1/v2, overshoot, reserved и incomplete accounting представлены явно на странице агента; метрика ограничена build executor |

## Проверки

| Проверка | Результат |
| --- | --- |
| Delivery/ledger/Goal/Chat | 66/66 focused pass; затем ещё два history regression cases, входящие в итоговый полный профиль |
| Goal API/controller, receipt persistence, request guards, v1/v2 reader | 12/12 pass, включая long-history case |
| Existing history/archive/attachment recovery | Pass после добавления нового модуля в изолированный test loader |
| Native CLI 0.153.0 и App 0.153.4 | Реальный новый controller: add, set total, idempotent repeat, reconnect и прежняя paused цель — pass на обоих |
| Native model turns в protocol probe | 0; fixture Goals cleared, fixture threads archived |
| Browser desktop/mobile | Actual React component и проектные CSS, mocked HTTP; 1280×900 и 390×844 pass, screenshots просмотрены |
| Browser failure cases | Пустой/invalid draft, lost response, тот же request ID, pending после reload, active/read-only, quota без resume; overflow и page errors отсутствуют |
| TypeScript и staged production build | Pass; новый Goal API route входит в candidate |
| Final self-test | Pass, 581/581 tests, 0 failures/skips, семь quality checks; 2026-09-06T04:30:50.537Z (вечер 2026-09-05 по местному времени) |
| Strict live health | Pass, текущий service: пять страниц, включая `/codex`, и 13 JavaScript chunks |
| Privacy / pre-push | Strict pass, временный index покрывает все 42 изменённых/новых файла; реальный index сохранён |
| Markdown | Validate-memory pass, 774 Markdown files |
| Authored memory | Rebuild и local embeddings pass; semantic query о продолжении после лимита первым возвращает новую decision |

Первый полный прогон выявил три ошибки тестового загрузчика: он копировал
gateway в fixture без нового `goal-control` dependency. Загрузчик исправлен;
изолированный history/archive/attachments suite и повторный полный профиль
проходят. Обязательные проверки не исключались.

Сохраняются прежний operational warning `launchd-root-drift`, рекомендация
обновить Python 3.9, нефатальное предупреждение urllib3/LibreSSL и известный
Next NFT tracing warning. Подавление этих предупреждений не входило в пакет;
сервисы не менялись.

## Как продолжать тот же run

Числа ниже — пример синтаксиса. Реальное добавление определяется разрешением
пользователя для конкретного run.

```sh
node scripts/pritha.mjs delivery status <run-id>
node scripts/pritha.mjs delivery budget <run-id> --add-tokens 50000 --request-id budget-change-001 --answered-by user
node scripts/pritha.mjs delivery resume <run-id>
node scripts/pritha.mjs delivery verify <run-id>
```

`budget` изменяет только разрешение; `resume` продолжает тот же run.
Для одного явного действия resume также принимает `--add-tokens`,
`--add-iterations`, `--add-elapsed-ms`, `--request-id`, `--answered-by user`.
Повтор запроса использует прежний ID. Verify не запускает build executor;
одобренные Trial subprocesses сохраняют свои разрешения и ограничения.

## Границы результата и следующий шаг

Пакет закрывает локальное ядро 1.1, UI/API часть 1.2 и delivery часть 1.4.
Прогноз стоимости шага по сопоставимым пилотам пока не выдумывается.
Natural-language budget intent 1.3 и общий Task Chat action для host jobs
с проверенной связью task → delivery run остаются следующими изменениями.
Task Chat Goal panel сейчас не повышает бюджет отдельного delivery run.

Проверен компонент в настоящем браузере с mocked HTTP и API в fixtures;
полный candidate ещё не проходил `/codex` в управляемом service.
Strict live health относится к текущему service, а не к staged candidate.
Managed adoption main, candidate pages/chunks и проверка trusted peer остаются
release gates. Git commit/push, другие Pritha и реальное создание пилотного
агента в этой сессии не выполнялись.

Mid-turn hard cap, возобновление модели native engine после active и гонки
независимых native клиентов требуют отдельного live pilot с выбранным
бюджетом. Отсутствие hard dead end не означает обход permissions, evidence,
acceptance или лимита аккаунта. При необходимости дополнительного контроля
сохраняется путь продолжения с уже накопленным результатом.
