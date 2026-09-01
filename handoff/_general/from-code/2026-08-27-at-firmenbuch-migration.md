# 2026-08-27 — Austria on the official Firmenbuch API; drift sweep to zero

**Intent:** act on the JustizOnline email granting Moonlighter AB the IWG token
for the Firmenbuch HVD API — migrate `austrian-company-data` off the Openapi.com
WW-Top aggregator onto the official API, end to end. Side quest (user-started
chip): take the platform-facts drift sweep to 0 findings.

## Shipped

- **PR #410 (merged, deployed, verified):** `austrian-company-data` now reads
  the Firmenbuch directly. SOAP 1.2, `X-API-KEY` = `JUSTIZONLINE_API_KEY` (set
  on Railway prod pre-merge, `--skip-deploys`; also in root `.env`). Input:
  Firmenbuchnummer or company name (VAT contract retired with a targeted
  refusal). Output adds legal form, court, EUID, current officers with
  representation authority + DOB, and `RECHTSTATSACHE` legal facts —
  `status: dissolved` is real data now (verified live: NIKI Luftfahrt FN
  230533 w). Name resolution uses the shared `pickByName`; all input-shaped
  failures are `CapabilityRefusalError` (french-company-data breaker incident
  not repeated). 8-angle review produced 21 findings, 19 applied in-PR.
- **Prod prepped under delegated authorities** (`catalogue_metadata_sync`,
  `capability_onboarding`, `fixture_refresh` via `DATABASE_URL_WRITE` +
  `autonomousAuthority`): manifest synced, cost_class corrected
  free_quota→free_unlimited (free_quota demands a quota window; the guarded
  executor threw `window=null` on every internal execution), all 8 test suites
  on contract-valid inputs, both known_answer entry points verified against
  live output, smoke test 11/11 green.
- **ACTIVATED (DQ-20, Petter's explicit chat approval, same evening).** The
  founder-gated flags flipped in one UPDATE with before-state captured
  (inactive/invisible/x402-off/80¢/8000ms/degraded → active/visible/x402-on/
  5¢/1500ms/active). Post-activation verification: listed in /v1/capabilities
  at 5¢, /x402/v2 answers 402 with a $0.054 USDC challenge, prod test suite
  **7/7** — after relaxing two discover-era literal-timestamp `source_as_of`
  assertions to not_null (stored shape is `{checks:[...]}`). Catalog snapshot
  regenerated (PR #416); DQ-20 marked answered (PR #415).
- **PR #413 (merged):** drift-allow markers in the stale-vendor sweep.
  **PR #414 (merged):** manifest corrections + DQ-20 (rebuilt on main after a
  squash-merge conflict — rebasing pre-squash commits replays the whole
  feature branch; rebuild the branch from main instead). **strale-frontend #21
  (merged):** count-free phrasing + three `drift-allow: ComplyAdvantage`
  markers; combined sweep verified **0 findings**.

## Loose threads

1. **DQ-20 needs Petter** — activation + price 5¢ + x402 flag, one statement.
2. ~~Catalog regen + AT KYB VIES~~ — **both closed 2026-08-28.** Catalog
   regenerated (PR #416). VIES: PR #419 declares the optional `vat_number`
   input on KYB Essentials (Complete/Invoice already had it) and makes the
   descriptions truthful; applied to prod as a targeted metadata UPDATE on
   the 18 EU essentials + 18 complete rows (NOT a re-seed — the seed's
   upsert force-sets isActive and resets priceCents; it is founder-gated
   via requireFounderGrant, correctly). Verified on /v1/solutions/:slug and
   /x402/catalog. DEC-20260827-A filed in the Decisions DB on Petter's
   confirmation. NOTE: `kyb-essentials-at` read `is_active=false` mid-session but flipped
   to active ~40 min later without any listing-state write from this
   session — the platform's own solution-availability recompute reacting
   to austrian-company-data going live. All three AT solutions
   (essentials 150¢, complete 250¢, invoice-verify 250¢) are now active.
3. ~~Task chip: sync-script authority-field gap~~ — **closed same night, PR
   #417 (merged):** all five missing manifest-canonical fields added (name +
   the A0b cost-class group), null semantics mirroring the gate, a
   FIELD_CATEGORIES parity test that fails CI on the next gap, and a warning
   when the escape hatch pushes db-canonical transparency_tag / hybrid
   freshness_category. Prod dry-runs clean for AT and SE.
4. `onboard.ts` mixes connections: test-suite writes go through the operator
   gate, but `persistCapability` uses `getDb()` → read-only fatal mid-run.
   Worked around by pointing both URLs at the write role for one invocation;
   worth migrating properly.
5. `--discover` writes volatile values as `equals` assertions (`source_as_of`
   timestamp) and marks rare/common fields guaranteed — hand-review its output
   every time; the reliability-rules failure mode is generated, not prevented,
   by that flag.
6. Two review findings deliberately deferred: shared cross-call deadline on the
   name path (3 sequential SOAP calls × 12s vs the 15s /v1/do sync ceiling;
   mitigated via avg_latency_ms 1500 + limitation), and the KYB VIES wiring.
7. Petter may want to send the courtesy reply to JustizOnline (draft in chat).

Worktrees removed and merged branches deleted. All four PRs (backend #410,
#413, #414; frontend #21) merged same-day.
