---
id: 2026-09-06-pritha-pre-pilot-readiness-review
type: assessment
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [pritha, agents-mother, readiness, verification]
tools: [Pritha, Codex, Node.js, Git]
sources:
  - 03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md
  - tests/agents-mother-cli-readiness.test.mjs
  - tests/research-writer-privacy.test.mjs
  - tests/async-probe.test.mjs
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-roadmap-completion-tracker.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-06
source_updated: 2026-09-06
source_version: roadmap preparation and runtime release 66274b4
retrieved: 2026-09-06
verified: 2026-09-06
valid_for: preparation for manual mother CLI pilots
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: workflow
  id: 2026-09-06-pritha-pre-pilot-readiness-review
privacy: public
retention: durable
review_status: reviewed
confidence: medium
recommendation: experiment
---

# Готовность к ручным пилотам: границы и доказательства

Этот отчёт закрывает подготовку mother roadmap к ручному созданию агентов.
Он не объявляет завершёнными ещё не проведённые пользовательские пилоты,
калибровку default или реализацию ND. Managed adoption фиксируется отдельным
отчётом `03_reviews/2026-09-06-pritha-canonical-fleet-readiness-report.md`,
который содержит версии и проверки каждого экземпляра.

## Реализованные пакеты

| Roadmap | Результат |
| --- | --- |
| 0.1–0.2, 0.4, 0.6–0.7 | Bounded probes, publication guard, общий artifact policy, own-state baseline, strict transactional page/chunk release gate |
| 1.0–1.5 | Persisted Goal lifecycle, same-task/run extension, host verification без model turn, отдельный phase usage, сохранение unknown/overshoot и истории |
| 2.1–2.6, 3.1–3.3 | Versioned result kind, точная identity, independent readiness/acceptance/runtime, approved CLI probe, reconcile, authored profile и идемпотентный type-specific handoff |
| 4.0–4.2 | Capability preflight, минимальный CLI adapter, host-owned verifier/hash/provenance до approval, structured waiver без ложного verified |
| 5.1–5.4 | Async diagnostics/cache/projection, общие bounded policies, durable cleanup diagnostics, redaction до locks |
| 0.3, 7.1–7.2 | Русский guide и синтетический CLI path без scaffold/research overrides |
| 5.5, 6.1 | Уточнён inventory sensors и разделены наблюдения первого пилота |
| 7.3 | GitHub inventory выполнен; dated changelog и публичный пакет подготовлены; release adoption отдельным отчётом |

## Research/improve writers

| Boundary | Проверка |
| --- | --- |
| index: researchMarkdown | Text leaves очищены до research_content_lock |
| index: agentDevelopmentTaskMarkdown | Project/task/memory/metadata очищены до записи нового artifact |
| patternPackMarkdown | Body, payload, seeds очищены до body/hash/document locks |
| logSemanticFailure | Private JSONL, безопасные text leaves; query хранится hash |
| applyExternalResearchEvidence | Новый bounded input очищен до evidence/synthesis locks |
| repositoryResearchFrontmatter/Markdown | Одинаковая очищенная проекция для prose, payload и lock |
| last30days adapter | Подготовительный input; durable boundary — общий external evidence writer |

Fixtures добавляют home paths, private endpoints и синтетический secret;
проверяют также decoded payload и валидность locks. Старые approved artifacts
не переписаны. Raw external input остаётся untrusted; исследование не запускает
код найденных репозиториев. Private evidence не публикуется автоматически.

## Ретроспектива первого CLI-пилота — 6.1

Источник: проверенный assessment 2026-09-05, раздел «Что действительно известно
о пилоте», и исходные private bindings. Product: пять защищённых Trials на
чистой canonical revision плюс отдельная полная проверка. Исходный run:
blocked/goal_api_unavailable, одна итерация, нулевой legacy counter и пустой
accounted_turns, ранее trial_input_missing. Product и старый run имеют разные
результаты; handoff не доказывает задним числом acceptance этого run.

Числа токенов, сообщений и времени из входного рассказа — operator-reported.
Точная фазовая атрибуция, полнота usage и время активной модели неизвестны.
Ручные обходы со стороны Codex были; отсутствие пользовательских правок не
делает путь автономным. Эти данные не используются для изменения default.

## B7: измеренная область 1.7

2026-09-06, установленный Codex CLI 0.153.0, provider openai, запрошенная
runtime default модель gpt-6-astra, effort low: одна синтетическая текстовая
попытка, Goal 500 tokens в paused состоянии. Через две секунды отправлен
turn/interrupt. Наблюдены interrupted и восстановление того же turn после
переподключения; задача архивирована, временный каталог удалён. Изменений
агентского проекта, сервисов или пользовательских задач не было.

`thread/tokenUsage/updated` не наблюдался; usage и overshoot остаются unknown.
Paused Goal counter 0 не доказывает нулевую стоимость. Это runtime evidence
interruption/recovery, а не доказательство mid-turn token enforcement активного
Goal или состоявшегося inference. Прежние CLI 0.153.0 / App 0.153.4 protocol
проверки paused/readback/reconnect сохраняются. B7 целиком не называется fixed.
Следующий bounded active-Goal observation входит в ручной пилот; жёсткий
токенный cap провайдера пока не обещается. Host receipts, timeout и same-run
recovery действуют независимо от этой неопределённости.

## Что следует после готовности

1.1 (прогноз), 1.6 и 6.3 зависят от сопоставимых измеренных повторов. Сейчас N=0
полностью атрибутированных сопоставимых production builds для калибровки;
default 1000000 сохранён. Прогноз не выдаётся за измеренный резерв.
6.2 выполняется пользователем сначала на материнской Pritha: CLI, затем
остальные типы по доступным adapters. Synthetic fixtures доказывают mechanics,
не пользовательскую приёмку. 5.6 остаётся deferred: TECHSCOPE compatibility
сохраняется. ND получает только собственный roadmap, без общего merge engine.

## GitHub inventory

Проверено 2026-09-06 через GitHub API: NumericalArt/Pritha публичный,
default branch main, Discussions включены, topics уже описывают agents/Codex,
local-first и knowledge management. Опубликованных GitHub releases нет.
Topics/settings не требуют изменения. CHANGELOG обновлён текущим dated пакетом;
GitHub Release и новое публичное маркетинговое обещание не создаются автоматически.

## Общая проверка кандидата

Финальный self-test 2026-09-06: **701/701 unit tests**, семь quality checks pass,
regressions пусты. Включены clean CLI, verifier negative controls, structured
waiver, approved probe, handoff replay, async queue/cache, cleanup preservation
и research payload privacy. Первая общая проверка выявила пропущенное поле
assessment и ожидания синхронного API в старых тестах; они исправлены до
финального прогона. Прежний launchd-root-drift относится к двум отсутствующим
legacy jobs, а не к новой ошибке release. Их удаление/создание не выполнялось.

Предыдущие browser fixtures actual Task Chat/AgentCard и CSS проходили на
1280/390 px с сохранением истории и отдельной acceptance; завершающий пакет
сохраняет этот UI и меняет host adapters. Окончательный staged build и live
page/chunk health подтверждаются release report.

Staged production build и последующий typecheck прошли. В 1199 traced
dependencies нет private/state файлов; prerender содержит только global error.
Активная `.next` этой проверкой не заменялась. ND roadmap revision 8 сохранена
локальным commit `45be624` поверх независимого theme update `a3820b5`; own-state
memory validation проходит (752 Markdown, 7416 embeddings).

## Проверка реального фонового запуска

Первое применение `bd9b5af` прошло build/unit gates, но strict live gate
выявил зависание синхронного `open` при чтении manifest дочернего проекта в
защищённом системном каталоге. Изолированный CLI read это не воспроизводил.
Managed rollback отказался менять активную сборку, пока её дочерний процесс
оставался жив после выхода launchd wrapper. Остальные экземпляры не обновлялись.

Исправлены обе границы: manifest и credential metadata читаются в bounded
worker с общей runtimeRead policy, а manager восстанавливает остановку только
после повторного доказательства ownership. Истечение read budget означает
неизвестную готовность конкретного проекта, а не остановку HTTP сервиса.
Синтетический блокирующий OS open проверяет event-loop responsiveness и общий
queue deadline; отдельный процессный тест проверяет owned orphan recovery.
Материнский сервис восстановлен штатным менеджером на прежней сборке;
окончательное применение исправления и версии фиксирует release report.

После первого исправления: **705/705 unit tests**, семь quality checks pass,
regressions пусты; staged build, последующий typecheck и Markdown validation
проходят. Tracing по-прежнему содержит 1199 файлов без private/state inputs.

Последующие изменения объединяют независимые metadata/readiness deadlines,
прогревают cold status перед strict gate и разделяют незавершённый status read
между API и SSR bundles через bounded instance-scoped cache. Fresh identity
для операций изменения сохраняется. Эти регрессии расширили набор до
708 тестов; результаты применения и ограничения приведены в итоговом отчёте.
Ответ диагностики теперь ограничен deadline независимо от задержки OS cleanup;
занятый worker slot освобождается только после завершения cleanup. Page read
использует runtimeRead budget для launchd audit, полный ручной audit сохраняет
свой бюджет. Unknown diagnostics не становятся положительным readiness evidence.
