/**
 * Phase 4b.2 — Generate full YAML manifests for 17 web3 orphan capabilities.
 *
 * SCOPE (post plan-refinement):
 *   - 17 active web3 capabilities (decision: yaml-generate, high confidence) ✓
 *
 * HALTED (out of scope, require Petter/follow-up):
 *   - 9 UK-property suspended capabilities (decision: suspend-add-yaml):
 *       Missing both active test_suites (no known_answer) AND limitations in DB.
 *       Need `--backfill --discover` onboarding-pipeline pass before YAML is
 *       honestly authorable. Synthesizing fixtures from thin air would be
 *       fiction. Flagged in commit message for dedicated follow-up.
 *   - 3 deactivated slugs (decision: delete): FK-blocked (transactions.capability_id
 *       has 121 audit-trail refs combined). Flagged in the CSV + commit.
 *   - 2 SDR suspend-no-yaml (parked yesterday): no action needed.
 *   - 1 already-retired SG: no action needed.
 *
 * Source of truth: DB rows. Strategy A from the Phase 4b audit.
 *
 * Two fallbacks applied to unblock 4b.1 CI gate compliance for the 17:
 *
 * 1) output_field_reliability: DB column is NULL for all 17. Fallback-derives
 *    from output_schema.properties keys, marking each as "common" (safe
 *    default; does not produce false-positive "guaranteed" assertions).
 *    Phase 4b.1 audit § 4.10 already scheduled a `--discover` pass to
 *    tighten these; this generator unblocks 4b.2 without waiting for that.
 *
 * 2) limitations: DB has 0 active capability_limitations rows for all 17.
 *    Auto-synthesizes ONE generic but true limitation keyed on maintenance_class
 *    (free-stable-api → upstream API dependency; pure-computation → on-chain/
 *    reference-data freshness). Clearly marked in YAML header. Petter can
 *    tighten per-slug later.
 *
 * Mode:
 *   --dry-run   Validate all 17 manifests against validateManifest() without
 *               writing files. Halts if any would fail the CI gate.
 *   (default)   Write all 17 files + validate (halts mid-batch on failure).
 *
 * Context: audit-reports/2026-04-21-phase-4b2-orphan-audit.md @ 8a4e51b,
 *          audit-reports/2026-04-21-phase-4b2-orphan-decisions.csv @ b416053
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq, and, inArray } from "drizzle-orm";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import yaml from "js-yaml";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import { validateManifest } from "../src/lib/onboarding-gates.js";
import type { Manifest } from "../src/lib/capability-manifest-types.js";

const YAML_GENERATE_SLUGS = [
  "approval-security-check", "contract-verify-check", "ens-resolve",
  "ens-reverse-lookup", "fear-greed-index", "gas-price-check",
  "phishing-site-check", "protocol-fees-lookup", "protocol-tvl-lookup",
  "stablecoin-flow-check", "token-security-check", "vasp-non-compliant-check",
  "vasp-verify", "wallet-age-check", "wallet-balance-lookup",
  "wallet-risk-score", "wallet-transactions-lookup",
] as const;

// 9 UK-property suspend-add-yaml slugs are HALTED (no fixtures + no limitations in DB).
// Left here for reference; the follow-up prompt should run --backfill --discover against
// each after un-suspending them for the pipeline pass:
//   council-tax-lookup, stamp-duty-calculate, uk-crime-stats, uk-deprivation-index,
//   uk-epc-rating, uk-flood-risk, uk-rental-yield, uk-sold-prices, uk-transport-access.

const ALL_SLUGS = [...YAML_GENERATE_SLUGS];
const MANIFEST_DIR = resolve(import.meta.dirname, "../../../manifests");

function capTypeToDataSourceType(capType: string): string {
  switch (capType) {
    case "deterministic": return "computed";
    case "stable_api": return "api";
    case "scraping": return "scrape";
    case "ai_assisted": return "api";
    default: return "api";
  }
}

function deriveReliability(
  dbReliability: Record<string, string> | null,
  outputSchema: Record<string, unknown> | null,
): Record<string, string> {
  if (dbReliability && Object.keys(dbReliability).length > 0) return dbReliability;
  // Fallback: derive from output_schema.properties keys, default "common"
  const props = (outputSchema as { properties?: Record<string, unknown> } | null)?.properties;
  if (!props) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(props)) out[key] = "common";
  return out;
}

/**
 * Auto-synthesize ONE generic limitation keyed on maintenance_class.
 * All 17 target slugs have 0 active capability_limitations in DB. The CI gate
 * requires at least 1 limitation per manifest. These synthesized entries are
 * generic-but-true for the maintenance class; Petter can add slug-specific
 * limitations in a follow-up review.
 */
function synthesizeLimitation(maintenanceClass: string | null, dataSource: string | null) {
  const ds = dataSource ?? "upstream";
  switch (maintenanceClass) {
    case "free-stable-api":
      return {
        title: null,
        text: `Output reflects ${ds} at query time. Dependent on upstream API availability; may degrade if the provider rate-limits or is temporarily unavailable.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
    case "commercial-stable-api":
      return {
        title: null,
        text: `Output reflects ${ds} at query time. Commercial API subject to provider terms, rate limits, and occasional schema revisions.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
    case "pure-computation":
      return {
        title: null,
        text: `Computed from on-chain/reference data at query time. Freshness reflects the underlying source snapshot — not a predictor of future state.`,
        category: "freshness",
        severity: "info",
        workaround: null,
      };
    case "scraping-stable-target":
    case "scraping-fragile-target":
      return {
        title: null,
        text: `Scraped from third-party site; subject to source HTML changes that may require scraper adjustments.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
    default:
      return {
        title: null,
        text: `Generic availability/freshness considerations apply. Review for slug-specific accuracy bounds before production use.`,
        category: "availability",
        severity: "info",
        workaround: null,
      };
  }
}

async function buildManifest(slug: string): Promise<Manifest | null> {
  const db = getDb();

  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);
  if (!cap) return null;

  const suites = await db
    .select()
    .from(testSuites)
    .where(
      and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)),
    );

  const lims = await db
    .select()
    .from(capabilityLimitations)
    .where(
      and(
        eq(capabilityLimitations.capabilitySlug, slug),
        eq(capabilityLimitations.active, true),
      ),
    );

  const reliability = deriveReliability(
    cap.outputFieldReliability as Record<string, string> | null,
    cap.outputSchema as Record<string, unknown> | null,
  );

  // Build test_fixtures from known_answer + dependency_health suites
  const knownAnswerSuite = suites.find((s) => s.testType === "known_answer");
  const healthCheckSuite = suites.find((s) => s.testType === "dependency_health");
  const testFixtures: Manifest["test_fixtures"] = {};

  if (knownAnswerSuite) {
    const rules = knownAnswerSuite.validationRules as {
      checks?: Array<{ field: string; operator: string; value?: unknown; values?: unknown[] }>;
    } | null;
    const expectedFields = (rules?.checks ?? []).map((check) => {
      const topField = check.field.split(".")[0];
      const entry: { field: string; operator: string; reliability: string; value?: unknown; values?: unknown[] } = {
        field: check.field,
        operator: check.operator,
        reliability: reliability[topField] ?? "common",
      };
      if (check.value !== undefined) entry.value = check.value;
      if (check.values !== undefined) entry.values = check.values;
      return entry;
    });
    testFixtures.known_answer = {
      input: knownAnswerSuite.input as Record<string, unknown>,
      expected_fields: expectedFields,
    };
  }

  if (healthCheckSuite) {
    testFixtures.health_check_input = healthCheckSuite.input as Record<string, unknown>;
  }

  const capType = cap.capabilityType ?? "stable_api";

  const manifest: Manifest = {
    slug: cap.slug,
    name: cap.name,
    description: cap.description,
    category: cap.category,
    price_cents: cap.priceCents,
    is_free_tier: cap.isFreeTier ?? false,
    input_schema: cap.inputSchema as Record<string, unknown>,
    output_schema: cap.outputSchema as Record<string, unknown>,
    data_source: cap.dataSource ?? "",
    data_source_type: capTypeToDataSourceType(capType),
    transparency_tag: cap.transparencyTag ?? null,
    maintenance_class: cap.maintenanceClass,
    processes_personal_data: cap.processesPersonalData,
    personal_data_categories: (cap.personalDataCategories ?? []) as string[],
    ...(cap.freshnessCategory ? { freshness_category: cap.freshnessCategory } : {}),
    ...(cap.geography ? { geography: cap.geography } : {}),
    test_fixtures: testFixtures,
    output_field_reliability: reliability,
    limitations: lims.length > 0
      ? lims.map((l) => ({
          title: l.title ?? "",
          text: l.limitationText,
          category: l.category,
          severity: l.severity,
          workaround: l.workaround ?? null,
        }))
      : [synthesizeLimitation(cap.maintenanceClass, cap.dataSource)],
  };

  return manifest;
}

function manifestToYamlContent(manifest: Manifest): string {
  const today = new Date().toISOString().slice(0, 10);
  const header =
    `# Auto-generated from database on ${today} (Phase 4b.2 orphan resolution).\n` +
    `# Source: DEC-20260422-A + audit-reports/2026-04-21-phase-4b2-orphan-decisions.csv.\n` +
    `# output_field_reliability fallback-derived from output_schema.properties (DB column was NULL).\n` +
    `# limitations auto-synthesized from maintenance_class (0 active capability_limitations in DB).\n` +
    `# Review and tighten: reliability markers (common → guaranteed/rare) + slug-specific limitations.\n\n`;
  return header + yaml.dump(manifest, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    sortKeys: false,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  mkdirSync(MANIFEST_DIR, { recursive: true });

  console.log(`Phase 4b.2 orphan YAML generator — ${dryRun ? "DRY RUN" : "WRITING"}\n`);
  console.log(`Scope: ${YAML_GENERATE_SLUGS.length} web3 yaml-generate manifests\n`);
  console.log(`HALTED (out of scope): 9 UK-property suspend-add-yaml (missing DB fixtures/limitations),\n` +
              `                       3 deactivated delete (FK-blocked).\n`);

  // Pre-check: no target slug already has a YAML (would overwrite)
  for (const slug of ALL_SLUGS) {
    const path = resolve(MANIFEST_DIR, `${slug}.yaml`);
    if (existsSync(path)) {
      throw new Error(`${slug}.yaml already exists — refusing to overwrite. Investigate before proceeding.`);
    }
  }
  console.log(`Pre-check: none of ${ALL_SLUGS.length} target slugs has an existing YAML. Safe to proceed.\n`);

  const failures: Array<{ slug: string; errors: string[] }> = [];
  const results: Array<{ slug: string; manifest: Manifest; content: string }> = [];

  for (const slug of ALL_SLUGS) {
    const manifest = await buildManifest(slug);
    if (!manifest) {
      failures.push({ slug, errors: ["capability row not found in DB"] });
      continue;
    }

    // Validate against the same gate the CI completeness test uses
    const errors = validateManifest(manifest, /* discover */ false);
    if (errors.length > 0) {
      failures.push({ slug, errors });
      continue;
    }

    const content = manifestToYamlContent(manifest);
    results.push({ slug, manifest, content });
  }

  if (failures.length > 0) {
    console.log(`FAILURES (${failures.length}):`);
    for (const f of failures) {
      console.log(`  ${f.slug}:`);
      for (const e of f.errors) console.log(`    - ${e}`);
    }
    console.log("\nHalting — no files written. Fix the failures above first.");
    process.exit(1);
  }

  console.log(`All ${results.length} manifests validated against validateManifest().`);

  if (dryRun) {
    console.log("\n--dry-run — no files written. Summary:");
    for (const r of results) {
      const fieldCount = Object.keys(r.manifest.output_field_reliability ?? {}).length;
      const limCount = r.manifest.limitations?.length ?? 0;
      const kaFields = r.manifest.test_fixtures?.known_answer?.expected_fields?.length ?? 0;
      console.log(`  ${r.slug} category=${r.manifest.category} price=${r.manifest.price_cents}¢ fields=${fieldCount} limits=${limCount} ka=${kaFields}`);
    }
    process.exit(0);
  }

  for (const r of results) {
    const path = resolve(MANIFEST_DIR, `${r.slug}.yaml`);
    writeFileSync(path, r.content, "utf8");
    console.log(`WROTE ${r.slug}.yaml`);
  }

  console.log(`\nWrote ${results.length} manifests to ${MANIFEST_DIR}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
