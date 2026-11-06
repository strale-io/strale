> Copied verbatim on 2026-11-06 from the orchestrator session's scratchpad so the promise audit can cite it by repository path. The wave-1 fix lane (`fix/swallowed-upstream-failures-wave1`) owns the remedy; this file is the finding, not the fix.

# Audit: capabilities that bill a success when the upstream failed (2026-11-06)

**Scope.** A read-only audit of `apps/api/src/capabilities/*.ts` at `16362762`. The orchestrator commissioned it after an external benchmark found `tech-stack-detect` returning `technologies: []` for a site it could not read.

## How billing treats a capability's result

- **A throw is never charged.** That holds on the sync, async and x402 paths, through `assertBillableOutput` in `lib/do/dispatch.ts` and `routes/x402-gateway-v2.ts`.
- **A normal return is charged.** The only exceptions are the outputs `lib/execution-outcome.ts` (`outcomeFromOutput`) lists as unbillable:
  - null, a non-object or an array;
  - exactly `{error}`;
  - `skipped: true`;
  - `unavailable: true`.
- **So a swallowed upstream failure that returns an empty-looking success is billed.** It also:
  - skips the retry (`lib/retry.ts` retries only on a throw);
  - is recorded as a success by the breaker and the quality floor, so monitoring cannot see it.
- **The lint cannot see these.** `lint:no-bare-catch` matches only the literal `.catch(() => {})`.

## Findings (most severe first; all charged)

| # | Slug | Where | Failure, and what the customer receives |
|---|---|---|---|
| 1 | vasp-verify | `vasp-verify.ts:24-36`, `lib/vasp-data.ts:84-118` | All ESMA CSV URLs fail, and the result is `match_found:false, authorized:false` plus a note |
| 2 | vasp-non-compliant-check | `vasp-non-compliant-check.ts:24-36`, `lib/vasp-data.ts:158` | Same failure, and the result is `on_non_compliant_list:false` |
| 3 | insolvency-check | `insolvency-check.ts:33-39` | Companies House 429, 5xx or timeout, and the result is `found:false` "not found" |
| 4 | mx-lookup | `mx-lookup.ts:26-41` | Resolver failure, and the result is all empty with `has_mx:false` |
| 5 | pricing-page-extract | `pricing-page-extract.ts:13-16` | Shell or cookie-wall page, and the result is `plans:[]` |
| 6 | gdpr-fine-lookup | `gdpr-fine-lookup.ts:35-38` | Shell page of 200 characters or more, and the result is `fines:[]`, totals 0 |
| 7 | package-security-audit | `package-security-audit.ts:42-95` | OSV or deps.dev fails, and the result is `risk_level:"low"` as if clean |
| 8 | dependency-audit | `dependency-audit.ts:58-70` | OSV fails, and the result is `vulnerable_count:0` |
| 9 | cookie-scan | `cookie-scan.ts:179-277` | Fetch or parse fails, and the result is `cookies:[]` plus a synthetic issue |
| 10 | email-auth-check | `email-auth-check.ts:29-35,132` | DNS SERVFAIL or timeout, and the result is SPF/DMARC "missing" |
| 11 | email-deliverability-check | `email-deliverability-check.ts:46-212` | DNS or DNSBL errors, and the result is "no SPF/DMARC", `blacklisted:false` |
| 12 | domain-reputation | `domain-reputation.ts:22-84` | Transient DNS or TLS failure, and the result is penalties as if the record were absent |
| 13 | company-tech-stack | `company-tech-stack.ts:37,125-128` | DNS or HEAD fails, and the result is empty records, with nulls inferred from them |
| 14 | tech-stack-detect | `tech-stack-detect.ts:134-190` | A 200 shell or soft-block page, and the result is `technologies:[]` |
| 15 | barcode-lookup | `barcode-lookup.ts:53,90-98` | Upstream timeout or 429, and the result is `found:false` |
| 16 | backlink-check | `backlink-check.ts:92-162` | Both upstreams fail, and the result is `backlinks:[]` |
| 17 | business-day-check | `business-day-check.ts:47-52` | Nager.Date fails, and the result is `is_business_day:true` on a holiday |
| 18 | cz-company-data | `cz-company-data.ts:143-277` | ARES VR fails, and the result is `legal_representatives:[]` with the wrong reason |
| 19 | eori-validate | `eori-validate.ts:51-79` | SOAP down, and the result is `valid:null`; a parse failure gives `valid:false` |
| 20 | company-fundamentals | `company-fundamentals.ts:191-208` | SEC fails, and the metric looks "not reported" |
| 21 | github-repo-analyze | `github-repo-analyze.ts:123-145` | GitHub 403 or 429, and the result is "No README", "abandoned" |
| 22 | customs-duty-lookup | `customs-duty-lookup.ts:68,101` | Shell page, and the result is nulls with `anti_dumping:false` |
| 23 | seo-audit | `seo-audit.ts:92-104` | robots.txt fetch fails, and the result is "No robots.txt" |
| 24 | startup-domain-check | `startup-domain-check.ts:85-102` | Check fails, and the result is false "available" or "taken" |
| 25 | email-pattern-discover | `email-pattern-discover.ts:62-156` | MX fails, and the result is `accepts_email:false` |
| 26 | country-trade-data | `country-trade-data.ts:972-1000` | World Bank fails, and the result is embedded estimates (disclosed) |
| 27 | domain-age-check | `domain-age-check.ts:82-105` | WHOIS refusal, and the result is `risk_indicator:"unknown"` (disclosed) |
| 28 | whois-lookup | `whois-lookup.ts:62-80` | Refusal or quota text, and the result is an unparsed success |
| 29 | page-exists | `page-exists.ts:178-186` | Blocked or 5xx, and the result is `exists:null` (disclosed) |
| 30 | port-check | `port-check.ts:48-51` | Timeout or unreachable, and the result is `open:false` |
| 31 | og-image-check | `og-image-check.ts:77-128` | HEAD fails, and the result is a "non-200" issue |
| 32 | domain-contact-extract | `domain-contact-extract.ts:399-413` | Contact page fails, and the result is empty contacts |
| 33 | protocol-fees-lookup | `protocol-fees-lookup.ts:28,46-48` | Revenue leg fails, and the result is nulls |
| 34 | container-track | `container-track.ts:285-345` | Carrier fails, and the result is check-digit only (disclosed) |
| 35 | ens-reverse-lookup | `ens-reverse-lookup.ts:50-56` | RPC error, and the result is `verified:false` |
| 36 | email-reputation-score | `email-reputation-score.ts:78-92` | DNS error, and the score drops by 15 (disclosed) |
| 37 | dns-lookup (free tier) | `dns-lookup.ts:23-60` | Partial DNS failure, and the result is empty records |
| 38 | email-validate (free tier) | `email-validate.ts:69-143` | MX timeout, and the result is `valid:false` |

**Not live.** `salary-benchmark` and `employer-review-summary` swallow a Glassdoor block and fall back to a Google page, which conflicts with DEC-20261023-A. Both are in `DEACTIVATED`.

**Ruled out.** These either throw on failure or mark it explicitly: `sanctions-check`, `pep-check`, `breach-exposure-check`, `adverse-media-check`, `vat-validate` (stale-marked), `company-enrich` and `product-reviews-extract` (empty guards), `citation-graph`, `uptime-check`, the address validators, and the sitemap and robots parsers.

## Remedy

**Rule:** a failed leg throws, or is marked degraded. It never looks like an empty answer.

1. **Shared helpers in `lib/upstream-result.ts`:**
   - `dnsOrEmpty()`: `[]` only for ENOTFOUND or ENODATA; it rethrows timeouts and SERVFAIL. This one fix covers rows 4, 10-13, 25 and 36-38.
   - `settleLeg()` / `requireAnyLeg()`, for multi-leg tools.
   - a `required_signal_fields` manifest key that makes empty extractions unbillable (rows 5, 6, 14 and 22).
   - a `degraded` marker that `outcomeFromOutput` can treat as unbillable.
2. **Lint:** catch handlers under `src/capabilities/**` that return an empty value without a throw, a log or a degraded marker. Use `// degraded-ok: <reason>` for allowed cases, and a baseline that only shrinks.
3. **Replay tests:** add perturbations (`http_503`, `http_429`, `network_error`, `blocked_200`, a DNS ETIMEOUT stub) to `test-helpers/upstream-replay.ts`, and assert that every network executor either throws or is reported unusable.
4. **Past charges:** measure how many billed calls came from these paths (provider errors around the call time, empty outputs) and refund where policy decides.
