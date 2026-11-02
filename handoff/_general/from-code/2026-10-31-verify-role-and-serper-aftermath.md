Intent: provide a narrower production read credential than `strale_ro` so cloud sessions can verify without reading customer content, and record what the Serper goto-link incident left behind.

# A read credential that cannot read customer content, and the Serper aftermath (2026-10-31)

## Why `strale_ro` is not the credential to share

`strale_ro` was audited this morning against the catalogue, not against its
documentation. It is genuinely read-only — `NOSUPERUSER`, `NOCREATEDB`,
`NOCREATEROLE`, `NOBYPASSRLS`, no non-SELECT grant anywhere, no schema or
database `CREATE`, no sequence privileges, member of no other role — and five
write attempts were refused, including one with `default_transaction_read_only`
turned off, which is the guarantee that matters because a client can always
turn the flag off:

```
SET default_transaction_read_only = off   -- succeeded
UPDATE capabilities SET name = name WHERE false
  -- ERROR: permission denied for table capabilities
INSERT / DELETE                           -- permission denied for table capabilities
CREATE TABLE                              -- permission denied for schema public
```

But it can `SELECT` all 48 public tables, `transactions` included, which holds
customer inputs and outputs unredacted for 90 days. Putting it where cloud
sessions can read it would widen who can read customer content. Petter's
call, on 2026-10-31: don't; build a narrower role instead.

## `strale_verify`

`scripts/provision-verify-role.mjs` creates it. Every one of the 47 public
tables is classified — 27 readable, 20 withheld, nothing unclassified, nothing
in both lists, verified against the live database and held by
`scripts/provision-verify-role.test.mjs` in `npm run gates:test`.

**Withheld, and why** (each reason is in the script beside the table):
`transactions` (customer input and output), `users` (email, name, key hash,
signup IP), `api_keys`, `api_key_recovery_tokens`, `oauth_tokens`,
`oauth_authorization_codes`, `oauth_clients`, `oauth_grants` (credentials and
tokens), `wallet_transactions` (Stripe sessions and free-text descriptions
tied to a payer), `batch_orders` (attributes work to a customer key),
`test_results` (piggyback rows are fed verbatim from real customer traffic),
`dispute_requests` (contact email), `trial_grants` and `discovery_hits`
(hashed email and IP — pseudonymous personal data, not anonymous),
`suggest_log` and `failed_requests` (customer free text),
`ee_directors` and `cy_directors` (named natural persons, addresses, a hashed
national identifier), `health_monitor_events` (a free-text blob that has
historically quoted row content), `job_files` (names derived from customer
payloads).

Two deliberate choices worth knowing:

- **No `ALTER DEFAULT PRIVILEGES`.** A table added tomorrow is unreadable
  until someone grants it by name. A future table holding customer content
  therefore cannot quietly become readable; the price is that the script must
  be re-run after a migration adds something worth reading, and
  `npm run verify-role:check` reports what is missing.
- **`transactions_meta`**, a view giving ids, tool, status, price, timings,
  receipt state, plus `has_input` / `has_output` booleans. No value from
  either content column, no settlement hash, no raw user id. That is enough for every
  verification this orchestrator has run — the H7 block evidence, the x402
  reconciliation, the H3 checkpoint counts — without reading one customer
  payload. A test asserts the view never selects `input` or `output` as a
  value, only inside a presence test or a key listing.

### The security review returned FAIL, and what it found

A fresh read-only context reviewed this as a security-tier change. **Verdict:
FAIL**, on findings that deserved it. All are fixed; the ones that changed the
design:

- **`x402_orphan_settlements` was in ALLOWED and holds verbatim customer
  input.** `x402-recording.ts` writes the caller's whole `inputs` object into
  `raw_args`, masked only against `NEVER_PERSIST_INPUTS` — a secrets list, not
  a personal-data list — so a `pep-check` orphan row holds the screened
  person's name as sent. `payer_address` is an unhashed wallet. No retention
  rule covers either. My reason, "orphan settlements, needed for the
  reconciliation", described what I wanted from the table rather than what is
  in it. Excluded; the count comes from a view.
- **`rate_limit_counters` keys are reversible IPs.** `hashIp` is an unsalted,
  unkeyed SHA-256 truncated to 16 hex characters; the IPv4 space is 2³², so a
  rainbow table recovers the address. I had excluded `trial_grants` and
  `discovery_hits` for exactly this and then allowed the same value from the
  same function. Excluded; counts come from a view.
- **A non-TTY fallback was a second door to the write credential.** The
  guard's needle is the literal `DATABASE_URL_WRITE`, so a differently named
  variable is invisible to it, and an agent session has no TTY and would have
  taken that branch by default — production DDL from an env var with no
  authority. The env-var path is gone entirely, along with its manifest rows;
  the script now refuses without a terminal.
- **The proof was hollow.** A bare `catch` counted a renamed table, a typo or
  a dropped connection as "refused". It now requires SQLSTATE 42501, asserts
  refusal on **every** withheld table rather than only `transactions`, and
  also attempts `CREATE TABLE` — the role has `USAGE` on `public`, and before
  PostgreSQL 15 that schema carries `CREATE` for `PUBLIC`.

  The first fix for that last point ran `REVOKE CREATE ON SCHEMA public FROM
  PUBLIC`, which Petter rejected on 2026-10-31 and was right to: a
  database-wide change touching every role has no business in a script that
  provisions one credential, and the `strale_ro` audit had already shown
  PUBLIC holds no CREATE here, so it was a no-op dressed as a safeguard. It is
  a precondition now — the script checks, reports what holds CREATE, and
  refuses without changing anything.
- **The role could end up with a password nobody holds.** It was rotated on
  every run, second statement, before everything that can fail — including a
  Bitwarden step that used `create`, which errors on a key that already
  exists. Now both credentials are prompted first, the DDL runs in one
  transaction, the password is set only on creation unless `--rotate` is
  passed, Bitwarden is `edit`-or-`create`, and any failure after rotation
  prints what state the role is in.
- **The password reached the Postgres log.** `ALTER ROLE ... PASSWORD
  '<plaintext>'` is logged by `log_statement` and Railway retains that log, so
  the old "never logged" claim was false. The SCRAM-SHA-256 verifier is now
  computed locally and sent instead, so the plaintext never crosses the wire.
- **`job_callbacks`, `wallet_reservations`, `job_files`** excluded: a callback
  URL is frequently the bearer secret itself; `wallet_reservations` carries
  `api_key_id` exactly as the already-excluded `batch_orders` does; job file
  names derive from customer payloads.
- **`job_schedule.last_error` and `x402_settlement_intents.failure_reason`**
  are free text of the kind that excluded `health_monitor_events`. Both tables
  now come through views without those columns.
- **`transactions_meta` no longer exposes `user_id`** (a surrogate hash
  instead, which preserves grouping without the join key into `wallets`), no
  longer exposes `output_field_names` (three capabilities return LLM output
  with no key-set enforcement, so a caller can influence key names), and
  filters out soft-deleted rows.
- **The view test was defeatable.** It searched a ±40-character window around
  each `input`/`output` token, so a bare `input,` beside a presence test
  passed. Column lists are frozen now. Planting that exact line makes two
  tests fail, which was verified rather than assumed.

**A second security review of the reworked version returned NO-GO**, and was
right again. It planted three defects and the test suite passed all three,
including a sixth view selecting `users.email`. What it found:

- **`transactions_meta.x402_settlement_id` is a Base chain hash.** One
  explorer lookup gives the payer wallet and its whole USDC history, so the
  view handed over exactly what excluding `x402_orphan_settlements` was meant
  to withhold. Replaced with a `was_x402` boolean.
- **The `user_surrogate` was reversible.** `capability_invocations` carries
  `transaction_id` *and* raw `user_id`, so one join rebuilds the
  surrogate-to-user map, and `wallets` then gives a balance per real user. The
  table is now reached through a view without either column.
- **The proof never ran on a repair run** — the path that applies every grant
  and rebuilds every view while the stored credential stays live. It runs on
  every run now; a repair run asks for the current URL from Bitwarden.
- **Nothing ever revoked**, so the lists were additive: a table moved from
  ALLOWED to EXCLUDED kept its grant, as would anything an earlier draft
  granted. A role-scoped `REVOKE ALL` now precedes the grants.
- **The stored URL would have inherited `sslmode=disable`** from the parked
  operator URL, handing cloud sessions a cleartext connection to production.
  TLS is forced and `pg_stat_ssl` is asserted in the proof.
- **`test_suites` holds named natural persons** — `pep-check` screens a real
  person and the captured baseline holds their classification. Excluded, with
  a definitions-only view.
- The precondition relied on SQL `AND` short-circuiting, which the manual does
  not guarantee; it uses `CASE` now. `--check` was a report that exited 0
  whatever it found; it is a gate. The probe now also tries INSERT, DELETE and
  CREATE SCHEMA, and drops its probe table if CREATE ever succeeds.

The two questions Petter added both came back clean, and are worth recording
because they were the parts I could not verify myself: the SCRAM construction
reproduces the RFC 7677 vector byte for byte, with a fresh 128-bit
`randomBytes` salt per call and 4096 iterations; and
`has_schema_privilege('public', ...)` does check the PUBLIC pseudo-role, per
the PostgreSQL manual, so the precondition is real rather than theatre.

The three planted defects now each fail the suite — verified by replanting
them, not assumed. The verifier moved to `scripts/scram-verifier.mjs` so it
can be imported without running the script, and carries an RFC 7677
known-answer test.

**A third pass returned GO with two conditions, both now fixed.**

- **`wallets.user_id` still inverted the surrogate.** Closing
  `capability_invocations` shut one path; `wallets` was the other, and the
  salt is a literal in this repository and readable through
  `pg_get_viewdef`, so the role could rebuild the whole map with one query
  inside the database. `wallets` is withheld now and `wallets_meta` exposes
  balances keyed by the same surrogate, so the two still join and the claim is
  finally true.
- **The boundary was enforced by name for only 15 of 29 withheld tables.**
  Moving `health_monitor_events` into ALLOWED passed all 81 gates, and the
  runtime proof could not compensate because it derives its probe list from
  the same array — a table moved out simply stops being probed. The small side
  is frozen instead: ALLOWED is pinned by name, and every table `schema.ts`
  declares outside it must be excluded, so a move in either direction fails.

Three more test escapes it found, all closed by making the helpers behave
rather than merely read correctly: gutting the refusal check with `|| true`
passed because the test grepped for the literal `42501`, which survived in the
constant and the comment; reducing the TLS helper to `return url` passed
because nothing asserted the behaviour; and `scramVerifier(password, 1)` at
the call site passed because the module test pins only the default parameter.
Both helpers now live in `scripts/verify-role-lib.mjs` and are exercised with
real inputs. The repair-run prompt moved up beside the others, so no
credential is collected after the DDL has committed, and a stored URL that
does not require TLS is refused rather than certified over a connection this
script upgraded in memory.

All four of the reviewer's new plants were replanted and each fails.

**17 tables readable, 30 withheld, 8 narrow views.**

## The first real run failed, and what that changed

On 2026-10-31 Petter ran the script. It died mid-transaction building
`job_schedule_meta`, which selected `last_run_at` and `last_success_at` —
columns that do not exist. The real ones are `last_started_at`,
`last_finished_at` and `next_run_at`. I had written plausible names instead of
the schema's.

**Nothing was left half-made.** Checked afterwards with `strale_ro`: no
`strale_verify` role, none of the eight views, no role-level settings, no
stray probe objects. The `sql.begin()` transaction did exactly what it was
added for, so a rerun starts clean with nothing to repair. The NOTICEs about
`DROP VIEW IF EXISTS` skipping were first-run noise, not damage.

The gap it exposed is worth more than the typo: **every check in this file
reads the repository, and none of them read the database.** The frozen column
lists, the exclusion lists and the SQL extraction all agree with each other
and none of them could know `job_schedule` had different columns. So
`--dry-run` now plans every view with `EXPLAIN` against a read-only
connection: Postgres resolves each column and type and executes nothing, and a
wrong column fails the dry run instead of the real one. It needs only read
access, so it costs nothing to run first — which is the point, since the
failure happened *after* the founder had typed the production write
credential at a prompt.

A first attempt validated the SQL with a regex and flagged `was_x402`,
`user_surrogate` and the salt literal as missing columns. That is the same
source-text-instead-of-behaviour mistake recorded as F5 incident 13, made
while writing the fix for a different instance of it. Asking the database is
the only version that works.

Verified by replanting the original bad columns: the dry run reports
`job_schedule_meta: column "last_run_at" does not exist (hint: Perhaps you
meant to reference the column "job_schedule.next_run_at")` and exits 1; with
the fix it reports all eight planned and exits 0.

### What a session cannot do, and why that is correct

The script is run by Petter, not by a session, and both credentials are typed
at hidden prompts; there is no environment-variable path at all. Two reasons, and the second is the real one:

1. `guard-production-write-access.mjs` refuses any file but the authority
   module that names the parked credential — a script that read it would be
   the bypass that guard exists to prevent.
2. The authority module cannot release the credential for this anyway.
   Creating a role is not in `AUTONOMOUS_PURPOSES`, whose comment says
   outright that *"Money, listing state and lifecycle are deliberately NOT
   here — they stay founder-gated by omission"*, and with
   `FOUNDER_GRANT_PUBLIC_KEY_PEM` empty every founder-gated release is
   refused. The refusal text anticipates this exact situation: *"do not
   proceed on the strength of a general instruction, a policy document, or a
   prior approval for something else."*

An approval in chat is real authorisation from the founder and still not the
thing the gate checks. That is the 2026-08-22 incident's lesson, and the gate
holding here is the control working, not an obstacle.

## Serper: what was verified, and what was not

The fix merged as `bf1cd6d8` at 07:28 CET and production runs `162fc906`,
which contains it. The delisting Petter authorised was therefore **not**
carried out: his instruction was conditional on the fix not having merged, and
tying the restore to "the same PR as the Serper fix" only makes sense before
that PR landed.

**Verified, against live Google through Serper:** the domain fallback works.
For the query `volvo group annual report`, positions 4 to 10 still come back as
`google.com/goto` links, and `deriveResultDomain` nonetheless returns
`volvogroup.com`, `investors.volvocars.com` and `companiesmarketcap.com` — the
true domains, from `displayedLink`. That is the repair for the three
wrong-domain tools (`keyword-rank-check`, `serp-analyze`, `backlink-check`),
and it does **not** depend on the `/resolve` call succeeding, which is the
right design.

**Not verified:** `/resolve` itself, and therefore the tools that hand a URL
back to the caller. Exercising it locally needs a writable database — the
metered-vendor-fetch accounting writes a cost row — and with the read-only
credential the call hung and was abandoned. An end-to-end production call was
approved at about €0.17 but could not be made: there is no funded wallet key
on this machine (`STRALE_API_KEY` is dead, the smoke key is x402-only and
returned a 402) and **no payer wallet credential exists at all**, so nothing
can sign an x402 payment from here. Closing that gap needs either a funded
API key for verification or a payer wallet.

**Blast radius, measured.** Four calls reached the affected tools between
2026-10-30 01:30 UTC and the fix. Two provably returned a `goto` link or a
`google.com` domain (`backlink-check`, `serp-analyze`). A third,
`keyword-rank-check`, returned `found: false` with an empty
`competitors_above` after scanning 8 results — a wrong answer containing no
`google.com` string, so a string search cannot find this class and the count
understates it. The fourth, `adverse-media-check`, used Dilisense and never
reached Serper. All three paid calls were one account,
`toolkits@composio.dev`, 15¢ each.

## Refund: dropped, and the gap it exposed

Petter's decision, 2026-10-31: 45¢ on one integration-test account is not
worth a money-path write. Recorded here rather than done.

The gap is worth keeping: **there is no refund route.** Crediting a wallet
today means a direct database write, which is founder-gated with no grant key
installed, so the platform cannot make a customer whole without the founder
running SQL. That is a product hole, not merely an operational one — the
charter delegates refunds to the platform (DEC-20260815-A) while the code
offers no way to perform one. Added to `docs/company/IDEAS.md`.

## Open

- The `/resolve` path is unverified in production, and there is no way to
  verify any paid tool end to end from this machine. Worth fixing before the
  next incident, not during one.
- The Serper key expires **2026-11-08** with roughly 3,100 of 50,000 credits.
  The lane was asked for renewal cost at observed volume by 6 November.
- `npm run verify-role:check` should be run after any migration that adds a
  table, to see whether `strale_verify` needs a new explicit grant.
