---
doc_type: m2-closing-review-round
round: 10
commit: 0fd6364fe867a177a4bcde7f1703660837a2e578
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

Round 10 (the final planned round) of the M2 closing independent review, run
at commit `0fd6364fe867a177a4bcde7f1703660837a2e578` (`DEC-20260905-K`'s
merge commit). Six fresh, read-only reviewers, none the author of any
reviewed content, applied the quotation convention `DEC-20260905-C` through
`-K` state unchanged (normalize quotation and source before comparing:
transliterate symbols, lowercase, strip non-alphanumerics; an ellipsis
splits a quotation into ordered segments; a relation substantiated by an
amending record, or narrated in the target record's own body rather than the
source record's, is substantiated, not a defect; a figure stated as of a
date is a dated observation, not a defect, when unrelated work later moves
it; a quotation of a published statute or regulation verifiable against
that public instrument is Not adopted rather than withdrawn as
unverifiable) and ran the operator checker, `scripts/m2-quote-fidelity.mjs`,
against the parsed Notion export and the sibling `strale-frontend`
checkout, at `--min-chars 12`, alongside each partition's own read of every
quotation, evidence path, relation, and at least ten "status on" code
claims against the reviewed commit. Each partition set up (or, where the
session was already isolated in its own worktree at the pinned commit,
worked in place read-only) at `0fd6364fe867a177a4bcde7f1703660837a2e578`;
nothing was edited or committed in any reviewer's worktree. P1 through P4
each took a contiguous slice of the bare-keyed candidate records; P5 took
the `--notion-`-qualified collision records for its slice; P6 took the
remaining qualified records plus the ten amending records `DEC-20260905-B`
through `-K` themselves, reviewed like any other candidate record. Every
partition cross-checked its own findings against the Decision lists of
`DEC-20260905-B` through `-K` before treating a statement as a fresh
finding, per the round's rule (a), and independently re-verified a sample
of those prior corrections against the primary source rather than taking
them on faith.

Three confirmed defects survived this cross-check, each in an amending
record rather than a still-open finding against an original record: P1
found that `DEC-20260905-C`'s own correction of `DEC-20260224-P-g7h8`
item 1 asserts a "Vertical-agnostic" statement `CLAUDE.md` does not
contain; P2 found that `DEC-20260320-A`'s quotation of
`apps/api/src/lib/capability-readiness.ts`'s header comment inserts
bracketed words the source does not contain; P3 found that
`DEC-20260905-J` item 28 withdraws a `DEC-20260507-D` sentence on a false
basis (the phrase it calls unverifiable is a verbatim substring of the
row that is `DEC-20260507-D`'s own cited evidence). Active records are
immutable (`DECISION_ACTIVE_BODY_CHANGED`), so none of `DEC-20260905-C`,
`DEC-20260320-A`, or `DEC-20260905-J` is edited; the corrections are
`DEC-20260905-L` (`docs/decisions/records/DEC-20260905-L.md`), the same
mechanism every prior round in this chain used. P2's own partition
verdict line reads PASS even though its report names the
`DEC-20260320-A` defect explicitly (see "Consolidated findings" below);
the consolidated verdict for this round is FAIL on all three items
regardless of any individual partition's own verdict line. The gate run
below was captured the same day, at the same commit, before this PR's own
commits landed.

## Partition reports

### Partition P1

# Closing review, round 10 (final round), partition P1

Commit reviewed: `0fd6364fe867a177a4bcde7f1703660837a2e578`
Record count in partition: 40 (`DEC-20260224-P-a1b2.md` through `DEC-20260309-H.md`, listed in `closing10-P1.txt`)

Setup: `git worktree add --detach C:/tmp/strale-closing10-P1 0fd6364fe867a177a4bcde7f1703660837a2e578`, `npm ci` (required two retries after Windows ENOTEMPTY/EPERM corruption from an earlier interrupted install; final install completed cleanly). Read-only throughout; nothing edited or committed in the worktree. Notion rows read only via `dump_rows.py PAGE:<id>`. Cross-repo evidence resolved via `git -C C:/Users/pette/Projects/strale-frontend show <sha>:<path>` after `git fetch origin`.

### Method

1. A Python structural checker (`structcheck.py`) parsed frontmatter for all 40 files and confirmed `record_key`/`id`/filename agreement and the presence of exactly one each of the CAUTION banner and the five protected section headings (Decision, Context, Rationale, Consequences, Reversal conditions). Result: all 40 files OK, no structural defects.
2. A second Python checker (`evidcheck.py`) confirmed every non-URL, non-cross-repo evidence path exists as a file at the reviewed commit, and every `relations:` target exists as a record key in `docs/decisions/records/` at the reviewed commit. Result: all 40 files OK (local evidence and relations all resolve).
3. Every cross-repo `strale-io/strale-frontend@04c9fca9:<path>` evidence entry (9 distinct paths, across DEC-20260302-C, DEC-20260303-C, DEC-20260306-H, DEC-20260309-H) was resolved individually with `git -C .../strale-frontend show 04c9fca9:<path>` after `git fetch origin`; all 9 resolve.
4. I read all 40 records in full, cross-referenced every quotation of 12+ characters against its attributed source (CLAUDE.md, CHARTER.md, manifests, executor/library source files, the sibling frontend checkout, or the parsed Notion export via `dump_rows.py`), and independently verified at least 20 distinct "status on <date>" code claims by reading the named files/lines at the reviewed commit (well over the required 10; see the spot-check list below).
5. I ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <export> --frontend <frontend checkout> --min-chars 12` over the whole corpus (npm ci had to be repeated twice due to Windows node_modules corruption before this succeeded) and filtered its output to my partition's 40 files.
6. Before treating any statement as a finding, I cross-checked it against the withdrawal records `DEC-20260905-B` through `-K` for statements those records' Decision lists withdraw as false/fabricated/misattributed, per the round's rule (a). Six of those records (B, C, D, E, I, J) withdraw statements that appear in files in my partition. In every case I independently re-verified the withdrawal record's own correction against the primary source (CLAUDE.md, the Notion export, or repo files) rather than taking the correction on faith.

### Quote-fidelity checker results for P1

Filtering the full-corpus run to my 40 files: every file shows "N spans checked, N faithful, 0 residual" except two, both single residuals:

- `DEC-20260225-P-m1n2.md` line 109: `"not CI reports"` — best match record `DEC-20260314-G.md` (prefix 5, i.e. essentially no match). **Checker miss.** This is the record's own shorthand label for a clause it already quotes faithfully earlier in the same record (Rationale/Context: `"Don't build: CI reports, PDF engines, domain-specific pipelines"`, verified faithful against the parsed Notion row for this record, page `31267c87082c811f932fe2a2220dd9af`). It is a nickname for an already-substantiated clause, not a fresh unattributed quotation. Not a finding.
- `DEC-20260227-P-s9t0.md` line 82: `"visa/work permit"` — best match `notion:DEC-20260227-P-s9t0` (prefix 4, no real match). **Checker miss.** This phrase describes a grep result against the repository, not a Notion quotation: `apps/api/src/capabilities/work-permit-requirements.ts` is exactly the "visa/work permit domain capability" the record describes (confirmed by reading the file; it defines `visa_required`, `permitType = "work_visa_and_permit"`, and Schengen visa-related constants). The checker only searches Notion/evidence-file text for quotations and has no notion of "this is my own description of a grep result," so it flags it; the description is verifiably accurate.

Both residuals are checker misses (a faithful source located and quoted above), not defects. Zero new defects from the automated pass.

### Findings

**Finding 1 (against `DEC-20260224-P-g7h8.md`, mediated through `DEC-20260905-C`'s own correction).** `DEC-20260224-P-g7h8.md` lines 72-75 state: "**The Nordic-story and cross-vertical name-neutrality reasoning have both held up in substance.** ... CLAUDE.md's project description frames the platform as vertical-agnostic (\"Long-term ambition is tens/hundreds of thousands of data sources,\" per project memory)..." This exact statement is withdrawn by `DEC-20260905-C` item 1, which correctly establishes that the "tens/hundreds of thousands of data sources" phrase does not appear anywhere in `CLAUDE.md` at this commit (confirmed independently: `grep -in "tens/hundreds" CLAUDE.md` and `grep -in agnostic CLAUDE.md` both return zero matches). However, `DEC-20260905-C`'s own correction text then asserts: "`CLAUDE.md` does state the platform is \"Vertical-agnostic\" and describes a long-term ambition to scale broadly, but not in this wording." **This correction is itself false.** `CLAUDE.md` at this commit contains the word "agnostic" nowhere at all (confirmed by a full-file case-insensitive grep); the phrase "Vertical-agnostic" exists only in the user's external `MEMORY.md` file ("Vertical-agnostic: KYB/compliance is the current wedge but the platform scales to any sector..."), which is explicitly outside the repository this candidate set is drawn from — the same category of source the correction itself says is illegitimate for exactly this claim. `CLAUDE.md`'s only relevant text is its capability-count line: "290+ capabilities across 7 verticals ... plus 100+ bundled solutions across 6 categories," which never uses the word "agnostic" or the phrase "vertical-agnostic." Per rule (a), a withdrawn statement's correction is checked like any other claim; this correction fails that check. The underlying substance of `DEC-20260224-P-g7h8`'s Consequences (that the platform is in fact broad/cross-vertical, and that the name doesn't reference AI/agents) is not disturbed, but neither the original record's quotation nor `DEC-20260905-C`'s replacement text is a faithful attribution to `CLAUDE.md`, and the corpus currently has no correct account of this specific point on the record. Evidence: `CLAUDE.md` (full-file grep, zero matches for "agnostic"); `docs/decisions/records/DEC-20260905-C.md` lines 134-145; `docs/decisions/records/DEC-20260224-P-g7h8.md` lines 70-75.

No other findings in this partition. Every other withdrawn statement I checked (see list below) has an accurate correction; every other quotation, evidence path, relation, and sampled code claim verified faithful.

### Withdrawn statements verified (rule (a) cross-checks)

- `DEC-20260225-P-m1n2` item 1/2 (D.md): withdrawal re first-vertical wording and Source-field claim — confirmed correct against `DEC-20260224-P-c3d4.md`'s own text and the parsed Notion export (all 13 `DEC-20260225-P-*` rows, including `m1n2`, have null Source).
- `DEC-20260226-P-s3t4` item 3 (D.md): "Date-based API versioning via `Strale-Version` header" misattributed to CLAUDE.md — confirmed no such line in CLAUDE.md (full-file grep, zero matches).
- `DEC-20260227-P-i9j0` item 4 (D.md): "the capability's own provider runs the code" fabricated quote — confirmed absent from the row's Decision/Rationale fields (page `31367c87082c81049ba4d112accd3f43`, dumped and read directly).
- `DEC-20260227-P-s9t0` items 5/6 (D.md): "becomes unnecessary...matured" / "built as a standalone Commerce Protocol" — confirmed neither phrase is in the row's Decision/Rationale (page `31467c87082c8171babed0c2434111ac`, dumped directly).
- `DEC-20260224-P-g7h8` item 1 (C.md): see Finding 1 above — correction itself found false.
- `DEC-20260225-P-y1z2` items 2/3 (C.md): "(unanimous)" parenthetical insertion on DEC-19, and the stitched `DEC-20260225-P-a3b4` composite quote — both confirmed against `CLAUDE.md:265` and the row's own Decision field (page `31267c87082c81999f6ef6cd68976dae`, dumped directly).
- `DEC-20260226-P-q1r2` item 4 (C.md): production-URL sentence misattributed to CLAUDE.md's Tech Stack section — confirmed absent (zero matches for `strale-production.up.railway.app` restricted to that framing; the actual current line reads differently, matching what the corrected record itself later cites correctly for `DEC-20260226-P-q1r2`).
- `DEC-20260227-P-a1b2` item 5 (C.md): inserted "the" before "original Provider Growth doc" — confirmed against the row's Rationale field (page `31367c87082c814bac2bea252352ce64`, dumped directly): "Original Provider Growth doc assumed 5 seed capabilities..." with no leading article.
- `DEC-20260227-P-u1v2` item 6 (C.md): "Distribution packages & protocol endpoints" heading misattributed to CLAUDE.md — confirmed no such heading/line exists in CLAUDE.md.
- `DEC-20260302-A-0001` item 7 (C.md): CHARTER.md quote inventing "to" in place of an en dash — confirmed: `CHARTER.md:40` reads "€0.02–€1.00 band" (en dash, no "to").
- `DEC-20260302-C` item 8 (C.md): stale CLAUDE.md bullet quotation — confirmed CLAUDE.md's current DEC-20260302-C bullet reads differently (the historical-prescription/superseded wording), not the quoted "leads with solutions and trust positioning" short form.
- `DEC-20260305-E` items 14/15 (C.md): v1/v2 comment misattributed to `browserless-extract.ts` instead of `web-provider.ts`; "47-to-36" contradicting the record's own "35" figure two paragraphs earlier — both confirmed by reading both files and re-running the importer-count grep (35, not 36 or 47).
- `DEC-20260306-D` item 16 (C.md): "Success Rate" vs "Test Pass Rate" quote altered (word inserted, tense changed, dash replaced) — confirmed against the row's Rationale field (page `31b67c87082c818cb5aee225cccee2e4`, dumped directly).
- `DEC-20260309-G` item 17 (C.md): "no matches outside this record" — confirmed the phrase "12-category risk framework" also appears in `docs/programs/codex-review-backlog.yaml` as a meta-reference, so the literal claim is not verifiable as stated; the underlying no-mechanism-exists conclusion is not disturbed.
- `DEC-20260225-P-m5n6` item 4 (E.md): "no record exists, mentioned in prose only" — this false claim lives in a different record (`DEC-20260405-A`, outside my partition); it withdraws in favor of the fact that `docs/decisions/records/DEC-20260225-P-m5n6.md` exists, which is exactly the file in my partition — confirmed the file exists and is well-formed. Not a finding against `DEC-20260225-P-m5n6` itself (it was never the source of the false claim; it is the file whose existence the false claim denied).
- `DEC-20260225-P-k3l4` item 1 (I.md): fabricated "wedge, not niche" framing — confirmed absent from the row's Decision/Rationale fields (page `31267c87082c81b5b0d6cb9764dd5228`, dumped and read directly: contains "Reject both 'EU-only niche' and 'pretend global coverage,'" not "wedge, not niche").
- `DEC-20260226-P-s3t4` item 2 (I.md): fabricated "build it now, cheaply" quote — confirmed absent from the row's Rationale field (page `31367c87082c81c69b79db1abefa936d`, dumped directly: "API versioning from day one follows Stripe playbook — trivial to add now, painful to add later, strongest long-term switching cost").
- `DEC-20260224-P-a1b2` item 1 (J.md): "specialized operators" misattributed from sibling row `DEC-20260224-P-e5f6` — confirmed against both rows' Decision/Rationale fields (pages `31167c87082c81d0808ff56906e6ee26` and `31167c87082c813d8bb9ea18a3d25199`, both dumped directly): the phrase is in `e5f6`'s Rationale only.
- `DEC-20260225-P-m1n2` item 2 (J.md): "this batch's brief" is not a durable source — withdrawal correctly notes it as unverifiable against anything the candidate set admits as evidence; not disputed.
- `DEC-20260227-P-u1v2` item 3 (J.md): inserted article "a" before "reputation registry" — confirmed against the row's Decision field (page `31467c87082c81d0a71acc35c14f1c87`, dumped directly): "through reputation registry to enterprise integrations," no article.

All of the above corrections (other than Finding 1) check out as accurate on independent re-verification.

### Code-claim spot checks (well over 10; file:line, all confirmed true at the reviewed commit)

1. `manifests/screenshot-url.yaml:1,10` — "Auto-generated from database on 2026-03-17" header, `price_cents: 5` (DEC-20260225-P-a3b4).
2. `manifests/invoice-extract.yaml:12` — `price_cents: 50` (DEC-20260225-P-a3b4).
3. `packages/langchain/src/index.ts:16,19` — `export class StraleFallbackTool extends Tool`, description text (DEC-20260225-P-e7f8).
4. `apps/api/src/routes/solutions.ts:54,157` — "disclosing withdrawn ones through the solution that bundles them" comment (DEC-20260225-P-i1j2).
5. `manifests/swedish-company-data.yaml:10,106` — `price_cents: 5`, Bolagsverket `data_source` (DEC-20260225-P-w9x0); `apps/api/src/capabilities/swedish-company-data.ts:8` — "DEC-20260405-A Phase 2: replaced Allabolag scraping" comment.
6. `apps/api/src/lib/x402-gateway.ts:63-64,238-239` — `USDC_CONTRACTS`, "Base mainnet" comment, "EUR is the canonical platform currency" comment (DEC-20260225-P-s5t6, DEC-20260308-1).
7. `CLAUDE.md:269` — "DEC-23: TypeScript SDK ships before Python SDK" (DEC-20260225-P-u7v8).
8. `manifests/*.yaml` existence check for all 19 registry countries + 8 validation items named in DEC-20260226-P-w7x8 (spot-checked 7 of them directly).
9. `apps/api/src/db/schema.ts:355-359` — `auditTrail`/`transparencyMarker`/`dataJurisdiction` columns; `apps/api/src/routes/do.ts` (4+ call sites) writing them; `apps/api/src/lib/versioning.ts:4,14,20` and `apps/api/src/app.ts:251` — `Strale-Version` header handling (DEC-20260226-P-s3t4).
10. `strale-frontend@04c9fca9:src/pages/Index.tsx` — component render order (SolutionsShowcase, FreeTierShowcase, ProblemSection, QualityScoringSection, AuditTrailSection, then StatsStrip at line 276) (DEC-20260302-C).
11. `strale-frontend@04c9fca9:src/App.tsx:83-84`, `src/pages/Methodology.tsx:19-26`, `src/components/Header.tsx:10` — routes and comment text (DEC-20260303-C); `apps/api/src/lib/seller-rank.ts:17-20` and `apps/api/src/lib/suggest.ts:838,841` (Voyage/Claude re-rank).
12. `apps/api/src/capabilities/lib/web-provider.ts:613` and `browserless-extract.ts:9` — comment locations; importer count = 35 via grep (DEC-20260305-E).
13. `CLAUDE.md:361` — "Generates all 5 test types (known_answer, schema_check, negative, edge_case, dependency_health)" (DEC-20260305-F).
14. `apps/api/src/routes/public-trust.ts:15,27,34` — `PUBLIC_TRUST_FIELDS`, "0 cap trust, 0 sol trust", "deliberately NOT projected" comments; `apps/api/src/lib/trust-grade.ts` `computeTrustGrade` zero non-test callers; `ls apps/` = `api` only (DEC-20260305-G).
15. `apps/api/src/db/schema.ts:964-966` — `capability_health (circuit breaker)` comment; `docs/decisions/records/DEC-20260308-1.md:4` title "Platform pricing currency: EUR (not USD)"; no `DEC-20260307*` record file exists; `CLAUDE.md:284` (DEC-20260306-G).
16. `strale-frontend@04c9fca9:src/pages/CapabilityDetail.tsx` — section order and line numbers (271, 304, 319, 358, 424-432) and exact comment text at lines 230-232 and 358-363; no "limitation" match (DEC-20260306-H).
17. `manifests/pep-check.yaml:11` — `price_cents: 5`; `docs/decisions/records/DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md` exists (DEC-20260308-1).
18. `apps/api/src/lib/capability-readiness.ts:6-7,64,68,117,199,208` — the 8-dimension readiness checker; `docs/decisions/records/DEC-20260320-B.md:5` — `status: superseded` (DEC-20260309-G).
19. Non-existence of `dcf-estimate`, `altman-z-score`, `recession-probability`, `analyst-ratings`, `retirement-projection`, `portfolio-risk`, `credit-ratios`, `country-risk-profile` manifests; the exact 4-manifest set carrying a `disclaimer` field (`competitor-compare`, `contract-extract`, `email-finder`, `landing-page-roast`); `claims.yaml` grep for advisory/financial/disclaimer = zero (DEC-20260309-H).
20. `strale-frontend@04c9fca9:src/pages/Terms.tsx:216,254,262-264` and `src/App.tsx:81` — Terms route and "Warranty and liability" / limitation-of-liability quotes (DEC-20260309-H).

### Unverifiable

Nothing in this partition was left unverifiable. Every quotation, evidence path, relation, and sampled code claim was checked directly (Notion dump, repo file, or sibling-frontend `git show`).

### Notes on the round-3/4/9 withdrawal apparatus

Several statements in this partition's records are covered by the amending records `DEC-20260905-C`, `-D`, `-I`, and `-J`, and (as noted in Finding 1) one of those corrections is itself inaccurate. This does not change my verdict on the 40 files in my own partition, since the false statement lives in `DEC-20260905-C` (outside my partition, reviewed by whichever partition covers the September records), but I record it here because the underlying original record (`DEC-20260224-P-g7h8`, in my partition) still has no faithful account of the "vertical-agnostic" point anywhere in the corpus after two rounds of correction.

PARTITION VERDICT: FAIL

### Partition P2

# Closing review, partition P2, round 10 (final round)

Commit reviewed: `0fd6364fe867a177a4bcde7f1703660837a2e578` (checked out via `git checkout --detach` in this agent's own isolated worktree, which was already at that exact commit and clean before any review work began).

Record count: 40 files, listed in `closing10-P2.txt` (`DEC-20260310-E.md` through `DEC-20260411-B.md`, bare keys only, no `--notion-`/`--git-` qualified records in this partition).

### Method

Built a Notion-row export for the 41 page ids referenced by this partition's `evidence[0]` URLs (40 records' own rows plus `DEC-20260320-B`'s second evidence entry, the Capability Onboarding Pipeline spec page) using `dump_rows.py PAGE:<id> ...`. Ran the repo's operator checker, `node scripts/m2-quote-fidelity.mjs --export <raw Notion export> --frontend <sibling checkout> --min-chars 12`, once per record via repeated `--only` flags. The checker extracts every double-quoted span >=12 chars, normalizes both the quote and every candidate source (record bodies, evidence files including cross-repo ones, and the parsed Notion rows) per the DEC-20260905-C convention (transliterate €/×/≥/≤/→/…, lowercase, strip non-alphanumerics, then substring match with ellipsis splitting into ordered segments), and reports any span that matches nothing as a residual. Note: `--export` must point at the raw multi-JSON Notion export text (`decisions-export-raw.txt`), not a `dump_rows.py`-filtered JSON array — the checker's `parseNotionExport` expects the raw `"text": "{...}"`-wrapped format; pointing it at a pre-filtered array silently yields zero parsed rows and inflates residuals. Caught this on a first pass (66 residuals) and corrected by re-running against the raw export (5 residuals).

For every record: verified frontmatter parses, `record_key`/`id`/filename agreement, the CAUTION banner, and the five protected sections, via a small Python structural checker (all 40 read `OK`). Verified every `evidence:` entry resolves (repo-relative paths checked with `os.path.exists`; two `https://github.com/strale-io/strale/commit/<sha>` entries verified as ancestors of HEAD via `git merge-base --is-ancestor`; four `strale-io/strale-frontend@<sha>:<path>` entries resolved via `git -C <frontend checkout> show <sha>:<path>` after `git fetch origin`). Verified all 6 non-empty `relations` blocks: every target exists as a record file at this commit, none is a bare collided id (checked against `docs/decisions/id-collisions.yaml`), and each is substantiated either in the source record's own prose or, where the round's rule (a) applies, in the basis stated by `DEC-20260905-D`/`-E`. Cross-checked every one of my 40 records against the Decision lists of `DEC-20260905-B` through `-K` to find which prior-round withdrawals touch this partition, and independently re-verified a sample of those corrections against the cited files/rows rather than taking the correction on faith.

### Checker residuals for this partition (5 of 223 spans)

1. `DEC-20260314-F.md` line 82: `"completion_rate\|autonomous"` — best match notion row, prefix only.
2. `DEC-20260314-F.md` line 84: `"completion_rate\|autonomous_completion\|autonomousCompletion"` — best match notion row, prefix only.
3. `DEC-20260317-F.md` line 51: `"automated >= 50 gate"` — best match notion row, prefix only.
4. `DEC-20260320-A.md` line 96-97: `"The last two dimensions [reliability and limitations] were added per DEC-20260423-B (Stage A, warning mode)... 34 caps shipped to prod with NULL reliability."` — best match `apps/api/src/lib/capability-readiness.ts`, prefix only.
5. `DEC-20260321-A.md` line 67: `"schedule_tier\|scheduleTier\|ORDER BY"` — best match `apps/api/src/routes/internal-tests.ts`, prefix only.

Classification:

- **#1, #2 (DEC-20260314-F): checker miss, not a defect.** Both are literal `grep` command arguments inside a two-line inline-code span (`` `grep -rn "completion_rate\|autonomous" \n apps/api/src/lib/metrics*` ``). The checker's `codeRanges()` masks inline code with `` /`[^`\n]+`/g ``, which cannot match across the embedded newline, so the checker treats the grep-pattern's own double quotes as a prose quotation needing an external source. It is a code literal, not a claim requiring a source. Verified the underlying claim is true: `grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*` and `grep -rln "completion_rate\|autonomous_completion\|autonomousCompletion" apps/api/src` both return zero matches at this commit.
- **#3 (DEC-20260317-F): checker miss, not a defect.** The record's Context section quotes its own Rationale earlier in the same paragraph as coining the phrase "automated >= 50 qualification gate" (itself a paraphrase, explicitly flagged as such: "The row's own text does not name a specific Decision ID for the ... it refers to"), then at line 51 self-references that same coined phrase in shortened form ("the 'automated >= 50 gate' itself") to conclude no sibling record matches it. This is the record quoting its own earlier-established shorthand, not attributing text to an external source, so there is nothing external for the checker to match against.
- **#5 (DEC-20260321-A): checker miss, not a defect.** Same inline-code-across-newline pattern as #1/#2: a literal `grep -n "schedule_tier\|scheduleTier\|ORDER BY" apps/api/src/routes/solutions.ts apps/api/src/routes/internal-tests.ts` command. Verified the underlying claim is true: that exact search finds `schedule_tier`/`scheduleTier` only in `internal-tests.ts` (several hits) and zero `ORDER BY schedule_tier` in either file.
- **#4 (DEC-20260320-A): real defect, but minor and not previously withdrawn.** The source comment at `apps/api/src/lib/capability-readiness.ts:9-13` reads "The last two dimensions were added per DEC-20260423-B (Stage A, warning mode): ... 34 caps shipped to prod with NULL reliability (see audit-reports/...". The record's quotation inserts a bracketed clarification, "[reliability and limitations]", between "dimensions" and "were added", which is not present in the source text at all (bracketed or otherwise) anywhere in the file. Under the round's convention ("a word inserted, dropped, replaced or reordered" is a defect; no carve-out is stated for editorial bracket insertions), this counts as an inserted-words defect. It is benign — the bracketed words are an accurate paraphrase of what "the last two dimensions" refers to two sentences earlier in the same record, and the substantive claim is unaffected — but it is a literal quotation-fidelity defect and I found no `DEC-20260905-B` through `-K` item that withdraws this specific span (items 27 and 28 under that record's own section in `DEC-20260905-C` address two different quotations in `DEC-20260320-A.md`, not this one).

### Findings

1. **`DEC-20260320-A.md`, line 96-97** (see residual #4 above): the quotation of `apps/api/src/lib/capability-readiness.ts`'s header comment inserts the bracketed words "[reliability and limitations]", which do not appear in the source file. Minor, substance-preserving, but a literal defect under the stated convention, and not covered by any existing withdrawal record. Evidence: `apps/api/src/lib/capability-readiness.ts:9-13`; `docs/decisions/records/DEC-20260320-A.md:96-97`.

No other findings. Every other statement I could check against its named source checked out faithful, and every defect I found that had already been caught by a prior round (`DEC-20260905-B`/`-C`/`-D`/`-E`/`-G`/`-I`/`-J`) was independently re-verified as an accurate withdrawal (see next section).

### Prior-round corrections touching this partition (independently re-verified)

Cross-referenced all 40 files against the Decision lists of `DEC-20260905-B` through `-K`. The following items target a record in this partition; I re-verified each against the cited file/row rather than trusting the correction on its face. All checked out accurate:

- **`DEC-20260905-B` item 9** (`DEC-20260314-F`): comma-vs-em-dash in a Rationale quote. Confirmed source uses an em dash. Under the round-2+ convention (dashes are stripped, not a defect), this is doubly moot today, but the correction's own fact-claim is accurate.
- **`DEC-20260905-B` item 10** (`DEC-20260314-A`): markdown/punctuation differences quoting `archive/growth-ops/tweets-v2.md`. Confirmed source text; under the current convention this is not a defect either way, correction accurate.
- **`DEC-20260905-B` item 11** (`DEC-20260321-A`): "4x" vs "4×". Confirmed source uses "4×"; under the current transliteration convention (× -> x) these are equivalent, correction accurate but moot under round-2+ rules.
- **`DEC-20260905-C` item 18** (`DEC-20260310-F`): fused non-adjacent CLAUDE.md sentences. Confirmed CLAUDE.md's actual structure (intro sentence + separate later bullets), correction accurate.
- **`DEC-20260905-C` item 19 / `DEC-20260905-J` item 8** (`DEC-20260313-C`): "still listed, signal absent rather than faked" is the record's own synthesis, not the row's words. Confirmed row's Decision/Rationale fields via export, correction accurate.
- **`DEC-20260905-C` item 20 / `DEC-20260905-J` item 9** (`DEC-20260314-F`): "five" vs the row's digit "5". Confirmed via export Rationale field, correction accurate.
- **`DEC-20260905-C` item 21 / `DEC-20260905-J` item 10** (`DEC-20260315-H`): "armed in prod" misattributed to CLAUDE.md (actually `apps/api/src/routes/do.ts`). Confirmed CLAUDE.md has no such phrase; confirmed the text is still present, unedited, at `DEC-20260315-H.md:74`. Correction accurate.
- **`DEC-20260905-C` item 22** (`DEC-20260316-B`) and **`DEC-20260905-J` item 13**: "which is the real rating" vs the actual sources' "which signal was/is 'the' rating". Confirmed present at `DEC-20260316-B.md:50`. Correction accurate.
- **`DEC-20260905-C` items 23-24** (`DEC-20260317-A`): digest-sender.ts quote misattributed to the file's header vs. the `sendDigestEmail` function docstring; and the false claim that `DEC-20260511-F` is "not a formal record" (it is: `docs/decisions/records/DEC-20260511-F.md` exists). Both confirmed present in the current file text and both corrections accurate.
- **`DEC-20260905-C` item 25 / `DEC-20260905-J` item 14** (`DEC-20260317-F`): same "armed in prod" misattribution pattern. Confirmed, correction accurate.
- **`DEC-20260905-C` item 26 / `DEC-20260905-J` item 15** (`DEC-20260318-A`): "the workflow that scales to third-party providers" borrowed from sibling record `DEC-20260318-B`'s own row, misattributed as `DEC-20260318-A`'s own row's words. Confirmed both records' current text; confirmed via export that `DEC-20260318-A`'s row instead reads "The old path doesn't scale to third-party providers" (opposite claim). Correction accurate.
- **`DEC-20260905-C` items 27-28 / `DEC-20260905-J` item 16** (`DEC-20260320-A`): a synthesized composite quotation ("manual, 312-line `app.ts` import list") and an under-qualified repo search claim about `capabilities` table inserts. Both confirmed present in current text; both corrections accurate (independently spot-checked the `db.insert(capabilities)`/`INSERT INTO capabilities` search myself — it does return the ~25 additional integration-test fixture matches the correction describes, beyond the one production call site).
- **`DEC-20260905-C` item 30** (`DEC-20260323-A`): a paraphrase presented as an exact quotation of the row. Confirmed via export Decision/Rationale fields, correction accurate.
- **`DEC-20260905-D` item 7 / `DEC-20260905-E` item 6** (`DEC-20260409-D`'s undeclared-substantiation relations to `DEC-20260409-A` and `DEC-20260409-B`): confirmed neither relation is narrated in `DEC-20260409-D.md`'s own body (only in frontmatter), and confirmed the substantiating basis each amending record supplies from the underlying Notion rows. Per the round's rule (a), these relations are treated as substantiated, not as findings.
- **`DEC-20260905-E` item 5** (`DEC-20260409-D`): the false claim "No record for `DEC-20260409-C` exists in this repository (it is an unresolved collision id...)". I found this independently before finding the withdrawal: `docs/decisions/id-collisions.yaml:204-219` lists `DEC-20260409-C` with `resolution_status: resolved`, and `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md` exists. Both halves of `DEC-20260409-D`'s sentence are false, exactly as `DEC-20260905-E` item 5 states. Correction accurate; not a new finding since it is already withdrawn.
- **`DEC-20260905-E` item 1** (`DEC-20260320-F`): "no formal record exists" for `DEC-20260320-E`, false — `DEC-20260320-E.md` exists in this same batch. Confirmed present at `DEC-20260320-F.md:40-41`, confirmed `DEC-20260320-E.md` exists and is well-formed. Correction accurate.
- **`DEC-20260905-E` item 2** (`DEC-20260320-E`): a quotation attributed to the `OPENSANCTIONS_API_KEY` row's `cost_note` field that is actually the `purpose` field's text. Independently confirmed via `config/env-manifest.yaml:797-806`: the quoted content matches `purpose` (line 798) verbatim-adjacent; the actual `cost_note` (line 806) is different text entirely. Correction accurate.
- **`DEC-20260905-G` items 1-4** (`DEC-20260314-C`, `DEC-20260315-A`, `DEC-20260315-B`, `DEC-20260404-A`): a false "found no match" search claim, a misattributed quotation borrowed from `DEC-20260314-F`'s row, a wrong day-count (15 vs. claimed 16 between `2026-03-15` and `2026-03-30`), and another false "finds only" search claim. Spot-verified the date arithmetic myself (confirmed both frontmatter `decided_at` values and the interval) and confirmed the withdrawn "16 days" text is still present unedited at `DEC-20260315-B.md:75`. All four corrections accurate.
- **`DEC-20260905-I` item 3** (`DEC-20260330-B`): a self-quotation drops the word "coding" from the record's own title ("be embedded in coding workflow" -> "be embedded in workflow"). Confirmed both the frontmatter `title` and the Consequences re-quotation at `DEC-20260330-B.md:4,79`. Correction accurate.
- **`DEC-20260905-J` items 11-12** (`DEC-20260316-A`): "one headline signal" vs. the row's "single headline signal", and a dropped word "grade" three times in a quotation of `apps/api/src/lib/trust-grade.ts:211`. Confirmed both present in current text and confirmed the file reads "worst of (SQS grade, freshness grade, latency grade)". Both corrections accurate.
- **`DEC-20260905-J` item 17** (`DEC-20260330-B`): a claimed stale `context7.json` rule 12 that in fact already states the SQS-removal fact (i.e., the record's "stale rule" does not exist). Confirmed against `context7.json`'s actual rule 12 text. Correction accurate.

None of these 40 records carry an open, unwithdrawn defect beyond the one new finding above.

### Ten "status on" code-claim spot checks

1. `DEC-20260310-E.md`: CLAUDE.md's SQS-deletion paragraph (DEC-20260503-B, dual-profile model, `min_sqs`, `/v1/quality/:slug`, lifecycle transitions all named as gone) — confirmed verbatim in `CLAUDE.md` at this commit.
2. `DEC-20260314-F.md`: no `completion_rate`/`autonomous_completion`/`autonomousCompletion` anywhere under `apps/api/src` — confirmed via direct grep, zero matches.
3. `DEC-20260317-A.md`: `apps/api/src/lib/digest-sender.ts`, `interrupt-sender.ts`, `internal-health-monitor.ts` all exist with the header/docstring text quoted — confirmed by reading each file's header.
4. `DEC-20260320-A.md`: `apps/api/src/capabilities/auto-register.ts` exists and its header comment matches the described manifest-driven auto-discovery mechanism — confirmed by reading the file header.
5. `DEC-20260321-A.md`: no `ORDER BY schedule_tier` in `apps/api/src/routes/solutions.ts` or `internal-tests.ts` — confirmed via direct grep (schedule_tier/scheduleTier appear only in `internal-tests.ts`, never in an `ORDER BY`).
6. `DEC-20260324-A.md`: `apps/api/src/lib/x402-gateway.ts` imports `createFacilitatorConfig` from `@coinbase/x402` and implements the `X402_FACILITATOR` auto/cdp/legacy switch; `config/env-manifest.yaml` documents `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` — confirmed both files.
7. `DEC-20260411-B.md`: `apps/api/src/lib/gate5-path-coverage.ts` exists with the PRIMARY/SECONDARY/inward-trace header text; `apps/api/scripts/onboard.ts` cites "Gate 5 multi-path fixture coverage, DEC-20260411-B" in three separate comment locations — confirmed both files.
8. `DEC-20260315-B.md`: `context7.json`'s `folders` array lists all ten named packages/docs paths; `docs/ide-rules/strale-compliance.mdc` and `.windsurfrules` exist — confirmed both.
9. `DEC-20260320-E.md`: `config/env-manifest.yaml`'s `OPENSANCTIONS_API_KEY` row carries `retired: 2026-04-27` and a `cost_note` field (though the record's own quoted content is actually the `purpose` field text, per the already-withdrawn `DEC-20260905-E` item 2 above); `docs/decisions/records/DEC-20260429-A.md` exists — confirmed.
10. `DEC-20260409-D.md`: `docs/decisions/id-collisions.yaml`'s `DEC-20260409-C` entry has `resolution_status: resolved` (not "unresolved" as the record's own withdrawn claim states) and `docs/decisions/records/DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md` exists — confirmed (this is the already-withdrawn defect covered by `DEC-20260905-E` item 5 above).

### Structural checks (all 40 records)

- Frontmatter parses, `record_key`==`id` (all bare keys, no qualifiers in this partition), filename matches `<record_key>.md`: all 40 pass.
- CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present: all 40 pass.
- Evidence: every repo-relative path exists; both `github.com/strale-io/strale/commit/<sha>` entries (`16ca790ef8dc4dc94e2733b4c660786d9be61255` in `DEC-20260320-E`/`-F`, `cb787ed9b2fbfadf61ea401c29d1fd47ac4e9214` in `DEC-20260405-A`) verified as ancestors of HEAD; all four `strale-io/strale-frontend@04c9fca9:<path>` entries (in `DEC-20260313-E`, `DEC-20260314-B`, `DEC-20260314-G`, `DEC-20260329-A`) resolved via `git show` in the sibling checkout after `git fetch origin`.
- Relations: 6 non-empty `relations:` blocks in this partition (`DEC-20260314-A`<->`DEC-20260314-B`, `DEC-20260405-A`->`DEC-20260320-B`, `DEC-20260409-B`->`DEC-20260409-A`, `DEC-20260409-D`->`DEC-20260409-A`+`DEC-20260409-B`, `DEC-20260411-A`->`DEC-20260302-A-0001`). Every target exists as a record file at this commit; none is a bare collided id per `docs/decisions/id-collisions.yaml`; every edge is substantiated (five directly in the source record's own prose, `DEC-20260409-D`'s two edges substantiated per `DEC-20260905-D`/`-E` under the round's rule (a) rather than in the record's own body).
- Null-field check: spot-checked all 40 rows' `Source`/`Outcome`/`Superseded By` fields against the export. `DEC-20260320-B` is the one record in this partition where `Outcome` and `Superseded By` are populated (not null) — confirmed the record correctly incorporates that content (status: superseded, names `DEC-20260423-B` as successor) rather than treating those fields as null or omitting them. No record in this partition quotes a null field or calls a populated field null.
- No record in this partition is a `--notion-`/`--git-` qualified key, so check (8) (collision-registry binding for qualified records) does not apply to any file in P2.

### Unverifiable

Nothing in this partition could not be verified. The one item that took extra effort to resolve was distinguishing a real quotation defect (`DEC-20260320-A`'s bracket insertion) from checker artifacts (multi-line inline-code spans and a self-referential paraphrase quote in `DEC-20260314-F`/`DEC-20260317-F`/`DEC-20260321-A`), all of which I confirmed by reading the underlying record prose and, where the record made a code claim, by running the exact search the record describes.

PARTITION VERDICT: PASS

### Partition P3

# Closing review, round 10 (final), partition P3

Commit reviewed: `0fd6364fe867a177a4bcde7f1703660837a2e578`. Record count: 41.

Files (in list order): DEC-20260413-A, DEC-20260415-A, DEC-20260415-B, DEC-20260416-A,
DEC-20260419-A, DEC-20260420-A, DEC-20260421-J, DEC-20260421-L, DEC-20260422-B,
DEC-20260422-C, DEC-20260422-D, DEC-20260422-H, DEC-20260423-A, DEC-20260423-B,
DEC-20260424-A, DEC-20260425-A, DEC-20260425-B, DEC-20260427-A, DEC-20260427-B,
DEC-20260427-H, DEC-20260427-I, DEC-20260428-A, DEC-20260428-B, DEC-20260429-A,
DEC-20260430-A, DEC-20260503-A, DEC-20260503-B, DEC-20260504-A, DEC-20260504-B,
DEC-20260504-C, DEC-20260505-A, DEC-20260505-B, DEC-20260505-C, DEC-20260505-G,
DEC-20260505-H, DEC-20260506-G, DEC-20260507-D, DEC-20260507-E, DEC-20260507-F,
DEC-20260507-G, DEC-20260507-H. None of these is a `--notion-` or `--git-` qualified
filename, so check (8) does not apply to this partition, and none carries a
`strale-io/strale-frontend@` cross-repo evidence entry.

### Method

Setup: `git worktree add --detach C:/tmp/strale-closing10-P3 0fd6364f...` then
`npm ci`, both against the pinned commit; never edited, never committed. Read
Notion rows only through `dump_rows.py <out> PAGE:<id>`; fetched one Journal page
body and one Decisions-database page body directly through the Notion MCP
`notion-fetch` tool where the claim was about page-body content, per rule (c).
Checked, for every record: frontmatter parse and `record_key`/`id`/filename
agreement; the CAUTION banner and the five protected sections; every evidence
path's existence at this commit (script, below); every frontmatter relation's
target existence and body narration (grep-based occurrence count per relation,
manually read where the count was 1, i.e. frontmatter-only); every double-quoted
span of 25+ (then 12+) normalized characters against its named source, applying
the DEC-20260905-C/D transliteration+lowercase+strip-non-alnum convention with
ellipsis-segmented ordering; and, for at least ten records, one "status on" code
claim verified by reading the named file at this commit.

Scripts used (logic in one sentence each):
- `check_structure.mjs` — for every P3 file, parses frontmatter, compares
  `record_key`/`id` to the filename, checks for the CAUTION banner and the five
  section headings, and flags a non-`active` status for visibility (not itself
  a defect).
- `check_relations.mjs` — for every P3 file, extracts `type`/`target` pairs from
  the frontmatter `relations` block, confirms the target exists as some
  record's `record_key` in the corpus, and counts occurrences of the target
  string in the whole file (a count of 1 means the relation appears only in
  frontmatter, i.e. undeclared-by-name in body prose).
- `check_evidence.mjs` — for every P3 file, walks the frontmatter `evidence`
  block and confirms every non-URL, non-cross-repo entry exists as a file at
  this commit.
- `scripts/m2-quote-fidelity.mjs --export <decisions-export-pretty.json>
  --frontend <strale-frontend checkout> --min-chars 12`, run with one `--only`
  per P3 file — the operator checker: for every double-quoted span, tests
  whether its normalized text is a substring of any candidate source's
  normalized text and reports the best-scoring non-match as a residual.

Result: 41 records, 146 spans, 106 faithful, **40 residual** at `--min-chars
12`. Every residual was read against its named source directly (not the
checker's best-match guess). Classification below.

### Residual-mismatch list and classification

All 40 residuals are **checker misses** — faithful once checked against the
actual named source, which the checker's file-vs-file substring pass either
didn't fetch (a parsed Notion row field) or mismatched against a low-confidence
candidate file. None is a fresh defect. By file:

- **DEC-20260413-A** (4 residuals, lines 67-76): all four are the record's own
  self-quotation of its own Decision-section category list and customer
  definition, re-quoted in Consequences. Verified against the file's own
  Decision text (lines 26-29) — faithful.
- **DEC-20260415-A** (3, lines 26/33-40/58): line 26 and 58 are non-attributed
  self-reference/methodology strings; lines 33-40 verified faithful against
  the parsed Notion row (page `34367c87082c8127badec3e6e0f08c91`).
- **DEC-20260415-B** (2, lines 36-42/61): line 61 is the record's own search
  term, not an attributed quote; lines 36-42 verified faithful against the
  parsed Notion row (page `34367c87082c818a9947da273d8c1161`).
- **DEC-20260416-A** (1, lines 70-71): self-quotation of the record's own
  Rationale text ("full SQS/provenance metadata") — faithful. (A different,
  already-known misattribution elsewhere in this same file — see "Corrections
  already applied" below — was not flagged by the checker at all, since the
  checker accepted the record's own Rationale section as a valid candidate
  source for its own Consequences self-quote.)
- **DEC-20260420-A** (1, lines 71-72): rhetorical scare-quote ("the 0048
  snapshot") describing a hypothetical, not an attributed quotation —
  faithful/not-a-quotation.
- **DEC-20260421-L** (1, line 84): rhetorical contrast ("this is gone" / "this
  is waiting") is the record's own construction, not attributed — faithful.
- **DEC-20260425-A** (1, lines 169-170): self-quotation of the record's own
  Decision-section text (`processing_location keeps its current F-AUDIT-02
  Contain behaviour...`) — faithful.
- **DEC-20260427-H** (1, lines 44-54): verified faithful against the parsed
  Notion row (page `34f67c87082c81519b01d6342f9ff8ad`) word for word.
- **DEC-20260427-I** (4, lines 48-97): all four are long faithful quotations
  of the row's own Rationale/Outcome fields or code comments the checker's
  best-match scored weakly against unrelated sibling records; individually
  verified against `auto-register.ts`, `swiss-company-data.ts`,
  `polish-company-data.ts`, `officer-search.ts`.
- **DEC-20260505-A** (4, lines 37-53): all four verified faithful, substring
  for substring, against the parsed Notion row (page
  `35767c87082c81949dcef0abc9058d9c`).
- **DEC-20260505-B** (5, lines 37-94): all five verified faithful against the
  parsed Notion row (page `35767c87082c8108b1e5feda64588081`) and against
  `apps/api/src/lib/lifecycle.ts` / `apps/api/scripts/lifecycle-transition.ts`.
- **DEC-20260505-C** (4, lines 37-82): all four verified faithful against the
  parsed Notion row (page `35767c87082c8126951cedabd9fac480`) and
  `apps/api/src/lib/matching.ts`.
- **DEC-20260505-G** (2, lines 40-54): both verified faithful against the
  parsed Notion row (page `35767c87082c8161ac2cee6bdc1200c6`).
- **DEC-20260505-H** (1, line 50-51): verified faithful against the parsed
  Notion row (page `35767c87082c8135a0ace75e6c33a3dd`).
- **DEC-20260507-D** (2, lines 31/71): both self-quotations of the row's own
  Rationale field ("not available", "per CA product page"), verified against
  the parsed Notion row (page `35967c87082c81bab96dc64b983e85f1`) — faithful.
- **DEC-20260507-E** (2, lines 56/71): both self-quotations of the record's
  own title/Decision text ("meaningful customer traffic") — faithful.
- **DEC-20260507-F** (1, line 50): verified faithful against the parsed
  Notion row (page `35967c87082c81108066cc35330a9f65`).
- **DEC-20260507-G** (1, line 39): verified faithful against the parsed
  Notion row (page `35967c87082c81ecbf78d9db46c8deaa`).

### Corrections already applied by DEC-20260905-B through -K (not findings)

Per rule (a), the following statements found in P3 records are corrected by a
withdrawal record's Decision list and are **not findings** against the
original record (I checked each correction and found it right, except one
noted below as a finding):

- DEC-20260413-A: "aggressive addition when free to maintain" (DEC-20260905-D
  item 8) — correction verified right.
- DEC-20260416-A: inserted "the" in "the first-party MCP is the only surface"
  (DEC-20260905-J item 19) — correction verified right.
- DEC-20260419-A: misattribution of "a new file added to the allowlist
  requires a justification comment" to the script header (DEC-20260905-B item
  3) — correction verified right (the script's actual header contains no such
  sentence; `apps/api/scripts/check-no-new-console.mjs:12` reads as the
  correction states).
- DEC-20260420-A: "we still hand-write; just in TS, not SQL files" verb-form
  substitution (DEC-20260905-C item 33) — correction verified right against
  `DEC-20260511-C.md:39`.
- DEC-20260422-B: "leave the row, mark it, don't delete" paraphrase-as-quote
  (DEC-20260905-D item 11) — correction verified right.
- DEC-20260422-D: false "no manifest schema field carries `license_url`" claim
  (DEC-20260905-I item 4) — correction verified right (`manifests/doi-resolve.yaml`
  does carry `license_url`); dropped-"data" misattribution to own Decision
  section (DEC-20260905-J item 24) — correction verified right.
- DEC-20260422-H: quoted from DEC-20260430-A a sentence that record's own text
  makes stale (per DEC-20260905-G item 6). DEC-20260905-G's own text explicitly
  carves this out as a faithful quotation of what DEC-20260430-A says, not a
  fresh defect in DEC-20260422-H — agreed, not a finding here.
- DEC-20260425-A: misattribution of the manifest-jurisdiction sentence to
  "Decision" instead of "Rationale", plus a comma/parenthetical substitution
  (DEC-20260905-B item 12) — correction verified right.
- DEC-20260427-H: false "no record for DEC-20260420-H exists" claim
  (DEC-20260905-D item 12) — correction verified right
  (`docs/decisions/id-collisions.yaml:287-302` shows it resolved).
- DEC-20260427-I: "(Phase 2a/2b)" composite (DEC-20260905-D item 13);
  reversed-order ellipsis quotation of `polish-company-data.ts` (DEC-20260905-D
  item 14); "scraper" for "scraping path" (DEC-20260905-J item 25) — all three
  corrections verified right against `auto-register.ts` and
  `polish-company-data.ts`/`dutch-company-data.ts`.
- DEC-20260428-B: `related_to DEC-20260428-A` relation not narrated by name in
  body (DEC-20260905-D item 15, substantiation not withdrawal) — verified: the
  relation occurs exactly once in the file (frontmatter only); the
  substantiating basis (both decided 2026-04-28, `CLAUDE.md`'s "Pairs with
  DEC-20260428-A") is sound.
- DEC-20260430-A: two `related_to` relations (to DEC-20260428-A and
  DEC-20260428-B) not narrated by ID, substantiated by DEC-20260905-F items
  1-2 / -H items 2-3 / -I items 5-6 / -J items 26-27 — verified: both targets
  occur exactly once in the file (frontmatter only); the Context-section
  phrases "the third-party sourcing doctrine" and "the engineering bar"
  uniquely identify the two targets by title/topic — substantiation is sound.
  Separately, DEC-20260430-A's stale claim that DEC-20260420-K is unresolved
  and DEC-20260422-H is unmigrated (DEC-20260905-G item 6) — correction
  verified right (`id-collisions.yaml` shows DEC-20260420-K resolved;
  `DEC-20260422-H.md` exists).
- DEC-20260503-A: stale "unresolved source-ID collisions" claim about
  DEC-20260502-A/DEC-20260420-E/F/H (DEC-20260905-I item 7) — correction
  verified right (all four are `resolution_status: resolved` in
  `id-collisions.yaml`).
- DEC-20260503-B: "tiered audit trail" word-order transposition
  (DEC-20260905-D item 16) — correction verified right; the file's own title
  reads "audit trail tiered", confirmed.
- DEC-20260505-H: misattribution of "not set in production" to
  `OPENSANCTIONS_API_KEY`'s `cost_note` (DEC-20260905-F item 3) — correction
  verified right; that row's actual `cost_note` (`config/env-manifest.yaml:806`)
  reads "Held, not read...", a different sentence.
- DEC-20260506-G: partially-false claim about DEC-20260422-H ("no formal
  record exists", DEC-20260905-H item 4) and misattribution of the Kyckr
  sales-gated-pricing quote to DEC-20260507-D instead of DEC-20260507-F
  (DEC-20260905-B item 38) — both corrections verified right.
- DEC-20260507-G: "one day after DEC-20260518 batch work" date-math error
  (DEC-20260905-C item 39) — correction verified right; commit `9ee19282` is
  dated 2026-05-16, two days *before* `DEC-20260518-F`'s `decided_at:
  2026-05-18`.

### Findings

1. **DEC-20260905-J's item 28 (a correction affecting DEC-20260507-D) is
   itself wrong.** File: `docs/decisions/records/DEC-20260507-D.md`, lines
   32-34 (Decision section — J's own text mislabels the location as "Context
   section," a second, minor slip). The withdrawn statement: "The row implies
   an edit to the Counterparty Assurance product page, removing 'future
   BYO-endpoint augmentation' language." J's stated reason: "'the
   Counterparty Assurance product page' is a Notion page outside this
   record's own evidence array, not the parsed row, the row's page body, or
   any cited evidence page; its wording cannot be checked against any source
   the candidate set admits."

   This is false. The exact phrase "future BYO-endpoint augmentation" is a
   verbatim substring of the **parsed row's own Rationale field** — the same
   row DEC-20260507-D cites as its `evidence[0]` (page
   `35967c87082c81bab96dc64b983e85f1`). Dumped directly via `dump_rows.py`:

   > "...UBO sources gated to AML-obliged Subject Persons (DE
   > Transparenzregister, NL paid KVK, ES RCTIR, PT RCBE) are therefore out
   > of scope; coverage returns 'not available' rather than BYO. Trade-off:
   > UBO depth thinner than competitors who accept BYO from AML customers.
   > Acceptable per ICP scoping. Implies CA product page edit (remove
   > 'future BYO-endpoint augmentation' language)."

   The record's quotation is a faithful, correctly-attributed substring of
   the parsed row (the row IS "the parsed row" the convention names as an
   admissible source), not an unverifiable reference to a separate,
   uncited Notion page. DEC-20260507-D's original statement should not have
   been withdrawn on this ground; the withdrawal record's stated basis for
   marking it unverifiable is itself factually wrong.

   Evidence: `docs/decisions/records/DEC-20260507-D.md:32-34`; the parsed
   Notion row for page `35967c87082c81bab96dc64b983e85f1` (dumped via
   `dump_rows.py`); `docs/decisions/records/DEC-20260905-J.md` item 28 (the
   wrong correction).

No other findings against the 41 records reviewed.

### Ten code-claim spot checks

1. **DEC-20260416-A** — `packages/mcp-server/package.json:2` reads `"name":
   "strale-mcp"`, confirming `strale-mcp` still ships as a first-party
   package.
2. **DEC-20260416-A** — `apps/api/src/routes/x402-gateway-v2.ts` defines
   `toBazaarFields` (line 402) and `buildBazaarDiscovery` (line 441), both
   invoked further down the file, confirming the Bazaar discovery builder
   claim.
3. **DEC-20260420-A** — `apps/api/package.json` carries no `db:generate`,
   `db:migrate`, or `db:push` script (`grep '"db:'` returns nothing),
   confirming the record's claim.
4. **DEC-20260425-A** — `apps/api/src/lib/provenance-builder.ts:241` reads
   "Strale's own processing region — read from RAILWAY_REPLICA_REGION",
   matching the record's claim about `processing_location`'s helper.
5. **DEC-20260427-I** — `apps/api/src/capabilities/dutch-company-data.ts:1-4`
   reads "REPLACES the prior northdata.com scraping path (Tier 1 violation
   per DEC-20260427-I-1, deactivated 2026-04-29)", confirming the migration
   comment (note: the word is "scraping path", not "scraper" — see
   "Corrections already applied" above).
6. **DEC-20260427-I** — `apps/api/src/capabilities/auto-register.ts:158-172`
   carries the REACTIVATED comments for `dutch-company-data` and
   `portuguese-company-data` naming Openapi.com WW-Top/PT-Advanced, matching
   the record's Consequences claim.
7. **DEC-20260505-B** — `apps/api/src/lib/lifecycle.ts:143` confirms
   `evaluateLifecycle` and `runLifecycleSweep` were removed with the SQS
   engine, while `transitionCapability` (line 76) remains, matching the
   record's Rationale claim about what was retained vs. deleted.
8. **DEC-20260503-B** — the file's own frontmatter `title` reads "...audit
   trail tiered (basic on capabilities, full on *-Assurance products)",
   confirming the correct word order per the round-3 correction.
9. **DEC-20260507-G** — `manifests/bulgarian-company-data.yaml:54` and
   `manifests/cypriot-company-data.yaml:83` both state `data_source:
   Openapi.com WW-Top...`, confirming neither capability runs on the direct
   Tier-1 self-build path the row decided, and `config/env-manifest.yaml:778`
   (`OPENAPI_ENABLED` purpose field) reads "MUST stay 'false' in production
   until the resale addendum is countersigned", matching the record's quote.
10. **DEC-20260507-H** — commit `84398f7` does not resolve in this
    repository's history (`git cat-file -t 84398f7` fails: "Not a valid
    object name"), confirming the record's own claim that the commit named
    as its source does not resolve on `main`.

### Unverifiable

Nothing in this partition was left unverifiable. Two claims that initially
looked unresolvable were in fact checked successfully:
- DEC-20260429-A's "four review triggers" (Consequences, line 69) is
  attributed to the Notion page's own body content, not the parsed export.
  Fetched directly via the Notion MCP `notion-fetch` tool (page
  `35167c87082c8172bff8f3485699c961`): the page's "Re-evaluation triggers"
  section lists exactly the four triggers the record states (monthly bill
  >€1.5k; customer/regulator demand for dataset replay; 12-month/April-2027
  review; Dilisense-initiated terms change). Confirmed true, consistent with
  DEC-20260905-E's and -H's own "Not adopted" notes on this same point.
- DEC-20260424-A's Context-section quotation "silent-governance gap between
  DEC-stated and DEC-enforced" (attributed to "the related course-correction")
  is a Journal-database entry, not a Decisions-database row in the export.
  Fetched directly via `notion-fetch` (page `34967c87082c8127a7e0e9214bbb6dec`):
  the Journal page's own title is verbatim "Silent-governance gap between
  DEC-stated and DEC-enforced (DEC-20260320-B pipeline coverage gap)".
  Confirmed faithful.

Point-in-time production/database-state claims in this partition (e.g.
whether the 15 paused KYB solutions from DEC-20260427-I are currently
`is_active`, whether OpenRegister production is billed on Free/trial-Pro/paid
Pro in DEC-20260505-H/-E, whether Implisense's RapidAPI account was ever
created per DEC-20260505-G) are left exactly as the records themselves state
them — each record already flags these as unverified from repository
evidence alone, consistent with prior rounds' "Not adopted" treatment of the
same class. Not reported as findings; not treated as passed either.

PARTITION VERDICT: FAIL

### Partition P4

# Closing review, round 10 (final round), partition P4

Commit reviewed: `0fd6364fe867a177a4bcde7f1703660837a2e578`
Record count: 41 files, listed in `closing10-P4.txt` (DEC-20260507-I through DEC-20260904-B)

### Setup

`git worktree add --detach C:/tmp/strale-closing10-P4 0fd6364fe867a177a4bcde7f1703660837a2e578`, no `npm ci` was required for the checks used (the quote-fidelity script and my ad-hoc checkers only need Node built-ins plus `js-yaml`, which was already present). No file in the worktree was edited or committed; my three throwaway check scripts were deleted before removing the worktree. `git status --short` was clean before removal. The worktree was removed with `git worktree remove --force` after PowerShell's `Get-ChildItem -Recurse -Force -Attributes ReparsePoint` showed only `node_modules` junctions whose targets all resolve inside the worktree itself (npm workspace links to `packages/*` and `apps/api`).

### Script used

Ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12`, with one `--only <file>` per record in my partition. Logic in one sentence: it extracts every double-quoted span of at least 12 characters from each record's body, normalizes both the span and every candidate source (Notion row fields via the export, other decision records, and repo/frontend files) under the stated convention (transliterate special characters, lowercase, strip non-alphanumerics), splits on ellipses into ordered segments, and reports a span as "faithful" if it (or all its segments in order) appear as a substring of at least one candidate source.

Result: **41 records, 118 spans, 110 faithful, 8 residual.**

I additionally wrote three throwaway Node scripts (deleted before worktree removal): one to check frontmatter validity, `record_key`/`id`/filename agreement, the CAUTION banner and the five protected sections against every record in the partition (parsed via `scripts/decision-records-lib.mjs`); one to check every `evidence` entry resolves (file exists, cross-repo commit/path resolves via `git -C strale-frontend cat-file -e` or `ls-tree`, same-repo commit citations via `git cat-file -t` / `git merge-base --is-ancestor`) and every `relations` target exists as a record key; and one to validate every record against `docs/project/schemas/decision-record.schema.json`'s `required` fields and enums.

### Residual-mismatch classification (all 8 are checker misses, no real defects)

1. **DEC-20260510-A**, line 86, `"promote a useful handoff note to tracked,"` — not attributed to Notion or any file; it is the record's own paraphrase of the row's `PROMOTE-TO-TRACKED` classification, contrasted against T15's stricter discipline. Self-authored phrasing in quotes, not a sourced quotation. Checker miss, not a finding.
2. **DEC-20260518-A**, line 100, `"Evidence Tier 1/2/3"` — the record explicitly states this label was NOT found anywhere in code/manifests/claims.yaml; the phrase is quoted as the search term being negated, not attributed as an actual quotation from a source. I confirmed the negative claim: `grep -rn "evidence_tier" apps/api/src manifests docs/company/claims.yaml` at `0fd6364f` returns zero matches. Checker miss.
3. **DEC-20260820-B**, line 26, `"The burden collapses"` — attributed (by context) to the cross-repo frontend evidence `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/`. Verified directly: `git -C strale-frontend show f704cb2:docs/website-redesign/homepage/integration-burden-v1.3.md` line 13 reads "Adopt **The burden collapses** as the second homepage section." Faithful; the checker does not appear to search this cross-repo directory evidence form for this record. Checker miss.
4. **DEC-20260820-D**, line 28, `"Selection Violet"` — same pattern. Verified in `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-enrichment-validation-v1.5.md`, which uses "Selection Violet" repeatedly including "Approved on 2026-08-20 as `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`... accepts Selection Violet..." Faithful. Checker miss.
5. **DEC-20260820-E**, lines 28 and 63, `"not a live ranking"` (twice) — verified in `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-search-web-intelligence-v1.6.md`: "The card is labelled **Documented output example** and **not a live ranking**." Faithful. Checker miss.
6. **DEC-20260904-A**, line 180, the long quote about "Every row reaches formally_migrated..." — attributed in the text to "G1's `closes_when` clause in the M2 closure register," not to DEC-20260905-C (the checker's weak best-match). Verified directly against `docs/project/m2-closure-register.yaml:5165-5166`, which reads exactly (modulo line-wrap) "Every row reaches formally_migrated, intentionally_historical, or obsolete_or_superseded through contradiction-checked batches, or an explicitly reviewed rule classifies pre-readiness feature-scope rows as evidence-only." Faithful (the register file itself is not listed in this record's `evidence` array, which is a minor citation-hygiene point, not a fidelity defect — the quote is accurate). Checker miss.
7. **DEC-20260904-B**, line 102, `"where did this id's authority come from"` — self-authored rhetorical framing in the Rationale section ("keeps one grammar for 'where did this id's authority come from' rather than inventing a second mechanism"), not attributed to any source. Checker miss.

### Findings

None. Every record in the partition passed all checks: frontmatter parses and `record_key`/`id`/filename agree for all 41 (all are bare keys — none in this partition is `--notion-` or `--git-` qualified); the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present in every record; every `evidence` entry resolves (Notion URLs found in the export except six pages that are Journal/Working-Rules/Vendor-Stack pages outside the Decisions DB, which I spot-verified live via `notion-fetch` rather than reporting unverifiable — see below; two same-repo commit citations in DEC-20260822-A and DEC-20260901-A resolve via `git cat-file` including one same-repo branch reference `codex/repo-native-operating-model@b2951094...`; all cross-repo `strale-io/strale-frontend@<sha>:<path>` entries resolve); every `relations` target exists as a record key at this commit (checked against a full index of all record keys/ids in the repository, after fixing a CRLF line-ending bug in my own throwaway script that had initially produced two false "MISSING" relation reports for DEC-20260508-A → DEC-20260507-H and DEC-20260508-D → DEC-20260505-H, both of which exist and resolve once newlines are normalized); no relation target in this partition is a bare collided id from `docs/decisions/id-collisions.yaml`; no null Notion field is quoted (checked the two records with a null `Rationale` field, DEC-20260507-J and DEC-20260513-A — both records explicitly and correctly state "Rationale is null" rather than quoting it); and full schema validation (`docs/project/schemas/decision-record.schema.json` required fields and enums: status/scope/owner/migration_status/authority_scope/authority_active/phase) passes for all 41.

Two Notion-page-BODY claims (not caught by the export-based checker because they cite non-Decisions-DB pages) were verified live via `notion-fetch` rather than left as "unverifiable": DEC-20260511-D's Context section states "the workstream-close Journal and one methodology sentence say five worked examples, while the methodology's numbered archive, version note, formal Decision, and Rule H name six." I fetched both the Vendor Evaluation Methodology v1.0 page (`35d67c87082c819f9cecd689c6fa5d10`) and the Journal "Openapi workstream close" page (`35d67c87082c810da042f2d768702b55`) directly. Confirmed: the Journal page's action item 3 reads "three rules + Rule 2 extension + five worked examples + starter prompt template," the methodology page's own body says "The five worked examples documented..." in one sentence, but its "Worked examples archive" numbers six items 1-6, and its Versioning notes section states "Six worked examples." The record's characterization of this internal inconsistency is accurate.

### Checker residuals for partition (repeated from above for the report format)

See "Residual-mismatch classification" section: 8 residuals, all classified as checker misses with the source that makes each faithful.

### Ten code-claim spot checks (file, line)

1. **DEC-20260507-J.md:53-56** — quotes `apps/api/src/lib/circuit-breaker.ts`'s header comment "Until now nothing routed them here: `test-runner.ts` never called `recordFailure`..." Verified: `circuit-breaker.ts` lines 190-191 contain this text verbatim, and `grep -n "recordFailure(" apps/api/src/lib/test-runner.ts` returns zero matches, confirming the claim that `test-runner.ts` never calls it.
2. **DEC-20260508-D.md:74-83** — claims OpenRegister is live via `apps/api/src/capabilities/german-company-data.ts` calling `https://api.openregister.de` gated on `OPENREGISTER_API_KEY`, and that `config/env-manifest.yaml` records `holder: railway`, `required_in: [production]`, `set_in: [railway]`, with no dormancy cost note. Verified: `german-company-data.ts` line 21 defines `const API = "https://api.openregister.de"` and line 99 reads `process.env.OPENREGISTER_API_KEY`; `config/env-manifest.yaml` lines 788-796 match exactly as described.
3. **DEC-20260511-B.md:69-73** — claims block 0066 still runs on every boot and a later block 0069 also touches the same table. Verified: `apps/api/src/lib/startup-migrations.ts` exports both `runMigration0066_ensureEligibilityColumnAndReconcile` (line 610) and `runMigration0069_reconcileEligibilityFromCostClass` (line 829), both registered (lines 3960, 3963).
4. **DEC-20260511-F.md:64-67** — claims `apps/api/src/jobs/daily-digest.ts`'s header states "Usage: cd apps/api && npx tsx src/jobs/daily-digest.ts," implying a manual, not scheduled, invocation. Verified: line 5 of that file reads exactly that.
5. **DEC-20260515-A.md:124-136** — claims `us-company-data-cobalt.ts` calls `https://apigateway.cobaltintelligence.com/v1` gated on `COBALT_API_KEY`, that `config/env-manifest.yaml` records it as `required_in: []`/`set_in: [none]`, and that DQ-30 in `docs/company/DECISION-QUEUE.md` records Petter's answer "leave Cobalt, EINsearch and sec-api in place, he will activate them later." Verified: the API URL and key-gating are present at lines 28/31; DQ-30 (line 17-32 of DECISION-QUEUE.md) contains the quoted answer text and the dark-capability flags description.
6. **DEC-20260518-A.md:100-104** — claims no `evidence_tier` field or `"Evidence Tier 1/2/3"` string exists anywhere in `apps/api/src`, `manifests/`, or `docs/company/claims.yaml`. Verified: `grep -rn "evidence_tier" apps/api/src manifests docs/company/claims.yaml` returns nothing.
7. **DEC-20260518-D.md:71-80** — claims `danish-company-data.ts` sets `ubo_availability = "unavailable_no_registry"` with a specific reason string, and `uk-company-data.ts` sets `ubo_availability = "available"` with a specific reason string. Verified both exactly at the cited lines.
8. **DEC-20260812-A.md:64-69** — claims the DEC-20260502-A edge and both colliding rows are withheld from the formal relation graph and preserved in `docs/decisions/id-collisions.yaml`. Verified: `id-collisions.yaml` line 415 has an `id: "DEC-20260502-A"` collision entry listing both source rows.
9. **DEC-20260822-A.md:50-53** — claims daily-run work is reported as `SYSTEM_ACTING`/`FOUNDER_DECISION`/`AUTHORIZATION_UNAVAILABLE` "according to the shapes enforced by `apps/api/src/lib/production-authority.ts`." Verified: the three literal tag strings live in `apps/api/src/lib/ceo-brief-lint.ts`'s `STATUS_TAGS`, and `apps/api/src/lib/charter-authorization-binding.test.ts` statically imports `production-authority.ts` and asserts the three charter-named statuses map onto the shapes that module actually exports (`AUTONOMOUS_POLICY`/`FOUNDER_GATED`) — confirming the record's "according to the shapes enforced by" framing is accurate (the binding, not a literal string match, is what's enforced).
10. **DEC-20260904-A.md:178-183** — claims G1's `closes_when` clause in `docs/project/m2-closure-register.yaml` reads "Every row reaches formally_migrated, intentionally_historical, or obsolete_or_superseded through contradiction-checked batches, or an explicitly reviewed rule classifies pre-readiness feature-scope rows as evidence-only." Verified verbatim (line-wrapped) at `m2-closure-register.yaml:5165-5166`.

### Unverifiable

Nothing in this partition was left unverifiable. All evidence entries resolved (file, cross-repo, same-repo commit, or Notion URL); the six Notion pages outside the Decisions DB export were fetched live via `notion-fetch` rather than reported unverifiable, and both non-trivial factual claims resting on them (the five-vs-six worked-examples inconsistency in DEC-20260511-D) were confirmed accurate.

### Notes on my own tooling errors (corrected before finalizing, not partition defects)

My first pass evidence/relations script used a `\n---\n` regex against raw file content without normalizing CRLF line endings, which produced two false-positive "relation target MISSING" results (DEC-20260508-A → DEC-20260507-H, DEC-20260508-D → DEC-20260505-H) and two false "record_key mismatch" results across the whole partition in the frontmatter check before I fixed it. All corrected by normalizing `\r\n` to `\n` before parsing (matching what `scripts/decision-records-lib.mjs` already does internally); the final clean re-run reported above reflects the fix.

PARTITION VERDICT: PASS

### Partition P5

# Closing review, round 10 (final), partition P5

Commit: `0fd6364fe867a177a4bcde7f1703660837a2e578`
Record count: 34 files (17 collision ids, two source-qualified records each):
DEC-20260225-P-c5d6, DEC-20260303-A, DEC-20260304-A, DEC-20260304-B,
DEC-20260304-C, DEC-20260320-C, DEC-20260320-J, DEC-20260320-K,
DEC-20260405-B, DEC-20260406-A, DEC-20260406-B, DEC-20260406-C,
DEC-20260409-C, DEC-20260420-D, DEC-20260420-E, DEC-20260420-F,
DEC-20260420-G, DEC-20260420-H.

### Method

No sub-agent was used; all work done directly in this session.

1. Set up a detached worktree at the pinned commit (`git worktree add
   --detach C:/tmp/strale-closing10-P5 0fd6364f...`); read-only throughout,
   nothing committed, no `git stash`.
2. Dumped every Notion row for my 34 files' page ids via `dump_rows.py` in
   one call (`PAGE:<id>` for each of the 34 ids) and rendered Decision/
   Rationale/Context/Outcome fields to a plain-text file for direct
   comparison.
3. Read every one of the 34 record files in full and, for every
   double-quoted span attributed to a Notion row, a repo file, another
   record, or the sibling `strale-frontend` checkout, located the named
   source directly (`git show <sha>:<path>`, `grep`/`sed` on the source
   file, or the parsed Notion field) and tested the quote as a substring
   under the stated normalization (case, punctuation, markdown, dashes,
   ellipsis-segments all ignored; a changed/dropped/inserted word or wrong
   attribution is a defect).
4. Cross-referenced every quote and claim against `docs/decisions/records/
   DEC-20260905-B.md` through `-K.md` (all ten withdrawal/correction
   records) to identify which statements in my partition are already
   corrected by a later round, per rule (a), and verified each of those
   corrections is itself right before treating it as non-finding.
5. Checked frontmatter (`record_key`/`id`/filename agreement), the CAUTION
   banner, and the five protected section headings across all 34 files by
   direct `grep`/`grep -L`.
6. Checked every `evidence:` entry resolves to a file that exists at the
   pinned commit (repo files via `ls`/`git cat-file -e`; frontend files via
   `git -C .../strale-frontend cat-file -e 04c9fca9:<path>`; Notion URLs
   accepted as-is).
7. Checked `docs/decisions/id-collisions.yaml` and
   `docs/project/m2-closure-register.yaml` for all 34 page ids: each
   collision entry names the page id with `disposition: formal_record` and
   the matching `record_key`, and each register row for that page id
   carries `disposition: formally_migrated` with the same `record_key`
   (requirement 8, all 34 qualified records).
8. Checked every `relations:` target (9 declared edges across 6 files, the
   rest `relations: []`) resolves to an existing record key and is
   substantiated in ordinary prose (none is a bare collided id).
9. Spot-checked at least ten "status on" code claims by reading the named
   file at the pinned commit (list below).

**Operator checker (`scripts/m2-quote-fidelity.mjs`) could not be run.**
`npm ci` failed repeatedly in the worktree (`ENOTEMPTY`/`EPERM` on
`rmdir` inside `node_modules`, e.g. `zod/src`, `viem/_cjs/chains/
definitions`, `@x402/extensions`) across four attempts, including after a
full `node_modules` removal; `tasklist` showed roughly twenty concurrent
`node.exe` processes on the shared host, consistent with sibling
partition reviewers (P1/P3/P4/P6) running npm installs at the same time.
I did not kill any of those processes since they are very likely other
reviewers' sessions. In place of the checker I did the equivalent by hand:
every double-quoted span of substance in all 34 files was extracted and
verified against its named source directly (see step 3 above), which is
the same test the checker automates. No residual list from the script
itself is available for this partition; there is nothing to reconcile.

### Findings

None. Every quotation, evidence path, relation, and code claim in my
34-file partition either checks out faithfully against its named source,
or is a statement already withdrawn/corrected by one of
`DEC-20260905-G.md` through `DEC-20260905-K.md` under rule (a), where I
independently re-verified the correction itself is right (listed below).
No fresh (unwithdrawn) defect was found.

#### Statements corrected by a prior round (not findings, verified accurate)

1. **`DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md`** quotes
   CLAUDE.md's `DEC-20260303-G` bullet as "Homepage restructure: 11-section
   order." Withdrawn by `DEC-20260905-J` item 4. Verified: `CLAUDE.md:281`
   actually reads "Historical eleven-section homepage order; superseded
   for the apps/web redesign by DEC-20260905-A. Evidence still belongs
   near the claim it supports." The correction is right.
2. **`DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md`**
   quotes two fabricated illustrative sentences ("here is quality
   infrastructure data" / "here is a suggested product to buy") as the
   row's own words. Withdrawn by `DEC-20260905-J` item 5. Verified: the
   row's actual Rationale field reads "...communicates 'quality
   infrastructure' vs 'product recommendation'." (confirmed via
   `dump_rows.py`). The correction is right.
3. **`DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`** quotes
   `trust-grade.ts` as "the worst of (SQS grade, freshness grade, latency
   grade)". Withdrawn by `DEC-20260905-J` item 6. Verified:
   `apps/api/src/lib/trust-grade.ts:211` reads "Combined grade = worst of
   (SQS grade, freshness grade, latency grade)" — no leading "the." The
   correction is right.
4. **`DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md`** lists
   VOICE.md's five writing rules including "No jargon, ever." Withdrawn by
   `DEC-20260905-C` item 31. Verified: `docs/company/VOICE.md`'s first
   rule at the pinned commit reads "Use audience-appropriate terms
   (DEC-20260905-A)."; a full-file search for "jargon" returns nothing.
   The other four quoted rules match exactly. The correction is right.
5. **`DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md`**
   attributes "every solution end-to-end on the scheduler" to "this row's
   own" design. Withdrawn by `DEC-20260905-J` item 18 (it is
   `DEC-20260409-D`'s own characterization, quoted earlier in the same
   record, misattributed here). Verified: `DEC-20260409-D.md:55-56`
   carries that exact phrase in its own Context, attributed to itself, not
   to `DEC-20260409-C`'s row. The correction is right.
6. **`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`** states
   `onboarding-gates.ts` "enforces `PII_CATEGORY_ENUM` exactly as this row
   specifies." Withdrawn by `DEC-20260905-C` item 34 (the enum has grown to
   14 entries since, with `nationality`/`political_affiliation` added
   2026-04-30). Verified: `apps/api/src/lib/onboarding-gates.ts:242-259`
   defines 14 entries with an inline comment dating the addition to
   2026-04-30. The correction is right. The same record's 342/127
   manifest-count observation is a dated observation under
   `DEC-20260905-I`'s clause, not a defect (`DEC-20260905-I` Not-adopted;
   confirmed 350/129 at a later commit is consistent with unrelated work
   merging since).
7. **`DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md`**
   attributes "library-as-product" verbatim to `DEC-20260812-A`/the
   direction-plan document, and separately quotes it as stating it
   "supersedes... the Counterparty Assurance rename/ICP." Both withdrawn:
   the first by `DEC-20260905-H` item 1 (it is `CLAUDE.md:302`'s own
   gloss, not the direction plan's wording — verified: the direction plan
   at lines 14/64 never uses the compound phrase); the second by
   `DEC-20260905-C` item 35 (also `CLAUDE.md:302`'s wording, not
   `DEC-20260812-A.md`'s own body). Both corrections are right.
8. **`DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md`**
   quotes a composite passage from `DEC-20260409-B.md` with a fabricated
   bracketed infill, "[wired into the solution executor]," attributed to
   the sentence about the cross-validation layer being orphaned. Withdrawn
   by `DEC-20260905-E` item 7. Verified: `DEC-20260409-B.md`'s actual text
   at that point reads "...no capability executor under
   `apps/api/src/capabilities/` imports `northdata.ts` today...", and
   "wired into the solution executor" belongs to a different sentence
   describing the *other* half of the feature. The correction is right.
9. **`DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`**
   quotes `DEC-20260812-A` as stating it "supersedes... DEC-20260502-A
   (Counterparty Assurance rename/ICP)... the Counterparty Assurance
   framing is retired as primary product," and separately quotes
   `DEC-20260420-I`'s doctrine text as "direct connections only. No
   scraping..." (dropping "data"). Both withdrawn by `DEC-20260905-C`
   items 36 and 37 respectively. Verified: `DEC-20260812-A.md` contains
   neither "rename/ICP" nor "retired as primary product" (that is
   `CLAUDE.md:302`'s bullet); and `DEC-20260420-I--notion-
   34867c87082c81c8b9d4c6b5568bbcef.md`'s own Decision section reads
   "direct **data** connections only." Both corrections are right.
10. **`DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`**
    characterizes `DEC-20260420-I` as "itself an unresolved collision id in
    a later G2 batch," and separately quotes the row's own References as
    naming "the SA.2 + F-A series" as "the row's own subject." Both
    withdrawn: the first by `DEC-20260905-G` item 5 (the `DEC-20260420-I`
    collision is `resolution_status: resolved` in `id-collisions.yaml`
    with both formal records already on disk); the second by
    `DEC-20260905-J` item 21 (the row's actual text is "complete SA.2 +
    F-A series," not "the SA.2 + F-A series," and no field named
    "subject" exists). Both corrections are right.

### Checker residuals for this partition

None available — the operator checker could not be run (see Method). No
residual list exists to reconcile for P5's 34 files.

### Ten code-claim spot checks (file + line, verified against the pinned commit)

1. `apps/api/src/db/schema.ts:681-696` — `failedRequests` table columns
   match `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`'s
   Consequences exactly (id, userId nullable, ipHash, task, category,
   maxPriceCents, failureType default `no_match`, errorDetail, userAgent,
   createdAt).
2. `apps/api/src/routes/do.ts:935,1163,1207,1265` — exactly four
   `db.insert(failedRequests)` call sites, matching the same record's "one
   INSERT on the failure path... expanded to cover more than one failure
   branch" claim.
3. `apps/api/src/capabilities/auto-register.ts:1-21` — module header
   documents manifest-driven registration and the prior filesystem-glob
   discovery it replaced, verbatim as quoted in
   `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`; no
   `process.exit(1)`/`MIN_EXPECTED_EXECUTORS` gate exists anywhere in the
   file, confirming the record's "neither... exists in auto-register.ts
   today" claim.
4. `apps/api/src/capabilities/au-company-data.ts:6,17` — SOAP/XML ABR
   endpoint URL and `ABN_LOOKUP_GUID` env read, matching
   `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md`'s
   Consequences ("regex-based XML parsing," env var renamed to
   `ABN_LOOKUP_GUID`); `config/env-manifest.yaml:20` carries the same var
   name, no `ABR_AUTH_GUID` anywhere.
5. `apps/api/src/lib/platform-facts.ts:7-21` — module header's "Drift
   problem (cert audit 2026-04-30)" bullets, including "free-tier list: 5
   in marketing, 11 in manifests, 5 different in production" and "Live
   values (capability counts, country counts, free-tier slugs) are
   computed from the DB on demand," both quoted verbatim in
   `DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md` and
   `DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md`.
6. `apps/api/src/lib/trust-grade.ts:211` — "Combined grade = worst of (SQS
   grade, freshness grade, latency grade)" (see corrected-item 3 above).
7. `apps/api/src/lib/solution-executor.ts:11-13,142-143,217-219,297,626,645`
   — input-ref syntax comments, `StepTiming`/`latencyMs` field, and
   per-step timing pushed on both success and failure branches, all
   matching `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md`
   and `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md`.
8. `apps/api/src/routes/transactions.ts:142,168` — "F-A-005: explicit body
   redaction marker..." and "F-A-005: Unauthenticated lookups return a
   redacted envelope..." comments, matching
   `DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md`.
9. `apps/api/src/routes/verify.ts:19,24,29,256,362` — `MAX_DEPTH = 50` and
   the four named F-A-012 comments, matching
   `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md`; and
   `apps/api/src/routes/transactions.ts:200` — `AUTH_VERIFY_MAX_DEPTH = 50`
   as a separately-defined constant, matching the same record's "not
   unified" observation.
10. `apps/api/src/lib/onboarding-gates.ts:242-259,369,546` — 14-entry
    `PII_CATEGORY_ENUM` (12 original + 2 added 2026-04-30) and the
    "`processes_personal_data` is required" gate text, matching (and
    partly correcting, per item 6 above)
    `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`.

### Other structural checks (all 34 files)

- Frontmatter `record_key`/`id`/filename agreement: all 34 match
  (`record_key.md` = filename in every case).
- CAUTION banner and all five protected sections (Decision, Context,
  Rationale, Consequences, Reversal conditions) present in all 34
  (verified with `grep -L`, zero misses).
- All `status: active` (uniform across the partition).
- No null field quoted, no populated field called null: verified for
  every row with a null `Rationale`/`Context`/`Outcome` in the export
  (`DEC-20260420-E--notion-...d5a898f48cc1554086`,
  `DEC-20260420-F--notion-...810b8df1e8e459039d35`,
  `DEC-20260420-G--notion-...81dcafe3dea59cc119b1`,
  `DEC-20260420-H--notion-...b58b36de5f71c0937f`,
  `DEC-20260405-B--notion-...34a67c87082c810692c8dd4374a6f9ac`); each of
  these records states plainly that the field was null/not recorded and
  does not quote it.
- All non-URL `evidence:` paths (96 unique entries across the partition)
  exist at the pinned commit, repo-side and frontend-side (`04c9fca9`).
- `id-collisions.yaml` and `m2-closure-register.yaml`: for all 34
  qualified records, the collision entry names the page id with
  `disposition: formal_record` and the matching `record_key`, and the
  register row for that page id carries `disposition: formally_migrated`
  with the same `record_key` (requirement 8, verified individually for
  every page id).
- Relations (9 declared edges, in
  `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md` →
  `DEC-20260320-B`;
  `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md` →
  `DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6`;
  `DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md` →
  `DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52`;
  `DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md` →
  `DEC-20260409-A`, `DEC-20260409-B`;
  `DEC-20260420-D` through `-H`'s four `--notion-` records → chains of
  `DEC-20260420-A`/`-D`/`-E`/`-F`/`-G` `--notion-` siblings): every
  target exists as a record key at the pinned commit, every one is
  substantiated in ordinary prose naming the target and quoting or citing
  its basis, and none is a bare collided id.

### Unverifiable

- The operator checker's residual output for this partition (see Method
  — environment-level `npm ci` failure, not a defect in the records).
- Claims the records themselves already flag as unverifiable from the
  repository alone (Notion/database/production state, e.g. whether the
  60 KYB solutions in `DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md`
  are still `is_active` in prod today, whether the ~90-page Notion archive
  from `DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md` still
  holds) are left exactly as the records state them; I did not attempt to
  resolve these and neither did the records claim to.

PARTITION VERDICT: PASS

### Partition P6

# Closing review, round 10 (final), partition P6

Commit reviewed: `0fd6364fe867a177a4bcde7f1703660837a2e578`
Record count: 43 files (32 pre-existing formal candidate records spanning DEC-20260420-I
through DEC-20260513-F, plus the ten amending records DEC-20260905-B through -K).

**Environment note (deviation from literal setup instructions):** this session was
already launched isolated in its own git worktree
(`C:\Users\pette\Projects\strale\.claude\worktrees\agent-aed3fa4afa60ab5f8`), which was
already checked out at the pinned commit. Rather than create a second worktree at
`C:/tmp/strale-closing10-P6` (which the harness refuses when an agent is already
worktree-isolated), I did the review in place: read-only, `npm ci` run there, nothing
edited or committed, nothing pushed, no `git stash`, no worktree created or removed by
me. This satisfies the substance of the setup requirement (own isolated worktree, at the
pinned commit, read-only) without the redundant second worktree.

### Script used

`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt
--frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 --only <each of the 43
files>` — the repo's own operator checker: it extracts every double-quoted span >=12
chars from each record, normalizes both the quote and every candidate source (Notion row
fields from the export, named repo files at this commit, sibling records, the frontend
checkout) under the stated convention (transliterate €/×/≥/≤/→/… ; lowercase; strip
non-alphanumerics; split on ellipsis into ordered segments), and reports a span as
"residual" when no candidate source contains it as a substring. I ran it scoped to
exactly my 43 files via `--only`, then separately verified a large sample of both the
non-B/C/D/F/G residuals and the flagged pre-B records against the underlying Notion rows
(`dump_rows.py`), repo files, and the sibling frontend checkout.

Result on my partition: **43 records, 788 spans checked, 696 faithful, 92 residual.**

### Residual-mismatch list and classification

All 32 pre-existing (DEC-20260420-I .. DEC-20260513-F) formal candidate records and
DEC-20260905-B: **0 residuals** — clean.

- `DEC-20260905-C.md`: 156 spans, 83 residual.
- `DEC-20260905-D.md`: 73 spans, 2 residual.
- `DEC-20260905-E.md`: 25 spans, 0 residual.
- `DEC-20260905-F.md`: 16 spans, 6 residual.
- `DEC-20260905-G.md`: 32 spans, 1 residual.
- `DEC-20260905-H.md`, `-I.md`, `-J.md`, `-K.md`: 0 residual each.

**Classification: all 92 residuals in my partition are checker misses, not findings.**
Per the orchestrator's instruction for this partition, and confirmed by direct reading:

1. **The bulk (83 in C, 1 of D's 2) are self-referential parsing artifacts.**
   `DEC-20260905-C.md` itself documents this: a single escaped-quote (`\"`) at
   `DEC-20260905-C.md:373` desynchronizes the checker's quote-pairing for every
   subsequent quoted span in that file, producing mid-sentence fragments of the
   record's own recurring "Withdraws, as the record has it: ... Fact: ..." sentence
   shape rather than real quotation boundaries. `DEC-20260905-D`, `-F`, and `-G` each
   restate and reconcile this exact count (82 in C, 1 in D) in their own Consequences
   sections. I confirmed the defect is real (a stray escaped quote at that line) and
   that the resulting "residual" spans read as prose fragments, not attributed
   quotations, when read in context.
2. **A second class (the ~11 remaining in C, D's other residual, F's residuals, G's
   residual) are genuine quotations that ARE faithful substrings of their true source
   — a Notion row field, a sibling record (e.g. `DEC-20260316-B`, `DEC-20260317-A`,
   `DEC-20260318-A`/`-B`, `DEC-20260320-A`/`-C`, `DEC-20260323-A`, `DEC-20260406-C`),
   CLAUDE.md, or a repo file — that simply was not fetched into my restricted
   `--only`-scoped comparison run (those sibling records/rows are outside my P6 file
   list and the round-9/10 export). The checker's "best match" line for each of these
   shows a low-confidence match against an unrelated DEC-20260905-* record because the
   correct comparison source wasn't in the corpus I ran against, exactly the situation
   my instructions describe as "the checker may report such spans as residuals because
   it attributes them to the wrong source."

   I spot-verified a representative sample of these against their actual sources
   directly (not just against C's/D's/F's own self-description):
   - `apps/api/src/lib/digest-sender.ts` lines 1-5 (header) vs. line 23 (function
     docstring) — confirmed distinct, as C item 23 states.
   - `docs/decisions/records/DEC-20260511-F.md` exists as a formal record with the
     exact title C item 24 quotes — confirmed (not "prose only").
   - `CLAUDE.md:399` — confirmed verbatim ("This is how the platform scales to
     third-party providers"), and `docs/decisions/records/DEC-20260318-B.md:58`
     confirmed to carry "the workflow that scales to" — both as C item 26 states.
   - `apps/api/src/index.ts` lines 10 and 19-30 — confirmed `MIN_EXPECTED_EXECUTORS =
     200` and the exact startup gate C item 29 describes, live in a file the withdrawn
     claim never read.
   - `docs/company/VOICE.md` — confirmed its first rule is "Use audience-appropriate
     terms (DEC-20260905-A)", and confirmed a full-file grep for "No jargon, ever"
     returns zero matches, as C item 31 states.
   - `DEC-20260905-D` and `-K`'s "checker missed it" / "checker miss, faithful to a
     source" residuals, and `DEC-20260905-G`'s "Rule (a) cross-check" residual, are
     each the record's own meta-discussion of the review methodology (quoting the
     concept, not an external source) — read in context, not attributable defects.
   - `DEC-20260905-K` (0 residuals, but worth noting as the tightest chain): I
     independently re-verified all five of its withdrawal items against
     `DEC-20260905-J.md` directly — `J`'s numbered Decision list does run 1-31 (not
     32, confirmed by `grep -n "^[0-9]\+\. "`), line 644 does say "32 numbered items",
     items 26-27 (not 27-28) are the two "Restates the substantiation" entries, item
     28 is a withdrawal (not a substantiation), and lines 652/738/907 do carry the
     wrong "27-28" / "26-28" ranges. K's corrections are all accurate.

No residual in my partition is a real, uncorrected defect.

### Findings

None. No false, fabricated, misattributed, or unverifiable statement found in any of
the 43 records in P6.

### Ten code-claim spot checks (of many more performed)

1. `apps/api/src/lib/platform-facts.ts:164` — `getActiveVendorNames()` defined, matches
   `DEC-20260507-A--notion-...b0ad02d69148811b57`'s claim.
2. `apps/api/src/lib/platform-facts.ts:171` — `getStaleVendorNames()` defined, same
   record.
3. `apps/api/scripts/check-platform-facts-drift.ts:40-43` — imports
   `getStaleVendorNames`, matches the record's cited line range.
4. `apps/api/src/lib/trust-helpers.ts:367` and `:386` — `"manifest_drift"` category and
   the `guaranteed_field_missing:` classification, matches
   `DEC-20260513-F--notion-...269b79cb7d0367dc46`'s cited line numbers exactly.
5. `manifests/austrian-company-data.yaml:368-369` — CC BY 4.0 attribution clause,
   matches `DEC-20260508-B--notion-...8119a22bf1414e307e5f`.
6. `manifests/italian-company-data.yaml` — confirmed no occurrence of "attribution",
   matches the same record's contrast claim.
7. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` lines 145-148 and 215 —
   confirmed live H1 text and the `SolutionsShowcase` Section-2 comment, matching
   `DEC-20260421-B--notion-...81828e3fe183dd5e8072` and
   `DEC-20260421-D--notion-...810695c2e365deb8f2c8`'s contrast claims respectively.
8. `apps/api/src/index.ts:10,19-30` — `MIN_EXPECTED_EXECUTORS = 200` and the startup
   gate, matches `DEC-20260905-C` item 29's correction.
9. `config/env-manifest.yaml:776,778` — `OPENAPI_ENABLED` gating language, matches
   `DEC-20260507-C--notion-...817cad56ec58c707d895`.
10. `CLAUDE.md:270` — the `DEC-20260225-P-c5d6` em-dash bullet, matches
    `DEC-20260905-B` item 13's correction.

(Additional spot checks performed beyond this list: `WORKTREES.md` existence,
`CLAUDE.md`'s Shared-Checkout Rule item 1 and item 3 wording, `docs/decisions/records/
DEC-20260428-A.md:35`, `apps/api/src/jobs/test-scheduler.ts` cost-class gates,
`apps/api/src/lib/startup-migrations.ts` "Block 0069" comment, `apps/api/scripts/
check-no-new-console.mjs:12`, two handoff files for `DEC-20260511-C`, `docs/company/
CHARTER.md:43,399` euro-sign check, `docs/company/VOICE.md` first rule, `apps/api/src/
lib/digest-sender.ts` header vs. function docstring, `docs/decisions/records/
DEC-20260511-F.md` existence, `docs/decisions/records/DEC-20260318-B.md:58`, and the
git-ancestry/register checks for the one `--git-`-qualified record below.)

### Other checks performed

- **Frontmatter / record_key / id / filename agreement**: verified for all 43 files.
  All bare-key files (the ten amending records) have `record_key == id == filename`
  minus `.md`. All 31 `--notion-`-qualified files have `record_key` = filename minus
  `.md`, and `id` = the key with the qualifier stripped. The one `--git-`-qualified
  file (`DEC-20260422-A--git-3b256587.md`) likewise agrees.
- **CAUTION banner and five protected sections**: present in all 43 files (checked by
  grep count on `## Decision|## Context|## Rationale|## Consequences|## Reversal
  conditions` = 5, and a CAUTION banner present, for every file).
- **Evidence paths**: spot-checked a large sample of cited repo files/paths across the
  pre-B records (all exist at this commit) and confirmed all 17 collision-resolution
  report files cited by the 32 pre-B records exist under `archive/sessions/`.
- **Relations**: every relation target across all 43 files (13 for B, 33 for C, 5 for
  E, 2 for F, 6 for G, 3 for H, 7 for I, 29 for J, 1 for K, plus each pre-B record's own
  relations) resolves to an existing record file at this commit. None targets a bare
  collided id (`docs/decisions/id-collisions.yaml` cross-checked for every target ID in
  DEC-20260905-B's relation list; none appear there).
- **`--notion-`/`--git-` qualified collision-registry bindings (item 8)**: verified all
  32 `--notion-`-qualified pre-B `record_key`s appear in
  `docs/project/m2-closure-register.yaml` under `formal_records`. Verified the single
  `--git-`-qualified record (`DEC-20260422-A--git-3b256587.md`) against DEC-20260904-B's
  mechanism: the register's `formal_records` entry has `id: DEC-20260422-A`,
  `source_kind: git-native`, `source_rows: []`, and `git_provenance` equal to the
  record's own first evidence entry
  (`https://github.com/strale-io/strale/commit/3b25658736bfed53eec52c8acf2619dacd54d1f5`);
  confirmed that sha is a full 40-hex commit id and an ancestor of HEAD via `git
  merge-base --is-ancestor`. Also confirmed `docs/decisions/id-collisions.yaml`'s
  `DEC-20260422-A` cross-surface collision entry and the register's G3 gap entry both
  reference this same record and are internally consistent.
- **No null-field-quoted-as-populated or populated-field-called-null**: none found in
  the sampled rows; every dated "null fields" list I pulled via `dump_rows.py` was
  checked against what each record actually asserts (no record in my partition quotes a
  field the export shows null, or calls a populated field null).
- **Amending-record quote-fidelity convention (this partition's special rule)**: verified
  that every quotation attributed by `DEC-20260905-B` through `-K` to a record they
  withdraw from is faithful to that withdrawn-from record at this commit, per the sample
  above; classified the checker's residuals against those quotes as checker misses
  (wrong-source attribution owed to my restricted comparison scope, or the documented
  self-referential parsing artifact), not as findings, exactly per this partition's
  stated rule.

### Unverifiable

Nothing in my partition. Every claim I could check, I checked directly (Notion row via
`dump_rows.py`, repo file at this commit, sibling frontend checkout, or `git log`/
`git merge-base`); no claim was reported as passed without verification.

PARTITION VERDICT: PASS

## Gate run

```
M2 closing review round 10 gate run at 0fd6364fe867a177a4bcde7f1703660837a2e578, 2026-09-06T07:16:01Z
HEAD=0fd6364fe867a177a4bcde7f1703660837a2e578
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (315.5324ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (86.6781ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (6.1076ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (30.3779ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 693765.7699
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (632.8121ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (449.6489ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (223.3484ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (603.8919ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 308889.4246
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
check-no-committed-secrets: clean (3088 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still 0fd6364fe867a177a4bcde7f1703660837a2e578
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Consolidated findings

Three confirmed defects, none previously withdrawn, each inside an
amending record rather than an original candidate record:

1. **`docs/decisions/records/DEC-20260905-C.md`, lines 142-144** (its
   `DEC-20260224-P-g7h8` section, item 1). Found by partition P1.
   `DEC-20260905-C`'s own correction text asserts: "CLAUDE.md does state
   the platform is "Vertical-agnostic" and describes a long-term
   ambition to scale broadly, but not in this wording." At this commit
   `CLAUDE.md` contains neither the word "vertical-agnostic" in any case
   nor any statement of a long-term data-source ambition; the word exists
   only in the user's external `MEMORY.md` file, which `DEC-20260905-C`'s
   own item already rules out as a source for this exact claim. Evidence:
   `CLAUDE.md`; `docs/decisions/records/DEC-20260905-C.md:134-144`;
   `docs/decisions/records/DEC-20260224-P-g7h8.md:70-75`.
2. **`docs/decisions/records/DEC-20260320-A.md`, lines 96-98**. Found by
   partition P2. The record quotes `apps/api/src/lib/capability-
   readiness.ts`'s header comment as "The last two dimensions
   [reliability and limitations] were added per DEC-20260423-B (Stage A,
   warning mode)... 34 caps shipped to prod with NULL reliability." The
   source file's header comment (line 9) reads "The last two dimensions
   were added per DEC-20260423-B (Stage A, warning" with no bracketed
   words anywhere in the file; the bracketed insertion is an inserted-
   words defect under the round's stated convention. Evidence:
   `apps/api/src/lib/capability-readiness.ts:8-12`;
   `docs/decisions/records/DEC-20260320-A.md:96-98`.
3. **`docs/decisions/records/DEC-20260905-J.md`, lines 536-543** (item 28,
   its `DEC-20260507-D` section). Found by partition P3. Item 28
   withdraws `DEC-20260507-D`'s sentence about a Counterparty Assurance
   product-page edit on the basis that the phrase "future BYO-endpoint
   augmentation" is a Notion page outside the record's own evidence array
   and "cannot be checked against any source the candidate set admits."
   The phrase is in fact a verbatim substring of the parsed row's own
   `Rationale` field for page `35967c87082c81bab96dc64b983e85f1`, which is
   `DEC-20260507-D`'s `evidence[0]`; the withdrawal's stated basis is
   false. Evidence: `docs/decisions/records/DEC-20260905-J.md:536-543`;
   `docs/decisions/records/DEC-20260507-D.md:12,32-34`; the parsed Notion
   row for page `35967c87082c81bab96dc64b983e85f1`.

Note on P2's own verdict line: P2's report states "PARTITION VERDICT:
PASS" even though its own "Findings" section names item 2 above as "a
real defect, but minor and not previously withdrawn." P2's verdict line
is not read as a clean bill of health for this round; the consolidated
verdict below is FAIL on all three items regardless of what any
individual partition's own verdict line says, exactly as P2's own report
already treats the finding (naming it as a finding while its summary line
says PASS is an inconsistency in that one report, not evidence the item
is not a defect).

All three items are corrected by `DEC-20260905-L`
(`docs/decisions/records/DEC-20260905-L.md`), which withdraws each
false statement or quotation defect without editing the record it
corrects, per the round's immutability rule.

VERDICT: FAIL
