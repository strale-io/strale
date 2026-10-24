Intent: M4 batch 4 (T7, cto-readiness): activate the repo-native end-session
and vendor-switch flows in all four live files, retiring the M3 candidate
draft they were based on.

What shipped:

- `.claude/commands/end-session.md` and
  `.agents/skills/source-command-end-session/SKILL.md`: steps 3-5 replaced
  per `docs/project/candidates/end-session.md`'s per-live-step mapping
  (now archived, see below). Step 3 folds the Notion Journal write into a
  YAML front-matter block on the handoff file the command already writes
  (`title`/`type`/`source`/`actor`/`action_required`); step 4 reads the
  active track's `next_action` in `docs/programs/*/tracks.yaml` instead of
  querying the Notion To-do DB; step 5 checks
  `docs/company/DECISION-QUEUE.md` (`decided`/`your_call` entries) and
  `docs/decisions/records/` instead of the Notion Decisions DB. The
  Claude Code file keeps `actor: claude-code` and the historical owner
  wording "owned by `Claude code`"; the Codex mirror keeps `actor: Codex`
  and "owned by `Codex`" throughout — no value was copied across the
  per-tool split. The live rule about Notion MCP tools being unavailable
  was removed, not replaced (nothing in the repo-native steps depends on
  network access), per the draft's own instruction.
- `.claude/skills/vendor-switch/SKILL.md` and
  `.agents/skills/vendor-switch/SKILL.md`: Step 5 replaced verbatim (no
  per-tool split for this one, per the drafted design) with the
  `docs/decisions/records/` + append-only `config/vendors.yaml` history
  text from `docs/strategy/2026-09-10-m3-vendor-state-model.md`'s "Item 6"
  section. Both mirrors are still byte-identical after the edit
  (`diff .claude/skills/vendor-switch/SKILL.md .agents/skills/vendor-switch/SKILL.md`
  reports no difference).
- The draft `docs/project/candidates/end-session.md` moved with `git mv` to
  `archive/sessions/2026-09-13-m4-b4-end-session-candidate-draft.md` as the
  design record.
- `scripts/candidates.test.mjs` rewritten from asserting the (now archived)
  candidate file to asserting the four live files directly: 10 tests,
  covering the repo-native steps' presence, the per-mirror actor/owner
  split (asserted separately per file, each checking the *other* mirror's
  value is absent, not just its own value's presence), absence of the old
  Notion collection/database identifiers, and that the two vendor-switch
  mirrors' Step 5 sections are textually identical. `.github/workflows/ci.yml`'s
  comment above the `candidates:test` step updated to describe what it now
  checks and to point at the archived draft's new path.

Per-mirror actor/owner values (so the split is visible without opening the
files):

| File | Actor | Owner wording |
|---|---|---|
| `.claude/commands/end-session.md` | `claude-code` | `` owned by `Claude code` `` |
| `.agents/skills/source-command-end-session/SKILL.md` | `Codex` | `` owned by `Codex` `` |

Planted failures (all ten new assertions, each broken then restored from a
backup copy before the next plant; see `archive/receipts/2026-09-13-test-run-m4-b4-activate-flows.json`
for the clean run this session ended on):

1. Copied the archived draft back to `docs/project/candidates/end-session.md`
   -> "the design draft is archived..." failed with
   "the draft must no longer live at docs/project/candidates/end-session.md".
2. Changed the front-matter `title:` line in the Claude Code file ->
   "carries the repo-native session-log front matter step" failed.
3. Replaced `docs/programs/*/tracks.yaml` with other text in the Claude Code
   file -> "read the active track's next_action..." failed.
4. Replaced `docs/company/DECISION-QUEUE.md` and `docs/decisions/records/`
   with other text in the Claude Code file -> the DECISION-QUEUE.md/records
   assertion failed.
5. **The hazard this batch exists to avoid, proven directly**: set
   `actor: Codex` in the Claude Code file (copying the Codex mirror's value
   into the Claude Code file) -> "the Claude Code end-session file carries
   its own actor and owner values, not the Codex mirror's" failed with
   "must carry the claude-code actor value", while the Codex-file test still
   passed (proving the two assertions are independent, not one shared
   check).
6. Same drift, owner wording: set "owned by `Codex`" in the Claude Code
   file -> the same test failed with "must carry the Claude Code owner
   value".
7. Reverse direction: set `actor: claude-code` in the Codex file -> "the
   Codex end-session file carries its own actor and owner values, not the
   Claude Code mirror's" failed with "must carry the Codex actor value".
8. Appended the old Notion Journal collection id
   (`collection://8f54383b-3227-42c2-bee4-77a091027f8f`) to the Claude Code
   file -> "neither live end-session file writes to the Notion Journal..."
   failed.
9. Removed the word "append-only" from the Claude Code vendor-switch
   mirror's Step 5 -> both the Step-5-content assertion and the
   verbatim-identical assertion failed (expected: the two mirrors were now
   different).
10. Appended the old Notion Decisions DB id
    (`ea57671f-7167-44e4-a254-c0a1de79e7f9`) to the Claude Code vendor-switch
    mirror -> "neither live vendor-switch file's Step 5 still logs to the
    Notion Decisions DB" failed.
11. Diverged the Codex vendor-switch mirror's closing sentence -> the
    verbatim-identical assertion failed on its own (content check 4 and 9
    each only touch one file at a time, so this proves the identical-text
    check independently).

(Eleven plants for ten assertions: plant 9 tripped two assertions at once,
listed as items 9 and the corresponding half of the count above.)

After each plant the file was restored from a pre-edit copy (not
`git checkout`, per the shared-checkout rule) and the full suite re-run
green before the next plant.

What's open: nothing from this batch's scope. The inventory item (section 7
item 4, `archive/sessions/2026-09-11-m4-cutover-inventory.md` around line
538) matched what I found in the four live files and the draft; no
discrepancy to flag. Batch 5 (wire the digest's repo-native readers into
production) is next per `docs/programs/cto-readiness/tracks.yaml` T7's
`next_action`.

Gates run, all pass (see report for detail; no bare counts restated here):
`apps/api` typecheck; `candidates:test` (rewritten); `vendors:test`;
`vendors:check`; `docs:test`; `context:check`; `receipts:check`;
`programs:check`; `archive:index`; `context:generate` run twice
(idempotent on the second run, confirmed via `git status --short` showing
no further changes).

Cost: no external API calls; no DB access.
