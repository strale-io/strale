# M2 operator actions and pending-founder candidates

## Outcome

Created inactive repo-native candidates for the operator-action registry and
pending founder decisions. No entrypoint, authority, or Notion cutover occurred.

The #438 action remains `prepared`, `approval_required`, unexecuted, and
unreconciled. Its executable now requires an exact founder grant and its global
digest guard captures the expected state before writing. No production write
was attempted.

## Founder-facing result

No decision is ready for Petter today. Public-domain migration and the WP14
supplier/customer/public-commitment package remain visible, but evidence and
bounded decision briefs must be prepared by Codex/Claude first.

## Controls added

- Draft 2020-12 schema applied to the YAML, not merely published beside it.
- Closed authority, status, target, evidence, and founder-reserved vocabularies.
- Immutable commit/path binding to the prepared executable and exact authority
  purpose/current/desired values.
- Fail-closed Git history checks for deletion, regression, evidence mutation,
  and blocker movement.
- Contained typed JSON evidence with lifecycle timestamp binding.
- Roadmap acceptance markers that remain blocked until reconciliation.
- Broad pre-cutover entrypoint guard for both project and decision candidates.

## Verification

- Context tests: 22/22.
- Context checker: zero findings.
- API TypeScript check: passed.
- Product review: PASS after plain-language corrections.
- Technical review: PASS after authority and lifecycle corrections.
- Exact-head separate Codex review: pending before merge.
- Claude review: queued before M4 because Claude was unavailable.

## Session record

Notion Journal:
https://app.notion.com/p/3ce67c87082c81fb8fdaecb7f7ecbc1f?pvs=204

## Next

Complete exact-head review and merge this batch. Then continue M2 with formal
decision migration in small topic batches; do not activate candidates or start
the M4 cutover.
