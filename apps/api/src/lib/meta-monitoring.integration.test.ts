/**
 * The daily meta checks against a real Postgres.
 *
 * meta-daily records a success only when every daily check completes. One of
 * them, free_tier_health, bound a JS array into `ANY(${...})`, which Postgres
 * refuses, so the job never recorded a success. Its unit test renders SQL
 * through a mock, and a rendered string cannot fail on what the server accepts
 * (LESSONS F5 incident 10). This runs the real checks on the real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDatabase } from "../test-support/integration-db.js";
import { capabilities } from "../db/schema.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

let getDb: typeof import("../db/index.js")["getDb"];
let closeDbPool: typeof import("../db/index.js")["closeDbPool"];

describeMaybe("daily meta checks against disposable Postgres", () => {
  const slug = "test-meta-daily-free-tier";
  // runDailyChecks syncs the [stuck-validating] GitHub issues, and a disposable
  // database has nothing stuck: with a real GITHUB_TOKEN in the environment it
  // would close every such issue in the live repository. Without a token the
  // sync logs and skips (github-issues.ts), so remove it for this suite.
  const savedGithubToken = process.env.GITHUB_TOKEN;

  beforeAll(async () => {
    delete process.env.GITHUB_TOKEN;
    ({ getDb, closeDbPool } = await import("../db/index.js"));
    await getDb().delete(capabilities).where(eq(capabilities.slug, slug));
    await getDb().insert(capabilities).values({ slug, name: slug, description: "meta-daily fixture", category: "validation", priceCents: 0, isActive: true, visible: true, x402Enabled: false, isFreeTier: true, transparencyTag: "algorithmic", inputSchema: {}, outputSchema: {} });
  });

  afterAll(async () => {
    await getDb().delete(capabilities).where(eq(capabilities.slug, slug));
    await closeDbPool();
    if (savedGithubToken !== undefined) process.env.GITHUB_TOKEN = savedGithubToken;
  });

  it("free_tier_health runs on the server and sees the flagged capability", async () => {
    const { checkFreeTierHealth } = await import("./meta-monitoring.js");
    const result = await checkFreeTierHealth();
    expect(result.details).not.toMatch(/^Check error/);
    expect(result.passed).toBe(true);
    expect(result.details).toMatch(/^All [1-9]\d* free-tier capabilities healthy/);
  });

  it("every daily check completes, so meta-daily can record its success", async () => {
    const { runDailyChecks } = await import("./meta-monitoring.js");
    const { checksCompleted } = await import("./job-run-context.js");
    const results = await runDailyChecks();
    expect(results.filter((r) => /^Check (?:error|failed):/.test(r.details)).map((r) => `${r.check}: ${r.details}`)).toEqual([]);
    expect(checksCompleted(results)).toBe(true);
  });
});
