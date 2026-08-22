# Measurement system — design

**Status: BUILT AND IN USE (2026-08-15).** Reviewed by Codex (cross-provider),
revised where the review was right, and shipped as `apps/api/src/lib/metrics/`.
The dashboard computes no business numbers of its own. Where the text below
describes a design that was rejected during review, it is marked; the review
itself is kept verbatim in `measurement-review-codex-2026-08-15.md`.

## Why this exists

On 2026-08-15 three business conclusions were wrong in one day, each confidently
presented, each from correctly-executed SQL:

| # | claim | why it was wrong | class of error |
|---|---|---|---|
| 1 | "~$115/week baseline" | a 30-day total relabelled as weekly | **window mislabelled** |
| 2 | "1 paying customer" | `x402_payer_hash` was one day old | **instrument younger than window** |
| 3 | "92% of agents never view the catalogue" | 2 days of `initialize` compared against 3 hours of `tools/list` (PR #245 deployed the middle steps at 11:00 that day) | **steps measured over different windows** |

A fourth was near-miss: counting `glimind-probe` and `mcpbeat` as prospective
customers — **population not defined**.

A fifth happened while writing this document. Investigating error 3, I grepped
`apps/api/src/routes/mcp.ts` in my working tree, found only `/mcp:initialize`
being recorded, and concluded the funnel instrumentation "is not wired at all".
It is: `onFunnelEvent` and `classifyMcpRequest` are both live on `origin/main`
(mcp.ts:235, mcp.ts:340). My branch predated PR #245, which shipped that
instrumentation at ~11:00 that morning. **Read a stale checkout, reported it as
production.** The conclusion happened to survive — the data really does start at
11:00, because that is when #245 deployed — but the stated reason was wrong, and
it was wrong in a way that would have justified rebuilding something that
already existed.

This is the failure mode the project's own notes already warn about
("verify against `origin/main`, not the working tree"). A written warning did
not prevent it, which is the strongest argument in this document for putting
the check in code rather than in prose.

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

Every metric returns a **discriminated union**, not the flagged-value shape
this document originally proposed:

```ts
type Measurement<T> =
  | { status: "observed";    value: T; window; population; instruments; caveat? }
  | { status: "estimated";   value: T; methodology: string; ... }
  | { status: "unavailable"; reason: UnavailableReason; requestedWindow; ... };
```

**Why the original was rejected.** The first draft returned
`{ value, trustworthy: false }`. Cross-provider review pointed out that this
enforces nothing: `value` is always present, so a caller renders it and never
reads the flag — which is exactly how a one-day-old payer count reached a
dashboard. On the `unavailable` arm there is no `value` at all, so rendering a
number you were not entitled to requires deliberately inventing one.

Consumers — the dashboard, check-ins, any future report — read `trustworthy`
and `caveat` and are expected to surface them. The dashboard already does this
by hand for two metrics; this makes it structural for all of them.

## The identity gap — the thing we most need and least have

Client identity is captured on **~21% of external transactions**.

> The figure first reported here was 0.2%. That divided by *all* transactions,
> including ~108,000 rows of our own test harness — the same wrong-population
> error this document catalogues, made while writing the document that
> catalogues it. Filtered to real customers it is ~21%: about one call in five
> can be traced to a buyer. Still the largest gap we have, and a hundredfold
> different from the first answer.

Consequence: **we cannot answer "is our revenue one customer or twenty".** That
single fact decides whether the business has a demand problem or a conversion
problem, and those call for opposite work. It is the reason two of today's wrong
conclusions were possible at all.

So the system needs an identity spine: one resolved "who" per transaction,
derived in priority order from the authenticated user, then the x402 payer hash,
and otherwise **left unattributed**. A device/IP fingerprint was proposed here
and rejected on review: it is unnecessary for counting paying customers and
would build exactly the cross-session profile our daily-rotating IP salt exists
to prevent. Shipped as migration 0085's `transaction_actors` view.
With that, retention, concentration and repeat-purchase become answerable —
none of which we can currently compute.

## The commercial layer (added 2026-08-22, DEC-20260822-A)

`metrics.ts` answers *how much*. It does not answer *what that means*, and on
2026-08-22 the difference stopped being academic: revenue rose for the second
consecutive completed week while one buyer accounted for 99.3% of the income.
Each figure alone reads as an improving business. Together they say the
opposite.

The run of weeks is worth a sentence of its own, because the daily record that
morning said **four** consecutive rises and the module says two. Four data
points carry at most three transitions, one of those ended on the week still in
progress, and one of the remaining two was a fall. Nobody was careless; the
count was done by eye on a table that included a partial week. This is why the
run is computed rather than observed.

`metrics/commercial.ts` computes the twelve commercial questions
[DAILY-RUN.md](DAILY-RUN.md) requires — discrete weeks, growth, distinct payers,
concentration, largest-versus-rest, new versus returning, repeat, active paying
days, growth attribution, what activated new payers, second-payer trajectory,
and quiet payers — and, the part that matters, an `interpret()` function that
turns them into stated conclusions in plain English. Consumers render the
conclusions, so a report cannot accidentally publish a table with no reading
attached.

Three refusals are built in, each from a failure this system already made:

1. **A partial week is never compared against a full one**, in either
   direction. A record-breaking in-progress week is not evidence of growth, and
   an in-progress week below last week's total is not evidence of decline.
2. **A concentration share is not comparable across windows of different
   coverage.** `Concentration.comparable` is false when the identity instrument
   is younger than the window or when under 80% of revenue is attributable, and
   `interpret()` will not narrate a movement without it. This was found on the
   module's own first production run, which printed "99.3%, up from 19.0%" —
   where the 19.0% was one payer divided by a week in which identity had existed
   for two days. The entire "movement" was coverage. It is the same family as
   the 2026-08-15 errors this document was written about, reproduced inside the
   fix for them, which is the strongest available argument for putting the guard
   in code rather than in a warning.
3. **`returningPayers` is `null`, not `0`**, while the instrument is younger
   than the lookback. Nobody *can* have been seen before the instrument existed,
   so a zero would be a structural artefact presented as a finding.

## What we should optimise for

Not revenue. At this size revenue is one buyer's behaviour, and optimising it
means optimising for that buyer's next call.

The proposed primary metric is **distinct paying customers per week**, with
revenue as a secondary and concentration (largest buyer's share) as a guardrail.
This is the metric the milestone ladder in GOALS.md was rewritten around, and
the one we currently cannot measure — which is itself the argument for building
this first.

## How the open questions were answered

1. `Measured<T>` — replaced by the discriminated union above.
2. `MIN(created_at)` — rejected as unsound (a backfill makes a new instrument
   look old). Activation is now declared in `instruments.ts` against the commit
   that shipped it; `firstObserved()` remains as corroboration only.
3. Primary metric — **rolling 28-day distinct paying actors**, split new vs
   returning, with revenue secondary and largest-buyer share as a guardrail.
   A weekly count at this volume tracks one buyer's schedule, not our work.
4. Identity spine — `actor_key`: the user id when authenticated, a keyed hash of
   the wallet otherwise, `NULL` when neither. No fingerprint.
5. Verify against deployed code — yes: read the SHA from `GET /health`, or at
   minimum `git show origin/main:<path>`. Never the local working tree.

## Original open questions (kept for the record)

1. Is `Measured<T>` the right contract, or should untrustworthy metrics throw
   rather than return a flagged value?
2. Is deriving instrument start from `MIN(created_at)` sound, given backfills
   would make an instrument look older than it is?
3. What is the correct primary metric at ~€48/week with one known buyer?
4. What is the cheapest identity spine that does not create a privacy problem?
5. Should the system verify against deployed code rather than the working tree —
   e.g. a check that refuses to reason about instrumentation the local branch is
   behind on? Error 5 above suggests yes, but it may be cheaper to always read
   `git show origin/main:<path>` when reasoning about what production does.
