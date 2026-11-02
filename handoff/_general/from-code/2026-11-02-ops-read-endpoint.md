Intent: Let cloud sessions answer fixed production questions without the PC-only database route (brief from the wow-core master session; Petter confirmed in this Strale session, 2026-11-02).

[BACKFILL] Cloud session; no Notion write was made.

## Delivered

- `GET /v1/ops-read/:check` (`apps/api/src/routes/ops-read.ts`, `apps/api/src/lib/ops-read.ts`).
- **Auth:**
  - Bearer `STRALE_OPS_READ_TOKEN`, separate from ADMIN_SECRET, at least 32 characters, constant-time compare.
  - Without it, or when unset or short, every path answers exactly like an unknown route (404, same body).
  - Rate limited at 30 requests a minute per IP, applied after the token check, so an unauthenticated response carries no rate-limit headers and never answers 429.
  - Excluded from the OpenAPI spec with a reason in `openapi-internal-routes.ts`. Not in the sitemap or llms.txt.
- **Checks** (fixed SQL; the only caller input is a validated YYYY-MM-DD range, bound as text):
  - `build`: the deployed commit, and whether the transaction really is read-only (`current_setting('transaction_read_only')`).
  - `parked-suites`: suites parked by the paid-call guard (`quarantine_reason LIKE 'paid_call_blocked:%'`), as id, slug, test type, mode, active and last result time.
  - `test-call-cost?from=&to=` (max 30 days, the `test_results` retention; `oldest_result_day` shows how far back data exists): runs per UTC day of Strale's own test suites, with declared external cost. Piggyback rows are excluded. The same totals are given per parked suite.
  - Test runs have no measured cost (their LLM spend is only logged), so past cost = parked-suite runs x price per call.
- **Safety:**
  - Every check runs in a `READ ONLY` transaction with `statement_timeout = 5s`.
  - `assertSafeOutput` checks every key against `OUTPUT_FIELDS`, each with one allowed shape. An unlisted key or wrong shape fails the request with a 500 that does not echo the value.
  - The date range is validated before any database work.
  - No input, output, baseline or reason column is selected.
- `config/env-manifest.yaml` row for `STRALE_OPS_READ_TOKEN`.
- `docs/operations/2026-11-01-prod-verify-action-proposal.md` is marked superseded.

## Evidence

- `lib/ops-read.test.ts`:
  - auth;
  - the output contract, with planted free text, email, URL, reason text and JSON;
  - date parsing, including an injection string;
  - the check SQL: no content columns, no Date parameters, piggyback excluded;
  - a planted row is refused.
- `routes/ops-read.test.ts`, through the real app:
  - 404 parity without, with a wrong, or with the admin token;
  - fail closed on a short token;
  - the read-only transaction config;
  - planted text gives a 500 without echoing it;
  - 400 on a bad range.
- Independent review round 1: PASS WITH FIXES. Fixed: rate-limit headers exposed the prefix, range longer than retention, a key-agnostic output filter, range validated inside the transaction, and `build` needing the database for nothing. The X-Forwarded-For spoofing finding is pre-existing and handled separately.
- The `STRALE_OPS_READ_TOKEN` is classed read tier, so Bitwarden is allowed (DEC-20261027-C).
- Full API unit suite, root typecheck, env:check, models:check and API lints are green.

## Deploy dependency (DEC-20260504-C)

- The route is mounted in `app.ts` (`app.route("/v1/ops-read", opsReadRoute)`), which is on the import graph from `index.ts`.
- The token is read from `process.env` per request, so setting the Railway variable (which redeploys) takes effect without a code change.
- Post-deploy check:
  - `/health` shows the merge commit;
  - `GET /v1/ops-read/build` answers 404 before the token exists;
  - after Petter sets the token, the same call with it returns the commit.

## Next

- Next authorised action: Petter creates `STRALE_OPS_READ_TOKEN` (random, 32+ characters) once in Bitwarden project `strale` and once as the Railway variable on service `strale`. Then a cloud session calls build, parked-suites and test-call-cost through `bws run`, moves the parked suites to registration-number inputs or fixture mode, and reports the past test-call cost | Owner: Petter (token), then the Strale session | Blocker: the token does not exist yet; the cloud container also has no `bws` CLI installed.
