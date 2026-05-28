---
id: 2026-05-27-youtube-local-harness-benchmark-intake
type: intake
status: processed
created: 2026-05-27
updated: 2026-05-27
topics:
  - agent-harness
  - local-models
  - coding-agent-benchmark
  - harness-evaluation
  - openai-compatible-local-endpoint
tools:
  - OpenCode
  - Pi
  - Hermes
  - OpenClaw
  - vLLM
  - llama.cpp
  - Qwen
  - Gemma
source_type: video
source_url: https://www.youtube.com/watch?v=bXRQsQmgAYo
source_published: 2026-05-26
source_updated: 2026-05-26
source_version: YouTube video
retrieved: 2026-05-27
verified: 2026-05-27
temporal_status: current
sources:
  - https://www.youtube.com/watch?v=bXRQsQmgAYo
  - 01_sources/raw/youtube-bXRQsQmgAYo/bXRQsQmgAYo-whisper-small.md
  - https://github.com/Zux1U/microbench_16
related:
  briefs:
    - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  reviews:
    - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
---

# Intake: Local Harness Benchmark

Date added: 2026-05-27
Type: video
Source: https://www.youtube.com/watch?v=bXRQsQmgAYo
Source published: 2026-05-26
Source updated: 2026-05-26
Source version: YouTube video
Retrieved: 2026-05-27
Verified: 2026-05-27
Temporal status: current
Status: processed

## Why this may matter

The video compares OpenCode, Pi, Hermes and OpenClaw with local models on a
small benchmark and an applied n8n-like prototype task. The lasting signal is
not the exact winner, because models, harness versions and local inference
backends change quickly. The useful pattern is how to evaluate a harness under
controlled conditions before using it in an agent project.

## Raw material or link

- YouTube: `СРАВНЕНИЕ топовых Harness на локальных моделях:Opencode, Pi, Hermes, OpenClaw`
- Channel: ServerFlow AI Lab - R&D в области ИИ и LLM
- Duration: 10:23
- Local transcript: `01_sources/raw/youtube-bXRQsQmgAYo/bXRQsQmgAYo-whisper-small.md`
- Benchmark repo from description: https://github.com/Zux1U/microbench_16

## Initial questions

- Which benchmark design practices should Agents Mother reuse?
- How should we treat harness/model ranking claims that age quickly?
- What should be required before choosing OpenCode, Pi, Hermes, OpenClaw or any
  other harness for a new agent?

## Expected output

brief
