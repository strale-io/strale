---
title: "M4 batch 1b part 2, decision-record classification for CLAUDE.md's Active Decisions"
date: 2026-09-11
authority_active: false
status: evidence
---

# M4 batch 1b part 2: classifying every unrecorded id in CLAUDE.md's Active Decisions section

This report covers every `DEC-` id named in CLAUDE.md's `### Active
Decisions` section (from `#### MVP Decisions (Feb 2026)` through `#### Current
Decisions (August 2026)`, ending before `### Capabilities & Quality`) that had
no record file under `docs/decisions/records/` at the start of this batch,
on branch `m4/b1b-records` off `origin/m4/cutover`. An id already covered by a
bare, `--notion-`, or `--git-` qualified record file is not listed here.

Method: for each id, the closure register
(`docs/project/m2-closure-register.yaml`), the decisions export
(`decisions-export-pretty.json`, read by Notion page id), the introducing
CLAUDE.md commit (`git log -S`), and, for architecture and money rules, the
current code, in that order of preference per the task brief.

## MVP Decisions (Feb 2026)

All of `DEC-1` through `DEC-23` have no Notion source row (confirmed by
`userDefined:ID` search over the full 318-row export: zero matches). They
trace to the same introducing commit,
`da9b1fc0bb2378bf5a6942ac399013ed52655399` ("Add full API, TypeScript SDK,
and deployment config", 2026-02-26) via `git log -S` on their exact CLAUDE.md
text; none appear in the closure register (it only tracks Notion Decision-DB
rows, and these predate that database).

- **DEC-1** (4-week MVP scope). Source: CLAUDE.md, commit `da9b1fc0`. Closure
  register: not applicable (pre-Notion). Verdict: **historical**. Why: a
  one-time scope framing for a since-exceeded time-boxed MVP, with no
  ongoing rule left to state.
- **DEC-2** (prepaid wallet via Stripe Checkout). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**. Why:
  `apps/api/src/lib/wallet-service.ts` and `stripe.ts` still implement this
  exact architecture; CLAUDE.md's own Tech Stack section restates it.
- **DEC-3** (no bidding, fixed pricing, keyword matching for 5
  capabilities). Source: CLAUDE.md, commit `da9b1fc0`. Closure register: not
  applicable. Verdict: **superseded**. Why: keyword matching for 5
  capabilities was replaced by Voyage AI embeddings plus Claude Haiku
  re-ranking over the full catalog (`DEC-20260303-E`, verified live in
  `apps/api/src/routes/suggest.ts`), and the catalog scale itself moved from
  5 to 290-plus capabilities under the broad-library strategy
  (`DEC-20260812-A`).
- **DEC-4** (founder sole provider, first 3 months). Source: CLAUDE.md,
  commit `da9b1fc0`. Closure register: not applicable. Verdict:
  **historical**. Why: a time-boxed scope statement, long past; CLAUDE.md's
  Capabilities & Quality section documents multiple external vendor
  providers (Dilisense, Serper, ABR) in place today.
- **DEC-5** (TypeScript, Hono, Drizzle, PostgreSQL). Source: CLAUDE.md,
  commit `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**.
  Why: `apps/api/package.json` and CLAUDE.md's Tech Stack section confirm
  the same stack today.
- **DEC-6** (EU/Nordic wedge, 5 seed capabilities). Source: CLAUDE.md,
  commit `da9b1fc0`. Closure register: not applicable. Verdict:
  **superseded**. Why: `DEC-20260812-A` adopted a broad-library,
  library-as-product strategy in place of a narrow seed-capability wedge.
- **DEC-7** (Browserless.io, not self-hosted Puppeteer). Source: CLAUDE.md,
  commit `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**.
  Why: `apps/api/src/lib/browserless-launch.ts` and CLAUDE.md's Tech Stack
  section confirm the same vendor choice today.
- **DEC-8** (SELECT FOR UPDATE on wallet debits). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**. Why:
  `apps/api/src/lib/wallet-service.ts:119` locks with `.for("update")`; the
  same pattern (labelled `F-0-011`) recurs in `circuit-breaker.ts`.
- **DEC-9** (Idempotency-Key on POST /v1/do). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**. Why:
  `apps/api/src/routes/do.ts` enforces the header, including a dedicated
  `idempotency_key_reused` error code.
- **DEC-10** (2.00 EUR trial credits, no card). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**. Why:
  `apps/api/src/lib/trial-eligibility.ts` defines `TRIAL_CREDITS_CENTS =
  200`, consistent with the conversion-email threshold ("below EUR 0.50 (25%
  of trial credits)").
- **DEC-11** (rating endpoint removed). Source: CLAUDE.md, commit `da9b1fc0`.
  Closure register: not applicable. Verdict: **historical**. Why: a one-time
  MVP-scope removal with no rating route in the codebase today and no
  ongoing rule beyond the fact of the removal.
- **DEC-12** (screenshot-url and eu-address-validate dropped for
  vat-validate and annual-report-extract). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **historical**. Why:
  a one-time MVP-era catalog swap; the capability catalog has since been
  reshaped many times over under later decisions.
- **DEC-13** (invoice extraction price raised to 0.50 EUR). Source:
  CLAUDE.md, commit `da9b1fc0`. Closure register: not applicable. Verdict:
  **historical**. Why: a one-time price adjustment; current prices are read
  from `manifests/*.yaml` or the database per the drift-prevention rule, not
  from this decision's prose.
- **DEC-14** (charge only on success: lock, execute, deduct). Source:
  CLAUDE.md, commit `da9b1fc0`. Closure register: not applicable. Verdict:
  **in-force**. Why: `apps/api/src/routes/do.ts` holds the wallet row under
  `FOR UPDATE` through execution and debits only on success;
  `transaction_finalization_failed` exists specifically to protect this
  ordering.
- **DEC-15** (capability_slug override on POST /v1/do). Source: CLAUDE.md,
  commit `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**.
  Why: `apps/api/src/routes/do.ts:668` reads `body.capability_slug` as an
  alternative to `task`.
- **DEC-16** (dry_run mode on POST /v1/do). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**. Why:
  `apps/api/src/routes/do.ts:675` reads `body.dry_run` and short-circuits
  before execution.
- **DEC-17** (wallet_balance_cents in /v1/do response). Source: CLAUDE.md,
  commit `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**.
  Why: `apps/api/src/routes/do.ts` returns `wallet_balance_cents` on
  multiple response paths.
- **DEC-18** (dashboard scope: register, key, balance, top-up, transaction
  list). Source: CLAUDE.md, commit `da9b1fc0`. Closure register: not
  applicable. Verdict: **historical**. Why: an MVP-era scoping decision for
  the dashboard; no ongoing rule beyond a scope statement this batch did not
  find restated or enforced elsewhere.
- **DEC-19** (structured errors, stable error_code enum). Source: CLAUDE.md,
  commit `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**.
  Why: `apps/api/src/lib/errors.ts` defines `ErrorCode` with the comment
  "Stable error codes per DEC-19" directly above it.
- **DEC-20** (hash API keys, store key_prefix). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**. Why:
  `apps/api/src/db/schema.ts:37` defines `keyPrefix` alongside the hashed
  key column.
- **DEC-21** (10 req/sec per key, 100 EUR/hour spend cap). Source:
  CLAUDE.md, commit `da9b1fc0`. Closure register: not applicable. Verdict:
  **in-force**. Why: `apps/api/src/lib/db-rate-limit.ts` and a dedicated
  `spend_cap_exceeded` error code in `errors.ts` implement the mechanism;
  this record does not re-verify the exact numeric thresholds against live
  configuration.
- **DEC-22** (hybrid sync/async, sync under 5s). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **in-force**. Why:
  the routing pattern survives in `apps/api/src/lib/execution-routing.ts`,
  though the threshold has moved to `ASYNC_THRESHOLD_MS = 10_000` and
  `SYNC_TRANSACTION_WALL_MS = 15_000`; the written record treats the pattern,
  not the original 5-second figure, as the in-force decision.
- **DEC-23** (TypeScript SDK before Python SDK). Source: CLAUDE.md, commit
  `da9b1fc0`. Closure register: not applicable. Verdict: **historical**. Why:
  a sequencing decision; both SDKs (`@strale/sdk`, `straleio`) have long
  since shipped.

`DEC-20260225-P-c5d6` and `DEC-20260225-P-m5n6` already have record files
and are not covered here.

## Current Decisions (March 2026)

- **DEC-20260302-A** (Capability Pricing Framework, 0.02-1.00 EUR).
  Source: Notion page `31767c87082c81ae9098eeb8269c2b22`. Closure register:
  formally migrated as `DEC-20260302-A-0001` (page id above), disposition
  `formally_migrated`. Verdict: **superseded**. Why: the existing record
  `docs/decisions/records/DEC-20260302-A-0001.md` covers the identical
  substance under the id the migration pipeline actually derived for this
  Notion row (not the bare `DEC-20260302-A` CLAUDE.md uses), and its own
  Consequences section documents that `DEC-20260411-A`'s cost-structure
  pricing, not this row's value-tier markup, is the operative mechanism
  today. No new record is written for `DEC-20260302-A`; the existing
  `DEC-20260302-A-0001.md` record already carries this substance forward.
- **DEC-20260302-B** (Capability QA Framework, tiered smoke/daily/weekly
  scheduling). Source: CLAUDE.md text only (no matching Notion row found by
  title search on this exact framework). Closure register: not directly
  matched. Verdict: **superseded**. Why: `apps/api/src/lib/test-runner.ts`
  now runs an hourly per-capability scheduler filtered by
  `scheduled_testing_eligible` (`external_cost_cents = 0`), not a
  smoke/daily/weekly tier, per `DEC-20260503-B`'s SQS-engine deletion and
  CLAUDE.md's own "Scheduling is hourly free-only" project fact.
- **DEC-20260302-C**: has a record file already; not covered here.
- **DEC-20260303-D** (search input uses query completions, not a result
  dropdown). Source: Notion page `31867c87082c8195a9dffe7132c1cc89`. Closure
  register: `id: DEC-20260303-D`, `disposition: intentionally_historical`,
  per `DEC-20260904-A`'s pre-readiness feature-scoped predicate
  (`docs/project/m2-closure-register.yaml:3215-3224`, evidence
  `archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md`).
  Verdict: **historical**, the same as its sibling DEC-20260303-E. Corrected
  in architect review of PR #671: this row was first left unclear because
  the register was not read for it, while the register had already closed
  it as evidence-only. No record is written, and batch 2 may drop the
  summary citing the register row. The open question the first pass raised,
  whether the live `SearchHero.tsx` dropdown behaviour matches the row's
  wording, is a question about the website's current design, not about this
  decision's disposition, and belongs to the brand-website program.
- **DEC-20260303-E** (POST /v1/suggest uses Voyage AI embeddings plus Claude
  Haiku re-ranking). Source: Notion page `31867c87082c81e09d58deb1fe3cb086`.
  Closure register: `id: DEC-20260303-E`, `disposition:
  intentionally_historical`, per `DEC-20260904-A`'s pre-readiness
  feature-row rule (decided 2026-03-03). Verdict: **unclear**. Why: this
  batch first wrote an in-force record for this id, since
  `apps/api/src/routes/suggest.ts` demonstrably implements exactly this
  hybrid retrieval-and-rerank design today and CLAUDE.md's own Capabilities
  & Quality section restates it as current fact; running `npm run
  context:generate` then surfaced `DECISION_ROW_SHOULD_BE_MIGRATED` and
  `DECISION_ROW_DERIVATION_MISMATCH` because the closure register already
  classifies this row's source page evidence-only. Per this batch's own
  instructions, a row the closure register already classifies evidence-only
  stays evidence-only, and a decision that nevertheless looks in force is
  flagged unclear rather than recorded. The record was withdrawn. What
  would settle it: a founder decision (or an amendment to
  `DEC-20260904-A`'s predicate) on whether an evidence-only-classified,
  pre-readiness feature row whose substance is independently verified live
  in production should get a formal record after all, since the current
  predicate does not consider production status when it fires.
- **DEC-20260303-G** (historical eleven-section homepage order). Source:
  CLAUDE.md text (no matching Notion row found by this batch's title
  search). Closure register: not directly matched. Verdict: **superseded**.
  Why: CLAUDE.md's own entry already states this id is "superseded for the
  apps/web redesign by DEC-20260905-A"; no formal record is written for a
  superseded id, so `DEC-20260905-A`'s own record describes this
  supersession in prose rather than as a structured graph relation, since
  a `supersedes` relation requires a target record whose own protected
  status field already reads `superseded`, and no record exists for this id
  to carry that status.
- **DEC-20260305-A** (part of CLAUDE.md's collective "DEC-20260305-A through
  G" range). Source: none found. No Notion row, closure-register row, or
  git-history text matches this exact id. Verdict: **unclear**. Why: nothing
  in the export, the closure register, or CLAUDE.md's own text beyond the
  collective range label identifies a distinct decision under this id;
  settling requires the original session record (if one exists) naming what
  "A" in the March 5 range referred to, or confirming CLAUDE.md's range
  notation was imprecise and no distinct "A" decision was ever made.
- **DEC-20260305-B** (fix sanctions-check test field mismatch). Source:
  Notion page `31a67c87082c81ab9947de831a3b7730`. Closure register: `id:
  DEC-20260305-B`, `disposition: intentionally_historical`, per
  `DEC-20260904-A`'s pre-readiness feature-row rule (decided 2026-03-05).
  Verdict: **historical**. Why: the
  register already classifies it evidence-only, and its own text is a
  one-time bug fix ("0/3 to 3/3 passing, commit 3a77b8f") with no ongoing
  rule.
- **DEC-20260305-C** (fix vat-validate test failures). Source: Notion page
  `31a67c87082c813fa2eacb9f22748a82`. Closure register: `disposition:
  intentionally_historical`. Verdict: **historical**. Why: same pattern, a
  one-time test-fixture fix ("2/5 to 5/5").
- **DEC-20260305-D** (fix swedish-company-data test data org numbers).
  Source: Notion page `31a67c87082c81b29d12de21bc02af76`. Closure register:
  `disposition: intentionally_historical`. Verdict: **historical**. Why:
  same pattern, a one-time test-data correction.
- **DEC-20260305-E, F, G**: have record files already; not covered here.
- **DEC-20260306-A** (replace duplicate bar chart with test run audit log).
  Source: Notion page `31b67c87082c814785a8ff40666fe83b`. Closure register:
  `disposition: intentionally_historical`. Verdict: **historical**. Why: a
  one-time UI and backend change (new `/runs` endpoints), evidence-only per
  the register, with no distinct ongoing rule beyond the audit-log approach
  the neighbouring `DEC-20260305-G`/`DEC-20260306-D` records already cover.
- **DEC-20260306-B** (fix test runs endpoints, SQL injection and index).
  Source: Notion page `31b67c87082c81d4b535cfbaaba8ef47`. Closure register:
  `disposition: intentionally_historical`. Verdict: **historical**. Why: a
  one-time bug fix with a stated outcome (both endpoints under 500ms).
- **DEC-20260306-C** (fix solution test runs aggregation, 30-minute
  windows). Source: Notion page `31b67c87082c815bae75db8f3dfbadab`. Closure
  register: `disposition: intentionally_historical`. Verdict: **historical**.
  Why: a one-time aggregation-bug fix.
- **DEC-20260306-D**: has a record file already; not covered here.
- **DEC-20260306-E** (capabilities detail page audit, 1 fix applied).
  Source: Notion page `31b67c87082c81f0b41dedbe561e0c4f`. Closure register:
  `disposition: intentionally_historical`. Verdict: **historical**. Why: an
  audit record of a single completed fix (LimitationsSection import), not an
  ongoing rule.
- **DEC-20260306-F** (capability detail page parity with solutions). Source:
  Notion page `31b67c87082c81d88b49d8b27e290768`. Closure register:
  `disposition: intentionally_historical`. Verdict: **historical**. Why:
  same pattern, a one-time UI-parity change.
- **DEC-20260307** (SQS Constitution as authoritative scoring spec; Notion
  Governance Protocol established). Source: CLAUDE.md text (no matching
  Notion row found by this batch's search). Closure register: not directly
  matched. Verdict: **superseded**. Why: the SQS scoring engine this
  decision made authoritative was deleted under `DEC-20260503-B`
  ("Scoring Integrity" section, PR1 shipped 2026-05-05); the Notion
  Governance Protocol half of the same bullet is already covered on an
  ongoing basis by CLAUDE.md's own "Notion Governance Rules (enforced)"
  section, so no separate ongoing rule remains to record for this id.

## Current Decisions (April 2026)

`DEC-20260428-A` and `DEC-20260428-B` already have record files; not
covered here.

## Current Decisions (September 2026)

- **DEC-20260910-A**: written this batch. See Part B.
- **DEC-20260905-A**: written this batch. See Part B.
- **DEC-20260904-C**: written this batch. See Part B. (`DEC-20260904-A` and
  `DEC-20260904-B` already have record files.)
- **DEC-20260903-A**: written this batch. See Part B.
- **DEC-20260902-A**: written this batch. See Part B.

## Current Decisions (August 2026)

`DEC-20260813-A`, `DEC-20260815-A`, `DEC-20260822-A`, and `DEC-20260812-A`
already have record files; not covered here.

## Summary in words

Of the ids with no existing record, most from the MVP Decisions section are
architecture and money rules this batch verified still live in code and
classified in-force (fourteen: DEC-2, DEC-5, DEC-7, DEC-8, DEC-9, DEC-10,
DEC-14, DEC-15, DEC-16, DEC-17, DEC-19, DEC-20, DEC-21, DEC-22); several
MVP-era scope statements (DEC-1's 4-week framing, DEC-4's founder-sole-provider
window, DEC-11's rating-endpoint removal, DEC-12 and DEC-13's one-time
catalog and price swaps, DEC-18's dashboard scope, and DEC-23's SDK
sequencing) are historical with no ongoing rule; two (DEC-3, DEC-6) are
superseded by the routing and catalog decisions that followed them. Three
further March-2026 ids (DEC-20260302-B the QA cadence, DEC-20260302-A the
pricing framework, and DEC-20260307 the SQS Constitution and Notion
governance bullet) are superseded by later, already documented mechanisms;
DEC-20260302-A specifically is superseded in favour of the record that
already exists under its actual Notion-derived id, DEC-20260302-A-0001.
DEC-20260303-G is superseded per CLAUDE.md's own text. Nine March-2026 ids
from the two collective 305/306 ranges are historical, evidence-only
bug-fix rows already so classified by the closure register. DEC-20260303-D
joins them: the first pass left it unclear without reading the register,
and the register had already closed it as evidence-only under the same
rule (corrected in architect review of PR #671). DEC-20260303-E started
this batch as in-force but was reclassified and its record withdrawn once
`context:generate` showed its source row is likewise evidence-only in the
closure register, contradicting an in-force verdict. It stays unclear
rather than historical, because its substance is verified live in the code
today, which is a conflict worth putting to the founder rather than
burying; DEC-20260303-D carries no such conflict. One more id stays
unclear: DEC-20260305-A, for which no source row was found at all.
Five September-2026 ids (DEC-20260902-A, DEC-20260903-A, DEC-20260904-C,
DEC-20260905-A, DEC-20260910-A) are in-force founder decisions recorded as
new formal records in Part B.
