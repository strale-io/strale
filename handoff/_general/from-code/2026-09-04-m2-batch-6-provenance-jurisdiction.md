Intent: land T10 (M2 exit-gap closure) batch 6, provenance and jurisdiction semantics, three `not_yet_reconciled`, `historical_scope: global` Decision rows (DEC-20260422-D typed provenance attribution fields, DEC-20260425-A processing_location/data_jurisdiction semantics Option B, DEC-20260425-B processing_location Railway env var) as inactive formal candidate records, with the register's counts and digests made true again against the private archive.

## What this batch is

Three rows resolved from the private projection at archive commit
`378d4836` (134 rows, brief gave titles only, page ids resolved here by
matching the brief's titles against the private file's `id` field). None
collided (checked against `docs/decisions/id-collisions.yaml`), none was a
Git-native protocol label (checked against the `Protocol (DEC-...)` heading
pattern in `CLAUDE.md`/`AGENTS.md`), none had an existing record. Each is
now a formal candidate record under `docs/decisions/records/`, five
protected sections, `scope: technical` (data-contract and runtime
semantics, per the brief), `authority_scope: none`, `authority_active:
false`, `migration_status: candidate`, `phase: M2`.

Every `title_sha256` in the private projection was verified against the
Notion titles fetched from the raw export at commit `995cece3` before
writing anything; all three matched exactly (`sha256` of the raw `Decision`
field, including `DEC-20260425-A`'s literal "DEC-20260425-A" plus a dash
separator as its title prefix, which the record's own `title` front-matter
field trims).

## Contradictions found and how they are stated

All stated as dated "status on 2026-09-04" notes in each record's
Consequences section, never editing the Decision/Rationale/Outcome text:

1. **`RAILWAY_REPLICA_REGION` is still the source of `processing_location`.**
   `apps/api/src/lib/processing-location.ts`'s `getProcessingLocation()`
   still implements the exact three-step resolution order `DEC-20260425-B`
   set (env var, then `STRALE_PROCESSING_REGION`, then `"unknown"` with a
   warn). `config/env-manifest.yaml` documents `RAILWAY_REPLICA_REGION` as
   `required_in: [production, test]`; `STRALE_PROCESSING_REGION` is
   registered but "Not set in production on 2026-09-02." No contradiction:
   this half of `DEC-20260425-A`'s Option B is unchanged and confirmed
   current.
2. **`data_jurisdiction`'s manifest-declared-field replacement was never
   implemented.** This is the material contradiction. `DEC-20260425-A`'s
   Decision text says Option B replaces the
   `capabilityType`/`transparencyTag` heuristic with "a manifest-declared
   field per capability." On `main` today, `getProcessingJurisdictions()`
   in `apps/api/src/lib/provenance-builder.ts` still runs exactly that
   heuristic, and the function's own in-code comment ("NOT YET captured
   (chunk 1.5 follow-up)... These should be manifest-declared and merged in
   here") confirms the gap directly. No `manifests/*.yaml` file declares a
   processing-jurisdiction field consumed by that function; the `jurisdiction`
   hits in `manifests/` are unrelated output fields (`jurisdiction_risk`,
   per-country fixture `jurisdiction:` values). Stated in
   `DEC-20260425-A`'s Consequences at length, including that the hardcoded
   `"EU"` bug F-AUDIT-01 named is confirmed fixed (removed from the
   composition path) even though the specified fix mechanism (manifest
   field) did not ship as scoped.
3. **The typed provenance fields exist and are populated by a bounded set
   of capabilities, matching the row's own scope.** `DEC-20260422-D`'s four
   fields (`attribution`, `license`, `license_url`, `source_note`) all
   exist on `RichProvenance`, each optional, with an in-code comment naming
   the EU High-Value Dataset registries the row's "HVD etc." example
   points at. 22 capability executors under `apps/api/src/capabilities/`
   set `attribution:`, all open-data/company-registry sources, consistent
   with (not contradicting) the row's stated scope. No manifest schema
   field exists for these; population is entirely in-code, unaffected by
   the manifest onboarding pipeline this row predates.
4. **Readiness and retention did not change these fields' meaning.**
   Checked directly: neither `DEC-20260812-A` nor `DEC-20260815-A`
   mentions `processing_location`, `data_jurisdiction`, or
   `processing_jurisdiction` anywhere in their formal records on `main`.
   Stated in `DEC-20260425-A`'s Consequences.
5. **Chronology is reversed from what the ID pattern suggests.**
   `DEC-20260425-B` (`decided_at: 2026-04-21`) predates `DEC-20260425-A`
   (`decided_at: 2026-04-25`) despite both carrying an "0425" date
   component; B's own text explains why: "Decision logged against the
   DEC-20260425-B ID pre-allocated by the originating prompt; actual
   decision + ship date is 2026-04-21." Stated in B's Decision section
   verbatim; not a contradiction of anything, just worth surfacing since it
   is easy to misread from the IDs alone.

None of these change a Decision's recorded meaning, so none required a
STOP; all are within the fidelity-and-contradiction-surfacing mandate.

## Relations: no edges added

The brief specified exactly two checks: (a) add `{type: affirms, target:
DEC-20260425-A}` on B only if B's text says it implements or follows A; (b)
add an edge from A to D only if A's text names D. Neither condition holds.
B's text (quoted above) says the semantic question is *deferred to* A, not
that B implements or follows it; B precedes A chronologically and hands the
open question to it, the reverse relationship the brief's specific trigger
describes. A's text does not name D anywhere (checked by string search over
the full 5,861-character Rationale field). Per the brief's explicit "no
other edges" constraint, all three records carry `relations: []`.

One nuance stated in prose only, not as a graph edge, because the brief
scoped edges narrowly: `DEC-20260425-A`'s own Decision text says
`processing_location` "keeps its current F-AUDIT-02 Contain behaviour...
read from RAILWAY_REPLICA_REGION via the unified helper... commit
d165ae2," which is a direct, source-stated affirmation of B's mechanism.
This is noted in both A's and B's Consequences sections as prose, not
promoted to a `relations:` entry, because the brief's relation-edge scope
for this batch covers only the two checks above.

## Commit verification

`git cat-file -e d165ae2^{commit}` resolves on `main`
(`d165ae2ee7902c30d117410a4f27766c8621f59f`, "fix: read processing_location
from RAILWAY_REPLICA_REGION instead of hardcoded string (F-AUDIT-02
Contain)"), cited as a GitHub commit URL in `DEC-20260425-B`.
`DEC-20260425-A`'s Source field is `https://claude.ai/` (not a commit); cited
verbatim, unresolved as a commit by construction. `DEC-20260422-D`'s Source
field is empty in the Notion export; no commit citation attempted.

## Register changes

Targeted string edits only, per batch 4/5 method:

- Three new rows appended to `decision_rows` (the public array), shape
  matching existing `formally_migrated` rows: `page_id`, `id`,
  `title_sha256` copied verbatim from the private projection, `historical_status:
  active`, `source_url`, `record_key`, `disposition: formally_migrated`,
  `evidence: [docs/decisions/records/DEC-....md]`, standard rationale
  string.
- `formal_records` += three `notion-row` entries (inserted in id order
  among existing entries): `DEC-20260422-D` (after `DEC-20260422-C`),
  `DEC-20260425-A` and `DEC-20260425-B` (after `DEC-20260424-A`, before
  `DEC-20260427-A`).
- `sources.formal_records.record_count`: 43 -> 46.
- `counts.decision_rows.formally_migrated`: 36 -> 39.
- `counts.decision_rows.not_yet_reconciled`: 123 -> 120.
- `digests.public_rows.count`: 184 -> 187.
- `digests.public_rows.digest`:
  `6927c98810e5b629fe70d22dbc4eb6e707149ff569aeacacb55b5a8303ea507d` ->
  `fe7243e994918cb2dd8017c342609cc8b1426a736657e866787df2a6768afb03`.
- `digests.public_rows.scope_date_digest`:
  `2ec9d6ac7ed6b0f87dfa94c6b17be7ccfa480751ab5b944f38e6bb80a7ef9cea` ->
  `011d90e60b6532217dc422ab918f08e000d7295fcfca9f7b8d8b6417615de522`
  (recomputed over all 187 public rows' `Scope`/`date:Date:start` triples
  from the raw export, per `compareRowsToExport`'s definition).
- `digests.all_rows.digest`:
  `1af22d421478cf3078948f0c9a74ddda6e713a779b4afce524526e6b80565a15` ->
  `ebd5a12ed6ffa82defaa3fbd127ccdf392b2d4fc1cf5dafe7094cf89ad45cd08` (count
  stays 318: 187 public + 131 private).
- `private_rows.count`: 134 -> 131; `private_rows.digest`:
  `eaf8d714323b01b6ff29fc9bc58267f932bdb4f9ec4abdd0a44c968e38d82702` ->
  `ce10b812b169976c3d7736fc718671f99afa56fb8b5f076b133bbd394a4b716a`;
  `counts_by_disposition.not_yet_reconciled`: 123 -> 120.
  `private_rows.commit` is left at `378d4836f8464e9ab84d70c55e78187836f4d44f`
  in this PR; the orchestrator commits the new private half (below) to the
  archive repository and bumps this field afterward.
- Gap `G1`'s `gap` text: "123 preserved Decision rows (122 global, 1
  temporary)..." -> "120 preserved Decision rows (119 global, 1
  temporary)...", with this batch's three record ids appended to both the
  narrative and `evidence`.

No line was deleted from the register except as part of the two in-place
text replacements above (the old digest/count values and the old G1 gap
sentence); no row, gap, or evidence entry was removed.

## Digests computed (all shown above); collected here for convenience

- `public_rows.digest`: `fe7243e994918cb2dd8017c342609cc8b1426a736657e866787df2a6768afb03`
- `public_rows.scope_date_digest`: `011d90e60b6532217dc422ab918f08e000d7295fcfca9f7b8d8b6417615de522`
- `all_rows.digest`: `ebd5a12ed6ffa82defaa3fbd127ccdf392b2d4fc1cf5dafe7094cf89ad45cd08`
- `private_rows.digest` (new 131-row projection): `ce10b812b169976c3d7736fc718671f99afa56fb8b5f076b133bbd394a4b716a`

Computed with `scripts/m2-closure-register-lib.mjs`'s own
`canonicalDigest`/`scopeDateDigest` functions, imported directly, over the
131-row private file plus the register's public rows plus the full 318-row
raw export (all four `decisions-rows*.json` files fetched read-only from
the private archive at commit `995cece3`).

## Private half for the orchestrator

New 131-row private projection (three rows removed, nothing else changed,
same layout as the source) written to (NOT committed, per the brief):
`C:/Users/pette/AppData/Local/Temp/claude/C--Users-pette-Projects-strale/4f68dcca-de52-4ade-b2b2-8341f736268e/scratchpad/2026-09-02-m2-closure-private-rows.batch6.yaml`

## Checks run

- `npm run archive:index` (before `context:generate`, per the brief): wrote
  `archive/README.md` and `handoff/README.md`; no content diff against
  `HEAD` (already current).
- `npm run context:generate`: regenerated 13 non-authoritative files;
  `docs/project/DECISIONS.md` picked up the three new records, no other
  file changed materially.
- `npm run context:check`: warning-only mode. Before staging the new
  record files, 30 `WARN` lines (`DECISION_ROW_NOT_PUBLIC`,
  `EVIDENCE_INVALID` for the untracked `.md` files,
  `REGISTER_IDENTITY_NOT_PUBLIC`), exit 1. After `git add` on the three
  records plus the register: "no warnings," exit 0.
- `npm run context:test`: green, exit 0 (counts are in the CI log; no receipt is written for a docs batch).
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched by this batch, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`, 10 pre-existing rows
  awaiting Codex, none added or touched by this batch (per the constraint
  not to touch `docs/programs/**`; the backlog register lives there and was
  not edited).
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs; this file avoids the bare-count form.
- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`: green, exit 0 (counts are in the CI log).
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md and
  handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 25 `FAIL` lines, all
  in the expected private count/digest classes and their direct
  consequences (the archive-repo file at the recorded commit still holds
  134 rows, three of which are now also public, so the operator script
  correctly reports `EXPORT_ROW_DUPLICATE`,
  `PRIVATE_ROW_ALSO_PUBLIC`/`PRIVATE_ROW_ALREADY_PUBLIC`,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (x2 forms per row),
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID`, the two `PRIVATE_COUNT_MISMATCH`
  lines, `PRIVATE_DIGEST_MISMATCH`, and `ALL_ROWS_DIGEST_MISMATCH`). None
  is a schema, evidence, derivation-rule, or record-citation failure:
  every failure traces to the private file at the archive commit not yet
  reflecting this batch's three removed rows, which is exactly what the
  brief says to expect until the orchestrator commits the private half and
  bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`) run against this PR's register
  plus the new 131-row private file plus `docs/decisions/id-collisions.yaml`:
  **0 findings.**

## Deviations from the brief

None identified. Both anticipated relation checks were evaluated and
neither triggered; this is reported as a finding, not a deviation, since
the brief's own wording ("if...") anticipates the possibility that neither
check fires.
