# Drizzle migrations

Authority: `meta/_journal.json`. The `idx` and `tag` fields there decide which file
runs and in what order. Filenames are conventionally `XXXX_name.sql` where `XXXX`
matches `idx`, but **drizzle resolves files by `tag`, not by filename pattern**.

## The 0046 collision (historical)

Two files share the `0046_` prefix:

- `0046_rate_limit_counters.sql` — journal `idx: 46`
- `0046_suggest_log.sql`         — journal `idx: 48`

This happened during a busy session in March 2026: two devs (or two parallel agent
sessions) generated migrations against the same baseline, both produced `0046_…`,
and both got merged. Because each row in `drizzle.__drizzle_migrations` is keyed by
SQL **content hash** (not filename), the duplicate prefix is not a runtime hazard —
both have already applied cleanly to every environment.

It is, however, a maintainer footgun. Future migrations should use unique prefixes.
The pre-commit guard at `apps/api/scripts/check-migration-prefixes.mjs` enforces this.

**Do not rename either file.** Renaming would require updating `meta/_journal.json`
in lockstep, and any byte-level drift in the SQL content would invalidate the stored
content hash and make drizzle try to re-apply the migration on every server boot.

## Adding a migration

Use `drizzle-kit generate` (don't write files by hand). The next prefix should be
the highest existing journal `idx` + 1.
