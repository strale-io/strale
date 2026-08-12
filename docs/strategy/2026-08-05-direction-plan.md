# Strale — Direction Plan

**Date:** 2026-08-05
**Status:** Part One ADOPTED 2026-08-12 via DEC-20260812-A (with the Platform Readiness &
Self-Operation Program, `2026-08-12-platform-readiness-program.md`, as its execution
vehicle). DEC-20260502-A and DEC-20260503-A superseded per §4/§6. Part Two (compliance as
a separate brand) remains gated on the §4.5 trigger conditions.
**Basis:** Full read-only audit of backend, frontend, repo research corpus, Notion, production database, and vendor correspondence, conducted 2026-08-05.

---

## 0. The one-paragraph version

The thing that works is not the thing that got the attention. Strale's real revenue — €399 lifetime, 92% of it in the last 90 days — comes from **38 distinct crypto wallets paying per call over x402, with no signup, for general-purpose utilities**. The KYB/compliance product that absorbed most of 2026's engineering effort has never launched, and its foundation (the country registry capabilities) is measurably **the least reliable part of the platform in production**. Meanwhile 55 humans signed up and paid €0 — not because they didn't want to, but because there was no payment button. This plan commits to the library as the product, rebuilds it around the one insight that actually explains the revenue, and treats the compliance vertical as a separate business that must earn its start through customer discovery rather than more engineering.

---

## 1. The insight the numbers are pointing at

Every strategic framing so far has described Strale as a *catalog* — a marketplace, a data layer, a trust layer. The production data says the catalog is not what people are buying. What they're buying is **access without identity**.

Consider the two payment rails side by side, both live, both fully built, over the same 90 days:

| | Wallet (Stripe, human signup) | x402 (USDC on Base, no signup) |
|---|---|---|
| Distinct paying parties | 0 | 38 wallets |
| Calls | 303 (mostly free-tier/trial credit) | 3,376 |
| Revenue | €0 ever from real money | €233 in 90d, ~€399 lifetime |
| Repeat use | 0 of 6 account users returned on a second day | ~10 wallets calling one capability hundreds of times |

An autonomous agent cannot sign up for things. It cannot complete a registration form with a real email it controls, cannot pass KYC, cannot hold a credit card, cannot accept terms as a legal person. It *can* hold a wallet and pay. Strale is one of a small number of places where an agent can buy data **without a human doing paperwork first**. That is the product. The 295 capabilities are inventory; the auth-less pay-per-call rail is the business.

This reframes several things at once:

- The website is not a funnel; it is documentation. Only **4 of 3,681 calls** carried a `strale.dev` origin header. Marketing pages are read by machines, not people.
- Signups are the wrong metric and always were. Six signups making zero calls was never a conversion problem.
- Breadth has real value, and this is new information: **255 of 295 active capabilities have been called by a real external user.** Only 40 have never been touched. The catalog is not dead weight — explorer wallets systematically walk it, then a subset embeds one capability into a production pipeline and calls it hundreds of times. Breadth is how the embed gets found.
- Reliability is the binding constraint, not count. See §2.

**Corollary worth stating plainly:** the missing top-up button was not a minor UX gap. It is the entire explanation for Stripe's €0. A real customer (a vCISO who ran seven successful paid calls on 3 August) emailed asking where the pay link was. The backend flow was live and correctly configured the whole time. That is a €X-per-month category error, where X is unknown only because it was never tested.

---

## 2. What is actually broken

Live production data, external traffic only, last 90 days: **3,681 calls, 553 failed — a 15% failure rate.** It is not evenly spread. It clusters, and the clusters are diagnostic.

**Total failures at 0% completion** (real users, real calls, all failed): `danish-company-data` 0/13, `swiss-company-data` 0/5, `terms-of-service-extract` 0/5, `pdf-extract` 0/5, `readme-generate` 0/5, `schema-infer` 0/5, `return-policy-extract` 0/5.

**Below 50%:** `charity-lookup-uk` 14%, `finnish-company-data` 17%, `product-reviews-extract` 18% (44 calls), `dependency-audit` 18%, `api-docs-generate` 20%, `receipt-categorize` 22%, `gdpr-fine-lookup` 23%, `uk-companies-house-officers` 25%, `ssl-certificate-chain` 29%, `belgian-company-data` 33%, `structured-scrape` 33%, `us-company-data` 36%, `job-posting-analyze` 43%, `uk-company-data` 47%.

**The top of the table, by contrast, is excellent:** `email-validate` 100% (303 calls), `keyword-suggest` 100%, `email-deliverability-check` 100%, `serp-analyze` 100%, `google-search` 96% (423 calls, €40.70 — the single biggest earner), `image-to-text` 86%, `company-enrich` 86% (€12.50).

Two conclusions follow.

**First: the failures concentrate in exactly three fragile classes** — Browserless-dependent scraping, LLM-based extraction, and country company registries. These are the same three classes that consumed most of the last quarter's firefighting commits. This is not bad luck; it is a structural property of those integration styles.

**Second, and this is the finding that should change the compliance decision: the registry layer is the worst-performing part of the platform.** Every KYB-relevant company-data capability sits in the bottom half of the table — Danish 0%, Swiss 0%, Finnish 17%, Belgian 33%, US 36%, UK 47%, French 53%, German 67%. A KYB product is a thin wrapper around exactly these calls. The substrate a compliance product would stand on is, today, in production, the least trustworthy thing Strale ships.

One genuine bright spot: **charge-on-success is holding.** Every 0%-completion capability earned €0.00. Nobody has been billed for a failure. That is the single most important invariant in the system and it must never regress.

---

## 3. Part One — The library, built properly

### 3.1 What it is, stated so it can be built against

*A single paid API surface giving autonomous agents access to a few hundred small, reliable data and utility operations, billed per successful call, requiring no account, no key, and no human paperwork.*

The defensibility is not in any capability — `google-search` is Serper underneath and anyone can wrap it. The defensibility is that an agent needs **one** payment relationship instead of forty vendor signups, forty API keys, and forty legal entities' terms of service. Aggregation plus an identity-free payment rail is the moat, such as it is.

### 3.2 Design principles

1. **Never charge for a failure.** Already true. Treat as inviolable.
2. **Never list what doesn't work.** A catalog entry is a promise. A 0% capability in the catalog is a lie that costs a customer a retry loop and a reputation.
3. **No-signup is the front door.** x402 is the primary rail; the wallet is the secondary convenience for humans who prefer cards.
4. **Machine-readable everything** — discovery, pricing, errors, provenance. The reader is a model, not a person.
5. **Only take on capabilities whose marginal maintenance cost is ≈ zero.** This is the rule that prevents rebuilding today's 15%.
6. **The catalog is the product; capabilities are inventory.** Inventory turns over. That is healthy.

### 3.3 Workstream A — The quality floor (highest value available right now)

This is the honest successor to SQS. Not a public score; an **internal gate driven by real traffic** that removes bad inventory automatically.

- **Instrument:** rolling completion rate per capability over real external calls (already in `transactions`, no new plumbing needed).
- **Gate:** below ~70% over a meaningful sample → quarantine (delisted from catalog and discovery surfaces, still reachable by explicit slug with a warning). Below ~30% → deactivate outright.
- **Promote back** automatically when real traffic recovers. Same mechanism, both directions.
- **Root-cause the three clusters** rather than patching individually. For each: is there a structural fix (better retry, different upstream, different extraction strategy), or does it need permanent babysitting? Fix the first kind; retire the second.
- **Accept the count dropping.** Going from 295 listed to ~230 that all work is a product improvement, not a loss. Stop treating capability count as a marketing number — the frontend already needs to stop hardcoding it.

This is cheap, uses data you already pay for, and directly attacks the 15%.

### 3.4 Workstream B — The money path

- **Ship `/topup`** — balance, amount selection, Stripe Checkout redirect, recent transactions. In progress this session. This is the DEC-18 dashboard scope, finally.
- **Verify the Stripe webhook endpoint is registered and enabled in the Stripe dashboard** pointing at production. The signing secret is confirmed set in prod; the endpoint registration is the one piece not verifiable from code. Do this before telling anyone to pay.
- **Reply to the waiting customer** with the direct API top-up route so he can pay today rather than waiting on a deploy.
- **Revisit pricing on the reliable top earners.** Average realised price is ~€0.08/call. The capabilities at 100% completion with real repeat demand (`serp-analyze` at €0.15, `seo-audit` at €0.30, `company-enrich` at ~€0.43, `brand-mention-search` at €0.30) are priced as commodities while functioning as replacements for whole vendor relationships. Price the top twenty on value delivered, not cost-plus. Leave the long tail cheap.
- **Keep x402 excellent** — catalog freshness, clear machine-readable errors, settlement reliability (currently zero orphaned settlements in 90 days, which is a real achievement; protect it).

### 3.5 Workstream C — The capability factory

The stated ambition, and the right one — with a critical reframe. Given that 255 of 295 capabilities already see real use and the binding constraint is reliability rather than count, the factory's job is **catalog metabolism**, not growth: add what demand asks for, retire what fails, keep net quality rising.

**The loop:**

1. **Demand sensing.** `failed_requests` (`no_matching_capability`), `suggest_log` queries returning nothing good, x402 404s on unknown slugs. Filter bot noise aggressively — the audit found a competitor's agent marketplace and automated smoke-checks polluting this signal, and treating that as demand would send the factory building for nobody.
2. **Source qualification** — the gate that must stay strict. Tier-1 doctrine (DEC-20260428-A) forbids Strale-operated scraping, absolutely. The admissible search space is public APIs, government open data, and PAYG vendors with documented redistribution rights. An agent can research candidates; **a human approves the licensing question.** This is the one step that must not be automated, and the record shows why: the Topograph incident (DEC-20260518-G) was three instances in a single session of rationalising an attractive-shaped source past the doctrine.
3. **Executor synthesis.** Agent writes the executor against real captured responses. Proven — 300 exist.
4. **Validation.** `onboard.ts --discover --fix` already generates fixtures, field reliability, and all five test types, and verifies against live output. This part is genuinely done.
5. **Dark launch → promote** on consecutive green runs plus first real traffic passing the quality gate.
6. **Auto-retire** via Workstream A's gate, continuously.

**The rule that keeps the factory safe:** it may only auto-build capabilities in the zero-maintenance class — stable public APIs, open data, pure computation. Anything requiring headless browsing, LLM extraction, or a paid vendor requires explicit human sign-off. Without this rule the factory mass-produces precisely the fragility causing today's failure rate.

### 3.6 Workstream D — Machine-first distribution

The website is documentation, not acquisition. Distribution effort goes where agents actually look:

- **x402 ecosystem surfaces** — directories and indexes. This rail produced 92% of revenue with no promotion at all; it is the only channel with proven conversion.
- **MCP registries.** Note there is already unsolicited inbound here (a curated MCP newsletter is emailing about ecosystem coverage) — that is a warm surface going unworked.
- **`llms.txt`, `.well-known/ai-catalog.json`, `agent-card.json`** must be flawless. These are read by the actual buyer. Being wrong here is worse than any homepage error — and they are currently wrong (fabricated response shapes, dead endpoints), which is being fixed this session.
- **Framework packages.** Verify each genuinely wraps its framework before promoting any of them — the `CONTAINMENT_REPORT.md` incident (a published package containing zero framework-specific code, and a maintainer's public "shame on you") is the standing reason this needs checking, not assuming.
- **Optimise for the embed, not the brand.** The revenue pattern is an agent finding *one* capability and calling it forever. Each capability should be independently discoverable and independently callable. Nobody needs to know what Strale is.
- **Instrument channel attribution at the x402 gateway and MCP/A2A handlers.** 92% of traffic is currently unattributed — there is no way to tell which distribution surface produced a paying wallet. Fix before spending effort on distribution, or the spend is unmeasurable.

### 3.7 Workstream E — Cost discipline

In 90 days: ~625,000 internal test transactions against 3,681 external calls. A ratio of roughly **170:1**. The platform very likely spends more testing itself than it earns serving customers.

- Test frequency should be proportional to usage × price × external cost, not uniform.
- High-traffic capabilities piggyback on real traffic (the piggyback suite mechanism already exists and is never scheduled proactively, by design).
- Zero-usage, zero-cost capabilities need testing weekly at most.
- **Target: total monthly run cost (infra + vendors + tests) under €100**, so the asset is genuinely low-carry and can sit indefinitely without pressure.

### 3.8 Metrics — retire signups entirely

| Metric | Today | 12-month target |
|---|---|---|
| Distinct paying wallets / month | ~15–20 | 100+ |
| Repeat-wallet rate (month over month) | unmeasured — instrument it | >40% |
| Catalog completion rate (real traffic) | 85% | >95% |
| Capabilities earning any revenue / month | measure | rising |
| Monthly revenue | ~€80 | €1,000–3,000 |
| Monthly run cost | unmeasured | <€100 |

### 3.9 What success and failure look like

Honest framing: at current trajectory this is an ~€80/month asset, not a business. Its case rests on three things — near-zero carry once trimmed, a real option on machine-to-machine commerce while x402 and MCP are still early, and the fact that it matches the operating mode where the founder demonstrably produces enormous output without needing sustained outbound effort.

**Six-month decision point.** If paying wallets and repeat rate are both growing, invest further. If both are flat, drop to pure maintenance mode — the asset costs almost nothing to keep alive and the option value persists.

### 3.10 What this is explicitly not

Not a third-party provider marketplace (a much larger build with trust, payout, and dispute surface). Not human SaaS. Not competing on price with direct vendor APIs. Not a quality-score product — that experiment ran and was deleted.

---

## 4. Part Two — The compliance vertical, as a separate brand from scratch

### 4.1 Why the separate-brand frame is the right one

It forces the only useful question: *would I start this today, knowing nothing but what I now know?* It also surfaces that the two businesses are incompatible along every axis that matters — customer (autonomous agent vs. compliance officer), sales motion (self-serve machine vs. founder-led human), failure tolerance (retry vs. regulatory consequence), and brand (developer utility vs. institutional trust). Running them under one name has been actively costly: it is why strale.dev has been simultaneously pitching a deleted quality engine, a KYB solution set, and a capability catalog.

### 4.2 Honest readiness assessment

The repo narrative suggests a product nearly finished. The production data says otherwise.

- **The registry substrate is the least reliable part of the platform** (§2). Danish 0%, Swiss 0%, Finnish 17%, Belgian 33%, US 36%, UK 47%. A KYB product is a wrapper around these calls.
- **EU30 director/UBO coverage: 2–5 of 30 countries binding-ready.** Extensive per-country research exists; almost none of it converted to shipped capability.
- **T3 (enhanced due diligence / ongoing monitoring): 0 of 30.** The module does not exist.
- **US identity leg unbuilt.** `us-company-data` reaches ~13k SEC filers; the 33M+ private US companies are unreachable, and it runs at 36% completion anyway.
- **Eleven vendor relationships dead mid-negotiation**, several with offers still on the table (Digiteal's 50%-off year-one proposal, unanswered since 13 May, chased again 3 July; Moody's chased four times; Creditsafe — the anchor of the entire EU-27 cost model — never replied at all).
- **No launch ever happened.** The 15 May readiness sweep left the launch verdict to a decision that was never written. Nothing in the Journal, git history, or handoffs after 18 May touches the product.

**Fair summary: the compliance product is roughly 25% done, and the 25% that exists is the least reliable part of the platform.** Not 80%.

### 4.3 What it would look like, built fresh

**Positioning.** Not "a KYB API" — Trulioo, Creditsafe, Kyckr, and Moody's own that phrase. Three viable wedges:

- **(a) Nordic-complete KYB with audit-grade evidence.** Most executable. Registries directly accessible, founder is local and native in the language and legal context, EU AML6 drives demand.
- **(b) Payee/invoice fraud prevention for finance teams.** Clearest pain, clearest willingness to pay, and the vendor groundwork (Digiteal, Movitz) is already scoped.
- **(c) Agent-callable compliance with regulator-grade audit trails.** Most differentiated — nobody serves it, and Strale is unusually well positioned — but the buyer barely exists yet in volume.

**Recommendation: (a) or (b), one country, one use case, complete.** Not EU30. The EU30 ambition is precisely what consumed the momentum and produced 2-of-30 coverage.

**Product shape.** A workflow product, not an API. Compliance buyers need a case record, exportable evidence they can hand an auditor, a dispute and override trail, and a human in the loop. The API is a secondary enterprise surface. This is a fundamentally different build from Strale — which is the strongest argument for the separate-brand framing being correct rather than cosmetic.

**Vendor stack** (Nordic scope is what makes this tractable — the vendor problem shrinks from eleven open threads to three):

| Leg | Vendor | Status |
|---|---|---|
| Sanctions / PEP / adverse media | Dilisense | Integrated and live; needs Basic+ tier with Service Agreement + DPA |
| Registries SE / NO / DK / FI | Direct | Built; need reliability work (see §2) |
| UBO | Nordic registers + OpenOwnership | Partially built |
| Bank account verification | Digiteal (offer on table: €365 setup, from €50/mo, 50% off year one) or Movitz (Nordic VoP, pilot offered) | Both stalled; note real coverage caveats — DK Saxo only, NO DNB ~30%, SE Klarna only |

Plausible fixed cost: €150–400/month plus per-call COGS. Manageable at solo-founder scale.

**Regulatory bar.** DEC-20260428-B already codifies it — versioned datasets, stale-data circuit breaker, per-response source manifest, match explainability, dispute endpoint, replay, golden tests, published methodology, DPIA, GDPR Art. 22 classification. Much of this is already built and is genuinely good work. **This is the most transferable asset and the least visible one.**

**What transfers:** the Dilisense integration, the hash-chained audit trail, the GDPR Bucket C infrastructure, the registry executors as a starting point, the evidence-tier framework, and the vendor research corpus. **What does not:** x402, the catalog, the marketplace model, the brand, the pricing model, the frontend.

**Timeline and capital.**

- *Month 0–1:* customer discovery. 15–20 conversations with Nordic finance and compliance operators. **No code.** Goal: one design partner who will pay.
- *Month 2–3:* close Dilisense Basic and one bank-verification vendor. Reliability work on the four Nordic registries. Build the workflow surface.
- *Month 4–6:* design partner live, iterate, three to five paying customers.
- *Capital:* mostly time; roughly €2–5k in vendor minimums and entity costs over six months.
- *Pricing:* not €3.50/call. B2B compliance prices as €200–2,000/month subscription or €5–50/check.

### 4.4 The crux, stated plainly

This business is roughly 70% sales and vendor negotiation, 30% engineering. The record shows two stalls at exactly that step: eleven vendor threads abandoned with live offers outstanding, and zero logged customer conversations across the entire corpus. Rebranding does not change who has to make the calls.

**Therefore the only honest precondition: do customer discovery first, with no code, and proceed only if a design partner commits.** Twenty conversations either produce a committed partner or they don't. That costs three weeks of calendar time instead of six months of engineering, and it is the single highest-information action available in the entire compliance direction.

### 4.5 Trigger conditions

Start the compliance business only when at least one is true:

1. A design partner commits — signed LOI or prepayment.
2. Inbound demand appears in the data: `sanctions-check` / `company-data` x402 volume growing month over month without promotion.
3. Someone joins who owns sales.

Absent all three: don't start. Keep the shipped compliance capabilities earning inside the library, where they already do — a real wallet paid $0.216 for a sanctions screen on 5 August with full audit metadata attached.

---

## 5. Sequencing

**This week.** Site stops making false claims. `/topup` ships. Reply to the waiting customer with the API route so he can pay immediately. Verify the Stripe webhook registration. Merge the stranded production alerting fix from the 2 July outage (built, never merged — the outage went 11 hours undetected).

**Weeks 2–4.** Quality floor (Workstream A). Channel attribution instrumentation. Cost discipline (Workstream E). Retire or fix every capability below the floor.

**Month 2.** Factory v1 — demand sensing plus source qualification plus dark launch, restricted to the zero-maintenance class.

**Month 3.** Distribution push into x402 and MCP surfaces, measured through the attribution added in weeks 2–4.

**In parallel, cheap, from now.** Twenty compliance customer-discovery conversations. No code. This is the only legitimate way Part Two earns its start, and it costs nothing but calendar time.

**Six months.** Decision point on the library (§3.9), and a verdict on compliance based on whether a design partner materialised.

---

## 6. Governance

Adopting this supersedes:

- **DEC-20260502-A** (Payee → Counterparty Assurance rename, ICP narrowed to four segments at €3.50/call)
- **DEC-20260503-A** (dual-domain architecture; solutions removed from public surfaces)
- The Counterparty Assurance framing as Strale's primary product

Per the Contradiction Protocol this requires explicit confirmation before the supersession entry is written, followed by updates to CLAUDE.md and the Notion Strategy section. The 369-item backlog (289 untriaged) should be closed out wholesale rather than migrated — it encodes a strategy being retired.

**Vendor relationship hygiene.** Send brief, honest replies to Digiteal, Movitz, Moody's, and Cobalt Intelligence. Not closures — accurate status. Digiteal in particular made a concrete offer and has chased twice; a two-line "parking this, here's my timeline" costs nothing and preserves an option that customer discovery might reactivate within the quarter.
