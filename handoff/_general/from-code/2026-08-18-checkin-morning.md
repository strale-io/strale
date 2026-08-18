# 2026-08-18 — Morning check-in

Intent: read the business, triage overnight, sweep stale work, and put the highest-leverage M1 work into production.

## Headline numbers

| | |
|---|---|
| Revenue (external, canonical filter) | **€47.22 this week** — highest of the last five discrete weeks |
| Discrete weeks | w-0 €47.22 · w-1 €40.09 · w-2 €11.13 · w-3 €36.07 · w-4 €29.53 |
| Distinct payers | 5 (lower bound — wallet identity only recorded since 2026-08-15) |
| External spend | €5.52 of the €50/week envelope |
| Circuit breakers open | 1 — `us-court-search`, an intentionally deactivated capability. Stale artifact, not a problem |
| CI on main | green throughout |
| Open PRs, start and end | zero |

Revenue was second-sourced: the rolling figure was recomputed as five discrete weeks through `lib/metrics`. Two consecutive rising weeks. Still ~5× short of M1.

## The main thing I did — and the mistake in the middle of it

**Found:** the four growth bundles built 2026-08-16 under DQ-9 (`competitor-read`, `page-seo-check`, `prospect-brief`, `keyword-scout`) were `is_active = true` — publicly listed — and `x402_enabled = false`. Every euro of external revenue arrives over x402. They had been listed and **unpayable for two days**: an agent could find one in the catalogue, try to buy it, and get a 404. `lead-email-verify` is the control — same construction, same price band, on the rail, 47 external sales in 30 days.

Verified three ways before acting: the DB flag, absence from `GET /x402/catalog`, and a live probe. All 14 component capabilities across the four bundles pass the stricter capability gate and are the platform's top real earners.

Shipped as startup-migration block 0092 (#322) rather than a direct prod-DB write — the DQ-11 lesson. Written to retire itself via a new `startup_migration_ledger` so it cannot re-enable a bundle an operator later switches off (the `scheduled_testing_eligible` footgun).

**Then I broke the deploy.** #322 bound a JS array into `ANY(...)` inside a drizzle `sql` template. drizzle does not serialize a JS array as a Postgres array bind — it expands to a row-value tuple, which Postgres rejects with "op ANY/ALL (array) requires array on right side". In a startup migration that aborts boot. Three deploys failed and an "API failed to start" alert went to two recipients.

**No customer impact:** Railway does not cut over to a failed deployment, so production kept serving `498a160` throughout. The cost was ~40 minutes of blocked deploys and an alert email.

Fixed in #325 with a parameterized IN-list via `sql.join`, plus a regression test asserting no rendered statement contains the row-value form — fail-before verified.

**How it got through, honestly:** `lib/internal-accounts.ts` documents this exact defect as the root cause of a prior outage (`4bf58d0`) and records three recurrences. This was the fourth. My own first test *did* catch it — an assertion looking for a bound array parameter found none. I read that as a harness quirk and weakened the assertion instead of asking why the array was not an array. The signal was present and I explained it away.

## Final verification (by effect, not by log line)

- `GET /health` → `0fc8f38ebf2e` = main's tip.
- `startup_migration_ledger` → `0092_x402GrowthBundles`, `rows_affected = 4`, applied once.
- All four bundles `is_active = true, x402_enabled = true`.
- All four present in `GET /x402/catalog`.
- `GET /x402/solutions/competitor-read` and `/keyword-scout` → **HTTP 402** (payment challenge), previously 404.

## Shipped today

| PR | what it does |
|---|---|
| #322 | growth bundles onto the x402 rail (block 0092, self-retiring) |
| #323 | GOALS.md: the x402 refusal table is an enumerator, not demand; revenue second-sourced; DQ-13 + experiment E4; recovered 366 lines of EU-registry diagnosis from the parked working tree |
| #324 | DQ-14 — the four founder-gated items filed in the queue instead of handoff prose |
| #325 | the crash-loop fix |

All merged and deployed.

## The finding that changes how we read demand

`failed_requests` shows **1,317 `x402_not_on_rail` events** — apparently a large unmet-demand signal, and GOALS.md previously told catalog work to mine this table. It does not survive scrutiny:

- All 1,317 fall in the ~41 hours since the instrument switched on (first row 2026-08-16 13:30). "1,317 over 14 days" is the age of the instrument — the DQ-10 trap again.
- `user_id` null on all of them; arrival flat around the clock, ~26 distinct slugs/hour including 03:00 UTC.
- Per-slug counts near-uniform across unrelated capabilities (44/44/44/43/42/41/41/38/36/34…).
- The same slugs appear under `x402_unknown_slug` **including slugs live on the rail** (`us-company-data`, `screenshot-url`, `url-to-text`). A client with a real need does not ask for a slug it just bought.

One machine is walking the catalogue. GOALS.md now says do not rank catalog work off this table until the traffic is attributed, and records what would falsify that. This was about to make several capabilities look like they had 40+ waiting buyers.

## Overnight triage

- **T4.3 (quality-program exit) is met.** On a clean post-deploy window: **5 capabilities under 90%**, down from 30 at program start. The 24h window shows 9, but it still contains pre-fix hours — the clean window is the honest measure. `uk-gazette-notice-search` (vendor outage) has a written reason; `cz-unreliable-vat-payer`, `company-news`, `canadian-company-data` and `tech-stack-detect` do not yet — next session's fixture-hygiene batch.
- **Zombie-suite hypothesis was wrong.** 22 inactive capabilities hold 124 active test suites, which looked like waste. Only 2 actually ran in 7 days, and those 292 runs predate the deactivation. The scheduler already filters them. No action needed — recorded so nobody re-derives it.
- No newly quarantined capabilities; no failing CI on main.

## Stale-work sweep

- **Branch graveyard: 129 → 121.** Triaged the 10 oldest; deleted 9 after verifying content was already on main (all five research docs byte-identical; the payee→counterparty rename already landed; the script one branch modified no longer exists on main; `us-court-search` is deactivated so its fixture restructure is moot; and `feat/retire-solutions-and-web3-assurance` would have deleted solutions, which are alive and earning).
- **Kept:** `test/openapi-com-sandbox-2026-05-06` (`131e0ed`) — 0 of 40 files exist on main. Real unfinished work: an Openapi.com vendor client, tests, a production sweep and two research reports. Vendor commitments are founder-gated and the code is 3.5 months stale, so it stays as the record until someone decides on that vendor.

Deleted, recoverable by sha:

```
a7365cc chore/payee-to-counterparty-rename
bacaeac test/us-court-search-fixture-restructure
097587f chore/window-failed-requests-show-failure-type
06183f6 feat/retire-solutions-and-web3-assurance
d75fe82 research/bundesapi-civic-tech-2026-05-06
d105fe4 research/compass-manz-at-2026-05-06
4093bd6 research/gap8-direct-build-spikes
a4d9f1a research/midrebuild-verify-spikes
78aa040 research/kyckr-evaluation
```

## The shared checkout is still parked — and it cost time again

The main checkout sits on `ops/company-scaffold`, 17 ahead / 64 behind main. All 17 commits' content is already on main; the branch has no unique value. Its uncommitted `CLAUDE.md` is an **older** copy than main's, so committing it would revert three later improvements.

This made me read stale governance at the start of this session — the branch's `DECISION-QUEUE.md` still showed DQ-3 as an open question for Petter when main has had it resolved since 2026-08-16. A prior session lost a whole diagnosis to the same trap (`b21fe4a`).

I cannot fix it: moving the shared checkout back to `main` requires a branch switch in that tree, which is exactly what corrupted it three times and what my rules forbid. **This needs a human to do it once, at a quiet moment, with nothing else running.** Until then every session must read governance via `git show origin/main:` — as this one did.

One orphan to note: `strale-wt-fix` alongside the repo is not a git worktree, just a leftover folder. Left alone.

## Decision queue

No `your_call` items were pending, so nothing matured for auto-execution. Two entries added:

- **DQ-13** (`decided`) — the bundle enablement, with its reversal.
- **DQ-14** (`your_call`) — the four founder-gated items that had been living in handoff prose, one since 2026-08-15 across three handoffs: CourtListener key, reporting the Gazette API outage, a read-only GitHub token for the frontend repo, archiving `wow-core`. None block anything today.

## For the next session

1. **Check E4 for data.** The bundles only became payable today. Kill criterion: zero orders across all four in 14 days.
2. **Attribute the x402 enumerator traffic.** Until that is done the refusal table cannot drive catalog work, which leaves the catalog role without a demand signal on the rail that actually earns. Highest-value measurement job open.
3. **Fixture-hygiene batch** for the four T4.3 survivors without written reasons.
4. **Consider making the row-value-tuple assertion global.** It is currently scoped to block 0092. This defect has now shipped four times in this repo; a lint or a test over every `db.execute` call site would end it. Not done today because it is a larger change than a morning check-in should carry unreviewed.
