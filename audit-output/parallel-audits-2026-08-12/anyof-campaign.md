# Declared input contracts for the whole catalog — anyOf campaign analysis

Date: 2026-08-12 · Read-only analysis of `C:\Users\pette\Projects\strale` (no edits, no git ops, no DB writes).
Validator under analysis: `apps/api/src/lib/x402-input-validation.ts` (`validateX402Input`), wired into
`POST /v1/do` (`apps/api/src/routes/do.ts`, after the classic-required gate) and the x402 handlers.

---

## 0. Headline findings (read these first)

0. **Repo-state caveat — read before acting.** This analysis ran while the working tree was on
   branch `readiness/p2-underbuilt` (a concurrent session switched it mid-analysis; the tree also
   gained untracked files during the run). Verified against `origin/main` and open PRs:
   - `apps/api/src/lib/x402-input-validation.ts` **is on main**, and **is wired into the x402
     surface on main** (`x402-gateway-v2.ts` lines 971 / 1187, both capability and solution paths).
   - It is **NOT wired into `POST /v1/do` on main.** That wiring exists only on the current branch
     and is in flight as **open PR #180** ("fix(readiness): P2 underbuilt — do.ts anyOf parity …").
   - **Consequence:** an `anyOf` shipped today takes effect on x402 immediately and on `/v1/do`
     only once PR #180 lands. Sequence the data PR after #180, or expect asymmetric enforcement
     between the two surfaces in the interim.
   - Files differing from `origin/main` in the paths analysed: `eu-regulation-search.ts`,
     `price-compare.ts` (+ its manifest), `redirect-trace.ts`, `startup-domain-check.ts`,
     `lib/tos-blocklist.ts`, `lib/web-provider.ts`, `routes/do.ts`. **None of these carry a
     proposed change below** — every action item was read from a file identical to main.

1. **The premise "NO manifest declares anyOf" is not quite right.** Three already do:
   `tech-stack-detect` (url|domain), `image-to-text` (base64|image_url), `us-company-data`
   (company|cik|company_name|ticker). These are the working precedent — the campaign extends
   the pattern, it does not introduce it.

2. **A manifest-only PR changes nothing in production.** `capabilities.input_schema` (the jsonb
   column both validators read) is **not** written by `scripts/onboard.ts` — grep confirms
   onboard.ts never sets `inputSchema` on a capability row. Only two paths write it:
   `PATCH /v1/admin/capability-schema` (admin.ts:634) and
   `scripts/sync-manifest-canonical-to-db.ts <slug>`. **Each manifest edit must be paired with a
   sync/PATCH per slug, and post-deploy verified by querying the row.** This is a
   DEC-20260504-C (Deploy Mechanism Verification) obligation for the follow-up PR — treat it as
   the primary risk of the campaign, not an afterthought.

3. **`danish-company-data` and `finnish-company-data` are live, still-blocked #168/#173 cases.**
   Their executors were fixed on 2026-08-09 to accept `company_name` (the code comments name the
   lost calls: LEGO, Novo Nordisk ×2, Maersk, Nokia ×2), but their manifests still say
   `required: [cvr_number]` / `[business_id]` with a single property. The route gate rejects
   `{"company_name": "LEGO"}` *before* the executor is reached — so the 2026-08-09 fix is
   currently unreachable on both paths. Highest-value item in the campaign.

4. **`swiss-company-data` is active but its executor unconditionally throws** (swiss-company-data.ts:12
   — the whole handler is a `throw`). No input contract exists to declare. It should be
   deactivated or credential-gated, not schema-patched.

5. **Four of the ten "blocked registries" cannot resolve a company name at all.** Opening their
   schemas to `company_name` would produce guaranteed or misleading failures. Details in §4.

6. **No capability declares a `required` field its executor doesn't read.** The corrected
   cross-reference (§1 method note) found zero. The mismatch class is entirely the inverse:
   executors accept aliases and alternatives the schema never exposes.

---

## 1. Summary counts

| Metric | Count |
|---|---|
| Manifests in `manifests/` | 325 |
| In `DEACTIVATED` map (`auto-register.ts`) — skipped | 24 |
| **Active manifests analysed** | **313** |
| Already declare `anyOf`/`oneOf` | 3 |
| **(a) strict-required, correctly declared — no action** | 250 |
| **(b) either/or — needs an `anyOf` block** | 53 |
| **(c) all-optional — `{}` is canonical, declare nothing** | 4 |
| **(d) mismatch — schema contradicts/under-declares executor** | 17 |
| Strict-required present but undeclared (`required: []` → real required) | 1 |
| **Total needing a change** | **63** |

Classes (b) and (d) overlap by design: of the 17 class-(d) entries, **11 are fixed by emitting an
`anyOf`** (and are counted in the 53), **5 must explicitly NOT get one** (`brazilian-company-data`,
`polish-company-data`, `au-company-data`, `charity-lookup-uk`, `swiss-company-data`), and 1
(`image-to-text`) is a pre-existing gap in a manifest that already has an `anyOf`. The 1
undeclared-strict case is `company-news`. 53 + 4 + 5 + 1 = 63 manifests to touch.

Deactivated slugs excluded (24): amazon-price, annual-report-extract, australian-company-data,
business-license-check-se, council-tax-lookup, credit-report-summary, ecb-interest-rates,
email-finder, employer-review-summary, eu-court-case-search, hong-kong-company-data,
indian-company-data, linkedin-url-validate, patent-search, salary-benchmark, stamp-duty-calculate,
trustpilot-score, uk-crime-stats, uk-deprivation-index, uk-epc-rating, uk-flood-risk,
uk-rental-yield, uk-sold-prices, uk-transport-access.

### Method note (why an earlier pass was wrong)

A first cross-reference reported ~24 "required field not read by executor" mismatches
(`sanctions-check` requiring `name` etc.). **All were false positives** — the field-extraction
regex was filtering a noise list that contained legitimate field names (`name`, `text`, `message`,
`status`). Re-running with a corrected extractor (excludes only `input.x(` method calls, and
additionally resolves `firstString(input, "a", "b", …)` variadic alias helpers, used by
danish/finnish/norwegian-company-data) produced **zero** true cases. Field names below were read
off executor source, not inferred.

### The `task` alias — deliberately excluded from every proposal

~150 executors accept `input.task` as a last-resort alias. It is the `/v1/do` natural-language
routing string, not a contract branch: it does not exist on the x402 surface, and promoting it to
an `anyOf` branch would let `{"task": "..."}` satisfy validation on a path where the executor then
fails anyway. **No proposed `anyOf` block below contains `task`.** One capability
(`gdpr-fine-lookup`) names `task` in its own error text — flagged in §4 as a wording bug, not a
contract.

---

## 2. Full per-capability table (non-trivial classes only)

258 class-(a) capabilities already declare a correct strict `required` and need no change; they are
omitted for length. Everything requiring action, or requiring a deliberate decision *not* to act,
is listed.

| slug | class | current `required` | proposed change |
|---|---|---|---|
| api-docs-generate | b | `[]` | anyOf: openapi_spec \| endpoint_description |
| belgian-company-data | b | `[]` | anyOf: enterprise_number \| company_name |
| canadian-company-data | b,d | `[corporation_number]` | add `company_name` property; anyOf: corporation_number \| company_name |
| changelog-generate | b | `[]` | add `git_log` property; anyOf: commits \| raw_log \| git_log |
| company-industry-classify | b | `[]` | add `name` property; anyOf: company_name \| name \| description |
| **company-news** | **a (undeclared)** | `[]` | **strict** `required: [company_name]` — executor hard-requires it; not either/or |
| contract-extract | b | `[]` | add `url` property; anyOf: pdf_url \| url \| base64 \| text |
| cz-company-data | b,d | `[ico]` | add `company_number`, `company_name`; anyOf: ico \| company_number \| company_name |
| **danish-company-data** | **d (blocking)** | `[cvr_number]` | add `company_name` (+ org_number, company_number, name aliases); anyOf: cvr_number \| company_name |
| dependency-audit | b | `[]` | anyOf: package_json \| requirements_txt |
| email-validate-bulk | b | `[]` | anyOf: emails \| email_addresses \| text |
| env-template-generate | b | `[]` | anyOf: code \| project_description |
| estonian-company-data | b | `[]` | anyOf: registry_code \| company_name |
| fake-data-generate | b | `[]` | anyOf: schema \| fields |
| **fear-greed-index** | **c** | `[]` | **no change** — `days` defaults; `{}` is the canonical paid call |
| **finnish-company-data** | **d (blocking)** | `[business_id]` | add `company_name` (+ org_number, name aliases); anyOf: business_id \| company_name |
| fr-bodacc-lookup | b | `[]` | anyOf: siren \| company_name |
| **gas-price-check** | **c** | `[]` | **no change** — `chain_id` defaults to `"1"`; `{}` valid |
| gdpr-fine-lookup | b,d | `[]` | anyOf: company \| country_code; **also fix error text** (names `task` as acceptable) |
| german-company-data | b | `[]` | anyOf: company_id \| (hrb_number + court) \| company_name — note the 2-field branch |
| gitignore-generate | b | `[]` | anyOf: languages \| frameworks \| ides (see array caveat §5) |
| gleif-l2-children-lookup | b | `[]` | anyOf: lei \| company_name |
| gleif-l2-ubo-lookup | b | `[]` | anyOf: lei \| company_name |
| greek-company-data | b | `[]` | add org_number, ar_gemi, tax_id aliases; anyOf: gemi_number \| org_number \| ar_gemi \| afm \| tax_id |
| html-to-pdf | b | `[]` | anyOf: html \| url |
| image-resize | b | `[]` | 4-branch AND-of-ORs — see §3, exactly expressible |
| invoice-extract | b | `[]` | anyOf: url \| base64 |
| irish-company-data | b | `[]` | anyOf: cro_number \| company_name |
| japanese-company-data | b,d | `[corporate_number]` | add `company_name`; anyOf: corporate_number \| company_name |
| job-posting-analyze | b | `[]` | anyOf: url \| text (both read at job-posting-analyze.ts:6-9) |
| latvian-company-data | b | `[]` | anyOf: reg_number \| company_name |
| lei-lookup | b | `[]` | anyOf: lei \| company_name |
| lithuanian-company-data | b | `[]` | add `ja_kodas`; anyOf: company_code \| ja_kodas \| company_name |
| nl-energy-label | b | `[]` | anyOf: (postcode + huisnummer) \| bag_id |
| **nl-housing-price-index** | **c** | `[]` | **no change** — year/months default; `{}` valid |
| nl-housing-stats | b | `[]` | add gemeente, municipality, municipality_code; anyOf: city \| gm_code (+aliases) |
| nl-woz-value | b | `[]` | same as nl-housing-stats |
| no-bankruptcy-check | b | `[]` | anyOf: org_number \| company_name |
| norwegian-company-data | b | `[]` | anyOf: org_number \| company_name (props already list both) |
| pdf-extract | b | `[]` | anyOf: url \| base64 |
| receipt-categorize | b | `[]` | add `url`; anyOf: image_url \| url \| base64 \| text |
| resume-parse | b | `[]` | add `url`; anyOf: pdf_url \| url \| base64 \| text |
| sec-filing-events | b | `[]` | anyOf: company_name \| ticker \| cik |
| singapore-company-data | b | `[]` | anyOf: uen \| company_name |
| slovenian-company-data | b,d | `[]` | add `matricna_stevilka`; anyOf: reg_number \| matricna_stevilka \| company_name |
| social-post-generate | b | `[]` | add `topic`; anyOf: content \| topic \| url |
| **stablecoin-flow-check** | **c** | `[]` | **no change** — `{}` returns the market summary (line 109 branch) |
| **swiss-company-data** | **d (dead)** | `[]` | executor is an unconditional `throw` — deactivate, do not patch schema |
| uk-companies-house-officers | b | `[]` | anyOf: company_number \| company_name |
| uk-filing-events | b | `[]` | anyOf: company_number \| company_name |
| us-court-search | b | `[]` | anyOf: query \| party_name \| company_name |
| us-ein-match | b | `[]` | add `company_name`; anyOf: ein \| business_name \| company_name |
| us-sec-filings-extended | b | `[]` | add `business_name`; anyOf: cik \| company_name \| business_name |
| weather-lookup | b | `[]` | add location/lat/lon/lng; anyOf: city \| location \| (latitude + longitude) \| (lat + lon) |
| **beneficial-ownership-lookup** | **d (blocking)** | `[company_name]` | executor accepts company_name \| company_number; current `required` blocks a number-only call → anyOf |
| **us-company-data-cobalt** | **d** | `[state]` | keep `required: [state]` **and add** anyOf: company_id \| company_name (validator applies both rules) |
| **charity-lookup-uk** | **d** | `[]` | executor accepts `name` but the name branch **always throws** (no free name API) → declare `required: [charity_number]`, not an anyOf |
| **brazilian-company-data** | **d** | `[cnpj]` | executor reads `company_name` then always rejects it → **keep as-is**; see §4 |
| **polish-company-data** | **d** | `[krs_number]` | same shape as brazilian → **keep as-is**; see §4 |
| **croatian-company-data** | **d** | `[oib]` | add `mbs` property; anyOf: oib \| mbs. **No name path exists** |
| **slovak-company-data** | **d** | `[ico]` | add `company_number`; anyOf: ico \| company_number. **No name path exists** |
| **swedish-company-data** | **d** | `[org_number]` | add identitetsbeteckning, company_number; anyOf of the three. **No name path exists** |
| **au-company-data** | **d** | `[abn]` | correct as-is; **no name path exists** |

---

## 3. Ready-to-apply YAML — class (b) `anyOf` blocks

Each block replaces/extends the `input_schema` of the named manifest. `required: []` stays (the
validator runs rule 1 then rule 2; an empty flat `required` is a no-op). New `properties` entries
are shown where the executor reads a field the schema never declared — **add them, or the branch
names a field agents cannot discover from the published schema.** Field names verified against
executor source line-by-line.

### Document / file input (url ⊕ base64 ⊕ text)

```yaml
# manifests/invoice-extract.yaml  (invoice-extract.ts:102-108)
input_schema:
  type: object
  required: []
  properties:
    url: { type: string, description: "URL of an invoice image or PDF" }
    base64: { type: string, description: "Base64-encoded invoice file" }
  anyOf:
    - required: [url]
    - required: [base64]
```

```yaml
# manifests/pdf-extract.yaml  (pdf-extract.ts:6-12)
input_schema:
  type: object
  required: []
  properties:
    url: { type: string, description: "URL of the PDF" }
    base64: { type: string, description: "Base64-encoded PDF" }
    extract: { type: string, description: "What to extract (optional)" }
  anyOf:
    - required: [url]
    - required: [base64]
```

```yaml
# manifests/contract-extract.yaml  (contract-extract.ts:6-11 — `url` aliases `pdf_url`)
input_schema:
  type: object
  required: []
  properties:
    pdf_url: { type: string, description: "URL of the contract PDF" }
    url: { type: string, description: "Alias for pdf_url" }
    base64: { type: string, description: "Base64-encoded contract file" }
    text: { type: string, description: "Raw contract text" }
  anyOf:
    - required: [pdf_url]
    - required: [url]
    - required: [base64]
    - required: [text]
```

```yaml
# manifests/resume-parse.yaml  (resume-parse.ts:6-11 — identical shape)
input_schema:
  type: object
  required: []
  properties:
    pdf_url: { type: string, description: "URL of the resume PDF" }
    url: { type: string, description: "Alias for pdf_url" }
    base64: { type: string, description: "Base64-encoded resume file" }
    text: { type: string, description: "Raw resume text" }
  anyOf:
    - required: [pdf_url]
    - required: [url]
    - required: [base64]
    - required: [text]
```

```yaml
# manifests/receipt-categorize.yaml  (receipt-categorize.ts:6-11 — `url` aliases `image_url`)
input_schema:
  type: object
  required: []
  properties:
    image_url: { type: string, description: "URL of the receipt image" }
    url: { type: string, description: "Alias for image_url" }
    base64: { type: string, description: "Base64-encoded receipt image" }
    text: { type: string, description: "Raw receipt text" }
  anyOf:
    - required: [image_url]
    - required: [url]
    - required: [base64]
    - required: [text]
```

```yaml
# manifests/html-to-pdf.yaml  (html-to-pdf.ts:7-10)
input_schema:
  type: object
  required: []
  properties:
    html: { type: string, description: "Raw HTML to render" }
    url: { type: string, description: "URL to render instead of raw HTML" }
    paper_size: { type: string }
    landscape: { type: boolean }
    margins: { type: object }
  anyOf:
    - required: [html]
    - required: [url]
```

```yaml
# manifests/image-resize.yaml  (image-resize.ts:6-20)
# TWO independent constraints: (image_url|base64) AND (target_width|target_height).
# anyOf branches are conjunctions, so the cross-product expresses this exactly.
input_schema:
  type: object
  required: []
  properties:
    image_url: { type: string, description: "URL of the source image" }
    url: { type: string, description: "Alias for image_url" }
    base64: { type: string, description: "Base64-encoded source image" }
    target_width: { type: integer, description: "Target width in pixels" }
    width: { type: integer, description: "Alias for target_width" }
    target_height: { type: integer, description: "Target height in pixels" }
    height: { type: integer, description: "Alias for target_height" }
    format: { type: string }
    quality: { type: integer }
    fit: { type: string }
  anyOf:
    - required: [image_url, target_width]
    - required: [image_url, target_height]
    - required: [url, target_width]
    - required: [url, target_height]
    - required: [base64, target_width]
    - required: [base64, target_height]
```

### Company registries — identifier ⊕ name

```yaml
# manifests/danish-company-data.yaml  (danish-company-data.ts:119-124, firstString aliases)
# PRIORITY: executor fixed 2026-08-09, schema still blocks the name path.
input_schema:
  type: object
  required: []
  properties:
    cvr_number: { type: string, description: "Danish CVR number (8 digits)" }
    org_number: { type: string, description: "Alias for cvr_number" }
    company_number: { type: string, description: "Alias for cvr_number" }
    company_name: { type: string, description: "Danish company name" }
    name: { type: string, description: "Alias for company_name" }
  anyOf:
    - required: [cvr_number]
    - required: [org_number]
    - required: [company_number]
    - required: [company_name]
    - required: [name]
```

```yaml
# manifests/finnish-company-data.yaml  (finnish-company-data.ts:177-181)
input_schema:
  type: object
  required: []
  properties:
    business_id: { type: string, description: "Finnish business ID (e.g. 0112038-9)" }
    org_number: { type: string, description: "Alias for business_id" }
    company_name: { type: string, description: "Finnish company name" }
    name: { type: string, description: "Alias for company_name" }
  anyOf:
    - required: [business_id]
    - required: [org_number]
    - required: [company_name]
    - required: [name]
```

```yaml
# manifests/norwegian-company-data.yaml  (norwegian-company-data.ts:126-130)
input_schema:
  type: object
  required: []
  properties:
    org_number: { type: string, description: "Norwegian org number (9 digits)" }
    company_number: { type: string, description: "Alias for org_number" }
    company_name: { type: string, description: "Norwegian company name" }
    name: { type: string, description: "Alias for company_name" }
  anyOf:
    - required: [org_number]
    - required: [company_number]
    - required: [company_name]
    - required: [name]
```

```yaml
# manifests/belgian-company-data.yaml  (belgian-company-data.ts:138-146)
input_schema:
  type: object
  required: []
  properties:
    enterprise_number: { type: string, description: "KBO/BCE number (e.g. 0404.616.494)" }
    company_name: { type: string, description: "Belgian company name" }
  anyOf:
    - required: [enterprise_number]
    - required: [company_name]
```

```yaml
# manifests/estonian-company-data.yaml  (estonian-company-data.ts:252-254)
input_schema:
  type: object
  required: []
  properties:
    registry_code: { type: string, description: "Estonian registry code (8 digits)" }
    company_name: { type: string, description: "Estonian company name" }
  anyOf:
    - required: [registry_code]
    - required: [company_name]
```

```yaml
# manifests/irish-company-data.yaml  (irish-company-data.ts:116-123)
input_schema:
  type: object
  required: []
  properties:
    cro_number: { type: string, description: "Irish CRO number (5-6 digits)" }
    company_name: { type: string, description: "Irish company name" }
  anyOf:
    - required: [cro_number]
    - required: [company_name]
```

```yaml
# manifests/latvian-company-data.yaml  (latvian-company-data.ts:116-123)
input_schema:
  type: object
  required: []
  properties:
    reg_number: { type: string, description: "Latvian registration number (11 digits)" }
    company_name: { type: string, description: "Latvian company name" }
  anyOf:
    - required: [reg_number]
    - required: [company_name]
```

```yaml
# manifests/lithuanian-company-data.yaml  (lithuanian-company-data.ts:148-156)
input_schema:
  type: object
  required: []
  properties:
    company_code: { type: string, description: "Lithuanian company code (7-9 digits)" }
    ja_kodas: { type: string, description: "Alias for company_code" }
    company_name: { type: string, description: "Lithuanian company name" }
  anyOf:
    - required: [company_code]
    - required: [ja_kodas]
    - required: [company_name]
```

```yaml
# manifests/singapore-company-data.yaml  (singapore-company-data.ts:115-122)
input_schema:
  type: object
  required: []
  properties:
    uen: { type: string, description: "Singapore UEN (9-10 alphanumeric)" }
    company_name: { type: string, description: "Singapore entity name" }
  anyOf:
    - required: [uen]
    - required: [company_name]
```

```yaml
# manifests/slovenian-company-data.yaml  (slovenian-company-data.ts:124-132)
input_schema:
  type: object
  required: []
  properties:
    reg_number: { type: string, description: "Slovenian matična številka (7 or 10 digits)" }
    matricna_stevilka: { type: string, description: "Alias for reg_number" }
    company_name: { type: string, description: "Slovenian company name" }
  anyOf:
    - required: [reg_number]
    - required: [matricna_stevilka]
    - required: [company_name]
```

```yaml
# manifests/canadian-company-data.yaml  (canadian-company-data.ts:36-50)
input_schema:
  type: object
  required: []
  properties:
    corporation_number: { type: string, description: "Canadian federal corporation number" }
    company_name: { type: string, description: "Canadian company name" }
  anyOf:
    - required: [corporation_number]
    - required: [company_name]
```

```yaml
# manifests/japanese-company-data.yaml  (japanese-company-data.ts:37-50)
input_schema:
  type: object
  required: []
  properties:
    corporate_number: { type: string, description: "Japanese corporate number (13 digits)" }
    company_name: { type: string, description: "Japanese company name" }
  anyOf:
    - required: [corporate_number]
    - required: [company_name]
```

```yaml
# manifests/cz-company-data.yaml  (cz-company-data.ts:211-228)
input_schema:
  type: object
  required: []
  properties:
    ico: { type: string, description: "Czech IČO (8 digits, mod-11 checksum)" }
    company_number: { type: string, description: "Alias for ico" }
    company_name: { type: string, description: "Czech company name" }
  anyOf:
    - required: [ico]
    - required: [company_number]
    - required: [company_name]
```

```yaml
# manifests/croatian-company-data.yaml  (croatian-company-data.ts:144-153) — NO name path
input_schema:
  type: object
  required: []
  properties:
    oib: { type: string, description: "Croatian OIB (11 digits)" }
    mbs: { type: string, description: "Court registry number (MBS)" }
  anyOf:
    - required: [oib]
    - required: [mbs]
```

```yaml
# manifests/slovak-company-data.yaml  (slovak-company-data.ts:146-148) — NO name path
input_schema:
  type: object
  required: []
  properties:
    ico: { type: string, description: "Slovak IČO (8 digits)" }
    company_number: { type: string, description: "Alias for ico" }
  anyOf:
    - required: [ico]
    - required: [company_number]
```

```yaml
# manifests/swedish-company-data.yaml  (swedish-company-data.ts:229-236) — NO name path
input_schema:
  type: object
  required: []
  properties:
    org_number: { type: string, description: "Swedish organisationsnummer (10 digits)" }
    identitetsbeteckning: { type: string, description: "Alias for org_number" }
    company_number: { type: string, description: "Alias for org_number" }
  anyOf:
    - required: [org_number]
    - required: [identitetsbeteckning]
    - required: [company_number]
```

```yaml
# manifests/greek-company-data.yaml  (greek-company-data.ts:186-198)
input_schema:
  type: object
  required: []
  properties:
    gemi_number: { type: string, description: "Greek GEMI registry number" }
    org_number: { type: string, description: "Alias for gemi_number" }
    ar_gemi: { type: string, description: "Alias for gemi_number" }
    afm: { type: string, description: "Greek tax ID (9 digits)" }
    tax_id: { type: string, description: "Alias for afm" }
  anyOf:
    - required: [gemi_number]
    - required: [org_number]
    - required: [ar_gemi]
    - required: [afm]
    - required: [tax_id]
```

```yaml
# manifests/german-company-data.yaml  (german-company-data.ts:336-359)
# hrb_number is NOT usable alone — HRB/HRA numbers are not unique across courts.
input_schema:
  type: object
  required: []
  properties:
    company_id: { type: string, description: "Handelsregister company id" }
    hrb_number: { type: string, description: "HRB/HRA number — requires 'court'" }
    court: { type: string, description: "Registergericht, e.g. 'Amtsgericht Landsberg a. Lech'" }
    company_name: { type: string, description: "German company name" }
  anyOf:
    - required: [company_id]
    - required: [hrb_number, court]
    - required: [company_name]
```

```yaml
# manifests/uk-companies-house-officers.yaml  (uk-companies-house-officers.ts:18-19)
input_schema:
  type: object
  required: []
  properties:
    company_number: { type: string, description: "Companies House number" }
    company_name: { type: string, description: "UK company name" }
  anyOf:
    - required: [company_number]
    - required: [company_name]
```

```yaml
# manifests/uk-filing-events.yaml  (uk-filing-events.ts:45-56)
input_schema:
  type: object
  required: []
  properties:
    company_number: { type: string, description: "Companies House number (e.g. 00445790)" }
    company_name: { type: string, description: "UK company name (e.g. Rolls-Royce)" }
    max_events: { type: integer }
  anyOf:
    - required: [company_number]
    - required: [company_name]
```

```yaml
# manifests/beneficial-ownership-lookup.yaml  (beneficial-ownership-lookup.ts:29-34)
# Currently required:[company_name] blocks a company_number-only call the executor supports.
input_schema:
  type: object
  required: []
  properties:
    company_name: { type: string, description: "Company name" }
    name: { type: string, description: "Alias for company_name" }
    company_number: { type: string, description: "Registry company number" }
    jurisdiction: { type: string, description: "Defaults to 'gb'" }
  anyOf:
    - required: [company_name]
    - required: [name]
    - required: [company_number]
```

### Financial / entity identifiers

```yaml
# manifests/lei-lookup.yaml  (lei-lookup.ts:197-204)
input_schema:
  type: object
  required: []
  properties:
    lei: { type: string, description: "20-character LEI code" }
    company_name: { type: string, description: "Legal entity name" }
    jurisdiction: { type: string }
  anyOf:
    - required: [lei]
    - required: [company_name]
```

```yaml
# manifests/gleif-l2-ubo-lookup.yaml  (gleif-l2-ubo-lookup.ts:116-121)
input_schema:
  type: object
  required: []
  properties:
    lei: { type: string, description: "20-character LEI code" }
    company_name: { type: string, description: "Legal entity name" }
    jurisdiction: { type: string }
  anyOf:
    - required: [lei]
    - required: [company_name]
```

```yaml
# manifests/gleif-l2-children-lookup.yaml  (gleif-l2-children-lookup.ts:70-77)
input_schema:
  type: object
  required: []
  properties:
    lei: { type: string, description: "20-character LEI code" }
    company_name: { type: string, description: "Legal entity name" }
    jurisdiction: { type: string }
    level: { type: string, description: "'direct' (default) or 'ultimate'" }
    limit: { type: integer }
  anyOf:
    - required: [lei]
    - required: [company_name]
```

```yaml
# manifests/fr-bodacc-lookup.yaml  (fr-bodacc-lookup.ts:101-107)
input_schema:
  type: object
  required: []
  properties:
    siren: { type: string, description: "9-digit SIREN" }
    company_name: { type: string, description: "French company name" }
    since_date: { type: string, description: "ISO date YYYY-MM-DD" }
    limit: { type: integer }
  anyOf:
    - required: [siren]
    - required: [company_name]
```

```yaml
# manifests/no-bankruptcy-check.yaml  (no-bankruptcy-check.ts:32-36)
input_schema:
  type: object
  required: []
  properties:
    org_number: { type: string, description: "Norwegian org number (9 digits)" }
    company_name: { type: string, description: "Norwegian company name" }
  anyOf:
    - required: [org_number]
    - required: [company_name]
```

```yaml
# manifests/sec-filing-events.yaml  (sec-filing-events.ts:101-108)
input_schema:
  type: object
  required: []
  properties:
    company_name: { type: string }
    ticker: { type: string }
    cik: { type: string }
    max_events: { type: integer }
  anyOf:
    - required: [company_name]
    - required: [ticker]
    - required: [cik]
```

```yaml
# manifests/us-sec-filings-extended.yaml  (us-sec-filings-extended.ts:34-41)
input_schema:
  type: object
  required: []
  properties:
    cik: { type: string }
    company_name: { type: string }
    business_name: { type: string, description: "Alias for company_name" }
    form_type: { type: string }
    since_date: { type: string }
    limit: { type: integer }
  anyOf:
    - required: [cik]
    - required: [company_name]
    - required: [business_name]
```

```yaml
# manifests/us-ein-match.yaml  (us-ein-match.ts:40-46)
input_schema:
  type: object
  required: []
  properties:
    ein: { type: string, description: "US EIN, 9 digits (XX-XXXXXXX)" }
    business_name: { type: string }
    company_name: { type: string, description: "Alias for business_name" }
    state: { type: string }
    limit: { type: integer }
  anyOf:
    - required: [ein]
    - required: [business_name]
    - required: [company_name]
```

```yaml
# manifests/us-court-search.yaml  (us-court-search.ts:37-39)
input_schema:
  type: object
  required: []
  properties:
    query: { type: string }
    party_name: { type: string, description: "Alias for query" }
    company_name: { type: string, description: "Alias for query" }
    court_type: { type: string }
    since_date: { type: string }
    limit: { type: integer }
  anyOf:
    - required: [query]
    - required: [party_name]
    - required: [company_name]
```

```yaml
# manifests/us-company-data-cobalt.yaml  (us-company-data-cobalt.ts:38-46)
# BOTH rules apply: `state` is unconditionally required AND one of the two identifiers.
input_schema:
  type: object
  required: [state]
  properties:
    company_id: { type: string }
    business_id: { type: string, description: "Alias for company_id" }
    company_name: { type: string }
    business_name: { type: string, description: "Alias for company_name" }
    state: { type: string, description: "2-letter US state code, e.g. 'CA'" }
  anyOf:
    - required: [company_id]
    - required: [business_id]
    - required: [company_name]
    - required: [business_name]
```

### Dutch datasets

```yaml
# manifests/nl-energy-label.yaml  (nl-energy-label.ts:10-18)
input_schema:
  type: object
  required: []
  properties:
    postcode: { type: string, description: "Dutch postcode, e.g. 1234AB" }
    huisnummer: { type: string, description: "House number" }
    house_number: { type: string, description: "Alias for huisnummer" }
    huisletter: { type: string }
    toevoeging: { type: string }
    huisnummertoevoeging: { type: string, description: "Alias for toevoeging" }
    bag_id: { type: string, description: "BAG verblijfsobject ID" }
    pand_id: { type: string, description: "Alias for bag_id" }
  anyOf:
    - required: [postcode, huisnummer]
    - required: [postcode, house_number]
    - required: [bag_id]
    - required: [pand_id]
```

```yaml
# manifests/nl-housing-stats.yaml  (nl-housing-stats.ts:44-49)
input_schema:
  type: object
  required: []
  properties:
    city: { type: string, description: "Municipality name, e.g. 'Amsterdam'" }
    gemeente: { type: string, description: "Alias for city" }
    municipality: { type: string, description: "Alias for city" }
    gm_code: { type: string, description: "CBS municipality code, e.g. 'GM0363'" }
    municipality_code: { type: string, description: "Alias for gm_code" }
  anyOf:
    - required: [city]
    - required: [gemeente]
    - required: [municipality]
    - required: [gm_code]
    - required: [municipality_code]
```

```yaml
# manifests/nl-woz-value.yaml  (nl-woz-value.ts:44-49) — identical to nl-housing-stats
input_schema:
  type: object
  required: []
  properties:
    city: { type: string, description: "Municipality name, e.g. 'Amsterdam'" }
    gemeente: { type: string, description: "Alias for city" }
    municipality: { type: string, description: "Alias for city" }
    gm_code: { type: string, description: "CBS municipality code, e.g. 'GM0363'" }
    municipality_code: { type: string, description: "Alias for gm_code" }
  anyOf:
    - required: [city]
    - required: [gemeente]
    - required: [municipality]
    - required: [gm_code]
    - required: [municipality_code]
```

### Developer-tool / generation capabilities

```yaml
# manifests/api-docs-generate.yaml  (api-docs-generate.ts:5-9)
input_schema:
  type: object
  required: []
  properties:
    openapi_spec: { type: string, description: "OpenAPI spec as a JSON/YAML string" }
    endpoint_description: { type: string, description: "Natural-language endpoint description" }
  anyOf:
    - required: [openapi_spec]
    - required: [endpoint_description]
```

```yaml
# manifests/changelog-generate.yaml  (changelog-generate.ts:5-9)
input_schema:
  type: object
  required: []
  properties:
    commits: { type: array, description: "Array of {message, author?, date?}" }
    raw_log: { type: string, description: "Raw `git log` text" }
    git_log: { type: string, description: "Alias for raw_log" }
    format: { type: string, description: "Defaults to keep_a_changelog" }
  anyOf:
    - required: [commits]
    - required: [raw_log]
    - required: [git_log]
```

```yaml
# manifests/dependency-audit.yaml  (dependency-audit.ts:12-16)
input_schema:
  type: object
  required: []
  properties:
    package_json: { type: string, description: "Contents of package.json" }
    requirements_txt: { type: string, description: "Contents of requirements.txt" }
  anyOf:
    - required: [package_json]
    - required: [requirements_txt]
```

```yaml
# manifests/env-template-generate.yaml  (env-template-generate.ts:5-9)
input_schema:
  type: object
  required: []
  properties:
    code: { type: string, description: "Source code to scan for env vars" }
    project_description: { type: string, description: "Natural-language project description" }
  anyOf:
    - required: [code]
    - required: [project_description]
```

```yaml
# manifests/fake-data-generate.yaml  (fake-data-generate.ts:5-10)
input_schema:
  type: object
  required: []
  properties:
    schema: { type: object, description: "JSON Schema describing the records" }
    fields: { type: array, description: "Array of {name, type, constraints?}" }
    count: { type: integer, description: "1-1000, default 10" }
    locale: { type: string, description: "Default 'en'" }
  anyOf:
    - required: [schema]
    - required: [fields]
```

```yaml
# manifests/gitignore-generate.yaml  (gitignore-generate.ts:35-40)
input_schema:
  type: object
  required: []
  properties:
    languages: { type: array }
    frameworks: { type: array }
    ides: { type: array }
  anyOf:
    - required: [languages]
    - required: [frameworks]
    - required: [ides]
```

```yaml
# manifests/email-validate-bulk.yaml  (email-validate-bulk.ts:125-147, parseInput)
input_schema:
  type: object
  required: []
  properties:
    emails: { type: array, description: "Array of email address strings" }
    email_addresses: { type: array, description: "Alias for emails" }
    text: { type: string, description: "Newline- or comma-separated addresses" }
  anyOf:
    - required: [emails]
    - required: [email_addresses]
    - required: [text]
```

### Content / misc

```yaml
# manifests/company-industry-classify.yaml  (company-industry-classify.ts:5-9)
input_schema:
  type: object
  required: []
  properties:
    company_name: { type: string }
    name: { type: string, description: "Alias for company_name" }
    description: { type: string, description: "Business description" }
  anyOf:
    - required: [company_name]
    - required: [name]
    - required: [description]
```

```yaml
# manifests/social-post-generate.yaml  (social-post-generate.ts:6-8)
input_schema:
  type: object
  required: []
  properties:
    content: { type: string, description: "Content to turn into a post" }
    topic: { type: string, description: "Alias for content" }
    url: { type: string, description: "URL whose content is fetched and summarised" }
    platform: { type: string, description: "Default 'twitter'" }
    tone: { type: string, description: "Default 'professional'" }
    hashtag_count: { type: integer, description: "Max 10, default 3" }
  anyOf:
    - required: [content]
    - required: [topic]
    - required: [url]
```

```yaml
# manifests/job-posting-analyze.yaml  (job-posting-analyze.ts:6-9)
input_schema:
  type: object
  required: []
  properties:
    url: { type: string, description: "URL of the job posting" }
    text: { type: string, description: "Raw job posting text" }
  anyOf:
    - required: [url]
    - required: [text]
```

```yaml
# manifests/gdpr-fine-lookup.yaml  (gdpr-fine-lookup.ts:11-16)
input_schema:
  type: object
  required: []
  properties:
    company: { type: string, description: "Company name to search" }
    country_code: { type: string, description: "EU country code" }
  anyOf:
    - required: [company]
    - required: [country_code]
```

```yaml
# manifests/weather-lookup.yaml  (weather-lookup.ts:8-24)
input_schema:
  type: object
  required: []
  properties:
    city: { type: string, description: "Location name; geocoded via Open-Meteo" }
    location: { type: string, description: "Alias for city" }
    latitude: { type: number }
    lat: { type: number, description: "Alias for latitude" }
    longitude: { type: number }
    lon: { type: number, description: "Alias for longitude" }
    lng: { type: number, description: "Alias for longitude" }
  anyOf:
    - required: [city]
    - required: [location]
    - required: [latitude, longitude]
    - required: [lat, lon]
    - required: [lat, lng]
```

### Strict-required correction (not an anyOf)

```yaml
# manifests/company-news.yaml  (company-news.ts:19-27)
# Executor hard-requires company_name (min 2 chars). Currently required: [].
input_schema:
  type: object
  required: [company_name]
  properties:
    company_name: { type: string, description: "Company name to search in global news" }
    country: { type: string }
    timespan: { type: string }
    max_articles: { type: integer, description: "Max 25, default 10" }
```

```yaml
# manifests/charity-lookup-uk.yaml  (charity-lookup-uk.ts:8, 79-81)
# `name` is read but the name branch unconditionally throws — do NOT declare it as a branch.
input_schema:
  type: object
  required: [charity_number]
  properties:
    charity_number: { type: string, description: "Charity Commission registration number" }
```

---

## 4. Mismatch list — class (d), with per-slug guidance

### 4a. The ten "blocked registries" — can the executor actually resolve a `company_name`?

| slug | name path exists? | resolver | verdict |
|---|---|---|---|
| **au-company-data** | **No** | — | `abn` only (au-company-data.ts:152-156); requires 11-digit ABN. Schema is correct. **Do not open to company_name** — there is no name search. |
| **brazilian-company-data** | **No (fake)** | — | Reads `company_name` into `raw` (line 73) then demands a valid 14-digit CNPJ (line 82: "Name search is not supported by ReceitaWS"). Opening the schema would route every name call to a guaranteed error. **Keep `required: [cnpj]`.** Consider deleting the misleading alias read. |
| **polish-company-data** | **No (fake)** | — | Same shape (line 145 reads `company_name`, line 147/152 demands a 10-digit KRS). **Keep `required: [krs_number]`.** |
| **croatian-company-data** | **No** | — | Executor accepts `oib` \| `mbs` only — `company_name` is never read. The campaign's premise is wrong for HR. **Add `mbs`, emit oib\|mbs anyOf.** |
| **slovak-company-data** | **No** | — | `ico` \| `company_number` only. **Add `company_number`, emit anyOf.** No name search. |
| **swedish-company-data** | **No** | — | `org_number` \| `identitetsbeteckning` \| `company_number`; line 248 states plainly that name lookup is unsupported by Bolagsverket's HVD API. **Add the two aliases, emit anyOf.** |
| **canadian-company-data** | **Yes** | `extractCompanyName()` → `lookupCompany(name,false)` — Browserless render of the ISED search-results page + LLM extraction | **Open to company_name.** See ranking caveat below. |
| **japanese-company-data** | **Yes** | Same pattern against `houjin-bangou.nta.go.jp` search results | **Open to company_name.** See ranking caveat below. |
| **cz-company-data** | **Yes** | `resolveNameToIco()` → ARES `/vyhledat` with `pocet: 1`, returns `ekonomickeSubjekty[0].ico` | **Open to company_name**, but see ranking caveat — this is the weakest resolver of the four. |
| **slovenian-company-data** | **Yes** | `lookupByName()` → CKAN datastore `q=` search, returns `records[0]` | **Open to company_name.** CKAN does rank by relevance (comment at slovenian-company-data.ts:91-94), so lower risk than CZ. |

**Ranking caveat (applies to CA, JP, CZ, SI).** Per the standing project lesson that registry name
searches never rank by relevance, three of these four take the first hit with no scoring and no
refusal path: CZ asks ARES for exactly one record and returns it; SI returns `records[0]`; CA/JP
hand a scraped results page to an LLM. None implements the `classifyNameMatch` +
`allow_low_confidence` discipline that `us-company-data` (us-company-data.ts:229-234) already has —
which is the reference implementation. **Recommendation: open CA/JP/SI schemas now, and gate CZ
behind adding a match-confidence check first**, because ARES `pocet: 1` cannot even see whether a
second, better candidate existed. Opening all four without scoring risks trading a clean 400 for a
confidently-wrong company record, which is the worse failure for a KYB customer.

**Separate flag (not part of this campaign):** `canadian-company-data` and `japanese-company-data`
resolve names by driving Browserless against government web UIs (`ised-isde.canada.ca`,
`houjin-bangou.nta.go.jp`). That is the same pattern for which `australian-company-data` was
deactivated under DEC-20260428-A Tier 1. Worth a separate decision; it is out of scope for a
schema-only PR, but opening the name path *increases* traffic on exactly that route.

### 4b. Other mismatches

- **`swiss-company-data` — active capability, executor is a bare `throw`.** The entire handler
  (swiss-company-data.ts:12-18) throws "Zefix PublicREST API is the only compliant source… ensure
  ZEFIX_USERNAME and ZEFIX_PASSWORD are set". Manifest declares `uid` / `company_name` properties
  that no code reads. Every call fails. This belongs in the `DEACTIVATED` map (or needs the
  credentials wired), not in the anyOf campaign.
- **`job-posting-analyze` — checked and cleared.** An earlier extraction pass suggested `text` was
  declared but unread; that was the noise-filter false positive described in §1. The executor reads
  both `url` and `text` (lines 6-9) and guards on `if (!url && !text)`. Plain class (b), no defect.
- **`charity-lookup-uk` — unreachable branch.** `name` is accepted at line 8 but the name path
  throws unconditionally at line 79 ("Name search is not available via free APIs"). Declaring
  `anyOf: charity_number | name` would advertise a branch that always 500s. Declare
  `required: [charity_number]` instead.
- **`gdpr-fine-lookup` — error text advertises `task`.** Line 16 tells the caller that `task` is an
  acceptable input. On x402 there is no `task`. Fix the message alongside the anyOf.
- **`beneficial-ownership-lookup` — required blocks a supported path.** `required: [company_name]`
  rejects a `company_number`-only call the executor explicitly supports (line 34: "At least one of
  'company_name' or 'company_number'"). Same class as #168/#173.
- **`us-company-data-cobalt` — two independent constraints.** `state` is genuinely mandatory
  *and* one identifier is needed. Keep the flat `required: [state]` and add the anyOf; the
  validator applies rule 1 then rule 2, so both hold.
- **`german-company-data` — conditional pair.** `hrb_number` alone is insufficient (HRB/HRA numbers
  are not unique across courts, line 348). The `[hrb_number, court]` branch encodes this correctly;
  a naive `hrb_number`-alone branch would be wrong.

---

## 5. Caveats for the implementing PR

1. **Deploy mechanism (DEC-20260504-C).** Manifest YAML is authoring-time only. Ship each slug with
   `npx tsx apps/api/scripts/sync-manifest-canonical-to-db.ts <slug> --dry-run` first (it prints a
   drift summary), then without `--dry-run`. Note it syncs *all* manifest-canonical fields, not just
   `input_schema` — review the drift summary per slug so an unrelated stale description doesn't ride
   along. Post-deploy, verify by reading back `capabilities.input_schema` for a sample slug, not by
   trusting a clean log.
2. **Empty arrays satisfy the validator.** `fieldPresent` treats only `undefined`/`null`/`""` as
   blank, so `{"languages": []}` passes the `gitignore-generate` branch and `{"emails": []}` passes
   `email-validate-bulk`. The executors handle this (they throw their own error), but the validator
   will not catch it. Acceptable; worth a comment in the PR body.
3. **Nothing else in the codebase reads `anyOf`.** A grep across `src/lib/*.ts` and
   `scripts/validate-capability.ts` finds `anyOf`/`oneOf` only in `x402-input-validation.ts`.
   Gates that iterate `input_schema.properties` (`gate5-path-coverage.ts`,
   `test-input-generator.ts`, `fixture-quality.ts`) are unaffected **provided every branch field is
   also present in `properties`** — which every block above does. Do not emit a branch naming a
   field that is not a declared property.
4. **The auto-generated `negative-empty` test improves, not breaks.** `onboard.ts` generates a
   `${slug}-negative-empty` suite with input `{}` that expects failure. Post-change, `{}` fails at
   validation instead of in the executor — still a failure, so the suite stays green, and it now
   costs no external API call.
5. **Three manifests already carry `anyOf`** (`tech-stack-detect`, `image-to-text`,
   `us-company-data`). Confirm their DB rows actually contain it before assuming the campaign's
   pattern is live in production — a manifest carrying `anyOf` proves only that the YAML has it.
   `image-to-text` additionally reads `url` as an alias for `image_url` (image-to-text.ts:17) but
   declares neither `url` as a property nor a `url` branch — a small pre-existing gap worth
   folding into the same PR.

---

## Appendix — artifacts

Analysis scripts (scratchpad, disposable): `extract2.mjs` (manifest × executor field extraction,
handles `firstString` variadics), `report2.mjs` (undeclared-alias cross-reference), `slice.mjs`
(handler input-guard slices), `orscan.mjs` (OR-contract error-text sweep). Data: `out2.json`.
