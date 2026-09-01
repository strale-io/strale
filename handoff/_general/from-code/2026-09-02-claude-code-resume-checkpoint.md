Intent: Make a clean Claude Code continuation deterministic without activating repo-native authority before M4.

## Where the migration stands

M0 preservation and M1 foundation are complete. M2 has merged the reconciled
PRODUCT/STATE/ROADMAP candidates, operator-action and pending-founder
candidates, the protected decision/collision graph, and reviewed formal topic
batches for sourcing doctrine, deploy/enforcement protocols, capability
onboarding, source enumeration, vendor methodology, and the April vendor-stack
chain.

All repo-native candidate surfaces remain inactive:
`authority_scope: none`, `authority_active: false`. Notion-backed workflows and
the existing entrypoints still govern until one explicit M4 cutover. Do not
activate `START-HERE.md` or retire Notion during the next task.

## Start here

1. Create an isolated worktree from current `origin/main`; never work from the
   dirty shared checkout.
2. Read `CLAUDE.md` and the **Current continuation checkpoint** in
   `docs/strategy/2026-08-31-repo-native-operating-model-migration.md`.
3. Read:
   - `docs/project/STATE.md`;
   - `docs/project/ROADMAP.md`;
   - `archive/sessions/2026-09-01-m2-vendor-stack-authority-gaps.md`;
   - `archive/sessions/2026-09-01-m2-vendor-stack-authority-closeout.md`; and
   - the four April vendor-stack records in `docs/decisions/records/`.

## Next bounded task

Complete the M2 closure audit before beginning M3. Design and implement a
machine-checkable remaining-work/disposition register that leaves the M1 bare
inventory contract intact and reconciles:

1. every `legacy-authority-inventory.json` entry to `migrated`,
   `evidence-only`, `archive`, `obsolete`, or `unclear`, with provenance and
   rationale;
2. every preserved Decision identity/source row to migrated, unresolved
   collision, intentionally historical, or not-yet-reconciled state; and
3. the plan's older progress-note `Next:` statements against what actually
   merged.

Produce exact counts, an explicit M2 exit-gap list, and the next
collision-free Decision batch. Mark uncertainty; do not guess or bulk-promote
Decision content during the inventory pass.

The vendor-current-state shadow replacement remains the first queued M3 task
after the M2 exit gate, not the immediate task.

## Hard boundaries

- No vendor contact, new account, terms acceptance, licensing commitment, or
  spend.
- No production write, runtime vendor switch, routing change, or M3 workflow
  implementation during this M2 audit.
- No secret material in Git or generated evidence.
- No dual-write to Notion and repo-native candidates.
- No M4 cutover, entrypoint activation, or Notion retirement.
- Do not invoke Claude for review. Claude Code authors; fresh separate Codex
  tasks review the plan, exact commit, and closeout.

## Why this is next

The durable migration plan requires remaining historical Decision work and
legacy-authority disposition classification before M3 replacement PRs. Recent
topic batches created a strong foundation, but they did not prove that every
M2 source has a terminal disposition. The closure audit makes that remainder
explicit and prevents chronology from silently becoming project truth.

No founder decision is required for this technical preparation.
