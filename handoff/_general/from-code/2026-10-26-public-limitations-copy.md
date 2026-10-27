Intent: Rewrite public capability limitations while preserving every stated constraint; orchestrator review, push, PR, merge and database backfill remain.

Changed 558 entries across 307 manifests after scanning all 750 entries. Only existing limitation title/text/workaround values changed. Descriptions are unchanged; proposed rewrites and all uncertainties are in [the report](../../../archive/sessions/2026-10-26-public-limitations-copy.md).

Required manifest checks and the manifest-loading Vitest suite pass. MCP build and API typecheck pass. Independent review completed in two rounds; findings and the final C2PA nit are fixed. Extra design:check fails on a pre-existing stale generated design manifest. Onboarding dry-run is blocked by absent production authority; no readiness or live-copy claim is made.

Production serves limitations from the database. The orchestrator must backfill the reviewed manifest changes before the site/API show them; the report includes the command. No production writes, pushes, PRs, merges or package publication were performed. Generated indexes are excluded under the explicit batch scope; integration must regenerate them. The no-push instruction prevents satisfying the session gate’s upstream requirement.

The manual pre-commit check reports generated context-inventory drift for this new handoff. Regenerate indexes and context inventory in the orchestrator’s integration batch; these generated files are excluded here by the requested scope.
