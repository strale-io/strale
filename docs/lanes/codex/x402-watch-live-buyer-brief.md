Intent: Codex builder brief: the x402 settlement watch stops paging CRITICAL "rail failure" when its dominant buyer is still settling. A buyer that keeps paying end to end proves the rail works.

# Brief: x402 settlement watch counts the dominant buyer's own settlements as rail proof

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-14.
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

In `classifyVolume`, after the existing exclusion loop finds no `concentrated` split:

- Add a constant `LIVE_BUYER_MIN_RATIO = 0.1`. If at least one of the `top` buyers (the same ones the loop considers, at most `MAX_EXCLUDED_BUYERS`) settled in the last 24 hours at least `max(1, LIVE_BUYER_MIN_RATIO × its own baseline)`, return a new kind, `"reduced"`.
- Why a ratio and not one settlement: a buyer down to a few straggling settlements (the existing review test's "v1 die-off", 1 against a baseline of 150) is not proof that the rail works for it, and must stay CRITICAL.
- Carry the same fields as `concentrated` and `broad` (`distinctPayers24h`, `distinctPayers7d`, `topBuyers`, `excluded`, `othersLast24h`, `othersBaselinePerDay`). Set `excluded` to 0.
- Otherwise return `broad` exactly as today.

Keep every existing case that returns `concentrated`, `healthy` or `no_baseline` returning the same kind. The order of checks stays: `no_baseline`, `healthy`, `concentrated`, then the new `reduced`, then `broad`.

### 2. Page it as a warning with its own key

In `checkX402SettlementVolume`:

- Log the verdict as today; include the same extra fields for `reduced` as for `concentrated` and `broad`.
- Send `reduced` through `alertOnce` with severity `warning` and its own key, `x402-settlement-volume-drop-reduced`, so it never shares a cooldown with the CRITICAL key.
- The subject says the volume is down and the top buyer is still settling, for example `x402 volume down to N in 24h vs ~B/day; the top buyer is still settling, so the rail works`.
- The body uses `totals` and `describeBuyers(verdict)`, then says: the top buyer kept settling, which proves the rail end to end; this is most likely a customer signal; it becomes CRITICAL if that buyer stops settling too.
- Do not suggest the challenge-version rollback in this body.

### 3. Update the header comment

Add one short paragraph to the header comment explaining the `reduced` verdict and why a settling top buyer counts as rail proof. Keep the rest of the comment.

### 4. Leave the rest alone

Change nothing else. In particular:
- no change (beyond the new constant) to `ALERT_RATIO`, `MIN_BASELINE_PER_DAY`, `MIN_OTHERS_PER_DAY`, `OTHERS_NEAR_BASELINE_RATIO`, `MAX_EXCLUDED_BUYERS`, the spike cap or the cooldown;
- no change to the SQL, the tick, or any other job;
- no migration and no new environment variable.

## Tests (each must fail against origin/main where the behaviour is new)

1. **The first-week shape:** one buyer with a steady baseline of 350/day that settles 140 in the last 24 hours, plus two minor payers with a combined baseline of 2/day who settle 0. The verdict is `reduced`, not `broad`.
2. **The big buyer stops:** the same, but the big buyer settles 0. The verdict stays `broad`.
3. **The existing test** "stays critical when the other payers' own baseline is too small to prove the rail works" (big buyer 1 in 24h against a baseline of 150) passes unchanged: 1 is under 10% of 150. Do not edit it.
3b. **The ratio edge:** a big buyer with baseline 100 that settles 9 stays `broad`; one that settles 10 is `reduced`.
4. **Second buyer counts too:** two top buyers, the first settles 0 and the second settles at least 10% of its own baseline, others under the floor. The verdict is `reduced`.
5. **Alert routing:** with a stubbed `alertOnce` (or the module's existing seam, whichever the current tests use), a `reduced` verdict sends one `warning` under `x402-settlement-volume-drop-reduced`, and a `broad` verdict still sends `critical` under `x402-settlement-volume-drop`. If there is no seam to observe the alert without a database, add a small one, not a database.

## Verification to run

- `npm --workspace=apps/api exec vitest run src/jobs/x402-settlement-watch.test.ts`
- `npm run typecheck`

## Report

Write `docs/lanes/codex/x402-watch-live-buyer-report.md` with: files changed, tests added (names), the verification commands and their results, and anything not done and why.
