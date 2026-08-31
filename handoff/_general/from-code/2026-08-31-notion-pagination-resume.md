Intent: Use the restored Notion query window to advance the M0 preservation export, preserve every successful response, and leave an exact restart point if quota closes again.

## Outcome

- Preserved ten additional Notion data-source pages before the connector returned
  `usage_limit_reached` again.
- Captured 318 unique Decision rows, 400 Journal rows, 300 To-do rows, and 166
  Vendor Roster rows across all preserved pages.
- Recorded terminal short pages for Decisions and Vendor Roster, while keeping
  every source and M0 incomplete until source-side `COUNT(*)` parity is verified.
- Added a machine-readable pagination state, refreshed the preservation manifest,
  and updated the migration plan and M0 report with exact resume instructions.
- Independent Claude review returned `PASS_WITH_FOLLOWUPS`: zero high, one medium,
  and zero low findings. The medium finding was resolved by downgrading the two
  terminal captures from complete to provisional pending count parity.

## Open

- On the next available query window, resume Journal at offset 400 and To-do at
  offset 300. Continue each until a page shorter than 100 rows is preserved.
- Run source-side `COUNT(*)` queries for Decisions, Journal, To-do, and Vendor
  Roster. Mark a source complete only when its count equals the captured unique-ID
  count and its terminal page has been observed.
- M0, M2, and every authority-changing or cutover action remain blocked until all
  four sources satisfy those checks and Claude gives a fresh milestone PASS.
- `[BACKFILL]` Create the matching Notion Journal session entry after the export
  can be searched for duplicates again.
- The founder deferred rotation after GitHub commit/blob/branch checks and Claude
  review established that the rejected secret-bearing commit was never publicly
  reachable. Rotation remains recommended and becomes immediate on unrecognized
  use, a provider alert, or accidental publication.
- Sanitized evidence is now preserved in the confirmed-private
  `strale-io/strale-context-archive` repository. The public code repository keeps
  only `docs/project/private-archive-status.json`.
- Public-ref cleanup found a second affected branch and PR #446's retained head
  ref. The approved migration branch was reconstructed from a fresh clone and
  force-updated to `f37b57cd`; its remote tree now contains zero raw Notion paths.
  The additional branch and retained GitHub objects require explicit follow-up.

## Non-obvious learnings

- A short page proves the captured offset sequence ended, but unordered SQL
  pagination alone does not prove source completeness.
- Source-side count parity is sufficient to close the current capture without
  repeating the full export with an ordered query, provided unique row IDs and
  contiguous offsets continue to validate.
- The connector currently permits a limited burst of successful queries after a
  quota reset, so every response must be persisted before issuing the next query.

## Cost

No metered API spend. Codex and Claude review used subscription-included routes.
