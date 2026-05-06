# Live European registry coverage audit — 2026-05-06

Run started: `2026-05-06T07:11:51.941Z`
Branch: `audit/live-registry-coverage-2026-05-06`
Driver: `apps/api/src/scripts/audit-live-registries.ts`
Halted mid-run: `false`

## 1. Headline summary

Of 16 European registry capabilities flagged 🟢 Live in the Active Vendor Stack page, 16 were exercised against a known-good test entity in this run. **15** returned a 2xx with a parseable payload; **1** returned a handler error or timeout; **4** of the successes had at least one manifest-declared `guaranteed` field absent from the response. 

## 2. Inventory

| Country | Slug | Data source | Maintenance class | Manifest fields declared |
|---|---|---|---|---|
| SE | `swedish-company-data` | Bolagsverket Värdefulla datamängder API (Swedish Companies Registration Office, EU Open Data Directive HVD) | free-stable-api | 18 |
| NO | `norwegian-company-data` | Brønnøysund Register Centre (Norway) | free-stable-api | 8 |
| DK | `danish-company-data` | CVR / Danish Business Authority (Erhvervsstyrelsen) | free-stable-api | 8 |
| FI | `finnish-company-data` | PRH / Finnish Patent and Registration Office | free-stable-api | 7 |
| UK | `uk-company-data` | Companies House (UK Government) | commercial-stable-api | 6 |
| IE | `irish-company-data` | CRO Open Data Portal (opendata.cro.ie) — CKAN datastore_search API | free-stable-api | 15 |
| FR | `french-company-data` | INSEE / Registre du Commerce (France) | free-stable-api | 7 |
| BE | `belgian-company-data` | CBEAPI.be (vendor wrapper of KBO/BCE Crossroads Bank for Enterprises) | free-stable-api | 12 |
| CZ | `cz-company-data` | ARES (Czech Ministry of Finance) | free-stable-api | 10 |
| EE | `estonian-company-data` | Äriregister / Estonian Business Register | scraping-stable-target | 5 |
| PL | `polish-company-data` | KRS / Krajowy Rejestr Sądowy (Polish National Court Register) | scraping-stable-target | 6 |
| LV | `latvian-company-data` | Latvian Open Data Portal (data.gov.lv) — Uzņēmumu reģistra atvērtie dati CKAN datastore_search API | free-stable-api | 13 |
| LT | `lithuanian-company-data` | Lithuanian Open Data Portal (data.gov.lt) — Registrų centras / JAR Spinta JSON API | free-stable-api | 12 |
| HR | `croatian-company-data` | Sudski registar REST API — Ministarstvo pravosuđa i uprave (Croatian Court Register) | free-stable-api | 16 |
| GR | `greek-company-data` | GEMI Open Data API — Γενικό Εμπορικό Μητρώο (Greek Business Registry) | free-stable-api | 12 |
| CH | `swiss-company-data` | Zefix PublicREST API (Federal Office of Justice, Switzerland) | scraping-stable-target | 15 |

## 3. Per-capability results

### SE — `swedish-company-data`

- Test entity: **H&M Hennes & Mauritz AB** (`556042-7220`)
- Status: `success`
- Latency: 565ms
- Summary: success — 18 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `status` | guaranteed | populated |
| `is_active` | guaranteed | populated |
| `sni_codes` | guaranteed | populated |
| `legal_form` | common | populated |
| `org_number` | guaranteed | populated |
| `vat_number` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `company_type` | guaranteed | populated |
| `country_code` | guaranteed | populated |
| `legal_form_code` | common | populated |
| `registered_date` | guaranteed | populated |
| `alternative_names` | guaranteed | empty_array |
| `company_type_code` | guaranteed | populated |
| `deregistered_date` | rare | null |
| `ongoing_procedures` | guaranteed | empty_array |
| `registered_address` | common | populated |
| `business_description` | common | populated |
| `deregistration_reason` | rare | null |

Notes:
- 2 guaranteed field(s) not populated: alternative_names=empty_array, ongoing_procedures=empty_array

### NO — `norwegian-company-data`

- Test entity: **Equinor ASA** (`923609016`)
- Status: `success`
- Latency: 270ms
- Summary: success — 10 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `status` | guaranteed | populated |
| `address` | guaranteed | populated |
| `org_number` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `business_type` | guaranteed | populated |
| `industry_code` | guaranteed | populated |
| `employee_count` | guaranteed | populated |
| `registration_date` | guaranteed | populated |

Undeclared keys returned (in payload but not in manifest `output_field_reliability`): `industry_description`, `vat_number`

Notes:
- 2 undeclared field(s) returned: industry_description, vat_number

### DK — `danish-company-data`

- Test entity: **A.P. Møller-Mærsk A/S** (`22756214`)
- Status: `handler_error`
- Latency: 176ms
- Summary: The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours.

### FI — `finnish-company-data`

- Test entity: **Nokia Oyj** (`0112038-9`)
- Status: `success`
- Latency: 1174ms
- Summary: success — 10 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `status` | guaranteed | populated |
| `address` | common | populated |
| `business_id` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `business_type` | guaranteed | populated |
| `industry_code` | guaranteed | populated |
| `registration_date` | guaranteed | populated |

Undeclared keys returned (in payload but not in manifest `output_field_reliability`): `industry_description`, `website`, `vat_number`

Notes:
- 3 undeclared field(s) returned: industry_description, website, vat_number

### UK — `uk-company-data`

- Test entity: **AstraZeneca PLC** (`02723534`)
- Status: `success`
- Latency: 224ms
- Summary: success — 10 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `status` | guaranteed | populated |
| `address` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `business_type` | guaranteed | populated |
| `company_number` | guaranteed | populated |
| `incorporation_date` | guaranteed | populated |

Undeclared keys returned (in payload but not in manifest `output_field_reliability`): `jurisdiction`, `dissolution_date`, `sic_codes`, `has_charges`

Notes:
- 4 undeclared field(s) returned: jurisdiction, dissolution_date, sic_codes, has_charges

### IE — `irish-company-data`

- Test entity: **Ryanair Holdings PLC** (`249885`)
- Status: `success`
- Latency: 193ms
- Summary: success — 15 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `company_name` | guaranteed | populated |
| `cro_number` | guaranteed | populated |
| `company_type` | guaranteed | populated |
| `status` | guaranteed | populated |
| `address` | common | populated |
| `eircode` | rare | null |
| `registration_date` | guaranteed | populated |
| `last_annual_return_date` | common | populated |
| `next_annual_return_date` | common | populated |
| `last_accounts_date` | rare | populated |
| `status_date` | rare | null |
| `dissolution_date` | rare | null |
| `nace_v2_code` | rare | null |
| `principal_object_code` | common | populated |
| `jurisdiction` | guaranteed | populated |

### FR — `french-company-data`

- Test entity: **TotalEnergies SE** (`542051180`)
- Status: `success`
- Latency: 222ms
- Summary: success — 13 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `siren` | guaranteed | populated |
| `siret` | guaranteed | populated |
| `status` | guaranteed | populated |
| `address` | guaranteed | populated |
| `directors` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `activity_code` | guaranteed | populated |

Undeclared keys returned (in payload but not in manifest `output_field_reliability`): `business_type`, `city`, `postal_code`, `creation_date`, `employee_range`, `vat_number`

Notes:
- 6 undeclared field(s) returned: business_type, city, postal_code, creation_date, employee_range, vat_number

### BE — `belgian-company-data`

- Test entity: **Anheuser-Busch InBev SA/NV** (`0417497106`)
- Status: `success`
- Latency: 310ms
- Summary: success — 12 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `company_name` | guaranteed | populated |
| `registration_number` | guaranteed | populated |
| `status` | guaranteed | populated |
| `business_type` | guaranteed | populated |
| `address` | common | populated |
| `registration_date` | common | populated |
| `industry` | rare | null |
| `directors` | guaranteed | empty_array |
| `establishments_count` | guaranteed | populated |
| `abbreviation` | rare | populated |
| `commercial_name` | rare | null |
| `vat_number` | guaranteed | populated |

Notes:
- 1 guaranteed field(s) not populated: directors=empty_array

### CZ — `cz-company-data`

- Test entity: **ČEZ a.s.** (`45274649`)
- Status: `success`
- Latency: 139ms
- Summary: success — 10 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `ico` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `address` | guaranteed | populated |
| `legal_form_code` | guaranteed | populated |
| `vat_number` | guaranteed | populated |
| `nace_codes` | guaranteed | populated |
| `registration_date` | guaranteed | populated |
| `last_updated` | guaranteed | populated |
| `status` | guaranteed | populated |
| `primary_source` | guaranteed | populated |

### EE — `estonian-company-data`

- Test entity: **Tallink Grupp AS** (`10238429`)
- Status: `success`
- Latency: 2221ms
- Summary: success — 8 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `status` | guaranteed | populated |
| `address` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `business_type` | guaranteed | populated |
| `registry_code` | guaranteed | populated |

Undeclared keys returned (in payload but not in manifest `output_field_reliability`): `zip_code`, `historical_names`, `registry_url`

Notes:
- 3 undeclared field(s) returned: zip_code, historical_names, registry_url

### PL — `polish-company-data`

- Test entity: **PKN Orlen S.A.** (`0000028860`)
- Status: `success`
- Latency: 738ms
- Summary: success — 10 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `status` | guaranteed | populated |
| `address` | guaranteed | null |
| `krs_number` | guaranteed | populated |
| `legal_form` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `registration_date` | guaranteed | null |

Undeclared keys returned (in payload but not in manifest `output_field_reliability`): `nip`, `vat_number`, `register_type`, `share_capital`

Notes:
- 2 guaranteed field(s) not populated: address=null, registration_date=null
- 4 undeclared field(s) returned: nip, vat_number, register_type, share_capital

### LV — `latvian-company-data`

- Test entity: **airBaltic Corporation AS** (`40003245752`)
- Status: `success`
- Latency: 398ms
- Summary: success — 13 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `company_name` | guaranteed | populated |
| `reg_number` | guaranteed | populated |
| `company_type` | guaranteed | populated |
| `company_type_code` | guaranteed | populated |
| `register_type` | guaranteed | populated |
| `status` | guaranteed | populated |
| `address` | common | populated |
| `postal_index` | common | populated |
| `registration_date` | guaranteed | populated |
| `termination_date` | rare | null |
| `sepa_creditor_id` | common | populated |
| `atvk_code` | common | populated |
| `jurisdiction` | guaranteed | populated |

### LT — `lithuanian-company-data`

- Test entity: **Telia Lietuva AB** (`121215434`)
- Status: `success`
- Latency: 702ms
- Summary: success — 12 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `company_name` | guaranteed | populated |
| `company_code` | guaranteed | populated |
| `legal_form` | guaranteed | populated |
| `legal_form_en` | common | populated |
| `legal_form_type` | common | populated |
| `status` | guaranteed | populated |
| `status_en` | common | populated |
| `status_date` | guaranteed | populated |
| `registration_date` | guaranteed | populated |
| `deregistration_date` | rare | null |
| `is_active` | guaranteed | populated |
| `jurisdiction` | guaranteed | populated |

### HR — `croatian-company-data`

- Test entity: **INA d.d.** (`27759560625`)
- Status: `success`
- Latency: 527ms
- Summary: success — 16 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `oib` | guaranteed | populated |
| `mbs` | guaranteed | populated |
| `status` | guaranteed | populated |
| `status_code` | guaranteed | populated |
| `company_name` | guaranteed | populated |
| `legal_form` | guaranteed | populated |
| `legal_form_abbr` | guaranteed | populated |
| `vat_number` | guaranteed | populated |
| `country_code` | guaranteed | null |
| `mb` | common | populated |
| `potpuni_mbs` | common | populated |
| `address` | common | populated |
| `main_activity_code` | common | populated |
| `registered_date` | common | populated |
| `short_name` | common | populated |
| `email` | rare | populated |

Notes:
- 1 guaranteed field(s) not populated: country_code=null

### GR — `greek-company-data`

- Test entity: **National Bank of Greece S.A.** (`237901000`)
- Status: `success`
- Latency: 2967ms
- Summary: success — 12 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `company_name` | guaranteed | populated |
| `org_number` | guaranteed | populated |
| `vat_number` | common | populated |
| `afm` | common | populated |
| `business_type` | guaranteed | populated |
| `address` | common | populated |
| `registration_date` | common | populated |
| `industry_code` | common | populated |
| `industry_description` | common | populated |
| `status` | guaranteed | populated |
| `directors` | common | populated |
| `is_branch` | guaranteed | populated |

### CH — `swiss-company-data`

- Test entity: **Nestlé S.A.** (`CHE-105.909.036`)
- Status: `success`
- Latency: 305ms
- Summary: success — 16 fields returned

| Declared field | Reliability | Observed |
|---|---|---|
| `company_name` | guaranteed | populated |
| `uid` | guaranteed | populated |
| `ehraid` | guaranteed | populated |
| `ch_id` | common | populated |
| `legal_form` | guaranteed | populated |
| `status` | guaranteed | populated |
| `canton` | common | null |
| `municipality` | common | null |
| `address` | common | populated |
| `purpose` | rare | populated |
| `registration_date` | common | populated |
| `deletion_date` | rare | null |
| `data_source` | guaranteed | populated |
| `data_source_url` | guaranteed | populated |
| `data_attribution` | guaranteed | populated |

Undeclared keys returned (in payload but not in manifest `output_field_reliability`): `legal_form_id`

Notes:
- 1 undeclared field(s) returned: legal_form_id

## 4. Cross-capability findings

(See the per-capability sections above for the raw observations. The patterns below are derived from those.)

Manifest-declared `guaranteed` fields observed missing/null/empty:

- `alternative_names (empty_array)` — affects 1 capability/ies: `swedish-company-data`
- `ongoing_procedures (empty_array)` — affects 1 capability/ies: `swedish-company-data`
- `directors (empty_array)` — affects 1 capability/ies: `belgian-company-data`
- `address (null)` — affects 1 capability/ies: `polish-company-data`
- `registration_date (null)` — affects 1 capability/ies: `polish-company-data`
- `country_code (null)` — affects 1 capability/ies: `croatian-company-data`

- **7 capability/ies returned keys not declared in manifest `output_field_reliability`.** This is benign drift but means the manifest is not the full contract — see per-capability sections for the field lists.

## 5. Suggested follow-up actions

(Enumeration only — no follow-ups executed by this prompt.)

1. **`danish-company-data` (DK)** is failing on a known-good entity: `The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours.`. Investigate root cause (env var, upstream API change, auth token rotation, etc.). If the registry is genuinely down, the source-health row and the Active Vendor Stack page need a separate prompt to update. Until then, every customer call routed here is failing.
2. **`swedish-company-data` (SE)** returned a 2xx but 2 `guaranteed` field(s) are not populated for the test entity (`alternative_names` → empty_array, `ongoing_procedures` → empty_array). Either: (a) downgrade the manifest's `output_field_reliability` for those fields from `guaranteed` to `common`/`rare` if the registry legitimately omits them for some entities, or (b) fix the handler if the field IS available upstream and we're failing to extract it.
3. **`norwegian-company-data` (NO)** returns 2 undeclared key(s) (`industry_description`, `vat_number`). Add to manifest `output_field_reliability` with appropriate tier, or remove from the handler output if unintentional.
4. **`finnish-company-data` (FI)** returns 3 undeclared key(s) (`industry_description`, `website`, `vat_number`). Add to manifest `output_field_reliability` with appropriate tier, or remove from the handler output if unintentional.
5. **`uk-company-data` (UK)** returns 4 undeclared key(s) (`jurisdiction`, `dissolution_date`, `sic_codes`, `has_charges`). Add to manifest `output_field_reliability` with appropriate tier, or remove from the handler output if unintentional.
6. **`french-company-data` (FR)** returns 6 undeclared key(s) (`business_type`, `city`, `postal_code`, `creation_date`, `employee_range`, `vat_number`). Add to manifest `output_field_reliability` with appropriate tier, or remove from the handler output if unintentional.
7. **`belgian-company-data` (BE)** returned a 2xx but 1 `guaranteed` field(s) are not populated for the test entity (`directors` → empty_array). Either: (a) downgrade the manifest's `output_field_reliability` for those fields from `guaranteed` to `common`/`rare` if the registry legitimately omits them for some entities, or (b) fix the handler if the field IS available upstream and we're failing to extract it.
8. **`estonian-company-data` (EE)** returns 3 undeclared key(s) (`zip_code`, `historical_names`, `registry_url`). Add to manifest `output_field_reliability` with appropriate tier, or remove from the handler output if unintentional.
9. **`polish-company-data` (PL)** returned a 2xx but 2 `guaranteed` field(s) are not populated for the test entity (`address` → null, `registration_date` → null). Either: (a) downgrade the manifest's `output_field_reliability` for those fields from `guaranteed` to `common`/`rare` if the registry legitimately omits them for some entities, or (b) fix the handler if the field IS available upstream and we're failing to extract it.
10. **`polish-company-data` (PL)** returns 4 undeclared key(s) (`nip`, `vat_number`, `register_type`, `share_capital`). Add to manifest `output_field_reliability` with appropriate tier, or remove from the handler output if unintentional.
11. **`croatian-company-data` (HR)** returned a 2xx but 1 `guaranteed` field(s) are not populated for the test entity (`country_code` → null). Either: (a) downgrade the manifest's `output_field_reliability` for those fields from `guaranteed` to `common`/`rare` if the registry legitimately omits them for some entities, or (b) fix the handler if the field IS available upstream and we're failing to extract it.
12. **`swiss-company-data` (CH)** returns 1 undeclared key(s) (`legal_form_id`). Add to manifest `output_field_reliability` with appropriate tier, or remove from the handler output if unintentional.

## Methodology

- Driver: `apps/api/src/scripts/audit-live-registries.ts`
- Each capability invoked in-process via `getExecutor(slug)(input)` (transparent provider-chain handling preserved).
- 30-second outer timeout per call (handlers may impose shorter inner timeouts); field classification: `populated` (any non-null/non-empty), `null`, `missing` (key absent from payload), `empty_string`, `empty_array`.
- `DATABASE_URL` force-cleared at script start (after dotenv) so `autoRegisterCapabilities()` skips its Phase 3 catalog-sync UPDATE. No DB writes performed during the audit.
- No paid third-party legs invoked (verified pre-run from manifest `maintenance_class` + handler `data_source`).
- Read-only: no source-health rows updated, no manifest edits, no handler edits, no routing-engine changes.

### Reproduction

Run with **production registry credentials** so per-registry env vars (e.g. `COMPANIES_HOUSE_API_KEY`, `SUDREG_CLIENT_ID/SECRET`, `ZEFIX_USERNAME/PASSWORD`, `BOLAGSVERKET_CLIENT_ID/SECRET`) are present:

```
cd apps/api
railway run --service strale npx tsx src/scripts/audit-live-registries.ts \
  --report=../../docs/research/<YYYY-MM-DD>-live-registry-coverage-audit.md \
  --json=../../docs/research/<YYYY-MM-DD>-live-registry-coverage-audit.json
```

Without `railway run` (i.e. against just `apps/api/.env`) the run will produce false-positive `handler_error` rows for any registry whose credentials are not in the local `.env`. The script's `delete process.env.DATABASE_URL` line still fires under `railway run`, so the prod DB is still untouched.
