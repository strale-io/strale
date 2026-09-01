Intent: Build and independently verify the inactive M2 repo-native formal
decision graph without activating it or silently resolving historical source
conflicts.

## Outcome

- Added unambiguous formal decision candidates for the current readiness and
  operating-authority chain.
- Preserved every reused historical ID in a complete collision registry: 35
  IDs, 71 source rows. Unresolved IDs cannot be imported or targeted.
- Kept the conflicting product and x402 meanings of `DEC-20260502-A` explicit
  and withheld all ambiguous graph edges.
- Added generated status/inverse/collision views and JSON Schemas.
- Added merge-base retention, forward lifecycle, protected-body, stable
  metadata/provenance, directional-cycle, collision, exact-section, and
  generated-file checks.
- Replaced the custom Markdown scanner with the pinned CommonMark reference
  parser and covered all adversarial visibility and line-break cases found by
  independent review.

## Review and verification

Separate Codex authority review passed clean. Technical review iterated through
every high/medium finding and finished with exact-head PASS at `e5631231`:
43/43 tests, zero context findings, clean MCP build, clean API typecheck, and a
clean verifier worktree. Every verification task was archived after its verdict.

The full review trail is in
`archive/sessions/2026-09-01-m2-decision-authority-review-codex.md`. Claude
cross-provider verification remains queued in
`archive/sessions/2026-09-01-m2-claude-verification-backlog.md` and is required
before M4.

## Boundary and next step

All new decision surfaces remain `authority_scope: none` and
`authority_active: false`. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed
workflows remain authoritative. Merge this batch as inactive M2 work, then
continue bounded decision migration/reconciliation without importing any of the
35 unresolved IDs. M4 cannot begin until those collisions and the Claude backlog
are cleared.

Legacy Journal record:
https://app.notion.com/p/3ce67c87082c819c8dece7a09c80bbc9?pvs=204
