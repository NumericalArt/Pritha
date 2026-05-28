---
id: 2026-05-16-openai-realtime-audio-models-source-note
type: source-note
status: processed
created: 2026-05-16
updated: 2026-05-16
topics: [openai, audio-models, realtime-api, voice-agents, transcription, translation, tool-use, safety]
tools: [openai, gpt-realtime-2, gpt-realtime-translate, gpt-realtime-whisper, realtime-api, agents-sdk]
source_type: article
source_url: https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/
sources:
  - https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/
  - https://www.youtube.com/watch?v=JOu8v6CBjkE
related:
  intakes:
    - 00_inbox/links/2026-05-16-youtube-openai-three-audio-models-api-intake.md
  assessments:
    - 03_reviews/2026-05-16-2026-05-16-youtube-openai-three-audio-models-api-intake-auto-assessment.md
  signals:
    - 01_sources/signals/2026-05-16-youtube-transcript-we-re-introducing-three-audio-models-in-the-api-signal.md
  workflows:
    - 07_workflows/media-intake-processing.md
---

# Source Note: OpenAI realtime audio models

Date added: 2026-05-16
Source: https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/
Author: OpenAI
Published: 2026-05-07
Status: processed

## Why this source matters

Это официальный первоисточник OpenAI для видео `JOu8v6CBjkE`. Он важнее демо-видео как evidence base, потому что фиксирует model names, intended use cases, safety notes, pricing and availability.

## Source summary

OpenAI announced three realtime audio models in the API:

- `GPT-Realtime-2`: voice model for live voice agents that can reason, handle tool calls, recover during conversation and keep users informed while work is happening.
- `GPT-Realtime-Translate`: live translation model for multilingual voice experiences, supporting 70+ input languages and 13 output languages.
- `GPT-Realtime-Whisper`: streaming speech-to-text model for low-latency live transcription.

The article frames realtime audio around three product patterns: voice-to-action, systems-to-voice and voice-to-voice.

## Key ideas for Techscope

- Voice agents need more than natural audio: they need context management, recovery behavior, tool transparency, user-facing preambles and safety guardrails.
- Realtime voice agents can keep conversation active while reasoning and calling tools in the background.
- Preambles are a UX and safety mechanism: they tell the user what the agent is doing during latency or tool calls.
- Live transcription can become infrastructure for meetings, support, healthcare, sales, recruiting and agent memory capture.
- Live translation is relevant for multilingual support agents, education and media workflows.
- Voice interfaces raise privacy, consent, data residency and harmful-use questions earlier than text-only agents.

## Verification notes

- Primary source is official OpenAI, published 2026-05-07.
- The video demo shows two models: `GPT-Realtime-Translate` and `GPT-Realtime-2`.
- The official article also includes `GPT-Realtime-Whisper`, pricing and safety details.
- Before any implementation decision, verify current API docs, model IDs, pricing and regional availability in OpenAI platform documentation.

## Open questions

- Should Techscope create a voice-agent-interface standard?
- What local privacy and consent rules are required before storing or processing user speech?
- Do we need a standard pattern for preambles/tool transparency in voice agents?
- Should realtime transcription become an intake path for meetings and spoken notes?
