# Operator scripts now require a write credential — what to set up

**This is a breaking change to the founder's own tooling, on purpose.** Read
this before merging; the scripts below stop working until step 1 is done.

Context: `docs/incidents/2026-08-22-production-authorization-failure.md`.

## What changed

Every script under `apps/api/scripts/` now takes its database handle from
`lib/operator-db.ts` instead of `getDb()` or a raw `postgres(...)` call. There
are no exceptions left — `scripts/guard-production-write-access.mjs` fails CI on
the next one, and it reports `scripts using getDb: 0` today.

Three handles, and which one a script gets is now a visible property of its
first ten lines rather than a fact you learn by reading to the end:

| Handle | Who may use it | Enforced by |
|---|---|---|
| `openOperatorDb()` / `openOperatorDrizzle()` | anything that reads | `default_transaction_read_only=on` — Postgres refuses writes with SQLSTATE 25006 |
| `openOperatorWriteDrizzle(autonomousAuthority(purpose, policy))` | actions the escalation contract already delegates | `purpose` must be on `AUTONOMOUS_PURPOSES`; a free-text purpose is a compile error and an unlisted one throws |
| `openOperatorWriteDrizzle(requireFounderGrant(purpose))` | everything else | ed25519 signature over that exact purpose, verified against a committed public key |

## 1. Provision the read/write split (required)

The model assumes `DATABASE_URL` is a **read-only role**. Today it is not — it is
the same superuser string everything has always used, which is why the
`default_transaction_read_only` pin above exists as a second layer.

```sql
-- On production, once.
CREATE ROLE strale_ro LOGIN PASSWORD '<generated>';
GRANT CONNECT ON DATABASE railway TO strale_ro;
GRANT USAGE ON SCHEMA public TO strale_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO strale_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO strale_ro;
```

Then in the root `.env`:

```
DATABASE_URL=postgresql://strale_ro:<pw>@metro.proxy.rlwy.net:51617/railway?sslmode=disable
DATABASE_URL_WRITE=postgresql://postgres:<pw>@metro.proxy.rlwy.net:51617/railway?sslmode=disable
```

**Note `?sslmode=`.** It is now mandatory for any non-loopback host. The old code
hardcoded `ssl: false` in some scripts and `ssl: "require"` in six others against
the same database — one of those groups was always wrong, and the failure
presented as `ECONNRESET`, which reads as a network fault. TLS intent is now
stated in the URL or the connection is refused.

`DATABASE_URL_WRITE` belongs in the founder's environment, **not** in a shared
`.env` an autonomous session can read. That separation is the primary barrier;
everything else in this package is the second one.

## 2. Install a founder grant key (required for two scripts)

Until `FOUNDER_GRANT_PUBLIC_KEY_PEM` in `lib/production-authority.ts` is set,
**every founder-gated action is refused.** That is deliberate — a gate whose key
has not been set must not open — but it means these two scripts are currently
inoperable:

| Script | Purpose | Why gated |
|---|---|---|
| `topup-test.ts` | `wallet_topup` | Moves money. Credits a wallet balance. |
| `seed-kyb-solutions.ts` | `seed_sellable_solutions` | Creates and updates sellable bundles. |

To enable them: run `apps/api/scripts/gen-founder-keypair.mjs` **on a machine no
Claude session can reach**, keep the private key off this machine and out of
every `.env`, and commit the printed public key. Then issue a grant per
invocation:

```bash
STRALE_FOUNDER_GRANT='v1.<id>.wallet_topup.<expiry>.<sig>' \
DATABASE_URL_WRITE='...' \
npx tsx apps/api/scripts/topup-test.ts
```

A grant names one purpose and expires. A grant for `wallet_topup` does not
authorise `seed_sellable_solutions`, and neither authorises anything else —
that purpose binding is the specific control the incident lacked.

## 3. Scripts that now need only `DATABASE_URL_WRITE`

These run under a delegated purpose and need no grant, just the credential:

- `capability_health_breaker` — `reset-circuit-breaker.ts`
- `fixture_refresh` — `sync-known-answer-fixtures.ts`,
  `convert-browserless-suites-to-fixture.ts`, `restore-swedish-known-answers.ts`
- `capability_onboarding` — `onboard.ts`
- `catalogue_metadata_sync` — `populate-error-codes.ts`, `populate-fallbacks.ts`,
  `repair-limitation-titles.ts`, `seed-search-tags.ts`,
  `sync-manifest-canonical-to-db.ts`, `sync-manifest-text-to-db.ts`,
  `fix-corrupted-output-schemas.ts`

Money, listing state and lifecycle are **not** on `AUTONOMOUS_PURPOSES`. They are
founder-gated by omission, which is how that list is meant to work: the
delegation boundary moves by merge, not by argument.

## Why this is worth the friction

Before: any script, run by anyone, with the one credential everybody had, wrote
production — and recorded its own free-text justification in the field meant to
record authorisation.

After: a read is a read, a delegated write names a purpose from a closed list a
human merged, and anything else needs a signature made with a key the platform
does not hold. The failure mode is a refusal with an instruction, not a silent
success nobody notices for four days.
