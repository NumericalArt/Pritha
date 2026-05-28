---
id: 2026-05-17-codbash-agent-session-browser-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [codbash, coding-agents, session-observability, agent-launcher, codex, claude-code, local-dashboard]
tools: [Codbash, Claude Code, Codex CLI, Cursor, OpenCode, Kiro, Kilo, Copilot Chat, GitHub]
source_type: telegram
source_url: https://t.me/iwann_tai/16
sources:
  - 00_inbox/telegram/2026-05-17-telegram-6208460904-16-пока-vakovalskii-и-eprogrammist-активно-развивают-крутой-про.md
  - 00_inbox/telegram/2026-05-17-telegram-6208460904-17-telegram-photo.md
  - 00_inbox/telegram/2026-05-17-telegram-6208460904-18-telegram-photo.md
  - 00_inbox/telegram/2026-05-17-telegram-6208460904-19-telegram-photo.md
  - 00_inbox/telegram/2026-05-17-telegram-6208460904-20-telegram-photo.md
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-16-пока-vakovalskii-и-eprogrammist-активно-развивают-крутой-про/01-photo.jpg
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-17-telegram-photo/01-photo.jpg
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-18-telegram-photo/01-photo.jpg
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-19-telegram-photo/01-photo.jpg
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-20-telegram-photo/01-photo.jpg
  - https://github.com/vakovalskii/codbash
  - https://github.com/vakovalskii/codbash/releases/tag/v7.0.0
related:
  briefs:
    - 02_briefs/2026-05-17-codbash-agent-session-browser-brief.md
  reviews:
    - 03_reviews/2026-05-17-codbash-agent-session-browser-assessment.md
  standards:
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
source_published: 2026-05-17
source_updated: 2026-05-16
source_version: Codbash v7.0.0 observed 2026-05-17; GitHub API observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Codbash/Codex/Claude session-dashboard assessment as of 2026-05-17
temporal_status: current
---

# Source Note: Codbash agent session browser

Date: 2026-05-17
Status: processed

## Source snapshot

- Telegram source: `iwann_tai/16` plus screenshots in `iwann_tai/17..20`.
- Project: `vakovalskii/codbash`.
- GitHub API observed 2026-05-17: 210 stars, 38 forks, 5 open issues, MIT, JavaScript, latest push 2026-05-16.
- Latest release observed: `v7.0.0`, published 2026-04-16; release notes say `codedash` became `codbash`.
- GitHub README positions Codbash as a local control room for AI coding sessions: search, replay and resume sessions across Claude Code, Codex CLI, Qwen, Cursor, OpenCode, Kiro, Kilo and Copilot Chat.

## Extracted from Telegram text and screenshots

- The Projects tab is becoming an agent launcher, not only a session browser.
- Project cards expose `New` and `Last`: start a new agent session or continue the last one.
- A per-project default agent can be selected, while one-off agent choice remains possible.
- The UI detects installed agents; screenshots show Claude Code and Cursor installed, Codex/Qwen/Kilo/OpenCode not installed on the pictured machine.
- Add Project supports local path, own GitHub repositories and repositories where the user contributes.
- The dashboard can clone a GitHub repo and add it as a managed project.
- History view groups sessions by project and shows message counts/cost estimates.
- Background refresh updates new sessions and spend without manual refresh.
- Analytics supports arbitrary services/plans, not only Claude/Cursor/Codex.
- Worktree repositories are intended to be grouped under the primary repo rather than duplicated.

## Why this matters

Codbash is directly relevant to Techscope because our real work increasingly involves multiple coding agents and sessions. The pain point is not just starting agents; it is knowing which sessions exist, what they cost, which project they belong to, and how to resume or hand off work.

## Evidence caveats

- Telegram post is a secondary/update source from the project author/community.
- GitHub README and release notes confirm the project scope and supported agents.
- Screenshots are useful UI evidence but not proof of reliability.
- Local installation is required before treating Codbash as a Techscope standard.
