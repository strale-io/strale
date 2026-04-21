// Single source of truth for `processing_location` in compliance / audit records.
//
// Resolution order:
//   1. RAILWAY_REPLICA_REGION — Railway's documented runtime env var for the
//      replica's physical region. Always set on Railway deploys.
//   2. STRALE_PROCESSING_REGION — pre-existing manual override, kept for
//      backwards compatibility with any env that set it explicitly.
//   3. "unknown" — local dev / non-Railway host. Warns once so ops notices
//      a missing env in a deployed environment.
//
// Contain-phase fix for F-AUDIT-02 (see SESSION_F_audit_findings.md).
// Prior state: three hardcoded `"eu-west (Railway EU)"` strings in
// `routes/do.ts` while the API actually runs on Railway us-east-4. The
// existing helper in `compliance-profile.ts` used STRALE_PROCESSING_REGION
// with a `"us-east"` fallback — correct by coincidence, not by derivation.
// Unified here so both compliance-profile and audit builders agree.
//
// Semantic meaning of `processing_location` when processing spans multiple
// regions (API replica, Browserless region, LLM provider region) is
// deferred to DEC-20260425-A / Session F remediation R1.

let _warned = false;

export function getProcessingLocation(): string {
  const railway = process.env.RAILWAY_REPLICA_REGION;
  if (railway && railway.length > 0) return railway;

  const legacy = process.env.STRALE_PROCESSING_REGION;
  if (legacy && legacy.length > 0) return legacy;

  if (!_warned) {
    console.warn(
      "[processing-location] Neither RAILWAY_REPLICA_REGION nor STRALE_PROCESSING_REGION is set; " +
        'falling back to "unknown". Expected in local dev. In a deployed environment this indicates ' +
        "a misconfiguration — compliance records will carry 'unknown' as processing_location.",
    );
    _warned = true;
  }
  return "unknown";
}

// Exported for tests only — resets the once-warn latch.
export function __resetProcessingLocationWarnForTests(): void {
  _warned = false;
}
