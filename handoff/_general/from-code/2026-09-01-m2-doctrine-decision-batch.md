Intent: Continue the inactive M2 formal decision migration with the active
sourcing and regulatory-engineering doctrine, without activating repo authority
or silently resolving a policy conflict.

## Outcome

- Added collision-free candidates for `DEC-20260428-A`, `DEC-20260428-B`,
  `DEC-20260518-F`, and `DEC-20260813-A`.
- Included `DEC-20260518-F` as a required graph dependency of the later
  affirmation rather than leaving an invented or missing target.
- Preserved exact vendor-contract, dataset-integrity, dispute, canary, SLO,
  privacy, retention, per-call parsing, publication, and prohibited-target
  controls after an initial source review found over-compression.
- Preserved the unresolved overlap between five-year match-result retention and
  the later ninety-day content-redaction rule; this batch does not adjudicate it.
- Regenerated the inactive decision index and inverse relations.

## Review and verification

The first source and graph reviews of `b5d45b5f` returned FAIL on source
fidelity. After correction, separate exact-head reviews of `88338518` both
returned PASS. All four verification tasks were archived immediately after
their verdicts, and no matching task remained open.

`npm run context:test` passes 43/43, `npm run context:check -- --json` reports
zero findings, `git diff --check` passes, and the generated index is
deterministic. Full evidence:
`archive/sessions/2026-09-01-m2-doctrine-decision-review-codex.md`.

Claude Code was reachable, but wanted Opus/high effort and fell to Sonnet/high
effort after a real timeout; both review invocations timed out without a
verdict. The batch is recorded in
`archive/sessions/2026-09-01-m2-claude-verification-backlog.md`.

## Boundary and next step

All candidates remain `authority_scope: none` and `authority_active: false`.
Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authority.
Merge only as inactive M2 work. Continue with bounded collision reconciliation;
M4 remains blocked until unresolved IDs, the retention/redaction interpretation,
and the cross-provider backlog are resolved.
