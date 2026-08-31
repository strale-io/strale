Intent: Populate and verify the first inert repo-native PRODUCT, STATE, and
ROADMAP candidates from the merged 37-claim M2 evidence reconciliation.

## Outcome

- Authored `docs/project/PRODUCT.md`, `STATE.md`, and `ROADMAP.md` as M2
  candidates with `authority_scope: none` and `authority_active: false`.
- Kept root entrypoints and Notion-backed workflows unchanged and active.
- Changed the context generator so it cannot overwrite the authored candidates.
- Added candidate metadata/banner/word-budget validation, exact STATE ref and
  production-status validation, and accidental-entrypoint-activation guards.
- Removed mutable platform counts from authored STATE and preserved a dated
  read-only production summary as evidence.
- Clarified roadmap gates versus continuous/parallel commercial and website work.

## Review

Separate Codex product and technical reviewers examined the working diff. All
high/medium/low findings were resolved; the technical closing verdict was
`PASS — SHIP`. This is same-provider interim evidence. The exact commit and M4
cutover remain queued for Claude cross-provider review.

## Verification

- `npm run context:test` — 12/12 pass after exact-head findings were corrected.
- `node scripts/check-project-context.mjs` — zero findings before final staging.
- `npx tsc --noEmit --project tsconfig.json` from `apps/api` — pass.
- Ajv 2020 strict schema compilation and all candidate validations — pass in
  independent technical review.
- `git diff --check` — clean.

## Next

Commit the exact-head corrections and dispatch a fresh separate Codex re-review.
After that, open/merge the PR if the verdict and CI are green. Continue M2 with
operator-action and pending-decision candidates; do not activate M4 or retire
Notion.

Legacy Journal record:
https://app.notion.com/p/3cd67c87082c815f8911c34ea12a948d?pvs=204
