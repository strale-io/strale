Intent: Read-only Notion-vs-code state reconciliation audit after the 2026-05-16 Openapi sprint to verify nothing in Notion overpromises versus what's actually in main.

## Outcome

Verdict: **ALIGNED_WITH_DRIFT** — see `c:/tmp/openapi-research/notion-vs-code-state-audit-2026-05-16.md` (full report) and registry entry `2026-05-16-notion-vs-code-state-audit` (run #11 in `c:/tmp/openapi-research/registry.json`).

- **0 NOTION_AHEAD** items — no customer-facing over-promising. All 30 EU30 Matrix rows have working capability files + manifests on main.
- **4 CODE_AHEAD** items — doc-layer lag only (Notion behind code, not customer-facing).
- **5 STALE_REFERENCE** items — Provider-Coverage DB header (Last updated 2026-05-15, pre-PR #120), Coverage Matrix doctrine page (Last updated 2026-05-13, pre-Openapi sprint), BR Coverage Matrix v1 view 404, etc.
- **1 TIER_DRIFT** item — PL T1 4/7 in Matrix vs 5 guaranteed in manifest (framework difference, not a failure).
- **0 COST_DRIFT** items.
- **2 STATUS_DOCTRINE_QUESTION** items — carried forward: 11 Openapi-routed = Live framing, DE In discovery.

## Open

Chat-side follow-ups (not executed this session):
- P2 — refresh Provider-Coverage DB page header (pre-dates PR #120 merge)
- P3 — refresh Coverage Matrix doctrine page (pre-dates entire Openapi sprint)
- P3 — re-fetch AVS page for Phase 2c lag
- P4 — elevate StraleShareHolder shape contract to a Notion infrastructure entry

## Non-obvious learnings

- Notion canonical surfaces (DB page headers, doctrine pages) trail code-side state by 1-4 days even after sprint commits land. The Vendor Roster Openapi.com row WAS updated (Last evaluated=2026-05-16) but the Provider-Coverage DB header wasn't — different update cadences per surface.
- The audit was read-only end-to-end (no worktree mutations). `strale-research` worktree HEAD remained at `8eb8c0e`, current worktree on detached HEAD throughout.

## Cost

Zero. Read-only audit of Notion + main code state.
