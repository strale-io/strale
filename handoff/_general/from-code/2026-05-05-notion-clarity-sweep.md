Intent: execute the five-intervention Notion clarity sweep (front-door page, Roster view tweak, Provider-Coverage refresh, Capability slug column, drift detection script) so capabilities × products × vendors are scannable from one place and drift between the three layers becomes visible automatically.

# What shipped

## Phase 1 — Front door + Roster view tweak (additive, low-risk)

- **Vendor Roster default view** column order changed from alphabetical to: Vendor → Status → Categories → Per-call price → Floor / monthly min → Reason / rationale → Notes → Last evaluated → Doctrine fit → Primary DEC → Coverage rows → URL. The columns a buyer/auditor reads first now appear first.
- **New page**: [Capabilities, products, vendors — at a glance](https://www.notion.so/35767c87082c818ebce2d23624f1eecf) under Infrastructure (icon 🧭). Three live linked database views appended:
  - Coverage matrix — Counterparty Assurance (Provider-Coverage filtered Products = "Payee Assurance" stale-label, grouped by Evidence Type, sorted Country)
  - Active vendors — at a glance (Vendor Roster, Status = Active, sorted Categories)
  - Recent vendor decisions — last 60 days (Decisions DB, Date ≥ 2026-03-06, sorted desc)
- The page's prose flags two material drifts the sweep didn't close (see Open below).

## Phase 2 — Provider-Coverage refresh (5 deprecations + 1 new row)

- **Deprecated** (Status set, Notes appended citing the superseding DEC, Last verified bumped to 2026-05-05):
  - `Sanctions/PEP - Global aggregated - OpenSanctions` — superseded by Dilisense per DEC-20260427-A + DEC-20260429-A.
  - `OpenSanctions self-host + Global + Sanctions/PEP` — deferred indefinitely on CC-BY-NonCommercial licensing per DEC-20260429-A.
  - `IBAN/name - EU - GAP (SurePay not built)` — superseded by Digiteal + eSortcode per DEC-20260430-A.
  - `IBAN/name - EU - GAP (MonitorPay not built)` — KYB-product competitor per DEC-20260430-A.
  - `IBAN/name - US - Socure Account Intelligence (v1.1 target)` — US bank verification deferred to v1.2.
- **New row** created: `Sanctions/PEP - Global - Dilisense` (Live, Vendor Tier 2, €0.05/call, slugs `sanctions-check` + `pep-check`). Closed an actual gap — the matrix had no row for the current Active sanctions vendor.
- **Skipped intentionally**: 6 ambiguous DE/NL/IT/ES/PT/AT registry rows (and their Tier-1-violation predecessors) per the prompt's ambiguity rule. Ground truth in flux: DEC-20260504-A/B/C/D landed 2026-05-04→05 (Topograph downgraded to customer-funded-only, Openapi.com promoted as IT/ES/PT primary, ES BORME + DE bundesAPI direct paths kicking off, scope expanded from 6 to ~31 countries). Active Vendor Stack page (last refresh 2026-04-30) predates these. Touching these rows now would propagate stale source-of-truth into the matrix.

Halt threshold check: 6 rows updated of ~50 enumerated = 12% — well under the 50% halt ceiling.

## Phase 3 — Capability slug column + backfill

- Schema: `ADD COLUMN "Capability slug" RICH_TEXT` applied to the Provider-Coverage matrix data source.
- 27 rows backfilled, slugs verified against actual `apps/api/src/capabilities/*.ts` filenames (not memory): the 16 live registry rows, Cobalt-US, Liberty Data, GLEIF, VIES, OpenOwnership×2, GLEIF L2, PSC, plus litigation rows (BODACC FR / NO bankruptcy / UK insolvency), plus the new Dilisense row, plus the deprecated OpenSanctions and Strale-built adverse-media rows.
- Two rows (eSortcode UK CoP, Digiteal EU) marked `(build pending: <slug> — not yet in apps/api/src/capabilities/)` — executors are pending Digiteal contract sign + eSortcode setup per the Counterparty Assurance product page.
- ~20 rows correctly left empty (gap-status registries for HU/SI/BG/RO/LU/SK/MT/CY where no executor yet exists; sanctions verification fallbacks that run inside `sanctions-check`; Tier-1-violation rows whose underlying capabilities were deleted).

## Phase 4 — Drift detection script (commit `b26f20d`, pushed)

- New script `apps/api/scripts/check-provider-coverage-drift.mjs`. Two checks per matrix row: (1) status drift — matrix row Live/Committed/In-discovery while the matching Roster row is non-Active; (2) stale-verified drift — Last verified older than the most recent Decision in the window touching the provider. Mirrors `check-vendor-roster-drift.mjs` in shape: same NOTION_TOKEN env, same `--doc` / `--strict` / `--days=N` flags, same Notion v1 data-sources query API, with pagination handling.
- **Discovered while wiring**: `check-vendor-roster-drift.mjs` was authored a week ago but **never wired into the cron** despite its docstring claiming it would be. Wired both scripts together in `.github/workflows/weekly-drift.yml` — they now run alongside the existing manifest / platform-facts / fetch-timeout / migration-prefix sweeps every Monday.
- Smoke-tested locally: `--doc` and `--strict` (no NOTION_TOKEN) both exit 0 cleanly. Live Notion API path requires the secret in CI.
- Phase 4 was halted twice on stop conditions (5-commit ahead-of-origin ceiling, then again on stale ref + inherited untracked files); Petter explicitly waived both. Three housekeeping commits landed first (handoff doc + singapore diagnostic scripts) before the drift-script commit.

## Cumulative session output

5 commits authored + pushed: `b062072` (handoff doc), `499b756` (singapore scripts), `b26f20d` (drift script + cron wiring). Plus the inherited `4858b3b` and `87c81fe` already on origin/main when the session started; one more from the second unblock turn (Step A handoff) didn't conflict.

# Open

1. **Active Vendor Stack page is stale** relative to DEC-20260504-A/B/C/D (Topograph downgrade, Openapi.com promotion, ES BORME + DE bundesAPI direct paths, scope expansion from 6→31 countries). Needs a refresh sweep.
2. **Provider-Coverage `Products` multi-select option** still labels rows "Payee Assurance" — rename to "Counterparty Assurance" per DEC-20260502-A. Notion DDL doesn't support partial multi-select option edits without value-loss risk; safe path is ADD new option → batch-update all rows → DROP old option, in a dedicated session.
3. **6 DE/NL/IT/ES/PT/AT matrix rows + Tier-1-violation predecessors** were skipped this session as ambiguous. Should be revisited in the same session that closes thread #1.
4. **`NOTION_TOKEN` GitHub Actions secret** needs to exist in the strale-io/strale repo's Actions secrets for both drift checks (vendor-roster + provider-coverage) to actually exercise the live Notion API path weekly. Without it, both scripts fall back to manual procedure and exit 0 — workflow continues but no drift detection happens.

# Non-obvious learnings

- **The Notion clarity-sweep prompt was authored 24h before DEC-20260504-A/B/C/D landed** and assumed the Active Vendor Stack page (2026-04-30 refresh) was current. The unambiguous-update criteria in §Phase 2 of the prompt mostly held for old drift (SurePay/MonitorPay/Socure cleanups), but the DE/NL/IT/ES/PT/AT registry slot is now genuinely a moving target — the right move is to leave those rows alone until the new DECs settle into operational pages. Ambiguity-rule worked exactly as designed.
- **Notion multi-select option rename is dangerous.** `ALTER COLUMN "X" SET MULTI_SELECT(...)` requires redefining all options at once; leaving an option out drops it from every tagged row. Any future "rename a Notion option" task should follow ADD-new → migrate-rows → DROP-old, never a single ALTER.
- **`check-vendor-roster-drift.mjs` shipped without cron wiring** — a script-without-runner shape that's silent failure mode for drift detection. Both drift scripts now in the workflow, but the lesson is broader: a script's docstring saying "wire into X" doesn't mean it was wired. Greppable check: search the workflow YAML for the script filename. (Could be added to `check-fetch-timeout-coverage.mjs`-style sweeps as a "drift script unwired" check.)
- **Front-door page embeds**: `notion-create-pages` doesn't support embedded views in markdown content. Workflow is to create the page first, then `notion-create-view` with `parent_page_id=<new-page-id>` to append linked views. Linked views update live with the underlying DB.
- **The "ahead of origin" stop condition has two failure modes**: stale local ref (fix with `git fetch`) and genuine local commits made by another session today (waive only after inspecting the commits). Both fired in this session, both turned out to be inherited state from earlier CC sessions on the same workspace.

# Cost

Notion: ~50 reads, ~35 writes (5 row updates + 1 new row + 27 backfills + 1 schema change + 1 view config + 1 page + 3 view embeds). Git: 3 commits + 1 push. No external API costs.
