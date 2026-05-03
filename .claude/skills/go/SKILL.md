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

## 4. Independent review (six-lens pass)

After verification + simplify, before opening the PR, run a multi-lens review on the diff in parallel. Petter is non-technical and depends on these lenses being applied at PR-creation time, where findings land in the PR description before approving merge — not as a separate output that gets lost.

Use the `feature-dev:code-reviewer` subagent for both passes below. **Send both in a single message** so they run concurrently. Each pass takes 1–3 minutes; serial would double the latency.

### Pass A — technical (CTO + architect + senior dev + security)

Prompt the reviewer to apply four overlapping technical lenses on the diff:

- **Senior developer (correctness)**: bugs, logic errors, off-by-one, null handling, race conditions, leaks. Are tests present and meaningful? Does the code adhere to existing idiom in nearby files?
- **Security reviewer**: SSRF (any user-controlled URL → must use `safeFetch`), SQL injection (any string-built query → must use parameterised drizzle), secrets exposure (any `console.log` or `log.info` of `process.env.*`?), missing auth (new route without `authMiddleware`?), missing input validation, side-effect imports of files this PR deletes (TypeScript with NodeNext does NOT flag missing `.js` targets — grep manually).
- **System architect**: coupling and layering. Does this introduce a dependency in the wrong direction (db → routes? capabilities → app?)? Does it duplicate logic that already exists in `lib/`? Does it introduce a new abstraction where copy-paste would have been simpler, or copy-paste where an abstraction is needed (third instance of the same pattern)? Are cross-cutting concerns (logging, errors, auth) handled consistently with neighbours?
- **CTO (strategic / debt)**: does this conflict with an active Decision in `CLAUDE.md` or the Decisions DB (DEC-20260428-A scraping doctrine, DEC-20260428-B engineering bar, DEC-20260420-H direct connections, etc.)? Does it create technical debt the team hasn't budgeted for? Is the change scoped to one concern, or does it bundle three unrelated things? Is there a "this is the third one-off integration with vendor X — should we abstract?" pattern?

Pass it: the branch name, target `main`, and a one-paragraph summary of intent.

### Pass B — product (PM + UX + founder)

Prompt the reviewer to apply three overlapping product lenses on the diff:

- **Product manager**: does this serve a real user need? If you can't tell from the diff what user problem this solves, that's a finding — surface it. Is the change consistent with the platform's positioning (Strale = data layer for AI agents, not a competitor to compliance bureaus)? Does it expand scope into a vertical the platform doesn't claim?
- **UX**: error messages — are they actionable? Do they tell the caller WHAT to fix and what to do next? Do they leak internals (stack traces, DB names, file paths)? Are HTTP status codes used correctly (400 vs 422 vs 500)? When the call fails, can the caller tell whether to retry, fix input, contact support, or give up?
- **Non-technical-founder**: API shape consistency (`*_cents` for money, ISO 8601 for dates, `inputs` not `input` per the request envelope, slugs match catalog conventions). Naming — would an external developer searching docs find this? Defaults — does the caller have to specify boilerplate Strale could pick? If Petter sees this in a log line tomorrow, will he understand it without asking?

Pass it the same context as Pass A.

### Honest caveat on the lens prompts

Pass A's "CTO/architect" lenses are stronger than Pass B's "PM" lens, because the diff carries enough signal for "is this coupled wrong?" but rarely enough for "is this the right thing to build?" — that needs roadmap context the agent doesn't have. Treat PM findings as flags to consider, not authoritative judgments. The UX and founder findings within Pass B are sharper because they read straight from the code.

### Acting on findings

Aggregate findings from both passes. Classify each:

- **HIGH**: ship-blocker. Surface it, do NOT proceed to PR. Examples: silent data corruption, leaked secret, broken public API contract, error message that would actively confuse a real user, conflict with an active Decision, security vulnerability, side-effect import of a file deleted in this PR.
- **MEDIUM**: include in the PR body under `## Reviewer findings` so Petter can decide before merge. Examples: error messages could be better, naming inconsistent with another endpoint, missing example in docstring, layering choice that's defensible but worth flagging.
- **LOW / nit**: drop unless part of a pattern (five inconsistent field names → fix the pattern in one pass).

If both passes come back fully clean, note it explicitly in the PR body (`## Reviewer findings — clean (technical + product)`). Clean is a real outcome, not a reason to invent findings.

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
