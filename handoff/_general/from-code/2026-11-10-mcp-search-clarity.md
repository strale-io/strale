Intent: correct the transaction-access description and inconsistent MCP search pricing/free-tier information found in the focused Claude connector review.

Checkout: `C:/Users/pette/Projects/strale-wt-mcp-clarity`, branch `fix/mcp-search-clarity`, base `d78d064cbb1f72441520b59ef88eb20f35e0f4c4`. Owned files are MCP tools, package README, the new search-contract test and this session's evidence/handoff; no unrelated edits.

The shared search mapper preserves discovery's existing null capability-price policy, emits numeric bundle prices plus formatted/legacy display fields, and makes the free-tier flag explicit on typeahead/category/outage paths. The transaction description now states anonymous redaction and authenticated ownership. Safety annotations, authentication enforcement and billing code are unchanged.

Validation: six new regressions failed against the original implementation, then passed after the fix; all 11 MCP package tests and 37 focused API/MCP transport/trust tests passed. API and MCP typechecks, MCP build, framework-package checks and claims checks passed. Claims check reports an existing warning in the untouched sibling frontend's llms.txt. The dedicated simplify skill was absent from the repository and installed skill locations; the author performed the small simplification pass directly (one shared mapper, no new dependency).

Evidence: `archive/receipts/2026-11-10-test-run-mcp-search-clarity.json`.

Next action: complete independent technical and product reviews, open the PR, follow its required checks, and verify the hosted connector after delivery. No package release or directory submission is part of this change. No paid production call is needed to verify it.
