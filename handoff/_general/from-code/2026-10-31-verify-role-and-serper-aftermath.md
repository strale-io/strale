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
  receipt state, plus `has_input` / `has_output` booleans and the *names* of
  output fields. No value from either column. That is enough for every
  verification this orchestrator has run — the H7 block evidence, the x402
  reconciliation, the H3 checkpoint counts — without reading one customer
  payload. A test asserts the view never selects `input` or `output` as a
  value, only inside a presence test or a key listing.

### What a session cannot do, and why that is correct

The script is run by Petter, not by a session, and it reads the writable URL
from `STRALE_OPERATOR_WRITE_URL` in his own shell rather than from the env
file. Two reasons, and the second is the real one:

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
