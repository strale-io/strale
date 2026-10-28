import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getNestedValue } from "./nested-value.js";
import { checkGuaranteedFieldsPresent } from "./guaranteed-fields-sentinel.js";

it("resolves dotted objects and numeric array indices with runner presence semantics", () => {
  const output = { records: [{ value: 0 }], no: false, empty: [], absent: null };
  expect(getNestedValue(output, "records.0.value")).toBe(0);
  expect(getNestedValue(output, "records.1.value")).toBeUndefined();
  expect(checkGuaranteedFieldsPresent(output, { "records.0.value": "guaranteed", no: "guaranteed", empty: "guaranteed", absent: "guaranteed", optional: "common", missing: "guaranteed" }).missingFields).toEqual(["missing"]);
});
it("onboarding, runner, audit and remediation all use the shared path implementation", () => {
  for (const file of ["onboarding-pipeline.ts", "test-runner.ts", "auto-remediation.ts", "../db/audit-tests.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).toMatch(/import \{ getNestedValue \} from/);
    expect(source).not.toMatch(/function getNestedValue\(/);
  }
  expect(readFileSync(new URL("onboarding-pipeline.ts", import.meta.url), "utf8")).toContain("getNestedValue(output, ef.field)");
  expect(readFileSync(new URL("test-runner.ts", import.meta.url), "utf8")).toContain("getNestedValue(output, check.field)");
});
