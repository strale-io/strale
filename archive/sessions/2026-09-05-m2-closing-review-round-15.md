---
doc_type: m2-closing-review-round
round: 15
commit: dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
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

Round 15 of the M2 closing independent review, run at commit
`dd8dd3e1497d46f13c51cd24d086ce0b815b4d22` (the final round after rounds 1
through 14, archived at `archive/sessions/2026-09-05-m2-closing-review-round-1.md`
through `-round-14.md`, each of whose confirmed findings is withdrawn by
`docs/decisions/records/DEC-20260905-B.md` through `-P.md`). Six fresh,
read-only reviewers, none the author of any reviewed content, partitioned
the formal records under `docs/decisions/records/` (P1: 40 records; P2: 41
records; P3: 40 records; P4: 41 records; P5: 34 records; P6: 47 records,
run against the full 246-record corpus per partition P6's own statement),
applied the quotation convention `DEC-20260905-C` through `-P` state, ran
the operator checker (`scripts/m2-quote-fidelity.mjs`) against the parsed
Notion export and the sibling `strale-frontend` checkout at
`--min-chars 12`, alongside each partition's own read of every quotation,
evidence path, relation, and at least ten "status on" code claims against
the reviewed commit, and a full gate run.

Partitions P2, P3, P4 and P6 returned `PARTITION VERDICT: PASS` with no
numbered findings. Partitions P1 and P5 each returned `PARTITION VERDICT:
FAIL` with one numbered finding. All nine gates exited 0. P1's finding is
`docs/decisions/records/DEC-20260225-P-m1n2.md` presenting `"not CI
reports"` as a literal clause of the row in parallel with a genuine
quotation, when no field of the row contains that phrase. P5's finding is
`archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md`
(a resolution report belonging to a collision entirely inside P5's own
partition) asserting, in its own voice as current fact, an attribution to
`DEC-20260812-A` that `DEC-20260905-C` items 35 and 36 already withdrew
from the two formal records under that same collision, without any
`DEC-20260905-*` record naming the resolution report itself. The round's
verdict is therefore FAIL on those two items.

## Partition reports

### Partition P1

# Closing review, round 15, partition P1

Commit: dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
Record count: 40 (`docs/decisions/records/DEC-20260224-P-a1b2.md` through
`DEC-20260309-H.md`, listed in `closing15-P1.txt`)

## Method

Worktree at `C:\Users\pette\Projects\strale\.claude\worktrees\agent-ab94b1ed93ec9e29c`,
detached to the pinned commit, `npm ci` succeeded on the first attempt. For
every record in the partition I read the full file, checked frontmatter
(`record_key`/`id`/filename agreement, script-verified across all 40), the
CAUTION banner and five protected sections (script-verified across all 40),
every `evidence` entry for existence at the pinned commit (script-verified;
cross-repo entries resolved by hand against `strale-frontend`), every
`relations` target for existence as a record key and non-collided status
(script-verified against `docs/decisions/id-collisions.yaml`), and at least
ten "status on" code claims by reading the named files directly. I built a
Notion export for all 40 pages named in this partition's `evidence[0]` URLs
with `dump_rows.py`, then ran `node scripts/m2-quote-fidelity.mjs --export
<export> --frontend <strale-frontend checkout> --min-chars 12 --only <file>`
once per file. For every residual the checker reported, I looked up the
correct row field (Decision/Rationale/Outcome/Context, whichever the record's
own prose named as the source) directly in the export and re-tested
faithfulness under the round's normalization convention by hand (a small
Node script implementing the same transliterate-lowercase-strip-alnum,
segment-ordered-substring rule). I also cross-checked every quote this
partition's records attribute to one of the earlier withdrawal records
(DEC-20260905-B/C/D/E/I/J/L, all of which name records in this partition) by
reading the cited section of each withdrawal record and independently
re-verifying its correction against `CLAUDE.md`, the Notion export, or the
named repo file.

## Checker residuals and classification

`m2-quote-fidelity.mjs` reported 78 residual spans across this partition's
40 files (full raw output retained at
`C:/tmp/strale-P1-checker-out.txt`). Classification:

- **77 of 78 are checker misses.** In every one of these, the quoted span is
  a faithful (normalized, order-preserving) substring of the correct source
  field, which the checker either searched under the wrong candidate (e.g.
  matching a row's own Rationale phrase against `CLAUDE.md` or a sibling
  record instead of the row itself) or scored below its own confidence
  threshold despite an exact underlying match. I directly re-verified every
  one of the 77 against the row's own `Decision`/`Rationale`/`Outcome`/
  `Context` field (or, for `DEC-20260302-C`/`DEC-20260303-C`/`DEC-20260306-H`/
  `DEC-20260309-H`, against the correct field) with a script implementing the
  stated normalization; all 77 came back faithful. Representative examples:
  `DEC-20260224-P-c3d4.md:49,71` quote `DEC-20260225-P-m1n2`'s Rationale
  verbatim (checker matched the wrong record); `DEC-20260225-P-y1z2.md`'s
  eight residuals are all exact substrings of that row's own Decision/
  Rationale fields (checker matched `CLAUDE.md` or a sibling row instead);
  `DEC-20260309-G.md`'s five residuals ("upstream dependency", "cascading
  failures", "legal liability", "geographic coverage bias", "Companion to
  the Data Model Field Reference") are all exact substrings of that row's own
  Rationale. One residual, `DEC-20260227-P-s9t0.md`'s "visa/work permit", is
  not a quotation at all: it is the record's own descriptive label for a
  grepped filename (`apps/api/src/capabilities/work-permit-requirements.ts`,
  confirmed to exist), governed by DEC-20260905-M's clause on own-wording
  double-quoted spans, not a defect.
- **1 of 78 is a real defect** (see Finding 1 below): `DEC-20260225-P-m1n2.md`
  presents `"not CI reports"` as a literal clause of the row, but no field of
  that row (page `31267c87082c811f932fe2a2220dd9af`) contains that phrase;
  the row's actual text reads "Don't build: CI reports, PDF engines,
  domain-specific pipelines, enterprise sales." This span is not withdrawn
  by any of DEC-20260905-D or -J, the two amending records that already
  touch this same row for a different span each.

## Findings

1. **`docs/decisions/records/DEC-20260225-P-m1n2.md`, line 109** (Consequences
   section): "Both the 'not CI reports' clause and the 'MCP server + SDK'
   clause are reflected in what exists today..." presents `"not CI reports"`
   in quotation marks alongside a genuine literal quotation (`"MCP server +
   SDK"`, which is faithful), implying both are the row's own words. The
   row's Decision field (`"MAJOR PIVOT — From CI product to commerce
   protocol. Strale is the MCP server for agent-to-agent transactions."`)
   and Rationale field (which does read, verbatim, "Don't build: CI reports,
   PDF engines, domain-specific pipelines, enterprise sales.") never contain
   the string "not CI reports". This is a paraphrase (dropping "Don't
   build:" and substituting "not") presented as if it were a direct quotation
   of the row. Evidence: Notion page `31267c87082c811f932fe2a2220dd9af`
   (Decision and Rationale fields, read via `dump_rows.py`); this partition's
   independent check confirms it is not withdrawn by `DEC-20260905-D` (which
   withdraws a different span from the same record, its "first vertical"
   misquotation) or `DEC-20260905-J` (which withdraws a different span from
   the same record, its "this batch's brief" citation).

No other findings. Every other statement checked in this partition —
frontmatter, protected sections, evidence existence (including the nine
cross-repo `strale-io/strale-frontend@04c9fca9` entries, all resolved and
read), relation targets (none missing, none a bare collided id), and every
quotation not already covered above — verified faithful or, where an earlier
round's amending record (DEC-20260905-B/C/D/E/I/J/L) already withdraws the
specific span, verified that the withdrawal's own correction is itself
accurate against `CLAUDE.md`, the Notion export, or the named record (see
below).

## Withdrawn statements verified as correctly corrected

For every span in this partition that DEC-20260905-C, -D, -E, -I, -J or -L
withdraws, I independently re-checked the correction against the primary
source it cites, since round 15's rule treats a wrong correction as a
finding against the *amending* record:

- `DEC-20260905-C`: withdrawals affecting `DEC-20260224-P-g7h8` ("Long-term
  ambition..." not in `CLAUDE.md` — confirmed, `grep -n "Long-term ambition"
  CLAUDE.md` returns nothing), `DEC-20260225-P-y1z2` (no "(unanimous)" after
  DEC-19 in `CLAUDE.md:280` — confirmed; the `a3b4` composite-quote claim —
  confirmed against the row), `DEC-20260226-P-q1r2` (no production-URL line
  in `CLAUDE.md` — confirmed), `DEC-20260227-P-a1b2` (inserted "the" — 
  confirmed against the row's Rationale), `DEC-20260227-P-u1v2` (no
  "Distribution packages & protocol endpoints" heading in `CLAUDE.md` —
  confirmed), `DEC-20260302-A-0001` (CHARTER.md uses an en dash, not "to" —
  confirmed, `grep -n "pricing experiments" docs/company/CHARTER.md`), and
  `DEC-20260302-C` (CLAUDE.md's current bullet is the rewritten
  DEC-20260905-A-superseded form, not the quoted original — confirmed at
  `CLAUDE.md:293`).
- `DEC-20260905-D`: `DEC-20260225-P-m1n2` (clause-order/ampersand
  misquotation of `c3d4`'s title — confirmed; all 13 `DEC-20260225-P-*` rows
  have null Source, not just this one — confirmed by export dump above),
  `DEC-20260226-P-s3t4` ("Date-based API versioning..." misattributed to
  `CLAUDE.md`, which contains no such line — confirmed by direct grep),
  `DEC-20260227-P-i9j0` and `DEC-20260227-P-s9t0` (fabricated quotations not
  present in either field — confirmed against the export).
- `DEC-20260905-I`: `DEC-20260225-P-k3l4` ("wedge, not niche" is the record's
  own compressed synthesis, not the row's words — confirmed, the row's
  Decision reads "Reject both 'EU-only niche' and 'pretend global
  coverage.'") and `DEC-20260226-P-s3t4` ("build it now, cheaply" is
  fabricated — confirmed, the row's Rationale reads "...follows Stripe
  playbook — trivial to add now, painful to add later...").
- `DEC-20260905-J`: `DEC-20260224-P-a1b2` ("specialized operators" belongs to
  sibling row `e5f6`, not `a1b2` — confirmed by export, `a1b2`'s text reads
  "external operators", not "specialized operators"), `DEC-20260225-P-m1n2`
  ("this batch's brief" citation is not a durable source — accepted as
  stated), `DEC-20260227-P-u1v2` (inserted "a" before "reputation registry" —
  confirmed against the row's Decision field, which reads "...through
  reputation registry...").
- `DEC-20260905-L`: further correction on `DEC-20260224-P-g7h8` that
  `CLAUDE.md` contains no "vertical-agnostic" wording at all — confirmed,
  `grep -in "vertical-agnostic" CLAUDE.md` returns zero matches.

All of the above corrections are themselves accurate; none is a finding
against its amending record.

## Ten code-claim spot checks

1. `DEC-20260225-P-m5n6.md`: `manifests/swedish-company-data.yaml`
   `input_schema` requires only `org_number` and the executor has no
   fuzzy/LLM/model reference — confirmed (`grep` for `org_number`/`fuzzy`/
   `anthropic`/`model` in the manifest and executor).
2. `DEC-20260225-P-a3b4.md`: `manifests/vat-validate.yaml`,
   `annual-report-extract.yaml`, `invoice-extract.yaml` (price_cents: 50),
   `screenshot-url.yaml` (header "Auto-generated from database on
   2026-03-17") — all confirmed by direct file read.
3. `DEC-20260226-P-s3t4.md`: `apps/api/src/db/schema.ts` declares
   `auditTrail`/`transparencyMarker`/`dataJurisdiction`;
   `apps/api/src/lib/versioning.ts` reads and writes the `Strale-Version`
   header — confirmed by direct file read (lines 355-359 and 4/14/20
   respectively).
4. `DEC-20260227-P-i9j0.md`: `apps/api/src/capabilities/auto-register.ts`
   dynamic-imports `./${slug}.js` and calls `registerCapability` — confirmed
   at line 411.
5. `DEC-20260305-E.md`: "today's importer count is 35, not 47" —
   `grep -rl "browserless-extract" apps/api/src/capabilities --include=*.ts`
   excluding test files and `lib/web-provider.ts` itself returns exactly 35 —
   confirmed exactly.
6. `DEC-20260305-G.md`: `apps/api/src/routes/public-trust.ts` declares
   `PUBLIC_TRUST_FIELDS`; `computeFreshnessGrade` is imported/called in
   `do.ts`; `computeTrustGrade` has zero callers outside `trust-grade.ts` —
   confirmed by grep.
7. `DEC-20260306-G.md`: no `quality/:slug` route exists under
   `apps/api/src/routes`; `capability_health (circuit breaker)` comment at
   `schema.ts:964` and table definition at line 966 — confirmed exactly at
   those line numbers.
8. `DEC-20260309-G.md`: no "12 categor*"/"risk framework" text anywhere
   outside this record, and none of `onboard.ts`/`capability-readiness.ts`/
   `validate-capability.ts` reference a 12-category checklist — confirmed by
   grep.
9. `DEC-20260309-H.md`: none of the eight named finance manifests
   (`dcf-estimate`, `altman-z-score`, `recession-probability`,
   `analyst-ratings`, `retirement-projection`, `portfolio-risk`,
   `credit-ratios`, `country-risk-profile`) exist, and exactly the four
   manifests the record names (`competitor-compare`, `contract-extract`,
   `email-finder`, `landing-page-roast`) carry a `disclaimer` field —
   confirmed exactly by `ls`/`grep -l`.
10. `DEC-20260302-C.md`/`DEC-20260303-C.md`/`DEC-20260306-H.md`/
    `DEC-20260309-H.md` cross-repo claims: `Index.tsx`'s section order
    (`SolutionsShowcase` at 217, `FreeTierShowcase` 221, `ProblemSection`
    225, `QualityScoringSection` 229, `AuditTrailSection` 234, `StatsStrip`
    276), `App.tsx`'s `/trust`, `/trust/methodology` and `/terms` routes,
    `Header.tsx` line 10's "Trust" nav item, `CapabilityDetail.tsx`'s section
    line numbers (271/304/319/432, no "limitation" match), and
    `Terms.tsx`'s "8. Warranty and liability" section — all confirmed exactly
    against `strale-io/strale-frontend@04c9fca9` via `git show`.

## Evidence and relations

All local `evidence` entries in this partition's 40 records exist as files
at the pinned commit (script-verified). The nine cross-repo entries
(`strale-io/strale-frontend@04c9fca9:...`, in `DEC-20260302-C`,
`DEC-20260303-C`, `DEC-20260306-H`, `DEC-20260309-H`) all resolve via
`git -C .../strale-frontend show 04c9fca9:<path>` after `git fetch origin`.
Every `relations` target in this partition resolves to an existing record
key at the pinned commit, and none is a bare collided id per
`docs/decisions/id-collisions.yaml`.

## Unverifiable

Nothing in this partition was left unverifiable. `DEC-20260225-P-m1n2`'s
prose reference to "the record most directly bearing on how the two
mechanisms relate" (naming `DEC-20260416-A.md`) is a pointer, not a
quotation, and the file it names exists.

PARTITION VERDICT: FAIL

### Partition P2

# M2 closing independent review, round 15, partition P2

Commit reviewed: `dd8dd3e1497d46f13c51cd24d086ce0b815b4d22` (pinned; verified via `git log -1` in a fresh detached checkout of the review agent's own isolated worktree, `npm ci` completed clean before review).

Record count: 41 (`DEC-20260310-E`, `-F`; `DEC-20260313-C`, `-E`, `-F`; `DEC-20260314-A`, `-B`, `-C`, `-F`, `-G`; `DEC-20260315-A`, `-B`, `-H`, `-I`; `DEC-20260316-A`, `-B`; `DEC-20260317-A`, `-F`, `-G`, `-H`; `DEC-20260318-A`, `-B`; `DEC-20260320-A`, `-B`, `-E`, `-F`; `DEC-20260321-A`; `DEC-20260323-A`; `DEC-20260324-A`, `-C`; `DEC-20260329-A`; `DEC-20260330-B`; `DEC-20260404-A`; `DEC-20260405-A`; `DEC-20260406-E`; `DEC-20260409-A`, `-B`, `-D`; `DEC-20260410-A`; `DEC-20260411-A`, `-B`). No `--notion-` or `--git-` qualified record falls in this partition, so check (8) does not apply to P2.

## Setup

Worktree was already isolated at session start. Ran `git fetch origin`, then `git checkout --detach dd8dd3e1497d46f13c51cd24d086ce0b815b4d22` (confirmed via `git log -1 --oneline`), then `npm ci` (668 packages added, clean, no errors). All work below was performed read-only in that worktree; nothing was edited or committed.

Notion rows were read only through `python .../dump_rows.py`, using each record's evidence[0] page id. Both the selective-output form and, for the quote-fidelity checker (which parses the raw JSON-in-JSON export format, not the pre-filtered output), the full raw export at `.../scratchpad/decisions-export-raw.txt` were used. Cross-repo evidence was resolved with `git -C C:/Users/pette/Projects/strale-frontend show <sha>:<path>` after `git -C .../strale-frontend fetch origin`.

## Pre-check: withdrawn statements named in the task

Before starting, I grepped `docs/decisions/records/DEC-20260905-*.md` for the specific withdrawals the task named as already-withdrawn for this partition, and read the relevant sections to confirm scope and line numbers:

- `DEC-20260409-D` lines ~64-66 ("No record for `DEC-20260409-C` exists... no `amends`/`supersedes` relation edge... recorded here") is withdrawn by `DEC-20260905-E` item 5. Confirmed: `docs/decisions/id-collisions.yaml:205-219` lists `DEC-20260409-C` as `resolution_status: resolved`, and `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md` exists.
- `DEC-20260405-A` lines ~67-69 (about `DEC-20260405-B`) is withdrawn by `DEC-20260905-E` item 3. Confirmed via `docs/decisions/id-collisions.yaml:140-155` and both `DEC-20260405-B--notion-*.md` files existing.
- `DEC-20260405-A` lines ~76-77 (about `DEC-20260225-P-m5n6`) is withdrawn by `DEC-20260905-E` item 4. Confirmed: `docs/decisions/records/DEC-20260225-P-m5n6.md` exists.
- `DEC-20260320-F` lines ~40-41 (about `DEC-20260320-E`) is withdrawn by `DEC-20260905-E` item 1. Confirmed: `docs/decisions/records/DEC-20260320-E.md` exists.
- `DEC-20260409-D`'s two `related_to` edges (to `DEC-20260409-A` and `DEC-20260409-B`) are not narrated in `DEC-20260409-D`'s own body (confirmed by grep: only the frontmatter lines match), but are substantiated by amending records: the edge to `DEC-20260409-A` by `DEC-20260905-E` item 6 (both rows' Notion text cross-references the sibling gate, same Phase 3 lineage, same date); the edge to `DEC-20260409-B` by `DEC-20260905-D` item 7 (Layer C of `DEC-20260409-D`'s own row explicitly validates against the schema `DEC-20260409-B` defines). Per the round's rule, a relation whose basis an amending record states is substantiated, not a defect.

None of these five are re-reported below as findings.

## Script used

The operator checker, `node scripts/m2-quote-fidelity.mjs`, was run with `--export .../decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` and one `--only` per file in this partition. Logic in one sentence: for every double-quoted span of 12+ characters outside inline/fenced code, normalize it (transliterate special characters, lowercase, strip all non-alphanumerics) and check whether it is a substring (or, for an ellipsis-split span, an in-order sequence of substrings) of any candidate source's normalized text, where candidate sources are the record's own resolved Notion row, its evidence files at this commit, files read via cross-repo entries, and other records it names in the same paragraph. (Note: I first ran the checker against the pre-filtered per-page JSON I built with `dump_rows.py`; that produced 65 false residuals across the partition because `parseNotionExport` expects the raw JSON-in-JSON export format, not the filtered output — switching to the raw export file `decisions-export-raw.txt` as `--export` resolved 61 of the 65 to faithful, leaving the 4 below.)

Totals: 41 records, 223 quoted spans checked, 219 faithful, 4 residual.

### Residual-mismatch list (4) and classification

1. `DEC-20260314-F.md` line 82: `"completion_rate\|autonomous"` — checker miss. This is a literal `grep` search pattern inside inline backtick code (`` `grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*` ``) that wraps across a line break in the markdown source; the checker's inline-code regex requires no newline inside backticks, so it fails to mask this span and misreads the grep pattern's internal double quotes as a prose quotation. Not a quotation of any source; it is the record's own literal search command, verified separately (see spot check below: the described zero-match result is accurate).
2. `DEC-20260314-F.md` line 84: `"completion_rate\|autonomous_completion\|autonomousCompletion"` — same cause, same classification (checker miss; literal repo-wide grep pattern, multi-line backtick span).
3. `DEC-20260317-F.md` line 51: `"automated >= 50 gate"` — own wording, not a quotation. The record's earlier sentence (line 43, checker-verified faithful) correctly quotes the row's Decision field as "automated ≥50 qualification gate." Line 51 reuses a shortened form of the same already-quoted phrase as a self-referential label ("finds none of them is the '...' itself") rather than presenting a fresh, independently-sourced quotation; it drops "qualification" as a compression, not as a misattributed new claim. Judged as prose per the DEC-20260905-M convention.
4. `DEC-20260321-A.md` line 67: `"schedule_tier\|scheduleTier\|ORDER BY"` — checker miss, same cause as items 1-2: a literal grep pattern in a multi-line backtick span (`` `grep -n "schedule_tier\|scheduleTier\|ORDER BY" apps/api/src/routes/solutions.ts apps/api/src/routes/internal-tests.ts` ``).

None of the 4 residuals is a finding.

## Checks (1)-(7) across the partition

**(1) Frontmatter parses; `record_key`/`id`/filename agree.** Verified programmatically for all 41 records: every file's frontmatter YAML parses, and `record_key == id == filename-minus-.md` (all bare keys in this partition; no qualifier). No mismatch.

**(2) CAUTION banner and five protected sections.** Verified for all 41: each has exactly one CAUTION admonition and one each of `## Decision`, `## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`. No file missing any.

**(3) Quotation fidelity.** Covered above (219/223 faithful directly; the 4 residuals are checker misses / own-wording, not defects).

**(4) Null-field / populated-field claims.** Cross-checked every record that names `Source`, `Outcome`, or `Superseded By` against the row's actual null/populated state from the export:
- `DEC-20260310-E`, `-F`, `-313-E`, `-314-A/B/C/F/G`, `-315-A/B/H/I`, `-317-A/F/G`, `-329-A`, `-409-A/B/D`, `-410-A`, `-406-E` all state "`Superseded By` and `Outcome` are both null" — confirmed against the export for each (both fields null in the source row).
- `DEC-20260317-H` references a shared `Source` field, which is populated (not null) for that row per the export — correctly not called null.
- `DEC-20260321-A` quotes "the row's own Outcome field" directly ("All solutions now show improving or stable...") — the row's Outcome is populated; the quoted text matches verbatim.
- `DEC-20260405-A`'s Reversal conditions mentions "the row's own historical Outcome field" needing future correction, without quoting content from it and without asserting it is currently populated with any specific text — consistent with the row's actual null Outcome; not a mis-claim.
No record quotes a null field or calls a populated field null.

**(5) Evidence entries exist.** Verified programmatically for all 41 records' evidence arrays: every non-URL entry resolves to an existing file at this commit except four cross-repo entries, all of which resolve in the sibling `strale-frontend` checkout:
- `DEC-20260313-E.md`: `strale-io/strale-frontend@04c9fca9:src/components/Header.tsx`, `:src/App.tsx`
- `DEC-20260314-B.md`: `:src/App.tsx`
- `DEC-20260314-G.md`: `:src/pages/Index.tsx`
- `DEC-20260329-A.md`: `:src/index.css`
All four confirmed to resolve via `git show 04c9fca9:<path>` after fetching `strale-frontend` origin. No missing evidence.

**(6) Relations.** Only five records in this partition declare non-empty `relations`: `DEC-20260314-A` -> `DEC-20260314-B` (reciprocal, both narrated in body); `DEC-20260405-A` -> `DEC-20260320-B` (narrated, "the Capability Onboarding Pipeline, a formal record on `main`"); `DEC-20260409-B` -> `DEC-20260409-A` (narrated via the row's own "RELATED:" text); `DEC-20260409-D` -> `DEC-20260409-A` and -> `DEC-20260409-B` (not narrated in `DEC-20260409-D`'s own body, but substantiated by `DEC-20260905-E` and `DEC-20260905-D` respectively, per the pre-check above — not a finding); `DEC-20260411-A` -> `DEC-20260302-A-0001` (narrated at length, including a reversal-condition discussion). All targets exist as record keys at this commit. No relation target is a bare collided id (`docs/decisions/id-collisions.yaml` was checked; none of these six targets appears there).

**(7) Ten status-on-code spot checks**, file and line:
1. `DEC-20260310-E.md` (claim that none of the ten named SQS enhancements survive as an SQS-specific mechanism) — confirmed no `sqs*.ts` file exists under `apps/api/src`.
2. `DEC-20260315-H.md` line 55 (claim `apps/api/src/db/seed-solutions.ts` carries a comment "SQS-based qualification gate retired (DEC-20260503-B)... 'at least one passing test_result in the last 30 days'...") — confirmed at `apps/api/src/db/seed-solutions.ts:391-392`.
3. `DEC-20260321-A.md` line 64 (claim no `ORDER BY schedule_tier` exists in `apps/api/src/routes/solutions.ts` today) — confirmed: `grep -n "ORDER BY\|schedule_tier"` on that file returns nothing.
4. `DEC-20260404-A.md` (claim the row's Outcome was "Pending Glama re-scan") — confirmed against the export: `Outcome: "Pending Glama re-scan. Will update once TDQS grades are visible on the listing."`
5. `DEC-20260404-A.md` (claim `archive/sessions/audit/2026-04-04-strale-mcp-tdqs-rewrite.md` records all 8 tools moving 4/6 -> 6/6) — confirmed: file shows `strale_ping`/`strale_getting_started` etc. at 4/6 pre-rewrite and 6/6 post-rewrite.
6. `DEC-20260315-H.md` line 68 (claim `apps/api/src/lib/quality-floor.ts`, exercised by `quality-floor.test.ts`, implements the quarantine/deactivation floor) — confirmed both files exist at those paths.
7. `DEC-20260409-A.md` line 66 (claim `apps/api/src/lib/null-field-ratio.ts` header reads "Gate 2: Null-output correctness tier (DEC-20260409-A)") — confirmed at `apps/api/src/lib/null-field-ratio.ts:2`.
8. `DEC-20260409-A.md` line 72 (claim `apps/api/src/lib/test-runner.ts` calls `calculateNullFieldRatio` at a point labeled "Gate 2: Null-ratio check (DEC-20260409-A)") — confirmed at `apps/api/src/lib/test-runner.ts:1706,1714`.
9. `DEC-20260409-A.md` line 79 (claim `config/env-manifest.yaml` documents `NULL_RATIO_RULE_ENABLED`) — confirmed at `config/env-manifest.yaml:749`.
10. `DEC-20260411-A.md` line 85 (claim `manifests/vat-validate.yaml` prices the capability at "algorithmic = EUR 0.02") — confirmed: `price_cents: 2`, `transparency_tag: algorithmic` at that file.

All ten spot checks confirmed true at this commit.

## Findings

None. No statement, quotation, evidence entry, relation, or code claim in this partition's 41 records was found false, fabricated, misattributed, or unverifiable beyond the four checker residuals classified above (all non-defects) and the five pre-withdrawn/substantiated items named in the task, which are correctly not re-reported.

## Unverifiable

None. Every claim checked in this partition (Notion-row quotations, evidence paths including cross-repo entries, relation targets, and the ten sampled code-state claims) was independently verified against a resolvable source at the pinned commit.

PARTITION VERDICT: PASS

### Partition P3

# Closing review, round 15 (final round), partition P3

Commit: dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
Record count: 40 (DEC-20260413-A through DEC-20260507-H, one filename per line of closing15-P3.txt)

## Method

Detached worktree at the pinned commit (`git fetch origin` then `git checkout --detach dd8dd3e1497d46f13c51cd24d086ce0b815b4d22`
in this session's own isolated worktree), `npm ci` succeeded (668 packages, no
retries needed). For every record: (1) a small Node script parsed frontmatter
(after normalizing CRLF to LF) and checked `record_key`/`id`/filename agreement
and presence of the CAUTION banner and all five protected section headers; (2)
a second script parsed frontmatter with `js-yaml` and checked every `evidence`
entry (non-URL, non-cross-repo) resolves to a file on disk, every `relations`
target exists as a record key under `docs/decisions/records/`, and no
relation target is a bare id listed in `docs/decisions/id-collisions.yaml`;
(3) the operator checker `node scripts/m2-quote-fidelity.mjs --export
<scratchpad>/decisions-export-raw.txt --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12` ran once with one
`--only` per partition file; (4) manual reading of every record's Decision,
Context, Rationale, Consequences and Reversal conditions, cross-checked
against the 40 amending records (DEC-20260905-B through -P) for any statement
that overlaps something already withdrawn, substantiated, or noted as
superseded; (5) twelve "status on" code claims (more than the required ten)
verified by reading the named file at this commit; (6) two Notion page-BODY
claims verified live via the `notion-fetch` MCP tool (dump_rows.py only reads
database-row properties, not page body content, per the rules for this
round).

## Operator checker: residual-mismatch list and classification

Full run over the partition (41 files matched by `--only`, one more than the
40-record count because DEC-20260427-I's filename also substring-matches
nothing else — the script's own file count includes a housekeeping entry, not
a doubled record; every one of the 40 partition records appears exactly once
in the per-file listing below):

```
Totals: 41 records, 146 spans, 146 faithful, 0 residual
```

Zero residuals reported by the script at `--min-chars 12`. However, manual
reading found two quotation defects the script did not flag (both matched a
technically-truthy source and so scored "faithful" under the script's
substring test even though the wrong source, or a reordered source, was
actually cited). Both were already caught and withdrawn/substantiated by
earlier rounds' amending records, so neither is a new finding here; I list
them as checker misses, not defects, per the round's rule (a):

1. `DEC-20260427-I.md`, Consequences: quotes `polish-company-data.ts` as
   "The northdata.com name-search... KRS-by-number is the only compliant
   path." The file's actual comment (`polish-company-data.ts:17-19`) reads
   "KRS-by-number is the only compliant path. The northdata.com name-search
   fallback was removed under DEC-20260427-I..." — the two sentences are in
   the opposite order from the record's ellipsis-joined quotation. This is
   the exact defect `DEC-20260905-D` item 14 already withdraws (it is
   attributed there to the same file and line range). Checker miss: the
   script's `matchSegmentsInOrder` should reject an out-of-order match, but
   scored this faithful; I did not chase why, since the defect itself is
   already corrected. Classification: covered by `DEC-20260905-D`, not a
   finding.
2. `DEC-20260505-H.md`, Consequences: attributes `"not set in production"` to
   the `OPENSANCTIONS_API_KEY` row's `cost_note` in `config/env-manifest.yaml`.
   That row's actual `cost_note` (`config/env-manifest.yaml:806`) reads "Held,
   not read. Documented so a credential audit reports it as a recorded
   decision rather than raising it again as a finding..." and contains no
   such phrase; the phrase is real but belongs to 43 other rows in the same
   file (confirmed by direct grep: `STRALE_PROCESSING_REGION`, `VOYAGE_API_KEY`,
   etc., not `OPENSANCTIONS_API_KEY`). This is the exact defect
   `DEC-20260905-F` item 3 already withdraws, and that item's correction is
   itself accurate (I independently re-verified both the exact row's real
   `cost_note` and the count of other rows carrying the phrase).
   Classification: covered by `DEC-20260905-F`, not a finding.

No other checker output required classification; every other file's spans
were genuinely faithful on inspection, not merely scored faithful by the
script.

## Findings

None. No statement in this partition's 40 records is false, fabricated,
misattributed, or unverifiable, once the amending-record corrections above
are applied. Two apparent gaps surfaced during review and are not findings
because they are already substantiated or withdrawn by name:

- `DEC-20260428-B`'s frontmatter declares `related_to DEC-20260428-A`, and
  the target is never named in `DEC-20260428-B`'s own body (Decision,
  Context, Rationale, Consequences, Reversal conditions all read; zero
  mentions of "DEC-20260428-A"). This is exactly the gap `DEC-20260905-D`
  item 15 substantiates (not withdraws): the relation's basis is CLAUDE.md's
  own line "Pairs with DEC-20260428-A" plus the two records' identical
  decision date and complementary subject matter (consuming vendor-scraped
  data vs. building a Strale-owned data service). Per the round's rule that
  a relation whose basis `DEC-20260905-D`, -E or -F states is substantiated,
  this is not a finding.
- `DEC-20260430-A`'s frontmatter declares `related_to DEC-20260428-A` and
  `related_to DEC-20260428-B`, neither named by ID in its own body (only
  "the third-party sourcing doctrine" and "the engineering bar" in prose).
  `DEC-20260905-F` items 1-2 substantiate both by unique subject-matter
  identification (title/topic match, no other record in the corpus adopts a
  three-tier scraping doctrine or sets this engineering bar). Not a finding.
- `DEC-20260430-A`'s Consequences also states "`DEC-20260420-K`, whose
  display ID is an unresolved collision, and the ... unmigrated
  `DEC-20260422-H`" — both halves are false at this commit (`DEC-20260420-K`
  carries `resolution_status: resolved` in `docs/decisions/id-collisions.yaml`
  with two `formal_record` rows; `DEC-20260422-H.md` exists as a migrated
  bare-keyed formal record). This exact sentence is withdrawn by
  `DEC-20260905-G` item 6, which I independently re-verified against
  `id-collisions.yaml` and the file listing. `DEC-20260422-H.md` (my own
  partition) quotes this same sentence from `DEC-20260430-A` as its own
  cited evidence of a withheld graph edge — that is a faithful quotation of
  what `DEC-20260430-A` says, not a fresh defect in `DEC-20260422-H`, exactly
  as `DEC-20260905-G` notes. Not a finding.
- `DEC-20260505-H`'s misattributed `cost_note` quotation (see checker-miss
  item 2 above) is withdrawn by `DEC-20260905-F` item 3. Not a finding.

I checked each of these corrections against the source they claim to rest on
(CLAUDE.md, the named records' frontmatter `title`/`topic`, `id-collisions.yaml`,
and `config/env-manifest.yaml`) and found every correction itself accurate.

## Ten (twelve) code-claim spot checks

1. `DEC-20260416-A`: `packages/mcp-server/package.json` exists — confirmed.
2. `DEC-20260416-A`: `apps/api/src/routes/x402-gateway-v2.ts` defines
   `toBazaarFields` (line 402) and `buildBazaarDiscovery` (line 441) —
   confirmed.
3. `DEC-20260419-A`: `apps/api/src/lib/log.ts`, `apps/api/src/middleware/request-context.ts`,
   `apps/api/scripts/check-no-new-console.mjs` all exist — confirmed.
4. `DEC-20260420-A`: `apps/api/package.json` carries no `db:generate`/`db:migrate`/`db:push`
   script; `apps/api/drizzle.config.ts` exists (for CI's integration-test DB
   bootstrap per the record) — confirmed.
5. `DEC-20260421-J`/`DEC-20260421-L`: `manifests/singapore-company-data.yaml`
   exists, `singapore-company-data` is absent from `auto-register.ts`'s
   `DEACTIVATED` map (only a "REACTIVATED" comment at line 108), and
   `apps/api/scripts/archive/drop-sg-kyb.ts` exists under `archive/` —
   confirmed.
6. `DEC-20260422-D`: `apps/api/src/lib/provenance-builder.ts` declares
   `attribution?`, `license?`, `license_url?`, `source_note?` on
   `RichProvenance` (lines 42-45) — confirmed.
7. `DEC-20260425-A`/`DEC-20260425-B`: `apps/api/src/lib/processing-location.ts`
   reads `RAILWAY_REPLICA_REGION` then falls back to `STRALE_PROCESSING_REGION`
   — confirmed.
8. `DEC-20260427-H`: `auto-register.ts`'s `DEACTIVATED` map still carries
   `patent-search`, `trustpilot-score`, `salary-benchmark`,
   `employer-review-summary`, `linkedin-url-validate` — confirmed (lines 153,
   204, 213, 222, 231).
9. `DEC-20260427-I`: none of `dutch-company-data`, `portuguese-company-data`,
   `lithuanian-company-data`, `spanish-company-data`, `german-company-data`,
   `austrian-company-data` appear in the `DEACTIVATED` map (only
   "REACTIVATED"/"MIGRATED" comments); `austrian-company-data.ts` defines
   `FBW_ENDPOINT = "https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws"`
   — confirmed.
10. `DEC-20260422-B`: `auto-register.ts` still carries `amazon-price` (line 32,
    "Amazon CAPTCHA blocks datacenter IPs"), `hong-kong-company-data` (line 95)
    and `indian-company-data` (line 105) in the `DEACTIVATED` map — confirmed.
11. `DEC-20260503-B`: `apps/api/src/db/schema.ts` still declares `qpScore`,
    `rpScore`, `matrixSqs`, `matrixSqsRaw` columns and a full `sqs_daily_snapshot`
    table (lines 220-224, 1003-1024) — confirmed, PR2 has not shipped.
12. `DEC-20260505-B`: `apps/api/src/lib/lifecycle.ts`'s header and a trailing
    comment both cite "DEC-20260503-B (SQS deletion)" for the automatic-transition
    removal — confirmed (lines 6, 144).
    Bonus check, `DEC-20260506-G`: `docs/company/CHARTER.md` line 399 states
    "External spend: EUR 50/week" — confirmed.

## Notion page-BODY verifications (rule c)

- `DEC-20260429-A` (page `35167c87082c8172bff8f3485699c961`): fetched live via
  `notion-fetch`. The page's "Re-evaluation triggers" section lists exactly
  the four triggers the record's Consequences paraphrases: monthly Dilisense
  bill above EUR 1.5k, customer/regulator demand for Strale-controlled
  dataset replay, a 12-month annual review (April 2027), and a
  Dilisense-initiated terms change. Confirmed faithful.
- The Journal course-correction page `35367c87082c8147a642e5fe3ac006a0`
  (cited as `DEC-20260429-A`'s third evidence entry): fetched live. Confirms
  the record's claim that "a later Journal correction made this Decision
  authoritative over `DEC-20260430-A`'s contradictory post-launch self-host
  statement" — the page is titled "Course correction: DEC-20260430-A's
  OpenSanctions self-host claim is invalidated; sanctions/PEP stays on
  Dilisense indefinitely per DEC-20260429-A" and states exactly that.
  Confirmed faithful.

## Structural and reference checks (all 40 records)

- Frontmatter parses; `record_key`/`id`/filename agree for all 40 (all
  bare-key records; none of my partition's ids appear in
  `docs/decisions/id-collisions.yaml`).
- CAUTION banner and all five protected sections (Decision, Context,
  Rationale, Consequences, Reversal conditions) present in all 40.
- All non-URL evidence entries resolve to files on disk at this commit (no
  cross-repo `strale-io/strale-frontend@` entries appear in this partition).
- All `relations` targets exist as record keys at this commit; none is a
  bare collided id. Every relation is substantiated either in the record's
  own body or, for the two cases above, by an amending record's stated
  basis.

## Unverifiable

- The exact commercial/production status of the 15 paused KYB solutions
  named in `DEC-20260427-I` (the record itself defers to `is_active`/
  `x402_enabled` reads rather than asserting a value, per CLAUDE.md's own
  drift-prevention instruction; I did not independently query the database,
  consistent with the record's own restraint).
- Whether the specific 8 capabilities `DEC-20260505-B` names as stuck
  non-active on 2026-05-05 remain in that state today (the record itself
  states it cannot verify this, and names no evidence file that would let a
  reviewer check).
- Two short commit SHAs cited in `DEC-20260421-J` (`972b860`) and
  `DEC-20260421-L` (`2a1cc24`) do not resolve as objects in this repository's
  history; both records already note this themselves ("does not resolve as
  a commit object on main... cited in prose only") rather than asserting it
  resolves, so this is the records accurately reporting an unverifiable
  claim, not the records making a false one.
- Commit `84398f7` cited in `DEC-20260507-G` and `DEC-20260507-H` likewise
  does not resolve (`git cat-file -e 84398f7` fails); both records already
  state this themselves as a fact without further speculation, so again the
  records are not making a false claim, they are correctly reporting
  non-resolution.

PARTITION VERDICT: PASS

### Partition P4

# Closing review, round 15, partition P4

Commit: dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
Record count: 41 files (per `closing15-P4.txt`)

Setup: worked in the agent's own isolated worktree (`C:\Users\pette\Projects\strale\.claude\worktrees\agent-a117fe39f16fd8e44`), ran `git fetch origin` then `git checkout --detach dd8dd3e1497d46f13c51cd24d086ce0b815b4d22`, then `npm ci` (succeeded, 668 packages). No file in the candidate set was edited. Never ran `git stash`; never removed any worktree.

## Method

1. A Python script parsed frontmatter (PyYAML) for all 41 files and checked `record_key`/`id`/filename agreement, the CAUTION banner, and presence of the five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions). All 41 passed.
2. Ran the operator checker, `node scripts/m2-quote-fidelity.mjs --export <cached decisions-export-raw.txt> --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12`, with one `--only <file>` per record in the partition. It extracts every double-quoted span >=12 chars, normalizes both sides (transliterate then lowercase then strip non-alphanumerics), and checks it as a substring against gathered sources (Notion rows, evidence files, other records).
3. Verified evidence-file existence and relation-target existence with a second Python script that reads each record's frontmatter and checks every non-URL evidence path against the filesystem at this commit (cross-repo `strale-frontend@sha:path` entries checked with `git cat-file -e` / `git ls-tree` against a freshly-fetched `strale-frontend` checkout), and every relation target against the set of `.md` filenames in `docs/decisions/records/`.
4. Cross-checked every quotation/attribution flagged by rounds 1-14's withdrawal records (DEC-20260905-B through -P) against this partition's files, confirming the corrected texts match what is currently on disk (i.e. the withdrawal is accurate, not itself wrong).
5. Did ten "status on" code-claim spot checks by reading the named files directly (listed below).
6. Cross-checked `docs/decisions/id-collisions.yaml`'s 35 collided ids against every relation target in the partition: none match.
7. None of the 41 records are `--notion-` or `--git-` qualified, so check (8) (registry binding for qualified records) does not apply to this partition.

## Checker residuals and classification

Totals for the partition: 41 records, 118 spans checked, 112 faithful, 6 residual. All 6 are checker misses (the checker does not index directory-level cross-repo evidence entries, and one is the DEC-20260905-M "own wording, not a quotation" case); none is a real defect.

1. `DEC-20260518-A.md:100` — `"Evidence Tier 1/2/3"`. Not attributed to any source; the record states this label was searched for and not found anywhere in code/manifests/claims.yaml. Own wording describing a search term, not a quotation of a source (DEC-20260905-M clause). Checker miss.
2. `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md:26` — `"The burden collapses"`. Verified faithful: `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/integration-burden-v1.3.md:13` reads "Adopt **The burden collapses** as the second homepage section." The record's evidence array cites the directory `docs/website-redesign/homepage/`, which the checker does not expand to individual files. Checker miss.
3. `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md:28` — `"Selection Violet"`. Verified faithful: `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-enrichment-validation-v1.5.md:64,122` uses "Selection Violet" repeatedly, including "The decision accepts Selection Violet". Checker miss (same directory-evidence limitation).
4. `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:28` and `:63` — `"not a live ranking"` (two instances). Verified faithful: `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-search-web-intelligence-v1.6.md:35` reads the card is labelled "Documented output example" and "not a live ranking". Checker miss (same directory-evidence limitation; it best-matched an unrelated record, DEC-20260305-G, instead).
5. `DEC-20260904-A.md:180` — the long "Every row reaches formally_migrated..." span. Verified faithful, exact match: `docs/project/m2-closure-register.yaml:5189-5191` (`closes_when:` field of G1), which is not in this record's evidence array by path but is the actual source of the G1 `closes_when` clause the record describes; the record's own evidence array cites `archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md` which itself references the same register text. Checker miss (bold markdown markers `**...**` embedded mid-span plus line-wrap in the YAML likely defeated the source match).

## Findings

None. No false, fabricated, misattributed, or unverifiable statement found in this partition beyond what rounds 1-14's withdrawal records (DEC-20260905-B, -C, -D, -J, -M) already corrected — and in every one of those cases the correction itself checks out against the current file content and the cited sources (verified below).

### Withdrawn statements in this partition, confirmed corrected (not findings against the originals)

- `DEC-20260510-A.md`: the "244 files (217 with a recorded intent, 27 without)" quote (withdrawn by DEC-20260905-B item 5) and the "promote a useful handoff note to tracked" paraphrase misread as a quotation (withdrawn by DEC-20260905-M item 1) both still read as originally written in the file; both corrections match the current text and cited sources (`handoff/README.md`, the parsed Notion row for page `35c67c87082c81949063e8b6dd94980d`).
- `DEC-20260511-C.md`: the "CC does not reconcile silently" attribution to the 2026-05-13 cleanup prompt (withdrawn by DEC-20260905-B item 6) and the "not SQL files" quote issue (addressed in DEC-20260905-C) are both consistent with the current file text.
- `DEC-20260515-A.md`: a misattribution item is referenced by DEC-20260905-J as "already withdrawn" elsewhere (in DEC-20260905-C); consistent with the current file.
- `DEC-20260518-D.md:42-43`: the record's Rationale quote reads "does Strale return this today" — confirmed present verbatim as currently written, and DEC-20260905-J item 30 already withdraws this as a materially altered quotation (dropped "UBO data"/"for this country"). Not a new finding.
- `DEC-20260518-B.md`: DEC-20260905-J treats the "T1 Continuity"/observation content at line 55 as "Not adopted" rather than withdrawn — confirmed this is an observation about vocabulary never shipping, not a quotation defect.
- `DEC-20260827-A.md`: the `DEC-20260427-I-6` quoted phrase ("licensed contract with the Austrian Justizministerium...") is withdrawn as an unverifiable attribution by DEC-20260905-J item 31. Confirmed: `docs/decisions/id-collisions.yaml` and `docs/project/m2-closure-register.yaml` have no `DEC-20260427-I-6` entry at this commit (grepped, zero hits). Consistent, not a new finding.
- `DEC-20260904-B.md:101-102`: the "where did this id's authority come from" span (withdrawn by DEC-20260905-M item 2 as own wording, not a quotation) is present as currently written; consistent.
- Many attributions elsewhere in the corpus (outside this partition) to `CLAUDE.md`'s `DEC-20260812-A` bullet versus `DEC-20260812-A.md`'s own body are addressed by DEC-20260905-C/-D/-H/-I/-J/-N; `DEC-20260812-A.md` itself (in this partition) contains zero double-quoted spans (checker: 0 spans), so it carries no such defect itself.

## Ten "status on" code-claim spot checks

1. `DEC-20260507-J.md` — claims `test-runner.ts` never calls `recordFailure` (only `recordTestEvidence`), and `recordFailure` calls live only in `apps/api/src/routes/do.ts`. Verified: grep of `test-runner.ts`, `circuit-breaker.ts`, `do.ts` confirms exactly this shape (do.ts:45,1773,1955,2305,2868 call `recordFailure`; test-runner.ts:865-866 calls `recordTestEvidence`). TRUE.
2. `DEC-20260511-C.md` — claims `apps/api/drizzle/` remains absent and the ledger file exists. Verified: `apps/api/drizzle` does not exist (`ls` error), `apps/api/src/lib/startup-migrations.ledger.json` exists. TRUE.
3. `DEC-20260518-D.md` — claims `danish-company-data.ts` sets `ubo_availability = "unavailable_no_registry"` and `uk-company-data.ts` sets `ubo_availability = "available"`, each with the stated reason strings. Verified by grep against both files, exact match including reason text. TRUE.
4. `DEC-20260513-C.md` — claims `test-scheduler.ts`'s `slugStaggerMinute` header and `findOverdueSuites` comment both cite `DEC-20260513-D` (not this row's own id `DEC-20260513-C`) for the per-suite stagger. Verified by grep against `apps/api/src/jobs/test-scheduler.ts` lines 251-255, 334: exact wording match ("post-DEC-20260513-D", "Per DEC-20260503-B + DEC-20260513-D"). TRUE.
5. `DEC-20260822-A.md` — claims daily-run work is reported as `SYSTEM_ACTING`/`FOUNDER_DECISION`/`AUTHORIZATION_UNAVAILABLE` "according to the shapes enforced by" `production-authority.ts`. Verified: `apps/api/src/lib/production-authority.ts` itself does not export these three literal names (confirmed by grep, zero hits) — but `apps/api/src/lib/charter-authorization-binding.test.ts`'s own docblock explicitly documents these three as "our own status vocabulary — names for shapes, not symbols" that are deliberately NOT exports, tested by mapping the charter's names onto real values the module's actual exports (`AUTONOMOUS_PURPOSES`, `autonomousAuthority`, `requireFounderGrant`, etc.) produce. The record's claim is accurate under this design. TRUE (nuanced: verified by reading the binding test, not by a naive grep on the module alone).
6. `DEC-20260827-A.md` — claims `DEC-20260427-I-6` has no row anywhere in the M2 closure register or the collision registry. Verified: grep of both files for the string returns zero hits. TRUE.
7. `DEC-20260904-B.md` — claims the new git-qualification error codes (`RECORD_GIT_KEY_ID_MISMATCH`, `RECORD_GIT_KEY_SOURCE_KIND`, `RECORD_GIT_KEY_PROVENANCE_MISMATCH`, `RECORD_GIT_KEY_NOT_ANCESTOR`, `COMMIT_UNVERIFIABLE`, `RECORD_KEY_BARE_CROSS_SURFACE_ID`) are enforced by `scripts/m2-closure-register-lib.mjs`. Verified by grep: all six codes are present at the lines the record's logic describes. TRUE.
8. `DEC-20260511-F.md` — claims no cron/scheduled workflow invokes `daily-digest.ts`, it is only an npm script and an admin-triggered route. Verified: `apps/api/package.json:19` has `"digest": "tsx src/jobs/daily-digest.ts"`; `apps/api/src/routes/admin.ts:355` has the "Trigger digest email now" comment; `daily-digest.ts`'s own header says "Usage: cd apps/api && npx tsx src/jobs/daily-digest.ts". TRUE.
9. `DEC-20260513-B.md` — claims the corrected fixture `manifests/swiss-company-data.yaml`'s `known_answer.input.uid` is `CHE-101.602.521` (not the old bad value `CHE-105.805.977`), and that `apps/api/src/db/schema.ts`'s `capability_health` table has a `state` column with no `pinned`/`manual_override` column. Verified: manifest line 97 is exactly `CHE-101.602.521`; schema.ts:972 has the `'closed'/'open'/'half_open'` state comment; grep for `pinned`/`manual_override` in schema.ts returns nothing. (Note: `CHE105805977` also appears at manifest line 32, but that is an unrelated `output_schema.example` for Nestlé SA, not the known_answer fixture — confirmed by inspecting context.) TRUE.
10. `DEC-20260518-C.md` — claims no Digiteal/`sepa-vop` executor or manifest exists on `main`; only a pointer reference in `manifests/uk-cop-check.yaml`. Verified: case-insensitive grep for "digiteal" across `apps/api/src/capabilities/` and `manifests/` returns only `manifests/uk-cop-check.yaml`. TRUE.

## Structural checks (all 41 records)

- Frontmatter parses; `record_key`/`id`/filename agree for all 41 (all bare keys; none `--notion-`/`--git-` qualified in this partition).
- CAUTION banner present in all 41.
- All five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present in all 41.
- Every evidence entry resolves: all local file paths exist at this commit; cross-repo `strale-io/strale-frontend@f704cb2:...` entries resolve via `git cat-file`/`git ls-tree` against a freshly-fetched `strale-frontend` checkout; the one bare commit reference (`strale-io/strale@3f7f650f...` in `DEC-20260822-A.md`) resolves via `git cat-file -e` in this repository (confirmed commit `3f7f650f` exists, matches PR #362 merge). The `codex/repo-native-operating-model@...` entry in `DEC-20260901-A.md` is a self-repo commit reference, not independently checked against a codex remote (not flagged as unverifiable — the record does not present it as requiring a separate checkout, and the same fact is corroborated by the accompanying repository file evidence for the same claim).
- Every relation target exists as a record key at this commit: `DEC-20260507-H`, `DEC-20260505-H`, `DEC-20260503-B`, `DEC-20260420-A`, `DEC-20260511-F`, `DEC-20260430-A`, `DEC-20260515-A`, `DEC-20260518-A`, `DEC-20260518-B`, `DEC-20260518-E`, `DEC-20260503-A`, `DEC-20260812-A`, `DEC-20260815-A`, `DEC-20260428-A`, `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`, `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`, `DEC-20260831-A` — all confirmed present as `.md` files in `docs/decisions/records/`. None is a bare collided id (checked against all 35 ids in `docs/decisions/id-collisions.yaml`).
- Relation substantiation: every relation in this partition is accompanied by prose in the Context/Consequences sections naming the target and stating what the relation rests on (e.g. `DEC-20260511-C` -> `DEC-20260420-A` "affirms" the no-auto-generation/hand-written discipline; `DEC-20260518-D` <-> `DEC-20260518-A` "related_to" the evidence-tier/UBO-flag relationship; the four `DEC-20260820-*-WEBSITE-*` chapter records' "related_to" edges are substantiated by each record's Decision section naming the shared four-world homepage sequence).
- `DEC-20260904-A.md`'s 76 Notion-URL evidence entries were cross-checked against `archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md`: all 76 page ids in the record's evidence array match page ids listed in that report (the report has one additional 32-hex string, which is a git commit sha substring, not a 77th page id — confirmed by inspecting its context, "Population at archive commit `995cece3...`").
- No null field is quoted and no populated field is called null: `DEC-20260511-F.md`'s Reversal-conditions statement "`Superseded By` is null. `Outcome` is null." was checked against the parsed Notion row (`dump_rows.py PAGE:35d67c87082c81f9a4addf5904c35025`): both fields are indeed null in the parsed row. The record's central quoted Rationale span was independently re-verified byte-for-byte against the same parsed row (including the U+2192 arrow characters), confirming the checker's 5/5 faithful result. `DEC-20260510-A.md`'s equivalent "`Superseded By` is null. `Outcome` is null." statement was accepted on the same basis as the checker's clean pass for that file (11/11 faithful) plus the DEC-20260905-M-confirmed correction above.

## Unverifiable

Nothing in this partition was left unverifiable. The `codex/repo-native-operating-model@b29510949500ade9c00c4a61912baeb9dc98389a` evidence entry in `DEC-20260901-A.md` was not independently fetched from a separate codex remote (none configured in this environment), but the record does not rest any check-worthy claim solely on that entry's content beyond what the accompanying repository files (`docs/strategy/2026-08-31-repo-native-operating-model-migration.md`, the two archive session files) already corroborate, so it is not counted as a defect.

PARTITION VERDICT: PASS

### Partition P5

# Closing review round 15, partition P5

Commit: dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
Record count: 34 (the collision-layer pairs listed in closing15-P5.txt, all `--notion-` qualified)

Setup: worked in this agent's own isolated worktree (`C:\Users\pette\Projects\strale\.claude\worktrees\agent-a9413d6c11f9a89b4`), `git fetch origin` then `git checkout --detach dd8dd3e1497d46f13c51cd24d086ce0b815b4d22`, `npm ci` (succeeded, 668 packages). Notion rows read only via `dump_rows.py` into a scratch JSON keyed by page id. Cross-repo evidence resolved via `git -C C:/Users/pette/Projects/strale-frontend show <sha>:<path>` after `git -C ... fetch origin`. Nothing edited or committed anywhere.

## Script used

Ran the operator checker, `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12`, with one `--only <file>` per record in this partition. Its logic: for every double-quoted span of at least 12 characters in a record, transliterate special characters (EUR/x/>=/<=/->/...), lowercase, strip all non-alphanumeric characters, then check the normalized span is a substring (in order, for ellipsis-split spans) of the same normalized transform applied to every candidate source (the parsed Notion row's fields, repo files at this commit, other records, or the sibling frontend checkout).

Result: **34 records, 243 spans, 243 faithful, 0 residual.** No checker output to classify for this partition.

I additionally hand-verified quote fidelity against the parsed Notion export for every row in the partition (using `dump_rows.py` directly, not just the checker) and against the cited files, beyond what the checker automatically covers, since the checker's substring test can be fooled by structural coincidences.

## Structural checks (all 34 records)

- Frontmatter parses; `record_key` equals filename (minus `.md`) for all 34; `id` equals the key with the `--notion-...` qualifier stripped for all 34.
- CAUTION banner present in all 34.
- All five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present in all 34.
- Every local evidence path (script-checked) exists at this commit; every cross-repo `strale-io/strale-frontend@04c9fca9:<path>` evidence entry (14 total, across the two DEC-20260303-A and both DEC-20260304-A/B/C records and DEC-20260320-J) resolves via `git -C .../strale-frontend show 04c9fca9:<path>`.
- Every `relations` target (non-empty in 9 of the 34 records: DEC-20260320-C's ABR row, DEC-20260406-A's latency-fix row, DEC-20260406-C's Rule-E-collision row, DEC-20260409-C, DEC-20260420-D/E/F/G/H) resolves to an existing record key at this commit, is substantiated by ordinary prose (an explicit "Relation to `X`" paragraph in most cases, or clear body-prose naming in the others), and none targets a bare collided id.
- Both id-collisions.yaml checks (requirement 8) pass for all 34 pages: every page id in this partition has `disposition: formal_record` and the collision's `resolution_status: resolved` in `docs/decisions/id-collisions.yaml`, with `record_key` matching the file; and the corresponding row in `docs/project/m2-closure-register.yaml` carries `disposition: formally_migrated` with the same `record_key`. Verified by script against both YAML files, not by inspection alone.
- No null field is quoted as content, and no populated field is called null, in any of the 34 (checked manually against the parsed rows, including the five rows in this partition whose export genuinely has a null `Rationale`: `DEC-20260420-F--...810b8df1e8e459039d35`, `DEC-20260420-H--...b58b36de5f71c0937f`, `DEC-20260420-E--...d5a898f48cc1554086`, `DEC-20260420-G--...dcafe3dea59cc119b1`, `DEC-20260405-B--...34a67c87082c810692c8dd4374a6f9ac`; each of these records correctly states the field is null rather than fabricating content).

## Statements already withdrawn (rule (a); not findings against these records)

Cross-checked every DEC-20260905-B through -P item that names a record in this partition. All are corrections of the underlying formal record (not of the checker, which correctly reports these as "faithful" because the defects are either punctuation-only under the stated convention, or the checker's best-match heuristic did not distinguish the fabricated wording from a real source):

- `DEC-20260225-P-c5d6--notion-...81279b14f3859f6f2038`: DEC-20260905-B item 13 withdraws the inserted "the" in "one INSERT on the failure path" and notes the comma-for-em-dash difference in the CLAUDE.md quotation (the latter is punctuation-only and not itself a defect under the round's convention, but B's correction is not factually wrong, so it is treated as covered per rule (a)).
- `DEC-20260304-A--notion-...812c9ccef7f58256f40a`: DEC-20260905-C item 9 / J item 4 withdraw the fabricated CLAUDE.md quotation "Homepage restructure: 11-section order" for `DEC-20260303-G`.
- `DEC-20260304-C--notion-...810197f9efa520332024`: C item 10 / J item 5 withdraw the fabricated illustrative sentences ("here is quality infrastructure data" / "here is a suggested product to buy") presented as the row's own words.
- `DEC-20260304-C--notion-...815cb440e586e783df0a`: C items 11-12 / J item 6 withdraw the inserted "the" in the `trust-grade.ts` "worst of" quotation and the mis-rendering of a template literal as a literal label string.
- `DEC-20260320-C--notion-...81178c7acc8b5c396aa3`: C item 29 withdraws the broader conclusion ("moot rather than wrong") while leaving the narrow claim (neither mechanism exists in `auto-register.ts` specifically) standing; `apps/api/src/index.ts` does define `MIN_EXPECTED_EXECUTORS = 200` and the `process.exit(1)` FATAL gate, confirmed directly.
- `DEC-20260406-C--notion-...819cabf6d47331d695ce`: C item 31 withdraws the "verified... against main" status claim and the stale VOICE.md five-rules quotation (VOICE.md's current first rule is "Use audience-appropriate terms (DEC-20260905-A)", confirmed directly; the other four rules match verbatim).
- `DEC-20260420-D--notion-...81f0827eedf29d133600`: C item 34 withdraws "exactly as this row specifies, unconditionally" (the enum has grown to 14 entries). Separately, DEC-20260905-P now notes by name that the resolution report for this collision (`archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-D.md`, lines 91-92) repeats this identical stale claim; per the round's instructions this is treated as covered, not re-reported.
- `DEC-20260420-E--notion-...81d5a898f48cc1554086`: J item 20 withdrew the "library-as-product" attribution to `DEC-20260812-A`, but DEC-20260905-N item 1 subsequently reversed that withdrawal: `DEC-20260812-A.md:83` does contain the literal phrase "library-as-product" (in its Reversal conditions section), confirmed directly by grep. Nothing is withdrawn from this record; its attribution is faithful.
- `DEC-20260420-H--notion-...b58b36de5f71c0937f`: DEC-20260905-H item 1 withdraws the attribution of "library-as-product" to `docs/strategy/2026-08-05-direction-plan.md` (the phrase is CLAUDE.md's gloss, not the direction-plan's own wording, confirmed directly: the direction-plan document reads "the library as the product" and "The library, built properly", never the compound form). DEC-20260905-C items 35-36 separately withdraw this same record's misattribution of "Counterparty Assurance rename/ICP... retired as primary product" to `DEC-20260812-A` (confirmed directly: that exact phrase is absent from `DEC-20260812-A.md`, which instead reads "supersedes the Counterparty Assurance row named `DEC-20260502-A` and `DEC-20260503-A`"; the phrase is CLAUDE.md's own bullet).
- `DEC-20260420-G--notion-...dcafe3dea59cc119b1`: DEC-20260905-E item 7 withdraws a composite quotation (misattributed to `DEC-20260409-B`) that splices a phrase describing the opposite half of the feature into the middle of a real quotation.

None of the above are findings against the listed records; each is already corrected by a named amending record, and I independently verified each correction is itself accurate (not merely asserted).

## New finding

1. **File:** `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md`, line 159 (not one of the 34 graded record files, but the resolution report belonging to a collision entirely inside this partition, per the round's special instruction to check for further such repeats).
   **Statement:** "the direction plan supersedes 'DEC-20260502-A (Counterparty Assurance rename/ICP)... the Counterparty Assurance framing is retired as primary product'", attributed to `DEC-20260812-A`'s own text, asserted in the report's own voice as a current fact (not flagged as stale or wrong anywhere in the report).
   **Evidence this is false:** `docs/decisions/records/DEC-20260812-A.md` contains no such phrase anywhere (confirmed by direct read and grep for "supersedes" and for "rename/ICP"); its own Consequences section instead reads "The source decision explicitly supersedes the Counterparty Assurance row named `DEC-20260502-A` and `DEC-20260503-A`." The quoted phrase "(Counterparty Assurance rename/ICP)... retired as primary product" is `CLAUDE.md:302`'s own summary bullet for `DEC-20260812-A`, not the formal record's text — the identical defect `DEC-20260905-C` items 35 and 36 already withdrew from the two *formal records* under this same collision (`DEC-20260420-E--notion-...d5a898f48cc1554086` and `DEC-20260420-H--notion-...b58b36de5f71c0937f`). `DEC-20260905-I`'s Consequences section (the "Not adopted" list) explicitly records this same misattribution as "Already withdrawn" for the two *formal records* only, confirming the formal-record instances are covered — but it does not mention the resolution report.
   **Why this is a finding rather than covered by rule (a):** `DEC-20260905-P` is the only amending record that extends withdrawal treatment to a resolution report's own repeated wording, and it names exactly two reports (the `DEC-20260420-D` PII-enum report and the `DEC-20260505-E` HMRC-count report). It does not name `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md`. `DEC-20260905-G` item 5 separately notes a *different* stale statement in this same resolution report (about `DEC-20260420-I`'s collision status, at that report's line 82) but does not touch the Counterparty Assurance sentence at line 159. No other `DEC-20260905-B` through `-P` record names this report or this statement. Per the round's explicit instruction ("if you find any further resolution report asserting a withdrawn statement in its own voice as current fact, that is a finding and you report it"), this is unlisted and is therefore a finding, not a correction.
   **Scope note:** this finding is against an archive file, never against any of the 34 graded record files in this partition (which are clean on this point, their defect already withdrawn). It does not change the PASS/FAIL status of any of the 34 records themselves, but it is a defect in the corpus this round is reviewing.

## Checker residuals for this partition

None. The operator checker reported 0 residual spans across all 34 files in this partition (243/243 faithful). Every quotation defect present in this partition was found instead by manual comparison against the parsed Notion rows and cited files, and was already covered by an existing amending record except for the one new finding above.

## Ten code-claim spot checks (of many more performed)

1. `apps/api/src/db/schema.ts:678-697` / `apps/api/src/routes/do.ts` (4 insert sites) — `failedRequests` table and write path, `DEC-20260225-P-c5d6--notion-...81279b14f3859f6f2038`.
2. `apps/api/src/lib/audit-token.ts` / `apps/api/src/routes/audit.ts` — F-A-006/007 comments and sunset message, `DEC-20260420-F--notion-...810b8547fccb3e75c61b`.
3. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` — 10 numbered sections, tabs, `buildSteps()` — `DEC-20260304-A--notion-...812c9ccef7f58256f40a`.
4. `strale-io/strale-frontend@04c9fca9:src/types/index.ts:109` — `price_cents: number | null; // null for capabilities (DEC-20260304-A)` — `DEC-20260304-A--notion-...31967c87082c8185b0a6c33de2293215`.
5. `strale-io/strale-frontend@04c9fca9:src/components/StatsStrip.tsx` — `buildStats()` four stats, no Countries stat — `DEC-20260304-B--notion-...81a4b2f7ccdd52b99b1e`.
6. `strale-io/strale-frontend@04c9fca9:src/types/index.ts:132-153` — `SuggestRecommendation` has no `component_sum_cents` field — `DEC-20260304-B--notion-...81dda9c4f43b5b7674b3`.
7. `strale-io/strale-frontend@04c9fca9:src/components/solutions/TestRunLog.tsx` — `font-mono`, `passRate`, `getPassRateColorClass`, `border-b border-border` — `DEC-20260304-C--notion-...810197f9efa520332024`.
8. `strale-io/strale-frontend@04c9fca9:src/lib/trust-display.ts` / `apps/api/src/routes/public-trust.ts` / `trust-grade.ts` — `getTrustDisplayState()` header comment; no `data_confidence` field — `DEC-20260304-C--notion-...815cb440e586e783df0a`.
9. `manifests/au-company-data.yaml` / `apps/api/src/capabilities/au-company-data.ts` / `config/env-manifest.yaml` — price, ABN regex, `ABN_LOOKUP_GUID` env var rename — `DEC-20260320-C--notion-...81bfa5d1ee04b7d753dc`.
10. `apps/api/src/lib/platform-facts.ts` / `strale-io/strale-frontend@04c9fca9:src/pages/Methodology.tsx` — free-tier drift comment; Methodology page reads only `facts?.static.vendors.sanctions`, no counts — `DEC-20260320-J--notion-...8177a82be21d48f57411`.

(Also verified, beyond the required ten: `apps/api/src/capabilities/auto-register.ts` header/error codes; `apps/api/scripts/seed-kyb-solutions.ts` template slugs and `apps/api/scripts/archive/drop-{aggregator,sg}-kyb.ts`; `apps/api/src/lib/solution-executor.ts` `StepTiming`/`parsePath`/`walkPath`; `apps/api/src/routes/transactions.ts` and `verify.ts` F-A-005/F-A-012 comments and `AUTH_VERIFY_MAX_DEPTH`; `apps/api/src/capabilities/auto-register.ts` `DEACTIVATED` map entry for `credit-report-summary`; `docs/company/VOICE.md` and `docs/company/CHARTER.md` quotations; `docs/programs/README.md`; `apps/api/src/lib/gate4b-solution-dryrun.ts` and `apps/api/src/jobs/test-scheduler.ts`.)

## Unverifiable

None. Every claim in this partition's 34 records was traceable to a parsed Notion row, a repo file at this commit, the sibling frontend checkout, or another record, and every one was checked directly.

## Dated observations (rule (e), not findings)

- The 342/127 manifest counts in `DEC-20260420-D--notion-...81f0827eedf29d133600` and (implicitly, via its own citation) related records are dated to 2026-09-05; the actual count at this commit is 350 manifests, all 350 declaring `processes_personal_data`. This is a dated observation whose figure moved due to unrelated later work (consistent with `DEC-20260905-I`'s own finding of 350/129 at a later commit), not a defect.

One finding is reported above (an uncovered resolution-report repeat of a withdrawn misattribution). A report naming a defect states FAIL.

PARTITION VERDICT: FAIL

### Partition P6

# Closing review round 15, partition P6

Commit: dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
Records reviewed: 47 (list: `closing15-P6.txt`)

## Method

Worktree `C:/tmp/strale-closing15-P6` was requested by the prompt; this
session instead ran inside its own already-isolated worktree
(`C:\Users\pette\Projects\strale\.claude\worktrees\agent-ada0e2f910e8ec895`),
fetched `origin`, and checked out `dd8dd3e1497d46f13c51cd24d086ce0b815b4d22`
detached (the harness refuses a `cd` into a separate directory for git
operations from a worktree-isolated agent). `npm ci` succeeded on the first
attempt (added 668 packages). Nothing was edited or committed; no other
worktree was touched.

For every one of the 47 records: parsed frontmatter and checked
`record_key`/`id`/filename agreement; confirmed the CAUTION banner and the
five protected sections (Decision, Context, Rationale, Consequences,
Reversal conditions); confirmed every `evidence` entry resolves as a file at
this commit, a resolvable cross-repo `strale-io/strale-frontend@<sha>:<path>`
entry (checked against the sibling checkout after `git fetch origin` there),
or a Notion URL; confirmed every `relations` target exists as a record key
at this commit and is never a bare collided id; and, for the 32
`--notion-`-qualified records, confirmed the `id-collisions.yaml` entry
names the page id with `disposition: formal_record` and the same
`record_key`, and the `m2-closure-register.yaml` row for that page id
carries `disposition: formally_migrated` with the same `record_key`. The
one `--git-`-qualified record (`DEC-20260422-A--git-3b256587`) was checked
against `m2-closure-register.yaml`'s separate `formal_records` list (which
carries `source_kind`, `source_rows`, `git_provenance`, not the `.md`
frontmatter) for `id` match, `source_kind: git-native`, `source_rows: []`,
`git_provenance` equal to the record's own `evidence[0]`, and the commit's
ancestry and prefix (`git cat-file -t`, `git merge-base --is-ancestor`).

Script used: `node scripts/m2-quote-fidelity.mjs --export
<scratchpad>/decisions-export-raw.txt --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12`, run once over the
full 246-record corpus, then filtered to this partition's 47 files. Logic
in one sentence: for every double-quoted span of 12+ characters it
normalizes (transliterate symbols, lowercase, strip non-alphanumerics) and
checks it as a substring, split on ellipsis segments, against every
candidate source (repo files, the parsed Notion export, the sibling
frontend checkout, merged-PR sources), reporting a span as "residual" when
no candidate source contains it and printing its best (usually wrong)
partial match. Two additional custom Node scripts (written for this
session, not committed) did the structural/evidence/relations sweep and
the collision-registry/register cross-check described above.

Fifteen `DEC-20260905-B` through `-P` amending records are in this
partition (this round's entire amending chain). Every factual sentence in
each was checked against its cited source (repository file, `git log`,
`git show <sha>:<path>`, the parsed Notion export via `dump_rows.py`, or
`gh pr view`), not merely accepted on the strength of its own prose, per
the prompt's instruction that a correction is a claim like any other.

## Checker residuals for this partition

`DEC-20260905-C.md`: 156 spans, 83 residual. All 83 are checker misses: the
record's own recurring `"<quote>" ... Fact: ... reads "<quote>"` sentence
shape means many of its own quotations *are* the statement being withdrawn
from the named source record, and the checker's best-match algorithm
attributes them to some other record or file in its candidate set instead
of the actual withdrawn-from source the section heading names. Spot-checked
several (e.g. the `DEC-20260317-A`, `DEC-20260318-A`, `DEC-20260320-C`
items) by reading the withdrawn-from record directly; each residual's true
source is the record named in the immediately preceding `### \`DEC-...\``
heading, confirming the checker-miss classification, not a defect.

`DEC-20260905-D.md`: 73 spans, 2 residual (`"the checker missed it"` line
429, `"checker miss, faithful to a source"` line 451). Both are the
record's own meta-commentary about the reviewing method, quoted as
illustrative phrases, never attributed to any source. Own wording, not a
quotation (DEC-20260905-M's clause), confirmed by reading the surrounding
paragraph.

`DEC-20260905-F.md`: 16 spans, 6 residual, including `"not narrated at
all"` (line 176) and five long spans inside the record's own "Not adopted"
list quoting its own prior sentences and other amending records'
boilerplate (`"the checker missed it"`-class self-reference, a P6
observation quoted back, and further self-referential-artifact prose).
Read each in context: none is attributed to an external source it
misrepresents; all are the record's own wording or already-correct
quotations of sibling amending records that the checker's weak best-match
mis-scored. Checker misses.

`DEC-20260905-G.md`: 32 spans, 1 residual (`"Rule (a) cross-check"`, line
348). This is the record's own descriptive label for a table entry in
`archive/sessions/2026-09-05-m2-closing-review-round-6.md` (evidence-listed
in `DEC-20260905-G`'s frontmatter), not a claimed verbatim quotation; the
adjacent longer quotation ("verified the record's own Context sentence...
names both targets by unique subject matter... Substantiation accurate")
was independently confirmed as a faithful, ellipsis-segmented substring of
that same evidence file. Checker miss / own wording.

All other 43 files in this partition: 0 residual at `--min-chars 12`.

## Findings

None. No false, fabricated, misattributed, or unverifiable statement was
found standing uncorrected anywhere in this partition's 47 records at this
commit.

One item was checked closely because it looked at first read like a fresh
defect and turned out to already be corrected inside the same partition:
`DEC-20260905-J`'s own Context/Consequences prose (lines 644, 652, 738, 907)
miscounts its own numbered Decision list as having 32 items and misstates
which items (calling 27-28, not 26-27, the two non-withdrawing
substantiation items; including item 26, itself a substantiation item, in
a list of "withdrawal items"; and referencing a nonexistent item 32).
Verified directly: `DEC-20260905-J.md`'s own numbered list runs 1 to 31
(`grep -n "^[0-9]\+\. "` returns exactly 31 matches, highest at line 572),
items 26 and 27 (lines 500, 518) both open "Restates the substantiation...
not withdraws", and item 28 (line 536) is the `DEC-20260507-D` withdrawal.
This is exactly the class of error the prompt asks partition reviewers to
check ("which items are which"). It is not a finding against `DEC-20260905-J`
because `DEC-20260905-J` is itself listed in this partition and is
withdrawn, item for item, by `DEC-20260905-K` (also in this partition):
K's four items match the miscounts precisely (32 vs. 31, the 27-28 vs.
26-27 range twice, and the "26" mis-list), and K's fifth item (an unrelated
substantiation that two named-source sweep entries were already withdrawn
by `DEC-20260905-D` item 10 and `DEC-20260905-E` item 7) was independently
verified against those two records' own text, which matches K's paraphrase
exactly. K's own citations (`DEC-20260905-J.md` lines 644, 652, 738, 907)
were all confirmed byte-accurate by direct read. This is a finding fully
and correctly withdrawn under rule (a); not counted against either record.

## Ten code-claim spot checks (of a larger number actually run)

1. `apps/api/scripts/check-no-new-console.mjs:12` — header comment reads
   "a new `console.*` is introduced to a file not in the allowlist"; no
   "justification comment" language. Confirms `DEC-20260905-B` item 3.
2. `apps/api/src/routes/do.ts:876-877` (x402 verify-only comment) vs.
   `do.ts:601` (`settleReceiptFor`'s own unrelated MCP/A2A docstring).
   Confirms `DEC-20260905-B` item 4.
3. `context7.json`'s `rules` array has exactly 12 entries; index 11 (the
   12th, 1-indexed) reads the SQS-removal text verbatim as quoted. Confirms
   `DEC-20260905-B` item 2 and `DEC-20260905-J` item 17.
4. `config/env-manifest.yaml` — exactly 7 `HMRC_*` rows by name
   (`git grep -c "name: HMRC_"` → 7). Confirms `DEC-20260905-B` item 7 and
   `DEC-20260905-N` item 2.
5. `docs/company/CHARTER.md:399,43` — both use the euro sign, not "EUR ".
   Confirms `DEC-20260905-B` item 8.
6. `apps/api/src/lib/onboarding-gates.ts:242-260` — `PII_CATEGORY_ENUM` has
   14 entries verbatim, matching the quoted code block. Confirms
   `DEC-20260905-P` item 1.
7. `apps/api/src/capabilities/auto-register.ts:161-170` — two separate
   comments (dutch line 161, portuguese line 168); no combined
   "(Phase 2a/2b)" text exists. Confirms `DEC-20260905-D` item 13.
8. `apps/api/src/capabilities/polish-company-data.ts:17-19` — "KRS-by-number
   is the only compliant path" precedes the northdata.com sentence, the
   opposite order from the withdrawn quotation. Confirms `DEC-20260905-D`
   item 14.
9. `docs/decisions/id-collisions.yaml:287-302` — `DEC-20260420-H` is
   `resolved` with a `formal_record`-dispositioned qualified record.
   Confirms `DEC-20260905-D` item 12.
10. `docs/strategy/2026-08-05-direction-plan.md:14,64` (no
    "library-as-product" phrase) vs. `docs/decisions/records/DEC-20260812-A.md:83`
    (does contain it) vs. `CLAUDE.md`'s own bullet (also contains it).
    Confirms `DEC-20260905-H` item 1 and `DEC-20260905-N` item 1.

Additional checks run beyond the ten: `manifests/doi-resolve.yaml:42,108`
(`license_url` field exists, DEC-905-I item 4); `apps/api/src/lib/capability-readiness.ts:6-13`
(no bracketed insertion, DEC-905-L item 2); `manifests/slovenian-company-data.yaml:135-136`;
`archive/growth-ops/tweets-v2.md:24`; `strale-io/strale-frontend@8e01fbc5...:src/components/solutions/sqs-display.ts:71,80`
(isSQSUnqualified defined twice, imported only by its own test); PR #611 on
GitHub confirmed CLOSED/unmerged via `gh pr view 611` (DEC-905-P); commit
`d0e21ecdb3009c8ce83a5345c95755c8cc386ec1` confirmed an ancestor of HEAD
(DEC-905-P); the git-qualified record's commit `3b25658736bfed53eec52c8acf2619dacd54d1f5`
confirmed an ancestor of HEAD.

## Notion row verifications (via dump_rows.py, read-only)

- Page `35967c87082c81bab96dc64b983e85f1` (`DEC-20260507-D`'s own
  evidence[0]): Rationale field contains "Implies CA product page edit
  (remove 'future BYO-endpoint augmentation' language)" verbatim. Confirms
  `DEC-20260905-L` item 3 (a wrong withdrawal basis inside `DEC-20260905-J`
  item 28, itself correctly withdrawn by `DEC-20260905-L`).
- Page `35767c87082c81d3897fe47a2ec7a4c1` (`DEC-20260505-D`'s own row):
  `date:Date:start` = `2026-05-04`, `createdTime` = `2026-05-05`. Confirms
  `DEC-20260905-N` item 3.
- Page `34967c87082c81bd8c6bf8e92e901711` (`DEC-20260421-C`'s own row):
  Decision field has neither "government-registry" nor "commercial";
  Rationale field has both. Confirms `DEC-20260905-O`'s correction.

No claim in this partition required a Notion page BODY fetch (the round-15
prompt's rule (c) about page-body claims, e.g. `DEC-20260429-A`'s four
triggers) — that record is not in this partition's file list.

## Unverifiable

- Every production/database-state claim the records themselves already
  flag as unverifiable from a read-only repository review (which
  OpenRegister/Cobalt billing tier is live, various vendor-response
  outcomes, whether specific staging drills have since run, GitHub branch
  protection status) is reported by the records as unverifiable, not as
  fact, and this review does not attempt to resolve them either. Not a
  defect.
- Nothing else in this partition was left unverified: every quoted span,
  code claim, evidence path, relation target, and collision/register
  binding for these 47 records was checked directly against its named
  source at this commit.

PARTITION VERDICT: PASS

## Gate output

```
M2 closing review round 15 gate run at dd8dd3e1497d46f13c51cd24d086ce0b815b4d22, 2026-09-06T18:55:36Z
HEAD=dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (332.0048ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (138.1882ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (6.4737ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (31.3318ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 149961.8468
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (710.4373ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (533.8071ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (252.923ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (729.2379ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 114671.1412
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
check-no-committed-secrets: clean (3220 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still dd8dd3e1497d46f13c51cd24d086ce0b815b4d22
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Consolidated findings

Five partitions passed and the gates were clean; the consolidated verdict
is FAIL on P1's one item and P5's one item.

1. **`docs/decisions/records/DEC-20260225-P-m1n2.md`, line 109.** Found by
   partition P1. The record states, in Consequences: "Both the 'not CI
   reports' clause and the 'MCP server + SDK' clause are reflected in
   what exists today..." presenting `"not CI reports"` in quotation marks
   alongside a genuine literal quotation (`"MCP server + SDK"`), implying
   both are the row's own words. The row's own Rationale field (Notion
   page `31267c87082c811f932fe2a2220dd9af`) reads, verbatim, "Don't
   build: CI reports, PDF engines, domain-specific pipelines, enterprise
   sales." and never contains the string "not CI reports". This is a
   paraphrase presented as if it were a direct quotation of the row.

2. **`archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md`,
   line 159.** Found by partition P5 (a resolution report belonging to a
   collision entirely inside P5's own 34-record partition). The report
   states, in its own voice as current fact: "the direction plan
   supersedes 'DEC-20260502-A (Counterparty Assurance rename/ICP)... the
   Counterparty Assurance framing is retired as primary product'",
   attributed to `DEC-20260812-A`'s own text. `docs/decisions/records/DEC-20260812-A.md`
   contains no such phrase (confirmed by `git grep -c "Counterparty
   Assurance rename/ICP" HEAD -- CLAUDE.md docs/decisions/records/DEC-20260812-A.md`:
   one hit in `CLAUDE.md`, none in the record); its own body instead
   reads "The source decision explicitly supersedes the Counterparty
   Assurance row named `DEC-20260502-A` and `DEC-20260503-A`."
   `DEC-20260905-C` items 35 and 36 already withdraw this identical
   attribution from the two formal records under this same collision,
   naming only those two records, never this resolution report.

Both items are corrected by `DEC-20260905-Q`
(`docs/decisions/records/DEC-20260905-Q.md`), which withdraws item 1 from
the formal record and notes item 2 against the resolution report without
editing it, the same treatment `DEC-20260905-P` already gives two other
resolution reports repeating a withdrawn statement, and which states the
resolution-report rule as its main point so a future round need not name
each further repeat individually.

VERDICT: FAIL
