# VIES UK GB-prefix coverage verification (2026-05-13)

**Investigation type:** read-only. No code changes, no commits, no PR.
**Trigger:** claim in third-party library `valvat` (Ruby gem) that VIES stopped accepting GB-prefix VAT requests in early 2021 post-Brexit. Memory entry + Active Vendor Stack page state "VIES covers EU27 + UK." If the valvat claim is accurate, the canonical-surface text is stale.
**Worktree:** strale-research @ origin/main SHA `5c22c77`.

---

## Verdict: **REFUTED with no code impact**

The valvat claim is empirically confirmed. VIES rejects GB-prefix VAT queries at the country-code level. **However**, Strale's `vat-validate` capability code is already correctly architected for this reality — GB is routed to HMRC, EU27+XI to VIES. **The drift is in the canonical-surface text (memory + Active Vendor Stack), not in the code.**

This means:

- **No code gap.** Strale's UK VAT validation path is HMRC and has been HMRC since at least the `vat-validate.ts` capability was written.
- **HMRC support ticket 2026-CNS433 is critical-path, not enrichment.** The framing of the memory entry as "VIES covers EU27 + UK" understates HMRC's importance.
- **Canonical-surface corrections needed** in: (a) memory entry on VIES coverage; (b) Active Vendor Stack page row for VIES.

---

## Step 2 findings — Strale UK Identity capability behaviour

### `apps/api/src/capabilities/uk-company-data.ts`

UK Identity returns no `vat_number` field at all in its output. The return object (lines 98-109) is:

```typescript
return {
  company_name: c.company_name || "",
  company_number: c.company_number || companyNumber,
  business_type: c.type || null,
  jurisdiction: c.jurisdiction || null,
  address,
  incorporation_date: c.date_of_creation || null,
  dissolution_date: c.date_of_cessation || null,
  status: statusMap[c.company_status] || c.company_status || "unknown",
  sic_codes: c.sic_codes || [],
  has_charges: c.has_charges || false,
};
```

No VIES call. No HMRC call. No VAT field. The capability is Companies House only.

### `apps/api/src/capabilities/vat-validate.ts`

VAT validation is a separate capability that dispatches by country-code prefix. The header docstring (lines 9-14) already correctly documents post-Brexit reality:

```
Coverage today:
  - EU27 + XI (Northern Ireland)  → VIES
  - NO                            → Brønnøysundregistrene
  - CH, LI                        → Swiss UID register (public services)
  - GB                            → HMRC v2 (active when credentials are set)
```

`PROVIDER_BY_PREFIX` map (lines 88-93) routes each parsed country code to its provider. The unsupported-country error message (line 177) names the same routing.

### `apps/api/src/capabilities/lib/vat-providers/vies.ts`

The VIES provider's prefix list (lines 16-21):

```typescript
const EU27_PREFIXES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
  "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
  "XI", // Northern Ireland (post-Brexit protocol — VIES handles XI)
] as const;
```

GB is **not** in the list. XI is. The comment on line 20 explicitly cites the post-Brexit protocol — whoever wrote `vat-validate.ts` knew about the change.

### `apps/api/src/capabilities/lib/vat-providers/hmrc.ts`

HMRC provider:

```typescript
name: "hmrc",
source: "api.service.hmrc.gov.uk (Check a UK VAT Number v2)",
prefixes: ["GB"],
```

GB is exclusively routed to HMRC.

**Conclusion of Step 2:** Strale's UK Identity capability does not return VAT data at all (out of scope for that capability). The `vat-validate` capability — the surface that actually does VAT validation — correctly routes GB to HMRC, not VIES. Code is sound.

---

## Step 3 — UK Identity capability execution

Not run. Step 2 established that `uk-company-data.ts` does not call VIES or any VAT-checking surface for the UK — VAT is simply not part of the response shape. A live execution would not produce VIES-related signal; it would just confirm the response omits VAT.

---

## Step 4 findings — direct VIES REST calls

**Endpoint:** `https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number` (POST, JSON body).

### Test A — GB-prefix (Tesco PLC VAT `220430231`)

**Request body:** `{"countryCode":"GB","vatNumber":"220430231"}`

**Response:** HTTP 200, body:

```json
{
  "actionSucceed" : false,
  "errorWrappers" : [ {
    "error" : "INVALID_INPUT"
  } ]
}
```

VIES rejects GB at the country-code level. The rejection is independent of which GB VAT number is submitted — the error fires before VIES validates the number itself. This is structural: VIES does not accept GB as a valid country code post-Brexit.

### Test B — XI-prefix (Northern Ireland VAT `174918964`)

**Request body:** `{"countryCode":"XI","vatNumber":"174918964"}`

**Response:** HTTP 200, body (truncated):

```json
{
  "countryCode" : "XI",
  "vatNumber" : "174918964",
  "requestDate" : "2026-05-13T21:55:59.516Z",
  "valid" : false,
  "name" : "",
  "address" : "",
  ...
}
```

VIES accepts XI as a valid country code and processes the request normally. The specific VAT number returned `valid: false` (test VRN may have been inaccurate), but the request *shape* was accepted — VIES did not throw `INVALID_INPUT` on the XI prefix. **XI is in VIES.** Matches the post-Brexit Northern Ireland Protocol per the `vies.ts:20` comment.

### Test C — DE-prefix control (Siemens VAT `129273398`)

**Request body:** `{"countryCode":"DE","vatNumber":"129273398"}`

**Response:** HTTP 200, body:

```json
{
  "actionSucceed" : false,
  "errorWrappers" : [ {
    "error" : "MS_UNAVAILABLE"
  } ]
}
```

Note: `MS_UNAVAILABLE` means the German member-state service was transiently down at audit time. The call shape was accepted (no `INVALID_INPUT`). This is a known per-MS availability quirk of VIES and is orthogonal to GB coverage.

### Test D — FR-prefix control (L'Oréal VAT `79632012100`)

Re-ran the control with France to escape the DE outage.

**Request body:** `{"countryCode":"FR","vatNumber":"79632012100"}`

**Response:** HTTP 200, body (truncated):

```json
{
  "countryCode" : "FR",
  "vatNumber" : "79632012100",
  "requestDate" : "2026-05-13T21:56:18.425Z",
  "valid" : false,
  "name" : "---",
  "address" : "---",
  ...
}
```

VIES accepts FR, processes the call, returns a structured response. `valid: false` for the specific number (test fixture stale) but the request shape was accepted — confirms VIES is up and CC's call shape is correct. **Control passes.**

### Test E — HMRC production API (Tesco VAT `220430231`)

Out of investigation scope per prompt; sanity check only.

**Request:** `GET https://api.service.hmrc.gov.uk/organisations/vat/check-vat-number/lookup/220430231` with `Accept: application/vnd.hmrc.2.0+json`, no auth header.

**Response:** HTTP 401, body:

```json
{"code": "MISSING_CREDENTIALS", "message": "Authentication information is not provided"}
```

Confirms the HMRC production API is reachable and exists; authentication is required (which is what HMRC support ticket 2026-CNS433 is requesting).

---

## Step 5 — reconciliation

| Surface | Claim | Reality |
|---|---|---|
| Strale code (`vat-validate.ts` + `vies.ts` + `hmrc.ts`) | EU27+XI → VIES; GB → HMRC | ✅ Matches reality |
| Memory entry on VIES coverage | "VAT (EU27): free — EU27 + UK" | ❌ "UK" should be "+XI"; GB is not in VIES |
| Active Vendor Stack page row for VIES | "VAT (EU27) | VIES | … EU27 + UK (DE/ES suppress name/address)" | ❌ "UK" should be "XI"; GB needs its own row pointing at HMRC |
| Empirical VIES behaviour | n/a | GB → `INVALID_INPUT`; XI → processed normally |

**Verdict per the prompt's options: REFUTED.** VIES does not work for GB-prefix VAT. Memory and Active Vendor Stack canonical text are stale.

The only saving grace is that the **code** has been correct all along — whoever wrote `vat-validate.ts` understood the post-Brexit reality and structured the providers accordingly. The drift is purely in the human-readable canonical surfaces that summarise the stack.

---

## Recommended canonical updates (NOT done in this prompt — chat-driven)

### Memory entry (chat-side)

Current text (memory bullet on VAT coverage, approximate wording from the Active Vendor Stack page mirror):
> "VAT (EU27): VIES — free — EU27 + UK (DE/ES suppress name/address)"

Replace with:
> "VAT (EU27+XI via VIES, GB via HMRC): VIES (free) for EU27 + Northern Ireland (XI prefix); HMRC Check a UK VAT Number API v2 (free, OAuth required, sandbox ✓ production credentials pending support ref 2026-CNS433) for GB prefix. Post-Brexit reality — VIES rejects GB with `INVALID_INPUT` at country-code level. Strale's `vat-validate.ts` routes correctly. DE/ES suppress name/address in VIES responses."

### Active Vendor Stack page (Notion `35367c87082c812e88d1dc6bdbfbd4f5`)

The "v1 stack — global legs" table has a single VAT row crediting VIES with "EU27 + UK." Recommended: split into two rows, one for VIES (EU27+XI) and one for HMRC (GB). Cite this verification doc + the existing `vat-validate.ts` architecture as the rationale.

Alternative single-row phrasing if a table split is heavyweight: `VAT validation | VIES (EU27 + XI, free) + HMRC Check a UK VAT Number v2 (GB, free, OAuth) | free | none | n/a | EU27 + XI via VIES; GB via HMRC (post-Brexit; VIES rejects GB with INVALID_INPUT). DE/ES suppress name/address in VIES.`

### HMRC support ticket 2026-CNS433 framing

The memory's "VIES covers UK" wording understates HMRC's importance. Petter's email to HMRC should frame HMRC API as the **sole programmatic path** for UK VAT validation post-Brexit, not an enrichment over VIES. The HMRC sandbox retest report (`apps/api/docs/hmrc-sandbox-test-report-2026-05-13.md`, this session) demonstrates Strale's sandbox integration is functioning end-to-end; the production credential request is the remaining blocker for shipping UK VAT validation as a customer-callable surface.

---

## Follow-ups (named, not executed in this prompt)

1. **Memory edit (chat-driven)** — update the VAT coverage entry per the wording above.
2. **Active Vendor Stack page edit (chat-driven)** — split or rephrase the VAT row.
3. **No code follow-up needed.** `vat-validate.ts` is already correct. If a future audit finds a separate surface (e.g. a marketing page, a public docs page, an OpenAPI description) that claims "VIES covers UK," that's where the next sweep would target.
4. **(Optional)** Add a brief comment to `uk-company-data.ts` noting that VAT enrichment for UK is handled separately by `vat-validate.ts` via HMRC, not via Companies House — orientation for future readers. Trivial, non-load-bearing.

---

## Test details (for reproducibility)

- VIES REST endpoint: `https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number`
- Method: POST, Content-Type: application/json
- HMRC production endpoint (auth required): `https://api.service.hmrc.gov.uk/organisations/vat/check-vat-number/lookup/{vrn}`
- All tests run from the Strale workstation, 2026-05-13 ~21:55–21:56 UTC.
- No authentication used for VIES (it's unauthenticated by design).
- No credentials read from any .env for this investigation. Tests A–D were direct cURL against the public VIES endpoint; Test E was an unauthenticated probe of the HMRC production API to confirm reachability.

---

*This document is the artifact. Memory + Active Vendor Stack edits happen in a follow-up chat-driven step.*
