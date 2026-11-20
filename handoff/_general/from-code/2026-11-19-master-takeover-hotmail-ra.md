Intent: take over as Strale master on account hotmail-ra for the wow-core takeover (session_01CR5YPt6j3dCPtMjRKsKyPf), resume from the repo and sync wow-core.

# 2026-11-19 Strale master takeover, account hotmail-ra

Session session_01CR5YPsHShDjUSt2pPax4UV, started about 10:14 Swedish time.

- **Lease:** newest LEASE (2026-11-19 10:10 Swedish time, account `hotmail-ra`) names only `wow-core`. `lease --check --session <id> --parent session_01CR5YPt6j3dCPtMjRKsKyPf` answers active (account label match). Once the lease has a `strale` entry, check without `--parent`.
- **Account:** hotmail-ra, seven-day utilization 0.02, weekly reset Thu 2026-11-26 03:00 Swedish time.
- **Codex:** at first no dispatcher in this period. At about 10:19 Swedish time dispatcher session_01CR5YPtkMxjwdfF1pLGJZoM sent readiness (signed in; Strale codexEnv valid, repository attached), checked against `lease --authority`. Request sent: `us-company-data-verbatim-title` (brief on `codex/us-company-data-verbatim-title`, 79153202).
- **Scheduled tasks:** none recreated. Strale keeps no Claude routines by design (`docs/company/RECURRING.yaml`); reported to the takeover.
- **wow-core sync (comms profile):** run with wow-core's own `sync-to-project.ps1 -Profile comms` to 784552e. Only `.claude/scripts/wow-hook.mjs` changed (spawn depth read from a rebuilt transcript after compaction); the other six payload files were already identical. wow-core's `scripts/wow-hook.test.mjs` passes 315/315 on that commit, and the synced file is byte-identical to it.
- **Production:** `/health` reports 12dd3c5cd2bd, current main, so #1091 and #1096 are deployed. A paid call to exercise them (`weather-lookup` "St Cloud, Minnesota"; `us-company-data` "ORACLE CORP") was not made: this session holds no customer key, and a paid call is not its to make.
- **Bus:** nothing new on `strale-planning` since 2026-11-06. 19 open strale asks, unchanged.
- **Open PRs:** #730 (draft, waits on Petter, ask 6876167899) and this sync.

## Queue

Builder work:
1. In Codex: `us-company-data-verbatim-title`. A title-map hit on the model-extracted name counts only when that name is a verbatim span of the caller's text, so "exact" stays measured against the caller's words. Review the Codex result when the dispatcher reports it.

Non-builder:
2. Account closure Petter approved on 11-16. The admin route is live. Running it needs the customer's address (in the mailbox, which only the inbox routine reads) and `ADMIN_SECRET` (in Railway). Neither is in a cloud session; whoever holds both runs it. Petter's confirmation to the customer follows. **Closed 2026-11-20:** done on 2026-11-16 at 23:47 Swedish time, and Petter told the customer at 23:51; evidence in `handoff/_general/from-code/2026-11-20-account-closure-verified.md`.
3. Exercise #1096 and #1091 with one paid call each, from a session that holds a key.
4. The three overdue weekly rows (`weekly-review`, `weekly-free-callers`, `weekly-listings`).
5. Daily run overdue since 2026-11-17 (no run on 11-18 or, so far, 11-19). It needs the production read-only database URL, which lives only in the PC's local env files, so it cannot run from a cloud session.

Next authorised action: review the Codex result for us-company-data-verbatim-title | Owner: Strale master | Blocker: Codex run in progress
