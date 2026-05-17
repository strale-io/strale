# Empty-slug rows — resolution log (closed 2026-05-17)

12 rows in the pre-migration Provider-Coverage matrix had an empty `Capability slug` at v4 migration time (2026-05-17) and were skipped from the repo migration. **All 12 have been resolved** as of 2026-05-17 via this PR's resolution pass. No further action required on these rows.

This file is retained as an audit record. The original Notion page IDs reference the archived Provider-Coverage matrix database (parent page `34867c87-082c-8187-9391-ebc05a9b3d90`), which is scheduled for trash on ~2026-06-17 per to-do `36367c87-082c-819e-8766-c4775bbc04fe`.

## Group A — Sources, not capabilities (3 rows, out of matrix scope)

The following rows documented cross-verification sources used inside the `sanctions-check` capability handler, not standalone capabilities. Removed from matrix scope. If documentation is needed for these verification paths, it belongs inside the `sanctions-check` capability manifest or the AVS narrative — not as YAML rows in the coverage matrix.

| Notion page_id (archived) | Country | Original entry |
| --- | --- | --- |
| 34867c87-082c-8107-b47d-cc355eade334 | EU-wide | Sanctions - EU Consolidated List (verification) |
| 34867c87-082c-814e-bd8a-fda44a758744 | Global | Sanctions - OFAC direct (fallback/verification) |
| 34867c87-082c-81e4-a264-e3328393fbbf | UK | Sanctions - UK HMT (verification) |

## Group B — Added to repo (1 row)

| Notion page_id (archived) | Country | Resolution |
| --- | --- | --- |
| 35167c87-082c-8188-85ab-fe2e21c51fe5 | SG | Slug `singapore-company-data` assigned. YAML added at `apps/api/coverage-matrix/singapore-company-data__sg__company-registry.yaml`. |

## Group C — Deferred (8 rows)

6 Litigation rows: Litigation evidence type is out of Counterparty Assurance v1 scope; revisit in v1.1+. If/when any becomes in-scope, a new YAML row will be created with the appropriate slug at that time.

2 OpenOwnership BO rows: documented OpenOwnership as a beneficial-ownership data source pattern, not standalone capabilities. Per-country BO data, when needed, flows through the corresponding company-data capability (e.g. `uk-company-data` returns BO from PSC register). Removed from matrix scope; no new slug needed.

| Notion page_id (archived) | Pre-archival status | Country | Original entry | Disposition |
| --- | --- | --- | --- | --- |
| 35067c87-082c-81de-9ecc-ec5f4f968506 | Live | SE | Bolagsverket bankruptcy + SE + Litigation | v1.1 deferred (Litigation out of v1 scope) |
| 35067c87-082c-812b-9d10-de3ad145f576 | Committed | CH | Zefix SHAB + CH + Litigation | v1.1 deferred (Litigation out of v1 scope) |
| 35067c87-082c-815a-94b5-f238ed8d8c2e | Committed | AT | Ediktsdatei + AT + Litigation | v1.1 deferred (Litigation out of v1 scope) |
| 35067c87-082c-8169-bef5-ede78180f062 | Committed | US | CourtListener + RECAP + US + Litigation | v1.1 deferred (Litigation out of v1 scope) |
| 35067c87-082c-819e-afb3-c99c80454412 | Committed | UK | UK FCA Final Notices + UK + Litigation | v1.1 deferred (Litigation out of v1 scope) |
| 35067c87-082c-81b1-8d56-d26f986c6291 | Committed | UK | UK Find Case Law + UK + Litigation | v1.1 deferred (Litigation out of v1 scope) |
| 34867c87-082c-8169-b2b3-c69aaf4b25a5 | Live | EU-wide | BO - EU partial - OpenOwnership Register | Source, not capability (OpenOwnership feeds per-country BO via company-data handlers; not a standalone matrix row) |
| 35067c87-082c-8184-be14-e09340009266 | Committed | SK | OpenOwnership + SK + Beneficial ownership | Source, not capability (same pattern as above) |

## Resolution authority

Decisions made by Petter in chat session 2026-05-17 post-PR #129. This PR (#130 or successor) closes all 12 rows. No further action required.
