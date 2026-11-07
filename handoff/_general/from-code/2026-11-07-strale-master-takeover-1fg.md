Intent: the Strale master after the 2026-11-07 account takeover to `1fg` (session session_01RFNL6WAcqYWJKtyJRfBGCw, parent wow-core takeover session_01RFNL6TsX8ERmFj7FDhHjAF) resumed from `2026-11-06-strale-master-takeover.md` and `2026-11-07-checkin-morning.md`.

[BACKFILL] Cloud session; no Notion write was made.

## Lease

- The bus and wow-core repositories had to be attached with add_repo first.
- `bus.mjs lease` at 23:00 Swedish time: account `1fg`, since 22:54, naming only `wow-core:session_01RFNL6TsX8ERmFj7FDhHjAF`. There is no strale entry yet.
- `bus.mjs lease --check --session session_01RFNL6WAcqYWJKtyJRfBGCw --parent session_01RFNL6TsX8ERmFj7FDhHjAF` → active, because `WOW_ACCOUNT_LABEL=1fg` matches the lease's account.
- Once the lease names `strale:`, run the check without `--parent`.

## Account

- Account `1fg`. Seven-day utilisation was 1% at the start.
- The seven-day window resets 2026-11-14 01:00 Swedish time.

## wow-core sync (this PR)

- `sync-to-project.ps1 -Profile comms` was run against wow-core `2161cafe`. Strale had been at `bcad3f6c`.
- **Changed:**
  - `bus.mjs`
  - `wow-hook.mjs`
  - `docs/COMMS_CORE.md`
  - `docs/FOUNDER_PROFILE.md`
  - the stamp and the manifest
- **Unchanged:**
  - `cloud-env.sh`, `cloud-setup.sh` and `gh-api.mjs` were already current.
  - The hooks were already wired, so `.claude/settings.json` did not change.

## State found

- **Codex results:** every result the dispatcher reported on 2026-11-06 has merged:
  - #928 weekly distinct payers;
  - #936 and #941 nordic-statistics;
  - #942 phone fictional ranges;
  - #947 company-enrich metadata;
  - #964, the url-to-markdown parse bound.
- **Stale branches:** the `codex/*` branches left on origin are stale. Deleting them is still blocked by the classifier, as recorded on 2026-11-07.
- **Open PRs:**
  - #950 is a draft that needs a redesign per its round-3 findings.
  - #905, #730 and #682 are held.
- **Model upgrade step 2b:** this waits for the PC comparison run. The command is in `2026-11-06-strale-master-takeover.md`.

## Next (in order)

1. Before Sunday's weekly-drift run (2026-11-08, 17:50 Swedish time): `customs-duty-lookup` and `container-track` against the robots.txt strict sweep (#747).
2. Relaunch #950 from its `Resume here` line.
3. Find the cause of `domain-age-check`'s "temporarily unreachable" errors.
4. Exchange-rate timeouts, and the currency-source gap.
