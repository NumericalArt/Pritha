#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { now, today } from "./lib/date.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const REGISTRY_PATH = path.join(ROOT, "01_sources", "registries", "github-agent-building-repos.md");
const argv = process.argv.slice(2);
const command = argv.find((arg) => !arg.startsWith("-")) || "status";
const jsonMode = argv.includes("--json");
const onlineMode = argv.includes("--online");

const TOPIC_QUERIES = {
  "agent-harness": [
    "agent framework harness tool calling stars:>25",
    "AI agent framework TypeScript MCP stars:>25",
    "LLM agent memory tools workflow stars:>25",
  ],
  "agent-memory": [
    "AI agent memory vector database workflow stars:>25",
    "LLM memory retrieval agent stars:>25",
  ],
  "agent-evals": [
    "LLM agent evals benchmark harness stars:>25",
    "AI agent evaluation framework tool use stars:>25",
  ],
  "mcp-tools": [
    "MCP server tools agent framework stars:>25",
    "model context protocol agent tools stars:>25",
  ],
};

function argValue(name, fallback = "") {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) return fallback;
  return argv[index + 1];
}

function hasFlag(name) {
  return argv.includes(name);
}

function registryRelativePath() {
  return path.relative(ROOT, REGISTRY_PATH);
}

function registryTemplate() {
  const date = today();
  return `---
id: github-agent-building-repos
type: review
status: active
created: ${date}
updated: ${date}
topics:
  - agent-building-knowledge
  - github-research
tools:
  - github
sources: []
related:
  workflows: []
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: pritha
  id: github-knowledge-radar
privacy: project
retention: durable
review_status: active
confidence: medium
---

# GitHub Agent-Building Repository Registry

This registry stores candidate open-source repositories that may improve Pritha's knowledge about building, evaluating, operating, or securing agents.

Safety rule: entries are candidates for review only. Do not clone, install, execute, or trust repository code until a separate review artifact accepts that action.

| Repo | Topics | Status | Added | Last checked | Stars | Why | Notes |
| --- | --- | --- | --- | --- | ---: | --- | --- |
`;
}

function ensureRegistry(write = false) {
  if (existsSync(REGISTRY_PATH)) return true;
  if (!write) return false;
  mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, registryTemplate());
  return true;
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function normalizeRepoUrl(value) {
  const source = String(value || "").trim();
  const match = source.match(/github\.com[:/]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    fullName: `${match[1]}/${match[2]}`,
    url: `https://github.com/${match[1]}/${match[2]}`,
  };
}

function parseTopics(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function registryRows() {
  if (!existsSync(REGISTRY_PATH)) return [];
  const text = readFileSync(REGISTRY_PATH, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => /^\|\s*https:\/\/github\.com\//i.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        repo: cells[0] || "",
        topics: cells[1] || "",
        status: cells[2] || "",
        added: cells[3] || "",
        lastChecked: cells[4] || "",
        stars: Number.parseInt(cells[5] || "0", 10) || 0,
        why: cells[6] || "",
        notes: cells[7] || "",
      };
    });
}

function statusPayload() {
  const exists = ensureRegistry(false);
  const rows = registryRows();
  const byStatus = rows.reduce((acc, row) => {
    acc[row.status || "unknown"] = (acc[row.status || "unknown"] || 0) + 1;
    return acc;
  }, {});
  return {
    schema: "pritha-github-knowledge-radar-status-v1",
    generatedAt: now(),
    root: ROOT,
    registryPath: registryRelativePath(),
    exists,
    status: exists ? "ready" : "not_initialized",
    candidates: rows.length,
    byStatus,
    safety: "Registry stores candidate links only; no clone/install/run is performed.",
  };
}

function initRegistry() {
  ensureRegistry(true);
  return {
    ...statusPayload(),
    status: "ready",
    initialized: true,
  };
}

function registerRepo() {
  const repoInput = argValue("--repo") || argValue("--url");
  const repo = normalizeRepoUrl(repoInput);
  if (!repo) {
    return {
      schema: "pritha-github-knowledge-radar-register-v1",
      generatedAt: now(),
      ok: false,
      status: "invalid_repo",
      detail: "Use --repo https://github.com/OWNER/REPO",
    };
  }

  ensureRegistry(true);
  const existing = registryRows().find((row) => normalizeRepoUrl(row.repo)?.url.toLowerCase() === repo.url.toLowerCase());
  if (existing) {
    return {
      schema: "pritha-github-knowledge-radar-register-v1",
      generatedAt: now(),
      ok: true,
      status: "already_registered",
      repo,
      registryPath: registryRelativePath(),
      existing,
    };
  }

  const topics = parseTopics(argValue("--topics") || argValue("--topic") || "agent-building-knowledge");
  const why = argValue("--why", "Candidate for agent-building knowledge review.");
  const notes = argValue("--notes", "Needs source review before adoption.");
  const status = argValue("--status", "candidate");
  const stars = Number.parseInt(argValue("--stars", "0"), 10) || 0;
  const row = `| ${repo.url} | ${escapeCell(topics.join(", "))} | ${escapeCell(status)} | ${today()} | ${today()} | ${stars} | ${escapeCell(why)} | ${escapeCell(notes)} |\n`;
  const previous = readFileSync(REGISTRY_PATH, "utf8");
  writeFileSync(REGISTRY_PATH, previous.endsWith("\n") ? `${previous}${row}` : `${previous}\n${row}`);
  return {
    schema: "pritha-github-knowledge-radar-register-v1",
    generatedAt: now(),
    ok: true,
    status: "registered",
    repo,
    registryPath: registryRelativePath(),
  };
}

function plannedQueries(topic) {
  return TOPIC_QUERIES[topic] || [
    `${topic} AI agent framework stars:>25`,
    `${topic} LLM agent tools memory stars:>25`,
  ];
}

function normalizeGitHubApiItem(item) {
  const repo = normalizeRepoUrl(item.html_url || item.url || "");
  if (!repo) return null;
  return {
    repo,
    description: item.description || "",
    stars: Number(item.stargazers_count || item.stars || 0),
    language: item.language || "",
    updatedAt: item.updated_at || item.updatedAt || "",
    topics: Array.isArray(item.topics) ? item.topics : [],
  };
}

async function fetchGitHubSearch(query, limit) {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(Math.min(Math.max(limit, 1), 25)));
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "pritha-github-knowledge-radar",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function searchCandidates() {
  const topic = argValue("--topic") || argValue("--topics") || "agent-harness";
  const limit = Number.parseInt(argValue("--limit", "5"), 10) || 5;
  const queries = plannedQueries(topic);
  const fixturePath = process.env.PRITHA_GITHUB_RADAR_FIXTURE;
  let source = "planned";
  let candidates = [];
  let error = "";

  try {
    if (fixturePath) {
      source = "fixture";
      const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
      const items = Array.isArray(fixture) ? fixture : fixture.items || [];
      candidates = items.map(normalizeGitHubApiItem).filter(Boolean).slice(0, limit);
    } else if (onlineMode) {
      source = "github-api";
      const seen = new Set();
      for (const query of queries) {
        const result = await fetchGitHubSearch(query, limit);
        const items = (result.items || []).map(normalizeGitHubApiItem).filter(Boolean);
        for (const item of items) {
          const key = item.repo.url.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(item);
          if (candidates.length >= limit) break;
        }
        if (candidates.length >= limit) break;
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return {
    schema: "pritha-github-knowledge-radar-search-v1",
    generatedAt: now(),
    ok: !error,
    status: error ? "failed" : candidates.length ? "candidates_found" : "planned",
    topic,
    source,
    online: onlineMode,
    plannedQueries: queries,
    candidates,
    error,
    safety: "Search results are candidates only. Register links before review; do not clone or run repository code from this command.",
  };
}

function printPayload(payload, exitCode = 0) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${payload.schema}\n`);
    process.stdout.write(`status: ${payload.status}\n`);
    if (payload.registryPath) process.stdout.write(`registry: ${payload.registryPath}\n`);
    if (payload.candidates != null) process.stdout.write(`candidates: ${payload.candidates.length ?? payload.candidates}\n`);
  }
  process.exitCode = exitCode;
}

let payload;
let exitCode = 0;

switch (command) {
  case "status":
    payload = statusPayload();
    break;
  case "init":
    payload = initRegistry();
    break;
  case "register":
    payload = registerRepo();
    exitCode = payload.ok ? 0 : 1;
    break;
  case "search":
    payload = await searchCandidates();
    exitCode = payload.ok ? 0 : 1;
    break;
  default:
    payload = {
      schema: "pritha-github-knowledge-radar-error-v1",
      generatedAt: now(),
      ok: false,
      status: "unknown_command",
      command,
      availableCommands: ["status", "init", "register", "search"],
    };
    exitCode = 1;
}

printPayload(payload, exitCode);
