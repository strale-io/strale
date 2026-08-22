# Strale Goals — the document every agent reads first

**Reviewed:** 2026-08-22 · next review at each Sunday synthesis · quarterly deep review.

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
