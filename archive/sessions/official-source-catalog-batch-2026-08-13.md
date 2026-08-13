# Official-source catalog batch — research + build (2026-08-13)

**Session intent:** Grow the catalog with meaningful KYB/commerce-adjacent capabilities sourced from
official, free, API-first data — insolvency registers, product safety recalls, trademark/patent
offices, procurement portals, economic indicators — per DEC-20260813-A's preference order
(official API > licensed bulk > Tier-2 vendor > per-call parsing).

**Branch:** `catalog/official-source-batch` (from `origin/main`)

**Mode:** Full (multi-capability build, several access-model decisions)

---

## Built (5 capabilities — dark-launched, not yet onboarded)

All five are direct, per-request calls to official government/international-body APIs. No
scraping, no vendor wrappers, no ToS gray areas — every one of these is a documented REST/JSON
endpoint that requires no signup (or reuses a credential the platform already has). Each was
verified live via curl during research (see command history / real response snippets embedded as
`output_schema.example` in the manifests) before the executor was written.

| Slug | Source | Auth | Verified with |
|---|---|---|---|
| `uk-gazette-notice-search` | The Gazette (UK, Crown Copyright / OGL) | none | Real search: "Carillion", 129 matches in a 2018 date range |
| `french-insolvency-check` | BODACC (DILA, French government, Opendatasoft) | none | Real SIREN 345086177 (Camaieu International) — 8 "Procédures collectives" notices |
| `us-product-recall-search` | CPSC Recalls API (saferproducts.gov) | none | Real query "hoverboard" — Hover-1 Helix recall; "IKEA" manufacturer — MALM dresser recall |
| `uk-disqualified-director-check` | UK Companies House Disqualified Officers register | `COMPANIES_HOUSE_API_KEY` (already provisioned — same key as insolvency-check/officer-search/uk-company-data) | Endpoint + full JSON schema confirmed against official developer-specs docs; **not live-tested** (no CH key in this worktree's local `.env` — see note below) |
| `country-economic-indicators` | World Bank Indicators (WDI) API | none | Real country SE — GDP $668.9B (2025), inflation query for TR — 34.9% (2025) |

Files per capability:
- `apps/api/src/capabilities/{slug}.ts`
- `manifests/{slug}.yaml`

All five passed `npx tsx scripts/onboard.ts --manifest manifests/{slug}.yaml --dry-run` (manifest
validation, 5/5 test suites generated, dark-launch record preview `visible: false`) and
`cd apps/api && npx tsc --noEmit --project tsconfig.json` (clean, zero errors) in this worktree.

### Why these five and not more

Quality-over-count per the task brief. Several other candidates from the brief's list were
researched and are either genuinely not buildable right now (see Rejected/Deferred below) or
would have overlapped with existing capabilities enough that adding them would be padding, not
value (see the World Bank vs. `country-trade-data.ts` note, and the UK Gazette vs.
`insolvency-check.ts` note, both addressed in-file as capability doc-comments and manifest
limitations).

### uk-disqualified-director-check — not live-verified, flagging explicitly

This worktree's `.env` (copied read-only from the main tree for `--dry-run` structural checks,
then deleted) does not contain `COMPANIES_HOUSE_API_KEY` locally — it's a Railway-only secret in
this environment. The executor and manifest were built directly against the official Companies
House Public Data API OpenAPI spec (`developer-specs.company-information.service.gov.uk`),
cross-checked field-by-field for both the search response (`DisqualifiedOfficerSearch`) and the
detail response (`naturalDisqualification`) schemas. This is the same class of capability as the
existing `insolvency-check.ts` / `officer-search.ts` (both also CH-keyed, both also can't be
smoke-tested in a key-less local environment) — same precedent, same risk profile.

**Action for the merge session:** run `--discover --strict` (it has the real key) to
live-verify the known_answer fixture (`name: Smith`) and confirm the field names match reality
before flipping this one visible.

### Design note: uk-disqualified-director-check never auto-picks a match

Disqualified-officer name search can collide on common names. Per the
`feedback_registry_name_search_never_ranks.md` lesson (taking `result[0]` on a registry name
search has produced wrong-entity answers before — Fysios for "Nokia", NITO TELENOR for
"Telenor"), and because misattributing a disqualification finding to the wrong named individual
is a more serious error class than a wrong company match, this capability deliberately returns a
**candidate list** (name, DOB, address snippet) on a name search and requires a second call with
an explicit `officer_id` to fetch the full disqualification detail. No auto-selected "best match."

### Onboarding commands for the merge session

The merge session has the real `.env` (Railway secrets) via the main tree. Recommended order
(discover first to verify field names against live output, backfill only if something's off):

```
cd apps/api
npx tsx scripts/onboard.ts --manifest ../../manifests/uk-gazette-notice-search.yaml --discover --strict
npx tsx scripts/onboard.ts --manifest ../../manifests/french-insolvency-check.yaml --discover --strict
npx tsx scripts/onboard.ts --manifest ../../manifests/us-product-recall-search.yaml --discover --strict
npx tsx scripts/onboard.ts --manifest ../../manifests/uk-disqualified-director-check.yaml --discover --strict
npx tsx scripts/onboard.ts --manifest ../../manifests/country-economic-indicators.yaml --discover --strict
```

Each inserts with `lifecycle_state=validating, visible=false` (dark launch per DEC-20260812-A —
`onboard.ts` defaults new capabilities to invisible; `x402_enabled` also defaults to `false` in
the schema). Verify with:

```
npx tsx scripts/smoke-test.ts --slug uk-gazette-notice-search
npx tsx scripts/smoke-test.ts --slug french-insolvency-check
npx tsx scripts/smoke-test.ts --slug us-product-recall-search
npx tsx scripts/smoke-test.ts --slug uk-disqualified-director-check
npx tsx scripts/smoke-test.ts --slug country-economic-indicators
```

None of these were made visible or x402-enabled by this session — that stays a human call per
the readiness-program escalation contract (DEC-20260812-A: humans decide "promote to visible",
platform/onboarding can dark-launch).

---

## Key-blocked — spec written, registration deliberately NOT performed

Per the task brief: "if a key is required, write the spec, do NOT register — key registration is
founder-gated." Both of the following have a genuine, documented, free-to-register official API,
but registration itself is the founder-gated step, so no credentials were requested and nothing
was built beyond this spec.

### EPO Open Patent Services (OPS) — patent search

- **Official API:** `ops.epo.org` — REST/XML (also offers JSON via `Accept` header), OAuth2
  client-credentials flow.
- **Registration:** free developer account at `https://developers.epo.org`, create an app to get
  a Consumer Key/Secret. Rate-limited (throttled per minute/hour on the free tier; higher tiers
  require a paid contract).
- **Why it matters for the catalog:** the existing `patent-search` capability is DEACTIVATED
  (`auto-register.ts`: "Google Patents scraping prohibited by Google ToS") — OPS is the correct
  official replacement and would directly un-block that gap.
- **Proposed shape** (not built): `patent-search` (slug reactivation or `epo-patent-search` new
  slug) — input `query` (title/abstract keyword) or `publication_number`; output: publication
  number, title, applicants, inventors, IPC/CPC classification codes, publication date, family
  members. OPS's "published-data search" endpoint (`/rest-services/published-data/search`)
  returns CQL-query-filtered result sets; a details fetch by publication number gives bibliographic
  data. Would need `EPO_OPS_CONSUMER_KEY` / `EPO_OPS_CONSUMER_SECRET` env vars and an
  OAuth2 token-caching helper (tokens expire in ~20 min) — no other capability in this repo has
  an OAuth2 client-credentials pattern yet, would be a new shared helper
  (`capabilities/lib/epo-ops-auth.ts`).
- **Action needed:** Petter registers at developers.epo.org, adds the two env vars to Railway,
  then a follow-up session builds the executor against this spec.

### EUIPO trademark search (eSearch Plus / TMview)

- **Official API:** `dev.euipo.europa.eu` — EUIPO eSearch Plus REST API. Free registration
  ("register... in under 2 minutes"), OAuth2 Client ID/Secret, subscribe to the "Trademark
  Search API" product in the developer portal.
- **Why it matters:** direct EU trademark register lookup (brand/IP due-diligence signal
  adjacent to KYB — "does this counterparty actually own the mark they're claiming") with no
  existing capability covering it.
- **Proposed shape** (not built): `eu-trademark-search` — input `mark_text` and/or
  `applicant_name`, optional `nice_class`; output: application/registration number, mark text,
  status (registered/pending/opposed/expired), owner name, filing date, Nice classification
  classes, EUIPO record URL.
- **Action needed:** Petter registers at dev.euipo.europa.eu, adds `EUIPO_CLIENT_ID` /
  `EUIPO_CLIENT_SECRET` to Railway, then a follow-up session builds against the published
  eSearch Plus OpenAPI spec.

---

## Rejected / deferred with reason

### EU Safety Gate (RAPEX) — product safety alerts
**Rejected for this batch.** No documented, stable public JSON REST search API was found within
research budget. The public portal (`ec.europa.eu/safety-gate-alerts`, `webgate.ec.europa.eu/
Safety-Gate`) is an Angular SPA; its backend calls were not discoverable as a documented,
versioned API (unlike CPSC's clearly-documented `saferproducts.gov` REST service). The
Commission does publish the underlying data as downloadable Excel files
(`data.europa.eu/data/datasets/rapex-rapid-alert-system-non-food`) — that's a licensed-bulk
ingestion job (download + periodic reload), not a per-call capability, and is a reasonable
future addition if someone builds the ingest pipeline. Third-party wrappers exist (Apify actors,
OpenDataSoft mirrors) but those are Tier-2/Tier-3 re-publishers, not the official source, and
weren't in scope.

### UK Contracts Finder — national procurement portal
**Deferred, not built.** The OCDS bulk endpoints
(`contractsfinder.service.gov.uk/Published/Notices/OCDS/Search`,
`/Published/OCDS/Record/{ocid}`) are genuinely free, no-key, and were verified live (200 OK,
valid OCDS JSON, Crown Copyright / OGL). However, extensive testing found **no working
keyword/company/CPV filter** on the documented public GET surface — `keyword=`, `searchTerm=`,
and `q=` params are silently ignored (verified: identical single result regardless of the
keyword value), and the only real full-text search endpoints referenced in the docs
(`api/rest/2/search_notices`, `Searches/Search`) either require OAuth2 registration or 404'd on
every path tried. A capability that can only browse-by-date-and-stage, with no way to look up a
specific company or keyword, doesn't fit the platform's per-request lookup pattern well enough
to justify shipping as-is. `ted-procurement.ts` already covers EU-wide above-threshold tenders;
UK-specific search would need either (a) reverse-engineering the undocumented search backend
(against the spirit of "official API" preference), or (b) registering for OAuth2 client
credentials (a founder-gated step, and unclear if the free tier even includes full-text search).
Revisit if a documented keyword-search endpoint surfaces, or if Petter wants to register for the
OAuth2 tier.

### EU e-Justice interconnected insolvency registers (BRIS insolvency interconnection)
**Rejected as a distinct capability.** The Business Registers Interconnection System (BRIS) and
its insolvency-register counterpart are a **portal**, not a consolidated public data API — the
e-Justice Portal is the single point of *human* access, routing queries to each member state's
own register/format under the hood. There is no documented single endpoint to query
programmatically across countries. The correct direction (and what this session did instead) is
building the strong national sources directly: UK (`uk-gazette-notice-search`, this batch) and
France (`french-insolvency-check`, this batch) are both now covered. Germany
(`Insolvenzbekanntmachungen.de`), the next most valuable gap, has no public API either — it's a
web portal that would require per-call HTML parsing; that's a DEC-20260813-A-eligible path (per-
entity, ToS-permitting) but needs its own ToS verification pass and wasn't attempted in this
session's budget.

### EU State aid transparency database (TAM)
**Rejected.** Public search UI at `webgate.ec.europa.eu/competition/transparency/public` — no
documented REST API found; a few plausible guessed endpoints (`.../search/api/aid`) 404'd.
Same class of problem as Safety Gate (Angular SPA, undocumented backend). Not pursued further
given the research budget.

### WIPO Global Brand Database
**Rejected.** No public, documented REST API for programmatic per-call search was found — WIPO
publishes a web search UI and bulk/linked-data resources for specific IP offices, not a general
free-to-call brand-search endpoint. If EU trademark coverage is wanted, EUIPO (above, key-
blocked) is the stronger candidate; WIPO would need its own separate research pass if revisited.

### Eurostat SDMX / JSON-stat API
**Verified working, deliberately not built as a separate capability.** Confirmed live and
completely free/no-key (`ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}`
— tested against `demo_pjan` population data for Sweden, clean JSON-stat response). Not shipped
because it would functionally duplicate `country-economic-indicators` (this batch) — both are
"macro country-level indicator" lookups, and Eurostat's genuinely distinct value (NUTS-region
granularity, EU-specific series like VAT gap or business demography) wasn't pinned down as a
concrete, distinct KYB use case within this session's budget. Worth a dedicated look later if a
specific EU-regional-granularity need shows up.

---

## Cross-references / duplication checks performed

- `uk-gazette-notice-search` vs. existing `insolvency-check.ts`: not a duplicate.
  `insolvency-check.ts` answers "does company X (by CH company number) have open insolvency
  cases?" via Companies House's structured case API. The Gazette capability searches the
  underlying statutory notice text directly, covers **personal** bankruptcy (individuals, not
  just companies — relevant for beneficial-owner/director screening), and doesn't require
  already knowing a company number. Cross-referenced in both files' doc-comments and the
  manifest's `limitations`.
- `country-economic-indicators` vs. existing `country-trade-data.ts`: both call
  `api.worldbank.org`, but for disjoint indicator sets — `country-trade-data.ts` covers detailed
  export/import commodity and partner breakdowns (with an embedded-data fallback), this
  capability covers GDP/inflation/unemployment/population macro indicators. Documented in the
  new file's doc-comment.
- `uk-disqualified-director-check` vs. existing `officer-search.ts`: not a duplicate — checked
  the codebase for any existing "disqualified" coverage (none found). `officer-search.ts` finds
  *current/former* officers; this finds officers under a *disqualification order*, a distinct
  and more serious signal.
- Searched for existing World Bank / BODACC / Gazette / CPSC / Companies-House-disqualified
  usage across `apps/api/src/capabilities` and `manifests/` before writing any code.

---

## Verification performed

- `cd apps/api && npx tsc --noEmit --project tsconfig.json` — clean, zero errors, for all 5
  new executors plus the full existing tree.
- `npx tsx scripts/onboard.ts --manifest manifests/{slug}.yaml --dry-run` — 5/5 manifests pass
  structural validation, generate all 5 required test-suite types, preview `visible: false`
  dark-launch insert. (Live `--discover` execution was deliberately not run against prod — see
  "Onboarding commands for the merge session" above.)
- Every external endpoint used by the 4 no-key capabilities was hit live with `curl` during
  research against real entities (see table above) before the executor was written — not just
  read about in docs.
- Grepped the codebase for prior coverage of every data source before building (see
  "Cross-references" above) — no duplicate capability slugs or overlapping executors were
  created.

## Distribution PR Integrity Protocol / Capability Onboarding Protocol applicability

- **Distribution PR Integrity Protocol (DEC-20260422-A):** not triggered — no PR opened against
  a non-`strale-io` repo, no `packages/*-strale/` package touched.
- **Capability Onboarding Protocol (DEC-20260320-B):** followed for all 5 built capabilities —
  manifest created with slug/name/description/category/schemas/pricing/data_source/
  transparency_tag/test_fixtures/output_field_reliability/limitations (≥1 each), structural
  validation run via `onboard.ts --dry-run` (readiness/DB-insert-level checks require the real
  DB and are deferred to the merge session per the task brief's explicit guidance). No
  `avg_latency_ms` field exists in the current manifest schema in this repo (checked
  `ted-procurement.yaml` and `lei-lookup.yaml` as references — neither carries one), so none was
  added; this appears to be a field the CLAUDE.md template mentions but the current manifest
  loader/schema doesn't require (`onboard.ts --dry-run` passed clean without it for all 5).
