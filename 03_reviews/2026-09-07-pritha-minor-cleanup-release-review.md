---
id: 2026-09-07-pritha-minor-cleanup-release-review
type: review
status: completed
created: 2026-09-07
updated: 2026-09-07
topics: [pritha, cleanup, agent-engineering, fleet, neuraldeep]
tools: [Pritha, Node.js, Codex, Git, Next.js]
sources:
  - 07_workflows/2026-09-07-pritha-minor-cleanup.md
  - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
related:
  workflows:
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/2026-09-07-pritha-minor-cleanup.md
supersedes: []
superseded_by: []
source_version: cleanup UI ed3c395; release checks 4208882; ND documentation 320e56e; ND engine a3820b5
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: technically-verified
confidence: high
---

# Pritha: результат минорного cleanup

Восемь исходных API/Goal follow-up commits опубликованы до начала cleanup.
Реализация A–F опубликована на GitHub в `main`, UI candidate `ed3c395`, follow-up release checks `4208882`.
Версия runtime определяется commit и BUILD_ID; package version остаётся 0.1.0.

| Группа | Результат |
| --- | --- |
| A1 — `2c178dc` | Один selected управляет модулями, файлами, npm-командами, документацией и smoke. Явные none/ephemeral учитываются; legacy defaults и необходимая redaction сохранены. |
| A2 — `f7dc958`, `c4b1791` | Child npm test, структура и API process lifecycle; handoff фиксирует результат на точной ревизии. Failed/missing/not-run дают warning, не блокируют подготовку handoff и не подменяют Trials/acceptance. |
| C — `1edabdb` | Синхронные JS-пробы получили bounded timeout, SIGKILL и shell:false. Длительные бюджеты build/test/media сохранены. |
| B — `7025bfd` | Объединены одинаковые CLI parsers, text hash и timestamps. Отличающиеся readJson, slug и byte hash оставлены. |
| D — `bc49a05` | Проверены 23 экспорта: внутренние реализации сохранены, три невостребованные декларации удалены; documented consumer сохранён. |
| E — `b46a8f7` | Русское руководство, changelog, warning по новым commit subjects, docs/ui-design и видимые ошибки операторских сигналов. |
| F — `20defc1` | Безопасное отображение путей, native file operations, точная identity отчётов, отдельные Start/Serve cards с revision binding и durable receipts. |

Изолированные тестовые окружения обновлены под новые импорты (`cd2bf1a`),
публичные path fixtures используют явные placeholders (`ed3c395`).
Staged health допускает один повтор временной сетевой ошибки в пределах
request/global deadlines (`4208882`); identity, HTML, JS и rollback gates сохранены.

## Проверки

- Полный self-test на `4208882`: **728/728**, без failed/skipped и регрессий; все проверки
  quality-gate прошли. Дополнительные 24 release/rollback tests также прошли,
  включая повтор медленного ответа и отказ при неверных identity/pages/chunks. Сохраняется прежний warning `launchd-root-drift` по
  legacy jobs; изменения этих jobs не входят в выпуск.
- Дополнительно на MacBook с Node.js 22.15.1: **9/9** focused tests по
  selected modules, sync probes, CLI parsing и operation decisions.
- Golden checks: **10/10**, включая memory rebuild, embeddings и semantic
  search; TypeScript, privacy audit и strict publication audit прошли.
- Host-pulse: два последовательных успешных запуска двух новых engineering
  tests в отдельной копии committed code. Свободный порт, health, повторные
  start/stop, чужой PID, stale record и очистка проверены. Canonical проект
  сохранён на прежнем commit и без изменений.
- Browser QA: actual served candidate открыт во встроенном браузере без
  console errors. Изолированный HTTP fixture проверил compiled Task Chat на
  1280 и 390 px: нет горизонтального overflow и HTTP-ссылок на локальные пути;
  cancel не исполняет действие; потерянный ответ сохраняет request ID;
  Start/Serve выполнялись только синтетически. На mobile кнопки доступны при
  прокрутке. Реальный Start или Tailscale Serve этим тестом не включался.
- CLI Playwright suite не засчитан как pass: runner не загрузил локальную
  страницу до UI assertions. Прогон остановлен; вместо него выполнена описанная
  browser QA. Серверный controller отдельно покрыт fixture tests на stale,
  foreign, cancel, duplicate и interrupted requests.

## Выпуск канонических экземпляров

| Экземпляр | Compiled commit | BUILD_ID | Staged health / isolation |
| --- | --- | --- | --- |
| Mother | `ed3c395c2360` | `_pEb3hpQI-Y2K7SML-uJ5` | pass / pass |
| Dasha | `ed3c395c2360` | `lQcCe0IfZTMBf9SQp7y4V` | pass / pass |
| Sasha | `ed3c395c2360` | `8vqdWG4cms9V_iXL3iDte` | pass / pass |
| Marina | `ed3c395c2360` | `YTpIAcDnvr1AcZZ9ZTQYN` | pass / pass |
| MacBook | `420888244ebb` | `lbX5_jvcZ9Fx3UZib2CPb` | pass / pass |

Для каждого экземпляра подтверждены отдельные state/agent-parent, memory,
exact candidate BUILD_ID, пять страниц `/voice,/agents,/task-chat,/codex,/settings`
и все их JavaScript chunks. Staged release receipts и детали browser/pilot QA
сохранены только в instance-local evidence. Последующий документационный
commit добавляет этот отчёт и завершает workflow. Четыре уже выпущенные
UI-сборки остаются на `ed3c395`: follow-up `4208882` меняет только отдельные
release CLI scripts и их tests, без изменений импортов Control Center. Эти
CLI scripts и документация обновлены fast-forward; compiled pin MacBook
указан в таблице отдельно.

Dasha прошла после одного проверенного rollback и повторного выпуска с request
budget 30 s. На MacBook после двух первых попыток выполнен rollback с подтверждённым
возвратом прежней сборки. Финальный `4208882` прошёл с readiness 180 s,
request 60 s, whole strict 360 s и rollback-readiness 90 s: warmup 17.2 s,
`/agents` потребовал один повтор, остальные страницы прошли с первого запроса.
Эти параметры заданы для конкретных запусков updater, а не записаны в runtime.env.
Чужие процессы, runtime data и конфигурации экземпляров не заменялись.

Все пять checkout синхронизируются fast-forward до итогового main с этим
отчётом. Точный итоговый SHA, clean status и действующие BUILD_ID записываются
в private fleet receipt после синхронизации. Последующий docs-only commit не
требует повторной сборки уже проверенного интерфейса.

## NeuralDeep и границы результата

Roadmap **revision 9** в mother и ND побайтово одинаков. ND documentation
commit `320e56e` сохраняет самостоятельную историю, engine `a3820b5`, темы,
собственный Codex CLI/provider и незавершённое исследование. Markdown validation
и локальная память/embeddings обновлены. ND runtime и paid provider pilot
не объявляются проверенными этим выпуском. `pritha-upstream` остаётся
read-only; новый origin не создавался.

Пакеты ND ждут отдельной реализации по специализированному roadmap.
G (перенос 41 inline template и широкие declarations), split server.ts и
переименование Techscope остаются за пределами согласованного цикла.
