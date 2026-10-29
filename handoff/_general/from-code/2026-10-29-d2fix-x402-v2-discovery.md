Intent: Fix the D9/D3 lane's D2 findings (PR #814, "To strale-planning"): x402 v2 discovery advertising and output examples; `company-status-check` on x402.

[BACKFILL] Cloud session `strale-d2fix`; no Notion writes. Branch `fix/x402-v2-discovery-advertising`, worktree `strale-wt-d2fix`.

## Done

- The A2A card, the `/v1/do` insufficient-balance `x402_fallback` hint, the hosted MCP pay-per-call hints (`packages/mcp-server/src/tools.ts`) and `llms.txt` now advertise `/x402/v2/<slug>`. The catalogue, `/.well-known/x402(.json)` and OpenAPI already did (#784).
- `bazaar.info.output.example` now comes from the manifest's `output_schema.example` for 59 of the 275 live tools (was 13). The two-word "possible personal name" heuristic applies to inputs only; every other screen still applies to outputs.
- The personal-field screen now also names author, owner, applicant, holder, signer, registrant, contact, ceo, founder and inventor keys (review follow-up). `url-to-text`'s example was refreshed from the live page; the old one carried a stale capability count.
- Legacy `/x402/<slug>` and `/v1/do` behaviour unchanged for v1 payers. Evidence: [receipt](../../../archive/receipts/2026-10-29-test-run-x402-v2-output-examples.json), [review follow-up receipt](../../../archive/receipts/2026-10-29-test-run-x402-v2-output-examples-review.json).
- Not in this PR: the npm `strale-mcp` package keeps the old hint until its next release (hosted `/mcp` updates on deploy); strale-frontend's `public/llms.txt` was not checked from this cloud session.

## Not fixed, and why

- `company-status-check` 404s on every surface (`/x402/*` and `/v1/capabilities/*`) because it was never onboarded into the production table. Same for `entity-resolve`, `eurostat-data`, `invoice-counterparty-check` (checked 2026-10-29 10:40 CET). This is DQ-41: `ONBOARDING_RUN_SECRET` is not set. Onboarding creates it invisible and not x402-enabled, so after the button runs it still needs the usual promotion before x402 sells it.
- 216 live tools still have no output example: personal-data or compliance tools (81, withheld on purpose), oversized (48), schema-invalid manifest examples (H3 follow-ups), missing (10), and other screen hits.

## Next

The per-key `/v1/do` rate limit (finding 3) is the next PR from this lane.
