---
id: 2026-10-21-agent-building-repository-shortlist
type: review
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [agent-building-knowledge, github-research, repository-review, agent-harness, agent-evals, agent-interface]
tools: [GitHub, Pritha, Codex, OpenAI Agents SDK, Claude Agent SDK, MCP Apps, DeepSeek Harness, LangChain, Microsoft Agent Framework]
agent_platforms: [Codex, Claude, MCP Apps, DeepSeek Harness, LangChain, Google, Microsoft]
model_context: [runtime-specific; model quality not evaluated]
runtime_environment: [GitHub research, CLI, SDK, API, embedded chat UI]
config_surfaces: [AGENTS.md, SDK options, profiles, plugins, MCP resources, permissions]
portability: adapter-needed
sources:
  - https://github.com/openai/codex
  - https://github.com/openai/openai-agents-python
  - https://github.com/openai/openai-agents-js
  - https://github.com/anthropics/claude-agent-sdk-python
  - https://github.com/anthropics/claude-agent-sdk-typescript
  - https://github.com/modelcontextprotocol/ext-apps
  - https://github.com/deepseek-ai/deepseek-harness
  - https://github.com/langchain-ai/deepagents
  - https://github.com/google/agents-cli
  - https://github.com/microsoft/agent-framework
related:
  workflows:
    - 07_workflows/2026-10-21-pritha-agent-knowledge-enrichment-plan.md
    - 07_workflows/agents-mother.md
  reviews:
    - 03_reviews/2026-10-21-agent-stack-repository-assessment.md
    - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
    - 01_sources/registries/github-agent-building-repos.md
  templates:
    - 08_templates/github-source-registry-entry.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, governance]
subject:
  kind: pritha
  id: agent-building-repository-shortlist
privacy: public
retention: durable
review_status: reviewed
confidence: medium
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: identity snapshot plus 10 exact release pins in linked deep review; not code-adoption authorization
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: reviewed reference catalog; current contract-specific evidence required before adoption
temporal_status: version-bound
---

# Каталог кандидатов: GitHub-источники для будущих агентов

Дата: 21 октября 2026 года. Записи прошли отдельный curated review и добавлены в canonical registry как **accepted-for-review**.

## Что проверено сейчас

GitHub API подтвердил exact canonical identity каждого репозитория,
публичную видимость, default branch и отсутствие archived-флага. Это
проверка ссылок и метаданных. Она не подтверждает качество, безопасность,
работоспособность, право заимствовать произвольный модуль или готовность
репозитория к конкретному agent-contract.

Содержательный [deep review](2026-10-21-agent-repository-deep-review.md) закрепил release commits/tree SHAs всех десяти repositories и проверил 28 source/test/spec/license files. Результаты и ограничения находятся там; исходная таблица ниже сохраняет identity snapshot. Registry promotion не разрешает install, execution или code adoption.

## Начальный список

Роль и сценарий в таблице — исследовательские назначения для Pritha.
Поле `pushed_at` показывает метаданные GitHub, а не дату проверенной версии.

| Repository | Contract scopes | Сценарий будущего агента / вопрос исследования | Default branch | Последний push, UTC | License из API, advisory |
| --- | --- | --- | --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | agent-harness; agent-evals; agent-operations | Codex-native coding worker, App Server, SDK, permissions, Goal и resume. | main | 2026-10-21 07:33:30 | Apache-2.0 |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | agent-harness; agent-evals | Python API agent с собственными tools, loop, handoffs и state. | main | 2026-10-20 05:01:33 | MIT |
| [openai/openai-agents-js](https://github.com/openai/openai-agents-js) | agent-harness; agent-voice; agent-evals | TypeScript API/voice agent; сопоставление orchestration и realtime surfaces. | main | 2026-10-21 01:17:54 | MIT |
| [anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) | agent-harness; agent-evals | Python Claude executor; sessions, history completeness, tools и usage. | main | 2026-10-21 04:44:35 | MIT |
| [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) | agent-harness; agent-evals | TypeScript Claude executor с host-owned approvals и внешними Trials. | main | 2026-10-21 03:17:06 | unknown |
| [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) | agent-interface; mcp-tools | Встраиваемый memory explorer или другой UI при подтвержденном host support. | main | 2026-09-25 15:59:03 | NOASSERTION |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | agent-harness; agent-interface; agent-operations | Изучение scoped plugin lifecycle, profiles и session events. | master | 2026-10-17 08:16:09 | MIT |
| [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | agent-harness; agent-memory; agent-evals | Сравнение model-independent harness, context/memory и bounded delegation. | main | 2026-10-21 08:43:56 | MIT |
| [google/agents-cli](https://github.com/google/agents-cli) | agent-evals; agent-skills; agent-operations | Найти и проверить инструменты eval/diagnostics, включая соответствие AQuA reference. | main | 2026-10-20 13:03:52 | Apache-2.0 |
| [microsoft/agent-framework](https://github.com/microsoft/agent-framework) | agent-harness; agent-interface; agent-operations | Сравнить checkpoint/resume и UI/state contracts на Python/.NET. | main | 2026-10-21 01:02:40 | MIT |

## Уточнения к license metadata

Public repository не означает одинаковую лицензию всех файлов, SDK,
встроенного runtime и внешнего сервиса. `unknown` и `NOASSERTION` не являются
разрешением заимствовать код.

- Для MCP Apps ранее прочитанный LICENSE описывает несколько применимых
  режимов в процессе перехода лицензирования; проверять scope на exact pin.
- Для Claude SDK TypeScript ранее прочитанный README отсылает использование
  SDK к Commercial Terms с исключениями для отдельно лицензированных частей.
- MIT в metadata Python SDK не устанавливает условия использования
  упакованного Claude runtime, API и аккаунта.
- Для любого `selected-module` нужна module-local license evidence на том же
  pin, согласно действующему agent-contract gate; root/API metadata недостаточно.

## Карточка, которую подготовим для каждого кандидата

1. Каноническая identity, maintainer, назначение и границы применения.
2. Проверенный release и immutable commit; при чтении поддерева — tree SHA.
3. Архитектурные паттерны, конкретные APIs, примеры и ограничения.
4. Связанные source/test paths на том же pin; что подтверждают тесты и чего
   не подтверждают без воспроизведения.
5. Install hooks, зависимости, сеть, процессы, credentials, tracing/retention.
6. Применимые лицензии и нерешенные условия использования.
7. Сопоставление с Pritha и минимум одна альтернатива, включая текущий путь.
8. `adopt / experiment / watch / skip` как fit-рекомендация, отдельно от
   registry state и разрешения исполнения.
9. Подходящий contract pattern, необходимые scopes, non-goals и Trial.
10. Дата и причина повторной проверки; явные unresolved questions.

## Связь с существующим registry

Канонический каталог для CLI research уже существует:
`01_sources/registries/github-agent-building-repos.md`.

После содержательного review все десять записей добавлены отдельным curated изменением с сохранением девяти колонок и уникальных canonical URLs. Pin и deep-review reference указаны в каждой строке. `accepted-for-review` не является правом исполнения.

Этот каталог остаётся human-readable review; runtime registry единственный. Перед новым contract research следует проверить свежесть нужного pin и scenario fit.

## Использование для нового child agent

1. Сначала accepted contract и релевантные scopes, затем registry-first
   research; не подбирать контракт под понравившийся репозиторий.
2. Обычный shortlist — до пяти, hard limit — десять уникальных репозиториев
   в одном research run/shortlist; выбранные references входят в тот же limit.
3. Для `reference-only` нужна current evidence на каждый exact canonical repo.
4. Для `selected-module` v1 допустима ровно одна публичная repository и одна
   directory module с полным набором pin/tree/license/security/eval/approval
   evidence. Более широкий adoption не маскируется разбиением на партии.
5. Live research и contract-specific evidence хранятся в instance-local
   agent memory. В общую память продвигаются только curated выводы.
