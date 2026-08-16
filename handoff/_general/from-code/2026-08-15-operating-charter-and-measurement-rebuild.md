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

---

# Part two — after the close-out (2026-08-16)

The session continued past what looked like its end. Five more things happened,
and three of them are refusals to build, which is the pattern worth noticing.

## Mexico: right token, wrong API, and parked anyway

Petter's INEGI token is valid — it returns HTTP 200 and real data (Mexico's 2020
population). It is an **Indicadores** (statistics) token. DENUE, the business
directory we wanted, is a separate service needing its own. **I sent him to a
generic INEGI registration page** because DENUE's own link was unreachable in
its docs, and my follow-up advice — check for an activation link, verify the
characters — could never have found it, since nothing was wrong with the token.
Only the email he forwarded named the API.

Parked rather than re-registered, on evidence: **zero** requests mentioning
Mexico in 180 days, and the 17 company-data capabilities we already run earned
**€2.15 externally over 90 days** while our one paying customer has never made a
single company-data call. The DENUE method signatures are banked in DQ-3.

## The Coinbase email: withdrawn before sending

Petter asked whether "41 of 334 endpoints indexed" was real. It was not. A
complete walk of all 14,946 Bazaar entries finds **95**, and the email's own
"not indexed" worked example was indexed. The mechanism is now established:
**the Bazaar lists exactly what settled an x402 payment in the trailing 30
days** — exact fit both directions, zero exceptions, sharp boundary at 28 and
35 days.

Consequence: Bazaar presence is **earned by sales and expires when they stop**.
The "8× shelf presence" plan was circular — it needed sales to produce the
sales it was meant to produce. Treat the listing count as a trailing indicator
of revenue, never a lever on it.

## Four growth initiatives, run down

1. **Unmet demand on the paying rail — SHIPPED.** `failed_requests` only ever
   recorded misses from `/v1/do`; x402 recorded nothing. Three rejection sites
   now record, splitting *unknown slug* (catalogue signal) from *rejected input*
   (product signal). No customer content stored. First readings within a week.
2. **`company-enrich` parse bug — already fixed** in PR #214. Ten minutes of
   checking saved building a fix for a fixed bug.
3. **Other x402 registries — mostly not a lever.** Most mirror the CDP index and
   inherit its settlement-derived property.
4. **Free tier — not a funnel.** Only **2 external actors** used it in 90 days.
   The finding is not "it doesn't convert" but "nobody finds it". The storefront
   now names all eleven free capabilities; re-measure in a fortnight.

## Budget alerts: the guard was right, the channel was wrong

Four `[Strale WARNING] [budget]` emails overnight. All eleven alerting
capabilities are `free_quota` with **zero external cost** — no money was being
spent. A daily window resets daily, so a harness that reliably consumes 80% of
it warns every morning for ever. Now rate-limited to once per capability per
threshold per week; the per-window flags and the refusals are untouched.

**Found while looking, and not acted on: 107,007 test executions against 674
customer calls in seven days — 159 tests per customer call — with 15% of tests
on capabilities no customer has ever bought.** Set against the earlier finding
that the harness passes while customers hit ~9% failures, the picture is that we
test enormously, uniformly, and not for the thing that matters. **This is the
single biggest open question and belongs on the Sunday agenda**, not to a
reflexive trim of something that protects us.

## The pattern in part two

Five investigations, three of which ended in *not building*: Mexico, the
Coinbase email, and `company-enrich`. Each was killed by a cheap check that
came before the work. The one thing built — demand capture — exists precisely
because we had no way to know what to build.

## Still open

**Petter:** Talentino, Gryhat, Pave (registered, therefore contactable).
Add the Indicadores token to Railway only if we ever use it. Sunday review.

**Claude:** PR #135 (Italian, owned, deadline the next check-in). The 159:1
testing ratio, for Sunday. Smithery's real listing URL.

**Time, not people:** trustworthy payer numbers ~22 August. Nothing shipped
today about distribution is measurable before then.
