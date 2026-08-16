# Intent: stand up an agent-run operating model for Strale, then discover the measurement underneath it was unreliable and rebuild it

Long session, 2026-08-15. Two halves that turned out to be one thing.

## What changed, and why

**Petter put Claude in charge of day-to-day operations** with a €50/week
external budget and a $2,000/week revenue goal. That produced a charter, goals,
decision queue, budget ledger, workforce list, design system and a CEO
dashboard — all under `docs/company/`, now live as **DEC-20260815-A** in
CLAUDE.md.

Two amendments came later the same day, both at his prompting and both real
transfers of authority rather than restatements:

- **No technical question goes to him.** He is non-technical; asking him to
  arbitrate implementation is a failure of the role, not diligence.
- **Shipping is never his decision.** Merging and deploying are execution. The
  session that opens a PR merges it and reports afterwards.

## The part that mattered more

Seven business conclusions were wrong during this session. Every one came from
a correctly-executed query answering a subtly wrong question:

| claim | actually |
|---|---|
| "$115/week baseline" | a 30-day total relabelled weekly — real figure ~€45 |
| "1 paying customer" | the payer column was one day old |
| "92% of agents never look at the catalogue" | two days of one step vs three hours of another |
| "183 agents arriving" | mostly health checkers; ~1,800 crawler visits/month are monitors |
| "funnel instrumentation isn't wired" | read a stale branch; it shipped that morning |
| "identity coverage is 0.2%" | divided by our own test harness — it is ~21% |
| "that marker is nowhere in our data" | searched 2 columns of 30; it was in `transactions.input` |

The last one was the worst: it was used to tell Petter that a correct Codex
audit was unfounded. **Cross-provider review caught three of the seven; I caught
three; one was caught by a failing test.** Nothing caught them through care.

So the second half of the session built the structure care cannot provide:

- `src/lib/metrics/` — every business number defined once, self-describing,
  refusing windows its instruments cannot cover. 24 tests, all mutation-verified.
- `transaction_actors` (migration 0085) — one resolved "who" per transaction,
  making "one customer or twenty" answerable for the first time.
- Attribution derives source from referrer and crawler identity instead of a
  `?src=` tag only we can set (1 of 2,196 hits carried one).
- The dashboard computes nothing; it renders measurements.

## What we learned about the business

- **€48.86/week from 5 paying actors, but ~99% is one anonymous wallet.**
  That wallet has been steady for ten weeks and has a 0% failure rate across
  1,306 calls. It is the business.
- **Human signups do not convert.** 33 signups over six months produced €3.33
  and 23 of them never made a single call. The x402 rail produced €249 from one
  wallet with no signup at all. This is why we are not doing content marketing.
- **We are already listed in ten directories** (~1,800 crawler visits/month) —
  not undiscovered, under-converting. The listing copy sold compliance while our
  only customer buys lead-research primitives; rewritten.
- **41 of 334 endpoints are indexed in Coinbase's Bazaar.** Not our bug —
  identical challenges, theirs indexed and ours not. Email drafted for Petter.

## Privacy — the thing to read if you read nothing else

An audit identified a paying customer by name from data we had retained. Their
`translate` inputs carried an internal project label; their `image-to-text`
inputs carried their own hostnames. Nothing leaked, nobody acted, but it was
possible and nobody had decided whether it was allowed.

Two fixes, both merged:

1. **Retention was covering 90 of 307 capabilities.** It equated *personal data*
   with *customer data*; everything unflagged kept its payload for three years.
   Now every transaction is redacted at 90 days, which also closed a documented
   solution-execution gap for free.
2. **The customer-data boundary is in the charter**: no outreach from
   transaction evidence, telemetry yields anonymous insight only, prospects come
   from public research or self-identified registrations, and widening any of it
   is Petter's explicit call.

## Open, and who owns it

**Petter:** ~~send the Coinbase email~~ — **withdrawn 2026-08-15 after
verification.** He asked whether the 41-of-334 figure was real before sending.
It was not: a complete walk of all 14,946 index entries finds 95 listed, and
the email's own "not indexed" example was indexed. The mechanism is now
established — the Bazaar lists exactly what settled an x402 payment in the
trailing 30 days, exact fit both directions — so listing is earned by sales
and expires when they stop. There is no gap to raise and no lever to pull;
treat the listing count as a trailing indicator of revenue. Details in
`docs/company/coinbase-bazaar-email.md`, kept unsent. Talk to
Talentino, Gryhat or Pave — the three accounts that registered and are therefore
contactable under our own rule. Mexico's INEGI key when convenient. Confirm the
90-day retention window if disputes need longer.

**Claude:** PR #135 has an owner and a 2026-08-16 deadline. Fix `company-enrich`'s
JSON parse failure (ours, ~€1.50/90d). Smithery crawls us but the public URL
404s — find the real one.

## Next session should know

- The morning check-in runs unattended at **08:00** for the first time. It now
  carries a second-source rule: no finding reaches Petter without being checked
  a different way, and absence claims must enumerate the search space first.
- **The first trustworthy payer numbers arrive ~22 August.** Everything shipped
  today about distribution is unmeasurable before then. Sunday's review is the
  first honest read.
- Do not add another discovery surface before that data lands. The bottleneck is
  conversion, not presence.

## Filed in Notion

- Decision DEC-20260815-A: https://app.notion.com/p/3be67c87082c8143b70dc6503893ba73
- Journal entry: https://app.notion.com/p/3be67c87082c815f8265d93ca4c8a6af

Notion was unreachable earlier in the session and reachable at close, so both were
filed then rather than deferred to the next session.
