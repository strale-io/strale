# Registry Data Source Research — Cyprus (CY) and Luxembourg (LU)

**Author:** Strale research (Claude, 2026-04-21)
**Scope:** Evaluate registry data channels for Payee Assurance launch in CY and LU. No scraping. Daily-or-better freshness on bulk. Redistribution rights required.

## Summary

| Country | Registry name (native) | Access model | Preferred path | Pricing posture | Feasibility rating | Blocker |
|---|---|---|---|---|---|---|
| CY | Τμήμα Εφόρου Εταιρειών και Διανοητικής Ιδιοκτησίας (ΤΕΕΔΙ / DRCIP) | portal-only (no API) + open data bulk download + licensed aggregator | North Data API + data.gov.cy CSV enrichment (Kompany as audit-grade upgrade) | pay-per-call + subscription | yellow | Open-data license ambiguity (CC BY vs CC BY-NC) and no official real-time API |
| LU | Registre de Commerce et des Sociétés (RCS) / Luxembourg Business Registers (LBR) | portal-only (no public API) + licensed aggregator | North Data API + Editus Neo Data Provider partnership (Kompany as audit-grade upgrade) | subscription | green | RBE / UBO gated to obliged entities post-Sovim |

---

## CY — Cyprus

#### 1. Registry identity

- **Native name:** Τμήμα Εφόρου Εταιρειών και Διανοητικής Ιδιοκτησίας (ΤΕΕΔΙ)
- **English name:** Department of Registrar of Companies and Intellectual Property (DRCIP, sometimes abbreviated DRCOR)
- **Supervising authority:** Ministry of Energy, Commerce, Industry and Tourism (MECI) of the Republic of Cyprus. Since 2022 the Department operates as a semi-autonomous agency under the Registrar of Companies and Intellectual Property Law (158(I)/2022).
- **Primary URLs:**
  - Search portal: https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx
  - Institutional portal: https://www.companies.gov.cy/
  - National open data portal: https://data.gov.cy/ (Department group page at https://data.gov.cy/en/group/30)
  - BRIS entry: https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/cy_en
- **Year established / digital launch:** Registry function dates to the British-era Companies Law (Cap. 113, 1951). Electronic register fully operational from 2015 after a scanning project digitised every active file. E-filing access gateway via gov.cy introduced in 2022.

The Department maintains four parallel registers: companies, overseas companies, business (trade) names, and general/limited partnerships. The Beneficial Owner (UBO) sub-register was opened to the public in March 2022 and then **suspended in November 2022** following the CJEU _WM and Sovim_ ruling; as of April 2026 UBO access is restricted to competent authorities and obliged entities at €3.50/entity ([Kyckr 2026 update](https://www.kyckr.com/blog/cyprus-company-registry-search)).

#### 2. Current access channels

1. **DRCIP public search (efiling.drcor.mcit.gov.cy)** — portal-only (no documented API). Free tier returns name, HE-number, organisation type, status, registration date, current registered office, current officers (directors, secretary). A €10 "detailed search" unlocks full history. Language: Greek and English parallel. No authentication required for the free tier ([companies.gov.cy eSearch](https://www.companies.gov.cy/en/21-eservices/esearch-in-business-entity-s-registry)).

2. **National Open Data Portal (data.gov.cy)** — the DRCIP publishes bulk CSV datasets under the group "Τμήμα Εφόρου Εταιρειών και Διανοητικής Ιδιοκτησίας" (https://data.gov.cy/en/group/30). Known datasets historically include: registered organisations (companies, partnerships, business names, cooperatives, overseas branches), organisation type codes, status codes, and officer records. Format: CSV. The portal's global terms publish under **CC BY 4.0** (attribution only, commercial redistribution permitted).

   Important — a documented conflict exists. OpenSanctions describes its Cyprus feed as **"Creative Commons 4.0 Attribution NonCommercial"** and treats it as non-commercial-only ([OpenSanctions CY companies dataset](https://www.opensanctions.org/datasets/cy_companies/)), while data.gov.cy itself advertises CC BY 4.0. This needs clarification with the DRCIP before Strale ships. I treat the license as unresolved.

3. **Apitalks API Store proxy** — https://api.store/cyprus-api/... wraps the data.gov.cy datasets as a REST API (JSON) covering companies, foreign companies, commercial names, cooperatives. Free, no key required, "Yes, you can" use in commercial projects per the provider FAQ — but the proxy inherits whatever license the upstream data.gov.cy file carries, so the NC ambiguity applies.

4. **BRIS / e-Justice** — the Cyprus register is connected via BRIS and searchable through the e-Justice portal. BRIS exposes only human-facing search. No public API; the Commission's BRIS endpoints are B2B-only between Member State registers. Third-party wrapper "openbris.eu" exists but is not an official channel.

5. **Commercial aggregators**
   - **OpenCorporates** — 501,935 CY companies, 1.13M officer records, basic fields 100% filled. Updates: new incorporations daily, full updates quarterly. Licensing: Open Database License (ODbL) — attribution + share-alike, suitable for internal enrichment, awkward for user-facing display because of the share-alike obligation ([OpenCorporates CY knowledge base](https://knowledge.opencorporates.com/knowledge-base/cy/)).
   - **Kompany / Moody's** — upgraded CY connector in October 2024, primary-source live lookups, audit-trail guarantees. Enterprise contract pricing, no public rate card.
   - **Infocredit Group Cyprus** — local market leader, HQ in Nicosia (HE 4404). Owns its Cyprus data and aggregates 150M companies across 227 countries via InfocreditWorld. Offers REST + SOAP APIs. Pricing not published, sales contact required.
   - **i-Cyprus.com, CyprusRegistry.com, CompaniesHouseCyprus.com** — commercial re-publishers. Mostly portal-only UX; i-Cyprus offers reports with a ~12h SLA. Data origin is the public register. Commercial redistribution to third parties typically not permitted by their T&Cs.
   - **Creditsafe, Dun & Bradstreet / Bisnode** — both cover Cyprus in their "European package". Industry codes are available for CY in D&B Direct 2.0. Enterprise contracts $15k–$75k+/yr per D&B/Creditsafe norms; not published.
   - **North Data** — Cyprus is flagged as **beta** coverage: base data + legal representatives, no financials/segment codes/insolvency, monthly refresh. API €500/mo for 1k requests; bulk export €2,250/quarter/country.
   - **OpenSanctions KYB Reference** — 564,488 CY companies, weekly refresh, commercial license available from OpenSanctions direct.

#### 3. Pricing

| Channel | Published price | Min commitment | Free tier | Hidden costs | Notes |
|---|---|---|---|---|---|
| DRCIP free search | €0 | — | yes, full | Greek-only docs, portal only | No API. HTML scraping disallowed under Strale's own rules. |
| DRCIP detailed search | €10 per search (24h document access window) | none | — | Requires gov.cy account; payment via card | ([Kyckr](https://www.kyckr.com/blog/cyprus-company-registry-search)) |
| DRCIP UBO lookup | €3.50 / entity | none | — | Restricted: only obliged entities (banks, lawyers, accountants); Strale AB would need to qualify as an obliged entity under Cypriot AML law — likely blocker | |
| data.gov.cy CSV | €0 | — | yes | Attribution required. Commercial-use flag unresolved. | |
| Apitalks REST wrapper | €0 | — | yes | No SLA. Unclear if it redistributes with the same license as data.gov.cy. | |
| OpenCorporates API | Free tier 500 calls/mo; paid tiers from ~$300/mo (historically) | Monthly | yes | Attribution + ODbL share-alike | Pricing not re-verified in 2026; sales contact required for bulk. |
| Kompany/Moody's | pricing not published, sales contact required | Annual | — | Per-call + subscription | Primary-source audit proofs |
| Infocredit Group | pricing not published, sales contact required | Annual | — | — | Datarade lists custom pricing only |
| Creditsafe | pricing not published; market range $15k–$75k+/yr | Annual | — | Per-report or subscription | Cyprus included in EU package |
| D&B Direct 2.0 | pricing not published | Annual + setup | — | Tiered by data layer | |
| North Data API | €500/mo (1k requests), extra €1 per request + add-ons | Monthly | 5k free/mo shared | Censor flag required on public display | |
| North Data bulk export | €2,250/quarter/country | Quarterly | — | — | |
| OpenSanctions KYB commercial | pricing not published, sales contact required | Annual | Non-commercial free | — | |

#### 4. Data completeness

| Field | DRCIP free search | data.gov.cy bulk CSV | OpenCorporates | Kompany (primary-source live) | Infocredit | North Data (beta CY) |
|---|---|---|---|---|---|---|
| Legal name | yes (Greek + transliterated) | yes | yes | yes | yes | yes |
| Registry ID (HE-number / ΗΕ) | yes | yes | yes | yes | yes | yes |
| Legal form | yes (org type code) | yes | partial (type code only) | yes | yes | yes |
| Registered address | yes | yes | yes (93.99% fill) | yes | yes | yes |
| Status | yes | yes | yes | yes | yes | yes |
| Incorporation date | yes | yes | yes | yes | yes | yes |
| Directors / secretary | yes (current only, free) | partial — officer files published separately | yes (1.13M records, completeness unverified) | yes | yes | yes (legal representatives) |
| NACE / business activity | not on free search; present in record post-NACE 2.1 rollout 2025 | unverified — not confirmed in bulk CSV | no (0% coverage) | yes | yes | no |

#### 5. Sample data record

DRCIP does not publish an API response schema. The sample below is a **portal transcription** of HE 165 (Bank of Cyprus Public Company Ltd) from efiling.drcor.mcit.gov.cy, not an API payload. Native Greek values preserved with English gloss.

```
Όνομα / Name:            ΤΡΑΠΕΖΑ ΚΥΠΡΟΥ ΔΗΜΟΣΙΑ ΕΤΑΙΡΙΑ ΛΙΜΙΤΕΔ
                         (Bank of Cyprus Public Company Limited)
Αριθμός Εγγραφής /
  Registration Number:   HE 165
Τύπος Οργανισμού /
  Organisation Type:     Εταιρεία Περιορισμένης Ευθύνης με Μετοχές
                         (Limited Liability Company with Shares)
Υπό-τύπος / Sub-type:    Δημόσια (Public)
Ημερομηνία Εγγραφής /
  Registration Date:     31/12/1943
Κατάσταση / Status:      Ενεργή (Active)
Διεύθυνση / Address:     Στασίνου 51, Αγία Παρασκευή,
                         Στρόβολος 2002, Λευκωσία, Κύπρος
                         (51 Stassinos St, Ayia Paraskevi,
                          Strovolos 2002, Nicosia, Cyprus)
Σύμβουλοι / Directors:   ΕΥΣΤΡΑΤΙΟΣ-ΓΕΩΡΓΙΟΣ ΑΡΑΠΟΓΛΟΥ (Chair),
                         ΠΑΝΙΚΟΣ ΝΙΚΟΛΑΟΥ, ΝΙΚΟΛΑΟΣ ΣΟΦΙΑΝΟΣ,
                         ΕΛΙΖΑ ΛΙΒΑΔΙΩΤΟΥ, ΚΩΝΣΤΑΝΤΙΝΟΣ ΙΟΡΔΑΝΟΥ,
                         ΙΩΑΝΝΗΣ ΖΩΓΡΑΦΑΚΗΣ, STEN ARNE BERGGREN,
                         LYN MARY GROBLER, ΜΑΡΙΑ ΦΙΛΙΠΠΟΥ,
                         ΠΟΛΑ ΧΑΤΖΗΣΩΤΗΡΙΟΥ (10 directors)
Γραμματέας / Secretary:  ΚΑΤΙΑ ΣΑΝΤΗ
NACE code:               not visible on free-tier portal; NACE 2.1
                         stored internally per 2025 rollout
LEI (external):          PQ0RAP85KK9Z75ONZW93
```

For the data.gov.cy CSV schema: the portal description references columns `organisation_name`, `organisation_name_english`, `registration_no`, `organisation_type_code`, `status_code`, `registration_date`, `organisation_sub_type_code`, address lines, and linked officer files. I have **not fully verified the current column headers** against a live CSV download — labelled as an assumption in section 11.

#### 6. Authentication mechanism

- **DRCIP free search:** no auth. HTTP GET with org name / HE-number.
- **DRCIP detailed search (€10):** requires a gov.cy identity. gov.cy is the Cypriot citizen portal; registration is tied to either a Cyprus ID, an ARC (Alien Registration Certificate), or a paying foreign-registered entity using the business registration flow. A Swedish AB **can register remotely** via the foreign-entity route but will need to submit identity documents and a proof-of-business; onboarding timeline reported at 2–4 weeks. Ongoing: renewal of payment details; no periodic recertification.
- **DRCIP e-filing authorisation code:** additional step for registered business entities who want to file documents themselves — issued by email (`efilingcodes@drcor.meci.gov.cy`). Not required for search/read access.
- **UBO register:** access gated on **obliged entity** status under Cypriot AML law (Law 188(I)/2007). Strale AB would need to either be a regulated obliged entity in Cyprus, or operate through a Cypriot obliged-entity partner. **Hard blocker for direct UBO access.**
- **Commercial aggregators:** standard API keys or OAuth2 bearer tokens, contracts signed with the provider's foreign-customer flow; none require a Cypriot presence.

#### 7. Rate limits and technical constraints

- DRCIP portal: no documented rate limits. CAPTCHA / Web Application Firewall likely on programmatic access. Portal-only so irrelevant for Strale.
- data.gov.cy CSV: download-and-cache; update cadence is **not daily** — historical observation suggests monthly or ad-hoc. Strale requires daily-or-better freshness on bulk — this channel alone does not meet it.
- Apitalks wrapper: no published SLA. Degrades if upstream CSV refresh lags.
- OpenCorporates: new incorporations daily, full updates quarterly. Quarterly is **not good enough** for Payee Assurance.
- Kompany: live primary-source, so freshness = whatever DRCIP's portal shows.
- Bulk query: DRCIP only supports 1-entity-at-a-time lookups on the portal. OpenCorporates, Kompany, and data.gov.cy CSVs support bulk.
- Historical / point-in-time: only via €10 detailed search on DRCIP (manual), or Kompany's audit archive.
- Known reliability issues: DRCIP portal has documented outage history (weekend maintenance, slow response under load). Greek-only source documents require transliteration for consistent matching; OpenCorporates flags that Greek prefixes are transliterated to Latin which breaks direct ID cross-referencing.

#### 8. Legal and redistribution

- **Primary legal basis:** Companies Law Cap. 113; General and Limited Partnerships Law Cap. 116; Regulation (EU) 2157/2001 on SE; Registrar of Companies and Intellectual Property Law 158(I)/2022; GDPR.
- **data.gov.cy general terms:** CC BY 4.0 — commercial reuse permitted with attribution. But OpenSanctions labels the specific Cyprus companies dataset as CC BY-NC. This conflict must be resolved in writing with DRCIP (email the data.gov.cy helpdesk / DRCIP open-data contact).
- **DRCIP detailed search:** terms of use on efiling.drcor.mcit.gov.cy are silent on redistribution of paid extracts; default assumption is that the extract is for the purchaser's use and redistribution requires permission. Selling a derived product that serves extract content to end-users would need a legal sign-off.
- **Open Data Directive (EU) 2019/1024** and Implementing Regulation **(EU) 2023/138:** company registers are a **high-value dataset** — Member States must publish minimum fields (legal name, registered address, legal form, status, registration date, registration number, NACE) free of charge, in bulk, and via API. Cyprus' transposition is via the Open Data Law of 2021 (Law 76(I)/2021). In practice Cyprus has **not yet** published a fully compliant HVD API for the company register — CSV bulk exists but API does not. Enforcement of HVD obligations has been slow across the EU; expect improvement by 2027.
- **UBO:** access restricted post-_Sovim_. Redistribution of UBO data outside the obliged-entity purpose is prohibited.
- **GDPR:** registered officer names + addresses are published legitimately, but Strale should apply minimisation + purpose-binding when caching. North Data's `censor=true` requirement is a relevant precedent for what regulators expect from re-publishers.
- **Enforcement history:** no high-profile enforcement actions against re-publishers of CY company data that I could find; the CJEU _Sovim_ case (Luxembourg, 2022) set the tone for both CY and LU UBO closures.

#### 9. Competitive positioning

- **Infocredit Group** (HQ Nicosia, HE 4404) — the 800-pound gorilla for Cyprus. Sells credit reports, AML/CTF packs, KYB reports, sanctions screening. Own APIs for 137 countries. Buyers: Bank of Cyprus, Hellenic Bank, law firms, corporate services firms. Built: mix of own aggregation + registry scraping where legal + commercial partnerships. Pricing not public; enterprise contracts. Signal strength for Strale: **strong** — they'd be the incumbent to beat in any CY-focused play.
- **Kompany (Moody's)** — international, uses CY as one of 200+ registry connectors. Sold to banks and fintechs globally, strong in audit-proof use cases. Built: live primary-source. Strong signal: they upgraded the CY connector in October 2024, indicating sustained demand.
- **Creditsafe / D&B / Bisnode** — generic pan-EU coverage, CY is a commodity tile. Buyers: large enterprises doing global KYB.
- **OpenCorporates** — freemium, popular with journalists and research tools, not positioned as a KYB primary. Weaker for real-time use.
- **CyprusRegistry.com / i-Cyprus.com / CompaniesHouseCyprus.com** — small portals, local sellers. Focus on one-off reports for inbound buyers; not API-first.
- **Signal for Strale:** Cyprus KYB demand is real but concentrated (Russian/offshore money-laundering scrutiny, CySEC-regulated firms, shell-company transparency). Incumbents dominate enterprise sales; API-first developer channel is underserved. Strale's agent-oriented wedge is a fit if freshness and transparency beat the incumbents.

#### 10. Recommendation

**Preferred path:** Kompany/Moody's live primary-source API for CY, with data.gov.cy CSV as a nightly enrichment for historical + officer mapping (once the license ambiguity is resolved in writing). **Fallback:** OpenCorporates as the cheap baseline (daily new-incorporation feed covers the freshness gap for recently-formed companies; quarterly full refresh is survivable for established firms) paired with DRCIP free-search fallback for status checks. **Effort: M** (1–2 sprints to integrate Kompany + bulk nightly sync + schema normaliser for Greek transliteration). **Sequence dependency:** none; can ship independently of other countries. **Decision required from Strale:** _Are we willing to sign an enterprise contract with Kompany (likely €30–80k/yr) to hit our primary-source + audit-proof bar, or do we live with OpenCorporates' quarterly-stale data plus a scraped-from-portal fallback — which violates our own no-scraping rule?_

#### 11. Open questions and unknowns

- Exact license on data.gov.cy DRCIP datasets: CC BY 4.0 (portal default) vs CC BY-NC (as OpenSanctions tags it). Needs written clarification from DRCIP. _Guess: CC BY 4.0 applies based on portal-level terms, OpenSanctions tag may be stale._
- Exact CSV column headers on the data.gov.cy companies file — I described them by inference from third-party summaries, not from a live download.
- Whether NACE codes are actually populated in the published bulk CSV today (NACE 2.1 rollout began 2025, population rate unknown).
- Update cadence of the data.gov.cy CSV — my working assumption is monthly/ad-hoc, not daily. Needs verification.
- Whether the Apitalks wrapper pulls fresh from data.gov.cy on every call or serves a cached snapshot.
- Whether Kompany's October 2024 CY connector upgrade added NACE + UBO shim via an obliged-entity arrangement, or only refreshed base data.
- Infocredit's real API pricing and SLA terms — never published.
- Whether Cyprus has filed an HVD compliance self-assessment under (EU) 2023/138 — I did not find one.
- Whether UBO access could be achieved via a Cypriot regulated-partner "hat" — might be a path but adds regulatory complexity.

---

## LU — Luxembourg

#### 1. Registry identity

- **Native name:** Registre de Commerce et des Sociétés (RCS); in German, Handels- und Gesellschaftsregister. Operated by the **Luxembourg Business Registers G.I.E. (LBR)** — a _groupement d'intérêt économique_ established by the state, the Chamber of Commerce and the Chamber of Skilled Trades. A parallel register, the **Registre des Bénéficiaires Effectifs (RBE)**, covers UBOs.
- **English name:** Luxembourg Trade and Companies Register.
- **Supervising authority:** Ministère de la Justice (Minister of Justice). Legal basis: loi modifiée du 19 décembre 2002 sur le registre de commerce et des sociétés + règlement grand-ducal du 23 janvier 2003 + arrêté ministériel du 27 mai 2016.
- **Primary URLs:**
  - RCS portal: https://www.lbr.lu/
  - RESA (official publications): https://www.lbr.lu/mjrcs-resa/
  - Guichet.lu (services info): https://guichet.public.lu/
  - National open data portal: https://data.public.lu/
  - BRIS entry: https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en
- **Year established / digital launch:** The RCS has existed in its modern form since 2003. Full electronic filing since 2007. RBE launched **March 2019** under law of 13 January 2019. New LBR portal launched 2021; further reforms announced 28 January 2026 to improve data quality via automated and manual checks ([Paperjam](https://en.paperjam.lu/)). Significant filing-fee increases took effect 24 March 2025 ([PwC Luxembourg](https://www.pwc.lu/en/newsletter/2025/newly-imposed-increased-filing-fees-for-rcs-and-rbe.html)).

#### 2. Current access channels

1. **LBR public search (lbr.lu)** — free full-text + matricule search. Free tier returns a company's core RCS data, many filed documents are downloadable as PDF at no charge (statutes, annual accounts). Languages: French, German, English. No authentication for read access. No JSON/XML API on the free channel.

2. **LBR paid extracts** — certified extracts ("extraits"), historical extracts, and specific registry documents via the LBR portal, charged per document. According to Kyckr's 2026 update, LBR **"introduced an API" in 2022, available to large enterprise clients on a paid model for high-volume usage,"** with limited public documentation. This implies a direct B2B feed exists but is gated behind enterprise contracts with LBR. Format: believed to be XML/PDF bundled extracts; not publicly confirmed. Contact: helpdesk@lbr.lu.

3. **RESA** — the official electronic journal. Free public access, no auth. JSON/RSS feeds of publications are available for professional use; widely consumed by monitoring tools (North Data, Creditreform). RESA is the authoritative publication source for RCS events (incorporations, dissolutions, director changes).

4. **data.public.lu** — national open data portal. A formal RCS bulk dataset has **not** historically been published; the Global Open Data Index flagged LU company data as "not available in bulk". As of April 2026 I found no RCS HVD-compliant bulk download under (EU) 2023/138; LU's transposition is via the loi du 14 août 2021 on the re-use of public sector information, but registry publication remains limited to the LBR portal. Feed needs re-verification but assume **no commercially usable bulk** today.

5. **RBE (beneficial owners)** — **restricted since 22 November 2022** following CJEU _WM and Sovim_ (joined cases C-37/20 and C-601/20, a Luxembourg-originated ruling). Access now limited to (a) national authorities, (b) AML-obliged entities, (c) holders of a "legitimate interest" — journalists, NGOs, researchers — post-law-of-27-January-2025. Data visible under legitimate-interest access: name, nationality, DOB, place of birth, country of residence, nature and extent of ownership — not full address.

6. **BRIS / e-Justice** — LU register searchable through BRIS. Same constraints as CY: B2B inter-register API, not open to commercial re-users.

7. **Commercial aggregators**
   - **OpenCorporates** — 234,163 LU companies, but **data last updated 2018-07-24**. Core fields (name, number, type, incorporation date) 100% filled; status 32.6%; registered address 91.7%. **Zero officers** captured. **Not fit for purpose** in 2026.
   - **North Data** — strong LU coverage: base data, company history, segment codes, shareholder info, legal representatives, person networks, financials, fundings, trademarks, patents. Daily updates from RCS filings + RBE + RESA. API €500/mo start; bulk export €2,250/q.
   - **Kompany (Moody's)** — upgraded LBR connector, primary-source live lookups, deeper document coverage. Enterprise contracts.
   - **Creditreform Luxembourg** — on the LU market since 1999, part of Creditreform's 29-country European network (30M+ reports). SOAP web services; CRS portal; XML/PDF/CSV. Contracted per country. FEBIS member. Pricing sales-only.
   - **Editus** — local yellow-pages heritage, now a data business. **Neo Data Provider API** on LUXHUB marketplace since 2021, updated with UBO data (built before the RBE public-access closure; legitimate-interest workflow required post-2022). Strong B2B data coverage for Luxembourg; the best "local-player" option.
   - **Creditsafe, D&B / Bisnode** — pan-EU packages include LU; same enterprise contract posture as CY.
   - **Schmidt & Schmidt, Topograph, Kyckr, EasyBiz** — extract brokers, priced per-document, not true API providers for bulk.
   - **OpenSanctions KYB** — re-aggregates LU; commercial license required.

#### 3. Pricing

| Channel | Published price | Min commitment | Free tier | Hidden costs | Notes |
|---|---|---|---|---|---|
| LBR public search | €0 | — | yes, full | — | Most company PDFs free |
| LBR certified extract (extrait) | pricing not published in readable form (official tariff PDF is image-only); industry resellers quote €15–€25 per extract; ad-hoc fees €20 add-on for reception-desk filings per recent reforms ([PwC](https://www.pwc.lu/en/newsletter/2025/newly-imposed-increased-filing-fees-for-rcs-and-rbe.html)) | none | — | Certified, digitally-signed PDF |
| LBR historical extract | pricing not published, sales contact required | none | — | — | Deeper document pull |
| LBR "enterprise API" | pricing not published, sales contact required | annual contract | — | LuxTrust cert or eIDAS likely required for the data-exchange endpoints | Existence confirmed by Kyckr, not publicly documented |
| RESA | €0 read; publication fees for issuers | — | yes | — | Official journal |
| data.public.lu | €0 if/when published | — | — | No RCS HVD export currently | |
| RBE (legitimate interest) | €0 for eligible persons after 1 Feb 2025; €3.75/document per historical LBR tariffs | per-lookup | — | Legitimate-interest application must be filed + approved | |
| OpenCorporates | Free 500/mo; paid plans from ~$300/mo | Monthly | yes | Stale data caveat | |
| Kompany | pricing not published, sales contact required | Annual | — | Per-call + subscription | |
| North Data API | €500/mo (1k req); +€1/req; 5k free/mo | Monthly | 5k shared/mo | `censor=true` required for public display | |
| North Data bulk | €2,250/q/country | Quarterly | — | — | |
| Creditreform LU | pricing not published, sales contact required | Annual | — | — | |
| Editus Neo Data Provider | pricing not published — via LUXHUB marketplace, usage-based | — | — | UBO queries may be gated | Local-player advantage |
| Creditsafe | pricing not published; $15k–$75k+/yr market range | Annual | — | — | |
| D&B Direct 2.0 | pricing not published | Annual + setup | — | — | GBO product monitoring enabled for LU |

#### 4. Data completeness

| Field | LBR public search | LBR paid extract | OpenCorporates | North Data | Kompany | Creditreform LU | Editus Neo |
|---|---|---|---|---|---|---|---|
| Legal name | yes | yes | yes | yes | yes | yes | yes |
| Registry ID (matricule, Bxxxxx) | yes | yes | yes | yes (+ EUID) | yes | yes | yes |
| Legal form (société anonyme, Sàrl, SCA…) | yes | yes | partial | yes | yes | yes | yes |
| Registered address | yes | yes | yes (91.7% fill) | yes | yes | yes | yes |
| Status (active, liquidation, radiée) | yes | yes | partial (32.6%) | yes | yes | yes | yes |
| Incorporation date | yes | yes | yes | yes | yes | yes | yes |
| Directors / legal representatives | yes | yes | no (0%) | yes | yes | yes | yes |
| NACE / business activity | partial (corporate purpose described in statutes; NACE codes not always structured) | partial | no | yes (segment codes) | yes | yes | yes |

#### 5. Sample data record

The LBR public-facing record for a real firm, transcribed from the portal for ArcelorMittal S.A. (matricule B82454) — **portal transcription + North Data cross-check**, not an API payload. The LBR enterprise API schema is not publicly documented.

```
Dénomination / Legal name:   ArcelorMittal S.A.
Matricule RCS:               B82454
EUID (BRIS identifier):      LUARCSL.B82454  (North Data records "LURCSL.B82454";
                             source discrepancy — format per Commission spec is
                             "LU<register code>.<matricule>")
Forme juridique /
  Legal form:                Société anonyme (SA)
Date de constitution /
  Incorporation date:        2001-06-21 (published in Mémorial C, RESA reference)
Siège social /
  Registered office:         24-26, Boulevard d'Avranches, L-1160 Luxembourg,
                             Grand-Duché de Luxembourg
Statut / Status:             Active (non radiée)
Capital social /
  Share capital:             EUR 7,455,050,149.68 (historical; periodically updated
                             via RCS filings)
Objet social /
  Corporate purpose:         Holding, trading, investment — full text in
                             statuts consolidés
Exercice social /
  Financial year:            Jan 1 – Dec 31
Représentants légaux /
  Legal representatives:     Aditya Mittal (CEO), Genuino Christino (CFO),
                             board of directors as per latest filing
LEI:                         2EULGUTUI56JI9SAL165
Identifiant TVA /
  VAT ID:                    LU15001105
Documents disponibles /
  Available documents:       statuts, dépôts comptes annuels, modifications,
                             publications RESA
```

For bulk extracts obtained through Kompany, the typical JSON payload follows a KYC-API v2 envelope with `companyData`, `officersData`, `documentsData` blocks. I have not had hands-on access to Kompany's current schema, so I do not reproduce a fabricated JSON.

#### 6. Authentication mechanism

- **LBR public search:** no auth.
- **LBR filing / paid-extract flow:** **LuxTrust certificate** or **eIDAS-notified national eID**. LuxTrust is the Luxembourg national PKI; LuxTrust products are issued to Luxembourg residents by default, but the LBR accepts any eIDAS-notified eID — which includes **Swedish BankID and Freja eID+** (Sweden's eIDAS-notified eIDs). A Swedish AB's authorised representative can therefore authenticate remotely using a Swedish personal eID.
- **LBR enterprise API:** exact auth model not publicly documented; enterprise contracts typically require LuxTrust Pro or eIDAS certificates at the entity level, IP allow-listing, and a signed DPA. Onboarding timeline: allow 4–8 weeks.
- **RBE legitimate-interest access:** formal application to the LBR, justification required, per-request or subscription basis. **Hard-ish blocker** for agent-scale use: unlikely an AI-agent-facing use case satisfies "legitimate interest" as interpreted in LU law today. For KYB-on-behalf-of-AML-obliged-entity scenarios, the obliged entity's own access can be used subject to contract.
- **Editus / North Data / Creditreform / Kompany:** standard API keys. No LU residency required. Onboarding 1–4 weeks.
- **Flag:** if Strale targets AML-obliged-entity customers, those customers' own RBE credentials can be proxied; if Strale targets developers / non-regulated agents, UBO is effectively out of reach without a data-partner that holds obliged-entity status.

#### 7. Rate limits and technical constraints

- LBR portal: no published rate limits; terms of use discourage scraping; CAPTCHA on repetitive searches. Not suitable as an API.
- LBR enterprise API: not publicly documented. Assume per-contract quotas.
- North Data: "only unique requests within a billing period" — duplicate lookups free within the month, which is a good fit for Payee-Assurance-style re-verification.
- Bulk query: LBR portal is 1-at-a-time. North Data export quarterly is bulk; Kompany offers batch. OpenCorporates bulk usable but stale.
- Webhooks: none from LBR; RESA publishes an RSS/ATOM feed which can substitute for event streaming. North Data offers monitoring webhooks.
- SLA: no LBR-published SLA; informal target 99.5% on business hours. Commercial aggregators generally publish 99.9%.
- Historical / point-in-time: LBR maintains full history of filings (the register is historical by nature). Kompany sells audit-proof historical extracts. North Data keeps event history.
- Known reliability issues: 2022–2023 LBR portal had numerous complaints about search performance and filing-form validation bugs; the 28 January 2026 reform announcement is a direct response. Expect ongoing portal changes through 2026.

#### 8. Legal and redistribution

- **Primary legal basis:** loi modifiée du 19 décembre 2002 (RCS); loi du 13 janvier 2019 (RBE, as modified 27 January 2025); règlement grand-ducal 23 janvier 2003; arrêté ministériel 27 mai 2016; loi du 14 août 2021 on re-use of public-sector information (LU transposition of (EU) 2019/1024 + subsequent HVD updates).
- **LBR data is public.** The underlying register is declared public by statute. RCS data can be reused, but the LBR imposes commercial terms on derived products that reproduce the branded "extrait" format. Mirroring raw facts (name, matricule, address, status) is broadly accepted; reproducing LBR's certified documents is not without a license.
- **Open Data Directive / HVD:** business registers are on the HVD list under (EU) 2023/138. LU's HVD compliance is **partial** — the portal publishes filings freely but bulk API access aligned with the Implementing Regulation is not yet published on data.public.lu. Expect improvement in 2026–2027.
- **RBE:** post-_Sovim_, redistribution of UBO data outside of the legitimate-interest / obliged-entity purpose is prohibited.
- **Attribution:** good practice to cite "Source: Luxembourg Business Registers (LBR) / RCS" in any user-visible rendering. No formal attribution clause attached to free-tier searches, but professional norms expect it.
- **GDPR:** same considerations as CY — legal representatives' names are public for legitimate registry purposes; Strale should minimise caching and respect right-to-object. Note that LU's CNPD (data protection authority) has issued several opinions on registry data re-use; aggressive aggregation without a lawful basis beyond "public register" has been questioned, though no penalties of material size have been published.
- **Enforcement history:** the landmark case is _WM and Sovim_ itself (CJEU 22 November 2022), which originated in Luxembourg and forced the RBE closure. This gives LU the strongest precedent for restrictive interpretation of registry re-use across the EU — relevant risk signal for Strale.

#### 9. Competitive positioning

- **Creditreform Luxembourg** — incumbent. Pan-European network, local LU data + behavioural data (payment experiences via ZaC pool). Buyers: LU banks, fund administrators, trust companies, Big 4 audit. Built in-house plus partnerships. Strong signal; they will fight to keep KYB revenue.
- **Editus** — the local "yellow pages → data" player. Neo Data Provider API on LUXHUB. Strong for marketing and segmentation; also integrated with LUXHUB central electronic data retrieval API for bank-AML use. Great partnership candidate for a Swedish entrant.
- **North Data** — German, strong coverage of LU because of Mémorial/RESA feeds. Popular with investigative journalists and KYC analysts. Developer-friendly pricing.
- **Kompany (Moody's)** — enterprise-first, audit-grade. Default choice for EU-wide KYB platforms.
- **Creditsafe, D&B / Bisnode** — commodity tier.
- **LUXHUB** — interesting angle: it's a Luxembourg bank-owned platform for AML/KYC APIs. Central electronic data retrieval API + Editus on the same marketplace. A partnership route Strale might explore.
- **Signal for Strale:** Luxembourg is a crowded small pond — every KYB vendor covers it because the finance sector is dense and high-margin. Developer-first KYB access is **not** saturated; most offerings are enterprise-contract-and-sales-call. This is where Strale's wedge fits.

#### 10. Recommendation

**Preferred path:** Editus Neo Data Provider API (via LUXHUB) as the primary LU source, augmented by North Data API for directors and event monitoring (RESA-driven). **Fallback:** Kompany live primary-source if audit-proof provenance matters more than the Editus local-data advantage. **Effort: M** (Editus onboarding plus one nightly RESA monitor plus schema normaliser). **Sequence dependency:** If Strale is also onboarding North Data for cross-EU coverage (covers 23 countries including CY-beta and LU-full), a single North Data contract can carry both CY and LU — material simplification. **Decision required from Strale:** _Do we contract locally with Editus and treat LU as a first-class local partnership, or do we treat LU as just another tile in a North Data / Kompany pan-EU buy? The first is better data, slower to ship; the second is faster but more generic._

#### 11. Open questions and unknowns

- Existence and shape of LBR's "enterprise API" — asserted by Kyckr's 2026 update, not confirmed by LBR documentation I could read. Needs email to helpdesk@lbr.lu. _Assumption: it exists but is bespoke per contract._
- Exact fee schedule for LBR extracts — the official tariff PDF is image-based and not parseable. Third-party resellers quote €15–€25 but that's indicative.
- Whether Sweden's BankID / Freja eID+ is practically accepted at LBR onboarding today or only in theory via eIDAS. Worth a concrete test before committing architecture.
- Whether Editus' Neo Data Provider API is usable for redistribution or is licensed for the customer's internal use only.
- NACE coverage completeness in RCS filings — Luxembourg has historically used the corporate-purpose free text more than structured NACE codes. Aggregators often derive NACE.
- Whether LU publishes an HVD-compliant bulk dataset on data.public.lu between now and 2027.
- Exact LUXHUB onboarding model for a non-LU fintech like Strale.
- Whether the new legitimate-interest RBE workflow (1 Feb 2025) is practically usable by an AI-agent-facing platform.

---

## Comparison and sequencing

**Which ships first:** **Luxembourg first.** Three reasons. (1) Data availability is richer — LU aggregators have daily feeds, Cyprus bulk data cadence is unclear and license-ambiguous. (2) LU's authentication story is smoother for a Swedish AB — eIDAS via Swedish BankID / Freja beats Cyprus' gov.cy foreign-entity queue. (3) LU customer pull is larger — the finance industry is data-hungry and pays; Cyprus' comparable demand concentrates in Infocredit and a handful of law firms that are already over-served.

Cyprus is not hard, it's just noisier: OpenSanctions license tag conflicts with the portal default, the DRCIP portal has no API, the UBO channel is gated behind obliged-entity status, and the local incumbent (Infocredit) is strong. Ship LU first, use the learnings to onboard CY second.

**Does one aggregator contract cover both?**
- **North Data — yes, cleanly.** Covers LU (full) and CY (beta) on a single contract; €500/mo start for the API + €4,500/q for bulk on both countries. Directors present in both. This is the most pragmatic single-vendor answer for 2026 if Strale can accept North Data's public-display censor rules.
- **Kompany / Moody's — yes, premium.** Live primary-source for both. Audit-proof. Enterprise pricing likely €30–80k/yr minimum for two countries plus core EU.
- **Creditsafe / D&B — yes, generic.** Both countries in the pan-EU package. Pricing typically $15k–$75k+/yr; data is fine but not differentiated.
- **OpenCorporates — no.** LU data is frozen at 2018-07-24; unusable for Payee Assurance.

**Effort + cost deltas:**
- CY-only, data.gov.cy + Apitalks + OpenCorporates: ~2 weeks dev, <€500/mo ongoing, but freshness/license risks.
- LU-only, Editus + North Data: ~3 weeks dev, €1–2k/mo ongoing, much cleaner data.
- **Both via North Data single contract: ~3 weeks dev total, ~€1k/mo + €4.5k/q bulk = ~€2.5k/mo blended.** This is the recommended default.
- Both via Kompany: ~4 weeks dev, €3–7k/mo. Recommended if audit-grade provenance becomes a hard sales objection.

**Single recommendation to Strale for this quarter:** Sign a **North Data starter contract** covering API + bulk for LU and CY. Ship LU first (eIDAS auth, Editus local-partner talks in parallel), then CY (after sending DRCIP a written query on the CC BY vs CC BY-NC ambiguity). Parcel Kompany for later as the audit-grade upgrade when a regulated financial-services design-partner demands primary-source provenance. Do **not** rely on OpenCorporates for LU, and do **not** rely on data.gov.cy alone for CY until the license is in writing.

