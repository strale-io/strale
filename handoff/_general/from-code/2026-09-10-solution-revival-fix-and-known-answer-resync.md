# Solution revivals stopped, review backlog waived, known answers resynced

**Intent:** stop four deliberately-deactivated solutions from reviving, unfreeze
`main`, and make the seven capabilities onboarded 2026-09-06 run their reviewed
test rules instead of the discover-time ones.

Date: 2026-09-10
PRs: #628 (merged), #626 (merged, deployed `34ee32d`), `fix/known-answer-resync` (this branch)

## What happened

**Solution revivals (#626).** Four solutions deactivated on 2026-09-06 for
resting on free vendor tiers that forbid resale (`web3-pre-trade`,
`web3-pre-tx-gate`, `web3-token-safety`, `web3-wallet-snapshot`) were active
again. `jobs/test-scheduler.ts` `checkSolutionGates()` carried a private copy
of the activation rule that ignored `deactivation_reason` and whether step
capabilities were still on. Now one predicate
(`lib/solution-activation.ts`) serves all six automated activators, and a
structural test fails CI on any writer that sets `solutions.is_active`
non-false without calling it. Two independent review rounds (FAIL, then PASS).
Compliance was contained throughout: `x402_enabled` stayed false and
`solution-executor.ts` refuses a step whose capability is not servable.

**Production write, 2026-09-10 16:11 UTC, after the deploy:** the four rows
flipped to `is_active = false` once (only rows still carrying a non-vendor
deactivation reason). Watched afterwards with a read-only checker that also
counts the tests run on their sibling steps in the window. Result: see the
closing note at the bottom.

**Codex review backlog (#628).** All 36 rows waived under the founder's
2026-09-07 review policy as `DEC-20260910-A` (founder instruction in chat:
"go with option 1, waive all 36"). `codex:check` is green again.

**Known-answer resync (this branch).** The seven capabilities onboarded
2026-09-06 were running the rules `onboard.ts --discover` generated, not the
manifest rules reviewed afterwards — nothing pushes a manifest edit back to
`test_suites`. Those rules pinned values that change by themselves:
`citation-graph` `citations_unavailable = false` (failed once already when
OpenAlex's citing-works call degraded), `cert-transparency-search`'s latest
certificate date, `company-fundamentals`' latest fiscal-year end (would break
at Apple's next 10-K), plus not_null on fields declared rare or common.
`uk-cop-check` carried a DB-only `checked_at` timestamp equality (dormant:
paid, the harness refuses it).

- Manifests assert values fixed by the input (OpenAlex id, CIK, Crossref,
  adobe.com breached) and keep guaranteed-field checks by type. 40 checks
  verified against live output; a planted wrong answer failed the verifier.
- `lib/known-answer-checks.ts` is now the single `expected_fields` → checks
  mapping; `onboard.ts` and `sync-known-answer-fixtures.ts` each had a copy.
- `sync-known-answer-fixtures --dry-run` prints per-field removed / changed /
  added. 9/9 planted failures caught by the new test.

Catalogue-wide survey (read-only, 367 active known_answer suites): 23 date
equals on 14 capabilities; almost all are historical registration dates (good
known answers). Only the ones above were time-bound.

## Next action

1. After this branch merges: run
   `npx tsx scripts/sync-known-answer-fixtures.ts --slugs breach-exposure-check,cert-transparency-search,citation-graph,clinical-trials-search,company-fundamentals,doi-resolve,fda-safety-search,uk-cop-check`
   from `apps/api` with the write grant, dry run first; then confirm the next
   known_answer results for the seven pass.
2. Open: the process gap itself — a manifest's known_answer edited after
   onboarding reaches the DB only if someone runs the sync script. Candidate:
   a daily-run step that dry-runs the sync across all manifests and reports
   any drift.
3. Still pending from 2026-09-06: terms check of the remaining commercial
   upstreams (AviationStack, Alternative.me, GoPlus, Adzuna, Docker Hub,
   GitHub API, public Ethereum RPC); a "what bundles this?" check in the
   deactivation path; building the input-redaction mechanism
   (`docs/security/2026-09-06-input-redaction-at-write-proposal.md`).
