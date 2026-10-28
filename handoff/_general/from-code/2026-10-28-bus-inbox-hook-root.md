Intent: make the bus inbox SessionStart hook added by #798 resolve its script from the git root and bound its run time.

- `.claude/settings.json`: the inbox hook now runs `bus.mjs inbox` from `git rev-parse --show-toplevel` like the other Strale hooks, with a 25 s child timeout, a 30 s hook timeout and exit 0 always. Before, a session started in a subdirectory got a module-not-found error; a hung `gh` call had no bound.
- Verified: old command from `apps/api` throws MODULE_NOT_FOUND; new one prints the inbox line (HTTP 403 in cloud sessions until the bus repo is attached) and exits 0. `handoff-check` and `regenerate-indexes` tests pass.
- Upstream note for wow-core: the comms profile ships the relative command; the git-root form belongs in wow-core's template too, and the ask channel name (`needs-founder` in `bus.mjs` vs `needs-petter` in the Strale brief) needs reconciling there.
