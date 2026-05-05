# F-A-005.a — Free-tier transaction lookup PII leak audit (always-redact plan)

**Date:** 2026-04-20
**HEAD:** `73577ee73a2bd2ac38689278af4867630edb687f` (`main`)
**Working tree inside `apps/api/src/`:** clean
**Scope:** read-only audit. No code modified. No commits.
**Findings source:** `SESSION_A_audit_findings.md` at repo root, tracked at commit `5927bfb`.
**Pre-decided design path:** Option (a) — always-redact the unauth free-tier `GET /v1/transactions/:id` branch.

## Tripwire check

| Tripwire | State |
|---|---|
| Working tree clean inside `apps/api/src/` | ✓ |
| HEAD at `73577ee` or later | At `73577ee` ✓ |
| Branch is `main` | ✓ |
| `SESSION_A_audit_findings.md` locatable + F-A-005 present | ✓ (L105-115) |
| Unauth branch of `GET /v1/transactions/:id` exists | ✓ (L157-177) |
| No interval commits touching `routes/transactions.ts`, `routes/verify.ts`, `routes/audit.ts`, or auth middleware | ✓ (zero commits since `73577ee`) |

**Plan-invalidating findings:** none. The design path is clean and Option (a) is defensible.

**Alternative view from CC (non-blocking, flagged in Open Questions):** Option (a) is correct. Option (b) inherits the manifest-drift surface the team just spent SA.2b.b discovering (three drift classes across 15 sampled manifests). Option (c) adds shareable-token complexity and a URL-exposure risk that (a) sidesteps. CC recommends (a) without reservation — this OQ is included only because the spec asked.

---

## Sub-report A — F-A-005 verbatim extract

From `SESSION_A_audit_findings.md` L105-115:

> ### F-A-005: Free-tier transactions publicly retrievable by UUID leak input/output data
>
> - **Category**: Safety (privacy)
> - **Severity**: Low
> - **Confidence**: High
> - **Location**: [apps/api/src/routes/transactions.ts:156-177](apps/api/src/routes/transactions.ts#L156-L177)
> - **What's wrong**: `GET /v1/transactions/:id` is gated by `optionalAuthMiddleware`: authenticated users get their own transactions; unauthenticated users can fetch any `isFreeTier=true` transaction by UUID. The full row is returned, including `input` and `output`. For free-tier capabilities like email-validate (input = an email address), dns-lookup (input = a domain), iban-validate (input = an IBAN), anyone who learns the transaction UUID can retrieve the raw input. The UUID is unguessable, but it appears in audit URLs, logs, and response bodies — anywhere a user shared the audit link, the input is exposed.
> - **Why it matters**: The design is intentional (per comment at line 54-56: shareable audit trails for free-tier). But the public/private boundary sits on "UUID non-guessability" alone; whoever the UUID leaks to gets the input. IBAN in particular is non-trivial. Email is directly PII. If the UUID shows up in an error log or URL shortener cache, the data is reachable by anyone parsing that source.
> - **Reproduction / evidence**: `POST /v1/do { capability: "email-validate", input: { email: "alice@example.com" }}` without auth → get `transaction_id`. Then `GET /v1/transactions/<id>` from any IP without auth → full `input` and `output`. No token required.
> - **Suggested direction**: Either redact `input`/`output` on the unauthenticated free-tier lookup path (return metadata only), or require the same HMAC token that gates `/v1/audit/:id` on unauthenticated `/v1/transactions/:id` as well. Redaction is the safer default — free-tier audit still usable for compliance verification via the HMAC-gated `/v1/audit/:id` endpoint, but raw PII isn't distributed.
> - **Related findings**: F-A-006, F-A-007.

Current state verified today: the handler at `transactions.ts:157-177` still returns the full `formatRow()` shape for the unauth branch, including all 5 PII fields.

---

## Sub-report B — Current unauth response shape

### `GET /v1/transactions/:id` unauth branch — `transactions.ts:157-177`

Calls `formatRow(row)` (defined at L96-139). Response body fields:

| Field | Source | PII class | Redact in F-A-005.b? |
|---|---|---|---|
| `id` | `transactions.id` | non-PII (UUID) | keep |
| `type` | derived from `solution_slug` | non-PII | keep |
| `status` | `transactions.status` | non-PII enum | keep |
| `capability_slug` | `capabilities.slug` | non-PII (public) | keep |
| `solution_slug` | `transactions.solutionSlug` | non-PII (public slug) | keep |
| **`input`** | `transactions.input` | **PII** (user-submitted) | **REDACT** |
| **`output`** | `transactions.output` | **PII** (derived from input) | **REDACT** |
| **`error`** | `transactions.error` | **PII-adjacent** (may echo input/upstream) | **REDACT** |
| `price_cents` | `transactions.priceCents` | non-PII | keep |
| `latency_ms` | `transactions.latencyMs` | non-PII | keep |
| **`provenance`** | `transactions.provenance` | **PII-adjacent** (source URLs may embed input) | **REDACT** |
| **`audit_trail`** | `transactions.auditTrail` | **PII** (execution trace incl. request_context, ipHash, userAgent) | **REDACT** |
| `transparency_marker` | `transactions.transparencyMarker` | non-PII enum | keep |
| `data_jurisdiction` | `transactions.dataJurisdiction` | non-PII | keep |
| `is_free_tier` | `transactions.isFreeTier` | non-PII | keep |
| `created_at` | `transactions.createdAt` | non-PII timestamp | keep |
| `completed_at` | `transactions.completedAt` | non-PII timestamp | keep |
| `quality` | computed from `capabilities.matrixSqs`/`qpScore`/`rpScore`/`guidanceUsable`/`guidanceStrategy` | non-PII (operator metric) | keep |

**5 PII fields to redact** (`input`, `output`, `error`, `provenance`, `audit_trail`). **13 non-PII fields preserved.**

Fields NOT returned by the current handler (already excluded — not a concern for F-A-005):
- `idempotencyKey` (SA.2a PII-adjacent redaction target, but not in `selectFields`)
- `integrityHash`, `previousHash`, `complianceHashState`, `integrityHashStatus` (hash-chain internals, not in `selectFields`)
- `paymentMethod`, `x402SettlementId`, `priceUsd` (payment internals, not in `selectFields`)
- `deletedAt`, `redactedAt`, `deletionReason`, `legalHold` (deletion/hold metadata, not in `selectFields`)
- `userId`, `capabilityId` (FKs, not in `selectFields`)

### `GET /v1/transactions/:id/verify` unauth branch — `transactions.ts:183-239`

Uses the same `optionalAuthMiddleware` + same `isFreeTier=true` unauth condition. But the response shape (L230-237) is **hash-only**:

```ts
{
  transaction_id, integrity_hash, recomputed_hash, verified,
  chain_length, chain: [{id, hash, verified}, ...]
}
```

**No PII fields in this response.** F-A-005 does not apply.

---

## Sub-report C — Proposed response shape (always-redact)

### CC's proposal, after reviewing the prompt's straw shape

```json
{
  "id": "<uuid>",
  "type": "capability",
  "status": "completed",
  "capability_slug": "email-validate",
  "solution_slug": null,
  "price_cents": 0,
  "latency_ms": 8,
  "transparency_marker": "algorithmic",
  "data_jurisdiction": "EU",
  "is_free_tier": true,
  "created_at": "2026-04-20T08:39:20.291Z",
  "completed_at": "2026-04-20T08:39:20.300Z",
  "quality": {
    "sqs": 84.6,
    "sqs_label": "Good",
    "quality_grade": "B",
    "reliability_grade": "A",
    "usable": true,
    "strategy": "direct"
  },
  "body_redacted": true,
  "body_redacted_reason": "Free-tier public lookup. The transaction's input, output, and audit trail are not returned to unauthenticated callers."
}
```

### Critique of the prompt's straw proposal

| CC recommendation | Rationale |
|---|---|
| **Include `type`, `transparency_marker`, `data_jurisdiction`** in addition to the prompt's list | These are non-PII and match the existing authed shape's envelope; keeping them preserves the "looks like the same response, just with body fields gone" UX |
| **Include `quality` object** | Operator-domain signal (SQS, grades). No PII. Valuable for free-tier showcase use cases — an AI agent inspecting a free-tier txn to decide whether to trust the capability |
| **Drop `body_redacted_recovery_hint`** | The prompt's example `"POST /v1/auth/signup then GET /v1/transactions/:id ..."` is verbose and mixes API docs into a response field. Replace with a single `body_redacted_reason` string that mentions auth in prose |
| **`body_redacted: true` marker name** | Good as-is. Alternatives considered: `redacted` (ambiguous — could mean deletion per SA.2a), `payload_hidden` (unclear what "payload" means in API context). `body_redacted` is explicit and collision-free. |
| **HTTP status 200 (not 206 Partial Content)** | 206 is semantically tempting but requires `Content-Range` per RFC 7233, and most clients don't handle 206 well. 200 + explicit body marker is unambiguous. |
| **Keep existing 404 "not_found" shape** for missing txns | Same as today's unauth-branch behaviour. No change. |
| **Do NOT include a signup URL verbatim** | URLs drift; the message can point to `/docs` prose without hardcoding |

### Exact redacted envelope (CC's recommendation for F-A-005.b)

```ts
{
  id,
  type,
  status,
  capability_slug,
  solution_slug,
  price_cents,
  latency_ms,
  transparency_marker,
  data_jurisdiction,
  is_free_tier: true,  // always true on this branch
  created_at,
  completed_at,
  quality,
  body_redacted: true,
  body_redacted_reason: "Free-tier public lookup. input, output, error, provenance, and audit_trail are redacted for unauthenticated callers. Authenticate with an API key to access the full body.",
}
```

**13 fields + 2 redaction-marker fields = 15 total.** Roughly same envelope size as the current response; 5 PII fields removed, 2 marker fields added.

---

## Sub-report D — Verify initial lookup (`/:id/verify`) treatment

**Conclusion: leave the verify endpoint alone. F-A-005 does NOT apply.**

Evidence:
- Handler at `transactions.ts:181-239` reads the full txn row via `.select()` (no projection) but the response at L230-237 only exposes `transaction_id`, `integrity_hash`, `recomputed_hash`, `verified`, `chain_length`, `chain`.
- The walker loop at L213-228 selects full txn rows internally (needed to compute hashes) but only emits `{id, hash, verified}` per hop.
- Confirmed by SA.2a.2a classification: L221-225 (the chain-walk subquery) is category B — hash-only traversal, not PII.

**Why leaving it alone is correct, not an oversight:**
- F-A-005's concern is `input`/`output`/`audit_trail` leaking. Verify never returns these.
- F-A-005.b's blanket rule (always-redact on unauth) would imply adding `body_redacted: true` to the verify response too. That's wrong — the verify response isn't a body, it's a hash receipt. Adding the marker would confuse API clients.
- The public `GET /v1/verify/:id` (separate route, `routes/verify.ts`) is also hash-only and similarly unaffected.

**Document this in the F-A-005.b handler comment** so future auditors don't wonder why `/:id/verify` was skipped.

---

## Sub-report E — OpenAPI / docs impact

### 1. OpenAPI spec — `apps/api/src/openapi.ts:519-553`

```ts
"/v1/transactions/{id}": {
  get: {
    security: [{ BearerAuth: [] }, {}],  // ← allows both authed and unauth
    responses: {
      "200": { schema: { properties: {
        id, status, capability_slug, output, error, price_cents,
        latency_ms, provenance, transparency_marker, data_jurisdiction,
        created_at, completed_at,
      } } },
    },
  },
},
```

**Already incomplete vs reality:** the spec doesn't document `input`, `audit_trail`, `type`, `is_free_tier`, `solution_slug`, or `quality`. But that's a pre-existing gap; F-A-005.b shouldn't try to fix it wholesale.

**What F-A-005.b needs to do here:** document the two response shapes. Since `security: [{BearerAuth:[]}, {}]` means "authed or unauth", a single response schema serves both. Options:
- **(i)** Mark `output`, `error`, `provenance` as `nullable: true` and add `body_redacted` + `body_redacted_reason` properties. Single schema covers both shapes ("authed: body fields populated; unauth: body fields null + body_redacted=true").
- **(ii)** Use OpenAPI `oneOf` with two schema variants. Pedantically correct but harder for SDK generators to handle.
- **(iii)** Split into two endpoints (breaking change — not proposed).

**Recommendation: (i).** Minimal diff to `openapi.ts`, clients continue working.

### 2. SDK — `packages/sdk-typescript/src/types.ts:117-129`

```ts
export interface TransactionDetail {
  id: string;
  status: string;
  capability_slug: string;
  input: Record<string, unknown>;        // ← never null today
  output: Record<string, unknown> | null;
  error: string | null;
  price_cents: number;
  latency_ms: number;
  provenance: Provenance | null;
  created_at: string;
  completed_at: string | null;
}
```

**SDK callers always hold an API key** (authed path), so they'll continue receiving `input` populated. Post F-A-005.b, unauth callers (not SDK users in practice) get the redacted variant. CC recommends:

- **Make `input` nullable** (`Record<string, unknown> | null`) in `TransactionDetail` — matches reality for any SDK caller who somehow hits the unauth path.
- **Add `body_redacted?: boolean`** and **`body_redacted_reason?: string`** as optional fields. Client code can inspect `body_redacted` to decide whether body fields are usable.
- **No new type** (`RedactedTransactionDetail`) — one union-capable shape is simpler.

### 3. welcome.ts — `routes/welcome.ts:47, L208`

Documentation strings like:
```
transactions: "GET /v1/transactions",
```
and
```
- `GET /v1/transactions` — Transaction history
```

These reference the endpoint by path only. **No response-shape description.** No change needed in F-A-005.b.

### 4. Frontend — `strale-frontend/public/llms.txt` + `strale-frontend/src/`

- `llms.txt:37` mentions `transaction_id` in an example but describes the POST /v1/do response, not GET /v1/transactions/:id. **No change.**
- `FreeTierShowcase.tsx`, `LiveDemo.tsx`: show transaction_id strings in UI; neither calls `GET /v1/transactions/:id`. **No change.**

### 5. External surfaces (Beacon, llms.txt, SDKs for other languages)

- No Beacon reference to response shape.
- `llms.txt` doesn't describe the lookup shape.
- Python SDK (`packages/sdk-python`): not audited in this prompt — flag as a follow-up if chat wants SDK parity with the TypeScript type change. Likely trivial (mirror the `input | None` and `body_redacted: bool | None` additions).

### Summary

| Change | Surface | Effort |
|---|---|---|
| Handler response shape | `apps/api/src/routes/transactions.ts` unauth branch at L157-177 | ~15 lines |
| OpenAPI spec (nullable + markers) | `apps/api/src/openapi.ts:527-550` | ~10 lines |
| SDK type (make input nullable + add markers) | `packages/sdk-typescript/src/types.ts:117-129` | ~3 lines |
| Python SDK mirror | `packages/sdk-python/` | defer to SDK sync ticket |

**Rule 4 (distribution surfaces):** no external distribution surface references the response shape verbatim. No cross-repo doc update needed.

---

## Sub-report F — Free-tier UX consideration

### Current user workflow

1. POST `/v1/do` with `{capability_slug: "email-validate", inputs: {email: "x@y.com"}, max_price_cents: 100}` → response contains `transaction_id` + full `output` inline.
2. (optional) Later, GET `/v1/transactions/:id` unauth → gets the full body back, including `input`/`output`.

### Post-F-A-005.b workflow

1. POST /v1/do — unchanged. Full output still returned inline in the POST response.
2. (optional) GET /v1/transactions/:id unauth → gets the redacted envelope. Body fields nullified + `body_redacted: true`.

### Is any legitimate workflow broken?

**No meaningful break found.**
- The POST response already contains the output. Users who want post-hoc body access should save the POST response.
- The `GET /v1/transactions/:id/verify` endpoint is untouched — users can still prove integrity of a transaction via its ID.
- The `GET /v1/audit/:id?token=<hmac>` endpoint is untouched — token-holders still get full audit composition.
- The redacted envelope still reveals `capability_slug`, `status`, `quality`, timestamps — enough for an agent to reason about "did this capability work" without needing body content.

**One minor UX loss:** users who want to share a free-tier transaction URL with a colleague who'd fetch the body can no longer do so without also sharing an API key or the HMAC-audit URL. Acceptable tradeoff given the PII risk.

**No Open Question needed here** — the UX story is clean.

---

## Upstream / Downstream / Siblings / External

### Upstream

- **SDK (`packages/sdk-typescript`)**: always holds an API key → authed path → unaffected by the redaction. Type update is cosmetic (making `input` nullable covers the edge case of an unauth caller through the SDK).
- **Frontend (`strale-frontend`)**: no caller of `GET /v1/transactions/:id` found. Unaffected.
- **Internal tools / monitoring**: grep for callers of this endpoint found no internal probes. If any exist in infrastructure-as-code or ops scripts CC can't see, they'd need the same review.
- **Public docs at strale.dev**: no verbatim references to the response shape.

### Downstream

- `GET /v1/audit/:id?token=` (HMAC-gated full body) — unaffected.
- `GET /v1/transactions/:id` authed branch — unaffected.
- `GET /v1/transactions/:id/verify` — unaffected (hash-only response).
- `GET /v1/verify/:id` (public chain walker) — unaffected.

### Siblings

- `transaction_quality`: no public lookup path.
- Failed-request logs (`failed_requests` table): not exposed on any public surface today.

### External

- **No distribution surface change.** Rule 4 N/A.

---

# PLAN — F-A-005.b

## Plan section 1 — Handler change

**File:** `apps/api/src/routes/transactions.ts`
**Site:** unauth branch at L157-177.

**Current:**
```ts
// Unauthenticated: only free-tier transactions are publicly accessible by ID
const [row] = await db
  .select(selectFields)
  .from(transactions)
  .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
  .where(and(eq(transactions.id, id), eq(transactions.isFreeTier, true), isNull(transactions.deletedAt)))
  .limit(1);

if (!row) {
  return c.json(
    apiError(
      "not_found",
      "Transaction not found. Paid transaction lookups require an API key.",
    ),
    404,
  );
}

return c.json(formatRow(row));
```

**Proposed:**
```ts
// Unauthenticated: only free-tier transactions are publicly accessible by ID.
// Returns a redacted envelope — body fields (input/output/error/provenance/
// audit_trail) are NOT returned to unauth callers. See F-A-005. The sibling
// GET /:id/verify is unaffected because its response is hash-only (no PII).
const [row] = await db
  .select(selectFields)
  .from(transactions)
  .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
  .where(and(eq(transactions.id, id), eq(transactions.isFreeTier, true), isNull(transactions.deletedAt)))
  .limit(1);

if (!row) {
  return c.json(
    apiError(
      "not_found",
      "Transaction not found. Paid transaction lookups require an API key.",
    ),
    404,
  );
}

return c.json(formatRedactedRow(row));
```

Plus a new `formatRedactedRow(row)` helper adjacent to `formatRow` that returns the envelope from Sub-report C (~20 lines).

**Pattern used:** new helper for the redacted shape, leaving `formatRow` untouched for the authed branch.
**Risk:** low. The authed branch (L141-154) is unchanged. The unauth branch swaps the response builder only.

---

## Plan section 2 — Response envelope

```ts
function formatRedactedRow(row: typeof selectFields extends infer T ? { [K in keyof T]: any } : never) {
  const isSolution = row.solution_slug != null;

  // Same quality construction as formatRow — operator-domain metric, no PII.
  const quality = isSolution
    ? { sqs: null, sqs_label: null, quality_grade: null, reliability_grade: null, usable: null, strategy: null }
    : {
        sqs: row._matrix_sqs != null ? parseFloat(row._matrix_sqs) : null,
        sqs_label: sqsLabel(row._matrix_sqs != null ? parseFloat(row._matrix_sqs) : null),
        quality_grade: gradeFromScore(row._qp_score != null ? parseFloat(row._qp_score) : null),
        reliability_grade: gradeFromScore(row._rp_score != null ? parseFloat(row._rp_score) : null),
        usable: row._guidance_usable ?? true,
        strategy: row._guidance_strategy ?? "direct",
      };

  return {
    id: row.id,
    type: isSolution ? "solution" as const : "capability" as const,
    status: row.status,
    capability_slug: row.capability_slug ?? null,
    solution_slug: row.solution_slug ?? null,
    price_cents: row.price_cents,
    latency_ms: row.latency_ms,
    transparency_marker: row.transparency_marker,
    data_jurisdiction: row.data_jurisdiction,
    is_free_tier: row.is_free_tier,
    created_at: row.created_at,
    completed_at: row.completed_at,
    quality,
    // F-A-005: explicit body redaction marker. input, output, error,
    // provenance, audit_trail are not returned to unauthenticated callers.
    body_redacted: true as const,
    body_redacted_reason:
      "Free-tier public lookup. input, output, error, provenance, and audit_trail " +
      "are redacted for unauthenticated callers. Authenticate with an API key to " +
      "access the full body.",
  };
}
```

**No additional DB columns or indexes.** Pure response-shape change.

---

## Plan section 3 — OpenAPI + SDK updates

### `apps/api/src/openapi.ts:527-550`

Two edits:

1. Mark PII fields as `nullable: true` so the spec covers both authed (populated) and unauth (null) cases. Affects `output`, `error`, `provenance`.
2. Add `body_redacted` and `body_redacted_reason` properties. Add a note in the `description` field explaining that unauth calls return `body_redacted: true` with the body fields nulled.

Estimated diff: ~10 lines.

### `packages/sdk-typescript/src/types.ts:117-129`

Change `input: Record<string, unknown>` to `input: Record<string, unknown> | null`.
Add:
```ts
body_redacted?: boolean;
body_redacted_reason?: string;
```

Estimated diff: ~3 lines.

### Python SDK (defer)

`packages/sdk-python/` — same shape update in Python type hints. **Not in F-A-005.b scope** — flag as a follow-up ticket (one of the standard SDK-sync items).

---

## Plan section 4 — Tests

F-A-005.b should add at minimum two integration tests:

### Test A — Unauth GET on free-tier txn returns redacted envelope
```ts
it("unauth GET on free-tier transaction returns redacted envelope", async () => {
  // POST /v1/do unauth → get transaction_id
  // GET /v1/transactions/:id unauth
  // assert: status 200
  // assert: body.body_redacted === true
  // assert: body.input === undefined (not in response)
  // assert: body.output === undefined
  // assert: body.audit_trail === undefined
  // assert: body.id, capability_slug, price_cents, created_at are present
});
```

### Test B — Authed GET on same txn returns full body (regression check)
```ts
it("authed GET on free-tier transaction returns full body", async () => {
  // POST /v1/do authed → get transaction_id
  // GET /v1/transactions/:id with Bearer
  // assert: status 200
  // assert: body.input is populated
  // assert: body.output is populated
  // assert: body.body_redacted === undefined (not in response)
});
```

### Optional Test C — Verify endpoint unchanged
```ts
it("verify endpoint still returns hash-only shape regardless of auth", async () => {
  // GET /v1/transactions/:id/verify unauth
  // assert: body has integrity_hash, chain but not input/output/audit_trail
});
```

Test file: likely a new `apps/api/src/routes/transactions.test.ts` or extend an existing integration test file. CC checks during F-A-005.b which test file to extend.

---

## Plan section 5 — Commit split proposal

**Recommendation: single commit.** ~50 lines of code + OpenAPI/SDK type changes + tests. Logically one unit.

If tests end up non-trivial (>50 lines themselves), split as:
- **C1** — Handler + OpenAPI + SDK type
- **C2** — Test coverage

CC decides at implementation time based on actual test sizes.

---

## Plan section 6 — Open questions for chat

### OQ #1 — Include `quality` in the redacted envelope?

CC's proposal includes `quality` (SQS, grade, usable, strategy). Arguments:
- **Include**: no PII, useful for agents inspecting free-tier capability trust before deciding to use. Matches shape parity with authed response.
- **Exclude**: minimal envelope principle — if we're redacting, why expose operator signals? Reduces attack surface further.

**Recommendation: include.** Rationale above.

### OQ #2 — Marker name: `body_redacted` vs alternatives?

- `body_redacted`: explicit, unambiguous.
- `redacted`: ambiguous (could mean soft-delete redaction per SA.2a).
- `unauthorized_view` / `public_view`: confuses auth with redaction.
- `partial_content`: conflates with HTTP 206.

**Recommendation: `body_redacted`.** Matches SA.2a's `redacted_at` column semantics (redaction = content removed) but scoped to the envelope level.

### OQ #3 — Include `body_redacted_reason` string or just `body_redacted: true`?

- `true` alone: minimal, self-documenting for callers who know the contract.
- `true + reason`: better UX for agents that log or display API errors. Costs ~150 bytes per response.

**Recommendation: include reason.** Response size cost is negligible; first-time discoverers (humans + agents) benefit from the prose.

### OQ #4 — Status code: 200 or 206 Partial Content?

- **200 + marker**: clients handle 200 uniformly; marker field is unambiguous.
- **206**: semantically closer to "you got a subset of the content." Requires `Content-Range` per RFC 7233, which doesn't map cleanly to field-level redaction. Many HTTP libs treat 206 as error.

**Recommendation: 200.** Industry convention.

### OQ #5 — Does the authed response need a `body_redacted: false` marker for symmetry?

- **Yes (symmetric)**: every response has the marker. Callers check `body_redacted` unconditionally.
- **No (asymmetric)**: marker appears only when redaction happened. Authed responses are unchanged — zero client regression risk.

**Recommendation: asymmetric.** Keep authed shape untouched. Optional `body_redacted?: boolean` in the SDK type lets clients `if (body_redacted) { ... }` without changing existing working code.

### OQ #6 — Update Python SDK in F-A-005.b or separate ticket?

Options:
- Bundle: one PR covers all SDK type parity.
- Defer: Python SDK sync is a standing backlog item.

**Recommendation: defer.** F-A-005.b ships the API change + TypeScript SDK; Python lags by a separate sync ticket (consistent with prior SDK syncs like the SA.2a DELETE endpoint).

---

## Verification checklist

- [x] F-A-005 located and extracted verbatim (Sub-report A)
- [x] Six sub-reports (A-F) populated with file:line references
- [x] Six plan sections produced
- [x] Six open questions populated
- [x] Report written to `audit-reports/F_A_005_a_audit.md`, untracked
- [x] No files modified in `apps/api/src/`
- [x] `git status` shows the report file + pre-existing root-level dirty state

---

*End of F-A-005.a audit. Ready for chat review before F-A-005.b implementation.*
