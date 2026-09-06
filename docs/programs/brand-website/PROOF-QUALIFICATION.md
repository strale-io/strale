# Product example qualification

**Evidence checkpoint: 6 September 2026.** Use this record as dated product-proof evidence. The [narrative handoff](../../../handoff/_general/from-code/2026-09-06-brand-narrative-reset.md) now owns the next editorial task; this proof record does not select the homepage's story or prescribe more page implementation. The earlier [launch boundaries](LAUNCH-PROOF.md) remain the unchanged authoring constraint embedded in illustrative specimens. This record does not approve outward claims or turn those specimens into captured results.

The earlier proof batch selected **extracting fields from a readable invoice image**, using the standalone `invoice-extract` tool, as its test fixture. At that observation, the live catalogue listed it and its source accepted image data. A successful authenticated execution and retrieval were **not** verified: the connector lacked paid authentication, and the configured project key returned HTTP 401. No transaction ID or output was returned. No charge was incurred. The founder was asked to reconnect Strale with an active funded project key; no credential belongs in chat or the repository. These findings are dated, not a fresh access check or an instruction to make invoices the next hero story.

## What we can use now

**Access recheck, 6 September:** at that observation, the connected `strale_balance` tool requested an API key. This was a read-only authentication check; no new execution was attempted and the local key was not re-tested. [Observation](../../../archive/sessions/2026-09-06-brand-editorial-readiness/access-check.json). The earlier editorial draft is background only; continue from the narrative handoff above. Recheck access when the chosen story actually requires new proof.

- Keep the accepted website/social/email studies explicitly illustrative.
- Use a synthetic PNG invoice, not a customer invoice. The [fixture](../../../archive/sessions/2026-09-06-brand-kit-launch-proof/invoice-fixture.png) and [transcription](../../../archive/sessions/2026-09-06-brand-kit-launch-proof/invoice-fixture.txt) contain Example Studio, INV-1042 and EUR 480.00; no payment is due.
- Limit this example to `invoice-extract` with `inputs.base64`. Do not broaden it to PDF or the `invoice-process` solution: the source review found incompatible PDF encoding and solution input mapping. These are separate qualification/remediation work, not additional demo paths.
- Treat the visible supplier/invoice/total as an intended presentation mapping, not guaranteed response keys. The source prompts for the fields but does not enforce the entire output schema.

## Exact next verification

1. Use an existing active funded project credential, or reconnect the Strale app. Do not create another account or acquire a key from customer records.
2. Recheck the current catalogue price and access eligibility. Submit the synthetic PNG once through account `/v1/do` or its authenticated MCP wrapper, with `max_price_cents: 50`. If the price exceeds that cap, stop the attempt and record it; do not silently increase the budget.
3. On success, record the actual route, status, output and transaction ID. If the route returns 202, retrieve that same transaction until it completes within a bounded wait; an accepted job is not a successful extraction. Do not automatically repeat the paid call.
4. Compare `vendor_name`, `invoice_number`, `total_amount` and `currency` with the fixture. Display only observed correct fields. Map supplier to `vendor_name`, invoice to `invoice_number`, and the formatted total to numeric `total_amount` plus `currency`. Missing/null/mismatched fields make this fixture unsuitable until understood.
5. Retrieve only that transaction with the same account credential and compare the returned output/provenance. Keep credentials, owner/account IDs and unrelated history out of evidence. Record the source marker's actual granularity.
6. Save a dated receipt and link the observed fields to the future demo component. One call's latency is one observation, not expected latency or a speed promise. Review any new public wording against the existing claims register before publication.

## Inspection boundaries

| Route | Source-supported behaviour | Current proof limit |
|---|---|---|
| Account `/v1/do` | Returns a transaction ID and result/provenance; the owner can request the transaction record | Live execution and own-record retrieval blocked by authentication |
| MCP `strale_execute` | Calls `/v1/do`, preserves result metadata and points to `strale_transaction` | Wrapper omits the immediate `meta.audit`; connected app is unauthenticated |
| Fresh direct x402 tool | Returns result and a provenance marker | No returned transaction ID or retrievable account record established |
| Cached x402 tool | Returns cached result with original latency and replay marker | Provenance is absent from that response path |
| Fresh/cached x402 solution | Uses distinct result/payment shapes | No equivalent provenance/customer-record parity established |

The newer internally stored execution receipt is distinct from the customer-facing audit/transaction response. Do not draw a receipt dashboard, imply field-level citations, claim complete agent observability or imply all routes expose the same record. The source trace is in [the qualification research](../../research/2026-09-06-invoice-demo-qualification.md).

## Evidence and follow-up

[Catalogue projection](../../../archive/sessions/2026-09-06-brand-kit-launch-proof/catalogue-observation.json), [connector observations](../../../archive/sessions/2026-09-06-brand-kit-launch-proof/connector-observations.json), and [account refusal](../../../archive/sessions/2026-09-06-brand-kit-launch-proof/account-attempt.json) record what happened. The technical source baseline is `9ac4a378`; live observations are dated separately. Public catalogue availability is not proof that the executor succeeded.

Before expanding this demo: qualify/fix PDF document blocks; reconcile the invoice-process input/output mapping; reconcile connector discovery's optional-input/null-price presentation and localhost payment links. Before making stronger inspection claims: verify the precise customer's retrieval path and decide whether the newer receipt must be exposed or the claim omitted. These are bounded follow-up candidates, not permission for money/audit code changes in this documentation batch.

Return to [SYSTEM-COMPLETION.md](SYSTEM-COMPLETION.md) for the website-critical sequence and [the kit index](../../../design/brand-kit/README.md) for accepted design inputs. T3 remains incomplete.
