---
id: 2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [openclaw, hermes, codex-cli, ai-agents, user-experience, non-professional-users, agent-memory, llm-wiki, telegram-agents]
tools: [openclaw, hermes, codex, obsidian, telegram, youtube, mlx-whisper]
sources:
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
  intakes:
    - 00_inbox/links/2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake.md
  notes:
    - 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
  signals:
    - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  reviews:
    - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
  workflows:
    - 07_workflows/media-intake-processing.md
    - 07_workflows/llm-wiki-layer.md
---

# Brief: OpenClaw, Hermes and Codex CLI through advanced-user experience

Date: 2026-05-17
Source: https://www.youtube.com/watch?v=L-HAzfFWSto
Status: draft

## Summary

Видео полезно как UX-свидетельство продвинутого пользователя, который не является профессиональным разработчиком, но активно использует агентские системы. Его главный практический вывод: выбор агентской среды для реальной работы определяется не "самым умным" ответом, а стабильностью контура, управлением памятью, стоимостью контекста, прозрачностью tools/skills and recovery after restart.

Для Techscope это подтверждает уже выбранную архитектуру: входящие материалы должны превращаться не в сырые длинные контексты, а в source note, refined signal, brief/review and generated wiki layer. Для будущих агентов особенно важны thin interfaces for users and explicit harness rules for memory, tools, permissions and completion.

## Key claims

- Agent shells differ mainly by harness thickness: how much context, tools, persona and memory they inject before the model answers.
- Rich/personal shells can be pleasant for individual use, but may accumulate context and become costly or unstable under heavy customization.
- Hermes-like self-improving skill workflows are attractive for business/autonomous tasks, but the claim must be verified against official Hermes docs and observed behavior.
- Codex CLI-like setups are attractive for long coding/heavy local tasks because the runtime is leaner and source-controlled workflows are easier to inspect.
- For non-coders, a useful agent must accept ordinary requests through Telegram or another familiar UI and hide command-line repair work.
- File-backed Markdown wiki memory is a strong pattern, but generated wiki pages must not override curated source artifacts.

## Evidence

- Video source: ALEKSEI ULIANOV, published 2026-04-28, transcribed locally with `mlx-whisper`.
- Karpathy LLM Wiki gist, 2026-04-04, describes raw sources, generated wiki and schema as separate layers, with index/log operations.
- NousResearch `hermes-agent` repo describes skill learning, multi-provider support, gateways, memory/search and subagent delegation.
- Hermes Codex runtime docs say Codex app-server integration is opt-in and that some Hermes loop tools such as delegate_task/memory/session_search/todo are not available in stateless Codex runtime mode.
- OpenAI Codex repo/docs position Codex CLI as a local coding agent; OpenAI Codex app article frames app/CLI/IDE/cloud as related but distinct surfaces.
- arXiv memory survey frames agent memory as a write-manage-read loop and highlights privacy governance, contradiction handling and latency budgets.
- Community reports found during web check broadly match the "thin wrapper vs heavy shell" tension: some users prefer Codex as the core agent with a small messaging wrapper, while some Hermes/OpenClaw switchers report mixed results around setup, bloat and token usage.

## Risks and caveats

- The source is subjective and streamer-style. It is useful signal, not proof.
- Exact "OpenClaw/OpenClow/Crab" identity is unclear and must be pinned before project-specific conclusions.
- Some web sources around OpenClaw/Hermes look promotional or inconsistent; prefer official repo/docs and dated community reports.
- Self-improving skills and auto-written wiki memory increase stale-memory, prompt-injection and accidental-permission risks.
- Business/CRM agent recommendations need separate privacy/security review before implementation.

## Recommendation

Accept as a significant UX/adoption signal. Do not convert directly into a standard.

Add a reusable comparison rubric for future agent architecture materials:

- operator type: coder, semi-technical, non-technical;
- runtime/shell: Codex CLI, Codex app, Hermes, OpenClaw, Claude Code, Gemini CLI, etc.;
- cold-start context and context growth;
- memory model and write policy;
- tool/skill transparency;
- long-task reliability;
- recovery path after bad state;
- cost predictability;
- security boundary and approval model;
- evidence date and source class.

## Next step

Create/update a review around `agent-shell-selection-for-non-coder-workflows` and use this source as one evidence item among official docs and community reports.

