---
id: template-agent-project-contract
type: template
status: draft
created: 2026-05-18
updated: 2026-06-15
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
  standards:
    - 04_standards/agent-ai-safe-security-checklist.md
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
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: agent-name
privacy: public
retention: durable
review_status: draft
confidence: medium
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
- Target folder: sibling of Pritha | explicit path | existing project
- Contract status before scaffold: draft | accepted | superseded

## Pritha lineage metadata (optional)

- Seed name:
- Parent agent: Pritha
- Lineage:
- Traits:
- Inheritance:
- Mutation:
- Trial criteria:

## Functional scope

### V1 core functions

-

### Deferred functions

-

### Critical user workflows

-

## Runtime and interface

- Runtime family: codex-native | cli | api | local-model | hybrid | environment-specific
- Codex surface profile: none | cli-local | app-supervised | cloud-task | ide-attached | app-server | sdk-orchestrated | workspace-agent | bedrock-backed | mixed | unknown
- Primary interface: Codex project | Telegram | CLI | web | API | mixed
- Secondary interfaces:
- Interface experience profile: chat-or-codex-thread | operator-console | workflow-ui | embedded-chat-app | event-stream-ui | mcp-app-ui | declarative-generated-ui | realtime-voice-ui | mixed | unknown
- Interface user controls: approve | reject | cancel | pause | retry | edit-state | reset-context | none | unknown
- Interface state model: ephemeral | thread-scoped | task-scoped | durable | unknown
- Interface rendering boundary: host-owned | iframe-sandboxed | native-component-catalog | custom-web | none | unknown
- UI framework: existing | React | Next.js | Svelte | Vue | Angular | Solid | Flutter | native-mobile | custom | none | unknown
- AI UI layer: none | Vercel AI SDK UI | AG-UI | MCP Apps | A2UI | OpenAI Apps SDK | custom | unknown
- UI message/state contract:
- Typed tool component plan:
- Raster visual asset layer: none | generated | reference-based | existing-assets | mixed | unknown
- Raster asset purpose: workflow-state | preview | comparison | media-thumbnail | product-visual | lesson-illustration | empty-error-state | texture-sprite | other | none | unknown
- Raster generation path: none | Codex imagegen | OpenAI image_generation | existing design tool | manual | unknown
- Raster prompt/spec:
- Raster reference image policy:
- Raster rendering boundary:
- Raster format/size policy:
- Raster accessibility/fallback:
- Raster privacy/licensing:
- Raster readiness check:
- 3D visual layer: none | Three.js | React Three Fiber | custom | unknown
- 3D renderer: none | WebGLRenderer | WebGPURenderer | mixed | unknown
- 3D purpose: inspect | simulate | explain | dashboard | avatar | creative-artifact | other | none | unknown
- 3D scene state contract:
- 3D asset/source policy:
- 3D performance/mobile target:
- 3D MCP/debug connector: none | candidate | selected | blocked | unknown
- 3D fallback:
- Codex account/rate-limit telemetry: none | app-server-read | app-server-subscribe | external | unknown
- Codex telemetry bucket/limitId:
- Codex telemetry displayed fields:
- Codex telemetry unavailable-data behavior:
- Codex telemetry privacy boundary:
- Interface side-effect policy: no-side-effects | approval-required | allowed-by-contract | unknown
- Voice/Codex approval gate: none | risky-actions-only | all-writes | unknown
- Interface fallback: text-summary | CLI-status | manual | none | unknown
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
- Provider boundary: direct-openai | chatgpt-sign-in | api-key | aws-bedrock | local-provider | managed-service | mixed | unknown
- Enterprise governance required: no | yes | unknown
- Enterprise provider notes:
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
- Scheduler owner: none | user-managed-chatgpt | host-cron | launchd | kubernetes-cronjob | cloudflare-agent | openclaw-gateway | temporal-schedule | trigger-dev | external | unknown
- Trigger sources:
- Schedule:
- Timezone:
- Heartbeat interval:
- Concurrency policy: forbid-overlap | allow-overlap | replace | queue | unknown
- Missed-run policy:
- Retry/backoff policy:
- Max runtime:
- Idempotency/dedupe key:
- Background memory write policy: disabled | processed-only | approval-required | allowed-by-contract
- Background untrusted-input policy:
- Run status/log path:
- Missed-run monitor:
- Alert channel:
- Kill switch / pause command:
- Idle behavior:
- User interruption policy:

## Skills and procedural memory

- Skill needs: auto | none | selected
- Allowed skill sources: local-only | trusted-only | external-with-approval
- Skill install mode: recommend | vendor | link | runtime-install
- Skill mutation policy: read-only | patch-with-approval | agent-managed
- Skill script policy: instruction-only | scripts-with-approval | scripts-allowed-by-contract
- Skill network policy: no-network | approval-required | allowed-by-contract
- Skill source pinning: none | tag | commit | tree-sha | lockfile
- Skill eval policy: smoke-only | trigger-evals | full-behavior-evals | none-with-justification
- Installed skills:
- Candidate skills:
- External skill approval:
- Skill trusted catalogs:
- Skill update policy:
- Skill audit command:

## MCP connectors

- MCP needs: auto | none | selected
- Allowed MCP sources: local-only | trusted-only | external-with-approval
- MCP install mode: recommend | configure | runtime-install
- MCP auth policy: no-secrets-in-repo | user-local | managed-service | unknown
- MCP toolset policy: narrow-only | read-only-preferred | custom
- MCP side-effect policy: read-only | approval-required | allowed-by-contract
- Selected MCP connectors:
- Candidate MCP connectors:
- Pending MCP auth:
- MCP readiness command:
- MCP audit/update policy:

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
- Harness evolution protocol: inspect local project/contract, consult Pritha memory, verify current docs when needed, implement minimal change with tests

## Data, memory and sources

- Memory domains selected:
- Primary memory domain:
- Subject kind/id:
- Input data types:
- Stored data:
- Sensitive data:
- Memory model:
- Indexing/search needs:
- External verification needs:
- Source freshness requirements:
- Pritha memory research required: yes | no-with-reason
- Pritha memory research report:
- Current-docs verification required: yes | no-with-reason
- Current-docs verification status: pending | complete | not-applicable

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

## AI-SAFE security profile

- AI-SAFE profile: minimal | standard | high-risk | not-applicable | unknown
- AI-SAFE review status: draft | reviewed | blocked | deferred
- Interface / input-output controls:
- Reasoning and planning controls:
- Knowledge / memory / RAG controls:
- Execution / tools / MCP / skills controls:
- Infrastructure / operations / orchestration controls:
- AI-SAFE selected layers:
- AI-SAFE skipped layers:
- AI-SAFE open risks:
- AI-SAFE recheck sources:

## Scaffold requirements

- Target folder:
- Files to generate:
- Dependencies:
- Setup commands:
- Run commands:
- Tests/healthchecks:
- User training guide:

## Research basis

- Related Pritha artifacts:
- Pritha memory searches performed:
- Pritha standards/workflows/decisions used:
- Comparable child-agent evidence used:
- Current primary sources checked:
- Trusted secondary sources checked:
- Alternatives considered:
- Decision rationale:

## Acceptance checklist

- [ ] Contract reviewed with user.
- [ ] Contract status is `accepted` before production scaffold.
- [ ] Pritha memory research completed or explicitly waived with reason.
- [ ] Current primary sources checked for volatile choices or marked not-applicable.
- [ ] Runtime family selected.
- [ ] Runtime isolation profile selected or explicitly marked unnecessary.
- [ ] Runtime placement selected per task class.
- [ ] Interface mode selected.
- [ ] Telegram need explicitly decided.
- [ ] Skills policy selected.
- [ ] MCP policy selected or explicitly skipped.
- [ ] Harness inventory complete.
- [ ] Security model documented.
- [ ] AI-SAFE security profile completed or explicitly marked minimal/not-applicable.
- [ ] Tests/healthchecks defined.
- [ ] Handoff/training plan defined.
