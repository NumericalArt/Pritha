// Reviewed primary-source policy, initially adopted from the pinned NeuralDeep
// repository. Canonical memory-topic aliases use the same bounded authorities;
// a model-supplied URL never expands this allowlist.
const authority={
 'anthropic-messages-api':['platform.claude.com','docs.anthropic.com'], 'openrouter-model-api':['openrouter.ai'],
 'node-http-runtime':['nodejs.org'], 'neuraldeep-model-api':['neuraldeep.ru','docs.neuraldeep.ru'],
 'openai-agents-sdk':['openai.github.io','platform.openai.com','developers.openai.com'],
 'openai-realtime':['platform.openai.com','developers.openai.com'], 'voice-transport':['developer.mozilla.org','w3.org'],
 'telegram-bot-api':['core.telegram.org'], 'mcp-connectors':['modelcontextprotocol.io'],
 'interface-runtime-security':['developer.mozilla.org','owasp.org','nodejs.org'], 'untrusted-input-security':['owasp.org'],
 'operations-deployment':['nodejs.org','developer.apple.com','freedesktop.org'],
 'wikipedia-api':['mediawiki.org','www.mediawiki.org','api.wikimedia.org','doc.wikimedia.org'],
 'sqlite-storage':['sqlite.org','www.sqlite.org','nodejs.org'],
 'declared-dependencies':['nodejs.org','npmjs.com','docs.npmjs.com','nextjs.org','react.dev','sqlite.org'],
 'github-repository-review':['github.com'], 'local-inference-runtime':['docs.ollama.com','docs.vllm.ai','lmstudio.ai'],
 'memory-rag-storage':['qdrant.tech','docs.lancedb.com','neo4j.com'],
 'codex-editor-isolation':['developers.openai.com','openai.com'],
 'platform-runtime-compatibility':['nodejs.org','docs.python.org','developer.apple.com','learn.microsoft.com'],
 'tailscale':['tailscale.com'],
 'web-ui':['nextjs.org','react.dev','developer.mozilla.org'],
 'oauth-webhook':['oauth.net','datatracker.ietf.org','developer.mozilla.org'],
 'agent-skills-evals':['developers.openai.com','platform.openai.com','platform.claude.com','docs.anthropic.com'],
};
const aliases={
 'mcp-provider':['mcp-connectors'],
 'pattern-openai-realtime-webrtc':['openai-realtime','voice-transport'],
 'pattern-openai':['openai-agents-sdk'],
 'pattern-realtime-webrtc':['openai-realtime','voice-transport'],
 'pattern-voice-speech':['voice-transport','openai-realtime'],
 'pattern-telegram-bot-api':['telegram-bot-api'],
 'pattern-mcp-connector-permissions':['mcp-connectors'],
 'pattern-mcp-connector':['mcp-connectors'],
 'pattern-semantic-embeddings-rag':['memory-rag-storage'],
 'pattern-sqlite':['sqlite-storage'],
 'pattern-nextjs-react':['web-ui'],
 'pattern-launchd-cron':['operations-deployment'],
 'pattern-tailscale':['tailscale'],
 'pattern-oauth-webhook':['oauth-webhook'],
 'pattern-browser-sandbox':['interface-runtime-security','codex-editor-isolation'],
 'pattern-codex':['codex-editor-isolation'],
 'pattern-agents-sdk':['openai-agents-sdk'],
 'pattern-github-repository':['github-repository-review'],
 'pattern-agent-skills-evals':['agent-skills-evals'],
 'pattern-api':['interface-runtime-security'],
};
// Curated public entry points, never URLs copied from operator text or a search snippet.
const primaryUrls={
 'anthropic-messages-api':['https://platform.claude.com/docs/en/api/messages/create'],
 'openrouter-model-api':['https://openrouter.ai/docs/api_reference/overview'],
 'node-http-runtime':['https://nodejs.org/api/http.md','https://nodejs.org/api/http.html'],
 'neuraldeep-model-api':['https://neuraldeep.ru/llms-full.txt'],
 'interface-runtime-security':['https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html','https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS'],
 'untrusted-input-security':['https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html'],
 'wikipedia-api':['https://www.mediawiki.org/wiki/API:Search','https://www.mediawiki.org/wiki/API:Etiquette'],
 'sqlite-storage':['https://sqlite.org/lang_transaction.html','https://nodejs.org/api/sqlite.html'],
};

export function sourceAuthority(topics) {
 return topics.filter(topic=>topic.required!==false).map(topic=>{
  const ids=aliases[topic.id] || [topic.id];
  return {...topic,primaryDomains:[...new Set(ids.flatMap(id=>authority[id] || []))],
   // Broad pattern aliases need a deliberately selected source, not the
   // first unrelated entry point of one of their possible technologies.
   primaryUrls:primaryUrls[topic.id] || []};
 });
}
