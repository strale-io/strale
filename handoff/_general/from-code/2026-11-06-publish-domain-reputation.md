Intent: Publish the corrected domain-reputation text (PR #927) to the live rows through one append-only startup-migration block, because the boot-time manifest text sync refuses compliance-category capabilities until Petter approves.

[BACKFILL] Cloud session; no Notion write was made.

## Approval

Petter, in session 2026-11-06, orchestrator session session_01CR5YPsTtEwE3tRQtvTzerw, answering "1. Publish domain-reputation" to "Publish the corrected domain-reputation text ... compliance tools need your OK even for a narrowing". Cited in the block header.

## Delivered

- `apps/api/src/startup-migrations/blocks/0143-publish-domain-reputation-text.ts` (ledger id M086, run policy `once`), registered in `BLOCKS`, `run-policy.ts` and `startup-migrations.ledger.json`.
- It writes:
  - `capabilities.data_source` for `slug = 'domain-reputation'`, guarded by `IS DISTINCT FROM` the new text;
  - `capability_limitations` of `domain-reputation`: active rows not in the manifest are deleted, the two manifest rows are inserted if missing (sort_order 0 and 1), moved rows get the new sort_order. Same effect as `diffAndUpdateLimitations`, done in SQL because blocks run on a raw executor, not a Drizzle transaction;
  - `solutions.long_description` for `slug = 'domain-trust'`, guarded on the exact production text read from `GET /v1/solutions/domain-trust` on 2026-11-06.
- Not written, on purpose: `capabilities.updated_at` and `solutions.updated_at` (invariant-checker reads `capabilities.updated_at` as "the capability changed"; block 0123 follows the same rule).
- Ledger: `known_overlaps` entries added for `capabilities.data_source` (M065 sanctions-check vs M086 domain-reputation) and `solutions.long_description` (M086 added; slug disjoint from M064 and M066).
- Test `apps/api/src/lib/startup-migration-0143.test.ts`.
- `startup-migrations.test.ts`: the "block numbers only ever increase" ceiling moved from 142 to 143 and the registered-block list gained 0143.

## Order with PR #927

The block's text equals PR #927's manifest, limitations seed and `domain-trust` solution copy. The test "equals manifests/domain-reputation.yaml exactly" is skipped while the manifest on main still carries the old overclaim, and runs by itself once #927 is merged (it passed when run against #927's manifest). Either order of merge is safe; merge #927 first so the manifest and the live row agree.

## Deploy verification (DEC-20260504-C)

Dependency: `BLOCKS` in `lib/startup-migrations.ts` is called by `runStartupMigrations()` from `index.ts`; `run-policy.ts` lists the block as `once`. Post-deploy checks are in the PR/orchestrator report: `GET /v1/capabilities/domain-reputation` must show the new `data_source`, `GET /v1/solutions/domain-trust` the new `long_description`; limitations are not exposed publicly and need the read-only production DB (PC-only) or the admin route.

## Not done

- No PR opened (instructed). No production query run from this session.

Next authorised action: orchestrator opens the PR for fix/publish-domain-reputation-text after #927 merges, then verifies the served text after deploy | Owner: orchestrator | Blocker: none
