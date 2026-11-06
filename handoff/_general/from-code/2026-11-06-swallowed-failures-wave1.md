Intent: fix wave 1 of the swallowed-upstream-failure audit, so the DNS family and four compliance tools stop billing a fabricated negative when their upstream failed.

# Swallowed upstream failures, wave 1 (2026-11-06)

Branch `fix/swallowed-upstream-failures-wave1`; no PR opened. The orchestrator opens it after an independent review.
Audit: `archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md` (38 rows; this wave fixes 13 of them).

## The rule

A real negative stays an answer. Any other upstream failure throws `UpstreamUnavailableError` (`apps/api/src/lib/upstream-result.ts`). A throw is never billed, gets one transient retry, and counts against the capability as `provider_unavailable`.

- **`dnsOrEmpty(fn, label)` and `dnsOrNull`:** return `[]` or `null` only for ENOTFOUND, ENODATA and EBADNAME.
  - EBADNAME is a malformed name. That is the caller's input, not an outage, and it keeps today's negative.
  - Every other resolver code is rethrown as `UpstreamUnavailableError`. That covers ETIMEOUT, ESERVFAIL, EREFUSED, ECONNREFUSED, EAI_AGAIN, ECANCELLED, EBADRESP and unknown codes.
  - An error with no resolver code is rethrown unchanged, so our own TypeError is not blamed on the provider.
- **`isDnsNegative` / `dnsUnavailable`:** for executors that keep a special factor on the negative path (email-reputation-score).
- **`requireAnyLeg(results, label)`:** throws when every leg of a multi-leg lookup failed. Used by the DNSBL check.
- **Wiring:**
  - `lib/execution-outcome.ts` `outcomeFromError` claims the error by type and files it as `provider_unavailable`, unbilled, with `retryable` from the error.
  - `lib/retry.ts` retries it when `retryable` is true. ESERVFAIL matched none of the retry policy's string patterns before this change.
  - The message always opens with "Upstream unavailable", so string consumers file it on the provider side:
    - the taxonomy reads `upstream` (`timeout` for ETIMEOUT);
    - the breaker counts it;
    - a test pins all of that.

## Before and after, per executor

| Row | Executor | Real negative (ENOTFOUND / ENODATA / answered "none") | Transient failure (timeout, SERVFAIL, 5xx) |
|---|---|---|---|
| 4 | mx-lookup | Unchanged output | Before: empty records and `has_mx:false`, billed. After: throws, unbilled, retried |
| 37 | dns-lookup (free) | Unchanged; NXDOMAIN still throws "No DNS records found" | Before: a partial failure gave empty MX/TXT and was billed; a total failure was a caller-attributed "Domain may not exist". After: throws UpstreamUnavailable |
| 10 | email-auth-check | Unchanged ("missing" statuses) | Before: SPF/DMARC/DKIM "missing", billed. After: throws |
| 11 | email-deliverability-check | Unchanged output, including all three lists `listed:false` on NXDOMAIN | Before: "No SPF/DMARC", and every errored DNSBL was `listed:false`. After, see the list below this table |
| 12 | domain-reputation | Unchanged, including the historical "no TXT at all means no SPF/DMARC penalty" quirk | Before: -30 for "does not resolve", or silent SPF/DMARC loss, billed. After: throws. The HTTPS leg is not touched (wave 2) |
| 13 | company-tech-stack | Unchanged `dns_records` | Before: empty records went to the LLM. After: throws before the paid LLM call |
| 25 | email-pattern-discover | Unchanged "does not have MX records" envelope | Before: `accepts_email:false`, billed. After: throws |
| 36 | email-reputation-score | Unchanged (`mx_lookup_failed`, -15) | Before: -15, "domain may not exist". After: throws |
| 38 | email-validate (free) | Unchanged (`valid:false`, `has_mx_records:false`) | Before: `valid:false`. After: throws. The shared `checkMx` also fixes email-finder (it now throws) and email-validate-bulk (it now marks the domain `mx_checked:false` instead of a confident "no MX") |
| 1 | vasp-verify | A loaded register with no match is still `authorized:false`, billed. The stale cache is still served | Before: `match_found:false, authorized:false` plus a note, billed. After: throws. It is not retryable when every monthly path answered 404 |
| 2 | vasp-non-compliant-check | A loaded list with no match is unchanged. A published header-only list is now `data_available:true, register_entries:0` | Before: `on_non_compliant_list:false, data_available:false`, billed. After: throws |
| 3 | insolvency-check | A search answering no company is still the `found:false` envelope; an insolvency-endpoint 404 is still "no proceedings" | Before: a search 429 or 5xx became `found:false`, "Company not found", billed. After: UpstreamUnavailable. Other statuses throw "Companies House search error: HTTP n". The insolvency endpoint's 429 and 5xx are now UpstreamUnavailable too |
| 18 | cz-company-data | A VR 404 keeps its reason text | Before: a VR 5xx or timeout claimed "likely sole trader". After: a degraded marker (below), still billed |

**email-deliverability-check, transient case in detail:**
- An SPF, DMARC, MX or A failure throws.
- A failed DKIM probe throws, unless another selector already found DKIM.
- An errored DNSBL is `listed:null` with its error code. It adds a "Blocklist check incomplete" issue and earns no score credit.
- When every list errors, the call throws.

**The cz-company-data choice: a degraded marker, not a throw.**
- **The repo's convention:** KYB tools signal a partial answer through `tier_2_available:false` plus a `tier_2_available_reason` that gives the true cause. The Estonian tool does this for a failed directors read ("…cache query failed (…); tier_1 data unaffected").
- **What the call still delivers:** the tier-1 BE record. `deriveStatus` already returns `unknown` when the VR view is missing for a VR-registered entity.
- **The marker:** the reason now says "ARES VR view could not be read (HTTP 503 / timeout) … An empty list here says nothing about whether the entity has a statutory body".

## Tests

- `apps/api/src/lib/upstream-result.test.ts` (40 tests):
  - the helpers;
  - the billing outcome;
  - the taxonomy and breaker classification of every message;
  - the retry behaviour.
- `apps/api/src/capabilities/dns-family.upstream-failures.test.ts` (38 tests):
  - per executor, ETIMEOUT and ESERVFAIL throw unbilled (checked with `outcomeFromError`);
  - per executor, ENOTFOUND and ENODATA give the exact pre-fix output, and `assertBillableOutput` accepts it;
  - the DNSBL unknown, refusal-code and real-listing cases;
  - the bulk inheritance.
- `apps/api/src/capabilities/compliance.upstream-failures.test.ts` (22 tests): vasp ×2, insolvency and cz, with fetch stubbed.

The receipts record `62f1b1d0`, the pre-amend WIP commit. Its `apps/api/src` tree is identical to the pushed commit, which was rebased onto two `origin/main` commits that touch none of these files. On the fixed branch all three files pass: `archive/receipts/2026-11-06-test-run-swallowed-failures-wave1-after.json`.

**Fail-before.** The 16 changed source files were restored from the base commit `16362762` (with `git checkout 16362762 --`, never stash), and the three test files were run against them. Result: 47 failed and 53 passed (`archive/receipts/2026-11-06-test-run-swallowed-failures-wave1-fail-before.json`).
- Every transient-failure test failed.
- Every real-negative test passed on the old code. That is the proof that negatives keep their output.
- The fixed files were then restored with `git checkout HEAD --`.
- Two upstream-result tests pass on both versions, for a reason:
  - ETIMEOUT was already classified as transient by its message;
  - a non-retryable error was not retried before either.

**Other checks.**
- The full `apps/api` vitest run passes: `archive/receipts/2026-11-06-test-run-swallowed-failures-wave1-full-api-suite.json`.
- `npm run typecheck`, `claims:check`, `env:check` and `models:check` pass.
- The apps/api lint scripts pass.

## Found while verifying (not in the audit)

- **The ESMA CSV paths 404 today.** Every `https://www.esma.europa.eu/sites/default/files/<YYYY-MM>/CASPS.csv` and `Non_compliant_CASPs.csv` for 2026-06 to 2026-11 answered a Drupal 404 page from this sandbox on 2026-11-06 at about 15:02 Swedish time.
  - If production sees the same, vasp-verify and vasp-non-compliant-check have billed a fabricated negative on every call.
  - After this fix, every call throws, unbilled and not retried, and the quality floor will quarantine both tools.
  - That is the honest state. The source URLs need a follow-up.
- **Spamhaus refusal codes were read as listings.** email-deliverability-check read a `127.255.255.x` answer (query via a public resolver, a typo or a rate limit) as `listed:true`. If production's resolver is public, every domain was reported blacklisted on Spamhaus.
- **IPv6 addresses were queried as reversed IPv4.** For an IPv6-only domain, the DNSBL leg queried a reversed-by-dot IPv6 address, which no list answers, and reported `listed:false`. Only IPv4 is now checked.
- **domain-reputation's no-TXT quirk.** It skips the SPF and DMARC penalties, and the DMARC lookup, for a domain with no TXT records at all. That is a scoring bug, kept as-is for this wave.
- **The audit's insolvency-check row overstates the gap.** A timeout already threw, and the insolvency endpoint already threw on non-404. Only a non-OK search status was swallowed.

## Review round 1

The independent review of `ad5663b6` passed with no blockers. It raised two should-fixes and one nit, all three now fixed. `lib/vasp-data.ts` was left alone, because another lane is rewriting it on top of this branch.

1. **company-tech-stack: DNS now runs before the render.**
   - DNS used to share a `Promise.all` with the paid Browserless render. A DNS outage rejected the call after the render had run, and the transient retry rendered again.
   - Now DNS resolves first, so a resolver failure throws before any paid call.
   - Test: the transient case asserts that Browserless and the LLM were never called. The negative case asserts exactly one render.
2. **cz-company-data: a machine-readable status for a failed VR read.**
   - On that path the output now carries `tier_2_status: "upstream_unavailable"`.
   - `legal_representatives` and `total_legal_representatives` are `null`, not `[]` or `0`, so an agent cannot read the outage as "no statutory body".
   - `tier_2_status` is present only on the failed path. An answered VR read, including a 404, keeps its old output exactly; a test pins `[]`, `0` and the absent key.
   - **Manifest** (`manifests/cz-company-data.yaml`):
     - both fields are typed `[array|integer, "null"]`;
     - `tier_2_status` is added to the schema, with reliability `rare`;
     - `total_legal_representatives` reliability moves from `guaranteed` to `common`. No known_answer assertion used it.
3. **email-deliverability-check: an IPv6-only domain earns no blocklist credit.**
   - No list was asked about its address, so it gets no 20 points and an issue line: "Blocklist check not performed: the domain resolves only to IPv6…".
   - A domain with no address at all keeps its historical credit, because it has nothing to list.
   - Test: an IPv6-only domain scores 0 and sends no blocklist query.

**Fail-before for the round:** the three sources were restored from `ad5663b6` and the two executor test files run against them. Exactly the five new round-1 assertions failed (`archive/receipts/2026-11-06-test-run-swallowed-failures-wave1-review1-fail-before.json`).

**After the round:**
- The three wave-1 files pass.
- 19 related suites pass: manifest, output contract, execution outcome, retry, taxonomy, actionable errors, body-read ledger and PII.
- The `apps/api` typecheck passes.

Evidence: `archive/receipts/2026-11-06-test-run-swallowed-failures-wave1-review1-after.json`.

## Next

Waves 2 and 3 follow:
- **Wave 2: the remaining multi-leg and HTTP rows.**
  - package-security-audit, dependency-audit, backlink-check, business-day-check, eori-validate, company-fundamentals, github-repo-analyze, barcode-lookup, startup-domain-check, ens-reverse-lookup, port-check, og-image-check, domain-contact-extract, protocol-fees-lookup and seo-audit;
  - domain-reputation's HTTPS leg.

  Use `requireAnyLeg` and the degraded convention.
- **Wave 3: the extraction rows** (pricing-page-extract, gdpr-fine-lookup, tech-stack-detect, customs-duty-lookup, cookie-scan and whois-lookup), plus the mechanisms:
  - the `required_signal_fields` manifest key;
  - the `degraded` marker in `outcomeFromOutput`;
  - the lint rule;
  - replay perturbations;
  - the past-charges measurement.

Next authorised action: an independent review of this branch, then open the PR | Owner: Strale orchestrator | Blocker: none.

## Merge with #938 (2026-11-06, 16:20 Swedish time)

#938 (tech-stack coverage) rewrote `company-tech-stack.ts` on main and reads DNS through `lib/tech-dns.ts`, which reports a resolver fault in the result (`dns_status`, a warning) next to its page detections instead of throwing. The conflict was resolved by taking main's file: under the audit's rule a failed leg either throws or is marked degraded, and #938 marks it. Row 13 is therefore fixed by #938, not by this PR; wave 1's two company-tech-stack cases were removed from `dns-family.upstream-failures.test.ts`, and `company-tech-stack.test.ts` ("states a DNS fault in the result") covers the case. The DNS-before-render ordering from review round 1 no longer matters, because a DNS fault no longer throws after a paid render.
