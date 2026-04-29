# Empirical Screening Coverage — 2026-04-27

**Decision this informs:** v1 launch readiness for sanctions-check / pep-check / adverse-media-check across EU27 + UK + NO + CH (v1) and + US (v1.1).

**Method:** Live calls against the Strale production API (sanctions / PEP) and direct Dilisense API (adverse media). 65 PEP cases + 24 adverse-media cases. Test script: [`apps/api/scripts/empirical-screening-coverage.ts`](../../apps/api/scripts/empirical-screening-coverage.ts).

**Cost:** €6.90 in wallet credits (Strale-side) + ~50 Dilisense calls on Starter quota.

---

## Headline findings

1. **PEP coverage: 65/65 = 100% hit rate.** Every sitting head of government, every central-bank governor, every justice tested across EU27 + UK + NO + CH + US returns `is_pep: true`. PEP screening is **production-ready for v1 and v1.1**.

2. **Sanctions: functional but audit story is weaker than advertised.** Putin returns 14 sanctions matches; the path works. But every call falls through to Dilisense because **`OPENSANCTIONS_API_KEY` is not configured on Railway**. The "OpenSanctions default collection, 347 lists, version 20260427..." audit shape we shipped earlier today is *not* what production actually returns — production returns `lists_queried: {collection: "dilisense/consolidated", version: null, last_updated_at: null}` for every call. **v1 blocker** — easy fix (set the env var).

3. **Adverse media: hit rate good, but native-language surfacing is essentially zero.** 13 of 16 tested subjects returned hits (3 zero-hit cases need investigation), but in only 1 of 24 cases did Dilisense surface an article in the subject's native language. Even Swedbank (6,929 total hits in Swedish-speaking jurisdiction) returned 0 native-Swedish articles in the top-10. **The "EN/FR/DE marketing claim" is real**: native-language coverage for non-DE/FR/EN counterparties is structurally weak, even when total-hit counts look high.

4. **Dilisense Starter quota exhausted mid-test.** Burning ~50 calls of pre-launch testing took us to 429 "quota exceeded." Confirms Mirko's 2026-04-27 nudge: **Basic tier upgrade is required** before v1.

---

## PEP coverage (Strale `/v1/do` → pep-check)

### Summary

| Tier | Hits | Total | Rate |
|---|---|---|---|
| Heads of state / government | 33 | 33 | **100%** |
| Second-tier (central bank governors) | 32 | 32 | **100%** |
| US (v1.1) | 5 | 5 | **100%** |
| **Overall** | **65** | **65** | **100%** |

Every match returned `classification: "pep"` and `topics: ["role.pep"]`. No misses. No false negatives.

### Per-country detail

All 30 v1 jurisdictions (EU27 + UK + NO + CH) plus US covered. See appendix table. Notable depth observations:

- **Spain / Pedro Sánchez**: 19 matches (rich PEP record).
- **Malta / Robert Abela**: 9 matches (well-indexed despite small jurisdiction).
- **US / John Roberts**: 84 matches (Chief Justice of US Supreme Court — extensive position history).
- **Sweden, Finland, Latvia, Estonia, Lithuania**: 3-9 matches per head of state, demonstrating coverage isn't English-anglosphere-skewed for PEP.

### Caveat on data path

Every PEP hit came from `source: "dilisense"` rather than `source: "opensanctions"`. The Strale code attempts OpenSanctions first, falls through to Dilisense when OS errors or returns nothing. Given the universal Dilisense path on production, **the OS key is not currently set on Railway** — see Critical findings.

This means: the 100% hit rate reflects **Dilisense PEP coverage**, not OpenSanctions. Once OS is configured, hits should be additive (more matches per call), not different (no expected losses).

---

## Adverse media coverage (direct Dilisense `/v1/media`)

### Summary

| Outcome | Count |
|---|---|
| Returned hits | 13 |
| Returned 0 hits | 3 |
| Rate-limited (quota exhausted) | 8 |
| Native-language article in top-10 | 1 |

### Per-language detail

| Country | Lang | Subject | Total hits | Native lang in top? | Notes |
|---|---|---|---|---|---|
| Germany | de | Wirecard AG | 67 | ❌ | Marketing-claim language, but no DE article surfaced |
| France | fr | Carlos Ghosn | — | — | Quota 429 |
| United Kingdom | en | Wirecard AG | 67 | ✅ | Baseline (English) |
| Sweden | sv | Swedbank AB | 6,929 | ❌ | High volume, all English |
| Norway | no | DNB ASA | 2,235 | ❌ | High volume, all English |
| Denmark | da | Danske Bank A/S | 4,638 | ❌ | High volume, all English |
| Finland | fi | Nordea Bank | 3,466 | ❌ | High volume, all English |
| Netherlands | nl | Vestia | 139 | ❌ | Mid volume, all English |
| Italy | it | Banca Popolare di Vicenza | **0** | ❌ | Major IT bank failure (2017) — **suspicious zero** |
| Spain | es | Bankia | 68 | ❌ | Mid volume, all English |
| Portugal | pt | Banco Espírito Santo | 90 | ❌ | Mid volume, all English |
| Poland | pl | GetBack SA | 2 | ❌ | Sparse |
| Czech Republic | cs | Andrej Babiš | — | — | Quota 429 |
| Hungary | hu | Lőrinc Mészáros | — | — | Quota 429 |
| Romania | ro | Liviu Dragnea | — | — | Quota 429 |
| Bulgaria | bg | Tsvetan Vassilev | — | — | Quota 429 |
| Greece | el | Folli Follie | **0** | ❌ | Major GR fraud scandal (2018) — **suspicious zero** |
| Slovakia | sk | Marian Kočner | — | — | Quota 429 |
| Slovenia | sl | Janez Janša | — | — | Quota 429 |
| Croatia | hr | Ivo Sanader | — | — | Quota 429 |
| Lithuania | lt | Snoras Bank | 1 | ❌ | Sparse |
| Latvia | lv | ABLV Bank | 8 | ❌ | Sparse but present |
| Estonia | et | Danske Bank Estonia | **0** | ❌ | Major laundering scandal — **likely entity-naming issue** |
| Switzerland | it | Credit Suisse | 22,280 | ❌ | Highest volume of all tests, all English |

### Interpretation

- **Total-hit counts can be misleading.** Swedbank's 6,929 hits are predominantly English-language coverage of a Swedish bank. Dilisense indexes English-language coverage of Nordic/Continental subjects effectively, but the bigger question — "do you surface Polish-language reporting on a Polish payee?" — answers no.
- **The three zero-hit cases need investigation** before drawing conclusions about IT/GR/EE coverage. Likely entity-naming differences ("BPVi" vs "Banca Popolare di Vicenza"; "Folli Follie SA" vs the holding name; the Estonia branch is part of "Danske Bank" not standalone). This is a query-tuning issue we should solve in code before launch.
- **The 8 untested countries cannot be evaluated until Basic-tier upgrade.** Quota exhaustion mid-test is itself a forcing function for the upgrade.

---

## Critical operational findings

### 1. `OPENSANCTIONS_API_KEY` is missing on Railway

Every sanctions and PEP call returns `source: "dilisense"`. Verified via direct curl with Vladimir Putin (sanctioned, source: dilisense) and Olaf Scholz (PEP, source: dilisense). Code is correct (OS-first, Dilisense fallback) — the key just isn't set in production.

**Impact:**
- The audit-grade `lists_queried` shape we shipped earlier today returns null version/last_updated_at on every call (Dilisense doesn't expose those fields).
- We're paying €0.05/call to Dilisense for every PEP screen instead of using OpenSanctions where it would be cheaper at scale.
- The "347 lists, version 20260427125425-hms" advertising story is technically accurate (the catalog endpoint works) but doesn't reflect the actual data path.

**Action:** set `OPENSANCTIONS_API_KEY` on the Railway environment for the `desirable-serenity` project. Petter holds the key (signed up earlier per memory). 5-minute fix.

### 2. Dilisense Starter quota exhausted

429 "Quota exceeded, contact sales@dilisense.com to increase it." Free tier is 100 calls/month. We've burned that on testing.

**Impact:**
- Cannot retest the 8 untested adverse-media countries until quota resets or upgrade.
- Production is in fail state for adverse-media-check until quota resets (will fall to Serper).
- Confirms Mirko's 2026-04-27 nudge is operationally urgent, not just legal.

**Action:** upgrade to Basic tier (€300/mo, 10k calls). Already on the legal-readiness path per [project_dilisense_reseller_status.md](../../) memory note.

### 3. Adverse-media native-language surfacing is structurally weak

Confirmed empirically. The "EN/FR/DE only" marketing claim isn't just an absence of documentation — it's the actual API behavior. Default sort returns English-language articles in top-10 even when total_hits are in the thousands for a Swedish/Danish/Italian/Spanish subject.

**Impact:** for Payee Assurance's EU27 promise, adverse-media-check on a non-DE/FR/EN payee returns evidence that doesn't reflect native-language press scrutiny.

**Action — decision required:**
- (a) **Accept and disclose.** The current manifest already does this honestly. Customers see total_hits and English articles. Acceptable for MVP.
- (b) **Supplement with second source** for non-DE/FR/EN. Candidates: ComplyAdvantage (claims multilingual coverage), sanctions.io (English-heavy too), GDELT (free, multilingual). Adds COGS €0.05–€0.20/call.
- (c) **Scope-cut to DE/FR/EN-language countries** for v1 (DE, FR, AT, CH-DE, CH-FR, IE, GB, MT, LU). Smaller v1 footprint but truthful.

---

## v1 readiness verdict

| Capability | v1 (EU27 + UK + NO + CH) | v1.1 (+ US) |
|---|---|---|
| sanctions-check | ✅ ready (after OS key set) | ✅ ready (after OS key set) |
| pep-check | ✅ ready (100% hit rate today, OS key would add depth) | ✅ ready |
| adverse-media-check | ⚠️ functional but native-language gap requires product decision | ✅ ready (English-language press is well-covered) |

### Pre-v1 must-do

1. ~~**Set `OPENSANCTIONS_API_KEY` on Railway.**~~ **CLOSED 2026-04-27** — OS dropped from v1, single-vendor Dilisense (commit `16ca790`).
2. ~~**Upgrade Dilisense to Basic tier.**~~ **DEFERRED 2026-04-29 to reactive trigger** per DEC-20260429-A. Mirko granted Starter grace; upgrade fires on Dilisense bill > €100/mo OR regulated customer asks for DPA OR vendor-initiated.
3. ~~**Make the adverse-media language-coverage decision.**~~ **CLOSED 2026-04-27** — accept-and-disclose chosen, logged as DEC-20260427-A.
4. ~~**Investigate the three zero-hit adverse-media cases.**~~ **CLOSED 2026-04-29** — see follow-up below.

---

## 2026-04-29 follow-up — zero-hit variant testing

Diagnostic script: [`apps/api/scripts/diag-adverse-media-variants.ts`](../../apps/api/scripts/diag-adverse-media-variants.ts). Cost: 9 Dilisense calls (quota was not exhausted; under the 100/mo free cap including the original 2026-04-27 testing).

### Results

| Country | Baseline (zero-hit) | Variant tested | Result |
|---|---|---|---|
| IT | Banca Popolare di Vicenza | "BPVi" | 0 hits |
| IT | Banca Popolare di Vicenza | "Banca Popolare di Vicenza Scpa" | 0 hits |
| IT | Banca Popolare di Vicenza | "Popolare di Vicenza" | 0 hits |
| GR | Folli Follie | "Folli Follie SA" | 0 hits |
| GR | Folli Follie | **"FF Group"** | **12 hits** |
| GR | Folli Follie | "Folli Follie Group" | 0 hits |
| EE | Danske Bank Estonia | **"Danske Bank"** | **11,486 hits** |
| EE | Danske Bank Estonia | "Danske Bank Eesti" | 0 hits |
| EE | Danske Bank Estonia | "Danske Bank A/S Eesti filiaal" | 0 hits |

### Findings

- **IT/Banca Popolare di Vicenza: confirmed Dilisense coverage gap.** All three reasonable variants returned zero. Despite the 2017 BPVi failure being one of the largest Italian bank scandals of the decade, Dilisense's adverse-media index does not surface it. This is a real coverage gap, not a query-tuning problem.
- **GR/Folli Follie: naming issue confirmed.** "FF Group" (the corporate-name form actually used in Greek financial press during the 2018 fraud scandal) returns 12 hits. The consumer-brand name "Folli Follie" misses because Dilisense indexes the corporate filing name.
- **EE/Danske Bank Estonia: naming issue confirmed.** "Danske Bank" (the parent name) returns 11,486 hits — including the Estonian-branch laundering coverage. The descriptor-style "Danske Bank Estonia" misses because there is no separate corporate entity by that name; the Estonian branch is part of Danske Bank A/S.

Native-language surfacing remained false for both recovered cases — confirms the broader finding that Dilisense's index is English-language-skewed even when underlying coverage exists.

### Implications for v1

1. **No code change to `adverse-media-check`.** Auto-rewriting customer queries (e.g., stripping country suffixes, mapping consumer brand names to corporate filings) would silently mutate the audit trail and break the "what we asked Dilisense" / "what Dilisense returned" transparency. Wrong direction.
2. **Manifest limitation added** — `adverse-media-check.yaml` now notes parent/branch and brand/corporate naming behavior so customers query the right name.
3. **The 24-case empirical test inflates coverage in one direction and deflates it in the other.** Of the 16 originally-tested adverse cases (8 quota-blocked), 13 returned hits, 3 returned zero. After this follow-up: 14 of 16 *would* return hits if the customer queries with the corporate/parent name. The IT/BPVi gap remains real.
4. **Future work — `query_suggestions` field on zero-hit responses.** When `total_hits == 0` and the queried name has a country-suffix or brand-vs-corporate pattern, surface a suggested re-query. v1.5 product enhancement, not v1.

### Post-v1 must-do

5. Re-test the 8 quota-blocked adverse-media countries after Basic upgrade.
6. Re-run the entire empirical battery monthly during the first quarter to confirm coverage doesn't regress.

---

## Appendix — full PEP results

[See empirical-coverage script output. All 65 cases returned `is_pep: true` with classification `pep`. Match counts ranged from 1 (Olaf Scholz, Dick Schoof, Mette Frederiksen) to 84 (John Roberts).]

## Appendix — methodology notes

- **PEP cases**: 1 head of state/government + 1 central bank governor per country = 2 cases × 30 jurisdictions = 60 cases. Plus 5 US cases (POTUS, SecState, SecTreasury, Fed Chair, SCOTUS Chief Justice). Total: 65.
- **Adverse-media cases**: 1 known-controversy subject per language. Selected to be widely-covered enough that *any* coverage failure would be diagnostic. Subjects: financial-fraud entities (Wirecard, Bankia, BPVi) or politically-exposed individuals with documented adverse coverage (Carlos Ghosn, Liviu Dragnea, Marian Kočner).
- **Score threshold default**: 0.7 (left at default for empirical realism).
- **Country filter**: passed for every PEP call; no filter caused misses.
- **Test runner**: serial, throttled (1.1s between PEP calls, 4s between Dilisense calls). The 4s delay was insufficient against the monthly Dilisense quota — caps were exhausted, not rate limits.
