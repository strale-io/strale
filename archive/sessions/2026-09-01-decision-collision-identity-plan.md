---
doc_type: session-plan
authority_scope: none
status: candidate
complete: true
phase: M2
authority_active: false
created_at: 2026-09-01
owners:
  - codex
reviewed_by:
  - claude-opus
review_meaning: agent-technical-agreement-not-founder-approval
---

# Decision collision identity layer — agreed implementation plan

> [!CAUTION]
> **M2 AGENT-AGREED IMPLEMENTATION PLAN — NOT FOUNDER APPROVAL OR ACTIVE
> PROJECT AUTHORITY.**
> This report records a technical plan agreed by Codex and Claude. Existing
> `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative
> until M4 cutover.

## Outcome

Make the inactive M2 repo-native decision graph capable of representing
multiple legitimate historical decisions that reused the same display ID,
without inventing replacement IDs, silently selecting one meaning, weakening
record immutability, or activating repo-native authority before M4.

This milestone implements and verifies the identity mechanism only. It does
**not** resolve `DEC-20260502-A` or any other collision. Resolution is deferred
because the protected `DEC-20260812-A` record currently states that both
`DEC-20260502-A` rows are withheld. Importing either row without an atomic,
forward-only correction would make that protected record inaccurate.

## Evidence and agreed boundary

Two Notion rows reuse `DEC-20260502-A`:

- `35467c87082c81ca99efdca389eb77b9`: Counterparty Assurance product
  narrowing and rename, historically superseded.
- `35467c87082c8124bcc5e2c2597c76c6`: x402 catalog-EUR price conversion,
  historically active and referenced by live implementation comments.

Codex mapped the source rows and repo references by meaning. Claude Opus then
performed a read-only architecture review. Both reviewers agree that a stable
internal record key, separate from the historical display ID, is the smallest
durable model. Claude's follow-up identified the protected-prose conflict
above; Codex accepts that correction. Nothing in this milestone is
founder-reserved: it changes inactive technical infrastructure, not product
policy or project authority.

## Identity contract

1. Every formal record has a required `record_key`.
2. For every pre-existing unambiguous record, `record_key` equals `id`. This is
   a permanent invariant, not a temporary coincidence.
3. A future formal record for a colliding source row uses a source-qualified
   key. The grammar must be broad enough for every historical ID already
   present in the collision registry and must remain portable as a filename:
   keys are length-bounded and unique under case-folding for Windows safety.
4. `id` remains the historical display ID. Graph lookup, filenames,
   relationships, cycle detection, inverse generation, and uniqueness use
   `record_key`.
5. A bare historical ID present in the collision registry is never a valid
   relation target, even after that collision is resolved.
6. Duplicate display IDs are legal only when each formal record has a distinct
   source-qualified key and the resolved registry maps it bidirectionally to
   exactly one source row. This behavior is implemented now and exercised with
   synthetic tests; no production collision is resolved in this milestone.

## Collision registry v2

Upgrade the generated schema and registry together:

- derive and persist `source_page_id` from every existing Notion `source_url`;
- add a per-row disposition whose future values distinguish a formal record
  from an intentionally documented-only source row;
- require `record_key` for a formal-record disposition;
- require a non-empty rationale for a documented-only disposition;
- preserve the existing source URLs, collision count, and source-row count;
- validate `source_page_id` against `source_url` rather than re-fetching;
- validate resolved mappings in both directions: every formal disposition maps
  to one matching formal record, and every formal record whose display ID is
  collided maps back to one registry row;
- reject duplicate source IDs, duplicate record keys, missing records, title or
  historical-status mismatches, unmapped formal records, and bare collided
  relation targets.

All existing registry rows remain `unresolved`. Their new disposition fields
must express that no resolution has yet been made, rather than implying that a
row has already been excluded or imported.

## Immutability contract

Extend protected-record metadata to include `record_key`. Permit exactly one
backfill transition for a pre-existing protected record:

```text
previous.record_key is absent
next.record_key equals previous.id
```

After that migration, `record_key` is immutable. No other protected metadata,
body, relation, evidence, status, or filename change is permitted.

Add merge-base validation for `docs/decisions/id-collisions.yaml`:

- collision IDs cannot change or disappear;
- source page IDs and source URLs cannot change or disappear;
- established formal-record-to-key bindings cannot change;
- a resolved collision cannot regress to unresolved;
- source rows cannot be removed;
- additive v1-to-v2 provenance backfill is allowed only when derived exactly
  from the existing URL.

## Implementation sequence

1. Add the `record_key` schema field and portable grammar; widen relation
   targets to the same grammar.
2. Backfill every existing formal record with `record_key: <id>`.
3. Convert every graph identity site from `id` to `record_key`, including
   filename validation, uniqueness, relationship lookup, supersession checks,
   cycles, topic connectivity, inverse rows, generated links, and sorting
   tie-breakers.
4. Upgrade the collision schema and all existing rows to v2 provenance without
   changing any `resolution_status`.
5. Add bidirectional collision mapping validation and registry merge-base
   immutability.
6. Regenerate `docs/project/DECISIONS.md` and both generated JSON schemas only
   through the repository generator.
7. Update `docs/decisions/README.md` to document display IDs, record keys,
   collision dispositions, relationship targeting, and the unresolved-first
   migration process.

## Required verification

Positive tests:

- all existing unambiguous records remain valid after exact-key backfill;
- two synthetic records may share a display ID when distinct keys are fully
  and exactly mapped by a resolved synthetic collision;
- relationships resolve, cycle-check, and generate inverse rows by key;
- generated links use each record's real key-based filename;
- the v1-to-v2 provenance backfill passes merge-base protection.

Negative tests:

- duplicate record keys;
- key/filename mismatch;
- a pre-existing unambiguous record whose key differs from its ID;
- a bare collided ID used as a relation target, regardless of resolution;
- resolved collision with an unmapped source row;
- formal disposition pointing to a missing record;
- colliding formal record without a registry mapping;
- mapping with mismatched ID, title, status, source URL, or source page ID;
- duplicate registry record key or source page ID;
- protected record-key mutation after backfill;
- any registry source mutation/removal or resolved-to-unresolved regression;
- generated artifacts that differ from generator output.

Run the focused Node tests, the complete project-context validation, and the
mandatory `go` review. Then obtain an independent Codex implementation review
at the exact commit and archive that verification task immediately after its
verdict. Merge only if all gates are green and no material finding remains.

## Deferred follow-up

Resolve `DEC-20260502-A` in a later atomic milestone. That work must decide how
to carry the protected `DEC-20260812-A` statement forward without mutating
history, then import the active x402 row and assign an evidence-backed
disposition to the superseded product row. It must not invent a replacement
historical ID or silently reinterpret existing references.
