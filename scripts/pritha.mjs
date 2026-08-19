#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { loadEnv, loadEnvFile } from "./lib/env.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const root = resolveTechscopeRoot();
loadEnv({ root });
if (process.env.PRITHA_STATE_ROOT) {
  loadEnvFile(path.join(path.resolve(process.env.PRITHA_STATE_ROOT), "config", "runtime.env"));
}

await import("./agents-mother/index.mjs");
