Intent: orchestrator checkpoint after the 2026-11-04 takeover to account 1fg, so the next Strale orchestrator resumes from main alone.

# Orchestrator checkpoint, 2026-11-04 afternoon (cloud, account 1fg)

**Supersedes `2026-11-04-orchestrator-checkpoint.md`.** Its "Waiting on Petter"
additions and the 2026-11-02 cloud-session notes still hold.

## Lease

The `fleet-lease` names account `1fg`; the Strale entry is
`session_01RFNL6TLV5jtWpGMEzuea6W` (added 2026-11-04 12:55 Swedish time, after the
wow-core takeover session `session_01RFNL6UqKhNGD3x7Y6jvES9` took the lease).
Check: `node .claude/scripts/bus.mjs lease --check --session <id>` after attaching
`WOW_BUS_REPO` with `add_repo`. With `WOW_ACCOUNT_LABEL=1fg` set, the account decides.

## Done this session

- The website stack merged into `main` as #892 (`3a0e2229`, 12:52 Swedish time,
  by the hotmail-ra orchestrator just before the takeover), after an independent
  review. All four stacked heads are #892 commits, so #726, #727 and #736 were
  closed as superseded (branches kept). Nothing is published.
- Website step 3: `docs/programs/brand-website/SWITCH-OVER-READINESS.md`. Verdict:
  not ready, because the site links to `/signup`, `/topup`, `/terms`, `/privacy` and
  `/guides`, which `apps/web` does not have yet. Brand-website T6 points at it.

## In flight

- **WP12 batch 2** (cto-readiness T18): connect-time re-check so raw-socket tools
  connect to the vetted IP, closing DNS rebinding (audit CR-11; the register said
  CR-12). Built by a worktree agent on `fix/wp12-connect-time-recheck`; the
  orchestrator runs the independent review and opens the PR.

## Next action

After WP12 batch 2: the switch-over list's session work, item 1 first (`/signup`,
`/topup` and `/audit/:id` in `apps/web`, same behaviour as `strale-frontend`).
