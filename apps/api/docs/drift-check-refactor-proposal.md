# Drift-check script refactor proposal — derive lists from canonical source

**Date:** 2026-05-07
**Status:** Proposal — no implementation in this commit
**Owner:** TBD (chat-side review → follow-up implementation prompt)

## 1. Problem statement

The drift-check scripts in `apps/api/scripts/` exist to catch the failure mode where a vendor name (or count, or retention period) appears in a customer-facing surface after the underlying truth has changed. They were created in response to the 2026-04-30 cert-audit incident where the methodology page kept saying "OpenSanctions" three days after the switch to Dilisense.

The same scripts have been carrying the same defect class. `check-platform-facts-drift.mjs:CURRENT_VENDORS` claims (in its header comment) to mirror `STATIC_FACTS.vendors` from `apps/api/src/lib/platform-facts.ts`, but the runtime source-of-truth has 10 categories and the script's mirror has a different, partially-overlapping set. `check-provider-coverage-drift.mjs:KNOWN_GOV_REGISTRY_PROVIDERS` is dead documentation that listed `"OpenOwnership"` as if it were an active free public API integration. Neither map is loaded from a canonical source; both are hand-maintained alongside (but not derived from) what they claim to mirror. That is the same drift surface the scripts exist to catch.

The pattern is named in the 2026-05-07 course-correction Journal entry (https://www.notion.so/35967c87082c81dc905fceff85603fe5): aspirational-architecture-as-fact, where a planned integration appears in a list of current ones because the list was authored independently of the canonical state. Static maps inside drift-check scripts are themselves drift-prone — and the scripts cannot reliably catch this defect class while carrying their own copies of the canonical lists. The structural fix is to derive, not duplicate.

This proposal describes that refactor. It does not implement it.

## 2. Current state

Three drift scripts:

### `check-platform-facts-drift.mjs`

| Static structure | Lines | Used by | Defect |
|---|---|---|---|
| `CURRENT_VENDORS` | 49-60 | Only `.sanctions` referenced (line 189, error-message string) | Header claims to mirror `STATIC_FACTS.vendors`. 9 of 10 entries are dead code. 7 of 10 entries reference categories not present in `STATIC_FACTS.vendors` at all. |
| `STALE_VENDORS` | 71-89 | Word-boundary regex match against every surface file (line 181) | Actively used. Maintained alongside Vendor Roster (Notion DB `af5a164b-dea9-4837-9835-210ae69b4283`). Drift risk: a vendor moved to Rejected on the Roster might not get added here. |
| `RETENTION_DAYS` | 90 | Retention-claim check (line 214) | Hardcoded `1095` mirroring `STATIC_FACTS.retention_days_default = TRANSACTION_RETENTION_DAYS`. The unit test `platform-facts.test.ts` asserts the runtime value matches `TRANSACTION_RETENTION_DAYS`, but does not assert the script's mirror matches. |

### `check-provider-coverage-drift.mjs`

| Static structure | Lines | Used by | Defect |
|---|---|---|---|
| `KNOWN_GOV_REGISTRY_PROVIDERS` | 73-81 | Never read | Pure documentation artifact. The script's actual logic skips Vendor-Roster-unmatched providers regardless. The set's comment (lines 70-72) admits this. Listed `"OpenOwnership"` alongside genuine gov registries (Companies House, VIES, GLEIF) until 2026-05-07. |
| `PROVIDER_COVERAGE_DS`, `VENDOR_ROSTER_DS`, `DECISIONS_DS` | 62-64 | Notion API calls | External constants. Not in scope for this refactor. |

### `check-vendor-roster-drift.mjs`

No static vendor maps. Two Notion DB IDs (lines 49-50) and a Notion page URL (line 51) are external constants. No defect of this class.

### Runtime canonical source

`apps/api/src/lib/platform-facts.ts` exports `STATIC_FACTS`:

```ts
STATIC_FACTS.vendors = {
  sanctions, pep, adverse_media_primary, adverse_media_fallback,
  embeddings, risk_narrative, headless_browser,
  payments_card, payments_x402, log_sink,
}
STATIC_FACTS.retention_days_default     // = TRANSACTION_RETENTION_DAYS
STATIC_FACTS.retention_days_max_configurable
STATIC_FACTS.controller                  // legal_name, contact_email, incorporation_jurisdiction
STATIC_FACTS.tos_version_current
```

Notably absent from `STATIC_FACTS.vendors`: any IBAN/name-match vendor, any US registry/EIN vendor, any UBO supplement vendor, any litigation-data vendor. The drift script's `CURRENT_VENDORS` invented these category keys without a corresponding entry in the runtime source.

`platform-facts.ts` is bundled into the runtime API. It's imported by 8 files: `app.ts`, `routes/llms-txt.ts`, `routes/a2a.ts`, `routes/welcome.ts`, `routes/ai-catalog.ts`, `routes/platform-facts.ts`, `lib/platform-facts.test.ts`, plus self-imports. `GET /v1/platform/facts` exposes its content (cached 5 min).

## 3. Proposed canonical source per script

### `check-platform-facts-drift.mjs` → `STATIC_FACTS.vendors` + a stale-vendors module

The active-vendor list should come from `STATIC_FACTS.vendors` directly. The script's `CURRENT_VENDORS` map either becomes a runtime import or disappears entirely (only `.sanctions` is referenced, and even that is only used to build an error message — the actual detection logic is over `STALE_VENDORS`).

The `STALE_VENDORS` list is a separate concern. It encodes "vendors we've explicitly rejected or deferred — do not re-introduce them in customer-facing copy." That list does NOT belong in `STATIC_FACTS.vendors` (which represents *current* state). It belongs in a parallel module or a generated file derived from the Vendor Roster.

Two options for `STALE_VENDORS`:

(a) **Co-locate with `platform-facts.ts`.** Add `STATIC_FACTS.stale_vendors` (or a parallel exported constant `STALE_VENDORS`). Hand-maintained at the source of truth alongside the active list. The drift script imports it directly. Pros: one file to maintain, atomic edits. Cons: mixes "active state" and "explicit rejects" in one file.

(b) **Derive from Vendor Roster Notion DB at CI time.** A pre-step in `weekly-drift.yml` queries the Roster, writes a generated `apps/api/src/lib/stale-vendors.generated.json` file, and `check-platform-facts-drift.mjs` reads that file. Pros: Roster is the source of truth, stale list cannot drift from Roster. Cons: introduces a generated file, requires NOTION_TOKEN at the build/CI step that produces it.

Recommendation: **option (a)** for the first pass. Lower complexity, atomic with `platform-facts.ts`. Move to (b) only if the maintenance burden proves real (which requires the manual maintenance to fail at least once, otherwise it's premature optimisation).

`RETENTION_DAYS` should be imported from `STATIC_FACTS.retention_days_default` directly. There's no reason to hardcode it in the script.

### `check-provider-coverage-drift.mjs` → no static map needed

`KNOWN_GOV_REGISTRY_PROVIDERS` is dead code. Delete it entirely. The script's actual logic is "skip if no Roster match" (line 254-258), which doesn't depend on knowing which providers are gov registries — it depends on whether the Provider name matches a Vendor Roster row, which the live Notion fetch already provides.

If a future iteration of the script genuinely needs a list of gov-registry providers (for a different check, e.g. "warn if a gov-registry name is in the Roster"), that list should be derived from the Provider-Coverage matrix's own `Sourcing pattern` field (e.g. rows where `Sourcing pattern = "Direct gov API"`) — fetched live, not hand-maintained.

### `check-vendor-roster-drift.mjs` → no change needed

No static vendor map. The script already fetches Roster and Decisions live. Out of scope for this refactor.

## 4. Required exports / fixtures

### From `platform-facts.ts`

To support the refactor, `platform-facts.ts` would need:

1. **`STALE_VENDORS` exported as a `readonly string[]`.** Co-located with `STATIC_FACTS.vendors`. Each entry has a one-line comment naming the superseding DEC. The drift script imports this directly.

   ```ts
   // Vendors explicitly Rejected or Deferred per Vendor Roster + DEC-20260430-A.
   // Should NEVER appear in consumer-facing copy as if active. The single
   // permitted location is the Vendor Roster itself.
   export const STALE_VENDORS = [
     "OpenSanctions self-host",      // DEC-20260429-A — CC-BY-NC licensing finding
     "SurePay", "MonitorPay", ...    // DEC-20260428-A — IBAN/name-match rejected
     "OpenOwnership",                 // BODS evaluation 2026-04-02 — deferred
     ...
   ] as const;
   ```

2. **No new exports needed for retention.** `STATIC_FACTS.retention_days_default` already exists.

3. **Module-format consideration.** `platform-facts.ts` is TypeScript with ESM-style imports. The drift scripts are `.mjs` (raw ESM). Direct cross-import is possible but requires the .mjs script to import a compiled `.js` artifact (since `.mjs` cannot import `.ts` directly without a loader). Two paths:

   (a) Compile `platform-facts.ts` to `dist/lib/platform-facts.js` as part of the CI prep, then have `.mjs` import the compiled output.

   (b) Convert the drift scripts from `.mjs` to `.ts` and run them via `npx tsx` like the existing `apps/api/scripts/sweep-manifest-drift.ts`. (`weekly-drift.yml:42` already invokes `tsx scripts/sweep-manifest-drift.ts`, so the precedent is set.)

   Recommendation: **(b)** — convert drift scripts to TypeScript. It removes the import-format friction permanently and follows the precedent in the same workflow.

### From the Vendor Roster Notion DB (option b for `STALE_VENDORS`, deferred)

If the secondary option (CI-generated stale list) is chosen later, the build would need:

- A `scripts/generate-stale-vendors.ts` that queries the Roster (`af5a164b-dea9-4837-9835-210ae69b4283`), filters to `Status != Active`, writes the result to `apps/api/src/lib/stale-vendors.generated.json`.
- A CI step in `weekly-drift.yml` that runs this before the drift sweeps.
- A unit test that asserts the generated file has at least the canonical handful of historic entries (`OpenSanctions self-host`, `SurePay`, etc.) so a Roster query failure can't silently empty the stale list.

## 5. What the drift check tests, post-refactor

The current scripts test "static map matches canonical (informally)." With the static maps removed or imported, that invariant disappears. The new invariants:

### `check-platform-facts-drift.mjs`

- **Stale-vendor mention.** "Any name in `STALE_VENDORS` (now imported from `platform-facts.ts`) appearing word-boundary in any surface file is drift." Same logic as today; only the source of the list changes.
- **Retention claim mismatch.** "Any 'NN day' near retention/storage context where NN ≠ `STATIC_FACTS.retention_days_default` is drift." Imported value, not hardcoded.
- **Hardcoded vendor name.** *(New invariant proposal)* "Any name in `STATIC_FACTS.vendors` appearing literally in a customer-facing surface other than `routes/platform-facts.ts` is drift" — i.e., consumer surfaces should READ the vendor name from `/v1/platform/facts` rather than hardcoding it. This catches the next class of drift up the stack: even when the canonical name is correct, a surface that hardcodes today's value cannot follow tomorrow's vendor switch automatically. *(This new invariant is optional for the first refactor pass — flagging it as a Phase B+1 enhancement.)*

### `check-provider-coverage-drift.mjs`

- Unchanged. The script's actual logic (status drift, stale-verified drift) was already correctly Notion-derived. The dead static map was the only defect; removing it changes nothing about what the script tests.

### `check-vendor-roster-drift.mjs`

- Unchanged.

### New test for `platform-facts.ts`

`platform-facts.test.ts` would gain assertions for the new `STALE_VENDORS` export:

- "STALE_VENDORS contains at least the historical superseded vendors" — pin a small known-stale subset (e.g., `["OpenSanctions self-host", "SurePay", "OpenOwnership"]`) so a careless edit can't empty the list.
- "STALE_VENDORS and STATIC_FACTS.vendors have no overlap" — invariant: a vendor cannot be both rejected and active. Catches the failure mode where a vendor switch leaves the old name in both lists.

## 6. Migration plan

Three logical steps; recommend bundling steps 1 and 2 into one PR and step 3 into a follow-up.

### Step 1 — Add canonical exports to `platform-facts.ts`

- Add `export const STALE_VENDORS = [...] as const;` co-located with `STATIC_FACTS`.
- Populate from the current `check-platform-facts-drift.mjs:STALE_VENDORS` content (same names, same comments).
- Add `platform-facts.test.ts` assertions for the new export.
- No script changes yet — the addition is pure new export.

### Step 2 — Convert the drift scripts and import from canonical

- Rename `check-platform-facts-drift.mjs` → `check-platform-facts-drift.ts`. Update `weekly-drift.yml` step `facts-drift` from `node` to `npx tsx`.
- Replace `STALE_VENDORS = [...]` with `import { STALE_VENDORS } from "../src/lib/platform-facts.js"`.
- Replace `RETENTION_DAYS = 1095` with `STATIC_FACTS.retention_days_default`.
- Delete the dead `CURRENT_VENDORS` map entirely (only `.sanctions` was referenced; replace with a literal string in the error-message line, or import `STATIC_FACTS.vendors.sanctions`).
- Delete `KNOWN_GOV_REGISTRY_PROVIDERS` from `check-provider-coverage-drift.mjs` entirely. (Optionally also rename to `.ts` for consistency, but unrelated to the defect fix — could be a follow-up.)
- Run all three drift scripts; confirm exit codes match pre-refactor baseline.

### Step 3 — *(optional follow-up)* Add hardcoded-vendor-name invariant

- Implement the new "any STATIC_FACTS.vendors name hardcoded in a non-canonical surface is drift" check.
- This is Phase B+1: a strictly stronger drift check. The first refactor doesn't need it.

### Stop-conditions during migration

- **Drift-script behavior change between baseline and post-step-2.** Any change in pass/fail status is a finding, not a regression — chat decides. The marketing-copy session's pattern of "drift script silently allowed something it should have caught" applies here too.
- **`tsx`-run script materially slower than `node` for the .mjs version.** If the conversion adds significant CI time, fall back to compiling `platform-facts.ts` to a .js artifact and importing that from .mjs.
- **Notion API quota / rate-limit changes** are not affected by this refactor — neither path adds new Notion calls.

## 7. Risks and open questions

### Things this proposal cannot resolve from code alone

1. **The Uncertain CURRENT_VENDORS entries.** The current `CURRENT_VENDORS` map has 7 entries naming categories not present in `STATIC_FACTS.vendors` (`iban_name_match_eu/uk`, `us_company_registry`, `us_ein`, `ubo_supplement_global`, `fr_litigation`, etc.). Are those:
   - (a) Vendors actually integrated where `STATIC_FACTS.vendors` is incomplete (missing those categories)?
   - (b) Vendors NOT integrated where the script's `CURRENT_VENDORS` is aspirational (same defect class as OpenOwnership)?
   - (c) Categories tracked separately by intent (e.g., "things we WILL integrate per the v1 plan, but haven't yet")?
   
   This is a **chat decision**, not a code question. The audit cannot tell which is right. The Phase A commit removes only OpenOwnership (the entry confirmed (b) by yesterday's audit). The remaining entries stay in place pending chat clarification, and the structural refactor in Phase B should NOT silently re-classify them.

2. **Whether `STALE_VENDORS` should live in `platform-facts.ts` or a separate module.** The proposal recommends co-location, but there's a defensible argument for a separate `apps/api/src/lib/vendor-rejects.ts` to keep "active state" and "rejected list" in different files. Either works.

3. **Whether to also derive `STATIC_FACTS.vendors` from Vendor Roster.** The Roster IS the canonical source for vendor status. Today, `STATIC_FACTS.vendors` is hand-maintained alongside the Roster — same drift class, just one layer up. A future iteration could generate `STATIC_FACTS.vendors` from the Roster at CI time. That's strictly bigger scope than this proposal and explicitly out of bounds for the structural refactor; it would warrant its own DEC.

### External consumers

- The drift scripts are invoked only by `weekly-drift.yml`. No external consumers, no published API. Refactor risk is contained.
- `STATIC_FACTS` content reaches `GET /v1/platform/facts`. Adding a new export (`STALE_VENDORS`) does not change the existing API response unless we deliberately surface it (which this proposal doesn't recommend — the rejected list is internal governance, not customer-facing).

### Hidden coupling

- `platform-facts.test.ts` line 23-34 asserts the *shape* of `STATIC_FACTS.vendors`. Adding `STALE_VENDORS` as a sibling export does not change that shape. No test-coupling risk.
- `weekly-drift.yml` aggregates exit codes from all sweep steps (lines 159-169). Converting `.mjs` to `.ts` does not change the aggregator's contract.

### A DEC will be needed for implementation

The structural change (co-locating `STALE_VENDORS` in `platform-facts.ts`, converting drift scripts to TypeScript, deleting `CURRENT_VENDORS` and `KNOWN_GOV_REGISTRY_PROVIDERS`) warrants a feature-scope DEC at implementation time. The DEC documents: the canonical source choice, the script-format conversion, the new invariant proposal in §5. This proposal doc becomes the implementation-prompt input for the DEC.

## 8. Estimated effort

**S — small.** ~1-2 hours of focused work, including PR review.

Justification: the changes are localised (3 files at most: `platform-facts.ts`, `platform-facts.test.ts`, `check-platform-facts-drift.{mjs→ts}`). No DB changes, no API contract changes, no new dependencies. The hardest part is verifying the new TypeScript drift script produces output identical to the .mjs baseline — which is a couple of test runs against the same fixtures.

If Step 3 (hardcoded-vendor-name invariant) is bundled in, effort grows to **M — medium** (~3-4 hours), because that check needs to be careful about false positives in surfaces where the vendor name is supposed to appear (e.g., methodology page citing a vendor by name as a primary source — that's not drift, that's documentation).
