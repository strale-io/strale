Intent: stop the manifest drift sweep counting the test runner's captured
`output_schema.example` as drift, so the weekly drift check can go green and
the "awaiting publication" list shows only real differences.

# 2026-10-28 — output_schema has two writers; the example is runtime-owned

Found by the 2026-10-28 morning run (see `2026-10-28-checkin-morning.md`).

**Cause.** `test-runner.ts` `captureExampleOutput` writes a real response into
`capabilities.output_schema.example` whenever the stored schema has none. The
boot text sync (#776) writes the manifest's `output_schema`, which for most
tools declares no example. After the sync, the next successful test re-adds the
example; the sync then sees an unchanged hash and leaves it. Steady state is
stable, but `sweep-manifest-drift.ts --strict` compared the stored schema
(with example) to the manifest (without) and failed.

**Measured, production read-only, 2026-10-28 ~07:15Z:** strict sweep exit 1,
28 writable tools drifted on `output_schema` only. Across all manifests, 36
`output_schema` differences, 32 of which vanish when a DB-side `example` is set
aside where the manifest declares none. The 4 that remain are report-only
tools with real schema differences (adverse-media-check, domain-reputation,
gdpr-website-check, no-bankruptcy-check).

**Fix.** `withRuntimeExample` in `capability-field-authority.ts`: when the
manifest declares no example and the stored schema has one, the stored example
is kept. Used by `manifestDrift` (sweep) and by `applyManifestText` both for the
report-only comparison and the write (so the sync no longer wipes the example
once per manifest change). A manifest that declares an example still wins. The
hash still covers manifest text only.

**Evidence.** Two new tests (drift + sync) fail against `origin/main` sources
and pass with the fix. Strict sweep re-run with the fix against production:
exit 0, writable drift `(none)`. Root `npm run typecheck` clean.

**Next.** After merge, the next weekly-drift cron (Monday 2026-11-02) should
pass the manifest step; confirm with `npm run scheduled:outcomes`.
