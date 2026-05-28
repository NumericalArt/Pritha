---
id: intake-github-nvidia-nemoclaw-2026-05-27
type: intake
status: new
created: 2026-05-27
updated: 2026-05-27
topics: [nemoclaw, openshell, openclaw, sandbox, agent-security, runtime-boundary, model-routing]
tools: [NemoClaw, OpenShell, OpenClaw, NVIDIA, Docker, Node.js]
source_type: link
source_url: https://github.com/NVIDIA/NemoClaw
source_published: 2026-03-16
source_updated: 2026-05-27
source_version: github-main-e139dbcabe4d78ba9c8e503c94f0ed9e7a30ed91; latest-tag-v0.0.52
retrieved: 2026-05-27
verified: 2026-05-27
temporal_status: version-bound
sources:
  - https://github.com/NVIDIA/NemoClaw
  - https://docs.nvidia.com/nemoclaw/latest/about/overview
  - https://docs.nvidia.com/nemoclaw/latest/about/how-it-works
related:
  briefs:
    - 02_briefs/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-brief.md
  reviews:
    - 03_reviews/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-assessment.md
---

# Intake: NVIDIA NemoClaw

Date added: 2026-05-27
Type: link / repository / documentation
Source: https://github.com/NVIDIA/NemoClaw
Source published: 2026-03-16
Source updated: 2026-05-27
Source version: GitHub main `e139dbcabe4d78ba9c8e503c94f0ed9e7a30ed91`, latest tag `v0.0.52`
Retrieved: 2026-05-27
Verified: 2026-05-27
Temporal status: version-bound
Status: new

## Why this may matter

NemoClaw is NVIDIA's reference stack for running OpenClaw inside NVIDIA OpenShell with sandboxing, routed inference, network policy, host-side credential handling and lifecycle management. This is relevant to Techscope because Agents Mother creates agents that may become always-on, accept untrusted input, use messaging channels and need explicit runtime boundaries.

## Raw material or link

- Repository: https://github.com/NVIDIA/NemoClaw
- Documentation overview: https://docs.nvidia.com/nemoclaw/latest/about/overview
- Architecture overview: https://docs.nvidia.com/nemoclaw/latest/about/how-it-works

## Initial questions

- Is NemoClaw useful as a direct dependency for Techscope-created agents, or only as a reference architecture?
- Which ideas transfer to Codex-native agents without adopting OpenClaw?
- What should Agents Mother add to its contracts: sandbox runtime, gateway-held secrets, deny-by-default network policy, policy presets, model routing, state migration?

## Expected output

brief | assessment | standard update
