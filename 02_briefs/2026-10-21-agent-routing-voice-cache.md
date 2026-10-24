---
id: 2026-10-21-agent-routing-voice-cache
type: brief
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [agent-voice, routing, prompt-caching, cost, intent]
tools: [GPT-Live, Decisions API, Responses API]
agent_platforms: [Pritha, Codex, OpenAI, Anthropic, Google, DeepSeek, LangChain, Microsoft]
model_context: [version-bound; no provider performance claim adopted]
runtime_environment: [local research, API, CLI, browser]
config_surfaces: [agent-contract, agent-outcome-spec, memory, tools, permissions]
portability: adapter-needed
sources:
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
  - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
related:
  workflows:
    - 07_workflows/2026-10-21-pritha-agent-knowledge-enrichment-plan.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: brief
  id: 2026-10-21-agent-routing-voice-cache
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2026-09-10 to 2026-10-21
source_updated: unknown
source_version: pinned October 2026 corpus; per-source dates and commits in repository deep review
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: reviewed source versions; runtime adoption requires contract-specific evidence
temporal_status: version-bound
---

# Маршрутизация голос и стоимость контекста

Routing полезен для одного ограниченного выбора с измеримой ценой ошибки. Детерминированный код предпочтителен для schema, permissions, ranges и idempotency; малая модель остаётся вероятностным classifier.

## Существующий голос Pritha

GPT-Live уже внедрён в Pritha: live-session.ts использует gpt-live-1 и Responses delegation. Сентябрьский migration review подтверждает этот этап. Октябрьский Decisions backend — отдельный вариант эксперимента, а не первая миграция голоса.

[Native Live Decisions](https://developers.openai.com/api/docs/guides/decisions-voice) позволяет менять вопросы session.update, но delegation type фиксируется при создании session. Нужно дождаться соответствующего session.updated и связывать результаты с delegation_id. Смена Responses на Decisions не сводится к добавлению поля.

Для task class «открыть раздел интерфейса» проверить final и partial speech, correction, none/fallback, session replacement и late result. Отдельные intent revisions и host readback предотвращают выполнение устаревшего выбора. Модель routing не добавляет разрешения на запись, service, deployment или secrets.

## Prompt caching

[Официальная документация](https://developers.openai.com/api/docs/guides/prompt-caching), проверенная 21 октября, для GPT-5.6 и более новых моделей описывает write **1.25×** для 30m и **2.5×** для Responses 12h. Cached reads обычно 0.1×, для GPT-6.1 Sol 0.05× ordinary input. Конкретный model/endpoint необходимо проверить перед применением.

Input cost в единицах normal input price:
plain + reads × read_rate + writes_30m × 1.25 + writes_12h × 2.5.
plain = input_tokens − cached_tokens − cache_write_tokens.
Сумма ttl_30m_tokens и ttl_12h_tokens равна cache_write_tokens; повторно прибавлять общий write count нельзя. Upgrade 30m → 12h является новой записью без кредита за прежний write.

Для постоянного prefix из P токенов, одной записи 12h и r reads с rate c, экономия против r+1 обычных вводов требует 2.5 + r×c < r+1, то есть r > 1.5/(1−c). При c=0.1 нужны как минимум **2 reads**; это арифметическая модель, не обещание cache hit или latency.

## Решение для Pritha

**adopt** accounting и intent/correction Trials в review checklist; **watch** переключение backend и live cache pilot. Нет измеренного task-class workload, где дополнительный classifier улучшает нынешний путь. Эксперимент без одинакового Outcome, false-route ceiling и fallback был бы расходом без критерия успеха.

E5/E6 закрываются как отложенные provider pilots; существующие local Live tests проверяются сейчас. Новые платные API calls не нужны для проверки формулы и текущих invariants. Реальные cache hits/latency, voice naturalness и false-route rate остаются unmeasured, без заявления о production readiness.
