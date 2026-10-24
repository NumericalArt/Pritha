---
id: 2026-10-21-agent-harness-patterns
type: brief
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [agent-harness, plugins, lifecycle, context, permissions]
tools: [DeepSeek Harness, Deep Agents, Cordis]
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
  id: 2026-10-21-agent-harness-patterns
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

# Переносимые паттерны DeepSeek Harness и Deep Agents

Из этих harness полезны явные владельцы состояния, scopes и lifecycle ресурсов. Полная замена текущего Pritha harness не обоснована: она затронет approvals, native history, приватность и управление рабочими сервисами.

## DeepSeek Harness

Официальный repository deepseek-ai/deepseek-harness проверен на **dsh-v0.2.1-rc.2**, commit **687f282e8625c6b8d11ff58211a90524be2e4317**, 17 октября 2026. Это developer preview без security audit; [SAFETY](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/SAFETY.md) прямо исключает использование как sole security boundary.

Cordis context предоставляет scoped services; inject описывает зависимости. ctx.effect и ctx.on дают обратимые регистрации. Unload должен снимать listeners, schemas, adapters и providers. Durable SessionEvent отделён от live agent events: запись факта и доставка уведомления имеют разные lifetimes.

Source tools pipeline отделяет canonical JSON output от model-facing projection и host-only execution fields. Cooperative cancellation не может принудительно остановить произвольный same-process plugin. timeout не доказывает остановку внешнего эффекта.

## Deep Agents

Проверен Python **0.7.29**, commit **3abfb0abcda658d4b64e74782f3316a11efc3faa**, 20 октября. Это версия OSS package; она не равна hosted Managed Deep Agents v0.9.

CompositeBackend маршрутизирует по самому длинному prefix и проверяет границу пути. /memories не должен захватывать /memories-other. Release устраняет проблему routes без trailing slash и текстовых edits бинарных файлов. Routing внутри backend не заменяет OS/filesystem isolation.

## Правила для будущего plugin

- Один owner у каждой регистрации; teardown идемпотентен.
- После unload старый listener не получает события; reload создаёт ровно одну регистрацию.
- In-flight вызов либо дожидается завершения, либо отменяется с проверкой итогового состояния.
- Grants принадлежат host и проверяются при каждом вызове; unload/reload не создаёт новые права.
- Обязательные approval, sandbox, verifier и privacy gates находятся вне выгружаемого plugin.
- Durable records версионируются отдельно от transient events.

**adopt** правила lifecycle в review/contract; **watch** E7 implementation. У Pritha нет общего hot reload plugin host, чей дефект нужно исправить. Fake plugin manager, написанный только ради демонстрации, не подтвердит lifecycle настоящего Cordis или Pritha. При появлении конкретного adapter выполнить изолированный load/unload/reload Trial без credentials. Полные harness сейчас **skip** для миграции; архитектурные references сохранены.
