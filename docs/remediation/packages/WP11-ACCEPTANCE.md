# WP11 — Acceptance record

**Status:** ACCEPTED
**Date:** 2026-08-23
**Merged as:** `0d253ef` (PR [#371](https://github.com/strale-io/strale/pull/371))
**Deployed and verified on:** `GET /health` → `{"status":"ok","commit":"0d253efdc380"}`
— the deployed commit is the merge commit, not a predecessor. (Railway failed
deploys do not cut over, so this check is not a formality.)

Package manifest: `docs/remediation/packages/WP11.yaml` (defect, design, all
eight review rounds).

---

## 1. Migration artifacts in production

```
to_regclass('public.trial_grants')             → trial_grants
to_regclass('public.api_key_recovery_tokens')  → api_key_recovery_tokens
```

`startup_migration_ledger`:

| block | applied_at | rows_affected |
|---|---|---|
| `0100_relistUrlToMarkdown` | 2026-08-22T06:31:50Z | 1 |
| `0101_capability_invocations` | 2026-08-22T17:06:06Z | 0 |
| **`0102_account_lifecycle_tables`** | **2026-08-23T06:16:15Z** | **59** |

**Block 0103 writes no ledger row, by design** — it is idempotent DDL with a
post-creation verification, not a one-shot backfill, so there is nothing for a
ledger to gate. Its artifact is the trigger, verified in §4. Worth stating
explicitly so a later reader does not read the ledger's silence as a block that
never ran.

## 2. Backfill

```
rows              59
distinct_hashes   59      ← no collisions
channel=backfill  59
channel≠backfill   0      ← no live grant has been issued since deploy
oldest            2026-02-25T22:29:58Z   (the original grant times, not the backfill time)
newest            2026-08-05T06:36:59Z
```

**Completeness, asked as a question rather than assumed:** wallets holding a
`trial_credit` ledger entry whose address has no entitlement row → **0**.

**Hash agreement re-checked against live rows**, not trusted from the migration:
the SQL expression and `hashEmail()` agree on all five sampled production
addresses. This is the join that makes the entitlement apply to anything; had
it drifted, all 59 rows would be keyed on a value the application never
produces and the rule would silently cover nobody.

## 3. Indexes

| table | index | definition |
|---|---|---|
| `trial_grants` | `trial_grants_email_hash_unique` | UNIQUE btree (email_hash) |
| `trial_grants` | `trial_grants_ip_granted_idx` | btree (ip_hash, granted_at) |
| `trial_grants` | `trial_grants_pkey` | UNIQUE btree (id) |
| `api_key_recovery_tokens` | `api_key_recovery_tokens_token_hash_unique` | UNIQUE btree (token_hash) |
| `api_key_recovery_tokens` | `api_key_recovery_tokens_user_created_idx` | btree (user_id, created_at) |
| `api_key_recovery_tokens` | `api_key_recovery_tokens_pkey` | UNIQUE btree (id) |
| `wallet_transactions` | `wallet_transactions_stripe_session_id_unique` | UNIQUE btree (stripe_session_id) WHERE stripe_session_id IS NOT NULL |

## 4. Triggers on `transactions`

| trigger | enabled | meaning |
|---|---|---|
| `strale_chain_append_only_trigger` | `O` | fires on origin (pre-existing) |
| `transactions_redacted_content_stays_cleared_trg` | `O` | fires on origin (WP11 block 0103) |

Both `BEFORE UPDATE … FOR EACH ROW`. They sort `strale_…` before
`transactions_…`, so append-only runs first; it guards only the hash columns,
which 0103 does not touch, so there is no interaction in either direction.

---

## 5. Enforcement proofs

**A note on how these were run, because it changes what they prove.**

The only production credential available is `strale_ro` — a dedicated role with
`default_transaction_read_only = on`. An `INSERT` there fails with SQLSTATE
`25006` *before it ever reaches a constraint*, so a rolled-back write probe
against production is not possible with it. That is a good property of the
credential, not a gap in the deploy, but it means each proof has two halves and
both are reported. **Neither half is presented as the other.**

### 5.1 Production: is the mechanism armed, or merely present?

"Exists" is not "enforces" — the WP8 lesson. For these two mechanisms the
disarmed states are nameable, so they were named and checked:

```
pg_index:    trial_grants_email_hash_unique              indisunique=t indisvalid=t indisready=t indislive=t
             api_key_recovery_tokens_token_hash_unique   indisunique=t indisvalid=t indisready=t indislive=t
             wallet_transactions_stripe_session_id_unique indisunique=t indisvalid=t indisready=t indislive=t

pg_trigger:  transactions_redacted_content_stays_cleared_trg   tgenabled='O'  (a disarmed trigger reads 'D')
             strale_chain_append_only_trigger                  tgenabled='O'
```

A unique btree index with `indisvalid` true has no state in which it exists and
silently does not enforce — unlike a `NOT VALID` CHECK constraint, which is
what WP8's `convalidated` check existed for.

### 5.2 Behavioural: the same probes, rolled back

Run against a database materialised the way production is — `drizzle-kit push`,
then all 46 startup migration blocks — with the trigger function's source
**compared byte-for-byte against production's** (`pg_get_functiondef`,
identical, 603 bytes). So the behaviour observed is the behaviour of the code
production is running.

**Duplicate trial entitlement is refused:**
```
INSERT INTO trial_grants (email_hash, …) VALUES (<existing hash>, …)
→ refused: trial_grants_email_hash_unique (SQLSTATE 23505)
after rollback: 1 row, 0 probe rows left
```

**Redacted content cannot be restored.** An UPDATE writing content back onto a
row stamped `redacted_at` — the shape every one of the eight content-writing
call sites issues:
```
output      after write → null
error       after write → null
provenance  after write → null
input       after write → {}          (NOT NULL, so it empties rather than nulls)
redacted_at still set   → true        (the stamp cannot be cleared to get around it)
deletion_reason         → account_closure_erasure   (preserved)
```
And the trigger is narrow enough not to break the workers that still need the
row: a status write on the same row lands normally (`status='failed'`,
`latency_ms=42`).

## 6. Internal re-registration receives zero trial credit

Three checks, because they answer different questions and only the third is
about the grant.

**Live production API.** `POST /v1/auth/register` with an existing internal
address (`test-cap@strale.io`):
```
409  {"error_code":"invalid_request","message":"An account with this email already exists."}
users        60 → 60
trial_grants 59 → 59      ← nothing created
```
This proves no account and no grant, but it proves it via the duplicate check,
which fires *before* the entitlement gate. On its own it says nothing about
what the gate would do.

**The gate, over every backfilled address (read-only, against production
rows).** All 59 evaluated through the shipped `assessTrialGrant`:

| verdict | count |
|---|---|
| `withhold: email_already_granted` | 58 |
| `refuse: disposable_domain` | 1 |
| would receive a grant | **0** |

The single refusal is `16d5giqbmn@lnovic.com`, whose domain is on the
disposable list — refused earlier and harder than a withhold, so it is a
stronger outcome, not an exception.

**Control:** a never-seen address still assesses `grant / 200`. The gate is
withholding, not stuck.

**End to end, through the shipped handler.** The full
`account-lifecycle.integration.test.ts` suite against the reference database:
**26/26**, including *"withholds the grant from an address that has already had
one, even after closure"* — register, close, re-register, and receive
`wallet_balance_cents: 0` with a `trial_credits` object. This is the path a
real re-registration takes; production has no closed accounts yet, so it cannot
be exercised there without closing one.

---

## 7. Left as historical state — founder decision, 2026-08-23

Verified present and deliberately **not** touched:

| | measured |
|---|---|
| wallets where `balance_cents ≠ SUM(ledger)` | **22** (net €1,085.75, all internal accounts, pre-WP2 manual `UPDATE`s) |
| trial credit granted to the eight farmed accounts | **1,600 cents** |

Neither was mutated. Recording the measurement rather than the intention, so a
later reader can tell a decision from an oversight.

## 8. Cross-repo customer-facing fixes

[strale-frontend#20](https://github.com/strale-io/strale-frontend/pull/20):

- **Recovery docs** no longer say a recovery request emails a new key or
  invalidates the current one. This was the item with real customer cost: a
  customer who requested a code and then read the page would conclude their old
  key was dead and discard it — on our written instruction, while it was still
  the only key they had.
- **Privacy erasure disclosure** corrected. It said the input "may remain
  readable" and asked customers to write in for removal. Closure clears it
  immediately now.
- **`trial_grants` retention disclosed**, described as pseudonymous rather than
  anonymous, with the removal route and its consequence stated.

## 9. Still open, deliberately

- **VERIFY-IP remains OPEN and WP12 remains blocked on it.** `getClientIp`
  reads the client-supplied leftmost `X-Forwarded-For`, which is why WP11
  documents its per-IP trial cap as a speed bump rather than a gate. Railway's
  proxy hop-count behaviour is **not** guessed here and must not be: reading
  the wrong entry breaks every IP-keyed rate limit in production at once.
- **Stripe reversals** (`charge.dispute.created`, `charge.refunded`) are
  unhandled platform-wide. Pre-existing; a refund-policy decision, not a bug fix.
- **Zero Stripe top-ups have ever been credited** (`stripe_session_id IS NOT
  NULL` → 0), so the crediting path is proved only by the integration lane.
  Check `wallet_transactions` after the first real customer payment rather than
  reading silence as health — the same gap WP3 recorded honestly for
  `wallet_reservations`.
- **`/v1/audit/:id` does not mark a redacted row as redacted**, where
  `/v1/verify` does. Pre-existing for the 90-day purge; WP11 makes it reachable
  on day 0 for a closed account.
- **Closure has no workload bound.** The internal harness principal holds
  908,222 transactions. Not customer-reachable (largest real account: 482
  unredacted rows) and closure is authenticated, but it is unbounded.
