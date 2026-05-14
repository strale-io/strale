# HMRC Check a UK VAT Number API v2.0 — Sandbox Test Report

**Support reference:** 2026-CNS433
**Date:** 2026-05-13T21:50:28.140Z
**Application:** Strale (Moonlighter AB)
**Tested against:** `https://test-api.service.hmrc.gov.uk`
**Scope:** `read:vat`
**Accept header:** `application/vnd.hmrc.2.0+json`
**Sandbox credentials:** `HMRC_SANDBOX_CLIENT_ID` (client_id ado6…xK (len=28) <REDACTED>) / `HMRC_SANDBOX_CLIENT_SECRET` from local `.env`. No production credentials referenced or read.

**Mock VRN source:** HMRC's own published canonical mock-data file at `github.com/hmrc/vat-registered-companies-api/blob/main/public/api/conf/2.0/test-data/vrn.csv` (40 provisioned VRNs).

**VRNs selected for this run:**
- Target: `553557881` (canonical example from HMRC OAS docs; first entry in the mock-data CSV)
- Requester: `436189915` (distinct from target; also in the canonical CSV)
- Regression: `553557817` (prior test VRN; NOT in the canonical CSV — used to show the 404 path is correct behaviour for non-provisioned identifiers)

---

## Test 1 — OAuth2 token request

**Request**
- Method: `POST`
- URL: `https://test-api.service.hmrc.gov.uk/oauth/token`
- Headers:
  - `Content-Type: application/x-www-form-urlencoded`
- Body (form-encoded):
  - `grant_type=client_credentials`
  - `client_id=<REDACTED>`
  - `client_secret=<REDACTED>`
  - `scope=read:vat`

**Response**
- HTTP status: `200 OK`
- Wall clock: `537ms`
- Headers:
```json
{
  "cache-control": "no-cache,no-store,max-age=0",
  "connection": "keep-alive",
  "content-length": "111",
  "content-security-policy": "default-src 'self'",
  "content-type": "application/json",
  "date": "Wed, 13 May 2026 21:50:27 GMT",
  "strict-transport-security": "max-age=31536000;",
  "via": "1.1 4ded1750dc7e0bef188a5520fb9fef28.cloudfront.net (CloudFront)",
  "x-amz-cf-id": "yYKmscr2RxRxSAuNQWZDvsPcK5n5yIlh9z_5I8duEre2do98VecdrA==",
  "x-amz-cf-pop": "ARN56-P1",
  "x-cache": "Miss from cloudfront",
  "x-content-type-options": "nosniff",
  "x-envoy-upstream-service-time": "54",
  "x-frame-options": "SAMEORIGIN"
}
```
- Body:
```json
{
  "access_token": "<REDACTED>",
  "scope": "read:vat",
  "expires_in": 14400,
  "token_type": "bearer"
}
```
- Granted scope: `read:vat`
- Token TTL: `14400s`

**Verdict: PASS** — HTTP 200, `read:vat` scope granted.

---

## Test 2 — Unverified check (positive path, 200 expected)

**Source of test VRN:** `github.com/hmrc/vat-registered-companies-api/blob/main/public/api/conf/2.0/test-data/vrn.csv` (entry 1 of 40).

**Request**
- Method: `GET`
- URL: `https://test-api.service.hmrc.gov.uk/organisations/vat/check-vat-number/lookup/553557881`
- Headers:
  - `Accept: application/vnd.hmrc.2.0+json`
  - `Authorization: Bearer <REDACTED>`
- Time of call (UTC): `2026-05-13T21:50:28.681Z`

**Response**
- HTTP status: `200 OK`
- Wall clock: `369ms`
- Headers:
```json
{
  "cache-control": "no-cache,no-store,max-age=0",
  "connection": "keep-alive",
  "content-length": "199",
  "content-security-policy": "default-src 'self'",
  "content-type": "application/json",
  "date": "Wed, 13 May 2026 21:50:27 GMT",
  "strict-transport-security": "max-age=31536000;",
  "vary": "Origin",
  "via": "1.1 30a448a0dbd4a52ea118d2e64f0535c8.cloudfront.net (CloudFront)",
  "x-amz-cf-id": "gVx4hdK1MrCwxbXL68BoBclbJEK1ZAl13Kua1Grd5Yv_axJK93PyhQ==",
  "x-amz-cf-pop": "ARN56-P1",
  "x-cache": "Miss from cloudfront",
  "x-content-type-options": "nosniff",
  "x-envoy-upstream-service-time": "19",
  "x-frame-options": "SAMEORIGIN"
}
```
- Body:
```json
{
  "target": {
    "name": "Credite Sberger Donal Inc.",
    "vatNumber": "553557881",
    "address": {
      "line1": "131B Barton Hamlet",
      "postcode": "SW97 5CK",
      "countryCode": "GB"
    }
  },
  "processingDate": "2026-05-13T22:50:27+01:00"
}
```

**Verdict: PASS** — HTTP 200 as expected for unverified lookup of a canonical mock VRN.

---

## Test 3 — Verified check (positive path, 200 expected)

**Source of test VRNs:** both target and requester drawn from `vrn.csv` (entries 1 and 8 respectively; distinct identifiers).

**Request**
- Method: `GET`
- URL: `https://test-api.service.hmrc.gov.uk/organisations/vat/check-vat-number/lookup/553557881/436189915`
- Headers:
  - `Accept: application/vnd.hmrc.2.0+json`
  - `Authorization: Bearer <REDACTED>`
- Time of call (UTC): `2026-05-13T21:50:29.053Z`

**Response**
- HTTP status: `200 OK`
- Wall clock: `258ms`
- Headers:
```json
{
  "cache-control": "no-cache,no-store,max-age=0",
  "connection": "keep-alive",
  "content-length": "258",
  "content-security-policy": "default-src 'self'",
  "content-type": "application/json",
  "date": "Wed, 13 May 2026 21:50:27 GMT",
  "strict-transport-security": "max-age=31536000;",
  "vary": "Origin",
  "via": "1.1 4ded1750dc7e0bef188a5520fb9fef28.cloudfront.net (CloudFront)",
  "x-amz-cf-id": "BBAO3yqc6GaaYxtFgNWK8JYy4zj2Clrcta3VyUpezmVsuDOkgPiooQ==",
  "x-amz-cf-pop": "ARN56-P1",
  "x-cache": "Miss from cloudfront",
  "x-content-type-options": "nosniff",
  "x-envoy-upstream-service-time": "20",
  "x-frame-options": "SAMEORIGIN"
}
```
- Body:
```json
{
  "target": {
    "name": "Credite Sberger Donal Inc.",
    "vatNumber": "553557881",
    "address": {
      "line1": "131B Barton Hamlet",
      "postcode": "SW97 5CK",
      "countryCode": "GB"
    }
  },
  "requester": "436189915",
  "consultationNumber": "YQD-VNF-WWX",
  "processingDate": "2026-05-13T22:50:27+01:00"
}
```

**Verdict: PASS** — HTTP 200 as expected for verified lookup with target + requester.

---

## Test 4 — Authenticated 404 regression (negative path, 404 expected)

**Test VRN:** `553557817` — the identifier used in the prior 5 May test report. This VRN is **NOT** in the canonical `vrn.csv` mock-data list, so a 404 is the documented correct sandbox behaviour, NOT a configuration issue with Strale's application.

**Request**
- Method: `GET`
- URL: `https://test-api.service.hmrc.gov.uk/organisations/vat/check-vat-number/lookup/553557817`
- Headers:
  - `Accept: application/vnd.hmrc.2.0+json`
  - `Authorization: Bearer <REDACTED>`
- Time of call (UTC): `2026-05-13T21:50:29.311Z`

**Response**
- HTTP status: `404 Not Found`
- Wall clock: `121ms`
- Headers:
```json
{
  "cache-control": "no-cache",
  "connection": "keep-alive",
  "content-length": "78",
  "content-security-policy": "default-src 'self'",
  "content-type": "application/json",
  "date": "Wed, 13 May 2026 21:50:28 GMT",
  "strict-transport-security": "max-age=31536000;",
  "vary": "Origin",
  "via": "1.1 30a448a0dbd4a52ea118d2e64f0535c8.cloudfront.net (CloudFront)",
  "x-amz-cf-id": "F2GRdfkMP5FCaX87kQh9VmpGawyLnxa8oXrUxOxFBdjTJU2fddRYLA==",
  "x-amz-cf-pop": "ARN56-P1",
  "x-cache": "Error from cloudfront",
  "x-envoy-upstream-service-time": "8"
}
```
- Body:
```json
{
  "code": "NOT_FOUND",
  "message": "targetVrn does not match a registered company"
}
```

**Verdict: PASS** — HTTP 404 as expected for non-provisioned VRN regression.

---

## Summary

| # | Test | Expected | Got | Verdict |
|---|---|---|---|---|
| 1 | OAuth2 token (`read:vat`) | 200 | 200 | PASS |
| 2 | Unverified lookup, canonical VRN `553557881` | 200 | 200 | PASS |
| 3 | Verified lookup, target `553557881` + requester `436189915` | 200 | 200 | PASS |
| 4 | Authenticated 404 regression, non-provisioned VRN `553557817` | 404 | 404 | PASS |

**Diagnosis of the prior 5 May report's 404:** the prior test used `553557817`, which is not in HMRC's canonical mock-VRN list. The 404 response was the correct, documented sandbox behaviour for a non-provisioned identifier — not an authentication, scope, or configuration problem with Strale's sandbox application. Tests 2 and 3 above use VRNs from the canonical list and return populated 200 responses with the same client credentials, scope, headers, and code path.

Test started: 2026-05-13T21:50:28.140Z
Test finished: 2026-05-13T21:50:29.432Z
