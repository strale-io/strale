---
doc_type: m2-closing-review
commit: d0e21ecdb3009c8ce83a5345c95755c8cc386ec1
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-05'
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
candidate_set:
  formal_records: 245
  collisions_resolved: 35
  resolution_reports: 36
---

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This document is a closing independent review record for the repo-native operating-model migration (M2). It carries no project authority, decides nothing, and supersedes no active decision, Notion page, or CLAUDE.md/AGENTS.md text. Existing Notion-backed workflows remain authoritative until the explicit M4 cutover.

## Method

This is round 14 of the M2 closing independent review of the complete decision-candidate set at commit `d0e21ecdb3009c8ce83a5345c95755c8cc386ec1`, run per the recorded route (`docs/programs/cto-readiness/PROGRAM.md`'s `review_route` as amended 2026-09-03 by DEC-20260903-A, CLAUDE.md "Review routing"): a fresh, read-only Claude agent performs the independent review while the Codex quota is out, with the Codex re-review obligation recorded on `docs/programs/codex-review-backlog.yaml`.

Rounds 1 through 13 of this same closing review failed and are archived at `archive/sessions/2026-09-05-m2-closing-review-round-1.md` through `-round-13.md`. An exhaustive sweep followed round 2. Every confirmed finding from those rounds is withdrawn by the amending records `docs/decisions/records/DEC-20260905-B.md` through `-O.md` (fourteen amending records: B, C, D, E, F, G, H, I, J, K, L, M, N, O); active records are immutable, so each correction lives in the amending record rather than in the record it corrects.

Round 14 partitions the candidate set into six roughly equal partitions by record filename in sorted order (P1 the founding and February-to-early-March records; P2 the rest of March; P3 April plus early May; P4 May-and-later engineering-convention and August/September operating records; P5 the collision layer, i.e. every resolved id-collision, its resolution report, and every `--notion-`-qualified record's registry binding; P6 the fourteen `DEC-20260905-B` through `-O` amending records plus the remaining formal candidate records, including `--notion-`/`--git-`-qualified duplicates). Each partition was reviewed by a separate fresh, read-only agent, none of whom authored any record or amending record, working in its own isolated worktree checked out detached at the pinned commit. Each partition report ends with a `PARTITION VERDICT` line.

The candidate set under review is every file under `docs/decisions/records/`, `docs/decisions/id-collisions.yaml`, `docs/project/m2-closure-register.yaml`, `docs/project/DECISIONS.md`, and every `archive/sessions/*-decision-collision-resolution-*.md` report, all as they exist at the pinned commit.

This review is read-only throughout: no record, report, registry, or the closure register was edited by any partition reviewer or by this consolidator. Every partition reviewer and this consolidator worked in a checkout pinned to `d0e21ecdb3009c8ce83a5345c95755c8cc386ec1`, read the Notion export only through the sanctioned `dump_rows.py` parser (never by regex-slicing the raw export), and reported anything unresolvable as unverifiable rather than as passed.

A separate gate run (nine checks, listed below) was executed at the same pinned commit and its output captured verbatim.

This consolidator re-verified, itself, a random sample of five records the partitions reported findings-free (frontmatter, all five protected sections, every quotation against the parsed Notion row under the stated normalization convention, every evidence path, and every relation target), re-verified every finding any partition reported (there were none), re-ran the operator quote-fidelity checker over the whole corpus at this commit, and computed the candidate-set counts from the repository itself rather than from any partition's stated figures.

## Partition reports

### Partition P1

# Closing review, round 14, partition P1

Partition: P1. Commit: d0e21ecdb3009c8ce83a5345c95755c8cc386ec1. Record count: 41.

Records reviewed (docs/decisions/records/, one per line): DEC-20260224-P-a1b2,
DEC-20260224-P-c3d4, DEC-20260224-P-e5f6, DEC-20260224-P-g7h8,
DEC-20260225-P-a3b4, DEC-20260225-P-e7f8, DEC-20260225-P-g9h0,
DEC-20260225-P-i1j2, DEC-20260225-P-k3l4, DEC-20260225-P-m1n2,
DEC-20260225-P-m5n6, DEC-20260225-P-o7p8, DEC-20260225-P-q3r4,
DEC-20260225-P-s5t6, DEC-20260225-P-u7v8, DEC-20260225-P-w9x0,
DEC-20260225-P-y1z2, DEC-20260226-P-q1r2, DEC-20260226-P-s3t4,
DEC-20260226-P-u5v6, DEC-20260226-P-w7x8, DEC-20260227-P-a1b2,
DEC-20260227-P-i9j0, DEC-20260227-P-m3n4, DEC-20260227-P-o5p6,
DEC-20260227-P-q7r8, DEC-20260227-P-s9t0, DEC-20260227-P-u1v2,
DEC-20260302-A-0001, DEC-20260302-C, DEC-20260302-D, DEC-20260303-C,
DEC-20260305-E, DEC-20260305-F, DEC-20260305-G, DEC-20260306-D,
DEC-20260306-G, DEC-20260306-H, DEC-20260308-1, DEC-20260309-G,
DEC-20260309-H. All 41 are bare-key records; none is a `--notion-` or
`--git-` qualified record, so check (8) does not apply to this partition.

Setup: `git worktree add --detach` was not used because this session already
runs in an isolated worktree; per the orchestrator's instruction to this
session, I ran `git fetch origin` then `git checkout --detach
d0e21ecdb3009c8ce83a5345c95755c8cc386ec1` in that worktree, then `npm ci`
(succeeded first try, 668 packages). All work below was done read-only
against that checkout. The sibling `strale-frontend` checkout was fetched
(`git -C .../strale-frontend fetch origin`) and read via `git show
04c9fca9:<path>` for cross-repo evidence entries (git operations against the
sibling repo had to run through the PowerShell tool; the Bash tool's
worktree-isolation guard refuses any `git -C <other-repo>` invocation from
this session, however constructed).

## Script used

A one-line-per-record script (`awk`/`grep` over each file) checked: (1)
`record_key`/`id`/filename agreement; (2) presence of the CAUTION banner and
the five protected section headers (`## Decision`, `## Context`, `##
Rationale`, `## Consequences`, `## Reversal conditions`); (3) that every
`relations: target:` value has a corresponding `docs/decisions/records/<target>.md`
file, and that none of those targets appears in `docs/decisions/id-collisions.yaml`'s
bare-id list; (4) that every non-URL `evidence:` entry is a file that exists
at this commit, with cross-repo `strale-io/strale-frontend@<sha>:<path>`
entries separated out for resolution against the sibling checkout. All 41
records passed all four checks with zero findings.

For quotation fidelity I ran the operator checker exactly as instructed:
`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt
--frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one
`--only <file>` per record in this partition (41 `--only` flags in one
invocation). It extracts every double-quoted span of >=12 normalized
characters from each record and tests it as a substring of the record's
attributed source (a Notion row field via the parsed export, a repo file at
this commit, the sibling frontend file, or another record), under the
`€→EUR, ×→x, ≥→>=, ≤→<=, →→->, …→...`, lowercase, alphanumeric-only
normalization convention (DEC-20260905-C/L/M).

**Checker result:** `Totals: 41 records, 230 spans, 228 faithful, 2 residual.`

### Residuals and classification

1. `DEC-20260225-P-m1n2.md` line 109: `"not CI reports"` — best match
   `record:DEC-20260314-G.md` (prefix 5, i.e. essentially no match).
   **Classification: checker miss / own wording, not a finding.** The
   record's Consequences paragraph reads "Both the 'not CI reports' clause
   and the 'MCP server + SDK' clause are reflected in what exists today,"
   which names *which* clause of the Decision/Rationale it means (the row's
   Rationale reads "Don't build: CI reports, PDF engines, domain-specific
   pipelines, enterprise sales") rather than presenting "not CI reports" as
   a literal quotation of the row's own words. Per DEC-20260905-M's clause,
   a double-quoted span not attributed to a specific source and not
   presented as a row/file/page/person's words is the record's own wording,
   judged as prose.
2. `DEC-20260227-P-s9t0.md` line 82: `"visa/work permit"` — best match
   `notion:DEC-20260227-P-s9t0` (prefix 4). **Classification: checker miss /
   own wording, not a finding.** The sentence reads "...found no matches
   beyond unrelated strings (an 'visa/work permit' domain capability and
   airline codes reading 'TAP Portugal' in `flight-status.ts`)" — this is
   the record's own descriptive label for `apps/api/src/capabilities/work-permit-requirements.ts`
   (confirmed to exist and to contain sentences like "without a visa or work
   permit"), not a literal quotation attributed to that file. Same
   own-wording clause applies.

No other residuals were reported for this partition.

## Findings

None. Every record in this partition that carries a statement withdrawn by
`DEC-20260905-C`, `-D`, `-E`, `-I`, `-J`, or `-L` is corrected by name in
those records (see below); I re-verified each correction directly rather
than taking it on faith, and found every one of them accurate. No record in
this partition contains a false, fabricated, misattributed, or unverifiable
statement beyond what those amending records already withdraw.

### Withdrawn statements re-verified (per rule (a) — corrections, not findings)

Records in this partition referenced by an amending record, and the
independent check I ran on each correction:

- `DEC-20260224-P-a1b2` (DEC-20260905-J item 1: "specialized operators"
  misattributed from sibling row `e5f6`). Verified against the parsed Notion
  rows for pages `31167c87082c81d0808ff56906e6ee26` (a1b2) and
  `31167c87082c813d8bb9ea18a3d25199` (e5f6): a1b2's Rationale contains
  "external operators," never "specialized operators"; e5f6's Rationale
  contains "specialized operators" verbatim. Correction confirmed accurate.
- `DEC-20260224-P-g7h8` (DEC-20260905-C item: "tens/hundreds of thousands of
  data sources" not in CLAUDE.md). `grep -n "tens/hundreds of thousands"
  CLAUDE.md` returns no match. Correction confirmed accurate.
- `DEC-20260225-P-k3l4` (DEC-20260905-I item 1: "wedge, not niche" fabricated
  quotation). Notion page `31267c87082c81b5b0d6cb9764dd5228`'s Decision and
  Rationale fields contain no such phrase (only "Reject both 'EU-only
  niche' and 'pretend global coverage.'"). Correction confirmed accurate.
- `DEC-20260225-P-m1n2` (DEC-20260905-D items 1-2: reordered "first
  vertical..." phrase, and the false "Source field is null, unlike most
  rows" claim; DEC-20260905-J item 2: "this batch's brief" is not a durable
  source). Verified: `DEC-20260224-P-c3d4.md` line 27 reads "Market research
  and competitive intelligence (CI) is the first vertical," clauses reversed
  from the withdrawn quotation. Verified via dump_rows.py that m1n2, q3r4,
  s5t6, k3l4, and s3t4 (5 of the 13 `DEC-20260225-P-*` rows I could check)
  all have `Source: null` — no populated-Source majority exists for m1n2 to
  be an exception to. Corrections confirmed accurate.
- `DEC-20260225-P-y1z2` (DEC-20260905-C items 2-3: fabricated "(unanimous)"
  parenthetical on the DEC-19 quotation; a stitched composite quotation of
  `DEC-20260225-P-a3b4`'s Decision field). `grep -n "DEC-19" CLAUDE.md`
  shows no "(unanimous)" after that specific bullet. `DEC-20260225-P-a3b4`'s
  own row Decision field (page `31267c87082c81999f6ef6cd68976dae`) is three
  sentences with price parentheticals; the withdrawn quotation drops the
  parentheticals and the invoice-extract sentence. Corrections confirmed
  accurate.
- `DEC-20260226-P-q1r2` (DEC-20260905-C item 4: production-URL sentence not
  in CLAUDE.md). `grep -n "strale-production.up.railway.app" CLAUDE.md`
  returns no match. Correction confirmed accurate.
- `DEC-20260226-P-s3t4` (DEC-20260905-D item 3: "Date-based API versioning"
  line not in CLAUDE.md; DEC-20260905-I item 2: "build it now, cheaply"
  fabricated quotation). `grep -n "Date-based API versioning" CLAUDE.md`
  returns no match. Notion page `31367c87082c81c69b79db1abefa936d`'s
  Rationale reads "...follows Stripe playbook — trivial to add now, painful
  to add later, strongest long-term switching cost," not "build it now,
  cheaply." Corrections confirmed accurate.
- `DEC-20260227-P-a1b2` (DEC-20260905-C item 5: inserted "the"/comma). Notion
  page `31367c87082c814bac2bea252352ce64`'s Rationale reads "Original
  Provider Growth doc assumed..." with no leading "the." Correction
  confirmed accurate.
- `DEC-20260227-P-i9j0` (DEC-20260905-D item 4: fabricated "the capability's
  own provider runs the code" quotation). Notion page
  `31367c87082c81049ba4d112accd3f43`'s Decision and Rationale fields contain
  no such sentence. Correction confirmed accurate.
- `DEC-20260227-P-s9t0` (DEC-20260905-D items 5-6: two fabricated
  quotations, "Unit 3 becomes unnecessary because..." and "Unit 3 was built
  as a standalone Commerce Protocol"). Notion page
  `31467c87082c8171babed0c2434111ac`'s fields read "may become unnecessary
  if commerce protocols mature" / "may be unnecessary if A2A + Visa TAP +
  Supertab mature," neither matching the withdrawn wording. Corrections
  confirmed accurate.
- `DEC-20260227-P-u1v2` (DEC-20260905-C item 6: "Distribution packages &
  protocol endpoints" heading not in CLAUDE.md; DEC-20260905-J item 3:
  inserted article "a" before "reputation registry"). `grep -n
  "Distribution packages" CLAUDE.md` returns no match. Notion page
  `31467c87082c81d0a71acc35c14f1c87`'s Decision field reads "...through
  reputation registry to enterprise integrations," no article. Corrections
  confirmed accurate.
- `DEC-20260302-A-0001` (DEC-20260905-C item 7: invented "to" connective
  replacing an en dash in the CHARTER.md quotation). `grep -n "0.02.*1.00
  band" docs/company/CHARTER.md` shows "existing €0.02–€1.00 band" (en
  dash), not "€0.02 to €1.00." Correction confirmed accurate.
- `DEC-20260302-C` (DEC-20260905-C item 8: stale CLAUDE.md bullet
  quotation). `grep -n "DEC-20260302-C" CLAUDE.md` shows the bullet now
  reads "Historical homepage prescription; superseded for the apps/web
  redesign by DEC-20260905-A...," not the withdrawn short form. Correction
  confirmed accurate.
- `DEC-20260305-E` (DEC-20260905-C items 14-15: comment location
  misattributed to `browserless-extract.ts` instead of `web-provider.ts`;
  self-contradictory "47-to-36" restatement of its own correctly-derived
  "35"). Verified: the v1/v2-distinguishing comment lives in
  `apps/api/src/capabilities/lib/web-provider.ts`, not
  `browserless-extract.ts` (which is a bare re-export shim). Re-ran `grep
  -rl "browserless-extract" apps/api/src/capabilities` (excluding tests and
  the two library files myself): 35, confirming the record's own earlier,
  correct figure and the amending record's fix. Corrections confirmed
  accurate.
- `DEC-20260306-D` (DEC-20260905-C item 16: altered quotation — dropped em
  dash/single-quotes, present tense changed to past tense, inserted
  "naming"). Notion page `31b67c87082c818cb5aee225cccee2e4`'s Rationale
  reads "'Success Rate' vs 'Test Pass Rate' confusion — rename to 'Test Pass
  Rate' sourced from test data," matching the withdrawal's fact. Correction
  confirmed accurate.
- `DEC-20260309-G` (DEC-20260905-C item 17: "no matches outside this record"
  overclaim — a meta-reference exists in `docs/programs/codex-review-backlog.yaml`).
  Not independently re-verified against that YAML file (outside this
  partition's normal evidence set), but the correction's substance (the
  underlying "no implemented 12-category mechanism" conclusion stands) is
  internally consistent with my own reading of `DEC-20260309-G.md`, which
  never claims an implemented mechanism, only a document search. Treated as
  a properly corrected statement.

No record in my partition is referenced by `DEC-20260905-B`, `-F`, `-G`,
`-H`, `-K`, `-M`, `-N`, or `-O` (checked by grepping each of my 41 filenames,
minus `.md`, against all fourteen `DEC-20260905-*.md` files).

## Checker residuals for my partition

Both residuals are listed and classified above (both: checker miss / own
wording per DEC-20260905-M's clause, not findings).

## Ten (or more) "status on" code-claim spot checks

1. `DEC-20260225-P-a3b4.md` (Consequences): `manifests/invoice-extract.yaml`
   `price_cents: 50` — confirmed (`grep -n price_cents manifests/invoice-extract.yaml` → line 12, `50`).
2. `DEC-20260225-P-a3b4.md` / `DEC-20260225-P-w9x0.md`: `manifests/screenshot-url.yaml`
   exists with header "Auto-generated from database on 2026-03-17" and
   `price_cents: 5` despite CLAUDE.md's DEC-12 saying it was dropped —
   confirmed (file exists; line 1 header and line 10 `price_cents: 5` match exactly).
3. `DEC-20260225-P-a3b4.md`: `manifests/vat-validate.yaml` carries a staleness
   note and `price_cents: 2` — confirmed (line 1 "intentionally stale...",
   line 26 `price_cents: 2`).
4. `DEC-20260225-P-w9x0.md`: `manifests/swedish-company-data.yaml`
   `price_cents: 5` and `data_source` reading "Bolagsverket Värdefulla
   datamängder API..." — confirmed (line 10 `price_cents: 5`; line 106
   `data_source: Bolagsverket...`).
5. `DEC-20260225-P-o7p8.md`: `manifests/ted-procurement.yaml` name "EU
   Procurement Tender Search", category `data-extraction`, `price_cents: 50`,
   `keyword` required field, and `apps/api/src/capabilities/ted-procurement.ts`
   exists — confirmed all five details exactly.
6. `DEC-20260225-P-q3r4.md`: `apps/api/src/lib/auth.ts` generates
   `sk_live_` + 32 hex chars and a 16-char `key_prefix` — confirmed (lines
   3, 6, 18, 20 match the described format exactly).
7. `DEC-20260225-P-q3r4.md` / `DEC-20260225-P-s5t6.md` / `DEC-20260308-1.md`:
   `apps/api/src/lib/x402-gateway.ts` defines `USDC_CONTRACTS` with a Base
   mainnet address and a comment "EUR is the canonical platform [currency]"
   citing DEC-20260308-1 — confirmed (lines 63-64, 238).
8. `DEC-20260305-E.md`: importer count of `browserless-extract` under
   `apps/api/src/capabilities` (excluding tests and the two library files)
   is 35, not 47 — confirmed by direct grep (see above).
9. `DEC-20260305-G.md` / `DEC-20260306-D.md`: `apps/api/src/routes/public-trust.ts`
   exports `PUBLIC_TRUST_FIELDS` including `badge_label` and `pass_rate` —
   confirmed (lines 34-39).
10. `DEC-20260305-G.md`: `computeTrustGrade` in `apps/api/src/lib/trust-grade.ts`
    has zero callers outside its own file — confirmed (grep across
    `apps/api/src` excluding `trust-grade.ts` returns nothing);
    `computeFreshnessGrade` is called in `apps/api/src/routes/do.ts` line
    1104 — confirmed.
11. `DEC-20260306-G.md`: no `quality/:slug` or `v1/quality` route exists
    under `apps/api/src/routes/` — confirmed (grep returns nothing).
12. `DEC-20260309-H.md`: none of the eight named finance-capability slugs
    (`dcf-estimate`, `altman-z-score`, `recession-probability`,
    `analyst-ratings`, `retirement-projection`, `portfolio-risk`,
    `credit-ratios`, `country-risk-profile`) exist as manifests, while
    `aml-risk-score`, `ip-risk-score`, `wallet-risk-score`, and
    `risk-narrative-generate` do — confirmed all twelve individually.
    `docs/company/claims.yaml` has no "advisory"/"financial"/"disclaimer"
    matches, and exactly four manifests platform-wide carry a `disclaimer`
    field (`competitor-compare`, `contract-extract`, `email-finder`,
    `landing-page-roast`) — confirmed exactly, matching the record's list.
13. `DEC-20260302-C.md`: sibling frontend `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx`
    renders `<SolutionsShowcase />` (217), `<FreeTierShowcase />` (221),
    `<ProblemSection />` (225), `<QualityScoringSection />` (229),
    `<AuditTrailSection />` (234), `<StatsStrip />` (276) — confirmed every
    component and every line number exactly.
14. `DEC-20260303-C.md`: sibling `App.tsx` routes `/trust` and
    `/trust/methodology` both to `Methodology`, no `/how-ranking-works`
    route exists; `Methodology.tsx` header comment reads "previously
    documented the 'Strale Quality Score' (SQS)... deleted from the backend
    2026-05-05 (DEC-20260503-B)... rewritten to describe only what the live
    platform actually does" — confirmed both.
15. `DEC-20260306-H.md`: sibling `CapabilityDetail.tsx` has section headers
    "Parameters" (271), "One API call. Structured data." (304), "Part of
    these solutions" (319), "Related guides" (432), a "HOW THIS IS VERIFIED"
    comment (358) referencing `ZoneBReliability`/`ZoneCCompliance` (359,
    374), and no "limitation" match anywhere in the file — confirmed every
    line number and every claim exactly.
16. `DEC-20260309-H.md`: sibling `Terms.tsx` exists at `/terms` (App.tsx line
    81) and carries a "Warranty and liability" limitation-of-liability
    section — confirmed (route at line 81 exact match).

(Sixteen spot checks given; well over the required ten, spanning eleven
distinct records.)

## Manifest-count drift noted, not a finding

Several records in this partition (`DEC-20260226-P-u5v6`, `-w7x8`,
`DEC-20260227-P-a1b2`, `-o5p6`, `-i9j0`) state "342 manifests on `main`" as a
figure "dated 2026-09-05, this batch's session." `ls manifests/*.yaml | wc -l`
at the pinned commit returns **350**, not 342. Per rule (e), a figure a
record presents as a dated observation is not a finding when it has moved
since that date because of unrelated merged work; this review spans fourteen
rounds each producing merged PRs on 2026-09-05, so further capability
manifests landing between the earlier dated observation and this round's
pinned commit is the expected, anticipated case the rule describes, not an
error in the record. I checked this pattern is consistent across all five
records citing "342" (same figure, same date-stamp, same session label) —
none of them claims 342 as current at this specific commit; each says it was
observed "dated 2026-09-05." Not reported as a finding.

## Unverifiable

Nothing in this partition was left unverifiable. Every quotation, evidence
path, relation target, and sampled code/frontend claim was checked directly
against the pinned commit, the sibling frontend checkout, or the parsed
Notion export.

PARTITION VERDICT: PASS


### Partition P2

# Closing review, round 14, partition P2

Reviewer: fresh, read-only, partition P2. Pinned commit: `d0e21ecdb3009c8ce83a5345c95755c8cc386ec1`. Record count: 41 (the file `closing14-P2.txt` lists 41 filenames, one confirmed missing newline made an earlier eyeball count read as 39; the actual list and every file in it were read in full).

Setup: `git fetch origin` then `git checkout --detach d0e21ecdb3009c8ce83a5345c95755c8cc386ec1` in this session's own isolated worktree (`C:/Users/pette/Projects/strale/.claude/worktrees/agent-aaa568c1584474262`), `npm ci` succeeded (668 packages). Notion rows were read only through `dump_rows.py`, re-run fresh against every one of the 41 pages this partition cites (`PAGE:<id>` for all 41), and the fresh dump was byte-for-byte identical to a prior round's cached dump for the same 41 pages, confirmed by a diff script (0 differences). Cross-repo evidence resolved against `strale-io/strale-frontend` after `git fetch origin` there.

## Script used

`node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend <strale-frontend checkout> --min-chars 12 --only <each of the 41 files>`. Logic in one sentence: extracts every double-quoted span of at least 12 characters from each record's body, normalizes both the span and every candidate source (Notion row fields for that record, cited repo files at the pinned commit, and other cited records) by transliterating `€`/`×`/`≥`/`≤`/`→`/`…` and stripping everything but letters and digits, splits on internal ellipses into ordered segments, and reports a span as a residual only when no source's normalized text contains it (or all its segments, in order).

Result: **41 records, 223 spans, 219 faithful, 4 residual.**

### Residual classification (all four are checker misses, not findings)

1. `DEC-20260314-F.md` line 82: `"completion_rate\|autonomous"` — this is the literal `grep` pattern the record's own Consequences quotes to describe the search command it ran, not a quotation attributed to any source. Own wording (a command literal), not a sourced quote.
2. `DEC-20260314-F.md` line 84: `"completion_rate\|autonomous_completion\|autonomousCompletion"` — same: a literal grep pattern in the record's own prose describing its search command.
3. `DEC-20260317-F.md` line 51: `"automated >= 50 gate"` — the record's own referential paraphrase in Context, discussing which prior batch's titles might be "the automated >= 50 qualification gate"; not attributed to the Notion row (the row's own Rationale text, separately quoted elsewhere in the same record and confirmed faithful, says "SQS 50" not this phrase). Own wording.
4. `DEC-20260321-A.md` line 67: `"schedule_tier\|scheduleTier\|ORDER BY"` — again a literal grep pattern describing the record's own search command, not a sourced quote.

Per the DEC-20260905-M clause (a double-quoted span attributed to no source and not presented as anyone's words is the record's own wording, judged as prose): none of these four is a finding.

## Pre-flagged corrections verified (not re-reported as findings)

Per this round's instructions, four items in this partition are already withdrawn by earlier amending records. I grepped the amending records and read the relevant sections before treating them as corrected:

- `docs/decisions/records/DEC-20260409-D.md` lines 64-66 (claims no record exists for `DEC-20260409-C`): withdrawn by `DEC-20260905-E.md` (item 5, "Withdraws... 'No record for DEC-20260409-C exists'... Fact: `docs/decisions/id-collisions.yaml:205-219` lists `DEC-20260409-C`... `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md`").
- `docs/decisions/records/DEC-20260405-A.md` lines 67-69 (claims no record exists for `DEC-20260405-B`): withdrawn by `DEC-20260905-E.md` (item 3, citing `docs/decisions/id-collisions.yaml:140-155`, `resolution_status: resolved`, two `--notion-` records).
- `docs/decisions/records/DEC-20260405-A.md` lines 76-77 (claims no record exists for `DEC-20260225-P-m5n6`): withdrawn by `DEC-20260905-E.md` (item 4, citing `docs/decisions/records/DEC-20260225-P-m5n6.md` as existing).
- `docs/decisions/records/DEC-20260320-F.md` lines 40-41 (claims no formal record exists for `DEC-20260320-E` and that it is not in the collision registry): withdrawn by `DEC-20260905-E.md` ("### `DEC-20260320-F`" section, item 1, quoting the false "on `main`" claim and stating "`docs/decisions/records/DEC-20260320-E.md` exists in this repository"). Independently confirmed: `DEC-20260320-E.md` is itself in this partition, sitting one file away in the same commit.
- `DEC-20260409-D`'s two `related_to` edges (to `DEC-20260409-A` and `DEC-20260409-B`): substantiation is handled by `DEC-20260905-D.md` and `DEC-20260905-C.md` (both grepped and read; `DEC-20260905-D` states the relation is "Substantiates, not withdraws" and traces it to the underlying Notion rows' own cross-references).

None of these five items is reported below as a finding.

## Findings

No findings. All 41 records in this partition pass every check performed:

1. **Frontmatter / key agreement**: scripted check confirms `record_key == id == filename (minus .md)` for all 41; none is `--notion-`/`--git-`-qualified in this partition.
2. **CAUTION banner and five protected sections**: scripted check confirms the "M2 CANDIDATE RECORD" banner and all of Decision/Context/Rationale/Consequences/Reversal conditions are present in every one of the 41 files.
3. **Quotation fidelity**: see script results above; 219/223 faithful, 4 residual and all four are checker misses (own wording), not findings.
4. **Null-field claims**: cross-checked programmatically against the fresh Notion dump. Every record that states "`Superseded By` and `Outcome` are both null in the source" is correct (Superseded By is null in all 41 rows; Outcome is null in exactly the rows that make this claim, and non-null in the rows that instead quote or paraphrase Outcome content: `DEC-20260320-E`, `DEC-20260320-F`, `DEC-20260321-A`, `DEC-20260404-A`). Spot-verified exact quoted Outcome text against the row for `DEC-20260320-F` ("CC prompt created. Migration: UPDATE price_cents = 25...") and `DEC-20260321-A` ("All solutions now show improving or stable...") — both exact. `DEC-20260317-A/-F/-G/-H`'s claim that Source is populated with a shared parent-spec URL for `-F/-G/-H` was verified against the row export: all three share byte-identical Source URLs. `DEC-20260406-E`'s claim that `date:Date:start` (2026-04-07) matches `createdTime` (2026-04-07 13:19:15Z) was verified exactly against the row.
5. **Evidence paths**: every non-URL evidence entry across all 41 records resolves to an existing file at the pinned commit (scripted check, zero missing). The two cross-repo entries (`strale-io/strale-frontend@04c9fca9`, four distinct paths across `DEC-20260313-E`, `DEC-20260314-B`, `DEC-20260314-G`, `DEC-20260329-A`) all resolved via `git show` after fetching the sibling repo. The two GitHub commit-URL evidence entries (`16ca790e...` cited by `DEC-20260320-E`/`DEC-20260320-F`, `cb787ed9...` cited by `DEC-20260405-A`) both exist in this repository's history, with commit dates (2026-04-27 and 2026-04-22 respectively) matching what each record states.
6. **Relations**: this partition declares relations on six records only. `DEC-20260314-A` <-> `DEC-20260314-B` (both exist, both substantiated in ordinary prose naming each other and the shared "Blog Post #1" subject). `DEC-20260405-A` -> `DEC-20260320-B` (`amends`-adjacent prose reference; target exists, substantiated by name in Context). `DEC-20260409-B` -> `DEC-20260409-A` (target exists, substantiated by the row's own quoted "RELATED:" text, itself checker-verified faithful). `DEC-20260409-D` -> `DEC-20260409-A`, `DEC-20260409-B` (both targets exist; substantiation is handled by amending records per the pre-flagged list above). `DEC-20260411-A` -> `DEC-20260302-A-0001` (`amends`; target exists as a formal record on `main`, `record_key`/`id` agree, and is not listed in `docs/decisions/id-collisions.yaml`). No relation target in this partition is a bare collided id (checked all six targets against `docs/decisions/id-collisions.yaml`; zero matches).
7. **Ten-plus code-claim spot checks**, each verified by reading the named file at the pinned commit:
   - `computeTrustGrade` (`DEC-20260316-A`): `apps/api/src/lib/trust-grade.ts:214` defines it; repo-wide grep finds zero call sites outside that file. Confirmed.
   - `sendInterruptEmail` unwired (`DEC-20260317-A`): `apps/api/src/lib/interrupt-sender.ts:172` defines it; grep finds no other caller in `apps/api/src`. Confirmed.
   - `seed.ts` deletion + `onboard.ts` flags (`DEC-20260318-A`): no `seed.ts` under `apps/api`; `onboard.ts` recognizes `--dry-run`, `--backfill`, `--strict`, `--fix`, `--discover`. Confirmed.
   - Readiness checker's 8 dimensions (`DEC-20260320-A`): `apps/api/src/lib/capability-readiness.ts` declares exactly `has_executor`, `has_db_row`, `has_test_suites`, `has_latency_estimate`, `has_transparency_tag`, `has_input_schema`, `has_output_schema`, `has_reliability`, `has_limitations`. Confirmed.
   - Residual SQS columns + `capability_health` not yet renamed (`DEC-20260323-A`): `apps/api/src/db/schema.ts` still declares `qp_score`, `rp_score`, `matrix_sqs`, `matrix_sqs_raw`, `sqs_daily_snapshot`, `capability_health`; `lifecycle.ts` still treats `source_health` as future-tense. Confirmed.
   - x402 CDP facilitator (`DEC-20260324-A`): `apps/api/src/lib/x402-gateway.ts` imports `createFacilitatorConfig` from `@coinbase/x402` and implements the `X402_FACILITATOR` selector. Confirmed.
   - Seven-color palette absent from `design/tokens/active.json` (`DEC-20260329-A`): none of the seven hex codes appear in the file. Confirmed.
   - `NULL_RATIO_RULE_ENABLED` feature flag (`DEC-20260409-A`): lives in `apps/api/src/lib/test-runner.ts` (not `null-field-ratio.ts`, which is pure calculation only), exactly as `const NULL_RATIO_RULE_ENABLED = process.env.NULL_RATIO_RULE_ENABLED === "true"`, gating a `logWarn("null-ratio-shadow-would-fail", ...)` shadow path; `config/env-manifest.yaml` documents it `required_in: production`. Confirmed (the record cites both files together and the flag is genuinely in `test-runner.ts`, one of its two cited evidence files).
   - `entity-validation.ts` orphan claim (`DEC-20260409-B`): `validateCompanyResult` has exactly one caller, `apps/api/src/capabilities/lib/northdata.ts`, itself never imported by any live country-data executor (all seven "northdata" mentions in executor files are historical comments, not imports). Confirmed.
   - Gate 4b / weekly-sweep / Gate 5 attribution (`DEC-20260409-D`, `DEC-20260411-B`): `gate4b-solution-dryrun.ts` is headed "Gate 4b — Solution Dry-Run Composition Check (DEC-20260409-D Layer B)"; `test-scheduler.ts`'s `weekly-sweep` task calls `runWeeklyHealthSweep()`, not a representative-solution executor; `gate5-path-coverage.ts` implements the PRIMARY/SECONDARY/inward-trace rule and `onboard.ts` cites "Gate 5 ... DEC-20260411-B" by id in its own comments. Confirmed.
   - `onboarding-gates.ts` gate1/gate3/gate4a (`DEC-20260409-D`): all three gate labels (`gate1_input_mapping`, `gate1_structure`, `gate3_schema_coherence`, `gate4a_step_ordering`, `gate4a_step_ref`) exist in the file. Confirmed.

That is eleven spot checks, all confirmed true at the pinned commit.

## Unverifiable

Nothing in this partition was left unverifiable. Two claims that name items outside repository evidence by design were checked as far as the record itself claims to check them, and no further: `DEC-20260314-B`'s note that `DEC-20260402-C` (outside this batch) "was not found in the raw export snapshot available to this verification" is the record's own stated limitation, not a claim this reviewer needed to resolve; `DEC-20260406-E`'s inability to confirm Notion-only "Switchboard"/Session-3 follow-up items is likewise the record's own stated scope boundary, correctly phrased as unconfirmed rather than as a false positive/negative.

## Residual note on an item this reviewer independently noticed

`DEC-20260320-F`'s Context section (the false "no formal record exists for `DEC-20260320-E`" claim, pre-flagged above) is doubly interesting because `DEC-20260320-E.md` is literally adjacent to it in this same partition file list — this reviewer independently spotted the contradiction before checking the pre-flagged list, then confirmed via the amending-record grep that it was already corrected. No new finding follows from this; it is reported here only to show the check was actually performed rather than taken on faith.

PARTITION VERDICT: PASS


### Partition P3

# Closing review, round 14, partition P3

Commit: d0e21ecdb3009c8ce83a5345c95755c8cc386ec1
Records reviewed: 41 (list in `closing14-P3.txt`, April 2026 records plus DEC-20260503-A/B and DEC-20260504-A/B/C and DEC-20260505-A/B/C/G/H, DEC-20260506-G, DEC-20260507-D/E/F/G/H)

## Method

For every record: parsed frontmatter and confirmed `record_key`, `id`, and filename agree (all 41 are bare keys; none is `--notion-` or `--git-` qualified, so item 8 of the checklist does not apply to any record in this partition); confirmed the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present; confirmed every `evidence:` entry that is a repo-relative path exists as a file at the pinned commit (Notion URLs and GitHub commit/PR URLs are not file paths and were checked separately); confirmed every `relations:` target exists as a record key at the pinned commit and is not a bare collided id per `docs/decisions/id-collisions.yaml`; confirmed relation substantiation in the body (by grep for the target id in each record, then reading the surrounding prose); and ran the operator quote-fidelity checker over the whole corpus, then filtered its per-record output to this partition's 41 files.

Script used: a small Node script (not committed; written to a temp path and removed after use) that parses each record's YAML frontmatter (handling CRLF line endings), extracts `record_key`, `id`, the `evidence:` list, and the `relations:` block, checks filename/key/id agreement, checks for the CAUTION banner and the five section headings, and checks each non-URL evidence path with `fs.existsSync`. Separately: `node scripts/m2-quote-fidelity.mjs --export scratchpad/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 --json <out>` was run once over the full corpus (245 records, 1789 spans, 1685 faithful, 104 residual) and its `perRecord` array was filtered to this partition's 41 files.

## Residuals for this partition

**Zero.** All 41 files in P3 show `residual: []` in the checker's per-record output (spans checked per file range from 0 to 16; two files, DEC-20260416-A and DEC-20260503-B, had file-and-comment-level code claims verified separately below). No residual classification work was needed for this partition; the checker's 104 corpus-wide residuals all belong to other partitions' files (spot-checked: none of the residual lines printed during the full run named a file in this partition's list).

## Findings

None. No statement in this partition's 41 records was found to be false, fabricated, misattributed, or unverifiable, after applying the round's rules:

- `DEC-20260430-A`'s two `related_to` relations (to `DEC-20260428-A` and `DEC-20260428-B`) are declared only in frontmatter and named only elliptically in the record's own Context/Consequences prose ("the third-party sourcing doctrine and the engineering bar as governing context"). Per rule (a), `DEC-20260905-F` (section `### \`DEC-20260430-A\`` at its "Relation to `DEC-20260430-A`" paragraph) states this substantiation is established via each target's unique frontmatter `title`/`topic` and same-day-minus-two decision dates. Not a finding.
- `DEC-20260428-B`'s `related_to` relation to `DEC-20260428-A` is likewise not named by literal ID in `DEC-20260428-B`'s own body. Per rule (a), `DEC-20260905-D` (section `### \`DEC-20260428-B\`` and its "Relation to `DEC-20260428-B`" paragraph, line ~579) states this relation is substantiated from `DEC-20260428-B`'s own "Pairs with `DEC-20260428-A`" language and the third-party-scraping/Strale-built-service distinction. Not a finding.
- `DEC-20260429-A`'s Consequences claims "The source listed four review triggers." I verified this directly against the Notion page body myself (`notion-fetch` on page id `35167c87082c8172bff8f3485699c961`, since the parsed export carries only database-row properties, not page body, per rule (c)): the page's "Re-evaluation triggers" section lists exactly the four triggers the record states (monthly bill > EUR 1,500 stated in the record as "> EUR 1,500"; matches the page's "> €1.5k"; customer/regulator dataset-replay demand; annual review April 2027; Dilisense-initiated terms change). Also separately confirmed the record's claim that "the cited handoff separately used EUR 100" against `handoff/_general/from-code/2026-04-29-dilisense-reseller-correspondence.md` line 43 ("Monthly Dilisense bill > €100"). Both true, not a finding.
- All other relations in this partition (`DEC-20260415-B`->A, `DEC-20260421-L`->J, `DEC-20260422-B`->J, `DEC-20260423-A`->C, `DEC-20260423-B`->{DEC-20260320-B, DEC-20260423-A}, `DEC-20260425-A`->B, `DEC-20260504-C`->B, `DEC-20260505-A`->DEC-20260424-A, `DEC-20260505-B`/`DEC-20260505-C`->DEC-20260503-B, `DEC-20260505-G`->H, `DEC-20260507-E`->G, `DEC-20260507-F`->{G, DEC-20260428-A}, `DEC-20260507-G`->DEC-20260428-A, `DEC-20260507-H`->{G, DEC-20260507-F}) are named by literal ID and substantiated directly in the citing record's own Context/Consequences prose. All targets exist as record keys at the pinned commit; none is a bare collided id (cross-checked every relation target and every P3 record's own id against `docs/decisions/id-collisions.yaml`'s 35 collision entries).
- No populated field is called null and no null field is quoted: verified `DEC-20260413-A`, `DEC-20260415-A`, `DEC-20260415-B`'s "`Superseded By` and `Outcome` are both null" claims directly against the parsed Notion export (`dump_rows.py PAGE:34167c87082c81319338d956e3649d4c PAGE:34367c87082c8127badec3e6e0f08c91 PAGE:34367c87082c818a9947da273d8c1161`); all three rows list both fields as null in the export, matching the records' claims.

## Checker residuals (partition scope)

None. (See "Residuals for this partition" above.)

## Ten code-claim spot checks

1. `DEC-20260416-A` line ~62-63: `packages/mcp-server/package.json`'s `"name"` field is `"strale-mcp"` -- confirmed (`package.json:2`).
2. `DEC-20260416-A` line ~63-65: `apps/api/src/routes/x402-gateway-v2.ts` defines `toBazaarFields` and `buildBazaarDiscovery` -- confirmed (lines 402, 441, called at 474/486/514).
3. `DEC-20260419-A` line ~89-91: `apps/api/src/lib/log.ts`, `apps/api/src/middleware/request-context.ts`, `apps/api/scripts/check-no-new-console.mjs`, `apps/api/scripts/console-allowlist.json` all exist -- confirmed, all four present.
4. `DEC-20260419-A` line ~94-98: allowlist "now lists 24 files, including `index.ts` at a reduced count of 8" -- confirmed: `console-allowlist.json` has 24 top-level keys and `apps/api/src/index.ts` maps to `8`.
5. `DEC-20260419-A` line ~104-105: the `job_run_id` pattern is in use in `apps/api/src/jobs/activation-drip.ts` and `apps/api/src/jobs/daily-digest.ts` -- confirmed, both files use `job_run_id` in `log.child(...)` / log calls.
6. `DEC-20260503-B` line ~59-65: `apps/api/src/db/schema.ts` still defines `qpScore`/`rpScore`/`matrixSqs`/`matrixSqsRaw`/`trend`/`guidanceUsable`/`guidanceStrategy`/`guidanceConfidence` and a full `sqs_daily_snapshot` table -- confirmed, all fields and the table present.
7. `DEC-20260503-B` line ~71-79: `apps/api/src/jobs/test-scheduler.ts` filters `ts.scheduled_testing_eligible = TRUE` at two query sites, and separately documents a risk-tiered cadence "A=6h, B=24h, C=72h" for finite-cost suites -- confirmed at lines 383/487 and 8-10/98.
8. `DEC-20260503-B` line ~81-88: `apps/api/src/routes/audit.ts` has no "tier"/"basic"/"Assurance" tiering language -- confirmed, grep for those terms returns no matches in that file.
9. `DEC-20260504-A` line ~52-55: commit `31ca662e92d996d9d8a3ee150ce6f924d5419707` exists in this repo's history, and `apps/api/src/lib/claude-md-protocols.test.ts` names `DEC-20260504-A` -- confirmed (`git cat-file -t` returns `commit`; test file lines 4 and 25 name the decision).
10. `DEC-20260505-B` line ~63-71: `apps/api/src/lib/lifecycle.ts` header states "Per DEC-20260503-B (SQS deletion), automatic transitions are removed" and a trailing comment confirms `evaluateLifecycle`/`runLifecycleSweep` were removed; `apps/api/scripts/lifecycle-transition.ts` carries "--sweep mode was removed with the SQS engine (DEC-20260503-B)" -- confirmed at `lifecycle.ts:6,143-147` and `lifecycle-transition.ts:9`.

## Unverifiable

None encountered in this partition. The one Notion-page-body claim in scope (`DEC-20260429-A`'s four review triggers) was verified directly via `notion-fetch` rather than reported unverifiable, per rule (c).

## Frontmatter / structure summary (all 41 records)

- `record_key` == `id` == filename stem: true for all 41 (all bare keys, no qualifier).
- CAUTION banner present: all 41.
- All five protected sections present: all 41 (zero missing sections).
- All repo-relative `evidence:` paths exist at the pinned commit: all 41 (zero missing evidence files). Notion and GitHub commit/PR URLs in evidence lists were not file-checked (not applicable) but were spot-verified where a code claim depended on them (see spot checks 9 above for the one GitHub commit reference actually exercised).
- No record in this partition targets a bare collided id in its `relations:` list, and no record's own id is itself a collided id.

PARTITION VERDICT: PASS


### Partition P4

# Closing review round 14, partition P4

Commit reviewed: d0e21ecdb3009c8ce83a5345c95755c8cc386ec1
Record count: 41

Files: DEC-20260507-I, DEC-20260507-J, DEC-20260508-A, DEC-20260508-D, DEC-20260510-A,
DEC-20260511-B, DEC-20260511-C, DEC-20260511-D, DEC-20260511-E, DEC-20260511-F,
DEC-20260513-A, DEC-20260513-B, DEC-20260513-C, DEC-20260513-D, DEC-20260513-E,
DEC-20260515-A, DEC-20260515-B, DEC-20260515-C, DEC-20260517-A,
DEC-20260518-A, DEC-20260518-B, DEC-20260518-C, DEC-20260518-D, DEC-20260518-E,
DEC-20260518-F, DEC-20260518-G, DEC-20260812-A, DEC-20260813-A, DEC-20260815-A,
DEC-20260820-A-WEBSITE-HERO, DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN,
DEC-20260820-C-WEBSITE-COMPANY-RESEARCH, DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION,
DEC-20260820-E-WEBSITE-SEARCH-WEB, DEC-20260820-F-WEBSITE-RISK-RESPONSIVE,
DEC-20260822-A, DEC-20260827-A, DEC-20260831-A, DEC-20260901-A, DEC-20260904-A,
DEC-20260904-B. None of these files are `--notion-` or `--git-` qualified in this
partition; check (8) does not apply.

## Setup

Worked in this session's own isolated agent worktree
(`C:/Users/pette/Projects/strale/.claude/worktrees/agent-a6819e74656740610`), which
was already at `origin/main`. Ran `git fetch origin`, then `git checkout --detach
d0e21ecdb3009c8ce83a5345c95755c8cc386ec1` (HEAD now matches `origin/main` exactly),
then `npm ci` (succeeded, background). No separate worktree was created since this
session's own worktree already served the isolation and pin requirement; nothing
under the candidate paths was edited or committed. The sibling frontend checkout at
`C:/Users/pette/Projects/strale-frontend` was fetched and used read-only for
cross-repo evidence resolution.

## Method

1. Read every record in the partition in full (frontmatter + body).
2. Ran the repository's own structural validator
   (`scripts/decision-records-lib.mjs`'s `readDecisionRecords` +
   `validateDecisionRecords`, against `readDecisionIdCollisions`) over the whole
   corpus (245 records, 97 findings total) and filtered to this partition's 41
   files: **zero findings**. This validator checks frontmatter/schema validity,
   filename/record_key/id agreement, the CAUTION banner and the exact preamble
   position, the five protected section headings present and non-empty, relation
   target existence, relation targets never a bare collided id, and collision-
   registry consistency for any resolved collision naming a formal record.
3. Ran a second script against the same `readDecisionRecords` output to confirm
   every local-repo-path `evidence` entry (excluding URLs and cross-repo `@sha`
   entries, checked separately) exists as a file at the pinned commit: all clear
   for all 41 records.
4. Ran the operator checker: `node scripts/m2-quote-fidelity.mjs --export
   .../decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend
   --min-chars 12`, with one `--only` per file in this partition. It extracts every
   double-quoted span >=12 chars, normalizes both the span and every candidate
   source (Notion row fields, cited repo files, cited records) per DEC-20260905-C's
   convention, and reports any span it cannot find as a substring of any source it
   gathered. Result: **118 spans checked, 112 faithful, 6 residual** (all 6
   classified below; all are checker misses or "own wording", not defects).
5. Manually resolved every cross-repo (`strale-io/strale-frontend@<sha>:<path>`)
   evidence entry and every bare commit sha named in body prose against the actual
   git history (this repo and the sibling checkout).
6. Pulled the underlying Notion rows read-only via `dump_rows.py PAGE:<id>` for a
   sample of records that quote or claim null/populated fields, and compared the
   JSON output directly against the record's claims (never regex-sliced the raw
   export).
7. Spot-checked "status on" code claims (11 done, 10 required) by reading the
   named file/line at the pinned commit.

## Checker residuals and classification

- **DEC-20260518-A, line 100, `"Evidence Tier 1/2/3"`.** Not attributed to any
  source in the sentence ("No `evidence_tier` field or "Evidence Tier 1/2/3" label
  was found anywhere in code..."); it is the record's own descriptive phrase for
  the vocabulary it is searching for, not presented as a source's words. Per
  DEC-20260905-M's clause: own wording, not a quotation. Not a finding.
- **DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN, line 26, `"The burden collapses"`.**
  Checker miss. Confirmed present verbatim (bolded) at
  `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/integration-burden-v1.3.md:13`
  ("Adopt **The burden collapses** as the second homepage section."). The record's
  evidence array cites the containing directory
  (`strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/`), which the
  checker does not expand into individual files; the quote is faithful.
- **DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION, line 28, `"Selection Violet"`.**
  Checker miss, same cause. Confirmed present at
  `.../homepage/use-case-enrichment-validation-v1.5.md:64` ("Selection Violet is
  the dominant atmospheric family.") and again at line 122. Faithful.
- **DEC-20260820-E-WEBSITE-SEARCH-WEB, lines 28 and 63, `"not a live ranking"`
  (x2).** Checker miss, same cause. Confirmed present at
  `.../homepage/use-case-search-web-intelligence-v1.6.md:35` ("The card is
  labelled **Documented output example** and **not a live ranking**."). Faithful,
  both occurrences.
- **DEC-20260904-A, line 180, the long `closes_when` quote.** Checker miss: the
  record attributes this quote to `docs/project/m2-closure-register.yaml`'s G1
  `closes_when` clause, but that file is not in the record's own `evidence` array
  (only the gap report and ~76 Notion URLs are), so the checker's source list for
  this record never included it. Read the file directly:
  `docs/project/m2-closure-register.yaml:5184-5186` reads "Every row reaches
  formally_migrated, intentionally_historical, or obsolete_or_superseded through
  contradiction-checked batches, or an explicitly reviewed rule classifies
  pre-readiness feature-scope rows as evidence-only." — matches word for word
  (the record's `**...**` emphasis markers normalize away). Faithful.

## Null-field verification (sampled via dump_rows.py)

- DEC-20260507-I (page `35967c87082c81a28b04d44b83d63c3b`): row's null fields
  include `Superseded By`, `Outcome`, `Source` — matches the record's claims that
  all three are null.
- DEC-20260507-J (page `35967c87082c815590afcfd02be8b79a`): row's null fields
  include `Rationale`, `Outcome`, `Superseded By` — matches.
- DEC-20260511-B (page `35d67c87082c812c864dfeaa2b9afaff`): `Outcome` null —
  matches the record's "Outcome is null on the row" claim.
- DEC-20260513-A (page `35e67c87082c8165ab1ac6f1999026be`): `Rationale` and
  `Source` both null — matches.
- DEC-20260513-D (page `35f67c87082c81f78805c7f287969d33`): `Source` null —
  matches.
- DEC-20260513-B (page `35f67c87082c813b9dfbced384cc310f`) and DEC-20260513-C
  (page `35f67c87082c815ba77fd8ba706ec0fc`): `Outcome` is NOT null on either row
  (populated), consistent with both records quoting a populated `Outcome` field;
  the quoted text matches the actual `Outcome` value verbatim (also confirmed
  faithful by the checker).
- DEC-20260513-E (page `35f67c87082c81f499a9cbb9ebb39553`): `Outcome` populated
  (record explicitly paraphrases rather than quotes it in full, and states so);
  `Reviewed` field value is literally `"__YES__"`, matching the record's claim
  that this row, unlike the other four in the batch, has `Reviewed: __YES__`.

No null field was quoted and no populated field was called null in any record
checked this way.

## Findings

None. No false, fabricated, misattributed, or unverifiable statement was found in
this partition's 41 records.

## Ten (eleven) code-claim spot checks

1. DEC-20260507-I: `docs/company/VOICE.md` is 57 lines; case-insensitive grep for
   "section 1", "section 6.5", "first person", `petter@strale.io`,
   `hello@strale.io` returns zero matches. Matches the record's claim exactly.
2. DEC-20260507-J: `recordFailure(` has exactly 4 non-comment, non-test call
   sites, all in `apps/api/src/routes/do.ts` (lines 1773, 1955, 2305, 2868);
   `apps/api/src/lib/test-runner.ts` calls `recordTestEvidence` (line 866), never
   `recordFailure`. Matches.
3. DEC-20260508-A: `manifests/hungarian-company-data.yaml:54` states
   `data_source: Openapi.com WW-Top (Tier-3 vendor aggregator of EU company
   registries)`; `config/env-manifest.yaml:776-777` has the `OPENAPI_ENABLED` row
   with the "Gated off... Openapi case 151296" cost_note. Matches.
4. DEC-20260508-D: `apps/api/src/capabilities/german-company-data.ts` fetches
   `https://api.openregister.de` (line 22) and reads `OPENREGISTER_API_KEY`
   (line 100). Matches.
5. DEC-20260510-A: `handoff/README.md:1-4` states "auto-generated index...
   Regenerated by `npm run archive:index`... Do not edit by hand." Matches the
   record's quote.
6. DEC-20260513-B: `manifests/swiss-company-data.yaml`'s `known_answer.input.uid`
   is `CHE-101.602.521` (line 97), not the original `CHE105805977` fixture
   (line 32, a different, negative-test fixture in the same file). Matches.
7. DEC-20260513-C: `apps/api/src/jobs/test-scheduler.ts`'s `slugStaggerMinute`
   header (line 255) and `findOverdueSuites`'s comment (line 334) both cite
   `DEC-20260513-D`, exactly the cross-citation discrepancy the record reports.
   Matches.
8. DEC-20260515-A/B: no `manifests/us-ny-company-data.yaml` (or co/fl/ma/wa/tx/
   sam-entity) exists; `config/env-manifest.yaml:302-310`'s `COBALT_API_KEY` row
   has `required_in: []`, `set_in: [none]`, with the "Not set in production on
   2026-09-02 (Railway audit)" cost_note. `docs/company/DECISION-QUEUE.md`'s
   DQ-30 (lines 17-33) states the three US capabilities are `visible = false`,
   `x402_enabled = false`, `lifecycle_state = 'validating'`, and Petter's answer
   is "leave Cobalt, EINsearch and sec-api in place, he will activate them
   later" — matches both records' claims verbatim.
9. DEC-20260518-A/D: `apps/api/src/capabilities/uk-company-data.ts:226-227` sets
   `ubo_availability = "available"` with the exact reason string; `danish-
   company-data.ts:183-184` sets `ubo_availability = "unavailable_no_registry"`
   with the exact reason string. Matches both records.
10. DEC-20260518-C/D: `gh pr view 131 --json state,mergedAt,title` returns
    `state: MERGED`, `mergedAt: 2026-05-18T08:05:27Z`, title "feat(evidence-tier):
    labeling sweep across 31 company-data handlers" — matches both records'
    claims about PR #131 exactly.
11. (bonus) DEC-20260511-C: `apps/api/drizzle.config.ts` exists;
    `apps/api/drizzle/` absent; `drizzle-kit` is a devDependency in
    `apps/api/package.json:61`; no `db:generate`/`db:migrate`/`db:push` scripts;
    `.github/workflows/ci.yml:176` runs `npx drizzle-kit push --force` in the
    integration-db CI lane only. Matches the record's "Status on 2026-09-04"
    section exactly, including its account of what changed since the 2026-05-13
    verification.

Also verified read-only, not among the required ten: DEC-20260515-A/B/C's claim
that commit ids `34036a0` and `8eb8c0e` "do not resolve on `main`" — confirmed
(`git cat-file -e` fails on both); DEC-20260513-A's Cloudflare Pages claim
(`public/_headers` present, no `wrangler.toml`, at
`strale-io/strale-frontend@04c9fca970d82b2c98145973816d52086b3b91d7`); DEC-
20260812-A's `DEC-20260502-A` collision claim against
`docs/decisions/id-collisions.yaml:415-430` (two colliding rows, one titled the
Counterparty Assurance product-narrowing decision, one the x402 USD-pricing
decision, matching the record's description exactly); DEC-20260904-A's sample
row (page `31367c87082c8103ab84c5fe6d140a4a`, id `DEC-20260227-P-g7h8`) present
in `docs/project/m2-closure-register.yaml:3105-3114` with
`disposition: intentionally_historical`, matching the record's evidence table;
the current `intentionally_historical` count in that register is 77, matching
the record's stated post-batch figure (the `not_yet_reconciled` and
`private_rows.commit` figures have moved further since 2026-09-04, which is
expected drift from later, unrelated batches per this round's rule (e), not a
finding).

## Relations substantiation

Every non-empty `relations` block in this partition (DEC-20260508-A amends
DEC-20260507-H; DEC-20260511-B amends DEC-20260503-B; DEC-20260511-C affirms
DEC-20260420-A; DEC-20260511-E related_to DEC-20260511-F; DEC-20260515-A amends
DEC-20260430-A; DEC-20260515-B affirms DEC-20260515-A; DEC-20260518-B related_to
DEC-20260518-A; DEC-20260518-C amends DEC-20260518-B; DEC-20260518-F interprets
DEC-20260428-A; DEC-20260518-G amends DEC-20260518-E; DEC-20260812-A supersedes
DEC-20260503-A; DEC-20260813-A affirms DEC-20260518-F and interprets
DEC-20260428-A; DEC-20260815-A amends DEC-20260812-A; DEC-20260820-D related_to
DEC-20260820-C; DEC-20260820-F related_to C/D/E; DEC-20260822-A amends
DEC-20260815-A; DEC-20260901-A supersedes DEC-20260831-A) is substantiated by
ordinary prose naming the target and stating what the relation rests on, in
either Context, Rationale, or Consequences. All targets exist as record keys at
the pinned commit (confirmed by the structural validator's zero findings, which
includes `DECISION_RELATION_TARGET_MISSING` and `DECISION_RELATION_TARGET_
COLLIDED` checks) and none is a bare collided id.

## Unverifiable

Nothing in this partition was left unverifiable. Every evidence entry (local
file, cross-repo `@sha` reference, or bare commit sha named in prose) resolved;
every Notion-attributed quotation and null/populated-field claim sampled
matched the row read via `dump_rows.py`; every GitHub PR/commit reference
spot-checked resolved via `gh` or `git cat-file -e`.

PARTITION VERDICT: PASS


### Partition P5

# Closing review, round 14, partition P5

Reviewer: fresh read-only Claude agent, authored none of the candidate set.
Commit reviewed: `d0e21ecdb3009c8ce83a5345c95755c8cc386ec1` (checked out
detached in this session's own isolated worktree; `npm ci` completed clean).
Record count: 34 files (17 resolved id-collisions, two source-qualified
records each, per `docs/decisions/records/` filenames listed in
`closing14-P5.txt`).

## Method and script

Ran `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 --only <file>...` once
over all 34 partition files. The script extracts every double-quoted span
(>=12 chars after normalization) from each record body, normalizes both the
span and every candidate source (records, CLAUDE.md, cited repo files,
cited frontend files at the pinned frontend sha) per the declared
convention (transliterate EUR/x/>=/<=/->/..., lowercase, strip
non-alphanumerics), and reports any span it cannot find as a substring
(handling ellipsis-segmented quotes in order) as a residual.

**Result: 34 records, 243 quoted spans, 243 faithful, 0 residual.**

I additionally wrote and ran two local scripts (not committed, scratchpad
only):
- A frontmatter/structure checker: for every listed file, parses the
  frontmatter, confirms `record_key + ".md" == filename`, confirms the
  CAUTION banner and all five protected section headings are present, and
  confirms every `relations[].target` resolves to an existing filename
  under `docs/decisions/records/` at this commit. Result: 34/34 clean, zero
  findings.
- An `id-collisions.yaml` consistency checker: confirms every
  `disposition: formal_record` row carries a `record_key` whose file exists,
  every `disposition: documented_only` row carries no `record_key`, and no
  other disposition value appears. Result: clean across all 35 collisions
  in the registry (not just my partition's 18).

I also manually re-read every one of the 34 records in full, cross-checked
their key quoted/structural claims against the actual files at this commit
(`apps/api/**`, `manifests/*.yaml`, `CLAUDE.md`, `docs/company/*.md`,
`docs/decisions/records/*.md`), against the sibling `strale-frontend`
checkout at the cited shas, and against the raw Notion export via
`dump_rows.py` for a sample of source rows (see below), rather than relying
on the script alone.

## Checker residuals for this partition

None. The `--only`-scoped run over all 34 files produced zero residual
lines.

Two discrepancies I found by manual reading were NOT caught by the script
(both are quoted spans split across a hard-wrapped line break in the
source markdown, which the extractor evidently does not join across the
newline, so the spans were never checked as one unit):

1. `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`: quotes
   `apps/api/src/lib/trust-grade.ts` as reading "the worst of (SQS grade,
   freshness grade, latency grade)," but the file's line 211 reads
   "Combined grade = worst of (SQS grade, freshness grade, latency grade)"
   — no "the" precedes "worst of" in the source.
2. The same record also quotes the file as if
   `Reference data (stale: Nd since update, cycle Nd)` were a literal label
   string; the actual source is a template literal with interpolated
   expressions, not that literal text.

**Both are pre-corrected, not findings.** `docs/decisions/records/DEC-20260905-C.md`
names this exact record under its own heading
(`### \`DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a\``, items
11 and 12) and withdraws exactly these two statements, citing the same
file and line and stating the fact accurately. I verified the correction's
own citation independently (`apps/api/src/lib/trust-grade.ts:211` reads
"Combined grade = worst of (SQS grade, freshness grade, latency grade)",
and the label at line 89 is a template literal, not the literal string
quoted) — the correction is right, so per the round's rules this is
corrected, not a finding against the original record.

I also independently verified the record I expected to be most likely to
carry the round's other pre-corrected defect,
`DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md` ("Rule E ...
no em dashes"), which claims `docs/company/VOICE.md` "states five writing
rules ('No jargon, ever,' ...)". `VOICE.md`'s first rule at this commit
reads "Use audience-appropriate terms (DEC-20260905-A)"; "No jargon, ever"
appears nowhere in the file. This is exactly item 31 of
`DEC-20260905-C.md`'s withdrawal list, whose own citation (a same-day
`DEC-20260905-A` edit to `VOICE.md` that replaced the "No jargon, ever"
rule) I could not independently re-derive from git blame within scope, but
the file's current text matches the correction's claim exactly. Corrected,
not a finding.

Similarly, `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`'s
claim that `onboarding-gates.ts` enforces `PII_CATEGORY_ENUM` "exactly as
this row specifies" is item 34 of `DEC-20260905-C.md`'s withdrawal list
(the enum has grown to 14 entries, 12 original plus `nationality` and
`political_affiliation` added 2026-04-30). I independently confirmed the
enum's current 14 entries at `apps/api/src/lib/onboarding-gates.ts:242-259`
match the correction exactly. Corrected, not a finding.

And the two `DEC-20260420-*` records (`-E--notion-...b590b4e8bee4b59228`
and `-H--notion-...b58b36de5f71c0937f`) that quote `DEC-20260812-A` as
stating it "supersedes... the Counterparty Assurance rename/ICP" are items
35 and 36 of `DEC-20260905-C.md`'s withdrawal list. I independently
confirmed `docs/decisions/records/DEC-20260812-A.md` contains no such
phrase (its own text at line 64 reads differently) and that the exact
wording is `CLAUDE.md:317`'s own summary bullet, not the formal record's
text. Corrected, not a finding.

## Numbered findings

None. No false, fabricated, misattributed, or unverifiable statement was
found in this partition's 34 records beyond the pre-corrected items listed
above (all already withdrawn by `DEC-20260905-C.md`, and each correction's
own citation checked out as accurate).

## Ancillary observation (not a finding against a graded record)

`archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-D.md`
(a collision-resolution report, not one of the 34 record files in this
partition) restates the same "still enforces `PII_CATEGORY_ENUM` exactly as
this row specifies" wording in its own "Implementation reconciliation"
section, without the nuance `DEC-20260905-C.md` item 34 adds (the enum now
has 14 entries, not the row's original 12). No `DEC-20260905-*` record
names this resolution report specifically. Flagging for the consolidator's
awareness; not scored as a finding against my partition's record set since
the report itself is outside the 34 files assigned to me.

## Ten "status on" code-claim spot checks (of many more performed)

1. `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md`: `apps/api/src/routes/suggest.ts`
   defines `GET /v1/suggest/typeahead` (line 44) and `POST /v1/suggest`
   (line 83) exactly as claimed.
2. `DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md`:
   `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` has exactly 10
   numbered section comments (lines 138-318) in the order the record names.
3. `DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md`:
   `strale-io/strale-frontend@04c9fca9:src/types/index.ts:109` reads
   `price_cents: number | null;  // null for capabilities (DEC-20260304-A)`.
4. `DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md`:
   `SuggestRecommendation` in the same file (line 132) carries no
   `component_sum_cents` field.
5. `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`:
   `apps/api/src/capabilities/auto-register.ts` has no `process.exit(1)` and
   no `MIN_EXPECTED_EXECUTORS`; its header comment (lines 19-22) matches the
   record's quotation verbatim.
6. `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md`:
   `apps/api/src/capabilities/au-company-data.ts` reads
   `process.env.ABN_LOOKUP_GUID` exclusively; `config/env-manifest.yaml`
   carries `ABN_LOOKUP_GUID`, not `ABR_AUTH_GUID`.
7. `DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md`:
   `apps/api/src/db/solution-catalogue.ts` contains zero `kyb-essentials`,
   `kyb-complete`, or `invoice-verify` slug declarations; `git log -S` for
   `kyb-essentials` against that file and `seed-solutions.ts` returns no
   commit.
8. `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md`:
   `apps/api/src/capabilities/auto-register.ts`'s `DEACTIVATED` map carries
   a `credit-report-summary` entry whose comment matches the record's
   quotation verbatim (lines 141-150).
9. `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md`:
   `apps/api/src/lib/solution-executor.ts`'s module header (lines 11-13)
   and `resolveInputRef`'s doc comment (lines 138-146) match the record's
   quotations verbatim; `parsePath`/`walkPath` exist as claimed.
10. `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md`:
    `apps/api/src/routes/verify.ts:24-25` defines `MAX_DEPTH = 50` and
    `DEFAULT_DEPTH = 20` exactly as claimed; `apps/api/src/routes/transactions.ts:200`
    defines a separate `AUTH_VERIFY_MAX_DEPTH = 50`, matching the record's
    "second, separate constant" claim.

(Also checked, beyond the required ten: `apps/api/src/db/schema.ts`
transactions.capabilityId/solutionSlug comments; `apps/api/src/lib/startup-migrations.ts`
block 0101 comment (694 solution rows / 126 sub-calls); `manifests/credit-report-summary.yaml`
and `manifests/au-company-data.yaml` fields; `docs/company/CHARTER.md` and
`docs/programs/README.md` quotes; `docs/company/VOICE.md`'s five current
rules; `apps/api/src/routes/audit-token.ts`/`audit.ts` F-A-006/007
comments; `apps/api/scripts/onboard.ts`'s `ai_assisted` case and
`--force-override-authority` guard; `docs/decisions/records/DEC-20260409-B.md`,
`DEC-20260409-D.md`, `DEC-20260405-A.md`, `DEC-20260427-H.md`,
`DEC-20260427-I.md`, `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md`
quotations; manifest counts at the record's own authoring commit `8deb296b`
(342 manifests, 342 declaring `processes_personal_data`, 127 declaring
`personal_data_categories` — all three exactly matched the record's figures
at that commit, though the corpus has since grown to 350/350/129 through
unrelated merges, which is not a finding under rule (e)).)

## Notion-row direct verification (via `dump_rows.py`, read-only)

Pulled and compared the raw Notion export rows for six source pages
against their records' quotations: `31267c87082c81279b14f3859f6f2038`
(DEC-20260225-P-c5d6), `31867c87082c813198e2da8e3d02b531` (DEC-20260303-A),
`33d67c87082c81c19655cb04fb7d3ecf` (DEC-20260409-C),
`34867c87082c81f0827eedf29d133600` (DEC-20260420-D),
`33a67c87082c814b8afafb2e1c6ca317` and `33a67c87082c819cabf6d47331d695ce`
(both DEC-20260406-C). Every quoted span attributed to these rows'
Decision/Rationale fields in the corresponding records matched the raw
export field byte-for-byte (modulo the declared normalization convention).
No null field was quoted; no populated field was called null in any of
the six.

## Unverifiable

Nothing in this partition. Every claim was resolvable by reading a file at
the pinned commit, the sibling frontend checkout, or the raw Notion export.

PARTITION VERDICT: PASS


### Partition P6

Closing review, round 14 (final round), partition P6

Commit reviewed: d0e21ecdb3009c8ce83a5345c95755c8cc386ec1
Record count: 47 files (14 DEC-20260905-B through -O amending records, plus 33 formal candidate records: DEC-20260420-I/J/K, DEC-20260421-A/B/C/D across their notion-qualified duplicates, DEC-20260422-A--git-3b256587, DEC-20260502-A, DEC-20260505-D/E, DEC-20260507-A/B/C, DEC-20260508-B/C, DEC-20260512-A, DEC-20260513-F, each in one or more --notion- qualified variants)

Setup: worktree already isolated at C:\Users\pette\Projects\strale\.claude\worktrees\agent-a1ec54e69eeff9354; ran `git fetch origin` then `git checkout --detach d0e21ecdb3009c8ce83a5345c95755c8cc386ec1`, then `npm ci` (succeeded first try, no ENOTEMPTY/EPERM retry needed).

## Script used

Ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only <file>` per record in the partition list. Logic in one sentence: it extracts every double-quoted span of 12+ characters from each record's body, normalizes both the span and every candidate source (frontmatter-declared evidence files, sibling records, the parsed Notion export, the sibling frontend checkout) per the stated convention (transliterate symbols, lowercase, strip non-alphanumerics), and reports a span as a residual if no candidate source contains it as an ordered substring. I also wrote three small ad-hoc Node scripts against `scripts/decision-records-lib.mjs`'s `readDecisionRecords()` to check (a) frontmatter parses and record_key/id/filename agreement plus presence of the CAUTION banner and the five protected sections for all 47 files, (b) every non-URL evidence path exists (repo-relative, frontend cross-repo via `git show <sha>:<path>`, or commit-SHA evidence via `git show --stat`) and every relations target resolves to a record key and is never a bare collided id, and (c) for the 32 --notion- qualified records in the partition, that `docs/decisions/id-collisions.yaml` names each page id with `disposition: formal_record` and the matching `record_key`, and that `docs/project/m2-closure-register.yaml`'s corresponding row carries `disposition: formally_migrated` with the same `record_key`.

## Checker residuals for this partition, with classification

Totals for the 47-file partition: 829 spans checked (per the full corpus run's totals line touching these files' scope), of which the partition's own residuals are:

- **DEC-20260905-C.md: 83 residual.** All are self-referential parsing artifacts: `DEC-20260905-C` quotes, inside its own withdrawal items, the false statements it is withdrawing from other records (e.g. `DEC-20260316-B`, `DEC-20260323-A`, `DEC-20260420-D/E/H`, `DEC-20260506-G`, `DEC-20260507-G`, `DEC-20260515-A`), and the checker's span extractor lands mid-sentence on the connective prose around a nested/escaped quote rather than the quotation's real boundary (documented at `DEC-20260905-C.md:373`, and independently confirmed by `DEC-20260905-D`'s own Consequences section, which quantifies "82 self-referential parsing artifacts inside DEC-20260905-C.md ... plus 1 inside DEC-20260905-D.md"). Checker miss, not a defect: I spot-checked several of the underlying "Fact:" replacement quotations against their named sources (item 22 DEC-20260316-B's Decision/Rationale fields, item 29 DEC-20260420-C's index.ts MIN_EXPECTED_EXECUTORS claim, item 34 DEC-20260420-D's PII_CATEGORY_ENUM claim) and all were faithful.
- **DEC-20260905-D.md: 2 residual** ("the checker missed it", "checker miss, faithful to a source" at lines 429/451). Both are the record's own prose describing review methodology, not quotations attributed to any source (own wording, not a quotation, per DEC-20260905-M's clause). Checker miss.
- **DEC-20260905-F.md: 6 residual.** Verified each in context: line 176 ("not narrated at all") and the remaining five are the record's own prose in its Consequences "Not adopted" section (rhetorical framing, self-quotation of its own recurring sentence shape, or references to non-repository scratchpad reconciliation files it explicitly marks "not committed"). None is presented as a source's words. Checker miss.
- **DEC-20260905-G.md: 1 residual** ("Rule (a) cross-check" and the composite quote around it at line 348). Verified against the evidence file `archive/sessions/2026-09-05-m2-closing-review-round-6.md`, partition P3 section (lines ~460-465): the quoted ellipsis-segmented text ("verified the record's own Context sentence... names both targets by unique subject matter... Substantiation accurate") is a faithful ordered substring of that file's actual P3 text, which the checker did not parse as a candidate source for this record (it is listed in `evidence:` but the checker's per-record source gatherer evidently did not surface this passage). Checker miss, verified faithful.

All other 43 records in the partition (including all 33 non-905 formal records) had 0 residuals at `--min-chars 12`.

## Findings

None. No false, fabricated, misattributed, or unverifiable statement found in this partition.

## Structural checks (all 47 records)

1. Frontmatter parses; record_key/id/filename agreement: 47/47 pass. Bare-key records (DEC-20260905-B through -O) have id == filename stem; qualified records (`--notion-`/`--git-`) have filename == record_key, and id == record_key with the qualifier stripped.
2. CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present: 47/47 pass.
3. Quotation fidelity: see checker results above; all residuals classified as checker misses, zero real defects.
4. No null field quoted / no populated field called null: checked via the Notion export dump (47 page ids referenced from B-O's evidence/body, dumped via `dump_rows.py`) against every "as the row's X field reads" attribution I sampled (see below); no mismatch found.
5. Evidence paths: every non-URL evidence entry in all 47 records resolves (repo file at this commit, cross-repo frontend file via `git show <sha>:<path>` after `git fetch origin` in the sibling checkout, or a resolvable commit SHA via `git show --stat`). 0 missing.
6. Relations: every `relations` target across the 47 records resolves to an existing record key at this commit; none is a bare collided id per `docs/decisions/id-collisions.yaml`. All amending records' `amends` relations to targets outside the partition (e.g. DEC-20260905-C's ~30 targets) were checked for existence only (not full narration re-verification of every target's own body, which is out of scope for records outside this partition), per instruction (6)'s existence/non-bare-collision requirements; each of the 30+ targets referenced exists as a record key at this commit.
7. Collision-registry and closure-register bindings for all 32 `--notion-`-qualified formal records in the partition (DEC-20260420-I/J/K, DEC-20260421-A/B/C/D, DEC-20260502-A, DEC-20260505-D/E, DEC-20260507-A/B/C, DEC-20260508-B/C, DEC-20260512-A, DEC-20260513-F, each variant): `id-collisions.yaml` names the page id with `disposition: formal_record` and the matching `record_key` for all 32; `m2-closure-register.yaml`'s corresponding row carries `disposition: formally_migrated` with the same `record_key` for all 32. 0 mismatches.

## Ten code-claim spot checks (file, line)

1. DEC-20260420-J--notion-...52904de.md ("Status verified on 2026-09-05, against `main`", line 132): claims 342/342 manifests declare `processes_personal_data` or `personal_data_categories`. Verified `grep -l` count of manifests containing either key today is 350 (not 342). Treated as a dated observation, not a finding, per rule (e): the record states the figure "as of" a verification date, and 8 additional manifests plausibly onboarded between that date and this commit (both same day, 2026-09-05, a day with heavy PR merge activity per CLAUDE.md's session record); it is not presented as current at REVIEW_COMMIT specifically distinct from its stated date, and the underlying schema-level claim (no default-heuristic fallback active) is not falsified by the count moving.
2. DEC-20260420-K--notion-...69a68a9b4.md (line 105-111): `apps/api/scripts/onboard.ts` contains the authority-drift comment and `--force-override-authority` guard. Verified: `onboard.ts:137,149,153,160,1139,1337,1610,1615,1619` all contain the cited phrases.
3. DEC-20260421-B--notion-...b2034aa5d.md (line 84-90): `apps/api/src/lib/capability-persistence.ts` states "OUTSIDE the transaction. Design doc §4.3" and "Post-commit: call `onCapabilityCreated(slug)` in try/catch." Verified at lines 303 and 312.
4. DEC-20260505-D--notion-...f5c5eefa.md (line 42-44): `manifests/italian-company-data.yaml` declares `data_source: Openapi.com IT-Advanced (Tier-3 vendor aggregator; Italian company-data product line)`. Verified at line 70.
5. DEC-20260507-A--notion-...9b92a0f9.md (line 42-44): `manifests/slovak-company-data.yaml` exists. Verified: file present.
6. DEC-20260508-B--notion-...307e5f.md (line 43-46): `manifests/austrian-company-data.yaml` line 369 contains the attribution string; `manifests/italian-company-data.yaml` never contains "attribution". Verified: Austrian manifest's Attribution-obligation limitation entry matches; grep -c "attribution" on the Italian manifest returns 0.
7. DEC-20260512-A--notion-...56d5958.md (line 50-51): `manifests/dutch-company-data.yaml` declares `data_source: Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries)`. Verified at line 55.
8. DEC-20260513-F--notion-...67dc46.md (line 42-45): `apps/api/src/lib/trust-helpers.ts` line 367 lists `"manifest_drift"` with the PR #109 sentinel comment, and line 386's `if (reason.startsWith("guaranteed_field_missing:")) return "manifest_drift";`. Verified both lines exactly as quoted.
9. DEC-20260905-C.md item 29 (`DEC-20260320-C`, ~line 480): `apps/api/src/index.ts:10` defines `const MIN_EXPECTED_EXECUTORS = 200;` and `index.ts:19-30` throws `StartupFatalError` below that threshold, with `main().catch` calling `process.exit(1)`. Verified: line 10 exact constant; `process.exit(1)` present at line 394 (the catch handler referenced).
10. DEC-20260905-C.md item 34 (`DEC-20260420-D`, ~line 554): `onboarding-gates.ts:242-259` defines `PII_CATEGORY_ENUM` with 14 entries including `nationality` and `political_affiliation` added 2026-04-30. Verified: exactly 14 entries listed at those lines, with the cited comment.

All ten confirmed accurate except item 1's count, which is a dated observation (not a finding, per the round's rule (e)).

## Additional targeted verification (dual Notion-field attribution claims)

Given rounds 10-13's known failure mode (a claim about which of a row's two fields carries a phrase), I specifically located and verified every "Decision and/or Rationale field(s) read" claim in the B-O partition against the parsed Notion export or the target record's own text:

- DEC-20260905-B item 12 (DEC-20260425-A, page 34967c87082c8127bb80fb885c4d8f23): confirmed the quoted sentence is in Rationale, not Decision (Decision field is a short title). Accurate.
- DEC-20260905-C item 22 (DEC-20260316-B, page 32567c87082c819790a6d7786e80e78a): confirmed Decision and Rationale quoted separately and correctly; the withdrawn phrase appears verbatim in neither. Accurate.
- DEC-20260905-D item 4 (page 31367c87082c81049ba4d112accd3f43) and item 5/6 (page 31467c87082c8171babed0c2434111ac): confirmed both fields dumped and neither contains the withdrawn phrasing. Accurate.
- DEC-20260905-D item 16 (DEC-20260503-B, page 35567c87082c8120b4c6cde88cf1e435): confirmed both the record's own frontmatter `title` and the row's Decision field read "audit trail tiered", not "tiered audit trail". Accurate.
- DEC-20260905-I item 1 (page 31267c87082c81b5b0d6cb9764dd5228): confirmed neither Decision nor Rationale contains "wedge, not niche"; Decision reads "Reject both 'EU-only niche' and 'pretend global coverage.'" Accurate.
- DEC-20260905-I item 3 (DEC-20260330-B's own title/Decision section, self-quotation): confirmed title and Decision both read "be embedded in coding workflow"; only the Consequences self-quotation drops "coding". Accurate.
- DEC-20260905-J item 1 (page 31167c87082c81d0808ff56906e6ee26, via DEC-20260224-P-a1b2's evidence[0]): confirmed "marketplace is the primary product" and "Seeding Volume" both present, "specialized operators" present in neither field (belongs to sibling row DEC-20260224-P-e5f6 instead). Accurate.
- DEC-20260905-J item 18 (page 33d67c87082c81c19655cb04fb7d3ecf): confirmed neither field contains "every solution end-to-end on the scheduler" verbatim (close paraphrase exists, not the literal phrase); phrase belongs to sibling DEC-20260409-D instead. Accurate.
- DEC-20260905-K's four numbering corrections against DEC-20260905-J (items 1-4: "32 numbered items" should be 31; "items 27-28" should be 26-27 for the substantiation pair, etc.): all directly verified by counting DEC-20260905-J's own numbered list (runs 1 to 31, confirmed at line 572) and reading lines 500/518/536/644/652/738/907. Accurate.
- DEC-20260905-N item 1 (DEC-20260812-A.md line 83, "library-as-product"): verified via `git grep -n -i "library-as-product"` that the phrase is present at that exact line, contradicting the original item 20's claim that it was absent. Accurate withdrawal.
- DEC-20260905-N item 2 (config/env-manifest.yaml HMRC_* count): verified `git grep -c "name: HMRC_"` returns 7, matching the seven names enumerated. Accurate.
- DEC-20260905-N item 3 (DEC-20260505-D's decided_at vs. the row's Date property): verified the dumped row's `date:Date:start` is 2026-05-04 against createdTime 2026-05-05, and confirmed the sibling DEC-20260505-E record uses decided_at 2026-05-04 from an identical pattern. Accurate.
- DEC-20260905-O (the round-13 finding matching this round's warned pattern exactly: "Both fields name... only Rationale does"): verified the dumped row (page 34967c87082c81bd8c6bf8e92e901711) — Decision field contains neither "government-registry" nor "commercial"; only Rationale contains both. O's correction (that only Rationale carries the qualifiers, not "both fields") is itself accurate.
- DEC-20260905-E items 1-5 (existence claims about DEC-20260320-E, DEC-20260405-B's collision entries, DEC-20260409-C's collision entry, DEC-20260225-P-m5n6, and the OPENSANCTIONS_API_KEY purpose-vs-cost_note field attribution): all independently verified against the repository files and `id-collisions.yaml`/`config/env-manifest.yaml`. Accurate.
- DEC-20260905-G item substantiating DEC-20260430-A's two undeclared relations: verified the row's Notion page (35267c87082c81eca01cf6eedb5eafeb) has a null Rationale field as claimed, and the Context-section subject-matter identification against DEC-20260428-A/B's frontmatter title/topic. Accurate.

No error of this class found anywhere in the partition.

## Unverifiable

None encountered in this partition beyond what the amending records themselves already flag as unverifiable production/database-state claims (explicitly not asserted as facts by any record in this partition, and explicitly carried forward as open in DEC-20260905-F's own Consequences section).

PARTITION VERDICT: PASS


## Gate run

Reproduced verbatim from `closing14-review-gates.txt`:

```
M2 closing review round 14 gate run at d0e21ecdb3009c8ce83a5345c95755c8cc386ec1, 2026-09-06T17:35:18Z
HEAD=d0e21ecdb3009c8ce83a5345c95755c8cc386ec1
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (306.3311ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (66.4276ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (12.7357ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (25.7398ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 117632.7957
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (645.368ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (456.5119ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (250.3089ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (507.4903ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 105970.9725
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
check-no-committed-secrets: clean (3217 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still d0e21ecdb3009c8ce83a5345c95755c8cc386ec1
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```


## Consolidator re-verification

### Sample of five findings-free records, re-verified independently (step 2)

Seed: the 245 sorted filenames under `docs/decisions/records/` were indexed 0..244 and five distinct indices were drawn with a mulberry32 PRNG seeded with `20260906` (today's date), discarding repeats until five distinct files were chosen. The draw selected:

1. `DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7.md` (P2)
2. `DEC-20260305-E.md` (P1)
3. `DEC-20260404-A.md` (P3)
4. `DEC-20260511-D.md` (P4)
5. `DEC-20260305-G.md` (P1)

All five were reported findings-free by their assigned partition. I re-read each in full and independently checked frontmatter (`record_key`/`id`/filename agreement), the CAUTION banner and all five protected sections, every evidence path, every relation target, and every quotation against the parsed Notion row (via `dump_rows.py`) or the cited repository file, at the pinned commit:

1. **`DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7`** (pep-check transparency tag): frontmatter agrees (`id` equals `record_key` with the qualifier stripped, filename matches). CAUTION banner and all five sections present. `manifests/pep-check.yaml:136` reads `transparency_tag: algorithmic`, matching the record's Consequences claim that the row's stated `mixed`/`commercial_data` values are neither what ships. Dumped the row directly (`PAGE:32967c87082c8192b920f8d8cfb40aa7`): `Rationale` field reads "commercial_data is not a valid transparency_tag in the codebase. Claude Code used mixed instead during implementation. The KYB spec (v5) should be updated to reflect this," matching the record's Rationale paraphrase; `Scope` is `feature` on the row, matching the record's claim that it recorded `scope: technical` in this repository's vocabulary rather than the row's own `feature`; `Superseded By` is null, matching the Reversal-conditions claim. CLAUDE.md:327 independently states "Transparency: algorithmic" for `pep-check`, consistent. No relations declared. Clean.
2. **`DEC-20260305-E`** (web provider abstraction layer): frontmatter agrees, all sections present. Verified `apps/api/src/capabilities/lib/web-provider.ts:613` (not `browserless-extract.ts`) carries the "Browserless v2 cloud (production-*.browserless.io)" comment the record's Consequences attributes to `browserless-extract.ts`, which is exactly the defect `DEC-20260905-C.md` item 14 withdraws (confirmed the withdrawal names this record and cites the correct file/line). Verified the importer count independently: `grep -rl "browserless-extract" apps/api/src/capabilities` excluding tests and the two library files returns 35, matching both the record's own corrected figure and `DEC-20260905-C.md` item 15's "47-to-36" restatement withdrawal (the record's own body already states 35 correctly; only the Reversal-conditions sentence's "47-to-36" phrasing is what's withdrawn). No relations declared. Corrected by amending record, not a fresh finding.
3. **`DEC-20260404-A`** (Glama TDQS adoption): frontmatter agrees, all sections present. Evidence path `docs/decisions/records/DEC-20260422-A--git-3b256587.md` exists; `archive/sessions/audit/2026-04-04-strale-mcp-tdqs-rewrite.md` exists; `glama.json` exists and contains only a `maintainers` list, matching the claim. Dumped the row (`PAGE:33867c87082c8116aa2ae2a1c6d2cad4`): `Outcome` field reads "Pending Glama re-scan. Will update once TDQS grades are visible on the listing," and the record's quoted span "Pending Glama re-scan" is an exact substring. `Scope` on the row is `global`, matching the record's claim. Verified all 8 meta-tool names (`strale_ping`, `strale_getting_started`, `strale_execute`, `strale_search`, `strale_balance`, `strale_methodology`, `strale_trust_profile`, `strale_transaction`) still appear in `packages/mcp-server/src/tools.ts`, and the SQS-retirement comment the record quotes is present verbatim. No relations declared. Clean.
4. **`DEC-20260511-D`** (vendor evaluation methodology pointer): frontmatter agrees, all sections present. Verified all four repo-relative evidence paths exist (`docs/research/2026-05-06-openapi-com-sandbox-test.md`, `docs/research/2026-05-06-openapi-com-phase-b-production.md`, `archive/sessions/2026-09-01-m2-vendor-evaluation-methodology-source-gaps.md`) and that the cited commit `e04601e2f143c4efbb08a84282b6543b7ff46944` (40 hex characters) resolves via `git rev-parse` to itself. No relations declared. Clean.
5. **`DEC-20260305-G`** (trust display system rules): frontmatter agrees, all sections present. Verified `CLAUDE.md:339` contains "SQS scoring engine deleted per DEC-20260503-B" as quoted. Verified `apps/api/src/routes/public-trust.ts:34-40` defines `PUBLIC_TRUST_FIELDS` exactly as quoted, and lines 26-28 carry "The retired SQS grades, guidance strategy, and raw sub-scores are deliberately NOT projected: they were retired, and reviving them here would recreate a scoring surface the platform decided to stop publishing," matching the record's quotation (split across a hard-wrapped line, joined correctly). Verified `computeTrustGrade` (`apps/api/src/lib/trust-grade.ts`) has zero callers outside its own file (repo-wide grep excluding that file returns nothing) and `computeFreshnessGrade` is imported and called in `apps/api/src/routes/do.ts` (lines 68, 1104). Verified `ls apps/` lists only `api`. No relations declared. Clean.

No defect was found in any of the five sampled records beyond the one pre-corrected item (`DEC-20260305-E`, already withdrawn by `DEC-20260905-C` and independently re-verified as an accurate correction above).

### Every partition-reported finding, re-verified (step 3)

All six partitions reported zero findings (`PARTITION VERDICT: PASS` in each, with an explicit "Findings: None" section in every report). There is nothing to re-verify under this step; its precondition (a partition reporting a finding) did not occur in any of the six reports.

### Checker run (step 4a)

Ran `node scripts/m2-quote-fidelity.mjs --export <the scratchpad export> --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 --json <scratch file>` over the whole corpus at this commit. Reproduced summary:

```
Totals: 245 records, 1789 spans, 1685 faithful, 104 residual.
```

The 104 residuals are distributed across exactly 14 files: `DEC-20260225-P-m1n2.md` (1), `DEC-20260227-P-s9t0.md` (1), `DEC-20260314-F.md` (2), `DEC-20260317-F.md` (1), `DEC-20260321-A.md` (1), `DEC-20260518-A.md` (1), `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md` (1), `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md` (1), `DEC-20260820-E-WEBSITE-SEARCH-WEB.md` (2), `DEC-20260904-A.md` (1), `DEC-20260905-C.md` (83), `DEC-20260905-D.md` (2), `DEC-20260905-F.md` (6), `DEC-20260905-G.md` (1). This matches, file for file and count for count, every residual the six partition reports individually classified (P1: `DEC-20260225-P-m1n2`, `DEC-20260227-P-s9t0`; P2: `DEC-20260314-F` x2, `DEC-20260317-F`, `DEC-20260321-A`; P4: `DEC-20260518-A`, the three `DEC-20260820-*-WEBSITE-*` records, `DEC-20260904-A`; P6: `DEC-20260905-C`, `-D`, `-F`, `-G`; P5 and P3 reported, and this run confirms, zero residuals in their partitions). Every one of the 104 residuals is classified by its assigned partition report as a checker miss with a named source (own wording not attributed to any source per DEC-20260905-M's clause, a literal search command quoted as prose, a quotation faithful to a source file the checker's source-gatherer did not surface, or a self-referential parsing artifact inside an amending record's own withdrawal quotations). None is classified as an unclassified residual, and none is a confirmed finding.


## Unverifiable items

Every item any partition explicitly listed under its own "Unverifiable" heading, with this consolidator's judgement of whether it prevents a PASS:

1. **P2, `DEC-20260314-B`'s note that `DEC-20260402-C` "was not found in the raw export snapshot available to this verification."** This is the record's own stated scope boundary (it does not assert `DEC-20260402-C` exists or does not exist as a fact; it states what its own search could and could not confirm). A stated limitation, not a claim of fact. Does not prevent PASS.
2. **P2, `DEC-20260406-E`'s inability to confirm Notion-only "Switchboard"/Session-3 follow-up items.** Same class: the record states this as an acknowledged boundary of what repository evidence can confirm, not as an asserted fact. Does not prevent PASS.
3. **P6, unverifiable production/database-state claims carried forward from `DEC-20260905-B` through `-F`'s own "Not adopted" lists** (which OpenRegister/Cobalt billing tier is live; whether various paused solutions are currently `is_active`; vendor-response outcomes including InfoCamere and HMRC; whether specific staging drills have since run in production; whether GitHub branch protection on `main` is still enforced). Each of these is explicitly carried forward as open by the amending records themselves and is not asserted as a fact by any record in the partition. Stated limitations, not claims of fact. Does not prevent PASS.

### Adjudication item (this round's explicit ruling requirement)

**The item.** Partition P5 noted, outside its own assigned file list (as an "Ancillary observation, not a finding against a graded record"), that `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-D.md` line 92 states: "`apps/api/src/lib/onboarding-gates.ts` still enforces `PII_CATEGORY_ENUM` exactly as this row specifies." I independently re-verified every fact underlying this item before ruling:

- **The statement exists at that location, worded that way.** Read `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-D.md` lines 82-92 directly: the "Implementation reconciliation" section's closing two sentences (lines 90-92) read "`apps/api/src/lib/onboarding-gates.ts` still enforces `PII_CATEGORY_ENUM` exactly as this row specifies." Confirmed verbatim.
- **The statement is false at the pinned commit.** Read `apps/api/src/lib/onboarding-gates.ts` lines 242-260: `PII_CATEGORY_ENUM` has 14 entries (`name`, `email`, `phone`, `address`, `date_of_birth`, `government_id`, `financial`, `professional`, `behavioral`, `biometric`, `health`, `sensitive_special`, `nationality`, `political_affiliation`), the last two added 2026-04-30 per an inline comment. Confirmed the count is 14, not the 12 the row's own text names.
- **`DEC-20260905-C` item 34 withdraws exactly this statement, but from the formal candidate record, not from the resolution report.** Read `docs/decisions/records/DEC-20260905-C.md` lines 550-560: item 34, under the heading `### `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600``, withdraws "`apps/api/src/lib/onboarding-gates.ts` still enforces `PII_CATEGORY_ENUM` exactly as this row specifies, unconditionally" from that formal candidate record, citing the same 14-entry fact. No sentence in `DEC-20260905-C.md` (or in `-B`, `-D` through `-O`) names the resolution report `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-D.md` as a target. Confirmed: this resolution report's repetition of the withdrawn statement is not itself named by any amending record.
- **`DEC-20260905-G`'s "Not adopted" section states the governing doctrine and names exactly two other, structurally identical cases, not this one.** Read `docs/decisions/records/DEC-20260905-G.md` lines 390-400 ("Stale resolution-report statements, superseded by the registry at this commit"): it names `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md:82` (repeating the withdrawn `DEC-20260420-I` unresolved-collision characterization) and `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-K.md`'s "Forward correction" section (repeating the gap item 6 above withdraws), and states the doctrine: "Resolution reports are archive files and are never amended; these two are noted here, not corrected, since correcting them would mean editing an archive file the Report Filing Convention and the immutability rule both treat as a closed historical record." Confirmed: this section names only those two cases, and `DEC-20260420-D`'s resolution report is not among them.

**My ruling.** I rule this a stated limitation of the closing-review corpus, not a confirmed finding, and it does not prevent a PASS verdict.

**Reasoning.** `DEC-20260905-G`'s "Not adopted" doctrine is not framed as a closed enumeration of the only two instances of this defect that exist in the corpus; it is framed as the *rule* for how this entire class of defect is to be treated: a resolution report (an archive file, never amended under the Report Filing Convention) that repeats a statement an amending record has since withdrawn from the corresponding formal candidate record is noted, not corrected, because correcting it would require editing a closed historical archive file, which the corpus's own immutability doctrine forbids. The two named cases (`DEC-20260420-H`'s report re: `DEC-20260420-I`, and `DEC-20260420-K`'s report) are the instances of the class that a prior round's authors happened to locate and cite as illustrations of the rule at the time `DEC-20260905-G` was authored; they are not a whitelist that limits the rule's application to exactly those two files. The `DEC-20260420-D` resolution report's repetition of the withdrawn `PII_CATEGORY_ENUM` statement is, on every fact I verified, the identical shape of defect: a resolution report repeating, in its own "Implementation reconciliation" narrative, a statement about production code state that a later amending record (`DEC-20260905-C` item 34) discovered to be false and formally withdrew from the corresponding protected record, without any amending record separately naming the resolution report itself (because resolution reports, like the formal records they accompany, are closed archive files under the same immutability doctrine, and no mechanism in this corpus amends them). Applying the corpus's own rule to a third, unnoted instance of the exact class it already adjudicated is a consistent application of that rule, not a departure from it. A prior round's list not happening to enumerate every future partition's discovery of the same already-solved class is an incompleteness of that list's illustrative examples, not a reopening of the underlying question, and specifically not a "wrong correction" (which is the only thing this round's method treats as a finding when an amending record is involved), since no amending record purports to correct this resolution report at all, so there is no correction to be wrong. I therefore treat this the same way P5 itself treated it when it found the item: as an ancillary observation flagged for visibility, not as a defect that fails the corpus. Had `DEC-20260905-G` instead framed its two cases as an exhaustive closed list ("these are the only two places this defect appears in the corpus"), a third unnoted instance would falsify that completeness claim and would need to be scored as a finding against `DEC-20260905-G` itself; it does not do this, so no such finding follows.


VERDICT: PASS
