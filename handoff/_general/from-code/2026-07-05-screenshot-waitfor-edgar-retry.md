# Handoff — 2026-07-05 — screenshot-url + us-company-data reliability fixes

**Intent:** Ran `/activity since-last`, dug into two failures it surfaced in production x402 traffic, fixed both, shipped via `/go` → PR #148.

## What the activity check showed (window 2026-07-02 21:42 → 2026-07-05 02:47 CET)
- 15 external calls, all x402, single exploratory user testing the catalog against `stripe.com` / `vercel.com`. 1 signup (throwaway-looking, no spend).
- 3 failures, two of them real signal:
  - `screenshot-url` HTTP 400 on `wait_for:"3"`.
  - `us-company-data` HTTP 500 on `{"company_name":"Stripe Inc"}` (+ one wrong-param `{"query":"STRI"}`).

## Fixes (PR #148 — branch `fix/screenshot-waitfor-edgar-retry`, off `main`)
1. **screenshot-url** — `wait_for:"3"` (numeric string = "wait 3s") was routed into the `waitForSelector` branch → bogus CSS selector → Browserless 400. Added `normalizeWaitFor()`: numbers **and** numeric strings → `waitForTimeout` (seconds, clamped 0–30); non-numeric strings → selector. Confirmed live against Browserless that `waitForTimeout:3000` returns 200.
2. **us-company-data** — SEC EDGAR 500 was **transient** (endpoint returns 200 consistently on re-test; "Stripe Inc" even returns hits). Root cause = no retry. Replaced a first-draft hand-rolled retry loop with the shared `withRetry` primitive (`lib/retry.ts`) via new `fetchSec()`, adding a local `/HTTP 5\d\d/` pattern because the shared default omits bare 500. Also covers the x402 path (bypasses route-level `executeWithRetry`).

Both carry regression tests (13 total, fail pre-fix / pass post-fix).

3. **us-company-data low-confidence guard** (added after the six-lens review flagged it as a follow-up, then folded into PR #148). Name lookups resolve via SEC full-text *filing* search → a private company ("Stripe Inc") resolves to a different public filer that merely mentions the name. Pass B review found this wrong identity was flowing into the bundled KYB solutions' `sanctions-check`/`pep-check` steps ungated — a real DEC-20260428-B harm. Fix: `classifyNameMatch` (exact/high/low, both names must be ≥2 tokens for high), and a **low-confidence name lookup now errors by default** instead of asserting a wrong identity; `allow_low_confidence=true` opts into best-effort. New output fields `match_confidence`/`is_exact_match`/`searched_name`. Manifest limitation reframed. 21 tests total now.

## Verification
tsc clean · vitest 13/13 · validate-capability both pass · smoke: screenshot-url full pass, us-company-data blocked only by pre-existing ALLOW_MATRIX paid-cost guard (`internal_test`), not a regression · readiness: screenshot-url `ready=true`; us-company-data `ready=false` **pre-existing platform-wide manifest drift** (control cap `email-validate` fails identically) — unrelated to this diff.

## Review (six-lens, both passes — no HIGH)
- MEDIUM: executor retry stacks with route-level retry for 429/502/503/504 (~4 attempts; bare-500 case correctly does NOT stack). Bounded, documented in the `fetchSec` docstring, kept because it's what covers x402.
- MEDIUM (out of scope, follow-up spawned `task_694ae016`): `searchEdgar` takes `hits[0]` → private/ambiguous names (e.g. "Stripe Inc") can resolve to the **wrong** public filer. Needs a match-confidence signal.

## Open threads / next
- **PR #148** awaiting CI + merge.
- **Follow-up task** `task_694ae016` — us-company-data wrong-CIK match risk.
- **Pre-existing, not mine:** the `checkReadiness` "missing output_field_reliability" gate mis-fires platform-wide (email-validate, us-company-data, likely many more flag output fields absent from their manifest `output_field_reliability` map). Worth a dedicated sweep — it makes the readiness gate noisy/untrustworthy.
- Branch `fix/startup-db-retry-alerting` (PR #147, unrelated) was checked out when this session started; my fixes were deliberately branched off `main` to avoid bundling.
