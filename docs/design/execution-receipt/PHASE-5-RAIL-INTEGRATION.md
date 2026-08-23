# Execution receipt, Phase 5 — rail integration and activation

Phase 4 built every artifact and deliberately wired none of it, and its own
reconciliation said the epoch was **not** structurally real: a transaction
inserted after that deploy was byte-identical to one from April. This phase
closes that, and the shape of the answer is the interesting part.

---

## 1. The decision that made everything else safe

The obvious way to activate receipts is to wire each rail's call site. There
are eight production sites that write `transactions` — four executors in
`routes/do.ts`, one each in `solution-execute.ts` and `x402-gateway-v2.ts`,
the internal harness, and the settlement reconciler — and no chokepoint. Eight
call sites is eight chances to forget one, and a forgotten one produces a row
with `receipt_status IS NULL`, which is **indistinguishable from a pre-epoch
row**. Silent, and permanently so.

So the activation is a database default, not a wiring exercise:

```sql
ALTER TABLE transactions ALTER COLUMN receipt_status         SET DEFAULT 'pending';
ALTER TABLE transactions ALTER COLUMN receipt_failure_reason SET DEFAULT 'not_yet_built';
```

plus a CHECK that a post-epoch row cannot have a NULL status. Every insert now
carries receipt state whether or not its author thought about receipts — including
inserts written after this PR by someone who never read it.

That inverts the risk of wiring all the rails at once. A rail nobody wired no
longer disappears; it produces a **visible `pending` row** that the sweeper
picks up and the backlog counter reports. Wiring everything became the low-risk
option rather than the high-risk one, which is why this PR does it in one pass
rather than staging one rail at a time.

Three properties make that claim hold, and each is tested:

1. **Receipts are built after the money transaction commits, never inside it.**
   A receipt cannot roll back a payment, extend a lock window, or turn a
   receipt bug into a billing bug.
2. **`settleExecutionReceipt` never throws.** A request that already executed
   and charged is never failed by a receipt problem. The honest outcome of any
   failure is "still pending".
3. **Failure is loud, and named.** A site that records no rail leaves
   `receipt_rail` NULL and the sweeper records `unmapped_rail` — already in
   Phase 2's closed reason set.

## 2. The defect the integration lane caught

Block 0109's first version defaulted `receipt_status` and nothing else. Block
0107 had already added `transactions_receipt_reason_required`: a row whose
status is `pending` or `failed` must say why.

Together, **every INSERT into `transactions` would have violated that CHECK** —
every `/v1/do` call, every x402 call, every internal harness tick, 500 on the
insert. The migration still applies cleanly, because the CHECK is `NOT VALID`
and existing rows are never scanned. Production would simply have stopped being
able to write.

93 integration tests failed on it, in suites with nothing to do with receipts.
**The entire unit suite was green.**

Confirmed against production read-only afterwards: the constraint exists there,
`NOT VALID`, with exactly that definition. This was not a test artifact.

Two things changed so a catalog query cannot claim this is fine again:

- 0109 defaults **both** columns.
- 0109 **proves the pair works by doing what production does** — a plpgsql
  subtransaction inserts an ordinary row (the same shape `/health/deep` has
  used 507 times in production) and unwinds it. A violation aborts boot, and
  Railway does not cut over a failed deploy, so the previous commit keeps
  serving. Fail-before verified by dropping the reason default: the block
  refuses and names the constraint.

Dropping that default also exposed the block as **unrepairable** — defaults and
epoch were guarded together, so a hand-drop was skipped forever while the block
reported success. Defaults are now unconditional and self-healing; only the
epoch instant stays guarded, and re-running does not move it (verified).

## 3. Why two more columns exist (block 0110)

Writing the sweeper exposed a soundness problem with the obvious
implementation:

- **The rail is not recoverable from the row.** A sweeper would have to guess —
  `x402` from `payment_method`, `internal` from the system user id — and a
  guess has no business inside a commitment.
- **The deploy commit drifts.** `resolveDeployCommit()` answers for the process
  asking, so a receipt rebuilt after a deploy binds the code running *now* to a
  result produced by the code that ran *then*. The digest would verify
  perfectly against the wrong implementation identity.

Both are captured at INSERT and `settle.ts` prefers them over anything ambient.
This makes the request path more correct too, not just the sweeper.

## 4. The ten acceptance criteria

| # | criterion | outcome |
|---|---|---|
| 1 | `RAILWAY_GIT_COMMIT_SHA` on every deploy path | **Verified, and it found something.** See `PHASE-5-DEPLOY-IDENTITY-EVIDENCE.md`: 994/1000 deployments carry a full 40-hex commit; redeploy is 25 for 25, and Railway expresses rollback as redeploy. The six that carry nothing are `repo: null` CLI upload deploys from 2026-04-05/06, four of which **served production**. |
| 2 | `assertDeployIdentity()` wired pre-listen | Done, before any database work. Refusal unweakened: a refused boot costs a deploy, not an outage. |
| 3 | Receipt lifecycle in every rail | All eight production write sites. The source lint is **file-granular** - it passes a file if `settleExecutionReceipt` appears anywhere in it - so it catches a new unwired FILE, not a new unwired branch inside `do.ts`. The epoch default is the real backstop for that, and it works. |
| 4 | Every post-integration transaction gets receipt state | Structural, via the default + CHECK. Not a convention. |
| 5 | `redacted` receipt-state presentation | Arm added to `describeReceiptState`. **Not yet reachable**: nothing serves receipt state on any endpoint, so this is the presentation being correct when a surface exists, not a surface. Surfacing is Phase 6/7. Separately, `settle` now refuses to hash content that was already erased. |
| 6 | Retry sweeper, bounded, visible | In the worker that already owns "finish what the request path could not", outside its transaction. |
| 7 | `CapabilityDeclarationSource` parity guard | Added — and it found **31 of 45 columns had never been classified**. |
| 8 | `data_update_cycle_days`, `dataset_last_updated`, `name` | All three admitted, derived from execution semantics. Plus `data_classification` and `x402_method`. |
| 9 | FK decision | Added, with reasoning: it can never break, because DELETE and TRUNCATE on snapshots are already refused by triggers. |
| 10 | Per-rail behavioural tests | Receipts rebuilt **from the HTTP response body** and compared to the stored digest. |

### On criterion 8, the reasoning rather than the answer

Three tests separate an execution-relevant column from an excluded one, and
only the first two admit it:

1. does it change what the execution **computed**?
2. does it change what we **recorded** about the execution?
3. does it merely decide whether the execution was **allowed to happen**?

(3) is admission control, and it is excluded on purpose: a refusal is not an
execution, and when a request *is* served the column had no bearing on the
answer. `cost_class`, `is_active`, `quota_*` and the x402 enable flag all sit
there.

`data_update_cycle_days` and `dataset_last_updated` are in because
`require_fresh` **refuses** a grade-C request outright — they decide whether a
request is served. `name` and `data_classification` are in because
`routes/do.ts` writes `data_source: capability.dataSource ?? capability.name`
and `data_classification` into the audit body: for a capability with a null
`data_source`, the name *is* the recorded provenance source.

## 5. Rail coverage

| rail | where | how it is proven |
|---|---|---|
| `v1_do` | 4 executors in `do.ts`, `solution-execute.ts` | Route-level: real `POST /v1/do`, digest rebuilt from the response body. Paid sync, free tier, and a deliberate executor failure. |
| `x402` | `x402-gateway-v2.ts`, `settlement-reconciler.ts` | Settle boundary, with the call deliberately lying about the rail to prove the row's recorded value wins. |
| `internal` | `lib/test-runner.ts` | Same. **99.3% of production traffic** (9,938 of 10,004 rows in 24h), so leaving it unwired would have meant almost every post-epoch row pending forever. |
| `mcp`, `a2a` | — | **Deliberately unreachable.** `routes/a2a.ts` proxies to `/v1/do` over loopback and `routes/mcp.ts` only serves the catalog, so the only way to record them would be a caller-supplied header. A forgeable rail has no business inside a commitment, so they stay in the enum and unpopulated. |

## 6. Evidence

- **292 integration tests** against real Postgres, all passing, with the
  startup migrations applied exactly as boot applies them.
- **Unit lane: 2,871 passing** on a fully green run. The lane is
  nondeterministic on this machine — repeated runs fail different files
  (`internal-auth`, `public-trust`, `verify`, the SQS smoke test), all of which
  pass in isolation. This is the cross-file env-leak pattern the repo already
  documents in `do.idempotency.integration.test.ts`. **CI is the arbiter**, not
  this machine.
- **12 mutations through the repo's guard** (`mutation-test.mjs`), every one
  green → red → green:
  - settle binds a null result instead of the served output → caught
  - the caller-supplied rail wins over the row's → caught
  - settle reads the environment instead of the row's commit → caught
  - the sanitised caller error is replaced by a constant → caught
  - `settleReceiptFor` becomes a no-op for every `/v1/do` rail → caught
  - the sweeper stops restricting itself to settled transactions → caught
  - the coverage lint stops detecting an unwired rail → caught
  - `name` / `data_classification` silently leave the digest → caught
- **Two mutations SURVIVED first** and are the more useful record:
  1. Removing the sweeper's `status IN ('completed','failed')` filter changed
     nothing. Without it the sweeper burns an attempt every tick on a
     transaction that has not settled, and after five ticks a **still-executing**
     transaction carries a terminally failed receipt. Now tested.
  2. Disabling the coverage lint's detection entirely left it green — a source
     lint over a clean repository finds nothing, and "found nothing" is
     indistinguishable from "cannot find anything". It now has positive
     controls on inputs we construct.

A third mutation was mis-reported twice before the cause was found: `do.ts` is
stored CRLF, so a multi-line `--find` never matches and the guard refuses. Only
single-line finds are reliable against that file.

## 6a. Independent adversarial review — round 1: FAIL

Four blocking findings, every one reproduced. They are recorded here rather
than edited away, because three of them were invisible to a green suite and the
fourth was invisible to a green suite *and* to a fix that looked correct.

| # | finding | how it was caught |
|---|---|---|
| **B1** | The receipt bound the **internal** error, not the one the caller received. `settle` read `transactions.error`, and its comment asserted the sanitiser had already run. True on two rails; false on the `/v1/do` capability rails, which store the raw `err.message` and sanitise on the way out. A party holding the request and the response could not recompute the digest. | Measured against production: **5,016 of 33,952 failed rows over seven days (14.8%)** differ. |
| **B2** | Solution receipts marked steps that **never ran** as `ran`, with a manifest digest. `execResult.steps` is keyed by every *declared* step — `markSkippedByGate` and three siblings insert a placeholder deliberately, so a bundle advertising 14 steps does not audit 13 with no gap marker. | Reproduced with a real gated 2-step solution: both steps came back `ran`. |
| **B3** | `execution.method` was falsified toward "no model involved". `do.ts` maps a `mixed` capability to the marker `hybrid`, which is not one of the three methods, so the fallback recorded `algorithmic`. | **8,010 of ~193,600 production rows over 30 days (4.1%).** |
| **B4** | One un-updatable row halted the tamper-evident chain **permanently** — Phase 4's round-3 blast radius in a new shape. The post-epoch CHECK is `NOT VALID`, which still enforces on UPDATE, so the worker cannot update a row it admits; the tick is one transaction. | Reproduced: two healthy rows stopped chaining the moment a third existed. |

### The two things worth carrying forward

**My own test is why B1 survived.** The criterion-10 failure test was written
correctly — it rebuilds from `body.details.error` — but its fixture threw
`"p5 deliberate executor failure"`: no URL, no hostname, no provider name, no
network code, so `sanitizeFailureReason` was the identity function on it. The
test's own comment said "the sanitised message the caller sees and the raw
message we logged are different strings" while the fixture guaranteed they were
the same. It now throws a message the sanitiser rewrites, and **asserts the two
differ** before asserting which was bound.

**My first fix for B4 was wrong in an instructive way.** A hand-written
`SAVEPOINT` / `ROLLBACK TO` rolled back correctly and later statements
succeeded — and the transaction still failed *at commit* with the original
error, because postgres-js tracks the query error on the connection and catching
it in JS is not enough. Only the new test caught that; the code read as correct.
Drizzle's nested transaction does it properly, and both behaviours were proven
with a minimal probe before choosing.

### Fixes, each with fail-before proof through the repo guard

| mutation | result |
|---|---|
| the receipt binds the raw stored error again | **caught** |
| the solution rail treats every declared step as having run | **caught** |
| `hybrid` maps to `algorithmic` again | **caught** |
| an unestablished method falls back instead of refusing | **caught** |
| the chain tick stops isolating a failing row | **caught** |

Block 0109 is additionally now **one atomic statement**. Blocks autocommit per
statement, so a probe refusal previously left the defaults committed while boot
aborted — and the previous deployment would then serve *with* the new defaults
and *without* the sweeper, so nothing would ever chain. Verified end to end:
with a hostile CHECK armed the block refuses and applies nothing; disarming it
restores the defaults with the epoch instant unchanged.

## 6b. Independent adversarial review — round 2: PASS

Narrow, on the round-1 fixes and their blast radius. **No blocking findings.**
All four fixes were confirmed correct by independent mutation (each green → red
→ green), and the reviewer measured rather than argued the two claims that
mattered most:

- **F1 idempotency.** All **541 distinct production failure messages** run
  through `sanitize(sanitize(x)) === sanitize(x)`: **zero non-idempotent**. Raw
  differs from sanitised on 73 distinct strings / 40,408 rows (14.3% of
  283,394), corroborating the 14.8% figure from round 1. No clock, locale or
  environment dependence — so a receipt stays recomputable years later.
- **F3 corpus.** Every value that reaches `transactions.transparency_marker` in
  production — `algorithmic` 923,676, `ai_generated` 1,910, `mixed` 239,
  `hybrid` 220, no NULLs, no `unknown` — maps or refuses correctly, and
  `test-runner.ts`'s new mapping is character-for-character `getTransparencyMarker`.
- **F4a beyond one error class.** The reviewer additionally proved isolation
  holds for a `lock_timeout` (55P03) inside the nested transaction, not just a
  CHECK violation — which directly falsifies the failure mode the hand-written
  SAVEPOINT hit.
- **F4b atomicity** independently reproduced with a hostile probe: neither
  `SET DEFAULT` survived the refusal, and the epoch was unchanged after
  recovery.

### Fixed from round 2's non-blocking set

| # | finding | fix |
|---|---|---|
| **N1** | The chain-halt test's `DROP CONSTRAINT` sat outside its `try`, so a throw before the re-`ADD` left the `finally`'s own DROP failing, swallowed the real error, and **stranded the shared test database with no post-epoch invariant** for every later suite. Reproduced. | DROP moved inside the `try`; the restore uses `IF EXISTS`. |
| **N3** | Both new refusals used `internal_error`, which is **retryable** — so a deterministic condition burned five sweeper attempts, held the row out of the chain for ~30 minutes, and put five entries in a counter `receipt-lifecycle.ts` reserves for real signals. | The unresolvable-method refusal is now `unresolvable_manifest`, which is terminal and honest: the declaration was read and does not establish a required member. |
| **N8** | The refusal test asserted `not.toBe("complete")`, which `pending` also satisfies — and pending was what actually happened. The assertion agreed with the test's name while the behaviour did not. | Asserts `failed` and the reason. |
| **N7** | "A full run and a gate-tripped run do not share a digest" hand-builds both arrays and calls `declarationDigest` directly — it **passed under the mutation that broke the rail**. | Renamed to say what it is, and its teardown no longer depends on a sibling test having run. |
| **N2** | The `schema.ts` comment claimed the `.default()` additions protected the epoch instant from `drizzle-kit push`. They do not: push also drops the epoch CHECK, the reason-required CHECK and the FK, and the next boot mints a fresh epoch (**observed moving 13 minutes across one push**). | Comment corrected to state the real limit. No production path runs push. |
| **N4** | The `toReceiptError` docblock claimed the contract now holds "for every rail". Three failure branches still store one string and serve another shape — an x402 settlement failure serves a different error *code*, an x402 solution failure serves the message *wrapped*, and the no-steps solution path serves no `details.error` at all. **All three have zero occurrences in production history.** | Claim narrowed to what the evidence supports, with the three paths named. Each needs a route-level change, not a change to this function. |

### Carried as residual risk, not fixed

- **N5 — `sanitizeFailureReason` is idempotent in practice, not in principle,
  and leaks a hostname.** The network-error and `fetch failed` branches return
  early with a prefix captured *before* URL stripping, so a message like
  `GET https://internal.example.com/x — getaddrinfo ENOTFOUND ...` keeps the
  hostname on pass 1 and loses it on pass 2. Unreachable across all 541
  production strings, so F1's idempotency holds for the corpus it was measured
  against — but **the hostname leak is a real, pre-existing defect in the
  customer-facing sanitiser, independent of this branch**, and is filed
  separately.
- **N6 — settle-time sanitisation is temporally coupled to `sanitize.ts`.** The
  sweeper can settle up to ~30 minutes after the response; if `sanitize.ts`
  changes in between, the receipt binds a string the caller never saw. The
  effect is a receipt that cannot be recomputed, never one that is wrong.
- **N9 — the 5s settle deadline is a timeout without cancellation.** The timer
  is cleared correctly and nothing escapes the catch, but an abandoned
  `settleOrThrow` keeps its pooled connection. Under sustained database
  slowness these accumulate. No corruption is possible: every lifecycle write
  is guarded on `receipt_status = 'pending'` with `assertTouchedOne`, and the
  snapshot writer is `ON CONFLICT DO NOTHING`.

### One thing the reviewer verified that is worth stating positively

The redaction guard is well-targeted rather than speculative. Of 149,616 failed
rows with a NULL `error`, **149,615 are redacted** and exactly **one** is a live
non-redacted row in 30 days. Without the guard those rows would have produced a
receipt that verifies against *"this completed execution returned null"*.

## 7. Production reconciliation plan

Read-only, after deploy, by database object rather than by log line
(DEC-20260504-C).

1. `GET /health` serves the merge commit.
2. Both defaults present: `receipt_status` → `'pending'`,
   `receipt_failure_reason` → `'not_yet_built'`.
3. `transactions_post_epoch_has_receipt` exists; read the epoch instant out of
   `pg_get_constraintdef` and record it — that constraint is the only record of
   when enforcement began.
4. `transactions_receipt_manifest_digest_fk`, `receipt_rail_closed` and
   `receipt_deploy_commit_shape` present.
5. **Writes still work**: `count(*) FROM transactions WHERE created_at > <deploy>`
   is non-zero and rising. This is the check that would have caught §2, and it
   is first among equals.
6. Receipt state is being produced: `receipt_status` grouped by value, and by
   `receipt_rail`. Expect `complete` to dominate and `internal` to be ~99% of
   the volume.
7. `receipt_deploy_commit` equals the deployed commit on new rows — full 40 hex,
   not the sentinel.
8. Snapshot table is filling and deduplicating: fewer rows than transactions.
9. **The chain has not stalled**: `compliance_hash_state` distribution over the
   last hour, compared against the pre-deploy baseline of 3 pending in 10,001.
10. `receipt_status = 'failed'` grouped by reason. Non-zero is an alert, not a
    curiosity — it means executions are happening that cannot be committed to.

### Backlog (DEC-20260504-B)

Not a bulk-operation resumption. Both ALTERs are catalog-only, the CHECK and FK
are `NOT VALID` so neither scans 925,563 rows, and production carries **zero**
rows with receipt state, so the sweeper starts from an empty backlog. Steady
state is ~10,000 transactions/day against a sweeper capacity of 100 rows per
30-second tick — 288,000/day, 28× headroom.

## 8. Residual risks

1. **A CLI upload deploy will now refuse to boot.** Deliberate, and the refusal
   message names the cause and the fix. Production keeps serving the previous
   deployment. Four such deploys served production in April 2026, so this is a
   real path someone could take.
2. **A pre-existing platform mismatch, recorded not fixed.** The Railway
   healthcheck retry window is 20s while `STARTUP_DB_RETRY_BUDGET_MS` is 600s,
   so a deploy during database degradation is killed long before the budget
   applies. The `index.ts` comment claiming `healthcheckPath: null` was stale
   and is corrected. The fix is the Railway setting, not the code.
3. **`pending` is now a short-lived state**, so the `integrity-hash-receipt-blocked`
   counter's remaining population is transactions wedged at a non-terminal
   status. Narrower than before, and worth watching for the first week.
4. **The declaration is re-read at settle time**, so a capability row edited in
   the milliseconds between execution and settlement would be recorded as the
   declaration in force. `capabilities` rows are written by onboarding and
   operations, not per request.
5. **`mcp` and `a2a` remain unreachable.** Recording them needs a
   non-forgeable server-side signal, which does not exist today.
6. **Snapshot growth is unbounded and permanent** by design.
7. **`NOT VALID` constraints** are enforced for new writes only.
8. **Receipt state is not served anywhere yet.** `describeReceiptState`,
   `receiptHealthCounts` and `selectPendingReceipts` have no production callers;
   the monitoring in §7 item 10 is a query an operator runs, not an alert that
   fires. Both are Phase 6/7.
9. **The rail-coverage lint is file-granular** (see criterion 3 above).
10. **`canonicalization_error` is caller-reachable.** `MAX_DEPTH = 512` in the
    canonicaliser, so caller-supplied `inputs` nested deeper than that make a
    paid execution permanently receipt-less. Terminal by design; the depth is
    far beyond any real payload, but it is reachable on purpose by an adversary.
11. **The declaration re-read window is wider on the sweeper path** than the few
    milliseconds of the request path — up to about half an hour across five
    attempts, which could span a `capabilities` write.
12. **`source_observation.kind = "dataset"` is unreachable**, and solutions
    always report `none_declared` because `freshness_category` is null on a
    solution transaction. Phase 2 expects `none_declared` to dominate at the
    epoch and shrink; this is the shape of that.
13. **x402 solution receipts are not caller-recomputable**: the row stores
    `{steps, errors}` while the response omits `errors` when empty, so a holder
    of the response cannot unambiguously reconstruct the hashed object. The
    capability path on that rail is unaffected.
