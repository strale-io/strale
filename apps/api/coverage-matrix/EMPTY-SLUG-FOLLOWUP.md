# Empty-slug rows — chat-side follow-up

12 Live/Committed rows in the Notion Provider-Coverage matrix had an empty
`Capability slug` at v4 migration time (2026-05-17) and were skipped from the
repo migration. They live here in markdown rather than YAML because they
don't carry a slug to satisfy the primary key.

## What this list is for

Each row below needs a chat-side decision:

1. **Assign a real slug** — the row corresponds to a built or planned Strale
   capability that should have a kebab-case slug; pick one (e.g. assign
   `sg-company-data` to the Singapore ACRA row, since the manifest exists).
2. **Reclassify Status to In discovery / Gap** — the row is aspirational and
   shouldn't be in the migration-eligible set.
3. **Out-of-scope reference** — the row documents a source used inside
   another capability (e.g. EU Consolidated List feeds `sanctions-check`),
   not a standalone capability. Could be moved to a separate "Sources" list
   or annotated with a slug pointing to the consuming capability.

To resolve a row, ask in chat: "Update Provider-Coverage matrix row
`<page_id>` to ...". Chat-side issues a CC-prompt per Working Rule J, CC
adds the row to repo YAML and removes it from this list.

## Rows (12)

| page_id | Status | Country | Entry |
| --- | --- | --- | --- |
| `35167c87-082c-8188-85ab-fe2e21c51fe5` | Live | SG | Company registry - Singapore - data.gov.sg ACRA (direct API, shipped) |
| `35067c87-082c-81de-9ecc-ec5f4f968506` | Live | SE | Bolagsverket bankruptcy + SE + Litigation |
| `34867c87-082c-8169-b2b3-c69aaf4b25a5` | Live | EU-wide | BO - EU partial - OpenOwnership Register |
| `34867c87-082c-8107-b47d-cc355eade334` | Live | EU-wide | Sanctions - EU Consolidated List (verification) |
| `34867c87-082c-814e-bd8a-fda44a758744` | Live | Global | Sanctions - OFAC direct (fallback/verification) |
| `34867c87-082c-81e4-a264-e3328393fbbf` | Live | UK | Sanctions - UK HMT (verification) |
| `35067c87-082c-812b-9d10-de3ad145f576` | Committed | CH | Zefix SHAB + CH + Litigation |
| `35067c87-082c-815a-94b5-f238ed8d8c2e` | Committed | AT | Ediktsdatei + AT + Litigation |
| `35067c87-082c-8169-bef5-ede78180f062` | Committed | US | CourtListener + RECAP + US + Litigation |
| `35067c87-082c-819e-afb3-c99c80454412` | Committed | UK | UK FCA Final Notices + UK + Litigation |
| `35067c87-082c-81b1-8d56-d26f986c6291` | Committed | UK | UK Find Case Law + UK + Litigation |
| `35067c87-082c-8184-be14-e09340009266` | Committed | SK | OpenOwnership + SK + Beneficial ownership |
