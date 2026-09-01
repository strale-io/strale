---
doc_type: review-report
authority_scope: none
status: interim-same-provider
reviewed_at: 2026-09-01
reviewer: separate-codex-sessions
final_reviewed_commit: 88338518ca7873c1b5d64755df2b7554200df8f5
---

# M2 sourcing-doctrine decisions — interim Codex review

## Independence boundary

Claude Code's subscription was reachable, but neither full review invocation
returned a verdict. Wanted Opus/high effort and fell to Sonnet/high effort after
the Opus invocation timed out; Sonnet then timed out as well. Both invocations
were terminated by the bounded 124-second command timeout without output.

Per founder instruction, separate Codex tasks performed interim review. This is
same-provider evidence and does not clear the cross-provider gate required
before M4 activation.

## Scope

The batch adds inactive formal candidates for:

- `DEC-20260428-A` — three-tier third-party scraping doctrine;
- `DEC-20260428-B` — engineering bar for Strale-built regulatory data services;
- `DEC-20260518-F` — constrained per-call public-registry parsing; and
- `DEC-20260813-A` — affirmation of that interpretation.

All four IDs are absent from the unresolved collision registry. The dependency
record `DEC-20260518-F` is included because `DEC-20260813-A` formally affirms it;
omitting it would create a missing relation target.

## Review sequence

| Commit | Verification task | Verdict | Result |
|---|---|---|---|
| `b5d45b5f` | `01a05bee-ad92-7851-8ffd-0a769169e82b` | FAIL | Found compressed contractual, engineering, privacy, retention, operating, publication, and named-exclusion controls. |
| `b5d45b5f` | `01a05bee-ad92-7851-8ffd-0a55333d3ddf` | FAIL | Structural graph checks passed, but the same source-fidelity omissions blocked approval. |
| `88338518` | `01a05bf6-7bea-7093-8e4e-ff8edc93e628` | PASS | Exact-head source and authority review found no remaining issue against CLAUDE.md, Charter, research, and all four Notion records. |
| `88338518` | `01a05bf6-8148-70e2-bd73-52375a57c80c` | PASS | Exact-head schema, relation, collision, cycle, authority-boundary, generation, and regression review found no issue. |

Every task was archived immediately after its verdict. No matching verification
task remained open after the final PASS.

## Material correction

The final records preserve the source decisions' operative controls rather than
compressing them into weaker abstractions. In particular, the final
`DEC-20260428-B` candidate states both five-year match-result retention and the
later Charter's ninety-day content-redaction requirement. The sources do not
explain how replayable results are partitioned from redacted call content, so
the record marks this as an unresolved migration-policy overlap instead of
silently choosing an interpretation.

## Verification

- `npm run context:test` — 43/43 pass.
- `npm run context:check -- --json` — zero findings.
- `git diff --check` — pass.
- Generated `docs/project/DECISIONS.md` — byte-for-byte reproducible.
- All relation targets exist, are collision-free, and form no directional cycle.
- All four candidates remain `authority_scope: none` and
  `authority_active: false` with visible inactive banners.

## Ship boundary

Safe to merge only as an explicitly inactive M2 candidate batch. This review
does not activate repo authority, resolve the retention/redaction overlap,
retire Notion, clear the Claude backlog, or authorize M4.
