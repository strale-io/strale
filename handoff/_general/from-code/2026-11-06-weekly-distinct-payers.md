Intent: record the weekly distinct-payers metric, the first Codex build for Strale.

# Weekly distinct payers (2026-11-06)

- **Built by Codex** (task `task_e_6aedca6d937c8329a0c75dc30336e5ad`) from `docs/lanes/codex/weekly-distinct-payers-brief.md`. The orchestrator reviewed it and ran the tests. Codex's own account of the work is in `docs/lanes/codex/weekly-distinct-payers-report.md`.
- **What it adds:**
  - `discreteWeeks()` now carries `payers`: the distinct payer identities (`ACTOR_KEY_SQL`) with a completed paid call in that ISO week. Revenue it cannot attribute to a payer is not counted.
  - `payerTrend()` compares the two newest completed weeks and never reads the week in progress.
  - `commercial-brief` prints both, in text and in `--json`.
- **Where it is read:** the daily run's commercial pack (`apps/api/scripts/commercial-brief.ts`), which is the weekly distinct-payers metric for the distribution program's goal of a second paying customer. It needs no deploy step, because the script reads production with the read-only role when the daily run calls it.
- **Next:** the next daily run reads the first real figures. The distribution program's D10 and T11 weekly records should cite the payer count from now on.
