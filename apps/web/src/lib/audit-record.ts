// The execution record page (/audit/:transactionId), carried over from strale-frontend's
// AuditRecord.tsx and lib/compliance-types.ts. No DOM and no Node imports: this runs in the browser.
//
// The site is static, so one page (/audit, built as dist/audit.html) serves every record. The
// host rewrites /audit/* to it without changing the address (SWITCH-OVER-READINESS item 8), and
// the browser reads the id from the path. /audit?id=<id>&token=... works without the rewrite.

// GET /v1/audit/:id answers { audit: AuditRecord, ... }. Field names and types match
// `interface AuditRecord` in apps/api/src/routes/audit.ts; test/functional-pages.test.ts fails
// when they diverge.
export interface AuditStep {
  step: number;
  capability: string;
  data_source: string;
  data_source_url?: string;
  classification: string;
  transparency: "algorithmic" | "llm_assisted";
  transparency_description: string;
  latency_ms?: number;
  schema_valid: boolean;
}

export interface AuditRecord {
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
  audit_path: string;
  audit_url: string;
  steps: AuditStep[];
  personal_data_processed: boolean;
  personal_data_categories: string[];
  source: "stored" | "derived" | "hybrid";
  transparency_marker: string | null;
  gdpr: {
    art_22_classification: "data_lookup" | "screening_signal" | "risk_synthesis";
    art_22_disclosure: string;
    dispute_endpoint: string;
    dispute_endpoint_method: "POST";
    controller_obligations: string;
  };
}

/** Regulatory checklist, static reference data, word for word from compliance-types.ts. */
export const REGULATORY_CHECKLIST = [
  { regulation: "EU AI Act Article 12", description: "Full execution logging with per-step timestamps and data sources" },
  { regulation: "EU AI Act Article 13", description: "Data source transparency and AI involvement documented" },
  { regulation: "EU AI Act Article 14", description: "Human oversight level classified and documented" },
  { regulation: "EU AI Act Article 50", description: "AI-generated content explicitly marked per step" },
  { regulation: "GDPR Article 30", description: "Complete processing record with data classifications" },
  { regulation: "GDPR Article 15/17", description: "Transaction data accessible and deletable via API" },
];

export interface AuditLocation {
  id: string | null;
  token: string | null;
  /** Unix seconds, as signed into the link. Absent on links issued before F-A-006. */
  expiresAt: string | null;
}

/**
 * The record a page address names: /audit/<id>?token=…&expires_at=… (the links the API issues,
 * apps/api/src/lib/audit-token.ts), or /audit?id=<id>&token=… where the host cannot rewrite.
 */
export function parseAuditLocation(pathname: string, search: string): AuditLocation {
  const q = new URLSearchParams(search);
  const m = pathname.match(/^\/audit(?:\.html)?\/([^/]+)\/?$/);
  let id: string | null = null;
  if (m) {
    try {
      id = decodeURIComponent(m[1]);
    } catch {
      id = null;
    }
  }
  id ||= q.get("id") || null;
  return { id: id?.trim() || null, token: q.get("token") || null, expiresAt: q.get("expires_at") || null };
}

/**
 * GET /v1/audit/:id with the token and, when the link carries one, its expiry. The old page sent
 * only the token, which the API reads as a pre-F-A-006 link and refuses for every link it issues now.
 */
export function auditRequestUrl(apiBase: string, loc: AuditLocation): string {
  const params = new URLSearchParams({ token: loc.token ?? "" });
  if (loc.expiresAt) params.set("expires_at", loc.expiresAt);
  return `${apiBase}/v1/audit/${encodeURIComponent(loc.id ?? "")}?${params.toString()}`;
}

/** "3 years from execution", or "45 days from execution" (AuditRecord.tsx RetentionPeriodLabel). */
export function formatPeriod(days: number): string {
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365;
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${days} days`;
}

/** Where the record's tool or bundled check lives on this site (/capabilities/:slug became /tools/:slug). */
export function entityPath(a: Pick<AuditRecord, "type" | "entity_slug">): string {
  return a.type === "capability" ? `/tools/${a.entity_slug}` : `/solutions/${a.entity_slug}`;
}

export type AuditOutcome =
  | { kind: "record"; audit: AuditRecord }
  | { kind: "pending" }
  | { kind: "expired"; message: string | null }
  | { kind: "not_found" };

/** How the page reads an answer from GET /v1/audit/:id. */
export function auditOutcome(status: number, body: unknown): AuditOutcome {
  const b = (body ?? {}) as { audit?: AuditRecord; status?: string; message?: string };
  if (status === 202 || b.status === "pending") return { kind: "pending" };
  if (status === 410) return { kind: "expired", message: typeof b.message === "string" ? b.message : null };
  if (status >= 200 && status < 300 && b.audit && Array.isArray(b.audit.steps) && b.audit.steps.length > 0) return { kind: "record", audit: b.audit };
  return { kind: "not_found" };
}
