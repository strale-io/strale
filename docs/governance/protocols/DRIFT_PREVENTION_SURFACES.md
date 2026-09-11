---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Drift-prevention surfaces"
---

# Drift-prevention surfaces

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 7, review round 1). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

> [!NOTE]
> The "Wire-shape rule for /v1/public/ops/trust/* endpoints" section that
> precedes this one in `CLAUDE.md` is a separate rule and is not part of
> this mirror.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Drift-prevention surfaces

When changing facts that appear on multiple surfaces (capability count, country count, retention period, vendor names, free-tier list, processing region), update **only** the canonical source and let consumers read from it:

- **Backend canonical source**: `apps/api/src/lib/platform-facts.ts` — `STATIC_FACTS` for fixed values, `computePlatformFacts()` for live-DB values. Exposed via `GET /v1/platform/facts` (cached 5 min).
- **Frontend consumer**: `usePlatformFacts()` hook in `strale-frontend/src/hooks/use-platform-facts.ts`. Component pages read from this; never hardcode the displayed value.
- **Static frontend files** that can't reach the hook (`public/llms.txt`, `public/.well-known/*.json`): use phrasing that doesn't bake in counts, with a pointer to `/v1/platform/facts`.

The `apps/api/scripts/check-platform-facts-drift.ts` guard (run via `npx tsx`, wired in weekly-drift.yml) catches new hardcoded values introduced into surface files. The weekly cron runs the same sweep across both repos and opens a tracking issue on any drift.

For vendor switches specifically, invoke the `vendor-switch` skill (in `.claude/skills/vendor-switch/SKILL.md`) — it codifies the full surface-update + DEC-entry checklist.
<!-- END VERBATIM FROM CLAUDE.md -->
