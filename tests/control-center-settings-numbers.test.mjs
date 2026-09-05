import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const source = readFileSync("interfaces/control-center/src/lib/settings/runtime-numbers.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseRuntimeNumberDrafts, runtimeNumberDrafts, validateRuntimeNumbers, RUNTIME_NUMBER_RULES } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const values = { codexTimeoutMs: 15001, codexPromptTokenBudget: 4000, codexMaxPlanSteps: 7, codexAppThreadMaxTurns: 20, codexAppThreadMaxAgeHours: 24 };

test("timeout unit round trips preserve individual milliseconds", () => {
  for (const timeout of [10000, 15001, 999999, 3600000]) {
    for (const unit of ["seconds", "milliseconds"]) {
      const input = { ...values, codexTimeoutMs: timeout };
      assert.deepEqual(parseRuntimeNumberDrafts(runtimeNumberDrafts(input, unit), unit), { values: input });
    }
  }
});

test("empty, malformed and out-of-range numeric drafts cannot silently become defaults", () => {
  for (const key of Object.keys(values)) {
    for (const invalid of ["", " ", "-1", "0", "1e5", "Infinity", "999999999999999999999"]) {
      const draft = { ...runtimeNumberDrafts(values, "milliseconds"), [key]: invalid };
      assert.ok(parseRuntimeNumberDrafts(draft, "milliseconds").error, `${key}: ${invalid}`);
      assert.equal(draft[key], invalid, "validation must preserve the editable draft");
    }
  }
  const seconds = runtimeNumberDrafts(values, "seconds");
  assert.ok(parseRuntimeNumberDrafts({ ...seconds, codexTimeoutMs: "15.0001" }, "seconds").error);
});

test("settings API numeric validation accepts exact bounds and rejects type coercion", () => {
  assert.equal(validateRuntimeNumbers({}), null, "text-only and partial clients remain supported");
  for (const [key, rule] of Object.entries(RUNTIME_NUMBER_RULES)) {
    for (const bound of [rule.min, rule.max]) assert.equal(validateRuntimeNumbers({ [key]: bound }), null);
    for (const invalid of [null, false, String(rule.min), [], {}, NaN, Infinity, rule.min - 1, rule.max + 1, rule.min + 0.1]) {
      assert.equal(validateRuntimeNumbers({ [key]: invalid })?.error, `invalid_${key}`);
    }
  }
});
