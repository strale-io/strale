# Write-time input redaction — proposal

**Status:** build-ready. Both blocking questions answered 2026-09-06 (see "What it costs"); no code written yet.
**Date:** 2026-09-06
**Prompted by:** two disclosure corrections in two days (`password-strength`,
`pii-redact`) that share one cause.

## The problem

`transactions.input` is `jsonb NOT NULL` and `routes/do.ts` writes
`input: executionInput` verbatim on all four execution paths. Nothing redacts
at write time; a grep for `redactInput` / `sanitizeInput` / `sensitive_fields`
/ `no_persist` returns nothing. The only redaction is the 90-day sweep in
`lib/data-retention.ts`.

So the platform's floor is: **anything a caller sends is retained for 90
days, whatever it is.** That is fine for a company number or a DOI. It is not
fine for a password or a CV, and the catalogue already contains both.

Two consequences have already landed:

- `password-strength` claimed "Password is NOT stored" for the whole life of
  the capability. It was false. Narrowed 2026-09-05.
- `pii-redact` is *defined* by receiving text known to contain personal data,
  including special-category national identifiers, and never said it retained
  it. Narrowed 2026-09-06.
- `breach-exposure-check` (2026-09-05) had to be built smaller than its
  upstream allows — the Have I Been Pwned per-account endpoint and the Pwned
  Passwords range API are both excluded — because there is nowhere safe to put
  the input.

Measured in production 2026-09-06, real customer calls in the last 90 days
whose inputs are retained in full: `invoice-extract` 21, `password-strength`
10, `contract-extract` 5, `resume-parse` 4, `pii-redact` 3. Small numbers.
Each one is a document, a CV, or a live credential.

The disclosure fixes are honest, but they only tell customers about a
limitation. They do not remove it, and they leave a whole class of capability
unbuildable.

## What is proposed

A manifest-declared, write-time redaction contract. Three parts.

**1. Declare it in the manifest, next to the input schema.**

```yaml
input_schema:
  properties:
    password: { type: string }
sensitive_inputs:
  password: drop          # never written
  document_text: hash     # written as sha256:<hex>, never the value
```

Two dispositions, deliberately only two: `drop` (the key is absent from the
stored input) and `hash` (a stable digest, so idempotency and support
debugging still work without the plaintext). Anything not listed is stored as
today, so the change is opt-in per field and no existing capability moves.

**2. Enforce it in one place, on the write path.**

A single `redactForStorage(slug, input)` applied where `executionInput` is
built, before it reaches any of the four insert sites. One function, one call
site per path. The executor keeps receiving the full input — this governs
*storage*, not execution.

**3. Make the declaration provable rather than advisory.**

A CI gate in the shape the repo already uses:

- a capability whose `input_schema` names a field matching a sensitive-name
  pattern (`password`, `secret`, `token`, `ssn`, `personnummer`, `card`, …)
  and does not declare it in `sensitive_inputs` fails the check;
- a test that plants a sensitive input, runs the write path, and asserts the
  stored row does not contain the value — the planted-failure discipline from
  `feedback_prove_every_checker_by_planting`, so the guard cannot be green
  while doing nothing.

Without part 3 this is a comment. `password-strength` proves the point: the
claim was in the manifest for months and nothing checked it.

## What it costs

The write path is money-critical and already carries idempotency and
hash-chain integrity. Two questions had to be answered before code. **Both are
now answered, by reading the code on 2026-09-06, and both came back
favourable.**

**Does the audit hash chain cover `input`? Yes — and it does not matter.**
`computeIntegrityHashVersioned` puts `input` in the hashed payload
(`integrity-hash.ts`, the `base` object). But hashing is two-phase: the row is
inserted first, and `jobs/integrity-hash-retry.ts` later SELECTs it back and
hashes `txn.input` — *the stored column*, not an in-memory copy the route
handler kept. So a value redacted at write is the only value that column ever
holds, and therefore the only value ever hashed. The chain stays valid with no
special-casing.

This is strictly simpler than the problem the 90-day sweep had. That sweep
changes the value *after* it was hashed, which is exactly why it needed
`redacted_at` and a chain walker that skips recomputation for marked rows.
Write-time redaction needs neither.

**Does idempotency key off the input? No.** Replay comparison uses
`idempotency_fingerprint`, its own column, computed by
`computeIdempotencyFingerprint({task, capabilitySlug, inputs, rail, ...})` from
the incoming request before storage and compared by `isReplayable(stored,
incoming)`. Nothing reads `transactions.input` back to decide replay.
`hashInput()` exists in `do.ts` but feeds the audit body's `input_hash`, not
the idempotency decision.

One consequence worth stating: the fingerprint is itself a digest of the
inputs, so a `drop`-ped field still influences it. That is the desired
behaviour — two genuinely different requests stay distinguishable — and it
leaks nothing, a digest being all that is retained.

**So the remaining cost is the work itself**, not an unresolved integration
risk. It is also inert by construction: no manifest declares
`sensitive_inputs`, so shipping the mechanism changes no stored row until a
capability opts in.

## What I would not do

Encrypt-at-rest instead. It moves the problem to key management, still leaves
plaintext recoverable by anyone with the key, and does not let a capability
honestly say the value was never kept. `drop` is the only disposition that
makes a real claim possible.

## Recommendation

Worth building, but not urgent on today's volumes — 43 retained customer
inputs across five capabilities, all inside the 90-day window. The argument
for doing it is not the current exposure; it is that the catalogue cannot grow
into credential-shaped or document-shaped capabilities until it exists, and
that every such capability meanwhile ships with a limitation instead of a
guarantee.

The two blocking questions are answered above, so there is nothing left to
investigate. It is one batch, and the next session can start writing code:

1. `sensitive_inputs: {field: drop|hash}` in the manifest schema, beside
   `input_schema`, with the two dispositions and nothing else.
2. `redactForStorage(slug, input)` applied where `executionInput` is built,
   before it reaches any of the four insert sites in `routes/do.ts`. The
   executor keeps receiving the full input — this governs storage, not
   execution. Do NOT touch `computeIdempotencyFingerprint`, which runs on the
   request and must keep seeing the real values.
3. A CI gate failing any capability whose `input_schema` names a field matching
   a sensitive-name pattern without declaring a disposition for it.
4. A planted-failure test: submit a sensitive input, run the write path, assert
   the stored row does not contain the value — then plant the removal of
   `redactForStorage` and require the test to fail.

Why the sequencing was NOT "build it immediately" on 2026-09-06: two PRs were
already in flight, the generated inventory file had conflicted twice that day,
and a change touching every `/v1/do` write path is not something to land at the
end of a long session. The mechanism is inert until a manifest opts in, so
nothing is lost by starting it fresh.

## Decision needed

Build it, defer it, or reject it and accept that capabilities taking sensitive
input stay off the platform. Deferring is defensible; leaving it undecided is
what produced two disclosure corrections in two days.
