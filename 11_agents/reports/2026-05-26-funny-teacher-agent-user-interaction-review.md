---
id: 2026-05-26-funny-teacher-agent-user-interaction-review
type: agent-post-creation-review
status: accepted
created: 2026-05-26
updated: 2026-05-26
topics:
  - agent-engineering
  - agents-mother
  - user-interaction-review
  - funny-teacher
  - product-discovery
tools:
  - Codex
  - Agents Mother
  - OpenAI Realtime API
  - SQLite
  - Tailscale
agent_platforms:
  - Codex
model_context:
  - gpt-realtime-2
runtime_environment:
  - local-project
  - web-ui
config_surfaces:
  - 07_workflows/agents-mother.md
  - 08_templates/agent-post-creation-review.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/creation-review.md
portability: portable
sources:
  - Techscope user thread 2026-05-25 to 2026-05-26
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/creation-review.md
  - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  agent_post_creation_reviews:
    - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  workflows:
    - 07_workflows/agents-mother.md
  templates:
    - 08_templates/agent-post-creation-review.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-26
source_updated: 2026-05-26
source_version: Funny Teacher creation interaction review
retrieved: 2026-05-26
verified: 2026-05-26
valid_for: future Agents Mother runs
temporal_status: current
---

# Agent User Interaction Review: Funny Teacher

Date: 2026-05-26
Status: accepted

## Summary

This review records how the user and Agents Mother shaped Funny Teacher from a broad idea into a working v1. The important lesson is that the final product was not fully known at the first prompt. It emerged through a sequence of product clarifications, real-device tests, failures, small corrections and user-driven UX refinements.

Future Agents Mother runs should always preserve this interaction trail because it contains design intent that is not visible from the final code.

## Prompt Sequence

The user prompts can be grouped into these phases:

1. **Naming and mission**
   - Create a new agent named Funny Teacher.
   - The agent should help with fast, interesting English learning, especially speaking.
   - The agent should check tasks and evaluate how the learner speaks.

2. **Lesson model**
   - Load YouTube videos like Agents Mother already knows how to do.
   - Let the learner watch the video.
   - Then start a voice teacher that checks whether the video material was understood.
   - Ask tasks, invite free speech, correct answers, and decide whether the learner has mastered the lesson.

3. **Memory**
   - Save lessons and return to them.
   - Reuse older topics inside later lessons as natural repetition.
   - Keep progress, attempts, grades and weak points.
   - Decide that video files are cache, while text/derivative/progress are durable memory.

4. **Interface**
   - Use web voice-only as the main interface.
   - Put YouTube URL input directly in the UI.
   - Put voice start controls below the lesson.
   - Keep UI bilingual, but allow the teacher to support languages beyond English.

5. **Architecture**
   - Use the voice-edge pattern from FESPA26 only where it fits.
   - Use OpenAI Realtime for dialogue.
   - Keep Codex/project harness as the build environment.
   - Use SQLite and semantic search.
   - Use Tailscale on a free port for MacBook/iPhone access.

6. **Testing feedback**
   - YouTube embed showed anti-bot prompts, so local media cache and YouTube fallback became necessary.
   - The user asked for launchd service behavior.
   - The user asked what `Find in memory` actually does.
   - Search results were made actionable.
   - The user noticed that a selected result could confuse the teacher; reset was added.
   - The user requested voice input in the memory search field.
   - The user asked whether repeated YouTube links would be reused; idempotent intake was added.

7. **Version fixation**
   - The user asked to fix the current state as the first successful version.
   - The user asked to document the agent, review the creation path, and add this lesson back into Agents Mother.

## Product Lessons From The Interaction

- The user was not asking for a generic voice chat. The agent needed a lesson lifecycle: intake, watch, practice, assess, save, repeat.
- Manual memory search was not enough until it became actionable.
- A memory focus is powerful only if it is explicit and resettable.
- Real mobile testing matters. The YouTube anti-bot screen changed the architecture.
- The user wants production-testable agents immediately, not mockups that require later reconstruction.
- Small UI questions are often architecture questions in disguise.

## Good Agents Mother Behaviors

- Build an accepted contract before implementation.
- Keep asking architectural clarifications only when they affect scope or safety.
- Implement in increments and verify on the real deployment path.
- Convert user friction into harness changes rather than treating it as a one-off bug.
- After the agent works, write down both final architecture and creation interaction.

## Missed Or Late Behaviors

- The first scaffold did not fully anticipate mobile YouTube embed limits.
- The first memory search UI exposed retrieval but not workflow actions.
- The reset requirement should have been anticipated once selected context was introduced.
- Idempotent source intake should be a default ingestion rule, not a late correction.

## Rule For Future Agents Mother Runs

Every created agent should receive a user interaction review after the first meaningful working version. The review must record:

- the initial user prompt;
- the clarifying prompts and answers;
- major changes caused by user feedback;
- failed assumptions;
- UX/product decisions that are not obvious from code;
- reusable patterns for future agents;
- remaining open questions.

This review may be a section inside `agent-post-creation-review`, but for substantial agents it should be a separate report in `11_agents/reports/`.
