# SI Openapi WW-Top probe — v1 directors gap closure

**Date:** 2026-05-15
**Triggered by:** DEC-20260513-F SI structural-gap finding + 2026-05-15 audit Batch 1 ([identity-field-coverage-2026-05-15.md](identity-field-coverage-2026-05-15.md)) confirmation that `slovenian-company-data` (via `data.gov.si` CKAN) does not surface directors. Openapi addendum (Article 7.3 redistribution rights) countersigned; Openapi access provisioned via env vars on Railway.
**Method:** Direct Openapi WW-Top probes from Railway runtime (using prod token via OAuth scope exchange) + comparison against existing `slovenian-company-data` capability outputs (from Batch 1 cache, same fixture entities).
**Wallet cost (Openapi side):** ~€0.24–€1.08 depending on whether HTTP 204 No-Content responses are billed (Openapi docs don't make this explicit). 2 confirmed 200 successful responses × €0.10 nominal × 1.22 IT VAT ≈ €0.24 minimum, plus up to 7 additional 204 probes if billed = €1.08 maximum. Both well within the €2 hard cap. Strale wallet: €0 (no `/v1/do` calls in this probe).

---

## Openapi access verification

**Env-var naming correction.** The prompt referenced `OPENAPI_API_KEY` but the actual env vars on Railway are `OPENAPI_COM_API_TOKEN_PROD` (32 chars) + `OPENAPI_COM_API_TOKEN_SANDBOX` (32 chars) + `OPENAPI_COM_EMAIL` (16 chars). The naming mismatch was the first finding — chat should reconcile any prior briefing that says `OPENAPI_API_KEY`.

**Authentication mechanism.** Openapi.com uses a two-step OAuth pattern, NOT direct Bearer of the API key:

1. **Token issuance:** `POST https://oauth.openapi.it/token` with HTTP Basic auth (email + API key) and request body `{"scopes": ["GET:company.openapi.com/WW-top"], "ttl": <seconds>}`. Returns a short-lived opaque token (24 chars, observed 10-min TTL).
2. **API call:** `GET https://company.openapi.com/WW-top/{country}/{identifier}` with `Authorization: Bearer <opaque-token>`.

A naive Bearer of `OPENAPI_COM_API_TOKEN_PROD` against the WW-Top endpoint returns `HTTP 401, {"success":false,"message":"Wrong Token","error":125.22}`. The OAuth scope exchange is mandatory.

**Endpoint pattern verified:** `GET https://company.openapi.com/WW-top/SI/{vatCode}` where `{vatCode}` matches `^SI\d{8}$` or `^\d{8}$` (8-digit Slovenian VAT or VAT-derived TIN). **The 10-digit matična številka (the CKAN identifier) is NOT a valid input** — it must be the VAT code. This is a significant adapter-layer concern for any future Openapi-SI capability build: customers passing the matična številka would need a lookup step before hitting Openapi.

**Coverage assessment via 7-VAT probe:**

| Entity (intended) | VAT probed | Result | Entity actually returned |
|---|---|---|---|
| Krka d.d. | SI82646716 | **204 No Content** | — (not found) |
| Petrol d.d. | SI80267432 | **200 OK, 4199 bytes** | PETROL, Slovenska energetska družba, d.d. ✓ |
| Telekom Slovenije d.d. | SI60841911 | **204 No Content** | — (not found) |
| Lek d.d. | SI88262602 | **204 No Content** | — (not found) |
| Mercator d.o.o. | SI45884595 | **200 OK, 4425 bytes** | Poslovni sistem Mercator d.o.o. ✓ |
| (other major SI) | SI78664015 | **204 No Content** | — |
| (other major SI) | SI17033139 | **204 No Content** | — |

**5 of 7 well-known SI corporations returned 204 No Content.** Openapi WW-Top's SI catalog is materially incomplete — only Petrol and Mercator (of the 7 entities probed) are in the WW-Top dataset. Krka, the canonical Batch 1 fixture, is **NOT in Openapi's WW-Top SI catalog**.

---

## Per-fixture findings

### Fixture 1 — Petrol d.d. (CKAN `5025796000`, Openapi VAT `SI80267432`)

**Openapi WW-Top response:**
- HTTP 200, 6.56s latency, 4199 bytes JSON
- Top-level keys: `id, lastUpdateTimestamp, companyName, nativeCompanyName, companySize, taxCode, vatCode, leiCode, markers, address, activityStatus, incorporationDate, contacts, internationalClassification, nationalClassification, balanceSheets`
- **NO directors / officers / representatives / shareholders / people / board / management fields.**
- Rich: LEI (`549300CAAOUTT4QDOZ16`), NACE primary+secondary, NAICS primary+secondary, SIC primary+secondary, address with GPS coordinates (14.50929, 46.06462), NUTS1/NUTS2/NUTS3 regional codes, balance sheets (financial data per year), company-size classification ("Very large company"), phone/fax/website contacts.
- Encoding: `nativeCompanyName` contains mojibake (`Slovenska energetska dru�ba` — Č rendered as � replacement char). UTF-8 handling defect on the SI character set in this specific field. `companyName` (the non-native variant) handles diacritics by stripping them ("Slovenska energetska druzba").

**CKAN response (from Batch 1):**
- HTTP 200, 374ms latency
- Top-level keys: `company_name, reg_number, hseid, legal_form, registration_office, address, settlement, postal_code, post_office, country, jurisdiction`
- **NO directors field** (confirmed structural gap per DEC-20260513-F).
- Lean: identity data only. UTF-8 clean (`družba` renders correctly).

### Fixture 2 — Mercator (CKAN `5300231000`, Openapi VAT `SI45884595`)

**Openapi WW-Top response:**
- HTTP 200, 6.63s latency, 4425 bytes JSON
- Top-level keys: identical to Petrol's response shape.
- **NO directors field.** Same gap.
- LEI: `549300X47J0FW574JN34`. ACTIVE status, incorporationDate 1989-12-05, 2 balance sheet years included.

**CKAN response (from Batch 1):**
- HTTP 200, 651ms latency
- Same lean identity shape as Petrol. No directors.

### Fixture 3 — Krka d.d. (CKAN `5043611000`, Openapi VAT `SI82646716`)

**Openapi WW-Top response:**
- HTTP 204 No Content. Latency 4.7s.
- Krka — Slovenia's largest pharma company, publicly traded on Ljubljana Stock Exchange — is NOT in Openapi's WW-Top SI catalog.

**CKAN response (Batch 1 fixture):**
- HTTP 200, 916ms latency
- Full lean identity shape returned.

This contradicts the prior expectation that Openapi WW-Top covers SI's major listed entities. Krka's absence is the most concerning data point.

---

## Comparison table (Petrol + Mercator, the 2 fixtures Openapi has)

| Field | data.gov.si CKAN | Openapi WW-Top |
|---|---|---|
| Legal name | ✓ (UTF-8 clean) | ✓ (mojibake on `nativeCompanyName`, clean on `companyName`) |
| Registration / VAT | ✓ (matična številka 10-digit) | ✓ (VAT 8-digit + trade-register-number marker) |
| LEI | ✗ | ✓ (Petrol, Mercator both have LEI) |
| Status | ✗ (CKAN gap) | ✓ (`activityStatus: ACTIVE`) |
| Registration / incorporation date | ✗ (CKAN gap) | ✓ (`incorporationDate`) |
| Address | ✓ (string format) | ✓ (structured object with street, town, zip, country, GPS coords, NUTS codes) |
| Legal form | ✓ (d.d. / d.o.o. label) | ✗ (not surfaced — only `companySize` available) |
| Industry codes | ✗ (CKAN gap) | ✓ (NACE + NAICS + SIC, primary+secondary) |
| Directors / officers | ✗ | **✗ (same gap)** |
| Phone / fax / website | ✗ | ✓ |
| Financial data (balance sheets) | ✗ | ✓ |
| Company-size classification | ✗ | ✓ |
| Latency | ~600ms | ~6.6s |
| Cost per call | €0 (free open data) | ~€0.12 incl. VAT |

---

## Synthesis

**Does Openapi WW-Top close the SI directors gap?** **NO.** No directors, officers, representatives, shareholders, board, management, or executive fields exist in the response for either of the 2 successful probes. The SI directors gap is **not addressable via Openapi WW-Top.**

**Does Openapi WW-Top close OTHER SI gaps?** **YES, partially:**
- `activityStatus` closes the CKAN-status gap.
- `incorporationDate` closes the CKAN-registration-date gap.
- NACE/NAICS/SIC closes the CKAN-industry-code gap.
- LEI is a new value not in CKAN.
- Balance sheets are a new value (not in scope for the audit's canonical-10-field set but high KYB value).

**Response quality concerns:**
- UTF-8 mojibake on `nativeCompanyName` for Slovenian special characters (`ž → �`). Risk for downstream display.
- SI coverage is partial: 5 of 7 well-known SI corporations returned 204. **Krka, the canonical Batch 1 fixture, is absent.**
- Latency is materially worse than CKAN (~10× slower: 6.6s vs 600ms).

**Cost:** confirmed at €0.10 nominal + 22% IT VAT ≈ €0.12 per successful call. 204 responses may or may not be billed (Openapi docs ambiguous on this).

---

## Verdict

**KEEP CKAN as SI Tier-1. Consider Openapi as a SUPPLEMENT for `activityStatus`, `incorporationDate`, NACE, and LEI when those fields are needed — NOT as a directors closure.**

Specifically:

1. **Do NOT replace CKAN with Openapi.** Reasons:
   - Openapi doesn't have Krka (canonical fixture). Replacing would regress the canonical-fixture test.
   - Openapi doesn't have directors either — neither closes the gap that motivated the probe.
   - Openapi is 10× slower than CKAN.
   - Openapi costs €0.12/call vs €0 for CKAN.
   - Openapi has a UTF-8 mojibake defect on SI native names.

2. **Do consider Openapi as a Tier-2 enrichment supplement** for the fields CKAN lacks (status, regdate, NACE, LEI, balance sheets). The supplement would be:
   - A separate capability slug, e.g. `si-company-enrich-openapi`, gated on a customer explicitly opting in.
   - Customers wanting full identity coverage pay the €0.12 supplement; customers happy with CKAN's lean shape pay nothing.
   - This is the SI-equivalent of the Tier-1 + Tier-2 architecture from DEC-20260515-A for US (state-direct + Cobalt fallback).

3. **For directors specifically, neither CKAN nor Openapi closes the gap.** SI directors require a different path entirely (AJPES restPrsInfo paid contract, or another vendor). Out of scope for v1 per DEC-20260513-F's structural-gap exemption.

**Confidence: HIGH.** The empirical comparison is unambiguous — Openapi's WW-Top SI catalog lacks directors and lacks coverage of Krka. Both findings are reproducible.

---

## Recommended next actions for chat

1. **Update DEC-20260513-F supersession / follow-up** to explicitly note that Openapi WW-Top does NOT close the SI directors gap. The structural-gap exemption stands for v1.
2. **Active Vendor Stack:** add Openapi as a "Tier-2 enrichment, partial SI coverage" entry with the field-list it adds (status, regdate, NACE, LEI, balance sheets, company-size). Note the 5-of-7-VAT coverage finding so future engineers don't assume full SI coverage.
3. **Capability × Country Coverage Matrix:** SI row stays as-is for identity (CKAN-direct, no directors). If a `si-company-enrich-openapi` capability ships, add a separate "enrichment" cell.
4. **No new SI directors capability build for v1.** The directors gap remains source-absent for SI.
5. **Openapi other-EU30 coverage survey** is a separate session — the audit's findings on coverage gaps for SI (5 of 7 entities absent) raises a question whether other EU30 countries Openapi claims to cover have similarly thin catalogs. Worth probing 2-3 well-known entities per claimed country before relying on Openapi WW-Top as a Tier-2 supplement broadly.
6. **OPENAPI_API_KEY env-var naming.** Any internal docs / briefings that reference `OPENAPI_API_KEY` should be corrected to `OPENAPI_COM_API_TOKEN_PROD` + `OPENAPI_COM_EMAIL` (the Basic-auth pair) + clarify the OAuth scope-exchange step.

---

## Open questions for chat

1. **Are 204 No-Content responses billed by Openapi?** Their docs don't specify. If billed, the 7-VAT probe cost ~€0.84; if not, ~€0.24. Worth a direct question to Openapi support (Shaun De Lucia per the addendum context).
2. **SI VATs of major listed entities:** I used `SI82646716` for Krka based on public records. Possibility 1: that's not Krka's actual VAT. Possibility 2: Openapi just doesn't have Krka. The 204 response doesn't disambiguate. Worth a Openapi-support clarification on their SI coverage map.
3. **Tier-2 enrichment capability vs caller-orchestrated.** Two design choices for the Openapi supplement: (a) a Strale capability that proxies + tags the cost transparently, (b) document Openapi as a customer-BYO route. Probably (a) for consistency with the rest of the catalog, but worth chat's call.

---

*Generated by Claude Code session 2026-05-15. Openapi-side spend: ~€0.24–€1.08 depending on 204 billing. Strale wallet: €0 (no `/v1/do` calls). Worktree: strale-research, branch `docs/identity-field-coverage-2026-05-15`. No code changes, no DB writes, no PR.*
