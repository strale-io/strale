# Identity field-coverage audit — 2026-05-15

**Status:** Phase 1 pilot only. 5 of 20 countries scored. Phase 2 (SI Openapi WW-Top probe) and Phase 3 (US Topograph-listed state scout) deferred to follow-up sessions per session scoping.

**Purpose:** Empirical follow-up to DEC-20260513-F's "20/20 v1-ready" verdict. DEC-20260513-F's certification rests on canonical-input fixture validation (one entity per capability) plus 24h canary green-rate for DK and DE only. This pilot tests whether the "v1-ready" verdict holds when the capability is probed with multiple real entities (not just the fixture), and quantifies which canonical-identity fields populate at what rate across entity samples.

**Pilot countries (5):** SE, UK, DE, SI, SG. Chosen to cover Nordics baseline, UK identifier quirks, OpenRegister free-tier quota surfacing, the known SI structural gap, and a non-EU sanity check.

**Methodology:** prod API at `https://strale-production.up.railway.app/v1/do` with test API key `sk_live_0d56f39c`. 3 real entities per country: canonical fixture (the `known_answer.input` per DEC-20260513-F) plus 2 well-known publicly-listed or otherwise large entities from the same jurisdiction. Identifiers validated against each capability's input schema before invocation.

**Total cost:** €0.60 (12 successful calls × €0.05). 3 calls failed without wallet charge (1 bad identifier in UK pilot, 1 quota exhaustion in DE, 1 circuit-breaker block in DE). Wallet balance moved from €33.99 → €33.39. Well within the €10 hard cap.

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
| SE      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 3/3 (SNI)     | 3/3 | –   |
| UK      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | 2/3 (SIC)     | 0/3 | –   |
| DE      | quota     | quota | quota  | quota    | quota   | quota      | quota     | quota         | –   | quota |
| SI      | 3/3       | 3/3   | –      | –        | 3/3     | 3/3        | –         | –             | –   | –   |
| SG      | 3/3       | 3/3   | 3/3    | 3/3      | 3/3     | 3/3        | –         | –             | –   | –   |

### Reading the matrix

- **`X/3`** — schema supports the field; X of 3 entities populated it.
- **`–`** — capability's response schema does not include the field.
- **`quota`** — capability execution blocked (DE, OpenRegister free-tier exhausted + circuit breaker open). Schema supports the field (DE schema declares `directors`, `lei`, `industry_codes`) but no empirical data was gathered this session.

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

## Synthesis (partial — 5 of 20 countries)

### Countries with full directors coverage (in this pilot)

**None.** SE, UK, SI, SG capabilities do not return directors in their schema. DE schema *declares* `directors` but could not be empirically scored this session due to OpenRegister quota exhaustion. DE is the only country in the pilot where the directors-coverage question is open pending re-test.

This is consistent with the prior session's chat principle that "build directors wherever data is free" is a forward-looking commitment, not a v1 reality.

### Countries with thin directors coverage (free-path direct-build candidates)

- **SE** — Bolagsverket HVD does not include directors. Would require a separate paid Bolagsverket service or a different free EU registry-direct integration. Bolagsverket's full Värdefulla datamängder API roadmap includes director data per the EU HVD directive, but not in the current open subset. Direct-build candidate when/if HVD expansion ships.
- **UK** — Companies House `/officers` endpoint is free and well-documented. The `uk-companies-house-officers` capability already exists (separate slug) per the manifests listing. Strategy decision: keep officers separate, or fold into `uk-company-data`? Currently separate, which preserves caller intent but doubles per-customer call cost.
- **SG** — Directors require ACRA BizFile+ (paid). Not a free-path direct-build candidate. Customer would pay BizFile+ via Cobalt-style aggregator or BYO credentials.

### Countries with structural source gaps (SI-style — disclosure not build)

- **SI** — confirmed: status, registration date, industry code, directors, VAT, LEI all absent from the data.gov.si open subset. Per-entity consistent across both d.d. and d.o.o. forms. The DEC-20260513-F disclosure is accurate and load-bearing. No build path until AJPES restPrsInfo contract or EU HVD expansion.

The other 4 pilot countries are *not* in the SI bucket — they return reasonable v1 identity fields for their schemas. UK's missing VAT and SG's missing industry code are gaps but narrower than SI's structural absence.

### Countries with quota-blocked re-test (1)

- **DE** — OpenRegister 50/month free-tier exhausted on or before 2026-05-15 07:22Z. Circuit breaker tripped. Schema supports directors and LEI; cannot be empirically scored until quota reset (2026-06-01) or Pro-tier upgrade. This is a real operational signal worth investigating before the v1 launch.

### Follow-up Notion updates needed (surface in chat, not implemented here)

The pilot has not yet surfaced any direct contradiction with the Capability × Country Coverage Matrix or Active Vendor Stack pages. The 5-country sample is too small. Expected drift to surface in the full follow-up session:

- If SE / UK / SG matrix entries claim "directors" coverage today, they should drop to "no" — this audit confirms none of them return directors.
- DE's quota exhaustion is worth a Decision-DB cross-reference: is DEC-20260508-D (free-tier disclosure) still the current standing, or has the quota situation been re-evaluated since? Chat to check.

### Pilot — 15 countries + Phase 2 + Phase 3 remaining

Remaining Phase 1 countries: NO, DK, FI, IE, FR, BE, CZ, EE, PL, LV, LT, SK, HR, GR, CH. The pilot's findings on identifier validation, response schema variance, and quota surfacing all carry over.

Methodology recommendations for the follow-up:
1. Run an HTTP HEAD on Companies House or equivalent for each entity's identifier *before* invoking the capability (cheaper than the wallet-charged not-found error path).
2. Use the prod API path (`POST /v1/do` with `inputs:` plural and `max_price_cents`) — verified working.
3. Budget €0.75 wallet spend per 5-country batch at current pricing. Below €5 for the remaining 15 countries.
4. For DE specifically, do not re-test before 2026-06-01 unless Pro-tier upgrade has shipped.

---

## Open questions for chat

1. **DE quota** — was the 50/month allowance consumed by customer traffic or by health probes? Pull the May call log on `german-company-data` from the transactions table to determine. If health probes, retune the schedule (probes shouldn't burn paid quota — Principle A in CLAUDE.md). If customer traffic, the Pro-tier decision per DEC-20260505-H is hot.
2. **UK `vat_number` field** — declared in output_schema but empirically `0/3` populated across this pilot. Either drop from schema (don't promise what isn't returned) or hook the HMRC VAT-by-CRN lookup. Suggest adding to the v1 launch punch list.
3. **SG status vocabulary** — returns `"Registered"` not `"active"`. Cross-country status normalization is a separate workstream; flag for the wire-shape consistency review.
4. **SE registered_address completeness** — Volvo's `street` is null. Is this consistent across older AB entries (pre-1950 registration)? Worth a sanity check against another pre-1950 entity in the follow-up.
5. **Methodology — directors-aware scoring** — should the follow-up score `directors` as `–` (schema gap) or as `0/3` (build gap)? This pilot used `–` consistently; chat to confirm before applying to the remaining 15 countries.

---

*Generated by Claude Code session 2026-05-15. Wallet spend: €0.60. Worktree: strale-research at 5c22c77. No code changes, no DB changes, no PR.*
