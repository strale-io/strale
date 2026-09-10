# The local database credential is read-only

**Status:** done, 2026-09-06. Nothing pending.

## What was true before

`DATABASE_URL` in the root `.env` connected as `postgres`: `rolsuper = true`,
on the primary (not a replica), with `INSERT` and `UPDATE` granted on every
table. Verified by querying `pg_roles` and `has_table_privilege`.

The platform is written as though an autonomous session cannot write to
production. `operator-db.ts` says so in its own docstring — "the common case is
not 'the write was denied', it is 'there was nothing to write with'." That is
true of `openOperatorWriteDb()` and false of the credential. `openOperatorDb()`
does set `default_transaction_read_only` server-side, which is real, but any
script opening `DATABASE_URL` with the driver directly — the pattern used for
every scratch query — got an unrestricted superuser connection.

So the boundary was procedural. It held because sessions chose to keep to
`SELECT`, not because the database stopped them.

## What is true now

The local `DATABASE_URL` is the `strale_ro` role:

- `SELECT` on 41 tables across `public` and `drizzle`, and nothing else
- `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`
- `ALTER DEFAULT PRIVILEGES ... GRANT SELECT` on both schemas, so tables a
  future migration creates stay readable rather than silently blinding every
  read-only consumer
- a role-level `default_transaction_read_only = on`

The superuser URL is parked in the same file as a **commented**
`DATABASE_URL_WRITE`, uncommented only for the length of an operator write run
and commented out again afterwards.

**Railway's own variable is unchanged.** The API writes on every request; it
could not serve traffic otherwise. Only the developer machine changed.

## Why the session setting is not the control

`default_transaction_read_only` is defence in depth. A client can turn it off:

```
SET default_transaction_read_only = off   -- succeeds
UPDATE capabilities SET name = name       -- ERROR: permission denied for table capabilities
```

The second line is the guarantee. Verification ran every read the tooling needs
(8 tables including `transactions` and the `drizzle` migration table) and six
writes — `UPDATE`, `INSERT`, `DELETE`, `CREATE TABLE`, `CREATE ROLE`, and an
`UPDATE` after explicitly disabling the session flag. All reads succeeded; all
writes were refused, the last one at the privilege layer rather than the
transaction layer.

## What this does not do

It does not stop a session that legitimately needs to write. Uncommenting
`DATABASE_URL_WRITE` is one edit, and the production-authority model
(DEC-20260822-B) is still what decides whether a given write is allowed. The
change removes the case where a session holds superuser access *without having
decided to* — which was every session, all the time.

It also does not protect the Railway variable, which remains a write
credential by necessity. Anyone with the Railway project can still read it.

## Rollback

The previous value is the commented `DATABASE_URL_WRITE` line in the root
`.env`. Swap the two lines back. The `strale_ro` role can be left in place; it
grants nothing that is not already public to a reader.
