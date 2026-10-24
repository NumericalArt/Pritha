---
id: 2026-10-21-pritha-agent-enrichment-execution-review
type: review
status: superseded
created: 2026-10-21
updated: 2026-10-21
topics: [pritha, memory-enrichment, research-verification, retrieval-evaluation, harness-evolution]
tools: [Pritha, Codex, GitHub, SQLite, FTS5, MiniLM]
sources:
  - 07_workflows/2026-10-21-pritha-agent-knowledge-enrichment-plan.md
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
  - 03_reviews/2026-10-21-agent-repository-evidence.json
  - 05_decisions/2026-10-21-curated-agent-knowledge-and-retrieval.md
related:
  reviews:
    - 03_reviews/2026-10-21-agent-stack-repository-assessment.md
    - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
  workflows:
    - 07_workflows/memory-indexing.md
    - 07_workflows/agent-failure-to-trial.md
supersedes: []
superseded_by:
  - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
memory_domain: pritha-self
memory_domains: [pritha-self, governance]
subject:
  kind: pritha
  id: agent-knowledge-enrichment
privacy: public
retention: durable
review_status: verified-with-limitations
confidence: high
freshness_status: current
source_published: 2026-10-21
source_updated: 2026-10-21
source_version: enrichment execution v1; source pins and frozen retrieval fixture
retrieved: 2026-10-21
verified: 2026-10-21
temporal_status: version-bound
---

# Результаты обогащения Pritha агентными знаниями

Исторический первый прогон. Последующая content verification и реальные pilots зафиксированы в `03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md`; отрицательные исходные measurements ниже сохранены.

Программа исследования выполнена: знания, registry, manual workflow и evaluation tooling добавлены; полный self-test прошёл 875/875 tests. Новый retriever не прошёл заключительный promotion gate и остаётся experimental. Live provider/UI pilots закрыты как watch по fit. [Машинные измерения](2026-10-21-agent-enrichment-measurements.json) отделяют промежуточные и финальные результаты.

## Исходное состояние и пробелы

| Возможность | Состояние до изменения | Подтверждение и закрываемый пробел |
| --- | --- | --- |
| Native Codex executor | implemented | execution-backends.mjs, build-executors.mjs; проверить installed schema и paused Goal без model turn. |
| Protected Trials и delivery ledger | implemented | outcome-spec, trial-runner, delivery-ledger v2 и тесты; добавить manual cause/evidence workflow. |
| Generic sensor runtime и calibrated judge | planned | Inventory от 2026-09-06; не выдавать draft за capability. |
| Live voice | implemented | live-session.ts и migration review 2026-09-11; новый Decisions backend watch. |
| MiniLM и FTS | implemented, limited retrieval | Legacy AND и повтор chunks/child history мешают общим вопросам; добавить scoped opt-in command. |
| MCP Apps host и View | unknown / not-needed now | Собственный web UI уже есть; negotiated host не подтверждён. |
| SDK alternative executor | not-needed now | Нет конкретного Outcome, где заменяет нынешний backend с выгодой. |
| Plugin hot reload host | not-needed now | Нет general host; lifecycle patterns сохранить без нового manager. |
| Managed durable runtime | not-needed now | Существуют ledger/receipts; operational blocker для миграции не выявлен. |

Good State Alignment выполнен с limit 3: baselines 2026-07-02 и 2026-08-28, aligned. Initial full self-test: pass, 869/869 tests, privacy, memory, queue/runtime/health checks pass.

## Покрытие исследования

K1–K10 рассмотрены в [deep review](2026-10-21-agent-repository-deep-review.md), шести thematic briefs и Failure-to-Trial workflow. 10 release commits/tree SHAs, 28 source/test/spec/license files с проверенными blob/SHA-256 сохранены в evidence manifest. Registry содержит 24 уникальные записи, включая 10 новых accepted-for-review.

Официальные docs сверены отдельно от GitHub metadata. Codex stable 0.163.0 отделён от installed standalone 0.153.0 и prerelease 0.164.0-alpha.8. Claude Commercial Terms, MCP mixed license, DeepSeek preview и Microsoft persisted-state compatibility внесены в reuse caveats.

## Эксперименты и решения

| Pilot | Результат | Решение |
| --- | --- | --- |
| E0 Codex compatibility | 304 local JSON schemas; isolated initialize/thread/paused Goal/read/clear/unsubscribe pass, usage 0. | adopt manual probe; schema presence отдельно от model-session proof. |
| E1 Failure-to-Trial | Synthetic missing/wrong product и verifier tampering covered существующими protected Trial tests; retrieval failure reproduced на frozen cases. | adopt manual workflow/template, без generic sensor runtime. |
| E2 Retrieval | 30 frozen cases, original/knowledge-only baseline и повтор после authored updates; последний gate fail. | adopt eval tooling; scoped FTS/hybrid promotion hold; model migration watch. |
| E3 MCP Apps View | Negotiated target host unconfirmed; protocol/source reviewed. | watch, real View/browser pilot не выполнялся. |
| E4 SDK executor | State/history/approval code reviewed; нет выбранного contract с измеримой выгодой второго executor. | watch, external SDK не устанавливался и не запускался. |
| E5 Fast routing/voice | Current Live tests и intent/correction criteria. | watch backend switch; provider voice pilot не выполнялся. |
| E6 Prompt cache | Accounting formula проверена deterministic arithmetic; write/read double counting исключён. | adopt knowledge, live cache-hit/cost/latency pilot watch. |
| E7 Plugin lifecycle | Scope/disposer/grants/cancellation source review; общего Pritha hot reload host нет. | watch lifecycle pilot; fake manager не выдаётся за проверку настоящего runtime. |
| Managed execution | Local ledger/reconcile уже реализованы; нового operational requirement нет. | watch без cloud resource creation. |

План явно допускает закрывать pilots как watch/skip по fit; выполнение исследования не требует установки всех рассмотренных продуктов. Платных model calls 0, новых provider dependencies 0, новых services/schedulers 0.

## Изменённое поведение и измерения

Experimental команда scripts/memory-retrieve.py использует scoped FTS, а semantic/hybrid доступны явно, cached-only. Domain/status/path filters и document deduplication ограничивают curated knowledge; live instance-agent paths, user-model и historical статусы исключены. Основной research flow и legacy commands сохраняют поведение.

| Путь | Hit@5 из 24 | Hit@10 из 24 | Holdout hit@5 из 8 |
| --- | ---: | ---: | ---: |
| Initial legacy AND FTS | 6 | 6 | 1 |
| Initial legacy semantic | 12 | 12 | 4 |
| Knowledge-only legacy AND FTS | 7 | 7 | 2 |
| Knowledge-only legacy semantic | 15 | 15 | 4 |
| Первый scoped FTS snapshot | 20 | 22 | 6 |
| Повтор scoped FTS после authored updates | 19 | 22 | 5 |
| Повтор scoped semantic | 18 | 19 | 4 |
| Повтор scoped hybrid | 19 | 20 | 4 |

Пороги зафиксированы до настройки: positive hit@5 ≥80%, holdout ≥75%, no initial semantic top-10 regressions и private leaks 0. Первый FTS snapshot прошёл, повтор на заключительном корпусе не прошёл. Hybrid не прошёл ни в одном из этих сравнений. Frozen questions и ranking formula после измерения не подгонялись. Во всех scoped modes synthetic canaries отсутствуют. Будущий promotion требует нового независимого validation corpus; текущий holdout не использовать для дальнейшей настройки.

Однофакторная ablation на одном snapshot с одинаковыми domain/status/path filters и dedup: strict AND дал 6/24, OR — 20/24. Это подтверждает причину части lexical misses. Отдельное исключение Pritha rollout decision из general domain не устранило заключительную регрессию; конкретный вклад последних authored updates остаётся uncertain. Решение о внедрении Pritha переклассифицировано в pritha-self/governance по subject, а не как исправление метрики.

В первом сравнении scoped FTS warm p95 около 12 ms, semantic около 28 ms, hybrid около 23 ms. Joint semantic eval cold load около 2.6 s и peak RSS около 905 MB. Отдельный FTS command body: 35.5 ms, около 29 MB RSS, ML imports отсутствуют. Это локальный маленький benchmark; original semantic baseline рассчитан vectorized float32 для сопоставимых rankings и не является latency старого CLI.

## Synthetic factory cases

Проверены small API agent, Codex-native worker, read-only research View и voice agent. Registry-first code сохраняет selected reference первым, limit 5, advisory candidate и blockers verify-current-head/security-review/contract-specific-eval. Все 24 URLs уникальны. Machine verified pin остаётся unknown до contract-specific GitHub gate.

Manual architecture rubric: API client не требует общего SDK; Codex worker сохраняет App Server history/approvals; View требует подтверждённого host и text fallback; voice использует нынешний Live с отдельными permissions/intent Trials. Это architecture/research checks, без создания четырёх live child agents.

## Финальная верификация

Шесть targeted retrieval tests pass: scope/private/sibling filtering, dedup/input validation, readonly/missing DB, explicit instance resolver, frozen corpus, invalid embeddings и recoverable model load. Final full self-test: **pass, 875/875 tests**, без skipped/cancelled. Strict Control Center health: пять pages, включая /codex, и 13 JavaScript chunks pass. Queue health, runtime manager status и launchd root audit pass. Privacy/Markdown checks pass.

Финальный self-test восстановил 958 documents, 10449 chunks и 10228 non-template embeddings. Закрывающие rebuild/embedding/privacy checks также пройдены: missing и orphan embeddings 0, все vectors 384d; окончательные counts и coverage находятся в measurements. Неизменённый код повторно не прогоняется через общий suite только из-за обновления отчёта.

Env doctor отмечает текущий Python 3.9.6 как поддерживаемый transitional floor и рекомендует ≥3.10. Это не failure, но upgrade для новых ML dependencies требует отдельного сравнения.

External source payload files и временные DB copies удалены после синтеза. Полные локальные test/eval reports хранятся только в <PRITHA_STATE_ROOT>/memory/evals/<run-id> с ограниченными permissions; tracked measurements содержат обезличенные агрегаты.

## Практические ограничения

Retrieval hit не равен answer accuracy. Negative cases не доказывают semantic abstention. Полная model-based история/interrupt/steer, subjective voice quality, actual cache hits, новый UI host и SDK cost comparison остаются отдельными workload-specific pilots.

Publication, operational restarts и deployment не требуются для этих knowledge/CLI изменений. User acceptance и новая Good State Baseline ещё не запрашивались и не фиксировались.
