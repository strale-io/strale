Intent: M4 batch 5 -- wire the daily digest's repo-native readers into
production, retire the Notion shadow comparison, and remove the now-dead
`NOTION_API_KEY` environment-manifest row.

## What changed

- `apps/api/src/lib/daily-digest/index.ts`'s `gatherDigestData()` now calls
  three repo-native readers instead of Notion:
  - `getPriorities()` (new file `fetch-decision-queue.ts`) reads
    `docs/company/DECISION-QUEUE.md`.
  - `getDistributionSurfaces()` (new file `fetch-distribution-registry.ts`)
    reads `docs/operations/distribution-registry.yaml`.
  - `getShipLog()` (rewritten `fetch-shiplog.ts`) reads
    `handoff/_general/from-code/` via new file `fetch-handoff-activity.ts`
    for the journal-entry-shaped part of the ship log; GitHub commits are
    unchanged. `socialPosts` and `notionActivity` are now always empty --
    there is no repo-native analogue for either.
  - `apps/api/src/lib/daily-digest/fetch-notion.ts` is deleted.
- The three readers are ports of the already-tested shadow-mode logic
  in `scripts/digest-repo-native-lib.mjs` and `scripts/distribution-lib.mjs`,
  not imports of those files: the built Docker image does not carry
  `scripts/`, only `apps/api/`, `packages/*`, `manifests/`, and (as of this
  batch) the four repo-native data paths.
- `Dockerfile`: added `COPY` lines for `docs/company/DECISION-QUEUE.md`,
  `handoff/_general/from-code/`, `docs/operations/distribution-registry.yaml`,
  and `config/vendors.yaml`, plus a `RUN` step after the copies that checks
  each of the four paths exists in the image and exits non-zero naming the
  missing one if not (DEC-20260504-C: a `COPY` line is not evidence the
  files arrived; this makes a broken image fail to build at all).
- The digest now prints the serving image's commit
  (`RAILWAY_GIT_COMMIT_SHA` via `deployCommitOrNull()`): in the job's
  structured log at `digest-start`, and in the rendered email's footer
  (`DigestData.imageCommit`).
- Retired the shadow comparison: deleted `scripts/digest-shadow.mjs` and
  `.github/workflows/m3-digest-shadow.yml`, removed the `digest:shadow` npm
  script, removed the `m3-digest-shadow-comparison` entry from
  `config/scheduled-mechanisms.yaml`. Renamed `digest:shadow:test` to
  `digest:repo-native:test` (kept the test file,
  `scripts/digest-repo-native.test.mjs`, which still tests
  `digest-repo-native-lib.mjs`'s pure functions directly) and updated
  `.github/workflows/ci.yml`'s reference to it.
- Removed the `NOTION_API_KEY` row from `config/env-manifest.yaml` and
  regenerated `.env.example` / `apps/api/.env.example` via
  `npm run env:example`.
- Added `apps/api/src/lib/daily-digest/repo-native-readers.test.ts` (10
  vitest cases: shape, cutoff/window behaviour, throw-on-malformed-input,
  live-repository runs for all three new readers) and updated
  `apps/api/src/lib/unbounded-body-reads.test.ts`'s fetch-call ledger
  (removed the `fetch-notion.ts` row; `fetch-shiplog.ts` dropped from 3
  fetch() call sites to 1 now that its two Notion-reading functions are
  gone).

## Notion-key reader search (before removing the manifest row)

Ran `grep -rn "NOTION_API_KEY"` across the tracked tree (with and without
`--hidden`) before and after the code change. Before: three readers --
`apps/api/src/lib/daily-digest/fetch-notion.ts`,
`apps/api/src/lib/daily-digest/fetch-shiplog.ts`, `scripts/digest-shadow.mjs`
-- plus doc/archive prose mentions (not code reads) and two `.env.example`
lines. After deleting `fetch-notion.ts`, rewriting `fetch-shiplog.ts`, and
deleting `digest-shadow.mjs`: zero remaining `process.env.NOTION_API_KEY`
reads under `apps/api/src`, `apps/api/scripts`, `packages`, or `scripts` --
confirmed both by the grep and by `npm run env:check` passing clean.
`NOTION_TOKEN` (a distinct credential, read by
`apps/api/scripts/check-vendor-roster-drift.ts` and
`.github/workflows/weekly-drift.yml`) is untouched; retargeting it is M4
batch 6, not this batch.

## Image build verification

Built the full image locally (`docker build .`) after this batch's
Dockerfile change: succeeded, the verification step printed "image
verification: all four repo-native digest paths present", and
`docker run` confirmed all four paths present inside the container plus
correct output from all three new TS readers running against the built
`apps/api/dist/lib/daily-digest/*.js` files (not source). Also ran
`deployCommitOrNull()` inside the container in both non-production mode
(returns the `unknown-local-build` sentinel) and with
`NODE_ENV=production` + `RAILWAY_GIT_COMMIT_SHA` set (returns the sha).

Planted-failure proof: removed the `config/vendors.yaml` `COPY` line and
rebuilt -- the image build failed at the verification `RUN` step with
"image verification failed: required path missing from image:
config/vendors.yaml", then restored the line and rebuilt clean.

## Gates run (root, unless noted)

`apps/api`: `npx tsc --noEmit` (pass), the vitest files covering the digest
(`repo-native-readers.test.ts`, `unbounded-body-reads.test.ts`,
`no-boot-relative-timers.test.ts`: 33 tests, pass). Root:
`npm run digest:repo-native:test` (19 tests, pass), `npm run env:check`
(pass), `npm run scheduled:check` (pass), `npm run docs:test` (pass),
`npm run context:check` (no warnings after the generate cycle below),
`npm run receipts:check` (ok; pre-existing unrelated
`HANDOFF_BARE_TEST_COUNT` warnings on older handoff files, not this
batch's), `npm run programs:check` (pass), then `npm run archive:index`,
`git add -A`, `npm run context:generate` twice with `git add -A` after
each.

Test evidence receipt: `archive/receipts/2026-09-13-test-run-m4-b5-digest-production.json`.

## Spec vs. this batch

Section 7 item 5 of `archive/sessions/2026-09-11-m4-cutover-inventory.md`
names `config/vendors.yaml` as one of the four Dockerfile paths "the
readers use," alongside `docs/company/DECISION-QUEUE.md`,
`handoff/_general/from-code/`, and `docs/operations/distribution-registry.yaml`.
Searched the repository for any current reader of `config/vendors.yaml`
inside the digest path or its new modules: none exists. The three new
readers (`fetch-decision-queue.ts`, `fetch-distribution-registry.ts`,
`fetch-handoff-activity.ts`) read only the other three paths. I added the
`COPY` line and the build-time check for `config/vendors.yaml` anyway,
per the settled decision's explicit list and the brief's instruction to
follow the specification over the brief where they differ, but flag this:
today it is copied into the image without a current in-image reader. The
weekly vendor-roster drift check (`apps/api/scripts/check-vendor-roster-drift.ts`)
does read `config/vendors.yaml`, but that script runs in
`.github/workflows/weekly-drift.yml` (a full GitHub Actions checkout), not
from the built API image, so it does not explain the requirement either.
Not resolved in this batch; flagging for whoever owns M4 batch 6
(retargeting the vendor-roster drift check) in case that batch is where a
digest-side vendors.yaml reader was meant to land.

## Not touched (explicitly out of scope for this batch)

- `docs/operations/distribution-registry.yaml`'s `authority_active: false`
  and any other authority markers -- that is M4 batch 8.
- `NOTION_TOKEN`, `check-vendor-roster-drift.ts`, and the
  `weekly-drift-vendor-roster` entry in `config/scheduled-mechanisms.yaml`
  -- that is M4 batch 6.
- Report-only checks becoming blocking -- that is M4 batch 7.
- The Notion API key in the Railway hosting project, the GitHub repository
  secret, and the Notion workspace itself -- founder-only acts per the
  brief.

## Next action

M4 batch 6 (retarget the weekly vendor-roster drift check off Notion,
remove `NOTION_TOKEN` from the env manifest) per section 7 item 6 of
`archive/sessions/2026-09-11-m4-cutover-inventory.md`. Whoever picks that
batch up should also resolve the `config/vendors.yaml` discrepancy flagged
above.
