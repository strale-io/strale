# Notion preservation export — 2026-08-31

This directory is an immutable evidence export captured during M0 of the
repo-native operating-model migration. It does not establish the exported
content as current product truth.

## Contents

- `pages/` contains raw Notion fetch responses for the Project Home and its
  operating sections, current and archived strategy/state candidates, runtime-
  referenced distribution/vendor pages, and recent website-design records.
- `data-sources/` contains raw schema fetches and first-page SQL query responses
  for Decisions, Journal, To-do, Deferred, Glossary, Feature Registry,
  Distribution Registry, Social Media Posts, and Vendor Roster.
- `searches/` preserves the targeted discovery searches used to locate
  duplicate Current State/Product Strategy pages and current website/design
  records.
- `manifest.json` records byte size and SHA-256 for every export file.

Each JSON wrapper records the retrieval date, requested source ID or query, and
the unmodified connector result. Notion itself was not edited or deleted.

## Known export limit

The Decisions, Journal, To-do, and Vendor Roster first-page responses each
contain 100 rows and report `has_more: true`. Pagination was attempted after
independent review identified the truncation, but Notion's workspace query quota
had been exhausted for both Codex and Claude Code. Those four exports are
therefore explicitly incomplete until the quota resets or a full workspace/UI
export is supplied. No M0-complete or cutover claim may rely on them yet.

The export deliberately preserves contradictions. For example, several pages
share the titles `Product Strategy` and `Current State Summary`, and the active
daily-digest runtime still reads the archived Distribution Surfaces Registry.
Those conflicts are reconciliation inputs for M2, not reasons to pick a winner
during preservation.
