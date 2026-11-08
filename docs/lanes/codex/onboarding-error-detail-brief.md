Intent: Codex builder brief: the onboarding pipeline names the safe cause of a failure (error class, authority-violation field names), so a failed run can be diagnosed without database access.

# Brief: onboarding failures say why, safely

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08.
- **Branch:** push only `codex/onboarding-error-detail`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests run offline with a mocked DB, matching the existing onboarding pipeline tests.
- **Read first:**
  - `apps/api/src/lib/onboarding-pipeline.ts`, especially the `catch (error)` near the end of the run, which logs `onboarding-pipeline-failed`;
  - `apps/api/src/lib/capability-field-authority.ts` (`AuthorityViolationError`, `FIELD_CATEGORIES`);
  - `apps/api/src/routes/internal-onboarding.ts`;
  - the existing tests: `rg -l "onboarding-pipeline|runOnboarding" apps/api/src --glob '*.test.ts'`.

## Why

On 2026-11-08 the GitHub workflow "Onboard capability" ran `image-resize` in backfill mode. The run committed the known_answer test-suite update, then failed at stage `persistence`.

- **API log:** `onboarding-pipeline-failed`, `stage: persistence`, `code: pipeline_error`, with no `sqlstate`.
- **Run result:** "Onboarding failed. Check the reviewed manifest and API logs before retrying."
- **Why that is a dead end:** the catch deliberately drops the error message, because driver errors can carry credentials or SQL values. That is right for driver errors. But the most likely cause here is an `AuthorityViolationError`, manifest drift on a manifest-canonical field, and that error is our own, with no secrets in it. So the run can only be diagnosed by someone with database access.

## What to change

1. **The `catch (error)` in `onboarding-pipeline.ts`.** Add safe detail to both the `log.error` payload and `result.errors`:
   - **`error_class`:** the error's constructor `name`, only when it matches `^[A-Za-z][A-Za-z0-9]{0,63}$` (for example `AuthorityViolationError`, `ZodError`, `TypeError`). Omit it otherwise.
   - **For `AuthorityViolationError`:** `violation_fields`, an array of the `field` names from `error.violations`, each checked against the keys of `FIELD_CATEGORIES`, and a `reason` per field taken from the violation's `reason` (a fixed string in our code).
     - **Never** log or return `manifestValue` or `dbValue`. They can be large, and a DB value may hold data that is not ours to print.
     - Set the `result.errors` entry to code `authority_violation`, with the message "Manifest and database disagree on: <field list>. Update the manifest to match the database, or re-seed the database to match the manifest."
   - **Keep:** the existing `sqlstate` behaviour, the `timeout` behaviour, and `OnboardingError` passthrough.
   - **Driver and other errors:** never add their raw message.
2. **Other dead-end failures.** If any other known, secret-free error class can reach that catch (check `persistCapability`, `diffAndUpdateLimitations` and `normalizeManifestToRow`), do one of two things:
   - map it to a specific `result.errors` code with a fixed message;
   - or list it in the report as not handled, and say why.
3. **No behaviour change** to what the pipeline commits, the order of its steps, or the authority rules themselves.

## Tests

Each must fail against origin/main.

1. A backfill whose `persistCapability` throws `AuthorityViolationError` on `[maintenance_class, processes_personal_data]`:
   - the log call includes `error_class: "AuthorityViolationError"` and `violation_fields: ["maintenance_class","processes_personal_data"]`;
   - `result.errors` has code `authority_violation` and names both fields;
   - neither the log nor the result contains the manifest or DB values. Use sentinel values such as `"SECRET-SENTINEL"` and assert they are absent from the serialized log and result.
2. A driver-style error with a message containing `password=hunter2` and `cause.code = "23505"`: the log has `sqlstate: "23505"` and `error_class`, and neither the log nor the result contains `hunter2`.
3. An error whose `name` is not identifier-shaped (`"x y<script>"`): `error_class` is omitted.
4. Existing pipeline tests still pass.

## Done when

- `cd apps/api && npx vitest run` passes on the onboarding pipeline, internal-onboarding and capability-field-authority test files, plus any test that imports `onboarding-pipeline`.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- The full `npx vitest run` in `apps/api` passes. Report every failing file.
- `docs/lanes/codex/onboarding-error-detail-report.md` lists the files changed, the exact safe fields added, each test, and the commands run with their results.
