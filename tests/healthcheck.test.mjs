import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));

test("healthcheck skips launchd plist lint on non-macOS runners", (t) => {
  const temporary = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-healthcheck-")));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const state = path.join(temporary, "state");
  mkdirSync(path.join(state, "memory"), { recursive: true });
  const env = {
    PATH: process.env.PATH,
    HOME: temporary,
    TMPDIR: temporary,
    PRITHA_ROOT: root,
    TECHSCOPE_ROOT: root,
    PRITHA_STATE_ROOT: state,
    PRITHA_AGENT_PARENT: path.join(temporary, "agents"),
    PRITHA_INSTANCE_ID: "healthcheck-test",
    PRITHA_HEALTHCHECK_PLATFORM: "linux",
    TECHSCOPE_HEALTHCHECK_PLATFORM: "linux",
    PRITHA_TELEGRAM_BOT_TOKEN: "",
    TECHSCOPE_TELEGRAM_BOT_TOKEN: "",
    PRITHA_TELEGRAM_ALLOWED_USER_IDS: "",
    TECHSCOPE_TELEGRAM_ALLOWED_USER_IDS: "",
  };
  const database = spawnSync("sqlite3", [path.join(state, "memory", "pritha.sqlite")], {
    encoding: "utf8",
    input: readFileSync(path.join(root, ".memory", "schema.sql"), "utf8"),
    env,
    timeout: 10_000,
  });
  assert.equal(database.status, 0, database.stderr || database.error?.message);

  const result = spawnSync(process.execPath, ["scripts/healthcheck.mjs"], {
    cwd: root,
    encoding: "utf8",
    env,
    timeout: 60_000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  assert.match(result.stdout, /PASS memory stats:/);
  assert.match(result.stdout, /documents\s+0/);
  assert.match(result.stdout, /PASS plutil launchd\/com\.techscope\.web\.plist: skipped on linux/);
  assert.match(result.stdout, /PASS plutil launchd\/com\.techscope\.telegram-bot\.plist: skipped on linux/);
});
