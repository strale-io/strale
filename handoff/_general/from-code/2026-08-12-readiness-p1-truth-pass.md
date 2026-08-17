# 2026-08-12 — Readiness P1: truth & legality pass executed

**Intent:** Merge PR #178 (P0 baseline) and run P1 per the disposition worklist —
wrong-company fixes, machine-surface truth, fixture repairs, ToS enforcement.

**Mode:** Full. Continues `2026-08-12-readiness-p0-baseline.md` (same day).

---

## Merged this session

| PR | Content |
|---|---|
| [#178](https://github.com/strale-io/strale/pull/178) | P0 baseline (program adoption, prod sweep, disposition v1) |
| [#171](https://github.com/strale-io/strale/pull/171) | us-company-data ticker resolution + x402 input validation (was blocked on a manifest-guard failure — fixed, updated, merged; post-merge backfills + prod checks run: AAPL → Apple Inc. via `ticker`) |
| [#179](https://github.com/strale-io/strale/pull/179) | P1 truth pass (see below) |
| strale-frontend [#15](https://github.com/strale-io/strale-frontend/pull/15) | llms.txt `max_price_cents` Required (verified live) |

## P1 changes (PR #179, both commits six-lens reviewed pre-PR)

1. **german-company-data wrong-company class closed** — scored name resolution
   (classifyNameMatch) with tie refusal between distinct entities; HRB path verifies
   type + number + **court** (per-Amtsgericht uniqueness); sentence-input hint.
   Review averted a regression I had introduced: `kg`/`ev` in the shared suffix list
   collapsed "Muster GmbH" and "Muster GmbH & Co. KG" (distinct legal entities) into
   false exact matches — both tokens removed, se/ug/kgaa/ohg/mbh kept, sibling-refusal
   cases pinned in the shared test file. Live-verified: the P0 wrong-company input now
   refuses with candidates; SAP SE resolves.
2. **x402 pricing exact end-to-end** — integer micro-USD in lib AND the v2 gateway
   path (review caught that the first fix didn't reach the code serving traffic).
   Catalog artifacts (`0.21600000000000003`) gone; the systematic +1 atomic-unit
   settlement overcharge gone; NaN guard on EUR_USD_RATE. Deploy note: settled
   amounts DROP by 1 atomic unit at 5/10/20/80/350c — an agent holding a pre-deploy
   402 quote sees a seconds-long window of 1-micro-USD skew (price-down direction).
3. **ToS blocklist on all 7 arbitrary-URL paths** (web-extract, url-to-markdown,
   tech-stack-detect, screenshot-url, cookie-scan, privacy-policy-analyze,
   terms-of-service-extract) + limitations documented in the top-3 manifests.
   Review showed gating web-extract alone left cheaper doors open — including
   free-tier url-to-markdown and tech-stack-detect (the blocklist docstring's own
   documented LinkedIn exploit path). Long-term: move the assertion into
   safe-fetch/browserless-extract so new URL capabilities can't ship ungated (filed).
4. **13-slug fixture truth pass** — volatile `equals` pins (cz/fr/nl dates, belgian
   abbreviation), flaky httpbin deps (base64→example.com, image-to-text→Wikimedia),
   SQL-probe input (eu-regulation-search), garbage duplicate row (llm-cost), wrong
   health field names (input_tokens→prompt_tokens), pathological GoPlus address.
   New `scripts/sync-known-answer-fixtures.ts` (transactional, healthiest-survivor,
   clears stale baselines, syncs schema_check inputs, prints target DB).
   **12/13 re-verified PASS by real prod calls.**
5. **image-to-text** now fetches via safeFetch → base64 (Anthropic's URL fetcher
   failed on UA-gated hosts; also closes the F-0-006 Bucket D residual risk).
6. **danish-company-data quarantined** — first DEC-20260812-A floor action
   (visible=false, x402_enabled=false, recorded in the manifest with reversal path).

## Post-deploy verification (prod, commit f5e19c8)

- Re-sweep of code-changed slugs: **5/6 PASS** (german-company-data, web-extract,
  tech-stack-detect, url-to-markdown, image-to-text); eu-regulation-search still
  fails (filed below).
- `/x402/catalog`: **zero float artifacts** across all entries (sanctions-check
  `price_usd: 0.216`).
- German wrong-company input refuses live with the court-aware message; Trustpilot
  via web-extract refuses with the ToS message — both uncharged (DEC-14).
- llms.txt live with `max_price_cents: Required`.

## Still open after P1 (next session's worklist)

1. **eu-regulation-search** — fails even with a real query ("No EU regulations found
   for 'artificial intelligence act'", 201ms — suspiciously fast for a Browserless
   path). EUR-Lex scraper likely rotted; needs dedicated triage.
2. **nl-housing-price-index** — CBS OData works from EU (verified 200/0.9s from
   Sweden), fails from Railway US East. Needs the estonian-style Browserless EU
   proxy fallback, or quarantine (0 calls/90d).
3. **us-court-search** — `COURTLISTENER_API_TOKEN` invalid (403 locally AND in prod).
   **Petter: regenerate the token** (courtlistener.com account) or quarantine.
4. **invoice-extract** — fixture needs a stable self-hosted sample invoice
   (suggest: strale-frontend `public/fixtures/sample-invoice.png`); httpbin URL is
   dead and no stable public invoice image found.
5. **Quality-floor proposals** (30d window, corrected): quarantine screenshot-url
   (55%), brazilian-company-data (59%), url-to-text (54%); **deactivate
   product-reviews-extract (12% on 43 calls/30d)** — deactivating a revenue earner
   is a Petter decision per the escalation contract.
6. **~45 either/or manifests** still lack anyOf declarations (the #171 x402
   validator understands them; nothing declares them). Data campaign.
7. **do.ts wallet-path anyOf parity** (reuse validateX402Input) — open from 08-12.
8. Move `assertTargetAllowed` into the shared fetch layer (see 3).
9. `activation-emails.ts` hardcodes "250+ capabilities" — drift surface for the guard.
10. Danish datacvr.virk.dk application (Petter), then un-quarantine.

## Cost & ops

- OpenRegister: 4 live calls (50/mo free tier). Prod re-sweeps: ~€0.10 external.
- Test wallet ~€46 remaining of the €50 top-up.
- Circuit breakers from the P0 sweep have all recovered or reflect genuinely-broken
  capabilities (us-court-search open, correct).
- Review-gate caveat: cross-provider independent review not executable in-harness
  (Model-OS gate); two same-provider adversarial passes ran instead, disclosed in
  the PR body. The passes caught 4 HIGHs including one I introduced — worth keeping.
