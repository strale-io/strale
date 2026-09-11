---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Test Infrastructure Cost Principles (always enforce)"
---

# Test Infrastructure Cost Principles (always enforce)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and protocol router can reference a
> full-body path (T6 M3 batch 7). It carries no authority of its own and must
> never be edited on its own: any change belongs in `CLAUDE.md` first, then
> re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Test Infrastructure Cost Principles (always enforce)

**Principle A — Zero-cost health probes:** Health probes in `dependency-manifest.ts` must
never consume billable API calls. Use `skipAuth: true` on the health probe for paid APIs
so the probe sends no auth header — a 401 proves connectivity without consuming quota.
Probes run ~4×/day per provider; authenticated probes waste 120+ API calls/month.

**Principle B — Input validation before paid APIs:** Every capability that calls a paid
external API must validate input and throw an error for empty, null, or sub-2-character
input BEFORE making the API call. This protects both test budget and customer-traffic budget.

**Principle C — Piggyback suites never scheduled:** Piggyback test suites (`test_type = 'piggyback'`)
receive data exclusively from real customer traffic via `recordPiggybackResult()`. The test
scheduler excludes them from all runs (test-runner.ts line 117). They are never executed proactively.
<!-- END VERBATIM FROM CLAUDE.md -->
