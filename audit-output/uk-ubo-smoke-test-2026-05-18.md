# UK UBO end-to-end live smoke test — PR #132 GREEN verification

**Date:** 2026-05-18
**Outcome:** GREEN-VERIFIED via live smoke test
**Trigger:** PR #132 reached GREEN for UK based on static code analysis only. This validates the static verdict against real Companies House behavior in production.

## Test path used

**Path A (production HTTP).** No `/v1/counterparty-assurance` endpoint exists in the repo; the prompt's CA "endpoint" is a fictional abstraction. The actual orchestration is split across two underlying capabilities exposed via `POST /v1/do`:

- `uk-company-data` — sets the `ubo_availability` flag
- `beneficial-ownership-lookup` — fetches actual PSC data from Companies House

Both must work in concert for any future CA bundle that consumes them. Both were exercised live.

Production base URL: `https://strale-production.up.railway.app`

## Test entities

- **Initial:** `00006245` (BP P.L.C.) — confirmed integration reachable (HTTP 200) but returned empty `beneficial_owners[]`. BP is a listed PLC and is PSC-exempt under Companies House rules — the handler correctly returned `has_psc_data: true` with an empty array (no ceased filter would have changed the result). Per the prompt's stop-condition guidance, switched to a private UK company.
- **Final:** `09446231` (Monzo Bank Limited) — private UK Ltd, has filed PSC data.

## Request / response — uk-company-data (Monzo)

**Request body:**
```json
{
  "capability_slug": "uk-company-data",
  "inputs": { "company_number": "09446231" },
  "max_price_cents": 100
}
```

**Response (HTTP 200):**
```json
{
  "status": "completed",
  "capability_used": "uk-company-data",
  "price_cents": 5,
  "latency_ms": 265,
  "output": {
    "company_name": "MONZO BANK LIMITED",
    "company_number": "09446231",
    "business_type": "ltd",
    "jurisdiction": "england-wales",
    "status": "active",
    "ubo_availability": "available",
    "ubo_availability_reason": "Beneficial ownership data available via UK PSC register.",
    "tier_2_available": false,
    "primary_registration_id": "09446231",
    "legal_name": "MONZO BANK LIMITED",
    "legal_form": "ltd",
    "date_incorporated": "2015-02-18"
  }
}
```

Transaction id: `bf95e46d-9162-441c-bb19-8263052a1db6`.

## Request / response — beneficial-ownership-lookup (Monzo)

**Request body:**
```json
{
  "capability_slug": "beneficial-ownership-lookup",
  "inputs": {
    "company_name": "Monzo Bank Limited",
    "company_number": "09446231",
    "jurisdiction": "gb"
  },
  "max_price_cents": 100
}
```

**Response (HTTP 200):**
```json
{
  "status": "completed",
  "capability_used": "beneficial-ownership-lookup",
  "price_cents": 25,
  "latency_ms": 284,
  "output": {
    "company_name": "MONZO BANK LIMITED",
    "company_number": "09446231",
    "jurisdiction": "gb",
    "company_status": "active",
    "beneficial_owners": [
      {
        "name": "Monzo Bank Holding Group Limited",
        "type": "corporate",
        "nationality": null,
        "country_of_residence": null,
        "date_of_birth": null,
        "ownership_level": "75-100%",
        "natures_of_control": [
          "ownership-of-shares-75-to-100-percent",
          "voting-rights-75-to-100-percent",
          "right-to-appoint-and-remove-directors"
        ],
        "notified_on": "2023-09-12"
      }
    ],
    "total_beneficial_owners": 1,
    "has_psc_data": true,
    "data_source": "UK Companies House PSC Register"
  },
  "provenance": {
    "source": "company-information.service.gov.uk",
    "fetched_at": "2026-05-18T08:45:37.684Z"
  }
}
```

Transaction id: `f03ae9b8-2168-4ccd-a627-707288c0ef03`.

## PASS criteria evaluation

| Criterion | Result | Evidence |
|---|---|---|
| HTTP 200 on both calls | ✅ | uk-company-data: 200; beneficial-ownership-lookup: 200 |
| `ubo_availability === "available"` | ✅ | uk-company-data output |
| `ubo_availability_reason` present and customer-friendly | ✅ | "Beneficial ownership data available via UK PSC register." — no internal jargon, no handler/endpoint/DEC references |
| `beneficial_owners[]` populated | ✅ | 1 entry returned for Monzo |
| Each entry has `name` populated | ✅ | "Monzo Bank Holding Group Limited" |
| No silent errors / warnings | ✅ | Clean response, transparency_marker `algorithmic`, schema_validated true |

Bonus quality signals beyond minimum criteria:
- `ownership_level` populated: "75-100%"
- `natures_of_control` populated: 3 entries
- `notified_on` date populated: "2023-09-12"
- `type` populated: "corporate"
- Latency healthy: ~285 ms

## BP P.L.C. caveat (informational)

The first test entity (`00006245` BP P.L.C.) returned HTTP 200 with empty `beneficial_owners[]` and `has_psc_data: true`. This is **correct behavior**, not a bug: BP is listed on the LSE and is exempt from PSC disclosure under Companies House rules for companies on a regulated market. The handler at `apps/api/src/capabilities/beneficial-ownership-lookup.ts` has a 404 fallback path with a note explaining the exemption; here the upstream returned a 200 with empty `items`, which the handler passed through as empty `beneficial_owners`. No customer-facing claim is broken — `ubo_availability` from `uk-company-data` would still read `"available"` for any UK company even if the PSC list is empty, because the *capability* is available; whether any *individual* entity has PSCs filed is a function of that entity's status. This is the expected handler contract.

## Conclusion

**GREEN-VERIFIED via live smoke test.** PR #132's UK UBO activation is confirmed working end-to-end against real Companies House behavior:

- The post-PR-132 wiring in `uk-company-data.ts` correctly sets `ubo_availability: "available"` with a customer-friendly reason.
- The `beneficial-ownership-lookup.ts` capability correctly fetches and returns populated PSC data with the canonical field shape (`name`, `type`, `ownership_level`, `natures_of_control`, `notified_on`).
- UK UBO is v1-launch-ready.

No code changes made. No flag flips required. Coverage matrix `status: Live` for `beneficial-ownership-lookup__uk__beneficial-ownership.yaml` is verified accurate.

## Files read (audit phase 1)

- `apps/api/src/capabilities/uk-company-data.ts` — confirmed `ubo_availability: "available"` post-PR-132
- `apps/api/src/capabilities/beneficial-ownership-lookup.ts` — confirmed UK PSC dispatch logic with active-only filter and 404/exempt fallback
- `apps/api/src/app.ts` — confirmed no `/v1/counterparty-assurance` route; orchestration goes via `/v1/do` or `/v1/solutions/:slug/execute`
- `apps/api/src/routes/do.ts` — confirmed request body shape uses `inputs` (plural), `capability_slug`, `max_price_cents`
- `apps/api/coverage-matrix/beneficial-ownership-lookup__uk__beneficial-ownership.yaml` — confirmed `status: Live`
- `manifests/beneficial-ownership-lookup.yaml` — confirmed `input_schema.required: [company_name]`

## Files NOT modified

- `apps/api/src/capabilities/uk-company-data.ts` — not changed (PASS path)
- `apps/api/coverage-matrix/beneficial-ownership-lookup__uk__beneficial-ownership.yaml` — not changed (PASS path)

## Quota consumed

Three production `/v1/do` calls: 25 + 5 + 25 = 55 cents off `test2@strale.io` wallet; final balance reported by API: 2844 cents. Three Companies House API quota slots consumed (negligible — free tier is 600 / 5 min).
