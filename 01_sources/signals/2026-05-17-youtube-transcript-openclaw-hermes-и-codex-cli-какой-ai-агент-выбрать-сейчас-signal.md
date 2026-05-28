---
id: 2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal
type: signal
status: refined
created: 2026-05-17
updated: 2026-05-17
topics: [openclaw, hermes, codex-cli, ai-agents, user-experience, non-professional-users, agent-memory, llm-wiki, telegram-agents]
tools: [youtube, yt-dlp, mlx-whisper, openclaw, hermes, codex, obsidian, telegram]
sources:
  - 01_sources/raw/youtube-L-HAzfFWSto/L-HAzfFWSto-whisper-small.md
  - https://www.youtube.com/watch?v=L-HAzfFWSto
related:
  intakes:
    - 00_inbox/links/2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake.md
  assessments:
    - 03_reviews/2026-05-17-2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake-auto-assessment.md
generated_from:
  - 01_sources/raw/youtube-L-HAzfFWSto/L-HAzfFWSto-whisper-small.md
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: advanced-user comparison of OpenClaw, Hermes and Codex CLI

Date: 2026-05-17
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- Видео ценно как lived-experience источник: автор не выступает как инженерная спецификация, но хорошо показывает, что происходит, когда продвинутый не-разработчик реально пытается жить с несколькими агентскими оболочками.
- Главная повторяющаяся тема: пользователю нужен не "самый умный живой собеседник", а стабильный рабочий контур, который не пухнет, не теряет контекст и умеет выполнять длинные задачи.
- Автор разделяет агентские оболочки по "толщине harness": более богатая оболочка дает персональность и удобство, но чаще приносит context bloat, расход токенов, нестабильность и сложность поддержки.
- Практический критерий выбора для Techscope: agent runtime нужно оценивать не только по качеству ответа, но и по холодному старту, объему подтягиваемого контекста, прозрачности используемых skills/tools и восстановлению после restart.
- Сильный сигнал в пользу file-backed wiki memory: автор независимо приходит к паттерну, близкому к нашему `10_wiki/`: raw/source слой отдельно, сгенерированная Markdown wiki отдельно, index/log and rules для агентов.
- Для не-технических пользователей важен business-facing interface: Telegram/бот-посредник, понятные папки с файлами, CRM/API integrations, отчеты, заявки и manager-assist workflows, а не просьба "запусти команды по инструкции".

## Technical details

- Source date: YouTube live published 2026-04-28; processed in Techscope on 2026-05-17.
- User class: advanced AI-agent user, not a professional coder. Use as UX/adoption evidence, not as primary technical proof.
- Test prompt used by author: compare agents on debugging an unstable agent system with memory loss, context drift, token overuse and non-programmer operator constraints.
- Observed evaluation dimensions from transcript:
  - startup context size and token overhead;
  - ability to show which tools/skills are being used;
  - ability to split tasks between subagents;
  - ability to migrate agent skills/personas between runtimes;
  - ability to work from a folder of files instead of many pasted messages;
  - reliability on long-running tasks;
  - usefulness for small-business assistant workflows.
- Author's empirical claims:
  - OpenClaw/Crab-like rich shell is pleasant and personal but can accumulate too much context and become expensive/unstable under heavy use.
  - Hermes-like shell feels more stable for business/autonomous work because it creates/adapts skills from repeated workflows.
  - Codex CLI-based agent feels lean and suitable for long coding/heavy tasks when paired with explicit wiki memory.
  - Markdown wiki memory is more important than large raw context windows; disk size is not the concern, token budget and read policy are.

## Agent design implications

- Treat non-professional expert videos as a distinct evidence type: strong for UX and workflow pain, weak for low-level architecture claims until verified.
- Add a rubric for future agent comparisons:
  - context budget at cold start;
  - context growth after several tasks;
  - task completion on long jobs;
  - skill/memory portability;
  - operator clarity for non-coders;
  - visible tool/skill trace;
  - rollback/recovery after bad memory writes;
  - cost predictability;
  - security and permission isolation.
- For Techscope intake, do not store raw transcript as primary memory. Store refined signal, source note, brief and assessment; keep raw transcript in `01_sources/raw/`.
- For business-facing agents, prefer a thin, reliable interface around a well-understood runtime over a feature-heavy autonomous shell unless the shell's memory, permissions and logs are auditable.
- Any "wiki is source of truth" claim must be adapted to Techscope's safer rule: raw/curated artifacts are source of truth; generated wiki is synthesis/navigation until reviewed.

## Candidate rules

- For every evaluated agent shell, record `runtime`, `model/provider`, `memory model`, `tool surface`, `permissions`, `cold-start context`, `long-task behavior`, `operator audience` and `source date`.
- For non-coder use cases, the acceptable interface is "drop material / ask in Telegram / receive concise result"; command-line repair instructions are implementation detail.
- Generated skills and wiki pages must have provenance and review status before they affect standards or decisions.
- If an agent grows persistent memory automatically, require lint for stale facts, contradictions, orphan pages, and token-heavy pages.
- Use "advanced user opinion" to design onboarding and workflow ergonomics, not to certify security or architecture.

## Noise removed

- Stream setup, travel/burnout banter, repeated demonstrations, chat digressions and long raw transcript fragments removed.
- Emotional language preserved only as UX signal where it affects adoption, trust or operator behavior.

## Verification required

- Verify exact identity/version of "OpenClaw/OpenClow/Crab" before using project-specific conclusions; web search shows multiple similarly named wrappers and control planes.
- Verify Hermes claims against NousResearch/hermes-agent and Hermes docs before treating self-improving skill behavior as a platform guarantee.
- Verify Codex CLI claims against OpenAI docs/repo because Codex app, CLI, app-server and plugin/runtime surfaces differ by version.
- Compare with a sample of non-professional/semi-professional community reports before using the video as broader market signal.
- Security review required before adopting Telegram/CRM/business-agent recommendations.

## Codex refinement notes

- Refined in Techscope Codex thread on 2026-05-17.
- Promoted to brief/review candidates; do not promote directly to standards.

## Source links

- 01_sources/raw/youtube-L-HAzfFWSto/L-HAzfFWSto-whisper-small.md
- https://www.youtube.com/watch?v=L-HAzfFWSto
