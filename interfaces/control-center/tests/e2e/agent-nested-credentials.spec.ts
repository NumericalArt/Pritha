import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

for(const provider of ['neuraldeep','openrouter','anthropic'])test(`${provider}: saves and removes a nested provider key through the real card API on desktop and mobile`, async ({ page }) => {
  test.setTimeout(120000);
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe("1");
  const root = path.join(process.env.PRITHA_AGENT_PARENT!, "fixture-managed");
  mkdirSync(path.join(root, "operations"), { recursive: true });
  mkdirSync(path.join(root, "mvp"), { recursive: true });
  const manifest = path.join(root, "operations/manifest.json");
  const env = path.join(root, "mvp/.env.local");
  const canary = `${provider==='openrouter'?'sk-or-':provider==='anthropic'?'sk-ant-':'sk-'}synthetic-browser-fixture-7139`,name=provider.toUpperCase()+'_API_KEY';
  const label={neuraldeep:'NeuralDeep',openrouter:'OpenRouter',anthropic:'Anthropic'}[provider];
  const baseUrl={neuraldeep:'https://api.neuraldeep.ru/v1',openrouter:'https://openrouter.ai/api/v1',anthropic:'https://api.anthropic.com/v1'}[provider],modelId={neuraldeep:'qwen3.8-27b',openrouter:'vendor/model',anthropic:'claude-sonnet-5-5'}[provider];
  writeFileSync(manifest, JSON.stringify({ local_upstream_url: "http://127.0.0.1:9", credentials: [{ name, label: label+" API key", provider, required: true, validation: "format", storage_target: "mvp/.env.local", browser_exposure: "server_only",provider_configuration:{base_url:baseUrl,model_id:modelId},note:'Selected model: '+modelId+'. API: '+baseUrl+'. Child-owned key only.' }] }));
  writeFileSync(env, "DATABASE_URL=synthetic-database-fixture\nASSISTANT_ENABLED=false\n", { mode: 0o600 });
  try {
    for (const viewport of [{ width: 1440, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/agents");
      const response = await page.request.get("/api/status");
      const agent = (await response.json()).childAgents.find((item: { name: string }) => item.name === "Fixture Managed");
      expect(agent).toBeTruthy();
      const all = page.getByRole("button", { name: "All", exact: true }).filter({ visible: true });
      if (await all.count()) await all.first().click();
      await page.locator(`[data-testid="agent-credentials-button"][data-agent-id="${agent.id}"]:visible`).click();
      const panel = page.getByTestId("credentials-panel");
      await expect(panel).toContainText("mvp/.env.local");
      await expect(panel).toContainText(label!);
      await expect(panel).toContainText("Selected model: "+modelId);
      const stale=await page.request.put(`/api/agents/${agent.id}/credentials/${name}`,{data:{value:canary,expectedProviderConfiguration:{modelId:'changed-model',baseUrl,storageTarget:'mvp/.env.local'}}});
      expect(stale.status()).toBe(409);
      expect(readFileSync(env,'utf8')).not.toContain(name+'=');
      const input = panel.locator('input[type="password"]');
      await expect(input).toBeEnabled();
      await input.fill(canary);
      const savedResponse = page.waitForResponse(r => r.request().method() === "PUT" && r.url().includes("/credentials/"+name));
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      const saved = await savedResponse;
      expect(saved.ok()).toBeTruthy();
      expect(await saved.text()).not.toContain(canary);
      await expect(input).toHaveValue("");
      await expect(panel).toContainText("••••7139");
      expect(readFileSync(env, "utf8")).toContain(`${name}=${canary}`);
      expect(readFileSync(env, "utf8")).toContain(`${provider.toUpperCase()}_BASE_URL=${baseUrl}`);
      expect(readFileSync(env, "utf8")).toContain(`${provider.toUpperCase()}_MODEL=${modelId}`);
      expect(readFileSync(env, "utf8")).toContain("ASSISTANT_ENABLED=false");
      await expect(panel).not.toContainText("synthetic-database-fixture");
      page.once("dialog", dialog => dialog.accept());
      await panel.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(panel).toContainText("Not configured");
      expect(readFileSync(env, "utf8")).not.toContain(name+"=");
      await panel.getByRole("button", { name: "Close credentials panel" }).click();
    }
  } finally {
    rmSync(manifest, { force: true }); rmSync(path.join(root, "mvp"), { force: true, recursive: true });
  }
});
