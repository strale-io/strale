import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getExecutor } from "../capabilities/index.js";
import "../capabilities/aml-risk-score.js";

// The API CI job does not install Astro. Load this dependency-free content
// module without resolving the website's Astro-based tsconfig.
const source = readFileSync(new URL("../../../web/src/content/tool-pages.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const content = { exports: {} as { toolPages: Record<string, { example: { input: Record<string, unknown>; output: Record<string, unknown> } }> } };
runInNewContext(compiled.outputText, content);
const { toolPages } = content.exports;

vi.mock("./metered-vendor-fetch.js", () => ({ meteredVendorFetch: vi.fn(async () => new Response(JSON.stringify({ found_records: [] }), { status: 200 })) }));
import "../capabilities/sanctions-check.js";

it("the AML landing-page example is computed by the real scoring rules", async () => {
  const example = toolPages["aml-risk-score"]!.example;
  const result = await getExecutor("aml-risk-score")!(example.input);
  expect(result.output).toMatchObject(example.output);
});

it("the labelled sanctions illustration matches the executor's no-match response", async () => {
  vi.stubEnv("DILISENSE_API_KEY", "unit-test-placeholder");
  try {
    const example = toolPages["sanctions-check"]!.example;
    const result = await getExecutor("sanctions-check")!(example.input);
    expect(result.output).toMatchObject(example.output);
  } finally { vi.unstubAllEnvs(); }
});
