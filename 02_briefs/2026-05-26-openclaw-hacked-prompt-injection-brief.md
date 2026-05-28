---
id: 2026-05-26-openclaw-hacked-prompt-injection-brief
type: brief
status: draft
created: 2026-05-26
updated: 2026-05-26
topics:
  - prompt-injection
  - agent-security
  - untrusted-input
  - openclaw
  - agents-mother
  - cost-abuse
tools:
  - OpenClaw
  - Claude Opus 4.6
  - Gmail
  - OpenAI Agent Builder
  - OWASP LLM Top 10
agent_platforms:
  - Codex
  - OpenClaw
  - Claude
  - OpenAI Realtime API
model_context:
  - Claude Opus 4.6
  - frontier reasoning models
  - local models
runtime_environment:
  - personal-agent
  - messaging-gateway
  - email-ingestion
  - web-ui
config_surfaces:
  - AGENTS.md
  - security policy
  - tool schemas
  - queue policy
  - operations manifest
portability: portable
sources:
  - 00_inbox/links/2026-05-26-youtube-openclaw-hacked-prompt-injection-intake.md
  - 01_sources/notes/2026-05-26-openclaw-hacked-prompt-injection-source-note.md
  - https://www.youtube.com/watch?v=_E4ZT1h7MZs
  - https://developers.openai.com/api/docs/guides/agent-builder-safety
  - https://openai.com/index/designing-agents-to-resist-prompt-injection/
  - https://owasp.org/www-project-top-10-for-large-language-model-applications/
  - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool
related:
  intakes:
    - 00_inbox/links/2026-05-26-youtube-openclaw-hacked-prompt-injection-intake.md
  reviews:
    - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-04-03
source_updated: 2026-04-03
source_version: YouTube video plus official docs checked 2026-05-26
retrieved: 2026-05-26
verified: 2026-05-26
valid_for: Agents Mother security design for agents ingesting untrusted external content
temporal_status: current
---

# Brief: OpenClaw Hacked Prompt Injection Test

Date: 2026-05-26
Source: Matthew Berman YouTube video plus official OpenAI/Anthropic/OWASP checks
Status: draft

## Summary

The video is a useful adversarial demo for personal agents that read external messages. The main signal is not that one OpenClaw setup survived one attacker. The durable lesson is that email, Telegram, websites, files and media transcripts must be treated as untrusted input. Before such input can affect model instructions, tools, memory or spend, it needs filtering, quota limits, structured extraction, quarantine and human approval gates.

## Key claims

- Prompt injection does not require a website or browser; an email or forwarded message is enough.
- Token-flood payloads can be both probing attacks and economic attacks.
- Format override is an early signal of compromised instruction hierarchy even without full exfiltration.
- Narrow agents with fewer tools and narrower tasks are easier to defend.
- Strong frontier/reasoning models are better candidates for security scanning than small/local models when the exposed surface is sensitive.
- Human confirmation remains essential before sensitive data release, external communication, irreversible tool use or high-cost work.

## Agent environment profile

- Agent platforms: OpenClaw in the video; portable to Codex-native agents, Realtime voice agents, Telegram agents and email/web-ingestion agents.
- Model context: video uses Claude Opus 4.6 as the target/scanner context; official docs confirm frontier systems still need sandboxing and prompt-injection mitigations.
- Runtime environment: personal agent with email ingress and access to sensitive local/account data.
- Config surfaces: security policy, tool schemas, queue policy, budget policy, human approval gates, operations manifest.
- Portability: portable as a harness pattern; implementation is adapter-specific.

## Evidence

- The video shows multiple prompt-injection/cost-abuse attempts against a personal AI system.
- OpenAI agent safety docs define prompt injection as untrusted data trying to override behavior and recommend structured extraction, guardrails, confirmations and validation.
- OpenAI's prompt-injection article emphasizes that sensitive transmissions and dangerous actions should not happen silently.
- OWASP places prompt injection in the LLM application top risk set.
- Anthropic computer-use docs warn that prompt injection persists across frontier systems and recommend containers/VMs, minimal privileges, domain allowlists and human confirmation.

## Existing knowledge and freshness

- Related existing artifacts:
  - `02_briefs/2026-05-17-openclaw-personal-agent-architecture-brief.md`
  - `03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-tool-integration-selection.md`
  - `04_standards/realtime-voice-control-for-codex-agents.md`
- Relationship to existing knowledge: refines.
- Official/current sources checked: OpenAI, Anthropic, OWASP.
- Freshness status: current.
- Source published: 2026-04-03.
- Source updated: 2026-04-03.
- Source version: YouTube video plus docs checked 2026-05-26.
- Retrieved: 2026-05-26.
- Verified: 2026-05-26.
- Valid for: personal agents and Agents Mother-created agents ingesting untrusted external content.
- Temporal status: current.
- Artifacts to mark outdated or superseded: none.

## Risks and caveats

- This is a single demo, not statistical proof that a specific OpenClaw setup is secure.
- Some defense in the early attempts came from Gmail spam filtering, not the AI system itself.
- "Use the best model as scanner" is a useful heuristic, but expensive. It should become a risk-tiered policy, not a blanket rule.
- The Greptile sponsorship block is not evidence for adopting Greptile.
- Prompt-injection defenses age quickly; recheck primary docs before promoting implementation details.

## Recommendation

Create a draft standard for untrusted-input security in Agents Mother. This should become a default contract section for any new agent that ingests external text, files, websites, email, Telegram posts, YouTube transcripts or screenshots.

## Next step

Use `04_standards/agent-untrusted-input-security.md` as a draft rule and add it to future `agent-contract` validation/interview questions.
