Intent: /activity since-last on the 2026-08-09→10 window, then investigate the one failure in it that looked like ours (web-extract navigation timeout on randolphlaw.com).

## Outcome: no code shipped, no PR. The investigation dissolved the bug.

Net result is four findings and a correction. Every failure in the window turned out to be correct behaviour.

## Activity window (2026-08-09 21:25 → 2026-08-10 11:54 CET)

101 external calls, 97 completed / 4 failed, **0 signups, 0 wallet, 0 free-tier, 0 solutions — 100% x402**.

- `google-search` alone was 70 of 101. Remaining 31 spread thin across 17 capabilities.
- 4 failures: 2× `product-reviews-extract` refusing Trustpilot (policy, working as designed), 1× `tech-stack-detect` HTTP 429 from balsamhill.com (upstream), 1× `web-extract` Browserless nav timeout on randolphlaw.com.
- 0 `no_matching_capability` logs. 4 typeahead searches (SE registry ×2, iban-validate, "web intelligence lookup"), none zero-result.

**Who's paying:** the dominant user is a legal-intelligence operation running one repeated recipe over a list of startups — *(a)* privacy/COPPA/wiretap/FCRA litigation exposure, *(b)* identify the general counsel or outside counsel. Clusters: femtech/health (Oova, Proov, Tiny Health, myLAB Box, Happy V), kids/edtech COPPA (Synthesis, Boddle, TruPlay, Legends of Learning, Gen-Z Media), AI companions/neurotech (Nomi/Glimpse.ai, Friend.com, Emotiv, Neurable), privacy-litigation targets (Stardust, Coffee Meets Bagel, Cuebiq), fintech (Hiatus, Qapital, Grifin, Clearcover). Queries escalate in sophistication across the session — broad → `site:` operators → exact corporate entities ("TruPlay Games, Inc.") → named-individual follow-ups. They are paying per raw search and doing the synthesis by hand.

Secondary: SEO operator (escorts.dating across backlink-check/domain-reputation/seo-audit; separate FR head-spa local-SEO thread), catalog-walking probe traffic (github.com, example.com, AAPL/NVDA, EG holidays), 2 real B2B emails, and 2 `image-to-text` calls against `sfs.monid.ai` signed URLs — an identity/KYC vendor running document OCR through us.

## The web-extract investigation

**randolphlaw.com is a dead host, not a slow page.** Bumping the timeout does not fix it.

```
networkidle0     → HTTP 500 @ 36.1s
domcontentloaded → HTTP 500 @ 36.1s     ← rules out a networkidle0 settling issue
networkidle2     → HTTP 500 @ 36.0s
curl :443        → could not connect after 21.1s (real UA and default UA both)
```

TCP connect never completes. A longer timeout only makes the failure slower.

**Measured latency contradicted the async premise.** Pulled from transactions rather than estimated:

```
web-extract, completed, 90d:  n=7   p50=3463ms   p90=6473ms   max=6473ms
```

The stored `avg_latency_ms = 5000` is accurate. An in-session estimate of "8–15s" was a guess and was wrong — corrected before it drove a change. `avg_latency_ms` is also db-authoritative per `capability-field-authority.ts:131` ("measured at runtime, not authored"), so raising it to force async would have meant writing a number the measurements contradict.

**x402 has no async path at all.** The threshold lives in exactly one place — `do.ts:1003`. `x402-gateway-v2.ts:1124` calls `getExecutor()` and runs it inline; there is no 202 anywhere in the file. So `avg_latency_ms` has zero effect on x402 traffic regardless of its value. Sized the exposure:

| slug | declared | 30d calls | p50 | max |
|---|---|---|---|---|
| company-enrich | 15000 | 9 | 8233ms | **42908ms** |
| eu-trademark-search | 12000 | 1 | 2308ms | 2308ms |
| competitor-compare | 15000 | 0 | — | — |

Ten calls in thirty days across all three, with one x402 caller having held a sync connection for 43 seconds. Real, but not yet worth a breaking change for every x402 client that expects an inline result.

## Correction — the timeout change was already shipped

The 20s→25s / 30s→35s alignment was re-derived from scratch this session, comment-for-comment, before discovering it is **already committed in open PR #171** (branch `fix/ticker-resolution-and-x402-input-validation`, listed there as a rider). It was never on `main` and is not on `fix/registry-name-resolution`, so the working tree showed main's 20000/30000 — which read as an unexplained revert mid-session. It was a branch switch, not a revert.

Nothing to re-apply. The change merges with #171.

## Open threads

- **x402 async — deferred with a trigger.** Revisit when any x402-enabled capability above the 10s threshold clears ~100 calls/month, or when a client reports a timeout. Until then the fix costs more than the problem. Cheaper interim option if the 43s tail becomes a concern: tighten the outer `AbortSignal` on the slow Browserless callers (no contract change, no polling). Their current values were not audited.
- **The google-search legal-research user is the real signal.** 70 calls/day of hand-assembled litigation-exposure + counsel-identification. `adverse-media-check` already covers roughly half the recipe. Packaging it as one call is a product conversation worth more than the async plumbing.
- Branch hygiene: `fix/registry-name-resolution` carries open PR #161; anything new branches off `main` (in sync at `aecb13f`).

## Non-obvious learnings

- **A clean working tree does not mean the change was lost.** With several open PRs on sibling branches, a branch switch is indistinguishable from a revert if you only look at `git diff` and `git status`. Check `gh pr list` / `gh pr diff` for the file before concluding anything about a change's fate — the existing "verify against origin/main" rule is necessary but not sufficient.
- **A failing external URL is not evidence of a timeout bug.** Probe reachability (`curl`) and vary `waitUntil` before tuning any timeout value; both took under a minute and killed the premise.
- **Sizing beats intuition on "should we build the async path".** The question felt architectural; one query turned it into "ten calls a month" and answered itself.

Cost: ~6 live Browserless renders, 3 read-only DB queries, no LLM-billed capability calls beyond one web-extract attempt.
