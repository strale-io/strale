# 2026-09-12 — morning operating session

Intent: run the 2026-09-12 morning operating session under DAILY-RUN.md —
measure the business, dispose of overnight health and stale work, do the
highest-leverage work against GOALS.md, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. Previous morning run: 2026-09-11, so the health window is one
day except where a longer window is stated.

---

## Headline

1. **Six company registries are being health-checked with a lookup value the
   repository has already corrected and production never received.**
   `canadian-company-data` has passed **none** of its `dependency_health`
   runs (173 in the fourteen-day window when measured this morning; the
   window rolls) on corporation number `2408951` — which the official
   Canadian registry answers "could not find" — while the manifest has said
   since **2026-08-12** that the number is unresolvable and has been swapped
   for `1007`. The mechanism is structural: `onboard.ts --backfill` inserts
   test types that are MISSING and updates only `known_answer`, so an existing
   suite's input is never rewritten from the manifest, and nothing compared the
   two. German, Irish, Lithuanian, Spanish and Swiss are the same. Three of the
   six are already quarantined by fixture-recapture exhaustion and therefore
   have **no health signal at all**. Shipped: `npm run fixtures:drift`. The six
   production rows need a write this operation does not hold → **DQ-33**.
2. **Screenshots and PDFs are genuinely fixed** — confirmed against production
   rather than inferred from the absence of alarms. Last failure
   2026-09-11T18:34Z; first success 20:11:37Z; **zero** auth failures on any
   Browserless-backed capability since. DQ-31 is correctly closed.
3. **PR #673 (M4 batch 1d) reviewed and NOT merged** — the independent review
   returned PASS WITH FINDINGS with three must-fix items. Posted to the PR;
   T7's `next_action` carries the disposal.
4. Revenue: last completed week **€58.77**, the week before **€73.03** —
   `growth()` reads **falling**, the same completed week yesterday's run
   recorded. Largest payer 92.3%.

---

## A. Business measurement

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
primary checkout at `origin/main` tip (`e498d574`, clean).

```
2026-09-07     €47.70    990 calls  [in progress, day 6 of 7 — NOT comparable]
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
2026-08-17     €66.31   1000 calls
2026-08-10     €39.24    620 calls
2026-08-03     €27.38    451 calls
```

`growth()`: **falling**. Last completed week: 10 payers, top share **92.3%**
(€54.26 against €4.51 from everyone else), 100% attributed, 2 bought on more
than one day, someone paid on all 7 days. New-vs-returning still `unavailable`
and not guessed. Dashboard: revenue €58.03 rolling 7d, buyers 28 (lower bound),
identity 100%, spend €2.14.

Week in progress (day 6 of 7, **no conclusion drawn**): 12 payers, largest
share 94.8% (€45.20 against €2.50).

Quiet list: 3 previously-paying buyers silent, the largest €11.09 at **14d** —
the card customer, two weeks silent against a previous longest gap of two days.
The `quietPayers` as-of-today fix from 2026-09-11 is holding: the pack reports
14d and prints the end-of-last-completed-week figure (9d) separately and
labelled, so the two cannot be confused again.

**Second source — external traffic by capability, 7d, harness excluded**
(`transactions` joined to `users`, `email <> 'system@strale.internal'`):

| slug | external calls | completed | revenue |
|---|---|---|---|
| `email-validate` | 580 | 580 | €17.37 |
| `belgian-company-data` | 150 | 149 | €7.45 |
| `serp-analyze` | 40 | 40 | €6.00 |
| `sanctions-check` | 28 | 28 | €5.60 |
| `google-search` | 31 | 31 | €3.10 |
| `startup-domain-check` | 20 | 20 | €1.00 |
| `image-to-text` | 17 | 17 | €0.85 |
| `base64-encode-url` | 40 | 38 | €0.76 |
| `tech-stack-detect` | 23 | 23 | €0.69 |
| `uptime-check` | 21 | 21 | €0.42 |

Consistent with the pack's totals and with the standing read: the business is
one buyer's basket of everyday lookups plus one compliance line.

**Per-payer, last completed week, through `payerFacts` — a module call, not a
hand-rolled query.** 10 payers, €0 unattributed:

| payer | revenue | calls | active days | first slug in window |
|---|---|---|---|---|
| `x402:v1:e9e672ef…` | €54.26 | 1106 | 6 | `email-validate` |
| `x402:v1:42a6533c…` | €3.15 | 21 | 1 | `serp-analyze` |
| `x402:v1:35f8dfc0…` | €1.12 | 17 | 2 | `sanctions-check` |
| seven others | €0.02–€0.05 each | 1 each | 1 | various |

**Correction to a read I had started to write.** An earlier draft of today's
brief said the only repeat buying outside the largest payer is on cheap
utilities, pointing at the utility thread GOALS.md has been following. The
per-payer data contradicts it: of the nine non-largest payers, two bought more
than once — `42a6…` on search tools (and the only non-largest payer seen in
three separate weeks) and `35f8…` on `sanctions-check` across two days. One of
the two repeat buyers is on a compliance product. The honest read is that
€4.51 across nine payers is too thin to point anywhere, and both artifacts now
say that instead. Caught by checking a slug-level table against `payerFacts`
before it reached the brief — the slug table alone attributes nothing to a
payer, and reading a direction off it would have been an attribution I had not
made.

## B. Overnight health

**Vendor Control Tower** (`npm run vendor:status`): ACTION NEEDED, unchanged in
substance from yesterday. Browserless Cloud healthy with the honest reason —
"a render succeeded in the last 24 hours, so the container accepts our key; the
browserless.io account allowance does not apply" — so the 2026-09-11 repair
that stopped it passing on someone else's account is working. OpenRegister
498/500, resets 2026-10-07. Serper 47,211/50,000, expires 2026-11-08. Dilisense
authenticated call succeeded. Standing warnings, none new: `anthropic` and
`cdp` declare spend monitoring with no reading; `esortcode` finite credits with
no balance endpoint; `cobalt-intelligence`, `einsearch`, `sec-api-io`
paid/finite with no vendor account record.

**Alarms grouped over 7 days, no row cap** — the shape DAILY-RUN.md requires
after the sixteen-day Browserless miss:

| slug | type | n | days |
|---|---|---|---|
| `uk-gazette-notice-search` | classification | 179 | 8 |
| `canadian-company-data` | classification / regression_detected | 91 / 87 | 8 |
| `uk-gazette-notice-search` | invariant_alert | 83 | 8 |
| `html-to-pdf` | invariant_violation | 40 | 7 |
| `lithuanian-company-data` | invariant_alert | 39 | 7 |
| `screenshot-url` | invariant_violation | 39 | 7 |
| `company-news`, `stock-quote`, `cz-unreliable-vat-payer`, `spanish-company-data` | mixed | 3–17 | 2–5 |

Dispositions:

- **`canadian-company-data` — the day's finding.** See section D.
- **`html-to-pdf` / `screenshot-url` — closed.** All 79 events predate
  2026-09-11T20:11Z. Verified three ways: the grouped counts split at the fix
  (`html-to-pdf` 40 before / 0 after; `screenshot-url` 38 / 1, the one at 20:27
  in flight); a chronological transaction listing whose last `403:
  Unauthorized` is 18:34:19Z and whose first success is 20:11:37Z; and a
  post-fix aggregate showing **0 auth failures** across all six
  Browserless-backed capabilities. The 8 paid `screenshot-url` failures a
  3-day `who-called` window reports are all pre-fix — a stale finding I nearly
  wrote down as live, and the reason the timeline query exists above.
- **`uk-gazette-notice-search` — unchanged, vendor-side.** 90 of 90
  `dependency_health` runs timed out in 7 days. DQ-14 item 2; it needs the
  vendor contacted as the company, which is founder-gated.
- **`openalex` HTTP 429 — real, not ours, nobody exposed.** 4,747 probe
  failures in 7 days, bursty by hour (0 unhealthy in one hour, 57 in the next),
  so upstream throttling in windows rather than our probe rate; the polite-pool
  `mailto` and User-Agent are already sent. `who-called --days 14` on both
  paid-rail consumers: `academic-paper-search` 24 calls and `paper-details` 24
  calls, **every one the harness, 0 external**. Recorded, not acted on.
- **`sec-api-io: unhealthy — Unexpected HTTP 200`, 7,622 events — stopped on
  its own.** Last seen 2026-09-11T07:36Z; every probe today reads healthy. A
  probe that calls HTTP 200 unhealthy is an instrument fault by definition, but
  it is no longer firing and I did not spend the morning reconstructing why.
  `unverified:` what changed.
- **`vat-validate`** — 12 VIES 403s in 14 days against 1,369 calls, **all
  harness, 0 external**. Not a customer problem.
- **Circuit breakers:** one open, `us-court-search`, since 2026-08-17 —
  consistent with its expired key (DQ-14 item 1) and with `is_active = false`.
- **`youtube-summarize` carries `is_active = false` with `x402_enabled = true`,
  and the solution `kyb-complete-se` the same.** Checked for exposure rather
  than assumed: the x402 gateway ANDs both flags (`x402-gateway-v2.ts:161-162`,
  `:214`, `:1127`), production returns **404** for `/x402/youtube-summarize`,
  and neither appears in `/x402/catalog` (268 capabilities, 74 solutions).
  Cosmetic data drift, no exposure. Clearing it is a production write; not done.

## B2. Stale work

- **PR #673** (M4 batch 1d → `m4/cutover`): CI green, `MERGEABLE`, **not
  merged**. Independent review by a fresh read-only agent in a separate
  context — the 2026-09-07 policy route — returned **PASS WITH FINDINGS**.
  Three must-fix:
  1. `frontmatterIsActive` (`scripts/check-project-context.mjs:133`) accepts a
     half-applied document because it checks only `status` and
     `authority_active` and ignores `phase`, `complete`, `m1_template`.
     Reproduced by planting one; no test covers it.
  2. A new comment at `scripts/project-context-lib.mjs:236-248` claims the
     project-document JSON schema enforces the state-mixing rule, but Ajv
     compiles only `OPERATOR_ACTIONS_SCHEMA`, so nothing validates against it.
  3. The refuse-to-emit-a-dangling-link throw has no test.

  Thirteen further findings, two needing their own batch before the cutover
  merge: `README.md` and `docs/README.md` still describe `docs/project/` as
  candidates, and the M4 banner's two claims about `m4/cutover` and `main` both
  become false at the merge, in six places. Full review posted as a PR comment.
  **Owner:** the next M4 batch session on T7. **Deadline:** before batch 2,
  which depends on 1d. T7's `next_action` now carries all of it.
- Deployed commit `e498d5741bdf` equals `origin/main` tip `e498d574`
  (`GET /health` against `git log origin/main -1`).
- CI green on the last four commits to `main`.
- No uncommitted paths in the trunk.
- `session-close-check --hygiene-only`, run from the **primary checkout**:
  0 red, 1 yellow (today's handoff absent at the time — this file).

## B3. Branch graveyard

Only four non-main remote branches existed, all touched 2026-09-12; there is no
graveyard left to triage.

- **Deleted `fix/recapture-idx` @ `fe8f30dd8ff9492e6cf73e871de3ac41dfbdc047`**
  ("fix(test-runner): close recapture-refusal defect class, fix PR #669 review
  findings", 2026-09-12T00:52 +0200). Its content is entirely on `main` via
  PR #669: `git diff origin/main fix/recapture-idx`, excluding the three
  generated inventory files, is **empty**, and the inventory difference is the
  branch being one commit behind rather than ahead. Local ref deleted first,
  then the remote, then **both re-verified** (`git branch --list` 0 refs,
  `git ls-remote --heads` 0 refs) — the order the 22-hour-lifetime deletions of
  2026-08 taught.
- **`m4/b1c-entrypoint-check` is superseded but not deletable.** Its one commit
  over `m4/cutover` is the globally-scoped `isCutoverUnderway()` approach that
  review rejected and PR #672 squashed out. It is checked out in another
  session's worktree (`.claude/worktrees/agent-a39f7361ce1bb1331`), and removing
  another session's worktree is not an unattended-run operation. **Owner:** the
  next M4 session, when it disposes of #673. **Deadline:** before the cutover
  merge.
- `m4/b1d-activate` and `m4/b2-claude-md` are live M4 work in their own
  worktrees. Left alone.

## C. Decision queue

- **DQ-27** (`your_call`) — re-read, not re-measured today; the 2026-09-11
  update stands, and DQ-33 is the same ask with more weight behind it.
- **DQ-14** (`your_call`) — unchanged. Item 2 (the Gazette) is today's worst
  service again, with a written reason.
- **DQ-31** — resolved, and today's production check is the second source that
  closes it properly rather than on the absence of alarms.
- **DQ-33 — new, `your_call`.** The six mis-fixtured registries: what was
  measured, the size, and why it is not mine.
- No `preauthorized_notice` window matured.

## D. The work: a fixture the repository corrected and production never got

**What is true, and how I know.** `manifests/canadian-company-data.yaml` lines
106-110 carry a comment dated 2026-08-12: "Fixture corp swapped 2026-08-12:
2408951 is not resolvable via the official JSON API (pre-migration scrape-era
fixture)." Production's `dependency_health` suite still holds
`{"corporation_number":"2408951"}`. Second-sourced against the registry itself
rather than against our own error message:

```
GET https://ised-isde.canada.ca/cc/lgcy/api/corporations/2408951.json?lang=eng
  -> ["could not find corporation 2408951","Corporation 2408951 est inconnu."]
GET https://ised-isde.canada.ca/cc/lgcy/api/corporations/1007.json?lang=eng
  -> [{"corporationId":"1007", ... "Abbotsford Chamber of Commerce" ...}]
```

The capability is behaving correctly: it refuses a corporation that does not
exist. The harness records that refusal as a failure, classifies it `unknown`,
and fires `regression_detected` every two hours. 0 passed out of every run in
the window — 173 when first measured at 06:2xZ, 172 an hour later, because
the window rolls.

**Root cause, read in the code rather than inferred.** In
`apps/api/scripts/onboard.ts`, the backfill path computes `missing` as the test
types with no active row and inserts those; the only existing suite it updates
is `known_answer`, and only under `--discover` / `--fix`. So correcting a
fixture in the repository is, for every other test type, a no-op against
production — and nothing anywhere compared manifest to database.

**The population, and the denominator discipline.** Of **326** active
`dependency_health` suites, **81** differ from their manifest's
`health_check_input`: 36 passing, 39 with no run in the window, 6 actionable
(36 + 39 + 6 = 81, which is the partition's own self-check). **Reporting 81
would have been wrong.** The actionable set is the conjunction *differs AND
never passes*: **6**, every one a company registry.

| slug | production | manifest | runs / passed |
|---|---|---|---|
| `canadian-company-data` | `{"corporation_number":"2408951"}` | `{"corporation_number":"1007"}` | 173 / 0 |
| `spanish-company-data` | `{"company_name":"Telefonica"}` | `{"nif":"A20072302"}` | 5 / 0 |
| `irish-company-data` | `{"cro_number":"461onal"}` | `{"cro_number":"513174"}` | 2 / 0 |
| `swiss-company-data` | `{"uid":"CHE-116.281.710"}` | `{"uid":"CHE-101.602.521"}` | 2 / 0 |
| `lithuanian-company-data` | `{"company_code":"301524699"}` | `{"company_code":"304151376"}` | 2 / 0 |
| `german-company-data` | `{"company_name":"Google"}` | `{"company_name":"SAP SE"}` | 1 / 0 |

Two patterns worth naming. `irish-company-data`'s production fixture is
`461onal` — corrupted text, not a CRO number. And the German and Spanish rows
are *name* searches ("Google", "Telefonica") where the manifest specifies an
identifier; both fail with "no confident registry match", which is the
registry-name-search lesson arriving through a fixture. Irish, Lithuanian and
Swiss are additionally `fixture_recapture_quarantined`: the recapture machinery
spent three live attempts each retrying a fixture that cannot work, then
quarantined the suite — so those three capabilities have **no health signal at
all**.

**Shipped.** `npm run fixtures:drift` — `apps/api/scripts/fixture-drift.ts`
(production read-only, through `openOperatorDrizzle()`), logic in
`apps/api/src/lib/fixture-drift.ts`, 12 tests in `fixture-drift.test.ts`. Wired
into DAILY-RUN.md step B with the denominator warning inline, so the next run
does not report 80. Deliberately **not** a CI gate: the drift lives in
production rows and CI has no production database.

**Tests discriminate — verified by mutation, not asserted.** Removing the
`suite.passed > 0` guard fails exactly "does NOT report a differing fixture
that passes". Removing the `productionInput === manifestInput` guard fails two.
Making `canonicalise` shallow fails the nested-sort test. Receipt:
`archive/receipts/2026-09-12-test-run-fixture-drift-guard.json`.

**Not done, deliberately.** Rewriting the six production rows is a database
write. `DATABASE_URL` is the read-only `strale_ro` role and the write
credential is a parked commented line for an authorised attended session.
Being right about the correction is not authority to make it → DQ-33.

## E. Authorities updated

- `docs/company/LESSONS.md` — **F7 incident 11** (the mechanism: correcting the
  repository is not correcting production, and nothing compared the two), with
  its damage counted once as **F1 row 8**. F1 6 → 7 occasions; F7 10 → 11.
- `docs/company/DECISION-QUEUE.md` — **DQ-33** added.
- `docs/company/DAILY-RUN.md` — step B now runs `fixtures:drift`.
- `docs/programs/cto-readiness/tracks.yaml` — T7 `next_action` carries the
  #673 review disposal, the two findings needing their own batch, and the
  change to batch 7's scope (1d activated the targets rather than retiring the
  entrypoint check, so there is no check left to retire).
- `docs/company/GOALS.md` — **not** edited. The completed-week reading is the
  same completed week yesterday's entry records; restating it would add a data
  point that does not exist.

## F. Independent review of this batch, and what it changed

PR #674 was reviewed by a fresh read-only agent in a separate context (the
2026-09-07 policy route). Verdict **PASS WITH FINDINGS**. It reproduced the
core finding independently — live registry calls for 2408951 and 1007, the
production suite row through the read-only handle, the 0-of-173 aggregate, all
six slugs and their values, the `--backfill` root cause, and all three
mutations — and confirmed the script cannot write (it attempted an UPDATE
through the same handle and got SQLSTATE 25006). Three must-fix findings, all
accepted and all fixed in this batch:

1. **The denominator was 80 and is 81.** My query grouped suite rows by
   `(slug, test_type, input, is_active)` instead of by suite id, which merged
   `risk-narrative-generate`'s two active `dependency_health` suites into one
   row with their runs summed — so 326 active suites read as 325 and 81
   divergences as 80. Re-measured by suite id: **326 active, 81 differ, 36
   passing, 39 zero-run, 6 actionable**, and the partition now self-checks.
   The six actionable and the 36 passing were right all along. **This had to
   be fixed before merge, not after:** the number was written into
   `archive/receipts/`, and `receipts-lib.mjs` compares a tracked receipt's
   blob at HEAD against the blob at the commit that first added it, so a
   merged receipt cannot be corrected. The branch's history was rewritten so
   the receipt's first-add commit carries the right number.
2. **`LESSONS.md` F1 said "the seventh has not" after gaining an eighth row.**
   Corrected to "the seventh and eighth".
3. **The stated cause of the 36 passing divergences was unevidenced and partly
   false.** I wrote that `--discover` had improved the DB row while the
   manifest kept a placeholder, "so production holds the better fixture". Of
   the 36, **nine carry an `auto_remediation_log`** — their input was
   rewritten at runtime by `lib/self-heal.ts` (rule `missing_input`), a
   **third** writer of `test_suites.input` my account did not mention. And at
   least two invert the claim: `skill-extract` has a rich manifest input and a
   generic production one, and `public-holiday-lookup`'s manifest is the stale
   side (`year: 2025` against production's 2026). The *exclusion* stands for a
   narrower reason — a passing suite is not the actionable signal — and every
   document now says that instead. Asserting a cause where only an effect was
   measured is this failure family's own error, committed while documenting it.

Also fixed from the "worth noting" list:

- `--days -5` and `--days 0` put the cutoff in the future, so every suite read
  `runs = 0` and the script printed **"Nothing"** — the exact silent-clean
  failure it exists to prevent, one flag away. Now refused with exit 2
  (verified for `-5`, `0` and `abc`).
- `DAILY-RUN.md` had dropped the words "from the manifest", which made the
  sentence false given `self-heal.ts`. Restored.
- `LESSONS.md` said the incident was "counted once, in F1 row 8" while both
  family counts had been incremented. Both places now state the split: F7
  carries the mechanism, F1 the damage, one incident.
- Three mutations survived the test suite — `sampleFailure` propagation,
  `canonicalise`'s `?? null`, and the suite id — and the test that looked like
  it covered the coalesce never passed `undefined`. Four tests added, 12 — 16,
  and each of the three mutations now fails exactly one.

Left as noted, not fixed: the script itself has no test (it needs a database);
the brief's section 3 carries the closed hole rather than the six unapplied
corrections, which is a framing call the reviewer rated low-confidence and the
text is explicit about.

## Next session

1. **Fix the three must-fix findings on PR #673, merge it, run M4 batch 2.**
   They are small and local. Work in a fresh worktree cut from `m4/cutover`; do
   not take over `.claude/worktrees/agent-a04d39d3f63479638`.
2. **Open the batch that fixes `README.md` / `docs/README.md` and the M4
   banner** before the cutover merge — six places, one batch.
3. **Run `npm run fixtures:drift` in the health sweep.** If DQ-33 is answered,
   the six corrections are one attended session's work.
4. **The second-payer question is still the ranking one, and this week's data
   does not answer it.** Nine non-largest payers, €4.51, two of them repeat
   buyers — one on search tools, one on `sanctions-check`. Do not read a
   direction out of that; the utility-versus-compliance question needs
   outward-facing work, not another week of the same measurement.

Contingency: if `fixtures:drift` starts reporting many rows, check that the
`--discover` path has not begun writing placeholders into production — the 36
benign rows are benign only while production holds the better fixture.
