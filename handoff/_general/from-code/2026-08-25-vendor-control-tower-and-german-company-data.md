Intent: Restore trustworthy German company-data behaviour immediately, automate vendor allowance control and morning alerts platform-wide, research better billing alternatives, and stop internal tests from consuming scarce vendor allowances unnecessarily.

## Outcome

- Shipped the Vendor Control Tower in PR #403 (`178292f`), followed by two production-only PostgreSQL typing fixes in PR #404 (`2544e2e`) and PR #405 (`272c40b`). CI, the real-Postgres integration lane, production build, and two Codex xhigh reviews are green.
- OpenRegister is confirmed exhausted at 0/500 free credits. `german-company-data`, `invoice-verify-de`, `kyb-complete-de`, and `kyb-essentials-de` are withdrawn from serving and absent from the x402 catalog. Their saved prior state can be restored only after `2026-09-06T23:40:04Z` (7 September Stockholm) and only after OpenRegister reports enough usable credits for the most expensive dependent execution.
- The hourly durable job now records `last_outcome=ok`, no error, and zero consecutive failures. The morning routine runs the read-only `vendor:status` report and flags exhausted/low/auth-error accounts, coverage gaps, and missing spend readings.
- Railway had a stale 19-character Browserless credential while root `.env` held the verified 49-character key. Replaced only that existing environment variable. The next tower run confirmed 959/1000 units, restored all seven affected capabilities and `competitor-snapshot` to their exact saved states, and returned the job to green.
- Added metered-vendor preflight guards, reversible overlapping capability/solution suspensions, guarded restoration, and zero-cost or evidence-based recovery. Paid synthetic Dilisense/Serper probes are not scheduled; eSortcode recovery uses only its documented zero-credit test path.
- Reduced internal allowance burn with cost-aware scheduler eligibility/cadence, quota budgets, fixture-first checks, a zero-vendor-cost catalog smoke path, and removal of a unit-consuming Browserless health render. A 306-capability dry smoke spent no vendor units; 291 passed and 15 pre-existing catalog/fixture structural failures remain unrelated to this work.
- Vendor/payment research is filed at `archive/sessions/2026-08-25-vendor-control-tower-research.md`. No vendor was contacted, no account or subscription was created, and no terms were accepted.

## Open

- OpenRegister restoration needs no calendar task: the tower will keep the German surfaces suspended until both the September 7 deadline and confirmed usable allowance are true. If the free allowance does not reset, the critical morning warning remains.
- Morning report still warns that Anthropic and Coinbase CDP have declared spend monitoring but no reading, eSortcode has no documented balance endpoint, and Cobalt Intelligence, EinSearch, and SEC API lack vendor-account records. These are coverage follow-ups, not silent serving failures.
- The close-check reported two pre-existing validating capabilities (`serp-related-questions`, `google-news-search`) and two apparent executor/DB drift names (`annual-report-extract`, `guarded-executor`). This session did not add executors; the close-check's six-hour heuristic includes concurrent work and should be reconciled separately.

## Non-obvious learnings

- Reachability is not account health: an endpoint can answer while every authenticated customer request fails for lack of credit. Balance/allowance evidence must live above individual capability health.
- PostgreSQL variadic JSON builders do not infer bind-parameter types. Audit-event values and nullable restoration timestamps need explicit casts; the regression now runs against real Postgres because rendered-query mocks did not expose either defect.
- Browserless's production failure was configuration drift, not exhausted allowance. Fingerprint/length comparison found it without logging either secret.
- Restoration is ownership-aware: a vendor recovery cannot undo a separate vendor, quality, or legal suspension, and stale x402 cache entries are rechecked against current solution state before payment.

## Cost

- Incremental vendor spend: €0. No paid synthetic checks, purchases, top-ups, subscriptions, account creation, vendor contact, or terms acceptance.
- The founder waived the usual Claude cross-provider review because the Claude subscription was rate-limited; two independent Codex xhigh reviews returned 0 HIGH / 0 MEDIUM findings.
