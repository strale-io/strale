# KYB Capability Wiring Audit — 2026-08-12

**Scope:** every KYB-relevant capability, end-to-end (executor ↔ route schema ↔ prod catalog ↔ traffic ↔ provenance).
**Mandate:** founder directive 2026-08-12 — the Counterparty Assurance *product* is shelved, but its underlying capabilities must stand on their own as first-class Strale offerings. This audit asks: *if a KYB buyer showed up today, what would actually work?*

**Constraints observed:** read-only on the repo (no edits, no git checkout/branch/stash, no DB writes). Read-only prod GETs only.

## Sources leveraged (not re-derived)

| Source | What it established | Cited as |
|---|---|---|
| `scratchpad/anyof-campaign.md` | Input-contract classes; which registries can resolve a name→identifier; the manifest-vs-DB schema split | **[ANYOF]** |
| `scratchpad/legal-audit-a-l.md` + `legal-audit-m-z.md` | Provenance/licensing verdicts per slug under DEC-20260428-A | **[LEGAL]** |
| `audit-output/disposition-generated-2026-08-12.md` | Prod sweep verdicts, 30d/90d traffic + completion, revenue | **[DISP]** |
| Live `GET https://api.strale.io/v1/capabilities` (fetched 2026-08-12 16:00 CET) | Current active catalog (**294** caps) and the *deployed* `input_schema` per slug | **[PROD]** |
| Repo reads: `apps/api/src/capabilities/*.ts`, `auto-register.ts`, `routes/do.ts` | Executor input contracts, name-resolution mechanics, route validation semantics | **[CODE]** |

### Three corrections to the inherited reports

1. **[ANYOF] describes manifest state; [PROD] is DB state, and they diverge.** [ANYOF] §0.2 already warns that `capabilities.input_schema` is written only by `PATCH /v1/admin/capability-schema` or `scripts/sync-manifest-canonical-to-db.ts` — never by `onboard.ts`. Confirmed live: [ANYOF] reports danish/finnish as hard-blocked by `required:[cvr_number]`/`required:[business_id]`, but the deployed DB row for `finnish-company-data` is `required: []`. **The deployed schema is what a buyer hits, so every row below uses [PROD], not the manifest.** Several [ANYOF] "highest-value" items are already neutralised in prod; a different set is not.
2. **[ANYOF]'s `swiss-company-data` finding ("executor body is an unconditional throw, line 12 — every call fails") is wrong on main.** `apps/api/src/capabilities/swiss-company-data.ts:12` *is* a throw, but it is a last-resort fallback; the runtime path is the `registerChain(...)` provider at `apps/api/src/capabilities/providers/swiss-company-data.ts:96`, wired at `auto-register.ts:436`. Swiss should not be deactivated on that basis.
3. **`danish-company-data` was delisted since the sweep — but it is still callable.** [DISP] covers 299 active caps and lists Danish under `fix`; the live catalog is now **294** and Danish is absent from it. However `GET /v1/capabilities/danish-company-data` still returns **200**, i.e. the row is `visible=false` but `is_active=true`. The quarantine removed it from the storefront without stopping traffic — and the three DK KYB solutions still call it as step 1. See §4b S-2.

---

## 1. Route validation semantics (the mechanism every row depends on)

`apps/api/src/routes/do.ts:900-907` is the only input gate:

```
if (inputSchema?.required && inputSchema?.properties) {
  const missingFields = inputSchema.required.filter(
    (field) => !(field in executionInput) || executionInput[field] === undefined,
  );
```

Three consequences that drive most findings below:

- **It enforces `required` as a strict AND.** Every listed field must be present. There is no `anyOf` support in `/v1/do` — [ANYOF] §0.0 confirms the validator that understands `anyOf` (`lib/x402-input-validation.ts`) is wired into x402 only; the `/v1/do` wiring is open **PR #180**, unmerged.
- **`required: []` means "admit everything"** — validation is delegated entirely to the executor. This is why so many registries below are *reachable* but *unverified*.
- **`properties` is advertising, not enforcement.** A field can appear in `properties` (and therefore in the public catalog, SDKs, MCP tool schemas, and the x402 catalog) while `required` makes a call using only that field impossible. That is the `slovenian-company-data` failure mode.

**Corollary:** an x402 caller and a `/v1/do` caller get *different* input contracts for the same capability today. Any `anyOf` shipped now silently works on one surface and not the other until PR #180 lands.

---

## 2. Name resolution: the systemic defect

The platform has a purpose-built scoring primitive — `apps/api/src/lib/company-name-match.ts:125` `classifyNameMatch()` — created after the 2026-08-10 incident where taking `result[0]` returned *Fysios* for "Nokia" and *NITO TELENOR* for "Telenor" (recorded in memory as `feedback_registry_name_search_never_ranks.md`).

**Six capabilities use it. Roughly twenty accept a name and do not.**

| Uses `classifyNameMatch` | File:line |
|---|---|
| estonian-company-data | `estonian-company-data.ts:196` |
| finnish-company-data | `finnish-company-data.ts:81` |
| german-company-data | `german-company-data.ts:169` + `pickUnambiguous():178` — **only one with ambiguity refusal** |
| norwegian-company-data | `lib/brreg-fetch.ts:81` |
| swiss-company-data | `providers/swiss-company-data.ts:177` |
| us-company-data | `us-company-data.ts:201,232` (+ `allow_low_confidence`) |

Everything else that resolves a name picks the top of an unranked list, at best with a *status* tiebreak that carries no name-similarity signal:

| Slug | Picker | File:line | Tiebreak |
|---|---|---|---|
| uk-company-data | `items[0].company_number` | `uk-company-data.ts:61` | none |
| uk-companies-house-officers | `sd.items[0]` | `uk-companies-house-officers.ts:33` | none |
| french-company-data | `results[0]` | `french-company-data.ts:54` | none (upstream does rank) |
| belgian-company-data | `results[0]` | `belgian-company-data.ts:97` | none |
| irish-company-data | `sorted[0]` | `irish-company-data.ts:93` | Live/Normal/Active status only |
| latvian-company-data | `sorted[0]` | `latvian-company-data.ts:96` | not-terminated only |
| lithuanian-company-data | `sorted[0]` | `lithuanian-company-data.ts:131` | not-deregistered only |
| singapore-company-data | `sorted[0]` | `singapore-company-data.ts:98` | substring + Registered |
| slovenian-company-data | `records[0]` | `slovenian-company-data.ts:94` | none |
| cz-company-data | `ekonomickeSubjekty[0].ico` | `cz-company-data.ts:90` | none (`pocet:1` — cannot even see candidate 2) |
| lei-lookup / gleif-l2-* | `records[0]` | `gleif-l2-ubo-lookup.ts:59-72` | none |
| us-company-data-cobalt | `data[0]` | `us-company-data-cobalt.ts:93` | none |
| canadian / japanese | Browserless render + LLM extraction | — | none |

None of these can say *"I'm not confident"* or *"that was ambiguous"*. They return a confident-looking company record for the wrong company. **For a KYB buyer this is the worst possible failure mode** — worse than a 500, because it is silently wrong and gets written into an audit trail.

`german-company-data` is the proof that scoring alone isn't enough: it *has* `classifyNameMatch` **and** ambiguity refusal, and [DISP] still caught it returning `"HRB TREUHAND GMBH Wirtschaftsprüfungsgesellschaft Steuerberatungsgesellschaft"` for the query `RATIONAL`.

One clean note: I checked the LT comparator at `lithuanian-company-data.ts:127` (`a.isreg_data ? 1 : 0`), which reads like an inverted sort. It is correct — `isreg_data` is the *de*registration date (`išregistravimo`), confirmed by `lithuanian-company-data.ts:176`. Confusing variable name (`aActive`), correct behaviour.

---

## 3. The wiring matrix

Legend — **State:** `LIVE` in prod catalog · `DARK` code-registered but absent from catalog · `DEACT` in the `auto-register.ts` DEACTIVATED map.
**Name path:** `scored` = classifyNameMatch · `top-of-list` = result[0] ± status tiebreak · `none` = identifier-only · `blocked` = executor supports it, deployed `required` forbids it.
Traffic = 90d external calls / completion, from [DISP].

### 3a. EU-27 company registries

| slug | state | id path | name path | route schema admits | [DISP] sweep | 90d | [LEGAL] | verdict |
|---|---|---|---|---|---|---|---|---|
| **danish-company-data** | **DELISTED but still callable** (`visible=false`, `is_active=true`) | yes | yes (aliases, fixed 2026-08-09) | reachable via slug + via DK solutions | EXEC_FAIL_UPSTREAM | 11 / **0%** | clean (Tier-2, full chain) | **BROKEN** — Denmark, a core Nordic market. 0% completion across every call for 90 days, and the quarantine hid it from the catalog without stopping the 3 DK solutions calling it (§4b S-2) |
| **german-company-data** | LIVE | yes | **scored + ambiguity refusal** | `required:[]` — both | **FIXTURE_FAIL** | 15 / 73% | tier-2-provenance-gap (OpenRegister mislabelled `direct_api`) | **BROKEN** — returns the wrong company on a name query despite best-in-class scoring |
| **slovenian-company-data** | LIVE | yes | top-of-list | **`required:[reg_number]` while `properties` advertises `company_name`+`task`** | PASS | 0 | clean | **BROKEN** — advertises a name field the route 400s. Executor supports it (`:127`) |
| **cz-company-data** | LIVE | yes | **blocked** (ARES resolver at `:90` unreachable) | `required:[ico]`; `company_number`, `company_name` unreachable | PASS | 0 | clean | **MISSING-FEATURE** — working name resolver, dead behind the schema |
| belgian-company-data | LIVE | yes | top-of-list (`:97`) | `required:[]` | FIXTURE_FAIL (abbreviation) | 9 / 44% | clean (**exemplary** provenance) | DEGRADED — 44% real completion, unscored name pick |
| french-company-data | LIVE | yes | top-of-list (`:54`) | `required:[]` | PASS | 10 / 50% | attribution-gap (Licence Ouverte 2.0) | DEGRADED — 50% real completion |
| finnish-company-data | LIVE | yes | **scored** (`:81`) | `required:[]` | PASS | 9 / 22% | clean | DEGRADED — 22% completion is the worst of any scored registry; the 2026-08-09 fix is unverified in prod |
| estonian-company-data | LIVE | yes | **scored** (`:196`) | `required:[]` | PASS | 2 / 0% | **misdeclared** — undeclared Browserless fallback, declared `type: api`, should be `mixed` | DEGRADED |
| swedish-company-data | LIVE | yes | **none** (Bolagsverket HVD has no name search) | `required:[org_number]` | PASS | 6 / 100% | clean | **MISSING-FEATURE** — and it contradicts an *active* decision: DEC-20260225-P-m5n6 (still listed in CLAUDE.md) promises fuzzy natural-language input resolved by a cheap LLM call. Home market, no name path |
| polish-company-data | LIVE | yes | **none** (honest refusal + guidance, `:153`) | `required:[krs_number]` | PASS | 2 / 100% | clean (**model** provenance) | OK / MISSING-FEATURE (no name path for PL) |
| irish-company-data | LIVE | yes | top-of-list (status tiebreak) | `required:[]` | PASS | 0 | clean | DEGRADED (unscored) |
| latvian-company-data | LIVE | yes | top-of-list (status tiebreak) | `required:[]` | PASS | 0 | clean | DEGRADED (unscored) |
| lithuanian-company-data | LIVE | yes | top-of-list (status tiebreak) | `required:[]` | PASS | 0 | clean | DEGRADED (unscored) |
| greek-company-data | LIVE | yes (GEMI/AFM) | **none** — no `company_name` property or executor branch | `required:[]`, props `afm`+`gemi_number` | PASS | 0 | attribution-gap (ODC-BY-1.0 notice is *mandatory*) | DEGRADED |
| croatian-company-data | LIVE | yes (OIB) | none | `required:[oib]`; `mbs` alias unreachable | PASS | 0 | attribution-gap (no licence field at all; returns director PII) | DEGRADED |
| slovak-company-data | LIVE | yes (IČO) | none | `required:[ico]`; `company_number` alias unreachable | PASS | 0 | clean | DEGRADED (cosmetic) |
| **austrian-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | **MISSING-FEATURE** — Openapi gate |
| **bulgarian-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **cypriot-company-data** | **DARK** | — | — | absent | absent | — | clean (good DEC-20260518-F pattern) | Openapi gate |
| **dutch-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **hungarian-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **italian-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **luxembourgish-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **maltese-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **portuguese-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **romanian-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |
| **spanish-company-data** | **DARK** | — | — | absent | absent | — | tier-2-provenance-gap | Openapi gate |

**EU-27 tally: 15 live, 12 dark.** The 11 Openapi-gated countries share one root cause — `apps/api/src/capabilities/lib/openapi-resolver.ts:580` refuses to run unless `OPENAPI_ENABLED === "true"`, held off pending the Openapi resale addendum countersignature (case 151296). Denmark is dark for a different reason (broken upstream). Among the dark twelve: **Netherlands, Italy, Spain, Austria, Portugal, Denmark** — six of the EU's larger economies.

### 3b. Non-EU registries

| slug | state | id path | name path | route schema admits | [DISP] | 90d | [LEGAL] | verdict |
|---|---|---|---|---|---|---|---|---|
| uk-company-data | LIVE | yes | top-of-list (`:61`) | `required:[]` | PASS | 24 / 79% | attribution-gap (OGL v3 not carried) | DEGRADED — highest-traffic registry, unscored name pick |
| swiss-company-data | LIVE | yes | **scored** (`providers/…:177`) | `required:[]`, props `uid`+`company_name` | PASS | 5 / 0% | clean | OK-but-**UNVERIFIED** — PR #172 (wrong HTTP method) and #173 (route accepts `company_name`) landed after these 5 calls. Needs a real prod call to confirm |
| norwegian-company-data | LIVE | yes | **scored** (`brreg-fetch.ts:81`) | `required:[]` | PASS | 3 / 100% | attribution-gap (NLOD) | OK |
| **us-company-data** | LIVE | yes | **scored** (reference impl) | `required:[]` | **CIRCUIT_OPEN** | 26 / **35%** | clean | **BROKEN** — worst real completion of any KYB cap with real traffic, breaker tripped |
| **canadian-company-data** | LIVE | yes | **blocked** (Browserless+LLM resolver exists) | `required:[corporation_number]` | PASS | 5 / 100% (€4.00) | **needs-human-review** | **BROKEN (doctrine)** — see §5 |
| **japanese-company-data** | LIVE | yes | **blocked** (Browserless+LLM resolver exists) | `required:[corporate_number]` | PASS | 4 / 100% (€3.20) | **needs-human-review** | **BROKEN (doctrine)** — see §5 |
| brazilian-company-data | LIVE | yes | none (honest: ReceitaWS has no name search) | `required:[cnpj]` — correct | PASS | 31 / **61%** | clean | DEGRADED — **quarantine-proposal** in [DISP]; 2nd-highest KYB traffic |
| singapore-company-data | LIVE | yes | top-of-list (substring+status) | `required:[]` | PASS | 0 | clean (**model** provenance) | DEGRADED (unscored) |
| au-company-data | LIVE | yes (ABN) | none — correct, ABR has none | `required:[abn]` — correct | PASS | 4 / 75% | clean | OK |
| **us-company-data-cobalt** | **DARK** | — | — | absent | DENYLISTED | 0 | tier-2-provenance-gap | MISSING-FEATURE — 50-state US SoS coverage is dark |
| **australian-company-data** | **DEACT** | — | — | — | — | — | tos-risk (correctly called off) | Correctly deactivated (duplicate of au-company-data) |

### 3c. Officers, UBO, screening

| slug | state | id path | name path | route schema admits | [DISP] | 90d | [LEGAL] | verdict |
|---|---|---|---|---|---|---|---|---|
| **officer-search** | **DARK** | — | — | absent from catalog | absent | — | needs-human-review (director PII, no GDPR Art. 22 class) | **MISSING-FEATURE** — the only *cross-jurisdiction* officer capability is dark. Manifest + executor exist |
| uk-companies-house-officers | LIVE | yes | top-of-list (`:33`) | `required:[]` | PASS | 9 / **33%** | needs-human-review (officer PII: role, nationality, partial DoB; no GDPR class; no OGL attribution) | DEGRADED |
| **beneficial-ownership-lookup** | LIVE | yes | yes | **`required:[company_name]` blocks a `company_number`-only call the executor supports (`:30`)** | **FIXTURE_FAIL** (`coverage_note` undefined) | 4 / 100% (€1.00) | needs-human-review; **over-tagged `sensitive_special`** (PSC data is Art. 6, not Art. 9) | **DEGRADED + MISSING-FEATURE** — UBO is EU AMLD-mandated and this is **GB-only** (`:37-50`) |
| gleif-l2-ubo-lookup | LIVE | yes (LEI) | top-of-list | `required:[]` | PASS | 0 | clean | DEGRADED (unscored) |
| gleif-l2-children-lookup | LIVE | yes (LEI) | top-of-list | `required:[]` | PASS | 0 | clean | DEGRADED (unscored) |
| **sanctions-check** | LIVE | n/a | name-only by design | `required:[name]` — correct | DENYLISTED (quota protection) | 7 / 100% (€1.40) | **no `gdpr_art_22_classification`** — silently defaults to `data_lookup` | **DEGRADED (compliance)** — CLAUDE.md names this the canonical `screening_signal`; the audit body's `gdpr` block and dispute-endpoint URL are wrong |
| **pep-check** | LIVE | n/a | name-only by design | `required:[name]` — correct | DENYLISTED | 6 / 100% | **same GDPR class gap** | **DEGRADED (compliance)** |
| adverse-media-check | LIVE | n/a | name-only by design | `required:[name]` — correct | DENYLISTED | 2 / 100% | clean | OK-unverified |
| uk-cop-check | LIVE | n/a | n/a | `required:[sort_code, account_number, account_holder_name]` — correct | DENYLISTED | 0 | clean — **cited as the model to copy** (`screening_signal` set, licence + attribution present) | OK-unverified |
| risk-narrative-generate | LIVE | n/a | n/a | `required:[check_results, context]` | PASS | 2 / 100% | clean (`risk_synthesis` correct) | OK |

### 3d. Identity primitives and adjacent

| slug | state | route schema admits | [DISP] | 90d | [LEGAL] | verdict |
|---|---|---|---|---|---|---|
| vat-validate | LIVE | `required:[vat_number]` | PASS | 5 / 100% | clean (VIES) | OK |
| vat-format-validate | LIVE | `required:[vat_number]` | PASS | 2 / 100% | clean (computed) | OK |
| lei-lookup | LIVE | `required:[]`, `lei`\|`company_name` | PASS | 9 / **44%** | clean (GLEIF) | DEGRADED — unscored name path |
| eori-validate | LIVE | `required:[eori]` | PASS | 2 / 100% | clean | OK |
| company-id-detect | LIVE | `required:[id]` | PASS | 8 / 100% | clean | OK |
| company-name-match | LIVE | `required:[name_a, name_b]` | PASS | 2 / 100% | clean | **OK — and it is the primitive ~20 registries fail to use** |
| **company-enrich** | LIVE | `required:[domain]` | PASS | 14 / 93% (**€6.50 — highest KYB-adjacent revenue**) | **tos-risk (F-5)** — forwards a caller-supplied URL to Browserless `/content` behind `validateUrl` (SSRF) only, **no `assertTargetAllowed`**; bypasses `lib/tos-blocklist.ts` for LinkedIn/Trustpilot/Glassdoor. Misdeclared `type: api` | **BROKEN (doctrine)** — live Tier-1 bypass on the highest-revenue KYB-adjacent capability |
| **company-news** | LIVE | `required:[]` but executor hard-requires `company_name` (`:27`) | PASS | 0 | **needs-human-review** — GDELT terms are CC BY-NC-SA-flavoured; commercial resale not clearly granted, **and it is sold inside paid solutions** | **BROKEN (licensing)** — plus schema under-declares (route admits `{}`, executor then throws) |
| **charity-lookup-uk** | LIVE | `required:[]`, props `name`+`charity_number` | PASS | 10 / **20%** | **misdeclared (F-14)** — manifest names the Charity Commission API; the executor exclusively calls `findthatcharity.uk`, an undeclared third-party aggregator. No `upstream_vendor`, no `primary_source_reference` | **BROKEN** — 20% completion; name search falls through to a hard throw (`:79`) |
| insolvency-check | LIVE | `required:[company_name, country_code]` | PASS | 3 / 100% | attribution-gap; **over-tagged `sensitive_special`** | DEGRADED — UK-only in practice (Companies House) |
| **fr-bodacc-lookup** | LIVE | `required:[]` | FIXTURE_FAIL (stale date fixture) | 0 | attribution-gap (DILA) | OK — stale fixture only |
| cz-unreliable-vat-payer | LIVE | `required:[dic]` | FIXTURE_FAIL (stale date fixture) | 0 | clean | OK — stale fixture only |
| **us-court-search** | LIVE | `required:[]` | **CIRCUIT_OPEN** | 0 | clean | **BROKEN** — breaker tripped, no verdict |
| **eu-court-case-search** | **DEACT** | — | — | — | needs-human-review | Correctly deactivated (Tier-1 CURIA/HUDOC scraping) |

---

## 4. Solutions × steps integrity

**This section contains the worst findings in the audit.** Definition source: `apps/api/scripts/seed-kyb-solutions.ts` (`buildKybEssentials:120`, `buildKybComplete:194`, `buildInvoiceVerify:395`); steps stored in `solution_steps`, served by `apps/api/src/routes/solutions.ts:44-78`. Verified against live `GET /v1/solutions`: **110 solutions total, 63 in the KYB families, across 21 countries** (at au be ca ch de dk es fi fr gr hr ie nl no pl pt se sg uk us).

### 4a. Compositions

| Family | Price | Steps | Shape |
|---|---|---|---|
| KYB Essentials | €1.50 | 3-4 | `{cc}-company-data` → [`vat-validate` if EU], `sanctions-check`, `lei-lookup` (parallel group 1, all fed from `$steps[0]`) |
| KYB Complete | €2.50 | 12-14 | `{cc}-company-data` → g1 [`vat-validate`], `lei-lookup`, `gleif-l2-ubo-lookup` → g2 `sanctions-check`, `pep-check`, `adverse-media-check` → g3 `domain-reputation`, `whois-lookup`, `ssl-check`, `dns-lookup`, `email-validate` → g4 country bonus (SE `credit-report-summary`, FR `fr-bodacc-lookup`, NO `no-bankruptcy-check`, UK `insolvency-check`) → `risk-narrative-generate` |
| Invoice Verify | €2.50 | 12-15 | `{cc}-company-data` → g1 [`vat-validate`, `vat-format-validate`], `iban-validate`, `bank-bic-lookup` → g2 `sanctions-check`, `adverse-media-check`, `invoice-validate` + country bonus → g3 `domain-reputation`, `whois-lookup`, `email-validate`, `dns-lookup`, `redirect-trace` → `risk-narrative-generate` |

**Every family is a step-1 cascade.** Only step 1 is required in the graph sense; every other step's inputs derive from `$steps[0]`. If step 1 fails, everything downstream has nothing to work on.

**Coverage is misaligned in both directions.** Four countries have solutions but no working registry (AT, NL, ES, PT — §4b S-1). Meanwhile nine countries have a **live, working** registry and no solution at all: CZ, EE, LV, LT, SI, SK, HR, GR, plus BR and JP. The solution catalogue was built around the countries the Counterparty Assurance product targeted, and has not tracked the registry work done since. Advertised `step_count` is computed live at `solutions.ts:73` and does match the stored rows everywhere — the counts are honest; it is the steps themselves that aren't.

### 4b. P0 — solutions selling a step that cannot run

| # | Solutions | Step-1 capability | State | Consequence |
|---|---|---|---|---|
| **S-1** | `kyb-essentials\|kyb-complete\|invoice-verify` × **{at, nl, es, pt}** — **12 solutions**, active **and x402-enabled** | `austrian`/`dutch`/`spanish`/`portuguese-company-data` | **404 in the prod catalog** (verified by direct `GET /v1/capabilities/:slug`); hard-gated at `lib/openapi-resolver.ts:580-587` which throws `capability-unavailable: OPENAPI_ENABLED is not set to 'true'` | 12 solutions on sale whose first and only load-bearing step throws unconditionally. These were deliberately paused by `scripts/drop-aggregator-kyb.ts` (DEC-20260427-I) and have been **resurrected** — `seed-kyb-solutions.ts:699` sets `isActive: true` on every upsert while at/nl/es/pt/de/ie/it remain in `COUNTRIES` (L51-61), so re-running the seed re-activates every paused country |
| **S-2** | `kyb-essentials\|kyb-complete\|invoice-verify-dk` — **3 solutions**, x402-enabled | `danish-company-data` | Delisted but still callable — absent from `GET /v1/capabilities` (294 rows) yet `GET /v1/capabilities/danish-company-data` returns **200**, i.e. `is_active` true / `visible` false | The quarantine hid it from the catalog but did **not** stop the DK solutions calling it. 0% completion over 11 calls in 90d |
| **S-3** | `…-us` — **3 solutions**, x402-enabled | `us-company-data` | CIRCUIT_OPEN, 35% 90d completion | Largest KYB market, step 1 unreliable |
| **S-4** | `…-de`, `…-be` — **6 solutions** | `german`/`belgian-company-data` | FIXTURE_FAIL — wrong company returned on a name query | **The most dangerous of the five.** Both take `company_name` as input. A wrong entity at step 1 propagates into `sanctions-check`, `pep-check`, `adverse-media-check` and finally `risk-narrative-generate`, which produces a fluent, confident risk narrative **about a different company** |
| **S-5** | `kyb-complete-se` | `credit-report-summary` (step 14, country bonus) | In the DEACTIVATED map (`auto-register.ts:135-147`), no executor, 404 in catalog | The `solution_steps` row survived; `scripts/cleanup-se-deactivation-2026-04-21.ts` cleaned the sibling `annual-report-extract` row but not this one. Prod `long_description` still advertises "…plus credit report summary" |

**P2 (graceful):** `fr-bodacc-lookup` (FIXTURE_FAIL) is a parallel bonus step in `kyb-complete-fr:13` and `invoice-verify-fr:9`. Nothing reads its output by name — it reaches `risk-narrative-generate` only via `$all_results` — so it degrades silently, but the narrative quietly loses the insolvency signal the solution claims to provide.

### 4c. The charge/refund defect — skipped steps count as successes

Verified in code:

- `routes/solution-execute.ts:106-170` — the wallet is debited **up front**, before any step runs.
- `routes/solution-execute.ts:288-300` — `stepsSucceeded = totalSteps - errorCount`; `allFailed = stepsSucceeded === 0`; `chargedPrice = allFailed ? 0 : sol.priceCents`. **Refund fires only if every step failed.**
- `lib/solution-executor.ts:311-318` — when all of a step's mapped inputs resolve to null, it writes `stepResults[slug] = { skipped: true }` and **does not push to `stepErrors`**.

Because every step after step 1 draws its inputs from `$steps[0]`, a step-1 failure makes every downstream step resolve to null and *skip* — which never increments `errorCount`. **`allFailed` is therefore unreachable for the ordinary call shape.**

Worked example — `kyb-essentials-dk` called with only `cvr_number` (its sole required field):

```
step 1 danish-company-data  → error        errorCount = 1
step 2 vat-validate         → inputs null  → skipped   (not an error)
step 3 sanctions-check      → inputs null  → skipped   (not an error)
step 4 lei-lookup           → inputs null  → skipped   (not an error)
stepsSucceeded = 4 - 1 = 3  → allFailed = false → chargedPrice = 150
```

**The customer is charged €1.50 in full for a response in which zero checks executed**, returned with `status: "partial"`.

### 4d. Deactivated steps vanish from the audit trail

`lib/solution-executor.ts:272-276` — when `getExecutor()` returns null, the code pushes `"<slug>: executor unavailable"` into `stepErrors` but never writes `stepResults` or `stepTimings`. `routes/solution-execute.ts:305` builds the audit body from `Object.entries(execResult.steps)`. Net effect for `kyb-complete-se`: `step_count` says 14, the audit lists 13, and **nothing in the audit trail records that the 14th step never ran.** For a product whose entire pitch is the audit trail, a step that silently disappears from it is a category defect, not a bug.

### 4e. The two payment surfaces disagree about what "failed" means

`routes/x402-gateway-v2.ts:987-1001` settles only if some step output has neither `error` **nor `skipped`**. So the identical DK cascade that charges €1.50 on the wallet path returns **502 "No payment was taken"** on x402. The x402 path is correct; the wallet path is not. (Other wallet refund paths — thrown exception `:235`, no steps configured `:273`, phase-2 UPDATE failure `:362` — do refund in full; `refundWallet:418-440` restores the pre-debit balance, and its own failures are swallowed into `logError:437`.)

---

## 5. Cross-cutting findings not visible in any single source report

### F-1 — Two live capabilities run the exact scrape pattern that got a third deactivated (P0, doctrine)

`canadian-company-data` and `japanese-company-data` resolve a company name by driving **Browserless against a government web UI** (`ised-isde.canada.ca` and `houjin-bangou.nta.go.jp`) and extracting with an LLM. Both are live and priced at €0.80/call.

`australian-company-data` was deactivated on 2026-04-29 for precisely this — `auto-register.ts:78-81`: *"this Browserless scrape of abr.business.gov.au violates Tier 1 per DEC-20260428-A."* DEC-20260428-A Tier 1 is stated as absolute: **Strale itself never operates scrapers.** [LEGAL] independently flags both as `needs-human-review` and notes each government publishes an official free API (NTA Corporate Number Web-API; an ISED open dataset). [ANYOF] §4a flags the same pattern and explicitly defers it as "worth a separate decision."

Nobody has made that decision. Two capabilities are charging money on a pattern the doctrine prohibits absolutely. This should be resolved before anything else on this list, because it is the only finding where the correct action might be *stop selling*, not *fix*.

### F-2 — The x402 surface and `/v1/do` enforce different input contracts

Per [ANYOF] §0.0 confirmed against `do.ts:900`: `anyOf` is honoured by `lib/x402-input-validation.ts` (x402 handlers) but not by `/v1/do` (PR #180 open). An identical capability therefore accepts different inputs depending on which door the buyer walks through. For a payment-is-auth surface where the caller has no docs conversation and no support channel, the x402 path being *more* permissive than the paid-account path is backwards.

### F-3 — Six capabilities advertise a field the route or executor will not accept

The `properties` list is what flows into the public catalog, the SDKs, the MCP tool schemas and the x402 catalog. These six publish a field a caller cannot successfully use:

| slug | advertises | reality |
|---|---|---|
| slovenian-company-data | `company_name`, `task` | `required:[reg_number]` → name-only call is 400'd |
| charity-lookup-uk | `name` | falls through to a hard throw at `:79` |
| company-news | `required:[]` | executor throws without `company_name` (`:27`) |
| beneficial-ownership-lookup | `company_number` | `required:[company_name]` → number-only call is 400'd |
| croatian-company-data | (`mbs` accepted by executor `:144`) | not in `properties`, so undiscoverable |
| slovak-company-data | (`company_number` accepted `:146`) | not in `properties`, so undiscoverable |

### F-4 — The compliance-metadata gap sits on the two most consequential capabilities

`sanctions-check` and `pep-check` carry no `gdpr_art_22_classification`, so both default to `data_lookup` — while CLAUDE.md names `sanctions-check` as *the* canonical `screening_signal` example. Per [LEGAL], the audit body's `gdpr` block and the dispute-endpoint URL are consequently wrong on exactly the two capabilities where a data subject is most likely to exercise Art. 22 rights. [LEGAL] rates it the highest consequence-per-character fix in either report. `uk-cop-check` shows the correct shape and can be copied.

Inverted twin: `beneficial-ownership-lookup` and `insolvency-check` over-tag `sensitive_special`. Neither PSC data nor insolvency status is Art. 9 special-category data. Over-tagging corrupts the PD inventory and manufactures DPIA obligations that don't exist.

### F-5 — One shared-lib line fixes ten countries' provenance

All ten Openapi-routed registries emit `upstream_vendor` and `acquisition_method` but never `primary_source_reference`. Per [LEGAL] this is a single omission in `apps/api/src/capabilities/lib/openapi-resolver.ts`. Worth fixing *before* `OPENAPI_ENABLED` flips, so the countries come up compliant rather than needing a follow-up.

---

## 6. Prioritised fix list

Weighted by what a KYB buyer hits first: solution compositions, EU-KYB country importance, and real traffic.

### P0 — money is changing hands for something that does not work

| # | Fix | Why first |
|---|---|---|
| **1** | **Stop charging for solutions where every step skipped** (§4c) | `solution-executor.ts:311-318` marks input-starved steps `skipped` without adding to `stepErrors`, so `allFailed` at `solution-execute.ts:290` is unreachable for the ordinary call shape. A `kyb-essentials-dk` call in which **zero checks executed** is charged €1.50 in full. x402 already gets this right (`x402-gateway-v2.ts:987-1001`) — port that rule to the wallet path. This is the single most defensible-as-a-refund-claim item in the audit |
| **2** | **Deactivate the 12 AT/NL/ES/PT solutions** (§4b S-1) | Active *and x402-enabled*, step 1 throws `capability-unavailable` unconditionally. They were deliberately paused under DEC-20260427-I and got resurrected by `seed-kyb-solutions.ts:699` setting `isActive: true` on every upsert. Fix the seed script too, or the next run resurrects them again |
| **3** | **Close the DK loophole** (§4b S-2) | `danish-company-data` is `visible=false` but `is_active=true` — delisting hid it from the catalog without stopping the 3 DK solutions calling it as step 1 at 0% completion. Quarantine must mean "not reachable", including via solutions |
| **4** | **`german-company-data` returns the wrong company on a name query** — and DE/BE feed 6 solutions (§4b S-4) | Germany is the largest EU KYB market. It has the *best* name-resolution code in the codebase — scoring **and** ambiguity refusal — and still failed. Inside a solution the wrong entity propagates through sanctions/PEP/adverse-media into `risk-narrative-generate`, producing a confident narrative about a different company. If scoring + refusal isn't sufficient, the whole §2 remediation plan is built on sand — diagnose here first |
| **5** | **Decide `canadian-company-data` + `japanese-company-data`** (F-1) | Live, charging €0.80/call, on the pattern DEC-20260428-A prohibits absolutely and for which a sibling was already deactivated. Both governments publish an official free API. The only P0 whose answer might be *withdraw*, not *fix* |
| **6** | **`company-enrich` Tier-1 blocklist bypass** ([LEGAL] F-5) | Live, €6.50/90d, highest KYB-adjacent revenue, and it forwards caller-controlled URLs to Browserless with no `assertTargetAllowed`. A customer can direct Strale to scrape LinkedIn |
| **7** | **`sanctions-check` + `pep-check` GDPR Art. 22 classification** (F-4) | Two-line manifest fix. Wrong `gdpr` block and dispute endpoint on the two capabilities most likely to receive a data-subject request. Both sit in every KYB Complete |
| **8** | **`company-news` GDELT licence determination** | Sold inside paid solutions on a source whose commercial-resale rights are unresolved. A written determination, not a code change |
| **9** | **`us-company-data` breaker + 35% completion — and it is step 1 of 3 US solutions** (§4b S-3) | US is the largest KYB market. Worst real completion of any KYB capability carrying traffic. `us-court-search` breaker also open |
| **10** | **`kyb-complete-se` step 14 `credit-report-summary`** (§4b S-5, §4d) | Deactivated capability still in `solution_steps`; prod `long_description` still advertises it; the step vanishes from the audit trail entirely rather than appearing as failed. Remove the row and correct the copy |

### P1 — the silent-wrong-answer class (§2)

| # | Fix | Why |
|---|---|---|
| 8 | **Roll `classifyNameMatch` + confidence gate + explicit ambiguity refusal across the ~20 top-of-list resolvers**, starting with the traffic-weighted order: `uk-company-data` (24 calls), `uk-companies-house-officers` (9), `lei-lookup` (9), `french-company-data` (10), `belgian-company-data` (9), then the zero-traffic EU set | A wrong-but-confident company record is worse than a 500 for KYB — it gets written into the audit trail. `us-company-data`'s `allow_low_confidence` is the reference shape |
| 9 | **`charity-lookup-uk`**: 20% completion + misdeclared source (F-14) | Either declare `findthatcharity.uk` as the Tier-2 vendor with a `primary_source_reference`, or migrate to the Charity Commission API. Currently the manifest is untrue |
| 10 | **`slovenian-company-data`**: `required:[reg_number]` vs advertised `company_name` | Pure schema defect. Route rejects a call the executor handles |
| 11 | **`beneficial-ownership-lookup`**: `required:[company_name]` blocks number-only lookups | Same class. Plus drop the `sensitive_special` over-tag |
| 12 | **`brazilian-company-data`** — 61% completion, quarantine-proposal | 2nd-highest KYB traffic. Investigate the real-input failure mode before quarantining |

### P2 — unlock coverage

| # | Fix | Why |
|---|---|---|
| 13 | **`OPENAPI_ENABLED` → 11 EU countries** (AT, BG, CY, HU, IT, LU, MT, NL, PT, RO, ES) | Blocked on the Openapi resale addendum (case 151296), not on engineering. The single largest coverage unlock available. Ship the `primary_source_reference` fix in `openapi-resolver.ts` (F-5) **first** so they come up compliant |
| 14 | **Un-dark `officer-search`** | The only cross-jurisdiction officer capability; UK-only officers is a thin KYB story. Needs a GDPR Art. 22 classification and a purpose-limitation flag first |
| 15 | **UBO beyond GB** | `beneficial-ownership-lookup` is Companies-House-PSC-only. UBO is AMLD-mandated across the EU; "EU KYB" without EU UBO is a gap a buyer notices immediately. `gleif-l2-ubo-lookup` covers only LEI-registered entities |
| 16 | **Open the blocked name paths**: `cz-company-data` (working ARES resolver, unreachable), `canadian`/`japanese` (pending #1) | Working code behind a schema wall |
| 17 | **`swedish-company-data` name path** | No name path in the home market, and it contradicts active decision DEC-20260225-P-m5n6 as written in CLAUDE.md. Either build it or supersede the decision |

### P3 — hygiene

| # | Fix |
|---|---|
| 18 | Attribution backfill against the DEC-20260518-F template: UK (OGL v3), FR (Licence Ouverte 2.0), NO (NLOD), GR (**ODC-BY notice is mandatory, not optional**), HR (no licence field at all), fr-bodacc (DILA), insolvency-check, uk-companies-house-officers |
| 19 | Refresh stale date fixtures: `cz-unreliable-vat-payer`, `fr-bodacc-lookup` (both FIXTURE_FAIL purely on a hardcoded date) |
| 20 | `estonian-company-data`: declare the Browserless fallback — `type: mixed`, add a limitation |
| 21 | Expose the undiscoverable aliases: `mbs` (HR), `company_number` (SK) |
| 22 | **Verify `swiss-company-data` in prod.** PR #172/#173 landed after the last 5 calls (all failed). Per `feedback_verify_fetch_capabilities_in_prod`, a local pass proves nothing |
| 23 | Land PR #180 so `/v1/do` and x402 stop enforcing different contracts (F-2) |
| 24 | Make `getExecutor() === null` write a `stepResults` entry so a missing executor appears in the audit trail as a failed step instead of vanishing (§4d) |

---

## 7. State of KYB on Strale today — the honest one-pager

**The short version: the primitives are broadly built, the wiring is not, and the bundled solutions are in worse shape than the capabilities they contain.**

**Start here.** 63 KYB solutions are on sale. Twelve of them (Austria, Netherlands, Spain, Portugal) have a first step that throws `capability-unavailable` on every call — they were deliberately paused months ago and a seed script re-activated them. Three more (Denmark) call a capability that was quarantined today but only *delisted*, not disabled, so the solutions still reach it at 0% completion. And underneath all of it, the billing logic counts a step that never ran as a step that succeeded: because every step draws its inputs from step 1, a step-1 failure makes the rest *skip* rather than *error*, `allFailed` never becomes true, and the customer is charged the full €1.50 or €2.50 for a response containing zero executed checks. The x402 path already refuses to settle in exactly this case; the wallet path does not. That inconsistency is the clearest evidence the wallet behaviour is a bug rather than a policy.

**Coverage.** 15 of 27 EU member states have a live company-data capability. Twelve do not — including the Netherlands, Italy, Spain, Austria, Portugal and Denmark. Eleven of those twelve are one environment variable away (`OPENAPI_ENABLED`), gated on a countersignature rather than on engineering; Denmark is dark because it broke and was quarantined today. So the real statement to a buyer is not "we cover the EU" — it is "we cover 15 EU countries, and 11 more are contract-blocked."

**Correctness.** This is the uncomfortable part. Roughly twenty capabilities resolve a company name by taking the first row of an unranked registry response. The platform already knows this is wrong — `classifyNameMatch()` was written after a name search returned *Fysios* for "Nokia" — but only six capabilities use it. For a KYB buyer this is the worst class of defect available: not an error, a **confident wrong answer**, written into an audit trail. And the one capability that does everything right — `german-company-data`, with scoring *and* ambiguity refusal — was still caught this week returning "HRB TREUHAND GMBH" for "RATIONAL". That needs diagnosing before the fix is rolled out anywhere else.

**Reliability.** Where there is real traffic, the numbers are not good: US 35%, Brazil 61%, UK-officers 33%, charity-lookup-UK 20%, Finland 22%, Denmark 0%. Two US capabilities have their circuit breakers open right now. The prod sweep's own caveat applies and cuts against us: it fires one known-good canned input per capability, so a `PASS` means "the declared contract holds for an input we chose" — the completion columns are what real customers actually experienced, and they are much worse.

**Compliance posture.** Mostly good, with two sharp exceptions. `sanctions-check` and `pep-check` — the two capabilities most likely to draw a data-subject request — carry no GDPR Art. 22 classification, so their audit bodies and dispute endpoints are wrong. And two live capabilities (Canada, Japan) run Strale-operated Browserless scrapes against government websites, which is the exact pattern DEC-20260428-A prohibits absolutely and for which the Australian equivalent was already deactivated. Nobody made a decision about them; they just kept selling. Separately, `company-enrich` — the highest-revenue KYB-adjacent capability — lets a caller-supplied URL reach Browserless without the ToS blocklist check, meaning a customer can direct Strale to scrape LinkedIn.

**What a KYB buyer could rely on today.** UK company data (with a caveat on name lookups), Norway, Sweden and Poland by identifier, VAT validation via VIES, LEI/GLEIF, the Dilisense screening trio, and `risk-narrative-generate`. That is a credible **UK + Nordics + identifier-first** proposition. It is not yet a credible "EU KYB" proposition, and it is not yet a credible "search by company name" proposition anywhere.

**The audit trail.** Worth calling out separately, because it is the product's core claim. When a solution step has no executor — `kyb-complete-se`'s `credit-report-summary`, for instance — the step is not recorded as failed; it is simply absent from the audit body. `step_count` says 14, the audit lists 13, and nothing marks the gap. A missing step that leaves no trace is a different order of problem from a step that fails loudly.

**The honest framing.** Shelving the Counterparty Assurance product was the right call, but it removed the thing that was *integrating* these capabilities and thereby exercising them. The solutions kept selling anyway, and without anyone running them end-to-end the joints rotted quietly. What is left is a shelf of individually-reasonable parts wired together by code nobody has exercised in months.

Four things would most change the picture, in order:

1. **Fix the billing and de-list the dead solutions** — the only findings here where a customer has a concrete claim against Strale today.
2. **Understand why `german-company-data` failed** despite having the best name-resolution code in the codebase. Everything in the §2 remediation plan assumes scoring + ambiguity refusal is sufficient; Germany is evidence it may not be.
3. **Settle the Canada/Japan doctrine question**, because the answer might be to withdraw two revenue-generating capabilities rather than fix them, and that decision keeps not being made.
4. **Flip `OPENAPI_ENABLED`** once the addendum is countersigned and the one-line provenance fix is in — that nearly doubles EU coverage and un-breaks 12 of the 63 solutions in a single move.
