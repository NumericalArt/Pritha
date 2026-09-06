---
id: 2026-09-05-pritha-pilot-roadmap-execution-preparation
type: workflow
status: in-progress
created: 2026-09-05
updated: 2026-09-06
topics: [pritha, agents-mother, roadmap, runtime, goal-budget, execution-preparation]
tools: [Pritha, Codex, Node.js, Git, Next.js]
agent_platforms: [Codex, Pritha Control Center]
model_context: [runtime-dependent]
runtime_environment: [local-mac, cli, control-center]
config_surfaces: [scripts/, tests/, interfaces/control-center/src/lib/, PRITHA_STATE_ROOT]
portability: adapter-needed
sources:
  - 03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
related:
  reviews:
    - 03_reviews/2026-09-05-pritha-budget-continuation-fleet-release-review.md
    - 03_reviews/2026-09-05-pritha-pilot-guardrails-implementation-review.md
    - 03_reviews/2026-09-05-pritha-goal-lifecycle-accounting-implementation-review.md
    - 03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md
  decisions:
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
    - 05_decisions/2026-09-05-delivery-budget-continuation.md
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/control-center-staged-release.md
  reports:
    - 11_agents/reports/2026-08-28-pritha-good-state-baseline-reliable-codex-control-center.md
    - 11_agents/reports/2026-09-05-pritha-integrated-fleet-release-report.md
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-06
source_version: preparation v9; full completion work from cf11419 in codex/roadmap-completion
retrieved: 2026-09-05
verified: 2026-09-06
valid_for: first implementation sessions on the primary Mac mini instance
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

# Execution preparation: первые сессии на материнской Pritha

Подготовка завершена; первая локальная реализация пунктов 0.1/0.2/0.6
также выполнена. Результат: 533/533 tests, typecheck, staged build и strict
live health проходят. Подробности и граница runtime adoption находятся в
[review первого пакета](../03_reviews/2026-09-05-pritha-pilot-guardrails-implementation-review.md).
Второй локальный пакет 1.0/1.5 также реализован, lifecycle проверен protocol
пробами без модели; полный self-test проходит 561/561 тест, live health pass.
Результат и границы 1.7 находятся в
[review Goal и учёта](../03_reviews/2026-09-05-pritha-goal-lifecycle-accounting-implementation-review.md).
Третий локальный candidate добавляет budget amendments в том же delivery run,
host verification и панель native Goal в Task Chat. Его результаты и
оставшиеся шаги находятся в
[review продолжения](../03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md).
Итоговый self-test текущего кода проходит 581/581 тест; typecheck, staged
build, browser component scenarios и strict live health также проходят.
По следующей команде пользователя пакет `68147d8` включён в `main`, опубликован
и установлен на пяти канонических экземплярах. Итоговые проверки, rollback
Marina и latency warnings MacBook записаны в
[release report](../03_reviews/2026-09-05-pritha-budget-continuation-fleet-release-review.md).
Полный оставшийся объём теперь ведётся в
[completion tracker](2026-09-05-pritha-roadmap-completion-tracker.md).
В ветке `codex/roadmap-completion` реализованы native Goal intent 1.3,
общая publication policy 0.4 и обязательный page/chunk/build-identity gate 0.7
с ограниченными timeout policies для выпуска. Browser desktop/mobile,
профильные tests, typecheck и staged build проходят; managed adoption этого
кандидата ещё не выполнен. Task/agent/run binding и build budget intent 1.3/1.4
теперь реализованы локально: add/set total, дополнительные итерации/время,
private replay receipts и explicit continuation того же run. Профильные проверки
54/54 и полный self-test 637/637 проходят; actual page проверена на desktop/mobile.
Следующий вход: полный accounting 1.5, затем readiness/scaffold и остальные требования
полного roadmap. Общая цель не закрывается по результатам этого пакета.

## 1. Граница экземпляра

Цель первых сессий — существующий основной экземпляр `main`, роль `primary`,
на Mac mini. До начала edits подтвердить code-root, внешний state-root и
agent parent через штатный resolver. Конкретные пути, служебные process IDs,
адреса и native thread bindings оставлять в private state.

Разработку выполнять в reviewable ветке `codex/…` от заново проверенной
актуальной точки, учитывая пользовательские изменения. Не смешивать
development checkout с активным compiled release directory. Рабочие данные
материнского экземпляра остаются его собственными; остальные экземпляры
не участвуют в первых сессиях. Новые локальные тесты используют temporary
fixtures, а не изменяют реальные child projects ради воспроизведения.

После fix 0.6 Good State Alignment сам загружает runtime env. Обычная сверка:

```sh
node scripts/good-state-alignment.mjs --scope "agents mother outcome Task Chat goal readiness runtime" --limit 3
```

Расширенный вариант ниже дополнительно подтверждает identity основного
экземпляра перед работой; он также применим к checkout до fix 0.6:

```sh
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import { loadPrithaRuntimeEnv } from './scripts/lib/env.mjs';
import { prithaInstanceConfig } from './scripts/lib/paths.mjs';
loadPrithaRuntimeEnv({ root: process.cwd() });
const instance = prithaInstanceConfig();
if (instance.codeRoot !== process.cwd() || instance.instanceId !== 'main' || instance.instanceRole !== 'primary') {
  throw new Error('Expected the primary main instance; resolve the intended checkout first.');
}
execFileSync(process.execPath, [
  'scripts/good-state-alignment.mjs',
  '--scope', 'agents mother outcome Task Chat goal readiness runtime',
  '--limit', '3'
], { stdio: 'inherit' });
NODE
```

Это read-only сверка. Fix 0.6 использует единый loader и покрыт пятью
regression tests на выбор configured, explicit и legacy state-root.

## 2. Сессия 1: два воспроизводимых guardrail fixes

Статус: локальная реализация завершена 2026-09-05 вместе с малым пунктом
0.6. Ниже сохранены воспроизведение и критерии проверки; повторять edits
не нужно. Working branch: `codex/pilot-guardrails`. Adoption staged candidate
и release остаются отдельной операцией.

### Пакет 0.2 — неизвестная база публикации

Файлы: `scripts/pre-push-audit.mjs`,
`tests/pritha-publication-guards.test.mjs`.
Точка дефекта: publicationBase → changedAgentArtifacts, empty base → `[]`.

Сначала в temporary Git fixture воспроизвести отсутствие origin/main,
unrelated/shallow history и отказ Git. Изменение должно завершать audit
понятным nonzero status. Никакого implicit network fetch или принятия
неполного diff. Сохранить положительный сценарий и запрет на новые private
child-agent artifacts, включая untracked/deleted paths.

```sh
node --test tests/pritha-publication-guards.test.mjs
```

### Пакет 0.1 — ограниченное завершение probes

Файлы: `interfaces/control-center/src/lib/control-center/server.ts`,
минимальный выделенный helper при необходимости, новый
`tests/control-center-probes.test.mjs` (добавлен в первом пакете).

Инвентаризировать Tailscale/sqlite/launchctl/screen и остальные sync probes;
не менять mutating actions механической массовой заменой. Проверить
SIGTERM-ignoring child в отдельном тестовом процессе с внешним пределом
времени, чтобы сам regression test не мог повиснуть навсегда.
Жёсткое завершение дополняет timeout; async refactor остаётся отдельным шагом.

После реализации нового теста:

```sh
node --test tests/control-center-probes.test.mjs tests/control-center-health.test.mjs
node scripts/self-test.mjs --json
git diff --check
```

Self-test запускать один раз последовательно, после профильных проверок.
Не запускать одновременно production build и live health: релизный отчёт
фиксирует transient timeout под конкурирующей локальной нагрузкой.
Изменение TS backend требует typecheck и build в staged candidate. Проверка
живого старого release не доказывает корректность ещё не принятого candidate.

Условие завершения сессии: оба дефекта исправлены и доказаны тестами, есть
понятный diff и результат проверок. Если пакет разрастается, завершить один
полный fix и явно перенести другой; не маскировать незавершённость общим pass.
Пакеты 0.3/0.4 не являются обязательной нагрузкой этой сессии.

## 3. Сессия 2: Goal lifecycle и учёт расхода

Локальный и protocol пакет выполнен. Выбран persisted thread на попытку,
native receipt recovery без повторного dispatch и отдельный host ledger.
CLI 0.153.0 и App 0.153.4 подтвердили paused Goal/readback/reconnect,
материализацию rollout и recovery архивированного thread. Build accounting
отличает measured от unknown; overshoot не теряется. Полные условия — в
[decision](../05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md).
Ниже сохранены исходные критерии сессии для повторной проверки при изменении
runtime; настоящий mid-turn pilot остаётся отдельной проверкой с бюджетом.

В подготовке уже выполнено: схемы Goal get/set/clear получены от CLI 0.153.0
и App 0.153.4, real probe на ephemeral thread отказал в обоих случаях.
Повторять это лишь при изменении версии/конфигурации или для нового test.

Поверхности:

- `scripts/agents-mother/execution-backends.mjs` — binary choice, connection;
- `scripts/agents-mother/build-executors.mjs` — thread lifetime, Goal, usage;
- `scripts/agents-mother/delivery-loop.mjs` — preflight и учёт turn;
- `scripts/agents-mother/delivery-ledger.mjs` — schema, cap, фактический расход;
- `interfaces/control-center/src/lib/settings/codex-binaries.ts` — другой
  App/CLI resolver, сравнить без неявного глобального переключения.

Короткий decision record должен выбрать lifetime и privacy/cleanup policy
для run-bound thread; решить, как actual usage выше cap и unknown usage
сохраняются без нарушения старых locks. Goal control plane не получает право
редактировать accepted contract или Outcome автоматически.

Профильные существующие suites:

```sh
node --test tests/agents-mother-build-executors.test.mjs tests/agents-mother-execution-backends.test.mjs tests/agents-mother-delivery-loop.test.mjs tests/agents-mother-delivery-ledger.test.mjs
```

Добавить cases: unsupported ephemeral, selected lifetime, missing Goal,
overshoot, interrupted/failed turn, duplicated usage event, unavailable usage,
waived turn, reconnect. FakeConnection, который всегда возвращает Goal для
любого thread, недостаточен как единственное evidence.
Бюджетный live model turn необходим для утверждения о mid-turn поведении,
но не для schema/capability inspection. Его запуск и размер задаются явно
в рамках той будущей проверки; в этой подготовке он не запускался.

Условие перехода: не просто «RPC существует», а поддерживаемый lifecycle,
честные расходы и понятный fail-closed путь при недоступном enforcement.

## 4. Сессия 3: завершение в той же задаче

Локальное ядро 1.1, UI/API 1.2 и delivery часть 1.4 реализованы. Reader
Control Center теперь читает v1/v2 и показывает область расхода, включая
unknown. Новый model dispatch отдельно проверяет разрешённый остаток.
Далее 1.3 и task/run binding: использовать реальные task bindings/API guards;
не выводить run ID из похожего заголовка или имени агента.
Основные поверхности:

- `interfaces/control-center/src/lib/codex-chat/app-server.ts`;
- `interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts`;
- `interfaces/control-center/src/components/settings/LimitsSettingsSection.tsx`;
- `interfaces/control-center/src/app/api/settings/limits/route.ts`;
- Task Chat components/API, найденные по актуальному дереву следующей сессии;
- `scripts/agents-mother/index.mjs` для существующих host command entrypoints.

При budgetLimited пользователь видит объект бюджета, остаток и действие
продолжения. Host-owned завершение уже разрешённого шага не должно требовать
нового model turn; отсутствие Goal не даёт дополнительных прав.

Выполнены same-run budget extension, host verification, idempotent Goal
update/readback и сохранение numeric drafts. Native protocol probes на CLI
0.153.0/App 0.153.4 прошли без модели; React component проверен в браузере
1280×900 и 390×844 с mocked HTTP. Candidate собран отдельно от live `.next`.
Работа с лимитами сохраняет путь полного завершения агента; дополнительные
токены, итерации и время не разрешаются друг за друга автоматически.

Проверить: old history, reconnect, archive/restore, attachments, numeric drafts,
неверный instance/thread, повтор сообщения, неоднозначный бюджет и readback
после изменения. Из существующих suites релевантны codex-chat,
codex-continuation, chat-evolution, settings-numbers и api-guard; дополнительные
tests должны проверять новые состояния, а не только структуру UI.

Проверка локального UI candidate: staged build/typecheck, desktop/mobile
component scenarios и API fixtures. Финальная проверка service candidate
включает strict pages/chunks и полный `/codex` после managed adoption.
Deployment main требует отдельной команды по staged-release workflow;
production не запускается из временной Codex-сессии. Live health до adoption
не следует выдавать за проверку нового candidate.

## 5. Что подготовлено для следующих пакетов

Identity до profiles: исправить reportRepresentsChildAgent и неоднозначное
matching. Не добавлять agent_kind в принятые документы без совместимой
схемы. Reconcile сначала read-only plan; исторический blocked run не
перекрашивается в accepted по наличию Markdown handoff.

Scaffold fit и доверенные verifiers идут до нового CLI-пилота. Родительский
runtime family и тип результата не смешиваются. Новые пилоты имеют private
reports и measured telemetry; существующий частный CLI не переписывается
автоматически для проверки карточки.

## 6. Результаты подготовки и готовность

Ниже сохранён исходный снимок подготовки до реализации. Актуальные результаты
первого пакета (533 tests) находятся в связанном implementation review.

| Проверка | Результат |
| --- | --- |
| Primary identity / hardware / state-root | Подтверждены main, primary, Mac mini и внешний state-root |
| Source snapshot | `43baa16`; до подготовки рабочее дерево чистое |
| Good State Alignment | Aligned; accepted baseline 2026-08-28 и 2026-07-02 |
| Full self-test до документов | Pass, 518 tests, 0 failures/skips, все quality gates |
| Live Control Center | Pass, 5 страниц и 13 JavaScript chunks |
| Schema / capability | Goal RPC есть; ephemeral Goal отказ воспроизведён на 0.153.0/0.153.4 |
| Pilot/card evidence | Финальные сохранённые Trials 5/5; исходный ledger и текущая readiness blocked |
| Новые Markdown / privacy / links | Pass: 767 Markdown, strict privacy audit, ссылки и whitespace; все 35 исходных IDs отражены в roadmap |
| Authored memory | Rebuild pass: 767 документов; embeddings восстановлены; semantic query возвращает новый assessment и execution preparation первыми двумя результатами |

Известные warnings: launchd-root-drift, Python 3.9 ниже рекомендуемой версии,
нефатальное urllib3/LibreSSL warning. Сервисы не менялись для их подавления.

Финальная проверка документационного пакета: validate-memory, privacy-audit
--strict, diff whitespace; затем rebuild-memory, embed-memory и поиск нового
roadmap в памяти основного экземпляра. Полный self-test не требуется повторять
ради одних Markdown после уже прошедшей проверки исполняемого кода.

Решения о lifecycle и продолжении записаны. Reservations/lease и native Goal
controls реализованы локально; открыты live mid-turn verification, текстовый
budget intent и связанный с task/run host action.
Git commit/tag, публикация, rollout, изменение старых Goal, запуск новых
пилотов и включение scheduler в подготовку не входят.


## Identity foundation перед следующей сессией

3.1/3.2 реализованы локально: CLI и Control Center используют один каталог
с собственным state-root и постоянными ID. Новые Outcome/scaffold и delivery reports
наследуют ID; формат immutable Trial plan v1 сохранён; legacy metadata сопровождаются диагностикой. Сверка с текущей
mother не требует изменения accepted contracts или approval history.
Найденный конфликт document-lock алгоритмов CLI и UI устранён общим модулем
с сохранением canonical v1. Task Chat/run binding и host control 1.4 также
реализованы локально: exact native ownership, полный approved plan, request
replay/recovery и reviewable demo без изменения Goal/acceptance. Следующий
вход — build intent 1.3, полный accounting 1.5, затем независимые readiness и
handoff по типу результата. Финальный main/push,
managed rollout и синхронизация ND выполняются после завершения полного пакета.
