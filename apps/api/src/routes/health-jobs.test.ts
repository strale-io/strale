import { describe, it, expect, vi, beforeEach } from "vitest";
const execute = vi.hoisted(() => vi.fn());
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
import { MIGRATED_JOBS } from "../jobs/migrated-jobs.js";
import { AUXILIARY_INTERVALS } from "../lib/job-heartbeats.js";
import { createHealthJobsRoute } from "./health-jobs.js";
import { JOB_INTERVALS, jobFreshness, markJobSuccess, persistJobSuccess, readJobFreshness } from "../lib/job-heartbeats.js";

describe("public job freshness", () => {
  beforeEach(() => execute.mockReset());
  it("keeps the external inventory aligned with all registered schedules", () => {
    for (const job of MIGRATED_JOBS) expect(JOB_INTERVALS[job.job]).toBe(job.intervalMs / 1000);
    for (const [id, interval] of Object.entries(AUXILIARY_INTERVALS)) expect(JOB_INTERVALS[id]).toBe(interval);
  });
  it("fails closed on missing successes, with a nonempty stable inventory", async () => {
    const rows = jobFreshness(new Map(), 1000, 10000);
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.every((j) => !j.ok && j.last_success_age_seconds === null)).toBe(true);
    const response = await createHealthJobsRoute(async () => rows).request("/");
    expect(response.status).toBe(200);
    expect((await response.json()).jobs).toEqual(rows);
  });
  it("enforces the three-interval boundary and rejects future/invalid clocks", () => {
    const now = 1_000_000;
    for (const [age, ok] of [[180, true], [180.001, false], [-1, false], [NaN, false]] as const) {
      const job = jobFreshness(new Map([["test-scheduler", now - age * 1000]]), now).find((j) => j.id === "test-scheduler");
      expect(job?.ok).toBe(ok);
    }
  });
  it("leaks no database columns, errors, customer, money or volume fields", async () => {
    const row = { id: "test-scheduler", ok: true, last_success_age_seconds: 1, expected_interval_seconds: 60,
      customer: "private", money_cents: 99, volume: 10, last_error: "private DB host", payload: { secret: true } };
    const response = await createHealthJobsRoute(async () => [row]).request("/");
    expect(await response.json()).toEqual({ jobs: [{ id: "test-scheduler", ok: true, last_success_age_seconds: 1, expected_interval_seconds: 60 }] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("fails on empty inventory and hides database exceptions", async () => {
    for (const read of [async () => [], async (): Promise<never> => { throw new Error("private SQL"); }]) {
      const response = await createHealthJobsRoute(read).request("/");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ jobs: [] });
    }
  });
  it("reads durable successes across restarts and ignores unrelated state", async () => {
    execute.mockResolvedValue([{ source: "durable", id: "retention", at: new Date().toISOString(), last_error: "private" }, { id: "daily-digest", at: new Date().toISOString() }]);
    const jobs = await readJobFreshness();
    expect(jobs.find((j) => j.id === "retention")?.ok).toBe(true);
    expect(jobs.find((j) => j.id === "daily-digest")?.ok).toBe(true);
  });
  it("persists success only after a successful write and uses no Date binds", async () => {
    execute.mockRejectedValueOnce(new Error("write failed"));
    await expect(persistJobSuccess("meta-daily")).rejects.toThrow("write failed");
    execute.mockResolvedValue([]);
    await persistJobSuccess("meta-daily");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const query = new PgDialect().sqlToQuery(execute.mock.calls[1][0]);
    expect(query.sql).toContain("ON CONFLICT");
    expect(query.params).toContain("heartbeat:meta-daily");
    expect(query.params.some((p) => p instanceof Date || Buffer.isBuffer(p))).toBe(false);
    expect(() => markJobSuccess("unknown")).toThrow();
    expect(Object.keys(JOB_INTERVALS)).toContain("integrity-hash-retry");
  });
});

describe("job success observation", () => {
  it("does not promote swallowed errors, reported errors or skipped attempts", async () => {
    const { observeJobOutcome, noteJobFailure } = await import("../lib/job-run-context.js");
    expect((await observeJobOutcome(async () => { noteJobFailure(); })).successful).toBe(false);
    for (const outcome of ["error", "errored", "skipped-lock-busy", "skipped-no-db"]) {
      expect((await observeJobOutcome(async () => ({ outcome }))).successful).toBe(false);
    }
    expect((await observeJobOutcome(async () => ({ failed: 1 }))).successful).toBe(false);
    expect((await observeJobOutcome(async () => undefined)).successful).toBe(true);
    expect((await observeJobOutcome(async () => ({ outcome: "ok" }))).successful).toBe(true);
    await expect(observeJobOutcome(async () => { throw new Error("failure"); })).rejects.toThrow("failure");
  });
  it("isolates concurrent observed jobs", async () => {
    const { observeJobOutcome, noteJobFailure } = await import("../lib/job-run-context.js");
    const results = await Promise.all([
      observeJobOutcome(async () => { await Promise.resolve(); noteJobFailure(); }),
      observeJobOutcome(async () => { await Promise.resolve(); }),
    ]);
    expect(results.map((r) => r.successful)).toEqual([false, true]);
  });
});

it("a caught retention SQL failure cannot become a successful job heartbeat", async () => {
  const { runOneRulePaginated } = await import("../jobs/db-retention.js");
  const { observeJobOutcome } = await import("../lib/job-run-context.js");
  const observed = await observeJobOutcome(() => runOneRulePaginated(
    { table: "test_results", column: "executed_at", days: 30, idCols: "id", orderClause: "executed_at, id" },
    new Date().toISOString(),
    { execute: async () => { throw new Error("simulated SQL failure"); } },
  ));
  expect(observed.successful).toBe(false);
  expect(observed.value.error).toBe("simulated SQL failure");
});


it("meta checks distinguish an executed finding from swallowed errors or no checks", async () => {
  const { checksCompleted } = await import("../lib/job-run-context.js");
  expect(checksCompleted([])).toBe(false);
  expect(checksCompleted([{ details: "Check error: database unavailable" }])).toBe(false);
  expect(checksCompleted([{ details: "Check failed: database unavailable" }])).toBe(false);
  expect(checksCompleted([{ details: "Some capabilities stale" }])).toBe(true);
});


it("uses legacy success only until a durable row exists, never auxiliary attempts", async () => {
  const now = Date.now();
  const stale = new Date(now - 4 * 86400 * 1000).toISOString();
  const fresh = new Date(now).toISOString();
  execute.mockResolvedValue([
    { id: "heartbeat-feature-start", at: fresh, source: "epoch" },
    { id: "quality-floor", at: fresh, source: "legacy" },
    { id: "capability-promotion", at: fresh, source: "legacy" },
    { id: "capability-promotion", at: stale, source: "durable" },
    { id: "weekly-sweep", at: fresh, source: "legacy" },
  ]);
  const jobs = await readJobFreshness();
  expect(jobs.find((j) => j.id === "quality-floor")?.ok).toBe(true);
  expect(jobs.find((j) => j.id === "capability-promotion")?.ok).toBe(false);
  expect(jobs.find((j) => j.id === "weekly-sweep")?.last_success_age_seconds).toBeNull();
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const query = new PgDialect().sqlToQuery(execute.mock.calls.at(-1)[0]);
  expect(query.sql).toContain("NOT EXISTS");
  expect(query.sql).toContain("last_outcome = 'ok'");
  expect(query.sql).toContain("job_name NOT LIKE 'heartbeat:%'");
});

it.each([[30 * 86400, false], [0, true]] as const)("bounds legacy success by the persistent epoch age %s", async (age, ok) => {
  const now = Date.now();
  execute.mockResolvedValue([
    { id: "quality-floor", at: new Date(now).toISOString(), source: "legacy" },
    { id: "heartbeat-feature-start", at: new Date(now - age * 1000).toISOString(), source: "epoch" },
  ]);
  expect((await readJobFreshness()).find((j) => j.id === "quality-floor")?.ok).toBe(ok);
});

it("auxiliary grace expires one interval plus five minutes after the persistent feature epoch", async () => {
  const now = Date.now();
  for (const [age, ok] of [[86400 + 299, true], [86400 + 300, false]] as const) {
    execute.mockResolvedValue([{ id: "heartbeat-feature-start", source: "epoch", at: new Date(now - age * 1000).toISOString() }]);
    const jobs = await readJobFreshness();
    expect(jobs.find((j) => j.id === "retention")?.ok).toBe(ok);
  }
  const epoch = now;
  expect(jobFreshness(new Map(), now, 10000, epoch, new Set(["retention"])).find((j) => j.id === "retention")?.ok).toBe(false);
});

it("grants boot grace only to the five memory timers and stops after a success", async () => {
  const { MEMORY_FIRST_TICK } = await import("../lib/job-heartbeats.js");
  for (const [id, delay] of Object.entries(MEMORY_FIRST_TICK)) {
    const limit = JOB_INTERVALS[id] * 3 + delay;
    expect(jobFreshness(new Map(), 1000000, limit - 0.01).find((j) => j.id === id)?.ok).toBe(true);
    expect(jobFreshness(new Map(), 1000000, limit).find((j) => j.id === id)?.ok).toBe(false);
    expect(jobFreshness(new Map([[id, 0]]), 1000000, 0).find((j) => j.id === id)?.ok).toBe(false);
  }
  expect(jobFreshness(new Map(), 1000000, 0).find((j) => j.id === "quality-floor")?.ok).toBe(false);
});

it("caches results and failures for 30 seconds, coalesces reads, and limits IPs", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000000);
  try {
    for (const fail of [false, true]) {
      const read = vi.fn(async () => { if (fail) throw new Error("db"); return jobFreshness(new Map()); });
      const route = createHealthJobsRoute(read);
      await Promise.all([route.request("/"), route.request("/")]);
      await route.request("/");
      expect(read).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(Date.now() + 30000);
      await route.request("/");
      expect(read).toHaveBeenCalledTimes(2);
    }
    const route = createHealthJobsRoute(async () => []);
    for (let i = 0; i < 6; i++) expect((await route.request("/", { headers: { "x-real-ip": "192.0.2.123" } })).status).toBe(503);
    expect((await route.request("/", { headers: { "x-real-ip": "192.0.2.123" } })).status).toBe(429);
  } finally { clock.mockRestore(); }
});


it("initializes rollout grace at boot without refreshing it on restart", async () => {
  execute.mockReset();
  const { initializeHeartbeatGrace } = await import("../lib/job-heartbeats.js");
  execute.mockResolvedValue([]);
  await initializeHeartbeatGrace();
  await initializeHeartbeatGrace();
  const { PgDialect } = await import("drizzle-orm/pg-core");
  for (const [sql] of execute.mock.calls) {
    const query = new PgDialect().sqlToQuery(sql);
    expect(query.sql).toContain("'heartbeat-feature-start'");
    expect(query.sql).toContain("ON CONFLICT (job_name) DO NOTHING");
    expect(query.sql).not.toContain("DO UPDATE");
  }
  const { readFileSync } = await import("node:fs");
  const boot = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  expect(boot).toContain('withStartupDbRetry("heartbeat-grace", initializeHeartbeatGrace');
  for (const path of ["../lib/job-coordinator.ts", "../jobs/test-scheduler.ts", "../lib/job-heartbeats.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source).not.toContain("await initializeHeartbeatGrace();");
  }
  const scheduler = readFileSync(new URL("../jobs/test-scheduler.ts", import.meta.url), "utf8");
  expect(scheduler).toMatch(/withAdvisoryLock\(LOCK_ID, async \(\) => \{\s*markJobSuccess\("test-scheduler"\)/);
});
