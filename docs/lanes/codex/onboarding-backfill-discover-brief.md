Intent: Codex builder brief: a backfill with discover on no longer fails on its own discovery; discovered reliability changes go to the review YAML, not to the database check.

# Brief: backfill + discover stops tripping the authority check

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-09.
- **Branch:** push only `codex/onboarding-backfill-discover`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests run offline with a mocked DB and a mocked executor, matching the existing tests in `apps/api/src/lib/onboarding-pipeline.test.ts`.
- **Read first:**
  - `apps/api/src/lib/onboarding-pipeline.ts`:
    - `discoverFixtures` (around line 952), especially the merge into `manifest.output_field_reliability` around line 1016;
    - the backfill path (around line 1519), where `manifest = disc.manifest` is followed by verification and persistence;
    - where `result.updatedManifestYaml` is set;
  - `apps/api/src/lib/capability-field-authority.ts` (`FIELD_CATEGORIES`, `category: "manifest"`);
  - `apps/api/src/lib/onboarding-gates.ts` (`checkAuthorityDrift`);
  - `.github/workflows/onboard-capability.yml` (`discover` defaults to `true`) and `.github/scripts/onboard-capability.mjs` (the step summary).

## Why

On 2026-11-09 the "Onboard capability" workflow ran an `image-resize` backfill with discover on, the form's default. It failed twice with `authority_violation` on `output_field_reliability`. With discover off, the same backfill succeeded.

The cause:
1. In backfill mode, discovery runs the tool.
2. It finds an output field the manifest does not list (`format`) and adds it to `manifest.output_field_reliability` in memory.
3. Persistence then compares that in-memory manifest with the database row.
4. `output_field_reliability` is manifest-canonical, and the two differ, so the run throws `AuthorityViolationError`.

So any backfill with discover on fails for every capability whose output has a field its manifest does not list. The test-suite update that ran earlier in the same backfill is committed anyway.

## What to change

1. **Backfill discovery never changes manifest-canonical fields of the persisted manifest.**
   - In backfill mode against an existing row, discovery may still update the test fixtures it already updates, such as known_answer, as it does today.
   - Every key whose `FIELD_CATEGORIES` category is `"manifest"` must reach persistence and the authority check exactly as it was in the reviewed manifest.
   - Today that is `output_field_reliability`; write the rule against the taxonomy, not a hard-coded field name.
2. **The discovered additions are still reported.**
   - They appear in `result.updatedManifestYaml`, the YAML the workflow saves for review.
   - Add one `result.errors`-style notice, or a warning field if the result already has one. Use code `discovered_fields_not_applied` and the fixed message: "Discovery found output fields the manifest does not list: <fields>. They are in the review YAML; add them to the manifest and sync the database to apply them."
   - The field names come from the executor's output keys. Include only identifier-shaped keys (`^[A-Za-z_][A-Za-z0-9_]{0,63}$`), and never include values.
   - This notice must not make the run fail.
3. **Onboard mode (a new capability) is unchanged.** Discovery still merges into the manifest that is persisted.
4. **No change** to the authority rules, the order of steps, or the workflow's defaults.

## Tests (each must fail against origin/main)

1. **Extra field, backfill.**
   - Setup: a backfill with discover on, an existing DB row whose `output_field_reliability` equals the manifest's, and an executor mock that returns one extra field (`format`).
   - Expect: the run does not fail with `authority_violation`; the persisted or compared manifest has the original reliability map; `updatedManifestYaml` contains `format`; the result carries `discovered_fields_not_applied` naming `format`.
2. **Onboard mode, same executor output.** The persisted manifest includes `format`, unchanged from today.
3. **Values never leak.** A discovered field whose value is a sentinel string: the sentinel is absent from the notice and the log.
4. **Existing tests still pass.**

## Done when

- **Targeted tests pass:** `cd apps/api && npx vitest run src/lib/onboarding-pipeline src/routes/internal-onboarding src/lib/capability-field-authority src/lib/onboarding-gates`.
- **`npm run typecheck` passes.** Build `packages/mcp-server` and `packages/sdk-typescript` first.
- **The full `npx vitest run` in `apps/api` passes.** Report every failing file.
- **`docs/lanes/codex/onboarding-backfill-discover-report.md` exists**, listing the files changed, each test and what it pins, the commands run with their results, and anything not done.
