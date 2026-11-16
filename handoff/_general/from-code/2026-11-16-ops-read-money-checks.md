Intent: add five read-only money-path checks to ops-read (A-7, B-6, B-5) and record that DQ-33 waits only for Petter's close.

- Checks: capability-debits, solution-debits, kept-charges, swallowed-failure-exposure, fx-error-rate in `apps/api/src/lib/ops-read.ts`, built from `docs/lanes/codex/ops-read-money-checks-brief.md` (Claude build; the Codex route had no branch to start from).
- Builder report: `docs/lanes/codex/ops-read-money-checks-report.md` (deviations and doubts).
- Next authorised action: after merge and deploy, run the five checks through `bws run` against production, time each against the 5 s cap, write receipts under the brief's privacy table; Q5 before 2026-12-09 | Owner: Strale master | Blocker: merge and deploy
