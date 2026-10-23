Intent: Draft a risk-based replacement for the scraping doctrine for Petter's decision.

# Data-access rule proposal (DQ-35)

Petter asked on 2026-10-23 whether Strale's scraping rules are too strict
compared with other players. The answer, drafted as proposed decision
DEC-20261023-A in
[the proposal](../../../docs/strategy/2026-10-23-data-access-risk-rule-proposal.md),
is that the written doctrine is stricter than the law on public, non-personal
facts and is not followed by the catalogue as written. The proposal replaces
it with three lanes:

- **Never:** logins, getting around anti-bot measures, personal data, litigating
  platforms, database extraction, resale against vendor terms, media.
- **Allowed with checks:** customer-directed and per-call public reads, and
  vendor data with resale rights.
- **Preferred:** official and licensed sources.

The queue entry is DQ-35 in `docs/company/DECISION-QUEUE.md`, `your_call`.

**Not in force.** Nothing changes in code, CLAUDE.md, the blocklist or the
DEACTIVATED map until Petter decides. The M2 decision register is closed:
adding a formal record trips `CLOSING_REVIEW_STALE` and the count checks.
So the proposal lives in `docs/strategy/`, and on adoption it is recorded in
CLAUDE.md Active Decisions, as DEC-20260910-A was.

**On adoption, the next session:**

1. Adds DEC-20261023-A to CLAUDE.md Active Decisions and rewrites the doctrine
   bullets, plus AGENTS.md.
2. Adds `reddit.com` to `apps/api/src/lib/tos-blocklist.ts`.
3. Updates the DEACTIVATED notes that cite Tier 1.
4. Replaces the project memory note on the three-tier doctrine.
5. Reviews each "unlock" tool's executor against the lanes before reactivating
   it.

Checks run in the worktree: `docs:check` passes, and `context:check` reports
no warnings after `context:generate`.
