---
id: 2026-09-06-synthetic-cli-demo
type: marketing-copy
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [pritha, agents-mother, readiness, verification]
tools: [Pritha, Codex, Node.js, Git]
sources:
  - tests/agents-mother-cli-readiness.test.mjs
  - docs/getting-started.ru.md
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-roadmap-completion-tracker.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-06
source_updated: 2026-09-06
source_version: roadmap completion candidate based on 8a26775
retrieved: 2026-09-06
verified: 2026-09-06
valid_for: preparation for manual mother CLI pilots
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: workflow
  id: 2026-09-06-synthetic-cli-demo
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Синтетическая демонстрация CLI

Сценарий: CLI складывает два конечных числа, печатает JSON, возвращает exit 64
при неверном вводе. Демонстрация доступна как
`node --test tests/agents-mother-cli-readiness.test.mjs` из checkout Pritha.

Проверяемый путь: accepted synthetic contract → curated research fixture →
scaffold без overrides → отдельная Outcome approval → host verifier с hash →
deterministic build fixture → Trials → fast-forward → synthetic acceptance →
authored handoff. Временные project/state удаляются после теста.

Это технический пример механики, не запись реального клиента и не benchmark
модели. Публичный материал не содержит private history, пользовательских
идентификаторов, endpoints или credentials. Инструкция не обещает универсальный
срок создания агента, стоимость или поддержку ещё не реализованных adapters.
