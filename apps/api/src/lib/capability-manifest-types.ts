/**
 * Capability manifest shape — the YAML authoring surface.
 *
 * Extracted here (Cluster 2 Phase 2) so both scripts/onboard.ts and
 * src/lib/onboarding-gates.ts can reference the same type. Previously
 * lived in scripts/onboard.ts, but src/ cannot import from scripts/
 * (tsconfig build-include is src/** only), so the orchestrator in
 * onboarding-gates.ts needs this exposed under src/.
 *
 * snake_case matches the YAML / onboarding wire format. The DB-row
 * shape (camelCase) is a separate structure — see db/schema.ts.
 */

export interface ManifestExpectedField {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
  reliability?: string;
}

export interface ManifestLimitation {
  title?: string | null;
  text: string;
  category: string;
  severity?: string;
  workaround?: string | null;
}

/**
 * A capability's documented upstream vendor rate limit — the canonical
 * home for "how much can we call this vendor before it throttles us."
 *
 * Follow-up to Block 0082 (2026-08-14, PR #235): that PR's post-review
 * note found the same ~10 vendor rate-limit facts encoded independently
 * in three places (the migration's per-cap citations, the CI lint's
 * THROTTLED_HOST_RULES `reason` prose, and the manifest's already-derived
 * `quota_cap`) with no structural link between them — nothing forces the
 * lint's rule text to be revisited when a vendor changes its limit.
 *
 * This field is the fix: the manifest carries the raw vendor fact (value,
 * unit, citation) as data, not prose. `check-cost-class-coherence.mjs`
 * cross-checks it against `cost_class`/`quota_cap` for internal
 * consistency. Deliberately NOT the detector for undeclared throttling —
 * that stays a separate hardcoded host list
 * (`check-cost-class-coherence.mjs`'s `THROTTLED_HOST_RULES`) that names
 * *which* hosts are known-throttled without carrying the number, so a
 * capability that hits a known-throttled host with no `known_rate_limit`
 * at all still gets caught (the host list can't go stale to zero — it's a
 * detector, not a value store). See that script's file header for the
 * full split rationale.
 */
export interface ManifestKnownRateLimit {
  /** The vendor-documented numeric rate or daily cap. */
  value: number;
  unit: "per_second" | "per_minute" | "per_day";
  /** Citation — the vendor doc page the number was read from. */
  source_url: string;
}

export const KNOWN_RATE_LIMIT_UNITS = ["per_second", "per_minute", "per_day"] as const;

/**
 * Derive a **ceiling** `quota_cap` from a single vendor-documented rate
 * limit.
 *
 * For `per_second`/`per_minute` rates, the result is the rate's
 * **1-hour-sustained volume** (rate × 3600 or rate × 60) — a deliberately
 * conservative fraction of the naive 24h extrapolation (see Block 0082's
 * header comment in startup-migrations.ts for the original rationale:
 * e.g. SEC EDGAR's cap is 36,000, not the theoretical 864,000/day the
 * 10 req/sec rate would imply if sustained all day). For `per_day`, the
 * vendor's literal daily figure is used directly (e.g. Etherscan's
 * documented 100,000 calls/day).
 *
 * The result is stored under `quota_window: "daily"` regardless of which
 * unit produced it — that's an existing Block 0082 convention, not
 * something this function decides.
 *
 * This is a ceiling, not a target: `check-cost-class-coherence.mjs`'s
 * consistency check requires `quota_cap <= deriveQuotaCapFromRateLimit(...)`,
 * not equality. A manifest is free to declare a more conservative
 * `quota_cap` than the vendor technically permits (e.g. officer-search's
 * UK Companies House citation derives a 7,200/hr ceiling, but its
 * `quota_cap: 600` uses the vendor's own literal 5-minute window figure
 * directly, well under the ceiling) — that's a legitimate operator
 * choice, not drift. Only *exceeding* the derived ceiling is a bug (a
 * spend/traffic budget bigger than the vendor actually grants). Equality
 * is not required for a second reason too: it would force a manifest
 * edit every time a vendor restates the same underlying limit in
 * different units.
 */
export function deriveQuotaCapFromRateLimit(rateLimit: ManifestKnownRateLimit): number {
  switch (rateLimit.unit) {
    case "per_second":
      return rateLimit.value * 3600;
    case "per_minute":
      return rateLimit.value * 60;
    case "per_day":
      return rateLimit.value;
    default: {
      const exhaustive: never = rateLimit.unit;
      throw new Error(`Unknown known_rate_limit.unit: ${exhaustive as string}`);
    }
  }
}

/**
 * Derive the ceiling `quota_cap` for a capability that touches MULTIPLE
 * throttled vendors (e.g. officer-search: UK Companies House + SEC
 * EDGAR) — the minimum (most restrictive) of each vendor's individually
 * derived ceiling. A capability's actual call volume is bounded by
 * whichever vendor throttles hardest, not their sum or their average.
 *
 * Throws on an empty array — callers should check `rateLimits.length` (or
 * use `getKnownRateLimits()`, which returns `[]` for "not declared") before
 * calling this; an empty array has no ceiling to derive.
 */
export function deriveQuotaCapFromRateLimits(rateLimits: readonly ManifestKnownRateLimit[]): number {
  if (rateLimits.length === 0) {
    throw new Error("deriveQuotaCapFromRateLimits requires at least one rate limit");
  }
  return Math.min(...rateLimits.map(deriveQuotaCapFromRateLimit));
}

/**
 * A single known_answer fixture: a real input plus the assertions to run
 * against its live output.
 */
export interface ManifestKnownAnswerFixture {
  input: Record<string, unknown>;
  expected_fields: ManifestExpectedField[];
}

export interface Manifest {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  is_free_tier?: boolean;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  data_source: string;
  data_source_type: string;
  transparency_tag?: string | null;
  freshness_category?: string;
  geography?: string;
  test_fixtures: {
    // Single fixture object (the ~300-manifest legacy shape, unchanged) OR
    // an array of fixtures — one per entry point — for multi-path
    // capabilities that need PRIMARY (ID lookup) and SECONDARY (name
    // search) coverage for Gate 5 (DEC-20260411-B). Use
    // `getKnownAnswerFixtures()` below to read this field; don't access
    // `.input` / `.expected_fields` directly, since those don't exist on
    // the array form.
    known_answer?: ManifestKnownAnswerFixture | ManifestKnownAnswerFixture[];
    health_check_input?: Record<string, unknown>;
  };
  output_field_reliability: Record<string, string>;
  limitations: ManifestLimitation[];
  maintenance_class?: string;
  // Initial latency seed; test runner overwrites once it has measured data.
  // Db-canonical per FIELD_CATEGORIES — manifest only seeds, never authority.
  avg_latency_ms?: number | null;
  // SA.2b (F-A-003, F-A-009): per-capability PII classification.
  // Required for all new capabilities onboarded post-SA.2b.b.
  processes_personal_data?: boolean;
  personal_data_categories?: string[];
  // Per DEC-20260503-A — strale.dev marketplace surfacing decision.
  // Defaults to true in the DB if omitted from the manifest. Set false
  // for thin passthroughs of paid 3rd-party vendors with significant
  // fixed cost or ToS-prohibited resale terms; PAYG with low fixed cost
  // is fine and stays true. When set false, marketplace_eligible_reason
  // is REQUIRED (non-empty) — enforced by validateManifest and
  // validateCapabilityStructure. See manifests/CLASSIFICATION.md for the
  // full cost-shape, maintenance-burden, and ToS-posture criteria plus
  // the decision tree and reason-string content guide.
  marketplace_eligible?: boolean;
  marketplace_eligible_reason?: string | null;
  // Cost-class taxonomy (Phase A0b). NULL/omitted means "not yet
  // classified" — the boot invariant skips in GRACE mode; the
  // dispatcher refuses internal-test invocations and the scheduler
  // skips. customer_paid still flows through. Validated by the
  // CHECK constraints from Block 0067 at DB level.
  cost_class?:
    | "free_unlimited"
    | "free_quota"
    | "paid_with_free_tier"
    | "paid_prepaid"
    | "paid_subscription";
  quota_window?: "daily" | "monthly" | "none";
  // Quota cap in calls per window. Required for free_quota and
  // paid_with_free_tier. NULL for the other classes.
  quota_cap?: number | null;
  // Day-of-month reset for monthly window (1..31). NULL for daily/none.
  quota_reset_dom?: number | null;
  // Vendor-documented rate limit citation(s). Optional — most capabilities
  // have no third-party vendor quota (algorithmic, static-table, or
  // arbitrary-customer-target fetches). Required (by
  // check-cost-class-coherence.mjs, not this type) for any capability
  // whose executor calls a host on that script's THROTTLED_HOST_RULES
  // list. Single object (the common case, one vendor) OR an array (a
  // capability touching multiple throttled vendors, e.g. officer-search:
  // UK Companies House + SEC EDGAR) — same single-or-array convention as
  // `test_fixtures.known_answer` above. Use `getKnownRateLimits()` below
  // to read this field. See ManifestKnownRateLimit's doc comment for the
  // full context.
  known_rate_limit?: ManifestKnownRateLimit | ManifestKnownRateLimit[] | null;
}

/**
 * Normalize `test_fixtures.known_answer` to an array of fixtures.
 *
 * Single object in → array-of-one out (the legacy shape, unchanged
 * semantics). Already-array in → returned as-is. Absent → empty array.
 * Every reader of known_answer fixtures (onboarding-gates.ts validation,
 * onboard.ts's buildTestSuites/verifyFixtures/discoverFixtures) should go
 * through this helper rather than accessing `.input` / `.expected_fields`
 * directly, since those don't exist on the array form.
 */
export function getKnownAnswerFixtures(
  m: Pick<Manifest, "test_fixtures">,
): ManifestKnownAnswerFixture[] {
  const ka = m.test_fixtures?.known_answer;
  if (!ka) return [];
  return Array.isArray(ka) ? ka : [ka];
}

/**
 * Normalize `known_rate_limit` to an array of citations.
 *
 * Single object in → array-of-one out. Already-array in → returned
 * as-is. Absent → empty array (the "no vendor quota" / "not yet
 * declared" case — callers should treat `[]` as "nothing to derive," not
 * as an error). Mirrors `getKnownAnswerFixtures()` above; every reader of
 * `known_rate_limit` should go through this rather than accessing the
 * field directly, since the raw field can be an object OR an array.
 */
export function getKnownRateLimits(
  m: Pick<Manifest, "known_rate_limit">,
): ManifestKnownRateLimit[] {
  const rl = m.known_rate_limit;
  if (!rl) return [];
  return Array.isArray(rl) ? rl : [rl];
}
