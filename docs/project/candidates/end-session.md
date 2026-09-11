---
doc_type: session-end-command-draft
authority_scope: none
status: candidate
complete: false
phase: M3
authority_active: false
---

# /end-session - repo-native replacement draft (M4, inactive)

> [!CAUTION]
> **M4 DRAFT - NO SESSION FOLLOWS THIS TODAY.**
> This file is a design draft for the repo-native replacement of the live
> `/end-session` command. It is not executed by Claude Code or Codex, is not
> linked from any live command or skill file, and changes nothing about how a
> session actually ends. The live command
> (`.claude/commands/end-session.md`) and its Codex mirror
> (`.agents/skills/source-command-end-session/SKILL.md`) remain the only
> instructions either tool follows, and Notion remains authoritative, until
> the founder-gated M4 cutover
> (`docs/strategy/2026-08-31-repo-native-operating-model-migration.md`).
> T6's M3 batch 4 (`docs/programs/cto-readiness/tracks.yaml`) wrote this
> draft; it does not activate it.

## Why this file, not a section of the live command

A command file is the prompt the agent executes. A draft written inside
`.claude/commands/end-session.md` or the Codex mirror could be followed
before M4 simply by existing there - the harness does not distinguish
"prose under a heading" from "an instruction" the way this document can as a
plain candidate file. Keeping the draft in `docs/project/candidates/`, beside
the other M2/M3 candidate documents (`docs/project/STATE.md`,
`docs/project/VENDORS.md`, and others), keeps it inert by construction: it is
reached only by a session reading this path deliberately, not by a tool
parsing the live command. `scripts/candidates.test.mjs` (below) asserts
neither live file references this path.

## Per-tool identity table

The live command and its Codex mirror are not identical: two fields carry
session identity, not just a path swap. Any repo-native draft generated from
one text for both tools must keep writing each tool's own identity, not
collapse to one.

| Field | Claude Code | Codex |
|---|---|---|
| Live file | `.claude/commands/end-session.md` | `.agents/skills/source-command-end-session/SKILL.md` |
| Root entrypoint referenced | `CLAUDE.md` | `AGENTS.md` |
| Workflow directory referenced | `.claude/` | `.codex/` |
| Journal `Actor` field (live, step 3) | `claude-code` | `Codex` |
| To-do "in progress" ownership filter (live, step 4) | `Claude code` | `Codex` |
| Repo-native handoff `actor` front-matter value (this draft, step 3 replacement) | `claude-code` | `codex` |

## Every live step, and its repo-native replacement

The live command has seven numbered steps plus a Rules section. For each:
"unchanged" means the repo-native replacement does exactly what the live
step already does; "replaced" means the Notion call is swapped for a
repo-native read or write, described below.

### 1. Run the codebase close-check script

**Unchanged.** `cd apps/api && npx tsx --env-file=../../.env scripts/session-close-check.ts`
has no Notion dependency (confirmed by the M3 remaining-scope inventory,
`archive/sessions/2026-09-11-m3-remaining-scope-inventory.md` section 2). It
stays exactly as the live command runs it.

### 2. Write the session handoff file

**Unchanged**, and it already is the repo-native artifact - the live command
already writes to `handoff/_general/from-code/YYYY-MM-DD-<topic>.md` on the
filesystem, not to Notion. What changes under this draft is only what goes
*into* that same file: step 3's replacement (below) adds a YAML front-matter
block above the existing `Intent:` line, carrying the fields the Notion
Journal entry used to carry. The body convention (first line `Intent:`, then
what shipped/what's open/learnings/cost) is unchanged.

### 3. Create the Journal entry in Notion

**Replaced.** Instead of a Notion data-source write to
`collection://8f54383b-3227-42c2-bee4-77a091027f8f`, add YAML front matter
to the top of the same handoff file step 2 already writes:

```yaml
---
title: "Session log - <topic> YYYY-MM-DD"
type: session
source: code
actor: claude-code        # codex on the Codex mirror
action_required: false    # true if the session left explicit follow-ups
---
Intent: <one line, as today>
```

`Content` is not a separate front-matter field - the handoff body under the
front matter already carries Intent/Outcome/Open/learnings, which is what
`Content` mirrored on the live Journal entry. Verified accepted (not
committed - see "How this was verified" below) by `npm run handoff:check`
and `npm run receipts:check`: neither script parses or restricts the
content of a handoff file beyond its path
(`handoff/_general/from-code/*.md`) and the existing `Intent:` line the
archive-index generator looks for (`scripts/generate-archive-index.mjs`,
`INTENT_LINE` regex, matches "anywhere in the file" so a preceding YAML
block does not hide it).

**What the `Action Required` field means here is deliberately left open.**
T6's own record (`docs/programs/cto-readiness/tracks.yaml`, T6's
`next_action`) found that Notion's Journal "Action Required" flag has in
practice been used as a reading list (nine of ten recent flagged entries were
session logs, reports, or course corrections, not decisions awaiting the
founder), while `docs/company/DECISION-QUEUE.md`'s `your_call` entries carry
the actual founder-decision meaning. This draft's `action_required` field
preserves the Notion name and does not resolve which meaning it should carry
before M4 decides; a session using this draft after M4 activation follows
whatever that decision says, not this batch's guess.

### 4. Check Notion To-do DB for state drift

**Replaced.** Instead of querying the To-do DB
(`collection://33a67c87-082c-8033-8ac5-000ba9922392`) for "in progress" items
owned by `Claude code` / `Codex` and "done" items to archive, read the active
track's `next_action` in `docs/programs/*/tracks.yaml`
(`npm run programs:check` validates the register itself):

a. **Does the active track's `next_action` still describe reality** after
   this session's work? If the session advanced or completed a batch, the
   `next_action` text must say so (the Session contract already requires
   this: CLAUDE.md "Session contract" step 2, `handoff:check`'s
   `resume-surface` finding fails a session that changed code without
   updating a program register or writing a handoff file). Flag drift; do
   not silently leave a stale `next_action`.
b. There is no repo-native "in progress, owned by X" per-item list to check
   against - the register carries one `next_action` narrative per track, not
   a per-item ownership column. A future batch that wants that granularity
   would need to add it to `tracks.yaml`'s schema; this draft does not
   propose that.

### 5. Check for contradictions / unlogged decisions

**Replaced.** Instead of checking the Decisions DB
(`ea57671f-7167-44e4-a254-c0a1de79e7f9`) for a matching entry:

- **Decisions made this session that need logging:** the repo-native path
  for a founder-gated decision is `docs/company/DECISION-QUEUE.md`, a
  `your_call` entry (money beyond the weekly envelope, anything legally
  binding Moonlighter AB, a one-way public act, pricing outside the
  existing band - the same authority thresholds CLAUDE.md's Operating
  Charter section already states). A decision Claude Code or Codex made
  itself, inside delegated authority, is a `decided` entry in the same
  file, not a `your_call` one. Neither entry type is this draft's concern to
  create automatically - flag a missing entry, as the live step already
  does for Notion, rather than writing one.
- **A formal, citable decision record** (the kind `docs/decisions/records/DEC-*.md`
  captures, per `docs/decisions/README.md`) is a separate, heavier artifact
  from a `DECISION-QUEUE.md` line; this draft does not conflate the two.
  Check whether a session that made a Decision-grade call recorded it either
  way, and flag if neither exists.
- **Contradictions with an active Decision:** unchanged in spirit - if this
  session contradicted an existing Decision (Notion-recorded today,
  `docs/decisions/records/*.md` once M4 activates the repo-native register)
  without following the Contradiction Protocol, flag it.
- **Memory of precedent:** unchanged - if something was agreed that would
  benefit future sessions, note that the user may want it saved to memory or
  `CLAUDE.md`/`AGENTS.md`.

Flag only; this draft does not mutate `DECISION-QUEUE.md`,
`docs/decisions/records/`, or memory, the same restraint the live step
applies to Notion.

### 6. Surface remaining loose threads

**Unchanged in shape, repo-native in source.** The live step reads "the
script output + Notion state"; the repo-native replacement reads the same
script output plus the repo-native state this draft's steps 3-5 read
(handoff front matter, `tracks.yaml`, `DECISION-QUEUE.md`,
`docs/decisions/records/`), not Notion. Handoff files uncommitted, caps stuck
in `validating`, open circuit breakers, and undiscussed brainstorms are all
still surfaced the same way.

### 7. Final verification report

**Unchanged format, repo-native labels.** The same structured summary the
live command prints, with two label swaps:

```
Handoff file (step 2):     [written this session, path]
Handoff front matter (step 3 replacement): [title/type/source/actor/action_required set]
To-do DB state (step 4 replacement): [active track next_action current | drift found]
Decisions to log (step 5 replacement): [0 | N to confirm in DECISION-QUEUE.md or docs/decisions/records/]
```

Everything else (Green/Yellow/Red counts, supersessions, codebase pushed
state, DB-to-code parity, loose threads, "ready to close?") is unchanged.

### Rules

- **Write the handoff file, with its front matter,** as part of the standard
  flow - unchanged in spirit from the live command's standing preference.
  Skip only if a session-authored handoff for the same topic already exists,
  same as today.
- **Never write a `your_call`/`decided` entry to `DECISION-QUEUE.md`, and
  never add a `docs/decisions/records/*.md` file, on the user's behalf**
  without the same explicit approval the live command requires before a
  Notion Decisions DB entry. Flag if the session made a decision that needs
  logging.
- **Never mutate a program register's `next_action` to claim state it did
  not actually reach.** The live command's "never mutate Notion to-do
  status" becomes "never overwrite `next_action` with anything but the
  session's own truthful account," since this draft's step 4 reads
  `tracks.yaml` directly rather than a separate to-do list.
- The live rule "if Notion MCP tools are unavailable, write the handoff file
  anyway and flag loudly" has no repo-native equivalent to replace - nothing
  in this draft depends on network access or an external service, so there
  is no unavailability case to guard against. Removed, not replaced.
- Distinguish pre-existing issues from new ones honestly; do not hide issues
  introduced this session; do not take credit for issues not introduced this
  session. Unchanged.
- If the script exits 2 (red findings), default to "do not close yet" unless
  the user explicitly overrides, but still write the artifacts so the work
  is recorded. Unchanged.

## How this was verified

Neither `npm run handoff:check` nor `npm run receipts:check` was run against
a committed file - the front-matter shape above was written to a throwaway
file at `handoff/_general/from-code/` during this batch, both checks were
run against the working tree with that file present, and the file was
deleted again before this batch's own commit. `handoff:check`'s "session"
mode does not parse handoff file content at all (it checks path prefix
membership, `git status`, and the `Intent:`-adjacent `resume-surface` rule);
`receipts:check`'s handoff scan
(`scripts/receipts-lib.mjs`, `HANDOFF_WARN_FROM`, `TEST_COUNT_PATTERN`) only
warns on a bare test count inside a handoff dated on or after 2026-09-02 and
does not otherwise restrict shape. Both accepted the sample file's YAML
front matter followed by the existing `Intent:` convention without any new
finding attributable to it.

## What this draft does not do

- It does not decide the `Action Required` meaning question (open per T6,
  see step 3 above) - that is explicitly out of scope for this batch and
  left for a founder-gated M4 design decision.
- It does not touch the vendor-switch skill's Notion step - that retarget
  was drafted separately by the vendor strand's own batch 5
  (`docs/strategy/2026-09-10-m3-vendor-state-model.md`, "Batch 5: outcome").
- It does not change the live `.claude/commands/end-session.md` or
  `.agents/skills/source-command-end-session/SKILL.md` files, which remain
  byte-identical to their state before this batch.
- It does not add a new field to `docs/programs/*/tracks.yaml`'s schema for
  per-item to-do ownership (step 4b above) - that is future work if a
  session ever needs that granularity.
