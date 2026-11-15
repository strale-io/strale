Intent: run the daily operating session under DAILY-RUN.md (scheduled morning run, started about 08:05 Swedish time on Sunday 2026-11-15; first daily run since 2026-11-07): measure the business, sweep the inbox, health and stale work, and record what changed.

# 2026-11-15 operating session

Proactivity level 5. Batch worktree `strale-wt-checkin-1115` on `chore/checkin-2026-11-15` from `origin/main` 842ca71a (= production `/health` commit 842ca71a5176). `strale-wt-checkin` (and `-1031`, `-1101`) are unregistered remnants with no `.git`, untouched; a dated path was used instead. Root `.env` and `apps/api/.env` copied into the worktree (gitignored) for read-only scripts. **Nothing written to production; no email sent** (the scheduled task forbids contacting vendors as the company; the Microsoft 365 connector was used for search and read only).

The Strale master session (checkpoint `2026-11-14-strale-master-checkpoint-gmail.md`, hourly) is live on account gmail and owns the robustness and x402-watch work; this run did not touch its lanes.

## Headline

1. **Revenue fell for the second completed week, and the fall is the largest buyer calling less, not failing more.** Commercial pack (about 07:10Z): week 11-02 €92.25 (16 payers) after €175.27; week 11-09 at day 7 €55.77 (16 payers), so it closes near €56–60. Largest payer 89.4% last week (€82.51 vs €9.74), 81.5% this week (€45.43 vs €10.34).
   - Second source (read-only scratch query, top payer `e9e672ef71…`, completed calls by Stockholm day): week 11-02 sums to €82.46, week 11-09 to €45.58 — matches the pack within the day-boundary difference. Daily spend: €12–18 on 11-03…11-06, €8.50 on 11-07/08, €4.37–€10.03 since 11-09.
   - Everyone else: about €10 a week, flat for three weeks. 3 payers besides the largest bought on more than one day last week (pack line 7).
   - Quiet payers 20 (floor), largest €6.66 at 45 days; 16 a week ago.
   - A "paying customer has gone quiet (96.2h)" alert fired 2026-11-13 06:48Z (someone who paid on 6 of 14 days); not identified further this run.

2. **The largest buyer's weather refusals are its own empty requests (correct refusals, not charged).** `who-called --failing --days 7`: `weather-lookup` x402 99 failed, 79 of them `'city' (location name) or 'latitude'/'longitude' is required.` Read-only scratch query: all 79 from the one top payer, 77 with input `{}` and 2 with an unsupported `place` key, from 2026-11-10 05:54Z on (before then one such call in 30 days, on 10-23). Calls come in pairs seconds apart (a retry after the refusal). Same payer sends `{}` to `fear-greed-index` regularly, which takes no input. No commit between 11-08 12:00Z and 11-10 06:00Z touched x402 input parsing (git log: #979–#986, onboarding, social, htmlToText, image-to-text). The same payer completed 31–64 weather calls a day throughout, so the route works. Classified as caller-side omission; refusals settle nothing (verify → input check → settle). Possible small product follow-up: accept `place` as an alias for `city` (2 calls/week). Not done today.
   - Rest of the weather failures: 17 place-name misses (e.g. "Lagos Nigeria", "Hyderabad India" — country without a comma; "Luxembourg City"; Nigerian towns the geocoder lacks), 4 timeouts. The 11-07 comma fix holds: no "London, UK"-style failure for places the geocoder knows (owed post-deploy check from 11-07, closed).

3. **Swiss UID register says yes (DQ-40's last open part).** Reply 2026-11-13 17:02 CET, ticket 394827, head of UID at the Federal Statistical Office: governing terms are the published dataset's (OPEN-BY); "We therefore confirm that your use is permitted." OUTBOX row closed; DQ-40 updated. Recording it as a vendor permission needs `accepted_by: petter` (type `VendorPermission` in `apps/api/src/lib/vendor-terms.ts`; DQ-39 pattern), so it goes to Petter as an authorization request. On acceptance: archive the reply under `docs/operations/vendor-permissions/`, add UID (vat-validate Swiss path, host `www.uid-wse.admin.ch`) and Zefix (`swiss-company-data`, host `www.zefix.admin.ch`, Petter accepted its terms 2026-03-20) records in one PR; `vendor-terms.test.ts` now follows imports into helpers (`sharedImports`), so the old "shared client refused as written" note in DQ-40 may no longer apply — run it to get the exact caller lists. Then portfolio 1.12.

4. **A customer asked us to delete their account and pasted their live API key in the email.** 2026-11-15 03:28 CET, from the sender's company domain, subject "Shut down API": an early key holder no longer needs it and asks for deletion of the key and any payment details. Read-only check by key prefix (first 16 characters, not recorded here): one `users` row, email domain matches the sender, created 2026-09-09, 10 calls, last 2026-09-15, wallet 182 cents (below the 200-cent signup credit; whether any top-up happened is `unverified:`), no extra `api_keys`. The full key now sits in a mailbox, so treat it as exposed. The account-closure path exists: `DELETE /v1/auth/me` (`apps/api/src/routes/auth.ts`, plan in `apps/api/src/lib/account-closure.ts`) revokes and anonymises in one transaction and returns the itemised summary. Closing it for them is a production write; replying is writing to a customer (Petter's). Raised to Petter as an authorization request. Do not copy the key anywhere.

## A2 inbox (read-only; nothing sent)

All mail since 2026-11-07 (25 newest of the window) plus Junk Email newest 20.
- `swiss-uid-reuse`: answered, closed (above).
- `datacircle-benchmark` (Junk, 11-14 17:32 CET): tech-stack re-run found technologies on 19 of 20 sites and is now on their tech-stack list; registry lookups added to their business-verification list. They ask for €1.15 of credits on their account to re-run. Recorded on the row; needs a production write (credit grant, inside the €50/week envelope) and a reply from the inbox routine. Owner: next session with a write grant, or Petter. Not in the brief as a decision.
- `probe402-refusals`: 11-12 message is their index announcement, not an answer; awaiting until 11-20.
- `hmrc-production-cns433`: no reply; `follow_up_by` 11-13 passed after two unanswered chases → to Petter per the procedure (record only; low value this week, UK VAT/EORI stay blocked).
- New, ignored as marketing/sales: Coinstancy (×3 paid placement), Privi ($29/month), HIVE402 and OpenSouk listings, PayCensus, Tolca (Québec checks), ESPY, payagentic, aurelmark sanctions feed, Agensi, route-watch offer, Global Database, a Strale.org domain seller, an onboarding-pilot pitch, "Compliance workflows" follow-up, a Brazil alpha-CNPJ "paid pilot" from an AI agent (the alpha-numeric CNPJ point itself may be worth a product check: `brazilian-company-data` validates `^\d{14}$`; `unverified:` whether Receita has started issuing them).
- Ours: NTA maintenance notice for 12 Dec (Japan corporate-number API down that day; informational), npm publish notices for strale-cli 0.1.0 and strale-ai-sdk 0.1.0 on 11-12 (another session's releases), budget and drift alerts, x402 settlement-drop CRITICAL of 11-12 (the master's R3 work, fixed by #1060).
- Drafts in OUTBOX unchanged (6); no send path in this run.

## Health

- Production on 842ca71a = origin/main. Main CI green on 842ca71a; Production watch green.
- Issues: `deploy-not-live` none; `package-contract` none; `production-watch-pending` none; `production-watch` #856 `ingest-ee-directors` (deliberate until RIK answers).
- Vendor tower: ACTION NEEDED, all standing: eSortcode 403 with `uk-cop-check` suspended; Anthropic and CDP spend readings missing; cobalt-intelligence, einsearch, sec-api-io without account records. Serper healthy 48,947/50,000; OpenRegister 499/500.
- `fixtures:drift`: 2 suites (`webhook-test-payload`, `sql-generate`), both failing on the paid-capability policy refusal (`refuses invocation from context kind 'internal_test'`), not on their fixture; the alert emails say the same (`policy_refusal (2)`). Correct refusal; rewriting the fixture would not make them pass. Not actioned.
- `scheduled:outcomes`: weekly-drift 3 consecutive failed scheduled runs (last green 2026-10-19). 11-09 run: robots sweep lists 5 DISALLOWED, all not in the public catalogue; container-track's six carrier sites are "unverified from this runner". The failing step is the summary step that aggregates sub-step exits; which sub-step returned non-zero was not determined (`unverified:`). Owner: Strale master (checkpoint: weekly-drift run Mon 16 Nov, T3 signal 4 / PLAN B-2).
- Paying failures (7 days, non-harness only, error strings read): weather as above; `dns-lookup` 19 x402 no-records (caller domains); `domain-age-check` 12 x402 now correct refusals (.eu, .im — the 11-07 "temporarily unreachable" mask is gone); `tech-stack-detect` 6 anti-bot pages; `customs-duty-lookup` 5 x402 (4 no tariff rows for CN 9405 41, 1 missing origin) — yesterday's open question about its permitted path is unchanged; `wallet-balance-lookup` 4 public-RPC 403s (standing); `ssl-check` 3 "temporarily unreachable" (sanitiser mask); `screenshot-url` 7 Browserless 400s (timeouts, page crash); ToS-blocked sources (LinkedIn, Facebook, Reddit) and robots stops — correct refusals. Harness failures are negative tests as usual.

## Stale work

- Open PRs: #730 draft only (T7 small; waits on Petter's DEC-20261024-A items 2 and 5, bus ask 6876167899). The 11-07 drafts #950, #905, #682 are no longer open.
- Local branch `chore/checkin-2026-11-14` points at 5b05ccc6, an ancestor of origin/main, no PR, no worktree: an aborted start of a 11-14 run with no commits. Safe to delete; not deleted here (last run's classifier refused branch deletion; not worked around). Remote `origin/chore/checkin-2026-11-06` (#952 merged) still exists — same.
- B2b hygiene (from the trunk, fast-forwarded to origin/main, tree guard clean): 0 red, 2 yellow — today's handoff (this file) and 19 stale local branches, all baseline-protected (`b3-*`, `b7-fix-work`, `design/site-polish` with a live worktree, etc.).
- B3 graveyard: not re-triaged; unchanged since 11-07 (baseline `m4/*`, `b3-*`, `rescue/*` plus the merged branches above).

## Decisions (C/E)

- Decision queue: DQ-40 updated (above), stays `your_call` until Petter accepts. Nothing matured; nothing new raised in the file.
- GOALS.md, LESSONS.md unchanged: no incident this run belongs to a tracked family (the weather refusals are a caller pattern, checked against the deploy history before classifying, which is the F1 discipline working).
- `budget-ledger` recurring row is also due (last 2026-11-05) and was not run; spend estimate from the dashboard is €2.88 for the window.
- Dashboard regenerated (`docs/company/ceo-dashboard.html`): revenue observed €60.18, 32 buyers, identity 100%, spend estimate €2.88.

## Next session

1. If Petter accepts the Swiss UID permission: archive the reply, add UID + Zefix vendor-terms records, close DQ-40, unblock portfolio 1.12.
2. If Petter approves closing the requesting customer's account: run the account-closure path for that account and have the inbox routine (or Petter) reply that it is closed and that the key in their email no longer works.
3. Credit €1.15 to the benchmark account (production write) and reply; or ask Petter to do the reply.
4. HMRC: Petter's call whether to phone or keep waiting.
5. Weather: optional `place` alias and "City Country" (no comma) qualifier, with a replay of this week's misses.
6. budget-ledger recurring run.
7. Delete `chore/checkin-2026-11-14` (local) and `chore/checkin-2026-11-06` (remote) when a session can.
