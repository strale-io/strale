# Demand-mined build queue — what production traffic actually asks for

**Date:** 2026-08-13
**Mode:** READ-ONLY analysis. Production DB queried via temporary scripts (deleted after use); SELECT only. Deliverables: this file + `manifests-drafts/`.
**Window:** 30 days and 90 days to 2026-08-13, internal accounts excluded (`petter@`, `test@`, `test2@`, `system@strale.internal`, `test@example.com`), `status <> 'health_probe'`.
**Extends:** `audit-output/parallel-audits-2026-08-12/catalog-buildout-strategy.md` (2026-08-12). That document's structural conclusions still hold; this one adds a day of fresh data, the first look at `discovery_hits`, and **three findings that change its ranking**. It does not restate its analysis.

**Excluded from all "missing" lists** (shipped dark 2026-08-13, `is_active = true`, `x402_enabled = false`): `google-news-search`, `serp-related-questions`, `email-auth-check`. Also `page-exists` (dark 2026-08-12).

---

## 0. What changed since yesterday

Three corrections to the 2026-08-12 ranking, each from evidence that document did not have:

1. **Rank #9 `package-download-stats` should be demoted, not built.** The 94 calls of workaround traffic that justified it are Strale's own free-tier ops agent fetching Strale's own package pages. Not customer demand. (§3.1)
2. **A new Rank-0 fix outranks the entire build list: the test scheduler is rate-limiting a revenue-earning capability.** `brazilian-company-data` took **3,592 internal test calls** in 90 days against a free upstream, exhausted its quota, and the paying customer's calls now fail with `ReceitaWS returned HTTP 429`. (§3.2)
3. **The paying customer's geography is LatAm, not the EU.** 50 paid Google searches for Mexican freight-carrier contacts and a Brazil→email-verification pipeline. Strale has ~20 EU registries and no Mexican one. (§2.1)

---

## 1. Headline numbers (fresh)

| Measure | 30 days | 90 days |
|---|---|---|
| External calls | 2,296 | 4,068 |
| Failed | 244 (10.6%) | 512 (12.6%) |
| External revenue | **€132.19** | **€253.40** |
| x402 share | 97.5% | 98.7% |
| Distinct paying wallets | 19 | 36 |
| **Revenue destroyed by failures** (failed calls × list price) | **€21.74** | €45.36 |
| Top wallet `0x9D3d9410…` | **€118.56 (89.7%)** | — |

Monthly: Apr €47.84 · May €115.17 · Jun €107.57 · Jul €68.30 · **Aug (13d) €66.59**.

Two things to read off this. First, **concentration got worse**, not better: 53% of 90-day revenue → 90% of 30-day revenue in one wallet, which ran 1,951 calls across 92 capabilities on 27 of the last 30 days. Second, **€21.74 of the €132.19 earned in 30 days was matched by €21.74 destroyed** — a 16.4% uplift available with no new source, no new licence, no new maintenance. The 2026-08-12 conclusion that fixes beat builds is not just still true; the ratio is now 1:1.

`failed_requests` remains structurally unusable as a ranking input: **77 rows, all time**, and the x402 gateway still writes nothing to it (`failedRequests` inserts appear only at `apps/api/src/routes/do.ts:652, 880, 920, 968`; `x402-gateway-v2.ts` still returns bare 404s). 97.5% of revenue arrives on a rail that produces no miss signal. **Step 0 of the intake loop has not shipped.** Everything below is therefore mined from *purchase and failure* data — what people paid for and what broke — not from *miss* data.

---

## 2. The strongest signal: the buyer's geography is LatAm

### 2.1 Mexico — 50 paid Google searches, zero capability

The top wallet ran 50 `google-search` calls in 30 days (€5.00, 100% success) with a single, mechanical query template. Verbatim, consecutive:

```
"AUTEK TRADING" 墨西哥 phone contact
"AUTO EXPRESS NOR Y CARIBE" 墨西哥 phone contact
"AUTOFLETES CHIHUAHUA" 墨西哥 phone contact
"AUTO FLETES OMEGA" 墨西哥 phone contact
"AUTO LINEAS REGIO MONTANAS" 墨西哥 phone contact
"AUTOTRANSPORTES PARADA HERMANOS" 墨西哥 phone contact
"CIMA TERMINAL SA DE CV" 墨西哥 phone contact
"COMERCIALIZADORA DE SUMINISTROS MOCAVA SA DE CV" 墨西哥 phone contact
```

This is a company-by-company sweep of Mexican freight carriers for business contact details, driven by a Chinese-language agent (`墨西哥` = "Mexico"). It is the clearest unmet need in the entire corpus, and it has three properties that make it unusually strong evidence:

- **It is paid.** 50 calls at €0.10, not a probe, not a free-tier caller.
- **It is a workaround.** The buyer is paying for unstructured Google HTML because no structured Mexican business-directory lookup exists. Every one of those 50 calls needed a downstream parse the buyer had to do themselves.
- **It is repetitive and template-driven** — the signature of an automated pipeline, i.e. it will recur.

Geographic tokens across all search-shaped inputs, 90 days: **Mexico 50 · UK 5 · US 3 · Brazil 3 · India 1**, rest untagged. The one country with double-digit geographic demand is the one country with no registry capability.

### 2.2 Brazil — an earning pipeline the platform is breaking

Capability adjacency (pairs called by the same payer inside 120s), 30 days:

| Pair | n |
|---|---|
| `keyword-suggest` → `google-search` | 142 |
| **`brazilian-company-data` → `email-validate`** | **77** |
| `google-search` → `keyword-suggest` | 75 |
| `keyword-suggest` → `serp-analyze` | 28 |
| `barcode-lookup` → `google-search` | 20 |
| `serp-analyze` → `backlink-check` | 18 |
| `google-search` → `pricing-page-extract` | 12 |
| `serp-analyze` → `price-compare` | 12 |

The #2 pair is a **Brazilian company → contact-verification pipeline**, and it is the only registry capability in the adjacency table at all. `brazilian-company-data` is the only non-EU, non-UK registry earning external money (29 calls / 30d, €0.85) — and 12 of those 29 fail. See §3.2 for why.

### 2.3 Startup-status research — served by a capability that shipped dark today

Verbatim `google-search` / `brand-mention-search` queries, 90 days:

```
Qapital app 2026 shutting down OR layoffs OR "still active" news
Neurable company 2026 news layoffs acquired shutdown
DressX 2026 lawsuit OR layoffs OR "shut down" OR raises OR undress follow-up
"TruPlay" raised OR raises OR funding OR investors million
Synthesis school Chrisman Frank funding "led by" a16z OR seed OR Series
Swsh joinswsh funding round raised Scooter Braun employees
Upbound Group Brigit acquisition
Southeast Asia M&A funding deals July 2026
```

~18 news/funding-intent queries: *is this startup still alive, did it raise, was it acquired.* `google-news-search` shipped dark this morning and serves this directly. **This is a merchandising task, not a build** — see §4.

### 2.4 Agents arrive with names, not identifiers

Across `*-company-data` capabilities, 90 days, by input shape:

| Capability | name-shaped input | identifier input | failed / total |
|---|---|---|---|
| `uk-company-data` | **24** | 6 | 5 / 30 |
| `us-company-data` | 5 | 21 | **17 / 26** |
| `german-company-data` | **12** | 3 | 4 / 15 |
| `french-company-data` | 5 | 5 | 5 / 10 |
| `danish-company-data` | 4 | 7 | 11 / 11 |
| `belgian-company-data` | 4 | 5 | 5 / 9 |
| `finnish-company-data` | 2 | 7 | 7 / 9 |

Representative failures, verbatim from `transactions.error`:

```
'cik' or 'company_name' is required. Provide a CIK number or US company name.          (×4)
No confident SEC EDGAR match for "Apple". The closest filing belongs to a different
  entity ("Apple Hospitality REIT, Inc…")                                              (×3)
'company_number' or 'company_name' is required.                                        (×2)
All data providers failed for finnish-company-data: prh-api: 'business_id' is required  (×2)
```

The `"Apple"` case is the shape of the whole problem: the agent has a **name**, the registry indexes **identifiers**, and the platform correctly refuses rather than returning the wrong company (per `feedback_registry_name_search_never_ranks.md`). Correct behaviour, unserved demand. Corroborated in `failed_requests` by slug guesses `company-lookup` (€0.50 bid), `contact-verify`, `lead-enrich`, `solutions/lead-enrich`, and `spanish-company-data`.

---

## 3. Three corrections to the 2026-08-12 ranking

### 3.1 `package-download-stats` (was Rank #9) — demand evidence does not survive attribution

The 2026-08-12 doc cited "a caller repeatedly fetched pepy.tech through `url-to-markdown` and 404'd (4×)". The full cluster is larger and its attribution is fatal:

| Target host | calls | failed |
|---|---|---|
| `www.npmjs.com` | 26 | **26** |
| `pypistats.org` | 24 | 0 |
| `pypi.org` | 17 | 0 |
| `pepy.tech` | 13 | 4 |
| `npm-stat.com` | 7 | 0 |
| `api.npmjs.org` | 6 | **6** |

Every URL names a **Strale package**: `strale-mcp`, `straleio`, `langchain-strale`, `crewai-strale`, `strale-semantic-kernel`. The caller is `is_free_tier = true`, `user_id IS NULL`, wallet path, active 2026-05-17 → 2026-06-21 and **silent since**. This is Strale's own distribution-tracking ops agent, on the free tier, paying nothing. It is not a customer.

**Verdict: not a BUILD on demand grounds.** It stays in the queue at the bottom (§5, #7) purely as a zero-maintenance dark-launch candidate that removes 32 guaranteed failures from a free-tier surface — with the honest note that its only known caller is us.

### 3.2 NEW Rank 0 — the test scheduler is destroying paid calls

`brazilian-company-data`, 90 days, by caller:

| Caller | completed | failed |
|---|---|---|
| `system@strale.internal` (test scheduler) | 1,450 | **2,142** |
| x402 paying customer | 19 | **12** |
| test2@ | 1 | 0 |

**3,592 internal calls against ReceitaWS** — a free, unauthenticated Brazilian upstream — running continuously since 2026-05-15. The paying customer's 12 failures are all `ReceitaWS returned HTTP 429`. We are rate-limiting ourselves out of our own revenue.

This is not confined to Brazil. Internal test load, 30 days: **82,780 calls across 218 capabilities, 38,774 failed.** Worst internal:external ratios:

| Capability | internal 30d | external 30d | ratio |
|---|---|---|---|
| `vat-validate` | 1,961 | **0** | ∞ |
| `lei-lookup` | 1,998 | 3 | 666:1 |
| `polish-company-data` | 1,299 (899 failed) | **0** | ∞ |
| `ssl-check` | 1,288 | 9 | 143:1 |
| `exchange-rate` | 1,024 | 9 | 114:1 |
| `mx-lookup` | 506 | 2 | 253:1 |
| `canadian-company-data` | 503 | **0** | ∞ |
| `vasp-verify` | 504 | **0** | ∞ |

`vat-validate` sends **1,961 requests per month to the European Commission's VIES service** for a capability with zero external calls. `lei-lookup` sends 1,998 to GLEIF. These are official public services with fair-use expectations, and this is a reputational exposure as much as a quality one.

Two mechanisms are tangled here and both need separating before the DEC-20260812-A quality floor can be trusted:

- **A large share of the 38,774 internal failures are negative tests firing correctly.** Literal fixture values leak into upstream error strings — `Unknown model 'test_value'` (×275) — and hundreds of rows are `'x' is required` by design. Raw completion rate cannot distinguish these from real breakage. This is the same classifier gap the 2026-08-12 doc named (§1.6); here is the magnitude.
- **`polish-company-data` fails 899/1,299 with `Polish company name search is unavailable: the only compliant data path is the K…`** — the scheduler is repeatedly testing a path the capability structurally refuses to serve. That is a fixture defect burning 1,299 calls/month.

**Recommended action (platform-autonomous under the DEC-20260812-A escalation contract):** exclude capabilities with an external-facing quota-limited upstream from hourly free-tier scheduling, or move them to fixture mode. The "free" in "hourly free-only scheduling" (DEC-20260503-B) currently means *€0 cost to us* — it does not account for *quota consumed at the upstream*. That is the bug. Test Infrastructure Cost Principle A covers billable calls; there is no principle covering rate-limited free calls, and this is the case for adding one.

### 3.3 `discovery_hits` — the discovery surfaces are being catalogued, not shopped

First look at the table (live since 2026-08-13 08:09 UTC; **224 rows over ~4.5 hours** — far too thin to conclude anything, reported for shape only).

| Endpoint | hits | distinct IPs |
|---|---|---|
| `/mcp:initialize` | 128 | 29 |
| `/.well-known/agent-card.json` | 64 | 9 |
| `/.well-known/x402.json` | 27 | 15 |
| `/llms.txt` | 6 | 5 |
| `/x402/catalog` | 1 | 1 |

Essentially all of it is **registry and directory crawlers**, self-identifying in the UA: `Szerverbank-Public-Agent-Observer/1.0` (51), `glimind-probe/0.1.0` (38), `aisec-registry-probe/0.4` (21), `mcpbeat/0.1` (16), `yellowmcp-health/1.0` (13), `smithery-probe/0` (8), `glama/1.0.0` (7), `x402-observatory/0.2` (6), `agent-tools.cloud/0.1` (6), `Waggle/1.0`, `MCPScoringEngine/1.0`, `mcpgrade/0.1`, `wmcp-grader/1.0`, `reliability-bureau-spike/0.1`, plus Googlebot.

Conversion, joined on the documented key (`transactions.client_meta->>'ip_day_hash'` = `discovery_hits.ip_hash`, same day):

| Endpoint | distinct IPs | matched calls |
|---|---|---|
| `/mcp:initialize` | 29 | **0** |
| `/.well-known/x402.json` | 15 | 1 |
| `/.well-known/agent-card.json` | 9 | **0** |
| `/llms.txt` | 5 | **0** |
| `/x402/catalog?src=verify-test` | 1 | 1 (our own verification) |

**`src_tag` has exactly one value in the wild — `verify-test`, our own smoke check.** No tagged directory submission has ever been fetched. The channel-attribution instrument works; there is nothing tagged to attribute yet. That is a WS5/distribution finding, not a catalogue one: **tagging the directory submissions is a prerequisite for any claim that directory listings produce buyers.**

Separately, `transactions.client_meta` is near-empty for the traffic that matters: 2,256 of 2,295 external calls in 30 days carry `src: (none), ua: (none)`. The x402 path does not appear to populate `client_meta`. Worth confirming before the attribution rollup is trusted.

---

## 4. Cheapest wins: merchandising, not building

Three capabilities shipped dark and one shipped 5 days ago have **demand already on record** and zero calls. None needs engineering — they need to be made visible and x402-enabled after their first green week.

| Capability | Status | Demand already recorded |
|---|---|---|
| `email-auth-check` | dark 08-13, `x402_enabled=false` | `failed_requests` 2026-08-13: task **`"check email auth"`** (no_match, €0.10 bid). Plus 2 paid `dns-lookup` calls with `record_type: TXT` on `_dmarc.*` domains — an agent hand-rolling DMARC lookups. One failed: `No DNS records found for "_dmarc.americanexpress.com"` |
| `google-news-search` | dark 08-13, `x402_enabled=false` | The ~18 funding/shutdown queries in §2.3, currently paid for at €0.10 as raw `google-search` |
| `serp-related-questions` | dark 08-13, `x402_enabled=false` | `keyword-suggest` 147 calls / 100% + `serp-analyze` 90 / 100% in 30d — the two cleanest SEO earners, and the `keyword-suggest → google-search` pair is the #1 adjacency at 142 |
| `domain-contact-extract` | shipped 08-08, x402 **on**, **0 external calls** | 52 `google-search` calls with contact intent (§2.1). The buyer is paying for Google to find business contacts while a purpose-built capability sits unused and undiscovered |

`domain-contact-extract` is the important one: it is live, x402-enabled, five days old, and the single largest customer is spending money on a worse workaround for the same job. That is a discovery failure, not a demand failure. The `related_capabilities` hint (2026-08-12 Rank 0.5) is the fix, and this is now a second concrete case for it.

---

## 5. The ranked build queue

Rank 0 items are not builds but sit at the top of the same queue because their expected value dominates. Prices follow DEC-20260302-A (€0.02–€1.00).

### Rank 0 — fixes, in expected-value order

| # | Action | Evidence (30d unless noted) | Effort |
|---|---|---|---|
| **0.1** | **Stop the test scheduler consuming quota-limited free upstreams** — exclude or fixture-mode them | 82,780 internal calls; `vat-validate` 1,961:0 vs VIES; `brazilian-company-data` 3,592/90d → paying customer gets 429 | Medium |
| **0.2** | **`product-reviews-extract`** — restrict declared inputs to lawful sources, refuse the rest fast | 37/42 fail; **€9.25 lost** — the single largest lost-revenue line. 30× HTTP 403, 6× "Trustpilot ToS prohibits" | Medium (listing-honesty call) |
| **0.3** | **`screenshot-url`** — remove `waitForSelector` for the v1 prod endpoint | 21/47 fail, €1.05 lost, **20× the same v1/v2 error**. Unchanged since 2026-08-12; hits the top wallet | Small, prod-verify required |
| **0.4** | **`tech-stack-detect`** — 403 handling + declare the input contract | 43/210 fail, €1.29 lost; 21× 403, **12× "Provide 'url' … or 'domain'"** | Small |
| **0.5** | **`url-to-markdown`** — route `npmjs.com`/`api.npmjs.org` to `npm-package-info`; return JSON URLs as success | 16/51 fail; npmjs.com **26/26** and api.npmjs.org **6/6** across 90d | Small |
| **0.6** | **`related_capabilities` hint in successful responses** | `domain-contact-extract` 0 calls vs 52 paid Google workarounds (§4) | Small |
| **0.7** | **Ship the x402 miss log** (`x402-gateway-v2.ts` → `failedRequests`, `failure_type: 'x402_unknown_slug'`) | 97.5% of revenue produces no miss signal. Carried unmoved from 2026-08-12 §4 Step 0 | Small |

### Rank 1–7 — builds

Source rule: free/official, or a vendor already paid for and live in prod. Nothing here needs a new vendor relationship or a Browserless/LLM dependency.

| # | Capability | Demand evidence | Source & feasibility | Effort | Maint. | Price | Revenue hypothesis |
|---|---|---|---|---|---|---|---|
| **1** | **`mexican-company-data`** | **50 paid `google-search` calls**, verbatim `"AUTOFLETES CHIHUAHUA" 墨西哥 phone contact` ×50 distinct carriers, 100% success, one wallet, 30d. Zero Mexican capability exists | **INEGI DENUE API** — official, free, token via registration. `Nombre` method searches by name/razón social; returns `Nombre`, `Razon_social`, `Clase_actividad`, `Telefono`, `Correo_e`, `Sitio_internet`, `Latitud/Longitud`. 6M+ establishments | **M** | low | €0.05 | Replaces a €0.10 unstructured search with a €0.05 structured lookup at higher value. 50 calls/30d ≈ €2.50/mo from **one known buyer**; the real prize is proving the LatAm leg exists |
| **2** | **`company-name-resolve`** | 45+ name-shaped arrivals across 8 registries (§2.4); **17/26 `us-company-data` failures**; verbatim `No confident SEC EDGAR match for "Apple"`; slug guesses `company-lookup`, `contact-verify`, `lead-enrich` | Composes existing primitives: Serper (paid, live) + DNS verification + the registries we already run. Organisation-level only — **no personal data, no email inference** | **M** | near-zero | €0.05 | Converts refusals into calls across the whole registry shelf. ~45 refused calls/30d → even 50% conversion is €1.10/mo direct, but it unblocks the 20-registry catalogue that has earned €0 |
| **3** | **`product-offers-lookup`** | The retail recipe is real and entirely broken: `barcode-lookup → google-search` 20 pairs, `serp-analyze → barcode-lookup` 13, `serp-analyze → price-compare` 12. `product-search` **0/5**, `price-compare` 4/8, `product-reviews-extract` 5/42 — **€10.60 lost/30d** to 403s and 429s | **Serper.dev `/shopping`** — same vendor as `google-search`, key live in prod. Licensed SERP, **no scraping** (replaces the Tier-1-problematic scrapers) | **S** | near-zero | €0.10 | Directly recovers demand currently converting at ~15%. Even half the €10.60/30d lost line is €5/mo, and it retires two delisting candidates |
| **4** | **`domain-email-provider-detect`** | The email cluster is the volume leader: `email-validate` 422 calls/100%, `email-deliverability-check` 136/100%, `lead-email-verify` the #1 solution (57 calls, €11.40). Adjacency `keyword-suggest → email-validate` 13 | DNS MX only, via the existing `mx-lookup` primitive. **Zero external cost, zero vendor** | **S** | **zero** | €0.03 | Low ticket, high attach. Sells on the same call as `email-validate`; at 10% attach to 422 calls ≈ €1.25/mo, and it is genuinely zero-maintenance |
| **5** | **`sec-edgar-name-search`** | `us-company-data` **17/26 failed**, `'cik' or 'company_name' is required` ×4, plus the "Apple" mis-resolution. US is the weakest identity leg | `efts.sec.gov/LATEST/search-index` — free, official, no auth, public domain, documented fair-access (declared UA, ≤10 req/s) | **S** | low | €0.05 | Fixes a 27%-completion capability rather than adding surface. Carried from 2026-08-12 #7 with stronger numbers |
| **6** | **`wayback-snapshot-lookup`** | `pricing-page-extract` 16 calls, 14 ok, **€4.20** — best margin in competitive-intelligence; `google-search → pricing-page-extract` 12 pairs. "What did this page say last quarter" is the obvious extension | Internet Archive Availability + CDX API — free, no auth, documented | **S** | low | €0.05 | Inferential, not direct. Carried unchanged from 2026-08-12 #8 |
| **7** | **`package-download-stats`** | ⚠️ **Attribution failed — see §3.1.** 94 workaround calls, but the caller is Strale's own free-tier ops agent, silent since 2026-06-21 | npm registry downloads API + pypistats.org — free, no auth. **npm rate limits are undocumented** (verification debt) | **S** | near-zero | €0.03 | **No revenue hypothesis.** Justified only as a zero-maintenance dark-launch that removes 32 guaranteed free-tier failures. Build it last or not at all |

### Explicitly declined this round

| Idea | Why |
|---|---|
| `spanish-company-data` | 1 `no_match` (€0.50 bid, 2026-08-12) from an internal-shaped curl caller. ES is deactivated pending an aggregator; n=1 does not reopen it |
| Country registry #21+ (generic) | 12 company-data capabilities have earned **€0 in 90 days**. DEC-20260812-A / direction plan §4.5 already require a named buyer. Mexico (#1) is the exception *because* it has one |
| Flight search · agentic commerce · `email-finder` · `keyword-metrics` · `us-trademark-search` · suggest-log noise (`oauth`, `wikipedia`, …) | Unchanged from 2026-08-12 §2 "Explicitly declined". No new evidence |
| Free-text reasoning/writing tasks in `failed_requests` (Arbor, agentdex.dev, Hyperspell, `zzz-`/`totally-fake-`/`nonexistent-` negatives) | ~30 of 77 rows. Marketplace liveness probes and LLM prompts, never a capability gap |

---

## 6. Honest caveats

1. **n = 1, and it got worse.** One wallet is 89.7% of 30-day revenue. Candidates #1, #3 and most of Rank 0 are bets on that single customer's pipeline. If it stops, revenue falls to roughly €14/month. The 2026-08-12 recommendation — *find out who `0x9D3d9410…` is* — is now the highest-value action available, and this analysis strengthens rather than weakens it: we now know they run a **LatAm B2B contact-and-verification pipeline** with a Chinese-language operator layer, which is a specific enough profile to go looking for.
2. **`failed_requests` still cannot rank anything.** 77 rows all-time, ~30 of them bot noise, and the 97.5%-of-revenue rail writes nothing. Every "demand" claim here is inferred from purchases and failures, which shows what people *bought*, not what they *wanted and could not get*. Rank 0.7 remains the single highest-leverage instrumentation gap.
3. **`discovery_hits` has 4.5 hours of data.** §3.3 is a shape observation, not a finding. Re-run after two weeks before drawing any conclusion about discovery-to-revenue conversion. The zero-conversion result is what you would expect from crawler traffic and proves nothing yet.
4. **The internal-test finding (§3.2) is not fully diagnosed.** I have counts and error strings, not a read of the scheduler's tier assignment. The claim "hourly free-only scheduling ignores upstream quota" is inferred from `external_cost_cents = 0` selecting ReceitaWS/VIES/GLEIF; someone should confirm against `test-runner.ts` before acting. The *effect* — 2,142 failed internal Brazil calls and a 429'd paying customer — is directly observed and not in doubt.
5. **Mexican business phone/email data touches personal data at the margin.** DENUE covers establishments including sole traders, where a business phone may also be a personal one. The draft manifest sets `processes_personal_data: true` and `gdpr_art_22_classification: data_lookup`, and the limitations say so. This needs a human read before launch, not an engineering decision.
6. **DENUE rate limits and terms of use are unpublished.** The API docs state neither. Verification debt to close before build, same class as the Austrian Firmenbuch item (2026-08-12 §5 V1).
7. **Nothing here measures cost.** Unchanged from 2026-08-12 §5.8. The €21.74/30d lost-revenue figure is a list-price ceiling, not margin; capabilities failing on 403 may be *cheaper* failed than served.
8. **The 2026-08-12 TOAST corruption warning still stands.** All queries here ran with `max_parallel_workers_per_gather = 0` and none errored, which is consistent with that report and neither confirms nor clears it.

---

## 7. Recommendation

Unchanged in direction from 2026-08-12, sharpened by the new evidence:

1. **Fix Rank 0.1 first.** It is not a capability bug — it is the platform's own test infrastructure destroying paid calls and sending ~4,000 requests/month to VIES and GLEIF for capabilities nobody buys. It is the only item on this list with a compliance dimension.
2. **Merchandise before building** (§4). Four capabilities with recorded demand and zero calls. `domain-contact-extract` losing to a Google workaround is the proof that discovery, not supply, is the binding constraint.
3. **Then build #1–#4.** Mexico is the first capability in a year with a named, paying, repeat buyer identifiable *before* the build. That is the standard the intake loop was designed to enforce, and it is the reason to build it despite twelve dead country registries.

Draft manifests for #1–#5 are in `manifests-drafts/`. They are **not** in `manifests/` and must not enter the onboarding pipeline until the executors exist and the verification debt in each `# DRAFT` header is closed.
