# Silent upstream catch guard

Promise-audit T1's static guard scans TypeScript capability sources without
importing executors or using credentials. Run `npm --workspace=apps/api run
lint:upstream-catches`; use `-- --json` for the full candidate list. Both the
guard and its planted-failure tests run on every CI check job. The original
`lint:no-bare-catch` remains enabled.

The scan covers `apps/api/src/capabilities`, not shared helpers under
`apps/api/src/lib`. Shared-helper behaviour still needs its own tests/review.

It checks ordinary `catch` clauses and inline or named Promise `.catch`
callbacks. A handler must visibly throw/reject, log, return a literal
`unavailable: true` or `skipped: true` marker, or carry a reviewed local
`// degraded-ok: <reason>` comment. Put that comment first inside the handler
body, or immediately before its callback/catch clause. It applies to that
handler only. An exception must explain why the fallback is valid and where
the required result is checked. Exceptions are listed in both the normal CI
output and JSON report. Structured `log.debug`/`logger.debug` calls are not
accepted as evidence: production's normal info threshold suppresses them.

The guard tracks simple branches and early returns. Nested functions, later
logging, comments, strings, conditional-only throws/logs and overwritten
markers cannot disguise silent paths. Complex control flow and named helpers
are conservatively reported for review. The scanner is not an interprocedural
analysis: HTTP error handling without a catch, `.then` rejection callbacks,
the semantics of helper bodies and the actual billability of returned data
still need perturbation replays and independent review. A log meets this
audit's observability rule; it does **not** prove that a failed call is free.
The proposed `degraded` billing marker is not assumed implemented or accepted.

## Existing debt

`upstream-catch-baseline.json` records existing candidates, not approved safe
behaviour or a count of confirmed billing defects. Each entry identifies the
file, an exact syntax fingerprint of the handler and its source context, and
the allowed number of identical occurrences. Formatting, line-ending and
comment changes do not change the fingerprint. A semantic/context change must
be fixed or explicitly reviewed rather than borrowing an old allowance.

When fixing a handler, remove or reduce its matching baseline entry in the
same PR. The guard fails if an old allowance remains unused, a new candidate
appears, or a baseline entry/count grows against the Git merge base. A removed
entry cannot be restored by regenerating the file. `--snapshot` prints a
candidate inventory for inspection; it does not waive that growth check.
On the first adoption PR, the ceiling is derived from the base commit's source
files, so new debt cannot be smuggled into the initial baseline.

Missing sources, malformed TypeScript, missing/invalid baseline and unavailable
Git history fail closed. CI supplies the pull-request or merge-group base SHA;
local runs default to `origin/main`. Local test fixtures use only disposable
repositories and synthetic source text.

Billing-path repairs, catalogue-wide failure replays and past-charge
reconciliation remain separate promise-audit T1 work. This guard changes no
executor, charge, production record or public customer promise.
