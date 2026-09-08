---
id: task-chat-concurrency-implementation-review-2026-09-08
type: review
status: in-progress
created: 2026-09-08
updated: 2026-09-08
topics: [task-chat, voice-control, concurrency, themes, recovery, canonical-fleet]
tools: [Pritha, Codex App Server, Codex CLI, SQLite, Node.js, Next.js, Playwright, Git]
sources:
  - 07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md
  - 05_decisions/2026-09-08-task-chat-execution-coordination.md
  - docs/task-chat-concurrency-operations.md
related:
  workflows:
    - docs/neuraldeep-task-chat-concurrency-implementation.md
    - docs/macbook-task-chat-concurrency-and-themes-update.md
    - 07_workflows/control-center-staged-release.md
supersedes: []
superseded_by: []
source_version: "Base 774b2d1; implementation commits specified below; Node 24.15.0; Codex 0.153.4"
verified: 2026-09-08
memory_domain: pritha-self
memory_domains: [pritha-self, governance, agent-building-knowledge]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: release-validation
confidence: high
---

# Реализация Task Chat, Voice и трёх тем

Код реализован в отдельной рабочей копии. Production rollout остаётся отдельным
этапом с per-instance receipt; этот отчёт не означает установки на четыре экземпляра.

## Состав кандидата

- Execution foundation: `f8331960fc01149adc83ff088b8dcd5777e5f2ec`.
- Выбор workspace нового чата: `1da4ea1fd8d2af1e1f4c4804d2264769dd919c88`.
- Theme commit: `d604b1dd572ee37ab2b63652fdc22f7c604295e3`; итоговый published pin — в release manifest.

Task Chat хранит независимые drafts и неподтверждённые запросы, поддерживает очередь,
точные steer/Stop/answers и summary SSE с polling fallback. Direct/Voice используют
общие ownership, capacity, workspace и permanent delivery guards. Межпроцессный
канал доставляет управление живому владельцу без disk mailbox для секретных ответов.

Новый чат предлагает `Isolated workspace`, `Read only`, `Configured access`.
`Isolated` сужает настроенный полный доступ до workspace-write в отдельном Git
worktree; если глобальная настройка read-only, она остаётся read-only. Выбор входит
в неизменяемый create payload и tab-local draft state. Существующие треды сохраняют
свои настройки. `Configured access` с полным доступом, legacy threads и Voice с
полным доступом к общим ресурсам продолжают сериализоваться; лимит 3 не отменяет
эти конфликты. Создание агента получает конкретную папку и нужные private roots.

Темы Classic/Dark/Light используют отдельный browser key; Classic — fallback.
Миграции старого `dark` в новую графитовую тему нет. Проверяются first frame,
navigation/reload, два tabs, blocked storage, 2D/WebGL, размеры и контраст.

## Реальные synthetic model smoke на Mac Mini

Использован установленный bundled Codex CLI **0.153.4**, transport App Server,
модель **gpt-5.6-sol / low**. Это ограниченная проверка модели; production settings
**gpt-6-astra / high / danger-full-access** не изменялись. Пять Direct turns и одна
Voice phase запускались в отдельном synthetic source/state/native home, без
инструментов и изменений файлов. Доступ к существующей авторизации оставался
локальным; credentials не входят в отчёт и пакет переноса.

| Одновременные задачи | Состав | Ack Direct / Voice, мс | До завершения группы, мс | Event loop p95 / max, мс | RSS процесса harness, MiB | CPU harness, мс |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Direct | 83 / — | 4735 | 12.05 / 21.30 | 246.0 | 84 |
| 2 | Direct + Direct | 174, 184 / — | 4382 | 12.17 / 17.94 | 249.8 | 130 |
| 3 | Direct + Direct + Voice | 201, 191 / 1026 | 6372 | 12.07 / 19.07 | 256.9 | 154 |

Это по одному короткому sample для каждой нагрузки, с monitor resolution 10 мс.
RSS/CPU относятся к Node harness с TypeScript loader, не к сумме всех Codex children
и не к production Next.js. Данные не являются throughput/SLA аккаунта. Все шесть
ответов проверены; terminal receipts сохранены; оставшихся execution owners — **0**.
Отдельные process/IPC/worktree tests используют реальные временные child processes,
а delayed acknowledgements, очередь и рестарт проверяются детерминированными fixtures.

## Проверки и исправления по результатам

- Полный итоговый unit suite: **821/821 pass**; браузерные проверки: **67/67 pass**.
- TypeScript: pass; focused workspace selection integration: pass.
- Golden checks: pass, включая Markdown integrity, memory rebuild, environment,
  factory inspection, Telegram dry-run/status.
- Итоговый self-test: **pass**, без warnings/regressions в его результате;
  memory и 6892 embeddings пересобраны в изолированном state-root. Python вывел
  существующий LibreSSL compatibility warning; embedding завершился успешно.
- Production candidate build и strict health: **pass**, 5 страниц, включая `/codex`,
  и все 13 JavaScript chunks. Отдельный protocol-1 recovery build также прошёл
  strict pages/chunks; оба временных preview process groups подтверждённо завершены.
- CI полной платформы переведён на Node 22/24, setup smoke — на Node 22:
  новый Control Center требует ≥22.13 и встроенный SQLite. Отдельный memory-only
  workflow остаётся на Node 20. Результаты remote CI фиксируются в release manifest.
- Privacy retention audit: pass. Protocol-1 recovery production build: pass.
- Strict pre-push audit: **pass**, без предупреждений. Публичный large-history
  report перенесён из child-agent reports в `03_reviews/`, synthetic Tailscale
  fixtures используют явные example-адреса; защитные проверки не ослаблены.
  Связанные publication/runtime tests: **12/12 pass**.
- Первый полный browser прогон выявил две старые фикстуры `/turns`, тогда как
  bounded UI уже использует `/history`. Обе фикстуры исправлены; проверки **2/2 pass**.
- После добавления отчёта validation нашёл неподдерживаемую inline YAML subject:
  поле исправлено на nested kind/id. Связанные CLI-alias checks **3/3 pass**.
- Первый unit запуск с глобально навязанными test-state env нарушил изоляцию
  существующих fixtures. Правильный полный запуск позволяет каждой fixture
  устанавливать собственное окружение и прошёл 820/820; production не менялся.
- Classic before/after: **6/6 pass** до и **6/6 pass** после, 30 страниц на каждой
  стороне (5 маршрутов × 6 ширин). Для сравнения зафиксированы одинаковые synthetic Limits и временные
  diagnostic paths. Это устраняет различие от сетевых ответов и переносов строк;
  допуска по цветам не добавлено, geometry tolerance остаётся 1 px.
- Исторический overflow Settings на ширине 768 px сохранён и отдельно записан;
  новые темы не должны его увеличивать. Исправление общей геометрии в T1 не входит.
- Сборка сообщает NFT tracing warnings для динамических путей существующей runtime
  архитектуры. Аудит recovery build: 4115 уникальных traced entries, **0** найденных
  auth/runtime.env/private-state entries. Итоговый candidate: 15 warnings,
  1366 уникальных traced entries, **0** private/runtime entries; standalone bundle
  не публикуется. Gitleaks 8.30.1: история кандидата проверена, **0** найденных secrets.

## Read-only preflight флота

На момент проверки четыре managed экземпляра отвечают; deployed code каждого —
`b42d9f2c4c7f`, независимо от более нового source HEAD. На матери 181 chat binding,
38 legacy receipts, **0 malformed receipts**, **0 cached active bindings**.
Неоконченых persisted Voice statuses среди четырёх экземпляров — **0**;
пересечений native bindings существующих registries между экземплярами — **0**.
Это снимок; непосредственно перед stop повторить проверку native состояния.

Материнский source содержит два предшествующих незакоммиченных Markdown-артефакта.
Они не входят в функциональные/theme commits. Способ временного сохранения и
возврата согласуется отдельно; managed updater по-прежнему требует clean checkout.

## Выпуск и остаточные границы

Новые primary/replica начинают с paused admission. После exact build health
включить capacity через `execution-control activate --expected-build`. Drain
запрещает остановку при active/unknown owners. Первый execution фиксирует floor 1;
возврат к protocol-0 поверх новых receipts запрещён. Сохранён protocol-1 recovery
build, источником которого является foundation commit выше.

Независимый внешний Codex/Desktop не участвует в instance-local coordinator.
Worktree изолирует файлы; внешние MCP/API effects требуют собственной policy и
согласования ресурсов. Unknown CLI после потери владельца не останавливается по
сохранённому PID и не повторяется автоматически. Эти ограничения не скрываются
под общим названием «параллельность».

ND получает отдельную CLI-only инструкцию, без переноса App Server capabilities
или reset usage ledger. MacBook получает source package и инструкцию; actual install,
provider smoke и peer access на другом устройстве остаются непроверенными до их
собственного выполнения.

## Проверка установленного сервера и усиление release gate

Первое поэтапное обновление выявило ошибку именно production bundle: Turbopack
преобразовал `createRequire(import.meta.url)("node:sqlite")` в unsupported URL
external. Исходные Node-тесты проходили, страницы/chunks отвечали, но activity API
возвращал `execution_runtime_unsupported`. Допуск матери закрыт с нулём execution
owners; клоны до исправления не обновлялись. Данные и прежние WIP сохранены.

Загрузка переведена на штатный `process.getBuiltinModule`, доступный в проверенной
ветке Node 24 и минимальной ветке Node 22.13. Источник:
[Node.js process.getBuiltinModule](https://nodejs.org/api/process.html#processgetbuiltinmoduleid),
проверено 2026-09-08. Health использует тот же loader и выполняет SQL-запрос в
отдельной in-memory DB; пользовательское execution-state этот probe не открывает.
Strict health отклоняет отрицательный результат до активации. Добавлены regression
checks успешной/неуспешной загрузки и отказа strict checker. Итоговый release pin,
проверка compiled activity/native-turn API и per-instance результаты фиксируются
в окончательном deployment receipt; предыдущий rc2 не является готовым release.

Compiled native-turn smoke дополнительно воспроизвёл конфликт отдельного
history transport: open rollout возвращался как `interrupted`, хотя исходный
App Server продолжал turn. History responses теперь только отображаются с
учётом durable running intents и не освобождают Direct/Voice leases. Native
`notLoaded` read также не считается подтверждением завершения. Освобождение
остаётся за исходным execution owner и проверенным loaded-thread reconciliation.
Регрессионный тест проверяет одновременно статус, сохранение claims при чтении
истории и освобождение после подтверждённого завершения владельцем.
