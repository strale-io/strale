# Conditional-LLM Bypass Audit (PR #85 follow-up)

Date: 2026-05-11
Follow-up to: PR #84 (audit), PR #85 (contain + harden)

## Summary

The PR #85 exclusion set (`CONDITIONAL_LLM_CAPABILITIES` in [llm-capability-costs.ts](apps/api/src/lib/llm-capability-costs.ts)) covers 11 capabilities permitted to keep `external_cost_cents = 0` on the assumption that their scheduled-test execution path does not invoke the Anthropic SDK. Tracing each cap's `known_answer.input` fixture through its executor:

- **9 CLEAN** — bypass justification holds; the fixture exercises a non-LLM code path.
- **2 LEAKY** — the fixture *does* reach a `messages.create` call. Bypass is masking residual leak: `us-company-data` and `website-to-company`.
- **0 AMBIGUOUS**.

Two of the 9 CLEAN caps have **incorrect bypass justifications** in the source comment (the verdict is still CLEAN, but for a different reason than the comment states): `brazilian-company-data` (the LLM helper function is defined but never reachable from the registered executor) and `container-track` (the fixture is `"test_value"`, not a "well-known carrier prefix" — it triggers the invalid-format early-return path).

Residual Haiku tokens attributable to the 2 LEAKY caps: roughly 1–2% of the pre-PR-#85 daily volume (~30–50K tokens/day vs. the ~2.4M/day that PR #85 closed). Negligible compared to the main fix.

T+48h Anthropic Console interpretation: expected residual ~7–12% of pre-fix daily Haiku tokens, consistent with the audit's 10–15% estimate. The 2 LEAKY caps contribute ~1–2%; the bulk of the residual is `/v1/suggest` rerank + paid `/v1/do` + `/x402` customer traffic + the Sonnet daily-digest cron.

## Per-cap classification

| # | Slug | Bypass comment | Fixture input | SDK called on scheduled test? | Bucket | Notes |
|---|------|----------------|---------------|------------------------------|--------|-------|
| 1 | `brazilian-company-data` | "Numeric CNPJ fixture bypasses LLM" | `cnpj: "11222333000181"` (14 digits) | NO | **CLEAN** | `findCnpj` matches at [line 23](apps/api/src/capabilities/brazilian-company-data.ts#L23). `extractCompanyName` is defined at line 29 but **never called** from `registerCapability` — the early-throw at line 97 returns before any LLM path. Effectively dead-code-imported SDK; bypass justified but the cap could even be moved out of the exclusion list once the dead helper is deleted. |
| 2 | `cz-company-data` | "Numeric IČO fixture bypasses LLM" | `ico: "00177041"` (8 digits) | NO | **CLEAN** | `normalizeIco` + `isValidIcoChecksum` both pass at [line 100](apps/api/src/capabilities/cz-company-data.ts#L100), takes direct ARES API path. LLM only fires at line 107 for non-numeric input. |
| 3 | `danish-company-data` | "Numeric CVR fixture bypasses LLM" | `cvr_number: "24256790"` (8 digits) | NO | **CLEAN** | `isCvrNumber` matches at [line 116](apps/api/src/capabilities/danish-company-data.ts#L116), takes direct cvrapi.dk path. LLM only fires for non-numeric input via `extractCompanyName`. |
| 4 | `estonian-company-data` | "Numeric registry-code fixture bypasses LLM" | `registry_code: "17449106"` (8 digits) | NO | **CLEAN** | `findRegCode` matches `/^\d{8}$/` at [line 121](apps/api/src/capabilities/estonian-company-data.ts#L121), takes direct ariregister path. |
| 5 | `finnish-company-data` | "Y-tunnus fixture bypasses LLM" | `business_id: "0112038-9"` | NO | **CLEAN** | `BIS_RE = /^(\d{7})-?(\d)$/` matches, direct PRH avoindata path. |
| 6 | `french-company-data` | "Numeric SIREN fixture bypasses LLM" | `siren: "542051180"` (9 digits) | NO | **CLEAN** | `SIREN_RE = /^\d{9}$/` matches at [line 86](apps/api/src/capabilities/french-company-data.ts#L86), direct INSEE/SIRENE path. |
| 7 | `norwegian-company-data` | "Numeric org-number fixture bypasses LLM" | `org_number: "984851006"` (9 digits) | NO | **CLEAN** | `isOrgNumber` matches, direct brreg path. (Side note: the manifest's `health_check_input.org_number: 556703-7485` is in Swedish format and would fail isOrgNumber — a fixture hygiene bug, but irrelevant to LLM trigger since dependency_health probes don't invoke the executor.) |
| 8 | `uk-company-data` | "Company-number fixture bypasses LLM" | `company_number: "00445790"` | NO | **CLEAN** | `COMPANY_NUMBER_RE` matches at [line 119](apps/api/src/capabilities/uk-company-data.ts#L119), direct Companies House path. |
| 9 | **`us-company-data`** | "Numeric CIK fixture bypasses LLM" | **`company: "AAPL"`** (ticker, not CIK) | **YES** | **LEAKY** | `findCik` regex is `/^\d{1,10}$/`. `"AAPL"` contains letters → `findCik` returns null at [line 98](apps/api/src/capabilities/us-company-data.ts#L98) → `extractCompanyName("AAPL")` fires at line 100 → **1 Haiku call per scheduled test**. Then `searchEdgar(name)` is an HTTP-only SEC API call (no further LLM). |
| 10 | **`website-to-company`** | "Rich-structured-data fixture bypasses LLM" | **`url: "https://equinor.com"`** | **YES (×2)** | **LEAKY** | The bypass comment is wrong about the code shape. `llmExtractCompanyName` at [line 103](apps/api/src/capabilities/website-to-company.ts#L103) is called *whenever* `meta-extract` or `url-to-markdown` returns any non-empty title/site_name (lines 81–82 and 94–95) — i.e. for essentially every real website. The LLM is the *primary* extraction path, with structured data feeding *into* it, not bypassing it. Furthermore, the cap then routes to a country-specific registry (norwegian-company-data for `.com`/`.no` resolution paths) at line 154, passing the LLM-extracted name string, which triggers *another* `extractCompanyName` LLM call inside that downstream cap. **2 Haiku calls per scheduled test.** |
| 11 | `container-track` | "Well-known carrier prefix fixture bypasses LLM" | `container_number: "test_value"` (gibberish) | NO | **CLEAN** | Verdict correct, **justification wrong**. The fixture is not a Maersk prefix — it's the literal placeholder string `"test_value"`. `validateContainerNumber("test_value")` returns `valid_format: false` (no ISO 6346 match) → early-return at [line 237](apps/api/src/capabilities/container-track.ts#L237) before any Browserless fetch or LLM call. The "carrier-prefix" bypass story would only hold for a real fixture; the current fixture is hygiene-broken. |

## Interpretation for T+48h Anthropic Console check

Rough math for the 2 LEAKY caps' contribution:

- `us-company-data`: 4 active live test types (known_answer, edge_case, negative, known_bad) × 24/day = 96 dispatches/day. Each runs the executor once; the executor makes 1 Haiku call (`extractCompanyName`, max_tokens 100). Per call: ~80 input + ~30 output ≈ 110 tokens. Daily: **96 × 110 ≈ 10,500 tokens/day**.
- `website-to-company`: same 96 dispatches/day. Each runs the executor once; the executor makes 1 Haiku call (`llmExtractCompanyName`, max_tokens 100) plus 1 downstream Haiku call inside `norwegian-company-data` (via the country-routing). Per dispatch: ~260 tokens. Daily: **96 × 260 ≈ 25,000 tokens/day**.
- Combined: **~35,000 tokens/day**, or **~1.4%** of the pre-PR-#85 daily volume.

Expected total residual after PR #85 deploy (chat/Petter's T+48h read):

| Component | Estimated tokens/day | Share of pre-fix |
|-----------|---------------------|------------------|
| LEAKY conditional caps (this audit) | ~35K | ~1.4% |
| `/v1/suggest` rerank (no prompt caching) | ~50–500K | ~2–20% |
| Paid `/v1/do` + `/x402` customer traffic | ~150–250K | ~6–10% |
| Sonnet daily-digest cron | ~5K | <1% |
| **Total residual** | **~250K–800K** | **~10–32%** |

The wide range reflects uncertainty about `/v1/suggest` traffic. If T+48h reads **<300K Haiku tokens/day**, attribution is confirmed and the 2 LEAKY caps are negligible. If reads **>500K**, `/v1/suggest` is the swing factor and Phase 2 reductions (prompt caching) become the next leverage point. If reads **>1M**, attribution was wrong and a new audit is warranted.

## Recommended action by bucket

**CLEAN (9):** No action on the cost classification. Three documentation hygiene items, none blocking:

1. `brazilian-company-data` — delete the unused `extractCompanyName` helper + the `@anthropic-ai/sdk` import, then remove the slug from `CONDITIONAL_LLM_CAPABILITIES` (it stops being SDK-importing).
2. `norwegian-company-data` manifest — fix `health_check_input.org_number` from `556703-7485` (Swedish) to a real 9-digit Norwegian org number. Hygiene only; the auth-less probe doesn't invoke the executor.
3. `container-track` manifest — replace `container_number: "test_value"` with a real Maersk container (e.g. `MSKU1234564`), AND update the bypass comment in `llm-capability-costs.ts` to match the actual mechanism (invalid-format early-return, not well-known carrier prefix). Note: a real container in the fixture *would* trigger the Browserless + Haiku path, so this hygiene fix would itself reclassify the cap to LEAKY. Decision point: fix the comment OR fix the fixture, not both.

**LEAKY (2):** Promote to `ALWAYS_LLM_CAPABILITY_COSTS`. Two valid paths:

- **Path A (PR #85 mirror):** Bump `us-company-data` and `website-to-company` to `ALWAYS_LLM_CAPABILITY_COSTS` with cost = 1¢ each. Remove from `CONDITIONAL_LLM_CAPABILITIES`. Add a startup-migration block (call it 0065) following the PR #85 / block 0064 pattern. Cleanest, structurally consistent.
- **Path B (fixture hygiene):** Change `us-company-data` manifest `known_answer.input.company` from `"AAPL"` to a numeric CIK like `"0000320193"` (Apple), and rework `website-to-company`'s LLM-extraction path to actually try structured-data extraction *first* and only fall back to LLM when JSON-LD / meta tags don't surface a name. For `us-company-data` this is trivial; for `website-to-company` it's a meaningful refactor.

Path A is the conservative answer and matches the structural intent of PR #85 (any always-LLM cap → registered cost). Path B is the right long-term shape for the underlying capability but is more work and doesn't generalize beyond these two caps.

Recommend Path A. Sized as a small follow-up PR. Estimated saving: ~35K tokens/day. Implementation complexity: trivial (mirror PR #85's block 0064 with 2 slugs).

## Caveats

- **Other test types (edge_case, negative, known_bad).** The scheduler runs all 4 active live test types per dispatch. Each has its own input fixture, generated by `apps/api/scripts/onboard.ts` at capability-creation time and persisted in the DB `test_suites` table. The manifests on disk only show `known_answer.input` and `health_check_input`. This audit traces the `known_answer.input` path. The other 3 types could in principle have inputs that change the LLM-trigger verdict — particularly for `edge_case`, which often uses variant inputs designed to exercise alternate code paths. Confirming the verdict for those types requires a prod query (`SELECT capability_slug, test_type, input FROM test_suites WHERE capability_slug IN (...)`) — not done in this read-only audit.
- **Bypass-comment correctness.** The 9 CLEAN verdicts hold even where the per-cap comment in `llm-capability-costs.ts` is inaccurate about *why* (brazilian, container-track). Comment-vs-code drift is a separate hygiene item, not a leak.
- **Downstream LLM calls via cap-to-cap chaining.** `website-to-company` is the only one in this set that chains. If other capabilities in `ALWAYS_LLM_CAPABILITY_COSTS` are called as sub-routines by anything in `CONDITIONAL_LLM_CAPABILITIES`, the LEAKY classification could propagate further. The audit's grep didn't surface other such chains within the 11 caps, but a general cap-chain audit is a separate undertaking.
- **Token-rate estimates.** The 1.4% residual figure depends on actual `max_tokens` realization (assumed 30–50% for these short-prompt caps). Anthropic Console > Logs is the ground truth.
