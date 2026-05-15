# Identity field-coverage audit — 2026-05-15

**Status:** Phase 1 partial. 15 of 20 countries scored across three batches. Phase 2 (SI Openapi WW-Top probe) and Phase 3 (US Topograph-listed state scout) deferred to follow-up sessions per session scoping.

**Purpose:** Empirical follow-up to DEC-20260513-F's "20/20 v1-ready" verdict. DEC-20260513-F's certification rests on canonical-input fixture validation (one entity per capability) plus 24h canary green-rate for DK and DE only. This audit tests whether the "v1-ready" verdict holds when the capability is probed with multiple real entities (not just the fixture), and quantifies which canonical-identity fields populate at what rate across entity samples.

**Batches:**
- Batch 1 (2026-05-15, 5 countries): SE, UK, DE, SI, SG. Chosen to cover Nordics baseline, UK identifier quirks, OpenRegister free-tier quota surfacing, the known SI structural gap, and a non-EU sanity check.
- Batch 2 (2026-05-15, 5 countries): NO, DK, FR, BE, CZ. Continues Nordics + adds FR (first country with directors), BE (CBEAPI Tier-2 wrapper), CZ (ARES).
- Batch 3 (2026-05-15, 5 countries): FI, IE, EE, PL, LV. Tests the CKAN-thinness hypothesis (IE and LV both CKAN-based) and adds 2 direct-registry Eastern European integrations (EE, PL).

**Methodology:** prod API at `https://strale-production.up.railway.app/v1/do` with test API key `sk_live_0d56f39c`. 3 real entities per country: canonical fixture (the `known_answer.input` per DEC-20260513-F) plus 2 well-known publicly-listed or otherwise large entities from the same jurisdiction. Identifiers validated against each capability's input schema before invocation.

**Total cost:** €1.95 across three batches (39 successful calls × €0.05). 7 calls failed without wallet charge (1 bad identifier in UK Batch 1, 3 quota/circuit-breaker in DE Batch 1, 3 quota/circuit-breaker in DK Batch 2, 1 transient internal_error in IE Batch 3 retried successfully). Wallet: €33.99 → €33.39 (Batch 1) → €32.79 (Batch 2) → €32.04 (Batch 3). Well within the €10 per-batch hard cap.

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
| EE      | 3/3       | 3/3   | 3/3    | –        | 3/3     | 3/3        | –         | –             | 0/3 | –   |
| FI      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (NACE)    | 3/3*| –   |
| FR      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | 3/3       | 3/3 (NAF)     | 3/3 | –   |
| IE      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (PO)†     | 0/3 | –   |
| LV      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | –             | 0/3 | –   |
| NO      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (NACE)    | 3/3 | –   |
| PL      | 3/3       | 3/3   | 3/3    | 0/3      | 0/3     | 3/3        | –         | –             | 3/3 | –   |
| SE      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (SNI)     | 3/3 | –   |
| SG      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | –             | –   | –   |
| SI      | 3/3       | 3/3   | –      | –        | 3/3     | 3/3        | –         | –             | –   | –   |
| UK      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 2/3 (SIC)     | 0/3 | –   |

`*` FI returns `vat_number` (and `website`) but the manifest's output_schema does not declare them. Schema undercount, not overcount. Recommend updating schema to declare these.
`†` IE: `principal_object_code` populated 3/3 (NACE-compatible); `nace_v2_code` is null 3/3 (declared `rare`, consistent).

### Reading the matrix

- **`X/3`** — schema supports the field; X of 3 entities populated it.
- **`–`** — capability's response schema does not include the field.
- **`quota`** — capability execution blocked at upstream-API quota (DE: OpenRegister 50/month free tier; DK: cvrapi.dk 50/day free tier). Schema supports the field but no empirical data was gathered this session. Circuit breaker tripped in both cases.

**Schema-vs-reality mismatches (declared fields, empirically `0/3`):**
- UK `vat_number` — Companies House profile endpoint does not return VAT. Recommend dropping from schema.
- BE `industry` — CBEAPI.be wrapper does not surface NACE codes from KBO/BCE. Recommend dropping from schema or hooking a KBO Open Data direct ingest.
- IE `vat_number` — CRO Open Data CKAN does not include VAT. Recommend dropping or hooking Revenue's VIES lookup.
- EE `vat_number` — Äriregister capability does not surface KMKR (Estonian VAT). EE VAT can be derived (`EE` + 9 digits) but the executor doesn't.
- LV `vat_number` — `data.gov.lv` CKAN does not include VAT. LV VAT can be derived (`LV` + reg_number for 40NNN-prefix entities) but executor doesn't.
- PL `address` — KRS capability declares the field but returned null 3/3 across major listed entities (Orlen, KGHM, MARTOM). Significant gap.
- PL `registration_date` — same pattern, declared null 3/3.

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

#### FI — finnish-company-data (PRH / avoindata.prh.fi)

**Entities tested:**
- E1: Nokia Oyj, business_id `0112038-9` (fixture, Oyj)
- E2: Stora Enso Oyj, business_id `1039050-8` (Oyj)
- E3: Neste Oyj, business_id `1852302-9` (Oyj)

**Legal-form constraint:** All 3 entities are Oyj (Public limited company). Finland's top-listed slice is dominated by Oyj. PRH also covers Oy, Ay, Ky, Osk, ry, but none are represented in the entity sample. Same constraint as NO/SE.

**Anomalies:** None per entity. All 3 entities returned every schema-declared field plus 2 additional fields (`website`, `vat_number`) that are NOT declared in `output_schema`.

**Field notes:**
- **Schema-undercount (inverse of UK/BE pattern):** the response includes `vat_number` (FI + business_id minus the dash and check digit) and `website` (e.g. `"www.nokia.com"`), but the `output_schema` properties section does not declare them. Customers reading the schema would not know to expect them. Recommend adding both to the schema. This is the opposite of the schema-vs-reality mismatch — capability returns *more* than declared.
- `industry_code` is NACE-compatible (5-digit, e.g. `70100`, `17120`, `19200`); 3/3 populated.
- `registration_date` is populated even for old entities (Nokia: 1896-12-19, well within HVD coverage). PRH handles historical dates cleanly.
- Address is a comma-delimited string with street, number, postal code, city: `"Karakaari, 7, 02610 ESBO"`.
- `website` is null for Neste (E3) but populated for Nokia + Stora Enso. Useful for KYB enrichment when present.
- No `directors` or `lei` fields in the FI schema. PRH `/bis/v1/{businessId}` exposes director-equivalent data via the `bisCacheTime` payload (companyForms array, businessLines array, registeredOffices array, names array). The capability does not currently surface it. Free-path direct-build candidate.

#### IE — irish-company-data (CRO Open Data Portal CKAN)

**Entities tested:**
- E1: STRIPE PAYMENTS EUROPE, LIMITED, cro_number `513174` (fixture, LTD)
- E2: CRH PUBLIC LIMITED COMPANY, cro_number `12965` (PLC)
- E3: RYANAIR HOLDINGS PUBLIC LIMITED COMPANY, cro_number `249885` (PLC)

**Legal-form constraint:** 2 distinct forms covered (LTD + PLC). Irish CRO Open Data also covers UNLTD, EXTERNAL, INDUSTRIAL_PROVIDENT, LBG, but those are not represented in the entity sample.

**Anomalies:**
- IE-2 (CRH) returned a transient `internal_error` on first attempt with no wallet charge. Succeeded on retry. Single transient failure across 15 Batch-3 calls; not a pattern but worth a Sentry/source_health glance.
- `eircode` is populated 2/3 — Ryanair Holdings (E3, 1996 incorporation) has `null` eircode. Per manifest's documented limitation: "The Eircode field was introduced in 2014 and is populated for newer registrations and recently-updated entities." Consistent.
- `nace_v2_code` is null 3/3 (declared `rare` in field reliability, so consistent with the manifest).
- Status string is `"Normal"` — third distinct status vocabulary in this audit ("active" / "Registered" / "Reģistrēts" / "Normal"). Wire-shape consistency note.

**Field notes:**
- **Schema-vs-reality mismatch:** `vat_number` declared in `output_schema` properties but populated `0/3`. Irish VAT (`IE` + 7 chars or 8 chars + letter) comes from Revenue, not CRO. Same recommendation as UK: drop or hook a VIES lookup.
- `principal_object_code` populated 3/3 (`65.23`, `74.15`, `74.84` — NACE-compatible Principal Object codes). Treated as the de-facto industry-code field for IE in the matrix, with `nace_v2_code` as the rare richer alternative.
- `last_annual_return_date` / `next_annual_return_date` / `last_accounts_date` populated for all 3 — useful KYB freshness signal. Unique to IE among audited capabilities.
- No `directors` or `lei` fields in the IE schema. CRO Open Data exposes directors via a *separate dataset* on opendata.cro.ie (the Directors dataset). Free-path direct-build candidate (likely the same CKAN endpoint pattern as the current capability).

#### EE — estonian-company-data (e-Äriregister / ariregister.rik.ee)

**Entities tested:**
- E1: Bolt App Services AS, registry_code `17449106` (fixture, AS = Aktsiaselts)
- E2: Aktsiaselts Tallink Grupp, registry_code `10238429` (AS)
- E3: Pipedrive OÜ, registry_code `11958539` (OÜ = Osaühing / private LLC)

**Legal-form constraint:** 2 distinct forms (AS, OÜ). Estonian e-Äriregister covers TÜ, FIE, MTÜ, KÜ, NB, SA also, but those are not represented in the top-listed slice.

**Anomalies:**
- **Wire-shape inconsistency in `business_type`:** E1 (Bolt AS) returns `"1"` (numeric code), E2 (Tallink AS) returns `"1"` (numeric code), E3 (Pipedrive OÜ) returns `"OÜ (Private limited company)"` (human-readable string). The capability handler is inconsistent — apparently the AS branch returns a code while the OÜ branch returns a label. Solutions parsing `business_type` will see this as two different shapes.
- E2 (Tallink) and E3 (Pipedrive) have populated `historical_names` arrays (former names: "Hansatee Grupp", "New Pipe Technologies OÜ"). E1 (Bolt) has empty array. Historical-name tracking is rare among audited capabilities and useful for KYB.
- The capability scrapes ariregister (the manifest flags `maintenance_class: scraping-stable-target`). Latency for E1 was 3.07s — noticeably slower than the direct-API capabilities (typically <1s). Worth a freshness/circuit-breaker note.

**Field notes:**
- **Schema-vs-reality mismatch:** `vat_number` declared in `output_schema` properties but populated `0/3`. Estonian KMKR can be derived (`EE` + 9 digits) — same gap as LV.
- **Structural source/schema gap (SI-style minor):** EE schema does NOT declare `registration_date` or `industry_code`. Both are visible at ariregister.rik.ee on the public-facing entity page; the capability scrape doesn't surface them. Capability-level gap, not source-level — the upstream has the data.
- No `directors` or `lei` fields in the EE schema. The Estonian e-Business Register exposes director ("juhatuse liige") and shareholder data on the public entity page; the capability does not surface it. Free-path direct-build candidate via the same scrape route, subject to the manifest's "blocked from certain IP ranges" caveat.

#### PL — polish-company-data (KRS via krs-pobierz.ms.gov.pl)

**Entities tested:**
- E1: PPHU MARTOM Sp. z o.o., krs_number `0000033945` (fixture, Sp. z o.o.)
- E2: ORLEN SPÓŁKA AKCYJNA, krs_number `0000028860` (SA)
- E3: KGHM POLSKA MIEDŹ SPÓŁKA AKCYJNA, krs_number `0000023302` (SA)

**Legal-form constraint:** 2 distinct forms (Sp. z o.o. + Spółka Akcyjna). Polish KRS also covers SK, SKA, SP, F (Foundation), Stowarzyszenie, but those are not represented in the entity sample.

**Anomalies:**
- **Two schema-vs-reality mismatches:** `address` and `registration_date` are both declared in `output_schema` properties but populated `null` for all 3 entities, including the canonical fixture (MARTOM). This is the most severe schema-vs-reality finding in the audit so far — 2 fields, including basic identity data, are promised but never delivered. Worth a code-level investigation: is the KRS scrape failing to extract these fields, or is it source-level?
- The fixture's manifest example output already shows `address: null` and `registration_date: null` — so this is a *known* gap in the manifest, not a regression. The capability ships with these fields declared in the schema despite the example admitting they're always null. Recommend either fixing the scrape or dropping from schema.
- The response includes 3 additional fields not declared in `output_schema.properties`: `nip` (Polish NIP tax number, 10 digits), `register_type` (`"commercial"` for all 3 — likely the KRS-vs-CEIDG-vs-Stowarzyszenie selector), and `share_capital` (e.g. `"1451177561,25 PLN"`). Schema-undercount, similar to FI.

**Field notes:**
- `vat_number` is derived from NIP (`PL` + NIP); 3/3 populated. Schema declares it.
- `legal_form` is populated 3/3 (`"SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ"`, `"SPÓŁKA AKCYJNA"`) — Polish-language label, not a code. Different vocabulary from CZ's `"121"` and FR's `"5800"`.
- `share_capital` is populated 3/3 with currency suffix — useful KYB signal, but not declared in schema (see above).
- No `directors` or `lei` fields in the PL schema. KRS exposes statutory representatives ("organ reprezentujący") via a separate section of the same scrape page. Free-path direct-build candidate; the scrape route already has access.

#### LV — latvian-company-data (Latvian Open Data Portal CKAN / data.gov.lv)

**Entities tested:**
- E1: Air Baltic Corporation AS, reg_number `40003245752` (fixture, AS = Akciju sabiedrība)
- E2: Akciju sabiedrība "Latvenergo", reg_number `40003032949` (AS)
- E3: "Latvijas Mobilais Telefons" SIA (LMT), reg_number `50003050931` (SIA = Sabiedrība ar ierobežotu atbildību / private LLC)

**Legal-form constraint:** 2 distinct forms (AS + SIA). data.gov.lv also covers IK (individual merchant), KS, PS, biedrība, but those are not represented in the entity sample.

**Anomalies:**
- Status string is `"Reģistrēts"` (Latvian for "registered") — yet another vocabulary in the cross-country status pattern.

**Field notes:**
- **Schema-vs-reality mismatch:** `vat_number` declared in `output_schema` properties but populated `0/3`. LV VAT (PVN) is derivable from `reg_number` for the 40NNN-prefix legal-entity range (PVN = `LV` + reg_number for those entities). The capability doesn't derive it. Either drop from schema or compute.
- **Structural source gap (SI-style minor):** `industry_code` (NACE) is NOT in the LV schema and not surfaced. data.gov.lv publishes a separate dataset with NACE codes that this capability doesn't ingest. Source has it; current capability doesn't. Capability-level gap.
- `sepa_creditor_id` populated 3/3 (`LV78ZZZ40003245752`, `LV61ZZZ40003032949`, `LV67ZZZ50003050931`) — unique to LV among audited capabilities. Useful for SEPA-payment KYB workflows.
- `atvk_code` populated 3/3 (Latvian administrative-territorial classification) — unique to LV.
- `register_type` is `"Komercreģistrs"` for all 3 (Commercial Register).
- No `directors` or `lei` fields in the LV schema. data.gov.lv publishes a separate dataset ("Patiesie labuma guvēji" — beneficial owners) per the manifest's coverage limitation. The director-equivalent ("amatpersonas" — officials) dataset is also published separately. Free-path direct-build candidate (both UBO and directors via separate CKAN ingest).

**CKAN-thinness hypothesis verdict for IE + LV:** *mostly refuted.* Both registries return rich identity fields (12+ each). SI's thinness is unique among the audited CKAN-based registries — SI's `data.gov.si` open subset is structurally narrower than IE's `opendata.cro.ie` and LV's `data.gov.lv`. The hypothesis that "CKAN-based open-data registries are SI-style thin" does not hold.

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

## Synthesis (partial — 15 of 20 countries)

### Countries with full directors coverage (empirically verified)

- **FR** — `directors` array populated 3/3 with role labels. `total_directors` reveals the true count (15–20 per entity); the payload-cap-at-3 is a Strale-side product decision, not a source limitation. INSEE/SIRENE supplies director data free of charge via api.gouv.fr.

**One country across 15 scored.** FR is still the only positive proof that a free public registry can populate `directors` end-to-end in the primary identity capability. The prior session's chat principle ("build directors wherever data is free") has 6 more concrete free-path build candidates after Batch 3 (see below).

### Countries with thin directors coverage (free-path direct-build candidates)

- **SE** — Bolagsverket HVD does not include directors. Would require a separate paid Bolagsverket service or a different free EU registry-direct integration. Direct-build candidate when/if HVD expansion ships.
- **UK** — Companies House `/officers` endpoint is free. Already exists as separate slug `uk-companies-house-officers`. Strategy decision: keep separate vs. fold inline.
- **NO** — Brønnøysund `/enheter/{orgnr}/roller` endpoint is free and well-documented. **Free-path direct-build candidate.**
- **CZ** — ARES exposes statutární orgán via a separate endpoint. **Free-path direct-build candidate.**
- **BE** — KBO/BCE does expose director data via FPS Economy SFTP feed. Current CBEAPI.be wrapper does not surface it. Direct-KBO-ingest candidate.
- **DK** — Schema-coverage cannot be determined until quota resets. CVR/Erhvervsstyrelsen does expose director data.
- **SG** — Directors require ACRA BizFile+ (paid). Not a free-path candidate; Cobalt-style aggregator route.
- **FI** *(Batch 3 finding)* — PRH `/bis/v1/{businessId}` exposes companyForms/registeredOffices/names in the payload. Director-equivalent data ("hallitus" / board roles) is available via a separate PRH endpoint. **Free-path direct-build candidate.**
- **IE** *(Batch 3 finding)* — CRO Open Data publishes a separate Directors dataset on opendata.cro.ie (CKAN). Likely the same fetch pattern as the existing `irish-company-data` capability. **Free-path direct-build candidate.**
- **EE** *(Batch 3 finding)* — e-Äriregister public entity page exposes "juhatuse liige" (board members). The current capability scrapes the entity page already, so adding director extraction is a single-source-extension, not a new integration. **Free-path direct-build candidate** (subject to the existing IP-block caveat for some ranges).
- **PL** *(Batch 3 finding)* — KRS scrape page already includes "organ reprezentujący" (representative body). Same scrape route. **Free-path direct-build candidate.**
- **LV** *(Batch 3 finding)* — data.gov.lv publishes a separate "amatpersonas" (officials) dataset and a "Patiesie labuma guvēji" (UBO) dataset. Both via CKAN. **Free-path direct-build candidate** (two siblings, not one).

**Tally:** of 15 scored, 1 has directors inline (FR), 11 are free-path direct-build candidates (SE/UK/NO/CZ/BE/FI/IE/EE/PL/LV/DK pending quota), 1 is paid-only (SG), 1 is structural-gap (SI), 1 is quota-blocked entirely (DE — schema declares directors, can't verify), 0 are explicitly out-of-scope.

### Countries with structural source gaps (SI-style — disclosure not build)

- **SI** — confirmed: status, registration date, industry code, directors, VAT, LEI all absent from the data.gov.si open subset. The DEC-20260513-F disclosure is accurate and load-bearing.

**CKAN-thinness hypothesis verdict:** *refuted.* Batch 3 tested IE (CRO Open Data CKAN) and LV (data.gov.lv CKAN) — both returned 12+ rich identity fields. SI's structural thinness is *unique* among the audited CKAN-based registries and traces to the data.gov.si open subset specifically, not to CKAN as an architecture. The other 14 countries — including 2 CKAN-based ones — have reasonable identity coverage.

### Countries with quota-blocked re-test (2)

- **DE** — OpenRegister 50/month free-tier exhausted on or before 2026-05-15 07:22Z. Schema supports directors and LEI; cannot be empirically scored until quota reset (2026-06-01) or Pro-tier upgrade.
- **DK** — cvrapi.dk 50/day free-tier exhausted before this audit's Batch 2 first call. Re-test viable after the daily reset (~2026-05-16).

Both are real operational signals worth investigating before the v1 launch.

### Schema-vs-reality mismatches (declared fields, empirically `0/3`)

Significant growth in this category across Batch 3 — 5 new findings + 2 from prior batches:

- **UK `vat_number`** (Batch 1) — Companies House profile does not return VAT. Drop or hook HMRC.
- **BE `industry`** (Batch 2) — CBEAPI.be does not surface NACE. Drop or direct-KBO ingest.
- **IE `vat_number`** *(Batch 3)* — CRO Open Data does not include VAT. Same shape as UK. Drop or hook Revenue VIES lookup.
- **EE `vat_number`** *(Batch 3)* — Äriregister does not surface KMKR. Derivable algorithmically (`EE` + 9 digits) but executor doesn't.
- **LV `vat_number`** *(Batch 3)* — `data.gov.lv` does not include PVN. Derivable for 40NNN-prefix entities but executor doesn't.
- **PL `address`** *(Batch 3)* — declared but `null` 3/3 across major listed entities. The fixture's example output also shows `null`, indicating a *known* known issue not fixed since manifest authoring. **Most severe mismatch in the audit** — basic identity field declared but never returned. Worth a code-level investigation: scrape bug or genuinely absent from KRS public page?
- **PL `registration_date`** *(Batch 3)* — same pattern as PL `address`. Declared, always null, fixture-acknowledged.

**Schema-undercount findings (reverse — capability returns more than schema declares):**
- **FI** *(Batch 3)* — returns `vat_number` (derived) and `website` but schema does not declare either. Add to schema.
- **PL** *(Batch 3)* — returns `nip`, `register_type`, `share_capital` but schema does not declare them. `nip` is the underlying tax-ID source for `vat_number` — declare both.

### Sibling directors/officers capabilities discovered

Same set as Batch 2 — no new country-scoped siblings exist for any of FI/IE/EE/PL/LV. Total inventory:
- `uk-companies-house-officers.ts` (UK-specific, free)
- `officer-search.ts` (multi-country, currently UK + US only per its docstring; EU was removed under DEC-20260427-I commercial-KYB scraping ban)
- `gleif-l2-ubo-lookup.ts` (global GLEIF, not country-scoped)

No country-scoped sibling exists for NO/DK/FR/BE/CZ/FI/IE/EE/PL/LV. Of these 10, all but DK/SG (paid) and FR (inline) are clean **free-path direct-build candidates** per the bullet list above. That's a build queue of ~9 capabilities, each likely small (sharing the underlying scrape/fetch route of the existing primary capability).

### Wire-shape inconsistencies — cross-country status + legal-form vocabulary

Tracked across 15 countries, the `status` field is anything but standardised:
- `"active"` — SE, NO, FI, CZ, FR, BE
- `"Registered"` — SG
- `"Reģistrēts"` — LV
- `"Normal"` — IE
- `"active"` — UK
- `"active"` — EE, PL (both surface the English word despite local-language elsewhere — executor-normalised likely)
- (DE/DK quota-blocked)

`legal_form` / `business_type` is also inconsistent:
- Numeric code: CZ (`"121"`), FR (`"5800"` / `"5599"`), EE for AS branch only (`"1"`)
- Human-readable label: SE (`"Aktiebolag"`), NO (`"Allmennaksjeselskap"`), UK (`"plc"`), IE (`"LTD - Private Company..."`), BE (`"Société anonyme"`), LV (`"Akciju sabiedrība"`), PL (`"SPÓŁKA AKCYJNA"`), FI (`"Public limited company"`), EE for OÜ branch (`"OÜ (Private limited company)"`)

EE's intra-capability inconsistency (numeric for AS, label for OÜ) is the worst case. Solutions filtering on legal form across countries currently need 15+ vocabulary-per-country maps. Worth a dedicated wire-shape normalisation pass before v1 launch.

### Follow-up Notion updates needed (surface in chat, not implemented here)

15-of-20 sample is now substantial:

- **Capability × Country Coverage Matrix:** any country other than FR currently claiming "directors" coverage should drop to "no" or "via sibling capability."
- **Capability × Country Coverage Matrix:** FR should be marked "yes (capped at 3, true count 15–20)".
- **Active Vendor Stack:** confirm DE/DK quota disclosures are accurately documented per current state.
- **Per-capability schema cleanups:** drop the 7 `0/3` declared fields (or implement what they promise) — UK/IE/EE/LV `vat_number`, BE `industry`, PL `address` + `registration_date`.
- **FI schema** should declare the returned `vat_number` and `website` (currently schema-undercount).
- **PL schema** should declare returned `nip`, `register_type`, `share_capital` (currently schema-undercount).
- **EE `business_type` bug:** intra-capability inconsistency (numeric vs label) is a real bug worth a fix-it task.

### Pilot — 15 countries scored, 5 remaining + Phase 2 + Phase 3

Remaining Phase 1 countries: CH, GR, HR, LT, SK. The pilot's findings on identifier validation, response schema variance, quota surfacing, and wire-shape inconsistency all carry over.

Methodology recommendations for the follow-up (Batch 4):
1. Run an HTTP HEAD on the relevant upstream endpoint for each entity's identifier *before* invoking the capability (cheaper than wallet-charged 404 path).
2. Use the prod API path (`POST /v1/do` with `inputs:` plural and `max_price_cents`) — verified across 3 batches.
3. Budget €0.75 wallet spend for the remaining 5 countries.
4. For DE specifically, do not re-test before 2026-06-01 unless Pro-tier upgrade has shipped. DK can be re-tested after the daily reset (~24h cycle).
5. **Add a `directors` discovery step to per-country detail.** When the schema doesn't declare directors, name the free upstream endpoint (or absence thereof) explicitly — this is the canonical input to Phase 4 (orchestration).
6. **Flag any new wire-shape vocabulary divergence** — particularly status and legal_form values. Batch 4 has CH (likely German/French labels), GR (Greek script likely), HR/LT/SK (each their own local conventions). Wire-shape vocabulary will probably grow.

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
11. **PL `address` + `registration_date` both `null` 3/3** *(Batch 3 finding)* — Most severe schema-vs-reality mismatch in the audit. The fixture's example output already shows these as null, so it's a known issue not fixed. Is the KRS scrape failing to extract these fields, or is the public KRS page genuinely missing them? Code-level investigation before v1.
12. **EE `business_type` intra-capability inconsistency** *(Batch 3 finding)* — AS-branch returns `"1"` (numeric code), OÜ-branch returns `"OÜ (Private limited company)"` (human label). Real bug. Pick one shape and normalise the other branch.
13. **FI / PL schema-undercount** *(Batch 3 finding)* — Both return fields not declared in `output_schema`. FI: `vat_number`, `website`. PL: `nip`, `register_type`, `share_capital`. Declare them. Easy schema wins.
14. **Build-queue prioritisation for directors siblings** *(Batch 3 finding)* — 9 free-path direct-build candidates surfaced across Batches 1+2+3 (SE/UK exists, NO/CZ/BE/FI/IE/EE/PL/LV available). Which order? Suggest scoring by: (a) likely KYB customer demand by jurisdiction, (b) capability-extension cost (same scrape route = cheap; new integration = costly), (c) wire-shape consistency wins. Worth a chat decision before Batch 4 surfaces another batch of candidates.
15. **CKAN-thinness hypothesis refuted** *(Batch 3 finding)* — IE and LV CKAN-based registries returned 12+ rich fields each. SI's structural thinness is unique to the data.gov.si open subset, not a CKAN-architecture issue. Worth correcting any prior briefing that implied otherwise.

---

*Generated by Claude Code session 2026-05-15 (three batches). Wallet spend: €1.95 total (€0.60 Batch 1 + €0.60 Batch 2 + €0.75 Batch 3). Worktree: strale-research, branch `docs/identity-field-coverage-2026-05-15`. No code changes, no DB changes, no PR.*
