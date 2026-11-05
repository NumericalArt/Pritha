---
id: pritha-provider-convergence-roadmap-2026-11-01
type: workflow
status: in-progress
created: 2026-11-01
updated: 2026-11-05
topics:
  - provider-convergence
  - task-chat
  - agents-mother
  - curated-retrieval
  - voice-control
  - regression-prevention
  - pritha-rebranding
tools: [Pritha, Codex, NeuralDeep, Claude Code, OpenRouter, Ollama, LM Studio, MLX, SQLite, Playwright]
sources:
  - source-operator-provider-convergence-spec-1-2026-11-01
  - source-operator-provider-convergence-spec-2-2026-11-01
  - source-operator-provider-convergence-spec-3-2026-11-01
  - source-operator-pritha-rebranding-addendum-2026-11-01
related:
  workflows:
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/agents-mother.md
    - 07_workflows/memory-indexing.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-creation-harness.md
  reviews:
    - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
supersedes: []
superseded_by: []
source_published: 2026-11-01
source_updated: 2026-11-02
source_version: three-operator-specifications-plus-rebranding-addendum-v2
retrieved: 2026-11-01
verified: 2026-11-01
temporal_status: implementation-requires-current-provider-evidence
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge, governance]
subject:
  kind: workflow
  id: pritha-provider-convergence
privacy: public
retention: durable
review_status: reviewed-plan
confidence: medium
---

# Pritha «Великая и Ужасная»: исполняемый roadmap

## 1. Результат и границы текущего поручения

Обновить каноническую Pritha на Mac mini до единой рабочей системы с пятью
коннекторами задач: Codex, NeuralDeep, Claude Code, OpenRouter и Local. Сохранить
качество памяти, нативную историю Codex, надёжность фабрики, принятые возможности
Control Center и голосовые инструменты. Сначала записать этот roadmap, затем
выполнять этапы с проверяемыми результатами. Сам roadmap не является приёмкой
реализации.

Текущая исходная точка: canonical `main`, commit
`e1c00eb007103c13f57b8139c1c462f18cb2d87a`. Четыре уже существовавших untracked
артефакта от 2026-10-29 принадлежат другой работе: сохранить, не редактировать и
не включать в коммиты этой задачи. Первое authored изменение — этот документ.

**Разрешённая область:** локальный canonical checkout Mac mini и изолированные
тестовые каталоги этого компьютера. Исходники NeuralDeep получать только из
`NumericalArt/Pritha-NeuralDeep` на GitHub, read-only, с точным SHA. Запрещены
push, remote mutations, PR, изменения обеих Pritha на MacBook и синхронизация
других экземпляров до завершения реализации и ручных тестов. Историческое ТЗ A
предлагало противоположное направление; оно заменено этим поручением. GitHub и
MacBook после приёмки — отдельный rollout, а не скрытый побочный эффект.

Не читать секреты, `.env*`, приватные пользовательские каталоги или Keychain для
исследования. Не переносить runtime state. Интеграции получают credentials только
через штатный server-side boundary; тесты используют фикстуры. Не запускать
production, Tailscale, launchd, Telegram, cron, heartbeat или постоянный сервис.
Для последней установки candidate build действует отдельный непосредственный
approval по `control-center-staged-release.md`; до него подготовить весь код,
тесты, review, staged build и конкретный план отката.

## 2. Критическая переработка трёх ТЗ

1. **Направление переноса.** Curated FTS v2 и октябрьские знания уже находятся в
   canonical. Сначала доказать их сохранность; затем добавить сюда ND, не менять
   ND checkout. Не делать blind replacement gateway/runtime/index и cherry-pick
   всего fork tree.
2. **Три разные оси.** Bootstrap profile (`local`, `control-center`, `neuraldeep`,
   `claude` и т. д.), task connector (пять IDs) и voice engine — разные понятия.
   `local` bootstrap исторически означает локальную установку native Codex, а
   connector `local` — локальную модель. Сохранить это различие явно.
3. **Единственный контракт.** JS-реализация provider resolution — источник
   истины; TS использует typed bridge/общую схему, а не независимо расходящуюся
   копию. Legacy `codex-native` переводится в connector `codex`. Невалидная
   конфигурация — typed error, не fallback.
4. **Закрепление треда.** Смена активного коннектора влияет на новые чаты.
   Existing thread хранит connector, model, native session identity и capability
   snapshot. Resume/cancel/approval/queue всегда следуют binding этого треда.
   Legacy native history мигрирует без перезаписи transcript; новые provider
   IDs не могут столкнуться с native IDs.
5. **Voice privacy.** Realtime 2 — default для новой/неполной native конфигурации;
   явный выбор Live 1 сохранить. Auto для Codex/ND следует provider. Для остальных
   выбор из configured voice engines детерминирован, виден оператору, без тихой
   смены при ошибке. Для Local/local-private внешний голос, web и инструменты с
   сетью не включаются автоматически: локальный endpoint не делает весь агент
   офлайн. Cloud voice требует отдельного явного выбора и несовместим с strict
   offline задачей.
6. **Граница sandbox.** `--disallowedTools WebFetch,WebSearch`, path permissions и
   PreToolUse — defence in depth, не физическая изоляция Bash. Build executor
   требует подтверждённый host sandbox, изоляцию verifier/approval/ledger и
   сетевую политику. Без неё возвращать `isolation-unavailable`, а не обещать
   безопасность. Provider endpoint для LLM разрешается отдельно от сети tools;
   буквально offline Claude API невозможен.
7. **Approval жизненный цикл.** Blocking hook сам по себе не реализует pause/
   resume. Нужен долговечный decision receipt с точным run/tool/input binding,
   TTL/revision, reject/cancel, single consumption и восстановлением после
   рестарта. Неподдерживаемая операция честно blocked; нельзя объявлять её
   успешно paused или выполненной.
8. **Бюджет и billing.** Поток usage может приходить только по завершении
   сообщения. Применить max-turns/output/cost cap провайдера, резервирование и
   stop при известных расходах; не обещать точного real-time hard token cap
   там, где API не предоставляет его. Не складывать cumulative usage повторно.
9. **Актуальность.** SHA, число «93 теста», SDK/CLI версии, model IDs, effort и
   тарифы исходников — гипотезы для проверки. Каталог хранит provenance/date и
   capability, а недоступная модель даёт typed status. Не выдавать marketed
   число моделей или fixture-only pilot за live проверку.
10. **Измеримость.** 93.7%/2.7 ms/418 ms/29 MB — исторические измерения, не SLA.
    Acceptance fixture не менять ради прохождения; production corpus и frozen
    corpus измерять отдельно. Holdout не использовать для подгонки ranking.
11. **Конкурентность.** Queue host-owned для всех коннекторов, с idempotency,
    revision, single-flight admission, terminal lease cleanup и bounded retry.
    Не переносить ND admission так, чтобы он разрушил native coordinator.
12. **UI без потерь.** Steer виден по capability; при вложениях остаётся видимым,
    но disabled с объяснением (исправление противоречия ТЗ C). Cmd/Ctrl+Enter без
    steer не должен неожиданно отправлять другой action. Draft очищается только
    после подтверждённого receipt; Edit не затирает занятый draft.

Good State Alignment выполнен для `memory-and-provider-runtime`: релевантны
baseline 2026-08-28 (Reliable Codex Control Center) и 2026-07-02 (Voice Ducking).
Классификация — **aligned** при сохранении native canonical history, receipts,
instance isolation, managed lifecycle, production chunks и music ducking.
Изменение default голоса прямо задано последним ТЗ; сохранённый явный выбор не
переписывается. Перед каждым крупным surface повторить пропорциональную сверку.

## 3. Архитектурные контракты и правила исполнения

### Provider model

- `ProviderConnectorId = codex | neuraldeep | claude | openrouter | local`.
- Instance default priority: явный CLI selector для текущей операции, затем
  `PRITHA_PROVIDER_PROFILE`, затем instance config, setup config, native default.
  Сохранённый thread binding выше instance default при работе с existing thread.
  Документировать конфликт CLI/env; не смешивать bootstrap и runtime override.
- `ProviderPreset`: modelId, reasoningEffort/thinking по capabilities, timeoutMs,
  ограниченные budgets; только несекретные поля. Каждый provider сохраняется
  независимо. URLs валидируются, redirects запрещены там, где утечёт credential.
- `ProviderStatus`: not-configured, configured, ready, pending-auth, unavailable,
  error. `ready` требует актуального probe транспорта/auth, не только наличия ключа.
- `TaskChatBackendDriver`: list/history/start/resume/cancel/resolveApproval/health/
  usage плюс capabilities и typed errors. Политики queue, attachments, redaction,
  revisions, identity и public HTTP DTO общие; protocol drivers изолированы.
- Никакой автоматической смены connector/model при API/auth/429/timeout error.
  Повтор uncertain dispatch сперва восстанавливает receipt, не запускает новый turn.

### Credential / network boundary

- Namespaced macOS Keychain service по instance + provider; API key не в argv,
  tracked files, logs, browser payload, client bundle или runtime settings.
- Env дочернего процесса собирается allowlist; чужие API keys и proxy settings
  удаляются. UTF-8 locale, shell:false, stdin для длинных prompt, bounded stderr.
- OpenRouter фиксированный HTTPS upstream и таймауты; Local только literal
  loopback (IPv4/IPv6), проверенные порты/пути, без redirect/DNS/SSRF обходов.
- Child credential drawer требует явного действия с точным child binding,
  atomic 0600 gitignored `.env.local`, symlink/escape checks и redacted receipt.
  Тесты не provision реальные keys и не запускают реальные child services.

### Definition of Done для каждого этапа

Код и meaningful negative tests; typecheck при изменении TS; targeted unit и E2E
при изменении поведения; sanitized evidence с командами/counts/errors; checkpoint
в этом roadmap. Статусы: `pending`, `in-progress`, `verified-automated`,
`pending-live-check`, `pending-manual-acceptance`, `accepted`, `blocked`.
Skipped не равен pass. Ошибку исправлять в текущем этапе; не отключать тест и не
уменьшать порог. Независимую работу продолжать при внешнем blocker. Локальные
коммиты разрешены как recovery points; никакой публикации до ручной приёмки.

## 4. Пошаговый roadmap

Текущий проверенный срез на 2026-11-05: установлена `3c7c53b`, профиль
Interactive. Managed activation, strict/operational health, admission и полный
post-activation self-test проходят без warnings/regressions. Release gate:
1614/1614 тестов, 68 браузерных сценариев, build/typecheck, 5 страниц / 12 chunks
и проверенный откат. Claude и Codex приняты и применены. NeuralDeep с прежними
Contract/Outcome завершил host research и scaffold, затем до первого model
request обнаружил несовместимость parent sandbox с provider preset. Исправление
проверяется отдельно; подробности, сохранённые ограничения и следующие шаги —
checkpoint 76. R12 и ручная приёмка не закрыты.

Исторический проверенный срез на 2026-11-05: на Mac mini установлена `647505e`,
build `IYmn5PyKqCNE72JiwWTNY`, профиль Interactive. Managed activation,
strict/operational health, admission и post-activation self-test прошли без
warnings/regressions. Release gate: 1605/1605 тестов, 68 браузерных сценариев,
production build/typecheck, 5 страниц и 12 JS chunks; rollback сохранён.

Claude Word Counter прошёл 24 основные и 7 дополнительных независимых проверок
после штатного host-template refresh; 311938 токенов / 4 итерации сохранены.
Codex Greeting прошёл 20 CLI cases и artifact Trial за 40456 токенов / 1 итерацию.
Оба finish выполнены; пользовательская приёмка и применение файлов ещё нужны.
Voice → Codex по дефолту дошёл в исходный Task Chat без legacy parent/force_new.

Пользователь впервые одобрил Contract NeuralDeep и 80000 токенов / 2 итерации /
15 минут с начала сборки. Metadata acceptance ещё не применён: текущая модель
не заполняет обязательный expected_sha256 общего dispatcher, даже после точного
уточнения. Подготовлены per-action schemas; детали и незакрытые gates — checkpoint
73. Принятые документы Claude/Codex заново не согласуются. Матрица обоих
интерфейсов для трёх провайдеров и оставшаяся ручная приёмка ещё не завершены.

Исторический проверенный срез на 2026-11-03: установленная canonical Pritha —
`5f38f3748cf7ad3c71360d10a23fd21fbebb76ed`, build `V5p7AZTJkbUdBaHtxbCDt`,
профиль службы Interactive. Новое обновление `ff33d8fec1bbf11b7c23e7e9857ac36dbbca0636`,
build `7ZnIMkw-N89a8keb4G7We`, прошло подготовку, затем было отозвано до установки:
сверка выявила дополнительную ошибку alias-модели в новом Claude-чате.
Исправленный преемник проверяется перед новым точным lifecycle approval.
Полный gate: **1514/1514**, восемь групп pass, 0 fail/skip/cancel; production
build/typecheck, same-build browser **21/21**, strict **5 страниц / 12 JS chunks**.
Откат к установленной 5f38f37 проверен в отдельном loopback-процессе.

Приняты пользователем Realtime 2 memory/README, прерывание, продолжение темы
после reconnect и плавная работа музыки. Реальная Local 4B прошла file/resume
с явным пояснением inline text; первый общий запрос дал неверный ответ, этот
fail сохранён. Native Claude onboarding/file/resume и SDK уже проходили;
новая vision-проверка native CLI остановилась на истёкшем OAuth до tools.
Живая Claude API vision-проверка прошла initial/resume. Пилот счётчика строк
принят и применён (83335/90000 токенов, 5 итераций), но его CLI-путь не закрывает
отдельный end-to-end Voice → Claude UI factory journey. Этот путь, остальные
ручные gates и финальная приёмка остаются обязательными. OpenRouter live явно
отложен пользователем. Актуальный общий обзор и ограничения:
[convergence review](../03_reviews/2026-11-03-pritha-provider-convergence-review.md).

Все срезы ниже являются историей исполнения. Их слова «текущий», ожидаемые
входы, бюджеты и активные версии относятся к указанному моменту.

Исторический срез на 2026-11-02 06:45 UTC:

 продолжается R12. После разрешённой
попытки активировать `0bcf566` выполнен управляемый откат на `3853e0a`:
страницы и JS прошли, но operational agent-catalog выявил ошибку обработки
ещё не созданного draft-проекта. Исправленный кандидат `94f3a33` подготовлен,
но не активирован: full quality **1471/1471**, zero skips, восемь групп pass;
staging build `Zu0payZPo2t-vkJUCB2Ra`, isolated strict health **5 страниц / 12 JS**
и полный выход дерева probe-процессов подтверждены. Новая активация требует
непосредственного approval; текущая служба продолжает использовать `3853e0a`.
Подробности и имена private receipts — checkpoint 45.

Native Claude CLI прошёл source-level file tool + resume (**2/2**); compiled
Task Chat и fresh-instance onboarding ещё не приняты. Brief Desk реально
импортирован и прошёл offline demo/edit/reimport с сохранением состояния.
Отдельные Contract/Outcome approvals пилота получены, настоящий scaffold создан;
Claude delivery остановлен **до inference** на `provider_pending_auth`:
**0/40000 токенов, 1/3 итераций**. Metadata ключа существует, default Keychain
разблокирован, но штатное чтение credential не проходит; причина пока не
установлена. SDK live, Local recovery после отдельно разрешённого reboot,
voice-origin factory и остальные live/manual gates остаются открыты.
OpenRouter live отложен пользователем. Итоговая приёмка и goal не завершены.

Исторический срез перед попыткой активации `0bcf566` сохранён ниже; его слова
«текущий» и список ожиданий относятся к тому моменту:

Срез на 2026-11-02 (Europe/Moscow): R0–R11b реализованы, выполняется R12.
Кандидат `3853e0a` активирован на canonical Mac mini с отдельного согласия
пользователя; managed lifecycle, exact identity, 5 страниц / 12 JS chunks,
admission и operational health прошли. Post-activation self-test: 1445/1445,
семь групп без предупреждений. SQLite уже использует имя `pritha.sqlite`;
повторная миграция не выполнялась, обе предыдущие recovery-точки сохранены.
Native Safari chat/queue/steer/stop/files/reload проверены технически. Пользователь
подтвердил живой голосовой ответ и прерывание без потери связи. Claude API прошёл
реальное вложение и продолжение диалога. NeuralDeep прошёл file tool + resume
на явно выбранной `gpt-oss-20b` через исправленный source adapter; финальная
сборка/активация этих исправлений ещё предстоит. OpenRouter live acceptance
отложена по прямому указанию пользователя. Открыты native Claude sign-in,
Local recovery/performance, полный child pilot и итоговая приёмка.

Предыдущий счётчик цели до активации: около 13 ч 53 мин / 6 071 672 токена. Это общий usage
counter задачи, не output-токены или денежный расчёт. Оценка до рабочей локальной
версии и приёмки: 2–4 активных часа / 0,5–1,2 млн токенов, плюс ожидание
авторизации и ручных действий пользователя. Реальный Local protocol, живой child
pilot и аудио остаются источниками неопределённости. Сокращение вдвое — целевой
ориентир, пока не доказанный итог. Полные проверки повторяются только после
существенных изменений или обнаруженных сбоев. GitHub/MacBook rollout не разрешён.

Исторический прогноз ниже сохранён для сравнения; его список открытых работ
не является текущим статусом:

Срез исполнения на 2026-11-01 15:30 UTC: текущая работа — checkpoint 26c,
NeuralDeep image delivery. Checkpoint 26c.1 (файлы/host tools) сохранён локально
в `8da09b7`: full unit 1290/1290, targeted 102/102, browser 28/28. Image initial,
text resume и image resume уже прошли installed-CLI synthetic check; остальная
проверка image boundary, Settings verification и voice intake ещё выполняются.

Счётчик цели: 9 ч 33 мин, 4 144 314 токенов. Это usage counter задачи, не число
output-токенов и не денежный расчёт. Прогноз оставшейся работы, **не лимит**:
8–14 активных часов / 3,5–6,5 млн токенов до кандидата и 1–2 часа ручных тестов
с возможными исправлениями. Итого ориентировочно 19–26 часов / 7,6–10,6 млн
токенов. Основа — текущий темп около 434 тыс. токенов/час и открытые R4 Search,
R5 auth/children, R6 orchestration/backends, R7 Local/children, R9 intake/child
workspaces и R11–R12. Это оценка с существенной неопределённостью, особенно для
Local, фабрики и реального аудио. Ожидание операторской приёмки в прогноз
активных часов не входит. Публикация на GitHub и MacBook rollout не разрешены.

### R0 — План, входные свидетельства и исходное состояние

**Статус: verified-automated.** Зависимости: нет. Результат: этот документ, source hashes,
точные pins и baseline evidence.

- [x] Полностью прочитать все три приложения; сохранить все исходные пункты в
  неизменённых приложениях ниже и дать каждому блоку трассировку.
- [x] Прочитать repo instructions, release workflow, выполнить Good State Alignment.
- [x] Зафиксировать canonical HEAD и чужие untracked изменения.
- [x] Создать локальную `codex/provider-convergence` ветку без смены дерева.
- [x] Проверить GitHub metadata/branch/commit ND. Указанная в ТЗ branch при первом
  connector search не найдена: проверить default branch и SHA, не выдумывать ref.
- [x] Получить read-only source snapshot по полному SHA, без secrets/state;
  сохранить file inventory и diff map canonical ↔ ND. Не исполнять fork scripts
  до чтения кода и review. Никаких install hooks из source snapshot.
- [x] Проверить official docs используемых protocol/CLI/API/capabilities и
  установленную toolchain без чтения приватной авторизации.
- [x] Запустить baseline quality-gate/self-test, native unit, typecheck и memory
  acceptance. Full gate записать один раз; последующие прогоны только после
  изменений/ошибок, которые их оправдывают. Отделить existing failures.

**R0 gate:** source SHA подтверждён, local branch безопасна, исходные результаты
сохранены; чужие файлы не изменены. Rollback: удалить только созданные нами
fixtures/branch после review, не reset/stash пользовательской работы.

### R1 — Сохранность Curated FTS v2 и portable Python

**Статус: verified-automated; isolated и canonical instance retrieval gates passed.** Зависимость R0. Результат: общий поиск для всех профилей.

- [x] Инвентаризировать `pritha_memory_retrieval.py`, `memory-retrieve.py`,
  `memory-retrieval-eval.py`, `memory-retrieval-acceptance.py`, `curated-memory.mjs`.
- [x] Сохранить русскую нормализацию, симметричный глоссарий, веса sections,
  pre-BM25 фильтры privacy/domain/history и явную cosine reduction MiniLM.
- [x] Общий interpreter resolver: explicit supported override, instance venv,
  совместимый legacy/system Python. Проверить paths с пробелами/кириллицей,
  отсутствующий/неисполняемый interpreter и bounded spawn errors.
- [x] `query-memory curated` + search/semantic/stats backward compatibility;
  lexical path не импортирует torch/sentence_transformers и не делает network.
- [x] Сохранить curated `agent-building-knowledge` factory retrieval; ND exact
  passage binding и bounded excerpts переносить точечно на R6.
- [x] Сверить весь октябрьский knowledge pack из A §1.3: два intake, registry
  24 repos/10 accepted-for-review как исторический факт, все signals, шесть briefs,
  reviews MD/JSON, superseded/active decisions, три workflow, failure template.
- [x] Проверить все шесть tests/fixtures из A §1.4; acceptance SHA-256 неизменен:
  `b6e60c6559288cce982770c64e4065f0645a54b4a45b6b724b9fe4d2dce89118`.
- [x] Validate/rebuild memory в изолированном state. После финальных Markdown
  changes обновить authored index и embeddings по принятому workflow.

**R1 gate:** memory validation/rebuild 0 ошибок; оба curated tests pass;
positive Hit@5 ≥80% (историческая цель 45/48), Hit@10 ≥90% (46/48), holdout
Hit@5 ≥80% (23/24), private leaks=0; strict privacy pass. Отдельно warm/cold
latency/RSS без утверждения непроверенного SLA. Rollback — предыдущие code files;
generated indexes воспроизводимы, не коммитятся.

### R2 — Provider schema, presets, identity и migration

**Статус: implemented and automated-verified; live provider acceptance в R12.** Зависимости R0–R1.

- [x] Общий JS provider resolver + typed TS boundary, пять IDs и legacy aliases.
- [x] Bootstrap names отдельно; precedence и invalid-value fail-closed.
- [x] Версионированный runtime-settings schema с per-provider presets;
  migrate native model/effort/timeout без destructive rewrite.
- [x] Namespaced thread/provider/model/session binding, legacy native migration,
  atomic storage, corruption recovery, optimistic revision и validation.
- [x] Capability schema: steer, interrupt, approvals, tools, attachments, usage,
  resume, sandbox, offline, model constraints. UI использует server capabilities.
- [x] Typed provider errors с actionable operator status, без raw upstream body.

**R2 tests:** все 5 preset round trips; precedence env/config/setup/default;
невалидные IDs; corrupt/missing config; два инстанса; switch during active turn;
native history unchanged; exact model resume; no cross-provider fallback.

### R3 — Общий Task Chat facade и native driver

**Статус: verified-automated; shared facade/queue/history, verified PNG и voice files проверены. Live acceptance — R12.** Зависимость R2.

- [x] Извлечь driver types и native adapter вокруг app-server/native-control/
  native-turn-coordinator/goal-control/history-reader; сохранить canonical source.
- [x] Gateway делегирует provider execution и history; общие attachments,
  normalization, idempotency, admission, queue и HTTP errors остаются общими.
- [x] Host queue protocol для всех drivers, exact receipt на uncertain start,
  restart recovery, cancellation lease cleanup, retry-after и queue limits.
- [x] Не смешивать provider sessions в native history; cursor pagination,
  event replay/dedupe, reconnect, archive/rename и approvals проходят binding.
- [x] Контрактные tests драйвера на fake backend до подключения новой сети.
- [x] Завершить image delivery и voice attachment handoff поверх общего store
  и queue receipts (checkpoint 26); Local execution остаётся gated до R7.

**R3 gate:** весь native chat suite; concurrency/double-submit/restart tests;
typecheck; history pagination/quotes/image annotation/scroll не деградировали.

### R4 — NeuralDeep как полноценный adapter

**Статус: verified-automated; transport/history/tools/files/PNG/voice/Search и scoped profile audits passed; реальная авторизация и ручная приёмка остаются R12.** Зависимости R2–R3, подтверждённый ND pin.

- [x] Перенести reviewed transport core `scripts/neuraldeep-codex.mjs`, `scripts/neuraldeep/*`,
  loopback Responses SSE adapter, credential boundary и model capability data.
- [x] Интегрировать admission-coordinator, CLI runner/runtime, voice-queued handoff
  через общий driver; не заменить native gateway ND-only реализацией.
- [x] Сохранить limits/concurrency/Pro/Wallet/requires_wallet gating, bounded
  retries, output budgets, tool receipts, model pin и cleaned process env.
- [x] ND STT/TTS/voice topics подключены через отдельные modules.
- [x] Search Auto через отдельный host module с budgets и source evidence.
- [x] Перенести все relevant ND тесты с provenance, инвентаризировать реальное
  число файлов и subtests; «93» не hardcoded обещание полноты.
- [x] Audit secret leaks и runtime network адаптировать к profiles: разрешённые
  native строки в репозитории не должны ложно считаться ND runtime fallback.

**R4 tests:** SSE chunk boundaries, tool calls, errors, timeout, abort, 429,
concurrent admission, lost response, resume mismatch, wallet restriction,
secrets canaries и запрет внешнего OpenAI/native fallback. ND regression suite
и native suite зелёные в одном tree. Live smoke отдельно от fixtures.

### R5 — Claude Code: runner, decisions, build и child API

**Статус: verified-automated; API lane, native local CLI auth, host MCP, Task Chat, BuildExecutor и child API реализованы. Реальный login и live acceptance — R12.** Зависимости R2–R4 (общие contracts, не ND subscription).

- [x] Проверить current CLI flags/stream schema/SDK terms по official docs,
  локально `claude --version` bounded 5s. SDK не обязателен для CLI runner.
- [x] Instance Keychain для Anthropic; auth modes api-key / local-cli-session.
  Не читать/извлекать OAuth. SDK без допустимого auth → pending-auth.
- [x] `claude-code-runner.mjs`: shell:false, stdin prompt, cleaned env,
  --output-format stream-json --verbose, selected model, bounded max-turns,
  --resume exact session, allowed/disallowed tools и supported permission mode.
- [x] NDJSON parser: bounded buffer, fragmented UTF-8, system/init → thread,
  assistant text → content, tools → activity, tool results by ID. Не раскрывать
  raw thinking/private reasoning; использовать разрешённые summaries/activity.
- [x] Resume mismatch fail before continuing; interruption records unresolved
  tool pairs as cancelled_or_ambiguous_tool_receipt. No fabricated success.
- [x] Usage: fresh input + cache write + cache read + output; cumulative deltas,
  deduped result receipts, total_cost_usd, unavailable usage marked unknown.
- [x] Host-owned PreToolUse guard + durable decision state/approval UI; validate
  cwd/roots/symlinks, protected paths, shell/network, git push/remote, services,
  secret writes. Task hooks cannot approve themselves or overwrite guard files.
  Уточнение по CLI 2.1.296: API lane `--bare` не исполняет hooks. Здесь guard
  выполняется в host-owned MCP handler перед каждым инструментом; built-in
  tools отключены. Нельзя включить `--bare` и одновременно полагаться на hook.
  Shell tool и CLI проходят проверяемую OS sandbox; approvals разрешают только
  конкретный эффект в прежних границах, не отключение sandbox.
- [x] Claude driver supports start/resume/interrupt/queue and honest capabilities.
- [x] `ClaudeCodeBuildExecutor`: probe/execute/recover, disposable worktree,
  standard result schema, protected verifier, isolation check, schema output,
  budgets and ledger. Recover reconstructs status without duplicate start and
  preserves observed model. Adversarial sandbox tests, not only string matches.
- [x] Lightweight fetch Anthropic Messages client for selected child runtime:
  pinned API version, timeout/abort, sanitized errors, bounded output, tool policy.
- [x] Root `CLAUDE.md` with `@AGENTS.md` + narrow Claude rules, YAML frontmatter;
  do not duplicate AGENTS. Sonnet/Opus/Haiku catalog with verified IDs/capabilities.
- [x] Existing `claude-tools-pilot.mjs` offline conformance passed; live single turn
  only through configured authorized credentials. Child pilot through UI later.

**R5 tests:** synthetic fragmented stream, parallel tools/missing receipt, error
max turns, wrong session, model pin, exact cache billing, foreign env removal,
approval replay/race/reject/expiry, protected-file and network escape attempts,
budget exhaustion and crash recovery. Gate does not equate hook with sandbox.

### R6 — Общая надёжность Agents Mother

**Статус: host research и пять зарегистрированных build backends реализованы; regression gate checkpoint 29 проверен, Local offline execution в R7.** Зависимости R1–R5; независимые fixes можно делать раньше.

- [x] Сравнить изменения ND be82911a/49c4a656, dfe92027/9c508ed1/edcb1f85,
  4e395a37/7cae2809/e89b7d5c, 56ef5205/19a37e01/fcb88077 по verified history.
- [x] UTF-8 locale и существующий безопасный ASCII TMPDIR, chmod/ownership,
  кириллический cwd и heredoc regression; no user-specific hardcoded paths.
- [x] Model capability/effort/thinking/output policy per connector; high/xhigh
  constraints validate before dispatch. Native recover retains prior model.
- [x] Host deterministic research с durable checkpoints, total deadline и
  bounded per-source timeouts; exact passages и bounded excerpts сохраняются.
- [x] not-applicable + adoption:none → корректный research gate без allow-pending;
  не обходить остальные contract-specific evidence/synthesis требования.
- [x] init --from-brief генерирует валидный runtime/interface/port/operations;
  валидатор перечисляет допустимые enum без секретного input echo.
- [x] Общая registration execution backends для пяти connectors; runtime/build
  capabilities разные, unsupported isolation не маскировать доступностью модели.

**R6 gate:** factory regression suite; UTF-8/TMPDIR; deadline/checkpoint restart;
contract enums; gate matrix; headless/api/tool-server manifests; native/Claude
recover model pin; output large-file/truncation fixture.

### R7 — OpenRouter и Local

**Статус: verified-automated; OpenRouter, child provisioning и owned Local process проверены. Реальная модель/установка — manual gate R12.** Зависимости R2–R4, R6 contracts.

- [x] Выделить reusable OpenAI-compatible loopback bridge без ND billing/auth
  assumptions. OpenRouter uses fixed upstream and HTTP-Referer/X-Title metadata.
- [x] OpenRouter Keychain + credential API; bounded 5s key/balance probe по
  подтверждённому official endpoint; usage/limit/free tier в normalized DTO.
- [x] Model catalog из проверенного shortlist с manual vendor/model slug;
  исторические пять IDs из C §1.1 сверить, не silently substitute.
- [x] Child credentials drawer: OpenRouter наравне с ND, API key/base URL/model
  только после операторского выбора и проверки child/.env.local boundary.
- [x] Local server discovery Ollama 11434, LM Studio 1234, custom MLX loopback;
  /v1/models, selected model validation, endpoint-specific capabilities.
- [x] Strict offline policy: no cloud fallback/auth/env leakage/web tools/cloud
  voice. Проверка egress процесса и tools; Ollama cloud model не offline.
- [x] Start/resume/cancel/queue/usage follow common driver; capabilities honest.

**R7 tests:** fake HTTP/SSE upstream; credentials mask/error sanitization;
redirect/SSRF/IPv6/invalid URL; unreachable server; no model; cloud model denial;
offline no-egress probes; no remote credential forwarding; child symlink and
wrong-project rejection. Live providers readiness только по реальным probe.

### R8 — Единый пульт Settings и быстрый выбор в Task Chat

**Статус: implemented and locally verified; реальные provider/manual gates входят в R12.** Зависимости R2–R7.

- [x] ProviderConnectorBar ровно из пяти компактных pills: label/status/model.
- [x] Один выбранный settings panel: native CodexAuth/CodexSettings, ND keys/
  limits/wallet, Claude CLI/auth/model/effort, OpenRouter key/balance/model,
  Local endpoint/discovered models. Preserve native transport/routing/tier.
- [x] Per-provider presets не сбрасываются при переключении, stale save не
  перетирает другой panel. Keys не входят в presets/client state persistence.
- [x] New-chat provider/model selector only `ready`; ссылка Configure providers.
  Existing thread показывает pinned provider; active task не меняется.
- [x] Factory phase presets interview/contract/outcome/scaffold/implement,
  Subject=child + slug, admission queue/limits feedback без hidden prompt headers.
- [x] Preserve quote replies, image annotation, stream scroll anchoring,
  activity pagination и release receipts.

**R8 gate:** component/state tests + desktop/mobile Playwright, keyboard/focus,
empty/loading/error states, configured-vs-ready, five independent saved presets,
active-thread switch, native feature regression и no-secret DOM/storage checks.

### R9 — Голос: shared tools и отдельные transports

**Статус: verified-automated.** Shared core, chained transport, persistent topics,
canonical/child workspace routing, file intake и external-provider voice factory
реализованы и проверены. Реальный звук, авторизация и ручная приёмка — R12. Зависимости R2–R8.

- [x] Extract shared voice-tools dispatcher и existing transport boundaries
  небольшими проверяемыми шагами; не переписывать весь runtime одним diff.
- [x] Preserve 9 инструментов: Full Pritha Memory, Inspect Pritha Files,
  Inspect Voice Task, Rolling Summary, Good State Signal, Answer Voice Task,
  Confirm Voice Intake, Web Search, Run Voice Task; capability/privacy checks.
- [x] Native model default `gpt-realtime-2`; options order/default label, Live 1
  Experimental explicit only. Existing live-session/delegation code сохраняется.
- [x] Voice engine Auto/OpenAI/NeuralDeep, resolution по правилам §2. Поддержать
  no-key/both-keys/offline cases; не переключать engine при error.
- [x] ND STT → LLM/tool loop → TTS transport: bounded audio/SSE, private receipts,
  локальные VAD assets, прерывание, browser-owned music/intake tools и usage.
- [x] Persistent topic/task registry и внутренний bridge к общей provider queue;
  restart, idempotency, alias pin и точные operator receipts проверены на fixtures.
- [x] Подключить registry/bridge к публичным voice task tools, карточкам и
  intake: pinned connector, queue/admission, cancellation, child workspace и
  immutable files. Existing native task refs сохраняют исходный маршрут.
  External-provider agent_creation проходит узкий factory_step, отдельные
  Contract/Outcome approvals и canonical research/delivery/Trials (checkpoint 40).
- [x] Связать активный task context и engine/session snapshot так, чтобы изменение
  default connector во время сессии не меняло provider/model существующей темы.
  В Settings обновлять Auto preview после смены task connector без потери edits.
- [x] Проверить browser restart/reconnect, восстановление persistent topic,
  unconfirmed handoff, отмену очереди и ответ на operator decision для каждого
  поддерживаемого коннектора; не считать одного успешного аудиодиалога достаточным.
- [x] Preserve music ducking/manual volume, interruption, reconnect, summaries,
  private Good State capture (без создания task или поддельного UI approval).

**R9 tests:** default/explicit Live; nine tools; transport routing matrix 5×3;
no unintended cloud audio; persisted setting migration; voice-task bindings;
music/duplex/reconnect. Browser mic/audio checks later mark manual evidence.

### R10 — Умный composer: Queue, Steer, Edit, Cancel, Stop

**Статус: implemented; automated native/shared queue gates passed; live проверка в R12.** Зависимость R3; выполнить независимо до всех live providers.

- [x] Textarea/attachments доступны во время running turn; send validation
  различает empty draft, upload in progress, busy request и active turn.
- [x] Enter без Shift и primary button → Queue при active turn, иначе Send.
  Queue request несёт текст, attachment IDs, provider binding, Idempotency-Key.
- [x] Placeholder объясняет Queue и доступный Cmd/Ctrl+Enter Steer; IME composing
  и Shift+Enter не отправляют сообщение; повтор keydown не дублирует dispatch.
- [x] Steer capability + exact expectedTurnId/clientMessageId. С вложениями
  disabled + tooltip, без capability скрыт. Stale turn не превращается в новый.
- [x] Queue cards над composer: status, Edit, Cancel. Revision-checked cancel;
  Edit восстанавливает original text/files только в пустой draft после receipt.
  Проверить draft, изменённый во время await; cancel failure сохраняет всё.
- [x] Stop доступен рядом; no destructive queue cancellation без явного действия.
- [x] Automatic next turn после completion, FIFO, retries/reload/two tabs,
  expired attachments и dispatch-versus-cancel race без потери данных.

**R10 gate:** meaningful behavior tests и Playwright для native steer,
non-steer connector, queue with attachments/edit/cancel/stop/auto-start;
double Enter, lost response, stale revision/turn и mobile composition.

### R11 — Bootstrap, distribution и инструкции

**Статус: unified profiles, private roots/venv, fresh preparation и reviewed demo import проверены; финальный install/upgrade gate в R12.** Зависимости R1–R10.

- [x] Unified PROFILES minimal/local/control-center/control-center-tailscale,
  neuraldeep/claude и явные OpenRouter/Local selectors без конфликта имён.
- [x] Instance-local venv/state/agent parent; provider profile persisted без keys.
  prepareDistributionInstance переносится с isolation regression tests.
- [x] Reviewed `examples/brief-desk-nd`, install-brief-desk и START_HERE/docs
  сохраняются; demo setup локально/идемпотентно, без server autostart и secrets.
- [x] Native и ND onboarding одной codebase; Claude/API/OpenRouter/Local setup,
  pending-auth/offline statuses, external runtime requirements и recovery guide.
- [x] Fresh sandbox install/upgrade from legacy config, no runtime data copied;
  CLI --help, samples, manifests и selected modules coherent.

**R11 gate:** bootstrap dry-run + isolated prepare, dependency/venv resolution,
two-instance isolation, demo scaffold sanity, profile switching, backwards
compatibility и отсутствие long-running processes/credential provisioning.

### R11b — Завершение ребрендинга Techscope → Pritha без потери состояния

**Статус: implemented and locally verified; live migration/manual gate in R12.** Выполняется до R12.
Зависимости: R1/R2 для state identity, R11 для bootstrap/distribution. Контракт
имён и shared resolver можно вводить раньше, чтобы новые adapters не размножали
старую терминологию. Исходные R0–R12 сохраняют номера и объём.

**Оценка:** средний долг по DX/onboarding, низкий прямой эксплуатационный риск
самого исторического имени; повышенный риск некорректной миграции путей. В коде
подтверждены отдельные Node/TS/Python resolvers, CLI/shell entrypoints, setup,
memory rebuild/query/embedding, instance migration и managed-runtime env. Это
не косметическая замена строки. Лёгкая часть — package name и текущие подписи;
основная сложность — единый path contract и upgrade/rollback. Обещания нулевого
риска нет: риск ограничивается additive compatibility, изолированными тестами,
снимком и явной транзакцией переноса.

1. **R11b.1 — Инвентаризация и контракт.**
   - [x] Разделить упоминания на public/current API, внутренний compatibility
     boundary, persisted schema/identity и неизменяемую историю/источники.
   - [x] Зафиксировать canonical имена: `PRITHA_ROOT`, `resolvePrithaRoot`,
     `.pritha-setup.json` для legacy checkout layout, `pritha.sqlite` внутри
     выбранного memory directory и package `pritha`. Внешний state-root уже
     использует нейтральный `setup/setup.json`; его переименовывать не нужно.
   - [x] `TECHSCOPE_ROOT`, `resolveTechscopeRoot`, старые CLI entrypoints и
     существующие файлы остаются compatibility aliases на переходный период.
     Удаление aliases не входит в эту поставку. Старые артефакты, их IDs,
     source URLs, цитаты и ссылки не переписывать массово.
   - [x] Отдельно проверить protocol/schema/table identifiers: переименовать
     только при реальной необходимости с versioned reader/migration; не ломать
     сохранённые foreign keys, citations, retrieval fixtures и историю задач.
   - **Проверка:** versioned inventory/allowlist оставшихся имён с причиной;
     Good State Alignment для memory, setup и instance isolation.
2. **R11b.2 — Единое разрешение корня и совместимость окружения.**
   - [x] Нормализованный explicit `--root` > `PRITHA_ROOT` > `TECHSCOPE_ROOT`
     > Git root > cwd. Два разных непустых env roots — actionable conflict,
     а не молчаливый выбор; explicit root задаёт оба aliases одинаково в child.
     Не существующий явно заданный root не должен переключать экземпляр.
   - [x] Одинаковое поведение Node, TS, Python, shell wrappers, bootstrap,
     setup, CLI workers и managed-runtime manifests; import/export aliases
     используют одну реализацию. Обновить redaction для обоих названий.
   - [x] Новые scaffold/config/examples используют Pritha; при запуске старых
     дочерних entrypoints передавать совместимые env значения одного root.
     `PRITHA_STATE_ROOT` и `PRITHA_AGENT_PARENT` сохраняют границы экземпляра.
   - **Тесты:** neither/old-only/new-only/both-equal/both-conflicting, пробелы,
     symlink/canonical identity, invalid root, explicit root, запуск вне checkout,
     Python/Node parity, два экземпляра и child env без чужих credentials.
3. **R11b.3 — Чтение старых данных и безопасный перенос.**
   - [x] Общие resolvers memory database и setup file вместо разбросанных
     литералов. Fresh install создаёт canonical файл; old-only installation
     читает прежний. Чтение/health/status не переименовывает и не создаёт файлы.
   - [x] При двух разных файлах не выбирать по mtime и не сливать автоматически:
     показать конфликт и остановить запись до явного выбора источника.
     Даже «одинаковые сейчас» копии не должны стать двумя writable truth sources.
   - [x] Подготовить read-only migration plan, private manifest, backup и
     bounded transaction с lock, проверкой source fingerprint и destination
     no-clobber. Повторный запуск идемпотентен; interruption оставляет понятный
     recovery state, а не partly switched paths.
   - [x] SQLite переносить согласованным snapshot/backup API с учётом WAL/SHM,
     integrity check и отсутствия конкурирующих writers; не делать raw rename
     живой БД. Проверить schema, FTS, relations, embedding dimensions/counts,
     semantic status и authored document identities до/после.
   - [x] Setup переносит version/profile/warnings/pointers без secrets в tracked
     report. Проверить permissions, symlinks, path traversal и external state-root.
   - [x] Rollback восстанавливает исходные bytes/path selection из manifest;
     никакого удаления исходного state до успешной приёмки. Проверить startup
     предыдущего кода на сохранённом состоянии без рассинхронизации записей.
   - **Тесты:** fresh/legacy/external layouts, dual-file conflict, corrupt source,
     symlink escape, WAL activity, crash на границах транзакции, retry/rollback,
     одновременные workers, пустая/полная память, unchanged retrieval holdout.
4. **R11b.4 — Внешний вид репозитория и защита от возврата старых имён.**
   - [x] Package metadata, README/README.ru, текущие setup/help/error labels,
     docs, AGENTS и templates описывают Pritha как primary и одну короткую
     compatibility note. Existing historical Markdown и source appendices
     остаются историей; актуальные ссылки на старые filenames сохраняются.
   - [x] Старые executable filenames становятся тонкими aliases к новым,
     если это оправдано inventory; не создавать второй независимый runtime.
   - [x] Guard проверяет новые runtime references вне явного compatibility
     allowlist; не требует нуля `Techscope` во всей истории репозитория.
   - **Проверка:** legacy/current CLI smoke, fresh bootstrap, upgrade fixture,
     typecheck, self-test, strict privacy, docs links, package commands и
     Control Center показывает одну и ту же память/setup/чаты после перехода.

**R11b gate:** новые установки и contributor-facing интерфейс используют Pritha;
старый экземпляр открывается без потерь и молчаливого fallback; migration/rollback
проверены на изолированных копиях; FTS/semantic не регрессируют. На Mac mini
реальный перенос возможен лишь в рамках согласованного staged release без
живых writers; изменения служб требуют отдельного непосредственного approval
по уже действующему workflow. MacBook и GitHub остаются нетронутыми. Снятие
старых aliases отложено до отдельной версии и не мешает завершить ребрендинг
публичных интерфейсов в этой поставке.

### R12 — Полная верификация и локальная ручная приёмка

**Статус: in-progress; активна 3c7c53b / Interactive.** Release и полный
post-activation self-test проходят без warnings/regressions. Claude и Codex
приняты и применены; установленный factory status также возвращает accepted.
NeuralDeep штатно принял точный Outcome, завершил memory/primary-source research
и scaffold. Реальный deliver остановился на preflight до model request:
parent Task Chat sandbox попал в provider preset. В текущей истории учтены
0 build tokens и одна преждевременно начатая итерация; вручную их не сбрасывать.
Изолированный кандидат разделяет эти настройки и не начинает новую итерацию
при отказе runtime probe. Сборка/Trials NeuralDeep и ручная приёмка остаются.
См. checkpoint 76; OpenRouter live отложен пользователем.

**Исторический статус на 2026-11-03: активна 5f38f37 / Interactive. Предварительный ff33d8f отозван
до установки после воспроизведения alias-проблемы нового чата. Его gate:
1514/1514 тестов, восемь групп, 21 same-build browser case, build/typecheck,
5 страниц / 12 JS chunks, проверенный rollback к 5f38f37 и frozen retrieval без
регрессий/утечек. Новый кандидат исправляет alias → exact model ID в preview и селекторе;
его итоговые gate/build/browser и точное lifecycle approval ещё нужны. Native Claude vision ждёт обычного повторного входа после ответа Anthropic
об истёкшей OAuth-сессии. Отдельный реальный Voice/Claude UI factory pilot и
оставшиеся operator/manual gates ещё не пройдены. OpenRouter live отложен.**

Исторический статус перед 5f38f37:

**Статус: in-progress; активен b404a6d. R12 находится на финальной консолидации исправлений и живой приёмке. Claude API, NeuralDeep, native Claude file-tool/resume и SDK MCP проверены. Пользователь завершил вход в чистом экземпляре; его первый реальный file-tool и продолжение диалога прошли 2/2. Пилот счётчика строк принят и применён в основном child checkout 98c3805: 83335/90000 tokens, 5/5 итераций, неизменённые независимые Trials и smoke прошли. Новый кандидат исправляет классификацию бюджетного отказа, передачу guidance, привязку accepted child workspace и диагностику сохранения ключей. Полный gate на 8ebcf405: 1504/1504, все восемь групп pass, без skips; self-test без warnings/regressions. Для Local сохранены прежние 4B-модель и настройки: после сокращения обязательного индекса правил с сохранением полного текста побайтно source-level file-tool/resume прошёл 2/2. Установленная служба ещё имеет профиль Background; новый Interactive подготовлен, но не применён. Сборка, проверки браузера, отдельное точное разрешение на stop/swap/install с откатом, compiled Local и оставшаяся операторская Voice/factory/final acceptance ещё обязательны. OpenRouter live отложен пользователем.** Зависимости все выше.

Исторический статус до последней попытки обновления:

**Статус: in-progress; активирован 3853e0a, post-activation 1445/1445 и strict/operational health passed. Native UI и Claude API проверены живыми запросами; голосовой ответ/прерывание приняты пользователем. Новые auth/model fixes ещё проходят отдельную приёмку. OpenRouter deferred by user; Local/native Claude/full child/final acceptance остаются открыты.** Зависимости все выше.

- [x] Full `node scripts/quality-gate.mjs`, self-test, privacy strict,
  validate/rebuild memory, Curated acceptance frozen fixture, ND security/network
  audits, all provider suites, factory suites, typecheck, production staging build.
- [x] Dependency audit от 2026-11-01: обновить проверяемые patches Next/Sharp/
  Undici и транзитивных browser-mapping/source-map-js, затем production E2E.
  Для sandbox-runtime 0.0.81 upstream использует Zod 3; отдельно проверить
  advisory GHSA-mrhx-c7xc-m3w5 и достижимость oversized collection path:
  sandbox получает только bounded host-authored config, model input не подаётся
  в его schemas. Не подменять несовместимой major-версией без проверки API.
- [x] Playwright desktop/mobile: native history, 5 provider settings, ready-only
  selector, queue/steer, phase presets, attachments/annotation/quotes/activity,
  voice settings, agents credentials. Real auth unavailable → pending-live-check.
- [x] Strict candidate health: /voice, /agents, /task-chat, /codex, /settings,
  same-origin JS chunks, identity/build, admission and operational read-only checks.
  Сначала isolated loopback/fixture state; затем approved production activation,
  exact build/source identity, admission activation и operational read-only gate.
- [x] Sanitized review с changed-file/source map, test commands/counts, failures,
  limitations, schema migration/recovery, no-push proof и manual script.
- [x] Подготовить staged local activation и rollback; только тогда запросить
  непосредственный approval на конкретный managed service action, если он нужен.
- [x] Выполнить разрешённую активацию и offline state migration; сохранить
  предыдущие source/build/dependencies и durable deployment receipt. Не удалять
  recovery-материалы до операторской приёмки.
- [x] Живые проверки Safari/native: старый и новый чат, Queue/Edit/Cancel,
  Steer активного turn, Stop, реальное файловое вложение и reload истории.
  Это технические результаты Codex, а не подмена операторской приёмки.
- [ ] Ручные сценарии на Mac mini: новый/старый Codex chat; Queue/Edit/Cancel/Stop;
  Steer точного turn; переключение presets; ND key/limits/wallet; Claude auth/
  guarded child creation; OpenRouter key/model/child preset; Local без сети;
  Realtime 2 nine tools/music; explicit Live; ND voice; voice→active tasks.
- [x] Пользователь подтвердил на 5f38f37: Realtime 2, факт из памяти и README,
  прерывание, reconnect с продолжением темы, music duck и возврат громкости.
  Эта приёмка не переносится автоматически на explicit Live, ND и фабрику.
- [x] Claude onboarding из чистого экземпляра: одна копируемая команда с
  привязанными root/state, запуск из произвольного cwd, независимость от другого
  экземпляра и ambient credentials, browser sign-in, persisted auth check,
  первый реальный task и resume. Проверить понятное действие при locked Keychain;
  никаких ручных правок путей, копирования OAuth или отключения защиты.
- [x] Реальный Claude CLI child pilot: отдельные Contract/Outcome approvals,
  research→scaffold→deliver→независимые Trials→operator acceptance→отдельное
  применение результата. Измерены 83335 токенов/5 итераций; verifier сохранён.
- [ ] Отдельный end-to-end Voice → Claude Task Chat UI factory pilot по B §5.4:
  interview→contract→outcome→scaffold→deliver/implement, два отдельных approvals,
  утверждённые бюджеты, реальный child и его приёмка. Подготовленные UI-тесты и
  принятый CLI-пилот не доказывают этот пользовательский journey.
- [ ] Зафиксировать операторскую ручную приёмку и оставшиеся внешние ограничения.
  Не закрывать goal пока требуемая работа не завершена; `awaiting_acceptance`
  не равно accepted.

**Final gate:** рабочая canonical Pritha на Mac mini, automated evidence и manual
acceptance. GitHub/MacBook остались неизменны. Subsequent rollout/baseline/push
выполняется только как отдельно разрешённый следующий шаг после этого gate.

## 5. Трассировка: ни один блок исходников не потерян

| Источник и блок | Реализация / проверка | Уточнение |
| --- | --- | --- |
| A §0, ограничения, две цели | R0–R12 | Меняем canonical, ND только source |
| A §1.1 Python/FTS | R1 | Сохраняем существующее и portable resolver |
| A §1.2 CLI/factory passages/deadline | R1, R6 | Function-level merge |
| A §1.3 полный October knowledge pack | R1 | Inventory/hash без дублей |
| A §1.4 fixtures и gate | R1, R12 | Не менять holdout/пороги |
| A §2.1 profile precedence/no fallback | R2 | Пять connector IDs + bootstrap aliases |
| A §2.2 driver facade/UI improvements | R3, R4, R8 | Native canonical history |
| A §2.3 voice/settings | R8, R9 | Последний C задаёт Realtime 2 default |
| A §3.1 locale/TMPDIR | R6 | Shared safe process environment |
| A §3.2 models/effort/output/recover | R4–R7 | Verified capabilities, exact model pin |
| A §3.3 research/checkpoints/from-brief | R6 | Без обхода evidence gate |
| A §4 profiles/demo/docs | R11 | Без изменений других компьютеров |
| A execution §1–5, audits/review | R0–R12 | Local checkpoints, без PR/push |
| B §0 три уровня Claude | R5 | CLI, build, child Messages отдельно |
| B §1 keys/auth/env | R2, R5 | Не читать OAuth, no foreign secrets |
| B §2.1 CLI launch/flags | R5 | Current supported flags, shell:false |
| B §2.2.1 init/session identity | R5 | Exact resume identity |
| B §2.2.2 assistant/tools | R5 | Summary/activity, private thinking не выводится |
| B §2.2.3 tool pair receipts | R5 | Interrupted ≠ successful |
| B §2.2.4 cache/cost accounting | R5 | Delta/deduped usage |
| B §2.3 roots/hooks/decision UI | R5 | Host sandbox + durable decisions |
| B §3 probe/execute/recover | R5, R6 | Honest isolation and budget limits |
| B §4 driver/catalog/voice/CLAUDE.md | R5, R8, R9, R11 | Docs/date/version evidence |
| B §5 unit/security/pilot/UI child | R5, R12 | Fixture/live/manual distinguished |
| C §1 пять connectors | R2–R8 | Ровно пять, без fake readiness |
| C §1.1 OpenRouter key/health/catalog/child | R7, R8 | Official endpoint, explicit child action |
| C §1.2 Local discovery/offline | R7 | Проверять весь egress, не только URL |
| C §2.1 one panel/pills | R8 | Native panels preserved |
| C §2.2 independent presets | R2, R8 | Atomic/revision-aware settings |
| C §2.3 ready-only/pinned threads | R2, R8 | Switch affects new chats |
| C §3.1–2 Realtime 2/Live/nine tools | R9 | Preserve explicit Live selection |
| C §3.3 Auto/hybrid voice/task routing | R9 | Local-private override; no error fallback |
| C §4.1–2.1 available composer | R10 | IME/uploads/requests included |
| C §4.2.2 Queue/Idempotency | R3, R10 | All drivers + race tests |
| C §4.2.3 Steer shortcut/attachments | R10 | Visible disabled if attachment |
| C §4.2.4 Edit/Cancel/Stop | R10 | Revision and no draft overwrite |
| C §5 all acceptance scenarios | R10, R12 | Unit + browser + manual |
| D addendum Techscope → Pritha | R11b, R12 | Primary Pritha names, compatible readers, tested migration/rollback |

## 6. Журнал исполнения и открытые вопросы

| Дата | Этап | Свидетельство / результат | Следующий шаг |
| --- | --- | --- | --- |
| 2026-11-01 | R0 | Прочитаны A/B/C; canonical HEAD подтверждён; alignment aligned; GitHub ND metadata доступна, именованная historical branch не найдена | Проверить pin/default ref, baseline tests |

Открытые вопросы, которые решаются evidence, а не предположением:

- Какой full SHA GitHub содержит полный ND набор из ТЗ, если historical branch
  больше не существует? Не брать данные с MacBook.
- Какие текущие модели/effort доступны конкретным accounts? До probe показывать
  configured/pending-auth, не ready; секреты у пользователя не запрашивать в чате.
- Какой уже существующий host sandbox может обеспечить protected build boundary?
  Если нет — добавить проверяемый adapter либо честно заблокировать опасный path.
- Какие providers реально доступны для live smoke? Авторизованные runtime tools
  используют keys; модель и отчёт не получают их значения.
- Production activation и operator manual tests потребуют последних действий
  пользователя после полной подготовки, а не до написания кода.

### Checkpoint реализации 1

- ND source pin: `2ab22aeff5f1c167c86e925ec30311942b76023b`, release 0.2.0,
  GitHub commit date 2026-09-29. Исторический `12f1547a59297db2f46b68fd9904315d9bdd1ff5`
  также подтверждён. Snapshot включает 961 regular source files; 52 ND test files.
  [Полный inventory и SHA-256](../03_reviews/2026-11-01-provider-convergence-source-inventory.json).
- Исходный self-test в disposable state: pass, 888/888 unit tests, warnings=0,
  regressions=0; typecheck pass. Сервисы не изменялись.
- R1: interpreter resolver подключён к curated/semantic CLI; authored-agent
  walker исключает execution worktrees/nested repos/symlinks. Synthetic regression
  подтверждает отсутствие ingestion чужих checkout. Обычный исходный validator
  до fix сообщил 676 ошибок от recursive state traversal; приватные имена и
  содержимое в tracked evidence не перенесены. Проверка исправления реального
  instance state ещё не объявлена выполненной.
- R1 targeted + R2 schema tests: 21/21. Validation isolated corpus: 774 docs.
  Acceptance fixture hash сохранён; baseline content metrics 45/48 @5,
  46/48 @10, holdout 23/24 @5, leaks=0, warm p95=2.562 ms. Это baseline
  diagnostic report; paired final acceptance ещё предстоит.
- R2: реализован общий pure JS/typed TS контракт profiles/presets/binding/voice
  policy; пока не подключён к storage/UI/drivers. Не считать пять connectors
  уже готовыми к реальному исполнению.
- R9: default Realtime 2 исправлен и в normalizer, и в actual runtime default;
  explicit Live сохраняется. R10: Queue/Steer/Edit/Cancel/Stop реализованы,
  включая attachment restore и receipt recovery; browser gate выполняется.
- Native chat + voice targeted suite: 30/30, typecheck pass.
- Current official evidence: [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits)
  задаёт `GET /api/v1/key`, а не исторический `/auth/key`. [Claude CLI](https://code.claude.com/docs/en/cli-reference)
  подтверждает stream-json, partial messages, permission prompt tool и budget cap,
  который является estimate и допускает overshoot. [Ollama FAQ](https://docs.ollama.com/faq)
  подтверждает отдельный cloud mode и `OLLAMA_NO_CLOUD`; loopback сам по себе
  не доказывает offline. Docs retrieved/verified 2026-11-01, publication dates unknown.

### Checkpoint реализации 2

- R1: весь requested knowledge/test/core inventory сохранён в
  [R1 inventory](../03_reviews/2026-11-01-provider-convergence-r1-inventory.json):
  37 файлов, 6 октябрьских briefs. Core retrieval не заменялся fork-версией.
- Повторные validate/rebuild в disposable state: 774 документа / 7267 chunks.
  Paired FTS acceptance: pass; 45/48 Hit@5, 46/48 Hit@10, holdout 23/24,
  leaks=0, regressions@10=0, warm p95=3.000 ms. Strict privacy pass.
  Команда paired gate (пути задаются оператором):
  `python3 scripts/memory-retrieval-acceptance.py --split all --modes fts --baseline <baseline.json> --check --output <result.json>`.
  Это проверка FTS; semantic/hybrid финальная проверка остаётся R12.
- Реальный instance validator после boundary fix: 676 исходных issues → 1.
  Оставшаяся ошибка — существующие некорректные `subject` metadata private
  artifact; его содержание не переносилось в отчёт и не редактировалось.
  Поэтому реальный instance memory gate пока не объявлен зелёным.
- R2: пять пресетов реально сохраняются в существующем runtime-settings.json.
  Native legacy writer и новый API используют единый atomic store; optimistic
  revision защищает от stale saves, backup/recovery сохраняет повреждённые bytes,
  settings symlinks отклоняются. Native voice/model/tier поля сохранены.
- Race test обнаружил старый дефект file lock: неполная запись владельца могла
  считаться stale. Исправлены initialization gap и сериализация stale recovery.
  Оставшийся после аварии recovery-lock требует проверки оператора; самовольно
  удалять guard file нельзя. Ошибка сохранения не разрешает runtime fallback.
- Full isolated quality gate: pass (environment/privacy/Markdown/rebuild/smoke/unit/Agents Mother/Telegram dry-run). Unit stage 226.808 s.
- Installed toolchain: Node 24.15.0, Python 3.9.6, Git 2.50.1, Codex CLI 0.153.0, Claude Code 2.1.296; bounded version-only probes, без auth reads.
- Targeted Node suite после исправления: 64/64; typecheck pass; diff check pass.
  Composer browser suite: 15/15 desktop/mobile. Settings/API + composer:
  12/12, без skipped/flaky. Production candidate используется только внутри
  isolated E2E harness, managed production service не менялся.
- R10: Enter/Queue, exact-turn Steer, Stop, revision-bound Edit/Cancel, attachment
  restore, reload recovery и draft preservation подтверждены browser tests.
  Проверки для ещё не подключённых drivers не считаются выполненными.
- [Codex App Server lifecycle](https://learn.chatgpt.com/docs/app-server#lifecycle-overview)
  проверен по official fetched docs 2026-11-01: initialize/initialized,
  thread/start/resume, turn/start/steer/interrupt и terminal turn/completed.
  Publication date unavailable. Native history contract сохраняется.

### Checkpoint реализации 3

- Уточнение checkpoint 2: последняя ошибка private metadata оказалась
  ограничением нашего YAML parser, а не некорректным артефактом. Добавлены
  bounded flow mappings/arrays с nested/quoted values, duplicate/prototype и
  depth guards. Private authored bytes не менялись. Реальная instance validation
  теперь pass: 978 Markdown; parser/memory targeted suite 21/21.
- R3: native gateway извлечён без смены источника истории. Общий facade
  маршрутизирует по binding, объединяет pagination и activity cursors, запрещает
  fallback при недоступном коннекторе. Контрактные fake drivers для всех пяти
  IDs проверяют смену default, pagination без пропусков и failure/retry events.
  В реальном registry пока подключён только native driver; остальные не ready.
- R2/R3: новые native chats сохраняют connector/model; legacy model закрепляется
  по подтверждённому resume. Изменение Settings не меняет модель старого чата;
  несовпадающий resume/override отвергается. Runtime view выбранного чата
  показывает его binding. Cross-provider creation receipt ещё предстоит.
- Native/history/goal/driver suite: 67/67; TypeScript pass. Isolated production
  browser harness: 36/36, skipped=0/flaky=0 (queue/steer/concurrency/composer
  annotations/provider settings API). Это автоматические fixture tests;
  операторская manual acceptance и live providers остаются R12.
- Добавлено пользовательское дополнение D и R11b: завершить ребрендинг с
  primary Pritha names, compatibility aliases и проверяемой migration/rollback.
  Ни один этап A/B/C не удалён; реальные state paths пока не переименовывались.

### Checkpoint реализации 4

- R2/R3: durable creation route закрепляет provider/model до dispatch. Потеря
  HTTP-ответа, другой worker и новый default не перенаправляют retry. Explicit
  conflicting provider/model отвергаются; промпты в routing receipt не пишутся.
  Driver/routing tests 6/6; isolated browser concurrency/settings tests 8/8.
- R4: первые reviewed модули перенесены только из GitHub commit
  `2ab22aeff5f1c167c86e925ec30311942b76023b` (NeuralDeep 0.2.0). Per-file source
  SHA и характер адаптации — в
  [R4 adoption inventory](../03_reviews/2026-11-01-provider-convergence-r4-adoption.json).
  Этот inventory фиксирует происхождение; он не объявляет весь fork интегрированным.
- Responses adapter сохраняет normalization, tool completion, UTF-8, backpressure,
  deadlines и usage semantics. Реальный transport дополнительно требует ephemeral
  loopback capability, держит provider key на хосте, разрешает только Responses/
  catalog endpoints и exact upstream origin, не передаёт чужие headers. Raw
  upstream errors/unknown codes/retry headers не возвращаются клиенту. Default
  uncertain request не повторяется автоматически. Source+boundary tests 33/33.
- ND CLI runner работает через принадлежащий попытке supervisor. Clean environment
  содержит только необходимое окружение и локальную capability; HOME/CODEX_HOME
  не смешивают native session store с ND. ASCII scratch/UTF-8, pinned model,
  exact resume, output/time bounds и сохранение scratch при unconfirmed process
  exit покрыты tests. Qwen preset сохраняет requested xhigh, но игнорируемый
  provider effort не выдаётся за действующий параметр исполнения.
- Credential boundary раздельный для NeuralDeep/Anthropic/OpenRouter: env или
  instance-scoped Keychain, metadata-only status, stdin-only bounded write.
  OAuth extraction отсутствует. Реальные credentials при разработке не читались
  и не менялись. Process/env/credential suite 14/14; owned runner suite 4/4.
- Explicit stock-CLI acceptance: Codex CLI 0.153.0 реально запущен на synthetic
  upstream без аккаунтного ключа и paid inference. New session + exact resume
  вернули `FIXTURE_OK`, 2 fixture requests, process trees exited. Команда:
  `node --test tests/acceptance/neuraldeep-stock-cli.fixture.mjs` (1/1).
  Это protocol acceptance; live NeuralDeep quality/billing/limits ещё не проверены.
- Imported history regression suite 18/18: 10 001 turns, >10 MiB Unicode,
  immutable originals, scoped cursors, concurrent receipts, restart и read-only
  audit. Generic provider registry добавляет namespaces/model/session immutability
  для четырёх внешних connectors; 3/3 tests. Native history не переносилась.
- Dependency addition: exact `undici@7.29.1` из verified fork pin и npm metadata
  (Node >=20.18.1, MIT, locked integrity). Install выполнялся с `--ignore-scripts`.
  [Official Undici source](https://github.com/nodejs/undici) проверен 2026-11-01;
  Agent необходим для явных header/body timeouts длинных provider responses.
- Объединённая provider/NeuralDeep foundation suite: 88/88, failures=0;
  после усиления registry immutability отдельный повтор 3/3. Validation в
  disposable state: 774 authored Markdown, pass. Typecheck и strict privacy pass.
  Готовность ND connector в UI пока не объявлена:
  впереди shared admission/queue/events facade, account/model gates и Settings.
  R5–R9/R11/R11b/R12 остаются незавершёнными; MacBook/GitHub/services не менялись.

### Checkpoint реализации 5 — shared external runtime / NeuralDeep integration

- В facade зарегистрирован NeuralDeep driver рядом с native. Общий host runtime
  сохраняет provider/model/effort/timeout/workspace, receipt первого и следующих
  сообщений, полную историю и bounded replay events. HTTP/SSE envelope проверен
  интеграционным test; изменение default не меняет модель и health старого чата.
- Native и external используют один execution coordinator: общий admission,
  managed drain, nested workspace conflicts и ambient resource claims. Отдельные
  provider slots учитывают подтверждённый parallel limit. Native worker не
  пытается исполнять external queue; global activity не удваивает capacity.
- Queue/Cancel/Stop сохраняют exact identifiers и revisions; control идёт к
  владельцу через private IPC. После interrupted/failed/unknown predecessor
  следующий queued message автоматически не запускается. Unknown process exit
  сохраняет claims/scratch. Recovery освобождает claims только после повторного
  доказательства завершения дерева, оставляя прежний запрос interrupted.
- Перед ND resume проверяется readonly native index и session header: private
  home, provider, workspace, session, а при наличии — сохранённая модель. Чужой
  home, symlink, missing proof или mismatch не запускают CLI. Установленный
  Codex CLI 0.153.0 повторно прошёл synthetic new/resume через этот proof (1/1),
  без account key и paid inference.
- Limits/capability/catalog readiness fail closed: отсутствующий can_request
  становится unknown; stale/unknown limits, недоступная модель, непроверенные
  tools и Wallet restriction не дают ready. Night factors повторно не
  применяются. Cache привязан к ключу; public tariff calls идут без ключа.
  Metadata reads имеют timeout/size/redirect bounds; errors не раскрывают body.
- Usage записывается по завершённым provider responses; unknown usage остаётся
  unknown. Read-only summary не создаёт и не мигрирует SQLite. State paths,
  cache, WAL/SHM и attempt journals проверяют instance boundary. Полные protocol
  records остаются private; наружу выдаются bounded views с original-content refs.
- Targeted evidence: shared lifecycle 7/7, owned runner 5/5, account/privacy
  service 5/5, typed API envelope 1/1; предшествующая combined suite 98/98.
  Production fixture build + browser concurrency 7/7; typecheck и privacy pass.
  Full quality gate дал pass для environment/privacy/Markdown/rebuild/smoke/
  factory-inspection/Telegram dry-run; unit branch выявил 9 тестов фабрики,
  загружавших facade вместо выделенного native backend. После исправления
  loader целиком повторён unit suite: 997/997, failures=0; отдельно factory
  Task Delivery 19/19. Python 3.9 compatibility warning остаётся известным.
  Это промежуточная проверка R4; общий final gate и live/manual acceptance впереди.
- Уточнение R5 по [официальной sandbox документации](https://code.claude.com/docs/en/sandboxing),
  проверенной 2026-11-01: встроенная Claude sandbox покрывает shell children,
  но не file/web tools и helpers. `failIfUnavailable` нужен для отказа при
  недоступной sandbox. Guard для файлов/permissions и clean configuration
  проверяются отдельно; hooks сами по себе не считаются OS boundary.
- Это промежуточный checkpoint: R4 voice/search/attachments, R5–R9, R11,
  R11b и R12 ещё требуют реализации/проверок. Unsupported capability явно
  возвращает ошибку; фиктивной готовности пяти connectors нет.

### Checkpoint реализации 6 — Claude protocol и проверяемая host sandbox

- Проверены official CLI/headless/env/MCP и Anthropic API docs 2026-11-01:
  [CLI reference](https://code.claude.com/docs/en/cli-reference),
  [headless](https://code.claude.com/docs/en/headless),
  [environment](https://code.claude.com/docs/en/env-vars),
  [API versions](https://platform.claude.com/docs/en/api/versioning),
  [model catalog](https://platform.claude.com/docs/en/api/models/list).
  CLI установлен 2.1.296; разрешён проверенный 2.1.x >=2.1.286 с нужными flags.
  Новые model aliases разрешаются по account catalog до создания binding;
  runtime требует exact model ID. API child client pinned `2026-10-21`;
  удалённые в этой версии sampling parameters не отправляются.
- `claude-code-runner.mjs`: отдельный private HOME/config/session proof,
  `--bare --restricted --tools ""`, explicit model/session/max-turns, owned
  supervisor, timeout/output bounds, clean env и ASCII `CLAUDE_CODE_TMPDIR`.
  Последняя переменная нужна отдельно от TMPDIR: иначе CLI пишет в общий
  `/tmp/claude-<uid>`. Account key заменяется ephemeral host capability;
  upstream фиксирован Anthropic, чужие headers не пересылаются.
- Proxy ограничивает модель/tools/output, запрещает redirects/CONNECT,
  повтор одного payload и любые повторные provider dispatch после unconfirmed
  ошибки. CLI retries также выключены. Private reasoning/signatures исключены
  из нормализованного journal и UI; наблюдаемые tool starts/results сопоставлены
  по ID, отсутствующий result становится ambiguous, а не success.
- Usage считает fresh/cache-write/cache-read/output отдельно, объединяет
  cumulative snapshots одного message и не складывает aggregate result второй
  раз. Неизвестные и противоречивые counters остаются unknown. Child Messages
  client не исполняет tools; signed reasoning для private same-process
  continuation хранится вне сериализуемого public DTO.
- Host sandbox: exact `@anthropic-ai/sandbox-runtime@0.0.81`, Apache-2.0,
  [official source](https://github.com/anthropics/sandbox-runtime), npm integrity
  зафиксирован в lockfile; install `--ignore-scripts`. Отдельный manager на
  попытку, deny reads by default / allow workspace-runtime paths, protected
  files, bounded writes, network allowlist пустой, только exact capability
  ports. Неподтверждённая платформа или sandbox failure запрещают исполнение.
  На Mac mini реальные OS probes блокируют outside read/write, `.env`,
  `.git/config`, symlink escape и чужой loopback; 3/3 pass.
- Synthetic stock-CLI acceptance: установленный Claude Code 2.1.296 прошёл
  new + exact resume в OS sandbox; 2 mock upstream requests, `FIXTURE_OK`
  дважды, оба process trees exited. Команда
  `node --test tests/acceptance/claude-stock-cli.fixture.mjs` — 1/1.
  Это проверка протокола; реальная модель/оплата/OAuth здесь не использовались.
- Durable approval broker проверен через IPC двух coordinators: exact chat/
  turn/revision, deduped answers, конкурирующие решения, expiry/Stop и ответы
  на конкретные вопросы; 4/4 pass. Он разрешает один эффект, не ослабление
  sandbox. Подключение host tools/UI, local-cli-session lane, build executor и
  Claude driver ещё впереди; этот checkpoint не объявляет R5 завершённым.
  Объединённый foundation suite 24/24, privacy strict pass; дальнейшая интеграция
  потребует нового полного gate.

### Checkpoint реализации 7 — Claude в Task Chat и host tools

- `ClaudeDriver` зарегистрирован в общей facade вместе с native и NeuralDeep.
  Проверка CLI/sandbox и read-only Anthropic catalog предшествует новой задаче.
  Sonnet/Opus/Haiku разрешаются в exact model ID один раз; registry, replay,
  последующие ходы и health сохраняют model/effort/auth preset исходной беседы.
  Неизвестные модели/effort/auth не становятся Ready через fallback.
- Host MCP endpoint живёт только в течение owned attempt: exact loopback port,
  capability token, Host/Origin/method/body limits, фиксированные шесть tools,
  отсутствие CONNECT/forward proxy. Модель не выбирает credential/root/policy.
- `read_file`/`list_files` читают ограниченное окно без private/secret paths.
  `write_file` требует точного content approval и expected SHA-256, повторно
  проверяет файл после ответа, сохраняет executable mode, fsync/atomic rename.
  `run_command` получает argv без shell interpolation, отдельное owned дерево,
  OS sandbox и закрытую сеть. Длинный вывод сохраняется в private receipt и
  читается через `read_result`. `ask_user` использует тот же UI request protocol.
- Operation receipts не позволяют повторить запись/команду после потери ответа;
  изменённый payload с прежним ID отвергается. Shared broker фиксирует answer
  до исполнения, проверяет chat/turn/revision/owner и гасит pending при Stop,
  timeout и подтверждённом recovery. Approval не расширяет sandbox.
- Composite process proof включает CLI и каждую host command. Shared runtime
  освобождает workspace только после подтверждения выхода всех деревьев.
  Unknown coverage сохраняет claim, историю и запрет автоматического replay.
- Найден и исправлен macOS Unix-socket path overflow: provider scratch по
  умолчанию использует короткий системный `/tmp` с instance hash, owner check и
  mode 0700. Никаких user-specific абсолютных runtime paths не добавлено.
- Создан тонкий `CLAUDE.md` с `@AGENTS.md`; hosted `--bare` lane получает явные
  инструкции читать workspace AGENTS и сохранять host guard/Trials/receipts.
- Установленный Claude Code 2.1.296 прошёл две synthetic acceptance проверки:
  exact start/resume; реальные MCP file write и sandboxed command с отдельными
  approvals и двумя process proofs. 2/2 pass; реальных API keys, платных model
  requests и OAuth не использовано. Последний CLI+broker прогон 7/7 pass.
- Production build и Playwright: новые Claude approvals после reload на
  1440/390 px 2/2 pass; предыдущие Queue/Steer сценарии 8/8 pass. Первоначальная
  ошибка нового browser fixture была отсутствующим `requestId` в mock envelope;
  fixture исправлен, product validation не ослаблена. TypeScript clean,
  strict privacy pass, Markdown validation 981 artifacts.
- Полный unit run: 1030 entries, 1029 pass; единственный failure — загрузчик
  `provider-runtime-driver.test.mjs` не имел import stub нового Claude driver.
  Stub добавлен; отдельный повтор всех четырёх routing tests 4/4 pass. Полный
  повтор после этого test-only исправления не делался. R5 ещё не завершён: local-cli-session auth lane, BuildExecutor,
  его budget/recovery/Protected Trials и child scaffold wiring впереди. R6–R9,
  R11/R11b и финальная приёмка R12 сохраняются в полном объёме.

### Checkpoint реализации 8 — Claude BuildExecutor и бюджет на стороне host

- Добавлен `claude-code` executor в контракт и delivery CLI. Перед сборкой
  проверяется связанный Git worktree (отдельный gitdir/common-dir и обратная
  ссылка), exact model из каталога и общий execution lease. Одновременные
  Task Chat/другой delivery не получают тот же workspace или лишнюю capacity.
- Executor использует тот же owned CLI, host MCP и OS sandbox. Protected Trial
  inputs запрещены для write/edit/command; реальные macOS проверки подтвердили
  запрет прямой записи, удаления, hardlink и переименования родителя, сохранив
  возможность писать обычные продуктовые файлы. Добавлен bounded `edit_file`
  с точным SHA и единственным совпадением; всего семь host tools.
- `probe` честно сообщает `goal:false`, `tokenBudget:host-reservation-estimate`.
  Перед каждым платным запросом host вызывает Count Tokens, резервирует estimate
  плюс запас и ограничивает max output. Параллельные запросы сериализованы;
  reservation записывается до dispatch, measured usage — до следующего запроса.
  Unknown response, превышение, ошибка checkpoint или недостаточный остаток
  запрещают следующий вызов; автоматического retry платного запроса нет.
- Уточнение исходника: [официальный Count Tokens API](https://platform.claude.com/docs/en/api/messages/count_tokens)
  и [token counting guide](https://platform.claude.com/docs/en/build-with-claude/token-counting),
  проверены 2026-11-01, API context 2026-10-21: count является оценкой. Поэтому
  это не обещание математически точного hard cap; возможный overshoot измеряется
  и останавливает цикл. Фактические input/cache/output счётчики берутся из
  завершённого upstream ответа, без двойного счёта и без reasoning в ledger.
- Structured summary валидируется host по явной JSON schema. Ошибка формата
  даёт `build_summary_invalid` с сохранёнными usage и receipts, без дополнительного
  платного форматирующего вызова. Независимые Trials проверяют продукт;
  self-report модели не подтверждает готовность.
- `recover` читает сохранённые session/model/usage и проверяет выход всех owned
  процессов без нового запуска. Старый measured checkpoint не заменяет более
  свежий unknown. Сбой первого checkpoint до dispatch сохраняется как not-started
  и освобождает lease; ошибка записи после dispatch требует восстановления.
- Проверки: factory regressions 85/85; последний focused budget/build/stock CLI
  run 13/13. В нём три реальных Claude Code 2.1.296 acceptance сценария на
  synthetic API: start/resume; BuildExecutor с защитой Trials и host budget;
  host tool approvals/ownership. Реальные ключи, OAuth и платные запросы не
  использовались. Предыдущий compatibility run с native executor — 27/27.
- Остались local-cli-session lane, child Anthropic wiring/pilot, R6–R9,
  bootstrap, ребрендинг и полная staged/manual приёмка. GitHub/MacBook и
  запущенные экземпляры не изменялись.

### Checkpoint реализации 9 — Brief, presets и сохранение исследовательских границ

- GitHub подтвердил полные SHA и file lists всех 11 исторических ND commits
  из R6; карта сохранена в
  `03_reviews/2026-11-01-provider-convergence-factory-history.json`. Текущий
  источник по-прежнему exact pin `2ab22aeff5f1c167c86e925ec30311942b76023b`.
  Это карта происхождения; сама по себе она не объявляет все изменения перенесёнными.
- Из ND принят parser Markdown/JSON brief и подход к presets. Каноническая
  реализация сохраняет native `codex-app-server`, отдельные approvals и чистую
  provider-neutral конфигурацию. `--from-brief` и `--brief` принимают одинаковые
  данные; явные CLI fields имеют приоритет. Invalid enums, ports, aliases,
  symlink и чрезмерный/невалидный JSON отклоняются до записи артефактов, без эха
  чувствительного входа. Brief не может подтвердить budget/Contract/Outcome.
- Сохраняются цель, пользователь, критерии, функции, journey, sources,
  constraints, non-goals, permissions и design. API/process получает согласованные
  Start/Stop/health, port variable и выбранный sibling target. `local-feed`
  не навязывает model SDK, аудио или embeddings; `llm-app` требует отдельного
  выбора и provisioning provider, не наследует ключи. Runtime/API/source research
  остаётся обязательным при отказе от repository discovery.
- Brief init получает стабильный fingerprint и file lock. Retry не создаёт
  второй контракт/Outcome и сохраняет авторские правки; изменённый brief для
  того же target требует явной ревизии существующего документа. `--contract-only`
  позволяет затем добавить отдельный Outcome без повторного контракта.
- Перенесены точечные research corrections: registry-only/adoption:none
  не блокируется возрастом advisory metadata, при этом stale warning и запрет
  adoption остаются. Failed/draft/blocked попытки выбираются как lessons;
  один документ не заполняет весь shortlist. Канонические redaction и content
  locks сохранены — удаления этих защит из fork не переносились.
- Focused brief/contract/Outcome run 18/18; research/gates/privacy run 69/69;
  UTF-8 environment run 3/3. Реальный heredoc в кириллическом cwd и process
  snapshot под ru_RU.UTF-8 прошли; scratch существует, ASCII-only, mode 0700.
  `49c4a656` касается fork CLI sandbox с `env -C`; canonical native backend этой
  команды не использует, поэтому несовместимый wrapper не переносился.
- Полный root unit suite после обновления старого hybrid-only ожидания:
  **1052/1052 pass**, 0 skipped. Старый тест теперь также проверяет warning для
  ordinary API advisory lookup; selected repository/adoption gates сохранены.
  TypeScript, strict privacy audit и Markdown validation — pass.
- Октябрьский Claude SDK 0.3.306 custom-tool conformance снова pass (registration,
  MCP initialize/list, valid tool call, private domain rejection). Установка
  зависимостей — только временная, по lock, lifecycle scripts выключены; model
  call/OAuth/key не использовались. Исправлена воспроизводимая команда README:
  cwd workspace и `--workspaces=false` вместо неоднозначного npm --prefix.
- R6 не завершён: exact source passages/checkpoints/deadlines в общей factory
  orchestration и registry всех пяти backends ещё впереди. R5 local auth/child
  wiring, R7–R9, R11/R11b и финальная R12 также остаются в работе.

### Checkpoint реализации 10 — OpenRouter и проверяемый compatible bridge

- OpenRouter подключён к общему Task Chat: отдельный saved preset, history,
  pinned session/model, queue, Stop, общий admission и durable usage. Ключ
  остаётся в host/instance Keychain; CLI получает только одноразовую capability.
  Добавлены общий credentials endpoint и `/api/settings/openrouter-credentials`.
  При сохранённом ключе и неудачном probe API различает эти два результата.
- Исправлен endpoint исходника: account metadata берётся через GET
  `https://openrouter.ai/api/v1/key`, не `/auth/key`. Bounded 5s metadata probe
  сохраняет unknown как null; effective budget имеет приоритет над key limit.
  Public catalog проверен без авторизации: 433 модели, все пять исторических
  shortlist IDs существуют. Provenance и hash — в
  `03_reviews/2026-11-01-compatible-provider-evidence.json`.
- OpenRouter Responses требует полную stateless историю; store/previous response,
  request routing overrides, server tools и remote media отклоняются. Fixed
  upstream, redirects запрещены, timeout абсолютный, платный retry отсутствует.
  Hash отмечается до dispatch; usage receipt записывается до передачи complete
  tool calls. Незавершённый поток и сбой receipt не разрешают выполнить tool.
- Реальный Codex 0.153.0 использует namespace tools. Bridge проецирует только
  семь разрешённых host tools в flat function names и обратно, включая resume
  history; посторонние calls не принимаются. Host MCP сохраняет exact approval
  до write/edit/command. Built-in shell выключен; commands идут через отдельную
  OS sandbox без сети, CLI может писать только в собственные home/scratch.
- SRT 0.0.81 policy для Codex допускает metadata lookup отсутствующего
  `/etc/codex` и использует private TMPDIR. Содержимое прочих system files
  остаётся запрещённым. Изменение profile имеет строгую проверку pinned wrapper
  и не расширяет файловые/сетевые права команд.
- Capability policy различает `default` (без override) и `none` (отключение
  reasoning только при объявленной поддержке). Модели с обязательным thinking
  и без effort knob доступны с собственным default; high/xhigh не выдумываются.
- Local обнаруживает Ollama/LM Studio, принимает explicit IPv4/IPv6 loopback,
  читает native model metadata и обнаруживает cloud aliases. Пока inference
  process не получил проверяемую network isolation, Local остаётся configured
  с `provider_offline_unverified`; localhost сам по себе не означает offline.
  Owned inference boundary и Local runtime acceptance ещё предстоят.
- Проверки: **56/56** focused integration tests, **2/2** installed stock Codex
  acceptance tests на synthetic upstream и реальной OS sandbox; typecheck pass.
  Проверены start/resume, approval, запрет чтения secrets/command egress,
  остановка unknown process, slow request body, failed receipt и namespace calls.
  Настоящие credentials, OAuth и платная inference не использовались.
- R7 child provisioning/Local execution, R8 UI, остальные незавершённые этапы
  и R12 остаются в работе. Runtime на Mac mini, MacBook и GitHub не изменялись.

### Checkpoint реализации 11 — Один Settings для пяти провайдеров

- Добавлены ровно пять компактных вкладок со status/model и один открытый
  provider panel. Native Auth/Settings, transport/routing/tier сохранены;
  OpenAI Voice keys находятся в Voice. ND показывает billing/parallel/wallet,
  Claude — auth lane/model/effort, OpenRouter — catalog/shortlist/budget,
  Local — discovery/explicit endpoint и непроверенную offline isolation.
- Вкладка не переключает действующие чаты. `Use for new chats` доступна только
  после сохранения preset и ready probe. Drafts разных provider panels сохраняются
  при переключении; stale revision даёт конфликт и явную перезагрузку saved
  presets. Поздняя initial загрузка не отменяет уже сделанный выбор вкладки.
- Password input очищается при отправке и смене вкладки. Ключ не входит в
  presets, local/session storage или ответ API. Optional thinking budget/endpoint
  можно явно очистить через null patch без сброса остальных настроек. Пустое
  числовое поле сохраняется как draft до проверки на Save.
- Общий bounded JSON reader ограничивает и credentials, и settings POST: 16 KiB,
  5 секунд, strict UTF-8/JSON. Сбой probe одного provider не скрывает остальных.
  Исправлена интеграционная граница compatible service: сохранённый host sandbox
  проверяется отдельно от model preset, а произвольные поля остаются запрещёнными.
- Проверки: **36/36** composed/unit tests; **7/7** Chromium E2E без skipped/flaky,
  real isolated settings API и browser fixtures без сохранения настоящих ключей.
  Next candidate build/typecheck pass. Desktop 1440px и mobile 390px визуально
  просмотрены; keyboard End/roving focus и отсутствие page overflow проверены.
  Native numeric/transport regressions проходят также на 1280/390px.
- R8 new-chat provider/model selection и factory phase controls, R7 Local/child,
  голос, bootstrap/rebranding и финальная staged/manual приёмка ещё не завершены.

### Checkpoint реализации 12 — Провайдер, модель и reasoning нового чата

- У каждого нового draft собственный provider/model/effort и native service tier.
  Список показывает готовые коннекторы, а настройка остальных открывается по
  ссылке Settings. Read-only preview использует реальный каталог выбранного
  провайдера; неподдерживаемый preset виден как ошибка, без автоматической замены.
- Preview не создаёт тред и не сохраняет глобальные настройки. Поздний ответ
  другого провайдера или draft не меняет текущий выбор. Созданный чат показывает
  закреплённый provider; попытка переопределить его через preview отклоняется.
- Первая отправка фиксирует connector/model/effort/tier вместе с idempotency ID.
  При неизвестном результате и после reload повторяется тот же запрос даже при
  изменившемся глобальном default. Выбор заморожен до разрешения этой отправки.
  Проверка workspace также относится к выбранному коннектору. Вложения остаются
  в draft, если модель их не поддерживает; отправка объяснимо недоступна.
- **20/20** focused unit/integration tests, TypeScript и Next candidate build
  прошли. **50/50** Chromium E2E, 0 skipped/flaky: desktop/mobile provider picker,
  reload/replay, late preview, exact native continuation, queue/Steer/Stop,
  quote replies, image editing, pagination/scroll and concurrent draft delivery.
  Strict candidate `/codex` и JavaScript chunks входят в этот browser gate.
- Проверки используют isolated state и synthetic provider responses; реальные
  ключи, платная inference, GitHub и работающие экземпляры не менялись.
  Factory phase controls и остальные незавершённые этапы сохраняют pending status.

### Checkpoint реализации 13 — Явный контекст фабрики и доступная ёмкость задач

- Subject=child, slug и phase focus задаются отдельными полями нового draft.
  Добавлены interview/contract/outcome/scaffold/implement, а также verify/finish
  из проверенного NeuralDeep source. Фокус описывает текущую задачу; дальнейшая
  host orchestration и enforceable общий factory budget остаются в R6.
- Контекст закреплён за native/external binding и передаётся во все harnesses
  отдельно от authored user text. Native использует developer instructions;
  внешние harnesses получают тот же проверенный host context. История текста
  не переписывается, `phase:` внутри текста не переопределяет выбранную фазу.
  Empty native thread recovery и external resume сохраняют контекст.
- Поля не разрешают выполнение и не заменяют Contract/Outcome approvals,
  research gate, locked Trials или workspace sandbox. Дополнительные поля
  permissions/approved/path отклоняются до driver dispatch; соседний child
  нельзя подставить в существующий тред. Не добавлен декоративный token budget,
  который ещё не контролировался бы host ledger для всех backend.
- UI сохраняет отдельные draft subjects, показывает фазу созданного чата,
  замораживает первый запрос при неизвестной доставке и сохраняет текст при
  невалидном slug. Показаны общая ёмкость задач, очередь, ожидания оператора/
  подтверждения исполнения и известный provider parallel limit; неизвестные
  лимиты не выдумываются. Activity mux устраняет повторные active entries.
- Проверки: **56/56** focused tests, **25/25** Chromium E2E без skipped/flaky,
  TypeScript/Next candidate build pass; **2/2** installed stock Codex + real
  sandbox fixtures. Последние подтверждают передачу factory context через
  настоящий CLI при start/resume и сохранение host-tool sandbox/approval.
  Desktop/mobile screenshots просмотрены, overflow отсутствует.
- R8 закрыт на уровне реализации/UI. Это не завершение R6 factory orchestration,
  R7 offline Local/child provisioning, R9 voice, R11 bootstrap, R11b migration
  или R12 live/manual acceptance. Сервисы, MacBook и GitHub не изменялись.

### Checkpoint реализации 14 — Основное имя Pritha и совместимый корень

- Зафиксирована инвентаризация 111 runtime-файлов на исходном commit
  `e181af23f036a02e1dd06199b2017eeb2afd8b53`:
  `03_reviews/2026-11-01-pritha-rebranding-inventory.json`. Разделены root aliases,
  persisted filenames, environment options, service/entrypoint identities и
  текущие подписи. Исторические артефакты и source appendices не переписывались.
- Общий Node resolver и тонкий TS adapter используют explicit root → PRITHA_ROOT
  → TECHSCOPE_ROOT → Git → cwd. Старый export является alias той же функции.
  Python и shell entrypoints следуют тому же контракту. Разные реальные env roots
  и неверный явно заданный каталог останавливают выбор; Git probe ограничен
  временем и не наследует чужие GIT_DIR/GIT_WORK_TREE.
- Проверяется physical identity, но сохраняется написание выбранного абсолютного
  пути. Это существенно для уже сохранённых research/Outcome ссылок и approvals:
  автоматическая замена `/var` на `/private/var` меняла их identity. Общий прогон
  выявил это, и исправление подтверждено прежними lifecycle tests. Runtime owner
  comparison принимает разные написания одного каталога, сохраняя instance ID,
  process group, cwd, port и service-label проверки.
- При выборе child root передаются обе env aliases; runtime env не может
  переключить явно выбранный checkout. Новый package name — `pritha`, основной
  пример и текущая документация используют PRITHA_ROOT с compatibility note.
  Setup/env writers сохраняют совместимость со старыми дочерними entrypoints.
- Проверки: **1090/1090** полный unit suite; **26/26** Chromium E2E без skipped/
  flaky; TypeScript и отдельная Next candidate build прошли. В полном наборе
  есть root parity Node/TS/Python, fresh/legacy path selection, native receipts,
  исследования/approvals, managed ownership, staged update и rollback fixtures.
  Тестовые загрузчики обновлены для общих модулей; проверки поведения сохранены.
- Это завершает первый пакет R11b, а не всю миграцию. Общие readers для новых/
  старых SQLite/setup filenames, offline migration/rollback, остальные current
  labels/aliases и guard ещё в работе. На реальном экземпляре файлы состояния
  не переносились; сервисы, MacBook и GitHub не менялись. Исходные незавершённые
  R4/R5/R6/R7/R9/R11/R12 сохраняются.

### Checkpoint реализации 15 — Совместимые файлы памяти и setup

- Общий Node reader (также используемый TS) и Python parity contract выбирают
  `pritha.sqlite` / `.pritha-setup.json` на новой установке и существующие
  `techscope.sqlite` / `.techscope-setup.json` на старой. Внешний `setup/setup.json`
  не переименовывается. Read-only resolution не создаёт даже директории; две
  копии блокируют операции, в том числе при одинаковых bytes. Symlink/hardlink,
  неверный тип файла и незавершённая migration barrier дают явную ошибку.
- Подключены rebuild/query/status, curated/semantic/embedding Python entrypoints,
  Good State Alignment, factory memory lookup, Control Center/Voice, setup и
  instance status. Проверены прямые команды вне checkout, с пробелами и внешним
  state pointer. Setup/status загружают только параметры путей. Setup JSON теперь
  атомарно создаётся с mode 0600; persisted schema IDs и прежние поля не меняются
  только ради ребрендинга. Ignore/publication guard включает новые filenames.
- SQLite queries используют read-only open, поэтому запрос отсутствующей памяти
  не создаёт пустую БД. Fresh/legacy rebuild сохраняет document/chunk identities,
  FTS и embeddings. В fixture проверено, что две competing databases не меняются
  ни query, ни rebuild. Текущая память Mac mini прочитана без записи:
  `ok=true`, stats available; setup completed, warnings=0.
- В существующем `pritha-instance migrate` обнаружены только старые имена и raw
  copy SQLite. Он теперь видит обе семьи файлов и делает согласованный snapshot
  через SQLite backup API, проверяет integrity/foreign keys и содержимое таблиц,
  не перезаписывает другую destination DB, сохраняет source. Snapshot является
  самостоятельной БД с DELETE journal mode: исходный WAL не копируется как будто
  это отдельная полноценная база, режим исходника не меняется. Повтор совпадающего
  snapshot сохраняет bytes destination. Перенос данных в другой state-root и
  переименование внутри одного state-root остаются разными операциями.
- Проверки readers: **1101/1101** полный unit suite, **20/20** Chromium E2E,
  TypeScript и отдельная Next candidate build pass. После добавления snapshot:
  **23/23** instance migration/update/rollback fixtures и **3/3** snapshot tests.
  WAL test держит исходное соединение открытым и подтверждает committed rows,
  FTS, relations, binary embedding values и неизменность основного source file.
  Проверены corrupt input, destination conflict, idempotency и обе семьи имён.
- Весь R11b ещё не закрыт: offline переименование текущего state-root с durable
  manifest/barrier, fault injection/retry/rollback и current-runtime name guard
  остаются обязательными следующими шагами. На живом экземпляре файлы не
  переносились. Сервисы, MacBook и GitHub не изменялись; исходная цель продолжается.

### Checkpoint реализации 16 — Offline перенос имён и восстановление

- `scripts/pritha-state-migrate.mjs` предоставляет read-only plan/status и
  explicit apply/rollback. Plan закрепляет source fingerprints и выбор при
  dual-file конфликте. Применение требует тот же hash и `--yes`; path-only env
  loading выбирает экземпляр, не загружая provider credentials в migration worker.
- До записи проверяются execution leases, managed launchd state, port ownership,
  runtime PIDs и открытые исходные файлы. Неизвестный статус службы блокирует
  перенос. Никаких автоматических stop/drain/lease cleanup нет. Read-only план
  реального Mac mini подтвердил `managed_runtime_loaded`, поэтому не готов
  к применению; реальное состояние не переносилось.
- OS lock, private manifest/barrier и проверенные backups обеспечивают recovery.
  SQLite snapshot строится из отдельной рабочей копии всей семьи DB/WAL/SHM;
  неизменяемые backups и исходные retired files остаются. No-clobber публикация
  сохраняет данные, а barrier снимается последним. Повтор продолжает закреплённую
  операцию либо возвращает `already_complete`. Неудачная подготовка также имеет
  понятный status и допускает rollback.
- Rollback восстанавливает исходные имена, bytes, inode, permissions и mtime,
  включая оба исходника dual-file конфликта. Новые записи после миграции блокируют
  rollback. Проверки при recovery отвергают redirects, чужие hardlinks,
  повреждённый manifest и иной instance root. Backup cleanup не выполняется.
- **29/29** Python transaction cases проходят через Node suite: fault injection
  на retire/publish/commit/rollback, реальная аварийная остановка subprocess после
  publication link, незавершённая SQLite working copy, WAL committed rows, FTS,
  relations, binary embeddings, повтор/откат, source changes, locks и layouts.
  **5/5** CLI tests проверяют план, explicit hash/yes, service/lease refusal,
  sanitization и recovery. **20/20** existing reader/runtime tests также прошли.
  Полный unit suite: **1109/1109**, без skipped/failed; Markdown integrity pass.
- Процедура и ограничения описаны в
  `docs/pritha-state-filename-migration.md`; SQLite evidence:
  https://sqlite.org/backup.html и https://sqlite.org/wal.html,
  проверено 2026-11-01, fixture runtime SQLite 3.51.0. Реальный перенос, semantic
  gate установленного экземпляра и ручная приёмка остаются частью R12.
  R11b.4 и исходные незавершённые этапы продолжаются; MacBook/GitHub/services
  не изменялись.

### Checkpoint реализации 17 — Primary имена и compatibility guard

- Внутренние Node/TS callers теперь используют `resolvePrithaRoot`; старый
  export сохранён той же функцией в compatibility boundary. При переименовании
  обнаружен одноимённый wrapper Music config: он заменён прямым re-export, чтобы
  избежать рекурсивного вызова. Test fixtures используют текущий API; отдельные
  legacy alias/parity tests сохранены.
- `pritha-env.mjs` задаёт явную карту старых опций к новым. Telegram, CLI checks,
  Voice, Codex binary/proxy settings читают её; `.env.example` и setup writer
  используют primary имена. Новое явно заданное значение, включая пустую строку
  и `0`, имеет приоритет, поэтому старый alias не включает отключённую возможность.
  Root conflict policy остаётся отдельной и более строгой. Helper не пишет env
  файлы и не добавляет credentials в subprocess environment.
- Новые `pritha-web.mjs`, `pritha_web.py`, `run-pritha-web.sh` и
  `run-pritha-telegram-bot.sh` содержат реализации. Четыре старые точки входа
  только делегируют выполнение; Node/Python old/new smoke проверяют один Pritha UI
  из изолированного root без создания памяти. Убран machine-specific host из
  web wrapper: default loopback, explicit HOST сохраняется. Установленные службы
  и существующие service labels не переименовывались.
- Текущие CLI/UI labels, intake prompts, report generator, README, AGENTS и
  библиотечная документация используют Pritha. Новый audit template сохраняет
  ссылки на реальные исторические workflows. Operations manifest описывает
  существующий managed Control Center contract и explicit lifecycle approval;
  не содержит команд автоматического запуска legacy Telegram/web служб.
- `config/pritha-name-compatibility.json` фиксирует 115 reviewed line hashes для
  124 оставшихся references: aliases, persisted schemas/files, reserved identities,
  legacy service recovery и сам guard. `scripts/check-pritha-names.mjs` включён
  в golden checks. Новая, перемещённая или дублированная строка вне allowlist
  блокирует проверку; историческая authored memory не переписывается и не входит
  в runtime scope. Каждое исключение имеет причину.
- Targeted env/guard/old-new web/safety tests, TypeScript, strict privacy и
  Markdown validation прошли. Общий unit suite: **1115/1115**. Chromium E2E:
  **28/28** Task Chat history/archive/attachments и **14/14** Settings/provider
  selection/Voice; без skipped/flaky. Next candidate builds прошли отдельно
  от live production. Rebranding snapshots изменены только для намеренного
  `<PRITHA_ROOT>` redaction placeholder; остальные scaffold bytes сохранены.
- Browser gate выявил и устранил ошибку R8: старый model catalog мог не содержать
  capability arrays, а возврат после archive к новому черновику обращался к
  отсутствующему `effortIds.length`. Теперь неполные данные скрывают неизвестные
  controls без падения страницы. Исходные archive/restore/upload tests прошли
  повторно. В `.env.example` удалены дубли ключей: current `exec` сохранил
  приоритет над старой `queue` опцией; placeholder path не стал default значением.
  Проверка уникальности ключей предотвращает повтор этой ошибки.
- Реальное переименование данных и R12 acceptance не
  объявлены завершёнными; остальные этапы исходного roadmap остаются в работе.

### Checkpoint реализации 18 — Общий голос и NeuralDeep audio transport

- `realtime/core/voice-tool-definitions.ts` содержит те же девять схем и optional
  music tool; `voice-tools-dispatcher.ts` сохраняет имена существующих tools и
  принимает нейтральные task aliases. Хостовые handlers сохраняют privacy,
  approvals, memory/files и voice-confirmed Good State behavior. Инструмент,
  завершивший действие при прерывании речи, возвращает свой настоящий receipt.
- Realtime 2 стал единым default для runtime, Settings, Voice page и env example.
  Явно сохранённый Live 1 остаётся отдельным протоколом с прежней delegation.
  Auto/OpenAI/NeuralDeep сохраняются с revision check; Local + Auto отключает
  облачный голос. `PRITHA_VOICE_OFFLINE=1` блокирует cloud audio независимо от
  saved choice. OpenAI session/call routes проверяют engine до provider I/O;
  ошибки ключа или движка не переключают звук к другому сервису.
- Settings показывают параметры выбранного голосового движка; NeuralDeep voice
  и language сохраняются отдельно от OpenAI voice/model и пяти task presets.
  Chained settings отвергают unknown fields и coercion. Runtime reads получают
  preferences и revision из одного сохранённого документа.
- Из GitHub NeuralDeep на закреплённом `2ab22aeff5f1c167c86e925ec30311942b76023b`
  перенесены audio/SSE bounds, STT/LLM/TTS, session events, tool loop, browser
  transport, voice journal и поведенческие tests. Provenance с source hashes:
  `03_reviews/2026-11-01-neuraldeep-voice-adoption.json`. Credentials берутся из
  общего instance-local boundary; origin фиксирован, redirects и replay запрещены.
- Voice receipts используют canonical ExecutionCoordinator database. HTTP leases
  учитывают общую ёмкость и те же NeuralDeep account slots, что Task Chat. Они
  освобождаются до tools/TTS следующего шага. Metadata preflight для прямого
  голосового HTTP не требует Codex CLI, но сохраняет account/model/tool gates.
  Drain и abort повторно проверяются после async metadata read.
- Аварийный HTTP owner восстанавливается только при доказанном завершении его
  процесса: receipt остаётся interrupted/unknown, запрос не повторяется. Только
  lease с host-owned `executionKind: voice-http` подлежит такому восстановлению;
  native/provider CLI owners требуют прежнего process-tree proof. Изменение
  journal и освобождение ёмкости выполняются в одной SQLite transaction.
- Клиент использует локальные VAD/ONNX assets из pinned dependencies, хранит
  аудиофрагменты с прежними bounds, поддерживает mute/interruption/reconnect и
  manual decision для длинного retained draft. Серверные tool receipts проходят
  через существующую UI обработку без повторного вызова tool endpoint. Music
  ducking получает assistant stream; TTS не воспроизводится вторым audio player.
- Browser gate обнаружил пропущенную подготовку VAD в изолированном E2E builder;
  генерация assets теперь обязательна и там, и в обычном build/dev. Исправлены
  OpenAI-only key indicators и последний Live 1 fallback на Voice page. Assets
  являются generated/ignored, а не tracked binary snapshots.
- Проверки: targeted transport/session/journal/host tests, TypeScript и strict
  privacy прошли. Chromium **9/9**: settings persistence/conflict, отсутствие
  microphone/cloud calls при offline/missing key, локальный VAD без OpenAI key,
  дедупликация host receipts, Live/Realtime protocols и default/explicit models.
  Полный unit gate: **1152/1152**, без skipped; дополнительно **3/3** новых
  admission host tests (capacity/drain/race), добавленных после запуска suite.
  Markdown validation: 986 файлов; strict privacy audit и name guard прошли.
- Dependency audit после добавления pinned VAD/ONNX/Ajv не выявил новых advisory
  для этих пакетов; прежние Next/Sharp/Undici/source-map/browser-mapping/Zod/SRT
  замечания остаются открытыми в R12. Не выполнялся `audit fix --force`.
- R9 остаётся незавершённым: external task binding/topics/queue/operator routing,
  NeuralDeep search integration и ручные microphone/speaker/provider проверки
  ещё впереди. Никаких paid provider calls, установки candidate в live service,
  изменения реальных state filenames, MacBook или GitHub не выполнялось.

### Checkpoint реализации 19 — Persistent topics и общий backend bridge

- `scripts/lib/voice-topic-bindings.mjs` хранит topic/task identity в той же
  private SQLite database, что canonical ExecutionCoordinator. Topic фиксирует
  instance, subject, generation, connector, preset, client thread/message IDs,
  chat и provider session. Opening/reconcile не выполняет inference или restart.
- Последующая задача той же темы использует закреплённые настройки. Смена
  коннектора для новой задачи создаёт следующее generation; explicit continuation
  требует точного старого topic/generation/provider. Reset никогда не затирает
  историю; после 999 generations возвращается ошибка вместо повторного ключа.
- `VoiceTaskBridge` передаёт start, queue, stop и operator answer в существующий
  Task Chat backend. Сохраняет hash исходного запроса, CAS revision и durable
  dispatch fence до обращения к backend. Потерянный ответ сверяется с canonical
  history receipt; отсутствие доказательства оставляет unknown без повтора.
- `provider-voice-task-backend.mjs` использует уже общий ProviderTaskRuntime для
  NeuralDeep, Claude, OpenRouter и Local. Voice origin задаётся отдельным host
  argument, не полем HTTP/model payload. Общими остаются admission, sandbox,
  workspace, FIFO queue, predecessor checks, process proof и broker approvals.
- Внутренний API Gateway предоставляет этот adapter. Реальные внешний voice
  entry point, карточки, intake и ручные тесты ещё не переключены: временный
  guard checkpoint 18 остаётся до завершения их сквозной интеграции. Native
  voice workflow сохраняется. Это проверенная часть R9, не завершённый R9.
- Provider alias разрешается при создании chat один раз: topic отдельно хранит
  requested preset и resolved model. Retry/restart использует сохранённую точную
  модель; меняющийся default/alias target не влияет на продолжение темы.
- Переосмыслены механизмы закреплённого NeuralDeep source: topic store/routing,
  task links, queued handoff и operator service. Source hashes и причины адаптации
  добавлены в `03_reviews/2026-11-01-neuraldeep-voice-adoption.json`. Отдельный
  NeuralDeep coordinator, копия execution history и JSON registry не создаются.
- Проверки включают два конкурирующих процесса, restart, чужой instance/schema,
  generation exhaustion, смену коннектора/модели, lost acknowledgement, exact
  queue cancellation, поздний stop, stale question и voice→typed continuation.
  Все provider calls синтетические, с реальными локальными store/queue/runtime.
  Targeted backend/topic/bridge regression: **41/41**. Общий прогон: 1184
  passed, 1 failed — test loader не знал новый module import; он исправлен,
  весь gateway/driver блок повторно прошёл **10/10**, включая дополнительный
  pinned voice dispatch test. Не заявляется новый единый all-green full run:
  следующий общий gate будет выполнен после public voice wiring. TypeScript,
  Markdown validation (986 файлов), name guard и strict privacy audit прошли.

### Checkpoint реализации 20 — Public voice task wiring (verified-automated)

- Voice task entry point сохраняет выбранный connector; explicit continuation
  берёт connector из исходной задачи. Новый внешний run не выполняет native
  availability probes и не имеет native fallback. Native карточки продолжаются
  прежним путём независимо от нового default.
- Прежние handoff confirmation и UI approval для записи сохранены. Provider
  task резервируется без inference; публичные start/approve используют stored
  dispatch request и общий backend bridge. Подготовка отклоняется до создания
  task directory при invalid preset, неподдержанном child workspace/file intake.
- Workspace policy включена в topic identity: read-only и isolated write имеют
  разные generations; explicit continuation не может расширить права. Request
  не может подменить workspace. Создание одного topic chat детерминировано даже
  при двух разных задачах с разными заголовками, пришедших одновременно.
- Server router проецирует фактические provider history/queue/operator receipts
  в прежние Voice task карточки. Timeout heuristics native runner не могут
  объявить внешнюю задачу завершённой. Provider task link открывает точный chat.
  Drawer показывает connector, а вопрос исполнителя содержит exact request ID,
  revision и topic generation для безопасного ответа.
- Stop направляется точному turn/queue receipt; запись о requested stop не
  заменяет backend proof завершения процесса. Answer для одного user-input
  вопроса сохраняет первоначальный контекст; повтор после потери acknowledgement
  возвращает сохранённый результат. Command approval или несколько вопросов
  требуют существующего structured UI в Task Chat.
- Полный unit gate прошёл **1201/1201**. Последующий review добавил защиту от
  approve/abort race, structured errors ответа/отмены и явный readback blocker
  при недоступных operator requests. Итоговый текст берётся из authored history,
  включая ответ за пределами последней страницы tool activity; bounded excerpt
  помечается как truncated. Дополнительный targeted gate прошёл **26/26**,
  topic/bridge/name regression — **28/28**. Native/shared-tool regression ранее
  в этом checkpoint — **55/55**, workspace/topic/backend — **33/33**.
- Chromium gate прошёл **10/10**, без skipped/flaky: new Local voice task,
  сохранение его provider после смены default, явный недоступный endpoint и
  реальная карточка; voice engines, models, mocked speech/disconnect. Два
  исправленных тестовых ожидания: unreachable endpoint даёт provider_unavailable,
  а desktop locator должен исключать скрытую mobile-разметку.
  TypeScript и isolated browser build, strict privacy, name guard (124 допустимых
  исторических ссылок), Markdown validation (987 файлов) прошли. Live
  process/state не менялись; платные вызовы не выполнялись.
- Pending R9: child-agent workspace routing, verified intake file delivery,
  task-chat task links/index, connector/engine session snapshot и Auto preview,
  ND search, browser restart/reconnect и ручная microphone/provider проверка.

### Checkpoint реализации 21 — Voice links и Settings Auto (verified-automated)

- Task Chat строит voice links из canonical topic/task bindings и реальных
  execution/history/queue receipts. Index хранит только ссылки и может быть
  восстановлен после restart; открытие карточки не повторяет запуск. Readback
  показывает завершение, отмену, blocked queue и uncertain execution, сохраняя
  точный исходный provider. Внешняя задача без chat не ищет native fallback link.
- Смена task provider обновляет Auto voice preview на той же странице Settings.
  Несохранённые voice/timbre/language edits сохраняются, document revision
  обновляется при независимом изменении. Concurrent voice change сохраняет draft
  и блокирует overwrite до явного Reload saved voice settings.
- Targeted gateway/topic/queue/readback tests **33/33**; TypeScript passed.
  Chromium Settings/voice gate **10/10**, без skipped/flaky, включая desktop/mobile,
  Auto preview, draft сохранность и конфликт revision. Общий unit gate прошёл
  **1206/1206**, без skipped. Strict privacy, name guard (124 разрешённых
  compatibility references) и Markdown validation (987 файлов) прошли.

### Checkpoint реализации 22 — Session snapshot (verified-automated)

Private host context подключён к обоим session transports, native call/config
endpoints и общему tool dispatcher. Порядок реализации и проверки:

1. Immutable host-created session context в существующей private SQLite:
   task connector/preset, voice engine/protocol/model/timbre и native service
   tier; owner, instance, expiry, bounded capacity и закрытие. В нём нет
   transcript, credentials и собственной execution queue.
2. Native и NeuralDeep session creation создают context; браузер передаёт только
   opaque ID вне model tool arguments. Wrong owner, expired/missing context
   возвращают явную ошибку без переключения на текущие defaults.
3. Shared tool host берёт task selection из context; explicit continuation
   сохраняет исходную task/topic identity. Native model/effort/timeout/tier
   закрепляются в task request и применяются после UI approval/queue/restart.
   Existing native thread binding остаётся приоритетным.
4. NeuralDeep каждый HTTP attempt проверяет закреплённый engine и актуальный
   hard offline/admission запрет. Изменение default provider/voice preference
   само по себе не переключает существующий transport. Native startup сохраняет
   protocol/model; incompatible startup race требует reconnect.
5. Tests: restart/owner/expiry/schema/capacity/secret rejection; task preset после
   изменения defaults; OpenAI/ND tool path; no implicit cloud fallback; disconnect
   cleanup, browser reconnect и сохранённая native voice/music regression.


- Native и ND сохраняют provider/preset и audio settings до асинхронного startup.
  Native task request удерживает model/effort/timeout/service tier после Approve,
  очереди и явного/автоматического продолжения; текущие security настройки
  по-прежнему применяются. Legacy tasks без snapshot сохраняют совместимость.
- Context закрывается при disconnect, rejected startup и устаревшем ответе
  session creation; истечение времени ограничено шестью часами. События и
  оставшиеся tool calls старой сессии не переходят в новую после reconnect.
  ND Music переключает собственный context endpoint без OpenAI config request.
- Targeted store/host/public/config/native regression tests **37/37**; TypeScript passed. Chromium
  voice/models/settings **14/14** и public provider route **1/1**, без skipped/flaky.
  Проверены native/Live startup, reconnect с задержанным tool receipt, stale
  event, ND local VAD/music, независимые drafts и Auto preview. Общий unit gate
  дал **1217/1219**: оба failures — прежние regex assertions на изменившийся
  синтаксис вызова/config. Config assertion заменён исполнением реального
  builder с pinned/default моделью/голосом; route assertion учитывает host
  argument. После исправления целевой набор **37/37**. Совокупный полный rerun
  завершён в checkpoint 23: **1223/1223**, оба исправленных tests зелёные. Privacy/name/Markdown gates прошли
  (124 compatibility references, 987 Markdown files).

### Checkpoint реализации 23 — Live agent memory fallback (verified-automated)

При чтении R11 обнаружен ранее существовавший fallback: checkout без `.git`
направляет новые live agent artifacts в `11_agents/`. Это нарушает AGENTS и
делает поведение ZIP distribution отличным от Git checkout. Исправление:

1. Общий resolver всегда выбирает `<state>/agents` при external state, иначе
   `.private/agents`, включая ZIP/non-Git root. Tracked history остаётся источником
   authored reference knowledge и не переносится автоматически.
2. Проверить Git/non-Git/worktree, совпадающий state-root через symlink и два
   независимых экземпляра; validate/rebuild и factory fixtures используют
   явно выбранный private layout. Не ослаблять runtime boundary ради fixtures.
3. Targeted paths/factory/state tests, общий unit gate, name/privacy/Markdown
   validation. Реальные private contracts, registry и рабочие сервисы не менять.


- Resolver исправлен; targeted paths/catalog/outcome/CLI tests **63/63** и
  GitHub fixture research/scaffold tests **21/21**. Legacy fixture paths заменены
  private paths без изменения research, approval или sandbox gate. Проверено
  чтение исторического контракта с записью нового Outcome только в private root,
  а также исключение tracked history из live catalog non-Git distribution.
- Good State Alignment: aligned с instance isolation и canonical history.
  Markdown/privacy/name guards прошли. После исправления 13 fixture expectations
  на прежний `11_agents` layout полный unit gate прошёл **1223/1223**, без skipped.
  Этот прогон также закрывает cumulative gate checkpoint 22.

### Checkpoint реализации 24 — Voice intake context (verified-automated)

1. Передавать opaque host context из callback активного разговора при spoken
   confirmation. Не брать provider/model из model arguments или изменившихся
   глобальных Settings. Общая owner cookie для доступа к host context работает
   с OpenAI и ND; ND audio session сохраняет собственный owner/transport.
2. Intake endpoint проверяет context/owner/expiry/hard offline до чтения файлов
   и передаёт immutable task selection в общий run-task. Missing/closed/foreign
   context требует reconnect без fallback или запуска другой модели.
3. Ограничить multipart body и проверять count/per-file/total до выделения
   дополнительных buffers. Прежние confirmation/retention/approval boundaries
   сохраняются; неподтверждённый attachment transport остаётся явным blocker.
4. Проверить native/ND, пять task connectors, смену defaults, wrong owner,
   закрытие сессии, malformed/oversized payload и отсутствие task/staging при
   отклонении. Browser test подтверждает передачу host context вне model args.
   Durable intake replay и проверенная доставка originals входят в последующий
   общий attachment этап; этот checkpoint сам по себе их не объявляет готовыми.

- Реализовано для OpenAI и ND: оба транспорта используют общий private owner
  для host context; отдельная ND audio identity сохранена. Context ID приходит
  из browser callback в HTTP header, поддельный model argument его не заменяет.
  Смена defaults не меняет provider/preset при подтверждении материала.
- Закрытие разговора отменяет ожидающее подтверждение и оставляет draft/files
  в композере. Context проверяется до чтения body и повторно после upload.
  Bounded streaming multipart: 25 MiB originals + 1 MiB framing, 30 s deadline,
  8 файлов, 10 MiB на файл, declared/actual length, count и bytes согласованы.
  Отказ не создаёт задачу/staging и не удаляет originals. External file transport
  пока возвращает `provider_attachments_unverified` до отдельной проверки.
- Targeted host/public/session/native tests **43/43**, TypeScript passed;
  isolated Chromium **10/10**, без skipped/flaky. Проверены forged context,
  оба audio transports × пять task connectors, закрытие во время upload,
  oversized streamed body/cancellation, позднее подтверждение после disconnect.
- Полный unit gate **1231/1231**, без skipped. Strict privacy, name guard
  (124 compatibility references) и Markdown validation (987 files) прошли.

### Checkpoint реализации 25 — Общие originals и подготовка attachment delivery (verified-automated)

1. Адаптировать reviewed ND immutable store из pinned GitHub в общий модуль;
   native API и прежние IDs/hrefs сохраняются. Прежняя canonical metadata без
   version читается после строгой валидации; новые записи versioned. Не выполнять
   массовый перенос или перезапись существующих private файлов.
2. Один cross-process quota/reference mutex для обоих callers, bounded streaming,
   pending publication receipt, hash и descriptor identity, symlink/hardlink
   rejection, recovery только после доказанного завершения owner. Corrupt
   metadata сохраняется для восстановления; referenced originals не истекают.
3. Подготовить проверенные private dispatch snapshots отдельно от originals;
   native metadata/path check и неизвестный dispatch receipt остаются обязательны.
   Readback/queue Edit возвращают публичные metadata, без private paths.
4. Проверить старую metadata, fresh store, два процесса/два instance, quota,
   partial publication/retry, modified bytes, links, expired drafts, retained
   originals, snapshot isolation, native image/file/history/replay regression.
   Переносимые source tests фиксируются в adoption inventory с исходным hash.
5. После store gate: общий provider queue attachment preparation/retention и
   readback, затем отдельные verified delivery paths ND/Claude/compatible.
   Проверка транспорта привязана к точным model/CLI/adapter capabilities;
   недоступные capabilities остаются явными. Голосовой file intake и durable
   replay используют тот же store/receipts, без второй очереди и скрытого fallback.

Good State Alignment для этого этапа: aligned. Сохраняются canonical native
history, отсутствие повторного turn после unknown receipt, instance privacy,
точные files и сохранность draft; production lifecycle не меняется.

- Canonical и ND wrappers используют один `ImmutableAttachmentStore` и тот же
  storage path. Сохраняются старые metadata без version, href/ID и uppercase ID;
  read-only доступ не переписывает metadata. Явный state-root alias допустим,
  symlink/hardlink внутри private storage и неизвестная version отклоняются.
- Cross-process SQLite mutex объединяет quota/reference accounting. Exact
  upload replay проверяет hash без второй копии и работает при исчерпанной
  квоте. Abort/stall снимает только собственную блокировку; partial publication
  восстанавливается по receipt без замены чужих bytes. Corrupt originals дают
  отдельную typed error и сохраняются для восстановления.
- Download отдаёт уже проверенный descriptor, а не повторно открытый путь.
  Private dispatch snapshots проверяют hash, повторно используют только точную
  копию и не могут попасть вне state-root или поверх originals. Их дальнейшее
  подключение к provider dispatch и lifecycle cleanup входит в checkpoint 26;
  native delivery/history/reconciliation не переключались на новый protocol.
- Source adoption фиксирует общий модуль и **9** перенесённых behavioral tests
  из pinned ND GitHub; дополнительная canonical suite проверяет legacy/alias,
  multi-process quota, abort, snapshots и настоящий download route. Совокупно
  targeted **50/50**, TypeScript passed. Browser composer/queue **28/28**;
  настоящий isolated attachment API **1/1**, включая точные bytes, Unicode name,
  MIME sniffing, conflict/replay и missing ID. Первое API assertion ожидало ровно
  `no-store`, тогда как proxy добавляет max-age/must-revalidate; проверка уточнена
  до обязательного no-store directive, сам cache policy не менялся. После alias
  дополнения actual API/build повторно прошли. Live credentials не использовались.
- Полный unit gate **1247/1247**, без skipped; итоговый targeted rerun покрывает
  alias/uppercase совместимость. Strict privacy, name guard (124 references)
  и Markdown validation (987 files) прошли. Services, MacBook и GitHub не менялись.

### Checkpoint реализации 26 — Provider queue attachments и delivery (in-progress)

1. Разделить проверку attachments при enqueue и подготовку dispatch: до принятия
   сообщения проверить immutable IDs/bytes/limits и конкретный transport; до
   публикации queue receipt удержать originals. Queue readback восстанавливает
   metadata через общий store; потерянный файл блокирует Edit/dispatch, но не
   скрывает сообщение и не удаляет его текст.
2. Queue идемпотентна по полному input; receipt содержит hash originals для
   повторной проверки перед dispatch. Attachment-only сообщения допустимы;
   exact repeats не запускают повторную проверку, способную изменить уже
   подтверждённый результат. Admission/revision/FIFO/unknown fences сохраняются.
3. Подключить адаптеры с host-owned capability evidence: ND CLI initial/resume,
   Claude host tools и compatible bridge. Различать файлы и изображения;
   metadata alone не доказывает транспорт. Учитывать исторические image inputs,
   exact model/CLI/adapter pin, encoding limit, request fingerprint и snapshots.
4. Проверять source/hash перед launch, manifest/path policy и cleanup только
   после подтверждённого завершения process tree. Unknown receipt сохраняет
   копии, originals и блокировку повторного execution. Credentials/production
   model calls не нужны для deterministic transport fixtures.
5. Проверки: Queue+Edit+Cancel+Stop+auto-start с файлами на каждом поддерживаемом
   connector, reload/two workers, expiry, stale revision, model/policy change,
   unsupported modality, interrupted publication, initial/resume bytes и
   отсутствие автозапуска/извлечения приложенного executable/archive. Затем
   подключить voice intake к тем же receipts, включая повтор spoken confirmation.

Промежуточный результат 26a (verified-automated):

- Общий provider runtime принимает attachment-only input, сохраняет SHA-256 и
  metadata originals в private receipt/history и удерживает файлы до принятия
  queue/turn receipt. Queue readback сверяет текущие bytes и metadata; недоступные
  вложения явно отмечены, текст и идентичность сообщения сохраняются.
- Перед dispatch повторяются integrity и transport checks. Queue handoff требует
  точного request hash и состояния dispatching; потерянный acknowledgement
  возвращает существующий receipt без повторного запуска. Исторические image
  inputs требуют capability check и при последующем текстовом resume.
- Общий API store используется внешними gateway; private hashes исключены из
  публичного DTO. Проверены reload/two workers, retained originals после draft
  TTL, Edit/Cancel CAS, FIFO auto-start, policy change, подмена/удаление/retagging,
  attachment-only turn и Stop во время подготовки snapshot.
- Фактические адаптеры пока не включают attachment capability. Tests используют
  synthetic transport и настоящий общий store; это доказывает queue foundation,
  но не доставку файлов или изображений в installed provider CLI. Пункты 3–5
  (реальный transport, lifecycle cleanup, voice intake) остаются незавершёнными.
- Targeted **54/54**, browser **15/15** (Queue на пяти connector identities и
  public voice binding), TypeScript passed; full unit **1259/1259**, без skipped.
  Strict privacy, name guard (124 references), Markdown (987 files) и diff check
  прошли. Изменений live services, MacBook, GitHub и платных provider calls нет.

Промежуточный результат 26b (verified-automated):

- Claude API и OpenRouter подключены к общему host-owned file transport. Модель
  получает `attachment:<id>`; `read_file` разрешает только immutable reference
  из текущего private chat и сверяет bytes/metadata. Готовность требует текущего
  provider/model/tool admission и exact CLI (2.1.296 / 0.153.0). Runner повторно
  проверяет версию после service cache; обновление CLI не наследует file readiness.
- UTF-8 возвращается ограниченным окном; binary/large file даёт проверенный
  snapshot path для отдельной command approval. Нет автоматического extract,
  conversion или execution. Команда видит только копии этого хода и workspace,
  сохраняет прежние network/secret restrictions; нельзя менять или переименовывать
  snapshot directory даже при legacy state-root внутри workspace.
- Копии удерживаются при unknown process exit; после подтверждённого exit
  удаляются без затрагивания originals. Private execution receipt фиксирует
  cleanup state. Recovery после restart использует тот же receipt; partial
  cleanup возобновляется, неизвестные/изменённые файлы сохраняются. На resume
  предыдущие attachment URI разрешаются через durable history в новые копии.
  Перед удалением также проверяется сохранность originals: повреждённый original
  не приводит к удалению последней целой рабочей копии.
- Per-turn materialization ограничена 10 файлами / 250 MiB, включая historical
  files. Прямая подмена URI на path, доступ к соседнему chat, symlink/hardlink,
  изменение original/metadata/snapshot и лишние файлы в snapshot scope закрыты.
- Настоящие installed CLI + macOS sandbox + synthetic upstream прошли initial
  и resume: **2/2** provider scenarios (16 requests, 4 exact command approvals).
  Финальный targeted набор вместе с этими fixtures: **93/93**; TypeScript passed.
  Browser composer/queue/actual upload-download/voice binding: **36/36**, без
  skipped/flaky. Full unit **1277/1277** прошёл; после него добавлены два negative
  runner cases для смены CLI и ещё один recovery case для повреждённого original.
  Они и последний cleanup проходят в финальном targeted наборе 93/93. Strict
  privacy, name guard (124 references), Markdown (987 files), diff check passed.
- NeuralDeep delivery, изображения на внешних transports, Local inference
  isolation и voice intake receipts остаются отдельными незавершёнными пунктами.
  Код этого checkpoint не объявляет их готовыми и не выполняет live inference.

Следующая часть 26c — ND files/images и общий image boundary:

1. Сверить новый scope с accepted baseline для ND tools/permissions, проверить
   stock CLI flags и pinned source `stock-cli-acceptance.mjs` / input policy.
   Сохранить exact resume identity, pricing/rate slots и request deadline.
2. Дать NeuralDeep тот же host-owned file scope и bounded command approval,
   сохранив исходные data/prompt/queue receipts. Закрыть чтение соседнего state
   и snapshot writes реальным OS sandbox; проверить initial/resume ownership.
3. Для изображений сохранить declared/unknown/unsupported metadata без
   превращения отсутствующего флага в false. Транспорт доказывается отдельно:
   exact CLI, adapter hash, image format и initial/resume path. Не подменять
   отсутствие доказательств рекламой модели или размером preview.
4. Сверять actual encoded Responses inputs с SHA-256 originals текущего хода
   и image references именно этой durable chat history. Не resize/convert/drop;
   превышение request/encoding limit — явный отказ с сохранением draft/originals.
5. Портировать только применимые pinned-source tests; canonical stock CLI
   fixture выполняется с synthetic upstream, без настоящего ключа/inference.
   Отдельно проверить repeated image, text-only resume with image history,
   missing/foreign image, modified copy, Stop/unknown exit и cleanup recovery.
6. Только после transport gate показывать фактические file/image capabilities
   в Settings/Task Chat и подключать те же receipts к voice intake. Live model
   interpretation и ручная приёмка остаются отдельными R12 проверками.

Промежуточный результат 26c.1 (verified-automated):

- Good State Alignment для ND inputs/tools повторён: aligned с accepted reliable
  Codex Control Center и voice ducking; native history, music и managed runtime
  не изменяются. CLI flags сверены с установленным Codex 0.153.0, source image
  acceptance/input policy — с pinned GitHub snapshot 2ab22ae.
- NeuralDeep использует общий immutable file transport и семь host tools.
  Command/file approvals проходят через durable broker; CLI и команды работают
  в OS sandbox с отдельным HOME, provider state и loopback capabilities. Exact
  session identity, model, request deadlines, usage и admission slots сохранены.
  Готовность файлов проверяется повторно по версии CLI перед запуском.
- Tool projection вынесена из OpenRouter в общий модуль: builtin definitions
  (включая добавляемый CLI request_user_input) не передаются провайдеру. Обратная
  проекция допускает только точный разрешённый MCP tool. Подмена model/namespace,
  custom/local-shell call и foreign history — typed refusal без платного retry.
  Старый transcript не изменяется при отказе; неизвестный исторический namespace
  не получает новых прав и не переносится в новый session автоматически.
- JSON и SSE сохраняют typed policy errors; concurrent requests имеют разные
  tool maps. Cleanup и освобождение lease требуют подтверждённого завершения
  CLI и всех host command processes. Voice-only readiness не зависит от CLI.
- Accounting receipt записывается до освобождения executable calls и для JSON,
  и для SSE. Ошибка записи останавливает ответ без повторной оплаты. Targeted
  **102/102**, full unit **1290/1290**, без skipped. Installed-CLI scenarios:
  **4/4** (ND plain initial/resume + файлы ND/Claude/OpenRouter; только synthetic
  upstream). Browser **28/28**: реальные upload/download, composer, voice binding
  и approval после reload на трёх providers при desktop/mobile ширинах.
- TypeScript, strict privacy, name guard (124 references), Markdown (987 files)
  и diff check passed. Внешние ключи, платный inference, live services, MacBook и
  GitHub не использовались/не изменялись для этих проверок.
- Изображения остаются gated до выполнения пунктов 3–6 выше. File transport
  verification не считается подтверждением image support или live interpretation.

Промежуточный результат 26c.2 и 26d (verified-targeted, final full gate pending):

- ND PNG delivery использует shared immutable originals, точную private chat
  history и read-only snapshots. Actual encoded input проверяется на SHA-256,
  MIME, размер и multiplicity последнего user message; старая картинка в истории
  не компенсирует потерю новой. Corrupt/foreign/missing inputs блокируются.
- Settings → NeuralDeep → Verify image delivery выполняет только локальный
  synthetic probe с установленным CLI и настоящим OS sandbox. Проверены initial,
  text resume с image history и image resume одной session, включая разные IDs с
  одинаковыми bytes. Evidence привязано к instance/model metadata/CLI/adapter
  hash/initial+resume; paid inference отсутствует. Проверен PNG; JPEG/GIF/WebP
  остаются явно gated. Live interpretation проверяется отдельно в R12.
- Voice intake использует immutable context и durable confirmation receipt.
  HTTP timestamp не меняет identity; текст, instruction, preset и SHA originals
  меняют request hash. Повтор после lost response возвращает ту же карточку.
  Unknown dispatch допускает только read-only recovery существующей карточки;
  автоматически повторять задачу нельзя. Закрытие context при upload не запускает
  задачу. Native staging и Music Local Folder сохраняют прежнее поведение.
- Для ND/Claude/OpenRouter файлы voice intake загружаются в общий store и
  передаются через attachment IDs в существующие queue receipts. Native private
  staging paths не дают external tool права чтения. Файлы в очереди переживают
  смену default; отменённая queued задача не materialize/dispatch свои copies.
- Проверки image boundary/CLI/API и shared host paths: **76/76**; отдельный
  installed CLI proof — **1/1**, paid calls 0. Browser image/settings/upload/
  approvals — **14/14**, затем voice/settings — **17/17**. TypeScript pass,
  strict privacy/name guard/Markdown pass, 50 source adoption entries hash-checked.
  Общий прогон дал 1300 pass и 2 fixture failures во время подключения 26d;
  эти fixtures обновлены; итоговый targeted input/voice gate **75/75**. Полный итоговый прогон
  остаётся обязательным и не объявляется завершённым по частичному результату.
- Следующий блок: Search Auto и host research; далее remaining factory/auth/
  Local/bootstrap и R12. Live runtime, MacBook и GitHub не менялись.

Уточнение исполнения по просьбе пользователя сократить остаток примерно вдвое:
целевые tests на каждом изменении, полный suite на крупных checkpoints и перед
сдачей; связанные изменения объединяются в законченные блоки. Приватность,
process ownership, originals, recovery и ручная приёмка остаются gates. Новый
ориентир остатка — **4–7 часов активной работы, 1.8–3.2 млн tokens до кандидата**
плюс manual tests; это прогноз, не token budget или сокращение требований.

R12 дополнительная проверка runner: quality-gate задаёт оба root aliases для
child commands, а часть legacy test fixtures переопределяет только один. Проверить
unit child environment отдельно и изолировать оба aliases для fixture runner,
чтобы новая conflict detection не давала ложных ошибок в финальном quality gate.

### Checkpoint 27 — NeuralDeep Search Auto в общем host и голосе

- Перенесены reviewed Search contracts/policy/provider/store/service/child reader
  из pinned GitHub archive; 60 entries в R4 adoption inventory. Установка locked
  `ipaddr.js@2.5.0` и `zod@4.6.6` выполнена с `--ignore-scripts`.
- Search Auto/Requested/Off подключены к Task Chat через owned MCP инструменты
  `web_search` и `read_page`. Семь существующих host tools сохранены. Поисковый
  ключ остаётся в host; команда в sandbox не получает новые network permissions.
  Нет скрытого fallback на другой provider; неизвестные даты не подменяются
  retrieval date. Private/signed URLs, private queries и local/offline contexts
  блокируются до обращения к provider; source text проходит quarantine.
- SQLite, кэш, quotas и журналы находятся в private instance-state. Скопированная
  база другого instance, hardlinks, чужой source ID, старый settings revision
  не дают полномочий. По умолчанию на ход: Task 3 search/3 read, Voice 1/1;
  search timeout 8s, read 20s, cache 5/30 min. Provider quota — наблюдение.
- Voice backend выбирается по pinned Task provider. Requested получает intent
  из исходной реплики пользователя; tool arguments не могут включить permission.
  Повторные tool calls одного хода делят budget. Для старого клиента без turn ID
  применяется консервативный budget всего context. Local/Voice Offline блокирует
  cloud search. Legacy SearXNG сохраняется для прежних voice profiles.
- В Settings добавлен выбор режима с CAS и явным reload после конфликта.
  Settings response не содержит queries/history/raw upstream quota fields.
- Targeted core/host tests **40/40**, search/voice/context **65/65**;
  installed CLI + real sandbox + synthetic provider: Search initial/resume и
  повторная PNG verification **2/2**. Платных calls 0. Browser desktop/mobile
  settings/voice **10/10**; TypeScript passed. Общий suite следует после связанного
  factory block согласно ускоренному плану; это не финальная ручная приёмка.
- Отдельный standalone Deep Research worker из fork не включается автоматически:
  ближайшая работа R6 — canonical factory source orchestration с checkpoints,
  deadline и точными passages, без подмены existing gates.

### Checkpoint 28 — Canonical host source research и verified source history

- Через GitHub read-only подтверждены полные SHA и diffs всех 11 названных R6
  commits; metadata сохранена в source-history JSON. Locale/TMPDIR исправления
  уже применены в canonical supervisor; model/deadline corrections продолжаются
  в shared build integration. Fork-specific creation job storage не заменяет
  существующие canonical contracts/reports/Trials.
- В existing `external-research` добавлен backend `host`: durable collection,
  exact passage selection и recoverable publication. Источники ограничены
  authority policy; unknown/future dates, private URLs, неполный page read и
  навигационные блоки не становятся evidence. Total deadline сохраняется между
  перезапусками; unknown dispatch не повторяется автоматически.
- Exact source/passages из ND адаптированы отдельными модулями. Host проверяет
  12 required topics, две attempts, один Search/Read за attempt, 20s acquisition,
  5min total. ND использует scoped Search; другие online profiles читают только
  curated/явно выбранные primary URLs. Local offline сохраняется. Инструкция:
  `07_workflows/agents-mother-host-research.md`.
- Модель передаёт IDs и synthesis; host восстанавливает цитату и применяет
  прежние external/repository gates. Publication journal + report CAS переживает
  остановку после подготовки записи. Изменённые contract/pattern/report и чужие
  source IDs не разрешают продолжение. Pending gate теперь выводит свою причину.
- Existing not-applicable + adoption:none уже корректно исключал repository
  research. Добавлена явная regression matrix: это не отменяет memory evidence
  и не разрешает reference-only adoption без проверки.
- Targeted host/external/repository/gate suite **87/87**. Полный suite после
  связанного блока execution backends; R6 в целом остаётся in-progress.

### Checkpoint 29 — Shared budgeted build executors

- Registry поддерживает native Codex, Claude Code API, NeuralDeep, OpenRouter и
  Local. Последний сохраняет явный `offline_unverified` до R7. Existing native
  delivery и отдельные Trial backends не заменены. Claude host runner стал общей
  основой для worktree isolation, protected verifier, seven tools, process proof,
  provider slots и durable recover. Search в build не подключается.
- Reviewed ND budget policy перенесена в общий Responses request budget;
  резерв сохраняется до HTTP, измеренный usage — до передачи executable tools.
  Unknown usage, overshoot, дубликат и ошибка записи блокируют следующий запрос.
  Чужой concurrent receipt не может завершить активный резерв нулевым расходом.
- Model/output/context policy pinned в attempt, Gemma build cap 8192, Qwen effort
  не притворяется действующим; неподдержанный effort/thinking budget отклоняется.
  Deadline учитывает остаток всего delivery run, а не только одну итерацию.
- API and real installed-CLI fixtures без платных вызовов: protected Trial
  write rejected, product write accepted, три запроса / 360 measured tokens,
  повтор attempt и recovery не делают четвёртый запрос. ND original-PNG fixture
  повторно прошёл вместе с ними: **3/3**.
- Дополнительные recovery/concurrency/accounting проверки **27/27**; основной
  targeted factory gate до них **54/54**; typecheck passed. Полный unit run:
  **1372/1374**, два устаревших source-text assertions (async evidence handler и
  provider-pinned voice Search) исправлены; связанный повтор **13/13**. Это
  исправления test fixtures, не ослабление runtime guard. Повтор полного набора
  выполняется на следующем крупном/final gate. Privacy, names **124** и Markdown
  **988** прошли.
- Инструкция обновлена в `07_workflows/delivery-usage-accounting.md`; provenance
  inventory содержит 66 source adaptations. R5 local auth/child, R7 offline/child,
  R9 child voice, R11 и R12 остаются открыты. Runtime/MacBook/GitHub не изменены.

### Checkpoint 30 — Child API clients и явное provisioning

- Contract/CLI получили отдельные `Child model provider` и `Child model ID`.
  Native build executor остаётся прежним, если не выбран другой. Invalid provider
  или model отклоняется до создания артефактов; API selection добавляет required
  current-source research и меняет contract fingerprint. Старые scaffolds без
  выбора остались byte-identical по snapshot gate.
- Selected scaffolds включают dependency-free Anthropic Messages client и
  bounded ND/OpenRouter text client, config, private dotenv declarations и
  status/pilot command. Нет parent key/env inheritance, arbitrary URL,
  redirects, model fallback, tool execution или retries после ambiguity.
  Unknown usage и incomplete output сохраняют честную семантику.
- Credentials drawer различает Anthropic/ND/OpenRouter. Один Save записывает
  ключ, BASE_URL и MODEL в объявленный child store. Selected configuration
  передаётся обратно с действием; stale model/URL/target блокирует запись.
  Неверный endpoint закрывает Save. Private nested targets, backups, foreign
  state и отсутствие ключей в JSON/DOM сохраняют существующие guards.
- Targeted suite **92/93**: один VM harness не передавал новый pure helper;
  harness исправлен и дополнен atomic binding/stale/invalid endpoint checks.
  Финальный связанный subset **16/16**, ранее API/scaffold/client gate **60/60**,
  factory/contract gate **13/13**. Typecheck passed. Real browser **3/3**, каждый
  provider на desktop/mobile: save tuple, stale refusal, remove, no secret echo.
- Исторический Claude SDK **0.3.306** pilot прошёл четыре offline conformance
  checks после locked install во внешней временной workspace с ignore-scripts.
  API loop остаётся `pending-auth`, реальный платный вызов не выполнялся.
- Инструкция: `07_workflows/child-provider-setup.md`. Verified primary sources:
  Anthropic Messages API **2026-10-21**, OpenRouter API overview; ND authority
  остаётся pinned GitHub source. Optional Claude local-session lane, Local
  offline execution, child voice, bootstrap и R12 продолжаются. Никакие живые
  child credentials, сервисы, MacBook или GitHub не менялись.

### Checkpoint 31 — Existing child voice workspace

- Голосовая задача ND/Claude/OpenRouter/Local может выбирать существующего
  child agent по instance-local catalog ID/однозначному alias. Host закрепляет
  canonical ID и физический project root; произвольный путь не является
  полномочием. Чужой instance, конфликт идентичности, symlink и другая Pritha
  отклоняются. Native voice сохраняет свой существующий маршрут.
- Read-only работает в выбранном child project; запись — в отдельном Git
  worktree. Для проекта без Git voice write закрывается до создания чата.
  Queue, restart и typed continuation сохраняют child/provider/model binding;
  перед новым запуском каталог и physical root проверяются повторно.
- Targeted voice/topic/router/runtime suite **79/79**, typecheck passed.
  Проверены четыре внешних connectors, queue/restart, moved child, injection,
  foreign instance, symlink, worktree isolation и неизменность исходного файла.
- Это закрывает existing-child routing. Создание нового ребёнка голосом через
  external provider остаётся отдельным factory route: нельзя выдавать всему
  CLI доступ к sibling parent или private state ради обхода этой границы.
  Local execution пока сохраняет offline gate. Платных calls и service changes 0.

### Checkpoint 32 — Owned Local offline execution

- Общий Responses runner подключает отдельный ephemeral model process только
  из private operator-authored manifest. Executable SHA-256, exact model,
  configuration identity и native session закреплены. Model process получает
  read-only model/runtime roots, private scratch и ровно один собственный порт;
  ключи и пользовательское окружение не наследуются.
- Listener проверяется по process-session proof. Durable active receipt не
  позволяет запустить замену при неизвестном завершении. Stop, timeout и ошибки
  проверяют inference + CLI + host tool trees; unknown сохраняет scratch/claims.
  Metadata probe временный, inference не запускает и чужие сервисы не меняет.
- Local блокирует cloud Voice и Search. Общая Queue и BuildExecutor используют
  этот же runner. Discovery существующих Ollama/LM Studio/custom endpoints
  сохранён, но loopback-only сервер не считается offline. Engines с чужим
  daemon или дополнительными динамическими портами требуют отдельного verified
  adapter; это явное критическое уточнение исходного предложения.
- Targeted suite **19/19**. Installed CLI + actual isolated synthetic model
  server: initial, tool call и resume **1/1**, три Requests, исходный session ID,
  завершение всего process set. OS test подтвердил remote/foreign-loopback и
  private-file denial. Реальная модель не скачивалась и не объявлена принятой.
- Workflow `07_workflows/local-provider-offline.md`, CLI configure/probe,
  Settings поясняют временную копию. Actual installed-model acceptance — R12.
- Дополнительный factory gate **46/46** включает Local: budget accounting,
  recovery, unknown exit, invalid report и provider-slot competition. Source URL
  передаётся через `--base-url` и закрепляется в attempt. Typecheck, privacy,
  names **124** и Markdown **990** прошли. Полный unit gate запущен после блока.

### Checkpoint 32b — Full gate и связанные исправления

- Full unit run: **1392/1398**, 295 s. Шесть failures: naming guard заметил уже
  начатую compatibility detection в bootstrap; voice expectations ещё разрешали
  cloud audio для Local, а child routing ожидал прежний pending code.
- Local теперь возвращает нормальный offline status, не читая cloud credentials;
  сохранённый старый Local voice context также не разрешает сетевой вызов.
  Public child-route fixture проверяет новые точные причины отказа. Неизвестный
  результат самого старта inference supervisor сохраняет recovery receipt.
- Связанный повтор **43/43**, typecheck passed. Полный набор повторяется на
  следующем общем/final gate; результат 1398/1398 пока не заявляется.

### Checkpoint 33a — Unified bootstrap и private distribution pointer

- Перенесены reviewed идеи ND instance/bootstrap/START_HERE из pinned source.
  Удалены автоматические Git init/add/commit и credential inheritance. Источник
  и адаптации зафиксированы в inventory, теперь **69** записей.
- Профили minimal/local/control-center/control-center-tailscale сохранены;
  ND/Claude/OpenRouter/local-model добавлены. `--provider-profile` отделяет
  connector от installation profile. Auth/actual inference остаются отдельными
  readiness checks; отсутствие ключа не вызывает скрытый fallback.
- Fresh instance получает gitignored mode-0600 pointer, отдельные state/agent
  roots и venv. Occupied legacy state не переносится. Env-first precedence
  сохранён; copied pointer, root overlap, чужой checkout и unsafe file закрыты.
  Повтор prepare не пересоздаёт готовый venv; required failure останавливает
  последующие шаги. Системный pip --user больше не используется.
- JS/Control Center/direct Python entrypoints и env-doctor выбирают один
  instance state/interpreter. Проверки без импорта ML и без загрузки credentials.
- Bootstrap/paths/Python/doctor/names gate **32/32**, typecheck passed. Полная
  minimal preparation из реального локального Git archive прошла три раза,
  включая index rebuild и verify: **pass**, без Git init и source pointer на
  канонической машине. Это fixture, не обновление живого runtime.
- Names **125**, Markdown **991**; обновлены START_HERE и first-run workflow.
  Reviewed Brief Desk + безопасный installer остаются следующей частью R11.

### Checkpoint 33b — Reviewed Brief Desk и локальный import

- Перенесены 27 файлов pinned ND example и добавлен безопасный `.env.example`.
  Отдельный `03_reviews/2026-11-01-brief-desk-adoption.json` содержит source/target
  SHA-256 всех 28 файлов. Исходные tests сохранены и расширены.
- Own credentials only: parent Keychain/ref/ambient provider keys не читаются.
  Settings сохраняют `.env.local` атомарно mode 0600; symlink/hardlink rejected.
  Managed manual startup передаёт только базовое окружение, без parent secrets.
  Read Source дополнительно закрывает reserved documentation/transition ranges.
- Installer имеет read-only plan, проверяет reviewed hashes, использует private
  import journal/identity и staging. Collision, linked paths, partial import и
  identity mismatch закрыты. Повтор сохраняет пользовательские edits/keys/history.
  Исправлен путь identity для ещё не созданного state-root под macOS `/var` alias.
- Пример импортируется в instance agent parent, contract/outcome/profile — только
  в private `agents/`. Это drafts для local review, а не поддельный accepted
  factory contract. Нет Git init, dependency install, keys, server/startup или
  сообщений. ND bootstrap включает import; START_HERE описывает отдельный CLI,
  offline demo, собственные ключи и recovery без слепого удаления receipt.
- Targeted gate: **29/29** (demo, settings, importer, bootstrap, distribution).
  Проверены два instance/catalog, idempotence, collisions, interrupted import,
  parent credential rejection, CSRF/revision/explicit publication и offline demo.
  Privacy/names/Markdown passed; actual provider/Telegram send не выполнялись.
- Локальная установка примера для ручной приёмки и весь R12 ещё впереди.

### Checkpoint 34 — Local file transport

- Local присоединён к общему verified file transport для Codex 0.153.0.
  Images остаются отдельной unsupported capability; offline process guard не менялся.
- Installed-CLI acceptance **1/1**: initial/resume, 8 synthetic requests, 2 exact
  command approvals; UTF-8/hash, exact binary bytes, snapshot readonly, original
  inaccessible to command, full process-tree exit и cleanup подтверждены.
  Responses замоканы; owned inference process реально запускался/проверялся.
  Предыдущий Local stock fixture отдельно проверил реальные HTTP responses от
  собственного изолированного model server. Оба вида evidence нужны вместе.
- Targeted file/admission/provider-service tests **19/19**. Parent credentials
  для Local не читались; платных вызовов/моделей/сервисных изменений нет.

### Checkpoint 35 — Dependency patches и подготовка полного gate

- Next 16.4.3, Sharp 0.35.5, Undici 7.30.1, browser-mapping 2.11.0 и
  source-map-js 1.2.2 закреплены в manifest/lockfile после проверки registry и
  primary release/advisory sources. Install без lifecycle scripts; typecheck pass.
- npm audit: **0 critical / 0 moderate / 2 high**, вместо 1/1/5. Оставшиеся две
  записи — один transitive Zod finding через sandbox-runtime 0.0.81. Совместимого
  исправления нет; bounded host-plan reachability и residual risk описаны в
  `03_reviews/2026-11-01-provider-convergence-dependency-audit.md`. Нет force upgrade.
- Unit children quality-gate очищают оба root aliases, чтобы не наследовать live
  checkout вместо fixture. Targeted quality tests **6/6**, names guard passed.
- Полный quality gate и production browser candidate запускаются следующим шагом;
  этот checkpoint не утверждает, что они уже завершились. Voice factory creation,
  optional Claude CLI auth и ручная приёмка остаются отдельными открытыми пунктами.

### Checkpoint 36 — Полный прогон, ремонты и boundary audits

- Первый full quality gate: env/privacy/rebuild/Telegram passed; unit **1386/1407**.
  Все 21 failures происходили в update fixture: после нового paths import он не
  копировал distribution-instance и provider-profile. Исправлено; весь update/
  rollback suite теперь **21/21**, включая ownership, chunks, timeouts и cleanup.
- Новый assessment требовал поле recommendation; оно добавлено. Это устранило
  общий blocker validate-memory, smoke и Agents Mother inspection. Markdown **992**.
- Первый полный production browser run: **159/160**, один ECONNRESET на read-only
  voice status. Без изменения assertion/retry policy повтор Voice **5/5**, затем
  Voice + отдельный strict health **6/6**. Strict проверяет /codex, /agents,
  /voice, /task-chat, /settings и реальные same-origin JS chunks. Первый сбой
  сохранён в журнале; он не переписан как изначально успешный прогон.
- Исправлены оставшиеся Python entrypoints self-test, golden embeddings и
  legacy web semantic search: используют instance interpreter. Env-doctor
  больше не рекомендует global pip --user. Targeted helpers **6/6**.
- Полный golden gate с embeddings/semantic search **pass**; **10776** embeddings
  восстановлены из текущего Markdown. Никаких загрузок модели или cloud inference:
  HF/Transformers offline flags, существующий локальный cache.
- Reviewed ND audit concepts сохранены в совместимых CLI entrypoints. Исходные
  real-key Keychain scan и live proxy-only inference осознанно заменены: явные
  external provider scopes, чистое временное HOME, synthetic secrets, реальные
  OS-denial проверки. `--connector all`: secrets **18/18**, network **67/67**,
  skips **0**. Live key leakage/provider calls не объявляются проверенными.
  Inventory вырос до **72** записей; planner invalid-input test **1/1**.
- Read-only runtime status: managed canonical service работает. Name migration
  планирует только techscope.sqlite → pritha.sqlite и правильно блокируется
  `managed_runtime_loaded`. Runtime не останавливался; rename ещё не выполнен.
- Следующий gate — повтор self-test/full unit после ремонтов и staging candidate.
  Optional Claude session auth / external voice factory scope ожидают решения
  пользователя; пока не исключены из исходного объёма. Live/manual acceptance
  по-прежнему не подменяется synthetic tests.

### Checkpoint 37 — Полный self-test, recovery и чистая установка

- Реальный self-test canonical instance: **1408/1408**, warnings **0**, regressions
  **0**. Память: 992 documents, 10998 chunks, 10777 embeddings. Это результат до
  следующего bootstrap repair; новые тесты проверены отдельно, финальный gate
  будет привязан к итоговому commit.
- Production staging для `f9749a55918c2a410237869a76d6325ca801f4b7` собран успешно.
  Exact staging скопирован как `.next` в disposable source/state/HOME: strict
  health **5 pages / 12 JS chunks**, process-tree exit подтверждён. Live build
  не менялся. Private recovery содержит прежние source/build/locked dependencies,
  успешный `npm ci --ignore-scripts` и hashes девяти посторонних untracked files.
- Actual fresh `local-model` preparation выявила два дефекта, не видимых в dry-run:
  системный Python 3.9 выбирался вместо установленного 3.11; env-doctor требовал
  macOS Whisper, который этот профиль намеренно не устанавливает. Новый seed
  resolver проверяет только version (`-I`, timeout, shell:false), соблюдает
  `PRITHA_PYTHON` без тихой подмены и сохраняет существующую venv. Диагностика
  Local продолжает проверять memory/UI dependencies, исключая только Whisper.
- Повтор actual preparation в той же fresh fixture полностью прошёл: instance,
  setup, Python 3.11.15 venv, pip core, SQLite, embeddings, npm ci, env-doctor,
  Markdown, stats, semantic search, typecheck, production build. Provider
  connection честно остаётся `planned` без модели/ключей. Model cache offline;
  ни cloud inference, ни autostart, ни Git init не выполнялись.
- Targeted bootstrap/Python/env-doctor: **13/13**, без skips. Reviewed source
  inventory: **72 source hashes / 34 explicit target hashes**, включая обновлённый
  bootstrap. Entries reference-only не выдаются за дословно перенесённые файлы.
- Ручная приёмка и план controlled activation описаны в
  `11_agents/reports/2026-11-01-pritha-provider-convergence-deployment-report.md`.
  Сервисные действия ещё не разрешены и не выполнялись. Два ранее обсуждённых
  режима остаются открытыми, пока пользователь не изменил их scope.

### Checkpoint 38 — Финальный автоматический gate и CLI instance paths

- Полный quality gate **pass**, все 8 групп: env, privacy strict, Markdown,
  rebuild, smoke, **1410/1410** unit, Agents Mother inspection, Telegram dry-run.
  Skips **0**. Полный production browser run **161/161**, без повторной попытки
  упавших assertion и без ослабления проверок.
- Staging для `0c10dd0fd9c4dcf97489115887fc9b1023ef5e00`: strict **5 pages /
  12 JS chunks**, точный build ID и health-contract commit verified, owned process
  tree exited. Первый probe ошибочно сравнивал full SHA с documented 12-character
  health SHA; проверочный скрипт исправлен по `api/health` и updater contract.
  Это не сбой приложения; исходная failed receipt сохранена. Девять чужих
  untracked файлов подтверждены по исходным hashes.
- Read-only import preflight обнаружил, что новые CLI installer/Local configure
  не загружали path-only runtime env. Без экспортированных переменных они могли
  выбрать checkout fallback вместо canonical external state. Исправлены только
  CLI entrypoints; library functions по-прежнему принимают явные isolated options.
  Не загружаются auth keys, не выполняется autostart или импорт чужого runtime.
- Targeted post-gate repair **15/15**: две новые actual CLI проверки с fixture
  `.env.local`, importer/idempotence/isolation, owned Local OS boundaries и
  bootstrap. Actual canonical read-only plan теперь указывает external
  `agents/contracts`/`profiles`; live demo import не выдаётся за approved scaffold.
- После этого commit private candidate receipt/build обновляются ещё раз;
  неизменный UI browser suite не повторяется ради CLI-only правки. Final source
  identity и staged health проверяются на новой сборке перед approval.
- Пользователь явно выбрал **доделать оба режима в этой задаче**: Claude native
  CLI session и external-provider voice factory creation. Они остаются обязательными;
  экономия достигается организацией исполнения, а не переносом scope. Далее
  controlled local activation и ручная приёмка. MacBook, GitHub и production
  service не изменены.

### Checkpoint 39 — Claude native CLI session

- Реализованы private HOME/config экземпляра, явный terminal login через
  немодифицированную Claude CLI, bounded status и изолированный Task Chat.
  Pritha не извлекает OAuth, не подставляет API key и не переключает auth lane
  при ошибке. Account identity попадает в resume binding только как SHA-256.
- Native inference проходит через opaque CONNECT TLS tunnel с тремя exact
  first-party hosts, проверкой всех DNS addresses и pin адреса. TLS и credentials
  принадлежат CLI. Account MCP connectors, hooks, artifacts и telemetry отключены;
  рабочие инструменты остаются host-controlled и отдельно подтверждаемыми.
- Login/status имеют owned-process evidence и exclusive private lease;
  неподтверждённый выход удерживает evidence. Исправлены canonical `/var` alias
  paths и достаточный bounded timeout для native startup. Общие filesystem
  запреты sandbox не ослаблены.
- Проверки: scoped suite **28/28**; повтор real native auth/fallback file isolation
  после удаления ненужного sandbox исключения **5/5**. Проверена запись synthetic
  credential refresh, denial чужого session/workspace secret, смена account при
  resume, отсутствие API lookup и сохранение unknown-exit fence. Production
  browser **2/2** (390/1440), typecheck и build pass.
- Источники проверены 2026-11-01: [native authentication](https://code.claude.com/docs/en/authentication),
  [network configuration](https://code.claude.com/docs/en/network-config),
  [CLI hosting rules](https://code.claude.com/docs/en/legal-and-compliance),
  [model catalog](https://platform.claude.com/docs/en/models/overview).
  Installed CLI 2.1.296; reviewed native catalog Sonnet/Opus/Haiku 5.5.
- Native usage — observed; host-reserved factory budget требует отдельного API
  режима. Не выдавать native usage за hard reservation. Реальный login, account
  entitlement и paid inference остаются ручными проверками. Good State alignment
  — aligned; production/MacBook/GitHub не изменены. Далее external voice factory.

### Checkpoint 40 — external-provider voice factory

- Для NeuralDeep, Claude, OpenRouter и Local voice `agent_creation` связывается
  с одним новым child slug и private factory session. Общие инструменты сохраняют
  read-only корень Pritha. Узкий `factory_step` выполняет только фиксированные
  действия для этого ребёнка; модель не выбирает исполняемый код, state root,
  соседний checkout или каталог назначения.
- Реальные owned workers вызывают canonical interview, research, scaffold,
  delivery и card-readiness. Contract и Outcome проходят отдельные host approvals
  с полным содержимым и SHA-256. Spoken brief confirmation не заменяет эти решения.
  Изменённые после review документы, подмена identity, foreign artifacts и
  неизвестные результаты останавливают дальнейшие изменения.
- Вложенная сборка использует pinned backend/model и отдельный lease. Пока
  родитель ожидает `factory_step`, она может занять его единственный provider slot;
  только один child получает эту возможность. Recovery дочерней сборки не снимает
  родительский lease. Claude factory использует явно показанный API lane с host
  token reservation; native account credentials не копируются.
- Вызовы сохраняют operation identity и run ID до dispatch. Stop завершает owned
  worker tree; неизвестный исход удерживает fence и не разрешает повтор платной
  работы. Queue/restart сохраняют child, provider и preset. Полная ручная приёмка,
  merge, публикация, credentials provisioning и services не автоматизируются.
- Исследования сохраняют разрешимые ссылки только на существующие exact private
  artifacts, включая external state под временным каталогом. Произвольный текст
  и пути вне private artifact boundary по-прежнему проходят redaction. Исходный
  дефект обнаружен actual worker test, а не заменён исключением research gate.
- Проверено: scoped routing/build suite **62/62**; расширенный actual factory
  lifecycle **4/4**, включая separate approval/CAS, memory research, pinned
  delivery, card blocker, Stop и неизвестный исход. TypeScript pass. Итоговые
  quality/browser/boundary gates запускаются после этой реализации.
- Factory MCP deadline ограничен временем задачи; CLI не должен фоново завершать
  ожидающий host action. Сверено 2026-11-01 с официальными
  [Claude environment variables](https://code.claude.com/docs/en/env-vars) и
  [MCP time limits](https://code.claude.com/docs/en/mcp), installed CLI 2.1.296.
- Good State alignment: additive/aligned. Оба обязательных режима реализованы;
  production activation, реальные auth/model/microphone/child checks и R12
  acceptance остаются открытыми. MacBook/GitHub и managed service не изменены.
  Временный каталог ранних логов исчез; новые протоколы сохраняются в private
  release preparation directory, текущий candidate получает новый полный gate.

### Checkpoint 41 — Общая регрессия и готовность к локальной активации

- После двух дополнительных режимов полный quality gate: **1443/1443**, без
  skips, все восемь групп pass. Первый прогон выявил два устаревших теста:
  delimiter извлечения функции и прежний запрет external factory creation.
  Обновлены точные ожидаемые ошибки, добавлены четыре публичных factory-route
  проверки. Узкий repair suite **24/24**. Production-код этим ремонтом не менялся.
- Browser: **163/163**, без flaky/skips; secrets **23/23** и real OS/network
  boundary **80/80**. Actual factory/research/lifecycle scoped gate **90/90**.
  Проверены 34 target hashes adoption manifest и неизменность девяти посторонних
  файлов. Полные исходные приложения этого roadmap сохранены без изменений.
- Создано постоянное instance-local Python 3.11 окружение из requirements-core;
  общий resolver выбирает его автоматически. Rebuild: 993 documents / 11008
  chunks; восстановлены 10787 cached offline embeddings. Frozen retrieval fixture
  не менялся; код CuratedRetriever byte-identical исходному canonical commit.
  Парное сравнение: FTS 45/48 Hit@5, 46/48 Hit@10, holdout 23/24,
  regressions@10=0, private leaks=0 во всех трёх modes. Semantic отдельно 31/48,
  hybrid 41/48 Hit@5: они не подменяют принятый FTS gate. После итоговых правок
  документов индекс и embeddings синхронизируются повторно.
- Read-only runtime preflight обнаружил circuit_open и отсутствие listener.
  Автоматические рестарты завершались ENOENT preview-props.json: старый build
  Next 16.2.11 оказался рядом с установленными dependencies 16.4.3. Это
  подтверждает mismatch; причина первоначального автоматического запуска не
  доказана. Manager stop/start в этой задаче не выполнялись. Согласованный новый
  build прошёл isolated health; recovery хранит согласованную старую тройку
  source/build/dependencies. Подробности и transaction — в deployment report.
- Реальный Local проверяется отдельно: официальный llama.cpp v0.8.0/b11960,
  release SHA-256 подтверждён; модель загружена по pinned revision и digest.
  CPU Responses inference 0.6B прошёл, но tool-use завершился буквальным JSON
  вместо вызова инструмента. Выбрана Qwen3 4B Q4_K_M: реальные Responses,
  host read_file и resume той же сессии прошли, три task requests, полный выход
  model/CLI process trees подтверждён. Private configuration сохранена, active
  provider не переключён. Metal запрещён текущей изоляцией: CPU sandbox сохранён
  без ослабления network/filesystem policy. CLI предупреждает о fallback model
  metadata и сокращённых skill descriptions; облачного fallback нет. Это
  проверка интеграции, не оценка общей coding quality небольшой модели.
- R12 остаётся открыт: managed activation, реальные provider auth/model/child
  и microphone checks, операторская ручная приёмка. GitHub/MacBook не изменены;
  private receipts не публикуются. Queue health и launchd-root audit pass.

### Checkpoint 42 — Активация и живые проверки

- Пользователь отдельно разрешил managed switch кандидата `15a17c1` и
  подготовку компактной Local-модели без фонового сервиса. Выполнены stop,
  verified SQLite filename migration, atomic staged swap, start, exact health
  и восстановление admission. Durable receipt и matching rollback сохранены.
- Post-activation self-test: 1443/1443, семь групп, без warnings. Первый прогон
  обнаружил отсутствие `mlx-whisper` в instance Python; закреплённые macOS
  dependencies установлены только в этот venv, повтор прошёл с embeddings.
- В Safari реально прошли native chat/history, Queue/Edit/Cancel, Steer, Stop,
  file attachment и reload. Переключение нового draft на Local сохраняет
  существующий native binding. Voice config: Realtime 2, девять core tools и
  отдельный optional music tool; физическое аудио ещё не принято.
- Local readiness выявил слишком короткие 10 секунд для холодного старта из
  macOS background service. Подготовлен bounded startup fix: до 30 секунд,
  в пределах более короткого task deadline, и 45-секундный probe lease. Ошибка
  загрузки имеет отдельный понятный код. Два OS-теста проверяют slow startup
  после 10 секунд и сохранение короткого deadline с подтверждённым cleanup;
  targeted gate 13/13. Этот follow-up ещё требует staging/live verification.
- Большой Pritha context на компактной CPU-модели обрабатывался слишком долго.
  Тест ограничен штатными queue cancel и exact-turn interrupt; active leases
  стали нулевыми, model process и ownership receipt исчезли. Это наблюдаемое
  ограничение, а не успешный ответ или принятая производительность. Проверка
  уменьшенного CPU batch остаётся открытой.
- Пользователю переданы конкретные действия для native Claude sign-in,
  provider credentials через Settings и microphone/interruption acceptance.
  Ключи не запрашиваются в переписке; OAuth остаётся внутри native CLI.

### Checkpoint 43 — approved update, live providers and operator voice acceptance

- `3853e0a` активирован штатной транзакцией. Source/build/dependencies прежнего
  `15a17c1` проверены в isolated recovery и сохранены вместе с ещё более ранней
  recovery-точкой. Первое cold-readiness наблюдение было слишком ранним;
  последующий strict gate прошёл без повторного рестарта.
- Post-activation self-test: 1445/1445, seven groups, no warnings. Current generated
  memory: 993 documents / 11012 chunks / 10791 embeddings. Frozen acceptance
  SHA-256 неизменён: FTS 45/48@5, 46/48@10, holdout 23/24; semantic 31/48@5,
  hybrid 41/48@5; regressions@10=0, private leaks=0. Retrieval quality не
  подменяет качество итогового ответа.
- Реальный Claude API: immutable synthetic attachment → correct answer → same
  chat resume, provider binding сохранён, queue/active slots пусты. Host file-tool
  execution отдельно не утверждается: наблюдалась интерпретация вложения.
- NeuralDeep для `qwen3.8-27b` возвращал другую terminal model
  `qwen3.8-flash-next`. Этот ответ остаётся rejected; автоматического fallback
  и разрешения подменять модель нет. Для явно выбранной `gpt-oss-20b` live upstream
  вернул publisher-qualified `openai/gpt-oss-20b`; добавлено только это точное
  соответствие. Provisional wrong-model metadata блокирует публикацию текста
  и tool calls до подтверждённого terminal model, целого stream и durable usage.
  Wrong/missing model, truncation, foreign tool и accounting failure остаются
  fail-closed. Real host read_file + same-session resume прошли с exit proof.
- Пользователь сообщил: «Проверил: ответ и прерывание работают». Это отдельная
  ручная приёмка Voice audio/interruption, без расширения на весь release,
  другие voice providers или voice child factory.
- В Local сохранён unknown process-coverage receipt после process_snapshot_timeout.
  Отсутствующий PID не считается доказательством выхода всех потомков. Подготовлен
  private reboot checkpoint с hash receipt и kernel boot UUID; очистка не выполнена,
  перезагрузка не разрешена. Background inference также не прошла bounded deadline.
- Claude native login выявил дефект synthetic HOME: macOS не находила login
  Keychain. Исправляются OS account home, scoped config, terminal status check и
  copyable command с обоими root aliases/state. Native CLI — отдельная доверенная
  граница: ему нужен macOS credential store; model host tools этого доступа не
  получают. Atomic refresh требует narrow read-only sandbox sentinel sysctl,
  подтверждённого upstream issue и тестом отдельного synthetic Keychain.
  Текущая пользовательская Keychain locked; real login остаётся pending.
- Подготовлены private Contract/Outcome и immutable independent verifier для
  line-counter child pilot. Все core/deliverable покрыты, negative controls
  отвергают stub/wrong product. Два явных approvals и бюджет запрошены отдельно;
  child пока не создан. OpenRouter live gate отложен пользователем.
- Новое требование пользователя: подключение Claude для fresh GitHub download
  должно быть обычным поддерживаемым сценарием, без ручного подбора путей.
  Включено в R12 как отдельная приёмка; текущий partial auth check не считается pass.

### Checkpoint 44 — Claude onboarding and corrected provider candidate

- Подключение Claude для нового пользователя описано единообразно в Settings,
  bootstrap, Start Here и `docs/claude-connection.md`: установленная совместимая
  CLI, выбор режима, одна полностью готовая команда, browser sign-in, проверка
  сохранённого входа и первая задача. Ручная подстановка путей не требуется.
  Изолированный внешний runtime пока проверен только на macOS; Windows/Linux
  не объявляются поддержанными по аналогии с самой Claude CLI.
- Native CLI использует OS account home и отдельный instance config. Команда
  получает оба root aliases через общий resolver. Только доверенной native CLI
  предоставляется Keychain directory для чтения/atomic refresh; model tools и
  API lane не получают этот доступ. Узкий read-only sentinel sysctl проверен
  на отдельной synthetic Keychain без расширения сетевых разрешений.
- NeuralDeep provisional metadata целиком удерживается до подтверждённого
  terminal model и durable accounting. Повторный prelude с непустым output
  тоже запрещён, включая совпадающий или отсутствующий model ID. Единственный
  добавленный model alias остаётся `gpt-oss-20b` → `openai/gpt-oss-20b`.
- Финальный full quality: **1452/1452**, zero skips, eight groups pass. Отдельно
  focused tests 43/43, service/auth 13/13, browser Settings/API 12/12,
  network audit 85/85, secrets audit 26/26. Сохранены неудачные прогоны 1450/1452
  и 1451/1452: исправлены дублирующий legacy literal, README slogan и fixture с
  несуществующим корнем. Naming/path guards не ослаблялись. Старые предупреждения
  о формате четырёх commit messages остаются, история не переписывалась.
- Подготовлена отдельная recovery-точка для активного `3853e0a`: source/build и
  matching dependencies, five pages/twelve JS chunks pass, process tree exited.
  Новая staging build ещё не активирована. Ни служба, ни другие компьютеры,
  ни GitHub на этом шаге не изменялись; девять чужих файлов сохранили hashes.
- Sanitized review дополнен общей картой реализации, полным changed-file map,
  provenance, отрицательными результатами, recovery и manual script. Реальный
  native login по-прежнему `pending-auth`; full child, Local recovery и остальные
  ручные gates не закрыты. OpenRouter остаётся отложенным по решению пользователя.

### Checkpoint 45 — откат, исправленный каталог и реальные acceptance pilots

- Good State Alignment для documentation выполнен read-only: прямого scope
  match нет, проверены два последних baseline Reliable Codex Control Center и
  Voice Ducking. Классификация **aligned**: этот checkpoint уточняет доказательства
  и открытые gates, не изменяет lifecycle, privacy или принятую функциональность.
- Пользователь разрешил активацию `0bcf566`. Managed stop/build swap/start,
  strict health пяти страниц и двенадцати JS chunks прошли, admission восстановлен.
  Operational health остановил приёмку из-за agent-catalog: безопасный draft
  Contract/Outcome с ещё не созданной целевой папкой ошибочно считался identity
  conflict. Выполнен разрешённый управляемый откат на `3853e0a`, strict health и
  admission восстановлены. Каталожный blocker воспроизвёлся и на прежней сборке;
  это не доказательство успешного operational gate после отката. Сохранены
  `activation-operational-health.json`, `activation-failure.json`,
  `rollback-strict-health.json`, `rollback-operational-health.json` и
  `rollback-receipt.json` в private release evidence.
- Кандидат `94f3a33` исправляет только безопасный draft-case: согласованный
  Contract/Outcome с отсутствующей запланированной папкой получает
  `project-planned-not-created` и `projectPath: null`, без разрешения execution.
  Missing accepted/scaffolded project, чужой checkout, symlink и противоречивые
  пути остаются конфликтами. Identity/readiness/scaffold tests **54/54**,
  naming guard **126 references**; boundary allowlist не расширялся.
- `quality-94f3a33.json`: полный gate **1471/1471**, **0 skipped**, все **8 групп
  pass**. Сохранено прежнее предупреждение о формате четырёх commit messages;
  историю не переписывали. Typecheck и production staging build прошли.
  Build `Zu0payZPo2t-vkJUCB2Ra` проверена в изолированном экземпляре:
  **5 страниц / 12 JS chunks**, exact source/build identity и полный выход дерева
  процессов (`probe-94f3a33/health.json`, `probe-94f3a33/process.json`). Это staged
  evidence, не production activation. Runtime остаётся `3853e0a`; новый approval
  на исправленный кандидат ещё не получен.
- `claude-native-live-result.json` подтверждает реальный native CLI host file-tool
  и продолжение той же сессии: **2/2**, полный выход дерева процессов, **11690**
  наблюдённых токенов. Это source-level harness. Compiled Task Chat native lane
  и полная fresh-instance browser-sign-in приёмка остаются отдельными gates;
  прежние записи `pending-auth` описывают историческое состояние.
- Brief Desk установлен через canonical import, без autostart и наследования
  credentials. Реальный foreground demo, редактирование, повтор demo и reimport
  прошли с сохранением project/settings/history hashes; временный сервер закрыт.
  Private `brief-desk-live-result.json`: pass, **0 provider requests**, **0 Telegram
  messages**. Targeted import/example tests **20/20**. Исправленная manual-инструкция
  согласована с реальными CLI, CSRF и UI. Это техническая offline-приёмка, а не
  работа с live keys/Telegram или итоговое принятие продукта пользователем.
- Пользователь отдельно одобрил Contract и Outcome Spec line-counter пилота,
  включая лимит **40000 токенов / 3 итерации / 30 минут**. Original reviewed copies
  и ответы сохранены в `child-pilot/operator-approvals.json`. После canonical
  approval/rebinding заново связаны research evidence и locks, без изменения
  согласованного результата и protected verifier. Создан настоящий scaffold;
  его smoke/health прошли, verifier установлен неизменённым.
- Delivery run `line-counter-claude-20261102` завершился blocked на
  `build_runtime_unavailable` / `provider_pending_auth` **до первого inference**:
  ledger **0/40000 токенов, 1/3 итераций**, живого model process нет. Metadata
  ожидаемого Keychain item существует; свежая metadata-проверка показывает
  default Keychain unlocked/readable/writable. Штатный credential reader всё же
  не получает значение, причина пока неизвестна. Нельзя объявлять ключ
  отсутствующим или Keychain заблокированным по этому результату. Evidence:
  `child-pilot/delivery-process-result.json` и
  `child-pilot/credential-metadata-diagnostic.json`. Следующий шаг после
  восстановления readiness — продолжить тот же bounded run, затем independent
  Trials и операторская приёмка; scaffold не является готовым продуктом.
- SDK live single-turn остаётся pending; подготовленный dry-run не считается
  реальным вызовом SDK. Local unknown coverage receipt сохранён, host reboot
  ещё не одобрен. Требуются compiled provider checks, настоящий voice-origin
  external-provider factory, remaining voice/composer/manual matrix и финальная
  приёмка. OpenRouter live отложен явно. R12 и goal не закрыты; GitHub и MacBook
  не изменялись. Частные пути, endpoints, credentials и raw transcripts в этот
  tracked checkpoint не перенесены.

### Checkpoint 46 — явный вход фабрики и корректная диагностика credentials

- Повторная operational-проверка работающей `3853e0a` после согласованного
  scaffold прошла (`current-operational-health-94-preparation.json`). Это новое
  наблюдение; отрицательные operational receipts попытки `0bcf566` и её отката
  сохранены. Новой активации после отката не было.
- `d14e126` различает отсутствие Keychain item, отказ доступа, timeout и прочие
  ошибки чтения credentials. Пользователю передаются только authored сообщения
  и allowlisted коды; raw stderr, пути и значения ключей не выводятся. Claude,
  NeuralDeep и OpenRouter прекращают подготовку до сети при ошибке чтения.
  Общий delivery blocker больше не предлагает исправлять Codex для другого
  исполнителя. Это улучшает диагностику, но не чинит текущий Keychain доступ.
- Для этого исправления прошли **67 уникальных targeted tests**, в том числе
  14 новых регрессий. Exact `d14e126` production build, typecheck и isolated
  strict probe **5 страниц / 12 JS chunks** прошли с полным выходом owned tree.
  Build ID: `SZsUaCSftlnOdGB45rZbx`. Единственный full self-test завершился
  **1484/1485**, **6/7 групп**: один старый healthcheck test полагался на SQLite
  внутри checkout. Этот результат сохранён как failure, а не pass.
- Исправление `7522459` делает healthcheck fixture изолированным: временный
  state/HOME, синтетическая SQLite из tracked schema, очищаемые данные.
  Точечный тест **1/1 pass** без готового индекса в исходном checkout.
  Каноническая БД не копировалась. Полный combined gate ещё предстоит.
- Аудит исходного B §5.4 уточнил прежнюю запись «R8 закрыт на уровне UI»:
  Subject/Phase сохраняли контекст, но обычный external Task Chat не получал
  canonical factory capability. Это реальный оставшийся пробел исходного scope.
  `b7c2e18` добавляет отдельный **Create new agent** и `factoryIntent` со slug.
  Сервер определяет target и private state; parent остаётся read-only.
  Subject/Phase сами по себе не дают factory authority. Native Codex сохраняет
  прежний workflow. Existing project adoption через этот вход запрещён.
- Typed и voice entry используют общий host binding и прежний worker. Отдельные
  hash-bound Contract/Outcome approvals, research, budgets, immutable Trials,
  process ownership и финальное user acceptance сохранены. Replay после потери
  ответа/перезапуска возвращает исходный chat, даже если scaffold уже появился;
  подмена intent/model/workspace конфликтует. Изменение доступности provider
  позволяет снять Create new agent и явно объясняет недоступность.
- Для typed entry прошли **88 уникальных targeted tests**, typecheck и diff check.
  Два исходных failures при ограниченном socket-доступе сохранены отдельно;
  соответствующие тесты прошли при корректных правах. Добавлены три browser
  cases (1440/390 px, exact retry после reload, capability loss/Codex switch),
  они ожидают общую production build. Реальный UI/voice factory lifecycle не
  объявлен пройденным по synthetic worker tests или CLI pilot.
- SDK dry validation обновлена для `d14e126`: **10/10**, без credentials, сети
  и model calls. Native compiled harness и SDK live остаются pending.
  Штатное пересохранение Claude API/NeuralDeep в Settings запрошено у оператора;
  новые Keychain prompts/ACL изменения или обходы доступа не выполнялись.
- Line-counter run сохраняет **0/40000 токенов, 1/3 итераций**. Его elapsed window
  началось `2026-11-02T06:41:37Z` и заканчивается `2026-11-02T07:11:37Z` даже при
  ожидании credentials. После срока требуется явное budget amendment;
  повторный run, сброс clock или возврат итерации не подменяют одобрение.
- Следующий combined gate: один self-test плюс отдельная недостающая
  Agents Mother self-inspection, production build, typecheck, новые/прежние
  targeted browser cases и strict health. Новая активация требует отдельного
  непосредственного approval для exact combined candidate. Local reboot,
  оставшиеся реальные voice/onboarding/factory checks и финальная приёмка ещё
  открыты. OpenRouter live отложен пользователем; GitHub/MacBook не изменялись.

### Checkpoint 47 — общий автоматический gate перед активацией

- На frozen `2eec60d` выполнен один полный self-test: **1495/1495 tests**,
  **0 skipped**, семь групп pass, без self-test regressions и top-level warnings.
  Отдельная Agents Mother self-inspection завершилась `complete`, exit 0:
  совокупно **8/8 quality groups** без повторения полного unit suite.
  Вложенный quality payload сохраняет одно прежнее предупреждение о префиксах
  четырёх исторических commits. Оба owned process trees завершились, timeout нет.
- Изолированный индекс содержит **771 docs / 7275 chunks / 7054 embeddings**.
  Это не размер канонической пользовательской памяти. Read-only сравнение
  показало в canonical snapshot **1005 docs / 11253 chunks**: там дополнительно
  281 instance-agent-state документ и 15 локальных Markdown (6 ignored,
  9 untracked); в чистой копии вместо private overrides используются 62 tracked
  reference artifacts. **Ни один tracked curated path не потерян.** Wiki в обеих
  копиях совпадает: 112 docs / 694 chunks. Shared content различается только
  двумя обновлёнными roadmap/report (+4 chunks). Canonical index не менялся.
- Production build `2eec60d` — `7t1K3LJfnrZIXVGLOi4-M`; typecheck, exact-source
  isolated health **5 pages / 12 JS chunks** и полный выход owned tree прошли.
- Пять targeted browser suites дали **29 уникальных успешных сценариев**.
  Исходный прогон: 28/29; новый capability-loss тест неверно ожидал состояние
  checkbox после его удаления из DOM. Snapshot/trace подтвердили корректный UI.
  Test-only `b27bf2d` проверяет click, исчезновение control, сохранённый draft,
  Subject и доступный Send; точечный повтор **1/1 pass**. Production UI не менялся,
  исходный failure и trace сохранены. Все три новых factory cases прошли.
  Ошибка имени лога в private retry wrapper сохранена отдельно; owned test tree
  закрыт до повторного запуска, прежние receipts не подменены.
- Чистый tracked source archive с отдельными state/HOME подготовлен для первого
  входа Claude. Пять preparation checks прошли: начальный `not-configured`,
  готовая команда с обоими root aliases и state, запуск plan из другого cwd,
  без auth process и без создания credential state. Использована независимая
  копия locked dependencies; download/bootstrap и browser sign-in этим не
  проверялись. Live first-run acceptance остаётся за пользователем.
- Native compiled dry **11/11** и SDK dry **10/10** не делали provider/model calls.
  Их live attempts ещё не запускались. После финальной фиксации документов и
  test-only correction последуют проверка doc/source-map delta и build identity;
  изменённого runtime-кода после полного gate нет.
- Production по-прежнему `3853e0a`. Новый exact candidate, managed activation,
  восстановление API credential access, явное продление elapsed window того же
  line-counter run, Local reboot и remaining voice/onboarding/factory/manual
  acceptance остаются открыты. Goal не завершён; GitHub и MacBook не затронуты.

### Checkpoint 48 — b404a6d активирован; память проверена; Keychain остаётся блокером

- После отдельного approval оператором выполнен управляемый переход с `3853e0a`
  сразу на `b404a6d`. Build `jL62rGMtb_W3itHa0cD3z`, точная source/instance
  identity, **5 страниц / 12 JS chunks**, admission и operational health прошли.
  Durable receipt сохранён до cleanup; предыдущие source/build/dependencies и
  девять посторонних untracked файлов сохранены. GitHub и MacBook не изменялись.
- Канонические memory rebuild, offline embeddings и frozen retrieval завершены
  с полным выходом owned процессов: **1005 docs / 11258 chunks / 11037 embeddings**.
  FTS Hit@5 **45/48**, Hit@10 **46/48**, holdout Hit@5 **23/24**; semantic **31/35**,
  hybrid **41/45** (Hit@5/Hit@10). **0 regressions, 0 private leaks**; SHA frozen
  fixture не изменился. Изолированная тестовая база не подменяла каноническую.
- Единственная compiled-native попытка на `b404a6d` завершилась `native_not_ready`
  **до model dispatch и создания чата**. Temporary preset восстановлен через CAS;
  attempt lock и failure receipt сохранены. Source-native pass 2/2 остаётся
  историческим результатом. SDK live не запускался; dry 10/10 не заменяет его.
- Пользователь подтвердил прежнюю исправную работу NeuralDeep и сообщил отказ
  повторного сохранения ключа. Ordinary credential reader теперь получает exit 51
  до HTTP/model call; default Keychain при этом unlocked/readable/writable.
  `securityd` сообщает `CSSMERR_CSP_INVALID_DATA`. Это не доказывает повреждение
  хранилища и не устанавливает виновную программу. Имя service и функция записи
  ключа полностью совпадают между ранее рабочей `3853e0a` и текущей `b404a6d`.
  Секреты не запрашиваются повторно; ACL, пароли и Keychain не сбрасывались.
- `bcb7c3b` различает отказ Keychain, timeout и неизвестный результат записи;
  UI считает сохранение успешным только при `stored: true`, очищает поле и не
  запускает автоматические повторы. Проверены **23/23 targeted unit** и **4/4
  desktop/mobile browser cases**, без пропусков; owned browser tree завершён.
  Дополнительные **2/2** browser cases проверили HTTP 200 без подтверждённой
  записи и успешную запись при последующем HTTP 503: всего **6 уникальных passes**.
  Это исправление диагностики, не доказательство восстановления Keychain.
  Полный self-test на `bcb7c3b`: **1497/1497 tests**, **0 skipped**, семь групп
  pass; отдельная Agents Mother self-inspection завершила **8/8 quality groups**.
  Регрессий и top-level warnings нет; вложенное предупреждение о четырёх старых
  commit prefixes сохранено. Все owned trees завершены. Runtime больше не менялся;
  новый exact build обязателен перед отдельной активацией.
- Перезагрузка сейчас отложена пользователем. Предложенная обычная блокировка/
  разблокировка экрана — только возможная попытка восстановления системной сессии,
  не выполненное действие и не гарантированное решение. Local receipt остаётся
  неприкосновенным: screen unlock не заменяет проверку новой boot session.
- У approved line-counter run осталось **0/40000 использованных токенов, 1/3
  итераций**, но истёк тридцатиминутный elapsed window. Перед продолжением нужны
  readiness и отдельное продление времени того же run, без сброса ledger.
  Fresh onboarding, оставшаяся voice/factory и финальная операторская приёмка
  остаются открыты. Goal возобновлён; ожидание перезагрузки не закрывает R12.

### Checkpoint 49 — восстановление подключений и ошибки бюджетного отказа

- Пользователь перезагрузил Mac mini. Смена kernel boot identity проверена;
  прежний Local receipt с неизвестным завершением архивирован с сохранением
  исходных байтов и SHA-256. Проверка не ослабляет process ownership и не
  трактует отсутствие отдельных PID как подтверждение полного завершения.
- После повторного сохранения активного API-ключа Claude catalog отвечает ready.
  NeuralDeep также ready. Native Claude на действующей сборке выполнил реальное
  чтение неизвестного заранее токена через host tool и продолжение того же чата:
  **2/2**. Preset восстановлен до dispatch; live HTTP подтверждает terminal
  contract и отсутствие активного turn, но не заменяет прямой OS process proof.
- SDK **0.3.306 / bundled CLI 2.1.306**: один фиксированный MCP tool,
  два Messages-запроса, **1404 observed tokens**, 6247 ms, полный process exit.
  Настоящий ключ оставался у host; native OAuth не использовался. Это отдельная
  SDK-проверка, а не завершённый child pilot.
- Одобренное пользователем продление окна child pilot на 30 минут применено к
  исходному ledger; токены и итерации не обнулены. Две оставшиеся итерации
  создали реализацию, но независимый неизменённый verifier пока failed:
  вызов CLI без аргументов ошибочно возвращает успешную справку.
  Израсходовано **35718/40000**, использовано **3/3** итерации. Никакого
  дополнительного платного запуска без нового разрешения не выполнено.
- Выявлена ошибка Pritha: stock Claude CLI сообщает ошибку API как assistant
  с `model: <synthetic>` и типизированным полем `error`. Stream validator
  принимал её за подмену модели; цикл мог потратить следующую итерацию вместо
  остановки на бюджетном blocker. Этот узкий error envelope теперь остаётся
  отказом без публикации текста диагностики и без добавления usage. Настоящая
  подмена model/session и synthetic tool payload по-прежнему отклоняются.
- Budget отказ до reservation теперь сохраняет terminal error checkpoint,
  оставляя измеренные расходы и отсутствие нового inference проверяемыми при
  recovery. Ошибка сохранения checkpoint останавливает исполнение.
- **56/56** целевых тестов: parser, budget, runner, proxy и executor для
  четырёх provider backends. Регрессии сначала
  воспроизведены на старом коде. Отдельная проверка установленной CLI **2.1.296**
  с локальной имитацией token-count endpoint и бюджетом 1 подтвердила правильный
  `provider_budget_exhausted`, zero inference и полный process exit.
  Полный gate нового source snapshot ещё предстоит.
- Local загрузился и закрыл readiness probe. Первый compiled тест исправлен
  только в части слишком короткого HTTP observation timeout; следующий реальный
  turn не уложился в 270 секунд и штатно interrupted, receipt освобождён.
  Диагностика показала около 48 тысяч символов базовых/project instructions
  до tool schemas. Новая ограниченная проверка сохраняет весь контекст,
  CPU-конфигурацию, offline sandbox и начинает отдельный turn после полного
  завершения прежнего. Успех производительности не заявляется.
- Good State alignment: **aligned** с Reliable Control Center и Voice Ducking.
  Production lifecycle, остальные экземпляры, MacBook и GitHub не менялись.
  Обновлённый код остаётся в отдельном локальном checkout до staged acceptance.

### Checkpoint 50 — передача уточнения после продления бюджета

- Пользователь разрешил общий лимит child pilot **60000 tokens / 4 iterations**
  и ещё 30 минут. Применено к тому же run; Contract, Outcome и verifier сохранены.
  Исполнитель использовал исправленный локальный source `2ed2bf4`; production
  Control Center оставался на `b404a6d`.
- Четвёртая итерация израсходовала 19812 tokens; общий наблюдаемый расход
  **55530/60000**, **4/4**. Остановлена с правильным `token_budget_exhausted`,
  measured usage и полным process exit. Исправление пустого argv ещё не сделано;
  это не успешный child delivery. Новые платные итерации не запущены.
- Найдена отдельная причина отсутствия прогресса: `resume --guidance` передавал
  уточнение только через handler существующего blocker. После budget amendment
  статус уже `correcting`, и уточнение не доходило до executor. Теперь resume
  сохраняет bounded guidance после проверки approved plan и свежести Trials,
  до dispatch, для активного run. Host-only verification и terminal results
  не получают этот побочный эффект. Отдельные `budget`/`resume` и совмещённая
  команда покрыты воспроизведёнными регрессиями.
- **58/58** delivery/reconciliation/task-control/readiness tests passed после
  исправления. Предыдущие **56/56** Claude tests и проверка настоящей CLI без
  inference остаются отдельными свидетельствами. Полный gate готовится для
  совокупного изменения; production activation не выполнена.
- Повторная Local Task Chat проверка с тем же CPU model, полным контекстом и
  лимитом 550 секунд на turn также не завершилась. Exact-turn interrupt и
  освобождение owned receipt подтверждены. Увеличение времени не объявляется
  решением производительности; live compiled Local file/resume остаётся открыт.
- Оставшиеся gates R12 не сокращены. GitHub, MacBook, secrets и служба не
  изменялись. Все три исходных приложения сохранены дословно.

### Checkpoint 51 — общий gate и выбор существующего child workspace

- Совокупный source `f8f006b` прошёл **1502/1502** unit tests, self-test
  и отдельный Agents Mother check: все восемь quality groups успешны,
  supervising receipts подтверждают завершение деревьев процессов. Этот gate
  относится к исправлениям бюджетного отказа и передачи guidance, не к
  последующему изменению выбора workspace.
- Проверка реального каталога обнаружила, что существующий пилот с именем
  `pritha-line-counter-acceptance` отсекается общей защитой префиксов Pritha.
  Для существующего child теперь допускается такой префикс только после
  свежей проверки единственной identity, текущего instance, accepted Contract
  с тем же agent ID и точного sibling project. Bare `Pritha` / `Techscope`,
  неподтверждённые и foreign contracts, symlinks, canonical package names и
  checkout структуры по-прежнему отклоняются. Создание нового target не
  получает это исключение.
- Обе регрессии сначала воспроизведены на старом коде; **106/106** проверок
  identity/workspace/provider runtime/voice routing прошли после исправления.
  Дополнительные assertions отклоняют accepted Contract другого instance и
  подтверждены отдельно. Финальный общий gate и build нового source впереди.
- Дополнительный Local compiled trial подготовлен для существующего небольшого
  child project с проверкой instance catalog и read-only SQLite binding.
  Он сохраняет все инструкции, sandbox, offline engine, файл с nonce и resume.
  Этот сценарий не заменяет незавершённую проверку большого контекста Pritha;
  операторская приёмка и общий performance pass не заявляются.
- Good State alignment с Reliable Control Center и Voice Ducking — **aligned**.
  Production остаётся на принятой сборке; остальные gates R12 остаются открыты.

### Checkpoint 52 — принятый живой пилот и строгий naming gate

- Пользователь разрешил тот же Claude run до **90000 tokens / 5 iterations**
  и ещё 30 минут. Уточнение записано в ledger до начала пятой итерации и
  передано executor. Claude исправил пустые аргументы; финальный provider turn
  остановился на бюджетной reservation после записи изменения. Наблюдаемый
  итог **83335/90000**, **5/5**, usage полностью сохранён.
- Host-only verification без новых model turns прошла исходные независимые
  Trials: 10 content cases, 6 ошибок аргументов/пути, help и README. Verifier,
  Contract и Outcome неизменны. Прежние неудачи остаются в private ledger.
- Пользователь принял демонстрацию и отдельно разрешил применение двух файлов.
  Проверенный commit `98c3805` применён к основному child checkout; прежние
  Trials и structural smoke снова прошли, tracked tree чист. Private handoff
  report сохраняет accepted behavior, расходы и локальный recovery anchor.
  Это закрывает реальный пилот фабрики; голосовое создание ещё не принято.
- Общий gate source `af51679`: **1503/1504**. Единственный отказ — naming
  allowlist сохранил старый SHA строки reserved-name guard после его изменения.
  Review заменил ровно эту устаревшую строку; новых legacy allowances нет.
  **6/6** проверок имён/alias entrypoints после исправления успешны. Полный
  повторный gate выполняется на следующем зафиксированном snapshot.
- Дополнительный compiled Local trial в небольшом существующем child workspace
  также достиг лимита 330 секунд. Own-turn interruption, освобождение receipt
  и неизменность tracked child files подтверждены. Performance gate остаётся
  открытым. Подготовлена ограниченная диагностика scheduling ephemeral CPU
  inference; настройка production-службы не менялась.
- Исходные материалы сохранены целиком; R12 не закрыт. MacBook и GitHub не
  изменялись. Публикация и полный Git/tag baseline отдельно не разрешались.

### Checkpoint 53 — Claude onboarding и ресурсная политика Local

- Source `d619a5e` прошёл полный повторный **1504/1504** unit gate, self-test и
  отдельную Agents Mother проверку: восемь успешных quality groups, supervising
  receipts подтверждают полный exit. Предыдущий naming failure сохранён.
- Пользователь выполнил одну подготовленную команду входа в чистом экземпляре.
  Tracked source archive, независимые зависимости и пустой state не получали
  скопированных credentials. Проверены foreign-cwd entrypoint, persisted auth,
  первый реальный native file tool и resume той же native session — **2/2**.
  Исходный AGENTS сохранён побайтово, оба process tree завершены. Вход и первые
  задачи не требовали API key или ручного исправления путей.
- Измерение Local с исходными CPU settings показало около **13 tokens/s** при
  prefill. Снятие background flag у уже запущенного PID и увеличение batching /
  threads проблему не решили. Изолированный запуск с application resource
  policy обработал **4719 input tokens за 64618 ms** и вернул точный ответ.
  Это component evidence, не готовая compiled Task Chat приёмка.
- Local launcher на macOS теперь запускает точный прежний sandbox plan через
  системный `taskpolicy -a` до старта engine workers. Pinned engine/config,
  минимальный environment, network/file sandbox и supervisor proof сохранены.
  Linux оставляет прежний launch plan. Actual sandbox canary по-прежнему
  отклоняет foreign loopback, внешний адрес и приватный файл и не получает
  parent credentials. **8/8** Local и **5/5** compatible-runner checks прошли.
  Darwin regression сначала воспроизведена на старом коде.
- Дополнительная проверка нового launcher с настоящим background parent
  выполняется отдельно. Runtime service и канонический Local config не менялись;
  полный gate/build нового source и live compiled file/resume ещё впереди.
- В рамках разрешённой компактной Local подготовки дополнительно загружен
  официальный `Qwen/Qwen3-1.7B-GGUF` Q8_0, pin
  `90862c4b9d2787eaed51d12237eafdfe7c5f6077`, SHA-256
  `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a`.
  Файл проверен, но модель не выбрана и service не установлен. Источник:
  [официальная model card](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF), проверена
  2026-11-02. Смена модели не считается исправлением без прежних Trials.
- Good State alignment — **aligned**: Local scheduling не меняет принятую
  изоляцию, ownership и recovery. Voice factory и остальные manual gates R12
  сохранены; GitHub и MacBook не изменялись.

### Checkpoint 54 — отклонённые scheduling prototypes и полный policy index

- Application resource policy ускорила отдельный foreground component, но
  повторные background-parent trials не подтвердили эффект: изменение PID,
  pre-start supervisor, throughput/latency tiers и отдельный thread QoS не
  завершили контрольный запрос. Эти prototypes **не продвигаются**: Local runtime
  и связанные tests возвращены побайтово к проверенному `d619a5e`. Private
  patches и все неудачные receipts сохранены. Служба не менялась.
- Официальный Qwen3 1.7B Q8_0 с выключенным thinking прошёл real owned Responses
  и exit probe, но первый tool turn с прежним большим контекстом достиг
  550 секунд. Это не успешная Local приёмка и не основание менять live preset.
- Запрос установленной Codex CLI **0.153.0** проверен без модели через отдельный
  loopback receiver, отвечающий фиксированным HTTP 400. Исходный `AGENTS.md`
  занимает **62594 bytes**; в стандартном запросе project instructions неполны.
  Штатный `model_instructions_file` меняет built-in layer отдельно от project
  layer, но этот runtime override не выбран для продвижения.
- `AGENTS.md` теперь содержит обязательный invariant/routing index **6186 bytes**.
  **Полный прежний файл, включая frontmatter и stable ID, сохранён побайтово**
  в `docs/pritha-agent-policy.md` и остаётся обязательной политикой. Его SHA-256
  сверён с исходным Git blob; исходный policy body SHA-256
  `be56f9e19043b5b4b424b775caa3b0b425a8425ba023e451c5dd952d1103839b`.
  Core сохраняет always-on privacy, instance isolation, approvals, budgets,
  lifecycle, Good State и acceptance; детальные процедуры читаются по scope.
- Zero-model paired capture подтвердил, что **весь новый index присутствует**:
  default request уменьшился **57602 → 30793 bytes** при том же built-in layer.
  Full policy доступна по прямой ссылке. Никакие runtime permissions, sandbox,
  default provider, model/session bindings или CLI flags не ослаблены.
- Markdown validation, privacy strict и **6/6** naming/alias tests успешны.
  Полный candidate gate, memory checks и повторный actual Local file/resume
  с routed instructions ещё предстоят. Исходные A/B/C приложения сохранены
  целиком; scope остальных R12 gates не сокращён.
- Good State alignment — **aligned**: подробные правила сохранены целиком,
  разрешения не расширены, код guardrails не менялся. GitHub/MacBook и production
  lifecycle не затрагивались.

### Checkpoint 55 — действующий Local 4B и профиль интерактивной службы

- Gate `ffebc60`: **1503/1504**. Единственная регрессия — Codex-facing Tailscale
  protocol test требовал конкретные mutating command forms прямо в index.
  `install --yes`, `serve --yes`, `off --yes`, immediate separate approval и
  peer-device verification возвращены в обязательный короткий index. Полная
  старая политика по-прежнему сохранена побайтово; тест не ослаблялся.
- Прежняя **Qwen3 4B Q4_K_M**, с теми же engine, model и canonical CPU settings,
  прошла real owned Responses, файл с непредсказуемым nonce через завершённый
  `read_file` и продолжение той же native session. **Все четыре проверки passed**,
  process trees exited; первые/вторые task turns сделали 2/1 model requests.
  Source-level test использовал routed project index и полный policy document.
  Он занял около четырёх минут целиком; compiled installed check ещё впереди.
- Установленная macOS manual `launchd.plist(5)` подтверждает: `Background`
  ограничивает CPU/I/O для не запрошенной пользователем работы; `Interactive`
  соответствует ресурсам приложения; `Adaptive` зависит от XPC transactions.
  Control Center обслуживает HTTP-запросы пользователя и не использует такие XPC
  transactions. Template переведён в **Interactive** без новых process wrappers,
  permissions или model configuration changes.
- Managed installation test сначала воспроизвёл старый Background profile;
  после template change **18/18** runtime/Tailscale tests прошли, включая drain,
  uncertain/unowned listeners, circuit, state-root lock и private profile paths.
  Source сам по себе не меняет уже установленный job.
- Staged workflow уточняет approved profile migration: stop → source/build swap →
  manager `install --yes` (может запустить RunAtLoad job) → identity/health/admission.
  Предыдущие installed/private profiles и hashes входят в rollback. Этот шаг
  требует отдельного immediate approval вместе с конкретным candidate; реальная
  установка профиля и остановка production сейчас не выполнялись.
- Full candidate gate/build/browser/rollback preparation выполняются следующим
  шагом. Local compiled и оставшаяся manual Voice/factory приёмка остаются открыты.
  Good State alignment — **aligned**; MacBook и GitHub не изменялись.

### Checkpoint 56 — полный gate и завершение описи релиза

- Кандидат 8ebcf405 прошёл self-test: **1504/1504**, без fail/cancel/skip;
  семь групп self-test и отдельная agents-mother группа pass. Self-test не
  содержит warnings или regressions. Оба supervised process tree завершились.
- Первая попытка нового harness не запустила тесты: её локальный PATH не
  содержал фактический Node. Причина исправлена только в private окружении;
  ранняя ошибка и новый полный успешный прогон сохранены отдельно.
- Сравнение всей описи с Git delta обнаружило четыре уже tracked файла,
  отсутствовавших в прежнем списке. Опись дополнена до **579 файлов** плюс
  сам manifest; каждый размер/хеш и полнота относительно исходного base
  проверены. Исходные три вложения остаются в этом roadmap без сокращения.
- Этот финальный commit меняет только roadmap и manifest. Исполняемые,
  интерфейсные и policy inputs остаются теми же, что прошли gate 8ebcf405.
  Production build/typecheck и изолированный same-build browser/strict probe
  выполняются на окончательном commit перед запросом lifecycle approval.
- Существующая рабочая b404a6d отдельно проверена в изолированном rollback
  probe: **5 страниц, 12 JS chunks**, exact build identity, tree exit confirmed.
  Оригинальные installed/generated Background profiles сохранены с хешами;
  прежний manager/template воспроизводит их побайтно для approved rollback.
- Никаких production lifecycle действий, замены модели, GitHub или MacBook
  изменений на этом checkpoint не выполнялось.

### Checkpoint 57 — установленный 5f38f37 и операторская Voice-приёмка

- Разрешённая managed активация 5f38f37 и Interactive profile завершена.
  Strict/operational health: 5 страниц и 12 JS chunks, admission включён.
- Память rebuilt/embedded; frozen FTS 45/48 @5, 46/48 @10, holdout 23/24,
  без регрессий и private leaks. Исходная фикстура не менялась.
- Compiled Local: первый общий запрос завершился без timeout, но 4B-модель
  вернула tool-shaped JSON вместо ответа. Отдельный тест с пояснением inline
  text field прошёл 2/2; original fail сохранён. Оба process sets проверены.
- Пользователь подтвердил GPT Realtime 2, memory/README, прерывание,
  продолжение темы после reconnect и плавную работу музыки. Это принятый scope,
  который сохраняется при следующих изменениях; Live 1/ND/factory не подменяются.
- После сообщения о загрузке через Tailscale backend/API/chunks и чистые
  Chromium/WebKit/настоящий Safari загрузились. Пользователь продолжил работу
  с Voice и Task Chat; точная причина прежней зависшей вкладки не установлена.

### R12 follow-up — картинки Claude и индикатор микрофона

Причина блока картинок подтверждена в коде: Claude adapter объявляет images=false
и использует file-only transport. Поддержка модели и поддержка runtime — разные
проверки. Новый scope реализуется в изолированном checkout; live 5f38f37 сохраняется.

1. [x] Перед изменениями сохранить private accepted Voice state и выполнить
   пропорциональную Good State Alignment.
2. [x] Добавить Claude image transport: immutable/chat-bound originals, MIME/size
   bounds, разрешённые модели и exact CLI versions; реальные MCP image blocks,
   без превращения изображения в текстовый путь или чтения чужого файла.
3. [x] Сохранить API-key/native separation, opaque native auth, protected paths,
   отсутствие чужих credentials, token accounting и no-replay guarantees.
4. [x] Проверить stock CLI initial/resume с синтетическим upstream без платных
   вызовов: SHA оригинальных PNG/JPEG/GIF/WebP, недопустимые MIME/URL/foreign IDs,
   отказ при повреждении snapshot и неподтверждённой CLI/model capability.
5. [ ] Выполнить отдельную живую vision-проверку на синтетическом изображении;
   пользовательские скриншоты не отправлять сторонним моделям для тестирования.
6. [x] Восстановить microphone signal meter по GitHub NeuralDeep на pin
   2ab22aeff5f1c167c86e925ec30311942b76023b; исходный meter находится в
   VoiceControlPage.tsx. Использовать существующий microphone stream, не
   запрашивать второй microphone access, не менять gain/ducking/audio route.
7. [x] Проверить живой RMS/idle/mute/stop cleanup, оба voice engines, desktop/mobile
   и отсутствие audio/model calls до Start Listening.
8. [x] Дополнить документацию маршрутизации: Settings задаёт default, выбор
   Task Chat закрепляется за чатом, Voice фиксирует default/preset на старте
   сессии; продолжение существующей темы сохраняет её binding.
9. [ ] Focused suites → общий gate → production build/typecheck → browser/strict
   candidate checks → rollback package → точное lifecycle approval → live smoke.
10. [ ] Завершить оставшуюся операторскую приёмку и единый реальный Voice/Claude UI
    factory pilot с отдельными Contract/Outcome и новым утверждённым бюджетом.

### Checkpoint 58 — картинки Claude и возвращённый RMS-индикатор

- В кандидате Claude получает реальные MCP image blocks из immutable/chat-bound
  оригиналов. Модели требуют положительный imageInput и exact CLI 2.1.296;
  MIME PNG/JPEG/GIF/WebP, 5 MiB/image, 15 MiB/request, 32 MiB encoded request.
- Настоящая stock CLI с синтетическим upstream прошла initial/resume для всех
  четырёх форматов и PNG 2400×1400. CLI уменьшает крупные MCP-картинки;
  API proxy восстанавливает только оригинал точного read_file attachment URI
  этого чата перед count_tokens, reservation и dispatch. Foreign/URL/tampered
  inputs отклоняются; originals и recovery receipts сохраняются.
- Живая API-проверка: код с синтетического PNG 2400×1400 прочитан через read_file,
  продолжение той же session вернуло код без tools. Обе process trees завершены;
  observed usage 9491 + 7339 токенов. Пользовательские изображения не отправлялись.
- Native CLI вернула authentication_failed/expired OAuth до первого read_file;
  observed usage 0. Это отдельная незавершённая приёмка, а не vision pass.
  Пользователю передана обычная instance sign-in команда. Диагностика кандидата
  сохраняет typed sign-in-required вместо generic runtime failure; raw OAuth
  diagnostics и credentials не публикуются.
- Meter восстановлен из GitHub NeuralDeep pin: существующий onCapture callback
  и прежний маленький meter рядом с усилением. OpenAI Realtime/Live используют
  отдельный analyser существующего обработанного stream, без второго microphone
  запроса или audio destination. Mute/stop/ended/suspended и reconnect проверены.
- Typecheck, focused suites и 12 Chromium browser scenarios прошли, включая
  Realtime/Live/NeuralDeep на desktop/mobile. Полный gate, финальный build,
  exact candidate/rollback и managed deployment остаются следующими шагами.
- Установленная 5f38f37, MacBook и GitHub не изменялись. Принятая пользователем
  Realtime 2/music-приёмка сохранена; прочие ручные gates не объявлены пройденными.

### Checkpoint 59 — completion audit, Voice Speech и alias нового Claude-чата

- Три исходных ТЗ снова сверены побайтно с приложениями. Учтены все 61 уникальная
  ссылка на файлы/globs: 53 существуют буквально, 8 имеют reviewed equivalents,
  перечисленные в общем convergence review. Это проверка трассировки, а не
  автоматическое признание всех функций принятыми пользователем.
- Устаревшие верхние статусы roadmap/deployment report исправлены с сохранением
  исторических срезов. CLI child pilot отделён от незавершённого B §5.4 UI journey.
  Добавлен общий review всех A/B/C/D, фактических модулей, доказательств и ограничений.
- Отдельные boundary audit CLI на ff33d8f: secrets 26/26, network 87/87 для всех
  внешних connector IDs. Synthetic/offline scope указан явно; live key scan не заявлен.
- NeuralDeep Speech проверен настоящими конечными HTTP-вызовами: Serena синтезирует
  синтетическую русскую фразу, Whisper распознаёт её дословно; модель голосового
  диалога отвечает с exact qwen3.6-35b-a3b-noreason, 45 observed tokens. Browser,
  session/tool routing и операторский звук этим не подменяются; настройки не менялись.
- Проверка нового Claude-чата выявила дополнительный баг: alias sonnet не совпадал
  с exact catalog ID, поэтому image capability lookup не находил модель. Новый
  regression test воспроизвёл отказ до исправления. Ready preview теперь выбирает
  resolved ID, selector показывает эту модель и reasoning, сохранённый preset
  не перезаписывается. Existing thread binding имеет приоритет.
- Focused gateway tests 2/2, TypeScript и 12 provider-selector browser cases прошли,
  включая первое изображение в новом Claude-чате на desktop/mobile. Реальные
  уже успешные платные Claude vision-тесты не повторялись.
- Непосредственно перед установкой запрос на ff33d8f отозван как предварительный.
  Canonical 5f38f37 продолжает работать. Исправленный кандидат должен пройти
  соответствующие общий gate, build/strict/browser и отдельное разрешение.

### Checkpoint 60 — установленный 73aafb5 и общий default Task Chat / Voice

- По отдельному подтверждению пользователя установлена `73aafb5`, build
  `q6BhRZGywaiSeiVjqaTJX`. Managed transaction, admission, operational health,
  пять страниц и 12 JS chunks прошли; Interactive сохранён. Девять посторонних
  untracked файлов сохранены по хэшам. GitHub и MacBook не менялись.
- Полный gate этой установленной ревизии: 1515/1515; 33 fixture и два сценария
  с реальным Claude catalog/attachment API. Native Claude image initial/resume
  после обычного входа: 2/2, 18 926 observed tokens, оригинал неизменён.
- Canonical memory после установки: frozen fixture прежний, регрессий/утечек 0.
  HTTPS с самого Mac mini: пять страниц / 12 chunks; это не новая peer-приёмка.
- Brief Desk прошёл фактический offline UI: демо, правка, reload, повторное демо,
  повторный импорт с сохранением 27 файлов. Desktop/mobile визуально проверены;
  конечный тестовый сервер остановлен. Провайдер и Telegram не использовались.
- Новое уточнение пользователя: выбранного и настроенного провайдера нужно явно
  зафиксировать как единый default новых Task Chat и задач Voice Control. При
  незаконченной настройке такая фиксация недоступна. Панель настройки и уже
  зафиксированный default должны различаться визуально.

Порядок доработки этого уточнения:

1. [x] Сверить Good State; сохранить существующие задачи, историю и audio context.
2. [x] Общая заметная кнопка фиксации и отметка default на карточке; несохранённый
   preset, ключ/native configuration и неоконченная readiness-проверка блокируют её.
3. [x] Серверный ready-only gate перед фиксацией с проверкой ревизии под lock.
   Старый default сохраняется при отказе; сохранение preset и активация разделены.
4. [x] Новые Voice task/intake берут зафиксированный default в момент dispatch;
   старые task bindings и аудиопротокол сохраняются. Local offline не ослабляется.
5. [x] Отрицательные и конкурентные regression-тесты, browser desktop/mobile,
   проверка самостоятельного Task Chat override; затем общий gate/build/typecheck.
6. [x] Подготовить exact candidate и откат к 73aafb5. Только после отдельного
   непосредственного approval — managed update и strict pages/chunks/admission.
7. [ ] Вернуться к реальному Voice → Claude UI factory пилоту с отдельными
   Contract/Outcome/budget approvals и завершить оставшуюся ручную приёмку.

### Checkpoint 61 — установленный общий default и диагностика Voice → Claude

- По отдельному указанию пользователя установлен `f9e92ed`; managed transaction,
  strict/operational health, task admission, пять страниц и 12 JS chunks прошли.
  Предыдущая `73aafb5` сохранена для отката; девять посторонних файлов не менялись.
  Memory retrieval прошёл без регрессий и private leaks. GitHub и MacBook не менялись.
- Живая попытка Voice → Claude выявила неверный тип handoff: новый headless CLI
  попал в `implementation` исходного проекта вместо `agent_creation` отдельного
  агента. Dirty-workspace gate остановил его до создания чата и model turn.
  Это не отказ Claude и не повод коммитить либо удалять посторонние файлы.
- Повторная операторская попытка на прежней установленной версии воспроизвела
  тот же неверный route. В новом runtime неоднозначный implementation brief с
  созданием Contract/Outcome отклоняется до reservation/probe. Voice получает
  typed correction: подтвердить уже явно заданный new-agent intent в параметрах
  tool, либо уточнить существующий проект. Это не автоматическое повышение прав
  по свободному тексту и не повторный запуск сохранённой карточки.
- Маршрутизация нового агента явно описана в Voice tool schema и instructions:
  `agent_creation` + `subject_kind=agent` + exact slug. Подтверждение brief
  разрешает подготовить drafts, но не заменяет отдельные Contract, Outcome Spec
  и budget approvals. Существующая read-only parent boundary и factory tools
  сохранены; свободный текст сам по себе не повышает права.
- Диагностика сохраняет typed pre-dispatch error и показывает причину остановки
  вместе с 0% до dispatch. Старая карточка не переписывается в другую задачу и
  не запускается повторно при polling. Native full-access policy больше не
  описывает bounded external execution; write/consequential-action gates остаются.
- Claude не имел host `web_search`/`read_page`, поэтому ответ об отсутствии
  погодных данных не был web acceptance. Инструменты подключены к существующему
  SearchService: выбранный search backend, budgets, Requested/Off, privacy/SSRF,
  cancellation и запрет сети у `run_command` сохраняются. У каждой Voice-задачи
  отдельное закреплённое разрешение поиска; отсутствие `requires_internet=true`
  и явное «без сети» запрещают поиск. Local/OpenRouter не получают новых tools.
- Regression-проверки воспроизводят dirty-parent failure и успешный read-only
  factory draft, проверяют отдельные approvals, нулевой pre-dispatch progress,
  MCP search, отрицательные privacy/offline cases, queue и restart. Полный gate,
  staged build/browser/rollback и отдельное lifecycle approval относятся к
  следующему кандидату; его установка и живая web-приёмка пока не заявлены.
- Реальный Voice → Claude factory pilot, separate artifact/budget approvals,
  независимые Trials и оставшаяся операторская audio-приёмка остаются открыты.
  Старый принятый Line Counter pilot не подменяет этот UI journey. Good State:
  **aligned** — сохранены история, pinning, границы записи и release workflow.

### Checkpoint 62 — типизированный factory brief и доказательство создания черновика

- `ee5987b` установлен после отдельного approval. Пять страниц, 12 JS chunks,
  operational health и admission прошли; прежняя сборка сохранена для отката.
- Исправленный Voice handoff дошёл до настоящего Claude и `factory_step.init`.
  Модель передала `design.inputDataTypes` массивом: прежняя MCP-схема оставляла
  `design`/`technical` неописанными объектами, а normalizer требовал строки.
  Исключение возникало до reservation/approval и скрывалось как
  `provider_tool_failed`; артефакты и проект не создавались.
- MCP-схема теперь использует тот же список текстовых полей, что normalizer;
  runtime/service enums берутся из canonical Contract. Ошибка сообщает только
  безопасный путь поля и ожидаемый тип, без входных значений и stack traces.
  Некорректные параметры отклоняются до approval и reservation.
- Init также принимает отдельные предложенные iteration/time limits и переносит
  их в draft Contract вместо подстановки 6 итераций / 90 минут при явно заданных
  2 / 30. Проверки повторяются на worker effect boundary. Создание черновика
  по-прежнему не подтверждает бюджет; Contract/Outcome approvals независимы.
- При завершении хода сохраняется отдельное host-owned свидетельство создания
  draft Contract. Позднейший успешный retry не меняет свидетельство старой
  попытки; legacy turn без свидетельства не считается подтверждённым созданием.
  Неудача до создания черновика отображается как failed и 0%, хотя ответ модели
  уже закончен. Статус model transport и результат factory различаются.
- Реальный локальный MCP/worker-тест воспроизводит ошибку типа, проверяет отсутствие
  approval/intent/effect, затем исправляет параметры с тем же ещё не связанным ID
  и получает только private draft. Отдельные Contract/Outcome approvals и budget
  confirmation сохраняются. Проверены immutable receipt, restart и desktop/mobile.
- Операторский пилот остаётся незавершённым до реальных документов, их отдельных
  approvals и независимых Trials. Отдельная попытка продолжения чата остановилась
  на истечении неподтверждённого init; эффект не выполнен и повтор не разрешается
  по одному сообщению модели. Затем оператор явно одобрил конкретный corrected
  init: через тот же Claude-чат и обычный host approval создан только private
  draft Contract. Identity и отдельные approvals сохранены; target project, код
  и службы не создавались. Это assisted recovery, а не доказательство полного
  успешного Voice journey. Уточнённая редакция Contract отдельно одобрена
  оператором и применена через тот же Claude-чат: 40000 build tokens, 2 итерации
  и 30 минут от delivery start. Outcome Spec имеет собственное согласование;
  принятие Contract не подменяет его и не запускает scaffold.
- Полный gate и staged verification нового кандидата выполняются перед отдельным
  lifecycle approval. Изменения остаются в изолированном checkout; GitHub и MacBook
  не менялись. Good State alignment: **aligned**.

### Checkpoint 63 — редактирование Outcome и подготовленные независимые Trials

- Проверка следующего перехода выявила две самостоятельные ошибки: scanner
  принимал канонические Then exit code, Session и разделители verifier
  declaration за чувствительные значения; approval независимых Trial inputs
  требовал ещё не созданный target, тогда как factory scaffold ждал Outcome.
- Factory scan нормализует только ограниченную каноническую grammar на время
  проверки; значения и остальные поля продолжают проходить общий redaction.
  Проверки с credential assignment и нечисловым exit code остаются закрыты.
- Host может подготовить только reviewed verification/ inputs в приватном
  factory state. Outcome проверяет их до создания child; scaffold повторно
  проверяет declared hashes, запрещает symlinks и включает только эти файлы
  в первый чистый Git baseline. Редактирование verifier build-исполнителем
  по-прежнему запрещено, approval не создаётся при отсутствующих inputs.
- Реальные MCP/worker и scaffold/Git tests покрывают этот порядок, неизменность
  принятых артефактов, отказ на изменённом hash и symlink. Research gates
  production не ослаблены; test-only research overrides остаются явными.
- Для Word Counter подготовлены исходные 24 независимых case и 7 дополнительных:
  UTF-8 errors, имена с пробелами, inert input, большой streaming input,
  dependency-free deliverables. Verifier calibration с отдельным синтетическим
  reference принимает правильный результат и отвергает constant-zero и
  молчаливую замену malformed UTF-8. Это подготовка критерия, не реализация
  пилота и не пользовательская приёмка.
- Полный прогон preliminary candidate прерван после зависания IPC fixture:
  слишком длинный TMPDIR из private test harness. Owned process tree завершён;
  короткий TMPDIR прошёл целевой control-channel suite. Финальный gate/build/
  browser/rollback выполняются по неизменному кандидату перед lifecycle approval.
  Canonical instance пока остаётся на отдельно одобренной ee5987b.

### Checkpoint 64 — planned identity после принятия factory Contract

- Перед активацией preliminary candidate прошли 1553/1553 tests, 52 browser
  cases, build и strict pages/chunks. Текущий operational check выявил ранее
  не покрытый переход: принятый factory Contract без созданной target folder
  превращался в identity conflict и делал agent-catalog check неуспешным.
- Каталог распознаёт ограниченную стадию до scaffold только при host-bound
  factory session: совпадают instance state, slug, agent identity, target,
  Contract path и approved content hash. Нужны pre-scaffold phase и отсутствие
  незавершённого effect, delivery run или scaffold revision. Project path
  остаётся null; исполняемая workspace binding не предоставляется.
- Accepted missing project без такого свидетельства, foreign/stale state,
  unsafe target, symlink, scaffold/profile evidence и уже начатая delivery
  сохраняют прежний conflict. Отдельные Contract/Outcome approvals не меняются.
- Целевой identity suite: 48/48. Read-only сравнение с реальным main state
  подтвердило тот же stable ID, planned-not-created для нового factory child
  и побайтово те же catalog records остальных 22 агентов; каталог не создаёт
  папку. Полный final gate и build повторяются для нового неизменного commit.
- До установки исправления canonical ee5987b сохраняет этот известный
  agent-catalog diagnostic. Пять страниц, chunks и task runtime отвечают.
  Rollback сохраняет принятые документы и возвращает предыдущий код/сборку;
  прежний diagnostic нельзя выдавать за operational pass. MacBook/GitHub
  остаются нетронутыми. Good State: aligned.

### Checkpoint 65 — отказ пользовательского сценария создания агента

- 2026-11-04 оператор сообщил, что создание агента через Claude и Codex
  не даёт рабочего результата. Итоговая приёмка фабрики не пройдена.
  Количество unit/browser tests и доступность страниц этого не опровергают.
  Ранее принятые голос, музыка и чтение памяти остаются отдельными результатами.
- В последней native Voice-попытке транспорт Codex запустился, но prompt
  подставил independent task ID вместо явно указанного child slug. Исправление
  в изолированной рабочей копии использует один resolver для prompt и writable
  roots, сохраняет explicit child target при новом thread и не превращает
  отсутствующий/невалидный child slug в другую папку.
- Native и внешний factory имеют разные интерфейсы. Native prompt теперь
  указывает канонический Pritha CLI; внешний Task Chat использует factory_step.
  Уже существующий external factory нельзя переносить в другой transport
  через новый task, переписывать его approvals или повторять init. Этот fix
  не реализует перенос factory ownership и не доказывает recovery пилота.
- В Task Chat режим Create new agent для Codex сейчас недоступен. Это
  оставшаяся функциональная граница, а не поломка логина Codex. Для внешнего
  factory текущая реализация требует approval каждого mutating шага, включая
  подготовку draft; это отдельная причина тяжёлого пользовательского пути.
  Изменение этой policy требует явного решения, а не скрытого снятия проверок.
- Целевые 43 проверки проходят, включая реальный prompt builder вместе с
  writable-root resolver; TypeScript и Markdown validation также проходят. Production не
  менялся; эти новые изменения не входят в подготовленную сборку aabdda1.
- Приоритет оставшейся работы: один сквозной пользовательский сценарий от
  согласованного brief до реально запущенного CLI, с сохранением независимых
  approvals и бюджета. Отдельно проверить обычное создание и продолжение после
  ошибки для обоих transport. Подготовленные root-оператором документы и
  вручную исполненные host actions считать помощью, не самостоятельной
  работой фабрики. До этого итоговый статус — создание агента не принято.

### Checkpoint 66 — восстановление единого пути создания (в работе)

Запрос оператора от 2026-11-04: довести Voice и Task Chat с Claude, Codex и
NeuralDeep до рабочего создания на реальном агенте, без ручного исправления
внутреннего состояния и повторных одобрений принятого.

1. Подключить native Codex Task Chat к каноническому factory host tool через
   App Server dynamic tools. Сохранить native transcript, точный child target,
   isolation, отдельный build executor и bounded delivery ledger.
   Проверить ошибочный thread/turn, отмену, recovery и tool result readback.
2. Направить создание из Voice через тот же Task Chat factory для трёх
   провайдеров. Проверить новый task, прежний topic, смену default и продолжение
   после остановки; не допускать дубликатов или скрытой смены исполнителя.
3. Разделить авторизацию ограниченного creation workflow и два самостоятельных
   принятия документов. Подготовку draft выполнять в уже заказанном workflow;
   технические шаги после approvals — в зафиксированных границах. Изменённый
   документ, новый бюджет, deployment и final acceptance остаются отдельными.
   Проверить повтор одобрения по hash и неизменность уже принятого документа.
4. Выполнить интеграционный проход canonical factory с реальными документами,
   research, scaffold, protected Trials и durable recovery в изолированном state.
   Fake provider использовать только в тестах; не считать его живой приёмкой.
5. Один консолидированный candidate: targeted tests, full gate, browser flows,
   production build, strict pages/chunks, operational/admission и rollback.
   Установка — через существующий managed workflow с отдельным immediate
   разрешением на конкретную сборку; этот запрос не даёт права менять MacBook
   или GitHub.
6. Продолжить уже одобренный пилот по обычным product API/controls. Сохранить
   Contract, Outcome, identity и пределы 40000/2/30. Проверить реальные Claude,
   Codex и NeuralDeep на шести сочетаниях Voice/Task Chat; не изменять executor
   существующего принятого Contract и не расширять его бюджет без решения.
7. Сдать наблюдаемый результат: рабочий агент, независимые Trials, объяснимое
   продолжение после остановки, отсутствие повторных approvals и manual state
   patches. Остальная ручная приёмка следует после исправления основного пути.

### Checkpoint 67 — единый factory tool и сохранение согласований

Реализовано в изолированном candidate, до установки и живого пилота:

- Native Codex получает `factory_step` через App Server dynamic tools. Его
  native transcript остаётся источником истории; отдельный transcript не
  создаётся. Реальный установленный App Server принял инструмент и восстановил
  его определение после перезапуска без model turn, расход — 0 токенов.
  Формат сверялся с установленной experimental schema и
  [официальной документацией App Server](https://learn.chatgpt.com/docs/app-server),
  проверка 2026-11-04, runtime `0.166.0-alpha.5.1`.
- Voice agent creation направляется в тот же factory, что typed Task Chat,
  для Codex, Claude и NeuralDeep. Новый conversation/task ID больше не заменяет
  имя child-проекта. Повторная Voice-карточка того же factory сохраняет topic,
  provider и preset; смена default не меняет принятого исполнителя.
- Запрошенное создание разрешает подготовку приватных draft и ограниченные
  технические шаги. Contract и Outcome всё ещё принимаются отдельно по точному
  документу; повтор по уже принятому hash не вызывает нового запроса и не
  меняет revision. Изменённый документ не получает старое разрешение.
- Research tool описывает типизированные sources, passage IDs и synthesis.
  Подтверждённый неудачный read можно повторить в прежних лимитах; uncertain
  operation не повторяется. Имя агента со словом Voice больше не приписывает
  headless CLI зависимость от Realtime.
- Проверены реальный worker с приватными документами, повторное подключение,
  две отдельные host approvals, отказ при неверном thread/turn, отмена approval,
  сохранение native истории и точного target. Browser: 33 сценария без ошибок,
  включая Codex/NeuralDeep creation intent и desktop/mobile queue/stop.

Первый полный прогон: 1571/1571. После проверки recovery добавлено освобождение
слота native factory только при подтверждённом завершении host workers;
неопределённое состояние сохраняет recoverable intent и resource claims.
Проверка выбирает tool receipts именно данного chat/turn до ограничения размера.
Целевые 40 проверок recovery/lease/factory проходят; финальный release прогон,
установка и живой build остаются открытыми.
Эти проверки не заменяют действительный продукт, независимые Trials или
приёмку оператора. Прежние одобрения Word Counter и их пределы сохранены;
внутренние файлы живого factory не исправлялись вручную.

### Checkpoint 68 — живой прогон установленной 27890e2

Установка выполнена с явного разрешения оператора. После managed start проходят
strict pages/chunks, operational health, приём задач и полная self-test.
До установки: 1572/1572 unit tests и 68 browser scenarios. Чужие локальные
материалы сохранены; MacBook и GitHub не изменялись.

- Claude продолжил прежний Voice factory через обычный Task Chat API.
  Outcome создан и записан штатным `factory_step` с точным ранее одобренным
  содержимым. Сохранённое согласие применено к совпавшему hash через product
  approval API; повторного вопроса оператору не было. Оба документа приняты,
  research начат. Scaffold и build ещё не выполнялись; пределы 40000/2/30
  сохраняются и отсчитываются от начала delivery.
- Живой research выявил лишние обязательные темы из advisory memory patterns:
  имя headless CLI со словом Voice вело к Voice/Tailscale/WebRTC evidence.
  В candidate поиск headless CLI основан на функциях и выбранных технологиях,
  а pattern topic становится обязательным только при наличии в контракте.
  Реальный принятый Word Counter требует лишь evidence declared-dependencies.
- Канонические `pattern-*` topics ранее не имели primary-source authority.
  Candidate связывает известные темы с ограниченными официальными доменами;
  неизвестная тема остаётся заблокированной с отдельной диагностикой.
  Модель не может расширить allowlist. Реальный bounded read Node.js 24 docs
  доступен; сетевой read не означает завершённый research или scaffold.
- Native Codex реально подготовил и проверил draft нового CLI через factory.
  Первый некорректный preset был исправлен самой моделью. Candidate публикует
  enum и безопасные конкретные ошибки брифа, чтобы не требовать чтения исходников.
  Также исправлено расхождение `standard/default` и `fast/priority` в runtime
  preview: выбранный native service tier должен присутствовать в списке.
- NeuralDeep при запросе `qwen3.8-27b` вернул в terminal snapshot другую модель,
  `qwen3.8-flash-next`. Подмена отклонена, default не изменён. Candidate сохраняет
  отдельный код и понятное сообщение вместо общего `provider_input`.
  Для GPT OSS 120B подтверждено точное publisher-qualified имя
  `openai/gpt-oss-120b`; только эта явная эквивалентность добавлена к уже проверенной
  GPT OSS 20B. Другой publisher, размер модели и двойной terminal prefix запрещены.
  На реальном CLI 0.153.0 candidate завершил диагностический запрос GPT OSS 120B:
  7064 измеренных токена, process tree exit подтверждён. Это проверка транспорта,
  а не готовый агент; подготовка/диагностика не списывается из бюджета Claude build.

Дальше: единый release gate и rollback к 27890e2; после отдельного разрешения
установить candidate, продолжить тот же Claude factory штатными инструментами,
получить protected Trials. Codex и NeuralDeep должны пройти собственные реальные
Contracts/Outcomes и delivery; новые документы требуют первичного согласования,
уже принятые не запрашиваются повторно. Все шесть сочетаний Voice/Task Chat пока
не приняты. Внутреннее состояние живых factory вручную не исправляется.

### Checkpoint 69 — установленная e2d10ab и восстановление чтения источника

С явного разрешения установлена e2d10ab: 1577 unit tests, 68 browser scenarios,
production build и rollback к 27890e2 проверены до установки. После managed
start прошли strict pages/chunks, operational health, приём задач и полная
self-test. MacBook, GitHub и чужие локальные материалы не изменялись.

- Claude продолжил прежний принятый factory через Task Chat. Набор research
  topics исправлен, но большая страница Node.js превысила лимит reader; два
  подтверждённых отказа исчерпали попытки. Scaffold/build не начаты, исходные
  согласования и пределы 40000/2/30 сохранены.
- Следующий candidate добавляет штатный `research_recover`: один новый
  ограниченный read window с другим разрешённым URL для failed тем. Старые
  deadline, попытки, ошибки и собранные источники сохраняются; uncertain
  dispatch и повторное продление не разрешены. Contract/Outcome не меняются.
  Reader ограничен 2 MiB и возвращает точную причину превышения.
- Проверка на изолированном синтетическом state прошла отказ → recovery →
  настоящее HTTPS-чтение Node.js v24 docs → exact passages → locked publication.
  Отказ в этой проверке инъецирован, последующее чтение реальное; это проверка
  восстановления, а не завершённый живой агент.
- NeuralDeep GPT OSS 120B подключился, но повторял `write_draft` до `init` с
  неверными полями. Запуск остановлен штатным product control; артефактов и
  согласований не создано. Candidate сообщает конкретный следующий шаг и
  допустимые/обязательные поля, сохраняет реальную ошибку tool в Details.
- Codex через factory уточнил свой draft Contract; проверка документа проходит.
  Его первичное согласование и отдельный Outcome ещё нужны. Claude не получает
  повторных вопросов по уже принятому.

Целевые проверки: 25 research/reader/factory и 15 native/runtime tests прошли.
Дальше: полный release gate, browser/build/rollback к e2d10ab; только затем
отдельное разрешение на установку. После установки продолжить тот же Claude
factory через recover, protected Trials и ручную приёмку, затем закончить
реальные Codex/NeuralDeep и матрицу Voice/Task Chat. Ручное исправление живого
внутреннего state и смена принятого executor не используются.

### Checkpoint 70 — установлена fd96ab7, выявлены ошибки реального исполнения

Managed activation fd96ab7 завершена: strict health (5 страниц / 12 chunks),
operational health, task admission и полный self-test прошли. Проверки кандидата:
1583 unit tests и 68 browser scenarios. Девять посторонних файлов сохранены;
MacBook и remote Git не менялись.

Claude прошёл research recovery и scaffold с уже принятыми документами.
Две реальные попытки сборки потратили суммарно 153667 токенов, но код остался
исходным scaffold. Во второй попытке host отвергал write/edit/run/ask с короткими
operation_id, не сообщая причину. После отдельного расширения разрешены всего
160000 токенов и 2 итерации; обе итерации использованы. Новые платные попытки
до исправления и отдельного увеличения исчерпанного лимита не запускаются.

Исправления следующего кандидата:

- Ограничения operation_id видны в схеме и описании; MCP возвращает безопасную
  точную подсказку без повторения произвольных входных значений. Реальная
  установленная CLI с синтетическим upstream прошла ошибочный короткий ID,
  исправленный write и создание private draft. Внешних платных запросов не было.
- Добавлены узкие factory_init/factory_write_draft с обязательными полями для
  provider MCP. Они используют прежние canonical operation identity, worker,
  receipt и независимые approvals. Новый draft не одобряет бюджет/документы.
- Повторная проверка неизменённого scaffold после прерванной сборки больше не
  считается новой неудачной правкой. Завершённая безрезультатная попытка или
  реальное изменение workspace по-прежнему учитываются. Указание пользователя
  сохраняется при продолжении без нового текста.
- Factory status/resume возвращают сохранённый результат Trials, включая ошибки,
  отдельно от бюджетного blocker. Evidence привязано к run/spec/document lock;
  диагностические выдержки ограничены, очищены и помечены как недоверенные.
- Чтение первичного источника принимает точный уже разрешённый поддомен OWASP;
  DNS/redirect ограничения остаются. Recovery может сохранить URL ещё не
  начатых тем, не увеличивая им число попыток и не перечитывая завершённые темы.

Дополнительный живой probe выявил, что HTML сворачивался в одну строку,
а один пример инструкции отправлял в quarantine всю страницу. Reader теперь
выделяет основной текст и сохраняет границы блоков; research проверяет блоки
с перекрывающимся контекстом и выбирает ограниченные содержательные фрагменты.
Оригинальные инструкции не попадают в evidence. Проверены реальные OWASP и
Node.js v24 process pages, сохранён предшествующий отказ, подтверждены 2/1
попытки для восстановленной/новой тем. Security regression проверяет также
инструкцию, разделённую между блоками.

Operational health установленной версии выявил одну ошибку каталога после
принятия Codex Outcome: перечень допустимых provider IDs для ещё не созданного
проекта не включал Codex. Кандидат исправляет это с одинаковой проверкой
Contract/Outcome locks для Codex, Claude и NeuralDeep; права на отсутствующий
workspace не выдаются. Read-only проверка на текущих canonical metadata
подтвердила planned identity. Страницы и runtime установленной версии отвечают;
это известное ограничение возврата к fd96ab7, пока агент не прошёл scaffold.

Codex Contract и отдельный Outcome приняты через обычный product approval API;
build budget остаётся 60000 / 2 / 15 минут. Его research остановился на указанной
ошибке поддомена, до scaffold/build. NeuralDeep ещё не создал draft: реальная
модель неверно заполняла универсальный инструмент; узкая схема пока проверена
только синтетически. Ни один из этих сигналов не означает готовность ребёнка.

Далее: полный gate/build/browser/rollback кандидата; managed update по точному
разрешению; продолжение существующих пилотов через интерфейсы, без правки их
внутреннего состояния; реальные Trials, ручная приёмка и отдельное применение.
Матрица Voice/Task Chat для трёх провайдеров остаётся незавершённой.

### Checkpoint 71 — продолжение Task Chat → Voice (изолированный кандидат)

Во время ожидания разрешения на b4b2301 проверен обратный переход между
интерфейсами. Voice для уже начатой в Task Chat фабрики пытался создать новый
чат и останавливался с factory_target_exists. Регрессия воспроизведена на
предыдущем коде для четырёх provider runtimes.

Изолированное исправление разрешает только host-bound продолжение исходного
разговора: private factory metadata сверяются с registry binding, provider,
slug, target и selected state root. Origin/group/history исходного чата не
переписываются. При первом Voice bind принимается только публичный preset
существующего разговора; после bind он неизменяем. Обычные Voice topics не
получают права на такую замену. Ни документ, ни бюджет заново не принимаются.

Проверены очередь, продолжение после перезапуска, сохранение исходного model /
effort / timeout, одна история и неизменность approvals. Native Codex использует
тот же подход с исходным App Server thread. Ссылка Voice открывает фактическую
группу исходного Task Chat. Чужие provider/state/target, повреждённые metadata,
symlinks и попытка заменить уже привязанный preset отклоняются.

96 целевых тестов прошли; это синтетические проверки без платных запросов.
Полный release gate и живые пилоты ещё нужны. Каноническая служба остаётся на
fd96ab7 до ответа на ранее подготовленное обновление b4b2301; это исправление
сделано в отдельном worktree и не меняет подготовленную сборку. Общая приёмка
создания агентов через оба интерфейса пока не завершена.

### Checkpoint 72 — установлена объединённая версия и воспроизведены оставшиеся дефекты

По отдельному одобрению установлена 2d937b4. Managed stop/start, strict и
operational health, admission и полный post-activation self-test прошли без
предупреждений. До установки прошли 1600 тестов, 68 браузерных сценариев,
сборка, 5 страниц и 12 JS chunks. MacBook и GitHub не изменялись.

Реальный Claude написал CLI, README и smoke в прежнем disposable worktree.
24 основных независимых проверки прошли; дополнительный verifier дошёл до
проверки поставки после успешных поведенческих edge cases и остановился на
неиспользуемых настройках в созданном Pritha `.env.example`. Модель не могла
исправить этот публичный пример из-за общего запрета `.env.*`. Новых платных
попыток нет: учтены 311938 из 320000 токенов и все 4 итерации. Contract,
Outcome, protected verifiers и исходный проект сохранены. Это ещё не приёмка.

У Codex прошли host research и scaffold. Реальный вход Task Chat → Voice
выявил более раннюю ошибку: эвристика продолжения выбирала старую карточку
без provider binding ещё до разрешения точной factory conversation. Build
Codex пока не запущен. NeuralDeep продолжает подготовку первого draft через
узкий factory_init; Contract/Outcome этого пилота ещё не одобрены.

Следующий кандидат исправляет три подтверждённых дефекта:

1. Фабрика читает результат Trials через свежий identity-checked deliveryStatus,
   поскольку execution result resume/deliver не содержит runRoot. Проверять также
   устаревшие locks, отказ чтения и redaction диагностик.
2. Agent creation получает точный host-bound разговор вместо fuzzy legacy
   continuation. Explicit task references сохраняют обычную проверку. Повторить
   реальный вход через Voice без force_new и проверить тот же chat/approvals.
3. Headless scaffold без выбранных интеграций получает comment-only env example.
   Host file tools допускают только точное имя `.env.example`, regular file,
   неизменённый SHA и содержимое без секретов. Реальные `.env`, другие варианты,
   links и command sandbox остаются защищены.

Для существующего build добавлен отдельный штатный scaffold_refresh /
`delivery refresh-scaffold`: под delivery lease и accepted plan проверяется
точный host-generated baseline, canonical Git worktree и protected inputs.
Обновляется только неизменённый старый `.env.example`; custom/secret/provider
configuration и verified checkpoint отклоняются. Prepared/completed receipt
позволяет восстановить потерянный ответ; код, verifier и бюджет не меняются.
Это maintenance шаблона хостом, а не помощь другого LLM в реализации CLI.

Дальше: полный gate, production build, browser/page/chunk checks и rollback
review; затем отдельное разрешение на конкретный service update. После установки
продолжить тот же Claude через scaffold_refresh → verify → finish без нового
model turn, реальный Codex через Voice и NeuralDeep через оба интерфейса.
Новые документы согласовываются впервые и отдельно; принятые не согласовывать
повторно. User acceptance и применение готовых файлов остаются отдельными.

### Checkpoint 73 — установлена 647505e, два реальных результата и общий дефект схем

Отдельное одобрение 647505e применено через managed stop → source/build swap →
start → strict/operational health → admission. Пять страниц, 12 chunks и полный
post-activation self-test прошли; профиль Interactive и девять несвязанных файлов
сохранены. MacBook, GitHub, service profile и секреты не менялись.

В том же Claude-чате выполнены scaffold_refresh → verify → finish. Обновлён
только точный неизменённый env template; independent Trials: 24 + 7 pass,
0 fail. Новых builder turns нет: 311938/320000 токенов, 4/4 итерации. Codex
завершил finish через delivery_status, живой каталог видит карточку; его прежние
20 CLI cases + artifact Trial, 40456 токенов и одна итерация сохранены. Через
обычный Voice route создана новая карточка, продолжившая исходный Codex Task
Chat: тот же run, accepted Contract и approved Outcome, без force_new и без
legacy parent. Это технический API journey; microphone acceptance не подменён.

NeuralDeep получил первое явное одобрение существующего Contract и лимитов
80000/2/900000ms. Общий factory_step объявляет expected_sha256 необязательным
для всех действий, и модель многократно опускает его в approve_contract. Даже
точный JSON не исправил вызов. Host сохраняет отказ до effects; ни документы,
ни approvals вручную не редактируются. Нужна общая правка схем, а не очередное
согласование того же документа.

Кандидат добавляет точный factory_<action> tool для каждого действия с его
required полями; старый dispatcher остаётся совместимым. Все имена нормализуются
в одну canonical operation, worker, approval boundary и idempotency key.
Contract/Outcome остаются двумя независимыми decisions. Ошибки называют missing
fields и подходящий tool, не раскрывая неизвестные поля/значения. 20 targeted
checks прошли. Установленная NeuralDeep CLI получила правильные required поля
семи проверенных actions на fresh и resume; provider synthetic, paid requests 0.

Следующие шаги: полный gate/build/browser/rollback review; отдельное immediate
approval нового service update; принять ранее одобренный Contract NeuralDeep
через точный tool, подготовить и впервые отдельно согласовать Outcome, затем
bounded research/scaffold/build/Trials. Существующий Outcome preview покрывает
9 требований и 20 CLI cases; это ещё не canonical artifact или user approval.
Продолжить Voice/Task Chat continuity для Claude и NeuralDeep. После фактической
демонстрации получить первое принятие результатов и отдельное применение.

### Checkpoint 74 — 5fd4308 установлена, Claude и Codex приняты и применены

Точное разрешение пользователя выполнено через managed stop → source/build swap
→ start → strict/operational health → admission. Проверены пять страниц и
12 JS chunks; полный post-activation self-test pass, warnings/regressions пусты.
До установки: 1607 тестов, восемь gate groups, 68 browser cases, build/typecheck
и rollback pass. Профиль Interactive и девять несвязанных файлов сохранены;
MacBook и GitHub не менялись.

- Пользователь отдельно принял оба результата и разрешил применение проверенных
  файлов. Обычный delivery accept и точный fast-forward применили четыре файла
  Claude и восемь Codex; исходные child checkout чисты. Независимые 24+7 и
  20 CLI cases с artifact Trial сохранены, шесть проверок из применённых проектов
  прошли. Card readiness ready, result acceptance accepted, blockers пусты.
- Расход сохранён: Claude 311938 токенов / 4 итерации; Codex 40456 / 1.
  Новых builder turns для приёмки или применения не было. Подготовлены private
  post-creation reviews и пропорциональная фиксация принятого состояния;
  Git/tag baseline и публикация не выполнялись.
- NeuralDeep впервые корректно вызвал factory_approve_contract с точным hash.
  Host request принят по прежнему разрешению пользователя, Contract и пределы
  80000 / 2 / 900000ms с начала сборки повторно не согласовывались.
  factory_create_outcome создал draft; до первого отдельного Outcome approval
  research/scaffold/build не начинаются. Подготовленный headless Outcome имеет
  20 независимых CLI cases, artifact Trial и отдельный manual review;
  calibrated verifier сохранён по hash. Draft authoring идёт штатным tool,
  внутренние session/ledger/approval файлы вручную не исправляются.
- Найдена дополнительная рассинхронизация: factory status всегда возвращает
  manualAcceptance pending даже после реального принятия в delivery ledger.
  Исправление читает только привязанный run, проверяет project/Outcome/approval
  locks и возвращает accepted без записи session, повторного approval или
  builder turn. finish также сохраняет accepted. Проверка отрицательных случаев
  не позволяет чужому run, изменённому Outcome или повреждённому ledger
  объявить принятие. Эта правка готовится отдельно; установленная 5fd4308 пока
  содержит прежний pending в инструменте фабрики, но не в карточке/ledger.

- Реальный NeuralDeep при полной перезаписи draft менял соседний текст, затем
  заявил ожидаемый hash без соответствующего tool effect. Host сравнивает байты
  артефакта и не принимает такую декларацию за результат. Добавлен общий
  factory_patch_draft: до восьми уникальных literal replacements, текущий и
  итоговый SHA-256; тот же worker проверяет draft identity, безопасность и CAS.
  Принятые документы не изменяются; неверный hash или неоднозначное совпадение
  не записывает draft. Для нового action JSON key order канонизируется при
  idempotency, порядок edits сохраняется; старые receipt hashes не меняются.
  Это обычное авторство черновика через продукт, не ручная правка session/ledger.

Открыто: первое Outcome approval и реальный bounded build NeuralDeep, его
Voice/Task Chat continuity, уже запрошенная microphone-проверка двух принятых
агентов, оставшаяся manual matrix и общий финальный acceptance. Не подменять
эти проверки успешным API status или количеством unit tests.

### Checkpoint 75 — 37f5cbb установлена, Outcome NeuralDeep принят, найден research blocker

Оператор отдельно разрешил установку и первое принятие Outcome NeuralDeep.
Managed stop → source/build swap → start, пять страниц / 12 chunks,
operational/admission и полный post-activation self-test pass; warnings и
regressions пусты. Профиль и девять несвязанных файлов сохранены. Установленный
factory status обоих принятых агентов показывает accepted без записи session.

- NeuralDeep одним штатным factory_patch_draft применил две точные замены:
  весь draft побайтно совпал с reviewed Outcome. Первое host approve_outcome
  принято по уже полученному разрешению, reviewed hash сохранён; повторных
  вопросов о Contract/Outcome и ручных правок session/ledger не было.
- Memory research завершён в прежнем чате и identity. Требуются два первичных
  источника: untrusted-input-security и declared-dependencies. Сборка не начата;
  лимиты остаются 80000 токенов / 2 итерации / 900000ms с её начала.
- Первый NeuralDeep Read официальной OWASP Input Validation страницы вернул
  только quarantine marker. SearchService стирал весь документ из-за примера
  команды до того, как HostResearch мог выбрать чистые фрагменты. Исходный
  failed acquisition сохранён; неизвестного dispatch или слепого retry нет.
- Общая правка разделяет research-страницу на ограниченные фрагменты с
  перекрытием, редактирует секреты до разбиения и повторно применяет прежний
  whole-text scanner к итоговому тексту. Ни один домен не освобождается от
  проверки. Обычный Task Chat/Voice read сохраняет прежний whole-page quarantine;
  research cache имеет отдельную версию семантики. HostResearch использует тот
  же helper. Полностью небезопасный документ по-прежнему не даёт evidence.
- 45 scoped проверок проходят, включая настоящую цепочку SearchService →
  HostResearch, encoded/cross-block input, credential boundary, cache isolation
  и отказ полностью quarantined page. Три актуальные публичные страницы
  проверены через candidate pipeline с synthetic provider transport, paid
  requests 0: обе OWASP страницы дают пригодные безопасные выдержки, Node.js
  v24.15 process docs — совместимый version context. Это не подмена живого ND
  collection; он остаётся следующим шагом после проверенной установки.

Первый полный прогон: 1604/1614, все десять отказов — прежние hash общего
redaction-helper в generated scaffold snapshots. Проверено, что отличается
только scripts/redaction.mjs; обновлены его bytes/hash в десяти profiles,
остальные записи и provenance сохранены. Scoped scaffold suite: 13/13.
Неуспешный полный receipt сохранён; для финального pin нужен новый полный gate.

Далее: один консолидированный release gate и staged rollback; отдельное точное
разрешение на update. Затем штатный bounded research_recover с другим подходящим
первичным URL для failed темы, сохранением history/limits/locks и без нового
одобрения документов. После допустимого research gate — scaffold, реальная ND
сборка, независимые Trials, finish и первая приёмка результата.

### Checkpoint 76 — 3c7c53b установлена, research и scaffold завершены, исправляется build preflight

Оператор отдельно разрешил установку 3c7c53b и продолжение прежнего NeuralDeep
пилота. Managed stop → source/build swap → start завершены; strict проверяет
пять страниц и 12 JS chunks, operational/admission проходят. Полный self-test
после установки: pass, warnings/regressions пусты, owned process tree завершён.
Релизный gate 1614/1614 и 68 browser cases сохранён; профиль и несвязанные файлы
не изменены, предыдущая сборка сохранена для управляемого отката.

- В прежнем чате и factory identity выполнено одно штатное bounded recovery.
  OWASP Injection Prevention теперь даёт проверяемые host passages. Node process
  docs были обрезаны провайдером до содержательных релевантных выдержек; один
  разрешённый обычный retry внутри того же окна получил официальные Modules
  docs той же установленной Node v24.15.0. Успешный OWASP не перечитывался,
  history, attempts и recovery deadline не сбрасывались. Ответ модели о новом
  продлении deadline не подтверждён host checkpoint и не принят как evidence.
- Три точные привязки passages опубликованы через factory_research_apply;
  memory/external/synthesis и общий research gate complete. Сводка сохраняет
  literal Unicode/whitespace, отделяет данные от интерпретатора и не добавляет
  пакеты, сеть или службы. Дата публикации источников честно unknown; версия
  Node проверена по version-pinned docs и установленному бинарнику.
- Обычные scaffold_plan/scaffold успешны, создан чистый локальный Git baseline.
  Contract/Outcome hashes и verifier сохранены; внутренних ручных правок нет.
- Первый настоящий factory_deliver создал тот же bounded run и disposable
  worktree, но runtime probe остановился до платного запроса: sandbox из
  read-only родительского чата не является полем provider preset. История
  сохраняет 0 build tokens и одну учтённую старым кодом итерацию. Это не успех
  реализации и не основание сбросить расход, повторить документы или лимиты.
- Изолированное исправление отделяет два допустимых parent access значения
  от настроек NeuralDeep/OpenRouter/Local. Build по-прежнему получает только
  собственный workspace-write, isolated worktree и protected Trial inputs;
  неизвестные поля и danger-full-access отвергаются. Parent preset не меняется.
- Runtime probe перенесён до начала implementation iteration. Новая проверка
  восстанавливает runtime и проходит независимую проверку с одной разрешённой
  итерацией без изменения лимитов. Старые ledgers автоматически не переписываются.
- Новые проверки сначала воспроизвели отказ. После исправления build-executor
  и delivery-loop suites: 61/61. Реальный read-only readiness probe того же
  NeuralDeep model/worktree в изолированном кандидате проходит с High без
  build dispatch и платных запросов. Неподдерживаемый xhigh честно отвергается;
  следующий обычный turn должен выбрать поддерживаемый High, сохраняя модель.

Далее: консолидированный gate/build/browser/rollback для нового pin, точное
разрешение на установку. Для прежнего run сохранить расход и обе approvals;
если wall-clock бюджет истёк во время ремонта, запросить только новое окно
времени и применить его штатным budget amendment после явного ответа. Не
выполнять новый model turn без допустимых пределов. Затем delivery_resume,
независимые Trials, review/finish, первая приёмка и отдельное применение.
Оставшаяся ручная матрица и исходные приложения A/B/C/D сохраняются полностью;
GitHub и MacBook не изменяются.

## 7. Полные исходные материалы

Ниже сохранены три пользовательских исходника и дополнение D целиком. Их первоначальные команды,
branch directions, defaults и обещания — историческое входное ТЗ; при конфликте
исполняются уточнения выше и последнее поручение пользователя. Это обеспечивает
полную проверяемую трассировку, а не повторное разрешение изменять fork/remote.


### Приложение A — исходник 1

SHA-256: `72582596d82f1d677552816b39618d390ea0086294b00f93e7d78e1ef25eda57`.

````text
# Техническое задание и архитектурный план: Портирование Curated FTS v2 в Pritha-NeuralDeep и унификация провайдерского профиля (`--profile neuraldeep`)

## 0. Контекст, цель и главные правила для агента-исполнителя

Сейчас экосистема Pritha разделена на две ветки, которые разошлись в сентябре–октябре 2026 года:
1. **Каноническая `Pritha` (`NumericalArt/Pritha`, ориентир `HEAD @ e976b62` / `e1c00eb`)**:
   - Содержит свежее октябрьское обогащение базы знаний (`2026-10-21-*`), новый проверенный движок поиска **`Curated FTS v2`** (`scripts/pritha_memory_retrieval.py` + 60-кейсовый эталонный бенчмарк с закрытым holdout-сетом), улучшения в `CodexAppServerBuildExecutor.recover` (сохранение пина модели) и свежие UI-доработки Control Center (quote replies, image annotation, пагинация активности).
   - Работает поверх нативного `Codex App Server` и `OpenAI Live API (gpt-live-1)` / `gpt-realtime-2`.
2. **`Pritha-NeuralDeep` (`NumericalArt/Pritha-NeuralDeep`, ориентир `HEAD @ 12f1547a`, ветка `codex/neuraldeep-creation-reliability`)**:
   - Содержит мощный провайдерский слой для работы через **NeuralDeep** (единый ключ в macOS Keychain для LLM, голоса и веб-поиска): `scripts/neuraldeep-codex.mjs`, `scripts/neuraldeep/*`, loopback-адаптер Responses SSE, собственный `admission-coordinator.ts`, `NeuralDeepVoiceTransport.ts`, биллинг/лимиты и боевую закалку создания дочерних агентов на моделях `qwen3.8-27b` / `qwen3.6-35b-a3b` / `kimi-k2.6`.
   - При этом в `Pritha-NeuralDeep` отсутствует октябрьский `Curated FTS v2` и октябрьский пакет знаний, а сам репозиторий живёт как жёсткий форк (где `gateway.ts` и `pritha-runtime.ts` переписаны под безальтернативный NeuralDeep-путь).

### Две главные цели этой работы:
- **Часть А (Быстрый и безопасный перенос ценности):** Перенести в `Pritha-NeuralDeep` октябрьский движок поиска **`Curated FTS v2`**, инструмент валидации/бенчмарка памяти и октябрьский пакет курируемых знаний из канонической `Pritha` без регрессии 93 существующих `neuraldeep-*` тестов.
- **Часть Б (Архитектурная конвергенция / Anti-Fork Drift):** Превратить `NeuralDeep` из жёстко зашитого форка в **подключаемый провайдерский адаптер (`provider_profile: "codex-native" | "neuraldeep"`)**, управляемый через `--profile neuraldeep` и настройки инстанса (`PRITHA_PROVIDER_PROFILE`), чтобы общие слои фабрики (`scripts/agents-mother/`), базы знаний и UI Control Center больше не приходилось чинить в двух репозиториях отдельно.

### Обязательные ограничения (Guardrails):
- **Good State Alignment:** перед началом работы выполнить сверку `node scripts/good-state-alignment.mjs --scope "memory-and-provider-runtime" --limit 3`.
- **Никаких утечек секретов и состояния:** не читать и не коммитить `.env*`, `.private/`, `Pritha-state`, ключи из Keychain и реальные Tailscale URL.
- **Сохранение инвариантов обоих миров:**
  - В режиме `codex-native` канонической историей остаётся `Codex App Server`, а голосом — `OpenAI Live 1 / Realtime 2`.
  - В режиме `neuraldeep` каноническим транспортом остаётся связка `admission-coordinator` -> `neuraldeep-codex.mjs` -> `loopback Responses adapter`, без несанкционированного фолбэка на платный OpenAI API.

---

## Фаза 1. Перенос `Curated FTS v2` и октябрьской базы знаний в `Pritha-NeuralDeep`

> **Комментарий архитектора:** Эту фазу нужно делать первой и отдельным атомарным PR/коммит-сетом. Поисковый движок `Curated FTS v2` работает поверх локального SQLite (`.memory/techscope.sqlite`) и курируемого Markdown, не требует платных вызовов LLM и вообще не конфликтует с транспортом NeuralDeep. При этом он сразу поднимет качество фазы `research` при создании дочерних агентов в `Pritha-NeuralDeep` (Hit@5 на сложных русско-английских запросах вырастет с ~50% до 93.7%).

### 1.1. Перенос скриптов и мостов `Curated FTS v2`
Перенести из канонической `Pritha` (коммит `e976b62`) в `Pritha-NeuralDeep` следующие файлы:
- `scripts/pritha_memory_retrieval.py` — ядро `Curated FTS v2` (русская морфологическая нормализация, симметричный инженерный глоссарий, веса заголовков/секций, фильтрация `private`/`child-agents`/истории до формирования корпуса BM25, явная косинусная редукция для `MiniLM-L12-v2` без платформенных аномалий BLAS).
- `scripts/memory-retrieve.py` — CLI-точка входа для scoped FTS / semantic / hybrid поиска.
- `scripts/memory-retrieval-eval.py` и `scripts/memory-retrieval-acceptance.py` — раннеры оценки качества поиска на замороженном корпусе и holdout-выборке.
- `scripts/lib/curated-memory.mjs` — Node.js-мост к Python-раннеру поиска.

**Точка внимания (совместимость Python-окружения в NeuralDeep):**
- В `Pritha-NeuralDeep` (`scripts/bootstrap.mjs`, функция `instancePython`) используется изолированный venv внутри `PRITHA_STATE_ROOT/venv/bin/python`, а также свой скрипт `scripts/embed-memory-neuraldeep.mjs`.
- В `scripts/lib/curated-memory.mjs` и `scripts/query-memory.mjs` необходимо резолвить Python-интерпретатор через существующий хелпер `pritha_python_compat` / `PRITHA_STATE_ROOT/venv`, при этом сохранив главное свойство `Curated FTS v2`: **лексический режим (`curated` / FTS) не должен импортировать `sentence_transformers` или `torch`** (время ответа тёплого индекса ~2.7 мс, холодный старт CLI ~418 мс, память ~29 МБ RSS).

### 1.2. Интеграция в CLI и фабрику агентов (`agents-mother`)
Обновить в `Pritha-NeuralDeep`:
- `scripts/query-memory.mjs`: добавить поддержку подкоманды `node scripts/query-memory.mjs curated "<query>"` (с сохранением обратной совместимости со старыми командами `search`, `semantic`, `stats`).
- `scripts/agents-mother/index.mjs` (и при необходимости `scripts/agents-mother/pattern-research.mjs`): подключить `curated` поиск для домена `agent-building-knowledge` на этапе фабричного ресёрча, сохранив локальные доработки `Pritha-NeuralDeep` от 23–24 сентября (`56ef5205` — привязка ресёрча к точным пассажам, `19a37e01` — ограниченные выдержки страниц).
  *Важно:* не затереть сентябрьские фиксы дедлайнов подготовки (`fcb88077`) в `scripts/agents-mother/`! Делать аккуратный мерж функций, а не слепую замену файла `scripts/agents-mother/index.mjs`.

### 1.3. Перенос октябрьского пакета знаний (Curated Knowledge Pack)
Перенести из `e976b62` проверенные артефакты знаний:
- `00_inbox/texts/2026-10-21-agent-stack-repository-intake.md`
- `00_inbox/texts/2026-10-21-agent-updates-research-intake.md`
- `01_sources/registries/github-agent-building-repos.md` (обновлённый реестр из 24 репозиториев, включая 10 новых `accepted-for-review` с точными commit/tree SHA)
- `01_sources/signals/2026-10-21-*.md`
- `02_briefs/2026-10-21-*.md` (6 тематических брифов: `agent-backend-selection`, `agent-harness-patterns`, `agent-recovery-boundaries`, `agent-retrieval-evaluation`, `agent-routing-voice-cache`, `mcp-apps-memory-explorer`)
- `03_reviews/2026-10-21-*.md` и `.json` (включая `2026-10-21-pritha-retrieval-and-runtime-verification.md` и `2026-10-21-agent-repository-deep-review.md`)
- `05_decisions/2026-10-21-curated-agent-knowledge-and-retrieval.md` (`superseded`) и `05_decisions/2026-10-21-curated-retrieval-promotion.md` (`active`)
- `07_workflows/agent-failure-to-trial.md`, обновления в `07_workflows/memory-indexing.md`, `07_workflows/agents-mother.md`, `07_workflows/agent-sensor-and-eval-design.md`
- `08_templates/agent-failure-evidence.md`

### 1.4. Перенос тестов и фикстур поиска
Перенести и запустить:
- `tests/fixtures/memory/retrieval-acceptance-cases.json` (SHA-256 фикстуры должен остаться неизменным: `b6e60c6559288cce982770c64e4065f0645a54b4a45b6b724b9fe4d2dce89118`)
- `tests/fixtures/memory/retrieval-baseline.json`
- `tests/fixtures/memory/retrieval-cases.json`
- `tests/fixtures/memory/check-curated-retrieval.py`
- `tests/memory-curated-retrieval.test.mjs`
- `tests/memory-curated-node-bridge.test.mjs`

### Гейт приёмки Фазы 1:
1. `node scripts/validate-memory.mjs` и `node scripts/rebuild-memory.mjs` проходят с 0 ошибок.
2. `node --test tests/memory-curated-retrieval.test.mjs tests/memory-curated-node-bridge.test.mjs` — зелёные.
3. Бенчмарк `python3 scripts/memory-retrieval-acceptance.py` подтверждает пороги: Positive Hit@5 >= 80% (целевой 45/48), Hit@10 >= 90% (46/48), Holdout Hit@5 >= 80% (23/24), `private leaks == 0`.
4. `node scripts/privacy-audit.mjs --strict` — pass.

---

## Фаза 2. Выделение единого контракта провайдера (`Provider Runtime Adapter`)

> **Комментарий архитектора:** Главная причина, почему `Pritha` и `Pritha-NeuralDeep` разъехались на два репозитория, лежит в трёх местах:
> 1) `interfaces/control-center/src/lib/codex-chat/gateway.ts` (в `Pritha` он общается с `app-server.ts` / `native-turn-coordinator.ts`, а в `Pritha-NeuralDeep` — с `admission-coordinator.ts` и `neuraldeep-cli-runner.ts`);
> 2) `interfaces/control-center/src/lib/realtime/pritha-runtime.ts` (в `Pritha` это 8.4k строк под OpenAI Realtime/Live, а в `Pritha-NeuralDeep` — под `NeuralDeepVoiceTransport`);
> 3) `scripts/agents-mother/build-executors.mjs` и `execution-backends.mjs`.
>
> Чтобы слить их в единую кодовую базу и переключать флагом `--profile local` vs `--profile neuraldeep`, **нельзя** лепить `if (isNeuralDeep)` в двадцати местах внутри 4000-строчных файлов. Нужно ввести тонкий слой стратегии (Strategy / Adapter Pattern) на границе исполнения.

### 2.1. Единый конфигуратор профиля инстанса (`scripts/lib/provider-profile.mjs`)
Создать модуль `scripts/lib/provider-profile.mjs` (и его TS-зеркало `interfaces/control-center/src/lib/settings/provider-profile.ts`), который детерминированно определяет активный режим инстанса:
- Поддерживаемые профили: `"codex-native"` (по умолчанию для `local`, `control-center`, `control-center-tailscale`) и `"neuraldeep"` (для `--profile neuraldeep`).
- Источники правды (в порядке приоритета):
  1. Явный `PRITHA_PROVIDER_PROFILE` в окружении инстанса.
  2. Поле `providerProfile` в `.pritha-instance.json` / `.techscope-setup.json`.
  3. Fallback на `"codex-native"`.
- **Жёсткий инвариант безопасности (No Silent Cross-Provider Fallback):** если инстанс запущен в профиле `"neuraldeep"`, рантайм **ни при каких ошибках** не должен пытаться вызывать прямой OpenAI API или десктопный `Codex App Server` в обход адаптера NeuralDeep (и наоборот). Ошибка провайдера всегда переходит в типизированный операторский статус.

### 2.2. Декомпозиция `Task Chat` Gateway на общий фасад и два драйвера
В `interfaces/control-center/src/lib/codex-chat/`:
1. Выделить интерфейс `TaskChatBackendDriver` (`driver-types.ts`):
   - `listThreads(pageParams)` / `getThreadHistory(threadId, cursor)`
   - `startTurn(turnRequest)` / `resumeTurn(turnId)` / `cancelTurn(turnId)`
   - `resolveApproval(decisionRequest)`
   - `getRuntimeHealth()` / `getRateLimitsAndUsage()`
2. Реализовать две изолированные имплементации:
   - `drivers/codex-app-server-driver.ts` — инкапсулирует логику канонической Pritha (`app-server.ts`, `native-control.ts`, `native-turn-coordinator.ts`, `goal-control.ts`, `history-reader.ts`).
   - `drivers/neuraldeep-cli-driver.ts` — инкапсулирует логику `Pritha-NeuralDeep` (`admission-coordinator.ts`, `neuraldeep-cli-runner.ts`, `cli-runtime.ts`, `voice-queued-handoff.ts`, связь с `scripts/neuraldeep-codex.mjs`).
3. Оставить в `gateway.ts` только общую HTTP/UI-маршрутизацию, работу с вложениями (`attachment-store.ts`), нормализацию ответов (`normalize.ts`) и делегирование в выбранный `TaskChatBackendDriver`.
4. Сохранить в общем UI-слое (`components/codex/`) все свежие октябрьские фичи обеих веток:
   - из канонической `Pritha`: quote replies, image annotation (`3a3c36d`), стабилизацию скролла при стриминге (`3cecf32`), пагинацию истории активности (`8fa9706`);
   - из `Pritha-NeuralDeep`: фазовые пресеты создания агента (`interview`, `contract`, `outcome`, `scaffold`, `implement`), явный выбор `Subject=child` + `slug` (чтобы не требовать скрытых шапок в промпте) и индикацию лимитов/очереди `admission-coordinator`.

### 2.3. Декомпозиция `Voice Control` и `Settings`
1. **Голосовой транспорт (`interfaces/control-center/src/lib/realtime/` и `components/voice/`):**
   - Разбить монолитный `pritha-runtime.ts` (8 382 строки) на:
     - `core/voice-tools-dispatcher.ts` — общий реестр локальных инструментов Pritha (поиск по памяти `Curated FTS v2`, чтение файлов, `record_good_state_signal`, постановка задач в Codex/Task Chat, управление музыкой и ducking).
     - `transports/openai-live-realtime-transport.ts` — WebRTC-транспорт для `gpt-live-1` (с делегированием в `gpt-5.6-terra`) и fallback на `gpt-realtime-2`.
     - `transports/neuraldeep-voice-transport.ts` — транспорт `NeuralDeepVoiceTransport.ts` + связка с персистентными топиками `voice-topic-store.ts`.
2. **Страница `Settings` (`components/settings/SettingsControlPage.tsx`):**
   - Если активен профиль `codex-native` — рендерить секции `CodexAuthSection`, `OpenAIKeysSection` и селектор голоса (`gpt-live-1` / `gpt-realtime-2`).
   - Если активен профиль `neuraldeep` — рендерить `NeuralDeepKeysSection` (ключ в Keychain, статус тарифа Pro/Wallet, лимит параллельности, селектор моделей `qwen3.8-27b` / `qwen3.6-35b-a3b` / `kimi-k2.6`, режим `NeuralDeep Search: Auto`).

---

## Фаза 3. Перенос боевых улучшений фабрики из `Pritha-NeuralDeep` в общее ядро `agents-mother`

> **Комментарий архитектора:** В сентябре в ветке `Pritha-NeuralDeep` была проделана колоссальная работа по устранению 15 классов блокеров при создании дочерних агентов (разбор от 17.09.2026 и коммиты по 24.09.2026). Эти улучшения полезны **любой** модели (и Qwen, и GPT-6, и Claude), поэтому их нужно сделать частью единого ядра `scripts/agents-mother/`.

Проверить и зафиксировать в едином ядре следующие механизмы:
1. **Защита от локалей и mojibake (`be82911a`, `49c4a656`):**
   - При любом запуске дочернего CLI/shell-раннера принудительно выставлять `LANG=en_US.UTF-8` / `LC_ALL=en_US.UTF-8` и проверять, что `TMPDIR` указывает на существующий ASCII-путь внутри рабочего контура, чтобы `zsh` heredoc никогда не падал на кириллических путях папок.
2. **Профили моделей и лимиты выходных токенов (`dfe92027`, `9c508ed1`, `edcb1f85`):**
   - Сохранить таблицу возможностей моделей (например, разделение `effort` и `thinking` для семейства Qwen, запрет невалидного `effort: high` для `qwen3.8-27b` в пользу `xhigh`, увеличенные выходные бюджеты токенов при генерации файлов >200 строк).
   - Сохранить октябрьский фикс из канонической Pritha (`e976b62`): в `CodexAppServerBuildExecutor.recover` обязательно пинить модель предыдущей попытки, чтобы при cold resume не происходил тихий откат на дефолтную модель.
3. **Детерминированная подготовка на стороне хоста (`4e395a37`, `7cae2809`, `e89b7d5c`):**
   - Сохранить хостовый сбор первичного ресёрча с чекпоинтами доказательств (`durable evidence checkpoints`), чтобы модель внутри хода Task Chat не сжигала 15–30 минут на сетевые таймауты.
   - При политике контракта `github_research: not-applicable` и `adoption: none` research-гейт должен автоматически переходить в `passed/not-applicable` без требования `--allow-pending`.
   - Команда `agents-mother init --from-brief` должна сразу генерировать валидный контракт из `interview-brief.md` (с выбранным `api-process` / `tool-server` / `headless-cli` и реальным портом в `operations/manifest.json`), а ошибки валидатора обязаны печатать список допустимых enum-значений.

---

## Фаза 4. Единый `bootstrap.mjs`, примеры и проверка дистрибутива

1. В `scripts/bootstrap.mjs` объединить словарь `PROFILES`:
   - `minimal`, `local`, `control-center`, `control-center-tailscale` (профиль провайдера `codex-native`);
   - `neuraldeep` (профиль провайдера `neuraldeep`, изоляция инстанса через `prepareDistributionInstance`, venv в `PRITHA_STATE_ROOT`, предустановка демо-агента `Brief Desk ND` через `scripts/install-brief-desk.mjs`).
2. Сохранить в корневом репозитории папку `examples/brief-desk-nd/` и документацию `START_HERE.md` + `docs/neuraldeep-*.md`, чтобы один и тот же Git-репозиторий мог работать:
   - у автора на Mac mini — через `--profile control-center-tailscale` (нативный Codex + GPT Live 1);
   - на MacBook или в публичном релизе — через `--profile neuraldeep` (NeuralDeep + Kimi/Qwen + Brief Desk ND).

---

## Пошаговый порядок выполнения для кодинг-агента (Execution Checklist)

1. **Шаг 1 (Подготовка и бэкап-ветка):**
   - В репозитории `Pritha-NeuralDeep` создать рабочую ветку `feat/curated-fts-v2-and-unified-profile` от текущего `HEAD` (`12f1547a`).
   - Запустить базовый прогон `node scripts/quality-gate.mjs` (или `npm run test:unit`), зафиксировать исходное число зелёных тестов.
2. **Шаг 2 (Портирование Фазы 1 — Curated FTS v2 + октябрьские знания):**
   - Скопировать файлы `scripts/pritha_memory_retrieval.py`, `scripts/memory-retrieve.py`, `scripts/memory-retrieval-eval.py`, `scripts/memory-retrieval-acceptance.py`, `scripts/lib/curated-memory.mjs`, фикстуры `tests/fixtures/memory/*`, тесты `tests/memory-curated-*.test.mjs` и октябрьские Markdown-документы (`2026-10-21-*`).
   - Адаптировать вызов `curated` в `scripts/query-memory.mjs` и `scripts/agents-mother/index.mjs` с учётом `instancePython`.
   - Пересобрать память (`node scripts/rebuild-memory.mjs`), прогнать `python3 scripts/memory-retrieval-acceptance.py` и `node scripts/privacy-audit.mjs --strict`. Сделать промежуточный коммит.
3. **Шаг 3 (Фаза 2 — выделение `ProviderProfile` и драйверов `TaskChatBackendDriver`):**
   - Вынести `provider-profile.mjs` / `.ts`.
   - Разделить `gateway.ts` на фасад + два драйвера (`codex-app-server-driver.ts` и `neuraldeep-cli-driver.ts`).
   - Проверить, что все 93 теста `tests/neuraldeep-*.test.mjs` и тесты `tests/control-center-*.test.mjs` проходят в обоих режимах профиля. Сделать коммит.
4. **Шаг 4 (Фаза 2.3 и Фаза 3 — декомпозиция `pritha-runtime.ts` и синхронизация `agents-mother`):**
   - Выделить из `pritha-runtime.ts` общий диспетчер инструментов и два голосовых транспорта (`OpenAI Live/Realtime` и `NeuralDeepVoiceTransport`).
   - Перенести недостающие UI-улучшения октября (`quote replies`, `image annotation`, `activity pagination`, `release receipts`) из канонической `Pritha`.
   - Сверить `scripts/agents-mother/build-executors.mjs` (добавить пин модели при `recover`).
5. **Шаг 5 (Финальная верификация и Quality Gate):**
   - Запустить полный `node scripts/quality-gate.mjs`.
   - Запустить `python3 scripts/memory-retrieval-acceptance.py`.
   - Запустить `node scripts/audit-neuraldeep-secret-leaks.mjs` и `node scripts/audit-neuraldeep-runtime-network.mjs`.
   - Запустить Playwright E2E для Control Center (`npm --prefix interfaces/control-center run test:e2e`).
   - Оформить итоговый `review` в `03_reviews/YYYY-MM-DD-pritha-neuraldeep-convergence-review.md` и обновить индекс памяти.
````


### Приложение B — исходник 2

SHA-256: `2714ed0d1ce2482ea26d3026242f76f5bb6aced86bb6587256992fcc390ce2ea`.

````text
# Приложение к ТЗ: Добавление провайдерского профиля Anthropic и транспорта Claude Code CLI (`--profile claude`)

## 0. Архитектурная концепция: как именно интегрировать Claude в Pritha

В экосистеме Pritha модели Anthropic и Claude Code CLI могут работать на **трёх чётко разделённых уровнях**. Нельзя смешивать обычный HTTP-вызов API с полноценным агентским рантаймом:

1. **Уровень 1 — `ClaudeCodeCliRunner` (`scripts/claude-code-runner.mjs`) для Task Chat и Voice Tasks:**
   - Аналог `scripts/neuraldeep-codex.mjs`. Запускает локальный бинарник `claude` (Claude Code CLI) в неинтерактивном потоковом режиме (`claude -p --output-format stream-json --verbose`) или через `@anthropic-ai/claude-agent-sdk` (проверенный в октябрьском пилоте `0.3.306` / Claude Code `2.1.306`).
   - Транслирует NDJSON-поток событий Claude (`system/init`, `assistant`, `tool_use`, `tool_result`, `result`) в канонический формат событий Task Chat Pritha (`thread.started`, `item.completed`, `turn.completed`, `usage`).
2. **Уровень 2 — `ClaudeCodeBuildExecutor` (в `scripts/agents-mother/build-executors.mjs`) для `deliver`:**
   - Исполнитель сборки дочерних агентов внутри одноразового worktree (`pritha/build-*`).
   - Работает строго без сети (`--disallowedTools WebFetch,WebSearch` + host sandbox), не имеет доступа к защищённым файлам `Protected Trial Verifier`, возвращает стандартную схему `pritha-build-executor-result-v1` и списывает реальный расход токенов (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`) в `delivery-ledger.mjs`.
3. **Уровень 3 — Anthropic Messages API для дочерних агентов (Child Agents Runtime):**
   - Лёгкий HTTP-клиент к `https://api.anthropic.com/v1/messages` (без внешних зависимостей, на нативном `fetch`) для использования внутри прикладных дочерних агентов (`api-process` / `headless-cli`), которым нужен просто вызов LLM по ключу `ANTHROPIC_API_KEY`.

---

## 1. Авторизация, ключи и лицензионные границы (Security & Compliance)

Опираясь на выводы из `03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md`:
1. **Хранение ключа (`scripts/lib/credential-store.mjs` и `interfaces/control-center/src/lib/settings/anthropic-credentials.ts`):**
   - Ключ `ANTHROPIC_API_KEY` сохраняется в macOS Keychain инстанса (сервис `pritha-anthropic-api-key-<instance-id>`), по аналогии с `neuraldeep-credential.mjs`.
   - Никогда не записывать ключ в отслеживаемые файлы, `settings.json` или аргументы командной строки (`ps aux` не должен светить токен — передавать только через очищенный `env` дочернего процесса или helper-скрипт).
2. **Разделение режимов авторизации:**
   - **Режим A (`api-key`, канонический для автоматизации и SDK):** использует `ANTHROPIC_API_KEY` из Keychain инстанса.
   - **Режим B (`local-cli-session`, опциональный для личного локального оператора):** использует локально авторизованный пользователем бинарник `claude` (`claude auth status`), но **запрещает** перехват или чтение приватных OAuth-токенов `claude.ai` сторонними скриптами. Если выбран `@anthropic-ai/claude-agent-sdk`, требующий API-ключ по Commercial Terms, при отсутствии ключа возвращать честный статус `pending-auth` (как в октябрьском пилоте `claude-tools-pilot.mjs`).
3. **Изоляция переменных окружения:**
   - При запуске `ClaudeCodeCliRunner` вычищать из `env` ключи `OPENAI_API_KEY` и `NEURALDEEP_API_KEY`, чтобы исключить случайную утечку чужих секретов в дочерний процесс.

---

## 2. Реализация транспорта `scripts/claude-code-runner.mjs` (Аналог `neuraldeep-codex.mjs`)

Создать CLI-обёртку `scripts/claude-code-runner.mjs`, которая принимает те же входные контракты, что и `neuraldeep-codex.mjs`, но управляет процессом `claude`.

### 2.1. Формирование аргументов запуска `claude`
Базовый вызов через `spawn(claudeBin, argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })` (строго `shell: false`):
```text
claude -p "<prompt>"
  --output-format stream-json
  --verbose
  --model <selected-model>           # напр. claude-sonnet-4-5 / claude-opus-4-5 / актуальный пин из каталога
  --max-turns <bounded-turns>        # защита от бесконечного цикла
  [--resume <claude-session-id>]     # для продолжения существующего топика/треда
  [--allowedTools <tool-list>]       # Bash,Read,Edit,Write,Glob,Grep (по политике задачи)
  [--permission-mode <mode>]         # plan | acceptEdits | default (в зависимости от UI-гейта)
```

### 2.2. Маппинг протокола событий (Claude `stream-json` -> Pritha Task Chat JSONL)
Парсер читает построчно NDJSON из `stdout` процесса `claude` и преобразует события в канонические события Pritha:
1. **`{"type": "system", "subtype": "init", "session_id": "..."}`**:
   - Эмитит `thread.started` с `thread_id = session_id`.
   - Сохраняет `session_id` в `private-store.ts` / `coordination-store.mjs` для последующего `--resume`.
   - Если при `--resume <expected_id>` вернулся другой `session_id` — немедленно прерывать ход с ошибкой `runtime_identity_mismatch`.
2. **`{"type": "assistant", "message": {"content": [...]}}`**:
   - Блоки `{"type": "thinking", ...}` -> маппятся в ленту рассуждений (`reasoning` / `activity`).
   - Блоки `{"type": "text", "text": "..."}` -> накапливаются и стримяться в UI как текст ответа ассистента.
   - Блоки `{"type": "tool_use", "id": "...", "name": "...", "input": {...}}` -> маппятся в карточки активности инструментов (`ActivityFeed.tsx`), предварительно проходя через `redactFilesystemPaths`.
3. **`{"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "...", ...}]}}`**:
   - Закрывает соответствующую пару `tool_use_id` в истории хода.
   - *Урок октябрьского аудита (`2026-10-21-agent-backend-selection.md`):* обязательно проверять полноту пар `tool_use_id <-> tool_result` при параллельных вызовах инструментов. Если процесс был прерван (`SIGINT`/`SIGKILL`) посередине ожидания инструмента, записывать в стор честный `cancelled_or_ambiguous_tool_receipt`, а не подделывать успешный результат.
4. **`{"type": "result", "subtype": "success" | "error_max_turns" | "error_during_execution", "usage": {...}, "total_cost_usd": ...}`**:
   - Извлекает точный расход токенов с учётом кэша Anthropic (**формула без двойного счёта из октябрьского пилота E6**):
     - `fresh_input = usage.input_tokens`
     - `cache_write = usage.cache_creation_input_tokens || 0`
     - `cache_read = usage.cache_read_input_tokens || 0`
     - `output = usage.output_tokens`
     - `total_billed_tokens = fresh_input + cache_write + cache_read + output`
   - Записывает usage и `total_cost_usd` в локальный ledger инстанса.

### 2.3. Песочница, права на запись (`writableRoots`) и Decision Gates в UI
В отличие от Codex, у Claude Code своя система разрешений (`--allowedTools`, `--disallowedTools` и PreToolUse hooks):
- **Ограничение рабочей папки:** перед стартом хода проверять `cwd` и передавать Claude Code локальный `.claude/settings.local.json` (во временном или рабочем каталоге задачи), где через `permissions.allow` и `permissions.deny` жёстко зафиксированы разрешённые пути записи (`writableRoots` из `prepareVoiceWorkspace` / `task-workspace.mjs`).
- **Перехват опасных операций (UI Decision Gate):**
  - В `Pritha` опасные команды (`launchctl`, `tailscale`, `git push`, удаление файлов вне worktree, запись в `.env`) требуют нажатия кнопки **Approve / Reject** на карточке задачи в Control Center.
  - В адаптере Claude Code это реализуется через встроенный механизм **Claude Code `PreToolUse` hook** (или `canUseTool` callback в `@anthropic-ai/claude-agent-sdk`):
    - Когда Claude пытается вызвать `Bash` с мутирующей/опасной командой, hook-скрипт `scripts/claude-pre-tool-guard.mjs` сверяет команду с `codex-safety.ts` / `operation-decisions.mjs`.
    - Если команда требует подтверждения оператора — хук возвращает код блокировки с типизированным JSON-маркером `pritha_decision_required`, ход аккуратно ставится на паузу (`awaiting_approval`), а в UI Control Center загорается штатная карточка `OperationDecisions.tsx` (Approve / Reject).

---

## 3. Реализация `ClaudeCodeBuildExecutor` для `deliver` (`scripts/agents-mother/build-executors.mjs`)

Добавить класс `ClaudeCodeBuildExecutor`, реализующий стандартный контракт исполнителя сборки Pritha:

1. **`probe()`**:
   - Проверяет наличие бинарника `claude --version` через `runSyncProbe` (с `killSignal: "SIGKILL"`, таймаут 5 с).
   - Проверяет готовность авторизации (`ANTHROPIC_API_KEY` или валидный статус CLI).
   - Возвращает `{ backend: "claude-code-build", available: true/false, isolation: "worktree-plus-pretool-guard", runtimeVersion, capabilities: { commandExec: true, threadStart: true, goal: true } }`.
2. **`execute(input)`**:
   - Принимает `worktree` (`pritha/build-*`), `plan` (Outcome Spec), `protectedPaths` (защищённые входы верификатора) и оставшийся `tokenBudget`.
   - Генерирует во временном каталоге запуска `pre-tool-guard`, который **физически блокирует** любые попытки инструментов `Write`/`Edit`/`Bash` изменить файлы из списка `protectedPaths`, а также блокирует сетевые вызовы и `git push`/`git remote`.
   - Запускает `claude -p` с промптом `buildPrompt(input)` и JSON-схемой ответа `outputSchema()` (`--json-schema` в современных версиях Claude CLI либо двухшаговое форматирование `structuredSummaryPrompt`, как уже сделано в `CodexCliBuildExecutor`).
   - Контролирует бюджет токенов в реальном времени по стриму `stream-json`: если сумма токенов в текущем ходе превышает `remainingTokenBudget`, процесс останавливается с типизированным статусом `budget_exhausted`, а не списывает бесконтрольно токены.
3. **`recover(input)`**:
   - При обрыве процесса проверяет сохранённый `session_id` и пин модели (`observed_model` предыдущей попытки, согласно правилу из коммита `e976b62`), сверяет `gitChangedFiles(worktree)` и восстанавливает учёт токенов без повторного запуска `turn/start`.

---

## 4. Подключение в Control Center (`TaskChatBackendDriver` и `Settings`)

1. **Драйвер `interfaces/control-center/src/lib/codex-chat/drivers/claude-code-driver.ts`:**
   - Подключается к фасаду `gateway.ts` из Фазы 2 основного плана, когда `providerProfile === "claude"`.
   - Использует тот же `admission-coordinator.ts` (для защиты от гонок между параллельными вкладками Task Chat и голосовыми задачами) и вызывает `scripts/claude-code-runner.mjs`.
2. **Каталог моделей (`interfaces/control-center/src/lib/settings/codex-model-catalog.ts`):**
   - Добавить профили моделей для провайдера `claude`:
     - `claude-sonnet-4-5` / актуальный Sonnet (дефолт для быстрых итераций и повседневного Task Chat);
     - `claude-opus-4-5` / актуальный Opus (для сложной архитектуры, ревью и тяжёлых `deliver`-прогонов);
     - `claude-haiku-4-5` (для дешёвых вспомогательных задач и суммаризации).
   - Поддержать настройку `thinking` / `effort` (передача `--effort low|medium|high` или `MAX_THINKING_TOKENS` в окружение `claude`).
3. **Голосовой режим при профиле `claude`:**
   - Поскольку у Anthropic нет собственного WebRTC Realtime Voice API, при выборе `--profile claude` голосовой транспорт в `Settings -> Voice` работает по гибридной схеме (уже заложенной в архитектуру Pritha):
     - Голосовой фронт (STT/TTS и быстрый диалог) использует выбранный доступный голосовой транспорт (`OpenAI Live 1` либо `NeuralDeep Voice`, если задан соответствующий ключ, либо браузерную диктовку в Task Chat), а **все глубокие задачи (`Run Voice Task`) маршрутизируются в `claude-code-driver.ts`**.
4. **Инструкция для самой Pritha (`CLAUDE.md` мост):**
   - Claude Code по умолчанию читает корневой `CLAUDE.md`.
   - Чтобы не дублировать 61 КБ правил из `AGENTS.md` в двух файлах, добавить в корень репозитория компактный `CLAUDE.md` (или генерировать его при `bootstrap.mjs --profile claude`), который содержит директиву `@AGENTS.md` и краткую выжимку специфичных для Claude Code правил (запрет обхода `Protected Trial Verifier`, работа с `PRITHA_STATE_ROOT`).

---

## 5. План тестирования и приёмки адаптера Claude Code (`Execution Checklist`)

1. **Unit-тесты парсера и гардов (`tests/claude-code-runner.test.mjs`):**
   - Подать синтетический `stream-json` поток Claude Code (с `thinking`, параллельными `tool_use`, `tool_result`, `cache_read_input_tokens` и ошибкой `error_max_turns`).
   - Проверить точность конвертации в события Task Chat, отсутствие утечки `OPENAI_*`/`NEURALDEEP_*` переменных и корректность формулы подсчёта кэшированных токенов без двойного счёта.
2. **Тест защиты верификатора (`tests/claude-build-executor.test.mjs`):**
   - Проверить, что `pre-tool-guard` блокирует попытку модификации файла из `protected_trial_inputs` и попытку сетевого запроса внутри `pritha/build-*` worktree.
   - Проверить `recover()` с сохранением пина модели.
3. **Conformance-тест SDK (`scripts/experiments/claude-tools-pilot.mjs`):**
   - Убедиться, что существующий октябрьский пилот `@anthropic-ai/claude-agent-sdk` продолжает проходить на 100%, а при наличии ключа в Keychain — проходит живой single-turn смоук.
4. **Боевой пилот создания простого агента через UI:**
   - Переключить инстанс в профиль `claude`, открыть Task Chat и прогнать создание эталонного лёгкого агента (уровня `hn-board` или `quake-board`) по цепочке `interview -> contract -> outcome -> scaffold -> deliver/implement`, замерив число ходов, расход токенов (с учётом prompt caching Anthropic) и число срабатываний защитных гейтов.
````


### Приложение C — исходник 3

SHA-256: `1e2d34c1616fde8057ab8738240c32a7afcf667556f5510638bcead87a1b55b6`.

````text
# Мастер-промпт №3: Единый пульт коннекторов в UI (Codex, NeuralDeep, Claude Code, OpenRouter, Local), фиксация дефолта голоса GPT Realtime 2 и умная отправка из окна набора Task Chat (Steer + Queue)

## 0. Контекст и цель задания

Это третье, завершающее задание по консолидации канонической `Pritha` и `Pritha-NeuralDeep` в единый продукт.
В рамках этого задания необходимо:
1. Добавить универсальный коннектор **OpenRouter** и локальный коннектор **Local (Ollama / LM Studio / MLX)** в дополнение к **Codex**, **NeuralDeep** и **Claude Code**.
2. Собрать в `Settings` и `Task Chat` чистый, не перегруженный деталями интерфейс переключения между коннекторами («Один активный пульт» с раздельным сохранением пресетов каждого провайдера).
3. Жёстко закрепить в голосовом контуре **`GPT Realtime 2` (`gpt-realtime-2`) + локальные инструменты Pritha** как канонический дефолт для профиля OpenAI/Codex, оставив **`GPT Live 1` (`gpt-live-1`)** как опциональный экспериментальный режим в выпадающем списке.
4. Разблокировать отправку сообщений из главного окна набора `Task Chat` во время работы Pritha: сделать очередь (**`Queue` с кнопками `Edit` и `Cancel`**) доступной по `Enter` / главной кнопке на всех транспортах, а прямое вмешательство в ход рассуждения (**`Steer now` / `turn/steer`**) — доступным прямо из композера на тех транспортах, где это поддерживается (прежде всего `Codex App Server`).

---

## 1. Пять канонических коннекторов и реализация OpenRouter + Local

Система поддерживает ровно 5 провайдерских коннекторов (`ProviderConnectorId`):
1. `"codex"` — нативный `Codex App Server` / `Codex CLI` (OpenAI / ChatGPT session).
2. `"neuraldeep"` — единый рублёвый провайдер `NeuralDeep` через `neuraldeep-codex.mjs` + loopback Responses adapter.
3. `"claude"` — `Claude Code CLI` (`claude -p --output-format stream-json`) / `@anthropic-ai/claude-agent-sdk` + ключ `ANTHROPIC_API_KEY` в macOS Keychain.
4. `"openrouter"` — универсальный шлюз к 300+ мировым моделям (`https://openrouter.ai/api/v1`) для самого Task Chat, фабрики и дочерних агентов.
5. `"local"` — полностью автономный локальный OpenAI-совместимый сервер (`Ollama` на `127.0.0.1:11434`, `LM Studio` на `127.0.0.1:1234` или `mlx_lm.server`) без передачи данных во внешнюю сеть.

### 1.1. Как реализовать коннектор `OpenRouter` (максимальное переиспользование кода `NeuralDeep`):
- **Хранение ключа (`interfaces/control-center/src/lib/settings/openrouter-credentials.ts`):**
  - Ключ хранится в macOS Keychain инстанса (`pritha-openrouter-api-key-<instance-id>`), в браузер возвращается только маска `sk-or-v1-••••` и статус проверки.
- **Проверка здоровья и баланса (`/api/settings/openrouter-credentials`):**
  - Делает легковесный запрос к `GET https://openrouter.ai/api/v1/auth/key` (с таймаутом 5 с). Возвращает остаток кредитов/лимита (`usage`, `limit`, `is_free_tier`) и отображает статус-чип в карточке провайдера.
- **Исполнение задач и каталог моделей:**
  - Переиспользовать архитектуру `neuraldeep-codex.mjs` + loopback Responses/Chat-Completions адаптер, направляя запросы на `https://openrouter.ai/api/v1` с заголовками `HTTP-Referer: https://github.com/NumericalArt/Pritha` и `X-Title: Pritha Control Center`.
  - В каталог моделей для `openrouter` включить курируемый шортлист лучших кодинг/агентских моделей (с возможностью ручного ввода любого `vendor/model-slug`): `anthropic/claude-sonnet-4.5`, `deepseek/deepseek-chat-v3.1`, `qwen/qwen3-coder`, `google/gemini-2.5-pro`, `openai/gpt-5.4`.
- **Пресет для дочерних агентов (Child Agents Credentials Drawer):**
  - В drawer настройки ключей дочернего агента на странице `/agents` добавить возможность в один клик передать дочернему агенту ключ и базовый URL `OpenRouter` (наравне с `NeuralDeep`), записывая `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` и выбранную модель в gitignored `.env.local` дочернего проекта.

### 1.2. Как реализовать коннектор `Local` (`Ollama / LM Studio`):
- Не требует API-ключа в Keychain.
- Проверяет доступность локального сервера через `GET http://127.0.0.1:<port>/v1/models` (по умолчанию пробует `11434` для Ollama и `1234` для LM Studio, порт настраивается).
- Гарантирует 100% офлайн-контур (подходит для задач с политикой `privacy: local-private`).

---

## 2. Дизайн UI в `Settings`: «Один активный пульт» без усложнения и нагромождения

**Главное продуктовое требование:** не смешивать настройки всех провайдеров в одну длинную простыню и не портить существующие, уже выверенные блоки настроек `Codex` и `NeuralDeep`.

### 2.1. Верхний переключатель коннекторов (`ProviderConnectorBar.tsx`)
В разделе `Settings -> Codex / Task Runtime` разместить сверху компактную полосу выбора коннектора из 5 карточек-таблеток:
- Каждая таблетка показывает: название (`Codex`, `NeuralDeep`, `Claude Code`, `OpenRouter`, `Local`), точку статуса (`Ready` / `Configured` — зелёная, `Not configured` — серая, `Error` — янтарная/красная) и текущую выбранную для этого провайдера модель мелким шрифтом.
- При клике на таблетку коннектора **нижняя часть секции переключается на нативный, чистый компонент именно этого провайдера**:
  1. Если выбран **`Codex`** -> рендерится родной `CodexAuthSection` (`Codex CLI`, `Codex App Server`, `Login Help`) + родной `CodexSettingsSection` (`Model`, `Reasoning Effort`, `Service Tier`, `Primary Transport`, `Thread Routing`).
  2. Если выбран **`NeuralDeep`** -> рендерится родной `NeuralDeepKeysSection` (ключ в Keychain, статус `/v1/limits`, тариф `Pro / Wallet`) + выбор моделей NeuralDeep (`qwen3.8-27b` + `xhigh`, `qwen3.6-35b-a3b`, `kimi-k2.6`) с существующим предупреждением о платном списании для `requires_wallet` моделей.
  3. Если выбран **`Claude Code`** -> рендерится компактная карточка `ClaudeCodeSettingsSection` (проверка бинарника `claude --version`, ключ `ANTHROPIC_API_KEY` в Keychain, выбор модели `Sonnet / Opus / Haiku` и `Thinking Effort`).
  4. Если выбран **`OpenRouter`** -> рендерится карточка `OpenRouterSettingsSection` (ключ в Keychain, статус баланса `/api/v1/auth/key`, выбор модели из шортлиста или кастомный slug).
  5. Если выбран **`Local`** -> рендерится карточка `LocalProviderSettingsSection` (URL локального сервера `127.0.0.1:11434`, список обнаруженных локальных моделей из `/v1/models`).

### 2.2. Раздельное сохранение профилей (Per-Provider Saved Presets)
В `runtime-settings` хранить словарь `providerPresets: Record<ProviderConnectorId, ProviderPreset>`:
- Когда оператор переключается с `Codex` на `NeuralDeep` и обратно, его любимая модель, `reasoningEffort` и `timeoutMs` для каждого коннектора **помнятся отдельно** и никогда не сбрасываются и не перезаписывают друг друга.

### 2.3. Быстрый переключатель провайдера в шапке нового чата `Task Chat`
В `CodexChatPage.tsx` (при создании `+ New chat` или в панели композера):
- Добавить компактный пилл-селектор активного коннектора и модели: например, `[ ● Codex · gpt-5.6-sol ▾ ]`.
- **Правило чистоты UI:** в этом быстром списке в `Task Chat` показывать **только те коннекторы, которые уже настроены и готовы к работе (`status === "ready"`)**. Ненастроенные коннекторы без ключей скрыты (внизу выпадашки только скромная ссылка `Configure providers in Settings…`).
- Каждый созданный тред сохраняет свой `providerId` и `modelId` в метаданных треда, чтобы `--resume` всегда шёл в родной коннектор.

---

## 3. Голосовой контур: `GPT Realtime 2 + локальные инструменты` как дефолт, `GPT Live 1` как опция

В `interfaces/control-center/src/lib/realtime/voice-settings.ts` и `VoiceSettingsSection.tsx` зафиксировать следующее поведение:
1. **Возврат канонического дефолта `gpt-realtime-2`:**
   - В `voice-settings.ts` изменить дефолтный `fallback` в `normalizeVoiceModel(value, fallback = "gpt-realtime-2")` обратно на **`"gpt-realtime-2"`**.
   - В `VOICE_MODEL_OPTIONS` первой строкой идёт `{ id: "gpt-realtime-2", label: "GPT Realtime 2 (Default · Direct tools)" }`, второй строкой — `{ id: "gpt-live-1", label: "GPT Live 1 (Experimental · Delegated tools)" }`.
2. **Работа локальных инструментов голоса:**
   - В режиме `gpt-realtime-2` сохраняется проверенный прямой вызов всех 9 локальных инструментов Pritha (`Full Pritha Memory`, `Inspect Pritha Files`, `Inspect Voice Task`, `Rolling Summary`, `Good State Signal`, `Answer Voice Task`, `Confirm Voice Intake`, `Web Search`, `Run Voice Task`).
   - Весь код транспорта `gpt-live-1` (`live-session.ts`) бережно сохраняется для последующей донастройки, но никогда не включается самопроизвольно без явного выбора пользователя в `Settings -> Voice`.
3. **Связка голоса с выбранным коннектором задач:**
   - В `Settings -> Voice` добавить переключатель голосового движка: `Auto (Follow provider)` | `OpenAI Realtime (GPT Realtime 2 / Live 1)` | `NeuralDeep Voice`.
   - В режиме `Auto`:
     - при активном коннекторе `Codex` работает `OpenAI GPT Realtime 2`;
     - при активном коннекторе `NeuralDeep` работает `NeuralDeep Voice`;
     - при активных коннекторах `Claude Code`, `OpenRouter` или `Local` голосовой интерфейс автоматически использует тот голосовой движок (`GPT Realtime 2` или `NeuralDeep Voice`), для которого настроен ключ, а все глубокие задачи по команде `Run Voice Task` отправляет в активный коннектор задач (`Claude Code` / `OpenRouter` / `Local`).

---

## 4. Разблокировка отправки из окна набора `Task Chat` во время работы Pritha (`Steer` + `Queue`)

### 4.1. Корневая проблема, которую нужно устранить
В канонической `Pritha` в `CodexChatPage.tsx` главная кнопка `<button className="codex-send">` сейчас заблокирована условием `disabled={... || hasActiveTurn || ...}`, а нажатие `Enter` в `<textarea>` вызывает `sendMessage()`, который ничего не делает при `hasActiveTurn === true`. В результате оператор не может отправить следующее сообщение или уточнение прямо из окна набора текста, хотя бэкенд уже поддерживает и `/queue`, и `/control` (`action: "steer"`).

### 4.2. Как должно работать окно набора (`CodexChatPage.tsx` + `TaskChatControls.tsx`)

1. **Поле `<textarea>` и прикрепление файлов всегда доступны во время работы хода (`hasActiveTurn === true`):**
   - Динамический `placeholder` у `<textarea>` при активном ходе:
     - если `detail.controls?.steer === true`: `"Write a follow-up to queue (Enter) or steer this turn now (⌘/Ctrl+Enter)…"`
     - если `steer` недоступен для текущего транспорта/фазы: `"Write the next message to send after completion (Enter to queue)…"`

2. **Главная кнопка отправки (и нажатие `Enter`) в режиме `hasActiveTurn === true` ставит задачу в очередь (`Queue`):**
   - Убрать `hasActiveTurn` из `disabled` главной кнопки `.codex-send`!
   - Когда `hasActiveTurn === true`:
     - Нажатие `Enter` (без Shift) или клик по главной кнопке `.codex-send` вызывает постановку сообщения (вместе с прикреплёнными файлами) в очередь текущего треда (`POST /api/codex-chat/v1/threads/:id/queue` с `Idempotency-Key`).
     - Текст главной кнопки во время активного хода меняется с `Send` на **`Queue`** (или **`Send after completion`** с иконкой часов/очереди).
     - Это работает **на всех 5 коннекторах** (`Codex`, `NeuralDeep`, `Claude Code`, `OpenRouter`, `Local`).

3. **Кнопка мгновенного вмешательства в рассуждение (`⚡ Steer now`) — когда транспорт это умеет:**
   - Проверять флаг `const canSteerNow = Boolean(displayedDetail?.controls?.steer) && !attachmentIds.length;` (в `Codex App Server` он равен `true`, когда активен нативный ход и канал управления `native-control.ts` подтверждает `steer: true`).
   - Когда `hasActiveTurn && canSteerNow`:
     - В нижней панели `.codex-composer-controls` **рядом с главной кнопкой `Queue`** отображать заметную акцентную кнопку:
       **`[ ⚡ Steer now ]`** (`title="Inject this instruction immediately into the running reasoning turn (⌘/Ctrl+Enter)"`).
     - Нажатие `Cmd+Enter` / `Ctrl+Enter` в `<textarea>` (при `canSteerNow && draft.trim()`) также вызывает `steerNow()`.
     - Вызов `steerNow()` отправляет `POST /api/codex-chat/v1/threads/:id/control` с `{ action: "steer", text: draft.trim(), expectedTurnId: displayedDetail.controls.turnId, clientMessageId }`.
     - Если к черновику приложены файлы (`attachmentIds.length > 0`), кнопка `Steer now` неактивна с подсказкой `"Attachments can only be queued for the next turn"`, чтобы не потерять вложения.
     - Если текущий транспорт не поддерживает `steer` (например, `NeuralDeep CLI`, `Claude Code CLI`, `OpenRouter`, `Local`), кнопка `Steer now` не рендерится, не перегружая интерфейс.

4. **Удобное управление сообщениями в очереди (`Cancel` + `Edit` прямо на карточке очереди):**
   - Объединить лучшие практики из `TaskChatControls.tsx` (каноническая Pritha) и `CodexChatPage.tsx` (`Pritha-NeuralDeep`):
   - Каждое поставленное в очередь сообщение отображается прямо над композером (или внизу ленты ходов) со статусом `Queued` и двумя действиями:
     - **`Edit`** — отменяет запись в очереди на сервере (`action: "cancel"`, проверяя `revision`) и **возвращает исходный текст и прикреплённые файлы обратно в окно набора `draft`**, если поле набора сейчас пустое (как в `cancelQueuedMessage(turn, true)` из `Pritha-NeuralDeep`).
     - **`Cancel`** — отменяет сообщение в очереди и удаляет его без возврата в черновик.
   - Кнопка **`[ ■ Stop ]`** (`interrupt`) также находится под рукой в нижней панели композера, пока идёт ход.

---

## 5. Чек-лист проверки и тестирования (Acceptance Gate)

1. **Тесты голосового дефолта (`tests/control-center-voice-settings.test.mjs`):**
   - Проверить, что `normalizeVoiceModel(undefined)` возвращает `"gpt-realtime-2"`.
   - Проверить, что `gpt-live-1` доступен при явном выборе, а все локальные инструменты голоса остаются активными.
2. **Тесты переключателя коннекторов и пресетов (`tests/provider-connector-presets.test.mjs`):**
   - Проверить сохранение независимых пресетов модели/effort/timeout для `codex`, `neuraldeep`, `claude`, `openrouter`, `local`.
   - Проверить отсутствие тихого фолбэка между провайдерами при ошибке API.
   - Проверить, что в быстром селекторе `Task Chat` отображаются только провайдеры со статусом `ready`.
3. **Тесты умного композера `Steer + Queue` (`tests/task-chat-steer-and-queue.test.mjs` + Playwright E2E):**
   - **Сценарий 1 (Любой транспорт — Queue + Edit + Cancel):** запустить ход в `Task Chat`, пока он `in_progress`, набрать текст в главном `<textarea>` и нажать `Enter` (или кнопку `Queue`). Убедиться, что сообщение встало в очередь, поле очистилось, а нажатие `Edit` возвращает текст обратно в `<textarea>` и удаляет элемент из очереди. После завершения первого хода оставшееся в очереди сообщение автоматически стартует следующим ходом.
   - **Сценарий 2 (Транспорт с поддержкой `steer`, например `Codex App Server`):** во время активного хода убедиться, что рядом с кнопкой `Queue` видна кнопка `Steer now`. Набрать уточнение, нажать `Steer now` (или `Cmd+Enter`) и проверить, что вызывается `turn/steer` с точным `expectedTurnId`, а уточнение вливается в активный ход без создания нового хода в очереди.
   - **Сценарий 3 (Транспорт без `steer`, например `NeuralDeep CLI` / `Claude Code CLI`):** убедиться, что во время активного хода кнопка `Steer now` скрыта, а `Queue` и `Stop` работают штатно.
4. **Полный прогон `node scripts/quality-gate.mjs` и `node scripts/privacy-audit.mjs --strict`:** 0 ошибок, 0 утечек ключей.
````

### Приложение D — дополнение пользователя о ребрендинге

Source class: operator message; received/verified 2026-11-01. Дополнение к A/B/C,
а не замена исходной цели. Полный текст сообщения:

````text
Забыли ещё про одну недоработку:

Незавершённый ребрендинг `Techscope` → `Pritha`: 

- Внутри кода, схем и переменных окружения (`TECHSCOPE_ROOT`, `.techscope-setup.json`, `.memory/techscope.sqlite`, `"name": "techscope"` в `package.json`) сохраняется историческое имя. Хотя это задокументировано как осознанный слой обратной совместимости, для внешнего контрибьютора двойная терминология создаёт лишний когнитивный шум.

Насколько это серьёзно? Насколько трудно исправить без рисков? Добавишь в роадмэп?
````
