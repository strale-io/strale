# `strale.execution.v1` — specification

**Status:** APPROVED WITH AMENDMENTS (2026-08-23). Amendments 1-6 are folded in
below and marked. Phase 3 (canonicalisation primitive) proceeds; receipt
integration does not.
**Depends on:** `PHASE-1-CURRENT-TRUTH.md` (accepted).
**Owner:** Strale. No external provenance package is a runtime dependency or an
authority for any part of this.

---

## 0. What this is, in one paragraph

A **closed, versioned, canonical payload** that commits a specific request to the
specific result Strale returned for it. It is RFC 8785 canonicalised, SHA-256
digested, stored as a full digest, and folded into the existing integrity chain.
A party who already holds the disclosed request and result can recompute the
digest offline and compare. It is **not** a signature, **not** a new integrity
system, and **not** a compliance claim.

---

## 1. The payload

Exactly these keys, always, in every receipt. The schema is closed: a call site
may neither omit a key nor add one. Values that do not apply take the defined
representation given below — they never disappear.

```json
{
  "version": "strale.execution.v1",
  "transaction_id": "8f1c…",
  "subject": {
    "kind": "capability",
    "slug": "vat-validate"
  },
  "implementation": {
    "deploy_commit": "ce5e63f091863f56764829b498525211cd2ab234",
    "manifest_digest": "sha256:9a3f…",
    "steps": null
  },
  "request": {
    "rail": "v1_do",
    "inputs": { "vat_number": "SE556677889901" }
  },
  "response": {
    "status": "completed",
    "result": { "valid": true, "name": "…" },
    "error": null
  },
  "execution": {
    "method": "algorithmic",
    "source_observation": { "kind": "live_fetch", "observed_at": "2026-08-23T09:14:50.311Z" }
  }
}
```

### Departures from the illustrative sketch, and why

| change | reason |
|---|---|
| `response.error` added | Decision 6 requires failures to be executions. A failed receipt with only `result: null` would not bind *what the caller was told*. |
| `implementation.steps` added | Decision on solutions (§5). Always present; `null` for capabilities. |
| `source_observation` is always a tagged object, never bare `null` | Decision 5 requires a *defined representation*, and Decision 9 warns against forcing one scalar. A bare `null` conflates "no source applies" with "we failed to record one" — two facts a verifier must be able to tell apart. §6. |
| no `price_cents`, no compliance block, no badges/scores | Decision 7. The chain already binds `priceCents`; a verifier recomputing a receipt holds the request and result, not the invoice. Putting price in would force disclosing commercial terms to verify a result. |

---

## 2. Field-by-field semantics

### `version` — `"strale.execution.v1"`
Literal. Names the canonicalisation rules, the key set, and the digest algorithm
together. Any change to any of the three requires a new version string. Phase 1
found that today's chain payload is unversioned, so a payload change is
indistinguishable from a broken hash; this field is the fix.

### `subject` — what was asked for
- `kind`: closed enum `"capability" | "solution"`.
- `slug`: the capability or solution slug as routed. Not a display name.

The routing *decision* (task text → slug) is deliberately not bound: the receipt
commits to what ran, not to how it was selected. The idempotency fingerprint
already covers `task` for replay purposes, and that is a different question.

### `implementation` — what code and what declaration
- `deploy_commit`: the **full 40-hex** git SHA the serving process was built
  from (`RAILWAY_GIT_COMMIT_SHA`, untruncated — `/health` shows 12 for display
  only). `null` when unset, which is local development and never production; a
  production receipt with a null commit is a defect, and §9 makes it refusable.
- `manifest_digest`: `sha256:<64 hex>` over the RFC 8785 bytes of the normalized
  declaration snapshot in force at execution. §4.
- `steps`: `null` for capabilities; for solutions, the ordered step identity
  array of §5.

There is deliberately **no semantic `capability_version`**. A hand-maintained
version integer is a claim someone has to remember to update; `deploy_commit` and
`manifest_digest` are both derived from material that exists anyway.

### `request` — what was asked
- `rail`: closed Strale-owned enum, §7.
- `inputs`: the **semantic** request object — the validated inputs the executor
  was invoked with, not the raw HTTP body. Headers, idempotency keys, budget
  knobs (`max_price_cents`, `timeout_seconds`), and transport framing are
  excluded: they do not change what was computed, and binding them would make a
  receipt unverifiable by anyone who did not observe the original HTTP call.

### `response` — what was returned
- `status`: closed enum `"completed" | "failed"`.
- `result`: the semantic result **as the caller received it**, or `null` when
  `status = "failed"`.
- `error`: `null` on success; on failure, `{ "code": "…", "message": "…" }` — the
  **sanitised, caller-visible** error, not the internal exception. Production
  redacts URLs and internal detail from error strings before they leave the
  process; binding the internal form would commit to a string the caller never
  saw and could not reproduce.

Decision 4 is satisfied by construction on every current rail. Verified in
Phase 1: `/v1/do` returns `output: capResult.output` — the same object stored —
so the stored value and the caller-visible value are identical, with no later
transformation. §9 records this as an invariant a test must pin, because it is a
property of the current code rather than something the type system enforces.

### `execution` — how it was produced
- `method`: closed enum `"algorithmic" | "ai_generated" | "mixed"`, taken from
  the capability's declared `transparency_tag`. An execution fact (was a model
  involved), not a compliance interpretation.
- `source_observation`: §6.

---

## 3. What the receipt proves, and what it does not

**Proves**, to anyone holding the disclosed request and result:

- These exact inputs produced exactly this result, on this transaction.
- Under this deployed code (`deploy_commit`) and this capability declaration
  (`manifest_digest`).
- Over this rail, by this method, with this recorded source observation.
- Including failures — a failed execution has a receipt too.
- That the record has not been altered since, **when combined with the chain**
  (§8): the digest is inside the chain payload, so changing a receipt breaks the
  chain from that point forward.

**Does not prove:**

- **That the result is correct.** It commits to what Strale returned, not to
  whether the upstream source was right. A receipt over wrong data is a valid
  receipt.
- **That Strale attests to it.** There is no signature. A digest binds content;
  it does not authenticate an issuer. Anyone able to write the database could
  compute a consistent receipt. Signing is a possible v2 and is deliberately out
  of scope — Phase 1 established there is no signed receipt today, so nothing
  regresses by not adding one now.
- **That the upstream source said this at the time.** `source_observation`
  records what the executor declared it observed. It is Strale's assertion about
  provenance, not the source's.
- **Anything about rows outside the epoch** (§9).
- **Regulatory conformance.** No badge, score, or framework mapping is bound.
  Those are interpretations, they change, and a receipt that moves when an
  interpretation moves is worthless.

---

## 4. Manifest / implementation identity

This is the part that fails if done naively, and Decision 2 names the failure
exactly: hashing a mutable current row does not prove historical configuration.

**The problem, concretely.** `capabilities.onboarding_manifest` is a `jsonb`
column, and four scripts write to it (`sync-manifest-canonical-to-db.ts`,
`sync-manifest-text-to-db.ts`, `sweep-manifest-drift.ts`, plus `onboard.ts`).
The YAML in `manifests/` is immutably addressable by git commit, but the
executor does not read YAML at runtime — it reads the database row. So the
material actually in force is the mutable one, and it can and does drift from
git.

**The design: a content-addressed, insert-only snapshot table.**

```
execution_manifest_snapshots
  digest        text PRIMARY KEY        -- 'sha256:<64 hex>' of the RFC 8785 bytes below
  subject_kind  varchar(16)  NOT NULL   -- 'capability' | 'solution'
  subject_slug  text         NOT NULL
  snapshot      jsonb        NOT NULL   -- the exact normalized declaration
  first_seen_at timestamptz  NOT NULL DEFAULT now()
```

- At execution, the coordinator normalizes the declaration in force, canonicalises
  it (RFC 8785), digests it, and `INSERT … ON CONFLICT (digest) DO NOTHING`. The
  receipt carries the digest.
- **Immutably addressable because it is content-addressed**: the digest is the
  address, and the address is a function of the content. A snapshot cannot change
  without changing its own primary key.
- A `BEFORE UPDATE` trigger blocks any change to `digest`, `snapshot`,
  `subject_kind`, or `subject_slug` — the same shape as migration 0103's
  redaction trigger, and load-bearing for the same reason: without it, "immutable"
  is a convention rather than a property.
- One row per distinct declaration, not per transaction. The catalogue is ~330
  capabilities and ~100 solutions; snapshots accumulate only when a declaration
  actually changes.
- **Permanence is structural, not a convention** (amendment 6). A snapshot
  outlives every transaction that references it, because a receipt is
  unverifiable without it. Three mechanisms, because the risk is that a future
  author prunes it without ever learning why they should not:
  1. **A `BEFORE DELETE` trigger** that raises. Generic retention cannot silently
     destroy verification material; it gets a loud error instead of a row count.
  2. **An explicit denylist entry** in `db-retention.ts`, asserted by a test:
     the table must never appear in `RETENTION_RULES`, and adding it turns that
     test red.
  3. **A comment at the table definition** naming the consequence — every receipt
     older than the pruning window becomes unverifiable, with no error anywhere.

  Mechanisms 1 and 2 are load-bearing; 3 exists so the next reader understands 1
  and 2 rather than working around them.

**What is in the normalized declaration** — the execution-semantic contract:

| included | excluded, and why |
|---|---|
| `slug` | `is_active`, `x402_enabled`, `visible`, `lifecycle_state` — routing and eligibility, not declaration; they change constantly and would churn the digest without changing what runs |
| `input_schema`, `output_schema` | `price_cents` — commercial; already bound by the chain, and binding it here would force disclosing terms to verify a result |
| `transparency_tag` | `avg_latency_ms`, quality scores, health — observational, not declared |
| `data_source`, `data_source_type` | `limitations`, descriptions, SEO text — disclosure prose; changing a sentence must not invalidate a result's identity |
| `freshness_category` | badges, framework mappings — Decision 7 |
| `output_field_reliability` | |
| `processes_personal_data`, `personal_data_categories` | |
| `gdpr_art_22_classification` | |

The rule behind the split: **if changing the field changes what a correct
execution would produce or how it must be interpreted, it is in; if it changes
only how the capability is sold, listed, or measured, it is out.**

---

## 5. Solution identity

Decision: a solution receipt that binds only the solution slug is
under-specified, because swapping a constituent capability's implementation
changes what ran while leaving the receipt identical.

`implementation.steps` is therefore, for `subject.kind = "solution"`, an
**ordered array** — order is part of the identity, since the same steps in a
different order are a different computation:

```json
"steps": [
  { "step_order": 1, "slug": "vat-validate",     "manifest_digest": "sha256:…" },
  { "step_order": 2, "slug": "sanctions-check",  "manifest_digest": "sha256:…" }
]
```

- `manifest_digest` per step is resolved from the same snapshot table, at
  execution, for the declaration each step actually ran under.
- `implementation.manifest_digest` at the top level is the **solution's own**
  declaration digest (its step list, gates, ordering) — so both the recipe and
  every ingredient are bound.
- A step that did not run (short-circuited by a gate) still appears, with
  `"manifest_digest": null` and the absence recorded — omitting it would let two
  different executions share a receipt shape.

**Explicitly out of scope for v1:** per-step receipts. Phase 1 confirmed a
solution execution writes one transaction with `capability_id = NULL` and the
step results inside `output.steps`; steps have no transaction rows of their own.
Giving steps their own receipts means giving them their own identity in the
chain, which is a larger change than this package. The solution receipt binds
step identity; it does not produce a separately verifiable per-step artifact.

---

## 6. `source_observation`

Decision 9 is right that one scalar timestamp is dishonest across the catalogue —
a live registry lookup, a bulk dataset, and a pure computation have genuinely
different vintage semantics, and forcing them into one field produces a
fabricated timestamp for two of the three.

Always present, always exactly one of these closed shapes:

```json
{ "kind": "live_fetch", "observed_at": "2026-08-23T09:14:50.311Z" }
{ "kind": "dataset",    "dataset_version": "2026-08-01", "observed_at": "2026-08-23T09:14:50.311Z" }
{ "kind": "computed" }
{ "kind": "none_declared" }
```

- `live_fetch` — the executor contacted a source during this execution and
  declared when. Sourced from `provenance.fetched_at`.
- `dataset` — the answer came from a versioned corpus; `dataset_version`
  identifies it, `observed_at` is when this execution read it.
- `computed` — no external source (validators, format checks, arithmetic).
  Positively asserted, not inferred from absence.
- `none_declared` — the executor declared nothing. **This is the honest
  representation of missing information**, and it is deliberately distinguishable
  from `computed`. Phase 1 found `validateProvenanceAtBoundary` warns but does not
  block on absent provenance, so this case exists today and pretending otherwise
  would put a false vintage into a commitment.

`none_declared` is expected to be common at the epoch and should shrink. Its
count is a measurable quality signal, which is a better outcome than a
uniformly-populated field nobody can trust.

---

## 7. Rail identity

Closed, Strale-owned, derived from which interface the caller used — never from
raw HTTP noise (no `User-Agent`, no `Referer`, no header sniffing):

| value | meaning |
|---|---|
| `v1_do` | `POST /v1/do`, wallet-billed or free-tier |
| `x402` | the x402 gateway, payment-as-auth |
| `mcp` | the MCP server tool surface |
| `a2a` | the A2A protocol surface |
| `internal` | platform-originated execution (test harness, sweeps) |

Unknown or unmapped callers are a **refusal**, not a fallback value (§9). A
receipt asserting the wrong rail is worse than no receipt, and a permissive
`"other"` bucket is how the wrong rail gets asserted.

---

## 8. Composition with the existing integrity chain

The receipt does not create a parallel integrity system. It becomes an input to
the one that exists.

0. **Domain separation** (amendment 5). Every digest in this system is taken
   over a domain-tagged, versioned preimage, never over bare canonical bytes:

   ```
   digest = SHA-256( DOMAIN_TAG || 0x00 || RFC8785(payload) )
   ```

   | material | `DOMAIN_TAG` |
   |---|---|
   | execution receipt | `strale.execution.v1` |
   | manifest snapshot | `strale.manifest-snapshot.v1` |

   The tag is US-ASCII and contains no NUL, so the `0x00` separator is
   unambiguous. Two different kinds of material can therefore never collide, and
   a payload that is valid under one schema cannot be replayed as the other. The
   version lives in the tag as well as inside the receipt body, so the preimage
   itself changes when the schema does.

1. Build the receipt payload → RFC 8785 → domain-tagged preimage → SHA-256 →
   full 64-hex digest.
2. Persist on the transaction: `receipt_version`, `receipt_canonicalization`
   (`"RFC8785"`), `receipt_digest_alg` (`"sha256"`), `receipt_digest`.
3. `computeIntegrityHash`'s payload gains `receiptDigest`, so the chain covers
   it. Swapping a receipt digest without recomputing the chain breaks
   verification at that row and every row after it — which is the property
   Decision "a receipt digest cannot be swapped without invalidating the chain"
   asks for.
4. The chain payload itself becomes versioned (`integrity_payload_version`),
   closing the Phase 1 finding that payload changes are currently
   indistinguishable from corruption.

### 8.1 Chain version transition (amendment 4)

Two payload versions coexist permanently. This is a transition, not a migration:
no historical hash is ever recomputed.

| | chain v1 | chain v2 |
|---|---|---|
| rows | pre-epoch | post-epoch |
| payload | today's 15 members, unchanged | the same members **plus `receiptDigest`** |
| `integrity_payload_version` | `NULL` (absent = v1, by definition) | `2` |
| verification | must remain verifiable forever, under the v1 rule | verified under the v2 rule |

The verifier selects the rule from the row's own
`integrity_payload_version`, so a v1 row verifies with the v1 payload and a v2
row with the v2 payload. **Linkage crosses the boundary unchanged**: a v2 row's
`previous_hash` points at the last v1 hash exactly as any other link, so the
chain is continuous across the epoch and `reaches_genesis` still holds.

The one-way property this buys: because `receiptDigest` is inside the v2 payload,
swapping a receipt digest on a post-epoch row invalidates that row's chain hash
and therefore every row after it.

**Ordering constraint.** Hashing is two-phase today: the row commits, then
`jobs/integrity-hash-retry.ts` chains it. The receipt must be built and persisted
**in the transaction that writes the row**, before chaining, so the chain worker
finds a digest already present. Receipt construction must never block or fail the
money path — if it cannot be built, the transaction still commits with
`receipt_version = NULL` and the chain payload records `receiptDigest: null`.
That is a defined representation, and such rows are visibly receipt-less rather
than silently wrong.

---

## 9. Epoch and legacy behaviour

- Receipts begin at a **defined deployment epoch**: the merge commit that ships
  Phase 4. Recorded in the package record and in a `platform_facts` entry.
- **No backfill, ever — including rows whose `input`/`output` still exist**
  (amendment 1). The temptation is real: 605,215 rows still carry their content.
  But content is not the whole receipt. Their `manifest_digest` and
  `deploy_commit` are not recoverable at any price, because nothing recorded the
  declaration or the build in force at the time. A "receipt" assembled from
  surviving content plus reconstructed implementation identity would assert
  something nobody measured. One epoch, one rule, no exceptions to argue about
  later. Phase 1 separately measured 278,247 rows whose content is irreversibly
  gone; they are the same answer for a stronger reason.
- Pre-epoch rows report `receipt: { "status": "legacy_unavailable", "reason": … }`
  on the verify/audit surfaces. Not an error, not an empty object, not a null
  that reads like a bug.
### 9.1 Post-epoch receipt lifecycle (amendment 2)

A post-epoch transaction may not silently lack a receipt. `legacy_unavailable`
is **forbidden** post-epoch — it is a statement about history, and using it for a
present-day failure would disguise a defect as a policy.

`transactions.receipt_status`, a closed enum, NOT NULL for post-epoch rows:

| status | meaning |
|---|---|
| `complete` | digest computed and persisted |
| `pending` | row committed, receipt not yet built — the expected transient state, since the money path must never wait on receipt construction |
| `failed` | construction was attempted and could not honestly complete; `receipt_failure_reason` says why |

Closed reason codes on `failed` / `pending`:
`unmapped_rail`, `missing_deploy_identity`, `unresolvable_manifest`,
`missing_subject`, `snapshot_write_failed`, `canonicalization_error`,
`internal_error`.

**Retry.** A `pending` row is retried by the same worker that chains it
(`jobs/integrity-hash-retry.ts`) — one place already owns "finish what the
request path could not". Retries are bounded and back off; on exhaustion the row
moves to `failed` with the last reason. A `failed` row is terminal and is never
silently retried into `complete`, because the material that made it fail is not
expected to reappear.

**Monitoring.** `pending` older than one chain cycle, and any `failed`, are
surfaced as counts by reason code. A non-zero `failed` count is an alert, not a
dashboard curiosity: it means executions are happening that cannot be committed
to.

### 9.2 Invariant failures, not ordinary absence (amendment 3)

Three conditions are **invariant failures**, not missing-data cases:

1. `rail` not in the closed enum;
2. `deploy_commit` absent in production;
3. `manifest_digest` unresolvable.

Each records `receipt_status = 'failed'` with its reason code AND raises an
error-level signal. They are bugs — a rail nobody mapped, a deploy that lost its
identity, a declaration that vanished — and none of them is a thing that
legitimately happens.

**Deploy identity is required at production boot.** `RAILWAY_GIT_COMMIT_SHA`
becomes a startup assertion: in production, a missing or non-40-hex value aborts
boot, in the same position as the existing schema-validation and cost-class
gates. Every receipt from a booted process then has a real commit by
construction, so `missing_deploy_identity` should be unreachable in production
and its appearance is itself the alarm.

Local and test environments are exempt and record the literal
`"unknown-local-build"`, which is a *defined* representation and can never be
mistaken for a real 40-hex SHA.

---

## 10. The four hashes, resolved

Phase 1 found three overlapping hashes. The target is three **roles**, one
canonicaliser, and no new permanent hash.

| hash | fate |
|---|---|
| **idempotency fingerprint** | **Keep**, narrowed to operational deduplication only. Its private recursive key-sort is replaced by the shared RFC 8785 canonicaliser — one canonicalisation implementation, not two. Stays truncated to 128 bits: it is a replay key, and it should not look like a commitment. |
| **execution receipt digest** | **New.** The canonical, portable request/result commitment. Full 256-bit digest. |
| **integrity chain hash** | **Keep** as tamper-evident anchoring and ordering, now including the receipt digest, and now versioned. |
| **`audit_trail.input_hash`** | **Deprecate on a disclosed timeline — NOT a silent removal.** It is a weaker, non-canonical duplicate of what the receipt now binds, and nothing in this codebase reads it back (the frontend `AuditRecord` contract does not carry it). **But it is externally visible:** `routes/transactions.ts:105` emits the raw `audit_trail` blob, `input_hash` included, on `GET /v1/transactions/:id`. Removing it is therefore a breaking change to a served response, not an internal cleanup. Path: ship the receipt first; leave `input_hash` in place and unchanged; announce; remove in a later versioned step that also changes the chain payload (§8.4). |

Net effect **+1 now, −1 later**: the receipt digest arrives in this package;
`input_hash` leaves only after a disclosed deprecation, because it is on a public
response shape. No fourth permanent hash is created either way.

I originally wrote this row as a clean internal deprecation, having checked only
that nothing *reads* the field. That was wrong in the direction that matters:
a field nobody reads internally can still be one a customer depends on, and
`GET /v1/transactions/:id` has been handing it out.

---

## 11. Unresolved design risks

1. **`manifest_digest` requires the snapshot table to be perfect on the write
   path.** If the snapshot insert fails, the receipt must refuse (§9), so a
   database hiccup silently reduces receipt coverage. Mitigation: refusals are
   counted; a refusal rate above zero is a monitored signal. Residual: coverage
   is only as good as that write.
2. **The snapshot table is exempt from retention, permanently.** It holds
   declarations, not customer data, so no GDPR conflict — but it is an
   append-only table that only grows, and the exemption must be written into the
   retention rules rather than assumed. If someone later adds it to
   `db-retention.ts`, every receipt older than the window becomes unverifiable
   with no error anywhere.
3. **Normalization scope is a judgement call.** §4's include/exclude split is
   defensible but not forced by the code. Getting it wrong in the *inclusive*
   direction churns digests on cosmetic edits; wrong in the *exclusive* direction
   means two materially different declarations share a digest. I lean exclusive
   and expect to revisit.
4. **`deploy_commit` granularity is coarse.** It changes for every deploy,
   including ones that touch nothing relevant to a given capability. Two receipts
   for identical executions across an unrelated deploy will differ in
   `implementation`, which is correct but will surprise anyone who expects
   receipt stability. Documented, not fixed — the alternative (per-executor
   content hashing) is rebuild-sensitive and worse.
5. **No signature means no issuer authentication.** Stated plainly in §3. If the
   goal later becomes third-party attestation rather than self-consistency, this
   needs a key, and key management is a materially larger commitment.
6. **Decision 4 holds by construction, not by enforcement.** Stored output equals
   caller-visible output on every rail today. Nothing in the type system prevents
   a future rail from transforming the result after the receipt is built. Phase 6
   must pin this with a test per rail, and that test is the only thing standing
   between the invariant and a silent regression.
7. **Solution step receipts do not exist** (§5). Bound identity is not the same
   as an independently verifiable per-step artifact, and a customer may
   reasonably expect the latter.
8. **Deprecating `input_hash` needs a consumer story I do not have.** It is
   emitted on `GET /v1/transactions/:id` and has been for some time. Nobody has
   measured whether any customer parses it, and the platform has no deprecation
   channel for response fields. Until both exist, the removal step in §10 is a
   plan, not a schedule.
9. **`none_declared` may dominate at the epoch.** If most executions cannot
   declare a source observation, the field's value is mostly that it exposes the
   gap. That is honest but is not the same as being useful on day one.
