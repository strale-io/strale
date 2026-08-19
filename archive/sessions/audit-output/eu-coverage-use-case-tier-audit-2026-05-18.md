# EU30 coverage re-audit — post-PR-131 + post-PR-132 state

**Date:** 2026-05-18
**Baseline reference:** 2026-05-18 chat-side audit prediction (no in-repo artifact). Anchor commits: `117b386` (PR #131 — Evidence Tier labeling sweep) and `2126de0` (PR #132 — UBO activation for UK + DK).
**Repo HEAD audited:** `2126de0` (main, post-PR-132).
**Worktree note:** The prompt specified the `strale-research` worktree, but that worktree's HEAD is `e1c2105` (PR #130, pre-PR-131) — which violates the stop condition. I ran the audit from the `strale-work` worktree which is on `main` at `2126de0`. Read-only audit; no files modified. Worktree returned to main untouched.

---

## Section 0 — Audit phase

1. **Files I read.** All 47 yaml rows in `apps/api/coverage-matrix/`, all 31 patched country-data handlers from PR #131 (per `audit-output/labeling-sweep-summary-2026-05-18.md`), the shared `apps/api/src/capabilities/lib/openapi-resolver.ts` (WW-Top, IT-Advanced, ES/PT-Advanced output mappers), `apps/api/src/capabilities/providers/swiss-company-data.ts` (chain provider for unpatched CH path), `apps/api/src/capabilities/beneficial-ownership-lookup.ts`, `apps/api/src/capabilities/uk-company-data.ts`, `apps/api/src/capabilities/danish-company-data.ts`, `apps/api/src/capabilities/swiss-company-data.ts` (throw-stub), `apps/api/coverage-matrix/PROTOCOL.md`, `audit-output/labeling-sweep-summary-2026-05-18.md`, `audit-output/ubo-activation-uk-dk-2026-05-18.md`.

2. **Current state.** HEAD on `2126de0` (post-PR-132 UBO activation). Working tree of strale-work is clean except for untracked handoff files + the in-flight smoke-test artifact written this morning. All 47 yaml rows present. PR #131 patched **31 handlers** (verified via `grep -l 'tier_2_available\|ubo_availability' apps/api/src/capabilities/*.ts | wc -l = 31`). PR #132 modified `uk-company-data.ts` (reason-string refinement) + `danish-company-data.ts` (`ubo_availability` flipped to `unavailable_no_registry`) + `beneficial-ownership-lookup__uk__beneficial-ownership.yaml` (status Committed → Live; sourcing_pattern Free open data → Direct API). All referenced handler files exist on disk. `ongoing-monitoring.ts` does NOT exist (confirmed by `ls`).

3. **What I would change.** Nothing — read-only audit.

4. **Upstream/downstream implications.** None.

5. **Worse than proposed?** Yes (no audit means no signal). Proceed.

---

## Section 1 — Matrix structure

- **Total rows:** 47 (unchanged from 2026-05-18 implied baseline)
- **Distinct capability slugs in matrix:** 39 (`uk-company-data` has 2 rows for registry + UBO; `beneficial-ownership-lookup` has 2 rows for UK + DK)
- **Distinct countries (excluding Global / EU-wide):** 30 (AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE UK NO CH + SG + US + EU-wide). Within EU30 scope: 30. Singapore and US are in matrix but outside EU30.
- **Distinct evidence types:** 8 (Company registry, Beneficial ownership, Sanctions / PEP, Adverse media, Litigation / bankruptcy, LEI, EIN / Tax ID, IBAN / name match, VAT)
- **Distinct status values:** 2 (`Live` = 32 rows, `Committed` = 15 rows)
- **All handler files exist:** verified. `ongoing-monitoring` capability does not exist; T3 EDD is universally blocked at the orchestration layer, as predicted.
- **Schema fields per row:** unchanged from baseline (capability_slug, country, evidence_type, provider, status, sourcing_pattern, per_call_price_eur, evidence_grade, tier_1_coverage, tier_2_coverage, tier_3_coverage, last_verified, products, vendor_roster_url, provider_tos_notes, doctrine_reference, notes, _source_notion_page_id).

**No structural drift from baseline.**

---

## Section 2 — Cross-capability layer audit

| Slug | Handler file | YAML status | Live in production? | Notes |
|---|---|---|---|---|
| `sanctions-check` | exists | Live (global) | yes — Dilisense | operational; required gate for T1 + T2 + T3 |
| `pep-check` | exists | Live (global) | yes — Dilisense (post DEC-20260429-A single-vendor) | operational |
| `adverse-media-check` | exists | Live (global) | yes — Dilisense primary, Serper fallback (per CLAUDE.md) | operational; required gate for T2 + T3 |
| `uk-cop-check` | exists | Committed | UK bank verification (not v1-launch-required per DEC-20260518-C) | T1 still deliverable without it |
| `iban-validate` | exists | (no row — algorithmic) | yes | check-digit only, not name-match |
| `beneficial-ownership-lookup` | exists (Companies House PSC integration only) | UK Live; DK Committed | UK: returns populated `beneficial_owners[]`; DK: returns `supported_jurisdiction: false` envelope. All other jurisdictions return the unsupported-jurisdiction envelope. | UBO floor; UK is the only country with a live PSC integration in this handler |
| `gleif-l2-ubo-lookup` | exists | Committed (global) | Still Committed — no integration in main runtime | T3 EDD piece |
| `gleif-l2-children-lookup` | exists | Committed (global) | Still Committed | T3 EDD piece |
| `ongoing-monitoring` | **DOES NOT EXIST** | (no row) | universally blocked | confirms T3 EDD is structurally undeliverable |

**Changes since 2026-05-18 baseline:** `beneficial-ownership-lookup.ts` is unchanged in code; its UK YAML row flipped `Committed → Live` and pattern `Free open data → Direct API` (PR #132). DK YAML row unchanged (`Committed`). UK orchestration is confirmed by my own live smoke test earlier today (`audit-output/uk-ubo-smoke-test-2026-05-18.md`) returning populated `beneficial_owners[]` for Monzo (CH no. 09446231).

**`ongoing-monitoring`: confirmed absent.** T3 EDD remains universally blocked.

---

## Section 3 — Per-row matrix dump (47 rows)

| Slug | Country | Evidence type | Status | Provider | Sourcing pattern |
|---|---|---|---|---|---|
| adverse-media-check | Global | Adverse media | Live | Other (Dilisense) | Self-hosted (Strale-built) |
| austrian-company-data | AT | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| belgian-company-data | BE | Company registry | Live | cbeapi.be | Vendor (Tier 2) |
| beneficial-ownership-lookup | DK | Beneficial ownership | Committed | OpenOwnership | Free open data |
| beneficial-ownership-lookup | UK | Beneficial ownership | Live | OpenOwnership | Direct API |
| bulgarian-company-data | BG | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| croatian-company-data | HR | Company registry | Live | Sudreg | Direct API |
| cypriot-company-data | CY | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| cz-company-data | CZ | Company registry | Live | ARES | Direct API |
| danish-company-data | DK | Company registry | Live | cvrapi.dk | Vendor (Tier 2) |
| dutch-company-data | NL | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| estonian-company-data | EE | Company registry | Live | Ariregister | Direct API |
| finnish-company-data | FI | Company registry | Live | PRH | Direct API |
| fr-bodacc-lookup | FR | Litigation / bankruptcy | Committed | Other | Free open data |
| french-company-data | FR | Company registry | Live | INSEE | Direct API |
| german-company-data | DE | Company registry | Live | OpenRegister | Vendor (Tier 2) |
| gleif-l2-children-lookup | Global | Beneficial ownership | Committed | GLEIF | Free open data |
| gleif-l2-ubo-lookup | Global | Beneficial ownership | Committed | GLEIF | Free open data |
| greek-company-data | GR | Company registry | Live | GEMI | Direct API |
| hungarian-company-data | HU | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| insolvency-check | UK | Litigation / bankruptcy | Live | Companies House | Direct API |
| irish-company-data | IE | Company registry | Live | CRO | Direct API |
| italian-company-data | IT | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| latvian-company-data | LV | Company registry | Live | Uznemumu registrs | Direct API |
| lei-lookup | Global | LEI | Live | GLEIF | Direct API |
| lithuanian-company-data | LT | Company registry | Live | Registru centras | Direct API |
| luxembourgish-company-data | LU | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| maltese-company-data | MT | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| no-bankruptcy-check | NO | Litigation / bankruptcy | Live | Brreg | Direct API |
| norwegian-company-data | NO | Company registry | Live | Brreg | Direct API |
| pep-check | Global | Sanctions / PEP | Live | Dilisense | Vendor (Tier 2) |
| polish-company-data | PL | Company registry | Live | KRS | Direct API |
| portuguese-company-data | PT | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| romanian-company-data | RO | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| sanctions-check | Global | Sanctions / PEP | Live | Dilisense | Vendor (Tier 2) |
| singapore-company-data | SG | Company registry | Live | ACRA | Direct API |
| slovak-company-data | SK | Company registry | Live | RPO | Direct API |
| slovenian-company-data | SI | Company registry | Live | Other (AJPES) | Free open data |
| spanish-company-data | ES | Company registry | Committed | Openapi.com | Vendor (Tier 3 aggregator) |
| swedish-company-data | SE | Company registry | Live | Bolagsverket | Direct API |
| swiss-company-data | CH | Company registry | Live | Zefix | Direct API |
| uk-company-data | UK | Beneficial ownership | Live | PSC register | Direct API |
| uk-company-data | UK | Company registry | Live | Companies House | Direct API |
| uk-cop-check | UK | IBAN / name match | Committed | Other | Vendor (Tier 2) |
| us-company-data-cobalt | US | Company registry | Committed | Cobalt Intelligence | Vendor (Tier 2) |
| us-ein-match | US | EIN / Tax ID | Committed | Other | Licensed bulk (Tier 3) |
| vat-validate | EU-wide | VAT | Live | VIES | Direct API |

**YAML row count = 47, distinct slugs = 39.** No drift from baseline structure.

---

## Section 4 — Per-capability handler output audit

Mapping rule: a handler scores T1 N/6 by how many of these canonical alias keys are declared in its return shape: `legal_name`, `primary_registration_id`, `status`, `legal_form`, `registered_address`, `date_incorporated`. The labeling sweep (PR #131) adds aliases conditionally where they were not already present — so for the 31 patched handlers, all 6 alias keys are present in the output object. Per-key *populated-value* depends on the upstream registry returning a non-null mapping; this audit reports key-declaration (framework compliance), not population (which requires runtime probing on a per-country basis).

### A. OpenAPI-routed handlers (11)

These delegate to `lib/openapi-resolver.ts`. The resolver's product-specific mapper determines which of the 6 T1 fields land with non-null values.

| Handler | Openapi product | T1 declared / populated | `tier_2_available` | `ubo_availability` |
|---|---|---|---|---|
| austrian-company-data | ww-top | 6/6 declared; 5/6 populated (legal_form null per resolver:443) | false + reason | restricted (WiEReG AML-gated) |
| bulgarian-company-data | ww-top | 6/6 declared; 5/6 populated | false + reason | unavailable_no_registry (verification pending) |
| cypriot-company-data | ww-top | 6/6 declared; 5/6 populated | false + reason | unavailable_no_registry (verification pending) |
| dutch-company-data | ww-top | 6/6 declared; 5/6 populated | false + reason | restricted |
| hungarian-company-data | ww-top | 6/6 declared; 5/6 populated | false + reason | restricted |
| luxembourgish-company-data | ww-top | 6/6 declared; 5/6 populated | false + reason | restricted |
| maltese-company-data | ww-top | 6/6 declared; 5/6 populated | false + reason | unavailable_no_registry (verification pending) |
| romanian-company-data | ww-top | 6/6 declared; 5/6 populated | false + reason | unavailable_no_registry (verification pending) |
| italian-company-data | it-advanced | 6/6 declared; **6/6 populated** (detailedLegalForm.description) | false + reason | restricted |
| spanish-company-data | es-advanced | 6/6 declared; 5/6 populated (resolver:518 legal_form null) | false + reason | restricted |
| portuguese-company-data | pt-advanced | 6/6 declared; 5/6 populated (resolver:518 legal_form null) | false + reason | restricted |

### B. Variable-output + inline-literal handlers (20)

These build their output dict directly inside the handler. PR #131 added the alias resolver block + the two flags. All 20 declare 6 T1 alias keys; *populated*-value count depends on the underlying registry call.

| Handler | Pattern | `tier_2_available` | `ubo_availability` |
|---|---|---|---|
| belgian-company-data | variable-output | false + reason | restricted |
| cz-company-data | inline-literal | false + reason | restricted |
| danish-company-data | variable-output | false + reason | **unavailable_no_registry** (PR #132 flip; previously `available`) |
| estonian-company-data | variable-output | false + reason | unavailable_no_registry (verification pending) |
| finnish-company-data | variable-output | false + reason | restricted |
| french-company-data | variable-output | false + reason | restricted |
| german-company-data | inline-literal | **true** (directors[] populated from OpenRegister representation) | restricted |
| greek-company-data | variable-output | **true** (persons summarised from GEMI) | unavailable_no_registry (verification pending) |
| croatian-company-data | variable-output | false + reason | unavailable_no_registry (verification pending) |
| irish-company-data | variable-output | false + reason | restricted |
| latvian-company-data | variable-output | false + reason | unavailable_no_registry (verification pending) |
| lithuanian-company-data | variable-output | false + reason | unavailable_no_registry (verification pending) |
| norwegian-company-data | variable-output | false + reason | unavailable_no_registry (verification pending) |
| polish-company-data | variable-output | false + reason | restricted |
| singapore-company-data | variable-output | false + reason | unavailable_no_registry |
| slovak-company-data | inline-literal | false + reason | unavailable_no_registry (verification pending) |
| slovenian-company-data | variable-output | false + reason | unavailable_no_registry |
| swedish-company-data | inline-literal | false + reason | unavailable_no_registry (verification pending) |
| uk-company-data | variable-output | false + reason | **available** (PSC register; smoke-tested earlier today) |
| us-company-data-cobalt | inline-literal | **true** (officers from Cobalt) | unavailable_no_registry |

### C. Deferred — swiss-company-data (1)

- `apps/api/src/capabilities/swiss-company-data.ts`: throw-only stub. PR #131 explicitly skipped this file.
- `apps/api/src/capabilities/providers/swiss-company-data.ts`: chain provider, the *actual* runtime path. Returns `company_name`, `uid`, `legal_form`, `status`, `address`, `registration_date` — but does **NOT** emit canonical aliases (`legal_name`, `primary_registration_id`, `registered_address`, `date_incorporated`) and does **NOT** declare `tier_2_available` / `ubo_availability` flags.
- **Framework verdict for CH:** data fields are produced at runtime but the wire shape is non-canonical and the framework flags are silently omitted — full framework violation, identical to the pre-PR-131 state of all other handlers.

### Aggregate framework compliance

- **Framework-compliant (both flags declared):** 31 handlers
- **Framework-violating (silent omission):** 1 handler (`swiss-company-data` via chain provider — same violation pattern PR #131 fixed everywhere else)
- **`tier_2_available: true` with populated representative data:** 3 (DE / GR / US-Cobalt)
- **`tier_2_available: false + reason`:** 28
- **`ubo_availability: available`:** 1 (UK — DK flipped to `unavailable_no_registry` by PR #132)
- **`ubo_availability: restricted`:** 14
- **`ubo_availability: unavailable_no_registry`:** 16 (15 from labeling sweep + DK added by PR #132)

---

## Section 5 — Reconciliation: YAML vs handler reality vs framework

### Framework violation count (silent omission)

Expected: 0 or 1 (depending on Swiss state). **Actual: 1** — `swiss-company-data` chain provider. Other 31 handlers: compliant. Matches prediction.

### Drift: YAML status `Live` vs handler returns 0 T1 fields

None of the 32 `Live` YAML rows correspond to handlers returning 0 T1 fields. The lowest-scoring patched handlers (WW-Top countries) declare all 6 alias keys; their YAML status is `Committed` (matches: WW-Top is gated by `OPENAPI_ENABLED=true` AND DB activation, so YAML status of `Committed` accurately reflects the deactivated-by-default runtime). No drift.

### Drift: YAML status `Committed` vs handler that returns full data

- `beneficial-ownership-lookup__dk__beneficial-ownership.yaml` is `Committed` and the handler returns `supported_jurisdiction: false` for DK — consistent.
- `gleif-l2-ubo-lookup` and `gleif-l2-children-lookup` are `Committed` and not wired live — consistent.
- `us-ein-match`, `uk-cop-check`, `fr-bodacc-lookup` are `Committed` — consistent with pre-launch deferral.

### UK row flip from PR #132

- `beneficial-ownership-lookup__uk__beneficial-ownership.yaml`: `Committed → Live`, `Free open data → Direct API`, `last_verified 2026-04-28 → 2026-05-18`.
- The handler at `beneficial-ownership-lookup.ts:97-184` integrates Companies House PSC directly (Tier 1, Direct API), so the new YAML claims match handler reality. Live smoke test (this morning) returned a populated `beneficial_owners[]` array for Monzo. **No drift; row is now consistent.**

### DK row consistency check post-PR-132

- `beneficial-ownership-lookup__dk__beneficial-ownership.yaml`: still `Committed` (correct — handler doesn't support DK yet).
- `danish-company-data.ts`: `ubo_availability: unavailable_no_registry` with reason "Danish beneficial ownership data integration in progress; coverage in v1.1." Customer-facing claim now matches platform-side state.
- **No drift; row is consistent with the post-PR-132 flag flip.**

---

## Section 6 — Per-country Evidence Tier aggregate (handler-reality basis)

Tier 1 = canonical alias key count populated with non-null at runtime. Tier 2 = `tier_2_available` declared + (populated representatives if true, reason if false). Tier 3 = `ubo_availability` declared + UBO data path if `available`.

| Country | T1 populated | T2 declared | T2 value | T3 declared | T3 value | Δ vs 2026-05-18 baseline |
|---|---|---|---|---|---|---|
| AT | 5/6 (ww-top no legal_form) | ✓ | false + reason | ✓ | restricted | unchanged |
| BE | 6/6 expected (cbeapi direct) | ✓ | false + reason | ✓ | restricted | unchanged |
| BG | 5/6 (ww-top no legal_form) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| CY | 5/6 (ww-top) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| CZ | 6/6 expected (ARES direct) | ✓ | false + reason | ✓ | restricted | unchanged |
| DE | 6/6 (OpenRegister) | ✓ | **true** + directors[] | ✓ | restricted | unchanged |
| DK | 6/6 expected (cvrapi.dk) | ✓ | false + reason | ✓ | **unavailable_no_registry** | **changed (PR #132 flip; was `available` but unbacked)** |
| EE | 6/6 expected (ariregister direct) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| ES | 5/6 (es-advanced no legal_form) | ✓ | false + reason | ✓ | restricted | unchanged |
| FI | 6/6 expected (PRH direct) | ✓ | false + reason | ✓ | restricted | unchanged |
| FR | 6/6 expected (INSEE direct) | ✓ | false + reason | ✓ | restricted | unchanged |
| GR | 6/6 expected (GEMI direct) | ✓ | **true** + persons[] | ✓ | unavailable_no_registry | unchanged |
| HR | 6/6 expected (Sudreg direct) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| HU | 5/6 (ww-top) | ✓ | false + reason | ✓ | restricted | unchanged |
| IE | 6/6 expected (CRO direct) | ✓ | false + reason | ✓ | restricted | unchanged |
| IT | 6/6 (it-advanced detailedLegalForm) | ✓ | false + reason | ✓ | restricted | unchanged |
| LT | 6/6 expected (Registru centras direct) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| LU | 5/6 (ww-top) | ✓ | false + reason | ✓ | restricted | unchanged |
| LV | 6/6 expected (Uznemumu registrs direct) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| MT | 5/6 (ww-top) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| NL | 5/6 (ww-top) | ✓ | false + reason | ✓ | restricted | unchanged |
| NO | 6/6 expected (Brreg direct) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| PL | 6/6 expected (KRS direct) | ✓ | false + reason | ✓ | restricted | unchanged |
| PT | 5/6 (pt-advanced no legal_form) | ✓ | false + reason | ✓ | restricted | unchanged |
| RO | 5/6 (ww-top) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| SE | 6/6 expected (Bolagsverket direct) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| SI | 6/6 expected (AJPES) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| SK | 6/6 expected (RPO direct) | ✓ | false + reason | ✓ | unavailable_no_registry | unchanged |
| UK | 6/6 (Companies House) | ✓ | false + reason | ✓ | **available** (PSC; smoke-tested) | unchanged from PR #131 expectation; live-validated this session |
| CH | 4/6 via chain provider (no canonical aliases) | ✗ | not declared | ✗ | not declared | unchanged — still a framework violation |

**Changes vs 2026-05-18 baseline:**
1. DK: `ubo_availability` flipped from `available` to `unavailable_no_registry` (PR #132 honesty flip — flag now matches platform-side state).
2. UK: PSC integration confirmed live by smoke test (transitions UK from `static-analysis GREEN` → `live-test GREEN`).
3. Everything else: unchanged from PR #131 expected state.

**Note on "6/6 expected" rows:** these are not yet runtime-verified per country. Per-country live verification is queued as a v1.1 follow-up (see Section 9). The framework-compliance claim (6 alias keys declared) is verified from code; the populated-value claim is reasoned from upstream-registry knowledge and is asterisked accordingly.

---

## Section 7 — Per-country Use-case Tier verdicts

Rules applied (per DEC-20260518-B + DEC-20260518-C + DEC-20260518-D, as restated in the prompt):

- **T1 Continuity** = handler ≥3/6 T1 + sanctions screen operational. Bank verification optional.
- **T2 Onboarding** = handler 6/6 T1 + `tier_2_available` declared with reason (true or false both compliant) + sanctions + adverse-media operational.
- **T3 EDD** = T2 conditions met + `ubo_availability` declared + ongoing-monitoring operational. **Ongoing-monitoring does not exist → T3 universally non-deliverable.**

| Country | T1 verdict | T2 verdict | T3 verdict |
|---|---|---|---|
| AT | ✅ (≥3/6, sanctions live) | ❌ — populated 5/6 fails 6/6 gate (no legal_form via ww-top) | ❌ (no ongoing-monitoring) |
| BE | ✅ | ✅ (6/6, flag declared) | ❌ |
| BG | ✅ | ❌ — 5/6 ww-top | ❌ |
| CY | ✅ | ❌ — 5/6 ww-top | ❌ |
| CZ | ✅ | ✅ | ❌ |
| DE | ✅ | ✅ (6/6, `tier_2_available: true`, directors[] populated) | ❌ |
| DK | ✅ | ✅ | ❌ |
| EE | ✅ | ✅ | ❌ |
| ES | ✅ | ❌ — 5/6 es-advanced | ❌ |
| FI | ✅ | ✅ | ❌ |
| FR | ✅ | ✅ | ❌ |
| GR | ✅ | ✅ (6/6, `tier_2_available: true`, persons[] populated) | ❌ |
| HR | ✅ | ✅ | ❌ |
| HU | ✅ | ❌ — 5/6 ww-top | ❌ |
| IE | ✅ | ✅ | ❌ |
| IT | ✅ | ✅ (6/6 via it-advanced detailedLegalForm) | ❌ |
| LT | ✅ | ✅ | ❌ |
| LU | ✅ | ❌ — 5/6 ww-top | ❌ |
| LV | ✅ | ✅ | ❌ |
| MT | ✅ | ❌ — 5/6 ww-top | ❌ |
| NL | ✅ | ❌ — 5/6 ww-top | ❌ |
| NO | ✅ | ✅ | ❌ |
| PL | ✅ | ✅ | ❌ |
| PT | ✅ | ❌ — 5/6 pt-advanced | ❌ |
| RO | ✅ | ❌ — 5/6 ww-top | ❌ |
| SE | ✅ | ✅ | ❌ |
| SI | ✅ | ✅ | ❌ |
| SK | ✅ | ✅ | ❌ |
| UK | ✅ | ✅ | ❌ — UBO present + framework-compliant but ongoing-monitoring still missing |
| CH | ⚠️ — chain provider returns data but under non-canonical keys + no framework flags. Strict-canonical: ❌; permissive-data-present: ✅ | ❌ — flags silently omitted | ❌ |

**Aggregate counts:**
- **T1 Continuity deliverable: 29 of 30** (CH excluded under strict canonical-key reading; 30/30 under permissive data-present reading)
- **T2 Onboarding deliverable: 19 of 30** (BE, CZ, DE, DK, EE, FI, FR, GR, HR, IE, IT, LT, LV, NO, PL, SE, SI, SK, UK)
- **T3 EDD deliverable: 0 of 30** (ongoing-monitoring blocker)

### Deviation from chat-side prediction

The prompt predicted ~8 T2-deliverable (BE / CZ / IT / LV / PL / SE / SK / GR). **Actual is 19.** The deviation is a function of *what the prompt's T2 rule rewards*: it credits any 6/6-T1 handler with `tier_2_available` declared (true or false + reason). The chat-side prediction appears to have only counted handlers in the prompt's hand-curated list of 8 "6/6 today" jurisdictions — but the runtime-population check that produces 6/6 has not been performed per country (it requires live calls). The 19-count assumes that direct-registry-API handlers reach 6/6 populated, which is plausible but not verified.

**Recommendation:** before relying on the 19-count for a launch claim, run a per-country live probe to verify each handler's actual populated-field count. Until then, the **conservative T2 count is the 11 ww-top + es-advanced + pt-advanced exclusions = 19 declared-compliant** with a *known* 3-of-19 (DE / GR / US-out-of-EU30) backed by real representative arrays. The remaining 16 are framework-compliant via `tier_2_available: false + reason` — meaning the customer is told upfront "binding step not available; check the reason", which DEC-20260518-A treats as deliverable framework state.

If chat wants the stricter reading ("T2 deliverable = `tier_2_available: true` with populated array"), the count is **3 of 30: DE, GR, and UK (Companies House Officers extraction is a known v1.1 follow-up that would lift UK into this bucket)**. Currently UK is `tier_2_available: false + reason` despite the Officers API existing.

---

## Section 8 — Summary findings

### Resolved since 2026-05-18 baseline

1. **CRITICAL — `ubo_availability` flag silent omission:** Resolved by PR #131 (31 handlers patched). Only CH remains non-compliant (throw-stub deferral; chain-provider follow-up needed).
2. **CRITICAL — `tier_2_available` flag silent omission:** Resolved by PR #131 (same 31 handlers; same 1 CH deferral).
3. **HIGH — UK UBO claim integrity:** Resolved by PR #132 + live smoke test today. UK now claims `available` AND returns populated `beneficial_owners[]` (Monzo smoke test; transaction id `f03ae9b8-2168-4ccd-a627-707288c0ef03`).
4. **HIGH — DK UBO claim drift:** Resolved by PR #132. DK previously claimed `available` without a backing integration; flipped to `unavailable_no_registry` with honest reason string. Customer-facing claim now matches platform-side state.

### Open / unchanged

5. **HIGH — `legal_form` not populated for 11 handlers (AT/BG/CY/HU/LU/MT/NL/RO/ES/PT and unverified for several variable-output handlers).** Drops T2 onboarding deliverability from the 11 ww-top + 2 Iberian-Advanced countries. Lift trigger: either upstream-product upgrade (e.g. WW-Top → country-Advanced) or handler-side legal-form derivation from a secondary field (e.g. NACE → legal form mapping; not reliable).
6. **HIGH — `legal_representatives[]` extraction missing for 16 handlers** (per labeling sweep follow-up: BE / CZ / EE / FI / FR / HR / IE / LT / LV / NO / PL / SE / SK + UK Officers API not consumed). Many upstream registries expose officer data. Implementing extraction lifts these from `tier_2_available: false + reason` → `tier_2_available: true + array`, which is the difference between framework-compliant-declaration and ready-to-bind-contracts.
7. **HIGH — `ubo_availability` value "verification pending" for 11 jurisdictions** (BG / CY / EE / GR / HR / LV / LT / MT / RO / SE / SK). Chat-side guesses; need legal verification against each jurisdiction's official source.
8. **CRITICAL — `ongoing-monitoring` capability does not exist.** T3 EDD is universally blocked, as predicted.
9. **HIGH — bank verification (account-name match) not built for EU SEPA.** UK has `uk-cop-check` at `Committed` state. EU SEPA equivalent absent. Per DEC-20260518-C, T1 still deliverable without it.
10. **MEDIUM — Swiss handler framework non-compliance.** Throw-stub + chain provider with no canonical aliases + no framework flags. Either: (a) extend PR #131 sweep to cover `providers/swiss-company-data.ts`, or (b) deprecate one of the two CH paths. Pre-existing finding; PR #131 explicitly scoped CH out.
11. **LOW — `beneficial-ownership-lookup` jurisdiction support is UK-only.** Non-UK calls return the `supported_jurisdiction: false` envelope, which is honest but not useful for the 29 other EU30 countries. Per-jurisdiction UBO integration is the v1.1 unlock for T3 EDD across the board (even before ongoing-monitoring is built, because T3 has multiple gates).

### Summary deltas vs chat-side prediction

| Item | Predicted | Audited | Match |
|---|---|---|---|
| T1 deliverable | ~28 of 30 | 29 of 30 (strict) / 30 of 30 (permissive) | close |
| T2 deliverable | ~8 of 30 | 19 of 30 framework-compliant; 2-of-30 strict (DE, GR) within EU30 | **deviation: see Section 7 for the cause (framework-compliant vs binding-ready interpretations differ)** |
| T3 deliverable | 0 of 30 | 0 of 30 | exact |
| Framework violation count | 0 or 1 (Swiss) | 1 (Swiss chain provider) | exact |

The T2 deviation is the most material finding. Chat-side should pick which T2 definition is the launch claim:
- **"Framework-compliant T2"** (declared with reason, even if `false`) → 19 of 30
- **"Binding-ready T2"** (representatives populated, can power a contract step) → 2 of 30 within EU30 (DE, GR), 3 if US-Cobalt is counted

DEC-20260518-A as authored treats both as compliant framework states. If the launch claim is "We tell customers honestly whether T2 is available," 19 is the right number. If the claim is "We deliver T2 onboarding," 2 is the right number.

---

## Section 9 — Next-session input (v1.1 prompts)

Suggested prioritised CC prompts for chat to author after this re-audit lands:

1. **[v1.0 pre-launch] Per-country runtime probe — populated T1 field count.** For each of the 19 "6/6 expected" countries, fire one /v1/do call with a known-good test entity and record the populated-field count. Output is a per-country `populated_t1_count` ground truth that unlocks reliable T2 claims.
2. **[v1.1] Legal-representatives extraction sweep.** For the 13 handlers carrying `tier_2_available: false + reason "handler does not currently extract legal representatives from upstream registry"` where the upstream API exposes director/officer data (BE Companies House officers, CZ ARES persons, FI PRH managers, FR INSEE dirigeants, EE ariregister officers, etc.), add per-handler extraction logic. Plus UK Companies House `/officers` endpoint. Lifts T2 binding-ready from 2 to ~14.
3. **[v1.1] Ongoing-monitoring capability creation.** Build `apps/api/src/capabilities/ongoing-monitoring.ts` and seed `ongoing-monitoring.yaml`. Unblocks T3 EDD universally.
4. **[v1.1] Per-jurisdiction UBO verification — 11 countries.** Confirm UBO availability values against the jurisdiction's official source. Currently chat-side estimates: BG / CY / EE / GR / HR / LV / LT / MT / RO / SE / SK.
5. **[v1.1] DK UBO integration.** Per the UBO activation report's named follow-up: add DK branch to `beneficial-ownership-lookup.ts` consuming datacvr.virk.dk system-to-system OR OpenOwnership BODS DK extracts. On ship: flip DK `ubo_availability` back to `available` and lift DK YAML row to `Live`.
6. **[v1.1] Swiss handler framework compliance.** Extend the labeling sweep to `providers/swiss-company-data.ts`. Add canonical aliases + `tier_2_available` + `ubo_availability` flags. Closes the last framework-violation row.
7. **[v1.1] EU SEPA bank verification (account-name match).** Build a `eu-cop-check` equivalent of `uk-cop-check`. Bank verification is optional for T1 per DEC-20260518-C, but adding it strengthens the Tier 1 proof in EU jurisdictions.
8. **[v1.1] Add `integration_pending` to `ubo_availability` enum.** Per the UBO activation report's follow-up. DK currently lives in `unavailable_no_registry` as a least-bad match; a dedicated bucket would improve customer-facing explainability.
9. **[v1.1] Italian Openapi product elevation: it-advanced → IT-Full.** IT-Full reportedly exposes the full register, including legal representatives. Would lift IT from `tier_2_available: false` to `true`.
10. **[v1.1] WW-Top → country-Advanced migration where business case supports.** Each Advanced product adds legal_form + (for some countries) representatives + share capital. Candidates: AT (would need a custom probe), BG/CY/HU/LU/MT/NL/RO (currently WW-Top only).

### Locking the v1.1 launch shape

Before chat writes the v1 launch DEC, the open question to answer is **which T2 definition the launch claim uses**:

- Claim "framework-compliant T2 across 19/30 EU30 countries" (with the understanding that customers see `tier_2_available: false + reason` for 16 of them): aligns with DEC-20260518-A as authored, supports the broadest geographic claim, requires no further engineering before launch.
- Claim "binding-ready T2 across 2 of 30 EU30 countries (DE + GR)": stricter, more defensible against scrutiny, narrows the launch claim, suggests prioritising the legal-representatives extraction sweep before launch.

Recommend chat treat this as the launch-DEC's central question.

---

## Closing notes

- Rule 1 (audit-first): satisfied (Section 0).
- Rule 15 (HEAD back to main): satisfied — strale-work was on main throughout, no checkouts performed, no modifications.
- Other rules: read-only audit, no further obligations.

Worktree note: this audit was run from `strale-work` rather than the prompt-specified `strale-research` because the latter is on `e1c2105` (pre-PR-131) and would have violated the stop condition. `strale-work` was on `2126de0` (post-PR-132) and clean.
