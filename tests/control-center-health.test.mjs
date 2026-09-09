import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import http from "node:http";

const healthRouteSource = readFileSync("interfaces/control-center/src/app/api/health/route.ts", "utf8");

test("Control Center health contract reports v2 ready identity without private paths", () => {
  assert.match(healthRouteSource, /pritha-control-center-health-v2/);
  assert.match(healthRouteSource, /status:\s*"ready"/);
  assert.match(healthRouteSource, /instance:/);
  assert.match(healthRouteSource, /release:/);
  assert.doesNotMatch(healthRouteSource, /status:\s*"experimental"/);
  assert.doesNotMatch(healthRouteSource, /stateRoot|codeRoot|OPENAI_API_KEY/);
});

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    const closed = once(server, "close");
    server.close();
    await closed;
  }
}

function runHealth(baseUrl, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn("node", [
      "scripts/control-center-health.mjs",
      "--base-url",
      baseUrl,
      "--json",
      ...extraArgs,
    ], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ status: code ?? 1, stdout, stderr });
    });
  });
}

function jsonResponse(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function htmlResponse(response, scriptPath) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><html><body><script src="${scriptPath}"></script></body></html>`);
}

test("control-center health passes when rendered pages reference served JavaScript chunks", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/health") return jsonResponse(response, 200, {
      schema: "pritha-control-center-health-v2",
      ok: true,
      service: "pritha-control-center",
      status: "ready",
      instance: { id: "fixture", role: "developer", port: Number(request.headers.host?.split(":").at(-1)) },
      release: { commit: "abcdef123456", buildId: "fixture-build" },
    });
    if (["/voice", "/agents", "/task-chat", "/codex", "/settings"].includes(request.url)) {
      return htmlResponse(response, "/_next/static/chunks/current.js");
    }
    if (request.url === "/_next/static/chunks/current.js") {
      response.writeHead(200, { "content-type": "application/javascript; charset=UTF-8" });
      response.end("window.__PRITHA_TEST_CHUNK__ = true;");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }, async (baseUrl) => {
    const result = await runHealth(baseUrl);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "pritha-control-center-health-v1");
    assert.equal(payload.status, "pass");
    assert.equal(payload.pages.length, 5);
    assert.equal(payload.chunks.length, 1);
  });
});

test("control-center health fails when rendered HTML points at a missing chunk", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/health") return jsonResponse(response, 200, {
      schema: "pritha-control-center-health-v2",
      ok: true,
      service: "pritha-control-center",
      status: "ready",
      instance: { id: "fixture", role: "developer", port: Number(request.headers.host?.split(":").at(-1)) },
      release: { commit: "abcdef123456", buildId: "fixture-build" },
    });
    if (["/voice", "/agents", "/task-chat", "/codex", "/settings"].includes(request.url)) {
      return htmlResponse(response, "/_next/static/chunks/stale.js");
    }
    if (request.url === "/_next/static/chunks/stale.js") {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("Internal Server Error");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }, async (baseUrl) => {
    const result = await runHealth(baseUrl);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, "fail");
    assert.ok(payload.checks.some((item) => item.id.includes("stale.js") && item.status === "fail"));
  });
});

test("control-center health retries one transient page response when requested", async () => {
  let voiceAttempts = 0;
  await withServer((request, response) => {
    if (request.url === "/api/health") return jsonResponse(response, 200, {
      schema: "pritha-control-center-health-v2",
      ok: true,
      service: "pritha-control-center",
      status: "ready",
      instance: { id: "fixture", role: "developer", port: Number(request.headers.host?.split(":").at(-1)) },
      release: { commit: "abcdef123456", buildId: "fixture-build" },
    });
    if (request.url === "/voice" && voiceAttempts++ === 0) {
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("temporarily unavailable");
      return;
    }
    if (request.url === "/voice" && voiceAttempts === 2) {
      return setTimeout(() => htmlResponse(response, "/_next/static/chunks/current.js"), 2100);
    }
    if (["/voice", "/agents", "/task-chat", "/codex", "/settings"].includes(request.url)) {
      return htmlResponse(response, "/_next/static/chunks/current.js");
    }
    if (request.url === "/_next/static/chunks/current.js") {
      response.writeHead(200, { "content-type": "application/javascript; charset=UTF-8" });
      response.end("window.__PRITHA_TEST_CHUNK__ = true;");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }, async (baseUrl) => {
    const result = await runHealth(baseUrl, ["--retries", "1", "--timeout-ms", "3000"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, "pass");
    assert.equal(voiceAttempts, 2);
    assert.equal(payload.pages.find(page => page.path === "/voice").attempts, 2);
  });
});

test("control-center health skips cleanly when the server is not running", async () => {
  const result = await runHealth("http://127.0.0.1:9");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "skipped");
});

for (const runtimeReady of [true, false]) test(`health checks compiled SQLite readiness before admission: ${runtimeReady}`, async () => {
  await withServer((request, response) => {
    if (request.url === '/api/health') return jsonResponse(response, 200, {
      schema: 'pritha-control-center-health-v2', ok: true, service: 'pritha-control-center', status: 'ready',
      instance: {id:'fixture',role:'developer',port:Number(request.headers.host?.split(':').at(-1))},
      release: {commit:'abcdef123456',buildId:'fixture-build'}, execution:{protocol:1,runtimeReady},
    });
    if (request.url === '/_next/static/chunks/current.js') {
      response.writeHead(200, {'content-type':'application/javascript'});return response.end('window.ready=true;');
    }
    return htmlResponse(response, '/_next/static/chunks/current.js');
  }, async baseUrl => {
    const result=await runHealth(baseUrl,['--strict']);
    assert.equal(result.status,runtimeReady?0:1);
    const payload=JSON.parse(result.stdout);
    assert.equal(payload.checks.find(check=>check.id==='execution-runtime').status,runtimeReady?'pass':'fail');
  });
});

for (const failure of [null, "task-admission", "task-runtime", "agent-catalog", "agent-metadata", "chat-list", "chat-history"]) {
  test(`operational health checks application behavior without sending a message: ${failure || "ready"}`, async () => {
    const requests = [];
    await withServer((request, response) => {
      requests.push({ method: request.method, url: request.url });
      if (request.url === "/api/health") return jsonResponse(response, 200, {
        schema: "pritha-control-center-health-v2", ok: true, service: "pritha-control-center", status: "ready",
        instance: { id: "fixture", role: "developer", port: Number(request.headers.host.split(":").at(-1)) },
        release: { commit: "abcdef123456", buildId: "fixture-build" }, execution: { protocol: 1, runtimeReady: true },
      });
      if (request.url === "/api/codex-chat/v1/activity") return jsonResponse(response, 200, { data: { admissionEnabled: failure !== "task-admission" } });
      if (request.url === "/api/codex-chat/v1/runtime") return jsonResponse(response, 200, { data: { availability: failure === "task-runtime" ? "unavailable" : "ready" } });
      if (request.url === "/api/agents") return jsonResponse(response, 200, { ok: true, agents: [
        { identity: { status: failure === "agent-catalog" ? "conflict" : "identified" },
          operations: { status: failure === "agent-metadata" ? "not_installed" : "disabled" },
          credentials: { warnings: failure === "agent-metadata" ? ["Child-project credential metadata could not be read within the host policy."] : [] } },
      ] });
      if (request.url.startsWith("/api/codex-chat/v1/threads?")) return jsonResponse(response, 200,
        failure === "chat-list" ? {} : { data: { data: [{ chatId: "chat_private_fixture", preview: "PRIVATE_CONTENT" }] } });
      if (request.url === "/api/codex-chat/v1/threads/chat_private_fixture/history?limit=1") return jsonResponse(response,
        failure === "chat-history" ? 503 : 200, { data: { data: [{ text: "PRIVATE_CONTENT" }] } });
      if (request.url === "/_next/static/chunks/current.js") {
        response.writeHead(200, { "content-type": "application/javascript" }); return response.end("window.ready=true;");
      }
      return htmlResponse(response, "/_next/static/chunks/current.js");
    }, async baseUrl => {
      const result = await runHealth(baseUrl, ["--strict", "--operational"]);
      assert.equal(result.status, failure ? 1 : 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(payload.checks.filter(item => item.status === "fail").map(item => item.id), failure ? [failure === "agent-metadata" ? "agent-catalog" : failure] : []);
      assert.ok(requests.every(request => request.method === "GET"));
      assert.doesNotMatch(result.stdout, /PRIVATE_CONTENT|chat_private_fixture/);
    });
  });
}
