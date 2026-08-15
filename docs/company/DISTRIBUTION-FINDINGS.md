# Where our buyers come from — findings 2026-08-15

Written because the next session should not have to rediscover any of this.

## The shape of the business, measured

| | buyers | calls (90d) | revenue (90d) |
|---|---|---|---|
| Anonymous wallets (x402, no signup) | **1** | 3,379 | **€249.43** |
| Signed-up human accounts | 4 | 17 | €3.33 |

33 humans signed up over six months. 23 never made a single call. The human
signup funnel has been running long enough to be a completed experiment, and
it returned roughly €0.10 per signup — much of that trial credit rather than
cash.

Our one real customer has run for ten consecutive weeks at €27–55/week, buys
lead-research primitives (email validation, Google search, deliverability,
tech-stack, keyword tools), and has a **0.0% failure rate across 1,306 calls in
30 days**. Protecting them outranks everything else on the roadmap: they are
98.7% of revenue.

## Conclusion on human-developer marketing

**Not worth funding yet.** A campaign feeds a funnel that has converted at
approximately zero for six months. Humans matter — someone configured that
wallet — but they mattered at the moment of *choosing a tool for their agent*,
not as an audience for content. The channel that reaches them is presence where
tool selection happens (directories, registries, framework integrations, docs
answering one specific question), not thought leadership.

Revisit if buyer #2 arrives via a human who read something we published. Spend
that evidence rather than assume it.

## The marketplace where our buyer type actually shops

Coinbase's x402 Bazaar — a public discovery index:
`GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=2000&offset=N`

- **15,183 resources listed.** Biggest sellers: api.m2mcent.com (819),
  api.delx.ai (747), x402.orthogonal.com (360). Direct competitors present,
  e.g. stableenrich.dev (enrichment).
- **Strale has 41 listings of our 334 x402-enabled endpoints (12%).**
- **Four of our eight proven sellers are NOT listed**: `keyword-suggest`,
  `serp-analyze`, `tech-stack-detect`, `uptime-check`.

*Note for whoever checks next:* the first page (limit=200) does not contain
Strale. Paginate before concluding we are absent — that mistake was made and
corrected here.

### Why we are under-listed — investigated, not our bug

Indexing is triggered by the facilitator observing a well-formed 402 challenge
carrying `outputSchema.input.discoverable: true`. Checks performed:

1. The flag is set **unconditionally** for every endpoint
   (`x402-gateway-v2.ts`, the challenge builder).
2. A listed endpoint (`email-validate`) and an unlisted one (`keyword-suggest`)
   emit **structurally identical, well-formed** challenges — same flag, method,
   queryParams, description, output schema.
3. Listing does not simply follow sales: 212 slugs have settled x402 payments
   and are still not listed.

So the gap is CDP's indexing pipeline, which the code already carries a note
about (upstream issue: CDP drops v2 extensions on mainnet; we hedge with the v1
descriptor shape). **Not worth further engineering effort against a pipeline we
do not control.**

## Shipped in response

- Agent card (#253) and x402 discovery file (#259) both now lead with what
  agents actually buy, ranked by 28-day external revenue via the shared
  `lib/seller-rank.ts`. Every skill carries price and a pay-per-call endpoint.

## Open, and costed for a decision

1. **Raise the indexing gap with Coinbase.** A vendor conversation, therefore
   Petter's — 293 of our endpoints are invisible on the largest shelf.
2. **List on the other x402 directories** the Bazaar's biggest sellers also use.
   Needs mapping; submissions are outward-facing and founder-gated.
3. **Attribution is still blind**: 2,196 discovery hits, 1 carrying a source
   tag. If buyer #2 arrives we will not know how they found us. Cheap to fix
   and should precede any channel investment.
