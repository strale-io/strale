# M1 foundation independent review — Claude

- Date: 2026-08-31
- Author under review: Codex
- Preferred route: Claude Opus, high effort
- Actual route: Claude Sonnet, high effort
- Fallback reason: the prior Opus invocation timed out
- Reviewed change: staged M1 foundation diff on `codex/repo-native-foundation-m1`
- Verdict: **PASS**
- Findings: **0 high, 0 medium, 0 low**

## Review scope

Claude reviewed the staged diff against:

- `docs/strategy/2026-08-31-repo-native-operating-model-migration.md`
- `docs/decisions/records/DEC-20260831-A.md`
- `archive/sessions/2026-08-31-m1-parallel-sequencing-review-claude.md`
- the active `AGENTS.md` and `CLAUDE.md` contracts

The review was read-only. Claude inspected the staged diff, the generated
documents and schemas, the legacy-authority inventory, the generator and
checker implementations, entrypoint and CI references, and the local test
results.

## Verdict

> VERDICT: PASS
>
> HIGH: 0
>
> MEDIUM: 0
>
> LOW: 0
> FINDINGS: none

## Evidence recorded by the reviewer

- The change is additive and bounded: no deletion, move, or modification of
  `AGENTS.md`, `CLAUDE.md`, or an existing authoritative document.
- Every M1 document has `authority_scope: none`, `status: skeleton`,
  `complete: false`, `phase: M1`, `m1_template: true`, the visible caution
  banner, and the template sentinel. No reconciled product or project truth is
  present.
- `DECISIONS.md` and `RECENT.md` explicitly identify themselves as partial,
  incomplete generated views.
- No active entrypoint, hook, CI workflow, skill, or command activates the new
  `START-HERE.md`, `PROTOCOL-ROUTER.md`, checker, or generator.
- Inventory entries contain only `path`, `owner_area`, `sha256`, and
  `detected_references`; no classification or migration judgment is present.
- The M1 checker is unconditionally warning-only and currently reports only
  `M0_NOTION_EXPORT_INCOMPLETE`, explicitly stating that M2 and cutover remain
  blocked.
- The four focused context tests pass. Regeneration is deterministic and
  leaves the staged tree unchanged.
- The worktree guard correctly distinguishes an isolated linked worktree from
  the primary shared checkout using Git's absolute Git directory and common
  directory.
- The Windows file-URL and path normalization was reviewed and no correctness
  issue was found.
- No active Decision conflict was found.

## Scope decision

Claude cleared the bounded M1 foundation to proceed.

The review did **not** clear any of the following:

- closing M0 before the Notion export is complete;
- populating product, state, roadmap, or decision truth in M2;
- activating the new entrypoint or protocol router;
- making the checker blocking or wiring it into CI, hooks, skills, or commands;
- adding classification, disposition, or migration-judgment fields;
- moving, archiving, or deleting legacy authorities; or
- removing any Notion read, write, or secret dependency.

Each remains gated by the migration plan and requires its own milestone review.

## Portability follow-up

After the branch was rebased, Windows checkout conversion exposed that the
first inventory implementation hashed working-tree bytes: a Markdown-only LF →
CRLF conversion changed the `handoff/` digest without changing staged content.

The generator was corrected to compute each SHA-256 inventory digest over the
ordered repo paths and their canonical stage-zero Git blob object IDs. A
temporary-repository regression test stages LF content, changes `AGENTS.md` to
CRLF without staging, and proves the digest remains unchanged.

The first bounded Sonnet review attempt timed out without a verdict. A
turn-limited Sonnet retry at high effort returned **PASS** with 0 high, 0
medium, and 0 low findings. Claude confirmed the index parsing is portable,
the implementation fails closed on a missing staged/tracked object, the hash
field remains an honest SHA-256 of the canonical content manifest, and the M1
authority constraints are unchanged. The context suite passed 5/5.
