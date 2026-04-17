# PHASE C COLUMN INVESTIGATION — `transactions.integrity_hash_status`

**Mode**: read-only investigation. No SQL writes performed during this
session. Three standalone Node scripts
(`apps/api/scripts/investigate-hash-status.mjs`,
`phase-c-db-archaeology.mjs`, `phase-c-damage-estimate.mjs`) connect to
the production DSN and run `SELECT` / `SELECT COUNT` only.

**Conclusion up front**: the column was added to prod **by my Phase C
migration today (~15:30 UTC)**. Something else — not any git-tracked code,
not any sibling Railway service, not any sibling GitHub repo — overwrote
205 rows with `'customer'` / `'test'` values between 15:30 UTC and 16:24
UTC. No pre-existing data was destroyed by my migration because there
was no pre-existing data in this column. The damage estimate is
**semantic confusion going forward**, not lost prior state. Recommended
action: **Option A** from the pre-deploy report — rename Phase C's
column to `compliance_hash_state`, ship a new 0048 migration that
creates the renamed column, leave the now-appropriated
`integrity_hash_status` for whoever is using it.

---

## 1. Git archaeology results

The column name appears in git history **only** in my Phase C work:

```
$ git log --all -S 'integrity_hash_status' --oneline
2f5e28d docs(phase-c): summary of P1 fixes + close the SSRF migration TODO
d0b6203 fix(compliance): F-0-009 stage 2 — integrity hash two-phase with retry worker
```

Plus the merge commit `5f19efa` (Phase C ↔ main). Commit `d0b6203` is
mine, `Fri Apr 17 01:46:07 2026 +0200` (i.e. 2026-04-16 23:46 UTC —
yesterday evening).

`git log --all --full-history -p -- '*integrity_hash_status*'` shows
only the files from `d0b6203` (the Stage 2 implementation) and
`2f5e28d` (the report that references them). No other branch, no
removed-from-tree commit, no migration file, no SQL file anywhere in
the repo history touches this column.

`git grep --all` across every ref in `strale-io/strale`: zero hits
outside the Phase C commits.

Sibling Strale-org repos checked for the column name (both in GitHub
org listing and local clones): `strale-frontend`, `strale-beacon`,
`launchpad-ai`, `keystone`, `blueprint`, `blueprint-frontend`,
`stride_api`, `branddna`, `hono-starter`. **Zero hits anywhere.**

**Net**: no git-tracked code in this organization writes or references
`integrity_hash_status` except my own Phase C work. If anything else
wrote it, it was not from a committed repo.

## 2. DB archaeology results

### Column definition (pg_attribute)

```
schema=public  table=transactions  attname=integrity_hash_status
type=character varying  atthasdef=true  default_expr='pending'::character varying
```

The active default is `'pending'`, which matches my migration's
`DEFAULT 'pending'`. If the column had pre-existed with a different
default, `ADD COLUMN IF NOT EXISTS` would not have overwritten it; the
fact that the running default IS 'pending' is consistent with (but
does not prove) the column being newly created today.

### Cohort boundaries

```
status     n       first_seen (row created_at)      last_seen
complete   39,510  2026-02-25 22:41:35              2026-04-17 14:29:17
pending    164     2026-04-17 14:33:41              2026-04-17 16:24:06
customer   150     2026-03-04 20:08:03              2026-04-11 15:26:05
test       55      2026-03-04 09:45:36              2026-04-02 18:49:29
```

Note: `first_seen` / `last_seen` here are the row's `created_at`, NOT
the timestamp at which `integrity_hash_status` was set on that row.
The column is a single scalar without write-time metadata; we can
only observe values, not when they were written.

### Sample rows

**`customer` cohort** — newest 5:

```
id                                    created_at                  capability_id                           solution_slug     user_id
2d8e59fb-f283-4485-be81-fae2c888e90f  2026-04-11 15:26:05+00     f67d3452-60ab-4777-86fc-16c6ba47ce7f   null              null
8e4fdc04-9e0f-4336-95f3-12a1b3ceb2dd  2026-04-11 15:25:46+00     f67d3452-60ab-4777-86fc-16c6ba47ce7f   null              null
d6f1dde8-373e-4613-b2c4-7d8fe1e84f9c  2026-04-11 15:24:58+00     f67d3452-60ab-4777-86fc-16c6ba47ce7f   null              null
a291445d-693e-4e96-aef4-4da1b69be2c7  2026-04-09 15:18:55+00     null                                    kyb-complete-de   6b3838be-c8cd-4047-a4da-19305f60c09b
f4cf738d-1fce-4d69-8fcd-e851eee32eb6  2026-04-09 14:59:06+00     812b37f3-709e-4af9-b505-d89064214402   null              null
```

**`test` cohort** — newest 5 (all one user):

```
id                                    created_at                  capability_id                           user_id
068f8e9b-b442-4d85-b3a5-21305fac6379  2026-04-02 18:49:29+00     9ebfb261-1608-4384-8bd5-a78ff9e40634   374b977e-42d9-432a-ac72-fd0893a24a45
b89998e7-4ee4-43a3-b861-7491f2f7a9d5  2026-04-01 02:26:46+00     6b43c5a9-503a-4ece-95ef-452ce3f701a9   374b977e-42d9-432a-ac72-fd0893a24a45
de7c021d-8e95-4d7f-89f0-31391e1f5f52  2026-03-31 20:21:40+00     5fa0a55e-b50c-46f7-904d-f7f252118706   374b977e-42d9-432a-ac72-fd0893a24a45
d40e002f-32ed-478e-ad33-54841c0bf45c  2026-03-28 00:30:55+00     ef612955-4378-4907-bba5-e2965c8c0d50   374b977e-42d9-432a-ac72-fd0893a24a45
7cbb4b32-2671-4889-8f20-a995adcd8a38  2026-03-27 16:29:09+00     5aab0c7b-861d-4393-904a-861f60c35893   374b977e-42d9-432a-ac72-fd0893a24a45
```

**User breakdown by cohort** (top 15):

```
cohort     user_key                               n
complete   374b977e-42d9-432a-ac72-fd0893a24a45  37,491
complete   anonymous                              1,533
complete   2e3d9f92-2301-48f8-96cf-cab285451c70  222
pending    anonymous                              129
customer   anonymous                              116
complete   7935ddf2-...                           104
complete   28d4d681-...                           101
test       374b977e-42d9-432a-ac72-fd0893a24a45  55
pending    374b977e-42d9-432a-ac72-fd0893a24a45  35
customer   28d4d681-...                           18
customer   7935ddf2-...                           8
customer   2e3d9f92-...                           4
```

**Pattern observable**: `test` is 100% one user (`374b977e`) — a user
who also has 37,491 `complete` rows; this is extremely consistent with
"Petter's own test/dev API key." `customer` is a mix of `anonymous` (free
tier) + specific registered users (`28d4d681`, `7935ddf2`, `2e3d9f92`) —
looks like "real external customer traffic." A KYB solution execution
is tagged `customer`, which is consistent with that interpretation.

**Read**: someone is separating "my own testing" from "real customer
traffic" for analytics/reporting. That someone is not a git-tracked
service.

### Indexes on transactions

My migration's partial index is present:

```
CREATE INDEX transactions_integrity_hash_status_idx ON public.transactions
USING btree (integrity_hash_status, created_at)
WHERE ((integrity_hash_status)::text = 'pending'::text)
```

Also: `idx_transactions_previous_hash`,
`transactions_integrity_hash_idx`, `transactions_idempotency_key_unique`,
`transactions_solution_slug_idx`, `transactions_status_idx`,
`transactions_user_id_idx`, `transactions_pkey`. All benign; no sign of
another index on `integrity_hash_status` that would hint at a third
party workflow.

### No triggers on transactions

```
pg_trigger WHERE tgrelid = 'transactions'::regclass AND NOT tgisinternal:
(none)
```

No database-side logic is rewriting the column.

### No FK or CHECK constraint references the column

```
transaction_quality_transaction_id_transactions_id_fk  (FK into transaction_quality)
transactions_capability_id_capabilities_id_fk
transactions_exactly_one_target  (CHECK on capability_id XOR solution_slug)
transactions_pkey
transactions_user_id_users_id_fk
```

### Autovacuum timestamp

```
relname       last_autovacuum              last_analyze                 n_live_tup
transactions  2026-04-17 15:31:38+00       2026-04-15 07:13:06+00       39,884
```

`last_autovacuum = 15:31:38 UTC` is consistent with my ~15:30 UTC
migration having written to every row (column add + backfill). Autovacuum
kicked off shortly after my writes.

### No `__drizzle_migrations` table in prod

```
G. Check __drizzle_migrations table:  (no __drizzle_migrations table, or not readable)
```

This confirms what the journal's 8-entry state already suggested:
migrations 0008–0047 have been applied via raw SQL, not via
`drizzle-kit migrate`. My own migration was therefore also applied via
raw SQL (via my `apply-phase-c-migrations.mjs` script using the
`postgres` package in a transaction).

## 3. Any code that reads or writes the column

Comprehensive grep across the `strale` worktree (current + git history
+ all branches) and sibling repos:

- **Phase C writes** (mine): `apps/api/src/jobs/integrity-hash-retry.ts`
  (sets `'pending' → 'complete'` and `'pending' → 'failed'`),
  `apps/api/drizzle/0047_integrity_hash_status.sql` (column + backfill),
  `apps/api/src/routes/audit.ts` (reads, gates 202/503),
  `apps/api/src/db/schema.ts` (Drizzle declaration),
  `apps/api/src/lib/schema-validator.ts` (startup guard).
- **Phase C reads** (mine): same plus the comment-only mentions in
  `apps/api/src/routes/do.ts`.
- **Outside Phase C**: zero hits.

Nothing in the codebase writes `'customer'` or `'test'` to this column.
A broad grep for `"'customer'"` / `"'test'"` in any transaction context
across `apps/api/src/`: zero hits.

## 4. Damage estimate

### Timeline (reconstructed from data)

Best-fit chronology from observable state:

1. **~15:30 UTC today**: my migration applier commits migrations 0046
   (`rate_limit_counters`) + 0047 (`integrity_hash_status`). `ALTER TABLE
   ADD COLUMN` creates the column with `DEFAULT 'pending'` applied to
   every pre-existing row (~40k). Backfill UPDATE flips every row
   `< NOW() - INTERVAL '1 hour'` from `'pending'` → `'complete'`. At
   apply time, `NOW() - 1h ≈ 14:30 UTC`, matching the `'complete'`
   cohort's `last_seen` of 14:29:17 UTC and the `'pending'` cohort's
   `first_seen` of 14:33:41 UTC.
2. **15:31 UTC**: autovacuum kicks off (consistent with the big UPDATE).
3. **Sometime 15:32 — 16:24 UTC**: an untracked tagging workflow runs,
   overwriting 205 specific rows' `'complete'` values with `'customer'`
   (150) or `'test'` (55) based on user_id / anonymous criteria.
4. **16:24 UTC**: I run the investigation, see the current state.

### What the backfill actually changed

- My `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... DEFAULT 'pending'`
  caused every existing row to receive the default value. Because the
  column did not exist before (see §1 git, §2 indexes/triggers, §3
  codebase — all null), this created 39,884 new `'pending'` cells
  where there had been no cells before.
- The backfill UPDATE flipped every `'pending'` row older than 1h to
  `'complete'` — i.e. all ~39,700 historical rows.
- **Rows changed by the backfill**: essentially all historical rows.
- **Rows with prior non-NULL data that I overwrote**: zero. There was
  no prior data — the column was new.

**Net data destroyed from pre-existing state: zero.**

### What the tagging workflow did after

The untracked workflow wrote over 205 of my `'complete'` values with
its own tags. Its writes may have been what it wanted all along (it
owns that tagging semantic now), or it may have been an accidental
overwrite of my compliance semantics (it treated the column as its
own). Either way:

- 205 rows are now in state `'customer'` / `'test'` instead of my
  `'complete'`.
- Phase C's retry worker is interested in `'pending'` only; it will
  never touch `'customer'` / `'test'` rows.
- Phase C's `/v1/audit/:id` endpoint only gates on `'pending'` / `'failed'`;
  `'customer'` / `'test'` falls through to profile composition — no
  behavioural break.

### What would break on live deploy (the real risk)

The **race condition** between Phase C's retry worker and the untracked
tagging workflow:

1. Row inserted with default `'pending'`.
2. Retry worker is about to pick it up (within 30 s + 10 s grace).
3. Tagging workflow runs in the same window, flips the row to
   `'customer'`.
4. Retry worker now sees `'customer'` (not `'pending'`), skips the row.
5. Row stays `'customer'` forever. `integrity_hash` is never computed.
6. `/v1/audit/:id` for this row returns a composed profile **without a
   chained integrity hash** — the tamper-evidence chain has a gap at
   this transaction.

The probability depends entirely on how aggressive the tagging workflow
is. If it runs once per day on yesterday's rows, the race window is
minuscule. If it runs every N minutes on recent rows, it could swallow
Phase C's pending queue wholesale.

We cannot measure this without knowing the tagging workflow's schedule.

## 5. Recommendation

**Option A: rename Phase C's column.** This is the original
pre-deploy-report recommendation and my strong pick now.

Concrete steps (not executed — investigation only):

1. Add a new migration `0048_compliance_hash_state.sql` that:
   - Creates `transactions.compliance_hash_state varchar(16) NOT NULL
     DEFAULT 'pending'`.
   - Backfills rows `< NOW() - INTERVAL '1 hour'` to `'complete'`.
   - Creates partial index on `(compliance_hash_state, created_at)`
     `WHERE compliance_hash_state = 'pending'`.
2. Update Phase C code to read/write `compliance_hash_state` instead:
   - `apps/api/src/db/schema.ts`: rename the Drizzle column.
   - `apps/api/src/jobs/integrity-hash-retry.ts`: update all references.
   - `apps/api/src/routes/audit.ts`: update the gate.
   - `apps/api/src/lib/schema-validator.ts`: require `compliance_hash_state`
     instead of `integrity_hash_status`.
   - `apps/api/src/routes/do.ts`: update comments only (no logic there —
     the column default handles it).
3. Keep `0047_integrity_hash_status.sql` on disk for traceability but
   mark it inert: the column still exists, my backfill sweep is now
   permanent for those 205 rows (overwritten by the tagging workflow
   anyway for the ones that matter), and the prior state of the
   column in prod is the tagging workflow's domain. Do not delete the
   column — the tagging workflow uses it.
4. Deploy this as Phase C v2. No database rollback needed.

**Why Option A (not Option B "investigate first"):**

- The investigation is done. The tagging workflow is undiscoverable
  from the code — it's either a Retool-style no-code tool, manual
  psql, or a non-repo script. Finding it would require Petter naming
  it.
- The fix is independent of identifying the tagger: renaming Phase C's
  column eliminates the collision regardless of who the other side is.
- Delaying to find the owner extends the F-0-009 compliance gap
  (integrity hashing still fire-and-forget on prod) for no safety
  benefit.

**What Petter should verify independently:**

- Who/what writes `'customer'` / `'test'` to `transactions.integrity_hash_status`?
  Probably him, via Retool or a manual tool. If it's truly live and
  periodic, confirm the tagger's schedule. If it's a one-off
  categorization run today, even better — Option A is still correct
  but the urgency of the race-condition risk drops.
- Does any Retool dashboard / external script READ this column with
  `'customer'` / `'test'` semantics? If yes, those readers are
  unaffected by Option A (we don't touch their column).

### What not to do

- Do NOT `UPDATE` existing `'customer'` / `'test'` rows back to
  `'complete'`. They belong to the tagging workflow.
- Do NOT `DROP COLUMN integrity_hash_status`. Something is using it,
  even if we don't know what.
- Do NOT deploy Phase C as-is. The race condition above is real.
- Do NOT run `drizzle-kit migrate` against prod — the journal is
  decorative; migrations have been applied via raw SQL for 40 versions.

## Appendix — Investigation scripts on disk

Three scripts were written to the worktree during this investigation.
All READ-ONLY. Listed here for the record:

- `apps/api/scripts/investigate-hash-status.mjs` — initial cohort
  sampling after the migration apply.
- `apps/api/scripts/phase-c-db-archaeology.mjs` — full pg catalog +
  cohort distribution + index/trigger/constraint inspection.
- `apps/api/scripts/phase-c-damage-estimate.mjs` — timing analysis,
  histogram, lock snapshot, drizzle-journal check.

They can be deleted or kept; they're untracked in git. Also present in
the worktree root from earlier in this session:
`apply-phase-c-migrations.mjs` (the script that applied 0046 + 0047).
That one DOES write — but ran cleanly at ~15:30 UTC and should not be
re-run.
