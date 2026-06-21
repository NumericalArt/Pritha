import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";

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

function runHealth(baseUrl) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/control-center-health.mjs", "--base-url", baseUrl, "--json"], {
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
    if (request.url === "/api/health") return jsonResponse(response, 200, { ok: true });
    if (["/voice", "/agents", "/settings"].includes(request.url)) {
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
    assert.equal(payload.pages.length, 3);
    assert.equal(payload.chunks.length, 1);
  });
});

test("control-center health fails when rendered HTML points at a missing chunk", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/health") return jsonResponse(response, 200, { ok: true });
    if (["/voice", "/agents", "/settings"].includes(request.url)) {
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

test("control-center health skips cleanly when the server is not running", async () => {
  const result = await runHealth("http://127.0.0.1:9");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "skipped");
});
