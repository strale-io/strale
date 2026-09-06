# Vendor-terms audit, four capabilities dropped, and a read-only database credential

**Intent:** finish the founder's open queue without his involvement — and, in
the course of writing a signup prompt, discover that the signups should never
happen and that four shipped capabilities were already in breach.

Date: 2026-09-06
Branches: `fix/vendor-terms-audit` (PR #616), `docs/readonly-db-credential` (PR #613)

## Production changes already applied — read this before touching the catalogue

These are **live in production**, applied with the parked write credential, and
the PRs only bring the repo into line with them.

**Deactivated capabilities** (`is_active`, `visible`, `x402_enabled` all false,
suites descheduled):

| slug | upstream | why | customer calls |
|---|---|---|---|
| `keyword-suggest` | suggestqueries.google.com | DEC-20260813-A lists DEC-20260427-H-4 Google as a still-absolute prohibited target | 477 (EUR 14.38) |
| `crypto-price` | CoinGecko free Demo | Demo plan excludes commercial use | 9 |
| `ip-geolocation` | ip-api.com free | non-commercial only, pro subscription required for commercial | 7 |
| `host-exposure-lookup` | Shodan InternetDB | non-commercial only | 0 (still dark) |

**Deactivated solutions** (hard dependency on a dropped capability, no gate
condition, so they would fail mid-bundle), each with a `deactivation_reason`:
`keyword-scout`, `web3-pre-trade`, `web3-wallet-snapshot`.

Verified afterwards: no active solution depends on a deactivated capability.

**Do not reactivate any of these** without a licence that permits resale. The
`DEACTIVATED` map in `auto-register.ts` carries the reason for each.

## The rule that was missing

"Free and keyless" answers whether we CAN call an upstream. It does not answer
whether we MAY sell what it returns. For a platform whose product is reselling
lookups, the second question is the one that matters, and it belongs beside
`data_source` in the manifest before the executor is written.

A free tier from a commercial vendor is the default **no** — segmenting
non-paying users away from exactly this use is what it exists for.

## Not verified — unchecked, not cleared

The audit covered all 350 manifests but only resolved the upstreams it read.
These commercial upstreams are still live and still unread, and are the obvious
next batch:

- Etherscan — `contract-verify-check`, `gas-price-check`
- AviationStack — `flight-status`
- Alternative.me — `fear-greed-index`
- GoPlus Labs — `approval-security-check`
- Adzuna — `job-board-search`
- Docker Hub — `docker-hub-info`
- GitHub public API — `github-repo-compare`, `github-user-profile`
- Public Ethereum RPC (publicnode, llamarpc) — `ens-resolve`, `ens-reverse-lookup`

Method that produced the shortlist: `free_*` cost_class AND `price_cents > 0`
AND the `data_source` is not a government or open-licence source. Most of the
93 hits cleared immediately because DNS/HTTP-fetch capabilities have no vendor.

## A gap worth closing

Deactivating a capability silently breaks any solution that bundles it. Nothing
enforces the question "what bundles this?" — I remembered to ask, and found
three live x402 solutions that would have failed mid-execution for customers.
That check belongs in the deactivation path.

## The database credential changed

The local `DATABASE_URL` is no longer a superuser. Until today it was
`postgres` — rolsuper, on the primary, INSERT/UPDATE on every table — so the
"no prod write grant for autonomous sessions" control was procedural only.

It is now `strale_ro`: SELECT on 41 tables and nothing else. Verified that a
write fails with `permission denied for table ...` even after
`SET default_transaction_read_only = off`, so the guarantee is at the privilege
layer, not the session setting.

**The superuser URL is parked as a COMMENTED `DATABASE_URL_WRITE` in the root
`.env`.** Operator write scripts (`onboard.ts` and friends) read that variable —
uncomment it for the run, comment it out afterwards. Railway's own variable is
unchanged and still writes.

Full write-up: `docs/security/2026-09-06-read-only-database-credential.md`.

## Also landed today

- The eight capabilities of 2026-09-06 were onboarded, scheduled and are
  accruing test history. Four remain (one was dropped above).
- `dependency_health` generator fix (PR #608, merged): it asserted a `status`
  field most executors never return, pinning every new capability at 80%
  against a 95% promotion bar.
- Retention cadence weekly -> daily (PR #598, merged): the backlog went 87,300
  -> 40,343 and the next run clears it.
- Write-time input redaction (`docs/security/2026-09-06-input-redaction-at-write-proposal.md`)
  is now **build-ready** — both blocking questions answered, four
  implementation steps written down. Not built: two PRs were already in flight
  and a change to every `/v1/do` write path should not land at the end of a
  long session.


## The deactivations fought back — read this before re-applying anything

`web3-pre-trade` and `web3-wallet-snapshot` were reactivated four times within
minutes of being switched off, each time setting `is_active` alone and leaving
`x402_enabled` and the deactivation reason intact.

**The compliance exposure was never live, and not by luck.**
`solution-executor.ts` takes a FRESH read of every step capability and gates on
`isServableCapability(isActive, lifecycleState, visible)`. With `crypto-price`
deactivated the step returns "capability is not currently servable" and no
CoinGecko call can be made. A revived solution is a degraded bundle, not a terms
violation. The capability-level deactivation is the line that matters, and it
held every time.

Two writers carried that fingerprint, and both are fixed on this branch:

- `routes/admin.ts` — the solutions upsert ended in
  `ON CONFLICT (slug) DO UPDATE SET is_active = true`, unconditionally.
- `db/seed-solutions.ts` — the qualification sweep switches an inactive
  solution back on when its steps pass, and checked nothing else.

Both now use the convention `vendor-control-tower.ts` already had: a
`deactivation_reason` that is NULL or starts with `vendor:` is machine-managed
and may be overwritten; anything else was written deliberately and is kept.

**Do not hand-re-apply the solution deactivations until PR #616 is deployed.**
Until the guard ships, a writer wins the race again and the state reads as
though the fix failed. Re-apply once, after deploy, and verify.

Still unidentified: what invokes those writers on a few-minute cadence. Ruled
out are `onCapabilityDeactivated` (deactivates only), the vendor-control-tower
restore path (no suspension row for either solution), and a stale seed
definition (the catalogue lists `crypto-price` as step 1). The guards are
correct regardless of the caller — they make the state durable instead of
depending on the caller behaving.

## Next

1. Read the terms for the eight unverified upstreams above and drop what fails.
2. Add the "what bundles this?" check to the deactivation path.
3. Build the input-redaction mechanism — spec is ready, nothing left to decide.
4. Founder-only: paid plans if `url-threat-scan` is still wanted (VirusTotal,
   AbuseIPDB and urlscan.io all forbid commercial use of their free tiers, so
   the signups recommended this morning were wrong and must not happen).
