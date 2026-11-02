Intent: sync Strale's wow-core comms payload to wow-core@6d08fdc (docs and the shared bus scripts only).

- `docs/COMMS_CORE.md`, `.claude/scripts/bus.mjs`, `.claude/scripts/gh-api.mjs` updated from wow-core (moonlighter-ab/wow-core#216–#220, the 2026-11-02 simplification).
- What changes for Strale sessions: messages between sessions on the same account go directly (`send_message`) with the content in them; the agent bus keeps three jobs (Petter's asks on `needs-founder`, the account lease, each master's inbox for alerts and cross-account notes); a master may give its own lanes new tasks; a refused session start never goes to Petter.
- Removed from `bus.mjs`: `register` and `watch` (the PC watchdog/router is retired). Nothing in this repository calls them (checked `.claude`, `scripts`, `.github`, `docs/operations`, `DAILY-RUN.md`). `send`, `read`, `inbox`, `ask`, `done`, `asks`, `digest`, `lease` behave as before; `digest` now posts as sender `digest`.
- `.claude/bus.json` and `.claude/settings.json` are unchanged (the inbox SessionStart hook still calls `bus.mjs inbox`).
- Strale's own DECs that say "messages between sessions go over the agent bus" (DEC-20261027-C) stay valid: the bus is still the record for cross-account messages and Petter's asks; same-account sessions may also message directly.
- Next: the Strale orchestrator reviews and merges this PR once CI is green (Strale has no `merge-gate` yet).
