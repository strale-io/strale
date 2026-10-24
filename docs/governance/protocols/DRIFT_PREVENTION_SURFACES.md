---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Drift-prevention surfaces"
moved_at: 2026-10-24
---

# Drift-prevention surfaces

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

When changing facts that appear on multiple surfaces (capability count, country count, retention period, vendor names, free-tier list, processing region), update **only** the canonical source and let consumers read from it:

- **Backend canonical source**: `apps/api/src/lib/platform-facts.ts` — `STATIC_FACTS` for fixed values, `computePlatformFacts()` for live-DB values. Exposed via `GET /v1/platform/facts` (cached 5 min).
- **Frontend consumer**: `usePlatformFacts()` hook in `strale-frontend/src/hooks/use-platform-facts.ts`. Component pages read from this; never hardcode the displayed value.
- **Static frontend files** that can't reach the hook (`public/llms.txt`, `public/.well-known/*.json`): use phrasing that doesn't bake in counts, with a pointer to `/v1/platform/facts`.

The `apps/api/scripts/check-platform-facts-drift.ts` guard (run via `npx tsx`, wired in weekly-drift.yml) catches new hardcoded values introduced into surface files. The weekly cron runs the same sweep across both repos and opens a tracking issue on any drift.

For vendor switches specifically, invoke the `vendor-switch` skill (in `.claude/skills/vendor-switch/SKILL.md`) — it codifies the full surface-update + DEC-entry checklist.
