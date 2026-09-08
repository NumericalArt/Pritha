import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function executionDatabase() {
  // Keep native loading at runtime: Turbopack rewrites createRequire(node:sqlite)
  // into an unsupported URL external in the production server bundle.
  const DatabaseSync = process.getBuiltinModule?.("node:sqlite")?.DatabaseSync;
  if (!DatabaseSync) throw new ExecutionConflict("execution_runtime_unsupported", "Task execution requires Node.js 22.13 or newer.");
  return DatabaseSync;
}

export function executionRuntimeReady() {
  let db;
  try {
    const DatabaseSync = executionDatabase();
    db = new DatabaseSync(":memory:");
    return db.prepare("SELECT 1 AS ready").get().ready === 1;
  } catch { return false; }
  finally { db?.close(); }
}

const processGeneration = randomUUID();
const digest = value => createHash("sha256").update(String(value)).digest("hex");
const now = () => new Date().toISOString();

export class ExecutionConflict extends Error {
  constructor(code, message = "The operation is waiting for its execution owner.") {
    super(message);
    this.name = "ExecutionConflict";
    this.code = code;
  }
}

function processStamp(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {
    return execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch { return null; }
}

const ownStamp = processStamp(process.pid);

function metadataOwnerGone(row) {
  if (Number(row.pid) === process.pid) return row.process_stamp !== ownStamp && row.process_stamp != null && ownStamp != null;
  try { process.kill(Number(row.pid), 0); }
  catch (error) { return error.code === "ESRCH"; }
  const stamp = processStamp(Number(row.pid));
  return stamp != null && row.process_stamp != null && stamp !== row.process_stamp;
}

function privateDatabase(stateRoot, directory) {
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const canonicalRoot = realpathSync(stateRoot);
  const target = path.resolve(directory);
  if (target !== path.resolve(stateRoot) && !target.startsWith(`${path.resolve(stateRoot)}${path.sep}`)) {
    throw new ExecutionConflict("execution_store_outside_state");
  }
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const realTarget = realpathSync(target);
  if (realTarget !== canonicalRoot && !realTarget.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new ExecutionConflict("execution_store_symlink_escape");
  }
  chmodSync(realTarget, 0o700);
  const file = path.join(realTarget, "execution.sqlite");
  for (const name of [file, `${file}-wal`, `${file}-shm`]) {
    if (existsSync(name) && (!lstatSync(name).isFile() || lstatSync(name).isSymbolicLink())) {
      throw new ExecutionConflict("execution_store_invalid_file");
    }
  }
  return file;
}

function validKey(value) {
  if (typeof value !== "string" || !value || value.length > 2048) throw new ExecutionConflict("execution_key_invalid");
  return digest(value);
}

function decoded(row) { return row ? JSON.parse(row.value) : null; }

/** Instance-local coordination, never a generated memory database. No RPC runs inside a transaction. */
export class ExecutionCoordinator {
  constructor({ stateRoot, directory = path.join(stateRoot, "execution") }) {
    const DatabaseSync = executionDatabase();
    this.file = privateDatabase(stateRoot, directory);
    this.db = new DatabaseSync(this.file);
    chmodSync(this.file, 0o600);
    this.db.exec("PRAGMA busy_timeout=100;");
    const hasSchema = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='execution_meta'").get();
    if (hasSchema && this.db.prepare("SELECT value FROM execution_meta WHERE key='schema'").get()?.value !== "1") {
      this.db.close();
      throw new ExecutionConflict("execution_schema_unsupported");
    }
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS execution_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO execution_meta VALUES ('schema', '1');
      CREATE TABLE IF NOT EXISTS execution_claims (
        resource TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL,
        kind TEXT NOT NULL, pid INTEGER NOT NULL, process_stamp TEXT,
        generation TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(resource, owner)
      );
      CREATE TABLE IF NOT EXISTS execution_intents (
        key TEXT PRIMARY KEY, hash TEXT NOT NULL, kind TEXT NOT NULL,
        state TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS execution_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL
      );
    `);
    if (this.db.prepare("SELECT value FROM execution_meta WHERE key='schema'").get()?.value !== "1") {
      this.db.close();
      throw new ExecutionConflict("execution_schema_unsupported");
    }
    this.db.prepare("INSERT OR IGNORE INTO execution_meta VALUES ('admission',?)").run(['primary','replica'].includes(process.env.PRITHA_INSTANCE_ROLE)?'paused':'enabled');
    this.db.prepare("INSERT OR IGNORE INTO execution_meta VALUES ('capacity','3')").run();
  }

  admission() {
    return {enabled:this.db.prepare("SELECT value FROM execution_meta WHERE key='admission'").get()?.value==='enabled',capacity:Number(this.db.prepare("SELECT value FROM execution_meta WHERE key='capacity'").get()?.value || 3)};
  }
  setAdmission(enabled,capacity=this.admission().capacity) {
    if(!Number.isSafeInteger(capacity) || capacity<1 || capacity>16)throw new ExecutionConflict('execution_capacity_invalid');
    return this.transaction(()=>{
      this.db.prepare("INSERT OR REPLACE INTO execution_meta VALUES ('admission',?)").run(enabled?'enabled':'paused');
      this.db.prepare("INSERT OR REPLACE INTO execution_meta VALUES ('capacity',?)").run(String(capacity));
      this.appendEvent({state:enabled?'admission_enabled':'admission_paused',capacity});
      return this.admission();
    });
  }

  transaction(operation) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      if (result && typeof result.then === "function") throw new Error("execution_transaction_must_be_synchronous");
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      throw error;
    }
  }

  reserveIntent(key, hash, value, { limit, initialState = "reserved" } = {}) {
    if (!["reserved","queued"].includes(initialState)) throw new ExecutionConflict("execution_initial_state_invalid");
    const id = validKey(key);
    if (typeof hash !== "string" || !hash) throw new ExecutionConflict("execution_hash_invalid");
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT hash,value FROM execution_intents WHERE key=?").get(id);
      if (existing) {
        if (existing.hash !== hash) throw new ExecutionConflict("idempotency_conflict");
        return { created: false, intent: decoded(existing) };
      }
      if (limit) {
        if (!Number.isSafeInteger(limit.max) || limit.max < 1 || !Array.isArray(limit.states) || !limit.states.length) throw new ExecutionConflict("execution_limit_invalid");
        const states = [...new Set(["reserved", ...limit.states])];
        const rows = this.db.prepare(`SELECT value FROM execution_intents WHERE kind=? AND state IN (${states.map(()=>"?").join(",")})`).all(value.kind, ...states).map(decoded);
        if (rows.length >= limit.max || (limit.scopeField && rows.filter(row=>row[limit.scopeField]===value[limit.scopeField]).length >= limit.scopeMax)) throw new ExecutionConflict("execution_queue_full");
      }
      const intent = { ...value, id, hash, state: initialState, revision: 1, createdAt: now(), updatedAt: now() };
      this.db.prepare("INSERT INTO execution_intents VALUES (?,?,?,?,?,?)")
        .run(id, hash, String(value.kind || "operation"), intent.state, intent.revision, JSON.stringify(intent));
      if(initialState!=="reserved") this.appendEvent({executionId:id,chatId:value.chatId || null,taskId:value.taskId || null,state:initialState,revision:1});
      return { created: true, intent };
    });
  }

  getIntent(key) { return decoded(this.db.prepare("SELECT value FROM execution_intents WHERE key=?").get(validKey(key))); }
  getIntentById(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ExecutionConflict("execution_id_invalid");
    return decoded(this.db.prepare("SELECT value FROM execution_intents WHERE key=?").get(id));
  }

  updateIntent(key, patch, expectedRevision) {
    const id = validKey(key);
    return this.transaction(() => {
      const current = decoded(this.db.prepare("SELECT value FROM execution_intents WHERE key=?").get(id));
      if (!current) throw new ExecutionConflict("execution_not_found");
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new ExecutionConflict("execution_revision_conflict");
      const value = { ...current, ...patch, id, hash: current.hash, kind: current.kind, revision: current.revision + 1, updatedAt: now() };
      this.db.prepare("UPDATE execution_intents SET state=?,revision=?,value=? WHERE key=?")
        .run(value.state, value.revision, JSON.stringify(value), id);
      this.appendEvent({ executionId: id, chatId: value.chatId || null, taskId: value.taskId || null, nativeThreadId: value.nativeThreadId || null, storage: value.storage || value.stateIdentityHash || null, state: value.state, revision: value.revision });
      return value;
    });
  }

  listIntents({ states, kind, limit = 200 } = {}) {
    const clauses = [], parameters = [];
    if (states?.length) { clauses.push(`state IN (${states.map(() => "?").join(",")})`); parameters.push(...states); }
    if (kind) { clauses.push("kind=?"); parameters.push(kind); }
    return this.db.prepare(`SELECT value FROM execution_intents${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY rowid LIMIT ?`)
      .all(...parameters, Math.max(1, Math.min(limit, 1000))).map(decoded);
  }

  appendEvent(value) {
    this.db.prepare("INSERT INTO execution_events(value) VALUES (?)").run(JSON.stringify({ ...value, timestamp: now() }));
    this.db.prepare("DELETE FROM execution_events WHERE sequence < (SELECT MAX(sequence)-2000 FROM execution_events)").run();
  }

  events(after = 0) {
    return this.db.prepare("SELECT sequence,value FROM execution_events WHERE sequence>? ORDER BY sequence LIMIT 250")
      .all(after).map(row => ({ sequence: Number(row.sequence), ...decoded(row) }));
  }

  eventWindow() {
    const row=this.db.prepare("SELECT MIN(sequence) AS oldest, MAX(sequence) AS newest FROM execution_events").get();
    return {oldest:Number(row.oldest || 0),newest:Number(row.newest || 0)};
  }

  workspaceConflict(resources, mode, owner, generation) {
    const paths=resources.filter(resource=>resource.startsWith("workspace:")).map(resource=>resource.slice(10));
    if (!paths.length) return false;
    return this.claims().some(row=> {
      if ((row.owner===owner && row.generation===generation) || (row.mode==="read" && mode==="read"))return false;
      const held=row.detail.workspacePath;
      return typeof held==="string" && paths.some(candidate=>candidate===held || candidate.startsWith(held+path.sep) || held.startsWith(candidate+path.sep));
    });
  }

  claims() {
    return this.db.prepare("SELECT resource,owner,mode,kind,pid,process_stamp,generation,value FROM execution_claims")
      .all().map(row => ({ ...row, pid: Number(row.pid), detail: JSON.parse(row.value) }));
  }

  /** Execution claims never expire automatically; a dead dispatcher may have a live native turn. */
  claim(resources, owner, { kind = "turn", detail = {}, capacity, mode = "write" } = {}) {
    if (!Array.isArray(resources) || resources.length === 0 || !owner) throw new ExecutionConflict("execution_claim_invalid");
    const ownerHash = validKey(owner);
    const keys = [...new Set(resources.map(validKey))].sort();
    const generation = randomUUID();
    const acquire = this.transaction(() => {
      const continuing=kind==='turn' && detail.taskId && this.getIntent(`voice-workflow:${detail.taskId}`)?.state==='running';
      if(kind!=='metadata' && !this.admission().enabled && !continuing)throw new ExecutionConflict('execution_draining','New tasks are paused for a managed update. Existing task controls remain available.');
      if (this.workspaceConflict(resources,mode,ownerHash,generation)) return false;
      if (capacity !== undefined) {
        if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 64) throw new ExecutionConflict("execution_capacity_invalid");
        const count = Number(this.db.prepare("SELECT COUNT(DISTINCT owner) AS count FROM execution_claims WHERE kind='turn'").get().count);
        if (count >= capacity) return false;
      }
      for (const key of keys) {
        const rows = this.db.prepare("SELECT * FROM execution_claims WHERE resource=?").all(key);
        for (const row of rows) {
          // Only metadata locks can recover on owner-process exit; never native/workspace execution.
          if (row.kind === "metadata" && metadataOwnerGone(row)) {
            this.db.prepare("DELETE FROM execution_claims WHERE resource=? AND owner=? AND generation=?").run(key, row.owner, row.generation);
            continue;
          }
          if (mode !== "read" || row.mode !== "read") return false;
        }
      }
      for (const key of keys) this.db.prepare("INSERT INTO execution_claims VALUES (?,?,?,?,?,?,?,?)")
        .run(key, ownerHash, mode, kind, process.pid, ownStamp, generation, JSON.stringify({ ...detail, processGeneration, createdAt: now(),workspacePath:resources.find(resource=>validKey(resource)===key && resource.startsWith("workspace:"))?.slice(10) }));
      if(kind!=='metadata')this.db.prepare("INSERT OR REPLACE INTO execution_meta VALUES ('runtime_floor','1')").run();
      return true;
    });
    if (!acquire) return null;
    let released = false;
    return {
      owner: ownerHash,
      generation,
      assertOwned: () => {
        if (released || keys.some(key => !this.db.prepare("SELECT 1 FROM execution_claims WHERE resource=? AND owner=? AND generation=?").get(key, ownerHash, generation))) {
          throw new ExecutionConflict("execution_owner_changed");
        }
      },
      release: () => {
        if (released) return;
        this.transaction(() => this.db.prepare("DELETE FROM execution_claims WHERE owner=? AND generation=?").run(ownerHash, generation));
        released = true;
      },
    };
  }

  reconcileRelease(owner, generation) {
    return this.transaction(() => Number(this.db.prepare("DELETE FROM execution_claims WHERE owner=? AND generation=?").run(owner, generation).changes));
  }

  /** Add resources to an already verified logical owner without releasing earlier claims. */
  extend(owner, generation, resources, { mode = "write" } = {}) {
    const keys = [...new Set(resources.map(validKey))].sort();
    return this.transaction(() => {
      const source = this.db.prepare("SELECT * FROM execution_claims WHERE owner=? AND generation=? LIMIT 1").get(owner, generation);
      if (!source) throw new ExecutionConflict("execution_owner_changed");
      if (this.workspaceConflict(resources,mode,owner,generation)) return false;
      for (const key of keys) {
        const rows = this.db.prepare("SELECT owner,generation,mode FROM execution_claims WHERE resource=?").all(key);
        if (rows.some(row => !(row.owner === owner && row.generation === generation) && (mode !== "read" || row.mode !== "read"))) return false;
      }
      for (const key of keys) {
        this.db.prepare("INSERT OR IGNORE INTO execution_claims VALUES (?,?,?,?,?,?,?,?)")
          .run(key, owner, mode, source.kind, source.pid, source.process_stamp, generation, JSON.stringify({...JSON.parse(source.value),workspacePath:resources.find(resource=>validKey(resource)===key && resource.startsWith("workspace:"))?.slice(10)}));
        // A successful read-to-write upgrade must be visible to other workers.
        if (mode === "write") this.db.prepare("UPDATE execution_claims SET mode='write' WHERE resource=? AND owner=? AND generation=?").run(key, owner, generation);
      }
      return true;
    });
  }

  async withMutation(key, operation, { timeoutMs = 5000 } = {}) {
    const owner = `metadata:${processGeneration}:${randomUUID()}`;
    const deadline = Date.now() + timeoutMs;
    let lease;
    do {
      try { lease = this.claim([`metadata:${key}`], owner, { kind: "metadata" }); }
      catch (error) {
        if (error.errcode !== 5 && error.errcode !== 6) throw error;
      }
      if (lease) break;
      if (Date.now() >= deadline) throw new ExecutionConflict("execution_metadata_busy");
      await new Promise(resolve => setTimeout(resolve, 15));
    } while (true);
    try { lease.assertOwned(); return await operation(); }
    finally { lease.release(); }
  }

  close() { this.db.close(); }
}
