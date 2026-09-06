import { config } from "dotenv";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { SOLUTIONS, type SolutionDef, type SolutionStep } from "./solution-catalogue.js";

function buildComplianceCoverage(sol: SolutionDef): ComplianceCoverageItem[] {
  const items: ComplianceCoverageItem[] = [];
  const stepSlugs = sol.steps.map((s) => s.capabilitySlug);
  const hasAI = sol.transparencyTag === "mixed" || sol.transparencyTag === "ai_generated";
  const isEU = ["eu", "eu-global", "nordic"].includes(sol.geography);
  const isCompliance = ["compliance-verification", "security-risk", "legal-regulatory"].includes(sol.category);

  // Geography relevance: primary if scope matches solution geography, supporting otherwise
  const geo = sol.geography; // e.g. "us", "us-global", "eu", "eu-global", "nordic", "global"
  const geoHasUS = geo.includes("us");
  const geoHasEU = geo === "eu" || geo === "eu-global" || geo === "nordic";
  function relevance(scope: "eu" | "us" | "global"): "primary" | "supporting" {
    if (scope === "global") return "primary";
    if (scope === "us" && geoHasUS) return "primary";
    if (scope === "eu" && geoHasEU) return "primary";
    return "supporting";
  }

  // Platform-level (all solutions)
  items.push({
    framework: "Audit Trail",
    reference: "Per-transaction record",
    requirement: "Traceable execution records for every API call",
    straleProvides: "Per-step timestamps, data sources, latency, schema validation, and input fingerprinting on every transaction",
    scope: "global",
    geographyRelevance: "primary",
  });
  items.push({
    framework: "Audit Trail",
    reference: "Trust Service Criteria CC7.2 (SOC 2)",
    requirement: "System operations monitoring and anomaly detection",
    straleProvides: "Continuous quality monitoring with automated health tracking — supports audit trail documentation for SOC 2 reviews",
    scope: "global",
    geographyRelevance: "primary",
  });

  // EU AI Act (if has AI involvement)
  if (hasAI) {
    const euRelevance = relevance("eu");
    items.push({
      framework: "EU AI Act",
      reference: "Article 12",
      requirement: "Record-keeping and automatic logging of AI system operations",
      straleProvides: "Provides detailed execution logging with per-step timestamps, data sources, and latency metrics beyond typical API audit trails",
      scope: "eu",
      geographyRelevance: euRelevance,
    });
    items.push({
      framework: "EU AI Act",
      reference: "Article 13",
      requirement: "Transparency — users must understand AI system output",
      straleProvides: "Documents data source transparency and AI involvement level per step",
      scope: "eu",
      geographyRelevance: euRelevance,
    });
    items.push({
      framework: "EU AI Act",
      reference: "Article 14",
      requirement: "Human oversight measures must be documented",
      straleProvides: "Human oversight classification documented per step — demonstrates to regulators which steps involve AI decision-making and which are fully deterministic",
      scope: "eu",
      geographyRelevance: euRelevance,
    });
    items.push({
      framework: "EU AI Act",
      reference: "Article 50",
      requirement: "AI-generated content must be marked",
      straleProvides: "Logs AI involvement per step (LLM, algorithmic, or none)",
      scope: "eu",
      geographyRelevance: euRelevance,
    });
  }

  // GDPR (EU-primary solutions get primary relevance; us-global/global get supporting)
  if (isEU || geo === "us-global" || geo === "global") {
    const gdprRelevance = isEU ? "primary" : "supporting" as const;
    items.push({
      framework: "GDPR",
      reference: "Article 30",
      requirement: "Record of processing activities with data classifications",
      straleProvides: "Provides complete processing record with per-step data classifications and source documentation",
      scope: "eu",
      geographyRelevance: gdprRelevance,
    });
    items.push({
      framework: "GDPR",
      reference: "Articles 15/17",
      requirement: "Data subject access and right to erasure",
      straleProvides: "Transaction data accessible via API and deletable via DELETE endpoint",
      scope: "eu",
      geographyRelevance: gdprRelevance,
    });
  }

  // Sanctions screening (if includes sanctions-check)
  if (stepSlugs.includes("sanctions-check")) {
    items.push({
      framework: "Sanctions Screening",
      reference: "31 CFR Part 501",
      requirement: "Screening against OFAC SDN and consolidated sanctions lists",
      straleProvides: "Automated screening against OFAC SDN, EU consolidated, and UN sanctions databases on every execution",
      scope: "us",
      geographyRelevance: relevance("us"),
    });
  }

  // Regulatory data (if includes us-company-data)
  if (stepSlugs.includes("us-company-data")) {
    items.push({
      framework: "Regulatory Data",
      reference: "Securities Exchange Act",
      requirement: "Use of authoritative regulatory data for due diligence",
      straleProvides: "Company data sourced from SEC EDGAR — official regulatory filings, not scraped third-party data",
      scope: "us",
      geographyRelevance: relevance("us"),
    });
  }

  // Vendor due diligence (if compliance/security category)
  if (isCompliance) {
    items.push({
      framework: "Vendor Due Diligence",
      reference: "Internal controls",
      requirement: "Documented vendor assessment with traceable data sources",
      straleProvides: "Every data point traced to its authoritative source with classification, timestamp, and AI involvement level",
      scope: "global",
      geographyRelevance: "primary",
    });
  }

  return items;
}

import { capabilities, solutions, solutionSteps, type ComplianceCoverageItem } from "./schema.js";
import { eq, inArray, sql } from "drizzle-orm";
import { validateSolution, enforceGates } from "../lib/onboarding-gates.js";



/**
 * Whether a solution was switched off for a stated reason, and so must not be
 * switched back on by the qualification sweep at the end of `seed()`.
 *
 * That sweep can only judge whether a solution's steps currently pass their
 * tests. It cannot see WHY the solution was turned off, and a passing test says
 * nothing about whether we are licensed to sell the result.
 *
 * `vendor:` markers are excluded because vendor-control-tower.ts owns those and
 * runs its own restore cycle — it uses this same convention on this same table
 * (`deactivation_reason IS NULL OR LIKE 'vendor:%'`). The sweep had no such
 * check and would revive anything whose steps happened to be green.
 *
 * Found 2026-09-06: `web3-pre-trade` was deactivated three times because its
 * `crypto-price` step rests on CoinGecko's free Demo plan, which excludes
 * commercial use, and three times came back within minutes with
 * `x402_enabled` and the reason still intact.
 *
 * Exported so the test exercises THIS function rather than a copy of it.
 */
export function wasDeactivatedDeliberately(deactivationReason: unknown): boolean {
  const reason = typeof deactivationReason === "string" ? deactivationReason : "";
  return reason.trim() !== "" && !reason.startsWith("vendor:");
}

// ─── Seed logic ─────────────────────────────────────────────────────────────

/** €0.02–€1.00 (charter § Authority). Outside it is a founder decision. */
const PRICE_BAND_MIN_CENTS = 2;
const PRICE_BAND_MAX_CENTS = 100;

const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_PRICE_CHANGES = process.argv.includes("--allow-price-changes");

async function seed() {
  const db = getDb();
  if (DRY_RUN) console.log("DRY RUN — no writes.");

  // Collect all capability slugs referenced by solutions (steps + extendsWith)
  const allSlugs = [
    ...new Set([
      ...SOLUTIONS.flatMap((s) => s.steps.map((st) => st.capabilitySlug)),
      ...SOLUTIONS.flatMap((s) => s.extendsWith),
    ]),
  ];

  // Verify they exist in the database
  const capRows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(inArray(capabilities.slug, allSlugs));
  const existingSlugs = new Set(capRows.map((r) => r.slug));
  const missing = allSlugs.filter((s) => !existingSlugs.has(s));
  if (missing.length) {
    console.warn(`WARNING: Missing capabilities: ${missing.join(", ")}`);
  }

  let seeded = 0;
  let skipped = 0;
  const priceDrift: string[] = [];
  const outOfBand: string[] = [];
  const gateFailed: string[] = [];

  for (const sol of SOLUTIONS) {
    // Check if any step references a missing capability
    const missingSlugs = sol.steps.filter(
      (st) => !existingSlugs.has(st.capabilitySlug),
    );
    if (missingSlugs.length) {
      console.warn(
        `  SKIP ${sol.slug} — missing: ${missingSlugs.map((s) => s.capabilitySlug).join(", ")}`,
      );
      skipped++;
      continue;
    }

    const complianceCoverage = buildComplianceCoverage(sol);

    // Gate checks: validate solution before writing.
    //
    // One bad definition used to abort the whole run: enforceGates throws, and
    // because each solution is written in its own transaction rather than the
    // run being atomic, the catalogue was left half-updated. `kyc-denmark` has
    // carried a bad step reference for months, which is why production stopped
    // tracking these definitions around 2026-04-12 — every run since died on
    // it. A failing definition now skips itself and the run continues, with
    // everything skipped reported at the end.
    const gateViolations = await validateSolution(
      sol.slug,
      sol.inputSchema,
      sol.steps.map((s) => ({ capabilitySlug: s.capabilitySlug, stepOrder: s.stepOrder, inputMap: s.inputMap })),
    );
    try {
      enforceGates(gateViolations);
    } catch (err) {
      const detail = err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 200) : String(err);
      console.warn(`  SKIP ${sol.slug} — gate violation: ${detail}`);
      gateFailed.push(`${sol.slug}: ${detail}`);
      skipped++;
      continue;
    }

    // The EUR0.02-1.00 band is the CAPABILITY pricing framework
    // (DEC-20260302-A). Bundles are priced above it by design — the KYB
    // families sell at EUR2.50 — so an out-of-band solution price is worth
    // surfacing, not refusing. A first draft refused them outright and
    // thereby excluded 13 live solutions from ever being updated again;
    // caught in a dry run.
    //
    // The protection that actually matters is below: an existing solution's
    // live price is never overwritten without --allow-price-changes.
    if (sol.priceCents < PRICE_BAND_MIN_CENTS || sol.priceCents > PRICE_BAND_MAX_CENTS) {
      outOfBand.push(`${sol.slug} @ EUR${(sol.priceCents / 100).toFixed(2)}`);
    }

    if (DRY_RUN) {
      // The guard has to sit HERE, around the upsert, and not only around the
      // quality-gate writes further down. The first version guarded the gate
      // alone, printed "DRY RUN — no writes", and then wrote 45 solutions to
      // production across three runs. Nothing was damaged — the price and
      // is_active guards held — but the flag was lying, which is worse than
      // not having it.
      const [live] = await db
        .select({ id: solutions.id, priceCents: solutions.priceCents })
        .from(solutions)
        .where(eq(solutions.slug, sol.slug))
        .limit(1);
      if (!live) {
        console.log(`  would INSERT ${sol.slug} @ EUR${(sol.priceCents / 100).toFixed(2)} (${sol.steps.length} steps)`);
      } else {
        if (live.priceCents !== sol.priceCents) {
          priceDrift.push(`${sol.slug}: live EUR${(live.priceCents / 100).toFixed(2)} vs defined EUR${(sol.priceCents / 100).toFixed(2)}`);
        }
        console.log(`  would UPDATE ${sol.slug} (${sol.steps.length} steps)`);
      }
      seeded++;
      continue;
    }

    await db.transaction(async (tx) => {
      // Upsert solution
      const [existing] = await tx
        .select({ id: solutions.id, priceCents: solutions.priceCents })
        .from(solutions)
        .where(eq(solutions.slug, sol.slug))
        .limit(1);

      // Prices on EXISTING solutions are left alone unless explicitly asked
      // for. Production has drifted from these definitions — a seed run on
      // 2026-08-16 would have moved eight prices, three of them past the
      // band ceiling, including a solution with real sales. A script whose
      // job is "add the new bundles" must not silently reprice the catalogue.
      if (existing && existing.priceCents !== sol.priceCents) {
        priceDrift.push(`${sol.slug}: live EUR${(existing.priceCents / 100).toFixed(2)} vs defined EUR${(sol.priceCents / 100).toFixed(2)}`);
      }
      const priceToWrite = existing && !ALLOW_PRICE_CHANGES ? existing.priceCents : sol.priceCents;

      let solutionId: string;

      if (existing) {
        // Update existing
        await tx
          .update(solutions)
          .set({
            name: sol.name,
            description: sol.description,
            longDescription: sol.longDescription ?? null,
            agentDescription: sol.agentDescription ?? null,
            category: sol.category,
            priceCents: priceToWrite,
            componentSumCents: sol.componentSumCents,
            valueTier: sol.valueTier,
            maintenanceLevel: sol.maintenanceLevel,
            geography: sol.geography,
            inputSchema: sol.inputSchema,
            exampleInput: sol.exampleInput ?? null,
            exampleOutput: sol.exampleOutput ?? null,
            targetAudience: sol.targetAudience,
            marketingName: sol.marketingName,
            transparencyTag: sol.transparencyTag,
            extendsWith: sol.extendsWith,
            complianceCoverage,
            displayOrder: seeded,
            updatedAt: new Date(),
          })
          .where(eq(solutions.id, existing.id));
        solutionId = existing.id;

        // Delete old steps
        await tx
          .delete(solutionSteps)
          .where(eq(solutionSteps.solutionId, solutionId));
      } else {
        // Insert new
        const [inserted] = await tx
          .insert(solutions)
          .values({
            slug: sol.slug,
            name: sol.name,
            description: sol.description,
            longDescription: sol.longDescription ?? null,
            agentDescription: sol.agentDescription ?? null,
            category: sol.category,
            priceCents: priceToWrite,
            componentSumCents: sol.componentSumCents,
            valueTier: sol.valueTier,
            maintenanceLevel: sol.maintenanceLevel,
            geography: sol.geography,
            inputSchema: sol.inputSchema,
            exampleInput: sol.exampleInput ?? null,
            exampleOutput: sol.exampleOutput ?? null,
            targetAudience: sol.targetAudience,
            marketingName: sol.marketingName,
            transparencyTag: sol.transparencyTag,
            extendsWith: sol.extendsWith,
            complianceCoverage,
            displayOrder: seeded,
          })
          .returning({ id: solutions.id });
        solutionId = inserted.id;
      }

      // Insert steps
      await tx.insert(solutionSteps).values(
        sol.steps.map((step) => ({
          solutionId,
          capabilitySlug: step.capabilitySlug,
          stepOrder: step.stepOrder,
          canParallel: step.canParallel,
          parallelGroup: step.parallelGroup,
          inputMap: step.inputMap,
            gateCondition: step.gateCondition ?? null,
        })),
      );

      console.log(
        `  ${existing ? "UPDATED" : "INSERTED"} ${sol.slug} (${sol.steps.length} steps)`,
      );
    });

    seeded++;
  }

  console.log(
    `\nDone: ${seeded} solutions seeded, ${skipped} skipped.`,
  );

  // ── Solution quality gate ──────────────────────────────────────────────────
  // Deactivate solutions where any step has SQS 0 (no test data).
  // Auto-reactivate when all steps become qualified.
  console.log("\n--- Solution quality gate ---");
  let gated = 0;
  let activated = 0;
  /** Solutions whose steps qualify but which were switched off deliberately. */
  const heldOff: string[] = [];

  const allSols = await db.select({
    id: solutions.id,
    slug: solutions.slug,
    isActive: solutions.isActive,
    // Read by wasDeactivatedDeliberately() in the reactivation branch below.
    deactivationReason: solutions.deactivationReason,
  }).from(solutions);

  for (const sol of allSols) {
    const steps = await db.select({
      capabilitySlug: solutionSteps.capabilitySlug,
    }).from(solutionSteps).where(eq(solutionSteps.solutionId, sol.id));

    if (steps.length === 0) continue;

    // SQS-based qualification gate retired (DEC-20260503-B). The replacement
    // asked for "at least one passing test_result in the last 30 days" per
    // step capability — and that rule is wrong for anything we deliberately
    // do not test.
    //
    // Scheduled testing was narrowed to zero-external-cost capabilities, so a
    // paid capability has NO scheduled suites and therefore can never satisfy
    // a "recent passing test" condition. As of 2026-08-16, `sanctions-check`
    // (0 of 9 suites scheduled) and `adverse-media-check` (0 of 14) sit in
    // exactly that position with healthy closed breakers — and between them
    // they appear in 68 active solutions. A seed run under the old rule would
    // have deactivated the entire compliance catalogue in one pass, hours
    // after the decision to keep investing in it. Simulated before running,
    // which is why it was caught rather than shipped.
    //
    // Absence of tests is absence of evidence, not evidence of failure. A step
    // qualifies when it is active AND either (a) it has passed recently, or
    // (b) we never schedule it and its breaker is not open.
    const stepSlugs = steps.map((s) => s.capabilitySlug);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const passingRows = await db.execute(sql`
      SELECT DISTINCT capability_slug
      FROM test_results
      WHERE capability_slug IN (${sql.join(stepSlugs.map((s) => sql`${s}`), sql`, `)})
        AND passed = true
        AND executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
    `);
    const passingSet = new Set(
      ((Array.isArray(passingRows) ? passingRows : (passingRows as any)?.rows ?? []) as { capability_slug: string }[])
        .map((r) => r.capability_slug),
    );
    // Capabilities we never schedule, plus their breaker state and active flag.
    const capStateRows = await db.execute(sql`
      SELECT c.slug,
             c.is_active,
             COALESCE((SELECT bool_or(ts.scheduled_testing_eligible)
                       FROM test_suites ts WHERE ts.capability_slug = c.slug), false) AS ever_scheduled,
             COALESCE((SELECT h.state FROM capability_health h
                       WHERE h.capability_slug = c.slug), 'closed') AS breaker
      FROM capabilities c
      WHERE c.slug IN (${sql.join(stepSlugs.map((x) => sql`${x}`), sql`, `)})
    `);
    const capState = new Map(
      ((Array.isArray(capStateRows) ? capStateRows : (capStateRows as any)?.rows ?? []) as
        { slug: string; is_active: boolean; ever_scheduled: boolean; breaker: string }[])
        .map((r) => [r.slug, r]),
    );

    const unqualified = stepSlugs.filter((slug) => {
      const st = capState.get(slug);
      if (!st || !st.is_active) return true;       // gone or switched off — genuinely unqualified
      if (passingSet.has(slug)) return false;      // passed recently — qualified
      if (st.ever_scheduled) return true;          // we DO test it and it has not passed — unqualified
      return st.breaker === "open";                // never tested: trust it unless the breaker is open
    });

    if (unqualified.length > 0 && sol.isActive) {
      if (!DRY_RUN) {
        await db.update(solutions)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(solutions.id, sol.id));
      }
      console.log(`  ${DRY_RUN ? "would GATE" : "GATED"}: ${sol.slug} — unqualified: ${unqualified.join(', ')}`);
      gated++;
    } else if (unqualified.length === 0 && !sol.isActive) {
      // Steps qualifying is necessary, not sufficient — see
      // wasDeactivatedDeliberately() for why and for the incident.
      // Counted, not logged per solution. `lint:no-new-console` holds this file
      // at its current ceiling and the migration direction is down, so the
      // total is reported through the existing summary line below rather than
      // adding a call site.
      if (wasDeactivatedDeliberately(sol.deactivationReason)) {
        heldOff.push(sol.slug);
        continue;
      }
      if (!DRY_RUN) {
        await db.update(solutions)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(solutions.id, sol.id));
      }
      console.log(`  ${DRY_RUN ? "would ACTIVATE" : "ACTIVATED"}: ${sol.slug} — all steps qualified`);
      activated++;
    }
  }

  console.log(
    `Quality gate: ${gated} gated, ${activated} activated` +
      (heldOff.length
        ? `, ${heldOff.length} held off (deactivated deliberately: ${heldOff.join(", ")})`
        : ""),
  );

  if (priceDrift.length) {
    console.log(`
--- Price drift: ${priceDrift.length} solution(s) differ from their definition ---`);
    for (const d of priceDrift) console.log(`  ${d}`);
    console.log(ALLOW_PRICE_CHANGES
      ? "  (--allow-price-changes was set: the defined prices were written.)"
      : "  Live prices were LEFT ALONE. Re-run with --allow-price-changes to apply them.");
  }
  if (outOfBand.length) {
    console.log(`
--- Priced above the EUR0.02-1.00 capability band (normal for bundles, listed for visibility) ---`);
    console.log(`  ${outOfBand.join(", ")}`);
  }
  if (gateFailed.length) {
    console.log(`
--- Skipped on gate violations: ${gateFailed.length} ---`);
    for (const g of gateFailed) console.log(`  ${g}`);
  }
  process.exit(0);
}

// Only seeds when this file is the process entry point. Importing it — to
// validate the definitions, or to list them — must never write anything.
const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
