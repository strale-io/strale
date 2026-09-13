Intent: M4 batch 7 — add the permanent Notion anti-regression check and make report-only checks blocking, per `archive/sessions/2026-09-11-m4-cutover-inventory.md` section 7 item 7.

## Branch and commits

`m4/b7-blocking-checks`, branched from `origin/m4/cutover`, pushed to
`origin/m4/b7-blocking-checks`. Commits in order (each verified passing on
its own, not only at the branch tip):

1. `b883bec1` fix(protocols): let a coverage row cite more than one decision
2. `ab7a785b` feat(protocols): promote DECISION_ID_UNCOVERED from warning to finding
3. `95d961e3` feat(ci): add the Notion anti-regression check, blocking
4. `27232f98` feat(context): make check-project-context.mjs blocking; retire the duplicate pre-cutover entrypoint invocation
5. `86410971` docs(ci): update stale ci.yml comments; add batch 7 evidence receipts

Part four's two commits (1, 2 above) land first, in the order the spec
requires. Verified each individually via a throwaway `git worktree add
--detach` at that commit plus a fresh `npm install`: `npm run
protocols:coverage`, `protocols:coverage:test`, `context:check` all passed
at commit `b883bec1` alone.

## Part one: the anti-regression check

New `scripts/no-notion-regression-lib.mjs` + `scripts/check-no-notion-regression.mjs`
(`npm run notion-regression:check`/`:test`), wired blocking into
`.github/workflows/ci.yml` after `scheduled:check`/`:test`.

Five signal patterns checked everywhere in the tracked tree: `NOTION_API_KEY`,
`NOTION_TOKEN`, `api.notion.com` (case-insensitive), `@notionhq`, and an MCP
tool name containing "notion". Plus one narrower signal: a bare
case-insensitive "notion" word, restricted to `.claude/` and `.agents/` —
the two live instruction surfaces an agent actually reads at runtime, and
the shape section 1 of the cutover inventory's report found (a skill or
command telling an agent to touch Notion). This last pattern is not in the
spec's literal sketch (which lists only the four-plus-MCP patterns); I
added it because the three named categories below would not otherwise be
caught by the check at all — see "Where the spec and the result differ"
below.

Allowlist, explicit by path, two shapes:
- `FULL_FILE_ALLOWLIST_DIRS`: `archive/`, `handoff/`,
  `docs/decisions/records/` — permanently historical per this repository's
  own conventions (Report Filing Convention, Session contract's append-only
  handoff files, decision records' protected-sections rule).
- `FULL_FILE_ALLOWLIST_FILES`: the two dated M3/M4 migration-inventory
  strategy documents, `docs/programs/cto-readiness/tracks.yaml` (its live
  field, `secrets`/`env`, is separately enforced by `scheduled:check`),
  `docs/operations/distribution-registry.md`, `apps/api/railway-config.md`
  (a documented pre-existing drift, out of this batch's scope per the
  inventory's own note), `apps/api/docs/drift-check-refactor-proposal.md`
  (a deferred proposal), and the check's own library + test file (a scanner
  necessarily names what it scans for).
- `COMMENT_ONLY_ALLOWLIST`: `apps/api/scripts/check-vendor-roster-drift.ts`
  and `.github/workflows/ci.yml` — exempt only on a comment line for that
  file's language. A genuine new read added to either file on a
  non-comment line still fails; proved by two dedicated tests
  (`scripts/no-notion-regression.test.mjs`, "is not a blanket exemption").

Handled by rewording (not allowlisting), per "prefer rewording ... every
allowlist entry is a hole":
- `.claude/commands/end-session.md` / `.agents/skills/source-command-end-session/SKILL.md`:
  dropped "Notion" from two historical-explanation lines each, kept the
  explanation ("what the retired per-session journal entry used to carry",
  "replaces the retired to-do query").
- `.claude/skills/vendor-switch/SKILL.md` / `.agents/skills/vendor-switch/SKILL.md`:
  "the Notion DPA template" -> "the vendor's DPA/sub-processor template
  documentation".
- `scripts/scheduled-reachability-lib.mjs`'s docstring,
  `scripts/scheduled-reachability.test.mjs`'s fixtures,
  `config/scheduled-mechanisms.yaml`'s header comment, and
  `config/scheduled-mechanisms.schema.json`'s field description all used
  `NOTION_API_KEY`/`NOTION_TOKEN` only as illustrative env-var-name
  examples; renamed to `SOME_API_KEY`/`SOME_TOKEN`.

Planted-failure proof (in `scripts/no-notion-regression.test.mjs`, 24
cases): each of the five patterns fires in ordinary code outside every
allowlist; each `FULL_FILE_ALLOWLIST` entry does not fire; each
`COMMENT_ONLY_ALLOWLIST` entry does not fire on its comment but does fire
on a planted non-comment read in the same file; the instruction-surface
scan fires in `.claude/`/`.agents/` and nowhere else, and is whole-word
("notionally" does not fire); a bare `notion.so` citation URL never fires
anywhere (it is how the rest of the codebase cites a Notion page as
historical provenance, confirmed by a 60-file sweep during design — none
of those files use any of the five real signal patterns).

## Part two: check-project-context.mjs gets a real exit code

Before: `process.exitCode = 0` unconditionally. Run first (governing rule):
`npm run context:check` reported zero findings against this branch, so the
promotion lands green. `process.exitCode = findings.length === 0 ? 0 : 1`
now. Every finding this checker produces is deterministic (generated-file
byte comparison, front-matter contract, decision-record schema/cross-refs,
operator-actions and closure-register checks), matching the migration
plan's "Cutover PR: all deterministic checks become blocking" without
needing a finer severity split.

## Part three: pre-cutover entrypoint guard — analysis and decision

What it catches: `checkPrecutoverEntrypoint()` flags an entrypoint prose
token shaped like `docs/project/...`/`docs/decisions/...` that does not
exist, is a glob, or resolves to a file/directory not `status: active` +
`authority_active: true`.

What would go uncaught if retired outright: nothing. `scripts/entrypoint-parity-lib.mjs`'s
`checkInactiveDocumentReferences` already calls this exact exported
function on both entrypoints (`entrypoint-parity-lib.mjs:1415`), and `npm
run entrypoint:check` already runs it as a blocking CI step with its own
extensive test coverage (`scripts/entrypoint-parity.test.mjs`). The copy
inside `check-project-context.mjs`'s `runChecks()` ran the identical
function against the identical two files for no added protection, and once
part two makes this checker's exit code real, it would have reported the
same finding twice under two npm scripts.

Decision: retired the redundant invocation inside `runChecks()`, kept the
function. It stays exported and unchanged — `entrypoint-parity-lib.mjs`
still depends on it directly — and keeps guarding any future entrypoint
reference to a still-inactive document (`docs/project/candidates/*` today).
Nothing in batch 8 needs the removed copy: batch 8 flips specific files'
`authority_active` values and schema states, and can verify the result via
`entrypoint:check` or the exported function directly, neither touched
here.

## Part four: DECISION_ID_UNCOVERED, decisions array, two ordered commits

Run first: `npm run protocols:coverage` reported
`warn DECISION_ID_UNCOVERED CLAUDE.md: decision id "DEC-20260910-A" ...`
against this branch — the one existing violation the spec named.

Commit 1 (`b883bec1`): replaced the manifest's single `decision` string
field with a `decisions` array (`docs/project/protocol-coverage.schema.json`,
`scripts/protocol-coverage-lib.mjs`'s `coveredDecisions` set now
`.flatMap`s every row's array). The sentinel `"none"` stays a
single-element array (schema enforces `maxItems: 1` when it contains
`"none"`). `review-routing`'s row now cites
`decisions: [DEC-20260903-A, DEC-20260910-A]`. Verified: `npm run
protocols:coverage` reports zero warnings and zero findings after this
commit alone.

Commit 2 (`ab7a785b`): promoted the warning to a finding
(`warnings.push` -> `findings.push`); updated the header docstrings and the
two tests that referenced the old warning-not-finding contract, and added
a test proving a row's `decisions` array covers every id it lists.

## Local CI check-job run (every step, not just the first failure)

Ran the whole `check` job's step list from `.github/workflows/ci.yml`
locally, in order, continuing past any failure rather than stopping at the
first (a chained `&&`/`bash -e` run hides later gates). 59 steps, 59 pass,
0 fail — every REGISTER/CODE lint, all governance registers
(programs/research/design/env/vendors/distribution/protocols/scheduled/models/claims/docs/receipts/migrations/codex/handoff/context),
this batch's own new `notion-regression:check`/`:test`, and
`entrypoint:check`/`:test`. Receipt:
`archive/receipts/2026-09-13-test-run-m4-b7-blocking-checks-tests.json`
(the five directly-touched suites, 165/165) and
`archive/receipts/2026-09-13-check-m4-b7-notion-regression.json` (the new
check's own `--json` output against this branch).

`npm run typecheck` at the repository root needed a one-time
`npm --workspace=packages/mcp-server run build` and `npm
--workspace=packages/sdk-typescript run build` first (fresh worktree, no
prior `dist/`; unrelated to this batch's changes, matches CLAUDE.md's
Worktree node_modules Hazard note) — clean after that across all five
workspaces.

The final `npm test` step (the full `apps/api` vitest suite) is not part
of the REGISTER/CODE gates above; run separately. Result: 278 test files
passed, 7 failed; 4023 tests passed, 8 failed, 334 skipped (4365 total).
Every one of the 8 failures is a DB-connectivity-dependent test
(`wallet.test.ts`, `admin-apply-migrations.test.ts`, `verify.test.ts`,
`test/integration/no-sqs-keys.smoke.test.ts`, `internal-auth.test.ts`,
`public-trust.test.ts`) failing on `DATABASE_URL environment variable is
required` / `CONNECT_TIMEOUT postgres.railway.internal:5432` — no local
Postgres is reachable from this worktree. None of the 8 touch anything
this batch changed (`scripts/`, `config/`, `docs/project/`, `.claude/`,
`.agents/`, `.github/workflows/ci.yml`). Matches the project fact "Local
`npm test` is flaky; CI is the gate" — CI runs against a real database and
this local result should not be read as a regression from this batch.

## Where the specification and the result differ

- The anti-regression check's instruction-surface pattern (bare "notion"
  scoped to `.claude/`/`.agents/`) is not in section 6's literal sketch,
  which lists only `NOTION_API_KEY`/`NOTION_TOKEN`/`api.notion.com`/an
  MCP tool-name pattern/a connector UUID. Without it, none of the three
  categories the brief named ("historical prose in session-end and
  vendor-switch", "a Notion DPA template mention") would ever have been
  caught by the check as literally sketched — they use only the bare word
  "Notion", not any of the sketch's literal strings. I added the narrower
  instruction-surface scan so the check actually catches the failure mode
  those categories exemplify (an agent re-adding a Notion instruction step
  to a live skill/command), rather than only auditing them by hand once.
- I did not implement a literal "Notion connector UUID" check (the
  sketch's fifth item): the connector's own MCP-server UUID is a per-
  session/environment runtime value, not something a static source scan
  can meaningfully pin, and no concrete value was named in the inventory
  to check against. Flagging this as an open gap rather than guessing at
  a UUID to hardcode.
- checkPrecutoverEntrypoint() was neither purely "rescoped" nor purely
  "retired" as the spec's two options frame it — the redundant invocation
  was retired, the underlying guard was not, because it is depended upon
  elsewhere. See part three above.

## Did not do (per the brief's explicit "do not")

- Did not flip any authority marker, schema status value, or
  `authority_active` field (batch 8, must be last).
- Did not touch the Notion API key in the hosting project, the GitHub
  secret, or the Notion workspace.
- Did not open a pull request (brief said not to).

## Next action

Batch 8: the cutover commit — flip authority markers. Must be last. See
`archive/sessions/2026-09-11-m4-cutover-inventory.md` section 7 item 8.
