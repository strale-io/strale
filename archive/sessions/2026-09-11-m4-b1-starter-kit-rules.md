---
title: "M4 batch 1, starter-kit rule-by-rule classification"
date: 2026-09-11
authority_active: false
status: evidence
---

# M4 batch 1: retiring the `.claude/` starter-kit files without losing a live rule

This report classifies every rule, instruction, or fact stated in
`.claude/PROTOCOL.md`, `.claude/WORKFLOW.md`, `.claude/RUNBOOK.md`,
`.claude/BUILD.md`, `.claude/DISPATCH.yaml`, and `.claude/NOTION.md` as of
their last content before this batch moved them to
`archive/sessions/claude-starter-kit/`. It is the batch-1 deliverable named in
`archive/sessions/2026-09-11-m4-cutover-inventory.md` section 7 batch 1 and
section 1 rows 9-11, and in the migration map row
`docs/strategy/2026-08-31-repo-native-operating-model-migration.md:725`
("Extract unique live rules; archive obsolete starter-kit system").

## Method and a load-bearing fact

All six files are a generic, genericized product-workflow starter kit built
around Notion (project management), Linear (issue tracking), and a UI
design-system critique loop (`_ui/`, `_quality/`, `_critique/`, `_model/`,
`_rules/laws.yaml`, and about twenty more `_`-prefixed directories the files
reference). None of those directories or files exist in this repository,
verified by checking each of `_modes`, `_quality`, `_critique`, `_decisions`,
`_runs`, `_rules`, `_ui`, `_model`, `_presets`, `_interaction`,
`_primitives`, `_invariants`, `_expectations`, `_artifacts`, `tasks`,
`GOVERNANCE.md`, and `SYSTEM_CONTRACT.md` at the repository root: all
missing. `.claude/PROJECT_INITIALIZED` does exist
(`initialized=2026-02-25, project=strale, bootstrap_by=claude-code`), so the
starter kit's Bootstrap Mode did run once, but Linear was never actually
adopted: `git grep -in linear` outside `archive/` and `.claude/` returns only
the English word ("linear regexes", "linear layout") in unrelated code
comments, `config/env-manifest.yaml` has no Linear entry, and no commit or
handoff file anywhere in `git log --all` references a `LIN-` issue id. `.claude/PROTOCOL.md`
itself still carries unfilled `__FILL:human_authority__` /
`__SELECT:tool__` placeholders throughout (for example lines 15-22, 32-44,
130, 198, 224-230, 690-732), confirming the generic template body was kept
as reference material rather than customized for this project after
bootstrap. This matches the migration inventory's own finding: `.claude/`
"contains 279 KB of additional workflow material, including an uninitialised
generic protocol with placeholders, Linear, Claude Chat, and Notion
assumptions" (`docs/strategy/2026-08-31-repo-native-operating-model-migration.md:352-354`).

Given that, a keyword search across all six files for the categories this
batch must treat conservatively (production writes, spend, founder approval,
destructive actions, review before merge, credentials, concurrency, deploys,
data handling) found no matches except one incidental, non-normative use of
the word "production" in `.claude/PROTOCOL.md:773` ("not production audits").
No rule in any of the six files touches money, credentials, deploys, or
destructive actions.

**Summary per file** (verdict split in words, not counts):

- `.claude/PROTOCOL.md`, mostly `obsolete-notion` (the Notion Journal /
  Decisions / Feature Registry / Deferred / Glossary database mechanics,
  Linear issue sync, Bootstrap Mode, Standing Delegations, and the AI
  Adherence audit-script scaffolding, none of which exist or ran here beyond
  the one 2026-02-25 bootstrap), several rows `covered` (the Session Start
  mode criteria, the conflict duty, the global-decision and
  decision-supersession confirmation rules, and the main-branch-push
  confirmation rule all already appear in current `CLAUDE.md`, several of
  them superseded by stronger repo-native enforcement), and one `keep`: the
  Git commit message convention (`type(scope): description`).
- `.claude/WORKFLOW.md`, mostly `obsolete-other` (an entire UI
  design-critique execution framework, plan mode gates, subagent strategy,
  critique loops, visual verification, release review, built around
  directories that do not exist), one row `covered` (the self-improvement/
  lessons-learned loop, superseded by the live `docs/company/LESSONS.md`
  failure-family mechanism under DEC-20260822-A).
- `.claude/RUNBOOK.md`, entirely `obsolete-other` (an authority map and
  file-loading guide for the same non-existent design-system starter kit;
  every file and directory it names as authoritative is missing from the
  repository).
- `.claude/BUILD.md`, entirely `obsolete-other` (a four-tier build
  classification and sequencing system, Micro/Targeted/Standard/Complex,
  layered on the same non-existent `_quality`/`_critique`/`_ui` directories;
  no evidence in git history that any commit was ever classified this way).
- `.claude/DISPATCH.yaml`, entirely `obsolete-other` (task-type routing
  tables for the same non-existent system; every `must_read`/`should_read`
  file path was checked and none exist outside `.claude/` itself).
- `.claude/NOTION.md`, entirely `obsolete-notion` (a Notion workspace map
  whose page/database ids and structure are already inlined in current
  `CLAUDE.md`'s "Notion Access", "Notion Workspace Structure", and "Notion
  Governance Rules" headings, which the M4 migration map retires in the same
  entrypoint-rewrite batch, not this one).

**Every `keep` rule and its new home** (see Part B below for the actual
edit): the Git commit message convention
(`.claude/PROTOCOL.md:222`, `.claude/BUILD.md:152-153,237-238`) moves to
`CLAUDE.md`'s "GitHub Access (REQUIRED)" section as one additional bullet.

---

## Table: `.claude/PROTOCOL.md`

| Rule | Already covered by | Verdict | Why |
|---|---|---|---|
| Placeholder Legend and genericization notice (lines 9-23) | None | `obsolete-other` | Documents how to fill in a generic template; the template was bootstrapped once (2026-02-25) but the placeholders were never actually replaced in this file, and the project's real CLAUDE.md was written independently. Nothing in this repo reads or fills these placeholders today. |
| The Three Actors / Actor Codes table (lines 28-44) | None | `obsolete-notion` | Names Claude Chat and a human product owner writing to Notion/Linear via actor codes `P`/`C`/`X`; Notion/Linear are retired at M4 and this repo has no Claude-Chat-vs-Claude-Code split in its live session model. |
| System Constraints table: single human authority, Notion-as-primary-store, AI-adherence-is-a-capability, finite context windows, one-product-one-repo (lines 48-60) | `docs/company/CHARTER.md` (DEC-20260815-A, DEC-20260822-A) for the authority/AI-reliability substance | `covered` | The single-decision-maker principle and AI-fallibility acknowledgment are the live Charter's subject matter (SYSTEM_ACTING/FOUNDER_DECISION/AUTHORIZATION_UNAVAILABLE, three-strike rule); the Notion-as-primary-store framing itself is obsolete but the underlying "don't assume perfect AI compliance" concern survives in the Charter, not here. |
| Context Budget (token-budget tiers, scale thresholds for decisions/Journal entries) (lines 62-76) | None | `obsolete-notion` | Governs when to summarize the Notion Journal/Decisions databases; those databases are retired at M4. |
| Archival Policy (decision/Journal/handoff retention thresholds, reversal safeguard, re-validation) (lines 78-95) | `archive/` conventions (Report Filing Convention) for the general "archive, don't delete" instinct | `obsolete-notion` | Specific retention windows and Notion "Reaffirmed [date]" mechanics for a database this repo does not have; the repo's own archival convention (Report Filing Convention, current `CLAUDE.md`) is a different, already-live mechanism. |
| Session Intent format (lines 102-113) | `CLAUDE.md` heading "Session Start" step 1 ("Declare session intent") | `covered` | Current `CLAUDE.md`'s Session Start already requires declaring intent as step 1; the exact "Intent: [sentence]" handoff-file format is Notion/handoff-file scaffolding not otherwise required. |
| Mode Selection Criteria: Quick vs Full definitions and escalation triggers (lines 115-132) | `CLAUDE.md` heading "Session Start" steps 2-3 | `covered` | Current `CLAUDE.md` states the same Quick/Full criteria and escalation triggers (second feature, design decision, >2hr estimate, contradiction) nearly verbatim; this is the exact text `CLAUDE.md:9` points at PROTOCOL.md for "full criteria," but the abbreviated version already in CLAUDE.md is the operative one and needs no PROTOCOL.md-sourced addition. |
| Quick/Full Session Protocol on-start/on-end steps (Notion/Linear specific) (lines 134-184) | `CLAUDE.md` headings "Quick Session Checklist" / "Full Session Checklist" for the non-Notion/Linear steps | `obsolete-notion` | The Notion-read, Linear-issue-check, and Linear-status-update steps are retired with Notion/Linear; the surviving non-Notion steps (declare intent, write handoff file) are already in CLAUDE.md's own checklists, which the M4 entrypoint rewrite (batch 2) is the named place to reconsider, not this batch. |
| Session Checkpoints (90-minute trigger, mode escalation) (lines 175-184) | None | `obsolete-notion` | Ties to the same Notion/Linear handoff-file mechanics; no equivalent 90-minute checkpoint exists or is enforced in this repo. |
| Claude Chat Session Protocol (lines 186-198) | None | `obsolete-notion` | This repo runs Claude Code only; there is no separate Claude Chat actor writing to Notion here. |
| Naming Convention: Features/Screens/Decisions/Deferred/Journal/Session ID formats (lines 210-228) | None for the Decision/Deferred/Session ID formats specifically | `obsolete-notion` | `DEC-YYYYMMDD-A-XXXX` (actor code + random suffix) is the Notion Decisions database key scheme; the repository's live decision-record mechanism uses a different, git-native key grammar (DEC-20260904-B, `^DEC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:--notion-...\|--git-...)?$`, `docs/decisions/records/`), which supersedes it. |
| Naming Convention: Git branches `type/kebab-description` (line 221) | `CLAUDE.md` heading "GitHub Access (REQUIRED)": "Feature branch pattern: type/kebab-description" | `covered` | Identical rule already stated in live CLAUDE.md. |
| Naming Convention: Git commits `type(scope): description` (line 222) | None | `keep` | No other live document states this, no `commitlint`/commit-msg hook enforces it, but `git log` on this repo shows commits consistently following it ("fix(vendors): ...", "docs(security): ..."). Moves to `CLAUDE.md` "GitHub Access (REQUIRED)" as one bullet (Part B). |
| Naming Convention: Linear issue types table (lines 232-241) | None | `obsolete-notion` | Linear was never adopted (see Method above). |
| Product Glossary (Notion database) (lines 243-267) | None | `obsolete-notion` | A Notion-hosted domain-term glossary; this repo has no such database and no evidence one was ever populated. |
| Document Types 1-5: Journal, Decisions, Product Strategy, Feature Registry, Deferred (Notion database schemas and lifecycle rules) (lines 270-524) | `docs/decisions/records/*.md` + `docs/programs/` for the decision/program-tracking substance | `obsolete-notion` | Full Notion database field specs and lifecycle rules (append-only Journal, superseded-not-edited Decisions, Linear-derived Feature Registry status) for databases this repo does not operate; the repo's actual decision and program registers (`docs/decisions/records/`, `docs/programs/`) are structurally different, git-native mechanisms already covered by their own protocol-coverage rows. |
| Handoff System: folder structure, `from-chat`/`from-code` contents, file rules (lines 526-561) | `docs/governance/protocols/SESSION_CONTRACT.md` (session-contract row, `docs/project/protocol-coverage.yaml:26-44`) | `covered` | The live Session contract protocol already governs `handoff/_general/from-code/` writing and the handoff-gate check; the two-actor `from-chat`/`from-code` split and 90-day archive-after-ship rule are the parts that do not survive (no Claude Chat actor, no per-feature handoff folders in current practice), but the core "write a handoff file" obligation is covered. |
| Design Brief Template (UI surface-type intake form) (lines 562-591) | None | `obsolete-other` | References `DESIGN_ROUTER.yaml`, which does not exist in this repository; no evidence this template was ever used. |
| Contradiction Protocol: quote both, get confirmation, create audit trail, update CLAUDE.md (lines 597-617) | `CLAUDE.md` heading "Workflow Invariants (Non-Negotiable)": conflict duty and "Supersessions → ALWAYS use Contradiction Protocol (including CLAUDE.md update)" | `covered` | The substance (never silently supersede, update CLAUDE.md immediately) is already live CLAUDE.md text; the Notion-specific mechanics (marking a Decision `superseded`, Notion relation fields) are not, and are obsolete-notion within this same row's scope. |
| "Why Don't We Have X?" Protocol: Glossary-first search across Notion databases plus handoff-file grep (lines 621-634) | None | `obsolete-notion` | Depends on the Notion Glossary/Decisions/Deferred/Journal databases this repo does not have; the underlying instinct ("search before concluding never considered") is generic practice, not a repo-specific rule needing a new home. |
| Complete Supersession Rule: never edit, always supersede (Decisions, Product Strategy, Journal) (lines 638-655) | `CLAUDE.md` heading "Workflow Invariants (Non-Negotiable)" | `covered` | "NEVER edit Journal entries, Decision content, or Deferred content" and "Corrections → new Journal entry" are already stated there; the Linear split-description format in the same section is `obsolete-notion` (Linear never adopted). |
| Change Log Rule for versioned documents (lines 657-679) | None | `obsolete-other` | No live document in this repo carries a "Version | Date | What Changed | Why" changelog table by this rule's convention; decision records use the git-native supersession mechanism instead. |
| Authority Thresholds table: Journal/Decision/Deferred/Linear/push-to-main authority levels (lines 682-702) | `docs/company/CHARTER.md` (DEC-20260815-A) for the general authority-boundary substance; `.githooks/pre-push` + `docs/governance/protocols/SESSION_CONTRACT.md` point 3 for the specific push-to-main rule | `covered` | "Push to GitHub main branch: Requires confirmation" is superseded by stronger live enforcement (`.githooks/pre-push` refuses a direct push to main outright; merges happen only through reviewed PRs); "Push to feature branch: auto-push" is stated in Session contract point 3 ("pushing the working branch is routine backup and needs no approval"). The Journal/Decision/Deferred/Linear authority rows in the same table are `obsolete-notion` within this row's scope, they govern databases this repo does not operate, and the live authority model (Charter's SYSTEM_ACTING/FOUNDER_DECISION/AUTHORIZATION_UNAVAILABLE) supersedes the confidence/scope-based Decision-authority scheme entirely. |
| Standing Delegations: format, logging, scope limits, proactive-delegation guidance (lines 704-732) | `docs/company/CHARTER.md` (DEC-20260815-A, "Claude also decides-then-tells on...") | `covered` | The live Charter already grants Claude standing decide-then-tell authority over a named list of actions (services on/off, pricing in-band, quarantine/promote, refunds, retries, delisting, merging, dispatching, scheduling, spend inside €50/week) without a time-boxed "Standing delegation:" phrase mechanism; the Notion-logged delegation-as-Decision format itself is superseded. |
| Override Triggers: "Log decision:", "Defer:", "Strategy change:" phrases (lines 736-746) | None | `obsolete-notion` | Force-creates entries in the Notion Decisions/Deferred databases and the Notion Product Strategy page; none of the three exist here. |
| AI Adherence: Post-Session Self-Audit, Periodic Drills, Early Weeks as Training Data (lines 750-783) | `docs/company/LESSONS.md` (DEC-20260822-A three-strike rule) for the general "AI adherence is imperfect, track failure patterns" concern | `covered` | The live LESSONS.md failure-family mechanism (F1-F10, three-strike root-cause investigation) is a stronger, already-operating version of the same concern; the specific self-audit questions and 4-week calibration-period drills tied to Notion Decision auto-creation are `obsolete-notion` within this row's scope. |
| Degraded Mode: Notion/Linear/Git-down behavior table, Backfill Process (lines 787-815) | `CLAUDE.md` heading "Degraded Mode" (excluded_sections entry, `docs/project/protocol-coverage.yaml:449-452`) for the Git-down "STOP" rule | `covered` | Current CLAUDE.md already states "If Git unavailable: STOP. Fix before proceeding."; the Notion/Linear-down behavior and backfill deduplication/contradiction-check mechanics are `obsolete-notion` within this row's scope (M4 migration change 5 explicitly targets this exact CLAUDE.md heading for rewrite in batch 2, not this batch). |
| Linear Integration: issue format, status sync, Linear-to-Notion naming (lines 817-866) | None | `obsolete-notion` | Linear was never adopted (see Method above). |
| Pre-Build Connectivity Checklist and Verification Script (Notion/Linear/GitHub/handoff checks) (lines 869-914) | `CLAUDE.md` heading "Session contract" point 1 ("Orient first...") for the GitHub/git-status portion | `covered` | The `git status` check and reading the program register at session start are already the live orientation step; the Notion-page-fetch and Linear-issue-list checks are `obsolete-notion` within this row's scope. |
| Compliance Tiers: Mandatory/Extended/Maintenance checklists (lines 918-950) | `CLAUDE.md` headings "Quick Session Checklist" / "Full Session Checklist" (excluded_sections, `docs/project/protocol-coverage.yaml:411-433`) | `covered` | These CLAUDE.md checklists already carry the surviving non-Notion/Linear obligations (declare intent, write handoff file, run `/go` before `/end-session`); the Notion/Linear-specific tiering (Glossary audit, Current State Summary regeneration, weekly delta summary) is `obsolete-notion`. |
| Integrity Checks: Day 1 Audit Script, 15 automatable checks, severity classification (lines 954-1026) | None | `obsolete-notion` | Every one of the 15 checks (orphan Linear↔Feature-Registry, Decision review staleness, Journal immutability via Notion's Last-Edited timestamp, Glossary staleness, standing-delegation expiry, split-brain detection) operates on the Notion/Linear databases this repo does not have. No `scripts/audit-workflow.ts` or equivalent was ever built (`git grep` finds no such file). |
| Journal Consumption: Notion views, Weekly Delta Summary (lines 1029-1056) | None | `obsolete-notion` | Notion-view definitions and a Notion Journal entry format. |
| Worked Examples: Quick and Full session walkthroughs (lines 1060-1124) | None | `obsolete-notion` | Illustrative examples of the same Notion/Linear session mechanics already classified obsolete above. |
| CLAUDE.md Template (the full condensed operational checklist this protocol says should be copied into a project's root CLAUDE.md) (lines 1128-1251) | Current `CLAUDE.md` itself, which is the filled-in descendant of this exact template | `covered` | This is the template current `CLAUDE.md` was originally generated from; every surviving line already exists in current CLAUDE.md in filled-in form, and the Notion/Linear-specific lines within it are `obsolete-notion`, matching the verdicts already given per-topic above (the "Conflict duty" and "Quality gate duty" sub-bullets at lines 1229-1231 are covered/obsolete-other respectively: conflict duty per the Contradiction Protocol row above, and "Quality gate duty" citing `_rules/laws.yaml` and `.claude/WORKFLOW.md`'s critique loop is `obsolete-other` since neither exists). |
| What Gets Logged Where (event-to-database matrix) (lines 1255-1278) | None | `obsolete-notion` | A routing table for the same Notion Journal/Decisions/Deferred/Linear/Feature-Registry/Product-Strategy databases already classified obsolete above. |
| Planned for Later Phases: Derived State Views, Failure-Mode Drills (lines 1282-1291) | None | `obsolete-notion` | Roadmap items for the same Notion-based system, never built. |
| Bootstrap Mode: trigger, Steps 1-4, Delegation Rule, Post-Bootstrap Milestones (lines 1293-1401) | None | `obsolete-other` | Bootstrap ran once (2026-02-25, per `.claude/PROJECT_INITIALIZED`) and is not re-run; the Milestones list (issue standing delegations, seed a Glossary, first weekly delta summary) never happened, per the Method section's Linear/Glossary evidence above. |
| Success Criteria (After 2 Weeks): 19-item checklist (lines 1405-1426) | None | `obsolete-notion` | Verifies the same Notion/Linear/Glossary/Decision mechanics already classified obsolete above; none of the 19 criteria are measured or measurable in this repository today. |
| Mode Integration: starter-kit `_modes/explore.md`/`_modes/govern.md` cross-references (lines 1429-1437) | None | `obsolete-other` | References starter-kit mode files that do not exist in this repository. |
| Change Log (version history of this file) (lines 1441-1454) | None | `obsolete-other` | Historical record of edits to this file itself; moves with the file to the archive, not a separately governing rule. |

## Table: `.claude/WORKFLOW.md`

| Rule | Already covered by | Verdict | Why |
|---|---|---|---|
| Scope Clarification table: this file governs plan mode/subagents/critique, PROTOCOL.md governs session logging (lines 7-28) | None | `obsolete-other` | Pure cross-reference scaffolding for a set of files this batch is archiving together; not an independent rule. |
| Build Sequencing pointer to DISPATCH.yaml/BUILD.md (lines 32-35) | None | `obsolete-other` | Cross-reference to the same non-existent tiered build system classified obsolete under BUILD.md below. |
| Plan Mode Default: enter plan mode for 3+ step or architectural tasks, stop and re-plan if something goes sideways (lines 40-47) | Claude Code's built-in plan mode (a harness feature, not a project-specific rule) | `obsolete-other` | Restates a capability the harness already provides generically; this repo states no additional plan-mode trigger beyond ordinary judgment, and no script or check in this repo enforces a "3+ steps" threshold. |
| Subagent Strategy: use subagents liberally, one task per subagent (lines 51-59) | The `Agent` tool's own general-purpose usage guidance (harness-level, not project-specific) | `obsolete-other` | Same reasoning: a generic harness-usage pattern, not a Strale-specific rule. |
| Self-Improvement Loop: update `tasks/lessons.md` after every user correction (lines 62-71) | `docs/company/LESSONS.md` (DEC-20260822-A, F1-F10 failure families, three-strike rule) | `covered` | `tasks/lessons.md` does not exist (confirmed: `tasks/` directory missing); the live, actually-operating equivalent is `docs/company/LESSONS.md`, which is more structured (named failure families, a three-strike root-cause-investigation trigger) than this rule's simple append-only log. |
| Success Pattern Capture: template for generalizing wins to `_model/patterns/` (lines 75-101) | None | `obsolete-other` | `_model/patterns/` does not exist. |
| Lesson Promotion Protocol: promote to `_quality/LEARNING.md` after 2+ builds (lines 105-155) | `docs/company/LESSONS.md` for the general promotion-after-repeated-observation instinct | `covered` | `_quality/LEARNING.md` does not exist; `docs/company/LESSONS.md`'s three-strike rule is the live analogue (a *stronger* threshold, a full root-cause investigation, not just a promoted note, triggers at the third incident in a family). |
| Verification Before Done: never mark complete without proof, ask "would a staff engineer approve this" (lines 159-167) | The `/go` skill ("End-to-end verify... Refuses to PR if anything is red") | `covered` | The live `/go` skill already enforces verification before a change is considered shippable, more concretely (it runs the actual test/build gates) than this rule's rhetorical self-check. |
| Demand Elegance (Balanced): pause for non-trivial changes, ask for a more elegant solution (lines 170-178) | The `/simplify` skill ("Review the changed code for reuse, simplification, efficiency... then apply the fixes") | `covered` | Same substance, already a concrete, invoked tool in this repo rather than a rhetorical prompt. |
| Autonomous Bug Fixing: fix without hand-holding, resolve failing CI without being told how (lines 181-188) | `docs/company/CHARTER.md` (DEC-20260815-A, "No technical question goes to Petter") | `covered` | The live Charter states this more strongly and specifically for this project (architecture, tooling, and fix decisions are all Claude's; escalating a technical choice "is a failure of the role"). |
| Task Management: `tasks/todo.md`/`tasks/lessons.md` 6-step build tracking (lines 192-203) | Claude Code's built-in TodoWrite/plan-mode tooling for the ephemeral-tracking half; `docs/company/LESSONS.md` for the lessons half | `obsolete-other` | `tasks/` does not exist; the harness's own todo-list tool already serves the ephemeral, task-scoped tracking role this rule describes, and the lessons half is covered above. |
| Core Principles: Simplicity First, No Laziness, Minimal Impact (lines 207-214) | The `/simplify` skill and general engineering practice already reflected across this repo's protocols (for example the Scoring Integrity section's "diagnose the underlying issue... never bend the substrate to mask a specific capability's behaviour") | `covered` | These are restated, not novel; this repo's own protocols already voice the same root-cause and minimal-footprint principles in specific, enforced contexts. |
| Task File Templates: `tasks/todo.md`/`tasks/lessons.md` markdown templates (lines 217-258) | None | `obsolete-other` | Templates for files that do not exist and were never created (`tasks/` missing). |
| Integration with Starter Kit table (Plan Mode/Pre-Build/Quality Check/Decision Logging/Artifact Check mapped to `_modes/`, `_expectations/`, `_critique/`, `_decisions/`, `_artifacts/`) (lines 261-269) | None | `obsolete-other` | Every named starter-kit component is missing from this repository. |
| When to Use Plan Mode table (lines 273-285) | Claude Code's built-in plan-mode judgment | `obsolete-other` | Generic harness guidance, not project-specific. |
| Subagent Task Examples table (lines 289-299) | None | `obsolete-other` | Illustrative examples referencing "how Linear implements keyboard navigation" as a research prompt; Linear was never adopted and this is example text, not a rule. |
| Quality Gates (Compiles/Works/Tested/Clean/Documented) (lines 303-313) | The `/go` skill's verification gate | `covered` | Same substance as Verification Before Done above; the live `/go` skill is the enforcing mechanism. |
| Error Recovery table (lines 317-327) | `docs/company/LESSONS.md` for the "user correction → update lessons" row specifically | `covered` | The lessons-update row is covered per the Self-Improvement Loop row above; the remaining rows (read error and fix root cause, re-plan if stuck) are generic engineering judgment restated, not a distinct enforceable rule needing a new home. |
| Reference Precision: cite specific sections not whole files (lines 331-344) | None | `obsolete-other` | Written for citing starter-kit files like `_expectations/CONTRACTS.md` and `laws.yaml`, none of which exist; this repo's own citation convention (path:line, as this very report demonstrates and as CLAUDE.md's protocols require) already exceeds this rule's bar without needing it restated. |
| Intent Drift Detection: re-validate understanding every 3rd screen during long builds (lines 348-380) | None | `obsolete-other` | Written for multi-screen UI builds using the non-existent design-system starter kit; no equivalent screen-based build unit exists in this backend-and-infrastructure repository. |
| Gap Recognition: document gaps rather than improvise, submit via `GOVERNANCE.md` (lines 384-419) | `docs/company/IDEAS.md` (Research and ideas convention) for the general "don't lose an idea, file it somewhere durable" instinct | `covered` | `GOVERNANCE.md` does not exist; the live repo convention for exactly this situation (a gap or idea worth tracking) is `docs/company/IDEAS.md`, already a protocol-coverage row. |
| Component Evolution Path: Document/Compose/Propose/Proceed for UI component gaps (lines 422-472) | None | `obsolete-other` | References `_model/patterns/`, `GOVERNANCE.md`, and `_decisions/REGISTRY.md`, none of which exist; this is UI-component-specific and this repo has no such component registry. |
| Visual Verification: screenshot capture protocol summary (lines 476-490) | `design/tokens/` + `design:check` (Design tokens convention) for the general "design values are enforced, not eyeballed" instinct | `covered` | `_quality/VISUAL_VERIFICATION.md` does not exist; the live design-token enforcement mechanism (`npm run design:check`, refusing off-token colors/fonts/spacing) is a different but functionally analogous live guardrail for the same underlying concern (UI values must be checked, not assumed). |
| Parallel Critique Strategy: 3-phase critique parallelization (lines 494-538) | None | `obsolete-other` | Depends on `_critique/*`, which does not exist; no critique loop of any kind runs in this repository. |
| Release Protocol: Release Readiness Review triggered when all screens pass critique (lines 542-553) | The `/go` skill (refuses to PR if anything is red) for the general "don't ship without passing verification" concern | `covered` | `_quality/RELEASE_REVIEW.md` does not exist; the live release gate for this repo is `/go`'s verify-simplify-ship sequence plus PR review, not a per-screen critique-based release review. |

## Table: `.claude/RUNBOOK.md`

| Rule | Already covered by | Verdict | Why |
|---|---|---|---|
| Related files table and Task Flow diagram (lines 7-20, 246-278) | None | `obsolete-other` | Pure navigation scaffolding among the six files this batch archives together. |
| Authority: single source of law is `_rules/laws.yaml`; Autonomous/Requires-Proposal/Forbidden action lists (lines 21-56) | `docs/company/CHARTER.md` for the general "some actions are autonomous, some require escalation, some are forbidden" structure | `covered` | `_rules/laws.yaml` does not exist; the live Charter already provides the equivalent three-tier structure (Claude decides, decides-then-tells, Petter-only) for this project's actual domain (money, pricing, deploys, public claims), which is what matters here, the UI-specific forbidden list (dead affordances, phantom actions, invalid token combinations) has no live analogue because no such UI-critique system runs in this repo. |
| Authority Boundary: System Owns / Product Owns / Boundary Rule tables (lines 58-99) | None | `obsolete-other` | Entirely about the non-existent starter-kit UI system's file ownership (`_rules/laws.yaml`, `_invariants/REGISTRY.md`, `_quality/QUALITY_PROTOCOL.md`, a Notion "Constitution" database). |
| Design System Presets: `professional`/`publishing` preset table (lines 103-121) | `design/tokens/` (Design tokens convention) for the general "design values live in a governed token system" instinct | `covered` | `_design-systems/{preset}/` does not exist; the live design-token system (`design/tokens/active.json`, `design/tokens/candidates/*.json`) is the actual governing mechanism for design values in this repository today, structurally different from this rule's preset-and-lock-file scheme. |
| Token System: `_ui/tokens.yaml` schema, capability matrix, "all visual values must come from tokens" (lines 125-138) | `design/tokens/` + `npm run design:check` | `covered` | Same underlying principle (no hardcoded visual values) already enforced by the live token-check script against the live token files; `_ui/tokens.yaml` itself does not exist. |
| Tech Foundation: `config/tech-foundation.yaml` guardrails before building persistence/auth/sync/upload/export (lines 141-160) | None | `obsolete-other` | `config/tech-foundation.yaml` does not exist in this repository; persistence, auth, and the rest are long since built and this gating step was never part of how this backend was actually developed. |
| Completeness Requirements: every affordance must work, Gate 5 (lines 163-168) | None | `obsolete-other` | Cites `_invariants/REGISTRY.md` and `_quality/QUALITY_PROTOCOL.md`, neither of which exists. |
| Restraint Principles: replace before adding, OK to not support a use case (lines 171-176) | None | `obsolete-other` | Cites `_rules/laws.yaml`, which does not exist; the underlying restraint instinct is generic and not tied to any enforceable mechanism here. |
| Pre-Creation Protocol: Intent Clarity / Audience / Output Type / Success Definition / Demonstration vs Enumeration (lines 179-243) | None | `obsolete-other` | A pre-build questionnaire for UI screen design work using the non-existent starter kit's classification vocabulary (Explorer/Practitioner/Decision-maker/Client audiences, Decision Surface/Data Display/Export/Narrative output types). |
| Context Loading: Notion sources table, starter-kit `DISPATCH.yaml` pointer, Loading Protocol, Session Workflow Essentials tables (lines 280-378) | None | `obsolete-notion` | Notion database read/write mapping and DISPATCH.yaml-driven file loading for the same retired systems. |
| Resolution Order: Notion Constitution > starter kit laws > starter kit defaults > Notion specs (lines 381-392) | None | `obsolete-notion` | Precedence chain among a Notion database and starter-kit files that do not exist. |
| Reference Protocol: cite rules by ID, never restate (lines 395-401) | None | `obsolete-other` | Cites `LAW-001`/`RULE-010` style ids from `_rules/laws.yaml`, which does not exist. |
| Critique Requirement: every screen runs `_critique/LOOP.md`, stop conditions, Release Review Trigger (lines 403-423) | None | `obsolete-other` | `_critique/LOOP.md` and `_quality/RELEASE_REVIEW.md` do not exist. |
| Audit Output: folder convention, audit types, Expectation Audit process (lines 426-500) | Report Filing Convention (current `CLAUDE.md`) for the general "audits go in a structured, dated location" instinct | `covered` | The `audit-output/{date}-{type}/` convention this rule describes is superseded by the live Report Filing Convention, which already routes exactly this kind of report to `archive/sessions/` (and historically absorbed an `audit-output/` directory wholesale in the Phase 3 2026-08-17 sweep, confirming this rule's own naming convention was a real past practice now folded into the newer, single convention). |
| Anti-Patterns table (lines 504-513) | None | `obsolete-other` | References `components.yaml` and `tokens.yaml` from the non-existent starter kit. |
| When Stuck: check `_decisions/REGISTRY.md`, document there, escalate (lines 516-524) | `docs/company/CHARTER.md` (escalation-format requirements, DEC-20260822-A: "the choice, what is established, the options, my recommendation, the concrete consequence") | `covered` | `_decisions/REGISTRY.md` does not exist; the live escalation contract is more specific and already the operative rule for "what to do when stuck and a founder decision is needed." |

## Table: `.claude/BUILD.md`

| Rule | Already covered by | Verdict | Why |
|---|---|---|---|
| Related files table, How This File Works (lines 7-25) | None | `obsolete-other` | Navigation scaffolding for the same six-file starter kit. |
| Section 1 Task Classification: Micro/Targeted/Standard/Complex matrix and rules, Quick Reference table (lines 28-65) | `CLAUDE.md` heading "Session Start" (Quick/Full) for the general "classify the task before choosing process weight" instinct | `covered` | This repo's live classification is the simpler two-mode Quick/Full system already in CLAUDE.md; the four-tier Micro/Targeted/Standard/Complex system was never adopted (no commit, PR, or handoff in `git log --all` references a task being classified this way). |
| Section 2 Build Paths: Micro/Targeted/Standard/Complex step sequences including pre-build declarations, critique loops, visual checks (lines 68-247) | None | `obsolete-other` | Every step references non-existent files (`_ui/tokens.yaml`, `_modes/explore.md`, `_critique/LOOP.md`, `_quality/VISUAL_VERIFICATION.md`) or the non-existent four-tier system classified obsolete above. The embedded "Commit with conventional commit message" instruction (lines 152, 237) is the same rule already extracted as `keep` under `.claude/PROTOCOL.md`'s Naming Convention row above, not a second distinct rule. |
| Section 3 Pre-Build Requirements matrix and Minimum/Full Pre-Build templates (lines 249-295) | None | `obsolete-other` | Elaborates the same non-existent pre-build declaration system (Screen Intent Declaration, IA Position Declaration, Emotional Intent Declaration, Failure Scenario Modeling). |
| Section 4 File Reference Map: "what should I build / how / what constraints / what exists / how to evaluate quality / how to log" tables (lines 297-364) | None | `obsolete-other` | Every referenced file (`_ui/components.yaml`, `_rules/laws.yaml`, `_model/truth/*.yaml`, `_critique/LOOP.md`, Notion Product Specs) is either non-existent or a retired Notion database. |
| Section 5 Common Build Scenarios: worked classification examples (lines 366-397) | None | `obsolete-other` | Illustrative examples of the same non-existent classification system. |
| Section 6 Anti-Patterns table (lines 400-411) | None | `obsolete-other` | References the same non-existent classification and file system. |
| Section 7 Reclassification Protocol: upgrading always allowed, downgrading only before build starts (lines 414-433) | None | `obsolete-other` | Governs reclassifying within the non-existent four-tier system. |

## Table: `.claude/DISPATCH.yaml`

| Rule | Already covered by | Verdict | Why |
|---|---|---|---|
| Header/purpose comment and "how to use" 10-step procedure (lines 1-49) | None | `obsolete-other` | Describes how to consult this file's routing tables; the file itself is retired. |
| The 13 task-type blocks, `new_screen`, `modify_screen`, `bug_fix`, `token_work`, `model_change`, `new_component`, `full_feature`, `review_audit`, `accessibility`, `config_change`, `exploration`, `refactor`, `data_display` (each with `key_signals`, `build_classification`, `session_workflow`, `must_read`/`should_read` file lists, before/after triggers) (lines 55-1947) | None | `obsolete-other` / `obsolete-notion` | Verified by keyword search: every `must_read`/`should_read` path under these 13 blocks names either a non-existent starter-kit file (`_ui/*`, `_model/*`, `_quality/*`, `_invariants/*`, `_rules/laws.yaml`, `_nfr/SECURITY.yaml`, etc., none exist, confirmed above) or a Notion database / Linear action (retired). A targeted search for the categories this batch must treat conservatively (`security\|deploy\|credential\|password\|secret\|spend\|money\|GDPR\|production\|founder\|approv`) across the whole file found only two hits, both the literal, non-existent path `_nfr/SECURITY.yaml` (lines 1075, 1445), no live security or spend content. |
| `cross_cutting` block: Closed World / critique-after-every-screen key signals; `always` triggers for Notion Decision logging, end-of-session handoff/Journal/Linear writes, session-checkpoint escalation; `periodic` triggers for drift detection, coherence checks, Session Exit Learning Check, Current State Summary staleness (lines 1948-2008) | Same citations as the equivalent rules already classified above under `.claude/PROTOCOL.md` (Contradiction Protocol, Handoff System, Session Checkpoints, AI Adherence) | `covered` / `obsolete-notion` (mixed, matching the underlying rule) | This block restates PROTOCOL.md rules as machine-readable triggers rather than stating anything new; each trigger's verdict follows its PROTOCOL.md counterpart's verdict above (the Journal/Decision/Linear-writing triggers are `obsolete-notion`; none of this block's triggers name a rule not already covered in the PROTOCOL.md table). |
| `file_digests` block: one-paragraph summaries of ~20 starter-kit and `.claude/` files for "baseline awareness" (lines 2019-2210) | None | `obsolete-other` | Reference summaries of files that either do not exist (`_rules/laws.yaml`, `_ui/components.yaml`, `_invariants/REGISTRY.md`, `_quality/archetypes/`, etc.) or are the other five files this same batch archives (`.claude/PROTOCOL.md`, `.claude/NOTION.md`, `.claude/BUILD.md`); no independent rule content beyond what those files themselves state, already classified above. |

## Table: `.claude/NOTION.md`

| Rule | Already covered by | Verdict | Why |
|---|---|---|---|
| Workspace Structure: 8-section table with page ids (lines 5-20) | `CLAUDE.md` headings "Notion Access (REQUIRED)" and "Notion Workspace Structure (8 sections under Project Home)" | `obsolete-notion` | The same 8-section structure and several of the same page ids are already inlined in current `CLAUDE.md`; both are retired together at the M4 entrypoint rewrite (batch 2), which is the named place this exact duplication is resolved, not this batch (`archive/sessions/2026-09-11-m4-cutover-inventory.md` section 1 row 10). |
| Database Field Specifications: Journal/Decisions/Feature Registry/Deferred/Glossary schemas, URL-vs-ID convention (lines 24-129) | None | `obsolete-notion` | Field-level schemas for the same Notion databases already classified `obsolete-notion` throughout the `.claude/PROTOCOL.md` table above (this file is PROTOCOL.md's field-specification appendix). |
| Context Loading Order table (lines 132-149) | `CLAUDE.md` heading "Notion Workspace Structure" | `obsolete-notion` | Restates the same section-to-content mapping as the Workspace Structure row above, at a finer grain. |
| Updating Notion from Sessions: 6-step post-work logging checklist (lines 152-162) | `CLAUDE.md` heading "Quick/Full Session Checklist" steps for "Move completed To-do items" / "Create Journal entry" | `obsolete-notion` | Restates the same Notion-write obligations already in current CLAUDE.md's session checklists, which the M4 entrypoint rewrite is the named place to retire (per the migration map's M4 change 4/5), not this batch. |

---

## Part B: moves and pointers

### B1. The one `keep` rule

Added the Git commit message convention to `CLAUDE.md`'s "GitHub Access
(REQUIRED)" section (not a mirrored protocol-coverage heading, and no new
heading was added, one bullet in the existing list):

```
### GitHub Access (REQUIRED)
- Repo: strale (local)
- Main branch: main
- Feature branch pattern: type/kebab-description
- Commit message format: Conventional Commits (`type(scope): description`)
```

Source: `.claude/PROTOCOL.md:222` ("Git commits | `type(scope): description`
| `feat(ui): add time tracking component`") and `.claude/BUILD.md:152,237`
("Commit with conventional commit message").

No other `keep` rule was found across the six files (see Part A).

### B2. Moved the six files

`git mv` to `archive/sessions/claude-starter-kit/`, names unchanged:

- `.claude/PROTOCOL.md` → `archive/sessions/claude-starter-kit/PROTOCOL.md`
- `.claude/WORKFLOW.md` → `archive/sessions/claude-starter-kit/WORKFLOW.md`
- `.claude/RUNBOOK.md` → `archive/sessions/claude-starter-kit/RUNBOOK.md`
- `.claude/BUILD.md` → `archive/sessions/claude-starter-kit/BUILD.md`
- `.claude/DISPATCH.yaml` → `archive/sessions/claude-starter-kit/DISPATCH.yaml`
- `.claude/NOTION.md` → `archive/sessions/claude-starter-kit/NOTION.md`

`.claude/PROJECT_INITIALIZED` was left in place: it is a small marker file
recording a historical fact (bootstrap ran 2026-02-25), not one of the six
files this batch's scope names, and nothing in this batch's grep sweep found
it linked from a live entrypoint or command.

### B3. Live links found and updated

`git grep -n` for each of the six file names (`PROTOCOL.md`, `WORKFLOW.md`,
`RUNBOOK.md`, `BUILD.md`, `DISPATCH.yaml`, `NOTION.md`), across the whole
repository excluding `archive/` (and, after the move, excluding the files'
own new location under `archive/sessions/claude-starter-kit/`):

| Hit | What it was | What was done |
|---|---|---|
| `CLAUDE.md:9`, "See .claude/PROTOCOL.md for full criteria and protocol definitions." | Live pointer, the one the inventory named | Removed the sentence. Part A found the Session Start mode criteria it pointed at are already fully stated in the three lines above it in CLAUDE.md (Quick/Full definitions, escalation triggers), there is no additional live criterion in PROTOCOL.md this pointer needs to keep sending readers to, since PROTOCOL.md's own fuller "Mode Selection Criteria" section restates the same table CLAUDE.md already has, and everything else in PROTOCOL.md's Session Modes section is Notion/Linear mechanics classified obsolete above. |
| `AGENTS.md:19`, the same sentence, condensed-derivative copy | Live pointer | Removed identically, keeping AGENTS.md a condensed derivative of CLAUDE.md per its own convention. |
| Six-plus internal cross-references inside `.claude/RUNBOOK.md`, `.claude/BUILD.md`, `.claude/WORKFLOW.md`, `.claude/DISPATCH.yaml`, `.claude/PROTOCOL.md`, `.claude/NOTION.md` naming each other | Internal cross-references among the six files themselves | Left as-is: they moved together to `archive/sessions/claude-starter-kit/` and still resolve to each other at their new relative paths (all six files moved into the same directory, preserving their relative-name cross-references, though the documents themselves are now inactive evidence, not live instructions). |
| `docs/project/protocol-coverage.yaml:378`, the "Session Start" `excluded_sections` reason text: "full criteria live in .claude/PROTOCOL.md" | Live governance data file, not itself a mirrored protocol section | Updated the reason text to record that `.claude/PROTOCOL.md` was archived at this batch and that its Mode Selection Criteria restated, not added to, what `CLAUDE.md` already states, see Part A's verdict for that rule. Not one of the "two data files" the brief names, but it is a `git grep` hit for the file name and is safely editable (not `docs/project/m2-closure-register.yaml`, not a `docs/decisions/records/` file). |
| `apps/api/coverage-matrix/README.md:46`, `[`PROTOCOL.md`](./PROTOCOL.md)` | False match: a *different*, unrelated `PROTOCOL.md` at `apps/api/coverage-matrix/PROTOCOL.md` (an in-repo mirror of "Working Rule J" for that subsystem), reached by a relative link, not `.claude/PROTOCOL.md` | Left untouched, not one of the six files this batch is about. |
| `docs/programs/cto-readiness/tracks.yaml:887`, the T7 (M4 cutover) track's `next_action`, which describes the whole 8-item batch sequence including "(1) extract the unique live rules from the .claude/ starter-kit files and retarget the PROTOCOL.md pointers" | A forward-looking plan description of the batch sequence, not a pointer that resolves to a file | Left untouched: it still accurately describes the full T7 sequence, of which this session completed only item (1); updating `next_action` to reflect batch 1's completion and hand off to batch 2 is the architect's role when this branch merges into `m4/cutover`, not this batch's (the brief scopes this batch to the six files and the two named data files, and does not ask for a program-register update). |
| `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:22-23`, a dated planning table naming `.claude/PROTOCOL.md`, `.claude/RUNBOOK.md`, `.claude/NOTION.md`, `.claude/DISPATCH.yaml` as future extraction targets "before archiving in M5" | Dated strategy document (historical planning evidence, superseded by the newer 2026-09-11 cutover inventory's decision to do this work at M4 batch 1, not M5) | Left untouched per the migration plan's own instruction to exclude "dated strategy/history documents" from live-pointer sweeps; it is evidence of an earlier plan, not a live instruction a reader would follow today. |
| `docs/operations/distribution-registry.md:333,335`, cites `.claude/NOTION.md` as one of the files a past `rg` search matched while confirming no live Social-Media-Posts writer exists | Dated audit-evidence prose describing a completed search, not an instruction to consult `.claude/NOTION.md` | Left untouched, it is the record of a search result, not a live pointer. |
| `handoff/_general/from-code/2026-05-13-lovable-cancellation-*.md` (two files), historical handoff records describing a 2026-05-13 edit to `.claude/RUNBOOK.md`'s authority-boundaries table | Historical session record | Left untouched, past-tense evidence, not a live pointer. |
| `scripts/project-context-lib.mjs:172-178` | Inventory list entry, not a link (see B4) | Updated, not a pointer removal, see B4. |
| `scripts/m2-closure-register-lib.mjs:88-94` (`EXPECTED_INVENTORY_DISPOSITIONS`) | Disposition map entry, not a link (see B4) | Left as the original `.claude/<name>` keys (see B4 for why), with a new `INVENTORY_PATH_RENAMES` map added alongside it. |
| `docs/project/legacy-authority-inventory.json` | Generated file, not hand-written | Regenerated via `npm run context:generate` (Part C); it is one of `checkGeneratedFileState`'s tracked files (`scripts/check-project-context.mjs:32-42`) and picks up the new `archive/sessions/claude-starter-kit/` paths automatically. |
| `docs/project/m2-closure-register.yaml:136,150,164,178,192,208`, the six `legacy_inventory` rows for these files, each still reading `path: .claude/<name>` | The file this batch's own rules forbid editing | Left completely untouched, as instructed. This is the source of the path mismatch resolved in B4 via `INVENTORY_PATH_RENAMES` rather than by editing this file. |

No hit was found in `.claude/settings.json`, `.claude/commands/`,
`.claude/skills/`, `.claude/hooks/`, `.agents/`, or `.codex/` for any of the
six file names, confirming the inventory's own earlier sweep
(`archive/sessions/2026-09-11-m4-cutover-inventory.md:450-453`); the new
regression test in Part B5 checks exactly this set of locations going
forward.

### B4. The two data files that track these files

Both already carried a comment anticipating exactly this batch
("extract unique live rules; archive obsolete starter-kit system"). Read
each before editing, and this is where the two lists diverged in what
"update" needed to mean:

- `scripts/project-context-lib.mjs`, `INVENTORY_TARGETS`' six
  `owner_area: "claude-workflow"` rows list each file's path, and
  `buildInventory` (`scripts/project-context-lib.mjs:595-614`) calls
  `filesForTarget`, which throws `inventory target is missing` if a
  listed path does not exist on disk (`scripts/project-context-lib.mjs:521-529`).
  Since `npm run context:generate` is one of this batch's own required
  gates, these six paths had to become the real, current
  `archive/sessions/claude-starter-kit/<name>` locations, leaving the old
  `.claude/<name>` paths here would crash `context:generate` outright, not
  just warn. Updated all six.
- `scripts/m2-closure-register-lib.mjs`, a different list,
  `EXPECTED_INVENTORY_DISPOSITIONS`, compared not against disk but against
  `docs/project/m2-closure-register.yaml`'s own `legacy_inventory` rows,
  which this batch may never edit and which still key on the old
  `.claude/<name>` paths. Updating these six keys to the new path would
  have broken that comparison instead of fixing it (the register's own
  path never changes). Left the six keys as the original `.claude/<name>`
  paths, with a comment explaining why.

  Those two now-different sources of truth (the live M1 inventory using
  new paths, the immutable register still using old paths) fed the same
  comparison in `checkClosureRegister`'s "Legacy inventory: exact set
  equality" block, and moving the files without bridging them produced
  twelve real `INVENTORY_ENTRY_MISSING` / `INVENTORY_ENTRY_UNKNOWN`
  warnings from `npm run context:check`, which
  `scripts/check-project-context.test.mjs`'s existing
  `"the checked-in repository context is warning-clean"` test turns into
  an actual `context:test` failure, since it asserts `runChecks(process.cwd())`
  is `[]` against the real repository. Fixing that required a small,
  reusable mechanism rather than a data-only edit: a new exported
  `INVENTORY_PATH_RENAMES` map in `scripts/m2-closure-register-lib.mjs`
  (old path -> current path, one entry per moved file, each citing this
  batch and this report) that `checkClosureRegister`'s inventory-comparison
  block now resolves each register row through before comparing it to the
  live M1 inventory, while the disposition lookup a few lines later still
  keys on the register's own original path (`e.path`) so
  `EXPECTED_INVENTORY_DISPOSITIONS` did not need to change. A second,
  unrelated check five hundred-odd lines later (`INVENTORY_ENTRY_REMOVED`,
  which asks whether the *register file itself* dropped a row versus its
  `origin/main` version, nothing to do with where files live on disk) was
  reusing the same `invByPath` variable and started false-firing once that
  variable's keys were rename-resolved; fixed by giving it its own
  `currentRegisterPaths` set built straight from the register's un-renamed
  paths. Both fixes are comment-documented in place. After both fixes,
  `node scripts/check-project-context.mjs` prints no warnings.

### B5. Regression test, proved by planting

Added two tests to `scripts/check-project-context.test.mjs`:

1. `"no live entrypoint, command, skill, or hook names an archived .claude/
   starter-kit file"`, asserts a helper (`findStarterKitFileNameHits`,
   defined in the same test file) returns an empty array when it greps the
   git-tracked content of `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`,
   `.claude/commands`, `.claude/skills`, `.claude/hooks`, `.agents`, and
   `.codex` for the six starter-kit file names.
2. `"the starter-kit-file-name scan actually detects a planted link
   (control)"`, the planting proof: temporarily appends "See
   .claude/PROTOCOL.md for full criteria and protocol definitions." to
   `CLAUDE.md`, asserts the same helper now returns exactly
   `["CLAUDE.md: PROTOCOL.md"]`, then restores `CLAUDE.md`'s original
   content in a `finally` block and asserts the helper is clean again.

Ran both in isolation
(`node --test --test-name-pattern="starter-kit" scripts/check-project-context.test.mjs`):
both passed, confirming the planted link was detected (test 2's first
assertion) and that removing it restores a clean scan (test 2's second
assertion and test 1). The full `context:test` suite (Part C) was re-run
afterward with both new tests included, still all green, and the pre-existing
`"the checked-in repository context is warning-clean"` test, the one this
batch's file move put at risk (see B4), passed alongside them. No planted
content was left in the committed diff; the control test writes and restores
`CLAUDE.md` in memory during its own run and does not touch the working tree
outside that run.

---

## Part C: gate results

Ran in order, fixing findings before moving to the next:

- `npm run archive:index`, pass (regenerated `archive/README.md` and
  `handoff/README.md`; `--check` re-verified clean at the end, see below).
- `git add -A`
- `npm run context:generate` (first pass), pass; `git add -A`.
- `npm run context:generate` (second pass, per the commit-gate two-pass
  rule), pass, no further diff; `git add -A`.
- `npm run context:check`, first run: reported findings, not a plain pass.
  `INVENTORY_ENTRY_MISSING` and `INVENTORY_ENTRY_UNKNOWN` warnings appeared
  in matching pairs, one per moved file in each direction, from the path
  mismatch described in Part B4. Fixed by adding `INVENTORY_PATH_RENAMES`
  and the accompanying `INVENTORY_ENTRY_REMOVED` fix in
  `scripts/m2-closure-register-lib.mjs` (Part B4). After the fix and a
  re-run of `context:generate`, pass, no warnings
  (`node scripts/check-project-context.mjs` prints "no warnings"). One
  pre-existing, unrelated warning was observed and left alone because it
  predates and is untouched by this batch:
  `DECISION_ID_UNCOVERED CLAUDE.md: decision id "DEC-20260910-A" is named
  next to a protocol but no docs/project/protocol-coverage.yaml row cites
  it as its decision` (from `protocols:coverage`, not `context:check`,
  noted here for completeness of the gate run); it concerns the Review
  routing section, which this batch did not touch.
- `npm run context:test`, pass. Every existing test plus the two new
  regression tests added in Part B5 came back green. The exact test this
  batch was at risk of breaking,
  `"the checked-in repository context is warning-clean"`
  (`scripts/check-project-context.test.mjs`), passed after the
  `INVENTORY_PATH_RENAMES` fix.
- `npm run protocols:check`, pass ("checked 19 candidate protocol
  mirror(s) under docs/governance/protocols").
- `npm run protocols:coverage`, pass, with the one pre-existing warning
  noted above.
- `npm run protocols:coverage:test`, pass, every case in the suite green.
- `npm run docs:check`, pass ("checked 18 docs/ subtrees").
- `npm run programs:check`, pass (both `docs/programs/brand-website/tracks.yaml`
  and `docs/programs/cto-readiness/tracks.yaml` ok).
- `npm run handoff:test`, pass, every case in the suite green.
- `npm run claims:check`, pass ("checked 27 rows").
- `node scripts/generate-archive-index.mjs --check`, pass ("archive/README.md
  and handoff/README.md up to date").

Every gate in the list ran to completion and passed. The one fix required
beyond the file moves and pointer/data-file updates already described in
Part B was the `INVENTORY_PATH_RENAMES` mechanism in
`scripts/m2-closure-register-lib.mjs`, made necessary by moving files a
frozen register still names by their old path (Part B4).
