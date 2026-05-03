---
name: go
description: End-to-end verify, simplify, and ship the current change. Use when the user says "go" or "/go" at the end of an instruction, or explicitly asks to verify and PR. Detects what was touched (capability / API route / SDK / frontend / docs), runs the right verification, invokes /simplify, and opens a PR. Refuses to PR if anything is red.
---

# /go — verify and ship

Take the change that's currently on this branch and drive it to a PR. Never skip steps to "make it green faster" — if something fails, fix the root cause or stop and report.

## 1. Scope detection

Run `git diff --name-only main...HEAD` and (if dirty) `git status --porcelain`. Classify each changed file:

- **capability** — `apps/api/src/capabilities/*.ts` or `manifests/*.yaml`
- **api-route** — `apps/api/src/routes/*.ts` or `apps/api/src/app.ts` or `apps/api/src/lib/*.ts`
- **db** — `apps/api/src/db/**` or `apps/api/drizzle/**`
- **sdk** — `packages/sdk-typescript/**`, `packages/mcp-server/**`, `packages/langchain-strale/**`, `packages/crewai-strale/**`, `packages/semantic-kernel-strale/**`
- **frontend** — anything in `strale-frontend` (separate repo — skip unless user says so)
- **docs-only** — `*.md`, `CLAUDE.md`, `.claude/**` (no code verification, just PR)

A change can span categories. Run verification for every category touched.

## 2. Verification gates (all must pass)

### Every run
```bash
cd apps/api && npx tsc --noEmit --project tsconfig.json
```

### capability touched
For each touched capability slug:
```bash
cd apps/api
npx tsx scripts/validate-capability.ts --slug <slug>
npx tsx scripts/smoke-test.ts --slug <slug>
```
Also verify `checkReadiness(slug)` returns `ready: true` (see `src/lib/capability-readiness.ts`). If the capability is new, confirm a manifest exists at `manifests/<slug>.yaml` — if not, STOP and report. This enforces the Capability Onboarding Protocol (DEC-20260320-B).

Never edit `src/lib/sqs.ts` to "fix" a score — that's the Scoring Integrity rule. Fix the root cause.

### api-route touched
```bash
cd apps/api && npx vitest run <touched-test-file>
```
If there's no test for the touched route, say so explicitly in the final report. Do not invent tests as part of /go — that's a separate task.

### db touched
Confirm a migration file exists in `apps/api/drizzle/` corresponding to the schema change. If schema changed but no migration, STOP.

### sdk touched
```bash
npm run build --workspace=<package>
```
If types are published surface, also run the consumer-side typecheck (e.g., `npx tsc --noEmit` in the package dir).

### Cross-repo check
If capability categories, endpoints, auth flow, or pricing model changed, flag that `strale-frontend/public/llms.txt` may need updating (per CLAUDE.md). Do not edit it from here — flag it in the PR body.

## 3. /simplify pass

Invoke the `simplify` skill on the changed code. Accept its edits if they're strictly improvements. If it proposes structural changes that would bloat scope, defer them — mention in the PR body instead.

## 4. Independent review (technical + founder lens)

After verification + simplify, before opening the PR, run two independent reviews on the diff in parallel. Petter is non-technical and depends on these lenses being applied at PR-creation time, where their findings can land in the PR description for him to read before approving merge — not as a separate output that gets lost.

Both reviews use the `feature-dev:code-reviewer` subagent. Send both in a single message so they run concurrently.

### Technical lens

Prompt the reviewer to assess: bugs, logic errors, security vulnerabilities (SSRF, SQL injection, secrets exposure, missing auth, missing input validation), architecture concerns, adherence to Strale conventions (Capability Onboarding Protocol, Scoring Integrity, third-party scraping doctrine, drift-prevention surfaces), and any side-effect imports of files this PR deletes. Pass it the PR's branch name, target main, and a one-paragraph summary of intent.

### Founder / UX / product lens

Prompt the reviewer to assess from the perspective of *a non-technical founder who will use this code via API calls, a CLI, or the dashboard*. Specifically:
- **Error messages**: are they actionable? Do they tell the user what to fix? ("Missing required field: email" is good; "Invalid request" is bad.) Do they leak internals (stack traces, DB names, file paths)?
- **API shape**: are field names consistent with the rest of the platform (e.g. `*_cents` for money, ISO 8601 for dates, `inputs` not `input`)? Will an agent get confused?
- **Naming**: do slugs, route names, and field names match what an external developer would search for? Or are they Strale-internal abbreviations?
- **Defaults**: are sensible defaults provided? Or is the caller forced to specify everything?
- **Failure modes from the caller's perspective**: when this fails, does the caller know whether to retry, fix their input, contact support, or give up?
- **Documentation gap**: if this changes a public surface (API endpoint, SDK method, capability slug), is `strale-frontend/public/llms.txt` going to stay accurate?

This lens is NOT redundant with the technical lens. The technical lens asks "is the code correct"; the founder lens asks "is the code *kind* to its user."

### Acting on findings

Aggregate findings from both lenses. Classify each:

- **HIGH**: ship-blocker. Surface it, do NOT proceed to PR. Examples: silent data corruption, leaked secrets, broken public API contract, unclear error message that would block real users, broken backwards compatibility on a versioned endpoint.
- **MEDIUM**: include in the PR body under a `## Reviewer findings` section so Petter can decide before merge. Examples: error messages could be better, naming is inconsistent with another endpoint, missing example in docstring.
- **LOW / nit**: drop unless the reviewer explicitly flags it as part of a pattern.

If both reviews come back fully clean, that itself is signal — note it explicitly in the PR body (`## Reviewer findings — clean`).

## 5. Commit and PR

Only proceed if every gate in step 2 passed AND no HIGH findings remain from step 4.

1. Stage the relevant files by name (never `git add -A`).
2. Write a commit message that describes *why*, not *what*, ending with the `Co-Authored-By` trailer from the root guidance.
3. Push. If the branch isn't tracked, use `git push -u origin <branch>`.
4. Open the PR with `gh pr create` using a HEREDOC body in the standard Strale format:
   - **Summary** — 1–3 bullets
   - **Verification** — which gates ran and their result
   - **Reviewer findings** — MEDIUM findings from step 4 (or "clean" if none)
   - **Cross-repo** — only if frontend `llms.txt` or `sitemap.xml` needs an update
   - **Test plan** — what reviewer should click/verify

## 6. Report

End the session with:
- Gates that passed (one line each)
- Reviewer findings: HIGH count (should be 0 if you got here), MEDIUM count
- Anything deferred (copy from step 3)
- PR URL
- Whether a handoff file + Journal entry still need writing (per CLAUDE.md full-mode checklist)

## Hard refusals

Stop and report — do **not** PR — if any of the following:
- `checkReadiness` returns `ready: false` for a touched capability
- Typecheck fails
- A touched capability has no manifest
- Schema changed without a migration
- SQS scoring logic was edited (Scoring Integrity rule)
- Tests fail and the failure isn't a pre-existing flake on `main`
- Step 4 produced any HIGH-severity finding from either reviewer lens

Report what's blocking in plain language. The user decides whether to override.
