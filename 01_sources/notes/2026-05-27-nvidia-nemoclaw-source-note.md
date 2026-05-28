---
id: source-note-nvidia-nemoclaw-2026-05-27
type: brief
status: draft
created: 2026-05-27
updated: 2026-05-27
topics: [nemoclaw, openshell, openclaw, sandbox, agent-security, runtime-boundary, model-routing]
tools: [NemoClaw, OpenShell, OpenClaw, NVIDIA, Docker, Node.js]
agent_platforms: [OpenClaw, OpenShell, Hermes, Codex]
model_context: [hosted-models, local-models, routed-inference]
runtime_environment: [local-host, docker, sandbox, messaging-gateway, remote-gpu]
config_surfaces: [blueprint.yaml, sandbox-policy.yaml, router-pool-config.yaml, AGENTS.md, agent-contract]
portability: adapter-needed
sources:
  - https://github.com/NVIDIA/NemoClaw
  - https://docs.nvidia.com/nemoclaw/latest/about/overview
  - https://docs.nvidia.com/nemoclaw/latest/about/how-it-works
  - https://docs.nvidia.com/nemoclaw/latest/reference/architecture
  - https://docs.nvidia.com/nemoclaw/latest/reference/network-policies
  - https://docs.nvidia.com/nemoclaw/latest/security/best-practices
related:
  intakes:
    - 00_inbox/links/2026-05-27-github-nvidia-nemoclaw-intake.md
  briefs:
    - 02_briefs/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-brief.md
  reviews:
    - 03_reviews/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-assessment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-03-16
source_updated: 2026-05-27
source_version: github-main-e139dbcabe4d78ba9c8e503c94f0ed9e7a30ed91; latest-tag-v0.0.52; docs-release-notes-visible-through-v0.0.49
retrieved: 2026-05-27
verified: 2026-05-27
valid_for: NemoClaw alpha snapshot checked 2026-05-27
temporal_status: version-bound
---

# Source Note: NVIDIA NemoClaw

Date: 2026-05-27
Source: https://github.com/NVIDIA/NemoClaw
Status: draft

## Repository snapshot

- Repository: `NVIDIA/NemoClaw`
- Description: "Run OpenClaw more securely inside NVIDIA OpenShell with managed inference"
- License: Apache-2.0
- GitHub created: 2026-03-15
- GitHub updated: 2026-05-27
- GitHub pushed: 2026-05-27
- Main HEAD checked: `e139dbcabe4d78ba9c8e503c94f0ed9e7a30ed91`
- Latest tags observed: `v0.0.52`, `v0.0.51`, `v0.0.50`, `v0.0.49`
- Docs release notes page visibly described releases through `v0.0.49` at check time, so repository tags are ahead of visible release notes.
- Project status: alpha / early preview; not production-ready according to README.

## What the source says

NemoClaw packages OpenClaw inside OpenShell. It provides a host CLI, sandbox blueprint, OpenClaw plugin, onboarding flow, routed inference, state helpers, messaging-channel setup, and policy layers for network, filesystem, process and inference control.

The most important architecture detail is the runtime boundary:

- operator and CLI run on the host;
- the agent runs inside a Docker/OpenShell sandbox;
- the OpenShell gateway owns credentials, network policy, lifecycle coordination and inference routing;
- the sandbox calls `inference.local` instead of seeing raw provider keys;
- unknown network egress is deny-by-default and can be surfaced to the operator for approval.

## Useful facts for Techscope

- NemoClaw itself is OpenClaw/OpenShell-specific and alpha, so it should not become a default dependency for Agents Mother-created agents.
- The pattern is portable: host-side control plane, sandboxed agent runtime, gateway-held secrets, declarative egress policy, lifecycle status/logs, explicit messaging presets and model routing.
- The docs show a concrete implementation of the security ideas already present in Techscope: untrusted input, runtime placement, proactive agents, messaging channels and long-running services need a stronger boundary than a raw local process.

## Freshness notes

This material changes quickly. Any concrete NemoClaw command, version, tag, model pool, Docker-driver behavior, supported platform matrix or provider list must be rechecked before implementation.

Preserve the pattern, not the exact current version details.
