Intent: PC job: read-only production queries for PLAN "Waiting on the founder" item 3 (A-7, B-6, B-5), with B-3 and DQ-33 re-routed off the founder.

# PC job: money-path and exchange-rate measurements (read only)

**Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), for `docs/plan/PLAN.md` item 3.
**Status:** draft. Run it only after an independent review in a separate context has passed it (the PR says which review ran).

## What changed against PLAN item 3

PLAN item 3 lists five pieces. Only three are reads, and the brief is now just those three:

| Item | What PLAN said | What this brief does |
|---|---|---|
| A-7 (P-008/P-011) | debits against listed prices | Q1, Q2, Q2b, Q3, Q3b below |
| B-6 (P-001) | refunds for past failed charges, measured | Q4 below: exposure only; per-tool narrowing is fleet analysis afterwards |
| B-5 | exchange-rate 7-day error rate after #976/#977 | Q5 below |
| B-3 | six fixture manifests still on strale.dev | **Not here.** It is a database write. It goes through the deploy-time route (a startup-migration block), the same way four of the six DQ-33 inputs were fixed on 12–13 September. That is ordinary engineering for a lane, with no founder session. |
| DQ-33 | six registry test inputs | **Not here, and nothing left to measure.** By `docs/company/DECISION-QUEUE.md` (update of 2026-10-10), all six registries are corrected: CA, IE, LT, CH and ES through deploy-time blocks in September, and DE through block 0119 (PR #696). The only step left is the founder closing DQ-33 in the queue. |

**Better route, recommended.** `GET /v1/ops-read/:check` (`apps/api/src/routes/ops-read.ts`, `lib/ops-read.ts`, PR #880) already runs fixed, read-only checks for operator sessions, each statement capped at 5 seconds. `STRALE_OPS_READ_TOKEN` is set in Railway and in Bitwarden, and a cloud session with `bws` called `/v1/ops-read/build` successfully on 2026-11-16. If these queries become checks there, no PC database session is needed at all. Two differences a check must handle:
- some existing checks return ids, so each new check's output is reviewed on its own, against the aggregate-only rule below;
- a 5-second cap may be too short for the full-history scans; a check may need a date window or an index-friendly rewrite.

This brief is the fallback until those checks exist; its SQL is the starting point for them, not a drop-in body.

## Hard rules

- **Read only.** Every query runs inside `BEGIN TRANSACTION READ ONLY` with a statement timeout, and the session ends with `ROLLBACK`. No `INSERT`, `UPDATE`, `DELETE`, DDL or function that writes.
- **Aggregates only.** Output contains:
  - slugs;
  - statuses;
  - counts;
  - cents;
  - dates.

  It never contains:
  - user ids, emails or key prefixes;
  - transaction ids;
  - inputs or outputs;
  - wallet ids.

  Do not add columns to the queries.
- **The report does not go on the PR.** The repository is public. The PR comment carries only the line in Step 4; the full report is your final message in this session, which the master reads itself.
- Ask Petter nothing. If a query errors, record the error text and go on to the next one.

## Steps

### 1. Connect read only

In `C:\Users\pette\Projects\strale`, in Git Bash, connect with the URL in the root `.env` and force read-only for the whole session:

```bash
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//;s/"$//')"
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30s' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0
```

This reads only the one line, so nothing else in `.env` is executed or exported.

Then, inside `psql`, start with:

```sql
SELECT current_user;          -- must print strale_ro; if not, \q and report, run nothing else
\set ON_ERROR_ROLLBACK on
BEGIN TRANSACTION READ ONLY;
```

`strale_ro` is the read-only role (SELECT only, writes refused by privilege). That check is the real guard: `SHOW transaction_read_only` inside `BEGIN TRANSACTION READ ONLY` always prints `on`, so it proves nothing about the role. `ON_ERROR_ROLLBACK` keeps one failing query from aborting the rest.

### 2. Run the queries, in order

**Q1 (A-7): capability calls paid from the wallet: debit against the recorded price and the listed price.**
Counts every completed, wallet-paid, non-free capability call, with the ledger debit that references it.
- `debit_ne_recorded` and `no_debit` are findings.
- `recorded_ne_listed` may be a price change after the call, not a bug; the fleet reads it against price history.

```sql
WITH calls AS (
  SELECT c.slug,
         t.price_cents                         AS recorded_cents,
         c.price_cents                         AS listed_cents,
         (SELECT -SUM(w.amount_cents) FROM wallet_transactions w
           WHERE w.reference_id = t.id AND w.type = 'purchase') AS debited_cents,
         (SELECT SUM(w.amount_cents) FROM wallet_transactions w
           WHERE w.reference_id = t.id AND w.type = 'refund')   AS refunded_cents
    FROM transactions t
    JOIN capabilities c ON c.id = t.capability_id
   WHERE t.status = 'completed'
     AND t.payment_method = 'wallet'
     AND t.is_free_tier = false
     AND t.solution_slug IS NULL
     AND t.price_cents > 0
)
SELECT CASE WHEN GROUPING(slug) = 1 THEN '(total)' ELSE slug END       AS slug,
       COUNT(*)                                                               AS calls,
       COUNT(*) FILTER (WHERE debited_cents IS NULL)                          AS no_debit,
       COUNT(*) FILTER (WHERE debited_cents IS NOT NULL
                          AND debited_cents <> recorded_cents)                AS debit_ne_recorded,
       COUNT(*) FILTER (WHERE recorded_cents <> listed_cents)                 AS recorded_ne_listed,
       COUNT(*) FILTER (WHERE refunded_cents IS NOT NULL)                     AS refunded,
       COALESCE(SUM(debited_cents), 0)                                        AS debited_cents
  FROM calls
 GROUP BY ROLLUP (slug)
HAVING GROUPING(slug) = 1
    OR COUNT(*) FILTER (WHERE debited_cents IS NULL
                           OR debited_cents <> recorded_cents
                           OR recorded_cents <> listed_cents) > 0
 ORDER BY GROUPING(slug) DESC, slug;
```

The first row (`(total)`) is the total across all capabilities; the rest are only the slugs with something to look at.

**Q2 (A-7): bundled checks (solutions) paid from the wallet: the same comparison, from 22 August.**
Solution debits only carry the transaction id since WP3 (PR #350, merged 2026-08-21). Earlier solution debits have no reference by design, so Q2 starts on 2026-08-22 and Q2b counts the earlier calls separately. `listed_cents` is empty when the solution has since been removed.

```sql
WITH calls AS (
  SELECT t.solution_slug                    AS slug,
         t.price_cents                      AS recorded_cents,
         s.price_cents                      AS listed_cents,
         (SELECT -SUM(w.amount_cents) FROM wallet_transactions w
           WHERE w.reference_id = t.id AND w.type = 'purchase') AS debited_cents,
         (SELECT SUM(w.amount_cents) FROM wallet_transactions w
           WHERE w.reference_id = t.id AND w.type = 'refund')   AS refunded_cents
    FROM transactions t
    LEFT JOIN solutions s ON s.slug = t.solution_slug
   WHERE t.solution_slug IS NOT NULL
     AND t.status = 'completed'
     AND t.payment_method = 'wallet'
     AND t.is_free_tier = false
     AND t.price_cents > 0
     AND t.created_at >= TIMESTAMPTZ '2026-08-22 00:00:00+00'
)
SELECT CASE WHEN GROUPING(slug) = 1 THEN '(total)' ELSE slug END  AS slug,
       COUNT(*)                                                         AS calls,
       COUNT(*) FILTER (WHERE debited_cents IS NULL)                    AS no_debit,
       COUNT(*) FILTER (WHERE debited_cents IS NOT NULL
                          AND debited_cents <> recorded_cents)          AS debit_ne_recorded,
       COUNT(*) FILTER (WHERE listed_cents IS NULL)                     AS no_longer_listed,
       COUNT(*) FILTER (WHERE recorded_cents <> listed_cents)           AS recorded_ne_listed,
       COUNT(*) FILTER (WHERE refunded_cents IS NOT NULL)               AS refunded,
       COALESCE(SUM(debited_cents), 0)                                  AS debited_cents
  FROM calls
 GROUP BY ROLLUP (slug)
 ORDER BY GROUPING(slug) DESC, slug;
```

If every row shows `no_debit = calls`, the solution debit references something other than the transaction id even after WP3. Record that and go on; the fleet reads it.

**Q2b (A-7): solution calls before WP3, unlinked by design.** Counts only; these are not findings.

```sql
SELECT COUNT(*)                                                    AS calls,
       COALESCE(SUM(t.price_cents), 0)                             AS recorded_cents,
       to_char(MIN(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS first_day,
       to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_day
  FROM transactions t
 WHERE t.solution_slug IS NOT NULL
   AND t.status = 'completed'
   AND t.payment_method = 'wallet'
   AND t.is_free_tier = false
   AND t.price_cents > 0
   AND t.created_at < TIMESTAMPTZ '2026-08-22 00:00:00+00';
```

**Q3 (A-7, P-001): any call that did not complete and kept its charge.**
Asynchronous and solution calls are debited when they start and refunded if they fail, so a debit on a failed call is correct as long as a refund of the same size follows. Q3 nets the two. Calls from the last day are left out, because they may still be running or awaiting the reconciler.
The expected result is `unrefunded_calls = 0` on every row. Any other value is a charge kept for a call that failed or never finished.

```sql
WITH d AS (SELECT reference_id AS id, -SUM(amount_cents) AS debited
             FROM wallet_transactions
            WHERE type = 'purchase' AND reference_id IS NOT NULL
            GROUP BY 1),
     r AS (SELECT reference_id AS id, SUM(amount_cents) AS refunded
             FROM wallet_transactions
            WHERE type = 'refund' AND reference_id IS NOT NULL
            GROUP BY 1)
SELECT t.status,
       t.payment_method,
       (t.solution_slug IS NOT NULL)                                         AS is_solution,
       COUNT(*)                                                              AS debited_calls,
       COUNT(*) FILTER (WHERE d.debited > COALESCE(r.refunded, 0))           AS unrefunded_calls,
       SUM(GREATEST(d.debited - COALESCE(r.refunded, 0), 0))                 AS unrefunded_cents,
       to_char(MIN(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')           AS first_day,
       to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')           AS last_day
  FROM d
  JOIN transactions t ON t.id = d.id
  LEFT JOIN r ON r.id = d.id
 WHERE t.status <> 'completed'
   AND t.created_at < now() - interval '1 day'
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;
```

**Q3b (A-7): purchase debits that point at no call.** Per month, split by whether the debit has no reference at all (solution debits before WP3 are expected here) or a reference that matches no transaction (a finding).

```sql
SELECT to_char(date_trunc('month', w.created_at), 'YYYY-MM') AS month,
       (w.reference_id IS NULL)                               AS no_reference,
       COUNT(*)                                               AS debits,
       -SUM(w.amount_cents)                                   AS debited_cents
  FROM wallet_transactions w
  LEFT JOIN transactions t ON t.id = w.reference_id
 WHERE w.type = 'purchase'
   AND t.id IS NULL
 GROUP BY 1, 2
 ORDER BY 1, 2;
```

**Q4 (B-6): exposure on the tools that bill a success when the upstream failed.**
The slugs are the paid rows of `archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md`; the two free-tier rows are left out.
- This is an **upper bound**: it counts every completed paid call, legitimate negatives included.
- Narrowing it per tool, using each audit row's failure shape, is the fleet's analysis afterwards.
- x402 calls are shown separately because they settle on-chain, not in the wallet. They have no user id, so a payer is the user id or, for x402, the payer hash. Older x402 rows have no hash; `payers_unknown` counts those calls.
- It counts direct calls only. When these tools run inside a bundled check, the solution's call row carries no capability id, so that use is not in this number.

```sql
SELECT CASE WHEN GROUPING(c.slug) = 1 THEN '(total)' ELSE c.slug END AS slug,
       t.payment_method,
       COUNT(*)                                                     AS completed_paid_calls,
       COUNT(DISTINCT COALESCE(t.user_id::text, 'x402:' || t.x402_payer_hash)) AS distinct_payers,
       COUNT(*) FILTER (WHERE t.user_id IS NULL AND t.x402_payer_hash IS NULL) AS payers_unknown,
       COALESCE(SUM(t.price_cents), 0)                              AS recorded_cents,
       to_char(MIN(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')  AS first_day,
       to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')  AS last_day
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
 WHERE t.status = 'completed'
   AND t.is_free_tier = false
   AND t.price_cents > 0
   AND c.slug IN (
     'vasp-verify','vasp-non-compliant-check','insolvency-check','mx-lookup',
     'pricing-page-extract','gdpr-fine-lookup','package-security-audit','dependency-audit',
     'cookie-scan','email-auth-check','email-deliverability-check','domain-reputation',
     'company-tech-stack','tech-stack-detect','barcode-lookup','backlink-check',
     'business-day-check','cz-company-data','eori-validate','company-fundamentals',
     'github-repo-analyze','customs-duty-lookup','seo-audit','startup-domain-check',
     'email-pattern-discover','country-trade-data','domain-age-check','whois-lookup',
     'page-exists','port-check','og-image-check','domain-contact-extract',
     'protocol-fees-lookup','container-track','ens-reverse-lookup','email-reputation-score')
 GROUP BY ROLLUP ((c.slug, t.payment_method))
 ORDER BY GROUPING(c.slug) DESC, recorded_cents DESC;
```

`distinct_payers` is a count only; the ids never leave the database.

**Q5 (B-5): exchange-rate tools in the seven days after #976 and #977.**
#976 merged 2026-11-08 09:48 UTC and #977 at 11:46 UTC; those are merge times, not deploy times. The window starts at 2026-11-09 00:00 UTC, more than twelve hours after the later merge, which leaves ample room for the deploy, and gives seven full days to 2026-11-16. Customer calls come from `transactions`, leaving out Strale's own test runs (`receipt_rail = 'internal'`); those runs are counted from `test_results`.

```sql
SELECT 'calls' AS source, c.slug, t.status AS outcome, COUNT(*) AS n
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
 WHERE c.slug IN ('exchange-rate','currency-convert','forex-history')
   AND t.created_at >= TIMESTAMPTZ '2026-11-09 00:00:00+00'
   AND t.created_at <  TIMESTAMPTZ '2026-11-16 00:00:00+00'
   AND t.receipt_rail IS DISTINCT FROM 'internal'
 GROUP BY 2, 3
UNION ALL
SELECT 'tests', tr.capability_slug, CASE WHEN tr.passed THEN 'passed' ELSE 'failed' END, COUNT(*)
  FROM test_results tr
 WHERE tr.capability_slug IN ('exchange-rate','currency-convert','forex-history')
   AND tr.executed_at >= TIMESTAMPTZ '2026-11-09 00:00:00+00'
   AND tr.executed_at <  TIMESTAMPTZ '2026-11-16 00:00:00+00'
 GROUP BY 2, 3
 ORDER BY 1, 2, 3;
```

### 3. Close

```sql
ROLLBACK;
\q
```

### 4. Report

- **PR comment**, on this brief's PR, exactly this and nothing else:
  `To orchestrator: a7-bundle queries ran <date, Swedish time>; results are in the PC session's final message.`
- **Final message in the session**, for the master:
  - each query's output as a plain table, copied exactly;
  - the `SELECT current_user` result;
  - any error text.

The master writes the receipts (`npm run receipt`) from it. Receipts are committed to the public repository, so they carry only the aggregate columns above, and `distinct_payers` only on the total row: a per-tool payer count of 1 can point to one customer.

## What happens with the results

| Result | Next step | Owner |
|---|---|---|
| Q1–Q3b all clean | A-7's debit half is verified; its dry-run half (P-008) stays a code test | the fleet |
| Q1–Q3b show mismatches, kept charges or orphan debits | a remediation batch, plus a refund measurement | the fleet, after measuring |
| Q4 exposure | narrowed per tool, then a drain plan | the fleet |
| Refunds themselves | the capped server-side refund function under a founder DEC (moonlighter-ab/wow-core#348). No refund runs from this job. | the founder's DEC first |
| Q5 | written as the B-5 rate receipt | the fleet |
