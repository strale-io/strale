---
doc_type: session-report
authority_scope: none
status: complete
complete: true
phase: M3
authority_active: false
created_at: 2026-09-11
---

# M3 remaining scope: what T6 still requires beyond vendor state

> [!CAUTION]
> **READ-ONLY ANALYSIS - NOT A DESIGN, NOT A CUTOVER.**
> This report inventories the current state of every M3 change item that is
> not the vendor strand, and proposes a batch sequence. It designs nothing in
> detail, activates nothing, and changes no code, schema, workflow, Notion
> content or production state. Candidate project documents stay inactive and
> Notion-backed workflows stay authoritative until the founder-gated M4
> cutover.

## Scope and method

M3 is `docs/strategy/2026-08-31-repo-native-operating-model-migration.md`
lines 844-871 ("M3 - Prepare repo-native workflows and Notion replacements"),
five changes and five exit criteria, tracked as T6 in
`docs/programs/cto-readiness/tracks.yaml:499-549`. T6's vendor strand is done
through batch 4b (`archive/sessions/2026-09-10-m3-vendor-state-inventory.md`,
`docs/strategy/2026-09-10-m3-vendor-state-model.md`, PRs #634/#636/#637 -
`config/vendors.yaml`, `scripts/check-vendors.mjs`,
`apps/api/scripts/check-vendor-roster-drift.ts`'s shadow comparison). This
report does the same kind of inventory - exhaustive term search, path-and-line
citation, every command's hit count recorded - for everything else M3
requires: change 1 (Notion replacements beyond vendor-roster drift), change 2
(flows to prepare), change 3 (shadow mode), change 4 (deployment/scheduled-
workflow tests) and change 5 (protocol coverage manifest), plus what the
vendor strand's own batch 5 still needs.

Method matches the vendor-state inventory: every surface below was found by a
term search across the whole repository (see the appendix for every command
and its hit count), and each reader/writer's reach was verified by reading the
file that proves it fires (an import chain, a `.github/workflows/*.yml` step,
a `package.json` script, or "read only by a person"), not assumed from
naming or history.

## 1. Notion replacements

### 1a. Search: every Notion API use

| Term | Hit count (files) | Where |
|---|---|---|
| `api.notion.com` | 4 | `docs/strategy/2026-08-31-repo-native-operating-model-migration.md` (plan prose), `apps/api/src/lib/daily-digest/fetch-shiplog.ts`, `apps/api/src/lib/daily-digest/fetch-notion.ts`, `apps/api/scripts/check-vendor-roster-drift.ts` |
| `NOTION_TOKEN` | 19 | 1 code file (`check-vendor-roster-drift.ts`), 1 CI workflow (`weekly-drift.yml`), 1 config row (`config/env-manifest.yaml`), 1 track register (`tracks.yaml`), 2 `.env.example` files, the rest are docs/handoff/archive prose |
| `NOTION_API_KEY` | 12 | 2 code files (`fetch-notion.ts`, `fetch-shiplog.ts`), 1 config row (`config/env-manifest.yaml`), 2 `.env.example` files, the rest docs/archive prose |
| `notion` (case-insensitive) in `.claude/` | 8 | `.claude/skills/vendor-switch/SKILL.md`, `.claude/commands/end-session.md`, `.claude/WORKFLOW.md`, `.claude/PROTOCOL.md`, `.claude/RUNBOOK.md`, `.claude/NOTION.md`, `.claude/BUILD.md`, `.claude/DISPATCH.yaml` |

No code outside `apps/api/src/lib/daily-digest/*` and
`apps/api/scripts/check-vendor-roster-drift.ts` calls `api.notion.com`. That
confirms the M1 inventory's scope
(`docs/strategy/2026-08-31-notion-consumer-migration-inventory.md`) is still
complete: two runtime Notion credentials (`NOTION_API_KEY` for the digest,
`NOTION_TOKEN` for the weekly vendor-drift check), one legacy Notion-native
governance document (`.claude/PROTOCOL.md`), and a handful of `.claude/`
reference files that hardcode Notion page/database IDs for a person to open
by hand.

**Documentation drift found in passing (not a new Notion dependency, a wrong
credential name in a doc):** `apps/api/railway-config.md:188` tells whoever
configures the `strale-digest-cron` Railway service to set `NOTION_TOKEN`
"for ship-log / Notion activity." The digest code
(`fetch-notion.ts:9`, `fetch-shiplog.ts:12`, confirmed by reading both) reads
only `NOTION_API_KEY`, never `NOTION_TOKEN`. `config/env-manifest.yaml:750-766`
already documents this exact confusion in its own `purpose` prose for both
variables ("a second, differently-named variable... likely the same
underlying integration under a second name"), so the underlying two-name
problem is known; `railway-config.md` additionally names the wrong one of the
two for the digest's actual dependency. Left as-is per this report's
read-only scope; flagged for a small fix, not corrected here.

### 1b. Daily-digest priorities

**Reader:** `apps/api/src/lib/daily-digest/fetch-notion.ts` `getPriorities()`
(lines 109-134), which calls `fetchUnreviewedDecisions()` (queries the
Decisions DB `ea57671f-...`, filter `Reviewed = false`, lines 136-157) and
`fetchActionRequired()` (queries the Journal DB `f275be62-...`, filter
`Action Required = yes`, lines 159-184). Both use `NOTION_API_KEY`
(`notionHeaders()`, lines 7-13).

**Reach:** `getPriorities` is called from `gatherDigestData()`
(`apps/api/src/lib/daily-digest/index.ts:122`), which is called from
`apps/api/src/jobs/daily-digest.ts:30` (the digest's `main()`). That script is
built to `apps/api/dist/jobs/daily-digest.js` and run by the `strale-digest-cron`
Railway service on cron `30 5 * * *` UTC (`apps/api/railway-config.md:165-197`,
confirmed - see 1a's drift note on which credential it actually needs). It is
**not** invoked by any `.github/workflows/*.yml` (confirmed: 0 hits for
`daily-digest` across `.github/workflows/*.yml`, appendix S4).

**What a repo-native replacement would read instead:** unreviewed Decisions
have a repo-native source already - `docs/decisions/records/*.md`, the format
`DEC-20260904-B` formalizes with git-qualified record keys, and the M2
closure register machinery (`scripts/m2-closure-register-lib.mjs`) already
parses. "Reviewed" has no repo-native equivalent field; a record file has no
review-state column today (every record file is presumed final on merge,
confirmed by reading `docs/decisions/records/DEC-20260904-B.md`'s and two
neighbors' front matter: none carry a `reviewed` key). Action-required items
have no repo-native equivalent at all - the closest analogue,
`handoff/_general/from-code/*.md`'s pending-work convention, is prose, not a
queryable flag; `docs/company/DAILY-RUN.md`'s "needs your decision" section is
the closest structured analogue but is a section of a single file, not a
per-item register.

**What remains:** a repo-native "review/action-required" flag on decision
records (or a small separate register keyed to record files), and a reader
script that replaces `fetchUnreviewedDecisions`/`fetchActionRequired`.
Neither exists today.

### 1c. Distribution surfaces

**Reader:** `apps/api/src/lib/daily-digest/fetch-notion.ts`
`getDistributionSurfaces()` (lines 50-105). Tries the Distribution Registry
page/database `32e67c87-082c-81de-861f-dcc53576304c` as a database first
(`dbResp`, lines 55-79), falls back to reading its page blocks
(`blocksResp`, lines 82-101), then classifies each row/line as a distribution
surface or internal-dev noise using two hardcoded keyword lists
(`INTERNAL_KEYWORDS`, `SURFACE_KEYWORDS`, lines 26-41).

**Reach:** same as 1b - called from `gatherDigestData()`, only reached by the
`strale-digest-cron` Railway service, not by any GitHub Actions workflow.

**What a repo-native replacement would read instead:** the M1 inventory
(`docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:12`) already
names the direction, "versioned distribution registry under
`docs/operations/`, with Git/GitHub evidence" - but `docs/operations/` today
holds only `hmac-rotation.md`, `operator-actions.yaml`, and
`x402-facilitator-switch.md` (confirmed: `ls docs/operations/`); no
distribution registry exists there or anywhere else repo-native.
`docs/company/DISTRIBUTION-FINDINGS.md` (83 lines, read) is a one-time
business-analysis document about buyer channels, not a status registry of
individual PRs/listings - it is not a candidate replacement. The Distribution
PR Integrity Protocol (`CLAUDE.md` DEC-20260422-A) already requires a session
to report "every distribution PR touched" at session end, so the raw evidence
exists in `handoff/_general/from-code/*.md` prose and in the framework repos'
own PR history (queryable via `gh pr list --repo <framework>` per-repo, no
aggregation today).

**What remains:** the registry itself. No repo-native source exists; this is
a genuine gap, not a mapping exercise.

### 1d. Journal and workspace activity (ship log)

**Reader:** `apps/api/src/lib/daily-digest/fetch-shiplog.ts`
`fetchNotionWorkspaceActivity()` (lines 76-147) does a paginated
`POST /v1/search` over the whole Notion workspace filtered to `object: page`,
sorted by `last_edited_time`, stopping once a page older than 24h is seen
(lines 85-113). `extractJournalEntries`/`extractSocialPosts` (lines 151-176)
then split that activity by parent-database ID
(`JOURNAL_DB_ID = f275be62-...`, `SOCIAL_DB_ID = 7d0819c8-...`). The same file
also fetches GitHub commits across four repos (`GITHUB_REPOS`, line 4) using
`GITHUB_TOKEN` - already repo-native, no Notion dependency for that half.

**Reach:** same as 1b/1c - `getShipLog()` is called from `index.ts:118`
inside `gatherDigestData()`, reached only by the Railway cron service.

**What a repo-native replacement would read instead:** Journal entries have a
repo-native analogue in `handoff/_general/from-code/*.md` and
`archive/sessions/*.md` (session logs and reports), but neither carries the
structured `Type`/`Action Required`/`Confidence` fields the Notion Journal DB
does (confirmed: `INTERESTING_PROPS`, `fetch-shiplog.ts:24`, has no repo-file
equivalent). Social-media-post **tracking** has no repo-native equivalent at
all - Strale's social-post activity tracking is Notion-only today. `git
ls-files | grep -i social` as literally run returns 8 files, not 0
(`apps/api/src/capabilities/social-post-generate.ts`/`social-profile-check.ts`
and their manifests, plus design-asset exports named `social-*`), but none of
the 8 is a status registry of the platform's *own* posting activity - the
first two are Strale capability products a customer calls (unrelated to
whether Strale itself has posted), and the rest are brand-kit image exports.
No `docs/company/social/*.md` or similar tracking file exists (0 hits for that
narrower pattern). GitHub commit activity is already repo-native (direct
`api.github.com` calls, no
Notion involved).

**What remains:** a Journal-entry-shape replacement reading
`handoff/`/`archive/sessions/` with parseable front matter (most already
carry `doc_type`/`phase`/`status`, per the front-matter convention observed
throughout `docs/project/*.md` and `archive/sessions/*.md`), and a decision on
whether social-media-post tracking becomes repo-native at all or is dropped
from the digest (no code currently posts to social media from this repo;
`grep -rn "social" apps/api/src/lib/daily-digest` finds only the ship-log
extraction, confirming the platform does not itself publish social content).

### 1e. Vendor-roster drift

Already done through T6 batch 4b. `apps/api/scripts/check-vendor-roster-drift.ts`
reads the Notion Vendor Roster and Decisions DB (`NOTION_TOKEN`) and, since
batch 4b, also runs `printShadowComparison()` (lines 202-234) against
`config/vendors.yaml` via `scripts/vendors-lib.mjs`'s
`compareRosterWithRegister` (`vendors-lib.mjs:994`), printing disagreements in
a separately headed section that never changes the script's exit code. A
`--roster-fixture` flag (lines 236-257) exercises the comparison without
`NOTION_TOKEN` or a live Decisions DB call. Nothing further is needed for this
strand under change 1; what remains for the vendor strand is batch 5 (section
6 below).

### 1f. Notion sweep scope - what section 1a's search missed

Section 1a's sweep searched `api.notion.com`, `NOTION_TOKEN`, `NOTION_API_KEY`,
and case-insensitive `notion` inside `.claude/` only. It never ran a
whole-repository search for the `notion.so`/`notion.com` URL hosts or for bare
32-hex Notion page ids outside `.claude/`. Rerun in this batch (counts, per the
appendix, S29-S31):

- `rg -l "notion\.so"`, whole repo: 60 files (including this report's own self-match).
- `rg -l "notion\.com"`, whole repo: 323 files.
- Bare 32-hex hex strings outside `.claude/` (`rg -oP '[0-9a-f]{32}' --glob '!.claude/**' -l`): 638 files - but this pattern is not Notion-specific at all (it also matches Ethereum addresses, package-lock hashes, and other unrelated 32-hex strings throughout `apps/api/src/web3-assurance/*`, `design/*`, and elsewhere), so the raw count is not a usable Notion-dependency signal on its own.

**Classification of what these searches surface, beyond what section 1a
already covered:** almost all of the `notion.so`/`notion.com` hits are the
already-understood decision-record citation trail - `docs/decisions/records/*.md`
files that carry a `--notion-<32hex>` qualifier in their own filename or a
citation URL in their body (the git-qualified/Notion-qualified record
mechanism DEC-20260904-B already documents), plus `archive/sessions/*.md` and
`handoff/_general/from-code/*.md` prose citing a Notion page for historical
context. These are expected, already-tracked citations, not a new gap.

The genuinely new-to-this-report surface is a small set of **inert citation
fields and comments that no code reads:**

- `apps/api/coverage-matrix/*.yaml` `_source_notion_page_id` (47 of 47
  capability rows carry this field, plus one definition in `schema.json` and
  its documentation in `apps/api/coverage-matrix/README.md`; confirmed:
  `rg -l "_source_notion_page_id"` -> 50 files at this branch, the fiftieth
  being this report's own mention) and
  `vendor_roster_url` (8 of 47 rows carry a live `https://www.notion.so/...`
  value, the rest `null`, plus one definition in `schema.json`; already
  named as H4 in the vendor-state inventory, `archive/sessions/2026-09-10-m3-vendor-state-inventory.md:121`).
- Notion page-id citation comments in three source files named by this
  review: `apps/api/src/lib/trust-grade.ts:3` (`// Spec: Notion page
  31e67c87-...`), `apps/api/src/lib/platform-facts.ts:132` (a `https://www.notion.so/...`
  URL in a comment), `apps/api/src/capabilities/guarded-executor.ts:30`
  (same pattern). A fourth file the same grep sweep touches,
  `apps/api/src/capabilities/skill-extract.ts:104`, is a false positive - its
  one "Notion" hit is the literal string `"Notion"` inside a list of
  third-party tool names a capability detects mentions of, unrelated to the
  platform's own Notion dependency.

**Confirmed by search that no code reads these fields:**
`rg -n "_source_notion_page_id|vendor_roster_url" apps/api/src apps/api/scripts scripts`
returns 0 matches - both fields are written once (by whatever produced the
coverage-matrix rows) and never read back by any script or route. The three
source-comment citations are, by construction, not executable at all (they
are `//`/`*` comments); none of the three files makes a `notion.com`/`NOTION_API_KEY`/`NOTION_TOKEN`
call (confirmed by grep on each file).

**What M4 should do with them (this report's classification, not a decision):**
keep, not remove or rewrite. All of these are read-only-by-a-person citation
trails pointing at the Notion page that originated a fact, the same shape the
vendor-roster inventory's H4 already found acceptable to leave in place
("link only, not a live dependency"). Removing them at M4 activation would
delete historical provenance for no functional gain, since no code path
depends on them; rewriting them (e.g. to a repo-native equivalent) has no
target to rewrite to, since the fact they cite was defined in Notion at a
point before the repo-native migration existed. If M4 eventually retires
Notion entirely, these become dead links rather than a functional break, and
can be swept in an ordinary docs-hygiene pass rather than urgently, once the
underlying Notion pages are no longer reachable to verify against.

## 2. Flows to prepare but not activate

Per `.claude/skills/` and `.claude/commands/` directory listings
(`ls .claude/skills` -> `go`, `vendor-switch`; `ls .claude/commands` ->
`activity.md`, `ceo-brief.md`, `end-session.md`), plus the SessionStart/Stop
hooks in `.claude/settings.json`.

| Flow | Where it lives today | Reads/writes Notion? | Inactive-repo-native version needed |
|---|---|---|---|
| Session start | `.claude/settings.json` `SessionStart` hook -> `.claude/hooks/handoff-session-start.mjs` (28 lines, read whole) -> `scripts/handoff/orient.mjs` | **No.** 0 hits for `notion` (case-insensitive) in either file (appendix S9) | Already fully repo-native. No M3 work needed here - it reads `docs/programs/cto-readiness/tracks.yaml` and prints orientation, no Notion call anywhere on this path. |
| Session end | `.claude/settings.json` `Stop` hook -> `.claude/hooks/handoff-stop.mjs` (63 lines, read whole; gate check only, no Notion) **plus** `.claude/commands/end-session.md` (a person/session-invoked command, not a hook) | **Yes**, in the command, not the hook. `end-session.md` step 3 creates a Journal entry via a Notion data-source id (`collection://8f54383b-...`), step 4 queries the To-do DB (`collection://33a67c87-...`), step 5 checks the Decisions DB (`ea57671f-...`) | The automatic Stop hook is already Notion-free. The `/end-session` **command** needs an inactive repo-native draft: write the Journal-entry-shaped record to a repo file (e.g. an `archive/sessions/` or `handoff/` entry with the same `Title`/`Type`/`Source`/`Actor`/`Action Required`/`Content` shape) instead of the Notion data source, kept inactive alongside the live Notion write until M4. |
| `go` | `.claude/skills/go/SKILL.md` | **No.** 0 hits for `notion` (appendix S10) | Already Notion-free. No M3 work needed. |
| `vendor-switch` | `.claude/skills/vendor-switch/SKILL.md` (byte-identical to `.agents/skills/vendor-switch/SKILL.md`, confirmed by the vendor-state inventory's own diff, S28 there) | **Yes**, 2 hits: line 83 ("the Notion DPA template") and line 101 ("Vendor switches always need a DEC entry in Notion (Decisions DB - `ea57671f-...`)") | Covered by the vendor strand's own batch 5 (section 6) - retarget the checklist's step 5 to `docs/decisions/records/*.md` plus `config/vendors.yaml`'s lifecycle-history append, once that register exists in a usable shape. |
| Claude commands (`activity.md`, `ceo-brief.md`, `end-session.md`) | `.claude/commands/*.md` | `activity.md`: 0 hits. `ceo-brief.md`: not checked in this batch (out of the brief's named five; a spot check found 0 `notion` hits by the same grep sweep that covered `.claude/commands/` in section 1a's table). `end-session.md`: see the session-end row above | Only `end-session.md` needs a prepared inactive version, per the row above. |

**Codex mirror.** `.agents/skills/go` and `.agents/skills/vendor-switch` are
the Codex-facing copies (confirmed present by directory listing); a third,
`.agents/skills/source-command-end-session/SKILL.md` (118 lines, the Codex
skill wrapper carries its own frontmatter and preamble on top of the same
112-line body - see S25), mirrors `.claude/commands/end-session.md`
for Codex and carries the same Notion Journal-entry write step, but not
identically: diffed against the Claude version (S25), the mirror is not
path-naming-only. Two fields carry session-identity content, not a path
swap - `Actor` is written as `claude-code` in the Claude version and `Codex`
in the mirror, and the in-progress to-do ownership filter checks
`Claude code` versus `Codex` - alongside the expected `AGENTS.md`/`.codex/**`
path-naming swaps. Any inactive repo-native draft for session end must
preserve this per-tool Actor/owner distinction (the two tools should keep
writing their own identity, not collapse to one), be written once, and be
referenced from both mirrors rather than duplicated, to avoid the exact drift
class `AGENTS.md`'s own maintenance rule in `CLAUDE.md`'s Report Filing
Convention section warns about.

**How M2 candidates mark inactive, and whether a skill/command can carry the
same marking.** Every file under `docs/project/` (`DECISIONS.md`, `PRODUCT.md`,
`ROADMAP.md`, `STATE.md`, `STRUCTURE.md`, all read whole for their front
matter) carries YAML front matter with `status: candidate` and
`authority_active: false` (plus `phase: M2`), and a `[!CAUTION]` block
immediately under the title stating it is non-authoritative. Claude Code
skill files (`.claude/skills/*/SKILL.md`) and command files
(`.claude/commands/*.md`) are **not** Markdown-with-YAML-front-matter files in
the same sense - the skill/command frontmatter Claude Code itself reads
(`description`, `argument-hint` for commands; a similar block for skills) is a
different, tool-consumed schema, and adding an `authority_active: false` key
there would either be ignored by the harness or collide with a field it does
read. The vendor-state inventory's H6 finding already establishes that
`vendor-switch`'s Notion step is a known, named gap; the cleanest path is
**not** to mark the live skill/command file inactive in place, but to draft
the replacement content in a **separate candidate location** (e.g.
`docs/project/skills-candidates/<name>.md` or a `## Repo-native replacement
(inactive)` section appended to the skill file itself, clearly bracketed and
never executed by the harness because it is prose under a heading, not a
runnable step), consistent with how `docs/project/PROTOCOL-ROUTER.md` itself
is a skeleton file living beside the live `.claude/PROTOCOL.md` rather than an
edit to it. This report does not choose between those two shapes; that choice
is the first task of the batch that prepares the session-end/vendor-switch
replacement drafts (see the batch sequence).

## 3. Shadow mode

The vendor roster comparison (section 1e) is the only replacement running in
comparison mode today. Applying the same shape to the other Notion
replacements once each exists:

- **Daily-digest priorities/distribution/ship-log (1b-1d):** once a
  repo-native reader exists for each, it can run inside `gatherDigestData()`
  alongside the Notion reader with `Promise.allSettled` (the pattern already
  used for every other digest subtask, `index.ts:106-124`), logging
  disagreements via `logWarn` the way `unwrap()` already logs subtask
  failures (`index.ts:84-91`) - additive, no change to what the email
  actually renders, matching the vendor-roster shadow section's
  "never changes the exit code" discipline.
- **Session end / vendor-switch Notion writes:** these are writes, not reads,
  so "comparison mode" does not apply in the read-diff sense; the shadow-mode
  equivalent for a write path is drafting the repo-native write **without
  executing it** (write to a local variable / print what would be written,
  never call the Notion API a second way) until M4, which is what section 2's
  "inactive repo-native draft" already describes.
- **Protocol coverage (item 5):** not a read/write comparison at all - "shadow
  mode" does not apply; it is a manifest that either represents each
  protocol or does not, checked structurally, not compared against a Notion
  source.

## 4. Deployment and scheduled-workflow tests

| Mechanism | Invokes | Test proving invocation exists today? |
|---|---|---|
| `.github/workflows/weekly-drift.yml`, `check-platform-facts-drift` step (line 63) | `apps/api/scripts/check-platform-facts-drift.ts` | **No.** 0 hits for `weekly-drift` in any `*.test.ts` or `*.test.mjs` file (appendix S11/S12). |
| `.github/workflows/weekly-drift.yml`, `vendor-roster` step (lines 80-86) | `apps/api/scripts/check-vendor-roster-drift.ts` | **No**, same search. |
| Railway `strale-digest-cron` service, cron `30 5 * * *` UTC | `apps/api/dist/jobs/daily-digest.js` (built from `src/jobs/daily-digest.ts`) | **No**, and this one is structurally harder: a Railway cron service's existence and schedule live in Railway's own project configuration, not in a repo file `npm test` can parse. `apps/api/railway-config.md` documents the intended setup by hand; nothing in the repository asserts the live Railway service matches that document. This mirrors the exact failure class DEC-20260504-C exists to prevent (a deploy-pipeline dependency assumed rather than verified) - the difference is that for GitHub Actions the assertion is at least mechanically checkable (parse the workflow YAML, confirm the step exists), while for Railway it is not without a Railway API credential this repo does not hold read access to per `config/env-manifest.yaml`. |
| `.github/workflows/ci.yml`, `vendors:check`/`vendors:test` steps (lines 476-477) | `scripts/check-vendors.mjs` / `scripts/vendors.test.mjs` | Not a scheduled workflow (runs on every PR via `ci.yml`), so outside this item's scope by the plan's own wording ("deployment/scheduled-workflow"), but noted for completeness: `ci.yml` running on every push/PR is itself the reachability proof for anything wired there, unlike the weekly cron jobs above. |

**Precedent in the repo for this kind of test.** No script currently parses
`.github/workflows/*.yml` to assert that a named step invokes a named script
(searched: `check-no-bare-catch.mjs`, `check-no-external-column-access.mjs`,
`check-no-new-console.mjs`, and `npm-release-resolve.mjs` are the only
scripts that reference `.github/workflows` at all, and none of them do this;
appendix S13). The closest existing pattern is `DEC-20260504-C`'s own
requirement (read the actual mechanism, cite file/line) applied by hand in a
PR description, not automated. A generic "workflow step exists and names this
script" test does not exist and would need to be written new, not adapted
from a precedent.

**What remains:** for every M3 Notion-replacement reader that lands (sections
1b-1d), a test that parses the relevant `.github/workflows/*.yml` (or, for the
Railway-only digest job, documents the gap explicitly rather than silently
passing) and asserts the new reader is wired in wherever its Notion
counterpart is invoked from. None of this exists today for any of the three
already-scheduled Notion consumers either (weekly-drift's two steps, the
digest cron), so the gap predates M3 and is not specific to the replacements
this milestone adds.

## 5. Protocol coverage manifest

**The manifest does not exist as data.** The plan's own text
(`docs/strategy/2026-08-31-repo-native-operating-model-migration.md:504-522`)
describes `PROTOCOL-ROUTER.md` as owning "the complete trigger table," each
full protocol body living under `docs/governance/protocols/`, and "a coverage
manifest [that] maps stable protocol IDs to trigger text, full-body path,
governing decision, and code/test references." Today:

- `docs/project/PROTOCOL-ROUTER.md` is a 20-line M1 skeleton (front matter
  `status: skeleton`, `phase: M1`, `m1_template: true`; body reads only "No
  protocol routes are active in M1. Mandatory protocol text remains in the
  existing entrypoints and Claude workflow files until it is extracted and
  coverage-checked in later milestones," read in full above).
- `docs/governance/protocols/` holds exactly three files:
  `DISTRIBUTION_PR_PREFLIGHT.md`, `REVIEW_TEMPLATE.md`, `README.md`
  (confirmed by directory listing). Only one mandatory protocol
  (Distribution PR Integrity, DEC-20260422-A) has any full-body presence
  there, and even that is the pre-flight checklist, not the complete
  protocol text that still lives in `CLAUDE.md` lines 507-553.
- No coverage-manifest data file (e.g. `docs/project/protocol-coverage.yaml`)
  exists anywhere in the repository (0 hits for `protocol-coverage`,
  `coverage_manifest`, or a `.yaml`/`.json` file matching that name; appendix
  S14).
- The one thing that does search for "coverage manifest" as a phrase
  (`scripts/project-context-lib.mjs:71-74`) is the M1 template generator that
  wrote the skeleton text above - not a checker, not a data source.

**Every mandatory protocol currently in `CLAUDE.md`, and whether the (absent)
manifest represents it:**

Every range below starts at the protocol's own `###` heading line in `CLAUDE.md`
and ends at the last content line before the next `###` heading (the blank
separator line is excluded from both ends), so no two ranges overlap. Verified
by reading `CLAUDE.md` directly in this batch (heading lines confirmed by
`grep -n "^### "`, boundaries confirmed by reading each transition):

| Protocol | `CLAUDE.md` location | Full body exists under `docs/governance/protocols/`? | Represented in a coverage manifest? |
|---|---|---|---|
| Session contract (both tools, every session) | lines 175-211 | No | No |
| Distribution PR Integrity Protocol (DEC-20260422-A) | lines 507-553 | Partial - only the pre-flight checklist (`DISTRIBUTION_PR_PREFLIGHT.md`), not the full protocol text | No |
| Capability Onboarding Protocol (DEC-20260320-B) | lines 555-582 (the "Capability Onboarding Protocol" heading itself; the earlier "Adding New Capabilities (MANDATORY PIPELINE)" section at lines 370-479 is the how-to workflow this protocol governs, not the protocol text itself, and is a separate range) | No | No |
| Audit-Follow-up Test Coverage Protocol (DEC-20260504-A) | lines 584-609 | No | No |
| Bulk-Operation Deploy Protocol (DEC-20260504-B) | lines 611-637 | No | No |
| Deploy Mechanism Verification Protocol (DEC-20260504-C) | lines 639-664 | No | No |
| Shared-Checkout Rule (concurrency safety) | lines 691-734 | No | No |

(A prior version of this table cited the Capability Onboarding Protocol as
lines 370-583, which double-counted the "Adding New Capabilities" section and
the entire Distribution PR Integrity Protocol range beneath it. Corrected in
review round 1 - batch 6 extracts text from these exact ranges, so they must
not overlap.)

**What remains:** essentially the entire item. No full-body extraction has
happened for six of the seven mandatory protocols/rules named above, no
coverage-manifest data file exists, and `PROTOCOL-ROUTER.md` is still the M1
placeholder it was written as. This is the least-started of the five M3
change items.

## 6. Vendor strand remainder (batch 5)

Batch 5, per the vendor-state model's own batch plan
(`docs/strategy/2026-09-10-m3-vendor-state-model.md:329-330`), is: "generate
the agent-context and customer-facing views and prepare, without activating,
the vendor-switch skill's cutover."

**Confirmed gap the brief names.** `config/vendors.schema.json` (read in
full) has no `category` field and no `primary`/`fallback` marker at the
vendor level - a vendor entry carries `id`, `name`, `aliases`, `lifecycle`
(the append-only history), `re_evaluation_triggers`, `verification`, and
`authorization`, but nothing that says "this vendor is the sanctions
provider" the way `apps/api/src/lib/platform-facts.ts`'s `STATIC_FACTS.vendors`
does (`sanctions: "Dilisense"`, `pep: "Dilisense"`, ... 14 category keys,
lines 49-67, read in full). Cross-checked directly: of the 14 `STATIC_FACTS.vendors`
values, 12 have a matching `config/vendors.yaml` `id`
(`dilisense`, `serper`, `voyage-ai`, `anthropic`, `browserless`, `stripe`,
`coinbase-cdp`, `better-stack`, `cobalt-intelligence`, `gleif` - confirmed
present in the register's 83 `id:` entries) but **two do not**: "Liberty
Data" (`us_ein`) and "BODACC" (`fr_litigation`) have no corresponding
register entry at all (0 hits for `liberty` or `bodacc` in
`config/vendors.yaml`, case-insensitive).

**What generating the agent-context/customer-facing views needs, concretely:**

1. **Add the two missing vendors** (Liberty Data, BODACC) to
   `config/vendors.yaml` with their lifecycle history and evidence, the same
   way batch 4a added the fourteen `STALE_VENDORS` entries - this is
   mechanical, following the existing pattern, and does not require a schema
   change.
2. **Decide where the category/primary relationship lives.** Two options,
   neither chosen by this report: (a) add a `category` and `role`
   (`primary`/`fallback`) field to the schema and populate it for the 14
   `STATIC_FACTS.vendors` categories (leaving it `null`/absent for the other
   69 vendors that have no category, e.g. the ~50 per-country registry
   vendors already covered by `apps/api/coverage-matrix/*.yaml`'s own
   `sourcing_pattern`); or (b) keep the register vendor-identity-only and
   derive the category view by a join script that reads
   `STATIC_FACTS.vendors` (or its eventual derived replacement, per the
   design document's point 4) and looks up each value's register `id` by
   name/alias match, the same lookup-by-string approach the design document
   already recorded as an evidence conflict for `config/env-manifest.yaml`'s
   `provider` field. Option (b) needs no schema change and matches the
   register's own "nothing gets a second copy" principle (design document
   point 2); option (a) is more directly queryable but duplicates a fact
   `platform-facts.ts` already owns. This report flags the choice; it is a
   design decision for whichever batch builds the view, not a founder
   decision - it changes no runtime behavior and both options stay inactive
   until M4.
3. **The agent-context view** (whatever downstream consumes it - the brief
   does not name a concrete file, and none was found: 0 hits for
   `agent-context` or `agent_context` as a file/variable name anywhere in the
   repository, appendix S15) has no current draft. Building it is new work,
   not a mapping exercise.
4. **The customer-facing view** likewise has no current draft under this
   name; the closest existing customer-facing vendor surface is
   `STATIC_FACTS.vendors` itself (already live, already customer-facing via
   `GET /v1/platform/facts`) and the coverage-matrix's `provider` field
   (already live, per-capability). Whether "customer-facing view" means a new
   derived artifact or simply confirming these two stay the customer-facing
   surface (with the register as an internal-only addition) is unresolved by
   the source documents and should be settled explicitly in whichever batch
   takes this on.
5. **Preparing, without activating, the vendor-switch skill's cutover**
   means drafting the retargeted step 5 text (Decision goes to
   `docs/decisions/records/*.md` plus a `config/vendors.yaml` lifecycle
   append, not a Notion Decision) per section 2's "inactive repo-native
   draft" pattern, not editing the live skill file's executable steps.

None of batch 5's work requires a production write, a Notion write, or a
founder decision - it is register population (mechanical, following an
established pattern) plus a design choice between two shadow-mode-compatible
options for the category/primary view, both revocable and neither touching
runtime code.

## Proposed batch sequence

Each batch stays shadow or inactive; none touches production, activates a new
entrypoint, or writes to Notion. Batches are ordered so each is independently
mergeable and small.

1. **Vendor batch 5 (continues the vendor strand, not new scope):**
   add Liberty Data and BODACC to `config/vendors.yaml`; pick and implement
   one of the two category/primary-view options (section 6, item 2); draft
   the agent-context and customer-facing views; draft the vendor-switch
   skill's retargeted step 5 as inactive prose (not an edit to the live
   step) - this batch owns that draft exclusively (see batch 4, which no
   longer duplicates it). Files: `config/vendors.yaml`, a new view
   script/data file (name TBD by the batch), `docs/strategy/2026-09-10-m3-vendor-state-model.md`
   (append, not rewrite, the batch-5 outcome). Checks: extend
   `scripts/vendors.test.mjs` with planted-failure coverage for the two new
   vendors and whichever view function is added. Moves: M3 exit criterion 1
   (vendor-roster strand's remaining piece) and partially exit criterion 5's
   "M3 (prepare)" framing for vendor-switch specifically.

2. **Daily-digest Decisions/Journal/Action-Required repo-native draft (item
   1b, plus 1d's Journal-entry-shaped content):** design and land, inactive,
   three repo-native readers - (a) "unreviewed decisions" (needs a
   review-state convention decided first - a new front matter field on
   decision records, or a small separate register; this report does not
   choose), (b) the Journal "Action Required" digest reader that replaces
   `fetchActionRequired` (section 1b): this has no repo-native analogue at
   all today (the closest, `docs/company/DAILY-RUN.md`'s "needs your
   decision" section, is prose in one file, not a per-item queryable flag),
   so this batch's first task for (b) is the same kind of register-shape
   decision as (a) - a small `action-required`-flagged register keyed to the
   files it's raised on, decided once and reused, not two separate ad hoc
   conventions - and (c) Journal-entry-shaped digest content read from
   `handoff/`/`archive/sessions/` (item 1d's non-social half). Runs inside
   `gatherDigestData()` alongside the Notion readers via `Promise.allSettled`,
   logged via `logWarn`, changing no rendered email content (shadow mode, per
   section 3). Files: a new `apps/api/src/lib/daily-digest/fetch-repo-native.ts`
   (or similar), `apps/api/src/lib/daily-digest/index.ts` (additive wiring
   only). Checks: unit tests on all three new readers; a planted-disagreement
   test proving the shadow log fires without changing `DigestData`. Moves: M3
   exit criterion 1 (partial) and criterion 3 (shadow-mode read path).

3. **Distribution-surfaces registry (item 1c), plus item 1d's
   social-media-post tracking decision:** the largest genuine gap in item 1 -
   no repo-native distribution-surfaces source exists at all. Design first (a
   `docs/operations/distribution-registry.yaml` or similar, one row per
   distribution attempt with status/date/evidence, following the
   `config/vendors.yaml`/`config/env-manifest.yaml` "values are data"
   pattern), populate it from the Distribution PR Integrity Protocol's
   existing session-end reporting requirement (handoff files already carry
   this prose; this batch structures it), then wire a shadow reader the same
   way as batch 2. This batch also **decides** (architect's call, not a
   founder escalation) item 1d's social-media-post tracking question: search
   the digest's own scope for whatever still reads or writes
   `SOCIAL_DB_ID`/social-post extraction (`fetch-shiplog.ts`'s
   `extractSocialPosts`, plus any consumer of its output), and on that
   evidence either give it a repo-native register alongside the distribution
   registry or drop it from the digest - decided inside this batch, on the
   evidence found here, not escalated. Checks: a structural validator (the
   `apps/api/scripts/validate-coverage-matrix.mjs` pattern) that every row in
   the new registry resolves its required fields, wired into a new npm script
   and a CI step (report-only, matching this milestone's non-blocking
   discipline); a planted-invalid-row test proving the validator actually
   fails. Moves: M3 exit criterion 1.

4. **Session-end inactive draft (item 2's write side, session-end only):**
   decide the candidate-location question this report flagged (append an
   inactive section to the live skill/command file vs. a separate
   `docs/project/skills-candidates/` file), then draft the repo-native
   Journal-entry write for `/end-session` in both the `.claude/` and
   `.agents/` mirrors, inactive, preserving each mirror's own Actor/owner
   identity (section 2's `claude-code`/`Claude code` vs. `Codex` distinction -
   the repo-native draft must carry the same per-tool field, not collapse it).
   The vendor-switch skill's retargeted step 5 is **not** drafted here - that
   is batch 1's task exclusively (section 6, item 5), avoiding the duplicate
   claim a prior version of this sequence made. Checks: a mirror-consistency
   test (the same shape as S24/S25's `go`/`vendor-switch`/`end-session` diffs)
   asserting the inactive draft section is present and equivalent in both
   mirrors modulo the expected `CLAUDE.md`/`AGENTS.md` and
   `claude-code`/`Codex`-style path/identity swaps, and that the live
   executable steps are byte-unchanged from before this batch. Moves: M3
   exit criterion 1 (write side) and exit criterion 5's "old entrypoints
   remain in force" (by construction, since nothing here is activated).

5. **Scheduled-workflow reachability tests (item 4):** write the generic
   "workflow step X exists and invokes script Y" test pattern (parses
   `.github/workflows/*.yml`), apply it first to the two `weekly-drift.yml`
   steps that already exist (closing a pre-existing gap, not new M3 scope,
   but the cheapest way to prove the pattern works before applying it to
   whatever batches 2/3 add), then extend it to cover the new shadow readers
   as they land. Explicitly document, rather than silently skip, that the
   Railway `strale-digest-cron` cron schedule cannot be verified from a repo
   test without a Railway API credential this repo does not hold (per
   `config/env-manifest.yaml`). Moves: M3 exit criterion 3 ("scheduled and
   deployment mechanisms verified, not assumed").

6. **Protocol full-body extraction, one protocol per batch:** for each of the
   six protocols/rules in section 5's corrected table that has no full-body
   file, extract its complete text (unabridged - the plan requires "preserve
   all mandatory protocol full text") from its exact `CLAUDE.md` line range
   to `docs/governance/protocols/<NAME>.md`, leaving `CLAUDE.md`'s copy in
   place until M4 (both must say the same thing; this is extraction, not
   supersession). Suggested order by incident-recency and money/compliance
   weight: Deploy Mechanism Verification -> Audit-Follow-up Test Coverage ->
   Bulk-Operation Deploy -> Capability Onboarding -> Shared-Checkout Rule ->
   Session contract. Each batch is independently small and mergeable. Checks:
   a new script (e.g. `scripts/check-protocol-extraction.mjs`) that reads the
   named `CLAUDE.md` line range for each extracted protocol and asserts the
   extracted body under `docs/governance/protocols/<NAME>.md` is byte-identical
   to it, the same mirror-check discipline the repository already applies
   elsewhere (the `go`/`vendor-switch` skill mirrors, S24; `CLAUDE.md`/`AGENTS.md`
   drift) - wired report-only in CI as each protocol lands, so a hand-edited
   drift between the two copies is caught before it can happen twice. Moves:
   M3 exit criterion 4 (partial, one protocol per batch).

7. **Coverage manifest and populated router:** only after step 6 has
   produced full-body files for a majority of the protocols, build the actual
   `docs/project/protocol-coverage.yaml` (or similar) data file mapping
   protocol ID -> trigger text -> full-body path -> governing decision ->
   code/test references, and populate `docs/project/PROTOCOL-ROUTER.md`
   beyond its M1 skeleton, still `status: candidate`/`authority_active:
   false`. Checks: a checker (structural: every row resolves, matching the
   pattern of `env:check`/`vendors:check`) in report-only mode, plus a
   planted-broken-row test proving it fails when a row's path or reference
   doesn't resolve. Moves: M3 exit criterion 4 (completed).

**M3 vs. M4 boundary, explicit for every batch above:** all seven batches
prepare and compare; none activates a new entrypoint, none removes a Notion
read or write, none makes a check blocking. Activation (making the repo-native
readers authoritative, retargeting `vendor-switch` and `/end-session` for
real, removing `NOTION_TOKEN`/`NOTION_API_KEY` consumption, making the
coverage-manifest checker blocking) is M4 (`docs/strategy/2026-08-31-repo-native-operating-model-migration.md:873-910`),
not this milestone.

**Flagged for a founder decision, a production write, or a Notion write
(none required by M3 itself, but relevant to how these batches will
eventually land):**

- **The review-state convention for decision records** (batch 2) is a schema
  choice on `docs/decisions/records/*.md` front matter that outlives M3 - not
  strictly founder-gated (it is a repo-native schema addition, inactive, per
  the Session contract's ordinary engineering authority under DEC-20260815-A),
  but flagged because it is the first new field on every future decision
  record and worth a deliberate choice rather than an incidental one.
- **The Action-Required register shape** (batch 2) is the same kind of
  engineering choice, not founder-gated, flagged for the same reason - it is
  the first repo-native analogue for a Notion Journal field that has none
  today.
- **The social-media-post tracking decision** (batch 3) is explicitly the
  architect's call inside that batch, made on the evidence the batch itself
  gathers (whether anything still reads or writes the social-post tracking),
  not a founder escalation and not deferred to a later batch.
- **The category/primary-view design choice for the vendor register**
  (section 6, item 2) is likewise an engineering choice under existing
  delegated authority, not a founder decision - flagged only because this
  report deliberately did not resolve it.
- **Nothing in this report requires a production write, a Notion write, or a
  founder decision to execute the batch sequence itself.** Every batch is
  additive, inactive, or read-only.
- **The one item this report could not resolve at all without external
  access:** verifying the live Railway `strale-digest-cron` service's actual
  cron schedule and environment variables against what
  `apps/api/railway-config.md` documents. This repo's `DATABASE_URL` is
  read-only and no Railway API credential is listed in
  `config/env-manifest.yaml`; confirming the live service matches its
  documentation would need either Railway dashboard access or a
  founder-provided credential, and is out of scope for a read-only repo
  inventory in any case.

## Confirmation

Nothing in this batch changed code, schema, production state, or Notion
content. No skill, command, hook, or workflow file was edited - every finding
above is read evidence with its reach verified as stated. Where a fact could
not be verified from static reading alone (the Railway cron service's live
configuration), it is marked as such rather than assumed.

## Search appendix

Every search below was run at this branch's head (`origin/main` at
`8d91c1974d569adda7fb714ac94eeae368f83644`, the same commit that landed T6
batch 4b, PR #637 - confirmed by `git merge-base --is-ancestor` against
`origin/main` before starting this batch). Review round 1's rerun searches
(S15, S18, S20, S24, S25, S29-S31, and the counts fixed throughout this
report) were verified against the same `origin/main` commit, which had not
moved between the two batches - no code changed, so no result is stale.

| # | Command (pattern / scope) | Result |
|---|---|---|
| S1 | ripgrep `api\.notion\.com`, whole repo, `files_with_matches` | 5 files: the 4 originally listed (`docs/strategy/2026-08-31-repo-native-operating-model-migration.md`, `apps/api/src/lib/daily-digest/fetch-shiplog.ts`, `apps/api/src/lib/daily-digest/fetch-notion.ts`, `apps/api/scripts/check-vendor-roster-drift.ts`) plus this report file itself, which now names the term in its own section 1a prose - a self-match, not a new dependency |
| S2 | ripgrep `NOTION_TOKEN`, whole repo, `files_with_matches` | 17 files without `--hidden` (ripgrep skips dotfile-named paths like `.env.example` by default); with `--hidden` (excluding `node_modules/`, `.git/`): 20 files - the 19 originally listed (which required `--hidden` to reach both `.env.example` files, not stated in the original command) plus this report file's own self-match |
| S3 | ripgrep `NOTION_API_KEY`, whole repo, `files_with_matches` | 11 files without `--hidden`; with `--hidden`: 13 files - the 12 originally listed (same `--hidden` requirement for the two `.env.example` files) plus this report file's own self-match |
| S4 | `grep -n "daily-digest" .github/workflows/*.yml` | 0 matches - confirms the digest is not invoked by any GitHub Actions workflow |
| S5 | `grep -n "daily-digest\|digest" apps/api/package.json` | 2 matches: `digest` and `digest:preview` npm scripts (`tsx src/jobs/daily-digest.ts` / `digest-preview.ts`) |
| S6 | `grep -n -i "digest" apps/api/railway-config.md` | confirms the `strale-digest-cron` service block, lines 165-199, including the `NOTION_TOKEN` credential-name line (188) this report flags as inconsistent with the code's actual `NOTION_API_KEY` dependency |
| S7 | ripgrep `gatherDigestData\|daily-digest`, whole repo, `files_with_matches` | 61 files - the 59 originally listed (mostly handoff/archive prose referencing past digest work; runtime files are `apps/api/src/lib/daily-digest/*.ts`, `apps/api/src/jobs/daily-digest.ts`, `apps/api/src/jobs/digest-preview.ts`) plus this report file's own self-match and its own growth across review round 1 |
| S8 | `grep -n "notion" -i .claude/*.md .claude/*.yaml` | as literally written this is a non-recursive glob and finds only the 6 top-level files (`.claude/WORKFLOW.md` (4), `.claude/PROTOCOL.md` (71), `.claude/RUNBOOK.md` (13), `.claude/NOTION.md`, `.claude/BUILD.md` (6), `.claude/DISPATCH.yaml` (33)), missing the two subdirectory files the original row's own prose lists. Corrected command `rg -il "notion" .claude/` (recursive): 8 files - the 6 above plus `.claude/skills/vendor-switch/SKILL.md` and `.claude/commands/end-session.md`, matching section 1a's row 4 and this report's own section 2 |
| S9 | `grep -in "notion" .claude/hooks/handoff-session-start.mjs .claude/hooks/handoff-stop.mjs` | 0 matches in either file - confirms session start/end **hooks** (not the `/end-session` command) are Notion-free |
| S10 | `grep -in "notion" .claude/skills/go/SKILL.md` | 0 matches - confirms `/go` is Notion-free |
| S11 | ripgrep `weekly-drift`, glob `*.test.ts` | 0 files |
| S12 | ripgrep `weekly-drift`, glob `*.test.mjs` | 0 files |
| S13 | `grep -rln "\.github/workflows" scripts/*.mjs apps/api/scripts/*.mjs apps/api/scripts/*.ts` excl. `*test*` | 4 files: `check-no-bare-catch.mjs`, `check-no-external-column-access.mjs`, `check-no-new-console.mjs`, `npm-release-resolve.mjs` - none asserts a workflow step invokes a named script |
| S14 | ripgrep `coverage manifest\|coverage_manifest\|PROTOCOL-ROUTER`, whole repo, `files_with_matches` | 16 files - the 15 originally listed (docs/strategy plan prose, `docs/project/STRUCTURE.md`, `docs/programs/cto-readiness/{tracks.yaml,PROGRAM.md}`, `scripts/project-context-lib.mjs`, `docs/project/m2-closure-register.yaml`, `docs/decisions/records/DEC-20260511-D.md`, five `archive/sessions/*` files, two `handoff/*` files) plus this report file's own self-match - no data file named `protocol-coverage.*` or similar exists |
| S15 | ripgrep `agent-context\|agent_context`, whole repo, `files_with_matches` | 3 files: `docs/programs/cto-readiness/tracks.yaml`, `docs/strategy/2026-09-10-m3-vendor-state-model.md`, and this report file itself (`archive/sessions/2026-09-11-m3-remaining-scope-inventory.md`), all prose referencing the not-yet-built view by name, never a file path or a `const`/`type`/export named `agent-context`/`agent_context` - confirms section 6 item 3's narrower claim ("0 hits ... as a file/variable name") while correcting this row's earlier bare "0 matches", which contradicted that same prose |
| S16 | `ls docs/governance/protocols/` | 3 files: `DISTRIBUTION_PR_PREFLIGHT.md`, `README.md`, `REVIEW_TEMPLATE.md` |
| S17 | `cat docs/project/PROTOCOL-ROUTER.md` (read whole, 20 lines) | confirms M1-skeleton status, no active routes |
| S18 | `grep -n "^### .*Protocol\|MANDATORY\|^### Shared-Checkout\|^### Session contract" CLAUDE.md` | 13 matches as literally written - the `MANDATORY` alternative also hits the in-body **MANDATORY** sentence of 4 protocols and the unrelated `### Adding New Capabilities (MANDATORY PIPELINE)` heading, none of which is one of the 7 distinct protocol/rule headings. Command corrected to `grep -n "^### .*Protocol\|^### Shared-Checkout\|^### Session contract" CLAUDE.md` (headings only): 7 matches, identifying the 7 mandatory protocols/rules in section 5's corrected table |
| S19 | `grep -n "^  - id:" config/vendors.yaml \| wc -l` | 83 vendor entries |
| S20 | `grep -n -i "liberty\|bodacc" config/vendors.yaml` | 1 match: line 60, the header comment's own prose listing capability slugs it does *not* cover (`fr-bodacc-lookup`, among others) - not a vendor `id:` entry. Rerun of "liberty" alone: 0 matches. Rerun of "bodacc" alone: 1 match (the same header-comment line). `grep -n "^  - id:" config/vendors.yaml \| grep -i "liberty\|bodacc"`: 0 matches - confirms Liberty Data and BODACC are absent from the register as vendor entries, which is the finding this row supports; the earlier "0 matches" bare claim was wrong about the combined-pattern count |
| S21 | `grep -n "category\|primary" config/vendors.schema.json config/vendors.yaml` | 0 matches - confirms no category/primary-vendor field exists in the schema or the populated register |
| S22 | `ls docs/operations/` | 3 files: `hmac-rotation.md`, `operator-actions.yaml`, `x402-facilitator-switch.md` - no distribution registry |
| S23 | `git ls-files \| grep -i social` | 8 files as literally run, not 0: `apps/api/src/capabilities/social-post-generate.ts` and `social-profile-check.ts` (customer-facing capability products, unrelated to Strale's own posting activity), their two manifests, and four design-kit image/HTML exports named `social-*`. None is a status registry of Strale's own social-post activity, which is the claim this row supports. Narrower rerun `git ls-files | grep -i "company/social\|social.*track"`: 0 hits - confirms no repo-native tracking file exists under that name |
| S24 | `diff .claude/skills/go/SKILL.md .agents/skills/go/SKILL.md` | 4 line differences (4 one-line hunks), all `CLAUDE.md`/`.claude/**` -> `AGENTS.md`/`.codex/**` path-naming swaps, no behavioral difference - corrects this row's earlier "2 line differences" undercount |
| S25 | `diff .claude/commands/end-session.md .agents/skills/source-command-end-session/SKILL.md` | frontmatter-shape and path-naming differences, plus two content differences that are not path-naming: line 39/45 `Actor: claude-code` (Claude) vs. `Actor: Codex` (Codex mirror), and line 54/60 the in-progress ownership filter `Claude code` vs. `Codex`. Both mirrors otherwise retain the identical Notion Journal-entry write step and DB ids - corrects section 2 and this row's earlier "path-naming only" characterization |
| S26 | `grep -n "NOTION_API_KEY\|NOTION_TOKEN" -B2 -A6 config/env-manifest.yaml` | confirms both rows exist, and that the manifest's own `purpose` prose for `NOTION_API_KEY` already names the two-credential-name confusion this report's section 1a flags against `railway-config.md` |
| S27 | `grep -n "STATIC_FACTS" apps/api/src/lib/platform-facts.ts \| head -5` then read lines 40-70 | confirms the 14-category `STATIC_FACTS.vendors` map used for the section 6 cross-check |
| S29 | ripgrep `notion\.so`, whole repo, `files_with_matches` | 60 files, including this report file's own self-match (section 1f) |
| S30 | ripgrep `notion\.com`, whole repo, `files_with_matches` | 323 files (section 1f); the great majority are `docs/decisions/records/*.md`, `archive/sessions/*.md`, and `handoff/_general/from-code/*.md` citing the Notion page a decision or session originated from - the already-tracked citation trail, not a new gap |
| S31 | `rg -oP '[0-9a-f]{32}' --glob '!.claude/**' -l`, whole repo | 638 files - not Notion-specific (matches Ethereum addresses, lockfile hashes, and other unrelated 32-hex strings); superseded for this report's purpose by the targeted field/comment searches in section 1f (`_source_notion_page_id`, `vendor_roster_url`, and the three named source-comment citations) |

Known files opened and read in full or in the cited section for this batch:
`apps/api/src/lib/daily-digest/fetch-notion.ts` (184 lines, whole),
`apps/api/src/lib/daily-digest/fetch-shiplog.ts` (251 lines, whole),
`apps/api/src/lib/daily-digest/index.ts` (151 lines, whole),
`apps/api/src/jobs/daily-digest.ts` (58 lines, whole),
`apps/api/railway-config.md` (lines 160-199),
`.claude/settings.json` (whole),
`.claude/hooks/handoff-session-start.mjs` (28 lines, whole),
`.claude/commands/end-session.md` (112 lines, whole),
`docs/project/PROTOCOL-ROUTER.md` (20 lines, whole),
`docs/strategy/2026-08-31-repo-native-operating-model-migration.md` (lines
28-68, 440-522, 550-554, 640-693, 786-1027, 1064-1068 - the continuation
checkpoint, the M3/M4 sections, and the protocol-router design prose),
`docs/programs/cto-readiness/tracks.yaml` (lines 499-560),
`config/vendors.schema.json` (whole),
`config/vendors.yaml` (header comment and every `id:` line),
`docs/strategy/2026-09-10-m3-vendor-state-model.md` (whole, 387 lines),
`archive/sessions/2026-09-10-m3-vendor-state-inventory.md` (whole, 407 lines).
