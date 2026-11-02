Intent: Distribution D9 (Clay HTTP template) and D3 (Coinbase featured tier), tracks T10 and T4.

[BACKFILL] Cloud session; no Notion writes. Branch `feat/d9-clay-d3-coinbase`, worktree `strale-wt-T10`.

## Done

- `examples/clay-enrichment/`: two Clay HTTP API column recipes (`company-status-check`, `vat-validate`) in `recipes.json`, a user doc (README), a three-row sample table, the renderer Clay's columns emulate (`template.mjs`), a CI test (`npm run clay:test`) and a live runner (`run-sample.mjs`, needs a Strale API key, EUR 0.26 a run).
- Every call carries `?src=clay-template` and `X-Strale-Client: clay-template/1.0.0`; both are already recorded by `/v1/do` (`extractClientMeta`) and read by `attribution-rollup.ts`.
- OUTBOX row `cdp-bazaar-curation`, `status: draft`, with the D3 follow-up rule (one at 45 days, then drop).
- T4 and T10 `next_action` updated with start dates, baselines and the D3/D9 thresholds.

## Findings worth knowing

- Coinbase's validator (`POST https://api.cdp.coinbase.com/platform/v2/x402/validate`, 2026-10-29) accepts `/x402/v2/vat-validate` and `/x402/v2/email-validate` (one advisory: no `bazaar.info.output.example` on v2) and **rejects the legacy `/x402/<slug>` paths** because they serve x402 v1. `company-status-check` returns 404 on both x402 paths, so it is not on x402. Both are D2 follow-ups, reported to strale-planning.
- No CDP support email is published; the x402 docs send help to Discord, which D3 rules out. The address is asked of Petter.
- Bazaar search for "strale" (2026-10-29) returned four Strale v2 resources: weather-lookup (48 calls, 1 payer, 30 days), whois-lookup (6, 1), shipping-track (20, 3), vat-validate (13, 2).
- Not run: the template inside Clay itself (needs a Clay account, a founder click) and `run-sample.mjs` against production (this session holds no Strale API key). The CI test checks the recipes against the manifests and the served `/v1/do` envelope; it does not prove Clay's UI behaves as the README describes.
- Test traffic: one free anonymous `iban-validate` call with `src=clay-template` on 2026-10-29 (transaction 136f11cb) must be excluded from D9 counts.

## Next

- Founder: CDP support address; go for a Clay free-account sign-up form.
- After a Clay account exists: run the sample table in Clay and correct the README where Clay's UI differs.
- Link the doc page from the website tool pages for the two tools.
