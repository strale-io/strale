# Recorded upstream responses

Each `<slug>.json` holds what one executor's upstream answered, live, on the
manifest's `known_answer` input. `upstream-replay-contract.test.ts` replays it
into the real executor (fetch answers only from the file, DNS is stubbed, the
clock is frozen at `recorded_at`) and judges the output with the production
runner's known_answer rules. A second test empties every recorded body and
requires a contract check to fail, under one of two perturbations: bodies
emptied to `{}`/`[]`, or bodies hollowed (structure kept; strings emptied,
booleans flipped, numbers kept in sign but wrong in magnitude).
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
one becomes `Fixture person`), Set-Cookie values become `redacted`,
`pypi-package-info` has its published README replaced, because the README
names its author and the executor does not read it, `cve-lookup` and
`ted-procurement` have their advisory and notice free text replaced, because
it can name a reporter or a buyer's contact person and no contract check reads
it, and `cve-details` drops references hosted on twitter.com, x.com or
github.com, which name individual researchers.

**Freshness.** CI never calls the network, so it cannot see an upstream
change. The weekly drift workflow runs `--check`, which calls each recorded
upstream live once and reports a live contract failure, a recorded request the
executor no longer makes, a changed status, or a recording older than 90 days.
Each of those means re-capture (and, for a live contract failure, a fix in the
executor). After changing a manifest's `known_answer` input, re-capture that
slug; the test refuses a recording made on a different input.

## First batch (2026-10-28)

12 executors, chosen from the keyless, free, fetch-only network executors by
most recent customer call (`last_customer_call_at` in the public catalogue).
Sources: GLEIF (CC0), the ECB, CPSC (U.S. government work), Nominatim (data
© OpenStreetMap contributors, ODbL), Have I Been Pwned, Find that Charity, the
Czech Ministry of Finance, Nager.Date and PyPI.
They are kept here as test inputs only.

Considered and left out, with the reason (the slugs that were left out only
because their contract was too weak are now in the second batch below):

| Slug | Reason |
|---|---|
| vasp-verify, vasp-non-compliant-check | ESMA answered 403 to every request, and the contract still passed |
| clinical-trials-search, doi-resolve, fr-bodacc-lookup, slovak-company-data, barcode-lookup | the answer names natural persons (investigators, authors, officers, contributors) |
| gdpr-website-check, header-security-check, redirect-trace | the input is a third party's home page; recording would commit its HTML |
| npm-package-info, dependency-audit, protocol-tvl-lookup, protocol-fees-lookup, sec-edgar-filings, sec-filing-events | an upstream answer is over 256 KiB |
| vat-validate, company-news, japanese-company-data | the upstream was unavailable at capture time |
| nl-woz-value, nl-housing-price-index, nl-housing-stats | the live run failed (CBS returned HTTP 406, or no data) |
| DNS, WHOIS, TLS and TCP executors | they reach the network without fetch, which replay cannot answer |

## Second batch (2026-10-29): known_answer contracts tightened

The first batch left out 25 executors because their known_answer contract
passed with the upstream content gone. For 18 of them the manifest's
known_answer now carries checks on values only a parsed answer has (an exact
CVE, holiday or EORI holder, a plausible range for a rate, temperature or
population, a link built from a notice number), chosen to hold live for
years, not just on the recorded day. Two more (`no-bankruptcy-check`,
`postal-code-lookup`) already failed under the hollowed body and only needed
recording. `record-upstream.ts --check` passed live for all 32 on 2026-10-29.

Four known_answer inputs proved nothing and were replaced, and two were moved off a page too thin to hold a check:

| Slug | Old input | Why | New input |
|---|---|---|---|
| cve-lookup | package `test_value` | a placeholder; OSV answered `{}` | lodash 4.17.20 (five advisories) |
| eori-validate | DE123456789012345 | not a valid EORI, so `valid: false` matched an empty answer | SE5560125790 (AB Volvo) |
| api-health-check | the Railway host's `/v1/health` | answered 404 | `https://api.strale.io/health` |
| ted-procurement | "artificial intelligence" in SE | no Swedish notice matches, and the executor sent `SE` where TED needs `SWE` (fixed in the executor) | "software" in SE |
| page-exists, base64-encode-url | https://example.com | 577 bytes, 65 above page-exists' thin-content threshold, and the page asks not to be used for testing | https://strale.dev |

The manifests changed here are the authoring source; the production
known_answer suites change only when `scripts/sync-known-answer-fixtures.ts`
is run for these slugs.

Still left out after tightening, with the reason:

| Slug | Reason |
|---|---|
| uptime-check, url-health-check | the output is the status code and headers; the body is never read, so no body perturbation can fail them |
| fear-greed-index, slovenian-company-data, stablecoin-flow-check | the hollowed body destroys the lookup key or timestamp, so the executor throws under both perturbations; a throw does not count |
