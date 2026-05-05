Intent: ship PR1 of the two-PR SQS deletion (DEC-20260503-B) — strip SQS engine, response shapes, gates, automatic lifecycle, and SQS-bearing helpers from strale; run pre-push diagnostics; push and let Railway redeploy.

## What shipped

**Six commits on `main`, all pushed to origin in one go:**

- `6e71d7d` test: integration smoke asserting no SQS keys on public endpoints — gating test at `apps/api/test/integration/no-sqs-keys.smoke.test.ts`. Vitest config updated to include the `test/` path.
- `394ef47` feat!: remove SQS fields from public response shapes (wave 1) — strips `sqs`/`sqs_label`/`quality`/`reliability`/`trend`/`quality_warning`/`min_sqs` from `/v1/capabilities`, `/v1/solutions`, `/v1/transactions`, `/v1/audit/:id`, `/v1/suggest`, A2A, x402, OpenAPI, transactions test fixture, and the `POST /v1/do` response. Drops the SQS quality gate (`PLATFORM_FLOOR_SQS`) and the platform-floor gate.
- `1bc59dd` feat!: rip out automatic lifecycle, replace matching tiebreaker (wave 2) — option-1 lifecycle rip-out per chat decision: `evaluateLifecycle` / `runLifecycleSweep` / `smokeTest` / `getStateEnteredAt` deleted; `transitionCapability` survives for manual flips. Tiebreaker on `matching.ts` swapped from `matrixSqs DESC` to `priceCents ASC, slug ASC`. Solutions auto-gate replaced with substrate-only "every step has a passing test_result in 30d." `execution-guidance` no longer called from test-runner.
- `20c4055` chore: delete SQS scoring engine and rewrite SQS-bearing helpers (wave 3) — 48 files, 182 insertions, 6622 deletions. Whole-file deletes: sqs.ts, quality-profile.ts, reliability-profile.ts, sqs-matrix.ts, sqs-constants.ts, sqs-snapshots.ts, freshness-decay.ts, execution-guidance.ts, verify-dual-profile.ts, audit-capabilities.ts, routes/quality.ts, routes/internal-quality.ts, routes/internal-trust.ts, jobs/refresh-stale-scores.ts + four diagnostic scripts. Strips: `persistDualProfileScores` / `computeAdaptiveInterval` / `runAdaptiveScheduler` / `startScheduledTests` / `repairStaleScores` from test-runner; SQS snapshot + stale-refresh schedule blocks from test-scheduler; CHECK 1/2/4 + `detectCorrelatedFailures` from invariant-checker; 8C SQS sweep from meta-monitoring; SQS distribution + publish threshold from internal-health-monitor; SQS narrative from llms-txt / mcp-server-card / reply-webhook / web3-assurance docstrings; `sqs?: number` and friends from MCP / SDK-TS / SDK-Python / Semantic-Kernel types; the entire `strale_methodology` MCP tool body rewritten to ~30 lines of substrate-honest text; runMigration0028_sqsDailySnapshot block + corresponding tests.
- `063d53a` chore: final SQS reference sweep — deletes 9 admin scripts that imported deleted modules; self-heal-check.ts Check 5 (scoring integrity) reduced to a no-op; manual-test-rerun comment cleanup; console-allowlist purges.
- `ae338fb` docs: PR1 pre-push diagnostics — push approved — adds `apps/api/scripts/prepush-diagnostics.ts` (reusable) and `audit-prepush-pr1-20260505.md`.

**Pre-push diagnostics (Phase 1 only) ran clean against production DB:**
- Check A — lifecycle: 285 active / 6 suspended / 1 probation / 1 degraded. Below the >5-degraded halt threshold. After PR1 the 8 non-active capabilities will not auto-recover; manual flips via `lifecycle-transition.ts --slug X --to active` for any to be reactivated.
- Check B — solutions cascade: 113 active, 3 (2.7%) would deactivate on the next scheduler tick under the new gate. Below the 10% halt threshold. All three SG solutions, all blocked on `singapore-company-data` having no passing test in 30 days. Petter authored the follow-up investigation handoff (`2026-05-05-singapore-company-data-investigation.md`) — diagnosis B: the suites are `active=false` with `status='upstream_broken'` from the prior Browserless+OpenCorporates implementation; the executor was rewritten 2026-04-29 to data.gov.sg CKAN but the suites weren't reactivated.

**Phase 2 (frontend grep) skipped** per chat — strale-frontend has an in-progress redesign covering the SQS-rendering pages (CapabilityDetail.tsx, SolutionDetail.tsx + a new integrations directory tree). Folding SQS field removal into the redesign supersedes the inventory.

**Push:** `89f99ee..ae338fb main -> main` — fast-forward to origin. Railway auto-deploy expected; not confirmed via CLI within the observation window (logs at the moment of check were still emitting `dual-profile-persist-complete` from the pre-push deploy — build typically takes 60–120s to cut over).

**tsc / npm test / npm run build / smoke:** all green at HEAD pre-push. 500 passed + 11 skipped + smoke 8/8.

## What's open

**PR2 — schema drop and rename** (next session, ≥24h after PR1 deploys cleanly):
- Drop columns from `capabilities`: `qpScore`, `rpScore`, `matrixSqs`, `matrixSqsRaw`, `trend`, `guidanceUsable`, `guidanceStrategy`, `guidanceConfidence`. Drop table `sqs_daily_snapshot`. Update Drizzle journal + snapshot.
- Rename `capability_health` → `source_health`. Add columns per DEC-20260503-B: `last_fixture_tested_at`, `last_canary_tested_at`, `last_customer_observed_at`, `degradation_reason`, `fallback_available`, `status` enum (`healthy / degraded / unavailable / not_covered / unverified`).

**Frontend cutover (strale-frontend):**
- The old API contract is gone. CapabilityDetail.tsx and SolutionDetail.tsx (currently dirty with redesign work) need their SQS-rendering removed before Vercel redeploys. Petter folds it into the redesign branch. No CC follow-up on strale-frontend.
- API contract test fixture in `strale-frontend/src/lib/__fixtures__/` will need re-capture against the new wire shape.

**Manual lifecycle flips:**
- 1 capability in `degraded` and 6 in `suspended` will not auto-recover. Petter decides per-cap whether to re-flip via `lifecycle-transition.ts`. The `suspended` ones in particular have been there long enough that the auto-deactivate-after-30d rule (also retired) may have stranded them.

**SG cascade fix (separate, Petter authored handoff):**
- `singapore-company-data` test suites need `--backfill --discover --fix` against the data.gov.sg CKAN executor; once reactivated the 3 SG solutions stop being cascade candidates. Doesn't block PR1; Petter will handle in his next dev session.

**Notion follow-ups (chat-side MCP, not CC):**
- DEC-20260505-B: Lifecycle automatic state transitions ripped out per SQS deletion (Option 1).
- DEC-20260505-C: Capability-matching tiebreaker replaced from matrixSqs DESC with priceCents ASC, slug ASC fallback.
- Distribution Surfaces Registry update: SDK packages (`straleio` PyPI, `@strale/sdk` npm, `strale-mcp` npm, `strale-semantic-kernel` npm) had optional SQS fields removed (non-breaking for clients that don't read them). New versions need publishing.
- Rule 11 supersession sweep: many existing DECs reference SQS, dual-profile, QP/RP, matrix scoring, freshness decay, etc. — those need to either be marked superseded by DEC-20260503-B or have a doctrine-update note.
- CLAUDE.md: contains substantial SQS doctrine (Scoring Integrity Rules block, "SQS engine live" paragraph, references to `sqs.ts` and `EXTERNAL_SERVICE_PATTERNS`). Should be updated to reflect the deletion. Not done in this session.

## Non-obvious learnings

- **Lifecycle policy "option 1" reads as cleaner than it is.** Ripping out all auto-transitions (not just the SQS-keyed ones) means `draft → validating` and `validating → probation` no longer happen automatically either, even though those weren't strictly SQS-bound — `validating → probation` keys on QP score which is gone, but `draft → validating` was suite-count + schema + executor checks (no SQS). Per chat decision the prompt was "rip out automatic state transitions entirely", which I interpreted as all-or-nothing. If Petter wants `draft → validating` back as a non-SQS auto-transition later, it's a small re-add.
- **Solutions auto-gate substitution requires the test scheduler to run first.** The new "every step has a passing test_result in 30d" gate sits in the test-scheduler `checkSolutionGates()`. It only fires after a test batch completes for a step capability. So the gate is reactive, not eager — solutions don't deactivate at deploy; they deactivate when the next test batch covers their step capabilities. The 3 SG solutions in the diagnostics report are **predicted** deactivations, not committed ones; the suites being `active=false` means no test batch will run, so the gate may never fire for SG specifically until the suites are reactivated.
- **The diagnostic script's third query (sample of solutions that would deactivate) is what made the SG cascade trivially diagnosable.** Without the per-solution sample, the 2.7% number alone wouldn't have pointed Petter at `singapore-company-data` as the single root cause. Worth keeping in the script for future cascade-prediction passes.
- **The audit's ~62-file count was conservatively right.** Wave 3 alone touched 48 files, plus 5 in earlier waves and 9 admin scripts deleted in the sweep. The ~25-file informal threshold was the wrong frame; the real number was always going to be in the 50-70 range because SQS narrative was woven through digest/email/interrupt/methodology copy.
- **Railway deploy observation has a 60–120s gap after `git push`** — looking at logs immediately after push shows the pre-push build still serving. Don't read absence-of-new-build as a deploy failure within that window.

## Cost

Zero direct cost — no paid API calls during the session beyond the diagnostic script's read-only DB queries.
