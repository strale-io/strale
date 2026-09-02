---
doc_type: session-report
authority_scope: none
status: complete
complete: true
phase: M2
authority_active: false
created_at: 2026-09-02
---

# T2 — Repo hygiene sweep: report

> Execution record for track T2 of the CTO-readiness program. Not project
> truth. Every deletion below has either a merged pull request at the deleted
> tip or an archive tag; nothing was discarded without one.

## Result

| Surface | Before (2026-09-02 morning) | After |
|---|---:|---:|
| Remote branches other than `main` | 52 (then 28 rescue branches added by the morning check-in) | 0 |
| Archive tags (`archive/branches/*`, `archive/rescue-2026-09-02/*`) | 0 | 17 + 28 |
| Local branches other than `main` | 57 | 1 (this batch) |
| Linked worktrees | 30 | 2 (`strale-wt-0902`, the morning check-in's; `strale-wt-t2`, this batch) |
| Dead plain-directory copies of merged Codex batches | 17 | 0 |
| `strale-work` (not a checkout) | present | every file verified byte-identical to a copy already tracked on `origin/main` (filed at `archive/sessions/<name>.md` on 2026-08-17; `WORKTREES.md` and `REVIEW_TEMPLATE.md` to their root/archive copies); directory removed, nothing imported |

## Incident during execution (F12, incident 5)

The worktree phase of this sweep deleted the primary checkout itself,
including `.git`, because its keep-list used POSIX paths while
`git worktree list` prints Windows paths, and the script's fallback to
`git worktree remove` refusing was `rm -rf`. The morning check-in session,
running concurrently, re-cloned the repository and pinned the 28 worktree
tips as `rescue/2026-09-02/*` (now tags). No committed content was lost.
Lost locally and unrecoverable from git: root `.env`, `apps/api/.env`,
`.claude/settings.json` (recreated), reflogs, stash entries. Cause and rule
are recorded in `docs/company/LESSONS.md` under F12 and in DQ-29 (founder
action: restore the `.env` files). The deletion steps after the incident used
explicit allowlists of absolute paths with per-path safety checks.

## Archive tags (17)

Created before any branch was deleted; each points at the branch's final tip.

| Tag | Tip | Why preserved |
|---|---|---|
| `archive/branches/codex-docs-email-finder-provider-research-2026-08-31` | `b5427ef7` | no merged PR (never PR'd); preserve under an archive tag |
| `archive/branches/codex-repo-native-operating-model` | `b2951094` | no merged PR (never PR'd); preserve under an archive tag |
| `archive/branches/feat-phase-7a-it-stakeholders` | `8774fff0` | no merged PR (closed PR #135); preserve under an archive tag |
| `archive/branches/fix-x402-body-limit` | `9be5959c` | PR #399 merged but 1 follow-up commit(s); cherry unlanded=4 |
| `archive/branches/remediation-program` | `e20205d9` | no merged PR (never PR'd); preserve under an archive tag |
| `archive/branches/remediation-wp9-artifacts` | `fda70aba` | no merged PR (never PR'd); preserve under an archive tag |
| `archive/branches/rescue-wip-2026-08-25-remediation-wp9-artifacts-258a877` | `258a8778` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-27-detached-6e27366` | `6e27366e` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-27-fix-x402-body-limit-2128c76` | `2128c762` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-27-main-ae1ed7a` | `ae1ed7a3` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-29-fix-vendor-control-tower-e63513c` | `e63513c6` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-29-main-444354b` | `444354ba` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-30-main-af32479` | `af324796` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-31-chore-preflight-image-resize-219121a` | `219121ad` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-08-31-main-8ce9b31` | `8ce9b31c` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-09-01-main-48f783f` | `48f783f0` | janitor rescue snapshot; tag one per content set, then delete |
| `archive/branches/rescue-wip-2026-09-01-remediation-wp9-artifacts-37af338` | `37af3383` | janitor rescue snapshot; tag one per content set, then delete |

The 28 `archive/rescue-2026-09-02/*` tags mirror the morning check-in's rescue
branches one to one (tips verified equal before the branches were deleted).

## Remote branches deleted (52)

| Branch | Tip | Evidence |
|---|---|---|
| `chore/regen-capabilities-catalog` | `75bb72a7` | PR #416 merged; tip is a rebased patch-equivalent of the merged head; content verified on main |
| `codex/repo-native-foundation-m1` | `3501c354` | PR #446 merged 2026-08-31 at this tip |
| `codex/repo-native-foundation-m1-clean` | `4989519a` | PR #447 merged 2026-08-31 at this tip |
| `codex/repo-native-m1-closeout` | `973ebced` | PR #448 merged 2026-08-31 at this tip |
| `codex/repo-native-m2-canonical-product-state` | `b354079f` | PR #451 merged 2026-08-31 at this tip |
| `codex/repo-native-m2-operator-actions-pending` | `287a142c` | PR #452 merged 2026-09-01 at this tip |
| `codex/repo-native-m2-product-state-audit` | `fe8431e3` | PR #450 merged 2026-08-31 at this tip |
| `codex/repo-native-m2-unblock` | `28cc3de3` | PR #449 merged 2026-08-31 at this tip |
| `codex/x402-agentcash-closeout` | `a9bdedb9` | PR #462 merged 2026-09-01 at this tip |
| `codex/x402-agentcash-contract` | `47646028` | PR #461 merged 2026-09-01 at this tip |
| `docs/dq20-answered` | `7f00fd10` | PR #415 merged 2026-08-27 at this tip |
| `docs/preserve-shipped-handoffs` | `0460c465` | PR #440 merged 2026-08-30 at this tip |
| `docs/receipt-phase4-reconciliation` | `8c47c1c1` | PR #381 merged 2026-08-23 at this tip |
| `docs/receipt-phase5-accepted` | `0b674119` | PR #386 merged 2026-08-24 at this tip |
| `docs/receipt-phases-1-3-accepted` | `8be0a7ff` | PR #379 merged 2026-08-23 at this tip |
| `docs/remediation-rebaseline` | `bab183c0` | PR #387 merged 2026-08-25 at this tip |
| `feat/at-firmenbuch-direct` | `b119a852` | PR #410 merged 2026-08-27 at this tip |
| `feat/bundle-sales-instrument` | `dbafd469` | PR #429 merged 2026-08-29 at this tip |
| `feat/competitor-compare-cache` | `91289d49` | PR #400 merged 2026-08-25 at this tip |
| `feat/receipt-phase5` | `37331362` | PR #382 merged 2026-08-24 at this tip |
| `feat/sync-field-allowlist` | `4caa0cca` | PR #420 merged 2026-08-28 at this tip |
| `fix/a2a-raw-error` | `1f8dd32a` | PR #385 merged 2026-08-24 at this tip |
| `fix/at-manifest-postmerge` | `bb749d0a` | PR #414 merged; tip is a rebased patch-equivalent of the merged head; content verified on main |
| `fix/audit-raw-error-leak` | `a4c37f29` | PR #384 merged 2026-08-24 at this tip |
| `fix/drift-competitive-mentions` | `387f4ca1` | PR #413 merged; tip is a rebased patch-equivalent of the merged head; content verified on main |
| `fix/image-resize-format-validation` | `5588e82f` | PR #418 merged 2026-08-27 at this tip |
| `fix/js-yaml-quadratic-dos` | `e9c23d55` | PR #389 merged; 1 follow-up commit(s); cherry unlanded=0 |
| `fix/js-yaml-test-review-followup` | `0540f296` | PR #394 merged; tip is a rebased patch-equivalent of the merged head; content verified on main |
| `fix/kyb-vies-caller-vat` | `44dd738b` | PR #419 merged; tip is a rebased patch-equivalent of the merged head; content verified on main |
| `fix/sanitize-hostname-leak` | `6a0a5bdb` | PR #383 merged 2026-08-23 at this tip |
| `fix/sharp-libvips-cves` | `ff95371c` | PR #392 merged; 1 follow-up commit(s); cherry unlanded=0 |
| `fix/sharp-test-review-followup` | `6a6cfd26` | PR #396 merged; tip is a rebased patch-equivalent of the merged head; content verified on main |
| `fix/sync-script-authority-fields` | `ee4e10ba` | PR #417 merged; tip is a rebased patch-equivalent of the merged head; content verified on main |
| `fix/vendor-restore-timestamp` | `bc3daac3` | PR #404 merged 2026-08-25 at this tip |
| `fix/x402-geometry-and-413-followup` | `5dd2a609` | PR #411 merged 2026-08-27 at this tip |
| `codex/docs-email-finder-provider-research-2026-08-31` | `b5427ef7` | preserved as archive/branches/codex-docs-email-finder-provider-research-2026-08-31 |
| `codex/repo-native-operating-model` | `b2951094` | preserved as archive/branches/codex-repo-native-operating-model |
| `feat/phase-7a-it-stakeholders` | `8774fff0` | preserved as archive/branches/feat-phase-7a-it-stakeholders |
| `fix/x402-body-limit` | `9be5959c` | preserved as archive/branches/fix-x402-body-limit |
| `remediation/program` | `e20205d9` | preserved as archive/branches/remediation-program |
| `remediation/wp9-artifacts` | `fda70aba` | preserved as archive/branches/remediation-wp9-artifacts |
| `rescue/wip-2026-08-25-remediation-wp9-artifacts-258a877` | `258a8778` | preserved as archive/branches/rescue-wip-2026-08-25-remediation-wp9-artifacts-258a877 |
| `rescue/wip-2026-08-27-detached-6e27366` | `6e27366e` | preserved as archive/branches/rescue-wip-2026-08-27-detached-6e27366 |
| `rescue/wip-2026-08-27-fix-x402-body-limit-2128c76` | `2128c762` | preserved as archive/branches/rescue-wip-2026-08-27-fix-x402-body-limit-2128c76 |
| `rescue/wip-2026-08-27-main-ae1ed7a` | `ae1ed7a3` | preserved as archive/branches/rescue-wip-2026-08-27-main-ae1ed7a |
| `rescue/wip-2026-08-29-fix-vendor-control-tower-e63513c` | `e63513c6` | preserved as archive/branches/rescue-wip-2026-08-29-fix-vendor-control-tower-e63513c |
| `rescue/wip-2026-08-29-main-444354b` | `444354ba` | preserved as archive/branches/rescue-wip-2026-08-29-main-444354b |
| `rescue/wip-2026-08-30-main-af32479` | `af324796` | preserved as archive/branches/rescue-wip-2026-08-30-main-af32479 |
| `rescue/wip-2026-08-31-chore-preflight-image-resize-219121a` | `219121ad` | preserved as archive/branches/rescue-wip-2026-08-31-chore-preflight-image-resize-219121a |
| `rescue/wip-2026-08-31-main-8ce9b31` | `8ce9b31c` | preserved as archive/branches/rescue-wip-2026-08-31-main-8ce9b31 |
| `rescue/wip-2026-09-01-main-48f783f` | `48f783f0` | preserved as archive/branches/rescue-wip-2026-09-01-main-48f783f |
| `rescue/wip-2026-09-01-remediation-wp9-artifacts-37af338` | `37af3383` | preserved as archive/branches/rescue-wip-2026-09-01-remediation-wp9-artifacts-37af338 |

Plus the 28 `rescue/2026-09-02/*` branches (converted to tags) and the two
branches of this session's own merged PRs (#476, #477).

## Local branches deleted (29)

| Branch | Evidence |
|---|---|
| `chore/regen-capabilities-catalog` | local counterpart of deleted remote at the same tip 75bb72a7 |
| `codex/repo-native-foundation-m1-clean` | local counterpart of deleted remote at the same tip 4989519a |
| `codex/repo-native-m1-closeout` | local counterpart of deleted remote at the same tip 973ebced |
| `codex/x402-agentcash-closeout` | local counterpart of deleted remote at the same tip a9bdedb9 |
| `codex/x402-agentcash-contract` | local counterpart of deleted remote at the same tip 47646028 |
| `docs/dq20-answered` | local counterpart of deleted remote at the same tip 7f00fd10 |
| `docs/receipt-phase5-accepted` | local counterpart of deleted remote at the same tip 0b674119 |
| `feat/at-firmenbuch-direct` | local counterpart of deleted remote at the same tip b119a852 |
| `feat/competitor-compare-cache` | local counterpart of deleted remote at the same tip 91289d49 |
| `fix/a2a-raw-error` | local counterpart of deleted remote at the same tip 1f8dd32a |
| `fix/at-manifest-postmerge` | local counterpart of deleted remote at the same tip bb749d0a |
| `fix/drift-competitive-mentions` | local counterpart of deleted remote at the same tip 387f4ca1 |
| `fix/kyb-vies-caller-vat` | local counterpart of deleted remote at the same tip 44dd738b |
| `fix/sanitize-hostname-leak` | local counterpart of deleted remote at the same tip 6a0a5bdb |
| `fix/sync-script-authority-fields` | local counterpart of deleted remote at the same tip ee4e10ba |
| `fix/vendor-json-param-casts` | ancestor of origin/main |
| `verify-0.2.8` | ancestor of origin/main |
| `worktree-agent-a03b99f57dbc94fec` | ancestor of origin/main |
| `worktree-agent-a10838a4cfa85befe` | ancestor of origin/main |
| `worktree-agent-a1608a412f9e910ea` | ancestor of origin/main |
| `worktree-agent-a2573d94f57d5897b` | ancestor of origin/main |
| `worktree-agent-a8142915a04d04bee` | ancestor of origin/main |
| `worktree-agent-a8a67eb62d7014255` | ancestor of origin/main |
| `worktree-agent-ab0445ae578d090ae` | ancestor of origin/main |
| `worktree-agent-ab05c65767b97672a` | ancestor of origin/main |
| `worktree-agent-ac2ea2ebf6f3ad000` | ancestor of origin/main |
| `worktree-agent-ad53ba5d21e5e0289` | ancestor of origin/main |
| `worktree-agent-ad721118cc293ed20` | ancestor of origin/main |
| `worktree-agent-afdbdde7c46a45e67` | ancestor of origin/main |

The remaining local branches (checked out in worktrees at the time) vanished
with the primary checkout's `.git`; every one of them had a merged PR at its
tip or an archive tag (see the tables above and the rescue tags).

## Worktrees removed (31)

- C:/Users/pette/Projects/strale via prune+rm (branch remediation/wp9-artifacts, dirty entries: 17)
- C:/tmp/strale-vendor-control-tower via prune+rm (branch , dirty entries: 0)
- C:/tmp/strale-vendor-json-casts via prune+rm (branch , dirty entries: 0)
- C:/tmp/strale-vendor-restore-timestamp via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale/.claude/worktrees/agent-a8a67eb62d7014255 via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-codex-email-finder-research via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-prod-sync via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-acc via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-audit via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-checkin via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-context-foundation-m1 via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-context-migration via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-fmt via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-funnel via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-jsfix via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-jsyaml via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-m2-canonical-product-state via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-m2-operator-actions-pending via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-m2-product-state-audit via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-m2-unblock via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-p5 via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-pf via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-receipt via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-sharp via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-sharpfix via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-sync via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-t2 via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-temp via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-wp10 via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-x402 via prune+rm (branch , dirty entries: 0)
- C:/Users/pette/Projects/strale-wt-x402fix via prune+rm (branch , dirty entries: 0)

Their uncommitted work: the shared checkout's WP9 alerting edits and the
vendor-control-tower edits were verified byte-identical to their rescue
snapshots before removal; the check-in worktree's scratch files were in a
rescue snapshot; nothing else was dirty.

## Dead directories removed (17)

Plain directories (no `.git`) left from Codex batches whose branches were
merged; deleted by explicit allowlist after checking each had no `.git` and
was not a registered worktree:

- strale-wt-m1-foundation-clean (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-capability-governance (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-collision-20260502 (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-collision-handoff (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-decision-next-0901 (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-decisions-charter (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-doctrine (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-enforcement-protocols (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-next-decision-batch (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-resolve-20260502 (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-resolve-20260502-handoff (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-resume-readiness-0902 (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-vendor-methodology-0901 (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-m2-vendor-stack-0901 (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-x402-agentcash-closeout (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-x402-agentcash-contract (plain copy of a merged Codex batch; content on main and under archive tags)
- strale-wt-x402-price-parity (plain copy of a merged Codex batch; content on main and under archive tags)

## Left in place, with reasons

- `strale-wt-0902`: the morning check-in's worktree on `main`; it is the
  reason the trunk is detached at `origin/main` rather than on `main`. T3
  re-points the daily run and returns the trunk to `main`.
- `strale-wt-a2a`, `strale-wt-fix`, `strale-wt-san`, `strale-phase7a`,
  `strale-public-remediation-wt`, `strale-codex-handoff-v2`,
  `strale-website-design-handoff-2026-08-25`: plain directories whose origin
  could not be mapped to a merged branch by name; not deleted, listed for a
  reviewed decision in T3.
- `strale-frontend-codex-homepage-a`, `strale-frontend-codex-how-process-field`,
  `strale-frontend-website-redesign`: orphan worktrees of the **frontend**
  repository (their `.git` files point at a gitdir that no longer exists).
  Outside this repository's sweep; may hold unmerged website work; not touched.
- `C:/tmp/strale-wt-docs`, `C:/tmp/strale-wt-docs3`, `C:/tmp/strale-wt-fixture`,
  `C:/tmp/strale-wt-promote`: plain copies of this repository (no `.git`),
  found by the independent review; not deleted, added to the T3 decision list
  with the seven directories above.
- `strale-frontend-codex-website-redesign-v2` (worktree of `strale-frontend`)
  and `strale-context-archive-wt-m0` (worktree of `strale-context-archive`):
  live worktrees of other repositories, untouched.
- Separate repositories (`strale-beacon`, `strale-context-archive`,
  `strale-examples`, `strale-frontend`, `strale-public-remediation`): untouched.

## Founder-facing items

- DQ-29: restore the root `.env` and `apps/api/.env` (deleted; no copy exists).
- The WP9 alerting isolation work is preserved in two tags: the committed
  branch under `archive/rescue-2026-09-02/remediation/wp9-artifacts`
  (`fda70aba`) and the 17 uncommitted edits (`alerting.ts`,
  `alerting.isolation.test.ts`, the reconcile script, ten handoff drafts) under
  `archive/branches/rescue-wip-2026-09-01-remediation-wp9-artifacts-37af338`
  (`37af3383`, whose parent is `fda70aba`). The vendor-control-tower edits are
  under `archive/rescue-2026-09-02/fix/vendor-control-tower`; whether to finish or
  drop them is a priority call, queued in DQ-29's companion note.
- `feat/phase-7a-it-stakeholders` (Italian stakeholders capability, PR #135
  closed unmerged) is preserved under `archive/branches/feat-phase-7a-it-stakeholders`.
