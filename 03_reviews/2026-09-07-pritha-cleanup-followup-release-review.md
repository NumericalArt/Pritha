---
id: 2026-09-07-pritha-cleanup-followup-release-review
type: review
status: awaiting-macbook
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
source_version: tested and deployed local candidate b42d9f2; UI aa9c775; templates cc97d06; diagnostics e1b0f69
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: verified-local-fleet-remote-pending
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

- Полный self-test на `b42d9f2`: **748/748 на каждом из четырёх экземпляров**
  Mac Mini — mother, Dasha, Sasha, Marina. Failed/skipped, регрессий и warnings
  верхнего уровня нет. Реальным повторным self-test обновлены старые отчёты
  клонов, поэтому исчез и сохранённый warning от 6 сентября.
- Golden checks матери: **10/10**, включая rebuild, embeddings и semantic search.
- TypeScript, production build, `privacy --strict`, `publication --strict`: pass.
- Environment doctor сохраняет рекомендацию Python 3.10+ при совместимом 3.9.6;
  это рекомендация среды, не оставшийся legacy launchd warning.
- Изолированный Chromium suite: **33/33**, без skipped/flaky/failed. Scaffold:
  **43/43**; launchd diagnostics: **11/11**. Эти focused tests также входят
  в общий unit suite; их числа не прибавляются повторно к 748.

Machine-readable evidence хранится в private state матери; сырые runtime paths,
network endpoints и credentials не публикуются.

### Канонические экземпляры

Проверенный candidate `b42d9f2c4c7fa6a79e35626f2cd505cff0efb44a` опубликован в
`NumericalArt/Pritha`, `main`. Каждый из четырёх локальных выпусков прошёл с
первой попытки, без rollback. Совпали exact commit/BUILD_ID, пять страниц
`/voice,/agents,/task-chat,/codex,/settings`, все 13 JS chunks, clean main и
isolation fingerprints. Package version остаётся `0.1.0`; release identity
определяется Git commit и BUILD_ID.

| Экземпляр | Compiled commit | BUILD_ID | Strict health / isolation | Memory documents |
| --- | --- | --- | --- | ---: |
| Mother | `b42d9f2` | `jU-e8dCl878cp0OL-3-85` | pass / pass | 813 |
| Dasha | `b42d9f2` | `HPHTpUz52Gw1tVUX5lUQB` | pass / pass | 756 |
| Sasha | `b42d9f2` | `n1tiwPrLvwjHqISjhwq6r` | pass / pass | 736 |
| Marina | `b42d9f2` | `2jzrZhE1fXVElLs1DLcjz` | pass / pass | 730 |
| MacBook canonical | после попытки не подтверждён | не подтверждён | connection lost / pending | pending |

Для локальных выпусков использованы invocation-only budgets: readiness 90 s,
request 30 s, whole strict 360 s, rollback readiness 90 s. Настройки runtime.env
не менялись. Итоговый документационный commit синхронизируется fast-forward
по четырём доступным checkout с rebuild локальной памяти; повторная сборка
не требуется, поскольку diff после candidate затрагивает только эти отчёты
и workflow. Точный docs SHA и фактические runtime identities сохраняются в
private final-sync receipts, отдельно от compiled pin.

### Незавершённый удалённый выпуск

MacBook был доступен при предварительной проверке; canonical checkout имел
clean `main` на `b7880c6`. Последняя подтверждённая до попытки compiled точка —
`4208882`, из предыдущего release report. Новая команда staged update была
отправлена для `b42d9f2` с budgets 180/60/360/90 s, но SSH-соединение оборвалось
до получения результата. Повторный read-only SSH также завершился timeout;
Tailscale status подтвердил offline. Отсутствие ответа не доказывает ни успешный
выпуск, ни rollback. Текущее состояние MacBook после попытки неизвестно.

Для завершения нужен включённый MacBook с восстановленным доступом. Сначала
прочитать private release journal, actual BUILD_ID, runtime-manager status,
Git status и наличие ещё работающего updater. Если прежний процесс продолжает
работу, дождаться его результата. Повторять update только после установления
terminal state; использовать текущий опубликованный exact pin и штатный manager.
Затем strict identity/pages/chunks/isolation, диагностика, docs sync и memory.
Старый неканонический dirty checkout не затрагивается. До этого выпуск всех
пяти экземпляров **не считается завершённым**.

## NeuralDeep

Revision 10 добавляет отдельный isolated E2E runner, malformed-response checks,
launchd applicability и extraction собственных ND templates после A1/A2.
Сохраняются CLI-only transport, provider ledger, admission, темы и engine
`a3820b5`; mother code не bulk-merged. ND docs commit — `8307bec`; обе копии
roadmap побайтно одинаковы. В ND прошла валидация 753 Markdown files,
пересобраны memory и 7437 embeddings. Незавершённое voice-исследование сохранено,
единственный tracked diff ND — этот roadmap. `pritha-upstream` остаётся
read-only, отдельный origin не создаётся. Документ не объявляет пакеты ND
реализованными или live provider pilot пройденным.
