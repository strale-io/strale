---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Worktree node_modules Hazard"
moved_at: 2026-10-24
---

# Worktree node_modules Hazard

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

**Second failure mode:** creating a Windows directory junction from a temporary worktree to the main checkout's `node_modules`, then later removing that worktree with `rm -rf`, follows the junction and **deletes the real `node_modules`** in the main tree. Symptom: every command fails with `ERR_MODULE_NOT_FOUND` for packages that are definitely installed. No source is lost — it is generated — but recovery requires `npm install` at the repo root followed by `npm --workspace=packages/mcp-server run build`, or `src/routes/mcp.ts` shows phantom type errors. **The rule:** run `npm install` inside each worktree instead of linking, and remove worktrees with `git worktree remove`, never `rm -rf`.
