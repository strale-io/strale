# Execution receipt, Phase 1 — what the integrity substrate actually binds today

**Method:** read from implementation and tests on `origin/main` at `933c1e4`, and
from production read-only. Nothing here is taken from a design document, a
marketing page, or a code comment that the code does not support. Where a claim
elsewhere in the repo is contradicted by the implementation, that is recorded as
a finding rather than smoothed over.

---

## 1. The one thing that is genuinely a cryptographic commitment

`apps/api/src/lib/integrity-hash.ts` → `computeIntegrityHash(record, previousHash)`.

SHA-256 over `JSON.stringify` of a **fixed object literal**, with these members
and no others:

| bound | field |
|---|---|
| identity | `id`, `userId` |
| outcome | `status`, `error` |
| **request** | `input` |
| **result** | `output` |
| commercial | `priceCents` |
| timing | `latencyMs`, `createdAt`, `completedAt` (each coerced through `new Date(x).toISOString()`) |
| context | `provenance`, `auditTrail`, `transparencyMarker`, `dataJurisdiction` |
| chain | `previousHash` |

So the substrate **does** already commit to the request and the result. That is
the single most important true thing to establish, because it means the new
receipt is a *canonicalisation and identity* problem, not a "we never hashed the
result" problem.

Chain shape: per-day linkage, `previous_hash` + a monotonic `chain_seq` assigned
at hash time, anchored at `GENESIS_HASH = sha256("strale-genesis-v1")`. Hashing
is two-phase — the row commits first, a worker (`jobs/integrity-hash-retry.ts`)
fills the chain afterwards. Fork detection, head selection and out-of-order
completion are covered by `integrity-hash-chain.integration.test.ts` (8 tests,
including one that PINS a known bug: nothing prevents two rows sharing a parent).

## 2. `compliance_hash` does not exist

There is no `compliance_hash` column, function, or value anywhere in `apps/api/src`.

What exists is `compliance_hash_state` — a `varchar(16)` **state label**
(`pending` → `complete` / `failed` / `excluded` / `deferred`) written only by
`jobs/integrity-hash-retry.ts` to track whether the integrity hash has been
computed yet. It is a workflow status, not a digest.

Adjacent trap: `integrity_hash_status` is **not** an integrity field despite the
name. `db/schema.ts:389-392` records it as externally managed by an untracked
workflow that tags rows `customer` / `test` for analytics, with an explicit "do
NOT read, write, or modify from API code".

Anything asserting a "compliance hash" is describing something the code does not
have.

## 3. There is no signed receipt on any rail today

The only signature in the x402 path is the **payer's** signed
`TransferWithAuthorization`, verified inbound by the facilitator
(`lib/x402-gateway.ts`). It is a payment authorisation. Strale signs nothing
about the result, on any rail. `x402_settlement_id` and `x402_payer_hash` are
settlement bookkeeping, not attestations.

So "x402 signed receipt if present" resolves to: **not present**. There is no
existing artifact to preserve compatibility with.

## 4. Three separate, mutually inconsistent hashes over the same material

This is the defect that makes Phase 4's single authority necessary.

| # | site | input | canonicalisation | width |
|---|---|---|---|---|
| 1 | `computeIntegrityHash` (`lib/integrity-hash.ts:90`) | fixed literal incl. `input`, `output` | **none for nested values** — top-level order fixed by the literal, but `input`/`output`/`provenance`/`auditTrail` are stringified in insertion order | 64 hex |
| 2 | `hashInput` (`routes/do.ts:2818`) → `audit_trail.input_hash` | request inputs only | **none** — bare `JSON.stringify(input)` | 64 hex |
| 3 | `computeIdempotencyFingerprint` (`lib/idempotency-fingerprint.ts:76`) | rail, task, slug, inputs, dry_run, require_fresh | **partial** — a private recursive key-sort (`canonicalize`, line 46) | **32 hex (truncated)** |

Consequences, all provable by construction:

- **Two semantically identical requests can produce different digests** in (1)
  and (2), because JavaScript object key order is insertion order and nothing
  normalises it. `{"a":1,"b":2}` and `{"b":2,"a":1}` hash differently.
- (3) sorts keys but is not RFC 8785: no number normalisation (`1.0` vs `1`, `1e2`
  vs `100`), no `-0` handling, no Unicode normalisation, no escaping rules.
- (3) is truncated to 128 bits and is a **replay key**, not a commitment.
- Nothing cross-checks the three against each other.

## 5. What the chain does NOT bind

Against the fields the receipt spec must cover:

| required by spec | bound today? | where |
|---|---|---|
| transaction id | **yes** | `id` |
| semantic input | **yes** | `input` |
| semantic returned result | **yes** | `output` |
| capability identity | **indirectly** | only via `auditTrail.capability` (the slug), which is inside the hashed `auditTrail` blob — not a first-class hashed field |
| **capability version / implementation identity** | **NO** | *no version concept exists anywhere in the codebase* — `grep capabilityVersion\|capability_version` across `src/` returns nothing |
| endpoint / execution rail | **partially** | `auditTrail.execution_mode` is `sync`/`async`; the RAIL (`/v1/do` vs x402 vs solution step vs MCP vs A2A) is not recorded as such |
| execution method | **partially** | `transparencyMarker` and `auditTrail.ai_description` approximate it |
| data vintage / source observation time | **partially** | `provenance.fetched_at` where the executor supplies it; `validateProvenanceAtBoundary` warns but does **not** block on absence |
| receipt version | **NO** | no versioning of the hashed shape exists; changing the payload silently changes every future digest with nothing recording which rule produced which |

The last row is the most consequential for Phase 2: because there is no version
field, the existing chain cannot distinguish "hash computed under the old rule"
from "hash is wrong". Any change to the hashed payload is therefore
unversioned today, which is precisely what a `strale.execution.v1` identifier
fixes.

## 6. Call sites can already vary what gets hashed

`buildFullAudit` (`routes/do.ts:2896`) takes `outputSchema?` and `provenance?` as
**optional** parameters, and `schema_validated` falls back to `false` when the
schema is absent. The audit body — which is inside the integrity hash — therefore
differs in content depending on what the call site happened to pass. This is the
"no call site may select or omit hashed fields" requirement failing today, in the
one composer that feeds the chain.

## 7. Legacy honesty constraint

`routes/audit.ts:110` already acknowledges "legacy rows pre-`buildFullAudit`
(informational, not hash-protected)". Measured in production, 2026-08-23:

| population | rows |
|---|---|
| transactions, total | 921,259 |
| with an `integrity_hash` | 883,296 |
| **without** one | 37,963 |
| `redacted_at` set (content cleared in place) | 316,198 |
| **hashed, but the hashed content is now gone** | **278,247** |

Also confirmed against `information_schema`: `transactions.compliance_hash`
column count = **0**. It does not exist.

Those 278,247 rows are the hard constraint on Phase 5. They carry a valid chain
hash computed over `input`/`output` that retention (90 days) or account closure
(WP11) has since cleared in place — deliberately, and provably, since 0103's
trigger makes redaction irreversible. **The originally-hashed material no longer
exists for them, so no receipt can ever be reconstructed.** They must be labelled
legacy and left alone; any backfill that "recomputed" a receipt for them would be
fabricating a commitment to content nobody can produce. The 37,963 unhashed rows
are a separate, pre-existing population and are not this package's to fix.

---

## What this means for Phases 2–7

1. The receipt is **not** a new integrity system. The chain already binds request
   and result; the receipt makes that commitment *canonical, versioned, and
   independently recomputable*, and binds it into the existing chain material
   (spec Phase 4) rather than alongside it.
2. **RFC 8785 is the substantive change.** Today's three hashes are
   insertion-order dependent (two of them entirely). Without canonicalisation, an
   independent party cannot recompute a digest from the same semantic values.
3. **Capability version identity has to be invented**, not wired up. Nothing in
   the codebase identifies which implementation produced a result. This is the
   one place the spec requires a genuinely new concept, and it needs a decision
   on what constitutes a version (executor content hash? manifest digest?
   deploy commit?) before Phase 2 can be finalised.
4. **One authority, called by every rail.** Today `/v1/do` hashes inputs one way,
   idempotency another, and the chain a third. Phase 4's builder replaces all
   three call-site-local schemes; the idempotency fingerprint stays a separate
   *replay key* but must stop being a second, divergent canonicaliser.
5. **Nothing to keep compatible with on x402.** No signed receipt exists, so the
   wire format is unconstrained by history — which also means there is no
   pressure to imitate any external proposal.

### Open decision for Phase 2 (mine to make, recorded before I make it)

What identifies "the implementation that ran". Candidates: the deployed commit
SHA (already served at `/health`, coarse — changes for unrelated deploys); a
content hash of the executor module (precise, but rebuild-sensitive); the
capability's manifest digest (stable and semantically meaningful, but does not
change when executor code changes). My inclination is a composite —
`{deploy_commit, manifest_digest}` — so the receipt records both what was
declared and what was deployed, and neither alone has to carry the weight.
