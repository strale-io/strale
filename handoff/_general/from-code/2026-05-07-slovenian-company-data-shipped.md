Intent: Audit, build, and merge a `slovenian-company-data` capability — closing SI Gap-7 in the EU coverage matrix using the data.gov.si CKAN datastore (Path A, free + CC-BY 4.0); Path B (paid AJPES restPrsInfo) was killed by chat the same day for ToU §7 redistribution prohibition.

## Outcome

Three sequential CC sessions (audit → build → merge), all green:

1. **Audit (read-only).** Walked the codebase, confirmed no existing bulk-ingest sibling exists (the BE KBO bulk pattern referenced in Notion is a 2026-04-29 spec only, not built). Discovered that the data.gov.si CSV resource has `datastore_active: true` — meaning Path A is **live-fetch CKAN datastore_search**, not bulk-ingest, and the right sibling template is `latvian-company-data.ts` / `irish-company-data.ts`. Notion's "M effort, mirrors BE KBO bulk pattern" was wrong on both counts. Surveyed cross-sibling field-shape divergences; surfaced one new divergence (`jurisdiction` field present on IE/LV/LT, absent on SK/CZ/BE/EE/PL — SK shipped without it 2026-05-07).

2. **Build.** Created `apps/api/src/capabilities/slovenian-company-data.ts` (174 lines) and `manifests/slovenian-company-data.yaml`. Mirrored the LV/IE CKAN pattern. Pipeline `--discover` ran clean against KRKA d.d. (matična številka 5043611000) — auto-generated 11 expected_fields and 5 test suites. Smoke 11/11, validate 19/19, type-check clean (one TS18047 nullability fix on the address-format filter).

3. **Merge.** PR #66 merged 2026-05-07T20:19:25Z, commit `b4a70d0`. No rebase needed (1 ahead, 0 behind). Branch `feat/slovenian-company-data` merged via `gh pr merge --merge` server-side (main locked at `strale-spike` worktree; same workaround as PR #61).

**Capability ships in `lifecycle_state=validating, visible=false`.** Production `/v1/capabilities` will not list the slug until lifecycle promotion ~24h post-merge — that's a separate manual step tracked in Notion.

## Coverage scope (manifest is explicit on this)

- **Output:** 11 fields — company_name, reg_number, hseid, legal_form, registration_office, address (consolidated from 7 source components), settlement, postal_code, post_office, country, jurisdiction.
- **Source omits:** status, registration_date, NACE/SKD, directors, VAT. These are NOT in the data.gov.si open subset — they exist only behind paid AJPES restPrsInfo, which prohibits redistribution per ToU §7. Manifest limitation 2 is explicit so solutions can't silently filter on absent fields.
- **Refresh cadence:** twice monthly (dvotedensko), slower than IE/LV daily. Manifest limitation 1.
- **Includes `jurisdiction: "SI"`** matching IE/LV/LT convention. SK/CZ/BE/EE/PL backfill is a separate P3 to-do.

## Field reliability — empirical, not auto-default

Pipeline `--discover` defaulted all 11 fields to `guaranteed`. Empirical sampling against 11 entities (KRKA, NLB, Petrol, Mercator + 6 dataset-position samples spanning the 259k-record dataset + 1 sole-proprietor sample) confirmed 100% population for all 11 output fields. **No reclassification needed.** The verification criterion expected ≥1 demotion, but the dataset's statutory-subset profile means there are no genuinely optional fields. Bending reality to satisfy the metric would falsify the manifest. Reported the no-demotion outcome explicitly.

The only frequently empty source field is `Hišna št  dodatek` (house-number addendum, ~83% empty across samples), and it's used only as an optional sub-component of consolidated `address`, never exposed as a standalone output field.

## Non-obvious learnings

1. **The Notion-claimed dataset name "OD_FIRME" is wrong.** The canonical data.gov.si slug is `poslovni-register-slovenije`. Likely a stale internal AJPES file-naming convention; the audit caught this before the build ran.

2. **The actual API field names contain a double space:** `Hišna št  dodatek` (two spaces between `št` and `dodatek`), and `Hišna št` is "Hišna" not "Hiša" as the prior audit transcribed. Used the verbatim strings.

3. **Path B was killed by chat on the same day.** AJPES Terms of Use Article 7 prohibits redistribution to third parties under the paid restPrsInfo contract — structurally incompatible with Strale's marketplace model regardless of price. Two other reasons compounded: Slovenian-only order form and no free/HVD-eligible tier (cheapest is €211 / 500 searches). This means Path A is the only viable path; if SI customer demand requires status/reg-date/NACE/directors, the answer is "AJPES restPrsInfo direct contract under their own ToU" not "Strale ships those fields."

4. **CKAN `datastore_active: true` on a resource is the signal that distinguishes "live-fetch CKAN" from "bulk-only ZIP."** Worth checking on every future open-data registry audit; the LV pattern uses it, IE uses it, SI uses it. The BE KBO Open Data SFTP feed does NOT have a CKAN endpoint — that's why BE genuinely needs bulk ingest, and SI doesn't.

5. **Cross-sibling divergence: `jurisdiction` field.** New finding from this audit. IE/LV/LT (the 2026-04-29 Tier-1 cleanup wave) added `jurisdiction: "<CC>"`; SK/CZ/BE/EE/PL did not. SK shipped without it 2026-05-07. SI ships with it. Worth a small follow-up to either backfill or accept the divergence as intentional — chat can decide.

## Cost

Zero direct external cost (data.gov.si is free CC-BY 4.0). Three CC sessions of work, plus Petter's chat-side verification of AJPES Path B nonviability.

## Open / followups for chat or future sessions

- **Lifecycle promotion to `active`** ~24h after merge per Notion to-do `35967c87082c818881ffcc8cddb369aa`. After clean test runs, set `is_active=true, visible=true, lifecycle_state='active'`. Memory file's `validating` flag should be removed at that time.
- **Spec deviation: `category: company-data` not `identity`.** Build prompt said `category: identity`; all 8 sibling identity capabilities use `category: company-data`. Followed sibling convention. Flagged in build closing report; chat to confirm.
- **`jurisdiction` field unification** across SK/CZ/BE/EE/PL is the open P3 reconciliation item.

## Files touched

- `apps/api/src/capabilities/slovenian-company-data.ts` (new, 174 lines)
- `manifests/slovenian-company-data.yaml` (new, 156 lines after pipeline auto-fill)
- `~/.claude/projects/c--Users-pette-Projects-strale/memory/project_business_registry_state.md` (added SI to Live; removed from gap list; references PR #66 + commit b4a70d0)

## Commits

- `f90c666` feat(capability): slovenian-company-data via data.gov.si CKAN datastore
- Merge: `b4a70d0` (PR #66)
