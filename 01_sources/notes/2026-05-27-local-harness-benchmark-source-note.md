---
id: 2026-05-27-local-harness-benchmark-source-note
type: source-note
status: processed
created: 2026-05-27
updated: 2026-05-27
topics:
  - agent-harness
  - local-models
  - coding-agent-benchmark
  - harness-evaluation
tools:
  - OpenCode
  - Pi
  - Hermes
  - OpenClaw
  - vLLM
  - llama.cpp
  - Qwen
  - Gemma
sources:
  - https://www.youtube.com/watch?v=bXRQsQmgAYo
  - 01_sources/raw/youtube-bXRQsQmgAYo/bXRQsQmgAYo-whisper-small.md
  - https://github.com/Zux1U/microbench_16
  - https://docs.vllm.ai/en/latest/
  - https://github.com/ggml-org/llama.cpp
  - https://opencode.ai/docs/providers/
  - https://github.com/earendil-works/pi
  - https://docs.qwencloud.com/developer-guides/getting-started/vision-models
related:
  intakes:
    - 00_inbox/links/2026-05-27-youtube-local-harness-benchmark-intake.md
  briefs:
    - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  reviews:
    - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
  standards:
    - 04_standards/agent-harness-evaluation.md
---

# Source Note: Local Harness Benchmark

Date: 2026-05-27
Status: processed

## Source snapshot

- Video: `СРАВНЕНИЕ топовых Harness на локальных моделях:Opencode, Pi, Hermes, OpenClaw`
- Channel: ServerFlow AI Lab - R&D в области ИИ и LLM
- YouTube id: `bXRQsQmgAYo`
- Source URL: https://www.youtube.com/watch?v=bXRQsQmgAYo
- Published: 2026-05-26
- Duration: 10:23
- Local transcript: `01_sources/raw/youtube-bXRQsQmgAYo/bXRQsQmgAYo-whisper-small.md`
- ASR note: final transcript generated with `--language ru`. First accidental
  English-language pass was discarded.

## What happens in the video

ServerFlow compares four coding-agent harnesses for local LLM workflows:
OpenCode, Pi, Hermes and OpenClaw. The comparison has two parts:

- a 16-task benchmark with SQL, Python, C, C++, Rust and ML-infrastructure
  tasks;
- an applied task where the agent builds an n8n-like low-code workflow editor
  with local LLM calls through vLLM.

The benchmark design is the main reusable signal:

- each task gets its own starter folder, prompt and hidden grader;
- the agent receives only the working directory and task statement;
- hidden graders are not mounted into the container;
- each run uses a fresh workspace and fresh harness state;
- the harness runs in a container;
- grading runs outside the container after the harness exits;
- timeout is fixed at 1200 seconds per task;
- results separate passed, failed, timeout/runner errors and infra errors;
- aggregate quality is considered together with average task time.

## Useful extracted claims

- Harness quality differences can be smaller than model/backend differences.
- Model plus inference backend plus harness must be evaluated as a stack.
- vLLM can appear faster, but speed can be affected by serving settings such as
  speculative decoding/MTP, not just the harness.
- OpenAI-compatible local endpoints are a practical common interface for local
  model benchmark runners.
- Exact winners are version-bound. In the video, OpenClaw/OpenCode/Pi/Hermes
  show different strengths across quality, speed, token use and applied UI task
  recovery.
- Applied tasks expose failure modes that small coding benchmarks miss:
  loops, broken environment setup, missing final output, incomplete UI state,
  local model connection failures and excessive token spend.

## Verification against current sources

- The linked `microbench_16` GitHub repo exists and describes a benchmark with
  16 tasks, deterministic hidden graders, host-side result JSON, containerized
  harness runs and OpenAI-compatible local model servers.
- The repo README says graders are not mounted into the harness container and
  host-side grading decides pass/fail.
- vLLM docs are current and include OpenAI-compatible serving, benchmarking and
  inference-server documentation.
- llama.cpp is an active local inference project.
- OpenCode docs state that it supports 75+ providers and local models, including
  OpenAI-compatible/custom endpoints.
- Pi's current GitHub repo describes Pi as an agent harness monorepo with coding
  agent CLI, agent runtime, multi-provider LLM API, TUI/web UI libraries and vLLM
  pods.
- QwenCloud docs currently list Qwen3.6-35B-A3B and Qwen3.6-27B entries.

## Source-quality notes

- Strong: benchmark structure and repo design.
- Moderate: relative ranking of harnesses in this one benchmark and one applied
  task.
- Weak: any universal claim that a specific harness is "best".
- Version-bound: model names, quantization, vLLM/llama.cpp behavior, tool calling
  and harness internals.

## Noise filtered out

- Treating one small benchmark as a final harness ranking.
- Treating token counts or timing from one local setup as portable cost numbers.
- Treating visual prototype quality as equivalent to production readiness.
