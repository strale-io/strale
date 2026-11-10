import { expect, it, vi } from "vitest";
import { toolPages } from "../../../web/src/content/tool-pages.js";
import { getExecutor } from "../capabilities/index.js";
import "../capabilities/aml-risk-score.js";

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
