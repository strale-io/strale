Intent: make founder-accepted vendor and source permissions durable and checked; leave this branch uncommitted for orchestrator review.

Built on `chore/serper-resale-accepted` without switching branches. Existing
vendor record content and exports are preserved; records now live in typed
JSON. Permitted public-terms rows have a basis; Serper has its role-address
reply, scope, evidence, Petter acceptance and three reopening events.

Archived the exact wording available in DQ-39 and OUTBOX, explicitly identifying
it as recorded excerpts rather than a full email export. Added write-once archive
instructions, docs index registration, the REVIEW always-check rule, and the
accounts/email recorded-permissions rule. CLAUDE.md was not edited.

The guard reads Git JSON at the merge-base with origin/main and HEAD, also checks
the working copy, validates evidence and decision references, and rejects silent
changes to an accepted permission. Supersession must name an original reopening
event and provide a decision and evidence. Archive files stay immutable even after
supersession. First JSON introduction is explicitly reported; absent origin/main
reports HEAD-only checking. Malformed historical JSON fails closed.

Verification evidence: `archive/receipts/2026-10-28-test-run-vendor-permissions.json`.

Independent review: technical and product reviewers each completed two read-only
rounds. Both returned GO after fixing scope-edit and post-supersession archive
protection gaps. No remaining findings. The simplify skill was unavailable;
author performed a direct simplicity review without expanding the implementation.

No production access, vendor contact, live checks, commit, push, PR, merge or
publication. No production commands remain. The orchestrator owns final review,
commit and shipping. Session gate findings are `dirty`, `branch` (this isolated clone is treated as
trunk on a feature branch), `merged-branch` (existing local and remote branches),
only. The initial `resume-surface` finding cleared once this handoff existed.
Do not switch branches or remove existing branches to satisfy this gate. Remote fetch was
unavailable to that checker, so its remote findings may be stale.

Verification results (details and exact outcomes in the linked receipt):

- MCP build and API typecheck passed, including a typecheck after final type edits.
- Targeted vendor-terms, data-access and branch-touched auto-register tests passed.
  The permission-removal test fails on a missing permission and passes after
  restoring it. Guard tests pass with planted committed downgrade, supersession,
  whole-permission edits and post-supersession archive edit/deletion cases.
- `vendor-terms:check`, `docs:check`, `claims:check`, `programs:check`,
  `receipts:check`, `env:check`, `models:check`, and `docs:test` passed.
  Receipt validation warned about existing historical bare test counts.
- The initial targeted and full run caught an incorrect checker import path;
  it was corrected, then the targeted tests passed.
- The complete API suite was run again after that fix. It remains RED:
  `manifest-text-sync.test.ts` and `public-trust.test.ts` exceeded timeouts;
  `search/search-quality.test.ts` exceeded its performance threshold.
  All failing files passed when rerun with `--maxWorkers=1` (the first rerun
  also covered `search-aliases.test.ts`). These results are consistent with
  resource contention; a green full-suite run is still unverified. No unrelated
  tests or thresholds were edited.
- `git diff --check` passed; an independent data comparison proved all original
  record fields unchanged. Normal guard output explains the first introduction
  of JSON because the merge-base and existing HEAD predate that file.

Remaining before shipping: orchestrator reviews and commits the work, then
obtains the required green full-suite/CI result. No deploy or database step is
needed for this repository record and check change.


Files changed:

- `apps/api/src/lib/vendor-terms.ts`, `vendor-terms.data.json`, `vendor-terms.test.ts`
- `scripts/check-vendor-terms.mjs`, `scripts/check-vendor-terms.test.mjs`
- `package.json`, `.github/workflows/ci.yml`, `REVIEW.md`
- `docs/README.md`, `docs/operations/accounts-and-email.md`
- `docs/operations/vendor-permissions/README.md`, `2026-10-27-serper.md`
- `archive/receipts/2026-10-28-test-run-vendor-permissions.json`
- This handoff.
