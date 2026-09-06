---
doc_type: m2-closing-review-round
round: 11
commit: ef16b2c68b59a679eabd37d95d30e642982ab38d
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
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Method

Round 11 of the M2 closing independent review, run at commit
`ef16b2c68b59a679eabd37d95d30e642982ab38d` (`DEC-20260905-L`'s merge
commit). Six fresh, read-only reviewers, none the author of any reviewed
content, applied the quotation convention `DEC-20260905-C` through `-L`
state (normalize quotation and source before comparing: transliterate
symbols, lowercase, strip non-alphanumerics; an ellipsis splits a
quotation into ordered segments; a relation substantiated by an amending
record, or narrated in the target record's own body rather than the
source record's, is substantiated, not a defect; a figure stated as of a
date is a dated observation, not a defect, when unrelated work later
moves it; a quotation of a published statute or regulation verifiable
against that public instrument is Not adopted rather than withdrawn as
unverifiable), ran the operator checker, `scripts/m2-quote-fidelity.mjs`,
against the parsed Notion export and the sibling `strale-frontend`
checkout, at `--min-chars 12`, alongside each partition's own read of
every quotation, evidence path, relation, and at least ten "status on"
code claims against the reviewed commit. Each partition set up (or, where
the session was already isolated in its own worktree at the pinned
commit, worked in place read-only) at
`ef16b2c68b59a679eabd37d95d30e642982ab38d`; nothing was edited or
committed in any reviewer's worktree.

Five partitions passed clean: P1, P2, P3, P5, and P6. Partition P4 found
two defects, both double-quoted spans that no source contains. All nine
gates ran clean.

## Partition reports

### Partition P1

# Closing review round 11 — Partition P1

Partition: P1. Commit: `ef16b2c68b59a679eabd37d95d30e642982ab38d`. Record count: 40
(list: `closing11-P1.txt`, the founding 2026-02-24 records through
DEC-20260309-H).

### Method

Checked out `ef16b2c68b59a679eabd37d95d30e642982ab38d` (detached) in this
agent's own isolated worktree (`.claude/worktrees/agent-a6c86e2305e9dcb2d`).
`npm ci` did not finish inside the available time (still running node
processes with no completed output after several minutes); rather than
block on it, I substituted a self-written Python quote-fidelity checker
(`quote_check_p1.py`) that applies the exact same normalization convention
as `scripts/m2-quote-fidelity.mjs` (transliterate the listed symbols,
lowercase, strip non-alphanumerics, then substring/segment match) against
the Notion rows dumped via `dump_rows.py`. I could not run the operator
script itself; this is reported as a limitation, not concealed.

For every one of the 40 records I: (1) parsed frontmatter with a script
and checked `record_key`/`id`/filename agreement; (2) checked for the
CAUTION banner and all five protected sections; (3) checked every
non-URL evidence path exists at this commit (cross-repo entries resolved
against `strale-frontend` via `git show <sha>:<path>` after `git fetch
origin` there); (4) checked every `relations` target exists as a record
file at this commit and is not a bare collided id per
`docs/decisions/id-collisions.yaml`; (5) read every record's full body
myself and cross-checked every Notion-attributed quotation against rows
dumped via `dump_rows.py` for all 40 pages; (6) spot-checked code/file
claims directly in the repo (more than the required ten, listed below).

### Structural / frontmatter script results

`structural_check_p1.py` ran over all 40 files: zero findings. Every
record's frontmatter parses, `record_key`/`id`/filename agree (none in
this partition are `--notion-`/`--git-` qualified), all required
frontmatter fields present, the CAUTION banner and all five protected
sections (Decision, Context, Rationale, Consequences, Reversal
conditions) present in every file, every non-URL, non-cross-repo evidence
path exists on disk, and every `relations.target` resolves to an existing
record key in `docs/decisions/records/`.

### Quote-fidelity check (custom script + manual read)

`quote_check_p1.py` extracted every double-quoted span >=25 chars from
each of the 40 files and tested it against the corresponding Notion row's
`Decision`/`Rationale` fields (dumped for all 40 pages into
`closing11-P1-export.json`). The regex-based extraction is noisy on
spans that cross unrelated quote marks inside prose (backtick code
quoting, nested scare-quotes) and produced many long garbage "quotes"
that are not actually attributed Notion quotations at all (e.g. arbitrary
prose fragments between an opening `"` used for a document title and a
later `"` used for something unrelated). I did not treat any of those as
findings by themselves; instead I manually read every record and located
every span the record itself frames as an attributed quotation (i.e. "as
the row's own Rationale (quoted)", "the row's own Outcome field states",
etc.) and verified each one directly against the dumped row:

- `DEC-20260224-P-e5f6` Rationale (full "Honest assessment... we prompt
  Claude for you" quote) — faithful, verbatim.
- `DEC-20260224-P-g7h8` Rationale (seven-point naming argument) —
  faithful, verbatim.
- `DEC-20260225-P-q3r4` Rationale (five-part crypto design) — faithful,
  verbatim.
- `DEC-20260225-P-s5t6` Rationale (Gemini fee analysis) — faithful,
  verbatim.
- `DEC-20260225-P-m5n6` Decision ("that shoe company in Stockholm founded
  by Bjorn") — faithful, verbatim against the row's `Decision` field.
- `DEC-20260305-E` Outcome ("Shipped. 47 capabilities upgraded via
  re-export...") — faithful, verbatim.
- `DEC-20260305-F` Outcome ("72/98 -> 94/98 passing (96%)...") —
  faithful, verbatim.
- `DEC-20260305-G` Rationale/Outcome (four-rule trust-display fixes) —
  faithful, verbatim.
- `DEC-20260224-P-a1b2` / `DEC-20260224-P-e5f6` GOALS.md mission quote —
  faithful against `docs/company/GOALS.md:7-9`.
- `DEC-20260224-P-c3d4` "7 verticals (...)" quote against `CLAUDE.md:321`
  — faithful.
- `DEC-20260224-P-g7h8` `coinbase-bazaar-email.md` quotes ("We run
  Strale (api.strale.io)", "petter@strale.io") — faithful against
  lines 83/128.
- `DEC-20260302-A-0001` `DEC-20260411-A` title quote and
  `docs/company/CHARTER.md` band quotes ("pricing experiments within the
  existing EUR 0.02 to EUR 1.00 band", "pricing outside the existing
  band") — faithful against `CHARTER.md:40` and `:48`.

No misquotation found in any of these. Several spans elsewhere in this
partition's records are **already corrected** by prior-round amending
records and are not re-raised here, per this round's rule (a):

- `DEC-20260224-P-g7h8`'s "tens/hundreds of thousands of data sources...
  per project memory" line — withdrawn by `DEC-20260905-C` (and the
  correction itself re-confirmed sound by `DEC-20260905-L`, which found
  `DEC-20260905-C`'s *own* CLAUDE.md characterization needed a further
  fix, not this original line).
- `DEC-20260225-P-k3l4`'s fabricated `"wedge, not niche"` quotation —
  withdrawn by `DEC-20260905-I` item 1.
- `DEC-20260226-P-s3t4`'s fabricated `"build it now, cheaply"` quotation
  and its misattributed "Date-based API versioning..." CLAUDE.md line
  (the phrase is only in the user's external `MEMORY.md`, confirmed by
  `grep -n "Date-based API versioning" CLAUDE.md` returning nothing) —
  withdrawn by `DEC-20260905-I` item 2 and `DEC-20260905-D` item 3
  respectively.
- `DEC-20260225-P-m1n2`'s misquoted "first vertical: market research and
  competitive intelligence" and its false "Source field is null, unlike
  most rows" claim — withdrawn by `DEC-20260905-D` items 1-2 (I
  independently confirmed all 13 `DEC-20260225-P-*` rows in this batch
  have a null `Source` field in the dumped export, matching the
  correction).
- `DEC-20260227-P-i9j0`'s fabricated `"the capability's own provider runs
  the code."` quotation — withdrawn by `DEC-20260905-D` item 4.
- `DEC-20260227-P-s9t0`'s two fabricated Unit-3 quotations — withdrawn by
  `DEC-20260905-D` items 5-6.

I checked each of these corrections against the same dumped rows and
repo files myself; all six hold up (I re-verified the `m1n2`/13-row null
Source check and the CLAUDE.md grep independently; the rest match the
Rationale/Decision text I already had dumped). None of the corrections
is itself wrong, so none is a new finding against the amending records
either.

`DEC-20260309-G`'s "returns no matches outside this record" claim (about
a repository-wide grep for the 12-category risk framework) is also
already withdrawn, by `DEC-20260905-C` item 17 — I independently
re-ran the grep and found the same extra match in
`docs/programs/codex-review-backlog.yaml` (a meta-reference to this same
record, not an implemented mechanism) that the correction cites, plus a
match in `docs/project/DECISIONS.md` that is only the generated table
restating this same record's own title. The correction's underlying
conclusion holds.

### Checker residuals

I was not able to run `scripts/m2-quote-fidelity.mjs` itself (no
`node_modules`/`npm ci` completion in the available window). No residual
list from that script is available for this partition; the quote-fidelity
verification above was done by direct row/file comparison instead, which
is the same operation the script automates. I do not treat the missing
script run as a pass or a fail by itself, only as an unavailable
cross-check; the manual/scripted equivalent above covers every span this
round's rules make a finding.

### Ten "status on" code-claim spot checks (of ~18 total performed)

1. `apps/api/src/db/schema.ts:355-359` — `auditTrail`/`transparencyMarker`/
   `dataJurisdiction` columns exist, matching `DEC-20260226-P-s3t4`.
2. `apps/api/src/routes/do.ts:1566-1567` — writes
   `transparencyMarker`/`dataJurisdiction` at the sync execution path,
   matching the same record.
3. `apps/api/src/lib/versioning.ts:4,14,20` — reads and writes the
   `Strale-Version` header, matching the same record.
4. `apps/api/src/capabilities/lib/browserless-extract.ts:9` — header
   comment confirms the re-export-from-`web-provider.ts` architecture,
   matching `DEC-20260305-E`.
5. `grep -rl "browserless-extract" apps/api/src/capabilities` (excluding
   tests and the two library files) returns exactly 35, matching
   `DEC-20260305-E`'s "today's importer count is 35" claim exactly.
6. `apps/api/src/db/schema.ts:964,966` — the `capability_health (circuit
   breaker)` comment and table definition are at exactly the line
   numbers `DEC-20260306-G` cites.
7. `apps/api/src/routes/public-trust.ts:34` — `PUBLIC_TRUST_FIELDS`
   exists; a repo-wide grep for `TrustBarChart`/`calculatePassRate` in
   `apps/api/src` returns nothing, matching `DEC-20260305-G`'s "not
   present... under those names" claim.
8. `manifests/swedish-company-data.yaml:15-16` — `required: [org_number]`
   only, and a grep of the executor for fuzzy/Anthropic/`models.ts`
   returns nothing, matching `DEC-20260225-P-m5n6`.
9. `packages/langchain/src/index.ts:16` and `package.json:2` —
   `export class StraleFallbackTool` exists, package name is
   `straleio-langchain`, matching `DEC-20260225-P-e7f8`.
10. `packages/sdk-typescript/package.json:2-3` — name `straleio`, version
    `0.1.3`, matching `DEC-20260226-P-q1r2`'s "three patch releases past
    0.1.0" claim.
11. `apps/api/src/capabilities/auto-register.ts:411,421` — dynamic
    `import(\`./${slug}.js\`)` self-registration mechanism, matching
    `DEC-20260227-P-i9j0`.
12. `CLAUDE.md:299` and `ls docs/decisions/records/ | grep DEC-20260307`
    (no match) plus `docs/decisions/records/DEC-20260308-1.md:4`
    (title "Platform pricing currency: EUR (not USD)") — confirms
    `DEC-20260306-G`'s finding that no `DEC-20260307` record exists and
    `DEC-20260308-1` is an unrelated record.
13. `apps/api/src/routes` grepped for `quality/:slug`/`v1/quality` —
    no match, matching `DEC-20260306-G`.
14. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` — component
    order at lines 217/221/225/229/234/276 matches `DEC-20260302-C`'s
    ordering claim exactly, including `StatsStrip` at line 276.
15. `apps/api/src/capabilities/flight-status.ts:71` — `"TAP Portugal"`
    airline-code string, matching `DEC-20260227-P-s9t0`'s "unrelated
    strings" caveat on its Visa-TAP grep.

Also verified: `apps/api/src/lib/dependency-manifest.ts:93` (`skipAuth:
true`) for `DEC-20260302-D`; `docs/company/CHARTER.md:40,48` for the two
pricing-band quotes in `DEC-20260302-A-0001`; `ls manifests/*.yaml | wc
-l` returns 350 at this commit versus the 342/dated-2026-09-05 figures
several records cite — every one of those records frames the count as
"dated 2026-09-05, this batch's session," which this round's rule (e)
explicitly exempts from being a finding (a figure presented as a dated
observation, not as current at `REVIEW_COMMIT`).

### Findings

None. No false, fabricated, misattributed, or unverifiable statement
found in this partition beyond what prior rounds already corrected (and
those corrections themselves check out).

### Unverifiable

- The exact historical manifest count "at this row's own date" (e.g. 342
  on 2026-09-05, 35/47/13 counts in the February/March rows) cannot be
  independently re-derived without checking out each historical commit,
  which this round's rules treat as unnecessary for a figure presented
  as a dated observation; I did not attempt it.
- `scripts/m2-quote-fidelity.mjs` itself did not run (npm ci did not
  finish in the available window); see Method above for the substitute
  I used and why I judge the substitute sufficient for this partition's
  quote-fidelity claims.

### Orchestrator addendum: operator checker run for this partition

The partition reviewer could not run `scripts/m2-quote-fidelity.mjs` (its `npm ci` did not finish). The orchestrator ran it from the trunk checkout at 7607d959, whose `docs/decisions/records/` tree is byte-identical to the pinned commit ef16b2c68b59a679eabd37d95d30e642982ab38d (`git diff --stat ef16b2c6 7607d959 -- docs/decisions/records/` is empty), with `--min-chars 12` and one `--only` per file in `closing11-P1.txt`. Output verbatim:

```
docs/decisions/records/DEC-20260224-P-a1b2.md: 9 spans checked, 9 faithful, 0 residual
docs/decisions/records/DEC-20260224-P-c3d4.md: 6 spans checked, 6 faithful, 0 residual
docs/decisions/records/DEC-20260224-P-e5f6.md: 7 spans checked, 7 faithful, 0 residual
docs/decisions/records/DEC-20260224-P-g7h8.md: 5 spans checked, 5 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-a3b4.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-e7f8.md: 3 spans checked, 3 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-g9h0.md: 7 spans checked, 7 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-i1j2.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-k3l4.md: 8 spans checked, 8 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-m1n2.md: 11 spans checked, 10 faithful, 1 residual
  line 109: "not CI reports"
    best match: record:docs/decisions/records/DEC-20260314-G.md (prefix 5)
docs/decisions/records/DEC-20260225-P-m5n6.md: 7 spans checked, 7 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-o7p8.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-q3r4.md: 5 spans checked, 5 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-s5t6.md: 9 spans checked, 9 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-u7v8.md: 3 spans checked, 3 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-w9x0.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260225-P-y1z2.md: 17 spans checked, 17 faithful, 0 residual
docs/decisions/records/DEC-20260226-P-q1r2.md: 2 spans checked, 2 faithful, 0 residual
docs/decisions/records/DEC-20260226-P-s3t4.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260226-P-u5v6.md: 2 spans checked, 2 faithful, 0 residual
docs/decisions/records/DEC-20260226-P-w7x8.md: 1 spans checked, 1 faithful, 0 residual
docs/decisions/records/DEC-20260227-P-a1b2.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260227-P-i9j0.md: 3 spans checked, 3 faithful, 0 residual
docs/decisions/records/DEC-20260227-P-m3n4.md: 7 spans checked, 7 faithful, 0 residual
docs/decisions/records/DEC-20260227-P-o5p6.md: 6 spans checked, 6 faithful, 0 residual
docs/decisions/records/DEC-20260227-P-q7r8.md: 7 spans checked, 7 faithful, 0 residual
docs/decisions/records/DEC-20260227-P-s9t0.md: 5 spans checked, 4 faithful, 1 residual
  line 82: "visa/work permit"
    best match: notion:DEC-20260227-P-s9t0 (prefix 4)
docs/decisions/records/DEC-20260227-P-u1v2.md: 8 spans checked, 8 faithful, 0 residual
docs/decisions/records/DEC-20260302-A-0001.md: 3 spans checked, 3 faithful, 0 residual
docs/decisions/records/DEC-20260302-C.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260302-D.md: 3 spans checked, 3 faithful, 0 residual
docs/decisions/records/DEC-20260303-C.md: 9 spans checked, 9 faithful, 0 residual
docs/decisions/records/DEC-20260305-E.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260305-F.md: 3 spans checked, 3 faithful, 0 residual
docs/decisions/records/DEC-20260305-G.md: 4 spans checked, 4 faithful, 0 residual
docs/decisions/records/DEC-20260306-D.md: 6 spans checked, 6 faithful, 0 residual
docs/decisions/records/DEC-20260306-G.md: 7 spans checked, 7 faithful, 0 residual
docs/decisions/records/DEC-20260306-H.md: 9 spans checked, 9 faithful, 0 residual
docs/decisions/records/DEC-20260308-1.md: 2 spans checked, 2 faithful, 0 residual
docs/decisions/records/DEC-20260309-G.md: 11 spans checked, 11 faithful, 0 residual
docs/decisions/records/DEC-20260309-H.md: 3 spans checked, 3 faithful, 0 residual

Totals: 41 records, 230 spans, 228 faithful, 2 residual
```

Both residuals are the checker misses classified in round 10 (archive `2026-09-05-m2-closing-review-round-10.md`, partition P1): `DEC-20260225-P-m1n2.md` line 109 "not CI reports" is the record's own shorthand for the clause "Don't build: CI reports, PDF engines, domain-specific pipelines" that it quotes faithfully from its row earlier; `DEC-20260227-P-s9t0.md` line 82 "visa/work permit" describes `apps/api/src/capabilities/work-permit-requirements.ts` and is not attributed to the Notion row. Neither is a defect. No residual is unclassified.

PARTITION VERDICT: PASS


### Partition P2

# Closing-review partition report — P2, round 11 (final round)

Partition: P2. Commit: `ef16b2c68b59a679eabd37d95d30e642982ab38d`. Record count: 41
(the list file names 41 lines/files, all present at this commit).

Files reviewed (`docs/decisions/records/`): DEC-20260310-E, DEC-20260310-F,
DEC-20260313-C, DEC-20260313-E, DEC-20260313-F, DEC-20260314-A, DEC-20260314-B,
DEC-20260314-C, DEC-20260314-F, DEC-20260314-G, DEC-20260315-A, DEC-20260315-B,
DEC-20260315-H, DEC-20260315-I, DEC-20260316-A, DEC-20260316-B, DEC-20260317-A,
DEC-20260317-F, DEC-20260317-G, DEC-20260317-H, DEC-20260318-A, DEC-20260318-B,
DEC-20260320-A, DEC-20260320-B, DEC-20260320-E, DEC-20260320-F, DEC-20260321-A,
DEC-20260323-A, DEC-20260324-A, DEC-20260324-C, DEC-20260329-A, DEC-20260330-B,
DEC-20260404-A, DEC-20260405-A, DEC-20260406-E, DEC-20260409-A, DEC-20260409-B,
DEC-20260409-D, DEC-20260410-A, DEC-20260411-A, DEC-20260411-B.

### Setup

`git worktree add --detach C:/tmp/strale-closing11-P2 ef16b2c6...` from this
agent's own isolated worktree; `npm ci` there completed (exit 0, warnings
only — audit advisories and install-script notices, no failures). No edits
or commits made in the review worktree.

### Method

1. For every record: parsed frontmatter, checked `record_key`/`id`/filename
   agreement, confirmed the CAUTION banner and the five protected sections
   (Decision, Context, Rationale, Consequences, Reversal conditions) are
   present (all 41: match, banner present, 5/5 sections present).
2. Dumped every record's Notion row via `dump_rows.py` keyed on the page id
   in `evidence[0]`. One page (`DEC-20260320-B`, id
   `32967c87082c81b7a8ccd169b431f99c`) was dropped by a batched dump_rows.py
   call whose regex-based JSON-block scan skipped it in that combined run
   for an unclear reason (a solo re-run of the same script for that one page
   id succeeded immediately, no parse error); merged that single result
   into the row set so all 41 rows were available.
3. Wrote a normalization script (the convention: transliterate €→EUR,
   ×→x, ≥→>=, ≤→<=, →→->, …→..., lowercase, strip non-alphanumerics,
   substring-test with ellipsis-segment splitting) and ran it two ways:
   first a naive "every double-quoted span ≥25 chars" extractor (very
   noisy — markdown/code-span punctuation produces many false "spans" that
   aren't real attributed quotations), then manual, source-by-source
   verification of every quotation that read as a genuine attributed
   claim (a full clause, ending in real punctuation, following an
   attribution phrase like "CLAUDE.md states," "the row's Rationale
   reads," "its own header comment reads").
4. Ran the operator checker: `node scripts/m2-quote-fidelity.mjs --export
   <scratchpad>/decisions-export-raw.txt --frontend
   C:/Users/pette/Projects/strale-frontend --min-chars 12` with one
   `--only <file>` per record in this partition. Result: **41 records, 223
   spans, 219 faithful, 4 residual.**
5. Verified every `evidence` path (local file exists at this commit; the
   two cross-repo `strale-frontend@04c9fca9:...` families resolve via
   `git show` in the sibling checkout after `git fetch origin`; the two
   `github.com/strale-io/strale/commit/<sha>` entries exist and are
   ancestors of HEAD via `git cat-file -e` + `git merge-base
   --is-ancestor`).
6. Checked every `relations` target exists as a record key and is
   substantiated; checked no target is a bare collided id
   (`docs/decisions/id-collisions.yaml`).
7. Spot-checked 13 "status on" code claims by reading the named files
   directly (see below), exceeding the required 10.
8. Cross-referenced every apparent defect against the round 1-10 /
   exhaustive-sweep withdrawal records `DEC-20260905-B` through `-L`,
   per this round's rule (a): a withdrawn statement is corrected, not a
   finding against the original record, unless the correction itself is
   wrong.

### Operator-checker residuals (4) — classification

All four are checker misses, not real defects: in each case the quoted
span is a literal grep/search-pattern string the record itself
constructed to describe its own search methodology (or a coined label in
quotes), not a quotation attributed to a source.

1. `DEC-20260314-F.md:82` — `"completion_rate\|autonomous"`: a `grep -rn`
   pattern the record ran, quoted verbatim as the command it typed, not a
   claim about what any source says. Checker miss.
2. `DEC-20260314-F.md:84` — `"completion_rate\|autonomous_completion\|autonomousCompletion"`:
   same, a second grep pattern in the same sentence. Checker miss.
3. `DEC-20260317-F.md:51` — `"automated >= 50 gate"`: the record's own
   coined shorthand for a concept it says no source names by that exact
   phrase ("The row's own text does not name a specific Decision ID for
   the 'automated >= 50 qualification gate' it refers to..."); not
   presented as a literal quotation from the Notion row, CLAUDE.md, or any
   evidence file. Checker miss.
4. `DEC-20260321-A.md:67` — `"schedule_tier\|scheduleTier\|ORDER BY"`: a
   `grep -n` pattern the record ran, quoted verbatim as the command.
   Checker miss.

### Findings

None. Every defect this partition's records contain that I could locate —
several genuine ones exist, all already known from earlier rounds — has
already been withdrawn by name in `DEC-20260905-C`, `-D`, `-E`, `-G`, `-I`,
`-J`, or `-L`, and I independently re-verified each correction against the
primary source (CLAUDE.md, the Notion row dump, the named repo file, or
`git show` on the frontend sibling) rather than trusting the withdrawal
record's own prose. Per this round's rule (a), a corrected statement is not
a finding against the original record unless the correction is itself
wrong; none of the corrections I checked were wrong. Specifically, for
records in this partition:

- `DEC-20260315-H` and `DEC-20260317-F` each misattribute "armed in prod"
  / "armed in prod, not dry-run" to `CLAUDE.md`. Confirmed independently:
  `grep -n "armed in prod" CLAUDE.md` → no match; `CLAUDE.md`'s
  `DEC-20260812-A` bullet reads only "quality floor quarantine <70% /
  deactivate <30% on ≥10 real calls/30d, auto-promote on recovery." The
  phrase is real but lives in `apps/api/src/routes/do.ts` ("the quality
  floor is armed in production," three occurrences) and in project
  memory, not `CLAUDE.md`. Withdrawn by `DEC-20260905-C` items 21/25 and
  `DEC-20260905-J` items 10/14 — corrections match what I found.
- `DEC-20260310-F` fuses two non-adjacent CLAUDE.md sentences into one
  fabricated quotation. Withdrawn by `DEC-20260905-C` item 18 /
  `DEC-20260905-J` item 7 — confirmed against `CLAUDE.md`'s actual intro
  paragraph and bulleted pipeline list.
- `DEC-20260313-C` invents "still listed, signal absent rather than
  faked" as if it were the row's own words; the row's Decision/Rationale
  fields (verified against the dump) don't contain that phrase. Withdrawn
  by `DEC-20260905-C` item 19 / `DEC-20260905-J` item 8.
- `DEC-20260314-F` quotes "five free capabilities via MCP without auth"
  as its own row's framing; the row's Rationale (verified against the
  dump) writes the digit "5," and the exact phrase belongs to a sibling
  row (`DEC-20260315-A`'s row, cross-checked). Withdrawn by
  `DEC-20260905-C` item 20 / `DEC-20260905-J` item 9.
- `DEC-20260315-A` attributes "free capabilities via MCP without auth" to
  its own row; the phrase is actually on `DEC-20260314-F`'s row. Withdrawn
  by `DEC-20260905-G` item 2 — confirmed against both rows' dumps.
- `DEC-20260315-B` miscounts a 15-day interval as 16. Withdrawn by
  `DEC-20260905-G` item 3 — confirmed by direct date subtraction on the
  two records' own `decided_at` frontmatter (2026-03-15 to 2026-03-30 =
  15 days).
- `DEC-20260314-C` falsely claims a repo-wide search for "ChatGPT
  evaluation"/"multi-llm" finds no match; it finds the record's own file
  and the generated index. Withdrawn by `DEC-20260905-G` item 1 —
  confirmed via `grep -ril`.
- `DEC-20260316-A` inserts "the" before "worst of" and `DEC-20260316-B`
  drops "grade" from a `trust-grade.ts` quotation, and `DEC-20260316-A`
  substitutes "single" for "one." Withdrawn by `DEC-20260905-J` items
  6/11/12/13 — confirmed by reading `apps/api/src/lib/trust-grade.ts:211`
  directly ("Combined grade = worst of (SQS grade, freshness grade,
  latency grade)") and the row's own Rationale field.
- `DEC-20260318-A` misattributes "the workflow that scales to
  third-party providers" to its own row; that phrase belongs to
  `DEC-20260318-B`'s row instead (the negation, "doesn't scale," is on
  `DEC-20260318-A`'s actual row). Withdrawn by `DEC-20260905-C` item 26 /
  `DEC-20260905-J` item 15.
- `DEC-20260320-A` synthesizes "manual, 312-line `app.ts` import list" as
  one phrase from two separate sentences in the row's Rationale, and
  separately inserts a bracketed gloss `[reliability and limitations]`
  into a quotation from `capability-readiness.ts`'s header comment, and
  overstates a "one... no other" code-insert search result that a literal
  re-run finds ~25 additional (test-fixture) matches for. Withdrawn by
  `DEC-20260905-C` items 27/28, `DEC-20260905-J` item 16, and
  `DEC-20260905-L` item 2 — confirmed the bracket insertion by reading
  `apps/api/src/lib/capability-readiness.ts` lines 8-12 directly.
- `DEC-20260320-F` falsely claims "no formal record exists" for
  `DEC-20260320-E`, which exists in this same batch. Withdrawn by
  `DEC-20260905-E` item 1 — confirmed the file exists and cites
  `DEC-20260320-F.md` back.
- `DEC-20260320-E` misattributes a passage to the row's `cost_note` field
  when it is actually the `purpose` field. Withdrawn by `DEC-20260905-E`
  item 2 — confirmed against `config/env-manifest.yaml` lines 797-806.
- `DEC-20260323-A` invents "read-time decay eliminated, write-time decay
  in force" as a quotation attributed to the row; neither the Decision
  nor Rationale field contains it. Withdrawn by `DEC-20260905-C` item 30
  — confirmed against the row dump.
- `DEC-20260405-A` twice falsely claims "no formal record exists" /
  "no record exists, mentioned in prose only" for `DEC-20260405-B` and
  `DEC-20260225-P-m5n6`, both of which have formal record files in this
  repository. Withdrawn by `DEC-20260905-E` items 3/4 — confirmed both
  files exist.
- `DEC-20260409-D` falsely claims `DEC-20260409-C` has no record and is
  an unresolved collision; it is resolved with an existing formal record.
  Withdrawn by `DEC-20260905-E` item 5 — confirmed against
  `id-collisions.yaml` and the record file. Its two undeclared-in-body
  `related_to` targets (`DEC-20260409-A`, `DEC-20260409-B`) are
  substantiated by `DEC-20260905-D` item 7 and `DEC-20260905-E` item 6
  from the underlying Notion rows, per this round's rule (a) — not a
  finding.
- `DEC-20260330-B` drops the word "coding" from its own self-quotation
  ("be embedded in workflow" vs. the source's "be embedded in coding
  workflow"), and separately misreports `context7.json`'s actual rule 12
  as a stale `/v1/quality/:slug` reference when the live rule 12 already
  states the opposite (no single score, endpoint retired). Withdrawn by
  `DEC-20260905-I` item 3 and `DEC-20260905-J` item 17 — confirmed both
  directly: `grep` on the record file shows the dropped word, and reading
  `context7.json`'s `rules[11]` shows the corrected text already in
  place.
- `DEC-20260404-A` falsely claims a repo-wide `TDQS` search "finds only"
  one file; a literal search finds at least seven. Withdrawn by
  `DEC-20260905-G` item 4.

No other quotation, evidence path, relation, or null/non-null field claim
in this partition's 41 records was found false, fabricated, misattributed,
or unverifiable.

### Ten-plus code-claim spot checks

1. `computeTrustGrade` (DEC-20260316-A): `grep -rn "computeTrustGrade"
   apps/api/src --include=*.ts | grep -v trust-grade.ts` → zero matches.
   Confirms "no callers outside its own file."
2. `capability_health` table (DEC-20260323-A):
   `apps/api/src/db/schema.ts:966` — `pgTable("capability_health", ...)`.
   Confirms the table still exists, not yet renamed.
3. `source_health` (DEC-20260323-A): `grep -c "source_health"
   apps/api/src/db/schema.ts` → 0. Confirms the rename hasn't landed.
4. `legacy_score` (DEC-20260323-A): `grep -rc "legacy_score" apps/api/src`
   → 0 everywhere. Confirms the field doesn't exist under that name.
5. `seed.ts` (DEC-20260318-A / DEC-20260320-A): `find apps/api -iname
   "seed.ts"` → no result. Confirms deletion.
6. `sendInterruptEmail` (DEC-20260317-A): `grep -rn "sendInterruptEmail"
   apps/api/src --include=*.ts | grep -v interrupt-sender.ts` → zero
   matches. Confirms "built but never invoked."
7. `UNLOCK_MAP` (DEC-20260410-A): `apps/api/src/lib/progressive-unlock.ts:11`
   defines it, used at lines 39/88. Confirmed live.
8. `NULL_RATIO_RULE_ENABLED` (DEC-20260409-A): defined
   `apps/api/src/lib/test-runner.ts:1604`
   (`process.env.NULL_RATIO_RULE_ENABLED === "true"`); shadow-mode log
   `"null-ratio-shadow-would-fail"` at line 1727. Confirmed.
9. `gate4b-solution-dryrun.ts` Layer B header (DEC-20260409-D): line 2
   reads "Gate 4b — Solution Dry-Run Composition Check (DEC-20260409-D
   Layer B)". Confirmed verbatim.
10. `x402-gateway.ts` facilitator (DEC-20260324-A): line 21 imports
    `createFacilitatorConfig` from `@coinbase/x402`; `X402_FACILITATOR`
    mode switch present. Confirmed.
11. `checkReadiness` dimension count (DEC-20260320-A):
    `apps/api/src/lib/capability-readiness.ts` defines 8 boolean
    dimension fields (`has_executor` through `has_limitations`).
    Confirms the record's "8, not 6" correction.
12. `audit-onboarding.ts` (DEC-20260320-A): file exists at
    `apps/api/src/db/audit-onboarding.ts`. Confirmed.
13. `onboard.ts` flags (DEC-20260318-A/B): `--dry-run`, `--backfill`,
    `--strict`, `--fix`, `--discover`, `--batch`, `--force` all present
    in the argument parser. Confirmed.

Manifest prices also spot-checked directly: `sanctions-check.yaml`
`price_cents: 20`, `pep-check.yaml` `price_cents: 5`,
`adverse-media-check.yaml` `price_cents: 20`, `vat-validate.yaml`
`price_cents: 2` — all match the figures `DEC-20260320-F` and
`DEC-20260411-A` state.

### Evidence-path verification

Every local-file evidence entry across all 41 records (113 unique
non-URL/non-cross-repo entries after dedup) exists at this commit — no
missing paths. The two cross-repo `strale-frontend@04c9fca9` files
(`src/App.tsx`, `src/components/Header.tsx`, `src/index.css`,
`src/pages/Index.tsx`) all resolve via `git show 04c9fca9:<path>` in the
sibling checkout after `git fetch origin`. The two commit-SHA evidence
entries (`16ca790ef8dc...`, `cb787ed9b2fb...`) both exist
(`git cat-file -e`) and are ancestors of HEAD (`git merge-base
--is-ancestor`).

### Relations

Six records in this partition carry non-empty `relations`:
`DEC-20260314-A`↔`DEC-20260314-B` (mutual `related_to`, both narrated in
body prose with direct quotes), `DEC-20260405-A`→`DEC-20260320-B`
(narrated), `DEC-20260409-B`→`DEC-20260409-A` (narrated, quoted "RELATED:
DEC-20260409-A..."), `DEC-20260409-D`→`DEC-20260409-A` and
→`DEC-20260409-B` (not narrated in either record's own body, but
substantiated from the underlying Notion rows by `DEC-20260905-D` item 7
and `DEC-20260905-E` item 6 — per this round's rule (a), not a finding),
and `DEC-20260411-A`→`DEC-20260302-A-0001` (`amends`, narrated as
"Framework succession," target confirmed to exist with `status: active`).
No relation target is a bare collided id (checked against
`docs/decisions/id-collisions.yaml`); none of this partition's 41 own ids
appear in that file either.

### Null-field checks

Spot-checked every record whose Reversal conditions explicitly claims
"`Superseded By` and `Outcome` are both null" against the Notion dump
(13 such claims: DEC-20260310-E/F, 313-C/E, 314-A/B/C/F/G, 315-A/B/H/I,
317-A/F/G/H, 329-A, 406-E) — all confirmed both fields actually null.
Conversely, records that quote non-null `Outcome` content
(DEC-20260320-E, -F, DEC-20260321-A, DEC-20260404-A) were checked against
the dump and match verbatim. `DEC-20260320-B` (the one `status:
superseded` record in this partition) correctly has a populated
`Superseded By` (a Notion URL resolving to `DEC-20260423-B`, confirmed by
matching page ids) and a populated `Outcome`, and does not claim either
is null.

### Qualified-record checks (item 8 of the brief)

Not applicable: none of this partition's 41 filenames carry a
`--notion-` or `--git-` qualifier: all are bare `DEC-YYYYMMDD-X` keys.

### Unverifiable

Nothing in this partition. Every claim I attempted to check resolved to
either "confirmed accurate" or "confirmed a defect already withdrawn by
name in an earlier round's record, correction itself verified accurate."

PARTITION VERDICT: PASS


### Partition P3

# Closing review, round 11 (final round), partition P3

Commit reviewed: `ef16b2c68b59a679eabd37d95d30e642982ab38d`
Record count: 41 files (`docs/decisions/records/DEC-20260413-A.md` through `DEC-20260507-H.md`, listed one per line in `closing11-P3.txt`)

Setup: worked in this agent's own pre-isolated worktree (per the launching agent's override of the prompt's stock `git worktree add` instruction), `git fetch origin` then `git checkout --detach ef16b2c68b59a679eabd37d95d30e642982ab38d`, `npm ci`. Read-only throughout; `git status --short` is empty and `HEAD` is the pinned commit at time of writing this report. No file in the partition, or elsewhere in the repo, was edited.

### Method

For every record: parsed frontmatter and confirmed `record_key`/`id`/filename agreement and the CAUTION banner plus all five protected sections programmatically (a small Node script reading each file, normalizing CRLF, and checking the four items); read the full body of all 41 records directly and checked every attributed quotation against its named source (Notion row fields fetched via `dump_rows.py`, repository files at HEAD, or other records) under the stated normalization convention; ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend <strale-frontend checkout> --min-chars 12 --only <each file>` over the partition; checked every `evidence:` array entry for local-file existence (script) and confirmed relation targets exist as records; and spot-verified ten "status on" code claims by reading the named files/commits directly. I also cross-referenced every finding candidate against the eleven withdrawal/correction records `DEC-20260905-B` through `-L`, since several of my partition's records carry statements those records already corrected (per rule (a), a statement withdrawn there is corrected, not a fresh finding against the original record, unless the correction is itself wrong).

### Checker run

Command: `node scripts/m2-quote-fidelity.mjs --export scratchpad/decisions-export-raw.txt --frontend .../strale-frontend --min-chars 12 --only <each of the 41 files>`. Result: **41 records, 146 spans, 146 faithful, 0 residual.** No residual list to reconcile for this partition.

This 0-residual result is expected and not itself proof of no defects: as `DEC-20260905-H`'s Context notes, the checker accepts `CLAUDE.md` and `AGENTS.md` (and, more generally, any candidate source in the corpus) as a match for a span regardless of which specific field/file the record's prose names, so a wrong attribution to the wrong document, field, or record is invisible to it as long as the phrase occurs somewhere else in the accepted candidate set. All of the defects I found in this partition (see below) are exactly this class, and all were already caught by direct reading in earlier rounds and withdrawn by `DEC-20260905-B` through `-J`, not by the checker.

### Findings

**None outstanding.** Every misattributed, dropped-word, transposed, or fabricated quotation I located in this partition's 41 records was already withdrawn by an earlier round's amending record, correctly and verifiably so. Below is the reconciliation, file by file (only records carrying a since-corrected defect are listed; the other 30 records in the partition had no defect found):

1. **`DEC-20260419-A.md:465-466`** — "a new file added to the allowlist requires a justification comment," attributed in Consequences to the header comment of `apps/api/scripts/check-no-new-console.mjs`. Verified: the actual header comment (`apps/api/scripts/check-no-new-console.mjs:1-18`) contains no such sentence; the phrase is the record's own restated Decision-section text (line ~424-425), not the script's comment. **Withdrawn by `DEC-20260905-B` item 3.** Correction verified accurate.
2. **`DEC-20260420-A.md:104`** — `"we still hand-write; just in TS, not SQL files"` attributed to `DEC-20260511-C`. Verified: `DEC-20260511-C.md:39` actually reads "the project still hand-writes migration logic; just in TS, not SQL files" — subject/verb substituted, not merely re-punctuated. **Withdrawn by `DEC-20260905-C` item 33.** Correction verified accurate.
3. **`DEC-20260422-D.md:87-89`** — "No manifest schema field (`manifests/*.yaml`) carries `license_url` or `source_note`." Verified: `manifests/doi-resolve.yaml` carries a `license_url` field (lines 42, 108). **Withdrawn by `DEC-20260905-I` item 4.** Correction verified accurate (file exists, field present).
4. **`DEC-20260422-D.md:~83`** (Consequences) — "consistent with the Decision's own scope (\"capabilities sourcing from open-data APIs\")," dropping "data" from the record's own Decision-section wording ("Capabilities sourcing **data** from open-data APIs," line 36 of that file). **Withdrawn by `DEC-20260905-J` item 24.** Correction verified accurate.
5. **`DEC-20260425-A.md`** (Decision section, "sourced from a manifest-declared field per capability, replacing the current `getProcessingJurisdictions` heuristic...") attributed to the record's own Decision field. Verified against the row's Rationale field (fetched live via Notion, page `34967c87082c8127bb80fb885c4d8f23`): the phrase is a parenthetical in Rationale, not the Decision field, and reads "(replacing the current...)" not a comma-joined clause. **Withdrawn by `DEC-20260905-B` item 12.** Correction verified accurate.
6. **`DEC-20260427-I.md`** (Consequences) — `dutch-company-data.ts`: **"REPLACES the prior northdata.com... scraper"**. Verified: the file's actual header (`apps/api/src/capabilities/dutch-company-data.ts:1-4`) reads "scraping path," not "scraper" — the word "scraper" does not occur in the file. **Withdrawn by `DEC-20260905-J` item 25.** Correction verified accurate.
7. **`DEC-20260503-B.md`** (Consequences) — `"the "tiered audit trail (basic on capabilities, full on *-Assurance products)" this row describes..."`, transposing the record's own frontmatter `title` and Decision-section order ("audit trail tiered"). **Withdrawn by `DEC-20260905-D` item 16.** Correction verified accurate (frontmatter title confirmed to read "audit trail tiered").
8. **`DEC-20260505-H.md`** — "with no `cost_note` flagging it dormant (unlike `OPENSANCTIONS_API_KEY`'s explicit "not set in production" note)". Verified: `OPENSANCTIONS_API_KEY`'s actual `cost_note` field (`config/env-manifest.yaml:806`) reads "Held, not read..." and does not contain "not set in production"; that phrase is boilerplate on 43 other rows. **Withdrawn by `DEC-20260905-F` item 3.** Correction verified accurate.
9. **`DEC-20260506-G.md`** (Consequences) — `DEC-20260507-D` (Kyckr rejected in part because its "sales-gated pricing... collides with `DEC-20260506-G` no-fixed-cost stance"). Verified: this exact language and the Kyckr rejection belong to `DEC-20260507-F.md:41-42`, not `DEC-20260507-D` (the BYO-credentials record, which never mentions Kyckr). **Withdrawn by `DEC-20260905-C` item 38.** Correction verified accurate.
10. **`DEC-20260507-D.md`** (Decision section) — "The row implies an edit to the Counterparty Assurance product page, removing 'future BYO-endpoint augmentation' language," an unverifiable Notion-page reference outside the record's own `evidence:` array. **Withdrawn by `DEC-20260905-J` item 28** (as unverifiable). Minor note: `DEC-20260905-J` cites this as being in the record's "Context section," but it is actually in the "Decision" section (before the `## Context` heading) — a location imprecision in the amending record, not a defect in `DEC-20260507-D` itself, and does not change the substance of the withdrawal (the phrase is genuinely unverifiable regardless of which section it sits in).
11. **`DEC-20260507-G.md`** (Consequences) — "Both manifests were added in the same commit as Luxembourg's and Hungary's (2026-05-16, `9ee19282`), one day after `DEC-20260518` batch work." Verified directly: `git log` shows commit `9ee192828589dd293f3383de942a2b064143abc3` dated 2026-05-16 15:13:15+02:00, and `DEC-20260518-F.md`'s frontmatter reads `decided_at: 2026-05-18` — the commit is two days *before* that date, not one day after. **Withdrawn by `DEC-20260905-C` item 39.** Correction verified accurate.

No other quotation, attribution, relation, evidence path, or repository-state claim in the remaining 30 records of this partition was found false, fabricated, misattributed, or unverifiable.

### Verified-true items (not findings)

- **`DEC-20260429-A`'s "four review triggers" claim** (Consequences: "a monthly bill above EUR 1,500; customer or regulator demand for Strale-controlled dataset replay; an annual review in April 2027; or a Dilisense-initiated material terms change"). This is a Notion page-**body** claim (not in the properties export `dump_rows.py` reads), so per rule (c) I fetched the page directly via `notion-fetch` (page `35167c87082c8172bff8f3485699c961`). Its "Re-evaluation triggers" section lists exactly these four items, in this order. **Verified true.** I also verified the companion claim that the cited handoff file uses a different figure: `handoff/_general/from-code/2026-04-29-dilisense-reseller-correspondence.md:43` reads "Monthly Dilisense bill > €100," confirming the record's note of the €100/€1,500 inconsistency.
- **`DEC-20260428-A`'s Consequences claim** that `DEC-20260518-F`, "later affirmed by `DEC-20260813-A`," narrows Tier 1's scope. Verified: `DEC-20260813-A.md`'s relations declare `target: DEC-20260518-F`, and its own Decision text opens "Affirm `DEC-20260518-F` as the operative interpretation of...". Confirmed accurate.
- **`DEC-20260430-A`'s two `related_to` relations** to `DEC-20260428-A` and `DEC-20260428-B` are not narrated by ID in `DEC-20260430-A`'s own body, but its Context section names both targets unambiguously by unique subject matter ("the third-party sourcing doctrine and the engineering bar"). This gap is substantiated by `DEC-20260905-F` items 1-2 (and restated in `-H`, `-I`, `-J`), which I read and independently confirmed against both targets' frontmatter `title`/`topic` fields. Per rule (a), a relation whose basis an amending record states is substantiated, not a defect.

### Ten "status on" code-claim spot checks

1. `DEC-20260416-A` — `packages/mcp-server/package.json` exists; `apps/api/src/routes/x402-gateway-v2.ts` defines `toBazaarFields` (line 402) and `buildBazaarDiscovery` (line 441). Confirmed.
2. `DEC-20260421-J`/`-L` — `apps/api/src/capabilities/auto-register.ts` does not list `singapore-company-data` in its `DEACTIVATED` map (line 108 shows a "REACTIVATED" comment instead); commit `bd25bc57` resolves (`bd25bc57808b84606e546726b9acad461d2ff701`); commits `be0c7888` and `b86d431a` resolve, `972b860` and `2a1cc24` do not (as the records themselves state). Confirmed.
3. `DEC-20260421-L`/`-22-B` — `apps/api/src/lib/capability-readiness.ts:34-35` carries the "12 remaining caps (9 UK-property + 3 blocked-backfill) tombstoned with `deactivation_reason = 'park_permanent_...'`" comment; `apps/api/scripts/archive/phase-dec-b-park.ts` exists. Confirmed.
4. `DEC-20260422-B` — `auto-register.ts` still lists `amazon-price` (line 32), `hong-kong-company-data` (line 95), `indian-company-data` (line 105) in the DEACTIVATED map. Confirmed.
5. `DEC-20260425-A`/`-B` — `apps/api/src/lib/processing-location.ts` implements the three-step `RAILWAY_REPLICA_REGION` → `STRALE_PROCESSING_REGION` → `"unknown"` fallback exactly as both records describe. Confirmed.
6. `DEC-20260427-H` — `auto-register.ts` carries the five DEC-20260427-H-1 through H-5 comments at lines 154, 205, 214, 223, 232, matching the record's per-capability citations. Confirmed.
7. `DEC-20260427-I` — `auto-register.ts` carries the REACTIVATED comments for dutch/portuguese/spanish/german (lines 161-188) and the DEC-20260427-I-6 Austrian comment (line 199), matching the record. Confirmed.
8. `DEC-20260503-B` — `apps/api/src/db/schema.ts` still defines `qpScore`, `rpScore`, `matrixSqs`, `matrixSqsRaw`, `guidanceUsable/Strategy/Confidence`, and a full `sqs_daily_snapshot` table (lines 220-235, 1003-1028); `apps/api/src/jobs/test-scheduler.ts:659` carries "Daily SQS snapshot retired with the SQS engine (DEC-20260503-B)." Confirmed.
9. `DEC-20260505-B`/`-C` — `apps/api/src/lib/lifecycle.ts:6` reads "Per DEC-20260503-B (SQS deletion), automatic transitions are removed"; `apps/api/src/lib/matching.ts:175-179` carries the exact `betterRate` tiebreaker comment and code the record quotes. Confirmed.
10. `DEC-20260507-D` through `-H` — `config/env-manifest.yaml`'s `OPENAPI_ENABLED` row (lines 777-778) reads "MUST stay 'false' in production until the resale addendum is countersigned"; `manifests/luxembourgish-company-data.yaml`, `manifests/hungarian-company-data.yaml`, `manifests/bulgarian-company-data.yaml`, `manifests/cypriot-company-data.yaml` all exist and were checked for the `OPENAPI_ENABLED`-gated limitation text the records describe. Confirmed.

### Frontmatter / structural checks (all 41 records)

Programmatic check (Node script, CRLF-normalized): every record's `record_key`, `id`, and filename agree (bare-key records: filename stem equals `record_key` equals `id`); every record carries the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions). Zero issues found. All 41 records are non-`--notion-`-qualified bare keys, so item (8) of the review checklist (collision-registry cross-check for qualified records) does not apply to this partition.

Every `evidence:` array's local-file entries (excluding Notion/GitHub URLs, which are not file-existence-checkable, and no cross-repo entries appear in this partition) resolve to an existing file at this commit (script-checked). All declared relation targets (`DEC-20260415-A`, `DEC-20260421-J`, `DEC-20260422-C`, `DEC-20260423-A`, `DEC-20260320-B`, `DEC-20260424-A`, `DEC-20260428-A`, `DEC-20260428-B`, `DEC-20260503-B`, `DEC-20260505-H`, `DEC-20260506-G`, `DEC-20260507-F`) exist as records at this commit.

I checked `docs/decisions/id-collisions.yaml` for the two collision ids my partition's records discuss (`DEC-20260420-H`, `DEC-20260420-K`): both are `resolution_status: resolved` with `disposition: formal_record` rows, confirming `DEC-20260430-A`'s Consequences text (which already correctly states this, per `DEC-20260905-G` item 6's earlier correction) and `DEC-20260422-H`'s existence as a non-colliding bare-key record (no `DEC-20260422-H` entry in the collision file, confirming the file exists in `docs/decisions/records/` but is correctly absent from the collision registry).

### Unverifiable

- **Production/database/vendor-account state claims** every partition record itself flags as unverifiable from a read-only repository review (e.g. `DEC-20260503-A`'s solutions'-current-`is_active` state; `DEC-20260505-C`'s three flagged Singapore solutions' current cascade-deactivation status; `DEC-20260505-H`/`-507-E`'s current OpenRegister billing tier; `DEC-20260505-G`'s Implisense RapidAPI account status; `DEC-20260506-G`'s whether any deferred fixed-cost vendor commitment now sits inside the tracked budget; `DEC-20260507-F`'s whether any of its three revival-trigger conditions has fired). These remain as the records themselves state them — not withdrawn on the strength of this review, consistent with prior rounds' treatment of the same class.
- `DEC-20260421-J`'s Outcome-cited commit `972b860` and `DEC-20260421-L`'s Outcome-cited commit `2a1cc24`: confirmed not to resolve as commit objects in this repository (as the records themselves already state, attributing them to the sibling frontend repo or elsewhere).
- `DEC-20260507-G`/`-H`'s cited commit `84398f7`: confirmed via `git cat-file -e` not to resolve in this repository (as the records themselves already state).

### PARTITION VERDICT: PASS


### Partition P4

# Closing review, round 11, partition P4

Commit reviewed: `ef16b2c68b59a679eabd37d95d30e642982ab38d` (detached checkout in the reviewing agent's own isolated worktree, `git fetch origin` run first).
Record count: 41 (`DEC-20260507-I.md` through `DEC-20260904-B.md`, May 2026 and later, no `--notion-`/`--git-` qualified records in this partition).

### Setup notes

This session is a worktree-isolated agent (`C:\Users\pette\Projects\strale\.claude\worktrees\agent-a6ed7046be657c014`), so per the orchestrator's override it detached to the pinned commit inside its own existing worktree rather than creating a new `C:/tmp/strale-closing11-P4` worktree; `npm ci` ran there, nothing was committed, nothing was pushed, no `git stash` was used, and no other worktree was touched or removed. Notion rows were read exclusively through `dump_rows.py`, batched once for all 35 Notion-sourced records in this partition (36 rows returned; one page id, `35d67c87082c810eb79dd5ad25e3b65f`, matched a row whose `Rationale`/`Source` differ slightly from expectation but the record's own text accounts for both — see findings). Cross-repo evidence was resolved against `C:/Users/pette/Projects/strale-frontend` (fetched first).

### Script used

Ran the repo's own operator checker, `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend <strale-frontend> --min-chars 12`, once per file in this partition (`--only` per record). Logic in one sentence: it extracts every double-quoted span of at least 12 characters from each record's body, applies the declared normalization (transliterate EUR/x/>=/<=/->/..., lowercase, strip all non-alphanumerics), and reports the span "faithful" if it is a substring (or, for an ellipsis-split span, an in-order sequence of substrings) of the row's Notion fields, the record's own evidence files, another record it names, or the frontend checkout; otherwise it reports a "residual" naming its best (non-matching) candidate. Result: **41 records, 118 spans, 110 faithful, 8 residual.**

### Residuals and classification

1. `DEC-20260510-A.md:86` — `"promote a useful handoff note to tracked,"` (best match: `notion:DEC-20260510-A`, prefix 8). **Real finding.** The row's actual `Rationale` field (verified via `dump_rows.py`) uses the label `PROMOTE-TO-TRACKED` but never the sentence "promote a useful handoff note to tracked." It does not appear in `handoff/README.md` or `docs/programs/cto-readiness/PROGRAM.md` either (both grepped). This is a quotation-marked phrase with no traceable source — a paraphrase presented as if quoted.
2. `DEC-20260518-A.md:100` — `"Evidence Tier 1/2/3"` (best match: `notion:DEC-20260518-A`, prefix 13). **Checker miss.** This is not attributed to any source as existing; the sentence is "No `evidence_tier` field or 'Evidence Tier 1/2/3' label was found anywhere in code" — a negative-search description, not a sourced quote. Confirmed by grep: `evidence_tier` has zero matches under `apps/api/src`, `manifests/`, `docs/company/claims.yaml`.
3. `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md:26` — `"The burden collapses"` (best match: unrelated record, prefix 6). **Checker miss.** Verified verbatim in `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/integration-burden-v1.3.md` ("Adopt **The burden collapses** as the second homepage section."). The record's evidence entry cites the containing directory, not this specific file, which is why the checker could not resolve it.
4. `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md:28` — `"Selection Violet"` (best match: unrelated record, prefix 9). **Checker miss.** Verified verbatim in `use-case-enrichment-validation-v1.5.md` line 64 ("Selection Violet is the dominant atmospheric family."). Same directory-evidence resolution issue as #3.
5–6. `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:28,63` — `"not a live ranking"` (best match: unrelated record, prefix 8 both times). **Checker miss (both).** Verified verbatim in `use-case-search-web-intelligence-v1.6.md` line 35 ("**not a live ranking**"). Same directory-evidence issue.
7. `DEC-20260904-A.md:180` — long multi-segment quote about `closes_when` (best match: unrelated record, prefix 7). **Checker miss.** Verified verbatim in `docs/project/m2-closure-register.yaml` lines 5169–5171 (G1's `closes_when` text), which is not itself listed in the record's `evidence` array (a completeness gap, not a fidelity defect — the file is named by path in the prose and is a real repo file at this commit).
8. `DEC-20260904-B.md:102` — `"where did this id's authority come from"` (best match: unrelated record, prefix 7). **Real finding.** Grepped across every evidence file this record cites (`archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md`, `scripts/m2-closure-register-lib.mjs`, `scripts/decision-records-lib.mjs`, both schema files, `docs/decisions/README.md`) — no match anywhere. This reads as the record author's own rhetorical phrase, not a quotation of any named source.

### Findings

1. **`docs/decisions/records/DEC-20260510-A.md`, line 86** — the quoted phrase `"promote a useful handoff note to tracked,"` is not found in the row's Notion `Rationale` (confirmed via `dump_rows.py`, page `35c67c87082c81949063e8b6dd94980d`), in `handoff/README.md`, or in `docs/programs/cto-readiness/PROGRAM.md`. It is presented in quotation marks as if sourced but has no traceable origin.
2. **`docs/decisions/records/DEC-20260904-B.md`, line 102** — the quoted phrase `"where did this id's authority come from"` is not found in any of the record's six evidence entries. Same defect class as #1: a rhetorical phrase in quotation marks without a checkable source.

No other findings. Everything else checked — frontmatter validity, `record_key`/`id`/filename agreement, the CAUTION banner, the five protected sections, evidence-path existence (including cross-repo and same-repo-commit-sha entries), relation-target existence and non-collision, and null/populated field claims — was clean across all 41 records.

### Structural checks (all 41 records)

- **Frontmatter parses**: all 41 parsed cleanly with `yaml.safe_load` on the extracted frontmatter block.
- **`record_key`/`id`/filename agreement**: all 41 match (`record_key == id == filename minus .md`); none are qualified (`--notion-`/`--git-`) in this partition, so bare-key = id applies throughout.
- **CAUTION banner and five protected sections**: `grep -c` for `M2 CANDIDATE RECORD`, `## Decision`, `## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions` returned exactly 1 for every record, every section.
- **Evidence paths**: every non-URL, non-cross-repo evidence entry exists as a file at this commit (verified with a Python existence check over all 41 records' `evidence` arrays). Cross-repo entries (`strale-io/strale-frontend@<sha>:<path>`, one same-repo `strale-io/strale@<sha>` commit reference on `DEC-20260822-A`, and one `codex/repo-native-operating-model@<sha>:<path>` entry on `DEC-20260901-A`, which is a branch label inside this same repository, not a foreign remote) all resolved: commits exist, directories/files exist, content readable.
- **Relations**: every `relations[].target` across all 41 records resolves to an existing record key under `docs/decisions/records/` at this commit (verified programmatically); none is a bare id listed in `docs/decisions/id-collisions.yaml`'s `collisions[].id` list (checked the 20 distinct relation targets used in this partition against the full collision list).
- **Null/populated field claims**: cross-checked every `"X is null"` / `"X's own field states"` claim in the eight records with such language against the actual Notion JSON for `Superseded By`, `Outcome`, `Source`, and `Rationale` — all matched (e.g. `DEC-20260507-I`: `Superseded By`/`Outcome`/`Source` all null, confirmed; `DEC-20260507-J`: `Rationale` null, confirmed; `DEC-20260513-A`: `Rationale`/`Source` null, confirmed).
- **`scope:` frontmatter field vs. Notion `Scope` property**: every record in this partition has a repo-native `scope` value (product/technical/global/design/operational) that differs from the row's own Notion `Scope` field (uniformly `global` or, for the six website records, `feature`). This is not a defect — eight of the records explicitly explain in their own `## Context` section that "the historical Notion scope field on this row was `global`... recorded here as `scope: X` under this repository's decision-record vocabulary," and the pattern holds consistently across every record checked against the Notion dump.

### Ten-plus code-claim spot checks (file and line)

1. `DEC-20260507-J.md` — "exactly four call sites, all in `apps/api/src/routes/do.ts`": confirmed via grep, `recordFailure(` appears at `do.ts:1773,1955,2305,2868` and nowhere in `test-runner.ts`. Also confirmed the two attributed comments verbatim at `circuit-breaker.ts:189-198` and `test-runner.ts:844-859`.
2. `DEC-20260508-A.md` — `manifests/hungarian-company-data.yaml:54` (`data_source: Openapi.com WW-Top...`), added by commit `9ee192828589dd293f3383de942a2b064143abc3` (2026-05-16, matches "9ee19282"/2026-05-16 claim); `config/env-manifest.yaml:776-777` OPENAPI_ENABLED cost_note matches "Openapi case 151296" claim.
3. `DEC-20260508-D.md` — `config/env-manifest.yaml:788-796` (OPENREGISTER_API_KEY: `holder: railway`, `required_in: [production]`, `set_in: [railway]`, no `cost_note`) vs. `:797-805` (OPENSANCTIONS_API_KEY, which does carry a `cost_note`) — matches the row's "unlike OPENSANCTIONS_API_KEY" contrast exactly.
4. `DEC-20260511-B.md` — `apps/api/src/lib/startup-migrations.ts:573-601,624-628`, block 0066's header comment and reconciling `UPDATE` SQL, matches the quoted text verbatim.
5. `DEC-20260511-C.md` — `apps/api/drizzle.config.ts` exists, `apps/api/drizzle/` absent, `apps/api/package.json:61` has `"drizzle-kit": "^0.31.10"` with no `db:generate`/`db:migrate`/`db:push` scripts, `.github/workflows/ci.yml:176` runs `npx drizzle-kit push --force`, `apps/api/src/lib/cost-class-invariant.ts:64` and `apps/api/src/routes/do.spend-cap.integration.test.ts:26` both still carry the stale "drizzle-kit push" references the record names.
6. `DEC-20260511-E.md` — `apps/api/src/lib/meta-monitoring.ts:421-481,540-543`, the staleness-anchor comment and both `checkValidationQueueStuck`/`checkProbationTimeout` doc comments, matches verbatim.
7. `DEC-20260511-F.md` — `apps/api/src/jobs/daily-digest.ts:5` (manual usage line), `apps/api/src/jobs/test-scheduler.ts:1020-1022`, `apps/api/package.json:19`, `apps/api/src/routes/admin.ts:355-374` (gather/analyze/render/send/snapshot sequence), no cron workflow references `daily-digest` under `.github/workflows/`, and `sendInterruptEmail` has zero callers outside `interrupt-sender.ts` — all confirmed.
8. `DEC-20260513-A.md` — `apps/` contains only `api` (no `apps/web`), `docs/decisions/records/DEC-20260503-C.md` does not exist, and `strale-io/strale-frontend@04c9fca97...:public/_headers` exists with no `wrangler.toml` at that commit.
9. `DEC-20260513-B.md`/`-C.md` — `apps/api/src/db/schema.ts:965-980` `capability_health` table has only `state`/`consecutiveFailures`/`backoffMinutes`, no `pinned`/`manual_override` column; `apps/api/scripts/manifest-consistency-allowlist.txt` has exactly 22 non-comment, non-blank slug lines, matching the row's "22 manifests grandfathered" claim exactly.
10. `DEC-20260515-A.md`/`-B.md` — no `us-ny-company-data`/`us-co-company-data`/`us-fl-company-data`/`us-ma-company-data`/`us-wa-company-data`/`us-tx-company-data`/`us-sam-entity` manifest exists (only `us-company-data`, `us-company-data-cobalt`, `us-court-search`, `us-ein-match`, `us-product-recall-search`, `us-sec-filings-extended`); `config/env-manifest.yaml:302-310` COBALT_API_KEY matches `required_in: []`/`set_in: [none]`; `docs/company/DECISION-QUEUE.md` DQ-30 text matches verbatim; commit `34036a0` does not resolve (`git cat-file -e` fails).
11. `DEC-20260515-C.md` — commit `8eb8c0e` does not resolve; `manifests/slovenian-company-data.yaml:11-12,132-135` matches the quoted `data_source` and `limitations` text.
12. `DEC-20260518-B.md`/`-C.md`/`-D.md` — grep for `use_case_tier` (zero matches, confirmed absent), `manifests/uk-cop-check.yaml:223` (Digiteal/SEPA VoP pointer, no such capability built, confirmed via grep), `apps/api/src/capabilities/danish-company-data.ts:183-184` and `uk-company-data.ts:226-227` (`ubo_availability`/`ubo_availability_reason` values), PR #131 confirmed merged 2026-05-18 as "feat(evidence-tier): labeling sweep across 31 company-data handlers" via `gh pr view 131`.
13. `DEC-20260827-A.md` — PR #410 and #414 both confirmed merged via `gh pr view`; DQ-20 confirmed in `docs/company/DECISION-QUEUE.md:235`; the "licensed contract with the Austrian Justizministerium..." quote confirmed verbatim in `apps/api/src/capabilities/auto-register.ts:199-200` (a checker miss already identified and resolved in round 6 of this same closing review — re-verified here, not a new finding).
14. `DEC-20260904-A.md` — the 76 page ids listed in this record's `evidence` array are an exact set-match against the 76 page ids listed in `archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md` (programmatically diffed, zero difference either direction). The finer breakdown this record states (216 private rows total, 129 non-eligible, 11 non-feature/inactive, 128 global-scope + 1 temporary-scope remaining) rests on a private archive projection this batch cannot independently re-run (`scripts/m2-closure-apply-g1-rule.mjs` requires a `--private <file>` this repository does not contain) — listed below as unverifiable rather than accepted or rejected.
15. `DEC-20260904-B.md` — the regex pattern in the fenced code block matches `scripts/decision-records-lib.mjs:26` verbatim; all named finding codes (`RECORD_GIT_KEY_ID_MISMATCH`, `RECORD_GIT_KEY_SOURCE_KIND`, `RECORD_GIT_KEY_PROVENANCE_MISMATCH`, `RECORD_GIT_KEY_NOT_ANCESTOR`, `COMMIT_UNVERIFIABLE`, `RECORD_KEY_BARE_CROSS_SURFACE_ID`, `CROSS_SURFACE_FORMAL_RECORD_UNSUPPORTED`, `DECISION_ROW_CROSS_SURFACE_STATE_INVALID`, `RECORD_GIT_KEY_WITHOUT_CROSS_SURFACE`) exist in `scripts/m2-closure-register-lib.mjs`; `DEC-20260504-A.md` confirmed as a plain bare-key record, matching the cited example.

### Unverifiable

- `DEC-20260904-A.md`'s stated breakdown of the 216-private-row population (129 non-eligible, 11 non-feature/inactive, 128 global-scope + 1 temporary-scope remaining) cannot be independently reproduced from this repository: it depends on a private archive projection (`scripts/m2-closure-apply-g1-rule.mjs --private <file>`) that is not present in this checkout. The 76-row output of that computation is independently verified (exact match against the gap report), which gives indirect confidence in the pipeline, but the intermediate breakdown numbers themselves are taken on the record's own description of a script run this batch cannot replay.

### Final verdict

Two findings (both in the "unverifiable/fabricated quotation" class: a quotation-marked phrase with no traceable source, in `DEC-20260510-A.md` and `DEC-20260904-B.md`). Per the round's rules, any false, fabricated, misattributed, or unverifiable claim is a finding regardless of severity, so this partition does not pass clean.

PARTITION VERDICT: FAIL


### Partition P5

# Closing review round 11, partition P5

Commit: `ef16b2c68b59a679eabd37d95d30e642982ab38d`
Record count: 34 (all `--notion-` qualified records; every id in this
partition is a resolved id-collisions.yaml collision pair)

### Method

Checked out the pinned commit detached in this session's own isolated
worktree (`C:/Users/pette/Projects/strale/.claude/worktrees/agent-a69c63d7d3ae59fc6`),
ran `npm ci`, and read the 34 assigned record files plus
`docs/decisions/id-collisions.yaml`, `docs/project/m2-closure-register.yaml`,
and `docs/decisions/records/DEC-20260905-{B..L}.md` (the prior-round
correction records) for any statement already withdrawn about a record in
this partition.

Ran the operator checker:
`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only <file>` per record in this partition. Logic in one
sentence: for every double-quoted span of 12+ characters in a record's
body, transliterate/lowercase/strip-non-alphanumerics on both the quote
and every candidate source (the attributed Notion row field, a cited repo
file, a cited cross-repo frontend file, or another cited record), split on
ellipses into ordered segments, and report a residual if no source
contains all segments in order.

Result: **34 records, 243 spans, 243 faithful, 0 residual.** No
classification work was needed for this partition; the checker found
nothing left to flag.

Pulled the 34 Notion rows read-only via
`python dump_rows.py p5-rows.json PAGE:<id> ...` (34 requested, 34
selected) and cross-checked null-field claims against the rows'
actual null fields with a small script: every "Superseded By"/"Outcome"/
"Rationale is null" claim in the 34 records matches the row's real null
fields (0 mismatches).

Verified the collision-registry chain for all 34 records:
`id-collisions.yaml` shows `resolution_status: resolved` and
`disposition: formal_record` with the matching `record_key` for every one
of the 18 collision ids covered by this partition (`DEC-20260225-P-c5d6`,
`DEC-20260303-A`, `DEC-20260304-A`, `DEC-20260304-B`, `DEC-20260304-C`,
`DEC-20260320-C`, `DEC-20260320-J`, `DEC-20260320-K`, `DEC-20260405-B`,
`DEC-20260406-A`, `DEC-20260406-B`, `DEC-20260406-C`, `DEC-20260409-C`,
`DEC-20260420-D`, `DEC-20260420-E`, `DEC-20260420-F`, `DEC-20260420-G`,
`DEC-20260420-H`); `m2-closure-register.yaml` shows
`disposition: formally_migrated` with the matching `record_key` for all 34
page-id rows.

### Structural checks (all 34 records)

- Frontmatter parses; `record_key`/`id`/filename agree on all 34.
- CAUTION banner present on all 34.
- All five protected sections (Decision, Context, Rationale, Consequences,
  Reversal conditions) present on all 34.
- Every `evidence` entry resolves: repo-local paths exist at this commit,
  Notion URLs are recognized as such, and cross-repo
  `strale-io/strale-frontend@04c9fca9:<path>` entries were spot-checked via
  `git -C strale-frontend show 04c9fca9:<path>` for the records the checker
  used them on (the checker's `--frontend` flag independently confirmed all
  of them as sources for their quoted spans).
- Relation targets: `DEC-20260320-B`, `DEC-20260409-A`, `DEC-20260409-B`,
  `DEC-20260420-A` (bare ids) all exist as record files and are none of
  them collided ids in `id-collisions.yaml`. Qualified targets
  (`DEC-20260405-B--notion-...`, `DEC-20260406-B--notion-...`,
  `DEC-20260420-D/E/F/G--notion-...`) all exist as files in this
  partition. Every relation has a "Relation to `X`" paragraph (or
  equivalent named-target prose) substantiating it with a quoted source
  sentence.

### Findings

None. No false, fabricated, misattributed, or unverifiable statement was
found in this partition at this commit.

Two statements in this partition that read, on their own, as
misattributions were already withdrawn by name in a prior round's
correction record and are not fresh findings per this round's rule (a):

- `DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md`'s
  Consequences section still quotes `DEC-20260812-A` as stating it
  "supersedes... the Counterparty Assurance rename/ICP,". This exact
  misattribution is withdrawn by `DEC-20260905-C` item 35 (that phrase is
  verbatim from `CLAUDE.md`, not `DEC-20260812-A.md`). Verified the
  correction is itself right: `grep -c "rename/ICP" docs/decisions/records/DEC-20260812-A.md`
  returns 0 at this commit; the phrase is in `CLAUDE.md`'s "Current
  Decisions (August 2026)" section instead.
- `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`'s Context
  section (line ~3489) reads "the row's own subject ("the SA.2 + F-A
  series")". This exact dropped-word defect (the row's Rationale says
  "**complete** SA.2 + F-A series") is withdrawn by `DEC-20260905-J` item
  21. Verified the correction is right by reading the row's Rationale
  field in the dump: it reads "...DEC-20260420-A through DEC-20260420-G
  (complete SA.2 + F-A series)."; "complete" is present and the record's
  quotation drops it.

One dated-figure observation repeated in this partition
(`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`'s
Consequences: "All 342 manifests under `manifests/*.yaml` now declare
`processes_personal_data`; 127 also declare `personal_data_categories`")
no longer matches the corpus at this commit (`manifests/*.yaml` now has
350 files, 350 declaring `processes_personal_data`, 129 declaring
`personal_data_categories`, per a direct grep). This is not a fresh
finding: it is the same dated observation `DEC-20260905-I` already
classified as a status-observation-as-of-a-date, not a defect, and
`DEC-20260905-J`'s own summary independently restates the identical
conclusion for the identical span. This partition's separate correction,
also already withdrawn in `DEC-20260905-C` item 34, concerns a different
part of the same record: the claim that `onboarding-gates.ts` enforces
`PII_CATEGORY_ENUM` "exactly as this row specifies, unconditionally" is
false (the enum has grown from 12 to 14 entries, `nationality` and
`political_affiliation` added 2026-04-30) and was withdrawn there;
verified by reading `apps/api/src/lib/onboarding-gates.ts:242-259` at this
commit, which lists 14 entries exactly as the correction states.

### Checker residuals

None (0 residual spans across all 34 records and 243 checked spans; see
Method above).

### Ten (seventeen) code-claim spot checks

1. `apps/api/src/db/schema.ts:678-697`: `failedRequests` table exists
   named `failed_requests`, comment cites `DEC-20260225-P-c5d6`. Matches
   `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`.
2. `apps/api/src/routes/suggest.ts:43-66`: `GET /suggest/typeahead` and
   the `/v1/suggest` search-type both present. Matches
   `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md`.
3. `apps/api/src/capabilities/auto-register.ts:328`: comment "Read
   manifest slugs from manifests/*.yaml"; no `.d.ts` filter or
   `MIN_EXPECTED_EXECUTORS` symbol anywhere in the file (grep empty).
   Matches `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`'s
   claim that the mechanism is gone.
4. `apps/api/src/capabilities/au-company-data.ts:4,17,20` and
   `config/env-manifest.yaml:20`: `ABN_LOOKUP_GUID` used exclusively, no
   `ABR_AUTH_GUID` trace. Matches
   `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md`.
5. `apps/api/src/lib/platform-facts.ts:14`: "free-tier list: 5 in
   marketing, 11 in manifests, 5 different in production." Matches
   `DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md` and
   `DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md`.
6. `manifests/pep-check.yaml:136`: `transparency_tag: algorithmic`.
   Matches `DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7.md`.
7. `apps/api/src/db/schema.ts:332,334`: `capabilityId` nullable,
   `solutionSlug` with the exact comment "set for solution executions,
   null for capability executions." Matches
   `DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md`.
8. `apps/api/src/lib/startup-migrations.ts:2100-2172`: block 0101,
   "694 solution rows, all with a null capability_id" comment present.
   Matches the same record.
9. `apps/api/src/capabilities/auto-register.ts:140-143`: `DEACTIVATED`
   map's `credit-report-summary` entry quotes the exact reason text.
   Matches `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md`.
10. `apps/api/src/lib/solution-executor.ts:217-544`: `StepTiming`
    interface with `latencyMs`, pushed on both success and failure
    branches. Matches
    `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md`.
11. `apps/api/src/lib/solution-executor.ts:76,110,160-184`: `parsePath`
    and `walkPath` exported and used, replacing flat-key lookup. Matches
    `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md`.
12. `apps/api/src/jobs/test-scheduler.ts:125,662,667`: `weekly-sweep`
    task, comment describing it as a URL/dependency probe. Matches
    `DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md`.
13. `apps/api/src/lib/onboarding-gates.ts:242-259`: `PII_CATEGORY_ENUM`
    has 14 entries including the 2026-04-30 additions. Matches (and
    confirms) the already-withdrawn correction discussed above.
14. `apps/api/src/routes/verify.ts:24-25`: `MAX_DEPTH = 50`,
    `DEFAULT_DEPTH = 20`. Matches
    `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md`.
15. `apps/api/src/lib/audit-token.ts:21,43,85,100`: F-A-006/F-A-007
    comments at the described functions. Matches
    `DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md`.
16. `apps/api/scripts/onboard.ts:92-106,135`: `case "ai_assisted"` mapping
    and `--force-override-authority` interactive guard both present.
    Matches `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`.
17. `apps/api/scripts/archive/drop-aggregator-kyb.ts:1-38` and
    `drop-sg-kyb.ts:1-13`: headers confirm 15 solutions paused across
    5 countries (`nl,pt,es,de,at`; Lithuania had no seeded solutions to
    pause despite capability deactivation) and 3 SG solutions paused.
    Matches `DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md`
    exactly (this one needed a second, closer read: the file's own
    top-of-header "18 solutions across 6 EU jurisdictions" figure counts
    deactivated *capabilities*/jurisdictions, not paused *solutions*; the
    file's own "Solutions paused (15)" list, which the record cites,
    matches the record's 5-country, 15-solution claim precisely).

### Unverifiable

None. Every claim in this partition's 34 records was checkable against a
cited source at this commit (a repo file, the Notion export, another
record, or the sibling frontend checkout), and none required more than
what this partition's evidence and checker run provided.

PARTITION VERDICT: PASS


### Partition P6

# Closing review round 11, partition P6

Commit: `ef16b2c68b59a679eabd37d95d30e642982ab38d`
Record count: 42 files listed in `closing11-P6.txt`, resolving to 44 record entries once the operator checker enumerates them individually (two of the listed filenames each contribute a distinct notion-qualified record already counted separately in the list; no duplicate or missing file). Records: DEC-20260420-I (x2), DEC-20260420-J, DEC-20260420-K (x2), DEC-20260421-A (x2), -B (x2), -C (x2), -D (x2), DEC-20260422-A (git-qualified), DEC-20260502-A, DEC-20260505-D (x2), DEC-20260505-E (x2), DEC-20260507-A (x2), -B, -C (x2), DEC-20260508-B (x2), -C (x3), DEC-20260512-A (x2), DEC-20260513-F (x2), and the eleven amending records DEC-20260905-B through -L.

Working method: fetched origin, checked out the pinned commit detached in this session's own already-isolated worktree, ran `npm ci` (succeeded, no retries needed once complete). No commits, no `git stash`, no worktree removed or created beyond this session's own.

### Script used

Built a Notion export by running `dump_rows.py` against every 32-hex page id referenced anywhere in my partition's evidence/relations (105 candidate ids, 86 resolved rows). First attempt fed the checker `dump_rows.py`'s own JSON-array output as `--export`, which silently produced zero parsed rows (`parseNotionExport` expects the raw `"text": "{...}"` export blocks, not a pre-filtered array) — caught this by unit-testing `parseNotionExport` directly against both files. Re-ran against the underlying raw export file (`scratchpad/decisions-export-raw.txt`, 318 rows) instead. Ran `node scripts/m2-quote-fidelity.mjs --export <raw export> --frontend <strale-frontend checkout> --min-chars 12` with one `--only <file>` per partition record. Also ran `lib.validateDecisionRepository()` (the same structural validator `context:check`/`decision-records.test.mjs` invoke) over the whole repo and filtered to my files, and ran `node --test scripts/decision-records.test.mjs` in full (32/32 pass, no per-file filter needed since it's a repository-wide invariant suite).

Checker totals for my partition (correct export): **44 records, 806 spans, 714 faithful, 92 residual.**

### Residual list and classification

All 92 residuals fall inside four of the eleven amending records: `DEC-20260905-C.md` (83 of 156 spans), `DEC-20260905-D.md` (2 of 73), `DEC-20260905-F.md` (6 of 16), `DEC-20260905-G.md` (1 of 32). Zero residuals in any other record in my partition (the 32 April/May notion-qualified records and DEC-20260422-A all checked 100% faithful).

Classification, verified by direct reading rather than by assertion:

- **`DEC-20260905-C.md`, 82 of its 83 residuals**: mid-sentence fragments (e.g. `" to \`CLAUDE.md\`. Fact: \`CLAUDE.md\`'s\n    DEC-20260812-A entry reads only "`, `' (three occurrences, e.g. line\n    1771), a different file and a different wording ('`) whose extracted span starts or ends inside connective prose, never at a real quotation boundary. Traced the root cause to `DEC-20260905-C.md:373`, which contains an escaped inner quote — `"... armed in prod\")"` — that the checker's naive double-quote span extractor cannot parse; every subsequent quote boundary in the file shifts by one from that point on. This is exactly the "escaped-quote parsing defect at `DEC-20260905-C.md:373`" that `DEC-20260905-F`'s own Consequences section names and quantifies ("82 self-referential parsing artifacts inside `DEC-20260905-C.md`"). Checker miss, not a finding.
- **`DEC-20260905-C.md`, 1 residual** (line 588, item 43, `bestMatch: notion:DEC-20260313-C`): same cascading-fragment pattern, downstream of the same line-373 defect. Checker miss.
- **`DEC-20260905-D.md`, both residuals** (lines 429, 451: `"the checker missed it"`, `"checker miss, faithful to a source"`): read in context (`DEC-20260905-D.md:418-430` and `:449-453`), both are the record's own rhetorical illustration of insufficiently-rigorous classification language ("...the practice of asserting a classification without quoting the source... treated 'the checker missed it' as sufficient without verification"), not an attributed quote of any external source. Checker miss (rhetorical self-quotation), same class `DEC-20260905-F` names ("a record's own rhetorical paraphrase or illustrative phrasing not attributed to any source").
- **`DEC-20260905-F.md`, 6 residuals**: line 176 (`"not narrated at all"`) is the same rhetorical-illustration class, verified in context at `DEC-20260905-F.md:172-180` (contrasting this round's stricter finding against "prior rounds['] ... 'not narrated at all' gaps"). Lines 213, 249, 259, 275, 283 are long verbatim excerpts of the record's own Consequences-section prose (near-duplicate boilerplate shared across the amending-record family, e.g. discussing the 22-character sub-threshold quotation and the residual-reconciliation methodology); each is the record quoting itself, not an external attribution. Checker miss.
- **`DEC-20260905-G.md`, 1 residual** (line 348, `"Rule (a) cross-check"`): verified in context at `DEC-20260905-G.md:345-351` — this is the label of a review-methodology table entry from this round's own P3 partition, quoted rhetorically, not an external-source attribution. Checker miss.

Reconciliation: **0** new defects among the 92 residuals in my partition; **92** checker misses, each traced to a source or explained by the documented line-373 parsing defect.

### Findings

None. Checked for every record in the partition:

1. **Frontmatter**: all 42 files parse; `record_key`, `id`, and filename agree in every case (bare-key files equal their id; qualified files are `<key>.md`).
2. **CAUTION banner + five protected sections**: present exactly once in every record (the two extra `CAUTION` string hits in `DEC-20260905-C/D/E` are prose mentioning "the CAUTION banner," not a second banner).
3. **Quotations**: see residual analysis above; all faithful once checker misses are accounted for.
4. **Null-field claims**: spot-checked every explicit null-field assertion in the partition against the parsed export — `DEC-20260420-I--...c8b9d..` ("Rationale and Outcome are both null") correctly describes a **different** row it discusses in prose (`DEC-20260420-H--...b58b36..`, confirmed null on both fields), not its own row; `DEC-20260421-B/-C/-D`'s "Superseded By is null; Outcome is not" and `DEC-20260505-D/-E`'s "Outcome field is null" all confirmed exactly against the export. No false null-claims found.
5. **Evidence paths**: every non-URL evidence entry across the partition (140 distinct local paths) exists at the pinned commit; both cross-repo `strale-io/strale-frontend@<sha>:<path>` entries resolve in the sibling checkout; both commit-SHA evidence entries (`3b25658736bfed...`, `f93355ace32c40...`) exist and are ancestors of HEAD.
6. **Relations**: 91 distinct relation targets across the partition all resolve to an existing record key at the pinned commit; none is a bare collided id (checked against `docs/decisions/id-collisions.yaml`'s 35 collision ids).
7. **Code-claim spot checks** (11, exceeding the 10 minimum):
   - `apps/api/src/db/schema.ts:203` — `processesPersonalData` is `.notNull().default(false)` (DEC-20260420-J).
   - `apps/api/src/lib/audit-helpers.ts:40-41` — heuristic `detectPersonalData` removed comment present (DEC-20260420-J/K).
   - `apps/api/src/routes/do.ts:3013-3014` — reads `capability.processesPersonalData` directly, no heuristic (DEC-20260420-K).
   - `apps/api/src/lib/platform-facts.ts:164,171` — `getActiveVendorNames()`/`getStaleVendorNames()` exist (DEC-20260507-A).
   - `WORKTREES.md` exists at repo root (DEC-20260508-B).
   - `apps/api/src/lib/capability-persistence.ts:303-340` — hook fires post-commit, "OUTSIDE the transaction. Design doc §4.3" comment present (DEC-20260421-B).
   - `apps/api/src/index.ts:10,21` — `MIN_EXPECTED_EXECUTORS = 200` and the boot gate (DEC-20260905-D residual item 22, verified true).
   - `apps/api/src/lib/trust-helpers.ts:371-386` — `categorizeFailureReason` maps `guaranteed_field_missing:*` to `"manifest_drift"` (DEC-20260513-F).
   - `apps/api/scripts/check-no-new-console.mjs` exists (DEC-20260905-B evidence).
   - `docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md` exists at its post-T5 location (DEC-20260422-A).
   - `apps/api/src/lib/capability-readiness.ts:12-13` — "34 caps shipped to prod with NULL reliability" comment present verbatim (DEC-20260905-L claim, confirmed).
8. **Git-qualified record mechanism** (`DEC-20260422-A--git-3b256587`): `id` (`DEC-20260422-A`) equals the key minus qualifier; the commit sha exists and is an ancestor of HEAD. Initially flagged the record's own frontmatter as missing `source_kind`/`source_rows`/`git_provenance` — this is not a defect: those three fields live on the register's `formal_records` entry for this key, not on the record file itself (confirmed by a comment in `decision-records-lib.mjs:790` pointing at `m2-closure-register-lib.mjs`), and the register entry has them correct (`source_kind: git-native`, `source_rows: []`, `git_provenance` equal to the record's own first evidence entry). Self-corrected before reporting as a finding.
9. **Qualified-record registry bindings** (item 8 of the brief, all 32 `--notion-` records in my partition): every one has an `id-collisions.yaml` entry with `disposition: formal_record` under the matching `record_key`, and a `docs/project/m2-closure-register.yaml` `decision_rows` entry with `disposition: formally_migrated` under the same `record_key`. Verified programmatically for all 32; zero mismatches.
10. **Repository-wide structural validator**: `lib.validateDecisionRepository()` (the function backing `context:check`) returns zero findings repo-wide, none in my partition. `node --test scripts/decision-records.test.mjs` passes 32/32.

### Unverifiable

None. Every evidence entry, relation target, quotation, and null-field claim in my partition resolved to a definite true/false answer against the pinned commit, the Notion export, or the sibling frontend checkout.

### Cleanup

Worktree used: this agent's own pre-existing isolated worktree (`C:\Users\pette\Projects\strale\.claude\worktrees\agent-a53f028cba7cbe65f`), per the task instructions substituting the prompt template's separate-worktree setup with the session's already-isolated one. No temporary worktree was created, so none was removed. No commits made; `HEAD` left detached at the pinned commit. No `git stash` used at any point.

PARTITION VERDICT: PASS


## Gate run

```
M2 closing review round 11 gate run at ef16b2c68b59a679eabd37d95d30e642982ab38d, 2026-09-06T09:47:30Z
HEAD=ef16b2c68b59a679eabd37d95d30e642982ab38d
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (7216.6648ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (2165.2436ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (8.787ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (1080.7866ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 291337.7311
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (795.3691ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (688.5028ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (336.8155ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (1896.0565ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 275497.0177
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
ok   receipts contract
warn (10) — handoffs stating a bare test count with no receipt:
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
exit=0
=== node apps/api/scripts/check-pii.mjs --strict
PII guard: clean — no unredacted person names or checksum-valid identifiers found.
exit=0
=== node apps/api/scripts/check-no-committed-secrets.mjs
check-no-committed-secrets: clean (3126 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still ef16b2c68b59a679eabd37d95d30e642982ab38d
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Consolidated findings

Five partitions (P1, P2, P3, P5, P6) passed clean and all nine gates
were clean. Partition P4 found two defects, both double-quoted spans
that a record attributes to no source:

1. **`docs/decisions/records/DEC-20260510-A.md`, lines 86-87**. Found by
   partition P4. The record quotes: "That is a stricter, machine-checked
   discipline than "promote a useful handoff note to tracked," but it
   targets test/audit evidence." The phrase "promote a useful handoff
   note to tracked" appears in no source: not the row's Notion
   `Rationale` field for page `35c67c87082c81949063e8b6dd94980d`
   (verified via `dump_rows.py`), not `handoff/README.md`, not
   `docs/programs/cto-readiness/PROGRAM.md`. Evidence:
   `docs/decisions/records/DEC-20260510-A.md:86-87`; the parsed Notion
   row for page `35c67c87082c81949063e8b6dd94980d`;
   `handoff/README.md`; `docs/programs/cto-readiness/PROGRAM.md`.
2. **`docs/decisions/records/DEC-20260904-B.md`, line 101**. Found by
   partition P4. The record's Rationale reads: "Symmetry with the
   existing `--notion-` qualifier keeps one grammar for "where did this
   id's authority come from" rather than inventing a second mechanism."
   The phrase "where did this id's authority come from" appears in none
   of this record's six evidence entries. Evidence:
   `docs/decisions/records/DEC-20260904-B.md:101` and its `evidence`
   array.

Both items are corrected by `DEC-20260905-M`
(`docs/decisions/records/DEC-20260905-M.md`), which withdraws each
quotation-marked span without editing the record it corrects, per the
round's immutability rule, and adds a clause for round 12 and after: a
double-quoted span a record attributes to no source, and does not
present as the words of a row, file, page or person, is the record's
own wording and is judged as prose, not as a quotation. Round 10's P4
reviewer and round 3's reviewer had both already read item 2's phrase
as this record's own wording rather than a defect
(`archive/sessions/2026-09-05-m2-closing-review-round-10.md:589`,
`archive/sessions/2026-09-05-m2-closing-review-round-3.md:438`); round
11's P4 reviewer read both items 1 and 2 as real findings. `DEC-20260905-M`
withdraws both anyway, because the corpus must not depend on which
reading a given round's reviewer applies, and the new clause fixes the
reading for every later round.

VERDICT: FAIL
