Intent: Phase 1 (Contain) of the bug fix framework on the cvrapi.dk quota failure surfaced in this morning's `audit/live-registry-coverage-2026-05-06` — verify the failure is still live, and if so, prevent customer calls to `danish-company-data` from silently hitting the quota error until Phase 2 (Understand) lands.

# What shipped

## Diagnostic script (1 commit, merged + pushed to main)

- **`95eaf72`** `chore(scripts): add dk-cvr quota retry diagnostic` — adds `apps/api/src/scripts/dk-cvr-retry-2026-05-06.ts`. Mirrors the audit driver's pattern: dotenv → clear `DATABASE_URL` → autoRegister → `getExecutor("danish-company-data")(...)`. Emits JSON `{kind, started_at, latency_ms, message}`. Reusable for future Phase 1 retries against any single capability.
- Branch was `chore/dk-cvr-retry-diagnostic-2026-05-06`, fast-forward merged into main and deleted locally.

## Production data write (no commit — direct DB)

Opened the DK circuit breaker manually:

```sql
UPDATE capability_health
SET state='open',
    opened_at=NOW(),
    next_retry_at=NOW()+INTERVAL '6 hours',
    updated_at=NOW()
WHERE capability_slug='danish-company-data';
```

Verified state on prod after apply:
- `state=open`
- `opened_at=2026-05-06T10:39:41Z`
- `next_retry_at=2026-05-06T16:39:41Z` (exactly +6h)
- `updated_at=2026-05-06T10:39:41Z`

Customer effect: POST /v1/do calls to `danish-company-data` now return HTTP 503 `capability_unavailable` with `next_retry_at` until 16:39 UTC, at which point the breaker auto-transitions to `half_open` on the next call. The half_open call's outcome decides whether the breaker closes (DK recovered) or re-opens with backoff.

# Retry result that triggered the apply

Re-invoked with A.P. Møller-Mærsk A/S CVR 22756214 at 2026-05-06T10:08:42Z:
- `kind: error`, `latency_ms: 221`, `message: "The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours."`

Same error string as the audit yesterday. Fast-fail (no 5xx, no timeout) — the upstream is genuinely returning the quota-exceeded JSON body.

# Two rule-vs-prompt halts during execution

Worth flagging because both reflect doctrine the prompt assumed but the codebase no longer matches:

1. **Substrate mismatch — `source_health` does not exist.** The prompt's action (b) called for `UPDATE source_health SET status='degraded'`. The actual table is `capability_health` (circuit-breaker shape with states `closed | open | half_open`). `source_health` is queued for PR2+ of the SQS-engine cleanup per `apps/api/src/lib/lifecycle.ts:148` and `apps/api/src/jobs/invariant-checker.ts:78`. Resolved by switching to the live circuit-breaker substrate (option α).

2. **Deploy-mechanism mismatch — `drizzle-kit migrate` is not the live path.** The prompt's deploy step said `railway run npx drizzle-kit migrate` per "Rule 8 standard workflow." But `_journal.json` stops at idx 60 (`0060_marketplace_eligible`); the live path for hand-written migrations is `runStartupMigrations()` in `apps/api/src/lib/startup-migrations.ts` (the `BLOCKS` array). drizzle-kit-migrate would have been a no-op for any new hand-written file and the verification SELECT would have come back unchanged — exactly the Rule 14 (DEC-20260504-C) failure mode. Resolved by Path B (direct UPDATE), since this is operational data not schema.

# Non-obvious learnings

- **psql is not installed locally.** `railway run psql ...` fails with "command not found." Workaround used: `railway ssh --service strale -- 'echo <b64> | base64 -d > /app/_dk_breaker.mjs && cd /app && node _dk_breaker.mjs'`. The `cd /app` is load-bearing — Node ESM resolution from `/tmp` doesn't traverse to `/app/node_modules`, so `import postgres from "postgres"` fails. Future ad-hoc DB writes from local should follow the same pattern, or install `psql`.
- **`railway connect Postgres` invokes local psql** — same problem. The Railway internal hostname `postgres.railway.internal` doesn't resolve from outside the Railway network, so `railway run` (which runs locally with env injected) can't reach the DB either. Effective options from local: ssh into a Railway service, install psql locally, or expose a TCP proxy.
- **Stdin pipe to `railway ssh -- 'cat > file'` hangs silently.** The base64 inline approach worked; heredoc-piped stdin did not.
- **The breaker's auto-recovery is the right shape for a quota issue.** No follow-up cron needed — at 16:39 UTC the next customer call to DK transitions to `half_open` and decides closed-vs-reopened organically. If the underlying CVR quota window has reset, DK comes back automatically.

# What's open

## Phase 2 (Understand) — handed to Claude chat for Notion governance

Per the prompt's closing instruction: Petter / Claude chat handle the Notion governance writes:
- DEC-20260506-D — `danish-company-data` breaker manually opened pending Phase 2; mechanism choice (psql/path B) noted as carve-out from drizzle-kit/path A.
- Active Vendor Stack page — DK status update (live → degraded/breaker-open).
- Phase 2 To-do — "Characterize CVR API rate limit and design Phase 3 harden approach."
- Journal course-correction entry — flag that the prompt referenced `source_health` and `drizzle-kit migrate` while the live substrate is `capability_health` and `runStartupMigrations()`. Worth a memo so the next prompt's audit phase catches it earlier.

## Code follow-ups (none scheduled)

Phase 2 design (rate-limit characterization) and Phase 3 harden (e.g. local rate-limit tracking, fallback provider, datacvr.virk.dk migration per the comment at `apps/api/src/capabilities/danish-company-data.ts:6-9`) are deferred to follow-up prompts. The Phase 1 prompt only authorized Contain.

## Session close-check finding

`session-close-check.ts` reports 1 red — `danish-company-data` breaker opened this session. **This is the deliberate containment, not a hidden regression.** The script doesn't distinguish "breaker tripped by user traffic" from "breaker manually opened by operator." Future-self reading this: don't panic.

# Cost

- One Anthropic API call (Haiku 4.5) inside the DK retry, ≈€0.0001.
- One UPDATE on `capability_health`. No deploy, no rebuild.
