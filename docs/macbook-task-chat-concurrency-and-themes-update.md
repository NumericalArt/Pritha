---
id: macbook-task-chat-concurrency-and-themes-update-2026-09-08
type: workflow
status: draft
created: 2026-09-08
updated: 2026-09-08
topics: [macbook, canonical-pritha, task-chat, voice-control, themes, staged-release, rollback]
tools: [Pritha, Codex, Git, Node.js, Next.js]
agent_platforms: [Pritha, Codex]
model_context: [existing-instance-model-selection]
runtime_environment: [local-macbook, managed-control-center]
config_surfaces: [Task Chat, Settings appearance, instance-runtime]
portability: environment-specific
sources:
  - operator-canonical-theme-and-fleet-plan-extension-2026-09-08
  - 07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md
  - docs/update-second-local-macbook.md
  - 07_workflows/control-center-staged-release.md
related:
  workflows:
    - 07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md
    - docs/update-second-local-macbook.md
    - 07_workflows/control-center-staged-release.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/control-center-runtime-reliability.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-08
source_updated: 2026-09-08
source_version: "Canonical concurrency/theme implementation; exact candidate pin and verification in release manifest"
retrieved: 2026-09-08
verified: 2026-09-08
valid_for: "Preparation; executable release handoff requires the verified final release receipt"
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, governance]
subject:
  kind: workflow
  id: macbook-task-chat-concurrency-and-themes-update
privacy: public
retention: durable
review_status: draft
confidence: medium
release_package_status: awaiting-fleet-acceptance
---

# MacBook: подготовка обновления Task Chat, Voice и трёх тем

Инструкция относится к обычной канонической Pritha на MacBook. Использовать после
выполнения [основного плана](../07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md)
и приёмки матери, Даши, Саши и Марины. Это отдельный пакет подготовки;
наличие документа не означает, что обновление уже установлено на MacBook.
ND / NeuralDeep использует собственную инструкцию и не является целью этой процедуры.

## 1. Получить готовый release receipt

Перед выполнением заполнить локальный handoff receipt фактическими значениями:

| Поле | Что требуется |
| --- | --- |
| Проверенный release source | Полный 40-символьный SHA из `NumericalArt/Pritha` |
| Материнский код | Точный concurrency + theme candidate, принятый на Mac Mini |
| Даша / Саша / Марина | Три успешных per-instance release receipts |
| Итоговый remote pin | Полный SHA, с которым разрешён текущий updater MacBook |
| Runtime/schema context | Проверенные Node/CLI версии, migration version и minimum rollback-compatible commit |
| Проверки кандидата | Unit/typecheck/build/browser/theme/concurrency/privacy/self-test results |
| MacBook prerequisites | Verified local checkout, state-root, agent parent, native home, service ownership и свободное место |
| Recovery | Свой previous build и private consistent snapshot; ограничения обратной миграции |

Пока обязательные значения не получены, статус пакета — `awaiting-fleet-acceptance`.
Не подставлять старые commits A/B/C, theme commits ND или случайный latest.
Если после fleet rollout опубликован новый documentation commit, различать
deployed code SHA и новый remote HEAD. Проверить полный diff и выбрать отдельный
проверенный target для MacBook; не объявлять документационный SHA установленной
сборкой на остальных экземплярах.

Текущий updater требует target = `origin/main`. При несовпадении остановить apply
и сверить кандидат. Эта проверка не обходится ради старого pin и не разрешает
незаметно включить более новые функциональные изменения. Полный source SHA
фиксируется в handoff receipt до начала обновления.

## 2. Проверить именно установленную MacBook Pritha

Следовать [базовой инструкции MacBook](update-second-local-macbook.md).
Проверить manager configuration и runtime identity: на устройстве могут быть
старые учебные checkout или dev worktrees. Не выбирать экземпляр по имени папки.

Из подтверждённого checkout, с его собственным окружением:

```sh
git status --short --branch
git rev-parse HEAD
node scripts/good-state-alignment.mjs --scope "Task Chat Voice Control themes" --limit 3
node scripts/control-center-runtime.mjs plan
node scripts/control-center-runtime.mjs status --json
node scripts/pritha-instance.mjs update --plan --expected-commit <full-release-sha> --json
```

Не reset/stash чужую работу и не подменять divergent branch автоматически.
Если нужны переменные путей, брать их из локальной проверенной конфигурации:
`TECHSCOPE_ROOT`, `PRITHA_STATE_ROOT`, `PRITHA_CONTROL_CENTER_ENV_FILE`,
`PRITHA_AGENT_PARENT`. Не копировать runtime.env, credentials, native history,
queues, attachments, Voice links, memory или sibling agents с Mac Mini.

Проверить active/unknown tasks и compatibility миграции. Подготовить отдельную
staging/test сборку с synthetic state. Production `.next` до manager transaction
не изменяется. Full tests, typecheck, build и visual evidence проверяются на
кандидате; ограничения MacBook по RAM/CPU/CLI не наследуются от Mac Mini автоматически.

## 3. Проверить функции и оформление до production

В изолированной сборке итогового pin проверить:

- Direct A + Voice B + новый C; независимые drafts и pending messages;
- фоновые статусы, queue, точный stop A, typed/Voice answer без двойного resume;
- unknown delivery/reload/restart без повторного dispatch, старую историю и links;
- worktree/resource policy и сохранение неприменённого результата;
- Classic/Dark/Light на 1440, 1200, 768, 767, 390, 320 px;
- first frame/SSR, navigation/reload, две вкладки одного origin и blocked storage;
- только старый `pritha-control-center-theme=dark` при отсутствии v2 даёт Classic;
- удаление/ошибка v2 возвращает Classic; Settings mount не перезаписывает выбор;
- Three.js и Canvas fallback, contrast/state/geometry gates основного T1;
- темы нового composer, queue, attachments, operator requests и error/recovery UI.

Theme key — `pritha-control-center-theme-v2`. Classic остаётся default и fallback.
Выбор браузерный, отдельно для каждого origin; изменение темы на Mac Mini не
перекрашивает браузер MacBook. Старый key сохраняется, server settings не меняются.

Synthetic model smoke при необходимости выполняется только в разрешённом тестовом
scope. Не проверять concurrency запуском настоящих пользовательских задач.

## 4. Подготовить recovery и выполнить managed update

После готовности кандидата выбрать безопасную границу: прекратить новые dispatch,
дождаться owned jobs либо согласовать адресную остановку. Unknown не равен idle.
Сделать consistent private backup execution/registry/receipts, Voice metadata,
native history и referenced originals. SQLite backup должен учитывать WAL;
копии одного открытого DB недостаточно. Зафиксировать прежний compiled build.

Непосредственно перед lifecycle transaction требуется отдельное подтверждение
по [staged-release workflow](../07_workflows/control-center-staged-release.md).
Запрос подготовить MacBook и прошлое разрешение выпустить clones не означают
разрешения перезапустить этот экземпляр. После подтверждения:

```sh
node scripts/pritha-instance.mjs update --apply --yes --expected-commit <full-release-sha> --json
```

Использовать текущий проверенный updater. Не запускать production из временной
Codex/terminal session, не делать raw port kill, live build swap и изменения
Tailscale/Telegram/cron. Если source содержит исправление updater, проверить
актуальный supported путь запуска нового updater до apply; не обходить manager.

## 5. Проверить работающий экземпляр и закрыть передачу

Проверить exact compiled commit/BUILD_ID и identity/roots, затем strict health:
`/voice`, `/agents`, `/task-chat`, `/codex`, `/settings` и все referenced JS chunks.
Выполнить own-state self-test и privacy audit; отделить новые failures от
зафиксированных допустимых warnings. HTTP 200 одной health page недостаточно.

Production smoke ограничить чтением и browser-local themes в чистом контексте:
Classic default, сохранение Dark/Light, существующая история без replay.
Не создавать новые production tasks/Voice sessions и не менять рабочие server
settings ради проверки. Реальную доступность с trusted phone/peer подтвердить
отдельно; desktop viewport не подменяет проверку устройства.

При failure остановить прогрессию, сохранить private evidence и откатить через
проверенный manager к compatible build. Не запускать старый writer на новой
schema и не восстанавливать весь старый state поверх новых receipts/работы.
Queue/history/attachments/credentials и неприменённый результат сохраняются.

Итоговый локальный report: target/source/build identities, фактические checks,
isolation, Classic default, допустимые warnings, rollback outcome. До этого
MacBook имеет статус `prepared`, после доказанной установки — `deployed`.
В shared report и GitHub не включать private endpoints, paths, process identifiers,
логи, user messages или credentials. Generated memory пересоздаётся на MacBook
из authored материалов, а не копируется с другой машины.


## Конкретный protocol-1 preflight после подготовки release pin

Дополнительно к указанным выше проверкам:

```sh
node scripts/execution-control.mjs plan
node scripts/execution-control.mjs status
```

Проверить Node.js ≥22.13 (каноническая проверенная среда — 24.15.0), private Unix
socket permissions, SQLite WAL backup и отсутствие shared native bindings с другими
экземплярами. После согласованной установки и strict health именно MacBook:

```sh
node scripts/execution-control.mjs activate --yes --expected-build <MacBook-BUILD_ID> --capacity 3
```

Первый primary/replica startup имеет закрытый допуск; это состояние установки до
активации, а не ошибка API key. Команда проверяет marker протокола, live identity,
страницы и chunks. Старый writer после первого protocol-1 execution claim запрещён.
После последующих restart/update требуется такая же health-bound активация.
[Операционная инструкция](task-chat-concurrency-operations.md) описывает drain,
частный backup, queue cancellation, восстановление и перенос результата worktree.

В переносимый пакет включить этот документ, операционную инструкцию, ND-инструкцию,
ADR, итоговый test/release report, checksum manifest и полный Git pin. Не включать
execution.sqlite, сокеты, runtime.env, native home, credentials, attachments и
частные screenshots. BUILD_ID Mac Mini не заменяет BUILD_ID сборки MacBook.

## Source package текущего кандидата

Кандидат передаётся с Git bundle, source archive и SHA256SUMS; отдельный JSON
manifest содержит точный release commit/tag, commits foundation/workspace/theme,
protocol floor, результаты проверки и фактический статус установки флота.
Если manifest содержит `awaiting-fleet-acceptance`, пакет можно проверить и
подготовить, но production update MacBook ещё не объявляется разрешённым.
В комплект не входят .next, node_modules, native history, auth, private state
или пользовательские папки. На MacBook выполняется собственный build/health.
