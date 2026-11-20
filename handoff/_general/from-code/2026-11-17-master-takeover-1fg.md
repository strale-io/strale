Intent: take over as Strale master on account 1fg for the wow-core takeover (session_01RFNL6XC1wvQA17PAX5tZiJ) and resume from the repo.

# 2026-11-17 Strale master takeover, account 1fg

Session session_01RFNL6ScBcPoMYb3sPeaj8r, started about 21:55 Swedish time.

- **Lease:** newest LEASE (2026-11-17 21:50 Swedish time, account `1fg`) names only `wow-core`. `lease --check --parent session_01RFNL6XC1wvQA17PAX5tZiJ` answers active (account label match). Once the lease has a `strale` entry, check without `--parent`.
- **Account:** 1fg, seven-day utilization 0.13, weekly reset Sat 2026-11-21 01:00 Swedish time.
- **wow-core sync (comms profile):** payload identical to wow-core 4c9f82e except `.claude/scripts/wow-hook.mjs`, which wow-core changed on 11-17 after Strale's 11-16 sync (ea479bd). Left for the weekly sync, due about 2026-11-23.
- **Codex:** at first no dispatcher in this period, so builder lanes were held. At 22:08 Swedish time the takeover leased this session as `strale` (lease #6961039399) and dispatcher session_01RFNL6TvSkEvQiKhoDDBipb sent readiness (signed in; Strale codexEnv valid, repository attached), checked against `lease --authority`. Requests sent: `weather-zip-and-saint`, `upstream-check-timeout-retry` (briefs on `codex/<slug>`).
- **Correction to the morning handoff's weekly-drift reading:** run 43911137718 failed only on `UR=1` (upstream-recordings); the robots step is report-only and not in the aggregate exit. The one finding was a World Bank timeout in `country-economic-indicators`. Re-run here: that slug no drift, full `--check` 32/32 without drift. Earlier red weeks had different, real findings (og-image strale.dev, usgs dated URL), since fixed. The robots findings for the five unlisted tools need no action.
- **Open PRs:** only #730 (draft, waits on Petter's DEC-20261024-A items 2 and 5, bus ask 6876167899).
- **Worktrees:** none besides the trunk in this container.

## Builds done this session

1. `upstream-check-timeout-retry`: merged as #1095 (22:15 UTC). One retry when a live check failed only on a timeout. Review GO; two LOW notes in the PR body.
2. `weather-zip-and-saint`: merged as #1096 (22:40 UTC). "St"/"St." reads as "Saint" (direct lookup, bare-name retry, City rule, comma paths); ZIP-suffixed inputs already worked and are now pinned by tests. Review findings fixed before merge.
   - Codex could not: two Codex runs (task_e_6afcc377…, task_e_6afccafe…) returned READY with no diff, so a Claude builder did it.
   - Production check pending: at 23:45 Swedish time production served 05fc5c61 (#1095), not yet #1096. Next session: confirm `/health` commit is c181c2cf or later, then run `weather-lookup` on "St Cloud, Minnesota".
3. Remote branch `codex/weather-zip-and-saint` (brief commit only, unmerged) left in place for the dispatcher to clear.

## Queue

Builder work:
1. Not yet briefed: us-company-data exact lookup on the model-extracted name for free-text input (removed from #1091 on review because its "exact" is measured against the model's wording; needs a design that avoids that before a brief).

Non-builder, for the next interactive or morning session:
2. Verify #1096 in production (above).
3. Verify #1091 in production: `us-company-data` for "ORACLE CORP", "Bank of America Corp", "Tucows Inc".
4. Watch whether the largest payer repeats the bulk `pricing-page-extract` / `us-company-data` jobs.
5. The three overdue weekly rows (`weekly-review`, `weekly-free-callers`, `weekly-listings`).
6. Account closure Petter approved on 11-16: run it, then his confirmation to the customer. **Closed 2026-11-20:** done on 2026-11-16 at 23:47 Swedish time, and Petter told the customer at 23:51; evidence in `handoff/_general/from-code/2026-11-20-account-closure-verified.md`.
7. Weekly wow-core sync, due about 2026-11-23 (`wow-hook.mjs` drift).

Next authorised action: verify #1096 and #1091 in production, then design the us-company-data exact lookup | Owner: Strale master or morning session | Blocker: none
