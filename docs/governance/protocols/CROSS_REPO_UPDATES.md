---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Cross-Repo Updates"
moved_at: 2026-10-24
---

# Cross-Repo Updates

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

When making changes to the backend repo, check if these files in the frontend repo (strale-frontend) need updating:

- **public/llms.txt** — Update when: adding/removing/renaming capability categories, adding new SDKs or integrations, changing API endpoints or auth flow, changing pricing model. This file is what LLMs read when someone shares strale.dev — it must stay accurate.
- **public/sitemap.xml** — Regenerate when: adding new pages or routes. Run: `npx tsx scripts/generate-sitemap.ts` in strale-frontend.
- **src/lib/compliance-types.ts `AuditRecord` interface** — Update when: any change to `AuditRecord` in `apps/api/src/routes/audit.ts`. The two declarations must match shape (field names + types). The CI check at `apps/api/scripts/check-shape-contracts.mjs` (registry-driven; run with `--list` to see registered contracts) enforces this and runs in the weekly drift cron with both repos checked out. If you add/remove/rename a field on the backend without updating the frontend, the check fails and an issue is auto-opened. Add new shared interfaces to the `CONTRACTS` array in that script when applicable.
