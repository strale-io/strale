Intent: run the daily operating session under DAILY-RUN.md (scheduled morning run, started about 08:05 Swedish time on Tuesday 2026-11-17): measure the business, sweep the inbox, health and stale work, fix what the measurements exposed, and record what changed.

# 2026-11-17 operating session

Proactivity level 5. Batch worktree `strale-wt-checkin-2026-11-17` on `chore/checkin-2026-11-17` from `origin/main` b68d0b26 (= production `/health` commit b68d0b260ae7). `strale-wt-checkin` is still an unregistered remnant with no `.git` (Filename-too-long leftover from 2026-10-28); untouched, a dated path used instead. Root `.env` and `apps/api/.env` copied into the worktree (gitignored) for read-only scripts. **Nothing written to production; no email sent** (Microsoft 365 connector used for search only).

## Headline

1. **Week 11-16 stands at €56.59 after two days, against €62.63 for the whole of last week.** Commercial pack, 07:09Z. 3 payers so far; the largest is €54.40 of it (96.1%). Not comparable with a full week, and the pack draws no conclusion from it.
   - Second source: CEO dashboard, trailing 7 days to about 07:20Z: €110.05, 32 buyers (free and registered callers included; different population), identity 100%. `payerFacts(windowOf(2))`: largest payer €59.72 over the last 48 hours.
   - Last completed week unchanged from yesterday's read: €62.63, 17 payers, third falling week (€175.27 → €92.25 → €62.63), largest payer 81.0%, 4 payers on more than one day.
2. **The rise is two bulk jobs by the largest payer** (read-only drill-down on the metrics module's own population, aggregates only):
   - 76 paid `pricing-page-extract` calls at €0.30 in 24 minutes on 11-16 from 23:25Z (€22.80; 38 distinct inputs, so each page was bought twice; 6 more failed and were not charged). In the 60 days before, this payer bought that tool 8 times.
   - 332 paid `us-company-data` calls at €0.05 in three bursts (11-16 21:03Z, 11-17 04:23–05:13Z; €16.60; 101 and 125 distinct inputs on the two days). In the 60 days before: 22 calls.
   - Their day totals: 11-05 to 11-15 between €4.39 and €12.66; 11-16 €38.99; 11-17 €15.46 by 07:00Z.
   - Reading: the largest payer has moved from sampling two higher-value tools to running lists through them. Two jobs are not a pattern; whether they repeat is the thing to watch.
3. **The US company job exposed a real defect, now fixed in PR #1091 (see "Work done").** 20 of the 352 calls were refused, uncharged; 12 of the 20 were for companies that are in SEC's own list (`ORACLE CORP`, `Oracle`, `BANK OF AMERICA CORP`, `TUCOWS INC`, `Fatpipe Inc`).
4. **The two daily account buyers:** `user:v1:fa…` bought on each of the last three days (€2.88, 70 calls in 48 hours; 12 of the last 14 days); `user:v1:e3…` last bought 11-16 14:28Z (10 of 14 days). No quiet alarm overnight.

## A2 inbox (read-only; nothing sent)

Inbox since 2026-11-16 07:00Z (8 messages) and Junk Email newest 15.
- No reply on any `awaiting_reply` row (`hmrc-production-cns433` past its follow-ups and with Petter; `datacircle-benchmark` and `probe402-refusals` due 11-20).
- Ours: VIES down 77 minutes on 11-16 (about 09:06–10:22Z), recovered on its own. The alert subject says "and failing paying customers' calls"; `who-called --failing --days 1` (window covers the outage) shows no account or x402 `vat-validate` failure with a VIES error, only 3 × country code "AA". `unverified:` which is right; if the alert counts harness calls as paying, its wording is a false signal (F4 candidate) for the Strale master to check; outside-data-sources summary (2 outages); fixture-drift warning (the same two policy-refusal suites); business summary for 11-15 (€11.95, 4 payers).
- Ignored as marketing or sales: a "machine-payment census" notice (paycensus), a Wikipedia-page offer (second note), and in Junk a Chinese model-API reseller. Nothing new from a supplier, register or listing.
- Drafts in OUTBOX unchanged (6); no send path in this run.

## Health

- Production on b68d0b26 = origin/main at the start of the run (CI, Coverage matrix and Verify production deploy green); on ea59a50b after #1091.
- Issues: `deploy-not-live` none; `package-contract` none; `production-watch-pending` none; `production-watch` #856 `ingest-ee-directors` (the Strale master's handoff of today checks its 10:15Z tick after #1089).
- Vendor tower: ACTION NEEDED, all standing and identical to 11-16: eSortcode 403 with `uk-cop-check` suspended; Anthropic and CDP spend readings missing; cobalt-intelligence, einsearch, sec-api-io without account records. Serper healthy 48,931/50,000 (expires 2027-05-05); OpenRegister 499/500.
- `fixtures:drift`: the same 2 suites (`webhook-test-payload`, `sql-generate`), paid-capability policy refusal under `internal_test`; correct refusal, not actioned.
- `scheduled:outcomes`: **weekly-drift failed its fourth consecutive scheduled run** (run 43911137718, 2026-11-16 16:46Z; last green 2026-10-19). Read from the failed log: the source-robots step reports 5 disallowed URLs for 5 capabilities, none of them listed in the public catalogue (`employer-review-summary`, `eu-trademark-search`, `patent-search`, `salary-benchmark`, `trustpilot-score`); manifest drift reports 8 missing with 0 sync-writable differences; facts and vendor-roster steps clean. `unverified:` whether the robots finding is the only failing step. So the workflow is red on findings, not blind: its steps ran. Owner: Strale master (R3). Suggested disposition: the five tools are already off the catalogue, so either record them as accepted-while-unlisted in the check or remove the paths; until then the red hides any new finding.
- Paying failures, last 1 day (`who-called --failing --days 1`, non-harness only, error strings read):
  - `us-company-data` x402 20 (above; 12 fixed by #1091, 6 for Indivior, which is not in SEC's list, 1 where the model could not extract a name from free text, 1 SEC HTTP 400).
  - `weather-lookup` x402 20 of 88: 14 the empty-request refusal (caller-side), 2 timeouts, 3 place forms not yet resolved ("Brooklyn, NY 11206" and "Wildwood, FL 34785" with a ZIP code; "St Cloud, Minnesota"), 1 nonsense place. Some of these calls predate the 03:20Z deploy of #1085/#1088. Follow-up for the weather lane: strip a trailing US ZIP, and "St" for "Saint".
  - `pricing-page-extract` 8: anti-bot challenge pages (4), output too large for one call (2), unreadable robots file (2). Correct refusals.
  - `uk-company-data` 5: 3 names Companies House does not hold, 2 × "Monzo Bank Limited" ambiguous between two exact matches. Correct refusals.
  - `page-speed-test` account 4 of 4 in 1 day (4 of 19 in 7 days): the 30-second hard timeout. Not a regression; a slow-site limit. Possible follow-up: say so in the refusal.
  - `vat-validate` x402 3 (country code "AA"), `address-validate` 2 (timeouts), `dns-lookup`, `robots-txt-parse`, `tech-stack-detect` 1 each (site-side).

## Work done

- **PR #1091, `fix(us-company-data)`: find listed companies SEC files under two tickers or with a state tag.** Reproduced against the live `company_tickers.json` (10,404 rows):
  - the file has one row per ticker, so a registrant with a second listed security (Oracle: ORCL and ORCL-PD) filled the title bucket twice and `resolveByTitle`'s "exactly one candidate" rule read it as ambiguous;
  - several hundred titles carry SEC's registrant annotation (`BANK OF AMERICA CORP /DE/`, `TUCOWS INC /PA/`, `Fatpipe Inc/UT`), so the normalized title never equalled what a caller types.
  Either way the call fell through to full-text filing search, which ranked a different filer first, and the low-confidence gate refused it. The change counts candidates by CIK, indexes titles without the annotation, and classifies a title hit against the title without it. Two different registrants that collide once the annotation is removed are still refused. The new assertions fail against the previous source and pass with the change. Independent same-provider review, round 1 NO-GO: my first version also removed "/ADR", which would have returned SEC's depositary-receipt facility records (F-6 filers, usually at the depositary bank's New York address) as exact matches for the issuer's name; 557 rows. Fixed: /ADR rows are left out of the title index and resolve only by ticker. A second idea, an exact lookup on the model-extracted name for free-text input, was removed from the PR on the same review (its "exact" would be measured against the model's wording) and is a follow-up. Round 2 GO at bf44e133, checked by the reviewer against the live SEC file (198 newly resolving names, each EDGAR record fetched, no wrong-registrant exact match; names that newly collide refuse); its one LOW, a missing test for the index exclusion, was added and fails with the exclusion removed. CI green; merged through the queue as ea59a50b at 08:15Z; `git diff` of the branch tip f4c416d3 against origin/main is empty for the four files; production `/health` reports ea59a50bc61c. With the change, the live SEC file resolves ORACLE CORP, Oracle, BANK OF AMERICA CORP, TUCOWS INC and Fatpipe Inc to their own CIKs (run locally against sec.gov). `unverified:` no production call has exercised it yet; this run holds no working customer key and a paid call is not its to make.
- **Branches.** `origin/chore/checkin-2026-11-06` deleted (tip afef1db9 is an ancestor of PR #952's merged head bbb92d15; no local half). Five superseded Codex branches the cloud sessions could not delete, removed with their tips recorded here: `codex/weather-exact-name-qualifiers-2` 71738fa4, `codex/ee-directors-honest-agent` ffa7769f, `codex/weather-qualifier-followups` 9593fc8a, `codex/weather-place-qualifiers-2` 640b1c1a, `codex/weather-place-qualifiers-3` 8919d9dd. The three merged ones named in today's handoff were already gone.
- Trunk fast-forwarded to origin/main (clean), tree integrity guard run.

## Stale work

- Open PRs: #730 draft only (T7 small; waits on Petter's DEC-20261024-A items 2 and 5, bus ask 6876167899).
- B2b hygiene (trunk): 0 red, 1 yellow, the same 20 local branches untouched 14+ days (`b3-*`, `b7-fix-work`, …); `b7-fix-work` is checked out in an agent worktree; none deleted (other sessions' work).
- Worktrees: `strale-wt-design` (design/site-polish) and `strale-wt-weekly-review` (docs/weekly-revenue-review-nov10, landed on main) belong to other sessions and still make the handoff gate report two extra batch worktrees. Not removed here. Owner: the brand-website session for `-design`; the revenue-review session for `-weekly-review`.
- B3 graveyard: the ten oldest remote branches are the `m4/*` and `b3-*` set (2026-09-12/13) that waits on Petter's answer on which PR #687 branches to keep; left.

## Decisions (C/E)

- Decision queue: nothing matured. DQ-40 closed on 11-16 (Swiss permission accepted). Open founder items unchanged: DQ-48, DQ-41, DQ-33, DQ-27, DQ-14.
- The customer account closure Petter approved on 11-16: the admin closure route is live (unauthenticated call answers 401, checked 07:35Z). Whether the closure itself has been run is not recorded anywhere this run can read; it is a production write and not this run's to make. Owner: Strale master. The confirmation to the customer is still Petter's. **Closed 2026-11-20:** done on 2026-11-16 at 23:47 Swedish time, and Petter told the customer at 23:51; evidence in `handoff/_general/from-code/2026-11-20-account-closure-verified.md`.
- **Weekly due-list rows not run:** `weekly-review`, `weekly-free-callers` and `weekly-listings` (all last run 2026-11-10) fell due today. Each needs the private campaign workspace and a listings pass across nine directories; a thin run recorded as done would be worse than a day's delay. Left overdue for the next interactive session; `RECURRING.yaml` not touched for them.
- GOALS.md and LESSONS.md unchanged. The SEC title miss is a recall defect in a registry matcher that refused rather than guessed, so it is not an F-family incident; the lesson (a public list has one row per security, and carries the publisher's own labels) is in the code comment and the tests.
- Dashboard regenerated (gitignored): revenue observed €110.05, 32 buyers, identity 100%, spend estimate €3.32.

## Next session

1. After #1091 deploys: call `us-company-data` in production for "ORACLE CORP", "Bank of America Corp" and "Tucows Inc" and record the outputs (fetch-and-parse tools are verified in production).
2. Watch whether the largest payer repeats either bulk job; if `pricing-page-extract` becomes regular, look at why each page was bought twice.
3. Run the three overdue weekly rows.
4. Weather lane: trailing ZIP code and "St"/"Saint".
5. weekly-drift: settle the five unlisted robots findings so the workflow can go green.
6. Account closure: run it (Strale master), then Petter's confirmation to the customer. **Closed 2026-11-20:** done on 2026-11-16 at 23:47 Swedish time, and Petter told the customer at 23:51; evidence in `handoff/_general/from-code/2026-11-20-account-closure-verified.md`.
