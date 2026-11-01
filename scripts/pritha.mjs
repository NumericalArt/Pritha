#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolvePrithaRoot } from "./lib/paths.mjs";

const root = resolvePrithaRoot();
loadPrithaRuntimeEnv({ root });

await import("./agents-mother/index.mjs");
