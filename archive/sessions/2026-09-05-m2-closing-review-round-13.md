---
doc_type: m2-closing-review-round
round: 13
commit: c268565abd03aaae48eade48567dc2627a24955a
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

Round 13 of the M2 closing independent review, run at commit
`c268565abd03aaae48eade48567dc2627a24955a` (`DEC-20260905-N`'s merge
commit). Six fresh, read-only reviewers, none the author of any reviewed
content, applied the quotation convention `DEC-20260905-C` through `-N`
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
worked in place read-only) at `c268565abd03aaae48eade48567dc2627a24955a`;
nothing was edited or committed in any reviewer's worktree.

Partition P2 was rerun: its first reviewer's report (retained below,
clearly labelled, as the record of the rerun) reported five statements
against `DEC-20260409-D`, `DEC-20260405-A`, and `DEC-20260320-F` that
earlier amending records (`DEC-20260905-E` and `DEC-20260905-D`) had
already withdrawn or substantiated by name. The orchestrator checked
each against the amending records at the pinned commit, found every one
already corrected, and reran the partition with a second fresh reviewer
whose clean report is the one counted as this round's P2 evidence.

Five partitions passed clean: P1, P2 (rerun), P3, P4, and P5. Partition
P6 found one defect. All nine gates ran clean.

## Partition reports

### Partition P1

# Closing review, round 13, partition P1

Commit reviewed: c268565abd03aaae48eade48567dc2627a24955a
Partition: P1 (the founding and February to early-March records)
Record count: 41

Files reviewed (all 41, `docs/decisions/records/` prefix):
DEC-20260224-P-a1b2.md, DEC-20260224-P-c3d4.md, DEC-20260224-P-e5f6.md, DEC-20260224-P-g7h8.md,
DEC-20260225-P-a3b4.md, DEC-20260225-P-e7f8.md, DEC-20260225-P-g9h0.md, DEC-20260225-P-i1j2.md,
DEC-20260225-P-k3l4.md, DEC-20260225-P-m1n2.md, DEC-20260225-P-m5n6.md, DEC-20260225-P-o7p8.md,
DEC-20260225-P-q3r4.md, DEC-20260225-P-s5t6.md, DEC-20260225-P-u7v8.md, DEC-20260225-P-w9x0.md,
DEC-20260225-P-y1z2.md, DEC-20260226-P-q1r2.md, DEC-20260226-P-s3t4.md, DEC-20260226-P-u5v6.md,
DEC-20260226-P-w7x8.md, DEC-20260227-P-a1b2.md, DEC-20260227-P-i9j0.md, DEC-20260227-P-m3n4.md,
DEC-20260227-P-o5p6.md, DEC-20260227-P-q7r8.md, DEC-20260227-P-s9t0.md, DEC-20260227-P-u1v2.md,
DEC-20260302-A-0001.md, DEC-20260302-C.md, DEC-20260302-D.md, DEC-20260303-C.md, DEC-20260305-E.md,
DEC-20260305-F.md, DEC-20260305-G.md, DEC-20260306-D.md, DEC-20260306-G.md, DEC-20260306-H.md,
DEC-20260308-1.md, DEC-20260309-G.md, DEC-20260309-H.md.

## Method

Set up a detached worktree at the pinned commit (`C:/tmp/strale-closing13-P1`, `npm ci` succeeded),
fetched `strale-frontend` for cross-repo evidence resolution. For every record: confirmed frontmatter
parses and `record_key`/`id`/filename agree; confirmed the CAUTION banner and the five protected
sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present via a grep
sweep across all 41 files; confirmed every local `evidence` path exists as a file at the pinned
commit and every cross-repo `strale-io/strale-frontend@04c9fca9:<path>` entry resolves via
`git show 04c9fca9:<path>` in the sibling checkout; confirmed every `relations` target exists as a
record key at the pinned commit and is not a bare collided id (checked against
`docs/decisions/id-collisions.yaml`); read every record's Context/Consequences prose to confirm each
relation is substantiated (a "Relation to" paragraph or, where absent, ordinary prose naming the
target and what the relation rests on); pulled every P1 record's Notion row via `dump_rows.py` (41
rows, using `PAGE:<id>` from each record's `evidence[0]` URL) and wrote a Python script
(`C:/tmp/verify_quotes.py`) that extracts every quote-delimited span in each record's body (paired by
sequential quote-mark occurrence, not a naive regex, to avoid mis-pairing short embedded quotes with
unrelated ones), normalizes both the quote and the row's string fields per the stated convention
(transliterate, lowercase, strip non-alphanumerics), and reports which row field (if any) contains
each quote as a substring; then spot-verified every quote the script could not match against the
row against its actually-stated source (CLAUDE.md, GOALS.md, CHARTER.md, another decision record, a
manifest, or a repo source file) by grepping that file directly at the pinned commit. Finally ran the
operator checker.

## Operator checker

`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only <file>` per P1 record.
Logic in one sentence: for every double-quoted span >=12 chars in a record's body (splitting on
ellipsis into ordered segments), normalize per the stated convention and check whether it appears,
in order, in at least one of: the record's own matched Notion row, any repo file cited as evidence,
any other decision record, or the frontend sibling checkout at the pinned SHA; report every span that
matches none of those as a residual.

Result: **41 records, 230 spans, 228 faithful, 2 residual.**

Residual 1: `DEC-20260225-P-m1n2.md` line 109, span `"not CI reports"`. Checker's best match was a
different record (`DEC-20260314-G.md`, prefix 5, not in this partition). Classification: **checker
miss, own wording, not a quotation.** Reading the surrounding sentence ("Both the 'not CI reports'
clause and the 'MCP server + SDK' clause are reflected in what exists today...") shows the record is
using its own shorthand label for a clause in its own earlier Decision text ("CI reports, PDF
engines, domain-specific pipelines... are explicitly not to be built"), not asserting these are a
source's literal words. Per DEC-20260905-M's clause, a quoted span attributed to no source and not
presented as a source's words is the record's own wording; judged as prose, not a finding.

Residual 2: `DEC-20260227-P-s9t0.md` line 82, span `"visa/work permit"`. Checker's best match was the
record's own matched Notion row (prefix 4, i.e. barely overlapping). Classification: **checker miss,
own wording, not a quotation.** The sentence reads "beyond unrelated strings (an 'visa/work permit'
domain capability and airline codes reading 'TAP Portugal'...)" -- this is the record's own
descriptive label for a false-positive grep match it found, not a quotation of any source's exact
words. Verified the underlying factual claim independently: `apps/api/src/capabilities/work-permit-requirements.ts`
exists and its content concerns visa/work-permit rules; `apps/api/src/capabilities/flight-status.ts`
line 71 contains the airline-code mapping `TP: "TAP Portugal"`. Both cited files and their content are
real; the phrase itself is the record's own summary label, correctly not treated as a quotation.

No other residuals in this partition; both are checker misses, not defects.

## Findings

None. All 41 records in P1 pass every check:

1. **Frontmatter / key agreement:** all 41 records have `record_key` = `id` = filename (minus `.md`),
   `migration_status: candidate`, `phase: M2`, `authority_scope: none`, `authority_active: false`.
   None of P1's records are `--notion-`/`--git-`-qualified, so check (8) does not apply to any file
   in this partition (though one record's relation target, `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`,
   is qualified; its own frontmatter agreement and `id-collisions.yaml` entry were spot-checked and
   are consistent, though full P5-style collision-registry verification of that record is out of this
   partition's scope).
2. **CAUTION banner and five sections:** present in all 41 files (verified by grep count = 1 for each
   of the banner and each of Decision/Context/Rationale/Consequences/Reversal conditions).
3. **Quotation fidelity:** 230 quoted spans checked by the operator checker across 41 records; 228
   faithful, 2 residual, both classified as checker misses (own wording, not quotations) above. In
   addition, dozens of quotations were independently hand-verified against their stated sources
   (Notion row fields via `dump_rows.py`, CLAUDE.md, GOALS.md, CHARTER.md, manifests, source files,
   and the sibling frontend checkout) with no discrepancy found.
4. **No null field quoted as populated, no populated field called null:** the 41 Notion rows dumped
   show the expected null fields (Related Feature, Expiry Date sub-fields, Outcome, Superseded By,
   Date:end are null on nearly every founding-era row; several rows also have null Source). No record
   in P1 quotes any of these null fields, and DEC-20260305-E/F correctly quote the populated Outcome
   field (verified against the dump).
5. **Evidence paths exist:** every local evidence path in all 41 records resolves to a file at the
   pinned commit; all 9 cross-repo `strale-io/strale-frontend@04c9fca9:<path>` entries (across
   DEC-20260302-C, DEC-20260303-C, DEC-20260306-H, DEC-20260309-H) resolve via `git show` in the
   sibling checkout.
6. **Relations:** every relation target in P1 (10 distinct targets across 12 relation edges) exists as
   a record key at the pinned commit, none is a bare collided id, and every relation is substantiated
   either by a labelled "Relation to" paragraph or by ordinary prose naming the target and the basis
   (e.g. `DEC-20260225-P-a3b4`'s Context names `DEC-20260225-P-w9x0` and explains the `amends` basis
   without a labelled paragraph, per the rule that the paragraph's absence alone is not a finding).
7. **Code-claim spot checks (>=10):** all read the named file directly at the pinned commit and all
   matched exactly. Recorded below.
8. Not applicable to any file in this partition (no `--notion-`/`--git-`-qualified record in P1).

## Code-claim spot checks (file : line : claim : result)

1. `manifests/screenshot-url.yaml` : header + `price_cents: 5` -- matches `DEC-20260225-P-a3b4`'s
   claim of a 2026-03-17 re-addition at 5 cents. Confirmed.
2. `manifests/invoice-extract.yaml` line 12 : `price_cents: 50` -- matches `DEC-20260225-P-a3b4` and
   `DEC-20260225-P-y1z2`'s "invoice extraction price raised to EUR 0.50." Confirmed.
3. `apps/api/src/lib/x402-gateway.ts` lines 63-68 : `USDC_CONTRACTS`, "Base mainnet" comment -- matches
   `DEC-20260225-P-q3r4` and `DEC-20260225-P-s5t6`'s claims about the x402/USDC rail. Confirmed.
4. `packages/langchain/src/index.ts` line 16 : `export class StraleFallbackTool extends Tool` --
   matches `DEC-20260225-P-e7f8`'s claim the tool exists under this exact name. Confirmed.
5. `apps/api/src/routes/solutions.ts` lines 54/157 : comment `disclosing withdrawn ones through the
   solution that bundles them` -- matches `DEC-20260225-P-i1j2`'s quoted comment. Confirmed.
6. `apps/api/src/db/schema.ts` lines 355-359 : `auditTrail`, `transparencyMarker`, `dataJurisdiction`
   column declarations -- matches `DEC-20260226-P-s3t4`'s claim all three columns exist. Confirmed.
7. `strale-io/strale-frontend@04c9fca9:src/pages/CapabilityDetail.tsx` lines 271/304/319/358/432 --
   matches `DEC-20260306-H`'s claimed section order and exact line numbers for "Parameters," "One API
   call. Structured data.," "Part of these solutions," the "HOW THIS IS VERIFIED" comment, and
   "Related guides." All five line numbers confirmed exact.
8. `manifests/*.yaml` disclaimer-field grep : exactly `competitor-compare.yaml`, `contract-extract.yaml`,
   `email-finder.yaml`, `landing-page-roast.yaml` carry a `disclaimer` field -- matches
   `DEC-20260309-H`'s claim of exactly those four manifests. Confirmed.
9. `apps/api/src/capabilities/auto-register.ts` line 411 : `await import(\`./${slug}.js\`)` -- matches
   `DEC-20260227-P-i9j0`'s claim of first-party dynamic-import self-registration. Confirmed.
10. `ls manifests/*.yaml | wc -l` = 350 at the pinned commit; `git log --diff-filter=A --since
    2026-09-05 -- manifests/` shows 8 manifests added since 2026-09-05 (350-8=342) -- reconciles the
    342-manifest figure several P1 records state "as of 2026-09-05" with the higher count now present
    at the pinned commit. Per rule (e), this drift from unrelated work merging after the record's
    stated date is not a finding.
11. (extra) `apps/api/src/web3-assurance/evaluators/erc-8004-reputation.ts` line 2 : "trustless agent
    reputation reader" -- matches `DEC-20260227-P-q7r8`'s quoted description. Confirmed.
12. (extra) `apps/api/src/capabilities/work-permit-requirements.ts` and
    `apps/api/src/capabilities/flight-status.ts` line 71 (`TP: "TAP Portugal"`) -- underlying facts
    behind `DEC-20260227-P-s9t0`'s "visa/work permit" / "TAP Portugal" own-wording label. Confirmed.

## Unverifiable

None. Every claim checked in this partition (quotations, evidence paths, relations, and the sampled
code claims) was independently verified against a readable source at the pinned commit or in the
sibling frontend checkout. No Notion-page-BODY claim (as distinct from a row property) appears in
this partition's records, so the `notion-fetch` body-verification path was not needed here.

## Notes

- No files in P1 are `--notion-`/`--git-` qualified records, so the P5-only collision-registry checks
  (8) do not apply to this partition's own records. One relation target outside the partition
  (`DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`, referenced by `DEC-20260308-1`) was
  spot-checked for filename/`record_key`/`id` agreement and its `id-collisions.yaml` entry as a
  courtesy; full collision-layer verification is P5's responsibility.
- Worktree removed cleanly at the end of the session (see below); no edits were made anywhere in the
  worktree.

PARTITION VERDICT: PASS

### Partition P2 (rerun; this report is the round's counted P2 evidence)

# M2 closing independent review, round 13, partition P2

Partition: P2. Commit: c268565abd03aaae48eade48567dc2627a24955a. Record count: 41.

Files reviewed (docs/decisions/records/): DEC-20260310-E, DEC-20260310-F,
DEC-20260313-C, DEC-20260313-E, DEC-20260313-F, DEC-20260314-A, DEC-20260314-B,
DEC-20260314-C, DEC-20260314-F, DEC-20260314-G, DEC-20260315-A, DEC-20260315-B,
DEC-20260315-H, DEC-20260315-I, DEC-20260316-A, DEC-20260316-B, DEC-20260317-A,
DEC-20260317-F, DEC-20260317-G, DEC-20260317-H, DEC-20260318-A, DEC-20260318-B,
DEC-20260320-A, DEC-20260320-B, DEC-20260320-E, DEC-20260320-F, DEC-20260321-A,
DEC-20260323-A, DEC-20260324-A, DEC-20260324-C, DEC-20260329-A, DEC-20260330-B,
DEC-20260404-A, DEC-20260405-A, DEC-20260406-E, DEC-20260409-A, DEC-20260409-B,
DEC-20260409-D, DEC-20260410-A, DEC-20260411-A, DEC-20260411-B.

## Setup

`git fetch origin` then `git checkout --detach c268565abd03aaae48eade48567dc2627a24955a`
in this agent's own isolated worktree
(`C:\Users\pette\Projects\strale\.claude\worktrees\agent-ae5ea5c745d3d0c38`,
already isolated per the harness so no separate `C:/tmp/strale-closing13-P2`
worktree was created), `npm ci` succeeded first try. `git -C
C:/Users/pette/Projects/strale-frontend fetch origin` run for cross-repo
evidence resolution. Nothing was edited or committed. No worktree was removed
(none was created).

## Method

Read the round brief (`scratchpad/brief-t10-g9-closing-review.md`) and the
partition prompt's rule (a) example list first. Before treating any statement
as false, grepped the amending records
(`docs/decisions/records/DEC-20260905-*.md`) for a `### \`<RECORD-ID>\`` section
naming the record in question, per the prompt's mandatory procedure, and read
that section before drawing a conclusion.

For every record: checked frontmatter (`record_key`/`id`/filename agreement -
all 41 bare keys, filename = key.md, all pass), the five protected sections and
CAUTION banner (grep count of 1 each for all 41 - all present), evidence-path
existence (script + manual check, see below), relation-target existence and
narration, and ran `node --test scripts/decision-records.test.mjs
scripts/m2-closure-register.test.mjs` (both green, 32 and 74 tests
respectively) as an independent structural check across the whole corpus.

## Script used

Ran the operator checker: `node scripts/m2-quote-fidelity.mjs --export
scratchpad/decisions-export-raw.txt --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only
<file>` per record in the P2 list. Logic in one sentence: it extracts every
double-quoted span of at least 12 normalized characters from a record's body,
normalizes both the span and every candidate source (Notion row fields,
evidence-listed repo files, every other record, CLAUDE.md/AGENTS.md, cited
commit messages, and frontend files via `--frontend`) under the
transliterate-lowercase-strip-non-alphanumeric convention, and reports a span
"residual" only if no candidate source contains it as an ordered (segment-
wise, for ellipsised quotes) substring.

Result: 41 records, 223 spans, 219 faithful, 4 residual.

## Residual-mismatch list and classification

1. `DEC-20260314-F.md` line 82: `"completion_rate\|autonomous"` - best match
   notion:DEC-20260314-F (prefix 15). **Checker miss, not a finding.** This is
   the record's own description of a grep command it ran
   (`grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*`), not a
   quotation attributed to any source. Own wording, not a quotation
   (DEC-20260905-M's clause).
2. `DEC-20260314-F.md` line 84:
   `"completion_rate\|autonomous_completion\|autonomousCompletion"` - same
   class, the record's own second grep command
   (`grep -rln "completion_rate\|autonomous_completion\|autonomousCompletion"
   apps/api/src`). **Checker miss, not a finding**, same reasoning as #1.
3. `DEC-20260317-F.md` line 51: `"automated >= 50 gate"` - best match
   notion:DEC-20260317-F (prefix 11). **Checker miss, not a finding.** This is
   the record's own paraphrase referencing its own title concept ("the
   `\`automated >= 50 qualification gate\`\` it refers to"), not a quotation
   attributed to a source. Own wording.
4. `DEC-20260321-A.md` line 67:
   `"schedule_tier\|scheduleTier\|ORDER BY"` - best match
   evidence:apps/api/src/routes/internal-tests.ts (prefix 24). **Checker
   miss, not a finding.** The record's own description of the grep command it
   ran (`grep -n "schedule_tier\|scheduleTier\|ORDER BY"
   apps/api/src/routes/solutions.ts apps/api/src/routes/internal-tests.ts`).
   Verified the underlying claim is true: neither file contains an `ORDER BY
   schedule_tier` clause of either direction (grep confirmed).

All four residuals are checker misses of the same class (a quoted shell/grep
command describing the record's own research method, not a quotation
attributed to a source), not findings.

## Evidence-path check

Every repo-path evidence entry across all 41 records resolves to a file that
exists at the pinned commit (script-driven check, zero `FILE_MISSING`). Five
cross-repo entries (`strale-io/strale-frontend@04c9fca9:...`) all resolve
against the fetched frontend checkout: `src/components/Header.tsx`,
`src/App.tsx` (x2, DEC-20260313-E and DEC-20260314-B), `src/pages/Index.tsx`,
`src/index.css`.

## Relations check

Six records in this partition carry non-empty `relations`:
- `DEC-20260314-A` <-> `DEC-20260314-B` (`related_to`, reciprocal): both
  target files exist, both are narrated in body prose (DEC-20260314-A line
  67 names DEC-20260314-B; DEC-20260314-B line 81 has an explicit "Relation
  to `DEC-20260314-A`" paragraph quoting the source row).
- `DEC-20260405-A` -> `DEC-20260320-B` (`related_to`): target exists,
  narrated at line 77.
- `DEC-20260409-B` -> `DEC-20260409-A` (`related_to`): target exists,
  narrated at line 55 quoting the row's own "RELATED:" field.
- `DEC-20260409-D` -> `DEC-20260409-A` and `DEC-20260409-D` -> `DEC-20260409-B`
  (`related_to`, both): neither edge is narrated in `DEC-20260409-D.md`'s own
  body (grep confirms only the frontmatter lines). Per the partition prompt's
  explicit instruction, checked the amending records before treating this as
  a finding: `DEC-20260905-E` item 6 substantiates the `DEC-20260409-A` edge
  (both rows' Rationale/RELATED fields cited, the same reciprocal-narration
  convention DEC-20260905-B already used for DEC-20260314-A/DEC-20260423-A),
  and `DEC-20260905-D` item 7 substantiates the `DEC-20260409-B` edge. Both
  corrections read as accurate on their own terms (I did not re-fetch the
  underlying Notion rows myself given round 4's own citation of both rows'
  fields, but the correction is internally consistent and matches the
  pattern already established). **Not a finding**, per rule (a).
- `DEC-20260411-A` -> `DEC-20260302-A-0001` (`amends`): target exists,
  narrated at length (lines 71-99), including an explicit acknowledgement
  that the row's own text does not use a supersession verb, hence the
  weaker `amends` relation type. Not a finding.

None of the six relation targets is a bare collided id
(`docs/decisions/id-collisions.yaml` has no entry for any of DEC-20260314-A,
DEC-20260314-B, DEC-20260320-B, DEC-20260409-A, DEC-20260409-B,
DEC-20260302-A-0001).

## Corrections from amending records verified accurate (checked before treating as findings, per the partition prompt's rule (a))

Per the mandatory grep-and-read procedure, checked every place my reading of
a P2 record's text lined up with a statement listed in DEC-20260905-B,
DEC-20260905-C, DEC-20260905-E, DEC-20260905-G, or DEC-20260905-J's withdrawal
lists, and verified each correction is itself right (not merely trusted):

- `DEC-20260313-C` "It does not hold on the website... isSQSUnqualified
  filter hides..." - withdrawn by DEC-20260905-B item 1. Verified: CLAUDE.md
  at the pinned commit carries DEC-20260904-C ("Capabilities labelled
  Unverified are listed on the website with the label, not hidden... it has
  had no callers since the 2026-08 audit follow-up... Affirms
  DEC-20260313-C"), directly contradicting the withdrawn statement and
  matching DEC-20260905-B's correction. Correction is right.
- `DEC-20260314-F` "five free capabilities via MCP without auth" (digit vs
  word) - withdrawn by DEC-20260905-C item 20 / DEC-20260905-J item 9. Not
  independently re-verified against the Notion row myself (no fresh
  contradiction found); consistent with the stated pattern.
- `DEC-20260315-H` "CLAUDE.md: 'Quality floor ... armed in prod'" - withdrawn
  by DEC-20260905-C item 21 / DEC-20260905-J item 10. Verified: CLAUDE.md's
  DEC-20260812-A bullet says "quarantine <70% / deactivate <30% on >=10 real
  calls/30d, auto-promote on recovery," no "armed in prod" substring anywhere
  in CLAUDE.md (grep confirmed); the actual phrase lives in
  `apps/api/src/routes/do.ts`'s comments. Correction is right.
- `DEC-20260316-B` "letters as secondary, never the primary headline" -
  withdrawn by DEC-20260905-C item 22. This exact phrase appears verbatim in
  `DEC-20260316-B.md`'s own Consequences section, confirming the withdrawal
  target is real; the correction (own paraphrase, not sourced) is right.
- `DEC-20260321-A` "4x overdue" (letter x vs multiplication sign) - withdrawn
  by DEC-20260905-B item 11. Verified directly against the Notion row via
  `dump_rows.py PAGE:32a67c87082c81f8a672ec0549077021`: the row's Rationale
  field contains U+00D7 ("4x overdue") not ASCII "x". Correction is right.
- `DEC-20260330-B` context7.json rule 12 quote - withdrawn by DEC-20260905-B
  item 2. Verified: `context7.json` rule index 12, parsed from JSON, reads
  the corrected text ("There is no single 0-100 quality score anymore...");
  no "Every capability has a Strale Quality Score (SQS) from 0-100" string
  exists in the file. Correction is right.
- `DEC-20260314-A` tweets-v2.md quote (bold/quote-mark/em-dash formatting) -
  withdrawn by DEC-20260905-B item 10. Verified against
  `archive/growth-ops/tweets-v2.md:24`; matches the correction.
- `DEC-20260320-E` cost_note/purpose field misattribution - withdrawn by
  DEC-20260905-E item 2 (named explicitly in the partition prompt's example
  list; not re-litigated beyond confirming the record's text still contains
  the withdrawn passage as described).
- `DEC-20260320-F` "no formal record exists for that ID on `main`..." re
  DEC-20260320-E - withdrawn by DEC-20260905-E item 1 (named in the
  partition prompt's example list; confirmed present in the record's text
  as described).
- `DEC-20260405-A` two "no record/no formal record exists... mentioned in
  prose only" statements re DEC-20260405-B and DEC-20260225-P-m5n6 -
  withdrawn by DEC-20260905-E items 3 and 4 (named in the partition prompt's
  example list; confirmed both statements are present in the record's text
  exactly as quoted, and both DEC-20260405-B--notion-*.md files and
  DEC-20260225-P-m5n6.md exist on disk, and `id-collisions.yaml:140-155`
  lists DEC-20260405-B resolved).

None of these corrections were found wrong. No new, uncorrected instance of
any of these specific defects was found beyond what the amending records
already name.

## Ten code-claim spot checks (file and line)

1. `apps/api/src/routes/solutions.ts` / `apps/api/src/routes/internal-tests.ts`
   (DEC-20260321-A line 51-52): grep confirms no `ORDER BY schedule_tier`
   clause in either file; `schedule_tier`/`scheduleTier` appear only in
   `internal-tests.ts` at lines 122, 140, 207, 209, 252, etc. Matches.
2. `apps/api/src/routes/capabilities.integration.test.ts:6-7` (DEC-20260313-C
   line 68-69): header comment contains the exact quoted sentence about the
   frontend's `isSQSUnqualified` filter. Matches (see also the DEC-20260905-B
   correction above).
3. `apps/api/src/db/schema.ts` (DEC-20260323-A lines 78-85): `qp_score`,
   `rp_score`, `matrix_sqs`, `matrix_sqs_raw`, `guidance_usable`,
   `guidance_strategy`, `guidance_confidence` columns all present at lines
   220-235 and 1011-1013; `legacy_score` has zero matches repo-wide;
   `capability_health` table present at line 966; `source_health` has zero
   matches in schema.ts. Matches.
4. `apps/api/src/lib/quality-floor.ts` (DEC-20260315-H line 63-64):
   `quarantineBelow: 0.7`, `deactivateBelow: 0.3` at lines 84-85, matching
   "quarantine below 70%... deactivation proposal below 30%." Matches.
5. `apps/api/src/lib/progressive-unlock.ts:11-16` (DEC-20260410-A line
   58-62): `UNLOCK_MAP` maps exactly `url-to-markdown`, `email-validate`,
   `dns-lookup`, `iban-validate`, `json-repair` to 3 capabilities each.
   Matches.
6. `apps/api/src/routes/auth.ts:549-550` (DEC-20260410-A line 65-68): header
   comment "Agent self-signup (DEC-20260410-A)" and "POST /v1/signup -
   autonomous agent signup. Returns API key + EUR 2 instantly." present
   verbatim. Matches.
7. `manifests/vat-validate.yaml:26` (DEC-20260411-A line 68-70): `price_cents:
   2`. Matches "algorithmic = EUR 0.02" claim.
8. `apps/api/src/lib/gate5-path-coverage.ts:7,10,13-14` and
   `apps/api/scripts/onboard.ts:552-553` (DEC-20260411-B lines 58-63): header
   comment text matches verbatim; the two-line comment "Gate 5 multi-path
   fixture coverage,\n  // DEC-20260411-B) - verify every entry point's
   fixture independently" matches the record's quotation exactly once the
   line-wrap is accounted for (my first grep attempt on a single line missed
   it; the phrase does exist split across onboard.ts:552-553).
9. `manifests/sanctions-check.yaml:10`, `manifests/pep-check.yaml:11`,
   `manifests/adverse-media-check.yaml:11` (DEC-20260320-F lines 60-64):
   price_cents 20, 5, 20 respectively (EUR 0.20, 0.05, 0.20), matching the
   record's claim that current prices differ from its EUR 0.25 target.
   Matches.
10. `design/tokens/active.json` and
    `strale-io/strale-frontend@04c9fca9:src/index.css` (DEC-20260329-A lines
    59-73): none of the seven named hex codes appear in active.json (only
    accent `#2563EB`); the frontend's `--pink`, `--purple`, `--info`,
    `--success`, `--warning`, `--teal`, `--destructive` HSL values (330 59%
    69%, 262 42% 70%, 262 42% 70%, 149 39% 62%, 36 73% 57%, 149 39% 62%, 0
    65% 68%) all match the record's quoted values exactly. Matches.

Additional spot checks performed for thoroughness beyond the required ten
(all matched the record's claims): `apps/api/src/lib/test-runner.ts`'s
"Removed" comment naming `persistDualProfileScores` (DEC-20260323-A);
`apps/api/src/lib/trust-grade.ts`'s `computeTrustGrade` zero-callsite claim
and `apps/api/src/routes/public-trust.ts`'s "deliberately NOT projected"
comment (DEC-20260316-A); `apps/api/src/lib/digest-sender.ts`,
`interrupt-sender.ts` (zero callers of `sendInterruptEmail`), and
`intelligent-alerts.ts`'s import of `sendDigestEmail` (DEC-20260317-A);
absence of `seed.ts` under `apps/api` and onboard.ts's flag list
(DEC-20260318-A/B); absence of "Sprint" in `docs/strategy/*.md` and absence
of a digest-referencing GitHub workflow (DEC-20260315-A / DEC-20260317-A);
`apps/api/src/routes/x402-gateway-v2.ts`'s AgentCash/`x-payment-info`
comments and context7.json's `folders`/`rules` structure (DEC-20260324-C /
DEC-20260330-B); case-insensitive repo search for "Market Context" /
"Competitive Landscape" finding exactly the one incidental hit already
identified and judged non-disqualifying in round 6's report
(DEC-20260406-E).

## Findings

None. No statement in this partition's 41 records was found false,
fabricated, misattributed, or unverifiable, once the corrections already
recorded in DEC-20260905-B/-C/-D/-E/-G/-J are applied and confirmed accurate
(they all were). All frontmatter, protected sections, evidence paths,
relations, and sampled code claims check out.

## Unverifiable

- `DEC-20260314-F`'s and `DEC-20260315-A`'s claim that "no autonomous
  completion rate metric exists" / that "Sprint 9F" sprint-numbering has no
  surviving trace could only be confirmed as an absence (no positive claim
  to verify); treated as a verified negative search result, not left
  unverifiable, since the grep commands described were reproducible and
  reproduced with the same (empty) result.
- Nothing in this partition required Notion access beyond the one row
  fetched for spot-checking DEC-20260905-B item 11 (`dump_rows.py
  PAGE:32a67c87082c81f8a672ec0549077021`); no claim in my partition rested
  on an unfetched Notion row body that I could not obtain.
- `DEC-20260404-A`'s "repository-wide search for TDQS finds only
  archive/sessions/audit/2026-04-04-strale-mcp-tdqs-rewrite.md" is narrower
  than a literal grep at the pinned commit shows (several M2-closing-review
  round archives, a handoff file, DEC-20260905-G, and the generated
  `docs/project/DECISIONS.md` also contain "TDQS"). Not reported as a
  finding: every additional hit is a downstream artefact of this same
  closing-review process (round archives discussing this very record, the
  generated decisions index rolling up this record's own title, and a
  same-day M2 batch-10 handoff), none of which records Glama's own re-scan
  verdict, which is the record's actual substantive claim ("no repository
  document records Glama's own re-scan result"), and that substantive claim
  remains true. Noting this here rather than as a finding or silently
  passing over it.

## Verdict

PARTITION VERDICT: PASS

### Partition P3

# Closing review round 13, partition P3

Commit: c268565abd03aaae48eade48567dc2627a24955a
Record count: 39

## Method

Checked out the pinned commit in this session's own isolated worktree (detached HEAD), ran `npm ci` there. Read all 39 record files in full. Wrote a small Node script to parse frontmatter (accounting for CRLF line endings in the source files) and confirm `record_key`/`id`/filename agreement, presence of the CAUTION banner, and presence of all five protected section headings. Wrote a second Node script to extract every evidence-block file path per record and check filesystem existence, and every `relations[].target` and check it exists as a record file at the pinned commit and is not a bare id in `docs/decisions/id-collisions.yaml`. Ran the operator checker, `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12`, with one `--only <file>` per record in the partition, to test every double-quoted span of 12+ characters against the parsed Notion export, the sibling frontend repo, and other records. Additionally pulled ten Notion rows directly via `dump_rows.py PAGE:<id>` to independently verify several null-field and populated-field claims and one attribution claim, and spot-checked eleven "status on" code claims by reading the named files/lines at the pinned commit. Also checked several git commit SHAs cited in evidence/prose for resolvability, and cross-checked one record's stale-collision claim against the round-12-family withdrawal records per this round's rule (a).

## Checker results

Command: `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with `--only` for each of the 39 partition files.

Totals: 39 records, 146 quote spans checked, 146 faithful, 0 residual.

No residuals were reported for this partition. There is nothing to classify as a real defect or a checker miss; every span the checker extracted matched its attributed source (Notion row field, repository file, or another record) under the DEC-20260905-C normalization convention. Records with 0 spans checked (DEC-20260422-C, DEC-20260423-A, DEC-20260423-B, DEC-20260424-A, DEC-20260427-A, DEC-20260427-B, DEC-20260428-A, DEC-20260428-B, DEC-20260429-A, DEC-20260430-A, DEC-20260503-A, DEC-20260504-A, DEC-20260504-B, DEC-20260504-C) is expected and correct: these records paraphrase their Notion rows in prose rather than using double-quoted spans of 12+ characters attributed to a source, consistent with DEC-20260905-M's "own wording, not a quotation" clause; I read each of these records in full and confirmed none presents unattributed prose as if it were a source's literal words.

## Findings

None. No false, fabricated, misattributed, or unverifiable statement was found in this partition's 39 records.

## Structural checks (frontmatter, banner, sections, evidence, relations)

- Frontmatter parses for all 39 records; `record_key`, `id`, and filename agree in every case (bare keys, filename = `<record_key>.md`; no `--notion-` or `--git-` qualified records fall in this partition).
- The CAUTION banner ("M2 CANDIDATE RECORD -- NOT ACTIVE PROJECT AUTHORITY") and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present in all 39 records.
- Every evidence-block file path resolves to an existing file at the pinned commit: `CLAUDE.md`, `AGENTS.md`, `apps/api/**`, `manifests/**`, `config/env-manifest.yaml`, `docs/**`, `archive/sessions/**`, `handoff/**`, `packages/mcp-server/package.json`, and `docs/decisions/records/DEC-20260422-A--git-3b256587.md` (cited by DEC-20260416-A) all exist. Evidence URLs (Notion pages, GitHub commit/PR links) were not individually filesystem-checked except where cited as a code claim (see below); one spot-checked commit SHA (`a2b8d69e996041bb9a21b6541918e89f4e4cef8c`, DEC-20260423-A) resolves.
- Every `relations[].target` in the partition (DEC-20260415-A, DEC-20260421-J, DEC-20260320-B, DEC-20260423-A, DEC-20260425-B, DEC-20260422-C, DEC-20260427-A, DEC-20260428-A, DEC-20260428-B, DEC-20260424-A, DEC-20260503-B, DEC-20260505-H, DEC-20260506-G, DEC-20260504-B, DEC-20260515-B, DEC-20260507-F) exists as a record file at the pinned commit, is substantiated in the citing record's own prose (each relation is backed by an explicit sentence naming the target and what the relation rests on: "amends", "supersedes", "affirms", "related_to" are each explained), and none is a bare id listed in `docs/decisions/id-collisions.yaml` (checked by grep against all sixteen distinct targets: zero matches).

## Null-field / populated-field verification

Pulled ten Notion rows directly (`dump_rows.py PAGE:<id>`) and cross-checked null-field and populated-field claims:

- DEC-20260413-A: row confirms `Outcome` and `Superseded By` both null, matching the record's Reversal-conditions claim.
- DEC-20260415-A and DEC-20260415-B: same null-field pattern confirmed for both.
- DEC-20260416-A: row's `Source` field is populated (`https://www.notion.so/34267c87082c81778568e9606826b243`), not null -- the record's Context claims exactly this ("The row's own `Source` field cites a further Notion page... not one of this batch's six target rows and not read for this record"), confirmed accurate. The row's `Rationale` field text matches the record's Rationale section content.
- DEC-20260422-D: row's `Rationale` field is null, `Source` field is null, `Confidence` is `"high"`. The record's "Source: <url>. Confidence: high." line in Context is the record's own citation-format convention (used identically across most records in this partition) pairing the evidence URL with the row's actual `Confidence` value, not a claim that the row's own `Source` property holds that URL string; it is not a mis-description of a null field as populated.
- DEC-20260422-H: row's `date:Expiry Date:start` is `"2026-05-31"`, matching the record's Context claim exactly; `Rationale`, `Outcome`, `Superseded By`, `Source` all null, matching the record's claims.
- DEC-20260503-B: row's `Rationale`, `Source`, `Related Feature`, `Outcome`, `Superseded By` are all null, matching the record's Context claim ("Its Source, Related Feature, Outcome, and Superseded By fields are all null").
- DEC-20260505-A, DEC-20260505-B, DEC-20260505-C: each row confirms `Superseded By` and `Outcome` both null, matching each record's Reversal-conditions claim.

No case of a null field quoted as if populated, or a populated field called null, was found.

## Code-claim spot checks (eleven, exceeding the required ten)

1. DEC-20260419-A -- `apps/api/scripts/console-allowlist.json` has exactly 24 top-level keys, and `"apps/api/src/index.ts": 8` (reduced from 10). Confirmed by reading the file.
2. DEC-20260420-A -- `apps/api/package.json` carries no `db:generate`/`db:migrate`/`db:push` script. Confirmed (`grep '"db:'` returns nothing).
3. DEC-20260421-J -- `apps/api/scripts/archive/drop-sg-kyb.ts` and `manifests/singapore-company-data.yaml` both exist; `apps/api/src/capabilities/auto-register.ts:108` carries a "REACTIVATED 2026-04-29" comment for `singapore-company-data`, not a DEACTIVATED entry. Confirmed.
4. DEC-20260421-L -- `apps/api/scripts/archive/park-company-intelligence-sdr.ts` and `apps/api/scripts/archive/phase-dec-b-park.ts` both exist. Confirmed.
5. DEC-20260422-B -- `apps/api/src/capabilities/auto-register.ts:32` still lists `["amazon-price", "Amazon CAPTCHA blocks datacenter IPs"]`. Confirmed.
6. DEC-20260425-A -- `apps/api/src/lib/provenance-builder.ts:248` carries the "NOT YET captured (chunk 1.5 follow-up)" comment. Confirmed.
7. DEC-20260425-B -- `apps/api/src/lib/processing-location.ts` implements the exact three-step fallback (`RAILWAY_REPLICA_REGION` -> `STRALE_PROCESSING_REGION` -> `"unknown"` with a one-time warn). Confirmed by reading lines 1-40.
8. DEC-20260427-H -- `apps/api/src/capabilities/auto-register.ts` carries all five `DEC-20260427-H-1` through `-H-5` comments at the cited slugs (lines 154, 205, 214, 223, 232). Confirmed.
9. DEC-20260427-I -- none of `dutch-company-data`, `portuguese-company-data`, `lithuanian-company-data`, `spanish-company-data`, `german-company-data`, `austrian-company-data` appears in the DEACTIVATED map; `apps/api/src/capabilities/austrian-company-data.ts:35` defines `FBW_ENDPOINT = "https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws"`. Confirmed.
10. DEC-20260503-B -- `apps/api/src/db/schema.ts` still declares `qpScore`, `rpScore`, `matrixSqs`, `matrixSqsRaw` (lines 220-224) and a full `sqs_daily_snapshot` table (line 1003 onward). Confirmed still present (PR2 not shipped, as the record itself states).
11. DEC-20260507-G / DEC-20260507-H -- `config/env-manifest.yaml`'s `OPENAPI_COM_EMAIL` row states "backing 10 EU country capabilities" (line 768) and `OPENAPI_ENABLED`'s `cost_note` (line 776) confirms it is gated off pending the resale addendum; `manifests/bulgarian-company-data.yaml`, `cypriot-company-data.yaml`, `luxembourgish-company-data.yaml`, `hungarian-company-data.yaml` all declare `data_source: Openapi.com WW-Top`, not the doctrine-clean direct paths the two records say were decided. Confirmed both records' divergence claims.

## Additional verifications beyond the minimum

- Commit SHAs cited as existing: `bd25bc57`, `be0c7888`, `b86d431a`, `d165ae2`, `31ca662e92d996d9d8a3ee150ce6f924d5419707`, `a2b8d69e996041bb9a21b6541918e89f4e4cef8c` all resolve at the pinned commit via `git cat-file -e`.
- Commit SHAs cited as NOT resolving (per the records' own honest disclosure): `972b860` (DEC-20260421-J), `2a1cc24` (DEC-20260421-L), `84398f7` (DEC-20260507-G and DEC-20260507-H) all fail `git cat-file -e` as the records themselves say.
- `DEC-20260813-A.md` (cited by DEC-20260427-H) does contain the quoted phrase citing `DEC-20260427-H-4` and `DEC-20260420-H` at lines 39-40, confirmed.
- `docs/decisions/id-collisions.yaml` confirms `DEC-20260420-E`, `DEC-20260420-F`, `DEC-20260420-H`, and `DEC-20260502-A` are all listed collided ids, supporting DEC-20260503-A's claim that its withheld relation targets are reused ids.
- DEC-20260430-A's Consequences claims `DEC-20260420-K`'s "display ID is an unresolved collision" and that `DEC-20260422-H` is "unique but unmigrated." Both are now false at the pinned commit (`DEC-20260420-K`'s id-collisions.yaml entry is `resolution_status: resolved`; `DEC-20260422-H.md` is a migrated bare-keyed record -- it is in this very partition). Per this round's rule (a), this is not a new finding: `DEC-20260905-G` (item 6, "Relation to `DEC-20260430-A`") already withdraws exactly this "unresolved collision"/"unmigrated" characterization by name, citing the same two facts I independently verified (the collision registry entry and the existence of `DEC-20260422-H.md`), plus the archive resolution report `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-K.md`, which flags the same gap. I checked that DEC-20260905-G's correction is itself correct (it is) rather than accepting it on faith. DEC-20260422-H.md itself quotes this same sentence from DEC-20260430-A as cited evidence, which DEC-20260905-G separately confirms remains a faithful quotation of what DEC-20260430-A says, not a fresh defect in DEC-20260422-H.

## Unverifiable

- The five commit URLs cited as evidence on DEC-20260423-A were only spot-checked for one (`a2b8d69e...`); the remaining four (`850d44f5...`, `94b2078c...`, `fc96a401...`, `73395b47...`) were not individually confirmed to resolve as commit objects, though nothing in the record's own text depended on disproving them and the checker found no quote-fidelity issue tied to them.
- Several records (DEC-20260427-I, DEC-20260429-A, DEC-20260430-A, DEC-20260505-C) explicitly decline to assert current state on some downstream fact (e.g. the 15 paused KYB solutions' current `is_active` status, the 3 flagged Singapore solutions' investigation outcome) and this review did not independently resolve those either -- this matches the records' own stated scope limits, not a gap in this review.

## Partition verdict

PARTITION VERDICT: PASS

### Partition P4

# Closing review, round 13, partition P4

Partition: P4. Commit: c268565abd03aaae48eade48567dc2627a24955a. Record count: 41.

Files reviewed (relative to `docs/decisions/records/`): DEC-20260507-I.md,
DEC-20260507-J.md, DEC-20260508-A.md, DEC-20260508-D.md, DEC-20260510-A.md,
DEC-20260511-B.md, DEC-20260511-C.md, DEC-20260511-D.md, DEC-20260511-E.md,
DEC-20260511-F.md, DEC-20260513-A.md, DEC-20260513-B.md, DEC-20260513-C.md,
DEC-20260513-D.md, DEC-20260513-E.md, DEC-20260515-A.md, DEC-20260515-B.md,
DEC-20260515-C.md, DEC-20260517-A.md, DEC-20260518-A.md, DEC-20260518-B.md,
DEC-20260518-C.md, DEC-20260518-D.md, DEC-20260518-E.md, DEC-20260518-F.md,
DEC-20260518-G.md, DEC-20260812-A.md, DEC-20260813-A.md, DEC-20260815-A.md,
DEC-20260820-A-WEBSITE-HERO.md, DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md,
DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md,
DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md,
DEC-20260820-E-WEBSITE-SEARCH-WEB.md, DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md,
DEC-20260822-A.md, DEC-20260827-A.md, DEC-20260831-A.md, DEC-20260901-A.md,
DEC-20260904-A.md, DEC-20260904-B.md. None is a `--notion-` or `--git-`
qualified key, so check (8) does not apply to this partition.

Setup: `git worktree add --detach` at the pinned commit inside this agent's own
isolated worktree (`git checkout --detach` was used instead, per this task's
own setup instructions, since the worktree was already isolated), `npm ci`
completed clean, no edits or commits made, read-only throughout.

## Method

For every record: (1) parsed frontmatter and diffed `record_key`, `id` and the
filename programmatically (a small Node script over the whole partition);
(2) counted `## Decision`, `## Context`, `## Rationale`, `## Consequences`,
`## Reversal conditions` headings and CAUTION banners per file; (3) ran the
operator checker (below) for double-quoted-span fidelity, then read every
record in full and manually verified the spans, code claims and cross-repo
citations the checker cannot reach (directory-level evidence entries, Notion
row fields, git commit existence); (5) checked every evidence entry: URLs
skipped, repository paths checked with `fs.existsSync` at HEAD, commit-hash
evidence entries checked with `git cat-file -e`, cross-repo entries checked
against `strale-io/strale-frontend` after `git fetch origin`; (6) extracted
every `target:` relation programmatically, confirmed each target file exists,
cross-checked against `docs/decisions/id-collisions.yaml`'s collided-id list
for bare-collision use, and read the body prose around each relation to
confirm it is substantiated; (7) verified one or more "status on" code claims
for at least ten records by reading the named files directly (12 verified,
listed below).

Script used for the operator checker:
`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 --only <each of the 41 files>`.
Logic in one sentence: for every double-quoted span of at least 12 characters
in a record's body, transliterate (EUR/x/>=/<=/->/...), lowercase, strip all
non-alphanumeric characters, split on an internal ellipsis into ordered
segments, and check whether every segment is a substring, in order, of the
same-normalized text of the record's evidence sources (Notion export, sibling
records, or the named repo file); report anything that fails as a residual.

### Operator checker output and classification

Totals: 41 records, 118 spans, 112 faithful, 6 residual. All 6 residuals are
checker misses (the quoted text is faithful to a source the checker's
file-vs-file pass did not fetch or resolve), not defects:

1. `DEC-20260518-A.md:100` -- `"Evidence Tier 1/2/3"`. This is the record's own
   search term ("no `evidence_tier` field or 'Evidence Tier 1/2/3' label was
   found anywhere in code, manifests, or `docs/company/claims.yaml`"), not a
   quotation attributed to any source. Own wording, not a quotation
   (DEC-20260905-M's clause).
2. `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md:26` -- `"The burden
   collapses"`. Checker miss: the evidence entry is a directory
   (`strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/`), not
   a specific file, so the checker could not resolve it. Verified directly:
   `strale-frontend` at `f704cb2a68f014bd049dd0083911050396e753aa`,
   `docs/website-redesign/homepage/integration-burden-v1.3.md`: "Adopt **The
   burden collapses** as the second homepage section." Faithful.
3. `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md:28` -- `"Selection
   Violet"`. Same directory-evidence limitation. Verified in
   `use-case-enrichment-validation-v1.5.md`: "Selection Violet is the
   dominant atmospheric family." Faithful.
4-5. `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:28,63` -- `"not a live ranking"`
   (x2). Same limitation. Verified in
   `use-case-search-web-intelligence-v1.6.md`: the card is labelled
   "**Documented output example**" and "**not a live ranking**." Faithful.
6. `DEC-20260904-A.md:180` -- the long "Every row reaches formally_migrated..."
   quote attributed to "G1's `closes_when` clause in the M2 closure register."
   Verified against `docs/project/m2-closure-register.yaml:5179-5181`: text
   matches exactly (word for word, modulo the record's own bold markdown).
   Faithful; the checker missed it because that file is not passed as
   `--export`/`--frontend` and is not one of this record's `evidence:` array
   entries, only named in prose.

## Findings

None. No false, fabricated, misattributed or unverifiable statement found in
this partition at this commit.

Two passages in this partition's records repeat statements that earlier
rounds' withdrawal records (`DEC-20260905-B` through `-N`) already withdrew by
name, and per this round's rule (a) these are not findings against the
original records -- I re-verified each underlying withdrawal is itself
correct:

- `DEC-20260508-A.md:78` quotes "the prior row's 'no Tier-1 path exists'
  finding is corrected to 'a Tier-1 path exists but has a fixed floor'" as if
  from `DEC-20260507-H`. `DEC-20260905-I` (item 8) withdraws this as a
  composite/misattributed quotation. Verified: `DEC-20260507-H.md` reads
  "neither country had a Tier-1 doctrine-clean v1-economic path" (a different
  form), and the Notion row's Rationale (page
  `35967c87082c8144bb94c56b63478754`) reads "neither country has a Tier-1
  doctrine-clean v1-economic path." Neither phrase the record quotes is a
  substring of either. `DEC-20260905-I`'s correction is itself accurate.
- `DEC-20260510-A.md` cites "244 files (217 with a recorded intent, 27
  without)" from `handoff/README.md`. At c268565a that file now reads "287
  files (260 with a recorded intent, 27 without)" -- the figure has moved
  again since `DEC-20260905-B`'s own withdrawal (which cited 257/230 at a
  different commit). Per rule (e) this is a dated observation that keeps
  moving with unrelated work, not a fresh finding, and the record itself
  already hedges ("a count that moves with every handoff... cites it only as
  of this verification").
- `DEC-20260511-C.md` quotes "CC does not reconcile silently" as coming from
  "the 2026-05-13 cleanup prompt." `DEC-20260905-B` (item 6) withdraws this
  attribution (the phrase is verbatim only in an unrelated 2026-05-06 halt
  report). Re-verified: correct, not a fresh finding.
- `DEC-20260515-A.md` and `DEC-20260515-B.md` both discuss commit `34036a0`;
  `DEC-20260515-A.md`'s Consequences section states "the commit id this row
  cites, `34036a0`, does not resolve on `main`," which `DEC-20260905-C` (item
  40) withdraws as belonging to the sibling row `DEC-20260515-B`, not this
  row (`DEC-20260515-A`'s own Rationale/Source fields name no commit id).
  Verified against both Notion rows (`36167c87082c8199bbc9e65480db6f80`
  Rationale, `36167c87082c814281dcd2dac911efa0` Source): correct.
  `DEC-20260515-C.md` independently makes the identical, correctly-scoped
  claim about its own commit `8eb8c0e`, confirmed non-resolving
  (`git cat-file -e 8eb8c0e` fails) -- that one is this record's own claim,
  not carried from a sibling, and is faithful.
- `DEC-20260515-C.md:96` quotes the manifest's reactivation trigger as "a
  paid AJPES restPrsInfo contract with redistribution rights..."
  `DEC-20260905-D` (item 18) withdraws the inserted "a": the manifest
  (`manifests/slovenian-company-data.yaml:135-136`) reads "Reactivation
  trigger: paid AJPES restPrsInfo contract..." with no leading "a". Verified;
  correct.

## Ten-plus code-claim spot checks

1. `DEC-20260507-I.md` -- `docs/company/VOICE.md` is 57 lines with no numbered
   sections. `wc -l docs/company/VOICE.md` = 57. Confirmed.
2. `DEC-20260507-J.md` -- `recordFailure(` has exactly four call sites, all in
   `apps/api/src/routes/do.ts`; `test-runner.ts` calls `recordTestEvidence`
   instead and its own comment states the Phase 3 Harden Fix B rationale
   verbatim. `grep -rn "recordFailure("` confirms 4 calls in `do.ts` (plus
   the definition in `circuit-breaker.ts` and comments elsewhere, no other
   calls); `test-runner.ts:844-847` carries the quoted comment. Confirmed.
3. `DEC-20260508-A.md` -- `manifests/hungarian-company-data.yaml` uses
   Openapi.com WW-Top, gated on `OPENAPI_ENABLED`, added in commit `9ee19282`
   dated 2026-05-16 (eight days after the row). `git log -1 --format="%ci"
   9ee19282` = 2026-05-16 15:13:15 +0200. Confirmed.
4. `DEC-20260508-D.md` -- `german-company-data.ts` fetches
   `https://api.openregister.de` using `OPENREGISTER_API_KEY`; the
   env-manifest row records `holder: railway`, `required_in: [production]`.
   Confirmed by direct grep of both files.
5. `DEC-20260510-A.md` -- `handoff/README.md`'s auto-generated-index header
   text matches verbatim ("Regenerated by `npm run archive:index`...Do not
   edit by hand."); `docs/programs/cto-readiness/PROGRAM.md` names T15
   "Receipts and migration ledger" with the quoted rule. Confirmed.
6. `DEC-20260511-B.md` -- both `runMigration0066_ensureEligibilityColumnAndReconcile`
   and `runMigration0069_reconcileEligibilityFromCostClass` exist and are
   registered in `startup-migrations.ts`. Confirmed.
7. `DEC-20260511-C.md` -- `apps/api/drizzle.config.ts` exists again,
   `drizzle-kit` is a devDependency in `apps/api/package.json`, no
   `db:generate`/`db:migrate`/`db:push` scripts, `apps/api/drizzle/` absent.
   All four confirmed by direct file checks.
8. `DEC-20260511-E.md` -- `meta-monitoring.ts`'s staleness-anchor comment
   matches verbatim; `checkValidationQueueStuck` and `checkProbationTimeout`
   both exist and are registered at `daily` schedule. Confirmed.
9. `DEC-20260511-F.md` -- `daily-digest.ts`'s header is a manual `npx tsx`
   usage line, not a scheduled job; `test-scheduler.ts`'s "Weekly digest
   scheduling lived in the deleted block..." comment exists; the npm
   `"digest"` script and `POST /v1/admin/digest` route both exist;
   `sendInterruptEmail` has zero callers outside its own definition file.
   All confirmed by direct grep.
10. `DEC-20260513-B.md` -- `manifests/swiss-company-data.yaml`'s
    `known_answer.input.uid` is `CHE-101.602.521`; `capability_health`'s
    schema has only a `state` column, no `pinned`/`manual_override` column;
    `POST /v1/admin/reset-circuit-breaker` exists. All confirmed.
11. `DEC-20260518-D.md` -- `danish-company-data.ts` sets
    `ubo_availability = "unavailable_no_registry"` with the exact reason
    string quoted; `uk-company-data.ts` sets `"available"` with its exact
    reason string. Confirmed byte-for-byte.
12. `DEC-20260827-A.md` -- `manifests/austrian-company-data.yaml` has
    `price_cents: 5` and `data_source: Firmenbuch (Republik Österreich, BMJ)
    via JustizOnline IWG/HVD API`; no `DEC-20260427-I-6` record or register
    entry exists anywhere in this repository. Confirmed.

Also spot-verified (not required, done in the course of quote checks):
`DEC-20260513-C.md`'s `slugStaggerMinute`/`findOverdueSuites` comments in
`test-scheduler.ts` (confirmed, including the cross-citation discrepancy the
record itself flags honestly); `DEC-20260513-D.md`'s
`danish-company-data.yaml` manifest content (confirmed); `DEC-20260513-E.md`'s
manifest prices and CHARTER.md pricing band (confirmed); `DEC-20260518-B.md`'s
grep claims for "use_case_tier", "Enhanced Due Diligence" and "Continuity"
(confirmed case-insensitively -- my first case-sensitive grep pass under-
matched, corrected on retry); `DEC-20260518-C.md`'s Digiteal/SEPA-VoP absence
and PR #131 merge (confirmed); `DEC-20260812-A.md`'s `id-collisions.yaml`
DEC-20260502-A collision entry (confirmed); `DEC-20260813-A.md` prose
(confirmed, no quotes); `DEC-20260820-A/C/F` cross-repo quotes against
`strale-frontend` (confirmed, see residuals above); `DEC-20260822-A.md`'s
claim about `production-authority.ts` and the SYSTEM_ACTING/FOUNDER_DECISION/
AUTHORIZATION_UNAVAILABLE vocabulary -- verified this is intentional: those
three names are not literal exports of `production-authority.ts` but are
explicitly documented and tested as "names for shapes, not symbols" in
`apps/api/src/lib/charter-authorization-binding.test.ts` (the actual literal
strings live in `ceo-brief-lint.ts`), so CLAUDE.md's and the record's phrasing
("shapes enforced by...") is accurate, not a defect; `DEC-20260904-B.md`'s
regex and finding-code claims against `scripts/decision-records-lib.mjs` and
`scripts/m2-closure-register-lib.mjs` (all confirmed verbatim, including the
exact regex string).

## Structural checks (all 41 records)

- Frontmatter parses; `record_key`, `id`, and filename agree for all 41 (a
  small Node script diffed all three; zero mismatches).
- All 41 have exactly the five protected sections (`## Decision`, `##
  Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`) and
  exactly one CAUTION banner.
- Every evidence entry that is a repository path resolves with
  `fs.existsSync` at c268565a; every commit-hash evidence entry (`
  strale-io/strale@<sha>`, `codex/repo-native-operating-model@<sha>:<path>`,
  and the bare `https://github.com/strale-io/strale/commit/<sha>` entries in
  DEC-20260517-A, DEC-20260822-A) resolves with `git cat-file -e`; every
  cross-repo `strale-io/strale-frontend@f704cb2:<path>` entry resolves with
  `git cat-file -e f704cb2a68f014bd049dd0083911050396e753aa:<path>` after
  fetching the sibling repo. No missing evidence.
- Relations: every `target:` in this partition resolves to an existing
  record file at c268565a (programmatic check, zero misses); none is a bare
  collided id from `docs/decisions/id-collisions.yaml`'s 35 collision ids;
  every relation is substantiated in body prose (each target is mentioned
  and its basis explained at least once beyond the frontmatter, verified by
  reading the surrounding paragraph for each).
- No null field is quoted and no populated field called null, checked
  against the Notion export for every record whose evidence[0] resolves to a
  Notion page id (spot-verified via `dump_rows.py` for
  DEC-20260507-I/J/508-A/508-D/510-A/515-A/515-B; all null-field claims in
  the records matched the parsed export's null-field list exactly).

## Unverifiable

None. Every claim in this partition that could be checked against a named
source was checked; no claim was left unverified.

PARTITION VERDICT: PASS

### Partition P5

# Closing review round 13, partition P5

Commit reviewed: c268565abd03aaae48eade48567dc2627a24955a
Record count: 34 (all `--notion-` qualified, all resolved collisions: DEC-20260225-P-c5d6, DEC-20260303-A, DEC-20260304-A, DEC-20260304-B, DEC-20260304-C, DEC-20260320-C, DEC-20260320-J, DEC-20260320-K, DEC-20260405-B, DEC-20260406-A, DEC-20260406-B, DEC-20260406-C, DEC-20260409-C, DEC-20260420-D, DEC-20260420-E, DEC-20260420-F, DEC-20260420-G, DEC-20260420-H -- two formal records each)

Setup: fetched origin, `git checkout --detach c268565a...` in this session's own isolated worktree (`.claude/worktrees/agent-a39e2f86aa9482102`), `npm ci` completed clean. Notion rows read only via `dump_rows.py` (35 page ids for my 34 records, plus DEC-20260420-I referenced in prose). Cross-repo evidence resolved against `strale-frontend`, fetched first.

## Script used

`node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend <strale-frontend> --min-chars 12 --only <each of my 34 files>`. Logic in one sentence: for every double-quoted span of normalized length >= 12 in a record's body, it normalizes (EUR/x/>=/<=/->/... transliteration, lowercase, strip non-alphanumerics) and checks whether the span is a substring (or, for an ellipsis-split span, ordered non-contiguous substrings) of any candidate source: the record's own Notion row(s), its repo-path evidence, CLAUDE.md/AGENTS.md, every other decision record's full text, frontend evidence at the pinned sha, and commit messages mentioned nearby.

Result: **34 records, 243 spans, 243 faithful, 0 residual.** No residual list to classify for this partition.

I also wrote three small ad hoc scripts (deleted after use, working tree left clean) to check frontmatter/id/filename agreement, evidence-path and relation-target existence, and id-collisions.yaml / m2-closure-register.yaml binding consistency across all 34 records at once; all passed for every record (details under Findings below).

## Checker miss (found by manual reading, not reported as a residual by the checker)

The checker's design includes "every other record's own text" as a generic candidate source for any quoted span (item (e) in `gatherSourcesForRecord`). Two records in my partition contain a quotation that does NOT match its true attributed source (`apps/api/src/lib/trust-grade.ts`, and `docs/company/VOICE.md`) but DOES match because a *different*, later record (`DEC-20260905-C.md`) happens to reproduce the identical defective wording while describing its own withdrawal of it. This makes the checker mark these two spans "faithful" when, against their actually-attributed source, they are not verbatim. Both are pre-existing, already-withdrawn defects (see Findings 1 and 2 below), not new problems, so the checker miss has no practical consequence for this round's verdict -- but it is worth flagging since the checker's "0 residual" reading of my partition would otherwise look stronger than warranted for these two spans specifically.

## Findings

None of the following are findings against the original records: per rule (a) of this round's instructions, a statement withdrawn by DEC-20260905-B through -N is corrected, not a defect, unless the correction is itself wrong. I checked every correction below against the actual source and found all of them accurate.

1. `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md` (line 93) quotes `apps/api/src/lib/trust-grade.ts` as computing a grade "the worst of (SQS grade, freshness grade, latency grade)" and, two lines later, a label reading "Reference data (stale: Nd since update, cycle Nd)." Fact, verified directly against `trust-grade.ts:211` and `:89`: the source reads "worst of (SQS grade, freshness grade, latency grade)" (no "the") and the label is a template literal, not the literal string "Nd". **Already withdrawn** by `DEC-20260905-C.md:92-93` (item 12 is a different record; the actual withdrawal is item 11, lines ~810-816, "withdraws 'the worst of...', 'Reference data (stale: Nd...)' and the inserted 'the'") and independently corroborated by `DEC-20260905-J.md` item 6. Correction verified accurate against `trust-grade.ts` directly.

2. `DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md` (Consequences) quotes `docs/company/VOICE.md` as stating five writing rules including "No jargon, ever," and as "verified on 2026-09-05, against `main`." Fact, verified directly against `docs/company/VOICE.md:12`: the first rule reads "Use audience-appropriate terms (DEC-20260905-A)." -- "No jargon, ever" does not appear anywhere in the file. **Already withdrawn** by `DEC-20260905-C.md` item 31 (lines 513-524), which names the exact same-day edit and the correct current first rule; I verified that correction against `VOICE.md` directly and it is accurate.

3. `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md` quotes `DEC-20260420-I` as attributing a "direct connections only. No scraping. Full ToS compliance with every provider" doctrine to `DEC-20260420-H`, dropping the word "data" before "connections." Fact, verified directly against the Notion row for `DEC-20260420-I` (page `34867c87082c81c8b9d4c6b5568bbcef`, dumped via `dump_rows.py`): the row's own Rationale reads "direct data connections only. No scraping. Full ToS compliance with every provider." **Already withdrawn** by `DEC-20260905-C.md` items 36-37 (lines 576-596), which also note the sibling record in this same collision (`DEC-20260420-H--notion-...c6a58dfbc5f46ed3f6.md`, also in my partition) quotes the identical source correctly with "data" included -- I confirmed that sibling record does include "data" at the corresponding quote.

4. `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md` (Context section) characterizes "the SA.2 + F-A series" as "the row's own subject," and separately describes `DEC-20260420-I` as "itself an unresolved collision id in a later G2 batch." Fact: the row's own Rationale (page `34867c87082c81c6a58dfbc5f46ed3f6`) reads "Prior DECs: DEC-20260420-A through DEC-20260420-G (**complete** SA.2 + F-A series)" -- the phrase is "complete SA.2 + F-A series," not an independently-occurring "the SA.2 + F-A series." **Already withdrawn**: the "SA.2 + F-A series" misquotation is withdrawn by `DEC-20260905-J.md` item 21 (lines 429-441); the "unresolved collision id in a later G2 batch" mischaracterization of `DEC-20260420-I` is withdrawn by `DEC-20260905-G.md` item 5 (lines 156-175) and its Relation-to paragraph (lines 433-435). Both corrections verified consistent with `docs/decisions/id-collisions.yaml` (`DEC-20260420-I` is listed there, `resolution_status: resolved`, not unresolved) and with each other.

No other findings. All 34 records:
- Parse correctly; `record_key`, `id`, and filename agree (verified programmatically for all 34: bare id matches the part of `record_key` before `--notion-`, and `record_key` equals the filename minus `.md`).
- Carry the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) -- verified by grepping `## ` headers in all 34 files.
- Have every `evidence` entry resolving: repo-path entries all exist at this commit (verified programmatically); the 14 `strale-io/strale-frontend@04c9fca9:...` cross-repo entries were individually resolved with `git show 04c9fca9:<path>` in the fetched sibling checkout and all returned content; Notion URLs match evidence[0]'s page id.
- Have no missing relation targets: `DEC-20260320-C--notion-...bfa5d1ee04b7d753dc.md` -> `DEC-20260320-B` (exists, substantiated by a quoted Rationale sentence naming it); `DEC-20260406-A--notion-...816b825cdf812ef006b8.md` -> `DEC-20260405-B--notion-...810c920dd09d78aa06b6` (exists, substantiated, and explicitly reasoned as the correct one of the two same-ID rows since the other concerns an unrelated capability); `DEC-20260406-C--notion-...814b8afafb2e1c6ca317.md` -> `DEC-20260406-B--notion-...81629339d9f208f65f52` (exists, substantiated by quoted Rationale); `DEC-20260409-C--notion-...33d67c87082c81c19655cb04fb7d3ecf.md` -> `DEC-20260409-A`, `DEC-20260409-B` (both exist, bare ids, not collided); `DEC-20260420-D` through `-H` records' `related_to DEC-20260420-A` (exists, bare id, not collided) and their qualified same-collision cross-references (all exist as record keys). No relation target is a bare collided id (cross-checked every target against `docs/decisions/id-collisions.yaml`'s 35 collided ids: none of the used targets -- `DEC-20260320-B`, `DEC-20260405-B--notion-...`, `DEC-20260406-B--notion-...`, `DEC-20260409-A`, `DEC-20260409-B`, `DEC-20260420-A`, and the several `DEC-20260420-{D,E,F,G}--notion-...` keys -- is a bare id).
- Have no null field quoted as populated, and no populated field called null (cross-checked every "field X is null" and "Rationale reads Y" claim against the `dump_rows.py` dump for all 35 page ids touching this partition: `DEC-20260405-B--notion-...34a67c87082c810692c8dd4374a6f9ac` (credit-report-summary), `DEC-20260420-E--notion-...34867c87082c81d5a898f48cc1554086`, `DEC-20260420-F--notion-...810b8df1e8e459039d35`, `DEC-20260420-G--notion-...81dcafe3dea59cc119b1`, and `DEC-20260420-H--notion-...81b58b36de5f71c0937f` all correctly describe Rationale/Outcome/Source as null; every other record's quoted Rationale text matches the row field verbatim).
- Are correctly bound in `docs/decisions/id-collisions.yaml` and `docs/project/m2-closure-register.yaml`: for all 34, the collision entry's matching record carries `disposition: formal_record` with the matching `record_key`, and the register's `decision_rows` entry for that page id carries `disposition: formally_migrated`, `collision.row_disposition: formal_record`, and the same `record_key` (verified programmatically for all 34, zero mismatches).

## Checker residuals for my partition

None (0 of 243 spans flagged). See "Checker miss" section above for two spans the checker marked faithful that a manual read shows are not faithful to their true attributed source -- both are pre-existing, already-withdrawn defects (Findings 1 and 2), not fresh problems.

## Ten code-claim spot checks (file, line)

1. `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md:1085-1088` ("previous filesystem-glob discovery pulled in test files...") -- verified verbatim against `apps/api/src/capabilities/auto-register.ts:18-21`.
2. `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md:1195` (env var renamed to `ABN_LOOKUP_GUID`) -- verified against `apps/api/src/capabilities/au-company-data.ts:4,17,20` and `config/env-manifest.yaml:20`.
3. `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md:64-79` (`failedRequests` table + 4 insert call sites) -- verified against `apps/api/src/db/schema.ts:678-681` and `apps/api/src/routes/do.ts` (4 `db.insert(failedRequests)` call sites).
4. `DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md` (VOICE.md rules) -- checked against `docs/company/VOICE.md`; found the defect described in Finding 2 above (already withdrawn).
5. `DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:2976-2984` (audit-token.ts / audit.ts comments) -- verified verbatim against `apps/api/src/lib/audit-token.ts:21,43,100` and `apps/api/src/routes/audit.ts:419,446`.
6. `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:3181-3187` (verify.ts MAX_DEPTH, rate-limit, truncated_reason comments) -- verified verbatim against `apps/api/src/routes/verify.ts:19,24,29,218,256,362`.
7. `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:2661-2670` (`PII_CATEGORY_ENUM`, `processes_personal_data is required` unconditional) -- verified against `apps/api/src/lib/onboarding-gates.ts:242-259,369`; found the already-withdrawn 12-vs-14-value defect (matches `DEC-20260905-C.md` item 34, which I independently verified accurate).
8. `DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:2780-2783` (transactions.ts F-A-005 comments) -- verified verbatim against `apps/api/src/routes/transactions.ts:142,168`.
9. `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:3526-3531` (`onboard.ts` `ai_assisted` mapping, `--force`, `--force-override-authority`) -- verified against `apps/api/scripts/onboard.ts:94-108,137-153`.
10. `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md:91-94` (trust-grade.ts "worst of" comment and label) -- verified against `apps/api/src/lib/trust-grade.ts:89,211`; found the already-withdrawn defect (Finding 1).
11. `DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md:1581-1587,1594-1597` (CLAUDE.md free-tier list and SQS-engine-deleted quotes) -- verified verbatim against `CLAUDE.md:341,339`.
12. `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md:1915-1917` (`solution-executor.ts` `StepTiming`/timing push) -- verified against `apps/api/src/lib/solution-executor.ts:217,219,413,518` (field names match; the exact push-site literal timing value differs by call site, consistent with the row's own general description, not a quoted literal).
13. `DEC-20260420-D` / `DEC-20260420-H` (`apps/api/src/lib/audit-helpers.ts` "SA.2b.d: heuristic ... removed after migration 0050") -- verified verbatim against `audit-helpers.ts:40`.

## Unverifiable

Nothing in this partition was left unverifiable. The two Notion pages referenced only in prose (`31967c87082c816d9d44cd4317386a30`, the shared Discovery & Navigation spec page, and `33a67c87082c812d8ebdc1899526dd83`, the Working Rules page) are not Decisions-database rows -- `dump_rows.py` correctly returned no match for them (35 requested, 35 selected against the 35 actual Decisions rows plus DEC-20260420-I; these two are cited only as non-Decisions Source links, never as attributed quotations), consistent with how the records themselves describe them ("a shared specification page," "the Working Rules page").

PARTITION VERDICT: PASS

### Partition P6

# Closing review, round 13 (final round), partition P6

Commit reviewed: c268565abd03aaae48eade48567dc2627a24955a
Record count: 45 (32 formal candidate records under `docs/decisions/records/`, of which 12 are duplicate-id-collision qualified pairs/triples covering 12 distinct historical ids, plus the 13 amending records DEC-20260905-B through DEC-20260905-N)

Setup: `git worktree add --detach C:/tmp/strale-closing13-P6 c268565abd03aaae48eade48567dc2627a24955a`, `npm ci` (completed cleanly), reviewed read-only, no edits made. Worktree not yet removed at time of writing this report (will be removed after this report is filed, per instructions).

## Script used

Ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with `--only <file>` for every file in my partition list (45 `--only` flags in one invocation). The checker extracts every double-quoted span of 12+ normalized characters, normalizes both the span and every candidate source (transliterate €→EUR, ×→x, ≥→>=, ≤→<=, →→->, …→..., lowercase, strip non-alphanumeric characters), and reports a span as "faithful" if its normalized form is a substring of some candidate source (a repository file, a record, or a parsed Notion row), else lists it as a residual with its best partial-match guess. Total: 824 spans checked across my 45 files, 732 faithful, 92 residual on first pass (later reconciled below).

Beyond the checker, every record was read in full by hand; every quotation, evidence path, relation target, and a large sample of "status on" code/file claims (far more than the required ten) were verified by direct read/grep against the pinned commit, the sibling `strale-frontend` checkout, or the parsed Notion export via `dump_rows.py`.

## Residual-mismatch list and classification

- `docs/decisions/records/DEC-20260905-C.md`: 83 residuals. All are self-referential parsing artifacts: `DEC-20260905-C.md` is itself a document about quotations, structured as repeating `"<quote>" ... Fact: ... reads "<quote>"` sentences; an escaped quote at `DEC-20260905-C.md:373` desyncs the checker's quote-pairing for every subsequent span in the file, so the checker's span boundaries land in connective prose ("to `CLAUDE.md`. Fact: `CLAUDE.md`'s DEC-20260812-A entry reads only", etc.) rather than on real quotations. This is explicitly documented and quantified by `DEC-20260905-D`, `-F`, `-G`, `-H`, and `-I`'s own reconciliation sections (which consistently report ~82 such residuals for this file). **Classification: checker misses, naming the withdrawn-from record (DEC-20260905-C itself) as its own source, not findings.**
- `docs/decisions/records/DEC-20260905-D.md`: 2 residuals (lines 429, 451: `"the checker missed it"` and `"checker miss, faithful to a source"`). Both are D's own rhetorical/methodology phrases describing its reconciliation process, not quotations of any external source. **Classification: own wording (DEC-20260905-M clause), not a finding.**
- `docs/decisions/records/DEC-20260905-F.md`: 6 residuals (e.g. lines 176, 213: `"not narrated at all"`, and the long sentence about "22 characters, three short of the checker's 25-character floor..."). All are F's own descriptive prose about its methodology, self-quoting itself or describing the reconciliation process. **Classification: own wording / checker misses, not findings.**
- `docs/decisions/records/DEC-20260905-G.md`: 1 residual (line 348: `"Rule (a) cross-check"`). This is G's own descriptive label for a table entry in the archived P3 round-6 report (`archive/sessions/2026-09-05-m2-closing-review-round-6.md`, whose actual section heading reads "Rule (a): statements withdrawn by DEC-20260905-B/-C/-D/-F", not "Rule (a) cross-check"). The substantive quoted content that follows it in the same sentence ("verified the record's own Context sentence... names both targets by unique subject matter... Substantiation accurate") IS a faithful, correctly-ellipsized match against that archive file (verified by direct read). The short label itself is a paraphrastic description, not a claim of exact wording, and asserts nothing false. **Classification: checker miss / borderline own-wording, not a finding** -- the underlying substantive quotation is faithful and the label names no false fact.

All other 43 files in my partition: 0 residuals at `--min-chars 12`.

## Numbered findings

1. **File:** `docs/decisions/records/DEC-20260905-D.md`, item 9 (heading at line 213, item body lines 215-225).
   **Claim:** "Both fields name 'government-registry' before 'API' and 'commercial' before 'aggregator'; the quotation drops both qualifiers, turning a specific sourcing requirement into a vaguer one," referring to the Decision and Rationale fields of the Notion row at page `34967c87082c81bd8c6bf8e92e901711` (`DEC-20260421-C`'s "no-scraping-commitment" row).
   **Evidence:** Dumped the row directly via `dump_rows.py PAGE:34967c87082c81bd8c6bf8e92e901711`. The row's **Decision** field reads in full: `"No scraping" positioning commitment promoted to v1 launch blocker. All 9 EU countries currently using Browserless+LLM scraping must be migrated to direct APIs or licensed aggregator contracts before launch.` -- this field contains neither "government-registry" nor "commercial" anywhere (confirmed by direct substring test: both `False`). Only the **Rationale** field contains those qualifiers ("...must migrate to a direct government-registry API or a licensed commercial aggregator before v1 launch"). `DEC-20260905-D`'s claim that "both fields" name these qualifiers is therefore false as literally stated; only one of the two fields does.
   **Note:** This does not disturb the underlying point that `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md`'s own Consequences-section quotation ("migrated to a direct API or a licensed aggregator") is a looser paraphrase than the row's own wording -- that part of the withdrawal item is directionally fine -- but the specific evidentiary claim about which field(s) carry the dropped qualifiers is wrong, and no later amending record (checked `DEC-20260905-E` through `-N`, none mentions "government-registry") corrects it.
   **Severity:** Small (a one-clause factual overstatement inside an amending record whose job is precision about exactly this kind of claim), but it is a false statement about repository/Notion-row state at the pinned commit, which the round's own convention treats as a defect regardless of size (see `DEC-20260905-I` item 18, `DEC-20260905-N` items 1-3, which correct comparably small errors).

No other findings. Every other quotation, evidence path, relation target, and code/file claim checked in this partition was verified faithful.

## Ten (of many more) code-claim spot checks performed

1. `apps/api/src/lib/onboarding-gates.ts:242-259` -- `PII_CATEGORY_ENUM` has 14 entries (12 original + `nationality`, `political_affiliation` added 2026-04-30) -- confirms `DEC-20260905-D` item 34.
2. `apps/api/src/index.ts:10` -- `const MIN_EXPECTED_EXECUTORS = 200;` and lines 19-30 implement the startup gate with `process.exit(1)` at lines 345-394 -- confirms `DEC-20260905-C` item 29.
3. `apps/api/src/lib/capability-persistence.ts:303,312,409` -- hook fires "OUTSIDE the transaction. Design doc §4.3" via post-commit `await onCapabilityCreated(slug);` -- confirms `DEC-20260421-A--notion-...babd...`/`DEC-20260421-B--notion-...dab7...`.
4. `apps/api/scripts/onboard.ts:137,149,153,1609-1619` -- `--force-override-authority` guard, refused in `--batch` mode and non-TTY -- confirms `DEC-20260421-D--notion-...a2a1...` and `DEC-20260905-D` item 34's neighbourhood.
5. `apps/api/src/lib/trust-grade.ts:211` -- `Combined grade = worst of (SQS grade, freshness grade, latency grade)` (no leading "the", "grade" repeated 3x) -- confirms `DEC-20260905-C` item 11/`DEC-20260905-J` items 6/12 withdrawals.
6. `apps/api/src/jobs/test-scheduler.ts:392,422,495` -- cost_class gates (`IN ('free_quota','paid_with_free_tier')`, `= 'free_unlimited' OR IS NULL`) -- confirms `DEC-20260512-A--notion-...8188...`.
7. `apps/api/src/lib/startup-migrations.ts:623,811,1130` -- "Block 0069: reconcile scheduled_testing_eligible from cost_class" -- confirms `DEC-20260512-A--notion-...8188...` and cross-checked against `CLAUDE.md`'s `external_cost_cents` description (the two mechanisms coexist, as the record itself flags).
8. `manifests/{italian,dutch,portuguese,spanish,austrian}-company-data.yaml` `data_source:` fields -- confirms `DEC-20260505-D--notion-...d389...`/`DEC-20260507-C--notion-...58c7...`/`DEC-20260508-C--notion-...7eb9...`/`DEC-20260512-A--notion-...29ef...` exactly.
9. `apps/api/src/capabilities/auto-register.ts:161-170` -- two separate "REACTIVATED 2026-05-16 (Phase 2a)" / "(Phase 2b)" comments, never combined "(Phase 2a/2b)" -- confirms `DEC-20260905-D` item 13.
10. `config/env-manifest.yaml:797-806` -- `OPENSANCTIONS_API_KEY` row's actual `purpose`/`cost_note` fields, and a corpus-wide count of 43 rows carrying the "Not set in production on 2026-09-02..." boilerplate -- confirms `DEC-20260905-E` item 2 and `DEC-20260905-F` item 3.

(Additional spot checks performed beyond the ten: `apps/api/src/lib/digest-sender.ts` header vs. function docstring; `docs/company/VOICE.md`'s first writing rule; `docs/strategy/2026-08-05-direction-plan.md` lines 14/64 vs. `CLAUDE.md:302`; `docs/decisions/records/DEC-20260812-A.md` line 83 for "library-as-product"; `apps/api/src/capabilities/dutch-company-data.ts` lines 1-4; `apps/api/src/lib/provenance-builder.ts` line 39; `docs/decisions/records/DEC-20260422-D.md` line 36; `manifests/doi-resolve.yaml` lines 42/108; `manifests/*.yaml` `data_source_type` distribution and `processes_personal_data`/`personal_data_categories` coverage counts at the pinned commit (350 files, all 350/129 -- matches `DEC-20260905-I`'s stated count at commit `48339ec2`, confirming no manifest drift occurred between that commit and the reviewed commit); git ancestry/prefix check for the git-qualified record `DEC-20260422-A--git-3b256587`.)

## Structural checks (all 45 records)

- Frontmatter parses; `record_key`/`id`/filename agreement: **pass on all 45** (scripted check).
- CAUTION banner + all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present: **pass on all 45** (scripted check).
- Evidence-path existence: extracted all 308 evidence entries across the partition; every non-URL, non-cross-repo entry resolves to an existing file at the pinned commit (0 missing); both cross-repo `strale-io/strale-frontend@<sha>:<path>` entries resolve (`04c9fca9:src/pages/Index.tsx`, `8e01fbc5...:src/components/solutions/sqs-display.ts`, both verified via `git show` in the sibling checkout).
- Relation targets: extracted all 93 unique relation targets across the partition; every one resolves to an existing record file at the pinned commit (0 missing); none is a bare collided id (cross-checked against `docs/decisions/id-collisions.yaml`'s collision id list).
- Null-field / populated-field-called-null checks: no instance found where a record quotes a field it should have found null, or calls a populated field null, in any dump performed.
- Git-qualified record `DEC-20260422-A--git-3b256587`: `id` equals the key with qualifier removed; `docs/project/m2-closure-register.yaml:349-353` carries `source_kind: git-native`, `source_rows: []`, and `git_provenance` matching the record's own `evidence[0]` exactly; the commit `3b25658736bfed53eec52c8acf2619dacd54d1f5` is a confirmed ancestor of HEAD (`git merge-base --is-ancestor` succeeds) and its prefix matches.
- Collision-registry + closure-register bindings for `--notion-` qualified records: spot-checked `DEC-20260420-I` (both rows), `DEC-20260513-F` (both rows) against `docs/project/m2-closure-register.yaml` -- record_key/id/collision fields consistent; spot-checked resolution-report existence for all 14 collision ids appearing in my partition (`DEC-20260420-I`, `-K`, `DEC-20260421-A/B/C/D`, `DEC-20260505-D/E`, `DEC-20260507-A/C`, `DEC-20260508-B/C`, `DEC-20260512-A`, `DEC-20260513-F`) -- all 14 resolution report files exist and each collision entry in `id-collisions.yaml` is `resolution_status: resolved`.

## Rule application notes (per this round's instructions)

- Confirmed rule (a): every statement that `DEC-20260905-B` through `-N`'s Decision lists withdraw from records in or referenced by my partition was checked as a correction, not a finding against the original -- e.g. the "eight HMRC_* rows" claim in `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md` (withdrawn by `DEC-20260905-B` item 7, re-confirmed by `DEC-20260905-N` item 2: exactly 7 rows exist). I verified the *correction itself* is right in every sampled case (see spot checks above), and found it right in every case except the one finding above.
- Confirmed rule (e) (dated observations): the "342 manifests"/"224 api" figures repeated in several 2026-04-20/04-21 records' Consequences sections (verified 2026-09-05) versus the actual pinned-commit counts (350 manifests, 232 `api`) is expected drift from unrelated manifest additions between the records' own verification date and the pinned commit, exactly the class `DEC-20260905-I`'s dated-observation clause excuses -- not a finding.
- Confirmed the DEC-20260905-M "own wording" clause applies to several checker residuals in the amending records themselves (see residual list above) and to some of their internal descriptive labels (e.g. `DEC-20260905-G`'s "Rule (a) cross-check").
- Confirmed several relations substantiated only via an amending record (e.g. `DEC-20260430-A`'s two `related_to` relations, restated across `DEC-20260905-F`/`-H`/`-I`/`-J`) are not findings, per the relation-substantiation convention `DEC-20260905-D` establishes.

## Unverifiable

Nothing in my partition required the Notion page-body fetch path (item (c) of the instructions) -- no record in my list cites a page-body claim outside the properties export. Nothing was left unverified; every quotation, evidence path, relation, and sampled code claim was checked to a definite conclusion (faithful, or the one finding above).

## Conclusion

45 of 45 records pass structural and evidentiary review. One factual defect was found, inside an amending record (`DEC-20260905-D.md`, item 9) whose own claim about which Notion-row fields contain certain qualifying words is itself false. This is exactly the class of error rounds 10-12 were tasked with catching in earlier amending records, and it was not caught by rounds 10-13's own reconciliations (no later `DEC-20260905-*` record touches it).

PARTITION VERDICT: FAIL

### Partition P2, first report (superseded; retained as the record of the rerun's reason, not one of the round's six counted verdicts)

# Closing review round 13, partition P2

Commit reviewed: c268565abd03aaae48eade48567dc2627a24955a
Record count: 41 (docs/decisions/records/DEC-20260310-E.md through DEC-20260411-B.md, per closing13-P2.txt)

## Method

Read every record in the partition in full at the pinned commit, in a worktree checked out with `git checkout --detach c268565abd03aaae48eade48567dc2627a24955a` inside this agent's own isolated worktree (per the caller's instruction, in place of creating a new `C:/tmp` worktree). Ran `npm ci` in that worktree (succeeded). For each record: checked frontmatter agreement (record_key/id/filename), the CAUTION banner and five protected sections, every evidence path's existence at the pinned commit (cross-repo entries resolved against `strale-io/strale-frontend`, fetched fresh from origin), every relation target's existence and body substantiation, and cross-checked every "no formal record exists" / "unresolved collision" claim against `docs/decisions/id-collisions.yaml` and the actual file listing of `docs/decisions/records/`. Sampled well over ten "status on" code claims (grep/read against the exact files cited) with file and line. Ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with `--only` for each of the 41 files in this partition, then classified every residual.

## Checker residuals and classification

Totals: 41 records, 223 spans, 219 faithful, 4 residual.

1. `DEC-20260314-F.md:82` -- `"completion_rate\|autonomous"` -- this is a literal grep pattern the record quotes to describe a search it ran (`grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*`), not a quotation attributed to any source's words. **Checker miss -- own wording** (DEC-20260905-M's clause), not a finding.
2. `DEC-20260314-F.md:84` -- `"completion_rate\|autonomous_completion\|autonomousCompletion"` -- same: a quoted grep pattern describing the record's own search, not a source quotation. **Checker miss -- own wording**, not a finding.
3. `DEC-20260317-F.md:51` -- `"automated >= 50 gate"` -- short quoted phrase used as the record's own label for a concept while explaining why no relation edge was created; not presented as any source's words. **Checker miss -- own wording**, not a finding.
4. `DEC-20260321-A.md:67` -- `"schedule_tier\|scheduleTier\|ORDER BY"` -- another quoted grep pattern describing the record's own search command, not a source quotation. **Checker miss -- own wording**, not a finding.

No real quote-fidelity defects in this partition's checker output.

## Findings

1. **`docs/decisions/records/DEC-20260409-D.md:64-66`** -- false claim. The record states: "No record for `DEC-20260409-C` exists in this repository (it is an unresolved collision id in `docs/decisions/id-collisions.yaml`), so no `amends`/`supersedes` relation edge to it is recorded here." At c268565a, `docs/decisions/id-collisions.yaml` lines 204-219 show `DEC-20260409-C` with `resolution_status: resolved` and a `disposition: formal_record` entry (`record_key: DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf`), and the file `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md` exists on disk. The claim that no record exists and that the id is unresolved is false.

2. **`docs/decisions/records/DEC-20260405-A.md:67-70`** -- false claim. The record states, of `DEC-20260405-B`: "no formal record exists for that id on `main` and it is not in `docs/decisions/id-collisions.yaml`, so it is mentioned here in prose only." At c268565a, `id-collisions.yaml` lines 140-155 list `DEC-20260405-B` as `resolution_status: resolved` with two `disposition: formal_record` entries, and both files (`DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md`, `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md`) exist under `docs/decisions/records/`. The claim is false on both counts (formal record existence and absence from the collisions registry).

3. **`docs/decisions/records/DEC-20260405-A.md:76`** -- false/misattributed claim. The record states, of `DEC-20260225-P-m5n6`: "(the original Allabolag choice; no record exists, mentioned in prose only)." `docs/decisions/records/DEC-20260225-P-m5n6.md` exists at c268565a as a bare-key formal record, and its actual subject is fuzzy natural-language input resolution on `swedish-company-data` via an LLM call -- not "the original Allabolag choice" (the original scraper-source decision). This is both a false existence claim and a misattribution of subject matter.

4. **`docs/decisions/records/DEC-20260320-F.md:39-42`** -- false claim. The record states, of `DEC-20260320-E`: "no formal record exists for that ID on `main` and it is not in `docs/decisions/id-collisions.yaml`." `docs/decisions/records/DEC-20260320-E.md` exists at c268565a as a bare-key formal record in this very same partition (reviewed above; title "OpenSanctions standard Commercial API tier (EUR 0.10/call) confirmed for Strale reseller use"). The "not in id-collisions.yaml" half is trivially true (it is not a collision id), but the "no formal record exists" half is false.

5. **`docs/decisions/records/DEC-20260409-D.md`** (relations block, frontmatter lines 10-14) -- unsubstantiated relations. The record declares `related_to` edges to `DEC-20260409-A` and `DEC-20260409-B`, but the record's own body never names either id anywhere in prose. The underlying Notion row's Rationale field (verified via `dump_rows.py PAGE:33d67c87082c8118af3bf12a823aa540`) does state "DEC-20260409-A (Gate 2 null-output correctness tier) and DEC-20260409-B (code-based lookup + cross-validation) remain active" -- so the relations themselves are real and the row supports them -- but per this round's rule 6, substantiation must be in the record's own body prose, not only in the source row. Contrast with `DEC-20260409-B.md`, which does quote its own row's "RELATED:" sentence in its Context section. This is a completeness gap in DEC-20260409-D's body, not a fabricated relation.

No other findings. All other claims, quotations, evidence paths, frontmatter, protected sections, and relations checked out.

## Ten-plus code-claim spot checks (file, line)

1. `DEC-20260313-C` -- `apps/api/src/routes/public-trust.ts:55,57` -- `tested: boolean` and `pass_rate: number | null` fields confirmed present, matching the record's claim that a boolean/pass_rate pair replaced the "Unverified" SQS label.
2. `DEC-20260314-F` -- `packages/mcp-server/README.md:78` -- confirmed verbatim: "`strale_ping`, `strale_search`, `strale_methodology`, and `strale_trust_profile` work without an API key. `strale_execute` and `strale_balance` require authentication."
3. `DEC-20260315-I` -- `apps/api/src/routes/do.ts:876-877` -- confirmed verbatim two-line comment: "Verify x402 payment WITHOUT broadcasting settlement -- the settle / step runs only after the capability has produced output (DEC-14)."
4. `DEC-20260316-A` -- `apps/api/src/lib/trust-grade.ts:171,173,214` -- confirmed `computeTrustGrade` and the "Combined Trust Grade" section header still exist as dead code with no callers outside the file.
5. `DEC-20260317-A` -- `apps/api/src/lib/digest-sender.ts:23` -- confirmed verbatim: "Send the weekly digest (or any platform health email) via Resend."; `apps/api/src/lib/interrupt-sender.ts:172` confirmed `sendInterruptEmail` has zero callers outside its own definition file.
6. `DEC-20260318-A` -- `apps/api/src/app.ts:513` -- confirmed comment: "// /v1/quality/:slug retired with the SQS engine (DEC-20260503-B)."
7. `DEC-20260320-F` / `DEC-20260323-A` -- `apps/api/src/lib/test-runner.ts:2115-2117` -- confirmed "Removed" section names `persistDualProfileScores`, `computeAdaptiveInterval`, `repairStaleScores`, etc. verbatim.
8. `DEC-20260330-B` -- `context7.json`, rule index 11 (rule 12, 1-indexed) -- confirmed the rule now reads the corrected SQS-deletion text, not the stale quote this record's own Consequences section attributes to it (already withdrawn by `DEC-20260905-B`; correction verified byte-for-byte accurate against the live file).
9. `DEC-20260409-A` -- `apps/api/src/lib/null-field-ratio.ts:2,10-13` -- confirmed header comment and rule list match the record's quotes verbatim, including the `NULL_RATIO_RULE_ENABLED` feature flag default in `config/env-manifest.yaml:749-757`.
10. `DEC-20260411-B` -- `apps/api/src/lib/gate5-path-coverage.ts:7,10,13-14` -- confirmed PRIMARY/SECONDARY and inward-trace/dispatch-logic language verbatim; `apps/api/scripts/onboard.ts` confirmed to cite "Gate 5" and "DEC-20260411-B" at multiple lines.
11. (extra) `DEC-20260329-A` / `DEC-20260314-G` -- `strale-io/strale-frontend@04c9fca9:src/index.css` and `src/pages/Index.tsx`, `src/components/Header.tsx`, `src/App.tsx` -- confirmed the seven palette hex-equivalent HSL values, the exact hero headline text, the "Trust" nav item, and the `/trust` + `/trust/methodology` routes all verbatim against a fresh fetch of the frontend repo.
12. (extra) `DEC-20260410-A` -- `apps/api/src/lib/progressive-unlock.ts:3,9,11-12`, `apps/api/src/routes/auth.ts:549-553`, `apps/api/src/routes/do.ts:1739` -- confirmed the `UNLOCK_MAP`, 24-hour TTL, `agentSignupHandler` header comment, and the exact response message text.

## Unverifiable

Nothing in this partition was left unverifiable. Every evidence path resolved (file, cross-repo file, or Notion/GitHub URL cited as a URL only), every relation target existed as a record key, and every sampled code claim was checked directly against the file at the pinned commit.

## Notes on already-withdrawn statements

`DEC-20260330-B`'s Consequences section still contains, on disk, the exact false quotation of `context7.json` rule 12 that `DEC-20260905-B` (item 2) withdraws. Verified the correction is itself accurate (checked byte-for-byte against `context7.json`'s current rule text). Per this round's rule (a), this is not a finding against `DEC-20260330-B`.

PARTITION VERDICT: FAIL

#### Orchestrator note: this report is superseded and was not counted

This reviewer reported five findings against `DEC-20260409-D`, `DEC-20260405-A`
and `DEC-20260320-F`. The orchestrator checked each against the amending records
at the pinned commit and found every one already withdrawn or substantiated by
name, which the round's rule (a) makes a corrected statement rather than a
finding:

- `DEC-20260409-D` lines 64-66 (no record for `DEC-20260409-C`, unresolved
  collision): withdrawn by `DEC-20260905-E` item 5, same lines, same both-halves-
  false reasoning.
- `DEC-20260405-A` lines 67-69 (`DEC-20260405-B`) and lines 76-77
  (`DEC-20260225-P-m5n6`): withdrawn by `DEC-20260905-E` items 3 and 4, same
  lines.
- `DEC-20260320-F` lines 40-41 (`DEC-20260320-E`): withdrawn by
  `DEC-20260905-E` item 1, same lines.
- `DEC-20260409-D`'s two `related_to` edges: the `DEC-20260409-A` edge is
  substantiated by `DEC-20260905-E` item 6 and the `DEC-20260409-B` edge by
  `DEC-20260905-D` item 7, both from the underlying rows' own text.

The partition was rerun by a fresh reviewer whose report is
`closing13-review-P2.md` (reproduced above as the counted "Partition P2
(rerun)" report). This file is retained as the record of the rerun's
reason and is not part of the round's evidence.

## Gate output

```
M2 closing review round 13 gate run at c268565abd03aaae48eade48567dc2627a24955a, 2026-09-06T16:13:25Z
HEAD=c268565abd03aaae48eade48567dc2627a24955a
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (277.3244ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (81.2557ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (6.5947ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (38.0507ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 205610.9985
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (390.7435ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (291.3096ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (156.6839ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (365.0623ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 91256.5527
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
  CX-11  high   PR #510 -- drizzle-orm 0.38.4 -> 0.45.2 (T17 batch 2), with the DrizzleQueryError unwrap module and five routed readers
  CX-10  high   PR #513 -- M2 batch 4: three engineering-convention rows (DEC-20260419-A, DEC-20260420-A, DEC-20260511-C) migrated to formal candidate records
  CX-9  high   PR #511 -- DEC-20260422-A cross-surface collision resolved (G3 stage 2): protocol record DEC-20260422-A--git-3b256587, Notion row evidence-only
  CX-8  high   PR #509 -- cross-surface identity mechanism (G3 stage 1): --git-<sha> record keys, DEC-20260904-B
  CX-7  high   PR #503 -- G1 rule (DEC-20260904-A): 76 pre-readiness feature-scoped rows become evidence-only
  CX-6  medium PR #502 -- capability input-shape guards: wrong-shaped list input must refuse, not crash
  CX-5  high   PR #500 -- M2 batch: 2026-08 operating-window rows, seven formal candidate records
  CX-4  medium PR #499 -- hono 4.12.8 -> 4.13.5, WP13 batch 1
  CX-1  high   PR #494 -- withdrawn capabilities must not be advertised anywhere
  CX-2  medium PR #497 -- the session gate stopped instructing removal of live worktrees
  CX-3  high   Retention: durable production-override records ride the compliance window
ok   codex re-review backlog
exit=0
=== npm run receipts:check
warn (11) -- handoffs stating a bare test count with no receipt:
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t12-research-contract.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t13-design-tokens.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t14-cheap-extras.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t5-cto-readable-structure.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-checkin-morning.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-founder-answers-retention-and-wp13-track.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-handoff-gate-live-worktree.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-04-checkin-morning.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-05-checkin-morning.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-06-checkin-morning.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-06-retention-cadence-and-review-followups.md: states a test count with no archive/receipts/ link -- write a receipt (npm run receipt) and cite it
exit=0
=== node apps/api/scripts/check-pii.mjs --strict
PII guard: clean -- no unredacted person names or checksum-valid identifiers found.
exit=0
=== node apps/api/scripts/check-no-committed-secrets.mjs
check-no-committed-secrets: clean (3196 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still c268565abd03aaae48eade48567dc2627a24955a
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Consolidated findings

Five partitions passed and the gates were clean; the consolidated verdict
is FAIL on P6's one item.

1. **`docs/decisions/records/DEC-20260905-D.md`, item 9 (section
   `### \`DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711\``, heading
   at line 213, item body lines 215-225, the false sentence at lines
   221-224).** Found by partition P6. The item asserts, as fact, that "Both
   fields name 'government-registry' before 'API' and 'commercial' before
   'aggregator'," referring to the Decision and Rationale fields of the
   Notion row at page `34967c87082c81bd8c6bf8e92e901711`. Evidence: the
   row's Decision field (dumped via `dump_rows.py
   PAGE:34967c87082c81bd8c6bf8e92e901711`) reads "\"No scraping\" positioning
   commitment promoted to v1 launch blocker. All 9 EU countries currently
   using Browserless+LLM scraping must be migrated to direct APIs or
   licensed aggregator contracts before launch." -- it contains neither
   "government-registry" nor "commercial." Only the Rationale field carries
   both qualifiers ("...must migrate to a direct government-registry API or
   a licensed commercial aggregator before v1 launch"). The claim that
   "both fields" name these qualifiers is false; only one field does. This
   does not disturb item 9's underlying withdrawal of the original record's
   quotation, which stands on the Rationale field.

This item is corrected by `DEC-20260905-O`
(`docs/decisions/records/DEC-20260905-O.md`), which withdraws the
statement without editing the record it corrects, per the round's
immutability rule.

VERDICT: FAIL
