Intent: run `transaction-quality-orphans` once in production after strale-io/strale#1076 deployed (`86b96e6fdb4f`, live on `/health` at about 08:05 Swedish time) and record what it says about the cause of the A-7 orphaned quality rows.

Evidence: `archive/receipts/2026-11-16-check-a7-transaction-quality-orphans-banded.json`, banded under Q3b.
- The check answered 200 in 6.3 s.
- All three parts completed inside the 5 s per-statement limit.

**Each part ran the plan its label claims.**
- **Index plan:** probes `transactions` through its primary-key index and never reads the table.
- **Heap plan:** reads `transactions` from the table and uses no index.

**The primary-key index is not the cause.**
- Both plans count 103,416 orphaned rows.
- If `transactions_pkey` were missing entries, the index-plan count would be higher than the heap count.
- So the call rows really are absent from the table; a broken primary-key index is not hiding them.
- This does not rule out damage to the table's data pages or to other indexes. It only rules out the primary-key explanation, so no REINDEX is called for by this result.

**All 103,416 orphaned quality rows were created before 2026-04-16 (UTC).** No orphaned row was created:
- on 2026-04-16 (the B-tree corruption outage on `transactions`);
- between that day and 2026-05-04;
- in the two later windows.

**This dates the calls, not the deletion.** The windows bucket `transaction_quality.created_at`, which is when the call ran. When its call row disappeared is not in the data. The 2026-05-04 crash-loop recovery, the 2026-04-16 outage recovery and any other later operation all remain possible. What the data does show:
- Among calls that have a quality row, only calls made before 2026-04-16 lost their call rows.
- No quality row from a call made on or after 2026-04-16 has lost its call row.
- Calls with no quality row are outside this check, so nothing here says whether any of them were lost.
- Calls from before 2026-04-16 still exist too, so the call table was not wiped and rebuilt from empty. Some older call rows survive and others are gone.

**The foreign key goes back to the table's first migration.**
- The migration that created `transaction_quality` added the cascading key (commit `5b08d819`, committed 2026-03-03).
- Production has it today, validated.
- The repository shows neither when production first applied it nor whether it was ever dropped and re-added.

**Ordinary application code could not have done this.**
- With the key in place, an ordinary `DELETE` on `transactions` cascades to the quality rows.
- A `TRUNCATE` on `transactions` refuses while the key exists, unless it also truncates `transaction_quality`.
- No tracked code sets `session_replication_role`, disables triggers, zeroes damaged pages or runs `pg_restore`. `git grep` on 2026-11-16 found only the integration test that builds the orphan case on purpose.

So the removal happened outside the application. Confidence: moderate.

**Cause: unknown.** The candidates are:
- a recovery step during or after the 2026-04-16 outage (zeroing damaged pages, or restoring the call table with triggers off);
- a recovery step after the 2026-05-04 crash-loop;
- a manual cleanup run with triggers disabled.

The 2026-04-16 recovery fits the pattern best, because only rows that existed on that day were hit. That is weak evidence: an age-based cleanup run later would leave the same pattern. Confidence in 2026-04-16 specifically: low.

The repository records the 2026-04-16 outage (commits `60dc2b74` and `8812cd53`) but not how the database was recovered. Petter may remember what was run on 2026-04-16 or 2026-05-04. That is a question about history, not a decision, so it rides along in the wow-core master's one line.

**Money:** unchanged from `handoff/_general/from-code/2026-11-16-transaction-quality-fk-result.md`.
- €0 owed, measured, for the no-reference debits.
- €0 owed, by inference at moderate-to-high confidence, for the 65 dangling-reference cents.

**A-7 status:**
- The refund question is closed at €0.
- The orphans are real, and every one belongs to a call made before 2026-04-16.
- They were removed outside the application, at an unknown date.
- Whether to delete or keep the 103,416 rows is Petter's decision. It goes as one line through the wow-core master: the row count, that the rows hold quality metrics only (no debit beyond the fewer-than-5 already traced), and that a backup taken first would cover all of them.

Next authorised action: tell the wow-core master the result and the one-line delete-or-keep question for Petter's page | Owner: Strale master | Blocker: none
