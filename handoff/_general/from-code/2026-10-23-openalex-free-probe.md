Intent: find why OpenAlex failed its health probe ~21 h/day and fix it.

# OpenAlex probe spent OpenAlex's daily budget

**Date:** 2026-10-23 · **Branch:** `claude/openalex-free-probe` · **PR:** draft, not merged.

## Root cause

OpenAlex now meters keyless API calls against a daily budget of **$0.10 shared
by everyone on the caller's IP** (response headers `X-RateLimit-*`, and the
`meta.notice` in every keyless response). Costs checked 2026-10-23: search
$0.001, filtered list $0.0001, single-record `/works/{id}` and `/` $0.

The `openalex` health probe in `apps/api/src/lib/dependency-manifest.ts` was a
search. The test scheduler runs `runDependencyHealthChecks()` on every poll, so
the probe ran ~1,000 times a day, spent the budget in ~100 calls (by ~02:15
UTC), and OpenAlex answered HTTP 429 to the probe **and to every capability
call** for the rest of the day. Production probe rows, 7 days: 5,964 × "HTTP
429", ~100 healthy each day, all between 00:00 and ~02:30 UTC.

Side effects: the scheduler skipped OpenAlex-backed tests ~21 h/day, and the
Health Monitor reported OpenAlex down daily. No external customer called the
OpenAlex tools in the last 30 days.

## Fix

- Probe `/works/W2144093431?select=id&mailto=…` ($0, still reaches the live
  works database; Cloudflare reports `DYNAMIC`, so it is not served from cache).
- Add `citation-graph` (which calls `api.openalex.org`) to the provider's
  `capabilities`.
- Regression tests in `dependency-manifest-probes.test.ts`; both fail against
  `origin/main`'s manifest.

## Not done / for Petter

- A free OpenAlex API key gives a separate $1/day budget (10× the keyless one).
  Getting one means registering an email with OpenAlex, which is Petter's call.
  Not needed at current traffic once the probe stops spending the budget.
- Other flaky sources in the daily summary (USGS, sudreg, VIES, hn-algolia) fail
  with timeouts, not quotas — a different issue.
- The probe cadence (every scheduler poll, ~1,000/day per provider) is far above
  the "~4×/day" that `dependency-health.ts` documents; worth revisiting for all
  free public APIs.
