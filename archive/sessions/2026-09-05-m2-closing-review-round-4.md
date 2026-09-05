---
doc_type: m2-closing-review-round
round: 4
commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
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

Round 4 of the M2 closing independent review, run after `DEC-20260905-D`
withdrew round 3's confirmed statements and substantiated the two relation
gaps that round raised, at commit
`65bf77f1b12813f9f94c42540f1f1272988ab1f3`. Six fresh, read-only reviewers,
none the author of any reviewed content, applied the quotation convention
`DEC-20260905-C` states and `DEC-20260905-D` restates unchanged (normalize
quotation and source before comparing: transliterate symbols, lowercase,
strip non-alphanumerics; an ellipsis splits a quotation into ordered
segments; a relation substantiated by an amending record, not narrated in
the amended record's own body, is substantiated, not a defect) and ran the
operator checker, `scripts/m2-quote-fidelity.mjs`, against the parsed
Notion export and the sibling `strale-frontend` checkout, in addition to
the prior rounds' own method: each partition set up a detached, read-only
worktree at commit `65bf77f1b12813f9f94c42540f1f1272988ab1f3`, checked
frontmatter validity, the CAUTION banner, the five protected sections,
every quotation, every evidence path, every relation target, at least ten
code claims, and, for `--notion-` and `--git-` qualified records, the
collision-registry and M2-closure-register bindings. P1 through P4 each
took a contiguous slice of bare-keyed records; P5 and P6 took the
qualified records belonging to this batch's id-collisions, plus, for P6,
the two prior withdrawal records `DEC-20260905-B`, `DEC-20260905-C` and
`DEC-20260905-D` themselves (36 files total for P6, including the three
withdrawal records), checked like any other candidate record. Partition
P2 was reviewed twice: the first reviewer delegated part of the review,
so a second, independent reviewer was launched over the same 41-file
slice; both reports are reproduced below (`P2` and `P2b`), and both
count toward this round's findings. There is no sweep this round: each
partition covered its own slice in full rather than by sample, per the
method above. Below, every heading in each reproduced partition report is
demoted by exactly one level (`##` to `###`, `###` to `####`, `####` to
`#####`; a report's own top-level `#` title is left as-is under a
`### P<n>` wrapper) so this file keeps one heading hierarchy throughout;
nothing else in any report is edited.

## Partition reports

### P1

# Closing review round 4, partition P1

Commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
Record count: 41

Files reviewed (docs/decisions/records/, sorted): DEC-20260224-P-a1b2.md,
DEC-20260224-P-c3d4.md, DEC-20260224-P-e5f6.md, DEC-20260224-P-g7h8.md,
DEC-20260225-P-a3b4.md, DEC-20260225-P-e7f8.md, DEC-20260225-P-g9h0.md,
DEC-20260225-P-i1j2.md, DEC-20260225-P-k3l4.md, DEC-20260225-P-m1n2.md,
DEC-20260225-P-m5n6.md, DEC-20260225-P-o7p8.md, DEC-20260225-P-q3r4.md,
DEC-20260225-P-s5t6.md, DEC-20260225-P-u7v8.md, DEC-20260225-P-w9x0.md,
DEC-20260225-P-y1z2.md, DEC-20260226-P-q1r2.md, DEC-20260226-P-s3t4.md,
DEC-20260226-P-u5v6.md, DEC-20260226-P-w7x8.md, DEC-20260227-P-a1b2.md,
DEC-20260227-P-i9j0.md, DEC-20260227-P-m3n4.md, DEC-20260227-P-o5p6.md,
DEC-20260227-P-q7r8.md, DEC-20260227-P-s9t0.md, DEC-20260227-P-u1v2.md,
DEC-20260302-A-0001.md, DEC-20260302-C.md, DEC-20260302-D.md,
DEC-20260303-C.md, DEC-20260305-E.md, DEC-20260305-F.md, DEC-20260305-G.md,
DEC-20260306-D.md, DEC-20260306-G.md, DEC-20260306-H.md, DEC-20260308-1.md,
DEC-20260309-G.md, DEC-20260309-H.md. None of these is a `--notion-` or
`--git-` qualified record, so check (8) does not apply to this partition.

### Method

Set up a detached worktree at the pinned commit (`C:/tmp/strale-closing4-P1`)
and ran `npm ci` there (it stayed running with no output for the whole
review; `node_modules` already held 497 packages from a prior install and
every script below ran correctly against them, so I proceeded without
waiting for it to finish). For every record in the list I: parsed
frontmatter and confirmed `record_key`/`id`/filename agreement; confirmed
the CAUTION banner and the five protected sections (`## Decision`,
`## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`)
are present; confirmed every `evidence:` entry that is a repo path exists
at the pinned commit, and that every `strale-io/strale-frontend@04c9fca9:`
entry resolves against the fetched frontend checkout; confirmed every
`relations:` target is a record key that exists in `docs/decisions/records/`
at the pinned commit; and read a Notion export
(`decisions-export-pretty.json`, a 318-row export already present in the
scratchpad from a prior round, matching every `DEC-20260224/25/26/27/302/303/
305/306/308/309` row this partition's records cite by URL) to check every
quotation attributed to a Notion row, plus grepped the repo/frontend for the
"status on" code claims.

I ran the operator checker,
`node scripts/m2-quote-fidelity.mjs --export decisions-export-pretty.json
--frontend <strale-frontend checkout>`, with one `--only` per file in this
partition (41 files; the tool reported "Totals: 41 records, 141 spans, 95
faithful, 46 residual"). For every one of the 46 residuals I re-checked the
quoted span by hand against the actual parsed Notion row (Decision +
Rationale + Outcome + Source fields concatenated), normalizing per the
stated convention and splitting on ellipsis before deleting punctuation (a
bug in my first pass, not the operator script, briefly produced 3 false
"NO MATCH" results on ellipsis-containing quotes — fixed by splitting the
raw quote on `...` first, then normalizing each segment, matching the
operator script's own documented order of operations). All 46 residuals
turned out faithful against their actual named Notion-row source; every one
is a checker miss, not a defect: the script's paragraph-level heuristic for
associating a quoted span with "the Notion row this paragraph is about"
fails whenever the record names the source row only by its record-key
markdown reference (e.g. "`DEC-20260225-P-m1n2` states, in its own
Rationale: ...") rather than by a literal Notion URL in the same paragraph,
so the checker falls back to a weak fuzzy search across all other sources
and reports a poor best-match instead of finding the true row.

### Residual-mismatch list and classification (all 46, all checker misses)

For each entry: `<file>:<line>` — quote — verified against the named
Notion-row field, faithful.

1. DEC-20260224-P-a1b2.md:95 — "marketplace is the primary product" — this
   is the record's own stated search-query string ("A search of ...
   for the row's specific phrases (\"marketplace is the primary product\"...)
   found no match"), not a quotation attributed to any document; checker
   miss.
2. DEC-20260224-P-c3d4.md:49 — "Don't build: CI reports, PDF engines,
   domain-specific pipelines." — faithful substring of `DEC-20260225-P-m1n2`'s
   Rationale field ("Don't build: CI reports, PDF engines, domain-specific
   pipelines, enterprise sales."), truncated at a natural point; checker
   miss (no literal Notion URL for m1n2 in that paragraph).
3. DEC-20260224-P-c3d4.md:71 — "the commerce protocol for the agent
   economy," — faithful substring of the same row's Rationale ("New
   direction: Strale is the commerce protocol for the agent economy.");
   checker miss.
4. DEC-20260224-P-e5f6.md:32 — the full four-part quotation — faithful,
   byte-identical to `DEC-20260224-P-e5f6`'s own Rationale field; checker
   miss (the record's own evidence array does not carry a literal Notion
   URL inline in that paragraph).
5. DEC-20260224-P-e5f6.md:80 — "contractual accountability," — faithful
   substring of the same row's Rationale; checker miss.
6. DEC-20260224-P-g7h8.md:33 — the seven-point naming quotation — faithful,
   byte-identical to `DEC-20260224-P-g7h8`'s Rationale field; checker miss.
7. DEC-20260225-P-e7f8.md:64 — "drops into existing agent tool arrays" —
   faithful substring of `DEC-20260225-P-e7f8`'s Rationale; checker miss.
8. DEC-20260225-P-i1j2.md:70 — "EU vendor onboarding = registry + VAT +
   address + invoice," — faithful substring of `DEC-20260225-P-i1j2`'s own
   Rationale/Decision; checker miss.
9-11. DEC-20260225-P-k3l4.md:45,81,86 — "honest about coverage, ambitious
   about trajectory.", "brand, API, SDK, docs are global from day one",
   "eventually through external providers from other regions" — all three
   faithful substrings of `DEC-20260225-P-k3l4`'s own Decision/Rationale;
   checker miss.
12. DEC-20260225-P-m5n6.md:31 — "that shoe company in Stockholm founded by
    Bjorn" — faithful substring of the row's own Decision text; checker
    miss.
13. DEC-20260225-P-o7p8.md:65 — "query active government contracts by
    keyword." — faithful substring of the row's own Decision text; checker
    miss.
14. DEC-20260225-P-q3r4.md:33 — the five-part crypto quotation — faithful,
    byte-identical to the row's own Rationale field; checker miss.
15. DEC-20260225-P-s5t6.md:33 — the Gemini-review quotation — faithful,
    byte-identical to the row's own Rationale field; checker miss.
16. DEC-20260225-P-s5t6.md:95 — "ledger designed AS IF it were stablecoin
    system" — faithful substring of the same Rationale field; checker miss.
17. DEC-20260225-P-y1z2.md:62 — the five-capability list — faithful
    substring of the row's own Rationale; checker miss.
18-20. DEC-20260225-P-y1z2.md:78,80,83 — three short paraphrase-labelled
    quotations describing what CLAUDE.md's DEC-7/DEC-10/DEC-12 bullets
    correspond to — all three faithful substrings of the row's own
    Rationale field, which restates the reviewed items in this wording;
    checker miss.
21. DEC-20260226-P-q1r2.md:93 — the four-capability list — faithful
    substring of `DEC-20260226-P-q1r2`'s own Rationale; checker miss.
22. DEC-20260226-P-s3t4.md:38 — "Competitive Defense Strategy" — faithful
    substring of the row's own Rationale; checker miss.
23-24. DEC-20260226-P-u5v6.md:77,79 — "8 new capabilities built and
    deployed same day" (own row's Rationale) and "Actual build velocity
    produced 133+ capabilities in <24hrs (heading to 200+)," (correctly
    attributed to `DEC-20260227-P-a1b2`'s own Rationale) — both faithful;
    checker miss.
25. DEC-20260227-P-a1b2.md:78 — "provider recruitment timeline
    shifts...to month 2" — faithful ellipsis-joined substring of the row's
    own Rationale ("Provider recruitment timeline shifts from month 3 to
    month 2."); checker miss (confirmed after fixing a bug in my own
    verification script, which had stripped the ellipsis before splitting
    on it; the operator checker's documented order of operations splits
    first).
26-27. DEC-20260227-P-m3n4.md:60,80 — "developer tools (sandbox,
    scaffolding)," and "broad coverage across 6 verticals" — both faithful
    substrings of the row's own Decision/Rationale; checker miss.
28-32. DEC-20260227-P-o5p6.md:50,56,80(x2),81 — the phase-by-phase
    quotations — all five faithful substrings of `DEC-20260227-P-o5p6`'s
    own Rationale field, including the two ellipsis-joined ones ("provider-
    lite model... 10-20 providers", "open registration... 50+ providers"),
    confirmed faithful once split-before-normalize was applied; checker
    miss.
33. DEC-20260227-P-u1v2.md:88 — "de facto A2A Agent Card registry" —
    faithful substring of the row's own Rationale; checker miss.
34. DEC-20260302-C.md:80 — "removed from homepage (live on
    /capabilities)." — faithful substring of the row's own Decision text;
    checker miss.
35-37. DEC-20260303-C.md:35,60,102 — "Strale does not accept payment for
    ranking position" (three near-duplicate occurrences) — faithful
    substring of the row's own Decision text (this is the row's stated
    design intent for the `/how-ranking-works` page, correctly reported by
    the record as unbuilt); checker miss.
38. DEC-20260305-E.md:42 — the "Shipped..." Outcome quotation — faithful,
    byte-identical to the row's own Outcome field; checker miss.
39. DEC-20260305-F.md:42 — the "72/98 -> 94/98..." Outcome quotation —
    faithful, byte-identical to the row's own Outcome field; checker miss.
40-41. DEC-20260306-G.md:32,33 — "RESOLVED, see SQS Constitution," and
    "Strale Quality Score — Design Spec." — both faithful substrings of the
    row's own title/Decision text; checker miss.
42-43. DEC-20260306-H.md:42,85 — "understand, try, trust, explore." and
    "quality dot merged into price line" — both faithful substrings of the
    row's own title/Decision; checker miss.
44-45. DEC-20260308-1.md:49,71 — "Stablecoin rails (USDC) are ledger-level
    and unaffected by Stripe checkout currency." (two near-duplicate uses)
    — faithful, byte-identical to the row's own Context text; checker
    miss.
46. DEC-20260309-G.md:72 — "Companion to the Data Model Field Reference" —
    faithful substring of the row's own Rationale; checker miss.

No residual in this partition is a real defect. None is withdrawn by
DEC-20260905-B/C/D (those withdrawals target different spans in some of
these same records, see below), and none is newly false.

### Corrections already recorded (not findings against the originals)

Several statements in this partition's records are already withdrawn by
`DEC-20260905-C` and `DEC-20260905-D` and remain, unmodified, in the
original active records (as the protected-record rule requires). I
independently re-verified each of these corrections is itself accurate
before treating it as closed, per the round's rule (a):

- `DEC-20260224-P-g7h8.md`: "Long-term ambition is tens/hundreds of
  thousands of data sources" attributed to CLAUDE.md — confirmed absent
  from CLAUDE.md by grep at this commit (`DEC-20260905-C` item 1, correct).
- `DEC-20260225-P-y1z2.md`: "(unanimous)" appended to the DEC-19 quotation,
  and the composite quotation attributed to `DEC-20260225-P-a3b4` — both
  confirmed as `DEC-20260905-C` items 2-3 describe.
- `DEC-20260226-P-q1r2.md`: "Production: https://strale-production.up.
  railway.app (= api.strale.io)." attributed to CLAUDE.md's Tech Stack
  section — confirmed absent from CLAUDE.md by direct grep and by reading
  the Tech Stack block at this commit (`DEC-20260905-C` item 4, correct).
- `DEC-20260227-P-a1b2.md`: "this row's own text names only 'the original
  Provider Growth doc,'" — confirmed as `DEC-20260905-C` item 5 describes.
- `DEC-20260227-P-u1v2.md`: the "Distribution packages & protocol
  endpoints" attribution to CLAUDE.md — confirmed absent from CLAUDE.md
  (`DEC-20260905-C` item 6, correct).
- `DEC-20260302-A-0001.md`: the "EUR 0.02 to EUR 1.00" en-dash-to-"to"
  substitution — confirmed as `DEC-20260905-C` item 7 describes.
- `DEC-20260302-C.md`: the stale CLAUDE.md short-form quotation — confirmed
  as `DEC-20260905-C` item 8 describes (CLAUDE.md's current bullet reads
  differently, per DEC-20260905-A adoption).
- `DEC-20260305-E.md`: the browserless-extract.ts/web-provider.ts
  misattribution and the "47-to-36" restatement — confirmed as
  `DEC-20260905-C` items 14-15 describe.
- `DEC-20260306-D.md`: the single/double-quote and em-dash substitution in
  the "Success Rate vs Test Pass Rate" quotation — confirmed as
  `DEC-20260905-C` item 16 describes.
- `DEC-20260309-G.md`: the "no matches outside this record" overclaim —
  confirmed as `DEC-20260905-C` item 17 describes (a grep for
  "12-category"/"12 categor" outside this record finds only meta-references
  discussing this same finding, in archive/sessions round-2/3 reports,
  `DEC-20260905-C` itself, `codex-review-backlog.yaml`, `DECISIONS.md`, and
  a handoff file — none describes an implemented framework).
- `DEC-20260225-P-m1n2.md`: the "first vertical: market research and
  competitive intelligence" misquotation of `DEC-20260224-P-c3d4`, and the
  "Source field is null, unlike most rows in this batch" claim — confirmed
  as `DEC-20260905-D` items 1-2 describe (checked all 13
  `DEC-20260225-P-*` rows' Source fields in the export: all null).
- `DEC-20260226-P-s3t4.md`: "Date-based API versioning via Strale-Version
  header" attributed to CLAUDE.md — confirmed absent by grep
  (`DEC-20260905-D` item 3, correct).
- `DEC-20260227-P-i9j0.md`: "the capability's own provider runs the code."
  — confirmed as `DEC-20260905-D` item 4 describes.
- `DEC-20260227-P-s9t0.md`: the two fabricated "Unit 3 becomes
  unnecessary..."/"Unit 3 was built as..." quotations — confirmed as
  `DEC-20260905-D` items 5-6 describe (both are explicitly framed as
  hypotheticals in the record's own prose, not literal quotations).

### Findings

No findings. Every record in this partition passes all seven checks
(frontmatter/key/filename agreement; CAUTION banner + five protected
sections; quotation fidelity, including the 46 checker residuals verified
by hand above; no null-field-quoted-as-populated or populated-field-
called-null; evidence-path existence including cross-repo; relation-target
existence; ten-plus code-claim spot checks). Check (8) does not apply
(no `--notion-`/`--git-` qualified record in this partition).

### Ten-plus "status on" code-claim spot checks

1. `DEC-20260302-D.md` — `apps/api/src/lib/dependency-manifest.ts` exists
   and defines a `skipAuth?: boolean` field (line 42) — confirmed.
2. `DEC-20260302-D.md` — `apps/api/src/jobs/daily-digest.ts` exists —
   confirmed (file present).
3. `DEC-20260302-D.md` — CLAUDE.md's "Test Infrastructure Cost Principles"
   section exists — confirmed at CLAUDE.md:454.
4. `DEC-20260306-G.md` — `apps/api/src/db/schema.ts` defines
   `capability_health (circuit breaker)` around line 964-966 — confirmed
   (comment at 964, table definition immediately after).
5. `DEC-20260306-G.md` — no `quality/:slug` or `v1/quality` route exists
   under `apps/api/src/routes` — confirmed by grep (no match).
6. `DEC-20260303-C.md` — the sibling frontend's `App.tsx` routes both
   `/trust` and `/trust/methodology` to the same `Methodology` component,
   with no `/how-ranking-works` route — confirmed at
   `strale-io/strale-frontend@04c9fca9:src/App.tsx:83-84`.
7. `DEC-20260309-H.md` — none of `dcf-estimate`, `altman-z-score`,
   `recession-probability`, `analyst-ratings`, `retirement-projection`,
   `portfolio-risk`, `credit-ratios`, `country-risk-profile` exists as a
   manifest — confirmed (all eight absent from `manifests/`).
8. `DEC-20260309-H.md` — only `competitor-compare.yaml`,
   `contract-extract.yaml`, `email-finder.yaml`, `landing-page-roast.yaml`
   carry a `disclaimer` field — confirmed by grep across `manifests/*.yaml`.
9. `DEC-20260226-P-q1r2.md` — no line in CLAUDE.md states
   "Production: https://strale-production.up.railway.app (= api.strale.io)."
   — confirmed by grep (zero matches) and by reading the Tech Stack
   section directly (CLAUDE.md:210-218).
10. `DEC-20260309-G.md` — no repository match for "12-category" / "12
    categor" outside this record and other records/meta-documents
    discussing the same finding — confirmed by grep, excluding
    node_modules.
11. `DEC-20260309-H.md` — the sibling frontend's `Terms.tsx` carries a
    "8. Warranty and liability" section with "To the maximum extent
    permitted by law, our aggregate liability" and a carve-out for fraud,
    gross negligence and wilful misconduct — confirmed at
    `strale-io/strale-frontend@04c9fca9:src/pages/Terms.tsx:216,254,262`.
12. `DEC-20260308-1.md` — `docs/decisions/records/DEC-20260308-1.md`'s own
    `title:` frontmatter reads "Platform pricing currency: EUR (not USD)",
    confirming `DEC-20260306-G`'s claim that it is not the SQS
    Constitution — confirmed.

### Unverifiable

- `DEC-20260225-P-a3b4.md`'s flag that `vat-validate`'s manifest
  `price_cents: 2` may or may not reflect a later unrecorded pricing
  change is, as the record itself says, unresolved from the manifest
  alone; I did not find an intervening decision record either, so it
  remains unverifiable, consistent with the record's own framing (not a
  finding, since the record does not assert a resolved fact).
- The exact per-day capability-git-history counts `DEC-20260226-P-u5v6`
  and `DEC-20260226-P-w7x8` describe were not independently re-derived
  from git history; the records themselves flag this same limit, and I
  relied on the same two fixed points (row-stated figures, present-day
  manifest count) they use.
- `npm run context:check`, `npm run context:test`,
  `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`, and the other gate-run commands from
  the brief were not run by this partition reviewer (they are the
  orchestrator's Gate Run, layer 2, not a partition-reviewer duty per the
  brief); I did not attempt them.
- Whether `npm ci` in my worktree ever completed is unknown; it produced
  no output for the whole session. This did not block any check I needed
  to perform (node_modules already had the packages the fidelity script
  required).

### PARTITION VERDICT: PASS

### P2

# M2 closing review, round 4 — Partition P2

Partition: P2
Commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
Record count: 41 (docs/decisions/records/DEC-20260310-E.md through DEC-20260411-B.md, per closing4-P2.txt)

### Method

- Worktree: `git worktree add --detach C:/tmp/strale-closing4-P2 65bf77f1b12813f9f94c42540f1f1272988ab1f3`, `npm ci` (repeatedly failed with Windows `ENOTEMPTY`/`EPERM` file-lock errors on `node_modules` cleanup, apparently from a concurrent process holding handles in the shared `C:\tmp` tree; worked around by copying the specific packages the checker needs — `ajv`, `yaml`, `commonmark`, `mdurl`, `json-schema-traverse`, `fast-deep-equal`, `fast-uri`, `require-from-string` — directly from the main checkout's `node_modules` rather than re-running `npm ci`).
- Read every one of the 41 records in full (frontmatter + all five protected sections + CAUTION banner).
- Ran `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --only <file>` once per record in the partition (one invocation, 41 `--only` flags). Its logic in one sentence: for every double-quoted span of 25+ characters in a record's body (skipping fenced/inline code), normalize both the quote and every candidate source (records, CLAUDE.md, evidence files, parsed Notion rows, the frontend checkout) per the declared convention, split on ellipses into ordered segments, and report any quote whose normalized form is not a substring of any candidate source.
- For every quotation the checker did not itself resolve, and for every non-quoted factual claim (record/collision existence, code behavior, file line numbers), verified directly against the file, the parsed Notion row (via `dump_rows.py`), or the frontend checkout at the pinned commit.
- Ran `git -C C:/Users/pette/Projects/strale-frontend fetch origin` then read the five `strale-io/strale-frontend@04c9fca9:<path>` evidence files directly with `git show`.
- Cross-checked every claim in my partition that a record "does not exist" or a collision is "unresolved" against `docs/decisions/id-collisions.yaml` and `find`/`test -f` on `docs/decisions/records/`.
- Read `DEC-20260905-B.md`, `DEC-20260905-C.md`, `DEC-20260905-D.md` in full first, to identify which statements in my partition are already-corrected withdrawals (not findings) versus open defects.

### Checker residuals for P2 (3 of 162 spans)

1. `DEC-20260314-F.md` line 84: quoted grep pattern `"completion_rate\|autonomous_completion\|autonomousCompletion"`. **Checker miss.** This is a shell/grep command inside backtick-delimited inline code that wraps across two rendered markdown lines, so the checker's single-line inline-code mask does not catch it. Verified: the grep pattern is accurately described as returning zero matches (independently re-run: `grep -rln "completion_rate\|autonomous_completion\|autonomousCompletion" apps/api/src` returns nothing). Not a quotation-fidelity defect.
2. `DEC-20260320-A.md` line 96: `"The last two dimensions [reliability and limitations] were added per DEC-20260423-B (Stage A, warning mode)... 34 caps shipped to prod with NULL reliability."` **Checker miss.** Verified faithful against `apps/api/src/lib/capability-readiness.ts` lines 9-12: "The last two dimensions were added per DEC-20260423-B (Stage A, warning mode): ... 34 caps shipped to prod with NULL reliability." The `[reliability and limitations]` is a marked editorial bracket insertion (explaining what "last two dimensions" means) and the ellipsis correctly elides one intervening sentence in order — exactly the "marked bracket-plus-ellipsis editorial insertion" class DEC-20260905-C/D excuse.
3. `DEC-20260321-A.md` line 67: quoted grep pattern `"schedule_tier\|scheduleTier\|ORDER BY"`. **Checker miss.** Same class as #1: a backtick-delimited shell command wrapping across lines. Independently re-run and confirmed accurate (matches only `internal-tests.ts`, no `ORDER BY schedule_tier` in `solutions.ts`).

All three residuals are checker misses, not defects.

### Findings

1. **`DEC-20260409-D.md` line 64-66 — false statement about repository state.** The record's Context section states: "No record for `DEC-20260409-C` exists in this repository (it is an unresolved collision id in `docs/decisions/id-collisions.yaml`), so no `amends`/`supersedes` relation edge to it is recorded here." At the reviewed commit this is false on both counts: `docs/decisions/id-collisions.yaml` lines 203-219 show `DEC-20260409-C` with `resolution_status: resolved` (not unresolved), and a formal record file exists at `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md`. That sibling record's own Reversal-conditions section explicitly acknowledges the gap ("`DEC-20260409-D`'s own merged Context section already states it cannot target `DEC-20260409-C` because no record existed for it at the time it was written. That gap is now closed by this record's existence, but this batch does not edit the protected `DEC-20260409-D` record to add the edge.") — so the discrepancy is known and disclosed elsewhere, but the claim in `DEC-20260409-D` itself remains uncorrected and reads as a present-tense fact about the repository, not a dated claim. Not withdrawn by `DEC-20260905-B`, `-C`, or `-D`. Evidence: `docs/decisions/id-collisions.yaml:203-219`; `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md`.

2. **`DEC-20260320-F.md` line 39-42 — false statement about repository state.** The Context section states: "OpenSanctions commercial API confirmed at EUR 0.10 per call (`DEC-20260320-E`, named in this row's Rationale; no formal record exists for that ID on `main` and it is not in `docs/decisions/id-collisions.yaml`, so it is mentioned here in prose only, per this batch's relation-edge scope)." The "not in `id-collisions.yaml`" half is true (confirmed, no match), but "no formal record exists for that ID on `main`" is false: `docs/decisions/records/DEC-20260320-E.md` exists in this repository, in this same batch, decided the same day (2026-03-20), and I reviewed it in full as part of this partition — it is a complete, well-formed formal record (CAUTION banner, five sections, its own evidence array even cites `docs/decisions/records/DEC-20260320-F.md` back). `DEC-20260320-F` should carry a `related_to`/`amends` relation to `DEC-20260320-E` rather than treating it as prose-only. Not withdrawn by any of the three amending records. Evidence: `docs/decisions/records/DEC-20260320-E.md`.

3. **`DEC-20260405-A.md` line 67-70 — false statement about repository state.** "Phase 4, a separate decision on `credit-report-summary` (`DEC-20260405-B`, no formal record exists for that id on `main` and it is not in `docs/decisions/id-collisions.yaml`, so it is mentioned here in prose only)." Both halves are false: `docs/decisions/id-collisions.yaml` lines 140-155 list `DEC-20260405-B` as `resolution_status: resolved`, with **two** rows both dispositioned `formal_record`, and both record files exist (`DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md` and `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md`). Not withdrawn.

4. **`DEC-20260405-A.md` line 76-77 — same defect, second instance in the same record.** "It names as related: `DEC-20260225-P-m5n6` (the original Allabolag choice; no record exists, mentioned in prose only)..." False: `docs/decisions/records/DEC-20260225-P-m5n6.md` exists — a bare-key (non-colliding) formal record, "Fuzzy natural-language input on Swedish company lookup via a cheap LLM call," decided 2026-02-25. Not withdrawn.

All four are the same defect class (a "no record/collision exists" claim, accurate when the record was originally drafted, made false by a later batch creating the record it denies) recurring in three of my 41 files. None is covered by `DEC-20260905-B`, `-C`, or `-D`'s withdrawal lists, and none is a byte-level/punctuation/convention-covered issue — each is a substantive, checkable, false claim about which files exist in this repository at the reviewed commit.

No other findings. Every other quotation, evidence path, relation target, and null/populated-field claim in the partition checked out.

### Ten code-claim spot checks (file + line)

1. `apps/api/src/routes/public-trust.ts:23-29` — confirms `DEC-20260313-C`'s claim that the badge comment reads "that Strale runs its own tests against this capability — not that the capability is currently healthy," and that `tested`/`pass_rate` fields exist, not a literal "Unverified" SQS label.
2. `apps/api/src/routes/do.ts:1987` and surrounding (`executeSync`, `execution_failed`, async debit/refund comments) — confirms `DEC-20260315-I`'s DEC-14 lock→execute→debit-on-success claims for both sync and async paths.
3. `apps/api/src/lib/trust-grade.ts:171-204` plus a repo-wide grep for `computeTrustGrade` — confirms `DEC-20260316-A`'s claim that the Combined Trust Grade function is dead code with zero external callers.
4. `apps/api/src/lib/interrupt-sender.ts` header comment plus `grep -rn "sendInterruptEmail" apps/api/src` — confirms `DEC-20260317-A`'s claim the interrupt-email path is built but has zero callers.
5. `apps/api/scripts/onboard.ts` flag parsing and `apps/api/src/capabilities/auto-register.ts` — confirms `DEC-20260318-A`'s claim that `seed.ts` is gone and the manifest pipeline is current.
6. `apps/api/src/lib/capability-readiness.ts:1-16` (`ReadinessCheck.dimensions`, 8 fields) — confirms `DEC-20260320-A`'s claim the readiness checker's dimension count grew from 6 to 8, attributed to `DEC-20260423-B`.
7. `apps/api/src/lib/test-runner.ts` "Removed" comment naming `persistDualProfileScores` — confirms `DEC-20260323-A`'s claim the row's named writer function no longer exists.
8. `design/tokens/active.json` (grep for all seven hex values, zero matches; `"accent": "#2563EB"` is the only accent entry) — confirms `DEC-20260329-A`'s claim the seven-color palette is not in the canonical token file.
9. `apps/api/src/capabilities/swedish-company-data.ts:6-11` plus `git log -1 --format=%ci cb787ed9b2fbfadf61ea401c29d1fd47ac4e9214` (2026-04-22) — confirms `DEC-20260405-A`'s claim the Bolagsverket migration shipped, thirteen days after the row's "PARKED" note.
10. `apps/api/src/lib/entity-validation.ts` plus `grep -rn "validateCompanyResult|buildValidationBlock" apps/api/src` (one hit, `capabilities/lib/northdata.ts:15,206`, which is itself unimported by any executor) — confirms `DEC-20260409-B`'s claim the cross-validation module has exactly one, orphaned, consumer.

(Well over ten files were in fact directly verified during this review; the above ten are a representative sample per the brief's requirement.)

### Unverifiable

Nothing in this partition was left unverifiable — every quotation, evidence path, relation, code claim, and existence claim was checked directly against a file, a parsed Notion row, or the frontend checkout at the pinned commit.

### Summary

- Structural checks (frontmatter parses; `record_key`/`id`/filename agreement; CAUTION banner; five protected sections): 41/41 pass.
- Evidence-path existence (repo files and cross-repo `strale-io/strale-frontend@04c9fca9` entries): 41/41 pass.
- Null/populated-field quotation checks: pass (spot-checked 8 rows against the parsed export).
- Relation-target existence and substantiation: pass, including the two `DEC-20260409-D` relations (to `DEC-20260409-A`, narrated in `DEC-20260409-A.md`'s own body; to `DEC-20260409-B`, substantiated by `DEC-20260905-D` item 7, an amending record, per the convention `DEC-20260905-D`'s own Rationale states).
- Quote fidelity (operator checker + manual): 159/162 automatically faithful, 3/3 residuals classified as checker misses, zero confirmed misquotations.
- Repository-state factual claims: **4 confirmed false statements across 3 records** (Findings 1-4 above), none withdrawn by any existing amending record.

Given four confirmed, unwithdrawn false statements about repository state (not style, not a byte-level quote defect) in this partition, the partition does not pass clean.

PARTITION VERDICT: FAIL

### P2b

# Closing review, round 4 (final round), partition P2

Commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
Record count: 41 (docs/decisions/records/DEC-20260310-E.md through DEC-20260411-B.md, per closing4-P2.txt)

### Method

Read every record's frontmatter and five protected sections directly. Fetched
every referenced Notion row via `python dump_rows.py p2_rows.json PAGE:<id> ...`
(40 pages for 41 records; DEC-20260320-B has no Notion evidence, only file and
CLAUDE.md evidence). For every quotation over 25 characters, normalized both
sides per the DEC-20260905-C convention (transliterate symbols, lowercase,
strip non-alphanumerics) and tested substring containment by hand against the
parsed row field, the named repository file at this commit, or the sibling
`strale-frontend` checkout (fetched via `git show 04c9fca9:<path>` after
`git fetch origin`). Then ran the operator checker,
`node scripts/m2-quote-fidelity.mjs --export decisions-export-raw.txt
--frontend C:/Users/pette/Projects/strale-frontend --only <each file> --json
p2-fidelity.json`, over exactly this partition's 41 files, and classified
every residual it reported.

Checker result: 41 records, 162 spans checked, 159 faithful, 3 residual.

#### Residuals, classified

1. `DEC-20260314-F.md:84` — quoted string `"completion_rate\|autonomous_completion\|autonomousCompletion"`. This is a literal grep pattern the record's own prose quotes as the search command it ran, not a quotation of a source document. Checker miss (quoted shell command, exempted class per DEC-20260905-C/D convention).
2. `DEC-20260320-A.md:96` — quoted span `"The last two dimensions [reliability and limitations] were added per DEC-20260423-B (Stage A, warning mode)... 34 caps shipped to prod with NULL reliability."` Verified directly against `apps/api/src/lib/capability-readiness.ts` lines 9-12: the file reads "The last two dimensions were added per DEC-20260423-B (Stage A, warning" (line 9) and "... 34 caps shipped to prod with NULL" (line 12). The bracketed `[reliability and limitations]` is a marked editorial insertion (the two dimension names, present elsewhere in the same file's comments), and the ellipsis correctly elides the middle. Faithful; checker miss (bracket-plus-ellipsis marked insertion, the same convention DEC-20260905-C excused for `DEC-20260420-G`).
3. `DEC-20260321-A.md:67` — quoted string `"schedule_tier\|scheduleTier\|ORDER BY"`. Same as residual 1: a literal grep pattern quoted as the command run, verified to actually match `apps/api/src/routes/internal-tests.ts` and not `solutions.ts` as the record states. Checker miss (quoted shell command).

All three residuals are checker misses under the established convention, not defects.

### Findings

1. **`DEC-20260320-E.md`, lines 74-77 (Consequences)** — misattributes content to the wrong YAML field. The record states: `config/env-manifest.yaml` carries an `OPENSANCTIONS_API_KEY` row "with a `cost_note` stating that no code reads it (OpenSanctions was dropped as a vendor on 2026-04-27, commit 16ca790, DEC-20260429-A single-vendor on Dilisense), and that the key and the account are kept on purpose, per DQ-30 and the founder's call of 2026-09-03, because the vendor may be needed again and the free tier costs nothing to hold." That content is verbatim-adjacent to the row's `purpose` field ("OpenSanctions sanctions/PEP screening. No code reads it: OpenSanctions was dropped as a vendor on 2026-04-27 (commit 16ca790, DEC-20260429-A single-vendor on Dilisense). The key and the account are kept on purpose — DQ-30, founder's call 2026-09-03 — because the vendor may be needed again and the free tier costs nothing to hold."), not to `cost_note`. The row's actual `cost_note` field reads something entirely different: "Held, not read. Documented so a credential audit reports it as a recorded decision rather than raising it again as a finding. An unused live credential is still a live credential; if it is ever not worth re-issuing, delete the Railway variable, not the account." Evidence: `config/env-manifest.yaml` lines 797-806 at this commit. The underlying substantive claim (the key is retained on purpose, unread) is correct; only the field attribution is wrong.

2. **`DEC-20260409-D.md`, frontmatter `relations`** — declares a `related_to` relation to `DEC-20260409-A` that is not substantiated anywhere. The record's own body (Context, Rationale, Consequences) never names or discusses `DEC-20260409-A` in prose (confirmed by direct grep: `DEC-20260409-A` and `DEC-20260409-B` appear in this file only in the frontmatter `relations` block, lines 12 and 14). `DEC-20260905-C`'s Consequences section explicitly flagged both relations as an open gap ("`DEC-20260409-D`'s two undeclared-substantiation relations (`DEC-20260409-A`, `DEC-20260409-B`)... outside the five classes this record withdraws statements under" — i.e. acknowledged but deliberately not resolved). `DEC-20260905-D` item 7 later substantiates the `DEC-20260409-B` half of that gap (from the two rows' own text), but its substantiation names only `DEC-20260409-B`; it does not mention or substantiate the `DEC-20260409-A` relation at all (confirmed: `DEC-20260409-A` appears in `DEC-20260905-D.md` only once, in the evidence array, not in the Decision-section prose substantiating item 7). So `DEC-20260409-D`'s declared relation to `DEC-20260409-A` remains, as of this commit, a real structural relation-substantiation gap that no record — the amended record's own body, or any amending record — has closed. This is a finding under requirement (6) (relations must be substantiated in the body, or in an amending record per the round-3 convention); it is not resolved by any withdrawal already on the books.

No other findings. All 41 records: frontmatter parses; `record_key`/`id`/filename agree (verified programmatically for all 41); the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present in every record (verified programmatically); no null field is quoted as populated or vice versa in any record I checked against parsed rows; every `evidence` entry that names a repository file exists at this commit (verified programmatically, zero missing); every cross-repo `strale-io/strale-frontend@04c9fca9:<path>` entry resolves (`App.tsx`, `Header.tsx`, `index.css`, `Index.tsx`, all fetched and checked line-by-line); every other declared relation target (`DEC-20260314-B`, `DEC-20260314-A`, `DEC-20260320-B`, `DEC-20260409-A`, `DEC-20260409-B`, `DEC-20260302-A-0001`) exists as a record file at this commit and is not a bare collided id per `docs/decisions/id-collisions.yaml`, and is substantiated in body prose except for the one gap noted in Finding 2.

Statements already withdrawn by `DEC-20260905-B`, `-C`, or `-D` and still present verbatim in the amended records (as expected, since amended records keep their original text) were checked and are correctly classified as withdrawn, not new findings:
- `DEC-20260313-C`: "It does not hold on the website... isSQSUnqualified filter..." (B item 1); "still listed, signal absent rather than faked" (C item 19).
- `DEC-20260330-B`: rule-12 quotation of `context7.json` (B item 2).
- `DEC-20260314-F`: "AX is not a nice-to-have" comma-joined quote (B item 9); "five free capabilities" (C item 20).
- `DEC-20260314-A`: Dev.to #1 tweets-v2.md composite quote (B item 10).
- `DEC-20260321-A`: "4x overdue" transliteration (B item 11).
- `DEC-20260310-F`: "the pipeline generates all 5 test types... and verifies..." stitched quote (C item 18).
- `DEC-20260315-H`, `DEC-20260317-F`: "armed in prod" / "armed in prod, not dry-run" misattributed to CLAUDE.md (C items 21, 25).
- `DEC-20260316-B`: "letters as secondary, never the primary headline" (C item 22).
- `DEC-20260317-A`: digest-sender.ts header-comment misattribution; false "not a formal record" claim about DEC-20260511-F (C items 23-24).
- `DEC-20260318-A`: "the workflow that scales to third-party providers" misattributed to its own row (C item 26).
- `DEC-20260320-A`: "manual, 312-line app.ts import list" composite; "one production call site... no other" overclaim (C items 27-28).
- `DEC-20260323-A`: "read-time decay eliminated, write-time decay in force" fabricated row-quote (C item 30).
- `DEC-20260409-D`: "one representative solution per category against canonical test inputs" dropped-parenthetical quote (C item 32).

### Ten-plus code-claim spot checks (file, line)

1. `DEC-20260313-E.md` — `strale-io/strale-frontend@04c9fca9:src/components/Header.tsx` line 10 defines `{ label: "Trust", href: "/trust" }`. Confirmed by `git show 04c9fca9:src/components/Header.tsx`.
2. `DEC-20260313-F.md` — `server.json` line 10/15 state `"version": "0.2.3"`; `packages/mcp-server/package.json` line 4 states `"version": "0.2.8"`. Confirmed directly.
3. `DEC-20260314-G.md` — `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` lines 145-148 render the exact hero headline. Confirmed by `git show`.
4. `DEC-20260315-I.md` — `apps/api/src/routes/do.ts` line 2068 "the catch block treats that as `execution_failed` and refunds nothing (no debit committed)"; `apps/api/src/lib/x402-gateway.ts` lines 104-106 and 391. Confirmed.
5. `DEC-20260316-A.md` — `computeTrustGrade` defined only in `apps/api/src/lib/trust-grade.ts:214`, zero other call sites in `apps/api/src`; `do.ts` imports only `computeFreshnessGrade`. Confirmed by repo-wide grep.
6. `DEC-20260318-A.md` — `seed.ts` absent from `apps/api` (`git ls-files` no match); `CLAUDE.md:334` quote confirmed verbatim; `onboard.ts` flags `--dry-run/--backfill/--strict/--fix/--discover` present at lines 13-17.
7. `DEC-20260320-A.md` — `apps/api/src/lib/capability-readiness.ts` defines exactly the 8 named dimensions (lines 53-69) and the DEC-20260423-B/34-caps comment (lines 9-12). Confirmed.
8. `DEC-20260321-A.md` — `apps/api/src/routes/solutions.ts:96` calls `worstFreshnessLevel(...)`; no `ORDER BY schedule_tier` clause exists in `solutions.ts` or `internal-tests.ts`. Confirmed by grep.
9. `DEC-20260323-A.md` — `apps/api/src/db/schema.ts` still declares `qp_score`/`rp_score`/`matrix_sqs`/`trend`/`guidance_*`/`sqs_daily_snapshot`/`capability_health`; no `legacy_score` or `source_health` anywhere. Confirmed.
10. `DEC-20260324-A.md` — `apps/api/src/lib/x402-gateway.ts` imports `createFacilitatorConfig` from `@coinbase/x402` (line 21) and implements the `auto/cdp/legacy` selection exactly as described. Confirmed.
11. `DEC-20260405-A.md` — commit `cb787ed9` dated 2026-04-22 (`git log`), `swedish-company-data.ts:8` comment matches verbatim, manifest `data_source` matches verbatim.
12. `DEC-20260409-A.md` — `apps/api/src/lib/null-field-ratio.ts` header rules (lines 10-13) and `test-runner.ts`'s `NULL_RATIO_RULE_ENABLED` flag (lines 1603-1604, 1706-1728) match verbatim.
13. `DEC-20260410-A.md` — `apps/api/src/lib/progressive-unlock.ts`'s `UNLOCK_MAP` maps exactly the 5 named trigger capabilities to 3 targets each; `do.ts` comments cite DEC-20260410-A by id at lines 850 and 1716. Confirmed.
14. `DEC-20260411-B.md` — `apps/api/src/lib/gate5-path-coverage.ts` header (lines 7-14) matches verbatim; `bank-bic-lookup` is genuinely absent from both `gate5-path-coverage.ts` and `onboard.ts` (zero grep matches), confirming the record's own claim that only the row names it.

### Unverifiable

- `DEC-20260320-B.md`'s Consequences reference to "the capability-onboarding authority report" — no file or document by that exact name was found (a broad search for "onboarding-authority"/"onboarding_authority" turns up `archive/sessions/2026-09-01-m2-capability-onboarding-decision-plan.md`, `DEC-20260423-A.md`, `DEC-20260423-B.md`, none titled as such). Not held as a finding: it is a generic descriptive phrase, not a literal quotation with a named source, and its substance (the gap is preserved somewhere in the DEC-20260423-A/B lineage) is plausible from those files.
- `DEC-20260406-E.md`'s claim that a search for "Market Context" and "Competitive Landscape" returns no matches in `docs/strategy/` and `archive/sessions/` has one incidental case-insensitive hit (`archive/sessions/audit-output/_partial_mt_enumeration.md`, a lowercase "market context" inside an unrelated sentence about Kyckr pricing). This does not disturb the record's actual claim (that no canonical page or closeout artefact by that name exists); noted, not counted as a finding.
- Whether Glama's own TDQS re-scan (as opposed to the platform's own self-scoring) ever confirmed 6/6 for `strale-mcp` (`DEC-20260404-A`) — the record itself already states this is unconfirmed from repository evidence; not independently resolvable here either.
- Whether the "Silent" (not-on-pricing-page) half of `DEC-20260410-A` holds today — the record itself defers this to the frontend/pricing-page surface, outside this partition's evidence scope.

### Final verdict

PARTITION VERDICT: FAIL

### P3

# Closing review round 4, partition P3

Commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
Record count: 41 (April 2026 records, per closing4-P3.txt)

### Script used

Ran `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend C:/Users/pette/Projects/strale-frontend --only <file>` once per record in the partition (41 `--only` flags in one invocation). The script extracts every double-quoted span of the configured minimum length from a record's body, normalizes both the quotation and every candidate source (Notion row field, named repo file, sibling record, or frontend file) by transliterating `€`/`×`/`≥`/`≤`/`→`/`…`, lowercasing, and stripping all non-alphanumeric characters, then tests the quotation as a substring (an ellipsis splits it into ordered segments checked in order). It reports each span as faithful or residual; a residual is either a real defect or a checker miss (a faithful quote the tool's simple substring/best-match search could not locate).

Result: **41 records, 115 spans, 114 faithful, 1 residual.**

#### Residual, with classification

- `DEC-20260416-A.md:82` — quoted span `"the first-party MCP is the only surface that exposes Strale's differentiated metadata"`. The checker's best match was a different record (`DEC-20260901-A.md`, prefix match of 12 chars only), so it flagged this as unresolved. **Checker miss.** The quotation is the record's own self-reference to its own earlier Rationale text at line 49 of the same file: "...the first-party MCP is the only surface that exposes Strale's differentiated metadata (SQS, limitations, structured errors)." Verified by direct grep of the same file; the phrase is faithful to `DEC-20260416-A.md` itself, not to any other record. Not a defect.

I did not additionally run the checker over the whole corpus; I ran it scoped to this partition's 41 files directly, which is equivalent per the tool's own per-file independence.

### Findings

None. Every quotation in this partition's 41 records is either faithful to its named source (confirmed by the script, or by direct grep where the source was a repo file, a git commit, or a cross-referenced sibling record) or is a statement already withdrawn by `DEC-20260905-B`, `DEC-20260905-C`, or `DEC-20260905-D` (see below), which per this round's rule (a) is a correction, not a finding.

#### Statements withdrawn by the round 1-3 amending records, confirmed present and correctly classified as withdrawn (not new findings)

1. `DEC-20260413-A.md:90` — "aggressive addition when free to maintain" — withdrawn by `DEC-20260905-D` item 8. Confirmed present verbatim; the row's actual Rationale text ("added aggressively... when they cost nothing to maintain") differs as stated.
2. `DEC-20260419-A.md:106-107` — "a new file added to the allowlist requires a justification comment" attributed to the script's header comment — withdrawn by `DEC-20260905-B` item 3. Confirmed: `apps/api/scripts/check-no-new-console.mjs`'s actual header (lines 2-19) contains no such sentence.
3. `DEC-20260420-A.md:104` — "we still hand-write; just in TS, not SQL files" attributed to `DEC-20260511-C` — withdrawn by `DEC-20260905-C` item 33. (`DEC-20260511-C` not in this partition; withdrawal record's citation checked instead.)
4. `DEC-20260422-B.md:134` — "leave the row, mark it, don't delete" — withdrawn by `DEC-20260905-D` item 11. Confirmed present; the record's own Variant-2 text (lines 44-49) reads differently.
5. `DEC-20260425-A.md:177-180` — "sourced from a manifest-declared field per capability, replacing the current getProcessingJurisdictions heuristic based on capabilityType and transparencyTag" attributed to "this row's Decision" — withdrawn by `DEC-20260905-B` item 12 (correct field is Rationale, and the source uses a parenthetical, not a comma clause).
6. `DEC-20260427-H.md:54-57` — "No record for `DEC-20260420-H` exists in this repository..." — withdrawn by `DEC-20260905-D` item 12. Confirmed false as stated: `docs/decisions/records/DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md` exists and `docs/decisions/id-collisions.yaml` lists it with `disposition: formal_record`.
7. `DEC-20260427-I.md:83-84` — the fabricated "(Phase 2a/2b)" composite citing "DEC-20260427-I-1"/"-I-2" — withdrawn by `DEC-20260905-D` item 13. Confirmed: `auto-register.ts` lines 161 and 168 carry two separate, differently-worded comments, not one combined comment.
8. `DEC-20260427-I.md:109-110` — the reordered `polish-company-data.ts` quotation — withdrawn by `DEC-20260905-D` item 14. Confirmed: the file's actual comment (lines 17-19) has the two sentences in the opposite order.
9. `DEC-20260506-G.md:69-71` — "External spend: EUR 50/week" / "spending inside the EUR 50/week envelope" as substrings of `CHARTER.md` — withdrawn by `DEC-20260905-B` item 8. Confirmed: `CHARTER.md` uses the € glyph, not the literal string "EUR ", at both cited lines.
10. `DEC-20260506-G.md:87-88` — the Kyckr quotation misattributed to `DEC-20260507-D` — withdrawn by `DEC-20260905-C` item 38. Confirmed: the quoted sentence is `DEC-20260507-F.md:41-42`'s text verbatim; `DEC-20260507-D` never mentions Kyckr.
11. `DEC-20260507-D.md:68-69` — inserted "the" before "readiness program adopted" in the `DEC-20260812-A`/CLAUDE.md quotation — withdrawn by `DEC-20260905-D` item 17. Confirmed: `DEC-20260812-A.md`'s Decision begins "Adopt the Platform Readiness..." (no leading "The"); CLAUDE.md's DEC-20260812-A bullet begins "**Readiness program adopted.**"
12. `DEC-20260507-G.md:82-83` — "one day after `DEC-20260518` batch work" (should be two days before) — withdrawn by `DEC-20260905-C` item 39. Confirmed: commit `9ee19282` is dated 2026-05-16 (`git log` verified); `DEC-20260518-F.md` frontmatter reads `decided_at: 2026-05-18`.

#### Relations substantiated by amending records rather than narrated in the amended record's own body (per `DEC-20260905-D`'s stated rule, not a finding)

- `DEC-20260428-B.md`'s `related_to DEC-20260428-A` — never named in the record's own body; substantiated by `DEC-20260905-D` item 15 (both same-day decisions, `CLAUDE.md`'s "Pairs with DEC-20260428-A" note). Not a finding.

#### Reciprocal-narration gap excused by `DEC-20260905-B`

- `DEC-20260423-A.md`'s `supersedes DEC-20260422-C` is narrated in the target record (`DEC-20260422-C.md`'s Consequences: "`DEC-20260423-A` superseded this record...") rather than in the source record's own body. `DEC-20260905-B`'s Consequences section explicitly excuses this exact pair as a convention gap, not a finding.

### Checker residuals for this partition

Only one residual was produced for the 41 files in this partition (see "Script used" above): `DEC-20260416-A.md:82`, classified as a checker miss (faithful self-quotation within the same file). No other residuals.

### Ten code-claim spot checks (of many more performed)

1. `DEC-20260419-A.md` — claim that the console-guard's header comment does not contain a justification-comment requirement. Verified: `apps/api/scripts/check-no-new-console.mjs` lines 2-19 read as quoted in the record; no such sentence appears.
2. `DEC-20260415-A.md`/`DEC-20260415-B.md` — claim that `docs/company/VOICE.md` has no Section 2.7, no numbered rules, and no matches for "2.7", "Reddit", "deference", "market-claim", "engagement-bait". Verified: file is 57 lines, grep for all terms returns zero matches.
3. `DEC-20260427-H.md` — claim that `auto-register.ts`'s DEACTIVATED map still carries all five slugs with comments `DEC-20260427-H-1` through `-H-5`. Verified: all five comment markers found at lines 154, 205, 214, 223, 232.
4. `DEC-20260427-I.md` — claim that dutch/portuguese/lithuanian/spanish/german/austrian company-data capabilities carry `REACTIVATED`/`MIGRATED` comments naming compliant replacement sources. Verified: `auto-register.ts` lines 161 and 168 confirm dutch/portuguese; source files for austrian, swiss, polish, officer-search confirm the DEC-20260427-I removal-history comments cited.
5. `DEC-20260503-B.md` — claim that `apps/api/src/db/schema.ts` still defines `qpScore`, `rpScore`, `matrixSqs`, `matrixSqsRaw`, `guidanceUsable`, and a full `sqs_daily_snapshot` table. Verified: all present at the cited lines (220-232, 1003-1013).
6. `DEC-20260503-B.md` — claim that `test-scheduler.ts` retains the base `scheduled_testing_eligible = TRUE` filter plus a newer risk-tiered cadence comment. Verified: both present verbatim, including the "Daily SQS snapshot retired with the SQS engine (DEC-20260503-B)" comment at line 659.
7. `DEC-20260505-C.md` — claim that `apps/api/src/lib/matching.ts`'s `betterRate` function implements `priceCents ASC, slug ASC` with a specific cited comment block. Verified: the quoted code block matches lines 170-180 exactly, including the comment text.
8. `DEC-20260505-B.md` — claim that `apps/api/src/lib/lifecycle.ts`'s header states automatic transitions were removed per `DEC-20260503-B`, and `lifecycle-transition.ts` states `--sweep` mode was removed. Verified: both comments found verbatim.
9. `DEC-20260505-G.md`/`DEC-20260505-H.md` — claim that `german-company-data.ts` sources exclusively from OpenRegister with no Implisense reference anywhere in `apps/api/src`, and that `config/env-manifest.yaml` has an `OPENREGISTER_API_KEY` row but no Implisense row. Verified: no "implisense" hits anywhere in `apps/api/src` or `config/env-manifest.yaml`; OpenRegister API/key references confirmed.
10. `DEC-20260507-G.md`/`DEC-20260507-H.md` — claim that Bulgarian/Cypriot/Luxembourgish/Hungarian manifests all declare `data_source: Openapi.com WW-Top...` (not the direct Tier-1 self-build path decided), gated by `OPENAPI_ENABLED`, and that commit `84398f7` does not resolve while `9ee19282` does (dated 2026-05-16). Verified: all four manifests' `data_source` lines match exactly; `OPENAPI_ENABLED`'s env-manifest entry matches; `84398f7` is not a valid object in this repository; `9ee19282` resolves and is dated 2026-05-16 15:13:15 +0200.

(Additional spot checks beyond the required ten, not itemized above: commit-sha resolution for the five commits in `DEC-20260423-A`'s evidence array; commit `16ca790` for `DEC-20260427-A`/`DEC-20260427-B`; commit `d165ae2` for `DEC-20260425-B`; commit `31ca662e` for `DEC-20260504-A`; existence of `manifests/us-company-data-cobalt.yaml` and absence of any Kyckr reference for `DEC-20260507-F`; `DEC-20260812-A.md`'s Decision text for `DEC-20260422-H`; `DEC-20260430-A.md`'s Consequences text for the same record; `DEC-20260508-A.md`/`DEC-20260508-D.md` quotations cited by `DEC-20260507-H.md`/`DEC-20260505-H.md`/`DEC-20260507-E.md`.)

### Structural checks (all 41 records)

- Frontmatter parses; `record_key`, `id`, and filename agree for all 41 files (scripted check, zero mismatches).
- CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present in all 41 files (scripted check, zero missing).
- All evidence-array file paths (excluding URLs and the one cross-repo entry class, of which this partition has none) resolve to existing files at this commit (scripted check, zero missing).
- All frontmatter relation targets in this partition (24 distinct target lines across 15 files) resolve to an existing record file at this commit, and none is a bare collided id per `docs/decisions/id-collisions.yaml` (scripted check against the collisions file, zero hits).
- No `--notion-`/`--git-`-qualified record in this partition (all 41 are bare keys), so item (8) of the reviewer instructions does not apply to P3.

### Unverifiable

- `DEC-20260429-A.md`'s Consequences: "The source listed four review triggers: a monthly bill above EUR 1,500; customer or regulator demand for Strale-controlled dataset replay; an annual review in April 2027; or a Dilisense-initiated material terms change." The record's own evidence array cites two Notion URLs. The first (`35167c87082c8172bff8f3485699c961`, the Decision-DB row) was read via `dump_rows.py`; its Rationale field contains no such trigger list and no EUR 1,500 figure at all. The second (`35367c87082c8147a642e5fe3ac006a0`) is not a Decisions-DB row (`dump_rows.py` returns zero matches for it against the full 318-row export), so I could not read its content through the sanctioned method, and no repository file (including the cited `archive/sessions/2026-09-01-m2-vendor-stack-authority-gaps.md`) contains a matching trigger list. The record's own text separately and correctly notes the €100 figure from the cited handoff file (`handoff/_general/from-code/2026-04-29-dilisense-reseller-correspondence.md` line 43, verified) and explicitly flags "that inconsistency is preserved," which suggests the record's authors were aware of a discrepancy; I cannot confirm or refute the EUR 1,500 / four-trigger claim from any source available to me. Reporting as unverifiable, not as a finding.

### PARTITION VERDICT: PASS

### P4

# Closing review, partition P4

Commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
Record count: 41

Files reviewed (docs/decisions/records/, paths relative to that directory):
DEC-20260507-I.md, DEC-20260507-J.md, DEC-20260508-A.md, DEC-20260508-D.md,
DEC-20260510-A.md, DEC-20260511-B.md, DEC-20260511-C.md, DEC-20260511-D.md,
DEC-20260511-E.md, DEC-20260511-F.md, DEC-20260513-A.md, DEC-20260513-B.md,
DEC-20260513-C.md, DEC-20260513-D.md, DEC-20260513-E.md, DEC-20260515-A.md,
DEC-20260515-B.md, DEC-20260515-C.md, DEC-20260517-A.md, DEC-20260518-A.md,
DEC-20260518-B.md, DEC-20260518-C.md, DEC-20260518-D.md, DEC-20260518-E.md,
DEC-20260518-F.md, DEC-20260518-G.md, DEC-20260812-A.md, DEC-20260813-A.md,
DEC-20260815-A.md, DEC-20260820-A-WEBSITE-HERO.md,
DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md,
DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md,
DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md,
DEC-20260820-E-WEBSITE-SEARCH-WEB.md, DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md,
DEC-20260822-A.md, DEC-20260827-A.md, DEC-20260831-A.md, DEC-20260901-A.md,
DEC-20260904-A.md, DEC-20260904-B.md.

### Setup

Detached worktree at C:/tmp/strale-closing4-P4, npm ci (required three retries
after the environment repeatedly emptied node_modules mid-install; the final
successful state was produced by robocopying node_modules from the main
checkout's already-installed tree rather than a fresh install). Notion rows
read only via dump_rows.py against decisions-export-raw.txt. Cross-repo
evidence resolved in C:/Users/pette/Projects/strale-frontend after `git fetch
origin`.

At the end I ran `git worktree remove` for this path; git accepted it and the
path no longer appears in `git worktree list`, but a final `rm -rf` on the
leftover directory left a locked `node_modules/viem` subtree behind ("Device
or resource busy"). Checked for junctions first with PowerShell
`Get-ChildItem -Recurse -Force -Attributes ReparsePoint` — none found — so the
leftover is an inert, non-worktree directory, not a live checkout or a
symlink hazard.

### Script used

`node scripts/m2-quote-fidelity.mjs --export decisions-export-raw.txt
--frontend <frontend checkout> --only <each file>`. Logic in one sentence: it
extracts every double-quoted span of 25+ characters from each record's body
(masking fenced/inline code), normalizes both the quote and every candidate
source (Notion row fields, repo files at HEAD, the sibling frontend checkout,
and other decision records) per the stated convention, and reports a span
"faithful" when it is a substring (ellipsis segments checked in order) of at
least one candidate source, else "residual".

Totals: 41 records, 89 quoted spans, 82 faithful, 7 residual.

#### Residual-mismatch list and my classification (all: checker miss, not a defect)

1. `DEC-20260508-A.md:78` — `"a Tier-1 path exists but has a fixed floor,"`.
   Checker miss. This is the record's own Rationale-section paraphrase,
   contrasted in its own voice against `"no Tier-1 path exists"` — neither
   span is attributed to a named source; the quote marks are rhetorical
   emphasis on the record's own characterization of what changed, not a
   claim of verbatim sourcing. Nothing to verify against.
2. `DEC-20260510-A.md:86` — `"promote a useful handoff note to tracked,"`.
   Checker miss, same pattern: the record's own paraphrase of the general
   problem class, used for comparison against a real quoted PROGRAM.md
   sentence earlier in the same paragraph (which the checker did mark
   faithful). Not attributed to any source.
3. `DEC-20260518-B.md:55` — `"can this country deliver T1/T2/T3"`.
   Checker miss. The record's own illustrative phrasing of what an audit
   verdict would look like ("answers of the form ..."), not a quotation of
   any row, file, or record.
4. `DEC-20260518-D.md:43` — `"does Strale return this today"`.
   Checker miss. The record's own rhetorical restatement of "the second
   question" it is contrasting with jurisdictional accessibility; not
   attributed to a source.
5. `DEC-20260827-A.md:40` — `"licensed contract with the Austrian
   Justizministerium for direct Firmenbuch API access"`. Checker miss, not
   a defect: I dumped the DEC-20260827-A Notion row directly
   (page 3c967c87082c81be9ebac7982b89a36a) and its own Rationale field
   contains this exact phrase verbatim, in a parenthetical crediting
   DEC-20260427-I-6. DEC-20260427-I-6 is not a separately migrated formal
   record (it is a sub-item id inside a different row, the same pattern as
   DEC-20260427-H-4 inside DEC-20260427-H), so the checker's record-file
   resolver has nothing to match it against and falls back to an unrelated
   file. Source that makes it faithful: the DEC-20260827-A row's own
   Rationale field.
6. `DEC-20260904-A.md:180` — the `"Every row reaches formally_migrated,
   intentionally_historical, or obsolete_or_superseded through
   contradiction-checked batches, ... or an explicitly reviewed rule
   classifies pre-readiness feature-scope rows as evidence-only."` quote.
   Checker miss, not a defect: `docs/project/m2-closure-register.yaml` line
   5129-5131 (G1's `closes_when` field) reads exactly this text word for
   word (markdown `**...**` emphasis in the record is not present in the
   YAML, which the convention discounts). The record's own frontmatter
   `evidence` array does not list `m2-closure-register.yaml` explicitly
   (an evidence-completeness gap, not a quote-fidelity defect — the file is
   named in the prose itself: "G1's `closes_when` clause in
   `docs/project/m2-closure-register.yaml`"), which is why the checker's
   record/file matcher missed it.
7. `DEC-20260904-B.md:102` — `"where did this id's authority come from"`.
   Checker miss. The record's own rhetorical framing in its Rationale
   section ("keeps one grammar for ... rather than inventing a second
   mechanism"), not attributed to any source.

### Findings

None. No statement in this partition's 41 records is false, fabricated,
misattributed, or unverifiable beyond the one item listed under
"Unverifiable" below. Two statements in this partition are pre-corrected by
the withdrawal records per this round's rule (a) and I re-verified each
correction is itself right, so neither counts as a finding against the
original record:

- `DEC-20260511-C.md:85-86` attributes `"CC does not reconcile silently"` to
  "the 2026-05-13 cleanup prompt." `DEC-20260905-B` item 6 withdraws this
  attribution. I confirmed directly: the phrase does not appear in
  `handoff/_general/from-code/2026-05-13-drizzle-quirks-verification.md`, and
  does appear, verbatim, in
  `handoff/_general/from-code/2026-05-06-chromium-phase3-halt-partial-flag-survival.md:61`
  ("But CC does not reconcile silently."). The correction is right.
- `DEC-20260515-A.md:153` states `"The commit id this row cites, `34036a0`,
  does not resolve on `main`."` `DEC-20260905-C` item 40 withdraws this from
  DEC-20260515-A (the correct home for the claim is its sibling
  DEC-20260515-B, whose own Source field names `34036a0`). I confirmed
  `git cat-file -e 34036a0` fails (`fatal: Not a valid object name`), so the
  underlying fact is true; DEC-20260515-B's own, independent instance of the
  same claim (line 129 of that file) is correct on its own terms and is not
  itself withdrawn by anything. The correction is right.

Frontmatter, `record_key`/`id`/filename agreement, the CAUTION banner, and all
five protected sections were checked programmatically for all 41 records:
zero mismatches, zero missing sections, zero missing banners.

Relations: every `relations[].target` in this partition resolves to an
existing record file (`<target>.md`) at this commit; none is a bare id listed
in `docs/decisions/id-collisions.yaml`. Every relation edge I read in the body
is substantiated by ordinary prose naming the target and stating what the
edge rests on (amends/affirms/interprets/supersedes/related_to all have a
sentence explaining the basis; several — `DEC-20260813-A`, `DEC-20260820-D`,
`DEC-20260820-F` — carry the fuller "Relation to X" style paragraph, but its
absence elsewhere was never the only substantiation available).

Null-field claims: every "field X is null" / "is populated" claim in this
partition (DEC-20260507-I, -J; DEC-20260510-A; DEC-20260511-B, -E, -F;
DEC-20260513-A, -B, -C, -D) matches the parsed Notion row's actual null-field
list exactly, cross-checked against dump_rows.py output for each row.

Evidence-path existence: every repo-relative evidence path in this partition
exists at this commit (checked programmatically for all 41 records plus
individually for commit-sha and cross-repo entries). Two items needed manual
handling:
- `DEC-20260508-A.md`'s evidence array includes a plain external URL
  (`https://occsz.e-cegjegyzek.hu/...pdf`), a Hungarian-language regulator PDF.
  This is neither a repo file, a cross-repo entry, nor a Notion URL, so it
  falls outside what I can mechanically verify; listed under Unverifiable.
- `DEC-20260822-A.md` cites `strale-io/strale@3f7f650ff070f667a425b743f5a97034bc43f4a3`,
  an in-repo commit written in the cross-repo `org/repo@sha` shape. Verified
  directly: `git cat-file -e 3f7f650ff070f667a425b743f5a97034bc43f4a3` succeeds
  at this commit. Not a defect.

Collision-registry cross-check: `DEC-20260812-A`'s Consequences section
states the `DEC-20260502-A` edge and both colliding rows are withheld and
preserved in `docs/decisions/id-collisions.yaml`. Confirmed:
`id-collisions.yaml:415-430` lists `DEC-20260502-A` as a resolved collision
with two records, one of which is the `--notion-`-qualified
`DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`.

No record in this partition is itself a `--notion-`-qualified filename, so
check (8) (registry entry + register-row cross-check for a qualified record)
does not apply to any file in P4. (`DEC-20260904-B` discusses the mechanism
for a future `--git-`-qualified record but is not itself qualified.)

### Ten code-claim spot checks (of many more verified; file : line)

1. `apps/api/src/lib/startup-migrations.ts:573-609` — block 0066's header
   comment matches `DEC-20260511-B.md`'s quoted text on the 2026-08-21 finding
   and the partition-the-table fix, word for word.
2. `apps/api/src/lib/meta-monitoring.ts:421-429` — the staleness-anchor header
   comment matches `DEC-20260511-E.md`'s quoted text exactly, including the
   2026-05-07→2026-05-11 SI dates.
3. `apps/api/src/jobs/daily-digest.ts:1-6`, `apps/api/src/jobs/test-scheduler.ts:1020-1022`,
   `apps/api/src/routes/admin.ts:355`, and a repo-wide grep for
   `sendInterruptEmail` (zero callers outside its own file) all confirm
   `DEC-20260511-F.md`'s claims about the digest being manual-only with no
   cron trigger.
4. `manifests/swiss-company-data.yaml:97` — `known_answer` fixture uid is
   `CHE-101.602.521`, matching `DEC-20260513-B.md`'s stated corrected value.
5. `apps/api/src/jobs/test-scheduler.ts:225-249` (`slugStaggerMinute`) and
   `:305-339` (`findOverdueSuites`) match `DEC-20260513-C.md`'s quotations
   exactly, including the wrong-DEC-id citation finding and the N×N
   duplicate-suite bug quote.
6. `manifests/danish-company-data.yaml:119,121,159-160` — `data_source`,
   `transparency_tag: mixed`, and the 12-months-old limitation all match
   `DEC-20260513-D.md`'s Consequences claims.
7. `manifests/croatian-company-data.yaml` and `manifests/swiss-company-data.yaml`
   both price at `price_cents: 5`, matching `DEC-20260513-E.md`'s "prices
   held" claim.
8. `docs/company/DECISION-QUEUE.md:17-20,29-30` (DQ-30) and
   `config/env-manifest.yaml:302-309` (`COBALT_API_KEY` cost_note) match
   `DEC-20260515-A.md`'s dormancy claims word for word.
9. `apps/api/src/capabilities/uk-company-data.ts:226-227` and
   `apps/api/src/capabilities/danish-company-data.ts:183-184` match
   `DEC-20260518-A.md` and `DEC-20260518-D.md`'s per-country `ubo_availability`
   claims exactly.
10. `gh pr view 410/414` (merged 2026-08-27) and
    `docs/company/DECISION-QUEUE.md:235-241` (DQ-20) match `DEC-20260827-A.md`'s
    Consequences claims about shipping and activation.

Additional spot checks performed beyond the required ten: `gh pr view 131`
(`DEC-20260518-A/B/C/D`), `gh pr view 137` (`DEC-20260518-E`), `gh pr view
361/362` (`DEC-20260822-A`), the four `apps/api/coverage-matrix/` files plus
two commit shas (`DEC-20260517-A`), `apps/api/src/db/schema.ts`'s
`capability_health` columns and `POST /v1/admin/reset-circuit-breaker`
(`DEC-20260513-B/D`), `test -d apps/web` (`DEC-20260513-A`), three
cross-repo frontend files/directories at `f704cb2` (`DEC-20260513-A`,
`DEC-20260820-A` through `-F`, including the 56-checks-zero-failures line in
`round-09-four-world-responsive-review/four-world-conformance-report.md`),
`docs/decisions/id-collisions.yaml` (`DEC-20260812-A`), the git-native
finding codes `RECORD_GIT_KEY_*`, `RECORD_KEY_BARE_CROSS_SURFACE_ID`,
`CROSS_SURFACE_FORMAL_RECORD_UNSUPPORTED`, `DECISION_ROW_CROSS_SURFACE_STATE_INVALID`,
`COMMIT_UNVERIFIABLE` in `scripts/m2-closure-register-lib.mjs`, and the
regex pattern in `scripts/decision-records-lib.mjs` plus both
`docs/project/schemas/*.json` files (`DEC-20260904-B`), and
`docs/project/m2-closure-register.yaml`'s `counts.decision_rows` block plus
three spot-checked page-id-to-id mappings among the 76 rows
(`DEC-20260904-A`).

### Unverifiable

- `DEC-20260508-A.md`'s evidence entry
  `https://occsz.e-cegjegyzek.hu/Utmutatok/ÁSZF_IM_disztributor_20250312.pdf`
  (a Hungarian regulator's ToS PDF) is a plain external URL, not a repo file,
  cross-repo entry, or Notion page. I did not fetch it. The record's own
  quoted figures from it (§16, the HUF/EUR pricing) are drawn from the row's
  Rationale field, which I did verify against the Notion export, so this
  affects only the raw PDF citation itself, not any quoted content.

### Script residuals

See the numbered list above (7 residuals, all classified as checker misses,
not defects).

PARTITION VERDICT: PASS

### P5

# Closing review, round 4 (final round), partition P5

Commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
Record count: 34

### Method

Detached worktree at the pinned commit (`C:/tmp/strale-closing4-P5`, `npm ci`
run there). For every record in the partition list I checked: frontmatter
parses and `record_key`/`id`/filename agreement; the CAUTION banner and the
five protected sections (Decision, Context, Rationale, Consequences, Reversal
conditions); evidence-path existence (local files at this commit, and
cross-repo `strale-io/strale-frontend@04c9fca9:<path>` entries resolved via
`git -C C:/Users/pette/Projects/strale-frontend show <sha>:<path>` after
`git fetch origin`); relation targets existing as record keys at this commit,
substantiated in body prose, and never a bare collided id
(`docs/decisions/id-collisions.yaml`); no null field quoted and no populated
field called null, checked against the parsed Notion export via
`dump_rows.py` for all 34 page ids in this partition; and, for every
`--notion-` qualified record (all 34 are), that `docs/decisions/id-collisions.yaml`
names the page id with `disposition: formal_record` and the same
`record_key`, and that `docs/project/m2-closure-register.yaml`'s row for
that page id carries `disposition: formally_migrated` with the same key
(automated with a small Python script reading both files).

I also ran the operator checker:
`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --only <file>` once per record in this partition (34 `--only` flags in one invocation). The
checker extracts every double-quoted span of >=25 characters, normalizes
both the quote and every candidate source (Notion row fields from the
export, repo files at this commit, the sibling frontend checkout, other
decision records) per the stated convention, and reports a span as a
residual when no candidate source contains it as a substring (ellipsis
segments checked in order).

Result: **34 records, 159 spans, 158 faithful, 1 residual.**

### Checker residual, classified

- `docs/decisions/records/DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md`,
  line 65: quoted text "Part 2, the cross-validation layer, was built as a
  standalone module but... file is itself orphaned: no capability executor
  under [wired into the solution executor]; the cross-validation half is
  dead code." attributed to `docs/decisions/records/DEC-20260409-B.md`'s own
  Consequences section.
  **Classification: real defect (finding), not withdrawn by DEC-20260905-B,
  -C or -D.** `DEC-20260409-B.md` does contain "Part 2, the cross-validation
  layer, was built as a standalone module but" (line 86-87) and does contain
  "the cross-validation half is dead code" (line 104), but the bracketed
  infill "[wired into the solution executor]" is not an elision marker for
  the text that actually follows "no capability executor under" in the
  source (which is "`apps/api/src/capabilities/` imports `northdata.ts`
  today..."); it instead splices in the phrase "wired into the solution
  executor" from a different sentence three paragraphs later (line 104,
  "**Net effect:** the context-propagation half of this decision is live
  and wired into the solution executor"), where that phrase describes the
  *other* half of the feature (context-propagation), the opposite of what
  this quotation implies it is doing (explaining why the cross-validation
  half is dead). This is a composite quotation presented as one continuous
  quote, with a fabricated connective clause, which the stated convention
  treats as a defect regardless of the ellipsis. I searched
  `DEC-20260905-B.md`, `DEC-20260905-C.md` and `DEC-20260905-D.md` for
  "cross-validation half is dead code" and "Part 2, the" and found no
  withdrawal of this specific quotation; item 19 of `DEC-20260905-D`
  addresses a different defect in the same record (a `DEC-20260320-G` vs
  `DEC-20260420-G` id-prefix typo in `DEC-20260905-C`'s Consequences
  section, not this quote).

No other residuals in this partition.

### Findings

1. `docs/decisions/records/DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md`,
   line 65: fabricated composite quotation attributed to `DEC-20260409-B.md`.
   See classification above for full evidence. This is a new finding, not
   previously withdrawn.

No other findings. Specifically checked and clean across all 34 records:
frontmatter/filename/record_key/id agreement (all OK); CAUTION banner and
all five protected sections present in all 34 files; all local evidence
paths exist at this commit; all 14 cross-repo frontend evidence entries
(all citing `strale-io/strale-frontend@04c9fca9`) resolve in the sibling
checkout; no bare collided id used as a relation target; every relation
target (`DEC-20260320-B`, `DEC-20260405-B--notion-...0c920dd09d78aa06b6`,
`DEC-20260406-B--notion-...629339d9f208f65f52`, `DEC-20260409-A`,
`DEC-20260409-B`, `DEC-20260420-A`, and the `DEC-20260420-D/E/F/G` chain)
exists as a record key at this commit and is substantiated in ordinary
prose (one record, `DEC-20260320-C--notion-...81bfa5d1ee04b7d753dc.md`, uses
a labelled "Relation to" paragraph; the rest substantiate in ordinary prose
naming the target and stating the mechanism, which the round's rules treat
as sufficient); all 34 `--notion-` records' collision-registry entries carry
`disposition: formal_record` with the matching `record_key`, and all 34
closure-register rows for the same page ids carry `disposition:
formally_migrated` with the matching `record_key` (script-verified, see
Method).

Two records in this partition (`DEC-20260420-D--notion-...81f0827eedf29d133600.md`
and `DEC-20260406-C--notion-...819cabf6d47331d695ce.md`) contain statements
already withdrawn by `DEC-20260905-D` item 34 (the `PII_CATEGORY_ENUM`
"exactly as this row specifies" over-claim, now 14 entries not 12) and by
`DEC-20260905-C` item 31 (the `VOICE.md` "No jargon, ever" quotation, since
replaced by the DEC-20260905-A rewrite) respectively. Per the round's rule
(a), these are corrections, not findings against the original records, and
I independently re-verified both corrections are themselves accurate (see
code-claim spot checks 4 and 5 below).

### Ten code-claim spot checks

1. `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md` (line
   62-71): `failedRequests` table claim. Verified against
   `apps/api/src/db/schema.ts:678-697` -- table name, all named columns
   (`id`, `userId` nullable, `ipHash`, `task`, `category`, `maxPriceCents`,
   `failureType` default `"no_match"`, `errorDetail`, `userAgent`,
   `createdAt`) and the nullable-userId comment all match. Accurate.
2. `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md` (implicitly
   corrected by `DEC-20260905-D` item 29): `MIN_EXPECTED_EXECUTORS` gate.
   Verified against `apps/api/src/index.ts:10,19-30,345,394` --
   `const MIN_EXPECTED_EXECUTORS = 200;` exists, the gate calls
   `getRegisteredCount()`, throws `StartupFatalError` below threshold, and
   `main().catch` at line 345 calls `process.exit(1)` at line 394. Accurate
   as `DEC-20260905-D` states it.
3. `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md` (line 106,
   as corrected by `DEC-20260905-D` item 34): `PII_CATEGORY_ENUM`. Verified
   against `apps/api/src/lib/onboarding-gates.ts:242-259` -- 14 entries
   (the 12 the row named plus `nationality` and `political_affiliation`,
   with an inline "Added 2026-04-30" comment). The correction is accurate;
   the original record's "exactly as this row specifies" claim remains
   withdrawn, not a new finding.
4. `DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md` (line 75,
   as corrected by `DEC-20260905-C` item 31): `VOICE.md` writing rules.
   Verified against `docs/company/VOICE.md:13` -- current first rule reads
   "Use audience-appropriate terms (DEC-20260905-A)"; no "No jargon, ever"
   anywhere in the file at this commit. The correction is accurate.
5. `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md` (lines
   89-99): ToS-prohibited-scraping attribution claims. Verified
   `CLAUDE.md:299` contains "ToS-prohibited targets (DEC-20260420-H social
   platforms, DEC-20260427-H-4 Google)"; `docs/decisions/records/DEC-20260427-H.md:44-45`
   contains "DEC-20260420-H established that capabilities sourcing data via
   ToS-prohibited scraping are banned"; `docs/decisions/records/DEC-20260813-A.md:39`
   contains "the social-platform targets prohibited by `DEC-20260420-H`".
   All three attributions accurate.
6. `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md` (lines
   95-108): F-A-012 verify-endpoint hardening. Verified
   `apps/api/src/routes/verify.ts:19,24,29,256,362` -- `MAX_DEPTH = 50` with
   the exact F-A-012 comments quoted, and `apps/api/src/routes/transactions.ts:200,214` --
   `AUTH_VERIFY_MAX_DEPTH = 50` used the same way. Accurate.
7. `DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md` (lines
   79-98): CLAUDE.md Notion structure and repo-governance-shift claims.
   Verified `CLAUDE.md:182-189` (the 8-section list, no "Operating Manual"
   page named) and `docs/programs/README.md:1-6` ("Programs are execution
   records, not project truth... Project truth lives in `docs/project/`
   (candidate until M4) and `docs/decisions/`.") and
   `docs/company/CHARTER.md:14` ("day-to-day operation"). All accurate.
8. `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md` (lines
   72-95): suggest endpoint and frontend UI claims. Verified
   `apps/api/src/routes/suggest.ts:43,83` (`GET /v1/suggest/typeahead` and
   `POST /v1/suggest`, both public/no-auth as stated) and, in the sibling
   frontend checkout at `04c9fca9`, `src/components/solutions/SearchHero.tsx`
   (`placeholderIdx`, `PLACEHOLDER_QUERIES`, and the "SQS engine itself is
   gone" comment) and `src/components/solutions/RecommendationCard.tsx`
   ("Not what you need? Tell me more (arrow)" text and a "Copy code" action
   with a `Copy` icon). All accurate.
9. `DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md`: migration
   series reference list. Verified `docs/decisions/records/DEC-20260420-A.md`
   exists as a formal record and `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`
   exists as this batch's own record, matching the relation edges declared
   in frontmatter. Accurate.
10. `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`: registry
    binding and formal-record-existence claim (this is the record
    `DEC-20260905-D` item 12 discusses). Verified
    `docs/decisions/id-collisions.yaml:287-302` lists `DEC-20260420-H` as
    resolved with this exact `record_key` and `disposition: formal_record`,
    and the file itself exists in the repository at this commit. Accurate.

### Unverifiable

None. Every evidence path, relation target, registry binding, and sampled
code claim in this partition resolved to a definite true/false answer at
the pinned commit.

PARTITION VERDICT: FAIL

### P6

# Closing review, round 4 (final), partition P6

Commit: 65bf77f1b12813f9f94c42540f1f1272988ab1f3
Record count: 36 files (33 formal candidate records plus the three withdrawal
records DEC-20260905-B, DEC-20260905-C, DEC-20260905-D, included in the
partition list as normal candidate records to check like any other).

### Method

Worktree `C:/tmp/strale-closing4-P6` created detached at the pinned commit,
`npm ci` run there (Windows ENOTEMPTY/EPERM cleanup races forced several
retries; a targeted `npm install ajv commonmark yaml --no-save --ignore-scripts`
finally produced a working `node_modules` for the operator script). For every
record in the list: read the file directly and checked frontmatter parsing,
`record_key`/`id`/filename agreement, the CAUTION banner, the five protected
sections, every evidence path (existence at the pinned commit; two cross-repo
`strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` entries resolved
against the fetched sibling checkout), every relation target (file existence,
substantiation in body prose), every "Superseded By"/"Outcome"/"Source"
null-or-populated claim (checked against the parsed Notion export), and
sampled at least ten "status verified" code claims by reading the named file
at the pinned commit. For the 32 `--notion-` qualified records, checked
`docs/decisions/id-collisions.yaml` (collision entry names the page id with
`disposition: formal_record` and the matching `record_key`) and
`docs/project/m2-closure-register.yaml` (the `decision_rows` entry for that
page id carries top-level `disposition: formally_migrated`, nested
`collision.row_disposition: formal_record`, and the same `record_key`). For
the one `--git-` qualified record, verified `id`/`git_provenance`/
`source_kind: git-native`/`source_rows: []` in the register, that the full
evidence[0] SHA is an ancestor of the pinned commit (`git merge-base
--is-ancestor`), and that no other git-qualified record exists in the corpus.
Also ran a Node script directly calling `parseDecisionRecord` from
`scripts/decision-records-lib.mjs` on all 36 files to confirm frontmatter
parses, `record_key` equals the filename stem, the banner string is present,
and all five section headings are present — 36/36 passed.

Script used for quote fidelity: `node scripts/m2-quote-fidelity.mjs --export
<decisions-export-raw.txt path> --frontend <sibling checkout> --only <file>`
(one `--only` per file in the partition). Its logic in one sentence: for
every double-quoted span of 25+ characters in a record's body, normalize both
the quote and every candidate source (Notion row fields, named repo files,
sibling records, the frontend checkout) by transliterating the six named
symbols, lowercasing, and stripping all non-alphanumeric characters, then
test whether the quote (or, for an ellipsis-joined quote, each ordered
segment) is a substring of some candidate; anything that fails against every
candidate is reported as a residual with its best-partial-match candidate.

Result for the 33 non-withdrawal-authoring records: 0 residuals across all of
them (see per-file counts below). The only residuals in the whole partition
run come from the two withdrawal records themselves:

- `DEC-20260905-C.md`: 134 spans checked, 52 faithful, **82 residual**.
- `DEC-20260905-D.md`: 54 spans checked, 53 faithful, **1 residual**.

Classification of these 83 residuals: all are checker misses, not defects.
`DEC-20260905-C.md` is itself a document about quotations, built almost
entirely of `"<withdrawn quote>" ... Fact: ... reads "<correct quote>"`
constructions; the checker's span extractor lands its boundary in the
connective "Fact: ... reads" prose between two genuine quotations rather than
on a real quotation's own boundary, producing a non-quotation fragment it
then fails to match anywhere (exactly the mechanism `DEC-20260905-D`'s own
Consequences section (d) describes and quantifies as "82 ... self-referential
parsing artifacts inside `DEC-20260905-C.md`'s own body"). I spot-checked
several of these 82 by hand (e.g. line 380, 388, 403, 411, 430, 480, 502) and
confirmed each is a mid-sentence fragment straddling two real quotations, not
an unverified claim. The single `DEC-20260905-D.md` residual (line 451,
`"checker miss, faithful to a source"`) is a self-quotation of the record's
own descriptive phrase about its own reconciliation method, meta-commentary
about the review process rather than a claim requiring an external source —
the same class `DEC-20260905-D`'s own Consequences (c) excuses for
`DEC-20260421-A`'s "if nothing, say the plan is not tracked" self-quotation.
No real defect found by the checker anywhere in this partition.

Per-file fidelity counts (all 33 non-withdrawal-authoring records, 0
residual in every one):

```
DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md: 5/5 faithful
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md: 22/22 faithful
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md: 15/15 faithful
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md: 12/12 faithful
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md: 16/16 faithful
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md: 7/7 faithful
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md: 13/13 faithful
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md: 11/11 faithful
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md: 10/10 faithful
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md: 7/7 faithful
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md: 8/8 faithful
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md: 11/11 faithful
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md: 6/6 faithful
DEC-20260422-A--git-3b256587.md: 0/0 spans (no double-quoted spans of 25+ chars)
DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md: 0/0 spans
DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md: 5/5 faithful
DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md: [faithful, 0 residual]
DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md: [faithful, 0 residual]
DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md: [faithful, 0 residual]
DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9.md: [faithful, 0 residual]
DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md: [faithful, 0 residual]
DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76.md: [faithful, 0 residual]
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md: [faithful, 0 residual]
DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md: [faithful, 0 residual]
DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md: [faithful, 0 residual]
DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md: [faithful, 0 residual]
DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md: [faithful, 0 residual]
DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md: [faithful, 0 residual]
DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md: [faithful, 0 residual]
DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958.md: [faithful, 0 residual]
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md: [faithful, 0 residual]
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md: [faithful, 0 residual]
DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md: [faithful, 0 residual]
Totals for the partition: 36 records, 430 spans, 347 faithful, 83 residual
(all 83 in the two withdrawal records, all classified above as checker
misses).
```

I also independently spot-checked three Notion rows by hand, outside the
checker, using `dump_rows.py` (`DEC-20260421-A--...babd35`'s Cluster 2
Rationale, `DEC-20260505-D--...059f67`'s InfoCamere Rationale,
`DEC-20260512-A--...8122a2`'s KVK Rationale): all three matched the records'
quotations verbatim.

### Findings

None. No false, fabricated, misattributed, or unverifiable statement was
found in any of the 33 formal candidate records in this partition, and no
structural defect (frontmatter, banner, sections, evidence, relations,
null-field claims, collision/register bindings, git-native binding) was
found in any of the 36 files.

Two records in this partition (`DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438`
and `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711`) contain
statements that `DEC-20260905-B` and `DEC-20260905-D` respectively withdrew
in earlier rounds ("eight `HMRC_*` rows"; "migrated to a direct API or a
licensed aggregator"). Per this round's rule, these are corrected, not
findings against the original records — but I independently re-verified both
corrections against source: `config/env-manifest.yaml` carries exactly seven
`HMRC_*` rows (`HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_REQUESTER_VRN`,
`HMRC_SANDBOX_CLIENT_ID`, `HMRC_SANDBOX_CLIENT_SECRET`, `HMRC_TEST_VRN`,
`HMRC_USE_SANDBOX` — confirmed by direct grep), and the Notion row for
`DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711`'s Decision and
Rationale fields both read "direct APIs or licensed aggregator contracts" /
"direct government-registry API or a licensed commercial aggregator", so
`DEC-20260905-D`'s correction (dropped qualifiers "government-registry" and
"commercial") is itself correct. Neither correction is wrong; no finding
follows.

### Structural checks (36/36 pass)

- Frontmatter parses via `parseDecisionRecord` for all 36 files.
- `record_key` equals the filename stem (minus `.md`) for all 36.
- `id` equals `record_key` with any `--notion-<32hex>` / `--git-<sha>`
  qualifier stripped, for all qualified records (verified by inspection
  during reading, e.g. `DEC-20260420-I--notion-...` → `id: DEC-20260420-I`).
- The CAUTION banner and all five protected section headings (`## Decision`,
  `## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`)
  present in all 36.
- No local-file evidence path was missing (programmatic check across all
  evidence arrays in the 32 collision-qualified records plus the git and
  502-A record).
- Both cross-repo evidence entries (`strale-io/strale-frontend@04c9fca9:
  src/pages/Index.tsx`, cited in `DEC-20260421-B--notion-...828e3f` and
  `DEC-20260421-D--notion-...810695c2`) resolved against the fetched sibling
  checkout and matched the quoted code exactly (H1 markup; the `{/* 2.
  Solutions showcase ... */}` comment and `<SolutionsShowcase />` render).
- All relation targets (programmatically extracted from every record's
  `relations:` array) resolve to an existing record file at the pinned
  commit; none targets a bare collided id (`docs/decisions/id-collisions.yaml`
  collision ids are never used as a relation target in this partition — every
  target is a fully qualified `record_key`).
- Every relation is substantiated in body prose (named target, stated basis)
  in every record that declares one; several records explicitly decline to
  add a relation edge where the underlying row's own reference is ambiguous
  (e.g. `DEC-20260420-J`'s unresolved `DEC-20260420-C`/`DEC-20260420-M`
  citations, `DEC-20260421-B--notion-...828e3f`'s unverifiable
  `DEC-20260420-H` Section-7.1 attribution) and this restraint is itself
  correctly reasoned, not a gap.
- No null field is quoted as populated and no populated field is called null,
  checked against the parsed Notion export for every "Superseded By is
  null"/"Outcome is [not] null" style claim in the partition (full
  cross-check table built from `dump_rows.py` output; every claim matched).

### Collision-registry and closure-register bindings (32 `--notion-` records)

All 32 checked: `docs/decisions/id-collisions.yaml`'s collision entry for
each id names the page id with `disposition: formal_record` and the matching
`record_key`; `docs/project/m2-closure-register.yaml`'s `decision_rows` entry
for the same page id carries top-level `disposition: formally_migrated`,
nested `collision.row_disposition: formal_record`, and the same `record_key`.
All 32 passed (verified programmatically, distinguishing the nested
`collision.row_disposition` field from the top-level `disposition` field,
which an earlier naive regex pass conflated before I corrected it).

### Git-qualified record (`DEC-20260422-A--git-3b256587`)

- `id: DEC-20260422-A` equals the key with the qualifier stripped.
- Register entry (`m2-closure-register.yaml` line 349-353): `source_kind:
  git-native`, `source_rows: []`, `git_provenance:
  https://github.com/strale-io/strale/commit/3b25658736bfed53eec52c8acf2619dacd54d1f5`,
  matching the record's own `evidence[0]` entry exactly (full 40-hex SHA,
  prefix `3b256587` matches the qualifier).
- `git merge-base --is-ancestor 3b25658736bfed53eec52c8acf2619dacd54d1f5
  65bf77f1b12813f9f94c42540f1f1272988ab1f3` returns success: the commit is an
  ancestor of the pinned commit (`git log -1` confirms it as "chore(dist):
  containment + guardrails for hollow framework packages").
- This is the only `--git-` qualified record in the entire corpus (confirmed
  by `ls docs/decisions/records | grep -- '--git-'`), consistent with
  `DEC-20260905-D`'s own G3 gap-closure text.
- The record's Context section correctly notes a separate, unrelated
  cross-surface Notion row shares the bare id `DEC-20260422-A`, resolved
  `documented_only` per `DEC-20260904-B`'s mechanism (cross-checked against
  `m2-closure-register.yaml` line 2410-2427: `page_id
  34967c87082c81ffacfbd04b59df64fe`, `disposition: resolved_collision`,
  `collision.kind: cross-surface`, `collision.row_disposition:
  documented_only`).

### Ten "status on" code-claim spot checks

1. `apps/api/src/lib/capability-persistence.ts:303` — "OUTSIDE the
   transaction. Design doc §4.3" — confirmed verbatim (cited by
   `DEC-20260421-B--notion-...81dab7`).
2. `apps/api/src/jobs/onboarding-retry.ts:4,13` — header states the hook
   move "since the DEC-20260421-B correction" and that the Phase 6 retry
   scheduler "was never built" — confirmed (cited by the same record).
3. `apps/api/scripts/onboard.ts:135,147,151,158` — `--force-override-authority`
   labeled "Cluster 2 Phase 4a", refused in `--batch` mode and outside a TTY —
   confirmed (cited by `DEC-20260421-D--notion-...81a2a1`).
4. `manifests/estonian-company-data.yaml:54,57` — `company_name: Bolt App
   Services AS`, `registry_code: "17449106"` — confirmed exact match (cited
   by `DEC-20260420-I--notion-...8172a4`).
5. `manifests/spanish-company-data.yaml:62-63` — `company_name: CONSTRUCCIONES
   AMENABAR SA`, `nif: A20072302` (no `cif` field, no "Inditex") — confirmed,
   consistent with the same record's claim of later drift.
6. `apps/api/src/capabilities/auto-register.ts:161-170` — the
   dutch/portuguese-company-data REACTIVATED comments, each naming its own
   Openapi.com tier and phase label — confirmed exact text (cited across
   several 420-series records).
7. `apps/api/src/lib/platform-facts.ts:134-151` — `STALE_VENDORS` list
   including, under "IBAN/name match — all rejected per DEC-20260430-A":
   `SurePay`, `MonitorPay`, `Movitz`, `Banfico`, `iPiD`, `Bottomline`,
   `Yapily` — confirmed exact list (cited by
   `DEC-20260420-K--notion-...81e3a6`).
8. Manifest `data_source` strings for IT/NL/PT/AT/ES
   (`manifests/italian-company-data.yaml:70`, `dutch-company-data.yaml:55`,
   `portuguese-company-data.yaml:57`, `austrian-company-data.yaml:168`,
   `spanish-company-data.yaml:118`) — all confirmed exact match against the
   quotations in `DEC-20260505-D--notion-...81d389`,
   `DEC-20260507-C--notion-...817cad`, `DEC-20260508-C--notion-...817eb9`,
   `DEC-20260512-A--notion-...8122a2`.
9. `config/env-manifest.yaml:777-782` — `OPENAPI_ENABLED` purpose text "MUST
   stay 'false' in production until the resale addendum is countersigned" —
   confirmed exact match (cited by `DEC-20260507-C--notion-...817cad`).
10. `apps/api/src/jobs/test-scheduler.ts:368,398,471` and
    `apps/api/src/lib/startup-migrations.ts:811` — cost-class gate SQL
    conditions and "Block 0069: reconcile scheduled_testing_eligible from
    cost_class" comment — confirmed exact match (cited by
    `DEC-20260512-A--notion-...8188a0`).

Also verified in passing: `docs/decisions/records/DEC-20260812-A.md`'s
Decision section reads "Retire Counterparty Assurance as Strale's primary
framing; compliance work becomes a separate track that requires customer
evidence" verbatim (quoted identically by three records in this partition:
`DEC-20260421-A--notion-...813c82`, `DEC-20260421-B--notion-...828e3f`, and
`DEC-20260420-K--notion-...81e3a6`); `docs/decisions/records/DEC-20260428-A.md`'s
"For vendor-mediated data, capability provenance includes the upstream
vendor, acquisition method, and a primary-source reference" is quoted
correctly by `DEC-20260508-B--notion-...8119a2`; `CLAUDE.md`'s session
contract and Shared-Checkout Rule text quoted correctly by
`DEC-20260507-B--notion-...81ec9d`, `DEC-20260507-C--notion-...81f187`, and
`DEC-20260508-B--notion-...814bbb`.

### Checker residuals for this partition

Covered above under Method: 83 total residuals, all confined to
`DEC-20260905-C.md` (82) and `DEC-20260905-D.md` (1); all classified as
checker misses (self-referential parsing artifacts in a document about
quotations, and one self-quoted meta-commentary phrase respectively), none a
real defect. Zero residuals in the 33 formal candidate records this
partition otherwise contains.

### Unverifiable

- Whether InfoCamere ever responded to the Distributore Ufficiale application
  (`DEC-20260505-D--notion-...81059f67`) — the row's own `Outcome` field is
  null and no repository file records an answer.
- Whether HMRC's compliance review concluded on the redistribution-disclosure
  question (`DEC-20260505-E--notion-...813481a8`) — same, `Outcome` null.
- Whether the specific nine-country scraping migration
  (`DEC-20260421-C--notion-...81bd8c6b`) or northdata.com/empresia.es/etc.
  Week-0 migrations (`DEC-20260420-I--notion-...81c8b9d4`) fully completed —
  manifests show `data_source_type: scrape` still present on 32
  capabilities, but this partition's records correctly do not claim to
  distinguish which underlying country each belongs to, and neither do I.
  This is scoped uncertainty the records themselves flag, not a finding.
- Whether the specific mtime-based cross-worktree write-conflict check
  (`DEC-20260508-C--notion-...81dd8477`) or the worktree-HEAD-state tripwire
  (`DEC-20260508-C--notion-...8170a19a`) still run today — no file at this
  commit is named for either mechanism; the records themselves say so and
  do not claim more.
- Whether the OQ-6 `transparency_tag` heuristic deletion
  (`DEC-20260420-K--notion-...8198b6ec`) happened as a distinct code change
  separate from the `detectPersonalData` deletion the record cites as
  corroboration — the record itself flags this as not independently
  confirmed, and I could not resolve it further from this evidence set.
- Whether GitHub branch protection on `main` (`DEC-20260507-C--notion-...81f187`)
  is still enforced today — this is a GitHub repository setting, not a
  tracked file; the record correctly says so.

None of the above is treated as passed; each is exactly as unresolved as the
record itself already states.

PARTITION VERDICT: PASS

## Gate run

```
M2 closing review round 4 gate run at 65bf77f1b12813f9f94c42540f1f1272988ab1f3, 2026-09-05T17:39:40Z
HEAD=65bf77f1b12813f9f94c42540f1f1272988ab1f3
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (291.2758ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (96.0736ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (6.4592ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (26.1564ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 417056.508
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (1486.8118ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (958.1152ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (506.344ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (1806.4621ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 328972.1674
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
checked 22 archive/receipts/*.json files
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
check-no-committed-secrets: clean (2936 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still 65bf77f1b12813f9f94c42540f1f1272988ab1f3
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Outcome

Round 4 found confirmed defects in partition P2 (reviewed twice, both
reports independently found findings) and P5, and no confirmed defects in
P1, P3, P4, or P6. The confirmed findings are: four stale "no record
exists" / "no formal record exists" claims about sibling records that
later batches created (`DEC-20260409-D` about `DEC-20260409-C`;
`DEC-20260320-F` about `DEC-20260320-E`; `DEC-20260405-A` about
`DEC-20260405-B` and about `DEC-20260225-P-m5n6`); a quotation in
`DEC-20260320-E` attributed to the `cost_note` field of the
`OPENSANCTIONS_API_KEY` row in `config/env-manifest.yaml` that belongs to
its `purpose` field; and a composite quotation in
`DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1` attributed to
`DEC-20260409-B` whose bracketed infill imports a phrase from a different
sentence. P2b additionally flagged `DEC-20260409-D`'s declared relation to
`DEC-20260409-A` as unsubstantiated. Every confirmed defect from this
round, plus every residual from the operator checker's full run at this
commit (234 records, 1096 spans, 1001 faithful, 95 residual) that this
round's own reconciliation could not locate a faithful source for, is
corrected by `DEC-20260905-E`
(`docs/decisions/records/DEC-20260905-E.md`), which withdraws each false
or misattributed statement from its record without editing that record,
and substantiates the `DEC-20260409-D` to `DEC-20260409-A` relation from
the two rows' own text (and from the reciprocal narration already present
in `DEC-20260409-A.md`'s own body) rather than withdrawing it. The final
closing round runs at the commit that merges this file and
`DEC-20260905-E` into `main`, and treats a statement withdrawn here, in
`DEC-20260905-B`, `DEC-20260905-C`, or `DEC-20260905-D` as corrected, and
a relation substantiated in `DEC-20260905-E` as substantiated.

VERDICT: FAIL
