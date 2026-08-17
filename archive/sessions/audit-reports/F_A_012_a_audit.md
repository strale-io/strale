# F-A-012.a — Verify endpoint DoS hardening audit (rate limit tightening + chain-walk cap + truncated marker)

**Date:** 2026-04-20
**HEAD:** `d091ea7716dbe24afd9a4da25e5a799e558d211d` (`main`)
**Working tree inside `apps/api/src/`:** clean
**Scope:** read-only audit. No code modified. No commits.
**Findings source:** `SESSION_A_audit_findings.md` at repo root, tracked at commit `5927bfb`.
**Pre-decided design:** rate limit by IP + per-request chain-walk cap. CC chooses exact N.

## Tripwire check

| Tripwire | State |
|---|---|
| Working tree clean inside `apps/api/src/` | ✓ |
| HEAD at `d091ea7` or later | At `d091ea7` ✓ |
| Branch is `main` | ✓ |
| `SESSION_A_audit_findings.md` locatable + F-A-012 present | ✓ (L189-199) |
| No interval commits touching `routes/transactions.ts`, `routes/verify.ts`, `routes/audit.ts`, rate-limit middleware, `lib/integrity-hash.ts` | ✓ (zero commits since `d091ea7`) |

**Plan-invalidating findings:** one nuance — **an `optionalAuthMiddleware`-adjacent chain walker ALREADY exists** in `routes/transactions.ts:229-287` (`GET /v1/transactions/:id/verify`) with a **10-hop hardcoded cap** (L262: `for (let i = 0; i < 10 && current; i++)`). That sibling endpoint is NOT the F-A-012 target; F-A-012 is specifically about the public `/v1/verify/:id` route in `routes/verify.ts`. Both are covered in Sub-report B; only `verify.ts` needs the F-A-012.b mitigation.

Also: the `verify.ts` handler **already has a 200-hop cap AND a 30 req/min IP rate limit.** The finding is not "add a cap / add a rate limit" — it's "the cap is too permissive given memory cost per hop." Sub-report E resolves with a tighter cap.

---

## Sub-report A — F-A-012 verbatim extract

From `SESSION_A_audit_findings.md` L189-199:

> ### F-A-012: Public `/verify/:id` chain walk has O(n×row-size) memory cost with weak DoS mitigation
>
> - **Category**: Resource efficiency
> - **Severity**: Medium
> - **Confidence**: Medium
> - **Location**: [apps/api/src/routes/verify.ts:23](apps/api/src/routes/verify.ts#L23), [apps/api/src/routes/verify.ts:148-152](apps/api/src/routes/verify.ts#L148-L152)
> - **What's wrong**: The chain walk does `db.select()` (all columns including `input`, `output`, `auditTrail`, `provenance` JSONB blobs) for every row in the chain up to `max_depth=200`. Rate limit is 30 req/min per IP. At 200 hops with average row size (conservatively 5-20 KB for typical capabilities; larger for scrapers), a single request can move 1-4 MB into Node memory. 30 req/min × 4 MB = 120 MB/min sustained per IP. Distributed across a few IPs, this can pressure the single Railway replica's memory.
> - **Why it matters**: Public endpoint, unauthenticated, discoverable from any audit URL. Only IP-based rate limit. An attacker doesn't get anything useful out of the response (JSON summary), but they can exhaust memory / bandwidth / DB pool on the single replica. Recovery is automatic but disruptive.
> - **Reproduction / evidence**: Inspect `select().from(transactions)` — no column projection. Each row pulls full JSONB. At production-sized inputs (scraping capabilities occasionally return 50KB+ HTML-derived data), worst case is larger.
> - **Suggested direction**: Two changes: (a) `.select({ id, integrityHash, previousHash, ... })` — only fields needed by `computeIntegrityHash` + metadata for the response. Avoid hauling full `input`/`output`/`provenance` JSONB just to hash them. Wait — the hash is computed from those fields, so they need to be fetched. Alternative: (b) cache the computed hash verification result (a row's integrity_hash is immutable once chain-linked; walking the same chain twice produces the same result). (c) tighter rate limit on the deep-walk endpoint (10 req/min instead of 30). (d) lower the default and max depth (20 default, 50 max) — most legitimate verifications only need a shallow walk.
> - **Related findings**: none.

**Reading of the finding:** options (a) is self-invalidated in the text ("the hash is computed from those fields, so they need to be fetched"). (b) is real but adds cache-invalidation complexity. (c) and (d) are the actionable mitigations. F-A-012.b proceeds with (c) + (d) and defers (b).

---

## Sub-report B — Current endpoint surface

### `GET /v1/verify/:transactionId` — `routes/verify.ts`

| Property | Current value |
|---|---|
| Handler range | L23-112 |
| Mount | `app.route("/v1/verify", verifyRoute)` at `app.ts:331` |
| Auth gate | **None** (public) |
| Rate limit | `rateLimitByIp(30, 60_000)` at L21 — 30 req/min per IP |
| Chain walker | `walkChain()` at L125-197 |
| Max depth (constant) | `MAX_DEPTH = 200` at L15 |
| Default depth (constant) | `DEFAULT_DEPTH = 50` at L16 |
| User-supplied `?depth=N` cap | clamped to `[1, 200]` via L26 |
| DB query per hop | `db.select().from(transactions).where(eq(integrityHash, currentHash)).limit(1)` — **no column projection, full row including all JSONB** |
| Response shape | `{transaction_id, verified, hash_valid, chain: {length, verified_links, broken_links, reaches_genesis, chain_start_date, chain_end_date, max_depth, first_broken_link_id?}, transaction_metadata, methodology_url}` |
| Truncation marker | **absent.** Caller must compare `chain.length` to `chain.max_depth` to infer truncation. |

**Worst-case cost per request today:** 200 hops × full-row fetch. With scraping capabilities storing 50KB+ JSONB per row, worst-case is ~10MB/request. At the existing 30 req/min per IP, that's 300MB/min per IP — enough to pressure the single Railway replica's memory.

### Sibling: `GET /v1/transactions/:id/verify` — `routes/transactions.ts:230-296`

| Property | Current value |
|---|---|
| Handler range | L230-296 |
| Auth gate | `optionalAuthMiddleware` (authed for own txn; unauth only for `is_free_tier = true`) |
| Rate limit | `rateLimitByKey(10, 1000)` — 10 req/sec per API key. **No rate limit for unauth free-tier callers.** |
| Chain walker | inline loop in handler |
| Max depth (hardcoded) | **10** at L262 (`for (let i = 0; i < 10 && current; i++)`) |
| DB query per hop | `db.select().from(transactions).where(eq(integrityHash, currentHash)).limit(1)` — same shape as verify.ts, full row |
| Response shape | `{transaction_id, integrity_hash, recomputed_hash, verified, chain_length, chain: [{id, hash, verified}, ...]}` |
| Worst-case cost | 10 hops × ~20KB avg = 200KB/request — **bounded enough to not be a DoS vector** |

**Conclusion:** `routes/transactions.ts:/:id/verify` is already tightly bounded (10 hops hard). F-A-012.b does NOT need to touch it. Only `routes/verify.ts` is in scope.

### `GET /v1/audit/:id?token=` (HMAC-gated)

Not a chain walker. Fetches one transaction, composes compliance profile. Different vector class. Not in F-A-012 scope.

---

## Sub-report C — Actual prod chain length distribution

Query run against prod DB (`DATABASE_URL` points at prod per session memory):

```sql
SELECT
  COUNT(*)::int AS total_txns,
  (SELECT COUNT(*)::int FROM transactions WHERE integrity_hash IS NOT NULL) AS with_hash,
  (SELECT MAX(len)::int FROM (
    SELECT DATE(created_at) AS day, COUNT(*) AS len
    FROM transactions WHERE deleted_at IS NULL AND integrity_hash IS NOT NULL
    GROUP BY DATE(created_at)) d) AS max_daily_chain,
  ...median_daily_chain, p95_daily_chain, distinct_days
FROM transactions;
```

Result:

| Metric | Value |
|---|---|
| Total transactions in `transactions` table | **44,222** |
| Transactions with `integrity_hash` populated | **6,271** (14% — others pre-F-0-009 Stage 2 or still pending) |
| Max daily chain length | **1,592** hops |
| Median daily chain length | **25** hops |
| P95 daily chain length | **1,308** hops |
| Distinct days with hashed transactions | **30** |

### Interpretation

- **Median case (25 hops)**: current 200-hop cap is 8× overkill. Verification completes well before the cap.
- **P95 case (1,308 hops)**: current 200-hop cap already truncates 5% of legitimate walks at hop 200 — the `reaches_genesis: false` signal is already unreliable for high-activity days.
- **Max case (1,592 hops)**: genesis will never be reached within any reasonable cap. Customers wanting to prove chain integrity beyond a single day need a different verification pattern (e.g. day-anchored digests) — **out of scope for F-A-012.b**.

**The walker walks `previousHash` pointers. Each day's first transaction chains to the previous day's last.** So a walk from a recent transaction that actually reaches genesis would need to traverse up to 30 days × ~25 median = ~750 median hops (or much more on high-activity days). This confirms: the "reaches genesis" goal is currently impractical at any sane cap. Verifications are effectively same-day chain-linkage checks.

### Takeaway for Sub-report E

- If the goal is "verify the row's own hash + prove some chain linearity", a small cap (50 hops) covers median cases fully and provides meaningful integrity evidence on longer chains.
- Deeper verification is feasible but expensive; making it the default is the DoS-amplification F-A-012 flagged.

---

## Sub-report D — Existing rate-limit infrastructure

### Helpers available

Both exported from `apps/api/src/lib/rate-limit.ts`:

| Helper | Signature | Keying | Storage | Notes |
|---|---|---|---|---|
| `rateLimitByKey(max, windowMs)` | middleware factory | `user.id` (requires `authMiddleware` run first) | in-memory Map | no-op if unauth; suitable for authed endpoints only |
| `rateLimitByIp(max, windowMs)` | middleware factory | client IP (x-forwarded-for → cf-connecting-ip → x-real-ip, with `isPlausibleIp` check) | in-memory Map | used by public endpoints |

### Storage + persistence

**In-memory Map** (rate-limit.ts:34) with a 60-second GC sweep. Module-scoped; **state is lost on deploy**. The helper is explicitly documented as "a cheap hedge, not a safety control" — for day-scale abuse-class limits (signup, auth), `lib/db-rate-limit.ts` is the authoritative alternative.

For F-A-012, in-memory is adequate: the DoS concern is short-window burst cost, not daily-scale abuse. A Railway restart resetting the window is acceptable.

### Spoofing hardening

`rateLimitByIp` uses `isPlausibleIp()` regex (L139-143) to reject non-IP strings before keying the map. This prevents `X-Forwarded-For: "; DROP TABLE"` pathological cache keys. Under Railway, `x-forwarded-for` is set by the LB and can't be spoofed by clients.

### Error shape

Rate-limit violations return:
- HTTP **429 Too Many Requests**
- Error code: `rate_limited`
- Body: `{error_code: "rate_limited", message: "Rate limit exceeded. Try again in N seconds.", details: {retry_after_seconds: N}}`
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

This is the canonical shape — F-A-012.b uses it as-is.

### Current usage (for reference)

| Endpoint | Limit |
|---|---|
| POST /v1/do | `rateLimitByIp(60, 60_000)` + `rateLimitByKey(10, 1000)` |
| /mcp all methods | `rateLimitByIp(60, 60_000)` |
| /v1/wallet/* | `rateLimitByKey(5, 1000)` |
| /v1/internal/* | `rateLimitByIp(120, 60_000)` |
| **GET /v1/verify/:id** | **`rateLimitByIp(30, 60_000)` (current, F-A-012.b tightens)** |
| POST /v1/transactions/:id/audit-token (F-A-006) | `rateLimitByKey(5, 1000)` |
| DELETE /v1/transactions/:id | `rateLimitByKey(5, 1000)` |

**Conclusion:** no new helper needed. F-A-012.b is a one-line middleware-argument change plus a walker-cap change + truncation marker. Single-commit scope.

---

## Sub-report E — Proposed N (chain-walk cap)

### CC's proposal: **N = 50 (max), default = 20.**

Matches F-A-012's suggested direction (d). Grounded in:

1. **Median chain length is 25 hops.** A cap of 50 covers the median case fully and gives 2× headroom. Callers requesting deeper walks get a truncated result; the median customer sees no behaviour change.
2. **P95 is 1,308 hops.** Any realistic cap (50, 100, 200, 500) truncates 95% of high-activity-day walks. The existing 200-hop cap already fails to reach genesis in those cases. The "reaches_genesis" signal is noise at scale — F-A-012.b acknowledges this reality rather than pretending the cap gets us closer to genesis.
3. **Memory cost**: 50 hops × ~20KB avg row = **1MB / request**. At the proposed 10 req/min per IP rate limit, worst-case is 10MB/min per IP — **30× reduction** from current worst case (300MB/min per IP).
4. **Default of 20** (matches finding recommendation): covers median cases with light headroom. Callers wanting more depth pass `?depth=50` explicitly. Most callers never touch the param.

### Alternatives considered

| Option | N | Rationale | Rejected because |
|---|---|---|---|
| CC recommendation | **50** | matches finding direction (d); median + 2× | (chosen) |
| Slightly permissive | 100 | P95-day chains still truncated; 2MB/req memory cost | marginal benefit, 2× the memory cost, neither cap reaches genesis on busy days |
| Prompt-formula default | 500 | P95×2 floor | defeats F-A-012's memory-cost intent |
| Aggressive | 20 | matches current default | too low — a caller who wants a deeper chain view can't opt in |

### Truncation marker

Add two response fields:

```ts
chain: {
  ...
  truncated: boolean,        // true when walker exited due to max_depth cap (vs genesis or broken link)
  truncated_reason?: string, // "max_depth_reached (N=50)" when truncated=true
}
```

Callers who want continuation can note the `chain_start_date` and issue a follow-up request with `?depth=50&before=<startdate-cursor>` — **deferred to a future finding** (not in F-A-012.b).

---

## Sub-report F — Proposed rate-limit config

### CC's proposal: **10 req/min per IP** (tighten from current 30).

Matches F-A-012's suggested direction (c). One-line change:

```ts
verifyRoute.use("*", rateLimitByIp(10, 60_000)); // was 30
```

### Rationale

- Legitimate use: a user verifying a specific transaction they care about. Human use pattern is one-off, maybe 2-3 checks before they trust the answer. 10/min gives 20x headroom over typical human use.
- Abuse use: scripted amplification. 10/min per IP hard-caps worst-case cost at 10 × 50-hop × 20KB = 10MB/min. Across 100 attacking IPs: 1GB/min sustained — still disruptive but far below current 30GB/min worst-case across same IP count.

### Error code + status

Unchanged from current behaviour: `rate_limited` / 429 / `Retry-After` header. No new error codes.

### Authed exemption

**No exemption.** Rationale: the verify endpoint is public; there's no authed surface. Adding auth would break the "discoverable from audit URL" contract F-A-005 just codified. Flagged in OQ #3.

---

## Sub-report G — Additional mitigations considered

### Request timeout (5s handler cap)

- **Benefit**: defence-in-depth if DB under load causes each hop's query to slow. Prevents handler from hanging.
- **Cost**: adds a wrapper; need to pick a value.
- **Recommendation: defer.** N-cap (50 hops) already bounds worst-case wall-clock at 50 × ~50ms DB = ~2.5s. A 5s timeout would fire only on pathological DB states, and Railway health-probe restarts catch those separately.

### Circuit breaker (aggregate-load protection)

- **Benefit**: if verify endpoint is aggregate-slow, temporarily 503 instead of compounding load.
- **Recommendation: defer.** F-A-012 is per-request cost, not aggregate. Circuit breaker is its own feature class.

### Caching (memoize verify results per transaction ID)

- **Benefit**: repeated hits on the same UUID skip the DB walk entirely. Hash chains are immutable once built — cache validity is trivial.
- **Cost**: cache invalidation on chain growth is subtle (new row links to previous; does the old cache entry become stale?). Actually no — each response is a verification of the walk ENDING at a specific row; that result doesn't change when new rows join the chain.
- **Recommendation: defer.** 80/20 win is real but adds a cache tier to reason about. Out of F-A-012.b scope; flag for Session 5 if verify endpoint traffic grows.

### Auth gate change (tighten to required)

- **Rejected at prompt design time.** Breaks the public-verify contract, which is the whole value proposition of a shareable chain-integrity URL.

### Column projection (finding direction (a))

- **Self-rejected in the finding.** The `computeIntegrityHash` function requires the full row's content. Projecting to `{id, integrityHash, previousHash}` would require switching from "deep verification" (recompute each row's hash) to "linkage verification" (pointer chain only). That's a semantic change F-A-012 doesn't scope.

---

## Sub-report H — Tests required

Extend `apps/api/src/routes/verify.test.ts` (grep shows no existing file — CC creates in F-A-012.b).

### Chain-walk cap tests

1. Verify request on short chain (<50): returns full chain, `truncated: false` (or absent).
2. Verify request on exactly-50-hop chain: returns all 50 hops, `truncated: false`.
3. Verify request on >50-hop chain: returns first 50 hops, `truncated: true`, `truncated_reason: "max_depth_reached (N=50)"`.
4. User-supplied `?depth=N` clamped at 50 (request `?depth=100` gets `max_depth: 50`).
5. `?depth=20` (below default): respects explicit user value.

### Rate limit tests

6. First request from IP: 200, headers include `X-RateLimit-Remaining: 9`.
7. 10th request within 60s window: 200, remaining: 0.
8. 11th request: 429 with `retry_after_seconds` in body and `Retry-After` header.
9. Different IP while first IP limited: 200 (IP isolation).
10. After window reset: request succeeds again.

### Existing behaviour regression

11. Verify on transaction with broken chain: still reports `broken_links: N`, `first_broken_link_id`.
12. Verify on non-existent transaction: still 404.
13. Verify on transaction without `integrity_hash`: still returns `verified: false` + reason.

HTTP-level testing requires the same DB mock pattern used in `transactions.test.ts` and `health-deep.test.ts`. Tests 1-3 and 6-10 are the critical F-A-012 coverage; 4-5 are bonus; 11-13 are regression.

---

## Upstream / Downstream / Sibling / External

### Upstream

- **No SDK caller of `/v1/verify/:id`.** Grep `packages/sdk-typescript/src/` for "verify" returns no hits. No SDK method wraps this endpoint today. Type changes only affect OpenAPI documentation.
- **Frontend callers**: not audited, but F-A-005.a grep found no frontend reference to the verify response shape. Adding `truncated` is additive.
- **External docs**: `audit-reports/audit-trail-ground-truth.md` references the shareable_url and audit endpoints, not the verify endpoint specifically. No doc edit required.

### Downstream

- `/v1/transactions/:id/verify` (authed sibling): unchanged. Already capped at 10 hops; no mitigation needed.
- `/v1/audit/:id?token=`: unchanged. Different vector class.

### Siblings

- `transaction_quality`, wallet endpoints, admin endpoints: unaffected.

### External (Rule 4)

- No distribution surface references the verify response shape verbatim. Rule 4 N/A.
- OpenAPI gets the additive `truncated` field documentation.

---

# PLAN — F-A-012.b

## Plan section 1 — Chain-walk cap + truncation marker

**File:** `apps/api/src/routes/verify.ts`

**Changes:**

1. Change module-level constants (L15-16):
   ```ts
   const MAX_DEPTH = 50;     // was 200
   const DEFAULT_DEPTH = 20; // was 50
   ```

2. Update `ChainWalkResult` interface (L116-123) to include truncation state:
   ```ts
   interface ChainWalkResult {
     length: number;
     verifiedLinks: number;
     brokenLinks: number;
     reachesGenesis: boolean;
     startDate: string | null;
     firstBrokenLinkId: string | null;
     truncated: boolean;              // NEW
     truncatedReason: string | null;  // NEW
   }
   ```

3. Update `walkChain()` loop (L138-189) to set `truncated: true` when the loop exits due to the depth cap (vs. reaching genesis or hitting a broken link). The current loop exits via:
   - `break` on genesis-match (L142) → truncated: false
   - `break` on `!prev` (L152) → truncated: false (walker ran off the end — either broken chain or legitimate chain start)
   - `while (length < maxDepth)` exhaustion → truncated: true

4. Update response builder (L87-111) to surface `chain.truncated` and `chain.truncated_reason`:
   ```ts
   chain: {
     ...
     truncated: chain.truncated,
     truncated_reason: chain.truncated ? `max_depth_reached (N=${maxDepth})` : null,
   },
   ```

**Impact:** ~15 lines added/changed in a single file.

---

## Plan section 2 — Rate limit wiring

**File:** `apps/api/src/routes/verify.ts`

**Change:** one line at L21:
```ts
verifyRoute.use("*", rateLimitByIp(10, 60_000)); // was rateLimitByIp(30, 60_000)
```

**No new helper needed.** `rateLimitByIp` already exists and handles all the plumbing (IP extraction, spoofing-guard, 429 response, `Retry-After` header).

**Impact:** 1 line changed.

---

## Plan section 3 — SDK + OpenAPI updates

### OpenAPI (`apps/api/src/openapi.ts:616`)

Update `/v1/verify/{transactionId}` GET:
1. Document the new `truncated` and `truncated_reason` fields in the `chain` object schema.
2. Document the new 429 response shape (the existing spec may or may not mention it; verify during implementation and add if absent).

**Impact:** ~5 lines added.

### TypeScript SDK

**No change.** SDK does not expose `/v1/verify/:id`. If the SDK ever gains a `verify()` method, the response type gains `truncated` / `truncated_reason` then.

### Python SDK

N/A — defer to standing ticket.

---

## Plan section 4 — Tests

Create `apps/api/src/routes/verify.test.ts` extending the DB-mock pattern from `transactions.test.ts`:

- Test 3 from Sub-report H (>50 hop chain → truncated): core F-A-012 coverage. Requires a mock walker returning >50 hops.
- Test 8 from Sub-report H (11th request → 429): core rate-limit coverage. Requires 11 sequential `app.request()` calls with a forged `x-forwarded-for` header.
- Tests 1-2, 4-5, 9-13: high-value extensions if session scope allows.

**Practical minimum**: 2-3 tests (truncation + rate limit 429 + basic smoke).

**Impact:** ~80 lines new test file.

---

## Plan section 5 — Commit split proposal

**Recommendation: single commit.** ~25 lines of handler/walker code + ~5 lines OpenAPI + ~80 lines tests = ~110 lines across 3 files. Logically one unit.

No new rate-limit helper. No new SDK type. No migration. No multi-stage rollout required.

**Commit message:** `fix: tighten verify endpoint rate limit and chain-walk cap (F-A-012)`

---

## Plan section 6 — Open questions for chat

### OQ #1 — N (max chain-walk depth): 50?

CC's recommendation is 50 (matches finding direction (d), covers median + 2× headroom). Alternatives: 100 (2× memory cost, marginal benefit), 200 (current, no improvement), 20 (matches current default, no headroom for opt-in deeper walks).

**Recommendation: 50.**

### OQ #2 — Default depth: 20?

Matches finding direction (d). Alternatives: 50 (current), or = MAX (50). Defaulting to max means callers who don't specify `?depth=` get the maximum allowed cost — slightly lazier security posture than a sub-max default.

**Recommendation: 20.**

### OQ #3 — Rate limit: 10/min per IP?

Matches finding direction (c). Alternative: 20/min per IP (more permissive, 2× human-use headroom). CC's read of the F-A-012 threat model favors the tighter limit.

**Recommendation: 10/min.**

### OQ #4 — `/v1/transactions/:id/verify` sibling inclusion?

Not in F-A-012 scope per audit. Already bounded at 10 hops. No tightening proposed.

**Recommendation: leave alone.** Flag only to confirm chat agrees.

### OQ #5 — Caching?

Finding's direction (b). Adds a cache tier to reason about; invalidation is trivial (hashes are immutable) but the memory footprint grows with traffic. F-A-012.b gets most of the DoS mitigation without it.

**Recommendation: defer.** Revisit in Session 5 if verify traffic grows.

### OQ #6 — Request timeout?

Not proposed. N-cap bounds wall-clock; Railway health probe catches stuck handlers.

**Recommendation: none.** Flag only.

### OQ #7 — `truncated_reason` string shape?

CC proposes: `"max_depth_reached (N=50)"` (human-readable, N parameterized for future changes). Alternative: structured code like `"MAX_DEPTH_REACHED"` (easier for client parsers). String is already displayed in the UI by convention; CC picks the readable form.

**Recommendation: human-readable string.**

---

## Verification checklist

- [x] F-A-012 extracted verbatim (Sub-report A)
- [x] Sub-reports A-H populated with file:line references and real prod data
- [x] 6 plan sections produced (+ open questions)
- [x] Open questions populated (7 items)
- [x] Report written to `audit-reports/F_A_012_a_audit.md`, untracked
- [x] No files modified in `apps/api/src/`
- [x] `git status` shows the report file + pre-existing root-level dirty state

---

*End of F-A-012.a audit. Ready for chat review before F-A-012.b implementation. This is the last of the F-A series; F-A-011 folds into SCF-2 for Session 5.*
