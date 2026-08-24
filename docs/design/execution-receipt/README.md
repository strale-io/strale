# Execution receipt — programme status

**All phases ACCEPTED. Rollout closed 2026-08-24.**

No further rollout work is required unless a new defect is found.

| phase | scope | status | record |
|---|---|---|---|
| **1–3** | Current-truth audit, `strale.execution.v1` specification, RFC 8785 canonicalisation with committed conformance vectors | **ACCEPTED** | `PHASES-1-3-ACCEPTANCE.md`, `PHASE-1-CURRENT-TRUTH.md`, `PHASE-2-SPEC.md` |
| **4** | Receipt authority, immutable manifest snapshots, chain v2 | **ACCEPTED** | `PHASE-4-RECONCILIATION.md` |
| **5** | Rail integration and activation | **ACCEPTED** 2026-08-24 21:20 UTC | `PHASE-5-RAIL-INTEGRATION.md` §9, `PHASE-5-DEPLOY-IDENTITY-EVIDENCE.md` |

## What exists now, in production

A Strale-owned, independently recomputable commitment binding a specific
request to the specific result Strale returned. Every transaction created after
the epoch carries receipt state; every completed receipt records the
implementation that produced it; and the tamper-evident chain commits to the
receipt digest.

- **Epoch:** `2026-08-24 20:32:58.705669+00`, chosen once and held in the
  definition of `transactions_post_epoch_has_receipt`. There is no second copy
  to drift from it, and it survived a subsequent normal deploy unchanged.
- **No backfill, ever.** Pre-epoch rows report `legacy_unavailable`. Their
  manifest digest and deploy commit are not recoverable at any price, and a
  receipt assembled from surviving content plus reconstructed identity would
  assert something nobody measured.
- **Activation is structural, not conventional.** `receipt_status` defaults to
  `pending`, so a rail nobody wired produces a visible pending row the sweeper
  reports — not a silent NULL indistinguishable from a pre-epoch row.

## What the programme is not

Receipts are produced and chained. **Nothing serves them yet** — no endpoint
exposes a receipt, and `describeReceiptState`'s `redacted` arm is correct
against a surface that does not exist. Exposing them is separate work, and
this record should not be read as claiming a customer-facing verification
product.

## The most useful parts of the record

Each phase document keeps its failures rather than summarising past them. If
you read only three things:

1. **Phase 5 §2** — a migration that defaulted one column and not its
   companion, which would have made *every* INSERT into `transactions` violate
   a `NOT VALID` CHECK. The migration applied cleanly; the platform would
   simply have stopped being able to write. 93 integration tests caught it
   while the entire unit suite stayed green.
2. **Phase 4's round-three finding, and its recurrence in Phase 5** — one
   un-updatable row halting the tamper-evident chain for every transaction,
   permanently. Two independent causes, one shape. The fix belongs at the
   blast-radius site, not at either cause.
3. **Phase 5 §6a** — a fail-before fixture too weak to catch the defect it
   named, and a fix that read as correct, rolled back correctly, and still
   failed at commit. Both were found by review, not by the suite.

## Related work shipped alongside

Two privacy fixes were found during receipt review and deliberately kept out of
the receipt PRs, because they were pre-existing and independent:

- **#383** — `sanitizeFailureReason`'s canned branches returned a name prefix
  captured before any redaction ran, leaking hostnames and making the function
  non-idempotent in two ways. Idempotence matters here precisely because
  `settle.ts` sanitises when building a receipt.
- **#384** — `audit_trail.error_message` was written raw and served verbatim
  beside a carefully sanitised `error`, on the same response.
- **#385** — the A2A rail served `transactions.error` raw; that file did not
  import the sanitiser at all.
