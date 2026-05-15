# Schema cleanup — 2026-05-15 EU audit mismatches

**Date:** 2026-05-15
**Branch:** `fix/schema-cleanup-eu-audit-2026-05-15`
**Triggered by:** 2026-05-15 v1 audit findings ([apps/api/docs/identity-field-coverage-2026-05-15.md](identity-field-coverage-2026-05-15.md) on branch `docs/identity-field-coverage-2026-05-15`, commit `9a5ba15`).
**Wallet spend:** €0.05 (1 pre-fix SK probe to confirm current shape). No post-fix verification probes — fixes ship via PR merge + deploy, verification deferred to chat after merge.

---

## Headline

Of 10 mismatches in the audit, **7 are fixed in this bundled PR**, **2 are non-issues** (audit framing was wrong), and **1 is deferred** to a separate prompt due to upstream-shape investigation scope.

### Fixed in this PR (7 commits)

| # | Country / field | Fix shape | Commit |
|---|---|---|---|
| 1 | UK `vat_number` | (c) remove from manifest | `6e17f6e` |
| 2 | IE `vat_number` | (c) remove from manifest | `ad8e605` |
| 3 | EE `vat_number` | (c) remove from manifest | `b2a3a3f` |
| 4 | LV `vat_number` | (b) add `deriveVatLV` helper + populate | `4dca03f` |
| 5 | EE `business_type` inconsistency | (a) extend legalForms map (code "1" = AS) | `b0ea115` |
| 6 | PL `address` + `registration_date` | (c) downgrade reliability to `common` | `018a09c` |
| 7 | FI schema undercount | (additive) declare `vat_number` + `website` + `industry_description` | `64d8a30` |

### Non-issues (audit framing was wrong)

- **BE `industry` 0/3** — reliability is already `rare` in the manifest. 0/3 fixtures populated is the *expected behavior* for a rare-reliability field. No fix needed.
- **FI "schema undercount"** — audit framed this as "handler returns fewer fields than manifest declares." Reality is the *inverse*: handler returns 3 fields the manifest does not declare (`vat_number`, `website`, `industry_description`). Fix is additive to the manifest (commit `64d8a30`), not a handler change.

### Deferred to a separate prompt

- **SK `vat_number` (DIČ)** — requires investigation of Slovak RPO's `identifiers` array shape (does it have a `type` field separating IČO from DIČ?). The handler's `RpoIdentifier` TypeScript interface omits any type field; surfacing DIČ requires extending the interface AND verifying the upstream response shape. Pre-fix SK probe (SEXES `36674141`) returned only IČO — no `vat_number` in the output, confirming the gap exists. Fix complexity is moderate (>50 lines if upstream type signal is absent and we have to filter heuristically). Per stop condition "any single fix requiring upstream API integration investigation gets a separate prompt."

---

## Per-mismatch investigation + fix detail

### UK vat_number — (c) remove from manifest

- **Handler location:** [uk-company-data.ts:4-7](../src/capabilities/uk-company-data.ts#L4-L7) (inline docstring).
- **Root cause:** UK Companies House does not return VAT — VAT lives at HMRC, accessed via the separate `vat-validate` capability per DEC-20260513-F. Handler's inline comment already documents the routing split.
- **Pre-fix manifest declaration:** `output_schema.properties.vat_number: [string, null]`
- **Post-fix:** removed from `output_schema.properties`.
- **Customer DX impact:** customers reading the v1 manifest no longer expect a VAT field from `uk-company-data`. VAT lookups route to `vat-validate` with `GB` prefix as designed.

### IE vat_number — (c) remove from manifest

- **Handler location:** [irish-company-data.ts:135-151](../src/capabilities/irish-company-data.ts#L135-L151) (return block).
- **Root cause:** CRO Open Data Portal publishes the registry record but not VAT. Irish VAT is at Revenue.ie via VIES; not algorithmically derivable from CRO number.
- **Post-fix:** `vat_number` removed from manifest `output_schema.properties`.

### EE vat_number — (c) remove from manifest

- **Handler location:** [estonian-company-data.ts:101-111](../src/capabilities/estonian-company-data.ts#L101-L111) (return block).
- **Root cause:** Estonian KMKR (VAT) registration is separate from the registry code and not returned by the e-Äriregister scrape. Not algorithmically derivable (KMKR is its own 9-digit sequence post-`EE` prefix, not the registry code).
- **Post-fix:** `vat_number` removed from manifest `output_schema.properties`.

### LV vat_number — (b) add derivation

- **Helper added:** `deriveVatLV(regNumber: string)` in [vat-derivation.ts:121-132](../src/lib/vat-derivation.ts#L121-L132). 11-digit regnumber → `LV` + regnumber. Mirrors `deriveVatPL` / `deriveVatCZ` / `deriveVatHR` shape.
- **Handler change:** [latvian-company-data.ts:134-149](../src/capabilities/latvian-company-data.ts#L134-L149) — extract `regNum` from `record.regcode`, call `deriveVatLV(regNum)`, attach to output as `vat_number`.
- **Manifest:** `output_field_reliability.vat_number: common` added. (`common` rather than `guaranteed` because non-commercial LV regtypes — associations, foundations — may have non-derivable VAT registrations.)
- **Pre-fix audit data (Batch 3):** Air Baltic, Latvenergo, Tet all returned empty `vat_number`. Post-fix expected: `LV40003245752`, `LV40003032949`, `LV50003050931` respectively (algorithmic prefix concat).
- **Empirical validation:** the 3 audit fixtures are all 40NNN- or 50NNN-prefix entities (commercial range) for which the derivation holds.

### EE business_type inconsistency — (a) extend legalForms map

- **Handler location:** [estonian-company-data.ts:84-92](../src/capabilities/estonian-company-data.ts#L84-L92) (legalForms map).
- **Root cause:** EE registry returns two code systems for `legal_form`: legacy `liik` codes (1, 2, 3) and modern codes (4-10). The handler's map only covered 4-10. AS-form entities with legacy code "1" fell through to the raw numeric `"1"`, while OÜ entities with modern code "5" got the human-readable label.
- **Audit data (Batch 3):** Bolt App Services AS (17449106) and Aktsiaselts Tallink Grupp (10238429) returned `business_type: "1"`. Pipedrive OÜ (11958539) returned `business_type: "OÜ (Private limited company)"`. Same capability, two different shapes.
- **Post-fix:** Map now includes `"1": "AS (Public limited company)"`. Codes 2 and 3 remain unmapped pending empirical evidence of which forms they represent (no audit data for them).
- **Inline doc added** explaining the legacy/modern split for future maintainers.

### PL address + registration_date — (c) downgrade reliability to common

- **Manifest only:** [polish-company-data.yaml:96-115](../../manifests/polish-company-data.yaml#L96-L115).
- **Root cause:** KRS upstream nests these fields under paths the current picker doesn't traverse robustly. Address lives under `siedziba` arrays; registration_date varies between `dane.dzial1.danePodmiotu.dataRejestracji` and odpis-level metadata. The manifest example itself shows `address: null` and `registration_date: null` — acknowledging the gap. **Manifest was lying.**
- **Post-fix:** reliability downgraded from `guaranteed` → `common`. Honest classification.
- **Picker rewrite to actually populate the fields is moderate-scope work and deferred to a separate prompt.** Right now the schema honestly says "may be present" rather than "always present."

### FI additive — declare vat_number + website + industry_description

- **Manifest only:** [finnish-company-data.yaml](../../manifests/finnish-company-data.yaml).
- **Root cause:** Audit Batch 3 flagged "FI schema undercount" — handler returns 3 fields not in manifest:
  - `vat_number` (always populated via `deriveVatFI`)
  - `industry_description` (TOL2008 description string)
  - `website` (PRH-published company website, often null)
- **Post-fix:** All 3 declared in `output_schema.properties` and `output_field_reliability` (`vat_number: guaranteed`, `industry_description: common`, `website: rare`).
- **Customer DX win:** the schema now matches reality.

---

## Shared helper decision

**Outcome: shared helper (`apps/api/src/lib/vat-derivation.ts`).** The decision was made by precedent — the module already existed with 11 country derivations before this prompt. Adding `deriveVatLV` continued the existing pattern. The single derivation added (LV) follows the 4-line shape of `deriveVatPL` / `deriveVatCZ` / `deriveVatHR`.

For the other VAT-related fixes (UK/IE/EE), no derivation was needed — those countries' VATs are genuinely unavailable from the registry source and the manifest mis-declared the field. Fix shape was schema removal, not derivation.

SK DIČ (deferred) would be a fix shape (a) "surface already-fetched field" — RPO returns DIČ in the `identifiers` array but the handler discards it. No new derivation helper needed.

---

## Verification

### Pre-merge verification

- **Typecheck:** `npx tsc --noEmit` passes (no errors).
- **Vitest:** 665 of 698 tests pass, 33 skipped (pre-existing DB-integration skips), 0 failures.
- **Stale-reference grep:** no other handlers reference the removed `vat_number` declarations.

### Post-merge verification (chat to confirm)

After PR merge + Railway auto-deploy:

| Country | Fixture | Expected behavior | Pre-fix observation | Post-fix expected |
|---|---|---|---|---|
| UK | `00445790` (Tesco) | manifest no longer declares vat_number | API output unchanged (manifest already wasn't returning it) | manifest in DB updated next seed cycle |
| IE | `513174` (Stripe) | same | same | same |
| EE | `17449106` (Bolt) | `business_type: "AS (Public limited company)"`; manifest no longer declares vat_number | `business_type: "1"` | `business_type: "AS (Public limited company)"` |
| LV | `40003245752` (Air Baltic) | `vat_number: "LV40003245752"` | `vat_number` absent | `vat_number: "LV40003245752"` populated |
| PL | `0000033945` (MARTOM) | reliability docs updated | `address: null`, `registration_date: null` | unchanged at runtime; manifest reliability now honest |
| FI | `0112038-9` (Nokia) | manifest now declares website+vat_number+industry_description | handler already returns them | manifest in DB updated next seed cycle |

The handler-changing fixes (LV, EE) need a deploy roundtrip; the manifest-only fixes (UK/IE/EE-vat/PL/FI) take effect on the next seed-and-onboard pipeline run that reconciles manifest YAML with the `capabilities` table.

---

## Notion follow-ups (for chat)

- **Capability × Country Coverage Matrix:**
  - Drop the audit's "UK/IE/EE/LV vat_number 0/3" mismatch flags (LV fixed in code; UK/IE/EE manifest-corrected).
  - Update LV row to show `vat_number: common` coverage.
  - Update EE row to show `business_type: normalized labels (legacy+modern codes)`.
  - Update PL row to note address + regdate as `common`-reliability rather than `guaranteed`.
  - Update FI row to declare the additive fields.
- **Active Vendor Stack:** no changes — vendor list unaffected.
- **No new DEC required.** This implements DEC-20260513-F's v1-ready scope cleanly; the changes don't supersede any existing decision.

---

## Deferred items (separate prompts)

1. **SK DIČ surfacing** — requires investigating Slovak RPO `identifiers` array shape. Estimated 1 hour: upstream probe + interface extension + filter logic + manifest declare.
2. **PL address + registration_date picker rewrite** — moderate-scope (~50-100 lines). Rewrite KRS response traversal to handle `siedziba`/`adresPocztowy` arrays and `odpis`-level registration metadata. Would change reliability back to `guaranteed` post-rewrite.
3. **EE legacy codes 2 and 3** — leave unmapped until empirical data shows which legal forms they represent. Defer to next audit batch that catches them.

---

*Generated by Claude Code 2026-05-15. Wallet spend: €0.05. Worktree: strale-work, branch `fix/schema-cleanup-eu-audit-2026-05-15`. 7 commits ready for PR.*
