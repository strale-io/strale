Intent: land T10 (M2 exit-gap closure) batch 14, fourteen founding Decision
rows from the company's second week (2026-02-25 through 2026-02-27:
Swedish-lookup fuzzy input, TED procurement roadmap, the external review
synthesis, the MVP-live milestone, EU AI Act compliance hooks, two
capability-count milestones, the accelerated Provider Growth timeline,
permanent provider-hosted execution, deferred growth strategies, updated
phase sequencing, the composable three-unit architecture, protocol-node
scaling, and the 20-step build sequence) as active formal candidate
records, contradiction-checked against the live capability manifests, the
schema and route code, the readiness-program strategy documents, and
CLAUDE.md, with the register's counts and digests (including the
recomputed scope/date digest) made true again against the private archive.

## What this batch is

Fourteen rows resolved from the private projection at
`docs/project/m2-closure-register.yaml`'s `private_rows.commit`
(`b843fca1f20bef0a17d6a3612211d05ad8566467`, 76 rows, unchanged from
`origin/main` batch 13). All fourteen matched exactly on `id` in the
private file: `historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`, `decided_at` 2026-02-25 (three rows),
2026-02-26 (four rows), or 2026-02-27 (seven rows), and page ids matching
the brief's table exactly. None collided
(`docs/decisions/id-collisions.yaml` has no entry for any of the fourteen
ids; the one collision id in this family, `DEC-20260225-P-c5d6`, is not in
this batch), none was a Git-native protocol label, none had an existing
record before this batch (`ls docs/decisions/records/` for each id: none
existed). Each is now a formal candidate record under
`docs/decisions/records/`, five protected sections (Decision, Context,
Rationale, Consequences, Reversal conditions), scope `product` for o7p8,
y1z2, u5v6, w7x8, a1b2, m3n4, o5p6, q7r8, s9t0, u1v2 and scope `technical`
for m5n6, q1r2, s3t4, i9j0, per the brief. `owner: petter`,
`authority_scope: none`, `authority_active: false`,
`migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`) was read read-only from a
locally cached copy of the archive export (`decisions-export-raw.txt` in
the session scratchpad, already fetched by an earlier batch's session from
`strale-io/strale-context-archive`), located per-row by the escaped
`userDefined:ID` key. Each row's `title_sha256` was taken directly from
the existing private-rows file (`2026-09-02-m2-closure-private-rows.batch13.yaml`,
which itself carries `title_hash: sha256(Decision text)` computed at an
earlier batch), never recomputed, so it is exactly the value the operator
script would also derive.

## Contradictions found (see each record's Consequences for full text and evidence)

- **m5n6**: no LLM call and no fuzzy input handling exist in
  `swedish-company-data` today; `manifests/swedish-company-data.yaml`'s
  `input_schema` requires only `org_number`, and no import from
  `apps/api/src/lib/models.ts` appears in the executor. CLAUDE.md still
  lists this row's id as an active decision, unqualified.
- **o7p8**: shipped. `manifests/ted-procurement.yaml` and
  `apps/api/src/capabilities/ted-procurement.ts` exist; the executor's git
  history dates it 2026-02-26, one day after this row and ahead of its
  own "month 2" target.
- **y1z2**: CLAUDE.md's DEC-7/8/9/10/11/12/19 bullets restate several of
  this row's unanimous items (without attributing them to this row by
  id, since DEC-1 through DEC-23 are prose bullets, not formal records).
  Related to `DEC-20260225-P-a3b4` (batch 13) on the shared revised seed
  list.
- **q1r2**: production host and SDK package name (`straleio`) are
  unchanged; SDK version has moved from `0.1.0` to `0.1.3`
  (`packages/sdk-typescript/package.json`). All five launch capabilities
  still exist; the "fuzzy input" this row attributes to
  `swedish-company-data` is not present (see m5n6).
- **s3t4**: all three columns (`audit_trail`, `transparency_marker`,
  `data_jurisdiction`) exist on `transactions` and are actively written by
  `apps/api/src/routes/do.ts` at every execution path (sync, async, x402).
  The `Strale-Version` header is live in `apps/api/src/lib/versioning.ts`.
- **u5v6 / w7x8**: 342 manifests exist on `main` today (`ls manifests/*.yaml
  | wc -l`, dated 2026-09-05), far past this row's 13 and 35. Every
  category/registry/utility this row names has a corresponding manifest.
  No `amends` edge recorded from `w7x8` to `u5v6`: `w7x8`'s text never
  names the earlier 13-capability count.
- **a1b2 / o5p6**: the 200+/342-capability target was met and exceeded;
  the accelerated provider-recruitment timeline never executed.
  `DEC-20260225-P-g9h0` (batch 13) already establishes no third-party
  provider was ever onboarded; this finding is cited, not re-derived.
  `o5p6`'s own text names `DEC-g9h0` directly.
- **i9j0**: every executor runs inside `apps/api`
  (`apps/api/src/capabilities/auto-register.ts`); no third-party-hosted
  execution path exists. Untested against a real external provider,
  because none was ever onboarded.
- **m3n4**: no hackathon, BYOD-referral, or developer-tools-sandbox
  program was found in the repository. The "narrow wedge" deferral did
  eventually happen in substance, but as the library-as-product,
  x402-primary-rail strategy (`DEC-20260812-A`), not the single-vertical
  wedge this row describes.
- **q7r8 / s9t0**: no separable Agent Reputation Engine or Commerce
  Protocol unit exists; x402 (`apps/api/src/lib/x402-gateway.ts`) shipped
  as the commerce rail instead. No ecosystem-wide A2A reputation registry
  was found built, despite `s9t0`'s Unit-2 reframing naming exactly that.
- **u1v2**: an MCP server and an A2A route both exist; Visa TAP appears
  nowhere in the codebase (grep for "visa"/"tap" found only unrelated
  strings: an immigration-visa capability and "TAP Portugal" airline
  code). The 20-step plan itself is not tracked as a document in the
  repository, so step-by-step completion cannot be verified.

## Relations recorded (source-stated, quoted in each record)

- `o5p6` `amends` `a1b2` (names "Original: Phase 0 (months 1-3) = 5
  capabilities" directly) and is `related_to` `DEC-20260225-P-g9h0` (names
  "provider-lite model per DEC-g9h0" literally, a source-stated id
  reference beyond the brief's minimum checklist).
- `s9t0` `amends` `q7r8` (names "Unit 2" and "Unit 3" by number).
- `u1v2` is `related_to` `s9t0` only (shares the phrase "reputation
  registry"); no edge to `q7r8`, since `u1v2` never names "three units" or
  either unit by name.
- `y1z2` is `related_to` `DEC-20260225-P-a3b4` (batch 13): both name the
  identical five-capability revised seed list.
- `q1r2` is `related_to` `m5n6` (q1r2's own text names
  "swedish-company-data (with fuzzy input)"), and `m5n6` carries the
  reciprocal edge.
- `w7x8` does **not** get an `amends` edge to `u5v6`: `w7x8`'s text never
  names the 13-capability state, so per the brief's rule the edge is
  withheld and left as prose only.
- `a1b2` gets no edge to `w9x0`/`u5v6`/`w7x8`: its "5 seed capabilities"
  phrase names only "the original Provider Growth doc," not any of those
  rows or ids.

## Register diff

`docs/project/m2-closure-register.yaml`, surgical text edits (no
round-trip re-serialization, to keep the diff reviewable and avoid a CRLF
rewrite; a full parse/stringify pass was tried first and produced a
3,690-insertion/3,821-deletion diff across the whole file; reverted in
favor of targeted `Edit` calls):
- `sources.formal_records.record_count`: 101 → 115.
- `counts.decision_rows.formally_migrated`: 94 → 108;
  `not_yet_reconciled`: 65 → 51 (total unchanged at 318).
- `digests.public_rows.count`: 242 → 256; `.digest`:
  `c1125869…` → `5733cae3…`; `.scope_date_digest`: `e1fbbdc6…` →
  `a64c077a…` (recomputed against the archive via `recompute-scope-date.mjs`
  in the session scratchpad, 256 public rows bound).
- `digests.all_rows.digest`: `1c5fd9cc…` → `4e2cdafc…` (count unchanged at
  318).
- 14 new `formal_records` entries appended (one per row, `source_kind:
  notion-row`).
- 14 new `decision_rows` public entries appended, each
  `disposition: formally_migrated`, `title_sha256` carried over unchanged
  from the private projection, evidence pointing at the new record file.
- `private_rows.count`: 76 → 62; `.digest`: `a7757530…` → `0fdd261e…`;
  `.counts_by_disposition.not_yet_reconciled`: 65 → 51.
  `private_rows.commit` left unchanged at `b843fca1…`, per the brief (the
  archive repository itself is not touched by this batch).
- `exit_gaps[G1].gap`: leading count `65 (64 global, 1 temporary)` → `51
  (50 global, 1 temporary)`; one new sentence naming this batch's 14 ids;
  14 new evidence entries (the new record files).

## Checks

- `npm run archive:index` then `npm run context:generate` (in that order,
  as required); both staged.
- `npm run context:check`: clean (`no warnings`) after staging the new
  record files and fixing `formal_records.record_count`. Before staging,
  it reported 20 `WARN REGISTER_IDENTITY_NOT_PUBLIC` findings (10 distinct
  ids, most duplicated) because that check's "public" identity set is
  built from `git grep --cached` against the index, not the working tree
  (the new record files were on disk but not yet staged). Staging them
  cleared every one of those warnings; no code or register content
  changed to fix them.
- `npm run context:test`: every test passed (the CI check job is the receipt for this documentation-only PR).
- `validatePrivateProjection` (imported directly, run against this
  batch's private file plus the PR's register): 0 findings.
- `node scripts/m2-closure-verify-private-rows.mjs` (the operator
  verifier, over `gh api` against the archive repository): 91 failures,
  every one in the expected private-count/digest family: the archive
  repository at `b843fca1…` still carries the old 76-row file, so the
  operator's fetch sees 14 rows this PR moved to public still present in
  the private source, producing `PRIVATE_COUNT_MISMATCH`,
  `PRIVATE_DIGEST_MISMATCH`, `ALL_ROWS_DIGEST_MISMATCH`,
  `EXPORT_ROW_DUPLICATE` (×14), `PRIVATE_ROW_ALSO_PUBLIC` (×14),
  `PRIVATE_ROW_ALREADY_PUBLIC` (×14), `PRIVATE_ROW_MUST_BE_PUBLIC` (×28),
  and `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` (×14). No `scope_date_digest`
  failure among them, matching the brief's requirement. This is the same
  drain-lag pattern batches 4-13 reported; closing it requires a push to
  `strale-io/strale-context-archive`, out of scope for this batch.
- `node apps/api/scripts/check-pii.mjs --strict`: clean.
- `node apps/api/scripts/check-no-committed-secrets.mjs`: clean (2,692
  tracked files scanned).

## Not touched

`docs/programs/**`, `docs/decisions/id-collisions.yaml`, `CLAUDE.md`,
`AGENTS.md`, `apps/api`, `packages`, `manifests`, `config`, Notion. No
`git stash` used at any point. No merge performed.
