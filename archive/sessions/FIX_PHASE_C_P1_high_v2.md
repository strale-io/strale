# Phase C — P1 high severity fixes (revised)

**Goal**: Fix the two P1 findings from Session 0: F-0-003 (`/v1/internal/*` auth boundary) and F-0-009 (fire-and-forget pattern + integrity-hash hardening). Complete the SSRF migration started in Phase B using the bucket inventory in `FIX_PHASE_B_ssrf_migration_todo.md`.

**Prerequisite**: Phase B complete. `FIX_PHASE_B_report.md` and `FIX_PHASE_B_ssrf_migration_todo.md` exist at repo root. Vitest and CI are live from Phase B Fix 0.

**Pre-decided inputs (from kickoff, 2026-04-17)**:
- **F-0-003 path**: Path A. Do not search the frontend repo. Do not block on the frontend question. If contradicting evidence surfaces while implementing, flag in the report and stop.
- **Integrity-hash path**: measure first; if p95 < 20ms use Path A (synchronous), else Path B (two-phase + retry worker). If measurement isn't feasible in this session, use Path B. Record the decision + reasoning in the report under "Stage 2 decision".

See the full brief contents below for the complete spec.

---

(The full brief as pasted by Petter on 2026-04-17 follows; preserved verbatim
for traceability.)

## Fix 4: F-0-003 — `/v1/internal/*` auth boundary

Path A:
1. Rename public GETs to `/v1/public/ops/*` (breaking for frontend).
2. Add `isValidAdminAuth` middleware at top of `/v1/internal/*` mount.
3. Remove per-handler `isValidAdminAuth` checks (now redundant).
4. Comment at mount point lists what counts as internal.

## Fix 5: F-0-009 — `fireAndForget` + integrity-hash hardening

Stage 1: Install Pino + Better Stack, request-id middleware, `fireAndForget`
helper, replace ~89 bare `.catch(() => {})`, add ESLint rule.

Stage 2: Integrity hash — measure p95; Path A (sync) or Path B (two-phase +
retry worker).

## Fix 6: SSRF migration — complete the bucket walk

Work through the four-bucket triage in `FIX_PHASE_B_ssrf_migration_todo.md`.
Migrate shared helpers first. Handle `redirect-trace.ts` specially.
Unify `validateHost` with `isBlockedIp`. Parameterized per-bucket tests.
CI inventory guard.

See git history for the full brief received; condensed here to keep this file
usable as an on-disk reference.
