> **Landed 2026-08-23, unedited.** This report sat on
> `fix/t02-quality-floor-reinstatement-audit` for a week, reachable only by
> knowing the branch name. It is filed here per the Report Filing Convention;
> nothing in the text below is changed. Two things it flagged as unverified
> have since resolved on their own evidence: `us-company-data` was re-listed
> and confirmed on production 2026-08-21, and `screenshot-url`'s
> `waitForSelector` defect was fixed and confirmed by real traffic 2026-08-19.
> The branch's other file — a `--apply` reinstatement script — was deliberately
> **not** landed: reinstatement now happens through ledger-guarded startup
> migration blocks, and a direct-postgres production-mutation script is the
> exact shape behind LESSONS.md family F10. Branch sha
> `02d3a4f031e534c49265f0caf39e43fedc46a553`, deleted after this landed.

# T0.2 — quality-floor quarantine audit (Codebase Quality Program, Phase 0)

**Intent:** for every capability the quality floor (DEC-20260812-A) has quarantined or
deactivated, determine whether the action was driven by genuine failures or by the
transaction-failure-taxonomy bug that counted correct refusals as capability faults, and
recommend a disposition. Read-only against production; no writes made.

## T0.1 status found at session start

The runtime classification fix this Phase-0 task specifies (curated caller-attributable
taxonomy, wired into the quality-floor's completion-rate computation, excluding
`caller_input`/`tos_policy` from the denominator) was **already shipped** to `main` as
commit `f19f9f8` ("fix(quality): stop counting correct refusals as capability defects",
PR #278, 2026-08-16 11:49 CET) — before this worktree's base commit. It supersedes the
2026-08-14 handoff's discovery work and directly answers the "top item for next session"
flagged in `handoff/_general/from-code/2026-08-16-checkin-morning.md`.

Independently re-verified this session (not just trusted from the commit message):

- `apps/api/src/lib/transaction-failure-taxonomy.ts` classifies error text into
  `caller_input | tos_policy | config | timeout | upstream | internal`;
  `CALLER_ATTRIBUTABLE = {caller_input, tos_policy}` is excluded from the floor's
  eligible-calls denominator in `foldTrafficRows()` (`apps/api/src/jobs/quality-floor.ts:93`).
- Reverted the file to its pre-#278 content (`git checkout 8af02fe -- ...`) and ran the
  current test suite against it: **29 of 75 tests fail**, including the exact
  `us-company-data` regression test ("recomputes us-company-data's quarantine window as
  fully caller-attributable"). Restored to HEAD (`git checkout HEAD -- ...`): **75/75
  pass**. Confirms the fix is real and the tests are load-bearing, not decorative.
- Confirmed the specific example named in this task's brief: `product-reviews-extract`'s
  Trustpilot refusals throw with `TOS_REFUSAL_MARKER` (`lib/tos-blocklist.ts`), which
  `classifyTransactionFailure` checks first and returns `tos_policy` — excluded. The
  7-failed/8-call Trustpilot example is already correctly handled.
- `apps/api/src/lib/capability-promotion.ts` (the re-listing counterpart) does not need
  the same fix — it reads test-harness/piggyback pass rates, not `transactions.error`, so
  it isn't exposed to this bug. Checked; no gap found.

No code changes were made to the taxonomy or the floor — there was nothing left to fix.
This document covers T0.2 only: auditing what the *already-armed* floor did before the fix
landed, since quarantine is one-directional (the floor never promotes back — see
`capability-promotion.ts`'s header) and the current in-prod quarantines predate the fix.

## Method

1. `health_monitor_events WHERE event_type='quality_floor' AND action_taken IN
   ('quarantined','flagged_only')`, last 30 days — every candidate the floor acted or
   nearly acted on.
2. For each capability actually quarantined (`visible=false, x402_enabled=false` today),
   re-ran the floor's own query shape (`jobs/quality-floor.ts`'s SQL, `foldTrafficRows`
   logic) against real `transactions` rows for the capability's 30-day eligible window,
   both as-of the original quarantine timestamp and as of now (2026-08-16), classifying
   every failure with the **current** (fixed) `classifyTransactionFailure`.
3. Cross-checked `DEACTIVATED` in `apps/api/src/capabilities/auto-register.ts` (a
   separate, code-level, PR-gated deny-list — distinct from the floor's DB-flag
   quarantine) against its own inline history/comments for any entry attributable to
   failure-rate misclassification.

## Findings — quality-floor quarantines (DB-flag, `visible=false`)

| Capability | Action | Date (UTC) | Original completion | Recomputed completion (fixed taxonomy) | Driver | Verdict | Disposition |
|---|---|---|---|---|---|---|---|
| `us-company-data` | quarantined | 2026-08-12 20:18 | 64% (7/11) | **100% (7/7)** | 4 caller-input refusals (missing `cik`/`company_name`, unresolvable names, one LLM-error-string-as-input, one ambiguous-match refusal for "Apple") misclassified `internal` pre-fix | **WRONG** — taxonomy bug is the entire driver | **Reinstate.** SQL prepared, not run: `apps/api/scripts/t02-reinstate-quarantined.ts` |
| `screenshot-url` | quarantined (×2, re-affirmed) | 2026-08-12 20:18, 2026-08-13 07:47 | 55% (26/47) | 52.4% (current 30d), still below floor | All 20–21 failures are `External web service screenshot returned HTTP 400: "waitForSelector" is not allowed` — Browserless rejecting a parameter **we send**. Classifies `timeout` (documented as deliberately not reclassified — see taxonomy file's own comment — because it doesn't change the floor math either way) | **RIGHT** — genuine defect, ours | Keep quarantined. Fix the `waitForSelector` request bug (cheap, well-understood — flagged in the 2026-08-16 checkin as "the cheapest revenue fix on the list"), then let the capability-promotion job (or a manual un-quarantine once fixed) re-list it after a green week. Not reinstating now would just relist a capability that still fails ~48% of real calls. |
| `brazilian-company-data` | quarantined | 2026-08-12 20:18 | 59% (17/29) | 58.6%, unchanged | 11 of 12 failures are `ReceitaWS returned HTTP 429` — vendor rate-limiting. Classifies `upstream`, which is correctly **not** caller-attributable (the taxonomy's own header explicitly warns against excusing vendor 5xx/429 — "counting a month-long upstream outage as caller fault would report 100% completion while every customer call fails") | **RIGHT** — genuine failure to serve customers, even though root cause is vendor throttling rather than a code bug | Keep quarantined. Real fix is request throttling/backoff against ReceitaWS or a paid tier, not a taxonomy change — the taxonomy is behaving as designed here. |
| `url-to-text` | quarantined | 2026-08-13 07:47 | 39% (per 2026-08-16 checkin snapshot) / 58.3% (this audit's as-of-quarantine recompute — different exact cutoff) | 60.0% (current 30d), still below floor | Failures are 5 `HTTP 403 from [service]`-style caller-target-blocked refusals (already excluded, both pre- and post-fix window differences account for the completion delta) plus genuine `External service temporarily unavailable` (upstream) and one `timeout` | **RIGHT** — real failures remain even after excluding what should be excluded | Keep quarantined. Needs a real fix on the upstream-unavailability path, not a taxonomy change. |
| `eu-regulation-search` | quarantined (manual_ops, not floor-automated) | 2026-08-15 13:34 | 0% (0/6, zero lifetime successes) | n/a — pre-existing scrape breakage, unrelated to the transaction-failure-taxonomy | **RIGHT**, and **already resolved** | No action — rebuilt on the official CELLAR SPARQL API and un-quarantined via `promoted` event 2026-08-15T14:30 (PR #254). Currently `visible=true, x402_enabled=true`. Included here only for completeness. |

**Only `us-company-data` is a taxonomy-bug victim.** The other three quarantines reflect
real, still-open problems (a parameter bug, vendor rate-limiting, vendor unavailability) —
the corrected taxonomy does not change their verdict, which is the taxonomy working
correctly (it is supposed to keep genuine failures counted).

`dry_run_would_quarantine` events (9, last 30d) are the same three durable candidates
(`screenshot-url`, `brazilian-company-data`, `us-company-data`) logged repeatedly across
several ticks on 2026-08-12 before enforce mode picked them up — not additional
candidates.

`deactivate_proposal` was `false` on every event read. No deactivation has occurred yet
under the floor; only quarantines. This audit therefore has no deactivation-reversal work.

## Findings — `DEACTIVATED` map (`apps/api/src/capabilities/auto-register.ts`)

25 entries, all read in full. **None are attributable to the transaction-failure-taxonomy
bug or to any quality-floor completion-rate computation.** Every entry's inline reason is
one of: ToS/scraping-doctrine prohibition (DEC-20260420-H / DEC-20260427-H-*/
DEC-20260428-A Tier 1), missing/geo-restricted vendor credential, duplicate capability,
no compliant data source for the field set, GDPR purpose-limitation concern, or
deliberately parked scope (UK property vertical, 9 entries). This is a separate,
code-level, PR-gated deny-list — distinct from the floor's DB-flag quarantine mechanism —
and nothing here needs reversal from this audit.

## Other decision-log events checked and excluded as out of scope

- `solution_contained` (15 events, all 2026-08-12): a different subsystem — solutions
  whose step 1 always fails, billed full price for zero executed checks (a DEC-14
  violation caught by `kyb-wiring-audit`), contained pending a `solution-executor` fix.
  Not driven by transaction-failure-taxonomy; correctly excluded from this audit.
- `deactivated_doctrine` (1 event: `product-search`, 2026-08-12): a Tier-1 scraping-doctrine
  deactivation (DEC-20260427-H-4), not a completion-rate quarantine. Correctly excluded.

## Reinstatement

SQL prepared and dry-run-verified against prod at `apps/api/scripts/t02-reinstate-quarantined.ts`.
**Not executed.** Dry-run output (2026-08-16):

```
WOULD APPLY reinstatement for us-company-data
  current: visible=false x402_enabled=false lifecycle_state=active
  reason: Quarantined 2026-08-12T20:18:02Z at completion 64% (7/11 eligible). Recomputed
  under the corrected taxonomy ... Corrected completion is 100% (7/7) ...
Dry run only — no writes made. Re-run with --apply to write.
```

The script writes the flag flip and its `health_monitor_events` audit row in one
transaction (mirroring `jobs/quality-floor.ts`'s own commit pattern), refuses to touch any
capability with a human-set `deactivation_reason`, and is a no-op if the capability is
already visible.

## What could not be verified

- Whether `us-company-data`'s traffic pattern has shifted materially since 2026-08-12
  (e.g. a burst of the same bad-input calls recurring) — the recompute uses the same 90
  real rows in both the as-of-quarantine and current-30d windows because no new eligible
  traffic has arrived since the capability went dark (expected: a delisted capability
  gets no catalog traffic). Reinstatement should be watched for a few days of real traffic
  once applied.
- Whether `screenshot-url`'s `waitForSelector` bug has a one-line fix or requires a
  Browserless API version check — not investigated; out of scope for a
  classification-focused Phase 0 session (flagged as a distinct follow-up, not fixed here
  per scope discipline).
