# Handoff — 2026-08-05 — screenshot-url Browserless v1/v2 dialect fix

**Intent:** Ran `/activity since-last`, found `screenshot-url` still failing in prod despite a month-old fix sitting unmerged. Merged that branch (PR #148), discovered it didn't actually fix prod, diagnosed the real cause, shipped PR #150.

## What `/activity since-last` showed (2026-07-20 → 2026-08-05)

854 external calls, 711 completed / 143 failed. 97% x402, only 4 unique users — a few heavy agents, not broad usage. Top caps: tech-stack-detect 175, keyword-suggest 102, serp-analyze 61, email-validate 61, google-search 52. 6 signups, notably `simon@pavebank.com` (Pave Bank) who ran sanctions-check on Monzo Bank + pep-check on Monzo's co-founder — real KYB ICP evaluation.

Two failure clusters:
- `screenshot-url` — 13 × HTTP 400 `waitForSelector is not allowed`.
- `product-reviews-extract` — 28 of 31 calls failed, all Trustpilot HTTP 403 bot-protection. **Still open.**

## The bug chain

1. **PR #148 (2026-07-05) was never merged.** Branch `fix/screenshot-waitfor-edgar-retry` sat open for a month while its bugs failed live paying traffic. Merged this session as `df4d8ff`.
2. **Merging it did not fix prod.** Post-deploy verification against `/v1/do` returned a *new* 400: `"waitForTimeout" is not allowed`. PR #148 was verified against the **v2 SaaS** endpoint (`production-sfo.browserless.io`, what local `.env` points at), but production's chromium service is pinned to **Browserless v1** (`browserless/chrome:1.61.1`, `railway-config.md:51`). v1 rejects both v2 wait keys. PR #148 swapped one rejected key for another.
3. The manifest's own documented workaround for JS-heavy pages ("use `wait_for` to target a CSS selector") was equally dead on v1.

## PR #150 — what shipped

Executor sends one dialect, retries once with the other on a wait-key rejection, memoizes the winner per endpoint host (module-level Map) so only the first call per process pays the probe.

**Security fix folded in (review Pass A HIGH, verified by me against the vendor source):** v1's `functions/screenshot.js:144-162` branches on `typeof waitFor`. An **object** → `page.waitForSelector` (safe). A **string** → interpolated *unescaped* into `page.evaluate('...querySelector("<raw>")')`, and any non-selector string executed as `page.evaluate('(<raw>)()')`. Sending a bare-string selector would have put caller-supplied JS inside the chromium container on Railway's private network — defeating the `validateUrl` guard that exists precisely because Browserless fetches from its own network. `screenshot-url` is x402-enabled (anonymous). Never shipped: pre-fix every `wait_for` call 400'd, so no string ever reached the evaluator. Now sends v1's object form, which is also the only shape with a slot for the selector timeout.

**Empirical catch that changed the code:** I probed both endpoints rather than trusting the symmetry assumption. v2 rejects with ajv's `must NOT have additional properties` — **not** Joi's `"X" is not allowed`. Matching only the Joi form would have stranded a warm process that memoized v1 against a host later upgraded to v2 (no retry, hard-fail until restart). Both strings are now matched, with a regression test for stale-memo recovery.

## Verification

tsc clean · vitest 24/24 · validate-capability pass · smoke-test 11/11 · `checkReadiness` **ready=true, 0 issues** · CI green.

Post-deploy against prod (`dfc122cace72`), all previously-failing:
- `wait_for:"3"` on tenex.co → 200, 8.4s
- `wait_for:"h1"` (selector path) → 200, 1.29MB PNG
- **Original customer input** `arkm.com/explorer/address/TAJH8...` `wait_for:"8"` → 200, 10.9s

## Reviewer findings carried forward (MEDIUM, in PR body)

- Dialect knowledge is capability-local; arguably belongs beside `buildBrowserlessRequestUrl` in `lib/browserless-launch.ts`. Left local — `screenshot-url` is today the only caller sending a version-sensitive wait key. Debt for the next one.
- `browserless-launch.ts` docstring says "Build a Browserless **v2** request URL" while prod is pinned v1. Misleading regardless of this PR; not fixed here to keep the diff to one concern.
- Cold-start default is v2 while the only prod host is v1 → one wasted fast-400 per process restart. Self-correcting; inverting just moves the cost to dev.

## Open threads

- **`product-reviews-extract` Trustpilot 403** — 28 failures/16 days, users retrying the same URL 3-4×. Needs a working path, an upfront rejection with a real limitation, or routing to `trustpilot-score`. Note `trustpilot-score` is in the auto-register DEACTIVATED list ("Trustpilot scraping prohibited by ToS, DEC-20260420-H"), so the honest answer is probably documented rejection.
- **Search typeahead gaps** (from `suggest_log`): `"fx"` returns zero results though `exchange-rate` exists — cheap alias fix. Also zero-result: travel/itinerary cluster, `"relocation visa immigration"`, `"south africa"` (no ZA company data).
- **`railway-config.md` v1 pin revisit date was 2026-08-06** — i.e. tomorrow. Whoever handles it should know the dialect fallback now self-heals a v1→v2 migration on cold start, but a warm process needs a restart to re-probe.
- PR #148's own open thread (`task_694ae016`, us-company-data wrong-CIK match risk) — that landed with the merge; the low-confidence guard is in.

## Note for next session

The deploy-mechanism lesson from DEC-20260504-C repeated itself in a new shape: PR #148 verified the *code* against a real endpoint, but not against **the endpoint prod actually uses**. Local `.env` points at the v2 SaaS; prod points at the pinned v1 container. Any Browserless-touching change needs verification against the v1 container, not just local.
