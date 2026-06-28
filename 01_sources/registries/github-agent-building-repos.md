---
id: github-agent-building-repos
type: review
status: active
created: 2026-06-26
updated: 2026-06-28
topics:
  - agent-building-knowledge
  - github-research
tools:
  - github
sources: []
related:
  workflows: []
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: pritha
  id: github-knowledge-radar
privacy: project
retention: durable
review_status: active
confidence: medium
---

# GitHub Agent-Building Repository Registry

This registry stores candidate open-source repositories that may improve Pritha's knowledge about building, evaluating, operating, or securing agents.

Safety rule: entries are candidates for review only. Do not clone, install, execute, or trust repository code until a separate review artifact accepts that action.

| Repo | Topics | Status | Added | Last checked | Stars | Why | Notes |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `https://github.com/Forward-Future/loopy` | agent-loops; agent-skills; loop-library | accepted-for-review | 2026-06-28 | 2026-06-28 | 1,982 | Loop lifecycle skill and public loop catalog for bounded repeatable agent workflows. | Source video linked `Forward-Future/loop-library`; GitHub redirects to `Forward-Future/loopy`. MIT. Inspect before installing skills. |
| `https://github.com/calesthio/OpenMontage` | multimedia-agents; video-production; agent-skills; pipelines | accepted-for-review | 2026-06-28 | 2026-06-28 | 26,723 | Agentic video production system with instruction-driven YAML pipelines, skills and provider tools. | AGPL-3.0. Useful as architecture/reference corpus; license and provider-key review required before reuse. |
| `https://github.com/bytedance/deer-flow` | agent-harness; memory; sandbox; skills; gateway; subagents | accepted-for-review | 2026-06-28 | 2026-06-28 | 75,202 | Long-horizon super-agent harness with backend/frontend split, memory, skills, MCP/gateway and sandbox patterns. | MIT. High-value architecture reference; do not treat as default runtime without evals. |
| `https://github.com/mukul975/Anthropic-Cybersecurity-Skills` | agent-skills; cybersecurity; dual-use; skill-corpus | candidate | 2026-06-28 | 2026-06-28 | 22,566 | Large mapped cybersecurity skill corpus useful for skill schema/security research. | Apache-2.0. Dual-use executable scripts; quarantine until explicit security contract and scanner review. |
| `https://github.com/heygen-com/hyperframes` | multimedia-agents; html-to-video; agent-skills; mcp | accepted-for-review | 2026-06-28 | 2026-06-28 | 31,945 | HTML-to-video framework and skill layer for agent-authored videos. | Apache-2.0. Hosted MCP is a separate authenticated service boundary; CLI/runtime need media-agent contract. |
| `https://github.com/DeusData/codebase-memory-mcp` | code-intelligence; mcp; code-memory; tree-sitter | accepted-for-review | 2026-06-28 | 2026-06-28 | 19,321 | Static binary code graph/MCP server candidate for codebase memory and structural queries. | MIT. Compare to Pritha Markdown/SQLite memory; inspect binary/package supply chain before use. |
| `https://github.com/mattpocock/skills` | agent-skills; engineering-workflows; tdd; debugging | accepted-for-review | 2026-06-28 | 2026-06-28 | 149,169 | Compact practical engineering skill pack with strong invocation and procedure guidance. | MIT. External skills remain candidate-only until pinned, scanned and eval-covered. |
| `https://github.com/garrytan/gstack` | agent-skills; browser-automation; qa; workflow-suite | accepted-for-review | 2026-06-28 | 2026-06-28 | 117,673 | Broad AI engineering skill suite plus browser automation/security patterns. | MIT. Large runtime/install surface; useful for pattern study, not direct activation. |
| `https://github.com/baidu/Unlimited-OCR` | ocr; document-ai; local-models; parsing | candidate | 2026-06-28 | 2026-06-28 | 11,496 | One-shot long-horizon OCR/model inference reference for future document agents. | MIT. Heavy model/runtime needs; minimal harness code. Evaluate only for document/OCR contracts. |
| `https://github.com/NVIDIA/SkillSpector` | skill-security; scanner; mcp; supply-chain-security | accepted-for-review | 2026-06-28 | 2026-06-28 | 11,246 | Security scanner for AI agent skills with CLI/MCP, static patterns, LLM analysis and reports. | Apache-2.0. Strong candidate for future Pritha external skill review gate. |
| `https://github.com/palmier-io/palmier-pro` | multimedia-agents; native-app; mcp; video-editor | candidate | 2026-06-28 | 2026-06-28 | 9,290 | macOS AI-native video editor showing localhost MCP and timeline tool-executor patterns. | GPL-3.0; macOS 26/Apple Silicon and service/account coupling. Reference only unless selected by contract. |
| `https://github.com/NousResearch/hermes-agent` | agent-runtime; gateway; memory; skills; cron; mcp | accepted-for-review | 2026-06-28 | 2026-06-28 | 204,886 | Broad personal agent runtime; current code refresh confirms gateway, memory, cron, skills and Codex bridge patterns. | MIT. Already has prior Pritha artifacts; this row preserves current repository snapshot. |
| `https://github.com/jamiepine/voicebox` | voice-ai; tts; stt; mcp; local-desktop-agent | accepted-for-review | 2026-06-28 | 2026-06-28 | 35,346 | Local voice I/O studio with FastAPI backend, Tauri app and MCP speak/transcribe/profile tools. | MIT. Good reference for future voice child-agent modules; model/runtime privacy review required before adoption. |
