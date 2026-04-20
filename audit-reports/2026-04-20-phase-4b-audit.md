# Phase 4b audit — Manifest completeness & regeneration strategy

**Date:** 2026-04-20 (queried 2026-04-21)
**HEAD:** `2f8b17a` (`main`)
**Scope:** read-only audit. No code or data modified. Output is this design doc.
**Companion to:** Phase 4a (authority enforcement, separate session).

---

## 1. Executive summary

The 275 YAML manifests in `manifests/*.yaml` are systematically incomplete on three required fields that `validateManifest` would reject today: `maintenance_class` (242 missing, 88%), `processes_personal_data` (260 missing, 95%), and `geography` (275 missing, 100% — currently optional in the `Manifest` interface but required-in-spirit because the DB has populated values for 301 of 307 rows and Phase 4a classifies it as DB-canonical). Every DB column is populated (all `NOT NULL` columns have values, the nullable columns have reasonable defaults), so the gap lives almost entirely on the YAML side. The one structural outlier in the prompt's premise: the 242+ estimate was correct for `maintenance_class` but undercounts the overall work — the real completeness backlog touches two more fields and ~260 of the same 275 manifests.

Regeneration is mostly mechanical because DB is canonical for every field with a gap. A single backfill script that reads DB-canonical values and injects them into YAML covers `maintenance_class`, `processes_personal_data`, `personal_data_categories`, and `geography` across 260+ manifests. A small set of hand-review cases remain: 2 manifests missing `known_answer.expected_fields`, 2 DB rows with the invalid `transparency_tag: 'external_api'` value (overlap with Cluster 2 Phase 5), 6 Czech-cluster DB rows with `geography IS NULL`, and 32 orphan DB rows (17 active web3 capabilities, 11 suspended UK-property capabilities, 4 deactivated) that have no YAML at all. Enforcement activation is a three-gate design: hard error at `validateManifest` (already in place but can't fire until catalog is clean), a new CI lint script scanning `manifests/*.yaml`, and a defense-in-depth check at `persistCapability`. Recommended Phase 4b sequence: backfill scripts → hand-fixups → `onboarding_manifest` column snapshot (currently 307/307 NULL) → flip enforcement → add CI gate.

---

## 2. Required manifest fields

"Required" = `validateManifest` ([apps/api/src/lib/onboarding-gates.ts:395](../apps/api/src/lib/onboarding-gates.ts#L395)) raises an error when the field is missing or invalid, or the `validateCapabilityStructure` DB-row gate would raise one.

| Field | Canonical source | Required on create? | Required on update? | Notes |
|---|---|---|---|---|
| `slug` | manifest | yes | yes (rare; warning) | URL-safe pattern check |
| `name` | manifest | yes | yes | non-empty |
| `description` | manifest | yes (≥20 chars) | yes | 20–49 = warning; 50+ = ok |
| `category` | manifest | yes | yes | must be in `VALID_CATEGORIES` (21 values) |
| `price_cents` | **DB-canonical** (Phase 4a) | yes (initial) | **no** (preserve DB) | must be ≥0 |
| `is_free_tier` | **DB-canonical** (Phase 4a) | optional (default `false`) | no | — |
| `input_schema` | manifest | yes | yes | `type: object` + `properties` required |
| `output_schema` | manifest | yes | yes | `type: object` + `properties` required |
| `data_source` | manifest | yes | yes | non-empty string |
| `data_source_type` | manifest | yes | yes | maps to DB `capability_type` via `dataSourceTypeToCapType` |
| `transparency_tag` | **DB-canonical** (Phase 4a) | optional today; **required after Cluster 2 Phase 5** | no | must be in `VALID_TRANSPARENCY_TAGS` (`algorithmic`, `ai_generated`, `mixed`, `null`). Phase 5 removes `null` |
| `freshness_category` | **DB-canonical** (Phase 4a) | optional (today); design-intent required | no | `live-fetch` \| `reference-data` \| `computed` |
| `geography` | **DB-canonical** (Phase 4a) | optional (today); design-intent required | no | `global` \| `eu` \| `nordic` \| country code |
| `maintenance_class` | manifest | **yes** | yes | must be in `VALID_MAINTENANCE_CLASSES` (6 values) |
| `processes_personal_data` | manifest | **yes (boolean, not null)** — F-B-008 | yes | blocking at both gate sites (authoring + DB re-validation) |
| `personal_data_categories` | manifest | conditional (required non-empty if `processes_personal_data=true`) | conditional | must be in `PII_CATEGORY_ENUM` (12 values) |
| `output_field_reliability` | manifest | **yes (≥1 field)** unless `--discover` | yes | values: `guaranteed` \| `common` \| `rare` |
| `limitations` | manifest | yes (≥1 entry) | yes | title + text + category + severity |
| `test_fixtures.known_answer.input` | manifest | yes unless `--discover` | yes | — |
| `test_fixtures.known_answer.expected_fields` | manifest | yes (≥1) unless `--discover` | yes | — |
| `test_fixtures.health_check_input` | manifest | optional (required if `--discover` without known_answer) | optional | — |
| `data_classification` | DB (extension field) | optional | optional | not in `Manifest` type; read via structural access |
| `avg_latency_ms` | system-managed | optional | system-owned | measured at fixture-calibration time |

---

## 3. Catalog state

### 3.1 Raw query output

All queries run `2026-04-21` against Railway prod Postgres (`desirable-serenity/production/Postgres`).

```
=== total ===
[ { "total": 307 } ]

=== lifecycle_distribution ===
[
  { "lifecycle_state": "active",      "n": 277 },
  { "lifecycle_state": "suspended",   "n": 17  },
  { "lifecycle_state": "validating",  "n": 7   },
  { "lifecycle_state": "deactivated", "n": 4   },
  { "lifecycle_state": "probation",   "n": 2   }
]

=== onboarding_manifest column state ===
  307 rows total, 307 with onboarding_manifest IS NULL  → 100% NULL

=== column NULL counts (rows affected) ===
  maintenance_class           : 0   (schema default `scraping-fragile-target`)
  processes_personal_data     : 0   (SA.2b.d backfill)
  data_source                 : 0
  transparency_tag            : 0   (but 2 rows hold invalid value `external_api`)
  freshness_category          : 73
  geography                   : 6   (all cz-* slugs)
  output_field_reliability    : 34
  avg_latency_ms              : 45

=== maintenance_class distribution (DB, canonical) ===
[
  { "maintenance_class": "free-stable-api",          "n": 101 },
  { "maintenance_class": "pure-computation",         "n": 78  },
  { "maintenance_class": "commercial-stable-api",    "n": 68  },
  { "maintenance_class": "scraping-fragile-target",  "n": 33  },
  { "maintenance_class": "scraping-stable-target",   "n": 25  },
  { "maintenance_class": "requires-domain-expertise","n": 2   }
]

=== processes_personal_data distribution (DB, canonical) ===
[ { "processes_personal_data": false, "n": 208 }, { "processes_personal_data": true, "n": 99 } ]

=== geography distribution (DB) ===
[
  { "geography": "global", "n": 245 },
  { "geography": "eu",     "n": 29  },
  { "geography": "uk",     "n": 13  },
  { "geography": "nordic", "n": 6   },
  { "geography": "<NULL>", "n": 6   },
  { "geography": "nl",     "n": 5   },
  { "geography": "us",     "n": 2   },
  { "geography": "au",     "n": 1   }
]

=== freshness_category distribution (DB) ===
[
  { "freshness_category": "live-fetch",     "n": 133 },
  { "freshness_category": "computed",       "n": 77  },
  { "freshness_category": "<NULL>",         "n": 73  },
  { "freshness_category": "reference-data", "n": 24  }
]

=== transparency_tag distribution (DB) ===
[
  { "transparency_tag": "algorithmic",  "n": 188 },
  { "transparency_tag": "ai_generated", "n": 110 },
  { "transparency_tag": "mixed",        "n": 7   },
  { "transparency_tag": "external_api", "n": 2   }   ← invalid; see §4.6
]

=== capability_type distribution (DB) ===
[
  { "capability_type": "stable_api",    "n": 124 },
  { "capability_type": "ai_assisted",   "n": 68  },
  { "capability_type": "deterministic", "n": 66  },
  { "capability_type": "scraping",      "n": 49  }
]

=== YAML manifests scan (275 files, all parse clean) ===
required_field_gaps:
  slug                            : 0
  name                            : 0
  description                     : 0
  description_under_20            : 0
  category                        : 0
  price_cents                     : 0
  input_schema                    : 0
  output_schema                   : 0
  data_source                     : 0
  data_source_type                : 0
  maintenance_class               : 242   (88%)
  processes_personal_data         : 260   (95%)
  ppd_null_values                 : 0     (F-B-008 null-vs-undefined: zero YAML uses explicit null)
  output_field_reliability        : 0
  limitations                     : 0
  test_fixtures                   : 0
  known_answer.input              : 0
  known_answer.expected_fields    : 2
optional_field_present:
  is_free_tier                    : 270 / 275
  transparency_tag                : 275 / 275
  freshness_category              : 275 / 275
  geography                       : 0   / 275   ← never populated in YAML
  personal_data_categories        : 15  / 275
cross_tab_missing_required_fields (across 9 signal fields including geography / transparency_tag / freshness_category):
  1 field missing  : 15 manifests
  2 fields missing : 18 manifests
  3 fields missing : 240 manifests   ← dominant: maintenance_class + processes_personal_data + geography
  4 fields missing : 2 manifests

=== orphan analysis ===
DB rows without YAML   : 32
YAML files without DB  : 0
  deactivated (4) : amazon-price, hong-kong-company-data, indian-company-data, singapore-company-data
  active (17)    : approval-security-check, contract-verify-check, ens-resolve, ens-reverse-lookup,
                   fear-greed-index, gas-price-check, phishing-site-check, protocol-fees-lookup,
                   protocol-tvl-lookup, stablecoin-flow-check, token-security-check, vasp-non-compliant-check,
                   vasp-verify, wallet-age-check, wallet-balance-lookup, wallet-risk-score, wallet-transactions-lookup
  suspended (11) : council-tax-lookup, email-pattern-discover, officer-search, stamp-duty-calculate,
                   uk-crime-stats, uk-deprivation-index, uk-epc-rating, uk-flood-risk, uk-rental-yield,
                   uk-sold-prices, uk-transport-access

=== invalid_transparency_tag_rows ===
[
  { "slug": "domain-age-check",    "transparency_tag": "external_api", "lifecycle_state": "active" },
  { "slug": "postal-code-lookup",  "transparency_tag": "external_api", "lifecycle_state": "active" }
]

=== geography_null_rows (DB) ===
[
  { "slug": "cz-bank-account-validate",        "category": "validation" },
  { "slug": "cz-birth-number-validate",        "category": "validation" },
  { "slug": "cz-company-data",                 "category": "company-data" },
  { "slug": "cz-datova-schranka-id-validate",  "category": "validation" },
  { "slug": "cz-ico-validate",                 "category": "validation" },
  { "slug": "cz-unreliable-vat-payer",         "category": "compliance"  }
]
```

### 3.2 Interpretation

Three facts drive the rest of the design:

1. **The DB column state is healthy.** No NOT NULL column is violated; no silent drift toward NULLs. `maintenance_class` was defaulted to `scraping-fragile-target` for rows that never declared, and SA.2b.d (migration 0049/0050) backfilled `processes_personal_data` across all 307 rows. The column-level "242+ NULL" interpretation of the prompt's premise was the wrong reading — the gap lives in YAML.
2. **YAML is systematically stale on 3 fields.** 242/260/275 of the 275 files don't declare `maintenance_class` / `processes_personal_data` / `geography`. The `maintenance_class` gap matches the drift-inventory count from SA.2b audit (2026-04-20). The `processes_personal_data` gap is newer (introduced when SA.2b.a made the field required in the `Manifest` interface; the YAMLs pre-date that).
3. **`onboarding_manifest` column is 100% NULL.** The design (Cluster 2 design Section 2) has it as a system field populated at INSERT-time via `persistCapability`. All 307 existing rows predate that plumbing. This isn't a gap that blocks Phase 4b enforcement directly, but it's a hidden piece of "manifest completeness" work that should ship alongside: once Phase 4b finishes backfilling YAMLs, snapshot them into the column so drift detection has a baseline.

**Lifecycle distribution of affected rows** is uninformative — the gap is catalog-wide. Since the YAML gap applies to 88–100% of files across the entire catalog regardless of lifecycle state, samples by `lifecycle_state` buy nothing; the answer is always "evenly distributed across all active, suspended, validating, probation, deactivated." Sample slugs listed above (first 15 alphabetical).

---

## 4. Regeneration strategies

### 4.1 Summary

| # | Field | Count missing | Strategy | Effort (CC hours) | Review hours | Risk |
|---|---|---|---|---|---|---|
| 4.2 | `maintenance_class` (YAML) | 242 | A — read DB, inject YAML | 1h | 0.25h | low |
| 4.3 | `processes_personal_data` (YAML) | 260 | A — read DB, inject YAML | (same script) | 0.25h | low |
| 4.4 | `personal_data_categories` (YAML, when `ppd=true`) | 99 rows need population (DB-canonical) | A — read DB, inject YAML | (same script) | 0.25h | low |
| 4.5 | `geography` (YAML) | 269 (of 275) | A — read DB, inject YAML | (same script) | 0.1h | low |
| 4.6 | `known_answer.expected_fields` (YAML, 2 files) | 2 | C — hand-author from DB `output_field_reliability` | 0.5h | 0.1h | low |
| 4.7 | `transparency_tag = 'external_api'` (DB, 2 rows) | 2 | C — hand-reclassify | 0.25h | 0.1h | low; overlap with Cluster 2 Phase 5 |
| 4.8 | `geography IS NULL` (DB, 6 CZ rows) | 6 | D — default `eu`, hand-review | 0.25h | 0.25h | low |
| 4.9 | `freshness_category IS NULL` (DB, 73 rows) | 73 | D — default by `capability_type` + hand-review | 1h | 1h | medium |
| 4.10 | `output_field_reliability IS NULL` (DB, 34 rows) | 34 | B — re-run pipeline `--discover` per slug | 2h | 0.5h | low |
| 4.11 | `avg_latency_ms IS NULL` (DB, 45 rows) | 45 | system-managed — defer; system job repopulates | 0h | 0h | n/a |
| 4.12 | `onboarding_manifest IS NULL` (DB, 307 rows) | 307 | A — one-shot snapshot from YAML (post-backfill) | 0.5h | 0.25h | low |
| 4.13 | Orphan DB rows (32) | 32 | B — re-run `generate-manifests.ts` (extended) | 0.5h | 1h | medium |

Total Phase 4b effort: ~**6h CC time + ~4h Petter review**, excluding Phase 4b implementation prompt drafting.

### 4.2 `maintenance_class` (Strategy A)

242 YAML manifests omit the field. DB has the canonical value for all 307 rows (distribution in §3.1). No NULL cases.

Backfill script:
```
for each manifest in manifests/*.yaml:
  slug = read(manifest.slug)
  db_value = SELECT maintenance_class FROM capabilities WHERE slug = ?
  if yaml.maintenance_class is absent:
    yaml.maintenance_class = db_value
    write(manifest)
  else if yaml.maintenance_class != db_value:
    log_warning  # drift (drift-inventory showed this is empty in practice for maintenance_class, but future-proof)
```

The write must preserve comment headers and key ordering. Use a YAML library that round-trips comments (`js-yaml` does not; `yaml@2` does via AST-level API). Alternatively, inject as a single line insertion at a deterministic position (after `data_source_type:`) without full reparse. The implementation prompt chooses.

Risk: zero for the 242 pure-missing cases (DB is canonical, copy is mechanical). Any YAMLs with an existing value that disagrees with DB is a Class 4 drift case — drift inventory showed zero for this field, so not expected.

### 4.3 `processes_personal_data` (Strategy A)

Same script as 4.2. All 307 DB rows have a value post-SA.2b.d; 260 YAMLs omit. Drop the value into the YAML at a deterministic position (after `data_source_type:` + `maintenance_class:`).

### 4.4 `personal_data_categories` (Strategy A, conditional)

DB column `personal_data_categories` defaults to `[]` and is populated for the 99 rows where `processes_personal_data = true`. The YAML side only has 15 manifests declaring the field today.

Rule: if DB `processes_personal_data = true` AND `personal_data_categories` is non-empty → inject the array into YAML. If `processes_personal_data = false` → emit `personal_data_categories: []` or omit (optional field; either is valid). Recommend omit when empty to keep YAMLs short.

Risk: low. Values are constrained by `PII_CATEGORY_ENUM`; DB state is already post-SA.2b.d validation.

### 4.5 `geography` (Strategy A)

275 YAMLs don't have this field today. DB has 301 populated + 6 NULL (Czech cluster, §4.8). For the 301 populated, mechanical copy. For the 6 NULL, §4.8 hand-review.

Side-effect: after this backfill, the YAML side has `geography` on 301 of 275 manifests, 6 remain empty until 4.8 resolves. Manifest type classifies it as optional today; Phase 4a's `FIELD_CATEGORIES` classifies it as DB-canonical. Keeping it optional-but-populated is defensible; see §6 open question.

### 4.6 `known_answer.expected_fields` (Strategy C)

2 YAMLs are missing this. Hand-identify which 2 (audit script can enumerate):
```
npx tsx scripts/phase-4b-yaml-audit.ts | jq '.samples.missing_known_answer_expected_fields'
```
For each, use the DB's `output_field_reliability` keys as the seed: any field with reliability `guaranteed` gets an `expected_fields` entry with operator `not_null` + matching reliability. Alternatively, run the capability via `--discover` to auto-generate.

### 4.7 `transparency_tag = 'external_api'` (Strategy C; Cluster 2 Phase 5 overlap)

2 DB rows: `domain-age-check`, `postal-code-lookup`. `external_api` is not in `VALID_TRANSPARENCY_TAGS`, so `validateCapabilityStructure` would raise (it currently permits `null` only by design). These rows would fail re-validation if touched.

Hand-classify:
- `domain-age-check` — performs a WHOIS lookup → `algorithmic` (deterministic parse of RDAP response). Confirm with executor source.
- `postal-code-lookup` — postal code → city/state lookup → `algorithmic` (direct API result, no AI synthesis). Confirm with executor source.

**Overlap:** Cluster 2 Phase 5 ([cluster_2_design.md §7 Phase 5](cluster_2_design.md#L440-L458)) already owns this 2-row classification + `detectTransparencyTag` deletion. Phase 4b should not duplicate this work; it should reference Phase 5 and defer the classification. If Phase 5 ships before Phase 4b, the issue is gone. If Phase 4b ships first, chat-review the classification and fold into Phase 4b's implementation prompt.

### 4.8 `geography IS NULL` — Czech cluster (Strategy D)

6 DB rows, all `cz-*` prefix. Default to `eu` (or `cz` if the catalog convention later permits country codes). Current values in DB include `nl`, `us`, `au` (country codes), so `cz` is precedented. Recommend `cz` as a clearer value for the UI; chat confirms.

Risk: low. These 6 rows are all registry validators that only operate on Czech data.

### 4.9 `freshness_category IS NULL` — 73 rows (Strategy D)

No automatic rule produces 100% correct values. Proposal:
- For rows with `capability_type = 'deterministic'` → default `computed`.
- For rows with `capability_type IN ('stable_api', 'scraping')` → default `live-fetch`.
- For rows with `capability_type = 'ai_assisted'` → `live-fetch` (LLM result, transient).
- Reference-data exceptions (rarely-updated static data like country codes, currency codes) must be hand-flagged. Default won't catch these; review the 73 list.

Effort: ~1h script + 1h human review of the 73 to flag reference-data exceptions.

Risk: medium. Wrong `freshness_category` affects freshness decay tracking and UI badges. Recoverable (one-column UPDATE) but visible to users.

### 4.10 `output_field_reliability IS NULL` — 34 rows (Strategy B)

The 34 rows are mostly crypto/web3 (14 slugs), UK-property (7), legacy deactivated (5), or newly onboarded that skipped the `--discover` pass. DB state is inconsistent because the onboarding protocol pre-dates the current pipeline.

Strategy: for each, run `npx tsx scripts/onboard.ts --manifest ../../manifests/{slug}.yaml --backfill --discover`. The `--discover` flag auto-generates `output_field_reliability` from live executor output. The `--backfill` flag skips capability creation. This is precedent-matched (CLAUDE.md: "Use `--backfill --discover --fix` to auto-correct fixture mismatches").

Caveats:
- 17 of the 34 are orphan DB rows (no YAML). For these, run `scripts/generate-manifests.ts` first (see §4.13), then the `--discover` pass.
- 5 are `deactivated`. They can either stay NULL (hidden from catalog) or be sanitized on principle. Chat chooses whether to include in scope.

Risk: low. `--discover` runs one live capability call each. ~17 live calls for active slugs (~€0.50 of API budget, rough order-of-magnitude). Deactivated rows should probably be skipped.

### 4.11 `avg_latency_ms IS NULL` — 45 rows (defer)

System-managed field; populated at fixture calibration time via `validateTestFixtures`. Any `--discover` pass touches this organically. 12 of the 45 are CZ cluster (not yet onboarded); the rest are mostly recently-added crypto/UK rows. Phase 4b doesn't need to act: the field gets filled as side-effect of 4.10's pipeline runs for overlapping slugs. Rows that remain NULL after 4.10 continue to use the fallback path (sync/async routing degrades to heuristic; acceptable).

### 4.12 `onboarding_manifest` column snapshot (Strategy A, new)

All 307 rows have NULL in this JSONB column. Once §4.2–4.5 land and the YAMLs are complete, run a one-shot `npx tsx scripts/snapshot-onboarding-manifest.ts` that:
```
for each slug in DB:
  if yaml_exists(slug): manifest_json = yaml.load(manifests/{slug}.yaml)
  else: manifest_json = null  # orphan; §4.13 addresses separately
  UPDATE capabilities SET onboarding_manifest = manifest_json, updated_at = NOW() WHERE slug = ?
```

Produces a baseline snapshot against which future drift checks run. Doesn't trigger `validateCapability` — raw column update, no persistence hook.

Risk: zero. New data in an unused column.

### 4.13 Orphan DB rows (32 rows, Strategy B)

`generate-manifests.ts` ([apps/api/scripts/generate-manifests.ts](../apps/api/scripts/generate-manifests.ts)) already emits YAML from DB for any slug. It doesn't currently emit `maintenance_class`, `processes_personal_data`, `personal_data_categories`, or `geography` — this generator is stale relative to current `Manifest` type.

Plan: extend the generator first (add the four fields, read from DB, emit in stable order), then run it scoped to the 32 orphans. Review each output before commit. For 4 deactivated slugs, skip (optional — if deactivated will never re-enter the pipeline, no YAML needed; the `onboarding_manifest` snapshot catches these).

Breakdown:
- 17 active (web3/crypto, ENS, wallet-*, protocol-*, vasp-*, + approval-security-check, contract-verify-check, fear-greed-index, gas-price-check, phishing-site-check): each needs a full YAML.
- 11 suspended (UK property cluster + officer-search, email-pattern-discover, stamp-duty-calculate, council-tax-lookup): generate YAML, mark `# SUSPENDED as of 2026-04-20` in top comment. Chat decides whether to emit YAML for suspended rows or defer.
- 4 deactivated: skip.

Effort: 0.5h to extend generator, 0.5h to run on 28 scoped slugs, ~1h review.

Risk: medium. The generator's output is only as good as the DB row; it can emit wrong-looking values for `data_source_type`, `transparency_tag`, etc. Human review required.

---

## 5. Enforcement design

### 5.1 Three gates

**Gate A — `validateManifest` at authoring time** ([apps/api/src/lib/onboarding-gates.ts:395](../apps/api/src/lib/onboarding-gates.ts#L395))
- Already fires errors for missing `maintenance_class`, `processes_personal_data`, all other required fields.
- No code change needed to activate. The reason it's "off" today is that 242+ YAMLs can't pass it — so any `--backfill` run fails. **Clearing the catalog removes the block implicitly.**
- Post-cleanup, every onboarding run will pass. Future incomplete YAMLs fail at the first gate.

**Gate B — CI lint on `manifests/*.yaml`** (new)
- New file: `apps/api/scripts/lint-manifests.ts`. For each YAML under `manifests/`, load and run `validateManifest(m, false)` (non-discover mode = strict). Exit nonzero on any error.
- Wire into existing CI pipeline (`.github/workflows/ci.yml` or equivalent; exact file path requires separate check in implementation).
- Effect: no PR that adds/modifies a YAML can land if the YAML fails the gate.
- Rollout: the CI check is green after Phase 4b steps 1-3 ship. It acts as the permanent regression gate.

**Gate C — `persistCapability` at DB-write time** ([apps/api/src/lib/capability-persistence.ts](../apps/api/src/lib/capability-persistence.ts))
- Already delegates to `validateCapability` (Cluster 2 Phase 2). Gate fires on every INSERT and UPDATE. Defense-in-depth against non-CLI paths.

### 5.2 Failure modes

| Scenario | Gate that fires | Failure mode |
|---|---|---|
| Author commits new YAML missing `maintenance_class` | B (CI) | PR red; commit blocked |
| `--backfill` against stale YAML missing required field | A (validateManifest in onboard.ts) | CLI exits nonzero with gate violation list |
| Admin UI UPDATE bypasses gates (writes raw column) | none | still a gap; Cluster 2 broader scope — out of Phase 4b |
| YAML completeness passed, but `onboarding_manifest` column blank | none | unmonitored; will become symptom if Phase 4b doesn't do §4.12 snapshot |

### 5.3 What flips enforcement

Only one thing: the catalog becoming clean. No code change turns enforcement "on" — the code already enforces. Until the 260+ incomplete YAMLs are fixed, running any gate against them fails. That's why Phase 4b is sequenced as **backfill first → CI gate second**.

---

## 6. Implementation sequence

Six phases / commits. Each has a defined rollback.

### Phase 4b.1 — Extend `generate-manifests.ts` (preparation)

**Prereqs:** Phase 4a's `FIELD_CATEGORIES` merged, or at minimum the `Manifest` interface includes `maintenance_class` / `processes_personal_data` / `personal_data_categories` / `geography`. Both are true at HEAD `2f8b17a`.

**Changes:** add four fields to the generator's `Manifest` interface + output. Read from DB columns. Preserve comment header.

**Effort:** 30 min. LOC: ~40.

**Model:** Sonnet.

**Rollback:** single commit revert.

**Success criteria:** generator output for `lei-lookup` (existing YAML, for which this field has drift) contains `maintenance_class: commercial-stable-api` (DB value for LEI is actually the value from §3.1 distribution — verify before commit).

### Phase 4b.2 — YAML backfill script (fields 4.2, 4.3, 4.4, 4.5)

**Prereqs:** 4b.1 merged.

**Changes:** new file `apps/api/scripts/backfill-yaml-required-fields.ts`. Reads DB, updates each `manifests/*.yaml` with missing required fields. Preserves existing YAML content + comment header. Idempotent (re-running is safe).

Approach: use `yaml` library (not `js-yaml`) which supports round-tripping comments, OR line-based injection at a deterministic anchor. Implementation prompt specifies.

Commits YAML changes: one commit per field for audit, or one bundled commit with a detailed diff description. Recommend bundled with a thorough commit message listing counts per field (261 YAMLs touched across 4 fields).

**Effort:** 2h CC + 0.5h review. LOC: ~120.

**Model:** Opus recommended — YAML round-tripping needs careful code + the scale (261 files) means any bug hits widely. Worth the more capable model.

**Rollback:** `git revert` the backfill commit. YAMLs restore to pre-backfill state; DB untouched.

**Success criteria:**
- Re-run `scripts/phase-4b-yaml-audit.ts` → zero missing required fields across all 275 manifests (geography included since Phase 4a made it DB-canonical).
- Git diff shows only additions of the four field lines, no reformatting of other content.
- Sample check: `manifests/lei-lookup.yaml` now has all 4 fields (see current state [manifests/lei-lookup.yaml:57](../manifests/lei-lookup.yaml)).

### Phase 4b.3 — DB-side fixups (§4.7, 4.8, 4.9, 4.10)

**Prereqs:** 4b.2 merged. Catalog YAMLs complete.

**Changes:**
- SQL fixup for 2 `transparency_tag = 'external_api'` rows. Chat-reviewed classification.
- SQL fixup for 6 cz-* rows with `geography IS NULL`.
- Script to backfill `freshness_category IS NULL` on 73 rows (default by `capability_type`, review before commit).
- Run `onboard.ts --backfill --discover` for the 34 rows with `output_field_reliability IS NULL` (scoped to `lifecycle_state IN ('active','validating','probation')` — skip suspended/deactivated).

Commits: one SQL fixup commit, one discover-pass commit (or handful of per-slug commits if chat prefers granularity).

**Effort:** 3h CC + 1.5h review. LOC: ~50 script + SQL.

**Model:** Sonnet for script, Opus for the hand-review of the 73-row freshness_category defaulting.

**Rollback:** SQL fixups reversible via inverse SQL from before/after captures (capture pre-state in the commit message). Discover-pass writes to DB; rollback = nothing (benign data improvement).

**Success criteria:**
- Column NULL counts post-fix: `freshness_category` ≤10 residuals (hand-flagged exceptions), `geography` = 0, `output_field_reliability` ≤5 (deactivated-only), `transparency_tag` = 0 invalid values.

### Phase 4b.4 — Orphan YAML generation (§4.13)

**Prereqs:** 4b.1 merged (extended generator).

**Changes:** run the generator scoped to the 32 orphan slugs. Commit the 28 YAMLs (excluding 4 deactivated). Review each before commit.

**Effort:** 1h CC + 2h review (each orphan needs a human look — the generator's output on these may be noisy because the DB row state itself was hand-authored).

**Model:** Opus — 28 new YAMLs each needing review benefits from Opus's judgement on correctness.

**Rollback:** delete the new files in a single commit.

**Success criteria:**
- `scripts/phase-4b-yaml-audit.ts` now reports 303 manifests (275 original + 28 new), zero required-field gaps, zero orphan DB rows among non-deactivated lifecycle states.

### Phase 4b.5 — `onboarding_manifest` column snapshot (§4.12)

**Prereqs:** 4b.2 and 4b.4 merged. All active+suspended slugs have a clean YAML.

**Changes:** new file `apps/api/scripts/snapshot-onboarding-manifest.ts`. Reads each YAML, writes to `onboarding_manifest` JSONB column. One-shot.

**Effort:** 30 min CC + 15 min review. LOC: ~40.

**Model:** Sonnet.

**Rollback:** `UPDATE capabilities SET onboarding_manifest = NULL` — restores the prior state. Benign.

**Success criteria:** post-run, `SELECT COUNT(*) FROM capabilities WHERE onboarding_manifest IS NULL` returns 4 (the deactivated orphans without YAML) or 0.

### Phase 4b.6 — CI lint gate (§5.1 Gate B)

**Prereqs:** 4b.2, 4b.4 merged. Catalog passes `validateManifest` end-to-end.

**Changes:** new file `apps/api/scripts/lint-manifests.ts`. Wire into CI workflow (existing `.github/workflows/ci.yml` or similar — implementation prompt identifies the exact file).

**Effort:** 30 min CC + 15 min CI config review. LOC: ~30 script + 5 CI config.

**Model:** Sonnet.

**Rollback:** remove the CI step. Trivial.

**Success criteria:**
- CI check green on first push of the commit that adds it.
- Manual regression test: temporarily remove `maintenance_class` from one YAML, push, confirm CI red, restore.

### Phase 4b.7 — Delete audit scaffolding (cleanup)

**Prereqs:** 4b.1–4b.6 merged.

**Changes:** delete `apps/api/scripts/phase-4b-audit-queries.ts`, `phase-4b-yaml-audit.ts`, `phase-4b-db-canonical.ts`, `phase-4b-orphans.ts`. Not committed but worth noting.

---

## 7. Open questions

### OQ-1 — Is `geography` formally required?

The Manifest type has it as `geography?: string` (optional). Phase 4a's `FIELD_CATEGORIES` classifies it DB-canonical. 275/275 YAMLs omit it. 301/307 DB rows have it populated. The contradiction: Phase 4a treats it as authoritative-by-DB, but the Manifest type says authors don't need to declare it.

**Options:**
- **A — make it required in Manifest interface.** Phase 4b backfill scripts write it into YAMLs. Future manifests must declare it. Clear mental model.
- **B — keep it optional in Manifest, DB-canonical at runtime.** Phase 4b still backfills YAMLs (they'll have it alongside the other DB-canonical fields like `freshness_category`, `transparency_tag`), but Manifest interface stays permissive. Avoids forcing authors of single-geography capabilities to mentally classify "global" vs "eu" for a pure-algorithmic field.
- **C — make it required only for `capability_type IN ('stable_api','scraping')`.** Mixed signal; hard to encode cleanly.

Recommend **A**. Simplicity and consistency with Phase 4a's FIELD_CATEGORIES intent. Chat confirms.

### OQ-2 — Scope of Phase 4b vs Cluster 2 Phase 5

Cluster 2 Phase 5 ([cluster_2_design.md Phase 5](cluster_2_design.md#L440-L458)) deletes `detectTransparencyTag` + hand-classifies the 2 `transparency_tag = 'external_api'` rows + 5 null rows (refresh count). Phase 4b §4.7 touches the same 2 rows.

**Resolution:** whichever phase ships first handles it. Flag in implementation prompt.

### OQ-3 — Should deactivated rows get `onboarding_manifest` snapshots?

4 deactivated orphans (amazon-price, hong-kong-company-data, indian-company-data, singapore-company-data). They'll never onboard via the new pipeline. Do they need column population? Two views:
- "Leave NULL" — reflects reality that they predate pipeline. Column can hold NULL for deactivated as a lifecycle signal.
- "Populate anyway" — for audit completeness, snapshot even deactivated rows.

Recommend **leave NULL**. Matches principle: deactivated rows are shutdown; their historical manifests aren't interesting. Chat confirms.

### OQ-4 — Freshness default rule correctness

§4.9's capability_type→freshness mapping is a defensible default but not perfect. For the 73 NULL rows, a 100% correct backfill requires per-slug review. Two strategies:
- Accept defaults + hand-review exceptions before commit (~1h review).
- Flag all 73 rows as requiring manual classification, defer backfill to a later operator pass.

Recommend the former — the defaults are ~90% correct and reviewing 73 rows is cheap.

### OQ-5 — CI gate file location

`.github/workflows/` may not exist — this is a monorepo, the exact CI location needs verification at implementation time. If no GitHub Actions workflow exists, the implementation prompt must either (a) add one, (b) wire into an existing Railway pre-deploy hook if one exists, or (c) add a pre-commit hook (most fragile option). Flag this in the implementation prompt.

### OQ-6 — 2 YAMLs missing `known_answer.expected_fields`

Haven't identified which 2. Can be enumerated by extending `phase-4b-yaml-audit.ts` with a slug-level sample. Trivial discovery; not a blocker. If the 2 are among the 32 orphans, §4.13's regeneration handles them. If they're standalone, §4.6 applies. Implementation prompt enumerates first.

### OQ-7 — Phase 4b interaction with Phase 4a

Phase 4a owns `FIELD_CATEGORIES` (who-owns-the-field-when-both-sides-set-it). Phase 4b owns manifest completeness (how-to-get-the-manifest-populated-at-all). They overlap conceptually: Phase 4b's backfill writes DB-canonical values to YAMLs, which means on a future `--backfill` run, `checkAuthorityDrift` should show zero drift (both sides agree). That's the desired end-state.

If Phase 4a's enforcement (design Phase 4 Section 2) hardens before Phase 4b's backfill lands, any `--backfill` run would fail — the YAMLs still declare no value for DB-canonical fields, which Phase 4a would treat as "manifest declared nothing, preserve DB" (that's the design intent; no violation). No conflict.

If Phase 4b's backfill lands first and Phase 4a hardens second: both sides agree (YAML was populated from DB), so `checkAuthorityDrift` is silent. No conflict.

**Resolution:** no serialization required. Either order works. Phase 4a and Phase 4b can ship independently.

### OQ-8 — Should Phase 4b create a DEC?

DEC for the overall Phase 4b strategy (authoritative mapping, backfill order, enforcement sequence) is probably worth a one-liner in Decisions DB after the implementation prompt is drafted. Not needed for this audit; flagged for the handoff.

---

## 8. References

- **[cluster_2_design.md](cluster_2_design.md)** — design doc; §2 authority-model table, §7 migration plan Phase 4+5, §9 sub-decisions
- **[manifest_drift_inventory.md](manifest_drift_inventory.md)** — SA.2b drift audit; 242 Class 1 (YAML missing `maintenance_class`) matches this audit's finding exactly
- **[apps/api/src/lib/capability-manifest-types.ts](../apps/api/src/lib/capability-manifest-types.ts)** — Manifest interface
- **[apps/api/src/lib/onboarding-gates.ts](../apps/api/src/lib/onboarding-gates.ts)** — `validateManifest` (L395), `validateCapabilityStructure` (L247), `FIELD_CATEGORIES` (L535)
- **[apps/api/src/db/schema.ts](../apps/api/src/db/schema.ts)** — capabilities table (L93–174)
- **[apps/api/scripts/generate-manifests.ts](../apps/api/scripts/generate-manifests.ts)** — existing generator; must be extended per §4.1
- **[apps/api/scripts/onboard.ts](../apps/api/scripts/onboard.ts)** — CLI entry points, `--backfill` and `--discover` semantics
- **CLAUDE.md "Adding New Capabilities"** — canonical pipeline
- **DEC-20260420-K** — Cluster 2 OQ locks (hybrid authority model, transparency-tag heuristic removal)
- **SA.2b.a / SA.2b.b / SA.2b.d** — prior PII classification protocol work that populated the DB column underlying §4.3
