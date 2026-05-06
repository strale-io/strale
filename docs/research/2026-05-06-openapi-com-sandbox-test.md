# Openapi.com sandbox + production testing report

**Date:** 2026-05-06
**Branch:** test/openapi-com-sandbox-2026-05-06
**Vendor status:** Pending eval (per Vendor Roster, DEC-20260506-A).

## 1. Headline summary

- Phase A (sandbox): 41 calls, 41 ok / 0 failed. Real-money cost: €0.00 (virtual credit).
- Phase B (production): NOT INVOKED — re-run with `--production` to enable.

## 2. Phase A (sandbox) results

| Mode | Endpoint | Country | Identifier | Status | Latency | Error |
|---|---|---|---|---|---|---|
| sandbox | IT-start | IT | 12485671007 | 200 | 2520ms |  |
| sandbox | IT-advanced | IT | 12485671007 | 200 | 1582ms |  |
| sandbox | WW-start | IT | 12485671007 | 200 | 1674ms |  |
| sandbox | WW-advanced | IT | 12485671007 | 200 | 1658ms |  |
| sandbox | FR-start | FR | 883480147 | 200 | 2054ms |  |
| sandbox | FR-advanced | FR | 883480147 | 200 | 2083ms |  |
| sandbox | WW-start | FR | 883480147 | 200 | 1689ms |  |
| sandbox | WW-advanced | FR | 883480147 | 200 | 1613ms |  |
| sandbox | DE-start | DE | DE811115368 | 200 | 2229ms |  |
| sandbox | DE-advanced | DE | DE811115368 | 200 | 1670ms |  |
| sandbox | WW-start | DE | DE811115368 | 200 | 1807ms |  |
| sandbox | WW-advanced | DE | DE811115368 | 200 | 1675ms |  |
| sandbox | ES-start | ES | ESA81948077 | 200 | 2106ms |  |
| sandbox | ES-advanced | ES | ESA81948077 | 200 | 1709ms |  |
| sandbox | WW-start | ES | ESA81948077 | 200 | 1684ms |  |
| sandbox | WW-advanced | ES | ESA81948077 | 200 | 1687ms |  |
| sandbox | PT-start | PT | PT500273170 | 200 | 2032ms |  |
| sandbox | PT-advanced | PT | PT500273170 | 200 | 1521ms |  |
| sandbox | WW-start | PT | PT500273170 | 200 | 1659ms |  |
| sandbox | WW-advanced | PT | PT500273170 | 200 | 1676ms |  |
| sandbox | GB-start | GB | GB226335521 | 200 | 2230ms |  |
| sandbox | GB-advanced | GB | GB226335521 | 200 | 2247ms |  |
| sandbox | WW-start | GB | GB226335521 | 200 | 1665ms |  |
| sandbox | WW-advanced | GB | GB226335521 | 200 | 1574ms |  |
| sandbox | BE-start | BE | BE0202239951 | 200 | 2080ms |  |
| sandbox | BE-advanced | BE | BE0202239951 | 200 | 2133ms |  |
| sandbox | WW-start | BE | BE0202239951 | 200 | 1691ms |  |
| sandbox | WW-advanced | BE | BE0202239951 | 200 | 1691ms |  |
| sandbox | AT-start | AT | ATU22852606 | 200 | 2177ms |  |
| sandbox | AT-advanced | AT | ATU22852606 | 200 | 1836ms |  |
| sandbox | WW-start | AT | ATU22852606 | 200 | 1678ms |  |
| sandbox | WW-advanced | AT | ATU22852606 | 200 | 1843ms |  |
| sandbox | CH-start | CH | CHE-101.447.456 | 200 | 2264ms |  |
| sandbox | CH-advanced | CH | CHE-101.447.456 | 200 | 2095ms |  |
| sandbox | WW-start | CH | CHE-101.447.456 | 200 | 1709ms |  |
| sandbox | WW-advanced | CH | CHE-101.447.456 | 200 | 1616ms |  |
| sandbox | PL-start | PL | PL5213787274 | 200 | 2081ms |  |
| sandbox | PL-advanced | PL | PL5213787274 | 200 | 2269ms |  |
| sandbox | WW-start | PL | PL5213787274 | 200 | 1694ms |  |
| sandbox | WW-advanced | PL | PL5213787274 | 200 | 1531ms |  |
| sandbox | IT-stakeholders | IT | 12485671007 | 200 | 1683ms |  |

## 3. Phase B (production) results

Phase B did not run.

## 4. Field-coverage matrix

Per (country, endpoint, mode) cell — each Strale required field marked populated/null/missing/empty, with the Openapi response key that mapped (best-effort case-insensitive lookup, depth 2).

| Mode | Endpoint | Country | Entity | legal_name | registration_number | status | registered_address | directors | incorporation_date | legal_form | vat_number | lei | nace_code | share_capital | financials |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sandbox | IT-start | IT | 12485671007 | populated(companyName) | populated(taxCode) | populated(activityStatus) | populated(address) | missing | populated(registrationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | IT-advanced | IT | 12485671007 | populated(companyName) | populated(taxCode) | populated(activityStatus) | populated(address) | populated(shareHolders) | populated(startDate) | populated(detailedLegalForm) | populated(vatCode) | missing | populated(ateco) | populated(shareCapital) | populated(balanceSheets) |
| sandbox | WW-start | IT | 12485671007 | populated(companyName) | populated(taxCode) | populated(activityStatus) | populated(address) | missing | populated(registrationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | WW-advanced | IT | 12485671007 | populated(companyName) | populated(taxCode) | populated(activityStatus) | populated(address) | populated(shareHolders) | populated(startDate) | populated(detailedLegalForm) | populated(vatCode) | missing | populated(ateco) | populated(shareCapital) | populated(balanceSheets) |
| sandbox | FR-start | FR | 883480147 | populated(companyName) | populated(vatCode) | populated(activityStatus) | populated(address) | missing | populated(registrationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | FR-advanced | FR | 883480147 | populated(companyName) | populated(vatCode) | populated(activityStatus) | populated(address) | missing | populated(registrationDate) | populated(detailedLegalForm) | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | FR | 883480147 | populated(companyName) | populated(vatCode) | populated(activityStatus) | populated(address) | missing | populated(registrationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | WW-advanced | FR | 883480147 | populated(companyName) | populated(vatCode) | populated(activityStatus) | populated(address) | missing | populated(registrationDate) | populated(detailedLegalForm) | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | DE-start | DE | DE811115368 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | DE-advanced | DE | DE811115368 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | DE | DE811115368 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | WW-advanced | DE | DE811115368 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | ES-start | ES | ESA81948077 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | ES-advanced | ES | ESA81948077 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | ES | ESA81948077 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | WW-advanced | ES | ESA81948077 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | PT-start | PT | PT500273170 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | PT-advanced | PT | PT500273170 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | PT | PT500273170 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | WW-advanced | PT | PT500273170 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | GB-start | GB | GB226335521 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | GB-advanced | GB | GB226335521 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | GB | GB226335521 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | WW-advanced | GB | GB226335521 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | BE-start | BE | BE0202239951 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | missing | populated(leiCode) | missing | missing | missing |
| sandbox | BE-advanced | BE | BE0202239951 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | missing | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | BE | BE0202239951 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | missing | populated(leiCode) | missing | missing | missing |
| sandbox | WW-advanced | BE | BE0202239951 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | missing | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | AT-start | AT | ATU22852606 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | AT-advanced | AT | ATU22852606 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | AT | ATU22852606 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | missing | missing | missing |
| sandbox | WW-advanced | AT | ATU22852606 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | populated(leiCode) | populated(nace) | missing | populated(balanceSheets) |
| sandbox | CH-start | CH | CHE-101.447.456 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | CH-advanced | CH | CHE-101.447.456 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | CH | CHE-101.447.456 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | WW-advanced | CH | CHE-101.447.456 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | PL-start | PL | PL5213787274 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | PL-advanced | PL | PL5213787274 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | WW-start | PL | PL5213787274 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | missing | missing | missing |
| sandbox | WW-advanced | PL | PL5213787274 | populated(companyName) | populated(id) | populated(activityStatus) | populated(address) | missing | populated(incorporationDate) | missing | populated(vatCode) | missing | populated(nace) | missing | populated(balanceSheets) |
| sandbox | IT-stakeholders | IT | 12485671007 | populated(name) | populated(taxCode) | missing | populated(address) | populated(managers) | missing | missing | populated(vatCode) | missing | missing | missing | missing |

## 5. Cross-finding observations

- Endpoint AT-advanced: 1/1 ok (100%).
- Endpoint AT-start: 1/1 ok (100%).
- Endpoint BE-advanced: 1/1 ok (100%).
- Endpoint BE-start: 1/1 ok (100%).
- Endpoint CH-advanced: 1/1 ok (100%).
- Endpoint CH-start: 1/1 ok (100%).
- Endpoint DE-advanced: 1/1 ok (100%).
- Endpoint DE-start: 1/1 ok (100%).
- Endpoint ES-advanced: 1/1 ok (100%).
- Endpoint ES-start: 1/1 ok (100%).
- Endpoint FR-advanced: 1/1 ok (100%).
- Endpoint FR-start: 1/1 ok (100%).
- Endpoint GB-advanced: 1/1 ok (100%).
- Endpoint GB-start: 1/1 ok (100%).
- Endpoint IT-advanced: 1/1 ok (100%).
- Endpoint IT-stakeholders: 1/1 ok (100%).
- Endpoint IT-start: 1/1 ok (100%).
- Endpoint PL-advanced: 1/1 ok (100%).
- Endpoint PL-start: 1/1 ok (100%).
- Endpoint PT-advanced: 1/1 ok (100%).
- Endpoint PT-start: 1/1 ok (100%).
- Endpoint WW-advanced: 10/10 ok (100%).
- Endpoint WW-start: 10/10 ok (100%).
- Field legal_name: populated in 41/41 successful responses (100%).
- Field registration_number: populated in 41/41 successful responses (100%).
- Field status: populated in 40/41 successful responses (98%).
- Field registered_address: populated in 41/41 successful responses (100%).
- Field directors: populated in 3/41 successful responses (7%).
- Field incorporation_date: populated in 40/41 successful responses (98%).
- Field legal_form: populated in 4/41 successful responses (10%).
- Field vat_number: populated in 37/41 successful responses (90%).
- Field lei: populated in 20/41 successful responses (49%).
- Field nace_code: populated in 20/41 successful responses (49%).
- Field share_capital: populated in 2/41 successful responses (5%).
- Field financials: populated in 20/41 successful responses (49%).

## 6. Cost analysis

- Phase A: €0.00 real money (virtual sandbox credit).

## 7. Suggested follow-up actions (NOT executed)

- Review the field-coverage matrix manually against the addendum decision.
- For any country where Phase A succeeded but Phase B failed (or vice versa), capture the divergence in a separate note before signing.
- If addendum is signed: run the capability onboarding pipeline (DEC-20260320-B) to register Openapi-backed handlers per country. The OpenapiClient is already in place and reusable.
- If addendum is rejected: deactivate the OpenapiClient module or leave dormant; no live capability depends on it.

## Appendix — audit-phase deviations from prompt

- Prompt specified `apps/api/.env.example`; actual `.env.example` lives at repo root. Used the actual location.
- Prompt specified `apps/api/src/scripts/test-openapi-com.ts`; the convention in this repo is `apps/api/scripts/` (155 existing scripts). Used the convention.
- Sandbox does NOT cover NL, HU, SI, BG, RO, LU, SK, MT, CY (9 of 19 target countries). Phase A coverage capped at the 10 sandbox-supported countries; the other 9 are Phase B-only.
