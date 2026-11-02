# x402 batch payment — design note (not built)

Date: 2026-10-29. Status: design only. Phase 2 of portfolio plan Phase 3
item 5 (`docs/strategy/2026-10-23-portfolio-plan.md`, DEC-20261024-B).
Phase 1, the API-key wallet path `POST /v1/do/batch`, is built
(`apps/api/src/lib/do/batch.ts`, `apps/api/src/routes/do-batch.ts`).

## The constraint that decides the design

Today x402 uses the `exact` scheme: the buyer signs an EIP-3009
`transferWithAuthorization` for one fixed amount, Strale verifies it, runs the
capability, and settles only after a billable result (DEC-14; the claim and
intent machinery in `x402-payment-claims.ts`, `x402-settlement-intent.ts` and
`x402-settle.ts`). An `exact` authorization can be settled in full or not at
all. It cannot be settled for part of its value.

A batch is charged for the items that succeed. So a single `exact`
authorization for the whole quote can only do one of two wrong things when one
item fails: settle the full quote, which charges for the failure and breaks
DEC-14; or settle nothing, which gives the succeeded items away and invites
buyers to add a failing item to get a batch free.

## Options

| Option | How | DEC-14 | Cost and risk |
|---|---|---|---|
| A. One `exact` payment, all or nothing | Settle the quote only if every item succeeds | Breaks it, or gives work away | Simplest; wrong on money |
| B. One `exact` payment, refund the difference on-chain | Settle the quote, send USDC back for failed items | Holds, after a refund | Needs an outbound hot wallet and gas per refund: a new custody and spend decision |
| C. One request, one `exact` authorization per item | The 402 quote lists N requirements; the buyer signs N authorizations (distinct nonces) and sends them in one request; each settles only if its item succeeded | Holds exactly | N settlements per batch through the facilitator; reuses the per-payment claim, intent and reconciler unchanged |
| D. An `upto` scheme | Buyer authorizes up to the quote; Strale settles the sum of succeeded items | Holds exactly | One settlement; depends on facilitator and client support for `upto`, which is not confirmed (unknown) |

## Recommendation

Build C when x402 batch demand appears, and move to D if the Coinbase
facilitator and the common x402 clients support an `upto` scheme by then.

C is the only option that keeps DEC-14 exact with the facilitator and scheme
already in production, and it needs no new money machinery: each item is an
ordinary x402 payment with its own payment hash, claim, settlement intent and
reconciler path. What it changes is the envelope:

- The 402 response for `POST /x402/v2/batch/:slug` quotes `price × items` and
  lists one payment requirement per item index.
- The request carries an array of signed payloads, one per index. Every one is
  verified, and every claim taken, before any item runs; one bad signature
  refuses the batch and nothing settles.
- Items run with the same bounded concurrency and time budget as the wallet
  path. A succeeded item settles its own payload; a failed or unstarted item's
  claim is released, so its authorization is never broadcast and expires
  unused.
- The response has the wallet path's shape, with a settlement transaction per
  charged item instead of `wallet_balance_cents`.
- Replay keys on the set of payment hashes, as single x402 calls key on one.

## Open before building

- Facilitator limits and per-settlement cost at N settlements per batch
  (unknown; check the CDP terms before choosing the batch size cap for x402).
- Whether common x402 clients can sign N authorizations in one call, or whether
  Strale's SDK and MCP server need a helper. Without client support, C is
  unusable however correct it is.
- Header size: N payloads in one header may exceed proxy limits at 100 items. A
  JSON body field for the payloads is the likely answer.
- Option B, if ever chosen, is a spend and custody decision for Petter (an
  outbound wallet), not a technical one.
