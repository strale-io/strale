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

## Queue (unchanged from today's morning handoff, `2026-11-17-checkin-morning.md`)

Builder work:
1. With Codex: `upstream-check-timeout-retry` (one retry on a timeout-only live failure in `record-upstream.ts --check`).
2. With Codex: `weather-zip-and-saint` ("St"/"St." as "Saint"; ZIP regression tests).
3. Not yet briefed: us-company-data exact lookup on the model-extracted name for free-text input (removed from #1091 on review because its "exact" is measured against the model's wording; needs a design that avoids that before a brief).

Non-builder, for the next interactive or morning session:
4. Verify #1091 in production: `us-company-data` for "ORACLE CORP", "Bank of America Corp", "Tucows Inc".
5. Watch whether the largest payer repeats the bulk `pricing-page-extract` / `us-company-data` jobs.
6. The three overdue weekly rows (`weekly-review`, `weekly-free-callers`, `weekly-listings`).
7. Account closure Petter approved on 11-16: run it, then his confirmation to the customer.

Next authorised action: Claude review of the two Codex branches when the dispatcher reports them | Owner: Strale master | Blocker: none
