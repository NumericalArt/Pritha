---
id: 2026-05-26-openclaw-hacked-prompt-injection-source-note
type: source-note
status: processed
created: 2026-05-26
updated: 2026-05-26
topics:
  - prompt-injection
  - agent-security
  - openclaw
  - untrusted-input
  - cost-abuse
tools:
  - OpenClaw
  - Claude Opus 4.6
  - Gmail
  - YouTube
sources:
  - https://www.youtube.com/watch?v=_E4ZT1h7MZs
  - 01_sources/raw/youtube-_E4ZT1h7MZs/_E4ZT1h7MZs-whisper-small.md
  - https://developers.openai.com/api/docs/guides/agent-builder-safety
  - https://openai.com/index/designing-agents-to-resist-prompt-injection/
  - https://owasp.org/www-project-top-10-for-large-language-model-applications/
  - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool
related:
  intakes:
    - 00_inbox/links/2026-05-26-youtube-openclaw-hacked-prompt-injection-intake.md
  briefs:
    - 02_briefs/2026-05-26-openclaw-hacked-prompt-injection-brief.md
  reviews:
    - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
---

# Source Note: OpenClaw Hacked Prompt Injection Video

Date: 2026-05-26
Status: processed

## Source snapshot

- Video: `I was hacked...`
- Channel: Matthew Berman
- YouTube id: `_E4ZT1h7MZs`
- Source URL: https://www.youtube.com/watch?v=_E4ZT1h7MZs
- Published: 2026-04-03
- Duration: 14:54
- Local raw transcript: `01_sources/raw/youtube-_E4ZT1h7MZs/_E4ZT1h7MZs-whisper-small.md`
- ASR note: first pass with Russian language setting was poor; final transcript was regenerated with `--language en`.

## What happens in the video

Matthew Berman gives Pliny the Liberator limited access to attack an OpenClaw-style personal AI system that scans an email address. The attacker does not initially know the system architecture or model. Attempts include:

- probing what model is behind the system;
- sending very large token payloads disguised as harmless content;
- trying custom jailbreak instructions;
- attempting a "siege" or budget-exhaustion attack by forcing the agent to process many tokens;
- using format override / structured jailbreak prompts;
- making a prompt look like an internal system command;
- trying to coax memory or private details through a creative/free-association task.

Most attempts are quarantined by the target system. Gmail spam filtering catches early messages before the AI system is reached; later attempts are caught by the system's own quarantine loop.

## Useful extracted claims

- Agents that read untrusted external content need a hostile input boundary.
- Token-flood payloads are not only jailbreak probes; they can also be cost-abuse / denial-of-wallet attacks.
- Prompt injection can be partial. Format override or output-control success may be an early warning even if no exfiltration occurs.
- A narrow agent with only a few tasks has a smaller attack surface.
- Stronger frontier/reasoning models can be better as first-line scanners than small or local models, but this is a cost/latency trade-off rather than a universal rule.
- Human-in-the-loop remains the strongest guard for sensitive actions and data release.
- No agent should be treated as permanently secure after one test.

## Promotion and sponsor noise

The Greptile segment is sponsorship and should not be treated as evidence that Greptile is the correct code-review standard. It is relevant only as a weak market signal that AI-assisted code review is a common concern.

## Verification against current sources

- OpenAI agent safety docs define prompt injection as untrusted text/data attempting to override agent instructions, including private data exfiltration and unintended actions.
- OpenAI recommends combining mitigations: keep untrusted data from directly driving behavior, extract structured fields, use guardrails, confirmations and validation.
- OpenAI's prompt-injection article emphasizes that dangerous actions or sensitive transmissions should not happen silently, and recommends controls similar to what a human agent would need.
- OWASP lists prompt injection as a top LLM application risk and includes broader GenAI security guidance.
- Anthropic computer-use docs warn that model-controlled environments should be sandboxed, kept away from sensitive data, domain-limited and confirmed by humans for meaningful real-world consequences.

## Source-quality notes

- Strong: live adversarial demo plus official OpenAI, Anthropic and OWASP docs.
- Moderate: claims about Claude Opus 4.6 behavior in this exact scenario; the video is a single demo, not a benchmark.
- Weak: popularity/authority claims about specific people/tools; useful for context, not for standards.
