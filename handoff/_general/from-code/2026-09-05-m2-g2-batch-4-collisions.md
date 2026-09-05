Intent: resolve T10 gap G2 batch 4, seven historical decision-ID collisions
(DEC-20260420-I, DEC-20260420-J, DEC-20260420-K, DEC-20260421-A,
DEC-20260421-B, DEC-20260421-C, DEC-20260421-D, fourteen Notion rows)
atomically per the method established in G2 batches 1 to 3.

## What landed

Thirteen formal source-qualified records
(`docs/decisions/records/<ID>--notion-<page id>.md`) and one documented-only
row (`DEC-20260420-J`'s superseded twin, naming this batch's own
`DEC-20260420-K` formal record as its successor). Seven resolution reports
under `archive/sessions/2026-09-05-decision-collision-resolution-DEC-*.md`.
`docs/decisions/id-collisions.yaml` flips all seven collisions to
`resolved`. `docs/project/m2-closure-register.yaml`: `unresolved_collision`
33->19, `resolved_collision` 4->5, `formally_migrated` 193->206,
`formal_records.record_count` 200->213, `public_rows`/`all_rows` digests
recomputed (public rows changed; private rows and `scope_date_digest` did
not, since scope/date never changed for these already-public rows), G2 gap
text updated with the remaining count (9 collisions, 19 rows).

## Two protected records corrected in prose (not edited)

`DEC-20260422-H.md` and `DEC-20260430-A.md` both state `DEC-20260420-K`'s
display ID was an unresolved collision (the statement originates in
`DEC-20260430-A`'s own Context section; `DEC-20260422-H` quotes it as its
own evidence). Both are now stale. This batch's `DEC-20260420-K` resolution
report names the fact in prose and identifies which of that collision's two
rows the "vendor-selection content" language means (the Payee Assurance
bank-verification row, since only it names a vendor shortlist). Neither
protected record was edited. `corrects_migration_state_in` stays `[]` on
that report: the field is enforced against a hardcoded map in
`scripts/decision-records-lib.mjs` this batch does not touch, the same wall
G2 batch 3 hit for `DEC-20260503-A`'s stale statements.

## A second instance of an unverifiable DEC-20260420-H attribution

Two rows in this batch (`DEC-20260420-I`'s doctrine row and
`DEC-20260421-B`'s landing-H1 row) attribute specific rules to the bare id
`DEC-20260420-H`: a "direct connections only" doctrine text, and a Brand &
Voice Section 7.1 primary-headline lock, that neither of that collision's
two already-resolved (G2 batch 3) qualified records actually state on their
own exported text. Both records here follow batch 3's own precedent for the
identical pattern (the ToS-scraping-rule attribution): the reference is
recorded as prose only, with no relation edge to either qualified record.

## Contradictions surfaced, verified in files

- The doctrine row's own six-category `data_source_type` taxonomy never
  shipped; `manifests/*.yaml` carries a different five-value taxonomy today
  (`api`/`computed`/`scrape`/`reference`/`ai_assisted`), with 32 capabilities
  still declaring `scrape`. `DEC-20260428-A` and `DEC-20260813-A` (existing
  records) establish a later, independent doctrine on the same subject.
- The Payee Assurance bank-verification vendor shortlist (Banfico,
  MonitorPay, SurePay, iPiD) is entirely rejected per
  `apps/api/src/lib/platform-facts.ts`'s `STALE_VENDORS` list.
- The `onCapabilityCreated` hook-outside-transaction correction is live in
  `apps/api/src/lib/capability-persistence.ts` today, verbatim to the row's
  design.
- Neither the "Counterparty verification for AI agents, in one call." H1
  nor the counterparty-verification Section 2 animation is live on
  production (`strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx`);
  the H1 is the earlier `DEC-20260314-G` headline, and Section 2 is
  `<SolutionsShowcase />`.
- The Phase 4a `--force-override-authority` authority-enforcement guard is
  live in `apps/api/scripts/onboard.ts`; Phase 4b's manifest-completeness
  enforcement status is unconfirmed in this pass.
- Cluster 2 is tracked in the repository as an audit-report series
  (`archive/sessions/audit-reports/cluster_2_design.md` and siblings), not
  as a Decision record.

## Checks run

`node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`,
`npm run archive:index`, `npm run context:generate` (twice, staging
between), `npm run context:check`, `npm run context:test`,
`npm run programs:check`, `npm run codex:check`, `npm run receipts:check`,
`node apps/api/scripts/check-pii.mjs --strict`,
`node apps/api/scripts/check-no-committed-secrets.mjs`,
`node scripts/m2-closure-verify-private-rows.mjs`. Results in the PR body
and session report.

## Constraints honored

Branch `docs/m2-g2-batch-4-collisions` from `origin/main`, own worktree,
`npm ci` inside it. No `git stash`. Did not touch `docs/programs/**`,
CLAUDE.md, AGENTS.md, `apps/api`, `packages`, `manifests`, `config`,
`design`, `scripts` (other than the digest-recomputation lookups, which
made no source edits), the frontend checkout, or Notion. No existing
record edited. PR opened, not merged.
