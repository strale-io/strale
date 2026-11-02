Intent: Rewrite public tool descriptions against their executors and apply listed copy on deploy through a guarded description-only migration.

Branch: `docs/public-descriptions-copy`, based on `10f71df8`. Local build agent only; pushing, PR creation, merging and deployment belong to the orchestrator.

Changed: 124 manifest descriptions (72 in the earlier report table, 52 additional); block 0124 with frozen live guards for 75 listed tools and copy-only fixtures for 49 unlisted tools. No names, limitations, prices, schemas, executors or flags changed. The block never moves updated_at. Opening-study source hashes and browser evidence regenerated.

Report: `archive/sessions/2026-10-27-public-descriptions-copy.md` contains before/after copy, source facts, coverage contradictions, live snapshot hash and production checks. Charity Scottish fallback and price-compare country limits remain separate limitation/schema issues. No production writes or settings changes occurred.

Verification: all root CI checks pass, with the workflow-defined warning for stale generated archive/handoff indexes. The opening browser verifier passed. Safe mutation evidence is `archive/receipts/2026-10-27-test-run-public-descriptions-mutations.json`. Exact-code independent review: GO at `80d289e8`, rounds: 2. The final full API suite passes; API typecheck also passes. Complete command ledger and test evidence: `archive/receipts/2026-10-27-test-run-public-descriptions-copy.json`. DB-backed readiness/smoke and real-Postgres tests need the orchestrator's authorised environment; no credentials were sought.

Next: orchestrator reviews local commits, runs the disposable-Postgres CI lane, pushes/opens/merges and deploys; then compares public descriptions against the frozen targets and queries ledger key `0124_publicDescriptions`. Never reactivate or broadly backfill an unlisted tool to make copy visible.

Local commit delivery: this environment mounts the original Git metadata read-only. Local commits are stored in writable scratch metadata and supplied as a portable Git bundle. The original checkout remains dirty from that repository's perspective; the bundle commit is clean. No branches were switched and nothing was pushed. The clone-level handoff gate also reports its no-upstream/layout/existing remote-branch findings; resolving those would exceed the orchestrator's local-only author instructions.
