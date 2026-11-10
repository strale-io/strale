Intent: correct the transaction-access description and inconsistent MCP search pricing/free-tier information found in the focused Claude connector review.

Checkout: `C:/Users/pette/Projects/strale-wt-mcp-clarity`, branch `fix/mcp-search-clarity`, base `d78d064cbb1f72441520b59ef88eb20f35e0f4c4`. Owned files are MCP tools, package README, the new search-contract test and this session's evidence/handoff; no unrelated edits.

The shared search mapper preserves discovery's existing null capability-price policy, emits numeric bundle prices plus formatted/legacy display fields, and makes the free-tier flag explicit on typeahead/category/outage paths. The transaction description now states anonymous redaction and authenticated ownership. Safety annotations, authentication enforcement and billing code are unchanged.

Validation: six new regressions failed against the original implementation, then passed after the fix; all 11 MCP package tests and 37 focused API/MCP transport/trust tests passed. API and MCP typechecks, MCP build, framework-package checks and claims checks passed. Claims check reports an existing warning in the untouched sibling frontend's llms.txt. The dedicated simplify skill was absent from the repository and installed skill locations; the author performed the small simplification pass directly (one shared mapper, no new dependency).

Evidence: `archive/receipts/2026-11-10-test-run-mcp-search-clarity.json`.

Independent reviews: technical and product Codex reviewers in separate contexts both returned GO at `9cdf0955f96b518730d6e9e8d1ab2f69af8e68f2`, round 1, with zero high or medium findings. Wanted Opus/high for final tier-2 verification; its subscription invocation failed at the weekly limit, so the final gate uses the two independent Codex reviews under the founder's 2026-09-07 provider-availability policy. No metered API fallback was used.

PR: https://github.com/strale-io/strale/pull/987. Next action at checkpoint: follow required CI and merge-queue checks, then verify ordinary/category search parity and the transaction description on the hosted connector. Final delivery status belongs in the PR and the append-only session Journal. No package release or directory submission is part of this change. No paid production call is needed to verify it.
