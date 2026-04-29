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
//
// F-0-009 Stage 2 gate: the integrity hash is computed asynchronously by
// jobs/integrity-hash-retry.ts, so this endpoint refuses to serve a
// composed audit until the row's hash is committed to the chain.
// Transactions in `compliance_hash_state = 'pending'` return 202 +
// Retry-After; transactions in `'failed'` return 503. Only `'complete'`
// falls through to profile composition below.

import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { verifyAuditToken } from "../lib/audit-token.js";
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
  // CCO #2: latency_ms is OPTIONAL. Prior code computed
  // floor(totalLatency / total_steps) and presented it as measurement;
  // for a 12-step solution where step 1 timed out at 4500ms and the rest
  // returned in 1ms, every step rendered as ~375ms — concealing the exact
  // failure pattern an auditor needs to see. Now read from
  // audit_trail.steps[].latencyMs when present; OMITTED entirely when not,
  // rather than synthesised.
  latency_ms?: number;
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
  // CCO #1: source signals whether displayable fields came from the
  // hash-protected stored audit_trail/provenance (preferred) or were
  // recomposed from current capability metadata at render time
  // (legacy rows pre-buildFullAudit; informational, not hash-protected).
  // Customers can use this to distinguish what the chain actually
  // protects from what we're showing for convenience.
  source: "stored" | "derived" | "hybrid";
}

// Shape of audit_trail.steps[] as written by solution-execute.ts:buildInlineAudit.
// Capability-only rows (do.ts:buildFullAudit) don't have this field — they're
// always a single step with audit_trail.latency_ms at the top level.
interface StoredSolutionStep {
  index: number;
  capabilitySlug: string;
  status: string;
  latencyMs: number;
  error: string | null;
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

// CCO #1: extract step latencies from the stored audit_trail when available.
// Returns a map of capabilitySlug → latencyMs for solutions (multi-step),
// or a single { __single: latencyMs } entry for capability rows.
// Returns empty map when no stored timings exist (legacy rows or capability
// rows without buildFullAudit data).
// Exported for unit testing.
export function extractStoredStepLatencies(
  auditTrail: unknown,
  fallbackTotalLatencyMs: number | null,
): Map<string, number> {
  const out = new Map<string, number>();

  // Try audit_trail shapes first.
  if (auditTrail && typeof auditTrail === "object") {
    const at = auditTrail as Record<string, unknown>;

    // Solution shape: audit_trail.steps[] with capabilitySlug + latencyMs.
    if (Array.isArray(at.steps)) {
      for (const s of at.steps as StoredSolutionStep[]) {
        if (typeof s?.capabilitySlug === "string" && typeof s?.latencyMs === "number") {
          out.set(s.capabilitySlug, s.latencyMs);
        }
      }
      return out; // Even if empty steps[] — caller knows it's a solution row.
    }

    // Capability shape: top-level latency_ms on the audit_trail (buildFullAudit).
    // Single-step row — total latency IS step latency, no fabrication.
    if (typeof at.latency_ms === "number") {
      out.set("__single", at.latency_ms);
      return out;
    }
  }

  // Fall through to row-level latencyMs as last-resort. Correct ONLY for
  // single-step rows (i.e. capability rows; never for solutions, which always
  // have audit_trail.steps[] populated by buildInlineAudit). Legacy capability
  // rows that predate buildFullAudit hit this path.
  if (typeof fallbackTotalLatencyMs === "number") {
    out.set("__single", fallbackTotalLatencyMs);
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
  // CCO #1: stored audit_trail JSONB (the hash-protected snapshot from
  // execution time). Preferred over re-derived values from `profile`.
  auditTrail: unknown;
  // CCO #1: stored provenance. Carries source-attribution and
  // upstream-vendor disclosure that buildProvenance attached at exec time.
  provenance: unknown;
  // Stored at-time-of-execution data_jurisdiction. Preferred over the
  // profile's current value (which can drift if capabilities row metadata
  // was edited after the call ran).
  storedDataJurisdiction: string | null;
  storedTransparencyMarker: string | null;
}): AuditRecord {
  const {
    transactionId, createdAt, completedAt, latencyMs, input,
    profile, status, auditTrail, provenance,
    storedDataJurisdiction, storedTransparencyMarker,
  } = args;
  const completed = completedAt ?? createdAt;
  const latencyS = Math.round(((latencyMs ?? 0) / 1000) * 10) / 10;

  // CCO #2: per-step latencies come from the stored audit_trail. If the
  // capability slug isn't in the map, latency_ms is OMITTED rather than
  // synthesised. The hash protects what was stored; what we don't know,
  // we don't fabricate.
  const stepLatencies = extractStoredStepLatencies(auditTrail, latencyMs);
  const hasStoredTimings = stepLatencies.size > 0;

  const steps: AuditStep[] = profile.data_sources.map((src, i) => {
    // For solutions: look up by capability slug. For capabilities (single
    // step): the map carries one key, "__single".
    const slugKey = profile.entity_type === "solution"
      ? src.source_name ?? src.name
      : "__single";
    const storedMs = stepLatencies.get(slugKey);

    const step: AuditStep = {
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
      schema_valid: status === "completed" && src.schema_validated,
    };
    if (typeof storedMs === "number") {
      step.latency_ms = storedMs;
    }
    return step;
  });

  const inputFingerprint = `sha256:${createHash("sha256")
    .update(JSON.stringify(input ?? {}))
    .digest("hex")
    .slice(0, 16)}...`;

  const schemaPassed = status === "completed"
    ? profile.data_sources.filter((s) => s.schema_validated).length
    : 0;

  // CCO #1: source labelling. "stored" when both jurisdiction and per-step
  // timings come from auditTrail; "derived" when neither does (legacy rows);
  // "hybrid" otherwise. Customer + regulator see exactly what's hash-protected.
  const hasStoredJurisdiction = !!storedDataJurisdiction;
  const source: AuditRecord["source"] = hasStoredJurisdiction && hasStoredTimings
    ? "stored"
    : (!hasStoredJurisdiction && !hasStoredTimings)
      ? "derived"
      : "hybrid";

  // Provenance is currently surfaced via the dedicated /v1/audit response
  // wrapper at the call site, not embedded in AuditRecord. Read here so
  // future fields in this function can use it without re-plumbing.
  void provenance;

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
    // CCO #1: stored values preferred over derived. Stored values come from
    // buildFullAudit/buildInlineAudit at execution time and are hash-protected.
    // The profile fallback covers legacy rows that predate those builders.
    jurisdiction: storedDataJurisdiction ?? profile.jurisdiction,
    processing_location: profile.processing_location,
    schema_validated: status === "completed" && profile.schema_validated,
    schema_steps_passed: schemaPassed,
    input_fingerprint: inputFingerprint,
    compliance_refs: mapComplianceRefs(profile),
    audit_url: `strale.dev/audit/${transactionId}`,
    steps,
    source,
  };
}

auditRoute.get("/:transactionId", async (c) => {
  const transactionId = c.req.param("transactionId");
  const token = c.req.query("token");
  const expiresAtRaw = c.req.query("expires_at");

  if (!token) {
    return c.json(apiError("unauthorized", "Audit token required. Include ?token=<hmac> in the URL."), 401);
  }

  // F-A-006: expires_at is the new-format discriminator. Absent = legacy
  // token (pre-F-A-006 deploy), accepted during sunset window. Present
  // but non-integer = malformed URL.
  let expiresAt: number | null = null;
  if (expiresAtRaw != null) {
    const parsed = parseInt(expiresAtRaw, 10);
    if (!Number.isFinite(parsed) || String(parsed) !== expiresAtRaw) {
      return c.json(apiError("invalid_request", "expires_at must be an integer (unix seconds)."), 400);
    }
    expiresAt = parsed;
  }

  const result = verifyAuditToken(transactionId, token, expiresAt);
  if (!result.valid) {
    if (result.reason === "expired") {
      return c.json(
        apiError(
          "token_expired",
          "Audit token has expired. Re-issue via POST /v1/transactions/:id/audit-token.",
        ),
        410,
      );
    }
    if (result.reason === "legacy_token_sunset") {
      return c.json(
        apiError(
          "legacy_token_sunset",
          "This audit URL was issued under a pre-F-A-006 format that has been sunset. Re-issue via POST /v1/transactions/:id/audit-token.",
        ),
        410,
      );
    }
    if (result.reason === "malformed") {
      return c.json(apiError("invalid_request", "Malformed audit token."), 400);
    }
    return c.json(apiError("unauthorized", "Invalid audit token."), 401);
  }

  const db = getDb();
  // CCO #1: select the stored audit_trail, provenance, transparencyMarker,
  // and dataJurisdiction so composeAuditRecord can prefer hash-protected
  // historical values over recomposing from current capability metadata.
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
      complianceHashState: transactions.complianceHashState,
      auditTrail: transactions.auditTrail,
      provenance: transactions.provenance,
      transparencyMarker: transactions.transparencyMarker,
      dataJurisdiction: transactions.dataJurisdiction,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)))
    .limit(1);

  if (!txn) {
    return c.json(apiError("not_found", "Transaction not found."), 404);
  }

  // F-0-009 Stage 2: the integrity hash is filled in by a background
  // worker (jobs/integrity-hash-retry.ts). Refuse to compose the audit
  // until the underlying row's hash is committed to the chain — a
  // compliance response without a chained hash is worse than one that
  // asks the caller to retry.
  if (txn.complianceHashState === "pending") {
    c.header("Retry-After", "30");
    return c.json(
      {
        status: "pending",
        message: "Integrity hash is still being computed. Retry in 30 seconds.",
        transaction_id: txn.id,
      },
      202,
    );
  }
  if (txn.complianceHashState === "failed") {
    return c.json(
      apiError(
        "capability_unavailable",
        "Integrity hash generation failed for this transaction. Contact compliance@strale.io.",
        { transaction_id: txn.id },
      ),
      503,
    );
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

  // NOTE: `status` here is the execution status (`completed` / `failed` /
  // `executing`) stored on the transactions row. It is NOT the
  // complianceHashState — those are two separate fields. The pending /
  // failed compliance-hash cases were already handled above; by this
  // point complianceHashState is 'complete'.
  const audit = composeAuditRecord({
    transactionId: txn.id,
    createdAt: txn.createdAt,
    completedAt: txn.completedAt,
    latencyMs: txn.latencyMs,
    input: txn.input,
    profile,
    status: txn.status,
    // CCO #1: hand the stored snapshot to the composer; it prefers these
    // over deriving from current capability metadata.
    auditTrail: txn.auditTrail,
    provenance: txn.provenance,
    storedDataJurisdiction: txn.dataJurisdiction ?? null,
    storedTransparencyMarker: txn.transparencyMarker ?? null,
  });

  return c.json({
    audit,
    transaction_status: txn.status,
    generated_at: new Date().toISOString(),
    note: "This compliance record was generated automatically by Strale. For questions: compliance@strale.io",
  });
});
