# Openapi.com Phase B — production depth + latency

**Date:** 2026-05-06
**Branch:** test/openapi-com-sandbox-2026-05-06
**Commits this phase:** aad7500 (walker fix), this report
**Production calls executed:** 0
**Real-money cost:** €0.00

## 1. Summary

**Phase B production sweep halted at the Step 3 walker-probe gate. No production money spent.**

The gate criteria (per the Phase B prompt):

| Criterion | Result |
|---|---|
| directors > 0% on IT-Stakeholders sandbox | ✓ pass — 100% recoverable via `data.managers[].roles[].role.description` |
| legal_form > 0% on ≥3 of 5 country-specific endpoints (DE/IT/ES/PT/AT) | ✗ **FAIL** — IT only, 1/5 |

DE/ES/PT/AT advanced sandbox response schemas verifiably do not expose any
form-shaped, type-shaped, juridical-shaped, or category-shaped key. This is
not a walker artifact; it is a real schema gap in those endpoints.

**Per-country recommendation (provisional, sandbox-evidence only — production
not exercised):**

| Country | Recommendation | Reason |
|---|---|---|
| IT | **lead candidate** | Full identity + `detailedLegalForm` + `data.managers[]` directors via IT-Stakeholders + ATECO classification + multi-year `balanceSheets`. Sandbox evidence: 100% identity, 100% legal_form, 100% directors via IT-Stakeholders, 100% financials. |
| DE | **fallback only** | Identity + LEI + NACE + financials. **No legal_form, no directors.** OpenRegister remains DE primary. |
| ES | **fallback only, possible lead pending production check** | Same shape as DE — identity + LEI + NACE + financials. **No legal_form, no directors.** Ranges between Compass tier-2 and unviable depending on whether ES has a stronger primary. Verify production response shape before promoting. |
| PT | **fallback only, possible lead pending production check** | Same shape as DE/ES. **No legal_form, no directors.** No PT primary in current Strale stack — Openapi could be PT primary on identity-only depth, but compliance use cases requiring legal-form / officers will not be served. |
| AT | **fallback only** | Same shape as DE. **No legal_form, no directors.** Compass remains AT primary. |
| FR/UK/BE/CH/PL (live integrations) | **solid fallback** confirmed | Sandbox identity coverage matches Phase A baseline; current primary integrations remain ahead on directors/legal_form. |
| NL + Gap-8 (HU/SI/BG/RO/LU/SK/MT/CY) | **NOT TESTED** — Phase B halted before production sweep | Production depth on these 9 countries was the highest-value question this phase was meant to answer; gate failure prevented spending production money to find out. Re-run blocked on either schema confirmation from Openapi (operator case 151296) or operator follow-up. |

**Bottom line for the addendum-sign decision:**

Openapi.com is a clear **lead candidate for IT** and a clear **fallback-tier
identity vendor** for DE/ES/PT/AT. The hope that Openapi could close the
Gap-8 country deficit is unverified — production sweep would have answered
this but cannot be justified given the sandbox-confirmed schema gap on the
five mid-rebuild countries that share Openapi's data architecture.

Recommend chat decide between (a) sign the addendum on the IT-lead +
fallback-only positioning (still useful — IT is the strongest single-country
gain in the Strale stack outside live integrations); (b) escalate operator
case 151296 to ask Openapi whether DE/ES/PT/AT advanced *production*
responses include legal_form and officer/director arrays absent from sandbox;
or (c) defer until Openapi confirms schema parity in writing.

## 2. Walker probe results (Step 2)

Probe script: `apps/api/scripts/openapi-walker-probe.ts`. Six sandbox calls
across IT-advanced, IT-Stakeholders, DE/ES/PT/AT-advanced. €0 cost. Full raw
bodies persisted to `docs/research/2026-05-06-openapi-phase-b-fixtures/`.

**Findings per field per country (from raw body inspection):**

| Field | IT-advanced | IT-Stakeholders | DE-advanced | ES-advanced | PT-advanced | AT-advanced |
|---|---|---|---|---|---|---|
| legal_form | ✓ `detailedLegalForm.code` ("SP") | n/a | **absent** | **absent** | **absent** | **absent** |
| directors | ✓ via `shareHolders[]` | ✓ `data.managers[].roles[].role.description` ("Managing director", "Sole owner") | **absent** | **absent** | **absent** | **absent** |
| nace_code | ✓ `atecoClassification.ateco.code` | n/a | ✓ `internationalClassification.nace.code` | ✓ same | ✓ same | ✓ same |
| financials | ✓ `balanceSheets.last` (turnover, employees, shareCapital, …) | n/a | ✓ `balanceSheets.last` (operatingRevenue, equity, totalAssets, employees) | ✓ same | ✓ same | ✓ same |
| identity (legal_name, vat, lei, address, status, incorporationDate) | ✓ all | partial (person-shaped, not company) | ✓ all | ✓ all | ✓ all | ✓ all |

**Conclusion:** legal_form and directors gaps on DE/ES/PT/AT are
schema-level, not walker-level. The walker fix recovers everything that
exists in the response.

**Coverage delta after walker fix (Phase A baseline → Phase A re-run with
fixed walker):**

| Field | Baseline | After fix | Delta |
|---|---:|---:|---:|
| directors | 0/41 (0%) | 3/41 (7%) | +3 (IT-Stakeholders + IT shareHolders + 1 IT WW) |
| legal_form | 0/41 (0%) | 4/41 (10%) | +4 (all 4 IT calls) |
| nace_code | 2/41 (5%) | 20/41 (49%) | +18 (nested `nace.code` + `ateco.code`) |
| financials | not measured | 20/41 (49%) | new dimension |

Other fields unchanged (legal_name 100%, registration_number 100%, status 98%,
registered_address 100%, incorporation_date 98%, vat_number 90%, lei 49%,
share_capital 5%).

## 3. Production access verification (Step 4)

**Not executed.** Step 3 gate failure halted the sweep before any
production-tier work began. Token mint, scope check, trivial call: all
deferred.

If chat decides to proceed despite the gate failure, Step 4 must run first.
Re-running this branch's Phase B harness with `--production` will surface:
the production token-mint result, the `oauth.openapi.it/scopes` response
(confirming `company.openapi.com` scope is propagated post-TULPS), and a
single trivial call against the production wallet to verify top-up.

## 4. Phase B1 mid-rebuild (DE/IT/ES/PT/AT)

**Not executed.** See Section 1.

If chat clears Step 3, the Phase B1 high-value calls are:
- IT-advanced + IT-Stakeholders on OPENAPI SRL (replays sandbox shape on
  production wallet — confirms data parity)
- IT-advanced on a sourced IT SME (smaller, less canary-shaped) to verify
  SME coverage matches blue-chip
- DE/ES/PT/AT-advanced on the mid-cap canaries to confirm the schema gap
  identified in sandbox replays in production (or — the upside case —
  reveals that production exposes legal_form / directors that sandbox elides)

## 5. Phase B2 NL + Gap-8

**Not executed.** See Section 1.

The Gap-8 production probe was the single highest-value question of this
phase. Without it, we cannot tell whether Openapi closes any of HU/SI/BG/RO/
LU/SK/MT/CY — i.e., whether the addendum buys coverage Strale doesn't have
elsewhere, or duplicates what Tier-2 vendors already provide.

## 6. Latency

**Not executed.** Phase A serial baseline (1.6–2.6s p50 per Phase A report
section 2) is the only data point. Concurrency=10 probe deferred.

## 7. Per-country recommendation

See Section 1 table. Caveat: all recommendations are sandbox-evidence-only.
Production may surface additional fields (or may not). Without the production
sweep, the recommendation strength is bounded by sandbox observability.

## 8. Total cost spent vs €5 budget

| Step | Calls | Cost |
|---|---:|---:|
| Step 2 walker probe (sandbox) | 6 | €0.00 (virtual credit) |
| Step 4 production verification | 0 | €0.00 |
| Step 5 SME sourcing | 0 | €0.00 |
| Step 6 Phase B1 | 0 | €0.00 |
| Step 7 Phase B2 | 0 | €0.00 |
| Step 8 latency | 0 | €0.00 |
| **Total real-money spend** | **0** | **€0.00 of €5.00 budget** |

## 9. Open questions for follow-up

1. **Operator case 151296 — schema parity question.** Does the production
   `DE-advanced` / `ES-advanced` / `PT-advanced` / `AT-advanced` response
   include `legalForm` / `companyType` / `juridicalForm` / `directors` /
   `officers` / `management` arrays under any key, or are they truly absent
   from the data product on those countries? If the schema is identical to
   sandbox, the addendum-sign discussion changes from "lead candidate for IT,
   fallback elsewhere" to "lead candidate for IT, identity-only fallback
   elsewhere".

2. **Gap-8 production coverage.** Independent of the schema parity question,
   does Openapi return non-empty WW-Start / WW-Advanced responses for HU /
   SI / BG / RO / LU / SK / MT / CY entities at all, or do those endpoints
   404? This is fundamental to the strong-candidate framing under
   DEC-20260506-A.

3. **IT-Stakeholders production cost vs sandbox shape.** IT-Stakeholders
   sandbox returned `data.managers[]` with role decoded ("Managing director",
   "Sole owner"). Confirm production retains the same shape and that the
   €0.20 PAYG price is correct.

4. **Walker fix should land regardless.** The walker improvements (directors,
   legal_form via `detailedLegalForm`, nace via nested key, financials via
   `balanceSheets`) are real and were committed at aad7500. They benefit any
   future Openapi-backed capability handler regardless of the addendum
   outcome.

5. **Phase A report was overwritten** by the walker re-run at this commit —
   the previous Phase A report file at f55cefa now reflects walker-fixed
   coverage. The original (pre-walker-fix) numbers are preserved in the
   commit message of aad7500 and in this report's Section 2 delta table.

## Appendix — deviations from the prompt's verification spec

- The prompt's Verification block expected `git ls-remote origin
  test/openapi-com-sandbox-2026-05-06` to show the branch absent on origin.
  At session start the branch was already pushed (origin tip = f55cefa from
  Phase A). The "Do NOT push" instruction still applies — the new commit
  aad7500 (and any further commits this phase) remain local. Branch state on
  origin is unchanged from session start.
- The prompt's commit plan called for three commits. Only two will land:
  the walker fix (aad7500) and this report. The "test: phase B production
  sweep — 14 countries" commit is skipped because the gate failure
  prevented running the sweep.
- The prompt assigned a `financials` field as part of the Step 6 capture
  template. The walker fix lands `financials` as a tracked REQUIRED_FIELD
  earlier than planned, but only sandbox data populates it. Production
  values would replace these once Step 6 runs.
