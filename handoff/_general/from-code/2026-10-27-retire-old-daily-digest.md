Intent: retire the old daily-digest email instead of restoring it, and stop the production watch from expecting it.

- The production watch (PR #774) found on its first run that `daily-digest` had last succeeded 196 days earlier, on 2026-04-14. DEC-20260511-F had decided in May to restore it; that never happened.
- Petter decided on 2026-10-27, in session: retire it. The CEO morning brief (DEC-20260822-A) already does this job. The decision is recorded in `docs/company/DECISION-QUEUE.md` under DECIDED.
- Change: `daily-digest` is removed from `apps/api/src/lib/job-watch-contract.json` and from the `readJobFreshness` query; `health-jobs.test.ts` now uses `meta-daily` as its sample. The job script and `lib/daily-digest/` are kept, because the M3 digest shadow and the M4 repo-native digest reuse them.
- Verify after deploy: `GET /health/jobs` lists 25 jobs, all `ok`, and the open `production-watch` issue for daily-digest, if one was opened, closes on the next run.
