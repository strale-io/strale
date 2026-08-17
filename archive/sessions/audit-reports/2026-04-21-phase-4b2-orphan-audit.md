# Phase 4b.2 audit — Orphan capability classification

**Date:** 2026-04-21
**HEAD:** `6f79b1e` (`main`) — Phase 4b.1 shipped; this audit is for the follow-on step
**Scope:** read-only audit of the 32 DB rows that lack a YAML source file. No DB writes, no YAML generation, no row deletion. Output is the narrative below plus the decision CSV at `audit-reports/2026-04-21-phase-4b2-orphan-decisions.csv`.

---

## 1. Executive summary

Thirty-two capability rows exist in the DB without a matching YAML file in `manifests/` — the set difference after Phase 4b.1's 275-slug backfill. The cohort breakdown from audit §4.13 matches current prod reality exactly: 17 active web3 / 11 suspended UK-property / 4 deactivated. Evidence strongly favours a three-way split for the vast majority: **17 `yaml-generate`** (all active web3, all with code + recent traffic + solution refs), **9 `suspend-add-yaml`** (UK-property caps still tied to a suspended `uk-property-check` solution), **3 `delete`** (deactivated, no solution refs, no recent traffic). Three slugs land in `needs-human-input`: `singapore-company-data` (deactivated but referenced by three **active** solutions — broken prod state, can't auto-classify), and `email-pattern-discover` + `officer-search` (mis-cohorted by the original audit as UK-property — they actually belong to `company-intelligence-sdr`, a currently-active SDR solution, yet themselves are suspended — lifecycle inconsistency).

Two structural issues surface that the implementation prompt must handle before YAML generation can succeed for the 17 web3 slugs:

1. **`web3` category not in VALID_CATEGORIES** ([apps/api/src/lib/onboarding-gates.ts:203](../apps/api/src/lib/onboarding-gates.ts#L203)). All 17 web3 orphans have `category: web3` in the DB. The manifest-completeness CI gate (Phase 4b.1) would reject generated YAML. The implementation prompt must add `web3` to the enum.
2. **`uk-property-check` solution is `is_active=false`** while the 9 capabilities it depends on are `lifecycle_state=suspended` with `is_active=true` in the capabilities table. Consistent at the aggregate level but worth confirming whether the solution's suspension actually blocks calls or whether the suspended capabilities could still be invoked independently.

---

## 2. Methodology

### 2.1 Evidence axes

Five axes of evidence per slug, all queried live against prod:

| Axis | Query source | What it tells us |
|---|---|---|
| Lifecycle state | `capabilities.lifecycle_state`, `is_active`, `visible` | Is operator intent active/paused/dead |
| Code presence | `apps/api/src/capabilities/<slug>.ts` filesystem check | Is there a working implementation |
| Test activity | `test_results` (`capability_slug`, `executed_at`) | Is the capability being tested (= maintained) |
| Transaction activity | `transactions` joined via `capability_id` | Have agents/users actually called this |
| Solution composition | `solution_steps.capability_slug` → `solutions.slug`, `solutions.is_active` | Does composition depend on this |

### 2.2 Confidence rules applied

- **high**: all five axes align (e.g. active lifecycle + code + recent tests + recent tx + active solution → `yaml-generate`; deactivated + no solution + old/no tx → `delete`).
- **medium**: one axis ambiguous but the others outweigh (e.g. UK-property: suspended, no recent tests — but clear intent from the `uk-property-check` solution being in the catalogue as a suspended package, code present, recent capability-row touches → `suspend-add-yaml`).
- **low / needs-human-input**: two or more axes contradict, or a structural issue blocks the natural classification (singapore-company-data: deactivated capability depended on by active solutions; email-pattern-discover: mis-cohort'd in original audit and inconsistent lifecycle across solution and capability).

### 2.3 What was NOT queried

- User-level activity (which specific API key or agent invoked a capability): not needed for classification, would be needed for deprecation communications.
- x402 exposure (`x402_enabled`): not queried because none of the orphans are reasonably candidates for payment-gateway exposure right now — 4b.2 is upstream of that concern.
- Free-tier membership: all 32 orphans have `is_free_tier = false` per the evidence pass, confirmed during Step 2.

---

## 3. Cohort analysis

### 3.1 Active web3 — 17 slugs

All 17 capabilities share a stable pattern:

- `lifecycle_state = active`, `visible = true`, `is_active = true`
- `category = web3` (enum gap; see §1 item 1 and §6 item 1)
- `maintenance_class = free-stable-api` (12) or `pure-computation` (1 — `contract-verify-check`)
- Code present (`apps/api/src/capabilities/<slug>.ts` exists for all 17)
- Last test run within the last 6 days (typical: 2026-04-15 / 16, 100–280 total runs)
- 28–66 transactions ever, 1–6 in the last 7 days
- 15 of 17 referenced by at least one active web3 solution (`web3-*`)
- 2 of 17 — `ens-resolve` and `fear-greed-index` — stand without a current solution dependency, but are actively tested and seeing traffic (37 tx and 31 tx respectively). Both are self-contained primitives (ENS lookup, sentiment snapshot) that don't naturally compose into multi-step solutions.

**CC recommendation: all 17 → `yaml-generate` (high confidence)**.

All 17 look like straightforward Phase 4b.1-style backfill targets that didn't get a YAML simply because they were onboarded via a different path in late March 2026 (earliest `created_at: 2026-03-29`). Implementation must add `web3` to `VALID_CATEGORIES` first or every generated YAML fails the CI gate.

Notable slugs:
- `wallet-risk-score` — most-composed (5 solution refs). Highest downstream blast radius.
- `contract-verify-check` — only `pure-computation` orphan in the cohort; the rest are `free-stable-api` (Etherscan / DefiLlama / GoPlus Labs / ENS RPC).
- `ens-resolve` / `ens-reverse-lookup` — 2 slugs, 1 is heavily composed (3 solution refs), the other is not. Generate YAML for both symmetrically.

### 3.2 Suspended UK-property — 11 slugs (recategorised to 9 + 2)

Original audit cohort'd these as 11 UK-property caps, but the evidence shows that's slightly miscounted:

**9 true UK-property caps** (all reference `uk-property-check` solution):
`council-tax-lookup`, `stamp-duty-calculate`, `uk-crime-stats`, `uk-deprivation-index`, `uk-epc-rating`, `uk-flood-risk`, `uk-rental-yield`, `uk-sold-prices`, `uk-transport-access`.

All 9:
- `lifecycle_state = suspended`, but `is_active = true` (lifecycle vs is_active flag mismatch — flag `is_active` seems unused for gate purposes, `lifecycle_state` is authoritative)
- Code present
- Zero test runs, zero transactions — suspended before ever running
- Referenced by `uk-property-check` solution (itself `is_active=false`)
- Created 2026-04-11 (same day; this was a planned suspend-in-stasis onboarding cohort)

The cohort represents a coherent package waiting on a regulatory/business trigger; Phase 4b.2 should bring them inside the YAML model so if the suspension lifts, they have complete manifests for the pipeline. **All 9 → `suspend-add-yaml` (medium confidence)**. Medium rather than high because an alternative reading is "this is vapourware — delete until there's actual customer interest" — but the solution in the catalogue and the coherent data-source set argue for preservation.

**2 mis-cohort'd SDR caps**: `email-pattern-discover`, `officer-search`. 

Both:
- `lifecycle_state = suspended`, `is_active = true`
- Code present
- 1 test run each (created + tested once, then suspended)
- 1 transaction each (the test)
- Referenced by `company-intelligence-sdr` — an **active** solution

This is an inconsistency: an active solution contains steps pointing to suspended capabilities. The solution would either fail at execution or silently skip these steps. This is a second prod-state concern (alongside `singapore-company-data`, §3.3). Per prompt stop conditions, any active-solution → suspended-or-deactivated-capability dependency is a surface-not-auto-classify case. **Both → `needs-human-input` (low confidence)**. Petter must decide whether to:
- Reactivate the two capabilities so `company-intelligence-sdr` works end-to-end → `yaml-generate`
- Deactivate the two capabilities AND remove them from the solution (or deactivate the solution) → `delete` or `deprecate`
- Accept the inconsistency (maybe these are optional steps with graceful degradation) and `suspend-add-yaml`

### 3.3 Deactivated — 4 slugs (3 delete + 1 broken)

**3 clean deletes**: `amazon-price`, `hong-kong-company-data`, `indian-company-data`.

All 3:
- `lifecycle_state = deactivated`, `visible = false`, `is_active = false`
- Code present (from earlier onboarding) but unused at runtime
- Last test run / transaction in mid-March 2026 (6+ weeks ago)
- No solution references
- No recent activity

**All 3 → `delete` (high confidence)**. Standard cleanup pattern.

**1 broken / prod-state concern**: `singapore-company-data`.

- `lifecycle_state = deactivated`, `visible = false`, `is_active = false`
- **Referenced by 3 active solutions**: `invoice-verify-sg`, `kyb-complete-sg`, `kyb-essentials-sg`
- Last activity March 2026

Deleting `singapore-company-data` would violate the `solution_steps.capability_slug` FK (`onDelete: "restrict"` per [schema.ts:378](../apps/api/src/db/schema.ts#L378)). The FK would abort the DELETE. More importantly, the three solutions would break at runtime — any agent calling `invoice-verify-sg` or `kyb-complete-sg` or `kyb-essentials-sg` today would fail at the Singapore step.

This is an out-of-scope prod issue that 4b.2 can't resolve without Petter deciding: does Strale offer Singapore KYB, or not? If yes, the capability needs to be reactivated (needs a working data source — ACRA seems to have fallen over per the deactivation). If not, the three Singapore solutions need to be either removed from the catalogue or have their Singapore step replaced with a fallback.

**Recommendation: `needs-human-input` (low confidence)**. Deferred to Petter.

---

## 4. High-confidence recommendations (rubber-stamp batch)

Petter can batch-approve these 20 slugs without per-slug review:

**`yaml-generate` — 17 slugs (all active web3):**
approval-security-check, contract-verify-check, ens-resolve, ens-reverse-lookup, fear-greed-index, gas-price-check, phishing-site-check, protocol-fees-lookup, protocol-tvl-lookup, stablecoin-flow-check, token-security-check, vasp-non-compliant-check, vasp-verify, wallet-age-check, wallet-balance-lookup, wallet-risk-score, wallet-transactions-lookup.

**`delete` — 3 slugs:**
amazon-price, hong-kong-company-data, indian-company-data.

## 5. Needs-human-input — 3 slugs

| Slug | Ambiguity |
|---|---|
| `singapore-company-data` | Deactivated in `capabilities`; referenced by 3 **active** solutions (`invoice-verify-sg`, `kyb-complete-sg`, `kyb-essentials-sg`). Deletion is FK-blocked. Needs product decision on Singapore KYB offering. |
| `email-pattern-discover` | Suspended capability, referenced by active `company-intelligence-sdr` solution. Lifecycle inconsistent. Reactivate, remove from solution, or accept as optional step? |
| `officer-search` | Same inconsistency as email-pattern-discover — suspended capability referenced by active `company-intelligence-sdr` solution. Treat same as above. |

## 6. Medium-confidence recommendations

9 slugs — **`suspend-add-yaml`**: council-tax-lookup, stamp-duty-calculate, uk-crime-stats, uk-deprivation-index, uk-epc-rating, uk-flood-risk, uk-rental-yield, uk-sold-prices, uk-transport-access.

Rationale: UK-property suspended cohort, consistent with the `uk-property-check` (also suspended) solution. All 9 are in stasis waiting for a potential revival. Bringing them inside the YAML model means the suspend→reactivate path works through the normal pipeline. Alternative (`delete` + re-author later) is viable but loses the authored structural work that already exists in the DB row.

---

## 7. Risks and considerations

### 7.1 FK constraints block delete operations

`solution_steps.capability_slug` has `onDelete: "restrict"` on `capabilities.slug`. Any orphan with solution references **cannot be deleted** without first removing its solution steps. This affects:

- `singapore-company-data` (3 solutions) — delete blocked, deferred to human
- None of the other deactivated orphans (amazon-price, hong-kong-company-data, indian-company-data) have solution refs, so they can be safely deleted

The implementation prompt must check solution references at delete time and fail loudly if any are found — not silently skip.

### 7.2 `web3` category enum gap

All 17 web3 orphans have `category: web3`, but `VALID_CATEGORIES` in [onboarding-gates.ts:203-210](../apps/api/src/lib/onboarding-gates.ts#L203-L210) does not include `web3`. Generating YAML for these 17 with `category: web3` would fail the Phase 4b.1 manifest-completeness CI gate.

**Options** (implementation prompt decides):
- Add `web3` to `VALID_CATEGORIES` (1-line change; matches DB reality; low risk)
- Re-categorise each web3 capability to an existing category (e.g. `finance` or `data-extraction`) — loses the web3 grouping signal
- Add to VALID_CATEGORIES AND verify no downstream consumers (frontend catalog, search indexing, dashboard) treat the category as a fixed list that excludes `web3`

Recommendation: **add `web3` to the enum**, update `capability-field-authority.test.ts` if it asserts the enum contents, ship alongside the web3 YAML generation in Phase 4b.2 implementation. Blocker for the 17-slug batch.

### 7.3 `uk-property-check` solution is inactive

`uk-property-check` has `is_active=false`, matching its 9 suspended caps. No immediate call risk. But if `suspend-add-yaml` lands for the 9 capabilities without also resolving the solution's fate, the catalog ends up with "suspended solution, YAML-complete suspended caps" — coherent but adds a third state to track. Phase 4b.2 implementation should decide whether to reactivate the solution alongside the YAML-adds, or leave both suspended as a unit.

### 7.4 `company-intelligence-sdr` mixed-state solution

The solution is `is_active=true`, but 2 of its 9 steps (officer-search + email-pattern-discover) are suspended capabilities. Any agent calling the solution today would hit an error at those steps. Either the 2 caps shouldn't be suspended, the steps shouldn't be in the solution, or the solution shouldn't be active. Flagged for human decision above. Resolution should happen before Phase 4b.2 implementation, or in concert with it.

### 7.5 Code retention for deleted rows

Deleting the 3 clean-delete slugs from the DB leaves their TypeScript implementations (`apps/api/src/capabilities/<slug>.ts`) in the repo. Those files also register themselves via `registerCapability()` at module load — if they're not also deleted, the registration calls happen but route to no DB row (matched by slug), which should be a safe no-op but is worth verifying. Implementation prompt should delete the `.ts` files alongside the DB rows.

### 7.6 No snapshot for orphans (expected)

Per Phase 4b.1's Outcome C, the 32 orphans' `onboarding_manifest` column is NULL. Deletion doesn't have to touch that column. For `yaml-generate` and `suspend-add-yaml` targets, the implementation prompt should also run the snapshot step (`phase-4b1-snapshot-onboarding-manifest.ts` or equivalent) after generating YAML so the new rows match the 275-slug baseline.

---

## 8. Follow-up implementation prompt scope

Phase 4b.2 implementation (after Petter fills the CSV's `decision` column) should:

### 8.1 Pre-conditions

- All 3 `needs-human-input` slugs have a concrete decision filled in the CSV.
- The `web3` category decision is made (add to enum vs re-categorise) if any `yaml-generate` remains.

### 8.2 Action order

1. **Enum extension first** — add `web3` to `VALID_CATEGORIES` if any web3 `yaml-generate` remains. Ship as a separate small commit or folded into the generation commit. CI gate green after this or the next step fails.
2. **`yaml-generate` pass** — for each marked slug, run the extended `generate-manifests.ts` generator (scoped to the slug list) or the 4b.1 backfill-style script adapted for orphans. Review each output, commit in one batch.
3. **Snapshot pass** — run the 4b.1 snapshot script for the newly-YAMLd slugs so their `onboarding_manifest` column aligns with the 275-slug baseline.
4. **`suspend-add-yaml` pass** — same generator, but the YAMLs go in with `lifecycle_state` unchanged (still suspended).
5. **`deprecate` pass, if any** — likely won't apply here, but if Petter marks anything `deprecate`, implementation needs to: announce (via changelog or deprecation notice), set a sunset date, then eventually delete. Out of scope for this audit.
6. **`delete` pass (last)** — for each marked slug:
   - Verify no solution_steps reference (abort if any)
   - `DELETE FROM capabilities WHERE slug = ?`
   - Delete the TypeScript implementation file
   - Grep remaining code for any straggling references (`rg "<slug>"` in src/)

### 8.3 Rollback considerations per action

| Action | Rollback |
|---|---|
| `yaml-generate` | `git revert` the commit; deletes the new YAMLs |
| `suspend-add-yaml` | `git revert` same as above; lifecycle is DB-canonical per 4a so not touched |
| Enum extension | `git revert` removes `web3` from `VALID_CATEGORIES`; any YAML relying on it then fails the CI gate |
| `delete` | Capability row is gone from DB; only rollback is re-INSERT with same data. Capture pre-state in the commit body. TypeScript file rollback is `git revert`. |

### 8.4 Not in 4b.2 scope

- The broader solution-vs-capability-lifecycle consistency issue (singapore-company-data / company-intelligence-sdr mixed states) is a prod-correctness issue and deserves its own prompt with product-level input from Petter.
- Orphan resolution for any DB rows that appear after 4b.2 ships — this audit is a snapshot of 2026-04-21. Future orphan prevention is the 4b.1 CI gate's job.
- Phase 5 Cluster 2 tasks (F-B-003/F-B-004/F-B-012) remain separate.

---

## 9. References

- **Phase 4b audit** (`ec2a6aa`): `audit-reports/2026-04-20-phase-4b-audit.md` §4.13 (orphan identification)
- **Phase 4b.1 commit** (`6f79b1e`): ships the 275-slug backfill; orphans excluded
- **Schema**: [apps/api/src/db/schema.ts](../apps/api/src/db/schema.ts) — capabilities, solution_steps FK, test_results, transactions
- **CI gate**: [apps/api/src/lib/manifest-completeness.test.ts](../apps/api/src/lib/manifest-completeness.test.ts) (Phase 4b.1) — what a YAML must satisfy
- **Validators**: [apps/api/src/lib/onboarding-gates.ts](../apps/api/src/lib/onboarding-gates.ts) — `VALID_CATEGORIES` (L203), `validateManifest` (L401)
- **Evidence table**: [audit-reports/2026-04-21-phase-4b2-orphan-decisions.csv](2026-04-21-phase-4b2-orphan-decisions.csv) — 32 rows, per-slug evidence + CC recommendation, `decision` column for Petter
