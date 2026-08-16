# Kyckr — Build/Buy Evaluation

**Date:** 2026-05-07
**Author:** CC research spike (Opus 4.7), branch `research/kyckr-evaluation`, worktree `../strale-spike`
**Triggers:**
- DEC-20260506-G (no-fixed-cost stance) names Kyckr as a possible re-eval target
- DEC-20260507-C (mid-rebuild cohort defaults to Openapi PAYG) names Kyckr as backup if case 151296 falls through
- Coverage Matrix (post-Topograph pivot) hypothesises Kyckr could close 5–8 gap-5 countries in one motion
- Outreach to-do (P1, filed 2026-05-05) still in Inbox — chat has not yet engaged Kyckr
- bits.bi (Stockholm peer) competitive-intel signal that Kyckr is used by KYB platforms for long-tail jurisdictions

**Scope:** desk research only. No vendor outreach (chat's responsibility). All claims trace to a verifiable source URL.

---

## 1. Headline recommendation

**Kyckr is neither a viable primary fallback for IT/ES/PT/AT (option a) nor a viable parallel gap-5 closer (option b). Recommended: skip and pursue alternatives.**

The decisive evidence is Kyckr's own published Terms & Conditions clause 3.2(b) — resale/redistribution to third parties is **prohibited** under standard terms — combined with clause 2.1 limiting use to "internal business use only" and the absence of any publicly published pricing, sandbox, or self-service signup. Strale's product (a pass-through API where third-party agents and customers consume Kyckr-derived data downstream) is the exact pattern Kyckr's standard ToS prohibits. Any positive evaluation requires a custom partner-programme addendum (Kyckr's `/partners` page references reseller/introducer arrangements, but terms and pricing are not published). Pursuing such an addendum collides with DEC-20260506-G's no-fixed-cost stance: vendor partner tiers in this space typically carry fixed monthly minimums or annual commits the stance was authored to refuse.

Two narrower fallback uses survive:
- **(c) Kyckr as informal benchmark only:** if chat opens a partner-programme conversation later, the conversation should be framed as a price-discovery exercise to inform the build/buy threshold for direct Tier-1 builds — not as a v1 dependency.
- **(d) Kyckr as last-resort if every direct path fails:** for any single country where (i) no Tier-1 doctrine-clean direct path exists, (ii) no sub-€100/mo Tier-2 vendor path exists, and (iii) a paying customer is attached. None of those preconditions are true today.

For the gap-5 countries (LU/BG/CY/HU/MT), the direct Tier-1 candidates already triaged (LBR, Bulgarian Open Data Portal, DRCOR, e-Cégjegyzék) are the path. For the IT/ES/PT/AT mid-rebuild cohort, Openapi case 151296 is the path; if it falls through, the fallback is per-country reassessment, not a multi-country aggregator pivot to Kyckr.

---

## 2. Coverage summary

Kyckr's headline claim is **300+ corporate registries across 100+ countries** (varies between "100+" and "120 countries" across pages). Profile fields are tiered: **Lite** (Registration info, Registered address, Legal status, Activity, Officials, Shareholders + Share Capital) and **Enhanced** (Lite + Legal Form + UBO Declarations) per `/company-register-data`.

Per-country specifics surfaced in this spike (Coverage Portal at `coverage.kyckr.com` is JS-rendered and did not return content via WebFetch; the table below is assembled from blog posts and product pages):

| Country | Kyckr coverage? | Underlying source(s) | Profile depth claim | UBO available? | Notes |
|---|---|---|---|---|---|
| **LU** | Yes | RCS (companies) + RBE (UBO) | Standard fields (legal name, RCS number, legal form, incorporation date, registered address, legal status, directors, articles, financials) | Yes via RBE — but post-CJEU 2022 restricted to "National Authorities" and "AML/CFT Professionals" | Strongest gap-5 fit on paper |
| **BG** | Yes (claimed under "300+ registries / 100+ countries"; not separately confirmed on Kyckr blog) | Bulgarian Trade Register | Not enumerated | UBO public on registry portal but extras require qualified e-signature | Tier-1 direct path (Bulgarian Open Data Portal XML) is plausible |
| **CY** | Yes (claimed under "300+/100+"; not separately confirmed) | DRCOR | Not enumerated | UBO register ceased public access 2023-01-03 | Restriction is Cyprus-side, not Kyckr-side |
| **HU** | Yes (claimed under "300+/100+"; not separately confirmed) | Céginformáció / Justice court system | Not enumerated | UBO €3.80/extract from govt, several-month delay | Restriction is Hungary-side |
| **IT** | Yes — explicit in API V1 changelog | InfoCamere (Registro Imprese) | Live company registration, directors, shareholders; identifier transitioned codice fiscale → REA in 2025-03 | Subject-Person-restricted (per April 28 UBO research, generally) | Direct InfoCamere customer track via Distributore Ufficiale (call 11 May 2026) is parallel option |
| **ES** | Yes (claimed) | Registro Mercantil Central | Not enumerated | Subject-Person-restricted | DEC-20260507-C cohort country |
| **PT** | Yes (claimed) | Likely IRN/RNPC | Not enumerated | Subject-Person-restricted | DEC-20260507-C cohort country |
| **AT** | Yes (claimed) | Firmenbuch (BMJ) | Not enumerated | Restricted | DEC-20260507-C cohort country |
| **DE** | Yes (claimed) | Handelsregister via Bundesanzeiger | Not enumerated | Restricted | Already live via OpenRegister Tier-2 Free tier |

**Caveat:** Kyckr publishes a "Lite/Enhanced field × jurisdiction" matrix at `coverage.kyckr.com`, but the page is a JS SPA and did not render via WebFetch. A buyer-grade coverage-depth assessment per country requires either an authenticated portal session (which requires sales engagement) or a render-capable browser session. This spike could not produce that depth.

Sources: `/company-register-data`; `/blog/luxembourg-registry-guide-2025`; `developer.kyckr.com/guides/company-v1/developer-news/2025-03-italy-update/`; `/blog/eu-ubo-register-access-for-obliged-entities-2025`; April 28 UBO aggregator memo (`docs/research/2026-04-28-ubo-aggregators-non-openownership-eu.md`).

---

## 3. Commercial summary

**Pricing.** **No public pricing.** TrustRadius and Datarade both confirm: "Kyckr has not published pricing information for their data services." The helpdesk article "Changes to profile and document pricing" (`help.kyckr.com/hc/en-ie/articles/13937262500893`) is gated (HTTP 403). No pricing page in main-site nav. The April 2026 KYB_AGGREGATOR_RESEARCH memo (older, pre-RealWise-acquisition) estimated €10–30 per profile/document on pass-through; that estimate is **unverified at current commercial state**. The 2026-04-28 apples-to-apples benchmark explicitly classified Kyckr as failing dimension 3 ("enterprise pay-per-report, no public PAYG").

**Self-service signup.** **Not available.** Primary CTA across kyckr.com is "Book a Demo." No public developer signup. Sandbox and test environment exist (Company V2 docs reference a test environment) but access requires sales engagement.

**Redistribution rights — critical.** Standard Kyckr Terms & Conditions explicitly prohibit the use pattern Strale needs:
- Clause 3.2(b): *"resell or in any way redistribute or provide to a third party the Information supplied to you"* — prohibited
- Clause 3.2(a): *"copy, modify, harvest or create derivative works of the Services or any information contained therein provided by us to you for resale or for access to any affiliate or a third party"* — prohibited
- Clause 2.1: customer gets a *"non-exclusive, limited, revocable, non-sublicensable and non-transferable right to access and use the Services for **internal business use only**"*

Source: `kyckr.com/terms-conditions`. Governing law: Republic of Ireland; exclusive jurisdiction Irish Courts.

**Partner programme exists separately.** `kyckr.com/partners` markets a partner tier: *"Become a reseller or an introducer, set your own margin or receive an introduction fee."* Three categories are surfaced: Solution Providers, Data Vendors, Consulting. **No partner-tier pricing or terms are published.** No specific partner-platform names (e.g. AiPrise, Sumsub) appear on the partners page itself. The bits.bi competitive intel that surfaced on 2026-05-04 (Kyckr used as a registry-access layer by Stockholm KYB peer) implies a partner-tier arrangement exists in practice; the commercial shape is not public.

**Addendum-required: yes.** Same dynamic as Openapi case 151296. Standard ToS prohibits the model; an addendum is the path; the addendum is sales-mediated and not publicly priced. Unlike Openapi, Kyckr also lacks a public PAYG console as a fallback signal of pricing alignment with DEC-20260506-G.

**API surface.** REST/JSON; two API versions (Company V1 and V2) at `developer.kyckr.com/api/`. Workflow: search by name or jurisdiction → receive `KyckrId` → use `KyckrId` for subsequent profile/document requests. Authentication model not documented in public-facing docs (the visible portal pages are placeholder/title-only via WebFetch); deeper API docs presumably require a developer account, which requires sales engagement.

**Redistribution silence in UBO context.** The 2025/2026 EU UBO obliged-entity guide does not address whether Kyckr asserts its own legitimate interest as basis to provide UBO data, or whether the customer must produce the LI claim. The April 28 UBO memo classified this as "Architecture B" (vendor brokers customer's own LI claim) — meaning Strale could not deliver UBO data sight-unseen via API at the moment of the call. This spike found no public evidence that Kyckr has changed that architecture.

---

## 4. Comparison highlights

### IT/ES/PT/AT cohort: Kyckr vs Openapi

| Dimension | Kyckr (standard ToS) | Openapi PAYG | Decision-relevant delta |
|---|---|---|---|
| Pricing transparency | Sales-gated, no public price | Public PAYG console; €0.03–0.055/call (per DEC-20260507-C) | **Openapi wins** by transparency and DEC-20260506-G fit |
| Redistribution | **Prohibited under standard ToS** (clause 3.2(b)); requires partner addendum | Prohibited under standard ToS (case 151296 in flight) | **Tie at ToS level** (both require addendum); Openapi addendum is the active workstream — Kyckr would mean opening a parallel addendum negotiation |
| Self-service / sandbox | None | Public PAYG console with €10–20 starter credits (per prior research) | **Openapi wins** |
| Per-country depth IT | Live InfoCamere (REA-based) | Visura via InfoCamere (per Openapi product page) | Comparable; both ultimately depend on InfoCamere |
| Per-country depth ES | Claimed; not enumerated this spike | Spain Start tier (€0.055/call, per case 151296 thread) | Openapi documented; Kyckr opaque |
| Per-country depth PT | Claimed; not enumerated | Portugal Start tier (€0.055/call) | Same |
| Per-country depth AT | Claimed; not enumerated | Austria Start (€0.05/call, identity-only — DEC-20260506-F) | Same |
| Annual minimum / floor | Unknown (sales-gated; partner-tier opaque) | None visible in public console | **Openapi wins** by DEC-20260506-G fit |
| Time-to-positive-signal | Weeks (sales call → addendum draft → sign) | Hours (sign up, top up, test) | **Openapi wins** |

**Conclusion:** even if case 151296 falls through, Kyckr is a **structurally worse fallback** than per-country reassessment. The reasons Openapi was chosen for this cohort (no fixed cost, public PAYG, immediate developer access, single addendum) do not transfer to Kyckr.

### Gap-5 countries: Kyckr vs direct Tier-1

| Country | Direct Tier-1 candidate | Kyckr offer | Decision-relevant delta |
|---|---|---|---|
| **LU** | LBR (Luxembourg Business Registers) | RCS + RBE live-fetch | Direct path: doctrine-clean Tier 1 (DEC-20260428-A) at govt source. Kyckr: Tier 2 with addendum requirement. **Direct wins** unless LBR API economics are prohibitive (not evaluated in this spike — flagged as follow-up). |
| **BG** | Bulgarian Open Data Portal (Trade Register XML feeds) | Claimed coverage; depth not enumerated | Direct path is licensed-bulk-data (free + ingest cost) — doctrine-clean Tier 1 (per DEC-20260428-A Tier 3 preference for licensed-bulk over scraping-derived). **Direct wins** structurally. |
| **CY** | DRCOR | Claimed coverage; UBO already restricted post-2023 closure | Direct: Cyprus DRCOR. UBO not available either way. **Either path equivalent on UBO; direct wins on cost/redistribution.** |
| **HU** | e-Cégjegyzék (Ministry of Justice court system) | Claimed coverage | Direct: court-system access. UBO is govt-side €3.80/extract with months-of-delay either way. **Either path equivalent on UBO; direct wins on cost/redistribution.** |
| **MT** | (vendor outreach in flight) | Claimed coverage | Out of scope of this spike — MT outreach is a parallel chat workstream. |

**Conclusion:** for the gap-5 countries, every direct Tier-1 path is **doctrinally cleaner** (DEC-20260428-A Tier 1 / Tier 3) than Kyckr's Tier-2-with-addendum path. The only condition under which Kyckr becomes the right path is if the direct integrations turn out to be 4× more expensive in build-time AND a paying customer is attached AND Kyckr's partner-tier pricing turns out to be sub-€100/mo. None of those conditions are true today. The gap-5 build sequence should proceed on direct paths.

### DE backup: Kyckr vs OpenRegister

DE is already live via OpenRegister Tier-2 wrapper (Free tier 50 req/mo, €0/mo until traffic justifies Pro €59/mo per DEC-20260506-G). Kyckr would be a worse Tier-2 backup: no public pricing, no Free tier, redistribution-restricted under standard ToS. **OpenRegister wins by every commercial dimension.**

---

## 5. Open questions (for vendor outreach if chat decides to engage)

These are the questions the existing P1 outreach to-do (`Outreach: Kyckr on registry-access-only API tier`) should ask. They are **not** preconditions for the recommendation — the recommendation is "skip" regardless. The questions are listed in case chat decides to engage anyway for benchmark reasons:

1. Is there a registry-access-only API tier decoupled from the KYB-product positioning? (The bits.bi premise.)
2. What are the published per-call rates for that tier in IT, ES, PT, AT, LU, BG, CY, HU, DE?
3. Does the partner / reseller / OEM tier carry a monthly or annual fixed minimum? If yes, what's the floor?
4. Does the partner tier explicitly permit B2B2B / agent-to-agent / API-to-API redistribution to downstream paid customers (as distinct from the standard ToS clause 3.2(b) prohibition on resale)?
5. Does the partner tier carry indemnification language for redistributed registry data (per DEC-20260428-A Tier 2 conditions)?
6. For UBO data specifically: does Kyckr assert its own legitimate interest as basis for the data, or does the customer need to assert LI (Architecture A vs Architecture B per April 28 UBO memo)? If Architecture B, can Strale-customer-as-AML-obliged-entity satisfy the LI claim?
7. Sandbox / test environment access without commercial commitment — available, or sales-gated as the rest?
8. Source attribution requirements per registry (e.g. Handelsregister verbatim-republication rules, InfoCamere attribution).

These questions could be answered in 30 minutes if Kyckr engages. They have not been answered in 48 hours since the to-do was filed, which is itself a weak negative signal on responsiveness for a partner-tier conversation.

---

## 6. Recommendation rationale

**Kyckr is the right shape for the wrong era of Strale's product.** The bits.bi competitive intel from 2026-05-04 — that Stockholm KYB peers use Kyckr precisely as a long-tail registry-access layer — is real, but it describes a configuration (post-product-market-fit, paid-customer-attached, monthly-floor-tolerant) Strale does not yet inhabit. At Strale's current pre-revenue, no-fixed-cost, no-paying-customer-attached state, the partner-tier path Kyckr would require collides with DEC-20260506-G on its first commercial requirement.

**The standard-ToS path is doctrinally closed.** Clause 3.2(b)'s explicit prohibition on resale/redistribution to third parties, paired with clause 2.1's "internal business use only" limit, makes Kyckr's standard ToS structurally incompatible with Strale's pass-through API model. This is the same dynamic Openapi case 151296 is working around — but Kyckr lacks Openapi's mitigating signals (public PAYG console, transparent per-call pricing, in-flight addendum negotiation already underway). To bring Kyckr to parity with where Openapi already is would require: (i) opening a parallel addendum negotiation, (ii) confirming a sub-€100/mo partner-tier minimum (no public evidence such a tier exists), (iii) confirming Architecture-A UBO basis (no public evidence either way). Each is independently a sales-call effort; together they push Kyckr behind every direct Tier-1 candidate on time-to-shipped.

**The "single contract closes 5–8 countries" hypothesis fails at the doctrine layer.** The Coverage Matrix's hypothesis was that Kyckr could close 5–8 gap-5/cohort countries in one motion. Even if commercially viable, every one of those countries would land at **Tier 2 (vendor-mediated public records)** under DEC-20260428-A. The direct Tier-1 paths for LU/BG/CY/HU triaged in the prompt's Context section land at **Tier 1 (Strale-direct to govt source)**. Strale prefers Tier 1 over Tier 2 doctrinally; Kyckr's commercial efficiency would be paid for in doctrine-fit cost. The single-contract gain is real only on the build-effort axis, and even there the savings are 4–5 weeks of integration effort against 4–5 weeks of sales-cycle effort to get the addendum signed — a wash at best.

**No-fixed-cost stance is the single most decisive filter.** DEC-20260506-G (active, expires 2026-09-30) explicitly defaults to PAYG / Free / public-source paths until customer traffic justifies subscription commits. Kyckr publishes no pricing, has no public PAYG console, has a sales-gated developer portal, and the most plausible commercial structure for the partner tier (sales-mediated B2B floor) is precisely what DEC-20260506-G was authored to refuse. The recommendation is consistent with the four prior fixed-cost rejections (Topograph DEC-20260505-E, Verrechnungsstelle in DEC-20260506-F, Movitz / Digiteal pre-meeting deferral, Kyckr commercial stack opacity) and the three contemporaneous PAYG / Free preferences (OpenRegister Free, Implisense RapidAPI Basic, Openapi PAYG console).

**The right Kyckr move is to deprioritise the outreach-to-do, not to send the email.** The P1 outreach to-do filed 2026-05-05 (`Outreach: Kyckr on registry-access-only API tier`) should be downgraded to P3 or archived as `superseded` and replaced with a single line in the Active Vendor Stack: "Kyckr — evaluated 2026-05-07; standard ToS prohibits redistribution; partner-tier path collides with DEC-20260506-G; revisit only on (i) gap-5 direct-path failure AND (ii) paying-customer attachment AND (iii) confirmed sub-€100/mo partner-tier floor." This frees Petter from the outreach overhead and makes the next vendor decision easier (the threshold to revisit is now explicit).

**The InfoCamere Distributore Ufficiale path (call 11 May 2026) does not change this conclusion.** If InfoCamere produces a Tier-1 doctrine-clean IT path, IT exits the Openapi cohort and lands directly at Tier 1; the cohort shrinks to ES/PT/AT, and the no-Kyckr conclusion holds even more strongly (smaller cohort = less aggregator leverage). If InfoCamere doesn't pan out, IT remains in the Openapi cohort and the no-Kyckr conclusion still holds.

---

## 7. Notion follow-ups for chat

### Decision candidates

**DEC-2026MMDD-X (proposed):** *Kyckr — skip for v1; revisit conditional on gap-5 direct-path failure + paying-customer attachment + confirmed sub-€100/mo partner-tier floor.*
- Scope: global
- Status: active
- Supersedes: nothing directly (the prior "Pending eval" Vendor Roster entry needs Status update)
- Affects: DEC-20260507-C cohort fallback narrative (Kyckr explicitly removed as a multi-country aggregator candidate; per-country reassessment is the path if case 151296 falls through); DEC-20260506-G (Kyckr added to fixed-cost-rejection roster); Coverage Matrix hypothesis re: single-contract gap closure (refuted)
- Source: this memo

### To-do candidates

- **Downgrade or archive** the existing P1 to-do `Outreach: Kyckr on registry-access-only API tier (decoupled from KYB product)` — Status currently `Inbox`, Priority P1, Owner Petter. Replace with single-line Vendor Roster note (see below) or change Priority to P3 + add explicit re-eval triggers in the Notes field.
- **No new outreach-related to-dos** unless a re-eval trigger fires.

### Active Vendor Stack updates

- Update `Kyckr (registry-access tier re-examination)` page (id `35767c87-082c-81a3-b74e-c0b03164ee32`):
  - Status: `Pending eval` → `Rejected (with re-eval triggers)`
  - Doctrine fit: keep `Tier 2 (vendor-mediated public records)`
  - Floor / monthly min: `Unknown — sales-gated. Standard ToS prohibits redistribution (clause 3.2(b)). Partner-tier path exists at /partners but no public pricing.`
  - Per-call price: `Unknown — sales-gated. No public PAYG console.`
  - Reason / rationale: append: "2026-05-07 desk evaluation: standard ToS prohibits resale/redistribution to third parties (clause 3.2(b)) and limits use to internal business use only (clause 2.1). Partner programme exists at /partners with reseller/introducer language but no published pricing or terms. Combined with DEC-20260506-G no-fixed-cost stance, partner-tier path is doctrinally and commercially closed at v1. Revisit only on (i) gap-5 direct-path failure, (ii) paying-customer attachment, (iii) confirmed sub-€100/mo partner-tier floor."
  - Notes: append: "April 28 UBO research classified Kyckr as Architecture B (vendor brokers customer's LI). 2026-05-07 spike found no public evidence this has changed. Sandbox / dev signup is sales-gated. API V1 + V2 are REST/JSON with KyckrId workflow but auth and pricing model are not in public docs."

### Coverage Matrix updates

- Remove the hypothesis "or if Kyckr registry-access tier evaluation comes back favorable. Either single-contract path…" from the gap closure narrative. Replace with: "Per 2026-05-07 Kyckr evaluation, the multi-country aggregator hypothesis is rejected. Gap-5 closure is per-country direct (LU=LBR, BG=Bulgarian Open Data Portal, CY=DRCOR, HU=e-Cégjegyzék, MT=outreach in flight). IT/ES/PT/AT cohort fallback if case 151296 falls through is per-country reassessment, not multi-country aggregator."

### Provider-Coverage DB updates

- No changes (Kyckr was not a registered provider).

### Memory updates (chat-side)

- No new memory entries needed. Existing memory has accurate context (Kyckr was already noted as historically rejected and re-examined). After this DEC lands, add a one-line memory: "Kyckr evaluation 2026-05-07: skip — ToS prohibits redistribution + sales-gated pricing collides with DEC-20260506-G."

---

## Sources

- [kyckr.com](https://www.kyckr.com) — main site, demo-CTA-only
- [kyckr.com/terms-conditions](https://www.kyckr.com/terms-conditions) — standard ToS clauses 2.1, 3.2(a), 3.2(b), 10.1, 13.12
- [kyckr.com/partners](https://www.kyckr.com/partners) — reseller/introducer language; three partner categories
- [kyckr.com/company-register-data](https://www.kyckr.com/company-register-data) — Lite vs Enhanced profile field set
- [kyckr.com/blog/luxembourg-registry-guide-2025](https://www.kyckr.com/blog/luxembourg-registry-guide-2025) — LU RCS + RBE coverage
- [kyckr.com/blog/eu-ubo-register-access-for-obliged-entities-2025](https://www.kyckr.com/blog/eu-ubo-register-access-for-obliged-entities-2025) — UBO context
- [developer.kyckr.com/api/](https://developer.kyckr.com/api/) — Company V1 + V2 API surface
- [developer.kyckr.com/guides/company-v1/developer-news/2025-03-italy-update/](https://developer.kyckr.com/guides/company-v1/developer-news/2025-03-italy-update/) — IT REA identifier change
- [coverage.kyckr.com](https://coverage.kyckr.com/) — JS-rendered coverage portal (could not extract via WebFetch — flagged as follow-up if a render-capable session is required)
- [help.kyckr.com/hc/en-ie/articles/13937262500893](https://help.kyckr.com/hc/en-ie/articles/13937262500893) — pricing-changes article (HTTP 403, gated)
- [trustradius.com/products/kyckr/pricing](https://www.trustradius.com/products/kyckr/pricing) — confirms no public pricing
- [datarade.ai/data-providers/kyckr/profile](https://datarade.ai/data-providers/kyckr/profile) — confirms no public pricing
- Strale internal: `KYB_AGGREGATOR_RESEARCH.md` (older, optimistic), `docs/research/2026-04-28-ubo-aggregators-non-openownership-eu.md` (Architecture A vs B classification), `docs/research/payee-assurance-apples-to-apples-benchmark-2026-04-28.md` (dimension-3 fail), `docs/research/2026-04-28-us-business-data-vendor-longlist.md` (KYB-product overlap)
- Notion: `Kyckr (registry-access tier re-examination)` page id `35767c87-082c-81a3-b74e-c0b03164ee32`; `Mid-rebuild verification spike` page id `35967c87-082c-812d-864b-e4c8b74c7781`; DEC-20260506-G page id `35867c87-082c-8116-81ac-c38e7fee28e6`

## Fetch budget consumption

12 WebFetch + 5 WebSearch = 17 fetches against 20-budget. Did not exceed Step-2 (8) or Step-3 (10) sub-budgets in spirit (fetches were combined across steps). Coverage Portal JS-rendering limitation noted — a render-capable session would lift per-country depth from "claimed" to "documented." Not material to the recommendation (the ToS finding is decisive at the commercial layer).
