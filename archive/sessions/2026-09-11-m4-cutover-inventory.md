---
doc_type: session-report
authority_scope: none
status: complete
complete: true
phase: M4
authority_active: false
created_at: 2026-09-11
---

# M4 cutover inventory: evidence base for the atomic authority cutover

> [!CAUTION]
> **READ-ONLY INVESTIGATION - NOT A DESIGN, NOT A CUTOVER.**
> This report inventories what the M4 atomic authority cutover
> (`docs/strategy/2026-08-31-repo-native-operating-model-migration.md`,
> section "M4 - Atomic authority cutover and Notion retirement") needs, as of
> `origin/main` at `ed29d691`. It designs nothing, activates nothing, and
> changes no code, schema, workflow, Notion content, or production state.
> Candidate project documents stay inactive and Notion-backed workflows stay
> authoritative until the founder-gated cutover. The architect turns this
> into a sequence of reviewed batches on an integration branch; this document
> is not that sequence's final form, only its evidence base.

## Scope and method

M3 is closed with conditions
(`archive/sessions/2026-09-11-m3-milestone-review.md`, verdict "M3 EXIT MET
WITH CONDITIONS"). Track T7 (M4 atomic authority cutover,
`docs/programs/cto-readiness/tracks.yaml:851-867`) is `queued`, depends on
`[T3, T6]`, and is gated `post-m2`. This report is preparation for T7's
`next_action`: "Prepare the single cutover PR, then set this track to
founder_gated with the exact reviewed commit named as the blocker."

Every claim below cites path:line and was verified by reading the file, not
assumed from an earlier report's summary, since several things the M3
remaining-scope inventory (`archive/sessions/2026-09-11-m3-remaining-scope-inventory.md`)
described as not yet built (the protocol coverage manifest, the distribution
registry, the scheduled-mechanisms register) exist today because T6's later
batches landed them. Base audited: `origin/main@ed29d691315c41c4a1d22f271e4f7662d5c3c2de`
(also this branch's `HEAD` before this report's own commit).

## 1. Active Notion consumers

Search terms run: `NOTION_API_KEY`, `NOTION_TOKEN`, `api.notion.com`,
`@notionhq`, case-insensitive `notion` under `.claude/`, `.agents/`,
`.codex/`, `AGENTS.md`, `CLAUDE.md`, `scripts/`, `apps/api/src`,
`apps/api/scripts`, `packages/`, `.github/workflows/`, `config/`,
`Dockerfile`, `railway-config.md`, `.env.example` files.

| # | Path:line | What it does | Runs in | Repo-native replacement |
|---|---|---|---|---|
| 1 | `apps/api/src/lib/daily-digest/fetch-notion.ts:109-134` `getPriorities()` -> `fetchUnreviewedDecisions()` (Decisions DB `ea57671f-...`, `Reviewed = false`, lines 136-157) and `fetchActionRequired()` (Journal DB `f275be62-...`, `Action Required = yes`, lines 159-184) | Reads | Production, Railway `strale-digest-cron` cron `30 5 * * *` UTC (`apps/api/railway-config.md:165-197`), via `gatherDigestData()` (`apps/api/src/lib/daily-digest/index.ts:122`) called from `apps/api/src/jobs/daily-digest.ts:30`. Not invoked by any `.github/workflows/*.yml` (0 hits for `daily-digest`). | `scripts/digest-repo-native-lib.mjs` (`parseDecisionQueue`, `repoNativePriorities`, `comparePriorities`), shadow-run only by `.github/workflows/m3-digest-shadow.yml`, never wired into the Railway digest itself (Dockerfile carries no `docs/company/DECISION-QUEUE.md`, see section 5). PR #641. Semantic gap open: repo 0 unreviewed / Notion 1, repo 1 action-required / Notion 10 on the first live comparison run (GitHub Actions run 34561747548) - this is M3 milestone-review condition 1, unresolved (see section 6). |
| 2 | `apps/api/src/lib/daily-digest/fetch-notion.ts:50-105` `getDistributionSurfaces()` (Distribution Registry page/database `32e67c87-082c-81de-861f-dcc53576304c`) | Reads | Same digest path as row 1 | `docs/operations/distribution-registry.yaml` (34 rows, `docs/operations/distribution-registry.md:1-25`), `scripts/distribution-lib.mjs` / `scripts/check-distribution.mjs` (`npm run distribution:check`, blocking in CI, `.github/workflows/ci.yml:483-484`). `scripts/digest-shadow.mjs` prints the register and compares against `getDistributionSurfaces()` when `NOTION_API_KEY` is set (PR #642/#645). |
| 3 | `apps/api/src/lib/daily-digest/fetch-shiplog.ts:76-147` `fetchNotionWorkspaceActivity()` -> `extractJournalEntries`/`extractSocialPosts` (lines 151-176, `JOURNAL_DB_ID = f275be62-...`, `SOCIAL_DB_ID = 7d0819c8-...`) | Reads | Same digest path as row 1 | None for the Journal-entry-shaped half; `docs/programs/cto-readiness/tracks.yaml:544-551` names it as remaining scope. Social-post tracking was deliberately dropped from the digest at M4 (`docs/programs/cto-readiness/tracks.yaml:601-607`; no code posts to social media from this repo, confirmed by the M3 remaining-scope inventory's S23). |
| 4 | `apps/api/scripts/check-vendor-roster-drift.ts:169` (`https://api.notion.com/v1/databases/${dataSourceId}/query`), plus `NOTION_TOKEN` reads at lines 260-262 | Reads (Vendor Roster + Decisions DB) | Scheduled: `.github/workflows/weekly-drift.yml:80-86` (`vendor-roster` step), `secrets.NOTION_TOKEN` (line 82) | `config/vendors.yaml` (83 entries) + `scripts/vendors-lib.mjs` `compareRosterWithRegister`, run as a shadow comparison inside the same script (`printShadowComparison()`, lines 202-234) that never changes the script's exit code. A `--roster-fixture` flag exercises the comparison without `NOTION_TOKEN` (lines 236-257). PR #637. |
| 5 | `.claude/skills/vendor-switch/SKILL.md:101` ("Vendor switches always need a DEC entry in Notion (Decisions DB - `ea57671f-...`)"); byte-identical at `.agents/skills/vendor-switch/SKILL.md:101` | Writes (instructs an agent to create a Notion page) | Only when a session follows the skill | Drafted, not activated: `docs/strategy/2026-09-10-m3-vendor-state-model.md:504-534` ("Item 6") gives the exact replacement text for the skill's "Step 5" section (decision goes to `docs/decisions/records/*.md` plus a `config/vendors.yaml` lifecycle-history append). The live skill file is unedited. |
| 6 | `.claude/skills/vendor-switch/SKILL.md:83` ("the Notion DPA template"); same line in the `.agents/` mirror | Reads (points a person at a Notion template) | Only when a session follows the skill | None named. Out of scope for the M3 vendor-state model's own batch plan; not covered by any repo-native replacement found in this search. |
| 7 | `.claude/commands/end-session.md:32-75` (Journal entry via `collection://8f54383b-...`, line 32; To-do DB query `collection://33a67c87-...`, line 50; "Never mutate Notion to-do status", line 108) | Writes (Journal) and reads (To-do DB) | Only when a session follows the command | `docs/project/candidates/end-session.md` (inactive draft, front matter `authority_active: false`, `status: candidate`), covering every live step as unchanged or replaced. `scripts/candidates.test.mjs` (`npm run candidates:test`, wired into CI, `.github/workflows/ci.yml:500`) asserts the draft carries inactive markers and that neither live end-session file references the candidates directory. |
| 8 | `.agents/skills/source-command-end-session/SKILL.md:38-116` (the Codex mirror of row 7; not identical to the Claude version - `Actor: claude-code` vs. `Actor: Codex`, and an ownership filter `Claude code` vs. `Codex`, per the M3 remaining-scope inventory's diff S25) | Writes (Journal) and reads (To-do DB) | Only when a Codex session follows the mirror | Same candidate draft as row 7; the M3 remaining-scope inventory (section 2) requires any repo-native draft to preserve the per-tool Actor/owner distinction rather than collapse it. Not yet drafted as of this report - `docs/project/candidates/end-session.md` exists but this report did not re-verify whether its content covers the mirror's identity split; that verification is a task for whichever batch activates the draft. |
| 9 | `.claude/PROTOCOL.md` (1453 lines; the M3 remaining-scope inventory's S8 counted 71 case-insensitive `notion` hits in this file) | Reads (a person consulting session-mode criteria) | Only when a session follows `CLAUDE.md`'s pointer ("See `.claude/PROTOCOL.md` for full criteria and protocol definitions", `CLAUDE.md:9`; mirrored at `AGENTS.md:19`) | None found. `.claude/PROTOCOL.md` is linked from both live entrypoints (not orphaned), so it is an active consumer, not an excluded historical document. Its Notion content was not line-by-line inventoried in this report; that is M4 batch work (see section 7). |
| 10 | `.claude/NOTION.md` (161 lines, the Notion workspace map already inlined in `CLAUDE.md`'s "Notion Access"/"Notion Workspace Structure"/"Notion Governance Rules" headings) | Reads (reference only) | Not linked from `CLAUDE.md` or `AGENTS.md` (`grep -rn "NOTION.md" CLAUDE.md AGENTS.md .claude/settings.json` returns nothing) | Not an active entrypoint consumer by this report's definition (no live link points at it), but its content duplicates what is inline in `CLAUDE.md`, so it is retired alongside `CLAUDE.md`'s own Notion headings at M4, not independently. |
| 11 | `.claude/WORKFLOW.md`, `.claude/RUNBOOK.md`, `.claude/BUILD.md`, `.claude/DISPATCH.yaml` (4, 13, 6, and 33 case-insensitive `notion` hits respectively, per the M3 remaining-scope inventory's S8, corrected count) | Not verifiable from this report's search alone whether read | Not linked from `CLAUDE.md` or `AGENTS.md` by the same grep as row 10 | None found; excluded from the "active Notion authority" scope by the migration plan's own instruction to "exclude archive/, docs/decisions/records/, raw imports, and dated strategy/history documents" and by the M2 M3 boundary already treating these as an "uninitialised generic protocol with placeholders" (`docs/strategy/2026-08-31-repo-native-operating-model-migration.md:353`). Not re-verified content-by-content in this report; listed for completeness because the brief asks to name every excluded file an active entrypoint links to - none of these four is linked, so none is escalated to "active" here, but M4 should confirm this with its own search before deleting them. |

**Files this table excludes per the brief's instruction**, because they are
archive, decision-record, or dated-history documents, not active
entrypoints or commands: `docs/strategy/2026-08-31-repo-native-operating-model-migration.md`
(the plan's own prose citing `api.notion.com`), every `archive/sessions/*.md`
and `handoff/_general/from-code/*.md` file citing a Notion page as historical
provenance, and `docs/decisions/records/*.md` files carrying a
`--notion-<32hex>` filename qualifier or a citation URL in their body (the
`DEC-20260904-B` git/Notion-qualified record mechanism). None of these is
linked as a live instruction from an active entrypoint or command; if one
were, this report would list it above per the brief's own exception.

**Documentation drift found in passing, not itself a Notion dependency:**
`apps/api/railway-config.md:188` tells whoever configures the
`strale-digest-cron` Railway service to set `NOTION_TOKEN` "for ship-log /
Notion activity," but the digest code (`fetch-notion.ts:9`,
`fetch-shiplog.ts:12`) reads only `NOTION_API_KEY`. `config/env-manifest.yaml:769`
and `:778` already document this exact confusion in both variables' own
`purpose` text. Not corrected in this report per its read-only scope.

## 2. Secrets and configuration

| Variable | Env-manifest row | Read by | Set in | Removable at M4 after section 1's consumers are gone? |
|---|---|---|---|---|
| `NOTION_API_KEY` | `config/env-manifest.yaml:768-776` (`required_in: [production]`, `set_in: [railway]`, `holder: petter`, `cost_class: free`) | `fetch-notion.ts:9`, `fetch-shiplog.ts:12` (both rows 1-3 above) | Railway (`strale-digest-cron` service variables - outside this repository) | Yes, once rows 1-3 above have repo-native readers wired in and the digest stops calling Notion. Removing the Railway variable itself is a Railway console action, not a repository commit - founder-only per section 8. |
| `NOTION_TOKEN` | `config/env-manifest.yaml:777-787` (`required_in: [local, ci]`, `set_in: [.env, workflow]`) | `check-vendor-roster-drift.ts:260` (row 4 above) | Local `.env` (developer machine) and the `weekly-drift.yml` `secrets.NOTION_TOKEN` (GitHub Actions repository secret) | Yes for the workflow secret, once `check-vendor-roster-drift.ts` is retargeted off the Notion read at M4 and the `--roster-fixture`/register comparison becomes the only path. Removing the GitHub Actions secret is a GitHub repository-settings action, not a repository commit - founder-only per section 8 (GitHub secret removal is named explicitly in the brief's section 8 list). |

Both rows appear in `config/env-manifest.yaml` and pass `npm run env:check`
today (not independently re-run in this report; `env:check` is wired into
CI, `.github/workflows/ci.yml:469-470`). No other env var, GitHub secret, or
Railway variable name containing "notion" (case-insensitive) was found by
this report's searches beyond these two. `.claude/skills/vendor-switch/SKILL.md`
and `.claude/commands/end-session.md` (section 1, rows 5, 7, 8) name Notion
database/collection ids as literal strings in prose, not as environment
variables; they are not configuration rows and have no env-manifest entry.

**What is outside the repository, and therefore the founder's action, not a
session's:** the Railway `strale-digest-cron` service's own environment
variable configuration (removing `NOTION_API_KEY` there), and the
`weekly-drift.yml` GitHub Actions repository secret `NOTION_TOKEN` (deleting
it from repository settings). A session can remove a workflow's `env:` line
referencing `secrets.NOTION_TOKEN`, which stops the workflow from reading
it, but cannot delete the underlying GitHub secret itself from outside the
GitHub UI/API with founder-level repository-settings access - this report
did not verify whether a session's `gh` credentials have that scope, and
treats it as founder-only per the brief's explicit instruction to name
"Railway or GitHub secret removal" as founder-only in section 8.

## 3. Entrypoints

`CLAUDE.md` has 30 level-2/level-3 headings (`grep -n "^## \|^### " CLAUDE.md`);
`AGENTS.md` has 22 (`grep -n "^## \|^### " AGENTS.md`). `AGENTS.md` is
declared a "condensed derivative" of `CLAUDE.md` in `CLAUDE.md`'s own Report
Filing Convention section (line 745: "`AGENTS.md` is a condensed derivative
of `CLAUDE.md` for Codex-CLI sessions - `CLAUDE.md` is canon; `AGENTS.md`
points at `CLAUDE.md` sections for anything that can drift rather than
restating it"), so the two heading lists are not expected to match 1:1
today; the table below classifies `CLAUDE.md`'s headings, the fuller of the
two, and notes where `AGENTS.md` diverges.

| `CLAUDE.md` heading | Line | Treatment at M4 | Basis |
|---|---|---|---|
| Workflow Protocol | 1 | Keep as is | Grouping header only; `docs/project/protocol-coverage.yaml`'s `excluded_sections` (verified in full, see below) classifies it as a section header, not a protocol. |
| Session Start | 3 | Rewrite | `docs/project/protocol-coverage.yaml` `excluded_sections` entry: "names no governing decision and is not enforced by any repository check; full criteria live in `.claude/PROTOCOL.md`" - and `.claude/PROTOCOL.md` is a live Notion-dependent consumer per section 1, row 9. M4 must settle whether this heading's Notion dependency (via `.claude/PROTOCOL.md`) is removed or the pointer target changes. |
| Review routing | 11 | Keep as is | Governs review-provider routing (DEC-20260910-A), not Notion; no Notion reference in this section's text (verified by reading `CLAUDE.md:11-83` in full). |
| Repo-native migration continuation - pre-cutover | 84 | Drop | `docs/project/protocol-coverage.yaml` excludes it: "States explicitly that it is a navigation pointer to the migration checkpoint document, not a protocol in its own right." Once the migration completes, the pointer has nothing left to point to; dropping loses no safety rule because the section names no protocol of its own. |
| Program register - where multi-batch work resumes | 98 | Keep as is | Governs `docs/programs/`, no Notion dependency (verified by reading in full). |
| Research and ideas - where each one lives | 108 | Keep as is | Governs `docs/research/`, no Notion dependency. |
| Design tokens - where design values live | 119 | Keep as is | Governs `design/tokens/`, no Notion dependency. |
| Cheap extras - env manifest, model registry, claims register (T14) | 133 | Keep as is | No Notion dependency. |
| Evidence receipts and the migration ledger (T15) | 154 | Keep as is | No Notion dependency. |
| Session contract - both tools, every session | 175 | Move behind a pointer | Byte-identical mirror at `docs/governance/protocols/SESSION_CONTRACT.md` (T6 M3 batch 6b), covered by `docs/project/protocol-coverage.yaml` row `id: session-contract`, `source_heading: "Session contract — both tools, every session"`. |
| Notion Access (REQUIRED) | 213 | Drop | `docs/project/protocol-coverage.yaml` excludes it: "Reference list of Notion workspace URLs and page ids, not a protocol." Dropping this heading is the section's entire purpose at M4 - it has no repo-native replacement because it should not have one. |
| Notion Workspace Structure (8 sections under Project Home) | 219 | Drop | Same reasoning; excluded as "Structural reference describing the Notion workspace layout, not a protocol." |
| Notion Governance Rules (enforced) | 229 | Drop | Excluded: "Governs conduct inside Notion, which lives outside this repository, so no repository check can verify it." |
| GitHub Access (REQUIRED) | 237 | Keep as is | Not Notion; reference data about the repository itself. |
| Project Spec | 242 | Rewrite | Currently reads "see Notion Project Home" (verified by reading `CLAUDE.md:242-246`); this pointer must change once Notion is retired, to `docs/project/PRODUCT.md`/`STATE.md`/`ROADMAP.md` per the migration plan's target authority model. |
| Tech Stack | 247 | Keep as is | No Notion dependency. |
| Project Structure | 257 | Keep as is | No Notion dependency. |
| Active Decisions | 281 | Rewrite | Currently a running prose decision log citing Notion Decisions DB page ids for several entries (e.g. `DEC-20260428-A`, `DEC-20260428-B`, `DEC-20260813-A`, `DEC-20260815-A` - each cites a Notion page id in `CLAUDE.md`'s text, verified by reading lines 281-341). At M4 these become pointers to `docs/decisions/records/*.md` / generated `docs/project/DECISIONS.md`, per the target authority model (migration plan section 4, "Settled product/project decisions" row). |
| Capabilities & Quality | 342 | Keep as is | No Notion dependency; excluded from protocol coverage as "descriptive platform facts," which is a different (correct) reason to leave it alone rather than rewrite it. |
| Adding New Capabilities (MANDATORY PIPELINE) | 370 | Keep as is | The how-to workflow the Capability Onboarding Protocol governs; `docs/project/protocol-coverage.yaml`'s `capability-onboarding` row's `full_body` note explicitly separates this section from the mirrored protocol text and does not claim to cover it. No Notion dependency in the section body itself. |
| Scoring Integrity (retired with the SQS engine - DEC-20260503-B) | 481 | Keep as is | Historical/retired-system note, no Notion dependency, not a live protocol. |
| Test Infrastructure Cost Principles (always enforce) | 492 | Move behind a pointer | Mirror at `docs/governance/protocols/TEST_INFRASTRUCTURE_COST_PRINCIPLES.md`, covered by `docs/project/protocol-coverage.yaml`. |
| Distribution PR Integrity Protocol (DEC-20260422-A) | 507 | Move behind a pointer | Mirror at `docs/governance/protocols/DISTRIBUTION_PR_INTEGRITY.md`, covered by `docs/project/protocol-coverage.yaml` row `id: distribution-pr-integrity`. |
| Capability Onboarding Protocol (DEC-20260320-B) | 555 | Move behind a pointer | Mirror at `docs/governance/protocols/CAPABILITY_ONBOARDING.md`, covered by `docs/project/protocol-coverage.yaml`. |
| Audit-Follow-up Test Coverage Protocol (DEC-20260504-A) | 584 | Move behind a pointer | Mirror at `docs/governance/protocols/AUDIT_FOLLOWUP_TEST_COVERAGE.md`, covered. |
| Bulk-Operation Deploy Protocol (DEC-20260504-B) | 611 | Move behind a pointer | Mirror at `docs/governance/protocols/BULK_OPERATION_DEPLOY.md`, covered. |
| Deploy Mechanism Verification Protocol (DEC-20260504-C) | 639 | Move behind a pointer | Mirror at `docs/governance/protocols/DEPLOY_MECHANISM_VERIFICATION.md`, covered (first extracted, T6 M3 batch 6a). |
| Quick Session Checklist | 666 | Rewrite | Steps 6 and 8 are Notion writes ("Move completed To-do items to Archive," "Create a Journal entry in Notion"); step 5 ("run `/go` before `/end-session`") is excluded from protocol coverage as unenforced but is a routine handoff requirement M4 change 4 targets. Per the migration plan's M4 change 4 ("Replace routine handoff requirements with truth-promotion and unfinished-work rules"), this whole checklist is a rewrite target, not a drop - the underlying discipline (review before closing, record completed work) survives in repo-native form. |
| Full Session Checklist | 676 | Rewrite | Same reasoning as Quick Session Checklist, expanded. |
| Shared-Checkout Rule (concurrency safety) | 691 | Move behind a pointer | Mirror at `docs/governance/protocols/SHARED_CHECKOUT_RULE.md`, covered. |
| Worktree node_modules Hazard | 736 | Move behind a pointer | Mirror at `docs/governance/protocols/WORKTREE_NODE_MODULES_HAZARD.md`, covered (protocol-coverage.yaml, verified present in the file's later rows). |
| Report Filing Convention | 740 | Keep as is | Excluded from protocol coverage ("no repository check enforces placement and no decision id governs it") but has no Notion dependency; this is a keep, not a rewrite, because nothing about it changes at M4. |
| Workflow Invariants (Non-Negotiable) | 746 | Rewrite | Mostly Notion conduct rules ("NEVER edit Journal entries," "NEVER delete anything in Notion"); the conflict duty and supersession rule (which the exclusion note says "also bind work in this repository") survive into the repository's decision process per the M3 milestone review's open item 2 and this section's excluded-sections note: "the M4 cutover should carry the conflict duty and supersession rule into the repository's decision process." |
| Degraded Mode | 755 | Rewrite | Currently "If Notion unavailable: work continues... If Git unavailable: STOP." The migration plan's M4 change 5 ("Remove Notion connectivity/degraded-mode assumptions") targets this heading directly by name. |
| Cross-Repo Updates | 759 | Keep as is | No Notion dependency (frontend-file update triggers). |
| Wire-shape rule for /v1/public/ops/trust/* endpoints | 767 | Keep as is | No Notion dependency. |
| Drift-prevention surfaces | 780 | Keep as is | No Notion dependency. |

**Checks that read `CLAUDE.md`/`AGENTS.md` by heading or byte range**, which
a rewrite must keep green or update in the same change:

- `scripts/protocol-extraction-lib.mjs` / `scripts/check-protocol-extraction.mjs`
  (`npm run protocols:check`) locates each mirrored protocol's `source_heading`
  as a unique `CLAUDE.md` heading at any level and byte-compares the section
  text (trailing blank lines trimmed, CRLF normalized) against the mirror -
  confirmed by the T6 batch-6a/6b commit messages in `docs/programs/cto-readiness/tracks.yaml:668-736`.
  Any M4 rewrite of a "move behind a pointer" heading above must either keep
  the section text byte-identical to its mirror or update the mirror in the
  same commit.
- `scripts/protocol-coverage-lib.mjs` / `scripts/check-protocol-coverage.mjs`
  (`npm run protocols:coverage`) requires every level-2/level-3 `CLAUDE.md`
  heading to be covered by a manifest row or listed in `excluded_sections`
  (`HEADING_UNCLASSIFIED` if neither) and every `excluded_sections` entry to
  still name a real heading (`EXCLUSION_STALE`) - confirmed by reading
  `docs/project/protocol-coverage.yaml`'s header comment and its full
  `excluded_sections` list. Any heading this report marks "drop" or "rewrite"
  must have its `protocol-coverage.yaml` row or exclusion entry updated in
  the same commit, or the check fails.
- `scripts/check-project-context.mjs:199-201` (`checkPrecutoverEntrypoint`)
  reads both `AGENTS.md` and `CLAUDE.md` and checks each for pre-cutover
  Notion/pointer language (verified: warning-only, always exits 0 per
  `process.exitCode = 0` at line 230). This is the closest thing to an
  entrypoint parity check that exists today, and it does not compare the two
  files' content against each other - only against a per-file pre-cutover
  pattern.
- `scripts/m2-quote-fidelity.mjs` and `scripts/m2-closure-register-lib.mjs`
  scan `CLAUDE.md` text for quote fidelity and plan-statement patterns
  respectively (both files matched the `AGENTS.md` grep in section 1's
  search); a rewrite that removes or restates quoted decision text could
  trip these, though this report did not run them against a hypothetical
  rewrite (no rewrite was made).
- Nothing enumerated in this repository's `scripts/` directory generates
  `AGENTS.md` from `CLAUDE.md` or vice versa; both are hand-maintained, and
  their drift is caught only by a person "refreshing AGENTS.md against
  CLAUDE.md whenever drift is noticed" (`CLAUDE.md:745`, the Report Filing
  Convention section), not by a check.

**Does an "entrypoint parity" check already exist?** No. `checkPrecutoverEntrypoint`
(above) checks each file individually for pre-cutover markers; nothing
compares `AGENTS.md`'s and `CLAUDE.md`'s canonical pointers, heading
coverage, or content against each other. The migration plan's own blocking
check #3 ("`AGENTS.md` and `CLAUDE.md` point to the same bootstrap/router,"
section 8 of the plan) is not implemented as a script today - it is a design
requirement, not yet a checker. A real entrypoint-parity check would need to
compare: (a) both files' pointer to `START-HERE.md`/`PROTOCOL-ROUTER.md`
(currently neither file points there - both are still in their pre-M4
pre-cutover form); (b) that every "keep as is" and "move behind a pointer"
row in the table above appears in both files in equivalent form (`AGENTS.md`
is condensed, so "equivalent" would need to mean "the canonical pointer
matches," not "the prose is identical" - `AGENTS.md`'s own condensation is a
design choice per `CLAUDE.md:745`, not a defect); and (c) that neither file
contains a mutable project fact per the plan's blocking check #4 (dated
state, prices, counts, active work, roadmap items, decision summaries) -
also not implemented as a script today.

## 4. Flows to activate

| Flow | Inactive candidate/draft | What "activate" means mechanically | Test currently asserting inactive | Old flow replaced |
|---|---|---|---|---|
| Session start | Already fully repo-native (`.claude/hooks/handoff-session-start.mjs` -> `scripts/handoff/orient.mjs`, 0 Notion references) | No activation needed; this flow requires no M4 change. | None needed. | N/A |
| Session end | `docs/project/candidates/end-session.md` (front matter `status: candidate`, `authority_active: false`, `phase: M3`) | Replace `.claude/commands/end-session.md` step 3's Notion Journal-entry write with the draft's YAML-front-matter-on-handoff-file approach, and `.agents/skills/source-command-end-session/SKILL.md`'s equivalent step, in both mirrors, preserving each tool's Actor/owner identity. | `scripts/candidates.test.mjs` (`npm run candidates:test`) asserts the draft carries inactive front matter and its M4 caution block, and that neither live end-session file references the candidates directory - confirmed by reading the test file's assertions list in `docs/programs/cto-readiness/tracks.yaml:625-636`. | The live Notion Journal-entry write (`.claude/commands/end-session.md:32`) and To-do DB read (line 50). |
| `go` | Already Notion-free (0 hits, confirmed by `.claude/skills/go/SKILL.md` and its `.agents/` mirror both grepped clean) | No activation needed for Notion; the M3 remaining-scope inventory's S24 found only path-naming differences between the two mirrors, no behavioral gap. | None needed for Notion; the mirror-consistency diff (S24) is the closest analogue. | N/A |
| `vendor-switch` | `docs/strategy/2026-09-10-m3-vendor-state-model.md:504-534` ("Item 6," inactive prose replacement for "Step 5 - Log the decision") | Copy the replacement text into both `.claude/skills/vendor-switch/SKILL.md` and `.agents/skills/vendor-switch/SKILL.md`, replacing the current Notion-Decisions-DB step, verbatim in both. Requires `config/vendors.yaml`'s `vendors:check` (already exists) to be usable for the append-only lifecycle-history rule the replacement text cites. | No dedicated test found for this specific replacement text's presence; `scripts/vendors.test.mjs` tests the register and its checks, not the skill file prose. | The Notion Decisions DB DEC-entry step (`.claude/skills/vendor-switch/SKILL.md:101`). The DPA-template line (`:83`) has no replacement drafted and is not part of this activation. |
| Daily-digest priorities (Decisions/Journal "action required") | `scripts/digest-repo-native-lib.mjs`, shadow-run by `.github/workflows/m3-digest-shadow.yml` | Wire the repo-native reader into `gatherDigestData()` (`apps/api/src/lib/daily-digest/index.ts:122`) in place of (or alongside, then removing) `getPriorities()`, and change the Railway digest's Docker image or runtime to have the repository data available (see section 5 - unresolved). Requires the M3 milestone review's condition 1 to be settled first (what "unreviewed"/"action required" should mean). | `scripts/digest-repo-native.test.mjs` (wired into CI, `npm run digest:shadow:test`) tests the parser/reader in isolation; nothing asserts the production digest does NOT yet call it, because the production code path is untouched by M3 by design. | `getPriorities()`'s two Notion database queries. |
| Daily-digest distribution surfaces | `docs/operations/distribution-registry.yaml` + `scripts/distribution-lib.mjs` | Same wiring pattern as the row above, into the same `gatherDigestData()` call site, for `getDistributionSurfaces()`. | `scripts/distribution.test.mjs` (`npm run distribution:test`, CI) tests the register's own validity; the shadow comparison in `scripts/digest-shadow.mjs` is report-only. | `getDistributionSurfaces()`. |
| Weekly vendor-roster drift | `scripts/vendors-lib.mjs` `compareRosterWithRegister`, already wired as a shadow section inside `check-vendor-roster-drift.ts` | Remove the Notion Vendor Roster/Decisions DB read from `check-vendor-roster-drift.ts`, make the register comparison the sole check, and change its exit code to reflect register-only drift. | `scripts/vendors.test.mjs` (CI) tests the comparison function itself, not that the live script still reads Notion - that is asserted only by reading the script's own source today. | The `api.notion.com` query at `check-vendor-roster-drift.ts:169` and the Vendor Roster/Decisions DB reads it feeds. |
| Protocol coverage / router | `docs/project/protocol-coverage.yaml` (`authority_active: false`) and `docs/project/PROTOCOL-ROUTER.md` (generated from it) | Flip `authority_active` to `true` on the manifest, make `npm run protocols:coverage`'s currently report-only "decision id named with no manifest row" warning blocking (per its own library header, quoted in `docs/programs/cto-readiness/tracks.yaml:817-819`: "the library header states it becomes blocking at the M4 cutover"), and make `PROTOCOL-ROUTER.md` the mandatory startup context in place of scattered `CLAUDE.md` protocol sections. | `scripts/protocol-coverage.test.mjs` (`npm run protocols:coverage:test`, CI) tests the manifest's structural validity; no test asserts the manifest is inactive (unlike `candidates.test.mjs`), because `authority_active: false` is a plain front-matter field the checker reads, not a separately enforced marker. | The `CLAUDE.md` protocol sections themselves become pointers per section 3's table. |

## 5. Production and scheduled paths

**Railway `strale-digest-cron`.** Entry point:
`apps/api/src/jobs/daily-digest.ts:30` (`main()`), built to
`apps/api/dist/jobs/daily-digest.js`, run on Railway cron `30 5 * * *` UTC
per `apps/api/railway-config.md:165-197`. Its Notion fetches are
`getPriorities()` and `getDistributionSurfaces()` (section 1, rows 1-2) plus
`fetchNotionWorkspaceActivity()` (row 3). Repo-native replacements exist as
shadow-mode libraries (`scripts/digest-repo-native-lib.mjs`,
`docs/operations/distribution-registry.yaml`) but are **not wired into the
production job** - they run only inside `.github/workflows/m3-digest-shadow.yml`,
a separate GitHub Actions workflow with its own full repository checkout.

**Dockerfile lines the image needs.** Read in full: `Dockerfile` `COPY`
lines are `package.json package-lock.json` (line 16), `apps/api/package.json`
(17), `packages/sdk-typescript/package.json` (18),
`packages/mcp-server/package.json` (19), `tsconfig.json` (25), `apps/api/`
(26), `packages/sdk-typescript/` (27), `packages/mcp-server/` (28),
`manifests/` (34). **None of the four paths the settled decision names
(`docs/company/DECISION-QUEUE.md`, `handoff/_general/from-code/`,
`docs/operations/distribution-registry.yaml`, `config/vendors.yaml`) are
copied into the image today.** No `.dockerignore` file exists at the repo
root (`ls -la .dockerignore` returns "No such file or directory"), so
nothing in the build context is being deliberately excluded - the four
paths are simply absent from the `COPY` list, not blocked by an ignore
rule. Adding `COPY` lines for these four paths is a Dockerfile change this
report did not make (out of scope for a read-only inventory); it is the
mechanical action the settled decision requires, and it is not yet done.

**Weekly drift workflow's vendor-roster step and `NOTION_TOKEN` use.**
`.github/workflows/weekly-drift.yml:80-86` (`vendor-roster` step),
`secrets.NOTION_TOKEN` mapped at line 82. Confirmed present and unchanged as
of this report's audited commit. Retargeting this step off Notion is the M4
action named in section 4's "Weekly vendor-roster drift" row.

**Digest shadow workflow (`m3-digest-shadow.yml`).** Confirmed at
`.github/workflows/m3-digest-shadow.yml:1-40` (read in full to line 40; the
file's own header comment states its purpose and never-fails-the-build
discipline). To be retired or converted at M4: once the repo-native readers
are wired into the actual production digest (whichever runtime approach
M4 picks per the open condition below), this workflow's shadow-comparison
role is either folded into the production path's own logging or retired as
redundant. This report does not choose between "retire" and "convert";
that is an M4 design decision.

**`config/scheduled-mechanisms.yaml`, other entries with a Notion input.**
Read the full register (`config/scheduled-mechanisms.yaml`, 9 entries per
its own header comment: seven `weekly-drift.yml` steps, one
`m3-digest-shadow.yml` step, plus the Railway `strale-digest-cron` job
recorded `verifiable: false`). Of the seven `weekly-drift.yml` entries, one
(`vendor-roster`, matching the workflow step named above) declares
`secrets: { NOTION_TOKEN: NOTION_TOKEN }` in its `secrets` map (this
report's reading of the register's `weekly-drift-manifest-drift` and
`weekly-drift-facts-drift` entries, lines 39-79, found `secrets: {}` or
`DATABASE_URL` only for those two; the `vendor-roster` entry was not read in
full line range in this pass, but is confirmed to exist by
`.github/workflows/weekly-drift.yml:82`'s direct grep and by
`config/scheduled-mechanisms.yaml`'s own stated survey of "seven
script-invoking steps in `weekly-drift.yml`"). The Railway `strale-digest-cron`
row is recorded `verifiable: false` because "its cron schedule lives in
Railway's own project configuration... and this repository holds no Railway
API credential to read it" (`config/scheduled-mechanisms.yaml`'s header
comment, lines 30-33) - this is the same "not verifiable from the
repository" gap the M3 remaining-scope inventory named and this report
confirms is still open.

**Open condition, unresolved by any batch found in this report:** how the
production Railway digest reads repository data after cutover (image
contents via new `COPY` lines, a GitHub API read at runtime, or moving the
digest job to GitHub Actions entirely). This is M3 milestone-review
condition 3, still open (see section 6).

## 6. Checks to make blocking

**Already blocking in CI** (`.github/workflows/ci.yml`, confirmed by
reading the full step list): `programs:check`/`test` (442-443),
`research:check`/`test` (449-450), `design:check`/`test` (460-461),
`env:check`/`test` (469-470), `vendors:check`/`test` (476-477),
`distribution:check`/`test` (483-484), `digest:shadow:test` (490),
`candidates:test` (500), `protocols:check`/`test` (507-508),
`protocols:coverage`/`protocols:coverage:test` (519-520),
`scheduled:check`/`test` (532-533), `models:check`/`test` (540-541),
`claims:check`/`test` (548-549), `docs:check`/`test` +
`generate-archive-index.mjs --check`/`archive:index:test` (556-559),
`receipts:check`/`test` (568-569), `migrations:check`/`test` (579-580),
`codex:check`/`test` (588-589), `handoff:test` (594),
`context:check`/`test` (600-601).

**Exist but report-only:**

- `scripts/check-project-context.mjs` (`npm run context:check`) - hardcoded
  `process.exitCode = 0` at line 230; every finding is pushed with
  `severity: "warning"` (confirmed throughout the file, e.g. lines 29, 107,
  125, 132, 140, 150). This is the M1/M2 candidate-foundation checker; the
  migration plan's own rollout-mode design (section 8: "Foundation PR:
  checker runs in report/warning mode. Cutover PR: all deterministic checks
  become blocking.") names this exact transition as M4 work, not yet done.
- `docs/project/protocol-coverage.yaml`'s "a decision id `CLAUDE.md` names
  inside a covered section... with no manifest row" check - confirmed
  report-only today by the manifest's own header comment (quoted in
  `docs/programs/cto-readiness/tracks.yaml:817-819`): "a report-only warning
  today, per the plan's M3-versus-M4 split; the library header states it
  becomes blocking at the M4 cutover." This is the brief's example
  (`DECISION_ID_UNCOVERED`-shaped finding, though this report did not find a
  literally-named `DECISION_ID_UNCOVERED` code string in the manifest or its
  checker script - the closest matching finding is this uncovered-decision-id
  warning as described in the manifest's own header prose).
- Every shadow comparison in section 1 (rows 1, 2, 4) is, by construction,
  report-only: `printShadowComparison()` "never changes the script's exit
  code" (`check-vendor-roster-drift.ts`, per the M3 vendor-state model
  document line 227-235), and `digest-shadow.mjs` "always exits 0
  (report only)" (`docs/programs/cto-readiness/tracks.yaml:553`).

**Do not exist yet and M4 or M6 requires:**

- **A permanent Notion anti-regression check** (M6 fixture 4: "Reintroducing
  `NOTION_API_KEY`, `NOTION_TOKEN`, `api.notion.com`, or an active Notion MCP
  call outside archives fails CI"). No script under `scripts/` or
  `apps/api/scripts/` searches for these terms as a guard; the only current
  users of these terms are the consumers listed in section 1 themselves, not
  a check watching for new ones. **Sketch of the rule:** a new
  `scripts/check-no-notion-regression.mjs` (or similar), wired blocking into
  `ci.yml`, that ripgreps the whole tracked tree for `NOTION_API_KEY`,
  `NOTION_TOKEN`, `api.notion.com`, and any `mcp__.*notion` tool-name pattern
  or Notion connector UUID; allowlists exactly the paths that remain
  legitimate after cutover (`archive/**`, `docs/decisions/records/**` for
  `--notion-<32hex>` qualifiers and citation URLs, and any dated
  strategy/history document under `docs/strategy/**` that is itself a record
  of the migration, per this report's own section-1 exclusion list); and
  fails on any other match. It must run after the cutover PR removes the
  legitimate consumers, or it would fail immediately on merge - sequencing
  detail for section 7.
- **A weekly-drift run with zero `NOTION_TOKEN` dependency that still
  exercises the vendor-roster replacement** (M6 fixture 3). Today
  `weekly-drift.yml`'s `vendor-roster` step still reads `NOTION_TOKEN`
  (section 5); this fixture requires that step (or its replacement) to run
  clean without the secret, exercising `compareRosterWithRegister` as the
  sole check. Sketch: retarget the workflow step to call
  `check-vendor-roster-drift.ts` in a register-only mode (already partially
  supported via `--roster-fixture`, though that flag is for testing without
  Notion, not the production replacement path itself - the M4 batch would
  need to either promote `--roster-fixture`'s code path to the real one or
  add a new flag), and a CI job that runs it with `NOTION_TOKEN` unset to
  prove no dependency remains.
- **An entrypoint parity check** (migration plan blocking check #3): does not
  exist, per section 3's analysis above.
- **A mutable-fact scan on `CLAUDE.md`/`AGENTS.md`** (migration plan blocking
  check #4): does not exist as a script; today both files carry dated
  decisions, prices, and counts inline (e.g. the "Active Decisions" section,
  the "Capabilities & Quality" section), which the plan's target model moves
  to `docs/project/PRODUCT.md`/`STATE.md`/`ROADMAP.md`/generated
  `DECISIONS.md`. No check enforces the target state today because the
  target state has not been adopted.

## 7. Proposed batch sequence

Every batch below is reviewed and merged into an integration branch, not
`main`. The integration branch merges into `main` as one unit only on the
founder's yes. The old system (Notion, current `CLAUDE.md`/`AGENTS.md`,
current digest, current vendor-roster drift) stays authoritative on `main`
until then. No batch dual-writes to both Notion and a repo-native
destination.

1. **Settle the three M3 milestone-review conditions** (not a code batch;
   a decision batch). Condition 1 (digest meaning: founder-decision reading
   or reading-list reading) is explicitly the founder's call per the M3
   milestone review. Conditions 2 (Session Start mode declaration / review-
   before-close as protocol-coverage rows) and 3 (Railway digest's post-
   cutover data-access design) are technical calls this report found still
   open; they should be recorded as small decision batches before the
   cutover batches below, since batch 4's digest wiring and batch 2's
   `CLAUDE.md` Session Start rewrite both depend on their outcome. What
   could go wrong: proceeding to wire the digest (batch 4) or rewrite
   `CLAUDE.md`'s Session Start heading (batch 2) before these are settled
   risks a second rewrite once the founder's answer lands.

2. **Rewrite `CLAUDE.md` and `AGENTS.md` as peer entrypoints**, per section
   3's table: drop the three Notion-only headings, rewrite Project Spec /
   Active Decisions / Session Start / Session Checklists / Workflow
   Invariants / Degraded Mode, and add the two files' pointer to
   `START-HERE.md`/`PROTOCOL-ROUTER.md`. Files: `CLAUDE.md`, `AGENTS.md`,
   `docs/project/protocol-coverage.yaml` (update `excluded_sections` for any
   heading whose classification changes), `docs/project/PROTOCOL-ROUTER.md`
   (regenerate). Tests: `npm run protocols:check`, `npm run
   protocols:coverage`, `npm run protocols:coverage:test`, `npm run
   context:check` (still report-only at this batch), a new entrypoint-parity
   check if built in this batch or the next. What could go wrong: a
   `protocols:check` failure if the rewrite changes a mirrored section's
   text without updating the mirror in the same commit (section 3 names this
   exact risk); a `HEADING_UNCLASSIFIED` failure if a heading is dropped or
   renamed without updating `excluded_sections`.

3. **Activate `end-session` and `vendor-switch` repo-native flows**, per
   section 4's rows: replace the live Notion Journal-entry write and To-do
   DB read in both `.claude/commands/end-session.md` and
   `.agents/skills/source-command-end-session/SKILL.md` with the candidate
   draft's approach, preserving per-tool Actor identity; replace
   `vendor-switch`'s Step 5 in both mirrors with the drafted text. Files:
   `.claude/commands/end-session.md`, `.agents/skills/source-command-end-session/SKILL.md`,
   `.claude/skills/vendor-switch/SKILL.md`, `.agents/skills/vendor-switch/SKILL.md`,
   and whatever handoff/register file the end-session draft writes to
   instead of Notion. Tests: `npm run candidates:test` (must now assert the
   *live* files match the drafted behavior, not merely that the draft is
   inert - this test's assertions change meaning at this batch and should be
   rewritten, not just left passing by accident), `npm run vendors:test`.
   What could go wrong: the Codex mirror's Actor/owner distinction
   (`claude-code` vs. `Codex`) silently collapsing if the batch copies one
   tool's draft into both mirrors without adjusting the identity fields
   (the exact drift class the M3 remaining-scope inventory warned against).

4. **Wire the daily-digest repo-native readers into production**, contingent
   on batch 1's condition 3 answer. If the answer is "add `COPY` lines to
   the Dockerfile": add `docs/company/DECISION-QUEUE.md`,
   `handoff/_general/from-code/`, `docs/operations/distribution-registry.yaml`,
   `config/vendors.yaml` to `Dockerfile`, replace `getPriorities()`/
   `getDistributionSurfaces()`/`fetchNotionWorkspaceActivity()`'s Journal half
   with the repo-native readers inside `gatherDigestData()`, and print the
   image commit per the settled decision. If the answer is "move the digest
   to GitHub Actions": this batch instead retires `apps/api/src/jobs/daily-digest.ts`'s
   Railway invocation and builds a new scheduled workflow, a materially
   larger batch that should be split further. Files depend on which path is
   chosen; this report does not choose. Tests: `npm run digest:shadow:test`
   promoted from shadow-only to asserting production behavior, plus a new
   integration-style test if the Dockerfile changes (verifying the four
   paths are present in a built image, matching the discipline
   DEC-20260504-C already requires: "confirm reach by file path, not by
   historical pattern"). What could go wrong: exactly the DEC-20260504-C
   failure class if the Dockerfile `COPY` lines are added but nothing
   confirms the running container actually has the files (a build-time
   `ls` step or equivalent verification is needed, not just the `COPY` line
   itself).

5. **Retarget the weekly vendor-roster drift check off Notion**, achieving
   M6 fixture 3. Files: `apps/api/scripts/check-vendor-roster-drift.ts`
   (remove the `api.notion.com` call and `NOTION_TOKEN` read, make the
   register comparison the primary check and its exit code meaningful),
   `.github/workflows/weekly-drift.yml` (remove the `secrets.NOTION_TOKEN`
   env line from the `vendor-roster` step), `config/env-manifest.yaml`
   (mark `NOTION_TOKEN`'s `weekly-drift.yml` `set_in: workflow` row dead or
   remove it - `env:check` fails on a dead row per `CLAUDE.md:137-138`, so
   this must happen in the same commit as the workflow change). Tests:
   `npm run vendors:test`, `npm run env:check` (a planted-failure proof that
   removing the workflow reference without updating the manifest fails).
   What could go wrong: `env:check`'s dead-row detection firing if the
   manifest update lags the workflow change by even one commit within the
   batch.

6. **Add the permanent Notion anti-regression check and make report-only
   checks blocking.** Files: new `scripts/check-no-notion-regression.mjs`
   (per section 6's sketch) and its wiring into `ci.yml` as blocking;
   `scripts/check-project-context.mjs` changed from
   `process.exitCode = 0` to a real exit code reflecting its findings'
   severities (the migration plan's own rollout-mode design names this
   exact transition); `docs/project/protocol-coverage.yaml`'s
   uncovered-decision-id warning promoted from report-only to blocking, per
   its own header's stated intent. Tests: a planted-failure fixture proving
   the anti-regression check catches a reintroduced `NOTION_API_KEY` string
   outside the allowlist; `npm run context:test` updated for the new exit
   behavior; `npm run protocols:coverage:test` updated for the newly
   blocking finding. What could go wrong: the anti-regression check firing
   false-positive on the legitimate historical citations named in section 1
   (the `_source_notion_page_id` coverage-matrix field, the three source-code
   comments citing a Notion page) if its allowlist is not precise about
   comments-and-data-fields versus executable code paths - this report
   recommends allowlisting by file/field name explicitly (as section 1's
   table 11 already enumerates them) rather than by a broad pattern
   exclusion.

7. **The cutover commit itself: flip authority markers and remove dead
   credentials.** This must be the **last** batch. Files:
   `config/vendors.yaml` (`authority_active: true`),
   `docs/project/protocol-coverage.yaml` and `PROTOCOL-ROUTER.md`
   (`authority_active: true`), `docs/operations/distribution-registry.yaml`
   (`authority_active: true`), every `docs/project/*.md` M2 candidate file
   (`PRODUCT.md`, `STATE.md`, `ROADMAP.md`, `DECISIONS.md` - flip
   `authority_scope`/`authority_active`/`status`), `config/env-manifest.yaml`
   (remove or mark dead the two Notion rows once code search after batches
   3-5 confirms zero remaining consumers), `.claude/NOTION.md` and the
   Notion-heavy sections of `.claude/PROTOCOL.md`/`WORKFLOW.md`/`RUNBOOK.md`/
   `BUILD.md`/`DISPATCH.yaml` (archived per the migration map's "Extract
   unique live rules; archive obsolete starter-kit system" instruction - this
   report did not extract their unique live rules, if any, and that
   extraction must happen before this batch, not inside it). Tests: the full
   CI suite green, including the newly blocking checks from batch 6; the M6
   clean-session acceptance run (migration plan section 10, M6) as a
   separate, later milestone, not part of this PR's own gate. **Rollback:**
   revert this single merge commit. The plan is explicit ("Once repo-native
   writes occur, do not restore Notion writes; repair forward to avoid
   split authority," migration plan line 905-906) - rollback is only safe
   before any repo-native write has happened under the new authority, which
   is why this batch does nothing except flip markers and remove dead
   config; it should not also be the batch that, for instance, first
   creates a decision record under the new authority, or a rollback would
   leave a repo-native decision with no corresponding Notion entry and no
   clean revert path.

**Sequencing note:** batches 2-6 can be reordered or parallelized somewhat
(for instance, batch 5's vendor-roster retarget does not depend on batch 4's
digest wiring), but batch 1 (settling the three conditions) must precede
batch 2 and batch 4 specifically, and batch 7 must be last, per the plan's
own no-dual-write and atomic-cutover rules.

## 8. Founder-only items

- **Removing the `NOTION_API_KEY` Railway environment variable** from the
  `strale-digest-cron` service. This is a Railway console/API action
  outside this repository; per section 2, this repository holds no write
  credential for Railway configuration.
- **Removing the `NOTION_TOKEN` GitHub Actions repository secret.** A
  session can remove a workflow's reference to `secrets.NOTION_TOKEN`
  (batch 5 above), but deleting the secret itself from GitHub repository
  settings is a GitHub-account-level action the brief names explicitly as
  founder-only.
- **Freezing the historical Notion workspace as read-only evidence**
  (migration plan M4 change 8). This is an action taken inside Notion's own
  admin settings, which this repository cannot reach or verify from a code
  search; not verifiable from the repository, and not a repository commit.
- **Anything legally binding Moonlighter AB**, per DEC-20260815-A - not
  applicable to any specific item found in this report's search, but named
  here per the brief's instruction to enumerate the category; no vendor
  contract, terms acceptance, or account action was found as part of any
  M4 batch this report proposes.
- **Settling M3 milestone-review condition 1** (the digest's "action
  required"/"unreviewed decisions" meaning: founder-decision reading or
  reading-list reading) - explicitly named as the founder's call in
  `archive/sessions/2026-09-11-m3-milestone-review.md`'s "Open items for M4
  or the founder" section, because "it changes what he reads each morning."
- **The founder's yes to merge the integration branch into `main`** - the
  migration plan's own no-dual-authority rule requires this as the single
  gating approval for the whole cutover, distinct from any individual
  batch's code review.

## Confirmation

Nothing in this session changed code, schema, production state, Notion
content, `docs/project/m2-closure-register.yaml`, or any file under
`docs/decisions/records/`. Every finding above is read evidence with its
reach verified by reading the file that proves it fires. Where a fact could
not be verified from the repository alone (the Railway cron service's live
schedule and environment variables, whether a GitHub `gh` credential in this
environment could delete a repository secret), it is stated as "not
verifiable from the repository" rather than assumed.
