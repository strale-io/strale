# Malta Registry — Direct Build Path Design Memo

**Date:** 2026-05-06
**Country:** MT (Malta)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-04-30 gap-8 audit](2026-04-30-gap8-free-registry-apis.md) (probe-level baseline — partially superseded; see "Update to prior audit" below)

## Summary

The Malta Business Registry (MBR) **launched paid API packages in March 2026** — a meaningful change vs. the 2026-04-30 baseline, which classified MT as "no public API." However, the new APIs are **paid, agreement-gated, and target "Subject Persons"** (Maltese AML terminology for regulated entities, e.g. licensed financial institutions, accountants, lawyers, CSPs). Pricing is not published; sign-up is by emailing `ictsupport.mbr@mbr.mt`. No free/anonymous REST surface exists. No bulk dump on `data.gov.mt`. The free EU BRIS portal at `e-justice.europa.eu` returns HTML only.

**Recommendation:** **Defer Tier-1 build until MBR API pricing is disclosed and PAYG eligibility is confirmed.** If MBR confirms PAYG with no monthly minimum (per DEC-20260506-G), build via the Full Company Details API. If MBR insists on subscription-with-minimum or restricts access to Subject Persons only, route via Tier-2 vendor (Kyckr, Bisnode, Creditsafe Malta) with a clean redistribution agreement and primary-source provenance per fact (per DEC-20260428-A Tier 2).

**Effort if MBR API is reachable:** **S** (≤3 days). Effort if vendor-routed: dominated by vendor-onboarding lead time, not engineering — likely **M** end-to-end including paperwork.

**Top open questions:** (1) MBR API pricing model — flat monthly subscription, per-call PAYG, or hybrid; this is the fork point. (2) Whether non-Subject-Person commercial parties (i.e. an EU SaaS company like Strale) can sign up for the API at all, or whether the agreement framework is restricted to Maltese-AML-regulated subscribers.

## Registry identification

- **Authority:** Malta Business Registry (MBR), an autonomous body under the Maltese government, hosting the Registry of Companies (formerly within MFSA).
- **Public URL (data search):** `https://register.mbr.mt/app/query/search_for_company` — public portal, HTML.
- **Public URL (institution):** `https://mbr.mt/`
- **API documentation:** Not publicly published. Sign-up requires email to `ictsupport.mbr@mbr.mt`.
- **Legal basis:** Maltese Companies Act (Cap. 386) + Companies Act (Register of Beneficial Owners) Regulations 2018; data publication under EU Companies Directive (2017/1132) and Maltese transposition.

## Data access surface

### Path 1 — MBR paid API packages (PAID, agreement-gated, RECOMMENDED IF ELIGIBLE)

- **Status:** Launched March 2026. Four packages:
  - **Company Search API** — search by name or registration number; returns Company Name, Registration Number, Registration Date, State.
  - **Basic Company Details API** — returns Company Name, Registration Number, Registration Date, Registered Address, State (by ID & status).
  - **Full Company Details API** — Basic + involvements (officials), share capital, list of document filings.
  - **Bundle API** — all three packages in one application.
- **Authentication:** Per-customer agreement; presumed API-key or OAuth based on MBR's M2M-integration framing. Specifics not public.
- **Cost:** **Paid.** Pricing not published. Sign-up: email `ictsupport.mbr@mbr.mt`.
- **Eligibility:** Marketing language targets "Subject Persons" (AML/CFT terminology — regulated entities including credit institutions, financial institutions, CSPs, accountants, lawyers, etc.). Whether non-Subject-Person commercial parties can subscribe is **the central open question** (Open Question 2).
- **Rate limits:** Not documented publicly.
- **Format:** Not documented publicly; "system-to-system integrations" framing implies REST/JSON.
- **Probe attempts (2026-04-30):** `registry.mbr.mt/api/`, `api.mbr.mt`, `services.mbr.mt` all returned 403/504/000 to anonymous probes — the API is real but its hosts are firewalled to authenticated subscribers, not exposed to anonymous traffic. Consistent with "agreement-gated" model.

### Path 2 — EU BRIS portal (HTML only, NOT a build path)

- **URL:** `https://e-justice.europa.eu/` → BRIS search → Malta company.
- **Cost:** Free for the public-information fields (name, reg-no, address, incorporation date, share capital, officials).
- **Format:** **HTML only.** No documented API or BRIS-to-customer JSON feed.
- **Doctrine compliance:** Scraping HTML is forbidden under DEC-20260428-A. Excluded from build paths.

### Path 3 — Public ROC search (`register.mbr.mt`) (HTML, NOT COMPLIANT)

- **URL:** `https://register.mbr.mt/app/query/search_for_company`
- **Free fields visible:** Per the e-justice portal description, these match the BRIS-listed minimum: name, reg-no, address, incorporation date, share capital, officials.
- **Paid fields (per-extract):** Notifications, company status, annual accounts, annual returns, beneficial owners — accessible "for a minimal charge" via the online system, payable by card or at the MBR office.
- **Format:** HTML. Excluded from build paths under DEC-20260428-A.

### Path 4 — `data.gov.mt` bulk dump (DOES NOT EXIST)

- 2026-04-30 audit confirmed `data.gov.mt` returns 404 for `registrar`/`companies` queries. No bulk publication exists. Excluded.

### Path 5 — Tier-2 commercial vendor (PAID, agreement-gated, FALLBACK)

- **Candidates:** Kyckr (claims direct integration with MBR + 299 other registers); Bisnode/Dun & Bradstreet (Malta coverage); Creditsafe (Malta coverage); Equifax/Moody's BvD/Orbis.
- **Doctrine compliance:** DEC-20260428-A Tier 2 applies. A Tier-2 build path would require: (a) vendor's documented redistribution rights from MBR, (b) indemnification clause, (c) per-fact primary-source provenance from the vendor (i.e. the vendor must indicate which MBR field the data came from), (d) Strale must declare `acquisition_method: vendor_aggregation` in responses.
- **Cost:** Vendor-specific, typically annual subscription with per-record pull pricing. Per DEC-20260506-G, only PAYG with no monthly minimum is acceptable; most enterprise vendors fail this test.

## Coverage

- **Entity types covered (MBR):** Maltese registered companies (Ltd, plc, partnerships en commandite, partnerships en nom collectif, limited liability companies, foundations, branches of foreign companies). Trade-license individuals are NOT in MBR (Malta does not maintain a separate trade-licence register at this granularity — sole traders register with VAT, not MBR).
- **Fields available (MBR Full API):** Company Name, Registration Number, Registration Date, Registered Address, State (active/struck-off/dissolved/liquidated), involvements (directors, secretary, shareholders), share capital, list of document filings.
- **Fields available (MBR free public portal, per BRIS spec):** Name, reg-no, address, incorporation date, share capital, identity of company officials.
- **Fields available (MBR paid extract — current public portal):** Notifications, status, annual accounts, annual returns, beneficial owners (for "minimal charge" — actual fee not disclosed in audit-period sources).
- **Update cadence:** Real-time (registry-of-record).
- **Historical depth:** Companies registered from MBR's establishment forward; pre-MBR records held by predecessor (MFSA Companies Registry) and migrated.
- **Known data quality issues:** Bilingual (Maltese + English); company names often filed in English. Address fields use Maltese postal conventions.

## Licensing and ToS

- **MBR paid API:** Terms-of-use bundled into the customer agreement; not public. Strale would need to read the agreement at sign-up and verify (a) commercial reuse permitted in EU, (b) per-fact primary-source attribution permitted, (c) no clauses requiring real-time data deletion or per-customer disclosure that would break Strale's audit-trail model.
- **Public portal extracts (paid by card):** Terms appear in the MBR online-services T&Cs (not retrieved this session — Open Question 4).
- **CC license:** No CC license applies to Malta registry data — there is no open-data publication.
- **CJEU Nov 2022 UBO ruling impact:** UBO data IS in MBR scope (paid extract or Full API). MBR was one of the registers that restricted public UBO access post-CJEU; current access requires "legitimate interest" or Subject-Person status. This is consistent with the "agreement-gated" API access pattern.
- **GDPR posture:** Standard public-register basis applies for non-UBO fields. UBO access is gated through a legitimate-interest assessment per Maltese transposition of AMLD5.

## Tier-1 doctrine compliance

- **Compliant with DEC-20260428-A** (no Strale-operated scraping):
  - Path 1 (MBR paid API): **Yes** — official API.
  - Path 5 (Tier-2 vendor): **Yes if vendor has documented redistribution rights from MBR and provides primary-source provenance per fact** — explicit Tier 2 path under DEC-20260428-A.
  - Paths 2 and 3 (HTML scraping): **No** — excluded.

## Recommended build approach

**Phase 0 — Scoping (BEFORE any build):**
1. **Email `ictsupport.mbr@mbr.mt`** with Strale's specific request: a non-Maltese EU SaaS commercial party seeking access to the Full Company Details API for downstream KYB-style applications. Ask for:
   - Pricing model (flat / PAYG / hybrid).
   - Eligibility — must subscriber be a Maltese-AML Subject Person, or are non-Subject-Person commercial entities eligible?
   - Standard agreement document (T&Cs).
   - Sandbox / test environment URL and credentials.
   - Rate limit, response time SLA.
   - Redistribution and downstream-attribution clauses.

**Phase 1A — IF MBR confirms PAYG and non-Subject-Person eligibility:**
- Build `maltese-company-data` capability in the Tier-1 mould (one capability handler, one outbound HTTPS call per request, JSON parse, structured response).
- Effort: **S (≤3 days)**.
- Provenance: `acquisition_method: official_api`, `data_source: Malta Business Registry`, `primary_source_reference: register.mbr.mt API v1` (or whatever MBR's URL ends up being).

**Phase 1B — IF MBR does NOT confirm PAYG (i.e. requires monthly minimum):**
- **Defer Tier-1 build.** Per DEC-20260506-G, fixed-cost subscriptions are disqualifying at solo-founder stage with low call volumes.
- Route MT KYB queries through a Tier-2 vendor under DEC-20260428-A. Candidates ranked by likelihood of having clean redistribution rights from MBR + PAYG pricing: Kyckr (declares MBR direct integration, has PAYG tiers), Creditsafe, Bisnode. **Vendor diligence is the bottleneck**, not engineering.
- Effort: **M end-to-end** including vendor selection, contract review, redistribution-rights verification, and indemnification clause.

**Phase 1C — IF MBR restricts API to Subject Persons only AND no Tier-2 vendor passes redistribution diligence:**
- **Defer entirely.** Mark MT as "no compliant build path under current doctrine." Surface the gap in coverage docs. Wait for upstream change (MBR opening the API to non-Subject-Person commercial parties; or a vendor with verifiable rights launching).

**Pattern reference:** If Phase 1A: `apps/api/src/capabilities/` IE/LV/LT/EE direct-API handlers. If Phase 1B: similar shape but with vendor-base-URL and vendor-API-key plumbing (mirror of how `belgian-company-data` wraps CBEAPI today, before the queued FPS Economy migration completes).

**Refresh cadence:** N/A (real-time API in any path).

## Effort estimate

- **Phase 0 (scoping email):** ~30 minutes; lead time 1–4 weeks for MBR response.
- **Phase 1A (build MBR direct):** S (≤3 days) once eligibility confirmed.
- **Phase 1B (vendor-route):** M (3–10 days engineering + vendor onboarding lead time).
- **Phase 1C (defer):** zero engineering; documentation work to update Coverage Matrix Gap-8 row to reflect deferral with explicit trigger condition.

## Open questions

1. **MBR API pricing model.** PAYG, monthly subscription, or hybrid? Disclosed only after subscriber inquiry. **Resolution path:** Phase 0 email to `ictsupport.mbr@mbr.mt`.

2. **Subject-Person eligibility.** Marketing language emphasizes "Subject Persons." Is non-Subject-Person commercial subscription possible? Maltese AML legislation defines Subject Persons narrowly (Annex II of MLA-implementing regulations); a Swedish SaaS does not automatically qualify, even if its customers are EU-regulated entities. **Resolution path:** Phase 0 email; if rejected, escalate to a senior MBR contact via the Maltese Chamber of Commerce or via legal counsel.

3. **Redistribution clauses.** If Strale subscribes, what does MBR's standard agreement allow downstream? Per-fact primary-source attribution to MBR is mandatory; Strale's typical model also requires permission to surface the data inside Strale's audit-trail (via merkle-rooted ingest) for the customer's later compliance review. **Resolution path:** read the standard agreement once delivered in Phase 0; if blocking clauses exist, negotiate or fall back to Tier 2.

4. **Public-portal "minimal charge" extract pricing.** What's the actual per-extract fee for the public ROC extracts (notifications, status, annual accounts, UBO)? Not disclosed in audit-period sources. **Resolution path:** check `mbr.mt/registration-and-fee-structure/` page or email `orders.mbr@mbr.mt`. Affects nothing if Phase 1A succeeds (the API replaces per-extract purchases for our use case); becomes relevant only if the public-portal route is the only legal option (Phase 1C).

5. **Tier-2 vendor redistribution rights.** If Phase 1B is chosen, which vendor has documented rights from MBR vs. is implicitly aggregating MBR data without verifiable license? Kyckr advertises "direct integration" with MBR + 299 other registers — but advertising-claim is not the same as rights-evidence. **Resolution path:** vendor diligence — request the MBR-to-vendor sublicense or redistribution agreement during contract negotiation; refuse without documented rights.

## Recommendation

**Defer build pending Phase 0 disclosure.** Email MBR (`ictsupport.mbr@mbr.mt`) this week to resolve Open Questions 1 and 2 before committing engineering effort. Three plausible outcomes:

- **Best case:** MBR confirms PAYG + non-Subject-Person eligibility → 3-day Tier-1 build.
- **Middle case:** MBR confirms eligibility but only with monthly-minimum pricing → defer per DEC-20260506-G OR negotiate trial/PAYG OR vendor-route (Phase 1B).
- **Worst case:** MBR restricts to Subject Persons only AND no Tier-2 vendor passes diligence → MT marked as "no compliant build path under current doctrine" until conditions change.

The 2026-04-30 gap-8 conclusion ("vendor path is the only realistic option") is now slightly outdated: the MBR-direct path may be open, but only after Phase 0 confirms eligibility. The audit summary should be updated to reflect that MBR launched APIs in March 2026 even though their economics remain undisclosed.

## Update to prior audit

The 2026-04-30 audit listed MT as "no public API" with the parenthetical "MBR website lists a 'Rest' web service in marketing copy but [hosts] all return 403/504/000 to anonymous probes. The MBR REST is contracted (paid + agreement)." That conclusion was correct in form but pre-dated the March 2026 public launch announcement. The launch did not change the access posture (still paid, still agreement-gated, still firewalled to anonymous) — only the marketing visibility. The corrected status: **paid API exists and is generally reachable on agreement; no free or anonymous surface**.

## Sources

- [Malta Business Registry homepage](https://mbr.mt/) — Registry-of-record website.
- [Malta Business Registry launches API packages — The Business Picture](https://thebusinesspicture.com/2026/03/04/malta-business-registry-launches-application-programming-interface-packages/) — Confirms launch of Company Search, Basic Details, Full Details, Bundle API packages in March 2026; lists the field tuples returned by each package.
- [Malta Business Registry to offer APIs to subject persons — Malta Business Weekly](https://maltabusinessweekly.com/malta-business-registry-to-offer-apis-to-subject-persons/27705/) — Confirms sign-up email `ictsupport.mbr@mbr.mt`, "Subject Persons" framing.
- [Malta Business Registry Fees — mbr.mt](https://mbr.mt/2025/05/02/malta-business-registry-fees/) — Publication-notice fees only; does NOT disclose API pricing.
- [Online Filing Information — mbr.mt](https://mbr.mt/online-filing-information/) — References BAROS online system + ROC publications portal; no API pricing.
- [Workshop with the Malta Business Registry: Let's discuss APIs — whoswho.mt](https://whoswho.mt/en/workshop-with-the-malta-business-registry-let-s-discuss-apis) — Confirms MBR is actively engaging with API users; no pricing disclosed.
- [Malta Business Registry Search 2025 Update — Kyckr](https://www.kyckr.com/blog/malta-business-registry-search-2025) — Third-party confirmation of API launch + advertising of Kyckr Tier-2 alternative.
- [Business registers in EU countries / Malta — European e-Justice Portal](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/mt_en) — Confirms free fields (name, reg-no, address, incorporation date, share capital, officials) vs. paid fields (notifications, status, annual accounts, annual returns, UBO) on the public ROC portal.
- [BRIS portal — webgate.ec.europa.eu/e-justice/searchBris.do](https://webgate.ec.europa.eu/e-justice/searchBris.do) — EU-level interconnection portal; HTML only, no Malta-specific API.
- [2026-04-30 gap-8 free-registry-APIs audit](2026-04-30-gap8-free-registry-apis.md) — Predecessor audit; partially superseded by MBR's March 2026 API launch.

**Fetches consumed for MT: ~7** (within 30-fetch budget).
