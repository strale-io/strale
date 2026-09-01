Intent: Resolve the historical `DEC-20260502-A` identity collision without
rewriting either source decision or activating repo-native decision authority.

## Outcome

- Merged PR #457 as `3e25ddd0`. The active x402 one-price / one-EUR_USD_RATE
  decision is now a formal record with a source-qualified key.
- Preserved the superseded Counterparty Assurance product-narrowing row as
  `documented_only` history with its original identity and rationale intact.
- Bound the resolution to a tracked, immutable, machine-checked evidence report.
  Validation rejects missing, changed, untracked, non-file, symlink, and
  out-of-archive evidence.
- Added an explicit generated migration-state correction for protected decision
  `DEC-20260812-A` without editing that decision.
- Added an above-€1 x402 regression test confirming the active decision's
  no-discount/no-cap rule. No live payment implementation changed.
- Exactly one collision is resolved; the other 34 remain unresolved.
  Repo-native authority remains `none` and inactive.

## Review and verification

Product and technical reviews passed with no high/medium findings. Claude Opus
and Sonnet were attempted first and both timed out; the founder-authorized Codex
fallback independently passed exact commit `517e5a0e`. Local verification passed
54 context tests, 7 focused x402 tests, context consistency, MCP build, API
typecheck, and diff hygiene. GitHub's repository and disposable-database CI jobs
both passed before merge. All verification sessions completed after their
verdicts.

## Open

- The active x402 rule is exact in charging and the JSON catalog, but legacy
  manifest output rounds USD to two decimals and OpenAPI output to three. This
  is recorded as `implementation_status: drift-open`; fix and independently
  verify it as a separate money-path change.
- Continue the collision-resolution queue one historical ID at a time. Do not
  activate M2 authority while any of the other 34 IDs remain unresolved.
- Claude cross-provider review remains in the existing verification backlog and
  is required before the later M4 authority transition.

## Non-obvious learnings

- A collision-resolution report must be source-row-bound, correction-bound,
  tracked, immutable after resolution, and physically contained under
  `archive/sessions`; a path-prefix check alone is insufficient on Windows
  because junctions and symlinks can escape the archive.
- Migration-state corrections belong to the collision that requires them;
  making a non-empty correction list a global rule would incorrectly constrain
  future unrelated resolutions.

## Cost

No metered API spend. Work used subscription-included Codex verification after
the Claude subscription routes timed out.

Journal record:
https://app.notion.com/p/3ce67c87082c81378982f88d4224130b?pvs=204
