Intent: run the daily operating session under DAILY-RUN.md (scheduled morning run, started about 08:00 Swedish time on Tuesday 2026-11-24): measure the business, sweep inbox, health and stale work, fix what the measurements exposed, and record what changed.

# 2026-11-24 operating session

Proactivity level 5. Batch worktree `strale-wt-checkin-20261124` on `chore/checkin-2026-11-24` from `origin/main` 7e621161 (= production `/health` commit 7e621161ddcf). `strale-wt-checkin` is still the unregistered 2026-10-28 remnant; untouched, a dated path used instead. Root `.env` and `apps/api/.env` copied into the worktree (gitignored) for read-only scripts. **Nothing written to production. No email sent** (Microsoft 365 connector used read-only).

## Headline

1. **Week 2026-11-23 so far: €28.65 from 5 payers, 590 calls, day 2 of 7** (commercial pack, 07:08Z). Not comparable; no conclusion drawn.
   - Monday 11-23 UTC by payer (`payerFacts` per UTC day, aggregates only): `user:v1:fa6a0cd5` €20.20 (404 calls), largest payer `x402:v1:e9e672ef` €5.47 (130), `user:v1:20d55ce0` €0.50, `user:v1:e3c68534` €0.38, `user:v1:1cd34d36` €0.04. Sum €26.59.
   - Second source: the "Strale business summary — 2026-11-24" email (previous complete day, UTC boundary) reports €26.59. Agrees to the cent.
2. **The second buyer repeated a bulk day.** `fa6a0cd5`: €30.61 on 11-18, €28.60 on 11-19, €0.75 / €0.87 on 11-21 / 11-22, **€20.20 on 11-23**. Two bulk episodes in six days. Pattern forming, not yet a habit. Its first tool on 11-23 was `uk-companies-house-officers`; per-tool split not taken this run.
3. **Last completed week unchanged** (11-16: €190.35, 8 payers, top share 62.4%); M1 not met. Quiet list 23 payers, largest €6.66 at 54 days. CEO dashboard trailing 7 days €162.41 (different window; consistent).
4. Largest payer quieter: €5.14, €4.04, €11.35, €5.47 on 11-20 to 11-23, €2.04 by 07:00Z today. The "x402 volume down" alert (11-24 02:01Z) is this, read against the per-day table; it still settles daily.

## Defect found and fixed: address lookups refused for 16 minutes

- `who-called --failing --days 2`, non-harness, paying: **`address-geocode` 294 x402 calls failed, every one `Nominatim error: HTTP 629`.** All from 11-23 10:31:56Z to 10:47:35Z, all `payment_method = x402` and **none settled** (`x402_settlement_id` null on all 294; zero payment hashes), so nothing was charged. 21 calls of the same burst completed and settled between 10:30:59Z and 10:31:43Z. The only x402 payer active that day is the largest payer.
- Recovery: production `address-validate` completed at 20:18Z (x402, settled) and harness `address-geocode` completed at 03:29Z and 03:55Z on 11-24. Second source: two different tools and caller classes after the burst.
- **Cause: our throttle.** `nominatimThrottle` (`apps/api/src/capabilities/address-validate.ts`, shared with `address-geocode`) read the last-call time, slept, then wrote it. N concurrent callers all read the same time, slept the same amount and sent together. 30 failures in the last 32 seconds of the burst show more than one per second reached the source. Nominatim's policy is one request per second; HTTP 629 is its block response here (`unverified:` beyond the observed status).
- **Fix (this branch):**
  - Each caller reserves its send slot synchronously before awaiting, so concurrent calls are spaced 1.1 s apart.
  - Monotonic clock (`performance.now()`), read per call.
  - A caller more than 4 s from its slot is refused at once and reserves nothing: `Address lookups are limited to about one per second and the queue is full; retry in N seconds.` (4 s wait + 10 s fetch stays under the 15 s sync ceiling.) It is a retryable `CapabilityRefusalError` and its prefix is registered in `REFUSAL_MESSAGE_PATTERNS`, so it is unbilled and invisible to the breaker and the quality floor. Without that, the next batch would have counted as source failures (LESSONS.md F1 shape).
- Tests: `apps/api/src/capabilities/nominatim-throttle.test.ts`. Discrimination: the spacing test fails against `origin/main`'s throttle (gap 0 ms); the refusal-classification assertions fail with the pattern removed. 8 parallel runs green after the flake fix below. `npm run typecheck` clean (after building `strale-mcp` and the TypeScript SDK in the fresh worktree); `src/capabilities`, `capability-refusal`, `transaction-failure-taxonomy`, circuit-breaker suites pass except two local-only failures that are not this change: `upstream-replay-contract` (Windows `\` in paths) and a `readability-convert` worker-timing test.
- Independent same-provider review, separate read-only context. Round 1 NO-GO: (HIGH) test 1 flaky because the default `now = Date.now` captured the real clock while the test faked `Date`; reproduced once in my own full-suite run. (MEDIUM) the queue-full error was a plain Error, so it would count against the breaker and floor. (MEDIUM) wall-clock step back could refuse all callers. (LOW) 6 s cap + 10 s fetch exceeds 15 s. All four fixed. Round 2 GO, no HIGH or MEDIUM; LOWs accepted: the refusal is recognised by message prefix only (the new test asserts it on the real message), and a queue-full refusal is classed `caller_input` (the intended not-a-source-fault bucket).
- Not done: the buyer is not told in advance to pace lookups; the manifest limitation for both address tools should say "about one lookup per second; concurrent calls are queued up to 4 s". Owner: Strale master (catalogue sync).

## Other paying failures, last 2 days (error strings read)

Small and spread: `url-to-text` 9, `weather-lookup` 9, `uptime-check` 6, `wallet-balance-lookup` 4, and 3 each on a set of tools that look like one caller trying each once with empty or wrong inputs (`api-docs-generate`, `contract-extract`, `env-template-generate`, `social-post-generate`, `job-posting-analyze`, ...). `api-docs-generate`'s 3 are input refusals. Nothing else at defect scale; not broken out further.

## A2 inbox (read-only; nothing sent)

Inbox all folders since 11-23 06:00Z (9 messages) and Junk newest 10.
- No reply on any `awaiting_reply` row. The same two follow-ups stay overdue (`datacircle-benchmark`, `probe402-refusals`, `follow_up_by` 2026-11-20), plus DataCircle's €1.15 credit request. Unchanged ask to Petter.
- Agent Economy Report (11-23): rates `api.strale.io` BB with 8 paying wallets in 14 days, 6 "organic"; offers a free page claim by wallet signature. A signature as the company is not a session's act; noted, no action.
- Own alerts read against data: "A paying customer has gone quiet (19.9h)" 11-23 13:31Z (the largest payer; it paid again on 11-23 and 11-24); "x402 volume down" 11-24 02:01Z (above); data-source digest "2 had outages" (not broken out); fixture-drift warning (same two policy-refusal suites).
- Ignored as sales/marketing: Calmspark follow-up, AgentMarketIndex (×2), an AI receptionist offer.

## Health

- Production 7e621161 = origin/main. #1104 (x402 dedup key, weekly-drift retry, unstorable characters) is live.
- **`weekly-drift` green**: scheduled run 2026-11-23 18:59Z on 7e621161 succeeded, first since 2026-10-19. `scheduled:outcomes`: every scheduled workflow's last cron run succeeded. Second source: `gh run list --workflow weekly-drift.yml`.
- Issues: none open under `deploy-not-live`, `package-contract`, `production-watch-pending`; `production-watch` #856 unchanged (RIK).
- Vendor tower: ACTION NEEDED, unchanged standing items (eSortcode 403 / `uk-cop-check` suspended; Anthropic and CDP spend readings missing; three providers without account records). Serper 48,846/50,000, OpenRegister 450/500.
- `fixtures:drift`: same 2 policy-refusal suites.

## Stale work

- **PR #1105** (Strale master: clean error messages the database cannot store; `url-to-text` PDF limitation): CI green, `CLEAN`, four independent reviews ending GO on head 68faf134. B2 says merge. **`gh pr merge 1105 --squash --match-head-commit` was refused by this session's permission classifier** ("Destructive or Unwanted Actions"). Not worked around. Its body says "Blocker: Petter's go for auto-merge"; nothing in CHARTER.md or the carry-over facts requires that, so the real blocker is session permission. Raised in the brief as an authority request.
- #730 draft, waits on DEC-20261024-A items 2 and 5 (bus ask 6876167899).
- B2b hygiene (trunk): 0 red, 2 yellow: no handoff yet (this file); 22 local branches 14+ days old (`b3-*`, `b7-fix-work`, ...), other sessions' work, not deleted.
- B3: oldest remote branches are still the `m4/*`, `b3-*`, `rescue/*` set waiting on Petter's PR #687 answer. Left.

## Decisions (C/E)

- Decision queue: nothing matured; founder items unchanged.
- GOALS.md: 11-24 read. RECURRING.yaml: `daily-run`, `inbox-and-outbox` set to 2026-11-24.
- **Weekly rows still not run** (`weekly-review`, `weekly-free-callers`, `weekly-listings`, last 2026-11-10, now 14 days): each keeps aggregates in the private campaign workspace this run cannot reach. The commercial pack's D10 funnel was read; numbers stay out of this public file. Left overdue, not marked done.
- Escalation test: the geocoding failure was resolvable by investigation and is fixed here. What goes to Petter is authority only: the #1105 merge, and the two overdue follow-ups with DataCircle's credit.

## Next session

1. Merge this run's PR and #1105 once a session holds merge permission; after deploy, confirm `/health` carries both and that an `address-geocode` refusal of the new kind, if any, is recorded unbilled.
2. Address tools' manifest limitation: pacing (above).
3. Watch `fa6a0cd5`: a third bulk day makes it a recurring customer.
4. The three overdue weekly rows, from a session with the private workspace.
5. Exercise #1100 in production ("TUCOWS INC", "BANK OF AMERICA CORP" as free text) from a key-holding session.
