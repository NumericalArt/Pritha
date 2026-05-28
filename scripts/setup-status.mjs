#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const root = resolveTechscopeRoot();
const argv = process.argv.slice(2);
const args = new Set(argv);
const stateIndex = argv.indexOf("--state");
const statePath = stateIndex >= 0 ? path.resolve(argv[stateIndex + 1] || "") : path.join(root, ".techscope-setup.json");

const payload = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : {
      schema: "techscope-setup-state-v1",
      version: 1,
      status: "not-configured",
      updated: "unknown",
      root,
      statePath,
      sections: {},
      warnings: ["Run: node scripts/setup.mjs"],
    };

if (args.has("--json")) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Pritha setup: ${payload.status}`);
  for (const [name, section] of Object.entries(payload.sections || {})) {
    console.log(`- ${name}: ${section.status}${section.detail ? ` (${section.detail})` : ""}`);
  }
}
