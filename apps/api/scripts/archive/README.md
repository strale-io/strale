# Archived one-shot scripts

This directory holds scripts that were used for specific historical operations and are preserved as pattern reference, not for reuse. Each script references the DEC that produced it.

## 2026-08-17 batch (Codebase Quality Program Phase 3, T3.1)

92 top-level scripts moved here in one pass (`ops/phase3-debloat`), after a
full reference-grep sweep (CI workflows, `package.json`, `.claude/commands`,
`.claude/skills`, `apps/`, `scripts/`, `docs/`, `Dockerfile`, root `*.md`) and
a header read of every candidate. Full disposition table with per-file
reasoning is in the PR/commit body and the session handoff
(`handoff/_general/from-code/2026-08-17-phase3-debloat.md`). Categories:

- **Dated migration pre/postflight checks** whose migration shipped (0021,
  0024, 0055, 0052–0057) — superseded by `runStartupMigrations()`.
- **`diag-*` / `investigate-*` / `*-investigate` one-time investigations**
  tied to a resolved incident (Browserless outage, CZ/SG/UK-property/ECB
  state, x402 user/query spot-checks, SQS-engine artifacts).
- **`phase-4b1-*` / `gate4b-retrospective.ts` / `gate5-retrospective.ts` /
  `validate-phase-3/*`** — completed onboarding-pipeline phase work; the
  underlying gates (`onboarding-gates.ts`, `gate4b-solution-dryrun.ts`,
  `gate5-path-coverage.ts`) remain live, only the retrospective/validation
  wrapper scripts for those specific phases are archived.
- **`backfill-*` / `populate-rug-bytecodes.ts`-adjacent / `sync-*-2026-04-29`**
  one-shot column backfills — superseded by `onboard.ts --discover` /
  `sync-manifest-canonical-to-db.ts` for anything recurring.
- **`smoke-*` build-time validations** (CY/EE directors parse, LayerZero,
  Singapore, Web3A, Budimex, HMRC sandbox, domain-trust solution) — proved
  a specific implementation once; ongoing coverage now comes from the
  capability's own test suites.
- **`drop-*` / `pause-*` / `park-*` / `suspend-*` / `reactivate-*` catalog
  actions** — one-time deactivation/park operations tied to specific DECs
  (DEC-20260421-J, DEC-20260427-I, DEC-20260428-A). `sync-deactivated-to-db.ts`
  archived too: its logic now runs automatically on every boot via
  `autoRegisterCapabilities()`.
- **`verify-locks.mjs`** — hardcoded an absolute path into the *main*
  checkout (`C:/Users/pette/Projects/strale/.env`); could never run
  anywhere else. Preserved for the advisory-lock query pattern only.
- **`verify-phase-c-state.mjs`** — the Phase C bake monitor. Referenced by
  `check-no-external-column-access.mjs`'s allowlist; that reference was
  updated to point at the new path rather than left dangling (see that
  file's comment).
- **`mutate-metrics-guards.py`** — mutation-test harness with a hardcoded
  Windows path into the main checkout, describing its own prior crash bug
  in the docstring. Preserved as a pattern for a future portable rewrite.
- **Misc one-off diagnostics** (`find-leak.ts`, `who-called.ts`,
  `get-api-key.ts`, `rotate-test-key.ts`, `trace-qp.ts` — the last two
  reference the deleted SQS `qp`/quality-profile concept directly).

**Not archived despite superficially matching a pattern** — kept live because
still referenced (CI, cron, skills, or production code):
`onboard.ts`, `smoke-test.ts`, `validate-capability.ts`, `sweep-prod-catalog.ts`,
`sweep-paid-fixtures.ts`, `build-disposition.ts`, `sync-manifest-canonical-to-db.ts`,
`sync-manifest-text-to-db.ts`, `sync-known-answer-fixtures.ts`,
`capture-tier-fixtures.ts`, `lifecycle-transition.ts` + `-slim`,
`reset-circuit-breaker.ts`, `fix-corrupted-output-schemas.ts` (its own
remediation instructions are printed by `jsonb-value.ts`'s error path),
`prune-claude-worktrees.ts` (`WORKTREES.md` Rule 3), `topup-test.ts` and
`get-api-key.ts`'s sibling `rotate-test-key.ts`'s non-hardcoded cousin
`reset-circuit-breaker.ts`, `seed-kyb-solutions.ts` (still the KYB-solutions
generator — its literals are in the live `pii-identifier-allowlist.txt`),
`populate-error-codes.ts` / `populate-fallbacks.ts` / `populate-rug-bytecodes.ts`
(general maintenance CLIs over live registries, not tied to one event),
`check-output-schema.ts` (CI-wired via `weekly-drift.yml` — a 2026-08-12
internal audit had flagged this one for deletion; it was re-verified live
by fresh grep before this batch and kept), `verify-settlement-order-mutations.mjs`
(mutation-verifies the x402 settlement-order regression test per
DEC-20260504-A's fail-before/pass-after standard), `audit-capability-pairing.ts`
and `audit-placeholder-fixtures.ts` (self-describe as standing guards; not
CI-wired yet — flagged as promotion candidates, out of this phase's scope).

## Current contents

### phase-dec-b-backfill.ts

Used for Stage C.1 of DEC-20260423-A (capability onboarding pipeline coverage fix, 2026-04-23). Backfilled 21 active capabilities with NULL `output_field_reliability` via live `--discover` execution. 18 passed, 3 failed due to missing known_answer fixtures (parked in Stage C.2).

Not for reuse. Backfill for future capabilities flows through `persistCapability` + `checkReadiness` per DEC-20260423-B. If a similar mass backfill is ever needed again, this script is pattern reference for how to sequence discovery runs safely against prod.

### phase-dec-b-park.ts

Used for Stage C.2 of DEC-20260423-A. Parked 12 capabilities permanently: 9 UK-property per DEC-20260421-L pattern, 3 blocked-backfill pending fixtures. Wrote `deactivation_reason` with tombstone context (the prompt assumed `deactivated_at` and `deactivation_note` columns which don't exist on the `capabilities` table; schema substitution documented in DEC-20260423-A Outcome).

Not for reuse. Park pattern is documented in DEC-20260421-L.
