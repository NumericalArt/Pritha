---
id: 2026-10-21-agent-recovery-boundaries
type: brief
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [agent-operations, durable-execution, checkpoint, recovery, idempotency]
tools: [Codex App Server, Microsoft Agent Framework, Agents API]
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
  id: 2026-10-21-agent-recovery-boundaries
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

# Состояние и восстановление длительной задачи агента

Checkpoint позволяет восстановить вычисление, но не гарантирует единственное выполнение внешнего действия. Между успешным API effect и локальной записью receipt возможен сбой: перед retry нужно проверить внешний результат или использовать поддерживаемый idempotency key.

## Границы владельцев

| Ресурс | Что фиксировать |
| --- | --- |
| Session/thread | История, approvals, model/runtime pin и retention. |
| Environment/sandbox | Filesystem, credentials, network, lifetime и cleanup. |
| Run/ledger | Intent revision, budgets, attempts, receipts, state transition и next action. |
| External effect | Effect ID, idempotency key, authoritative readback и ambiguous state. |

В Pritha уже есть delivery-ledger v2, receipts и recovery logic. Managed runtime добавил бы другого владельца deployment, sandbox, хранения и стоимости. Его выбирать только при измеренной проблеме доступности, продолжительности или эксплуатации.

## Версионная совместимость

Microsoft Agent Framework Python **1.22.0**, 15 октября 2026: новые serialized Content/stream records с hosted или merge_mode старые версии не читают. Нельзя смешивать old/new workers в affected store или откатываться после таких writes без изоляции/миграции. Plain session metadata и checkpoints без этих records не затронуты.

В [checkpoint source](https://github.com/microsoft/agent-framework/blob/14229b083a7ef95eeaadf472e1da0367a9f46457/python/packages/core/agent_framework/_workflows/_checkpoint.py) WorkflowCheckpoint имеет graph_signature_hash и format version. FileStorage поддерживает restricted deserialization, включая pickle-backed values. Не принимать произвольный untrusted checkpoint; формат и allowlist требуют отдельного review.

Claude external SessionStore восстанавливает transcript в temporary configuration directory для CLI; external storage не устраняет локальный runtime и cleanup. OpenAI managed Agents session, SDK session, Responses conversation и sandbox также являются разными ресурсами.

## Recovery Trial

Проверить crash до effect, после effect до receipt, после receipt до acknowledgement, retry с тем же key, resume с изменённой policy и старым state format. Неизвестный результат должен сохранять ambiguous status и блокировать слепой повтор. В budget входят все попытки, включая ошибочные.

**adopt** уточнения recovery review для будущих contracts; **watch** managed execution K10. Для самой Pritha замена работающего local control plane сейчас не обоснована. Это refines существующие trajectory/ledger правила, без migration или создания cloud resources.
