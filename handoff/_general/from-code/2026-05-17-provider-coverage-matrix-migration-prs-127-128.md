Intent: Migrate the Provider-Coverage matrix from a Notion database to repo YAML with structural enforcement, then close the verification gaps the migration exposed.

## Outcome

Two PRs merged.

### PR #127 — the migration itself (merged 2026-05-17T16:18:20Z, main `5433268`)

Iteration 4 of the migration. v1/v2/v3 halted at progressively earlier data-quality blockers that chat-side cleaned between iterations:

- v1 halt: 38 null-slug rows + 4 duplicate slugs + 2 multi-slug rows + gitignored target directory (`coverage/` already used by node test-coverage convention) → chat split rows + reclassified, repo path bumped to `coverage-matrix/`
- v2 halt: 3 annotated slugs (`"uk-cop-check (build pending; pre-empted slot)"`-style) + `uk-company-data + UK` collision (BR vs BO) → chat cleaned annotations; primary key bumped from `(slug, country)` to `(slug, country, evidence_type)`; filename pattern `{slug}__{country_lc}__{evidence_type_slug}.yaml` (double underscore)
- v3 halt: kebab regex treated empty-string and non-empty-bad-shape identically; 12 empty-slug Live/Committed rows hit the strict halt → v4 prompt split the rule: empty=silent skip, non-empty kebab-fail=halt

v4 cleanly shipped 46 YAMLs across the 86 non-Deprecated rows. 12 empty-slug rows logged at `EMPTY-SLUG-FOLLOWUP.md` for chat triage. 26 Gap + In-discovery rows skipped. 19 Deprecated rows skipped.

Structural enforcement: three gates protect the new surface:
1. `apps/api/scripts/validate-coverage-matrix.mjs` — JSON Schema validation (kebab slug, evidence_type enum, country regex, `additionalProperties:false`) + filename-content alignment (filename must mechanically derive from YAML fields)
2. `apps/api/scripts/regenerate-coverage-matrix-summary.mjs --check` — round-trip COVERAGE.md detector
3. `.github/workflows/coverage-matrix-validation.yml` — CI gate runs the above on matrix-touching PRs

`/go` six-lens review surfaced 4 HIGH + 5 MEDIUM, all closed inline before merge. Most consequential: commercial-negotiation notes in In-discovery rows of the snapshot would have been committed verbatim — added a redaction pass that scrubs `Provider ToS notes` / `Notes` / `Doctrine reference` for Status ∈ {In discovery, Gap} only.

### Audit between #127 and #128

Read-only audit (pure read + structured report) found:
- 46 YAMLs validated cleanly, primary-key sanity holds, CI green, gitignore correct
- **Failure**: `npm run coverage-matrix:check` exited 2 locally on Windows due to CRLF/LF mismatch. CI on Linux unaffected.
- **Failure**: `check-provider-coverage-drift.ts` still wired into `weekly-drift.yml` — would have polled the now-archived Notion DB every Monday and produced meaningless drift signals.
- Cosmetic: PROTOCOL.md mentioned in PR #127's "Out of scope" but not yet in repo → CC can't resolve "Rule J" from inside the repo.

### PR #128 — post-#127 cleanup (merged 2026-05-17T18:45:40Z, main `19b73eb`)

Three follow-ups:
- (A) Delete `apps/api/scripts/check-provider-coverage-drift.ts` (379 lines) + remove its step + `PC` aggregator var from `weekly-drift.yml`. Other 6 drift checks (manifest, facts, fetch-timeout, migration-prefixes, vendor-roster, audit-record-shape) preserved verbatim.
- (B) CRLF/LF fix: belt-and-suspenders — `.gitattributes` pins `COVERAGE.md` to LF, regenerator `--check` normalises CRLF→LF and lone bare `\r` on both sides before comparing.
- (C) `apps/api/coverage-matrix/PROTOCOL.md` — in-repo mirror of the chat-side update protocol (matrix-update-protocol.md / Working Rule J) with source-of-truth precedence note (chat-side wins). README pointer + Glossary block defining Chat / CC / Rule C added.

`/go` returned 2 MEDIUM + 2 LOW on the cleanup PR; all MEDIUMs fixed inline (bare `\r` normalization, PROTOCOL.md Glossary, README single-pointer tightening). 1 LOW BOM-stripping intentionally deferred.

### Notion to-do updates

3 source to-dos closed (`Status=Done`):
- `36367c87-082c-81e3-9895-d3e7467df578` (drift script retirement)
- `36367c87-082c-811d-88ba-dac4507a950a` (CRLF/LF fix)
- `36367c87-082c-8153-ac8d-cabd3039aedb` (PROTOCOL.md to repo)

1 new follow-up filed (`36367c87-082c-8129-879d-e77c85c93395`, P3, Owner=Claude chat): "Sync PROTOCOL.md when matrix-update-protocol.md changes in project knowledge".

## Open

- 12 empty-slug rows in `EMPTY-SLUG-FOLLOWUP.md` need chat triage (assign real slugs, reclassify to In-discovery, or move to a separate "Sources" list)
- `sourcing_pattern` is null on ~15 rows pending classification backfill (chat-side)
- `greek-company-data` + `slovak-company-data` have `provider: "Other"` (factually wrong; correct names are GEMI and RPO — chat-side Notion fix then re-prompt)
- `pep-check` missing `Counterparty Assurance` in products (companion-row split artifact from chat cleanup)
- Notion DB archival to read-only (chat-side post-merge)
- AVS / Coverage Matrix doctrine page rewrites — replace stale mirror tables with pointers to `apps/api/coverage-matrix/`
- 19 Deprecated row trash in Notion (chat-side)
- `matrix-update-protocol.md` to project knowledge (Petter adds manually)
- 3 historical handoff/proposal docs retain frozen references to the deleted drift script. Expected per the audit (frozen historical content); no action needed.

## Non-obvious learnings

- **The four-iteration halt cycle was the right pattern, not a bug**. Each halt surfaced a structural data-quality issue that chat-side fixed in Notion before re-prompting. The cumulative work that landed in v4 was higher-quality than v1 would have been if I'd made unilateral judgement calls on each halt. The pattern: CC's strict adherence to the prompt's halt rules + chat-side iteration = real source cleanup, not just papering over.
- **Notion MCP doesn't expose `query_data_sources` in this CC session**. Had to use the Notion REST API directly (`POST /v1/data_sources/{id}/query` with `Notion-Version: 2025-09-03`) via a one-shot Node script. NOTION_API_KEY already in .env. This pattern works for any future Notion-snapshot scenario.
- **`/go` reviewer caught the CRLF/LF gap as "latent confidence 50"** and walked it back. It was real on Windows. Lesson: when a reviewer flags something as latent but the rationale relies on `.gitattributes text=auto` doing the right thing across platforms, verify by running on the actual platform before dismissing. PR #128 closed this within hours of the audit catching it in practice.
- **`apps/api/coverage/` was silently gitignored by the existing `coverage/` rule** (standard Node test-coverage convention). Caught only because v1 surfaced it. Lesson: when choosing a new directory name in this repo, check `.gitignore` first or `git check-ignore -v <path>` after creating.
- **PII scrubbing of vendor BDM names / negotiation strategy notes**: the `PII_ARRAY_FIELDS` pattern (replace array values with `["[REDACTED]"]`) works for capability fixtures; for the matrix migration snapshot it was replaced with a status-scoped redaction (free-text fields scrubbed only for Status ∈ {In discovery, Gap}, kept verbatim for Live/Committed/Deprecated). The status-scoped pattern preserves audit value while removing commercial exposure for unsigned vendors.
- **Bumping primary key from `(slug, country)` to `(slug, country, evidence_type)`** was the only design decision in the migration that didn't arrive pre-baked from the chat-side prompt. v2's `uk-company-data + UK` collision (Company-registry row vs Beneficial-ownership row, both legitimately the same Companies House call) made the compound key necessary. v3 prompt bumped it; v4 inherited it cleanly.

## Cost

PR #127: zero external API spend (the snapshot used existing NOTION_API_KEY; no paid capability calls).
PR #128: zero (cleanup only, no live calls).

Total Openapi spend this session: zero (the Openapi spend was from earlier in the day during PR #125's tier-coverage capture, ~€2.00, covered by the earlier handoff).

## Time accounting

- Morning (PR #125, #126, Notion-vs-code audit): covered by earlier handoff
- Afternoon: PR #127 v1→v2→v3→v4 halt cycle (~4 hours including chat iteration), audit (~30 min), PR #128 cleanup + /go + merge (~1.5 hours)
