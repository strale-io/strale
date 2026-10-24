Intent: M4 batch 6 -- retarget the weekly vendor-roster drift check off
Notion. Make `config/vendors.yaml` the primary source for
`check-vendor-roster-drift.ts`, remove the Notion API call and
`NOTION_TOKEN` read, and remove the now-dead `NOTION_TOKEN` environment-
manifest row.

## What changed

- `apps/api/scripts/check-vendor-roster-drift.ts`: rewritten. Removed the
  `api.notion.com` call, the `NOTION_TOKEN` read, the printed manual
  procedure (`--doc`), and `--roster-fixture` (it fed a synthetic
  Notion-shaped roster into the now-removed shadow comparison; there is no
  roster left to fixture). The script's sole check is now `checkAllVendors`
  + `checkVendorViewFresh` from `scripts/vendors-lib.mjs` -- the same
  contract `npm run vendors:check` enforces on every PR: schema validity,
  id/alias uniqueness, lifecycle ordering, decision/evidence path
  resolution, cross-checks against `dependency-manifest.ts` PROVIDERS,
  `coverage-matrix/*.yaml`, `env-manifest.yaml`, `platform-facts.ts`
  (STALE_VENDORS, STATIC_FACTS.vendors), and history against the base
  branch. Exit code: 0 clean, 1 on any finding, 2 on an unexpected error.
  No more silent always-exit-0 mode.
- `.github/workflows/weekly-drift.yml`: `vendor-roster` step no longer sets
  `NOTION_TOKEN` in its `env:`, and no longer passes `--strict` (the flag is
  gone; the exit code is always meaningful now). Comments and the aggregate
  report label updated from "Vendor Roster <-> Decisions drift" to "Vendor
  register drift".
- `config/scheduled-mechanisms.yaml`: `weekly-drift-vendor-roster` entry's
  `secrets` map is now `{}` (matching the step's actual secrets, now
  empty), and its `purpose` text rewritten to describe the retargeted
  check.
- `config/env-manifest.yaml`: removed the `NOTION_TOKEN` row (its last
  reader). Regenerated `.env.example` and `apps/api/.env.example` via
  `npm run env:example`.

## Why the register comparison means `checkAllVendors`, not a literal port
of `compareRosterWithRegister`

The M4 cutover inventory's sketch for this item
(`archive/sessions/2026-09-11-m4-cutover-inventory.md:605-625`) named
`compareRosterWithRegister` as the check to keep exercising. That function's
signature is `(rosterRows, register)`, where `rosterRows` was always the
live Notion Vendor Roster's `{vendor, status, url}` rows -- once the Notion
call is removed there is no roster left to feed it; nothing in the repo
produces a second, independent "vendor roster" to compare the register
against. What `compareRosterWithRegister` was actually approximating in
shadow mode -- does the register agree with what the code surfaces say about
each vendor -- is exactly what `checkAllVendors`'s existing cross-checks
already do natively against `PROVIDERS`, `STALE_VENDORS`, and
`STATIC_FACTS.vendors`, without needing an external roster at all. So "the
register comparison, made primary" is `checkAllVendors`, the same function
`vendors:check` already calls. This is a deviation from the inventory's
literal sketch, not from the batch specification's actual instruction
(section 7 item 6: "remove the Notion call... make the register comparison
the primary check and its exit code meaningful") -- flagging it because the
brief asked to.

One consequence worth naming: `vendors:check` already blocks every PR in
`ci.yml`, so this weekly run will, in the overwhelmingly common case,
re-confirm something CI already proved about `main`. That is deliberate,
not redundant-by-oversight: it is a scheduled re-verification that `main`
itself (not just the branch that last merged into it) still satisfies the
register's contract, the same defense-in-depth role `facts-drift` and the
other already-redundant-with-CI steps in this same workflow play. It is not
free of a real, if less common, blind spot: `config/vendors.yaml`'s
`reevaluation_triggers` field can carry a `kind: date` trigger (one exists
today, `dilisense`, due 2027-04-01) whose due date can arrive purely from
the passage of time, with no commit at all -- that is not checked by
`checkAllVendors` today and this batch does not add it; noting it here as a
gap for a future batch, not something I invented a check for on my own
judgement.

## Confirming NOTION_TOKEN's last reader

Searched (before removing the code's read): `git grep -n
"process\.env\.NOTION_TOKEN|env\.NOTION_TOKEN|NOTION_TOKEN" -- *.ts *.mjs
*.js *.yml *.yaml`. The only live `process.env.NOTION_TOKEN` read in the
tracked tree was `apps/api/scripts/check-vendor-roster-drift.ts:260`.
Re-ran the same search after the edit: every remaining `NOTION_TOKEN` match
is prose (comments, docs, historical handoff/session files, this script's
own new header comment naming what was removed, and
`scripts/scheduled-reachability-lib.mjs`'s docstring example) -- no code
reads it.

## Ordering: manifest row removed in the same commit as its last reader

Both the code change (removing `process.env.NOTION_TOKEN` from
`check-vendor-roster-drift.ts`) and the manifest row removal
(`config/env-manifest.yaml`) land in this batch's single commit. Verified
by planting the lag deliberately: with the code already retargeted, I
temporarily re-added the `NOTION_TOKEN` row to `config/env-manifest.yaml`
and ran `npm run env:check` -- it failed with `DEAD_ENV_ROW`. Reverted, and
`env:check` passed again. This proves the hazard the specification names
(a manifest update lagging the code change by even one commit) would have
been caught, and confirms the single real commit in this batch does not
trigger it.

## Planted failures (see receipt for full detail)

1. Manifest row re-added without a code reader -> `npm run env:check` exit
   1, finding `DEAD_ENV_ROW`. Reverted; exit 0.
2. `config/scheduled-mechanisms.yaml`'s declared secrets map set to
   `{ NOTION_TOKEN: NOTION_TOKEN }` while the workflow step declares none ->
   `npm run scheduled:check` exit 1, finding `MECHANISM_SECRET_MISMATCH`.
   Reverted; exit 0.
3. Retargeted drift check: temporarily broke `config/vendors.yaml` (gave
   `openregister` the id `browserless`) -> `check-vendor-roster-drift.ts`
   exit 1 with 4 findings (`DUPLICATE_VENDOR_ID`, `PROVIDER_VENDOR_MISSING`,
   `VENDOR_REMOVED`, `VENDOR_VIEW_STALE`). Reverted (confirmed clean via
   `git status --porcelain`); exit 0, "No drift detected. 88 vendor(s)...".

Evidence: `archive/receipts/2026-09-13-check-m4-b6-vendor-roster-drift-retarget.json`.

## Gates run (this batch)

`apps/api`: `npx tsc --noEmit` -- pass (after `npm --workspace=packages/mcp-server
run build`, needed once per fresh worktree checkout; unrelated to this
batch's changes). Root: `vendors:test` pass, `vendors:check` pass,
`scheduled:check` pass, `env:check` pass, `docs:test` pass, `context:check`
pass (no warnings), `receipts:check` pass (11 pre-existing
`HANDOFF_BARE_TEST_COUNT` warnings, unrelated to this batch), `programs:check`
pass, `archive:index` run, `context:generate` run twice with `git add -A`
after each.

## Did not do (out of scope for this batch, per the brief)

- Did not touch the GitHub secret, the Notion API key, or the Notion
  workspace.
- Did not add the Notion anti-regression check or make any report-only
  check blocking (batch 7).
- Did not flip authority markers or schema fields (`authority_active` stays
  `false`; batch 8, must be last).
- Did not add a reevaluation-trigger due-date check (noted above as a gap,
  not implemented -- outside this batch's specification).

## Next action

Batch 7: add the permanent Notion anti-regression check
(`scripts/check-no-notion-regression.mjs`) and promote report-only checks
(`check-project-context.mjs`, the `DECISION_ID_UNCOVERED` warning) to
blocking, per `archive/sessions/2026-09-11-m4-cutover-inventory.md` section
7 item 7.
