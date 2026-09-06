// Actual component + styles, mocked HTTP boundary; no server or model is started.
// Run: node interfaces/control-center/tests/goal-budget-panel-browser.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(appRoot, "package.json"));
const compiled = require("next/dist/compiled/webpack/webpack");
const { webpack } = compiled;
const output = mkdtempSync(path.join(os.tmpdir(), "pritha-goal-ui-"));
const loader = path.join(output, "typescript-loader.cjs");
writeFileSync(loader, `const ts = require(${JSON.stringify(require.resolve("typescript"))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; };`);
const entry = path.join(output, "entry.tsx");
writeFileSync(entry, `import { createRoot } from "react-dom/client";
import { GoalBudgetPanel } from ${JSON.stringify(path.join(appRoot, "src/components/codex/GoalBudgetPanel.tsx"))};
const root = createRoot(document.getElementById("root"));
window.renderFixture = (props = {}) => root.render(<main style={{height:"100dvh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
  <header style={{padding:16}}><strong>Task Chat · проверка продолжения</strong></header>
  <GoalBudgetPanel key={props.chatId || "chat_fixture"} chatId="chat_fixture" active={false} editable={true} refreshKey={0} {...props} />
  <section aria-label="Saved history" style={{flex:1,minHeight:0,overflow:"auto",padding:16}}><p>Пользователь: создаём агента по согласованному плану.</p><p>Pritha: реализация сохранена, осталось завершить проверки.</p></section>
  <footer style={{padding:16}}><textarea aria-label="Message" placeholder="Продолжить разговор…" style={{width:"100%"}} /></footer>
</main>);
window.renderFixture();`);
await new Promise((resolve, reject) => {
  const compiler = webpack({
    mode: "production", target: "web", entry, output: { path: output, filename: "bundle.js" },
    optimization: { minimize: false },
    resolve: { extensions: [".tsx", ".ts", ".js"], modules: [path.join(appRoot, "node_modules")], alias: { "@": path.join(appRoot, "src") } },
    module: { rules: [{ test: /\.tsx?$/, use: [loader] }] },
  });
  compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const bundle = readFileSync(path.join(output, "bundle.js"));
const styles = readFileSync(path.join(appRoot, "src/styles/tokens.css"), "utf8") + readFileSync(path.join(appRoot, "src/styles/globals.css"), "utf8").replace('@import "./tokens.css";', "");
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div id="root"></div><script src="/bundle.js"></script></html>`;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const initial = { availability: "available", objective: "Завершить создание агента и проверить согласованный результат", status: "budgetLimited", tokensUsed: 120, tokenBudget: 100, revision: "a".repeat(64), pendingRequest: null };
    let goal = structuredClone(initial), loseReply = false;
    const requests = [], receipts = new Map();
    await page.route("http://127.0.0.1/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/goal")) {
        if (route.request().method() === "POST") {
          const request = route.request().postDataJSON(); requests.push(request);
          if (!receipts.has(request.requestId)) {
            receipts.set(request.requestId, request);
            goal = { ...goal, tokenBudget: request.mode === "add" ? goal.tokenBudget + request.tokens : request.tokens, status: request.resume ? "active" : goal.status, revision: "b".repeat(64), pendingRequest: null };
          }
          if (loseReply) { loseReply = false; await route.abort("connectionfailed"); return; }
        }
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "response-fixture", data: goal }) }); return;
      }
      await route.fulfill({ contentType: url.pathname === "/bundle.js" ? "text/javascript" : "text/html", body: url.pathname === "/bundle.js" ? bundle : html });
    });
    await page.goto("http://127.0.0.1/");
    await expect(page.locator("summary")).toContainText("120 / 100");
    const input = page.getByLabel("Токены", { exact: true });
    for (const draft of ["", "12x", "-1"]) {
      await input.fill(draft);
      await page.getByRole("button", { name: "Применить бюджет" }).click();
      await expect(page.getByRole("alert")).toContainText("положительное целое");
      await expect(input).toHaveValue(draft);
    }
    assert.equal(requests.length, 0);
    await input.fill("100");
    await page.screenshot({ path: path.join(output, `budget-${viewport.width}.png`), fullPage: true });
    loseReply = true;
    await page.getByRole("button", { name: "Применить бюджет" }).click();
    await expect(page.getByRole("alert")).toContainText("Подтверждение не получено");
    await expect(input).toBeDisabled();
    await page.getByRole("button", { name: "Проверить изменение" }).click();
    await expect(page.locator("summary")).toContainText("120 / 200");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1], "Uncertain retries must preserve the exact request");
    assert.equal(receipts.size, 1);

    // A persisted pending request is recovered after a full page reload.
    const pending = { requestId: "saved-request", expectedRevision: goal.revision, mode: "set", tokens: 400, resume: false };
    goal = { ...goal, status: "paused", pendingRequest: pending };
    await page.reload();
    await expect(input).toHaveValue("400");
    await expect(input).toBeDisabled();
    await page.getByRole("button", { name: "Проверить изменение" }).click();
    await expect(page.locator("summary")).toContainText("120 / 400");
    assert.deepEqual(requests.at(-1), pending);
    await expect(page.getByRole("region", { name: "Saved history" })).toContainText("реализация сохранена");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();

    await page.evaluate(() => window.renderFixture({ active: true }));
    await expect(input).toBeDisabled();
    await expect(page.getByRole("button", { name: "Применить бюджет" })).toBeDisabled();
    await page.evaluate(() => window.renderFixture({ editable: false }));
    await expect(input).toBeDisabled();

    goal = { ...goal, status: "usageLimited" };
    await page.evaluate(() => window.renderFixture({ refreshKey: 1 }));
    await expect(page.locator("summary")).toContainText("Лимит аккаунта");
    // A quota-limited user can still choose a budget-only change.
    const checkbox = page.getByRole("checkbox");
    await checkbox.check();
    await expect(page.getByRole("button", { name: "Применить бюджет" })).toBeDisabled();
    await checkbox.uncheck();
    await expect(page.getByRole("button", { name: "Применить бюджет" })).toBeEnabled();
    await input.fill("500");
    await page.getByRole("button", { name: "Применить бюджет" }).click();
    await expect(page.locator("summary")).toContainText("120 / 500");
    assert.equal(requests.at(-1).resume, false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    results.push({ viewport, passed: true, requests: requests.length, screenshots: [`budget-${viewport.width}.png`] });
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(path.join(output, "result.json"), JSON.stringify({ mode: "actual-component-mocked-http-no-server", results }, null, 2));
console.log(JSON.stringify({ output, results }));
