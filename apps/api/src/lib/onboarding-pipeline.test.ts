import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createOnboardingRunRoute } from "../routes/internal-onboarding.js";
import { AsyncLocalStorage, createHook } from "node:async_hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as yaml from "js-yaml";
import { runOnboarding } from "./onboarding-pipeline.js";
import { getDb, withDatabase } from "../db/index.js";
import {
  persistCapability,
  diffAndUpdateLimitations,
} from "./capability-persistence.js";
import { guardedExecute } from "../capabilities/guarded-executor.js";
import { validateCapability } from "./onboarding-gates.js";
vi.mock("./capability-persistence.js", () => ({
  persistCapability: vi.fn(),
  diffAndUpdateLimitations: vi.fn(),
}));
vi.mock("./capability-readiness.js", () => ({
  checkReadiness: vi.fn().mockResolvedValue({ ready: true, issues: [] }),
  clearReadinessCache: vi.fn(),
}));
vi.mock("./onboarding-gates.js", () => ({
  validateCapability: vi
    .fn()
    .mockResolvedValue({ violations: [], warnings: [] }),
}));
vi.mock("./fixture-quality.js", () => ({
  validateFixture: () => ({ ok: true, reasons: [] }),
}));
vi.mock("../capabilities/index.js", () => ({ getExecutor: () => () => {} }));
vi.mock("../capabilities/guarded-executor.js", () => ({
  guardedExecute: vi.fn(),
  seedCostMetaForOnboarding: vi.fn(),
  COST_CLASSES: ["free_unlimited"],
}));

const manifest = () => ({
  slug: "sample-tool",
  name: "Sample tool",
  description:
    "A sample tool for testing the shared onboarding pipeline without network access.",
  category: "validation",
  price_cents: 5,
  data_source: "Computed",
  data_source_type: "computed",
  transparency_tag: "algorithmic",
  cost_class: "free_unlimited",
  freshness_category: "computed",
  avg_latency_ms: 20,
  input_schema: { type: "object", properties: { query: { type: "string" } } },
  output_schema: { type: "object", properties: { answer: { type: "string" } } },
  test_fixtures: {
    health_check_input: { query: "sample" },
    known_answer: {
      input: { query: "sample" },
      expected_fields: [
        {
          field: "answer",
          operator: "equals",
          value: "expected",
          reliability: "guaranteed",
        },
      ],
    },
  },
  output_field_reliability: { answer: "guaranteed" },
  limitations: [
    {
      title: "Coverage",
      text: "Only handles sample input.",
      category: "coverage",
    },
  ],
});
function database(rows: unknown[][] = [[]]) {
  const select = vi.fn(() => {
    const value = rows.shift() ?? [];
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(value),
      then: (ok: any, no: any) => Promise.resolve(value).then(ok, no),
    };
    return chain;
  });
  return {
    select,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({
      set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
    })),
  } as any;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(diffAndUpdateLimitations).mockImplementation(
    async (_db, _slug, _rows, observe) => {
      observe?.("created", ["Coverage"]);
      return { deleted: 0, inserted: 1, reordered: 0 };
    }
  );
  vi.mocked(guardedExecute).mockResolvedValue({
    output: { answer: "expected" },
  } as any);
  vi.mocked(persistCapability).mockResolvedValue({
    slug: "sample-tool",
    mode: "create",
    hookFailed: false,
  });
});
describe("shared onboarding pipeline", () => {
  it("creates all five suites with the injected handle and retains dark launch", async () => {
    const db = database();
    vi.mocked(persistCapability).mockImplementationOnce(async (_input, opts) => {
      expect(opts.db).toBe(db);
      return { slug: "sample-tool", mode: "create", hookFailed: false };
    });
    const result = await runOnboarding(db, {
      manifestYaml: yaml.dump(manifest()),
      mode: "onboard",
      strict: true,
    });
    expect(result).toMatchObject({
      status: "success",
      verification: { passed: true },
      readiness: { ready: true },
      rows: {
        created: expect.arrayContaining([
          { table: "capabilities", count: 1, names: ["sample-tool"] },
        ]),
      },
    });
    expect(new Set(result.generatedTestTypes)).toEqual(
      new Set([
        "known_answer",
        "schema_check",
        "negative",
        "edge_case",
        "dependency_health",
      ])
    );
    const input = vi.mocked(persistCapability).mock.calls[0][0];
    expect(input.capability).toMatchObject({
      visible: false,
      lifecycleState: "validating",
    });
    expect(input.capability.x402Enabled).not.toBe(true);
    expect(input.testSuites).toHaveLength(5);
  });
  it("returns discovered YAML instead of writing files", async () => {
    const m = manifest();
    m.test_fixtures.known_answer.expected_fields = [];
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(m),
      mode: "onboard",
      discover: true,
      strict: true,
    });
    expect(result.status).toBe("success");
    const updated = yaml.load(result.updatedManifestYaml!) as any;
    expect(updated.test_fixtures.known_answer.expected_fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "answer" })])
    );
    expect(updated.output_field_reliability.answer).toBe("guaranteed");
    expect(guardedExecute).toHaveBeenCalledTimes(2);
  });
  it("blocks writes when strict verification fails", async () => {
    vi.mocked(guardedExecute).mockResolvedValue({
      output: { answer: "different" },
    } as any);
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(manifest()),
      mode: "onboard",
      strict: true,
    });
    expect(result).toMatchObject({
      status: "failed",
      verification: { passed: false },
    });
    expect(persistCapability).not.toHaveBeenCalled();
  });
  it("reports permissive verification honestly while preserving CLI continuation", async () => {
    vi.mocked(guardedExecute).mockRejectedValue(
      new Error("upstream unavailable")
    );
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(manifest()),
      mode: "onboard",
    });
    expect(result.status).toBe("success");
    expect(result.verification).toMatchObject({
      passed: false,
      entries: [{ status: "unverified" }],
    });
  });
  it("fixes case mismatches and persists the corrected suites", async () => {
    const m = manifest();
    m.test_fixtures.known_answer.expected_fields[0].value = "EXPECTED";
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(m),
      mode: "onboard",
      strict: true,
      fix: true,
    });
    expect(result.status).toBe("success");
    expect(result.updatedManifestYaml).toContain("expected");
    expect(
      vi.mocked(persistCapability).mock.calls[0][0].testSuites?.[0]
        .validationRules
    ).toEqual({
      checks: [{ field: "answer", operator: "equals", value: "expected" }],
    });
  });
  it("returns a structured failure on a hook failure after committed writes", async () => {
    vi.mocked(persistCapability).mockResolvedValueOnce({
      slug: "sample-tool",
      mode: "create",
      hookFailed: true,
    });
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(manifest()),
      mode: "onboard",
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "failed",
      errors: [{ code: "hook_failed" }],
      rows: {
        created: expect.arrayContaining([
          expect.objectContaining({ table: "capabilities", count: 1 }),
        ]),
      },
    });
  });
  it("dry-run generates suites without executing or persisting", async () => {
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(manifest()),
      mode: "onboard",
      dryRun: true,
    });
    expect(result.status).toBe("success");
    expect(result.rows.created).toEqual([]);
    expect(guardedExecute).not.toHaveBeenCalled();
    expect(persistCapability).not.toHaveBeenCalled();
  });
  it("refuses discovery under dry-run", async () => {
    expect(
      (
        await runOnboarding(database(), {
          manifestYaml: yaml.dump(manifest()),
          mode: "onboard",
          dryRun: true,
          discover: true,
        })
      ).status
    ).toBe("failed");
    expect(guardedExecute).not.toHaveBeenCalled();
  });
  it("validates before writing and reports gate errors", async () => {
    vi.mocked(validateCapability).mockResolvedValueOnce({
      violations: [{ gate: "gate1", detail: "Missing field" }],
      warnings: [],
    } as any);
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(manifest()),
      mode: "onboard",
    });
    expect(result).toMatchObject({
      status: "failed",
      errors: [{ code: "manifest_invalid", message: "[gate1] Missing field" }],
    });
    expect(persistCapability).not.toHaveBeenCalled();
  });
  it("backfills limitations even when no suites or reliability fields need work", async () => {
    const m = manifest();
    m.output_field_reliability = {} as any;
    const tests = [
      "known_answer",
      "schema_check",
      "negative",
      "edge_case",
      "dependency_health",
    ].map((testType) => ({ testType, active: true }));
    const result = await runOnboarding(
      database([[{ slug: m.slug }], [{ slug: m.slug }], tests]),
      { manifestYaml: yaml.dump(m), mode: "backfill", force: true }
    );
    expect(result.status).toBe("success");
    expect(diffAndUpdateLimitations).toHaveBeenCalledWith(
      expect.anything(),
      m.slug,
      expect.arrayContaining([
        expect.objectContaining({
          limitationText: "Only handles sample input.",
        }),
      ]),
      expect.any(Function)
    );
    expect(result.rows.created).toContainEqual(
      expect.objectContaining({ table: "capability_limitations", count: 1 })
    );
  });
  it("counts every known-answer row actually updated, including historic rows", async () => {
    const tests = ["known_answer", "schema_check", "negative", "edge_case", "dependency_health"].map(testType => ({ testType, active: true }));
    const db = database([[{ slug: "sample-tool" }], [{ slug: "sample-tool" }], tests, []]);
    db.update = vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [{ name: "first-fixture" }, { name: "historic-fixture" }] }) }) }));
    const result = await runOnboarding(db, { manifestYaml: yaml.dump(manifest()), mode: "backfill", force: true, fix: true });
    expect(result.status).toBe("success");
    expect(result.rows.updated).toContainEqual({ table: "test_suites", count: 2, names: ["first-fixture", "historic-fixture"] });
  });
  it("reports backfill hook failures after recording committed updates", async () => {
    vi.mocked(persistCapability).mockResolvedValueOnce({
      slug: "sample-tool",
      mode: "update",
      hookFailed: true,
    });
    const result = await runOnboarding(
      database([[{ slug: "sample-tool" }], [{ slug: "sample-tool" }], []]),
      { manifestYaml: yaml.dump(manifest()), mode: "backfill", force: true }
    );
    expect(result).toMatchObject({
      status: "failed",
      errors: [{ code: "hook_failed" }],
      rows: { updated: [{ table: "capabilities", count: 1 }] },
    });
    expect(diffAndUpdateLimitations).toHaveBeenCalled();
  });
  it("does not execute another fixture or persist after the budget aborts", async () => {
    const controller = new AbortController();
    const m = manifest();
    (m.test_fixtures as any).known_answer = [
      m.test_fixtures.known_answer,
      m.test_fixtures.known_answer,
    ];
    vi.mocked(guardedExecute).mockImplementationOnce(async () => {
      controller.abort();
      return { output: { answer: "expected" } } as any;
    });
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(m),
      mode: "onboard",
      signal: controller.signal,
    });
    expect(result).toMatchObject({
      status: "failed",
      errors: [{ code: "timeout" }],
    });
    expect(guardedExecute).toHaveBeenCalledTimes(1);
    expect(persistCapability).not.toHaveBeenCalled();
  });
  it("API pipeline never enters ALS or enables an async hook", async () => {
    const run = vi.spyOn(AsyncLocalStorage.prototype, "run");
    const hookPrototype = Object.getPrototypeOf(createHook({}));
    const enable = vi.spyOn(hookPrototype, "enable");
    try {
      const directory = mkdtempSync(resolve(tmpdir(), "onboarding-als-test-"));
      try {
        writeFileSync(resolve(directory, "sample-tool.yaml"), yaml.dump(manifest()));
        const secret = "onboarding-only-test-secret-32-characters";
        const app = createOnboardingRunRoute({
          database: () => database(), pipeline: runOnboarding,
          manifestDirectory: directory, secret: () => secret,
        });
        const headers = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
        const response = await app.request("/run", { method: "POST", headers, body: JSON.stringify({ slug: "sample-tool", mode: "onboard" }) });
        expect(response.status).toBe(202);
        const { id } = await response.json();
        let state;
        // Flush the actual route → pipeline → result chain without test timers.
        for (let i = 0; i < 30; i++) {
          state = await (await app.request(`/run/${id}`, { headers })).json();
          if (!state.busy) break;
        }
        expect(state.status).toBe("success");
        expect(persistCapability).toHaveBeenCalled();
      } finally { rmSync(directory, { recursive: true, force: true }); }
      expect(run).not.toHaveBeenCalled();
      expect(enable).not.toHaveBeenCalled();
    } finally { run.mockRestore(); enable.mockRestore(); }
  });
  it("times out a never-settling executor without persisting", async () => {
    const controller = new AbortController();
    vi.mocked(guardedExecute).mockImplementationOnce(() => new Promise(() => {}));
    const pending = runOnboarding(database(), {
      manifestYaml: yaml.dump(manifest()), mode: "onboard", signal: controller.signal,
    });
    await vi.waitFor(() => expect(guardedExecute).toHaveBeenCalled());
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ status: "failed", errors: [{ code: "timeout" }] });
    expect(persistCapability).not.toHaveBeenCalled();
  });
  it("CLI create warns and succeeds when its committed hook fails", async () => {
    vi.mocked(persistCapability).mockResolvedValueOnce({ slug: "sample-tool", mode: "create", hookFailed: true });
    const report = vi.fn();
    const result = await runOnboarding(database(), {
      manifestYaml: yaml.dump(manifest()), mode: "onboard", onMessage: report,
    });
    expect(result.status).toBe("success");
    expect(report).toHaveBeenCalledWith(expect.stringContaining("hook failed"));
  });
  it("keeps concurrent injected DB contexts isolated", async () => {
    const a = database(),
      b = database();
    await Promise.all([
      withDatabase(a, async () => {
        await Promise.resolve();
        expect(getDb()).toBe(a);
      }),
      withDatabase(b, async () => {
        await Promise.resolve();
        expect(getDb()).toBe(b);
      }),
    ]);
  });
  it("blocks lazy writes after abort, including transaction handles", async () => {
    const controller = new AbortController();
    const execute = vi.fn();
    const lazy = { then: execute };
    const db = {
      insert: () => ({ values: () => lazy }),
      transaction: async (cb: any) =>
        cb({ insert: () => ({ values: () => lazy }) }),
    };
    await withDatabase(
      db as any,
      async () => {
        const query = getDb()
          .insert({} as any)
          .values({} as any);
        await (getDb() as any).transaction(async (tx: any) => {
          controller.abort();
          expect(() => tx.insert({})).toThrow();
        });
        await expect(query).rejects.toThrow();
      },
      controller.signal
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
