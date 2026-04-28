# Partial-failure capability triage — 2026-04-28

**Intent:** Document the 15 capabilities surfaced by today's post-Browserless bulk test sweep that returned partial test failures (1+ failed test out of 5–10), so they can be triaged without re-running the diagnostics.

## Context

After the Browserless auth-shape fix landed (commit 5cc120a) and the catalog-wide bulk re-test ran (305s, 229 caps), 18 caps showed test failures:

- **3 caps** (linkedin-url-validate, austrian-company-data, dutch-company-data) returned 0/N — those were already in the `DEACTIVATED` map in `auto-register.ts` due to ToS-violating scraping. The DB rows were drifted and still appearing publicly. **Resolved in commit 2a72790** by hiding them from the catalog and adding a startup auto-sync.

- **15 caps** with partial failures remain. These are real issues that were hidden behind 7+ days of no testing during the Browserless outage. They are not regressions from any recent fix.

## Triage by category

### A. Real bugs in executor code (3)

| slug | issue | likely fix |
|---|---|---|
| `redirect-trace` | known_answer fixture targets `httpbin.org/redirect/2` (2 hops). Executor errors with `"Too many redirects (>0) — refusing to follow further"`. The redirect-limit default appears to be 0. | Either bump the executor's default `max_redirects` to something sane (3+) or make the manifest fixture pass `max_redirects: 3` explicitly. |
| `prompt-compress` | Claude returns truncated JSON; parse fails. Sample failure: `"Claude response parse failed (response may have been truncated)"`. | Raise `max_tokens` on the Anthropic call, OR add a more forgiving JSON parser that tolerates truncation, OR cap input prompt length so Claude has room to fully respond. |
| `test-case-generate` | Claude JSON parse error: `"Expected ',' or '}' after property value in JSON at position 1200"`. Same class as prompt-compress. | Same fix shape — bump max_tokens or guard parsing. |

### B. Manifest fixture / schema issues (7)

These are not executor bugs; the fixture or `output_field_reliability` doesn't match what the executor produces. Fixable via the documented `npx tsx scripts/onboard.ts --backfill --discover --fix --manifest manifests/<slug>.yaml` workflow described in CLAUDE.md.

| slug | issue |
|---|---|
| `og-image-check` | known_answer asserts `image_size_kb` is non-null. Actual responses commonly return null. Field reliability should be `common`, not `guaranteed`. |
| `iso-country-lookup` | 100% null ratio in known_answer (6/6 fields null). The test input must not be producing a real lookup — manifest fixture needs a real country code. |
| `incoterms-explain` | 100% null ratio (4/4 fields null). Same pattern — fixture input doesn't trigger a real response. |
| `nl-housing-price-index` | known_answer expects `latest_period: '2026-02'`, executor returns `'2026-03'` (data updated). Stale ground truth. Drop the period assertion or assert a regex / format check. |
| `adverse-media-check` | 85% null ratio (11/13 fields). Most of the declared fields (period, source, categories, total_hits, etc.) return null in many responses. Schema over-promises. Mark optional fields as `common` or `rare`. |
| `npm-package-info` | `dependency_health` uses input `"test_value"` which isn't a real package, so executor errors `npm package "test_value" not found`. Either change the dependency_health input to a real always-present package (e.g. `lodash`) or make the executor return a structured "not found" instead of throwing. |
| `llm-cost-calculate` | Same pattern — `dependency_health` and `known_answer` both use `"test_value"` as the model name, and the executor rejects unknown models. Fixture should use a real model id like `claude-3.5-sonnet`. |

### C. External API quota / transient issues (4)

These are not bugs — the upstream returned 429/529. Will likely pass on the next cycle; if persistently failing, a quota/rate-limit conversation with the vendor is needed.

| slug | upstream | observation |
|---|---|---|
| `french-company-data` | api.gouv.fr | HTTP 429 — rate-limited from Railway IP. Worth checking if our request volume crossed a threshold. |
| `company-news` | GDELT | HTTP 429. GDELT is volatile — may also recover on its own. |
| `pii-redact` | Anthropic | HTTP 529 (overloaded). Transient on Anthropic's side. |
| `danish-company-data` | virk.dk / cvrapi.dk | "API quota has been temporarily exceeded." Free-tier quota likely tripped during the bulk re-test. |

### D. Domain-design issue (1)

| slug | issue | recommendation |
|---|---|---|
| `polish-company-data` | Executor only accepts 10-digit KRS numbers, but the fixture / common usage is a company name. Fixture currently fails with a helpful error message ("Provide a 10-digit KRS number"). | Either update the fixture to use a real KRS number, OR add a name→KRS lookup pre-step (similar to the Swedish allabolag pattern). The current behavior is honest but inconvenient. |

## Recommended workflow

1. **Group A (3 real bugs)** — fix in code, one PR per cap. Each is ~30 min of work plus re-test.
2. **Group B (7 fixture issues)** — bulk-run the documented onboarding pipeline:
   ```
   for slug in og-image-check iso-country-lookup incoterms-explain \
              nl-housing-price-index adverse-media-check npm-package-info \
              llm-cost-calculate; do
     npx tsx scripts/onboard.ts --backfill --discover --fix \
       --manifest ../../manifests/$slug.yaml
   done
   ```
   Review each manifest diff before committing; some assertions may need manual relaxation rather than auto-discovery.
3. **Group C (4 transient)** — re-run the bulk test driver in 24h. If still failing, treat as Group B-style fixture issue (the `dependency_health` test should use a more reliable input).
4. **Group D (polish-company-data)** — separate scoping conversation. Either accept current behavior or build the name-resolution layer.

## Re-running the diagnostic

Get fresh failure reasons (the data behind this triage):
```
cd apps/api && npx tsx scripts/diag-partial-failures.ts
```

Re-running the bulk test for any subset:
```
cd apps/api && npx tsx scripts/bulk-test-overdue.ts --max=20
```

(The `bulk-test-overdue` script triggers tests on production via the admin endpoint — costs real API calls.)

## What's NOT in this triage

- The 7 caps that now require Browserless (`annual-report-extract`, `company-enrich`, `estonian-company-data`, `html-to-pdf`, `landing-page-roast`, `screenshot-url`, `web-extract`). These should test cleanly post-Browserless-fix; if they don't, that's a separate investigation.
- The 11 ToS-deactivated caps (handled in commit 2a72790).
- The 25-ish caps with stale/inaccurate `data_source` strings beyond the 12 fixed in commit 66fa95a — there may still be drift in non-Browserless data_source labels.

## Status of broader incident

- Browserless auth fix: **shipped** (commit 5cc120a), prod healthy.
- Scheduler skip-marker prevention: **shipped** (commit 79cfd0b).
- DEACTIVATED catalog sync: **shipped** (commit 2a72790).
- Catalog freshness: 98% fresh < 6h, 0 stale > 7d (was 86% stale > 7d two hours ago).
- Public catalog count: 272 (was 283; the 11 retired caps no longer appear).
