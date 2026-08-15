# Intent: first run of the morning check-in, executed manually so Petter could see its output

Run 2026-08-15 ~12:00 UTC. Everything below is what the 08:00 job will produce daily.

## Headline

- Money this week: **€45.58** (prior week €22.01). One buyer, so the percentage is noise.
- Repo: main green, one open PR (#135, still `your_call`). Company scaffold merged.
- One breaker: `eu-regulation-search`, half-open since 12 Aug.

## What the check-in found that nobody was watching

**1. Real customers hit 66 failures in 7 days.** Against 684 completions that is a
**~9% failure rate for paying traffic** — and it was invisible, because our quality
signals come from our own test harness, which passes.

| count | service | what the customer saw |
|---|---|---|
| 11 | brazilian-company-data | upstream rate-limited us (HTTP 429) |
| 9 | product-reviews-extract | page did not exist (404) |
| 9 | tech-stack-detect | *"Provide 'url' or 'domain'"* — they didn't know what to send |
| 5 | url-to-markdown | target site blocks automated access (403) |
| 5+5 | product-search / price-compare | scraping vendor rate-limited |
| 5 | url-to-text | restricted address refused |

The `tech-stack-detect` row is the one that is our fault: nine paying attempts failed
because the caller could not tell what input the service wanted. That is a
discoverability defect, not a customer mistake.

**2. The conversion drop is far earlier than assumed.** Seven-day funnel:

```
189 agents connect  →  15 ask what we offer  →  1 actually calls something
```

**92% of agents that connect never even list our services.** I had been treating the
payment wall as the bottleneck; it is not — most agents leave before they see a
catalogue at all. Today's fix (advertising pay-per-call at refusal) addresses a step
that most agents never reach. It is still correct, but it is not the main lever.

**3. A second discovery surface nobody was watching.** `/.well-known/agent-card.json`
took **524 hits from 87 distinct agents** — second only to MCP, and roughly five times
the traffic of the x402 discovery file. Meanwhile `/x402/catalog` got 6 hits from 5
agents. Agents are finding the door and not the menu.

**4. Demand we refused, from the small sample that records it:** Swiss, Norwegian and
Finnish company data (2 each) — all of which we *have*. And one request to validate a
German IBAN, which is a **free** service we offer. Those are matching failures, not
catalogue gaps. (Half the table is our own probe noise — `zzz-no-such-cap` etc.)

## What I am doing about it

1. Fix `tech-stack-detect`'s input contract, then sweep the catalogue for the same
   defect — a service that cannot tell you what it needs is a broken service.
2. Investigate the initialize→list collapse. If 92% leave before asking, the
   connect response is the problem, and that is where the revenue is.
3. Put the catalogue on the agent-card surface that is actually being read.
4. Chase the IBAN matching failure — refusing a request for something free is a bug.
5. Retire the breaker on `eu-regulation-search` or quarantine it properly.

## Changes to how we watch

- These customer-failure and funnel queries are now part of every check-in. They were
  the whole value of this run.
- Adding event-driven alerts (breaker opens, a day with zero revenue, a new paying
  wallet) rather than more frequent scheduled runs — at 26 agents/day a third daily
  check-in would mostly report noise.

## Next session

Start with item 2 — the initialize→list collapse is the largest single number on this
page and nobody has looked at it.
