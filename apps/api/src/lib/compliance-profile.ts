// Compliance Profile — derived metadata describing what a capability or solution
// *would* produce, computed live from primary DB state. Distinct from runtime
// audit records (which describe a specific transaction).
//
// Principles:
//   - No persistence. Every field is derived; no drift possible by construction.
//   - No fields that only make sense for a live call (transaction_id, input
//     fingerprint, per-call timestamps). Those belong to the runtime audit.
//   - Single source of truth for any "trust narrative" UI — capability page,
//     solution page, and any future report must consume this function, not
//     read capability columns directly.
//
// Callers: /v1/internal/capabilities/:slug/compliance-profile
//          /v1/internal/solutions/:slug/compliance-profile
//          invariant-checker.ts CHECK 12 (profile completeness)

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  capabilities,
  solutions,
  solutionSteps,
  testResults,
} from "../db/schema.js";
import { getProcessingLocation } from "./processing-location.js";

export type AiInvolvement = "none" | "mixed" | "fully_ai";

export interface ComplianceDataSource {
  slug: string;
  name: string;
  /** api | scrape | computed | ai — derived from capability.capability_type */
  type: "api" | "scrape" | "computed" | "ai";
  /** algorithmic | ai_generated | mixed — from capability.transparency_tag */
  transparency: "algorithmic" | "ai_generated" | "mixed";
  /** Surface name (e.g. "Allabolag.se", "Companies House") */
  source_name: string | null;
  /** Whether recent test runs confirm this source produces schema-valid output */
  schema_validated: boolean;
}

function mapCapabilityType(capType: string | null): "api" | "scrape" | "computed" | "ai" {
  switch (capType) {
    case "scraping": return "scrape";
    case "deterministic": return "computed";
    case "ai_assisted": return "ai";
    case "stable_api":
    default: return "api";
  }
}

export interface ComplianceRegulatoryItem {
  framework: string;
  reference: string;
  requirement: string;
  scope: "eu" | "us" | "global";
  relevance: "primary" | "supporting";
}

/**
 * Bucket C — GDPR Art. 22 classification per capability/solution.
 *   data_lookup       — factual data, not decision-supporting (default)
 *   screening_signal  — produces matches/findings the customer uses to decide
 *   risk_synthesis    — AI synthesis producing a recommendation
 * Surfaced in the audit body so the controller knows their Art. 22
 * obligations and the data subject can find the dispute endpoint.
 */
export type Art22Classification = "data_lookup" | "screening_signal" | "risk_synthesis";

export interface ComplianceProfile {
  entity_type: "capability" | "solution";
  entity_slug: string;
  entity_name: string;
  total_steps: number;
  data_sources: ComplianceDataSource[];
  ai_involvement: AiInvolvement;
  ai_steps_count: number;
  /** High-level jurisdiction of the data/processing: global | eu | us | nordic | uk */
  jurisdiction: string;
  /** Where execution physically runs (from env, not per-capability) */
  processing_location: string;
  regulatory_mapping: ComplianceRegulatoryItem[];
  /** Bucket C — Art. 22 classification, max-of for solutions */
  art_22_classification: Art22Classification;
  avg_latency_ms: number | null;
  /** Aggregate: true iff every included step has schema-validated data */
  schema_validated: boolean;
  /** ISO of the most recent passing test across all included steps, or null */
  last_verified_at: string | null;
}

// F-AUDIT-02: unified with audit builders. See lib/processing-location.ts for
// resolution order (RAILWAY_REPLICA_REGION → STRALE_PROCESSING_REGION → "unknown").
const processingLocation = getProcessingLocation;

function inferAiInvolvement(
  transparencies: Array<"algorithmic" | "ai_generated" | "mixed">,
): { level: AiInvolvement; aiSteps: number } {
  if (transparencies.length === 0) return { level: "none", aiSteps: 0 };
  const aiSteps = transparencies.filter((t) => t === "ai_generated" || t === "mixed").length;
  if (aiSteps === 0) return { level: "none", aiSteps: 0 };
  if (aiSteps === transparencies.length && transparencies.every((t) => t === "ai_generated")) {
    return { level: "fully_ai", aiSteps };
  }
  return { level: "mixed", aiSteps };
}

function normalizeTransparency(
  tag: string | null,
): "algorithmic" | "ai_generated" | "mixed" {
  if (tag === "ai_generated") return "ai_generated";
  if (tag === "mixed") return "mixed";
  return "algorithmic"; // null or anything else — treat as fully deterministic
}

function buildRegulatoryMapping(args: {
  hasAI: boolean;
  geography: string;
  capabilitySlugs: string[];
  category?: string;
}): ComplianceRegulatoryItem[] {
  const items: ComplianceRegulatoryItem[] = [];
  const geo = (args.geography ?? "global").toLowerCase();
  const geoHasEU = geo === "eu" || geo === "eu-global" || geo === "nordic";
  const geoHasUS = geo.includes("us");
  const relevance = (scope: "eu" | "us" | "global"): "primary" | "supporting" => {
    if (scope === "global") return "primary";
    if (scope === "us" && geoHasUS) return "primary";
    if (scope === "eu" && geoHasEU) return "primary";
    return "supporting";
  };

  // Platform-level — every entity has an audit trail
  items.push({
    framework: "Audit Trail",
    reference: "Per-transaction record",
    requirement: "Traceable execution records for every API call",
    scope: "global",
    relevance: "primary",
  });

  if (args.hasAI) {
    const euRel = relevance("eu");
    items.push(
      { framework: "EU AI Act", reference: "Article 12", requirement: "Record-keeping and automatic logging of AI system operations", scope: "eu", relevance: euRel },
      { framework: "EU AI Act", reference: "Article 13", requirement: "Transparency — users must understand AI system output", scope: "eu", relevance: euRel },
      { framework: "EU AI Act", reference: "Article 14", requirement: "Human oversight measures must be documented", scope: "eu", relevance: euRel },
      { framework: "EU AI Act", reference: "Article 50", requirement: "AI-generated content must be marked", scope: "eu", relevance: euRel },
    );
  }

  if (geoHasEU || geo === "us-global" || geo === "global") {
    const gdprRel: "primary" | "supporting" = geoHasEU ? "primary" : "supporting";
    items.push(
      { framework: "GDPR", reference: "Article 30", requirement: "Record of processing activities with data classifications", scope: "eu", relevance: gdprRel },
      { framework: "GDPR", reference: "Articles 15/17", requirement: "Data subject access and right to erasure", scope: "eu", relevance: gdprRel },
    );
  }

  if (args.capabilitySlugs.includes("sanctions-check")) {
    items.push({
      framework: "Sanctions Screening",
      reference: "31 CFR Part 501",
      requirement: "Screening against OFAC SDN and consolidated sanctions lists",
      scope: "us",
      relevance: relevance("us"),
    });
  }

  return items;
}

// Schema-validation signal: a capability is considered schema-validated when
// the most recent test run passed. This is a conservative binary — a single
// failed run flips it to false. Paired with last_verified_at so the UI can
// show "validated on DATE" or "verification pending" honestly.
async function capabilitySchemaStatus(
  slug: string,
): Promise<{ validated: boolean; lastVerifiedAt: string | null }> {
  const db = getDb();
  const rows = await db
    .select({ passed: testResults.passed, executedAt: testResults.executedAt })
    .from(testResults)
    .where(eq(testResults.capabilitySlug, slug))
    .orderBy(desc(testResults.executedAt))
    .limit(1);
  if (rows.length === 0) return { validated: false, lastVerifiedAt: null };
  const r = rows[0];
  return {
    validated: r.passed === true,
    lastVerifiedAt:
      r.executedAt instanceof Date ? r.executedAt.toISOString() : String(r.executedAt),
  };
}

export async function getCapabilityProfile(
  slug: string,
): Promise<ComplianceProfile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(capabilities)
    .where(and(eq(capabilities.slug, slug), eq(capabilities.isActive, true)))
    .limit(1);
  if (rows.length === 0) return null;
  const c = rows[0];

  const transparency = normalizeTransparency(c.transparencyTag as string | null);
  const { level: aiInvolvement, aiSteps } = inferAiInvolvement([transparency]);
  const schemaStatus = await capabilitySchemaStatus(slug);

  const dataSource: ComplianceDataSource = {
    slug: c.slug,
    name: c.name,
    type: mapCapabilityType(c.capabilityType as string | null),
    transparency,
    source_name: (c.dataSource as string | null) ?? null,
    schema_validated: schemaStatus.validated,
  };

  return {
    entity_type: "capability",
    entity_slug: c.slug,
    entity_name: c.name,
    total_steps: 1,
    data_sources: [dataSource],
    ai_involvement: aiInvolvement,
    ai_steps_count: aiSteps,
    jurisdiction: (c.geography as string) ?? "global",
    processing_location: processingLocation(),
    art_22_classification: ((c.gdprArt22Classification as string) ?? "data_lookup") as Art22Classification,
    regulatory_mapping: buildRegulatoryMapping({
      hasAI: transparency !== "algorithmic",
      geography: (c.geography as string) ?? "global",
      capabilitySlugs: [c.slug],
      category: c.category as string,
    }),
    avg_latency_ms: c.avgLatencyMs ?? null,
    schema_validated: schemaStatus.validated,
    last_verified_at: schemaStatus.lastVerifiedAt,
  };
}

export async function getSolutionProfile(
  slug: string,
): Promise<ComplianceProfile | null> {
  const db = getDb();
  const solRows = await db
    .select()
    .from(solutions)
    .where(and(eq(solutions.slug, slug), eq(solutions.isActive, true)))
    .limit(1);
  if (solRows.length === 0) return null;
  const s = solRows[0];

  const stepsRows = await db
    .select({ step: solutionSteps, cap: capabilities })
    .from(solutionSteps)
    .innerJoin(capabilities, eq(capabilities.slug, solutionSteps.capabilitySlug))
    .where(eq(solutionSteps.solutionId, s.id))
    .orderBy(solutionSteps.stepOrder);

  const transparencies: Array<"algorithmic" | "ai_generated" | "mixed"> = [];
  const data_sources: ComplianceDataSource[] = [];
  const capabilitySlugs: string[] = [];
  const schemaStatuses = await Promise.all(
    stepsRows.map((r) => capabilitySchemaStatus(r.cap.slug)),
  );

  let allValidated = stepsRows.length > 0;
  let latestVerifiedAt: string | null = null;
  let latencySum = 0;
  let latencyCount = 0;

  // Bucket C — solution Art. 22 classification is the max-of its
  // steps. risk_synthesis > screening_signal > data_lookup. A KYB
  // Complete that chains screenings + risk-narrative is risk_synthesis;
  // a KYB Essentials that's screening-only stops at screening_signal.
  const ART_22_RANK: Record<Art22Classification, number> = {
    data_lookup: 0,
    screening_signal: 1,
    risk_synthesis: 2,
  };
  const ART_22_BY_RANK: Art22Classification[] = ["data_lookup", "screening_signal", "risk_synthesis"];
  let solArt22Rank = 0;

  stepsRows.forEach((r, i) => {
    const t = normalizeTransparency(r.cap.transparencyTag as string | null);
    transparencies.push(t);
    capabilitySlugs.push(r.cap.slug);
    const st = schemaStatuses[i];
    if (!st.validated) allValidated = false;
    if (st.lastVerifiedAt && (!latestVerifiedAt || st.lastVerifiedAt > latestVerifiedAt)) {
      latestVerifiedAt = st.lastVerifiedAt;
    }
    if (r.cap.avgLatencyMs != null) {
      latencySum += r.cap.avgLatencyMs;
      latencyCount++;
    }
    const stepArt22 = ((r.cap.gdprArt22Classification as string) ?? "data_lookup") as Art22Classification;
    solArt22Rank = Math.max(solArt22Rank, ART_22_RANK[stepArt22] ?? 0);
    data_sources.push({
      slug: r.cap.slug,
      name: r.cap.name,
      type: mapCapabilityType(r.cap.capabilityType as string | null),
      transparency: t,
      source_name: (r.cap.dataSource as string | null) ?? null,
      schema_validated: st.validated,
    });
  });

  const { level: aiInvolvement, aiSteps } = inferAiInvolvement(transparencies);

  return {
    entity_type: "solution",
    entity_slug: s.slug,
    entity_name: s.name,
    total_steps: stepsRows.length,
    data_sources,
    ai_involvement: aiInvolvement,
    ai_steps_count: aiSteps,
    jurisdiction: (s.geography as string) ?? "global",
    processing_location: processingLocation(),
    art_22_classification: ART_22_BY_RANK[solArt22Rank],
    regulatory_mapping: buildRegulatoryMapping({
      hasAI: aiInvolvement !== "none",
      geography: (s.geography as string) ?? "global",
      capabilitySlugs,
      category: s.category as string,
    }),
    avg_latency_ms: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
    schema_validated: allValidated,
    last_verified_at: latestVerifiedAt,
  };
}
