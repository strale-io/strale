Intent: run the 2026-09-11 morning operating session under DAILY-RUN.md —
measure the business, dispose of overnight health and stale work, do the
highest-leverage work against GOALS.md, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked `unverified:`.
The previous morning run was 2026-09-06; there were none on 09-07 to 09-10, so
the health window below is five days, not one.

---

## Headline

1. **Screenshots, PDFs and every other capability that calls our browser
   service directly have failed on every call since 2026-08-26 — 52 of 52, 28
   of them paying customers, none charged — while every monitor said healthy.**
   Cause: on 2026-08-25 a session replaced the production Browserless key with a
   browserless.io cloud key because the new vendor monitor tested the key
   against the cloud account, which production does not use. Restoring the key
   needs a Railway sign-in this machine has lost → DQ-31.
2. **The vendor tower's per-call credential breaker has never worked for any
   vendor.** Its write is refused by Postgres ("could not determine data type of
   parameter $4"). Fixed in this batch, with Browserless deliberately excluded
   from it because Browserless relays target sites' 403s.
3. **Revenue fell for the first time in five completed weeks** (€73.03 →
   €58.77), and all of the fall is the smaller buyers not returning; the largest
   buyer was flat.

---

## A. Business measurement

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
primary checkout (whose `apps/api` metrics code is identical to `origin/main`'s:
`git diff 6d900db5 origin/main -- apps/api/src` touches only a drift script).

```
2026-09-07   €38.97    837 calls  [in progress, day 5 of 7 — not comparable]
2026-08-31   €58.77   1168 calls
2026-08-24   €73.03   1295 calls
2026-08-17   €66.31   1000 calls
2026-08-10   €39.24    620 calls
2026-08-03   €27.38    451 calls
```

`growth()`: **falling**. Last completed week: 10 payers, top share 92.3% (€54.26
vs €4.51), 100% attributed, 2 bought on more than one day, paid on all 7 days;
new/returning still `unavailable`. Dashboard: revenue €49.69 (rolling 7d),
buyers 28 (lower bound, estimated), identity 100%, spend €1.97.

**Second source — per-payer carry-over through `payerFacts`** (scratchpad
`payer-series.mts`; module calls only, no SQL). Agrees with the pack on every
weekly total and share:

| payer (truncated key) | wk 08-24 | wk 08-31 | wk 09-07 (partial) |
|---|---|---|---|
| `x402:v1:e9e6…` (largest) | €55.49 | €54.26 | €36.81 |
| `user:v1:e3c6…` (card customer) | €9.09 | — | — |
| `x402:v1:35f8…` | €5.44 | €1.12 | — |
| `x402:v1:6bfc…` | €2.05 | — | — |
| `x402:v1:42a6…` | €0.11 | €3.15 | €0.94 |
| everyone else | €0.85 | €0.24 | €1.22 |

So the €14.26 fall is entirely non-largest: the largest buyer moved −€1.23
(−2%). In the partial week the largest runs ~€8.7/day against ~€7.8/day last
week. `42a6…` is the only non-largest payer seen in three separate weeks
(08-27, 09-06, 09-10; €4.20; first slugs address-geocode, serp-analyze,
iban-to-bank). Card customer last bought 2026-08-28T19:16Z — **14 days silent**.
Two registered accounts bought this week (`user:v1:703c…` on 09-09/10/11 for
€0.12; `user:v1:fa6a…` €0.02) — recorded, not interpreted.

*Instrument gap, still open from 09-06:* the pack's quiet list reports the card
customer as "9d ago" because `quietPayers(lastFull)` asks as of the end of the
last completed week. Real silence is 14 days. Not fixed today (the day went to
the outage); the proposed shape in the 09-06 record stands.

**German — watch closed.** OpenRegister reset; the tower restored
`german-company-data` and the three DE bundles at 2026-09-06T23:46:08Z
(`vendor_restoration` / `vendor_solution_restoration` events), verified on the
rail: capability and all three solutions `x402_enabled = true`. `who-called.ts
--slug german-company-data --days 6 --errors`: 1 x402 call (09-10, a correct
"No German company with HRB 4964" refusal), 3 harness. The largest buyer did not
return to German; the 08-27 trigger did not fire; verdict stands. 498/500
credits.

## B. Overnight health (five days)

`npm run vendor:status`: **ACTION NEEDED**, no CRITICAL. Warnings are the known
residue: anthropic/cdp spend unread, esortcode no balance endpoint, and the three
DQ-30 accounts. OpenRegister 498/500. Browserless "healthy; 998/1000" — which is
the finding below.

### The Browserless outage — main finding

Found by aggregating five days of `health_monitor_events` by type and
capability (scratchpad `health-agg.mts`): `invariant_violation` "ALGORITHMIC
CORRECTNESS VIOLATION: screenshot-url — correctness 0%" ×28 and the same for
`html-to-pdf` ×29, classification `test_infrastructure`, error "Browserless
screenshot/PDF returned HTTP 403: Unauthorized".

Evidence (all read-only; receipt
`archive/receipts/2026-09-11-audit-browserless-credential-outage.json`):

- First 403: screenshot-url 2026-08-26T13:50:15Z, html-to-pdf 16:04:16Z. Last
  success 2026-08-25 12:50 / 15:04. Since: **52 of 52** direct calls failed, and
  the distinct failure strings are exactly three, all "HTTP 403: Unauthorized".
- Who: `who-called.ts` + `externalCustomers()` split — **28 paid attempts
  failed**: screenshot-url 20 (x402), web-extract 4 (told "the site blocks
  automated access… not a Strale issue"), company-enrich 4 ("could not access
  website"). html-to-pdf, landing-page-roast, estonian-company-data: harness
  only. None charged (failed executions do not settle).
- Before 2026-08-25T16:00Z, 75 days: **zero** 401/403 on direct callers; 172 and
  169 completions on screenshot-url / html-to-pdf in the two weeks before.
- Production is the self-hosted v1 container: pre-change failures carry Joi
  messages (`"options.format" must be one of …`), the pinned
  `browserless/chrome:1.61.1` validator (`railway-config.md`). The cloud
  account's own counter moved **2 of 1000 units** since 2026-08-25T22:47Z while
  52 calls were attempted.
- The change: `handoff/_general/from-code/2026-08-25-vendor-control-tower-and-german-company-data.md`
  line 8 — "Railway had a stale 19-character Browserless credential while root
  `.env` held the verified 49-character key. Replaced only that existing
  environment variable." The 19-character value was the container's token.
- `vendor_capability_suspensions` for browserless after 2026-08-25: **0**, though
  each of the 52 refusals reached `recordVendorHttpFailure` (see D).
- `unverified:` the Railway values themselves (`BROWSERLESS_URL`, the chromium
  service's `TOKEN`). `railway whoami` → "Unauthorized. Please run `railway
  login` again." The conclusion rests on the three independent observations
  above, not on reading the variables.

**Why it stayed hidden for 16 days** — LESSONS.md F7 incident 10: the
reachability probe accepts 401/403 by design; the account check read the wrong
account; the per-call breaker could not write (F5 incident 10); and the 09-06
morning sweep sampled the latest 25 health events, where six alarms a day never
ranked. DAILY-RUN.md step B now says to group alarms by capability over the
whole window.

**Escalation test** (CHARTER): *could inspection, measurement, experiment or an
existing decision resolve this?* The *what* — yes, and it is resolved: restore
the container's token. The *execution* is blocked only by access (a signed-out
Railway CLI; authenticating is the founder's). → `AUTHORIZATION_UNAVAILABLE`,
DQ-31. Order matters: this batch's monitor change must deploy first, or the
restored token will fail the cloud account check and the tower will suspend
seven capabilities exactly as on 2026-08-25.

### Everything else overnight

- **Breakers:** one open, `us-court-search` (DQ-14 item 1), unchanged.
- **web3 solution revivals: the 09-10 fix held.** The four solutions are still
  inactive; their "BROKEN SOLUTION" / orphan-step alarms stopped at
  2026-09-10T14:18Z, before the 16:11Z deactivation, and none since.
- **`canadian-company-data`**: `regression_detected` ×60 in five days, same
  cause as 09-06 (health fixture points at a corporation number the registry
  does not have). Harness only. Still needs a fixture write → unchanged,
  authority held and execution unavailable.
- **`sec-api-io` probe**: 138 "not responding" assessments, 46 marked
  alert-sent, in five days, against a service that answers an unauthenticated
  `GET /` with 200 (curl, this morning). **Fixed in this batch** (D).
- **`cz-unreliable-vat-payer`**: correctness 67–83% on "fetch failed" upstream
  errors; off the paid rail. Observation only — why an upstream `fetch failed`
  still counts in the correctness invariant is a lead, not investigated.
- **Standing alerts, unchanged:** null profile fields on five CZ capabilities,
  the lying-breaker shape on `danish-company-data`, bad known-answer fixtures on
  `adverse-media-check`, the Gazette's HTTP 500.
- **CI on `main` was red** at `b3d763dc` (#643): one test,
  `caller-url-read-limits.test.ts` › `social-post-generate`, timed out at 10s on
  a docs-only merge; the previous run was green. Re-ran the failed job: **green**.
  Flake, not a defect.

## B2. Stale work

- **Deployed = `main`:** `GET /health` → `b3d763dc9f8d` = `origin/main` tip
  before this batch.
- **PR #644** (T6 M3 batch 5) — owned by the live T6 session (locked worktree,
  updated 06:14Z today). Not touched.
- **Branches deleted, both halves, local first then remote, verified with
  `git ls-remote`:** `chore/agent-entry-setup-20260906` `c75f6266` (#597
  merged), `docs/m3-vendor-state-model-batch2` `1e784da7` (#632 merged),
  `docs/m2-g9-closure` `cab0776e` (#627 merged),
  `docs/m2-closing-review-round-14` `cc901968` (#611 closed unmerged by the G9
  orchestrator; round 14 recorded through #612).
- **Kept:** `pr-555-review`, `pr-563-check` — recorded in
  `scripts/handoff/baseline.json` and therefore founder-held. Their stated
  deadline ("before G9 closes") has passed: G9 closed in #627 on 09-10.
  `unverified:` whether #627 settled the three decision records that differed.
  Owner: the next M2/M3 docs session.
- **Other sessions' checkouts, untouched:** `.claude/worktrees/agent-a30a04d0…`
  (`fix/coverage-matrix-stale-providers`) and `agent-aaf00c88…` (`b5fix`), both
  locked.

## B2b. Local hygiene

`session-close-check --hygiene-only` from the primary checkout: 0 red, 1 yellow
(no 2026-09-11 handoff in the trunk yet — this file resolves it).

## C. Decision queue

No `preauthorized_notice` matured. **DQ-31 added** (the Browserless key,
`AUTHORIZATION_UNAVAILABLE`). **DQ-27 annotated**, not moved: its premise (no
write route) was superseded on 09-06 by the parked write credential, the two
settings are still unapplied (re-measured: `page-speed-test` 8000 ms,
`company-news` null), and both are now off the paid rail; the ask narrows to a
yes for an attended session. **DQ-14** unchanged.

## D. The work — the vendor tower's credential evidence

Branch `chore/checkin-2026-09-11`. Four changes.

1. **`recordVendorHttpFailure` could never write.** The credential fingerprint
   sat alone in `WHEN ${blockedFingerprint} IS NOT NULL`; Postgres cannot type
   it and refuses the statement for every provider — reproduced on a throwaway
   Postgres 16 (schema via `drizzle-kit push` + all 55 startup blocks, as CI's
   integration lane) for browserless 403, openregister 402, serper 401.
   `meteredVendorFetch` catches and logs, so the customer call carried on and no
   live 401/402/403 has ever been recorded since #403 (2026-08-25). Cast added.
   While in there, per review: a blocking status already on the row now wins
   over later evidence (a late 429 no longer un-blocks; a 401 no longer swaps
   `exhausted` for `auth_error`), and suspension uses the status the row
   actually holds (`RETURNING`).
   *Blast radius, measured before shipping:* over 75 days and 1,233 calls to
   the 12 capabilities on Serper, Dilisense, OpenRegister and eSortcode, the
   only vendor refusals were OpenRegister's 127 genuine 402s on 2026-08-24 —
   exactly what the breaker is for. Zero 401/403/429 from the other three.
   Operator path if a Serper/Dilisense key is latched: a changed key value
   re-arms within the hour (existing behaviour, DAILY-RUN step B).
2. **Browserless is excluded from per-call classification**
   (`browserlessFetch` passes `classifyHttpFailures = false`). Why, measured:
   with a valid token, production recorded **42** "site blocks automated access
   (HTTP 403 Forbidden)" failures 2026-07-14..08-13 — Browserless relays the
   target's status. A first draft put Browserless on the re-arm list; it would
   have withdrawn six capabilities, permanently, on one customer's bot-protected
   URL. Withdrawn before commit.
3. **The Browserless balance adapter runs only for a browserless.io
   `BROWSERLESS_URL`.** Otherwise `recordBalanceNotApplicable` clears the
   allowance figures and reads live evidence: `healthy` if a render succeeded
   (`last_success_at`) in 24h, else `unknown` — a morning WARNING carrying the
   reason. Never lifts a block, never restores. This is also what makes DQ-31
   safe to execute.
4. **`sec-api-io` probe accepts its real unauthenticated 200.**
   And the vendor report prints each account's reason under its line.

Tests (receipt `archive/receipts/2026-09-11-test-run-vendor-breaker-mutations.json`):
40/40 across the four vendor files + the probe test; **7 planted failures, 7
caught**, including the production statement as it stood. `tsc --noEmit` clean.
Neighbouring suites (web-provider, screenshot-url, html-to-pdf, chromium-health,
vendor-morning-status): 143 passed.

*Expected production effect after deploy:* within the hour, Browserless's row
reads the self-hosted reason with no allowance figures; `last_success_at` is the
09-11 05:18Z cloud reading, so it flips to `unknown` about 24h later unless a
render succeeds. Nothing is suspended by this change. Serper/Dilisense/
OpenRegister/eSortcode refusals will now be recorded and act.

**Independent review** — a fresh read-only same-provider agent (DEC-20260910-A
policy; no Codex backlog row). **PASS, no blockers.** It read all 37 `sql`
templates in the tower and found no other untyped bind. Three should-fix items,
all taken: (1) measure the four vendors' historical refusals and state the
operator path — done above; (2) Browserless would still read `healthy` with
nothing measuring it — hence the live-evidence rule in change 3; (3) a comment
in `chromium-health.ts` became false — rewritten. Nits taken: DEC-7 is the
*managed* product, so the citation now points at `railway-config.md` and says
production no longer matches DEC-7; the "Unauthorized" body claim is now in the
receipt; the integration-test comment no longer overstates production evidence;
the race above. Nit 6 (restore of `last_checked_at` in the Serper test) judged
safe by the reviewer.

## E. Authorities updated

- `docs/company/GOALS.md` — two entries at the head of "what we currently know".
- `docs/company/LESSONS.md` — F7 → 10 (incident 10, incident 8's arm, which it
  predates); F5 → 10 (incident 10, mock-rendered SQL), with rough step-2
  population figures for the open investigation.
- `docs/company/DAILY-RUN.md` — step B: group alarms, never sample them.
- `docs/company/DECISION-QUEUE.md` — DQ-31 added, DQ-27 annotated.

## Leads, not acted on

- **`humanizeBrowserlessStatus` 403 → "not a Strale issue".** During the outage
  four paying web-extract calls were told their target blocks bots while our key
  was refused, and the taxonomy classifies that string `caller_input`, which
  excuses it from the floor. Needs a way to tell the container's refusal from a
  relayed one ("Unauthorized" body is the candidate) before any wording change.
- **A zero-cost token check for the v1 container** (an authenticated endpoint
  that renders nothing) — verify from inside Railway first.
- **DEC-7 vs production.** DEC-7 says managed Browserless.io; production runs a
  self-hosted Browserless image. A decision record owes reconciling.
- `vendor_accounts.display_name` still says "Browserless Cloud".
- `cz-unreliable-vat-payer`'s correctness invariant counting `fetch failed`.

## Next action

1. **After merge + deploy:** confirm `GET /health` = merge commit, then read the
   browserless `vendor_accounts` row for the self-hosted reason and null units.
2. **DQ-31** the moment the Railway sign-in exists: restore the token, redeploy,
   render one screenshot and one PDF, record it.
3. The quiet-payer trailing read (09-06 item 2), still open.
4. Structured refusal candidates for registry name paths (09-06 item 3).
