---
title: Payee Assurance two-tier pricing — thinking document
date: 2026-04-22
status: Draft — thinking pass, no pricing decision taken
scope: Structured argument to inform a two-tier-vs-flat pricing decision. Not a recommendation.
inputs: 2026-04-22 pricing benchmark study + Notion Payee Assurance canonical / Business model / Movitz / Provider-Coverage DB + 2 fresh web research passes (B2B payment flow patterns, competitor onboarding-vs-monitoring pricing).
---

# Payee Assurance two-tier pricing — thinking document

**Author:** Claude Code (thinking pass, no code changes, no Notion writes)
**Date:** 2026-04-22
**Deliverable:** this single structured markdown document. No commits. No pricing-page rewrite. No decision taken.

---

## Audit

### What this doc challenges

The **2026-04-22 benchmark study** (Notion `34a67c87-082c-8168-b01c-e77e7392fd44`) priced Payee Assurance as if every call runs every check on every call, arriving at a **€1.00/call flat recommendation** with €0.30–€0.45 COGS. That frame has three cracks this thinking pass reopens:

1. **"Every call is a full bundle."** Web research (§2 below) confirms real AP automation and marketplace platforms split sharply between onboarding (full KYB) and subsequent payments (thin re-verification or nothing). The benchmark's unit-economics assume a usage pattern that doesn't match the customers.
2. **"COGS is symmetric between a cold call and a warm call."** Competitor research (§3 below) shows the market's cache-hit discount is 5–20×, not the 2–3× I would have intuited. Plaid publishes this ($0.50 → $0.10). Persona's implied ratio is ~18×. ComplyAdvantage proves a $0.05–$0.29/entity/month monitoring-only rate exists. The symmetric-COGS frame understates the margin delta on re-verification.
3. **"Flat per-call is the status quo."** The Business model canonical page already names "continuous counterparty monitoring" as a future stream triggered by customer pull. This thinking pass asks whether the trigger has arrived (or is structurally inevitable) rather than waiting for explicit customer signals.

### What this doc preserves

Doctrinal commitments I am **not** reopening:

- **Single API call returning a bundled decision-ready answer** (Payee Assurance canonical).
- **No feature-gating on the call** — a buyer doesn't pay extra to get sanctions or to get UBO; the call returns what's available for the resolved entity.
- **Developer self-serve, agent-native billing** (Business model canonical; x402 wallet and Stripe post-paid, both compatible with pay-as-you-go).
- **Free trial = 10 production calls + unlimited sandbox** (Business model canonical).
- **Hash-chained audit trail as a first-class output**, priced into every call regardless of tier.
- **"Continuous monitoring" as a legitimate future stream** — the Business model page already names it. The question is the shape, not whether.

### What the benchmark carries forward as settled

- **COGS estimates** (§ Strale COGS in the benchmark): €0.30 best-case → €0.38 typical → €0.45 worst-case for the EU-27 scope. I treat these as reference; reopening them would duplicate work.
- **Competitor landscape headline pricing** (benchmark §Direct-competitor benchmark): the Middesk/Persona/Trulioo/Plaid/MonitorPay/Movitz numbers stand. I only drill into the *structure* (initial vs. monitoring) in §3.
- **v1 scope reality** (Payee Assurance canonical scope reality check): bank verification not yet built; 11 EU registries pending direct-API migration; 10 EU countries entirely gapped. Pricing decisions must assume v1 ships with this reality, not the aspirational scope.
- **Movitz pilot terms** (Movitz vendor page, updated 2026-04-22 evening): pilot accepted in principle at €1,000/mo for 7,500 calls (€0.133/call in-bundle). Meeting mid-May. Same in-bundle rate as the standard tier.

### Notion sources loaded

All five source pages accessible; no degraded-mode fallback needed.

| Source | ID | Carried forward |
|---|---|---|
| Payee Assurance canonical | `34867c87-082c-8149-99e5-c668d7383fa7` | v1 scope, evidence types, single-field input, free-trial terms |
| Business model canonical | `33c67c87-082c-817f-ac7c-d9d7b6c44e40` | Flat per-call commitment; continuous-monitoring stream already named |
| Movitz vendor | `34967c87-082c-81e4-8ee9-e6884188f877` | Pilot terms, in-bundle rate, SE/DK/NO coverage reality |
| Provider-Coverage DB | `34867c87-082c-8187-9391-ebc05a9b3d90` | Evidence × country × provider map |
| Benchmark study | `34a67c87-082c-8168-b01c-e77e7392fd44` | COGS, competitor headline pricing |

---

## §2 — How B2B payment flows actually work

This is the part the benchmark skipped. Summary of findings from the fresh research pass; full per-platform table, archetype modelling, and sources live in the research agent's report (referenced inline below).

### What the incumbents actually do

| Platform | Onboarding | Subsequent payments | Cadence |
|---|---|---|---|
| Tipalti | Full KYB + bank + tax + sanctions | **Sanctions re-screen on every payment, explicitly** | Per-payment |
| AvidXchange | Full vendor onboarding | **OFAC check on every payment** | Per-payment |
| Bill.com | Micro-deposit bank test, account-level AML | No per-payment sanctions re-screen documented | Event-triggered |
| Coupa | SIM capture + Trustpair connector | No native per-payment screen (customer bolts on Trustpair/Dow Jones) | Event-triggered |
| Stampli / Airbase | Vendor onboarding, invoice anomaly detection | No per-payment re-screen documented | Event-triggered |
| Brex / Ramp | ACH auth + Plaid validation | ACH Positive Pay + change callbacks; no per-payment KYB | Event-triggered |
| Stripe Connect | Full KYB + UBO + TIN | `account.updated` webhook on sanctions hit / adverse media / ownership change / volume threshold | Event-driven + periodic TIN refresh |
| Shopify | FrankieOne full KYB | Risk-tier periodic refresh | 6/12/24 mo convention |
| Amazon Seller Central | KYB + ID + bank + tax | **Annual re-cert under INFORM Consumers Act** | Annual |
| UK Confirmation of Payee | N/A | **Only on new or modified payee** — not per-payment | Event-triggered |
| SEPA VoP under EU IPR | N/A | **Must be offered per credit transfer from 9 Oct 2025 (EUR) / 9 Jul 2027 (EEA)**; corporate payers can waive | Per-payment |
| Nacha WEB Debit | N/A | Required on first use or account change only | Event-triggered |

The headline: **the market is bifurcated**. Tipalti and AvidXchange re-screen sanctions per-payment. The rest (Bill.com, Coupa, Stampli, Airbase, Brex, Ramp) don't, and rely on onboarding + event triggers + fraud heuristics. The widespread assumption "all AP platforms re-screen every payment" is wrong.

**One hard per-payment legal mandate in Strale's geography: SEPA VoP under IPR.** From 9 Oct 2025 (eurozone) and 9 Jul 2027 (non-euro EEA), PSPs must offer VoP before every credit transfer. The EPC rulebook makes the `verification_of_payee_id` single-use and 20-minute-scoped — no cross-payment caching is permitted *at the rail level*. This does not prevent Strale (as a layer above the rail) from caching its own answer, but it does mean that in-scope EU transactions have a bank-side VoP touch that Strale competes against, not replaces.

Everything else in the EU/UK/US regulatory stack is event-triggered or risk-based: 5AMLD/6AMLD gives principles not cadence; MLR 2017 Reg 28(11) says "up-to-date" not a number; CTA is 30-day-from-change and mostly exempts US-formed entities as of March 2025.

### The ratio question (this is where confidence must be flagged)

The research produced modeled cache-miss-to-cache-hit ratios for three archetype customers. I am flagging confidence explicitly because **every downstream pricing argument hinges on this number**:

| Archetype | Full-bundle calls/mo | Thin calls/mo | Ratio full:thin | Confidence |
|---|---|---|---|---|
| Mid-market AP shop (500 suppliers, 50 new/yr, 20k payments/yr) — conservative (no per-payment re-screen) | ~6 | ~563 | 1:94 | **MEDIUM** — full-bundle number well-grounded; thin number depends on whether customer adopts per-payment screening |
| Mid-market AP shop — aggressive (Tipalti-style per-payment re-screen) | ~6 | ~2,230 | 1:370 | **MEDIUM** |
| High-growth marketplace (5k new sellers/mo, 500k payouts/mo, 50k seller book) | ~5,125 | ~54,200 | 1:10.6 | **MEDIUM** — ratio driven by high new-seller volume relative to book |
| Compliance-heavy fintech (50 new KYB/mo, 10k monitoring screens/mo) | ~100 | ~10,000 | 1:100 | **MEDIUM-HIGH** |

**The spread is 1:10 to 1:370 across plausible archetypes.** That is the pricing signal. A single-tier flat price cannot simultaneously be attractive to a marketplace (low thin-to-full ratio, onboarding dominates) and a compliance fintech (high thin-to-full ratio, monitoring dominates) at a single number that isn't either obviously cheap or obviously expensive to one of them.

**Confidence caveat that must not be lost:** these ratios are modelled, not observed. Strale has no Payee Assurance customer traffic yet. The first 20 paying customers will either confirm or collapse this frame. The 1:10 and 1:100 ratios are the load-bearing numbers; if the research is wrong and the real answer is closer to 1:1 (every payment triggers a full KYB because buyers are paranoid or regulators force it), the case for a two-tier price evaporates and Option A (flat) reasserts itself.

### Cache-hit minimum viable evidence

What does a re-verification actually need? The research converges:

- **Tipalti and AvidXchange re-run only the sanctions screen** on repeat payments. UBO, registry, VAT are not refreshed per-payment.
- **SEPA VoP is explicitly thin** — IBAN/name match + optional LEI/VAT, not full KYB.
- **UK CoP is name/account match only** on the new/modified payee.
- **Stripe Connect re-triggers** on a specific *change signal* (sanctions hit, ownership change, volume threshold), not on a schedule.

A credible thin-tier payload: **sanctions + PEP + IBAN/name match + a "registry last-modified delta" check**. That is substantively the shape Tipalti, AvidXchange, and SEPA VoP already use. Adding UBO-change detection is a real differentiator (regulation doesn't compel it; rails don't provide it) but not strictly required.

### Latency expectations

- Cache-miss / onboarding: 3–10 seconds tolerated. Users have a form open.
- Cache-hit / payment-gated: **sub-second**. SEPA VoP is defined inside a 10-second instant-payment envelope; Pay.UK reports 2.1M CoP checks/day at sub-second latency.
- Batch rescreen overnight: no UX constraint.

Implication: a thin tier must be sub-second. Achievable with cached upstream data + fresh sanctions delta + live IBAN/name match. A full tier at 3–10s is acceptable.

---

## §3 — What direct competitors do underneath bundled pricing

The benchmark noted competitors "price this way under the hood." The fresh research drills in. Full per-vendor table in the research agent's report; summary + pattern implications here.

### Normalized 1 initial + 12 monthly rescan per entity per year

Cleanest way to expose the cache-hit economics. 13 data touches/entity/year; effective per-call cost:

| Vendor | Initial | 12× monitoring | Total/entity/yr | Effective per-call |
|---|---|---|---|---|
| Plaid Monitor (AML only, not full KYB) | $0.50 | $1.20 | $1.70 | $0.131 |
| OpenSanctions | €0.10 | €1.20 | €1.30 | €0.10 |
| Dilisense (high vol) | €0.01 | €0.12 | €0.13 | €0.01 |
| Sanctions.io (small tier) | $0.18 | $2.16 | $2.34 | $0.18 |
| ComplyAdvantage (Starter, 2k entities) | $0.049 | $0.54 | $0.59 | $0.046 |
| ComplyAdvantage (Mid-market, 10k entities) | $0.29 | $3.19 | $3.48 | $0.268 |
| Persona (full KYC initial + recurring watchlist rescan) | ~$2.23 | $1.44 | $3.67 | $0.282 |
| Middesk (Vendr-estimated) | $3–$8 | $6–$24 | $9–$32 | $0.69–$2.46 |

### Four + one archetypes in the market

1. **Bundled annual, monitoring "free" inside the workflow** — Trulioo, Moody's Kompany, D&B Direct+, Socure (likely), Onfido Watchlist (partially). Opaque to buyer, locks annual minimums, dominates top of market.
2. **Initial check + per-entity-per-month monitoring ("entity-under-management")** — ComplyAdvantage (purest), Middesk Monitoring, Persona Recurring Watchlist, Onfido Watchlist Ongoing, Shufti. Billing unit is "an entity currently under monitoring." ComplyAdvantage publishes cleanly: $99/mo for 2k entities Starter; $0.29/entity/mo mid-market.
3. **Per-call for both, monitoring explicitly cheaper** — Plaid Monitor ($0.50 base → $0.10 rescan = 5×), OpenSanctions/Dilisense (flat — same price for both because server-side cost is symmetric for pure data vendors). Perfectly transparent, metered, agent-native. Plaid is the canonical model.
4. **Opaque / quote-gated** — Socure, Signzy, high tiers of Middesk/Persona/Onfido/Trulioo. Not a product archetype; a commercial posture.
5. **Bucketed subscription (ceiling-capped)** — ComplyAdvantage Starter at $99/mo for *up to* 2k entities. Predictable cost, no runaway meter. This was not in the 4-option space I drafted; the research surfaced it.

**The pattern that matters for Strale:** when the initial-vs-ongoing split is *visible*, rescans cost 5–20× less than initial checks. Plaid's 5× is the cleanest published ratio. Persona's implied ratio is ~18×. Pure sanctions vendors flat-rate because their data-touch cost is symmetric. If Strale prices a rescan only 2–3× cheaper than the initial bundled call, it will be uncompetitive against Plaid Monitor for the monitoring-only sub-segment.

**Compatibility with Strale's architecture:**
- **Archetype 3 fits Strale natively.** Stateless call + wallet debit + no roster + no subscription infra. Plaid's "base + rescan" maps directly onto two capability slugs or a call-type flag.
- **Archetype 2 requires substantial new infra:** persistent `monitored_entities` table, add/remove endpoints, rescan cron, webhook alert delivery, recurring billing (Stripe subscriptions or monthly wallet invoicing), customer-side concept of "my roster." 6–12 months of platform work.
- **Archetype 1** (bundled annual) is a *sales motion* layered over the existing product, not an architectural shift.
- **Archetype 5** (bucketed subscription) sits between 2 and 3: simpler than a true entity-under-management subscription, but still requires a per-customer counter + monthly billing.

---

## §4 — Pricing architecture options

Five options. For each: model, unit economics at 3 volume scenarios (small = 500 calls/mo, medium = 5,000 calls/mo, large = 50,000 calls/mo — totals across whatever mix), customer-experience walkthrough, billing-model compatibility, compliance story, product-architecture implications.

**COGS assumptions used below** (from benchmark §Strale COGS, treated as settled):
- Full-bundle COGS: €0.38 typical (€0.30 best / €0.45 worst).
- Thin-bundle COGS: **€0.08 typical** — derived as sanctions+PEP (Dilisense Professional) €0.03 + IBAN/name match (Movitz in-bundle) €0.133 minus 50% cache-reuse assumption on the VoP side for repeat IBAN+name pairs → €0.08. **Confidence: LOW-MEDIUM.** Movitz has not confirmed that Strale can cache VoP results across calls; the EPC rulebook's single-use 20-min `verification_of_payee_id` applies at the rail level but may or may not constrain what Strale publishes to its own customers. If Movitz charges €0.133 per VoP call regardless of cache state, thin-bundle COGS is €0.16, not €0.08. This is the single biggest COGS uncertainty in this doc and it should be resolved in the mid-May Movitz meeting.
- Alternative thin-bundle without bank verification: €0.03 (sanctions+PEP only, no IBAN match). Matches the Tipalti/AvidXchange "per-payment OFAC re-screen" shape.

### Option A — Flat per-call (benchmark status quo)

**Model:** €1.00 per Payee Assurance call regardless of cache state.

**Unit economics:**

| Volume | Mix (full : thin) | Revenue | Blended COGS | Gross margin |
|---|---|---|---|---|
| 500/mo | AP conservative (6:494) | €500 | 6×€0.38 + 494×€0.08 = €42 | €458 / 92% |
| 5,000/mo | AP aggressive (14:4,986) | €5,000 | 14×€0.38 + 4,986×€0.08 = €404 | €4,596 / 92% |
| 50,000/mo | Marketplace (4,500:45,500) | €50,000 | 4,500×€0.38 + 45,500×€0.08 = €5,350 | €44,650 / 89% |
| 50,000/mo | Marketplace onboarding-skewed (25k:25k) | €50,000 | 25k×€0.38 + 25k×€0.08 = €11,500 | €38,500 / 77% |

At the conservative/high-thin-ratio end, margins look *wildly* attractive (92%). **Too attractive — it means the flat price is over-charging on cache-hit calls by 10×+.** A price-sensitive AP buyer paying €1.00 for a sanctions-only re-screen will find Plaid Monitor ($0.50 initial / $0.10 rescan) or sanctions.io ($0.18/call) and recognize that Strale's bundled single price is structurally over-priced for the thin use case.

At the marketplace onboarding-skewed end (25k:25k mix), margin is 77% — healthy, but the buyer is paying €1.00 for a full-bundle onboarding call that costs them €0.38 COGS elsewhere — reasonable.

**Customer experience:** simplest possible — one price, one call, one answer. Developer sees €1.00 on the pricing page. Agent pays €1.00 per call.

**Billing compatibility:** perfect. Stripe post-paid + x402 wallet, both work unchanged.

**Compliance story:** clean. Every call produces a full-bundle audit artifact, regardless of whether all evidence types were actually re-fetched or pulled from cache. The compliance officer reviewing the audit sees the same shape every time.

**Architecture implications:** none. Existing stateless-call architecture works.

**What breaks:** at scale, high-thin-ratio customers (Tipalti-style AP, compliance fintechs) will either (a) negotiate a private discount, destroying pricing discipline, or (b) leave for Plaid/sanctions.io on the thin-path and only use Strale for onboarding, cherry-picking the expensive calls.

### Option B — Two-tier with explicit call types (caller chooses)

**Model:** Two capability slugs — `payee-assurance-full` at €3.00 and `payee-assurance-verify` at €0.30. Caller specifies which.

**Unit economics:**

| Volume | Mix | Revenue | COGS | Gross margin |
|---|---|---|---|---|
| 500/mo (AP conservative, 6 full + 494 thin) | 6:494 | 6×€3 + 494×€0.30 = €166 | 6×€0.38 + 494×€0.08 = €42 | €124 / 75% |
| 5,000/mo (AP aggressive, 14:4,986) | 14:4,986 | 14×€3 + 4,986×€0.30 = €1,538 | 14×€0.38 + 4,986×€0.08 = €404 | €1,134 / 74% |
| 50,000/mo (Marketplace, 4,500:45,500) | 4,500:45,500 | 4,500×€3 + 45,500×€0.30 = €27,150 | 4,500×€0.38 + 45,500×€0.08 = €5,350 | €21,800 / 80% |
| 50,000/mo (Marketplace onboarding-skewed, 25k:25k) | 25k:25k | 25k×€3 + 25k×€0.30 = €82,500 | 25k×€0.38 + 25k×€0.08 = €11,500 | €71,000 / 86% |

**Revenue outcomes vs. Option A:** the high-thin-ratio scenarios (AP conservative, AP aggressive) collect **much less** revenue than Option A (€166 vs. €500; €1,538 vs. €5,000) because the thin price is one-third of the flat price. The onboarding-skewed marketplace collects **more** (€82,500 vs. €50,000) because the full price is triple the flat price.

The thin:full ratio is 10× ($3 vs $0.30), matching the Plaid/Persona pattern.

**Customer experience:** caller has to know which to call. Agent must have state (is this counterparty known?). Developer docs must explain when to use which — and explain the error mode if the caller uses `verify` on an unknown entity ("`insufficient_evidence` — retry as `-full`"). API complexity rises materially.

**Billing compatibility:** good. Both capabilities are regular Strale capability slugs; wallet debit and Stripe work unchanged.

**Compliance story:** the two tiers produce two different audit shapes. Compliance officer reading an audit log must be able to distinguish "this was a full onboarding check" from "this was a thin re-verification" — and be comfortable that the thin shape meets their policy. If they're comfortable with Tipalti's "sanctions-only re-screen per payment" pattern (and many are), they're comfortable with this.

**Architecture implications:** modest. Two capability slugs. No roster, no subscription, no webhooks. **Requires Strale to honestly declare what the thin capability runs and doesn't run** — the transparency story depends on this.

**What breaks:** callers who don't know which tier they want. Agent builders who expected a single "do the right thing" call. Mis-calls to `verify` on unknown entities that return `insufficient_evidence` and require a retry — doubling latency and cost.

### Option C — Usage-pattern pricing (Strale auto-detects)

**Model:** Single API call `payee-assurance`. Strale determines internally whether to run full bundle or thin bundle based on cache state of the resolved entity. Response includes `call_type: full | verify` and a price paid. Effective prices: cold call €3.00, warm call €0.40.

**Unit economics:** identical to Option B if the cache logic is accurate. Margin structure the same.

**Customer experience:** caller makes one call. Response envelope tells caller what happened. This matches the Business model page's "one call, one answer" commitment most closely.

**Billing compatibility:** variable per-call price breaks wallet predictability. x402 agents pre-commit a maximum price per call ("I will pay up to $X for this tool") — if Strale's answer is "the price was €3.00 because the entity was cold," the agent must have committed to €3.00+ on every call, defeating the point of the warm discount from the agent's perspective. Stripe post-paid is fine.

**Compliance story:** the same as Option B. Audit envelope declares the call type.

**Architecture implications:** **requires a reliable entity-cache layer**. Two questions make this non-trivial:
1. **Entity-ID canonicalization.** A "warm call" is only cheaper if Strale knows the entity is the same entity as a prior call. Company name + country is not a stable key; VAT + LEI + registry number is better but not always available. **If entity resolution is not deterministic across calls to sub-1% error, auto-detection mis-classifies warm-as-cold or cold-as-warm and trust breaks.**
2. **TTL policy.** How long after a full-bundle call does a follow-up count as warm? 24h? 30 days? 90 days? The TTL must be defensible to a compliance officer ("why did this call only run sanctions if the last full check was 89 days ago?") and legible to the customer.

**What breaks:** unpredictable per-call pricing. Wallet + x402 friction. The compliance story of "why did this call only run X" gets harder to defend if the TTL is aggressive.

### Option D — Subscription + per-call hybrid (entity-under-management)

**Model:** Per-entity-per-month monitoring fee (€2/entity/month) + per-full-call onboarding fee (€5 per new entity). Matches Middesk/Persona/ComplyAdvantage.

**Unit economics:**

| Volume | Mix | Revenue | COGS | Gross margin |
|---|---|---|---|---|
| 500/mo (AP conservative, 6 onboarding + 494 monitoring, 494 implies ~90 entities monitored) | 6 new + 90 entities | 6×€5 + 90×€2 = €210 | 6×€0.38 + 494×€0.08 = €42 | €168 / 80% |
| 5,000/mo (AP aggressive, 14 + 4,986 implying ~410 entities monitored) | 14 new + 410 entities | 14×€5 + 410×€2 = €890 | 14×€0.38 + 4,986×€0.08 = €404 | €486 / 55% |
| 50,000/mo (Marketplace, 4,500 new + 45,500 monitoring, ~50k entities) | 4,500 new + 50k entities | 4,500×€5 + 50k×€2 = €122,500 | 4,500×€0.38 + 45,500×€0.08 = €5,350 | €117,150 / 96% |
| 50,000/mo (Compliance fintech, 50 new + 10,000 monitoring, ~2k entities) | 50 new + 2k entities | 50×€5 + 2k×€2 = €4,250 | 100×€0.38 + 10,000×€0.08 = €838 | €3,412 / 80% |

Volume economics swing wildly on the entity-to-call ratio. **At the marketplace scale the 96% margin is suspicious** — it's generated by charging €2/entity/month on 50k entities regardless of whether they're actually re-screened. If the marketplace doesn't need to re-screen every entity every month, they'll churn the subscription down and the economics collapse.

**Customer experience:** new construct — "my entity roster." Customer adds entities at onboarding, is billed monthly for the whole roster, and sees no per-call charge for monitoring. New entities cost €5 one-time.

**Billing compatibility:** **breaks the wallet/x402 model materially.** Subscription billing requires a monthly Stripe invoice or a fixed monthly wallet debit; neither fits the "autonomous agent pays per call" model. Post-paid Stripe can do subscriptions, so human-billed customers work. Agent-billed customers would need a different product or an abstraction ("your agent's calls roll up into a monthly subscription under your account").

**Compliance story:** strongest of the options. A persistent monitored roster with hash-chained audit of every rescan event aligns well with compliance-officer mental model (this is what ComplyAdvantage and Middesk already sell). The audit trail becomes *the* product, not a side-effect of per-call verification.

**Architecture implications:** **6–12 months of platform work.** Persistent `monitored_entities` table. Add/remove endpoints. Monthly rescan cron. Webhook alert delivery. Recurring billing infra (Stripe Subscriptions or custom). Customer dashboard for roster management. Entity-ID canonicalization requirements are even stronger than Option C (the roster must have a stable key).

**What breaks:** pay-as-you-go agent-native positioning. Time-to-launch for v1. The one-call-one-answer simplicity of the Payee Assurance canonical.

### Option E — Bucketed subscription (ceiling-capped)

**Model:** ComplyAdvantage-style. €99/mo for up to 500 calls/mo included; €1.00/call overage. Or €500/mo for up to 2,000 calls + €0.75/call overage.

**Unit economics:** similar math to Option D but the billing unit is "calls bucket" not "entities under management."

| Volume | Revenue | COGS (blended) | Margin |
|---|---|---|---|
| 500/mo, fully within starter bucket | €99 | ~€42 | €57 / 58% |
| 5,000/mo, 2k in Growth bucket + 3k overage | €500 + 3,000×€0.75 = €2,750 | ~€404 | €2,346 / 85% |
| 50,000/mo, Enterprise bucket + overage | negotiated, ~€10,000+ | ~€5,350 | healthy |

**Customer experience:** predictable monthly cost up to a ceiling. No runaway meter. Caller makes calls; Strale deducts from the bucket; if the bucket runs out, overage is charged.

**Billing compatibility:** partial. Stripe subscription + usage-based overage works natively (Stripe meters). x402 agent wallet pays per-call, not per-bucket — so agent-native customers effectively sit on the overage tier forever unless the human pre-buys a bucket for their agent to draw down.

**Compliance story:** neutral. Same per-call audit as Option A.

**Architecture implications:** bucket counter per customer per month; overage tracking. Lighter than Option D but heavier than Options A/B/C. Maybe 2–4 weeks of work.

**What breaks:** at starter scale (€99/mo), margins are OK but not great (58% at 500 calls/mo if all in-bucket). The starter bucket only works if most starter customers use most of their bucket — if they don't, ComplyAdvantage-style pricing risks looking like a dead-weight subscription, which developer audiences dislike.

---

## §5 — Decision framework

The choice between Options A–E turns on three axes. Name them, answer them, choice follows.

### Axis 1 — ICP composition at launch

Who are the first 10 Payee Assurance paying customers, and what's their thin:full ratio?

- **Marketplaces and onboarding-heavy buyers** (marketplace KYB, vendor-onboarding agents, due-diligence workflows): thin:full near 1:10. Most calls are onboarding. **Options A and B work; Option A slightly over-charges on the thin tail, Option B captures the onboarding premium.**
- **Mid-market AP shops and compliance fintechs** (Tipalti-style re-screen, monitoring-heavy): thin:full 1:100 to 1:370. Most calls are thin. **Options B, C, D, or E — anything that separates thin from full.** Option A fails here.
- **Mixed** (the realistic case): depends. First-20-customer telemetry is the load-bearing data.

**How to answer this axis before launch:** we can't, directly. Proxy indicators:
- Marketing posture today (Payee Assurance canonical lists AP automation agents, partner onboarding, marketplace screening, due-diligence research — roughly balanced).
- Inbound conversations and waitlist composition (not sized yet).
- Movitz's observation that VoP demand spikes at payment-time (supports thin-heavy AP use) vs. Middesk's enterprise-KYB customer profile (supports onboarding-heavy use).

### Axis 2 — Vendor COGS structure once Creditsafe / Global Database / Movitz quotes land

Three numbers are unresolved and each shifts the floor:

- **Creditsafe blended EU-27 rate.** £0.20 UK floor; negotiated EU-27 rate could be lower or higher.
- **Movitz VoP caching allowance.** If Strale can cache VoP results (for its own audit purposes, using the bank-side VoP as the fresh source only on first touch or change), thin-bundle COGS is €0.08. If Movitz charges €0.133 per call regardless, thin-bundle COGS is €0.16 — doubles. **This is the single most important open question in this doc.** The mid-May Movitz meeting resolves it.
- **MonitorPay as alternative or complement.** €0.10/check PAYG with reseller terms unconfirmed.

**If the COGS shake-out is favorable (low Creditsafe, cacheable Movitz, €0.08 thin-COGS confirmed):** thin-tier pricing down to €0.25–€0.40 is viable with healthy margin. Any of Options B/C/D/E work at those prices.

**If COGS is unfavorable (expensive Creditsafe, non-cacheable Movitz, €0.16+ thin-COGS):** thin-tier pricing must be €0.40+ to preserve margin, and the gap between thin and full narrows — reducing the incentive to separate them. Option A becomes more defensible.

### Axis 3 — Product-architecture readiness + marketing complexity tolerance

- **Option A (flat):** zero architecture work. One line on the pricing page.
- **Option B (explicit two tiers):** two capability slugs. Paragraph on the pricing page with an example. Caller-side state requirement.
- **Option C (auto-detected):** entity-cache infra + TTL policy. One line on the pricing page + an "explainer" box about cache state.
- **Option D (subscription + per-call):** 6–12 months of platform work. New construct on the pricing page, a full section with examples, and a roster management UI.
- **Option E (bucketed):** 2–4 weeks of platform work. Tiered pricing table on the pricing page (ComplyAdvantage-style).

**Is Strale's current stack ready for Option C?** Entity resolution is a v1 launch blocker per the Payee Assurance canonical; it must produce stable canonical IDs across calls for Option C to work. **If entity resolution is not stable to sub-1% error at v1 launch, Option C is architecturally infeasible and must wait.** This is a readiness audit question worth answering explicitly before committing.

**Is Strale's stack ready for Option D?** No — the platform has no subscription, no roster, no webhook infrastructure today. Option D is a post-v1 product, not a v1 launch option.

**Marketing complexity tolerance:** Strale's developer audience is sophisticated (LangChain + MCP + x402). The ComplyAdvantage pricing page is legible. Plaid's pricing page (archetype 3) is legible. A two-tier explanation is within the tolerance band. A five-construct pricing page would not be.

### Recommendation signal (not a recommendation)

**If the answers come back:**
- Axis 1: ICP skews onboarding-heavy (marketplace, partner onboarding, DD research)
- Axis 2: COGS favorable, Movitz cache permitted
- Axis 3: entity resolution stable; low complexity tolerance

→ **Option A (flat €1.00) is defensible for v1.** Ship simple; the overcharging-on-thin problem doesn't bite until AP-heavy customers become dominant, and the Business model page already flags a future subscription for monitoring. Raise the price or add a thin tier later.

**If the answers come back:**
- Axis 1: ICP skews thin-heavy (AP automation, compliance fintech, payment-gated flows)
- Axis 2: COGS favorable, thin COGS ≤€0.10
- Axis 3: entity resolution stable (Option C feasible) OR willingness to ship two explicit slugs (Option B)

→ **Option B (explicit two tiers: €3.00 full / €0.30 thin) or Option C (auto-detected, same prices).** The thin-price discipline matters more than the flat-price simplicity when monitoring dominates call volume. Option B is lower risk than C because it doesn't depend on cache reliability; Option C is more elegant if the cache is solid.

**If the answers come back:**
- Axis 1: ICP uncertain (real case at launch)
- Axis 2: COGS partially known, Movitz cache TBD
- Axis 3: v1 launch target tight, minimal architecture headroom

→ **Option A at launch with a deliberate price-raise posture** — ship €1.00 flat, publicly label v1 as "v1 will reprice in v1.1 once we've seen usage," and pre-commit (internally and in a pricing-page note) that a thin tier or subscription option will be added after first 20–50 customers' usage patterns are visible. This is the "low is easier to raise than high is to lower" principle the benchmark already invoked.

**What Option E (bucketed) gives up:** it doesn't require knowing Axis 1 before launch — the Growth/Scale tiers absorb whichever mix customers bring. If complexity tolerance is the hard constraint and Axis 1 is genuinely unknown, Option E is a stealth hedge. The benchmark's volume-tier ladder sketch is essentially Option E with a flat per-call backbone; it could be re-framed as the v1.1 upgrade path from Option A.

### Non-committal close

The thinking pass does not pick. It names the structure of the decision:

- If v1 customers skew onboarding, the flat price is fine for 6–12 months.
- If v1 customers skew thin, the market has already proven the 5–20× cache-hit discount, and Strale's single-tier price will either over-charge the thin tail (losing them to Plaid/sanctions.io) or under-charge the onboarding head (subsidizing full-bundle calls from thin revenue, which is the current €1.00 shape).
- The COGS question on Movitz caching changes the floor by 2× on the thin tier and must be resolved before any two-tier decision is credible.
- Option D (subscription + per-call) is off the table for v1 on architectural grounds but is the right long-term shape if Payee Assurance becomes a compliance-officer product rather than a developer-first product.

The cleanest stepped approach, if pressed: **Option A at v1 launch + explicit public commitment to v1.1 repricing + aggressive telemetry on thin:full ratio from day one + Movitz cache question resolved by mid-May before committing to the v1 number.**

---

## Open questions (to resolve before pricing commits)

1. **Movitz VoP caching permission.** Can Strale cache a Movitz VoP response for repeat queries on the same IBAN+name pair within a TTL (e.g., 30 days)? If yes, thin-bundle COGS is €0.08 and Options B/C are economically viable at €0.30 thin. If no, thin-bundle COGS is €0.16 and the thin tier must be priced €0.40+. **Mid-May meeting.**
2. **Entity resolution stability at v1 launch.** For Options C and D, canonical entity IDs must be stable across calls. What's the measured error rate on the current entity-resolution engine? What's acceptable?
3. **First-20-customer ICP.** No way to answer pre-launch. But: run a light pre-registration check (waitlist, outreach to 2–3 AP platforms and 2–3 marketplaces) and get an indicative mix before committing to a price shape.
4. **Creditsafe negotiated rate.** Already in progress per benchmark.
5. **Global Database terms.** Already in progress per benchmark.
6. **Movitz overage pricing past 7,500 calls/mo.** Pilot locks 1k€/mo for 7,500; past that, unclear. Affects whether the thin tier economics scale.
7. **Plaid Monitor / sanctions.io direct comparability.** If a potential Strale customer is currently running Plaid Monitor ($0.50 initial, $0.10 rescan) and their only need is sanctions monitoring, they will not pay Strale €1.00/call flat. Is Strale willing to lose that sub-segment, or is the thin tier a defensive requirement?
8. **Subscription timing.** The Business model page names continuous monitoring as a future subscription product "when customers explicitly ask." How explicit does the ask have to be? One inbound inquiry? Three? A named customer with a PO? Worth a pre-commitment on the threshold.
9. **x402 compatibility of variable pricing.** Option C produces per-call prices that vary. If an x402 agent is asked to pre-authorize up to €X, and Strale's answer is "€3.00 because cold," the agent must have pre-authorized €3.00+ on every call. Is that acceptable UX, or does it force the agent to always set max-price = full-tier price?
10. **Auditor sign-off on thin-tier evidence.** If Strale ships a thin tier with sanctions + PEP + IBAN/name match only, a compliance officer reviewing the audit log for a payment that used the thin tier must be comfortable it meets their policy. Is there a compliance advisor (external or internal) who should review the thin-tier scope before it publishes? Tipalti and AvidXchange precedent suggests yes-it-meets-AP-policy; not tested for UK MLR 2017 Reg 28(11) or EU AMLD purposes.

---

## Appendix — research sources

### Notion (internal, loaded this pass)
- Payee Assurance canonical — `34867c87-082c-8149-99e5-c668d7383fa7`
- Business model canonical — `33c67c87-082c-817f-ac7c-d9d7b6c44e40`
- Movitz vendor — `34967c87-082c-81e4-8ee9-e6884188f877`
- Provider-Coverage DB — `34867c87-082c-8187-9391-ebc05a9b3d90`
- Benchmark study — `34a67c87-082c-8168-b01c-e77e7392fd44`
- Round-2 aggregator research — `34a67c87-082c-814b-8fb0-e88f072b63ea` (summary carried forward via benchmark)

### External (fresh research this pass)

**AP automation payment flows:**
- Tipalti FAQs / OFAC-AML compliance / Financial Compliance — tipalti.com
- AvidXchange AvidAscend product page + Stampli comparatives — avidxchange.com, stampli.com
- BILL security & bank verify API — bill.com, developer.bill.com
- Coupa SIM datasheet + Trustpair connector — coupa.com, trustpair.com
- Stripe Connect handle verification updates, KYB guide — docs.stripe.com, stripe.com
- Shopify × FrankieOne case study — frankieone.com
- Amazon INFORM Consumers Act materials — sellercentral.amazon.com, sellersfi.com
- Pay.UK Confirmation of Payee + FAQs — wearepay.uk, psr.org.uk, barclays.co.uk
- EPC Verification of Payee overview + rulebook — europeanpaymentscouncil.eu
- ECB Instant Payments Regulation — ecb.europa.eu
- Nacha WEB Debit Account Validation — nacha.org, moderntreasury.com
- Solaris VoP developer docs (20-min single-use ID) — docs.solarisgroup.com
- FinCEN BOI + March 2025 scope change — fincen.gov
- HMRC MLR 2017 ongoing monitoring — gov.uk
- ComplyAdvantage 5AMLD / perpetual KYC / Alloy / Moody's — complyadvantage.com, alloy.com, moodys.com

**Competitor onboarding-vs-monitoring pricing:**
- Plaid pricing, Monitor docs, PriceLevel — plaid.com, pricelevel.com
- Persona pricing, Watchlist Screening, Vendr — withpersona.com, vendr.com
- Middesk Verify, Watchlist API, Monitor docs, Vendr, Entity Management pricing — middesk.com, docs.middesk.com
- Trulioo Business Verification, Gartner Peer Insights — trulioo.com, gartner.com
- Onfido Watchlist Ongoing Monitoring, Entrust docs, beverified — onfido.com, documentation.identity.entrust.com
- ComplyAdvantage pricing, G2, KYB insights — complyadvantage.com, g2.com
- Socure RiskOS, Socure × Middesk — socure.com, thepaypers.com
- Sanctions.io pricing + continuous monitoring — sanctions.io
- Dilisense AML Screening API + developer docs — dilisense.com
- OpenSanctions licensing + API + commercial FAQ — opensanctions.org
- Shufti Pro KYB + beverified — shuftipro.com
- Signzy KYB — signzy.com
- Moody's Kompany KYC/KYB — moodys.com
- D&B Direct+ Monitor + Datarade — globalss.com, datarade.ai
- AML Incubator Cost-of-Compliance 2026 — amlincubator.com

*(Full per-URL source lists are in the two research-agent transcripts, preserved separately and not reproduced in full here to keep this document readable.)*

---

*End of thinking document. No commits. No Notion writes. No pricing-page changes. File is local to `docs/research/`. Next action (chat-level decision): review with Petter, decide which of the three framework answer-patterns applies, pick accordingly.*
