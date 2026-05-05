# 2026-04-18 — CZ remaining to-dos (Notion import queue)

**Intent:** Cloudflare rate-limit blocked writes to the To-do DB mid-stream during the 2026-04-18 session. 2 of 9 specs landed. The 7 below are staged here for import when the CF window clears.

**Target:** Notion To-do DB
- URL: https://www.notion.so/33a67c87082c80228c50d529aac6ba6f
- data_source_id: `33a67c87-082c-8033-8ac5-000ba9922392`

**Already landed (do not re-import):**
- [P0 — Recover dangling CZ commits + resolve DB/code drift](https://www.notion.so/34667c87082c819db372e98553ca8513)
- [P1 — Implement cz-insolvency-check (ISIR) — decision + spike session](https://www.notion.so/34667c87082c819d9591f0f920c04442)

---

## 1. cz-court-decisions-search (Batch 2)

- **Status**: Inbox
- **Owner**: Claude code
- **Priority**: P1
- **Effort**: M
- **Source**: 2026-04-17 CZ onboarding session — Batch 2
- **Notes**: rozhodnuti.justice.cz open-data API works for date-based iteration. Needs search-by-party path.

**Body:**

### Verified endpoint

`GET https://rozhodnuti.justice.cz/api/opendata/{YYYY}/{MM}/{DD}` returns paginated JSON:

```json
{"items":[], "numberOfItems":0, "pageSize":100, "pageNumber":0, "totalPages":0, "totalElements":0}
```

Probed 2024-01-01 during 2026-04-17 session — HTTP 200, clean JSON, no auth.

### Gap before implementation

Date-based endpoint returns ALL decisions on a given day. Good for bulk mirror, not lookup by party. Need the search endpoint accepting `ic=` or full-text.

**Spike tasks:**
1. Probe `https://rozhodnuti.justice.cz/api/search` and variants.
2. Inspect public UI at `https://rozhodnuti.justice.cz/` via Browserless — frontend likely calls an internal JSON endpoint visible in network tab.
3. If no search endpoint exists: daily-iterate the date endpoint, index by party IČO locally, serve from index.

### Implementation spec

- **slug**: `cz-court-decisions-search`
- **category**: `compliance` (pairs with `eu-court-case-search` which covers CURIA only, NOT CZ national courts)
- **price**: €0.15
- **input**: `{ query: string, party_ico?: string, date_from?: string, date_to?: string, limit?: int }`
- **output**: `{ total_results, results: [{case_number, court, date_published, parties, subject_keywords, url}] }`
- **transparency_tag**: `algorithmic`
- **limitations**: (1) only decisions published digitally (post-~2012 for district courts); (2) decisions anonymized — party IDs may be redacted for natural persons; (3) full-text Czech only.
- **test fixture known_answer**: pick a well-known CZ case (e.g. a published Supreme Court decision).

### Refs

- Probe: `curl -sS 'https://rozhodnuti.justice.cz/api/opendata/2024/01/01'`
- Public UI: https://rozhodnuti.justice.cz/
- Open-data landing: https://rozhodnuti.justice.cz/opendata/

---

## 2. cz-trade-license-check (RŽP status from ARES)

- **Status**: Inbox
- **Owner**: Claude code
- **Priority**: P1
- **Effort**: S
- **Source**: 2026-04-17 CZ onboarding session — Batch 2
- **Notes**: MVP version is a thin wrapper of ARES (already returns Rzp status). Licensed-activity list requires separate endpoint investigation.

**Body:**

### MVP insight

The existing `cz-company-data` ARES response already contains `seznamRegistraci.stavZdrojeRzp` — e.g. `AKTIVNI` / `ZANIKLY` / `NEEXISTUJICI`. For 90% of KYB use cases, knowing *"is this company registered in the trade-license register?"* is the needed signal. A thin companion capability that surfaces this cleanly is MVP.

### Spec

- **slug**: `cz-trade-license-check`
- **category**: `compliance`
- **price**: €0.05
- **input**: `{ ico: string }`
- **output**:
  ```
  {
    ico: string,
    is_registered_in_rzp: boolean,
    rzp_status: "active" | "dissolved" | "nonexistent" | "unknown",
    licensed_activities: null,  // see limitations — requires separate integration
    ros_status: string,          // passthrough for completeness
    vr_status: string,
    last_updated: string,
    primary_source: string
  }
  ```
- **transparency_tag**: `algorithmic`
- **limitations**: (1) does NOT list the actual licensed trade activities (volné/vázané/řemeslné/koncesované) — that requires a direct RŽP integration at rzp.gov.cz/verejne-udaje which has a separate XML API not wrapped here; (2) status reflects ARES's nightly sync of RŽP, so lag up to 24h.
- **test fixture known_answer**: Škoda Auto IČO 00177041 — `is_registered_in_rzp: true, rzp_status: "active"`.

### Future enhancement

Follow-up task to add `licensed_activities` by integrating the RŽP XML API directly at rzp.gov.cz. Format: XSD-described, ~30 pages of Czech docs. Effort ~M.

### Probe results (2026-04-17)

- Tried `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/00177041/zivnosti` → 404. No direct sub-resource in the `ekonomicke-subjekty-v-be` namespace.
- Tried `https://ares.gov.cz/ekonomicke-subjekty-rzp/rest/rzp/vyhledat` → 405 (probably wrong verb/path).
- Current ARES response confirmed to include the `stavZdrojeRzp` flag as shown above.

---

## 3. cz-address-verify via RÚIAN ArcGIS REST (Batch 4)

- **Status**: Inbox
- **Owner**: Claude code
- **Priority**: P2
- **Effort**: M
- **Source**: 2026-04-17 CZ onboarding session — Batch 4
- **Notes**: ArcGIS REST path works — better than SOAP WSDP. Layer 1 = AdresniMisto.

**Body:**

### Verified endpoint

`https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Vyhledavaci_sluzba_nad_daty_RUIAN/MapServer` — ESRI ArcGIS REST, free, no auth.

Probed during 2026-04-17 session. Returns service metadata with 24 feature layers:

- Layer 0: ParcelaDefinicniBod (parcel centroids)
- **Layer 1: AdresniMisto (address places)** ← the one we want for address verification
- Layers 2-23: streets, municipalities, regions, etc.

Layer 1 fields verified:

```
kod (address-place ID — stable), nespravny, cislodomovni, cisloorientacni,
cisloorientacnipismeno, psc, stavebniobjekt, ulice, platiod, platido,
idtransakce, globalniidnavrhuzmeny, vo_kod, adresa (text)
```

### Query pattern

`GET /MapServer/1/query?where=<SQL-like>&outFields=*&f=json&resultRecordCount=10`

Examples:
- Search by address text: `where=adresa+LIKE+'%Jankovcova+1522%'`
- Search by PSC: `where=psc=17000`
- Search by address-place ID: `where=kod=25958895`

### Spec

- **slug**: `cz-address-verify`
- **category**: `validation`
- **price**: €0.05
- **input**: `{ address: string }` (free-text Czech address) OR `{ kod: int }` (ArcGIS address-place ID)
- **output**:
  ```
  {
    query: string,
    is_match: boolean,
    confidence: "exact" | "fuzzy" | "none",
    address_place_id: int,    // RÚIAN kod
    normalized_address: string, // the official adresa field
    street: string,
    house_number: string,
    orientation_number: string,
    postcode: string,
    municipality: string,
    building_object_id: int,   // stavebniobjekt
    valid_from: string,
    valid_to: string
  }
  ```
- **transparency_tag**: `algorithmic`
- **limitations**: (1) CZ addresses only; (2) fuzzy match uses ArcGIS LIKE wildcards — expect false positives on common street names; (3) address-place-id `kod` is stable but expect new buildings not to be in the dataset for several weeks after construction.
- **test fixture known_answer**: Škoda HQ `tř. Václava Klementa 869, Mladá Boleslav II, 29301 Mladá Boleslav` — expect match.

### Why ArcGIS over SOAP WSDP

Original CZ deep-scan recommended a spike between RÚIAN SOAP (WSDP — requires registered AIS identity) vs open-data dumps. This probe found a third, cleaner path: the ArcGIS REST service is publicly accessible, returns JSON, and supports SQL-like query syntax. Ship this — skip SOAP.

### Refs

- Service root: https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Vyhledavaci_sluzba_nad_daty_RUIAN/MapServer
- Layer 1 metadata: `?f=json` on the above

---

## 4. cz-public-contracts-search via smlouvy.gov.cz (Batch 3) — spike first

- **Status**: Inbox
- **Owner**: Claude code
- **Priority**: P2
- **Effort**: L
- **Source**: 2026-04-17 CZ onboarding session — Batch 3
- **Notes**: No clean JSON API found. All `/api/*` paths return 404 ISRS error page. Need bulk-dump ETL or UI scrape. Spike before build.

**Body:**

### Probe results (2026-04-17) — summary: no JSON API

Tried all of the following and got 404 with the ISRS error page:

- `https://smlouvy.gov.cz/api/v1/smlouvy`
- `https://smlouvy.gov.cz/api/v2/smlouvy`
- `https://smlouvy.gov.cz/api/smlouva`
- `https://smlouvy.gov.cz/api/v2.0/dump`
- `https://data.smlouvy.gov.cz/index.html`
- `https://smlouvy.gov.cz/data/`

The search UI page at `https://smlouvy.gov.cz/vyhledavani` works (HTTP 200), and `https://data.smlouvy.gov.cz/` responds 200 at the root but the path structure below it is unknown.

The open-data page `https://smlouvy.gov.cz/otevrena-data` was scraped — no canonical dump URL surfaced from the HTML (page is likely JS-rendered).

### Spike tasks (do first)

1. Fetch `https://smlouvy.gov.cz/otevrena-data` via Browserless (get the JS-rendered HTML) to find the canonical dump/API paths.
2. Alternatively, watch the network tab on the search UI at `https://smlouvy.gov.cz/vyhledavani` — the filter form will reveal the actual backend endpoint it hits.
3. Check Act 340/2015 requirements — the registry MUST expose bulk data per law. There's a canonical endpoint somewhere.
4. Fallback candidate: the dataset is mirrored in the national open-data catalog at `https://data.gov.cz/` — search there for "Registr smluv" to get the official dump URL.

### Spec (pending spike outcome)

- **slug**: `cz-public-contracts-search`
- **category**: `compliance`
- **price**: €0.15
- **input**: `{ party_ico: string, date_from?: string, date_to?: string, min_amount_czk?: number, limit?: int }`
- **output**:
  ```
  {
    party_ico: string,
    total_contracts: int,
    total_value_czk: number,
    contracts: [{
      contract_id: string, counterparty_ico: string, counterparty_name: string,
      subject: string, amount_czk: number, currency: string, signed_at: string,
      published_at: string, pdf_url?: string
    }]
  }
  ```
- **transparency_tag**: `algorithmic`
- **limitations**: (1) only contracts >50k CZK signed since 2016; (2) includes CZ state party only — private-to-private contracts not covered; (3) amount-redacted contracts exist (marked as such, amount nullable).
- **test fixture known_answer**: a municipality that has a well-known public contract, e.g. Prague + some IT supplier.

### Implementation patterns to evaluate

- **A. Bulk ETL**: nightly ingest the daily XML dump → index by counterparty IČO → serve lookups from local DB. Best freshness-vs-cost.
- **B. On-demand scrape of search UI**: per query, hit the UI, parse results. Simpler but slower and fragile.

Better default: **A** once the bulk URL is located, since smlouvy.gov.cz is specifically designed for bulk access under Act 340/2015.

---

## 5. cz-procurement-search via NEN / ISVZ (Batch 3)

- **Status**: Inbox
- **Owner**: Claude code
- **Priority**: P2
- **Effort**: L
- **Source**: 2026-04-17 CZ onboarding session — Batch 3
- **Notes**: Pairs with TED for sub-EU-threshold tenders. NEN main site reachable; ISVZ reporting portal slow. Needs bulk-data path.

**Body:**

### Probe results (2026-04-17)

- `https://nen.nipez.cz/` → 200 (main site)
- `https://nen.nipez.cz/verejne-zakazky` → 200 (tender list UI)
- `https://isvz.nipez.cz/` → 200 (reporting portal)
- `https://isvz.nipez.cz/kontrakty` → timed out at 5s (slow; may work with higher timeout)
- NEN main site auth link visible: `/portal/api/auth/aanipez/login` — the NEN backend has auth for buyer-side access. Public read is via the /verejne-zakazky UI.

### Why this capability

We already have `ted-procurement` which covers CZ tenders above EU thresholds. NEN/Věstník covers the sub-EU-threshold tenders TED misses — materially different dataset for SME-focused KYB use cases.

### Spike before build

1. Open NEN search UI in Browserless, inspect the JSON endpoint the filter form hits — most likely a backend at `nen.nipez.cz/portal/api/...` accessible without auth for public data.
2. Check ISVZ bulk open-data — the research agent flagged ISVZ as the XML-dump source. Look for canonical dump URL on `data.gov.cz` under "ISVZ".
3. Test with higher timeout (30s+) against ISVZ — it's known to be slow but might respond.

### Spec (pending spike)

- **slug**: `cz-procurement-search`
- **category**: `compliance`
- **price**: €0.15
- **input**: `{ buyer_ico?: string, supplier_ico?: string, date_from?: string, min_value_czk?: number, limit?: int }`
- **output**:
  ```
  {
    total_results: int,
    total_value_czk: number,
    tenders: [{
      tender_id: string, buyer_name: string, buyer_ico: string,
      supplier_name?: string, supplier_ico?: string,
      subject: string, value_czk?: number, published_at: string,
      award_date?: string, status: string
    }]
  }
  ```
- **transparency_tag**: `algorithmic` (if direct API) or `mixed` (if Browserless+extraction)
- **limitations**: (1) sub-EU-threshold only — use `ted-procurement` for above-threshold; (2) NEN adoption only reached 100% in 2022, historical coverage is partial pre-2021; (3) award_date may be null until contract is signed.
- **test fixture known_answer**: a known CZ buyer with public tenders (e.g. a large city's IT procurement).

### Refs

- NEN: https://nen.nipez.cz/
- ISVZ portal: https://isvz.nipez.cz/
- Portál o veřejných zakázkách: https://portal.gov.cz/en/informace/information-on-public-procurement-INF-199

---

## 6. cz-law-lookup via eSbírka (Batch 4) — MV registration required

- **Status**: Inbox
- **Owner**: Claude code (blocked on human registration)
- **Priority**: P3
- **Effort**: M
- **Source**: 2026-04-17 CZ onboarding session — Batch 4
- **Notes**: Public API since 15 Jan 2024, but requires free registration with Ministry of Interior to get an API key. Complete that step before implementation.

**Body:**

### Status: API exists, needs key

Per the deep-scan research:
- eSbírka public API launched **15 Jan 2024**
- Free, but requires registration with MV ČR (Ministerstvo vnitra)
- Covers every Czech law, fulltext, machine-readable, versioned

### Probe results (2026-04-17)

- `https://www.e-sbirka.cz/api/documents` → 308 redirect (auth required)
- `https://www.e-sbirka.cz/api` → 308
- `https://www.e-sbirka.cz/open-data` → 200 (landing, no API schema scraped)
- `https://opendata.e-sbirka.cz/` → DNS fail (not a subdomain)

The actual API documentation and registration form are behind the `/open-data` landing; without a registered key we can't go further.

### Pre-implementation step (human action required)

1. Register for API access at `https://www.e-sbirka.cz/open-data` (form is Czech-only — use translation).
2. Wait for MV ČR approval + API key.
3. Add `ESBIRKA_API_KEY` to Railway env.
4. Once key is live, proceed to implementation below.

### Spec

- **slug**: `cz-law-lookup`
- **category**: `data-extraction` (or new `legal`)
- **price**: €0.10
- **input**: `{ query: string, law_number?: string, year?: int, topic?: string, limit?: int }`
- **output**:
  ```
  {
    query: string,
    total_results: int,
    laws: [{
      law_number: string,      // e.g. "89/2012 Sb."
      title: string,
      year: int,
      effective_from: string,
      superseded: boolean,
      full_text_url: string,
      topics: [string],
      snippet: string          // first paragraph or matching context
    }]
  }
  ```
- **transparency_tag**: `algorithmic`
- **limitations**: (1) Czech-only full text; (2) snippets are first N chars, not semantic match excerpts; (3) superseded flag reflects current state only — historical law-text queries possible by `year` filter.
- **test fixture known_answer**: well-known law like zákon č. 89/2012 Sb. (občanský zákoník).

### Priority reasoning

Lower than compliance caps because the consumer segment is legal-AI agents, which isn't Strale's primary wedge. Raise to P2 if legal-AI becomes a target segment.

### Refs

- Open data landing: https://www.e-sbirka.cz/open-data
- Announcement: https://zakony.gov.cz/gov/otevrena-data-a-verejna-api-systemu-e-sbirka-od-15-ledna/

---

## 7. Ship CZ solution bundles — kyb-essentials-cz, invoice-verify-cz, kyb-complete-cz

- **Status**: Inbox
- **Owner**: Claude code
- **Priority**: P1
- **Effort**: M
- **Source**: 2026-04-17 CZ onboarding session
- **Notes**: Blocked on: (1) dangling-commits recovery (P0 task), (2) cz-insolvency-check decision (P1 task). Once Batch 1/1.5 is deployed, kyb-essentials and invoice-verify can ship without insolvency if needed.

**Body:**

### Dependencies

- [BLOCKING] `Recover dangling CZ commits + resolve DB/code drift` — Batch 1/1.5 must be deployed.
- [BLOCKING for `kyb-complete-cz`] `Implement cz-insolvency-check` decision.

### Three bundles to assemble

**A. `kyb-essentials-cz`** (4 checks, ~€1.50)

Matches the Nordic KYB Essentials shape.
- `cz-company-data` (ARES) €0.05
- `vat-validate` (VIES) €0.05 — already live
- `cz-unreliable-vat-payer` (MF ČR) €0.05
- `cz-insolvency-check` (ISIR) €0.10 ← if unavailable, ship as 3-check version

Total: €0.25 inputs → retail ~€1.50.

**B. `invoice-verify-cz`** (12-14 checks, ~€2.50)

Matches `invoice-verify-{cc}` pattern.
- `cz-company-data` (supplier ARES lookup)
- `cz-ico-validate` (supplier IČO format check)
- `vat-validate` (supplier DIČ against VIES)
- `cz-unreliable-vat-payer` (§109 joint liability flag)
- `cz-bank-account-validate` (domestic BBAN checksum on invoice account)
- `cz-insolvency-check` (supplier insolvency status)
- `iban-validate` (if invoice quotes IBAN)
- **critical cross-reference**: compare the invoice's bank account against `cz-unreliable-vat-payer.published_accounts`. If the invoice bank account is NOT in the published list, flag §109 joint-liability risk.
- `risk-narrative-generate` (final synthesis)

**C. `kyb-complete-cz`** (11-14 checks, ~€2.50)

Matches `kyb-complete-{cc}` pattern.
- Everything from kyb-essentials-cz
- `pep-check` (OpenSanctions — already covers CZ PEPs)
- `sanctions-check` (OpenSanctions — already covers `cz_national_sanctions`)
- `adverse-media-check` (Serper+Haiku — language agnostic)
- `cz-court-decisions-search` (Batch 2 cap)
- `cz-public-contracts-search` (Batch 3 cap — optional, adds procurement footprint)
- `risk-narrative-generate`

### Spec requirements for solutions

Solutions live in the `solutions` table. Fields needed: slug, name, description, category, price_cents, included_capabilities (array of slugs), country (CZ).

Use existing solution builder scripts — look for `apps/api/scripts/seed-solutions.ts` or similar. Follow the same pattern as the already-live Nordic bundles.

### Critical implementation detail for invoice-verify-cz

The §109 match logic (invoice bank account vs published accounts) is the **key value-add** for the Czech market. Don't just run the checks in parallel — enforce this cross-reference in the solution executor. Flag cases where:

1. Supplier is flagged unreliable → **HIGH RISK**
2. Supplier has no published accounts at all → **MEDIUM RISK**
3. Invoice bank account ≠ any published account → **MEDIUM RISK — §109 liability**
4. All checks clean → **LOW RISK**

This is not cosmetic — it's the compliance reason Czech CFOs would pay for this solution over cheaper single-check alternatives.
