Intent: Preserve all money-path behaviour while sharing x402 settlement, typing request context and splitting do.ts; leave the uncommitted build for orchestrator review and real-Postgres verification.

# H7b — do split and settlement

Branch: `refactor/h7b-do-split-and-settle`, based on `origin/main` at
`d8eb0c52`. No commit, push, PR, merge, deployment, package publication,
production write or credential search was performed. The task-specific
no-commit instruction overrides the generic build-agent commit instruction.

Evidence: [test-run receipt](../../../archive/receipts/2026-10-28-test-run-h7b-do-split-and-settle.json).
The receipt records an uncommitted working tree, not a shipped commit.

## What changed

- `lib/x402-settle.ts` owns intent creation, the irreversible facilitator call
  and intent result recording. Every former copy uses it. Its discriminated
  `v1_do`/`gateway` policy preserves direct versus claimed intent opening and
  ambiguity handling. The gateway callback changes its `finally` release
  flag at the original points, including thrown calls; returning a flag after
  settlement would have changed exception behaviour.
- `types.ts` extends the existing Hono `AppEnv.Variables` with typed attribution,
  request context, payment handle/hash/flag and free-tier usage. `/v1/do` and
  dispatch use typed `Context<AppEnv>` reads with no context `as any` casts.
  Existing auth/key/logger types remain in use. The gateway had no context
  reads to replace. No middleware setter or middleware order changed.
- `lib/do/dispatch.ts` holds the four dispatch functions and background worker,
  retry/timeout/receipt and usage-summary helpers. All five execution functions
  now take a typed options object. `audit.ts`, `idempotency.ts`, `upgrade.ts`
  and `types.ts` hold the other cohesive blocks. Input validation and routing
  stay top-to-bottom in the route. Existing exported test seams are re-exported.
- Structural tests follow the moved code. Settlement-order and billability
  guards recognize both direct facilitator calls and the new shared function;
  invocation guards verify route-to-dispatch wiring rather than exempting it.
  No migration block or ledger entry changed.

| File | Before | After |
|---|---:|---:|
| `apps/api/src/routes/do.ts` | 3133 | 824 |
| `apps/api/src/routes/x402-gateway-v2.ts` | 2228 | 2174 |

A mechanical comparison of every function body against the typed pre-move
intermediate passed (comments and relative import depth normalized). The
independent technical reviewer also compared original/main bodies and options
mapping. The full split remained reviewable as moves, so none was deferred
under the change-size escape. The extracted dispatch module can be subdivided
later if needed; this batch does not change its execution flow.

## Copy-by-copy difference inventory

Compared the original settle blocks at `do.ts:1482–1568`, gateway solution
`:1496–1586`, and gateway capability `:1957–2053`, plus their surrounding
record/replay/catch paths. These are **origin/main line references**; the code
now lives in the modules above. Provenance: H4 `377c4519` / PR #779 for claim
handling; WP5/CCO/CRIT comments at the named sites for older policies.

| Copy | Difference from the other copies | Intended or accidental; evidence and preserved handling |
|---|---|---|
| All | Execute and assess billability before intent, settle before terminal recording | Intended DEC-14/WP5; all use the shared function only after existing billability gates. |
| Gateway capability vs solution | Settlement control flow is identical; local variable `cap` vs `sol`, `solutionSlug: null` vs `sol.slug`, corresponding slug/EUR/USD price | Intended identity distinction in original intent/record arguments; explicit `intent` options. |
| `/v1/do` | Direct `openIntent(db, ...)`, no claim lock; gateways call `openClaimedX402Intent(claimId, ...)` | Looks accidental: H4 added the pre-execution claim to the gateway only. Preserved (`H7b-FINDING` 1). |
| `/v1/do` | Optional hash is `undefined`, gateway hash starts `null`; all skip intent on a falsy hash | Existing conditional behaviour, preserved; no new validation. |
| `/v1/do` | Intent omits USD price; gateways supply `x402PriceUsd`. All supply EUR cents; solution intent carries its solution slug | Intended: `openIntent` priceUsd documentation explicitly permits the omission because CapabilityInfo lacks it. |
| `/v1/do` | Uses its existing DB handle; gateway opens/locks through the claim helper and obtains `getDb()` for each intent transition | Intended transaction boundary under H4; kept in the discriminated policy. |
| Gateways | Set `releaseClaim=false` immediately before settle; restore true only on confirmed invalid (not unknown); finally releases using executionStarted | Intended H4 fence against ambiguous/late settlement. `/v1/do` has no flag/finally claim release. |
| `/v1/do` | Calls markFailed on every non-success-with-id result, including settlementUnknown; gateways leave unknown intents settling | Looks accidental relative to H4 ambiguity protection; preserved (`H7b-FINDING` 2). |
| All | valid=true without a settlement id still marks an intent failed when settlementUnknown is absent, then returns success; invalid with no error uses the same fallback reason | Existing boundary behaviour pinned in snapshots; no tightening of facilitator-result handling. |
| `/v1/do` | Invalid settlement writes failed transaction with raw error, latency and completion date, then receipt; returns 402 with error_code/payment_failed, message, details and detail | Established route envelope and ledger pattern; retained in caller. Gateway returns its existing 402 error/details/detail and lets finally release a confirmed-decline claim. |
| Gateways | Successful settlement id adds X-Payment-Response using the existing encoder; `/v1/do` does not | Established route protocol; header remains in each gateway caller. |
| `/v1/do` | Missing success id normalized to null; gateways keep undefined | Existing local representation and conditional writes, unchanged. |
| `/v1/do` | Completes the already inserted row, builds full audit, writes receipt before markRecordedBySettlement | Existing route sequence; its post-settle failures reach the execution catch (`H7b-FINDING` 3/4). |
| Gateways | Await recordX402Transaction; cost persistence and best-effort mark-recorded precede receipt; recording failure logs and captures orphan when an id exists, then returns success | Intended CCO P0 #12/WP5 recovery policy. Shared settlement stops before this route-specific recording boundary. |
| Gateway capability | Rich capForAudit, post-insert audit rebuild with separate logged catch, result.output and local measured latency | Intended CRIT-8. Solution has a documented lean aggregate audit, mixed tag, steps/errors and result.latency_ms. |
| Gateway solution | Success response includes solution/steps, optional errors, step_count; capability spreads output and carries provenance | Intended established response shapes, snapshots preserve both. |
| Gateways | Replay completed hash returns cached output without execution/settlement; in-progress/failed returns 502; capability vs solution metadata/body differ; replay has no payment response header | Intended C9/H4, preserved before shared settle. `/v1/do` re-executes before the existing terminal-intent guard refuses reuse (`H7b-FINDING` 1). |
| `/v1/do` | Paid success still returns free_tier=true, price_cents=0 and upgrade text; stored priceCents remains zero, though paymentMethod/isFreeTier change when id is present | Looks accidental reuse of free-tier response/row; preserved (`H7b-FINDING` 5). Gateway records catalog price. |
| Capability vs solution | With a valid result but no settlement id, capability labels response payment free; solution labels it x402 with price | Existing conditional envelope difference; preserved and pinned, not silently unified. |
| `/v1/do` | Thrown intent/facilitator/bookkeeping error enters execution-failed catch; gateway throws to Hono after its finally | Existing exception boundaries, preserved. Gateway intent/record/orphan log event names remain in original helpers. |

## H7b-FINDING — existing behaviour, not fixed

1. **No claim/replay guard on `/v1/do` x402.** Replaying a successful hash
   executes again before the terminal intent refuses settlement, returning 500
   rather than cached success. The gateway retains H4's claim-before-execution,
   at-most-two execution budget, unknown-settlement fence and stale-claim
   janitor. Do not infer that H4's protections existed on `/v1/do` x402.
2. **Ambiguous `/v1/do` settlement is marked failed.** Gateway preserves
   settling/ownership for reconciliation; legacy do permits failed-intent
   reopening. Explicit policy preserves the difference.
3. **`/v1/do` terminal write failure after settlement has no transaction-level
   orphan capture.** It returns 500 and writes a failed row through the execution
   catch, potentially counting the storage failure against capability health.
   Its settled intent remains for reconciliation. Gateway preserves orphan
   recording and a successful response. Shared markSettled's own orphan capture
   still runs on all three paths when the intent transition fails.
4. **`/v1/do` mark-recorded failure overwrites the completed row as failed.**
   Payment already moved; the response is 500. Gateway logs
   `x402-intent-mark-recorded-failed` and keeps success.
5. **`/v1/do` paid x402 result/price still looks free.** Both its response price
   and stored price remain zero; response free_tier remains true. The settlement
   call still charges the verified catalog payment.

Each finding has an adjacent `// H7b-FINDING:` comment in shared settlement or
moved dispatch. Orchestrator decides separate fixes; none is an H7b behaviour
change.

## Verification

Detailed commands/results and skipped file list are in the linked receipt.
The characterization tests ran successfully on unchanged `origin/main` before
production edits. They pin full response bodies, status, headers, transaction
and intent writes, orphan rows, log names, and ordering for each copy. They use
real intent/claim functions and real Drizzle predicates with a simulated DB;
raw SQL binds are checked for Date/Buffer. They are not a substitute for
Postgres locking/rollback/uniqueness tests.

Fail-before: a scratch copy skipped the intent write; all three route success
checks failed at the intent-before-settle assertion. The production helper was
never changed, and scratch files were removed. No stash or branch switch.

The first full suite found two location-dependent guards still reading do.ts
(cost persistence and the transaction timeout). Both were retargeted, not
weakened. No flaky file was identified. The final full suite passed: 374 files,
7,579 tests; 35 files and 358 tests skipped. Of those skipped tests, 354 need
the test Postgres harness; four are explicit existing solution-executor skips.
After the fixture portability fix, the same snapshots passed against both
original route copies and current routes (66 tests). The initial pre-edit
characterization passed 33 tests; skipping intent creation failed all three
route success cases as expected. Counts and commands are backed by the receipt.

Independent review: technical GO, contract GO with a portability nit, on the
uncommitted tree based on d8eb0c52, one round. The contract review's medium
finding was fixed: ordering guards recognize direct and shared settle calls,
with positive controls. Its low portability nit was addressed by pinning
wire-visible environment inputs in the characterization fixture. The go skill
was applied for verification/review only. The simplify skill was unavailable;
a manual scope/simplicity pass retained the mechanical boundaries.

## Remaining work and production boundary

- Orchestrator reviews this uncommitted tree, runs the Postgres suites using
  the repository's test-database harness, then owns commit/push/PR/merge.
  There is no production migration or data-write command for H7b.
- No live paid probe was run: it would move money. No live-check output is
  claimed. Existing production state and deploy behaviour were not verified.
- H7a is shipped (PR #787); the boot-lock retry fix is shipped (PR #790).
  Remaining H7: H7c fixture contract tests; migrations per-block file split
  with ledger hashes unchanged; a separate ledgered SQS column drop; and an
  applied-block-hash skip. These are not bundled into this refactor.
- No external Journal/Notion write was made in this local build-agent task.
  This handoff is the orchestrator's continuation record.

## Check matrix and database skips

All commands below ran from the repository root unless a working directory
is stated. The receipt contains the run details, including earlier failures.

| Check | Result |
|---|---|
| `npm run handoff:orient` | PASS |
| `npm --workspace=packages/mcp-server run build` (once) | PASS |
| `cd apps/api && npx tsc --noEmit` | PASS, including closeout rerun |
| Full `apps/api` Vitest suite | PASS: 7,579 passed, 358 skipped |
| Characterization on original/current route copies | PASS: unchanged snapshots, 66 tests |
| Scratch intent-write omission | Expected FAIL: three route success tests detect the change |
| Focused route suite / moved-code guards / cost guard rerun | PASS: 110 / 107 / 7 tests respectively |
| Settlement ordering with direct-call positive controls | PASS: 13 tests |
| Mechanical function comparison | PASS: 24 bodies |
| `git diff --check` | PASS |
| Migration file and ledger diff | Unchanged |
| `npm run claims:check` | PASS |
| `npm run models:check` | PASS |
| `npm run env:check` | PASS |
| `npm run docs:check` | PASS |
| `npm run programs:check` | PASS |
| `npm run receipts:check` | PASS, including the new receipt; 19 pre-existing handoff warnings |
| `npm run migrations:check` | PASS |
| `node apps/api/scripts/check-no-bare-catch.mjs apps/api/src` | PASS |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS |
| `node --test apps/api/scripts/check-framework-packages.test.mjs` | PASS |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | Exit 0; sibling frontend absent, internal check skipped |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node apps/api/scripts/check-no-unguarded-user-fetch.mjs` | PASS |
| `node apps/api/scripts/check-no-new-console.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |

The exact skipped files follow. Integration files require a loopback
`DATABASE_URL_TEST`; none was supplied and no credentials were sought. The
orchestrator must run these on real Postgres, particularly wallet concurrency,
reservation, crash recovery, idempotency, claims and settlement recovery.

| File | Skipped tests |
|---|---:|
| `apps/api/src/jobs/integrity-hash-chain.integration.test.ts` | 8 |
| `apps/api/src/jobs/job-migration.integration.test.ts` | 12 |
| `apps/api/src/jobs/onboarding-retry.integration.test.ts` | 10 |
| `apps/api/src/jobs/partial-quarantine.integration.test.ts` | 8 |
| `apps/api/src/jobs/quality-floor.integration.test.ts` | 9 |
| `apps/api/src/jobs/settlement-recovery.integration.test.ts` | 7 |
| `apps/api/src/routes/a2a-error-leak.integration.test.ts` | 4 |
| `apps/api/src/routes/account-lifecycle.integration.test.ts` | 26 |
| `apps/api/src/routes/api-keys.integration.test.ts` | 24 |
| `apps/api/src/routes/billing-parity.integration.test.ts` | 6 |
| `apps/api/src/routes/capabilities-contract.integration.test.ts` | 14 |
| `apps/api/src/routes/capabilities.integration.test.ts` | 8 |
| `apps/api/src/routes/do.crash-recovery.integration.test.ts` | 5 |
| `apps/api/src/routes/do.idempotency.integration.test.ts` | 6 |
| `apps/api/src/routes/do.receipt.integration.test.ts` | 8 |
| `apps/api/src/routes/do.spend-cap.integration.test.ts` | 7 |
| `apps/api/src/routes/do.usage-summary.integration.test.ts` | 2 |
| `apps/api/src/routes/do.wallet-concurrency.integration.test.ts` | 3 |
| `apps/api/src/routes/example-output-curation.integration.test.ts` | 6 |
| `apps/api/src/routes/solution-receipt.integration.test.ts` | 2 |
| `apps/api/src/routes/solution-reservations.integration.test.ts` | 9 |
| `apps/api/src/routes/transactions.audit-leak.integration.test.ts` | 8 |
| `apps/api/src/routes/webhook.integration.test.ts` | 12 |
| `apps/api/src/lib/catalogue-copy-0123.integration.test.ts` | 1 |
| `apps/api/src/lib/job-coordinator.integration.test.ts` | 30 |
| `apps/api/src/lib/manifest-sync-scope.integration.test.ts` | 4 |
| `apps/api/src/lib/manifest-text-sync.integration.test.ts` | 3 |
| `apps/api/src/lib/public-descriptions-0124.integration.test.ts` | 1 |
| `apps/api/src/lib/solution-executor.test.ts` | 4 |
| `apps/api/src/lib/vendor-control-tower.integration.test.ts` | 7 |
| `apps/api/src/lib/wallet-reservations.integration.test.ts` | 15 |
| `apps/api/src/lib/wallet-service.integration.test.ts` | 8 |
| `apps/api/src/lib/x402-payment-claims.integration.test.ts` | 2 |
| `apps/api/src/lib/receipt/execution-receipt.integration.test.ts` | 40 |
| `apps/api/src/lib/receipt/receipt-chain-junction.integration.test.ts` | 9 |
| `apps/api/src/lib/receipt/receipt-invariants.integration.test.ts` | 30 |

`npm run handoff:check` returns exit 1 as expected for the supplied build-agent
checkout: uncommitted work, the feature branch occupying the supplied checkout
instead of trunk, no branch-specific upstream, an existing detached sibling
worktree, and existing merged local/remote branches. Its automatic origin
fetch failed, so remote cleanup findings may be stale. No branch, sibling
worktree or remote was altered. The task expressly leaves commit/push and
repository cleanup to the orchestrator; this is a recorded gate failure, not
a claim that the gate passed. Temporary comparison and mutation files were
removed before delivery.

## Orchestrator additions

- Independent review (separate read-only agent, same provider): GO. The real-Postgres integration lane passed 354 of 354 tests on this branch and on origin/main. No assertion was weakened. On the reviewer's LOW note, the executor-parity guard now scans `routes/do.ts` as well as `lib/do/dispatch.ts`.
- CR-19 client-IP provenance was re-checked against production on 2026-10-28. Forged `X-Forwarded-For` and `X-Real-IP` still do not change the IP the API sees: Railway's edge overwrites them. The 2026-09-02 answer holds. Receipt: [verify-ip re-check](../../../archive/receipts/2026-10-28-audit-verify-ip-proxy-hops-recheck.json).
- Next: a follow-up that gives x402 payments arriving at `/v1/do` the gateway's H4 claim and replay protection, or routes them to the gateway (H7b-FINDING 1 to 5).
