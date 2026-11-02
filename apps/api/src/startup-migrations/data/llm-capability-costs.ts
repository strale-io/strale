/**
 * Canonical registry of capabilities that invoke the Anthropic SDK,
 * with their per-call `external_cost_cents` for scheduler-skip purposes.
 *
 * **Why this exists.** The test scheduler dispatch query in
 * apps/api/src/jobs/test-scheduler.ts:262 filters on
 * `test_suites.external_cost_cents = 0`. Any capability with a suite at
 * 0 is scheduled hourly. That's correct for free capabilities. It's
 * disastrous for paid LLM capabilities whose suite cost was never set:
 * the scheduler will execute them 24× per day each, with each execution
 * making real Anthropic calls. The May 2026 cost ramp (audit PR #84)
 * was exactly this — PR #46 (2026-05-04) cut the cadence from 24h → 1h,
 * and ~73 always-LLM Haiku capabilities had `external_cost_cents = 0`,
 * so they were being hammered hourly. PR #49 fixed 5 caps (Dilisense ×
 * 3 + eSortcode + Sonnet) and PR #55 fixed invoice-extract; PR #49's
 * commit body explicitly deferred "Anthropic-Haiku bulk set (~80 caps)"
 * which is the gap this file closes.
 *
 * **The CI gate.** `llm-capability-costs.test.ts` walks
 * `apps/api/src/capabilities/*.ts`, identifies every file that imports
 * `@anthropic-ai/sdk`, and asserts each one is registered in one of:
 *
 *   - `ALWAYS_LLM_CAPABILITY_COSTS` (always invokes LLM on a successful
 *     call — must have cost > 0 so the scheduler skips it)
 *   - `CONDITIONAL_LLM_CAPABILITIES` (LLM only fires on a code path the
 *     standard test fixture does NOT hit — legitimately keeps cost = 0
 *     so scheduled testing still covers the registry-API / native path)
 *   - `DEACTIVATED` from `capabilities/auto-register.ts` (executor file
 *     exists but is not registered at startup)
 *
 * Adding a new LLM-using capability requires adding it to one of those
 * three sets. The CI gate fails with a slug-named message otherwise.
 *
 * This is the **interim** structural guard. The deeper fix is to
 * decouple scheduling eligibility from billing data — introduce a
 * dedicated `test_suites.scheduled_testing_eligible` column — tracked
 * as a separate Notion To-do.
 */

/**
 * Slug → per-call cost in cents (€-denominated; matches the
 * `external_cost_cents` column on `test_suites`).
 *
 * - Sonnet 4.6 caps: 3¢, calibrated against a 4K-input + 1.5K-output
 *   typical call. PR #49 established this value for risk-narrative-
 *   generate; this file is the canonical store going forward.
 * - Haiku 4.5 caps: 1¢, the defensible-minimum floor matching PR #49 /
 *   PR #55. Real per-call Haiku cost on typical inputs is below 1¢
 *   (€0.005–0.014 for 700-input + 1000-output); the floor's operational
 *   role is purely the scheduler-skip flip, not cost accuracy. Precise
 *   per-cap calibration is the separate P2 to-do.
 *
 * Slugs are sorted alphabetically inside each band for diff hygiene.
 */
export const ALWAYS_LLM_CAPABILITY_COSTS: Readonly<Record<string, number>> = Object.freeze({
  // ─── Sonnet 4.6 — owned by block 0062 (PR #49) ──────────────────────────────
  // Listed here so the CI gate sees a registered cost; the runtime
  // UPDATE for this slug fires from block 0062, not block 0064.
  "risk-narrative-generate": 3,

  // ─── Haiku 4.5 vision — owned by block 0063 (PR #55) ────────────────────────
  // Same pattern: listed for CI; runtime UPDATE fires from block 0063.
  "invoice-extract": 1,

  // ─── Haiku 4.5 — owned by block 0065 (PR #86 follow-up) ────────────────────
  // website-to-company: PR #86 traced the cap and found llmExtractCompanyName
  // fires whenever meta-extract returns any title/site_name (i.e. every real
  // site), and the cap also chains into a country-specific registry that
  // can itself trigger another LLM call. The "structured-data bypasses LLM"
  // bypass premise was wrong; promoting to the always-LLM band.
  "website-to-company": 1,

  // ─── Haiku 4.5 — owned by block 0064 (this file) ────────────────────────────
  "address-parse": 1,
  "agent-trace-analyze": 1,
  "api-docs-generate": 1,
  "api-mock-response": 1,
  "blog-post-outline": 1,
  "brand-mention-search": 1,
  "changelog-generate": 1,
  "classify-text": 1,
  "code-convert": 1,
  "code-review": 1,
  "commit-message-generate": 1,
  "company-enrich": 1,
  "company-industry-classify": 1,
  "company-tech-stack": 1,
  "competitor-compare": 1,
  "context-window-optimize": 1,
  "contract-extract": 1,
  "cookie-scan": 1,
  "crontab-generate": 1,
  "curl-to-code": 1,
  "customs-duty-lookup": 1,
  "diff-review": 1,
  "dockerfile-generate": 1,
  "docstring-generate": 1,
  "email-draft": 1,
  "env-template-generate": 1,
  "error-explain": 1,
  "eu-regulation-search": 1,
  "eu-trademark-search": 1,
  "fake-data-generate": 1,
  "gdpr-fine-lookup": 1,
  "github-actions-generate": 1,
  "github-repo-analyze": 1,
  "hs-code-lookup": 1,
  "image-to-text": 1,
  "job-posting-analyze": 1,
  "jsdoc-generate": 1,
  "landing-page-roast": 1,
  "meeting-notes-extract": 1,
  "nginx-config-generate": 1,
  "openapi-generate": 1,
  "pdf-extract": 1,
  "pii-redact": 1,
  "pr-description-generate": 1,
  "price-compare": 1,
  "pricing-page-extract": 1,
  "privacy-policy-analyze": 1,
  "product-reviews-extract": 1,
  "product-search": 1,
  "prompt-compress": 1,
  "prompt-optimize": 1,
  "readme-generate": 1,
  "receipt-categorize": 1,
  "regex-explain": 1,
  "regex-generate": 1,
  "release-notes-generate": 1,
  "resume-parse": 1,
  "return-policy-extract": 1,
  "schema-migration-generate": 1,
  "sentiment-analyze": 1,
  "seo-audit": 1,
  "social-post-generate": 1,
  "sql-explain": 1,
  "sql-generate": 1,
  "sql-optimize": 1,
  "structured-scrape": 1,
  "summarize": 1,
  "terms-of-service-extract": 1,
  "test-case-generate": 1,
  "translate": 1,
  "web-extract": 1,
  "webhook-test-payload": 1,
  "youtube-summarize": 1,
});

/**
 * Slugs owned by block 0064's UPDATE. Derived: every key in
 * `ALWAYS_LLM_CAPABILITY_COSTS` except the two that earlier blocks
 * already cover (0062 for risk-narrative-generate, 0063 for
 * invoice-extract). The migration emits one UPDATE filtered by this
 * list at cost = 1.
 *
 * Sorted lexicographically so the rendered SQL is stable across
 * environments — important for the test snapshot to bind.
 */
export const BLOCK_0064_SLUGS: readonly string[] = Object.freeze(
  Object.keys(ALWAYS_LLM_CAPABILITY_COSTS)
    .filter(
      (slug) =>
        slug !== "risk-narrative-generate" &&
        slug !== "invoice-extract" &&
        slug !== "website-to-company",
    )
    .sort(),
);

/**
 * Slugs owned by block 0065's cost UPDATE. PR #86 follow-up: the cap was
 * previously in `CONDITIONAL_LLM_CAPABILITIES` but the audit's trace
 * showed the bypass premise was wrong — `llmExtractCompanyName` fires
 * on every real site URL. Block 0065 bumps it to 1¢ to flip the
 * scheduler-skip semantic; same flat-cost-1¢ shape as block 0064.
 */
export const BLOCK_0065_SLUGS: readonly string[] = Object.freeze(["website-to-company"]);

/**
 * Capabilities that import the Anthropic SDK but legitimately keep
 * `external_cost_cents = 0` because the standard test fixture exercises
 * a code path that does NOT invoke the LLM. Bumping their cost would
 * remove the registry-API / native-fetch coverage from scheduled
 * testing.
 *
 * Each entry must carry an inline comment explaining the bypass.
 *
 * Adding a new conditional-LLM capability: include the slug here AND
 * confirm via the executor source that the standard `health_check_input`
 * (from `manifests/<slug>.yaml`) reaches the early-return branch before
 * the `messages.create` call.
 */
export const CONDITIONAL_LLM_CAPABILITIES: ReadonlySet<string> = new Set([
  // ─── Country-data caps with numeric-registry-code fixtures ─────────────────
  // For each of these, the executor's natural-language → reg-code
  // resolver (`extractCompanyName` / `name-resolver.ts`) only fires
  // when the input is NOT a numeric registry code. Manifest
  // `health_check_input` uses the country's registry-code format
  // (CIN, CVR, registry code, Y-tunnus, SIREN, organisasjonsnummer,
  // company number), which bypasses the LLM call. Scheduled
  // testing exercises the direct registry-API path (free).
  //
  // brazilian-company-data was removed 2026-05-11 (PR #86 follow-up): the
  // capability never reached its LLM helper from the registered executor;
  // dead-code helper + SDK import were deleted, so the cap no longer
  // imports `@anthropic-ai/sdk` and falls outside the CI gate entirely.
  "cz-company-data",
  "danish-company-data",
  "estonian-company-data",
  "finnish-company-data",
  "french-company-data",
  "norwegian-company-data",
  "uk-company-data",
  // us-company-data: SDK is reached only on alphanumeric / ticker inputs in
  // production. The scheduled-test fixture was changed (PR #86 follow-up)
  // from "AAPL" (ticker, fails `findCik` regex → LLM path) to a numeric
  // CIK ("320193"), which matches `/^\d{1,10}$/` and routes directly to
  // the SEC EDGAR API. Hourly outage detection on EDGAR is preserved.
  "us-company-data",

  // ─── Invalid-format early-return ─────────────────────────────────────────────
  // container-track: ISO 6346 validation + carrier-prefix mapping
  // resolves real container numbers without LLM. LLM (Browserless +
  // Haiku tracking-page extraction) fires only when validation passes.
  // The scheduled-test fixture is the placeholder string "test_value",
  // which fails `validateContainerNumber` → invalid-format early-return
  // path → no Browserless fetch, no LLM call. PR #86 corrected the
  // bypass justification (was previously claimed to be a well-known
  // carrier prefix); the verdict is unchanged.
  "container-track",
]);
