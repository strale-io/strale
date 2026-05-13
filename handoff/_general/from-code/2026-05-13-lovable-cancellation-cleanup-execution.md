Intent: Execute the cleanup work named in this morning's Lovable cancellation audit (`2026-05-13-lovable-cancellation-audit.md`) — strip residual Lovable references from both repos so the subscription cancellation has nothing dangling.

## What shipped

**strale-frontend PR #9** (`chore: remove residual Lovable references`) — merge commit `6509d924`. Deleted `.lovable/plan.md`; removed `lovable-tagger` devDep + regenerated `package-lock.json`; removed `lovable-tagger` import + `componentTagger()` plugin from `vite.config.ts`; rewrote `CLAUDE.md` to drop the two-collaborator framing (Lovable now a one-line historical scaffold note, Claude Code owns the whole frontend); softened `.claude/RUNBOOK.md` authority-boundaries table; updated `index.html:16` comment (CF Pages `public/_headers` authoritative now); added a 2026-05-13 update header + S-04 status revision to `AUDIT-security-frontend.md`; fixed stray "Lovable owns the CSS values" comment in `src/lib/trust-display.ts:267`. Local typecheck + tests (23/23) + build all clean.

**strale PR #105** (`chore: remove backend Lovable references`) — merge commit `470e5f31`. Removed the permissive CORS allowlist branch (`*.lovable.app`, `*.lovable.dev`, `*.lovableproject.com`) at `apps/api/src/app.ts:183`; updated the LLM prompt fragment at `apps/api/src/lib/daily-digest/analyze.ts:43` ("on Lovable" → "on Cloudflare Pages"). 636/636 tests passed; no test exercised the removed allowlist branch.

**strale-frontend PR #10** (`hotfix: delete bun.lockb + bun.lock so CF Pages uses npm`) — merge commit `1dc02adb`. Forced by the deploy-health monitor (see below).

## The interesting hour: deploy-health monitor catches PR #9 silently

PR #9 merged at 07:38:18Z. The deploy-health monitor's GHA fired, waited 300s, then failed: the deployed bundle on `strale.dev` still carried PR #8's marker (`STRALE_BUILD:d4fc9b14...`) instead of `6509d924`. Without the monitor, this would have been a silent multi-day drift — exact same class as the 73-day Lovable outage.

Root cause: the strale-frontend repo had **two** bun lockfiles committed during the Lovable era (`bun.lockb` binary from Feb + the newer text-format `bun.lock` from March). CF Pages auto-detects build tooling and prefers bun when a bun lockfile is present. PR #9's deploy ran `bun install --frozen-lockfile` against the stale `bun.lockb` (which still referenced `lovable-tagger`), failed instantly with "lockfile had changes, but lockfile is frozen", and exited 1. CF Pages never produced a build; the GitHub check went `Cloudflare Pages: failure` 12s after merge.

The cancellation audit didn't anticipate the bun lockfiles because the prompt for the audit only looked at the named Lovable touchpoints. They were lurking pre-existing residue, not added by PR #9 — but PR #9 was the trigger that exposed the inconsistency.

Fix path chosen (deletion over regeneration): nothing in the workflow uses bun; npm is the local tool; dual-lockfile sync would be a recurring drift source forever. PR #10 deleted both. CF Pages auto-detect fell back to npm with `package-lock.json`, `npm ci` + `vite build` succeeded, deploy went out, deploy-health monitor went green in 5m2s. Prod now serves `STRALE_BUILD:1dc02adbb56253f91090d973721e375e09775e4f` — both PR #9's residual cleanup and PR #10's hotfix live together.

## Validated structural backstop

The deploy-health monitor (built today, PR #8) caught a real production-impacting drift within 5 minutes of merge, surfaced the actual error via the CF Pages dashboard check status, enabled a targeted hotfix in one cycle, and verified the fix worked end-to-end. This is the silent-deploy class the monitor was designed for, and it did its job on its first real test. Without it, strale.dev would still be on PR #8's bundle.

## What's open

- **CF Pages cleanup confirmation:** Lovable subscription cancellation + GitHub App revocation (id 113143693 for `lovable-dev` on `strale-io` org) are Petter's UI steps. Per the cancellation audit they're the final cleanup actions; this session shipped the code-side work.
- **Stale Notion to-do `35567c87-082c-81fd-aa99-e4e41257d06b`** ("Rebuild strale.dev frontend off Lovable") — the rebuild happened 2026-05-13 via the CF Pages migration; the residual cleanup shipped this segment. Close as done or re-scope to "Cancel Lovable subscription + revoke GitHub App."
- **Memory #21 + Tech stack page Frontend section** — final post-cancellation rewrite is chat's job once Petter completes the UI steps.
- **OG image filename** in `src/components/SEO.tsx:14` still contains `.lovable.app` in the filename (file is on operator-owned Cloudflare R2, so no runtime impact — flagged as out-of-scope chore in PR #9's body).
- **strale `manifests/meta-extract.yaml` / `manifests/og-image-check.yaml`** test-fixture URLs same pattern as the SEO file. Same disposition: hosted on operator R2, filename cosmetic, future cleanup.

## Non-obvious learnings

1. **CF Pages auto-detects build tooling by lockfile presence**, and when multiple lockfiles are present, **bun outranks npm** even if the project hasn't used bun in months. Deleting other-tool lockfiles is the cleanest way to pin tooling; a `packageManager` field in `package.json` would be a second mechanism but introduces its own pinning fragility. Worth a feedback memory.
2. **The deploy-health monitor's diagnostic-branch regex `[0-9T:.\-Z]+` triggers `grep: Invalid range end` on the Ubuntu runner.** The escaped `\-` inside a character class is parsed as a malformed range by some grep builds. Fix: `[0-9TZ:.-]+` (put `-` at end of class, no escape). Pass path is unaffected; only the "Found: STRALE_BUILD:..." diagnostic line crashes before printing, so the monitor still correctly reports the failure (via the prior `::error::` line). Trivial 1-line workflow fix queued.
3. **`gh run watch --exit-status` doesn't propagate inner-step failures reliably.** Background watcher for the PR #9 deploy-health run exited 0 even though the workflow's verify step exited 2. Worth knowing for any future automation that relies on background watchers — always re-check `gh run view` for ground truth rather than trusting the watcher's return code.
4. **Sub-string greps for "bun" hit `BUNDLE_PATH` / `BUNDLE_URL` etc.** When auditing for runtime references, use word-boundary or command-shape regexes (`\bbun ` / `bun install` / `bun run` / `@types/bun`), not case-insensitive substring matches.

## Cost

Free. Two background GHA runs (PR #105 CI ~58s; PR #10 deploy-health 5m2s), GitHub free tier. No production downtime (prod served PR #8's bundle continuously through the PR #9 failure window — graceful degradation by accident, but the monitor turned the lurking drift into a 5-minute visible incident instead of multi-day silent staleness).
