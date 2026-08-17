# VALID_CATEGORIES enum completeness check

**Date:** 2026-04-21
**HEAD at start:** `8a4e51b` (Phase 4b.2 audit)
**Trigger:** Phase 4b.2 orphan audit (`audit-reports/2026-04-21-phase-4b2-orphan-audit.md`) found `web3` missing from the CI gate enum; 17 active web3 capabilities would fail the gate when YAMLs are generated in Phase 4b.2 implementation.

---

## Summary

- **Categories in prod DB:** 21 distinct values across 307 rows
- **Categories in `VALID_CATEGORIES` (before change):** 21
- **Gaps (DB not in enum):** 1 — `web3` (17 capabilities)
- **Enum values unused in DB:** 1 — `legal-regulatory` (kept, no action)
- **Categories added:** 1 — `web3`
- **Categories flagged as suspect, not added:** 0

Verdict: single missing category, non-ambiguous, added. Unblocks the 17 web3 YAMLs that Phase 4b.2 implementation will generate.

---

## 1. VALID_CATEGORIES — before and after

**Before** (21 values):
```
company-data, compliance, developer-tools, finance, data-processing,
web-scraping, monitoring, validation, data-extraction, legal-regulatory,
file-conversion, agent-tooling, competitive-intelligence, content-writing,
document-extraction, financial, security, text-processing, trade, utility,
web-intelligence
```

**After** (22 values — added `web3`):
```
company-data, compliance, developer-tools, finance, data-processing,
web-scraping, monitoring, validation, data-extraction, legal-regulatory,
file-conversion, agent-tooling, competitive-intelligence, content-writing,
document-extraction, financial, security, text-processing, trade, utility,
web-intelligence, web3
```

Updated in two places (see §4 coupling note):
- `apps/api/src/lib/onboarding-gates.ts:209` — the canonical export consumed by `validateManifest` + `validateCapabilityStructure` + the 4b.1 CI gate
- `apps/api/scripts/validate-capability.ts:35` — a duplicate local constant used by the standalone capability-validator script

---

## 2. Prod category distribution

Query run 2026-04-21 against Railway prod Postgres (`desirable-serenity/production`).

```sql
SELECT category, COUNT(*)::int AS n
  FROM capabilities
 GROUP BY category
 ORDER BY n DESC, category ASC;
```

Result (21 rows, 307 total capabilities):

| Category | Count |
|---|---|
| data-extraction | 107 |
| developer-tools | 44 |
| validation | 37 |
| data-processing | 19 |
| **web3** | **17** ← missing from enum |
| compliance | 10 |
| company-data | 8 |
| monitoring | 7 |
| security | 7 |
| web-scraping | 7 |
| competitive-intelligence | 6 |
| file-conversion | 5 |
| finance | 5 |
| agent-tooling | 4 |
| document-extraction | 4 |
| financial | 4 |
| text-processing | 4 |
| utility | 4 |
| web-intelligence | 4 |
| content-writing | 3 |
| trade | 1 |

All non-empty, non-NULL, no trailing whitespace, no obvious typos.

---

## 3. Gap analysis

### 3.1 DB → enum gap

| Category | Count | Decision | Rationale |
|---|---|---|---|
| `web3` | 17 | **added** | Unambiguous. 17 rows in active production use, all with `lifecycle_state=active`, sharing a coherent pattern (Ethereum/DeFi/wallet/on-chain data). Matches naming convention of existing enum entries (lowercase, no underscores, short). |

No other gaps.

### 3.2 Enum → DB curiosity

| Category | Count | Decision | Rationale |
|---|---|---|---|
| `legal-regulatory` | 0 | **keep** | Unused in current DB but authored as a legitimate taxonomy slot. Removal is a separate decision — could represent future capabilities (e.g. regulation search, compliance filing lookups already use `compliance` but a future split into finer grain is plausible). |

### 3.3 Near-duplicate observation (not a gap)

`finance` (5 rows) and `financial` (4 rows) coexist as distinct enum values and distinct DB values. Not a gap — both are legitimate category values per the enum — but worth flagging as taxonomy noise for a future consolidation pass. Out of scope here (would require a data migration).

---

## 4. Coupling note — duplicate enum definition

`VALID_CATEGORIES` is defined in **two** places:

1. `apps/api/src/lib/onboarding-gates.ts:209` — exported, consumed by:
   - `validateManifest` (same file, L401+)
   - `validateCapabilityStructure` (same file, L253+)
   - `apps/api/src/lib/manifest-completeness.test.ts` (Phase 4b.1 CI gate, via `validateManifest` import)

2. `apps/api/scripts/validate-capability.ts:35` — local `const`, consumed only by that script's `catOk` check at L149.

This duplication is pre-existing, not introduced by this change. Per Phase 1 F-B-007 comment at `onboarding-gates.ts:205`, an earlier consolidation pass already moved the enum out of `scripts/onboard.ts` but did not also consolidate `scripts/validate-capability.ts`. Keeping both locations in sync is manual and this prompt updates both.

**Recommendation (out of scope):** `scripts/validate-capability.ts` should import `VALID_CATEGORIES` from `../src/lib/onboarding-gates.js` and delete the local copy. Matches the F-B-007 consolidation pattern. Worth a To-do.

No other `VALID_CATEGORIES` definitions found:
```
rg "VALID_CATEGORIES" apps/api → 2 definitions, 7 usages (all either definition sites or consumers)
```

---

## 5. Verification

After the change:

```
cd apps/api
npx vitest run src/lib/manifest-completeness.test.ts src/lib/onboarding-gates-enums.test.ts
```
Result: **11/11 passing**.

```
npm run build
```
Result: **clean**.

The existing enum test at `src/lib/onboarding-gates-enums.test.ts:57-65` explicitly documents "Adding a new category is fine; removing one needs to fail this test." The addition of `web3` satisfies this policy.

---

## 6. Impact

Phase 4b.2 implementation is now unblocked for the 17 web3 `yaml-generate` targets:

```
approval-security-check, contract-verify-check, ens-resolve, ens-reverse-lookup,
fear-greed-index, gas-price-check, phishing-site-check, protocol-fees-lookup,
protocol-tvl-lookup, stablecoin-flow-check, token-security-check,
vasp-non-compliant-check, vasp-verify, wallet-age-check, wallet-balance-lookup,
wallet-risk-score, wallet-transactions-lookup
```

Their generated YAMLs can now carry `category: web3` without failing the 4b.1 CI completeness gate.
