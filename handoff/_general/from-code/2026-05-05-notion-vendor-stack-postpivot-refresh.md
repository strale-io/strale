Intent: refresh Notion vendor-stack pages after the post-Topograph pivot (DEC-20260505-D/E/F) — set Primary DEC links on the 11 new Vendor Roster rows, rewrite the Active Vendor Stack page to reflect ~31-country v1 scope + Topograph downgrade, update the 6 mid-rebuild Provider-Coverage registry rows, and rename the Provider-Coverage `Products` multi-select option from "Payee Assurance" to "Counterparty Assurance" per DEC-20260502-A.

## Outcome

**Phase A — Vendor Roster (12 rows touched, 0 created).** All 11 target vendors plus 2 sub-source rows (sede.registradores.org, publicacoes.mj.pt) already existed from prior sessions; the gap was the missing `Primary DEC` relation. Linked Implisense, OpenRegister, bundesAPI, InfoCamere, Compass HF Data, Manz, Company.info, opendata.registradores.org, BORME, Certidão Permanente, sede.registradores.org, publicacoes.mj.pt → DEC-20260505-D. Linked Openapi.com → DEC-20260505-F.

**Phase B — Active Vendor Stack page rewritten.** Page `35367c87082c812e88d1dc6bdbfbd4f5` replaced wholesale. New structure: v1 country coverage in three groups (17 live / 6 mid-rebuild / 8 Gap-8); explicit per-country vendor stack for the mid-rebuild group; Held/Downgraded section with Topograph status per DEC-20260505-E; canonical source-document chain DEC-20260427-A through DEC-20260505-F. Front-door page (`35767c87082c818ebce2d23624f1eecf`) drift banner trimmed — AVS staleness line removed, Products-rename line preserved.

**Phase C — Provider-Coverage matrix (6 rows updated).** All 6 mid-rebuild Identity rows updated:
- DE: northdata.com → Implisense + OpenRegister + bundesAPI; Status Live → In discovery
- NL: KVK Browserless → Company.info; Status → In discovery
- IT: Browserless scrape → InfoCamere primary + Openapi.com parallel; Status → In discovery
- ES: Browserless scrape → opendata.registradores.org + BORME + sede; Sourcing → Self-hosted (Strale-built); Status → Committed
- PT: Browserless scrape → publicacoes.mj.pt + Certidão Permanente; Sourcing → Self-hosted; Status → Committed
- AT: FinAPU/finapu.com → Compass HF Data + Manz; Status → In discovery

For all 6: Provider="Other" (new vendors not in the SELECT option list — see Open below); Vendor (Roster) relation linked; Doctrine reference set; Last verified 2026-05-05; Capability slug left empty (build pending). Pre-existing Tier-1-violation tracking rows preserved as historical record.

**Phase D — halted to UI fallback.** The Notion DDL grammar `ALTER COLUMN "Products" SET MULTI_SELECT(...)` requires re-specifying the full option list rather than incremental ADD. Per the prompt's explicit halt condition for risk of dropping existing tagged values, did not attempt the mutation. Rename must be done via Notion UI (column header → Edit property → rename "Payee Assurance" → "Counterparty Assurance") which does name-only mutation and preserves existing row tags.

## Open

1. **Provider SELECT option list missing 12+ post-pivot vendors.** Provider-Coverage matrix's `Provider` SELECT doesn't include Implisense, OpenRegister, Company.info, InfoCamere, Openapi.com, Compass HF Data, Manz, opendata.registradores.org, BORME, Certidão Permanente, publicacoes.mj.pt, sede.registradores.org, bundesAPI. All 6 updated rows fell back to Provider="Other". Same DDL-redefine risk as the Products multi-select. Best to batch with the Phase D UI rename in one Notion-UI session.
2. **Provider-Coverage `Products` rename pending UI session** — front-door drift banner still flags this. Petter to action via Notion column-header rename.
3. **BO and Bank-verification rows for DE/NL/IT/ES/PT/AT not touched.** Per prompt scope these were conditional. UBO assignments mostly overlap with Identity vendors plus BYO patterns; can be added in the same follow-up Notion-UI session that does the Provider option-list extension.
4. **Counterparty Assurance product page narrative** (`34867c87082c814999e5c668d7383fa7`) likely still has the 6-country mid-rebuild framing or the pre-pivot Topograph framing. Out of scope for this session; flag for follow-up.
5. **Openapi.com Roster row's Notes references `DEC-20260504-C`** (pre-renumber ID for what is now DEC-20260505-F). The row's `Primary DEC` relation now correctly points to DEC-20260505-F so audit-trail is correct; the Notes string is cosmetic.

## Non-obvious learnings

- Prior session(s) had created all 11 post-pivot Vendor Roster rows and the 2 sub-source rows, but Petter's prompt was written assuming they didn't exist yet. Always check existing rows first — saved ~30 minutes that would otherwise have gone to redundant page creation.
- Notion DDL has no incremental ADD-OPTION primitive for SELECT/MULTI_SELECT. Adding/renaming a single option requires `ALTER COLUMN ... SET ...` with the full list, which structurally risks dropping rows whose existing tag isn't preserved by the operation. Notion's UI-side rename is name-only and lossless. For schema option mutations on populated columns, route to UI by default.
- The Provider-Coverage matrix carries two parallel Tier-1-violation tracking row sets: the per-country Identity rows (e.g. "Company registry - Germany - northdata.com") AND separate "vendor + country + Tier 1 violation" entries (e.g. "northdata.com + NL + Tier 1 violation"). The latter are historical compliance-audit records and should NOT be merged into the former when refreshing post-pivot.

## Cost

Notion MCP API calls only. No code, no DB, no deploy. Parallel CC session running Phase 4 drift script on the strale repo — not affected by this session.
