---
id: 2026-10-21-pritha-retrieval-and-runtime-verification
type: review
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [pritha-memory, retrieval, eval-integrity, codex-recovery, mcp-apps, sdk-pilots]
tools: [Pritha, SQLite, FTS5, MiniLM, Codex CLI, MCP Apps, OpenAI Agents SDK, Claude Agent SDK]
agent_platforms: [Pritha, Codex, OpenAI, Anthropic, MCP]
model_context: [MiniLM-L12-v2 unchanged; live Codex probes on available account models]
runtime_environment: [manual CLI, isolated local browser host, offline SDK conformance]
config_surfaces: [instance memory, native threads, MCP tool allowlist, serialized SDK state]
portability: adapter-needed
sources:
  - 03_reviews/2026-10-21-retrieval-runtime-measurements.json
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
  - tests/fixtures/memory/retrieval-acceptance-cases.json
  - scripts/experiments/agent-pilots/package-lock.json
  - https://learn.chatgpt.com/docs/app-server
  - https://developers.openai.com/api/docs/guides/agents/guardrails-approvals
  - https://code.claude.com/docs/en/agent-sdk/overview
  - https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h
  - https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-jm63-cq47-j5jp
  - https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453
related:
  workflows:
    - 07_workflows/memory-indexing.md
    - 07_workflows/agent-failure-to-trial.md
  decisions:
    - 05_decisions/2026-10-21-curated-retrieval-promotion.md
supersedes:
  - 03_reviews/2026-10-21-pritha-agent-enrichment-execution-review.md
superseded_by: []
memory_domain: pritha-self
memory_domains: [pritha-self, governance]
subject:
  kind: review
  id: pritha-retrieval-runtime-verification
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_published: 2026-10-21
source_updated: 2026-10-21
source_version: locked retrieval content fixture v2; Codex 0.153.0 and 0.163.0; pinned local SDK packages
retrieved: 2026-10-21
verified: 2026-10-21
temporal_status: version-bound
---

# Поиск памяти и проверка агентных runtime

Разрешённое продолжение enrichment выполнено через новые измерения и конкретные local pilots. Curated поиск подключён к `agent-building-knowledge` factory research и ручной команде. OpenAI SDK дополнительно проверен реальным API вызовом и сравнен с простым Responses loop на одной задаче. Claude agent loop ожидает API authorization; offline conformance, live API, native Codex и browser tests имеют отдельные результаты.

## Исправление оценки

V1 принимал совпадение подстроки имени файла за relevance. Он мог пропустить правильный альтернативный источник и засчитать неверный раздел правильного файла. Корректная module-local license evidence в a5 была false negative; s4 также возвращал содержательный альтернативный assessment. s3 выявил русскую морфологию и смешанные термины; s9 — ранжирование вопроса в плане вместо ответа; s10 — общие слова и неполный контекст разделов. Исходные fixture/measurements не переписаны.

Content v2 требует авторизованную identity источника и существенные утверждения в одном выданном разделе. Контекст нескольких разделов допустим, но разрозненные слова не собираются в доказательство. Plan, содержащий только похожий вопрос, не проходит. Новые unit controls проверяют правильный альтернативный источник, неверный раздел, query leakage и integrity обоих fixture.

Новый набор зафиксирован до изменений поиска: 60 cases, 48 positive и 12 negative; 30 новых holdout cases, из них 24 positive. SHA-256: `b6e60c6559288cce982770c64e4065f0645a54b4a45b6b724b9fe4d2dce89118`. Старые 30 вопросов раскрыты и используются как diagnostic. Holdout результаты открыты после выбора candidate; последующей настройки по ним не было. Это одноагентная экспертная постановка нового набора, не независимое исследование другими авторами.

## Поиск: измерения и применение

| Content metric | Прежний comparator | Curated FTS v2 |
| --- | ---: | ---: |
| Positive hit@5 | 27/48 | 45/48 |
| Positive hit@10 | 30/48 | 46/48 |
| New positive holdout hit@5 | 15/24 | 23/24 |
| Synthetic private leaks | 0 | 0 |
| Потерянные прежние успешные @10 | — | 0 |

Первый paired content gate пройден: @5 ≥80%, @10 ≥90%, holdout @5 ≥80%, regressions/leaks 0. Diagnostic ablations @5: исходный 12/24; scoped corpus 12; language normalization 15; section context 18→20; title fields 20; type/status weight 21; исправление симметричной обработки окончаний 22. Каждый следующий шаг сравнивался с предыдущим до раскрытия holdout.

Warm FTS p95 первого full content run — 2.666 ms; semantic — 30.492 ms, hybrid — 12.430 ms. Это warm latency локального corpus, без запуска процесса и построения in-memory index. Полный CLI запуск дороже прежнего FTS из-за normalization; FTS сохраняет отсутствие ML imports. Semantic использует прежнюю MiniLM 384d; явная cosine reduction и проверка query vector устраняют platform BLAS anomalies. Никакая новая Google embedding модель не устанавливалась.

Оставшиеся misses не скрыты: diagnostic s6 и s9 не нашли gold source section в top-10; holdout s9 найден в top-10, но не top-5. Набор тематически ограничен; gold source identities консервативны. Новый корректный источник вне gold требует отдельного review, а не автоматического объявления его неверным или подстройки gold ради pass.

Изменения реализованы в `pritha_memory_retrieval.py`, Node bridge и factory public-domain branch. `node scripts/query-memory.mjs curated` является ручным входом. Private/history/sibling фильтрация действует до формирования BM25 corpus. В memory-indexing workflow описаны границы и воспроизводимость. Для новых ranker iterations нужен новый holdout.

## Отдельный answer audit

Один live Codex 0.163.0 / gpt-6.1-sol run ответил на 10 вопросов по пакетам top-3 retrieval sources. Gold answers не передавались модели. По содержательному review: 6 подтверждённых ответов, 4 корректных insufficient; citations принадлежат переданным source packets, private marker echoes 0. Проверены module-local license, plugin teardown, parallel tool history, preview/security boundary, Live migration, Microsoft serialized records; negatives включали неизвестную версию, private request, отсутствующий рецепт и wiki deployment claim.

В synthetic wiki source добавлена instruction, пытавшаяся разрешить deployment: модель её не приняла. Это ограниченная проверка ответов на 10 выбранных случаях; не calibrated LLM judge, не оценка всей памяти и не user acceptance.

## Реальные Codex recovery runs

Проверены installed standalone 0.153.0 / gpt-6-astra и отдельно установленный в private experiment workspace 0.163.0 / gpt-6.1-sol. В каждом успешном run настоящий model вызвал ограниченный synthetic MCP receipt, начал wait, был прерван; новый app-server process выполнил cold resume и authoritative readback тем же ключом. Два запроса создали ровно один effect; sandbox и approval policy прочитаны обратно, token usage получена, test thread archived.

Ранний сценарий с approvalPolicy never корректно блокировал mutating MCP fixture. Host approval ограничили exact synthetic server/tool/arguments и одним вызовом. Это разрешение на тестовый receipt, не общий approval, не автоматическое согласие для production tools. Следующий run обнаружил model fallback при resume; явный model pin исправил проблему. Это ошибка нашего probe adapter, не доказанный дефект Codex. Аналогичный pin добавлен в `CodexAppServerBuildExecutor.recover` с regression assertion; recovery не отправляет новый turn/start.

В native persisted history восстановлены оба успешных receipt call/result. Прерванный in-flight wait не имеет completed native tool item. Поэтому gate полной истории всех cancelled tool pairs не объявляется пройденным: для такого действия host сохраняет cancellation/ambiguous evidence и делает reconcile. Нельзя подделывать native result или заменять transcript пустой локальной историей. Synthetic idempotency fixture не доказывает exactly-once произвольного внешнего API.

Usage в неуспешных attempts сохраняется при наличии notification. Самый первый probe потерял часть usage из-за capture limitation; aggregate помечает unknown, не записывает 0. Native totals являются накопительными; их нельзя суммировать для каждого event. Полная денежная стоимость не выводится из ChatGPT subscription counters. Отдельный duplicate capture bug в raw event recorder исправлен без повторных model calls; успешные receipts и readbacks проверены по canonical thread history.

## MCP Apps memory View

Воспроизводимый отдельный host 0.1 использует настоящие App/AppBridge ext-apps 2.0.3 и MCP client/core/server 2.3.1. MCP handshake подтверждает UI capability; ui:// resource имеет `text/html;profile=mcp-app`. Клиент без UI capability получает tool без UI metadata и тот же semantic text/structured result. Server deny controls: rebuild, arbitrary command, user-model, extra path, limit overflow. Frame имеет только allow-scripts; connect-src none, без same-origin, forms, microphone или credentials. Host проверяет origin/host и schema; content выводится textContent.

Browser Trial проверяет реальный поиск, source drill-down, domain filter, reload/teardown, tool denial, private-domain denial и network denial. Проверка обнаружила две ошибки prototype: inherited srcdoc CSP не разрешала собственный nonce; sandbox без allow-forms блокировал submit. Исправлены host nonce policy и кнопка поиска без form submission. Дополнительно очищается старый source при смене результата и учитывается intent revision.

Первый dependency audit MCP 2.0.0: 2 high packages, 5 advisory causes. Исправлено pinning client/core/server 2.3.1; повторный audit: 0 findings. Проверены primary SDK advisories про OAuth credential forwarding, shared HTTP sessions и validation resource exhaustion. Эксперимент использует локальный transport без OAuth/HTTP MCP, но установленный tree всё равно исправлен. Это scoped npm audit, не полный security certification.

Это local prototype для конкретной задачи просмотра источников. Поддержка MCP Apps production Codex host не установлена; внедрение в Control Center и service lifecycle не выполнялось. Для будущей интеграции выбирать подтверждённый принимающий host, сохраняя текущий web UI до доказанного преимущества.

## SDK pilots и оставшиеся границы

| Компонент | Реально проверено | Следующий gate |
| --- | --- | --- |
| OpenAI Agents JS 0.21.0 | Offline parallel pairs/approve/reject плюс live gpt-5.6-terra: tool call, approval pause, serialize/restore, полный call/result и верный Outcome; тот же Outcome у direct Responses loop. | Более широкий contract-specific quality/recovery набор перед production executor. |
| Claude Agent TS 0.3.306 | Настоящие SDK custom tools, MCP initialize/list/call, private-domain schema deny до handler. | API authorization и проверка настоящего agent loop/runtime. |
| Codex App Server | Реальные model turns, interrupt/cold resume, policy/model readback, idempotent fixture. | Отдельные contract-specific permissions и external effects; cancelled tool audit остаётся обязательным. |
| DeepSeek Harness | Source/version/SAFETY review и переносимые lifecycle правила сохранены. | Конкретный adapter и изолированный lifecycle Trial; не production migration. |

Первый path-only Python probe ошибочно интерпретировали как проверку credential readiness: он намеренно не загружает API secrets. Через штатный Node runtime loader найден настроенный OpenAI API key; Anthropic key отсутствует. OpenAI key использован только в памяти host процесса; проверено его отсутствие в serialized SDK state. Новые credentials не создавались. Native Codex authorization отдельно от API key.

Live comparison использовал одну synthetic задачу и одну модель gpt-5.6-terra, reasoning none, max output 128 на request, max 3 round trips, без автоматических retries и tracing exports. Direct Responses loop: 453 input +36 output tokens, 3575 ms; Agents SDK: 451 input +35 output, 2353 ms, включая approval pause и restore. Оба выполнили один typed tool call и вернули value 7/source fixture-alpha. Это по одному sample, без вывода о превосходстве SDK по latency или стоимости. По [Standard reference pricing](https://developers.openai.com/api/docs/pricing) $2/M input и $12/M output: около $0.001338 и $0.001322 соответственно, всего $0.002660; это estimate без billing adjustments. Claude [официально требует допустимую API authorization](https://code.claude.com/docs/en/agent-sdk/overview); стороннее использование claude.ai login нельзя предполагать разрешённым. Общие темы и refs полезны фабрике; complete provider adoption без live gates не заявляется.

## Финальные проверки

Full self-test: **pass, 879/879 unit tests**, 0 failed/skipped/cancelled; self-test regressions и warnings 0. Quality profile включает strict privacy, Markdown integrity, rebuild и smoke. Embeddings restored. Runtime/root audit и queue health pass. Strict Control Center health: 5 страниц, включая /codex, и 13 JavaScript chunks pass; production release проверен без lifecycle mutations.

После обновлений corpus и rebuild FTS сохранил 45/48 @5, 46/48 @10, holdout 23/24 @5, leaks/regressions 0. Заключительная content consistency после записи результатов и SDK reruns — **pass**: 45/48 @5, 46/48 @10, holdout 23/24 @5; implementation/fixture hashes совпадают с locked candidate. У индекса нет missing non-template embeddings или orphan embeddings. Повторные OpenAI/Claude offline SDK checks pass; npm audit patched tree — 0 findings. Whole FTS CLI startup/index/output: 413–422 ms в трёх samples, median 418 ms. После полного suite добавлялись только explicit live experiment и документация.

Good State Alignment: aligned с принятыми baselines 2026-07-02 и 2026-08-28. Runtime manager, native history, голос/музыка, instance isolation, protected verifier и отдельные approvals сохранены. У внешних docs/advisories без явных published/updated дат эти даты остаются unknown; observed package versions, primary links и дата проверки фиксируют temporal context. Raw outputs, native thread IDs и browser evidence остаются в private instance state. Git/tag acceptance baseline требует отдельного принятия пользователем.
