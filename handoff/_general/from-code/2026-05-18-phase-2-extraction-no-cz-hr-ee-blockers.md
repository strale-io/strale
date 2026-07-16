# Handoff — Phase 2 legal_representatives extraction: NO + CZ shipped, HR + EE blocked

**Date:** 2026-05-18
**Author:** Claude Code (strale-work, Sonnet)
**Branch context:** main (post-PR-136 + PR-137 merge)

## Intent

Phase 2 of the cost-free coverage sprint: add `legal_representatives[]` extraction to four EU country handlers (NO, CZ, HR, EE) per the prompt's source-research report at `audit-output/registry-source-research-2026-05-18.md`.

## Outcome

**Two of four PRs shipped.** Honest scope shrank from +4 to +2 after pre-flight upstream probes contradicted the verification report for HR + EE.

| Country | Status | PR | Lift |
|---|---|---|---|
| **NO** | ✅ Shipped | [#136](https://github.com/strale-io/strale/pull/136) | T2 4/5 → 5/5 |
| **CZ** | ✅ Shipped | [#137](https://github.com/strale-io/strale/pull/137) | T2 4/5 → 5/5 |
| **HR** | ❌ Blocked — source path doesn't exist on free tier | — | none |
| **EE** | ❌ Blocked — RIK agreement not in place | — | none |

**Cumulative binding-ready T2 count:** 5 (post-Phase-1) → **7** (post-Phase-2). Not 9.

## What shipped (NO)

PR [#136](https://github.com/strale-io/strale/pull/136) — `feat(t2): Phase 2 legal_representatives extraction for NO`

- New `fetchBrregRoles()` helper in `apps/api/src/lib/brreg-fetch.ts` calling `data.brreg.no/enhetsregisteret/api/enheter/{orgnr}/roller` (anonymous, no auth).
- `norwegian-company-data.ts` parallel-fetches the company record + roles; maps `rollegrupper[].roller[]` to canonical `legal_representatives[]` `{ type, name, role, role_code, role_group, date_of_birth }`.
- Role group code is `STYR` (not `STYRE` as the verification report claimed) — minor field-naming correction baked into the implementation.
- Sub-role mappings for STYR group: `LEDE` (chair), `NEST` (deputy chair), `MEDL` (member), `VARA` (alternate), `OBS` (observer). DAGL/SIGN/PROK use the group code directly.
- Filters out `fratraadt` (resigned) + `avregistrert` (deregistered).
- Anonymous endpoint returns name + birth date, no fnr. `tier_2_available_reason` documents this scope honestly.
- **Live smoke:** Equinor ASA (923609016) → 16 active reps extracted.

## What shipped (CZ)

PR [#137](https://github.com/strale-io/strale/pull/137) — `feat(t2): Phase 2 legal_representatives extraction for CZ`

- `cz-company-data.ts` adds parallel fetch of ARES VR view (`ekonomicke-subjekty-vr/{ico}`) alongside the existing BE view. VR view is opportunistic (404 → empty array, no hard fail) since sole traders / associations / foreign branches lack a public-register record.
- Maps `zaznamy[primaryZaznam=true].statutarniOrgany[].clenoveOrganu[]` to canonical `legal_representatives[]` `{ type, name, role, role_code, role_group, date_of_birth, nationality, start_date }`. Adds `nationality` (statniObcanstvi) + `start_date` (vznikFunkce / vznikClenstvi) over the NO shape.
- Also surfaces `signing_authority` (způsob jednání) from the same VR record at company level.
- **Scope decision:** Includes Statutární orgán (představenstvo / jednatel) + Prokura. Excludes `ostatniOrgany` (supervisory boards / dozorčí rada) — these do not legally represent the company under Czech commercial law. T2 binding-readiness requires actual legal representatives, not supervisory bodies.
- Filters out historic register rows (`datumVymazu` present) and ended memberships (`clenstvi.zanikClenstvi` present).
- **Live smoke:** Škoda Auto a.s. (00177041) → 7 active reps extracted (6 představenstvo members + 1 procurist).
- Added CZ to `tier-coverage-allowlist.txt` for the pre-existing alias-key drift from PR #131 (legal_name / primary_registration_id / etc. not in manifest output_schema — separate cleanup, unrelated to this PR).

## PII near-miss caught + fixed

First capture of the CZ fixture committed 7 real Skoda board members' names + DOBs + nationality unscrubbed, because `legal_representatives` was not in `capture-tier-fixtures.ts`'s `PII_ARRAY_FIELDS` set. Caught + deleted pre-commit. The fix (adding `legal_representatives` to the PII set) was applied on both branches independently and is now in main via #136's merge. Recommend a follow-up audit of any other handlers that emit `legal_representatives` to confirm their committed fixtures are scrubbed. Quick check: `grep -l '"legal_representatives": \[' apps/api/tests/fixtures/tier-coverage/`.

## Why HR is blocked

The verification report at `audit-output/registry-source-research-2026-05-18.md` claimed HR Sudreg's public REST API at `sudreg-api.pravosudje.hr/javni/subjekt_detalji` returns `osobe_ovlastene_za_zastupanje[]` for free.

This is **wrong on two counts:**

1. **Wrong base URL.** The actual public Sudreg API is at `sudreg-data.gov.hr/api/javni/` (Croatian Ministry of Justice, OAuth2 client_credentials). The pravosudje.hr name is the legacy property; the current handler already uses the correct base.
2. **Wrong field availability.** I fetched the public OpenAPI spec at `https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api` and grepped its `detalji_subjekta_svi_ex` schema. None of its 30+ properties is `osobe_ovlastene_za_zastupanje`, `uprava`, `zastupnici`, or any representative-bearing field. The spec lists table endpoints for company name, abbreviated name, headquarters, email, legal form, activities, capital, branches, status proceedings, financial reports (gfi) — but no representatives. **There is no public free endpoint that returns representatives.**

The existing coverage-matrix file (2026-05-15) had this correctly: "Directors/management board available via paid tier only". That note was overwritten by the optimistic 2026-05-18 verification report. The 2026-05-15 view was right.

**Recommendation:** Treat HR as **Class C on free tier**. Closing T2 for HR requires one of:
- Paid Sudreg tier (commercial subscription to Hrvatska gospodarska komora — pricing not on the public site).
- A different vendor (Topograph, Bisnode HR, Dun & Bradstreet HR).
- BIS scraping is **not** an option per DEC-20260428-A (Strale never operates scrapers; statutorily-public director data via vendor consumption is Tier 2 but requires the vendor to have legitimate redistribution rights).

This deserves a fresh DEC entry once a path is picked.

## Why EE is blocked

The verification report claimed EE Ariregister has free open-data + free signed-agreement REST access for board members (juhatuse liikmed).

I confirmed:
- The free `/autocomplete` endpoint (which the current handler uses) returns identity only — no board members.
- The deeper endpoints ("Detailed company data query", "Rights of representation of all persons related to company") all require a **signed contract with RIK** (free but ~5 business days to obtain, plus 50k req/day cap per contract partner).
- **No `RIK_*` or `ARIREGISTER_*` env var or contract reference anywhere in the strale repo.** Strale does not have an active RIK contract.

**Recommendation:** Sign the RIK contract via the e-Business Register portal. The application form is at `https://avaandmed.ariregister.rik.ee/en/open-data-api/introduction-api-services`. Estimated 5 business days to receive credentials. Once in place:
- Update the Estonian handler to use the agreement-gated endpoint instead of `/autocomplete`-only.
- Map `juhatuse_liikmed[]` to canonical `legal_representatives[]`.
- Expect ~1 day of implementation + smoke after credentials arrive.

A Notion to-do for this should be opened by the chat side.

## CI gates

- `tsc --noEmit`: clean for changed files (one pre-existing unrelated error in `italian-company-stakeholders.ts:54`).
- `check-tier-coverage.mjs`: 0 new findings (NO already on allowlist for alias drift; CZ added).
- `check-fetch-timeout-coverage.mjs`: clean — new `fetchBrregRoles` and `fetchVrByIco` both use `AbortSignal.timeout(10000)`.
- `check-no-bare-catch.mjs`: clean.
- `check-manifest-guaranteed-consistency.mjs`: clean.
- `coverage-matrix:check`: clean (COVERAGE.md regenerated per branch).

## Files changed (in main post-merge)

PR #136 (NO):
- `apps/api/src/lib/brreg-fetch.ts` (+46 lines — new `fetchBrregRoles` helper + types)
- `apps/api/src/capabilities/norwegian-company-data.ts` (+70/-2 lines)
- `apps/api/scripts/capture-tier-fixtures.ts` (+1 line — `legal_representatives` added to PII_ARRAY_FIELDS)
- `manifests/norwegian-company-data.yaml` (+22 lines — schema + reliability)
- `apps/api/tests/fixtures/tier-coverage/norwegian-company-data.json` (regenerated, redacted)
- `apps/api/coverage-matrix/norwegian-company-data__no__company-registry.yaml` (T2 4/5 → 5/5; last_verified 2026-05-18)
- `apps/api/coverage-matrix/COVERAGE.md` (regenerated)

PR #137 (CZ):
- `apps/api/src/capabilities/cz-company-data.ts` (+131/-8 lines — VR types, `fetchVrByIco`, `shapeRepresentatives`)
- `manifests/cz-company-data.yaml` (+29 lines)
- `apps/api/scripts/tier-coverage-allowlist.txt` (+1 line — `cz-company-data` added)
- `apps/api/tests/fixtures/tier-coverage/cz-company-data.json` (regenerated, redacted)
- `apps/api/coverage-matrix/cz-company-data__cz__company-registry.yaml` (T2 4/5 → 5/5; last_verified 2026-05-18)
- `apps/api/coverage-matrix/COVERAGE.md` (regenerated)

## Loose threads / chat-side follow-ups

1. **Memory entry 25** — bump binding-ready T2 count from 5 → 7. (NOT 9 as the prompt anticipated.)
2. **Active Vendor Stack** narrative (Notion page `35367c87082c812e88d1dc6bdbfbd4f5`) — NO and CZ now expose directors via existing free vendors; no vendor change, but the narrative could be tightened.
3. **HR Class C resolution** — open a DEC scoping question: paid Sudreg, third-party vendor, or accept HR as a paid-tier-only country for v1 (consistent with FI/NL/ES/PT/IT/AT/BG/RO).
4. **EE RIK contract** — open a Notion to-do for Petter to sign the agreement at avaandmed.ariregister.rik.ee. Defer EE T2 work until credentials arrive.
5. **PII fixture audit** — confirm no historical fixtures have unscrubbed `legal_representatives` arrays (only one risk fixture was caught + fixed in this session).
6. **Phase 3 prompt (BE + LV)** — before delivering, re-verify those two upstream APIs the same way I verified the Phase 2 four. The 2026-05-18 source-research report has now been wrong twice out of four; do not trust without probe.

## /go status

Skipped per Petter direction (option 1 in the in-session AskUserQuestion). Both PRs were narrow additive extractions, CI fully green on both, audit phase in PR descriptions, live smoke confirmed. /go skip is documented; not blocking `/end-session` because this handoff itself substitutes for the missing review-gate artifact.

## Verification of merged state

```
$ git log --oneline -3 origin/main
<sha> chore(coverage-matrix): regenerate COVERAGE.md for CZ last_verified bump
<sha> feat(t2): Phase 2 legal_representatives extraction for CZ
<sha> chore(coverage-matrix): regenerate COVERAGE.md for NO last_verified bump
<sha> feat(t2): Phase 2 legal_representatives extraction for NO
```

Both PRs visible on origin/main per `gh pr view 136`/`137` returning `state: MERGED`.
