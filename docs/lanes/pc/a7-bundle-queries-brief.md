Intent: PC job: read-only production queries for PLAN "Waiting on the founder" item 3 (A-7, B-6, B-5), with B-3 and DQ-33 re-routed off the founder.

# PC job: money-path and exchange-rate measurements (read only)

**Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), for `docs/plan/PLAN.md` item 3.
**Status:** draft. Run it only after an independent review in a separate context has passed it (the PR says which review ran).

## What changed against PLAN item 3

PLAN item 3 lists five pieces. Only three are reads, and the brief is now just those three:

| Item | What PLAN said | What this brief does |
|---|---|---|
| A-7 (P-008/P-011) | debits against listed prices | Q1, Q2, Q3 below |
| B-6 (P-001) | refunds for past failed charges, measured | Q4 below: exposure only; per-tool narrowing is fleet analysis afterwards |
| B-5 | exchange-rate 7-day error rate after #976/#977 | Q5 below |
| B-3 | six fixture manifests still on strale.dev | **Not here.** It is a database write. It goes through the deploy-time route (a startup-migration block), the same way four of the six DQ-33 inputs were fixed on 12–13 September. That is ordinary engineering for a lane, with no founder session. |
| DQ-33 | six registry test inputs | **Not here.** By `docs/company/DECISION-QUEUE.md` (updates of 2026-09-17 and 2026-09-18), CA, IE, LT, CH and ES were already corrected through deploy-time blocks. Only DE remains, and it cannot be verified without its supplier key, which exists only in the live environment. A lane can verify DE with a deploy-time probe; a founder database session does not help. |

**Better route, recommended.** `GET /v1/ops-read/:check` (`apps/api/src/routes/ops-read.ts`, `lib/ops-read.ts`, PR #880) already runs fixed, read-only, aggregate-only checks for operator sessions. If Q1–Q5 become checks there, no PC database session is needed at all. That requires:
- `STRALE_OPS_READ_TOKEN` set in Railway and in Bitwarden (whether it is set is **unknown** to this session);
- a cloud session with the `bws` CLI to call it.

This brief is the fallback until then, and its SQL is the body those checks would carry.

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
set -a; . ./.env; set +a
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30s' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0
```

Then, inside `psql`, start with:

```sql
BEGIN TRANSACTION READ ONLY;
SHOW transaction_read_only;   -- must print "on"; if not, ROLLBACK, quit and report
```

### 2. Run Q1 to Q5, in order

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
SELECT slug,
       COUNT(*)                                                               AS calls,
       COUNT(*) FILTER (WHERE debited_cents IS NULL)                          AS no_debit,
       COUNT(*) FILTER (WHERE debited_cents IS NOT NULL
                          AND debited_cents <> recorded_cents)                AS debit_ne_recorded,
       COUNT(*) FILTER (WHERE recorded_cents <> listed_cents)                 AS recorded_ne_listed,
       COUNT(*) FILTER (WHERE refunded_cents IS NOT NULL)                     AS refunded,
       COALESCE(SUM(debited_cents), 0)                                        AS debited_cents
  FROM calls
 GROUP BY ROLLUP (slug)
HAVING slug IS NULL
    OR COUNT(*) FILTER (WHERE debited_cents IS NULL
                           OR debited_cents <> recorded_cents
                           OR recorded_cents <> listed_cents) > 0
 ORDER BY slug NULLS FIRST;
```

The first row (slug empty) is the total across all capabilities; the rest are only the slugs with something to look at.

**Q2 (A-7): bundled checks (solutions) paid from the wallet: the same comparison.**
If every row shows `no_debit = calls`, the solution debit references something other than the transaction id. Record that and go on; the fleet reads it.

```sql
WITH calls AS (
  SELECT s.slug,
         t.price_cents AS recorded_cents,
         s.price_cents AS listed_cents,
         (SELECT -SUM(w.amount_cents) FROM wallet_transactions w
           WHERE w.reference_id = t.id AND w.type = 'purchase') AS debited_cents
    FROM transactions t
    JOIN solutions s ON s.slug = t.solution_slug
   WHERE t.status = 'completed'
     AND t.payment_method = 'wallet'
     AND t.is_free_tier = false
     AND t.price_cents > 0
)
SELECT slug,
       COUNT(*)                                                         AS calls,
       COUNT(*) FILTER (WHERE debited_cents IS NULL)                    AS no_debit,
       COUNT(*) FILTER (WHERE debited_cents IS NOT NULL
                          AND debited_cents <> recorded_cents)          AS debit_ne_recorded,
       COUNT(*) FILTER (WHERE recorded_cents <> listed_cents)           AS recorded_ne_listed,
       COALESCE(SUM(debited_cents), 0)                                  AS debited_cents
  FROM calls
 GROUP BY ROLLUP (slug)
 ORDER BY slug NULLS FIRST;
```

**Q3 (A-7, P-001): any debit on a call that did not complete.**
The expected result is no rows. Any row is a charge for a call that failed or never finished.

```sql
SELECT t.status,
       t.payment_method,
       (t.solution_slug IS NOT NULL)                         AS is_solution,
       COUNT(*)                                              AS calls,
       SUM(d.debited)                                        AS debited_cents,
       COUNT(*) FILTER (WHERE r.refunded IS NOT NULL)        AS refunded_calls,
       COALESCE(SUM(r.refunded), 0)                          AS refunded_cents,
       to_char(MIN(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS first_day,
       to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_day
  FROM transactions t
  JOIN LATERAL (SELECT -SUM(w.amount_cents) AS debited FROM wallet_transactions w
                 WHERE w.reference_id = t.id AND w.type = 'purchase') d ON d.debited IS NOT NULL
  LEFT JOIN LATERAL (SELECT SUM(w.amount_cents) AS refunded FROM wallet_transactions w
                 WHERE w.reference_id = t.id AND w.type = 'refund') r ON true
 WHERE t.status <> 'completed'
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;
```

**Q4 (B-6): exposure on the tools that bill a success when the upstream failed.**
The slugs are the paid rows of `archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md`; the two free-tier rows are left out.
- This is an **upper bound**: it counts every completed paid call, legitimate negatives included.
- Narrowing it per tool, using each audit row's failure shape, is the fleet's analysis afterwards.
- x402 calls are shown separately because they settle on-chain, not in the wallet.

```sql
SELECT c.slug,
       t.payment_method,
       COUNT(*)                                                     AS completed_paid_calls,
       COUNT(DISTINCT t.user_id)                                    AS distinct_payers,
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
 ORDER BY recorded_cents DESC NULLS FIRST;
```

`distinct_payers` is a count only; the ids never leave the database.

**Q5 (B-5): exchange-rate tools since #976 and #977 went live.**
#976 merged 2026-11-08 09:48 UTC and #977 11:46 UTC; the window starts after both. Customer calls come from `transactions`; Strale's own test runs from `test_results`.

```sql
SELECT 'calls' AS source, c.slug, t.status AS outcome, COUNT(*) AS n
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
 WHERE c.slug IN ('exchange-rate','currency-convert','forex-history')
   AND t.created_at >= TIMESTAMPTZ '2026-11-08 12:00:00+00'
 GROUP BY 2, 3
UNION ALL
SELECT 'tests', tr.capability_slug, CASE WHEN tr.passed THEN 'passed' ELSE 'failed' END, COUNT(*)
  FROM test_results tr
 WHERE tr.capability_slug IN ('exchange-rate','currency-convert','forex-history')
   AND tr.executed_at >= TIMESTAMPTZ '2026-11-08 12:00:00+00'
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
  - the `SHOW transaction_read_only` result;
  - any error text.

The master writes the receipts (`npm run receipt`) from it.

## What happens with the results

| Result | Next step | Owner |
|---|---|---|
| Q1–Q3 all clean | A-7's debit half is verified; its dry-run half (P-008) stays a code test | the fleet |
| Q1–Q3 show mismatches or debits on failed calls | a remediation batch, plus a refund measurement | the fleet, after measuring |
| Q4 exposure | narrowed per tool, then a drain plan | the fleet |
| Refunds themselves | the capped server-side refund function under a founder DEC (moonlighter-ab/wow-core#348). No refund runs from this job. | the founder's DEC first |
| Q5 | written as the B-5 rate receipt | the fleet |
