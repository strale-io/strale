Intent: empirically verify Openapi.com coverage and depth across all 30 EU+UK+NO+CH countries before committing to the v1 routing architecture, then surface required audit-doc + Active Vendor Stack + Counterparty Assurance Matrix changes for a one-pass canonical update.

## What shipped

Six-phase verification workstream completed across one session, ~57 production calls against Openapi.com (~€4.53 incl 22% IT VAT, sandbox spend ~€0). Artifacts at `c:\tmp\reports\` and `c:\tmp\openapi-discovery\` / `c:\tmp\openapi-production-responses\`.

- **Phase 1 (sandbox)**: discovery + auth-flow verification. Found two-step OAuth (Basic → JWT bearer), not single-Bearer as repo env vars implied. Sandbox returned fixture data ≠ production data; corrected my own Phase 1 conclusion in Phase 2.
- **Phase 2 (production)**: 25 calls covering 4 mid-rebuild (IT/ES/PT/AT) + 11 WW-Start fallback countries. Surfaced 5 wire-shape findings (data-array always plural; WW-Start identifier-echo gap for 4/7 countries; no `currency` field; no `directors` field; LEI-absence pattern on IT-Advanced).
- **AT retest + solid-fallback (10 calls)**: confirmed H1 (AT FAIL was wrong-VAT artefact, not coverage gap — DEC-20260507-C alignment restored as THIN-USABLE+). Verified FR/UK/BE/CH/PL solid-fallback endpoints exist and return THIN-USABLE+ data. Discovered UK uses `GB-start` route key (ISO 3166-1 alpha-2 footgun for the executor routing layer).
- **Phase 14 (gap countries, 16 calls)**: BG/CY/MT/HU/LU/RO via WW-Top (€0.13/call ex-VAT). 5 of 6 flipped from "queued self-build" or "deferred no-path" to "covered via Openapi WW-Top, THIN-USABLE+". RO partial — Openapi index keyed on ≥8-digit CUIs; pre-2002 entities (OMV Petrom 1590082, Banca Transilvania 5022670) structurally absent. Each country's VAT regex exposed via 406 errors.
- **Phase 15 (LU follow-up, 5 calls)**: cumulative LU coverage 6/7 = 86%. Single 204 outlier (ArcelorMittal LU18804375) treated as Openapi index hole, not coverage caveat.

## Methodology rules codified (now empirically grounded across the workstream)

1. **Sandbox limits** (Phase 1): sandbox APIs are for auth/wire-shape regression only. Returns fixtures keyed to endpoint paths, not input identifiers.
2. **Cross-source identifier verification** (Phase 2, extended Phase 14, extended Phase 15): identifier verification is a discrete pre-flight step, not rolled into the same web search that picks the entity. Three surfaces now empirically grounded — web-search results (OMV `ATU14430407` → 204), vendor-rep claims (voestalpine `ATU36905408` → operating subsidiary; ArcelorMittal `LU18804375` → 204), and prompt content itself (SK `SK2020428036` claimed "verified" → actually a DIČ not an IČO, and SK was never in Openapi scope).
3. **Cross-source domiciliation verification** (Phase 14, NEW): confirm the legal entity is country-domiciled, not just country-branded. Worked example: Bank of Cyprus Holdings is IE-domiciled (FC020866 + Irish CRO 585903); the testable CY entity is BoC Public Co (HE165 / C165 in Openapi's index).

## Open (require Petter)

- **Apply-consolidated-diff session was halted mid-flight.** I refused to apply edits when the prompt's referenced audit doc (`eu30-business-registry-coverage-audit.md`) wasn't findable anywhere locally and the 5 embedded Notion URLs in the rewrite text (4 journal entries + 1 methodology page) couldn't be verified as existing. Three options were surfaced to Petter (path-only fix / full delegation / Notion-as-source-of-truth) — no answer yet. Audit-doc diff and rewrite content still sit at [audit-doc-diff-2026-05-11.md](c:\tmp\reports\audit-doc-diff-2026-05-11.md) and [openapi-coverage-verification-2026-05-11.md](c:\tmp\reports\openapi-coverage-verification-2026-05-11.md) waiting for application.
- **Openapi case 151296 follow-up questions** sent 2026-05-11 (per prompt context, not by me): directors product for IT/ES/PT/AT, LEI-absence supplier hypothesis on IT-Advanced + FR-Start, future-endpoint roadmap. Awaiting Shaun's reply.
- **Openapi addendum countersignature** pending Moonlighter AB VAT confirmation (Skatteverket consultation in progress, per prompt context).
- **EE Tallink + IE CRH retests** still owed — these were marked for next-budget-cycle in Phase 2 (~€0.15 incl VAT total).
- **DEC-20260511-A (NL mid-rebuild)** referenced in prompt 2.5 (apply-diff). Not authored by me; assumed to be a Decisions DB entry Petter created separately. Did not verify.

## Non-obvious learnings

- **Openapi's published docs lie about identifier acceptance.** The AT-Start spec says `{vatCode_companyNumber_or_id}` but empirically only VAT (`ATU\d{8}`) is accepted; bare Firmenbuchnummer returns 406. The CY index uses `C\d+` format internally despite all Cypriot companies being publicly registered under `HE\d+` — executor must transform `HE<n>` → `C<n>` at the Openapi boundary. UK uses `GB-start` not `UK-start`.
- **WW pricing is bifurcated.** WW-Start €0.06 PAYG (9 fields, identifier-echo unreliable), WW-Top €0.13 PAYG (16 fields, with NACE/NAICS/SIC + multi-year balance sheets + NUTS + contacts + `markers[]` typed-ID array + `nativeCompanyName`). The audit doc treats them as one tier — they aren't.
- **Sandbox-vs-production data divergence.** Same call `/IT-advanced/04060030964` returned OPENAPI S.P.A. in sandbox and EMILEDIL S.R.L. in production. Sandbox keys responses to fixtures, not inputs. Phase 1's "sandbox returns real prod data" conclusion was wrong.
- **Vendor-rep claims need re-verification.** Shaun's identifiers failed empirical test twice in two attempts (voestalpine subsidiary, ArcelorMittal 204). Plausibly his sourcing methodology is itself web-search-based.

## Cost

- 57 production calls; ~€4.53 incl 22% IT VAT total.
- Wallet balance after all phases: ~€45.05 (started €48.70 confirmed at Phase 2 start).
- Sandbox: ~€0 (virtual €200 credit, free).

## Files produced

- `c:\tmp\reports\openapi-coverage-verification-2026-05-11.md` — 15-section verification report
- `c:\tmp\reports\audit-doc-diff-2026-05-11.md` — consolidated diff proposal for the EU30 audit doc + methodology rules block
- `c:\tmp\openapi-discovery\endpoints.json` + `gap-country-endpoints.json` — endpoint maps
- `c:\tmp\openapi-production-responses\call-log.csv` — 56 rows (57 calls; 1 phase-3 manifest call not in log)
- `c:\tmp\openapi-production-responses\{phase-dir}\` — raw responses per phase

## Suggested next steps (Petter's call)

1. Clear the audit-doc apply-pass blocker by picking one of the three options surfaced ("(A) audit doc path" / "(B) full delegation, dead-link tolerance" / "(C) audit-doc-as-Notion-page").
2. Run the EE Tallink + IE CRH retests when convenient (~€0.15).
3. Codify the 3-rule methodology block as a Notion infrastructure page if it isn't already (the prompt sequence referenced `https://www.notion.so/35d67c87082c819f9cecd689c6fa5d10` as the methodology home; I never verified that page exists).
