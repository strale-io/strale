# 2026-04-17 — CZ onboarding Batch 1 + url-to-markdown CB fix

**Intent:** Activity triage → Czech data source deep-scan → ship Batch 1 CZ capabilities (5) + fix url-to-markdown circuit-breaker false-positive. All work landed uncommitted on `main`.

## Shipped

### Circuit breaker fix — `apps/api/src/lib/circuit-breaker.ts`
Added 3 patterns to `USER_INPUT_ERROR_PATTERNS` so target-site 5xx is treated like 4xx (target's problem, not Strale's). Prevents spurious single-failure trips on `url-to-markdown` when a scraped site returns HTTP 5xx.
- `"URL returned HTTP 5"` (fast-path)
- `"returned a server error"` (browserless path)
- `"could not be loaded (HTTP"` (generic fallback)

### 5 new capabilities (lifecycle_state=validating, visible=false)
All onboarded via `scripts/onboard.ts --discover --manifest ...`. All pass smoke-test.

1. **`cz-company-data`** (€0.05, company-data) — ARES direct REST, IČO lookup + fuzzy name resolve via Claude Haiku. Files: `src/capabilities/cz-company-data.ts`, `manifests/cz-company-data.yaml`.
2. **`cz-ico-validate`** (€0.02, validation, pure-computation) — IČO mod-11 checksum.
3. **`cz-bank-account-validate`** (€0.02, validation, pure-computation) — domestic BBAN prefix + account mod-11 checksums (NOT covered by existing IBAN mod-97).
4. **`cz-birth-number-validate`** (€0.02, validation, pure-computation) — rodné číslo format + date + mod-11 check.
5. **`cz-datova-schranka-id-validate`** (€0.02, validation, pure-computation) — 7-char data box ID format check.

### Supporting libs
- `apps/api/src/lib/cz-validation.ts` — shared parsers for IČO, BBAN, rodné číslo, data box ID.
- `apps/api/src/lib/vat-derivation.ts` — added `deriveVatCZ`.

### Strategy note (Notion)
Journal brainstorm entry raised: [SQS as a source-routing primitive](https://www.notion.so/34567c87082c813bafcec03c06c06a39) — whether Strale should promote **overlapping data sources** and let SQS rank them per call, vs current "one unique source per capability" posture. Action Required=yes. Tagged for a dedicated strategy session.

## Batch 1.5 (shipped later same session — ADDENDUM)

Spike ran after Batch 1 was committed.

**Shipped:** `cz-unreliable-vat-payer` (€0.05, compliance). MF ČR SOAP endpoint at
`https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP` works cleanly with
raw fetch + XML body. Uses `getStatusNespolehlivyPlatceRozsireny` operation which returns both the
unreliable-payer flag AND the published-bank-accounts list (both needed for §109 joint-liability
protection on Czech invoices). Response XML parsed via regex — schema has been stable since 2013.
No auth, no rate limit observed. Test fixture verified live against Škoda Auto (DIČ CZ00177041) →
not-unreliable, 16 published accounts (mix of standard CZ and foreign IBANs).

**Deferred:** `cz-insolvency-check` (ISIR). Spike revealed:
1. ISIR public SOAP service (`IsirWsPublicService`) is an **event-stream** API
   (`getIsirWsPublicPodnetId`), not a lookup-by-debtor API. Designed for mirror-sync, wrong shape
   for on-demand queries.
2. Public HTML search page (`/isir/public/seznam.do`) returns HTTP 500 from direct POST —
   may require additional session setup or is temporarily broken.
3. Options for a proper ISIR capability (none cheap):
   - (a) Build an ETL pipeline mirroring the event stream into our DB, query locally
   - (b) Debug the 500s and build a Browserless scrape
   - (c) Evaluate a third-party wrapper (e.g. isir.info) — introduces dependency risk
4. Needs a dedicated session with an explicit scope decision on (a/b/c) before implementation.
- **Batch 2:** `cz-trade-license-check` (RŽP via ARES umbrella), `cz-court-decisions-search` (rozhodnuti.justice.cz opendata).
- **Batch 3:** `cz-public-contracts-search` (smlouvy.gov.cz), `cz-procurement-search` (NEN/ISVZ).
- **Batch 4:** `cz-address-verify` (RÚIAN — spike first, SOAP vs VDP), `cz-law-lookup` (eSbírka — MV ČR registration needed).

## Dropped during triage (already covered by existing caps)
- `cz-vat-validate` → `vat-validate` (VIES) covers it
- `cz-sanctions-screen` → `sanctions-check` (OpenSanctions + Dilisense fallback) covers it
- `cz-holiday-lookup` → `public-holiday-lookup` (Nager.Date) covers it
- `cnb-exchange-rate` → deprioritized; `forex-history` (Frankfurter/ECB) already handles CZK. Only build if CZ statutory-accounting source specifically needed.

## Solution bundles to assemble (NOT built yet)
After Batch 1.5 lands, these solutions become assemblable using existing + new caps:
- `kyb-essentials-cz` = cz-company-data + vat-validate + cz-unreliable-vat-payer + cz-insolvency-check (~€1.50)
- `invoice-verify-cz` = VIES + cz-unreliable-vat-payer + cz-insolvency-check + cz-bank-account-validate + risk-narrative-generate (~€2.50)
- `kyb-complete-cz` = above + pep-check + sanctions-check + adverse-media-check + cz-court-decisions-search + cz-public-contracts-search + risk-narrative-generate (~€2.50)

## Diagnostic scripts left in `apps/api/scripts/` (can remove if desired)
- `diag-url-to-markdown.ts`, `diag-null-context.ts`, `diag-filter-check.ts`, `who-called.ts` — created during triage, kept for reruns.

## Known non-issue
"30 transactions with null request_context" noted in earlier /activity triage — turned out to be internal test-runner rows (`system@strale.internal`) properly excluded by the email filter in `since-last-ext.ts`. Not a real audit gap; my follow-up query dropped the filter and picked them up. No fix needed.
