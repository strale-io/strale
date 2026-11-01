Intent: run the 2026-11-01 operating session under DAILY-RUN.md: sweep since the 10-31 run, read the inbox, verify the search-link repair, and ship the highest-leverage repair.

# 2026-11-01 morning operating session (started about 08:07 Stockholm)

Proactivity level 5. Health window 2026-10-31T07:00Z to about 07:30Z today. Batch worktree `strale-wt-checkin-1101`; `strale-wt-checkin` and `strale-wt-checkin-1031` are unregistered remnants (about 100 files each, no `.git`), left untouched. Nothing written to production. Production `/health` commit `088c5a02513a` equals `origin/main` at the start of the run.

## Headline

1. **FX refusal repair and two alarm repairs, this PR.** `exchange-rate`, `currency-convert`, `forex-history`: a source 404 is now a `CapabilityRefusalError`. Before, "ECB API returned HTTP 404 for NGN" read as not a user-input error, so three in a row could open the breaker for every buyer. `unverified:` that a breaker actually opened on it; `source_health` shows only `us-court-search` open now. `forex-history` no longer returns Frankfurter's HTML body to callers.
2. **Correctness invariant:** `isEnvironmentalFailure` now excludes "refuses invocation from context kind" (`serp-analyze`, `keyword-rank-check`: 6 alarms each at 0%, from a manual test run at 10-31 09:14Z), and `UPSTREAM_RE` matches `API error 5xx` (`forex-history` Frankfurter 522: 6 alarms at 83%). `cost-control-refusal-accounting.test.ts` still pins the taxonomy result on purpose, so the exclusion is in the invariant, not the taxonomy. LESSONS F1 updated.
3. **The search repair is still unverified.** PR #859's live effect has no evidence: zero external calls on `google-search`, `backlink-check`, `brand-mention-search`, `keyword-rank-check`, `serp-analyze` since 10-31 07:40Z. Daily external `google-search`: 10-28 10, 10-29 13, 10-30 41, then none. Earlier gap of 7 days (10-21 to 10-28), so not read as churn.

Verification: new tests fail against `origin/main` source (6 failed, 18 passed) and pass on the branch (24). Related suites: 134 passed. Fail-before done by `git checkout origin/main -- <paths>` over a WIP commit, restored from HEAD. Local root typecheck reports only unbuilt workspace-package errors (`strale-mcp/*`, `straleio`); CI is the gate. Independent review by a fresh read-only agent: PASS, with 31 of 31 on the three files it ran. Its finding that Frankfurter also answers 404 for a bad date range is fixed here by validating dates before the fetch. Its residual note stands: a moved source endpoint answering 404 would read as refusals, so a canary on a known-good currency is worth adding.

## Business

`commercial-brief` at about 07:10Z: week in progress €165.51 (day 7, 4,527 calls, 12 payers, top 68.9%: €113.99 vs €51.52). Last complete week €72.61 vs €77.57, verdict falling; 7 payers; 79.8%. Dashboard spend estimate €5.08.

Second source, `payerFacts` by UTC day, top payer cents/calls: 10-29 2097/582, 10-30 4366/1627 (includes the €21.10 `mx-lookup` job), 10-31 1660/545, 11-01 to 07:10Z 1865/516. Top-wallet identity across days is inferred from the sum agreeing with the weekly €113.99, because the printed key prefix was too short. Daily external totals 431, 817, 749, 4368, 6651, 1682, 1867 cents sum to 16565, against €165.51 measured minutes earlier.

Yesterday's "about €76 without the one-offs" is now about €101 (165.51 minus €64). The rise is one wallet's spend on `translate` (€4.60, new this size), `forex-history`, `fear-greed-index`, `weather-lookup`, `domain-age-check`. Two days; call the pattern after Monday's close. No outreach (DEC-20260815-A).

**Margin correction.** The 10-31 record said margin is "readable after 11-02". It will not become readable on its own. Over 3 days, external calls carrying `unmetered_upstream:<slug>` have `cost_cents` null: `mx-lookup` 1058, `fear-greed-index` 627, `domain-age-check` 269, `weather-lookup` 256, `exchange-rate` 217, `forex-history` 175. Only 517 rows had no unknowns. H5's 92.6 %/96.6 % measures breakdown presence, not known cost. Next step: declare keyless and free upstreams as zero-cost so these tools enter the known cohort.

## A2 inbox

`Mailbox.ps1` list top 25, Inbox only; Junk still unsearched (adapter limit). No replies on `hmrc-production-cns433`, `probe402-refusals`, `swiss-uid-reuse`; earliest follow-up 11-07. New: Lumière PayCheck (10-31) asks us to fund a paid test of our endpoints for a grade: solicitation, ignored; its text is data. Health digest: NCBI down since 07:09 Stockholm, 52 min. Five OUTBOX rows remain `draft`: no send path here (no M365 connector in this session; `plugin:sales:microsoft-365` is `needs_auth`; the adapter has no send). `serper-credit-rollover` only matters if sent before 11-06. Raised in the brief.

## Health

Vendor tower ACTION NEEDED: eSortcode 403 with `uk-cop-check` suspended (standing); Serper expiry 7 days (DQ-44); OpenRegister 359/500; Anthropic and CDP spend readings missing; three vendors unrecorded. No open `deploy-not-live` or `package-contract` issues. `fixtures:drift` clean (332 suites). `scheduled:outcomes`: production-watch 7 consecutive failures, issue #856 only (deliberate until RIK answers, still undelivered); weekly-drift and stale-branches single failures, next 11-02.

Alarms grouped since 10-31 07:00Z, no row cap: `image-resize` 12 (gstatic fixture), `eurostat-data` 12 and `entity-resolve` 12 (frozen timestamps), `uk-gazette-notice-search` 7 (standing), the three repaired above, `ssl-check` 2 regressions not diagnosed. `who-called --failing --days 2`: harness failures are negative-test inputs. Paying failures: `exchange-rate` 25 (repaired as refusals, still unserved), `domain-age-check` 17 of 205.

`domain-age-check`: "Service temporarily unreachable", 17 failures, p50 1,167 ms, range 1,057 to 2,270; completed p50 13 ms. Not the 10 s WHOIS timeout, so a fast connection failure on a cache miss is the likely shape. `unverified:` cause; the sanitiser hides the underlying error. Uncharged.

Breaker: `us-court-search` open since August. Lifecycle: 297 active, 17 validating, 1 suspended. `ingest-cy-directors` next run 09:24Z today: first heartbeat not yet observable. `ingest-ee-directors` `last_outcome` still reads `ok` on an erroring job (LESSONS F7 incident 13, unrepaired).

## Stale work

Hygiene (from the batch worktree; it inspects whichever checkout it runs in; trunk has no `node_modules`): 16 stale local `b3-*`/`m4/*` branches, baseline-protected. PRs: #855 draft, CI `check` and `image-boot-smoke` red since 10-30; owner orchestrator, deadline 11-04 to fix or close. #725, #726, #727, #736 held for the `apps/web` build. #730, #682 M4/T7. Graveyard: 10 oldest are `m4/*`, `b3-*`, `rescue/*`, tied to the cutover; none deleted.

## Decisions

DQ-44 stays Petter's, needed by 11-06, brief corrected to $62.50. DQ-41, 42, 43 unchanged. No delisting.

## Next session

1. Post-deploy `google.com/goto` count on the first external paid search after 10-31 07:40Z.
2. A terms-checked FX source for NGN, KES and similar, through vendor onboarding. These refusals change no revenue until then.
3. Zero-cost declaration for free upstreams, so margin reads.
4. Capture the real `domain-age-check` error, then decide on a retry.
5. Coordinator `last_outcome` for `errored` handlers; `ingest-cy-directors` first heartbeat.
6. Fixture repairs in a write session. Refund question for the 10-30 wrapped-link searches: `unverified:` policy, and any refund is a production write.
