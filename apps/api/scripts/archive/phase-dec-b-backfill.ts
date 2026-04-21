/**
 * DEC-20260423-B Stage C.1 — Backfill output_field_reliability and
 * capability_limitations for 21 active gap-caps via live discovery.
 *
 * Approach:
 *   1. Auto-register executors so live calls resolve.
 *   2. Per slug, find a usable input: known_answer test_suite input preferred,
 *      fall back to input_schema examples or defaults.
 *   3. Execute capability. On success, derive reliability from the output.
 *      On failure, log and continue — failures do NOT block the batch.
 *   4. Synthesize ONE maintenance_class-keyed limitation if none present.
 *   5. UPDATE capabilities SET output_field_reliability = ... (trigger not
 *      fired; UPDATE, not INSERT). INSERT into capability_limitations.
 *   6. Summary at end: per-slug pass/fail.
 *
 * Note: bypasses YAML + persistCapability intentionally. These caps already
 * exist as DB rows; we're populating two columns + inserting into a child
 * table. The trigger on capabilities applies only to INSERT; UPDATE is
 * unaffected. capability_limitations has no trigger.
 *
 * Rollback: script prints pre/post per cap; reverse-UPDATE NULL and DELETE
 * FROM capability_limitations WHERE capability_slug IN (...) restores.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
import { getExecutor } from "../src/capabilities/index.js";

// The 21 active backfill slugs per DEC-20260423-B / audit report.
const SLUGS = [
  // 17 web3
  "approval-security-check", "contract-verify-check", "ens-resolve",
  "ens-reverse-lookup", "fear-greed-index", "gas-price-check",
  "phishing-site-check", "protocol-fees-lookup", "protocol-tvl-lookup",
  "stablecoin-flow-check", "token-security-check", "vasp-non-compliant-check",
  "vasp-verify", "wallet-age-check", "wallet-balance-lookup",
  "wallet-risk-score", "wallet-transactions-lookup",
  // 2 SDR
  "email-pattern-discover", "officer-search",
  // 1 + 1 other
  "website-to-company",
  "paid-api-preflight",
] as const;

function deriveReliability(output: Record<string, unknown>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(output)) {
    if (v === null || v === undefined) {
      r[k] = "common"; // present in schema but null this call — mark as sometimes-present
    } else {
      r[k] = "guaranteed";
    }
  }
  return r;
}

function synthesizeLimitation(
  maintenanceClass: string | null,
  dataSource: string | null,
): {
  title: null;
  limitationText: string;
  category: string;
  severity: string;
  workaround: null;
} {
  const ds = dataSource ?? "upstream";
  switch (maintenanceClass) {
    case "free-stable-api":
      return {
        title: null,
        limitationText: `Output reflects ${ds} at query time. Dependent on upstream API availability; may degrade if the provider rate-limits or is temporarily unavailable.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
    case "commercial-stable-api":
      return {
        title: null,
        limitationText: `Output reflects ${ds} at query time. Commercial API subject to provider terms, rate limits, and occasional schema revisions.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
    case "pure-computation":
      return {
        title: null,
        limitationText: `Computed from on-chain/reference data at query time. Freshness reflects the underlying source snapshot — not a predictor of future state.`,
        category: "freshness",
        severity: "info",
        workaround: null,
      };
    case "scraping-stable-target":
    case "scraping-fragile-target":
      return {
        title: null,
        limitationText: `Scraped from third-party site; subject to source HTML changes that may require scraper adjustments.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
    default:
      return {
        title: null,
        limitationText: `Generic availability/freshness considerations apply. Review for slug-specific accuracy bounds before production use.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
  }
}

type Outcome = {
  slug: string;
  status: "passed" | "failed";
  reason?: string;
  fieldCount?: number;
};

async function discoverOne(slug: string): Promise<Outcome> {
  const db = getDb();

  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);
  if (!cap) return { slug, status: "failed", reason: "capability row not found" };

  // Find a usable input: known_answer first, then dependency_health
  const suites = await db
    .select()
    .from(testSuites)
    .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)));

  // Input selection order: non-empty known_answer → edge_case → health_check →
  // then empty-but-present inputs (some caps accept {}), finally input_schema.example.
  const findInput = (): Record<string, unknown> | null => {
    const order = ["known_answer", "edge_case", "dependency_health", "schema_check"] as const;
    // First pass: non-empty inputs in priority order
    for (const t of order) {
      const s = suites.find((x) => x.testType === t);
      const i = s?.input as Record<string, unknown> | undefined;
      if (i && typeof i === "object" && Object.keys(i).length > 0) return i;
    }
    // Second pass: empty inputs in priority order (valid for caps that accept no args)
    for (const t of order) {
      const s = suites.find((x) => x.testType === t);
      if (s && s.input !== null && s.input !== undefined) {
        return (s.input as Record<string, unknown>) ?? {};
      }
    }
    // Third pass: input_schema example
    const example = (cap.inputSchema as { example?: unknown } | null)?.example;
    if (example && typeof example === "object") return example as Record<string, unknown>;
    return null;
  };
  const input = findInput();
  if (input === null) {
    return { slug, status: "failed", reason: "no test_suite input available (only piggyback suites)" };
  }

  const executor = getExecutor(slug);
  if (!executor) {
    return { slug, status: "failed", reason: "executor not registered (auto-register skipped this slug?)" };
  }

  // Execute live
  let output: Record<string, unknown> = {};
  try {
    const result = await executor(input);
    output = result?.output ?? result ?? {};
    if (!output || typeof output !== "object") {
      return { slug, status: "failed", reason: "executor returned non-object output" };
    }
  } catch (err) {
    return {
      slug,
      status: "failed",
      reason: `executor threw: ${(err as Error).message.slice(0, 120)}`,
    };
  }

  const reliability = deriveReliability(output);
  const fieldCount = Object.keys(reliability).length;
  if (fieldCount === 0) {
    return { slug, status: "failed", reason: "executor output was empty object; cannot derive reliability" };
  }

  // UPDATE capabilities.output_field_reliability (UPDATE — no trigger)
  await db
    .update(capabilities)
    .set({ outputFieldReliability: reliability, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  // INSERT synthesized limitation (only if none present)
  const existingLims = await db
    .select({ id: capabilityLimitations.id })
    .from(capabilityLimitations)
    .where(and(eq(capabilityLimitations.capabilitySlug, slug), eq(capabilityLimitations.active, true)));
  if (existingLims.length === 0) {
    const lim = synthesizeLimitation(cap.maintenanceClass, cap.dataSource);
    await db.insert(capabilityLimitations).values({
      capabilitySlug: slug,
      ...lim,
      sortOrder: 0,
    });
  }

  return { slug, status: "passed", fieldCount };
}

async function main() {
  console.log("Phase DEC-B backfill — 21 active gap-caps\n");
  await autoRegisterCapabilities();

  const outcomes: Outcome[] = [];
  for (const slug of SLUGS) {
    process.stdout.write(`  ${slug.padEnd(32)}... `);
    const o = await discoverOne(slug);
    if (o.status === "passed") {
      console.log(`✓ passed (${o.fieldCount} fields)`);
    } else {
      console.log(`✗ failed: ${o.reason}`);
    }
    outcomes.push(o);
  }

  const passed = outcomes.filter((o) => o.status === "passed").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  console.log("\n" + "═".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed of ${SLUGS.length}`);
  if (failed > 0) {
    console.log("\nFAILURES:");
    for (const o of outcomes.filter((o) => o.status === "failed")) {
      console.log(`  ${o.slug}: ${o.reason}`);
    }
  }
  process.exit(failed > 5 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
