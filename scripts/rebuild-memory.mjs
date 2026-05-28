#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import { slug } from "./lib/slug.mjs";

const ROOT = resolveTechscopeRoot();
const MEMORY_DIR = path.join(ROOT, ".memory");
const DB_PATH = path.join(MEMORY_DIR, "techscope.sqlite");
const SCHEMA_PATH = path.join(MEMORY_DIR, "schema.sql");

const INCLUDE_DIRS = [
  "00_inbox",
  "01_sources/notes",
  "01_sources/signals",
  "02_briefs",
  "03_reviews",
  "04_standards",
  "05_decisions",
  "06_subagents",
  "07_workflows",
  "08_templates",
  "10_wiki",
  "11_agents",
];

const RELATION_TYPES = new Set([
  "assessments",
  "intakes",
  "briefs",
  "reviews",
  "decisions",
  "standards",
  "workflows",
  "sources",
  "signals",
  "wiki_pages",
  "templates",
  "agent_contracts",
  "scaffold_reports",
  "agent_test_reports",
  "agent_handoff_reports",
  "agent_operations_reports",
  "agent_deployment_reports",
  "agent_post_creation_reviews",
  "agent_registries",
  "supersedes",
  "superseded_by",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "NULL";
  return String(Number(value));
}

function runSql(sql) {
  execFileSync("sqlite3", [DB_PATH], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      out.push(...listMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      out.push(fullPath);
    }
  }
  return out;
}

function extractTitle(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function extractSummary(body) {
  const summaryMatch = body.match(/## Summary\s+([\s\S]*?)(?:\n## |\n# |$)/);
  if (!summaryMatch) return "";
  return summaryMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
}

function chunkMarkdown(body) {
  const lines = body.split(/\r?\n/);
  const chunks = [];
  let heading = "";
  let buffer = [];

  function flush() {
    const text = buffer.join("\n").trim();
    if (text) chunks.push({ heading, text });
    buffer = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = headingMatch[2].trim();
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();

  if (chunks.length === 0 && body.trim()) {
    chunks.push({ heading: "", text: body.trim() });
  }

  return chunks;
}

function tokenEstimate(text) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);
}

function entityId(type, name) {
  const cleanSlug = slug(name, { allowCyrillic: true, fallback: "" });
  const suffix = sha256(`${type}:${name}`).slice(0, 10);
  return `${type}:${cleanSlug ? `${cleanSlug}-` : ""}${suffix}`;
}

function relationId(sourceType, sourceId, relationType, targetType, targetId) {
  return sha256([sourceType, sourceId, relationType, targetType, targetId].join("|"));
}

function upsertEntitySql(type, name, now) {
  const id = entityId(type, name);
  return `
INSERT INTO entities (id, type, name, canonical_name, created_at, updated_at)
VALUES (${sqlString(id)}, ${sqlString(type)}, ${sqlString(name)}, ${sqlString(String(name).toLowerCase())}, ${sqlString(now)}, ${sqlString(now)})
ON CONFLICT(type, name) DO UPDATE SET
  canonical_name = excluded.canonical_name,
  updated_at = excluded.updated_at;
`;
}

function upsertRelationSql(sourceType, sourceId, relationType, targetType, targetId, evidenceDocumentId, now) {
  const id = relationId(sourceType, sourceId, relationType, targetType, targetId);
  return `
INSERT INTO relations (
  id, source_type, source_id, relation_type, target_type, target_id, confidence,
  evidence_document_id, evidence_chunk_id, created_at, updated_at
)
VALUES (
  ${sqlString(id)}, ${sqlString(sourceType)}, ${sqlString(sourceId)}, ${sqlString(relationType)},
  ${sqlString(targetType)}, ${sqlString(targetId)}, ${sqlNumber(1)},
  ${sqlString(evidenceDocumentId)}, NULL, ${sqlString(now)}, ${sqlString(now)}
)
ON CONFLICT(id) DO UPDATE SET
  confidence = excluded.confidence,
  evidence_document_id = excluded.evidence_document_id,
  updated_at = excluded.updated_at;
`;
}

function indexDocument(filePath, now) {
  const relPath = path.relative(ROOT, filePath);
  const raw = readFileSync(filePath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const id = data.id || relPath.replace(/\.md$/, "").replaceAll(path.sep, "/");
  const type = data.type || "note";
  const status = data.status || "";
  const title = extractTitle(body, path.basename(filePath, ".md"));
  const summary = extractSummary(body);
  const hash = sha256(raw);
  const created = data.created || data["date added"] || "";
  const updated = data.updated || "";
  const chunks = chunkMarkdown(body);

  let sql = `
INSERT INTO documents (id, path, type, status, title, summary, hash, created_at, updated_at, indexed_at)
VALUES (
  ${sqlString(id)}, ${sqlString(relPath)}, ${sqlString(type)}, ${sqlString(status)}, ${sqlString(title)},
  ${sqlString(summary)}, ${sqlString(hash)}, ${sqlString(created)}, ${sqlString(updated)}, ${sqlString(now)}
)
ON CONFLICT(id) DO UPDATE SET
  path = excluded.path,
  type = excluded.type,
  status = excluded.status,
  title = excluded.title,
  summary = excluded.summary,
  hash = excluded.hash,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  indexed_at = excluded.indexed_at;

DELETE FROM chunks WHERE document_id = ${sqlString(id)};
DELETE FROM chunks_fts WHERE document_id = ${sqlString(id)};
`;

  chunks.forEach((chunk, index) => {
    const chunkId = `${id}#${index + 1}`;
    const chunkHash = sha256(chunk.text);
    sql += `
INSERT INTO chunks (id, document_id, ordinal, heading, text, hash, token_count)
VALUES (
  ${sqlString(chunkId)}, ${sqlString(id)}, ${index + 1}, ${sqlString(chunk.heading)},
  ${sqlString(chunk.text)}, ${sqlString(chunkHash)}, ${tokenEstimate(chunk.text)}
);
INSERT INTO chunks_fts (text, heading, document_id, chunk_id)
VALUES (${sqlString(chunk.text)}, ${sqlString(chunk.heading)}, ${sqlString(id)}, ${sqlString(chunkId)});
`;
  });

  const topics = Array.isArray(data.topics) ? data.topics : [];
  const tools = Array.isArray(data.tools) ? data.tools : [];
  const sources = Array.isArray(data.sources) ? data.sources : [];

  for (const topic of topics) {
    sql += upsertEntitySql("topic", topic, now);
    sql += upsertRelationSql("document", id, "MENTIONS", "topic", entityId("topic", topic), id, now);
  }

  for (const tool of tools) {
    sql += upsertEntitySql("tool", tool, now);
    sql += upsertRelationSql("document", id, "MENTIONS", "tool", entityId("tool", tool), id, now);
  }

  for (const source of sources) {
    sql += upsertEntitySql("source", source, now);
    sql += upsertRelationSql("document", id, "DERIVED_FROM", "source", entityId("source", source), id, now);
  }

  if (data.related && typeof data.related === "object" && !Array.isArray(data.related)) {
    for (const [key, values] of Object.entries(data.related)) {
      if (!RELATION_TYPES.has(key)) continue;
      const list = Array.isArray(values) ? values : [values];
      for (const value of list.filter(Boolean)) {
        sql += upsertRelationSql("document", id, "RELATES_TO", key.replace(/s$/, ""), String(value), id, now);
      }
    }
  }

  return { sql, changed: true, chunks: chunks.length };
}

function main() {
  mkdirSync(MEMORY_DIR, { recursive: true });
  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`Missing schema: ${SCHEMA_PATH}`);
  }
  if (!existsSync(DB_PATH)) {
    runSql(readFileSync(SCHEMA_PATH, "utf8"));
  } else {
    runSql(readFileSync(SCHEMA_PATH, "utf8"));
  }

  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const files = INCLUDE_DIRS.flatMap((dir) => listMarkdownFiles(path.join(ROOT, dir))).sort();

  let documentsChanged = 0;
  let chunksChanged = 0;
  let sql = "BEGIN;\n";
  sql += `
DELETE FROM embeddings;
DELETE FROM relations;
DELETE FROM entities;
DELETE FROM chunks_fts;
DELETE FROM chunks;
DELETE FROM documents;

INSERT INTO index_runs (id, started_at, status, documents_scanned)
VALUES (${sqlString(runId)}, ${sqlString(startedAt)}, 'running', ${files.length});
`;

  for (const file of files) {
    const result = indexDocument(file, startedAt);
    sql += result.sql;
    documentsChanged += result.changed ? 1 : 0;
    chunksChanged += result.chunks;
  }

  sql += `
UPDATE index_runs
SET finished_at = ${sqlString(new Date().toISOString())},
    status = 'success',
    documents_scanned = ${files.length},
    documents_changed = ${documentsChanged},
    chunks_changed = ${chunksChanged}
WHERE id = ${sqlString(runId)};
COMMIT;
`;

  const tmpSql = path.join(MEMORY_DIR, "last-rebuild.sql");
  writeFileSync(tmpSql, sql);
  runSql(sql);

  console.log(`Indexed ${files.length} documents, ${chunksChanged} chunks.`);
  console.log(`Database: ${path.relative(ROOT, DB_PATH)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
