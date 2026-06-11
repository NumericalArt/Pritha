import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("healthcheck skips launchd plist lint on non-macOS runners", () => {
  const result = spawnSync("node", ["scripts/healthcheck.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      TECHSCOPE_HEALTHCHECK_PLATFORM: "linux",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS plutil launchd\/com\.techscope\.web\.plist: skipped on linux/);
  assert.match(result.stdout, /PASS plutil launchd\/com\.techscope\.telegram-bot\.plist: skipped on linux/);
});
