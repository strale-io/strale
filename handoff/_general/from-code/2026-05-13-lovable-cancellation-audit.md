---
date: 2026-05-13
type: verification-report
session-intent: Pre-cancellation safety audit — confirm Strale has no runtime dependency on Lovable before canceling the subscription
worktree: strale-research (read-only)
---

# Lovable Cancellation Audit

## Verdict

**SAFE TO CANCEL. Zero active runtime dependencies. Inert touchpoints exist and have a clean cleanup path.**

Confidence: HIGH. DNS, headers, webhooks, CI workflows, and recent commit activity all show Lovable is operationally absent. The only Lovable-controlled surface still in the picture is the GitHub App installation (`lovable-dev`, id 113143693) and an npm dev-only package (`lovable-tagger`), neither of which is in any production code path.

---

## Block-by-block findings

### Block A — DNS (clean)

```
strale.dev      → 188.114.97.1, 188.114.96.1               (Cloudflare anycast 188.114.96.0/24)
www.strale.dev  → 188.114.97.1, 188.114.96.1
                + 2a06:98c1:3120::1, 2a06:98c1:3121::1     (Cloudflare IPv6)
scan.strale.io  → 76.76.21.21                              (Vercel custom-domain anycast)
api.strale.io   → m1d21ii9.up.railway.app → 66.33.22.240   (Railway)
```

No record points at Lovable's anycast (`185.158.x.x`) or any `*.lovable.app` / `*.lovable.dev` CNAME target.

### Block B — Response headers (clean)

| Surface | Server | Fingerprint |
|---|---|---|
| strale.dev/ | `Server: cloudflare` | `CF-RAY: 9fafe4694d00481e-ARN` (Stockholm CF edge) |
| www.strale.dev/ | `Server: cloudflare` | `CF-RAY: 9fafe46adcbd0a27-ARN` |
| scan.strale.io/ | `Server: Vercel` | `X-Vercel-Id`, `X-Nextjs-Prerender: 1` |
| api.strale.io/health | `Server: railway-edge` | `X-Railway-Edge: railway/europe-west4-drams3a` |

No `Server: lovable*` headers anywhere. No redirect to a `*.lovable.*` URL.

**Cross-check:** The deployed strale.dev bundle at `/assets/index-C48CmodB.js` contains the build marker `STRALE_BUILD:d4fc9b14e284177f4527452960dfbe00203cef24:2026-05-13T06:38:51.688Z`. The SHA matches PR #8's merge commit on the strale-frontend repo (the deploy-health monitor PR from earlier today). This is a CF Pages build from operator's account, not a Lovable cache.

### Block C — strale-frontend Lovable touchpoints (all inert, all in repo)

Findings ranked by criticality:

| Location | Nature | Runtime impact of cancellation |
|---|---|---|
| `package.json:86` + `vite.config.ts:5` — `lovable-tagger ^1.1.13` devDep + dev-only import | npm package, dev-mode only (`mode === "development"` gate) | None. The package is on npm; cancelling the subscription doesn't pull it from the registry. Production builds don't load it. |
| `.lovable/plan.md` — 4189-byte planning doc, last touched 2026-04-17 | Static file, no consumer | None. Safe to delete. |
| `CLAUDE.md` — entire doc framed around Lovable as co-collaborator (lines 5, 9, 33, 41, 49, 52, 58, 60, 73, 77, 79) | Stale instructions for future Claude sessions | None for prod; affects future agent behavior. Should be rewritten. |
| `index.html:16` — "Lovable hosting doesn't support custom headers" comment | Stale doc note | None. Now on CF Pages which does support custom headers (HSTS landed earlier today per the 2026-05-13 handoff). |
| `.claude/RUNBOOK.md:17` — table row "Edit `src/components/ui/` — NEVER — Lovable owns these" | Stale instructions | None. |
| `AUDIT-security-frontend.md:17` — references "Lovable" as the hosting platform | Stale audit note | None. |
| `package-lock.json` — many `lovable-tagger/` subtree entries | Will regenerate when devDep removed | None. |

### Block D — GitHub webhooks (clean across all three repos)

`gh api repos/strale-io/{strale,strale-frontend,strale-beacon}/hooks` returned empty arrays for all three repos. Zero webhooks anywhere — none pointing at Lovable, none pointing at Cloudflare Pages either (CF Pages auto-deploys via its GitHub App installation, not a webhook).

### Block E — GitHub App installations on `strale-io` org

```
{"account":"strale-io","app_slug":"lovable-dev",                 "id":113143693, "created_at":"2026-02-28"}
{"account":"strale-io","app_slug":"claude",                       "id":113157811}
{"account":"strale-io","app_slug":"railway-app",                  "id":113486885}
{"account":"strale-io","app_slug":"vercel",                       "id":118400292}
{"account":"strale-io","app_slug":"claude-design-import",         "id":124764790}
{"account":"strale-io","app_slug":"chatgpt-codex-connector",      "id":125024088}
{"account":"strale-io","app_slug":"cloudflare-workers-and-pages", "id":131828731, "created_at":"2026-05-12"}
```

**`lovable-dev` is the Lovable GitHub App** (installed at signup 2026-02-28). Post-cancellation, revoke at https://github.com/organizations/strale-io/settings/installations.

All other installations are expected and stay.

### Block F — CI workflows (clean across all three repos)

For each of `strale`, `strale-frontend`, `strale-beacon`, fetched every file under `.github/workflows/` and grepped for `lovable` (case-insensitive). **Zero hits in all three repos.** No CI step references Lovable.

### Block G — Code grep across all three repos

**strale (backend):** non-empty matches, all stale text:

| Location | Nature | Cleanup |
|---|---|---|
| `apps/api/src/app.ts:183` — CORS allowlist permits `*.lovable.app`, `*.lovable.dev`, `*.lovableproject.com` origins | Active code path. Permissive: if no request from those origins ever hits the API, the allowlist is dead. Lovable cancellation doesn't break this — it just makes the allowlist forever-dead. | Safe to delete the line as a chore. |
| `apps/api/src/lib/daily-digest/analyze.ts:43` — prompt fragment: `Website: strale.dev (on Lovable). Beacon: scan.strale.io (on Vercel). API: api.strale.io (on Railway).` | Hardcoded LLM context. Stale string — feeds wrong context to Claude in the daily-digest synthesis. | Update to `(on Cloudflare Pages)`. |
| `docs/audits/activation-traffic-2026-04-08.md:107,111` | Historical audit row containing two `*.lovable.app` URLs from April traffic | Archival doc, leave alone. |
| `audit-reports/observability-baseline.md:94,99` | Historical option-A vs option-B comparison mentioning Lovable | Archival, leave alone. |
| `handoff/_general/from-code/2026-04-{28,30}*.md` | Historical handoff notes mentioning the Lovable era | Archival, leave alone. |
| `handoff/_general/from-code/2026-05-13-restore-hsts-header-cloudflare-pages.md` | Today's handoff documenting the migration off Lovable | Accurate history, leave alone. |
| `manifests/meta-extract.yaml:29,63` + `manifests/og-image-check.yaml:28,42` — fixture URL `https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/.../...-.lovable.app-1772307174433.png` | URL filename contains `.lovable.app` but the file is hosted on **Cloudflare R2** (`pub-….r2.dev`), independent of Lovable. Verified HTTP 200 from R2 with a 258 KB image. | None. R2 is operator-owned; the fixture survives Lovable cancellation. |

**strale-beacon:** zero matches. Lovable was never associated with Beacon.

### Block H — Recent commit activity on strale-frontend

```
Last 14 days:  14 commits, 14 by petterlindstrom79, 0 by lovable-dev[bot]
All time:       1 lovable-dev[bot] commit ever: b331aa1 (2025-01-01, the initial Vite/React/shadcn template scaffold)
```

**The `lovable-dev[bot]` commit path is operationally dead.** It hasn't been used since the repo's initial scaffold over a year ago — meaning Petter loses no actual workflow by cancelling. The Tech stack page's framing of "occasional AI-edit source via `lovable-dev[bot]` commits" overstates current usage; reality is "the bot did the initial scaffold and has been silent since."

---

## Active dependencies

**None.** No DNS record, response header, webhook, CI workflow, runtime code path, or recent commit activity depends on Lovable's services or subscription being active.

---

## Inert touchpoints to clean up

**Single GitHub-UI step (do this with cancellation):**

1. Revoke the `lovable-dev` GitHub App installation on `strale-io` (id 113143693) — https://github.com/organizations/strale-io/settings/installations

**Single chore PR on `strale-frontend` (bundles 4 deletions + 4 rewrites):**

2. Delete `.lovable/` directory (just `plan.md`).
3. Remove `lovable-tagger` from `package.json` devDependencies and regenerate `package-lock.json`.
4. Remove the `import { componentTagger } from "lovable-tagger"` line and the `componentTagger()` plugin invocation from `vite.config.ts`.
5. Rewrite `CLAUDE.md` — Lovable is no longer a collaborator; the entire "your directories / Lovable's directories" framing is wrong now.
6. Update `.claude/RUNBOOK.md:17` table row.
7. Update `index.html:16` comment to reflect Cloudflare Pages.
8. Update `AUDIT-security-frontend.md:17` — Lovable header limitation no longer applies.

**Single chore PR on `strale` (bundles 2 small edits):**

9. Remove the `*.lovable.{app,dev,project.com}` permissive branch from the CORS allowlist at [apps/api/src/app.ts:183](apps/api/src/app.ts#L183).
10. Update the daily-digest LLM prompt fragment at [apps/api/src/lib/daily-digest/analyze.ts:43](apps/api/src/lib/daily-digest/analyze.ts#L43) — `(on Lovable)` → `(on Cloudflare Pages)`.

**Archival, leave alone:**

11. `docs/audits/activation-traffic-2026-04-08.md`, `audit-reports/observability-baseline.md`, all `handoff/_general/from-code/2026-04-*.md` Lovable mentions — historical and accurate as of the dates they describe.

---

## Recommended order

1. **Export Lovable chat history first** (manual step in Lovable UI, if Petter wants to keep it for reference). Cancellation may purge it.
2. **Cancel the Lovable subscription.**
3. **Revoke the `lovable-dev` GitHub App installation** (id 113143693) via the GitHub UI.
4. **Ship the strale-frontend chore PR** (items 2–8 above).
5. **Ship the strale chore PR** (items 9–10 above).
6. **Notion updates** (Claude chat's job):
   - Memory #21: remove the "only commits via lovable-dev[bot]" clause; replace with "Lovable subscription canceled `<date>`; GitHub App revoked; no role going forward."
   - Tech stack page Frontend section: drop the "Lovable's role going forward" paragraph. Reframe as "Strale is fully off Lovable as of `<date>`."
   - To-do `35567c87-082c-81fd-aa99-e4e41257d06b` ("Rebuild strale.dev frontend off Lovable") — close as done (the rebuild happened 2026-05-13 via the CF Pages migration; the cancellation is the final step).

---

## Worktree / process notes

- Read-only verification; no code changes, no PRs.
- Report saved here and `git add`-ed per Rule G.
- Cross-worktree: strale-research (worktree). The strale trunk and strale-work worktrees were used as read sources for Block G code grep; no modifications.
- GitHub installations enumeration succeeded via the org-level endpoint despite the user-token alternative returning 403 — no manual-check caveat needed.
