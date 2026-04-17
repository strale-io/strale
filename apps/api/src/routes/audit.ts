// Runtime audit record endpoint — GET /v1/audit/:transactionId?token=...
//
// Returns a composed record of a specific transaction: the runtime facts
// (timestamps, latency, fingerprint, transaction_id) from `transactions`,
// merged with the static compliance profile (data sources, AI involvement,
// regulatory mapping) derived from capability/solution metadata.
//
// This is intentionally distinct from the compliance profile endpoint:
//   /v1/internal/trust/capabilities/:slug/compliance-profile
//     → what a capability would produce (static, no transaction)
//   /v1/audit/:transactionId
//     → what a specific call actually produced (runtime, token-gated)
//
// Both paths share the ComplianceProfile fields so the UI doesn't have to
// rebuild them twice.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { verifyAuditToken, generateAuditToken } from "../lib/audit-token.js";
import { apiError } from "../lib/errors.js";
import {
  getCapabilityProfile,
  getSolutionProfile,
  type ComplianceProfile,
} from "../lib/compliance-profile.js";
import type { AppEnv } from "../types.js";

export const auditRoute = new Hono<AppEnv>();

interface AuditStep {
  step: number;
  capability: string;
  data_source: string;
  data_source_url?: string;
  classification: string;
  transparency: "algorithmic" | "llm_assisted";
  transparency_description: string;
  latency_ms: number;
  schema_valid: boolean;
}

interface AuditRecord {
  type: "solution" | "capability";
  entity_name: string;
  entity_slug: string;
  transaction_id: string;
  timestamp_start: string;
  timestamp_end: string;
  latency_s: number;
  sources_checked: number;
  ai_involvement: string;
  ai_steps_count: number;
  total_steps: number;
  jurisdiction: string;
  processing_location: string;
  schema_validated: boolean;
  schema_steps_passed: number;
  input_fingerprint: string;
  compliance_refs: string[];
  audit_url: string;
  steps: AuditStep[];
}

function aiInvolvementLabel(level: "none" | "mixed" | "fully_ai", aiSteps: number, total: number): string {
  if (level === "none") return "None — fully algorithmic";
  if (level === "fully_ai") return "Fully AI — every step uses an LLM";
  return `Mixed — ${aiSteps}/${total} step${total === 1 ? "" : "s"} use${aiSteps === 1 ? "s" : ""} an LLM`;
}

function transparencyDescription(t: "algorithmic" | "ai_generated" | "mixed"): string {
  if (t === "ai_generated") return "LLM generates or transforms the output";
  if (t === "mixed") return "LLM-assisted with algorithmic validation";
  return "Deterministic computation; no AI involved";
}

function mapComplianceRefs(profile: ComplianceProfile): string[] {
  // Group by framework → unique "Framework (Art. X, Y, Z)" strings
  const byFramework = new Map<string, string[]>();
  for (const r of profile.regulatory_mapping) {
    if (!byFramework.has(r.framework)) byFramework.set(r.framework, []);
    const ref = r.reference.replace(/^Article\s+/, "Art. ");
    byFramework.get(r.framework)!.push(ref);
  }
  const out: string[] = [];
  for (const [framework, refs] of byFramework.entries()) {
    if (framework === "Audit Trail") continue; // platform-level, implicit
    out.push(`${framework} (${refs.join(", ")})`);
  }
  return out;
}

function composeAuditRecord(args: {
  transactionId: string;
  createdAt: Date;
  completedAt: Date | null;
  latencyMs: number | null;
  input: unknown;
  profile: ComplianceProfile;
  status: string;
}): AuditRecord {
  const { transactionId, createdAt, completedAt, latencyMs, input, profile, status } = args;
  const completed = completedAt ?? createdAt;
  const latencyS = Math.round(((latencyMs ?? 0) / 1000) * 10) / 10;

  // Approximate per-step latency by even division when we don't have per-step trace.
  // Conservative: floor the per-step value so the sum doesn't exceed total latency.
  const perStepMs = profile.total_steps > 0
    ? Math.floor((latencyMs ?? 0) / profile.total_steps)
    : 0;

  const steps: AuditStep[] = profile.data_sources.map((src, i) => ({
    step: i + 1,
    capability: src.name,
    data_source: src.source_name ?? "Live data source",
    classification:
      src.type === "ai" ? "AI-assisted extraction" :
      src.type === "scrape" ? "Web source" :
      src.type === "computed" ? "Deterministic computation" :
      "Public API",
    transparency: src.transparency === "algorithmic" ? "algorithmic" : "llm_assisted",
    transparency_description: transparencyDescription(src.transparency),
    latency_ms: perStepMs,
    schema_valid: status === "completed" && src.schema_validated,
  }));

  const inputFingerprint = `sha256:${createHash("sha256")
    .update(JSON.stringify(input ?? {}))
    .digest("hex")
    .slice(0, 16)}...`;

  const schemaPassed = status === "completed"
    ? profile.data_sources.filter((s) => s.schema_validated).length
    : 0;

  return {
    type: profile.entity_type,
    entity_name: profile.entity_name,
    entity_slug: profile.entity_slug,
    transaction_id: transactionId,
    timestamp_start: createdAt.toISOString(),
    timestamp_end: completed.toISOString(),
    latency_s: latencyS,
    sources_checked: profile.total_steps,
    ai_involvement: aiInvolvementLabel(profile.ai_involvement, profile.ai_steps_count, profile.total_steps),
    ai_steps_count: profile.ai_steps_count,
    total_steps: profile.total_steps,
    jurisdiction: profile.jurisdiction,
    processing_location: profile.processing_location,
    schema_validated: status === "completed" && profile.schema_validated,
    schema_steps_passed: schemaPassed,
    input_fingerprint: inputFingerprint,
    compliance_refs: mapComplianceRefs(profile),
    audit_url: `strale.dev/audit/${transactionId}`,
    steps,
  };
}

auditRoute.get("/:transactionId", async (c) => {
  const transactionId = c.req.param("transactionId");
  const token = c.req.query("token");

  if (!token) {
    return c.json(apiError("unauthorized", "Audit token required. Include ?token=<hmac> in the URL."), 401);
  }
  if (!verifyAuditToken(transactionId, token)) {
    return c.json(apiError("unauthorized", "Invalid audit token."), 401);
  }

  const db = getDb();
  const [txn] = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      latencyMs: transactions.latencyMs,
      input: transactions.input,
      createdAt: transactions.createdAt,
      completedAt: transactions.completedAt,
      capabilityId: transactions.capabilityId,
      solutionSlug: transactions.solutionSlug,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!txn) {
    return c.json(apiError("not_found", "Transaction not found."), 404);
  }

  // Resolve entity → fetch its compliance profile.
  let profile: ComplianceProfile | null = null;
  if (txn.solutionSlug) {
    profile = await getSolutionProfile(txn.solutionSlug);
  } else if (txn.capabilityId) {
    const [cap] = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.id, txn.capabilityId))
      .limit(1);
    if (cap) profile = await getCapabilityProfile(cap.slug);
  }

  if (!profile) {
    return c.json(
      apiError("not_found", "Unable to build compliance profile for this transaction."),
      404,
    );
  }

  const audit = composeAuditRecord({
    transactionId: txn.id,
    createdAt: txn.createdAt,
    completedAt: txn.completedAt,
    latencyMs: txn.latencyMs,
    input: txn.input,
    profile,
    status: txn.status,
  });

  return c.json({
    audit,
    transaction_status: txn.status,
    generated_at: new Date().toISOString(),
    note: "This compliance record was generated automatically by Strale. For questions: compliance@strale.io",
  });
});
