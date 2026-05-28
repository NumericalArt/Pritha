---
id: 2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment
type: assessment
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [openclaw, hermes, codex-cli, ai-agents, user-experience, non-professional-users, agent-memory, llm-wiki, telegram-agents, business-agents]
tools: [openclaw, hermes, codex, obsidian, telegram, crm, youtube]
sources:
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
  - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  - 01_sources/raw/youtube-L-HAzfFWSto/L-HAzfFWSto-whisper-small.md
  - https://www.youtube.com/watch?v=L-HAzfFWSto
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://github.com/NousResearch/hermes-agent
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
  - https://github.com/openai/codex
  - https://openai.com/index/introducing-the-codex-app/
  - https://arxiv.org/abs/2603.07670
related:
  briefs:
    - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  notes:
    - 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
  signals:
    - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  workflows:
    - 07_workflows/telegram-intake-bot.md
    - 07_workflows/media-intake-processing.md
    - 07_workflows/llm-wiki-layer.md
recommendation: review
---

# Assessment: advanced-user comparison of OpenClaw, Hermes and Codex CLI

Date: 2026-05-17
Status: draft
Recommendation: review

## One-paragraph read

Материал стоит сохранить и использовать как практический UX-сигнал. Он не доказывает, что Hermes лучше OpenClaw или Codex CLI лучше всех, но хорошо формулирует проблему выбора агентской среды глазами человека, который хочет результат, а не инженерную красоту: стабильность, понятная память, Telegram/CRM interface, низкий context overhead and long-task execution matter more than personality and feature count.

## Why it matters

- Techscope будет собирать данные о разных agent runtimes, а не только о Codex.
- Для будущих агентов нам нужны правила, которые учитывают разные среды: Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI and others.
- Не-профессиональные и semi-professional мнения полезны для дизайна UX, onboarding and default workflows.
- Такие мнения нельзя смешивать с primary technical evidence; их нужно хранить с явным `evidence_class`.

## Technical claims

- Memory quality is not just retrieval; it is write policy, schema, indexing, logging, linting and selective read budget.
- Agent shell complexity directly affects token cost and failure modes.
- Transparent skills/tools are valuable because users can see whether an agent is doing relevant work.
- Business-facing agents need intermediary bots and limited surfaces, not raw terminal instructions.
- Generated wiki memory should be compiled and maintained, but standards/decisions must still cite source artifacts.

## Programming relevance

Score: 4/5

Relevant for coding-agent selection, local workflows, CLI wrappers, skill portability and long-running task harnesses.

## Agent engineering relevance

Score: 5/5

Directly relevant to memory, subagents, runtime selection, Telegram control planes, business assistant design and evidence handling.

## DX impact

Score: 5/5

Strong signal for non-coder ergonomics: hide machinery, provide concise results, make repair paths understandable, and avoid context bloat.

## Evidence quality

Score: 3/5

Good lived-experience evidence; weak as technical proof. Supported directionally by primary sources on LLM Wiki, Hermes and Codex, but product-specific claims need deeper verification.

## Practicality

Score: 4/5

Immediately useful for Techscope rubric and future reviews. No new infrastructure required.

## Leverage

Score: 4/5

Reusable across future agent projects because it separates operator experience from runtime internals.

## Risk

Score: 3/5

Risks: overfitting to one user's setup, promotional ecosystem noise, unclear OpenClaw identity, security/privacy risks in Telegram/CRM integrations and automatic memory writes.

## Expert lenses

### Architecture

Use a layered model: source artifacts, refined signals, wiki synthesis, runtime-specific agent harnesses. Keep runtimes interchangeable where possible, but do not pretend their memory/tool/plugin semantics are identical.

### Security

Telegram control, CRM access and self-improving skills require allowlists, scoped credentials, logs, human approval for destructive actions and memory linting. Do not accept "works for me" as safety evidence.

### Developer Experience

For coders, Codex CLI/app remains the primary Techscope environment. For non-coders, wrap the runtime behind Telegram/web UI and return concise, meaningful status messages.

### Product Pragmatist

Adopt the rubric now; defer actual runtime migration experiments until a concrete use case needs Hermes/OpenClaw. Keep our current Codex-centered harness as the baseline.

### Research Scout

Track dates and versions. Compare this source against official docs and community reports from the same time window because agent ecosystems change very quickly.

### Standards Editor

Candidate standard later: `agent-shell-evaluation.md`. Not enough evidence yet for a standard; first gather at least 3-5 dated sources per runtime and one local experiment.

## Recommendation

Promote the refined signal and brief into searchable memory. Use this material as one input for a broader review: `agent-shell-selection-for-non-coder-workflows`.

Do not update `04_standards/` yet.

## Next artifact

review
