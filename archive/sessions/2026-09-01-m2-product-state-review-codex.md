---
doc_type: review-report
authority_scope: none
status: interim-same-provider
reviewed_at: 2026-09-01
reviewer: separate-codex-session
---

# M2 product/state reconciliation — interim Codex review

## Independence limitation

This review was performed by a separate high-effort Codex session after Claude
Opus and Sonnet review invocations returned no verdict. It is an interim safety
review, not a substitute disguised as cross-provider approval. The outstanding
Claude work is recorded in
`2026-09-01-m2-claude-verification-backlog.md`.

## First pass — FAIL

The first pass found one high and several medium issues:

- **High:** the report promoted Quiet Material v0.7 as branch authority even
  though `9989647` preserves v0.5 and v0.7 exists only in a dirty working tree.
- Frontend state used “implemented/built” without build verification and
  attributed Use Cases to newer working-tree work even though it is already in
  the preservation commit.
- WP10 production evidence was not stored with exact bounded queries/results,
  and an application-log absence was incorrectly inferred from a database
  event table.
- WP17 attribution and operator-action lifecycle were conflated.
- The #438 script's global unrelated-row digest check was found ineffective:
  its expected value is computed from the already-current table.
- Material product, commercial, production-authority, distribution, and
  accepted-program claim classes were missing.
- Two status classifications and several evidence references were too weak or
  non-resolvable.

## Corrections

- Split Quiet Material into selected direction, durable v0.5 preservation, and
  uncommitted v0.7 candidate.
- Replaced ambiguous frontend state with source-present / committed / pushed /
  unreviewed / unmerged / not build-verified / undeployed / non-live.
- Added exact sanitized WP10 query/results with time bounds and explicit limits.
- Kept WP10 formally under observation pending a separate acceptance review
  using the correct application-log source.
- Split WP17 executed-change attribution from `operator-actions.yaml` lifecycle.
- Recorded the #438 digest defect and required an independent post-write
  reconciliation before the action can be called reconciled.
- Expanded the matrix from 28 to 37 claims.
- Corrected status taxonomy and replaced weak evidence with exact sources.

## Closing pass — PASS_WITH_FOLLOWUPS

The closing pass found no remaining high blocker. It found three medium citation
follow-ups:

1. replace a nonexistent `routes/x402.ts` reference;
2. replace a non-resolvable “canonical-code authority patterns” phrase;
3. preserve the exact #438 read-only query and result.

All three were corrected before merge:

- x402 now cites `apps/api/src/routes/x402-gateway-v2.ts`;
- the authority principle cites exact routing, refusal, and platform-facts
  sources;
- `2026-09-01-routing-latency-production-evidence.json` stores the exact query,
  result, interpretation, and limitations.

## Safety answer

Safe to merge as evidence-only, non-authoritative audit material. It must not
activate the M1 skeleton, claim independent-provider approval, or serve as the
sole approval for the first canonical product/state batch. That exact batch and
all 37 claims remain on the Claude verification backlog.
