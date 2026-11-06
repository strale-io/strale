Intent: give `vasp-verify` and `vasp-non-compliant-check` a working, official ESMA source again (every dated monthly CSV path from 2026-06 answered 404), keep wave 1's "throw, never fabricate a negative" behaviour, and add an age rule.

## Source

ESMA's MiCA page (https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica, section "Interim MiCA Register") links the latest version of five CSV files at fixed paths, overwritten in place weekly:

- CASPS.csv: https://www.esma.europa.eu/sites/default/files/2024-12/CASPS.csv (397 rows on 2026-11-06)
- NCASP.csv: https://www.esma.europa.eu/sites/default/files/2024-12/NCASP.csv (189 rows; the old code asked for `Non_compliant_CASPs.csv`, a name ESMA never used)
- field description: .../2024-12/Description_of_the_fields_in_the_interim_MiCA_register.csv

The `2024-12` folder is the stable one, not a month guess. Last-Modified was 2026-11-05; ESMA says it republishes weekly. robots.txt allows `/sites/default/files/`. registers.esma.europa.eu has no MiCA data or documented API yet (ESMA's page says the CSVs run "until mid-2026 when it will be formally integrated into ESMA's IT systems"; that has not happened, so the source will change again).

## What changed

- `apps/api/src/capabilities/lib/vasp-data.ts` rewritten: fixed URLs; if the fixed path 404s or serves HTML, the link on ESMA's MiCA page is read once (same host and `/sites/default/files/` only); RFC 4180 parser (BOM, CRLF, multi-line quoted cells); columns read by header name, and a changed header throws instead of misreading (the old parser read by position and would have mislabelled every column against the real file); honest `STRALE_USER_AGENT`; bounded body read.
- Withdrawn authorisations stay in ESMA's file with an end date. `authorized` is now true only for a record without an end date or with a future one (3 of 397 rows have one; one of those holds a company name instead of a date and counts as not in force).
- Staleness: age = file's Last-Modified (newest record date if the header is absent). More than 45 days: `register_stale: true` plus a note. More than 120 days: throws `UpstreamUnavailableError` (not retryable) because a frozen file is the failure class that caused this. Chosen over flag-only because a flag a caller can ignore would let a frozen file keep selling "not authorised"; chosen over throw-only so a short ESMA lapse still answers.
- Error text: per-source codes are on `error.failures`; the message carries no 404/401/403 unless every source answered 404 (taxonomy files "404" as `endpoint_gone`). A 404 plus a timeout/5xx is retryable and classifies as transient. A published empty non-compliant list is cached (the CASP register must be non-empty).
- Search fixes: an empty commercial name used to match every search (reverse contains); websites match on the host (or a subdomain) across multi-address cells and ESMA's "https.//" typo instead of substring.
- Output additions (additive): per-match `authorization_end_date`, `authorization_in_force`, `legal_basis`, `record_last_updated`; non-compliant `lei`, `decision_date`, `nca`; top level `register_age_days`, `register_stale`, `register_fetched_at`, `register_source_url`, optional `note`. `register_last_updated` is now the file's publication date (it was the process's fetch time, and for the non-compliant tool the CASP cache's).
- Manifests: `data_source`, limitations, output examples (the old examples showed the "unavailable" fallback). The DB rows are not updated by this branch; run the onboarding `--backfill` after merge if the catalogue should show the new data source.
- Ratchets lowered: `unbounded-body-reads.test.ts` ledger and `body-reader-baseline.json` (222 to 221).

## Evidence

- Offline tests: `apps/api/src/capabilities/vasp-register.test.ts` (38; 32 of the first 35 fail on the old module, and 3 of the 4 added after review fail on the pre-review commit b69cc51b) with fixtures trimmed from the live files under `apps/api/src/capabilities/__fixtures__/vasp/`; `compliance.upstream-failures.test.ts` updated to ESMA's real layout.
- Live run of both executors against the real source: `archive/receipts/2026-11-06-check-esma-casp-source-live.json` (Coinbase Luxembourg and Bitpanda by LEI authorised; Stratos Europe withdrawn 24/04/2026 reported listed but not authorised; an unlisted name; Bank Bit on the non-compliant list; Google not).
- `validate-capability.ts` needs a database and was not run; the manifests are covered by the manifest tests.

Next authorised action: review and merge this branch after the wave-1 PR (#939) lands, then re-run the live check and the onboarding backfill for the two manifests | Owner: Strale orchestrator | Blocker: wave 1 (#939) merge

## After the independent review (PASS, two medium findings)

- Name matching is whole-word in both directions. A plain substring test let "Residue Capital Ltd" match the commercial name "DUE" and "Gateway Frauds Inc" match "Gate", each answering `authorized: true`. The non-compliant search keeps its looser forward match, because there a false hit only produces a warning to check.
- A record whose end-date cell is not a date gets its own note ("does not hold a readable date"), not the withdrawal-date note.
- A response that a redirect took off `www.esma.europa.eu` is refused, and the page-link check also refuses a non-default port and userinfo.
- A website match against a bare registry suffix such as `com.mt` or `co.uk` no longer counts as the same site.
- Not changed: a website match still outranks the name (by design), and the file's age still prefers Last-Modified over the newest record date.
