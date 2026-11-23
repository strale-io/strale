Intent: take over as Strale master on account gmail for the wow-core takeover (session_01Ms71ZkQZK9DqQ5vJa1nVrW), resume from the repo and sync wow-core.

# 2026-11-23 Strale master takeover, account gmail

Session session_01Ms71Zm2azuCd9zTyGYEtHZ, started about 08:00 Swedish time.

- **Lease:** newest LEASE (2026-11-23 07:40 Swedish time, account `gmail`) names only `wow-core`. `lease --check --session <id> --parent session_01Ms71ZkQZK9DqQ5vJa1nVrW` answers active (account label match). Once the lease has a `strale` entry, check without `--parent`.
- **wow-core sync (comms profile):** run with wow-core's own `sync-to-project.ps1 -Profile comms` to c3cb9f0. Changed: `.claude/scripts/wow-hook.mjs` and `docs/FOUNDER_PROFILE.md` (outside models: any session may ask the model desk; Google AI Ultra added to the budget; hard stop 4 reworded to "no key in any prompt; customer, production data and mail only where the provider's terms fit"). wow-core's `scripts/wow-hook.test.mjs` passes 318/318 on that commit; both synced files are byte-identical to wow-core's.
- **Scheduled tasks:** none recreated. Strale keeps no Claude routines by design (`docs/company/RECURRING.yaml`).
- **Bus:** nothing new on `strale-planning` since 2026-11-06.
- **Today's daily run** already ran from the PC (PR #1103, `chore/checkin-2026-11-23`, owned by that session; not touched here). Its handoff on that branch, "Next session", is the queue this master takes up.

## Queue (from the 11-23 daily run, in its order)

1. Security: verify the x402 payment-dedup key against the Junk-folder report, before other builder work. Owner: this session.
2. weekly-drift: red four scheduled runs in a row; settle it. Owner: this session.
3. Platform guard for characters the database cannot store, in any tool's output (settle path).
4. `url-to-text` manifest PDF limitation, after #1103 merges.
5. Exercise #1100 in production with a key-holding session.
6. Inbox routine: two overdue follow-ups, DataCircle's credit request, the RIK draft.
7. Overdue weekly rows: `weekly-review`, `weekly-free-callers`, `weekly-listings`.

Next authorised action: verify the x402 payment-dedup claim | Owner: Strale master | Blocker: none
