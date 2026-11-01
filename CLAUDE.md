---
id: pritha-claude-runtime-instructions
type: workflow
status: active
created: 2026-11-01
updated: 2026-11-01
topics: [pritha, agent-runtime, claude-code]
tools: [Claude Code]
sources: [AGENTS]
related:
  workflows: [2026-11-01-pritha-provider-convergence-roadmap]
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: pritha
  id: pritha
---

@AGENTS.md

# Claude Code in Pritha

Follow the canonical instructions in `AGENTS.md` and applicable nested instructions.
Keep instance data under `PRITHA_STATE_ROOT`. Never copy credentials or a local
Claude login into another instance or child agent.

Pritha's hosted API lane uses isolated configuration, explicit host MCP tools and
an operating-system sandbox. It supplies these rules explicitly because `--bare`
does not load project configuration automatically. Built-in tools and project
hooks do not authorize effects. Use the displayed host approval for an exact
file write or command; it never expands filesystem or network access.

Do not edit protected Trials, verifier inputs, approval receipts, budgets, ledger
or guard configuration to obtain a passing result. Report observed tool results,
usage and verification honestly. Preserve an operation's identifier on retry and
do not repeat an effect whose outcome is unknown. Resume only the session selected
by the host. Do not push, deploy or enable services without the required approval.
