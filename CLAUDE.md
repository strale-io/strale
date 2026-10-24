@AGENTS.md

# Claude Code notes

Everything above, imported from `AGENTS.md`, is the contract for both tools.
This file adds only what is specific to Claude Code. If the two ever disagree,
`AGENTS.md` wins; fix this file.

## Hooks (`.claude/settings.json`, tracked)

- **SessionStart** prints the orientation: checkout, active track, last gate
  result (`.claude/hooks/handoff-session-start.mjs`).
- **Stop** runs the handoff gate (`.claude/hooks/handoff-stop.mjs`, the same
  checker as `npm run handoff:check`). On failure it asks you to continue and
  fix what it lists. After six blocks on the same finding codes it lets the
  session stop; that records a failure and does not mean the gate passed.
- **PostToolUse (Bash)** runs `scripts/guard-tree-integrity.mjs`, which
  restores tracked files the shared-checkout bug deleted. It only restores
  tracked-and-deleted paths and cannot discard work.
- Machine-local additions go in the ignored `.claude/settings.local.json`.

## Agents

- An agent that edits files is launched with `isolation: "worktree"`. That is
  the actual prevention for the shared-checkout failure (AGENTS.md
  non-negotiable 5).
- A review agent is read-only. If it needs to run something, it makes its
  own scratch worktree and removes it with `git worktree remove`.
- Brief a review agent with the code and the intent, not your conclusion, and
  point it at `REVIEW.md`.

## Skills and commands

| Use | When |
|---|---|
| `go` | verify, simplify and open the PR for the current change |
| `onboard-capability` | add, change or onboard a capability |
| `vendor-switch` | change a capability's upstream vendor |
| `/ceo-brief` | write or check the CEO morning brief |
| `/activity` | summarise recent external platform activity |
| `/end-session` | close a session: close-check, handoff file, loose threads |

Codex reads the same skills from `.agents/skills/`. A skill changed in one
folder is changed in the other in the same commit.
