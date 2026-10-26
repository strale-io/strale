# Search rebuild Round 2

Baseline: `990b219c`; local build-agent scope, no push, PR operation, deployment or production write.

## Changes

Typeahead truncates to 200 characters before matching. The keyword engine independently truncates to 200 characters, considers at most 12 distinct content tokens and tries typo matching for at most six unknown tokens of at most 32 characters. Length/initial vocabulary buckets replace the full-vocabulary edit-distance scan. POST suggest retains its 500-character request limit and gives keyword retrieval only its first 200 normalized characters.

Registry aliases now prioritize matching country registry identities for generic lookup/check/ID intent. Missing registry coverage falls back to existing generic ID tools; the frozen catalogue contains `company-id-detect` and `id-number-validate`, but no Dutch company registry. Numeric-only tokens of six or more digits do not affect lexical coverage or scoring. Keyword fallback groups country variants before counting/picking.

Country matching uses exact names or explicit aliases; the established `swedsih` transposition is now an explicit alias rather than fuzzy country inference. Lowercase `us` needs an adjacent company/registry cue or “the us”; raw uppercase `US` and “united states” are explicit. Tests measure both extraction and ranking equivalence for contact/email pronouns. The model cache distinguishes country intent when lowercasing its key. Agent nouns use a small verb-family allowlist rather than stripping all -er/-or suffixes.

A2A forwards the same client IP as suggest. Model labels/reasons strip control/format characters and URL text, then clamp to 120/240 characters; wire adapters repeat sanitization for fallback and direct callers. OpenAPI now documents recommendation/alternatives/total_matches/query_understood_as and minLength 2. Railway and A2A prose no longer describe Voyage embeddings.

## Golden results

| Metric | Before | After |
|---|---:|---:|
| Top-1 | 81/87 | 81/87 |
| Top-3 | 86/87 | 86/87 |
| MRR@5 | 0.9598 | 0.9598 |
| none coverage < 0.6 (report only) | 2/3 (retrospective) | 2/3 |

The original `golden-queries.json` is unchanged. No positive query changed its acceptable-answer rank. All five changed top-five lists follow; the other 85 lists are identical.

| Query | Before | After |
|---|---|---|
| Companies House | uk-company-data, uk-companies-house-officers | uk-company-data |
| Irish company CRO number | irish-company-data, kyb-essentials-ie, company-id-detect, domain-contact-extract, vat-validate | irish-company-data |
| French company SIREN | french-company-data, kyb-essentials-fr, invoice-verify-fr, company-enrich, company-news | french-company-data |
| Australian ABN | au-company-data, company-enrich, gdpr-fine-lookup, ticker-lookup, privacy-policy-analyze | au-company-data |
| Czech ICO | cz-company-data, company-enrich, gdpr-fine-lookup, ticker-lookup, privacy-policy-analyze | cz-company-data |

The new none metric is reported separately from the unchanged 87-query release gate. “Book a flight to Paris” and “generate a photo of a cat” have top coverage 1/3; “send an SMS” has coverage 1 and still falsely suggests `phone-type-detect`. Extra probe “gold price” changes from `nl-housing-price-index` (coverage 1) to `price-compare` (coverage 0.5), so the coverage rule now exposes its weak match. This is an evaluation signal, not a new serving abstention policy.

## Cost measurements

Warm catalogue; standalone synchronous measurements (milliseconds):

| Query | Bytes | Elapsed ms |
|---|---:|---:|
| single repeated character | 10240 | 8.226 |
| many long gibberish tokens | 11000 | 1.447 |
| many one-letter tokens | 10240 | 0.073 |

A fourth probe uses 1,280 distinct unknown tokens (exactly 10,240 bytes): 18.797 ms. Restoring the old engine makes that probe take 1,221.715 ms and fail. One regression test asserts the <50 ms limit for all four shapes against the real frozen catalogue. The 1,000-query throughput gate remains <2 seconds. Full before/after observations and benchmarks: [round2-evaluation.json](round2-evaluation.json).

## Verification

The supplied `ci-local.sh` ran from the repository root, returned exit 0 and printed only `CI-LOCAL-DONE` (no FAIL markers). All its individual commands and the additional CI checks it omits are enumerated in [round2-checks.json](round2-checks.json). The final API suite passed 322 files/5,485 tests; 31 files/321 tests were skipped, including DB-dependent tests because no disposable integration database is supplied. The dedicated CI PostgreSQL job was not run. MCP and TypeScript SDK builds, API and scripts typechecks passed. The shape-contract command skipped for an absent sibling frontend; the CEO brief checker retained 15 existing length warnings. Initial focused tests caught generic ID results falling below the cutoff; an explicit ID fallback floor fixed that before the passing runs.

Test evidence: [Round 2 receipt](../../receipts/2026-10-26-test-run-search-round2.json). Four safe mutation runs proved green → red → green for country demotion, keyword-fallback caching, client IP forwarding, and the original unbounded engine. The first repeated-token cost probes survived the old engine; replacing that weak input with distinct unknown tokens made the regression discriminate. Manual simplification/self-review followed REVIEW.md and the go skill; no standalone simplify skill is installed. The orchestrator owns independent review and all shipping actions; this build agent makes no independent GO claim.

## Read-only production checks and remaining work

`GET https://api.strale.io/health` returned `{"status":"ok","commit":"a7c41ac0f6b6"}`. `GET /v1/suggest/typeahead?q=abn%20lookup&limit=3` returned slugs `au-company-data`, `domain-security-check`, `kyc-sweden`, total 118. Those are the currently deployed API results, not proof of this local patch. No billed smart-search production request was sent.

Production steps left: orchestrator imports the local commits, reviews, pushes, updates PR #750, merges/deploys through its existing pipeline, then runs `npx tsx apps/api/scripts/search-eval.ts --engine live-typeahead` and `--engine live-suggest`. No production database, onboarding, migration or settings command is required. Paid model inference, post-deploy behavior and the skipped integration/absent frontend contracts remain unverified.

## Local Git limitation

The supplied clone has read-only `.git`; `git add` fails creating `.git/index.lock`. A local bare clone `/tmp/search-round2.git` and linked worktree `/tmp/strale-wt-search-round2`, on the same `feat/search-rebuild` branch at the supplied baseline, hold the commits and transport bundle. The supplied branch is never switched. No credentials were sought and no production settings were touched.

Session handoff gate: `npm run handoff:check` exits 1 solely for `[ahead]` (this local branch has no pushed upstream). The explicit no-push instruction takes precedence; the orchestrator owns that step. The local pre-commit gate passes, the worktree is committed, and no repository gate was disabled. `npm run context:generate`, `archive:index`, `context:check` and `context:test` pass in the writable worktree; the context check reports no warnings. Receipt validation retains 19 pre-existing bare-count handoff warnings.

## Files changed

- `apps/api/railway-config.md`
- `apps/api/scripts/search-eval.ts`
- `apps/api/src/lib/search/countries.ts`
- `apps/api/src/lib/search/eval.test.ts`
- `apps/api/src/lib/search/eval.ts`
- `apps/api/src/lib/search/keyword.test.ts`
- `apps/api/src/lib/search/keyword.ts`
- `apps/api/src/lib/search/search-quality.test.ts`
- `apps/api/src/lib/search/smart.test.ts`
- `apps/api/src/lib/search/smart.ts`
- `apps/api/src/lib/suggest.ts`
- `apps/api/src/openapi.ts`
- `apps/api/src/routes/a2a.ts`
- `apps/api/src/routes/suggest-search.test.ts`
- `apps/api/src/routes/suggest.ts`
- `archive/README.md`
- `archive/receipts/2026-10-26-test-run-search-round2.json`
- `archive/sessions/2026-10-26-search-rebuild/round2-checks.json`
- `archive/sessions/2026-10-26-search-rebuild/round2-evaluation.json`
- `archive/sessions/2026-10-26-search-rebuild/round2.md`
- `docs/project/legacy-authority-inventory.json`
- `handoff/_general/from-code/2026-10-26-feat-search-rebuild.md`
