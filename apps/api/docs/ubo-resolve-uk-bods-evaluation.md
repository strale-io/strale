# UBO Resolve UK — BODS v0.4 Evaluation

**Date:** 2026-04-02
**Status:** Evaluation only — no implementation

## Phase 1: Current Capability Audit

### Slug and location

- Slug: `beneficial-ownership-lookup` (not `ubo-resolve-uk` — the prompt used a hypothetical slug)
- File: `apps/api/src/capabilities/beneficial-ownership-lookup.ts`
- Solution: `enhanced-due-diligence` (chains with uk-company-data, sanctions-check, pep-check, adverse-media-check)
- Price: 25 cents
- SQS: 96.1 (QP: A/100, RP: A/93.8)
- Lifecycle: active

### Input

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| company_name | string | One required | Company name to search |
| company_number | string | One required | UK registration number |
| jurisdiction | string | No | Country code (default: "gb") |

### What it calls

1. `GET /search/companies?q={name}` — resolve name to company number (if number not provided)
2. `GET /company/{number}` — fetch company profile (name, status)
3. `GET /company/{number}/persons-with-significant-control` — fetch PSC register

All via Companies House API (`api.company-information.service.gov.uk`) with `COMPANIES_HOUSE_API_KEY` Basic auth.

Falls back to Claude Haiku LLM knowledge if API key is not set.

### Output fields

```json
{
  "company_name": "TESCO PLC",
  "company_number": "00445790",
  "jurisdiction": "gb",
  "company_status": "active",
  "beneficial_owners": [
    {
      "name": "Mr John Smith",
      "type": "individual",           // or "corporate", "legal_person"
      "nationality": "British",
      "country_of_residence": "England",
      "date_of_birth": { "month": 6, "year": 1970 },
      "ownership_level": "25-50%",    // parsed from natures_of_control
      "natures_of_control": [
        "ownership-of-shares-25-to-50-percent",
        "voting-rights-25-to-50-percent"
      ],
      "notified_on": "2016-04-06"
    }
  ],
  "total_beneficial_owners": 1,
  "has_psc_data": true,
  "data_source": "UK Companies House PSC Register"
}
```

### What it handles

| PSC Type | Handled? | Notes |
|----------|:--------:|-------|
| Individual PSC | Yes | Full data including nationality, DOB, residence |
| Corporate entity PSC | Yes | Type returned as "corporate" |
| Legal person PSC | Yes | Type returned as "legal_person" |
| PSC statements (no registrable person) | No | Not extracted from API response |
| Super-secure PSC | No | Not distinguished from regular PSCs |
| `natures_of_control` | Yes | Raw array preserved + parsed to ownership_level |
| `ceased_on` | **Filtered out** | Only active PSCs returned (ceased excluded) |
| Address | No | Present in API response but not included in output |

### What's missing for BODS

1. **Ceased PSCs excluded** — BODS needs historical records with `endDate`
2. **No address in output** — BODS person statements require address
3. **No PSC statement types** — "no registrable person" declarations not captured
4. **No corporate entity identification** — when PSC is a corporate entity, Companies House provides `identification.legal_authority`, `identification.registration_number` which BODS needs for entity cross-referencing
5. **No stable identifiers** — no deterministic IDs for deduplication

### Test coverage

10 test suites (SQS 96.1):
- known_answer (Tier B): Tesco PLC by number
- schema_check (4x, Tier B): Various validation scenarios
- dependency_health (Tier A): API connectivity
- negative (Tier B): Empty input handling
- edge_case (Tier C): Empty field edge cases
- known_bad (Tier B): Invalid inputs
- piggyback (Tier A): Live traffic monitoring

## Phase 2: BODS v0.4 Mapping Design

### Statement generation

For each API call, the BODS output produces:

| Input | Entity statements | Person statements | Relationship statements | Total |
|-------|:-:|:-:|:-:|:-:|
| Company with 1 individual PSC | 1 | 1 | 1 | 3 |
| Company with 1 corporate PSC | 2 | 0 | 1 | 3 |
| Company with 3 mixed PSCs | 1 + N_corp | N_individual | N_total | varies |
| Company with no PSCs | 1 | 0 | 0 | 1 + annotation |

### natures_of_control → BODS interest type mapping

| Companies House nature | BODS interestType | share.minimum | share.maximum |
|----------------------|-------------------|:---:|:---:|
| ownership-of-shares-25-to-50-percent | shareholding | 25 | 50 |
| ownership-of-shares-50-to-75-percent | shareholding | 50 | 75 |
| ownership-of-shares-75-to-100-percent | shareholding | 75 | 100 |
| ownership-of-shares-more-than-25-percent-registered-overseas-entity | shareholding | 25 | 100 |
| voting-rights-25-to-50-percent | votingRights | 25 | 50 |
| voting-rights-50-to-75-percent | votingRights | 50 | 75 |
| voting-rights-75-to-100-percent | votingRights | 75 | 100 |
| right-to-appoint-and-remove-directors | rightToAppointAndRemoveDirectors | — | — |
| significant-influence-or-control | significantInfluenceOrControl | — | — |
| right-to-share-surplus-assets-* | rightToShareSurplusAssets | band | band |
| part-right-to-share-surplus-assets-* | rightToShareSurplusAssets | band | band |

### Identifier schemes

| Entity type | recordId format | Scheme |
|-------------|----------------|--------|
| UK company | `GB-COH-{companyNumber}` | GB-COH |
| Individual PSC | `gb-psc-{sha256(name+dob+notifiedOn)[:16]}` | (synthetic) |
| Corporate entity PSC | `{identification.legal_authority}-{registration_number}` | varies |
| Unknown corporate | `gb-psc-corp-{sha256(name+notifiedOn)[:16]}` | (synthetic) |

### statementId generation

Deterministic UUIDv5 using namespace `6ba7b810-9dad-11d1-80b4-00c04fd430c8` (URL namespace):
- Entity: `uuidv5(ns, "gb-coh:" + companyNumber)`
- Person: `uuidv5(ns, "gb-psc:" + name + ":" + dob + ":" + notifiedOn)`
- Relationship: `uuidv5(ns, "gb-psc-rel:" + companyNumber + ":" + pscRecordId)`

### ceased_on handling

If a PSC has `ceased_on`, the relationship statement's interest gets:
```json
{ "endDate": "2023-06-15" }
```

Currently the capability filters out ceased PSCs entirely. For BODS output, we'd need to include them.

## Phase 3: Implementation Recommendation

### Effort estimate

~150-200 lines of code for a `toBODS()` transform function:
- 40 lines: nature-of-control → interest type mapping table
- 30 lines: entity statement builder
- 30 lines: person statement builder
- 30 lines: relationship statement builder
- 20 lines: corporate entity PSC handling
- 20 lines: ID generation (uuidv5 + hashing)
- 20 lines: ceased PSC handling + annotation

The transform sits entirely downstream of the existing API calls. No changes to the Companies House integration. The only change to the core capability is:
1. Accept optional `format: "bods"` input
2. When requested, also fetch ceased PSCs (remove the `!item.ceased_on` filter)
3. Run `toBODS()` on the full PSC list and append to output

### Input change

Add optional field:
```json
{ "format": { "type": "string", "enum": ["standard", "bods"], "description": "Output format. 'bods' adds BODS v0.4 statements." } }
```

### Output change (backward compatible)

When `format: "bods"`:
```json
{
  "...all existing fields...",
  "bods_statements": [ ...array of BODS statements... ],
  "bods_version": "0.4.0",
  "bods_schema": "https://standard.openownership.org/en/0.4.0/schema/"
}
```

When `format` is absent or `"standard"`: output unchanged.

### Test plan

1. Individual PSC → 3 statements (entity + person + relationship)
2. Corporate entity PSC → 3 statements (2 entities + relationship)
3. Multiple mixed PSCs → correct count and cross-references
4. Ceased PSC → relationship has endDate
5. No PSCs filed → entity statement + annotation
6. Statement ID determinism → same input always produces same IDs
7. Interest type mapping → each nature_of_control maps correctly

### Recommendation: DEFER

**Do not implement now.** Reasons:

1. **No known user demand.** Zero external users have called `beneficial-ownership-lookup` outside of test traffic. Adding BODS output to a capability nobody uses yet is premature.

2. **The existing output is sufficient for the current use case.** The `enhanced-due-diligence` solution chains this capability with sanctions/PEP checks — it needs the beneficial owner names and ownership levels, not BODS-formatted statements.

3. **BODS becomes valuable at multi-country scale.** When we expand UBO resolution to Nordic registries (Bolagsverket, Brønnøysund, PRH), EU registries, and the forthcoming EU Beneficial Ownership Interconnection System (BORIS), then BODS v0.4 becomes genuinely useful as a cross-border interoperability format. Implementing it for UK-only is premature.

4. **Low effort when needed.** The mapping is straightforward (~150-200 lines, pure transform, no API changes). Can be added in 1-2 hours when demand materializes.

**When to revisit:**
- A user or prospective customer asks for BODS output
- We expand UBO to 3+ jurisdictions and need a common format
- Open Ownership or a government body lists Strale as a data provider (requires BODS compliance)

## References

- BODS v0.4 specification: https://standard.openownership.org/en/0.4.0/
- BODS data model: https://standard.openownership.org/en/0.4.0/schema/
- BODS UK PSC pipeline (reference implementation): https://github.com/openownership/bods-uk-psc-pipeline
- Companies House PSC API: https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/persons-with-significant-control
- BODS interest types codelist: https://standard.openownership.org/en/0.4.0/schema/codelists/#interesttype
