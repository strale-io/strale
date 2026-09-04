Intent: Run the 2026-09-04 morning operating session per docs/company/DAILY-RUN.md —
measure the business, sweep overnight health and stale work, process the decision
queue, do the highest-leverage work the evidence points at, and produce the two
artifacts.

Worktree: `C:\Users\pette\Projects\strale-wt-checkin`, branch
`chore/checkin-2026-09-04`, cut from `origin/main` at `0308e99b` and rebased onto
`90c1c798`. All production access read-only. No production writes, no branch
switching in the trunk, no stash.

## Headline

| | |
|---|---|
| Last completed ISO week (08-24) | €73.03 · 1,295 calls · 13 payers · top share 76.0% |
| Week in progress (08-31), day 5/7 | €48.05 · 979 calls — **no conclusion drawn** |
| Rolling 7d (dashboard, independent window) | €73.15 · 18 buyers · 100% identity |
| Deployed commit | `0308e99bb339` == `origin/main` tip at session start (`GET /health`) |
| CI on main | green both workflows · Open PRs at start: **2**, both merged this run |
| Vendor tower | ACTION NEEDED — 4 CRITICAL, all OpenRegister, 8th identical morning |
| Repo hygiene | all clear (0 red, 0 yellow) |
| Branch graveyard | 2 branches deleted, both halves; 1 leftover worktree removed |
| **The finding** | **a merged PR's customer-impact claim was 100% test harness, all 2,425 calls, 98 days** |

## Step A — measure

`scripts/ceo-dashboard.ts` and `scripts/commercial-brief.ts`, production
read-only, both through `lib/metrics`.

**No new completed-week business fact.** The last completed ISO week remains
2026-08-24 (€73.03 / 1,295 / 13 payers / 76.0% top share). Today is day 5 of the
08-31 week; the pack refuses every payer question on it, correctly. The next
genuine reading is that week's close on **2026-09-06**.

Deliberately **not** stated anywhere: that concentration has worsened. Day 5
reads 98.7% (€47.44 against €0.61) against 76.0% for the last whole week. That
is a partial-window artefact, which GOALS.md has rejected three times. Recorded
in GOALS.md explicitly as a comparison *not* made, so a later session does not
make it.

### The card customer, second-sourced a different way than yesterday

Yesterday established `provider@dlgt.io`'s silence off a distinct-payers-per-day
count. Today the per-payer series itself was resolved through `payerFacts` for
every day 08-22 → 09-03. Their whole history: 08-23 €2.00, 08-25 €3.09, 08-26
€3.00, 08-28 €3.00 — longest prior gap **two days** — and nothing since. The gap
is now **seven days**. The actor key `user:v1:e3c68534-4d7b-4387-9156-a1913f3bc52b`
was confirmed against `users` to be that address rather than assumed from
yesterday's note.

Still a fact and not a verdict: four active days of history make a seven-day gap
weak evidence. 2026-09-06 settles it. Written into GOALS.md in that form.

## Step B — overnight health

**Vendor tower: ACTION NEEDED, nothing new.** Four CRITICAL, all OpenRegister:
0/500 credits, `german-company-data` and the three DE solutions auto-suspended
until the **2026-09-06T23:40Z** free reset. Settled 2026-08-27 as not worth
buying (€1.80 observed demand against €59/month). **Eighth consecutive morning
with the identical finding** — an instrument faithfully reporting a deliberate
commercial choice. Does not reach the brief.

Six WARNINGs, all pre-existing and unchanged. Balances: Browserless 998/1000
(resets 09-25); Serper **47,287**/50,000, down 5 from yesterday's 47,292,
consistent with light real traffic, expires 2026-11-08.

### Failures in the last 10 days: overwhelmingly correct refusals

Partitioned by caller class and error string. The largest external cluster is
`french-company-data`, 15 failures on 09-01: 6 "could not identify a company
name", 3 "no confident registry match", 6 across two "ambiguous — N exact
matches" (18 for "Le Boudoir", 6 for "Jardin des Thés"). These are the
score-and-refuse behaviour working: a registry name search never ranks by
relevance, and taking `result[0]` is the defect this refusal exists to prevent.
Not a fault, and it must not count against the quality floor.

Everything else external is the same shape: upstream 403s from *target sites*
(bot protection on the site, not us), unsupported country codes for
`country-tax-rates` / `price-compare` / `vat-rate-lookup`, and a `screenshot-url`
403 from the vendor. Nothing here is a defect.

### B2 / B3 — stale work: two PRs merged, two branches deleted, one worktree removed

Two PRs were open at session start, both from sessions that had already stopped
(`isRunning: false`), both independently reviewed, both left unmerged. B2 says
"still open" is not an allowed end state, and the charter puts shipping in my
column, so both were disposed of:

- **#502** (`fix/executor-input-type-guards`) — CI green both jobs, review PASS
  WITH FINDINGS with the findings acted on. Merged as `bd755ea8`.
- **#503** (`docs/m2-g1-pre-readiness-feature-rule`) — the required check needed
  the updated base after #502 landed; `gh pr update-branch`, CI re-ran green,
  merged as `90c1c798`. A concurrent session reached the merge button first; the
  outcome is the same.

Branch graveyard, both halves deleted local-first per the F7 rule, commit ids
recorded here so both are restorable:

- `fix/deps-hono-4-12-34` @ `50aebe87` — superseded by #499. **Verified by blob
  identity, not by commit count:** all five files it touched hash identically to
  `origin/main`. Deleted local, then remote, then re-verified with `git ls-remote`.
- `fix/executor-input-type-guards` @ `b7eb5f48` — merged via #502.

The second needed its worktree gone first. DAILY-RUN B3 says removing another
session's worktree is not an unattended-run operation; that caution is about a
session still using one, and the handoff gate's own note covers this case
("once its PR is merged, the next session removes this worktree"). Conditions
checked before acting: session stopped, PR merged, tree clean, no unpushed
commits, `node_modules` a real directory and not a junction, and no link anywhere
under the tree pointing outside it. **`git worktree remove` half-succeeded** — it
de-registered the worktree and deleted most of the tree but left `node_modules`,
`packages/` and `scripts/` behind, exactly the known partial-removal hazard.
Finished with `Remove-Item -Recurse` only after confirming there were no outward
links; then `git worktree prune`; then the branch.

`GET /health` returned `0308e99bb339`, equal to the `origin/main` tip at session
start. Both merges land after that reading, so the deployed commit is
legitimately behind main now and Railway will catch up; **not verified after the
merges**, and the next session should confirm rather than assume.

### B2b — hygiene

`session-close-check.ts --hygiene-only`, run from the primary checkout per
DAILY-RUN's own correction: **all clear**.

### B4 — activity, last 24h

161 external transactions (159 completed), 158 over x402, 3 wallet, 3 free-tier.
Concentrated: `email-validate` 85, `base64-encode-url` 42, `keyword-suggest` 8.
Two failures, both `image-to-text` fetching an image URL that 403s — the caller's
URL, not ours. **Zero signups.**

558 `failed_requests`, 554 `x402_not_on_rail` (286 crawler-UA against 272
plain-client). Top plain-client misses: `german-company-data` 27,
`page-speed-test` 25, `product-search` 20. Per the standing note this bucket
mixes enumerator sweeps with real asks, and `german-company-data` is the slug
OpenRegister exhaustion suspended. Recorded, not acted on.

## Step C — decision queue

No `preauthorized_notice` item has a matured window. `your_call` items DQ-27 and
DQ-14 hold; each was checked for a route around it and neither blocks a work
stream. DQ-27's two latency corrections still have no route to production without
the write role, which is the entry's whole point. DQ-28 and DQ-30 are now
`answered` on main — yesterday's `unverified:` note about a peer session reporting
them resolves in favour of that report, verified this morning from `origin/main`
rather than from a peer's claim.

## Step D — the work: a merged PR's customer-impact claim was entirely our own harness

**How it surfaced.** The overnight failure sweep showed no trace of the three
crashes PR #502 had merged 20 minutes earlier to fix — `gitignore-generate`,
`timezone-meeting-find`, `redirect-trace` — even though its body reported 13/12/12
calls in the previous 24 hours. A count that large should have sat at the top of a
10-day external failure list. It was absent because the list was external and
those calls were not.

**What production says.** Partitioned by caller class over the capabilities'
entire lifetimes:

| error | harness | registered account | anonymous (x402) | since |
|---|---|---|---|---|
| `languages.map is not a function` | 808 | 0 | 0 | 2026-05-30 |
| `timezones.map is not a function` | 806 | 0 | 0 | 2026-05-30 |
| `Cannot read properties of undefined (reading 'url')` | 811 | 0 | 0 | 2026-05-29 |

2,425 occurrences over 98 days, every one `system@strale.internal`. The harness is
*deliberately* sending malformed input — these are its own negative tests. **No
customer has ever seen any of the three errors.**

**Second-sourced two ways**, per the standing rule: an ad-hoc caller-class
partition, and then independently by `who-called.ts` (written afterwards) run
against production. Both return the same three rows. The instrument was also
checked *against a positive control*, so that a uniform zero could not be mistaken
for a broken tool: `competitor-compare` over 30 days returns 7 harness and **10
registered-account** calls, and `redirect-trace` returns 12 anonymous.

**The fix stands and is not in question.** An `as string[]` cast is a compile-time
assertion over arbitrary wire JSON, and crashing on a declared contract violation
is a real defect worth fixing. What is wrong is the recorded reason, in a merged
PR body where it would later be cited as evidence of customer harm.

**The one place customer impact did exist, which the PR did not name.**
`redirect-trace`'s `max_redirects` bug reached real callers through a *different*
string: `Too many redirects (>0) — refusing to follow further` was served to **2
anonymous x402 calls**, against 644 from the harness. Same root cause, so the fix
covers it — but it is not the error the table cites, and none of the table's own
three rows carries any customer impact.

**Why this is F2 and not carelessness.** The query was correct; its population was
everybody. F2's own standing rule already covered it — "any business number
computed outside `lib/metrics` is a new instance of this family, whoever computes
it and however careful they were" — and `externalCustomers()` already existed and
would have returned zero. It was not reached for.

### The repair: a partition, not another filter

`externalCustomers()` is a filter, and a filter is something a caller must
remember to apply. The failure mode when they forget is silent *and flattering*,
because an unfiltered count on this platform is ~98% harness by default. That is
F2 incident 9's lesson arriving in a second place: where the safe value is also
the default, an opt-in guard is a convention, not a guard.

- `lib/metrics/populations.ts` — new `callerClass()` / `callerClassSql()`
  splitting every transaction into `harness` / `account` / `anonymous`, plus
  `internalUserIds()`, extracted so that `externalCustomers()` and the partition
  are expressed against **one** definition of "ours" and cannot drift.
- `apps/api/scripts/who-called.ts` — prints all three classes side by side
  **including at zero**, with error strings, and a closing line that says in words
  when no customer was affected. A class that disappears when empty is exactly how
  "13 calls" becomes "13 customers".
- `populations.test.ts` — 9 tests. The load-bearing one renders both the filter
  and the partition through `PgDialect` and asserts they embed the identical
  subquery **and the identical bind parameters** — a matching string with
  different binds would classify different accounts as ours.

**Proven discriminating, not asserted.** Two mutations planted and the suite
re-run: (1) the partition's harness branch pointed at its own hand-written
subquery instead of `internalUserIds()`, (2) `callerClass` collapsing "user with
no email joined" into `anonymous`. **3 tests failed** — `both express 'ours' with
the identical subquery and the identical binds`, `every internal-account rule is
carried into the partition's binds`, and `does not confuse 'no user' with 'user
whose email we did not fetch'`. Restored: 9/9 pass.

**The refactor is behaviour-preserving, verified against production rather than
argued.** `externalCustomers()` was rewritten to use the extracted subquery, and
`commercial-brief.ts` was re-run afterwards: €48.05 / €73.03 / €66.31 / €39.24 /
€27.38 / €10.85 across the six discrete weeks, identical to the pre-refactor run
earlier in the same session.

**A gate that could not have caught any of this.** `apps/api/tsconfig.json`
includes only `src/**/*` and excludes `**/*.test.ts`, so `who-called.ts` and
`populations.test.ts` are both outside the typecheck — `tsc --noEmit -p apps/api`
being clean says nothing about either. Verified with `--listFiles` (0 matches
under `apps/api/scripts`) rather than assumed, and both files were then
typechecked explicitly with `--strict --module nodenext`. The real evidence for
the script is that it ran against production four times and reproduced a finding
first reached a different way.

**Correction filed where it will be read:** a comment on merged PR #502 carrying
the table above, and LESSONS.md F2 incident 10 (count 9 → 10). DAILY-RUN.md step B
now carries the rule and the command, so the next run does not have to rediscover
the instrument.

## Step E — authorities updated

- `docs/company/LESSONS.md` — F2 incident 10, count 9 → 10.
- `docs/company/GOALS.md` — dated entry: the card customer at seven days, and the
  concentration comparison explicitly not made.
- `docs/company/DAILY-RUN.md` — step B gains the caller-class rule and command.
- Merged PR #502 — correction comment.

## Verification run

Green: `env:check`, `models:check`, `claims:check`, `docs:check`,
`receipts:check`, `migrations:check`, `programs:check`, `research:check`,
`design:check`, `codex:check`; `tsc --noEmit -p apps/api` clean (after
`npm --workspace=packages/mcp-server run build`); `src/lib/metrics/**` 83/83;
`revenue-heartbeat` 8/8 — the other `externalCustomers` consumer that has a suite.

Per yesterday's note the local full `npm test` is resource-starvation flaky on
this machine and CI is the gate; it was not run as a verdict.

## Not done, and deliberately

- **`docs/programs/codex-review-backlog.yaml` was not touched.** A concurrent
  session was mid-flight writing `CX-6` for PR #502 on `docs/codex-backlog-cx6`;
  two sessions editing the same register would conflict at the same anchor. This
  batch's own row is owed and is named in the next-session list below.
- The three capabilities' *code* was not revisited. #502's fix is correct; only
  its stated justification was wrong.
- No production write of any kind.

## Next session

1. **2026-09-06 is still the date that matters.** The 08-31 week closes; it is the
   first honest test of both open questions — whether the fall in dependence
   (96.4% → 76.0%) holds, and whether the card customer's silence is a stop or a
   pause. `quietPayers` answers the second directly for the first time.
2. **Add this batch's Codex-review row** to `docs/programs/codex-review-backlog.yaml`
   once `CX-6` has landed. Subject: the caller-class partition and the F2
   incident-10 correction. What to attack: whether `callerClassSql`'s three classes
   are genuinely exhaustive over `transactions` as it exists in production, and
   whether the `PgDialect` render test would survive drizzle changing its SQL
   formatting.
3. **Confirm the deployed commit caught up.** `GET /health` was read before both
   merges landed; verify against `origin/main` rather than assume.
4. OpenRegister credits reset 2026-09-06T23:40Z; the four DE listings return on
   their own. Verify rather than assume.
5. F2's replay is still owed, unchanged since incident 7: re-derive the five
   2026-08-15 conclusions through `lib/metrics` and confirm each now refuses or
   changes. Incident 10 is an argument for it, not a substitute.
