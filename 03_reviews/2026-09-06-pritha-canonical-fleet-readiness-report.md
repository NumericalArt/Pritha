---
id: 2026-09-06-pritha-canonical-fleet-readiness-report
type: assessment
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [pritha, roadmap, canonical-fleet, readiness, release, neuraldeep]
tools: [Pritha, Codex CLI, Node.js, Next.js, Git]
sources:
  - 03_reviews/2026-09-06-pritha-pre-pilot-readiness-review.md
  - tests/project-metadata-async.test.mjs
  - tests/control-center-runtime.test.mjs
  - tests/pritha-instance-update.test.mjs
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-roadmap-completion-tracker.md
    - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
    - 07_workflows/2026-09-06-pritha-manual-pilot-protocol.md
supersedes: []
superseded_by: []
source_version: canonical runtime release 66274b46441432224cd5f4c8ca2d43667093e917
verified: 2026-09-06
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject: { kind: pritha, id: pritha }
privacy: public
retention: durable
review_status: reviewed
confidence: high
recommendation: experiment
---

# Pritha: итог подготовки и канонического выпуска

Подготовительный пакет установлен на пяти канонических Pritha. Материнская Pritha на Mac mini готова к первым ручным сессиям создания агентов. Подготовка специализированной ND roadmap завершена; реальные пилоты и калибровка остаются следующим этапом.

## Roadmap: что сделано

| Этап | Результат |
| --- | --- |
| 0 — Основание | Общие политики, own-state изоляция, publication guard, русский guide, строгая транзакционная проверка выпуска |
| 1 — Goal и бюджет | Продление в том же task/run, сохранение истории и бюджета, отдельный phase usage; host verification и handoff продолжаются без дополнительного model turn |
| 2–3 — Готовность и identity | Тип результата, точные ID, раздельные verification/acceptance/runtime, approved CLI probe, reconcile и authored handoff/profile |
| 4 — Scaffold и Trials | Capability preflight, CLI adapter, независимый verifier с hash/provenance, structured waiver без ложного verified |
| 5 — Надёжность | Ограниченные асинхронные проверки, cleanup receipts, redaction до locks, уточнённый статус sensors; дополнительно исправлены blocked file open и owned orphan recovery |
| 6 — Пилоты | Ретроспектива и протокол ручных запусков готовы; новые реальные пользовательские пилоты ещё не проведены |
| 7 — Публичный путь | Русский getting-started, синтетическая демонстрация, CHANGELOG, main и GitHub; отдельный GitHub Release не создавался |

## Версии и применение

Код выпуска: `66274b46441432224cd5f4c8ca2d43667093e917` в `NumericalArt/Pritha`.
Финальный commit отчёта содержит только документацию; Git HEAD и SHA
скомпилированной сборки поэтому учитываются раздельно. Control Center package
сохраняет `0.1.0`; идентификаторы этого выпуска — commit и BUILD_ID.

| Экземпляр | Код выпуска | BUILD_ID | Проверка после применения |
| --- | --- | --- | --- |
| Мать / Mac mini | `66274b4` | `GDvTHxWun21ydCsBZTg9I` | 708/708; strict health pass |
| Даша | `66274b4` | `LKSABByOJpEvTHxFIYZax` | 708/708; strict health pass |
| Саша | `66274b4` | `qtDeBS8iu4VsUNgQDfWZS` | 708/708; strict health pass |
| Марина | `66274b4` | `Xwtj_egLnHpnKGufPoSkc` | 708/708; strict health pass |
| MacBook | `66274b4` | `UoD7k9jzlERKQWsRz9Ez_` | 708/708; strict health pass |

MacBook обновлён в текущем каноническом checkout. Старый checkout с незавершёнными изменениями сохранён отдельно. Все пять экземпляров используют собственные state-root и каталоги агентов.

## Проверки и ограничения

- На каждом из пяти экземпляров: полный self-test **pass**, **708/708 unit tests**, без пропусков, семь quality checks pass, regressions пусты.
- Staged build и TypeScript проверка прошли; strict live gate подтвердил точную сборку, пять обязательных страниц и 13 JS chunks на каждом экземпляре.
- На матери: шесть проверок настоящего интерфейса — `/agents`, `/task-chat`, `/codex` при 1280/390 px; без ошибок страницы и горизонтального переполнения.
- Фактический Next trace: 1199–1202 файла на экземпляр, без private/state inputs. Fingerprints защищённого состояния и дочерних проектов совпали до и после применения.
- Финальная проверка MacBook: все HTTP 200; `/api/status` 3,825 s, рабочие страницы 0,077–5,657 s. Это измерение при текущей нагрузке, а не гарантия постоянной задержки.

Проверки используют собственные state-root каждого экземпляра. Managed release
сверяет fingerprints локальных агентов и защищённого состояния; приватные
данные, credentials и история не переносились между экземплярами.
Browser fixtures actual Task Chat/AgentCard прошли на 1280/390 px; clean CLI
fixture проверяет весь путь scaffold → независимые Trials → canonical revision
→ synthetic acceptance/handoff. Эти результаты не подменяют пользовательский пилот.

Live gate обнаружил то, чего не показали unit/build проверки: синхронное чтение
manifest проекта в защищённом каталоге могло заморозить HTTP event loop.
Теперь manifest и сведения о credentials читает отдельный bounded worker.
Неизвестные сведения не считаются подтверждённой готовностью. Остановка
зависшего процесса повторно проверяет instance record, process group и cwd;
чужой процесс не останавливается. Неудачные кандидаты заменены сохранёнными
сборками через managed recovery; итоговые экземпляры проверены без временных
диагностических перехватов. Независимые metadata/readiness проверки выполняются
одновременно. API и server-rendered страницы совместно используют незавершённый
status read и короткий instance-scoped cache; операции изменения запрашивают
свежую identity. Холодный status прогревается в пределах выбранного request
budget, после чего все пять страниц и их JS обязаны пройти strict gate.

Повторная проверка уже запущенного MacBook выявила, что full launchd audit
мог задерживать страницы до 30 секунд, а ожидание завершения процесса —
превышать диагностический deadline. UI теперь использует runtimeRead budget
(2500 ms по умолчанию); полный ручной audit сохраняет собственный бюджет.
Диагностический ответ возвращает unavailable по deadline независимо от
задержки OS cleanup. Незавершённый cleanup удерживает один из четырёх worker
slots: это сохраняет ограничение процессов и не выдаёт поздний ответ за свежий.

Сохранено известное предупреждение `launchd-root-drift` о двух отсутствующих legacy jobs. Оно не относится к пяти работающим managed Control Center. Недоступные metadata отдельного защищённого проекта остаются unknown; телефонный peer/Tailscale access в этом цикле не проверялся.

Финальные release profiles: старт 90 s; HTTP request — 15 s для матери/Даши, 30 s для Саши/Марины, 60 s для MacBook. Общий strict budget — 180 s локально и 360 s на MacBook; rollback readiness — 30/90 s соответственно. Это invocation overrides; общие defaults не переписаны. При параллельной проверке возникал временный SQLite lock; итоговые проверки выполнены последовательно и прошли. Временные диагностические hooks в рабочем runtime не оставлены.

Полные release receipts, тестовые JSON и browser proof находятся в private state/logs экземпляров. В Git опубликованы только проверяемые итоги; runtime/private evidence и пользовательские данные не включены.

## NeuralDeep и следующий этап

ND roadmap **revision 8** готова. Основная и ND-копия побайтово совпадают;
в ND документ сохранён commit `45be624` поверх собственного `a3820b5`.
Сохранены Codex CLI и NeuralDeep provider; общий engine в ND не переносился.
Own-state memory validation ND: 752 Markdown и 7416 embeddings.
Копия roadmap опубликована в основном GitHub repository; у ND checkout
не настроен собственный `origin` для отдельного push.

Следующий содержательный этап — ручное создание агентов на матери по
`07_workflows/2026-09-06-pritha-manual-pilot-protocol.md`.
Открыты эмпирические части: 1.1 (прогноз), 1.6 (калибровка), 1.7 (active-Goal
mid-turn/overshoot), 6.2 (новые ручные пилоты), 6.3 (promotion по наблюдениям).
Для 1.7 подтверждены только interruption/reconnect; inference и overshoot не
считаются измеренными. 5.6 остаётся deferred для Techscope compatibility.
