---
id: 2026-10-21-mcp-apps-memory-explorer
type: brief
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [mcp-tools, agent-interface, mcp-apps, privacy, fallback]
tools: [MCP Apps, AppBridge]
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
  id: 2026-10-21-mcp-apps-memory-explorer
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

# MCP Apps для просмотра памяти агента

MCP Apps полезен, когда результат tool call должен содержать интерактивный View внутри поддерживающего host: фильтры, таблицу, drill-down и выбор источника. Для обычной страницы Control Center достаточно текущего web UI.

## Подтверждённый протокол

В ext-apps **2.0.3**, spec **2026-01-26**, server связывает tool с ui:// resource и HTML content type text/html;profile=mcp-app. Host и server явно согласуют extension capabilities. Host помещает UI в sandboxed iframe и посредничает в JSON-RPC; View не получает credentials процесса.

[Spec](https://github.com/modelcontextprotocol/ext-apps/blob/82221c0c8ce7661efa6771c9d461511b1650495f/specification/2026-01-26/apps.mdx) определяет CSP, origin и permission negotiation. Пустой/отсутствующий connectDomains не разрешает внешние соединения. AppBridge поддерживает forwarding tools/call; security policy и ограничения tools обязан обеспечить host. Visibility metadata не заменяет authorization.

Release 2.0.3 содержит dependency fixes examples и не меняет library. License переходная: MIT/Apache-2.0 по компонентам, non-spec documentation CC-BY-4.0. Root metadata NOASSERTION не даёт права копировать произвольный module.

## Сценарий одного будущего View

Read-only memory explorer принимает query, выбранный public domain и limit. Возвращает document status, heading, короткую выжимку и путь к curated evidence. Draft, planned и historical видны как статусы. Private user model и sibling instances исключаются на стороне host до выдачи.

View может только менять query/filters и читать разрешённые источники. Rebuild, запись памяти, файловые paths от View, arbitrary tools/call и получение secrets запрещаются host allowlist. Для host без extension negotiation tool возвращает тот же смысловой результат обычным текстом.

## Решение для Pritha

**experiment / locally verified**: 21 октября выполнен read-only memory View в отдельном loopback host 0.1 с настоящими ext-apps 2.0.3 App/AppBridge и MCP client/server/core 2.3.1. Это конкретный browser prototype для поиска и чтения источников. Он не устанавливает поддержку MCP Apps внутри текущего production Codex или Control Center.

Server capability negotiation, ui:// resource MIME, текстовый fallback, host tool allowlist и schema deny проверены. Browser Trial проверяет поиск, чтение раздела, смену domain, teardown/reload, запреты rebuild/user-model/network. Пустые CSP domains реализованы запретом connect-src; iframe получает только allow-scripts. Source content выводится textContent. Смена query/domain очищает старый source и использует intent revision.

Первый npm audit для MCP SDK 2.0.0 выявил high advisories. В изолированном workspace зависимости обновлены до совместимых 2.3.1; повторный audit — 0 findings. ext-apps package pin и протокольная spec date не заменяют аудит всей установленной dependency tree.

Production recommendation остаётся **watch** до выбора реального принимающего host и review его lifecycle/permissions. Pilot воспроизводится из `scripts/experiments/agent-pilots/`, private outputs хранятся в instance state. Итоги и ограничения: `03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md`.
