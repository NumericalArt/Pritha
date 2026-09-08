---
id: 2026-09-07-pritha-cleanup-followup-release-review
type: review
status: validation-in-progress
created: 2026-09-07
updated: 2026-09-07
topics: [pritha, cleanup, browser-tests, scaffold, fleet, neuraldeep]
tools: [Pritha, Node.js, Playwright, Git, Next.js]
sources:
  - 07_workflows/2026-09-07-pritha-minor-cleanup.md
  - 03_reviews/2026-09-07-pritha-minor-cleanup-release-review.md
related:
  workflows:
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
supersedes: []
superseded_by: []
source_version: follow-up code aa9c775; templates cc97d06; diagnostics e1b0f69
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: release-validation
confidence: high
---

# Pritha: закрытие ограничений cleanup

Все три ограничения предыдущего A–F выпуска получили реализацию в этом цикле.
Пользователь одобрил полный follow-up, GitHub и обновление пяти канонических
экземпляров; ND получает отдельный roadmap, сохраняя собственный engine.

| Ограничение | Исправление и evidence |
| --- | --- |
| Playwright не засчитан | 33/33 configured Chromium cases, 0 skipped/flaky/failed. Desktop 1280 px и mobile 390 px, история, вложения, copy, настройки, Start/Serve, lifecycle guards и layout. Disposable runner использует собственные source/state/agent-parent, порт и build, конечные deadlines и cleanup только своей process group. |
| Legacy launchd warning | Две необязательные legacy jobs отсутствовали и на диске, и в loaded state. Теперь это not-installed. Явно required, installed-but-not-loaded, orphan loaded, чужие roots и query errors остаются ошибками. 11/11 diagnostic tests; live audit pass. Никакие дополнительные службы не включены. |
| Отложенная G | Все 41 authored template вынесены из scaffold/index.mjs. 11 вариантов, 456 generated files и 11 reports побайтно совпадают с прежним output. 43/43 scaffold tests, включая literal substitution и missing slots. |

Playwright ранее падал из-за слишком широкого mock: GET delivery получал chat
payload, после чего `.length` у невалидного списка обрушивал React. Это уточняет
первоначальную гипотезу о незагрузившейся локальной странице. Исправлены mock и
production guard: недоступность списка сборок теперь остаётся внутри его панели.
Также устранено реальное mobile overflow от длинного пути в compact-dl.

Сохранён принятый UI подтверждения действий через кнопку/dialog. Синтетические
fixtures проверяют receipt и отсутствие действия при отмене; реальные Start,
Serve и paid provider calls этим прогоном не выполняются. Upload больше 10 MiB
и settings проверены через настоящий HTTP backend только в disposable state.
Полный suite здесь означает все 33 настроенных Chromium tests; это не заявление
о проверке всех браузерных движков или live provider pilot.

## Финальная валидация и выпуск

Результаты полного self-test, golden checks, strict publication и staged fleet
будут добавлены после завершения release transaction. Machine-readable evidence
хранится в private state матери; сырые runtime paths и credentials не публикуются.

## NeuralDeep

Revision 10 добавляет отдельный isolated E2E runner, malformed-response checks,
launchd applicability и extraction собственных ND templates после A1/A2.
Сохраняются CLI-only transport, provider ledger, admission, темы и engine
`a3820b5`; mother code не bulk-merged. Документ не объявляет пакеты ND
реализованными или live provider pilot пройденным.
