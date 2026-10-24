---
id: github-agent-building-repos
type: review
status: active
created: 2026-06-26
updated: 2026-10-21
topics:
  - agent-building-knowledge
  - github-research
tools:
  - github
sources:
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
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

This registry stores candidate public repositories that may improve Pritha's knowledge about building, evaluating, operating, or securing agents. Public availability does not imply an open-source license.

Safety rule: entries are candidates for review only. Do not clone, install, execute, or trust repository code until a separate review artifact accepts that action.

Curated promotion on 2026-10-21 adds ten reference candidates after pinned source review. Their license cells are advisory summaries, not module-local adoption evidence. See the deep review and evidence manifest for exact source/version scope; `accepted-for-review` never authorizes code adoption.

| Repo | Topics | Status | Added | Last checked | Stars | License | Why | Notes |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| `https://github.com/anthropics/claude-agent-sdk-python` | agent-harness; agent-memory | accepted-for-review | 2026-10-21 | 2026-10-21 | 8,316 | MIT | Session-store restore and complete parallel tool history. | v0.2.170; pin `dd27b703647a4f8989ab656f00c85f98090a60fd`. Source/e2e test inspected; wrapper MIT metadata does not cover all runtime terms. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/anthropics/claude-agent-sdk-typescript` | agent-harness; agent-memory | accepted-for-review | 2026-10-21 | 2026-10-21 | 1,827 | Commercial Terms | External SessionStore conformance and Claude Code embedding; custom-tool pilot passed, live loop pending-auth. | v0.3.306; pin `9c59e061a0e49a4a99012218de66915bd407c96d`. Public reference repository; LICENSE.md is Commercial Terms, not an OSS grant. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/deepseek-ai/deepseek-harness` | agent-harness; mcp-tools | accepted-for-review | 2026-10-21 | 2026-10-21 | 256,499 | MIT | Scoped registries, reversible effects and canonical tool output. | dsh-v0.2.1-rc.2; pin `687f282e8625c6b8d11ff58211a90524be2e4317`. Source inspected; developer preview, no audit; not sole security boundary. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/google/agents-cli` | agent-evals; agent-operations | accepted-for-review | 2026-10-21 | 2026-10-21 | 6,133 | Apache-2.0 | Eval scaffold and cloud quality outer-loop reference. | v1.11.0; pin `bea5875e38afd84c5513ff14a9bc739286efe533`. Eval source inspected; do not equate simple response grader with AQuA implementation. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/langchain-ai/deepagents` | agent-harness; agent-memory | accepted-for-review | 2026-10-21 | 2026-10-21 | 30,474 | MIT | Composite storage routing and context/file boundaries. | deepagents==0.7.29; pin `3abfb0abcda658d4b64e74782f3316a11efc3faa`. Source/tests inspected; OSS 0.7.29 differs from managed service v0.9. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/microsoft/agent-framework` | agent-harness; agent-operations | accepted-for-review | 2026-10-21 | 2026-10-21 | 14,246 | MIT | Checkpoint structure, version compatibility and recovery. | python-1.22.0; pin `14229b083a7ef95eeaadf472e1da0367a9f46457`. Source/release inspected; 1.22 affected persisted records cannot be read by older runtime. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/modelcontextprotocol/ext-apps` | mcp-tools; agent-interface | accepted-for-review | 2026-10-21 | 2026-10-21 | 2,990 | mixed MIT/Apache-2.0/CC-BY-4.0 | Negotiated iframe UI, AppBridge and text fallback. | v2.0.3; pin `82221c0c8ce7661efa6771c9d461511b1650495f`. Source/spec/tests inspected; isolated host 0.1 browser pilot passed protocol/allowlist checks; production host unconfirmed. MCP dependency tree pinned to 2.3.1 after audit. Mixed license; no production View deployed. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/openai/codex` | agent-harness; agent-operations | accepted-for-review | 2026-10-21 | 2026-10-21 | 130,243 | Apache-2.0 | App Server schema, native threads, steering and approval lifecycle. | rust-v0.163.0; pin `83086188ae0614bd882818ff1aa23f3194962012`. Source inspected; live interrupt/resume/idempotency pilots passed on installed standalone 0.153.0 and isolated 0.163.0. Global CLI unchanged; full cancelled-tool history not guaranteed. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/openai/openai-agents-js` | agent-harness; agent-voice | accepted-for-review | 2026-10-21 | 2026-10-21 | 3,933 | MIT | Tool correlation, replay safety and failed-attempt usage accounting. | @openai/agents@0.21.0; pin `304e436185ad5d7e54d240896efa728533147cf3`. Source/tests inspected; JS 0.21.0 offline Runner approval/state conformance passed. One controlled OpenAI API comparison passed including state restore; broader contract-specific trials required. JS and Python versions differ. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/openai/openai-agents-python` | agent-harness; agent-evals | accepted-for-review | 2026-10-21 | 2026-10-21 | 30,195 | MIT | Custom loop, sessions and approval-aware compaction. | v0.24.0; pin `17d994bd3045dae71acda676a4ef4762ed8ecd94`. Source/tests inspected; no package executed. Keep pending approval pairs until settled. Review: `03_reviews/2026-10-21-agent-repository-deep-review.md`. Reference-only; no code-adoption grant. |
| `https://github.com/Forward-Future/loopy` | agent-loops; agent-skills; loop-library | accepted-for-review | 2026-06-28 | 2026-06-28 | 1,982 | MIT | Loop lifecycle skill and public loop catalog for bounded repeatable agent workflows. | Source video linked `Forward-Future/loop-library`; GitHub redirects to `Forward-Future/loopy`. Inspect before installing skills. |
| `https://github.com/calesthio/OpenMontage` | multimedia-agents; video-production; agent-skills; pipelines | accepted-for-review | 2026-06-28 | 2026-06-28 | 26,723 | AGPL-3.0 | Agentic video production system with instruction-driven YAML pipelines, skills and provider tools. | Useful as architecture/reference corpus; license and provider-key review required before reuse. |
| `https://github.com/bytedance/deer-flow` | agent-harness; memory; sandbox; skills; gateway; subagents | accepted-for-review | 2026-06-28 | 2026-06-28 | 75,202 | MIT | Long-horizon super-agent harness with backend/frontend split, memory, skills, MCP/gateway and sandbox patterns. | High-value architecture reference; do not treat as default runtime without evals. |
| `https://github.com/mukul975/Anthropic-Cybersecurity-Skills` | agent-skills; cybersecurity; dual-use; skill-corpus | candidate | 2026-06-28 | 2026-06-28 | 22,566 | Apache-2.0 | Large mapped cybersecurity skill corpus useful for skill schema/security research. | Dual-use executable scripts; quarantine until explicit security contract and scanner review. |
| `https://github.com/heygen-com/hyperframes` | multimedia-agents; html-to-video; agent-skills; mcp | accepted-for-review | 2026-06-28 | 2026-06-28 | 31,945 | Apache-2.0 | HTML-to-video framework and skill layer for agent-authored videos. | Hosted MCP is a separate authenticated service boundary; CLI/runtime need media-agent contract. |
| `https://github.com/DeusData/codebase-memory-mcp` | code-intelligence; mcp; code-memory; tree-sitter | accepted-for-review | 2026-06-28 | 2026-06-28 | 19,321 | MIT | Static binary code graph/MCP server candidate for codebase memory and structural queries. | Compare to Pritha Markdown/SQLite memory; inspect binary/package supply chain before use. |
| `https://github.com/mattpocock/skills` | agent-skills; engineering-workflows; tdd; debugging | accepted-for-review | 2026-06-28 | 2026-06-28 | 149,169 | MIT | Compact practical engineering skill pack with strong invocation and procedure guidance. | External skills remain candidate-only until pinned, scanned and eval-covered. |
| `https://github.com/garrytan/gstack` | agent-skills; browser-automation; qa; workflow-suite | accepted-for-review | 2026-06-28 | 2026-06-28 | 117,673 | MIT | Broad AI engineering skill suite plus browser automation/security patterns. | Large runtime/install surface; useful for pattern study, not direct activation. |
| `https://github.com/baidu/Unlimited-OCR` | ocr; document-ai; local-models; parsing | candidate | 2026-06-28 | 2026-06-28 | 11,496 | MIT | One-shot long-horizon OCR/model inference reference for future document agents. | Heavy model/runtime needs; minimal harness code. Evaluate only for document/OCR contracts. |
| `https://github.com/NVIDIA/SkillSpector` | skill-security; scanner; mcp; supply-chain-security | accepted-for-review | 2026-06-28 | 2026-06-28 | 11,246 | Apache-2.0 | Security scanner for AI agent skills with CLI/MCP, static patterns, LLM analysis and reports. | Strong candidate for future Pritha external skill review gate. |
| `https://github.com/palmier-io/palmier-pro` | multimedia-agents; native-app; mcp; video-editor | candidate | 2026-06-28 | 2026-06-28 | 9,290 | GPL-3.0 | macOS AI-native video editor showing localhost MCP and timeline tool-executor patterns. | macOS 26/Apple Silicon and service/account coupling. Reference only unless selected by contract. |
| `https://github.com/NousResearch/hermes-agent` | agent-runtime; gateway; memory; skills; cron; mcp | accepted-for-review | 2026-06-28 | 2026-06-28 | 204,886 | MIT | Broad personal agent runtime; current code refresh confirms gateway, memory, cron, skills and Codex bridge patterns. | Already has prior Pritha artifacts; this row preserves current repository snapshot. |
| `https://github.com/jamiepine/voicebox` | voice-ai; tts; stt; mcp; local-desktop-agent | accepted-for-review | 2026-06-28 | 2026-06-28 | 35,346 | MIT | Local voice I/O studio with FastAPI backend, Tauri app and MCP speak/transcribe/profile tools. | Good reference for future voice child-agent modules; model/runtime privacy review required before adoption. |
| `https://github.com/jakubkrehel/skills` | agent-skills; interface-design; accessibility; ui-review; ux-writing | accepted-for-review | 2026-08-02 | 2026-08-02 | 2,632 | MIT | Seven-skill interface review pack with strong orchestration, domain boundaries and practical UI guidance. | Reference and selective-curation candidate only. No tags, releases, CI or evals; multi-file bundle is not eligible for current Pritha vendoring. Pin inspected commit `a67333399dabbc71d7778962cb9c4fb9b86a00d0`. |
