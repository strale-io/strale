Intent: Codex builder brief: the second batch of paid tools that bill a "success" when their upstream failed.

# Brief: swallowed upstream failures, wave 2

- **Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw), on Petter's instruction of 2026-11-06.
- **Branch:** push only `codex/swallowed-failures-wave2`. Never push `main`, and never label, approve, merge or comment.
- **Data:** the repository only. There are no secrets. Every test runs offline, with `fetch`, DNS and any SDK stubbed.

## Why

`archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md` lists paid capabilities that return a normal, billable output when the upstream they depend on failed. A normal return is billed (`apps/api/src/lib/execution-outcome.ts`, `outcomeFromOutput`). A thrown error is never billed and gets a retry.

Wave 1 (merged) fixed rows 1–4, 10–13, 18, 25 and 36–38. It added `apps/api/src/lib/upstream-result.ts`:
- `UpstreamUnavailableError(upstream, code, retryable)`;
- `dnsOrEmpty` and `dnsOrNull`;
- `requireAnyLeg`.

Read that file and its tests first, then a wave-1 executor as a model, for example `apps/api/src/capabilities/insolvency-check.ts`.

## The rule

A failed upstream leg **throws `UpstreamUnavailableError`**. It never returns an empty-looking answer:
- an empty list;
- `found:false`;
- `valid:false`;
- `risk_level:"low"`;
- a synthetic "issue";
- default nulls.

**What counts as a failure:**
- HTTP 429;
- HTTP 5xx;
- a network error;
- a timeout;
- an unparseable body.

An HTTP 404 that the upstream defines as "no such record" stays a real negative, and so does a valid empty result. Real negatives must keep exactly their current output.

**Multi-leg tools:**
- If every leg failed, throw. Use `requireAnyLeg` where it fits.
- If some legs succeeded, keep the answer, but add a field that names the failed legs (for example `unavailable_sources: ["osv"]`), and never present a missing leg as a clean result.

**`retryable`:**
- `true` for 429, 5xx, timeouts and network errors;
- `false` for an endpoint that is gone.

## Rows in scope

Line numbers are from the audit at `16362762` and may have moved. Confirm each one by reading the code. If a row is already fixed, or the failure is already disclosed in the output, say so in the report and leave it.

| # | Tool | Where | Failure |
|---|---|---|---|
| 5 | `pricing-page-extract.ts:13-16` | | A shell or cookie-wall page gives `plans:[]`. Throw when the fetched page is a shell (no plans and no pricing text). |
| 6 | `gdpr-fine-lookup.ts:35-38` | | A shell page gives `fines:[]`. |
| 7 | `package-security-audit.ts:42-95` | OSV / deps.dev | A failure gives `risk_level:"low"`. |
| 8 | `dependency-audit.ts:58-70` | OSV | A failure gives `vulnerable_count:0`. Its manifest limitation should then match. |
| 9 | `cookie-scan.ts:179-277` | | A fetch or parse failure gives `cookies:[]`. |
| 15 | `barcode-lookup.ts:53,90-98` | | A timeout or 429 gives `found:false`. |
| 16 | `backlink-check.ts:92-162` | | Both upstreams failing gives `backlinks:[]`. |
| 17 | `business-day-check.ts:47-52` | Nager.Date | A failure gives `is_business_day:true` on a holiday. |
| 19 | `eori-validate.ts:51-79` | | SOAP down gives `valid:null`, and a parse failure gives `valid:false`. |
| 20 | `company-fundamentals.ts:191-208` | SEC | A failure looks "not reported". |
| 21 | `github-repo-analyze.ts:123-145` | GitHub | A 403/429 gives "No README" or "abandoned". |
| 22 | `customs-duty-lookup.ts:68,101` | | A shell page gives nulls. |
| 23 | `seo-audit.ts:92-104` | | A robots.txt fetch failure gives "No robots.txt". Report it as unknown, not missing. |
| 24 | `startup-domain-check.ts:85-102` | | A failed check gives "available" or "taken". |
| 28 | `whois-lookup.ts:62-80` | | Refusal or quota text gives an unparsed success. |
| 30 | `port-check.ts:48-51` | | A timeout or unreachable host gives `open:false`. Report timeouts distinctly from a refused connection. |
| 31 | `og-image-check.ts:77-128` | | A HEAD failure gives a "non-200" issue. |
| 32 | `domain-contact-extract.ts:399-413` | | A contact page failure gives empty contacts. |
| 33 | `protocol-fees-lookup.ts:28,46-48` | | The revenue leg failing gives nulls. |
| 35 | `ens-reverse-lookup.ts:50-56` | | An RPC error gives `verified:false`. |

**Out of scope:** rows 26, 27, 29 and 34. They already disclose the failure in the output; a later wave adds a machine-readable degraded marker.

## Tests

For each fixed tool, add offline tests that stub the upstream:
- a 503 throws `UpstreamUnavailableError`;
- a 429 throws `UpstreamUnavailableError`;
- a network error throws `UpstreamUnavailableError`;
- a timeout throws `UpstreamUnavailableError`;
- for multi-leg tools, a partial failure is marked;
- the real negative keeps its exact current output.

The new tests must fail on `main`'s executors. Show this by checking out a file from `origin/main`, running the tests, then restoring the file. Never use `git stash`.

## Done when

- The new tests pass, the existing tests still pass, and `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- `docs/lanes/codex/swallowed-failures-wave2-report.md` maps each row to its change and its tests, and lists any row skipped and why.
