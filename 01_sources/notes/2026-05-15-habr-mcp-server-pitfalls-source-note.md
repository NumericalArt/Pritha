---
id: 2026-05-15-habr-mcp-server-pitfalls-source-note
type: source-note
status: processed
created: 2026-05-15
updated: 2026-05-15
topics: [mcp, tool-design, agent-tools, security, oauth, evals, context-management]
tools: [mcp, oauth, claude-desktop, cursor, continue, vscode]
source_type: article
source_url: https://habr.com/ru/companies/bitrix/articles/1009150/
sources:
  - https://habr.com/ru/companies/bitrix/articles/1009150/
related:
  intakes:
    - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
  briefs:
    - 02_briefs/2026-05-15-mcp-server-pitfalls-brief.md
  reviews:
    - 03_reviews/2026-05-15-mcp-server-pitfalls-assessment.md
---

# Source Note: Habr MCP server pitfalls

Date added: 2026-05-15
Source: https://habr.com/ru/companies/bitrix/articles/1009150/
Author: vasilyev, AI team at Bitrix24
Published: 2026-03-16, inferred from Habr current-year display
Status: processed

## Why this source matters

Статья является практическим вторичным источником от команды, которая год работала с MCP-серверами. Она полезна как evidence for operational pitfalls: не как спецификация MCP, а как field report о том, где модель, клиенты MCP и разработчики расходятся в ожиданиях.

## Source summary

Главный тезис: MCP-инструменты являются детерминированной частью AI-стека, но ими управляет недетерминированная LLM. Поэтому MCP-server design должен проектироваться не как обычная API-обертка, а как интерфейс для модели: компактный tool surface, сценарные инструменты, самодостаточные действия, плотные описания, понятные ошибки, evals, ограничения контекста и безопасность по минимальным правам.

## Key takeaways

- OAuth in MCP clients is uneven; pre-authenticated tokens may be the most compatible practical option for now.
- 1:1 API-to-tool mapping is an anti-pattern. Tools should be designed around user intents.
- Long dependent tool chains are brittle. Prefer self-contained high-level tools that accept human-readable parameters.
- Tool and parameter descriptions are the model-facing UI.
- Error messages should explain what failed, why, and what the model can try next.
- Unit tests are insufficient; MCP needs smoke tests, scenario tests and evals that check model tool use.
- MCP expands prompt injection and supply-chain attack surface.
- Tool responses must be small and context-aware.

## Verification notes

- Source is Habr company blog article from Bitrix24.
- It should be compared with official MCP specification and client documentation before becoming a standard.
- The article is especially relevant to Techscope because future agents may use local and remote MCP servers.

## Open questions

- Which MCP client matrix should Techscope support first: Codex, Claude Desktop, Cursor, VS Code, Continue?
- Do we want a local-first MCP policy before remote MCP?
- Should Techscope create a standard `mcp-tool-design.md`?
