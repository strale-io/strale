# LEI Provider Evaluation
**Date:** 2026-04-09 (Stockholm time)
**Status:** Research complete — **GLEIF is sufficient, no commercial provider needed**

## Critical Finding

**Robert Bosch GmbH DOES have an LEI in GLEIF: `529900F0LT5OP4SV6122`**

The parent manufacturing entity is registered as "Robert Bosch Gesellschaft mit beschränkter Haftung" (full German legal form). Our `lei-lookup` searched for "Robert Bosch GmbH" using `filter[entity.legalName]`, which is an exact-match filter that didn't expand the abbreviation.

| Query | GLEIF result |
|-------|-------------|
| "Robert Bosch GmbH" | Returns subsidiaries only (Krankenhaus, College, etc.) |
| "Robert Bosch Gesellschaft mit beschränkter Haftung" | Returns the correct parent entity (LEI: 529900F0LT5OP4SV6122) |
| Direct LEI lookup 529900F0LT5OP4SV6122 | Active, Robert-Bosch-Platz 1, Gerlingen, DE |

**This is a name normalization bug in our code, not a GLEIF coverage gap.**

## The Fix (not a provider switch)

The fix is to expand German legal form abbreviations before querying GLEIF:
- "GmbH" → also try "Gesellschaft mit beschränkter Haftung"
- "AG" → also try "Aktiengesellschaft"  
- "KG" → also try "Kommanditgesellschaft"
- "SE" → keep as-is (Societas Europaea is already the full form)

Same pattern needed for other languages:
- "BV" → "Besloten Vennootschap" (Dutch)
- "NV" → "Naamloze Vennootschap" (Dutch)
- "SA" → "Société Anonyme" (French)
- "AB" → "Aktiebolag" (Swedish)

This is a ~30-line code change in `lei-lookup.ts`, not a commercial provider integration.

## Section 1 — Provider Evaluation (for completeness)

Despite the finding above, here's the research on commercial providers:

### 1.1 GLEIF (current)
- **Pricing:** Free (API + Golden Copy bulk download)
- **Coverage:** 2.7M+ LEIs worldwide (all registered entities)
- **API:** REST, JSON, no auth required, 20 req/sec
- **Registration number lookup:** NOT supported via API filter
- **Parent-entity disambiguation:** Via `legalName` exact match (with name normalization, this works)
- **Bosch test:** PASS (with full legal name)
- **Verdict:** **Sufficient — fix the name normalization bug**

### 1.2 GLEIF Golden Copy (bulk)
- **Pricing:** Free
- **Coverage:** Same as API — full LEI population
- **Format:** CSV/XML/JSON, daily updates
- **Value:** Could precompute a name-to-LEI index with abbreviation expansion for instant lookups
- **Bosch test:** Entity is in the file (confirmed)
- **Verdict:** Useful for offline index, not needed for the immediate fix

### 1.3 OpenCorporates
- **Pricing:** ~£0.20/call (Basic tier), volume discounts available
- **Coverage:** 200M+ company records globally, LEI cross-referenced
- **API:** REST, JSON, requires API key
- **Registration number lookup:** YES — supports search by jurisdiction + registration number
- **Bosch test:** Not tested (requires paid API key)
- **Verdict:** Interesting for registration-number → LEI mapping in future, but GLEIF fix solves the immediate problem

### 1.4 Bloomberg OpenFIGI
- **Pricing:** Free
- **Coverage:** Financial instrument identifiers, not company LEIs
- **LEI support:** Limited — maps LEIs to financial instruments, not company data
- **Bosch test:** Not applicable (Bosch isn't a financial instrument)
- **Verdict:** Wrong tool for this job

### 1.5 RapidLEI (Ubisecure)
- **Pricing:** LEI issuance ($39/year), no public search API
- **Coverage:** Issues ~15% of global LEIs
- **API:** LEI management, not search
- **Bosch test:** N/A — issuance service, not lookup
- **Verdict:** Not applicable (issuance, not search)

### 1.6 LEI Worldwide
- **Pricing:** LEI registration ($49/year)
- **Coverage:** LOU (Local Operating Unit) for LEI registration
- **API:** Registration portal, not search
- **Bosch test:** N/A
- **Verdict:** Not applicable

### 1.7 LSEG (Refinitiv) / World-Check
- **Pricing:** Enterprise-only (tens of thousands/year minimum)
- **Coverage:** Extensive but focused on sanctions/PEP, not LEI lookup
- **Bosch test:** Requires enterprise agreement
- **Verdict:** Overkill for LEI lookup. Already covered by OpenSanctions for sanctions.

## Section 2 — The Bosch Test

| Provider | Query | Result |
|----------|-------|--------|
| **GLEIF API** (abbreviated name) | "Robert Bosch GmbH" | Subsidiaries only (Krankenhaus, College, etc.) |
| **GLEIF API** (full legal name) | "Robert Bosch Gesellschaft mit beschränkter Haftung" | **CORRECT: 529900F0LT5OP4SV6122, Active, Gerlingen, DE** |
| **GLEIF API** (direct LEI) | 529900F0LT5OP4SV6122 | **CORRECT** |
| **lei.info** (search) | "Robert Bosch GmbH" | **CORRECT** (lei.info does abbreviation expansion) |
| OpenCorporates | Not tested | Requires paid key |
| Bloomberg OpenFIGI | N/A | Not a company search tool |

## Section 3 — Cost Comparison

| Provider | Cost/call | 100 calls/mo | 500 calls/mo | Setup |
|----------|----------|-------------|-------------|-------|
| **GLEIF** | Free | $0 | $0 | None |
| OpenCorporates | ~$0.25 | $25 | $125 | API key registration |
| LSEG/Refinitiv | ~$5-10 | Enterprise min | Enterprise min | Enterprise agreement |
| Bloomberg OpenFIGI | Free | $0 | $0 | None (but wrong tool) |
| RapidLEI | N/A | N/A | N/A | N/A (issuance only) |

## Section 4 — Recommendation

**Do not switch providers. Fix the GLEIF name normalization bug.**

The immediate fix:
1. In `lei-lookup.ts`, when searching by company name, expand common legal form abbreviations before querying
2. Also try the GLEIF `fulltext` filter which is more flexible than `legalName` exact match
3. This solves the Bosch problem and likely dozens of similar entities

If we later need registration-number → LEI mapping (which GLEIF API doesn't support), OpenCorporates is the best option at ~$0.25/call. But that's a separate decision for a separate use case.

**Ranked recommendation:**
1. **Fix GLEIF name normalization** (free, ~30 lines of code, solves the problem)
2. **Build a GLEIF Golden Copy index** (free, solves name normalization at scale, future optimization)
3. **OpenCorporates** (paid, adds registration-number lookup, only if needed)
4. **Everything else** (not applicable or too expensive)

## Sources

- [GLEIF Golden Copy](https://www.gleif.org/en/lei-data/gleif-golden-copy)
- [GLEIF API](https://api.gleif.org/api/v1)
- [LEI.info Bosch](https://lei.info/529900F0LT5OP4SV6122)
- [LEI Lookup Bosch](https://www.lei-lookup.com/record/529900F0LT5OP4SV6122/)
- [Bloomberg LEI](https://lei.bloomberg.com)
- [OpenCorporates](https://opencorporates.com)
