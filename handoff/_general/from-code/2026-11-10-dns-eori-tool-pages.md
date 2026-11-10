Intent: Help first-time search visitors understand and use DNS Lookup and EORI Validation, with accurate examples and a clear next step.

## Scope and authority

Petter requested copy, examples and next steps for these two pages, tested before publication. Quick mode, website content only. No executor, manifest, billing, authentication or social-post changes. Shared main and unrelated worktrees were left alone.

Checkout: `C:/Users/pette/Projects/strale-wt-tool-pages`, branch `fix/dns-eori-tool-pages`, base `c1c335614d804f33eaf02340e79a2c54ee37fdb9`. Reviewed source commit: `8be44c18ca7a0eec840910b7bbac692a6d770207`. Owned files are the tool-page template, editorial content module, optional output-table display corrections, and two test files. Later commits in this batch contain delivery records only.

## Changes

- Search-specific titles/descriptions and task-focused introductions. Canonical tool names and runtime prices/eligibility still come from the catalogue.
- DNS: short, explicitly partial real output; prominent no-key trial anchor; practical DNS/email uses and a Python guide.
- EORI: paired valid EU example dated 10 November 2026; valid/invalid/unavailable interpretation; nullable and omitted trader-name wording; current price and selected-tool signup path. It does not promise customs compliance.
- Signup actions preserve the chosen tool using the existing helper. No new automatic calls or key handling.

## Verification and review

Machine-readable evidence: [verification receipt](../../../archive/receipts/2026-11-10-check-dns-eori-tool-pages.json). This includes test totals, initial checkout/setup failures and successful reruns, exact source hashes, actual example provenance, and review verdicts.

Both independent Codex sol/high reviewers returned GO at the exact source commit above after two rounds. The product review identified a pre-existing EORI table mismatch; the displayed nullable type and invalid-format omission were corrected and tested. Canonical API metadata was not changed in this website-only batch.

The repository go workflow was followed. The named simplify skill was absent from available skill locations; a manual simplification pass kept the change to a small typed editorial map and optional display overrides.

Manual Chrome verification: DNS trial anchor reaches the form; the existing production form completes a free request; EORI's new signup action reaches `/signup?tool=eori-validate` with the expected continuation text. Registration success/return, attribution preservation and no key storage were tested with mocked registration, not by creating another real account. No authenticated paid-call or OAuth verification is claimed.

The first full live-data build passed. A second full live-data build validates the final table correction before merge. Final build, PR/merge, production status and screenshots are recorded in `C:/Users/pette/OneDrive/Dokument/ChatGPT/Strale/outputs/tool-pages-nov10/delivery.json`. Do not infer a deployment from this implementation handoff alone; read that receipt and GitHub PR status.

## Design reference lock

Existing adopted Open Flow is the primary reference: preserve typography, spacing tokens, palette, code blocks and button roles. Refero quickstart screens informed concise prerequisites and trial/code actions only: [OpenAI quickstart](https://refero.design/pages/ad593840-9bb6-4d7f-b1fc-a62daf54b475), [Parallel Search quickstart](https://refero.design/pages/e0989ae3-163b-452d-92dd-2ffc9987f3e2). No new visual system or image assets.

## Delivery and next action

Merge only with required CI green and final live build passing, then verify both live pages and the DNS free trial. Preserve the local evidence outside the temporary worktree before cleanup. Journal entry records the session separately. After delivery, compare search impressions, clicks and successful tool calls; ranking changes are not guaranteed by this release.
