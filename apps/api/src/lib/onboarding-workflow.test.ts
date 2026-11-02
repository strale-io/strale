import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
// The workflow client runs on GitHub's Node runtime, with transport injected here.
// @ts-expect-error plain Node workflow script
import {
  parseSlugs,
  runWorkflow,
} from "../../../../.github/scripts/onboard-capability.mjs";
let directory: string;
const cwd = process.cwd();
beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "onboarding-workflow-"));
  process.chdir(directory);
});
afterEach(() => {
  process.chdir(cwd);
  rmSync(directory, { recursive: true, force: true });
});
const env = () => ({
  INPUT_SLUGS: "first-tool,second-tool",
  INPUT_MODE: "backfill",
  INPUT_DISCOVER: "false",
  INPUT_FIX: "false",
  ONBOARDING_RUN_SECRET: "x".repeat(40),
  GITHUB_STEP_SUMMARY: resolve(directory, "summary.md"),
});
const complete = (slug: string) => ({
  http: 200,
  body: {
    status: "success",
    busy: false,
    result: {
      rows: { created: [], updated: [], deleted: [] },
      generatedTestTypes: ["known_answer"],
      verification: { passed: true },
      readiness: { ready: true, issues: [] },
      updatedManifestYaml: `slug: ${slug}\n`,
    },
  },
});
describe("onboarding workflow client", () => {
  it("expands all to every real manifest slug only in limitations mode", () => {
    const manifests = resolve(import.meta.dirname, "../../../../manifests");
    const expected = readdirSync(manifests).filter(name => name.endsWith(".yaml")).map(name => name.slice(0, -5)).sort();
    expect(expected.length).toBeGreaterThan(50);
    expect(parseSlugs("all", "limitations", manifests)).toEqual(expected);
    for (const mode of ["onboard", "backfill"]) expect(() => parseSlugs("all", mode, manifests)).toThrow();
    expect(() => parseSlugs("all,first-tool", "limitations", manifests)).toThrow();
  });
  it("accepts up to 1000 explicit slugs only in limitations mode", () => {
    const slugs = (n: number) => Array.from({ length: n }, (_, i) => `tool-${i}`).join(",");
    expect(parseSlugs(slugs(51), "limitations")).toHaveLength(51);
    expect(parseSlugs(slugs(1000), "limitations")).toHaveLength(1000);
    expect(() => parseSlugs(slugs(1001), "limitations")).toThrow();
    for (const mode of ["onboard", "backfill"]) expect(() => parseSlugs(slugs(51), mode)).toThrow();
  });
  it("runs all sequentially, continues after a slug failure, and reports text outcomes without readiness", async () => {
    mkdirSync("manifests");
    for (const slug of ["first-tool", "second-tool", "third-tool"]) writeFileSync(`manifests/${slug}.yaml`, `slug: ${slug}\n`);
    writeFileSync("manifests/ignored.json", "{}");
    mkdirSync("manifests/ignored.yaml");
    const result = (outcome: string) => ({ http: 200, body: { status: outcome === "not_found" ? "failed" : "success", busy: false, result: { limitations: { outcome, reason: "Text sync result" }, rows: { created: [], updated: [], deleted: [] } } } });
    const request = vi.fn().mockResolvedValueOnce(result("not_found")).mockResolvedValueOnce(result("updated")).mockResolvedValueOnce(result("unchanged"));
    expect(await runWorkflow({ ...env(), INPUT_MODE: "limitations", INPUT_SLUGS: "all" }, request)).toBe(1);
    expect(request.mock.calls.map(call => call[2].slug)).toEqual(["first-tool", "second-tool", "third-tool"]);
    expect(request.mock.calls.every(call => call[2].mode === "limitations")).toBe(true);
    const summary = readFileSync("summary.md", "utf8");
    for (const outcome of ["not_found", "updated", "unchanged"]) expect(summary).toContain(`Limitations: ${outcome}`);
    expect(summary).not.toContain("Readiness:");
  });
  it.each([
    { http: 401, code: "unauthorized" },
    { http: 503, code: "not_configured" },
    { http: 200, code: "not_configured" },
  ])("stops limitations batches on $http / $code at submit or poll", async ({ http, code }) => {
    const config = { ...env(), INPUT_MODE: "limitations" };
    const failure = { http, body: { error: { code, message: "Fix configuration" } } };
    const request = vi.fn().mockResolvedValue(failure);
    expect(await runWorkflow(config, request)).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][2].mode).toBe("limitations");
    const polling = vi.fn().mockResolvedValueOnce({ http: 202, body: { status: "running", id: "12345678-1234-1234-1234-123456789abc" } }).mockResolvedValue(failure);
    expect(await runWorkflow(config, polling, async () => {})).toBe(1);
    expect(polling).toHaveBeenCalledTimes(2);
  });
  it("limits lists to 50 validated unique slugs", () => {
    expect(parseSlugs(" first-tool,second-tool ")).toEqual([
      "first-tool",
      "second-tool",
    ]);
    expect(
      parseSlugs(Array.from({ length: 50 }, (_, n) => `tool-${n}`).join(","))
    ).toHaveLength(50);
    for (const value of [
      "",
      "../escape",
      "one,,two",
      "one,one",
      Array.from({ length: 51 }, (_, n) => `tool-${n}`).join(","),
    ])
      expect(() => parseSlugs(value)).toThrow();
  });
  it("polls each run before starting the next and saves JSON plus YAML", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        http: 202,
        body: { status: "running", id: "12345678-1234-1234-1234-123456789abc" },
      })
      .mockResolvedValueOnce(complete("first-tool"))
      .mockResolvedValueOnce(complete("second-tool"));
    expect(await runWorkflow(env(), request, async () => {})).toBe(0);
    expect(request.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["POST", "/v1/internal/onboarding/run"],
      [
        "GET",
        "/v1/internal/onboarding/run/12345678-1234-1234-1234-123456789abc",
      ],
      ["POST", "/v1/internal/onboarding/run"],
    ]);
    expect(request.mock.calls[0][2]).toMatchObject({
      slug: "first-tool",
      discover: false,
    });
    expect(
      JSON.parse(readFileSync("onboarding-results/first-tool.json", "utf8"))
        .body.status
    ).toBe("success");
    expect(readFileSync("onboarding-results/first-tool.yaml", "utf8")).toBe(
      "slug: first-tool\n"
    );
    expect(readFileSync("summary.md", "utf8")).toContain(
      "first-tool: Completed"
    );
  });
  it.each([401, 503, 404, 422])(
    "fails on HTTP %s and preserves the response artifact",
    async (http) => {
      const request = vi
        .fn()
        .mockResolvedValue({
          http,
          body: { error: { message: "Action needed" } },
        });
      expect(
        await runWorkflow({ ...env(), INPUT_SLUGS: "first-tool" }, request)
      ).toBe(1);
      expect(readFileSync("summary.md", "utf8")).toContain("Action needed");
      expect(
        JSON.parse(readFileSync("onboarding-results/first-tool.json", "utf8"))
          .http
      ).toBe(http);
    }
  );
  it.each([
    { http: 401, code: "unauthorized" },
    { http: 503, code: "misconfigured" },
    { http: 200, code: "not_configured" },
  ])("stops all slugs on $http / $code, including a later slug or poll", async ({ http, code }) => {
    const failure = { http, body: { error: { code, message: "Fix configuration" } } };
    const request = vi.fn().mockResolvedValueOnce(complete("first-tool")).mockResolvedValue(failure);
    expect(await runWorkflow({ ...env(), INPUT_SLUGS: "first-tool,second-tool,third-tool" }, request)).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(readFileSync("onboarding-results/second-tool.json", "utf8")).toContain(code);
    const polling = vi.fn().mockResolvedValueOnce({ http: 202, body: { status: "running", id: "12345678-1234-1234-1234-123456789abc" } }).mockResolvedValue(failure);
    expect(await runWorkflow(env(), polling, async () => {})).toBe(1);
    expect(polling).toHaveBeenCalledTimes(2);
  });
  it("pins workflow actions to commit SHAs", () => {
    const workflow = readFileSync(resolve(import.meta.dirname, "../../../../.github/workflows/onboard-capability.yml"), "utf8");
    const actions = [...workflow.matchAll(/uses: (actions\/[^\s]+)/g)].map(m => m[1]);
    expect(actions).toHaveLength(2);
    for (const action of actions) expect(action).toMatch(/@[a-f0-9]{40}$/);
    expect(workflow.match(/# v4/g)).toHaveLength(2);
    expect(workflow).toContain("options: [onboard, backfill, limitations]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment: production-onboarding");
  });
  it("keeps the accepted run id when polling fails", async () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    const request = vi
      .fn()
      .mockResolvedValueOnce({ http: 202, body: { id, status: "running" } })
      .mockRejectedValueOnce(new Error("Connection failed"));
    expect(await runWorkflow(env(), request, async () => {})).toBe(1);
    expect(
      JSON.parse(readFileSync("onboarding-results/first-tool.json", "utf8"))
        .body.id
    ).toBe(id);
    expect(readFileSync("summary.md", "utf8")).toContain(id);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("stops the batch on busy or timeout and never reports success", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        http: 409,
        body: { busy: true, error: { message: "Wait" } },
      });
    expect(await runWorkflow(env(), request)).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("fails on a completed failed pipeline result", async () => {
    expect(
      await runWorkflow(
        { ...env(), INPUT_SLUGS: "first-tool" },
        vi
          .fn()
          .mockResolvedValue({
            http: 200,
            body: { status: "failed", errors: [{ message: "Not ready" }] },
          })
      )
    ).toBe(1);
    expect(readFileSync("summary.md", "utf8")).toContain("Not ready");
  });
});
