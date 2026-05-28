---
id: template-agent-project-contract
type: template
status: draft
created: 2026-05-18
updated: 2026-05-27
template_for: agent-contract
topics: []
tools: []
agent_platforms: []
model_context: []
runtime_environment: []
config_surfaces: []
portability: codex-native | portable | adapter-needed | environment-specific | unknown
sources: []
related:
  intakes: []
  briefs: []
  reviews: []
  decisions: []
  standards: []
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current | changed | outdated | uncertain
source_published: YYYY-MM-DD | unknown
source_updated: YYYY-MM-DD | unknown
source_version: version | release | commit | spec-date | unknown
retrieved: YYYY-MM-DD
verified: YYYY-MM-DD | pending
valid_for: version/date range | unknown
temporal_status: current | version-bound | stale | unknown
---

# Agent Project Contract: agent-name

Date: YYYY-MM-DD
Status: draft | accepted | superseded

## Purpose

- Agent name:
- Primary mission:
- Target user:
- Success criteria:
- Out of scope:

## Functional scope

### V1 core functions

-

### Deferred functions

-

### Critical user workflows

-

## Runtime and interface

- Runtime family: codex-native | cli | api | local-model | hybrid | environment-specific
- Primary interface: Codex project | Telegram | CLI | web | API | mixed
- Secondary interfaces:
- Telegram mode: none | primary-chat | intake-channel | notifications-only | operator-control
- Expected hosting: local Mac | Mac mini service | VPS | cloud | embedded | unknown

## Runtime isolation and boundary

- Runtime isolation profile: none | process-only | project-folder | container | sandbox | remote-sandbox | unknown
- Sandbox required: no | optional | required | later
- Sandbox candidate: none | Docker | OpenShell/NemoClaw | devcontainer | VM | custom | unknown
- Host control plane:
- Agent execution boundary:
- Credential boundary: host-only | env-in-process | gateway-injected | manual | unknown
- Network policy: unrestricted | allowlist | deny-by-default | operator-approved | unknown
- Filesystem policy:
- Integration policy presets:
- Operator approval flow:
- Snapshot/restore needs:
- Runtime boundary notes:

## Runtime placement

- Runtime placement profile: deterministic-first | frontier-first | local-first | hybrid | unknown
- Multi-model routing requested: no | yes | only-if-needed
- Local inference required: no | optional | required | later
- Local inference adapter: none | LM Studio | Ollama | vLLM | custom | unknown
- Provider fallbacks:
- Privacy routing rules:
- Model budget policy:
- Route healthcheck:
- Route change log:

| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Planning | frontier-hosted | TBD current model | YYYY-MM-DD | yes | human/manual |  |  |
| Coding | Codex/frontier-hosted | TBD current model | YYYY-MM-DD | yes | human/manual |  |  |
| Extraction | frontier-hosted | TBD current model | YYYY-MM-DD | yes | small-hosted/local |  |  |
| Summarization | frontier-hosted | TBD current model | YYYY-MM-DD | yes | small-hosted/local |  |  |
| Classification | small-hosted/local | TBD after eval | YYYY-MM-DD | yes | frontier-hosted |  |  |
| Transcription | local/hosted-audio | TBD current model | YYYY-MM-DD | yes | hosted-audio/local |  |  |
| Embeddings | local/small-hosted | TBD current model | YYYY-MM-DD | yes | hosted |  |  |
| Memory query | local/small-hosted | TBD after eval | YYYY-MM-DD | yes | frontier-hosted |  |  |
| Security scan | frontier-hosted/specialized | TBD current model | YYYY-MM-DD | yes | manual |  |  |

## Operations and service

- Deployment target: local Mac | Mac mini | VPS | cloud | embedded | user device | none | unknown
- Deployment profile: local-development | mac-mini-service | cloud-service | embedded | external | unknown
- Service mode: none | manual | launchd | external
- Autostart: disabled | optional | launchd-on-approval | external
- Start command:
- Stop command:
- Healthcheck command:
- Log path:
- Restart policy:

## Proactivity

- Proactive mode: none | manual | scheduled | heartbeat | event-driven | queue-watcher | hybrid
- Trigger sources:
- Schedule:
- Heartbeat interval:
- Idle behavior:
- User interruption policy:

## Harness inventory

- Information boundaries:
- Runtime placement:
- Tool system:
- Execution orchestration:
- Memory and state:
- Evaluation and observability:
- Constraints, validation and recovery:
- Human approval gates:
- Completion criteria:

## Data, memory and sources

- Input data types:
- Stored data:
- Sensitive data:
- Memory model:
- Indexing/search needs:
- External verification needs:
- Source freshness requirements:

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
|  | CLI/script |  |
|  | skill/workflow |  |
|  | MCP/API |  |
|  | browser/manual |  |

## Security and permissions

- Secrets required:
- `.env.example` variables:
- Allowed network access:
- Allowed filesystem access:
- User authorization model:
- Runtime isolation profile:
- Network policy tier:
- Credential storage boundary:
- Risk notes:

## Scaffold requirements

- Target folder:
- Files to generate:
- Dependencies:
- Setup commands:
- Run commands:
- Tests/healthchecks:
- User training guide:

## Research basis

- Related TechScope artifacts:
- Current primary sources checked:
- Trusted secondary sources checked:
- Alternatives considered:
- Decision rationale:

## Acceptance checklist

- [ ] Contract reviewed with user.
- [ ] Runtime family selected.
- [ ] Runtime isolation profile selected or explicitly marked unnecessary.
- [ ] Runtime placement selected per task class.
- [ ] Interface mode selected.
- [ ] Telegram need explicitly decided.
- [ ] Harness inventory complete.
- [ ] Security model documented.
- [ ] Tests/healthchecks defined.
- [ ] Handoff/training plan defined.
