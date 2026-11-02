Intent: close the checkpoint's next action — audit the CI steps still gated on `docs_only` — and leave the rule held by observed reads, not source text.

# docs_only gated-step audit, 2026-10-31 / 11-01

Resumes `2026-11-01-orchestrator-checkpoint-cloud-move.md` (§ Next action).

## Result

- **The twelve named scanners are correctly gated.** Each reads only paths a
  docs-only PR cannot change (`isDocsPath`: `docs/`, `archive/`, `handoff/`,
  a root `*.md`): `apps/api/src`, `apps/api/scripts`, `packages/`,
  `manifests/`.
- **Two gated test suites were not**, which the checkpoint's list did not
  name (found by the independent review, then measured):
  - `npm test` (apps/api): **eight test files** read docs — CLAUDE.md,
    CHARTER.md, DAILY-RUN.md, DECISION-QUEUE.md, README.md, an archive/
    receipt, ~590 files under docs/, a whole-tree `git grep`, and the
    platform-facts drift checker over docs/listings. A docs-only PR could
    break any of them and go green.
  - `npm test --workspace=packages/zapier-strale`: reads
    `docs/company/claims.yaml`.

## What changed

- `scripts/ci/fs-trace-preload.mjs` + `scripts/ci/run-without-docs-reads.mjs`:
  run a command with the preload carried into every node process via
  NODE_OPTIONS; fail on any docs read or whole-tree git call; fail if no
  process reported a trace.
- apps/api vitest now has two projects: `code` (gated, run under the
  wrapper) and `docs` = `DOCS_READERS` in `apps/api/vitest.config.ts`
  (always runs, needs no build). Local `npm test` still runs all 448 files.
- Zapier suite ungated (1 s). n8n lint/test, ai-sdk, cli and the
  framework-packages test stay gated, under the wrapper (all traced clean).
- `docs-only-scanner-gate.test.mjs` runs the twelve scanners under the trace
  and requires every gated step to be traced, wrapped, or a named build;
  positive controls cover readdirSync, fs/promises, shell-string git, a
  mocha child process.
- Fail-before: a planted `readdirSync("docs")` in check-ssrf-inventory turns
  test 3 red; the first wrapped `test:code` run failed listing the
  drift-checker reads until free-tier-rate-limit.test.ts joined DOCS_READERS.

## Cloud-clone note

A fresh cloud clone is shallow; the pre-commit context check then fails on
ancestor checks. `git fetch --unshallow origin` plus fetching
`ad67e433` (operator-actions prepared_ref) clears it.

## Next

Serper renewal (now owned by the orchestrator, due 2026-11-06): cost at
observed volume, whether anything needs it past 11-08, and whether a funded
verification key for `/resolve` belongs in the same decision.

## Independent reviews

Two fresh read-only Claude agents (same provider, separate context, per the
2026-09-07 review policy). Review 1 found the two docs-reading suites above.
Review 2: PASS WITH NITS; fixed — apps/api vitest pinned to `pool: "forks"`
(the trace reaches child processes, not worker threads) and asserted by the
gate test; a recursive listing of the repo root or an ancestor now counts;
the preload is passed as a file URL so `--import` works on Windows. Known
limits left as stated: a child spawned with an env that drops NODE_OPTIONS,
non-node children (`sh -c 'git ls-files'`, `grep -r`), and worker threads in
code that is not vitest.
