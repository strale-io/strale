Intent: land T10 (M2 exit-gap closure) batch 5 — capability lifecycle patterns — three `not_yet_reconciled`, `historical_scope: global` Decision rows (DEC-20260421-J capability retirement pattern, DEC-20260421-L park pattern, DEC-20260422-B tombstone refinement) as inactive formal candidate records, with the register's counts and digests made true again against the private archive.

## What this batch is

Three rows named explicitly by the orchestrator's brief, same method as
batch 4 (PR #513): none collided (checked against
`docs/decisions/id-collisions.yaml`), none was a Git-native protocol label,
none had an existing record. Each is now a formal candidate record under
`docs/decisions/records/`, five protected sections, `scope: operational`
(the Notion `Scope` field was `global` under the old workspace vocabulary;
noted in each record's Context — these are catalog operating patterns, not
product or global strategy), `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Every `title_sha256` in the private projection was verified against the
Notion titles fetched from the raw export at commit `995cece3` before
writing anything; all three matched exactly.

## Contradictions found and how they are stated

Three anticipated by the brief, one found independently, all stated as
dated "status on 2026-09-04" notes in each record's Consequences section,
never editing the Decision/Rationale/Outcome text:

1. **Seed-file mechanism is historical.** `DEC-20260421-J` step (2) removes
   entries from `seed.ts` and `seed-kyb-solutions.ts`; `seed.ts` was deleted
   in PR #79 and capabilities now enter through the manifest pipeline
   (`manifests/*.yaml`, `apps/api/scripts/onboard.ts`) plus the
   `auto-register.ts` DEACTIVATED map. `seed-kyb-solutions.ts` and
   `fix-lifecycle-anomalies.ts` both still exist on `main`.
2. **A third lifecycle path exists.** `DEC-20260812-A`'s quality floor now
   deactivates/quarantines capabilities automatically via the x402-enabled
   flag (`apps/api/src/lib/capability-promotion.ts`), a mechanism these
   2026-04 manual patterns predate. Named in all three records; the patterns
   are unchanged by it.
3. **A record is never proof of production state.** Cited via `CLAUDE.md`'s
   "Predecessors that overlap the KYB families" paragraph in all three
   records.
4. **Found independently, not anticipated by the brief:** `singapore-company-data`,
   the exemplar capability `DEC-20260421-J`'s Outcome names as the validated
   retirement case (and `DEC-20260421-L`'s Rationale cites as the correctly
   Type-3-retired counterexample to park), was reactivated eight days after
   the retirement this record documents. Commit `bd25bc57` migrated it off
   the banned OpenCorporates scrape onto the compliant `data.gov.sg` CKAN
   API; `manifests/singapore-company-data.yaml` exists on `main` today and
   the slug is no longer in the DEACTIVATED map. The retirement pattern
   (steps 1-7) was executed correctly and remains valid; the specific claim
   that SG KYB was permanently un-revivable did not hold in production.
   Stated in both `DEC-20260421-J`'s and `DEC-20260421-L`'s Consequences.

## Commit verification

`git cat-file -e <sha>^{commit}` against `main`: `be0c788` (full `be0c7888`)
and `b86d431` (full `b86d431a`) resolve — cited as GitHub commit URLs.
`972b860` and `2a1cc24` do not resolve as commit objects in this repository
— cited in prose only; both are named alongside the pattern's sitemap-regen
step, which runs in the sibling frontend repository, so they most likely
name commits there rather than missing artifacts.

## File-path corrections against the brief

- `DEC-20260421-J`'s primary evidence path, `apps/api/scripts/archive/drop-sg-kyb.ts`,
  exists as named (moved under `archive/` by the 2026-08-17 Phase 3 debloat
  sweep, commit `c4c871f6`).
- `DEC-20260421-L`'s brief-suggested evidence path,
  `apps/api/scripts/archive/phase-dec-b-park.ts`, exists but is actually the
  **later** `DEC-20260423-B` Stage C.2 park script (12 UK-property/failed-backfill
  capabilities), not the original SDR park artifact the Outcome names. The
  original, `apps/api/scripts/park-company-intelligence-sdr.ts`, also exists
  on `main`, moved to `apps/api/scripts/archive/park-company-intelligence-sdr.ts`
  by the same debloat sweep. Both paths are cited in the record: the SDR
  script as primary evidence, `phase-dec-b-park.ts` as a later reuse of the
  pattern (its `deactivation_reason` string literally contains
  `dec_20260421_l`, confirming reuse).
- `apps/api/src/lib/capability-readiness.ts` does reference the park/tombstone
  patterns directly (its Stage A/D header comment names the 12-capability
  `park_permanent_...` cohort), so it is cited as evidence on all three
  records.
- `DEC-20260421-I` and `DEC-20260421-K`, which the brief said were "mentioned
  in the sources": neither ID appears anywhere in the three fetched Notion
  rows' actual content (Decision/Rationale/Outcome/Source fields). No prose
  mention was added because there was nothing found to mention; this is
  reported as a deviation from the brief's expectation, not an omission.

## Relation edges added

Two, both source-stated:

- `DEC-20260422-B` -> `{type: amends, target: DEC-20260421-J}` — the row's
  own title ("Retirement pattern refinement") and Outcome state it refines
  J's pattern.
- `DEC-20260421-L` -> `{type: related_to, target: DEC-20260421-J}` — its
  Rationale defines park by contrast with retirement. The brief anticipated
  the relation enum might lack `related_to` and instructed no edge in that
  case; verified against `scripts/decision-records-lib.mjs` line 78, which
  does include `related_to` in the enum (and `scripts/decision-records.test.mjs`
  exercises it explicitly as "an explicit non-retiring same-topic
  relationship"), so the edge was added rather than omitted.

## Register changes

`docs/project/m2-closure-register.yaml`, targeted string edits via a
purpose-written script mirroring `scripts/m2-closure-apply-g1-rule.mjs`'s
digest-recomputation approach (not committed; scratchpad-only):

- `formal_records` +3 (`DEC-20260421-J`, `DEC-20260421-L`, `DEC-20260422-B`,
  each `source_kind: notion-row` with the matching source page id).
- Three new `decision_rows` public rows, `disposition: formally_migrated`,
  inserted before the `private_rows:` key.
- `sources.formal_records.record_count`: 40 -> 43 (matches
  `ls docs/decisions/records/*.md | wc -l` = 43).
- `counts.decision_rows.formally_migrated`: 33 -> 36; `not_yet_reconciled`:
  126 -> 123.
- `digests.public_rows`: count 181 -> 184, digest
  `6927c98810e5b629fe70d22dbc4eb6e707149ff569aeacacb55b5a8303ea507d`,
  `scope_date_digest` `2ec9d6ac7ed6b0f87dfa94c6b17be7ccfa480751ab5b944f38e6bb80a7ef9cea`
  (recomputed from the raw archive export over all 184 public rows, not just
  the 3 new ones).
- `digests.all_rows`: count unchanged at 318 (rows moved from private to
  public, total conserved), digest
  `1af22d421478cf3078948f0c9a74ddda6e713a779b4afce524526e6b80565a15`.
- `private_rows.count`: 137 -> 134; `private_rows.digest`
  `eaf8d714323b01b6ff29fc9bc58267f932bdb4f9ec4abdd0a44c968e38d82702`;
  `private_rows.counts_by_disposition.not_yet_reconciled`: 126 -> 123.
  `private_rows.commit` left at `8ec76446958de89d1b0cbc4f1e5aec2750ffeb03` —
  the orchestrator commits the new private projection and bumps this field
  afterwards, per the brief.
- `exit_gaps` G1: gap text updated to 123 rows (122 global, 1 temporary),
  batch named; evidence += the three new record paths.

## Private half (not committed here)

The new 134-row private projection (same layout, the three migrated rows
removed, nothing else changed) was written to the orchestrator's scratchpad
at `2026-09-02-m2-closure-private-rows.batch5.yaml`, never committed by this
session.

## Checks

`npm run archive:index` (before `context:generate`, per the brief),
`npm run context:generate` (staged), `npm run context:check`,
`npm run context:test`, `npm run programs:check`, `npm run codex:check`,
`npm run receipts:check`,
`node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`,
`node scripts/generate-archive-index.mjs --check` — see the PR body and the
final session report for exit codes.
`node scripts/m2-closure-verify-private-rows.mjs` is expected to fail only on
private count/digest classes until the orchestrator commits the private half
and bumps `private_rows.commit`.

## Deviations from the brief

- `DEC-20260421-I`/`-K` not found in source content (see above) — nothing to
  mention in prose.
- One additional contradiction found beyond the brief's three (the SG KYB
  reactivation) — surfaced in Consequences per the same fidelity standard,
  not held back for a STOP (the brief's STOP-on-unanticipated-contradiction
  instruction from batch 4 was not repeated verbatim in batch 5's brief, and
  this finding directly concerns the exemplar capability both `DEC-20260421-J`
  and `DEC-20260421-L` name, so surfacing it in place matched the spirit of
  the fidelity bar).
- `DEC-20260421-L`'s brief-suggested evidence path pointed at a different,
  later script than the one the Outcome names as the first park artifact;
  both are cited, with the distinction explained in Consequences (see
  above).
