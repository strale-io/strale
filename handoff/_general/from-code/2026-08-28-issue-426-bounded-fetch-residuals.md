# 2026-08-28 — Issue #426: bounded the seven residual fetch sites

Intent: audit and contain the seven remaining `arrayBuffer()` fetch sites recorded in #426, plus byte-limit helper hardening.

## Outcome: SHIPPED and verified

- PR #427 squash-merged as `ce2d45ca`; CI green on the exact reviewed head `c30f465f`; prod `/health` verified serving `ce2d45ca` at 18:56 CET.
- Issue #426 closed with a full disposition table. New follow-up filed: **#428** (web-provider's unbounded `.text()` across all three tiers, 47+ consumers, unbounded-size cache entries — the round-2 adversarial find, deliberately not ballooned into #426).

## Dispositions (see the #426 closing comment for the full table)

- Direct caller URLs: base64-encode-url 8 MiB; c2pa-inspect 15 MB now stream-enforced (`MAX_C2PA_MEDIA_BYTES` in the authority); website-carbon-estimate counts without buffering (new `countBodyBytes`, 100 MiB work stop) — heavy pages stay measurable.
- annual-report-extract (DEACTIVATED, DEC-20260421-SE-B): its scraped Allabolag link was a raw SSRF-unvalidated `fetch`, invisible to the unguarded-fetch lint (no caller-URL input field) — now safeFetch + 8 MiB bounded, fall-through logged.
- Browserless renders: 32 MiB named caps (screenshot/pdf), landing-page-roast 4 MiB.
- Hardening: required `maxBytes` (param reorder = compile error for stale shapes), one `consumeBody` core, `entity` refusal phrases (helper writes the prefix AND the figure), app.ts imports `MAX_DECODED_DOCUMENT_BYTES` for the rail cap, normalizeBase64 whitespace-before-prefix fix, shared streamingResponse test util (all three copies unified), directory-wide arrayBuffer sweep test.
- Seven manifests document their limits (base64-encode-url's stale ">10MB may timeout" replaced).

## Non-obvious learnings (also in memory)

- Test files are excluded from the apps/api tsc gate (`**/*.test.ts` in tsconfig exclude) — signature hardening is compile-enforced for prod code only; tests fail at runtime instead.
- annual-report-extract is deactivated → `validate-capability` fails with "No executor registered" as its steady state; don't read that as a regression.
- This dev machine is win32-arm64: c2pa-node's native binding doesn't load here (capability's own documented platform list; prod is Linux x64).

## Pending operator step (unchanged from #412)

Manifest `limitations` sync into the prod DB needs a `DATABASE_URL_WRITE`-granted `onboard.ts --backfill` run — now covers the #412 six plus these seven. Low urgency (the public capability endpoint doesn't serve limitations today).

## Process

Dedicated worktree `strale-wt-wp14` (removed at session end); /go in full (typecheck, validate ×7 PASS, readiness ×7 true, smoke 5/7 full live PASS with documented exceptions, /simplify 4 agents, six-lens no HIGH); adversarial review 4 rounds (2 findings found and fixed). No paid production calls manufactured.
