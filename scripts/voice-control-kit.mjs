#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const KIT_REL = "11_agents/reference-implementations/fespa26-voice-control";
const KIT_DIR = path.join(ROOT, KIT_REL);
const MANIFEST_PATH = path.join(KIT_DIR, "manifest.json");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function manifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function walkFiles(dir, prefix = "") {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const fullPath = path.join(dir, name);
    const rel = path.join(prefix, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkFiles(fullPath, rel));
    } else {
      files.push({ path: rel, bytes: stat.size });
    }
  }
  return files;
}

function usage() {
  console.log(`Usage:
  node scripts/voice-control-kit.mjs plan
  node scripts/voice-control-kit.mjs list
  node scripts/voice-control-kit.mjs copy --target <child-agent> [--force]

Pritha alias:
  node scripts/pritha.mjs voice-kit plan
  node scripts/pritha.mjs voice-kit copy --target ../child-agent`);
}

function plan() {
  const data = manifest();
  console.log("Pritha voice-control kit");
  console.log(`Reference: ${KIT_REL}`);
  console.log(`Status: ${data.status}`);
  console.log(`Source: ${data.source_version}`);
  console.log("");
  console.log("Use when:");
  for (const item of data.use_when) console.log(`- ${item}`);
  console.log("");
  console.log("Lanes:");
  for (const item of data.lanes) console.log(`- ${item}`);
  console.log("");
  console.log("Adaptation checklist:");
  for (const item of data.required_adaptation) console.log(`- ${item}`);
  console.log("");
  console.log("Commands:");
  for (const [name, command] of Object.entries(data.commands)) {
    console.log(`- ${name}: ${command}`);
  }
}

function list() {
  const files = walkFiles(KIT_DIR);
  for (const file of files) {
    console.log(`${file.path}\t${file.bytes}`);
  }
}

function copyToTarget(options) {
  const target = String(options.target || "").trim();
  if (!target) {
    throw new Error("Missing --target <child-agent>");
  }
  const targetRoot = path.resolve(ROOT, target);
  const destination = path.join(targetRoot, "interfaces", "realtime-voice", "fespa26-reference");
  if (existsSync(destination) && !options.force) {
    throw new Error(`Destination already exists: ${destination}. Pass --force to replace it.`);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(KIT_DIR, destination, { recursive: true, force: Boolean(options.force) });
  writeFileSync(
    path.join(path.dirname(destination), "README.md"),
    `# Realtime Voice Interface

This interface was initialized from Pritha's FESPA26 voice-control reference pack.

Start here:

- \`fespa26-reference/README.md\`
- \`fespa26-reference/manifest.json\`
- \`fespa26-reference/source/\`

Adapt the reference before wiring it into runtime code. Replace FESPA-specific
repositories, env prefixes, prompts and tool schemas with this agent's contract.
`,
    { flag: options.force ? "w" : "wx" },
  );
  console.log(`Copied voice-control reference to ${path.relative(ROOT, destination)}`);
}

function main() {
  const command = process.argv[2] || "plan";
  const options = parseArgs(process.argv.slice(3));
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Voice-control kit manifest not found: ${MANIFEST_PATH}`);
  }
  if (command === "help") {
    usage();
    return;
  }
  if (command === "plan") {
    plan();
    return;
  }
  if (command === "list") {
    list();
    return;
  }
  if (command === "copy" || command === "init") {
    copyToTarget(options);
    return;
  }
  throw new Error(`Unknown voice-control-kit command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
