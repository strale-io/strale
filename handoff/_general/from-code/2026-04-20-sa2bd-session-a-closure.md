# SA.2b.d — Session A Closure Report

**Intent:** Close Session A (Opus 4.7 code review workstream) by eliminating the
`detectPersonalData` heuristic fallback. Final step of the three-batch PII
classification project (SA.2b.b → SA.2b.c → SA.2b.d).

## What shipped

### Phase 1 — Orphan classification (direct SQL, no commit)
Classified 32 DB rows that had no YAML manifest (32 NULL `processes_personal_data`):
- **FALSE/[] (17):** web3 price/gas/TVL/risk feeds, UK dataset scrapers, phishing/
  contract checks, fear-greed-index, stamp-duty-calculate
- **TRUE/[address] (3):** council-tax-lookup, uk-epc-rating, uk-flood-risk
- **TRUE/[financial] (5):** wallet-age/balance/risk/transactions, approval-security-check
- **TRUE/[name,financial] (2):** ens-resolve, ens-reverse-lookup
- **TRUE/[name,address,professional] (3):** hong-kong-, indian-, singapore-company-data
- **TRUE/[name,professional] (1):** officer-search
- **TRUE/[email,name] (1):** email-pattern-discover

After Phase 1: `pii_true=99, pii_false=208, still_null=0, total=307`.

### Phase 2 — NOT NULL (commit `cf33028`)
- Migration 0050 `0050_pii_not_null.sql`: `SET DEFAULT false; SET NOT NULL`.
  DEFAULT is a belt-and-suspenders safety net for direct-SQL insert paths
  (seed.ts, admin create, tests). The manifest-driven onboard pipeline still
  requires explicit `processes_personal_data` via `validateManifest()`.
- `schema.ts` paired sync: `.notNull().default(false)` on the column.
- `schema-validator.ts` comment updated to reference 0050 + NOT NULL flip.
- `_journal.json` entry 51 added.

### Phase 3 — Heuristic removal (commit `6dfb47f`)
- Deleted `detectPersonalData(input, output): boolean` from `audit-helpers.ts`;
  left sunset comment pointing to migration 0050.
- `do.ts` `CapabilityInfo` type: `processesPersonalData: boolean` (no longer
  nullable). Removed `?? detectPersonalData(...)` and `?? false` fallbacks in
  `buildFreeTierAudit` + `buildFullAudit`. Import of `detectPersonalData`
  deleted.

## Verification

**DB state (prod after migration 0050):**
```
column: is_nullable=NO, default=false
counts: pii_true=99, pii_false=208, still_null=0, total=307
tracker: top id=52 (hash 112835cb…), matches 0050
```

**Tests:** 208 passed, 11 pre-existing `FRONTEND_URL` failures (unchanged
baseline — unrelated to SA.2b.d). TypeScript clean.

**Prod spot-checks (all post-deploy):**
| Capability | Expected | Observed |
|---|---|---|
| `pep-check` | `true, [name, date_of_birth]` | `true, [name, date_of_birth]` — DPIA notice emitted |
| `dns-lookup` (free-tier) | `false, []` | `false, []` — "No DPIA required" |
| `currency-convert` (SA.2b.c) | `false, []` | `false, []` |

Runtime is reading the DB column directly; heuristic is gone.

## Closes

- **F-A-003** — heuristic PII detection inconsistent with manifest claims.
- **F-A-009** — GDPR Art. 30 audit trail could drift from declared state.
- **DEC-20260420-D OQ #6** — the open question about removing the fallback.
- **Session A** — entire Opus 4.7 code review workstream.

## Follow-ups

None from SA.2b.d. Onboarding pipeline's `validateManifest()` gate already
enforces `processes_personal_data` for all new manifest-driven inserts; direct-SQL
inserts get `DEFAULT false` at the DB level. No heuristic remains anywhere in the
audit-trail path.

Pre-existing 11 `FRONTEND_URL` test failures remain untouched — separate concern.
