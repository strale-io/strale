Intent: ship Slovak identity capability via the Slovak RPO (Register of Legal Persons) direct REST, closing SK Gap-7 per DEC-20260507-A.

## What shipped

- `apps/api/src/capabilities/slovak-company-data.ts` — direct REST against `https://api.statistics.sk/rpo/v1/`. Two-call pattern: `GET /search?identifier={ico}` resolves an internal id, `GET /entity/{id}` returns the full record. Free, no auth, CC-BY 4.0 under Act 272/2015 §§ 7, 7a. 60 rpm/IP unauthenticated cap (shared across Strale's egress — error message says so).
- `manifests/slovak-company-data.yaml` — minimal manifest with `marketplace_eligible: true` (zero-cost, low-maintenance, CC-BY 4.0 redistribution-permissive — all three CLASSIFICATION.md criteria pass), `avg_latency_ms: 1500`, 14 output fields (6 guaranteed / 8 common after reliability review), 3 honest limitations.
- DB row active (`lifecycle_state=active, visible=true, is_active=true`).
- PR https://github.com/strale-io/strale/pull/61 — branch `feat/sk-company-data`, two commits (`790498b` initial + `2cdf083` /go review fixes).

Output fields: `ico, company_name, address, legal_form, legal_form_code, registration_date, status, source_register, registration_office, registration_number, nace_code, nace_description, directors[], last_updated`. Status derived from whether the current address, legal form, and identifier records are still open (no `validTo`) — RPO does not publish an explicit dissolved flag. Name is excluded from the witness set because rebrands close the prior name without dissolving the company.

Reuse: `normalizeIco` imported from `apps/api/src/lib/cz-validation.ts`. Czech and Slovak IČO share the 8-digit zero-padded format inherited from pre-1993 Czechoslovakia. The checksum rules differ; the SK exec doesn't use the checksum half.

## Verification

- `tsc --noEmit` clean
- `validate-capability.ts --slug slovak-company-data` 19/19
- `smoke-test.ts --slug slovak-company-data` 11/11 (live execution 514 ms, well under the 1500 ms manifest budget)
- `checkReadiness("slovak-company-data")` `ready: true, issues: []`

Six-lens review (technical + product) ran in parallel. One HIGH (junk input < 4 digits would burn an API call — fixed by adding a length-floor before the live fetch), four MEDIUMs fixed (`last_updated` reliability mis-asserted as guaranteed; rate-limit message conflated caller IP with Strale's egress IP; `deriveStatus` walked time-versioned arrays twice; manifest prose said 4 status witnesses but code uses 3). Two MEDIUMs deferred — flagged in PR body, see "Open" below.

## Open / deferred

- **Rename `lib/cz-validation.ts` → `lib/ico-normalize.ts`** (or extract the normalizer). Once a Slovak consumer imports from a `cz-` named file, future contributors can break SK by adding Czech-specific behaviour. Architect lens flagged it; deferred to scope this PR. Do next time the file is touched.
- **CZ backfill — `legal_form` + `nace_codes` shape divergence.** SK emits `legal_form` (human-readable) + `legal_form_code`, CZ emits only `legal_form_code`. SK emits singular `nace_code` / `nace_description`, CZ emits plural `nace_codes` array. The SK shape is correct for its source (RPO returns a single primary activity); CZ should be backfilled to align. Filing rather than degrading SK.
- **Notion + memory updates** are chat's responsibility per the build prompt: Active Vendor Stack `35367c87082c812e88d1dc6bdbfbd4f5` (SK Gap-7 → Live, counts shift), Coverage Matrix `35767c87082c8184ba34e116f673a1d6`, Vendor Roster row for api.statistics.sk RPO (Active, Primary DEC link DEC-20260507-A), Provider-Coverage DB. Memory note `project_business_registry_state.md` lists SK in Gap-7 — needs flip to Live.

## Non-obvious learnings

- The diligence doc claimed `rpo.statistics.sk/rpo/v1/` was 404. The actually-working host is **`api.statistics.sk/rpo/v1/`** (different subdomain). Worth recording so the next gap-coverage audit doesn't reject SK based on the wrong host.
- The RPO API uses HAL-style time-versioned arrays for every field (`fullNames[]`, `addresses[]`, `legalForms[]`, etc., each with `validFrom` / optional `validTo`). The "current" entry is the one with no `validTo`; if all entries are bounded (rare, only dissolved cases), the latest `validFrom` wins. New helper `pickCurrent<T>` lives in the executor file — promote to `lib/` if a second time-versioned registry lands.
- The 60 rpm rate limit applies per IP at the RPO edge, and that IP is Strale's shared Railway egress, not the caller's. Hitting the cap in production would block all Slovak lookups platform-wide for ~60 seconds, not per tenant. Authenticated access (registration with ŠÚ SR) lifts the cap; revisit if SK lookup volume becomes meaningful.
- The build prompt's planning assumption of "single by-IČO endpoint" turned out to be a two-call pattern (search → entity). Acceptable per the prompt's exception clause ("if a single by-IČO endpoint exists, use that as the primary; halt only if the only path is search-by-name"). Documented as a `coverage`-category limitation in the manifest.

## Cost

Zero external cost — RPO is free CC-BY 4.0. Anthropic spend during this session was ~6× model calls for the parallel review agents and a few small follow-ups; all within normal session budget.
