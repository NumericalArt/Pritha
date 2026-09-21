import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import { credentialFilePath, normalizeCredentialTarget, readCredentialFile, updateCredentialFile } from "../scripts/lib/credential-store.mjs";
import { readProjectMetadataAsync } from "../scripts/agents-mother/project-metadata-async.mjs";

const server = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");
const tree = ts.createSourceFile("server.ts", server, ts.ScriptTarget.Latest, true);
function loadProduction(names, dependencies) {
  const declarations = names.map(name => tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree).replace(/^export /, ""));
  const code = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
}
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-credential-store-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(path.join(root, "mvp")); mkdirSync(path.join(root, "operations"));
  writeFileSync(path.join(root, "operations/manifest.json"), JSON.stringify({ credentials: [{ name: "NEURALDEEP_API_KEY", label: "NeuralDeep", storage_target: "mvp/.env.local", provider: "generic", required: true }] }));
  writeFileSync(path.join(root, ".env.local"), "ROOT_API_KEY=root-fixture-private\n");
  writeFileSync(path.join(root, "mvp/.env.local"), "DATABASE_URL=postgres://fixture\nASSISTANT_ENABLED=false\n", { mode: 0o600 });
  return root;
}

test("nested stores are explicit, bounded, private, and preserve the surrounding configuration", async t => {
  const root = fixture(t);
  const before = readCredentialFile(root, "mvp/.env.local");
  updateCredentialFile(root, "mvp/.env.local", text => text + "NEURALDEEP_API_KEY=synthetic-fixture-key\n");
  assert.equal(readCredentialFile(root, "mvp/.env.local"), before + "NEURALDEEP_API_KEY=synthetic-fixture-key\n");
  assert.equal(readFileSync(path.join(root, ".env.local"), "utf8"), "ROOT_API_KEY=root-fixture-private\n");
  assert.equal(statSync(path.join(root, "mvp/.env.local")).mode & 0o777, 0o600);
  const backupDir = path.join(root, "mvp/.env.local.backups");
  assert.equal(statSync(backupDir).mode & 0o777, 0o700);
  assert.equal(readFileSync(path.join(backupDir, readdirSync(backupDir).find(name => name.endsWith(".bak"))), "utf8"), before);
  const metadata = await readProjectMetadataAsync(root);
  assert.equal(metadata.credentialStores["mvp/.env.local"].status, "read");
  assert.match(metadata.credentialStores["mvp/.env.local"].text, /synthetic-fixture-key/);
  assert.equal(metadata.credentialStores["unknown/.env.local"], undefined);
});

test("traversal, non-env targets and symlink directories/files/backups fail closed", async t => {
  const root = fixture(t);
  for (const target of ["../.env.local", "/tmp/.env.local", "mvp/../.env.local", "mvp/.env", "mvp\\.env.local", "mvp//.env.local", ".git/.env.local", "mvp/.env.local/child"])
    assert.equal(normalizeCredentialTarget(target), null, target);
  symlinkSync(path.join(root, "mvp"), path.join(root, "linked"));
  assert.throws(() => credentialFilePath(root, "linked/.env.local"));
  const manifest = { credentials: [{ name: "NEURALDEEP_API_KEY", storage_target: "linked/.env.local" }] };
  writeFileSync(path.join(root, "operations/manifest.json"), JSON.stringify(manifest));
  const metadata = await readProjectMetadataAsync(root);
  assert.equal(metadata.credentialStores["linked/.env.local"].status, "unavailable");
  symlinkSync(path.join(root, "operations"), path.join(root, "mvp/.env.local.backups"));
  assert.throws(() => updateCredentialFile(root, "mvp/.env.local", () => "CHANGED=true\n"));
  assert.doesNotMatch(readCredentialFile(root, "mvp/.env.local"), /CHANGED/);
  rmSync(path.join(root, "mvp/.env.local"));
  symlinkSync(path.join(root, ".env.local"), path.join(root, "mvp/.env.local"));
  assert.throws(() => readCredentialFile(root, "mvp/.env.local"));
});

test("production credential projection and CRUD share the declared nested target, without disclosing values", async t => {
  const root = fixture(t);
  let agent;
  const refresh = async () => {
    const metadata = await readProjectMetadataAsync(root);
    agent = { id: "fixture", name: "BOZYAWA", folder: { status: "present", relativePath: path.basename(root) }, credentials: api.credentialsForAgent(path.dirname(root), { absolutePath: root }, metadata.manifest.manifest, metadata) };
    return agent;
  };
  const api = loadProduction([
    "isSecretName", "providerForSecretName", "isCredentialLikeName", "defaultSecretLabel", "defaultSecretValidation", "defaultBrowserExposure", "defaultRequiredForSecret", "secretDefinitionFromManifest", "envExampleSecretNames", "secretDefinitionFromEnvExample", "mergeSecretDefinitions", "unquoteEnvValue", "parseEnvValues", "quoteEnvValue", "upsertEnvValue", "removeEnvValue", "maskSecretValue", "credentialStorage", "credentialsForAgent", "findCredential", "safeSecretInput", "setAgentCredentialSecret", "removeAgentCredentialSecret", "validateSecretFormat", "validateAgentCredentialSecret",
  ], {
    path, normalizeCredentialTarget, credentialFilePath, readCredentialFile, updateCredentialFile,
    relativePath: (base, file) => path.relative(base, file),
    getControlCenterStatus: async () => { await refresh(); return { root: path.dirname(root), childAgents: [agent] }; },
    selectAgent: agents => agents[0], resolveAgentFolderPath: () => root,
    getControlCenterAgent: async () => ({ agent: await refresh() }),
  });
  await refresh();
  assert.equal(agent.credentials.storage.target, "mvp/.env.local");
  assert.equal(agent.credentials.definitions[0].canWrite, true);
  const dry = await api.setAgentCredentialSecret("fixture", "NEURALDEEP_API_KEY", "synthetic-canary-secret-9362", { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.doesNotMatch(readCredentialFile(root, "mvp/.env.local"), /9362/);
  const saved = await api.setAgentCredentialSecret("fixture", "NEURALDEEP_API_KEY", "synthetic-canary-secret-9362");
  assert.equal(saved.secret.configured, true);
  assert.equal(saved.secret.maskedValue, "••••9362");
  assert.doesNotMatch(JSON.stringify([saved, agent.credentials]), /synthetic-canary-secret|root-fixture-private|postgres:\/\/fixture/);
  assert.equal((await api.validateAgentCredentialSecret("fixture", "NEURALDEEP_API_KEY")).secret.configured, true);
  await assert.rejects(() => api.setAgentCredentialSecret("fixture", "NEURALDEEP_API_KEY", "bad\nOTHER=1"), /invalid_secret_value/);
  await api.removeAgentCredentialSecret("fixture", "NEURALDEEP_API_KEY");
  const remaining = readCredentialFile(root, "mvp/.env.local");
  assert.match(remaining, /^DATABASE_URL=postgres:\/\/fixture\nASSISTANT_ENABLED=false\n/);
  assert.doesNotMatch(remaining, /NEURALDEEP_API_KEY|synthetic-canary-secret/);
  assert.equal(agent.credentials.status, "pending_auth");
});
