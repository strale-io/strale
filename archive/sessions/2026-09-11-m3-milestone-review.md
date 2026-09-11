---
doc_type: m3-milestone-review
commit: 9b668922c9f55ebe942041a19f1ae01d082da705
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-11'
status: complete
complete: true
phase: M3
authority_scope: none
authority_active: false
verdict: exit-met-with-conditions
---

# M3 milestone review

An independent, read-only review in a separate context, by an agent that did
not author the M3 work, of the M3 exit criteria in
`docs/strategy/2026-08-31-repo-native-operating-model-migration.md` (section
"M3 - Prepare repo-native workflows and Notion replacements") against
`origin/main` at `9b668922`. It is archived verbatim in substance; only the
gate-result block is restated without test counts, per this repository's
evidence rule.

## Exit criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Repo-native replacements testable without changing existing authority | MET | Vendor-roster drift (`scripts/vendors-lib.mjs` `compareRosterWithRegister`, PR #637), digest priorities (`scripts/digest-repo-native-lib.mjs`, PR #641), distribution surfaces (`docs/operations/distribution-registry.yaml`, PRs #642 and #645) and session end (`docs/project/candidates/end-session.md`, PR #643) each exist, each has its own test script that passes, and each states that Notion stays the authority. The `go` and vendor-switch flows are prepared only as an inactive prose draft in `docs/strategy/2026-09-10-m3-vendor-state-model.md` ("Batch 5: outcome"), which the plan's "prepared" wording allows. |
| 2 | No new path writes to both repo-native truth and Notion | MET | No M3 script, workflow or candidate draft contains a Notion write. The shadow comparison's Notion calls (`getPriorities`, `getDistributionSurfaces` in `apps/api/src/lib/daily-digest/fetch-notion.ts`) are database query reads only. |
| 3 | Scheduled and deployment mechanisms verified, not assumed | MET, with a disclosed gap | `npm run scheduled:check` passes against `config/scheduled-mechanisms.yaml`, which declares every scheduled step that runs a repository script, plus the Railway `strale-digest-cron` job recorded as `verifiable: false` because its schedule lives in Railway's configuration. The gap between runtime now and after cutover is stated: the digest's Docker image carries no repository documents, so the M3 digest reader runs only in GitHub Actions (`m3-digest-shadow.yml`). |
| 4 | Every currently mandatory protocol is represented in the coverage manifest | PARTLY MET | `npm run protocols:coverage` passes with one report-only warning (a second decision named in the review-routing section). Every level-2 and level-3 `CLAUDE.md` heading is covered or excluded with a reason. The manifest's definition of a protocol (it names a governing decision or is enforced by a check) is narrower than plain-English "mandatory": the Session Start mode declaration, the review-before-close step in both session checklists, and the Workflow Invariants conflict duty and supersession rule are excluded because nothing enforces them and no decision names them. Each exclusion says so and defers the question to M4. |
| 5 | Old entrypoints remain in force | MET | No M3 commit touched `CLAUDE.md`, `AGENTS.md`, `.claude/` or `.agents/`: `git log --oneline --name-only 1f4203e2..9b668922 -- CLAUDE.md AGENTS.md .claude .agents` returns nothing. (The DEC-20260910-A waiver entry in `CLAUDE.md`, PR #628, predates that range and is unrelated to M3.) Nothing was activated. |

## Milestone-review dimensions

**Dependency completeness.** No Notion dependency named in M3's own
inventories is left without a replacement or a stated reason. Social-post
tracking was deliberately dropped from the digest at M4, with its search log
and the limit of what the repository can see recorded in
`docs/operations/distribution-registry.md`.

**Semantic parity of replacement inputs.** The digest comparison's first live
run (GitHub Actions run 34561747548) showed unreviewed decisions repo 0,
Notion 1, and action required repo 1, Notion 10, where the Notion items are
mostly session logs and reports flagged "Action Required" as a reading list,
against the repository's founder-decision meaning from
`docs/company/DECISION-QUEUE.md`. This gap is real and disclosed. The
distribution and vendor-roster comparisons match on explicitly mapped fields,
and no equivalent undisclosed gap was found there.

**Reachability.** Every declared mechanism passes `scheduled:check`; the one
unverifiable item is named as such.

**Protocol-coverage completeness.** Mechanically complete against the
manifest's rule; substantively narrower than "every mandatory protocol", as
under criterion 4.

## Open items for M4 or the founder

- The digest's "action required" and "unreviewed decisions" meaning:
  founder-decision reading or reading-list reading. It changes what the
  founder reads each morning.
- Whether the Session Start mode declaration and the review-before-close step
  become protocol-coverage rows.
- How the production Railway digest reads repository data after cutover
  (image contents, a GitHub read at runtime, or moving the digest to GitHub
  Actions).
- Directory-listing version drift, and the openmercantil.es terms audit (its
  register entry records that no vendor-terms audit has covered it).
- The vendor register's `einsearch` entry is `active` from the dependency
  manifest while its only capability, `us-ein-match`, is not
  customer-visible; nothing cross-checks the two.
- `DEPENDENCY_SYNC_SKIPPED` warnings for providers the boot-time dependency
  sync never reaches; report-only by design.
- The coverage manifest allows one decision per row; the review-routing row
  is governed by more than one.

## Claims not supported by the repository

None found. Every shadow-mode, no-production-write, no-Notion-write and
exit-code claim checked held under direct inspection and a real gate run.

## Gates run at the reviewed commit

`vendors:check`, `distribution:check`, `scheduled:check`, `protocols:check`,
`protocols:coverage` (one report-only warning), `coverage-matrix:check`,
`context:check` (no warnings), `programs:check` and `codex:check` all
reported ok. `vendors:test`, `distribution:test`, `digest:shadow:test`,
`candidates:test`, `scheduled:test`, `protocols:test`,
`protocols:coverage:test`, and `node --test scripts/program-tracks.test.mjs
scripts/m2-closure-register.test.mjs` all passed with exit 0.

## Conditions

1. Before M4, settle the digest's "action required" and "unreviewed
   decisions" meaning.
2. Before M4, decide whether the Session Start mode declaration and the
   review-before-close step become protocol-coverage rows, or record why they
   stay outside the manifest's definition.
3. Before M4, settle how the production Railway digest will read repository
   data after cutover.

VERDICT: M3 EXIT MET WITH CONDITIONS
