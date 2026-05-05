---
title: Payee Assurance apples-to-apples pricing benchmark
date: 2026-04-28
status: Draft — replaces 2026-04-22 benchmark for pricing-anchor purposes
scope: Pricing recommendation grounded in genuinely-comparable vendors only
---

# Payee Assurance apples-to-apples pricing benchmark

## 1. Why the existing benchmark is wrong

The 2026-04-22 benchmark recommended **€1.00/call** for Payee Assurance v1, anchored on a 25-vendor comparison set that mixed four incompatible categories. The same document explicitly admitted the problem: *"MonitorPay's bundled offering at €0.10/call is structurally similar to Strale's Payee Assurance bundled offering — same 'single-call, multi-evidence' shape, much cheaper."* — and then averaged it against vendors selling fundamentally different products.

The four mismatched categories were:

- **(a) Workflow KYB products** (Middesk, Persona, Onfido, Socure, Trulioo, Signzy, ComplyAdvantage, AiPrise, Footprint, iDenfy, Sumsub). End-to-end onboarding workflows with hosted UI, case management, and human-review queues. Per-call economics include workflow tooling Strale doesn't sell.
- **(b) Single-primitive vendors** (Sanctions.io, Dilisense, OpenSanctions, Movitz, Banfico, Shufti Pro, Verifex, NameScan). Sell one leg only.
- **(c) Raw data aggregators** (Creditsafe, D&B, BvD, OpenCorporates, Kompany, Sayari, Kyckr, Global Database). Upstream suppliers Strale **consumes**, not peers.
- **(d) Genuinely comparable per-call multi-leg APIs.** MonitorPay was the only one in the existing set. We didn't anchor on it because we had nothing else to triangulate against, so we averaged across (a)–(c) instead — giving us a number that splits the difference between things Strale isn't.

This document re-runs the benchmark holding all five Tier A dimensions constant: **API-first, configurable multi-leg bundle in one call, PAYG with no monthly minimum, audit-trail-grade provenance, embed-and-bill rights as standard.** Vendors failing any one dimension are excluded from the pricing anchor.

## 2. Apples-to-apples competitor table — Tier A only

After screening 28 candidates against all five dimensions, **only two vendors qualify as Tier A peers**, and both come with caveats. A third (CYBERA) qualifies on dimensions 1, 3, and 5 but covers only crypto-counterparty checks — partial peer.

| Vendor | Per-call PAYG | Bundle (legs/call) | Embed rights | Provenance | Coverage | Buyer |
|---|---|---|---|---|---|---|
| **MonitorPay (Pay-As-You-Go tier)** | €0.10/check `[primary]` | IBAN + payee-name match + account ownership + VAT validation + PEP/sanctions screening | **Standard ToS prohibits resale** — Enterprise tier adds reseller licence at custom price | "200+ trusted sources, 100+ corporate registries, no scraping"; per-fact attribution unconfirmed in API docs (schema marked "pending") | 150+ countries (IBAN/VAT); ownership varies by registry | Dual: developers + non-technical compliance/treasury |
| **TheKYB (Plus tier)** | $5.00 verification platform fee + add-ons ($1.50 AML, $1 doc, $1 questionnaire, $1.50 IDV) — effective **$5–10/call bundled** `[primary]` | Registry pull + AML + doc + questionnaire + IDV + UBO + due-diligence reports as add-ons; configurable per call | Implicit (paid-API model, terms not on public page); no explicit reseller language | Direct registry connections, 188–250 countries; provenance per fact not documented | Global, registry-licensed where available | Compliance teams + developers (PAYG tier marketed for SMBs) |
| **CYBERA (partial peer)** | $0.01 USDC/call `[primary, x402]` | VASP address ID + risk score (0–100) + sanctions/mixer screening | x402 native — no API key, payment IS the auth | Address-level sanctions matched against OFAC + chain-analytics signals; provenance partial | 29 chains, 20,468 VASP addresses — **crypto-counterparty only, not corporate KYB** | AI agents on x402 (Coinbase) |

### Per-vendor notes

**MonitorPay — €0.10/check PAYG.** monitorpay.ai/pricing publishes a Growth free tier (100 checks), Pay-As-You-Go (no minimum, monthly invoicing, cancel anytime), and Enterprise (custom, "reseller licence included"). Each call returns IBAN + payee-name match + ownership + VAT + screening as one bundled JSON response. Critical caveat: monitorpay.ai/terms explicitly states **"You may not offer the content for resale"** and prohibits making content "available via an intranet or extranet" without written permission. The €0.10 PAYG tier therefore fails dimension 5 unless customer separately negotiates the Enterprise reseller licence. Provenance: described as "150+ countries from government registries and bank connectivity" but the API docs page (monitorpay.ai/api-docs) marks request/response schema as "pending." `[primary: monitorpay.ai/pricing, monitorpay.ai/terms, monitorpay.ai/api-docs]`

**TheKYB — $5 platform fee + add-ons.** thekyb.com/pricing publishes a "Plus (Pay-As-You-Go)" plan: $5/verification platform fee with 38-verification minimum (effectively $190/mo floor), 25 free verifications on activation. Add-ons priced separately: AML $1.50, doc verification $1, questionnaire $1, IDV $1.50, due-diligence report $50. A bundled call combining registry + AML + IDV + UBO is **effectively $8–10**. Enterprise tier compresses to $0.10–$0.30 for AML and "under $1" for doc verification at scale. Coverage: 188–250 countries via registry partnerships. The 38-minimum makes the Plus tier a soft monthly-floor product — borderline on dimension 3, technically fails strict reading. `[primary: thekyb.com/pricing]`

**CYBERA — $0.01 USDC/call (x402).** github.com/xpaysh/awesome-x402 lists three CYBERA endpoints at $0.01 USDC each on Base mainnet via x402: VASP address identification, risk scoring (0–100), sanctions/mixer screening. No account, no API key, no minimum — payment is the auth. **Not a corporate-counterparty bundle**: it screens crypto wallet addresses, not legal entities or bank accounts. Useful as an x402-native pricing reference point but not a substitute peer for Payee Assurance's 8-leg corporate bundle. Coverage: 29 chains, 20,468 VASP addresses. `[primary: github.com/xpaysh/awesome-x402]`

### Honourable mentions (failed Tier A by one dimension each, but pricing-relevant)

- **Verifex** (verifex.dev/pricing) — Free tier (50/mo), Startup $49/mo (2,500), Growth $99/mo (10,000), Scale $249/mo (50,000), Enterprise $499/mo. Effective per-call $0.005–$0.02 at the Growth/Scale tiers. Bundles sanctions + PEP + adverse-media + UBO across 49+ sources. **Fails dimension 3** (subscription with monthly minimum, not PAYG). But the effective per-call rate is Tier-A-relevant: a fully-bundled multi-source screening response sits in the **$0.005–$0.02** range when sold as a subscription. `[primary: verifex.dev/pricing]`

- **Veriff** (veriff.com/pricing) — Essential $0.80/verification + $49/mo minimum, Plus $1.39 + $99/mo, Premium $1.89 + $209/mo. Add-ons: PEP/sanctions +$0.64, ongoing monitoring +$0.09. Identity-only, not corporate KYB. **Fails dimensions 2 and 3.** Useful only as a per-leg upper bound on identity verification. `[primary: veriff.com/pricing]`

## 3. Reference context (Tier B + Tier C)

### Tier B — single-primitive per-leg pricing (don't anchor on these)

| Leg | Provider | Per-call | Source |
|---|---|---|---|
| Sanctions + PEP | Dilisense PAYG | €0.10 → €0.01 at volume | dilisense.com `[primary]` |
| Sanctions + PEP + adverse media | Sanctions.io Small | $0.18 ($899/yr / 5k) | sanctions.io `[primary]` |
| Sanctions + PEP + UBO multi-source | Verifex Growth | ~$0.01 | verifex.dev/pricing `[primary]` |
| Identity (with screening add-on) | Veriff Plus + add-ons | $1.39 + $0.64 = $2.03 | veriff.com/pricing `[primary]` |
| Crypto sanctions (x402) | CYBERA | $0.01 USDC | awesome-x402 `[primary]` |
| IBAN + VoP + screening | MonitorPay PAYG | €0.10 | monitorpay.ai `[primary]` |
| EU registry pull | Creditsafe UK | £0.20 floor | G-Cloud 14 `[primary]` |
| US registry (PAYG) | Cobalt Intelligence | $2.00 PAYG, $0.60–$1 sub | cobaltintelligence.com `[primary]` |

**Reading:** Once a leg is sold as a primitive in pure-API form (no UI, no workflow), it clusters in the **€0.01–€0.20** band. Multi-leg bundles in pure-API form (MonitorPay, CYBERA partial, Verifex bundle) cluster in the **€0.01–€0.10** band. This is the ground truth.

### Tier B — workflow-KYB per-call (different buyer, do not anchor)

| Vendor | Per-call | Floor | Source |
|---|---|---|---|
| Middesk | $2.50–$5.00 | $20–36k/yr | Vendr `[secondary]` |
| Persona KYB | $0.75–$3.00 | ~$25k/yr | Vendr `[secondary]` |
| Onfido Business Verification | $0.80–$1.89 | ~$6k/yr | beverified.org `[secondary]` |
| iDenfy Basic | $1.35 | $135/mo | idenfy.com `[primary]` |
| iDenfy Premium | $1.30 | $325/mo | idenfy.com `[primary]` |
| Sumsub Basic | $1.35 | (workflow product, not separable API) | sumsub.com/pricing `[primary]` |
| TheKYB Plus (bundled) | $5–10 | $190/mo (38 verifs × $5) | thekyb.com `[primary]` |
| Footprint | $0.50/credit, 2 credits standard KYC = $0.50 (KYC), KYB credits unconfirmed | Workflow product | onefootprint.com `[primary]` |
| Stripe Identity | 15 SEK (~$1.42)/verification | None (KYC only, no KYB API) | stripe.com/identity/pricing `[primary]` |

**Reading:** Workflow KYB bundles cluster at **$0.75–$5.00 per call** with monthly floors of **$135–$36k**. Strale targets a different buyer (developer/agent embedding bundles into product), so this band is a positioning ceiling — Strale should price below it — but not the anchor.

### Tier C — DIY estimate (one paragraph)

The 2026-04-22 build-vs-buy table sets the EU-27 in-house assembly cost at **€0.30–€0.42/call** (Creditsafe blended + Dilisense Professional + Movitz pilot + free GLEIF/VIES/Companies House + in-house entity resolution + ~€0.01 orchestration). UK-only drops to €0.09–€0.14; Global+US rises to €1.90–€2.10 at low volume. Customer engineering cost (~3–6 months one-off + ongoing maintenance) is the build-vs-buy moat for Strale; the data-layer marginal cost itself is not a moat.

## 4. Strale's pricing band recommendation

### Where Tier A sits

- **MonitorPay PAYG: €0.10/call** (no embed rights — must add Enterprise reseller licence)
- **MonitorPay Enterprise: custom + reseller licence included** (price unknown; structurally the only true Tier A peer at scale)
- **TheKYB Plus bundled: $8–10/call** (with $190/mo soft floor)
- **CYBERA crypto-only: $0.01 USDC/call** (partial peer, not corporate)
- **Median:** ~€0.10/call for the multi-leg-but-no-resale tier; **€8–10/call** for the multi-leg-with-implied-resale tier; gap between the two is large because nobody else is selling exactly Strale's shape.

### What justifies a premium over MonitorPay €0.10

Strale's differentiation versus MonitorPay specifically:

1. **Hash-chained audit trail with primary-source provenance per fact.** MonitorPay's API schema is "pending" and per-fact attribution is not documented in their public docs. Strale ships hash-chained per-fact provenance from day 1. Premium justification: **+€0.20–€0.40** based on what compliance-officer buyers paid historically for "audit-defensible" output (Dow Jones R&C, Bureau van Dijk).
2. **Embed-and-bill rights as a standard term.** MonitorPay's standard ToS explicitly prohibits resale; Strale ships reseller rights as default. Premium justification: **+€0.10–€0.20** because Strale's customers can resell to their own end-customers without separate negotiation. This is a real pricing dimension — vendors who allow it charge more.
3. **More legs in one call.** MonitorPay bundles ~5 legs (IBAN + name + ownership + VAT + screening). Strale bundles 8+ (registry + VAT + LEI + sanctions + PEP + adverse media + UBO + IBAN match + EIN where US + litigation/bankruptcy). Premium justification: **+€0.10–€0.20** for the additional legs, though linear-additive logic is fragile.
4. **Coverage depth.** MonitorPay claims 150+ countries but ownership varies. Strale's EU-27 + UK depth is documented per provider. Not a clear premium driver — assume parity for pricing purposes.

**Stacked rationale:** Strale should price **€0.40–€0.80 above MonitorPay's PAYG**, landing in the **€0.50–€0.90/call** band on Tier A anchor logic alone.

### What the COGS floor allows

- Worst-case EU-27 COGS: €0.45/call (existing benchmark).
- 50% margin floor: €0.90/call.
- 60% margin floor: €1.13/call.
- 70% margin floor: €1.50/call.

The COGS floor and the Tier A anchor analysis converge in the **€0.75–€1.00** band.

### Three price points

| Point | Price | Rationale (Tier A anchored) |
|---|---|---|
| **Floor** | **€0.75/call** | Tier A median (€0.10) + €0.65 stacked premium (audit trail + reseller rights + extra legs). Below this, premium-positioning narrative starts collapsing into "expensive MonitorPay clone." 60% margin at typical COGS, 40% at worst-case. |
| **Benchmark** | **€0.90/call** | 9× MonitorPay PAYG. Sits at the upper edge of the stacked-premium calculation. 60% margin at worst-case COGS. Defensible on every Strale dimension Tier A peers don't share. **Recommended default.** |
| **Positioning** | **€1.20/call** | 12× MonitorPay PAYG. Implies the full audit-trail-grade differentiation is a 5–10× premium over the screening-only bundle, similar to Dow Jones R&C's premium over Sanctions.io. Defensible only if Strale lands compliance-officer (not developer) buyers as the primary customer. Use only if launch customers self-select that way. |

### Recommended price: €0.90/call

This replaces the prior €1.00 recommendation. The downward revision is small in headline terms but represents a discipline change: **anchored on MonitorPay + audit-trail premium, not on workflow-KYB averages**.

Reasons:
1. Anchored on the only true Tier A peer rather than averaged across mismatched categories.
2. Preserves 60% margin at worst-case EU-27 COGS (€0.45).
3. 9× MonitorPay PAYG signals premium positioning without entering enterprise-tier territory.
4. Stays meaningfully below workflow-KYB ($1.35–$5.00 per-call), preserving the "obvious build-vs-buy win for any developer doing <50k/mo" narrative.
5. Round-number friction (€1.00 vs €0.90) is small; defensibility on first customer call ("why is this 9× MonitorPay") is high because the audit-trail-rights story is concrete.
6. Leaves room to **raise to €1.20** on v1.1 (US legs) or after compliance-officer wins prove WTP, and to **drop to €0.75** if a price-led wedge becomes strategically warranted.

**Do not ship below €0.75** without explicitly accepting that the audit-trail premium narrative becomes harder to defend on first customer call.

## 5. Volume tier sketch

Tier A peers don't support meaningful volume tiering — MonitorPay's published Enterprise rate is custom-only. The previous benchmark's volume tiers (€0.83 / €0.67 / €0.50) were anchored on Creditsafe and Cobalt's break structures, which are aggregator pricing — not peer pricing. Recommend **flat-rate v1, defer volume tiers until 10+ paying customers reveal a committed-volume segment.**

If a tier ladder ships later, the most defensible structure given Tier A:

| Tier | Per-call | Anchor |
|---|---|---|
| Starter (PAYG) | €0.90 | Tier A benchmark |
| Growth (€500/mo) | €0.75 | Stacked-premium floor |
| Scale (€2,000/mo) | €0.60 | 6× MonitorPay PAYG, still above worst-case COGS |
| Enterprise (custom) | €0.40+ | Below this, the reseller-rights premium evaporates; MonitorPay Enterprise becomes a real threat |

## 6. Open questions for sales calls

1. **MonitorPay Enterprise reseller-licence price.** The €0.10 PAYG explicitly excludes resale. If MonitorPay Enterprise reseller is, say, €0.30–€0.50/call, that becomes the anchor — not the PAYG number — and Strale's premium calculation needs revisiting downward by ~€0.20. **Most load-bearing single question in this document.**
2. **TheKYB Enterprise effective per-call.** Their Plus tier compresses from $5 to "under $1" at Enterprise. Where does the bundled Enterprise per-call land for a customer doing 10k/mo? If it's $1.50–$2.00, that's the closer Tier A peer than MonitorPay PAYG and shifts the band up.
3. **MonitorPay per-fact provenance.** Their API docs schema is "pending." If the Enterprise tier ships hash-chained per-fact provenance, Strale's audit-trail premium shrinks.
4. **CYBERA roadmap to corporate KYB.** They cover crypto-counterparty today. If they add corporate-entity KYB on x402 at $0.01 per call, that becomes a new floor — and a different competitive shape (x402-native, no API key).
5. **First 10 Strale customer WTP.** €0.90 is a hypothesis. The first 10 customers will reveal whether it's obvious-buy (raise to €1.20), stretch (hold at €0.90), or sticker-shock (consider price-led wedge at €0.75).

## Excluded vendors

Every vendor screened against the five-dimension Tier A filter and the single dimension that disqualified each:

- **Middesk** — fails dimension 1 (workflow-KYB product with onboarding UI), dimension 3 ($20–36k/yr floor). `middesk.com/kyb-business-verification-api`
- **Persona KYB** — fails dimension 5 (Startup tier prohibits reselling per published terms), dimension 3 (12-month minimum on paid plans). `withpersona.com/pricing`
- **Onfido / Entrust Business Verification** — fails dimension 3 (~$6k/yr floor), dimension 1 (workflow product). Vendr secondary data.
- **Socure** — fails dimension 3 ($25–75k/yr floor, 12/24-month commits). Practitioner-reported.
- **Trulioo Business Verify** — fails dimension 3 (no PAYG, quote-gated). `trulioo.com/pricing`
- **Plaid Identity + Monitor** — fails dimension 2 (single-primitive per call: $0.50 Monitor base, $0.85 doc, $0.55 fraud — not a configurable bundle). `plaid.com/pricing`
- **Sumsub** — fails dimension 1 (full KYC/KYB workflow product with hosted UI; API not separable per public pricing page). `sumsub.com/pricing`
- **iDenfy** — fails dimension 1 (workflow product), dimension 3 ($135/mo Basic minimum). `idenfy.com/pricing-plans-v3`
- **Veriff** — fails dimension 2 (identity-only, not corporate KYB), dimension 3 ($49/mo Essential minimum). `veriff.com/pricing`
- **Stripe Identity** — fails dimension 2 (KYC-only, no KYB bundle). `stripe.com/identity/pricing`
- **Footprint** — fails dimension 1 (workflow product with onboarding UI). `onefootprint.com/pricing`
- **AiPrise** — fails dimension 1 (workflow product, demo-gated pricing), dimension 3 (no public PAYG). `aiprise.com/products/kyb`
- **Sila** — fails dimension 3 (custom pricing only, no public PAYG). `silamoney.com/kyb-api`
- **Signzy** — fails dimension 3 (no published pricing, demo-gated). `signzy.com`
- **ComplyAdvantage** — fails dimension 2 (sanctions+PEP+AM bundle, not full KYB), and dimension 3 ($99.99/mo Starter minimum + 12-month enterprise commitments). Vendr.
- **Sayari Graph** — fails dimension 3 (enterprise-only, credits gated, no PAYG). `sayari.com`
- **Bureau van Dijk / Orbis** — fails dimension 3 ($20–100k/yr), dimension 5 (hostile to redistribution). `bvdinfo.com`
- **D&B Direct+** — fails dimension 3 ($25k+/yr), dimension 5 (US/CA-default, limited redistribution). `dnb.com`
- **Moody's Kompany** — fails dimension 3 (shifted to enterprise-only post-acquisition). `moodys.com/kyc`
- **Creditsafe Connect** — fails dimension 1 (raw aggregator, COGS feeder for Strale, not peer). `creditsafe.com`
- **OpenCorporates** — fails dimension 1 (raw registry, single-leg). `opencorporates.com`
- **Kyckr** — fails dimension 3 (enterprise pay-per-report, no public PAYG). `kyckr.com`
- **Global Database** — fails dimension 3 (quote-gated, no public PAYG). `globaldatabase.com`
- **Cobalt Intelligence** — fails dimension 2 (US SOS registry only, single-leg primitive). `cobaltintelligence.com`
- **Sanctions.io** — fails dimension 2 (sanctions+PEP+AM only, single-leg-family). `sanctions.io`
- **OpenSanctions** — fails dimension 2 (sanctions+PEP only, single-leg-family). `opensanctions.org`
- **Dilisense** — fails dimension 2 (sanctions+PEP only). `dilisense.com`
- **Movitz** — fails dimension 2 (VoP only). `movitz.io`
- **MonitorPay (Enterprise)** — passes structurally if reseller licence is included as published; price unknown, included in Tier A as caveat.
- **Banfico** — fails dimension 2 (VoP only), dimension 3 (no public pricing). `banfico.com`
- **Shufti Pro** — fails dimension 1 (workflow product with hosted UI). `shuftipro.com`
- **NameScan** — fails dimension 2 (screening primitives only; KYB add-on is via dashboard, not configurable bundle). `namescan.io`
- **Greip** — fails dimension 2 (fraud/IP/IBAN primitives, not corporate KYB bundle). `greip.io`
- **OFAC API (ofac-api.com)** — fails dimension 2 (sanctions only), dimension 3 (no public pricing). `ofac-api.com/pricing`
- **Verifex** — fails dimension 3 (subscription tiers $49–$499/mo, no true PAYG). `verifex.dev/pricing`
- **MerchantGuard** — fails dimension 2 (merchant risk scoring + payment-rail audit, not corporate-counterparty KYB). `merchantguard.ai`
- **Persona Startup Program** — fails dimension 5 (resale prohibited). `withpersona.com/pricing`
- **KryptoGO** — fails dimension 3 (no public pricing, demo-gated). `kryptogo.com/products/compliance-api`
- **VOVE ID** — fails dimension 3 (no public pricing). `voveid.com`
- **ScreenVeritAI** — fails dimension 3 (no public pricing). `screenveritai.com`

## Sources

### Primary (vendor pricing pages)
- MonitorPay — https://monitorpay.ai/pricing, https://monitorpay.ai/api-docs, https://monitorpay.ai/terms `[primary]`
- TheKYB — https://thekyb.com/pricing/ `[primary]`
- Verifex — https://verifex.dev/pricing `[primary]`
- Veriff — https://www.veriff.com/pricing `[primary]`
- iDenfy — https://idenfy.com/pricing-plans-v3/ `[primary]`
- Stripe Identity — https://stripe.com/identity/pricing `[primary]`
- Greip — https://greip.io/pricing `[primary]`
- Footprint — https://onefootprint.com/pricing `[primary]`
- Sumsub — https://sumsub.com/pricing/ `[primary]`
- Trulioo — https://www.trulioo.com/pricing `[primary]`
- MerchantGuard — https://www.merchantguard.ai `[primary]`
- KryptoGO — https://www.kryptogo.com/products/compliance-api `[primary]`
- Sila — https://www.silamoney.com/kyb-api `[primary]`
- Dilisense — https://dilisense.com `[primary]`
- Sanctions.io — https://sanctions.io `[primary]`
- OpenSanctions — https://opensanctions.org/api/ `[primary]`

### Primary (x402 ecosystem)
- Awesome-x402 list — https://github.com/xpaysh/awesome-x402 `[primary]`
- x402 ecosystem directory — https://www.x402.org/ecosystem `[primary]`

### Secondary (third-party benchmarks, low-confidence)
- Vendr marketplace — Persona, Onfido, ComplyAdvantage, Socure, Plaid `[secondary]`
- BeVerified.org — Onfido / Veriff / AiPrise / Persona reviews `[secondary]`
- Capterra / G2 — Sumsub / Persona / Greip pricing summaries `[secondary]`

### Internal (Strale)
- Existing benchmark — `docs/research/payee-assurance-pricing-benchmark-2026-04-22.md`
- Build-vs-buy stack — `docs/research/2026-04-28-payee-assurance-build-vs-buy.md`

---

*End. No code changes. Replaces 2026-04-22 benchmark for pricing-anchor purposes only; cost analysis and primitive inventory in the prior file remain canonical.*
