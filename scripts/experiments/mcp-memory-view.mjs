// Explicit local prototype, never a Control Center or production server.
import http from "node:http";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const option = (key) => args[args.indexOf(key) + 1];
if (!args.includes("--workspace") || !args.includes("--run-dir")) throw new Error("Specify isolated --workspace and --run-dir");
const workspace = resolve(option("--workspace"));
const runDir = resolve(option("--run-dir"));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const req = createRequire(join(workspace, "package.json"));
const { build } = req("esbuild");
const { Client } = req("@modelcontextprotocol/client");
const { McpServer } = req("@modelcontextprotocol/server");
const { registerAppTool, registerAppResource, getUiCapability, RESOURCE_MIME_TYPE } = req("@modelcontextprotocol/ext-apps/server");
const { z } = req("zod");
await mkdir(runDir, { recursive: true, mode: 0o700 });
const schema = z.object({ query: z.string().trim().min(1).max(500), domain: z.enum(["agent-building-knowledge", "pritha-self", "governance"]), limit: z.number().int().min(1).max(5) }).strict();
const audit = { version: "pritha-memory-pilot/0.1", sdk: "ext-apps/2.0.3; MCP/2.3.1", negotiated: [], allowed: 0, denied: 0, uiRequests: [], browserChecks: [] };
const saveAudit = () => writeFile(join(runDir, "mcp-view-result.json"), JSON.stringify(audit, null, 2), { mode: 0o600 });
const viewSource = `
import { App } from '@modelcontextprotocol/ext-apps';
const app = new App({name:'Pritha memory view',version:'0.1'},{});
const el=id=>document.getElementById(id); let current=[],revision=0;
function render(r){const data=r.structuredContent; current=data.results; el('results').replaceChildren();el('source').textContent='';
 for(const row of current){const li=document.createElement('li');const b=document.createElement('button');b.textContent=row.title+' — '+row.status;b.onclick=()=>{el('source').textContent=row.path+'\\n'+row.sections.map(s=>s.heading+'\\n'+s.text).join('\\n\\n');};li.append(b);el('results').append(li);}
 el('status').textContent='Найдено: '+current.length+'; domain: '+data.domain;}
app.ontoolresult=render;
await app.connect();el('status').textContent='MCP Apps: соединение установлено';
el('go').onclick=async()=>{const intent=++revision;el('status').textContent='Поиск…';try{const result=await app.callServerTool({name:'memory_search',arguments:{query:el('query').value,domain:el('domain').value,limit:5}});if(intent===revision)render(result);}catch(e){if(intent===revision)el('status').textContent='Отклонено: '+e.message;}};
el('deny').onclick=async()=>{try{await app.callServerTool({name:'memory_rebuild',arguments:{}});el('deny-result').textContent='FAIL: unexpected permission';}catch(e){el('deny-result').textContent='PASS: memory_rebuild отклонён host';}};
el('private').onclick=async()=>{try{await app.callServerTool({name:'memory_search',arguments:{query:'SYNTHETIC_PRIVATE_VIOLET_729',domain:'user-model',limit:5}});el('private-result').textContent='FAIL';}catch(e){el('private-result').textContent='PASS: user-model отклонён host';}};
el('network').onclick=async()=>{try{await fetch('http://127.0.0.1:1/forbidden');el('network-result').textContent='FAIL';}catch(e){el('network-result').textContent='PASS: соединение заблокировано';}};
`;
const hostSource = `
import { AppBridge,PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const el=id=>document.getElementById(id); let bridge;
async function mount(){if(bridge){await bridge.teardownResource({},{timeout:1500}).catch(()=>{});await bridge.close();}el('slot').replaceChildren();
const resource=await (await fetch('/resource')).json();const frame=document.createElement('iframe');frame.title='Pritha memory explorer';frame.setAttribute('sandbox','allow-scripts');frame.style.width='100%';frame.style.height='700px';
bridge=new AppBridge(null,{name:'Pritha isolated pilot host',version:'0.1'},{serverTools:{},logging:{}},{hostContext:{theme:'light'}});
bridge.oncalltool=async p=>{const r=await fetch('/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});if(!r.ok)throw new Error('host allowlist denied');return r.json();};
bridge.oninitialized=()=>{el('status').textContent='Host: MCP Apps handshake завершён';};
el('slot').append(frame);await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));frame.srcdoc=resource.contents[0].text;}
el('reload').onclick=mount;el('fallback').onclick=async()=>{const r=await (await fetch('/fallback')).json();el('text-fallback').textContent=r.content[0].text;};await mount();
`;
const bundle = async (source) => (await build({ stdin: { contents: source, resolveDir: workspace, sourcefile: "pilot.js" }, bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", nodePaths: [join(workspace, "node_modules")] })).outputFiles[0].text;
const [viewJs, hostJs] = await Promise.all([bundle(viewSource), bundle(hostSource)]);
const viewNonce = randomBytes(18).toString("base64");
const viewCsp = `default-src 'none'; script-src 'nonce-${viewNonce}'; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`;
const viewHtml = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${viewCsp}"><h2>Память Pritha — MCP Apps pilot</h2><p id="status" role="status">Подключение…</p><div id="search"><label>Запрос <input id="query" value="Codex SDK App Server"></label><label>Домен <select id="domain"><option>agent-building-knowledge</option><option>pritha-self</option><option>governance</option></select></label><button id="go" type="button">Найти</button></div><ul id="results"></ul><pre id="source"></pre><button id="deny">Проверить запрет rebuild</button><p id="deny-result"></p><button id="private">Проверить запрет user-model</button><p id="private-result"></p><button id="network">Проверить запрет сети</button><p id="network-result"></p><script type="module" nonce="${viewNonce}">${viewJs.replaceAll("</script", "<\\/script")}</script></html>`;
const ui = "ui://pritha-memory/view.html";
const search = async (input) => {
  const params = schema.parse(input);
  const { stdout } = await exec(process.env.PRITHA_PYTHON || "python3", [join(root, "scripts/memory-retrieve.py"), params.query, "--domain", params.domain, "--limit", String(params.limit), "--json"], { cwd: root, maxBuffer: 1024 * 1024, timeout: 10000, env: { ...process.env, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" } });
  const data = JSON.parse(stdout);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
};
function linkedPair() {
  const a = { async start() {}, async close() { a.onclose?.(); }, async send(m) { queueMicrotask(() => b.onmessage?.(structuredClone(m))); } };
  const b = { async start() {}, async close() { b.onclose?.(); }, async send(m) { queueMicrotask(() => a.onmessage?.(structuredClone(m))); } };
  return [a, b];
}
async function connect(uiEnabled) {
  const server = new McpServer({ name: "pritha-memory-pilot", version: "0.1" });
  const meta = { ui: { resourceUri: ui, visibility: ["model", "app"] } };
  const toolConfig = { description: "Read scoped public curated knowledge", inputSchema: schema, annotations: { readOnlyHint: true, destructiveHint: false } };
  if (uiEnabled) registerAppTool(server, "memory_search", { ...toolConfig, _meta: meta }, search);
  else server.registerTool("memory_search", toolConfig, search);
  registerAppResource(server, "Memory View", ui, { _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } }, () => ({ contents: [{ uri: ui, mimeType: RESOURCE_MIME_TYPE, text: viewHtml, _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } }] }));
  const client = new Client({ name: "pritha-memory-pilot-host", version: "0.1" }, { capabilities: uiEnabled ? { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [RESOURCE_MIME_TYPE] } } } : {} });
  const [a, b] = linkedPair();
  await server.connect(a); await client.connect(b);
  audit.negotiated.push({ uiEnabled, serverSeesUi: !!getUiCapability(server.server.getClientCapabilities()) });
  return { client, server };
}
const enhanced = await connect(true), plain = await connect(false);
const sample = { query: "Codex SDK App Server", domain: "agent-building-knowledge", limit: 5 };
const enhancedResult = await enhanced.client.callTool({ name: "memory_search", arguments: sample });
const plainResult = await plain.client.callTool({ name: "memory_search", arguments: sample });
audit.plainToolHasNoUiMetadata = !(await plain.client.listTools()).tools[0]._meta?.ui;
audit.textFallbackEqual = JSON.stringify(enhancedResult.structuredContent) === JSON.stringify(plainResult.structuredContent);
audit.resourceMime = (await enhanced.client.readResource({ uri: ui })).contents[0].mimeType;
async function dispatch(p) {
  if (p.name !== "memory_search") throw new Error("Tool denied");
  schema.parse(p.arguments);
  return enhanced.client.callTool(p);
}
for (const bad of [{ name: "memory_rebuild", arguments: {} }, { name: "command/exec", arguments: {} }, { name: "memory_search", arguments: { ...sample, domain: "user-model" } }, { name: "memory_search", arguments: { ...sample, path: "../sibling" } }, { name: "memory_search", arguments: { ...sample, limit: 99 } }]) {
  try { await dispatch(bad); throw new Error("Deny test failed"); } catch (error) { if (error.message === "Deny test failed") throw error; audit.denied++; }
}
const hostNonce = randomBytes(18).toString("base64");
// srcdoc inherits the parent's CSP in addition to its own stricter policy.
const hostCsp = `default-src 'none'; script-src 'nonce-${hostNonce}' 'nonce-${viewNonce}'; connect-src 'self'; frame-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;
const hostHtml = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Pritha MCP Apps — isolated pilot</title><h1>MCP Apps: просмотр памяти Pritha</h1><p>Локальный исследовательский host 0.1 · ext-apps 2.0.3</p><p id="status" role="status">Подключение…</p><button id="reload">Перезагрузить View</button><button id="fallback">Показать текстовый fallback</button><pre id="text-fallback"></pre><div id="slot"></div><script type="module" nonce="${hostNonce}">${hostJs.replaceAll("</script", "<\\/script")}</script></html>`;
const server = http.createServer(async (request, response) => {
  const json = (value, code = 200) => { response.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); response.end(JSON.stringify(value)); };
  try {
    if (request.headers.host !== `127.0.0.1:${server.address().port}`) return json({ error: "host denied" }, 403);
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": hostCsp, "Cache-Control": "no-store" }); return response.end(hostHtml); }
    if (request.method === "GET" && url.pathname === "/resource") return json(await enhanced.client.readResource({ uri: ui }));
    if (request.method === "GET" && url.pathname === "/fallback") return json(await plain.client.callTool({ name: "memory_search", arguments: sample }));
    if (request.method === "POST" && url.pathname === "/call") {
      if (request.headers.origin !== `http://127.0.0.1:${server.address().port}`) return json({ error: "origin denied" }, 403);
      let raw = ""; for await (const chunk of request) { raw += chunk; if (raw.length > 5000) return json({ error: "body too large" }, 413); }
      const p = JSON.parse(raw); audit.uiRequests.push({ tool: p.name, domain: p.arguments?.domain });
      try { const r = await dispatch(p); audit.allowed++; await saveAudit(); return json(r); } catch { audit.denied++; await saveAudit(); return json({ error: "host allowlist denied" }, 403); }
    }
    return json({ error: "route denied" }, 404);
  } catch { return json({ error: "pilot request failed" }, 400); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
audit.url = `http://127.0.0.1:${server.address().port}`;
await saveAudit(); console.log(JSON.stringify({ status: "ready", url: audit.url, fallback: audit.textFallbackEqual, denyTests: audit.denied }));
const close = async () => { await saveAudit(); server.close(); await enhanced.client.close(); await plain.client.close(); process.exit(0); };
process.on("SIGTERM", close); process.on("SIGINT", close);
setTimeout(close, 15 * 60 * 1000).unref();
