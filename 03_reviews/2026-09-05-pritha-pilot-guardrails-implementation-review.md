---
id: 2026-09-05-pritha-pilot-guardrails-implementation-review
type: review
status: implemented-local
created: 2026-09-05
updated: 2026-09-05
topics: [pritha, pilot-roadmap, runtime-hardening, publication-guard, good-state-alignment]
tools: [Pritha, Node.js, TypeScript, Next.js, Git, SQLite]
agent_platforms: [Codex, Pritha Control Center]
model_context: [not-applicable]
runtime_environment: [local-mac, cli, control-center]
config_surfaces:
  - interfaces/control-center/src/lib/control-center/server.ts
  - interfaces/control-center/src/lib/control-center/sync-probe.ts
  - scripts/pre-push-audit.mjs
  - scripts/good-state-alignment.mjs
  - tests/
portability: adapter-needed
sources:
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md
  - https://nodejs.org/api/child_process.html
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
    - 07_workflows/control-center-staged-release.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/control-center-runtime-reliability.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: working changes on codex/pilot-guardrails from Pritha 43baa168a41fa54a7c1a46331af0badabe6df1f6; Node.js 24.15.0; Next.js 16.2.11
retrieved: 2026-09-05
verified: 2026-09-05
valid_for: first local implementation packet on the primary Mac mini instance
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

# Review: первый пакет исправлений материнской Pritha

Пункты **0.1, 0.2 и 0.6 реализованы и проверены локально** на основном
экземпляре `main` на Mac mini. Полный self-test: **533/533 tests**, без failures,
skips и регрессий. Изменения находятся в ветке `codex/pilot-guardrails` от
`43baa16`; это рабочий diff, ещё не отдельный commit или опубликованный release.

Control Center собран в `.next-pritha-staging`. Работающий compiled release
сохранил BUILD_ID; он ещё не использует новый probe helper. CLI audit и
Good State helper уже доступны при запуске из этого checkout. Этот отчёт
фиксирует завершение локальной реализации, а deployment и user acceptance
относятся к следующей явно выбранной операции.

## Исправления и доказательства

| Пункт | Изменение | Проверка |
| --- | --- | --- |
| 0.1 | Общий `runSyncProbe` для семи диагностических вызовов: Tailscale status/Serve, SQLite stats, launchd audit/state и screen. Обязательный положительный timeout, `SIGKILL`, argv без shell; существующие интервалы сохранены | Реальный subprocess игнорирует SIGTERM и завершается при timeout 500 ms; независимый внешний deadline защищает сам тест. Проверены ENOENT, nonzero exit, argv/cwd/env, частичный вывод при ошибке и все семь call sites |
| 0.2 | Неизвестная/невалидная merge-base переводит publication check в fail и сохраняет выполнение остальных privacy checks. Audit не делает fetch | Реальные Git fixtures: missing origin/main, unrelated history, shallow clone без общего предка, failed/empty/malformed Git output, допустимый diff, untracked/deleted и изменённые исторические child artifacts |
| 0.6 | Good State Alignment загружает общий runtime env до выбора индекса памяти | Fixtures для `.env`, `.env.local`, явного override, legacy layout и отсутствующего внешнего индекса. Обычный запуск на main находит accepted baseline 2026-08-28 |

Timeout/error в `launchdRootWarnings` и `screenSessionRunning` обрабатывается
до разбора вывода. Частичный JSON с `ok: true` или строка screen после timeout
не превращаются в сообщение об исправности.

Полный publication audit дополнительно обнаружил пять ранее существовавших
абсолютных fixture paths в `tests/control-center-codex-binaries.test.mjs`.
Их заменили на синтетический home в `os.tmpdir()`. Resolver App/CLI и строгость
privacy policy сохранены; четыре существующих binary tests проходят.

Для 0.2 новые regression tests до исправления дали четыре отказа; после
исправления вся publication suite проходит 7/7. Для 0.6 два новых env cases
отказывали до fix; после него проходят все пять. Всего добавлено 15 tests.

## Выбор решения и границы

Официальная документация предупреждает: синхронный вызов продолжает ждать,
если дочерний процесс обработал SIGTERM и не завершился. Поэтому timeout
дополнен SIGKILL для диагностических процессов.
[Node.js: spawnSync](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options).
При проверке страница относилась к Node.js 26.8.1; поведение отдельно
воспроизведено на установленной версии 24.15.0.

Асинхронный перенос оставлен пункту 5.1: нынешний helper блокирует event loop
до завершения или timeout. Он завершает непосредственно запущенную пробу;
изоляция произвольного дерева потомков этим пакетом не доказана. Единственный
оставшийся raw `spawnSync` в `server.ts` выполняет operator service action и
сохраняет отдельную lifecycle policy. Все новые subprocess fixtures изолированы
от реальных сервисов и child projects.

Для неизвестной publication base выбран отказ, поскольку пустой diff нельзя
доказать. Альтернатива с автоматическим fetch добавила бы сетевую операцию в
audit; отдельный offline/full-scan режим остаётся будущим решением при спросе.
Для env использован существующий loader без второй таблицы приоритетов.

Сверка с accepted baseline 2026-08-28 и 2026-07-02 выполнена до edits.
Сохранены manager ownership, изоляция экземпляра, native history без replay,
Voice/music behavior и privacy границы. Архитектурная, security, DX и продуктовая
проверка выполнены в текущей сессии; отдельные агенты не запускались.

## Проверки кандидата и работающего экземпляра

| Проверка | Результат |
| --- | --- |
| Профильные tests: probes, publication, Good State, App/CLI binaries | 21/21 pass |
| TypeScript | `npm --prefix interfaces/control-center run typecheck` — pass |
| Production build кандидата | `PRITHA_CONTROL_CENTER_DIST_DIR=.next-pritha-staging npm --prefix interfaces/control-center run build` — pass |
| Build isolation | Live BUILD_ID сохранён; `next-env.d.ts` и `tsconfig.json` восстановлены после generated edits |
| Full self-test | Pass, 533/533 tests, семь quality checks, ноль регрессий; завершён 2026-09-06T02:07:53.632Z, местная дата 2026-09-05 |
| Strict live health | Pass: health-v2 identity main, `/voice`, `/agents`, `/task-chat`, `/codex`, `/settings`, 13 chunks |
| Strict publication и privacy audits | Pass, 0 failures, 0 warnings; проверены все 14 файлов пакета, включая новые, через temporary Git index; основной index сохранён |
| Markdown validation / whitespace | Pass, 770 документов после добавления review; diff включая новые файлы без whitespace ошибок |
| Обычный Good State CLI | Возвращает accepted baseline 2026-08-28 и 2026-07-02 из памяти main |

Сохранились известные warnings: legacy `launchd-root-drift`, Python 3.9 ниже
рекомендуемой версии 3.10 и нефатальное urllib3/LibreSSL warning. Staged build
также сообщил одно предупреждение Turbopack о широком NFT tracing через
`next.config.mjs`; сборка и проверка типов завершились успешно. Эти предупреждения
не закрываются данным пакетом.

Live health относится к работающему прежнему release. Кандидат проверен
сборкой и unit tests; browser/peer acceptance и managed adoption нового build
ещё не выполнены. Перед release остаются обязательные gates staged-release
workflow, включая адресные desktop/mobile проверки и проверку после adoption.

## Следующий рабочий пакет

Начинать с **1.0 + 1.5 и границ 1.7**: выбрать совместимый lifecycle Goal и
сохранить честный run-wide расход при overshoot, missing usage и interrupted
turn. Подготовка уже воспроизвела отказ ephemeral + Goal; повторять этот же
probe без изменения условий не требуется. Пункты 0.3/0.4 можно выполнить
отдельно; они не становятся условием завершения текущего пакета.

Новые model turns, изменение существующих Goal, rollout других экземпляров,
публикация, services и scheduler в этой сессии не выполнялись.
