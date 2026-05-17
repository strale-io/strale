# Provider-Coverage matrix

Canonical source for Strale's `(capability_slug × country × evidence_type)` routing data.

- **Schema**: [`schema.json`](./schema.json)
- **Browsable summary**: [`COVERAGE.md`](./COVERAGE.md) (auto-generated; do not edit)
- **Per-row data**: one YAML file per `(capability_slug, country, evidence_type)` triple

## Primary key

`(capability_slug, country, evidence_type)`. One capability handler can return multiple
evidence types from a single API call. Example: `uk-company-data` returns both
Company-registry and Beneficial-ownership data from one Companies House call, so the
matrix carries two rows sharing the same slug + country with distinct evidence types
(`uk-company-data__uk__company-registry.yaml` and `uk-company-data__uk__beneficial-ownership.yaml`).

## Filename convention

`{capability_slug}__{country_lowercase}__{evidence_type_slug}.yaml`

Double-underscore separator between the three key components — slug and
`evidence_type_slug` both use single hyphens internally, so the double underscore
avoids ambiguity in mechanical parsing.

`evidence_type_slug` mapping (lives in `apps/api/scripts/validate-coverage-matrix.mjs`
as the `EVIDENCE_TYPE_SLUG` constant; update there when the `evidence_type` enum in
`schema.json` changes):

| evidence_type | evidence_type_slug |
| --- | --- |
| Company registry | `company-registry` |
| VAT | `vat` |
| LEI | `lei` |
| Sanctions / PEP | `sanctions-pep` |
| IBAN / name match | `iban-name-match` |
| Beneficial ownership | `beneficial-ownership` |
| Address / other | `address-other` |
| Adverse media | `adverse-media` |
| Litigation / bankruptcy | `litigation-bankruptcy` |
| EIN / Tax ID | `ein-tax-id` |

Country: ISO-3166-1 alpha-2 lowercased, or `eu-wide`, or `global`.

## Editing

> For the step-by-step update protocol, see [`PROTOCOL.md`](./PROTOCOL.md) (in-repo mirror of Working Rule J). If `PROTOCOL.md` and the Notion page (`33c67c87082c81ca91c7f5bfdccea5a2`) ever diverge, the Notion version wins; `PROTOCOL.md` is updated to match.

Reference-data changes from chat (Claude.ai) require a CC-prompt artifact per
**Working Rule J**. Chat never directly edits these files; chat-side updates produce a
prompt that CC executes here, following the audit-first phase (Rule C).

The CI gate [`.github/workflows/coverage-matrix-validation.yml`](../../../.github/workflows/coverage-matrix-validation.yml)
enforces schema validation, filename/content alignment, and `COVERAGE.md` staleness
detection on every PR.

## Structural enforcement

Three gates protect this surface:

1. **Schema validation** (`schema.json` + `validate-coverage-matrix.mjs`) — kebab-case
   slug pattern, enum-constrained evidence_type / status / sourcing_pattern,
   `additionalProperties: false`.
2. **Filename-content alignment** (same script) — `{slug}__{country_lc}__{et_slug}.yaml`
   must mechanically derive from the YAML fields. Catches drift if someone renames a
   file without updating contents or vice versa.
3. **COVERAGE.md staleness** (`coverage-matrix:check` script) — regenerates the
   summary to a buffer and diffs against the committed `COVERAGE.md`. Editing a YAML
   without regenerating the summary fails CI.

## Migration provenance

[`.migration-snapshot.json`](./.migration-snapshot.json) is the immutable JSON dump of
the Notion Provider-Coverage matrix at v4 migration time (2026-05-17, post chat-side
cleanup of duplicate slugs, multi-slug rows, annotated slugs, and the empty-slug
classification fix). Each YAML retains its original Notion page ID in
`_source_notion_page_id` for audit trail.

The Notion Provider-Coverage matrix database (formerly at
`collection://1dfb6122-6ca6-4ccc-9660-649b4e648220`) was archived to read-only after
this migration merged.

## Known follow-ups (not blocking)

- The migration snapshot redacts `Provider ToS notes` / `Notes` / `Doctrine reference`
  free-text for rows with Status ∈ {In discovery, Gap} (commercial-negotiation notes
  for unsigned vendors). Live/Committed/Deprecated rows are kept verbatim.

## Resolved post-migration (2026-05-17)

- [`EMPTY-SLUG-FOLLOWUP.md`](./EMPTY-SLUG-FOLLOWUP.md) — all 12 originally-skipped
  rows resolved via PR #130 (3 sources-not-capabilities, 1 added as
  `singapore-company-data`, 8 deferred per v1 scope). File retained as audit log.
- `sourcing_pattern: null` backfill — closed via PR #130 (11 Live rows updated to
  `Direct API` with handler-source verification; Polish handler confirmed direct
  KRS API, not scraper).
- `provider: "Other"` on `greek-company-data` / `slovak-company-data` — closed
  via PR #129 (fixed to `GEMI` and `RPO` respectively, with factual
  `provider_tos_notes`). `adverse-media-check` and a few Committed rows still
  carry `Other` legitimately (vendor TBD).
