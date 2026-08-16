# PT registry build-path verification memo
*Date: 2026-05-07. Spike branch: research/midrebuild-verify-spikes.*

## Chosen path on record
`publicacoes.mj.pt` parser + Certidão Permanente — two-source replacement for the deactivated northdata.com scraper (DEC-20260427-I-2).

## Source of record
DEC-20260427-I-2 reactivation trigger reads "licensed contract with the Portuguese Registo Comercial (via IRN/Justiça Portuguesa) or a multi-country licensed aggregator." Memory line + prompt text identify the two-source self-build as the chosen mid-rebuild target.

## Verification probe
- Fetched `publicacoes.mj.pt/` (Ministry of Justice corporate-acts publication portal).
- Fetched `eportugal.gov.pt/.../certidao-permanente` (twice — both redirected: first to `gov.pt`, then to `www2.gov.pt`). Did not chase the second redirect within budget — confirmed the canonical Certidão Permanente product is at `www2.gov.pt/en/cidadaos/empresas-online/certidao-permanente`.
- Fetched the Topograph guide (`topograph.co/guides/data-and-document-in-portugal`) for cross-source pricing/coverage comparison.
- Fetched Openapi `openapi.com/products/company-advanced-portugal` for the licensed-aggregator alternative.
- Web-searched `publicacoes.mj.pt API JSON` and `Openapi.com Portugal pricing` for third-party confirmation.

## Probe results

### Technical viability
- **publicacoes.mj.pt:** ASP.NET web search portal at `/Pesquisa.aspx` (the search form). NIPC-searchable, free public access. **Returns notices/atos societários, not a current company snapshot.** Per the Topograph guide: "the portal does not present an up-to-date company extract — to find out the basic information about a company, its directors and shareholders, you'll need to retrieve all the notes on the company in question, analyze them in their entirety and then reconstruct the up-to-date version of the company." This is the same delta-feed problem as ES BORME.
- **Certidão Permanente:** subscription product purchased per-company (well-documented at €25 for the certified Portuguese-language extract; €20 for status-only document). Subscription model — pay once, valid 1-3 years, includes online access + change notification. **Web-portal-mediated; no public API surfaced in research.** The product is designed for human consumption (a renewable digital certificate), not programmatic per-call lookup.
- **RCBE (UBO register):** restricted to Portuguese nationals + authenticated professionals. Strale would not qualify. Same Subject-Person-restricted pattern as IT/ES/NL.
- **Openapi Portugal (licensed-aggregator alternative):** REST, JSON, **self-serve PAYG** at €0.055 + VAT/call. Two tiers: Start + Advanced. Mirror of ES product line.

### ToS / licensing posture
- **publicacoes.mj.pt:** government public portal, free public access. ToS for automated scraping not surfaced; per DEC-20260428-A Tier 1 doctrine, **Strale cannot self-operate a scraper** even against a permissive government source. Building a parser of `Pesquisa.aspx` HTML is a Tier-1 doctrine violation. The "publicacoes.mj.pt parser" framing in the chosen path is incompatible with current Strale doctrine.
- **Certidão Permanente:** licensed registry product. Per-document terms apply at purchase. No automated-API ToS to evaluate.
- **Openapi Portugal:** as in IT/ES — full ToS PDF-gated. Same case-151296-class resale question.

### Pricing structure
- **publicacoes.mj.pt:** free.
- **Certidão Permanente:** €25/certificate (1 yr) or €30/certificate (3 yr); manual purchase per company. Not viable for general-purpose API caps at €0.05–€0.10/call.
- **Openapi Portugal Start/Advanced:** ~€0.055 + VAT/call, self-serve PAYG.

### Coverage scope
- **publicacoes.mj.pt:** event log — constitutions, director changes, dissolutions, capital changes — searchable by NIPC. Reconstructing current state requires replaying all events.
- **Certidão Permanente:** registry-grade certified extract — name, NIPC, capital, directors, branches, registered office, history. Authoritative coverage.
- **Openapi Portugal Advanced:** 40+ data points — name, VAT/tax ID, LEI, activity status, registered office, GPS, contacts (website/phone/fax), registration date, NACE/NAICS/SIC, balance-sheet data with history (net worth, employees, operating revenue, total assets). **NO directors mentioned. NO shareholders mentioned.** Same coverage gap as ES.
- **None of the three paths cleanly delivers KYB Essentials shape (name + status + address + directors + UBO) at solo-founder scale.**

## Gotchas surfaced
1. **The chosen "publicacoes.mj.pt parser" path is a Tier-1 doctrine violation.** DEC-20260428-A says "Strale itself never operates scrapers." The chosen path was scoped before the parser-vs-scraper distinction had been examined under the current doctrine. A government-source HTML parser IS a scraper under DEC-20260428-A Tier 1 absolute. The build session must NOT pursue this path.
2. **Certidão Permanente economics don't fit a per-call API.** €25/cert is 250-500× the Strale per-call price target. Useful only as a premium per-query upgrade ("buy a certified Portuguese extract"), not as the v1 backbone.
3. **publicacoes.mj.pt is delta-only — same problem as BORME.** Even if scraping were doctrine-permitted, the reconstruction-from-events project would be 4-6 weeks dev plus ongoing ingest. ES-class effort for less ES-class traffic.
4. **Openapi Portugal coverage is the same as ES** — no directors, no shareholders, no UBO. Same v1 limitations should be documented.
5. **PT UBO is Subject-Person-restricted via RCBE.** Out of v1 scope. Same structural pattern as IT/ES/NL.
6. **NIPC-derivation helper exists in the deactivated executor** — `nipc` input field and `searchNorthdata` provenance pattern. The NIPC validation logic is portable to a new executor.

## Backup paths
- **Plan A (recommended):** Openapi Portugal Start (~€0.055/call PAYG, self-serve), pending resale confirmation. Same pattern as IT/ES. Coverage: name + VAT + LEI + status + address + GPS + activity. Document `directors: null`, `ubo: not_provided`, `financials: not_provided` as explicit limitations.
- **Plan A+ (premium):** Openapi Portugal Advanced for queries needing financials.
- **Plan B (if Openapi resale blocked):** Multi-country licensed aggregator (Creditsafe, Bisnode/D&B, Experian, Kyckr) — bundled IT/NL/ES/PT decision.
- **Plan C (premium-per-query layer):** Certidão Permanente as a separate `portuguese-company-extract` capability at €30+/call. Only useful when customer specifies legal-grade need. Out of v1 scope.
- **Plan D (deferred):** Tier-1 self-build via licensed bulk feed from IRN/Justiça Portuguesa if such a feed becomes available. Not currently published.

## Recommendation
**Replace primary — chosen path is doctrine-violating and economically non-viable.**

The "publicacoes.mj.pt parser" framing was scoped before the DEC-20260428-A Tier 1 absolute was applied uniformly to government sources. Building a parser against the public corporate-acts portal is a self-operated scraper, which Tier 1 forbids. Certidão Permanente at €25/cert is not a per-call API. Together, the chosen two-source replacement does not yield a v1 capability.

For v1: ship `portuguese-company-data` against Openapi Portugal Start, mirror the IT/ES posture. Document coverage gaps explicitly. Layer Openapi Advanced or Certidão Permanente as future premium tiers if Portuguese-customer revenue justifies.

## Open questions for build session
1. **Confirm Openapi resale addendum applies to Portugal** — same case-151296-class question. *Critical — gates the build.*
2. **Verify Certidão Permanente has any machine-readable surface** — the renewable-digital-certificate model might expose a per-NIPC fetch URL once subscribed. Useful to know for a future premium tier, not v1. *Deferrable.*
3. **NIPC validation/derivation logic** — port from the deactivated executor. *Build-session check, low risk.*
4. **Should `portuguese-company-data` mirror the IT/ES tier-extension plan** for v2? *Future scope.*
5. **Where to source Portuguese UBO if a customer asks?** Same gap as IT/ES/NL. Strategic, not v1.
6. **Document the doctrine reasoning explicitly** in the PR description: "publicacoes.mj.pt parser path rejected because it would be a Strale-operated scraper of a government source, which DEC-20260428-A Tier 1 forbids absolutely. This memo retroactively corrects the mid-rebuild target chosen pre-doctrine." *Build-session communication.*

## Budget consumption
**6 fetches** (4 WebFetch including 2 redirects on the Certidão page; 2 WebSearch).
