---
doc_type: m2-closing-review-round
round: 6
commit: ff8a1384694532d037c5fc0b27588ee93daf63ae
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-05'
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

Round 6 of the M2 closing independent review, run after `DEC-20260905-F`
withdrew round 5's confirmed statements and substantiated the two relation
gaps that round raised, at commit
`ff8a1384694532d037c5fc0b27588ee93daf63ae`. Six fresh, read-only
reviewers, none the author of any reviewed content, applied the quotation
convention `DEC-20260905-D`/`-E`/`-F` state unchanged (normalize quotation
and source before comparing: transliterate symbols, lowercase, strip
non-alphanumerics; an ellipsis splits a quotation into ordered segments; a
relation substantiated by an amending record, or narrated in the target
record's own body rather than the source record's, is substantiated, not
a defect) and ran the operator checker, `scripts/m2-quote-fidelity.mjs`,
against the parsed Notion export and the sibling `strale-frontend`
checkout, in addition to the prior rounds' own method: each partition set
up a detached, read-only worktree at commit
`ff8a1384694532d037c5fc0b27588ee93daf63ae`, checked frontmatter validity,
the CAUTION banner, the five protected sections, every quotation, every
evidence path, every relation target, at least ten code claims, and, for
`--notion-` and `--git-` qualified records, the collision-registry and
M2-closure-register bindings. P1 through P4 each took a contiguous slice
of bare-keyed records; P5 took the `--notion-` qualified records belonging
to this batch's id-collisions; P6 took the remaining qualified records for
this batch plus the five prior withdrawal records `DEC-20260905-B`
through `DEC-20260905-F` themselves, checked like any other candidate
record. There is no sweep section in this archive: each partition covered
its own slice in full rather than by sample, per the method above (the
corpus-wide sibling-state and search-claim sweeps this round's finding
prompted live in `DEC-20260905-G`, not here). Reviewers could additionally
verify Notion page bodies read-only, beyond the parsed row-property
export, where a partition needed to. Below, every heading in each
reproduced partition report is demoted by exactly one level (`##` to
`###`, `###` to `####`, `####` to `#####`; a report's own top-level `#`
title is left as-is under a `### P<n>` wrapper) so this file keeps one
heading hierarchy throughout; nothing else in any report is edited.

## Partition reports

### P1

# Closing review, round 6 (final round), partition P1

Commit: `ff8a1384694532d037c5fc0b27588ee93daf63ae`
Records in partition: 41 (`docs/decisions/records/DEC-20260224-P-a1b2.md` through
`DEC-20260309-H.md`, listed one per line in `closing6-P1.txt`)

I read every one of the 41 records in full, read the five prior-round amending
records (`DEC-20260905-B` through `-F`) to know what round 6 treats as already
corrected, dumped the Notion rows for all 41 records' evidence[0] page ids
with `dump_rows.py`, ran the operator checker over my partition, checked every
evidence path, checked every relation target, and spot-checked more than ten
"status verified" code claims by reading the named files directly. `npm ci`
in the detached worktree (`C:/tmp/strale-closing6-P1`) had not finished
installing by the time I completed the review (background load from other
concurrent sessions); this did not block any check I ran, since both
`scripts/decision-records-lib.mjs` and `scripts/m2-quote-fidelity.mjs` have no
external npm dependencies (only Node built-ins plus the repo's own bundled
CommonMark/YAML parser) and both ran correctly.

### Script used

I ran the operator checker, `node scripts/m2-quote-fidelity.mjs --export
<decisions-export-raw.txt> --frontend <sibling checkout> --only <file>` (one
`--only` per record in my partition), which extracts every double-quoted
span of at least 25 characters from a record's body, normalizes both the
span and its named source (transliterate EUR/x/>=/<=/->/... symbols,
lowercase, strip non-alphanumerics), and reports the span faithful if its
normalized form is a substring of the normalized source (an ellipsis splits
the quote into ordered segments checked in order).

Result: **41 records, 141 spans checked, 141 faithful, 0 residual.** No
residual list to reconcile for this partition; the checker found no defect
anywhere in P1.

I separately wrote a small script against `scripts/decision-records-lib.mjs`'s
own `parseDecisionRecord` to check frontmatter parses, `record_key`/`id`
agree with the bare-key rule, the filename matches `record_key + ".md"`, the
CAUTION banner is present, and all five protected section headings
(`## Decision`, `## Context`, `## Rationale`, `## Consequences`, `## Reversal
conditions`) are present in the body. Result: **0 problems across all 41
records.** I also wrote a script to resolve every `relations[].target` in my
partition against the full `docs/decisions/records/` directory listing and
against `docs/decisions/id-collisions.yaml`'s collided ids. Result: **every
relation target exists as a record file; none is a bare collided id.**

### Findings

None. Every quotation I checked (via the script, and by direct reading of
the underlying source for the ones I hand-verified below) matched its
source under the stated convention. No fabricated, misattributed, or
composite quotation was found in this partition. No null field was quoted
and no populated field was called null (the one place a record makes a
claim about a Source field's null-ness across a batch,
`DEC-20260225-P-m1n2`'s Context, is the exact claim `DEC-20260905-D` item 2
already withdrew as false — see "Corrections already applied" below; it is
not a new finding). Every evidence path resolves. Every relation target
resolves and is narrated (in the source record's own prose, or, in one
case, `DEC-20260308-1`'s relation to a record outside my partition, in the
target's own file, both permitted forms). No relation target is a bare
collided id. This partition has no `--notion-`/`--git-`-qualified records,
so the collision-registry cross-check (review item 8) does not apply to
any file in P1.

### Corrections already applied by prior rounds (not findings against the original record, per this round's rule (a))

Several records in P1 carry statements that rounds 2-4's amending records
(`DEC-20260905-C`, `-D`) already withdrew by name. I checked each of these
corrections against the record it corrects and found the correction itself
accurate (per rule (a), a wrong correction would be a finding; none of
these was wrong):

- `DEC-20260224-P-g7h8`: "Long-term ambition is tens/hundreds of thousands
  of data sources," per project memory — withdrawn by `DEC-20260905-C`
  item 1 (the phrase is not in `CLAUDE.md`). Confirmed: full-file grep of
  `CLAUDE.md` at this commit finds no such phrase.
- `DEC-20260225-P-m1n2`: "first vertical: market research and competitive
  intelligence" (wrong word order/no ampersand) and the false claim that
  its own Source field is null "unlike most rows in this batch" — both
  withdrawn by `DEC-20260905-D` items 1-2. Confirmed against the parsed
  Notion export: every one of the 13 `DEC-20260225-P-*` rows, including
  `m1n2` itself, has a null Source field (verified directly in the dump
  I pulled), so there is no populated-Source majority for `m1n2` to be an
  exception to.
- `DEC-20260226-P-s3t4`: "Date-based API versioning via `Strale-Version`
  header" attributed to `CLAUDE.md` — withdrawn by `DEC-20260905-D` item 3.
  Confirmed: `grep -n "Date-based API versioning" CLAUDE.md` returns
  nothing at this commit.
- `DEC-20260227-P-a1b2`: "this row's own text names only 'the original
  Provider Growth doc,'" (inserted definite article/comma) — withdrawn by
  `DEC-20260905-C` item 5. Confirmed against the row's own Rationale field
  in the dump: no leading "the", no trailing comma at that point.
- `DEC-20260227-P-i9j0`: "the capability's own provider runs the code."
  (fabricated quotation) — withdrawn by `DEC-20260905-D` item 4. Confirmed
  against the row's Decision/Rationale fields in the dump: neither field
  contains this sentence.
- `DEC-20260227-P-s9t0`: two fabricated Unit 3 quotations ("Unit 3 becomes
  unnecessary because A2A/Visa TAP/Supertab matured" and "Unit 3 was built
  as a standalone Commerce Protocol") — withdrawn by `DEC-20260905-D`
  items 5-6. Confirmed against the row's fields in the dump: neither
  wording appears; the row instead reads "may become unnecessary" / "may
  be unnecessary".
- `DEC-20260227-P-u1v2`: "CLAUDE.md's 'Distribution packages & protocol
  endpoints' area" (misattributed to CLAUDE.md; it is a user-memory
  heading) — withdrawn by `DEC-20260905-C` item 6. Confirmed: no such
  heading in `CLAUDE.md` at this commit.
- `DEC-20260302-C`: "CLAUDE.md's ... section lists this row by its short
  form ('DEC-20260302-C: Homepage leads with solutions and trust
  positioning')" — withdrawn by `DEC-20260905-C` item 8 as stale (the
  bullet was rewritten under DEC-20260905-A). Confirmed: `CLAUDE.md`'s
  current DEC-20260302-C bullet reads "Historical homepage prescription;
  superseded for the apps/web redesign by DEC-20260905-A...", not the
  quoted string.
- `DEC-20260305-E`: the `browserless-extract.ts` comment misattribution
  and the "47-to-36 gap" Reversal-conditions restatement — withdrawn by
  `DEC-20260905-C` items 14-15. Confirmed: the "Browserless v2 cloud"
  comment lives in `web-provider.ts` (lines 613/617), and the record's own
  Consequences section already derives 35 as the current importer count
  (confirmed by direct grep), contradicting its own later "47-to-36"
  phrasing.
- `DEC-20260306-D`: "'Success Rate' vs. 'Test Pass Rate' naming confusion;
  renamed to 'Test Pass Rate'" (inserted word, tense change, punctuation
  change) — withdrawn by `DEC-20260905-C` item 16. Confirmed against the
  row's Rationale field in the dump: reads "confusion — rename to..." not
  "confusion; renamed to...", and has no "naming" in it.
- `DEC-20260309-G`: "returns no matches outside this record" — withdrawn
  by `DEC-20260905-C` item 17 (the phrase also occurs in
  `docs/programs/codex-review-backlog.yaml`, a meta-reference). Confirmed
  present in that file (not independently re-verified as a live claim;
  taking the withdrawal record's own citation at face value here, since
  re-deriving it does not change my P1 verdict either way).

None of these is a finding against the amended record (per this round's
rule (a)); I list them to show I checked the corrections rather than
merely trusting the withdrawal records' own say-so.

### Code-claim spot checks (ten or more, file and line)

1. `packages/langchain/src/index.ts:16-21` — `export class StraleFallbackTool
   extends Tool`, `name = "strale_fallback"`, description text matches
   `DEC-20260225-P-e7f8`'s quotation exactly.
2. `packages/langchain/package.json:2` — `"name": "straleio-langchain"`,
   matches the same record.
3. `packages/langchain-strale/langchain_strale/tools.py:21` — docstring
   `"""Fallback input for capabilities without a specific JSON Schema."""`,
   matches the same record; no `StraleFallbackTool`-equivalent class found.
4. `packages/sdk-typescript/package.json:2-3` — `"name": "straleio"`,
   `"version": "0.1.3"`, matches `DEC-20260226-P-q1r2`.
5. `apps/api/src/lib/auth.ts:3-20` — `sk_live_` + 32 hex chars, `key_prefix`
   = first 16 chars, matches `DEC-20260225-P-q3r4`'s auth-model claim.
6. `apps/api/src/lib/versioning.ts:4,14,20` — reads and writes the
   `Strale-Version` header, matches `DEC-20260226-P-s3t4`.
7. `apps/api/src/db/schema.ts:355-359` — `auditTrail`, `transparencyMarker`,
   `dataJurisdiction` columns exist on the transactions table, matches
   `DEC-20260226-P-s3t4`.
8. `apps/api/src/lib/x402-gateway.ts:63-64,238-241` — `USDC_CONTRACTS` with
   a Base-mainnet address and comment, and the line "Per DEC-20260308-1,
   EUR is the canonical platform currency", matches `DEC-20260225-P-s5t6`
   and `DEC-20260308-1` exactly.
9. `apps/api/src/capabilities/auto-register.ts:411` — `await
   import(\`./${slug}.js\`)`, confirms the manifest-driven dynamic-import
   mechanism `DEC-20260227-P-i9j0` describes.
10. `apps/api/src/capabilities/lib/browserless-extract.ts:1-10` — header
    comment "fetchRenderedHtml and getBrowserlessConfig are re-exported
    from web-provider.ts"; `grep -rl "browserless-extract"
    apps/api/src/capabilities` (excluding tests and the two library files)
    returns exactly 35 non-test importers, matching `DEC-20260305-E`'s
    corrected count (35, not 47/36).
11. `apps/api/src/lib/trust-grade.ts` — `computeTrustGrade` has zero
    callers anywhere in `apps/api/src` outside its own file (confirmed by
    repo-wide grep); `computeFreshnessGrade` is imported and called at
    `apps/api/src/routes/do.ts:68,1104`. Matches `DEC-20260305-G`.
12. `apps/api/src/routes/public-trust.ts:1-35` — header comment and
    `PUBLIC_TRUST_FIELDS = ["badge","badge_label","tested",
    "last_tested_at","pass_rate"]` match `DEC-20260305-G` and
    `DEC-20260306-D` verbatim.
13. `manifests/swedish-company-data.yaml:10,20,106` — `price_cents: 5`,
    `org_number` description "Swedish organisationsnummer (10 digits, e.g.
    556703-7485)", `data_source: Bolagsverket...`, matches
    `DEC-20260225-P-w9x0` and `DEC-20260225-P-m5n6` exactly.
14. `manifests/screenshot-url.yaml:1,10` and `manifests/ted-procurement.yaml:1,5,12`
    — header comments and prices match `DEC-20260225-P-a3b4` and
    `DEC-20260225-P-o7p8` exactly.
15. `ls manifests/*.yaml | wc -l` → 342, matching every record in this
    partition citing that count (`DEC-20260226-P-q1r2/u5v6/w7x8`,
    `DEC-20260227-P-a1b2/o5p6/i9j0`).
16. `docs/company/claims.yaml` — grep for "advisory"/"disclaimer"/
    "financial" returns nothing; `grep -l disclaimer manifests/*.yaml`
    returns exactly the four manifests `DEC-20260309-H` names
    (`competitor-compare`, `contract-extract`, `email-finder`,
    `landing-page-roast`); none of the eight named finance-capability
    slugs exists as a manifest. Matches `DEC-20260309-H` exactly.
17. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` — component
    order (`SolutionsShowcase` before `FreeTierShowcase`/`ProblemSection`/
    `QualityScoringSection`/`AuditTrailSection`, `StatsStrip` at line 276)
    matches `DEC-20260302-C` exactly, including the cited line number.
18. `strale-io/strale-frontend@04c9fca9:src/pages/Terms.tsx:216,254,262` —
    "8. Warranty and liability" section, the liability-cap paragraph, and
    the fraud/gross-negligence carve-out match `DEC-20260309-H` verbatim.

(18 spot checks performed; more than the required ten.)

### Unverifiable

Nothing in my partition. Every claim I attempted to check (quotation,
evidence path, relation target, code/file state, Notion row content) was
resolvable one way or the other from the worktree, the sibling frontend
checkout, or the parsed Notion export. `DEC-20260309-G`'s withdrawn
"returns no matches outside this record" claim is stated as false by
`DEC-20260905-C` and I did not independently re-run that exact
grep myself; I take the withdrawal at face value per rule (a) rather than
listing it as unverifiable, since re-deriving it would not change either
verdict.

PARTITION VERDICT: PASS

### P2

# Closing review, round 6 (round 2 of the M2 closing independent review), partition P2

Commit reviewed: `ff8a1384694532d037c5fc0b27588ee93daf63ae`
Records in partition: 40 (`DEC-20260310-E.md` through `DEC-20260411-B.md`, listed in `closing6-P2.txt`)

### Method

Worked in a detached worktree at the pinned commit (`C:/tmp/strale-closing6-P2`, `npm ci`, removed at the end with `git worktree remove --force` after confirming every reparse-point junction under its `node_modules` targeted a path inside the same worktree). For every record: parsed frontmatter and checked `record_key`/`id`/filename agreement; checked for the CAUTION banner and the five protected sections; extracted every quotation and checked it, by hand, against the record's evidence[0] Notion row (dumped read-only via `dump_rows.py PAGE:<id>` for all 40 pages in one batch), a cited repository file at the pinned commit, a cited `strale-io/strale-frontend@<sha>:<path>` file (via `git show <sha>:<path>` in the sibling checkout, after `git fetch origin`), or a cited sibling decision record; checked every `evidence` path resolves (script: parse each record's frontmatter, confirm every non-URL evidence entry is a file that exists) and every `relations` target resolves to a record key and is named in the body (or is one of the two relations DEC-20260905-D/E establish are substantiated by cross-record Notion-row prose rather than in-body narration: `DEC-20260409-D` → `DEC-20260409-A`/`DEC-20260409-B`); cross-checked `docs/decisions/id-collisions.yaml` to confirm no relation target is a bare collided id. Applied the DEC-20260905-C quotation convention throughout (transliterate €→EUR, ×→x, ≥→>=, ≤→<=, →→->, …→..., lowercase, strip all non-alphanumeric characters, then substring-match; an ellipsis in a quotation splits it into ordered segments). No record in this partition is `--notion-`/`--git-` qualified, so item (8) of the brief (collision-registry binding) does not apply to any file here.

Also ran the operator checker: `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --only <each of the 40 files>`. It normalizes and substring-matches every double-quoted span ≥25 characters against the same candidate sources (Notion row, repo file at commit, frontend file, sibling record); a residual is a span it could not match anywhere.

**Amendment cross-check (mandatory per the round-6 brief):** six of `docs/decisions/records/DEC-20260905-{B,C,D,E}.md`'s withdrawal items name a record in this partition. Six records carry a statement that one of those amendments withdraws verbatim, unedited (as required — active records are protected). Per rule (a) these are not findings against the original record; I verified instead that each amendment's *correction* is itself true:

| Record | Amending item | Correction verified |
|---|---|---|
| `DEC-20260313-C` | B#1 (isSQSUnqualified has no callers) | `CLAUDE.md:292` DEC-20260904-C entry matches verbatim |
| `DEC-20260313-C` | C#19 ("still listed, signal absent...") | Row Decision/Rationale fields confirmed not to contain the phrase |
| `DEC-20260314-A` | B#10 (tweets-v2.md em dash) | `archive/growth-ops/tweets-v2.md:24` matches the corrected form |
| `DEC-20260314-F` | B#9 (em dash vs comma) / C#20 (5 vs "five") | Row Rationale confirmed digit `5`, em dash present |
| `DEC-20260315-I` | B#4 (settleReceiptFor misattribution) | `do.ts:876-877` (verify call site) vs `:601` (settleReceiptFor def) confirmed distinct |
| `DEC-20260321-A` | B#11 (4× not "4x (24/6=4)") | Row Rationale confirmed `4×` |
| `DEC-20260330-B` | B#2 (context7.json rule 12 rewritten) | `context7.json` rule index 11 confirmed already rewritten, matches B's quoted replacement text exactly |
| `DEC-20260310-F` | C#18 (composite pipeline quote) | Confirmed composite; no re-check needed beyond withdrawal |
| `DEC-20260315-H` | C#21 ("armed in prod" not in CLAUDE.md) | `CLAUDE.md` DEC-20260812-A entry confirmed to lack the phrase; `do.ts:1771/1953/2866` confirmed to say "armed in production" |
| `DEC-20260316-B` | C#22 (paraphrase presented as quote) | Confirmed paraphrase, not a literal row string |
| `DEC-20260317-A` | C#23 (digest-sender.ts header vs function docstring) / C#24 (DEC-20260511-F is a formal record) | `digest-sender.ts:1-5` header vs the quoted line inside `sendDigestEmail`; `DEC-20260511-F.md` confirmed to exist as a formal record |
| `DEC-20260317-F` | C#25 ("armed in prod, not dry-run") | Same as DEC-20260315-H above |
| `DEC-20260318-A` | C#26 (quote belongs to DEC-20260318-B) | `DEC-20260318-B`'s own row Rationale confirmed to contain the exact phrase verbatim |
| `DEC-20260320-A` | C#27 (312-line composite) / C#28 (db.insert search) | Confirmed composite / confirmed ~25 additional non-excluded matches exist |
| `DEC-20260323-A` | C#30 (paraphrase presented as quote) | Confirmed paraphrase |
| `DEC-20260409-D` | C#32 (dropped parenthetical) / D#7 (relation to -B substantiated) / E#5 (DEC-20260409-C claim false) / E#6 (relation to -A substantiated) | Row Rationale confirmed the parenthetical exists; both cross-record relation bases independently confirmed in the two rows' Rationale fields |
| `DEC-20260320-E` | E#2 (cost_note vs purpose field) | `config/env-manifest.yaml:797-806` confirmed the quoted text is the `purpose` field, not `cost_note` |
| `DEC-20260320-F` | E#1 (DEC-20260320-E has a formal record) | `docs/decisions/records/DEC-20260320-E.md` confirmed to exist |
| `DEC-20260405-A` | E#3/E#4 (DEC-20260405-B and DEC-20260225-P-m5n6 both have formal records / registry entries) | Both files confirmed to exist; `id-collisions.yaml:140-155` confirmed `resolved`/`formal_record` for DEC-20260405-B |

All corrections check out. None is itself wrong.

### Checker residuals (3, all classified as checker misses, not defects)

1. `DEC-20260314-F.md:84` — `"completion_rate\|autonomous_completion\|autonomousCompletion"`. This is the record's own grep pattern, quoted to describe the search it ran, not a claim about a source's content. Manually confirmed the described repo-wide grep returns zero matches (`apps/api/src`). Checker miss (it has no source to match a methodology string against).
2. `DEC-20260320-A.md:96` — the `DEC-20260423-B` dimension-growth quote from `capability-readiness.ts`. Manually confirmed faithful: file header lines 9-13 contain, in order, "The last two dimensions were added per DEC-20260423-B (Stage A, warning mode)" then (after the ellipsis-elided middle sentence) "34 caps shipped to prod with NULL reliability." The bracketed `[reliability and limitations]` insertion is an editorial gloss, correctly bracketed. Checker miss (the checker's segmenter likely treats the bracket insertion as breaking the substring match; my by-hand check confirms every ellipsis segment is present in order).
3. `DEC-20260321-A.md:67` — `"schedule_tier\|scheduleTier\|ORDER BY"`. Same class as #1: the record's own grep pattern, not a source quotation. Manually confirmed the described grep against `solutions.ts`/`internal-tests.ts` returns the results the record states.

### Findings

1. **`DEC-20260314-C.md`, Consequences section** (no line number needed — the whole "No recurring multi-LLM evaluation job exists" paragraph): the record states "A search of `docs/`, `apps/api/src/`, `apps/api/scripts/`, and `scripts/` for 'multi-llm,' 'multi_llm,' 'multiLLM,' or 'ChatGPT evaluation' found no match," and separately, in the same file's own text, quotes those exact search terms. A literal search of `docs/` for `multi-llm`/`ChatGPT evaluation` (case-insensitive) at `ff8a1384` returns at least two matches: `docs/decisions/records/DEC-20260314-C.md` (the record's own file, containing the literal search terms) and `docs/project/DECISIONS.md` (the generated index, which mirrors the record's text). The record's own "found no match" claim is false as literally stated; the underlying substantive conclusion (no recurring, scheduled multi-model evaluation mechanism was ever built) is not disturbed, only the "found no match" search-result claim itself. This is the same class of defect DEC-20260905-C's item 17 already corrected for a different record (`DEC-20260309-G`'s "no matches outside this record" claim); no equivalent correction exists for `DEC-20260314-C`.

2. **`DEC-20260315-A.md:62`**: the record states, of its own row: "This matches the row's own description of the target ('free capabilities via MCP without auth')," attributing this quoted phrase to `DEC-20260315-A`'s own Notion row. I fetched the row (page `32367c87082c81eda40dfa601fd6b444`) and its full Rationale field reads only: "Auth wall is the #1 blocker for autonomous agent activity. 2027.dev AX research confirms auth causes 40% of agent failures. Without zero-auth free tier, content launch drives discovery but agents can't convert to usage. Moving Sprint 9F from Phase B Launch +3d to Launch day/+1d." No substring of that field, under any normalization, contains "free capabilities via MCP without auth." The phrase belongs instead to a *different* record's row: `DEC-20260314-F`'s own row (page `32367c87082c81bfaf90c949e06b8594`) states "Applied to: Sprint 9F (elevated to 5 free capabilities via MCP without auth)..." — this is a misattribution, borrowing a sibling record's row text and presenting it as this row's own. This is the same defect class DEC-20260905-C's item 26 already corrected for `DEC-20260318-A` (a quote borrowed from `DEC-20260318-B`'s row); no equivalent correction exists for `DEC-20260315-A`. Evidence: `docs/decisions/records/DEC-20260315-A.md:62`; `DEC-20260314-F`'s row Rationale field.

3. **`DEC-20260315-B.md`, Consequences section** ("A later formal record, DEC-20260330-B... predates that decision by 16 days"): arithmetic error. `DEC-20260315-B` is `decided_at: 2026-03-15`; `DEC-20260330-B` is `decided_at: 2026-03-30`. `2026-03-30` minus `2026-03-15` is 15 days, not 16 (`date(2026,3,30) - date(2026,3,15) == 15` days, verified by direct computation). A false statement about a date interval that the record itself computes and states as fact. Evidence: `docs/decisions/records/DEC-20260315-B.md` frontmatter `decided_at: 2026-03-15`; `docs/decisions/records/DEC-20260330-B.md` frontmatter `decided_at: 2026-03-30`.

4. **`DEC-20260404-A.md`, Consequences section** ("A repository-wide search for `TDQS` finds only `archive/sessions/audit/2026-04-04-strale-mcp-tdqs-rewrite.md`"): false as stated. A search for `TDQS` at `ff8a1384` returns at least 7 files, including at minimum one genuinely independent, unrelated mention: `archive/sessions/strale-spike-correlation-analysis-2026-04-08.md:207` ("Apr 4 | Reddit/X distribution, Glama TDQS, usage milestone | session | Yes — records spike as it happens"), which is not a self-reference and not the generated index. (The remaining matches are the record's own file, the generated `docs/project/DECISIONS.md` index, and prior closing-review round reports referencing this same finding pattern — self-references, not independent evidence, but the spike-correlation file alone is enough to falsify the "finds only" claim.) The record's substantive conclusion (no Glama re-scan verdict is recorded in the repository) is not disturbed; only the "finds only" search-result claim is false. Evidence: `archive/sessions/strale-spike-correlation-analysis-2026-04-08.md:207`.

#### Noted but not counted as findings (borderline, judged non-disqualifying)

- `DEC-20260320-B.md`, Consequences: attributes "thirty-four capabilities across six cohorts" to what "`DEC-20260423-B` superseded this record after an audit found." `DEC-20260423-B.md` itself states only "thirty-four capabilities incomplete" (no "six cohorts" language); the "six cohorts" detail lives in the sibling record `DEC-20260423-A.md:52` ("Thirty-four capabilities across six cohorts"), which `DEC-20260320-B` separately names as the record that "implemented the corrected write and readiness controls." Not in quotation marks (a paraphrase, not a literal quote), and both records plausibly describe the same 2026-04-23 audit event, so I did not count this as a defect, but flag it as a minor attribution imprecision for the consolidator's awareness.
- `DEC-20260406-E.md`, Consequences: "A search for 'Market Context' and 'Competitive Landscape' across `docs/strategy/` and `archive/sessions/` returns no matches." A case-insensitive search turns up one incidental hit (`archive/sessions/audit-output/_partial_mt_enumeration.md`, lowercase "market context" inside an unrelated sentence about Kyckr pricing) — round 4's own closing review already found and judged this identical nuance "not counted as a finding" since it does not disturb the record's actual claim (no canonical page or closeout artefact by that name exists). I follow that precedent and do not re-flag it.

### Ten code-claim spot checks (file and line)

1. `apps/api/src/routes/public-trust.ts:55,57,71,73` — `tested: boolean` / `pass_rate: number | null` fields, per `DEC-20260313-C`. Confirmed.
2. `apps/api/src/lib/trust-grade.ts:171-173,214` — `Combined Trust Grade` header, `TrustGrade` type, `computeTrustGrade` export, per `DEC-20260316-A`. Confirmed; zero call sites outside the file confirmed by grep.
3. `apps/api/src/db/schema.ts:220-221,964-966,1003-1006` — `qp_score`/`rp_score` columns, `capability_health` table (not renamed), `sqs_daily_snapshot` table, per `DEC-20260316-B`/`DEC-20260323-A`. Confirmed.
4. `apps/api/src/lib/test-runner.ts:2115-2117` — the "Removed" section naming `persistDualProfileScores` and four sibling functions, per `DEC-20260316-B`/`DEC-20260323-A`. Confirmed verbatim.
5. `apps/api/src/lib/x402-gateway.ts:104,391` — verify→execute→settle ordering comment and the `verifyX402Payment` deletion docstring, per `DEC-20260315-I`. Confirmed verbatim.
6. `apps/api/src/routes/do.ts:1987,2428` — the `Sync execution:` and `Async execution:` header comments, per `DEC-20260315-I`. Confirmed verbatim.
7. `apps/api/src/lib/onboarding-gates.ts:35` — `AUTO_INJECTED = new Set(["registration_number", "jurisdiction", "entity_name"])`, per `DEC-20260409-B`. Confirmed verbatim.
8. `apps/api/src/lib/gate4b-solution-dryrun.ts:1-7` and `apps/api/src/jobs/test-scheduler.ts:659-665` — Gate 4b header and the weekly-sweep/health-sweep code, per `DEC-20260409-D`. Confirmed verbatim.
9. `apps/api/src/lib/progressive-unlock.ts:11-16` and `apps/api/src/routes/auth.ts:549-551` — `UNLOCK_MAP` and the agent self-signup header comment, per `DEC-20260410-A`. Confirmed verbatim.
10. `manifests/sanctions-check.yaml:10`, `manifests/pep-check.yaml:11`, `manifests/adverse-media-check.yaml:11` — `price_cents: 20/5/20`, per `DEC-20260320-F`. Confirmed.

(Well beyond ten claims were actually spot-checked in the course of the review — every record's non-trivial code claim was verified — these ten are a representative sample as requested.)

### Unverifiable

- `DEC-20260318-A`'s claim that `apps/api/scripts/onboard.ts`'s flag parsing recognizes `--force` was confirmed only via a substring match inside `--force-override-authority`'s own error message text, not a standalone `--force` flag definition; I did not find an independent bare `--force` flag check. This does not materially affect the record's claim (the newer flags it lists as existing do exist), so I list it as unverified-in-detail rather than false.
- `DEC-20260404-A`'s claim that `strale-mcp@0.2.4` was the version shipped at the time of the 2026-04-04 rewrite could not be independently confirmed against npm's historical registry or a repo-tracked changelog; the current `packages/mcp-server/package.json` shows `0.2.8`, consistent with later publishes, but I could not verify the specific historical `0.2.4` claim.

### PARTITION VERDICT: FAIL

### P3

# Closing-review round 6, partition P3

Commit: ff8a1384694532d037c5fc0b27588ee93daf63ae
Record count: 41 (DEC-20260413-A through DEC-20260507-H, per closing6-P3.txt)

### Method

Set up a detached worktree at the pinned commit and ran `npm ci` there. For
every record: parsed frontmatter and confirmed `record_key`/`id`/filename
agreement and evidence/relation-target existence with a Python script that
walks the whole `docs/decisions/records/` directory (so relation targets were
checked against the full corpus, not just this partition); confirmed the
CAUTION banner and the five protected sections with a second script; ran the
operator checker `node scripts/m2-quote-fidelity.mjs --export
decisions-export-raw.txt --frontend strale-frontend --only <each file>` over
the partition; for every record's Notion-attributed quotations I judged
material, and for a sample beyond that, ran `dump_rows.py PAGE:<id>` directly
and diffed the quoted text against the returned field; read ten (in fact
more) named source files at the pinned commit to verify "status on" code
claims; and cross-referenced every quotation this partition shares with the
five closing-review correction records (`DEC-20260905-B` through `-F`)
against those records' own withdrawal items, verifying each cited correction
against the actual file/row before treating the original statement as
withdrawn-not-a-finding, per this round's rule (a).

### Checker output and residuals

Full run: `41 records, 115 spans, 114 faithful, 1 residual`.

- `docs/decisions/records/DEC-20260416-A.md:82` — quote "the first-party MCP
  is the only surface that exposes Strale's differentiated metadata"; the
  checker's best match was `DEC-20260901-A.md` (prefix 12, not a real match).
  **Classification: checker miss, not a defect.** The quotation is a faithful
  self-quote of this same record's own Rationale section (line ~48-49: "...
  the first-party MCP is the only surface that exposes Strale's
  differentiated metadata (SQS, limitations, structured errors)"),
  normalized-substring-verified by hand. The checker apparently does not
  check a record's quotations against its own earlier body text as a
  source, producing this false residual.

No other residuals in this partition's checker run.

### Rule (a): statements withdrawn by DEC-20260905-B/-C/-D/-F

Several of this partition's records carry statements that the five
correction records withdraw and replace. I verified every one of the
underlying corrections against the actual file/row before accepting them as
not-a-finding, per the round's rule (a):

- `DEC-20260419-A` (misattributes "a new file added to the allowlist
  requires a justification comment" to `check-no-new-console.mjs`'s header,
  withdrawn by `DEC-20260905-B` item 3): verified the header comment at
  `apps/api/scripts/check-no-new-console.mjs:1-16` contains no such
  sentence; the phrase is the record's own restated Decision text, not the
  script's comment. Correction accurate.
- `DEC-20260413-A` (paraphrase "aggressive addition when free to maintain"
  presented loosely as if quoted, withdrawn by `DEC-20260905-D` item 8):
  correction accurate against the row's own Rationale field.
- `DEC-20260422-B` ("leave the row, mark it, don't delete" presented as if
  quoted, withdrawn by `DEC-20260905-D` item 11): correction accurate; no
  sentence in this record, `DEC-20260421-J.md`, or
  `capability-readiness.ts` reads that exact phrase.
- `DEC-20260427-H` (Context claims no record for `DEC-20260420-H` exists,
  withdrawn by `DEC-20260905-D` item 12): verified
  `docs/decisions/id-collisions.yaml:287-303` lists `DEC-20260420-H` as
  `resolution_status: resolved` with a `disposition: formal_record` row
  (`record_key: DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f`)
  and that file exists on disk. Correction accurate.
- `DEC-20260427-I` (two defects withdrawn by `DEC-20260905-D` items 13-14:
  a stitched "(Phase 2a/2b)" composite, and a reversed-order quotation from
  `polish-company-data.ts`): verified
  `apps/api/src/capabilities/auto-register.ts:161-170` has two separate
  comments ("Phase 2a" for dutch, "Phase 2b" for portuguese, never combined
  as written), and `polish-company-data.ts:18-20`'s actual sentence order
  is opposite the record's ellipsis-joined quotation. Both corrections
  accurate.
- `DEC-20260428-B` (undeclared `related_to DEC-20260428-A` relation,
  substantiated not withdrawn by `DEC-20260905-D` item 15): verified
  `CLAUDE.md:288` ends "Pairs with DEC-20260428-A." — the stated basis
  holds.
- `DEC-20260503-B` ("tiered audit trail" transposed to "audit trail
  tiered", withdrawn by `DEC-20260905-D` item 16): the record's own
  frontmatter title correctly reads "audit trail tiered"; the Consequences
  section's self-quote reverses the two words. Correction accurate
  (byte-level, not verdict-determining on its own, but a real defect
  correctly captured by the amending record).
- `DEC-20260507-D` (inserted "the" before "readiness program adopted",
  quote attributed to CLAUDE.md/DEC-20260812-A, withdrawn by
  `DEC-20260905-D` item 17): verified `CLAUDE.md:302` begins "**Readiness
  program adopted.**" with no leading "the". Correction accurate.
- `DEC-20260506-G` (Kyckr quote misattributed to `DEC-20260507-D` instead
  of `DEC-20260507-F`, withdrawn by `DEC-20260905-D` item 38): verified
  `DEC-20260507-D.md` never mentions Kyckr anywhere, and
  `DEC-20260507-F.md`'s Context contains the quoted sentence verbatim.
  Correction accurate.
- `DEC-20260507-G` (date-math error, "one day after `DEC-20260518`" for a
  commit dated two days before, withdrawn by `DEC-20260905-D` item 39):
  verified `git log` on commit `9ee19282` returns 2026-05-16, and
  `DEC-20260518-F.md`'s frontmatter reads `decided_at: 2026-05-18`.
  Correction accurate.
- `DEC-20260430-A` (two undeclared `related_to` relations to
  `DEC-20260428-A`/`DEC-20260428-B`, substantiated not withdrawn by
  `DEC-20260905-F` items 1-2): verified the record's own Context sentence
  ("It explicitly kept the third-party sourcing doctrine and the
  engineering bar as governing context") names both targets by unique
  subject matter, matching the two records' frontmatter `title`/`topic`.
  Substantiation accurate.
- `DEC-20260505-H` (misattributes "not set in production" note to
  `OPENSANCTIONS_API_KEY`'s `cost_note`, withdrawn by `DEC-20260905-F`
  item 3): verified `config/env-manifest.yaml:806`'s actual `cost_note`
  reads "Held, not read...", not "not set in production". Correction
  accurate.

None of these produced a finding against the original record: each is
correctly withdrawn (or substantiated) by the amending record, and I
independently confirmed the amending record's own fact-check in every case.

### Numbered findings

No findings. Every quotation checked (by the operator checker, by direct
`dump_rows.py` comparison, or by hand against the cited repository file)
was faithful once the withdrawn/substantiated items above are set aside
per rule (a). All evidence paths in this partition's 41 records resolve to
files that exist at the pinned commit (repo-file paths checked
programmatically against the working tree; no cross-repo
`strale-frontend@sha:path` entries occur in this partition). All relation
targets resolve to a `record_key` that exists somewhere in
`docs/decisions/records/` at the pinned commit (checked against the full
236-file corpus, not just this partition), none is a bare collided id per
`docs/decisions/id-collisions.yaml`, and every declared relation is either
narrated directly in the citing record's own body or substantiated by one
of `DEC-20260905-D`/`-F` as described above. No null field is quoted as
populated and no populated field is called null in any of the direct
Notion-row checks I ran. All 41 records carry the CAUTION banner and all
five protected sections (Decision, Context, Rationale, Consequences,
Reversal conditions). None of this partition's records is a `--notion-` or
`--git-` qualified filename, so item (8) of the review instructions
(collision-registry/M2-closure-register binding check) does not apply to
any record in P3.

Rule (c) note: none of the 41 records in this partition attributes a
quotation to a Notion page's BODY content (as distinct from a
Decision/Rationale/Context/Outcome/Source database-property field); every
Notion-sourced quotation cites a structured row field, which is present in
`decisions-export-raw.txt` and was checked there. No record required a
`notion-fetch` body read under rule (c).

### Ten code-claim spot checks (of the required minimum; more than ten
performed)

1. `DEC-20260503-B` — `apps/api/src/db/schema.ts` still defines
   `qp_score`, `rp_score`, `matrix_sqs`, `matrix_sqs_raw`, and a full
   `sqs_daily_snapshot` table (lines 220-224, 1003-1024). Confirmed.
2. `DEC-20260505-A` — `CLAUDE.md:713` reads "Supersessions → ALWAYS use
   Contradiction Protocol (including CLAUDE.md update)"; `handoff/README.md`
   lines 3-5 read "Regenerated by `npm run archive:index`... Checked in CI
   by `npm run archive:index -- --check`. Do not edit by hand." Confirmed.
3. `DEC-20260505-C` — `apps/api/src/lib/matching.ts:175-179`'s
   `betterRate` function implements `priceCents ASC, slug ASC` with a
   comment citing `DEC-20260503-B` exactly as quoted. Confirmed.
4. `DEC-20260507-G` — `manifests/bulgarian-company-data.yaml:54` reads
   `data_source: Openapi.com WW-Top (Tier-3 vendor aggregator of EU
   company registries)`, contradicting the row's own decided Tier-1
   self-build path, as the record itself states. Confirmed.
5. `DEC-20260507-G` — `manifests/cypriot-company-data.yaml:83` reads
   `data_source: Openapi.com WW-Top (Tier-3) + data.gov.cy DRCOR
   open-data CSV (Tier-2 legal_representatives via C-prefix lookup)`.
   Confirmed.
6. `DEC-20260507-H` — `manifests/luxembourgish-company-data.yaml:54` and
   `manifests/hungarian-company-data.yaml:54` both read `data_source:
   Openapi.com WW-Top (Tier-3 vendor aggregator of EU company
   registries)`. Confirmed.
7. `DEC-20260427-H` — `apps/api/src/capabilities/auto-register.ts` still
   lists `patent-search` (line 153), `trustpilot-score` (204),
   `salary-benchmark` (213), `employer-review-summary` (222), and
   `linkedin-url-validate` (231) in the `DEACTIVATED` map. Confirmed.
8. `DEC-20260427-H` — `DEC-20260813-A.md:39-40` reads "Bulk crawling; the
   social-platform targets prohibited by `DEC-20260420-H`; Google surfaces
   prohibited by `DEC-20260427-H-4`; robots.txt evasion..." matching the
   record's quotation under the ellipsis convention. Confirmed.
9. `DEC-20260419-A` (via `DEC-20260905-B`'s correction) —
   `apps/api/scripts/check-no-new-console.mjs:1-16`'s header comment
   contains no "justification comment" requirement sentence; the fail
   condition at line 12 reads "a new `console.*` is introduced to a file
   not in the allowlist". Confirmed.
10. `DEC-20260427-I` / `DEC-20260905-D` items 13-14 —
    `apps/api/src/capabilities/auto-register.ts:161-170` has two distinct
    comments (dutch "Phase 2a", portuguese "Phase 2b", never combined);
    `apps/api/src/capabilities/polish-company-data.ts:18-20`'s sentence
    order is the reverse of the record's quotation. Confirmed.
11. (extra) `docs/decisions/id-collisions.yaml:287-303` — `DEC-20260420-H`
    is `resolution_status: resolved` with a `disposition: formal_record`
    row whose `record_key` matches an existing file on disk. Confirmed.
12. (extra) `git log` on commit `9ee19282` returns date `2026-05-16`, two
    days before `DEC-20260518-F.md`'s `decided_at: 2026-05-18`. Confirmed
    (supports the `DEC-20260905-D` item 39 correction).

### Direct Notion-row verifications (beyond the operator checker)

Ran `dump_rows.py PAGE:<id>` directly for six rows and diffed the quoted
text against the returned JSON field, all faithful: `DEC-20260415-A`
(Rationale), `DEC-20260415-B` (Rationale), `DEC-20260422-H` (Decision,
Scope, expiry date, confirmed Rationale is genuinely null), `DEC-20260427-H`
(Rationale), `DEC-20260424-A` (null-field sanity check), `DEC-20260422-D`
(confirmed Rationale/Outcome/Source genuinely null, Confidence: high as
claimed).

### Unverifiable

Nothing in this partition was left unverifiable. Two prose-only
cross-references this partition's own records flag as intentionally *not*
graph edges (`DEC-20260427-H`'s note about `DEC-20260420-H` prior to the
correction, and `DEC-20260506-G`'s citations of `DEC-20260422-H`/
`DEC-20260506-F` as having no formal record) are correctly self-disclosed
as prose-only by the records themselves and are not findings.

### Verdict

All 41 records in partition P3 pass: frontmatter/filename agreement,
CAUTION banner and five protected sections present, evidence paths exist,
relation targets exist and are substantiated (directly or via the
amending correction records), no bare-collided-id relation targets, no
null-field misattribution found, and all quotations faithful once the
`DEC-20260905-B/-C/-D/-F` withdrawals/substantiations (independently
re-verified here) are applied per rule (a). The one operator-checker
residual is a checker miss (a faithful self-quote), not a defect.

PARTITION VERDICT: PASS

### P4

# Closing-review round 6, partition P4

Commit reviewed: `ff8a1384694532d037c5fc0b27588ee93daf63ae`
Record count: 41

### Method

Detached worktree at the pinned commit, `npm ci`, read-only throughout, worktree removed at the end (no rm -rf; junction targets were checked with PowerShell `Get-ChildItem -Recurse -Force -Attributes ReparsePoint` and all pointed inside the worktree itself, so removal was safe). `node --test scripts/decision-records.test.mjs` was run once over the whole repository to get frontmatter/protected-section/relation-resolution/evidence-existence coverage for free (32/32 passing, including "the repository decision candidates and merge-base immutability checks pass"), then I ran `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend <strale-frontend checkout> --json <out>` with one `--only <file>` per record in my partition. The script extracts every double-quoted span of 25+ characters, normalizes both sides per the DEC-20260905-C convention (transliterate the six symbols, lowercase, strip non-alphanumerics), and tests each ellipsis-split segment as an in-order substring of every candidate source (Notion row fields, named repo files, sibling records, the frontend checkout, git commit messages). For every one of the 41 files I additionally read the full body, checked frontmatter (`record_key`/`id`/filename agreement), the CAUTION banner and five protected sections, evidence-path existence (including two unconventional `owner/repo@sha[:path]`-style entries verified with `git cat-file -e`/`git show`), relation-target existence and substantiation, and did spot checks of code/file claims (11 done, exceeding the 10 required).

Bare frontmatter/section check (grep-based, all 41 files): every file has `record_key == id == filename`, exactly one CAUTION banner, and exactly one each of `## Decision`, `## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`.

### Fidelity checker results for P4

Totals: 41 records, 89 spans checked, 82 faithful, 7 residual.

Residual list and my classification of each:

1. `DEC-20260508-A.md:78` — `"a Tier-1 path exists but has a fixed floor,"` (best match CLAUDE.md, prefix 6). **Checker miss.** This is the record's own restated finding in its Rationale section ("the prior row's ... finding is corrected to ...), not a quotation attributed to CLAUDE.md or any external source; it is trivially faithful to itself.
2. `DEC-20260510-A.md:86` — `"promote a useful handoff note to tracked,"` (best match notion:DEC-20260510-A, prefix 8). **Checker miss.** This is the record's own shorthand paraphrase of its own adopted policy, used descriptively, not attributed to the Notion row or any other source with an "as X states" framing.
3. `DEC-20260518-B.md:55` — `"can this country deliver T1/T2/T3"` (best match evidence:CLAUDE.md, prefix 5). **Checker miss.** Illustrative rhetorical phrasing the record author writes to describe the kind of question the audit answers; not attributed to any document.
4. `DEC-20260518-D.md:43` — `"does Strale return this today"` (best match notion, prefix 16). **Checker miss.** Same pattern: an illustrative rhetorical question in the record's own Context prose, not a citation.
5. `DEC-20260827-A.md:40` — `"licensed contract with the Austrian Justizministerium for direct Firmenbuch API access"` (best match a different record, prefix 10). **Checker miss.** Verified this is a verbatim quotation of `apps/api/src/capabilities/auto-register.ts:199-200`, which is not in the record's own evidence array (an evidence-list-completeness gap, explicitly not a withdrawal target per DEC-20260905-C's Consequences). The citation label "the historical `DEC-20260427-I-6` record" mirrors an identical citation convention already used by the sibling record `DEC-20260427-I.md` itself for the same code comment, so it is not a fabrication, only a loose informal label for a sub-item cited in code comments.
6. `DEC-20260904-A.md:180` — the `closes_when` quotation (best match DEC-20260905-C, prefix 7). **Checker miss.** Verified verbatim against `docs/project/m2-closure-register.yaml` lines 5139-5141 (G1's `closes_when` clause); that file is not listed in the record's own evidence array (same evidence-list-completeness gap, not a defect per precedent).
7. `DEC-20260904-B.md:102` — `"where did this id's authority come from"` (best match DEC-20260427-B, prefix 7). **Checker miss.** The record's own rhetorical framing of its design rationale, not attributed to any source.

None of the 7 residuals is a real defect.

### Findings

None found that are not already corrected by a prior withdrawal record. Specifically:

- `DEC-20260510-A.md` contains the withdrawn quoted count "244 files (217 with a recorded intent, 27 without)" (DEC-20260905-B item 5). Per the round rules this is corrected, not a finding against the original record; I verified the correction itself is right (`handoff/README.md` moves with every handoff and is not authoritative at a fixed figure).
- `DEC-20260511-C.md` contains the withdrawn attribution of "CC does not reconcile silently" to "the 2026-05-13 cleanup prompt" (DEC-20260905-B item 6). Verified the correction: `handoff/_general/from-code/2026-05-13-drizzle-quirks-verification.md` does not contain the phrase; it appears only in the unrelated `2026-05-06-chromium-phase3-halt-partial-flag-survival.md:61`.
- `DEC-20260507-D.md` contains the withdrawn "the readiness program adopted ... the Counterparty Assurance framing is retired as primary product, compliance is a separate track gated on customer discovery" with an inserted leading "the" (DEC-20260905-D item 17). Verified: `CLAUDE.md:302` begins "**Readiness program adopted.**" with no leading "the".
- `DEC-20260515-C.md` contains the withdrawn inserted-word quotation "a paid AJPES restPrsInfo contract with redistribution rights, or a future EU High-Value-Dataset expansion" (DEC-20260905-D item 18). Verified: `manifests/slovenian-company-data.yaml:135-136` has no leading "a" before "paid".
- `DEC-20260515-A.md` contains the withdrawn claim "The commit id this row cites, `34036a0`, does not resolve on `main`" (DEC-20260905-C item 40, carried into the wrong record). I independently dumped both Notion rows via `dump_rows.py` (pages `36167c87082c8199bbc9e65480db6f80` and `36167c87082c814281dcd2dac911efa0`) and confirmed: DEC-20260515-A's own Rationale contains no commit id and its Source field is `None`; DEC-20260515-B's Rationale and Source both cite commit `34036a0`. The correction is right; DEC-20260515-B's own record (also in my partition) correctly makes this same claim about itself, and does so faithfully.

No other quotation, attribution, evidence path, relation, or code claim in my partition was found false, fabricated, misattributed, or unverifiable.

### Code-claim spot checks (11, file:line each)

1. `docs/decisions/records/DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md` "56 geometry checks with zero failures" — confirmed verbatim in `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/round-09-four-world-responsive-review/four-world-conformance-report.md` ("The final automated geometry pass completed **56 checks with zero failures**.").
2. `docs/decisions/records/DEC-20260513-A.md` apps/web absence and drizzle-only-at-CI claims — confirmed `apps/` in this repo lists only `api`; `strale-io/strale-frontend@04c9fca...` carries `public/_headers` and no `wrangler.toml`.
3. `docs/decisions/records/DEC-20260507-I.md` VOICE.md search claim — confirmed `docs/company/VOICE.md` (57 lines) contains none of "section 1", "section 6.5", "first person", "petter@strale.io", "hello@strale.io", "1:1".
4. `docs/decisions/records/DEC-20260507-J.md` recordFailure call-site count — confirmed exactly 4 non-test call sites, all in `apps/api/src/routes/do.ts` (lines 1773, 1955, 2305, 2868).
5. `docs/decisions/records/DEC-20260508-D.md` OpenRegister live config — confirmed `apps/api/src/capabilities/german-company-data.ts:21,99` and `config/env-manifest.yaml:788-793`.
6. `docs/decisions/records/DEC-20260511-B.md` block 0066 claim — confirmed `apps/api/src/lib/startup-migrations.ts:574,610`.
7. `docs/decisions/records/DEC-20260511-C.md` drizzle reintroduction claims — confirmed `apps/api/drizzle.config.ts` exists, `drizzle-kit` devDependency present, `apps/api/drizzle/` absent.
8. `docs/decisions/records/DEC-20260511-E.md` meta-monitoring.ts anchoring — confirmed `apps/api/src/lib/meta-monitoring.ts:421,482,544,977-978`.
9. `docs/decisions/records/DEC-20260511-F.md` zero-callers claim — confirmed `sendInterruptEmail` has no callers outside its own definition file.
10. `docs/decisions/records/DEC-20260513-B.md` swiss manifest fixture and admin route — confirmed `manifests/swiss-company-data.yaml:97,112` and `apps/api/src/routes/admin.ts:658,661`.
11. `docs/decisions/records/DEC-20260904-B.md` regex pattern and finding codes — confirmed `scripts/decision-records-lib.mjs:26` and `scripts/m2-closure-register-lib.mjs:609,611,621,623` match verbatim.

Additional evidence and relation checks performed (not counted above): commit-sha evidence entries `strale-io/strale@3f7f650...` and `codex/repo-native-operating-model@b295109...:archive/imports/context-pack/2026-08-31/manifest.json` both resolved via `git cat-file -e` / `git show`; all `strale-io/strale-frontend@...` cross-repo entries resolved in the sibling checkout after `git fetch origin`; relation targets `DEC-20260503-A`, `DEC-20260428-A`, `DEC-20260518-B`, `DEC-20260518-E`, `DEC-20260815-A`, `DEC-20260812-A`, `DEC-20260831-A`, `DEC-20260503-B`, `DEC-20260505-H`, `DEC-20260420-A`, `DEC-20260515-A`/`-B` all exist and are substantiated in prose; `DEC-20260503-C` and `DEC-20260506-D` confirmed absent as formal records, as their citing records (`DEC-20260513-A`, `DEC-20260513-D`) state; commits `86b04be6...`, `5eeff8ba...`, `ef9f6649...`, `e04601e2...` confirmed resolvable; commits `34036a0` and `8eb8c0e` confirmed NOT resolvable, as `DEC-20260515-B` and `DEC-20260515-C` respectively state; PR #131, #137, #361, #362 statuses confirmed via `gh pr view`.

### Unverifiable

Nothing in my partition was left unverifiable. All Notion-row-attributed quotations in my partition were either machine-checked faithful by the fidelity script or (for the 7 residuals) manually traced to their real source and confirmed not to be external-source attributions at all.

### Not corrected, noted for completeness

`DEC-20260827-A.md` and `DEC-20260904-A.md` (and `DEC-20260904-B.md`) cite files (`apps/api/src/capabilities/auto-register.ts`, `docs/project/m2-closure-register.yaml`) that are quoted accurately but not listed in the record's own `evidence:` array. Per DEC-20260905-C's Consequences section ("Evidence-list completeness gaps ... Evidence lists on active records are immutable and the quotations themselves are accurate; not a withdrawal target"), this is an established, already-excused class, not a new finding.

PARTITION VERDICT: PASS

### P5

# Closing review, round 2 (round 6 overall), partition P5

Commit reviewed: `ff8a1384694532d037c5fc0b27588ee93daf63ae`
Record count: 34 files (all `--notion-` qualified duplicates; this partition is the collision layer for these 17 historical IDs)

Files: DEC-20260225-P-c5d6 (x2), DEC-20260303-A (x2), DEC-20260304-A (x2),
DEC-20260304-B (x2), DEC-20260304-C (x2), DEC-20260320-C (x2), DEC-20260320-J (x2),
DEC-20260320-K (x2), DEC-20260405-B (x2), DEC-20260406-A (x2), DEC-20260406-B (x2),
DEC-20260406-C (x2), DEC-20260409-C, DEC-20260420-D, DEC-20260420-E (x2),
DEC-20260420-F (x2), DEC-20260420-G (x2), DEC-20260420-H (x2)

### Method

Set up a detached read-only worktree at the pinned commit
(`C:/tmp/strale-closing6-P5`, `npm ci` run there). Wrote small Python scripts
(kept under `C:/tmp/p5work/`) to: (1) parse every record's frontmatter, check
`record_key`/`id`/filename agreement and the presence of the CAUTION banner
and the five protected sections; (2) confirm every repo-local `evidence` path
exists at the pinned commit; (3) confirm every `relations` target exists as a
record key and is never a bare collided id from `docs/decisions/id-collisions.yaml`;
(4) for every `--notion-` qualified record, confirm `id-collisions.yaml` names
its page id with `disposition: formal_record` and the same `record_key`, and
that `docs/project/m2-closure-register.yaml`'s row for that page id carries
`disposition: formally_migrated` with the same key. Read all 34 Notion rows
in one call through `dump_rows.py` and compared every quoted span in each
record against the row's `Decision`/`Rationale` fields, applying the stated
normalization convention (transliterate, lowercase, strip non-alphanumerics,
ellipsis-splits) by hand for every quotation over 25 characters, plus several
shorter ones. Read every one of the 34 record bodies in full. Ran the
repo's own operator checker, `node scripts/m2-quote-fidelity.mjs --export
<raw export> --frontend <sibling checkout>`, over the whole corpus and
filtered to this partition's files. Verified 15 "status on main" code claims
(more than the required 10) by reading the named files directly.

### Operator checker (`scripts/m2-quote-fidelity.mjs`) results for P5

All 34 files: **0 residual** reported by the checker (spans-checked counts
ranged 1-19 per file; every span it extracted was found faithful against its
declared source). No residual to classify for this partition. As a liveness
check, the same run over the full corpus does report non-zero residuals
elsewhere (e.g. `DEC-20260905-C.md`: 82 residual, `DEC-20260905-F.md`: 5
residual, plus several single-residual files such as `DEC-20260320-A.md`,
`DEC-20260321-A.md`, `DEC-20260510-A.md`), confirming the checker is live and
not hollow for this run.

One item the checker did **not** flag as a residual but that a prior round's
correction record already addresses: `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`
line 57 quotes "direct connections only. No scraping. Full ToS compliance"
(dropping the word "data" that the actual source, `DEC-20260420-I`'s Decision
section, contains: "direct **data** connections only..."). `DEC-20260905-C.md`
item 37 already withdraws exactly this statement and states the correct fact,
which I independently re-verified against `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md`'s
own Decision section — the correction is accurate. Per the round's rule (a),
this is not a new finding against the original record.

### Findings

1. **`DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md` (the
   "Option C" manifest-drift record), lines 105-106: false statement about
   repository state at the pinned commit.** The record's Context section
   states the page id `34867c87082c81c8b9d4c6b5568bbcef` (`DEC-20260420-I`)
   is "itself an unresolved collision id in a later G2 batch." At
   `ff8a1384694532d037c5fc0b27588ee93daf63ae`, `docs/decisions/id-collisions.yaml`
   records the `DEC-20260420-I` collision with `resolution_status: resolved`
   and `resolution_evidence: archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-I.md`,
   and both of its two rows carry `disposition: formal_record` with existing
   formal-record files (`docs/decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md`
   and `...-notion-34867c87082c8172a41ac4c9d52904de.md`, both present on
   disk at this commit). The identical claim also appears, unflagged, in the
   corresponding resolution report,
   `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md`
   line 82 ("itself an unresolved collision id reserved for a later G2
   batch"). That same resolution report explicitly flags an analogous
   staleness for a *different* record (`DEC-20260503-A.md`'s "withheld and
   preserved as unresolved source-ID collisions" language, lines 131-134,
   "is now stale prose") but does not apply the same self-correction to its
   own "unresolved... G2 batch" characterization of `DEC-20260420-I`. I
   searched `DEC-20260905-B.md` through `-F.md` for any withdrawal of this
   specific statement and found none (only the unrelated dropped-word
   correction in item 37, addressed above). Evidence:
   `docs/decisions/id-collisions.yaml` (lines ~ the `DEC-20260420-I` block);
   `docs/decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md`;
   `docs/decisions/records/DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md`;
   `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-I.md`.

No other findings. Every other quotation, evidence path, relation target,
frontmatter field, and code claim checked in this partition was faithful and
verifiable at the pinned commit.

### Ten (of fifteen) code-claim spot checks

1. `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`: claims
   `auto-register.ts` no longer has a `.d.ts` filter or `MIN_EXPECTED_EXECUTORS`
   startup gate, replaced by manifest-driven registration with three named
   error labels. Verified: `apps/api/src/capabilities/auto-register.ts` has
   no `.d.ts`/`MIN_EXPECTED_EXECUTORS`/`process.exit(1)` reference; header
   comment states "The previous filesystem-glob discovery... Manifest is
   the source of truth"; labels `auto-register-executor-file-missing`,
   `auto-register-import-failed`, `auto-register-no-executor-after-import`
   all present at lines 402/413/420.
2. `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md`: claims
   `manifests/au-company-data.yaml` has `category: company-data`,
   `price_cents: 5`, `is_free_tier: false`, `data_source: Australian
   Business Register (ABR)`, and the env var is `ABN_LOOKUP_GUID` not
   `ABR_AUTH_GUID`. Verified all fields exactly; `config/env-manifest.yaml`
   line 20 and `au-company-data.ts` lines 17/20 confirm only `ABN_LOOKUP_GUID`.
3. `DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7.md`: claims
   `manifests/pep-check.yaml` declares `transparency_tag: algorithmic`, not
   `mixed` or `commercial_data`. Verified: line 136 reads exactly
   `transparency_tag: algorithmic`.
4. `DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md`: claims
   `TypeaheadResult.price_cents` in the frontend carries the comment "null
   for capabilities (DEC-20260304-A)". Verified in `strale-frontend`
   at `04c9fca9:src/types/index.ts` line 109:
   `price_cents: number | null;  // null for capabilities (DEC-20260304-A)`.
5. `DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md`: claims
   `StatsStrip.tsx`'s `buildStats()` returns four stats (workflows,
   capabilities, automated tests, free-no-signup), none of them "Countries".
   Verified at `04c9fca9:src/components/StatsStrip.tsx` lines 21-24, plus
   the cited "Cert-audit Y-1+Y-3" comment at lines 13-16.
6. `DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md`: claims
   `TestRunLog.tsx` renders a monospace, pass-rate-accented log with
   `border-b border-border`. Verified at `04c9fca9:src/components/solutions/TestRunLog.tsx`
   lines 172-208 (font-mono, `getPassRateColorClass`, `border-b border-border`).
7. `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`: claims
   `trust-display.ts` defines `getTrustDisplayState()` preceded by "Every
   component rendering trust data must call getTrustDisplayState() first."
   Verified at `04c9fca9:src/lib/trust-display.ts` lines 2/146.
8. `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`: claims
   `apps/api/src/db/schema.ts` defines `failedRequests` (table
   `failed_requests`) with a `DEC-20260225-P-c5d6` comment, and `do.ts`
   inserts into it at four call sites. Verified: `schema.ts` line 678
   comment and table definition at 681-682; `do.ts` has exactly four
   `db.insert(failedRequests)` call sites (lines 935, 1163, 1207, 1265).
9. `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md`: claims
   `apps/api/src/routes/suggest.ts` defines both `GET /v1/suggest/typeahead`
   and `POST /v1/suggest`, both public/no-auth. Verified at lines 43 and 83.
10. `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md` and
    `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md`: claim
    `solution-executor.ts` exports `parsePath()`/`walkPath()` and a
    `StepTiming` interface with `latencyMs`. Verified at lines 76, 110,
    217-219, 413, 518, 544.

(Five further spot checks done beyond the required ten, all confirmed:
`onboarding-gates.ts`'s `PII_CATEGORY_ENUM`, `audit-helpers.ts`'s
"SA.2b.d: heuristic `detectPersonalData` was removed after migration 0050"
comment, `verify.ts`'s `MAX_DEPTH = 50` and its two named F-A-012 comments,
`platform-facts.ts`'s "free-tier list: 5 in marketing, 11 in manifests, 5
different in production" header line, and CLAUDE.md's SQS-deletion and
free-tier paragraphs quoted by the free-tier-showcase record — all matched
verbatim.)

### Other checks performed (all clean for this partition)

- Frontmatter: all 34 parse; `record_key`/`id`/filename agree in every case.
- CAUTION banner and all five protected sections (Decision, Context,
  Rationale, Consequences, Reversal conditions) present in all 34.
- No null field quoted, no populated field called null: spot-checked the
  five rows whose `Rationale` is null in the export
  (`DEC-20260420-F--notion-...810b8df1e8e459039d35`,
  `DEC-20260420-H--notion-...b58b36de5f71c0937f`,
  `DEC-20260420-E--notion-...81d5a898f48cc1554086`,
  `DEC-20260420-G--notion-...81dcafe3dea59cc119b1`,
  `DEC-20260405-B--notion-...34a67c87082c810692c8dd4374a6f9ac`) — each
  record correctly states "Rationale: None recorded on the row" / "not
  recorded on the row" rather than fabricating or quoting one.
- Evidence: every repo-local evidence path in all 34 files exists at the
  pinned commit; every cited `archive/sessions/2026-09-05-decision-collision-resolution-*.md`
  report exists.
- Relations: every `relations.target` in this partition resolves to an
  existing record key at the pinned commit and is never a bare collided id
  (checked against all 35 ids in `docs/decisions/id-collisions.yaml`).
  Every relation-bearing record in this partition (`DEC-20260320-C`
  au-company-data → `DEC-20260320-B`; `DEC-20260406-A` per-step-latency →
  `DEC-20260405-B--notion-...810c920dd09d78aa06b6`; `DEC-20260406-C` tidy →
  `DEC-20260406-B--notion-...81629339d9f208f65f52`; `DEC-20260409-C` → both
  `DEC-20260409-A`/`-B`; the `DEC-20260420-D` through `-H` chain → each
  other and `DEC-20260420-A`) is substantiated by named prose in the body,
  not merely declared in frontmatter.
- Item (8), qualified-record registry binding: for all 34 `--notion-`
  records, `docs/decisions/id-collisions.yaml`'s matching page-id entry
  carries `disposition: formal_record` with the identical `record_key`, and
  `docs/project/m2-closure-register.yaml`'s row for that page id carries
  `disposition: formally_migrated` with the identical `record_key`. No
  mismatches found (verified programmatically for all 34).
- Shared-`Source`-field cross-references (the three same-day rows citing
  `https://www.notion.so/31967c87082c816d9d44cd4317386a30` as a shared spec
  page) independently confirmed against the parsed Notion export.

### Unverifiable

Nothing in this partition. Every quotation, evidence path, relation, and
sampled code claim resolved to a definite true/false answer against the
pinned commit, the parsed Notion export, or the sibling frontend checkout.

### Worktree cleanup note

`git worktree remove` (then `--force`) successfully unregistered
`C:/tmp/strale-closing6-P5` from git's worktree list, and recursive deletion
removed all but the empty root directory, which remained locked by an
unidentified process (no process was found with a handle rooted at that
path via `Get-Process`) after several retries. All junctions under its
`node_modules` pointed only at paths inside this same worktree
(`Get-ChildItem -Recurse -Force -Attributes ReparsePoint` confirmed this
before any deletion), so the deletion attempted was safe by the stated rule.
The leftover is an empty, git-untracked directory with no content risk.

PARTITION VERDICT: FAIL

### P6

# Closing review, partition P6, round 2 (final round)

Commit reviewed: `ff8a1384694532d037c5fc0b27588ee93daf63ae`
Record count: 38 (33 dated candidate records, including 12 collision pairs
and one `--git-` qualified record, plus the five amending records
`DEC-20260905-B` through `-F`)

### Method

Checked out `ff8a1384694532d037c5fc0b27588ee93daf63ae` in a detached
worktree (`C:/tmp/strale-closing6-P6`), ran `npm ci` there. Read every one
of the 38 files in full. Wrote a small Python script that parses each
record's frontmatter and checks: `record_key`/`id`/filename agreement
(qualified-key and bare-key forms), the CAUTION banner, presence of all
five protected headings, every `evidence:` entry resolving to a file (or an
`http`/`strale-io/strale-frontend@sha:path` reference), and every
`relations:` target existing as a `record_key` among all files in
`docs/decisions/records/` at this commit. Then ran the operator checker,
`node scripts/m2-quote-fidelity.mjs --export <export> --frontend
C:/Users/pette/Projects/strale-frontend`, with one `--only` per file in my
partition. Cross-checked all 32 Notion page ids referenced anywhere in my
partition's prose (evidence URLs and inline "page `<id>`" citations) with
`dump_rows.py PAGE:<id> ...`, comparing every attributed quotation and every
"field X is null" claim against the parsed row. Verified all 12 collision
pairs and the `--git-` qualified record against `docs/decisions/id-collisions.yaml`
and `docs/project/m2-closure-register.yaml`. Spot-checked 11 "status
verified" code claims by reading the named file at this commit. Confirmed
the git-qualified record's commit is an ancestor of HEAD via `git
merge-base --is-ancestor`.

### Structural checks

Frontmatter parses cleanly on all 38 files; `record_key`/`id`/filename
agree in every case (qualified keys equal `<id>--notion-<page>` or
`<id>--git-<sha>`, bare keys equal their `id`). The CAUTION banner and all
five protected headings (Decision, Context, Rationale, Consequences,
Reversal conditions) are present in every file. No missing evidence path,
no missing relation target, across all 38 files.

### Operator checker results for my partition

```
DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md: 5/5 faithful, 0 residual
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md: 22/22 faithful, 0 residual
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md: 15/15 faithful, 0 residual
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md: 12/12 faithful, 0 residual
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md: 16/16 faithful, 0 residual
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md: 7/7 faithful, 0 residual
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md: 13/13 faithful, 0 residual
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md: 11/11 faithful, 0 residual
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md: 10/10 faithful, 0 residual
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md: 7/7 faithful, 0 residual
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md: 8/8 faithful, 0 residual
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md: 11/11 faithful, 0 residual
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md: 6/6 faithful, 0 residual
DEC-20260422-A--git-3b256587.md: 0 spans, 0 residual
DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md: 0 spans, 0 residual
DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md: 5/5 faithful, 0 residual
DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md: 4/4 faithful, 0 residual
DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md: 3/3 faithful, 0 residual
DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md: 3/3 faithful, 0 residual
DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9.md: 1/1 faithful, 0 residual
DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md: 4/4 faithful, 0 residual
DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76.md: 2/2 faithful, 0 residual
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md: 6/6 faithful, 0 residual
DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md: 3/3 faithful, 0 residual
DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md: 4/4 faithful, 0 residual
DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md: 4/4 faithful, 0 residual
DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md: 2/2 faithful, 0 residual
DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md: 4/4 faithful, 0 residual
DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md: 2/2 faithful, 0 residual
DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958.md: 3/3 faithful, 0 residual
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md: 5/5 faithful, 0 residual
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md: 5/5 faithful, 0 residual
DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md: 3/3 faithful, 0 residual
DEC-20260905-B.md: 36/36 faithful, 0 residual
DEC-20260905-C.md: 134 spans, 52 faithful, 82 residual
DEC-20260905-D.md: 54 spans, 53 faithful, 1 residual
DEC-20260905-E.md: 20/20 faithful, 0 residual
DEC-20260905-F.md: 12 spans, 7 faithful, 5 residual

Totals: 38 records, 462 spans, 374 faithful, 88 residual
```

All 33 dated candidate records (including the git-qualified record and
every collision pair) score 0 residual. Every residual in this partition
falls inside the amending records themselves.

#### Residual classification

All 88 residuals land in `DEC-20260905-C.md` (82), `DEC-20260905-D.md` (1)
and `DEC-20260905-F.md` (5). I read each one. Every single residual is a
mid-sentence extraction-boundary artifact: the checker's span extractor
lands its boundary inside the recurring connective-prose shape these
records use ("`<quote>` ... Fact: ... reads `<quote>`"), not on a real
quotation's own boundary — for example the extractor grabs the fragment
`" to `CLAUDE.md`. Fact: `CLAUDE.md`'s\n DEC-20260812-A entry reads only "`
as if it were itself a quoted span. This is exactly the class `DEC-20260905-C`,
`-D` and `-F`'s own reconciliation sections describe and quantify (82
self-referential artifacts in `-C.md`, carried unchanged into `-D.md` and
`-F.md` since that text does not change between rounds, plus 1 genuine
self-quotation residual inside `-D.md` and 5 inside `-F.md` of the same
kind — none of the five in `-F.md` is a new defect; they are the same
extraction-boundary artifact recurring in `-F.md`'s own "Not adopted" and
reconciliation prose, which itself quotes phrases from `-B.md` through
`-E.md`). None of the 88 residuals is a real quotation defect. Classifying
by assertion is exactly what round 3's own rationale warns against, so I
spot-read a representative sample of roughly 15 of the 82 `-C.md` residuals
directly (not just the two records' own claim about the class) and
confirmed each is the boundary artifact described, not a hidden fabricated
quote.

### Cross-checks against Notion, code, and the registries

Dumped all 32 distinct Notion page ids referenced anywhere in my
partition's prose via `dump_rows.py`; 42 rows resolved for those ids that
are Decision-database rows (four ids referenced only as plain evidence URLs
— mirror/reference pages, not attributed-quotation sources — were not
Decision-database rows and did not need row-level verification). Verified,
against the parsed rows, a sample of roughly 20 attributed quotations
across the highest-density records (`DEC-20260420-I` ×2, `DEC-20260420-J`,
`DEC-20260420-K` ×2, `DEC-20260421-A/B/C/D` collision pairs) plus every
null-field claim I could find attributed to a Notion field in my partition
(e.g. `DEC-20260420-K--...e3a62bf051cc0575c4`'s claim that the superseded
`DEC-20260420-J` twin's Superseded By/Outcome content is fully captured;
`DEC-20260505-E--...813481a8efa27ea37438`'s claim that its own row's
Outcome field is null, confirmed: `"Outcome": null` in the parsed row) —
all matched. `DEC-20260905-B` item 7's correction ("seven `HMRC_*` rows",
not eight) was independently re-derived: `grep -n "^- name: HMRC"
config/env-manifest.yaml` returns exactly seven rows, confirming the
correction is itself accurate, not merely asserted.

Verified all 12 collision pairs (24 files) plus the git-qualified record in
my partition against `docs/decisions/id-collisions.yaml` and
`docs/project/m2-closure-register.yaml` with a script: every qualified
record's collision entry names its page id with `disposition: formal_record`
and the identical `record_key`, and the register row for that page id
carries `disposition: formally_migrated` with the same key. Zero mismatches
across all 32 qualified records in my partition.

For `DEC-20260422-A--git-3b256587`: the register's `DEC-20260422-A` row
(a different, cross-surface Notion page id) carries `disposition:
resolved_collision`, `kind: cross-surface`, and its `rationale` names this
exact git-qualified record by key — consistent with the record's own
Context section. `git merge-base --is-ancestor 3b25658736bfed53eec52c8acf2619dacd54d1f5 HEAD`
confirms the commit is an ancestor of HEAD; `git log --oneline -1` on that
sha shows the matching commit message ("chore(dist): containment +
guardrails for hollow framework packages").

### Ten-plus code-claim spot checks (file : line)

1. `manifests/estonian-company-data.yaml:22-25` — `registry_code`/`company_name`
   fields present as `DEC-20260420-I--...904de` describes.
2. `manifests/*.yaml` `data_source_type` distribution — `api` 224+1,
   `computed` 81, `scrape` 32, `reference` 3, `ai_assisted` 1 — matches
   `DEC-20260420-I--...c8b9d4c6b5568bbcef` and `DEC-20260421-C--...bd8c6bf8e92e901711`'s
   Consequences sections exactly.
3. `apps/api/src/lib/capability-persistence.ts:303` — "OUTSIDE the
   transaction. Design doc §4.3" — matches `DEC-20260421-B`'s Consequences.
4. `manifests/italian-company-data.yaml:70`, `manifests/portuguese-company-data.yaml:57`
   — "Openapi.com IT-Advanced" / "Openapi.com PT-Advanced" — matches
   `DEC-20260507-C--...58c707d895`'s and `DEC-20260505-D--...81059f67e756f5c5eefa`'s
   Consequences.
5. `manifests/dutch-company-data.yaml:55` — "Openapi.com WW-Top" — matches
   `DEC-20260508-C--...817eb9b5d491786dc67b` and `DEC-20260512-A--...8122a29ef35f256d5958`.
6. `apps/api/src/jobs/test-scheduler.ts:368,388,398-399,471,491` —
   `cost_class` gating present as `DEC-20260512-A--...8188a014f4b1f963cf77` describes.
7. `apps/api/src/lib/trust-helpers.ts:367,386` — `"manifest_drift"` category
   and `guaranteed_field_missing:` branch present, with the code comment
   attributing the mechanism to "DEC-20260513-B + DEC-20260513-C" exactly as
   `DEC-20260513-F--...9b79cb7d0367dc46`'s Consequences describes (and
   correctly flags as a misattribution in the code comment itself, not in
   this record).
8. `apps/api/src/lib/platform-facts.ts:164,171` — `getActiveVendorNames()`/
   `getStaleVendorNames()` exported as `DEC-20260507-A--...81b0ad02d69148811b57` describes.
9. `manifests/spanish-company-data.yaml:118` — "OpenMercantil.es —
   BORME-derived register (Agencia Estatal BOE primary source), Tier-2
   vendor aggregation" — matches the contradiction several records
   (`DEC-20260505-D`, `DEC-20260507-C`, `DEC-20260508-C`) note against their
   own expectations.
10. `manifests/austrian-company-data.yaml:168` — "Firmenbuch (Republik
    Österreich, BMJ) via JustizOnline IWG/HVD API" — matches the same
    contradiction noted for Austria.
11. (bonus) `config/env-manifest.yaml:776-778` — `OPENAPI_COM_EMAIL`'s
    `cost_note` and `OPENAPI_ENABLED`'s `purpose` text match
    `DEC-20260507-C--...58c707d895`'s Consequences quotations verbatim.

All eleven matched the record text exactly.

### Findings

None. No false, fabricated, misattributed, or unverifiable statement found
in any of the 38 records in this partition, after the round-1-through-5
corrections recorded in `DEC-20260905-B` through `-F` are applied per rule
(a). Two corrections in `DEC-20260905-D` (items 9 and 10) target records in
my own partition (`DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711`
and `DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf`); I
re-verified both corrections directly against the underlying Notion rows
and found them accurate (the withdrawn phrases — "migrated to a direct API
or a licensed aggregator" dropping the row's "government-registry"/
"commercial" qualifiers, and "strip" for the row's "strips" — are exactly
as stated, confirmed at `DEC-20260421-C--...bd8c6bf8e92e901711.md:80` and
`DEC-20260421-D--...a2a12cc95010bf25bf.md:87`). `DEC-20260905-F`'s "Not
adopted" list also references a "P6" observation about
`DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895` (`relations: []`
in frontmatter while its Rationale narrates superseding IT/ES/PT/AT rows in
`DEC-20260427-I`) — I confirm this record does read exactly that way
(empty `relations:` array, Rationale states the supersession in prose) and
agree with the prior round's classification: an omission, not a false or
unverifiable claim, so not a finding under this round's rule.

### Unverifiable

Nothing in my partition. Every claim I set out to check resolved one way
or the other (evidence existed and matched, or a `DEC-20260905-*` record
already resolved it as a documented correction). Production/database-state
claims that the records themselves flag as unresolved (InfoCamere and HMRC
vendor-response outcomes, whether specific staging drills have run, which
CrimiMail/Datavisie legislative status holds) are correctly presented by
the records as open questions rather than asserted facts, so they are not
findings and not separately "unverifiable" claims on my part — the records
already carry that uncertainty honestly.

PARTITION VERDICT: PASS

## Gate run

```
M2 closing review round 6 gate run at ff8a1384694532d037c5fc0b27588ee93daf63ae, 2026-09-05T20:30:10Z
HEAD=ff8a1384694532d037c5fc0b27588ee93daf63ae
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (339.4526ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (90.295ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (6.4217ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (46.9114ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 685303.4816
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (2824.7046ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (1994.7245ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (1232.2705ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (4249.2337ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 639288.6696
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
checked 24 archive/receipts/*.json files
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
check-no-committed-secrets: clean (2976 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still ff8a1384694532d037c5fc0b27588ee93daf63ae
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Outcome

Round 6 found confirmed defects in partitions P2 and P5, and no confirmed
defects in P1, P3, P4, or P6. The confirmed findings are: (1)
`DEC-20260314-C`'s Consequences section falsely claims a search of
`docs/`, `apps/api/src/`, `apps/api/scripts/`, and `scripts/` for its own
named search terms "found no match," when the record's own file and the
generated index both match; (2) `DEC-20260315-A.md:62` misattributes the
quoted phrase "free capabilities via MCP without auth" to its own Notion
row, when that phrase belongs to `DEC-20260314-F`'s row instead; (3)
`DEC-20260315-B`'s Consequences section states `DEC-20260330-B` "predates
that decision by 16 days," when the two records' own `decided_at` dates
are 15 days apart; (4) `DEC-20260404-A`'s Consequences section falsely
claims a repository-wide search for `TDQS` "finds only" one named file,
when at least one genuinely independent, unrelated file also matches; and
(5) `DEC-20260420-H--notion-...c6a58dfbc5f46ed3f6.md` (lines 105-106)
falsely states that `DEC-20260420-I` is "itself an unresolved collision id
in a later G2 batch," when `docs/decisions/id-collisions.yaml` records it
`resolution_status: resolved` with two existing formal records. Every gate
ran clean at this commit (exit 0 each; `npm run context:check`, `npm run
context:test`, `node --test scripts/decision-records.test.mjs
scripts/m2-closure-register.test.mjs`, `node
scripts/m2-closure-verify-private-rows.mjs`, `npm run programs:check`,
`npm run codex:check`, `npm run receipts:check` (warn-only findings noted
in the gate output, exit 0), `node apps/api/scripts/check-pii.mjs
--strict`, `node apps/api/scripts/check-no-committed-secrets.mjs`); the
run is valid. The
operator checker's full run at this commit (236 records, 1128 spans, 1029
faithful, 99 residual) reconciles entirely as checker misses, each
faithful to a located and quoted source; none is a new withdrawal target
(`scratchpad/residual-reconciliation-round6.md`, not committed). A
corpus-wide sweep for stale statements about sibling records' or
collisions' state (beyond what any single partition sampled) found one
further false statement not caught by any partition: `DEC-20260430-A`
(lines 82-83) states `DEC-20260420-K` "whose display ID is an unresolved
collision" and `DEC-20260422-H` is "unique but unmigrated," both false at
this commit (`DEC-20260420-K` is `resolution_status: resolved` with two
formal records; `DEC-20260422-H.md` exists as a migrated formal record). A
parallel sweep for stale search-result claims found no defect beyond
findings (1) and (4) above. All five confirmed findings, the sibling-state
sweep finding, and the checker reconciliation are corrected by
`DEC-20260905-G` (`docs/decisions/records/DEC-20260905-G.md`), which
withdraws each false statement without editing the record it corrects.
The final closing round runs at the commit that merges this file and
`DEC-20260905-G` into `main`, and treats a statement withdrawn here, in
`DEC-20260905-B` through `-F`, or in `DEC-20260905-G`, as corrected, and a
relation substantiated in any of those records as substantiated.

VERDICT: FAIL
