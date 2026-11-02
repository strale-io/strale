import { createHash } from "node:crypto";
import { getAiDescription, getDataSourceUrl } from "../audit-helpers.js";
import { getShareableUrl } from "../audit-token.js";
import { TRANSACTION_RETENTION_DAYS } from "../data-retention.js";
import { inputForPersistence } from "../never-persist-inputs.js";
import { getProcessingLocation } from "../processing-location.js";
import { getProcessingJurisdictions, validateProvenanceAtBoundary } from "../provenance-builder.js";
import { sanitizeFailureReason } from "../sanitize.js";
import type { CapabilityInfo } from "./types.js";

// F-0-009 Stage 2: integrity hashing moved to jobs/integrity-hash-retry.ts.

// ─── Free-tier slug cache ──────────────────────────────────────────────────
//
// Moved to lib/free-tier.ts on 2026-08-22. The implementation that lived here
// selected `is_free_tier AND is_active AND lifecycle_state = 'active'` and
// never consulted `visible`, so a quarantined free-tier capability stayed in
// the advertisement while `matchCapability` refused to serve it. See that
// module's header for the incident.

// ─── Audit trail helpers ──────────────────────────────────────────────────────

// Hashes the PERSISTENCE form of the input: a never-persisted field (see
// lib/never-persist-inputs.ts) is replaced by a fixed marker first, because an
// unsalted hash of a weak password is as good as the password.
function hashInput(slug: string, input: Record<string, unknown>): string {
  const persisted = inputForPersistence(slug, input);
  return `sha256:${createHash("sha256").update(JSON.stringify(persisted)).digest("hex")}`;
}

// CRIT-3: schema_validated was hardcoded `true` on every successful audit
// body — a fabricated compliance claim, since no validation was actually
// run. This helper performs the same minimal "object + required fields
// present" check that piggyback-monitor uses when scoring real test runs.
// It is INTENTIONALLY shallow (no nested-property type checking, no enum
// validation): we surface what we can verify cheaply, mark the rest as
// "Not validated" via the schema_validated=false path. A real Ajv-driven
// validator is a v1.1 enhancement; for v1, we trade granularity for honesty.
function computeSchemaValidated(
  output: unknown,
  outputSchema: Record<string, unknown> | null | undefined,
): boolean {
  if (!outputSchema) return false;
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return outputSchema.type !== "object";
  }
  const required = (outputSchema as { required?: string[] }).required ?? [];
  for (const field of required) {
    if (!(field in (output as Record<string, unknown>)) || (output as Record<string, unknown>)[field] == null) {
      return false;
    }
  }
  return true;
}

// NOTE: buildFreeTierAudit is currently unused — free-tier calls take
// the same buildFullAudit path with isFreeTier=true on the row. Keeping
// the function compiled so the patterns mirror, and fixed for honesty
// alongside buildFullAudit in case it gets re-wired.
function buildFreeTierAudit(
  capability: CapabilityInfo,
  latencyMs: number,
  output: unknown,
  outputSchema: Record<string, unknown> | null | undefined,
) {
  const marker = getTransparencyMarker(capability.transparencyTag);
  return {
    timestamp: new Date().toISOString(),
    capability: capability.slug,
    data_source: capability.dataSource ?? capability.name,
    data_classification: capability.dataClassification ?? "unknown",
    transparency_marker: marker,
    ai_description: getAiDescription(capability.slug, marker),
    // F-AUDIT-01: was hardcoded "EU" while running in US East. Now computed
    // from the actual processing region + AI vendor reach.
    data_jurisdiction: getProcessingJurisdictions(
      capability.capabilityType,
      capability.transparencyTag,
    ).join(",") || "unknown",
    processing_location: getProcessingLocation(),
    execution_mode: "sync",
    latency_ms: latencyMs,
    // CRIT-3: was hardcoded `true`. Now computed from the actual
    // executor output against the published outputSchema's required fields.
    schema_validated: computeSchemaValidated(output, outputSchema),
    compliance: {
      ai_involvement: getAiDescription(capability.slug, marker),
      // F-A-003 + SA.2b.d: manifest-declared classification is authoritative.
      // Heuristic fallback was deleted after migration 0050 made the column
      // NOT NULL across all 307 capabilities.
      personal_data_processed: capability.processesPersonalData,
      personal_data_categories: capability.personalDataCategories ?? [],
      applicable_regulations: ["EU AI Act (Articles 12, 13, 50)"],
      // CRIT-4: was "no transaction record stored. Upgrade for full audit
      // trail" — false today; free-tier calls ARE persisted to transactions
      // as isFreeTier=true rows and are queryable via /v1/audit/:id with a
      // token. Rewritten to reflect actual behaviour.
      notes:
        "Free-tier call. Transaction is persisted with limited audit metadata; " +
        "shareable compliance URL is available via the standard audit endpoint.",
    },
  };
}

export function buildFullAudit(params: {
  transactionId: string;
  startTime: number;
  capability: CapabilityInfo;
  marker: string;
  executionMode: "sync" | "async";
  latencyMs: number;
  executionInput: Record<string, unknown>;
  output: unknown;
  // CRIT-3: outputSchema is required for honest schema_validated computation.
  // Optional only because legacy call paths may not have it loaded; when
  // omitted, schema_validated falls back to false (the truthful answer when
  // we can't verify).
  outputSchema?: Record<string, unknown> | null;
  provenance?: unknown;
  requestContext?: {
    referer: string | null;
    origin: string | null;
    userAgent: string | null;
    ipHash?: string | null;
    acceptLanguage?: string | null;
    mcpClient?: string | null;
  };
}) {
  const {
    transactionId, startTime, capability, marker, executionMode,
    latencyMs, executionInput, output, outputSchema, provenance,
    requestContext,
  } = params;

  // CRIT-10 / F-AUDIT-17: validate provenance at the audit-build boundary.
  // Logs warnings when provenance is missing/invalid or when the vendor
  // sourcing disclosure (upstream_vendor / acquisition_method / primary_source_
  // _reference; DEC-20261023-A requires vendor and method on every answer,
  // superseding DEC-20260428-A Tier 2) is incomplete for vendor-scraping
  // capabilities. Warn-only in
  // v1; v1.1 escalates to block once we've quantified production failure rate.
  // capabilityType="scraping" is used as a proxy for data_source_type=scrape
  // since manifests aren't queryable as a column today.
  validateProvenanceAtBoundary(provenance, {
    slug: capability.slug,
    dataSourceType: capability.capabilityType === "scraping" ? "scrape" : null,
  });

  // F-A-003 + F-A-009 + SA.2b.d: manifest-declared classification is
  // the authoritative source. Heuristic fallback was deleted after
  // migration 0050 made processes_personal_data NOT NULL.
  const personalDataDetected = capability.processesPersonalData;
  const personalDataCategories = capability.personalDataCategories ?? [];

  // F-A-006: issue shareable URL + expiry once so both fields reference
  // the same token (two calls would produce two tokens with drifting
  // expires_at values — same-second or off-by-one).
  const shareable = getShareableUrl(transactionId);

  return {
    transaction_id: transactionId,
    timestamp: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    capability: capability.slug,
    data_source: capability.dataSource ?? capability.name,
    data_source_url: getDataSourceUrl(capability.slug),
    data_classification: capability.dataClassification ?? "unknown",
    transparency_marker: marker,
    ai_description: getAiDescription(capability.slug, marker),
    // F-AUDIT-01: was hardcoded "EU" while running in US East. Now computed
    // from the actual processing region + AI vendor reach.
    data_jurisdiction: getProcessingJurisdictions(
      capability.capabilityType,
      capability.transparencyTag,
    ).join(",") || "unknown",
    processing_location: getProcessingLocation(),
    execution_mode: executionMode,
    latency_ms: latencyMs,
    input_hash: hashInput(capability.slug, executionInput),
    request_context: requestContext ?? null,
    // CRIT-3: was hardcoded `true`. Now computed against outputSchema.
    // false on missing schema (we can't verify) or missing required fields.
    schema_validated: computeSchemaValidated(output, outputSchema),
    provenance: provenance ?? null,
    compliance: {
      ai_involvement: getAiDescription(capability.slug, marker),
      personal_data_processed: personalDataDetected,
      personal_data_categories: personalDataCategories,
      human_oversight: "autonomous",
      human_oversight_description: "Automated execution with schema validation. No human review required for this capability.",
      data_retention_days: TRANSACTION_RETENTION_DAYS,
      deletion_endpoint: `DELETE /v1/transactions/${transactionId}`,
      access_endpoint: `GET /v1/transactions/${transactionId}`,
      shareable_url: shareable.url,
      shareable_url_expires_at: shareable.expiresAt,
      // Cert-audit Y-9: gate EU AI Act articles on whether AI was actually
      // involved. Pre-fix, every algorithmic-only call (e.g. iban-validate)
      // emitted "article_50: AI-generated content marked via transparency_
      // marker field" — a misleading provenance claim because no AI ran.
      // compliance-profile.ts/buildRegulatoryMapping already gates on
      // hasAI; this brings buildFullAudit into alignment.
      regulations_addressed: {
        ...(marker !== "algorithmic" ? {
          eu_ai_act: {
            article_12: "Full execution logging with timestamps, data sources, and latency",
            article_13: "Transparency markers indicating AI vs algorithmic processing",
            article_14: "Human oversight classification documented",
            article_50: "AI-generated content marked via transparency_marker field",
          },
        } : {}),
        gdpr: {
          article_30: "Complete processing record with data sources, classifications, and jurisdiction",
          article_15: `Transaction data accessible via GET /v1/transactions/${transactionId}`,
          article_17: `Transaction data deletable via DELETE /v1/transactions/${transactionId}`,
        },
        notes: personalDataDetected
          ? "Personal data detected in this transaction. DPIA may be required."
          : "No personal data detected. No DPIA required.",
      },
    },
  };
}

// ─── Failure audit trail (EU AI Act Art. 12 — log ALL executions) ─────────────

export function buildFailureAudit(params: {
  transactionId: string;
  startTime: number;
  capability: CapabilityInfo;
  executionInput: Record<string, unknown>;
  errorMessage: string;
  executionMode: "sync" | "async";
  requestContext?: {
    referer: string | null;
    origin: string | null;
    userAgent: string | null;
    ipHash?: string | null;
    fingerprintHash?: string | null;
    acceptLanguage?: string | null;
    mcpClient?: string | null;
  };
}) {
  const { transactionId, startTime, capability, executionInput, errorMessage, executionMode, requestContext } = params;
  const marker = getTransparencyMarker(capability.transparencyTag);
  // F-AUDIT-03 / MED-2: failure audit was missing shareable_url, GDPR Art.
  // 15/17 mapping, data_retention_days, and the personal-data signal that
  // success audits carry. EU AI Act Art. 12 requires logging ALL executions
  // including failures, not just successes — and customers can't share a
  // failed-call compliance record with their DPO if there's no token-issued
  // shareable_url. Now mirrors the success-audit compliance block exactly,
  // with status:"failed" + the original error_message preserved.
  const personalDataDetected = capability.processesPersonalData;
  const personalDataCategories = capability.personalDataCategories ?? [];
  const shareable = getShareableUrl(transactionId);
  return {
    transaction_id: transactionId,
    status: "failed",
    started_at: new Date(startTime).toISOString(),
    failed_at: new Date().toISOString(),
    capability: capability.slug,
    data_source: capability.dataSource ?? capability.name,
    data_classification: capability.dataClassification ?? "unknown",
    transparency_marker: marker,
    ai_description: getAiDescription(capability.slug, marker),
    data_jurisdiction: getProcessingJurisdictions(
      capability.capabilityType,
      capability.transparencyTag,
    ).join(",") || "unknown",
    processing_location: getProcessingLocation(),
    execution_mode: executionMode,
    latency_ms: Date.now() - startTime,
    input_hash: hashInput(capability.slug, executionInput),
    request_context: requestContext ?? null,
    // SANITISED, and this is the authority for it.
    //
    // This wrote the RAW `err.message` for as long as the field has existed,
    // and `GET /v1/transactions/:id` serves `audit_trail` verbatim — on the
    // same response whose `error` key is carefully
    // `sanitizeFailureReason(row.error)`. So the caller was handed the
    // redacted string and the un-redacted one side by side.
    //
    // Measured read-only against production before the fix: 120 rows carry
    // this field, 15 distinct values across 51 rows differ from their
    // sanitised form (2026-05-29 .. 2026-08-20) — 14 leaking a hostname, 2 a
    // full URL, plus vendor names like Browserless and CoinGecko that the
    // sanitiser exists to withhold. No credentials or internal IPs in that
    // corpus, but the class is open: this is the same privacy boundary
    // PR #383 closed for `transactions.error`, and unlike that one it does
    // not need a special message shape to fire.
    //
    // Nothing is lost by sanitising here. Every row's audit copy was exactly
    // `left(error, 500)` — a duplicate of a column that is already kept raw at
    // rest for operators and sanitised on the way out. The raw text therefore
    // still exists in `transactions.error` and in the structured logs; it just
    // stops being served.
    //
    // Same function as the response path, deliberately: one authority, not a
    // second sanitiser. Sanitising before truncating also matters — clipping
    // first can sever a hostname mid-token and defeat the stripper.
    error_message: sanitizeFailureReason(errorMessage).substring(0, 500),
    schema_validated: false,
    compliance: {
      ai_involvement: getAiDescription(capability.slug, marker),
      personal_data_processed: personalDataDetected,
      personal_data_categories: personalDataCategories,
      human_oversight: "autonomous",
      human_oversight_description:
        "Automated execution failed before output was produced. No customer-facing data generated.",
      data_retention_days: TRANSACTION_RETENTION_DAYS,
      deletion_endpoint: `DELETE /v1/transactions/${transactionId}`,
      access_endpoint: `GET /v1/transactions/${transactionId}`,
      shareable_url: shareable.url,
      shareable_url_expires_at: shareable.expiresAt,
      // Cert-audit Y-9: gate EU AI Act articles on AI involvement (same
      // rule as buildFullAudit). An algorithmic capability that fails
      // shouldn't carry "Transparency marker indicates AI vs algorithmic
      // processing" in its failure audit — there was never any AI to
      // mark transparency for.
      regulations_addressed: {
        ...(marker !== "algorithmic" ? {
          eu_ai_act: {
            article_12:
              "Full execution logging — failure attempted, error captured, audit trail preserved",
            article_13: "Transparency marker indicates AI vs algorithmic processing",
          },
        } : {}),
        gdpr: {
          article_30:
            "Complete processing record with data sources, classifications, and jurisdiction (failure mode)",
          article_15: `Transaction data accessible via GET /v1/transactions/${transactionId}`,
          article_17: `Transaction data deletable via DELETE /v1/transactions/${transactionId}`,
        },
        notes: personalDataDetected
          ? "Capability is classified as processing personal data — even on failure, redaction rules apply per Art. 17."
          : "No personal data classified for this capability.",
      },
    },
  };
}

// F-0-009 Stage 2: the former `storeIntegrityHash` helper that lived
// here has moved to jobs/integrity-hash-retry.ts. Transactions are
// inserted with compliance_hash_state = 'pending' via the column
// default; the worker fills in the hash.

// ─── EU AI Act transparency markers (DEC-20260226-P-s3t4) ─────────────────────
// Derived from the capabilities table's transparency_tag column.
// 'algorithmic' = pure logic/API, 'hybrid' = mixed LLM+algo, 'ai_generated' = uses LLM
export function getTransparencyMarker(transparencyTag: string | null): string {
  if (transparencyTag === "algorithmic") return "algorithmic";
  if (transparencyTag === "mixed") return "hybrid";
  return "ai_generated";
}

