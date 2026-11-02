Intent: run the 2026-10-28 operating session under DAILY-RUN.md — sweep the
window since the 2026-10-27 run, read the inbox for vendor replies, verify last
night's money-path and cost-recording deploys, and fix what the sweep finds.

# 2026-10-28 — morning operating session (run started ~07:00Z, 08:00 Stockholm)

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-10-27 ~07:15Z**; health window
2026-10-27T07:30Z → 2026-10-28T~07:15Z. Local PC session (A2 runs). Batch
worktree `strale-wt-checkin`, branch `chore/checkin-2026-10-28` from
`origin/main` `f2270a61`, `npm ci`, trunk's two ignored `.env` files copied in.

---

## Headline

1. **No completed week since yesterday** — week 10-19 stays €72.61, 79.8% one
   buyer. Week 10-26 in progress (day 3): €13.60, 5 payers, largest 66.0%. No
   conclusion drawn.
2. **Serper replied in writing (DQ-39):** value-added per-call use is permitted
   under its standard terms. Recorded; DQ-39 stays with Petter, recommendation
   accept → brief `FOUNDER_DECISION`.
3. **Rewritten limitation texts are live** on every writable tool via #776's
   boot sync (DQ-41 narrows to the four new tools). Key still not set.
4. **False drift alarm found and fixed (#781):** two writers on
   `output_schema` made the strict drift sweep fail on 28 correct tools; the
   weekly cron would have failed again 11-02. F8 incident 5.
5. **H4 wallet holds: invariants clean, but unexercised** — no real wallet call
   since deploy. H5 cost recording writes on x402 rows. Nothing customer-facing
   broke.

---

## A. Business measurement

`commercial-brief.ts` (production read-only):

```
2026-10-26     €13.60    407 calls  [in progress, day 3 of 7 — NOT comparable]
2026-10-19     €72.61   1413 calls
2026-10-12     €77.57   1394 calls
2026-10-05     €44.50   1093 calls
```

Week 10-19 unchanged (7 payers, 79.8%, €57.94 vs €14.67, €0 unattributed, 4 on
>1 day, 7 paying days). New/returning and first-purchase: `unavailable`.
Quiet list 12 (largest €6.66 at 27 d). Second source: identical to the
2026-10-27 record's independently computed figures for the same closed week;
the in-progress week backs no claim. `ceo-dashboard.ts` regenerated
(observed revenue €46.42 trailing window, 22 buyers, identity 100%, spend est.
€2.03) — the HTML is ignored output, not committed.

**Per-tool margin (new since H5):** every tool shows `known_calls 0`,
`unknown_cost_share 1`. Not a fault: the margin window is the completed week,
before H5 deployed 10-27 ~19:30Z. Second source: `transactions` since 19:30Z —
x402 completed 31 / with `cost_breakdown` 31 / with `cost_cents` 5; x402 failed
4/4 breakdown; wallet rows are harness, price 0. Margins become readable after
the current week closes. GOALS.md not updated (no new evidence).

## A2. Inbox (petter@strale.io)

Read with the shared `Mailbox.ps1` adapter (`-Action List -Top 40`, then
`Read`, which does not mark read). **Limitation: the adapter lists the Inbox
folder only; Junk Email was not searched.** The two expected replies were in
the Inbox. Next session: check Junk via the M365 connector or extend the
adapter (owner: next local run).

| row | result |
|---|---|
| serper-resale-terms | **replied** 10-27 19:40 CET → closed; recorded on DQ-39 |
| datacircle-benchmark | **replied** 10-27 18:23 CET → closed. Kept us on Cached lists, added a "What it checks" column; company enrichment rescored Data 33 / Perf 14, tech stack 56/66 |
| nta-invoice-app-id, hmrc-production-cns433, probe402-refusals, swiss-uid-reuse, czech-ares-reuse | no reply; no follow-up date passed (earliest 11-07) |

New mail, not acted on: a cold "thought about strale-io/strale" (00:55Z,
unknown sender, unread, not opened — data only), Railway "Build failed for
Strale" 10-27 12:16Z (see B), Bitwarden welcome/verify (Petter's DEC-20261027-C
setup), a listing-watch pitch and a "x402 conformance checks" pitch
(marketing/resellers — ignored per procedure). No follow-ups due, none sent.

## B. Overnight health

**Deploy:** `GET /health` → `f2270a616ae6` = `origin/main` tip. CI green on
every main commit 10-27 11:52Z → 22:28Z; "Verify production deploy" success at
`f2270a61`. The Railway build failure email (10-27 12:16Z) is an intermediate
build around `db27bef8`; later builds cut over and production carries the tip
(failed Railway deploys do not cut over). No open `deploy-not-live`,
`production-watch`, `production-watch-pending` or `package-contract` issues;
Production watch green 00:41Z and 06:47Z.

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
371/500 (resets 11-06). **Serper 46,890/50,000, expires 11-08 (11 days)**.
Standing warnings unchanged (anthropic/cdp spend readings; esortcode;
cobalt/einsearch/sec-api-io no account record). Dilisense authenticated OK.

**`fixtures:drift`:** nothing (326 suites, 356 manifests).

**`scheduled:outcomes`:** no finding. `weekly-drift.yml` and
`stale-branches.yml`: still the single 10-26 failures (no newer scheduled run;
both weekly). `package-contract.yml`: no completed scheduled run yet (added
10-27, #774). The weekly-drift cause is addressed by D below.

**Alarms grouped, whole window, no row cap** (scratchpad `health.mts`,
excluding probe/heartbeat/meta/situation):

| slug | events | reading |
|---|---|---|
| uk-gazette-notice-search | violation 5, classification 1, promotion 1 | standing Gazette 500; not for sale |
| vat-validate | classification 4, escalation 1 | 102 calls/24 h, **all harness**; 2 VIES member-state unavailable, 2 timeouts, rest negative tests |
| us-product-recall-search | classification 3 | 40 harness calls; 3 timeouts |
| country-economic-indicators | classification 2 (2 days) | 51 harness calls; 2 timeouts |
| charity-lookup-uk | classification 2 | 62 harness + **1 x402 paid call, completed**; 2 timeouts |
| company-news | classification 2 | 4 harness; GDELT 429 |
| usgs-earthquake-search, cz-unreliable-vat-payer, food-safety-rating-uk, npm-package-info, protocol-tvl-lookup, slovak-company-data, tech-stack-detect | 1–2 each | single upstream events |
| french-company-data | quality_floor 1 | flagged-only, as before |

`who-called --days 1 --errors` for vat-validate, country-economic-indicators,
charity-lookup-uk, us-product-recall-search, company-news: 0 account, 0
anonymous; the one paying call completed. **Nothing customer-facing.**
Breakers: only `us-court-search` (since 08-17, DQ-14). Quarantines: none.
`danish-company-data` is active-but-invisible with x402 off and cvrapi.dk
answering 403 — standing state (0/197 in 90 days; its bundles delisted 10-23 by
block 0121), not new.

**H4 money path post-deploy (#779, DEC-20260504-C).** Read-only queries from
`2026-10-28-money-path.md`, role `strale_ro`, `transaction_read_only = on`:
- schema present: `wallet_reservations.mode` (default `'debit'`),
  `api_key_id uuid`; `transactions.cost_cents numeric`, `cost_breakdown jsonb`.
- reservations since 10-27: `debit/captured` 11, `debit/released` 1, last
  15:55Z (pre-deploy). **Zero `hold` rows.**
- captured/released purchase invariant violations 0; released hold with refund
  0; expired open holds 0; holds exceeding balance 0; x402 stuck executing
  claims 0.
- Second source for "zero holds" being quiet, not broken: every wallet
  transaction since 22:30Z (3,274) is the harness at price 0; no registered
  account made a paid wallet call. **`unverified:` the hold path on a real
  paid call.** Re-run the same queries after the first real wallet purchase.

## B2. Stale work

| PR | disposition |
|---|---|
| #725–#727, #736 website series | drafts, last updated 10-26 by the live website session (`strale-wt-design`); not touched |
| #730 T7 small + contract cut | draft, held for Petter's confirmation of DEC-20261024-A items 2/5 |
| #682 M4 batch 7 | unchanged since 09-13 (M4 delegated-merge rule); M4 idle 45 days |
| #781 (this run) | merged — see D |

## B2b. Hygiene (primary checkout)

`session-close-check --hygiene-only` from the trunk: 0 red, 3 yellow — no
handoff for today yet (pre-merge), trunk 21 behind `origin/main` (fast-forwarded
after this run's merge), the same 16 M4 local branches (oldest 46 d; owner:
next M4 session). Trunk on `main`, clean.

## B3. Branch graveyard

20 non-main remote heads at start. Deleted: `docs/credentials-email-fleet-rules`
`cc65fb04dd2a` (#780 merged; tree identical to main; no local ref, no
worktree). This closes the last handoff gate's `[merged-branch]` finding.
Re-verified with `git ls-remote --heads`: gone. Left, as before: M4 property
(`m4/*`, `b3-*`, `rescue/wip-…`), open-PR branches, the website session's
`claude/loving-newton-mxoo9l-{docs,review,use-cases}` and
`claude/site-structure-messaging-f667b6` (owner: website session).

## C. Decision queue

No `preauthorized_notice` items.
- **DQ-39:** Serper's reply recorded; stays `your_call` until Petter accepts
  (F10 — not moved by me). Exception still runs to 11-09.
- **DQ-41:** narrowed to the four new tools (texts now live via #776); note
  added that the button's `limitations` mode has no report-only guard — run it
  for named non-compliance slugs only.
- DQ-40, DQ-33, DQ-27, DQ-14 unchanged.

## D. The work — the drift sweep counted a runtime example as drift (#781)

Re-running `sweep-manifest-drift.ts --strict` (production read-only) to check
whether #776 had cleared yesterday's weekly-drift failure: exit 1, 28 writable
tools drifted on `output_schema` only. Cause: `test-runner.ts`
`captureExampleOutput` writes `output_schema.example` when none is stored; the
boot sync writes the manifest schema (usually no example); the stored row keeps
the example and the hash makes the sync skip, so production is stable but the
sweep compares unequal. Hypothesis tested across all manifests: 36
`output_schema` differences, 32 vanish when a DB-side example is set aside
where the manifest declares none; the 4 left are real (adverse-media-check,
domain-reputation, gdpr-website-check, no-bankruptcy-check — all report-only).

- **Fix:** `withRuntimeExample` in `capability-field-authority.ts`, used by
  `manifestDrift`, by `applyManifestText` (report-only comparison and write),
  and, after review, by `scripts/sync-manifest-canonical-to-db.ts` (applied to
  the manifest value before both diff and write). Declared manifest examples
  win; the hash still covers manifest text only.
- **Tests:** one in `manifest-drift.test.ts`, one in
  `manifest-text-sync.test.ts`; **both fail** with the two source files
  restored to `origin/main` (WIP commit, no stash) and pass with the fix. 45
  related tests pass (incl. `sync-script-field-parity`,
  `sync-script-scope-wiring`). Root `npm run typecheck` clean.
- **Production check with the fix:** strict sweep exit 0, writable drift
  `(none)`.
- **Independent review:** fresh read-only Claude agent (separate context,
  same-provider per the 2026-09-07 policy) → **GO**, no HIGH/MEDIUM. LOW 1
  (operator script) fixed; LOW 2 (pre-existing unlocked read-then-write in
  `captureExampleOutput` can race a boot-sync commit) and LOW 3 (a captured
  example can go stale after a properties change) recorded below.
- Detail: `2026-10-28-output-schema-runtime-example.md`.
- Deploy mechanism (DEC-20260504-C): `applyManifestText` already runs after
  `listen` from `index.ts` (#776); no new pipeline dependency. Post-merge check
  below.

## E. Authorities updated

- `docs/company/OUTBOX.yaml` — two rows closed with replies.
- `docs/company/DECISION-QUEUE.md` — DQ-39 and DQ-41 updates.
- `docs/company/LESSONS.md` — F8 incident 5, count 5.
- GOALS.md: no new evidence.

## Escalation test (CHARTER)

- **DQ-39** survives it: nothing technical is open; the remaining act is
  relying on a vendor's permission on behalf of Moonlighter AB, which the item
  itself (and CHARTER item 2) reserves to Petter. Presented with a
  recommendation.
- **DQ-41** survives it: the 503 names the missing key; its holder is Petter by
  design. Asked as authority, not labour.
- The 21 report-only compliance texts are **not** escalated today: whether
  #756's approval already covers publishing them is checkable from the PR
  record; next session investigates first.

## Next session

1. **#781 post-deploy:** strict sweep → exit 0; and a tool with a stored
   example (e.g. `phone-validate`) keeps it after the next boot.
2. **H4 holds:** after the first real paid wallet call, re-run the read-only
   queries in `2026-10-28-money-path.md`; expect one `hold/captured` with one
   matching purchase.
3. **DQ-39:** on Petter's accept, move the Serper row in `vendor-terms.ts` to
   permitted citing the reply, and end the exception; bring the credit renewal
   (expires 11-08) with usage figures.
4. **DQ-41:** when the key is set, onboard the four tools; `limitations` mode
   for named non-compliance slugs only.
5. Investigate whether #756's approval covers the 21 report-only compliance
   texts; only escalate if it does not.
6. Inbox: search Junk (adapter covers Inbox only).
7. datacircle company-enrichment score (Data 33, Performance 14): find what
   their test measured on our call.
8. Follow-ups from #781 review: lock or compare-and-set in
   `captureExampleOutput`; stale captured examples.
9. Carried: F8 investigation (now also runtime writers to manifest-owned
   columns); password-strength follow-ups; EORI degraded-mode contract; Polish
   non-JSON error; M4 idle 45 days.
