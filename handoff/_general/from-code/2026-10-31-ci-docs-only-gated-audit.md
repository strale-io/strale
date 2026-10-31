Intent: close the checkpoint's next action — audit the twelve CI steps still gated on `docs_only` — and leave the rule held by a test that observes reads instead of matching source text.

# docs_only gated-scanner audit, 2026-10-31

Resumes `2026-11-01-orchestrator-checkpoint-cloud-move.md` (§ Next action).

## Result

All twelve gated scanners are **correctly gated**; none moves. Each reads only
paths a docs-only PR cannot change (`isDocsPath`: `docs/`, `archive/`,
`handoff/`, a root `*.md`):

| scanner | reads |
|---|---|
| check-mjs-syntax, check-no-direct-getexecutor-in-scripts | `apps/api/scripts/` |
| lint:no-bare-catch, lint:no-new-console, check-no-external-column-access, check-fetch-timeout-coverage | `apps/api/src/` |
| lint:no-unguarded-user-fetch, check-ssrf-inventory | `apps/api/src/capabilities/` |
| check-framework-packages | `packages/` |
| check-cost-class-coherence, check-identity-fixture-shape, check-tier-coverage | `manifests/` (+ capabilities, tier fixtures) |

## What changed

`scripts/ci/docs-only-scanner-gate.test.mjs` now **runs** every gated
`node *.mjs` scanner (following `npm --workspace=W run S` to the script and
the cwd npm uses) under `scripts/ci/fs-trace-preload.mjs`, which records each
fs read and child-process spawn. It fails if a gated scanner reads a docs
path, lists a docs directory, or spawns `git ls-files` / `git grep`. The
previous version inferred this from source text and named its own blind spot
(a `readdirSync('docs')` walker passed); a positive control now covers that
exact case. The ten gated steps that are not scanners (builds, typecheck,
package test suites) are named in `NOT_A_SCANNER`, so a new gated step must be
traced or classified. Fail-before: planting `readdirSync("docs")` in
check-ssrf-inventory turns test 3 red; removing it turns it green.

## Next

Nothing left from the checkpoint's next action. Next orchestrator pick comes
from the checkpoint's "Open, and owned by nobody yet" list; the time-bound one
is the Serper renewal cost due 2026-11-06 (expiry 2026-11-08).
