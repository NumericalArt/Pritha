import assert from "node:assert/strict";
import test from "node:test";
import { parseLongArgs, parseLongArgsWithEquals } from "../scripts/lib/cli-args.mjs";
test("shared parsers preserve the two existing long-option grammars", () => {
  const argv = ["target", "--json", "--name", "child", "--budget=5", "--count", "-1"];
  assert.deepEqual(parseLongArgs(argv), { _: ["target"], json: true, name: "child", "budget=5": true, count: "-1" });
  assert.deepEqual(parseLongArgsWithEquals(argv), { _: ["target"], json: true, name: "child", budget: "5", count: "-1" });
});
