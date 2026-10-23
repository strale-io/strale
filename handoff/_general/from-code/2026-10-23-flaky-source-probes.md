Intent: find why USGS, sudreg, VIES, HN search, NVD and arXiv flap in the Health Monitor, and fix what is ours.

# Flaky outside sources — probes gave up sooner than the tools

**Date:** 2026-10-23 · **Branch:** `claude/probe-timeouts-match-tools` · **PR:** draft, not merged.

## Findings (production, read-only, 7–30 days to 2026-10-23)

- Failures are independent per source: in 815 of 830 failing minutes only one
  source failed. Not a Strale network or event-loop problem.
- Nearly every probe in `dependency-manifest.ts` has a shorter timeout than
  the tool it guards. For the flaky ones the failures are almost all
  timeouts at exactly the probe's limit:

| Source | Probe → tool timeout | Probe failures (7d) | Real-call failures (30d, refusals excluded) |
|---|---|---|---|
| USGS | 6s → 12s | 670 (~10%) | 6 of 1,384 |
| VIES | 5s → 15s | 65 (45 "fetch failed", 20 timeout) | refusals only |
| sudreg | 5s → 10s | 49 | 4 of 67 |
| NVD | 15s → 20s | 28 (20 × HTTP 503) | 0 |
| HN search | 5s → 8s | 19 | 0 of 58 |
| arXiv | 8s → 15s | 8 | 10 of 58 (timeouts at 15s) |

- Probes never read their response body, which keeps the connection checked
  out until garbage collection, on ~1,000 probes/day/source.

## Fix

- Probe timeouts for USGS, HN, sudreg, VIES and arXiv raised to their tool's
  own timeout. The worst-case probe cycle is unchanged: NVD's 15s was already
  the longest, and probes run in parallel.
- `dependency-health.ts` cancels the probe body (logged on failure).
- Tests: `dependency-manifest-probes.test.ts` reads each tool's
  `AbortSignal.timeout` from its source file, and
  `dependency-health.probe-body.test.ts` covers the body release. 7 of the 9
  fail against `origin/main`.

## Not fixed (real upstream behaviour, or a decision)

- **arXiv search** genuinely times out on ~17% of real calls at 15s. The
  arXiv export API is slow, and it asks clients to send at most one request
  every 3s. Options: a longer tool timeout (the sync path caps at 15s), or
  fewer probes. Not changed here.
- **USGS** has real slow spells: the 3 real calls that fell inside probe
  failure windows mostly failed too, at 12s. The longer probe will flap less,
  but not zero.
- **VIES** "fetch failed" and **NVD** HTTP 503 are upstream refusals; left as is.
- **Probe cadence:** `runDependencyHealthChecks()` runs on every test-scheduler
  poll (~1,000 times/day/source), not the "~4×/day" its header claims. Reducing
  that would further cut load on free public APIs and false flaps. Separate change.
- After deploy, verify by re-running the per-source failure query on
  `health_monitor_events` (`dependency_probe`, `healthy=false`) for a week.
