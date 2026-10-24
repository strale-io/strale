---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Report Filing Convention"
moved_at: 2026-10-24
---

# Report Filing Convention

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

Large investigative/audit/session reports (AUDIT-*, FIX_PHASE_*, SESSION_*, RESOLUTION_REPORT, REVIEW_FINDINGS_*, *_INVENTORY, *_RESEARCH, checklists tied to a specific incident, etc.) route to `archive/sessions/` — flat layout for individual reports (see existing entries for naming convention); directory sweeps imported wholesale (Phase 3, 2026-08-17: `audit/`, `audit-output/`, `audit-reports/`, `a2a-sample/`, `tasks/`, `capability-sources/`, `distribution/`) keep their internal structure as `archive/sessions/<dirname>/`. Never to the repo root.

**Root contains exactly:** `README.md`, `CLAUDE.md`, `AGENTS.md` (+ `.agents/`, `.codex/`), `WORKTREES.md`, `Dockerfile` (the API image Railway builds from the root; added to this list at the contract cut, where the list had omitted it), `REVIEW.md` (what every reviewer checks: tiers, the tier-2 surfaces and the incident protocols as always-check lines; DEC-20261024-A), `LICENSE`; the monorepo build files (`package.json`, `package-lock.json`, `tsconfig.json`); and four MCP/package-registry discovery manifests each *required* at repo root by the registry that reads it — `context7.json` (Context7), `glama.json` (Glama MCP directory), `server.json` (the official MCP registry, `io.github.strale-io/strale`), `smithery.yaml` (Smithery stdio install config). None of the four can move: each registry's crawler looks for its file at the repository root by convention, not at a configurable path. (T5, 2026-09-02: the two review/pre-flight checklists that previously sat at root — `DISTRIBUTION_PR_PREFLIGHT.md`, `REVIEW_TEMPLATE.md` — moved to `docs/governance/protocols/`; nothing reads them from the root path.) `AGENTS.md` is a condensed derivative of CLAUDE.md for Codex-CLI sessions — CLAUDE.md is canon; AGENTS.md points at CLAUDE.md sections for anything that can drift rather than restating it. Refresh AGENTS.md against CLAUDE.md whenever drift is noticed (new decisions, new mandatory protocols, Shared-Checkout Rule changes) rather than letting it go stale again.
