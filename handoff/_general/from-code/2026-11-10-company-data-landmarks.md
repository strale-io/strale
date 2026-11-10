Intent: Fix Company Data's duplicate landmark names and verify accessibility before publishing.

Petter explicitly requested this follow-up to the existing accessibility warning found during the DNS/EORI release. Quick mode, one-line semantic correction; no visual redesign, catalogue changes, backend changes or unrelated work.

## Root cause and correction

The `#bundled` section is named by its visible heading, “Bundled checks by country”. Its nested keyboard-focusable table region previously had the identical accessible name. Axe reported `landmark-unique` whenever live catalogue data made that table appear. Preview data has no bundles and cannot exercise this branch.

The table region is now named “Bundled checks table”. The outer heading/name, `role="region"`, `tabindex="0"`, table semantics, IDs and styles remain unchanged. Existing accessibility scans cover the actual failure; no implementation-mirroring test was added.

## Source and evidence

Isolated checkout: `C:/Users/pette/Projects/strale-wt-company-a11y`, branch `fix/company-data-landmarks`, base `eb2b62d040f89577ed9d954facf26a2cfa59f3cd`. Reviewed source commit: `bcffb38498342603d57d88fe7f15435ad150b7b8`. Only the Company Data Astro page changed in that source commit. Later commits carry records only; unrelated worktrees were untouched.

Before/after results and verification counts: [accessibility receipt](../../../archive/receipts/2026-11-10-check-company-data-landmarks.json). The before scan uses the saved live build from the previous release, and the after scan uses a fresh full live-data build. Both render the bundled-check table.

Separate technical and product Codex sol/high contexts returned clean verdicts at the exact source commit above. The repository go workflow applies; the unavailable simplify skill was replaced by a manual simplification check of this one-line change. Local Windows checkout line endings were normalized for existing LF-sensitive tests without introducing unrelated diffs.

## Delivery

Required PR and merge-queue checks must pass before publication. Final CI, merge, deployment, live accessible-name and keyboard-focus observations are recorded in `C:/Users/pette/OneDrive/Dokument/ChatGPT/Strale/outputs/company-data-a11y-nov10/delivery.json`. Read that record and GitHub status for delivery state; this implementation handoff alone does not claim deployment. A Journal entry records the completed session.

After verification, preserve evidence outside the temporary checkout, remove this batch worktree and merged branch, leave main clean and run the handoff gate. No further product work is part of this batch.
