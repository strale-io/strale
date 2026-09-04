Intent: add a documentation-only fast path to `.github/workflows/ci.yml` so PRs
touching only docs/archive/handoff/root pointer files skip the ~10 minute
apps/api test suite and the ephemeral-Postgres `integration-db` job, while
every register check (`*:check`/`*:test` for programs, research, design, env,
models, claims, docs, archive index, receipts, migrations, codex, handoff,
context, plus `check-shape-contracts.mjs`) keeps running unconditionally.

What changed:
- New `classify` job computes `docs_only` from `git diff --name-only
  <merge-base>...<head>` (fetch-depth 0, no third-party action). Every CODE
  step in `check` and the whole `integration-db` job gate on
  `needs.classify.outputs.docs_only == 'false'`. A push to `main` always
  computes `docs_only=false`. The `check` job keeps its name for branch
  protection.

Evidence: PR https://github.com/strale-io/strale/pull/533 (not merged).
Two throwaway proof PRs (base = this branch, since diffing straight against
`main` would always include the workflow file itself and defeat the test)
were opened, watched, and closed:
- docs-only diff: https://github.com/strale-io/strale/actions/runs/33909957159
  (integration-db skipped; all CODE steps skipped; all REGISTER steps ran)
- docs+code diff: https://github.com/strale-io/strale/actions/runs/33909991763
  (integration-db ran and passed; all CODE steps ran and passed; REGISTER
  steps ran)

Both proof runs hit a pre-existing, unrelated `context:test` failure
(`docs/project/legacy-authority-inventory.json` drift, confirmed present on
`origin/main` via `git diff origin/main -- docs/project/legacy-authority-inventory.json`
= no diff). Flagged as a separate follow-up task, not fixed in this session.

Left open (see PR body "Left open / deviations" for full detail): a handful
of scripts that scan docs/handoff content for secrets/PII/CEO-brief shape
(`check-no-committed-secrets.mjs`, `check-pii.mjs`,
`check-manifest-guaranteed-consistency.mjs`, `check-ceo-brief.ts`) are
classified CODE rather than REGISTER because they are not literally named
`*:check`/`*:test` register scripts in the task's explicit REGISTER list —
so a docs-only PR that slips a secret or PII into a docs/handoff file will
not be caught until a future code-touching PR runs `check`'s CODE steps.

Next action: none pending on this track — PR #533 is open for review, not
merged. A follow-up session should pick up the flagged
`legacy-authority-inventory.json` drift fix (spawned as a background task
during this session) if it hasn't been picked up already.
