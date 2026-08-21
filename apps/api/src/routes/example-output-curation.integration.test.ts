/**
 * Public example-output curation, asserted on rows (WP1; closes Codex's
 * WP0 finding 4).
 *
 * The WP0 unit test asserts on the SQL text the handler builds. Codex was
 * right that this is weak: it would still pass if the predicate sat under a
 * permissive OR, joined the wrong alias, or if the handler returned customer
 * data from some other query. Because that test's db mock accepts every query
 * and returns no rows, even invalid SQL would pass it.
 *
 * These tests insert the actual rows a leak would come from and assert the
 * endpoint does not serve them. The SQL-text test is kept — it runs without a
 * database and states intent — but this is the one that proves behaviour.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { capabilities, testSuites, testResults } from "../db/schema.js";


// Environment is set only when the lane is actually going to run. These
// module-level assignments execute even when the suite skips, so applying them
// unconditionally leaked configuration into every other suite in a full-suite
// run and made an unrelated admin-auth test fail intermittently.
if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "wp1-example-secret-at-least-32-chars-long-00";
  process.env.ADMIN_SECRET ??= "wp1-example-admin-secret-at-least-32-chars-00";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/** Recognisable in a failure message if it ever escapes. */
const CUSTOMER_SECRET = "CUSTOMER-PII-MUST-NOT-BE-PUBLISHED";
const CURATED_VALUE = "curated-fixture-value";

describeMaybe("GET /capabilities/:slug/example-output — row-level curation", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let route: Awaited<typeof import("./internal-tests.js")>["internalTestsRoute"];

  const capIds: string[] = [];
  const suiteIds: string[] = [];
  const resultIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);
    ({ internalTestsRoute: route } = await import("./internal-tests.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    if (resultIds.length)
      await db.delete(testResults).where(inArray(testResults.id, resultIds));
    if (suiteIds.length)
      await db.delete(testSuites).where(inArray(testSuites.id, suiteIds));
    if (capIds.length)
      await db.delete(capabilities).where(inArray(capabilities.id, capIds));
    resultIds.length = 0;
    suiteIds.length = 0;
    capIds.length = 0;
  });

  async function seedCapability(opts: {
    slug: string;
    art22?: string;
  }): Promise<string> {
    const id = randomUUID();
    capIds.push(id);
    await db.insert(capabilities).values({
      id,
      slug: opts.slug,
      name: `WP1 example probe ${opts.slug}`,
      description: "Seeded by the WP1 example-output curation test.",
      category: "developer-tools",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      priceCents: 10,
      isActive: true,
      ...(opts.art22 ? { gdprArt22Classification: opts.art22 } : {}),
    });
    return id;
  }

  /** A passing result attached to a suite of the given type. */
  async function seedResult(opts: {
    slug: string;
    testType: string;
    output: Record<string, unknown>;
    active?: boolean;
    suiteSlug?: string;
  }) {
    const suiteId = randomUUID();
    const resultId = randomUUID();
    suiteIds.push(suiteId);
    resultIds.push(resultId);

    const updatedAt = new Date(Date.now() - 120_000);
    await db.insert(testSuites).values({
      id: suiteId,
      // Defaults to the capability under test; overridable so a mismatched
      // pairing can be constructed.
      capabilitySlug: opts.suiteSlug ?? opts.slug,
      testName: `wp1-${opts.testType}`,
      testType: opts.testType,
      input: { seeded: opts.testType },
      validationRules: { checks: [] },
      active: opts.active ?? true,
      updatedAt,
    });
    await db.insert(testResults).values({
      id: resultId,
      testSuiteId: suiteId,
      capabilitySlug: opts.slug,
      passed: true,
      responseTimeMs: 42,
      actualOutput: opts.output,
      // Must be at or after the suite's updatedAt to clear the freshness guard.
      executedAt: new Date(),
    });
  }

  async function fetchExample(slug: string) {
    const res = await route.request(`/capabilities/${slug}/example-output`);
    return { status: res.status, body: await res.text() };
  }

  it("serves a curated known_answer fixture", async () => {
    const slug = `wp1-ex-ok-${randomUUID().slice(0, 8)}`;
    await seedCapability({ slug });
    await seedResult({
      slug,
      testType: "known_answer",
      output: { value: CURATED_VALUE },
    });

    const { status, body } = await fetchExample(slug);
    expect(status).toBe(200);
    expect(body).toContain(CURATED_VALUE);
  }, 120_000);

  it("never serves a piggyback row, even when it is the only passing result", async () => {
    // Exactly the production shape: a paid capability with no curated fixture,
    // whose freshest passing row came from real customer traffic.
    const slug = `wp1-ex-pig-${randomUUID().slice(0, 8)}`;
    await seedCapability({ slug });
    await seedResult({
      slug,
      testType: "piggyback",
      output: { customer: CUSTOMER_SECRET },
    });

    const { status, body } = await fetchExample(slug);
    expect(body).not.toContain(CUSTOMER_SECRET);
    expect(status).toBe(404);
  }, 120_000);

  it("prefers the curated fixture when a piggyback row is newer", async () => {
    const slug = `wp1-ex-both-${randomUUID().slice(0, 8)}`;
    await seedCapability({ slug });
    await seedResult({
      slug,
      testType: "known_answer",
      output: { value: CURATED_VALUE },
    });
    await seedResult({
      slug,
      testType: "piggyback",
      output: { customer: CUSTOMER_SECRET },
    });

    const { status, body } = await fetchExample(slug);
    expect(status).toBe(200);
    expect(body).toContain(CURATED_VALUE);
    expect(body).not.toContain(CUSTOMER_SECRET);
  }, 120_000);

  it("refuses screening-class capabilities even with a curated fixture", async () => {
    const slug = `wp1-ex-screen-${randomUUID().slice(0, 8)}`;
    await seedCapability({ slug, art22: "screening_signal" });
    await seedResult({
      slug,
      testType: "known_answer",
      output: { subject: CUSTOMER_SECRET, is_pep: true },
    });

    const { status, body } = await fetchExample(slug);
    expect(body).not.toContain(CUSTOMER_SECRET);
    expect(status).toBe(404);
  }, 120_000);

  it("refuses a result paired with another capability's suite", async () => {
    // The join is on suite id alone, so without the slug-equality predicate a
    // result could be published under a suite belonging to something else.
    const slug = `wp1-ex-mismatch-${randomUUID().slice(0, 8)}`;
    await seedCapability({ slug });
    await seedResult({
      slug,
      testType: "known_answer",
      output: { value: CUSTOMER_SECRET },
      suiteSlug: `wp1-ex-other-${randomUUID().slice(0, 8)}`,
    });

    const { status, body } = await fetchExample(slug);
    expect(body).not.toContain(CUSTOMER_SECRET);
    expect(status).toBe(404);
  }, 120_000);

  it("refuses a retired suite's result", async () => {
    const slug = `wp1-ex-retired-${randomUUID().slice(0, 8)}`;
    await seedCapability({ slug });
    await seedResult({
      slug,
      testType: "known_answer",
      output: { value: CUSTOMER_SECRET },
      active: false,
    });

    const { status, body } = await fetchExample(slug);
    expect(body).not.toContain(CUSTOMER_SECRET);
    expect(status).toBe(404);
  }, 120_000);
});
