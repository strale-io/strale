---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Deploy Mechanism Verification Protocol (DEC-20260504-C)"
moved_at: 2026-10-24
---

# Deploy Mechanism Verification Protocol (DEC-20260504-C)

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

**MANDATORY — applies to ANY PR that adds a code path which depends on a deploy-pipeline behavior (migrations running, env vars read, build steps, startup hooks, scheduled jobs, cron triggers).**

**Rule:** When a PR adds a code path that depends on a deploy-pipeline behavior, the pre-merge audit MUST verify the deploy mechanism actually does what's expected. "Code is correct" is not the same as "deploy of code will produce expected effect on prod." Verification means reading the actual deploy mechanism (Dockerfile, build config, startup wiring, package.json scripts, CI workflows) and confirming the new code path will execute as intended. Do NOT assume historical patterns hold without verification. A clean post-deploy log is not verification — query prod for the expected effect of the change.

**Background:** 2026-05-04 PR #42 outage (28-minute customer-facing 500s). `apps/api/scripts/apply-migrations.ts` had been a dead file — never compiled (excluded by `tsconfig.json` rootDir), never invoked by Dockerfile CMD. PR #42's pre-merge audit was thorough on PR contents but didn't verify the deploy mechanism actually ran the script. Compounded by PR #49's UPDATE blocks also silently never running for 7 hours under the same dead-file mechanism. The structural fix shipped in PR #51 + PR #52 (`runStartupMigrations()` wired into `index.ts:69`, single source of truth between admin endpoint and startup wiring).

**Required steps (non-negotiable):**

1. **Identify the deploy-pipeline dependency.** If the new code path depends on something other than its own module being imported and called from request-handler code, name the dependency: which deploy step has to fire? Which env var has to be read? Which startup hook has to invoke it?
2. **Read the actual deploy mechanism.** Open the Dockerfile, the `CMD` line, `package.json` scripts, `index.ts` startup wiring, the relevant CI workflow, the cron config — whatever produces the dependency. Confirm the new code path is reached.
3. **Confirm reach by file path, not by historical pattern.** "Migrations have always run" or "env vars are always loaded" is not verification. The verification is: this specific file is on the import graph from `index.ts` (or whichever entry point fires at deploy time), or this specific script is invoked by a specific line in the Dockerfile / package.json.
4. **Post-deploy: query prod for the expected effect.** A clean log line proves the line was emitted. It does not prove the schema changed, the row was written, the env var was read, the cron fired. Query the actual artifact: `\d table` for a column add, `SELECT COUNT(*)` for a backfill, `GET /health/version` for a build SHA, etc.

**At session end, report:**
- The deploy-pipeline dependency identified, and the file/line that proves the dependency is satisfied.
- The post-deploy prod query and its result.

**Do NOT mark a deploy-mechanism-dependent change as done if the verification step was skipped.** Report what's missing.

**This rule does NOT override:**
- The Capability Onboarding Protocol (DEC-20260320-B).
- The Distribution PR Integrity Protocol (DEC-20260422-A).
- The Audit-Follow-up Test Coverage Protocol (DEC-20260504-A).
- The Bulk-Operation Deploy Protocol (DEC-20260504-B).
