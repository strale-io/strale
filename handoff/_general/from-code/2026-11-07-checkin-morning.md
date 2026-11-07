Intent: run the daily operating session under DAILY-RUN.md (scheduled morning run, started about 08:00 Stockholm on 2026-11-07): measure the business, sweep health and stale work, and ship the highest-leverage repair inside delegated authority.

# 2026-11-07 operating session

Proactivity level 5. Batch worktree `strale-wt-checkin-1107` on `chore/checkin-2026-11-07` from `origin/main` f494ad76 (= production `/health` commit f494ad764d69). `strale-wt-checkin`, `-1031`, `-1101` remain unregistered remnants (no `.git`), untouched. Nothing written to production. Root `.env` and `apps/api/.env` copied into the worktree (gitignored) for read-only scripts.

## Headline

1. **`weather-lookup` now resolves qualified place names (this PR).** `who-called --failing --days 7`: 602 x402 calls, 538 completed, **64 failed**, of which 57 were `Location "<x>" not found` on inputs like "London, UK", "Southampton, UK", "Hilversum, Netherlands", "Manhattan, New York City". Cause, verified against the live geocoder: Open-Meteo's search matches a bare name only ("London" → 3 hits, "London, UK" → 0). Second source: 30-day window shows the same (x402 854 calls, 88 failed). Weather is the second-largest earner in the commercial pack (€19.25 over the window).
   - Fix: on a miss, split on commas, drop postal codes, look up **only the leading part** (count 10), take the first hit for which **every** later part names its country code (with a small alias map: UK/USA/UAE/Turkey…), country or an admin region (whole-word containment). Otherwise refuse with "places named X exist, but none in Y; pass latitude and longitude". A direct hit is unchanged (one call, first result). At most two upstream calls per request.
   - A first, looser version (try each part as the name, any qualifier) produced a **wrong answer** in the live check: "Twiggs County, Georgia, USA" → Georgia, Alabama; "Tigri, Delhi, India" → a Tigri in Uttar Pradesh. Replaced by the strict rule above before commit; both now refuse. Tests pin it.
   - Population replay (`weather-pop.mts`, every distinct failed paid string from the 7-day window through the new `resolvePlace` against live Open-Meteo): **49 distinct / 57 calls → 13 distinct / 17 calls now resolve**, each to the named place (London GB, Bolu TR, Flint MI, Los Angeles CA, Hilversum NL, Manhattan NY, Upper West Side NY, Bharatpur NP, four Indian/Bangladeshi towns in the named state). The other 40 calls still refuse honestly (geocoder lacks the place or spells it differently, e.g. "Ogbomosho").
   - Revenue effect is small (17 calls × €0.05 ≈ €0.85/week); the value is the largest buyer's failure rate on its second most-used tool (10.6% → about 7.8%).
   - Tests: `weather-lookup.test.ts` 11 tests. **Discrimination:** with the pre-fix executor restored (WIP commit, `git checkout origin/main -- <file>` plus a stub export), 6 of 9 tests failed; restored with `git checkout HEAD -- <file>`.
   - Onboarding protocol (DEC-20260320-B): `validate-capability --slug weather-lookup` 19/19. `smoke-test --slug weather-lookup`: steps 1, 4–11 pass; **step 2 failed only because the smoke test INSERTs into `capability_budget_counters` and this session's DB role is read-only** (refused, nothing written). Live execution verified instead through `getDirectExecutor` against live Open-Meteo: "London, UK" → 51.50853,-0.12574, Europe/London, 7-day forecast; "Stockholm" unchanged. `checkReadiness` script needs DATABASE_URL loaded the way scripts do; not re-run (structural validation covers the same checks). Manifest unchanged: no schema change, output keeps `location` as the caller's string; adding a limitation without the manifest sync would create manifest/DB drift.
   - Deploy dependency: none beyond the normal build (executor auto-registered). Post-deploy check owed: `who-called --slug weather-lookup --days 2 --errors` shows no `"London, UK" not found`-style failures for places the geocoder knows.

2. **Serper renewal verified in production** (yesterday's block 0147, owed check): `vendor:status` reads Serper healthy, 48,997/50,000 remaining, expiry 2027-05-05, no CRITICAL. Closed.

## Business (commercial-brief, about 07:10Z)

- Last complete week (10-26): €175.27, 12 payers, 4,787 calls, largest payer 70.5% (€123.65 vs €51.62). Verdict "rising". 5 payers bought on more than one day; 4 other than the largest.
- Week in progress (11-02, day 6 of 7): **€79.19**, 13 payers, largest **88.5%** (€70.08 vs €9.11). Second source: yesterday's run read €72.21 / 11 payers / 90.4% at 21:11Z on day 5; the overnight +€6.98 splits €4.83 top payer, €2.15 others, consistent with the top payer's €15–18/day habit and two more small payers. Week will close near €85–90, as forecast yesterday.
- Dashboard (untracked output, not committed): revenue observed €114.89, 26 buyers, identity 100%, spend estimate €4.16.
- Quiet payers: 16 (floor), largest €6.66 at 37 days, unchanged.
- Margin still unreadable for the top sellers (unknown-cost share 1 on mx-lookup, weather-lookup, fear-greed-index, domain-age-check, forex-history, exchange-rate). Next step unchanged: declare keyless/free upstreams zero-cost.
- Free funnel: 35 anonymous free IPs in November so far vs 38 in all of October.

## A2 inbox

Read-only through the Microsoft 365 connector (search only; no send tool in this session). All mail since 2026-11-06 21:00Z plus Junk Email newest 15. New since yesterday: two of our own budget alerts (harness test budgets, expected), one Junk "Quotes.daily" spam. No replies on `hmrc-production-cns433`, `datacircle-benchmark`, `probe402-refusals`, `swiss-uid-reuse`. No follow-up due (earliest `swiss-uid-reuse` 2026-11-09 — the next run sends it if still unanswered). Drafts in OUTBOX unchanged: no send path here.

## Health

- Main CI green at f494ad76; "Verify production deploy" success; production on f494ad76.
- Issues: `deploy-not-live` none; `package-contract` none; `production-watch` #856 `ingest-ee-directors` (deliberate until RIK answers).
- Vendor tower: ACTION NEEDED, all standing: eSortcode 403 with `uk-cop-check` suspended; Anthropic and CDP spend readings missing; cobalt-intelligence, einsearch, sec-api-io without account records. Serper healthy (above).
- `fixtures:drift`: clean (335 suites, 359 manifests).
- `scheduled:outcomes`: production-watch 20 consecutive (= #856); weekly-drift 2 consecutive (10-26, 11-02), the robots.txt strict sweep (#747). Of its 3 listed tools, `eu-trademark-search` was delisted yesterday (#959). `container-track` and `customs-duty-lookup` still open (yesterday's next-session item 2; not reached today). Next scheduled weekly-drift is Sunday 2026-11-08 16:50Z; it will fail again on those two unless handled.
- Paying failures (7 days, second-sourced per slug where acted on):
  - `weather-lookup` 64 → fixed above.
  - `exchange-rate` 108 failed (31 timeouts, the rest currencies ECB does not carry: NGN, KWD, KES, BDT, JOD, BHD, AED…); `currency-convert` 36; `forex-history` 19 (Frankfurter 522s plus unpublished pairs). Same pattern as the last three runs; the currency gap needs a terms-checked source.
  - `domain-age-check` 20 of 289 paid (6.9%), all "Service temporarily unreachable" — the error sanitiser's mask, so the underlying cause is `unverified:`. Recurring since 11-01; next session reads the executor's upstream and the unsanitised log.
  - `uk-company-data` 46 (31 account, 15 x402) — ambiguous-name and no-confident-match refusals: correct refusals (registry name search is scored and refused, per policy), not faults.
  - `wallet-balance-lookup` 5 × public RPC 403 on Base/Polygon/OP/Arbitrum — `unverified:` whether rate-limit or block; small.
  - `image-to-text` 4 × Anthropic 400 on base64 payload (`unverified:` caller input vs our encoding, carried from yesterday).
- Harness failures are negative-test inputs as usual.

## Stale work

- Open PRs: #950 draft (do not merge; redesign per its body), #905 draft probe brief, #730 and #682 (M4/T7, held). Nothing else open.
- Yesterday's `chore/checkin-2026-11-06` (#952 MERGED) and `claude/site-structure-messaging-f667b6` (#706 MERGED, not in baseline) still exist locally and on origin. **`git branch -D` / `git push --delete` was refused by this session's permission classifier ("Git Destructive")**; not worked around. Owner: next interactive session or Petter; both are safe to delete (squash-merged).
- B2b hygiene (from the trunk): trunk was on `main` 32 behind → fast-forwarded (`git pull --ff-only`, tree guard clean). 17 stale local branches: `b3-*`, `local-b3-work`, `b7-fix-work` etc. are baseline-protected; `claude/site-structure-messaging-f667b6` as above.
- B3 graveyard: 10 oldest remote branches are `m4/*`, `b3-*`, `rescue/*` (baseline, founder decision) plus the merged branch above. 34 remote refs.

## Decisions (E)

- Decision queue: nothing matured; DQ-40 (Swiss UID) waits on the register's reply; DQ-41 stays `your_call` until Petter closes it. Nothing new raised.
- No delisting, no refunds, no production writes. GOALS.md and LESSONS.md unchanged (the weather defect is a product gap, not a tracked failure family; the smoke test's write attempt was refused by the role, as designed).

## Next session

1. Post-deploy: weather qualified-name failures gone (`who-called --slug weather-lookup --days 2 --errors`).
2. Before Sunday's weekly-drift: `customs-duty-lookup` and `container-track` — read executors, delist what has no permitted path.
3. `domain-age-check` "temporarily unreachable" cause.
4. Delete the two merged branches (local first, then remote).
5. Exchange-rate timeouts and currency-source gap; zero-cost declaration for free upstreams.
6. Inbox: send the `swiss-uid-reuse` follow-up on 2026-11-09 if still unanswered (needs a session with a send path).
