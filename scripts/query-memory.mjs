#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, ".memory", "techscope.sqlite");

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ftsQuery(value) {
  const normalized = String(value)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || String(value);
}

function runSql(sql) {
  return execFileSync("sqlite3", ["-header", "-column", DB_PATH, sql], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const command = process.argv[2] || "help";
const arg = process.argv.slice(3).join(" ");

if (command === "help") {
  console.log(`Usage:
  node scripts/query-memory.mjs stats
  node scripts/query-memory.mjs search <text>
  node scripts/query-memory.mjs documents
  node scripts/query-memory.mjs entities
  node scripts/query-memory.mjs relations <document-id>`);
  console.log(`
Filters:
  node scripts/query-memory.mjs by-topic <topic>
  node scripts/query-memory.mjs by-tool <tool>
  node scripts/query-memory.mjs by-status <status>
  node scripts/query-memory.mjs by-type <type>
  node scripts/query-memory.mjs semantic <text>
  node scripts/query-memory.mjs recent
  node scripts/query-memory.mjs open`);
  process.exit(0);
}

if (command === "stats") {
  console.log(runSql(`
SELECT 'documents' AS table_name, COUNT(*) AS count FROM documents
UNION ALL SELECT 'chunks', COUNT(*) FROM chunks
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'relations', COUNT(*) FROM relations
UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings;
`));
  process.exit(0);
}

if (command === "documents") {
  console.log(runSql(`
SELECT id, type, status, path
FROM documents
ORDER BY type, path;
`));
  process.exit(0);
}

if (command === "entities") {
  console.log(runSql(`
SELECT type, name
FROM entities
ORDER BY type, name;
`));
  process.exit(0);
}

if (command === "relations") {
  if (!arg) {
    console.error("Missing document id.");
    process.exit(1);
  }
  console.log(runSql(`
SELECT relation_type, target_type, target_id
FROM relations
WHERE source_id = ${sqlString(arg)}
ORDER BY relation_type, target_type, target_id;
`));
  process.exit(0);
}

if (command === "by-topic" || command === "by-tool") {
  if (!arg) {
    console.error(`Missing ${command === "by-topic" ? "topic" : "tool"} name.`);
    process.exit(1);
  }
  const entityType = command === "by-topic" ? "topic" : "tool";
  console.log(runSql(`
SELECT d.type, d.status, d.path, d.title
FROM relations r
JOIN documents d ON d.id = r.source_id
JOIN entities e ON e.id = r.target_id
WHERE r.source_type = 'document'
  AND r.relation_type = 'MENTIONS'
  AND r.target_type = ${sqlString(entityType)}
  AND lower(e.name) = lower(${sqlString(arg)})
ORDER BY d.type, d.path;
`));
  process.exit(0);
}

if (command === "by-status") {
  if (!arg) {
    console.error("Missing status.");
    process.exit(1);
  }
  console.log(runSql(`
SELECT id, type, status, path, title
FROM documents
WHERE lower(status) = lower(${sqlString(arg)})
ORDER BY type, path;
`));
  process.exit(0);
}

if (command === "by-type") {
  if (!arg) {
    console.error("Missing type.");
    process.exit(1);
  }
  console.log(runSql(`
SELECT id, type, status, path, title
FROM documents
WHERE lower(type) = lower(${sqlString(arg)})
ORDER BY status, path;
`));
  process.exit(0);
}

if (command === "recent") {
  console.log(runSql(`
SELECT id, type, status, updated_at, path, title
FROM documents
ORDER BY COALESCE(NULLIF(updated_at, ''), indexed_at) DESC, path
LIMIT 20;
`));
  process.exit(0);
}

if (command === "open") {
  console.log(runSql(`
SELECT id, type, status, path, title
FROM documents
WHERE status IN ('new', 'draft', 'proposed')
  AND type != 'template'
ORDER BY type, path;
`));
  process.exit(0);
}

if (command === "search") {
  if (!arg) {
    console.error("Missing search text.");
    process.exit(1);
  }
  console.log(runSql(`
SELECT d.type, d.status, d.path, c.heading, snippet(chunks_fts, 0, '[', ']', ' ... ', 12) AS snippet
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.chunk_id
JOIN documents d ON d.id = chunks_fts.document_id
WHERE chunks_fts MATCH ${sqlString(ftsQuery(arg))}
ORDER BY rank
LIMIT 20;
`));
  process.exit(0);
}

if (command === "semantic") {
  if (!arg) {
    console.error("Missing semantic search text.");
    process.exit(1);
  }
  const output = execFileSync("python3", ["scripts/semantic-search.py", arg], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(output);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);
