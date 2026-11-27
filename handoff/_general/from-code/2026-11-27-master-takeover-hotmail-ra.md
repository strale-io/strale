Intent: take over as Strale master on account hotmail-ra for the wow-core takeover (session_01CR5YPr8WQNRbuD6iw4NFnn), sync wow-core and resume from the newest handoff.

# 2026-11-27 Strale master takeover, account hotmail-ra

Session session_01CR5YPsGmG8bJyHTPhDQHiH, morning of 2026-11-27 Swedish time.

- **Lease:** newest LEASE (2026-11-27 08:13 Swedish time, account `hotmail-ra`) names only `wow-core`. `lease --check --session cse_01CR5YPsGmG8bJyHTPhDQHiH --parent session_01CR5YPr8WQNRbuD6iw4NFnn` answers active (account label match). The environment sets `WOW_ACCOUNT_LABEL`, so no `--add` was needed. Once the lease has a `strale` entry, check without `--parent`.
- **Bus and wow-core:** both attached with `add_repo` (the bus was not reachable at session start). wow-core cloned read-only at 390490f.
- **wow-core sync (comms profile): not done.** `sync-to-project.ps1 -Profile comms` (88a8b84 → 390490f) was refused by this session's permission check, because it rewrites hook scripts (`wow-hook.mjs`). Not worked around. Strale stays on 88a8b84 until a session that is allowed to run the sync does it.
- **Scheduled tasks:** none created. Strale keeps no Claude routines by design (`docs/company/RECURRING.yaml`).
- **Resumed from:** `2026-11-24-master-takeover-1fg.md`, "Next authorised action".

## Done

1. **Limitation texts confirmed in production** on `GET /v1/public/ops/limitations/capabilities/<slug>`: `address-geocode` and `address-validate` carry the pacing text (one lookup per second, queued about 1.1 s apart, refused unbilled past 4 s); `url-to-text` carries the PDF/binary refusal text. This closes the 2026-11-24 next action.
2. **Open PRs:** only draft #730 (T7 small and agent contract, last touched 2026-11-11). Nothing waiting on review or a label.
3. `origin/main` unchanged since #1107 (2026-11-24); no daily-run record for 2026-11-25 to 2026-11-27 on `main`.

## Not done here (needs a key-holding, private-workspace or local session)

- Daily runs for 2026-11-25 to 2026-11-27 (the local morning session owns them).
- Exercise #1100 in production ("TUCOWS INC", "BANK OF AMERICA CORP" as free text).
- Watch buyer `fa6a0cd5` for a third bulk day.
- Overdue weekly rows `weekly-review`, `weekly-free-callers`, `weekly-listings`.
- robustness T3 (1): `npm run vendor:status` for the Serper receipt needs production keys.
- Inbox: two overdue follow-ups and DataCircle's credit request remain Petter's.

Next authorised action: run the wow-core comms sync to 390490f from a session allowed to rewrite hook scripts | Owner: Strale master | Blocker: this session's permission check refuses the sync
