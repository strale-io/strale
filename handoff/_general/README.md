# Handoff notes — historical record

Handoff files are session records: they describe the repo as it was when
written and are not updated when files later move. Notes predating
2026-08-17 may reference paths that the Phase 3 debloat relocated:

- `audit/`, `audit-output/`, `audit-reports/`, `a2a-sample/`, `tasks/`,
  `capability-sources/`, `distribution/` → `archive/sessions/<dirname>/`
- one-off scripts formerly at `apps/api/scripts/*.ts|mjs`
  → `apps/api/scripts/archive/`
- `apps/api/tests/fixtures/` → `apps/api/test/fixtures/`

If a path in an old note 404s, look for the same filename under those
archive locations before assuming deletion — the Phase 3 sweep was
archive-only (zero true deletions, verified by rename detection).
