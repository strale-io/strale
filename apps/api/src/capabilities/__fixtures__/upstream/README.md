# Recorded upstream responses

Each `<slug>.json` holds what one executor's upstream answered, live, on the
manifest's `known_answer` input. `upstream-replay-contract.test.ts` replays it
into the real executor (fetch answers only from the file, DNS is stubbed, the
clock is frozen at `recorded_at`) and judges the output with the production
runner's known_answer rules. A second test empties every recorded body and
requires a contract check to fail, under one of two perturbations: bodies
emptied to `{}`/`[]`, or bodies hollowed (structure kept, every value changed).
An executor that merely throws on a perturbed body does not count; the judge
has to read the output and reject it.

## Capture and re-capture

```
cd apps/api
npx tsx scripts/record-upstream.ts --slug lei-lookup,exchange-rate   # capture, then run the test
npx tsx scripts/record-upstream.ts --check                           # live re-check, writes nothing
```

The recorder runs the executor through the same `getExecutor` wrapper
production uses, so page reads carry the honest user agent and obey
robots.txt. It refuses a slug the public catalogue does not list as
`free_unlimited` or `free_quota`, a ToS-prohibited target, a live run that
fails the contract, a body over 256 KiB, and a file that contains the value of
any environment variable 16 or more characters long. It never stores request headers.

What it changes in a body is listed in that file's `redactions`:
e-mail addresses become `redacted@example.invalid` (a display name in front of
one becomes `Fixture person`), Set-Cookie values become `redacted`, and
`pypi-package-info` has its published README replaced, because the README
names its author and the executor does not read it.

**Freshness.** CI never calls the network, so it cannot see an upstream
change. The weekly drift workflow runs `--check`, which calls each recorded
upstream live once and reports a live contract failure, a recorded request the
executor no longer makes, a changed status, or a recording older than 90 days.
Each of those means re-capture (and, for a live contract failure, a fix in the
executor). After changing a manifest's `known_answer` input, re-capture that
slug; the test refuses a recording made on a different input.

## First batch (2026-10-28)

14 executors, chosen from the keyless, free, fetch-only network executors by
most recent customer call (`last_customer_call_at` in the public catalogue).
Sources: GLEIF (CC0), the ECB, CPSC (U.S. government work), Nominatim (data
© OpenStreetMap contributors, ODbL), Have I Been Pwned, Find that Charity, the
Czech Ministry of Finance, the UK Food Standards Agency, Nager.Date and PyPI.
They are kept here as test inputs only.

Considered and left out, with the reason:

| Slug | Reason |
|---|---|
| eori-validate, api-health-check, og-image-check, page-exists, robots-txt-parse, uptime-check, url-health-check, base64-encode-url, website-carbon-estimate | known_answer contract passes with the upstream bodies empty; the test would prove nothing about parsing |
| cve-lookup, no-bankruptcy-check, postal-code-lookup, public-holiday-lookup, ted-procurement, usgs-earthquake-search, weather-lookup | known_answer contract passes when the upstream answers `{}`; same reason |
| country-economic-indicators, cve-details, fear-greed-index, forex-history, sitemap-parse, slovenian-company-data, stablecoin-flow-check | the contract fails on a perturbed body only because the executor throws; on hollowed values it passes (stablecoin-flow-check enforces no check at all) |
| vasp-verify, vasp-non-compliant-check | ESMA answered 403 to every request, and the contract still passed |
| clinical-trials-search, doi-resolve, fr-bodacc-lookup, slovak-company-data, barcode-lookup | the answer names natural persons (investigators, authors, officers, contributors) |
| gdpr-website-check, header-security-check, redirect-trace | the input is a third party's home page; recording would commit its HTML |
| npm-package-info, dependency-audit, protocol-tvl-lookup, protocol-fees-lookup, sec-edgar-filings, sec-filing-events | an upstream answer is over 256 KiB |
| vat-validate, company-news, japanese-company-data | the upstream was unavailable at capture time |
| nl-woz-value, nl-housing-price-index, nl-housing-stats | the live run failed (CBS returned HTTP 406, or no data) |
| DNS, WHOIS, TLS and TCP executors | they reach the network without fetch, which replay cannot answer |
