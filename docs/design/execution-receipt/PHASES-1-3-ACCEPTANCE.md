# Execution receipt, Phases 1–3 — ACCEPTED infrastructure

**Status:** ACCEPTED. Merged as `07dcb2e` (PR #378, squash of `b04dcea`).
**Verified on `main`:** 2026-08-23, by reading the merged tree rather than the PR.

---

## What is now accepted

| phase | artifact |
|---|---|
| 1 | `PHASE-1-CURRENT-TRUTH.md` — what the integrity substrate actually binds |
| 2 | `PHASE-2-SPEC.md` — `strale.execution.v1`, with amendments 1–6 folded in |
| 3 | `apps/api/src/lib/canonical/jcs.ts` — RFC 8785, no runtime dependency |
| 3 | `apps/api/src/lib/canonical/domain-digest.ts` — `SHA-256(TAG ‖ 0x00 ‖ RFC8785(payload))` |
| 3 | `apps/api/src/lib/canonical/jcs-vectors.json` — 49 hand-derived conformance vectors |
| 3 | `jcs.test.ts`, `fingerprint-stability.test.ts` |

`canonicalize` and `json-canonicalize` are **devDependencies only** — confirmed
absent from `dependencies` on `main`. `json-canonicalize` is exact-pinned to
2.0.1 because a test asserts a bug in it.

## What is deliberately NOT here

Verified on the merged tree, not assumed:

- **No receipt persistence.** `schema.ts` contains zero matches for
  `receipt_digest`, `receipt_status`, `execution_manifest_snapshots`, or
  `integrity_payload_version`.
- **No chain-v2 migration.** Startup blocks stop at `0105_onboardingHookFailures`.
- **No production receipt call site.** The only production importer of the
  canonical module is `idempotency-fingerprint.ts`, and it imports exactly one
  symbol, `sortKeysDeep`. The single `canonicalize(` occurrence outside the
  module and its tests is inside a comment.

`canonicalize`, `canonicalBytes`, `domainDigest`, `digestPreimage`,
`DOMAIN_TAGS` and `sortJsonKeys` have **zero** production references. The
primitive is built and proven; nothing calls it yet.

## Review record

| round | scope | verdict |
|---|---|---|
| 1 | RFC 8785 correctness, reference independence, domain separation, closed-schema, idempotency compatibility | **FAIL** — 2 blocking |
| 2 | re-review after fixes | **PASS** |
| 3 | delta `3f65cee..be4ac18` | **PASS** |

Both round-1 blockers were real and mine:

1. **The depth bound was on the function nothing calls.** `MAX_DEPTH` guarded
   `canonicalize`, which has no production caller, while `sortKeysDeep` — which
   `do.ts` reaches on the raw parsed body *before* input validation — was
   unbounded. A ~6 KB body nested 3,000 deep produced a bare `RangeError` and a
   500. The guard protected code with no call site.
2. **The allow-list covered the object branch only.** The array branch was still
   a two-item blocklist, with three demonstrated holes of exactly the class the
   object branch had just closed.

## The lesson worth carrying into Phase 4

**Enumerating exotic types was never the right axis.** Five separate fixes went
in one type at a time — `__proto__`, getters, Proxy, boxed primitives, depth —
and the blocklist was *still* incomplete when review found three more holes in a
single pass.

The invariant that closes the family: **every value read during serialization
must be an own DATA property of a PLAIN container, and no member may exist that
the reader will not visit.** Three things break it — the container is not plain,
the read is not a plain read, or a member exists the reader will not visit.
Checking both branches against that one statement is what found the remaining
holes; checking against a type list is what missed them.

Phase 4 introduces two more places where the same question arises (what a
manifest snapshot normalizes, and what the receipt builder accepts). The axis to
apply there is the same: state the invariant, then check every branch against
it, rather than enumerating the bad cases.

## Verification evidence carried forward

| area | evidence |
|---|---|
| numbers | 699,777 comparisons vs both references + round-trip — zero disagreements |
| strings | all 63,488 non-surrogate BMP code units as value *and* key; 16,384 astral; 20,000 random — zero divergences |
| hostile values | 69-construction battery: 55 refused, 14 accepted, none unstable, all fixed points |
| over-detection | 30,000 random `JSON.parse` values — zero refusals |
| reference independence | vector file regenerated from a deliberately-mutated implementation: committed-vector block went green, reference block went red |
| idempotency neutrality | 70,000 requests vs the pre-refactor module extracted verbatim from git object `42c0b7c` — zero divergence; cross-commit corpus digest bit-identical |

## Residual limitations (unchanged, and inherited by Phase 4)

- `-0` collapses to `0` — two different inputs, one digest.
- Unicode is not normalized — precomposed and decomposed forms digest
  differently despite being visually identical.
- Integers beyond 2^53 are lossy before the canonicalizer sees them.
- Depth is bounded at 512. Production's deepest input carries 42 opening
  brackets, so real traffic is untouched.
- **No signature**, so no issuer authentication. A digest binds content; it does
  not authenticate who produced it.
- One test asserts third-party behaviour (`json-canonicalize`'s `toJSON` bug),
  which is why that dependency is exact-pinned.

## Process record

Every fail-before check ran through `apps/api/scripts/mutation-test.mjs`. That
guard found **four hollow guards of mine**, three of which review did not — most
instructively a footgun test asserting `Function.length`, which cannot see a
defaulted parameter, precisely the shape being guarded against.

See `docs/company/LESSONS.md` family **F11**: the guard already existed and was
not reached for. The defect is not missing tooling.
