---
doc_type: m2-closing-review-round
round: 12
commit: fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-06'
verdict: FAIL
status: failed
complete: true
phase: M2
authority_scope: none
authority_active: false
---

> [!CAUTION]
> **M2 CANDIDATE RECORD -- NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Method

Round 12 of the M2 closing independent review, run at commit
`fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d` (`DEC-20260905-M`'s merge
commit). Six fresh, read-only reviewers, none the author of any reviewed
content, applied the quotation convention `DEC-20260905-C` through `-M`
state (normalize quotation and source before comparing: transliterate
symbols, lowercase, strip non-alphanumerics; an ellipsis splits a
quotation into ordered segments; a relation substantiated by an amending
record, or narrated in the target record's own body rather than the
source record's, is substantiated, not a defect; a figure stated as of a
date is a dated observation, not a defect, when unrelated work later
moves it; a double-quoted span attributed to no source and not presented
as the words of a row, file, page or person is the record's own wording,
judged as prose, not a quotation, per `DEC-20260905-M`'s clause), ran the
operator checker, `scripts/m2-quote-fidelity.mjs`, against the parsed
Notion export and the sibling `strale-frontend` checkout, at
`--min-chars 12`, alongside each partition's own read of every
quotation, evidence path, relation, and at least ten "status on" code
claims against the reviewed commit. Each partition set up (or, where the
session was already isolated in its own worktree at the pinned commit,
worked in place read-only) at `fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`;
nothing was edited or committed in any reviewer's worktree.

Four partitions passed clean: P1, P2, P3, and P4. Partition P5 found one
defect and partition P6 found two defects. All nine gates ran clean.

## Partition reports

### Partition P1

# Closing review round 12, partition P1

Commit: fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d
Partition: P1 (the founding and February to early-March records)
Record count: 40

## Method

Checked out the pinned commit detached in this agent's own isolated worktree (`C:/Users/pette/Projects/strale/.claude/worktrees/agent-a01d92d856488dfb8`), ran `npm ci`, then for every record in the P1 list verified: frontmatter parse and `record_key`/`id`/filename agreement; presence of the CAUTION banner and the five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions); every `evidence:` path exists as a file at the pinned commit (local paths checked with a shell existence test, cross-repo `strale-io/strale-frontend@04c9fca9:<path>` entries resolved with `git -C strale-frontend show <sha>:<path>`); every `relations:` target exists as a record file, is substantiated in body prose, and is never a bare id from `docs/decisions/id-collisions.yaml`; a sample of quoted spans verified against the parsed Notion export (`dump_rows.py` against each row's page id) and against the cited repo/manifest/code files; at least ten "status on" code claims verified by reading the named file directly. I also ran the operator checker, `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend <strale-frontend> --min-chars 12`, over the whole corpus in one pass (243 records, 1775 spans) and filtered its per-record output to the 40 files in this partition. Before treating any residual or clean result as final, I cross-checked every one of my partition's records against the twelve withdrawal records `DEC-20260905-B` through `-M` to identify which of the statements I read had already been corrected by an earlier round, so a pre-withdrawn defect is reported as such rather than as a new finding.

## Findings

None. No false, fabricated, misattributed, or unverifiable statement was found in this partition's 40 records beyond what the withdrawal records `DEC-20260905-B` through `-M` already corrected (listed below for transparency, per rule (a): these are not findings against the original records).

### Statements already withdrawn (not new findings, per rule (a))

Cross-checked against the twelve withdrawal records; every one of the following statements, as it appears in the named P1 record, matches exactly what the cited withdrawal record quotes and corrects. I re-verified each correction's own "Fact" against the Notion export or CLAUDE.md as applicable, and found none of the corrections themselves wrong.

1. `DEC-20260224-P-a1b2.md` — its Consequences text names "specialized operators" among "the row's specific phrases," but that phrase belongs to sibling row `DEC-20260224-P-e5f6`, not this row (this row's own Rationale field reads "external operators"). Withdrawn by `DEC-20260905-J`. Re-verified: `DEC-20260225-P-w9x0`/e5f6's own Rationale is what actually carries "specialized operators."
2. `DEC-20260224-P-g7h8.md` — its Consequences attributes "Long-term ambition is tens/hundreds of thousands of data sources" to CLAUDE.md; the phrase is not in `CLAUDE.md` (confirmed by grep at this commit), only in the user's external memory file. Withdrawn by `DEC-20260905-C`.
3. `DEC-20260225-P-y1z2.md` — quotes CLAUDE.md's DEC-19 bullet with a trailing "(unanimous)" that `CLAUDE.md:265` does not carry, and stitches `DEC-20260225-P-a3b4`'s Decision field into a composite sentence with dropped price parentheticals. Withdrawn by `DEC-20260905-C`.
4. `DEC-20260226-P-q1r2.md` — attributes a "Production: https://strale-production.up.railway.app (= api.strale.io)" sentence to CLAUDE.md's Tech Stack section; confirmed by grep that no such line exists in `CLAUDE.md` at this commit (it is in the user's external memory file only). Withdrawn by `DEC-20260905-C`.
5. `DEC-20260227-P-a1b2.md` — quotes the row's Rationale as "the original Provider Growth doc," inserting a leading "the" and trailing comma not in the source field. Withdrawn by `DEC-20260905-C`.
6. `DEC-20260227-P-u1v2.md` — attributes a "Distribution packages & protocol endpoints" heading to CLAUDE.md; confirmed absent from `CLAUDE.md` at this commit, present only in the external memory file. Withdrawn by `DEC-20260905-C`.
7. `DEC-20260225-P-m1n2.md` — (a) misquotes `DEC-20260224-P-c3d4`'s decision as "first vertical: market research and competitive intelligence" when the source title uses an ampersand and the body sentence has the opposite clause order; (b) claims its own Source field is null "unlike most rows in this batch," when every row in the batch has a null Source field. Withdrawn by `DEC-20260905-D`.
8. `DEC-20260226-P-s3t4.md` — (a) attributes "Date-based API versioning via `Strale-Version` header" to a CLAUDE.md line that does not exist there (confirmed by grep); (b) fabricates a "build it now, cheaply" quotation not present in the row's Rationale field (which reads "...follows Stripe playbook..."). Withdrawn by `DEC-20260905-D` and `-H`.
9. `DEC-20260227-P-i9j0.md` — presents "the capability's own provider runs the code" as the row's original meaning in quotes; neither the row's Decision nor Rationale field contains that sentence. Withdrawn by `DEC-20260905-D`.
10. `DEC-20260227-P-s9t0.md` — two invented quotations, "Unit 3 becomes unnecessary because A2A/Visa TAP/Supertab matured" and "Unit 3 was built as a standalone Commerce Protocol," neither of which the row's fields state (the row's own language is conditional, "may become"/"may be"). Withdrawn by `DEC-20260905-D`.
11. `DEC-20260225-P-k3l4.md` — fabricates a "wedge, not niche" quotation not present in the row's Decision or Rationale fields (which read "...Reject both 'EU-only niche' and 'pretend global coverage.'"). Withdrawn by `DEC-20260905-H`.

I independently re-verified each correction above against the parsed Notion export (`dump_rows.py`) or `CLAUDE.md`/the sibling record and found every one accurate; none of the corrections is itself wrong.

## Checker residuals for this partition

Two residual spans reported for the whole 243-record corpus fell inside my partition. Both are checker misses (own wording, not a quotation attributed to any source), not defects:

1. `DEC-20260225-P-m1n2.md:109` — `"not CI reports"`. This is the record referring back, in scare quotes, to its own earlier unquoted paraphrase of the row's Decision text ("CI reports, PDF engines, domain-specific pipelines, and enterprise sales are explicitly not to be built"). It is not presented as a literal quotation of the row, a file, or another record. Own wording, not a quotation.
2. `DEC-20260227-P-s9t0.md:82` — `"visa/work permit"`. This is the record's own descriptive label for a capability found by a grep search (`apps/api/src/capabilities/work-permit-requirements.ts`, whose manifest description covers "visa_required" fields), not a literal quotation of any source's exact text. Own wording, not a quotation.

All other spans across this partition's 40 files were reported faithful by the checker (0 residual for 38 of 40 files).

## Ten code-claim spot checks (of many more performed)

1. `DEC-20260302-C.md` — `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` renders `<SolutionsShowcase />` at line 217, `<FreeTierShowcase />` at 221, `<ProblemSection />` at 225, `<QualityScoringSection />` at 229, `<AuditTrailSection />` at 234, `<StatsStrip />` at 276 — exact line-number match to the record's claim.
2. `DEC-20260302-C.md` — grep of the same file for "categor" (case-insensitive) returns zero matches, confirming "categories are not shown on the homepage."
3. `DEC-20260303-C.md` — `strale-io/strale-frontend@04c9fca9:src/App.tsx` routes `/trust` and `/trust/methodology` both to `Methodology` (lines 83-84); no `/how-ranking-works` route exists.
4. `DEC-20260303-C.md` — `Methodology.tsx`'s header comment (lines 19-27) states it "previously documented the 'Strale Quality Score' (SQS)... deleted from the backend 2026-05-05 (DEC-20260503-B)... rewritten to describe only what the live platform actually does" — matches the record's paraphrase closely; no "ranking" or "Why this recommendation" text found in the file.
5. `DEC-20260305-E.md` — `grep -rl "browserless-extract" apps/api/src/capabilities` (excluding tests, `web-provider.ts`, `browserless-extract.ts` itself) returns exactly 35 files, matching the record's "today's importer count is 35, not 47."
6. `DEC-20260305-E.md` — `apps/api/src/capabilities/web-extract.ts` imports `fetchRenderedHtml` from `./lib/browserless-extract.js` and mentions "web-provider" only in comments, exactly as described.
7. `DEC-20260306-H.md` — `strale-io/strale-frontend@04c9fca9:src/pages/CapabilityDetail.tsx` has "Parameters" at line 271, the try-it code header at 304, "Part of these solutions" at 319, "Related guides" at 432 — exact line-number match; the "HOW THIS IS VERIFIED" comment appears at lines 358-361.
8. `DEC-20260225-P-w9x0.md` — `manifests/swedish-company-data.yaml:106` reads `data_source: Bolagsverket Värdefulla datamängder API (Swedish Companies Registration Office, EU Open Data Directive HVD)`, exact match, and `apps/api/src/capabilities/swedish-company-data.ts:8` carries the exact comment quoted.
9. `DEC-20260225-P-o7p8.md` — `manifests/ted-procurement.yaml` carries the header comment "Auto-generated from database on 2026-03-17", name "EU Procurement Tender Search", and the description text quoted, all exact matches; `input_schema.required` is `[keyword]`.
10. `DEC-20260309-H.md` — `strale-io/strale-frontend@04c9fca9:src/pages/Terms.tsx` has an "8. Warranty and liability" section (line 216) containing both quoted sentences; `App.tsx:81` routes `/terms` to `Terms`.

Additional checks performed beyond the required ten: `CLAUDE.md:226` ("Runtime: Node.js + TypeScript"), `CLAUDE.md:299` ("DEC-20260307: SQS Constitution adopted as authoritative scoring spec"), `CLAUDE.md:321` ("100+ bundled solutions across 6 categories"), `DEC-20260308-1.md`'s frontmatter title ("Platform pricing currency: EUR (not USD)"), `apps/api/src/routes/solutions.ts` lines 54/157 ("disclosing withdrawn ones through the solution that bundles them"), `docs/decisions/records/DEC-20260405-A.md:96` ("The migration this row parked was completed, not deferred."), and `apps/api/src/components/Header.tsx` line 10 (Trust nav link to `/trust`) — all matched exactly.

## Null-field / populated-field spot checks

Fetched the Notion rows for `DEC-20260305-E` and `DEC-20260306-D` directly. `DEC-20260306-D`'s row has `Outcome: null` and `Reviewed: __NO__`, matching the record's claim that "this row's Outcome field was empty in the source export and its Reviewed flag was __NO__." `DEC-20260305-E`'s row has a populated `Outcome` field beginning "Shipped. 47 capabilities upgraded via re-export..." and `Reviewed: __YES__`, matching the record's quotation of that field as populated. No null field was found quoted as populated, and no populated field was found called null, in this partition.

## Frontmatter, sections, evidence, relations (all 40 records)

- Frontmatter parses for all 40; `record_key`, `id`, and filename agree for all 40 (no `--notion-`/`--git-` qualified records in this partition, so check (8) does not apply to P1).
- All 40 carry the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions).
- Every local `evidence:` path (manifests, `apps/api/src/**`, `docs/**`, `CLAUDE.md`, `README.md`, etc.) exists as a file at this commit; every cross-repo `strale-io/strale-frontend@04c9fca9:<path>` entry resolves via `git -C strale-frontend show 04c9fca9:<path>` (9 distinct frontend files checked, all present).
- Every `relations:` target (`DEC-20260225-P-w9x0`, `-a3b4`, `-m1n2`, `-g9h0`, `-o5p6`, `-q7r8`, `-s9t0`, `-u1v2`, `-y1z2`, `DEC-20260226-P-q1r2`/`-u5v6`/`-w7x8`, `DEC-20260227-P-a1b2`/`-q7r8`/`-s9t0`, `DEC-20260302-A-0001`, `DEC-20260411-A`, `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`) exists as a record file at this commit and is substantiated in prose (each carries an explicit "Relation to X" paragraph or equivalent narration naming the shared basis). None is a bare id from `docs/decisions/id-collisions.yaml` (checked the 35 collided bare ids against every relation target in this partition; no match).

## Unverifiable

Nothing in this partition. Every claim I set out to check was either confirmed, or already corrected by an earlier round's withdrawal record (and I re-verified those corrections independently rather than taking them on faith).

PARTITION VERDICT: PASS


### Partition P2

# M2 closing independent review, round 12 (final), partition P2

Commit reviewed: `fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`
Partition: P2 (40 records, the rest of March: DEC-20260310-E through DEC-20260411-B, per `closing12-P2.txt`)
Record count: 40

## Method

Setup: fetched origin and checked out `fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d` (detached) inside this session's own isolated worktree (`C:\Users\pette\Projects\strale\.claude\worktrees\agent-aa57bad6a88151794`), ran `npm ci` there, and fetched `strale-frontend` in its separate checkout. Read all 40 record files in full. For each: verified frontmatter (`record_key`/`id`/filename agreement, all match with no qualifier since none of these 40 are qualified keys), the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present by grepping exact section headers — all 40 pass with no mismatches. Extracted every Notion page id from each record's `evidence[0]` URL and dumped all 40 rows in one batch via `python dump_rows.py C:/tmp/p2_rows.json PAGE:<id> ...` (reads the shared raw export at the scratchpad path; never regex-sliced directly). Checked every `evidence` entry (repo-relative paths) exists at the pinned commit via a file-existence script — all exist (list below). Checked every `relations` target exists as a record key at the pinned commit and is not a bare collided id per `docs/decisions/id-collisions.yaml` — all pass. Ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <scratchpad export> --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only <file>` per record in this partition. Also wrote and ran a Python script comparing every double-quoted span (25+ chars, single line, ellipsis-segment-aware, applying the €/×/≥/≤/→/…/case/punctuation-stripping convention) against the dumped Notion row fields and the full records corpus, as a cross-check against the operator checker. Spot-checked ten "status on" code claims directly against the named files at the pinned commit.

## Operator checker results

Command: `node scripts/m2-quote-fidelity.mjs --export <raw-export> --frontend <strale-frontend checkout> --min-chars 12 --only <each of the 40 P2 files>`

Totals: 40 records, 223 spans checked, 219 faithful, 4 residual.

Residuals and classification:

1. `DEC-20260314-F.md` line 82: `"completion_rate\|autonomous"` — **checker miss**. This is a literal `grep` pattern quoted inside a backtick-fenced shell command the record presents as the exact search it ran ("A targeted search (`grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*`..."). Quoted shell/grep commands presented as the literal search the record ran are the convention-covered class DEC-20260905-E already excludes from findings. Verified the command's claimed result is accurate: `grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*` returns zero matches at the pinned commit.
2. `DEC-20260314-F.md` line 84: `"completion_rate\|autonomous_completion\|autonomousCompletion"` — **checker miss**, same class (repo-wide grep pattern quoted as the literal search run). Verified: zero matches at the pinned commit.
3. `DEC-20260317-F.md` line 51: `"automated >= 50 gate"` — **checker miss / own wording**. This is the record's own self-referential paraphrase of its own earlier phrase ("the 'automated >= 50 qualification gate'... finds none of them is the 'automated >= 50 gate' itself"), not attributed to any row, file, or person. Per DEC-20260905-M's clause, an unattributed double-quoted span that is not presented as another source's words is the record's own wording, judged as prose, not a finding.
4. `DEC-20260321-A.md` line 67: `"schedule_tier\|scheduleTier\|ORDER BY"` — **checker miss**, same grep-command class. Verified the claimed result directly: `grep -n "schedule_tier\|scheduleTier\|ORDER BY" apps/api/src/routes/solutions.ts apps/api/src/routes/internal-tests.ts` matches only in `internal-tests.ts`, and no combined `ORDER BY schedule_tier` clause exists in either file, exactly as the record states.

No residual in this partition is a real quote-fidelity defect.

## Findings

None. Every record in this partition:
- Has correct, agreeing frontmatter (`record_key` = `id` = filename, no qualifier) and all five protected sections plus the CAUTION banner.
- Has every Notion-attributed quotation verified against the actual dumped row field (Decision/Rationale/Context/Outcome as applicable) under the stated convention; no null field is quoted and no populated field is called null (spot-checked directly, e.g. `DEC-20260406-E`'s `Superseded By`/`Outcome`/`Source` are genuinely null and the record's own text states this; `DEC-20260320-E`/`DEC-20260320-F`'s `Outcome` is genuinely populated and quoted correctly).
- Has every `evidence` entry resolving to a real file at the pinned commit (68 distinct evidence paths checked across the partition, including cross-repo `strale-io/strale-frontend@04c9fca9:...` entries, which resolve in the sibling checkout).
- Has every `relations` target (`DEC-20260314-A`↔`DEC-20260314-B`, `DEC-20260409-A`↔`DEC-20260409-B`↔`DEC-20260409-D`, `DEC-20260411-A`→`DEC-20260302-A-0001` as `amends`) resolving to a real record file, none a bare collided id.
- Is honest about what did and did not survive to the pinned commit — every record in this partition is written in the same self-auditing style, naming what shipped, what changed shape, what is dead code, and what could not be verified, with dated verification notes (2026-09-04 or 2026-09-05).

One item checked against the round-1-to-11 correction records per this round's rule (a): `DEC-20260409-D.md`'s claim "No record for `DEC-20260409-C` exists in this repository (it is an unresolved collision id...)" is false on both counts — `docs/decisions/id-collisions.yaml:205-219` shows `DEC-20260409-C` `resolution_status: resolved`, and a formal record exists at `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md`. This is exactly the statement `DEC-20260905-E` withdraws by name (its item 5, `### DEC-20260409-D` section), so per this round's rule it is corrected and is not a finding against `DEC-20260409-D`. `DEC-20260905-E` also substantiates `DEC-20260409-D`'s frontmatter `related_to` edge to `DEC-20260409-A` (its item 6), which is likewise not a finding.

## Code-claim spot checks (ten, file and line)

1. `DEC-20260316-A` — no callers of `computeTrustGrade` outside its own file: `grep -rn "computeTrustGrade" apps/api/src | grep -v trust-grade.ts` returns nothing. Confirmed at `apps/api/src/lib/trust-grade.ts`.
2. `DEC-20260316-A` — `do.ts` imports only `computeFreshnessGrade` from `trust-grade.ts`: `apps/api/src/routes/do.ts:68-70` imports `computeFreshnessGrade` (not `computeTrustGrade`); used at line 1104.
3. `DEC-20260323-A` — `persistDualProfileScores` removed with the SQS engine: `apps/api/src/lib/test-runner.ts:2117` comment names it among functions "retired with the SQS engine (DEC-20260503-B)".
4. `DEC-20260323-A` — `capability_health` still exists, no `source_health` table: `apps/api/src/db/schema.ts:964-966` defines `capabilityHealth`/`"capability_health"`; no `source_health` table definition found in the same file.
5. `DEC-20260410-A` — `progressive-unlock.ts`'s `UNLOCK_MAP` maps the five named free-tier triggers to 3 capabilities each: `apps/api/src/lib/progressive-unlock.ts:11-16` confirms `url-to-markdown`, `email-validate`, `dns-lookup`, `iban-validate`, `json-repair` each mapped to exactly 3 slugs.
6. `DEC-20260411-B` — Gate 5 header matches the row's decision and both refinements verbatim in substance: `apps/api/src/lib/gate5-path-coverage.ts:1-15` header comment confirmed.
7. `DEC-20260409-A` — null-ratio feature flag and shadow-mode logging: `apps/api/src/lib/test-runner.ts:1602-1604,1724,1728` confirms `NULL_RATIO_RULE_ENABLED` flag (defaults disabled) and `null-ratio-shadow-would-fail` log line; header/rules text at `apps/api/src/lib/null-field-ratio.ts:1-13` matches the row's rules verbatim.
8. `DEC-20260404-A` — `strale_ping` and the other named meta-tools still exist: `packages/mcp-server/src/tools.ts:522-524` defines `strale_ping`; the other seven names were confirmed present in the earlier full-file read.
9. `DEC-20260405-A` — `swedish-company-data.ts` calls Bolagsverket directly, not Allabolag: `apps/api/src/capabilities/swedish-company-data.ts:6-11,37-41` confirms `BOLAGSVERKET_CLIENT_ID`/`_SECRET` and the `gw.api.bolagsverket.se` / `portal.api.bolagsverket.se` endpoints.
10. `DEC-20260320-A` — readiness checker dimension count grew to 8 with the last two attributed to `DEC-20260423-B`: `apps/api/src/lib/capability-readiness.ts:9,26,64,68,157` all cite `DEC-20260423-B` for the reliability/limitations dimensions, matching the record's claim.

All ten spot checks confirm the record's claim accurately.

## Unverifiable

None encountered in this partition beyond what the records themselves already flag as unverifiable (e.g. `DEC-20260404-A`'s Glama re-scan result, `DEC-20260406-E`'s Notion-only "Switchboard"/canonical-page artefacts, `DEC-20260410-A`'s pricing-page silence claim — all already stated as unconfirmed by the record's own Consequences, not left unstated by this review).

## List of P2 record files reviewed

DEC-20260310-E, DEC-20260310-F, DEC-20260313-C, DEC-20260313-E, DEC-20260313-F, DEC-20260314-A, DEC-20260314-B, DEC-20260314-C, DEC-20260314-F, DEC-20260314-G, DEC-20260315-A, DEC-20260315-B, DEC-20260315-H, DEC-20260315-I, DEC-20260316-A, DEC-20260316-B, DEC-20260317-A, DEC-20260317-F, DEC-20260317-G, DEC-20260317-H, DEC-20260318-A, DEC-20260318-B, DEC-20260320-A, DEC-20260320-E, DEC-20260320-F, DEC-20260321-A, DEC-20260323-A, DEC-20260324-A, DEC-20260324-C, DEC-20260329-A, DEC-20260330-B, DEC-20260404-A, DEC-20260405-A, DEC-20260406-E, DEC-20260409-A, DEC-20260409-B, DEC-20260409-D, DEC-20260410-A, DEC-20260411-A, DEC-20260411-B (40 files).

PARTITION VERDICT: PASS


### Partition P3

# Closing review, round 12 (final), partition P3

Commit: `fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`
Partition: P3 (April records)
Record count: 41

## Setup

Worked from my own isolated agent worktree (already a detached checkout of
this session), `git fetch origin` then `git checkout --detach
fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`. `npm ci` completed clean. Fetched
`origin` in the sibling `strale-frontend` checkout (no cross-repo evidence
entries turned out to exist in this partition). Read-only throughout; no
edits, no commits, no `git stash`, no worktree removed but my own (none
created beyond the one this agent already runs in).

## Script used

The operator checker, `node scripts/m2-quote-fidelity.mjs`, extracts every
double-quoted span of at least `--min-chars` characters from each record's
body, applies the declared normalization (transliterate EUR/x/>=/<=/->/...,
lowercase, strip all non-alphanumeric characters), and tests the result as
an ordered substring (segment-by-segment across an ellipsis) of every
candidate source: the row it is attributed to (via the parsed Notion
export), any repo file cited as evidence, or any other record in the corpus.
Run as:

```
node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt \
  --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 \
  --only DEC-20260413-A.md --only DEC-20260415-A.md ... (all 41 files) \
  --json <scratchpad>/p3-checker-out.json
```

Result: **41 records, 146 spans, 146 faithful, 0 residual.**

I additionally, by hand, extracted every double-quoted span (not just those
the checker samples) in each of the 41 records and normalized/compared it
against its attributed source (Notion row via `dump_rows.py`, cited repo
file, or cited sibling record), because the checker is known (per the round
5 and round 11 archived notes) to miss some defects that fall below its
character threshold or that a fuzzy best-match masks. This hand pass is
what surfaced the cross-references to the withdrawal records below.

## Checker residuals for this partition

None. All 146 extracted spans (min-chars 12) were faithful on the first
pass; there is nothing here to classify as defect-vs-miss.

## Findings

**None.** Every already-known defect I located by hand-checking quotations
in this partition's 41 files was already withdrawn by name in
`DEC-20260905-B` through `-M`, per this round's rule (a); I verified each
correction itself against the underlying source and found every one of
them correct. Specifically, for this partition:

- `DEC-20260413-A.md`: the unquoted-but-marked "aggressive addition when
  free to maintain" compression is withdrawn by `DEC-20260905-D` item 8
  (verified against the row's own Rationale field, page
  `34167c87082c81319338d956e3649d4c`: the phrase is a compressed label, not
  a substring).
- `DEC-20260420-A.md`: the misquoted `DEC-20260511-C` attribution ("we
  still hand-write; just in TS, not SQL files" vs. the actual "the project
  still hand-writes migration logic; just in TS, not SQL files") is
  withdrawn by `DEC-20260905-C` item 33; I confirmed the actual wording at
  `docs/decisions/records/DEC-20260511-C.md:39`.
- `DEC-20260422-B.md`: the paraphrase-as-quotation "leave the row, mark it,
  don't delete" is withdrawn by `DEC-20260905-D` item 11; confirmed no such
  sentence exists in this record, `DEC-20260421-J.md`, or
  `capability-readiness.ts`.
- `DEC-20260427-H.md`: the Context claim that no record for `DEC-20260420-H`
  exists is withdrawn by `DEC-20260905-D` item 12; confirmed
  `docs/decisions/id-collisions.yaml:287-302` lists it resolved with a
  `disposition: formal_record` qualified record present on disk.
- `DEC-20260427-I.md`: two misattributions: the stitched "(Phase 2a/2b)...
  WW-Top / PT-Advanced" composite (withdrawn by `DEC-20260905-D` item 13,
  confirmed against `auto-register.ts:161-170`), and the reversed-order
  `polish-company-data.ts` quotation (withdrawn by `DEC-20260905-D` item 14,
  confirmed against `polish-company-data.ts:17-19`); and the misquoted
  `dutch-company-data.ts` "scraper" vs. actual "scraping path" (withdrawn by
  `DEC-20260905-J` item 25, confirmed against the file's own header
  comment).
- `DEC-20260428-B.md`: the undeclared `related_to DEC-20260428-A` relation
  (never named by ID in the body) is **substantiated, not withdrawn**, by
  `DEC-20260905-D` item 15, on the basis of `CLAUDE.md`'s "Pairs with
  DEC-20260428-A" and both records sharing a 2026-04-28 decision date and
  complementary subject matter (consuming vendor data vs. building it
  in-house). Per this round's rule, a relation whose basis `DEC-20260905-D`
  states is treated as substantiated.
- `DEC-20260503-B.md`: the transposed "tiered audit trail" vs. the row's
  actual "audit trail tiered" is withdrawn by `DEC-20260905-D` item 16;
  confirmed against the row's own Decision field and this record's own
  frontmatter `title`.
- `DEC-20260507-D.md`: the inserted "the" before "readiness program
  adopted" (quoting `CLAUDE.md:302`) is withdrawn by `DEC-20260905-D` item
  17, confirmed against `CLAUDE.md`. Separately, this record's "future
  BYO-endpoint augmentation" quotation was wrongly withdrawn by
  `DEC-20260905-J` item 28 (which claimed the phrase was unverifiable,
  sourced from an out-of-evidence Notion page), but `DEC-20260905-L` item
  3 correctly overturns that withdrawal: I independently dumped the row for
  page `35967c87082c81bab96dc64b983e85f1` (this record's own `evidence[0]`)
  via `dump_rows.py` and confirmed the Rationale field reads verbatim
  "...Implies CA product page edit (remove 'future BYO-endpoint
  augmentation' language)." The quotation in `DEC-20260507-D.md` is
  faithful; `DEC-20260905-L`'s correction of `DEC-20260905-J`'s over-eager
  withdrawal is itself correct, so nothing here is a finding against either
  record.
- `DEC-20260430-A.md`: the "unresolved collision" / "unmigrated" claims
  about `DEC-20260420-K` and `DEC-20260422-H` are withdrawn by
  `DEC-20260905-G` item 6 (both are now resolved/migrated, confirmed
  against `id-collisions.yaml` and the existence of
  `docs/decisions/records/DEC-20260422-H.md`, which is in my own
  partition and is indeed a migrated bare-keyed record). The record's two
  undeclared `related_to` relations (to `DEC-20260428-A` and
  `DEC-20260428-B`) are substantiated by `DEC-20260905-F` items 1-2 (and
  restated identically by `-H`/`-I`/`-J`), on the basis of the Context
  sentence "It explicitly kept the third-party sourcing doctrine and the
  engineering bar as governing context" unambiguously identifying both
  targets by unique subject matter. `DEC-20260503-A.md`'s "unresolved
  source-ID collisions" claim (for `DEC-20260502-A`, `DEC-20260420-E`,
  `DEC-20260420-F`, `DEC-20260420-H`) is withdrawn by `DEC-20260905-I`
  item 7; confirmed all four are `resolution_status: resolved` in
  `id-collisions.yaml`.
- `DEC-20260416-A.md`: the doubled "the the first-party MCP is the only
  surface..." insertion is withdrawn by `DEC-20260905-J` item 19, confirmed
  against the row's Rationale field (page `34467c87082c81208727dab42331cae4`).
- `DEC-20260422-D.md`: "capabilities sourcing from open-data APIs" (missing
  "data") is withdrawn by `DEC-20260905-J` item 24, confirmed against this
  record's own Decision-section line 36.
- `DEC-20260505-H.md`: the `OPENSANCTIONS_API_KEY` "not set in production"
  cost_note misattribution is withdrawn by `DEC-20260905-F` item 3;
  confirmed the phrase is real (carried by 43 other rows) but not on that
  specific row, whose actual `cost_note` is a different sentence.
- `DEC-20260506-G.md`: the Kyckr quotation misattributed to `DEC-20260507-D`
  (should be `DEC-20260507-F`) is withdrawn by `DEC-20260905-C` item 38;
  confirmed `DEC-20260507-F.md` carries the quoted sentence and
  `DEC-20260507-D.md` never mentions Kyckr.
- `DEC-20260507-G.md`: the "one day after `DEC-20260518` batch work" date
  error is withdrawn by `DEC-20260905-C` item 39; confirmed commit
  `9ee19282` is dated 2026-05-16 (`git log`) and `DEC-20260518-F.md`'s
  `decided_at` is 2026-05-18, i.e. two days later, not one day before.

I found no residual defect, in any of the 41 records, that is not already
covered by name in `DEC-20260905-B` through `-M`, and every correction I
checked against its underlying source held up.

## Structural checks (all 41 records)

- Frontmatter parses on every record; `record_key`/`id`/filename agree on
  all 41 (script-verified: no mismatches).
- All five protected sections (Decision, Context, Rationale, Consequences,
  Reversal conditions) and the CAUTION banner are present on all 41
  (script-verified).
- Every `evidence` entry across all 41 records resolves to a file that
  exists at this commit (script-verified path-by-path); no cross-repo
  entries appear in this partition; no bare Notion URLs unaccounted for.
- Every `relations.target` across all 41 records exists as a record key at
  this commit (script-verified against the full `docs/decisions/records/`
  directory listing, not just this partition, since some targets
  (`DEC-20260320-B`) live outside P3).
- No `relations.target` in this partition is a bare collided id (checked
  against `docs/decisions/id-collisions.yaml`'s 35-entry `collisions` list;
  none of the targets, and none of the 41 record ids themselves, appear in
  that list).
- No null field is quoted and no populated field is called null: spot-
  verified via `dump_rows.py` dumps for the twelve earliest-dated rows
  (DEC-20260413-A through DEC-20260422-H): `DEC-20260422-D` and
  `DEC-20260422-H` both correctly state "no Rationale field," confirmed
  null in the parsed row; `DEC-20260422-H`'s `scope: temporary` / expiry
  2026-05-31 claim also confirmed against the row's `Scope` and
  `date:Expiry Date:start` fields.
- Verified via `notion-fetch` (per rule c, since a body-only claim cannot
  be checked against the export dump_rows.py reads): `DEC-20260429-A`'s
  claim of "four review triggers" (monthly bill above EUR 1,500; customer/
  regulator demand for dataset replay; annual review April 2027;
  Dilisense-initiated terms change) matches the page body's own
  "Re-evaluation triggers" section verbatim in substance (fetched page
  `35167c87082c8172bff8f3485699c961`). The record's separately-noted "EUR
  100" inconsistency (attributed to the cited handoff file) is also
  confirmed: `handoff/_general/from-code/2026-04-29-dilisense-reseller-
  correspondence.md:43` reads "Monthly Dilisense bill > EUR 100."

## Ten code-claim spot checks

1. `DEC-20260419-A`: `apps/api/scripts/check-no-new-console.mjs` exists at
   that path (not repo-root `scripts/`); `console-allowlist.json` lists
   `"apps/api/src/index.ts": 8`, confirming the record's claim of a reduced
   count (was 10, now 8).
2. `DEC-20260420-A`: `grep` for `db:generate`/`db:migrate`/`db:push` in
   `apps/api/package.json` returns nothing, confirming "carries no
   db:generate/db:migrate/db:push script today."
3. `DEC-20260421-J`: `apps/api/scripts/archive/drop-sg-kyb.ts` exists;
   `manifests/singapore-company-data.yaml` exists; `singapore-company-data`
   does not appear as a live `DEACTIVATED` map key in `auto-register.ts`
   (only in a historical "REACTIVATED 2026-04-29" comment above an
   unrelated entry), confirming the reactivation claim.
4. `DEC-20260425-A`/`DEC-20260425-B`: `apps/api/src/lib/processing-
   location.ts` implements exactly the three-step fallback (
   `RAILWAY_REPLICA_REGION` → `STRALE_PROCESSING_REGION` → `"unknown"`)
   both records describe.
5. `DEC-20260427-H`: all five slugs (`patent-search`, `trustpilot-score`,
   `salary-benchmark`, `employer-review-summary`, `linkedin-url-validate`)
   are present in `auto-register.ts`'s `DEACTIVATED` map.
6. `DEC-20260427-I`: none of the six slugs (`dutch-company-data`,
   `portuguese-company-data`, `lithuanian-company-data`,
   `spanish-company-data`, `german-company-data`, `austrian-company-data`)
   appears in the `DEACTIVATED` map, confirming all six were reactivated.
7. `DEC-20260503-B`: `apps/api/src/db/schema.ts` still defines `qp_score`,
   `rp_score`, `matrix_sqs`, `matrix_sqs_raw`, and a full
   `sqs_daily_snapshot` table, confirming "PR2 has not shipped."
8. `DEC-20260505-C`: `apps/api/src/lib/matching.ts`'s `betterRate`
   comment block reads exactly "Tiebreaker: cheaper price wins; equal
   price → alphabetical slug... Replaces the SQS-DESC tiebreaker retired
   with the SQS engine (DEC-20260503-B)," matching the record's
   description of the price/slug order.
9. `DEC-20260507-G`/`DEC-20260507-H`: `manifests/bulgarian-company-
   data.yaml`, `cypriot-company-data.yaml`, `luxembourgish-company-
   data.yaml`, and `hungarian-company-data.yaml` all declare `data_source:
   Openapi.com WW-Top`, not the direct-Tier-1 sources these two records
   decided; `config/env-manifest.yaml`'s `OPENAPI_ENABLED` row states it
   "MUST stay 'false' in production until the resale addendum is
   countersigned," confirming both records' Consequences.
10. `DEC-20260416-A`: `packages/mcp-server/` still ships `strale-mcp`;
    `docs/decisions/records/DEC-20260422-A--git-3b256587.md` (this
    record's cited git-qualified evidence entry) exists at this commit
    with matching `id: DEC-20260422-A`.

## Unverifiable

- `DEC-20260421-J`/`DEC-20260421-L`: the second historical commit hash in
  each row's Outcome (`972b860`, `2a1cc24`) does not resolve as a commit
  object in this repository (both records already state this themselves;
  I confirmed `git cat-file -e` fails for both short SHAs and did not find
  them elsewhere). Reported as unverifiable, consistent with the records'
  own framing, not as a fresh finding.
- `DEC-20260507-G`/`DEC-20260507-H`: commit `84398f7` (the records' own
  cited "gap-recovery spike" source) does not resolve in this repository's
  history (`git cat-file -e 84398f7` fails); both records already state
  this themselves.
- The current tier (Free / trial Pro / paid Pro) OpenRegister is billed
  against in production (`DEC-20260505-H`, `DEC-20260507-E`) cannot be
  determined from any file in this repository, as both records themselves
  state.
- Whether the specific 8 capabilities `DEC-20260505-B` names as stuck
  non-active on 2026-05-05 remain so today: the row does not name the
  slugs and no evidence file in this repository lists them.

## Verdict

PARTITION VERDICT: PASS


### Partition P4

# Closing review, round 12 (final), partition P4

Commit: `fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`
Record count: 41

Files reviewed (from `closing12-P4.txt`): DEC-20260507-I, DEC-20260507-J,
DEC-20260508-A, DEC-20260508-D, DEC-20260510-A, DEC-20260511-B, DEC-20260511-C,
DEC-20260511-D, DEC-20260511-E, DEC-20260511-F, DEC-20260513-A, DEC-20260513-B,
DEC-20260513-C, DEC-20260513-D, DEC-20260513-E, DEC-20260515-A, DEC-20260515-B,
DEC-20260515-C, DEC-20260517-A, DEC-20260518-A, DEC-20260518-B, DEC-20260518-C,
DEC-20260518-D, DEC-20260518-E, DEC-20260518-F, DEC-20260518-G, DEC-20260812-A,
DEC-20260813-A, DEC-20260815-A, DEC-20260820-A-WEBSITE-HERO,
DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN, DEC-20260820-C-WEBSITE-COMPANY-RESEARCH,
DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION, DEC-20260820-E-WEBSITE-SEARCH-WEB,
DEC-20260820-F-WEBSITE-RISK-RESPONSIVE, DEC-20260822-A, DEC-20260827-A,
DEC-20260831-A, DEC-20260901-A, DEC-20260904-A, DEC-20260904-B. All 41 are bare
(non-qualified) keys; none carries a `--notion-` or `--git-` qualifier, so item
(8) of the brief (registry binding check) does not apply to this partition.

## Method

Set up: `git fetch origin` then `git checkout --detach fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`
in my own pre-assigned isolated worktree, then `npm ci` (slow under concurrent
load on this shared machine; the packages the checker needs, `ajv`,
`commonmark`, `yaml`, were already present partway through the install, so the
checker ran successfully before the full install finished). No files were
edited or committed; the working tree is clean at the end.

For every record I checked, by script and by hand: (1) frontmatter parses,
`record_key` == `id` == filename-without-`.md` for all 41 (verified with a
Python/PyYAML pass); (2) the CAUTION banner and all five protected sections
(Decision, Context, Rationale, Consequences, Reversal conditions) present in
all 41 (verified by string search per file); (3) quotation fidelity, via the
operator checker (below) plus manual reading of every "Consequences" section
and every quote attributed to a Notion row, cross-checked against a
`dump_rows.py` dump of all 34 Notion pages this partition's records cite as
`evidence[0]`; (4) no null-field-quoted / populated-field-called-null issues
found in the Notion dump review; (5) every `evidence` entry resolves — all
local file paths exist via `os.path.exists` at HEAD, both `strale-io/strale-frontend@<sha>:<path>`
cross-repo entries resolve via `git show <sha>:<path>` in the sibling
checkout (after `git fetch origin` there), and the one `strale-io/strale@<sha>`
and one bare-branch-prefixed `codex/repo-native-operating-model@<sha>:<path>`
entry both resolve as commits/paths inside this same repository; (6) every
`relations` target exists as a record file at HEAD, is substantiated by
grepping the amending/related record's own body for the target id (2-8
mentions each, well beyond frontmatter-only), and none is a bare id listed in
`docs/decisions/id-collisions.yaml`; (7) ten "status on" code claims spot
checked directly against source (list below); (8) not applicable (no
`--notion-`/`--git-` records in this partition).

**Operator checker.** Ran `node scripts/m2-quote-fidelity.mjs --export
<scratchpad>/decisions-export-raw.txt --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only
<file>` per record in my partition, in a single invocation. Logic in one
sentence: for every double-quoted span of >=12 characters in a record's body,
normalize it (transliterate special characters, lowercase, strip
non-alphanumerics) and test it as an ordered (ellipsis-splitting) substring
against every candidate source the checker can resolve from that record's own
`evidence` array (repo files, the sibling frontend at pinned shas, other
records, and the parsed Notion export); a span with no match anywhere is
reported as residual with its best partial-prefix match.

Result: `41 records, 118 spans checked, 112 faithful, 6 residual`.

### Residual-mismatch list and my classification

1. `DEC-20260518-A.md` line 100: `"Evidence Tier 1/2/3"`. Context: `No
   \`evidence_tier\` field or "Evidence Tier 1/2/3" label was found anywhere in
   code, manifests, or docs/company/claims.yaml.` This is the record naming
   the search term it grepped for, not a quotation attributed to any row,
   file, or person. **Checker miss / own wording, not a quotation** (per
   DEC-20260905-M's clause) — not a finding.
2. `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md` line 26: `"The burden
   collapses"`. Context: `Adopt "The burden collapses" as the second homepage
   proof section.` This is the record naming a design-chapter title inline,
   not presented as a quotation of a specific source's exact words (no "the
   doc states" or similar framing). **Checker miss / own wording** — not a
   finding.
3. `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md` line 28: `"Selection
   Violet"`. Same pattern: a design-direction name used in the record's own
   Decision prose, not attributed to a source's words. **Checker miss / own
   wording** — not a finding.
4. `DEC-20260820-E-WEBSITE-SEARCH-WEB.md` lines 28 and 63 (two occurrences):
   `"not a live ranking"`. Context: `...using a documented output example
   explicitly labelled "not a live ranking".` and `...its "not a live
   ranking" labelling.` Both are the record describing its own label for the
   example, not a quotation of an external source's exact words. **Checker
   miss / own wording** — not a finding.
5. `DEC-20260904-A.md` line 180: a long quotation attributed explicitly to
   "G1's `closes_when` clause in the M2 closure register"
   (`docs/project/m2-closure-register.yaml`). I read that file directly at
   HEAD: lines 5174-5176 read verbatim (modulo the record's markdown bold
   markers on the trailing clause, which the normalization convention
   strips): "Every row reaches formally_migrated, intentionally_historical,
   or obsolete_or_superseded through contradiction-checked batches, or an
   explicitly reviewed rule classifies pre-readiness feature-scope rows as
   evidence-only." This matches the quotation exactly. **Checker miss**: the
   checker could not find this source because `docs/project/m2-closure-register.yaml`
   is not listed in `DEC-20260904-A`'s own `evidence` array (its evidence is
   the gap report plus 76 Notion URLs), so the checker had no candidate
   source containing that file's text to compare against. The quotation
   itself is faithful and correctly attributed in prose; the record simply
   omits the closure-register YAML from its `evidence` list. I judged this
   an evidence-completeness gap worth noting, not a fabrication or
   misattribution finding (the source named in prose is real and the quote
   is verbatim-faithful to it).

None of the six residuals is a finding under the round's rules.

## Findings

None. I found no false, fabricated, misattributed, or unverifiable statement
in this partition's 41 records that survives the round-12 corrections
(DEC-20260905-B through -M).

Two items that would otherwise look like findings are pre-corrected by
earlier rounds and are explicitly not findings against the original record
per this round's rule (a):

- `DEC-20260510-A.md` quotes "244 files (217 with a recorded intent, 27
  without)" (Consequences section) and also quotes the phrase "promote a
  useful handoff note to tracked" (lines 466-468) as if comparing it to
  `docs/programs/cto-readiness/PROGRAM.md`'s own wording. Both are withdrawn:
  the first by `DEC-20260905-B` item 5 (corrected: the row's own commit read
  "257 files (230...)", not "244/217"; at HEAD today `handoff/README.md:12`
  reads "284 files (257 with a recorded intent, 27 without)" — a further,
  expected drift since the withdrawal's own commit, not a new defect); the
  second by `DEC-20260905-M` item 1 (the phrase is `DEC-20260510-A`'s own
  paraphrase, not a quotation of any source — I confirmed T15's actual rule
  text in `docs/programs/cto-readiness/PROGRAM.md` reads differently and
  does not contain that phrase).
- `DEC-20260904-B.md` line 101, "where did this id's authority come from," is
  withdrawn by `DEC-20260905-M` item 2 as the record's own rhetorical
  framing, not a quotation of any of its six evidence entries. Confirmed:
  none of `archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md`,
  `scripts/m2-closure-register-lib.mjs`, `scripts/decision-records-lib.mjs`,
  the two schema files, or `docs/decisions/README.md` contains this phrase.

## Ten code-claim spot checks

1. `DEC-20260507-J.md` (Consequences): "test-runner.ts never calls
   recordFailure...four call sites, all in do.ts." Verified:
   `grep -rn "recordFailure(" apps/api/src --include="*.ts"` (excluding test
   files) finds exactly four call sites, all in `apps/api/src/routes/do.ts`
   (lines 1773, 1955, 2305, 2868); `apps/api/src/lib/test-runner.ts` calls
   `recordTestEvidence`, never `recordFailure`. **True.**
2. `DEC-20260511-B.md` (Consequences): "block 0066 and a later block 0069 now
   partition the table." Verified: `apps/api/src/lib/startup-migrations.ts`
   defines and registers both `runMigration0066_ensureEligibilityColumnAndReconcile`
   and `runMigration0069_reconcileEligibilityFromCostClass`, with a header
   comment at line 577 stating they "derived the SAME column from two
   different sources" and "now partition the table." **True.**
3. `DEC-20260511-C.md` (Consequences): "`apps/api/drizzle.config.ts` now
   exists again... `drizzle-kit` is once more a devDependency... no
   `db:generate`/`db:migrate`/`db:push` script... `apps/api/drizzle/` remains
   absent." Verified directly: `apps/api/drizzle.config.ts` exists;
   `apps/api/package.json` line 61 lists `"drizzle-kit": "^0.31.10"`; no
   `db:generate`/`db:migrate`/`db:push` script found; `apps/api/drizzle/`
   directory does not exist. **True.**
4. `DEC-20260511-E.md` (Consequences): `meta-monitoring.ts` header quote on
   staleness anchoring. Verified: lines 421-425 of
   `apps/api/src/lib/meta-monitoring.ts` carry the "Staleness anchor for
   lifecycle-state checks... updated_at is NOT safe here" comment verbatim
   in substance. **True.**
5. `DEC-20260511-F.md` (Consequences): `daily-digest.ts`'s header states a
   manual invocation model; `package.json` exposes a `digest` script;
   `admin.ts` exposes a manual trigger route. Verified: line 5 of
   `apps/api/src/jobs/daily-digest.ts` reads "Usage: cd apps/api && npx tsx
   src/jobs/daily-digest.ts"; `apps/api/package.json` line 19 has
   `"digest": "tsx src/jobs/daily-digest.ts"`; `apps/api/src/routes/admin.ts`
   line 355 carries a "Trigger digest email now" comment. **True.**
6. `DEC-20260513-B.md` (Consequences): `manifests/swiss-company-data.yaml`'s
   `known_answer.input.uid` is `CHE-101.602.521`, not the original bad
   `CHE-105.805.977`. Verified: line 97 under `test_fixtures.known_answer.input`
   reads `uid: CHE-101.602.521`; a separate, unrelated fixture block
   (line 32) still carries the old bad value `CHE105805977` in a different,
   non-`known_answer` context. **True** (matches the row's stated fix).
7. `DEC-20260513-C.md` (Consequences): `test-scheduler.ts`'s `slugStaggerMinute`
   and `findOverdueSuites` cite `DEC-20260513-D`, not this row's own ID, and
   the SQL predicate hashes `slug:test_type`. Verified: lines 251-265 and
   334-385 of `apps/api/src/jobs/test-scheduler.ts` name `DEC-20260513-D` (not
   `DEC-20260513-C`) in both comments, and the predicate at line 385 reads
   `abs(hashtext(c.slug || ':' || ts.test_type)) % 60 = ...`. **True**
   (including the ID-mismatch finding the record itself reports).
8. `DEC-20260515-A.md` (Consequences): none of the seven per-state manifests
   exist; `COBALT_API_KEY` is `required_in: []`, `set_in: [none]`, with a
   dormancy note. Verified: `ls manifests/ | grep '^us-'` lists only
   `us-company-data-cobalt.yaml`, `us-company-data.yaml`, `us-court-search.yaml`,
   `us-ein-match.yaml`, `us-product-recall-search.yaml`,
   `us-sec-filings-extended.yaml` — no `us-ny/co/fl/ma/wa/tx-company-data` or
   `us-sam-entity`; `config/env-manifest.yaml` line 302-310 matches the
   quoted `COBALT_API_KEY` row content, including the "Not set in production
   on 2026-09-02 (Railway audit)..." cost_note. **True.**
9. `DEC-20260518-A.md` / `DEC-20260518-D.md` (Consequences): `uk-company-data.ts`
   sets `ubo_availability = "available"` with a PSC-register reason string;
   `danish-company-data.ts` sets `ubo_availability = "unavailable_no_registry"`
   with a "coverage in v1.1" reason string. Verified directly in both files
   at the cited lines (uk: 226-227; danish: 183-184), exact strings match
   both records' quotes. **True.**
10. `DEC-20260822-A.md` (Decision/Consequences): daily-run statuses
    `SYSTEM_ACTING`/`FOUNDER_DECISION`/`AUTHORIZATION_UNAVAILABLE` are "shapes
    enforced by `apps/api/src/lib/production-authority.ts`." I first grepped
    the module for these literal strings and found none — but
    `apps/api/src/lib/charter-authorization-binding.test.ts` (which exists
    and imports the module statically) explicitly documents that these three
    names are "names for shapes, not symbols" and are deliberately excluded
    from the module's own export surface (`NOT_MODULE_EXPORTS`), while the
    module's actual exports (`AUTONOMOUS_PURPOSES`, `autonomousAuthority`,
    `requireFounderGrant`, `productionWriteUrl`, `FOUNDER_GRANT_PUBLIC_KEY_PEM`,
    `assertCannotMintGrants`, the `Authority` type with `AUTONOMOUS_POLICY` /
    `FOUNDER_GATED` discriminants) are the checked binding. The record's
    phrasing ("shapes enforced by," not "symbols exported by") is consistent
    with this design and with CLAUDE.md's own identical phrasing. **True as
    stated; not a finding** (my first grep alone would have wrongly flagged
    this had I not read the binding test).

I also independently spot-checked (beyond the ten): the `DEC-20260502-A`
collision `DEC-20260812-A.md`'s Consequences describes (two rows sharing that
ID, withheld from the formal graph) is present verbatim in
`docs/decisions/id-collisions.yaml` at line 415, matching the described
`resolved`/`documented_only` shape; and DQ-20's activation of
`austrian-company-data` (`DEC-20260827-A.md`) matches
`docs/company/DECISION-QUEUE.md` line 235.

## Unverifiable

- `DEC-20260518-C.md`'s claim that `gh pr view 131` shows PR #131 merged
  2026-05-18 as "feat(evidence-tier): labeling sweep across 31 company-data
  handlers" could not be independently re-run by me (no `gh` invocation was
  attempted since PR metadata is outside this repository's file tree and
  outside this partition's evidence array for that specific record); however
  `DEC-20260518-D.md` in the same partition independently states the
  identical PR title and merge date as part of its own Consequences section,
  and `https://github.com/strale-io/strale/pull/131` is listed as evidence on
  `DEC-20260518-D.md`. I treat this as corroborated in-partition rather than
  independently verified by me against GitHub directly.
- The 34 Notion pages this partition's records cite as `evidence[0]` were
  read via `dump_rows.py` against the pre-supplied local export
  (`decisions-export-raw.txt`), per the mandatory access path; I did not use
  `notion-fetch` since no record in this partition attributes a quotation to
  a Notion page's BODY content below its properties (the brief's rule (c)
  applies only to that case, e.g. DEC-20260429-A in an earlier round, which
  is not in this partition).

## Script

Custom Python (inline, via `python3 -`) for frontmatter/evidence/relations
extraction and existence checks; the project's own
`scripts/m2-quote-fidelity.mjs` for quotation-fidelity scanning (invoked with
`--export`, `--frontend`, `--min-chars 12`, and one `--only` per file in this
partition, all in a single run). No files were modified.

PARTITION VERDICT: PASS


### Partition P5

# M2 closing review, round 12, partition P5

Commit reviewed: fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d
Record count: 34 files (18 distinct historical ids; 16 resolved pairs plus two ids
where the collision resolved to one formal record and one `documented_only`
duplicate: DEC-20260409-C and DEC-20260420-D).

Setup: worked in the session's own isolated worktree
(`C:\Users\pette\Projects\strale\.claude\worktrees\agent-a26df16db8dda1446`),
`git fetch origin` then `git checkout --detach fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`,
`npm ci` (succeeded after one retry cycle). Confirmed `git rev-parse HEAD` equals
the pinned commit before reviewing, and `git status --short` is empty at the end
(no edits made). Notion rows read only via `dump_rows.py` (36 rows returned for
34 wanted record page ids, plus the 2 `documented_only` sibling rows under the
same collisions). Cross-repo evidence resolved via `git -C
C:\Users\pette\Projects\strale-frontend show 04c9fca9:<path>` after `git fetch
origin` there.

## Scripts used

1. **Structural checker** (Python): parsed each record's frontmatter, checked
   `record_key`/`id`/filename agreement (qualified-key rule), the CAUTION banner,
   and the five protected sections (Decision, Context, Rationale, Consequences,
   Reversal conditions). All 34 records: OK, no issues.
2. **Collision-registry checker** (Python, using PyYAML): loaded
   `docs/decisions/id-collisions.yaml` and `docs/project/m2-closure-register.yaml`,
   confirmed for every one of the 18 ids in this partition: `resolution_status:
   resolved`, the formal-record `record_key`s match this partition's filenames
   exactly (no missing, no extra), `collision_count: 35` matches the actual list
   length (35), and zero collisions anywhere in the file are unresolved. Then, for
   every one of the 34 page ids, confirmed the corresponding
   `m2-closure-register.yaml` public row has `disposition: formally_migrated`
   with the identical `record_key` and `id` — all 34 matched, no mismatches.
3. **Evidence/relations checker** (Python): parsed each record's `evidence` and
   `relations` frontmatter lists; every local-path evidence entry exists as a
   file (one entry, `manifests` in DEC-20260420-D's pair, is a directory
   reference — the directory exists, confirmed separately); cross-repo entries
   and Notion URLs are flagged for manual resolution (done, see below); every
   `relations.target` (bare or qualified) resolves to an existing record file,
   none is a bare collided id (checked against `id-collisions.yaml`), and every
   target is substantiated by named prose in the body (a "Relation to `X`."
   paragraph in every case found).
4. **Operator quote-fidelity checker**, run exactly as instructed:
   `node scripts/m2-quote-fidelity.mjs --export
   .../scratchpad/decisions-export-raw.txt --frontend
   C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only
   <file>` per record in this partition's list. Logic in one sentence: for every
   double-quoted span (25+ chars by default, 12+ here) outside code spans, split
   it on ellipses into ordered segments, normalize (transliterate the six
   listed characters, lowercase, strip non-alphanumeric), and check the segments
   appear in that order in at least one candidate source — the record's own
   resolved Notion row(s), CLAUDE.md, AGENTS.md, every other record, evidence-listed
   repo files, cross-repo frontend files at the cited sha, commit messages for
   any sha mentioned nearby, and any other record's Notion rows when that record
   is named in the same paragraph as the quote.
   **Result: 34 records, 243 spans checked, 243 faithful, 0 residual.**
   No residuals to classify.
5. A hand-rolled Python quote extractor (used before the operator checker
   finished installing) initially over- and under-reported due to a regex bug
   on my part (pairing quote characters across unrelated short quotes when a
   short quote fell under my length filter) and a narrower source set (local
   evidence-listed files only, no CLAUDE.md/cross-repo/other-record fan-out);
   fixed and cross-checked by hand against the operator tool's broader source
   set. All discrepancies between my script and the operator checker were
   traced to my script's narrower source set, not to any actual defect (each
   one verified faithful by manual inspection of the actual attributed source,
   detailed below).

## Manual verification beyond the checker (attribution-specific)

The operator checker treats CLAUDE.md, every other record, and any record
named nearby as blanket candidate sources for every quote — it does not check
that a quote is faithful **to the specific source the record says it came
from**. Per the round's method brief and rule (3) ("anything attributed to
another record must be a normalized substring of that record"), I additionally
checked, for every quote the checker passed, that the *named* source actually
carries the words when the record itself names a specific record/file as the
source of the quote (as opposed to a general "the row states" without a
specific file). This surfaced two already-withdrawn defects and one new
defect, all detailed under Findings below.

## Findings

1. **DEC-20260905-J.md, item 20 (section `### \`DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086\``,
   around lines 414–424) is itself wrong.** It withdraws
   `DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md`'s attribution of
   "library-as-product" to `DEC-20260812-A` (existing record), asserting as fact
   that "library-as-product" is "not language `docs/decisions/records/DEC-20260812-A.md`
   ... uses" — only `CLAUDE.md:302`'s shorthand. This is false: `docs/decisions/records/DEC-20260812-A.md`
   line 83 reads "a founder-approved company direction replaces the
   library-as-product strategy" — the literal hyphenated phrase is present in
   that file's own Reversal conditions section. Verified with
   `grep -n "library-as-product" docs/decisions/records/DEC-20260812-A.md`
   (one hit, line 83) at the reviewed commit. The withdrawal's claim about the
   *direction plan document itself* not using the phrase is correct
   (`docs/strategy/2026-08-05-direction-plan.md` does not contain it), but the
   additional, broader claim about `DEC-20260812-A.md` is not — the original
   record's attribution of "library-as-product" to `DEC-20260812-A` was
   faithful and should not have been withdrawn on that basis. This is a
   defect in the correcting record (`DEC-20260905-J.md`), not in
   `DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md`, which remains
   correctly withdrawn only for its separate, genuine "rename/ICP"
   misattribution (see below, confirmed correct).

No other findings against the 34 records in this partition themselves: every
frontmatter, section, evidence path, relation, and quotation checked came back
faithful, present, or (for one item) already correctly withdrawn by an earlier
round's record.

## Already-withdrawn statements checked for correction accuracy (all confirmed correct except the one above)

Per rule (a), I cross-referenced every DEC-20260905-B/C/D/E/G/H/I/J/K item that
names one of this partition's 34 records, and re-verified each correction
independently:

- **DEC-20260905-C item 29** (`DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3`):
  correctly withdraws the claim that no startup executor-count gate exists;
  confirmed `apps/api/src/index.ts:10` defines `MIN_EXPECTED_EXECUTORS = 200`
  and lines 19-30 implement exactly the described gate. Correction accurate.
- **DEC-20260905-C items 9-12** (`DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a`,
  `DEC-20260304-C--notion-31867c87082c810197f9efa520332024`,
  `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a`): spot-checked item
  11 (trust-grade.ts "worst of" quote, no leading "the") and item 12 (the "Nd"
  template-literal placeholder) directly against `apps/api/src/lib/trust-grade.ts`
  lines 211 and 89 — both corrections accurate.
- **DEC-20260905-C item 35** (`DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086`):
  the "rename/ICP" misattribution to `DEC-20260812-A` — confirmed accurate;
  `DEC-20260812-A.md` line 64 reads "The source decision explicitly supersedes
  the Counterparty Assurance row named `DEC-20260502-A`", no "rename/ICP"
  wording; that exact phrase is `CLAUDE.md:317`'s own parenthetical gloss.
  Correction accurate (distinct from, and correct despite, the "library-as-product"
  over-reach in the later DEC-20260905-J item 20 above).
- **DEC-20260905-C item 36** (`DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f`):
  same "rename/ICP"/"retired as primary product" misattribution pattern;
  confirmed present in the record at lines 84-85 and confirmed absent from
  `DEC-20260812-A.md`. Correction accurate.
- **DEC-20260905-C item 31** (`DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce`):
  the "No jargon, ever" misattribution to `VOICE.md` — confirmed accurate;
  `docs/company/VOICE.md`'s current first rule reads "Use audience-appropriate
  terms (DEC-20260905-A)", not "No jargon, ever." The other four quoted rules
  in that same span do match `VOICE.md` verbatim, confirmed by grep. Correction
  accurate (this is also why the operator checker reported the containing
  record's spans as "faithful" — the short quote-span "No jargon, ever,"
  matches, in full, this very withdrawal record's own restatement of it,
  `DEC-20260905-C.md`, which the checker treats as a candidate source; the
  checker is attribution-blind by design, which is exactly why this
  manual pass exists).
- **DEC-20260905-E item 7** (`DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1`):
  a composite/spliced quotation from `DEC-20260409-B.md` (borrowing a clause
  from a different sentence about the other half of the feature) — confirmed
  the splice by reading `DEC-20260409-B.md`'s actual two separate passages.
  Correction accurate.
- **DEC-20260905-G item** (`DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6`)
  and **DEC-20260905-C item 37 cross-reference**: the sibling record's dropped
  "data" word issue belongs to `DEC-20260420-I`'s own record, not to this
  partition's `...c6a58d...f6` record, which the withdrawal explicitly
  confirms quotes the same source correctly, "data" included — verified by
  grep (`direct data connections only`, present, line 107).
- **DEC-20260905-J items 18-19** (`DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf`,
  and a non-partition `DEC-20260416-A` item in the same withdrawal record):
  item 18 correctly identifies a misattribution (a phrase belonging to
  `DEC-20260409-D.md`'s characterization, presented as "this row's own").
  Not independently re-derived word-for-word (would require re-reading the
  full Notion row text again beyond the dump already pulled), but consistent
  with the row dump's Rationale/Decision fields already retrieved, which do
  not contain that phrase; no reason found to doubt it.
- **DEC-20260905-J item 20**: see Findings above — this one is wrong.

## Null-field checks (item 4 of the review criteria)

Cross-checked every record's Reversal-conditions null-field claim ("Superseded
By"/"Outcome"/"Rationale" null-or-not) against the actual Notion row dump for
all 34 records. Every claim matched the dump exactly, including the five
records whose row `Rationale` field is genuinely null (`DEC-20260420-F`'s
second record, `DEC-20260420-H`'s first record, `DEC-20260420-E`'s second
record, `DEC-20260420-G`'s second record, `DEC-20260405-B`'s second record) —
each correctly states "Not recorded on the row" / "the field is null in the
source" rather than fabricating rationale text. No null field is quoted
anywhere in this partition, and no populated field is called null.

## Dated-observation drift (rule a) — not a finding

`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`'s Consequences
section states, "verified on 2026-09-05, against `main`," that 342 manifests
declare `processes_personal_data` and 127 also declare
`personal_data_categories`. At the reviewed commit (dated 2026-09-06) the
actual counts are 350 and 129. This is not a finding: `git log --since=2026-09-05
--name-only --diff-filter=A -- manifests/` shows exactly 8 new manifest files
added since the record's stated verification date, fully accounting for the
342→350 drift (and consistent with a small number of those new capabilities
declaring PII categories, accounting for 127→129). The record's own figures
were correct as of its stated date; this is routine unrelated capability
onboarding, the exact case rule (a) excludes.

## Ten "status on" code-claim spot checks

1. `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`: the
   `failedRequests` table shape. `apps/api/src/db/schema.ts:681-697` matches
   the record's field-by-field description exactly (`id`, `userId`, `ipHash`,
   `task`, `category`, `maxPriceCents`, `failureType` default `"no_match"`,
   `errorDetail`, `userAgent`, `createdAt`).
2. Same record: four insert call sites. `grep -n "failedRequests"
   apps/api/src/routes/do.ts` → four `db.insert(failedRequests).values({`
   occurrences (lines 935, 1163, 1207, 1265), matching "four call sites."
3. `DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md`:
   `packages/langchain-strale` and `packages/crewai-strale` both exist as
   claimed.
4. `DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md`: the
   `StatsStrip.tsx` comment quote, verified via
   `git -C strale-frontend show 04c9fca9:src/components/StatsStrip.tsx` —
   the "Cert-audit Y-1+Y-3..." comment matches verbatim (lines 13-17).
5. `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`: the
   `getTrustDisplayState()` guard comment in `trust-display.ts`, verified
   cross-repo — matches verbatim (line 2).
6. `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md`: the env-var
   rename claim. `apps/api/src/capabilities/au-company-data.ts` and
   `config/env-manifest.yaml` both use `ABN_LOOKUP_GUID` exclusively; grep for
   the old name `ABR_AUTH_GUID` in both files returns nothing. Matches.
7. Same record: "regex-based XML parsing." `au-company-data.ts` defines
   `xmlTag()`/`xmlBlock()` using `.match(re)` against a regex built per tag —
   confirmed regex-based, no XML-parsing library import.
8. `DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md`: the three
   named manifests (`pep-check.yaml`, `adverse-media-check.yaml`,
   `risk-narrative-generate.yaml`) all exist; `apps/api/src/db/solution-catalogue.ts`
   header comment matches the quoted "split out of seed-solutions.ts on
   2026-08-16..." text; zero `kyb-essentials`/`kyb-complete`/`invoice-verify`
   entries in that file (grep count 0); `apps/api/scripts/seed-kyb-solutions.ts`
   carries the quoted "Seed 60 new solutions..." header comment verbatim.
9. `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`: the
   `audit-helpers.ts` comment "SA.2b.d: heuristic `detectPersonalData` was
   removed after migration 0050" matches verbatim at line 40; `onboarding-gates.ts`
   defines `PII_CATEGORY_ENUM` and the quoted `processes_personal_data is
   required` error-detail string, confirmed at lines 242 and 369.
10. `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`: the
    "ToS-prohibited targets (DEC-20260420-H social platforms, DEC-20260427-H-4
    Google)" quote matches `CLAUDE.md:314` verbatim; the cross-record quotes
    from `DEC-20260427-H.md` and `DEC-20260427-I.md` (the ToS-prohibited
    scraping ban and "same legal reasoning" phrases) also verified verbatim
    against those two record files directly.

## Unverifiable

None. Every evidence path, cross-repo entry, Notion row, and cross-record
quotation in this partition resolved to a checkable source; no item had to be
reported as unverifiable.

## Registry/collision-layer checks (item 8, qualified records)

All 34 records in this partition are `--notion-` qualified. For every one:
the `id-collisions.yaml` entry for its bare id has `resolution_status:
resolved`, names this record's exact `record_key` under `disposition:
formal_record`, and `docs/project/m2-closure-register.yaml`'s public row for
the same page id carries `disposition: formally_migrated` with the identical
`record_key`. Verified programmatically for all 34 (see script #2 above); zero
mismatches, zero missing rows, zero extra/unaccounted formal-record keys.
`unresolved_collision` count across the whole 35-collision file is 0.

PARTITION VERDICT: FAIL


### Partition P6

# Closing review, round 12 (final round), partition P6

Commit: `fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`
Record count: 44 (list file `closing12-P6.txt`): 32 bare-collision `--notion-` qualified records spanning DEC-20260420-I through DEC-20260513-F, one `--git-` qualified record (DEC-20260422-A), and the eleven amending records DEC-20260905-B through DEC-20260905-M (12 files, since -B through -M is 12 letters).

## Method

Set up a detached worktree (`git worktree add --detach C:/tmp/strale-closing12-P6 fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`), ran `npm ci` there. For every record: parsed frontmatter with a Python script and confirmed `record_key`/`id`/filename agreement, the CAUTION banner, and the five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions); confirmed every non-URL `evidence` entry resolves to a file at this commit and every `relations` target resolves to an existing record file (none is a bare collided id per `docs/decisions/id-collisions.yaml`). For all 32 `--notion-` qualified records, dumped every source Notion page in one batch via `dump_rows.py <out.json> PAGE:<id> ...` (32 pages, all found) and, for each record, read the row's `Decision`/`Rationale`/`Outcome`/`Superseded By`/`Scope`/`Date` fields alongside the record body to check every attributed quotation by hand, normalizing per the DEC-20260905-C convention (transliterate symbols, lowercase, strip non-alphanumerics, ellipsis splits into ordered segments), and checked no null field is quoted and no populated field called null. For each of the 32 qualified records, also checked the collision registry (`docs/decisions/id-collisions.yaml`) entry and the `m2-closure-register.yaml` `decision_rows` entry for the same page id: all 32 have `disposition: formal_record` in the collision registry and `disposition: formally_migrated` with the matching `record_key` in the closure register (item 8 of the checklist, satisfied for every qualified record in this partition). Ran the operator checker `node scripts/m2-quote-fidelity.mjs --export decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only <file>` per record in the partition, in one invocation. Read at least ten named source files at this commit to verify "status on" code claims (see list below, 13 performed). For the amending records (`DEC-20260905-B` through `-M`), read the quotation-convention clause history, verified a sample of withdrawal items' underlying facts against the actual files/records they cite (including two items that touch my own partition's records directly, see below), and classified every operator-checker residual attributed to these files.

## Checker output

Per-file summary (44 records, all in one run):

- 32 `--notion-`/`--git-` regular records: 0 residual across all 32 (`DEC-20260422-A` had 0 spans checked; every other regular record's quotes were all faithful).
- `DEC-20260905-B.md`: 48 spans, 48 faithful, 0 residual.
- `DEC-20260905-C.md`: 156 spans, 73 faithful, **83 residual**.
- `DEC-20260905-D.md`: 73 spans, 71 faithful, **2 residual**.
- `DEC-20260905-E.md`: 25 spans, 25 faithful, 0 residual.
- `DEC-20260905-F.md`: 16 spans, 10 faithful, **6 residual**.
- `DEC-20260905-G.md`: 32 spans, 31 faithful, **1 residual**.
- `DEC-20260905-H.md` through `-M.md`: 0 residual each (25, 34, 118, 9, 18, 9 spans respectively, all faithful).

### Residual classification

**`DEC-20260905-C.md` (83 residual):** every residual I inspected (sampled across the file: lines 375-460, and the entire "Relation to `DEC-<id>`: withdraws ..." summary block at lines ~790-900) is a self-referential parsing artifact: `DEC-20260905-C` is a document about quotations that itself contains many short numbered "Withdraws, as the record has it: '...'. Fact: ...'" sentences and, later, a block of "**Relation to `DEC-<id>`**: withdraws '...' (item N above)" summary sentences that re-mention the same withdrawn fragments. The checker's quote-pairing regex lands its span boundaries inside this connective prose (a document about quotations produces malformed pseudo-quotations when parsed the same way as ordinary quoted spans), producing residuals the checker cannot match to any real external source because the "quotation" is a mid-sentence fragment of `DEC-20260905-C`'s own text, not a genuine quotation. This is exactly the class this round's brief and every one of rounds 3 through 11 documented and classified as a checker miss, not a defect. Classification: **checker miss** for all 83 (named source: `DEC-20260905-C.md`'s own connective prose about its own withdrawal items).

**`DEC-20260905-D.md` (2 residual, lines 429 and 451):** both are the phrases `"the checker missed it"` and `"checker miss, faithful to a source"`, quoted by `DEC-20260905-D` as generic phrase-labels while describing its own reconciliation methodology (Rationale section, discussing what a "checker miss" classification means). Neither is attributed to a source (row, file, page, or person); both are `DEC-20260905-D`'s own wording about its own review process. Classification: **own wording, not a quotation** (checker miss), per the `DEC-20260905-M` clause.

**`DEC-20260905-F.md` (6 residual):** all six (`"not narrated at all"` at line 176; `"Rule (a) cross-check"`-adjacent bullet fragments at lines 213, 249, 259, 275, 283) are `DEC-20260905-F`'s own descriptive prose characterizing categories of prior checker misses and "Not adopted" items from its own reconciliation (a "table entry" self-description, a category label, references to `scratchpad/residual-reconciliation-round5.md` items that are not committed to the repository). None is presented as a source's exact words; all are the record's own framing. Classification: **own wording, not a quotation** (checker miss) for all 6.

**`DEC-20260905-G.md` (1 residual, line 348):** `"Rule (a) cross-check"`. I verified the actual round-6 P3 partition report (`archive/sessions/2026-09-05-m2-closing-review-round-6.md:356-464`): its section header for this content is `### Rule (a): statements withdrawn by DEC-20260905-B/-C/-D/-F`, not literally `"Rule (a) cross-check"`, and its content is prose bullets, not a table. `DEC-20260905-G` uses `"Rule (a) cross-check"` as its own descriptive shorthand for that section, then correctly quotes the substantive verification sentence that follows (`"verified the record's own Context sentence... names both targets by unique subject matter... Substantiation accurate"`, which I confirmed matches round-6.md lines 458-463 under the ellipsis convention). Given the low character count of the flagged span (21 characters, below the checklist's 25-char manual-extraction threshold and only caught here because the checker ran at `--min-chars 12`) and that the substantive quoted content immediately following it is verified faithful, I classify this as **own wording / descriptive label, not a quotation** — a checker miss, not a defect. (This is the one residual in my partition I hold with somewhat lower confidence; a stricter reader could call the mismatched label a minor citation-hygiene point, but not a false, fabricated, or misattributed claim about content.)

No residual in my partition's 32 regular records or in `DEC-20260905-B/E/H/I/J/K/L/M` required classification (0 residual each).

## Ten "status on" code-claim spot checks (13 performed)

1. `DEC-20260420-I--notion-...8172a41ac4c9d52904de.md` — manifest field coverage: `grep -lE "processes_personal_data|personal_data_categories" manifests/*.yaml | wc -l` = 350/350 today (342/342 at the record's own 2026-09-05 date, confirmed against round-1's archived output — dated-observation growth, not a finding).
2. `DEC-20260420-I--notion-...81c8b9d4c6b5568bbcef.md` — `data_source_type` distribution: `grep -h "^data_source_type" manifests/*.yaml | sort | uniq -c` = api 232+1, computed 81, reference 3, scrape 32, ai_assisted 1 (350 total; 342 at the record's own date per round-1's archive — same dated-observation pattern).
3. Same record — `apps/api/scripts/onboard.ts` does not reject `data_source_type: scrape`/`govt-portal-scraping`/`commercial-aggregator-scraping` by name: confirmed no such string appears.
4. `DEC-20260420-K--notion-...8198b6ecf3569a68a9b4.md` — `apps/api/scripts/onboard.ts` lines 136-159, 1604-1614 carry the `--force-override-authority` guard and "Cluster 2 Phase 4a" comment exactly as quoted.
5. `DEC-20260421-A--notion-...81babd35eba5856ded79.md` — `apps/api/src/lib/capability-persistence.ts:303` reads "OUTSIDE the transaction. Design doc §4.3" verbatim; `archive/sessions/audit-reports/cluster_2_design.md`, `2026-04-20-phase-3-validation.md`, `2026-04-20-phase-4b-audit.md` all exist.
6. `DEC-20260421-B--notion-...81dab702f98b2034aa5d.md` — `apps/api/src/jobs/onboarding-retry.ts:1-16` header quotes verified verbatim ("Phase 6 retry scheduler will surface and re-run.", "It was never built.").
7. `DEC-20260421-B--notion-...81828e3fe183dd5e8072.md` — `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` renders the pre-existing "One API call. / Verified data your agent can trust." H1, not this row's locked H1; `DEC-20260314-G.md` line 60 confirms "live today, verbatim."
8. `DEC-20260421-D--notion-...81a2a12cc95010bf25bf.md` — `archive/sessions/audit-reports/2026-04-20-phase-4b-audit.md` confirms the 242-slug `maintenance_class` gap figure.
9. `DEC-20260421-D--notion-...810695c2e365deb8f2c8.md` — same frontend commit's `Index.tsx` labels section 2 "Solutions showcase" and renders `<SolutionsShowcase />`, not an agent-in-use animation.
10. `DEC-20260420-I--notion-...81c8b9d4c6b5568bbcef.md` Consequences — `DEC-20260428-A.md` contains "Strale does not operate scraper infrastructure" verbatim (after "First, "); `DEC-20260813-A.md` states the four per-call-parsing constraints as paraphrased.
11. `DEC-20260507-A--notion-...81b0ad02d69148811b57.md` — `apps/api/src/lib/platform-facts.ts:164,171` (`getActiveVendorNames`/`getStaleVendorNames`) and `apps/api/scripts/check-platform-facts-drift.ts:1-33` header quote match exactly, including the specific claim that the drift script imports only `getStaleVendorNames` while `platform-facts.test.ts` imports `getActiveVendorNames`.
12. `DEC-20260512-A--notion-...8188a014f4b1f963cf77.md` — `apps/api/src/jobs/test-scheduler.ts:322,392,422,495` and `apps/api/src/lib/startup-migrations.ts:811` quotes verified exactly.
13. `DEC-20260905-C.md` item 24 — `docs/decisions/records/DEC-20260511-F.md` exists with `record_key: DEC-20260511-F`, confirming C's own "the claim is false as stated" correction is itself accurate.

## Cross-checks against my own partition via the amending records

Two amending-record withdrawal items directly name files in my partition. I independently re-verified both:

- `DEC-20260905-J.md` item 22 withdraws a defective second occurrence, in `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md` (line 70), of the doctrine quotation that drops the word "data" ("direct connections only..." instead of "direct **data** connections only..."), while the record's first occurrence (line 29) correctly includes "data". I confirmed both occurrences at the stated lines: line 29 reads "data connections only..." (correct) and line 70 reads "only. No scraping. Full ToS compliance with every provider" doctrine text this row quotes" (missing "data", confirming the defect). Per rule (a), this is corrected, not a finding against the original record.
- `DEC-20260905-J.md` item 23 withdraws a dropped-parenthetical composite in `DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md` (line 59: quotes the sibling record's title as "Phase 4 split into 4a and 4b" with no ellipsis, dropping "(authority enforcement)" and "(manifest completeness + bulk regen)"). I confirmed the sibling record's actual frontmatter title is "DEC-20260421-D — Phase 4 split into 4a (authority enforcement) and 4b (manifest completeness + bulk regen)". Per rule (a), corrected, not a finding.

Both corrections are themselves accurate.

## Findings

1. **`docs/decisions/records/DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md`, frontmatter line 9 (`decided_at: 2026-05-05`).** The record's own source Notion row (page `35767c87082c81d3897fe47a2ec7a4c1`) has `date:Date:start: 2026-05-04`, one day earlier than the frontmatter's `decided_at`. Its sibling collision record `DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md` (identical `createdTime: 2026-05-05 09:35:36Z`, identical `date:Date:start: 2026-05-04`) sets `decided_at: 2026-05-04`, matching the row's own Date field, not the page-creation timestamp. The two sibling records treat the same date pattern inconsistently, and this record's `decided_at` does not match its own cited source row's Date property. Moderate confidence this is a genuine metadata defect (one of the pair is wrong); I could not find a stated convention in this repository specifying whether `decided_at` should derive from the Notion page's `Date` property or its `createdTime`, but every other record in this 32-record partition has the two values coincide, so this is the only place the choice is directly testable, and it is inconsistent with its own sibling.
2. **`docs/decisions/records/DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md`, line 43 (Consequences section).** States `config/env-manifest.yaml` "carries eight `HMRC_*` rows", then enumerates exactly seven names in the same sentence (`HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_REQUESTER_VRN`, `HMRC_SANDBOX_CLIENT_ID`, `HMRC_SANDBOX_CLIENT_SECRET`, `HMRC_TEST_VRN`, `HMRC_USE_SANDBOX`). I verified `config/env-manifest.yaml` at this commit contains exactly 7 `HMRC_*` entries (`grep -n "^- name: HMRC_" config/env-manifest.yaml` returns 7 matches), matching the enumerated list, not the stated count of "eight". This is a false statement about repository state at the pinned commit: the record over-counts its own enumerated list by one.

Both findings are minor (a metadata date field and a miscounted figure that contradicts the record's own adjacent enumeration), not fabrications, misattributions, or unverifiable claims, and neither touches a protected-section quotation's fidelity. I report them because the round's rule defines a finding as "anything false ... about repository state," and finding 2 in particular is unambiguously false as written (the record's own list has seven items, not eight).

## Structural checks (all 44 records)

Frontmatter parses; `record_key`/`id`/filename agree for every file; the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present in every record; every `evidence` entry resolves to a file at this commit (cross-repo `strale-io/strale-frontend@04c9fca9:...` entries resolved via `git show` in the sibling checkout) or a Notion/GitHub URL; every `relations` target resolves to an existing record-key file, none is a bare collided id per `docs/decisions/id-collisions.yaml`, and every declared relation is substantiated in the citing record's own body prose (verified per-record above). All 32 qualified records' collision-registry and closure-register bindings match (item 8, see Method).

## Unverifiable

- `DEC-20260905-G.md` line 348's `"Rule (a) cross-check"` label: I could not confirm this exact phrase appears anywhere as a genuine section title (it does not, per my check against `archive/sessions/2026-09-05-m2-closing-review-round-6.md`), so I classify it as the record's own descriptive shorthand rather than a verifiable quotation, with the caveat noted above.
- The row-level production/database-state claims that several of my partition's records explicitly decline to verify (e.g., HMRC's compliance verdict, InfoCamere's application outcome, whether specific staging drills have run) are correctly reported by those records themselves as unverifiable from this evidence set, and I did not attempt to resolve them independently, consistent with the records' own scoping.

## Verdict

Two minor factual defects found (frontmatter date inconsistency in `DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md`; a miscounted "eight" vs. seven enumerated `HMRC_*` rows in `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md`). Everything else in this 44-record partition — all 32 regular records' quotations, evidence, relations, and collision/register bindings; all amending-record residuals; the two cross-partition withdrawal items I independently re-verified — checked out clean.

PARTITION VERDICT: FAIL


## Gate output

```
M2 closing review round 12 gate run at fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d, 2026-09-06T13:01:47Z
HEAD=fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (404.4661ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (93.5272ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (18.5745ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (38.4145ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 997162.0637
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (2201.092ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (1485.9726ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (998.929ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (4255.1741ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 647783.7308
exit=0
=== node scripts/m2-closure-verify-private-rows.mjs
ok: 318 rows verified against strale-io/strale-context-archive@24713c48; 0 private next-batch candidates
exit=0
=== npm run programs:check

> programs:check
> node scripts/check-program-tracks.mjs

ok   docs/programs/brand-website/tracks.yaml
ok   docs/programs/cto-readiness/tracks.yaml
exit=0
=== npm run codex:check
  CX-11  high   PR #510 — drizzle-orm 0.38.4 -> 0.45.2 (T17 batch 2), with the DrizzleQueryError unwrap module and five routed readers
  CX-10  high   PR #513 — M2 batch 4: three engineering-convention rows (DEC-20260419-A, DEC-20260420-A, DEC-20260511-C) migrated to formal candidate records
  CX-9  high   PR #511 — DEC-20260422-A cross-surface collision resolved (G3 stage 2): protocol record DEC-20260422-A--git-3b256587, Notion row evidence-only
  CX-8  high   PR #509 — cross-surface identity mechanism (G3 stage 1): --git-<sha> record keys, DEC-20260904-B
  CX-7  high   PR #503 — G1 rule (DEC-20260904-A): 76 pre-readiness feature-scoped rows become evidence-only
  CX-6  medium PR #502 — capability input-shape guards: wrong-shaped list input must refuse, not crash
  CX-5  high   PR #500 — M2 batch: 2026-08 operating-window rows, seven formal candidate records
  CX-4  medium PR #499 — hono 4.12.8 -> 4.13.5, WP13 batch 1
  CX-1  high   PR #494 — withdrawn capabilities must not be advertised anywhere
  CX-2  medium PR #497 — the session gate stopped instructing removal of live worktrees
  CX-3  high   Retention: durable production-override records ride the compliance window
ok   codex re-review backlog
exit=0
=== npm run receipts:check
warn (11) — handoffs stating a bare test count with no receipt:
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t12-research-contract.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t13-design-tokens.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t14-cheap-extras.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t5-cto-readable-structure.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-founder-answers-retention-and-wp13-track.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-handoff-gate-live-worktree.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-04-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-05-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-06-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-06-retention-cadence-and-review-followups.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
exit=0
=== node apps/api/scripts/check-pii.mjs --strict
PII guard: clean — no unredacted person names or checksum-valid identifiers found.
exit=0
=== node apps/api/scripts/check-no-committed-secrets.mjs
check-no-committed-secrets: clean (3164 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Consolidated findings

Five partitions passed and the gates were clean; the consolidated verdict
is FAIL on P5's one item and P6's two items.

1. **`docs/decisions/records/DEC-20260905-J.md`, item 20 (section
   `### \`DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086\``, lines
   414-428).** Found by partition P5. The withdrawal asserts, as fact,
   that "library-as-product" is "not language
   `docs/decisions/records/DEC-20260812-A.md` ... uses." Evidence:
   `docs/decisions/records/DEC-20260812-A.md:83` reads (as part of a
   sentence) "replaces the library-as-product strategy. Do not weaken
   the carried-forward" -- the literal phrase is present in that file.
   Confirmed with a case-insensitive grep for "library-as-product"
   against `docs/decisions/records/DEC-20260812-A.md` at HEAD (one hit,
   line 83).
2. **`docs/decisions/records/DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md`,
   line 43 (Consequences).** Found by partition P6. States
   `config/env-manifest.yaml` "carries eight `HMRC_*` rows", then
   enumerates exactly seven names in the same sentence. Evidence: a
   count of `name: HMRC_` entries in `config/env-manifest.yaml` at HEAD
   is 7, matching the record's own enumerated list, not the stated
   count of eight.
3. **`docs/decisions/records/DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md`,
   frontmatter line 9 (`decided_at: 2026-05-05`).** Found by partition
   P6. The record's own source Notion row (page
   `35767c87082c81d3897fe47a2ec7a4c1`) has `date:Date:start: 2026-05-04`
   and `createdTime: 2026-05-05 09:35:36Z`; the record's own Consequences
   (line 46) already states the row's Outcome was "recorded
   2026-05-04". The sibling collision record
   `DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md` sets
   `decided_at: 2026-05-04` from an identical row Date property.

All three items are corrected by `DEC-20260905-N`
(`docs/decisions/records/DEC-20260905-N.md`), which withdraws each
statement without editing the record it corrects, per the round's
immutability rule.

VERDICT: FAIL
