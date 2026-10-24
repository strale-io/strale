---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Workflow Invariants (Non-Negotiable)"
moved_at: 2026-10-24
---

# Superseding decisions: the Contradiction Protocol and decision invariants

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

**Conflict duty.** If a request would contradict an active decision, say so
before acting: quote the decision, say exactly what conflicts, and ask whether
to confirm, supersede or revise it.

**Decisions are append-only.** Never edit a decision record's substance
(`docs/decisions/records/`). A correction or reversal is a new record. A
global decision is always confirmed with Petter.

**Superseding a decision.** When a new decision contradicts an active one:

1. quote both, side by side;
2. say exactly what conflicts;
3. Petter approves the supersession;
4. record it: the new decision with its rationale, and the old one marked
   superseded with a link to the new one;
5. update `docs/decisions/ACTIVE.md` in the same change.

A decision is never silently superseded.

The Notion-specific invariants this section used to carry (never edit Journal
entries, never delete in Notion, corrections as new Journal entries) retired
with Notion at the T7 close; the original text is in
`archive/sessions/2026-10-24-entrypoints-before-contract-cut/CLAUDE.md`.
