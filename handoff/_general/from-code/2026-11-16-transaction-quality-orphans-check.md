Intent: build the aggregate-only ops-read check that tells index corruption from real deletion for the 103,416 orphaned `transaction_quality` rows, and places them before or after the named incident dates. Built in strale-io/strale#1076, not yet run in production.

**What the check reports:** `transaction-quality-orphans` has three parts, each in a savepoint that is always rolled back.
- `index_plan`: the orphan count, with `transactions` probed only through `transactions_pkey`.
- `heap_plan`: the same count, with `transactions` read only from the table, plus UTC windows around the incidents:
  - before 2026-04-16;
  - on 2026-04-16;
  - 2026-04-17 to 2026-05-03;
  - 2026-05-04 to 2026-07-01;
  - from 2026-07-02.
- `oldest_call`: boundary flags only.
- Each count also carries `plan` flags from EXPLAIN of the same statement, so the receipt can show which access path produced it.
- There is no month split and no data-derived instant. The receipt bands 1–4 as `<5`.

**How to read the result:**
- **Index count higher than heap count:** `transactions_pkey` is missing entries, which fits the 2026-04-16 B-tree corruption. A REINDEX is a production change and goes to Petter for approval.
- **Equal counts:** the call rows are really gone. The windows then say whether they cluster at an incident.
- **Either way,** deleting or rewriting the orphan rows is Petter's call. It goes as one line through the wow-core master, with the row count and what a backup would cover.

**Review:** an independent read-only Claude agent in a separate context reviewed the first version. Its five findings were fixed in the second commit, and its re-review of that commit is pending on the PR.

**Tests:**
- Unit: 148 pass, and 16 fail against the first version.
- Integration on disposable Postgres 16: 12 pass.
- tsc is clean.

**Risk:** the heap count seq-scans both tables and may hit the 5 s timeout. That part then reads `complete: false`, and a cheaper per-window version follows.

Next authorised action: merge #1076 through merge-gate, then confirm `/health` shows its merge commit, run the check once with `bws run`, and write a banded receipt and a handoff | Owner: Strale master session | Blocker: the re-review of the fix commit
