# Identity field-coverage audit — 2026-05-15

**Status:** Phase 1 partial. 10 of 20 countries scored across two batches. Phase 2 (SI Openapi WW-Top probe) and Phase 3 (US Topograph-listed state scout) deferred to follow-up sessions per session scoping.

**Purpose:** Empirical follow-up to DEC-20260513-F's "20/20 v1-ready" verdict. DEC-20260513-F's certification rests on canonical-input fixture validation (one entity per capability) plus 24h canary green-rate for DK and DE only. This audit tests whether the "v1-ready" verdict holds when the capability is probed with multiple real entities (not just the fixture), and quantifies which canonical-identity fields populate at what rate across entity samples.

**Batches:**
- Batch 1 (2026-05-15, 5 countries): SE, UK, DE, SI, SG. Chosen to cover Nordics baseline, UK identifier quirks, OpenRegister free-tier quota surfacing, the known SI structural gap, and a non-EU sanity check.
- Batch 2 (2026-05-15, 5 countries): NO, DK, FR, BE, CZ. Continues Nordics + adds FR (first country with directors), BE (CBEAPI Tier-2 wrapper), CZ (ARES).

**Methodology:** prod API at `https://strale-production.up.railway.app/v1/do` with test API key `sk_live_0d56f39c`. 3 real entities per country: canonical fixture (the `known_answer.input` per DEC-20260513-F) plus 2 well-known publicly-listed or otherwise large entities from the same jurisdiction. Identifiers validated against each capability's input schema before invocation.

**Total cost:** €1.20 across both batches (24 successful calls × €0.05). 6 calls failed without wallet charge (1 bad identifier in UK Batch 1, 3 quota/circuit-breaker in DE Batch 1, 3 quota/circuit-breaker in DK Batch 2). Wallet: €33.99 → €33.39 (Batch 1) → €32.79 (Batch 2). Well within the €10 per-batch hard cap.

**Doc references:**
- DEC-20260513-F — 20/20 Identity v1-ready certification
- DEC-20260515-A — US scope upgrade and Topograph blueprint
- DEC-20260513-B — bad-fixture cascade pattern (identifier-validation requirement)
- DEC-20260508-D — DE/OpenRegister free-tier quota disclosure

---

## Methodology

### Entity selection rules

1. Entity #1 is the manifest's `test_fixtures.known_answer.input` (the canonical fixture entity that DEC-20260513-F's verdict rests on).
2. Entities #2 and #3 are drawn from well-known publicly-listed or otherwise large entities in the same jurisdiction, selected from public knowledge of the country's top companies by revenue or market cap.
3. Each entity's identifier is validated against the capability's `input_schema` before invocation to prevent bad-fixture-cascade per DEC-20260513-B.
4. Where the country's legal-form distribution allows, the 3-entity set covers at least 2 distinct legal forms. Where it doesn't (Sweden is overwhelmingly AB; Singapore listed companies are all "Local Company"), the pilot notes the constraint inline rather than forcing a non-representative form.

### Canonical field set

10 fields scored per country, drawn from the prompt's spec:

1. **Legal name** — official registered name
2. **Registration number** — primary identifier (org_number / company_number / reg_number / uen)
3. **Status** — active / dissolved / liquidation / registered / etc.
4. **Registration date** — incorporation date / registration date
5. **Address** — registered office address (any non-null shape: object or string)
6. **Legal form** — corporate form (AB / PLC / LLP / SE / AG / d.d. / d.o.o. / etc.)
7. **Directors** — statutory representatives (with roles where available)
8. **Industry code** — NACE / SNI / SIC / sector classifier
9. **VAT number** — country-equivalent tax ID
10. **LEI** — Legal Entity Identifier

### Scoring criterion

A field is **populated** if its value is non-null AND non-empty (empty string, empty array, empty object → not populated) AND not a placeholder string (`"unknown"`, `"-"`, `"N/A"`). Cells score `X/3` where X is the number of entities for which the field met the criterion.

A field that is **not in the capability's response schema at all** is scored `–` (en-dash), not `0/3`. The distinction matters: `0/3` means the schema declares the field but no entity populated it (an empirical gap); `–` means the capability cannot return that field at all (a schema/source gap).

For DE, where 0 of 3 entities executed successfully due to OpenRegister quota exhaustion, fields are scored `quota` to denote that the schema supports them but no empirical data was gathered.

---

## Phase 1 — EU+UK+NO+CH+SG live capabilities (5-country pilot)

### Field coverage matrix

| Country | Legal name | Reg # | Status | Reg date | Address | Legal form | Directors | Industry code | VAT | LEI |
|---------|-----------|-------|--------|----------|---------|------------|-----------|---------------|-----|-----|
| BE      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 0/3           | 3/3 | –   |
| CZ      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (NACE)    | 3/3 | –   |
| DE      | quota     | quota | quota  | quota    | quota   | quota      | quota     | quota         | –   | quota |
| DK      | quota     | quota | quota  | quota    | quota   | quota      | –         | quota         | –   | –   |
| FR      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | 3/3       | 3/3 (NAF)     | 3/3 | –   |
| NO      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (NACE)    | 3/3 | –   |
| SE      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (SNI)     | 3/3 | –   |
| SG      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | –             | –   | –   |
| SI      | 3/3       | 3/3   | –      | –        | 3/3     | 3/3        | –         | –             | –   | –   |
| UK      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 2/3 (SIC)     | 0/3 | –   |

### Reading the matrix

- **`X/3`** — schema supports the field; X of 3 entities populated it.
- **`–`** — capability's response schema does not include the field.
- **`quota`** — capability execution blocked at upstream-API quota (DE: OpenRegister 50/month free tier; DK: cvrapi.dk 50/day free tier). Schema supports the field but no empirical data was gathered this session. Circuit breaker tripped in both cases.

**Schema-vs-reality mismatches (declared fields, empirically `0/3`):**
- UK `vat_number` — Companies House profile endpoint does not return VAT. Recommend dropping from schema.
- BE `industry` — CBEAPI.be wrapper does not surface NACE codes from KBO/BCE. Recommend dropping from schema or hooking a KBO Open Data direct ingest.

### Per-country detail

#### SE — swedish-company-data (Bolagsverket HVD)

**Entities tested:**
- E1: Spotify AB, org_number `556703-7485` (fixture)
- E2: Aktiebolaget Volvo, org_number `556012-5790`
- E3: H & M Hennes & Mauritz AB, org_number `556042-7220`

**Legal-form constraint:** All 3 entities are Aktiebolag (AB). Sweden's company-form distribution is overwhelmingly dominated by AB for the entity size range used here; the pilot did not force a non-representative form. Bolagsverket HVD also covers HB, KB, EK, etc. but those are not represented in the top-listed slice.

**Anomalies:**
- E2 (Volvo) `registered_address.street` is `null` while E1 (Spotify) and E3 (H&M) have populated streets. City + postal code present for all. This is a real registry-level data sparsity for older entities, not a capability bug. The `registered_address` object is non-null in all 3 cases (so the field counts as populated by the scoring criterion), but the *completeness* of the address varies.

**Field notes:**
- `sni_codes` is an array of `{code, description}` pairs; every entity has at least 1 entry. SE counts as full SNI coverage.
- `vat_number` is algorithmically derived from `org_number` (10-digit orgnr + `01` suffix); always populated.
- No `directors` or `lei` fields in the SE schema. Directors data is not in the HVD subset; LEI is a GLEIF artifact and would require a join against `lei-lookup` capability.

#### UK — uk-company-data (Companies House)

**Entities tested:**
- E1: TESCO PLC, company_number `00445790` (fixture, PLC)
- E2: ASTRAZENECA PLC, company_number `02723534` (PLC)
- E3: KPMG LLP, company_number `OC301540` (LLP)

**Legal-form constraint:** 2 distinct forms covered (PLC, LLP). The `business_type` field correctly differentiates `plc` from `llp`. Companies House supports more forms (ltd, ltd-by-guar, plc, llp, scot-llp, partnership) but these 3 entities are representative.

**Anomalies:**
- E3 (KPMG LLP) `sic_codes` is an empty array `[]` while E1 and E2 have populated SIC arrays. LLPs at Companies House routinely have empty SIC arrays — Companies House does not require SIC for LLPs. This is a real source gap, not a capability bug. Scored `2/3` for industry code.
- Initial pick OC305597 (intended as KPMG LLP) returned "not found" — the actual KPMG LLP number is OC301540. Substituted and retried (no wallet charge for the failed call).

**Field notes:**
- No `vat_number` is returned in any response despite the field being declared as optional in the schema. Companies House does not expose VAT on the basic profile endpoint; VAT comes from a separate HMRC service. Scored `0/3` (schema declares the field, but empirically never populated — distinct from `–`).
- No `directors` or `lei` fields in the UK schema. Companies House `/officers` is a separate endpoint and a separate capability (`uk-companies-house-officers`); this capability returns only the company profile.
- UK capability response is **noticeably thinner** than SE: 8 fields vs 16. No business description, no alternative names, no `is_active` boolean. The `status` is returned as a plain string ("active") with no enum normalization.

#### DE — german-company-data (OpenRegister Tier-2)

**Entities tested (intended):**
- E1: SAP SE, company_name `"SAP SE"` (fixture, SE form)
- E2: Siemens AG, company_name `"Siemens AG"` (AG form)
- E3: BMW AG, company_name `"Bayerische Motoren Werke Aktiengesellschaft"` (AG form)

**Execution status: 0 of 3 entities executed successfully.**

- E1 returned HTTP 402 "Payment Required" from OpenRegister upstream. The free tier (50 req/month, resets on the 1st of the month) is exhausted for 2026-05.
- E2 and E3 hit the circuit breaker (state `open` until `2026-05-15T07:33:13Z`). Per DEC-20260503-B the breaker trips after 3 consecutive failures and the 402 from E1 was apparently the 3rd consecutive failure in a 30-day window — suggesting the quota had been progressively burned by prior production traffic + earlier health probes earlier in May.
- No wallet charge applied for any of the 3 attempts (DEC-14 alignment confirmed in the wallet-balance progression).

**Operational finding (the original pilot rationale):** the DE pilot was scoped specifically to "surface any quota issue early before scaling to 20 countries" per session direction. Surface it does. The quota was empirically depleted *before* this audit's first call — the 402 on the canonical fixture means OpenRegister rejected the first paid request of this audit session. Either the May free-tier allowance has already been consumed by production traffic, or there's a mid-month overrun pattern worth investigating.

**Recommended follow-up for chat:**
1. Pull the DE 2026-05 call log from the transactions table — verify how the 50 free credits were consumed and on what dates.
2. If consumption is from real customer traffic, decision point per DEC-20260505-H (Pro-tier upgrade gated on customer attachment + audit-retention written confirmation).
3. If consumption is from health probes or smoke tests, tune the probe schedule against the 50/month cap.
4. Re-run the DE pilot after 2026-06-01 (next quota reset) or after a Pro upgrade.

**Schema-supported fields (cannot empirically score this session):** `directors`, `lei`, `industry_codes`, `incorporated_at`, `legal_form`, `capital`, etc. DE is the *only* country in this pilot whose schema declares `directors` and `lei` — making it the highest-priority country to re-test once quota is restored.

#### SI — slovenian-company-data (data.gov.si CKAN)

**Entities tested:**
- E1: KRKA, tovarna zdravil, d.d., Novo mesto, reg_number `5043611000` (fixture, d.d. = Delniška družba)
- E2: PETROL, Slovenska energetska družba, d.d., Ljubljana, reg_number `5025796000` (d.d.)
- E3: Poslovni sistem Mercator d.o.o., reg_number `5300231000` (d.o.o. = Družba z omejeno odgovornostjo)

**Legal-form constraint:** 2 distinct forms covered (d.d., d.o.o.). The `legal_form` field cleanly differentiates.

**Anomalies:** None per entity. Every entity returned every schema-declared field non-null. The capability is structurally consistent at the entity level.

**Structural source gap confirmed (DEC-20260513-F):**
- `status` — not in schema. Open feed does not distinguish active vs dissolved.
- `registration_date` (incorporation date) — not in schema.
- `industry_code` (SKD/NACE) — not in schema.
- `directors` — not in schema.
- `vat_number` — not in schema.
- `lei` — not in schema.

The thin-coverage is *not* an empirical gap (0/3 fields populated despite schema) but a *schema/source* gap: the data.gov.si CKAN open subset does not contain these fields at all. The audit's three entities confirm this is consistent across both d.d. and d.o.o. forms. Reactivation requires a paid AJPES restPrsInfo contract with redistribution rights or EU HVD expansion (per manifest's limitation block).

**Implication:** SI is the canonical example of a country where the v1-ready certification is *correct on what's returned* but *thin on what KYB/compliance customers expect to see*. The follow-up session's Phase 2 (Openapi WW-Top probe of the same 3 SI entities) is the empirical test of whether Openapi closes the gap.

#### SG — singapore-company-data (data.gov.sg CKAN / ACRA)

**Entities tested:**
- E1: SINGAPORE AIRLINES LIMITED, uen `197200078R` (fixture, Local Company)
- E2: SINGAPORE TELECOMMUNICATIONS LIMITED, uen `199201624D` (Local Company)
- E3: OVERSEA-CHINESE BANKING CORPORATION LIMITED, uen `193200032W` (Local Company)

**Legal-form constraint:** Only 1 distinct `entity_type` ("Local Company") across the 3 entities. Singapore's `entity_type` is finer-grained than expected — top listed entities are all Local Company. Sole Proprietorships, Partnerships, Limited Liability Partnerships, Foreign Company branches all exist as distinct `entity_type` values in the ACRA dataset, but those are not represented in the top-tier-by-revenue slice. The pilot did not force a non-representative entity to satisfy the "2 distinct forms" rule for SG. Note as a methodology variance.

**Anomalies:** None per entity. All 3 fields populated identically.

**Field notes:**
- `registered_street` and `registered_postal_code` are populated for all 3 entities, but the `registered_address` is the literal concatenation `"<STREET>, Singapore <POSTAL>"` — no building number, no unit. This matches the manifest's documented limitation (data.gov.sg ACRA dataset publishes street + postal only).
- No `directors`, `industry_code`, `vat_number`, or `lei` fields in the SG schema. Directors and shareholders require paid ACRA BizFile+. Singapore has no separate VAT (UEN doubles as tax ID for GST). LEI would require a GLEIF cross-walk.
- `status` is the string `"Registered"` (not "active") — different vocabulary from EU capabilities. Solutions that filter on status would need to normalize. Not a bug, but a wire-shape consistency note.

#### NO — norwegian-company-data (Brønnøysund Register Centre)

**Entities tested:**
- E1: DNB BANK ASA, org_number `984851006` (fixture)
- E2: EQUINOR ASA, org_number `923609016`
- E3: Norsk Hydro ASA, org_number `914778271`

**Legal-form constraint:** All 3 are Allmennaksjeselskap (ASA — public limited). Norway's top-listed slice is dominated by ASA. Brønnøysund also covers AS, ENK, SA, ANS, DA, STI, but those are not represented in the entity sample. Same constraint as SE.

**Anomalies:** None per entity. All 10 schema-declared fields populated for all 3 entities.

**Field notes:**
- `vat_number` is algorithmically derived (orgnr + `MVA` suffix); always populated.
- `industry_code` is NACE-compatible (e.g. `64.190` for banks, `06.100` for crude petroleum extraction, `24.420` for aluminium production); 3/3 populated.
- `employee_count` is populated as a plain integer (7491 / 21327 / 391) — useful for solutions that filter on company size.
- No `directors` or `lei` fields in the NO schema. Brønnøysund exposes director data via a separate endpoint (`/enheter/{orgnr}/roller`) that this capability does not call.

#### DK — danish-company-data (cvrapi.dk / CVR)

**Entities tested (intended):**
- E1: Novo Nordisk A/S, cvr_number `24256790` (fixture, A/S)
- E2: A.P. Møller - Mærsk A/S, cvr_number `22756214` (A/S)
- E3: Vestas Wind Systems A/S, cvr_number `10403782` (A/S)

**Execution status: 0 of 3 entities executed successfully.**

- E1 returned `"The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours."` from cvrapi.dk upstream.
- E2 and E3 hit the circuit breaker (state `open` until `2026-05-15T07:49:56Z`). Same pattern as DE in Batch 1.
- No wallet charge for any of the 3 attempts.

**Operational finding:** Per the manifest, `danish-company-data` runs on cvrapi.dk's free tier with a conservative IP-quota cap of 50/day (the documented limit is higher but the manifest records "Empirical floor ~50/day; documented limit higher but conservative cap chosen until we observe one clean cycle"). The quota is exhausted before this Batch 2 session's first call, which means earlier health probes + customer traffic in the past 24 hours have already saturated the daily cap. Same recommendation as DE: pull the past-24-hour DK call log from the transactions table.

**Schema-supported fields (cannot empirically score this session):** `status`, `address`, `cvr_number`, `start_date`, `company_name`, `business_type`, `industry_code`, `employee_range`. Schema does **not** declare `directors`, `vat_number`, or `lei` — even when the quota is restored DK will score `–` on those columns.

**Schema-vs-reality flag (anticipated):** DK companies all have CVR-derived VAT numbers (CVR doubles as VAT-ID), so absence of `vat_number` from the schema is a *missing field*, not a source gap. Suggest adding `vat_number` to the DK schema as a derived field (mirroring SE's `org_number → vat_number` pattern).

#### FR — french-company-data (INSEE / SIRENE via api.gouv.fr)

**Entities tested:**
- E1: TOTALENERGIES SE, siren `542051180` (fixture, business_type=5800 → SE)
- E2: L'OREAL, siren `632012100` (business_type=5599 → SA)
- E3: BNP PARIBAS, siren `662042449` (business_type=5599 → SA)

**Legal-form constraint:** 2 distinct INSEE legal-form codes covered (5800 = SE, 5599 = SA). Note FR's `business_type` is the INSEE numeric code, not a human label — solutions that filter on legal form would need an INSEE code map.

**Anomalies:**
- Director name overlap: "JACQUES ASCHENBROICH" appears on both TotalEnergies (E1) and BNP Paribas (E3) boards. Verified accurate against public records — Aschenbroich serves on multiple French boards. Not a capability bug; a real-world cross-board directorship.
- L'OREAL's `company_name` is a list of trade names in parentheses ("L'OREAL (KERASTASE ; MIZANI ; L'OREAL PROFESSIONNEL PARIS ; ESSIE PROFESSIONNEL ; BAXTER OF CALIFORNIA ; BIOL)"). The leading name is the official `dénomination sociale`; the parenthesized tail is the `nom commercial`. Solutions parsing the name field need to split on `(`.

**Field notes — first country in this audit with directors coverage:**
- `directors` is a 3-element array per entity, with role labels ("Administrateur" / "Président du conseil d'administration" / "Directeur Général" / "Personne ayant le pouvoir d'engager…").
- `directors_truncated: true` for all 3 entities — the executor caps the payload at 3 directors.
- `total_directors` reveals the true counts: 15 (TotalEnergies), 20 (L'Oréal), 20 (BNP Paribas). The 3-cap is a payload-size decision, not a source limitation. For KYB customers needing full director rosters, the cap will need to be raised or paginated.
- `vat_number` is algorithmically derived (FR + 2-digit check + SIREN); 3/3 populated.
- `activity_code` is the NAF/APE code (French national NACE variant, e.g. `70.10Z` for holding-company management). 3/3 populated.
- No `lei` in the schema. INSEE does not include LEI in the SIRENE response.

**Implication:** FR is the audit's first proof that the schema *can* declare and populate `directors` for a free public registry. The 3-cap is a Strale-side product decision and an obvious tuning target before the v1 launch. The matrix's `3/3` for FR directors should be read as "3 of 3 entities have ≥3 directors returned, but the true count is 15–20."

#### BE — belgian-company-data (CBEAPI.be wrapper of KBO/BCE)

**Entities tested:**
- E1: ANHEUSER-BUSCH INBEV, enterprise_number `0417497106` (fixture, Société anonyme)
- E2: SOLVAY, enterprise_number `0403091220` (Société anonyme)
- E3: PROXIMUS, enterprise_number `0202239951` (Société anonyme de droit public)

**Legal-form constraint:** 2 distinct sub-forms covered: standard SA (E1/E2) and the public-law variant "Société anonyme de droit public" for Proximus (E3, formerly state-owned). Belgium's legal-form vocabulary is bilingual (Dutch NV / French SA); all 3 entities returned the French form-label.

**Anomalies:**
- **Schema-vs-reality mismatch:** `industry` field is declared in the output schema (type `string`) but is `null` for all 3 entities. The CBEAPI.be wrapper does not surface NACE codes from KBO/BCE despite the schema promising the field. This is the BE equivalent of the UK `vat_number` finding from Batch 1. Recommendation: drop from schema or migrate to a direct KBO Open Data ingest that exposes NACE.
- `commercial_name` is `null` for all 3 entities (declared `rare` in field reliability, so 0/3 is consistent).
- `abbreviation` is populated only for E1 ("A.P.I." — Anheuser-Busch InBev's abbreviation). 1/3.

**Field notes:**
- `vat_number` is algorithmically derived (BE + enterprise_number); 3/3 populated.
- `registration_date` is populated even for very old entities (Solvay: 1863-12-26, Proximus: 1930-07-19). The CBEAPI.be wrapper handles historical dates cleanly.
- `establishments_count` is populated 3/3 (5 / 2 / 186). Useful as a proxy for company-size filtering.
- No `directors` or `lei` fields in the BE schema. KBO/BCE does expose director data via the FPS Economy SFTP feed; CBEAPI.be wrapper does not surface it.

#### CZ — cz-company-data (ARES / Czech Ministry of Finance)

**Entities tested:**
- E1: Škoda Auto a.s., ico `00177041` (fixture, a.s. = akciová společnost, legal_form_code=121)
- E2: ČEZ, a. s., ico `45274649` (a.s., legal_form_code=121)
- E3: O2 Czech Republic a.s., ico `60193336` (a.s., legal_form_code=121)

**Legal-form constraint:** All 3 entities are akciová společnost (a.s.), legal_form_code `121`. Czech top-listed slice is dominated by a.s.; s.r.o. (společnost s ručením omezeným, code 112) and v.o.s. / k.s. are common in SMB but not in the entity sample.

**Anomalies:** None per entity. All 11 schema-declared fields populated for all 3 entities.

**Field notes:**
- `legal_form_code` is returned as a numeric string (`"121"`) — different vocabulary from FR's `business_type` (also numeric) and SE/SG (human-readable string). Solutions filtering on legal form need a per-country code lookup. Wire-shape consistency note.
- `nace_codes` is an array of NACE codes; entity counts vary (13 for Škoda, 42 for ČEZ, 27 for O2) — Czech companies declare many secondary NACE activities, more than the typical 1-2 in other EU registries.
- `vat_number` is algorithmically derived (CZ + IČO); 3/3 populated.
- `last_updated` field carries the ARES dataset's freshness date per entity (2026-04-16, 2026-04-19, 2026-04-06). Useful provenance signal, not present in most other EU capabilities.
- `primary_source` is `"ros"` for all 3 (ROS = Registr osob, the Czech base register). Indicates the underlying ARES route.
- No `directors` or `lei` fields in the CZ schema. ARES exposes "statutární orgán" (statutory body) data via a separate endpoint that this capability does not call.

---

## Phase 2 — SI Openapi WW-Top probe

**Status: DEFERRED.**

Per session scoping (pilot-only, 5 countries), Phase 2 runs in the follow-up session that completes the remaining 15 EU+CH+NO+APAC countries. The SI direct results above (3 entities, schema/source gap confirmed) are the baseline; the Openapi WW-Top probe will use the same 3 SI matična številka identifiers (`5043611000`, `5025796000`, `5300231000`) to compare field coverage.

**Cost estimate carried forward:** ~€0.30 (3 calls × €0.10 base × 1.22 IT VAT) at Openapi WW-Top rates. Requires `OPENAPI_API_KEY` env var on the runner.

---

## Phase 3 — US Topograph-listed state scout

**Status: DEFERRED to standalone session.**

Per session scoping, Phase 3 is a separate session. Phase 3 is *exploratory* (US integrations are not yet built per DEC-20260515-A) and does not depend on the Phase 1 / Phase 2 results, so it can run standalone.

---

## Synthesis (partial — 10 of 20 countries)

### Countries with full directors coverage (empirically verified)

- **FR** — `directors` array populated 3/3 with role labels. `total_directors` reveals the true count (15–20 per entity); the payload-cap-at-3 is a Strale-side product decision, not a source limitation. INSEE/SIRENE supplies director data free of charge via api.gouv.fr.

**One country across 10 scored.** FR is the only positive proof so far that a free public registry can populate `directors` end-to-end. The prior session's chat principle ("build directors wherever data is free") has its first concrete instance.

### Countries with thin directors coverage (free-path direct-build candidates)

- **SE** — Bolagsverket HVD does not include directors. Would require a separate paid Bolagsverket service or a different free EU registry-direct integration. Bolagsverket's full Värdefulla datamängder API roadmap includes director data per the EU HVD directive, but not in the current open subset. Direct-build candidate when/if HVD expansion ships.
- **UK** — Companies House `/officers` endpoint is free and well-documented. The `uk-companies-house-officers` capability already exists (separate slug) per the manifests listing. Strategy decision: keep officers separate, or fold into `uk-company-data`? Currently separate, which preserves caller intent but doubles per-customer call cost.
- **NO** — Brønnøysund `/enheter/{orgnr}/roller` endpoint is free and well-documented. Not currently called by `norwegian-company-data`. **Free-path direct-build candidate.** Similar shape to the UK officers split — either a sibling capability or in-line orchestration.
- **CZ** — ARES exposes statutární orgán (statutory body) data via a separate endpoint. **Free-path direct-build candidate.**
- **BE** — KBO/BCE does expose director data via the FPS Economy SFTP feed. The current CBEAPI.be wrapper does not surface it. A first-party KBO Open Data ingest (already flagged as the longer-term target in the manifest's provenance limitation) would close the gap.
- **DK** — Schema-coverage cannot be determined this session due to quota exhaustion. CVR / Erhvervsstyrelsen does expose director data; whether cvrapi.dk's wrapper surfaces it is unknown until the quota resets.
- **SG** — Directors require ACRA BizFile+ (paid). Not a free-path direct-build candidate. Customer would pay BizFile+ via Cobalt-style aggregator or BYO credentials.

### Countries with structural source gaps (SI-style — disclosure not build)

- **SI** — confirmed: status, registration date, industry code, directors, VAT, LEI all absent from the data.gov.si open subset. Per-entity consistent across both d.d. and d.o.o. forms. The DEC-20260513-F disclosure is accurate and load-bearing. No build path until AJPES restPrsInfo contract or EU HVD expansion.

No new SI-style cases surfaced in Batch 2. BE's `industry` null-out is a wrapper-level gap (CBEAPI.be doesn't surface NACE that KBO has), not a source-level absence. DK's gaps cannot be confirmed until quota resets.

### Countries with quota-blocked re-test (2)

- **DE** — OpenRegister 50/month free-tier exhausted on or before 2026-05-15 07:22Z. Circuit breaker tripped. Schema supports directors and LEI; cannot be empirically scored until quota reset (2026-06-01) or Pro-tier upgrade.
- **DK** — cvrapi.dk 50/day free-tier exhausted before this Batch 2 session's first call (`"The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours."`). Circuit breaker tripped until 2026-05-15T07:49:56Z. Re-test viable after the daily reset.

Both are real operational signals worth investigating before the v1 launch. DE is the harder case (monthly cap, smaller volume budget); DK should self-recover daily.

### Schema-vs-reality mismatches (declared fields, empirically `0/3`)

- **UK `vat_number`** (Batch 1 finding) — recommend dropping from schema. Companies House profile endpoint does not return VAT.
- **BE `industry`** (Batch 2 finding) — recommend dropping from schema or migrating to a direct KBO Open Data ingest. CBEAPI.be wrapper does not surface NACE codes.

### Sibling directors/officers capabilities discovered

Searched `apps/api/src/capabilities/` for any capability with a directors / officers / UBO / shareholder / participant slug scoped to NO / DK / FR / BE / CZ. **None found.** Only the existing 3:
- `uk-companies-house-officers.ts` (UK-specific, free)
- `officer-search.ts` (multi-country, currently UK + US only per its docstring; EU was removed under DEC-20260427-I commercial-KYB scraping ban)
- `gleif-l2-ubo-lookup.ts` (global GLEIF, not country-scoped)

No country-scoped sibling exists for NO/DK/FR/BE/CZ. NO and CZ are the cleanest direct-build candidates (both have free official endpoints documented above). FR already has directors inline in the main capability, no sibling needed.

### Follow-up Notion updates needed (surface in chat, not implemented here)

10-of-20 sample is now substantial enough to flag specific drift:

- **Capability × Country Coverage Matrix:** if SE/UK/NO/CZ/BE/DK/SG entries claim "directors" coverage today, they should drop to "no" (no country except FR returns directors in their primary identity capability).
- **Capability × Country Coverage Matrix:** FR should be marked "yes (capped at 3)" for directors. The cap is significant for KYB customers — full director rosters require uncapping.
- **Active Vendor Stack:** confirm DE's OpenRegister and DK's cvrapi.dk free-tier quotas are accurately documented (DEC-20260508-D for DE; the DK manifest's "Empirical floor ~50/day" deserves equivalent decision-DB cross-reference).
- **DK schema** should declare `vat_number` (derived from CVR) — currently missing. SE pattern is the template.
- **BE schema** should drop `industry` (always null via CBEAPI.be wrapper) or migrate to direct KBO ingest.

### Pilot — 10 countries scored, 10 remaining + Phase 2 + Phase 3

Remaining Phase 1 countries: FI, IE, EE, PL, LV, LT, SK, HR, GR, CH. The pilot's findings on identifier validation, response schema variance, and quota surfacing all carry over.

Methodology recommendations for the follow-up:
1. Run an HTTP HEAD on Companies House or equivalent for each entity's identifier *before* invoking the capability (cheaper than the wallet-charged not-found error path).
2. Use the prod API path (`POST /v1/do` with `inputs:` plural and `max_price_cents`) — verified working across both batches.
3. Budget €0.60 wallet spend per 5-country batch at current pricing. Below €5 for the remaining 10 countries.
4. For DE specifically, do not re-test before 2026-06-01 unless Pro-tier upgrade has shipped. DK can be re-tested after the daily reset (~24h cycle).
5. **Add a `directors` discovery step to per-country detail.** When the schema doesn't declare directors, name the free upstream endpoint (or absence thereof) explicitly. This is the canonical input to Phase 4 (orchestration).

---

## Open questions for chat

1. **DE quota** — was the 50/month allowance consumed by customer traffic or by health probes? Pull the May call log on `german-company-data` from the transactions table to determine. If health probes, retune the schedule (probes shouldn't burn paid quota — Principle A in CLAUDE.md). If customer traffic, the Pro-tier decision per DEC-20260505-H is hot.
2. **UK `vat_number` field** — declared in output_schema but empirically `0/3` populated across this pilot. Either drop from schema (don't promise what isn't returned) or hook the HMRC VAT-by-CRN lookup. Suggest adding to the v1 launch punch list.
3. **SG status vocabulary** — returns `"Registered"` not `"active"`. Cross-country status normalization is a separate workstream; flag for the wire-shape consistency review.
4. **SE registered_address completeness** — Volvo's `street` is null. Is this consistent across older AB entries (pre-1950 registration)? Worth a sanity check against another pre-1950 entity in the follow-up.
5. **Methodology — directors-aware scoring** — should the follow-up score `directors` as `–` (schema gap) or as `0/3` (build gap)? This pilot used `–` consistently; chat to confirm before applying to the remaining 15 countries.
6. **DK quota** — same operational question as DE. cvrapi.dk's daily quota was already exhausted at session start. Pull the past-24h `danish-company-data` transactions to determine whether customer traffic, scheduled probes, or both are saturating the 50/day cap. The DK manifest's "Empirical floor ~50/day; documented limit higher" note suggests there may be headroom to raise the cap if cvrapi.dk's real limit is higher.
7. **DK missing `vat_number` in schema** — Danish companies all have CVR-derived VAT numbers (CVR doubles as VAT-ID with a check digit). Suggest adding `vat_number` to the DK output_schema as a derived field, mirroring SE's `org_number → vat_number` pattern. Low-effort schema win.
8. **BE `industry` field** — declared but always null (3/3). CBEAPI.be wrapper does not surface NACE from KBO/BCE. Either drop from schema or accelerate the planned KBO Open Data first-party ingest. Suggest adding to the v1 launch punch list alongside UK `vat_number`.
9. **FR directors payload cap at 3** — `directors_truncated: true` for all 3 entities tested; true counts are 15–20. KYB customers will need full rosters. Decision: raise the cap, paginate, or accept that customers needing full rosters must call a separate endpoint? Tag for v1 product decision.
10. **CZ `legal_form_code` as numeric string** — returned as `"121"` not `"akciová společnost"`. Consistent with FR's `business_type: "5800"` shape. Are we standardising on numeric codes everywhere with human-readable labels in a `_label` companion field? Cross-country wire-shape consistency review item.

---

*Generated by Claude Code session 2026-05-15 (two batches). Wallet spend: €1.20 total (€0.60 Batch 1 + €0.60 Batch 2). Worktree: strale-research, branch `docs/identity-field-coverage-2026-05-15`. No code changes, no DB changes, no PR.*
