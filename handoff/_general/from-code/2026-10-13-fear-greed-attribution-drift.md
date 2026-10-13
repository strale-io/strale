# 2026-10-13 — weekly drift sweep red since 2026-09-28: fear-greed-index declaration

Intent: Petter asked for a status check and a fix if anything was broken.

Status found (2026-10-13 ~20:00 UTC):
- Production `/health` ok, serving `f7236798` = `origin/main`. Main CI green.
- One red signal: the weekly drift sweep has concluded `failure` on every run
  since 2026-09-28 (issue #311 refreshed each week). Its only failing
  sub-check is manifest↔DB drift on `fear-greed-index`
  `output_field_reliability` — the finding the 2026-10-02 DQ-34 record left
  for a morning run and no run picked up. Platform-facts, vendor-roster
  (shadow comparison is report-only), AuditRecord shape, TOAST and
  output_schema checks were all clean.

Cause: PR #633 (2026-09-11) made the executor emit Alternative.me's required
attribution and declared `attribution` (`guaranteed`) in the manifest; the
production row was never synced.

Fix: startup-migration block 0120 (ledger M063), run once, adds the one key to
`output_field_reliability` and `output_schema.properties` for
`fear-greed-index` only. Dry-run of the exact SQL as a read-only SELECT on
production returned the manifest's reliability map exactly. Known_answer and
edge_case suites already pass with `attribution` present, so declaring it
guaranteed cannot turn a passing suite red. Disjoint from M050 (block 0090)
by slug; a test asserts it.

Verify after deploy: `/health` commit = the merge; read-only query shows
`output_field_reliability ? 'attribution'`; `startup_migration_ledger` has
`0120_declareFearGreedAttribution` with rows_affected 1; next weekly sweep
(Monday) concludes success, or dispatch `weekly-drift.yml` manually.
