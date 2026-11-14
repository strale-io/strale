Intent: Codex builder brief: the x402 settlement watch stops paging CRITICAL "rail failure" when its dominant buyer is still settling. A buyer that keeps paying end to end proves the rail works.

# Brief: x402 settlement watch counts the dominant buyer's own settlements as rail proof

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-14. Revision 2, after independent review: the rule is narrower, and two existing tests change on purpose.
  - Source: robustness T3 item (2) in `docs/programs/robustness/tracks.yaml`, and the first-week receipt `archive/receipts/2026-11-14-check-r3-x402-settlement-watch-first-week.json`.
- **Branch:** push only `codex/x402-watch-live-buyer`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets and no production data. Tests are offline vitest unit tests against `classifyVolume`, like the existing ones.
- **Read first:**
  - `apps/api/src/jobs/x402-settlement-watch.ts`: the header comment, `classifyVolume()`, `describeBuyers()`, `checkX402SettlementVolume()`;
  - `apps/api/src/jobs/x402-settlement-watch.test.ts`, in particular "stays critical when the other payers' own baseline is too small to prove the rail works";
  - `apps/api/src/lib/alert-once.ts`.

## Why

- **What happened in the first production week:** one buyer holds about 99% of the baseline. Its daily volume fell well under half its baseline, but it kept settling every day.
- **What the watch did:** with that buyer removed, the other payers' baseline is under `MIN_OTHERS_PER_DAY`, so `classifyVolume` returns `broad`. The page went out as CRITICAL "x402 settlement volume dropped", saying the drop is broad and suggesting a challenge-version rollback. Because the cooldown is 24 hours and the drop lasted, it paged CRITICAL four days running.
- **Why that is wrong:** the rule exists because "someone else paying end to end is what proves the rail works". The dominant buyer paying end to end proves the same thing, and the rule ignores it. The right signal for that week was a customer-volume warning, not a rail-failure page.

## What to change

### 1. A new verdict for "the big buyer pays less but still pays"

In `classifyVolume`, after the existing exclusion loop finds no `concentrated` split, apply one rule to **the #1 ranked buyer only** (`top[0]`, the payer with the largest baseline):

- Add two constants: `LIVE_BUYER_MIN_SHARE = 0.5` and `LIVE_BUYER_MIN_RATIO = 0.2`.
- Return a new kind, `"reduced"`, when all of these hold for `top[0]`:
  - its baseline is at least `LIVE_BUYER_MIN_SHARE × baselinePerDay` (it makes at least half the volume);
  - its baseline is at least `MIN_BASELINE_PER_DAY`;
  - its `last24h` is at least `max(MIN_BASELINE_PER_DAY, LIVE_BUYER_MIN_RATIO × its own baseline)`.
- Why so strict:
  - Only the #1 buyer counts, with a share floor, so a small payer settling once (baseline 1, settled 1) never qualifies. A first draft let any top-two buyer qualify, and that flipped six existing tests. The review of PR 1059 caught it.
  - A straggling buyer is not rail proof: 1 against 150 (the existing "v1 die-off" test) and 20 against about 107 ("a rail breaking right after a ramp") stay CRITICAL.
- The returned verdict carries the same fields as `concentrated` and `broad` (`distinctPayers24h`, `distinctPayers7d`, `topBuyers`, `excluded`, `othersLast24h`, `othersBaselinePerDay`), with `excluded` set to 0.
- Otherwise return `broad` exactly as today.

Keep every case that today returns `concentrated`, `healthy` or `no_baseline` returning the same kind. The order of checks stays: `no_baseline`, `healthy`, `concentrated`, then the new `reduced`, then `broad`.

Note the deliberate trade-off: a single dominant payer still settling at 20 to 50 percent of its own baseline is now a warning, not CRITICAL.
- That is the shape of the first production week.
- It is also the shape of two existing tests, listed under Tests below.
- The settlement count alone cannot tell reduced demand from a partial failure. A partial settle failure already pages at once from `reportSettlementFailure()`. A challenge-version mismatch takes an affected client to zero, which stays CRITICAL.

### 2. Page it as a warning with its own key

In `checkX402SettlementVolume`:

- Log the verdict as today, with the same extra fields for `reduced` as for `concentrated` and `broad`.
- Send `reduced` through `alertOnce` with severity `warning` and its own key, `x402-settlement-volume-drop-reduced`. It must never share a cooldown with the CRITICAL key.
- The subject says the volume is down and the top buyer is still settling, for example: `x402 volume down to N in 24h vs ~B/day; the top buyer is still settling, so the rail works`.
- The body uses `totals` and `describeBuyers(verdict)` (widen its parameter type to accept `reduced`). It then says:
  - the top buyer kept settling, which proves the rail end to end;
  - this is most likely a customer signal;
  - it becomes CRITICAL if that buyer falls under 20 percent of its own baseline or stops.
- Do not suggest the challenge-version rollback in this body.

### 3. Update the header comment

Add one short paragraph to the header comment explaining the `reduced` verdict and why a dominant buyer that is still settling counts as rail proof. Keep the rest of the comment.

### 4. Leave the rest alone

Change nothing else. In particular:
- no change, beyond the two new constants, to `ALERT_RATIO`, `MIN_BASELINE_PER_DAY`, `MIN_OTHERS_PER_DAY`, `OTHERS_NEAR_BASELINE_RATIO`, `MAX_EXCLUDED_BUYERS`, the spike cap or the cooldown;
- no change to the SQL, the tick, or any other job;
- no migration and no new environment variable.

## Tests

The master checked the rule above against the current suite, using a throwaway local patch that was not committed.
- 33 of the 35 unit tests keep their current verdict.
- The integration tests in `x402-settlement-watch.integration.test.ts` keep theirs, because no `top[0]` there qualifies.

### Existing tests that must change, and only these

Edit only the `kind` expectation, from `broad` to `reduced`, and add a short comment naming this brief:
- **"a slow degradation keeps paging as long as the mean did"** (a single payer at 25 against about 61). It still pages, as a warning. Keep its `baselinePerDay` assertion unchanged.
- **"a quiet day inside a ramp is not the payer coming back, so a ramp that breaks pages"**, both `classifyVolume` assertions (25 against a ramp baseline). Keep both `capPayerSpikes` assertions unchanged.

Any other existing test that changes verdict is a defect in the implementation, not in the test. Stop and say so in the report; do not edit it.

### Existing tests that must pass unchanged

Among others:
- "stays critical when the other payers' own baseline is too small to prove the rail works";
- "counts unattributed rows with the others and never as a buyer to exclude";
- "one buyer's burst never shrinks the steady payers, so a broad drop stays critical (review round 3)";
- "a rail breaking right after a ramp pages, as the mean did (review round 2)";
- the "deep outage" test;
- the integration test "a broad drop across buyers stays critical and carries the payer breakdown".

### New tests

Each must fail against origin/main.

1. **The first-week shape:** one buyer with a steady baseline of 350/day that settles 140 in the last 24 hours, plus two minor payers with a combined baseline of 2/day that settle 0. The verdict is `reduced`, not `broad`.
2. **The big buyer stops:** the same, but the big buyer settles 0. The verdict stays `broad`. This one passes on main too, which is fine: it pins the boundary.
3. **The ratio edge:** a single buyer with a steady baseline of 100. It stays `broad` at 19 settled and is `reduced` at 20.
4. **The share floor:** a buyer at 40/day plus four others at 15/day each (60 in total), all settling 0 except the buyer at 30. The verdict stays `broad`, because the top buyer holds under half the baseline.
5. **A tiny second payer never qualifies:** a big buyer at 150/day settling 1, plus a payer at 1/day settling 1. The verdict stays `broad`. This is the existing review test's shape, asserted explicitly.
6. **Alert routing:**
   - Use a stubbed `alertOnce`, or the module's existing seam, whichever the current tests use.
   - A `reduced` verdict sends one `warning` under `x402-settlement-volume-drop-reduced`, with no rollback text.
   - A `broad` verdict still sends `critical` under `x402-settlement-volume-drop`.
   - If no seam can observe the alert without a database, add a small one, not a database.

## Verification to run

- `npm --workspace=apps/api exec vitest run src/jobs/x402-settlement-watch.test.ts`
- `npm --workspace=apps/api exec vitest run src/jobs/x402-settlement-watch.integration.test.ts` (skip if it needs a database you do not have, and say so)
- `npm run typecheck`

## Report

Write `docs/lanes/codex/x402-watch-live-buyer-report.md` with: files changed, tests added (names), the verification commands and their results, and anything not done and why.
