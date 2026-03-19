/**
 * Event-driven test triggers.
 *
 * Three triggers close the gap between scheduled test runs:
 * 1. On-failure: verify a capability on its first failure after a clean streak
 * 2. On-dependency-change: re-test affected capabilities when upstream health changes
 * 3. On-deploy: spot-check unstable/recovering capabilities after server restart
 *
 * All triggers are fire-and-forget, rate-limited, and never block the caller.
 * Test runner failures do NOT trigger these (only real /v1/do traffic does),
 * preventing recursive loops.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth, capabilities } from "../db/schema.js";
import { runTests } from "./test-runner.js";

// ─── Rate limiter ────────────────────────────────────────────────────────────

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const triggerTimestamps = new Map<string, number>();

function isRateLimited(slug: string): boolean {
  const now = Date.now();

  // Purge stale entries (older than cooldown)
  for (const [key, ts] of triggerTimestamps) {
    if (now - ts > COOLDOWN_MS) triggerTimestamps.delete(key);
  }

  const lastTriggered = triggerTimestamps.get(slug);
  if (lastTriggered && now - lastTriggered < COOLDOWN_MS) {
    const minutesAgo = Math.round((now - lastTriggered) / 60_000);
    console.log(
      `[event-trigger] Rate-limited: ${slug} already tested ${minutesAgo}m ago, skipping`,
    );
    return true;
  }

  triggerTimestamps.set(slug, now);
  return false;
}

// ─── Dependency → capability mapping ─────────────────────────────────────────

/**
 * Maps dependency health check names to the capability slugs that rely on them.
 * Derived from scanning apps/api/src/capabilities/ for service references.
 * Only includes capabilities with direct runtime dependency on the service.
 */
const DEPENDENCY_CAPABILITY_MAP: Record<string, string[]> = {
  browserless: [
    "accessibility-audit",
    "annual-report-extract",
    "austrian-company-data",
    "belgian-company-data",
    "business-license-check-se",
    "company-enrich",
    "company-tech-stack",
    "competitor-compare",
    "container-track",
    "cookie-scan",
    "credit-report-summary",
    "custom-scrape",
    "customs-duty-lookup",
    "danish-company-data",
    "dutch-company-data",
    "employer-review-summary",
    "estonian-company-data",
    "eu-court-case-search",
    "eu-regulation-search",
    "eu-trademark-search",
    "gdpr-fine-lookup",
    "german-company-data",
    "hong-kong-company-data",
    "html-to-pdf",
    "indian-company-data",
    "irish-company-data",
    "italian-company-data",
    "japanese-company-data",
    "landing-page-roast",
    "latvian-company-data",
    "lithuanian-company-data",
    "patent-search",
    "portuguese-company-data",
    "price-compare",
    "pricing-page-extract",
    "privacy-policy-analyze",
    "product-reviews-extract",
    "product-search",
    "return-policy-extract",
    "salary-benchmark",
    "screenshot-url",
    "seo-audit",
    "spanish-company-data",
    "structured-scrape",
    "swedish-company-data",
    "swiss-company-data",
    "tech-stack-detect",
    "terms-of-service-extract",
    "trustpilot-score",
    "url-to-markdown",
    "web-extract",
    "youtube-summarize",
  ],
  vies: [
    "vat-validate",
    "eori-validate",
    "vat-format-validate",
  ],
  opensanctions: [
    "sanctions-check",
    "pep-check",
    "adverse-media-check",
    "aml-risk-score",
  ],
  gleif: ["lei-lookup"],
  brreg: ["norwegian-company-data"],
  anthropic: [
    // Too many (97+) — skip individual listing. If Anthropic goes down,
    // the scheduled sweep will catch it. Testing all 97 on every health
    // check toggle would be a test storm.
  ],
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Trigger 1: On-failure ──────────────────────────────────────────────────

/**
 * Called when a capability fails during a real /v1/do execution.
 * Only triggers a test run on the FIRST failure after a clean streak.
 *
 * IMPORTANT: Only call from the /v1/do route, never from the test runner.
 * Test runner uses getExecutor() directly, so this is structurally prevented.
 */
export async function triggerOnFailure(slug: string): Promise<void> {
  if (isRateLimited(slug)) return;

  const db = getDb();
  const [health] = await db
    .select({ consecutiveFailures: capabilityHealth.consecutiveFailures })
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  // Only trigger on the first failure (consecutiveFailures was 0 → now 1).
  // recordFailure() in circuit-breaker.ts has already incremented it by the
  // time this runs, so we check for 1 (just became 1 from 0).
  // If no health record exists, this IS the first failure — trigger.
  if (health && health.consecutiveFailures > 1) {
    return; // Already known-broken, skip
  }

  console.log(
    `[event-trigger] First failure for ${slug} — running verification tests`,
  );

  try {
    const result = await runTests({ capabilitySlug: slug });
    console.log(
      `[event-trigger] Verification complete for ${slug}: ${result.passed}/${result.total} passed`,
    );
  } catch (err) {
    console.error(`[event-trigger] Verification failed for ${slug}:`, err);
  }
}

// ─── Trigger 2: On-dependency-change ────────────────────────────────────────

const lastKnownDependencyState = new Map<string, boolean>();

/**
 * Called after each dependency health check.
 * Triggers targeted test runs when a dependency changes state.
 */
export async function triggerOnDependencyChange(
  dependencyName: string,
  newHealthy: boolean,
): Promise<void> {
  const previousState = lastKnownDependencyState.get(dependencyName);
  lastKnownDependencyState.set(dependencyName, newHealthy);

  // Skip if no previous state (first check after startup) or no change
  if (previousState === undefined || previousState === newHealthy) return;

  const affectedSlugs = DEPENDENCY_CAPABILITY_MAP[dependencyName];
  if (!affectedSlugs || affectedSlugs.length === 0) return;

  // Cap the number of capabilities tested per dependency change
  const MAX_PER_CHANGE = 10;
  const slugsToTest = affectedSlugs.filter((s) => !isRateLimited(s));

  if (slugsToTest.length === 0) {
    console.log(
      `[event-trigger] Dependency ${dependencyName} changed to ${newHealthy ? "healthy" : "unhealthy"} — all ${affectedSlugs.length} capabilities rate-limited`,
    );
    return;
  }

  const limited = slugsToTest.slice(0, MAX_PER_CHANGE);
  console.log(
    `[event-trigger] Dependency ${dependencyName} changed to ${newHealthy ? "healthy" : "unhealthy"} — testing ${limited.length} affected capabilities`,
  );

  for (const slug of limited) {
    try {
      const result = await runTests({ capabilitySlug: slug });
      console.log(
        `[event-trigger] ${slug}: ${result.passed}/${result.total} passed`,
      );
    } catch (err) {
      console.error(`[event-trigger] Test failed for ${slug}:`, err);
    }
    // Stagger to avoid test storms
    if (limited.indexOf(slug) < limited.length - 1) {
      await delay(2000);
    }
  }
}

// ─── Trigger 3: On-deploy ───────────────────────────────────────────────────

let _deployTriggered = false;

/**
 * Called once at server startup. Waits 30s then tests capabilities that are
 * in unstable/recovering health state, or a random sample if all are healthy.
 */
export async function triggerOnDeploy(): Promise<void> {
  if (_deployTriggered) return;
  _deployTriggered = true;

  // Wait for server to fully initialize
  await delay(30_000);

  try {
    const db = getDb();

    // Find capabilities in unstable or recovering lifecycle state
    const unstable = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(
        inArray(capabilities.lifecycleState, ["degraded", "suspended"]),
      );

    let slugsToTest: string[];

    if (unstable.length > 0) {
      slugsToTest = unstable.map((r) => r.slug);
      console.log(
        `[event-trigger] Post-deploy verification — testing ${slugsToTest.length} degraded/suspended capabilities`,
      );
    } else {
      // All healthy — pick a random sample of 10 active capabilities
      const allActive = await db
        .select({ slug: capabilities.slug })
        .from(capabilities)
        .where(eq(capabilities.isActive, true));

      // Fisher-Yates shuffle and take first 10
      const shuffled = allActive.map((r) => r.slug);
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      slugsToTest = shuffled.slice(0, 10);
      console.log(
        `[event-trigger] Post-deploy verification — testing ${slugsToTest.length} random capabilities (all healthy)`,
      );
    }

    for (const slug of slugsToTest) {
      try {
        const result = await runTests({ capabilitySlug: slug });
        console.log(
          `[event-trigger] ${slug}: ${result.passed}/${result.total} passed`,
        );
      } catch (err) {
        console.error(`[event-trigger] Deploy test failed for ${slug}:`, err);
      }
      // Stagger between capabilities
      await delay(2000);
    }

    console.log(
      `[event-trigger] Post-deploy verification complete`,
    );
  } catch (err) {
    console.error("[event-trigger] Post-deploy verification failed:", err);
  }
}
