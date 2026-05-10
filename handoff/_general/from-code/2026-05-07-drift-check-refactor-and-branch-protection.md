Intent: Trace and fix the OpenOwnership/BODS aspirational-architecture drift across customer surfaces and CI tooling, then close the structural gap that let the related 2026-05-06 red-main incident happen at all.

# What shipped

The day's arc walked the same defect class — aspirational architecture treated as fact — through four layers, then sealed it with branch protection.

## Layer 1 — Customer-facing copy (PR #62, merge `1943d28`)

`fix: remove inaccurate OpenOwnership integration claim from product copy`

Three surfaces still claimed Strale integrates with OpenOwnership BODS for UBO supplement; Strale has no such integration (the eval doc at `apps/api/docs/ubo-resolve-uk-bods-evaluation.md` from 2026-04-02 explicitly deferred it). Removed:
- `apps/api/src/db/seed-solutions.ts:1754` — `enhanced-due-diligence` longDescription "via OpenOwnership/Companies House" → "via Companies House for UK companies"
- `packages/strale-capabilities/capabilities.json:4646` — published catalog description rewritten to match the manifest's actual UK-only scope
- `manifests/gleif-l2-ubo-lookup.yaml:157` — limitation `workaround` text dropped the OpenOwnership BODS recommendation

Voice check applied per Notion Brand & voice canonical page (§1 5-test publish + §2.5 review checklist). Three customer-facing instances; six other OpenOwnership references retained as factual evaluation context.

## Layer 2 — CI infrastructure Phase A (PR #63, merge `3dfce8f`)

`fix(drift-checks): remove stale entries from static maps + add refactor proposal`

The drift-check scripts that exist to catch this defect class were themselves carrying it:
- `check-platform-facts-drift.mjs:CURRENT_VENDORS` had `ubo_uk_dk_sk_smes: "OpenOwnership"` — removed; "OpenOwnership" added to STALE_VENDORS so future re-introductions in scanned surfaces are caught.
- `check-provider-coverage-drift.mjs:KNOWN_GOV_REGISTRY_PROVIDERS` listed "OpenOwnership" alongside genuine gov registries — removed (set was dead code, never referenced after declaration).

Phase A also added `apps/api/docs/drift-check-refactor-proposal.md` — 8-section design doc for the structural fix.

Verified parity: all three drift checks pass identically pre/post Phase A.

## Layer 3 — CI infrastructure Phase B (PR #65, merge `41c0542`)

`refactor(drift-checks): convert .mjs to .ts and import canonical lists from platform-facts`

Two commits:
- **`bbf686c feat(platform-facts)`** — additive expansion of `STATIC_FACTS.vendors` with 4 new categories (us_company_registry: Cobalt Intelligence, us_ein: Liberty Data, ubo_supplement_global: GLEIF L2, fr_litigation: BODACC). Added `STALE_VENDORS` export at canonical, `getActiveVendorNames()` and `getStaleVendorNames()` helpers, 5 new test invariants — including the structural "every name in `getActiveVendorNames()` corresponds to a shipped capability slug" assertion that closes the "vendor listed without integration" mode.
- **`bfa6f2d refactor(drift-checks)`** — three drift scripts converted from `.mjs` to `.ts`, static maps deleted, imports from canonical. `weekly-drift.yml` updated to invoke `.ts` paths via `tsx` (matching `sweep-manifest-drift.ts` precedent).

The 6 (not 7) Uncertain entries from Phase A's audit resolved cleanly:
- 4 Active (all shipped 2026-05-01, ~24h after the `CURRENT_VENDORS` block was introduced 2026-04-30) → moved into canonical.
- 2 Aspirational drift (Digiteal, eSortcode IBAN name-match) → dropped along with the deleted `CURRENT_VENDORS` map.

Verdict on `CURRENT_VENDORS` history: **by-design aspirational at creation**. The block predated its corresponding capabilities; the script's "mirroring STATIC_FACTS" header comment was inaccurate from day one. Phase B closed the gap by making canonical the authoritative declaration and asserting the invariant in tests.

DEC drafted in PR #65 description, awaiting log: **DEC-20260507-X** (chat assigns letter) on drift-check substrate moving to `platform-facts.ts`.

## Layer 4 — Branch protection (Phase 3 Harden)

`gh api PUT repos/strale-io/strale/branches/main/protection`

Investigation prompt earlier in the day traced the 2026-05-06 red-main incident root cause: **`main` had no branch protection at all**. F-0-014 lint guard fired correctly on both offending pushes (08:11Z and 10:49Z 2026-05-06) but failure was informational, not gating. Two ad-hoc scripts pushed direct via `git push origin main`, bypassing every PR-based safety the team relies on.

Fix applied via single `gh api PUT`:
- Required PR before merging
- Required status check: `check` (the single CI job)
- Strict base — branches must be up to date with main
- `enforce_admins: true`
- `allow_force_pushes: false`, `allow_deletions: false`

Read-back check (Rule F structural enforcement): direct push attempt now returns verbatim
```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "check" is expected.
 ! [remote rejected] HEAD -> main (protected branch hook declined)
```

Both rules fire correctly. The 2026-05-06 mechanism cannot recur.

DEC drafted, awaiting log: **DEC-20260507-C** on branch protection.

## Side incidents resolved

- **Console-allowlist unblock (PR #64, merge `60053ba`):** main was red since 2026-05-06 because two ad-hoc scripts (`audit-live-registries.ts` 13 console.* calls; `dk-cvr-retry-2026-05-06.ts` 7 calls) landed without allowlist entries. Single-line allowlist additions; unblocked the queued PRs.
- **Railway deploy failure on PR #65 first deploy:** `/health/deep` healthcheck timed out at the 10s window during cold start (~3s container start + variance crossed budget). No code defect — runtime ran for 6 minutes serving traffic before SIGTERM. Redeployed from the same build artifact; second attempt passed cleanly. PR #65 is live in production at `41c05426b21d`.

## What's open

These are flagged for chat to action; CC did not mutate any of them.

1. **DEC-20260507-X (drift-check substrate)** — DEC text in PR #65 description, ready to log.
2. **DEC-20260507-C (branch protection)** — DEC text in the branch-protection session report, ready to log.
3. **Notion P3 To-do `35967c87082c81c7aa0df1ee04eed4a1` (healthcheck widening)** — investigated; halted at Path B (config is dashboard-only in Railway CLI 4.30.5). Petter applies via Railway dashboard → strale → Settings → Deploy → Healthcheck Timeout: 10 → 20.
4. **Notion P3 To-do `35967c87082c817684e8e60c0c5a6515` (F-0-014 bypass)** — closed by DEC-20260507-C; mark Done.
5. **Course-correction Journal entry** for the F-0-014 incident — Phase 3 prompt drafted the ≥3-step causal chain (no branch protection → direct pushes allowed + post-commit CI informational only → 2026-05-06 ad-hoc scripts pushed direct, red main 31h → all open PRs DOSed → Phase 3 closed the gap).
6. **Three out-of-scope flags from PR #65:**
   - Notion "How this workspace works" Rule 13 references drift scripts at `.mjs` paths (now `.ts`)
   - `apps/api/src/lib/platform-facts.ts:46` comment references wrong repo+wrong-extension path
   - Memory references drift scripts at `.mjs` paths
7. **Other open PRs** (#61, #60, #45, #40) — all stuck on stale main. Each needs its own `gh pr update-branch + merge` workflow when ready. Not on critical path.

## Non-obvious learnings

1. **`CURRENT_VENDORS` was aspirational at creation, not drift.** Git history shows the block landed before the capabilities it described. The script's header comment ("mirroring STATIC_FACTS") was wrong from day one — chat had assumed it was once accurate and drifted later. This shifts the framing: the original author chose forward-looking declaration over runtime mirror without writing down that intent. The new test invariant (every active vendor must have a shipped slug) replaces the unwritten convention with a structural check.

2. **The Railway 10s healthcheck window is tight by design.** Cold start to HTTP bind is ~3s; remaining budget is ~7s for DB pool warmup + plan-cache miss on the CTE probe. PR #65's failure was statistical, not structural — same code path, same Dockerfile, just one cold-start variance excursion. Petter's planned dashboard widening to 20s removes the variance risk; the deeper option (startup-aware `/health/deep` that skips the CTE probe in the first 10s) remains available if a second incident occurs after widening.

3. **`gh pr merge --merge --delete-branch` hits worktree-locked-by-strale-spike intermittently.** When it does, the merge succeeds server-side but local cleanup fails, which aborts the remote-branch deletion. Manual `gh api -X DELETE refs/heads/<branch>` cleans up. Same workaround applied 2-3 times today; not always; root cause is `gh`'s post-merge `git fetch+pull` against the worktree-locked main.

4. **The 6-vs-7 entry count.** The Phase B prompt anticipated possibly 7 Uncertain entries; only 6 existed. CC didn't invent a 7th; reported the actual count.

5. **Branch protection takes a single `gh api PUT` (~30 seconds).** The cost-of-fix is trivial. The cost of NOT having it for ~5 weeks since repo creation was a 31-hour outage of the merge pipeline plus 6+ cascading sessions of cleanup work. The asymmetry is striking — chat's call to gate this behind a CTO decision was correct, but the gate is now closed.

## Cost

Nothing tracked separately (no paid API calls beyond standard CI runs). Petter's time tomorrow: ~5 minutes to log DEC-20260507-X and DEC-20260507-C, ~30 seconds in Railway dashboard, ~1 minute marking Notion to-dos Done.
