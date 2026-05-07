# ES registry build-path verification memo
*Date: 2026-05-07. Spike branch: research/midrebuild-verify-spikes.*

## Chosen path on record
Tier-1 self-build via three sources: `opendata.registradores.org` + BORME + `sede.registradores.org`.

## Source of record
DEC-20260427-I-4 reactivation trigger reads "licensed contract with the Spanish Registro Mercantil (via Colegio de Registradores) or a multi-country licensed aggregator." Memory line + prompt text identify the three-source self-build as the chosen mid-rebuild target.

## Verification probe
- Fetched `opendata.registradores.org` (twice — both / and /en/) — access **rejected with support ID** (bot detection / IP block from probe egress). Cannot evaluate the OpenData portal directly.
- Fetched `boe.es/diario_borme/` (BORME landing) and `boe.es/datosabiertos/api/api.php` (BOE Datos Abiertos API doc).
- Fetched `sede.registradores.org/site/mercantil?lang=en_EN` (paid web portal).
- Fetched Openapi `openapi.com/products/company-start-spain` for the licensed-aggregator alternative.
- Web-searched `opendata.registradores.org` for third-party documentation of what the portal actually publishes.

## Probe results

### Technical viability
- **opendata.registradores.org:** rejected access from probe egress. Per third-party documentation (Kyckr, OpenCorporates, Apify), the portal publishes **statistical datasets and microdata as downloadable Excel/spreadsheet exports**, not a per-entity REST API. Coverage advertised includes "company name, form, NIF/IRUS/EUID, CNAE/NACE, directors and officers, registered office." Bulk-only.
- **BORME via BOE Datos Abiertos:** real REST API at `GET /datosabiertos/api/borme/sumario/{fecha}`, structured JSON/XML, **but daily-issue-only** — no per-CIF search. To answer a per-company query you'd need to **ingest every daily BORME issue into Postgres**, build a CIF/CNAE index, and query against the local mirror.
- **sede.registradores.org:** manual web-portal only. No API. Requires per-request authentication via Spanish digital certificate. Per-document pricing: company excerpt €2.10, certificate of incumbency €1.50, risk report €15. **Not automatable; doctrinally Strale could not scrape this even if it wanted to (DEC-20260428-A Tier 1).**
- **Openapi Spain (licensed-aggregator alternative):** REST, JSON, **self-serve PAYG** at €0.055 + VAT/call (annual sub) or €0.06 (single). Two tiers: Start + Advanced. Optional 30-day change-monitor callback.

### ToS / licensing posture
- **opendata.registradores.org:** Article 17.5 Commercial Code (Law 11/2023) basis; Colegio de Registradores publishes the data under Spanish open-data law. License terms not retrievable due to access block but are presumptively reuse-permissive (this is the public-records analogue to NL Open Data and BE KBO).
- **BORME via BOE:** "la reutilización de la información supone la aceptación de las condiciones de reutilización" (BOE general reuse terms link out from the API page). Permissive for reuse with attribution per Spain's Reuse-of-Public-Sector-Information regime.
- **sede.registradores.org:** paid per-document, no automated-access permission. ToS-prohibitive for any Strale automation.
- **Openapi Spain:** as in IT memo — full ToS PDF-gated; resale/sub-aggregation policy not in HTML. Same case-151296-class question applies (does Strale's resale-to-international-customers usage fit Openapi's redistribution scope).

### Pricing structure
- **opendata.registradores.org:** free (open-data portal).
- **BORME via BOE:** free.
- **sede.registradores.org:** €1.50–€15 per document, manual.
- **Openapi Spain Start:** €0.055 + VAT/call (annual subscription, 5000 calls/mo) or €0.06 (single prepaid).
- **Openapi Spain Advanced:** higher tier; pricing on console signup page.

### Coverage scope
- **opendata.registradores.org bulk:** advertised as including directors and officers per third-party docs — but unverified due to access block. Update cadence unknown. Likely lags real-time by weeks-to-months (typical for bulk open-data feeds).
- **BORME:** **delta-feed only** — publishes registry events (constitutions, director changes, capital changes, dissolutions) by daily issue. To produce a per-company snapshot, you'd need to replay all historical BORME issues since the company's founding and apply the deltas. Massive ingest project.
- **Openapi Spain Start:** company name, VAT/NIF, LEI, status (Active/Ceased), registered office, GPS, registration date. **No directors, no financials.**
- **Openapi Spain Advanced:** adds revenue, employee count, contact details (websites/phone). **Still no directors.**
- **None of the four paths cleanly delivers KYB Essentials shape (name + status + address + directors + UBO) at solo-founder scale.** Directors require either the bulk OpenData feed (probably the cheapest path if accessible) or sede.registradores per-document at €1.50/cert (not automatable, not at scale).

## Gotchas surfaced
1. **opendata.registradores.org is access-blocked from this probe egress.** Could be (a) Cloudflare-style bot detection that fails on automated user-agents, (b) IP geolocation block (probe egress is US — common for Spanish-government open-data portals to limit foreign IPs), or (c) intermittent. The build session must reach the portal from an EU egress (Railway is US East, so Railway production probably hits the same block). This needs an EU-egress proxy or licensed-aggregator alternative.
2. **The "three-source self-build" stack-of-cards is structurally fragile.** Each source is necessary but not sufficient: OpenData is bulk + lagged, BORME is delta-only, sede.registradores is manual + paid. Stitching them into a per-CIF real-time response would be a 4-6-week ingest project plus ongoing operational cost (BORME daily ingest forever).
3. **No Spanish path delivers UBO at solo-founder scale.** Same Subject-Person regime as IT/NL — Spanish UBO is in the Registro de Titularidades Reales, restricted under Spain's Wwft transposition (Law 10/2010). Out of v1 scope across the board.
4. **sede.registradores.org per-document pricing is the only direct registry-grade source for directors at low cost (€1.50/cert),** but it's manual-portal + digital-certificate-authenticated. Not viable.
5. **Openapi's reseller policy is the same case-151296-class question** as in IT — public docs don't disclose resale scope. The build session must confirm resale rights before code work, OR the build defers to a multi-country aggregator decision.
6. **The chosen Tier-1 self-build path was probably scoped before recognising that opendata.registradores.org is bulk-only.** "Self-build" implies a real-time per-entity API, but the OpenData portal doesn't offer one. The Tier-1 framing here was optimistic; the reality is "ingest bulk + replay BORME deltas + accept directors-via-document-purchase" — substantially more work than ES warrants for v1.

## Backup paths
- **Plan A (recommended for v1):** Openapi Spain Start (€0.055/call PAYG, self-serve), pending resale confirmation. Coverage limited to name + VAT + LEI + status + address + GPS. Document `directors: null`, `ubo: not_provided`, `financials: not_provided` as explicit limitations. Mirror the IT memo's licensed-aggregator framing.
- **Plan A+ (if Spanish-buyer demand justifies):** Openapi Spain Advanced for premium queries (revenue + employee count + contacts).
- **Plan B (if Openapi resale blocked):** Multi-country licensed aggregator (Creditsafe, Bisnode/D&B, Experian, Kyckr) — bundled IT/NL/ES/PT decision.
- **Plan C (deferred — was the chosen path):** Tier-1 self-build via BORME ingest + opendata.registradores.org bulk. Real but expensive (4-6 weeks dev + ongoing ingest infra). Defer until ES-specific revenue justifies the build, or until the bulk portal becomes accessible from Strale's egress.
- **Plan D (deferred):** sede.registradores.org licensed-bulk if Colegio de Registradores publishes a self-serve API in 2026 (none currently).

## Recommendation
**Replace primary — chosen path is more ambitious than ES warrants for v1.**

The "Tier-1 self-build" path was correctly identified as doctrinally cleanest, but the reality of opendata.registradores.org being access-blocked + bulk-only + lagged, BORME being delta-feed-only, and sede.registradores being manual makes the self-build a 4-6-week project for a country that may not produce v1 traffic to justify it.

For v1: ship `spanish-company-data` against Openapi Spain Start (€0.055/call), self-serve PAYG, mirror the IT memo's licensed-aggregator pattern. Document the coverage gaps (no directors, no UBO, no financials) as explicit limitations. Defer the Tier-1 self-build to v2 when Spanish-customer revenue actually justifies the ingest infrastructure.

This is a strict downgrade in doctrinal cleanliness (Tier 2 not Tier 1) but a pragmatic upgrade in time-to-ship and operational simplicity. The DEC-20260428-A Tier 2 disclosure (`acquisition_method: licensed_aggregator`, `upstream_vendor: Openapi.com`) is honest provenance and is the same posture the build session should take for IT.

## Open questions for build session
1. **Confirm Openapi resale addendum applies to Spain** — same case-151296-class question. *Critical — gates the build.*
2. **Verify opendata.registradores.org access from EU egress** (e.g., Railway EU region, or a Spanish proxy). If accessible, the bulk path becomes a v2 candidate. *Important, deferrable.*
3. **Decide whether Spanish-buyer demand justifies Advanced tier on launch** or whether Start covers v1. *Build-session decision.*
4. **VAT-derivation helper survives the rebuild** — `deriveVatES` from `lib/vat-derivation.js`. *Build-session check, low risk.*
5. **Should `spanish-company-data` mirror `dutch-company-data`'s pattern of layering an extended-coverage tier later?** Mirror IT memo's plan for v2. *Future scope.*
6. **Where would Strale source Spanish UBO if a customer requires it?** No path identified at solo-founder scale; this is a structural gap across IT/ES/PT/NL. Worth a separate brainstorm. *Strategic, not v1.*

## Budget consumption
**6 fetches** (5 WebFetch including 2 access-blocked attempts on opendata.registradores.org; 1 WebSearch).
