---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Worktree node_modules Hazard"
---

# Worktree node_modules Hazard

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and protocol router can reference a
> full-body path (T6 M3 batch 7). It carries no authority of its own and must
> never be edited on its own: any change belongs in `CLAUDE.md` first, then
> re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Worktree node_modules Hazard

**Second failure mode:** creating a Windows directory junction from a temporary worktree to the main checkout's `node_modules`, then later removing that worktree with `rm -rf`, follows the junction and **deletes the real `node_modules`** in the main tree. Symptom: every command fails with `ERR_MODULE_NOT_FOUND` for packages that are definitely installed. No source is lost — it is generated — but recovery requires `npm install` at the repo root followed by `npm --workspace=packages/mcp-server run build`, or `src/routes/mcp.ts` shows phantom type errors. **The rule:** run `npm install` inside each worktree instead of linking, and remove worktrees with `git worktree remove`, never `rm -rf`.
<!-- END VERBATIM FROM CLAUDE.md -->
