# F-A-006 + F-A-007.a — HMAC audit URL token lifecycle audit (bounded expiry + two-key rotation)

**Date:** 2026-04-20
**HEAD:** `a253d9194d66f99e4d4cccb94d7d60dd467c8000` (`main`)
**Working tree inside `apps/api/src/`:** clean
**Scope:** read-only audit. No code modified. No commits.
**Findings source:** `SESSION_A_audit_findings.md` at repo root, tracked at commit `5927bfb`.
**Pre-decided design:** 90-day expiry default; two-key ring (`AUDIT_HMAC_SECRET` + `AUDIT_HMAC_SECRET_PREVIOUS`); 60-day grace window; auth-gated re-issue endpoint.

## Tripwire check

| Tripwire | State |
|---|---|
| Working tree clean inside `apps/api/src/` | ✓ |
| HEAD at `a253d91` or later | At `a253d91` ✓ |
| Branch is `main` | ✓ |
| `SESSION_A_audit_findings.md` locatable + F-A-006/007 present | ✓ (L117-139) |
| No interval commits touching `audit-token.ts`, `audit.ts`, `do.ts` audit URL path, `transactions.ts` | ✓ (zero commits since `a253d91`) |

**Plan-invalidating findings:** none. The module is small (49 lines), the caller inventory is tiny (2 sites), and the re-issue endpoint path is free. Clean implementation surface.

**CC's alternative view on defaults (non-blocking):** the pre-decided 90-day expiry is longer than the finding's illustrative "30 days." 90 days matches industry norms for compliance-artifact URLs (Stripe receipts, AWS S3 presigned URLs typically ≤7 days but compliance docs often run 30-90). CC has no reservations about 90. Flagged in OQ #1 only because the spec asked.

---

## Sub-report A — F-A-006 verbatim extract

From `SESSION_A_audit_findings.md` L117-127:

> ### F-A-006: Audit HMAC tokens never expire
>
> - **Category**: Safety
> - **Severity**: Low
> - **Confidence**: High
> - **Location**: [apps/api/src/lib/audit-token.ts:21-26](apps/api/src/lib/audit-token.ts#L21-L26)
> - **What's wrong**: `generateAuditToken(txnId) = HMAC-SHA256(AUDIT_SECRET, txnId).slice(0,32)`. The HMAC takes only the transaction ID — no timestamp, no expiry nonce. Tokens are valid forever. A shared audit URL grants access for the lifetime of the transaction row (3 years) with no revocation path short of rotating the secret (see F-A-007).
> - **Why it matters**: Leaked audit URLs can't be revoked individually. A user who sharing-slipped a token into a public channel has no recovery. For compliance-sensitive audits this is a non-trivial blast radius.
> - **Reproduction / evidence**: Read `generateAuditToken`. No time component. `verifyAuditToken` takes only `transactionId` and `token` — no freshness check.
> - **Suggested direction**: Embed an issued-at or expiry timestamp in the token (e.g. `HMAC(AUDIT_SECRET, txnId + ":" + expiresAt)`, with `expiresAt` as part of the query string). Shareable URLs then have bounded lifetime (e.g. 30 days, re-signable on request). Trade-off: URL becomes less stable; past URLs decay. Some systems prefer stable URLs for compliance archives — survey what stakeholders need before committing to a shape.
> - **Related findings**: F-A-007.

**Delta from pre-decided defaults:** the finding suggests 30 days illustratively; chat pre-decided 90. Difference is a product decision, not a code decision. Plan section 1 uses 90 as default with a parameterizable override.

Current state verified: `audit-token.ts:21-26` unchanged, signs only `transactionId`.

---

## Sub-report B — F-A-007 verbatim extract

From `SESSION_A_audit_findings.md` L129-139:

> ### F-A-007: `AUDIT_HMAC_SECRET` rotation invalidates every previously-issued audit URL
>
> - **Category**: Resilience
> - **Severity**: Low
> - **Confidence**: High
> - **Location**: [apps/api/src/lib/audit-token.ts:19](apps/api/src/lib/audit-token.ts#L19), [apps/api/src/lib/audit-token.ts:28-43](apps/api/src/lib/audit-token.ts#L28-L43)
> - **What's wrong**: `verifyAuditToken` regenerates an expected token from the current `AUDIT_SECRET` and compares constant-time. Rotating the secret changes every token's expected value — every URL previously given to a customer / regulator for verification now 401s. No two-secret rollover path exists.
> - **Why it matters**: Secret rotation is a standard operational hygiene practice (and a regulatory expectation under several frameworks). Today, rotating the secret breaks every shared audit URL in every external record. Practically this means the secret cannot be rotated without coordinating with every past audit recipient.
> - **Reproduction / evidence**: Read the module; there's a single `AUDIT_SECRET` constant (line 19). No fallback to a prior secret in verification.
> - **Suggested direction**: Support a primary + prior secret pair. `generateAuditToken` always signs with the primary; `verifyAuditToken` tries the primary first, falls back to the prior (for a grace window — a month or two). Env vars: `AUDIT_HMAC_SECRET` (current) + `AUDIT_HMAC_SECRET_PREVIOUS` (optional). After the grace window the prior is removed. Standard key-rollover pattern.
> - **Related findings**: F-A-006.

**No delta from pre-decided spec.** The finding's suggested direction matches the working spec exactly: primary + optional previous, "a month or two" grace window (we chose 60 days).

Current state verified: `audit-token.ts:19` loads a single `AUDIT_SECRET` via `requireAuditSecret()`. No fallback.

---

## Sub-report C — Current HMAC token shape and lifecycle

**File:** `apps/api/src/lib/audit-token.ts` (49 lines total).

### Functions

**`requireAuditSecret(env: string | undefined): string`** (L10-18)
- Validates `env` is non-empty and ≥32 chars.
- Throws with explicit error if missing — F-0-001 hardening.
- Exported for direct test coverage.

**Module-level constant (L19):**
```ts
const AUDIT_SECRET: string = requireAuditSecret(process.env.AUDIT_HMAC_SECRET);
```
Loaded eagerly at module init. Fails fast on module load if env var absent/short.

**`generateAuditToken(transactionId: string): string`** (L21-26)
```ts
createHmac("sha256", AUDIT_SECRET)
  .update(transactionId)
  .digest("hex")
  .substring(0, 32);
```
Returns 32 hex chars (128 bits of entropy after truncation from SHA-256's full 256).

**`verifyAuditToken(transactionId: string, token: string): boolean`** (L28-43)
- Regenerates expected token via `generateAuditToken(transactionId)`.
- Constant-time compare via `timingSafeEqual`, length-guarded first (F-0-001).
- Returns `false` on any parse or length error.

**`getShareableUrl(transactionId: string): string`** (L45-48)
```ts
return `https://strale.dev/audit/${transactionId}?token=${token}`;
```

### Algorithm, encoding, transport

| Property | Value |
|---|---|
| HMAC algorithm | SHA-256 |
| Encoding | lowercase hex (via `.digest("hex")`) |
| Truncation | first 32 chars (128 bits) |
| URL transport | `?token=<hex>` query param |
| URL base | `https://strale.dev/audit/{txnId}` |
| Timestamp handling | **none** (F-A-006 gap) |
| Key fallback | **none** (F-A-007 gap) |

### Secret source

- `process.env.AUDIT_HMAC_SECRET` — required, ≥32 chars.
- No fallback default (F-0-001 removed the hardcoded `"strale-audit-default-secret"`).
- `.env` has a real value; `.env.example` has it as an empty key to document the requirement.
- Railway config documents it at `apps/api/railway-config.md` (listed under "Required env vars" but no tooling enforces Railway has it set).

---

## Sub-report D — Caller inventory

### Production code callers

| Caller | File:Line | Context | Token fate |
|---|---|---|---|
| `generateAuditToken` | `audit-token.ts:22-26` (def); `audit-token.ts:29` (self-call in verify); `audit-token.ts:46` (in getShareableUrl) | module-internal | n/a |
| `verifyAuditToken` | **`routes/audit.ts:175`** | `GET /v1/audit/:transactionId?token=` — verifies the `?token=` query param | returns 401 on fail |
| `getShareableUrl` | **`routes/do.ts:2190`** | `buildFullAudit()` inside POST /v1/do response — constructs the `compliance.shareable_url` field returned to every successful caller | surfaced in response body |

**Only 2 external call sites.** Surface area for F-A-006/007.b is narrow.

### Test callers

| Caller | File:Line |
|---|---|
| `audit-token.test.ts` | existing test coverage for F-0-001 (length enforcement, timing-safe compare, tamper detection) |
| `reindex-transactions.test.ts:18`, `transactions.test.ts:73`, `internal-auth.test.ts:42`, `health-deep.test.ts:43` | set `AUDIT_HMAC_SECRET` in `beforeAll` so app.ts loading doesn't throw |

Test updates for F-A-006/007.b extend `audit-token.test.ts` and don't affect the others (they just need the env var set — which they do).

### Docs / config surfaces

| Surface | Current state |
|---|---|
| `.env` (not committed) | has `AUDIT_HMAC_SECRET=<value>` |
| `.env.example` | has `AUDIT_HMAC_SECRET=` (empty) — F-A-006/007.b adds `AUDIT_HMAC_SECRET_PREVIOUS=` as empty |
| `apps/api/railway-config.md` | lists `AUDIT_HMAC_SECRET` under Required. Add `AUDIT_HMAC_SECRET_PREVIOUS` under Optional/Rotation |
| `FIX_PHASE_A_verification.md` | historical F-0-001 post-mortem — no edit needed |
| `audit-reports/audit-trail-ground-truth.md:88` | describes current token format — add a note about expiry post-F-A-006/007.b |

---

## Sub-report E — Proposed token payload shape (F-A-006)

### CC's analysis of the two encoding options

**Option 1 — self-contained dot-separated triple:**
```
token = base64url(HMAC_SHA256(SECRET, `${txnId}:${expiresAt}`))
url   = https://strale.dev/audit/{txnId}?token={expiresAt}.{hmac_base64url}
```

**Option 2 — separate query params:**
```
hmac = HMAC_SHA256(SECRET, `${txnId}:${expiresAt}`)
url  = https://strale.dev/audit/{txnId}?token={hmac_hex}&expires_at={expiresAt}
```

### CC's recommendation: **Option 2 (separate query params).**

Rationale:
- **Consistency with current shape.** Today's URL is `?token=<hex>`. Option 2 adds a sibling `&expires_at=<int>` and keeps `token` as a single string. Option 1 changes what `token` *means* (from "the hmac" to "expiry and hmac concatenated").
- **Simpler to parse.** `new URL(href)` gives `searchParams.get("token")` + `searchParams.get("expires_at")` directly. No dot-parsing logic.
- **Tampering risk is trivially detected.** Verification re-signs with the claimed `expires_at` and checks against the HMAC. A client modifying `expires_at` to extend the window causes HMAC mismatch → 401. Same security property as Option 1.
- **Backwards compatibility cleaner.** Legacy URLs with just `?token=<hex>` and no `?expires_at=` are trivially distinguishable from new URLs. See Sub-report H Option B.

### Proposed shape

```
GET https://strale.dev/audit/{txnId}?token={hmac_hex}&expires_at={unix_seconds}
```

Where:
- `hmac_hex` = first 32 chars of `HMAC-SHA256(SECRET, `${txnId}:${expiresAt}`).digest("hex")`
- `expiresAt` = unix seconds (integer). Issued-at not included — only expiry is needed for enforcement.

### Verification algorithm

```ts
function verifyAuditToken(transactionId: string, token: string, expiresAt: number | null): VerifyResult {
  // Legacy token (no expiry param) handled via Sub-report H backwards-compat path.
  if (expiresAt == null) return verifyLegacyToken(transactionId, token);

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt < nowSeconds) {
    return { valid: false, reason: "expired" };
  }

  const payload = `${transactionId}:${expiresAt}`;

  // Primary key
  if (hmacCompare(token, sign(payload, AUDIT_SECRET))) {
    return { valid: true };
  }

  // Previous key (F-A-007 rotation fallback)
  if (AUDIT_SECRET_PREVIOUS && hmacCompare(token, sign(payload, AUDIT_SECRET_PREVIOUS))) {
    return { valid: true, usedFallback: true };
  }

  return { valid: false, reason: "invalid_signature" };
}
```

### HTTP status on verification outcomes

| Outcome | Status | Error code |
|---|---|---|
| Valid (primary or fallback key) | 200 | — |
| Missing `token` query param | 401 | `unauthorized` (current behaviour) |
| `expires_at` missing AND token not in legacy format | 400 | `invalid_request` |
| Expired (`expires_at < now`) | **410 Gone** | `token_expired` (new error code) |
| HMAC mismatch | 401 | `unauthorized` (current behaviour) |

**Why 410 Gone for expiry:** semantically accurate — "this resource was available; you're too late." 401 would invite retry-with-new-credentials which doesn't apply (the client has no way to refresh the token without hitting the re-issue endpoint first). 410 signals "this URL is permanently invalid" so clients know to escalate to re-issue. CC recommends 410; flagged as OQ #3 because this is a product-visible decision.

---

## Sub-report F — Proposed key rotation mechanism (F-A-007)

### Module-level loading

```ts
// Primary: required, signs all new tokens
const AUDIT_SECRET: string = requireAuditSecret(process.env.AUDIT_HMAC_SECRET);

// Previous: optional, verification-only. Empty string or unset = no fallback.
// Minimum length check still applies if set (prevents accidental short-key bug).
const AUDIT_SECRET_PREVIOUS: string | null = (() => {
  const raw = process.env.AUDIT_HMAC_SECRET_PREVIOUS;
  if (!raw) return null;
  if (raw.length < 32) {
    throw new Error(
      "AUDIT_HMAC_SECRET_PREVIOUS, when set, must be at least 32 characters. " +
      "Unset the env var to disable the fallback path.",
    );
  }
  return raw;
})();
```

### Rotation procedure (for operational runbook)

1. **Prep**: generate new secret via `openssl rand -hex 32`.
2. **Set previous to current**: Railway env var `AUDIT_HMAC_SECRET_PREVIOUS = <current AUDIT_HMAC_SECRET value>`.
3. **Set primary to new**: Railway env var `AUDIT_HMAC_SECRET = <new value>`.
4. **Redeploy.** All new tokens sign with the new secret. All tokens previously signed with the old secret now verify via the fallback path.
5. **Monitor**: track `usedFallback: true` verifications for 60 days to confirm legitimate tokens continue working.
6. **Sunset old key** (day 60): unset `AUDIT_HMAC_SECRET_PREVIOUS`. Redeploy. Tokens issued before step 2 that customers still hold now fail → they re-issue via the new endpoint (Sub-report G).

### Verification code

Per Sub-report E, with the two-key try: primary first, previous on miss.

**Timing-attack consideration:** when both keys are tried, attacker observes marginally longer verification on invalid tokens (two HMAC ops instead of one). Acceptable — both ops run regardless of the first result's value via dummy computation if strictness is needed. Current code does not implement dummy ops; F-A-006/007.b may skip this nuance unless chat asks.

---

## Sub-report G — Re-issue endpoint design

### Route

**`POST /v1/transactions/:id/audit-token`**

- **Path conflict check**: confirmed no existing route on `transactionsRoute` uses `/:id/audit-token`. Current routes: `GET /`, `GET /:id`, `GET /:id/verify`, `DELETE /:id`.

### Auth

- `authMiddleware` (not `optionalAuthMiddleware` — this mutates state by minting a token, requires real identity).
- Ownership check: the transaction's `user_id` must equal `user.id`. 404 on any miss (same no-existence-leak pattern as SA.2a.2a).

### Request

```
POST /v1/transactions/{id}/audit-token
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "expires_in_days": 90  // optional, default 90, max 365
}
```

### Response

```json
{
  "transaction_id": "<uuid>",
  "token": "<hmac_hex>",
  "expires_at": 1234567890,
  "expires_at_iso": "2026-07-19T00:00:00Z",
  "audit_url": "https://strale.dev/audit/<uuid>?token=<hmac_hex>&expires_at=1234567890"
}
```

### Edge cases

| Case | Behaviour |
|---|---|
| Free-tier transaction (`user_id IS NULL`) | 404 `not_found` — cannot re-issue without ownership. Free-tier users would need to authenticate first. |
| Legal-hold transaction (`legal_hold = true`) | **Allowed.** Legal hold affects deletion; token issuance is orthogonal. Ship without special-casing. |
| Deleted transaction (`deleted_at IS NOT NULL`) | 404 per SA.2a.2a A-filter pattern. Consistent with `GET /v1/transactions/:id` authed. |
| `expires_in_days > max` (CC suggests 365) | 400 `invalid_request` with bounds in message. |
| `expires_in_days <= 0` | 400 `invalid_request` ("must be positive"). |
| Non-number `expires_in_days` | 400 `invalid_request` ("must be an integer"). |

### Rate limit

`rateLimitByKey(5, 1000)` — same 5/sec mutation budget as SA.2a's DELETE, consistent with DEC-21.

---

## Sub-report H — Backwards compatibility

### The problem

Currently issued tokens look like `?token=<hex>`. Post-F-A-006/007.b tokens look like `?token=<hex>&expires_at=<int>`. Both coexist on day 1 of deploy.

### CC's recommendation: **Option B (grace window with sunset).**

**Implementation:**
- Verification splits on presence of `expires_at` query param:
  - Present → new-format path (Sub-report E algorithm)
  - Absent → legacy path: regenerate the old `HMAC(SECRET, txnId)` and compare constant-time (current algorithm, moved to `verifyLegacyToken`). Accept as valid if sunset date not reached.
- `LEGACY_TOKEN_SUNSET_DATE` — hardcoded constant (or env-var override): 180 days after F-A-006/007.b deploy. After this, legacy tokens fail with `410 Gone` / `legacy_token_sunset`.
- Sunset date is announced in release notes, in the SDK type doc-comment, and in the response for a rejected legacy token.

**Why 180 days:** 2× the standard 90-day expiry gives stakeholders a full normal lifecycle to migrate. Shorter would be more aggressive (good for security) but hostile to customers who embedded URLs in compliance archives.

**Why not Option A (hard break):** hostile to existing customers; violates the "compliance archive" use case mentioned in F-A-006's "Trade-off" paragraph.

**Why not Option C (permanent dual path):** makes F-A-006 permanently half-fixed for pre-existing tokens. Any token issued pre-deploy would remain unexpired forever, even post-rotation. Violates the spirit of the finding.

### Legacy verification code (Option B)

```ts
function verifyLegacyToken(transactionId: string, token: string): VerifyResult {
  if (Date.now() >= LEGACY_TOKEN_SUNSET_MS) {
    return { valid: false, reason: "legacy_token_sunset" };
  }

  // Old algorithm: HMAC(SECRET, txnId) -> 32 hex chars
  const expected = createHmac("sha256", AUDIT_SECRET).update(transactionId).digest("hex").substring(0, 32);
  // Try primary, then fallback (also applies to legacy tokens during the sunset window)
  if (hmacCompareHex(token, expected)) return { valid: true, legacy: true };

  if (AUDIT_SECRET_PREVIOUS) {
    const expectedPrev = createHmac("sha256", AUDIT_SECRET_PREVIOUS).update(transactionId).digest("hex").substring(0, 32);
    if (hmacCompareHex(token, expectedPrev)) return { valid: true, legacy: true, usedFallback: true };
  }

  return { valid: false, reason: "invalid_signature" };
}
```

Structured log on every legacy hit so operators can track migration progress.

---

## Sub-report I — Tests required

### For F-A-006 (expiry)

1. **Valid new-format token** (future `expires_at`): `verifyAuditToken` returns `{valid: true}`.
2. **Expired token** (past `expires_at`): returns `{valid: false, reason: "expired"}`.
3. **Tampered `expires_at`** (client extended the timestamp): HMAC mismatch → `{valid: false, reason: "invalid_signature"}`.
4. **Token missing expiry but valid under legacy shape**: returns `{valid: true, legacy: true}` if before sunset.
5. **Legacy token after sunset**: `{valid: false, reason: "legacy_token_sunset"}`.
6. **Malformed token** (bad hex, wrong length): returns `{valid: false, reason: "invalid_signature"}` without throwing.

### For F-A-007 (rotation)

7. **Token signed with primary secret**: verifies via primary path.
8. **Token signed with previous secret while primary is different**: verifies via fallback path, returns `usedFallback: true`.
9. **Token signed with neither**: rejected.
10. **`AUDIT_HMAC_SECRET_PREVIOUS` unset**: only primary path tried; no crash; rejected tokens return `invalid_signature` not any "missing fallback" error.
11. **`AUDIT_HMAC_SECRET_PREVIOUS` set but < 32 chars**: module load throws (consistent with primary's validation).

### For re-issue endpoint

12. **Authed user re-issues own transaction**: 200 with new token + expiry.
13. **Authed user re-issues another user's transaction**: 404 (not 403 — no-existence-leak pattern).
14. **Unauth call**: 401.
15. **Non-existent transaction**: 404.
16. **Deleted transaction**: 404.
17. **Free-tier transaction (`user_id IS NULL`)**: 404 (ownership check fails naturally).
18. **`expires_in_days` at/above max (365)**: re-issue at max allowed; 366 → 400.
19. **`expires_in_days <= 0` or non-integer**: 400.
20. **Token returned by re-issue verifies via `verifyAuditToken`** (round-trip check).

Total: 20 tests. Some may combine via parameterized runs.

---

# PLAN — F-A-006/007.b

## Plan section 1 — Token payload + signing (F-A-006)

**File:** `apps/api/src/lib/audit-token.ts`

**Changes:**
- Add `const DEFAULT_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;` and `const LEGACY_TOKEN_SUNSET_MS = <deploy_date + 180 days>;` as module-level constants.
- Refactor `generateAuditToken` to accept optional `expiresInSeconds` parameter:
  ```ts
  export function generateAuditToken(transactionId: string, expiresInSeconds = DEFAULT_TOKEN_TTL_SECONDS): { token: string; expiresAt: number } {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${transactionId}:${expiresAt}`;
    const token = createHmac("sha256", AUDIT_SECRET).update(payload).digest("hex").substring(0, 32);
    return { token, expiresAt };
  }
  ```
- Return shape is now `{token, expiresAt}` — callers (only `getShareableUrl` and tests) update to consume both.

**Impact:** ~20 lines added.

---

## Plan section 2 — Verification + key rotation (F-A-007)

**File:** `apps/api/src/lib/audit-token.ts`

**Changes:**
- Load `AUDIT_SECRET_PREVIOUS` at module scope (per Sub-report F code).
- Rewrite `verifyAuditToken` signature to accept expiry:
  ```ts
  export function verifyAuditToken(
    transactionId: string,
    token: string,
    expiresAt: number | null,
  ): VerifyResult {
    // Legacy path if no expiry provided (Sub-report H)
    if (expiresAt == null) return verifyLegacyToken(transactionId, token);
    // New-format path (Sub-report E)
    ...
  }
  ```
- Add `verifyLegacyToken` (private).
- Add helper `hmacCompareHex(token: string, expected: string): boolean` consolidating the existing length-guarded `timingSafeEqual` logic.

**Impact:** ~40 lines added.

**Caller update:** `routes/audit.ts:175` now extracts both `token` and `expires_at` query params and passes both. Return `410 Gone` with `token_expired` error code for expiry; `401` for other verification failures.

---

## Plan section 3 — Re-issue endpoint

**File:** `apps/api/src/routes/transactions.ts`

Add handler for `POST /:id/audit-token` per Sub-report G design. ~40 lines including validation, ownership check, deleted/legal-hold path, response construction.

Imports needed:
- `generateAuditToken` from `lib/audit-token.js`
- Existing middleware (`authMiddleware`, `rateLimitByKey`).

---

## Plan section 4 — Env config + docs

**Files to edit:**
1. `.env.example` — add `AUDIT_HMAC_SECRET_PREVIOUS=` with comment explaining rotation.
2. `apps/api/railway-config.md` — document `AUDIT_HMAC_SECRET_PREVIOUS` under "Optional / Rotation" section.
3. **New file: `docs/operations/hmac-rotation.md`** — runbook with the 6-step rotation procedure from Sub-report F. ~30 lines.
4. `audit-reports/audit-trail-ground-truth.md:88` — update token-format description (or add a footnote referencing F-A-006/007.b).

---

## Plan section 5 — Backwards compatibility + sunset

Per Sub-report H Option B:

- Module-level `LEGACY_TOKEN_SUNSET_MS` constant. Value: `new Date("2026-10-20").getTime()` (180 days from today, 2026-04-20).
- `verifyLegacyToken` rejects after sunset.
- Structured log (`label: audit-token-legacy-used`) on every legacy hit for operational tracking.

---

## Plan section 6 — SDK + OpenAPI updates

**OpenAPI (`apps/api/src/openapi.ts`):**
- Update `/v1/audit/{transactionId}` GET: document `expires_at` query param (required on new format, optional for legacy compatibility window).
- Add new `/v1/transactions/{id}/audit-token` POST: full spec per Sub-report G.
- Update `/v1/do` POST response schema: `compliance.shareable_url` description notes expiry; `compliance.expires_at` new field (unix seconds).

**TypeScript SDK (`packages/sdk-typescript/src/types.ts`):**
- If `TransactionDoResponse` includes a `compliance` block typed anywhere, add `expires_at: number` and update `shareable_url` doc comment.
- Add new `AuditTokenReissueResponse` interface matching Sub-report G response shape.
- Add `client.reissueAuditToken(transactionId, opts?)` method to the SDK client.

**Python SDK:** defer to standing sync ticket `34867c87-082c-814f-9bc4-e05a04433e4c`.

---

## Plan section 7 — Commit split proposal

**CC's recommendation: 2 commits.**

- **C1 — Core token lifecycle + rotation + env docs** (F-A-006 + F-A-007 combined)
  - Files: `audit-token.ts`, `audit-token.test.ts`, `routes/audit.ts`, `routes/do.ts`, `.env.example`, `railway-config.md`, `docs/operations/hmac-rotation.md`
  - Scope: new token format, verification with fallback key, legacy path with sunset, caller updates, env docs
  - ~200 lines across 7 files
  - **Self-contained and deployable.** After C1 deploys, new tokens carry expiry, rotation mechanism is live, legacy tokens still work during sunset window. Nothing user-visible to break.
- **C2 — Re-issue endpoint + SDK + OpenAPI**
  - Files: `routes/transactions.ts`, `routes/transactions.test.ts`, `openapi.ts`, `packages/sdk-typescript/src/types.ts` + `client.ts`
  - Scope: new POST endpoint, tests, SDK surface, spec
  - ~100 lines across 5 files
  - **Depends on C1** being deployed (uses the new `generateAuditToken` return shape).

**Why not 3 commits (C1 token, C2 rotation, C3 reissue):**
- Splitting F-A-006 from F-A-007 is awkward because verification changes touch both — two commits to `audit-token.ts` back-to-back.
- Rollback semantics are identical: either fix is revertable independently via `git revert <sha>`.

**Why not 1 commit:** the re-issue endpoint (new handler + SDK + OpenAPI) is a distinct user-visible feature. Separating it lets chat revert "just the endpoint" if something in the feature design needs revisiting, without touching the underlying token lifecycle.

---

## Plan section 8 — Open questions for chat

### OQ #1 — 90-day default expiry?

The finding suggests 30 days illustratively. Chat pre-decided 90.
- **90 days (pre-decided):** matches compliance-archive norms; lower ops churn.
- **30 days (finding suggestion):** tighter security; more re-issues.
- **60 days (middle ground):** compromise.

**Recommendation: 90 days.** Matches the working spec. Flag only to confirm chat is aware of the delta from the finding.

### OQ #2 — Token encoding: separate query params vs dot-separated triple?

**Recommendation: separate query params** (Sub-report E). Cleaner parsing, trivial backwards-compat distinction, no URL-schema break.

### OQ #3 — HTTP status on expired token: 410 Gone vs 401 Unauthorized?

**Recommendation: 410 Gone** with `token_expired` error code. Semantically correct; signals to clients that re-issue (not retry-with-new-credentials) is the right next action.

### OQ #4 — Backwards compat: Option A (hard break) / B (grace window) / C (permanent dual)?

**Recommendation: Option B** with 180-day sunset. Balances compliance-archive continuity with F-A-006's security intent.

### OQ #5 — Legacy token sunset duration: 30 / 90 / 180 days?

**Recommendation: 180 days.** 2× the new-token default expiry. Flag as OQ because sunset is a product-visible compliance decision.

### OQ #6 — Re-issue endpoint: should old tokens be invalidated when a new one is issued?

No. Tokens are independent per-issuance artifacts; each is valid until its own `expires_at`. Invalidating "the previous" would require storing issued tokens server-side (currently they're stateless HMACs), which is a much larger change.

**Recommendation: do not invalidate.** Issue new, leave old alone. Document this behaviour in the SDK type comment.

### OQ #7 — Max `expires_in_days` on re-issue: 365?

**Recommendation: 365.** Same order of magnitude as compliance record-of-processing retention. Flag for confirmation.

### OQ #8 — Should `AUDIT_HMAC_SECRET_PREVIOUS` setup throw on short key?

Sub-report F proposes: empty/missing = fine; < 32 chars = throw. Reasoning: accidentally setting a short previous key (e.g. by copy-paste truncation) should fail loud, not silently break fallback. Alternative: warn but don't throw.

**Recommendation: throw.** Consistent with primary-key validation (F-0-001 lineage).

### OQ #9 — Timing-attack hardening on two-key verification?

Current proposal: try primary, on fail try previous. Dual-key lookup adds ~0.5ms to the negative path. Alternative: always compute both HMACs regardless of primary result.

**Recommendation: accept the minor timing difference.** The derived leak (attacker can distinguish "primary matched" from "primary missed + previous matched") has no practical attack surface. Hardening adds complexity for no real gain.

---

## Upstream / Downstream / Siblings / External

### Upstream

- **SDK callers** (`packages/sdk-typescript/src/client.ts`): no current caller of `generateAuditToken`. New `reissueAuditToken` method added by C2.
- **POST /v1/do response shape**: `compliance.shareable_url` now carries expiring token. Callers who embed this URL in their own records should note expiry.

### Downstream

- **`GET /v1/audit/:id?token=`** (HMAC-gated audit composition): verification logic updated. Errors shift: expired returns 410 (was 401).
- **`/v1/transactions/:id` (authed + unauth)**: unaffected. No HMAC.
- **`/v1/transactions/:id/verify`**: unaffected.

### Siblings

- `transaction_quality`: n/a.
- Verify chain walkers: n/a (different auth model).

### External (Rule 4)

- **`strale-frontend/public/llms.txt`**: mentions `"audit": { ... }` generically (line 48) but doesn't describe the `shareable_url` format. No edit needed.
- **Public docs at strale.dev**: if any render audit URLs in examples, they need expiry noted. Not audited; flag if Petter wants the docs-check extended. No verbatim references found in this repo.
- **`audit-reports/audit-trail-ground-truth.md:88`**: internal doc; updated in Plan section 4.
- **Beacon / external surfaces**: not audited; not expected to embed audit URLs.

---

## Verification checklist

- [x] F-A-006 and F-A-007 extracted verbatim (Sub-reports A, B)
- [x] Sub-reports C-I populated with file:line references
- [x] Eight plan sections produced
- [x] Nine open questions populated
- [x] Report written to `audit-reports/F_A_006_007_a_audit.md`, untracked
- [x] No files modified in `apps/api/src/`
- [x] `git status` shows the report file + pre-existing root-level dirty state

---

*End of F-A-006/007.a audit. Ready for chat review before F-A-006/007.b implementation.*
