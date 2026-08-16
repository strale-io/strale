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



// ─── Seed logic ─────────────────────────────────────────────────────────────

async function seed() {
  const db = getDb();

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

    // Gate checks: validate solution before writing
    const gateViolations = await validateSolution(
      sol.slug,
      sol.inputSchema,
      sol.steps.map((s) => ({ capabilitySlug: s.capabilitySlug, stepOrder: s.stepOrder, inputMap: s.inputMap })),
    );
    enforceGates(gateViolations);

    await db.transaction(async (tx) => {
      // Upsert solution
      const [existing] = await tx
        .select({ id: solutions.id })
        .from(solutions)
        .where(eq(solutions.slug, sol.slug))
        .limit(1);

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
            priceCents: sol.priceCents,
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
            priceCents: sol.priceCents,
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

  const allSols = await db.select({
    id: solutions.id,
    slug: solutions.slug,
    isActive: solutions.isActive,
  }).from(solutions);

  for (const sol of allSols) {
    const steps = await db.select({
      capabilitySlug: solutionSteps.capabilitySlug,
    }).from(solutionSteps).where(eq(solutionSteps.solutionId, sol.id));

    if (steps.length === 0) continue;

    // SQS-based qualification gate retired (DEC-20260503-B). Per the new
    // model, a solution auto-activates when every step capability has at
    // least one passing test_result in the last 30 days; the seed script
    // mirrors the live test-scheduler gate.
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
    const unqualified = stepSlugs.filter((slug) => !passingSet.has(slug));

    if (unqualified.length > 0 && sol.isActive) {
      await db.update(solutions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(solutions.id, sol.id));
      console.log(`  GATED: ${sol.slug} — unqualified: ${unqualified.join(', ')}`);
      gated++;
    } else if (unqualified.length === 0 && !sol.isActive) {
      await db.update(solutions)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(solutions.id, sol.id));
      console.log(`  ACTIVATED: ${sol.slug} — all steps qualified`);
      activated++;
    }
  }

  console.log(`Quality gate: ${gated} gated, ${activated} activated`);
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
