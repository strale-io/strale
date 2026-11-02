Intent: find out why `meta-daily` showed as never succeeding on `/health/jobs`, and fix it.

- **Cause.** `free_tier_health`, one of the six daily meta checks, bound a JS array into `ANY(${...})` in a drizzle `sql` template. drizzle renders a row tuple, and Postgres refuses it. The check returned "Check error" on every run since it was written (2026-03-20). Since #774, the meta-daily heartbeat needs every daily check to complete, so it was never written. Reproduced on a local Postgres 16 with the schema and all startup migrations applied.
- **Fix.**
  - The check now selects by the canonical `is_free_tier` flag; the hardcoded list named 5 of 11. It fails on an empty set.
  - The same defect in `digest-compiler.ts` and `reply-webhook.ts` now uses a parameterised `IN` list.
- **Guards.**
  - `no-drizzle-any-array.test.ts`, a repo-wide scan.
  - `meta-monitoring.free-tier.test.ts`, unit-level.
  - `meta-monitoring.integration.test.ts`, which runs the daily checks on real Postgres in CI's integration-db job.
  - Each was shown failing on the unrepaired code through `mutation-test.mjs`.
- **Tool fix.** `mutation-test.mjs` now refuses a `--find` that matches more than once. It had mutated the first match only, which gave a false SURVIVED here.
- **LESSONS.** F5 incident 12 (this defect) and F11 incident 7. This session discarded its own uncommitted fixes with `git checkout HEAD --` during a fail-before run, then rewrote them.
- **Production check after deploy:** `GET https://api.strale.io/health/jobs` should show `meta-daily` `ok: true` within 24 h of the deploy, since the daily slot is due once a day. Production-watch issue #797 holds the pending counter.
