# Drizzle migrations

Authority: `meta/_journal.json`. The `idx` and `tag` fields there decide which file
runs and in what order. Filenames are conventionally `XXXX_name.sql` where `XXXX`
matches `idx`, but **drizzle resolves files by `tag`, not by filename pattern**.

## The 0046 collision (historical) — RESOLVED 2026-04-30

Two files briefly shared the `0046_` prefix:

- `0046_rate_limit_counters.sql` — journal `idx: 46` (kept as-is)
- `0046_suggest_log.sql` → renamed to **`0099_suggest_log.sql`** — journal `idx: 48`,
  tag updated to `0099_suggest_log`

This happened during a busy session in March 2026: two parallel agent sessions
generated migrations against the same baseline, both produced `0046_…`, and both
got merged. Because each row in `drizzle.__drizzle_migrations` is keyed by SQL
**content hash** (not filename), the duplicate prefix never affected runtime —
both migrations applied cleanly to every environment.

It was, however, a maintainer footgun. The cert audit on 2026-04-30 flagged it as
a forward hazard for `drizzle-kit generate` / `check`, so the file was renamed to
a non-conflicting prefix and the journal tag updated in lockstep. The content of
the SQL file is byte-identical, so the existing `__drizzle_migrations.hash` row
still matches and drizzle treats it as already-applied. Verified by
`apps/api/scripts/verify-migration-rename.ts` (kept for forensic reference).

The CI guard at `apps/api/scripts/check-migration-prefixes.mjs` ensures no
**new** duplicate prefixes can land. The 2026-03 collision is the only one
that was ever needed in the allowlist; with the rename done, the allowlist
should now be empty (the historical 0046 entry can be removed at any time).

## Adding a migration

Use `drizzle-kit generate` (don't write files by hand). The next prefix should be
the highest existing journal `idx` + 1.

## If you ever need to rename another migration

The 0099 rename above is the precedent. The rules:

1. The SQL content must stay byte-identical (don't reformat, don't tweak whitespace).
2. Update the corresponding journal entry's `tag` in lockstep with the filename.
3. Run `apps/api/scripts/verify-migration-rename.ts` (parameterise it) — confirms
   the new file's content sha256 matches an existing `__drizzle_migrations.hash`
   row in production.
4. Don't rename if the migration was generated post-deploy in your branch and
   isn't yet in the prod `__drizzle_migrations` table — there's no hash to match.
