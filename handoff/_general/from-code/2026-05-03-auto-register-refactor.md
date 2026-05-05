Intent: execute the queued To-do "Refactor auto-register: glob-discovery → manifest-driven registration" (P2/Effort M, created 2026-05-02). Companion prompt at `handoff/_general/from-code/2026-05-02-auto-register-refactor-prompt.md`.

# Outcome

PR #37 open, 6 commits on branch `refactor/manifest-driven-auto-register`. Awaiting Petter's review + CI green.

| metric | pre | post |
|---|---|---|
| `executors_registered` | 296 | 296 |
| `auto-register errors` | 3 | 0 |
| Vitest pass rate | 383 / 6 failed files | 415 / 0 failed files |
| Lines of code | (baseline) | net −1500+ (12 dead executors + 480 import-list duplication) |

# Commits

1. `refactor(capabilities): manifest-driven registration replaces glob discovery` — core refactor + audit script + 2 new manifests + Dockerfile `COPY manifests/`.
2. `test(env): set FRONTEND_URL placeholder in test-env-setup` — unblocks 11 silent test failures.
3. `refactor(capabilities): remove 12 dead executor files` — UK property vertical + Hong Kong + India + Amazon. DEACTIVATED entries preserved.
4. `refactor(capabilities): static-import provider chains` — was unresolvable under vite (all 5 chains failed in vitest); also drops dangling `providers/australian-company-data.ts`.
5. `test(capabilities): cap auto-register cost + raise hookTimeout for parallel runs` — caches AutoRegisterCounts, bumps hookTimeout 10s → 30s.
6. `fix(scripts): clean up dead-slug references after capability deletion` — fixes 2 runtime breakages (`audit-capabilities.ts`, `audit-tests.ts`) plus 3 stale-data sweeps; skip DB sync when DATABASE_URL unset.

# Items the original prompt did not anticipate

1. **Dockerfile didn't `COPY manifests/`.** Manifests are load-bearing under the new model; the old glob never read them at runtime.
2. **`autoRegisterCapabilities()` returned `void`.** The prompt's baseline command piped through `JSON.stringify` would have printed `undefined`. Changed to return `AutoRegisterCounts`.
3. **2 orphan executors had no manifest.** `email-pattern-discover` and `officer-search` registered via the glob, no manifest. Wrote minimal manifests for both.
4. **Side-effect imports of deleted .js files do NOT fail TS check.** `audit-capabilities.ts` + `audit-tests.ts` had `import "../capabilities/<slug>.js"` lines (no symbol binding) for the executors I'd just deleted. TypeScript with NodeNext + explicit `.js` extensions skips the existence check. Both scripts crashed at runtime with `ERR_MODULE_NOT_FOUND`. Found because Petter asked the right second-pass question.

# Open follow-ups

- PR #37 review + merge. Touches critical-path startup; warrants a careful read.
- `seed.ts` and `seed-limitations.ts` retain inert references to the 12 deleted slugs. Deliberately left — DB rows already exist as `is_active=false`, removing seed object literals is purely cosmetic and risks breaking seed structure.
- The `audit-capability-pairing.ts` script is currently a one-shot diagnostic. Could be wired into CI as a drift-prevention gate, but not in scope of this PR.

# Lesson saved to memory

`feedback_side_effect_import_grep.md` — when deleting executor files, grep for side-effect imports (`import "../capabilities/<slug>.js"` with no symbol binding), not just slug strings. TypeScript will not catch missing `.js` targets under NodeNext.

# Process change

Petter changed the protocol mid-session: I should mark Notion to-dos Done + move to Archive on completion without pausing to confirm. Saved as `feedback_notion_todo_autoarchive.md`. The original CLAUDE.md text already permits this; I had been over-cautious.
