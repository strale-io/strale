---
doc_type: m2-closing-review-round
round: 8
commit: 48339ec29d7f768c7e51736f88659239c75ad6a7
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-06'
verdict: FAIL
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Method

Round 8 of the M2 closing independent review, run after `DEC-20260905-H`
withdrew round 7's confirmed statements, at commit
`48339ec29d7f768c7e51736f88659239c75ad6a7`. Six fresh, read-only
reviewers, none the author of any reviewed content, applied the quotation
convention `DEC-20260905-D`/`-E`/`-F`/`-G`/`-H` state unchanged (normalize
quotation and source before comparing: transliterate symbols, lowercase,
strip non-alphanumerics; an ellipsis splits a quotation into ordered
segments; a relation substantiated by an amending record, or narrated in
the target record's own body rather than the source record's, is
substantiated, not a defect) and ran the operator checker,
`scripts/m2-quote-fidelity.mjs`, against the parsed Notion export and the
sibling `strale-frontend` checkout, at both the default 25-character
threshold and a second pass at `--min-chars 12`, in addition to the prior
rounds' own method: each partition set up a detached, read-only worktree
at commit `48339ec29d7f768c7e51736f88659239c75ad6a7`, checked frontmatter
validity, the CAUTION banner, the five protected sections, every
quotation, every evidence path, every relation target, at least ten code
claims, and, for `--notion-` and `--git-` qualified records, the
collision-registry and M2-closure-register bindings. P1 through P4 each
took a contiguous slice of bare-keyed records; P5 took the `--notion-`
qualified records belonging to this batch's id-collisions; P6 took the
remaining qualified records for this batch plus the seven prior
withdrawal records `DEC-20260905-B` through `DEC-20260905-H` themselves,
checked like any other candidate record. Reviewers could additionally
verify Notion page bodies read-only, beyond the parsed row-property
export, where a partition needed to. There is no sweep section in this
archive: each partition covered its own slice in full rather than by
sample, per the method above (the corpus-wide residual reconciliation at
both thresholds, the broader sibling-state re-sweep, and the
absolute-absence-claim sweep this round's brief additionally required
live in `DEC-20260905-I`, not here). Below, every heading in each
reproduced partition report is demoted by exactly one level (`##` to
`###`, `###` to `####`; a report's own top-level `#` title is left as-is
under a `### P<n>` wrapper) so this file keeps one heading hierarchy
throughout; nothing else in any report is edited.

## Partition reports

### P1

# Closing-review round 8, partition P1

Partition: P1. Commit: `48339ec29d7f768c7e51736f88659239c75ad6a7`. Record count: 41
(the partition list file `closing8-P1.txt` has 41 lines, not 40).

Setup: detached worktree at `C:/tmp/strale-closing8-P1` from the pinned commit,
`npm ci` run there, read-only throughout, worktree removed at the end (junction
targets under `node_modules` all resolved inside the worktree itself, confirmed
with `Get-ChildItem -Recurse -Force -Attributes ReparsePoint` before deleting).
No other worktree was touched.

### Method

1. A Python script parsed each record's frontmatter and confirmed
   `record_key`/`id`/filename agreement, the CAUTION banner, and the five
   protected sections (Decision, Context, Rationale, Consequences, Reversal
   conditions). All 41 passed with no problems.
2. A second script extracted every `evidence` entry and `relations` target
   from frontmatter and checked each repo-path evidence entry and every
   relation target resolves to a file at the pinned commit. No missing
   evidence file and no missing relation target.
3. Cross-repo `strale-io/strale-frontend@04c9fca9:<path>` evidence entries
   (9 across 4 records: DEC-20260302-C, DEC-20260303-C, DEC-20260306-H,
   DEC-20260309-H) were resolved with `git -C strale-frontend show
   04c9fca9:<path>` after `git fetch origin`; all 9 resolved.
4. Notion row quotations were checked with `dump_rows.py` against the
   parsed row fields (Decision/Rationale/Outcome/Source/Superseded By),
   never by regex-slicing the raw export.
5. The operator checker `node scripts/m2-quote-fidelity.mjs --export
   <scratchpad>/decisions-export-raw.txt --frontend
   C:/Users/pette/Projects/strale-frontend --min-chars 12` was run with one
   `--only` per file in the P1 list (logic: normalizes quote and source per
   the stated convention, extracts every double-quoted span, and reports
   spans whose normalized text is not a substring of any candidate source).
6. At least ten "status on" code claims were independently re-verified by
   reading the named file at the pinned commit (list below).
7. Relation-target substantiation was checked by reading the amending
   record's own "Relation to `<target>`" paragraph (or equivalent prose)
   for every declared relation in P1's frontmatter.
8. Bare relation targets were checked against `docs/decisions/id-collisions.yaml`
   for collision status. No P1 record is `--notion-`/`--git-` qualified, so
   check (8) (collision-registry / closure-register binding) does not apply
   to any record in this partition.

### Operator checker output and reconciliation

Totals for the partition: 41 records, 230 spans, 225 faithful, 5 residual.

1. `DEC-20260225-P-k3l4.md` line 75: `"wedge, not niche"` (best match:
   notion:DEC-20260225-P-k3l4, prefix 5). **Classified as a real defect.**
   Verified via `dump_rows.py` PAGE:31267c87082c81b5b0d6cb9764dd5228: the
   row's Decision field reads "...Reject both 'EU-only niche' and 'pretend
   global coverage.'" and its Rationale contains no such phrase either. The
   record's own prose reads "CLAUDE.md's current capability description is
   consistent with the row's 'wedge, not niche' framing, in substance,"
   presenting a compressed label as if it were the row's own words. Not
   withdrawn by any of DEC-20260905-B through -H.
2. `DEC-20260225-P-m1n2.md` line 90: `"strale-mcp vs x402"` (best match:
   paragraph-path:server.json, prefix 10). **Classified as a checker miss,
   not a defect** (updated after locating the source; see note below).
   The record attributes this phrase to "this batch's brief," the
   per-record onboarding prompt that produced this specific record.
   `scratchpad/brief-t10-batch13-founding-decisions.md` (found via a
   background grep that completed after my initial pass) is that exact
   brief and reads: "`DEC-20260416-A.md` exists (strale-mcp vs x402), cite
   where a row's subject matches." The quotation is faithful to its stated
   source, a session artifact outside the repository rather than a
   fabrication; round 7's own reconciliation
   (`scratchpad/residual-reconciliation-round7-short.md`) independently
   reached the same conclusion for the identical residual. Not a finding.
3. `DEC-20260225-P-m1n2.md` line 109: `"not CI reports"` (best match:
   record:DEC-20260314-G.md, prefix 5). **Classified as a checker miss, not
   a defect.** The phrase is a reflexive label referring back to this same
   record's own earlier, correctly-sourced quotation two paragraphs above
   ("Don't build: CI reports, PDF engines, domain-specific pipelines,"
   verified faithful against the row's own Rationale field via
   `dump_rows.py` PAGE:31267c87082c811f932fe2a2220dd9af), not a fresh
   attribution to the row as its own exact words.
4. `DEC-20260226-P-s3t4.md` line 55: `"build it now, cheaply"` (best match:
   record `DEC-20260225-P-c5d6--notion-...`, prefix 7). **Classified as a
   real defect.** Verified via `dump_rows.py` PAGE:31367c87082c81c69b79db1abefa936d:
   the row's Rationale field reads "...API versioning from day one follows
   Stripe playbook — trivial to add now, painful to add later, strongest
   long-term switching cost." No field contains "build it now, cheaply."
   The whole paragraph is prefaced "The rationale, as the row states it,"
   so the phrase is presented as the row's own words when it is the
   record's own compressed label. Not withdrawn by any of DEC-20260905-B
   through -H.
5. `DEC-20260227-P-s9t0.md` line 82: `"visa/work permit"` (best match:
   notion:DEC-20260227-P-s9t0, prefix 4). **Classified as a checker miss,
   not a defect.** Confirmed by grep that `apps/api/src/capabilities/work-permit-requirements.ts`
   is exactly the "visa/work permit" domain capability the sentence
   describes as an unrelated grep hit; it is offered as a descriptive label
   for a real file, not a literal quotation of any source's exact words.

Net: 2 real defects newly found by the checker in this partition (items 1
and 4 above), 3 checker misses (items 2, 3, 5).

### Findings

1. **`docs/decisions/records/DEC-20260225-P-k3l4.md`, line 75.** The
   quotation `"wedge, not niche"`, presented as "the row's ... framing," is
   not present in the row's Decision or Rationale fields (verified via
   `dump_rows.py`, page `31267c87082c81b5b0d6cb9764dd5228`). It is a
   fabricated quotation, this record's own synthesis of the row's "Reject
   both 'EU-only niche' and 'pretend global coverage'" clause, presented as
   if it were the row's literal words.
2. **`docs/decisions/records/DEC-20260226-P-s3t4.md`, line 55.** The
   quotation `"build it now, cheaply"`, prefaced "as the row states it," is
   not present in the row's Rationale field (verified via `dump_rows.py`,
   page `31367c87082c81c69b79db1abefa936d`, which reads "...following the
   Stripe playbook — trivial to add now, painful to add later, strongest
   long-term switching cost"). It is a fabricated quotation attributed to
   the row.

No other findings. Every other quotation checked (Notion row fields, file
comments, cross-repo frontend files, sibling records) matched its named
source under the stated normalization convention. All evidence paths
exist at the pinned commit. All relation targets exist as record keys, are
substantiated in body prose (a "Relation to `<target>`" paragraph or
equivalent narrative in every case in this partition), and none is a bare
collided id per `docs/decisions/id-collisions.yaml`. No null field is
quoted as populated and no populated field is described as null (spot
checked on DEC-20260225-P-m1n2's Source-field claim and DEC-20260306-D's
Outcome/Reviewed claim, both confirmed accurate against the parsed row).

**Statements already withdrawn by `DEC-20260905-C` / `-D` (corrected, not
findings against these records, per the round's rule (a)):**
`DEC-20260224-P-g7h8` ("Long-term ambition..." misattributed to CLAUDE.md),
`DEC-20260225-P-y1z2` (the DEC-19 "(unanimous)" parenthetical and the
`DEC-20260225-P-a3b4` composite quote), `DEC-20260226-P-q1r2`
("Production: https://strale-production..." misattributed to CLAUDE.md),
`DEC-20260227-P-a1b2` ("the original Provider Growth doc" quotation),
`DEC-20260227-P-u1v2` ("Distribution packages & protocol endpoints"
misattributed to CLAUDE.md), `DEC-20260302-A-0001` ("EUR 0.02 to EUR 1.00"
en-dash insertion), `DEC-20260302-C` (stale CLAUDE.md short-form quote),
`DEC-20260305-E` (the `browserless-extract.ts` comment misattribution and
the "47-to-36" restatement), `DEC-20260306-D` (the "Success Rate" vs "Test
Pass Rate" quotation), `DEC-20260309-G` ("returns no matches outside this
record" over-claim). Each was verified present in the record text exactly
as the withdrawal record describes it, and each withdrawal's own
correction was itself checked against the cited source and found accurate.

**Statement checked and confirmed NOT a defect on manual re-verification**
(false alarm from my own first pass): `DEC-20260226-P-u5v6.md` line 80's
quotation of `DEC-20260227-P-a1b2` as stating "Actual build velocity
produced 133+ capabilities in <24hrs (heading to 200+)." `DEC-20260227-P-a1b2.md`'s
own body paraphrases this differently ("under 24 hours, heading toward
200+"), but the underlying Notion row (page
`31367c87082c814bac2bea252352ce64`) reads, verbatim, "Actual build
velocity produced 133+ capabilities in <24hrs (heading to 200+)." The
quotation is faithful to the row the cited record documents; not a
finding.

### Ten code-claim spot checks

1. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` (DEC-20260302-C):
   confirmed section order `SolutionsShowcase` (217), `FreeTierShowcase`
   (221), `ProblemSection` (225), `QualityScoringSection` (229),
   `AuditTrailSection` (234), `StatsStrip` (276); no categories grid.
2. `strale-io/strale-frontend@04c9fca9:src/pages/Methodology.tsx` +
   `App.tsx` (DEC-20260303-C): confirmed `/trust` and `/trust/methodology`
   both route to `Methodology`, no `/how-ranking-works` route; confirmed
   the header comment about the deleted SQS engine and "rewritten to
   describe only what the live platform actually does."
3. `strale-io/strale-frontend@04c9fca9:src/components/Header.tsx`
   (DEC-20260303-C): confirmed line 10, `{ label: "Trust", href: "/trust" }`.
4. `strale-io/strale-frontend@04c9fca9:src/pages/CapabilityDetail.tsx`
   (DEC-20260306-H): confirmed line numbers for "Parameters" (271), the
   try-it code block (304), "Part of these solutions" (319), the "HOW THIS
   IS VERIFIED" comment (358), "Related guides" (432), and no limitations
   section (`grep -ni limitation` returns nothing).
5. `strale-io/strale-frontend@04c9fca9:src/pages/Terms.tsx` + `App.tsx`
   (DEC-20260309-H): confirmed the "8. Warranty and liability" section, the
   two quoted liability sentences, and the `/terms` route.
6. `docs/company/claims.yaml` (DEC-20260309-H): confirmed no
   "advisory"/"financial"/"disclaimer" matches; and confirmed the eight
   named finance-capability slugs are all absent from `manifests/`, while
   `aml-risk-score`, `ip-risk-score`, `wallet-risk-score`,
   `risk-narrative-generate` exist and none carries a `disclaimer` field
   (only `competitor-compare`, `contract-extract`, `email-finder`,
   `landing-page-roast` do).
7. `apps/api/src/capabilities/work-permit-requirements.ts` (DEC-20260227-P-s9t0):
   confirmed this is the "visa/work permit" domain capability a
   case-insensitive grep for "visa" surfaces.
8. `apps/api/src/db/schema.ts`, `apps/api/src/lib/versioning.ts`,
   `apps/api/src/routes/do.ts` (DEC-20260226-P-s3t4): confirmed
   `auditTrail`/`transparencyMarker`/`dataJurisdiction` columns, the
   `Strale-Version` header read/write in `versioning.ts`, and the
   `transparencyMarker`/`dataJurisdiction` writer call sites in `do.ts`.
9. `apps/api/src/routes/public-trust.ts` (DEC-20260305-G / DEC-20260306-D):
   confirmed `PUBLIC_TRUST_FIELDS` five-field set including `badge_label`;
   confirmed no `v1/quality/:slug` route exists anywhere under
   `apps/api/src/routes`.
10. `apps/api/src/lib/trust-grade.ts` (DEC-20260305-G): confirmed
    `computeTrustGrade` has zero callers anywhere in `apps/api/src` outside
    its own file (only its own definition line matches a repo-wide grep).
11. `apps/api/src/lib/auth.ts`, `apps/api/src/lib/x402-gateway.ts`,
    `packages/mcp-server/package.json` (DEC-20260225-P-q3r4,
    DEC-20260225-P-s5t6, DEC-20260225-P-u7v8): confirmed `sk_live_` +
    `key_prefix` API-key scheme, `USDC_CONTRACTS`/Base mainnet, and the
    `strale-mcp` package name/version.
12. `apps/api/src/capabilities/lib/web-provider.ts` /
    `browserless-extract.ts` importer count (DEC-20260305-E): confirmed
    exactly 35 non-test capability files import the re-export layer.

(12 performed, above the required 10.)

### Unverifiable

None. The one item that was unverifiable on first pass (`DEC-20260225-P-m1n2.md`
line 90's `"strale-mcp vs x402"` quotation) was resolved during this
session: its source, `scratchpad/brief-t10-batch13-founding-decisions.md`,
was located and confirmed to contain the quoted phrase (see residual item
2 above).

### PARTITION VERDICT: PASS

### P2

# Closing review, round 8 (round 2 of the M2 closing independent review), partition P2

Commit: `48339ec29d7f768c7e51736f88659239c75ad6a7`
Record count: 40 (`docs/decisions/records/DEC-20260310-E.md` through `DEC-20260411-B.md`, per `closing8-P2.txt`)

### Script used

`node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend <strale-frontend checkout> --min-chars 12 --only <each of the 40 files>`. Logic in one sentence: for every double-quoted span (>=12 chars) in a record's body, normalize both the span and every candidate source (Notion row field, cited repo file, sibling-frontend file, another record) by transliterating `EUR`/`x`/`>=`/`<=`/`->`/`...` for their symbol forms, lowercasing, and stripping every non-alphanumeric character, then tests substring containment (an ellipsis in the quote splits it into ordered segments); a span with no faithful match anywhere is reported as a residual with its best partial match.

Result: 41 records (the tool counts `DEC-20260315-B.md`'s own file plus its self-reference; no material effect), 223 spans, 215 faithful, 8 residual.

#### Residuals and classification

1. **`DEC-20260314-F.md:82,84`** — `"completion_rate\|autonomous"` and `"completion_rate\|autonomous_completion\|autonomousCompletion"`. **Checker miss.** These are literal `grep` command patterns quoted inside backticks as code examples (`grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*`); the double quotes are shell syntax the record is showing verbatim as a command, not an attributed quotation from a source. Independently re-ran both greps against `apps/api/src`: zero matches, confirming the record's own substantive claim ("no autonomous completion rate metric exists in code today") is accurate.
2. **`DEC-20260316-A.md:82`** — `"one headline signal"`. **Checker miss, not a finding.** This is the record's own analytical paraphrase in its Consequences section ("this row's 'one headline signal' principle"), referring back to its own earlier Context text ("SQS was already meant to be the single headline signal"). It is not presented as, and is not required to be, a verbatim quotation from Notion or a repo file — it is the reviewer's own compressed label for the row's substance, in scare quotes.
3. **`DEC-20260316-B.md:50`** — `"which is the real rating"`. Same class as (2): a paraphrase-in-quotes describing the confusion DEC-20260316-A separately addresses, not an attributed source quotation. Checker miss.
4. **`DEC-20260317-F.md:51`** — `"automated >= 50 gate"`. Same class: paraphrase of the row's own earlier-quoted concept ("Automated gate at SQS 50 = 'this works.'"), not a verbatim re-quotation. Checker miss.
5. **`DEC-20260320-A.md:96`** — the `capability-readiness.ts` header-comment quotation with a `[reliability and limitations]` bracket insertion and an ellipsis. **Verified faithful; checker miss.** Read `apps/api/src/lib/capability-readiness.ts:8-13` directly: "The last two dimensions were added per DEC-20260423-B (Stage A, warning / mode): DEC-20260320-B claims the onboarding pipeline populates these two / fields, but until 2026-04-23 the hook `onCapabilityCreated` did not, and / `checkReadiness` did not gate on them. 34 caps shipped to prod with NULL / reliability (see audit-reports/...)." Every segment of the record's ellipsis-joined quotation appears in order; the bracketed phrase is a marked insertion, not a claimed quotation. The checker's exact-substring matcher does not special-case bracket insertions, hence the residual.
6. **`DEC-20260321-A.md:67`** — `"schedule_tier\|scheduleTier\|ORDER BY"`. Same class as (1): a literal grep-pattern code example, not an attributed quotation. Checker miss. Independently re-ran the grep: confirms the record's claim (no `ORDER BY schedule_tier` in either named file; `schedule_tier` appears only in `internal-tests.ts`, an internal/admin route).
7. **`DEC-20260330-B.md:79`** — `"be embedded in workflow"`. **Real finding (quote-fidelity defect), see Findings #1 below.** The record's own title and Decision section both read "be embedded in **coding** workflow"; the Consequences section drops the word "coding" when it re-quotes the phrase. This is a genuine dropped word inside a quotation, not a convention-covered style difference.

### Findings

1. **`docs/decisions/records/DEC-20260330-B.md:79`** — Quote-fidelity defect (dropped word). The record's own title (`title: "Shift distribution from 'be listed' to 'be embedded in coding workflow' via Context7, IDE rules, vibe-coding SEO"`) and its Decision section (`docs/decisions/records/DEC-20260330-B.md:28-29`: `Shift distribution strategy from "be listed" to "be embedded in coding / workflow" ...`) both say "be embedded in **coding** workflow." The Consequences section (`DEC-20260330-B.md:79`) re-quotes it as `"be embedded in workflow"`, dropping "coding." The underlying substantive point (whether the shift moved the needle is unmeasured) is not disturbed; only the quoted phrase itself is short one word. Evidence: `docs/decisions/records/DEC-20260330-B.md` lines 4, 28-29, 79.

2. **Minor, non-blocking observation (not a finding against any record in this partition): `DEC-20260905-G.md`'s own item 1 correction may itself undercount by one.** `DEC-20260905-G.md` withdraws `DEC-20260314-C.md`'s claim that a `docs/`-scoped grep for "multi-llm"/"ChatGPT evaluation" "found no match," and states the correct grep "returns two files ... `DEC-20260314-C.md` ... and `docs/project/DECISIONS.md`." Independently ran `grep -ril "multi-llm\|ChatGPT evaluation" docs/` at this commit: it returns **three** files, the two named plus `DEC-20260905-G.md` itself (which necessarily contains those literal strings because it quotes them for its own correction). `DEC-20260905-G.md` is outside my assigned partition (P5's collision layer would be the natural owner, or this is simply a self-referential artifact any correcting document of this kind produces), so I record it here as an observation rather than a finding against a P2 record. It does not reinstate `DEC-20260314-C`'s original "found no match" claim, which independent search also confirms is false (the same two/three files match); the record's own substantive conclusion (no recurring, scheduled multi-model evaluation job exists in the codebase) stands correct either way.

No other findings. All other quotations, evidence paths, relation edges, and null/populated-field claims checked for this partition were faithful, existent, substantiated, or (where already flagged false by DEC-20260905-B/C/D/E/G/H) correctly withdrawn and correctly re-stated.

### Withdrawn-statement cross-checks (rule a): verified the corrections themselves

For every record in P2 named in `DEC-20260905-B`, `-C`, `-D`, `-E`, `-G`, or `-H`'s Decision lists, re-verified the correcting fact independently rather than accepting it on faith:

- **`DEC-20260330-B` rule 12 / context7.json**: `DEC-20260905-B` item 2 withdraws the record's claim that rule 12 reads the SQS/`GET /v1/quality/:slug` text. Read `context7.json` rules array directly (`node -e "require('./context7.json').rules[11]"`): rule 12 (index 11) reads exactly the corrected text DEC-20260905-B states, no `/v1/quality/:slug` reference remains. Correction confirmed accurate.
- **`DEC-20260313-C`** ("still listed, signal absent...") — DEC-20260905-B/C corrections about the frontend `isSQSUnqualified` filter and CLAUDE.md's DEC-20260904-C affirmation: consistent with CLAUDE.md's own text (`CLAUDE.md:292`-area DEC-20260904-C entry), read directly in this repo's CLAUDE.md.
- **`DEC-20260314-A`** (Dev.to tweet quote punctuation) — DEC-20260905-B item 10: re-read `archive/growth-ops/tweets-v2.md:24` directly: `**Dev.to #1 (week of Apr 21)**: "How We Score 297 Agent Data Capabilities" — SQS methodology`. Confirms the correction (bold date parenthetical, double quotes around title, em dash) exactly.
- **`DEC-20260314-F`** (AX rationale em dash) — DEC-20260905-B item 9 and DEC-20260905-C: could not re-fetch the live Notion row content directly within this session's tool budget beyond the dump already taken (see below); the row was included in this partition's `dump_rows.py` pull (page `32367c87082c81bfaf90c949e06b8594`) and its Rationale field matches the corrected em-dash text DEC-20260905-B quotes.
- **`DEC-20260315-A`** (misattributed "free capabilities via MCP without auth" phrase) — DEC-20260905-G item 2: confirmed via the same dumped row (page `32367c87082c81eda40dfa601fd6b444`) that its Rationale field does not contain that phrase, and confirmed via `DEC-20260314-F`'s dumped row (page `32367c87082c81bfaf90c949e06b8594`) that the phrase belongs there instead ("Sprint 9F (elevated to 5 free capabilities via MCP without auth)"). Correction confirmed.
- **`DEC-20260315-B`** (16-day vs. 15-day gap to `DEC-20260330-B`) — DEC-20260905-G item 3: `DEC-20260315-B.md` frontmatter `decided_at: 2026-03-15`; `DEC-20260330-B.md` frontmatter `decided_at: 2026-03-30`. 2026-03-15 to 2026-03-30 is 15 days, not 16. Correction confirmed by direct date subtraction.
- **`DEC-20260320-E`/`DEC-20260320-F`** (mutual "no formal record exists" claim, and cost_note/purpose field misattribution) — DEC-20260905-E items 1 and 2: confirmed `docs/decisions/records/DEC-20260320-E.md` exists in this same partition (it is one of my 40 files) and its evidence array cites `DEC-20260320-F.md` back; confirmed `docs/decisions/id-collisions.yaml` has no `DEC-20260320-E` entry (the "not in id-collisions.yaml" half of DEC-20260320-F's original claim is accurate, only the "no formal record" half was false); read `config/env-manifest.yaml:797-806` directly, confirmed the quoted retention text lives in the `purpose` field (line ~798) and the actual `cost_note` field (line ~806) reads the different, shorter text DEC-20260905-E quotes. Both corrections confirmed accurate.
- **`DEC-20260405-A`** (two "no record exists" claims, re: `DEC-20260405-B` and `DEC-20260225-P-m5n6`) — DEC-20260905-E items 3 and 4: confirmed `docs/decisions/id-collisions.yaml` lists `DEC-20260405-B` `resolution_status: resolved` and both its formal record files exist; confirmed `docs/decisions/records/DEC-20260225-P-m5n6.md` exists as a bare-key formal record. Both corrections confirmed accurate.
- **`DEC-20260409-D`** (false claim that no record exists for `DEC-20260409-C`; and its two undeclared-substantiation relations to `DEC-20260409-A`/`DEC-20260409-B`) — DEC-20260905-E item 5 (withdraws the false "no record"/"unresolved collision" claim: confirmed `docs/decisions/id-collisions.yaml` lists `DEC-20260409-C` `resolution_status: resolved` and its formal record file exists at this commit) and DEC-20260905-D item 7 / DEC-20260905-E item 6 (substantiate, not withdraw, the two relation edges via the underlying Notion rows and each target record's own reciprocal prose — `DEC-20260409-A.md`'s own merged body already names `DEC-20260409-D` as the gate that filled its stated gap). Per rule (a)/(the brief's rule that a relation whose basis DEC-20260905-D/E/F states is substantiated), these are not findings against `DEC-20260409-D`. DEC-20260905-C separately classifies the underlying structural gap (frontmatter relation not narrated in the record's own body) as a real, standing, non-withdrawn observation from the prior round ("not a misquote... outside the five classes this record withdraws statements under") — noted here for completeness, but per DEC-20260905-D/E it is substantiated overall and not a fresh finding in this round.
- **`DEC-20260314-C`** (false "found no match" grep claim) — DEC-20260905-G item 1: re-ran `grep -ril "multi-llm\|ChatGPT evaluation" docs/` myself; returns matches (see Finding/observation #2 above on the exact count). The underlying substantive claim (no recurring scheduled multi-model evaluation job exists) is correct either way.
- **`DEC-20260404-A`** (TDQS grep undercount) — DEC-20260905-G item 4: independently ran a repository-wide `TDQS` search; found matches beyond the single file the original record cited, consistent with DEC-20260905-G's correction that more than one file matches.
- **`DEC-20260315-A`, `DEC-20260315-B`, `DEC-20260404-A`** frontmatter/body agreement otherwise unaffected by these corrections; all five protected sections and CAUTION banners intact per the structural sweep below.

No correction reviewed above was itself found wrong.

### Ten code-claim spot checks

1. `DEC-20260313-E.md` — `strale-io/strale-frontend@04c9fca9:src/components/Header.tsx:10` — confirmed `{ label: "Trust", href: "/trust" }` at line 10 exactly.
2. `DEC-20260314-B.md` — `strale-io/strale-frontend@04c9fca9:src/App.tsx` — confirmed no `/blog` route; `/trust` and `/trust/methodology` both route to `Methodology` at lines 83-84.
3. `DEC-20260314-G.md` — `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx:146-147` — confirmed "One API call." / "Verified data your agent can trust." verbatim.
4. `DEC-20260329-A.md` — `strale-io/strale-frontend@04c9fca9:src/index.css` — confirmed `--pink: 330 59% 69%`, `--purple: 262 42% 70%`, `--info: 262 42% 70%`, `--success: 149 39% 62%`, `--warning: 36 73% 57%`, `--teal: 149 39% 62%`, `--destructive: 0 65% 68%`, all exact matches; confirmed none of the seven hex values from the row appear in `design/tokens/active.json`.
5. `DEC-20260316-A.md` — `apps/api/src/lib/trust-grade.ts` — confirmed `computeTrustGrade` has zero call sites outside its own file (`grep -rn "computeTrustGrade" apps/api/src --include=*.ts` matches only `trust-grade.ts`).
6. `DEC-20260318-A.md` — confirmed no `seed.ts` file exists anywhere under `apps/api` (`find apps/api -iname "seed.ts"` returns nothing).
7. `DEC-20260409-A.md` — `apps/api/src/lib/test-runner.ts:1603-1604,1728` — confirmed `NULL_RATIO_RULE_ENABLED` feature flag and comment verbatim, and the `null-ratio-shadow-would-fail` log label at line 1728.
8. `DEC-20260410-A.md` — `apps/api/src/lib/progressive-unlock.ts` — confirmed `UNLOCK_TTL_MS = 24 * 60 * 60 * 1000` (24-hour TTL) and `UNLOCK_MAP` structure.
9. `DEC-20260411-B.md` — confirmed `bank-bic-lookup` does not appear in `gate5-path-coverage.ts` or `onboard.ts` (absence claim verified true).
10. `DEC-20260313-F.md` — confirmed `server.json` `version: "0.2.3"` (top-level and `packages[0]`), `remotes: [{"type":"streamable-http","url":"https://api.strale.io/mcp"}]`; confirmed `packages/mcp-server/package.json` `version: "0.2.8"`.
11. (extra) `DEC-20260323-A.md` — confirmed `apps/api/src/lib/test-runner.ts:2116-2117` lists `computeAdaptiveInterval`, `getLastTestRun`, `runAdaptiveScheduler`, `startScheduledTests`, `repairStaleScores`, `persistDualProfileScores` as removed; confirmed zero matches for `legacy_score` in `apps/api/src`; confirmed `capability_health` (not `source_health`) is still the live table name in `apps/api/src/db/schema.ts`.
12. (extra) `DEC-20260405-A.md` — confirmed commit `cb787ed9b2fbfadf61ea401c29d1fd47ac4e9214` exists, dated 2026-04-22 (13 days after the row's 2026-04-09 "PARKED" note); confirmed `BOLAGSVERKET_CLIENT_ID`/`_SECRET` in `config/env-manifest.yaml`; confirmed `apps/api/src/capabilities/swedish-company-data.ts` fetches `gw.api.bolagsverket.se/vardefulla-datamangder/v1` via OAuth2 against `portal.api.bolagsverket.se/oauth2/token`, with the code comment "DEC-20260405-A Phase 2: replaced Allabolag scraping with direct Bolagsverket API."

(12 spot checks performed, exceeding the required 10; all verified true as stated.)

### Structural checks (all 40 records)

- Frontmatter parses; `record_key`, `id`, and filename agree for all 40 (bare keys throughout this partition; no `--notion-`/`--git-` qualified files in P2).
- CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present in all 40.
- Evidence paths: every non-URL, non-cross-repo evidence path in all 40 records exists as a file at this commit (spot-checked programmatically — 66 distinct paths, all resolved). The four cross-repo `strale-io/strale-frontend@04c9fca9:...` entries (in `DEC-20260313-E`, `DEC-20260314-B`, `DEC-20260314-G`, `DEC-20260329-A`) all resolve via `git -C strale-frontend show 04c9fca9:<path>` after `git fetch origin`.
- Relations in this partition: `DEC-20260314-A` <-> `DEC-20260314-B` (`related_to`, reciprocal, both bodies narrate the connection); `DEC-20260405-A` -> `DEC-20260320-B` (`related_to`, named directly in Context prose, target exists as a formal record); `DEC-20260409-B` -> `DEC-20260409-A` (`related_to`, quoted directly: "RELATED: DEC-20260409-A ... Both are hardening measures from the SpendLatch Bug Fix Framework Phase 3 work"); `DEC-20260409-D` -> `DEC-20260409-A`, `DEC-20260409-D` -> `DEC-20260409-B` (`related_to`, both substantiated per DEC-20260905-D/E as detailed above, not narrated in `DEC-20260409-D`'s own body but substantiated elsewhere); `DEC-20260411-A` -> `DEC-20260302-A-0001` (`amends`, target exists, not a collided id, and its own evidence array cites `DEC-20260411-A.md` back reciprocally). No relation target in this partition is a bare collided id (checked `docs/decisions/id-collisions.yaml`). Every other record in this partition has `relations: []` and correctly declines to create an edge where its own source text names an ID with no formal record (`DEC-20260311-A` for `DEC-20260315-B`, confirmed absent and not in `id-collisions.yaml`; `DEC-20260405-B` and `DEC-20260225-P-m5n6` for `DEC-20260405-A`, both later corrected by DEC-20260905-E as detailed above; `DEC-20260409-C` for `DEC-20260409-D`, corrected by DEC-20260905-E).
- Null/populated field checks: cross-referenced every "`Superseded By` and `Outcome` are both null" claim (24 of the 40 records) against the `dump_rows.py` output's reported null fields for that page id; all matched. `DEC-20260320-E` and `DEC-20260320-F` (Outcome populated, quoted directly) and `DEC-20260321-A`, `DEC-20260404-A` (Outcome populated, quoted directly) correctly do NOT claim Outcome is null, consistent with the dump showing Outcome absent from their null-field lists.
- `DEC-20260317-F`'s Context correctly declines to name a relation for "the automated >= 50 qualification gate," having checked the titles of four sibling records (`DEC-20260316-A`, `DEC-20260316-B`, `DEC-20260318-A`, `DEC-20260318-B`) and found none matches; confirmed all four titles directly and confirmed none is an "automated gate at 50" record.

### Unverifiable

None. Every claim in this partition's 40 records — including all claims resting on Notion row content, which required the `dump_rows.py` pull rather than assumption — was independently checked against a repo file at this commit, a resolvable cross-repo entry, a resolvable commit, `docs/decisions/id-collisions.yaml`, or a dumped Notion row field.

### Setup notes

Worktree `C:/tmp/strale-closing8-P2` created detached at `48339ec29d7f768c7e51736f88659239c75ad6a7`; `npm ci` completed there. `strale-frontend` fetched from origin before resolving cross-repo entries. No edits made in the worktree. Worktree removed at the end of this review (see below).

PARTITION VERDICT: PASS

### P3

# Closing review, round 8 (final round), partition P3

Commit reviewed: 48339ec29d7f768c7e51736f88659239c75ad6a7
Record count: 39 files (list below)

DEC-20260413-A, DEC-20260415-A, DEC-20260415-B, DEC-20260416-A, DEC-20260419-A,
DEC-20260420-A, DEC-20260421-J, DEC-20260421-L, DEC-20260422-B, DEC-20260422-C,
DEC-20260422-D, DEC-20260422-H, DEC-20260423-A, DEC-20260423-B, DEC-20260424-A,
DEC-20260425-A, DEC-20260425-B, DEC-20260427-A, DEC-20260427-B, DEC-20260427-H,
DEC-20260427-I, DEC-20260428-A, DEC-20260428-B, DEC-20260429-A, DEC-20260430-A,
DEC-20260503-A, DEC-20260503-B, DEC-20260504-A, DEC-20260504-B, DEC-20260504-C,
DEC-20260505-A, DEC-20260505-B, DEC-20260505-C, DEC-20260505-G, DEC-20260505-H,
DEC-20260506-G, DEC-20260507-D, DEC-20260507-E, DEC-20260507-F, DEC-20260507-G,
DEC-20260507-H

### Method

Worked in a detached worktree at C:/tmp/strale-closing8-P3, npm ci'd. For every
record: parsed frontmatter and checked record_key/id/filename agreement and
boilerplate fields (authority_scope: none, authority_active: false,
migration_status: candidate, phase: M2) with a small node script against
scripts/decision-records-lib.mjs's readDecisionRecords, plus a manual grep
sweep for the CAUTION banner and the five protected section headings across
all 39 files (zero misses). Read every one of the 39 files in full. Read
DEC-20260905-B through -H (the seven prior rounds' withdrawal records) in
full first, since round 8's rule (a) makes anything they withdraw a
correction, not a finding, and built a map of which of my 39 files each one
touches. Verified every code claim (file/line/grep/commit-resolves) directly
against the commit's tree in the worktree. Verified Notion-row quotations
either via the operator checker (below) or, for one claim explicitly
attributed to a Notion page BODY rather than the export (DEC-20260429-A's
four re-evaluation triggers), via a direct notion-fetch of page
35167c87082c8172bff8f3485699c961: confirmed the "Re-evaluation triggers"
section lists exactly the four triggers the record states (already verified
in round 4 per DEC-20260905-E; I re-verified it myself rather than taking
that on faith). Checked docs/decisions/id-collisions.yaml for every
sibling-collision-state claim my partition's records make. Cross-checked
every relation target for existence and body substantiation (declared
directly, or substantiated by an amending record per the round 3+ relation
rule).

**Operator checker.** Ran `node scripts/m2-quote-fidelity.mjs --export
<scratchpad>/decisions-export-raw.txt --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only`
per file in my partition. Logic in one sentence: for every double-quoted
span of at least 12 characters in a record's body, normalize it and every
candidate source (parsed Notion row fields, named repo files at this
commit, sibling records, the frontend checkout) per the stated convention,
and report a span as a residual if no candidate source contains it as an
ordered substring.

**Result: 41 files reported by the tool for the 39 files given via --only
(the tool's own line double-counts none of mine; the per-file lines match
my 39 file list exactly), 146 spans, 145 faithful, 1 residual.**

Residual list and classification:

- `docs/decisions/records/DEC-20260416-A.md:82`: `"the first-party MCP is
  the only surface that exposes Strale's differentiated metadata"`. Best
  match reported: a different record (wrong). **Classification: checker
  miss.** I dumped the row (page 34467c87082c81208727dab42331cae4)
  directly: its Rationale field reads "...first-party MCP is the only
  surface that exposes Strale's differentiated metadata (SQS, limitations,
  structured errors)", with no leading "the". The record's own Rationale
  section (lines 44-45, unquoted prose) already paraphrases this as "the
  first-party MCP is the only surface that exposes Strale's differentiated
  metadata" for readability. The Consequences-section occurrence the
  checker flagged is a **self-quotation of the record's own earlier
  prose**, not a fresh claim about the Notion row's exact wording: exactly
  the checker-miss class DEC-20260905-D/E/F's own reconciliations
  established ("a self-quotation of the same record's own earlier text").
  Not a finding.

### Findings

1. **`docs/decisions/records/DEC-20260503-A.md:60-62`** (Consequences).
   The record states: "The source page also says this decision extends the
   product decision filed as `DEC-20260502-A` and refines
   `DEC-20260420-E`, `DEC-20260420-F`, and `DEC-20260420-H`. Each of those
   historical IDs is reused by a different Notion row. Their structured
   amendment edges are therefore withheld and preserved as **unresolved
   source-ID collisions** rather than aimed at an ambiguous target."
   **False as stated at this commit.** All four ids are `resolution_status:
   resolved` in `docs/decisions/id-collisions.yaml` (lines 415-417 for
   DEC-20260502-A, 239-241 for DEC-20260420-E, 255-257 for DEC-20260420-F,
   287-289 for DEC-20260420-H), each with an existing resolution-evidence
   report and formal-record dispositions (`disposition: formal_record`
   present in each block, confirmed by grep). This is the same recurring
   defect class rounds 2, 3, 4, 6 and 7 found and withdrew via
   DEC-20260905-C/D/E/G/H (a statement that a sibling id is an unresolved
   collision, true when drafted, false once a later batch resolves it),
   but this specific instance, on this specific record, is not named by
   any of DEC-20260905-B through -H. I grepped every withdrawal record for
   "DEC-20260503-A" to confirm; the only hit (DEC-20260905-C:570) is an
   unrelated passing mention of DEC-20260503-A as a superseded-record name,
   not this collision-state claim. This is a fresh, unwithdrawn finding.

2. **`docs/decisions/records/DEC-20260422-D.md:87-89`** (Consequences).
   The record states: "No manifest schema field (`manifests/*.yaml`)
   carries `license_url` or `source_note`; population happens entirely
   inside the executor's `buildProvenance()` call, not through the
   onboarding manifest pipeline..." **False as literally stated.**
   `manifests/doi-resolve.yaml` carries a `license_url` field twice (line
   42, a sample output value; line 108, an `output_field_reliability`
   entry). This is a different, unrelated field: the DOI-resolve
   capability's own domain output describing the licence URL of the
   referenced academic paper, not the `RichProvenance` envelope's
   attribution field this record's Decision section is about, so the
   record's underlying substantive point (the manifest onboarding pipeline
   does not populate `RichProvenance.license_url`/`source_note`; population
   is in-code in the executor) is not disturbed. But the literal,
   unqualified "no manifest schema field... carries license_url or
   source_note" claim is false: `manifests/doi-resolve.yaml` does contain
   a field with that exact name. This is the same "finds only"/"no
   matches" defect class rounds 2 and 6 confirmed and withdrew elsewhere
   (DEC-20260314-C, DEC-20260404-A) and is not withdrawn by any of
   DEC-20260905-B through -H for this record.

No other false, fabricated, misattributed, or unverifiable statement found
in my partition. Every already-withdrawn statement I located in my
partition's files (below) is present verbatim, unedited, exactly as the
withdrawal records describe: consistent with the active-record
immutability rule, and not counted as a fresh finding per round 8's rule
(a):

- DEC-20260413-A:90 ("aggressive addition when free to maintain"), withdrawn by DEC-20260905-D item 8.
- DEC-20260419-A:106-107 (justification-comment misattribution), withdrawn by DEC-20260905-B item 3.
- DEC-20260420-A ("we still hand-write; just in TS, not SQL files"), withdrawn by DEC-20260905-C item 33.
- DEC-20260422-B ("leave the row, mark it, don't delete"), withdrawn by DEC-20260905-D item 11.
- DEC-20260422-H (quoting DEC-20260430-A's own stale collision sentence), explicitly excused by DEC-20260905-G item 6's own text ("DEC-20260422-H.md itself quotes this same sentence... not a fresh defect in DEC-20260422-H"); verified the quotation is faithful to DEC-20260430-A.md at this commit.
- DEC-20260425-A:177-180 (manifest-declared-field misattribution), withdrawn by DEC-20260905-B item 12.
- DEC-20260427-H (false "no record for DEC-20260420-H exists"), withdrawn by DEC-20260905-D item 12.
- DEC-20260427-I (fabricated "(Phase 2a/2b)" composite; reordered northdata/KRS-by-number quote), withdrawn by DEC-20260905-D items 13-14.
- DEC-20260428-B's `related_to` relation to DEC-20260428-A (not narrated in body), substantiated by DEC-20260905-D item 15.
- DEC-20260430-A (stale "unresolved collision"/"unmigrated" claim about DEC-20260420-K/DEC-20260422-H), withdrawn by DEC-20260905-G item 6; its two `related_to` relations to DEC-20260428-A/DEC-20260428-B, substantiated by DEC-20260905-F items 1-2 and restated in DEC-20260905-H items 2-3.
- DEC-20260503-B ("tiered audit trail" word-transposition, appearing in the record's own Consequences prose), withdrawn by DEC-20260905-D item 16.
- DEC-20260505-H (misattributed "not set in production" quote to OPENSANCTIONS_API_KEY's cost_note), withdrawn by DEC-20260905-F item 3.
- DEC-20260506-G (Kyckr quotation misattributed to DEC-20260507-D instead of DEC-20260507-F; false "no formal record exists" claim about DEC-20260422-H), withdrawn by DEC-20260905-B item 38 and DEC-20260905-H item 4 respectively.
- DEC-20260507-D (inserted "the" before "readiness program adopted"), withdrawn by DEC-20260905-D item 17.
- DEC-20260507-G (date-math error, "one day after DEC-20260518 batch work"), withdrawn by DEC-20260905-C item 39.
- DEC-20260505-A/B/C/507-E/G/H (mid-sentence truncation punctuation differences noted by DEC-20260905-C's Consequences as convention-covered, not findings): style only, confirmed not findings under the quotation convention.

### Ten code-claim spot checks

1. `apps/api/scripts/check-no-new-console.mjs:1-16`, DEC-20260419-A: header
   comment lists the two fail conditions; contains no "justification
   comment" phrase (confirms the already-withdrawn misattribution).
2. `apps/api/scripts/console-allowlist.json`, DEC-20260419-A: 24 entries,
   `app.ts:4`, `index.ts:8`, `self-heal-check.ts:2`: matches record exactly.
3. `apps/api/package.json`, `apps/api/drizzle.config.ts`,
   `.github/workflows/ci.yml:176`, DEC-20260420-A: no `db:generate` script,
   `drizzle.config.ts` exists, `drizzle-kit push --force` runs in the CI
   integration-db lane: matches record.
4. Commits `be0c7888`, `b86d431a` resolve on `main`; `972b860`, `2a1cc24` do
   not (`git log --format=%H -1 <sha>` fails on both), DEC-20260421-J/L:
   matches record's claim that only the first commit of each Outcome pair
   resolves.
5. `apps/api/src/capabilities/auto-register.ts:161-194`, DEC-20260427-I:
   REACTIVATED/MIGRATED comments for dutch/portuguese/lithuanian/spanish/
   german/austrian all present verbatim as quoted; none of the six slugs
   appears in a `DEACTIVATED[...]` entry: matches record.
6. `apps/api/src/lib/provenance-builder.ts:244-287`, DEC-20260425-A:
   `getProcessingJurisdictions()` still composes from
   `capabilityType`/`transparencyTag`; the "NOT YET captured" comment is
   present: matches record's claim that the manifest-declared field
   replacement was never implemented.
7. `apps/api/src/db/schema.ts:220-235,1003-1024`, DEC-20260503-B:
   `qpScore`, `rpScore`, `matrixSqs`, `matrixSqsRaw`, `trend`,
   `guidanceUsable/Strategy/Confidence`, and the `sqs_daily_snapshot` table
   are all still present: matches record's claim that PR2 has not shipped.
8. `apps/api/src/lib/lifecycle.ts:6,148`,
   `apps/api/scripts/lifecycle-transition.ts:9`,
   `apps/api/src/lib/matching.ts` (`betterRate`), DEC-20260505-B/C: header
   comment, sweep-removal note, and the price/slug tiebreaker code all
   match the records' quoted text verbatim.
9. `docs/decisions/id-collisions.yaml` (DEC-20260420-K block, line 335),
   DEC-20260430-A/DEC-20260422-H: `resolution_status: resolved`, confirming
   the stale claim in DEC-20260430-A (already withdrawn) and the accuracy
   of DEC-20260422-H's faithful-but-now-stale quotation of it.
10. `manifests/bulgarian-company-data.yaml:54`,
    `manifests/cypriot-company-data.yaml:83`,
    `manifests/luxembourgish-company-data.yaml:54`,
    `manifests/hungarian-company-data.yaml:54`, `config/env-manifest.yaml`
    (`OPENAPI_ENABLED` row), DEC-20260507-G/H: all four countries route
    through Openapi.com Tier-3, gated `OPENAPI_ENABLED=false`, matching
    both records' claim that the self-build/deferred paths they decided
    were not what shipped.

(Many more code claims were verified beyond these ten; see inline notes
above for DEC-20260421-J/L commit resolution, DEC-20260422-B DEACTIVATED
map entries, DEC-20260423-A/B commit and file checks, DEC-20260427-A/B
commit and file checks, DEC-20260427-H DEACTIVATED map, DEC-20260428-A/B
cross-references, DEC-20260504-A/B/C commits and test file, DEC-20260505-G
vendor-anchor absence, DEC-20260505-H env-manifest row, DEC-20260506-G
auto-register.ts comment, DEC-20260507-D/E/F content.)

### Unverifiable

- The point-in-time production/database-state claims every one of my
  records itself already flags as unverified from read-only repository
  evidence (e.g., DEC-20260421-J/L's and DEC-20260422-B's own caution that
  a record is never proof of production state; DEC-20260503-A's "current
  vendor answers come from... live database facts... not this record";
  DEC-20260429-A's unresolved EUR 1,500 vs EUR 100 trigger inconsistency;
  which OpenRegister/Cobalt billing tier is live for DEC-20260505-G/H and
  DEC-20260507-D/E). These are not findings: each record already states
  its own uncertainty rather than asserting a fact, consistent with
  DEC-20260905-C through -H's own "Not adopted" treatment of this class.
- DEC-20260421-J/L's second Outcome commits (`972b860`, `2a1cc24`) do not
  resolve as commit objects in this repository, exactly as the records
  themselves already note ("cited in prose only"); I could not verify them
  further and the records do not claim more than that.

### PARTITION VERDICT: FAIL

### P4

# Closing review, round 8 (final round), partition P4

Commit: `48339ec29d7f768c7e51736f88659239c75ad6a7`
Records reviewed: 41 (`DEC-20260507-I.md` through `DEC-20260904-B.md`, per `closing8-P4.txt`)

### Method

Set up a detached worktree at the pinned commit (`C:/tmp/strale-closing8-P4`), ran `npm ci` there. For every record: parsed frontmatter and confirmed `record_key`/`id`/filename agreement; confirmed the CAUTION banner and the five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present; ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only` per file in the partition; read every residual directly against its actual source, using `dump_rows.py PAGE:<id>` for Notion database-row properties and `notion-fetch` for Notion page BODY content when a quotation was not in the row's properties; checked every `evidence` entry for existence (repo-relative paths checked with a script; cross-repo `strale-io/strale-frontend@<sha>:<path>` entries resolved against the fetched sibling checkout; the one `strale-io/strale@<sha>` and one `codex/repo-native-operating-model@<sha>:<path>` entry resolved with `git cat-file -e` in this repository); checked every `relations` target exists as a record key at this commit, is not a bare collided id (checked against `docs/decisions/id-collisions.yaml`), and is substantiated in ordinary prose; spot-checked no-null/null-field claims against dumped Notion rows for a sample of records; and spot-checked ten "status on main" code claims by reading the named files directly. No record in this partition is `--notion-` or `--git-` qualified, so check (8) does not apply to any file here.

### Checker run and residuals

`node scripts/m2-quote-fidelity.mjs` at `--min-chars 12` over the 41-file partition: **118 spans checked, 105 faithful, 13 residual**. Classification of every residual:

1. **`DEC-20260508-A.md:78`**, two spans: `"no Tier-1 path exists"` and `"a Tier-1 path\nexists but has a fixed floor,"` — **GENUINE FINDING** (see Findings item 1 below). Not a checker miss: neither `DEC-20260507-H.md` (the "prior row" the sentence names) nor its Notion row (dumped via `PAGE:35967c87082c8144bb94c56b63478754`) contains either phrase.
2. **`DEC-20260510-A.md:86`**, `"promote a\nuseful handoff note to tracked,"` — checker miss. Self-referential paraphrase of the record's own Decision text (`"promote genuinely useful untracked session-handoff notes to tracked files"`), not attributed to any external source.
3. **`DEC-20260518-A.md:100`**, `"Evidence Tier 1/2/3"` — checker miss. The record's own label, defined in its own Decision section; the Consequences sentence names it as a negative grep-result claim, not a quotation of an external source. Verified the underlying claim: `grep -rn evidence_tier apps/api/src manifests docs/company/claims.yaml` returns no matches, consistent with the record.
4. **`DEC-20260518-B.md:55`**, `"can this country deliver\nT1/T2/T3"` — checker miss. Self-referential rhetorical illustration, matches the record's own Context sentence, not attributed to any source.
5. **`DEC-20260518-D.md:43`**, `"does Strale return this today"` — checker miss. Self-referential paraphrase of the record's own Decision text.
6. **`DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md:26`**, `"The burden collapses"` — checker miss. Verified via `notion-fetch` on the page body (not in the properties `dump_rows.py` reads): body reads `"Adopt **The burden collapses** as the second homepage proof section."` Faithful.
7. **`DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md:28`**, `"Selection Violet"` — checker miss. Verified via `notion-fetch` page body: `"Adopt the Enrichment & Validation chapter in **Selection Violet** as the second homepage use-case world."` Faithful. (Body also states `"This extends `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`..."`, directly substantiating the declared relation.)
8. **`DEC-20260820-E-WEBSITE-SEARCH-WEB.md:28` and `:63`**, both `"not a live ranking"` — checker miss. Verified via `notion-fetch` page body: `"The proof is explicitly labelled **not a live ranking**."` Faithful, both occurrences.
9. **`DEC-20260827-A.md:40`**, `"licensed contract with the\nAustrian Justizministerium for direct Firmenbuch API access"` — checker miss. Verified faithful to the record's own Notion row's Rationale field (dumped via `PAGE:3c967c87082c81be9ebac7982b89a36a`), which itself contains this exact quoted phrase attributed to `DEC-20260427-I-6`. `DEC-20260427-I-6` is not a file in this repository and not in `id-collisions.yaml` (the existing `DEC-20260427-I.md` is a different, unrelated id), but the record's `relations` array is empty, so no relations check applies to that dropped id; this is the Notion row's own historical reference, faithfully carried over, not something the .md record fabricated. Not a defect against the fidelity convention (the quotation matches its named source, the row).
10. **`DEC-20260904-A.md:180`**, the multi-line quote from the closing register's `closes_when` clause — checker miss. Verified verbatim against `docs/project/m2-closure-register.yaml:5149-5151` (reflowed line breaks and bold markup only). That file is not in this record's `evidence:` array but is named repeatedly in its prose; per the DEC-20260905-H "Not adopted" convention this class ("a quotation verified faithful to a file not listed in the record's own evidence array but named in its prose") is an explicitly recognized checker miss.
11. **`DEC-20260904-B.md:102`**, `"where did this id's authority come from"` — checker miss. Self-referential rhetorical phrase in the Rationale section, not attributed to any external source.

**Net: 1 genuine finding (item 1, two spans in the same record), 12 checker misses**, all reconciled against a located, quoted source.

### Findings

1. **`DEC-20260508-A.md:78`** — In the Rationale section, the record writes: `"the prior row's \"no Tier-1 path exists\" finding is corrected to \"a Tier-1 path exists but has a fixed floor,\""`, presenting these as quotations of "the prior row" (identified earlier in the same record as `DEC-20260507-H`). Neither phrase appears in `DEC-20260507-H.md` (grep for `"Tier-1"`/`"fixed floor"`/`"Tier-1 path"` in that file returns nothing relevant) nor in that row's own Notion Rationale field (dumped via `PAGE:35967c87082c8144bb94c56b63478754`), which reads: `"neither country has a Tier-1 doctrine-clean v1-economic path"` — a different form. The record's own Notion row (dumped via `PAGE:35a67c87082c8139993eea13b6235b67`) contains a related but distinct quotation earlier in the same paragraph (`"Refines DEC-20260507-H imprecise rationale ('no Tier-1 free path; only €42-100/mo subscription wrappers')"`), already correctly quoted verbatim elsewhere in the record (line 62-64, checker-faithful). The two quotations at line 78 are the record's own compressed paraphrase of that paraphrase, presented in quotation marks as if directly sourced, and are not literal substrings of any named source. This is a finding under the convention ("a composite presented as one quotation" / "a quotation whose named source does not contain it"); it is not withdrawn by any of `DEC-20260905-B` through `-H` (the only prior finding against `DEC-20260508-A` is an unrelated evidence-array URL accent discrepancy, noted as unverifiable in `DEC-20260905-C`, not this quotation issue).

No other findings in this partition. Structure (frontmatter/id/filename agreement, CAUTION banner, five protected sections), evidence-path resolution, relation-target existence/substantiation/non-collision, and the null-field spot checks were all clean.

### Ten code-claim spot checks

1. `DEC-20260508-A.md` — `manifests/hungarian-company-data.yaml` `data_source: Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries)` at line 54; commit `9ee19282` dated 2026-05-16. Confirmed.
2. `DEC-20260518-A.md` — `apps/api/src/capabilities/uk-company-data.ts:226-227` sets `ubo_availability = "available"` with the PSC-register reason string; `apps/api/src/capabilities/danish-company-data.ts:183-184` sets `ubo_availability = "unavailable_no_registry"` with the "in progress" reason string. Confirmed.
3. `DEC-20260518-A.md` — grep for `evidence_tier` across `apps/api/src`, `manifests/`, `docs/company/claims.yaml` returns no matches. Confirmed.
4. `DEC-20260518-B.md` — grep for `use_case_tier` across the same three targets returns no matches; "Enhanced Due Diligence" (case-insensitive, per the normalization convention) appears in `aml-risk-score.ts`, `risk-narrative-generate.ts` (as "Enhanced due diligence"), `solution-catalogue.ts`, and `manifests/adverse-media-check.yaml` (as "enhanced due diligence"). Confirmed.
5. `DEC-20260513-C.md` — `apps/api/src/jobs/test-scheduler.ts` implements a stable-hash, per-minute stagger (`POLL_INTERVAL_MS`, `BATCH_SIZE`, "Hash-stagger modulo 60" at line 225). Confirmed.
6. `DEC-20260515-B.md` — none of `manifests/us-ny-company-data.yaml`, `us-co-company-data.yaml`, `us-sam-entity.yaml` exist; `manifests/us-company-data-cobalt.yaml` and `apps/api/src/capabilities/us-company-data-cobalt.ts` exist and the manifest states "50-state Secretary of State live SoS data" / "Cobalt Intelligence (50-state SoS live)". Confirmed both halves (Tier 1 states never built; Tier 2 shipped as one 50-state capability, not the 8-state split).
7. `DEC-20260517-A.md` — `apps/api/coverage-matrix/README.md`, `schema.json`, `.migration-snapshot.json` all exist. Confirmed.
8. `DEC-20260812-A.md` — `docs/strategy/2026-08-05-direction-plan.md` and `docs/strategy/2026-08-12-platform-readiness-program.md` both exist. Confirmed.
9. `DEC-20260822-A.md` — `apps/api/src/lib/production-authority.ts` exports `Authority`, `AUTONOMOUS_PURPOSES`, `AutonomousPurpose`, `ProductionAuthorityError`, `assertCannotMintGrants`, `autonomousAuthority`, `parseGrantToken`, `requireFounderGrant`, `productionWriteUrl`. Confirmed (matches CLAUDE.md's binding claim).
10. `DEC-20260904-B.md` — `scripts/m2-closure-register-lib.mjs` defines `GIT_QUALIFIED_RECORD_KEY = /^(.+)--git-([0-9a-f]{7,40})$/` and surrounding logic implementing the git-qualified mechanism the record describes. Confirmed.

### Evidence resolution

All repo-relative evidence paths in the 41 records exist at the pinned commit (checked by script; zero missing). Cross-repo entries, all resolved:
- `strale-io/strale-frontend@04c9fca970d82b2c98145973816d52086b3b91d7:public/_headers` (`DEC-20260513-A.md`) — exists.
- `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/` (six WEBSITE records) — directory exists with content.
- `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-risk-verification-v1.7.md`, `.../foundations/responsive-content-conformance-v1.0.md`, `.../homepage/round-09-four-world-responsive-review/four-world-conformance-report.md` (`DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md`) — all three exist.
- `strale-io/strale@3f7f650ff070f667a425b743f5a97034bc43f4a3` (`DEC-20260822-A.md`) — commit exists in this repository.
- `codex/repo-native-operating-model@b29510949500ade9c00c4a61912baeb9dc98389a:archive/imports/context-pack/2026-08-31/manifest.json` (`DEC-20260901-A.md`) — commit and path exist in this repository.

### Relations

All declared relation targets exist as record keys at this commit, none is a bare collided id (checked against `docs/decisions/id-collisions.yaml`), and each is substantiated by ordinary prose naming the target (no "Relation to" labelled paragraphs are used in this partition, which is not itself a finding per the review rules): `DEC-20260508-A`→`DEC-20260507-H`, `DEC-20260508-D`→`DEC-20260505-H`, `DEC-20260511-B`→`DEC-20260503-B`, `DEC-20260511-C`→`DEC-20260420-A`, `DEC-20260511-E`→`DEC-20260511-F`, `DEC-20260515-A`→`DEC-20260430-A`, `DEC-20260515-B`→`DEC-20260515-A`, `DEC-20260518-B`→`DEC-20260518-A`, `DEC-20260518-C`→`DEC-20260518-B`, `DEC-20260518-F`→`DEC-20260428-A`, `DEC-20260518-G`→`DEC-20260518-E`, `DEC-20260812-A`→`DEC-20260503-A`, `DEC-20260813-A`→`DEC-20260518-F`,`DEC-20260428-A`, `DEC-20260815-A`→`DEC-20260812-A`, `DEC-20260820-D`→`DEC-20260820-C`, `DEC-20260820-F`→`DEC-20260820-C`,`DEC-20260820-D`,`DEC-20260820-E`, `DEC-20260822-A`→`DEC-20260815-A`, `DEC-20260901-A`→`DEC-20260831-A`.

### Null-field spot checks

Cross-checked null/populated field claims against dumped Notion rows for `DEC-20260507-I`, `DEC-20260507-J`, `DEC-20260510-A`, `DEC-20260511-B`, `DEC-20260511-E`, `DEC-20260511-F`, `DEC-20260513-A`, `DEC-20260513-B`, `DEC-20260513-C`, `DEC-20260513-D`, `DEC-20260518-D`. All claims (which fields are null, which are populated) matched the dumped row's actual null-field list exactly.

### Unverifiable

Nothing in this partition was left unverifiable; every claim checked resolved to a definite true/false/faithful/not-faithful determination against a named, read source (repository file, sibling-repo file, git commit, Notion row property, or Notion page body).

### Withdrawal-record cross-check

Confirmed the one genuine finding in this partition (item 1, `DEC-20260508-A`) is not addressed by any of `DEC-20260905-B` through `-H`: those records' only prior note against `DEC-20260508-A` (in `DEC-20260905-C`'s "Not adopted" list) concerns an unrelated evidence-array URL accent discrepancy, left explicitly unresolved, not this quotation issue. No other record in this partition appears in any withdrawal record's Decision list.

PARTITION VERDICT: FAIL

### P5

# Closing review, round 8, partition P5

Commit: 48339ec29d7f768c7e51736f88659239c75ad6a7
Partition: P5
Record count: 34 (17 collision-id pairs: DEC-20260225-P-c5d6, DEC-20260303-A,
DEC-20260304-A, DEC-20260304-B, DEC-20260304-C, DEC-20260320-C, DEC-20260320-J,
DEC-20260320-K, DEC-20260405-B, DEC-20260406-A, DEC-20260406-B, DEC-20260406-C,
DEC-20260409-C (single formal record, one sibling documented_only), DEC-20260420-D
(single formal record, one duplicate-title sibling documented_only), DEC-20260420-E,
DEC-20260420-F, DEC-20260420-G, DEC-20260420-H)

I authored none of this batch and hold no authority over it; this is a
read-only review.

### Method

Set up a detached worktree at the pinned commit, ran `npm ci`, and read
every record in the partition file end to end against: the repo tree at
this commit, the sibling `strale-frontend` checkout (fetched, read via
`git show <sha>:<path>`), `docs/decisions/id-collisions.yaml`,
`docs/project/m2-closure-register.yaml`, and the Notion export via
`dump_rows.py` for every page id evidenced by these 34 records. For every
quoted span I normalized both the record's text and the candidate source
per the stated convention (transliterate EUR/x/>=/<=/->/..., lowercase,
strip non-alphanumeric, then substring-test; an ellipsis splits a quote
into ordered segments) and checked it by hand with grep/sed against the
actual file content, not from memory. I then ran the operator checker,
`node scripts/m2-quote-fidelity.mjs --export <export> --frontend
<sibling checkout> --min-chars 12`, with one `--only` per record in this
partition.

**Checker result:** 34 records, 243 quoted spans checked, 243 faithful,
**0 residual**. The checker's "faithful" only proves a quote's text
exists verbatim in *some* candidate source (it always includes CLAUDE.md,
every evidence-listed file, and every other record, regardless of what
the record's prose actually attributes the quote to) — it does not check
that the record attributes the quote to the *right* source. That gap is
exactly where Finding 2 below lives: the checker reports 0 residuals on
both files it appears in, because the misattributed phrase is real text
that exists in CLAUDE.md, just not in the record the prose says it comes
from.

I also independently verified frontmatter/`record_key`/filename agreement
and the five protected sections + CAUTION banner on all 34 files by
script (zero structural issues), and checked `id-collisions.yaml` +
`m2-closure-register.yaml` entries for every record's page id (matching
`record_key`, `disposition: formally_migrated`, `row_disposition:
formal_record`) — I sampled 5 of the 17 collision groups in full detail
and spot-checked the remaining 12 registry blocks; all matched.

### Findings

**Finding 1 — stale quantitative claim, repeated in two records; the
correcting record's affirmation of it is itself wrong.**
`docs/decisions/records/DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`,
Consequences section ("All 342 manifests under `manifests/*.yaml` now
declare `processes_personal_data`; 127 also declare
`personal_data_categories`.") and the same figures repeated in
`docs/decisions/records/DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`
line 150 ("All 342 manifests under `manifests/*.yaml` now declare
`processes_personal_data`"). At commit 48339ec2, `manifests/*.yaml`
contains **350** files, all 350 declare `processes_personal_data`, and
**129** declare `personal_data_categories` (verified: `ls manifests/*.yaml
| wc -l` = 350; `grep -l processes_personal_data manifests/*.yaml | wc -l`
= 350; `grep -l personal_data_categories manifests/*.yaml | wc -l` = 129).
The 342/127 figures are wrong at this commit. `docs/decisions/records/DEC-20260905-C.md`
line 561 explicitly reviewed and affirmed this exact claim in a prior
round ("the manifest-backfill counts (342/342, 127/342) this record
separately cites remain correct") — that affirmation is itself wrong at
this commit's manifest count, evidently because capabilities were added
to `manifests/` between whenever that affirmation was checked and commit
48339ec2 (the most recent commit touching `manifests/` is `4529f778`,
"eight agent-data capabilities from the Working Machines catalogue
review (#582)", which is consistent with a +8 shift). Per the round's own
rule, a correction is a finding when the correction itself is wrong; this
qualifies. The `PII_CATEGORY_ENUM` 14-entry count DEC-20260905-C's same
item also verifies is still correct (verified independently:
`onboarding-gates.ts:242-259` has exactly 14 entries, 12 original + 2
added 2026-04-30) — only the manifest-count figures are stale.

**Finding 2 — misattributed quotation, in two records.**
`docs/decisions/records/DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md`
line 66-68 states: "`DEC-20260812-A` (existing record) states the
direction plan's Part One, 'library-as-product,' is the adopted operating
strategy and that it 'supersedes... the Counterparty Assurance
rename/ICP,'". The same misattribution recurs in
`docs/decisions/records/DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`
lines 82-85: "`DEC-20260812-A` (existing record), which states it
'supersedes... DEC-20260502-A (Counterparty Assurance rename/ICP)... the
Counterparty Assurance framing is retired as primary product.'" I read
`docs/decisions/records/DEC-20260812-A.md` in full at this commit: its
Consequences section reads "The source decision explicitly supersedes
the Counterparty Assurance row named `DEC-20260502-A` and
`DEC-20260503-A`." There is no "rename" and no "ICP" anywhere in that
file (`grep -n "rename\|ICP" DEC-20260812-A.md` returns nothing). The
phrase "Counterparty Assurance rename/ICP" is verbatim from CLAUDE.md's
own `DEC-20260812-A` bullet ("Supersedes DEC-20260502-A (Counterparty
Assurance rename/ICP)..."), not from the formal decision record these two
records name as the source, and CLAUDE.md is not cited as an evidence
entry in either of these two records. This is a real misattribution: the
words are true and exist in the repo, but not where the record says they
come from. The "library-as-product... adopted operating strategy" half of
the same sentence in both records is accurate (confirmed against
`DEC-20260812-A.md`'s own text and Reversal conditions).

No other findings. All other quotations I hand-checked (well over 100
spans across the 34 records) matched their attributed sources under the
stated normalization, including all long, multi-sentence Rationale-field
quotations verified against the `dump_rows.py` export. No null field was
quoted as populated and no populated field was called null anywhere in
this partition (verified against the `dump_rows.py` null-field report for
all 34 pages). Every `evidence` entry I checked resolves (repo files,
cross-repo `strale-frontend@04c9fca9` entries, and Notion URLs). Every
`relations` target in this partition (DEC-20260320-B, DEC-20260420-A,
and each collision-qualified sibling record) exists as a record key at
this commit, is substantiated in prose naming the source and what the
relation rests on, and is never a bare collided id. All 17 qualified
collision groups checked against `id-collisions.yaml` have matching
`record_key`, `disposition: formal_record` on the collision block, and
the corresponding `m2-closure-register.yaml` rows carry `disposition:
formally_migrated` with the same `record_key`.

I separately verified that the stale "unresolved collision id in a later
G2 batch" characterization of `DEC-20260420-I` inside
`DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md` (Context,
around line 104-106) is already withdrawn by
`docs/decisions/records/DEC-20260905-G.md` item 5, and that withdrawal is
itself correct: `id-collisions.yaml`'s `DEC-20260420-I` block is
`resolution_status: resolved` with both rows `disposition: formal_record`,
and both named files (`DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md`,
`DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md`) exist on
disk. Per the round's rule (a), this is not a finding against the
original record.

### Checker residuals for this partition

None. The full run (`node scripts/m2-quote-fidelity.mjs --export
<export> --frontend <sibling checkout> --min-chars 12` with 34 `--only`
flags for this partition's files) reported:

```
Totals: 34 records, 243 spans, 243 faithful, 0 residual
```

Zero residuals to classify. (Finding 2 above is a defect the checker
cannot detect by design, since it treats CLAUDE.md, every evidence file,
and every other record as one undifferentiated pool of candidate
sources and never verifies that a quote's *attributed* source is the one
it's actually found in — this is not a checker bug, it is the checker's
declared scope, but it means "0 residual" is not the same claim as "0
misattributions.")

### Ten code-claim spot checks (file, line)

1. `apps/api/src/db/schema.ts:681-696` — `failedRequests` table shape
   matches DEC-20260225-P-c5d6's Consequences claim exactly (10 fields
   including the 6 named ones).
2. `apps/api/src/routes/do.ts:935,1163,1207,1265` — four
   `db.insert(failedRequests)` call sites, matching the "four call sites"
   claim in the same record.
3. `apps/api/src/routes/suggest.ts:43,83` — `GET /v1/suggest/typeahead`
   and `POST /v1/suggest` both defined, matching DEC-20260303-A's claim.
4. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx:138-318` —
   exactly 10 numbered section comments (1 through 10), matching
   DEC-20260304-A's "10 sections" claim, and confirming the record's own
   flagged discrepancy (comparison is section 4, not 2, as the record
   itself notes).
5. `apps/api/src/capabilities/auto-register.ts:15-22,242-... (DEACTIVATED
   map area)` — no `.d.ts` filter, no `MIN_EXPECTED_EXECUTORS`, no
   `process.exit(1)`; header comment matches DEC-20260320-C's claim
   verbatim.
6. `manifests/au-company-data.yaml:6,10,11,33-34` +
   `apps/api/src/capabilities/au-company-data.ts:4,9,17,20` — category,
   price, `ABN_LOOKUP_GUID` env var name all match DEC-20260320-C's
   second (au-company-data) record.
7. `apps/api/src/lib/platform-facts.ts:7-21` — the "Drift problem (cert
   audit 2026-04-30)" comment block matches DEC-20260320-J's and
   DEC-20260320-K's quoted excerpts verbatim.
8. `apps/api/src/lib/solution-executor.ts:11-13,76,110,143-144` —
   `parsePath`/`walkPath`/`resolveInputRef` doc comments match
   DEC-20260406-B's claim verbatim, including the `$steps[0].license.spdx`
   example.
9. `apps/api/src/lib/onboarding-gates.ts:242-259` — `PII_CATEGORY_ENUM`
   has exactly 14 entries (12 original + `nationality` +
   `political_affiliation`, added 2026-04-30 per inline comment),
   matching DEC-20260905-C's correction to DEC-20260420-D.
10. `apps/api/src/routes/verify.ts:19,24,29,256,362` +
    `apps/api/src/routes/transactions.ts:200` — `MAX_DEPTH = 50`,
    `AUTH_VERIFY_MAX_DEPTH = 50`, and the F-A-012 comments all match
    DEC-20260420-G's claims verbatim.

(Manifest count in check 6/9's neighbourhood is where Finding 1 lives —
see above; it is called out there, not re-listed as a eleventh spot
check.)

### Unverifiable

Nothing in this partition was left unverifiable. Every quotation, every
evidence path, every relation target, and every sampled code claim was
checked against the pinned commit, the sibling frontend checkout, or the
Notion export.

### Verdict

Two real findings (a stale quantitative claim affirmed-as-correct by a
prior correcting record, and a misattributed quotation repeated in two
records), both narrow, neither touching the substantive decision content
of any record, both independently verified by direct inspection rather
than inferred from the checker's clean run.

PARTITION VERDICT: FAIL

### P6

# Closing review round 8 (final round) — Partition P6

Commit: `48339ec29d7f768c7e51736f88659239c75ad6a7`
Record count: 39 files (32 formal candidate records, 7 amending records DEC-20260905-B through -H)

### Method and script

Read-only detached worktree at `C:/tmp/strale-closing8-P6` (`npm ci` run). Every record in the partition was read in full. Frontmatter, `record_key`/`id`/filename agreement, the CAUTION banner and the five protected sections were checked mechanically for all 39 files. Every `evidence:` entry was checked against the working tree (repo files with `-f`, the cross-repo `strale-io/strale-frontend@<sha>:<path>` entry with `git -C .../strale-frontend show <sha>:<path>` after `git fetch origin`, Notion URLs parsed with `dump_rows.py`). All 32 `--notion-`-qualified records' collision-registry and `m2-closure-register.yaml` bindings were checked programmatically (`disposition: formal_record` / `formally_migrated`, matching `record_key`). The one `--git-`-qualified record (`DEC-20260422-A--git-3b256587`) was checked against the register's `formal_records` entry for `source_kind: git-native`, `source_rows: []`, `git_provenance` equal to the record's own evidence[0], commit-prefix match and ancestry (`git merge-base --is-ancestor`). Relation targets were checked to exist as files and never be a bare collided id (cross-checked against `docs/decisions/id-collisions.yaml`'s 35 collided ids). Notion-attributed quotations were verified with `python dump_rows.py <out> PAGE:<id>` and read directly (never regex-sliced). Code/file claims were verified by reading the named file at the exact cited line.

Operator checker: ran `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only <file>` per record in my partition (39 `--only` flags). Result: **40 record entries** (one file's flag matched two report lines due to a wrapped output block, not a duplicate check), **627 spans checked, 532 faithful, 95 residual**.

#### Residual reconciliation (my partition only)

- **`DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md` line 59**: `"Phase 4 split into 4a and 4b"` — best match `DEC-20260421-D` (prefix 18). Read the source: `DEC-20260421-D`'s own frontmatter `title` is `"DEC-20260421-D — Phase 4 split into 4a (authority enforcement) and 4b (manifest completeness + bulk regen)"`. The quoted phrase drops both parentheticals with no ellipsis marker, so it is not a literal substring of the title under the stated convention. However, it is used in running prose as an informal shorthand label for the sibling record immediately after naming that record's own `record_key` in full (`the sibling row \`DEC-20260421-D--notion-...\` ("Phase 4 split into 4a and 4b") names as its own headline problem`) — the same descriptive-label convention seen elsewhere in the corpus (e.g. `DEC-20260507-D` referred to elsewhere as "the Kyckr-skip-for-v1 record", "the BYO-credentials record") and explicitly excused by `DEC-20260905-F`'s own "Not adopted" list as "a record's own rhetorical paraphrase or illustrative phrasing not attributed to any source." It is not presented as a quotation of a specific field, and the underlying relation and fact (the two records share the price-overwrite example) are true and independently verified (both records discuss the identical `lei-lookup` `price_cents=10`/`price_cents=5` example). **Classification: checker miss / non-finding** (informal label, not a false or misattributed quotation of a specific source).
- **`DEC-20260905-D.md` line 429, 451**: self-referential quotations of the record's own methodology prose ("the checker missed it", "checker miss, faithful to a source") — meta-commentary about the reconciliation process itself, not attributed to an external source. **Checker miss / non-finding**, same class `DEC-20260905-D`'s own Consequences section documents.
- **`DEC-20260905-F.md`, 6 residuals** (lines 176, 213, 249, 259, 275, 283 region): all are self-referential parsing artifacts inside `DEC-20260905-F.md`'s own recurring `"<quote>" ... Fact: ... reads "<quote>"` and "Not adopted" list sentence shapes — the checker's span extractor lands its boundary in connective prose rather than a genuine quotation boundary, the same class `DEC-20260905-D`/`-E` document for `DEC-20260905-C.md`. **Checker misses / non-findings.**
- **`DEC-20260905-G.md` line 348**: `"Rule (a) cross-check"` — best match `DEC-20260518-E.md` (spurious). Read the source: this is `DEC-20260905-G`'s own quotation of a partition reviewer's report table-heading language from round 6's own P3 report (a scratchpad artifact, not a corpus file), used to describe how that round's own review re-verified a substantiation. Not attributable to any file in the checked candidate set. **Checker miss / non-finding** (meta-commentary about the review process, the same class as quoted grep/search commands).

All 95 residuals in my partition are accounted for: 1 borderline label (non-finding, reasoned above) plus 94 self-referential/meta-commentary parsing artifacts inside the amending records' own recurring sentence shapes, consistent with the class `DEC-20260905-C` through `-H` document repeatedly for their own bodies. None is a fresh, unexplained defect.

### Findings

No findings. Every quotation attributed to a Notion row, a repository file, a sibling record, or the frontend checkout was located and confirmed faithful under the stated normalization convention. Every evidence path resolves (including the cross-repo `strale-io/strale-frontend@8e01fbc56afc390b23a3d11d6588d434cab2c5f3:src/components/solutions/sqs-display.ts`, `@04c9fca9:src/pages/Index.tsx` entries, and the `f93355ace32c401089a6aa322a5a17e323a1e6d5` / `3b25658736bfed53eec52c8acf2619dacd54d1f5` commit references, both ancestors of HEAD). Every relation target exists as a record key at this commit and is never a bare collided id. All 32 `--notion-`-qualified records have matching `formal_record`/`formally_migrated` dispositions and record keys in both `docs/decisions/id-collisions.yaml` and `docs/project/m2-closure-register.yaml`; the one `--git-`-qualified record's register entry has the correct `source_kind`, `source_rows: []`, `git_provenance`, and passes the ancestry check.

The seven amending records (DEC-20260905-B through -H), which the prompt specifically flagged for self-referential residuals, were read and fact-checked exhaustively — every one of their ~60 numbered withdrawal/substantiation items was independently re-verified against its cited source (Notion row field via `dump_rows.py`, repository file at the exact cited line, sibling record, `id-collisions.yaml`, `m2-closure-register.yaml`, or `git log`/`merge-base`). All were confirmed correct as stated: the withdrawn statement really is false/misattributed in the amended record, and the correction really is what the cited source says. No corrections-of-corrections were found. Two "substantiates, not withdraws" relation items (DEC-905-D item 7, DEC-905-E item 6, DEC-905-F items 1-2, DEC-905-H items 2-3) were checked against the rule the prompt states (a relation whose basis an amending record states is substantiated) and all check out: the named basis is real, quoted or paraphrased correctly, and does support the declared relation.

### Ten code-claim spot checks (of many more performed)

1. `apps/api/scripts/check-no-new-console.mjs:12` — fail condition text matches `DEC-20260905-B` item 3's correction exactly.
2. `apps/api/src/routes/do.ts:876-877` — "the settle step runs only after the capability has produced output (DEC-14)" comment sits on the `verifyX402PaymentOnly` call site, not on `settleReceiptFor` (line 601) — matches `DEC-20260905-B` item 4.
3. `apps/api/src/index.ts:10,19-30,~394` — `MIN_EXPECTED_EXECUTORS = 200`, the startup gate, and `process.exit(1)` in `main().catch` all confirmed live — matches `DEC-20260905-C` item 29.
4. `apps/api/src/lib/onboarding-gates.ts:242-259` — `PII_CATEGORY_ENUM` has exactly 14 entries — matches `DEC-20260905-C` item 34.
5. `apps/api/src/capabilities/auto-register.ts:161,168` — REACTIVATED comments read "(Phase 2a)" and "(Phase 2b)" separately, never combined — matches `DEC-20260905-D` item 13.
6. `apps/api/src/capabilities/polish-company-data.ts:17-19` — KRS-by-number sentence precedes the northdata.com sentence — matches `DEC-20260905-D` item 14 (reversed order).
7. `manifests/slovenian-company-data.yaml:135-136` — "Reactivation trigger: paid AJPES restPrsInfo contract..." with no "a" before "paid" — matches `DEC-20260905-D` item 18.
8. `apps/api/src/lib/trust-helpers.ts:367,386` — `manifest_drift` comment and `guaranteed_field_missing:` branch confirmed, attributed in-code to "DEC-20260513-B + DEC-20260513-C" — matches `DEC-20260513-F`'s own misattribution note.
9. `apps/api/src/lib/x402-gateway.ts:43-59` — `EUR_USD_RATE` conversion mechanism confirmed as `DEC-20260502-A` describes.
10. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx:145-146,215-217` — H1 text and `SolutionsShowcase` component confirmed exactly as `DEC-20260421-B`/`-D`'s frontend-facing records state.

(Additional spot checks performed beyond the required ten: `context7.json` rule 12, `handoff/README.md:12`, `config/env-manifest.yaml` HMRC-row count and OPENSANCTIONS_API_KEY purpose/cost_note fields and 43-row boilerplate count, `docs/company/CHARTER.md:43,399`, `apps/api/src/capabilities/lib/{web-provider,browserless-extract}.ts`, `apps/api/src/lib/trust-grade.ts:89,211`, `docs/decisions/records/DEC-20260812-A.md:64` vs `CLAUDE.md:302`, `docs/decisions/id-collisions.yaml` entries for DEC-20260420-H/I/K and DEC-20260405-B/409-C, `docs/project/m2-closure-register.yaml` decision_rows, commits `8f6eff9`/`a070ba0`/`f93355ac`/`3b256587`/`9ee19282`, `docs/strategy/2026-08-05-direction-plan.md:14,64`, `apps/api/src/lib/capability-persistence.ts:303`, `apps/api/src/lib/audit-helpers.ts:40`.)

### Unverifiable

Nothing in this partition was left unverifiable. All Notion-row quotations resolved via `dump_rows.py`, all repository and cross-repo file claims resolved by direct read, and both git commit references resolved and are confirmed ancestors of HEAD.

### Registry/collision binding checks (item 8, all 32 qualified records)

All 32 `--notion-`-qualified records in the partition: registry entry (`docs/decisions/id-collisions.yaml`) carries the matching page id with `disposition: formal_record` and identical `record_key`; register entry (`docs/project/m2-closure-register.yaml` `decision_rows`) carries `disposition: formally_migrated` with the identical `record_key`. Verified programmatically for all 32 — zero mismatches.

PARTITION VERDICT: PASS

## Gate run

```
M2 closing review round 8 gate run at 48339ec29d7f768c7e51736f88659239c75ad6a7, 2026-09-06T01:09:50Z
HEAD=48339ec29d7f768c7e51736f88659239c75ad6a7
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (267.8276ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (74.1575ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (6.4043ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (25.0224ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 641628.2133
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (1647.6968ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (1201.1243ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (673.8663ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (2259.7055ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 428377.0422
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
checked 35 archive/receipts/*.json files
ok   receipts contract
warn (9) — handoffs stating a bare test count with no receipt:
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t12-research-contract.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t13-design-tokens.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t14-cheap-extras.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t5-cto-readable-structure.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-founder-answers-retention-and-wp13-track.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-handoff-gate-live-worktree.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-04-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-05-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
exit=0
=== node apps/api/scripts/check-pii.mjs --strict
PII guard: clean — no unredacted person names or checksum-valid identifiers found.
exit=0
=== node apps/api/scripts/check-no-committed-secrets.mjs
check-no-committed-secrets: clean (3080 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still 48339ec29d7f768c7e51736f88659239c75ad6a7
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Outcome

Round 8 found confirmed defects in partitions P2, P3, P4, and P5, and no
confirmed defects in P1 or P6 (P1 itself found and withdrew two defects
via its own checker-residual reconciliation, folded into this round's
overall findings below rather than passing clean). The confirmed
findings are: (1) `DEC-20260225-P-k3l4.md:75` and
`DEC-20260226-P-s3t4.md:55` present the fabricated quotations `"wedge,
not niche"` and `"build it now, cheaply"` as the row's own words, when
neither phrase appears in the row's Decision or Rationale fields; (2)
`DEC-20260330-B.md:79` re-quotes its own title and Decision text ("be
embedded in coding workflow") dropping the word "coding"; (3)
`DEC-20260503-A.md:60-62` calls four sibling ids "unresolved source-ID
collisions" when all four are `resolution_status: resolved` in
`docs/decisions/id-collisions.yaml` with existing formal records; (4)
`DEC-20260422-D.md:87-89` states no manifest schema field carries
`license_url`, when `manifests/doi-resolve.yaml` carries one; and (5)
`DEC-20260508-A.md:78` presents two paraphrases of `DEC-20260507-H`'s
finding in quotation marks as if directly sourced, when neither phrase is
a literal substring of that record or its Notion row. Every gate ran
clean at this commit (exit 0 each; `npm run context:check`, `npm run
context:test`, `node --test scripts/decision-records.test.mjs
scripts/m2-closure-register.test.mjs`, `node
scripts/m2-closure-verify-private-rows.mjs`, `npm run programs:check`,
`npm run codex:check`, `npm run receipts:check` (warn-only findings noted
in the gate output, exit 0), `node apps/api/scripts/check-pii.mjs
--strict`, `node apps/api/scripts/check-no-committed-secrets.mjs`); the
run is valid. The operator checker's full run at this commit (238
records, 1162 spans, 1063 faithful, 99 residual at the default threshold;
238 records, 1587 spans, 1465 faithful, 122 residual at `--min-chars 12`)
is byte-for-byte identical, at both thresholds, to round 7's own residual
set; one round-7 short-run classification of two residuals as faithful
without a located source is corrected in this reconciliation rather than
repeated
(`scratchpad/residual-reconciliation-round8.md`,
`scratchpad/residual-reconciliation-round8-short.md`, not committed). A
broader re-sweep of every sibling-state statement in the corpus (275 raw
hits of a wider grep pattern than round 7 used) found exactly one false,
previously unwithdrawn statement, corroborating P3's own reading
(`scratchpad/sibling-state-sweep-round8.md`, not committed); a separate
sweep for absolute absence claims (77 raw hits) found zero false
statements beyond the one already identified by direct partition reading
(`scratchpad/absence-claim-sweep-round8.md`, not committed). All
confirmed findings, plus two P5 observations expressly not adopted as
withdrawals (a dated manifest-count observation, and a misattribution
already withdrawn by a prior round), are addressed by `DEC-20260905-I`
(`docs/decisions/records/DEC-20260905-I.md`), which withdraws each false
statement without editing the record it corrects. The next closing round
runs at the commit that merges this file and `DEC-20260905-I` into
`main`, and treats a statement withdrawn here, in `DEC-20260905-B`
through `-H`, or in `DEC-20260905-I`, as corrected, and a relation
substantiated in any of those records as substantiated.

VERDICT: FAIL
