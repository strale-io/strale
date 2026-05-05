## Section 1 — IBAN/name matching

**Scope:** Commercial, regulatory and engineering diligence for IBAN/name matching (SEPA Verification of Payee, or "VoP"; UK Confirmation of Payee, or "CoP") sources that Strale could integrate behind a single **Payee Assurance v1** capability covering EU-27 + UK. Research date: 2026-04-20. The SEPA VoP scheme rulebook entered into force **2025-10-05** and the IPR compliance deadline hit **2025-10-09** for euro-area PSPs, with **2027-07-09** for non-euro EEA PSPs — so most of the pre-2025 market literature on "IBAN-name check" is stale and should be treated as such.

### Regulatory frame (matters for every provider below)

- SEPA VoP is set by EPC rulebook **EPC218-23 v1.0** (scheme live from 2025-10-05) under Instant Payments Regulation **(EU) 2024/886**. See EPC VoP page and rulebook PDF: [europeanpaymentscouncil.eu/.../verification-payee](https://www.europeanpaymentscouncil.eu/what-we-do/other-schemes/verification-payee), rulebook: [EPC218-23 PDF](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-10/EPC218-23%20v1.0%202024%20Verification%20Of%20Payee%20Scheme%20Rulebook_0.pdf).
- Only a **PSP (EEA-regulated bank, PI or EMI)** can *adhere to* the VoP scheme as a Scheme Participant. Non-PSP companies cannot adhere. They can *facilitate* the scheme by qualifying as an **RVM** (Routing and/or Verification Mechanism) — RVMs are not Scheme Participants and act legally transparently for PSPs. See EPC Adherence Guide **EPC071-25**: [PDF](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2025-03/EPC071-25%20Approved%20Guide%20to%20the%20VOP%20Scheme%20Adherence%20Process%20v1.0.pdf), EPC FAQ: [VOP scheme adherence](https://www.europeanpaymentscouncil.eu/faq/verification-payee-scheme/vop-scheme-adherence).
- The **EPC maintains a live register** of qualified and applicant RVMs: [RVM register](https://www.europeanpaymentscouncil.eu/what-we-do/other-schemes/verification-payee/routing-andor-verification-mechanisms-verification). As of late 2025 there are ~58 active RVMs connecting ~2,700+ PSPs (SurePay figure: ["Key Lessons"](https://www.surepay.eu/vop-key-lessons-learned-according-to-the-cto/)).
- UK **CoP** is a separate Pay.UK overlay service (since 2020). Participation is gated by **FCA/NCA regulation** and PSP status; however, Pay.UK introduced an **Aggregator model** in 2024 so a Technical Solution Provider (TSP) can be a Direct Participant with its PSP customers sitting behind it as Indirect Participants. 300+ organisations live as of 2025, 400+ expected in 2025. See Pay.UK: [Confirmation of Payee](https://www.wearepay.uk/what-we-do/overlay-services/confirmation-of-payee/), PSR compliance report: [SD17 Nov 2025 PDF](https://www.psr.org.uk/media/zbgb1ztz/cop-compliance-report-on-sd17-nov-2025.pdf).
- **This is the single most load-bearing constraint on Strale.** Strale is not a PSP and is not an RVM applicant. Its only legitimate paths are (a) reselling/embedding a vendor that *contractually permits* it, or (b) becoming an RVM itself (multi-quarter, FCA/EBA scrutiny, minimum viable for a solo founder: not realistic for v1).

---

### SurePay

- **Parent / corporate owner:** SurePay B.V., Netherlands. Founded 2016 as ABN AMRO spin-off; majority investor as of 2023 is Motive Partners (private equity).
- **Coverage:** "More than 30 countries" including full SEPA footprint ahead of the 2025-10-09 deadline. Named live deployments include Netherlands (99.5% of Dutch online payments), UK (90% coverage since 2019), France (114 French banks via partnership), Belgium (first Eurozone country live), Denmark (first non-euro country live nationwide, via Finance Denmark), Italy (via CBI partnership). Expands globally via SWIFT pre-validation piggyback. See [SurePay about](https://www.surepay.eu/about-surepay/), [EU 2025 page](https://www.surepay.eu/verification-of-payee-in-the-eu/), [Denmark release](https://www.globenewswire.com/news-release/2025/04/24/3067108/0/en/Finance-Denmark-selects-SurePay-for-nation-wide-Verification-Of-Payee-services-in-Denmark.html), [Belgium release](https://surepay.nl/en/surepay-accelerates-european-vop-rollout-belgium-becomes-first-eurozone-country-live-with-verification-of-payee/).
- **VoP scheme role:** **Qualified RVM** on EPC register. De-facto market leader pre-mandate.
- **UK CoP participation:** Yes, Pay.UK CoP Direct/Aggregator participant since 2019.
- **Data path:** Hybrid. SurePay is an RVM (so it can route cross-PSP SEPA VoP traffic) and also operates proprietary bilateral connections (particularly UK CoP and Nordic). Does not rely on open-banking AIS scraping.
- **Pricing model:** Not published. Volume-tiered per-call enterprise contract. Contact sales. Target customers are banks, PSPs, and corporates; no developer self-serve tier. Response-time SLA advertised at ~52ms with 99.99% uptime ([API page](https://www.surepay.eu/verification-of-payee-api/)).
- **Embedding / reseller permission:** SurePay's developer portal includes a **reseller pattern via `X-End-User` header** — evidence they anticipate partners reselling the API, though each new downstream customer must be identified and presumably contractually named. See [Bulk VoP for Banks & Corporates](https://www.surepay.eu/verification-of-payee-api/building-blocks-of-vop-bulk-verification-in-white-label-portal/), API intro: [developer.surepay.nl/introduction](https://developer.surepay.nl/introduction). **ToS not public.** The scheme-level default is "downstream entity must have its own PSP relationship" — a generic developer platform like Strale reselling per-call to arbitrary AI-agent customers is not obviously fitted to the reseller pattern SurePay envisions (banks white-labelling to their corporate customers). **Requires direct contractual inquiry** — commercial outreach sent 2026-04-20, response pending.
- **Integration effort:** Once contracted, 3–8 engineering days for executor + manifest + tests. API is REST JSON, well-documented, standard OAuth. Sandbox credentials required first.
- **Commercial readiness:** **Enterprise sales, 3–6 months typical** (banks are the primary ICP). Expect MSA, DPIA, InfoSec questionnaire, commercial minimums. **Major friction point for a solo founder.**
- **Risk flags:** (1) Commercial gate. (2) ToS almost certainly restricts "pass-through to unknown end users" — agent-calling patterns may not fit. (3) Dependency concentration if this becomes Strale's only provider. (4) Motive Partners ownership implies pressure toward high-margin enterprise deals over pay-per-call developer GTM.

### iPiD (International Payments Identity)

- **Parent / corporate owner:** iPiD Pte Ltd, Singapore-headquartered. Independent, VC-backed (investors include JPMorgan, Mastercard, FSVC). EU entity operates under iPiD Europe. About page: [ipid.tech/about](https://ipid.tech/about).
- **Coverage:** Global "Know Your Payee" (KYP) positioning across 150+ countries; full SEPA coverage via RVM role. UK CoP via Pay.UK aggregator partner. See [iPiD VoP page](https://ipid.tech/verification-of-payee), [solutions](https://ipid.tech/solutions).
- **VoP scheme role:** **Qualified RVM on EPC register** (confirmed in vendor self-description and corroborated by EPC roster references). Products: **iPiD Validate** (API), **iPiD Node** (PSP-side integration). Self-positioning: "central RVM bridging PSPs and schemes across SEPA."
- **UK CoP participation:** Yes.
- **Data path:** RVM-intermediary (routes to PSP directly for authoritative answer) + reference/aggregated data for non-SEPA corridors.
- **Pricing model:** Not published. Enterprise sales. Target customers: banks, PSPs, fintechs, e-commerce, corporates.
- **Embedding / reseller permission:** Public materials describe iPiD as integrating into customer systems with mTLS/OAuth2/PGP encryption; non-PSP fintechs are listed as an ICP. However, **scheme-level default applies** — when iPiD is acting as RVM for a SEPA VoP query, the downstream caller must either be a PSP or be delivering the answer to a PSP. Whether a purely developer-facing product like Strale, billing non-PSP customers (agent operators), is contractually permitted **requires direct inquiry — likely restrictive based on scheme-participant default.**
- **Integration effort:** 3–7 engineering days once credentials granted. Modern REST API, structured JSON, sub-second latency advertised.
- **Commercial readiness:** Mid-market to enterprise sales. Weeks-to-months typical; faster than SurePay in practice because iPiD is newer and hungrier for logos. No self-serve tier.
- **Risk flags:** (1) No public ToS or pricing. (2) Scheme-participant constraint on downstream usage. (3) Newer entrant — reliability data shorter-tailed than SurePay. (4) Global positioning means EU coverage may not be as deep/exclusive as SurePay's Dutch/UK strongholds.

### MonitorPay (powered by iPiD)

- **Parent / corporate owner:** **Sister-brand / product layer of iPiD** targeting SMB and developer-facing use cases. Monitorpay.ai positions itself explicitly against iPiD in marketing ("MonitorPay covers everything iPiD does and adds..."), but corroborating trademark/entity research suggests it is iPiD-adjacent. See [MonitorPay homepage](https://monitorpay.ai/), [iPiD Competitors page on MonitorPay](https://monitorpay.ai/ipid-competitors-best-know-your-payee-kyp-solutions-compared/) — note the unusual stance of a vendor publishing comparison content against its own parent, which reads like separately-branded GTM.
  - **Flag: the exact corporate relationship between MonitorPay and iPiD is unclear from public sources and should be confirmed before commercial commitment.**
- **Coverage:** 200+ data sources, 150+ countries claimed, including full EU + UK + non-EU (Canada, Australia, Brazil, India).
- **VoP scheme role:** Inherits iPiD's RVM qualification (presumed — not independently confirmed on EPC register under "MonitorPay" name).
- **UK CoP participation:** Yes, per marketing.
- **Data path:** API aggregator — payee name matching, IBAN structure, account ownership, VAT registration, UBO, continuous monitoring.
- **Pricing model:** Not published. Homepage implies self-service signup. Contact sales for tiered pricing.
- **Embedding / reseller permission:** **Marketed as embeddable.** ToS not public. Given it's iPiD-adjacent, the same scheme-level restrictions likely apply to the VoP-specific call path. The bundled "account ownership" / "company ownership" / "VAT" add-ons are *not* scheme-restricted and Strale could likely embed those more freely.
- **Integration effort:** 3–5 engineering days. REST JSON, sub-second responses.
- **Commercial readiness:** Mid-market. **Likely weeks**, possibly self-serve for small volumes. The most developer-friendly of the VoP-capable vendors surveyed.
- **Risk flags:** (1) Brand–entity ambiguity (is MonitorPay a standalone company, an iPiD product, or a GTM brand?). (2) Young entrant — less deployment evidence than SurePay/iPiD. (3) Marketing-heavy, thin published technical documentation. (4) Dependency on iPiD's underlying infrastructure.

### TrueLayer

- **Parent / corporate owner:** TrueLayer Ltd (UK). Independent, VC-backed (Tiger, Temasek, Stripe, Mouro Capital).
- **Coverage:** UK + Eurozone. UK CoP embedded in their payments flow. SEPA VoP rolled out for SEPA Payouts from 2025-10-09. See help article: [Verification of Payee (VoP) for SEPA Payouts](https://support.truelayer.com/hc/en-us/articles/38075013057681-Verification-of-Payee-VoP-for-SEPA-Payouts).
- **VoP scheme role:** **Consumer of VoP, not an RVM.** TrueLayer is a PSP (UK EMI) and uses an underlying RVM for its SEPA VoP; the customer-facing product is bundled into their Payouts API, not exposed as a standalone "verify this IBAN+name" endpoint.
- **UK CoP participation:** Yes, but again bundled into their Payouts/Verification flow, not sold as a standalone name-match service.
- **Data path:** Open banking AIS + SEPA VoP (via underlying RVM) + UK CoP, all composed behind TrueLayer's Payouts API.
- **Pricing model:** Per-payout basis, not per-verification. Not published; contact sales.
- **Embedding / reseller permission:** **Architecturally blocked for Strale's use case.** TrueLayer's VoP is a side-effect of their payout flow — there is no public standalone "IBAN+name verification" product. Re-exposing the match result outside of the associated payout would require custom contractual arrangement and probably isn't something they'd entertain for a non-PSP reseller. TrueLayer has also stated the **full VoP service product** (as a standalone) is expected H2 2026 (Phase 2 per help docs).
- **Integration effort:** Not applicable for v1 — wrong product shape.
- **Commercial readiness:** Mid-market self-serve for payments, but VoP-as-standalone not yet productised.
- **Risk flags:** **Fails the product-fit test.** Flag for re-evaluation in H2 2026 if TrueLayer productises standalone VoP.

### Tink (Visa-owned)

- **Parent / corporate owner:** Visa Inc. (acquired Tink 2022).
- **Coverage:** Account Check covers ~18 European countries — UK, SE, DE, FR, ES, IT, NL, BE, FI, NO, DK, AT, PT, IE, PL and more — via open banking AIS. See [Tink Account Check](https://tink.com/products/account-check/).
- **VoP scheme role:** **Not an RVM.** Tink's Account Check is an AIS-based account-ownership verification, not a SEPA VoP scheme participant.
- **UK CoP participation:** No direct participation identified (Tink uses AIS, not CoP, for name-match).
- **Data path:** Open banking AIS — user consents to their account, Tink retrieves the name on the account, does a match. Fundamentally different from VoP: requires the *account holder* to log in, not a third-party IBAN check. **This is not fit-for-purpose for Strale's Payee Assurance use case** (which needs to verify a third-party IBAN that the user has supplied but does not hold the credentials for).
- **Pricing model:** Tiered, contact sales ([tink.com/pricing](https://tink.com/pricing/)).
- **Embedding / reseller permission:** Visa/Tink ToS for AIS is strict about redistributing data — embedding is unlikely to be permitted in Strale's model.
- **Integration effort:** N/A — wrong product shape.
- **Commercial readiness:** Enterprise sales cycle.
- **Risk flags:** **Fails the product-fit test for Payee Assurance.** AIS ≠ VoP. Keep for a separate "Bank Account Ownership" capability if ever needed.

### Yapily

- **Parent / corporate owner:** Yapily Ltd (UK). Independent, VC-backed.
- **Coverage:** UK + ~19 European countries via open banking AIS. Yapily **Validate** is marketed as Beta. See [Yapily Validate](https://www.yapily.com/product/validate), [docs](https://docs.yapily.com/pages/data/validate/overview/). They also have a **VoP-specific doc page**: [docs.yapily.com/payments/payment-resources/verification-of-payee](https://docs.yapily.com/payments/payment-resources/verification-of-payee).
- **VoP scheme role:** Yapily is a PSP (UK AISP/PISP) — their VoP flow is bundled into their payment initiation product, not standalone.
- **UK CoP participation:** Yes, as part of their payments flow.
- **Data path:** Same as TrueLayer — AIS + underlying VoP, composed behind payment initiation.
- **Pricing model:** Tiered, enterprise, [yapily.com/pricing](https://www.yapily.com/pricing) says "contact us."
- **Embedding / reseller permission:** Same architectural constraint as TrueLayer — VoP is a payment-flow side-effect.
- **Integration effort:** N/A for standalone IBAN+name verification.
- **Commercial readiness:** Mid-market to enterprise.
- **Risk flags:** Fails product-fit for Payee Assurance v1 unless Strale also builds Payment Initiation (out of scope for v1).

### GoCardless Bank Account Data (formerly Nordigen)

- **Parent / corporate owner:** GoCardless Ltd (UK). Acquired Nordigen 2022, rebranded 2023.
- **Coverage:** ~2,500 banks across UK + Europe via open banking AIS.
- **VoP scheme role:** **Not an RVM.**
- **UK CoP participation:** Not a standalone CoP product.
- **Data path:** AIS only. **Does not provide third-party IBAN+name match** — only retrieves data from accounts the user has credentials for.
- **Integration effort:** N/A.
- **Risk flags:** **Fails product-fit.** Historical Nordigen reputation for a generous free tier is relevant only for AIS, not for Payee Assurance.

### Klarna Kosma

- **Parent / corporate owner:** Klarna Bank AB (Sweden).
- **Coverage:** 15,000+ banks, 27 countries via open banking AIS.
- **VoP scheme role:** Not identified as an RVM on the EPC register.
- **Data path:** AIS. Same constraint as Tink/Yapily/GoCardless BAD.
- **Risk flags:** **Fails product-fit for third-party IBAN+name match.** Kosma positions itself against banks and fintechs as an AIS/PIS platform, not a VoP/CoP provider.

### Bottomline PTX / Confirmation of Payee

- **Parent / corporate owner:** Bottomline Technologies (US, Thoma Bravo portfolio).
- **Coverage:** **UK CoP primary product**; EU VoP in rollout per late-2024 blog content. See [PTX product](https://www.bottomline.com/uk/products/ptx), [CoP for Business](https://www.bottomline.com/resources/confirmation-payee-business).
- **VoP scheme role:** Believed to be qualifying/qualified RVM — not independently confirmed on EPC register in search snippets; needs direct check.
- **UK CoP participation:** Yes, Direct Participant **and** Aggregator — PTX offers CoP as a SaaS to businesses with "integration in a few days" via JSON API.
- **Data path:** Direct CoP participant (UK) + RVM or scheme-consumer (EU).
- **Pricing model:** Not published. Enterprise SaaS.
- **Embedding / reseller permission:** **Strongest UK signal among candidates:** PTX markets CoP to *corporates* (not just banks), which is closer to Strale's ICP. Whether "corporate embedding CoP in its own product sold to its customers" is permitted is the specific ToS question.
- **Integration effort:** 3–5 days if contracted.
- **Commercial readiness:** Mid-market enterprise. Weeks-to-months.
- **Risk flags:** (1) UK-first — EU coverage less mature than SurePay/iPiD. (2) Thoma Bravo-owned → enterprise-priced. (3) "CoP for Business" is explicitly a sold-to-corporates product — not sold-to-resellers; the downstream embedding-and-billing question is still open.

### Worldline / equensWorldline

- **Parent / corporate owner:** Worldline S.A. (France, listed). equensWorldline is a subsidiary.
- **Coverage:** Pan-European scheme-level player. Direct connections to most Eurozone clearing systems.
- **VoP scheme role:** **Qualified RVM** per Worldline's own announcements. See [VoP is now live in the Eurozone](https://worldline.com/en/home/main-navigation/resources/blogs/2025/verification-of-payee-is-now-live-in-the-eurozone).
- **UK CoP participation:** Present in UK but primarily via acquiring/payments, not a named CoP aggregator.
- **Data path:** RVM + deep scheme-level connectivity. Typical customer is a mid-to-large bank.
- **Pricing model:** Enterprise, contact sales.
- **Embedding / reseller permission:** Very unlikely to be permissive for a solo-founder reseller. Worldline's GTM is bank-integrator.
- **Integration effort:** Unknown; API public documentation thin on the VoP side.
- **Commercial readiness:** **Deep enterprise — 6-month+ cycle typical.** Not fit for Strale's timeline.
- **Risk flags:** Known 2023 outage affected multiple countries — operational risk non-zero. Scale-skew toward banks makes startup integration unlikely.

### Form3

- **Parent / corporate owner:** Form3 Financial Cloud Ltd (UK). Independent, VC-backed.
- **Coverage:** Pan-European + UK.
- **VoP scheme role:** **Qualified RVM** per Form3 materials. See [Form3 VoP](https://www.form3.tech/additional-services/vop).
- **UK CoP participation:** Yes, as a PSP-facing platform.
- **Data path:** RVM + cloud-native payments platform.
- **Pricing model:** Not published. Enterprise.
- **Embedding / reseller permission:** Form3's stated integration time is **~8 weeks** with onboarding manager; customer is typically a bank or licensed PSP. Embedding for a non-PSP reseller is unlikely to fit their model.
- **Commercial readiness:** Enterprise — weeks to months.
- **Risk flags:** Good RVM but wrong ICP match for Strale.

### Trustly

- **Parent / corporate owner:** Trustly Group AB (Sweden). Nordic Capital-owned.
- **Coverage:** Strong in Nordics + expanding EU. Primarily a pay-by-bank / payouts brand.
- **VoP scheme role:** Not confirmed as an RVM on EPC register from public search. Trustly is a PSP.
- **UK CoP participation:** Not confirmed.
- **Data path:** AIS + Nordic direct bank connections.
- **Risk flags:** Similar to TrueLayer/Yapily — VoP bundled into payments flow, not a standalone IBAN+name check product. **Likely fails product-fit.**

### Banfico

- **Parent / corporate owner:** Banfico Ltd (UK), with Frankfurt entity for EU. Independent.
- **Coverage:** UK CoP specialist (since 2019) extended to EU VoP.
- **VoP scheme role:** **"Industry first fully qualified RVM in EPC Verification of Payee Scheme"** per their own press release (2025). See [Banfico RVM announcement](https://banfico.com/banfico-is-the-industry-first-fully-qualified-rvm-in-epc-verification-of-payee-scheme/), [EPC VoP product](https://banfico.com/epc-verification-of-payee/).
- **UK CoP participation:** Yes, as **Pay.UK-certified CoP Aggregator** — this is their headline position. ACI Worldwide resells Banfico in the UK.
- **Data path:** RVM (EU) + Aggregator (UK) + Temenos Exchange integration. Offers both SaaS pricing (volume-tiered) and on-premise fixed license.
- **Pricing model:** SaaS volume-tiered, "competitive tailored pricing." Not published. Sandbox at [portal.bankc.banfico.io](https://portal.bankc.banfico.io/).
- **Embedding / reseller permission:** **This is the most Strale-friendly of the enterprise players.** Banfico has built its business on being the technical middle layer ("aggregator") — ACI Worldwide resells them; Temenos Exchange distributes them. The aggregator model implies a ToS that supports downstream non-PSP usage, but **the specific question of "can a startup platform sell VoP-per-call to AI agents?" still needs to be asked directly.**
- **Integration effort:** 3–7 days, sandbox available without full contract.
- **Commercial readiness:** **Best-in-class for a small buyer: weeks, not months.** Banfico's aggregator/reseller posture means their contract template handles partner arrangements natively.
- **Risk flags:** (1) Smaller than SurePay — coverage depth per-country may vary. (2) Still needs direct ToS inquiry on Strale-style embedding. (3) Single point of failure if chosen solo.

### SWIFT Payment Pre-validation (Beneficiary Account Verification)

- **Parent / corporate owner:** SWIFT (Belgium cooperative).
- **Coverage:** Global but **correspondent-banking focused**, not SEPA VoP scheme-compatible. BAV API v3 is live. See [SWIFT Payment Pre-validation](https://www.swift.com/our-solutions/global-financial-messaging/payments/payment-pre-validation/faq), [developer portal](https://developer.swift.com/apis/payment-pre-validation-api).
- **VoP scheme role:** Not an EPC RVM. **Parallel product, not a substitute.**
- **UK CoP participation:** No.
- **Data path:** Bank-to-bank pre-validation over SWIFT network.
- **Risk flags:** **Wrong product for SEPA/UK CoP.** Access is gated to SWIFT members (banks). **Fails product-fit.**

### Plaid

- **Parent / corporate owner:** Plaid Inc. (US). Independent.
- **Coverage:** US-first; EU expansion since ~2022. Eurozone + UK via Plaid's virtual account solution. Plaid claims automatic VoP on Eurozone payouts ([EU Instant Payments blog](https://plaid.com/blog/eu-instant-payments-what-businesses-need-to-know/)).
- **VoP scheme role:** Consumer via underlying RVM; bundled into Plaid Payouts/Virtual Accounts, not standalone.
- **Data path:** AIS + bundled VoP in payouts.
- **Risk flags:** Same architectural constraint as TrueLayer/Yapily. **Fails product-fit** for standalone Payee Assurance. Not a viable primary vendor.

### Direct RVM participation (Strale becomes its own RVM)

- **Requirements:** Complete EPC RVM Qualification Process, sign Adherence Agreement, certify API against EPC Reference Toolbox, pay scheme fees, maintain ongoing operational readiness. No PSP licence is strictly required to be an RVM (RVMs aren't Scheme Participants), but onboarding cost is material: legal opinion, certification, scheme fees, technical bring-up. See [EPC071-25 Adherence Guide](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2025-03/EPC071-25%20Approved%20Guide%20to%20the%20VOP%20Scheme%20Adherence%20Process%20v1.0.pdf).
- **Realistic timeline:** **6–12 months minimum** including certification. Not practical for Q2 2026 ship.
- **Verdict:** **Not viable for v1.** Potential Q4 2026 / 2027 play if Strale's Payee Assurance traffic justifies it.

### Open-source / public-source alternatives

- **None exist for SEPA VoP or UK CoP** — these are scheme-restricted services where authoritative answers come from the payee's PSP. No amount of scraping or public-data aggregation replicates them. Algorithmic IBAN validation (which Strale already has) is the limit of what can be done without scheme access. **Confirmed: no open-source substitute.**

---

### Comparison table

Columns: **EU-27 VoP coverage** / **UK CoP coverage** / **Pricing transparency** / **Embedding permitted** / **Integration effort (days)** / **Commercial readiness** / **Risk level**. "Green count" = columns rated favourably for Strale's use case (Yes / published / low / days / fast / low).

| Provider | EU-27 VoP | UK CoP | Pricing public | Embedding permitted | Integration days | Commercial readiness | Risk | Green count |
|---|---|---|---|---|---|---|---|---|
| **SurePay** | Yes (broadest) | Yes | No | Unknown / likely restrictive | 3–8 | Enterprise 3–6 mo | Med | 2/7 |
| **iPiD** | Yes | Yes | No | Unknown | 3–7 | Mid-enterprise, weeks–months | Med | 2/7 |
| **MonitorPay** | Yes (inherited) | Yes | No (marketing implies self-serve) | Marketed as embeddable — ToS unverified | 3–5 | Weeks, possibly self-serve | Med-High (brand clarity) | 3/7 |
| **Banfico** | Yes (RVM) | Yes (Aggregator) | No (sandbox self-serve) | Likely yes (aggregator-native ToS); still needs confirmation | 3–7 | Weeks | Low-Med | **4/7** |
| **Bottomline PTX** | Partial/rollout | Yes | No | Unknown | 3–5 | Weeks-months | Med | 2/7 |
| **Worldline** | Yes (RVM) | Partial | No | Unlikely | Unknown | 6+ months | Med-High | 1/7 |
| **Form3** | Yes (RVM) | Yes | No | Unlikely for non-PSP | 8+ weeks | Enterprise | Med | 1/7 |
| **TrueLayer** | Bundled only | Bundled only | No | No (bundled in payouts) | N/A | N/A | — | 0/7 |
| **Yapily** | Bundled only | Bundled only | No | No (bundled in payouts) | N/A | N/A | — | 0/7 |
| **Tink** | AIS-only | AIS-only | No | No (AIS redistribution restricted) | N/A | N/A | — | 0/7 |
| **GoCardless BAD** | AIS-only | AIS-only | Freemium for AIS | No for VoP | N/A | N/A | — | 0/7 |
| **Klarna Kosma** | AIS-only | AIS-only | No | No | N/A | N/A | — | 0/7 |
| **Trustly** | Bundled only | No | No | No | N/A | N/A | — | 0/7 |
| **SWIFT BAV** | No (not SEPA) | No | No | Banks only | N/A | N/A | — | 0/7 |
| **Plaid** | Bundled only | Bundled only | No | No | N/A | N/A | — | 0/7 |
| **Self-RVM (Strale directly)** | Would need build | N/A | — | — | 6–12 mo + cert | Not v1 | High | 0/7 |

---

### Recommended implementation path

**Architectural verdict first: Strale needs ONE primary provider, not country-routing.** Because every credible vendor is already a pan-SEPA RVM (SurePay, iPiD, Banfico, Worldline, Form3, Bottomline), per-country routing would duplicate effort without adding coverage. A single RVM contract gets Strale the full EU-27 footprint. UK CoP can come from the same vendor (all shortlisted vendors participate in Pay.UK either directly or via aggregator) or — if the primary can't do both — from a dedicated UK CoP aggregator as a second provider.

**Primary recommendation: Banfico as the target primary vendor.**

Reasoning: Banfico is the only candidate that is simultaneously (a) a qualified EPC RVM for SEPA VoP, (b) a Pay.UK CoP Aggregator for UK, (c) architecturally designed around reselling to downstream entities (ACI and Temenos both distribute them — a ToS pattern Strale would fit into), (d) offers a self-serve sandbox (portal.bankc.banfico.io) so engineering work can start before contract close, and (e) has a realistic weeks-not-months commercial cycle for a small buyer. This is the lowest-friction path to shipping Payee Assurance v1 in Q2 2026 while respecting doctrine DEC-20260420-H (direct data connection, no scraping, full ToS compliance).

**Plan B / fallback: MonitorPay.**

Runs in parallel to Banfico outreach. MonitorPay is the most developer-friendly in public posture and explicitly marketed as embeddable. Faster if Banfico contract drags. Caveat: brand–entity relationship with iPiD needs confirming before commitment; ToS on embed-and-bill needs explicit written confirmation.

**Plan C: iPiD direct.**

If MonitorPay's relationship to iPiD turns out to be a thin GTM wrapper (not a fully separable contract), go straight to iPiD. Broader global footprint than Banfico, cleaner single-vendor story; slower commercial cycle.

**Parked: SurePay.**

Commercial outreach already sent 2026-04-20. SurePay is the category leader and the best-coverage option, but (a) enterprise sales cycle is multi-quarter and (b) their existing reseller pattern (`X-End-User` header) is built for banks white-labelling to corporate customers, not for a developer platform re-exposing per-call to AI agents. Keep as a potential future upgrade once Payee Assurance v1 has volume; do not block Q2 2026 ship on SurePay.

**Explicitly out of scope for v1:**

- TrueLayer, Yapily, Plaid, Trustly, GoCardless BAD, Tink, Klarna Kosma — all bundle VoP/AIS inside a payment flow. Wrong product shape. Revisit in a separate "Payment Initiation" capability if ever relevant.
- Worldline, Form3 — enterprise-only ICP, GTM too slow for solo founder.
- SWIFT BAV — banks-only access.
- Self-RVM — 6–12 months, unrealistic for v1 but valid Q4-2026/2027 strategic option.

**Structural blockers identified:**

1. **Scheme default:** "RVM output must be consumed by a PSP." Every vendor in the shortlist inherits this default unless their own contract explicitly loosens it. Strale is not a PSP. The ToS question "can Strale embed match results in a product sold to non-PSP AI-agent operators" is the *single hinge* of this whole section. No Payee Assurance v1 can ship until at least one vendor answers this in writing.
2. **"No scraping" doctrine:** All shortlisted vendors are direct-scheme participants or RVMs. No conflict with DEC-20260420-H.
3. **No MSA lawyer risk:** Banfico + MonitorPay are the two vendors whose commercial model most likely fits a simple per-call reseller contract. SurePay/Worldline/Form3 will want a heavyweight MSA — a real blocker for a solo founder.

---

### Open questions — for Petter's follow-up session

1. **ToS permission for embed-and-bill.** Can a non-PSP developer platform (Strale) contractually embed the VoP/CoP match result in a capability response and bill its own non-PSP customer (AI-agent operator) per call? This must be answered in writing by **at least one of Banfico, MonitorPay, iPiD, SurePay** before Payee Assurance v1 can ship. Default from EPC scheme rules is "no." Every vendor's contract may or may not widen that default. **This is the #1 blocker.**
2. **MonitorPay ↔ iPiD corporate relationship.** Exact entity structure is unclear from public sources. Could be (a) separate legal entity with iPiD as data supplier, (b) iPiD product with distinct GTM brand, or (c) something else. Matters for: contract primacy, data-processing chain (DPIA), and what happens if iPiD raises prices. Ask MonitorPay directly for a corporate chart before signing.
3. **Whether to treat UK CoP and SEPA VoP as one capability or two.** A single `payee-assurance` capability that transparently routes by IBAN country-code is cleaner for customers but doubles contract risk (need both schemes covered by the same vendor or need two vendor contracts). Banfico-as-primary collapses this nicely; Plan-B via MonitorPay may not cover UK CoP with the same depth — needs confirming.
4. **Pricing floor vs Strale per-call pricing.** Enterprise vendors price VoP at per-call rates that may be non-trivial (low-single-digit euro cents to tens-of-cents per call depending on volume tier). Strale's per-call pricing to developers must stay commercially sane after internalising that cost. **No pricing is published anywhere** — needs sales-call numbers before committing to customer-facing pricing.
5. **Sandbox-before-contract feasibility.** Banfico publishes a sandbox portal, but it's unclear whether full functional testing (including real VoP response codes: match / close-match / no-match / not-possible) is available pre-contract or only post-contract. Needs verification before committing to Q2 2026 ship date.
6. **Liability on false-positive match.** If the VoP returns "match" but the account turns out to be fraud, who is liable — the underlying PSP, the RVM, the aggregator (Banfico), or Strale? This cascades to a PII/DPIA question Strale has no lawyer to answer. Likely need a contracted advisor for the v1 launch.
7. **Nordic non-euro coverage (SE, NO)** — Sweden and Norway are non-euro EEA countries with 2027-07-09 deadlines. SurePay has Denmark live; Nordic coverage maturity across the other shortlisted vendors is uneven. Requires per-vendor country-specific confirmation before shipping a "EU+UK" capability badge.

---

### Sources

- [EPC — Verification of Payee scheme](https://www.europeanpaymentscouncil.eu/what-we-do/other-schemes/verification-payee)
- [EPC — VOP scheme rulebook EPC218-23 v1.0 (PDF)](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-10/EPC218-23%20v1.0%202024%20Verification%20Of%20Payee%20Scheme%20Rulebook_0.pdf)
- [EPC — Adherence Guide EPC071-25 (PDF)](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2025-03/EPC071-25%20Approved%20Guide%20to%20the%20VOP%20Scheme%20Adherence%20Process%20v1.0.pdf)
- [EPC — RVM register](https://www.europeanpaymentscouncil.eu/what-we-do/other-schemes/verification-payee/routing-andor-verification-mechanisms-verification)
- [EPC FAQ — VOP scheme adherence](https://www.europeanpaymentscouncil.eu/faq/verification-payee-scheme/vop-scheme-adherence)
- [Pay.UK — Confirmation of Payee](https://www.wearepay.uk/what-we-do/overlay-services/confirmation-of-payee/)
- [Pay.UK — CoP FAQs](https://www.wearepay.uk/what-we-do/overlay-services/confirmation-of-payee/faqs/)
- [PSR — CoP compliance report on SD17 Nov 2025 (PDF)](https://www.psr.org.uk/media/zbgb1ztz/cop-compliance-report-on-sd17-nov-2025.pdf)
- [SurePay — homepage](https://www.surepay.eu/)
- [SurePay — VoP API page](https://www.surepay.eu/verification-of-payee-api/)
- [SurePay — EU 2025](https://www.surepay.eu/verification-of-payee-in-the-eu/)
- [SurePay — VoP Key Lessons (CTO)](https://www.surepay.eu/vop-key-lessons-learned-according-to-the-cto/)
- [SurePay — Belgium first Eurozone live](https://surepay.nl/en/surepay-accelerates-european-vop-rollout-belgium-becomes-first-eurozone-country-live-with-verification-of-payee/)
- [SurePay — Denmark nationwide](https://www.globenewswire.com/news-release/2025/04/24/3067108/0/en/Finance-Denmark-selects-SurePay-for-nation-wide-Verification-Of-Payee-services-in-Denmark.html)
- [SurePay Developer Portal — Introduction](https://developer.surepay.nl/introduction)
- [SurePay — Bulk VoP white-label portal](https://www.surepay.eu/verification-of-payee-api/building-blocks-of-vop-bulk-verification-in-white-label-portal/)
- [iPiD — homepage](https://ipid.tech/)
- [iPiD — VoP page](https://ipid.tech/verification-of-payee)
- [iPiD — Solutions](https://ipid.tech/solutions)
- [iPiD — About](https://ipid.tech/about)
- [MonitorPay — homepage](https://monitorpay.ai/)
- [MonitorPay — VoP complete guide](https://monitorpay.ai/verification-of-payee-vop-the-complete-guide-to-eu-payment-verification-requirements/)
- [MonitorPay — iPiD Competitors](https://monitorpay.ai/ipid-competitors-best-know-your-payee-kyp-solutions-compared/)
- [Banfico — VoP](https://banfico.com/cop-verification-of-payee/)
- [Banfico — EPC VoP](https://banfico.com/epc-verification-of-payee/)
- [Banfico — Industry first fully qualified RVM](https://banfico.com/banfico-is-the-industry-first-fully-qualified-rvm-in-epc-verification-of-payee-scheme/)
- [Banfico — Pay.UK and Banfico](https://www.wearepay.uk/verification-of-payee-with-banfico/)
- [Banfico — Sandbox portal](https://portal.bankc.banfico.io/)
- [TrueLayer — VoP for SEPA Payouts (Help)](https://support.truelayer.com/hc/en-us/articles/38075013057681-Verification-of-Payee-VoP-for-SEPA-Payouts)
- [TrueLayer — Verification product](https://truelayer.com/verification/)
- [Tink — Account Check](https://tink.com/products/account-check/)
- [Tink — Pricing](https://tink.com/pricing/)
- [Yapily — Validate](https://www.yapily.com/product/validate)
- [Yapily — VoP docs](https://docs.yapily.com/payments/payment-resources/verification-of-payee)
- [Yapily — Pricing](https://www.yapily.com/pricing)
- [Bottomline — CoP for Business](https://www.bottomline.com/resources/confirmation-payee-business)
- [Bottomline — PTX](https://www.bottomline.com/uk/products/ptx)
- [Bottomline — CoP expansion blog](https://www.bottomline.com/resources/blog/confirmation-of-payee-expansion-represents-crucial-step-forward-in-uk-banking)
- [Worldline — VoP live in Eurozone](https://worldline.com/en/home/main-navigation/resources/blogs/2025/verification-of-payee-is-now-live-in-the-eurozone)
- [Worldline — VoP SEPA blog](https://worldline.com/en/home/main-navigation/resources/blogs/2025/verification-of-payee-be-ready-to-tackle-the-challenge-of-combatting-fraud-and-comply-with-the-regulatory-obligation)
- [Form3 — VoP product](https://www.form3.tech/additional-services/vop)
- [Form3 — VoP deadline insights](https://www.form3.tech/news/payment-insights/vop-deadline)
- [Form3 — IFX Payments selects Form3](https://www.form3.tech/news/press-releases/ifx-payments-selects-form3-for-verification-of-payee)
- [GoCardless — Bank Account Data](https://gocardless.com/bank-account-data/)
- [Klarna Kosma](https://www.kosma.com/use-cases/banking/)
- [Plaid — EU Instant Payments blog](https://plaid.com/blog/eu-instant-payments-what-businesses-need-to-know/)
- [Plaid — Payments (Europe) Payment Confirmation](https://plaid.com/docs/payment-initiation/virtual-accounts/payment-confirmation/)
- [SWIFT — Payment Pre-validation FAQ](https://www.swift.com/our-solutions/global-financial-messaging/payments/payment-pre-validation/faq)
- [SWIFT Developer — Payment Pre-validation API](https://developer.swift.com/apis/payment-pre-validation-api)
- [LUXHUB — How and when to adhere to EPC VOP Scheme](https://luxhub.com/how-and-when-to-adhere-to-the-epc-vop-scheme/)
- [LUXHUB — Now registered as EPC VOP Scheme-compliant RVM](https://luxhub.com/vop-luxhub-is-now-registered-as-epc-vop-scheme-compliant-rvm/)
- [Tietoevry — RVM services press release 2025-01](https://www.tietoevry.com/en/newsroom/all-news-and-releases/press-releases/2025/01/rvm-services/)
- [TechnoXander — expands as EPC VoP-compliant RVM](https://technoxander.com/technoxander-expands-as-epc-vop-compliant-rvm/)
- [Moody's — VoP instant payment rules 2025](https://www.moodys.com/web/en/us/kyc/resources/insights/verification-of-payee-epc-instant-payment-rules-for-2025.html)
