Intent: audit the May 2026 Anthropic Haiku cost ramp (750K → 2.7M tokens/day), contain the leak in startup-migrations, audit the bypass-set's residual surface, and ship the cleanup. Four PRs in one arc: #84 (audit) → #85 (contain + harden) → #86 (audit conditionals) → #87 (cleanup).

## Outcome (merged)

- **PR #85 (`d938abd`):** containment + CI harden. Migration block 0064 bumps `test_suites.external_cost_cents = 1` on 73 always-LLM Haiku capabilities. New `apps/api/src/lib/llm-capability-costs.ts` holds the canonical map; new `llm-capability-costs.test.ts` CI gate fails if any `@anthropic-ai/sdk` importer is unregistered. Phase 3 harden against the compound-PR cost-leak pattern.
- **PR #87 (`4db4358`):** PR #86 follow-up cleanup. Migration block 0065 closes the two LEAKY caps PR #86 surfaced — `website-to-company` (promoted to ALWAYS_LLM @ 1¢) and `us-company-data` (fixture `AAPL` → `320193` numeric CIK, in-place jsonb_set on prod test_suites). Three doc-hygiene fixes bundled: `brazilian-company-data` dead-code (extractCompanyName + SDK import deleted; cap exits the bypass set entirely), `container-track` bypass comment corrected to match the actual invalid-format early-return, `norwegian-company-data` manifest `health_check_input.org_number` fixed from Swedish format to Norwegian (Equinor 923609016).

## Outcome (audits, not merged)

- **PR #84 (`audit/anthropic-cost-may-2026`):** 95% attribution to PR #46's scheduler cadence flip (24h → 1h, 2026-05-04) intersected with PR #49's explicit deferral of ~80 Haiku-cap cost-bumps. Audit report at `apps/api/handoff/_general/from-code/2026-05-11-anthropic-cost-audit.md`. Awaiting Petter review.
- **PR #86 (`audit/conditional-llm-bypass-may-2026`):** traced all 11 `CONDITIONAL_LLM_CAPABILITIES` against their `known_answer.input` fixtures. Verdict 9 CLEAN / 2 LEAKY / 0 AMBIGUOUS. Report at `apps/api/handoff/_general/from-code/2026-05-11-conditional-llm-bypass-audit.md`. Awaiting Petter review; PR #87 ships the recommended fixes.

## Token-flow summary

- Pre-PR-#85 baseline: ~2.5M Haiku tokens/day (multiplicative ramp from May 1's 750K).
- PR #85 expected close: ~2.4M (95% of the leak).
- PR #87 expected close: ~35K additional (~1.4% — the LEAKY residual).
- Expected steady-state post-#87: ~50–200K Haiku tokens/day, dominated by `/v1/suggest` Haiku rerank (no prompt caching yet) and paid `/v1/do` + `/x402` customer traffic.

## Open

- **48h Anthropic Console verification** (chat/Petter, not a merge gate): if daily Haiku reads <300K, attribution confirmed. If >500K, `/v1/suggest` prompt caching becomes the next leverage. If >1M, attribution was wrong and a new audit is warranted.
- **Structural follow-up Notion To-do `35d67c87082c81148ee4fc88f1671776`** (`Decouple scheduled_testing_eligible from external_cost_cents`): P2. Body updated this session with PR #86's chained-LLM-call refinement (three implementation options sketched). The interim CI gate in `llm-capability-costs.test.ts` is the structural guard until this lands.
- **Pre-existing test failure `src/app.classify-error.test.ts`** (strale-mcp/tools import): present on main before this session, not introduced by any of #84–#87. Not in scope.

## Non-obvious learnings

- **Manifests are not the runtime source of truth for test fixtures.** `onboard.ts` copies `test_fixtures.known_answer.input` into `test_suites.input` at capability-creation time; after that the manifest can drift freely. PR #87's block 0065 had to issue a separate `jsonb_set` UPDATE against the live `test_suites` row to make the `AAPL → 320193` fixture fix effective in prod. Pure manifest-edit fixes are hygiene only.
- **The compound-PR cost-leak pattern.** Two PRs land on the same day. PR-A changes load/cadence; PR-B is supposed to ship the compensating cost-bump but defers a subset of caps in PR prose. The deferral isn't a hard merge-block on PR-A. Net: cadence change is live with the compensating data half-missing, and the gap leaks silently. The dispatch query coupling billing data (`external_cost_cents`) to scheduling eligibility (`= 0` → schedule hourly) is the structural amplifier. Named pattern + course-correction Journal entry at `35d67c87082c817fac39c445cb7bc1bc`.
- **Conditional-LLM bypass classification is per-cap-direct, but real call graphs chain.** `website-to-company → norwegian-company-data`: the latter is CLEAN when tested directly (numeric org-number fixture hits direct API), but becomes a leak surface when the former passes an LLM-extracted free-text company name that falls outside `isOrgNumber`'s regex. The CI gate's "is this cap in the bypass set?" check doesn't see chains. The structural follow-up To-do now considers chain edges.
- **PR #49 (2026-05-04) shipped a UPDATE block in `apply-migrations.ts` that was dead code at the time** — the Dockerfile CMD didn't invoke it, tsconfig rootDir excluded it from build. PR #51/#52 wired `runStartupMigrations()` on the API boot path; PR #49's UPDATEs only took effect after that landed. The chronology matters for ramp attribution: the cost-bump that was supposed to compensate PR #46's cadence flip didn't actually run for ~12 hours after the cadence flip.
- **The audit's "~50 always-LLM Haiku caps" estimate was a sample, not a total.** The actual count is 73. Audit's pure-LLM table called out "selected examples" — the additional 20 are Browserless+LLM caps (cookie-scan, gdpr-fine-lookup, terms-of-service-extract, etc.) the audit didn't enumerate. Don't read "~N" in audit reports as a precise figure.
- **Block 0064's IN-list is bind-parameter-driven, not string-concat.** `sql.join` + `sql\`${s}\`` pushes each slug as `$N`. Stable across DBs, no SQL-injection surface, and the test asserts placeholder count ≥ slug count. Pattern for any future bulk-slug UPDATE block.

## Cost

API tokens for this session: not measured directly. The cumulative work shipped four PRs, two Notion entries, two audit reports.
