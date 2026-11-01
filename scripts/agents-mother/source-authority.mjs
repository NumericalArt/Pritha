// Reviewed primary-source policy from the pinned NeuralDeep repository.
const authority={
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
};
// Curated public entry points, never URLs copied from operator text or a search snippet.
const primaryUrls={
 'node-http-runtime':['https://nodejs.org/api/http.md','https://nodejs.org/api/http.html'],
 'neuraldeep-model-api':['https://neuraldeep.ru/llms-full.txt'],
 'interface-runtime-security':['https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html','https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS'],
 'untrusted-input-security':['https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html'],
 'wikipedia-api':['https://www.mediawiki.org/wiki/API:Search','https://www.mediawiki.org/wiki/API:Etiquette'],
 'sqlite-storage':['https://sqlite.org/lang_transaction.html','https://nodejs.org/api/sqlite.html'],
};

export function sourceAuthority(topics) {
 return topics.filter(topic=>topic.required!==false).map(topic=>({...topic,
  primaryDomains:authority[topic.id] || [],primaryUrls:primaryUrls[topic.id] || []}));
}
