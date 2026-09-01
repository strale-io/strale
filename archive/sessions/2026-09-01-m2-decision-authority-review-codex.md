---
doc_type: review-report
authority_scope: none
status: interim-same-provider
reviewed_at: 2026-09-01
reviewer: separate-codex-sessions
final_reviewed_commit: e5631231d6e222dd66266280a5f0ccfae298e943
---

# M2 formal decision graph — interim Codex review

## Independence boundary

Claude was unavailable. Per founder instruction, separate high-effort Codex
tasks reviewed immutable commits and were archived immediately after each
verdict. This is same-provider interim evidence, not the normal cross-provider
gate. Claude must review the then-current exact commit before M4 activation.

## Source and authority result

The final authority review returned **PASS** with no actionable high or medium
findings at `452dbf1f`. The later commits changed only Markdown parsing, its
tests, and the pinned parser dependency; the reviewed authority artifacts did
not change.

The review independently established:

- the preserved export has 318 formal rows;
- all 35 duplicated IDs and all 71 colliding rows match the registry with zero
  missing IDs or title/status/URL differences;
- the two incompatible `DEC-20260502-A` rows remain unresolved and excluded;
- `DEC-20260503-A`, `DEC-20260812-A`, `DEC-20260815-A`, and
  `DEC-20260822-A` match the formal sources, Charter, and PR evidence;
- PR #362 is the formal source for `DEC-20260822-A`; PR #361 is the separate
  production-authority mechanism, so no `DEC-20260822-B` record was invented;
- all candidates remain mechanically inactive; and
- M4 remains blocked by collision reconciliation and cross-provider review.

Primary formal sources:

- [superseded product `DEC-20260502-A`](https://app.notion.com/p/35467c87082c81ca99efdca389eb77b9?pvs=204)
- [active x402 `DEC-20260502-A`](https://app.notion.com/p/35467c87082c8124bcc5e2c2597c76c6?pvs=204)
- [`DEC-20260503-A`](https://app.notion.com/p/35567c87082c81068831ec1d2e826115?pvs=204)
- [`DEC-20260812-A`](https://app.notion.com/p/3ba67c87082c812986c6c35d82bc986f?pvs=204)
- [`DEC-20260815-A`](https://app.notion.com/p/3be67c87082c8143b70dc6503893ba73?pvs=204)

## Technical review sequence

Every finding below was fixed and regression-tested before the next immutable
review commit was created.

| Commit | Verification task | Verdict | Material result |
|---|---|---|---|
| `0f92bb59` | `01a05b99-cbe3-72d0-870d-49991d1ce509` | FAIL | Found the collapsed `DEC-20260502-A` identities, withheld historical edges, and incomplete Charter gates. |
| `0f92bb59` | `01a05b99-cc40-7e51-a91e-93c9a0e20c92` | FAIL | Found post-supersession immutability, generator, status, hidden-heading/banner, relationship, and index gaps. |
| `2b31f852` | `01a05ba8-d790-75f0-a09a-277b28eec323` | PASS | Source/collision remediation clean; 38/38 tests. |
| `2b31f852` | `01a05bb0-ef7b-7100-9f45-ee66ee8567d5` | FAIL | Found forward-lifecycle, relations/evidence provenance, directional-cycle, exact-section, and missing-generated-file gaps. |
| `452dbf1f` | `01a05bc3-5102-7323-9f0d-0da89d10a837` | PASS | Final authority/source review clean. |
| `452dbf1f` | `01a05bc3-5102-7323-9f0d-0dbe783f9b9e` | FAIL | Found remaining CommonMark visibility disagreements in the custom scanner. |
| `d7033b96` | `01a05bcf-2c1c-7cc1-b2fe-2b7091849747` | FAIL | CommonMark matrix passed, but multi-line heading breaks could still concatenate into a protected name. |
| `e5631231` | `01a05bd7-7026-7a83-ae29-33402225ba1e` | PASS | No high/medium findings; 43/43 tests, warning-clean context check, exact clean worktree. |

All eight tasks above are archived. Superseded temporary review branches were
removed after their worktrees were released.

## Final verification

- `npm run context:test` — 43/43 pass.
- `npm run context:check -- --json` — zero findings.
- `npm --workspace=packages/mcp-server run build` — pass.
- `npx tsc --noEmit --project tsconfig.json` in `apps/api` — pass.
- `git diff --check` and Node syntax checks — clean.
- Independent parser probes covered indented and setext H2s, arbitrary valid
  fences, malformed fences, escaped and unclosed comments, raw HTML, nesting,
  attached hashes, and soft/two-space/backslash line breaks.

## Ship boundary

Safe to merge only as an explicitly inactive M2 candidate. This review does not
activate repo authority, retire Notion, clear the Claude backlog, resolve any
historical ID collision, or authorize M4.
