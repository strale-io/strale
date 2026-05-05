import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { getDb } from "../src/db/index.js";
import { capabilities, testSuites, testResults } from "../src/db/schema.js";
import { eq, inArray, desc, gte, and, sql } from "drizzle-orm";

const SLUGS = ["singapore-company-data", "nl-bag-address", "html-to-pdf", "landing-page-roast"];

async function main() {
  const db = getDb();
  const caps = await db.select().from(capabilities).where(inArray(capabilities.slug, SLUGS));
  for (const c of caps) {
    console.log("\n=== " + c.slug + " ===");
    console.log("  lifecycle_state:", c.lifecycleState);
    console.log("  is_active:", c.isActive);
    console.log("  capability_type:", c.capabilityType);
    console.log("  last_tested_at:", c.lastTestedAt);
    console.log("  deactivation_reason:", (c as any).deactivationReason || "(null)");

    const suites = await db.select({ test_type: testSuites.testType, active: testSuites.active, status: testSuites.testStatus, updated: testSuites.updatedAt }).from(testSuites).where(eq(testSuites.capabilitySlug, c.slug));
    console.log("  suites:", suites.length);
    for (const s of suites) console.log("    - " + s.test_type + " active=" + s.active + " status=" + s.status + " updated=" + s.updated);

    const recent = await db.select({ executed: testResults.executedAt, passed: testResults.passed, fail: testResults.failureReason, suiteId: testResults.testSuiteId })
      .from(testResults)
      .where(and(eq(testResults.capabilitySlug, c.slug), gte(testResults.executedAt, sql`NOW() - INTERVAL '7 days'`)))
      .orderBy(desc(testResults.executedAt))
      .limit(5);
    console.log("  recent test_results (7d):", recent.length);
    for (const r of recent) console.log("    - " + r.executed + " passed=" + r.passed + (r.fail ? " fail=" + r.fail.slice(0,80) : ""));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
