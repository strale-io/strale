# SA.2a.2a — `transactions` read-site classification & SA.2a.2b diff plan

**Date:** 2026-04-19
**HEAD:** `cc821293f98633a68bd78968634afc91c4136fc0` (`main`)
**Working tree inside `apps/api/src/`:** clean
**Scope:** every read of `transactions` (and, as a sibling check, `transaction_quality`) in `apps/api/src/**`.
**Output:** read-only. No source files modified. No commits.

## Tripwire check

| Tripwire | State |
|---|---|
| Working tree dirty inside `apps/api/src/` | Clean ✓ |
| HEAD at `cc82129` or later | At `cc82129` ✓ |
| Branch is `main` | Yes ✓ |

No plan-invalidating findings:
- 14-site list resolves to 33 physical read sites (within expectation for the 14-*file* list, not the >18 "wrong list" threshold).
- 0 category-D sites (threshold was >3 for re-scoping).
- `transaction_quality`: 3 read sites (threshold was >3 for scope expansion — stays in scope as an escalation flag, not a re-plan trigger).
- Integrity-hash / retention interaction is not genuinely ambiguous (see Open Question #3).
- All category-A sites have a clean one-line shape.

---

## 1. Classification table

One row per physical read site. Files with split classifications (A and B under the same roof) get multiple rows. Line numbers are of the `.from(transactions)` / `FROM transactions` token.

| # | File (relative to `apps/api/src/`) | Line | Real read? | Read type | Caller / surface | Category | Rationale |
|---|---|---|---|---|---|---|---|
| 1 | `routes/transactions.ts` | 36 | Yes | SELECT + `leftJoin(capabilities)` | `GET /v1/transactions` list (auth) | **A** | User-facing list of own txns — must hide soft-deleted. |
| 2 | `routes/transactions.ts` | 145 | Yes | SELECT + `leftJoin(capabilities)` | `GET /v1/transactions/:id` (auth branch) | **A** | User-facing detail — deleted txn must 404. |
| 3 | `routes/transactions.ts` | 160 | Yes | SELECT + `leftJoin(capabilities)` | `GET /v1/transactions/:id` (unauth, free-tier only) | **A** | Anonymous lookup by UUID; deleted txn must 404. |
| 4 | `routes/transactions.ts` | 197 | Yes | SELECT * (base row) | `GET /v1/transactions/:id/verify` — initial lookup | **A** | Initial lookup is user-facing. Deleted txn must 404 rather than return a verification report on erased data. |
| 5 | `routes/transactions.ts` | 223 | Yes | SELECT * (chain-walk loop) | `GET /v1/transactions/:id/verify` — hop loop (10 hops) | **B** | Chain walker must traverse deleted rows or `reaches_genesis` breaks. Returns only hashes + boolean `verified`, not PII. |
| 6 | `routes/verify.ts` | 33 | Yes | SELECT | `GET /v1/verify/:id` public chain-integrity endpoint — initial fetch | **B** | Public verification must prove the hash chain is intact across deleted rows. Response is hash-only. |
| 7 | `routes/verify.ts` | 148 | Yes | SELECT | `GET /v1/verify/:id` chain-walk hop loop | **B** | Same — hash-only traversal. |
| 8 | `routes/audit.ts` | 192 | Yes | SELECT (minimal columns) | `GET /v1/audit/:id?token=` HMAC-gated public audit | **A** | Deleted row's `input/output/audit_trail` must not be served to a token holder. See **Open Question #1**. |
| 9 | `routes/do.ts` | 468 | Yes | SELECT * (idempotency) | `POST /v1/do` idempotency-key lookup | **A** | A retry after soft-delete should create a new row, not resurrect the deleted one. |
| 10 | `routes/do.ts` | 652 | Yes | SELECT SUM(price_cents) (aggregate) | `POST /v1/do` hourly spend cap (DEC-21) | **B** | Abuse/security control — soft-delete must not reset spend cap. |
| 11 | `routes/do.ts` | 1003 | Yes | COUNT(*) | `POST /v1/do` free-tier IP rate limit (daily) | **B** | Abuse control — soft-delete must not reset the daily free-tier quota. |
| 12 | `routes/do.ts` | 1018 | Yes | COUNT(*) | `POST /v1/do` free-tier fingerprint rate limit | **B** | Same. |
| 13 | `routes/do.ts` | 1047 | Yes | GROUP BY capability_slug, COUNT(*) | `POST /v1/do` personalization hints — top caps | **B** | Long-term usage signal; including deleted is acceptable and stable. No PII returned. |
| 14 | `routes/do.ts` | 1058 | Yes | SELECT SUM(price_cents) (aggregate) | `POST /v1/do` personalization hints — total spend | **B** | Financial aggregate; same reasoning as spend cap. |
| 15 | `routes/do.ts` | 1639 | Yes | COUNT(*) fire-and-forget | `POST /v1/do` platform milestone check (non-x402 path) | **B** | Platform-wide lifetime counter; soft-delete must not un-fire a milestone. |
| 16 | `routes/do.ts` | 1992 | Yes | COUNT(*) fire-and-forget | `POST /v1/do` platform milestone check (x402 path) | **B** | Same. |
| 17 | `routes/admin.ts` | 71 | Yes | COUNT(DISTINCT user_id) subquery | `GET /v1/admin/stats` | **B** | Admin forensics — deleted rows still represent real historical activity. |
| 18 | `routes/admin.ts` | 82 | Yes | multi-window COUNT(*) | `GET /v1/admin/stats` — transaction counts | **B** | Same. |
| 19 | `routes/admin.ts` | 93 | Yes | multi-window SUM(price_cents) | `GET /v1/admin/stats` — revenue | **B** | Financial history. |
| 20 | `routes/admin.ts` | 103 | Yes | JOIN capabilities + GROUP BY slug | `GET /v1/admin/stats` — top capabilities 30d | **B** | Historical analytics. |
| 21 | `routes/admin.ts` | 134 | Yes | GROUP BY day, COUNT/SUM/COUNT(DISTINCT) | `GET /v1/admin/stats` — daily volume | **B** | Same. |
| 22 | `routes/admin.ts` | 288 | Yes | JOIN capabilities + users; jsonb extracts | `GET /v1/admin/request-analytics` | **B** | Admin forensics including deleted rows. |
| 23 | `routes/admin.ts` | 422 | Yes | JOIN capabilities + users; detailed log | `GET /v1/admin/external-transactions` | **B** | Explicit "show me everything" admin forensics endpoint. |
| 24 | `routes/a2a.ts` | 537 | Yes | SELECT * (user-scoped) | A2A `tasks/get` JSON-RPC method | **A** | User-scoped task polling; deleted task must return existing `-32602 Task not found`. |
| 25 | `routes/auth.ts` | 282 | Yes | COUNT(*) (7-day window, IP-scoped) | Signup upgrade path — requires prior free-tier call | **B** | Abuse control — erasing a free-tier call must not grant an upgrade bypass. |
| 26 | `lib/data-retention.ts` | 66, 68 | Yes | DELETE … WHERE id IN (SELECT id FROM transactions …) | Retention cron (3-year hard-delete) | **C** | Delete operation: the nested `SELECT` is a sub-scan of a DELETE, not a read for display. See **Open Question #3** on interaction with redacted_at. |
| 27 | `lib/integrity-hash.ts` | 77 | Yes | SELECT latest by `completedAt DESC, id DESC` | `getPreviousHash()` — chain-tip resolver | **B** | Chain tip must include deleted rows or a new txn chains off an obsolete predecessor and the chain forks. Core invariant. |
| 28 | `jobs/integrity-hash-retry.ts` | 73 | Yes | SELECT * WHERE complianceHashState='pending' | Integrity-hash retry worker (every 30s) | **B** | A row soft-deleted before its hash finished must still be hashed, or `reaches_genesis` fails at that row. Chain first, retention second. |
| 29 | `lib/daily-digest/fetch-platform.ts` | 53 | Yes | COUNT(*) 24h | Daily digest — API call count | **B** | Founder-facing daily report reflects real activity incl. deletions. |
| 30 | `lib/daily-digest/fetch-platform.ts` | 60 | Yes | SUM(price_cents) 24h | Daily digest — revenue | **B** | Same. |
| 31 | `lib/daily-digest/fetch-platform.ts` | 67 | Yes | COUNT(DISTINCT user_id) 24h | Daily digest — unique users | **B** | Same. |
| 32 | `lib/daily-digest/fetch-platform.ts` | 74 | Yes | JOIN + GROUP BY slug | Daily digest — top capabilities | **B** | Same. |
| 33 | `lib/daily-digest/fetch-platform.ts` | 89 | Yes | GROUP BY solution_slug | Daily digest — solution executions | **B** | Same. |
| 34 | `lib/daily-digest/fetch-platform.ts` | 125 | Yes | COUNT(*) authenticated external API calls | Daily digest — external call metric | **B** | Same. |
| 35 | `lib/daily-digest/fetch-platform.ts` | 135 | Yes | COUNT(*) free-tier external API calls | Daily digest — free-tier external metric | **B** | Same. |
| 36 | `lib/daily-digest/fetch-platform.ts` | 143 | Yes | COUNT(*) failed external API calls | Daily digest — failure metric | **B** | Same. |
| 37 | `lib/daily-digest/fetch-platform.ts` | 153 | Yes | JOIN + GROUP BY slug (external failures) | Daily digest — external failure by capability | **B** | Same. See **Open Question #2**. |
| 38 | `lib/daily-digest/fetch-scoreboard.ts` | 17 | Yes | COUNT(*) lifetime | Daily digest scoreboard — total API calls | **B** | Lifetime counter; including deleted rows keeps the number monotonic. See **Open Question #2**. |
| 39 | `db/backfill-output-examples.ts` | 36 | Yes | SELECT output + JOIN capabilities | One-off script to backfill `capabilities.output_schema.example` from live txn output | **A** (quarantined) | A deleted txn's `output` is exactly the PII a user erased — backfilling it into a public schema example would undo the erasure. Script is not wired at runtime but would still be harmful if re-run. |
| 40 | `app.ts` | 200, 204 | Yes | `INSERT … RETURNING` + `DELETE … WHERE id IN (SELECT id FROM probe)` (CTE, both clauses write the same synthetic probe row) | `GET /health/deep` Railway health probe | **C** | Write-then-delete synthetic probe; no user-visible read. No filter applicable. |

**Sibling check — `transaction_quality`** (same soft-delete pattern; column `transaction_quality.deleted_at` added by migration 0048):

| File | Line | Read? | Surface | Category | Rationale |
|---|---|---|---|---|---|
| `lib/quality-aggregation.ts` | 101 | Yes | JOIN transactions + capabilities (quality_rows CTE) | `GET /v1/quality/:slug` (public) | **A, contingent** | Public quality signal per capability. A user's erased txn should stop influencing the public metric. Flagged as **Open Question #4** — product decision. |
| `lib/quality-aggregation.ts` | 109 | Yes | same shape (all_count CTE) | same | **A, contingent** | Same. |
| `lib/quality-aggregation.ts` | 133 | Yes | same shape (recent_latency CTE, ORDER BY desc LIMIT 50) | same | **A, contingent** | Same. |
| `lib/data-retention.ts` | 43, 45 | Yes | DELETE … WHERE id IN (SELECT tq.id FROM transaction_quality tq JOIN transactions t …) | Retention cron | **C** | Same class as txn-side DELETE. |
| `lib/quality-capture.ts` | 39 | No | INSERT-only | - | **C** | Write-only. |
| `lib/test-runner.ts` | 1237 | No | INSERT-only | - | **C** | Write-only. |

---

## 2. Counts

- **Total A sites:** 7 (6 in-scope + 1 quarantine): transactions.ts×4, audit.ts×1, do.ts×1, a2a.ts×1, backfill-output-examples.ts×1.
- **Total B sites:** 25: transactions.ts×1, verify.ts×2, do.ts×7, admin.ts×7, auth.ts×1, integrity-hash.ts×1, integrity-hash-retry.ts×1, fetch-platform.ts×9, fetch-scoreboard.ts×1.
- **Total C sites:** 3: data-retention.ts (txn DELETE), data-retention.ts (tq DELETE), app.ts (health probe).
- **Total D sites:** 0.
- **`transaction_quality` sibling A-contingent:** 3 (quality-aggregation.ts — all resolved by the same product call, Open Question #4).
- **Estimated diff size for SA.2a.2b:** 7 one-line additions (each of the form `isNull(transactions.deletedAt)` appended to an existing `and(...)` or `where(...)`). If Open Question #4 resolves to "filter", add 3 more raw-SQL additions (`AND tq.deleted_at IS NULL`) in `quality-aggregation.ts`. **Net: 7–10 lines changed across 6–7 files.**

---

## 3. Proposed commit split for SA.2a.2b

7 A sites is in the 7–12 band, so split by module:

1. **Commit A1 — user-facing txn reads** (`routes/transactions.ts` — 4 sites: L36, L145, L160, L197). Self-contained; adds `isNull` to one import + 4 `where`/`and` clauses.
2. **Commit A2 — control-plane surfaces** (`routes/audit.ts` L192, `routes/a2a.ts` L537, `routes/do.ts` L468 idempotency). 3 sites across 3 files; groups the "deleted txn must 404 on lookup" behaviour uniformly.
3. **Commit A3 — quarantine / docs** (`db/backfill-output-examples.ts` L36). Separate commit — add filter **and** a header comment warning the script sources schema examples from potentially-erased user data; tag it unsafe-to-rerun pending Open Question #5.
4. **Optional Commit A4 (only if Open Question #4 resolves to "filter")** — `lib/quality-aggregation.ts` L101/109/133: add `AND tq.deleted_at IS NULL` to each CTE's `WHERE`. Single file, 3 additions.

Rationale for the split: A1 and A2 encode different semantic decisions (user-facing list vs. lookup-tombstone) and should be independently revertable. A3 is a quarantine concern, not a user-facing bug. A4 is gated on a product decision.

---

## 4. Diff plan — category A

### `routes/transactions.ts:25-40` (site #1 — list)

**Current:**
```ts
    const rows = await db
      .select({
        id: transactions.id,
        status: transactions.status,
        capability_slug: capabilities.slug,
        solution_slug: transactions.solutionSlug,
        price_cents: transactions.priceCents,
        latency_ms: transactions.latencyMs,
        created_at: transactions.createdAt,
        completed_at: transactions.completedAt,
      })
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(eq(transactions.userId, user.id))
      .orderBy(desc(transactions.createdAt))
      .limit(100);
```

**Proposed:**
```ts
    const rows = await db
      .select({
        id: transactions.id,
        status: transactions.status,
        capability_slug: capabilities.slug,
        solution_slug: transactions.solutionSlug,
        price_cents: transactions.priceCents,
        latency_ms: transactions.latencyMs,
        created_at: transactions.createdAt,
        completed_at: transactions.completedAt,
      })
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.createdAt))
      .limit(100);
```

**Pattern used:** wrap single-predicate `where(eq(…))` in `and(…, isNull(transactions.deletedAt))`. Add `isNull` to the `drizzle-orm` import at line 2.
**Risk:** none. The partial index `idx_transactions_id_not_deleted` matches this predicate.

---

### `routes/transactions.ts:143-148` (site #2 — GET /:id auth)

**Current:**
```ts
      const [row] = await db
        .select(selectFields)
        .from(transactions)
        .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
        .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
        .limit(1);
```

**Proposed:**
```ts
      const [row] = await db
        .select(selectFields)
        .from(transactions)
        .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
        .where(and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
        .limit(1);
```

**Pattern used:** append `isNull(transactions.deletedAt)` as a third argument to the existing `and(…)`.
**Risk:** none.

---

### `routes/transactions.ts:158-163` (site #3 — GET /:id unauth free-tier)

**Current:**
```ts
    const [row] = await db
      .select(selectFields)
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(and(eq(transactions.id, id), eq(transactions.isFreeTier, true)))
      .limit(1);
```

**Proposed:**
```ts
    const [row] = await db
      .select(selectFields)
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(and(eq(transactions.id, id), eq(transactions.isFreeTier, true), isNull(transactions.deletedAt)))
      .limit(1);
```

**Pattern used:** same.
**Risk:** none.

---

### `routes/transactions.ts:191-199` (site #4 — verify initial lookup)

**Current:**
```ts
    const condition = user
      ? and(eq(transactions.id, id), eq(transactions.userId, user.id))
      : and(eq(transactions.id, id), eq(transactions.isFreeTier, true));

    const [txn] = await db
      .select()
      .from(transactions)
      .where(condition)
      .limit(1);
```

**Proposed:**
```ts
    const condition = user
      ? and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt))
      : and(eq(transactions.id, id), eq(transactions.isFreeTier, true), isNull(transactions.deletedAt));

    const [txn] = await db
      .select()
      .from(transactions)
      .where(condition)
      .limit(1);
```

**Pattern used:** same — added to both branches of the conditional.
**Risk:** the chain walker immediately below (L221-225, site #5) deliberately does *not* add this filter, so a user can still verify the chain even if their own txn is deleted. That asymmetry is intentional and is the point of separating the initial lookup (A) from the walk (B).

---

### `routes/audit.ts:180-194` (site #8 — HMAC-gated audit)

**Current:**
```ts
  const [txn] = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      latencyMs: transactions.latencyMs,
      input: transactions.input,
      createdAt: transactions.createdAt,
      completedAt: transactions.completedAt,
      capabilityId: transactions.capabilityId,
      solutionSlug: transactions.solutionSlug,
      complianceHashState: transactions.complianceHashState,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!txn) {
    return c.json(apiError("not_found", "Transaction not found."), 404);
  }
```

**Proposed:**
```ts
  const [txn] = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      latencyMs: transactions.latencyMs,
      input: transactions.input,
      createdAt: transactions.createdAt,
      completedAt: transactions.completedAt,
      capabilityId: transactions.capabilityId,
      solutionSlug: transactions.solutionSlug,
      complianceHashState: transactions.complianceHashState,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)))
    .limit(1);

  if (!txn) {
    return c.json(apiError("not_found", "Transaction not found."), 404);
  }
```

**Pattern used:** wrap single-predicate `where(eq(…))` in `and(…, isNull(…))`. Add `isNull` + `and` to the drizzle-orm import if not present.
**Risk:** low for the base case. Holds until **Open Question #1** is resolved — if the answer is "410 Gone with tombstone", this diff is replaced by a two-query approach that first looks up without the filter, then decides response shape.

---

### `routes/do.ts:465-470` (site #9 — idempotency)

**Current:**
```ts
  if (idempotencyKey && user) {
    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.idempotencyKey, idempotencyKey), eq(transactions.userId, user.id)))
      .limit(1);
```

**Proposed:**
```ts
  if (idempotencyKey && user) {
    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.idempotencyKey, idempotencyKey), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .limit(1);
```

**Pattern used:** append to existing `and(…)`. Add `isNull` to drizzle-orm import if not present.
**Risk:** none. A retry that finds no match will create a new txn, which is the semantically correct behaviour after soft-delete.

---

### `routes/a2a.ts:533-539` (site #24 — A2A tasks/get)

**Current:**
```ts
    const db = getDb();
    const [txn] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, taskId), eq(transactions.userId, user.id)))
      .limit(1);
```

**Proposed:**
```ts
    const db = getDb();
    const [txn] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, taskId), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .limit(1);
```

**Pattern used:** append to existing `and(…)`. Add `isNull` to drizzle-orm import if not present.
**Risk:** none.

---

### `db/backfill-output-examples.ts:34-46` (site #39 — quarantine)

**Current:**
```ts
  const [recentTx] = await db
    .select({ output: transactions.output })
    .from(transactions)
    .innerJoin(capabilities, eq(capabilities.id, transactions.capabilityId))
    .where(
      and(
        eq(capabilities.slug, slug),
        eq(transactions.status, "completed"),
        isNotNull(transactions.output),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1);
```

**Proposed:**
```ts
  const [recentTx] = await db
    .select({ output: transactions.output })
    .from(transactions)
    .innerJoin(capabilities, eq(capabilities.id, transactions.capabilityId))
    .where(
      and(
        eq(capabilities.slug, slug),
        eq(transactions.status, "completed"),
        isNotNull(transactions.output),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1);
```

**Pattern used:** append to existing `and(…)`. Add `isNull` to drizzle-orm import.
**Risk:** the script sources public schema examples from real user data. Even with the filter, a row that was *never* soft-deleted but contained unusual content could still surface. Bigger concern is that this script is not wired at runtime — 2a.2b should also add a comment at the top explaining why this script is unsafe to re-run without manual review (or retire it; see Open Question #5).

---

## 5. Diff plan — category B (no change)

### `routes/transactions.ts:221-225` (site #5 — verify chain-walk loop)
**Classification:** B (hash-only chain traversal — must see deleted rows so `reaches_genesis` holds).
**Decision:** no change. Deleted rows are traversed; response surface returns only hashes and a boolean `verified`, not PII.

### `routes/verify.ts:33` (site #6 — public verify initial fetch)
**Classification:** B (public chain-integrity surface; hash-only response).
**Decision:** no change.

### `routes/verify.ts:148` (site #7 — public verify chain walk)
**Classification:** B (same).
**Decision:** no change.

### `routes/do.ts:650-658` (site #10 — hourly spend cap)
**Classification:** B (abuse/security control; soft-delete must not reset spend cap).
**Decision:** no change.

### `routes/do.ts:1002-1012` (site #11 — free-tier IP rate limit)
**Classification:** B (abuse control).
**Decision:** no change.

### `routes/do.ts:1017-1024` (site #12 — free-tier fingerprint rate limit)
**Classification:** B (same).
**Decision:** no change.

### `routes/do.ts:1045-1052` (site #13 — personalization: top caps)
**Classification:** B (long-term usage signal; no PII in response).
**Decision:** no change.

### `routes/do.ts:1056-1059` (site #14 — personalization: total spend)
**Classification:** B (financial aggregate).
**Decision:** no change.

### `routes/do.ts:1637-1643` (site #15 — milestone check, non-x402)
**Classification:** B (lifetime counter).
**Decision:** no change.

### `routes/do.ts:1990-1996` (site #16 — milestone check, x402)
**Classification:** B (same).
**Decision:** no change.

### `routes/admin.ts:71` (site #17 — stats.with_transactions)
**Classification:** B (admin forensics).
**Decision:** no change.

### `routes/admin.ts:76-84` (site #18 — stats.transactions)
**Classification:** B (same).
**Decision:** no change.

### `routes/admin.ts:87-95` (site #19 — stats.revenue)
**Classification:** B (same).
**Decision:** no change.

### `routes/admin.ts:98-110` (site #20 — stats.top_capabilities)
**Classification:** B (same).
**Decision:** no change.

### `routes/admin.ts:128-139` (site #21 — stats.daily_volume)
**Classification:** B (same).
**Decision:** no change.

### `routes/admin.ts:277-294` (site #22 — request-analytics)
**Classification:** B (same).
**Decision:** no change.

### `routes/admin.ts:403-429` (site #23 — external-transactions detail log)
**Classification:** B (explicit "show everything" forensic surface).
**Decision:** no change.

### `routes/auth.ts:280-289` (site #25 — upgrade path free-tier proof)
**Classification:** B (abuse control — erasing a qualifying call must not unlock upgrade bypass).
**Decision:** no change.

### `lib/integrity-hash.ts:74-84` (site #27 — getPreviousHash)
**Classification:** B (chain tip must include deleted rows or chain forks).
**Decision:** no change. Core invariant.

### `jobs/integrity-hash-retry.ts:71-80` (site #28 — retry worker)
**Classification:** B (must hash deleted-but-unhashed rows or `reaches_genesis` fails at that row).
**Decision:** no change. See **Open Question #3** for interaction with retention.

### `lib/daily-digest/fetch-platform.ts` L45-163 (sites #29–37, all B)
**Classification:** B (founder-facing daily report of real activity).
**Decision:** no change. See **Open Question #2**.

### `lib/daily-digest/fetch-scoreboard.ts:17` (site #38 — lifetime total)
**Classification:** B (lifetime monotonic counter).
**Decision:** no change. See **Open Question #2**.

---

## 6. Diff plan — category C (not applicable)

- `lib/data-retention.ts:60-80` (txn purge): the `SELECT id FROM transactions` is the sub-scan of `DELETE FROM transactions`. No filter needed — soft-deleted rows are also eligible for hard-delete past the 3-year window. See **Open Question #3**.
- `lib/data-retention.ts:37-58` (tq purge): analogous.
- `app.ts:191-211` (`/health/deep`): CTE `INSERT … RETURNING id` + `DELETE … WHERE id IN (SELECT id FROM probe)`. Both touch a single synthetic probe row created inside the CTE; no user data read.

---

## 7. Diff plan — category D (none)

No grep false positives. Every line in the 14-file list resolves to a real read or a writemutation.

---

## 8. Open questions for chat (blocking SA.2a.2b)

### Open Question #1 — `GET /v1/audit/:id?token=` response shape for deleted rows
HMAC-gated public audit surface. The diff plan above assumes `404 not_found` (simplest; matches the existing code path). Alternatives:

- **(a)** 404 `not_found` — cheapest, one-line diff, no new behaviour to test.
- **(b)** 410 Gone with `{status: "deleted", deleted_at, deletion_reason}` and no input/output. Cleaner for regulators who want to prove the txn existed and was erased.
- **(c)** Two-stage: 200 with normal payload if `deletedAt IS NULL`, 200 with redacted payload if `redactedAt IS NULL` (soft-deleted but pre-retention), 410 Gone if `redactedAt IS NOT NULL`. Matches the full SA.2a state machine.

**Recommendation:** (a) for 2a.2b (ships the hardening). Track (c) as a separate ticket if compliance asks.

### Open Question #2 — daily digest inclusion of deleted rows
`fetch-platform.ts` and `fetch-scoreboard.ts` are internal aggregates for the founder's daily email. Classifying B means a user's erased txns continue to appear in platform totals, revenue, top-capabilities, and lifetime counts. Alternatives:

- **(a)** Keep B (current diff plan). Justification: the digest is an operator report, not a user report; real activity happened.
- **(b)** Filter for "external API calls" and revenue (user-facing metrics) but keep lifetime count unfiltered for trend continuity. Hybrid.
- **(c)** Filter everywhere. Simplest to reason about; means digest numbers drop when a user hard-erases.

**Recommendation:** (a) for 2a.2b (matches the diff plan as written). If operator-accuracy preference surfaces later, revisit.

### Open Question #3 — retention-sweep interaction with soft-delete
`lib/data-retention.ts:60-80` hard-deletes `WHERE created_at < cutoff AND legal_hold = false`. SA.2a adds `redacted_at`. Two questions:

- Should the retention sweep also set `deletion_reason = 'retention_expired'` on rows it is about to hard-delete, for a moment before the DELETE? Probably no — the row is gone the instant the DELETE commits.
- Should user-initiated soft-delete trigger a shorter retention window (e.g. hard-delete anything where `deleted_at < now - 30d` regardless of `created_at`)? This is what most GDPR-aligned systems do.

**Not blocking 2a.2b** (the diff plan doesn't touch retention). Flagged so it lands on the SA.2a tracker before SA.2a closes.

### Open Question #4 — `transaction_quality` in public SQS signal
`lib/quality-aggregation.ts:101/109/133` feeds `GET /v1/quality/:slug`. If a user soft-deletes their txn (and 2a.2b's DELETE handler also soft-deletes the paired `transaction_quality` row — the schema supports it), should its quality signal stop influencing the public SQS number?

- **(a)** Yes, filter. GDPR-aligned; the user's data no longer participates in anything public.
- **(b)** No, keep. Quality signal is an operator-domain metric about the *capability*, not the user; individual deletions shouldn't bias it.

**Recommendation:** (a), because SA.2a's whole premise is "gone means gone." But this is a product decision, not a code decision. If (a) wins, add Commit A4 to the 2a.2b split.

### Open Question #5 — retire or guard `db/backfill-output-examples.ts`?
One-off script that picks a real user txn's output as a public schema example. The diff plan adds `deletedAt IS NULL`, but the underlying concern — seeding public schema examples from live user data — remains. Options:

- **(a)** Retire the script entirely; schema examples are authored in manifests.
- **(b)** Keep the script, add the filter, add a warning comment, require manual slug list to re-run.
- **(c)** Keep as-is + filter.

**Recommendation:** (b) for 2a.2b. Separate ticket for (a).

---

## 9. Verification checklist

- [x] Classification table has one row per physical site from the 14-file list, plus sibling `transaction_quality` rows.
- [x] Every A row has a corresponding diff plan entry with exact Current/Proposed snippets.
- [x] Every B row has a one-line "no change" entry with rationale.
- [x] C rows listed with one-line explanations; no D rows.
- [x] Open questions section populated (5 items).
- [x] No files modified in `apps/api/src/`.
- [x] `git status` shows only the new `audit-reports/SA_2a_2a_classification.md` file plus pre-existing root-level dirty state (`package-lock.json`, session docs).

---

*End of SA.2a.2a audit. Ready for chat review before SA.2a.2b implementation.*
