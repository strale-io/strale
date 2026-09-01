---
doc_type: session-plan
authority_scope: none
status: agreed
complete: true
phase: M2
authority_active: false
created_at: 2026-09-01
owners:
  - codex
reviewed_by:
  - codex-gpt-5.6-sol
review_meaning: technical-migration-review-not-founder-approval
preferred_cross_provider_review: claude-opus-then-sonnet-timed-out
---

# Resolve the `DEC-20260502-A` historical ID collision

> [!CAUTION]
> **M2 TECHNICAL MIGRATION PLAN — NOT A NEW PRODUCT DECISION OR ACTIVE
> PROJECT AUTHORITY.**
> This plan preserves and disambiguates decisions already made in Notion. It
> does not change product policy, activate the repo-native register, or grant
> authority beyond the existing `AGENTS.md`, `CLAUDE.md`, and Notion workflow.

## Outcome

Resolve the first production historical-ID collision without inventing an ID,
rewriting a protected record, silently choosing a meaning, or losing the still
active x402 pricing rule.

The resolved state will contain one source-qualified formal record for the
active x402 pricing decision and one evidence-backed documented-only row for
the superseded Counterparty Assurance decision. The resolution and its
migration-time correction will be visible from the generated decision index.

## Source findings

Two Notion Decision rows use the display ID `DEC-20260502-A`:

1. [Counterparty Assurance product narrowing and rename](https://app.notion.com/p/35467c87082c81ca99efdca389eb77b9),
   historically `superseded`. Its source relation identifies
   `DEC-20260812-A` as the superseding readiness decision. The protected
   readiness record already preserves the material product retirement.
2. [x402 catalog-price parity](https://app.notion.com/p/35467c87082c8124bcc5e2c2597c76c6),
   historically `active`. It requires x402 to derive USDC pricing from the
   canonical EUR catalog price through one `EUR_USD_RATE`, with no separate
   channel tier, discount, or cap.

Repository inspection confirms that the charging conversion and JSON catalog
still derive from the canonical EUR price in
`apps/api/src/lib/x402-gateway.ts` and
`apps/api/src/routes/x402-gateway-v2.ts`. It also found implementation drift:
the legacy well-known manifest rounds the value to two decimals and OpenAPI
rounds to three, so those public representations can differ from the exact
six-decimal charge. The current schema has simplified away the historical
cached USD columns. Neither implementation change alters the active doctrine,
but the formal record and resolution report must describe compliance as
partial rather than claiming that every surface is exact.

## Representation decision

### Superseded product row: documented only

Set the product row to `documented_only` with a rationale that names
`DEC-20260812-A` and this resolution report. Do not create a formal record for
it.

This is not deletion: its immutable title, source page, status, and rationale
remain in the collision registry, and the later readiness record preserves its
substance and retirement. Importing it as a formal `superseded` record would
require an incoming `supersedes` edge. Adding that edge to the already active
and protected `DEC-20260812-A` record is forbidden, while inventing a new
decision solely to carry the edge would falsify history.

### Active pricing row: formal record

Create the source-qualified formal record:

`DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`

The display `id` remains `DEC-20260502-A`; the title and status exactly match
the Notion row. The protected body will preserve the durable doctrine and
distinguish it from implementation details that later changed. Evidence will
include the Notion source and the two live runtime paths. Its consequences will
distinguish the exact charging/catalog paths from the open public-surface
rounding drift.

### Protected readiness prose: forward-only correction

Do not edit `docs/decisions/records/DEC-20260812-A.md`. Its consequence section
accurately records why both meanings were withheld when the initial M2 graph
was authored, but it is not a mutable migration-status field.

Instead, land the registry transition, formal record, resolution report, and
generated index in one commit. The report will explicitly state that the old
“both withheld” sentence describes the prior migration state, and the generated
index will expose the current resolved state and evidence. This preserves the
historical record while preventing future sessions from treating the old
sentence as current registry status.

## Resolution-evidence contract

Before the first production collision is marked resolved, strengthen the
repository validator so `resolution_evidence` cannot be a decorative or broken
path.

For every resolved collision:

- the path must be a contained repository-relative Markdown file under
  `archive/sessions/`;
- the file must exist and have front matter declaring
  `doc_type: decision-collision-resolution`, the matching `collision_id`,
  `resolution_status: resolved`, `complete: true`, `authority_scope: none`,
  and `authority_active: false`;
- its front matter must machine-bind every immutable source page ID to the
  registry disposition and, for a formal row, the exact record key;
- it must declare `corrects_migration_state_in: [DEC-20260812-A]` and
  `implementation_status: drift-open`, so neither the forward correction nor
  the x402 verification state can be omitted from generated views;
- unresolved collisions continue to require null evidence;
- the merge-base guard must compare the complete referenced report bytes after
  resolution, in addition to protecting the registry path and dispositions.
  Later edits or removal of that report fail closed.

The evidence report will cite both Notion pages, `DEC-20260812-A`, and the live
x402 paths; state the chosen disposition for every source row; explain rejected
alternatives; record the public-surface rounding drift; and record verification
results.

## Generated discoverability

Extend `docs/project/DECISIONS.md` generation with a resolved-collision table
showing:

- historical display ID;
- formal record keys;
- documented-only source count;
- resolution-evidence link;
- implementation status;
- an explicit generated correction naming `DEC-20260812-A` and stating that
  its “both withheld” sentence describes the prior M2 migration state, while
  its product and operating substance remains unchanged.

The existing unresolved table remains unchanged. Bare collided IDs remain
invalid relationship targets after resolution.

## Rejected alternatives

- **Import both rows formally:** rejected because the superseded product row
  cannot obtain its required historical incoming edge without mutating the
  protected readiness record or inventing a decision.
- **Keep both rows documented-only:** rejected because it would omit a global,
  still-active rule that current runtime code explicitly references.
- **Rewrite `DEC-20260812-A`:** rejected by active-record immutability and the
  forward-only decision model.
- **Assign either row a replacement historical ID:** rejected because the
  duplicate source IDs are historical facts, not migration errors to rename.
- **Leave the collision unresolved indefinitely:** rejected because the identity
  mechanism now represents the active meaning safely and the unresolved state
  keeps useful doctrine out of the formal graph.

## Implementation sequence

1. Add resolution-evidence validation and adversarial tests.
2. Extend the generated index and tests for resolved-collision discoverability.
3. Add the source-qualified active x402 record.
4. Add the complete resolution report.
5. Transition only `DEC-20260502-A` in the collision registry: product row to
   `documented_only`, pricing row to `formal_record`, and collision to
   `resolved` with the report path.
6. Regenerate decision schemas, the decision index, and the legacy-reference
   inventory using repository generators.
7. Run focused tests, full context checks, MCP build, API typecheck, and the
   mandatory `go` review.
8. Obtain an exact-commit independent review. Claude is preferred because
   Codex authors the change; if Claude remains unavailable, use a separate
   high-effort Codex verifier, record the cross-provider backlog, and close the
   verifier immediately after its verdict.

The manifest/OpenAPI rounding defect is recorded as an implementation follow-up
and is not fixed in this commit. Mixing a money-path behavior change into an
irreversible history-resolution commit would broaden review and rollback risk;
the later fix must follow the money-critical-path test protocol and verify
challenge, catalog, well-known, and OpenAPI parity together.

## Required tests

Positive:

- the production registry resolves with one formal and one documented-only row;
- the qualified active record maps bidirectionally to the pricing source;
- the evidence report contract validates;
- the generated index links the qualified record and resolution report;
- current x402 price-conversion tests remain green, including an explicit
  above-€1 no-cap case;
- focused inspection records exact charging/catalog behavior and the known
  well-known/OpenAPI rounding drift without treating it as compliance.

Negative:

- missing, absolute, escaping, non-Markdown, or nonexistent evidence path;
- evidence report with wrong collision ID, incomplete status, or active
  authority;
- evidence report with a missing, extra, or mismatched source-page disposition
  binding;
- later mutation or removal of a resolved evidence report;
- omission of the `DEC-20260812-A` forward-correction binding or the
  `drift-open` implementation status;
- formal mapping to the wrong source-qualified key;
- documented-only row without rationale or with a record key;
- reintroduction of a formal record for the documented-only product row;
- bare `DEC-20260502-A` relationship target after resolution;
- any edit to protected `DEC-20260812-A` content or metadata;
- generated artifacts that differ from generator output.

## Completion boundary

Completion means this one collision is resolved, independently reviewed, and
merged while the repo-native decision layer remains `authority_scope: none`
and `authority_active: false`. The other 34 collisions remain unresolved and
out of the formal graph.
