import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { OnboardingResult } from "../lib/onboarding-pipeline.js";
vi.mock("../lib/onboarding-pipeline.js", () => ({ runOnboarding: vi.fn() }));
vi.mock("../capabilities/auto-register.js", () => ({
  getDeactivatedCapabilities: () => new Map([["disabled-tool", "terms"]]),
}));
vi.mock("../lib/log.js", () => ({ log: { info: vi.fn(), error: vi.fn() } }));
import { createOnboardingRunRoute } from "./internal-onboarding.js";
const secret = "test-onboarding-secret-32-characters-long";
const success = (): OnboardingResult => ({
  slug: "sample-tool",
  status: "success",
  timeMs: 12,
  errors: [],
  rows: {
    created: [{ table: "capabilities", count: 1, names: ["sample-tool"] }],
    updated: [],
    deleted: [],
  },
  generatedTestTypes: ["known_answer"],
  verification: { passed: true, entries: [{ status: "passed" }] },
  readiness: { slug: "sample-tool", ready: true, issues: [] } as any,
  updatedManifestYaml: "slug: sample-tool\n",
});
let directory: string;
let pipeline: ReturnType<typeof vi.fn>;
let database: ReturnType<typeof vi.fn>;
function router(opts: Record<string, unknown> = {}) {
  return createOnboardingRunRoute({
    secret: () => secret,
    manifestDirectory: directory,
    pipeline,
    database,
    ...opts,
  } as any);
}
const headers = {
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};
function post(
  app: ReturnType<typeof router>,
  body: unknown = { slug: "sample-tool", mode: "onboard" },
  h: Record<string, string> = headers
) {
  return app.request("/run", {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "onboarding-route-"));
  writeFileSync(resolve(directory, "sample-tool.yaml"), "slug: sample-tool\n");
  pipeline = vi.fn().mockResolvedValue(success());
  database = vi.fn().mockReturnValue({ injected: true });
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("dedicated onboarding runner", () => {
  it("reads the dedicated runtime environment secret when no test override is provided", async () => {
    vi.stubEnv("ONBOARDING_RUN_SECRET", "short");
    const app = router({ secret: undefined });
    expect((await post(app)).status).toBe(503);
    vi.stubEnv("ONBOARDING_RUN_SECRET", secret);
    const res = await post(app);
    expect(res.status).toBe(202);
    await settle();
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "short"])(
    "fails closed for an unusable secret %s",
    async (value) => {
      const app = router({ secret: () => value });
      expect((await post(app)).status).toBe(503);
      expect((await app.request("/run/unknown", { headers })).status).toBe(503);
      expect(database).not.toHaveBeenCalled();
    }
  );
  it.each([undefined, "wrong", "x".repeat(secret.length)])(
    "rejects missing or wrong credentials %s",
    async (token) => {
      const app = router();
      const h = token
        ? { ...headers, Authorization: `Bearer ${token}` }
        : { "Content-Type": "application/json" };
      expect((await post(app, undefined, h)).status).toBe(401);
      expect((await app.request("/run/unknown", { headers: h })).status).toBe(
        401
      );
      expect(pipeline).not.toHaveBeenCalled();
    }
  );
  it("fails closed when the onboarding secret equals ADMIN_SECRET", async () => {
    const app = router({ secret: () => process.env.ADMIN_SECRET });
    for (const res of [await post(app), await app.request("/run/unknown", { headers })]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: { code: "misconfigured" } });
    }
    expect(database).not.toHaveBeenCalled();
  });
  it("does not accept the admin secret", async () => {
    expect(
      (
        await post(router(), undefined, {
          ...headers,
          Authorization: `Bearer ${process.env.ADMIN_SECRET}`,
        })
      ).status
    ).toBe(401);
  });
  it.each([
    "../sample-tool",
    "a/../../b",
    "a%2fb",
    "/tmp/tool",
    "a\\b",
    "a--b",
    "Upper",
    "a.yaml",
    "",
    "a\nb",
    "-a",
    "a-",
    "a".repeat(101),
  ])("rejects invalid slug %s", async (slug) => {
    expect((await post(router(), { slug, mode: "onboard" })).status).toBe(400);
    expect(pipeline).not.toHaveBeenCalled();
  });
  it.each([
    { slug: "sample-tool", mode: "delete" },
    { slug: "sample-tool", mode: "onboard", discover: "true" },
    { slug: "sample-tool", mode: "backfill", force: true },
  ])("rejects invalid body %j", async (body) => {
    expect((await post(router(), body)).status).toBe(400);
    expect(database).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and oversized requests", async () => {
    const app = router();
    expect(
      (await app.request("/run", { method: "POST", headers, body: "{" })).status
    ).toBe(400);
    expect(
      (
        await app.request("/run", {
          method: "POST",
          headers,
          body: " ".repeat(5000),
        })
      ).status
    ).toBe(413);
  });
  it("requires a deployed manifest", async () => {
    expect(
      (await post(router(), { slug: "missing-tool", mode: "onboard" })).status
    ).toBe(404);
    expect(database).not.toHaveBeenCalled();
  });
  it("refuses deactivated slugs with existing manifests", async () => {
    writeFileSync(
      resolve(directory, "disabled-tool.yaml"),
      "slug: disabled-tool\n"
    );
    expect(
      (await post(router(), { slug: "disabled-tool", mode: "onboard" })).status
    ).toBe(422);
    expect(pipeline).not.toHaveBeenCalled();
  });
  it("refuses manifest filename/slug mismatch", async () => {
    writeFileSync(resolve(directory, "sample-tool.yaml"), "slug: other-tool\n");
    expect((await post(router())).status).toBe(422);
    expect(pipeline).not.toHaveBeenCalled();
  });
  it("refuses symlinks outside the manifest directory", async () => {
    const outside = mkdtempSync(resolve(tmpdir(), "onboarding-outside-"));
    try {
      writeFileSync(resolve(outside, "external.yaml"), "slug: escape-tool\n");
      symlinkSync(
        resolve(outside, "external.yaml"),
        resolve(directory, "escape-tool.yaml")
      );
      expect(
        (await post(router(), { slug: "escape-tool", mode: "onboard" })).status
      ).toBe(400);
      expect(pipeline).not.toHaveBeenCalled();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
  it("returns 202, injects the API handle, and exposes the complete structured result", async () => {
    const app = router();
    const response = await post(app, {
      slug: "sample-tool",
      mode: "backfill",
      discover: true,
      fix: true,
    });
    expect(response.status).toBe(202);
    const started = await response.json();
    expect(started.id).toMatch(/^[a-f0-9-]{36}$/);
    await settle();
    const state = await app.request(`/run/${started.id}`, { headers });
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      id: started.id,
      status: "success",
      busy: false,
      errors: [],
      result: success(),
    });
    expect(pipeline).toHaveBeenCalledWith(
      { injected: true },
      expect.objectContaining({
        manifestYaml: "slug: sample-tool\n",
        mode: "backfill",
        discover: true,
        fix: true,
        force: true,
        signal: expect.any(AbortSignal),
      })
    );
  });
  it("holds the lock across requests and releases it after completion", async () => {
    let finish!: (result: OnboardingResult) => void;
    pipeline.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        })
    );
    const app = router();
    const first = await (await post(app)).json();
    const second = await post(app);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ run_id: first.id });
    expect(pipeline).toHaveBeenCalledTimes(1);
    finish(success());
    await settle();
    expect((await post(app)).status).toBe(202);
  });
  it("reports timeout and accepts a following run even when the pipeline never settles", async () => {
    vi.useFakeTimers();
    let finish!: (result: OnboardingResult) => void;
    pipeline.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        })
    );
    const app = router({ budgetMs: 10 });
    const started = await (await post(app)).json();
    await vi.advanceTimersByTimeAsync(11);
    expect(
      await (await app.request(`/run/${started.id}`, { headers })).json()
    ).toMatchObject({
      status: "timeout",
      busy: false,
      errors: [{ code: "timeout" }],
    });
    expect(pipeline.mock.calls[0][1].signal.aborted).toBe(true);
    let finishSecond!: (result: OnboardingResult) => void;
    pipeline.mockImplementationOnce(() => new Promise((r) => { finishSecond = r; }));
    const second = await (await post(app)).json();
    expect(second.status).toBe("running");
    finish(success());
    await settle();
    expect((await post(app)).status).toBe(409);
    finishSecond(success());
    await settle();
    expect(
      await (await app.request(`/run/${started.id}`, { headers })).json()
    ).toMatchObject({ status: "timeout", busy: false });
    expect((await post(app)).status).toBe(202);
  });
  it.each(["failed", "skipped"])(
    "reports a pipeline %s as failure",
    async (status) => {
      pipeline.mockResolvedValueOnce({
        ...success(),
        status,
        errors: [{ code: "fixture", message: "Fixture failed." }],
      });
      const app = router();
      const started = await (await post(app)).json();
      await settle();
      expect(
        await (await app.request(`/run/${started.id}`, { headers })).json()
      ).toMatchObject({
        status: "failed",
        errors: expect.arrayContaining([
          { code: "fixture", message: "Fixture failed." },
        ]),
      });
    }
  );
  it("reports readiness failure and sanitizes unexpected exceptions", async () => {
    pipeline.mockResolvedValueOnce({
      ...success(),
      readiness: { ready: false, issues: ["Missing schema"] },
    });
    const app = router();
    const first = await (await post(app)).json();
    await settle();
    expect(
      await (await app.request(`/run/${first.id}`, { headers })).json()
    ).toMatchObject({ status: "failed", errors: [{ code: "not_ready" }] });
    pipeline.mockRejectedValueOnce(new Error(`sensitive ${secret}`));
    const second = await (await post(app)).json();
    await settle();
    const raw = await (
      await app.request(`/run/${second.id}`, { headers })
    ).text();
    expect(JSON.parse(raw)).toMatchObject({
      status: "failed",
      busy: false,
      errors: [{ code: "pipeline_error" }],
    });
    expect(raw).not.toContain(secret);
  });
  it("returns 404 for an unknown run", async () => {
    expect((await router().request("/run/unknown", { headers })).status).toBe(
      404
    );
  });
  it("never reads the operator write credential", async () => {
    const name = ["DATABASE", "URL", "WRITE"].join("_");
    const originalEnv = process.env;
    process.env = new Proxy(originalEnv, {
      get(target, key) {
        if (key === name) throw new Error("Forbidden credential read");
        return Reflect.get(target, key);
      },
    });
    try {
      const app = router();
      const start = await (await post(app)).json();
      await settle();
      expect(
        await (await app.request(`/run/${start.id}`, { headers })).json()
      ).toMatchObject({ status: "success" });
      expect(
        readFileSync(
          resolve(import.meta.dirname, "internal-onboarding.ts"),
          "utf-8"
        )
      ).not.toContain(name);
    } finally {
      process.env = originalEnv;
    }
  });
  it("keeps legacy routes behind only their existing admin auth when mounted", async () => {
    const app = new Hono();
    app.route("/v1/internal/onboarding", router({ secret: () => undefined }));
    const admin = "separate-admin-secret";
    app.use("/v1/internal/*", async (c, next) =>
      c.req.header("Authorization") === `Bearer ${admin}`
        ? next()
        : c.json({ admin: true }, 401)
    );
    app.get("/v1/internal/onboarding/readiness", (c) =>
      c.json({ legacy: true })
    );
    app.post("/v1/internal/onboarding/fix-latency", (c) =>
      c.json({ legacy: true })
    );
    for (const [path, method] of [
      ["readiness", "GET"],
      ["fix-latency", "POST"],
    ]) {
      const res = await app.request(`/v1/internal/onboarding/${path}`, {
        method,
        headers: { Authorization: `Bearer ${admin}` },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ legacy: true });
      expect(
        (
          await app.request(`/v1/internal/onboarding/${path}`, {
            method,
            headers,
          })
        ).status
      ).toBe(401);
    }
    expect(
      (
        await app.request("/v1/internal/onboarding/run", {
          method: "POST",
          headers: { Authorization: `Bearer ${admin}` },
        })
      ).status
    ).toBe(503);
  });
});
