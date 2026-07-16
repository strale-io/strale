Intent: Close all post-migration data-quality and follow-up items for the apps/api/coverage-matrix/ surface introduced in PR #127, ending the migration arc cleanly.

## Outcome

Two PRs merged this session (continuation of the PR #127 / #128 migration arc).

### PR #129 — data quality (merged 2026-05-17T20:08:16Z, main `7ed7a45`)

Three faithful-to-handler corrections in coverage-matrix YAMLs:

- `greek-company-data__gr__company-registry.yaml`: `provider: Other → GEMI` + `provider_tos_notes` from "N/A - no provider integrated" to a factual GEMI Open Data API description. Verified against `apps/api/src/capabilities/greek-company-data.ts:5-9` (`GEMI_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1"`).
- `slovak-company-data__sk__company-registry.yaml`: `provider: Other → RPO` (not ORSR) + factual description. Verified against `slovak-company-data.ts:12` (`RPO_API = "https://api.statistics.sk/rpo/v1"`).
- `pep-check__global__sanctions-pep.yaml`: `products: [] → ["Counterparty Assurance"]`. Split-row artifact from the 2026-05-17 chat-side cleanup that split `sanctions-check, pep-check` into two single-slug rows.

`/go` six-lens returned 2 MEDIUM (pre-existing patterns, not introduced) + 1 LOW. All posted as PR comment; no blockers.

### PR #130 — final closure (merged 2026-05-17T21:19:16Z, main `e1c2105`)

Three sub-phases:

1. **Backfill `sourcing_pattern: null → "Direct API"` on 11 Live rows**: cz/ee/fi/fr/no/pl/se/uk×2/vat/lei. All confirmed direct integrations with named gov registries or standards bodies. Polish handler scraper-check (Halt #1) cleared — `polish-company-data.ts:5` uses `api-krs.ms.gov.pl/api/krs`, no browserless/puppeteer.

2. **Add `singapore-company-data__sg__company-registry.yaml`** (matrix grows 46 → 47): provider=ACRA via `data.gov.sg/api/action/datastore_search`, resource `d_3f960c10fed6145404ca7b821f263b87`. Singapore Open Data Licence v1.0. Replaces the prior opencorporates Browserless scrape (Tier-1 violation per DEC-20260428-A).

3. **Rewrite `EMPTY-SLUG-FOLLOWUP.md` as resolution log**: all 12 originally-skipped rows resolved (3 sources-not-capabilities, 1 added to repo as SG, 8 deferred per v1 scope or BO-source pattern). File retained as audit log through ~2026-06-17 (Notion DB trash date).

`/go` six-lens returned 2 HIGH + 2 MEDIUM. Fixed all 4 inline before merge:
- HIGH (Pass B, conf 90): README "Known follow-ups" was stale post-PR; moved resolved items under new "Resolved post-migration (2026-05-17)" heading.
- HIGH (Pass B, conf 82) / MEDIUM (Pass A, conf 83): SG tier_1/2/3 coverage was null despite being Live + live-verified. Mapped handler's 11 output fields against BR Tier rubric → 7/7 T1, 1/5 T2, 0/6 T3. Annotated as first-pass estimate pending audit-batch verification.
- MEDIUM (Pass A, conf 85): Swedish row's `Direct API` elided OAuth2 client-credentials distinction vs anonymous NO/FI peers. Added note in SE YAML's `notes` field naming `BOLAGSVERKET_CLIENT_ID` + `_SECRET` + token endpoint.
- LOW (Pass A, conf 81): GLEIF + VIES could be `Free open data` instead of `Direct API` — deferred (existing `provider_tos_notes` prose conveys the distinction).

## Open

Migration arc fully closed for the in-scope items. Remaining cleanup tracked elsewhere:

- Notion Provider-Coverage matrix DB scheduled for trash ~2026-06-17 (to-do `36367c87-082c-819e-8766-c4775bbc04fe`)
- AVS / Coverage Matrix doctrine page rewrites — chat-side replacement of stale mirror tables with pointers to `apps/api/coverage-matrix/`
- Litigation evidence-type rows deferred to v1.1+ (6 rows in EMPTY-SLUG-FOLLOWUP.md Group C)
- SG tier coverage is first-pass estimate; empirical audit-batch verification belongs in the next identity audit sweep
- Optional: GLEIF + VIES `sourcing_pattern` taxonomy refinement to `Free open data` (cosmetic; defer until matrix has a broader sourcing_pattern reclassification need)
- `fr-bodacc-lookup` row still carries `provider: "Other"` — next-best candidate for `Other` cleanup per Pass B observation on PR #129 (Status=Committed, not Live, not blocking)
- `adverse-media-check`, `us-ein-match`, `uk-cop-check`, `slovenian-company-data` retain `provider: "Other"` legitimately (vendor TBD or structural exemption)

## Non-obvious learnings

- **/go HIGH "README stale follow-ups" was a self-inflicted documentation debt I'd authored in PR #127**. When a PR closes items mentioned as "open" in the README, the README itself needs editing in the same PR. The reviewer caught it; I hadn't. Generalisable pattern: any "Known follow-ups" / "TODO" section in a doc should be PR-scope-aware — if a PR resolves a bullet, the bullet moves to a "Resolved" section in the same PR.

- **First-pass tier-coverage from handler-output mapping was viable for SG**. The BR Tier rubric (T1=7 MUST, T2=5 SHOULD, T3=6 NICE) maps cleanly onto a capability handler's documented output fields. For SG (no existing Notion data to inherit, unlike GR/SK), mapping the 11 returned fields to the rubric gave defensible 7/7-1/5-0/6 estimates without requiring a separate live probe. Annotation as "first-pass estimate, pending audit-batch" keeps the pattern auditable.

- **OAuth2-credentialed integrations are "Direct API" semantically but operationally distinct from anonymous open-data**. The Pass A reviewer's point on SE (Bolagsverket uses OAuth2 client_credentials vs. NO/Brreg pure anon) doesn't have a schema-enum value to represent the distinction. Adding a `notes`-field annotation is the right pragmatic fix; a future schema-evolution PR could add `"Direct API (OAuth)"` if the volume of credentialed direct-API rows warrants.

- **The migration arc (PR #127 → #128 → #129 → #130) took 4 PRs across 1 day** — each surfaced gaps the previous didn't anticipate, all caught by /go review or read-only audits. The pattern works: ship the structural surface first, then close gaps in tight follow-up PRs. The total chat → CC handoff iteration count was high (v1/v2/v3/v4 for the migration + 4 PRs + 2 audits) but produced higher final quality than any single-shot attempt would have.

- **Read-only audit between merges was load-bearing**. The data-extraction prompt that produced the 11 sourcing_pattern null list + the 12 EMPTY-SLUG followup table fed directly into PR #130's exact scope. Without that intermediate read-only step, PR #130 would have either been speculative or omitted rows.

## Cost

PR #129: zero external API spend (3 YAML field edits).
PR #130: zero external API spend (11 YAMLs + 1 new YAML + 1 MD; SG YAML created from handler-source-code inspection, no live probe).

Total this session: zero.
