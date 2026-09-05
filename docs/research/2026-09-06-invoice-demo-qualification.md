---
doc_type: research
type: product
topic: invoice-demo-qualification
question: What can the first invoice extraction story truthfully show on each execution and retrieval route?
date: "2026-09-06"
status: current
sources:
  - manifests/invoice-extract.yaml
  - apps/api/src/capabilities/invoice-extract.ts
  - apps/api/src/routes/do.ts
  - apps/api/src/routes/transactions.ts
  - apps/api/src/routes/audit.ts
  - apps/api/src/routes/x402-gateway-v2.ts
  - packages/mcp-server/src/tools.ts
  - apps/api/src/db/solution-catalogue.ts
  - https://api.strale.io/v1/capabilities/invoice-extract
  - archive/sessions/2026-09-06-brand-kit-launch-proof/catalogue-observation.json
  - archive/sessions/2026-09-06-brand-kit-launch-proof/connector-observations.json
  - archive/sessions/2026-09-06-brand-kit-launch-proof/account-attempt.json
---

# Invoice demo qualification

Source inspection at `9ac4a378`; live observations on 6 September Stockholm time (5 September UTC). Evidence is limited to the supplied source and observed API responses. No successful invoice execution or transaction retrieval occurred. This is research, not authority to publish claims or alter money/audit paths.

## Observed access

The public catalogue endpoint returned HTTP 200 for invoice-extract, price 50 EUR cents and `cost_class: paid_prepaid`. The connector search listed the tool but showed null price and described both inputs as optional. The connector's execution attempt with a synthetic PNG and cap 50 stopped at authentication; its error offered localhost x402 URLs, which are not usable public destinations. The local test/smoke credential variables were placeholders; the configured project key's single account attempt returned HTTP 401, `Invalid API key`. No transaction ID, output or charged execution was observed. Evidence contains no credentials or customer-level activity.

## Input and result truth

The executor requires url or base64, preferring url when both exist ([invoice-extract.ts](../../apps/api/src/capabilities/invoice-extract.ts), lines 110–140). The manifest describes both but requires neither at JSON-schema level. Use a small PNG/JPEG fixture for initial proof.

PDF support is not established by the implementation: URL PDF bytes are labelled `image/png` (lines 84–90), and base64 sniffing recognises JPEG/PNG/GIF/WebP with PNG fallback (99–107). This is a source-level incompatibility, not a live PDF reproduction. The invoice-process catalogue accepts and maps `text` to an executor that reads url/base64; its sample also uses older output keys ([solution-catalogue.ts](../../apps/api/src/db/solution-catalogue.ts), lines 1856–1881). Do not use that solution as proof of this story without separate verification/remediation.

The prompt describes vendor, invoice, currency, monetary/date fields, line items and confidence, but the executor returns any parsed nonempty JSON without full shape enforcement (invoice-extract.ts, lines 12–56 and 166–186). The manifest marks scalar fields common and line_items/confidence rare. The route's schema check checks required keys; this schema has none (do.ts, lines 2895–2917). A declared field is not a guarantee that it is present and correct. The demonstration needs an actual returned result checked against the synthetic input.

The executor's provenance contains only a source marker (`invoice-extract:base64` or url hostname) and a fetched_at timestamp assigned after the model response (lines 180–185). It does not provide document hashes, page regions, field-level citations, evidence excerpts or model identity. The timestamp must not be described as the exact document-fetch instant.

## Execution and retrieval

- Account `/v1/do` synchronous success returns nested result with transaction_id, price, latency, output and provenance, plus meta.audit (do.ts, lines 2400–2415). Routing can become asynchronous when the DB average exceeds the route threshold; null averages use sync (do.ts, lines 1367–1373; execution-routing.ts, lines 39–76). There is no source-backed expected invoice latency.
- MCP execute posts that route and preserves selected result metadata, but drops meta.audit and recommends transaction retrieval (tools.ts, lines 312–320 and 386–417). A single successful connector call would not also prove retrieval.
- The account owner can retrieve their own input/output/provenance/audit trail via transactions.ts, lines 76–124 and 152–165. Free unauthenticated lookup redacts body content (127–189), despite the connector's broader descriptive text. Do not use anonymous lookup as proof of full record access.
- The newer `strale.execution.v1` receipt is created/stored after settlement (do.ts, lines 583–603 and 2264–2268). The transaction/audit response projections do not expose its payload, digest and status. Hash recomputation can incorporate the stored receipt digest without returning the receipt itself (transactions.ts, lines 262–307; audit.ts, lines 457–479). Internal receipt storage and customer retrieval are distinct.
- Fresh x402 tool response contains output and provenance but no transaction ID/audit URL (x402-gateway-v2.ts, lines 1820–1864). Its recorded row has no owning user, is paid and omits provenance (843–874); the row ID and separately built audit URL are not surfaced to the caller. The account-owner/free-tier lookup routes do not establish access to it.
- Cached x402 tool response omits provenance and returns original execution latency with replayed=true (658–672, 1586–1604). Fresh solution response has steps/errors/payment/latency but no equivalent provenance or ID (1411–1442). Cached solution response also lacks provenance/ID and does not project stored errors (1222–1242). No live x402 or replay experiment was performed.

## Consequence for design

Keep the accepted studies illustrative. Once authentication works, run the synthetic PNG through the standalone tool, compare the returned fields with the fixture, and retrieve that same account transaction. Use only that bounded proof in the eventual website example. Keep PDF, solution automation, field-level citations, receipt retrieval and cross-route parity out of the first claim set until separately qualified. The execution checklist and current blocker live in [PROOF-QUALIFICATION.md](../programs/brand-website/PROOF-QUALIFICATION.md).
