Intent: run the 2026-10-27 operating session under DAILY-RUN.md — sweep the
window since the 2026-10-26 run, verify yesterday's deploys, and land the
password-strength retention fix promised for 2026-10-28.

# 2026-10-27 — morning operating session (run started ~07:15Z, 08:15 Stockholm)

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-10-26 ~09:00Z**; health window
2026-10-26T09:00Z → 2026-10-27T~07:30Z. Batch worktree `strale-wt-checkin`,
branch `chore/checkin-2026-10-27` from `origin/main` `2cd8cd0b`, `npm ci`,
trunk's two ignored `.env` files copied in.

---

## Headline

1. **No completed week since yesterday** — week 10-19 stays €72.61, 79.8% one
   buyer. Week 10-26 in progress (day 2): €5.03, 4 payers, largest 56.9%. No
   conclusion drawn from it.
2. **Four tools merged yesterday are not live** — `company-status-check`,
   `entity-resolve`, `eurostat-data`, `invoice-counterparty-check` are absent
   from production; so are the 558 rewritten limitation texts. Blocked on the
   onboarding key (`ONBOARDING_RUN_SECRET`), which only Petter holds → **DQ-41**,
   `AUTHORIZATION_UNAVAILABLE`.
3. **CHECK 5 dedup (yesterday's fix) verified in production**: env-only alerts
   fell from 10–12/day to 2 in the ~20 h after deploy, 0 so far on 10-27.
4. **Weekly drift went red on 10-26 for a real reason** (manifest↔DB drift on
   two capabilities, four now), not an infrastructure fault. Explained below;
   the sync is a production write and rides on DQ-41's onboarding path.
5. **password-strength fix**: see D.

---

## A. Business measurement

`commercial-brief.ts` (production read-only):

```
2026-10-26      €5.03    131 calls  [in progress, day 2 of 7 — NOT comparable]
2026-10-19     €72.61   1413 calls
2026-10-12     €77.57   1394 calls
2026-10-05     €44.50   1093 calls
```

Week 10-19 unchanged from yesterday's record (7 payers, 79.8%, €0
unattributed, 4 on >1 day, 7 paying days). New/returning and first-purchase:
`unavailable`. Quiet list 12 (largest €6.66 at 26 d). Second source: identical
to yesterday's independently computed 7261 c for the same closed week; the
in-progress week is not used for any claim. `ceo-dashboard.ts` not re-run: no
closed-week change to carry. GOALS.md not updated (no new evidence).

## B. Overnight health

**Deploy:** `GET /health` → `2cd8cd0b7953` = `origin/main` tip. CI and
Coverage matrix green at `2cd8cd0b`.

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
407/500 (resets 11-06). **Serper 46,890/50,000, expires 11-08 (12 days)** —
DQ-39 exception runs to 11-09. Standing warnings unchanged (anthropic/cdp spend
readings absent; esortcode no balance endpoint; cobalt/einsearch/sec-api-io no
account record).

**`fixtures:drift`:** nothing (326 suites, 354 manifests).

**`scheduled:outcomes`:** two single-failure warnings, no finding (rule:
two consecutive scheduled failures).
- `weekly-drift.yml` run 40334936804 (10-26 13:55Z): the manifest-drift step
  found **2 drifted capabilities** — `domain-contact-extract`
  (output_field_reliability) and `social-profile-check` (data_source,
  output_field_reliability, personal_data_categories, input_schema). A real
  finding, not an instrument fault; facts drift and vendor roster were clean.
  Re-run locally this morning (`sweep-manifest-drift.ts`, read-only): **4
  drifted** — the two above plus `no-bankruptcy-check` and
  `norwegian-company-data` (output_field_reliability; both touched by #746
  after the cron ran) — and **10 manifests missing in DB** (the four new tools
  plus six 2026-05-16 company-data manifests: bg, cy, hu, lu, mt, ro). The
  sync (`--apply`) is a production write; not done. It belongs to the
  onboarding path (DQ-41) — backfill mode for the four drifted slugs. Next
  Monday's cron will fail again unless that runs.
- `stale-branches.yml` run 40339934447: `gh` GraphQL "Something went wrong"
  updating issue #687 — GitHub-side transient. Instrument fault.

**CHECK 5 post-deploy (yesterday's next-session item 2).** `health_monitor_events`
`invariant_alert` with `details->>'check' =
'algorithmic_correctness_environmental_only'`, per slug per day: 10-24 12,
10-25 10, 10-26 9 (of which 5 at 09:05Z, before #739 deployed ~10:40Z; after:
academic-paper-search 15:07Z, slovak-company-data 17:08Z), 10-27 0 to ~07:10Z.
Second source: the grouped-events table below shows the same 4 invariant_alert
rows in the window. Verified.

**#728 post-deploy (item 3).** `GET /v1/platform/facts` →
`company_data_active_iso` 25 entries, 25 unique, Australia once. **Correction to
yesterday's brief**: it said the pages "missed Luxembourg". The fix makes the
code count Luxembourg *when its tool is active*, but `luxembourgish-company-data`
is not in the production table at all, so Luxembourg is (correctly) still not
listed. Only the Australia double-count changed what readers see. Not carried
into today's brief: immaterial to Petter.

**Alarms grouped, whole window, no row cap** (scratchpad `health.mts`,
excluding probe/heartbeat/meta/situation):

| slug | events | reading |
|---|---|---|
| vat-validate | classification 4, regression 2 | 97 calls/24 h, **all harness**; 2 VIES overloaded, 2 member-state unavailable, rest negative tests |
| uk-gazette-notice-search | violation 4, promotion held | standing Gazette 500; not for sale |
| protocol-tvl-lookup | classification 3 | harness (standing DefiLlama timeouts) |
| cz-unreliable-vat-payer | classification 2 | 50 calls all harness; 2 `fetch failed` |
| slovak-company-data | classification 2, alert 1 | harness, standing |
| ssl-check | classification 1, regression 1 | 90 calls all harness; one badssl.com timeout |
| academic-paper-search | alert/regression/classification 1 each | 4 harness calls; OpenAlex rate limit |
| company-news, arxiv-search | alert 1 each (09:05Z, pre-deploy) | standing |
| danish-company-data, tech-stack-detect, usgs-earthquake-search, us-product-recall-search | classification 1 each | single events |
| french-company-data | quality_floor 1 | flagged-only, as before |

`who-called --days 1 --errors` for vat-validate, ssl-check,
academic-paper-search, cz-unreliable-vat-payer: 0 account, 0 x402, 0 anonymous.
**Nothing customer-facing.** Breakers: only `us-court-search` (since 08-17,
DQ-14). Quarantines: none.

## B2. Stale work

| PR | disposition |
|---|---|
| #725–#727, #736 website series | drafts, updated 10-26 22:45Z by the live website session (`strale-wt-design`); not touched |
| #730 T7 small + contract cut | draft, held for Petter's confirmation of DEC-20261024-A items 2/5; not touched |
| #682 M4 batch 7 | unchanged since 09-13 (M4 delegated-merge rule); M4 idle 44 days |

## B2b. Hygiene (primary checkout)

`session-close-check --hygiene-only` from the trunk: 0 red, 2 yellow — no
handoff for today yet (this file, pre-merge); the same 16 M4 local branches
(oldest 45 d). Owner: next M4 session. Trunk on `main`, clean.

## B3. Branch graveyard

31 non-main remote heads at start. Deleted (merged PRs; no worktree; local
first where one existed), sha recorded for restore:
`claude/charming-fermat-5brkuh` 4b53aadec6c6 (#722),
`claude/charming-fermat-5brkuh-review-md` 7a1f9123f744 (#724),
`claude/wow-review-cfe380` 672b1405d347 (#708; local deleted first),
`docs/dq40-swiss-register-terms` 4bbd4d3571da (#741),
`docs/public-limitations-copy` cc9f0013fb3b (#756),
`feat/agent-surfaces-messaging` f82109b066ee (#743),
`feat/company-status-check` 671697f872a1 (#742),
`feat/entity-resolve` 780295b2e7d0 (#744),
`feat/limitations-sync-mode` 3154fd6ebc0d (#757),
`feat/onboarding-run-endpoint` a3fe07613a2b (#755),
`fix/registry-status-dead-entities` 99849f316848 (#745 closed, superseded by #746),
`fix/registry-status-dead-entities-v2` bfd532a2dab8 (#746).
Re-verified with `git ls-remote --heads`: 19 non-main remain. Left:
M4 property, open-PR branches, `claude/loving-newton-mxoo9l-{docs,review,use-cases}`
(live website session; use-cases #737 closed but unmerged — its owner's call),
`claude/site-structure-messaging-f667b6` (local ref differs from remote — a
deletion would be undone by the nightly backup; owner: website session).

## C. Decision queue

No `preauthorized_notice` items. DQ-39 (Serper) and DQ-40 (UID/ARES) were
answered by Petter on 10-26 and are waiting on vendor replies; nothing to do
until a reply arrives or DQ-39's exception ends 11-09. **New: DQ-41**
(above). DQ-33, DQ-27, DQ-14 unchanged.

## D. The work — password-strength stops persisting the password

Yesterday's next-session item 1 (deadline 10-28). **PR #758, merged
`21900ce8`, deployed** (`GET /health` → `21900ce88d2d`). Built by a
worktree-isolated agent; diff, PR-file identity and deploy checked here.

- `lib/never-persist-inputs.ts`: slug → never-persisted fields
  (`password-strength: [password]`), a `Map` (review finding 1: a plain-object
  lookup of `constructor`/`__proto__` turned a 404 into a 500). Fields are
  replaced by `"[not stored]"` before anything is written or hashed; unlisted
  slugs get the same object back (byte-identical for every other capability);
  the executor still gets the real input.
- Applied at: four `/v1/do` transaction inserts, the idempotency fingerprint,
  `hashInput` (audit `input_hash`, success and failure), x402 insert, x402 audit
  `input_hash`, x402 orphan-settlement `raw_args`, solution fingerprint and
  insert. Integrity hash and receipts read the stored row, so they cover the
  marker (reviewer confirmed).
- Tests: module unit tests (18) incl. prototype-name slugs; `do.core.test.ts`
  sync path success + failure with Idempotency-Key, incl. bind-shape;
  `x402-gateway-v2.never-persist.test.ts`. **Fail-before** by neutering each
  masking site in turn (WIP commits, no stash): each fails a specific
  assertion; restored all pass. CI green on `b0f7fdc3` (check, integration-db).
- **Independent review**: fresh read-only Claude agent (separate context,
  same-provider per the 2026-09-07 policy) → PASS-with-should-fix; both
  should-fix items fixed in `b0f7fdc3`.
- Manifest limitation now true ("Passwords submitted before 27 October 2026
  may still be held"); reaches production only via onboarding (DQ-41).
- **Accepted trade-off:** a reused Idempotency-Key with a different password
  replays the first result instead of a 409.
- **Open follow-ups (reviewer, low):** stored output (length, classes,
  entropy, "commonly used" flag) narrows weak passwords; 7 pre-fix rows hold
  raw passwords plus unsalted hashes until 90-day redaction (early scrub =
  production write touching the integrity chain → bulk-operation protocol);
  a password in task text lands in `failed_requests.task`;
  `GET /x402/password-strength?password=` puts it in URLs/access logs.
- `unverified:` effect on a real production row — no password-strength call
  since deploy, and this session holds no live API key to make one.
- Cleanup: agent worktree deregistered (`git worktree remove --force`); its
  ignored files left the directory
  `.claude/worktrees/agent-ad5b4c5bd508fd70e` on disk (not deleted — never
  `rm -rf`; prune with `apps/api/scripts/prune-claude-worktrees.ts`). Branch
  deleted local and remote.

## E. Authorities updated

- `docs/company/DECISION-QUEUE.md` — DQ-41.
- GOALS.md, LESSONS.md: no new evidence.

## Escalation test (CHARTER)

DQ-41 survives it: nothing to investigate — the 503 names the missing key, and
the key's holder is Petter by design. Asked as authority, not labour.

## Next session

1. **DQ-41**: when the onboarding key is set, run Actions → Onboard capability:
   mode `onboard` for company-status-check, entity-resolve, eurostat-data,
   invoice-counterparty-check; mode `backfill` for domain-contact-extract,
   social-profile-check, no-bankruptcy-check, norwegian-company-data,
   password-strength (clears weekly-drift); then mode `limitations`, `all`.
   Verify each via `GET /v1/capabilities/<slug>` and the drift sweep.
2. Password-strength post-deploy: after the next real call, read the newest
   row (query in PR #758) — expect `{"password":"[not stored]"}`.
3. Password-strength follow-ups (above), mine; the output-narrowing one first.
4. Weekly drift fails again Monday 11-02 unless item 1 lands — that would be
   the second consecutive scheduled failure, i.e. a finding.
5. DQ-39 / DQ-40: act on vendor replies; Serper exception ends 11-09.
6. Carried: F8 investigation (do.ts vs x402 gateway per-call policy diff);
   EORI degraded-mode contract; Polish non-JSON error; M4 idle 44 days.
