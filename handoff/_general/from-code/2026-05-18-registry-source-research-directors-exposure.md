Intent: Run the source-side counterpart to the handler-side directors-verification audit — research what each EU30 + UK + CH + SG + US-Cobalt + EU BRIS business registry source publicly claims to expose for directors / officers / legal representatives, with citation URLs and canonical field names, to feed the four-way diagnostic matrix (source-yes-handler-yes = Class A audit bug; source-yes-handler-no = Class B real gap; source-no = Class C honest gap; AML-gated = Class D).

## Outcome

Report written to [audit-output/registry-source-research-2026-05-18.md](audit-output/registry-source-research-2026-05-18.md). Coverage: 33 sources researched in 6 parallel general-purpose research-agent batches (Nordics+UK+IE; Western Europe; Southern Europe+Iberia; CEE+Baltics; Openapi product matrix; SG+US-Cobalt+BRIS).

Headline source-side findings:
- **13 free + structured API sources** for directors: SE, NO, DK, UK, FR, BE, CH, PL, CZ, SK, EE, LV, HR
- **11 sources expose directors only via paid / PDF / web-UI / contract-gated channels**: DE (free PDF only post-DiRUG Aug 2022), LU (free PDF), GR/MT/CY/HU (free HTML), IE (partial open data), NL/AT/IT/ES/PT/RO (paid), BG (paid SOAP), FI (paid Virre — free v3 API does NOT expose vastuuhenkilöt)
- **0 true Class C cases for directors** — every registry exposes directors at some tier; the question is always which tier
- **0 Class D cases for directors** — Class D applies only to UBO registries (LU RBE, AT WiEReG, PT RCBE, IT TE), not director registers
- **Openapi.com is Italy-only for directors** — public catalog has no AT/BG/CY/HU/LU/MT/NL/PT/RO/ES product exposing director data; only IT-Stakeholders and the Current Company Representatives Report (Italy) do
- **SG free data.gov.sg is structurally name-blind** (officer count only); paid BizFile EIQ required for director names
- **US-Cobalt** officers covered in ~28 of 50 states; CA/NY/DE explicitly redacted at source
- **EU BRIS** is identity-only — not a useful director feed; per-MS variable

Canonical field names captured per source (verbatim, with citation): Funktionärer (SE), Roller (NO), Deltagere (DK), Vastuuhenkilöt (FI), Officers (UK/IE/MT/CY), Représentants légaux/Dirigeants (FR), Vertretungsberechtigte/Geschäftsführer/Vorstand (DE/AT), Functionarissen/Bestuurders (NL), Fonctions/Functies (BE), Verwaltungsrat/Personen/Zeichnungsberechtigte (CH), Dirigeants/gérant/administrateur (LU), Administradores/Cargos (ES), Membros dos órgãos sociais/Gerentes/Administradores (PT), Cariche/Amministratori (IT), Διοίκηση/Διοικητικό Συμβούλιο/Διαχειριστές/Εκπρόσωποι (GR), Reprezentacja/Skład organu (PL), Statutární orgán/Jednatel (CZ), Štatutárny orgán/Konajúce osoby (SK), Vezető tisztségviselő/Képviselő (HU), Juhatuse liikmed/Esindusõigus (EE), Amatpersonas/Valdes loceklis (LV), Vadovas/Valdymo organas (LT), Osobe ovlaštene za zastupanje (HR), Zastopniki/Člani uprave (SI), Управители/Представители/Съвет на директорите (BG), Administratori/Reprezentanți legali (RO), Position Holders (SG paid).

## Cross-reference

Class A vs B determination is mechanical once the parallel handler-side audit (Prompt 1, `handler-directors-verification-2026-05-18.md`) lands. Report's matrix has all source-side columns pre-filled; handler-side audit fills columns 7-8.

## Open

- IE: could not verify whether the bulk Company Records dataset on opendata.cro.ie includes structured director rows. CRO Open Services REST API documentation enumerates only company-level fields. Follow-up: direct fetch of CSV header / dataset schema.
- Openapi: full WW-Top JSON response schema is behind console login; possibly includes undocumented director fields for some countries. Follow-up: logged-in fetch of `company.openapi.json` OAS.

## Non-obvious learnings

- Belgium's KBO is free + structured but returns only **current** functions with **no DOB, no residence, no historic-director records**. Reverse-lookup (director → company) is blocked. Less PII than Germany's free post-DiRUG Aktueller Ausdruck.
- France's INSEE Sirene Open Data explicitly **excludes** représentants légaux per Art. R 123-232 Code de commerce. Director data flows only via INPI RNE (free with auth) or the free recherche-entreprises.api.gouv.fr aggregator. `diffusibilité` flag MUST be honored — non-diffusible records cannot be redistributed.
- Poland's KRS JSON anonymizes director names (`"nazwisko": "L******"`, PESEL first digit only) per GDPR carve-out, but the **PDF** returned by the same free API contains full names. Implication: for KYB use, parse the PDF.
- Germany's DiRUG reform (1 Aug 2022) made directors free — but no JSON API was built. Every consumer parses the AD-PDF or uses a scraping wrapper.
- Singapore stripped officer names from data.gov.sg under Companies Act s.12(2A). The `no_of_officers` column is a count, not a list. A free SG capability is structurally name-blind.
- All true Class D (AML-obliged-only) cases discovered are UBO registries, not director registries — directors remain broadly accessible in the EU by statute, though often paid or PDF-only.

## Cost

Zero — research only, no executions billed. Time: ~5 minutes of wall-clock for 6 parallel research agents.

## Followups for chat

Chat reads this report alongside Prompt 1's handler-side findings. Intersection determines per-country action:
- Class A (audit bug only) → labeling fix to use canonical source terms
- Class B (extraction gap) → feeds legal-representatives extraction sweep v1.1 to-do
- Class C (honest gap, FI on free tier) → reflect in v1 launch DEC honestly
- Class D (AML-gated) → potentially closeable v1.1 if Strale's customer profile includes obliged entities (but this set has 0 director-side cases)

No code changes, no DB mutations, no Decisions DB entries authored. No /go gate required (research-only).
