Intent: get `domain-age-check` to answer through RDAP first and name its upstream failures. In the 7 days to 2026-11-07 it failed 20 of 289 paid calls, and every failure surfaced as the masked "Service temporarily unreachable".

[BACKFILL] Cloud session; no Notion write was made.

## How it was built

**Codex, dispatched by the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw):**

- `domain-age-rdap`, first run: READY with no diff.
- `domain-age-rdap`, retry: 90ba9baf.
- `domain-age-rdap-2`, the review fixes: 45988617.
- That uses up the family's three Codex runs. The last fix is a Claude commit, 799739ed.

**Reviews, all separate-context Claude:**

- **90ba9baf: FAIL.** The new error text had dropped the `ECONN*` tokens, which the brief had asked for. That made resets and refusals unretryable and `unclassified`.
- **45988617: PASS-WITH-NITS.**
  - M1: for 60 s after a failed bootstrap, `.xyz` returned a success instead of a named failure.
  - N1: the combined-message classifier cases did not test what they claimed.
  - N3: nothing checked that a failed bootstrap is not fetched again before 60 s.
- **799739ed** fixes M1, N1 and N3. It has its own delta review.

## What changed

- **RDAP first.** The base comes from the IANA bootstrap, cached for 24 h, with a failure remembered for 60 s and one in-flight fetch shared between calls. WHOIS is the fallback.
- **Provenance.** `provenance.source` is `rdap` or `whois`, and `provenance.upstream` names the registry host.
- **Classifiers.** `/connection (reset|refused)/i` is added to the retry list, the failure classifier and the transaction failure taxonomy.

## Still open

- **DB-backed checks.** `validate-capability` and `smoke-test` for `domain-age-check` need a database, and neither the cloud session nor Codex can reach one. Run them on the PC: `cd apps/api && npx tsx scripts/validate-capability.ts --slug domain-age-check`, then `npx tsx scripts/smoke-test.ts --slug domain-age-check`.
- **After deploy:**
  - `who-called --slug domain-age-check --days 2 --errors` should show named registry failures instead of "Service temporarily unreachable".
  - Check one `.com` call for `provenance.source: "rdap"`.
- **`whois-lookup`** has the same raw WHOIS client and still needs its own brief.
