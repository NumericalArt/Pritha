---
id: agent-harness-evaluation
type: standard
status: draft
created: 2026-05-27
updated: 2026-05-27
last_reviewed: 2026-05-27
owner: Techscope/user
topics:
  - agent-engineering
  - harness-evaluation
  - coding-agent-benchmark
  - local-models
  - runtime-placement
tools:
  - Codex
  - OpenCode
  - Pi
  - Hermes
  - OpenClaw
  - vLLM
  - llama.cpp
  - Docker
sources:
  - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
  - https://www.youtube.com/watch?v=bXRQsQmgAYo
  - https://github.com/Zux1U/microbench_16
  - https://docs.vllm.ai/en/latest/
  - https://github.com/ggml-org/llama.cpp
  - https://opencode.ai/docs/providers/
  - https://github.com/earendil-works/pi
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
  briefs:
    - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-26
source_updated: 2026-05-27
source_version: Techscope draft standard v1; benchmark repo and runtime docs checked 2026-05-27
retrieved: 2026-05-27
verified: 2026-05-27
valid_for: Agents Mother harness and runtime-family selection from 2026-05-27 onward
temporal_status: current
---

# Standard: agent-harness-evaluation

Status: draft
Owner: Techscope/user
Last reviewed: 2026-05-27

## Rule

Do not choose a coding-agent harness or local-model stack from popularity,
anecdotes or a single benchmark winner. Choose it with a small, task-relevant
eval pack that measures the exact work the new agent must do.

Exact rankings of OpenCode, Pi, Hermes, OpenClaw, Codex or any future harness
are temporal snapshots. Preserve the evaluation method, not the leaderboard.

## Use when

- choosing a runtime family for a new agent;
- considering OpenCode, Pi, Hermes, OpenClaw or another non-Codex harness;
- deciding whether local models are good enough for coding or tool use;
- comparing vLLM, llama.cpp, LM Studio, Ollama or other local backends;
- promoting an experimental harness pattern into a standard.

## Avoid when

- the agent remains Codex-native and no external harness choice is being made;
- the task is too small to justify a benchmark;
- current harness/model versions cannot be verified;
- the eval cannot represent the actual user workflow.

## Required practices

- Define task classes before testing: code repair, repo diagnosis, UI build,
  tool integration, data extraction, memory query, long-running workflow or
  deployment.
- Use fresh workspaces and fresh harness state for each run.
- Keep hidden graders outside the agent-visible workspace.
- Run grading outside the agent container or process.
- Track `passed`, `failed`, `timeout`, `runner_error` and `infra_error`
  separately.
- Track elapsed time, token usage where available, number of repair iterations
  and manual interventions.
- Include at least one applied end-to-end task similar to the future agent's real
  work.
- Store benchmark config, model id, quantization, inference backend, harness
  version, date and hardware/runtime context.
- Recheck official docs before using any concrete harness/model ranking.
- Do not treat local model success on narrow tasks as proof that it is safe for
  planning, security review, deployment or high-risk tool use.

## Recommended minimal eval pack

For Agents Mother-created coding agents, use:

- one small hidden-grader bugfix task;
- one repo-diagnosis/root-cause task;
- one multi-file feature task;
- one task involving the intended interface or local service adapter;
- one applied product task with real completion criteria.

For non-coding agents, replace coding tasks with the agent's true workload but
keep isolation, hidden checks, timeout/error taxonomy and run metadata.

## Evaluation dimensions

| Dimension | What to record |
| --- | --- |
| Quality | pass/fail, hidden grader result, user-visible correctness |
| Time | elapsed time, timeout, stuck loops |
| Cost | token usage, local compute time, paid API calls |
| Recovery | number of repair iterations, ability to fix own mistakes |
| Integration | local endpoint, filesystem, browser, UI, API or deployment success |
| Operability | logs, healthcheck, restartability, repeatability |
| Safety | tool permissions, isolation, untrusted-input handling |

## Temporal validity

- Source published: 2026-05-26.
- Source updated: 2026-05-27.
- Source version: Techscope draft standard v1; benchmark repo and runtime docs
  checked 2026-05-27.
- Retrieved: 2026-05-27.
- Verified: 2026-05-27.
- Valid for: Agents Mother harness and runtime-family selection from 2026-05-27
  onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: target harnesses, local model families, vLLM, llama.cpp,
  OpenAI-compatible endpoint behavior, tool calling, pricing, context limits or
  hardware assumptions change.

## Related decisions

- `04_standards/agent-creation-harness.md`
- `04_standards/agent-runtime-placement.md`
- `04_standards/agent-tool-integration-selection.md`
