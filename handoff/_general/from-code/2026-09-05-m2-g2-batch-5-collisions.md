Intent: resolve T10 gap G2 batch 5, the last nine historical decision-ID
collisions (DEC-20260505-D, DEC-20260505-E, DEC-20260507-A, DEC-20260507-B,
DEC-20260507-C, DEC-20260508-B, DEC-20260508-C, DEC-20260512-A,
DEC-20260513-F, nineteen Notion rows) atomically per the method established
in G2 batches 1 to 4, closing G2's row work.

## What landed

Eighteen formal source-qualified records
(`docs/decisions/records/<ID>--notion-<page id>.md`) and one documented-only
row (`DEC-20260507-B`'s superseded NL twin, naming `DEC-20260508-C`'s
KVK-ineligibility row as its successor). Nine resolution reports under
`archive/sessions/2026-09-05-decision-collision-resolution-DEC-*.md`, one
per collision, including a three-row collision (`DEC-20260508-C`: the
audit-first template extension, closing-steps Rule 17, and the
KVK-M2M-ineligible row, all three formal records). `docs/decisions/id-collisions.yaml`
flips all nine remaining collisions to `resolved` (35/35 collisions now
resolved, 0 unresolved rows remain). `docs/project/m2-closure-register.yaml`:
`unresolved_collision` 19->0, `resolved_collision` 5->6, `formally_migrated`
206->224, `formal_records.record_count` 213->231, `public_rows.digest` and
`all_rows.digest` recomputed (public rows changed; `scope_date_digest` and
`private_rows.*` did not, since scope/date never changed for these
already-public rows and no private row moved), G2 gap text rewritten to
state the batch is resolved and no `unresolved_collision` row remains
(`blocking: true` left untouched per the brief, for the orchestrator to
close separately).

## The two brief corrections applied

1. The register-test fixtures do not depend on a live `unresolved_collision`
   row (PR #559 fixed that): `node --test scripts/m2-closure-register.test.mjs
   scripts/decision-records.test.mjs` passed clean with zero
   `unresolved_collision` rows remaining. No STOP triggered; no register
   edit was withheld.
2. Every quotation was verified by script before commit: extracted every
   double-quoted span of 25+ characters from the eighteen records and nine
   reports, checked each against the parsed Notion row JSON (`dump_rows.py`
   output, never the raw export), the attributed repo file at HEAD, or the
   attributed record's own text. First pass found the same class of defect
   G2 batch 4's fix already named: markdown line-wraps inserting a literal
   newline into a quote that is one continuous line (or one continuous
   sentence) in the source, which a byte-for-byte check reads as a
   mismatch. Fixed by collapsing wrap-induced newlines inside quoted spans
   to a single space; repo-file quotes that are genuinely multi-line in
   source (code comments spanning several `//` lines) were left as
   multi-line matches against the source's real line breaks, or shortened
   to a single physical source line. The sweep also found and fixed: two
   wrong trailing-punctuation quotes (a comma the source did not have, a
   fabricated period after a truncated word), one quote wrongly attributed
   to `manifests/italian-company-data.yaml` when the actual text is in
   `manifests/austrian-company-data.yaml` (corrected in place, with the
   Consequences prose rewritten to state the aggregator-vs-register
   provenance rule this row describes has no manifest demonstrating it
   today), and one paraphrase wrongly presented as a verbatim quote
   ("unexpected branch present", not source text). A final pass came back
   clean of real defects; the remaining flags from the verification script
   itself are its own artifact (short Notion-row quotes and JS string
   literals inside backtick code spans break its naive quote-pairing scan)
   and were each individually re-checked by direct substring match.

## The three-row collision's handling

`DEC-20260508-C` collides three historically-active rows: the audit-first
template's cross-worktree write-conflict check, closing-steps Rule 17
(worktree HEAD-state verification), and the row establishing that KVK
direct M2M is ineligible for a Swedish AB (NL reverting to Company.info).
All three got formal records and all three `source_rows` entries in one
resolution report, per the brief's instruction. Rule 17's record carries a
`relations: [{type: amends, target: DEC-20260508-B--notion-...}]` edge
(the row names DEC-20260508-B directly as establishing the detached-HEAD
baseline the tripwire depends on); the KVK-ineligibility row's own
supersession target (the `DEC-20260507-B` collision's superseded NL twin)
is stated in prose only, since that twin's disposition is documented_only
and carries no record to target.

## Every stale statement in an existing record corrected in prose

None found. Grep of every record under `docs/decisions/records/*.md` and of
`CLAUDE.md` for all nine bare ids found exactly two hits, both matching the
orchestrator's Rule 4 pre-check exactly: `DEC-20260427-I.md` line 60 names
`DEC-20260505-D` in its own Outcome-field quote ("Remaining 5 of the
original 6 ... still in mid-rebuild per DEC-20260505-D"), and
`DEC-20260515-C.md` names `DEC-20260513-F` four times (title and body),
citing it as the source of SI's directors-gap exemption with no formal
record existing for it in this repository at the time that record was
written. Neither statement is now false: both cite historical mechanisms
this batch's new records confirm, and neither record's protected text
asserts anything this batch's resolution contradicts. `corrects_migration_state_in`
stays `[]` on all nine reports.

## The auto-register.ts citation the brief's pre-check named does not exist

The brief's Rule 4 pre-check stated `apps/api/src/capabilities/auto-register.ts`
"cites `DEC-20260505-D` for the IT/ES/PT/AT rebuild." Grepped the whole
file for `DEC-20260505-D`: zero hits. The actual citations for that rebuild
are `DEC-20260507-B` (dutch-company-data, line 166), `DEC-20260507-C`
(portuguese-company-data line 174, spanish-company-data line 186,
italian-company-data line 262), and `DEC-20260512-A` (dutch-company-data,
citing the KVK Option B closure). `DEC-20260505-D`'s v1-scope-expansion row
is the decision that set the five-country rebuild target in motion, but no
code comment in this repository cites it by id. Reported per the brief's
instruction to state which row a citation means; this one turned out to
name no row at all in the file it pointed to.

## Contradictions surfaced, verified in files

- Italy, the Netherlands, and Portugal shipped on the Openapi.com Tier-3
  aggregator path (`manifests/italian-company-data.yaml`,
  `manifests/dutch-company-data.yaml`, `manifests/portuguese-company-data.yaml`),
  consistent with `DEC-20260507-C`'s and `DEC-20260512-A`'s expectations.
  Spain shipped on `OpenMercantil.es` (Tier-2, the exact self-build path
  `DEC-20260507-C` rejected as too slow) and Austria shipped on the direct
  JustizOnline government API (Tier-1, not the aggregator path
  `DEC-20260507-C` and `DEC-20260508-B`'s provenance-posture row both
  anticipated), both undocumented divergences from the rows' stated
  defaults.
- `config/env-manifest.yaml`'s `OPENAPI_ENABLED` row confirms the Openapi.com
  resolver is still gated off in production pending the case-151296 resale
  addendum, the exact condition `DEC-20260507-C` named as critical; no
  `KVK*`, `COMPANY_INFO*`, `INFOCAMERE*`, or `TOPOGRAPH*` row exists,
  consistent with those four vendor paths never reaching production
  credentials.
- The drift-check substrate (`DEC-20260507-A`) is verified in force:
  `apps/api/src/lib/platform-facts.ts` exports `getActiveVendorNames()` and
  `getStaleVendorNames()`, imported by `apps/api/scripts/check-platform-facts-drift.ts`
  exactly as the row describes.
- Branch protection (`DEC-20260507-C`) cannot be verified from the
  checkout: it is a GitHub repository setting. `CLAUDE.md`'s session
  contract's `main`-changes-only-through-PRs sentence and pre-push-refuses
  language are consistent with it still holding.
- The canonical worktree structure (`DEC-20260508-B`) has been extended,
  not replaced: `CLAUDE.md`'s Shared-Checkout Rule now requires per-agent
  worktree isolation (`strale-wt-<track>`) beyond the original two named
  worktrees, while `WORKTREES.md` still exists at the repo root as the
  operational doc this row named.
- The scheduler cost-class gate (`DEC-20260512-A`) is verified in force in
  `apps/api/src/jobs/test-scheduler.ts` and `apps/api/src/lib/startup-migrations.ts`'s
  Block 0069; `CLAUDE.md` separately documents an `external_cost_cents`-based
  reconciliation of `scheduled_testing_eligible`, a different mechanism
  that appears to coexist with this row's `cost_class` gate.
- The `manifest_drift` non-tripping classification (`DEC-20260513-F`) is
  verified in force in `apps/api/src/lib/trust-helpers.ts`; the code
  comment immediately above the branch attributes the mechanism to
  `DEC-20260513-B` and `DEC-20260513-C` instead of this row, and both of
  those records describe unrelated subjects (a Swiss breaker-pin release
  and a Slovak scheduler hash-stagger fix), an apparent misattribution in
  the code comment, not evidence those two decisions authorized this path.
- The v1 Identity coverage verdict's (`DEC-20260513-F`) canonical source,
  `apps/api/docs/v1-identity-coverage-matrix-2026-05-13.md`, still exists
  at that exact path.
- Neither the audit-first template nor `stop-conditions.md` (both named by
  `DEC-20260508-C`'s two engineering-convention rows) exists as a file in
  this repository; whether their specific mechanisms still run is
  unverifiable from files alone, though `CLAUDE.md`'s Shared-Checkout Rule
  and Session contract carry related but not identical concurrency-safety
  mechanisms.

## Checks run

`node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`
(clean), `npm run archive:index`, `npm run context:generate`
(twice, staging between), `npm run context:check` (zero findings),
`npm run context:test` (clean), `npm run programs:check` (ok,
both tracks), `npm run codex:check` (ok, backlog unchanged by this batch),
`npm run receipts:check` (ok; pre-existing unrelated
`HANDOFF_BARE_TEST_COUNT` warnings on other sessions' handoffs, not this
one), `node apps/api/scripts/check-pii.mjs --strict` (clean),
`node apps/api/scripts/check-no-committed-secrets.mjs` (clean),
`node scripts/m2-closure-verify-private-rows.mjs` (ok, no private
next-batch candidates).

## Constraints honored

Branch `docs/m2-g2-batch-5-collisions` from `origin/main` after `git fetch`,
own worktree, `npm ci` inside it. No `git stash`. Did not touch
`docs/programs/**`, CLAUDE.md, AGENTS.md, `apps/api`, `packages`,
`manifests`, `config`, `design`, the frontend checkout, or Notion (`scripts/`
was touched only to run existing checks and a read-only `gh api` fetch of
the private archive's decision rows for digest recomputation; no script
source file was edited). No existing record edited. PR opened, not merged.
