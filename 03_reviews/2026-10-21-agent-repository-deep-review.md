---
id: 2026-10-21-agent-repository-deep-review
type: review
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [agent-building-knowledge, github-repository-review, sdk, mcp-apps, harness, evidence-verification]
tools: [GitHub, Codex, OpenAI Agents SDK, Claude Agent SDK, MCP Apps, DeepSeek Harness, Deep Agents, Microsoft Agent Framework]
agent_platforms: [Pritha, Codex, Claude, DeepSeek, LangChain, Google, Microsoft]
model_context: [no external model run]
runtime_environment: [local CLI, repository research, documentation]
config_surfaces: [runtime schema, permissions, session store, plugins, agent-contract]
portability: adapter-needed
sources:
  - 03_reviews/2026-10-21-agent-repository-evidence.json
  - 03_reviews/2026-10-21-agent-stack-repository-assessment.md
  - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
related:
  reviews:
    - 03_reviews/2026-10-21-agent-building-repository-shortlist.md
    - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
  decisions:
    - 05_decisions/2026-10-21-curated-retrieval-promotion.md
  workflows:
    - 07_workflows/2026-10-21-pritha-agent-knowledge-enrichment-plan.md
    - 07_workflows/agent-failure-to-trial.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: review
  id: agent-repository-research
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2026-09-25 to 2026-10-21
source_updated: unknown
source_version: 10 exact release commits and tree SHAs in evidence manifest
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: reference-only architecture research; not module adoption
temporal_status: version-bound
---

# Проверка репозиториев агентных систем

Десять публичных репозиториев проверены на exact release commits. Их полезный результат для Pritha — выбор минимального backend, completeness/recovery Trials и правила UI/plugin boundaries. Добавление второго общего runtime или managed provider сейчас не подтверждено задачей.

Этот обзор фиксирует чтение pinned источников и первоначальные probes. Последующие native Codex, MCP Apps browser и SDK pilots, а также принятый curated FTS v2 описаны в [verification review](2026-10-21-pritha-retrieval-and-runtime-verification.md). Они уточняют текущий Pritha fit ниже, сохраняя исходные результаты и ограничения source review.

## Версии первоисточников

| Repository | Release | Published UTC | Exact commit |
| --- | --- | --- | --- |
| [anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) | v0.2.170 | 2026-10-21 | [dd27b703647a](https://github.com/anthropics/claude-agent-sdk-python/tree/dd27b703647a4f8989ab656f00c85f98090a60fd) |
| [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) | v0.3.306 | 2026-10-21 | [9c59e061a0e4](https://github.com/anthropics/claude-agent-sdk-typescript/tree/9c59e061a0e49a4a99012218de66915bd407c96d) |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | dsh-v0.2.1-rc.2 | 2026-10-17 | [687f282e8625](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317) |
| [google/agents-cli](https://github.com/google/agents-cli) | v1.11.0 | 2026-10-20 | [bea5875e38af](https://github.com/google/agents-cli/tree/bea5875e38afd84c5513ff14a9bc739286efe533) |
| [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | deepagents==0.7.29 | 2026-10-20 | [3abfb0abcda6](https://github.com/langchain-ai/deepagents/tree/3abfb0abcda658d4b64e74782f3316a11efc3faa) |
| [microsoft/agent-framework](https://github.com/microsoft/agent-framework) | python-1.22.0 | 2026-10-15 | [14229b083a7e](https://github.com/microsoft/agent-framework/tree/14229b083a7ef95eeaadf472e1da0367a9f46457) |
| [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) | v2.0.3 | 2026-09-25 | [82221c0c8ce7](https://github.com/modelcontextprotocol/ext-apps/tree/82221c0c8ce7661efa6771c9d461511b1650495f) |
| [openai/codex](https://github.com/openai/codex) | rust-v0.163.0 | 2026-10-15 | [83086188ae06](https://github.com/openai/codex/tree/83086188ae0614bd882818ff1aa23f3194962012) |
| [openai/openai-agents-js](https://github.com/openai/openai-agents-js) | @openai/agents@0.21.0 | 2026-10-20 | [304e436185ad](https://github.com/openai/openai-agents-js/tree/304e436185ad5d7e54d240896efa728533147cf3) |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | v0.24.0 | 2026-10-15 | [17d994bd3045](https://github.com/openai/openai-agents-python/tree/17d994bd3045dae71acda676a4ef4762ed8ecd94) |

Проверено 21 октября 2026. Для каждого pin GitHub подтвердил tree SHA. Metadata текущего HEAD использовалась только для public/non-archived identity и advisory license/stars. Retrieval date не подменяет release date. Sources temporal-compatible с текущим research; этот статус не авторизует scaffold.

[Evidence manifest](2026-10-21-agent-repository-evidence.json) сохраняет 28 прочитанных source/test/spec/license files, Git blob SHA и SHA-256; у всех 28 вычисленный Git blob совпал с возвращённым GitHub SHA. Полные external payloads остаются transient. Это проверка идентичности, не security audit.

## Содержательный review

### Codex CLI и App Server

Изучен app-server README на stable 0.163.0; runtime schema получена из локального standalone 0.153.0. Разделение необходимо: новая release note не доказывает capability установленного binary. Latest prerelease 0.164.0-alpha.8 не является stable.

В изолированном локальном probe прошли initialize, thread/start, paused Goal set/get/clear, thread/read и unsubscribe. Goal budget 1000 и zero usage подтверждены readback; model turns 0. Schema содержит turn/steer, turn/interrupt, approvals, token usage и command/exec. Полная model session, реальная отмена nested tools и history after model turn этим probe не воспроизводились; существующие Pritha mocked tests проверяют контролируемые ветви.

[App Server docs](https://learn.chatgpt.com/docs/app-server) описывают stdio, schema generation, history и approvals; WebSocket остаётся experimental. Current rich-client рекомендация уточняет устаревший Codex-as-MCP подход.

### OpenAI Agents SDK Python и JS

На Python 0.24.0 прочитаны approvals.py и deferred-session compaction tests. Подтверждено отложенное compaction для approval response pairs и bookkeeping settled batch; простое «сохранить последний ответ» недостаточно.

На JS 0.21.0 прочитаны toolResultCorrelation.ts, соответствующие tests и modelRetry.ts. Correlation включает тип результата и call ID, поддерживает hosted MCP approvals. Retry различает replay safety и учитывает известный usage неудачных попыток. SDK policy не заменяет host authorization внешних действий.

Для небольшого API-сервиса API client остаётся допустимым минимальным вариантом. Полный SDK выбирается ради нужного loop/session/handoff, а не по самому факту обращения к модели.

### Claude Agent SDK Python и TypeScript

Python 0.2.170 e2e-test сверяет live call/result ID sets с обоими способами чтения session. Это релизное исправление потери ветвей параллельных tool calls. session_resume.py материализует external-store transcript в temporary CLI configuration и требует cleanup.

TypeScript 0.3.306 public repository предоставляет example SessionStore conformance suite; его 13 behavioural checks включают порядок append, отсутствие unknown key и изоляцию project/subpath. Это example corpus, а не полный review внутреннего runtime.

[LICENSE.md](https://github.com/anthropics/claude-agent-sdk-typescript/blob/9c59e061a0e49a4a99012218de66915bd407c96d/LICENSE.md) указывает Commercial Terms. GitHub MIT Python wrapper не является лицензией Claude Code binary, API или всех bundled components.

### MCP Apps

Изучены spec 2026-01-26, AppBridge и tests на 2.0.3. Negotiation, sandboxed iframe, CSP и host-mediated messages имеют конкретные protocol contracts. AppBridge automatic forwarding tools/call само по себе не задаёт read-only allowlist; это обязанность host.

Read-only memory explorer выбран как сценарий View. На этапе source review целевой host ещё не был подтверждён; позднее отдельный локальный App/AppBridge host прошёл 11 browser checks, как записано в verification review. Production host не развёрнут. Text fallback и одинаковые server-side domain filters обязательны. Release 2.0.3 меняет dependencies examples; его нельзя описывать как новую библиотечную capability.

### DeepSeek Harness

Прочитаны architecture, Cordis primer, SAFETY, tools docs, tools implementation/schema и package manifest. У tools есть canonical output contract, отдельная projection, host-only execution metadata и cooperative cancellation. Ресурсы и listeners должны принадлежать scope и иметь disposer; timeout не hard-kill same-process code.

SAFETY определяет developer preview без audit. Package-local manifest tools указывает MIT, но peer graph велик: чтение directory не означает автономный безопасный module. Code adoption здесь не запрашивался и не выполнялся.

### Deep Agents

CompositeBackend и tests на 0.7.29 проверяют longest-prefix route и boundary, включая routes без trailing slash. Это полезно для public/private storage separation как дополнительный логический уровень; backend prefix не является sandbox.

OSS package 0.7.29 и Managed Deep Agents v0.9 — разные release surfaces. Их state/operations claims не переносятся друг на друга.

### Google agents-cli и AQuA

На 1.11.0 прочитан eval response_quality.py. Он вызывает model grader с rubric и JSON schema. Temperature 0 не делает judge детерминированным и не заменяет calibration.

[Публикация AQuA от 8 октября](https://developers.googleblog.com/en/the-outer-loop-insights-first-an-ambient-quality-agent-that-diagnoses-your-production-agent/) описывает sample, review, cluster, separate verification и track, затем root cause на deploy-time source snapshot. Она поддерживает ручной процесс Pritha «сбой → evidence → причина → Trial». Прочитанный eval scaffold не является доказательством полноты AQuA code path; готовый AQuA adapter не включается.

### Microsoft Agent Framework

Изучены release 1.22.0 и checkpoint source: graph signature, format version, state storage и restricted decoding. Release предупреждает о новых hosted/merge_mode records: старые workers не читают такой state. Возможность прочесть старый state новой версией не означает обратимую rolling migration.

## Синтез с памятью Pritha

| Тема | Отношение к существующей памяти | Pritha fit | Результат |
| --- | --- | --- | --- |
| K1 Codex | refines текущий App Server; supersedes только historical MCP transport advice | adopt checks | Runtime/schema probe и backend brief. |
| K2 SDK | confirms minimal modules; refines state ownership | adopt knowledge; production executor watch | Offline conformance и один OpenAI live comparison пройдены; Claude live loop ожидает API authorization. |
| K3 MCP Apps | refines interface standard | local pilot verified; production integration watch | Read-only View на отдельном App/AppBridge host, 11 browser checks; production host не развёрнут. |
| K4 Harness | confirms modular architecture; refines lifecycle | adopt knowledge, skip wholesale migration | Scope/disposer/grants rules. |
| K5 Quality | confirms protected Trials; refines manual incident intake | adopt | Failure-to-Trial workflow/template. |
| K6 Retrieval | refines current MiniLM/FTS | adopt curated FTS v2 для agent-building research | Исторический filename proxy v1 не прошёл gate; последующий 60-case content eval пройден, решение о scoped promotion принято. |
| K7 Routing | confirms cheapest adequate deterministic layer | watch provider pilot | One task-class criteria. |
| K8 Voice | confirms Live already implemented | watch Decisions switch | Intent, correction и late-result criteria. |
| K9 Cache | refines cost accounting | adopt knowledge, watch live tuning | Write/read/TTL formula, no fabricated savings. |
| K10 Durable execution | confirms ledger/reconcile | watch managed provider | Migration/recovery checklist. |

## Registry promotion и применение

Все десять entries проходят отдельную curated promotion в существующий registry как **accepted-for-review**, с pin и ограничениями. Это advisory reference eligibility; discovery не менял registry автоматически. Новый каталог не создаёт второго источника истины.

Для factory research shortlist по-прежнему ограничен десятью уникальными repo за запуск. Reference-only topic evidence должен соответствовать каждому canonical repo контракта. Selected-module требует одного публичного directory module, exact pin/tree, module-local LICENSE или manifest с blob/SHA-256/SPDX, security/permissions review, current external evidence, locked synthesis и explicit approval. Этот обзор не создаёт contract-specific evidence и не даёт machine recommendation proceed.

## Экспертные выводы

Architecture: сохранять одного владельца каждого state layer. Security: host permission checks не выгружаются вместе с plugin и не выводятся из UI visibility. DX: API client, SDK и coding runtime имеют разные installation/support costs. Product: каждый новый adapter требует одинакового Outcome и сравнительных Trials. Evidence: source-inspected, local reproduced, model-tested и user-accepted фиксируются отдельно. Standards: reusable verified practices входят в workflows, незапущенные provider pilots остаются watch.
