---
id: 2026-09-05-pritha-pilot-roadmap-current-state-assessment
type: assessment
status: complete
created: 2026-09-05
updated: 2026-09-05
topics: [pritha, agents-mother, outcome-delivery, goal-budget, card-readiness, runtime, pilot-metrics]
tools: [Pritha, Codex, Node.js, Git, SQLite, Next.js]
agent_platforms: [Codex, Pritha Control Center]
model_context: [not-applicable-to-read-only-probes]
runtime_environment: [local-mac, cli, control-center]
config_surfaces: [scripts/agents-mother/, scripts/pre-push-audit.mjs, interfaces/control-center/src/lib/, PRITHA_STATE_ROOT]
portability: adapter-needed
sources:
  - source-e8152359-342c-4fb6-849d-ccf490fe47a2
  - scripts/agents-mother/build-executors.mjs
  - scripts/agents-mother/execution-backends.mjs
  - scripts/agents-mother/delivery-loop.mjs
  - scripts/agents-mother/delivery-ledger.mjs
  - scripts/agents-mother/card-readiness.mjs
  - scripts/agents-mother/registry.mjs
  - scripts/agents-mother/handoff.mjs
  - scripts/agents-mother/scaffold/index.mjs
  - scripts/pre-push-audit.mjs
  - interfaces/control-center/src/lib/control-center/server.ts
  - https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal
related:
  intakes: [00_inbox/texts/2026-09-05-pilot-driven-improvement-planning.md]
  signals: [01_sources/signals/2026-09-05-pilot-driven-improvement-signal.md]
  reviews: [03_reviews/2026-08-22-outcome-delivery-remediation-plan-applicability-assessment.md]
  reports: [11_agents/reports/2026-09-05-pritha-integrated-fleet-release-report.md]
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
    - 07_workflows/2026-08-22-outcome-delivery-remediation-execution-preparation.md
  standards: [04_standards/pritha-good-state-alignment.md, 04_standards/agent-creation-harness.md]
  decisions: [05_decisions/2026-08-19-instance-local-child-agent-ownership.md]
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: Pritha 43baa16; Codex CLI 0.153.0; desktop-bundled Codex 0.153.4
retrieved: 2026-09-05
verified: 2026-09-05
valid_for: preparation on the primary Mac mini instance at the inspected revision
temporal_status: version-bound
recommendation: experiment
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge, governance]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Assessment: готовность материнской Pritha к следующему циклу улучшений

Подготовка позволяет начинать ограниченные доработки материнской Pritha.
Принесённый roadmap полезен как карта трения, но требует исправления
причинных выводов, зависимостей и критериев приёмки. Особенно существенны
несовместимость ephemeral build threads с Goal и различие между успешным
результатом пилота и завершённым автономным run.

## Проверенная точка и границы

- Исходный checkout: `main`, чистое рабочее дерево до подготовки,
  `43baa168a41fa54a7c1a46331af0badabe6df1f6` от 2026-09-05.
- Локально подтверждены Mac mini, `instanceId=main`, `instanceRole=primary`,
  внешний state-root и совпадение code-root с текущим checkout.
- Node.js `v24.15.0`. Default build resolver выбрал Codex CLI `0.153.0`;
  resolver App использует desktop-bundled Codex `0.153.4`. Это разные
  бинарники, а не две этикетки одного runtime.
- Проверяемая UI release-линия — `1c0ed2c`; последующие `4467828` и `43baa16`
  относятся к release tooling и документации. Различие source HEAD и
  скомпилированного UI pin само по себе не является рассинхронизацией.
- В этой подготовке изменяется authored knowledge. Сервисы, Goal пользователя,
  child checkout, private registry и другие экземпляры не изменяются.

Good State Alignment: `aligned` относительно accepted baseline 2026-08-28 и
2026-07-02. Сохраняются native history, отсутствие автоматического replay,
изоляция экземпляров, manager-owned runtime, staged release, evidence и
Voice/music behavior. Найдено два релевантных accepted baseline при limit 3.

Обнаружена дополнительная ловушка подготовки: `good-state-alignment.mjs`
сам не загружает runtime env. При запуске из shell без `PRITHA_STATE_ROOT`
он прочитал legacy index и вернул только июльский baseline. Повторная сверка
после `loadPrithaRuntimeEnv` вернула актуальный августовский baseline.
До отдельного исправления helper необходимо явно разрешать окружение
материнского экземпляра; это не основание менять baseline.

## Источники и временная совместимость

В исходном документе заявлены четыре аудита, но указаны три даты и три
assessment-пути. Следующие четыре ссылки отсутствуют в текущем checkout:

- `03_reviews/2026-08-10-pritha-strategic-project-audit-assessment.md`;
- `03_reviews/2026-08-21-pritha-outcome-delivery-update-assessment.md`;
- `03_reviews/2026-08-31-pritha-runtime-hardening-update-assessment.md`;
- `07_workflows/2026-08-21-outcome-delivery-remediation-plan.md`.

Это отсутствие источников здесь, а не доказательство, что аудиты никогда не
проводились. Их полнота и авторство не подтверждены. Вместо утверждения
«все пункты проверены аудитами» используются реальные code surfaces,
assessment/подготовка от 2026-08-22, release report от 2026-09-05 и локальные
read-only проверки. Ссылки на отсутствующие артефакты не добавлены в metadata
нового roadmap как существующие источники.

| Источник | Контекст | Что он доказывает |
| --- | --- | --- |
| Код checkout | `43baa16`, проверен 2026-09-05 | Наличие веток, guards, моделей данных; сам по себе не доказывает UX |
| Self-test основного экземпляра | 2026-09-05, `created_at=2026-09-05T11:53:47.302Z` | Текущие автоматические проверки и live health |
| Private pilot receipts | Созданы 2026-09-03, прочитаны 2026-09-05 | Финальные Trials прошли; исходный ledger остался blocked |
| Установленные experimental schemas | CLI `0.153.0`, App `0.153.4`, получены 2026-09-05 | Goal get/set/clear и wire statuses существуют в обеих версиях |
| Official App Server docs | Получены 2026-09-05; дата обновления страницы не указана | Семантика persisted Goal и обновления бюджета |
| Два bounded runtime probes | 2026-09-05, те же версии | Goal/get отказывает для ephemeral thread в обоих runtime |

Частные receipts не публикуются и не переносятся в общую child-agent memory.
Ниже приведены только обезличенные выводы, необходимые для исправления
материнской платформы. Проверки пилота не запускались заново: это анализ
сохранённого evidence, а не новая сертификация его сегодняшнего checkout.

## Что подтвердилось и что исправлено

| Пункт исходного roadmap | Текущее evidence | Вывод для плана |
| --- | --- | --- |
| A1: бюджет проверяется лишь после превышения | `delivery-loop` проверяет остаток до executor; executor устанавливает Goal до `turn/start`. Нет прогноза стоимости шага | **Уточнить** существующий механизм, не создавать его заново |
| A2/A4: продолжению мешает только лимит | Живой probe: `threadStart=true`, `goal=false`; отказ для ephemeral thread в обеих версиях | **Новый приоритет 1.0:** lifetime/capability до UI и default-бюджетов |
| A1/A4: надёжный учёт расхода | `accountExecutorResult` отвергает usage выше cap; schema ledger запрещает `tokens_used > max_tokens`; waived turn возвращает 0 | **Новая работа:** сохранять превышение и unknown usage честно, отдельно от разрешённого cap |
| A3: host-owned шаги требуют Goal | Goal enforcement найден в build executor; handoff и accept имеют другие gates | **Не воспроизведено как запрет CLI.** Разделить native Task Chat turn и host action; проверить UI route |
| B1: CLI blocked без manifest | Текущий read-only `card-readiness`: registry/folder есть, manifest нет, status blocked | **Подтверждено**, но не создавать сервисные файлы ради цвета |
| B3: blocked ledger блокирует карточку | Lifecycle читается из последнего delivery-report; blocked добавляет next action. В этом пилоте явный blocker — manifest | **Уточнить:** status/report/ledger и readiness — разные цепочки |
| B2: HTTP-only health | `server.ts: probeHealth` возвращает unknown без local URL | **Подтверждено.** Для CLI runtime health может быть not-applicable |
| C1: frontmatter полностью игнорируется | `subject.id` уже читается и участвует в matching, но `reportRepresentsChildAgent` сначала требует body name/path | **Точечная ошибка фильтра**, плюс риски нестрогого fallback matching |
| C2/C3: mission/profile | Registry содержит mission из контракта; handoff не создаёт canonical profile. Исходную задержку UI не воспроизводили | Profile — после identity design; миссия должна разрешаться из authored источника |
| D1: нужен только verifier stub | Private scaffold report фиксирует и отказ generic scaffold для `runtimeFamily=cli`; код допускает только `codex-native` | Добавить **4.0 runtime/scaffold fit**; stub не делает verifier доверенным |
| D2: handoff слишком общий | Writer проверяет доступность файлов/команд; complete определяется harness classification | Разделить «guide создан» и «результат подтверждён», добавить формат CLI |
| E1 | Синхронные timeout probes в `server.ts` без явного killSignal | Исправить bounded termination; SIGKILL не делает probe асинхронным |
| E2 | При отсутствии merge-base `changedAgentArtifacts()` возвращает `[]` | Подтверждён fail-open path; выбрать явный fail-closed |
| E3 | Auto-cleanup включает failed/cancelled; accept возвращает cleanup error, но не пишет отдельное событие в ledger | Уточнить state machine и recovery visibility без удаления сохраняемого worktree |
| E4 | Handoff использует общий redaction writer; research/improve в `index.mjs` ещё используют `writeUniqueArtifact` | Расширить coverage; исследовать private/public boundary и locked data до изменения writer |
| F1/F2/F3 | `server.ts` — 4393 строки; два набора CHILD_AGENT_TYPES; в README.ru нет Outcome-раздела | Подтверждено; LOC/regex — индикаторы, а не критерии качества |
| F4/F5 | Sensors уже draft; legacy Techscope paths/env явно разрешены AGENTS | Уточнить implementation status; переименование runtime не является обязательным исправлением |
| G1/G2 | Один успешный конечный CLI-результат, нет сопоставимой серии; публичный adoption UX отдельно не измерен | Не превращать частный случай в completion rate или обещание 30 минут |

### Goal: установленная схема и реальное поведение

Официальная документация подтверждает get/set/clear. Изменение бюджета с
опущенным objective сохраняет usage; новый objective сбрасывает учёт.
Поэтому кнопка «продлить» не должна создавать новую цель или скрыто очищать
предыдущую. См. [Manage a thread goal](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal).

Схемы обеих установленных версий содержат `threadId`, optional objective,
status, tokenBudget, а статусы включают active, paused, blocked, usageLimited,
budgetLimited, complete. Это не доказывает обработку каждого перехода во время
активного turn. Реальный существующий build probe запускает ephemeral thread
и вызывает Goal/get: обе версии отказывают. `turn/start` и запрос к модели
для этой проверки не выполнялись, новые пользовательские Goal не создавались.

Автоматическое обновление Codex здесь не предлагается как доказанное решение:
более новый установленный App binary воспроизводит тот же отказ. Нужны
run-bound lifecycle design и тест протокола; sandbox/isolation не доказаны
одним ответом probe с текстовым полем `isolation: sandboxed`.

### Что действительно известно о пилоте

- В сохранённом финальном handoff — пять прошедших защищённых Trials на
  указанной чистой ревизии и независимая проверка полного набора тестов.
- Исходный ledger: blocked, `goal_api_unavailable`, одна итерация,
  `tokens_used=0`, пустые `accounted_turns`; ранее был `trial_input_missing`.
- Handoff прямо отделяет свежую проверку canonical checkout от прежнего
  blocked disposable-worktree flow. Нельзя задним числом сделать run accepted
  только на основании существования этого Markdown.
- 254440, 61937, восемь сообщений, четыре лишних сообщения, двадцать минут
  и примерно два часа — числа из входного материала. Их фазовая атрибуция и
  полнота не подтверждены прочитанной телеметрией. Они сохраняют статус
  `operator-reported`, не используются для расчёта default и не суммируются
  как доказанный расход отдельного build executor.
- Нулевые ручные правки пользователя не равны отсутствию ручных обходов
  оркестрации со стороны Codex.

## Сравнение с существующей памятью

- **Confirms:** separate Contract/Outcome approval, immutable evidence,
  disposable worktree, instance-local child ownership и staged release.
- **Refines:** планы 2026-08-16 и remediation preparation 2026-08-22 остаются
  историей реализации; новый roadmap описывает оставшиеся пробелы и полевые
  проверки. Наличие реализации B7 не означает совместимость его runtime пути.
- **Contradicts:** сильные утверждения входного draft о доказанной полной
  автономности, достаточности увеличения бюджета и необходимости быстрого
  переименования runtime.
- **Uncertain:** отсутствующие аудиты, mid-turn enforcement, полная стоимость
  пилота, реальное число пользовательских вмешательств и adoption score.
- Принятые стандарты и baseline не объявляются superseded. Обновляется план
  следующего цикла, а не история пользовательского acceptance.

## Экспертные ракурсы и альтернативы

Оценка переработанного материала по шкале 0–5; для Risk большее число означает
больший риск. Это редакционная оценка, а не измеренная успешность harness.

| Dimension | Score | Основание |
| --- | --- | --- |
| Relevance | 5 | Непосредственно затрагивает создание и сопровождение агентов |
| Novelty | 2 | В основном закрытие интеграционных пробелов существующей системы |
| Practicality | 4 | Локальные fixes готовы к работе, schema/UI требуют отдельных пакетов |
| Leverage | 4 | Устранение повторяющихся blocker и ложных состояний сокращает ручные обходы |
| Evidence | 3 | Есть код, receipts и live probes; часть исходных чисел и аудитов недоступна |
| Freshness | 4 | Проверены текущий checkout, установленные версии и официальные docs |
| Temporal context | 4 | Версии/даты заданы; у внешней страницы нет даты обновления |
| Risk | 3 | Goal/identity migrations затрагивают usage, privacy и approval semantics |
| Agent-fit | 5 | Улучшает верификацию, lifecycle и передачу результата |
| Techscope-fit | 5 | Работа прямо соответствует миссии материнской Pritha |

| Ракурс | Рекомендация и trade-off |
| --- | --- |
| Programming | Сначала малые fixes и воспроизводимые edge cases. Выделять модули по ответственности, а не ради лимита строк |
| Agent engineering / architecture | Run-wide host ledger + проверенная проекция в Goal предпочтительнее prompt-only counters. Persisted run thread требует lifecycle, privacy и recovery design |
| Security | Не доверять generated stub; не выполнять команды из agent manifest автоматически при GET карточки; не приравнивать reconcile к acceptance |
| DX | Различать «общий лимит» и «добавить N», сохранять историю и native bindings. Пять новых кнопок не заменяют ясный сценарий восстановления |
| Evidence | Раздельно хранить reported/measured/unknown, exact revision и знаменатель метрики; ограниченная серия даёт наблюдения, а не статистическую гарантию |
| Product pragmatism | Сначала основной экземпляр и повтор CLI-пилота; ребрендинг, sensors harness и GitHub marketing не задерживают устранение текущих blocker |

Pritha/Agents Mother fit: **adopt** для подготовки и подтверждённых локальных
fixes; **experiment** для Goal lifecycle и типовой модели; **watch** для sensors
и cost calibration; **skip в текущем цикле** для forced Techscope migration.
Стоимость: малая для документации/guards, средняя для budget/identity,
повышенная для readiness UI и schema migration. Новые runtime dependencies
не нужны. Goal остаётся Codex-specific интеграцией, поэтому protocol version
и adapter boundary должны быть явными.

## Выполненная проверка

Полный `node scripts/self-test.mjs --json` на материнском экземпляре: **pass**,
518/518 tests, 0 failures/skips, quality gate pass, privacy, Markdown validation,
memory rebuild, smoke и Telegram dry-run pass. Live health: пять страниц
(`/voice`, `/agents`, `/task-chat`, `/codex`, `/settings`) и 13 chunks pass.
До новых документов индекс содержал 762 документа; embeddings восстановлены.

Известное предупреждение self-test: `launchd-root-drift`. В env-doctor остаётся
Python 3.9 ниже рекомендуемых 3.10; embeddings завершились с предупреждением
urllib3/LibreSSL. Эти предупреждения не скрывались и не исправлялись
перезапусками или изменением legacy служб. Критических регрессий нет.

Новый production build, browser interaction suite и paid model turn не
запускались: UI-код не изменён. Публикация и fleet rollout не выполнялись.
Проверка новых Markdown и индекса после записи фиксируется в execution
preparation. Готовность означает возможность начать следующий рабочий пакет,
а не завершение roadmap или разрешение на deployment.
