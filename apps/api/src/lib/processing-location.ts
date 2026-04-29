// Single source of truth for `processing_location` and `processing_jurisdiction`
// in compliance / audit records.
//
// Resolution order for processing_location:
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
// `getStraleJurisdiction()` derives Strale's own ISO-3166-style jurisdiction
// code from the resolved region. Fixes F-AUDIT-18: the prior heuristic in
// provenance-builder.ts started with `["EU"]` because its docstring asserted
// "Railway EU West" — false; Railway is US East. Two of three audit body
// composers (buildFullAudit, buildFreeTierAudit) then hardcoded
// `data_jurisdiction: "EU"`, telling customers their data was processed in
// the EU when it was processed in the US. That's the regulator-gotcha at the
// heart of F-AUDIT-01.
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

// Map a Railway/region string to a coarse jurisdiction code suitable for
// audit-body `data_jurisdiction`. Match is prefix-based to tolerate the
// various region formats Railway has published (e.g. "us-east4-eqdc4a",
// "us-east-4", "eu-west4", "asia-southeast1").
//
// Returns "unknown" rather than guessing. The audit body must not assert
// jurisdictions we cannot derive.
export function jurisdictionFromRegion(region: string): string {
  const r = region.toLowerCase();
  if (r.startsWith("us-") || r === "us") return "US";
  if (r.startsWith("eu-") || r === "eu") return "EU";
  if (r.startsWith("uk-") || r === "uk" || r.startsWith("gb-")) return "GB";
  // Asia: be specific. We return the most likely country only when Railway's
  // region clearly maps. "asia-southeast1" is Singapore on Railway (per their
  // docs) but we keep "unknown" until we verify in production that we ever
  // run there. Better to admit ignorance than fabricate.
  return "unknown";
}

export function getStraleJurisdiction(): string {
  return jurisdictionFromRegion(getProcessingLocation());
}

// Exported for tests only — resets the once-warn latch.
export function __resetProcessingLocationWarnForTests(): void {
  _warned = false;
}
