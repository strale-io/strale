Intent: give vasp-verify and vasp-non-compliant-check a routing latency so readiness passes after the ESMA fix (PR #943, #944).

The backfill after #944 still reported "Missing avg_latency_ms": the column is db-canonical, so the manifest value never reaches it, and the fix-latency admin endpoint needs the admin secret plus 20 completed executions. Startup-migration block 0145 fills a NULL with 1,200 ms (latency-estimate.ts records a measured p95 of 1,146 ms for vasp-verify). After deploy, rerun the onboarding backfill for both slugs and record readiness.
