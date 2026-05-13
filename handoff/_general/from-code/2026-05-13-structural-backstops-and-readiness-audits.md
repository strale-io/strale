Intent: Close the 2026-05-13 megasession's structural follow-ups (deploy-health monitor + list↔detail contract invariant from DEC-20260513-A), produce four point-verification reports requested by chat, and clear the path for canceling the Lovable subscription.

## What shipped

**strale-frontend PR #8 — deploy-health monitor.** Merged 06:38:33Z, merge commit `d4fc9b14`. Vite `define` injects `STRALE_BUILD:<sha>:<iso-time>` as a single static string in the bundle; GHA on push to main waits 300s for Cloudflare Pages then asserts the deployed bundle contains the merge SHA. End-to-end verified — run `25782837765` completed in 5m3s, both steps green. The deployed bundle at `https://strale.dev/assets/index-C48CmodB.js` now carries `STRALE_BUILD:d4fc9b14...:2026-05-13T06:38:51.688Z` (matches PR #8's merge commit), confirming CF Pages serves the actual current build. Closes the 73-day Lovable silent-deploy class structurally — every merge is now self-verifying.

**strale PR #104 — list↔detail contract invariant.** Merged 06:48:50Z, merge commit `b250a07b`. New `apps/api/src/routes/capabilities-contract.test.ts` iterates `FRONTEND_SHARED_FIELDS` (13 fields including `cost_class` + `last_customer_call_at`) and per-field asserts presence + value equality on both `GET /v1/capabilities` and `GET /v1/capabilities/:slug`. Pattern mirrors PR #103's integration test exactly — gated on `DATABASE_URL_TEST` via `describeMaybe`, skips cleanly in CI. Stop-condition mutation verification deferred per DEC-20260504-A test-harness exemption (no Postgres harness in CI; same precedent as PR #103). 80 pass / 29 skip on the route suite, no regressions. Closes the A0c.1.v3 bug class structurally.

## Verification reports authored this session

Three additional handoff files staged this session (in `handoff/_general/from-code/`), each linked to a chat-side decision:

- `2026-05-13-beacon-hosting-verification.md` — verdict: **Vercel, high confidence.** 4 independent signals agree (`Server: Vercel` headers, `76.76.21.21` DNS, `vercel.json` in repo with explicit `framework: nextjs`, zero `lovable-dev[bot]` commits on strale-beacon). Memory #14 stands. Silent-deploy risk LOW.
- `2026-05-13-drizzle-quirks-verification.md` — **CORRECTED MID-SESSION.** Original verdict Outcome B was wrong; correct is Outcome A. See the "Course-correction" Journal page `35f67c87-082c-8119-9ab3-fa7a12b30080`. The report file now carries a correction header explaining the mistake. PR #89 fully shipped DEC-20260511-C cleanup on 2026-05-11; the strale trunk worktree was on a pre-#89 branch and that's what I read from. Lesson saved to memory.
- `2026-05-13-lovable-cancellation-audit.md` — verdict: **SAFE TO CANCEL.** Zero active runtime dependencies confirmed across DNS (CF anycast `188.114.96.0/24`), headers (`Server: cloudflare`), webhooks (empty for all 3 repos), CI workflows (zero `lovable` matches), and commit activity (last 14 days: 14 commits all by Petter; lovable-dev[bot] all-time: 1 scaffold commit from 2025-01-01). Cleanup queue: 1 GitHub-UI step (revoke `lovable-dev` App install id 113143693) + 2 small chore PRs (strale-frontend dev-only deps + docs; strale CORS allowlist + LLM prompt fragment).

## What's open

- **DEC-20260513-A follow-ups: closed** by PRs #8 and #104. Notion DEC entry "Outcome" field may need update (Petter / chat).
- **Lovable cancellation cleanup chore PRs.** Two small PRs identified in the audit report; sequencing is: cancel subscription → revoke GitHub App → ship the two chore PRs. Backend chore removes the CORS lovable allowlist branch (`apps/api/src/app.ts:183`) and fixes the LLM prompt fragment (`apps/api/src/lib/daily-digest/analyze.ts:43`).
- **To-do `35567c87-082c-81fd-aa99-e4e41257d06b`** ("Rebuild strale.dev frontend off Lovable") — re-scope to "Cancel Lovable subscription + GitHub App cleanup" or close as done (the rebuild itself happened 2026-05-13 via CF Pages migration).
- **Working rules page header softening** (added 2026-05-13 after my flawed drizzle report) should revert. Tech stack page "Known quirks" bullet about `apps/api/drizzle/` still existing is also false post-PR-#89 and should be deleted.

## Non-obvious learnings

1. **`define` constants don't fold into template literals through esbuild.** First attempt at the deploy-health marker used `BUILD_MARKER = \`STRALE_BUILD:\${BUILD_SHA}:\${BUILD_TIME}\`` — esbuild left it as a runtime template `STRALE_BUILD:${UT}:${BT}` in the bundle and the grep regex couldn't match. Fix: inject the full marker as a single `define` value, not build it from components.
2. **Branch-local working trees can produce false "is X on main?" verdicts.** The drizzle verification mistake. Saved as feedback memory.
3. **Auto-merge is disabled on `strale-io/strale`** (`gh pr merge --auto` returns "Auto merge is not allowed for this repository"). Manual merge after CI green works fine. Not blocking.

## Cost

None. All verification was free (HTTP HEADs + DNS lookups + repo greps + GHA API calls). The two GHA runs (deploy-health on strale-frontend, CI on strale PR #104) ran on GitHub's free tier.
