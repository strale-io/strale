# Measurement system — design

**Status:** proposed 2026-08-15, pending cross-provider review.

## Why this exists

On 2026-08-15 three business conclusions were wrong in one day, each confidently
presented, each from correctly-executed SQL:

| # | claim | why it was wrong | class of error |
|---|---|---|---|
| 1 | "~$115/week baseline" | a 30-day total relabelled as weekly | **window mislabelled** |
| 2 | "1 paying customer" | `x402_payer_hash` was one day old | **instrument younger than window** |
| 3 | "92% of agents never view the catalogue" | 2 days of `initialize` compared against 3 hours of `tools/list` | **steps measured over different windows** |

A fourth was near-miss: counting `glimind-probe` and `mcpbeat` as prospective
customers — **population not defined**.

None was a SQL bug. Every query returned exactly what it asked for. The failures
were all in the *framing* — which rows count, over what period, against an
instrument old enough to answer. That is not fixable by being more careful,
because being careful is what produced these. It needs structure.

## Principles

1. **A metric is never a bare number.** Every metric returns its value *with* its
   window, the age of the instruments behind it, its coverage, and whether it can
   be trusted. A caller cannot accidentally render an untrustworthy figure,
   because the untrustworthiness travels with the value.
2. **Instrument age is discovered, not declared.** The system asks the database
   when each instrument first recorded, rather than trusting a constant someone
   remembered to update.
3. **A metric refuses windows it cannot cover.** Ask for 30 days of a 1-day-old
   instrument and you get a refusal plus the window it *can* answer — never a
   number that looks complete.
4. **Multi-step metrics use one window for every step.** A funnel computes from
   the latest instrument start across all its steps, or does not compute.
5. **Populations are named and shared.** "Customer", "agent", "internal" are
   defined once in code. No hand-rolled filter, ever — two of the errors above
   came from bespoke filters.
6. **Coverage is a first-class metric.** "Client identity present on 0.2% of
   transactions" is reported next to the metrics that depend on it, so gaps are
   visible before they mislead rather than after.

## Shape

```
src/lib/metrics/
  populations.ts   who counts — external customers, real agents vs monitors, internal
  instruments.ts   what each instrument is, and when it actually started recording
  metrics.ts       every business number, defined once, self-describing
  coverage.ts      how complete each instrument is right now
```

Every metric returns:

```ts
interface Measured<T> {
  value: T;
  window: { from: Date; to: Date; label: string };
  trustworthy: boolean;      // false when an instrument is younger than the window
  caveat?: string;           // plain English, rendered verbatim to Petter
  coverage?: number;         // 0–1, when the metric depends on optional fields
  instruments: string[];     // what it was computed from
}
```

Consumers — the dashboard, check-ins, any future report — read `trustworthy`
and `caveat` and are expected to surface them. The dashboard already does this
by hand for two metrics; this makes it structural for all of them.

## The identity gap — the thing we most need and least have

Client identity is captured on **~0.2% of transactions** (107,605 of ~108,000
carry nothing). On x402, which is nearly all revenue, 62 of 1,971 transactions
in 30 days carry payer identity.

Consequence: **we cannot answer "is our revenue one customer or twenty".** That
single fact decides whether the business has a demand problem or a conversion
problem, and those call for opposite work. It is the reason two of today's wrong
conclusions were possible at all.

So the system needs an identity spine: one resolved "who" per transaction,
derived in priority order from the authenticated user, then the x402 payer hash,
then a client fingerprint, and recorded on every rail rather than some of them.
With that, retention, concentration and repeat-purchase become answerable —
none of which we can currently compute.

## What we should optimise for

Not revenue. At this size revenue is one buyer's behaviour, and optimising it
means optimising for that buyer's next call.

The proposed primary metric is **distinct paying customers per week**, with
revenue as a secondary and concentration (largest buyer's share) as a guardrail.
This is the metric the milestone ladder in GOALS.md was rewritten around, and
the one we currently cannot measure — which is itself the argument for building
this first.

## Open questions for review

1. Is `Measured<T>` the right contract, or should untrustworthy metrics throw
   rather than return a flagged value?
2. Is deriving instrument start from `MIN(created_at)` sound, given backfills
   would make an instrument look older than it is?
3. What is the correct primary metric at ~€48/week with one known buyer?
4. What is the cheapest identity spine that does not create a privacy problem?
