# x402 watch live buyer 2 — builder report

## Files changed

- `apps/api/src/jobs/x402-settlement-watch.ts` — adds the `reduced` verdict for a qualifying dominant buyer that is still settling, routes it through a separate warning cooldown key, and documents the rail-proof rule.
- `apps/api/src/jobs/x402-settlement-watch.test.ts` — pins the new classification boundaries, alert routing, and the two deliberately changed existing verdicts.
- `docs/lanes/codex/x402-watch-live-buyer-2-report.md` — records this delivery.

## Tests added

- `treats the first-week shape as reduced while the dominant buyer keeps settling`
- `keeps the first-week shape broad when the big buyer stops`
- `uses 20 percent of the dominant buyer baseline as the reduced boundary`
- `requires the still-settling buyer to hold at least half the baseline`
- `never lets a tiny second payer qualify as live-buyer rail proof`
- `routes a reduced verdict to its warning key without rollback text`
- `keeps a broad verdict on the critical key`

The existing `a slow degradation keeps paging as long as the mean did` expectation and both verdict expectations in `a quiet day inside a ramp is not the payer coming back, so a ramp that breaks pages` now expect `reduced`, as required by the brief. No other existing verdict expectation changed.

## Verification

- `npm --workspace=apps/api exec vitest run src/jobs/x402-settlement-watch.test.ts` — passed: 42 tests.
- `npm --workspace=apps/api exec vitest run src/jobs/x402-settlement-watch.integration.test.ts` — skipped: all 6 tests require the unavailable test database.
- `npm run typecheck` — API and API-script typechecks passed, then the repository-wide command failed in the unchanged `packages/langchain` workspace because its `straleio` dependency was not built/resolvable in this fresh worktree (`TS2307`), followed by two existing unknown-error diagnostics (`TS18046`).
- `cd apps/api && npx tsc --noEmit --project tsconfig.json` — passed.
- `git diff --check` — passed.

## Not done

- The database-backed integration suite was not run because `DATABASE_URL_TEST` is not available; Vitest reported the suite as skipped.
- The full repository typecheck could not complete for the unchanged LangChain package dependency issue described above. The directly changed API workspace typechecked successfully before that failure.
- Independent technical and product review found no HIGH-severity issue. Both reviews noted that the required operator sentence names the 20-percent boundary without also naming the absolute 10/day floor. The implementation and tests pin the full `max(10/day, 20 percent)` rule; the alert retains the brief's required wording rather than expanding scope beyond it.
