---
id: pritha-provider-convergence-roadmap-2026-11-01
type: workflow
status: in-progress
created: 2026-11-01
updated: 2026-11-01
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
source_updated: 2026-11-01
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

### R0 — План, входные свидетельства и исходное состояние

**Статус: in-progress.** Зависимости: нет. Результат: этот документ, source hashes,
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
- [ ] Проверить official docs используемых protocol/CLI/API/capabilities и
  установленную toolchain без чтения приватной авторизации.
- [x] Запустить baseline quality-gate/self-test, native unit, typecheck и memory
  acceptance. Full gate записать один раз; последующие прогоны только после
  изменений/ошибок, которые их оправдывают. Отделить existing failures.

**R0 gate:** source SHA подтверждён, local branch безопасна, исходные результаты
сохранены; чужие файлы не изменены. Rollback: удалить только созданные нами
fixtures/branch после review, не reset/stash пользовательской работы.

### R1 — Сохранность Curated FTS v2 и portable Python

**Статус: implemented; isolated gate passed; final instance gate pending.** Зависимость R0. Результат: общий поиск для всех профилей.

- [x] Инвентаризировать `pritha_memory_retrieval.py`, `memory-retrieve.py`,
  `memory-retrieval-eval.py`, `memory-retrieval-acceptance.py`, `curated-memory.mjs`.
- [x] Сохранить русскую нормализацию, симметричный глоссарий, веса sections,
  pre-BM25 фильтры privacy/domain/history и явную cosine reduction MiniLM.
- [x] Общий interpreter resolver: explicit supported override, instance venv,
  совместимый legacy/system Python. Проверить paths с пробелами/кириллицей,
  отсутствующий/неисполняемый interpreter и bounded spawn errors.
- [x] `query-memory curated` + search/semantic/stats backward compatibility;
  lexical path не импортирует torch/sentence_transformers и не делает network.
- [ ] Сохранить curated `agent-building-knowledge` factory retrieval; ND exact
  passage binding и bounded excerpts переносить точечно на R6.
- [x] Сверить весь октябрьский knowledge pack из A §1.3: два intake, registry
  24 repos/10 accepted-for-review как исторический факт, все signals, шесть briefs,
  reviews MD/JSON, superseded/active decisions, три workflow, failure template.
- [x] Проверить все шесть tests/fixtures из A §1.4; acceptance SHA-256 неизменен:
  `b6e60c6559288cce982770c64e4065f0645a54b4a45b6b724b9fe4d2dce89118`.
- [ ] Validate/rebuild memory в изолированном state. После финальных Markdown
  changes обновить authored index и embeddings по принятому workflow.

**R1 gate:** memory validation/rebuild 0 ошибок; оба curated tests pass;
positive Hit@5 ≥80% (историческая цель 45/48), Hit@10 ≥90% (46/48), holdout
Hit@5 ≥80% (23/24), private leaks=0; strict privacy pass. Отдельно warm/cold
latency/RSS без утверждения непроверенного SLA. Rollback — предыдущие code files;
generated indexes воспроизводимы, не коммитятся.

### R2 — Provider schema, presets, identity и migration

**Статус: in-progress.** Зависимости R0–R1.

- [x] Общий JS provider resolver + typed TS boundary, пять IDs и legacy aliases.
- [x] Bootstrap names отдельно; precedence и invalid-value fail-closed.
- [x] Версионированный runtime-settings schema с per-provider presets;
  migrate native model/effort/timeout без destructive rewrite.
- [ ] Namespaced thread/provider/model/session binding, legacy native migration,
  atomic storage, corruption recovery, optimistic revision и validation.
- [ ] Capability schema: steer, interrupt, approvals, tools, attachments, usage,
  resume, sandbox, offline, model constraints. UI использует server capabilities.
- [ ] Typed provider errors с actionable operator status, без raw upstream body.

**R2 tests:** все 5 preset round trips; precedence env/config/setup/default;
невалидные IDs; corrupt/missing config; два инстанса; switch during active turn;
native history unchanged; exact model resume; no cross-provider fallback.

### R3 — Общий Task Chat facade и native driver

**Статус: in-progress; native extraction and contract tests passed.** Зависимость R2.

- [x] Извлечь driver types и native adapter вокруг app-server/native-control/
  native-turn-coordinator/goal-control/history-reader; сохранить canonical source.
- [ ] Gateway делегирует provider execution и history; общие attachments,
  normalization, idempotency, admission, queue и HTTP errors остаются общими.
- [ ] Host queue protocol для всех drivers, exact receipt на uncertain start,
  restart recovery, cancellation lease cleanup, retry-after и queue limits.
- [ ] Не смешивать provider sessions в native history; cursor pagination,
  event replay/dedupe, reconnect, archive/rename и approvals проходят binding.
- [x] Контрактные tests драйвера на fake backend до подключения новой сети.

**R3 gate:** весь native chat suite; concurrency/double-submit/restart tests;
typecheck; history pagination/quotes/image annotation/scroll не деградировали.

### R4 — NeuralDeep как полноценный adapter

**Статус: in-progress; transport/owned-runner/history foundations verified.** Зависимости R2–R3, подтверждённый ND pin.

- [ ] Перенести reviewed `scripts/neuraldeep-codex.mjs`, `scripts/neuraldeep/*`,
  loopback Responses SSE adapter, credential boundary и model capability data.
- [ ] Интегрировать admission-coordinator, CLI runner/runtime, voice-queued handoff
  через общий driver; не заменить native gateway ND-only реализацией.
- [ ] Сохранить limits/concurrency/Pro/Wallet/requires_wallet gating, bounded
  retries, output budgets, tool receipts, model pin и cleaned process env.
- [ ] Search Auto, ND STT/TTS/voice topics подключать через отдельные modules.
- [ ] Перенести все relevant ND тесты с provenance, инвентаризировать реальное
  число файлов и subtests; «93» не hardcoded обещание полноты.
- [ ] Audit secret leaks и runtime network адаптировать к profiles: разрешённые
  native строки в репозитории не должны ложно считаться ND runtime fallback.

**R4 tests:** SSE chunk boundaries, tool calls, errors, timeout, abort, 429,
concurrent admission, lost response, resume mismatch, wallet restriction,
secrets canaries и запрет внешнего OpenAI/native fallback. ND regression suite
и native suite зелёные в одном tree. Live smoke отдельно от fixtures.

### R5 — Claude Code: runner, decisions, build и child API

**Статус: in-progress; API lane / host MCP / shared Task Chat verified; build and local CLI auth pending.** Зависимости R2–R4 (общие contracts, не ND subscription).

- [x] Проверить current CLI flags/stream schema/SDK terms по official docs,
  локально `claude --version` bounded 5s. SDK не обязателен для CLI runner.
- [ ] Instance Keychain для Anthropic; auth modes api-key / local-cli-session.
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
- [ ] `ClaudeCodeBuildExecutor`: probe/execute/recover, disposable worktree,
  standard result schema, protected verifier, isolation check, schema output,
  budgets and ledger. Recover reconstructs status without duplicate start and
  preserves observed model. Adversarial sandbox tests, not only string matches.
- [x] Lightweight fetch Anthropic Messages client for selected child runtime:
  pinned API version, timeout/abort, sanitized errors, bounded output, tool policy.
- [x] Root `CLAUDE.md` with `@AGENTS.md` + narrow Claude rules, YAML frontmatter;
  do not duplicate AGENTS. Sonnet/Opus/Haiku catalog with verified IDs/capabilities.
- [ ] Existing `claude-tools-pilot.mjs` conformance remains valid; live single turn
  only through configured authorized credentials. Child pilot through UI later.

**R5 tests:** synthetic fragmented stream, parallel tools/missing receipt, error
max turns, wrong session, model pin, exact cache billing, foreign env removal,
approval replay/race/reject/expiry, protected-file and network escape attempts,
budget exhaustion and crash recovery. Gate does not equate hook with sandbox.

### R6 — Общая надёжность Agents Mother

**Статус: pending.** Зависимости R1–R5; независимые fixes можно делать раньше.

- [ ] Сравнить изменения ND be82911a/49c4a656, dfe92027/9c508ed1/edcb1f85,
  4e395a37/7cae2809/e89b7d5c, 56ef5205/19a37e01/fcb88077 по verified history.
- [ ] UTF-8 locale и существующий безопасный ASCII TMPDIR, chmod/ownership,
  кириллический cwd и heredoc regression; no user-specific hardcoded paths.
- [ ] Model capability/effort/thinking/output policy per connector; high/xhigh
  constraints validate before dispatch. Native recover retains prior model.
- [ ] Host deterministic research с durable checkpoints, total deadline и
  bounded per-source timeouts; exact passages и bounded excerpts сохраняются.
- [ ] not-applicable + adoption:none → корректный research gate без allow-pending;
  не обходить остальные contract-specific evidence/synthesis требования.
- [ ] init --from-brief генерирует валидный runtime/interface/port/operations;
  валидатор перечисляет допустимые enum без секретного input echo.
- [ ] Общая registration execution backends для пяти connectors; runtime/build
  capabilities разные, unsupported isolation не маскировать доступностью модели.

**R6 gate:** factory regression suite; UTF-8/TMPDIR; deadline/checkpoint restart;
contract enums; gate matrix; headless/api/tool-server manifests; native/Claude
recover model pin; output large-file/truncation fixture.

### R7 — OpenRouter и Local

**Статус: pending.** Зависимости R2–R4, R6 contracts.

- [ ] Выделить reusable OpenAI-compatible loopback bridge без ND billing/auth
  assumptions. OpenRouter uses fixed upstream and HTTP-Referer/X-Title metadata.
- [ ] OpenRouter Keychain + credential API; bounded 5s key/balance probe по
  подтверждённому official endpoint; usage/limit/free tier в normalized DTO.
- [ ] Model catalog из проверенного shortlist с manual vendor/model slug;
  исторические пять IDs из C §1.1 сверить, не silently substitute.
- [ ] Child credentials drawer: OpenRouter наравне с ND, API key/base URL/model
  только после операторского выбора и проверки child/.env.local boundary.
- [ ] Local server discovery Ollama 11434, LM Studio 1234, custom MLX loopback;
  /v1/models, selected model validation, endpoint-specific capabilities.
- [ ] Strict offline policy: no cloud fallback/auth/env leakage/web tools/cloud
  voice. Проверка egress процесса и tools; Ollama cloud model не offline.
- [ ] Start/resume/cancel/queue/usage follow common driver; capabilities honest.

**R7 tests:** fake HTTP/SSE upstream; credentials mask/error sanitization;
redirect/SSRF/IPv6/invalid URL; unreachable server; no model; cloud model denial;
offline no-egress probes; no remote credential forwarding; child symlink and
wrong-project rejection. Live providers readiness только по реальным probe.

### R8 — Единый пульт Settings и быстрый выбор в Task Chat

**Статус: pending.** Зависимости R2–R7.

- [ ] ProviderConnectorBar ровно из пяти компактных pills: label/status/model.
- [ ] Один выбранный settings panel: native CodexAuth/CodexSettings, ND keys/
  limits/wallet, Claude CLI/auth/model/effort, OpenRouter key/balance/model,
  Local endpoint/discovered models. Preserve native transport/routing/tier.
- [ ] Per-provider presets не сбрасываются при переключении, stale save не
  перетирает другой panel. Keys не входят в presets/client state persistence.
- [ ] New-chat provider/model selector only `ready`; ссылка Configure providers.
  Existing thread показывает pinned provider; active task не меняется.
- [ ] Factory phase presets interview/contract/outcome/scaffold/implement,
  Subject=child + slug, admission queue/limits feedback без hidden prompt headers.
- [ ] Preserve quote replies, image annotation, stream scroll anchoring,
  activity pagination и release receipts.

**R8 gate:** component/state tests + desktop/mobile Playwright, keyboard/focus,
empty/loading/error states, configured-vs-ready, five independent saved presets,
active-thread switch, native feature regression и no-secret DOM/storage checks.

### R9 — Голос: shared tools и отдельные transports

**Статус: pending.** Зависимости R2–R8.

- [ ] Extract shared voice-tools dispatcher и existing transport boundaries
  небольшими проверяемыми шагами; не переписывать весь runtime одним diff.
- [ ] Preserve 9 инструментов: Full Pritha Memory, Inspect Pritha Files,
  Inspect Voice Task, Rolling Summary, Good State Signal, Answer Voice Task,
  Confirm Voice Intake, Web Search, Run Voice Task; capability/privacy checks.
- [ ] Native model default `gpt-realtime-2`; options order/default label, Live 1
  Experimental explicit only. Existing live-session/delegation code сохраняется.
- [ ] Voice engine Auto/OpenAI/NeuralDeep, resolution по правилам §2. Поддержать
  no-key/both-keys/offline cases; не переключать engine при error.
- [ ] ND transport + persistent voice topics; common run-task routes to pinned
  selected task connector, exact queue/admission handoff and cancellation.
- [ ] Preserve music ducking/manual volume, interruption, reconnect, summaries,
  private Good State capture (без создания task или поддельного UI approval).

**R9 tests:** default/explicit Live; nine tools; transport routing matrix 5×3;
no unintended cloud audio; persisted setting migration; voice-task bindings;
music/duplex/reconnect. Browser mic/audio checks later mark manual evidence.

### R10 — Умный composer: Queue, Steer, Edit, Cancel, Stop

**Статус: native implemented; cross-provider gate pending.** Зависимость R3; выполнить независимо до всех live providers.

- [ ] Textarea/attachments доступны во время running turn; send validation
  различает empty draft, upload in progress, busy request и active turn.
- [ ] Enter без Shift и primary button → Queue при active turn, иначе Send.
  Queue request несёт текст, attachment IDs, provider binding, Idempotency-Key.
- [ ] Placeholder объясняет Queue и доступный Cmd/Ctrl+Enter Steer; IME composing
  и Shift+Enter не отправляют сообщение; повтор keydown не дублирует dispatch.
- [ ] Steer capability + exact expectedTurnId/clientMessageId. С вложениями
  disabled + tooltip, без capability скрыт. Stale turn не превращается в новый.
- [ ] Queue cards над composer: status, Edit, Cancel. Revision-checked cancel;
  Edit восстанавливает original text/files только в пустой draft после receipt.
  Проверить draft, изменённый во время await; cancel failure сохраняет всё.
- [ ] Stop доступен рядом; no destructive queue cancellation без явного действия.
- [ ] Automatic next turn после completion, FIFO, retries/reload/two tabs,
  expired attachments и dispatch-versus-cancel race без потери данных.

**R10 gate:** meaningful behavior tests и Playwright для native steer,
non-steer connector, queue with attachments/edit/cancel/stop/auto-start;
double Enter, lost response, stale revision/turn и mobile composition.

### R11 — Bootstrap, distribution и инструкции

**Статус: pending.** Зависимости R1–R10.

- [ ] Unified PROFILES minimal/local/control-center/control-center-tailscale,
  neuraldeep/claude и явные OpenRouter/Local selectors без конфликта имён.
- [ ] Instance-local venv/state/agent parent; provider profile persisted без keys.
  prepareDistributionInstance переносится с isolation regression tests.
- [ ] Reviewed `examples/brief-desk-nd`, install-brief-desk и START_HERE/docs
  сохраняются; demo setup локально/идемпотентно, без server autostart и secrets.
- [ ] Native и ND onboarding одной codebase; Claude/API/OpenRouter/Local setup,
  pending-auth/offline statuses, external runtime requirements и recovery guide.
- [ ] Fresh sandbox install/upgrade from legacy config, no runtime data copied;
  CLI --help, samples, manifests и selected modules coherent.

**R11 gate:** bootstrap dry-run + isolated prepare, dependency/venv resolution,
two-instance isolation, demo scaffold sanity, profile switching, backwards
compatibility и отсутствие long-running processes/credential provisioning.

### R11b — Завершение ребрендинга Techscope → Pritha без потери состояния

**Статус: planned; added by operator during execution.** Выполняется до R12.
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
   - [ ] Разделить упоминания на public/current API, внутренний compatibility
     boundary, persisted schema/identity и неизменяемую историю/источники.
   - [ ] Зафиксировать canonical имена: `PRITHA_ROOT`, `resolvePrithaRoot`,
     `.pritha-setup.json` для legacy checkout layout, `pritha.sqlite` внутри
     выбранного memory directory и package `pritha`. Внешний state-root уже
     использует нейтральный `setup/setup.json`; его переименовывать не нужно.
   - [ ] `TECHSCOPE_ROOT`, `resolveTechscopeRoot`, старые CLI entrypoints и
     существующие файлы остаются compatibility aliases на переходный период.
     Удаление aliases не входит в эту поставку. Старые артефакты, их IDs,
     source URLs, цитаты и ссылки не переписывать массово.
   - [ ] Отдельно проверить protocol/schema/table identifiers: переименовать
     только при реальной необходимости с versioned reader/migration; не ломать
     сохранённые foreign keys, citations, retrieval fixtures и историю задач.
   - **Проверка:** versioned inventory/allowlist оставшихся имён с причиной;
     Good State Alignment для memory, setup и instance isolation.
2. **R11b.2 — Единое разрешение корня и совместимость окружения.**
   - [ ] Нормализованный explicit `--root` > `PRITHA_ROOT` > `TECHSCOPE_ROOT`
     > Git root > cwd. Два разных непустых env roots — actionable conflict,
     а не молчаливый выбор; explicit root задаёт оба aliases одинаково в child.
     Не существующий явно заданный root не должен переключать экземпляр.
   - [ ] Одинаковое поведение Node, TS, Python, shell wrappers, bootstrap,
     setup, CLI workers и managed-runtime manifests; import/export aliases
     используют одну реализацию. Обновить redaction для обоих названий.
   - [ ] Новые scaffold/config/examples используют Pritha; при запуске старых
     дочерних entrypoints передавать совместимые env значения одного root.
     `PRITHA_STATE_ROOT` и `PRITHA_AGENT_PARENT` сохраняют границы экземпляра.
   - **Тесты:** neither/old-only/new-only/both-equal/both-conflicting, пробелы,
     symlink/canonical identity, invalid root, explicit root, запуск вне checkout,
     Python/Node parity, два экземпляра и child env без чужих credentials.
3. **R11b.3 — Чтение старых данных и безопасный перенос.**
   - [ ] Общие resolvers memory database и setup file вместо разбросанных
     литералов. Fresh install создаёт canonical файл; old-only installation
     читает прежний. Чтение/health/status не переименовывает и не создаёт файлы.
   - [ ] При двух разных файлах не выбирать по mtime и не сливать автоматически:
     показать конфликт и остановить запись до явного выбора источника.
     Даже «одинаковые сейчас» копии не должны стать двумя writable truth sources.
   - [ ] Подготовить read-only migration plan, private manifest, backup и
     bounded transaction с lock, проверкой source fingerprint и destination
     no-clobber. Повторный запуск идемпотентен; interruption оставляет понятный
     recovery state, а не partly switched paths.
   - [ ] SQLite переносить согласованным snapshot/backup API с учётом WAL/SHM,
     integrity check и отсутствия конкурирующих writers; не делать raw rename
     живой БД. Проверить schema, FTS, relations, embedding dimensions/counts,
     semantic status и authored document identities до/после.
   - [ ] Setup переносит version/profile/warnings/pointers без secrets в tracked
     report. Проверить permissions, symlinks, path traversal и external state-root.
   - [ ] Rollback восстанавливает исходные bytes/path selection из manifest;
     никакого удаления исходного state до успешной приёмки. Проверить startup
     предыдущего кода на сохранённом состоянии без рассинхронизации записей.
   - **Тесты:** fresh/legacy/external layouts, dual-file conflict, corrupt source,
     symlink escape, WAL activity, crash на границах транзакции, retry/rollback,
     одновременные workers, пустая/полная память, unchanged retrieval holdout.
4. **R11b.4 — Внешний вид репозитория и защита от возврата старых имён.**
   - [ ] Package metadata, README/README.ru, текущие setup/help/error labels,
     docs, AGENTS и templates описывают Pritha как primary и одну короткую
     compatibility note. Existing historical Markdown и source appendices
     остаются историей; актуальные ссылки на старые filenames сохраняются.
   - [ ] Старые executable filenames становятся тонкими aliases к новым,
     если это оправдано inventory; не создавать второй независимый runtime.
   - [ ] Guard проверяет новые runtime references вне явного compatibility
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

**Статус: pending.** Зависимости все выше.

- [ ] Full `node scripts/quality-gate.mjs`, self-test, privacy strict,
  validate/rebuild memory, Curated acceptance frozen fixture, ND security/network
  audits, all provider suites, factory suites, typecheck, production staging build.
- [ ] Dependency audit от 2026-11-01: обновить проверяемые patches Next/Sharp/
  Undici и транзитивных browser-mapping/source-map-js, затем production E2E.
  Для sandbox-runtime 0.0.81 upstream использует Zod 3; отдельно проверить
  advisory GHSA-mrhx-c7xc-m3w5 и достижимость oversized collection path:
  sandbox получает только bounded host-authored config, model input не подаётся
  в его schemas. Не подменять несовместимой major-версией без проверки API.
- [ ] Playwright desktop/mobile: native history, 5 provider settings, ready-only
  selector, queue/steer, phase presets, attachments/annotation/quotes/activity,
  voice settings, agents credentials. Real auth unavailable → pending-live-check.
- [ ] Strict candidate health: /voice, /agents, /task-chat, /codex, /settings,
  same-origin JS chunks, identity/build, admission and operational read-only checks.
  Candidate test harness — isolated loopback, fixture state, no production swap.
- [ ] Sanitized review с changed-file/source map, test commands/counts, failures,
  limitations, schema migration/recovery, no-push proof и manual script.
- [ ] Подготовить staged local activation и rollback; только тогда запросить
  непосредственный approval на конкретный managed service action, если он нужен.
- [ ] Ручные сценарии на Mac mini: новый/старый Codex chat; Queue/Edit/Cancel/Stop;
  Steer точного turn; переключение presets; ND key/limits/wallet; Claude auth/
  guarded child creation; OpenRouter key/model/child preset; Local без сети;
  Realtime 2 nine tools/music; explicit Live; ND voice; voice→active tasks.
- [ ] Child pilot interview→contract→outcome→scaffold→deliver/implement в
  изолированном parent/state с раздельными approvals, измерением turns/cache tokens
  и protection gates. Не выдавать mocked pilot за боевой.
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
