// Compile the actual Task Chat page; intercept all HTTP in the browser. No
// runtime, model turn, production build swap or local server is started.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(appRoot, "package.json"));
const { webpack } = require("next/dist/compiled/webpack/webpack");
const output = mkdtempSync(path.join(os.tmpdir(), "pritha-budget-intent-ui-"));
const loader = path.join(output, "typescript-loader.cjs");
writeFileSync(loader, `const ts = require(${JSON.stringify(require.resolve("typescript"))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; };`);
const entry = path.join(output, "entry.tsx");
writeFileSync(entry, `import { createRoot } from "react-dom/client";
import { CodexChatPage } from ${JSON.stringify(path.join(appRoot, "src/components/codex/CodexChatPage.tsx"))};
createRoot(document.getElementById("root")).render(<CodexChatPage />);`);
await new Promise((resolve, reject) => {
  const compiler = webpack({
    mode: "production", target: "web", entry, output: { path: output, filename: "bundle.js" }, optimization: { minimize: false },
    resolve: { extensions: [".tsx", ".ts", ".js"], modules: [path.join(appRoot, "node_modules")], alias: { "@": path.join(appRoot, "src") } },
    module: { rules: [{ test: /\.tsx?$/, use: [loader] }] },
  });
  compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const bundle = readFileSync(path.join(output, "bundle.js"));
const styles = readFileSync(path.join(appRoot, "src/styles/tokens.css"), "utf8") + readFileSync(path.join(appRoot, "src/styles/globals.css"), "utf8").replace('@import "./tokens.css";', "");
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/bundle.js"></script></html>`;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], requests = [], turnRequests = [];
    const receipts = new Set();
    let loseReply = true;
    page.on("pageerror", error => errors.push(error.message));
    const now = new Date().toISOString();
    const thread = { chatId: "chat_fixture", title: "Проверка бюджета", preview: "Сохранённый результат", group: "my_chats", origin: "chat", status: "idle", activeFlags: [], taskLinks: [], archived: false, historyKind: "native", createdAt: now, updatedAt: now, runtime: { providerId: "desktop_bundled", compatibility: "bound" }, continuationState: "continuation_enabled" };
    const runtime = { preferredProvider: "auto", effectiveProvider: "desktop_bundled", availability: "ready", providers: [{ providerId: "desktop_bundled", label: "Fixture runtime", locationLabel: "Desktop bundled", protocol: "app_server", availability: "ready", capabilities: { fullChat: true, goalControl: true }, stateIdentityHash: "fixture" }], models: [{ id: "fixture", inputModalities: ["text"] }], selected: { modelId: "fixture", sandboxMode: "read_only" } };
    let goal = { availability: "available", objective: "Завершить согласованного агента", status: "budgetLimited", tokensUsed: 120, tokenBudget: 100, revision: "a".repeat(64), pendingRequest: null };
    const savedTurn = { turnId: "saved_turn", status: "completed", userMessage: { id: "user", markdown: "Согласованный план" }, items: [{ id: "answer", kind: "assistant_message", status: "completed", message: { id: "answer", markdown: "Реализация сохранена. Осталось проверить результат.", status: "completed" } }], startedAt: now, pendingRequestIds: [] };
    await page.route("http://127.0.0.1/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return route.fulfill({ contentType: url.pathname === "/bundle.js" ? "text/javascript" : "text/html", body: url.pathname === "/bundle.js" ? bundle : html });
      if (url.pathname === "/api/health") return route.fulfill({ json: { schema: "pritha-control-center-health-v2", ok: true, service: "pritha-control-center", status: "ready", instance: { id: "fixture", port: 3420 }, release: { commit: "fixture", buildId: "fixture" } } });
      if (url.pathname.endsWith("/events")) return route.fulfill({ contentType: "text/event-stream", body: ": ready\n\n" });
      let data;
      if (url.pathname.endsWith("/goal/intent")) {
        assert.equal(request.method(), "POST");
        const input = request.postDataJSON(); requests.push(input);
        assert.equal(request.headers()["idempotency-key"], input.clientMessageId);
        if (!receipts.has(input.clientMessageId)) {
          receipts.add(input.clientMessageId);
          goal = { ...goal, tokenBudget: goal.tokenBudget + 100, revision: "b".repeat(64) };
        }
        if (loseReply) { loseReply = false; return route.abort("connectionfailed"); }
        data = goal;
      } else if (url.pathname.endsWith("/turns") && request.method() === "POST") {
        const input = request.postDataJSON(); turnRequests.push(input);
        data = { turn: { ...savedTurn, turnId: input.clientMessageId, clientMessageId: input.clientMessageId, userMessage: { id: input.clientMessageId, markdown: input.input[0].text } }, streamUrl: "/api/codex-chat/v1/threads/chat_fixture/events" };
      } else if (url.pathname.endsWith("/ui-activity")) data = { ok: true };
      else {
        assert.equal(request.method(), "GET", url.pathname);
        data = url.pathname.endsWith("/goal") ? goal : url.pathname.endsWith("/runtime") ? runtime
          : url.pathname.endsWith("/threads") ? { data: [thread], nextCursor: null }
            : url.pathname.endsWith("/turns") ? { data: [savedTurn], olderCursor: null }
              : { thread, continuationState: "continuation_enabled", pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat_fixture/events", history: { state: "available", recoverable: false } };
      }
      await route.fulfill({ json: { apiVersion: "1", requestId: "fixture-response", data } });
    });
    await page.goto("http://127.0.0.1/task-chat?chat=chat_fixture&group=my_chats");
    await expect(page.getByText("Реализация сохранена. Осталось проверить результат.", { exact: true })).toBeVisible();
    await expect(page.locator("summary")).toContainText("120 / 100");
    const composer = page.locator("textarea");
    await composer.fill("Добавь 100 токенов");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".codex-error-banner")).toContainText("Укажите объект");
    assert.equal(requests.length, 0);
    assert.equal(turnRequests.length, 0);
    await composer.fill("Добавь 100 токенов к бюджету этой задачи");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Check and retry same message" })).toBeVisible();
    await page.getByRole("button", { name: "Check and retry same message" }).click();
    await expect(page.locator("summary")).toContainText("120 / 200");
    await expect(page.getByText("Task budget updated: 120 / 200 tokens.", { exact: true })).toBeVisible();
    await expect(composer).toHaveValue("");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(turnRequests.length, 0);
    await composer.fill('"Добавь 100 токенов к бюджету этой задачи"');
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(composer).toHaveValue("");
    assert.equal(requests.length, 2, "a quotation must not mutate the budget");
    assert.equal(turnRequests.length, 1, "a quotation remains ordinary conversation");
    await page.reload();
    await expect(page.locator("summary")).toContainText("120 / 200");
    await expect(page.getByText("Реализация сохранена. Осталось проверить результат.", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, `budget-intent-${width}.png`), fullPage: true });
    results.push({ width, passed: true, budgetRequests: requests.length, budgetMutations: receipts.size, ordinaryTurns: turnRequests.length });
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(path.join(output, "result.json"), JSON.stringify({ mode: "actual-page-mocked-http-no-server", results }, null, 2));
console.log(JSON.stringify({ output, results }));
