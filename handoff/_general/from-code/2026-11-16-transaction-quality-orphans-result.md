Intent: run `transaction-quality-orphans` once in production after strale-io/strale#1076 deployed (`86b96e6fdb4f`, live on `/health` at about 08:05 Swedish time) and record what it says about the cause of the A-7 orphaned quality rows.

Evidence: `archive/receipts/2026-11-16-check-a7-transaction-quality-orphans-banded.json`, banded under Q3b.
- The check answered 200 in 6.3 s.
- All three parts completed inside the 5 s per-statement limit.

**Each part ran the plan its label claims.**
- **Index plan:** probes `transactions` through its primary-key index and never reads the table.
- **Heap plan:** reads `transactions` from the table and uses no index.

**Index corruption is ruled out as the cause.**
- Both plans count 103,416 orphaned rows.
- An index missing entries would make the index-plan count higher than the heap count.
- So the orphans are real: the call rows are gone from the table, not hidden by a broken index.
- No REINDEX is needed for this.

**All 103,416 orphans were created before 2026-04-16 (UTC).** No orphan was created:
- on 2026-04-16 (the B-tree corruption outage on `transactions`);
- between that day and the 2026-05-04 disk-full crash-loop;
- after the crash-loop;
- after the 2026-07-02 I/O degradation.

The 2026-05-04 crash-loop, which the earlier handoff named as the chief suspect, did not create any of these rows.

**Calls from before 2026-04-16 still exist.** So the call table was not wiped and rebuilt from empty: some older call rows survive and others are gone.

**The foreign key dates from the table's creation.** It was created with `transaction_quality` on 2026-03-03 (commit `5b08d819`, migration `ALTER TABLE ... ADD CONSTRAINT ... ON DELETE cascade`). So the window is narrow:
- the orphaned rows were written between 2026-03-03 and 2026-04-15, while the cascading key was in force;
- their call rows were later removed in a way that skipped the key's triggers.

**Cause: most likely the 2026-04-16 outage recovery.** Confidence: moderate.
- The repository records the outage (commits `60dc2b74` and `8812cd53`) but not how the database was recovered.
- Recovery steps that remove rows without firing foreign-key triggers include:
  - zeroing damaged pages;
  - restoring the call table from a dump with triggers disabled;
  - deleting rows with `session_replication_role = replica`.
- Each would leave exactly this pattern: orphans only among rows that existed before the outage.
- This is an inference. Petter may remember what was run on 2026-04-16. That question is history, not a decision, so it goes into the wow-core master's one line, not into a separate ask.

**Money:** unchanged from `handoff/_general/from-code/2026-11-16-transaction-quality-fk-result.md`.
- €0 owed, measured, for the no-reference debits.
- €0 owed, by inference at moderate-to-high confidence, for the 65 dangling-reference cents.

**A-7 status:**
- The refund question is closed at €0.
- The orphans are real, all predate 2026-04-16, and the 2026-04-16 recovery is the likely cause.
- Whether to delete or keep the 103,416 rows is Petter's decision. It goes as one line through the wow-core master: the row count, that the rows hold quality metrics only (no debit beyond the fewer-than-5 already traced), and that a backup taken first would cover all of them.

Next authorised action: tell the wow-core master the result and the one-line delete-or-keep question for Petter's page | Owner: Strale master | Blocker: none
