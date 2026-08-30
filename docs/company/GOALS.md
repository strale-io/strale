# Strale Goals — the document every agent reads first

**Reviewed:** 2026-08-23 · next review at each Sunday synthesis · quarterly deep review.

## Mission

The data layer for AI agents: independently tested, audit-logged data sources,
purchasable by agents without human ceremony. Vertical-agnostic; sell what
buyers demonstrate they want.

## The goal that ranks everything

**$2,000/week gross revenue (medium-term).**

**Baseline, measured 2026-08-15 with the canonical external filter:**
**€45.58/week** (last 7d, 641 calls) · €30.02/week (30d average, €128.66 total).
In USD ≈ **$50/week**. The goal is therefore **~40×**, and M1 is **~5×**, not 2.2×.

> **Week of 2026-08-17 (measured 2026-08-22, ISO weeks, canonical population,
> one day still to run):** **€56.89 on 878 calls** — the highest week in the
> series on both counts, and the fourth consecutive rise: 08-03 €27.38 / 451 ·
> 08-10 €39.24 / 620 · 08-17 €56.89 / 878. Earlier weeks for shape: 07-27
> €10.85 · 07-20 €37.98 · 07-13 €27.42. Rolling `revenueCents` agrees and adds
> nothing else: 7d €64.39, 14d €55.31/wk, 30d €36.06/wk — the rate still rises
> as the window shortens, which is what a genuinely rising series looks like.
> Roughly **4× short of M1**, down from 5× a week ago.
>
> **Concentration is the binding constraint and it got worse, not better.**
> `payingActors` over 7d now returns **4 identified wallets with a 99.3% top
> share** — a week ago it was 2 wallets at 94.7%. Three of the four are
> rounding error. M1 needs ≥5 distinct payers with none above 60%, so the
> revenue bar will be cleared long before the concentration bar, and the extra
> wallets appearing did not move the concentration at all. Reading the two
> numbers together: **we are selling more to the same buyer.** A session aimed
> at where a *second* payer comes from is worth more than any capability work
> until that changes.
>
> **Correction to the run of weeks, 2026-08-22.** "Four consecutive rises" is
> wrong; it is **two**. Computed by `growth()` over the same series: 07-13
> €27.42 · 07-20 €37.98 · 07-27 €10.85 · 08-03 €27.38 · 08-10 €39.24 · 08-17
> €56.89 (in progress). Four completed points carry at most three transitions,
> 07-20 → 07-27 is a fall, and the €56.89 belongs to a week with a day still to
> run — so it is neither a record nor a rise yet. The trend is genuinely up and
> the direction is unchanged; only the count was inflated, by eyeballing a table
> that included the partial week. The run is now computed rather than counted by
> hand, and a partial week cannot enter the comparison in either direction.
>
> **Correction to the concentration comparison, 2026-08-22 (the level stands,
> the movement does not).** The "94.7% a week ago → 99.3% now" reading is not sound, and the
> first production run of `metrics/commercial.ts` is what caught it. Payer
> identity only began recording on 2026-08-15, so any window reaching back
> before that divides one visible payer by revenue nothing was attributing:
> measured over discrete ISO weeks, the week of 08-10 reads **19.0% top share
> with only 19.0% of its revenue traceable at all**. Presenting 19% → 99.3% as a
> movement would have been a pure coverage artefact, and the 94.7% figure is the
> same artefact in a milder form. **What survives:** this week is 100%
> attributable and its top share really is 99.3% (€56.49 against €0.40 from
> everyone else across 4 payers). **Whether any of those 4 is new is NOT
> measurable and must not be written down as if it were** — a buyer active in
> July carries no recorded identity, so it is absent from the lookback and reads
> as a first-time buyer. `newPayers` returns null rather than a flattering
> count for exactly this reason; the first honest new-vs-returning split is
> available once the lookback sits entirely after 2026-08-15. That level is the
> finding, and
> it is enough — the conclusion above is unchanged. What we cannot yet say is
> whether concentration is *rising*; the first honest week-on-week comparison is
> available once two full weeks sit entirely after 2026-08-15. `Concentration
> .comparable` now enforces this, so the same comparison cannot be made by hand
> again. Logged as a new instance of failure family F2 in
> [LESSONS.md](LESSONS.md).

> **Week of 2026-08-17, measured 2026-08-23 on its final day: €59.42 on 929
> calls.** The last *completed* week is 08-10 at €39.24 / 620, and `growth()`
> over the discrete series still reads **rising** — two consecutive completed
> rises (07-27 €10.85 · 08-03 €27.38 · 08-10 €39.24), with the week now closing
> ahead of all of them. Concentration is unchanged and total: **4 payers, top
> share 99.3%** (€59.02 against €0.40 from everyone else), 100% of the week's
> revenue traceable to a payer. One payer bought on more than one day; nobody
> else has a pattern. New-vs-returning is still `unavailable` and must not be
> guessed — the lookback for this week reaches back past 2026-08-15, when payer
> identity began recording.
>
> **The concentration risk stopped being theoretical on 2026-08-22.** The x402
> settlement-volume watch paged at 20:47Z: 65 settled transactions in 24h
> against a ~149/day trailing baseline. Measured independently through
> `lib/metrics` on the canonical population, daily external revenue reads
> 08-17 €16.29 / 186 calls · 08-18 €10.97 / 190 · 08-19 €8.72 / 195 ·
> 08-20 €9.29 / 141 · 08-21 €9.32 / 145 · **08-22 €4.74 / 69** · 08-23 (to
> 06:00Z) €0.09 / 3.
>
> **It is not ours, and that was checked rather than assumed.** Four
> independent ways: the settlement state machine is healthy (192 of 195 intents
> reached the terminal `recorded` state; the only 3 failures were on 08-21 at
> 12:54, three minutes apart and before the fall); the 402 challenge path is
> unchanged, with third-party monitor traffic flat across the boundary at 1,535
> refusals in the last 48h against 1,525 in the 48h before; there were two
> failed external transactions on 08-22 and none on 08-23; and a live call to
> `/x402/email-validate` returns a valid challenge. The same payer hash
> (`e9e672ef…`) is still calling — 3 times overnight — so this is one buyer
> slowing, not churning. Their whole basket fell together: `email-validate`
> 151 → 29 → 3 across five days, `keyword-suggest` 37 → 0, `google-search`
> 35 → 9 → 0.
>
> **What is not yet known, and must not be written down as if it were:** whether
> this is a durable decline. It is one full day plus an overnight. The first six
> hours of 08-23 carry 3 calls, and the matched 00:00–06:15Z window on 08-21
> also carried 3 — overnight variance at this volume swamps a one-day signal.
> The read that survives is the one GOALS.md has carried for three weeks, now
> demonstrated rather than argued: **a single buyer is the whole business, and
> when they pause, the business pauses.** The alert's own 24h cooldown means it
> can page again after 20:47Z today if it continues; that is the thing to watch.

> **Read revenue week-over-week, not as a rolling 7d figure.** On 2026-08-17 the
> rolling 7d read €36.64 against the €45.58 baseline and looked like a 20% fall.
> Discrete weeks say the opposite: w-0 €36.64, w-1 €29.98, w-2 €10.85, w-3
> €37.73, and the per-week rate rises monotonically as the window shortens
> (90d €19.67 → 30d €27.95 → 14d €33.31 → 7d €36.64). At this volume a rolling
> window is dominated by which individual days fall in or out. Trend is up.

> An earlier draft of this file said "$115/week". That was a 30-day figure
> relabelled as weekly — caught by cross-provider review 2026-08-15 and
> re-measured against production. Every milestone below is denominated in EUR
> to match the ledger; USD conversion is display-only.

| milestone | proves | bar |
|---|---|---|
| **M1 · €230/wk** | conversion works | two consecutive weeks, **≥5 distinct external payers**, no single payer >60% |
| **M2 · €550/wk** | repeat usage + mix | ≥30% revenue from repeat payers |
| **M3 · €1,100/wk** | scale | new experiments cost < 1 session each |
| **M4 · €1,850/wk** (≈$2,000) | the goal | — |

A revenue number alone never clears a milestone — concentration and repeat
matter more than the total at this size. One wallet buying more is not
conversion.

## What we currently know (update as evidence lands)

- **Measured 2026-08-30. "Twelve payers" is four payers and eight trials — and
  the two genuinely new ones did not come through the compliance wedge.**
  Rolling 7d, canonical population via `lib/metrics`: €75.84 across 12 paying
  identities, 100% attributed. The distribution is the finding, not the count:
  `x402:e9e672ef71` €56.55 (74.6%), the card customer `user:e3c68534` €11.09,
  `x402:35f8dfc00f` €5.44, `x402:6bfcaec686` €2.05 — and **eight further
  wallets that spent €0.62 combined**, one day and one or two calls each. Any
  plan built on "twelve customers" is built on eight trials. Real buyers: four,
  up from one.

  **Do not quote a week-over-week concentration movement.** `concentration()`
  returns `comparable = false` for this window (`partialWindow = true`), which
  is precisely the guard that exists because the module's first production run
  read 99.3% against a prior 19.0% where the prior figure was an artefact of
  identity coverage. The within-week distribution above needs no cross-window
  comparison and is what should be cited.

  **The strategic part: entry capabilities.** The card customer entered through
  `competitor-compare` — confirming the multi-entity comparison as *the*
  experiment, exactly as the DQ-21 consequence below predicted. But the two new
  non-trivial wallets entered through **`address-geocode` (€5.44)** and
  **`image-to-text` (€2.05)** — general-purpose utilities, not company-data or
  compliance. Corroborated by the 90-day external top sellers, which are led by
  `email-validate`, `google-search`, `serp-analyze`, `brand-mention-search` and
  `image-to-text`; `competitor-compare` is the only company-data-adjacent slug
  in the top eight, at €10.00 on 10 calls.

  **What this does and does not license.** Two buyers in one week is a hint, not
  a verdict, and it is *not* grounds to retire the compliance wedge — that is a
  DEC-level change. It is grounds to stop treating further KYB country
  build-out as automatically the highest-value next capability. If a third and
  fourth non-trivial buyer also arrive through general utilities, the ranking
  in this document should change explicitly rather than by drift.

  **Also confirmed: the card customer's return is a habit.** Four separate
  buying days in the window, €11.09 — not the single episode the 08-29 brief
  could only call "the beginning of". A fifth and sixth buying day makes
  `competitor-compare` the clearest build signal we have.

- **We will not be asking the card customer why they stopped — Petter declined
  the outreach on 2026-08-28 (DQ-21), and that decision reranks the work.** The
  08-28 recommendation was to write one short note on 04-09 if they were still
  silent; declined. The charter's boundary (no outreach from transaction
  evidence; a registration is a relationship, a payment is not) is unchanged and
  remains the operative default, so this is not a narrow exception to a
  permissive rule — it is the strict rule holding.

  **The consequence is the useful part.** The cheap way to learn why our only
  card-paying customer went quiet is closed, so the *only* remaining instrument
  is their behaviour. That promotes the multi-entity comparison from "strongest
  product lead" to **the actual experiment**: they paid €3.00 and waited ~45
  seconds to assemble by hand a three-way comparison we sell only pairwise, and
  building it is now the only lever we have on whether they return. It is also
  falsifiable in a way asking them is not — if we ship it and they still do not
  come back, the hypothesis that the product shape was the problem is wrong, and
  that is worth more than an answer we would have had to take on trust.

  Do not re-raise the outreach question as a standing policy item. Raise it only
  for a concrete case the charter genuinely does not resolve.

- **The single-buyer dependency broke this week, and the sound way to say so is
  in euros rather than in a percentage** (measured 2026-08-28, canonical
  external population, `lib/metrics`). Revenue from *everyone except that
  week's largest payer*, by discrete ISO week: 07-13 €0.00 · 07-20 €2.15 ·
  07-27 €0.45 · 08-03 €0.73 · 08-10 €7.47 · 08-17 €2.40 · **08-24 €14.03 with
  two days still to run.** That already beats every completed week in the
  series, and the previous best was €7.47. Distinct payers over the same two
  weeks: 5 → 9.

  **Why this comparison is legitimate where the concentration ratio is not.**
  `Concentration.comparable` returns false on the current window because it is
  a partial week, and it is right to: the *ratio* on a Tuesday is an artefact
  of which days have elapsed. But an absolute count of euros from non-largest
  payers in a partial week can only **understate** the completed week, and the
  same holds for a payer count, which only accumulates. So the direction is
  safe in a way the percentage is not. The top share does read 70.7% against
  last week's 96.4%; that pair is **not** written down here as a movement, per
  the correction of 2026-08-22.

  **The largest buyer did not shrink to produce this.** `e9e672ef719ee934` ran
  €9.13/day across the completed week of 08-17 and €8.08/day across the four
  completed days of 08-24 — an 11% per-day difference at a volume where a
  single day moved 3.4× in either direction last week, so it is noise and is
  not reported as a decline. The business grew *around* its largest buyer
  rather than away from him. That is the first evidence for M1's concentration
  bar since the bar was written.

- **Our only card-paying customer stopped while still funded, which is a
  different fact from the one the 08-27 brief was watching for** (measured
  2026-08-28). `provider@dlgt.io` last bought at 2026-08-26T19:02:51Z. Their
  wallet still holds **€3.91** — roughly four more purchases of the thing they
  actually buy — and it has not moved for two days.

  The 08-27 read framed the next event as *"they run out in days; watch for a
  second top-up"*. They did not run out. **Nothing on our side turned them
  away, and that was checked rather than assumed:** 19 transactions, every one
  `completed`, zero rows in any other status, zero `failed_requests`, no error
  string on any row. So the honest statement is that we have no evidence of a
  cause, and the absence is itself the finding — a customer who stops while
  funded and unblocked is a demand or fit signal, not a reliability one.

  **What their calls cost them in time is the one lead worth pulling.** Every
  `competitor-compare` call they made took between 11.9 and 15.0 seconds
  (14,949 · 14,276 · 14,056 · 11,892 · 14,791 · 14,776 · 14,855 ms). Their
  final session was three of those inside 49 seconds — the hand-assembled
  three-way comparison the 08-27 entry identified — so the shape they want
  costs them **€3.00 and about 45 seconds of waiting**. A multi-entity
  capability would be cheaper for them on both axes and cheaper for us on page
  fetches. Note for anyone tempted to file this as a defect: the capability
  declares `avg_latency_ms = 15000`, which is above `/v1/do`'s 10s async
  threshold, so these route async and the 15s in-transaction ceiling does not
  apply. No timeout has been demonstrated, and none is claimed here.

- **E4 is at day 10 of 14 with zero external sales across all four bundles**
  (measured 2026-08-28; kill criterion fires 2026-09-01). The control
  `lead-email-verify` is the only bundle selling at all — 8 external orders
  for €1.60 since 08-18, last sale 08-24 — and it is itself quieter than the
  week before (26 orders in the week of 08-17, 3 so far in the week of 08-24).
  **That weakens the inference the kill criterion is about to license:** "the
  four do not sell" and "bundle traffic is down generally" are not
  distinguishable from this data alone. Whoever closes E4 on 09-01 should say
  which of the two it is, or record that it could not.

- **Correction to the entry below, 2026-08-27: the card customer's money goes
  to competitive intelligence, not to compliance — and their runway is days,
  not weeks.** Measured per-day over the canonical external population. They
  have now been active on **three** days, the third being 08-26, which no
  session was watching: 08-23 two calls €2.00 on trial credit; 08-25 fourteen
  calls €3.09; **08-26 three calls €3.00, all `competitor-compare`**. Zero
  failures throughout.

  **€7.00 of the €10.09 they have spent — 69% — is `competitor-compare` at
  €1.00 a call.** The eleven-capability compliance burst that the 08-25 entry
  built its conclusion on was 12 calls for **€1.09 in total**, at €0.02–€0.25
  each, and the very next day they went back to the expensive capability. Under
  GOALS' own "follow the money" rule this customer is a competitive-intelligence
  buyer who *sampled* compliance once. What survives from 08-25: a card payer
  exists, they are an agent integration, and compliance got its first
  supporting evidence rather than only the argument. What does not survive:
  "they are buying the compliance wedge" as a description of their spending.

  **Their wallet holds €3.91** — under four more `competitor-compare` calls.
  The 08-25 correction that replaced "wait for a second payment" with "watch
  the balance" was right, and its own estimate ("weeks of the cheap compliance
  checks they mostly buy") is superseded by the same evidence: at their actual
  basket this is days.

  **They are assembling N-way comparisons by hand, and paying three times for
  it.** All three 08-26 calls were *different* domain pairs covering three
  companies, inside 49 seconds — every pairwise combination of a three-company
  set. Our catalogue sells only pairwise, so a three-way question costs them
  €3.00 and costs us six page renders across three distinct domains. This is
  demonstrated, paid-for demand for a multi-entity comparison from the only
  customer who has ever paid us by card, and it is the strongest product lead
  on the board. Not yet built; a new slug goes through the onboarding pipeline
  (DEC-20260320-B).

  **What is still NOT established:** that they are a durable customer. Three
  days and €12. The honest next measurement is unchanged — a second top-up —
  and it is now close enough to observe rather than to wait for.

- **The 24h `competitor-compare` result cache is confirmed working in
  production** (2026-08-27), closing the `unverified:` the 08-25 handoff filed
  because `STRALE_API_KEY` is dead. Production traffic settled it without a
  key: the same input at 08-25 08:43:28Z and 08:44:05Z returned
  `cache_hit=false` then `cache_hit=true, cache_age_hours=0`. Self-second-
  sourcing — the `cache_hit` field exists only in the post-`f992fd5` build, and
  every earlier row has it null, so the rows also evidence which build served
  them. The exercising account was internal, so this is our own production
  call, not a customer's. Note for anyone reasoning about its value: **the
  cache cannot help the card customer**, who never repeats a pair. Its value is
  against the double-charge shape (same pair twice in 43 minutes, 08-25) that
  prompted it.

- **The German suspension costs €1.80, from the buyer who is already ours**
  (measured 2026-08-27). All 36 external `german-company-data` calls landed on
  a single day, 2026-08-24, and every one came from `e9e672ef719ee934` — the
  dominant wallet, not a new customer. OpenRegister Pro at €59/month needs
  ~295 paid calls/month to break even against a corrected €0.20 price; one day
  of 36 calls is €7.20. Buying it is not justified and is therefore **not a
  founder decision**. Re-open only if the 2026-09-06 free reset is exhausted
  again immediately.

- **The first customer to pay us by card arrived, and they are buying the
  compliance wedge — not the growth cluster** (measured 2026-08-25). A domain we
  had never seen registered at 2026-08-23T21:12Z, spent the €2 trial credit on
  `competitor-compare` within six minutes, and then on 2026-08-24T23:58Z **paid
  €10.00 through Stripe** and resumed buying immediately. 16 paid calls, €5.09
  spent, **zero failures**, across two separate days. Their user agents are
  `Python-urllib`, `python-httpx` and `curl` — an agent integration, not a
  person clicking.

  **This is the only Stripe top-up in the last 120 days.** Every euro before it
  arrived over x402. Second-sourced four ways: the wallet ledger shows the
  trial-credit grant, the two trial purchases, the €10.00 `top_up` carrying a
  Stripe session id, and the purchases after it; the domain is outside
  `INTERNAL_EMAIL_SUFFIXES`, so the canonical filter counts them as external by
  the same rule every revenue number uses; it is the only account on that
  domain; and there are no failed calls to explain away.

  **What they bought contradicts a claim this file has carried since
  2026-08-16.** "All revenue is one cluster — SEO and growth research" is no
  longer true. After topping up they called `pep-check`, `insolvency-check`,
  `vat-validate`, `lei-lookup`, `uk-company-data`,
  `uk-disqualified-director-check` and `us-company-data` — the KYB/compliance
  wedge, in one burst of seven capabilities inside five seconds, which is a
  screening workflow. DQ-9 (Petter, 2026-08-16) declined to re-point the company
  at SEO/growth and keep compliance's investment. That decision now has its
  first supporting evidence rather than only the argument.

  **What is NOT established, and must not be written down as if it were:** that
  this is a durable customer. It is two days and €10. The honest next
  measurement is whether they top up a second time.

- **The 2026-08-22 "the business pauses when one buyer pauses" scare did not
  become a decline** (re-measured 2026-08-25 per-day through `lib/metrics`):
  08-17 €16.29 · 08-18 €10.97 · 08-19 €8.72 · 08-20 €9.29 · 08-21 €9.32 ·
  **08-22 €4.74** · 08-23 €6.98 · **08-24 €11.51** · 08-25 €3.90 by 05:40Z.
  The dip was one day. The week of 08-17 closed at **€66.31 on 1,000 calls** —
  the highest week in the series — and `growth()` over the discrete completed
  series reads **rising**, now three consecutive completed rises (07-27 €10.85 ·
  08-03 €27.38 · 08-10 €39.24 · 08-17 €66.31).

  The GOALS entry written on 08-23 was right to refuse to call one day a trend,
  and the refusal is what kept a wrong conclusion out of the record. Worth
  keeping as the worked example: **at this volume a single day is inside the
  noise in both directions**, and the alert that paged at 20:47Z on 08-22 was
  measuring variance, not churn.

  Concentration in the current partial week reads 79.3% top share across 5
  payers against last week's 96.4% across 5. **That is not a comparison and must
  not be presented as one** — `Concentration.comparable` returns `false` on the
  current window because it is a partial week, which on any Monday or Tuesday
  reads as a movement that is purely an artefact of which days have elapsed. The
  first honest read is after this week closes.

- **An agent that asked for something we sell, the way we tell agents to ask,
  got HTTP 500 — for five and a half months** (found and fixed 2026-08-23,
  `e8c36cb`). `/v1/do` takes either a `capability_slug` or a free-text `task`.
  The unauthenticated auth gate was entered only in the first case, so a caller
  who *described* what they wanted matched normally, fell past every anonymous
  branch, and landed in the paid path with no user; the wallet read threw and
  the top-level handler answered `internal_error`. Verified against production
  before the change: `{"task":"search the web for news"}` → 500,
  `{"task":"take a screenshot of this page"}` → 500,
  `{"capability_slug":"google-search"}` → 402 with a price. So the rail worked
  for anyone who already knew our slugs and returned an error to everyone else
  — and `task` is what the MCP server, the SDKs and the docs all tell an agent
  to send. Live since `1e8ebe6` (2026-03-08), the commit that added the gate.
  After the fix, on production: the screenshot task now returns **402 quoting
  $0.054 USDC**, and the search task returns the 401 that names the free
  capabilities.

  This bears directly on E1 and on "176 agents/week reach MCP; ~0 converted".
  It does not by itself explain zero conversion — arrivals are dominated by
  monitors and indexers, and nothing measures how many arrivals took the
  task-shaped route — so it is **a wall that was there**, not the wall. The
  honest follow-up is to attribute anonymous `/v1/do` arrivals by shape, which
  nothing does today.

- **The failure taxonomy's default direction is the F1 root cause, and it is now
  measured rather than argued** (2026-08-23, `scripts/f1-failure-attribution.ts`).
  Every distinct error string a failed transaction has carried in the 90-day
  window, run through `classifyTransactionFailure`: **541 strings, 280,945
  calls.** 154 strings and 47,582 calls land in `internal` — "everything else,
  OUR bug until proven otherwise" — which is the only class the quality floor
  counts against a capability. Applying deliberately conservative rules that
  claim a string only on positive evidence it is *not* about our code,
  **82.0% of those calls (39,039 of 47,582) are misattributed**, and that is a
  lower bound because anything unclaimed stays in "possibly ours". The largest
  single member is `fetch failed` — 13,874 calls across 26 capabilities, still
  arriving today — a bare runtime transport error that by construction says
  nothing about our logic. Also inside: 2,438 calls of **our own guards
  refusing correctly** (the paid-API budget guard, the redirect limiter, the
  reserved-IP-range refusal, documented coverage limits).

  Second-sourced on a different population: external paid traffic only, the
  only traffic the floor acts on. 446 failed calls, 92 of them `internal`; the
  same conservative rules claim 25%, and the bulk of the remainder is a vendor
  API quoting the *caller's* bad URL back at us ("Unable to download the file.
  Please verify the URL") — not claimed by the rules because the string names
  the vendor's error type rather than ours.

  **The repair is designed and deliberately not shipped today.** `internal`
  must stop being the fallback: it should be reachable only by positive match,
  with an `unclassified` class that leaves the correctness denominator and
  surfaces as an evidence shortfall so it is visible rather than silent. That
  touches `execution-outcome.ts` (WP4's authority, which writes
  `counts_against_capability` into the durable fact table) and
  `jobs/quality-floor.ts` — both under concurrent modification by the
  remediation programme — and LESSONS.md's three-strike rule forbids shipping a
  seventh single-string patch in its place. One thing checked and found *not*
  to be a blocker: both branches of `classifyExecutionOutcome` already set
  `billable: false`, so widening what the floor ignores does not change what
  any customer is charged.

- **176 agents/week reach MCP; ~0 converted.** The wall was a web signup form;
  fixed 2026-08-15 (#249) — x402 pay-per-call is now advertised at the point of
  refusal. Measure whether it moves.
- **x402 buyers buy utility primitives** (google-search, email-validate,
  keyword-suggest, translate), not the KYB wedge. Follow the money.
- **All revenue is one cluster — SEO and growth research.** Measured 2026-08-16:
  €129.09 over 30 days, which is half of the last 90 days' €252.73, so it is
  accelerating. The six biggest earners (`google-search`, `serp-analyze`,
  `email-validate`, `email-deliverability-check`, `brand-mention-search`,
  `keyword-suggest`) had **zero** failures. Of 98 active bundles exactly one is
  still selling — `lead-email-verify`, 60 sales, €0.20 — and it is a growth
  bundle; the €2.50 compliance bundles sold in April and stopped. Bundling
  raises revenue per call ~6.7× (`email-validate` €11.01/368 calls vs
  `lead-email-verify` €12.00/60).
- **Asked and answered, do not re-raise:** whether to re-point the company at
  SEO/growth and stop investing in compliance. Petter said **no** on 2026-08-16
  (DQ-9). Positioning is unchanged and compliance keeps its investment. The
  growth bundles are being built regardless — that was never part of the
  question. A future session reading the revenue table will reach the same
  conclusion I did; it has been put to him already.
- **Bundles that sell are cheap and narrow.** €0.20 is the only proven price.
  Everything at €0.27 and above has sold ≤4 times; `competitor-snapshot` at
  €1.54 has never sold. One question, three cheap steps, ~1.8× markup over
  parts.
- **Distinct-payer count is not yet measurable.** `x402_payer_hash` shipped
  2026-08-15; as of that date it holds **1 hash / 2 calls / €0.06** — that is
  the age of the instrument, not the size of the customer base. Any dashboard
  reading of "1 payer" before ~2026-08-22 is an artifact. Do not plan on it.
- **`failed_requests` is a partial demand signal.** Verified 2026-08-15: it is
  written only by `/v1/do` (four call sites in `routes/do.ts`), never by the
  x402 route — which is where nearly all revenue is. Catalog work must read
  x402 refusals too, or it will mine demand from the rail nobody pays on.
- **…but the x402 refusal capture is currently dominated by an automated
  enumerator, and must not be read as demand** (measured 2026-08-18). The
  instrument shows 1,317 `x402_not_on_rail` events, which reads as a large
  unmet-demand signal and is the single most misleading number on the platform
  right now. The evidence against that reading:
  - Every event falls in the ~41 hours since the instrument switched on
    (first row 2026-08-16 13:30). "1,317 over 14 days" is the age of the
    instrument, not the size of the demand — the same trap as DQ-10.
  - `user_id` is null on all 1,317, and the arrival rate is flat around the
    clock, ~26 distinct slugs per hour including 03:00 UTC.
  - The per-slug counts are near-uniform across unrelated capabilities
    (44/44/44/43/42/41/41/38/36/34…). Real demand is not uniform.
  - The same slug population appears under `x402_unknown_slug`, **including
    slugs that are live on the rail** (`us-company-data`, `screenshot-url`,
    `url-to-text`). A client with a genuine need does not ask for a slug it
    just successfully bought.

  Read together: one machine is walking the catalogue. **Do not rank catalog
  work off this table until the traffic is attributed.** What would falsify
  this: a payer hash or client attribution showing multiple distinct sources,
  or a non-uniform distribution once the enumerator is excluded. Attributing
  the source is the next measurement job, and it is a prerequisite for the
  catalog role using this table at all.
- ~98% of traffic is our own test harness. Every revenue/usage number must use
  the canonical internal-account filter.

- **The advertisement and the servability rule were two different rules, and
  the quality floor found the gap** (2026-08-22, fixed and deployed `c6a3b16`).
  The floor quarantined `url-to-markdown` — one of the eleven no-signup
  free-tier capabilities — at 05:58Z. `matchCapability` then refused it, as
  quarantine is designed to, while the 401 body kept listing it among "these
  11 capabilities are free with no signup". An agent doing exactly what the
  refusal instructed was refused again. Two more surfaces (`auth.ts`'s signup
  gate, `/v1/pricing`) carried hand-written slug literals that no query
  touched, so `/v1/pricing` had been advertising 5 of the 11 since before six
  of them existed. `lib/free-tier.ts` now produces every such list through
  `isServableCapability` — the WP8 predicate that decides whether the call
  gets served. **The generalisation: any list we publish must be generated by
  the predicate that answers the request, not by a second query that happens
  to agree today.**

- **The quarantine that exposed it was itself wrong, and the taxonomy gap E3
  found is not closed.** Reproducing the floor's population returned its exact
  numbers (15 eligible, 10 completed, 66.7%), so the arithmetic was right and
  the evidence was not: one correct no-content refusal, two target-site HTTP
  400s, two target-site HTTP 429s — no defect among them. The refusal now
  classifies `caller_input`. **This is the fifth time an instrument has scored
  "no evidence" or "not our fault" as "evidence of our defect"** (DQ-12, E3,
  #341, #346, and now this). What is different here is the blast radius: the
  floor's remedy withdraws the *free* surface, which the floor deliberately
  does not measure — free-tier calls are excluded from its population as an
  anti-Sybil measure. So a capability can be delisted from the front door on
  the evidence of fifteen paid calls while its actual usage is invisible to
  the decision. That asymmetry is unfixed and is the next thing to look at in
  the floor.
- **The harness does not measure what customers experience** (found 2026-08-16).
  Three capabilities score 100% on the internal harness over a full week while
  the quality floor delisted them for 39–59% completion on real paid calls:
  `url-to-text` 425/425 vs 39% (18 calls), `brazilian-company-data` 455/455 vs
  59% (29), `screenshot-url` 518/518 vs 55% (47). Harness green is therefore not
  evidence a capability works; only real traffic is. Any decision that reads a
  pass rate must say which instrument produced it.
- **The floor counts correct refusals as capability faults.** Verified by running
  `classifyTransactionFailure` over the actual error strings: `"Invalid URL
  format."`, `"This URL targets a restricted address."` (our own SSRF guard
  working), `No US company found matching "…"` and registry `HTTP 404` all
  classify as `internal` and count against the floor, while the sibling string
  `No confident SEC EDGAR match` is correctly `caller_input`. The floor is armed
  in **enforce** mode, so this actively removes working capabilities from the
  catalogue and from x402. `us-company-data` was delisted at "64% completion on
  11 calls" — 7 successes, 1 genuine upstream 500, and the rest caller input.
- **The harness also fails the other way: it blamed capabilities for the world.**
  Measured 2026-08-17. Ten capabilities were emitting "ALGORITHMIC CORRECTNESS
  VIOLATION — correctness 0%" every ~36 minutes for over 24 hours (~400 Tier-1
  alerts/day) while **every one of them answered correctly when called directly
  on production**. The invariant counted a test-budget guard (whose own message
  reads "Customer traffic is unaffected"), an expired vendor token, upstream
  5xx/429s and timeouts as evidence of broken capability logic. Its premise —
  "algorithmic capabilities have zero environmental variability" — is false:
  `transparency_tag` describes how an answer is derived, not whether the
  capability makes a network call. Fixed 2026-08-17 (#305): environmental
  failures leave the denominator and report at Tier 2 instead. Six capabilities
  went quiet; seven still violate and are genuine.
- **The Codebase Quality Program's exit measurement passed** (T4.3, run
  2026-08-19 on the clean 24h window it was deferred for). **3 capabilities
  under 90%** against a ≤5 target, down from 30 at program start, across 210
  capabilities and 13,779 runs: `uk-gazette-notice-search` 60.0% (vendor API
  returns 500 to everyone — DQ-14 item 2, Petter to file),
  `eu-regulation-search` 60.4% (**not a capability fault at all** — every
  failure was the fixture-staleness guard; #341 stopped it being *scored* as a
  defect and #346, 2026-08-21, removed the churn that was firing it) and
  `canadian-company-data` 88.1%. Cross-checked at 12h/48h/7d: the same three
  dominate, and the 7d window additionally carries pre-fix rows from the
  program's own remediation, which is why the clean window was the one
  specified.

- **The seven fixture-contract bugs are closed.** `iso-country-lookup`,
  `skill-extract`, `company-id-detect`, `incoterms-explain`,
  `dangerous-goods-classify`, `beneficial-ownership-lookup` and `name-parse`
  were all failing on `guaranteed_field_missing` or `high_null_ratio` while
  answering correctly in production — fixtures asserting a flattened shape
  against a nested response. Re-measured 2026-08-21: **every one is at 100%
  over 48h** (144, 138, 143, 143, 144, 214 and 143 runs respectively). Blocks
  0090/0091 realigned the declared contracts and the suites followed. Nothing
  is owed here; do not re-open it from this file's history.
- **`screenshot-url`'s `waitForSelector` bug is fixed** (re-checked 2026-08-19).
  The entry below is kept because the *diagnosis* was right and worth
  remembering; the defect itself is gone. `screenshot-url.ts` on `main` carries
  the v1/v2 wait-dialect probe (`toV1WaitFor`, `waitDialectByHost`), and over
  the last 14 days external traffic shows **one call, completed, no error** —
  so the fix is confirmed by real traffic, not just by reading the file. The
  original finding: 23 of its 25 real failures were
  `HTTP 400: "waitForSelector" is not allowed` — a parameter *we* sent that
  Browserless rejected. Deterministic, ours, and invisible to the harness.

- **The instrument blamed the capability a third time, by a third route**
  (found and fixed 2026-08-19, #341). The fixture-staleness guard records
  `passed: false` with a message ending "Not evidence about the capability" —
  and then three consumers scored it as exactly that. `classifyTransactionFailure`
  returned `internal` ("OUR bug until proven otherwise"), so it counted in the
  correctness denominator, *despite the emitting function's own docstring
  asserting it was classified `config` and excluded* — the docstring was
  untrue and nothing had ever checked. `checkNewFailures` opened regressions on
  it: `eu-regulation-search` was reported "was passing (100% over 10 runs), now
  failing" three times on 2026-08-18 while answering correctly. And
  `SingleTestResult` never declared `failureClassification`, so all four
  consumers read it through `(r as any)` and got `undefined` — which is why
  **14 of 14 production `infrastructure_alert` events grouped as
  `{"unknown": 6}`**. A detector built to name the common cause of a systemic
  failure had never once named one.

  The lesson generalises past this fix: **DQ-12, E3 and this are the same bug
  three times.** An instrument that knows it lacks evidence must be wired so
  "no evidence" cannot be scored as "evidence of a defect" — and a comment
  claiming that wiring exists is not the wiring.

- **A fourth time, and this one had a cause upstream of the instrument**
  (found and fixed 2026-08-21, #346). #341 stopped the fixture-staleness guard
  being *scored* as a capability defect. It did not ask why the guard was
  firing at all. The answer: startup-migration blocks 0066 and 0069 both derive
  `test_suites.scheduled_testing_eligible`, from different sources — 0066 from
  `external_cost_cents`, 0069 from `capabilities.cost_class` — and both run on
  every boot. Wherever the sources disagree the flag flips twice per boot, and
  neither post-condition notices because each checks only its own derivation
  immediately after its own write. **381 suites flipped one way and straight
  back on every deploy**; the 381 rows sharing an `updated_at` of
  2026-08-20 21:03:36 are that churn, recorded in the table.

  Both UPDATEs stamped `updated_at = NOW()`, and `checkBaselineStaleness` reads
  `updated_at` as "this suite's content was edited" — so a scheduling-flag
  write invalidated 12 fixture baselines every deploy. Ten re-ran live for
  free; two could not. `eu-regulation-search`'s `known_bad` and `edge_case`
  cost 1¢ a call, so the guard refused to re-baseline and wrote `passed: false`
  instead, permanently. **That is the whole of its 51% over 24h and of the
  60.4% in the T4.3 exit measurement above** — the entry there was right that
  it was "not a capability fault at all", and now names what it actually was.

  Fixed: neither eligibility UPDATE touches `updated_at`; 0066 and 0069
  partition the table so they cannot contradict each other; block 0094 cleared
  the two poisoned baselines for live recapture. Verified against production
  after the deploy — **0 suites bumped, 0 stale_input writes, both baselines
  cleared.** The generalisation stands with one addition: *a metadata write
  must not be recorded in a field something else reads as a content edit.*

- **The quality floor's "daily" tick is in practice deploy-driven.** Its
  interval is 24h with a 15-minute startup delay, so in a week of frequent
  merges it evaluates once per boot: 8 deploys on 2026-08-18 produced 8 ticks,
  and the 16-hour silence afterwards was simply the absence of a ninth deploy,
  not an outage. Worth knowing before reading tick cadence as a health signal —
  it cost most of an hour on 2026-08-19 before the interval constant explained
  it. The self-throttle ("3 quarantines per run") is therefore per *deploy*,
  not per day; harmless while decisions are 0, but it is not the documented
  bound.

## Active experiments (M1)

| id | bet | measure | kill criterion |
|---|---|---|---|
| E1 | Advertising x402 at MCP refusal converts arrivals | refusal→x402-call rate, distinct payers | no lift after 14d |
| E2 | Funnel instrumentation reveals the biggest drop | step ratios in weekly rollup | n/a (measurement) |
| E3 | Capabilities are being delisted for refusing bad input, not for failing. Fixing the failure taxonomy re-lists working inventory | count of capabilities the floor would quarantine before vs after; catalogue size | no capability changes verdict — then the floor is right and the capabilities are genuinely broken |
| E4 | The four growth bundles sell once they are payable. They were built 2026-08-16 under DQ-9 and sat listed-but-unpayable (`x402_enabled = false`) until 2026-08-18 — every euro arrives over x402, so they had earned nothing by construction | external sales of `competitor-read` / `page-seo-check` / `prospect-brief` / `keyword-scout` | zero sales across all four in 14 days on the rail — then bundle demand does not generalise beyond `lead-email-verify` and we stop building them |

**E4 at day 3 of 14 (2026-08-21): zero external sales across all four.** All
four are confirmed live and payable — present in `/x402/catalog`'s `solutions`
list, checked directly. The control is healthy and getting healthier:
`lead-email-verify` took **79 external orders for €15.80 in 35 days**, last one
2026-08-20. Three days is far too early to read, and the kill criterion does not
fire until 2026-09-01. One measurement note for whoever checks next: bundles are
`solution_slug` on `transactions` and they live in the catalog's `solutions`
array, **not** `capabilities` — reading only the capability list makes every
bundle look delisted. It did so here for about a minute this morning.

**E4 RESULT (2026-08-29, day 11 of 14): the cohort failed, and the confound the
2026-08-28 run feared is not present.** The kill criterion is met three days
early and on cleaner evidence than the criterion itself asks for.

Since the four became payable on 2026-08-18, counted to the day over the
canonical external population: the cohort took **0 orders**, `lead-email-verify`
took **8**. No other bundle sold at all in that window. All five are present and
payable in `/x402/catalog`'s `solutions` list right now, and `competitor-read`
is priced identically to the control at $0.216 — so this is neither a listing
artefact nor a price artefact. Two of the four cost more than the control
($0.324, $0.594) and that remains an untested alternative explanation, noted
rather than claimed.

**Why the 2026-08-28 confound dissolved.** That run saw the control fall from 26
orders in the week of 08-17 to 3 in the week of 08-24 and concluded that "these
four do not sell" and "bundle demand is down generally" were indistinguishable.
They are distinguishable, and the same run had already written down the number
that separates them — "8 orders / €1.60 since 08-18". Counted by week the
control looks like it took 29 orders inside the trial; counted by day it took 8,
because **21 of those 26 landed on Monday 08-17, the day before the cohort could
be bought at all.** Bundle demand did soften; it did not stop. The cohort has
never taken a single order in its life, which is a different shape from a
decline.

**What this settles and what it does not.** E4's own terms — "then bundle demand
does not generalise beyond `lead-email-verify` and we stop building them" — are
met: **stop building growth bundles of this kind.** It does not say the four
should be delisted; they cost nothing to leave listed and a later sale is
information. It does not condemn bundles as a form — `lead-email-verify` still
sells every week, and the one buyer who paid us by card was assembling a
multi-entity comparison by hand at €1.00 a call. The lesson is narrower and more
useful: bundles sell when they package something a buyer was already doing, and
not when they package something we thought a buyer might want.

*Measured by `lib/metrics/bundles.ts` (`bundleSales` + `cohortVerdict`), which
was written for this question and can return `confounded` as a first-class
answer. The trial window is counted by date, never by week — see that module's
note on why the week-bucketed first draft biased toward killing cohorts.*

**E3 result (2026-08-16, shipped `f19f9f8`): partly confirmed, and the "partly"
is the useful half.** One capability changes verdict — `us-company-data`, which
the floor really did quarantine on 2026-08-12 at "64% completion on 11 calls"
and which now computes **100% (7/7)**: its 11 calls were 7 successes, 1 genuine
SEC 500, and 3 caller-input failures. `tech-stack-detect` 78% → 94%,
`github-repo-analyze` 94% → 100%, `sitemap-parse` 73% → 80%, `company-enrich`
75% → 86%.

The kill criterion did not fire, but it nearly did: `url-to-text` (40% → 60%)
and `price-compare` (44% → 50%) stay below the floor, so their failures are
real and the floor was right about them. Across 30 days of external paid
traffic, 19 distinct error strings and 55 calls change class, **all** from
`internal` to `caller_input`, none the other way.

So the honest reading is: misattribution was real and is now fixed, but it was
not hiding a large pool of healthy inventory. Exactly one capability is owed a
re-listing. **That re-listing has since happened** — verified on production
2026-08-21: `us-company-data` is `is_active = true`, `x402_enabled = true`, and
present in `/x402/catalog`. This paragraph previously read "has not happened,
it is the first action of the next session"; it was, and the note went stale.
Nothing is owed here.

New experiments enter here with a kill criterion or they don't run.

## Standing constraints

Lawful only, no grey zones (scraping doctrine DEC-20260428-A/DEC-20260813-A).
€50/week external spend. Quality floor and refusal semantics are not trading
material — trust is the product.
