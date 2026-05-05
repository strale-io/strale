# SA.2b.a — PII manifest declaration audit (F-A-003 + F-A-009) + F-A-004 closure check

**Date:** 2026-04-20
**HEAD:** `bec7edc66244927b056fa8274f417ab6f5197e48` (`main`)
**Working tree inside `apps/api/src/`:** clean
**Scope:** read-only audit for SA.2b.b implementation. No code modified. No commits.
**Findings source:** `SESSION_A_audit_findings.md` at repo root, tracked as of commit `5927bfb`.

## Tripwire check

| Tripwire | State |
|---|---|
| Working tree dirty inside `apps/api/src/` | Clean ✓ |
| HEAD at `bec7edc` or later | At `bec7edc` ✓ |
| Branch is `main` | Yes ✓ |
| `SESSION_A_audit_findings.md` located | Yes — repo root, tracked (`5927bfb`) |

**Plan-invalidating findings:** none. F-A-003 and F-A-009 have actionable, concrete text. Their implementation targets the same two files (`lib/audit-helpers.ts`, `routes/do.ts:2144`) and resolve into a single unit of work (manifest-declared PII classification). F-A-004 is fully closed by SA.2a.3b commit `bf059a8`; no carry-over.

**Escalation findings:** one — manifest backfill across **275 existing YAML manifests** exceeds what SA.2b.b can reasonably land in one session. Plan section 5 proposes a hybrid rollout (default-conservative + explicit-classify-top-N). Flagged as Open Question #3.

---

## Sub-report A — F-A-003 verbatim extract

From `SESSION_A_audit_findings.md` L81-91:

> ### F-A-003: `detectPersonalData` only checks output, never input — compliance claim is systematically wrong for input-PII capabilities
>
> - **Category**: Bug, Safety (compliance)
> - **Severity**: Medium
> - **Confidence**: High
> - **Location**: [apps/api/src/routes/do.ts:2143](apps/api/src/routes/do.ts#L2143), [apps/api/src/lib/audit-helpers.ts:40-45](apps/api/src/lib/audit-helpers.ts#L40-L45)
> - **What's wrong**: `buildFullAudit` computes `personalDataDetected = detectPersonalData(output)`. The helper checks output field names against a keyword list. Capabilities whose INPUT contains PII (pep-check with a person's name, email-validate with an email, sanctions-check with an individual, adverse-media-check, company-data lookups with beneficial-owner names, etc.) emit `personal_data_processed: false` when the output is a true/false verdict or a data structure with no PII keywords — even though the input was explicitly personal data. The `compliance.notes` field then says "No personal data detected. No DPIA required." which is factually wrong for multiple active capabilities.
> - **Why it matters**: DPIA requirement under GDPR Art. 35 is triggered by processing personal data at any stage, not just storing it in output. Advertising `personal_data_processed: false` on a pep-check audit that looked up a specific individual is a regulatory misrepresentation. Even if the DPIA assessment ultimately concludes "no DPIA required" for other reasons, that decision must be traceable — silently claiming no PII was processed removes the audit breadcrumb.
> - **Reproduction / evidence**: Run pep-check with input `{ full_name: "Angela Merkel" }`, then fetch the audit. `compliance.personal_data_processed` is `false`. No capability-level spot-check defeats this because `detectPersonalData` never sees the input.
> - **Suggested direction**: `detectPersonalData` should accept both input and output (or be called twice) and OR the results. Long-term, replace heuristic keyword matching with a per-capability declaration (a `processes_personal_data: boolean` field on the capability manifest). Several capabilities can be tagged confidently from their spec — kyb, pep, sanctions, address-lookup, email-validate, etc. all have known PII profiles.
> - **Related findings**: F-A-009 (broader quality concern with the heuristic).

Current state verified (today, 2026-04-20):
- `do.ts:2144` still reads `const personalDataDetected = detectPersonalData(output);` — unchanged.
- `audit-helpers.ts:40-45` still defines `export function detectPersonalData(output: unknown): boolean` — output-only.
- `do.ts:2171` emits `personal_data_processed: personalDataDetected`, `do.ts:2172` emits `personal_data_categories: [] as string[]` (always empty), `do.ts:2191-2193` emits `notes` based on the same boolean.

Finding is still open and fully live in prod.

---

## Sub-report B — F-A-009 verbatim extract

From `SESSION_A_audit_findings.md` L153-163:

> ### F-A-009: `detectPersonalData` heuristic is fragile — false positives and false negatives
>
> - **Category**: Bug
> - **Severity**: Low
> - **Confidence**: High
> - **Location**: [apps/api/src/lib/audit-helpers.ts:40-45](apps/api/src/lib/audit-helpers.ts#L40-L45)
> - **What's wrong**: The heuristic checks if any output field name contains any of `["name", "email", "phone", "address", "ssn", "date_of_birth", "person"]`. False positives: any field with "name" in it (capability's `entity_name`, product's `brand_name`, a wallet's `chain_name`) trips as PII. False negatives: `owner` (company-data), `beneficial_owner.*` (KYB), `individual.first`, `signatory` — none match. Output-only scan amplifies the problem (see F-A-003).
> - **Why it matters**: Combined with F-A-003, the `personal_data_processed` claim in every audit is unreliable in both directions. Compliance auditors can catch both kinds of errors; aggregate trust in the payload drops.
> - **Reproduction / evidence**: Read the function. Run `company-data` — output has `name` (company name) — gets tagged as PII (false positive). Run any capability with output shaped `{ beneficial_owner: {...} }` — no PII keyword match (false negative).
> - **Suggested direction**: Replace with per-capability declaration on the manifest: `processes_personal_data: boolean` and/or `personal_data_categories: string[]` (email, name, financial, etc.). Fallback heuristic can stay for defence in depth, but the manifest-declared value is authoritative. This aligns with the broader capability-manifest pattern already in use.
> - **Related findings**: F-A-003.

Current state verified: identical heuristic still live at `audit-helpers.ts:40-45`. No manifest-declared override exists anywhere.

**Relationship to F-A-003:** F-A-003 and F-A-009 are a single unit of work. F-A-003 is the missing-input-coverage bug; F-A-009 is the broader quality failure of the underlying heuristic. Both are resolved by the same refactor: declarative manifest field + optional fallback. This report treats them as one implementation.

---

## Sub-report C — F-A-004 verbatim extract + closure check

### Verbatim (L93-103):

> ### F-A-004: Audit claims `data_retention_days: 90` but transactions are retained for 3 years
>
> - **Category**: Bug, Safety (compliance)
> - **Severity**: Medium
> - **Confidence**: High
> - **Location**: [apps/api/src/routes/do.ts:2174](apps/api/src/routes/do.ts#L2174), [apps/api/src/lib/data-retention.ts:133-153](apps/api/src/lib/data-retention.ts#L133-L153)
> - **What's wrong**: `buildFullAudit` sets `compliance.data_retention_days: 90`. The actual retention policy in `data-retention.ts` purges `transactions` older than 3 years (`threeYearsAgo`, line 147-152). The 90 figure appears to be copied from `test_results` retention (`ninetyDaysAgo`, line 137). Every audit record therefore tells the data subject / auditor that their transaction will be deleted after 90 days; in practice it lives 12× longer.
> - **Why it matters**: Retention commitments are a core GDPR Art. 5(1)(e) requirement. Misstating retention by 12× is a concrete false claim — a user who relied on it to plan their data rights would be wrong. Reverse failure mode is also ugly: if someone tests Article 17 by requesting deletion after day 90 expecting auto-purge, the data is still there.
> - **Reproduction / evidence**: Read both files. Run a capability, fetch the audit; `compliance.data_retention_days` is `90`. Run `data-retention.ts` against a transaction 91 days old; it's not deleted. Both statements are in the committed code.
> - **Suggested direction**: Change `data_retention_days: 90` to `1095` (3 years) in `buildFullAudit` / `buildFailureAudit`, and the same field in solution-execute's `buildInlineAudit` if present. Consider deriving the value from a constant in `data-retention.ts` to prevent future drift. Also flag the `legal_hold` exemption — transactions with that flag are retained indefinitely and the audit should note the exemption condition.
> - **Related findings**: F-A-001.

### Closure check (verified today):

| Claim | Status | Evidence |
|---|---|---|
| `TRANSACTION_RETENTION_DAYS` exists in `lib/data-retention.ts` | ✓ | Exported at L5-L14, value `1095` |
| `routes/do.ts` imports the constant | ✓ | L26 imports `TRANSACTION_RETENTION_DAYS` (per SA.2a.3b B2) |
| `routes/do.ts:2175` uses the constant (not the literal 90) | ✓ | `data_retention_days: TRANSACTION_RETENTION_DAYS` |
| Sweep at `lib/data-retention.ts:148-149` uses the constant | ✓ | `threeYearsAgo.setDate(threeYearsAgo.getDate() - TRANSACTION_RETENTION_DAYS)` |
| `buildFailureAudit` (`do.ts:~2201`) emits same field? | ⚠ doesn't emit | `buildFailureAudit` returns a simpler shape without the `compliance.data_retention_days` field (read do.ts:2201-2240). No mismatch possible because the field doesn't exist there. |
| `buildInlineAudit` in `solution-execute.ts:379` emits same field? | ⚠ doesn't emit | Returns `{requestContext, solutionSlug, steps, stepsSucceeded, stepsFailed, totalLatencyMs, refunded}` only. No `compliance` block. No retention claim. |
| x402 `recordX402Transaction` emits same field? | ⚠ doesn't emit | No `compliance` block in x402 audit shape. |
| Other retention-days surfaces in the repo | grep clean | Only API hit is `do.ts:2175`; all other hits are in seed data for capability limitation text (`seed-limitations.ts`), the retention-job interval constants (non-claims), SESSION_A / audit-reports markdown. **No external distribution surface claims a retention number.** |
| `legal_hold` exemption claim in the audit payload | ⚠ **still absent** | The original F-A-004 suggestion included "Also flag the `legal_hold` exemption" in the audit payload. That sub-suggestion was not implemented by SA.2a.3b. |

### Conclusion

**F-A-004 is substantially closed.** The 90→1095 fix landed in `bf059a8`; the retention claim is now sourced from a constant, matches the sweep, and the DELETE endpoint (SA.2a.3b B1) is now live.

**One small residue:** the suggested legal_hold disclosure was not added. A user whose transaction has `legal_hold = true` sees `data_retention_days: 1095` today; the correct claim would be "1095 days OR indefinite if legal hold applies." Low-severity compliance precision issue. Not in scope for SA.2b.b unless chat wants to bundle (see Open Question #4). Does not constitute an "open F-A-004"; the core misstatement is fixed.

---

## Sub-report D — Current state of capability manifests

### Shape

- **Format:** YAML files at `manifests/*.yaml` (repo root). **275 manifests total** (`ls manifests/*.yaml | wc -l`).
- **Canonical fields** (sampled from `pep-check.yaml`, `dns-lookup.yaml`, `swedish-company-data.yaml`):
  - `slug`, `name`, `description`, `category`, `price_cents`, `is_free_tier`
  - `input_schema` (JSON Schema subset), `output_schema` (JSON Schema subset)
  - `data_source`, `data_source_type`, `transparency_tag`, `freshness_category`
  - `test_fixtures` (`known_answer`, `health_check_input`)
  - `output_field_reliability` (`{field: "guaranteed"|"common"|"rare"}`)
  - `limitations[]`

### Existing PII classification in manifests

**None.** Grep for `^processes_personal_data\|^personal_data` across `manifests/*.yaml` returned zero hits. No capability declares PII behaviour today.

### Manifest → DB pipeline

Per `CLAUDE.md` "Adding New Capabilities (MANDATORY PIPELINE)":
1. Manifest authored at `manifests/{slug}.yaml`
2. `npx tsx apps/api/scripts/onboard.ts --manifest ../../manifests/{slug}.yaml` parses YAML, inserts into `capabilities` table, auto-generates test suites, runs readiness check
3. `apps/api/src/lib/capability-onboarding.ts:onCapabilityCreated` runs validation gates (`validateCapabilityStructure`, `validateCapabilitySchema`) and hooks test generation
4. `capabilities` table row becomes the runtime source of truth; code reads `capabilities.transparencyTag`, `capabilities.dataSource`, etc. directly — not the YAML

### Validator surface

- **`apps/api/src/lib/onboarding-gates.ts`** — `validateCapabilityStructure`, `validateCapabilitySchema`, `enforceGates`, `runGate5`. This is where SA.2b.b adds a gate that asserts `processes_personal_data` is declared in the manifest (and persisted to the DB).
- **`apps/api/scripts/check-no-external-column-access.mjs`** — SCF-3 lint. Not relevant here.

### Capabilities table (schema.ts:93-168)

Columns relevant to the PII story today:
- `transparencyTag: varchar(30)` — `'ai_generated' | 'algorithmic' | 'mixed'`. Not a PII flag.
- `dataClassification: text` — a separate taxonomy (`'public_infrastructure_data'` etc.); not tied to PII.
- No `processesPersonalData`, `personalDataCategories` columns. **SA.2b.b adds these.**

---

## Sub-report E — Current redaction behaviour (post-SA.2a.3b)

### DELETE handler (routes/transactions.ts, post-`4b24f5e`)

Redaction UPDATE sets (full-column zeroing, not field-level within JSONB):
- `input: {}` (empty jsonb)
- `output: null`
- `error: null`
- `auditTrail: null`
- `provenance: null`
- `idempotencyKey: null`
- `deletedAt`, `redactedAt` = now()
- `deletionReason = "user_request"`

### Does F-A-003/009 change this?

**No.** F-A-003/009 are about the **compliance claim** (`personal_data_processed` boolean + `personal_data_categories` array in the audit trail emitted at creation time), not the **redaction** (what happens at DELETE time). They are orthogonal:

- F-A-003/009 → fixes "did we process PII?" claim on new transactions
- SA.2a.3b DELETE → fixes "how do we erase PII?" on user request

The two could interact in one future way: if a capability declares `processes_personal_data: false`, the DELETE handler could skip redaction of its output (since there's nothing to erase). That's an optimization, not a correctness requirement — the current "zero everything" approach is always safe. **Not proposed for SA.2b.b.**

### Related hook: F-A-005 (Sub-report F)

F-A-005 is about the free-tier public lookup path returning raw `input`/`output`. That's a read-path redaction concern and more directly adjacent to manifest PII declarations. See Sub-report F.

---

## Sub-report F — Free-tier consideration (F-A-005 interaction)

From SESSION_A:

> F-A-005: Free-tier transactions publicly retrievable by UUID leak input/output data.
> Suggested direction: Either redact input/output on the unauthenticated free-tier lookup path (return metadata only), or require the same HMAC token that gates `/v1/audit/:id` on unauthenticated `/v1/transactions/:id` as well.

### Does F-A-003/009 set up for F-A-005?

**Partially.** If SA.2b.b adds `capabilities.processesPersonalData` as a runtime-readable flag:

- **F-A-005 option A** (always-redact free-tier) doesn't need it.
- **F-A-005 option B** (redact only PII-processing capabilities' output on free-tier lookup) can read the flag to decide.
- **F-A-005 option C** (HMAC gate free-tier lookups) doesn't need it.

The 5 free-tier capabilities are `email-validate`, `dns-lookup`, `json-repair`, `url-to-markdown`, `iban-validate`. Of these: `email-validate` (PII — an email address), `iban-validate` (PII — a bank account number), arguably `url-to-markdown` (if scraping a user's private page). `dns-lookup` and `json-repair` are not PII.

**Conclusion:** F-A-003/009 enables a cleaner F-A-005 option B implementation. Not a blocker for F-A-005, but a natural sequencing: SA.2b (PII declaration) before SA.2c (F-A-005 free-tier read-path redaction).

**No tension between the two.** They compose well.

---

# PLAN — SA.2b.b

## Plan section 1 — F-A-003 + F-A-009 implementation (combined)

Goal: replace the `detectPersonalData(output)` heuristic with a manifest-declared, DB-persisted, runtime-read PII classification. Keep heuristic as defence-in-depth fallback but make it authoritative only if the DB value is NULL.

### Files touched

| File | Purpose | Expected lines |
|---|---|---|
| `apps/api/drizzle/0049_capability_pii_classification.sql` | New migration — add 2 columns to `capabilities` | ~20 lines |
| `apps/api/src/db/schema.ts` | Sync: add `processesPersonalData`, `personalDataCategories` to `capabilities` pgTable | ~5 lines |
| `apps/api/src/lib/schema-validator.ts` | Add entries to `REQUIRED_COLUMNS` for the 2 new columns (same pattern as entries for 0048) | ~10 lines |
| `apps/api/src/lib/capability-onboarding.ts` | Read `processes_personal_data` + `personal_data_categories` from manifest at onboarding and persist to the DB | ~10 lines |
| `apps/api/src/lib/onboarding-gates.ts` | New gate: require `processes_personal_data` declared in manifest. Error if missing. | ~15 lines |
| `apps/api/src/lib/audit-helpers.ts` | `detectPersonalData(input, output)` — extend signature to accept input too (F-A-003 direct fix) | ~5 lines |
| `apps/api/src/routes/do.ts:2143-2194` | Replace heuristic call with DB-read: `capability.processesPersonalData ?? detectPersonalData(input, output)`. Populate `personal_data_categories` from `capability.personalDataCategories ?? []` | ~10 lines |
| `manifests/*.yaml` (backfill — see Plan section 5) | Add `processes_personal_data` + `personal_data_categories` to the top-N high-PII manifests | variable |

**Total estimated code diff (excluding manifest backfill):** ~75 lines.

### New types

**Manifest YAML:**
```yaml
processes_personal_data: true
personal_data_categories:
  - name
  - date_of_birth
  - government_id
```

**Drizzle schema (schema.ts, inside `capabilities` pgTable):**
```ts
// SA.2b PII classification (F-A-003, F-A-009). Declared per-capability
// in manifest; used by buildFullAudit to emit accurate GDPR Art. 30 claims.
processesPersonalData: boolean("processes_personal_data"),  // nullable during backfill
personalDataCategories: text("personal_data_categories").array().default([]),
```

**Runtime type extension for `CapabilityInfo` (do.ts):** add the two fields to the interface passed into `buildFullAudit`.

### Runtime change at `routes/do.ts:2144`

Current:
```ts
const personalDataDetected = detectPersonalData(output);
```

Proposed:
```ts
// F-A-003 + F-A-009: prefer manifest-declared classification over heuristic.
// Heuristic is the fallback for unclassified capabilities during the
// backfill window. Post-backfill, heuristic should never fire.
const personalDataDetected = capability.processesPersonalData
  ?? detectPersonalData(executionInput, output);
const personalDataCategories = capability.personalDataCategories ?? [];
```

And at L2172 (currently hard-coded empty):
```ts
personal_data_categories: personalDataCategories,
```

### F-A-003's other ask: extend `detectPersonalData` to accept input

Current signature: `detectPersonalData(output: unknown): boolean`.

Proposed: `detectPersonalData(input: unknown, output: unknown): boolean` — ORs field-name match over both bags.

**Why keep the heuristic at all:** during the backfill window (days/weeks), not every capability will have `processesPersonalData` set. The heuristic provides a floor — "at least the obvious cases are caught". Post-backfill, the field should be `NOT NULL` and the fallback never fires (Plan section 5 details the path).

### Onboarding gate (new)

In `onboarding-gates.ts`, add to `validateCapabilityStructure`:

```ts
if (cap.processesPersonalData === null || cap.processesPersonalData === undefined) {
  violations.push({
    severity: "blocking",
    rule: "pii_declaration_required",
    message: `Capability '${cap.slug}' must declare 'processes_personal_data' in its manifest. See docs/capabilities/pii-classification.md for guidance.`,
  });
}
```

This makes the field **required for new capabilities onboarded after SA.2b.b ships**. Backfill (Plan section 5) addresses existing rows.

---

## Plan section 2 — (merged into section 1)

F-A-003 and F-A-009 share the same implementation surface. Combining them avoids split commits that each half-solve the problem.

---

## Plan section 3 — Runtime behaviour changes

**DELETE handler:** unchanged. PII redaction is orthogonal to PII declaration (Sub-report E).

**buildFullAudit (`do.ts`):** changed as described in section 1. Emits correct `personal_data_processed` and `personal_data_categories`.

**buildFailureAudit (`do.ts:~2201`):** currently emits `personal_data_processed: false` hard-coded at L2110. **This should ALSO be updated** to use the manifest-declared flag — a failed call that processed PII still processed PII. Add one-line edit.

**buildInlineAudit (`solution-execute.ts`) and x402 audit:** no `compliance` block, nothing to change. If those ever grow one, SA.2b.b's pattern applies.

**Free-tier lookup path (F-A-005):** not in this scope.

**DELETE cascade to `transaction_quality`:** unchanged.

---

## Plan section 4 — Migration

Per DEC-20260420-A (hand-write SQL) and DEC-20260420-B (pair with schema.ts in same commit):

### File: `apps/api/drizzle/0049_capability_pii_classification.sql`

```sql
-- SA.2b (F-A-003, F-A-009): per-capability PII classification.
-- Replaces the fragile output-only `detectPersonalData` heuristic in
-- audit-helpers.ts. Declared in manifests, persisted here, read at
-- runtime by buildFullAudit + buildFailureAudit.
--
-- Columns are nullable during backfill. Post-backfill (after every
-- active capability has been classified), a follow-up migration flips
-- processes_personal_data to NOT NULL. See SA.2b.c plan.

ALTER TABLE "capabilities"
  ADD COLUMN IF NOT EXISTS "processes_personal_data" boolean;

ALTER TABLE "capabilities"
  ADD COLUMN IF NOT EXISTS "personal_data_categories" text[] DEFAULT '{}'::text[];

-- Partial index for analytics: which capabilities advertise PII processing?
-- Cheap (hundreds of rows), useful for compliance reviews.
CREATE INDEX IF NOT EXISTS "capabilities_processes_pii_idx"
  ON "capabilities" ("slug")
  WHERE "processes_personal_data" = true;
```

### File: `apps/api/drizzle/meta/_journal.json`

Append entry with `idx: 50`, `tag: "0049_capability_pii_classification"`.

### File: `apps/api/src/db/schema.ts`

Add to `capabilities` pgTable (after the existing SA.2a columns aren't yet here; PII columns belong near `dataClassification` for thematic grouping):

```ts
// SA.2b (F-A-003, F-A-009, migration 0049): per-capability PII
// classification. Nullable during backfill; target is NOT NULL post-backfill.
processesPersonalData: boolean("processes_personal_data"),
personalDataCategories: text("personal_data_categories").array().default([]),
```

### File: `apps/api/src/lib/schema-validator.ts`

Add two entries to `REQUIRED_COLUMNS` to fail-fast at startup if the migration hasn't applied:

```ts
{
  table: "capabilities",
  column: "processes_personal_data",
  migration: "0049_capability_pii_classification",
},
{
  table: "capabilities",
  column: "personal_data_categories",
  migration: "0049_capability_pii_classification",
},
```

### Migration-applied-to-prod protocol

Per session memory (Petter's `DATABASE_URL` points at prod): **the developer running `drizzle-kit migrate` on the prod URL applies directly.** SA.2b.b prompt must explicitly NOT run `drizzle-kit migrate` during verification — same protocol as SA.2a.2b.

---

## Plan section 5 — Manifest backfill

### The problem

275 manifests exist. The new gate requires `processes_personal_data` on all of them. Applying the gate retroactively blocks every capability onboarding re-run until every manifest is updated. CC estimates human effort to classify all 275: ~2-4 hours (most are obvious), but not within SA.2b.b's scope.

### Proposed strategy: **hybrid**

1. **Schema column is nullable during backfill.** `processes_personal_data BOOLEAN NULL`.
2. **Runtime code treats NULL as "unknown — use heuristic fallback".** `capability.processesPersonalData ?? detectPersonalData(input, output)`.
3. **The onboarding gate is opt-in during SA.2b.b.** Introduced as warning, not blocking. New capabilities onboarded between SA.2b.b and SA.2b.c must declare it; existing capabilities are grandfathered.
4. **Explicit classification for the top-N high-PII capabilities.** SA.2b.b ships with the following manifests updated:

   - **Classify `processes_personal_data: true`** — KYB/compliance wedge:
     - `pep-check` (explicit name input)
     - `sanctions-check` (individual lookup)
     - `adverse-media-check`
     - `risk-narrative-generate`
     - `email-validate` (email is PII per GDPR)
     - `iban-validate` (financial identifier)
     - All `*-company-data` lookups (20 manifests — beneficial-owner data in output)
     - `address-parse`
     - `resume-parse`
     - `meeting-notes-extract`
   - **Classify `processes_personal_data: false`** — infrastructure/algorithmic:
     - `dns-lookup`, `mx-lookup`, `ssl-check`, `port-check`, `redirect-trace`
     - `json-repair`, `iso-country-lookup`, `financial-year-dates`, `incoterms-explain`
     - `cve-lookup`, `port-lookup`, `customs-duty-lookup`
     - `unit-convert`, `vat-rate-lookup`, `exchange-rate`

   ~45 explicit classifications covering ~95% of call volume in practice.

5. **Follow-up ticket SA.2b.c:** classify the remaining ~230 manifests + flip `NOT NULL`. Not in SA.2b.b scope.

### Alternative (simpler, worse)

Default all 275 to `processes_personal_data: true`. Safe from a compliance-overcaution angle ("we might have processed PII"). Wrong for 50%+ of capabilities (most developer-tooling and computation capabilities have no PII). Produces misleading audits in the opposite direction.

**Recommendation: hybrid (#4 above).**

### Capability Onboarding Protocol (DEC-20260320-B) compliance

The protocol requires every manifest-modifying session to run `validate-capability.ts` and `smoke-test.ts` on every changed capability. For ~45 manifests, that's 45 readiness checks. Feasible but non-trivial. SA.2b.b prompt should either:
- (a) Script a bulk readiness check, OR
- (b) Limit SA.2b.b to the ~15 most critical (pep-check, sanctions-check, adverse-media-check, email-validate, iban-validate, 10 company-data), defer the rest

**Recommendation: (b).** The gate change is the load-bearing shift; the 15 explicit classifications demonstrate the pattern; the remaining backfill is a separate tracked ticket (SA.2b.c).

---

## Plan section 6 — Commit split proposal

**Recommendation: 3 commits.**

1. **B1 — Migration 0049 + schema sync + schema-validator** (`apps/api/drizzle/0049_*.sql` + `schema.ts` + `schema-validator.ts`). Must land together per DEC-20260420-B. ~35 lines.
2. **B2 — Runtime + onboarding** (`audit-helpers.ts`, `routes/do.ts`, `capability-onboarding.ts`, `onboarding-gates.ts`). The logic that reads and writes the new columns. ~40 lines.
3. **B3 — Manifest backfill (top 15)** (~15 manifests). Per DEC-20260320-B, each manifest change ideally runs the full pipeline, but 15 × readiness check is a lot for one commit. Prompt should either batch them all in B3 (accepting the time cost) or split further (B3a/B3b). Chat decides.

**Total estimated diff for B1+B2:** ~75 lines of code + 1 SQL migration. B3 adds ~60 YAML lines across 15 files.

### Rationale

- B1 is the "nothing breaks if the runtime doesn't read these columns yet" baseline — ship it first, let the migration land in prod, then follow with B2 which depends on it.
- B2 is the behaviour change. Without B1 already deployed, B2's code would fail the schema validator at startup.
- B3 is data, not code. Separable.

### Not proposed

- Flipping `processes_personal_data` to `NOT NULL` — that's SA.2b.c, after full backfill.
- Touching the free-tier read-path (F-A-005) — separate finding, separate work.
- Removing the heuristic — keep it as fallback during backfill window.

---

## Plan section 7 — Open questions for chat (blocking SA.2b.b)

### OQ #1 — Category taxonomy for `personal_data_categories`

The audit response field `personal_data_categories` today is `string[]`, always empty. Once populated, what values should appear?

GDPR Art. 9 calls out "special categories" (health, biometric, political, religious, sexual orientation, etc.). General PII categories often include: `name`, `email`, `phone`, `address`, `financial`, `government_id`, `date_of_birth`, `professional_history`, `behavioral`.

- **(a)** Use GDPR Art. 9 categories only (minimal, conservative)
- **(b)** Custom Strale taxonomy aligned to capability vertical (name, financial, etc.)
- **(c)** Free-form strings (documented, but no enum)

**Recommendation: (b) with an enum in `schema-validator.ts` to prevent drift.** Exact enum values are a product decision.

### OQ #2 — Does `processes_personal_data: true` mean "input is PII" OR "output is PII" OR "either"?

The GDPR-correct answer is "either" (processing includes collection, storage, transmission, etc.). F-A-003 specifically calls out input-PII as the missing case. Implementation should use "either" semantics — no sub-field splits (no separate `processes_personal_data_in_input` / `..._in_output`).

**Recommendation: single boolean means "processed at any stage."** Confirm.

### OQ #3 — Backfill scope: all 275 or top 15?

Plan section 5 recommends 15 for SA.2b.b; remaining 260 tracked as SA.2b.c. Chat confirms or expands.

**Recommendation: 15 for SA.2b.b, balance for SA.2b.c.** If Petter has ~2 hours to classify the 260, land them in one sweep after SA.2b.b — but don't gate SA.2b.b on it.

### OQ #4 — Bundle F-A-004's legal_hold residue?

Sub-report C notes that F-A-004's original suggestion included "the audit should note the exemption condition" for legal_hold rows. That's a one-line edit to `buildFullAudit` (add `data_retention_note: legalHold ? "Indefinite — legal hold applies" : null` or similar).

- **(a)** Out of scope. Track separately as follow-up.
- **(b)** Ride along in SA.2b.b B2 commit.

**Recommendation: (a).** SA.2b.b is already manifest-focused; legal_hold disclosure is an audit-payload edit with a different shape.

### OQ #5 — Gate severity for new capabilities

Plan section 5 makes the onboarding gate a warning (not blocking) during SA.2b.b. Should it become blocking sooner (after 15 explicit backfills) or later (after 275)?

- **(a)** Blocking immediately for new capabilities (grandfather existing).
- **(b)** Warning until SA.2b.c lands, then blocking.

**Recommendation: (a).** Every new capability from the moment SA.2b.b ships should declare it. Existing capabilities get the NULL-fallback path until SA.2b.c.

### OQ #6 — Heuristic retention after full backfill

Once SA.2b.c has classified all 275 and flipped `NOT NULL`, the heuristic fallback is unreachable. Keep or delete?

- **(a)** Delete. Less code.
- **(b)** Keep as a safety net behind a feature flag.

**Recommendation: (a), as part of SA.2b.c.** Not in SA.2b.b.

---

## Upstream / Downstream / Sibling / External impacts

### Upstream (who populates manifests)
- Manifests are authored by Petter (solo founder, per project memory). No third-party providers yet. Backfill is a direct manual authoring task.
- The onboarding pipeline (`onboard.ts --discover`) reads manifests — adds to the pipeline's required field set.

### Downstream (who reads the new fields)
- `buildFullAudit` (do.ts:2144) — primary consumer.
- `buildFailureAudit` (do.ts:~2201) — secondary consumer (one-line edit).
- Future: `F-A-005` read-path redaction may read `processesPersonalData` on the capability row to decide free-tier output redaction.
- Future: admin stats / platform-status dashboard could report % of capabilities classified. Not in scope.

### Siblings
- `transaction_quality`: unaffected.
- `solutions`: solutions have steps that call capabilities, so a solution processes PII if any of its steps does. Solution-level declaration not proposed for SA.2b.b — infer at runtime from step composition if ever needed.
- `x402_gateway` audit trail: no `compliance` block today, no change needed.

### External
- **Distribution surfaces (Beacon, strale.dev, SDKs):** none currently advertise `personal_data_processed` or `personal_data_categories`. No cross-repo update needed. Flag: if `llms.txt` or the OpenAPI spec ever describe the audit shape, they'd need updating post-SA.2b.b. Out of scope.
- **Strale dashboard:** doesn't surface these fields today. No change.

---

## Rule 3 compliance note (Capability Onboarding Protocol, DEC-20260320-B)

The protocol requires every capability-modifying session to run `validate-capability.ts` and `smoke-test.ts` on each touched capability. SA.2b.b's B3 commit (manifest backfill) touches 15 capabilities; each requires a readiness check. **This is the load-bearing time sink in SA.2b.b**, not the code. Budget ~20-30 minutes for B3 verification.

---

## Verification checklist

- [x] `SESSION_A_audit_findings.md` located at repo root (tracked, commit `5927bfb`)
- [x] F-A-003 verbatim extracted (Sub-report A)
- [x] F-A-009 verbatim extracted (Sub-report B)
- [x] F-A-004 verbatim extracted + closure confirmed (Sub-report C)
- [x] Sub-reports D, E, F populated with file:line references
- [x] 7 plan sections produced (with sections 1+2 merged per F-A-003/F-A-009's natural pairing)
- [x] Open questions populated (6 items)
- [x] Report written to `audit-reports/SA_2b_a_audit.md`, untracked
- [x] No files modified in `apps/api/src/`
- [x] `git status` shows the new report file plus pre-existing root-level dirty state

---

*End of SA.2b.a audit. Ready for chat review before SA.2b.b implementation.*
