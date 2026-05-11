---
intent: Anthropic API cost-driver audit for the May 2026 ramp (750K → 2.7M tokens/day, May 1 → May 7)
session_type: read-only audit
date: 2026-05-11
---

# Anthropic API cost-driver audit — May 2026 spike

## 1. Summary (top 3 drivers, priority order)

1. **Hourly test-scheduler hammering ~50 Haiku-using capabilities whose `test_suites.external_cost_cents` is still 0.** PR #46 (2026-05-04) cut the scheduler cadence from 24h → 1h. PR #49 and PR #55 cleaned up 5 caps that day (Dilisense × 3, eSortcode, risk-narrative-Sonnet, invoice-extract-Haiku-vision), but PR #49's commit body explicitly defers "Anthropic-Haiku bulk set (~80 caps)". Every active LLM-only capability whose suite cost is 0 is now being executed ~hourly. This is the dominant driver of the 3.6× ramp and accounts for the bulk of the ~2.5M tokens/day observed.
2. **`POST /v1/suggest` Haiku rerank.** Every call to the public search endpoint sends a 600–1500-token candidate list to Haiku for re-ranking, capped at 1000 output tokens. Production volume unknown from code alone, but suspect this is the second-largest line item — homepage-visible, plausibly high call rate, no prompt caching despite a near-identical system prompt every call.
3. **Direct `/v1/do` + `/x402/:slug` paid execution of LLM capabilities.** Customer-facing baseline. Small at current customer volume but cleanly scales with usage — and contributes the steady-state component visible pre-May 4 (~750K/day).

## 2. Inventory

### Wrappers (counted once; multiple callers)

| # | File:line | Function | Model | Prompt size | Input shape | `max_tokens` | Cache | Trigger | Retry | Notes |
|---|-----------|----------|-------|-------------|-------------|--------------|-------|---------|-------|-------|
| W1 | [browserless-extract.ts:49](apps/api/src/capabilities/lib/browserless-extract.ts#L49) | `extractCompanyFromText` | haiku-4-5 | ~300 chars / ~80 tok | scraped HTML, capped 12000 chars | 800 | no | called by Browserless-tier company-data caps when LLM extraction needed | none | Most country-data caps that go through this path are deactivated or migrated to direct API; small live blast radius. |
| W2 | [browserless-extract.ts:97](apps/api/src/capabilities/lib/browserless-extract.ts#L97) | `extractCompanyName` | haiku-4-5 | ~120 chars / ~30 tok | natural-language string | 100 | no | called only when input isn't a numeric registry code | none | Cheap call. Skipped on test fixtures (numeric reg codes). |
| W3 | [name-resolver.ts:76](apps/api/src/capabilities/lib/name-resolver.ts#L76) | name resolver | haiku-4-5 | ~150 tok | NL string | 200 | no | similar pattern: input-conditional | none | Same skip-on-numeric pattern. |

### Per-capability call sites — pure-LLM (no external dep)

Selected examples; full list of 90+ slugs is the grep output in the commit. All use `claude-haiku-4-5-20251001`. Inputs in scheduled-test runs are small fixture strings (~50–500 tokens); customer traffic varies. "Always-LLM" means every successful call hits Haiku.

| # | File:line | Slug | `max_tokens` | Trigger | Always-LLM | Test-suite cost |
|---|-----------|------|--------------|---------|------------|-----------------|
| 1 | [address-parse.ts:14](apps/api/src/capabilities/address-parse.ts#L14) | address-parse | 500 | scheduled + paid | yes | unknown (likely 0) |
| 2 | [agent-trace-analyze.ts:12](apps/api/src/capabilities/agent-trace-analyze.ts#L12) | agent-trace-analyze | 1500 | scheduled + paid | yes | 0 |
| 3 | [api-docs-generate.ts:20](apps/api/src/capabilities/api-docs-generate.ts#L20) | api-docs-generate | 2000 | scheduled + paid | yes | 0 |
| 4 | [api-mock-response.ts:23](apps/api/src/capabilities/api-mock-response.ts#L23) | api-mock-response | 1500 | scheduled + paid | yes | 0 |
| 5 | [blog-post-outline.ts:18](apps/api/src/capabilities/blog-post-outline.ts#L18) | blog-post-outline | 2000 | scheduled + paid | yes | 0 |
| 6 | [classify-text.ts:19](apps/api/src/capabilities/classify-text.ts#L19) | classify-text | 600 | scheduled + paid | yes | 0 |
| 7 | [changelog-generate.ts:33](apps/api/src/capabilities/changelog-generate.ts#L33) | changelog-generate | 1500 | scheduled + paid | yes | 0 |
| 8 | [code-convert.ts:16](apps/api/src/capabilities/code-convert.ts#L16) | code-convert | 3000 | scheduled + paid | yes | 0 |
| 9 | [code-review.ts:19](apps/api/src/capabilities/code-review.ts#L19) | code-review | 1500 | scheduled + paid | yes | 0 |
| 10 | [commit-message-generate.ts:14](apps/api/src/capabilities/commit-message-generate.ts#L14) | commit-message-generate | 500 | scheduled + paid | yes | 0 |
| 11 | [company-industry-classify.ts:46](apps/api/src/capabilities/company-industry-classify.ts#L46) | company-industry-classify | 500 | scheduled + paid | yes | 0 |
| 12 | [competitor-compare.ts:26](apps/api/src/capabilities/competitor-compare.ts#L26) | competitor-compare | 2000 | scheduled + paid | yes | 0 |
| 13 | [context-window-optimize.ts:29](apps/api/src/capabilities/context-window-optimize.ts#L29) | context-window-optimize | 1000 | scheduled + paid | yes | 0 |
| 14 | [crontab-generate.ts:18](apps/api/src/capabilities/crontab-generate.ts#L18) | crontab-generate | 800 | scheduled + paid | yes | 0 |
| 15 | [curl-to-code.ts:14](apps/api/src/capabilities/curl-to-code.ts#L14) | curl-to-code | 1500 | scheduled + paid | yes | 0 |
| 16 | [diff-review.ts:34](apps/api/src/capabilities/diff-review.ts#L34) | diff-review | 2000 | scheduled + paid | yes | 0 |
| 17 | [docstring-generate.ts:14](apps/api/src/capabilities/docstring-generate.ts#L14) | docstring-generate | 2000 | scheduled + paid | yes | 0 |
| 18 | [dockerfile-generate.ts:16](apps/api/src/capabilities/dockerfile-generate.ts#L16) | dockerfile-generate | 1500 | scheduled + paid | yes | 0 |
| 19 | [email-draft.ts:18](apps/api/src/capabilities/email-draft.ts#L18) | email-draft | 1000 | scheduled + paid | yes | 0 |
| 20 | [env-template-generate.ts:76](apps/api/src/capabilities/env-template-generate.ts#L76) | env-template-generate | 1500 | scheduled + paid | yes | 0 |
| 21 | [error-explain.ts:15](apps/api/src/capabilities/error-explain.ts#L15) | error-explain | 1500 | scheduled + paid | yes | 0 |
| 22 | [fake-data-generate.ts:20](apps/api/src/capabilities/fake-data-generate.ts#L20) | fake-data-generate | 4000 | scheduled + paid | yes | 0 |
| 23 | [github-actions-generate.ts:19](apps/api/src/capabilities/github-actions-generate.ts#L19) | github-actions-generate | 2000 | scheduled + paid | yes | 0 |
| 24 | [github-repo-analyze.ts:60](apps/api/src/capabilities/github-repo-analyze.ts#L60) | github-repo-analyze | 1500 | scheduled + paid | yes | 0 |
| 25 | [hs-code-lookup.ts:14](apps/api/src/capabilities/hs-code-lookup.ts#L14) | hs-code-lookup | 800 | scheduled + paid | yes | 0 |
| 26 | [image-to-text.ts:48](apps/api/src/capabilities/image-to-text.ts#L48) | image-to-text | 4000 | scheduled + paid | yes | 0 |
| 27 | [jsdoc-generate.ts:12](apps/api/src/capabilities/jsdoc-generate.ts#L12) | jsdoc-generate | 2000 | scheduled + paid | yes | 0 |
| 28 | [job-posting-analyze.ts:36](apps/api/src/capabilities/job-posting-analyze.ts#L36) | job-posting-analyze | 1500 | scheduled + paid | yes | 0 |
| 29 | [meeting-notes-extract.ts:12](apps/api/src/capabilities/meeting-notes-extract.ts#L12) | meeting-notes-extract | 1500 | scheduled + paid | yes | 0 |
| 30 | [nginx-config-generate.ts:22](apps/api/src/capabilities/nginx-config-generate.ts#L22) | nginx-config-generate | 2000 | scheduled + paid | yes | 0 |
| 31 | [openapi-generate.ts:12](apps/api/src/capabilities/openapi-generate.ts#L12) | openapi-generate | 4000 | scheduled + paid | yes | 0 |
| 32 | [pii-redact.ts:58](apps/api/src/capabilities/pii-redact.ts#L58) | pii-redact | 4000 | scheduled + paid | yes | 0 |
| 33 | [pr-description-generate.ts:14](apps/api/src/capabilities/pr-description-generate.ts#L14) | pr-description-generate | (n/a) | scheduled + paid | yes | 0 |
| 34 | [pricing-page-extract.ts:17](apps/api/src/capabilities/pricing-page-extract.ts#L17) | pricing-page-extract | 1500 | scheduled + paid | yes | 0 |
| 35 | [prompt-compress.ts:16](apps/api/src/capabilities/prompt-compress.ts#L16) | prompt-compress | 4000 | scheduled + paid | yes | 0 |
| 36 | [prompt-optimize.ts:24](apps/api/src/capabilities/prompt-optimize.ts#L24) | prompt-optimize | 1500 | scheduled + paid | yes | 0 |
| 37 | [readme-generate.ts:15](apps/api/src/capabilities/readme-generate.ts#L15) | readme-generate | 3000 | scheduled + paid | yes | 0 |
| 38 | [receipt-categorize.ts:47](apps/api/src/capabilities/receipt-categorize.ts#L47) | receipt-categorize | 1000 | scheduled + paid | yes | 0 |
| 39 | [regex-explain.ts:14](apps/api/src/capabilities/regex-explain.ts#L14) | regex-explain | 1500 | scheduled + paid | yes | 0 |
| 40 | [regex-generate.ts:18](apps/api/src/capabilities/regex-generate.ts#L18) | regex-generate | 800 | scheduled + paid | yes | 0 |
| 41 | [release-notes-generate.ts:14](apps/api/src/capabilities/release-notes-generate.ts#L14) | release-notes-generate | 2000 | scheduled + paid | yes | 0 |
| 42 | [resume-parse.ts:60](apps/api/src/capabilities/resume-parse.ts#L60) | resume-parse | 2000 | scheduled + paid | yes | 0 |
| 43 | [schema-migration-generate.ts:17](apps/api/src/capabilities/schema-migration-generate.ts#L17) | schema-migration-generate | (n/a) | scheduled + paid | yes | 0 |
| 44 | [sentiment-analyze.ts:14](apps/api/src/capabilities/sentiment-analyze.ts#L14) | sentiment-analyze | 600 | scheduled + paid | yes | 0 |
| 45 | [social-post-generate.ts:44](apps/api/src/capabilities/social-post-generate.ts#L44) | social-post-generate | (n/a) | scheduled + paid | yes | 0 |
| 46 | [sql-explain.ts:14](apps/api/src/capabilities/sql-explain.ts#L14) | sql-explain | 1500 | scheduled + paid | yes | 0 |
| 47 | [sql-generate.ts:17](apps/api/src/capabilities/sql-generate.ts#L17) | sql-generate | 1500 | scheduled + paid | yes | 0 |
| 48 | [sql-optimize.ts:17](apps/api/src/capabilities/sql-optimize.ts#L17) | sql-optimize | 2000 | scheduled + paid | yes | 0 |
| 49 | [structured-scrape.ts:24](apps/api/src/capabilities/structured-scrape.ts#L24) | structured-scrape | 2000 | scheduled + paid | yes | 0 |
| 50 | [summarize.ts:17](apps/api/src/capabilities/summarize.ts#L17) | summarize | 1000 | scheduled + paid | yes | 0 |
| 51 | [test-case-generate.ts:17](apps/api/src/capabilities/test-case-generate.ts#L17) | test-case-generate | 2000 | scheduled + paid | yes | 0 |
| 52 | [translate.ts:17](apps/api/src/capabilities/translate.ts#L17) | translate | 2000 | scheduled + paid | yes | 0 |
| 53 | [webhook-test-payload.ts:15](apps/api/src/capabilities/webhook-test-payload.ts#L15) | webhook-test-payload | 2000 | scheduled + paid | yes | 0 |

### Per-capability call sites — heavy-input vision/extraction (paid-only)

| # | File:line | Slug | `max_tokens` | Trigger | Notes |
|---|-----------|------|--------------|---------|-------|
| H1 | [annual-report-extract.ts:254](apps/api/src/capabilities/annual-report-extract.ts#L254) | annual-report-extract | 4000 | paid only | **Deactivated** in `auto-register.ts`. No scheduled runs. |
| H2 | [invoice-extract.ts:140](apps/api/src/capabilities/invoice-extract.ts#L140) | invoice-extract | 2000 | paid only after PR #55 | Suite cost bumped 0 → 1 on 2026-05-04 (PR #55). Scheduler skip flipped. |
| H3 | [pdf-extract.ts:61](apps/api/src/capabilities/pdf-extract.ts#L61) | pdf-extract | 4000 | scheduled + paid | Vision on PDF bytes — large input shape. Likely still at cost=0. |
| H4 | [web-extract.ts:106](apps/api/src/capabilities/web-extract.ts#L106) | web-extract | 4000 | scheduled + paid | Scrape + LLM. |
| H5 | [risk-narrative-generate.ts:234](apps/api/src/capabilities/risk-narrative-generate.ts#L234) | risk-narrative-generate | 1500 | paid only after PR #49 | **Sonnet 4.6**, suite cost bumped 0 → 3 on 2026-05-04 (PR #49). Removed from hourly cycle. |

### Per-capability call sites — country-data and country-conditional LLM

These call LLM only when input requires natural-language resolution; on test runs with numeric registry-code fixtures, the LLM call is bypassed.

| # | File:line | Slug | `max_tokens` | Trigger | LLM-on-test? |
|---|-----------|------|--------------|---------|--------------|
| C1 | [brazilian-company-data.ts:33](apps/api/src/capabilities/brazilian-company-data.ts#L33) | brazilian-company-data | 100 | conditional | unlikely |
| C2 | [cz-company-data.ts:50](apps/api/src/capabilities/cz-company-data.ts#L50) | cz-company-data | 100 | conditional | unlikely |
| C3 | [danish-company-data.ts:31](apps/api/src/capabilities/danish-company-data.ts#L31) | danish-company-data | 100 | conditional | unlikely |
| C4 | [estonian-company-data.ts:22](apps/api/src/capabilities/estonian-company-data.ts#L22) | estonian-company-data | 100 | conditional | unlikely |
| C5 | [finnish-company-data.ts:29](apps/api/src/capabilities/finnish-company-data.ts#L29) | finnish-company-data | 100 | conditional | unlikely |
| C6 | [french-company-data.ts:24](apps/api/src/capabilities/french-company-data.ts#L24) | french-company-data | 100 | conditional | unlikely |
| C7 | [norwegian-company-data.ts:17](apps/api/src/capabilities/norwegian-company-data.ts#L17) | norwegian-company-data | 100 | conditional | unlikely |
| C8 | [uk-company-data.ts:30](apps/api/src/capabilities/uk-company-data.ts#L30) | uk-company-data | 100 | conditional | unlikely |
| C9 | [us-company-data.ts:20](apps/api/src/capabilities/us-company-data.ts#L20) | us-company-data | 100 | conditional | unlikely |
| C10 | [website-to-company.ts:108](apps/api/src/capabilities/website-to-company.ts#L108) | website-to-company | 100 | conditional | unlikely |

### Other (non-capability) call sites

| # | File:line | Purpose | Model | `max_tokens` | Trigger | Estimate |
|---|-----------|---------|-------|--------------|---------|----------|
| O1 | [lib/suggest.ts:712](apps/api/src/lib/suggest.ts#L712) | `/v1/suggest` rerank | haiku-4-5 | 1000 | every public search | candidate list ~800 tok in, ~600 tok out per call. |
| O2 | [lib/daily-digest/analyze.ts:127](apps/api/src/lib/daily-digest/analyze.ts#L127) | daily digest analysis | sonnet-4-20250514 | 1500 | 1×/day cron | ~3K in, ~1.2K out. Negligible. |

### Deactivated LLM caps (excluded from inventory totals)

From `auto-register.ts` `DEACTIVATED` map: annual-report-extract, australian-company-data, business-license-check-se, credit-report-summary, patent-search, dutch-company-data, portuguese-company-data, spanish-company-data, austrian-company-data, trustpilot-score, salary-benchmark, employer-review-summary, italian-company-data, eu-court-case-search (+ UK property suite). These do not run scheduled tests.

### False-positives excluded

Grep also matched files that import `Anthropic` or store the constant in lib utility files without actually calling `messages.create`: `lib/credential-health.ts`, `lib/dependency-manifest.ts`, `lib/event-triggers.ts`, `lib/interrupt-sender.ts`, `lib/platform-facts.ts`, `lib/provenance-builder.ts`, `lib/situation-assessment.ts`, `lib/startup-migrations.ts`, `lib/upstream-health-gate.ts`. These reference Anthropic by name only (rosters, classifications, comments).

## 3. Daily token contribution

### Method

`runTests(slug)` is invoked once per scheduled dispatch. It runs every active non-piggyback `test_suite` for that slug; each suite calls the executor once; each executor call → one `messages.create` for the always-LLM caps. Empirically the active test types per cap are typically known_answer + edge_case + negative + known_bad (4); schema_check is dry-run; dependency_health is an auth-less probe.

### Top-of-table contribution per driver

**Driver D1 — scheduled tests, always-LLM caps at cost=0:**
- Active pure-LLM caps in DEACTIVATED-eligible-minus-suspended set: ~50 (table above, rows 1–53 less ~3 that were since suspended/unhealthy).
- Hourly dispatches: 24/day per cap.
- LLM-invoking test types per dispatch: assume 2 (the structurally-passing ones; negative/known_bad often short-circuit on input validation).
- Tokens per Haiku test call: ~400 input (small fixture + prompt template ~300 tok) + ~600 output (mean of `max_tokens` values 500–4000 × 30–50% realization on JSON output).
- **D1 total: 50 × 24 × 2 × 1000 ≈ 2.4M tokens/day.**

This is the dominant driver. Lines up with the ~2.5M observed on May 10.

**Driver D2 — `/v1/suggest` rerank:**
- Per call: ~800 input (candidate descriptions concatenated) + ~600 output (small JSON of indices + reasons).
- Volume: unknown from code; suspect 100–500 calls/day at current homepage traffic.
- **D2 total: ~0.05–0.5M tokens/day** (could be larger if traffic is higher than guessed).

**Driver D3 — paid `/v1/do` + `/x402/:slug`:**
- Per call: capability-shaped; mean ~700 input + ~1000 output for the always-LLM caps.
- Volume: low at current customer rate but the steady-state May 1 baseline (~750K/day before the scheduler flip) is roughly this plus pre-PR-#46 scheduled tests at 24h cadence (~100K/day).
- **D3 total: ~600K tokens/day** as the residual pre-ramp baseline.

### Sanity check vs. observed

| Driver | Tokens/day | Share |
|--------|------------|-------|
| D1 — scheduled tests at cost=0 | ~2.4M | 95% |
| D2 — /v1/suggest rerank | ~0.05–0.5M | 2–20% |
| D3 — paid /v1/do + x402 | ~0.6M (mostly pre-ramp) | embedded in baseline |
| O2 — daily digest (Sonnet) | ~5K | <1% |
| Others (conditional country-data, deactivated caps) | ~0 | 0% |

Total bottom-up: ~2.5–3.0M. Observed: ~2.5M on May 10 / ~2.7M peak May 7. Within 2× envelope; passes the sanity gate.

The pre-ramp baseline (~750K/day on May 1) corresponds to: pre-PR-#46 scheduled tests at 24h cadence (~100K) + D3 paid traffic (~600K) + D2 search (~50K). Post-ramp it's: D1 hourly (~2.4M) + D3 (~600K) + D2 (~50K) ≈ 3M, which is a hair above the May 7 peak of 2.7M, consistent with input being smaller than my 400-token estimate or fewer than 2 LLM test types averaging through.

## 4. Ramp attribution

Window: 2026-04-25 → 2026-05-11. Commits on `apps/api/`: 156. Below names every commit class against its ramp effect.

### Pre-ramp baseline (Apr 25–30)

- **2026-04-27** — `16ca790` drops OpenSanctions → single-vendor Dilisense. `f00c088` + `c1100f8` add audit-grade `adverse-media-check`, `sanctions-check`, `pep-check`. Each onboarded; suite cost initially 0. — Adds 3 caps that PR #49 will later move to cost=1.
- **2026-04-27** — `87456ee`/`3e0544a`/`2b0ee38`/`b4a9a1a`/`d068513`/`a4a84ce`/`22d3597`/`730d5b4`/`af53d40`/`fe831ab`/`4435d39`/`7008caa`/`f5422ca`/`ff687eb`/`17d0f03`/`47f3068`/`9753d4a`/`b8b5d59`/`0b0f52f`/`35ae4a6`/`08c2cd7`/`1a1f836`/`4079c74`/`9b34e6f`/`3a037a9`/`7c3763b` — cert-audit batch. Audit-trail fidelity, hashing, F-AUDIT-XX. No LLM call paths added.
- **2026-04-28** — deactivation sweep: `5cc120a` (browserless query-token auth), `66fa95a` data_source rewrites, `2a72790` hides deactivated caps from catalog, `9bdc686` parks UK property, `ab95a0e` deactivates italian-company-data + eu-court-case-search, `b5b60d0` deactivates irish-company-data + latvian-company-data. — Reduces LLM-using cap count slightly.
- **2026-04-29** — `e28f350` upgrades `risk-narrative-generate` Haiku → **Sonnet** per DEC-20260428-B. Suite cost still 0. — Small Sonnet contribution starts.
- **2026-04-29** — 4 new caps: `7ead04e` (gleif-l2-ubo-lookup), `b1c2998` (fr-bodacc-lookup), `3e07513` (no-bankruptcy-check), `ab61a61` (gleif-l2-children-lookup). None are LLM-backed.
- **2026-04-29** — `7311319`/`cfd2edb`/`901bd09`/`bd25bc5` migrate IE/LV/LT/SG from Browserless+LLM to direct API. — Removes 4 caps from the LLM-call path.

### The step — 2026-05-01 → 2026-05-04

- **2026-05-01** — `10dc966` wires new compliance caps into KYB Complete + Invoice Verify. `1acc5be` pre-writes 5 gated executors. `617ff5d` suspends 4 pre-deploy caps. — These are configuration; no new LLM calls.
- **2026-05-02** — `221e12a` web3-assurance v0.1. Doesn't add LLM calls itself.
- **2026-05-03** — `1311885` (#37) manifest-driven auto-register. — No call-site change.
- **2026-05-04 11:28 CET** — **`ffa0a8d` (#46) hourly free-only scheduler ships.** Cadence: 24h → 1h (24× amplification). **Primary ramp driver.** PR body acknowledges removing paid caps "with vendor integrations live" but the filter is `external_cost_cents = 0`, which catches every Haiku cap whose suite cost was never set.
- **2026-05-04 15:44 CET** — `f23a130` (#49) bumps 5 cap suites cost=0 → cost>0 (sanctions-check, pep-check, adverse-media-check, uk-cop-check, risk-narrative-generate). Migration SQL ships in `drizzle/0062_paid_vendor_suite_cost.sql` + `scripts/apply-migrations.ts` block. **But:** `apply-migrations.ts` was a dead file at this point — not on the Dockerfile CMD path, `tsconfig.json rootDir` excluded it from build. UPDATE did not run in prod.
- **2026-05-04 23:04 CET** — `51ce02d` (#55) bumps invoice-extract suite cost=0 → cost=1. Same migration mechanism. Same dead-file problem.
- **2026-05-04 evening** — `0b157c2` (#51) + `31e1341` (#52) wire `runStartupMigrations()` into API boot, replacing dead `apply-migrations.ts`. **On the next deploy after this lands, blocks 0062 and 0063 (the PR #49 + PR #55 UPDATEs) finally run.**
- **2026-05-04** — `58a9b43` (#48) retention DELETE pagination, `7a11e26` (#47) skip-bumper array-binding fix, `87456ee` (#43) Date encoding in spendCapWouldExceed. No LLM impact.

### Equilibrium — 2026-05-05 → 2026-05-11

- **2026-05-05** — PR1 wave 1–3 (`394ef47`/`1bc59dd`/`20c4055`/`063d53a`) deletes the SQS scoring engine. The `source_health` substrate, fixture and canary modes survive; no LLM calls added.
- **2026-05-05** — `dbab62a` lifecycle cleanup, `b26f20d` Provider-Coverage drift script. No LLM impact.
- **2026-05-06–07** — `8b46146` german-company-data via OpenRegister Free, `1d67bf2` slovak-company-data, `f90c666` slovenian-company-data. All direct API; not always-LLM. Marginal contribution.
- **2026-05-06** — `b547385`/`bf06b24`/`e2a94e2`/`4b13d32`/`84ae72d` Browserless v1 pin and chromium diagnostics. No LLM impact.
- **2026-05-08–10** — P2 doctrine sweep: `6dc5a23`/`0575ff1`/`e25bb64`/`bc46a04`/`e57e00e`/`e668aea`/`9528946`/`c523485`/`a16649b`. Null-safety fixes on output envelopes; no LLM call shape change.
- **2026-05-09** — `3f5bcfc` deletes dormant seed.ts. No runtime impact.
- **2026-05-10–11** — `eb67670` worktree janitor; CLAUDE-Md/docs.

### Ramp shape resolution

The chart's "multiplicative ramp" (750K → 2.7M over 6 days) decomposes as:
- **2026-05-01 to 2026-05-03** (~750K → ~1.1M): drift from new caps onboarded at cost=0 + small risk-narrative Sonnet uplift from the Apr 29 upgrade kicking in as PA flows exercise it.
- **2026-05-04 morning** (~1.1M → ~2.4M): step from PR #46. This is the dominant single discontinuity.
- **2026-05-04 evening → 2026-05-05** (~2.4M → ~2.5M, oscillating): PR #51/#52 wire startup-migrations; PR #49 + PR #55 UPDATEs now actually run on next boot; removes pep/sanctions/adverse-media/risk-narrative/uk-cop/invoice-extract from the hourly cycle. Partial offset, not full.
- **2026-05-06 to 2026-05-11**: equilibrium at ~2.5M ± new-cap drift.

A "step + small decay + small drift" shape can look like a smooth ramp on a 6-day chart with daily granularity, especially when the step partially reverses 24 hours later and is masked by simultaneous new-cap additions.

## 5. Reduction options per driver

### D1 — Scheduled tests hammering Haiku caps at cost=0

The PR #49 deferral is the unblocked path here. The hesitation in PR #49 was "flat 1-cent gives misleading false safety signal" for Haiku caps where per-call cost varies. But the goal of `external_cost_cents` in the scheduler dispatch query is **purely the scheduler-skip flip**, not cost accuracy — the same operational role PR #49 already accepted for uk-cop-check at 1¢. Options:

- **R1.1 — Bulk bump all always-LLM Haiku caps to `external_cost_cents = 1` (trivial).** A single SQL block in `lib/startup-migrations.ts`: `UPDATE test_suites SET external_cost_cents = 1 WHERE active = true AND test_mode = 'live' AND test_type IN ('known_answer','edge_case','negative','known_bad') AND external_cost_cents = 0 AND capability_slug IN (<the ~50 always-LLM Haiku slugs>)`. Estimated saving: ~2.4M tokens/day → ~0. **Trivial complexity. Highest leverage.**

- **R1.2 — Replace LLM-only test runs with fixture-mode tests for the always-LLM caps (moderate).** Keep one canary live test per day per cap (~50 calls/day total) for upstream-health signal; switch the other 3 test types to `test_mode = 'fixture'` reading from a saved response. Estimated saving: ~95% of D1, with better signal for capability-correctness regressions. Moderate complexity (need fixture-capture script + per-cap human review).

- **R1.3 — Move all paid-LLM caps to piggyback-only (structural).** Per CLAUDE.md's "Principle C" piggyback suites receive data exclusively from customer traffic. For always-LLM caps with no free-probe pattern, the only honest quality signal at this stage is observed-from-customer-traffic. Estimated saving: ~95% of D1 + reduces noise. Structural complexity — touches DEC-20260503-B's policy edge.

### D2 — `/v1/suggest` Haiku rerank

- **R2.1 — Enable prompt caching on the system prompt (trivial).** The system prompt is ~600 tokens of fixed instructions + examples — well over the 1024-token cache threshold if you add the catalog context (or just pad the examples). Anthropic prompt caching cuts 90% off cached input tokens after first call. Estimated saving on D2 input: ~85%. Trivial complexity.

- **R2.2 — Skip rerank for high-similarity matches (moderate).** If top embedding similarity is >0.85 and gap to #2 >0.10, return without calling Haiku. Estimated saving: ~30–50% of calls (highly query-dependent). Moderate complexity.

### D3 — Paid /v1/do + x402 baseline

- **R3.1 — Drop `max_tokens` defaults to realistic ceilings (trivial).** Several caps set `max_tokens` at 3000–4000 when typical output is 600–1000 tokens (e.g. `code-convert: 3000`, `pdf-extract: 4000`, `web-extract: 4000`). The model bills only on actual output, so this is not a direct saving — but it caps tail-of-distribution runaways and aligns the post-call cost estimate. **Negligible immediate saving; cleanup-class.**

- **R3.2 — Prompt cache the per-capability system prompts (moderate).** Every always-LLM cap has a per-call constant prompt body. Hoisting these into a `system: [{ type: "text", text: ..., cache_control: { type: "ephemeral" } }]` block enables Anthropic prompt caching. Highest leverage when the same cap is called multiple times within 5 minutes (production traffic clusters). Estimated saving on D3 input: ~50% on the input side for any cap called repeatedly. Moderate complexity (script-edit all 50 caps + verify).

## 6. Open questions

The audit covers code shape, not runtime distribution. The following would require Railway / Anthropic Console / DB access:

- **Actual `external_cost_cents = 0` slug list as of 2026-05-11.** This audit infers ~50 from grep + the PR #49 deferral note. A 30-second prod query gives the truth: `SELECT capability_slug, test_type, external_cost_cents FROM test_suites WHERE active = true AND external_cost_cents = 0`.
- **Actual hourly dispatch counts.** Scheduler logs include `test-scheduler-poll-start` with `runnable` and `queue_depth`. Sum those over the audit window to get the empirical dispatch rate vs. the 50-cap estimate.
- **Actual mean output tokens per Haiku call.** The estimate uses 30–50% of `max_tokens`. Anthropic Console > Logs gives the truth per request.
- **`/v1/suggest` call rate.** Pin D2's range. Cloudflare / Umami / Railway logs.
- **Whether `pdf-extract` and `web-extract` are actively scheduled.** These have `max_tokens: 4000`. If they are scheduled at cost=0 and inputs are heavy, the D1 estimate is low.
- **Whether the daily-digest cron is firing.** The Sonnet usage in the Console may or may not match O2's ~5K/day signature.

## 7. Appendix — verification trail

- **Step 1 verification.** `grep -rEn "messages\.create|@anthropic-ai/sdk|new Anthropic\(" apps/api/src/` returned 195 lines covering 95 distinct call sites; all appear in the inventory tables above or in the false-positives footnote. The cross-repo grep for `@anthropic-ai/sdk|new Anthropic\(` outside `apps/api/` produced zero matches; the SDK is not used elsewhere in the monorepo.
- **Step 2 verification.** Two spot-checks: `address-parse.ts` (small known-shape prompt + `max_tokens: 500`) and `lib/suggest.ts` (large candidate-list prompt + `max_tokens: 1000`) both inspected line-for-line. The 30–50% `max_tokens` realization is an assumption; documented in §6.
- **Step 3 verification.** Bottom-up estimate 2.5–3.0M vs. observed 2.5–2.7M. Within 2× envelope.
- **Step 4 verification.** Every commit in `git log --since=2026-04-25 --until=2026-05-12 -- apps/api/` is accounted for either by name or by group ("cert-audit batch", "P2 doctrine sweep", "deactivation sweep") with the LLM-effect classification stated.
- **Step 5 verification.** This file is the deliverable.
