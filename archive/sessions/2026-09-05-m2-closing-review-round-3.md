---
doc_type: m2-closing-review-round
round: 3
commit: 4318cbeca3b2f934930df1dedb473702adff33c3
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

Round 3 of the M2 closing independent review, run after `DEC-20260905-C`
withdrew round 2's confirmed statements and its sweep's confirmed
statements at commit `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`. Six
fresh, read-only reviewers, none the author of any reviewed content,
applied the quotation convention `DEC-20260905-C` states (normalize
quotation and source before comparing: transliterate symbols, lowercase,
strip non-alphanumerics; an ellipsis splits a quotation into ordered
segments) and ran the operator checker, `scripts/m2-quote-fidelity.mjs`
(the mechanical form of that convention, merged to `main` since round 2),
against the parsed Notion export and the sibling `strale-frontend`
checkout, in addition to round 1 and round 2's own method: each
partition set up a detached, read-only worktree at commit
`4318cbeca3b2f934930df1dedb473702adff33c3`, checked frontmatter validity,
the CAUTION banner, the five protected sections, every quotation, every
evidence path, every relation target, at least ten code claims, and, for
`--notion-` and `--git-` qualified records, the collision-registry and
M2-closure-register bindings. P1 through P4 each took a contiguous slice
of bare-keyed records; P5 and P6 took the qualified records belonging to
this batch's id-collisions, plus, for P6, the two prior withdrawal
records `DEC-20260905-B` and `DEC-20260905-C` themselves, checked like
any other candidate record. Below, every heading in each reproduced
partition report is demoted by exactly one level (`##` to `###`, `###` to
`####`, `####` to `#####`; a report's own top-level `#` title is left
as-is under a `### P<n>` wrapper) so this file keeps one heading
hierarchy throughout; nothing else in any report is edited. There is no
sweep this round: each partition covered its own slice in full rather
than by sample, per the method above.

## Partition reports

### P1

# Closing review, round 3, partition P1

Commit: 4318cbeca3b2f934930df1dedb473702adff33c3
Record count: 41 (docs/decisions/records/DEC-20260224-P-a1b2.md through DEC-20260309-H.md, listed in closing3-P1.txt)

### Method

1. Created a detached worktree at the pinned commit (`C:/tmp/strale-closing3-P1`), ran `npm ci`.
2. Ran `node scripts/decision-records-lib.mjs`'s `validateDecisionRepository` over the whole repo at this commit: zero findings (covers frontmatter parse, record_key/id/filename agreement, CAUTION banner, the five protected sections present and non-empty, id-collision import rules, relation duplicates/self-relations/cycles, and record-key duplicates).
3. Wrote a small script (`check_evidence_local.mjs`, logic: for every P1 record, parse frontmatter, confirm every non-URL and non-cross-repo `evidence` entry exists as a file at the pinned commit, and confirm every `relations[].target` resolves to an existing record file) and ran it over all 41 files: zero missing evidence paths, zero missing relation targets.
4. Ran the operator quote-fidelity checker: `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --only <file>` once per P1 record (41 `--only` flags in one invocation). It extracts every double-quoted span >= 25 chars, normalizes both the span and every candidate source under the declared convention (transliterate special characters, lowercase, strip non-alphanumerics; an ellipsis splits a span into ordered segments), and reports any span it cannot match as a substring of the record's parsed Notion row, the cited repo file at this commit, the sibling frontend checkout, or another record.
5. Cross-checked every DEC-20260905-B / DEC-20260905-C withdrawal item whose target falls in P1 against the live file it corrects, to confirm the correction itself is right, not just asserted.
6. Manually inspected all 5 residuals the fidelity checker reported for P1, reading each source in full rather than trusting the checker's best-match guess.
7. Dumped every Notion page cited by a P1 record's `evidence[0]` in one batch via `dump_rows.py`, and cross-checked every "field X is null" / "both null" claim in the 41 record bodies against the dumped null-field lists.
8. Verified 10 "status on" code claims by reading the named files directly (list below).
9. Spot-checked relation substantiation in prose for all 9 P1 records that declare a non-empty `relations` array.

### Script and residual classification

`m2-quote-fidelity.mjs` totals for P1: 41 records, 141 quoted spans, 136 faithful, 5 residual.

Residuals and classification:

1. `DEC-20260225-P-m1n2.md:49` — quotation `"first vertical: market research and competitive intelligence"` attributed to the prior day's `DEC-20260224-P-c3d4` decision. **Real defect (finding 1 below).** `DEC-20260224-P-c3d4`'s title is `"First vertical: Market research & competitive intelligence"` (ampersand, not the word "and") and its body sentence is `"Market research and competitive intelligence (CI) is the first vertical."` (reversed clause order versus the quoted string, and the word "vertical" is not adjacent to "market research" in the source). Neither the title nor the body sentence contains the quoted string in the order and wording presented; a straight substring check under the stated normalization convention fails against both. Not a checker miss.
2. `DEC-20260226-P-s3t4.md:78` — quotation `"Date-based API versioning via `Strale-Version` header"` attributed to "CLAUDE.md's own ... line." **Real defect (finding 2 below).** `CLAUDE.md` contains no such line at this commit (`grep -n "Date-based API versioning" CLAUDE.md` returns nothing). The phrase exists verbatim only in the user's external `MEMORY.md` file (Key Architecture Decisions bullet), which is outside the repository this candidate set is drawn from — the same class of misattribution DEC-20260905-C withdraws three times for sibling records in this partition (g7h8, q1r2, u1v2). Not a checker miss.
3. `DEC-20260227-P-i9j0.md:68` — quotation `"the capability's own provider runs the code."` attributed to "the row's original meaning." **Real defect (finding 3 below).** The Notion row (page `31367c87082c81049ba4d112accd3f43`) was dumped directly: its Rationale field reads "...Strale is a router, not a compute platform. This minimizes security surface area, eliminates hosting costs for provider code, and aligns with the MCP model where tools run in the provider's environment" and its Decision field is a short title. No substring of either field matches the quoted sentence. Not a checker miss — fabricated quotation.
4. `DEC-20260227-P-s9t0.md:98` — quotation `"Unit 3 becomes unnecessary because A2A/Visa TAP/Supertab matured"`. **Real defect (finding 4 below).**
5. `DEC-20260227-P-s9t0.md:99` — quotation `"Unit 3 was built as a standalone Commerce Protocol"`. **Real defect (finding 5 below).**
   For both 4 and 5: these are presented in quotation marks as if literal, but the checker's own best match was the record's own parsed Notion row at only a 5-character prefix, i.e. no real match exists there or anywhere else. Reading the record shows these are the author's own two invented hypothetical phrasings ("Neither X nor Y describes what happened"), not text drawn from any named source, put in quotation marks anyway. This is the same defect class DEC-20260905-C's item 10 withdraws for a different record ("illustrative phrasing presented as a literal quotation"); it is not withdrawn for this record, so it stands as a live finding here.

None of these 5 residuals is withdrawn by DEC-20260905-B or DEC-20260905-C (checked both records' Decision lists in full for every P1-partition target; the DEC-905-C items that do target P1 records — DEC-20260224-P-g7h8, DEC-20260225-P-y1z2 (x2), DEC-20260226-P-q1r2, DEC-20260227-P-a1b2, DEC-20260227-P-u1v2, DEC-20260302-A-0001, DEC-20260302-C, DEC-20260305-E, DEC-20260306-D, DEC-20260309-G — were separately spot-verified below and are all correct corrections, but they cover different statements than these 5 residuals).

### DEC-20260905-B / DEC-20260905-C withdrawal corrections verified against P1 records

All checked directly against the live file at this commit; all confirmed correct and all confirmed that the amended record's own text is unchanged (as required, since active records are immutable):

- `DEC-20260224-P-g7h8`: confirmed `CLAUDE.md` contains no "tens/hundreds of thousands of data sources" phrase; record still contains the withdrawn claim unchanged.
- `DEC-20260225-P-y1z2`: confirmed `CLAUDE.md:265` has no "(unanimous)" after DEC-19; confirmed `DEC-20260225-P-a3b4`'s own Decision field differs from the stitched composite quoted; record text unchanged.
- `DEC-20260226-P-q1r2`: confirmed no `strale-production.up.railway.app` line exists in `CLAUDE.md`'s Tech Stack section; record text unchanged.
- `DEC-20260227-P-a1b2`: confirmed the row's Rationale field reads "Original Provider Growth doc assumed..." with no leading "the"; record text unchanged.
- `DEC-20260227-P-u1v2`: confirmed no "Distribution packages & protocol endpoints" heading exists in `CLAUDE.md`; record text unchanged.
- `DEC-20260302-A-0001`: confirmed `CHARTER.md` uses an en dash ("€0.02–€1.00"), not the word "to"; record text unchanged.
- `DEC-20260302-C`: confirmed `CLAUDE.md`'s current bullet is the rewritten DEC-20260905-A-superseded text, not the quoted short form; record text unchanged.
- `DEC-20260305-E`: confirmed the Browserless v1/v2 comment lives in `web-provider.ts` (lines ~613-617), not `browserless-extract.ts`, whose own header is a re-export-shim comment with no v1/v2 distinction; confirmed the record's own Consequences section states "35" two paragraphs before the withdrawn "47-to-36" restatement; record text unchanged.
- `DEC-20260306-D`: confirmed a full-file search of the record finds zero occurrences of "circuit" or "breaker"; record text unchanged.
- `DEC-20260309-G`: this record is a P1 file; confirmed "12-category risk framework" also occurs in `docs/programs/codex-review-backlog.yaml` (a meta-reference to this same record), so the record's literal "no matches outside this record" claim is unverifiable as stated, matching DEC-20260905-C's withdrawal.

### Null-field check

Dumped every Notion page cited by a P1 record in one batch (41 pages) and checked every "is null" / "both null" claim in the 41 record bodies against the dumped null-field lists.

- Every P1 record's boilerplate "`Superseded By` and `Outcome` are both null" (or the narrower "`Superseded By` is null" in `DEC-20260305-F`) matches the dumped data, with one initially confusing case: `DEC-20260305-E`'s Reversal-conditions sentence reads "`Superseded By` and `Outcome` are both null beyond the shipped-Outcome text quoted above" — read in full (not truncated) this does not claim Outcome is empty; it explicitly flags that Outcome carries the already-quoted "Shipped..." text, which the dump confirms (`Outcome` is populated, not null, for `DEC-20260305-E`). Not a finding once read past the mid-sentence line break.
- `DEC-20260225-P-m1n2.md:46` states "The row's own Source field is null, unlike most rows in this batch, which cite the shared strategy page." **This is a finding (finding 6 below).** Every one of the 13 `DEC-20260225-P-*` rows in this partition (a3b4, e7f8, g9h0, i1j2, k3l4, m1n2, m5n6, o7p8, q3r4, s5t6, u7v8, w9x0, y1z2), including `m1n2` itself, has a null `Source` field per the dumped Notion data — there is no populated-Source majority for this claim to contrast against within the sampled batch.

### Ten code-claim spot checks

1. `DEC-20260225-P-m5n6.md` — claims no LLM/fuzzy-input code exists in `swedish-company-data`. Confirmed: `apps/api/src/capabilities/swedish-company-data.ts` has no "fuzzy"/"anthropic"/"llm"/"model" hits; `manifests/swedish-company-data.yaml` requires only `org_number`.
2. `DEC-20260226-P-u5v6.md` — claims 342 manifests exist today (`ls manifests/*.yaml | wc -l`). Confirmed: 342.
3. `DEC-20260227-P-o5p6.md` — claims 342 manifests and that Stripe Connect remains off. Confirmed: 342; `CLAUDE.md` Tech Stack reads "Payments: Stripe Checkout (wallet top-ups only, no Connect)".
4. `DEC-20260227-P-q7r8.md` — claims no separable reputation-engine product exists, only `domain-reputation`/`email-reputation-score` capability names and `erc-8004-reputation.ts`'s on-chain reader. Confirmed by grep and by reading the file's header comment ("ERC-8004 trustless agent reputation reader").
5. `DEC-20260302-D.md` — claims `apps/api/src/lib/dependency-manifest.ts` and `apps/api/src/jobs/daily-digest.ts` exist as the code-native tracking mechanism. Confirmed: both files exist.
6. `DEC-20260303-C.md` — claims `/trust` and `/trust/methodology` both route to the same `Methodology` component in the sibling frontend, and that `Methodology.tsx` carries a post-SQS-deletion header comment. Confirmed against `strale-io/strale-frontend@04c9fca9`: `App.tsx` lines 83-84 route both paths to `<Methodology />`; `Methodology.tsx:19` begins "Cert-audit follow-up (2026-08): this page previously documented the "Strale...".
7. `DEC-20260305-F.md` — claims `CLAUDE.md` states the pipeline "generates all 5 test types" and names `onboard.ts` as canonical. Confirmed: `CLAUDE.md:334`.
8. `DEC-20260306-G.md` — claims no `quality/:slug` route exists in code and that `capability_health` (circuit breaker) survives at `apps/api/src/db/schema.ts`. Confirmed: `grep -rn "quality/:slug|v1/quality" apps/api/src/routes` returns nothing; `schema.ts` has the `capability_health (circuit breaker)` comment immediately above the table definition.
9. `DEC-20260308-1.md` — claims `apps/api/src/lib/x402-gateway.ts` uses a configured `EUR_USD_RATE` for USDC settlement. Confirmed: `EUR_USD_RATE` is read from `process.env` with a fail-fast check at lines 43-47.
10. `DEC-20260309-H.md` — claims none of eight named finance-capability slugs exist as manifests, only four manifests platform-wide carry a `disclaimer` field, and a Terms page with specific liability language exists in the frontend. Confirmed: all eight `ls manifests/<slug>.yaml` checks fail (file not found); `grep -l disclaimer manifests/*.yaml` returns exactly the four named files; `strale-io/strale-frontend@04c9fca9:src/pages/Terms.tsx` contains both quoted liability phrases and `App.tsx:81` routes `/terms` to `Terms`.

### Findings

1. `docs/decisions/records/DEC-20260225-P-m1n2.md:49` — the quotation `"first vertical: market research and competitive intelligence"`, presented as the text of the prior day's `DEC-20260224-P-c3d4` decision, does not match that record under the stated normalization convention in either wording or clause order. `DEC-20260224-P-c3d4`'s actual title is "First vertical: Market research & competitive intelligence" and its body sentence is "Market research and competitive intelligence (CI) is the first vertical." (reversed order, no adjacent "first vertical" + "market research" span). Not withdrawn by DEC-20260905-B or -C.
2. `docs/decisions/records/DEC-20260226-P-s3t4.md:78` — the quotation `"Date-based API versioning via `Strale-Version` header"` is attributed to "CLAUDE.md's own ... line," but no such line exists in `CLAUDE.md` at this commit; the phrase exists only in the user's external `MEMORY.md` file, outside the repository. Same defect class as DEC-20260905-C's withdrawals for `DEC-20260224-P-g7h8`, `DEC-20260226-P-q1r2`, and `DEC-20260227-P-u1v2` in this same partition, but this specific misattribution (in `DEC-20260226-P-s3t4`) is not withdrawn by either record. Not withdrawn.
3. `docs/decisions/records/DEC-20260227-P-i9j0.md:68` — the quotation `"the capability's own provider runs the code."`, presented as "the row's original meaning," is not present in the Notion row's Rationale or Decision fields (dumped directly from page `31367c87082c81049ba4d112accd3f43`). Fabricated quotation. Not withdrawn.
4. `docs/decisions/records/DEC-20260227-P-s9t0.md:98` — the quotation `"Unit 3 becomes unnecessary because A2A/Visa TAP/Supertab matured"` is presented in quotation marks but is not drawn from the Notion row, this record's own evidence files, or any other source; it is the author's own invented hypothetical framing. Not withdrawn.
5. `docs/decisions/records/DEC-20260227-P-s9t0.md:99` — the quotation `"Unit 3 was built as a standalone Commerce Protocol"`, same defect as finding 4. Not withdrawn.
6. `docs/decisions/records/DEC-20260225-P-m1n2.md:46` — "The row's own Source field is null, unlike most rows in this batch, which cite the shared strategy page" is false as stated: every `DEC-20260225-P-*` row in this partition (13 of 13, including `m1n2` itself) has a null Source field per the dumped Notion data; there is no populated-Source majority in the sampled batch for this row to be an exception to. Not withdrawn.

No findings on: frontmatter validity / record_key-id-filename agreement / CAUTION banner / protected sections (all 41 records, via the repository validator, zero findings); evidence-path existence (all 41 records, script-checked, zero missing); relation-target existence and substantiation (all 9 records in P1 with declared relations, each checked, all substantiated in ordinary prose); bare collided-id relation targets (none of the 41 records reference `DEC-20260225-P-c5d6` or any other collided id as a bare relation target); the ten code-claim spot checks (all confirmed true); and the DEC-20260905-B/-C corrections targeting P1 records (all ten checked, all confirmed correct).

### Unverifiable

None. Every claim checked in this partition was resolvable one way or the other from the pinned commit, the parsed Notion export, or the sibling frontend checkout.

### Final line

PARTITION VERDICT: FAIL

### P2

# Closing review, round 3, partition P2

Commit reviewed: `4318cbeca3b2f934930df1dedb473702adff33c3`
Record count: 41 (DEC-20260310-E.md through DEC-20260411-B.md, list from `closing3-P2.txt`)

### Method

Worktree `C:/tmp/strale-closing3-P2` created detached at the pinned commit, `npm ci` run there,
never edited. For every record: verified frontmatter parses and `record_key`/`id`/filename agree
(all 41 are bare keys; none are `--notion-`/`--git-` qualified, so item 8 of the checklist does
not apply to this partition); verified the CAUTION banner and the five protected sections are
present; ran the operator checker `scripts/m2-quote-fidelity.mjs` against the parsed Notion export
and the sibling `strale-frontend` checkout, `--only` each of the 41 files; manually read every
residual the checker reported plus every "null field" claim and every non-empty `relations` block
across the partition; cross-referenced `DEC-20260905-B.md` and `DEC-20260905-C.md` for statements
already withdrawn from records in this partition; and read 11 named source files at the pinned
commit to spot-check "status on" code claims (more than the required 10).

Validator: also ran `readDecisionRecords` + `validateDecisionRecords` (the repo's own schema/
structural validator) over the full 233-record corpus and filtered to this partition's 41 paths.
Zero findings touched this partition (the 97 corpus-wide findings are all
`DECISION_RECORD_KEY_UNQUALIFIED_MISMATCH` / `DECISION_ID_DUPLICATE_UNMAPPED` on `--notion-`
qualified files outside this partition, P5's territory).

### Operator checker residuals (3 total, all checker misses)

Command: `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt via dump_rows.py>
--frontend C:/Users/pette/Projects/strale-frontend --only <each of the 41 files>`.
Result: 162 spans checked, 159 faithful, 3 residual.

1. **`DEC-20260314-F.md:84`** — flagged span:
   `"completion_rate\|autonomous_completion\|autonomousCompletion"`. This is a literal `grep`
   command the record quotes verbatim to show its own search methodology
   (`grep -rln "completion_rate\|autonomous_completion\|autonomousCompletion" apps/api/src`), not a
   quotation attributed to any source document. **Checker miss**: the checker has no way to
   distinguish a quoted shell command from a quoted source excerpt; there is no source to fail
   against because none is claimed.
2. **`DEC-20260320-A.md:96`** — flagged span: `"The last two dimensions [reliability and
   limitations] were added per DEC-20260423-B (Stage A, warning mode)... 34 caps shipped to prod
   with NULL reliability."` attributed to `apps/api/src/lib/capability-readiness.ts`'s header
   comment. Verified the file's header comment (lines 8-12) reads: "The last two dimensions were
   added per DEC-20260423-B (Stage A, warning mode): DEC-20260320-B claims the onboarding pipeline
   populates these two fields, but until 2026-04-23 the hook `onCapabilityCreated` did not, and
   `checkReadiness` did not gate on them. 34 caps shipped to prod with NULL reliability (see
   audit-reports/... or C:\tmp\dec-20260320-b-audit.md)." The bracketed `[reliability and
   limitations]` is a marked editorial insertion (the same convention `DEC-20260905-C`'s
   Consequences section excuses for `DEC-20260320-G`'s bracket-plus-ellipsis compression of
   `DEC-20260409-B.md`), and each side of the ellipsis is a genuine, in-order substring of the
   real comment. **Checker miss**: the tool does not special-case a bracketed insertion marker.
3. **`DEC-20260321-A.md:67`** — flagged span:
   `"schedule_tier\|scheduleTier\|ORDER BY"`. Same shape as finding 1: a literal `grep` pattern
   the record quotes to show its own search command
   (`grep -n "schedule_tier\|scheduleTier\|ORDER BY" apps/api/src/routes/solutions.ts
   apps/api/src/routes/internal-tests.ts`), not a source attribution. **Checker miss.**

### Findings

1. **`DEC-20260409-D.md`, frontmatter `relations` (lines 12-14) and body** — the record declares
   two `related_to` relations, to `DEC-20260409-A` and to `DEC-20260409-B`. Neither target is
   named anywhere in the record's own body prose (confirmed: `grep -n "DEC-20260409-A\|
   DEC-20260409-B" docs/decisions/records/DEC-20260409-D.md` matches only the two frontmatter
   lines). The relation to `DEC-20260409-A` is substantiated on the other side: `DEC-20260409-A.md`
   line 52 names `DEC-20260409-D` and states what the relation rests on ("Gate 4 (solution smoke
   tests) 'still pending a separate DEC' ... that separate DEC is `DEC-20260409-D`, decided the
   same day"), which the reciprocal-narration precedent `DEC-20260905-B`'s Consequences section
   sets for `DEC-20260314-A`/`DEC-20260314-B` covers. The relation to `DEC-20260409-B` has no
   narration anywhere: `DEC-20260409-B.md` never mentions `DEC-20260409-D` either (confirmed by
   `grep -n "DEC-20260409-D" docs/decisions/records/DEC-20260409-B.md`, zero matches). This is
   **not** covered by either withdrawal record: `DEC-20260905-C`'s Consequences section explicitly
   lists "`DEC-20260409-D`'s two undeclared-substantiation relations (`DEC-20260409-A`,
   `DEC-20260409-B`)" as a finding it deliberately did **not** adopt, on the stated ground that a
   structural relation-substantiation gap is "not a misquote, misattribution, or false claim about
   content," i.e. outside the five withdrawal classes — meaning the underlying gap for the
   `DEC-20260409-B` leg (the one that is not covered by reciprocal narration) remains a live,
   uncorrected finding under this round's checklist item 6, which requires substantiation in the
   body for a declared relation target. Evidence: `docs/decisions/records/DEC-20260409-D.md:12-14`
   and body; `docs/decisions/records/DEC-20260409-A.md:52`; `docs/decisions/records/
   DEC-20260409-B.md` (absence).

No other findings. Every other quotation, evidence path, relation, null-field claim, and code
claim checked in this partition was faithful, existent, substantiated, or correctly withdrawn by
`DEC-20260905-B`/`DEC-20260905-C`.

### Withdrawals cross-referenced against this partition (confirmed correct, not re-raised)

`DEC-20260905-B` items 4 (`DEC-20260315-I`, `settleReceiptFor` comment attribution) apply to this
partition. `DEC-20260905-C` items 18-28, 30, 32 (`DEC-20260310-F`, `DEC-20260313-C`,
`DEC-20260314-F`, `DEC-20260315-H`, `DEC-20260316-B`, `DEC-20260317-A` x2, `DEC-20260317-F`,
`DEC-20260318-A`, `DEC-20260320-A` x2, `DEC-20260323-A`, `DEC-20260409-D`) apply to this partition.
For every one of these I confirmed: (a) the withdrawn statement is still present verbatim in the
named record (records are immutable), (b) the correction's own quoted "Fact" text is itself
faithful to the source it cites. Spot-verified directly against source files: `DEC-20260315-I`'s
`settleReceiptFor` vs. the x402-verify-call-site comment (`apps/api/src/routes/do.ts`);
`DEC-20260317-A`'s `digest-sender.ts` header vs. the `sendDigestEmail` docstring, and
`DEC-20260511-F.md`'s existence as a formal record; `DEC-20260320-A`'s `capability-readiness.ts`
8-dimension comment and the `capability-persistence.ts` single-insert-site claim. All corrections
confirmed accurate — none of them are themselves wrong, so none produces a new finding against the
withdrawing records.

### Ten (eleven) code-claim spot checks

1. `apps/api/src/lib/capability-readiness.ts` lines 1-16 — confirmed 8 named dimensions and the
   DEC-20260423-B attribution comment, matching `DEC-20260320-A`'s Consequences section.
2. `apps/api/src/routes/do.ts` line 601 (`settleReceiptFor`, MCP/A2A forgeability docstring) and
   line 876-877 (x402 verify-only call site, "the settle step runs only after the capability has
   produced output (DEC-14)") — confirms `DEC-20260905-B` item 4's correction of `DEC-20260315-I`.
3. `apps/api/src/lib/onboarding-gates.ts` — confirmed `gate1_*`, `gate3_schema_coherence`,
   `gate4a_step_ordering`/`gate4a_step_ref` all present, matching `DEC-20260409-D`.
4. `apps/api/src/lib/gate4b-solution-dryrun.ts` lines 1-9 — header reads "Gate 4b — Solution
   Dry-Run Composition Check (DEC-20260409-D Layer B)" and the docstring text quoted in
   `DEC-20260409-D` matches verbatim.
5. `apps/api/src/lib/gate5-path-coverage.ts` line 2 — header reads "Gate 5 — Path Coverage
   Enforcement (DEC-20260411-B)", matching `DEC-20260409-D`'s claim that Gate 5 belongs to a
   different, later decision.
6. `packages/mcp-server/src/tools.ts` — confirmed all 8 meta-tool names (`strale_ping`,
   `strale_execute`, `strale_search`, `strale_balance`, `strale_methodology`,
   `strale_trust_profile`, `strale_transaction`, `strale_getting_started`) present, matching
   `DEC-20260404-A`.
7. `apps/api/scripts/seed.ts` — confirmed absent from disk (`ls` fails), matching
   `DEC-20260318-A`'s and `DEC-20260320-A`'s claim that it was deleted in PR #79.
8. `apps/api/src/routes/solutions.ts` line 7 (import) and line 96 (call site) —
   `worstFreshnessLevel(steps.map((s) => s.freshnessLevel ?? "fresh"))` at line 96, matching
   `DEC-20260321-A`'s Consequences section exactly, including the line number.
9. `apps/api/src/lib/digest-sender.ts` lines 1-5 — header reads "Digest Email Sender — HM-2 /
   Sends the compiled HTML digest via Resend." not "Send the weekly digest (or any platform health
   email) via Resend.", confirming `DEC-20260905-C` item 23's correction of `DEC-20260317-A`.
10. `docs/decisions/records/DEC-20260511-F.md` — confirmed it exists as a formal record
    (`record_key: DEC-20260511-F`, title "Daily digest pipeline silent rot — investigation +
    restoration"), confirming `DEC-20260905-C` item 24's correction of `DEC-20260317-A`.
11. `apps/api/src/routes/public-trust.ts` lines 57 and 71 — confirmed `pass_rate: number | null;`
    and `tested: false,`, matching `DEC-20260313-C`'s Consequences section.

### Unverifiable

None encountered in this partition beyond what the amending records (`DEC-20260905-B`,
`DEC-20260905-C`) already flag as production/database-state claims a read-only repository review
cannot settle (e.g. point-in-time production counts cited elsewhere in the corpus); nothing in
this partition's 41 records rests on an unresolved claim of that kind that isn't already accounted
for.

### Verdict

One finding (`DEC-20260409-D`'s unsubstantiated relation to `DEC-20260409-B`) is real, confirmed
not withdrawn by either amending record, and meets the round's own checklist item 6.

PARTITION VERDICT: FAIL

### P3

# Closing review, round 3 (final round), partition P3

Commit: 4318cbeca3b2f934930df1dedb473702adff33c3
Record count: 40 (DEC-20260413-A through DEC-20260507-H, April 2026 batch plus early May stragglers, per closing3-P3.txt)

### Method

Set up a detached, read-only worktree at the pinned commit and ran `npm ci`. Read `DEC-20260905-B.md` and `DEC-20260905-C.md` in full first and extracted every withdrawal item that names a record in this partition, so an already-corrected statement is not re-raised as a finding. Ran the operator checker `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt path via dump_rows.py> --frontend C:/Users/pette/Projects/strale-frontend` over the whole corpus and filtered its output to the 40 files in this partition. For every residual span the checker reported, read the cited quotation in its record and the actual named source (repository file, sibling record, or Notion row via `dump_rows.py PAGE:<id>`) and classified it as a real defect or a checker miss. Wrote a small Python script to parse every record's frontmatter (`record_key`/`id`/filename agreement, presence of the CAUTION banner and the five protected sections, evidence-path existence, relation-target existence against every `record_key` in the corpus) across all 40 files, then a second script that counts each relation target's name-mentions in the record's own body to flag undeclared-substantiation gaps for manual reading. Spot-checked ten "status on" code claims by reading the named file directly.

### Withdrawals already covering this partition (not findings against the originals)

- `DEC-20260419-A`: DEC-20260905-B item 3 withdraws the misattribution of the allowlist-justification sentence to the script header comment. Checked: correction is accurate (`apps/api/scripts/check-no-new-console.mjs:12` has no such line).
- `DEC-20260420-A`: DEC-20260905-C item 33 withdraws "we still hand-write; just in TS, not SQL files" attributed to `DEC-20260511-C`. Checked: correction is accurate; `DEC-20260511-C.md:39` reads "the project still hand-writes migration logic; just in TS, not SQL files." (Note: the operator checker marked this record's one detected span "faithful" — a checker false negative in the opposite direction from its usual misses; already caught and withdrawn, so not re-raised.)
- `DEC-20260425-A`: DEC-20260905-B item 12 withdraws the Decision-field misattribution ("sourced from a manifest-declared field..."); correct field is Rationale. Checked: accurate.
- `DEC-20260506-G`: DEC-20260905-B item 8 withdraws the EUR-transliteration errors for the €50/week figures; DEC-20260905-C item 38 withdraws the Kyckr quotation's misattribution to `DEC-20260507-D` (belongs to `DEC-20260507-F`). Both checked accurate.
- `DEC-20260507-G`: DEC-20260905-C item 39 withdraws the "one day after DEC-20260518" date-math claim (commit `9ee19282` is 2026-05-16, two days before `DEC-20260518-F`'s `decided_at: 2026-05-18`). Checked accurate.
- Convention-covered truncation-punctuation findings already excused by DEC-20260905-C for `DEC-20260413-A`, `DEC-20260422-H`, `DEC-20260425-A`, `DEC-20260503-B`, `DEC-20260505-A`, `DEC-20260505-B`, `DEC-20260505-C`, `DEC-20260507-E`, `DEC-20260505-H`, `DEC-20260507-G`, `DEC-20260507-H`: not re-raised.

### Checker residuals for this partition, classified

Full residual list (7 spans across 40 records):

1. `DEC-20260413-A.md:90` "aggressive addition when free to maintain" — best match notion:DEC-20260413-A (prefix 10). **Real defect** (see Finding 1 below): not a substring of the Notion row's Rationale field or of the record's own Decision paraphrase.
2. `DEC-20260416-A.md:82` "the first-party MCP is the only surface that exposes Strale's differentiated metadata" — best match record:DEC-20260901-A (prefix 12). **Checker miss.** This is a faithful self-quote of the same record's own Rationale section (`DEC-20260416-A.md:49`, verbatim match); the checker's cross-corpus substring search does not check same-record self-quotation and surfaced an unrelated coincidental partial match instead.
3. `DEC-20260422-B.md:134` "leave the row, mark it, don't delete" — best match record:DEC-20260421-J (prefix 8). **Real defect** (see Finding 2 below): not verbatim in this record, in `DEC-20260421-J.md`, or in the cited files.
4. `DEC-20260427-I.md:83` "REACTIVATED 2026-05-16 (Phase 2a/2b)... to Openapi.com WW-Top / PT-Advanced (Tier 3 vendor aggregator)" — best match evidence:apps/api/src/capabilities/auto-register.ts (prefix 26). **Real defect** (see Finding 3 below): a fabricated composite splicing the dutch-company-data and portuguese-company-data comment blocks.
5. `DEC-20260427-I.md:109` "The northdata.com name-search... KRS-by-number is the only compliant path" — best match evidence:apps/api/src/capabilities/polish-company-data.ts (prefix 25). **Real defect** (see Finding 4 below): the two clauses are reordered relative to the source.
6. `DEC-20260503-B.md:88` "tiered audit trail (basic on capabilities, full on *-Assurance products)" — best match evidence:apps/api/src/jobs/test-scheduler.ts (prefix 7). **Real defect** (see Finding 5 below): the checker's best-match file is a coincidental false lead; the actual source (this record's own title, and the Notion row's Decision field) reads "audit trail tiered", not "tiered audit trail" — word order swapped.
7. `DEC-20260507-D.md:68` "the readiness program adopted ... the Counterparty Assurance framing is retired as primary product, compliance is a separate track gated on customer discovery." — best match record:DEC-20260513-F (prefix 26). **Real defect** (see Finding 6 below): the actual source is `CLAUDE.md:302` ("Readiness program adopted." — no leading "the"); a word was inserted.

### Findings

1. **`DEC-20260413-A.md:90`** — "The 'aggressive addition when free to maintain' posture also reversed." This phrase is presented in quotation marks but is not a verbatim quotation of anything: the Notion row's Rationale field (page `34167c87082c81319338d956e3649d4c`) reads "Capabilities are added aggressively across all 7 verticals when they cost nothing to maintain," and the record's own Decision section paraphrases this as "capabilities are added aggressively across all 7 verticals when they cost nothing to maintain." Neither contains "aggressive addition when free to maintain" as a substring; it is the record's own compressed label for the posture, presented as if quoted. Evidence: the row's Rationale field (page above); `DEC-20260413-A.md`'s own Decision section.

2. **`DEC-20260422-B.md:134`** — "using the same 'leave the row, mark it, don't delete' discipline this record establishes for FK-bound capabilities." This phrase does not appear verbatim anywhere: not in this record's own description of Variant 2 (`DEC-20260422-B.md:44-49`, which reads "Soft-deactivate the capability row ... leave the row in the database as an audit tombstone ... do not attempt DELETE"), not in `DEC-20260421-J.md`, and not in the cited `apps/api/src/lib/capability-readiness.ts`. It is a paraphrase summarizing the Variant 2 discipline, presented in quotation marks as if it were an exact phrase from the source. Evidence: `DEC-20260422-B.md:44-49`; `docs/decisions/records/DEC-20260421-J.md`; `apps/api/src/lib/capability-readiness.ts`.

3. **`DEC-20260427-I.md:83`** — quotes `auto-register.ts` as reading "REACTIVATED 2026-05-16 (Phase 2a/2b)... to Openapi.com WW-Top / PT-Advanced (Tier 3 vendor aggregator)." The actual file has two separate comment blocks: `auto-register.ts:161` "dutch-company-data REACTIVATED 2026-05-16 (Phase 2a): migrated from ... to Openapi.com WW-Top (Tier 3 vendor aggregator)" and `auto-register.ts:168` "portuguese-company-data REACTIVATED 2026-05-16 (Phase 2b): migrated from ... to Openapi.com PT-Advanced (Tier 3 vendor aggregator)." Neither comment reads "(Phase 2a/2b)"; the record stitches the dutch entry's phase label and aggregator name together with the portuguese entry's, producing a composite that exists in neither comment. Evidence: `apps/api/src/capabilities/auto-register.ts:161-170`.

4. **`DEC-20260427-I.md:109`** — quotes `polish-company-data.ts` as reading "The northdata.com name-search... KRS-by-number is the only compliant path." The file's actual comment (`polish-company-data.ts:17-19`) reads "KRS-by-number is the only compliant path. The northdata.com name-search fallback was removed under DEC-20260427-I..." — the two sentences are in the opposite order from what the record's ellipsis-joined quotation implies. Evidence: `apps/api/src/capabilities/polish-company-data.ts:17-19`.

5. **`DEC-20260503-B.md:88`** — "The 'tiered audit trail (basic on capabilities, full on *-Assurance products)' this row describes was not built in that shape." The actual source (this record's own title, and the Notion row's Decision field, page `35567c87082c8120b4c6cde88cf1e435`) reads "audit trail tiered (basic on capabilities, full on *-Assurance products)" — "audit trail tiered", not "tiered audit trail." The two words are transposed. Evidence: `DEC-20260503-B.md` frontmatter `title`; the row's Decision field, page above.

6. **`DEC-20260507-D.md:68`** — quotes CLAUDE.md/`DEC-20260812-A` as stating "the readiness program adopted ... the Counterparty Assurance framing is retired as primary product..." `CLAUDE.md:302` (the actual source; `DEC-20260812-A.md` itself contains no matching text) begins the sentence "**Readiness program adopted.**" with no leading "the". The word "the" was inserted at the start of this quotation. Evidence: `CLAUDE.md:302`; `docs/decisions/records/DEC-20260812-A.md` (confirmed to contain no matching text by grep).

7. **`DEC-20260428-B.md`** — declares `relations: [{type: related_to, target: DEC-20260428-A}]`, but the target is never named, quoted, paraphrased by title, or otherwise substantiated anywhere in the record's body (Decision, Context, Rationale, Consequences, Reversal conditions all read; zero mentions of "DEC-20260428-A" or of scraping/doctrine content). This is a structural relation-substantiation gap of the same class DEC-20260905-C's Consequences section separately identified (and left un-withdrawn, as true) for `DEC-20260409-D`'s two relations. Evidence: `docs/decisions/records/DEC-20260428-B.md` (full-file read).

8. **`DEC-20260427-H.md`**, Context section — states "No record for `DEC-20260420-H` exists in this repository, so this row's own 'Enforce DEC-20260420-H' cannot be recorded as an `affirms` relation edge... it is noted here in prose only." This is false at the reviewed commit: `docs/decisions/id-collisions.yaml:287-302` lists `DEC-20260420-H` as a **resolved** collision with two records, one of which (`record_key: DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f`, "Strale positioning and ICP clarification") carries `disposition: formal_record`, and the corresponding file `docs/decisions/records/DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md` exists in the repository. A qualified formal record for this exact id is present; the claim that none exists is a false statement about repository state. (This same record, `DEC-20260420-H--notion-...b58b36de5f71c0937f.md`, is separately the subject of DEC-20260905-C items 35-36, confirming it is a real, populated record with content directly on point — the Counterparty Assurance / direct-connections-only doctrine — not an empty placeholder.) Evidence: `docs/decisions/id-collisions.yaml:287-302`; `docs/decisions/records/DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`.

### Ten code-claim spot checks

1. `DEC-20260413-A.md` — CLAUDE.md "7 verticals" claim. `CLAUDE.md:306`: "290+ capabilities across 7 verticals (company-data, compliance, developer-tools, finance, data-processing, web-scraping, monitoring)..." Confirmed.
2. `DEC-20260419-A.md` — `check-no-new-console.mjs` allowlist-by-file-path claim. `apps/api/scripts/check-no-new-console.mjs:11-13`: allowlisted by file path + expected count; fails on a new console call in a non-allowlisted file or a growth above an allowlisted count. Confirmed.
3. `DEC-20260421-J.md` / `DEC-20260422-B.md` — `amazon-price`, `hong-kong-company-data`, `indian-company-data` remain in `auto-register.ts`'s DEACTIVATED map. `auto-register.ts:32,95,105` all present. Confirmed.
4. `DEC-20260422-D.md` — `RichProvenance` gains `attribution`/`license_url`/`source_note` typed fields. `apps/api/src/lib/provenance-builder.ts:42-45,126-129`: all three fields present, typed optional strings, in both the interface and the zod schema. Confirmed.
5. `DEC-20260423-B.md` — `onboard.ts` generates known_answer + dependency_health from manifest fixtures plus stub schema_check/negative/edge_case suites. `apps/api/scripts/onboard.ts:6-7`. Confirmed.
6. `DEC-20260425-B.md` — audit builders read `processing_location` from `RAILWAY_REPLICA_REGION`. `apps/api/src/lib/processing-location.ts:5,35`: reads `process.env.RAILWAY_REPLICA_REGION` as the primary source. Confirmed.
7. `DEC-20260427-H.md` — five named capabilities deactivated for ToS-prohibited scraping. `apps/api/src/capabilities/auto-register.ts` comments confirm DEC-20260420-H citations against Bolagsverket/Skatteverket/Google-Patents-adjacent entries and DEC-20260427-I northdata entries; the five-slug list itself is asserted in the row's own Rationale quote and is not independently falsified by this spot check (the record's own evidence array does not include the five specific manifest files' content beyond what's listed; manifests exist at the cited paths). Confirmed the DEACTIVATED-map mechanism and DEC-20260420-H citations exist; see Finding 8 above for the separate record-existence defect in this same file.
8. `DEC-20260428-A.md` — three-tier scraping doctrine matches `CLAUDE.md`'s "DEC-20260428-A" bullet. `CLAUDE.md`'s April 2026 decisions list states the three-tier framework (Tier 1/2/3) verbatim as summarized in the record. Confirmed.
9. `DEC-20260429-A.md` / `DEC-20260427-B.md` — Dilisense wrapper is the live sanctions/PEP source, keyed on `DILISENSE_API_KEY`. `apps/api/src/capabilities/pep-check.ts:4,14,28-29`: imports `DILISENSE_PEP_LISTS_QUERIED`, calls `https://api.dilisense.com/v1/checkIndividual`, reads `process.env.DILISENSE_API_KEY`. Confirmed.
10. `DEC-20260503-B.md` — `MIN_EXPECTED_EXECUTORS` startup gate and `scheduled_testing_eligible` filter. `apps/api/src/index.ts:10,21,24`: `const MIN_EXPECTED_EXECUTORS = 200`, throws below that count. `apps/api/src/jobs/test-scheduler.ts:359,463`: `AND ts.scheduled_testing_eligible = TRUE` at query sites. Confirmed.

### Unverifiable

Nothing in this partition required a Notion-row read that could not be completed, and no cross-repo `strale-io/strale-frontend@<sha>` evidence entries appear in these 40 files. Production/database-state claims within these records (e.g. current `is_active` status of several capabilities, current OpenRegister/Dilisense billing tier) are the kind of claim these records themselves already flag as unresolved from repository evidence alone; I did not attempt to resolve them and treat them as outside this read-only review's reach, consistent with the records' own framing.

### Structural checks (all 40 records)

Frontmatter parses for all 40; `record_key`/`id`/filename agree for all 40 (all bare-key, no `--notion-`/`--git-` qualified files in this partition); the CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present in all 40; no missing `evidence` path was found (all local paths exist at this commit, all Notion/GitHub URLs are well-formed); every `relations` target resolves to an existing `record_key` in the corpus (checked against every frontmatter `record_key` in `docs/decisions/records/`); no relation target is a bare collided id. No null-field-quoted-as-populated or populated-field-called-null defects were found in the records read in full above.

PARTITION VERDICT: FAIL

### P4

# Closing review, round 3, partition P4

Commit: 4318cbeca3b2f934930df1dedb473702adff33c3
Record count: 41

Files reviewed (docs/decisions/records/): DEC-20260507-I, DEC-20260507-J, DEC-20260508-A,
DEC-20260508-D, DEC-20260510-A, DEC-20260511-B, DEC-20260511-C, DEC-20260511-D, DEC-20260511-E,
DEC-20260511-F, DEC-20260513-A, DEC-20260513-B, DEC-20260513-C, DEC-20260513-D, DEC-20260513-E,
DEC-20260515-A, DEC-20260515-B, DEC-20260515-C, DEC-20260517-A, DEC-20260518-A, DEC-20260518-B,
DEC-20260518-C, DEC-20260518-D, DEC-20260518-E, DEC-20260518-F, DEC-20260518-G, DEC-20260812-A,
DEC-20260813-A, DEC-20260815-A, DEC-20260820-A-WEBSITE-HERO, DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN,
DEC-20260820-C-WEBSITE-COMPANY-RESEARCH, DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION,
DEC-20260820-E-WEBSITE-SEARCH-WEB, DEC-20260820-F-WEBSITE-RISK-RESPONSIVE, DEC-20260822-A,
DEC-20260827-A, DEC-20260831-A, DEC-20260901-A, DEC-20260904-A, DEC-20260904-B. None of these are
--notion- or --git- qualified, so item (8) of the checklist does not apply to this partition.

### Method

Set up a detached, read-only worktree at the pinned commit (C:/tmp/strale-closing3-P4), ran
npm ci there. Withdrawal records DEC-20260905-B and DEC-20260905-C were read in full first; only
three of their withdrawn items touch P4 files (DEC-20260510-A's "244 files" count, DEC-20260511-C's
attribution of "CC does not reconcile silently" to the 2026-05-13 cleanup prompt, and DEC-20260515-A's
false claim that commit 34036a0 does not resolve). Per the round's rule these are treated as
already corrected and are not findings against the originals.

For quote fidelity I ran the operator checker, `node scripts/m2-quote-fidelity.mjs --export
<scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --only
<file>` once per file in the partition. Its logic: extract every double-quoted span of 25+
characters from a record's body, normalize both the quote and every candidate source (transliterate
EUR/x/>=/<=/->/..., lowercase, strip all non-alphanumeric characters), and test the quote as an
ordered-segment substring (ellipsis splits it) of the parsed Notion row's own field text, a named
repository file at the pinned commit, another record, or a cited commit/PR message. (Note: the
checker's --export flag wants the raw JSON-in-JSON export file directly, not a pre-filtered
dump_rows.py output — passing the raw file dropped the residual count from 34 to 8 spans across the
partition.) I additionally wrote small helper scripts (kept outside the worktree, never committed
inside it) to check frontmatter/id/filename agreement, the CAUTION banner, the five protected
headings, evidence-path existence (including cross-repo strale-io/strale-frontend@sha:path
resolution against the sibling checkout, and same-repo sha:path references resolved with `git
cat-file -e`), and relation-target existence against docs/decisions/id-collisions.yaml's collided-id
list.

### Checker residuals (8) and classification

1. **DEC-20260508-A line 78** — "a Tier-1 path exists but has a fixed floor," presented as a
   contrast to "no Tier-1 path exists." Not attributed to any named source (no "as X states"
   framing); it is the record's own analytical paraphrase contrasting the amended row's prior
   finding with this row's new one. Checker miss, not a finding.
2. **DEC-20260510-A line 86** — "promote a useful handoff note to tracked," a self-referential
   restatement of the record's own earlier Decision-section language, not attributed to any
   external source. Checker miss, not a finding.
3. **DEC-20260515-C line 96** — "a paid AJPES restPrsInfo contract with redistribution rights, or a
   future EU High-Value-Dataset expansion," attributed to `manifests/slovenian-company-data.yaml`'s
   limitations. The manifest (lines 135-136) actually reads "Reactivation trigger: paid AJPES
   restPrsInfo contract with redistribution rights, or a future EU High-Value-Dataset expansion."
   — no "a" precedes "paid" in the source. **Real finding**: an inserted word in an attributed
   quotation (see Findings #1).
4. **DEC-20260518-B line 55** — "can this country deliver T1/T2/T3", a rhetorical question the
   record uses twice (also at line 44, "can country X deliver T1/T2/T3?") to describe the shape of
   an audit's output, not attributed to any external source. Checker miss, not a finding.
5. **DEC-20260518-D line 43** — "does Strale return this today", the same pattern: the record's own
   illustrative framing of what a customer expects from a boolean flag, not an attributed quotation.
   Checker miss, not a finding.
6. **DEC-20260827-A line 40** — "licensed contract with the Austrian Justizministerium for direct
   Firmenbuch API access", attributed to "the historical DEC-20260427-I-6 record." No repo-native
   file exists for DEC-20260427-I-6 (only DEC-20260427-A/B/H/I exist), but the raw Notion export
   shows this exact phrase inside DEC-20260827-A's own row text (evidence[0], page
   3c967c87082c81be9ebac7982b89a36a), which itself names DEC-20260427-I-6 as the source of the
   reactivation trigger; `docs/research/2026-05-07-at-registry-build-path-verify.md:20`
   independently corroborates the same trigger text attributed to the same id. The quotation is
   faithful to its own row; DEC-20260427-I-6 is a historical Notion decision this candidate set
   never migrated, not a claim that a repo file exists for it. Checker miss, not a finding.
7. **DEC-20260904-A line 180** — the G1 `closes_when` clause quotation, including the bolded
   clause. Verified byte-for-byte (modulo YAML line-wrapping and markdown bold, both non-defects)
   against `docs/project/m2-closure-register.yaml:5124-5126`. Checker miss (weak best-match to a
   different record), not a finding.
8. **DEC-20260904-B line 102** — "where did this id's authority come from", the record's own framing
   of why the qualifier grammar exists, not attributed to any source. Checker miss, not a finding.

### Findings

1. **DEC-20260515-C, line 96 (quote fidelity, minor).** The record quotes
   `manifests/slovenian-company-data.yaml`'s reactivation trigger as "a paid AJPES restPrsInfo
   contract with redistribution rights, or a future EU High-Value-Dataset expansion." The manifest
   (lines 135-136) reads "Reactivation trigger: paid AJPES restPrsInfo contract with redistribution
   rights, or a future EU High-Value-Dataset expansion." — an inserted word ("a") before "paid" that
   is not in the source. Everything else in the same quotation (the ellipsis-elided limitations
   text, the data_source string) is faithful. This is a byte-level defect of the kind prior rounds
   judged minor and not verdict-determining; I judge it the same way here, but it is recorded as a
   finding per the instructions ("a finding is anything false, fabricated, misattributed or
   unverifiable").

No other findings. No fabricated quotations, no misattributions, no false evidence paths, no
unsubstantiated relations, and no null-field mishandling were found in this partition.

### Structural checks (all 41 records)

Frontmatter parses; `record_key` == `id` == filename-minus-`.md` for every record; the CAUTION
banner and all five protected headings (Decision, Context, Rationale, Consequences, Reversal
conditions) are present verbatim, in order, for every record. `status: active` for all records
except `DEC-20260831-A` (`status: superseded`), which is a legitimate status value, not a defect —
it is explicitly named as the `supersedes` target of `DEC-20260901-A`.

### Evidence-path existence

Every non-URL evidence entry resolves: repository-relative paths exist as files at the pinned
commit; `strale-io/strale-frontend@<sha>:<path>` entries (used by the five DEC-20260820-*-WEBSITE-*
records) resolve in the sibling checkout via `git cat-file -e` after `git fetch origin` there (spot
checked directly: `f704cb2:docs/website-redesign/homepage/use-case-risk-verification-v1.7.md`,
`.../foundations/responsive-content-conformance-v1.0.md`, and
`.../round-09-four-world-responsive-review/four-world-conformance-report.md` all resolve); two
same-repo `owner/repo@sha[:path]` entries (`DEC-20260822-A`'s `strale-io/strale@3f7f650f...` and
`DEC-20260901-A`'s `codex/repo-native-operating-model@b2951094...:archive/imports/context-pack/...`)
also resolve via `git cat-file -e` in the main repo. Notion URLs and GitHub PR/commit URLs are
accepted as evidence per the instructions and were spot-checked (PR #131, PR #137, PR #361, PR
#362, commits 9ee19282, 86b04be, 5eeff8ba, ef9f6649, 3f7f650f all resolve in local history).

### Relations

Every relation target in this partition resolves to a formal record file at the pinned commit, and
none is a bare collided id per `docs/decisions/id-collisions.yaml` (checked all relation targets
against the collision-id list). Every relation is substantiated in ordinary prose naming the target
and stating what the relation rests on (DEC-20260511-C affirms DEC-20260420-A by name with an
explanation; DEC-20260518-C amends DEC-20260518-B by name with an explanation; DEC-20260813-A
affirms DEC-20260518-F and interprets DEC-20260428-A, both named in its own Decision section; the
five DEC-20260820-*-WEBSITE-* records name their siblings in prose; DEC-20260812-A/815-A/822-A/901-A
form a chain each link of which names its target and the nature of the amendment). None use the
literal "Relation to `<target>`" heading, which the round's own Consequences note establishes is a
review convention, not a corpus rule.

### Ten code-claim spot checks

1. **DEC-20260507-I, line 61-64** — `docs/company/VOICE.md` has 57 lines, no numbered sections, no
   "Section 1"/"Section 6.5"/first-person/petter@strale.io/hello@strale.io/"1:1" text. Confirmed:
   `wc -l` = 57; grep for all named terms returns zero matches.
2. **DEC-20260508-A, line 86-92** — `manifests/hungarian-company-data.yaml` states `data_source:
   Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries)`, added by commit
   `9ee19282` (8 days after the row); "Openapi case 151296" and `OPENAPI_ENABLED` appear in the
   manifest and `config/env-manifest.yaml`. Confirmed by direct grep and `git log --follow`.
3. **DEC-20260511-C, lines 93-100** — `apps/api/drizzle.config.ts` exists; `drizzle-kit` is a
   devDependency in `apps/api/package.json`; no `db:generate`/`db:migrate`/`db:push` script exists;
   `.github/workflows/ci.yml` runs `npx drizzle-kit push --force`. Confirmed by direct file/grep
   checks.
4. **DEC-20260513-C, lines 58-70** — `apps/api/src/jobs/test-scheduler.ts`'s `slugStaggerMinute`
   header comment and the `findOverdueSuites` comment both cite `DEC-20260513-D`, not
   `DEC-20260513-C`, for the per-suite stagger. Confirmed by grep at lines 231 and 310.
5. **DEC-20260515-A, lines 105-107** — CLAUDE.md's "Current Decisions (August 2026)" paragraph
   states DEC-20260812-A "supersedes DEC-20260502-A (Counterparty Assurance rename/ICP) and
   DEC-20260503-A (dual-domain architecture); the Counterparty Assurance framing is retired as
   primary product". Confirmed verbatim at `CLAUDE.md:302`.
6. **DEC-20260515-C, lines 88-96** — `manifests/slovenian-company-data.yaml`'s `data_source` and
   limitations text confirmed (see Finding #1 for the one word-level defect within this same span).
7. **DEC-20260518-C, lines 57-65** — no `digiteal` executor or manifest exists anywhere in
   `apps/api/src/capabilities/` or `manifests/`; no `sepa-vop` slug exists; PR #131 merged
   2026-05-18 (confirmed via local merge commit `117b3868`, branch
   `feat/evidence-tier-labeling-sweep`, since `gh` was not used).
8. **DEC-20260518-D, lines 71-79** — `apps/api/src/capabilities/danish-company-data.ts:183-184` and
   `apps/api/src/capabilities/uk-company-data.ts:226-227` set `ubo_availability` /
   `ubo_availability_reason` exactly as quoted. Confirmed by direct grep.
9. **DEC-20260513-D, lines 60-71** — `apps/api/src/db/schema.ts`'s `capability_health` table
   (lines 966-983) has only a `state` column (`closed`/`open`/`half_open`), no separate manual-pin
   flag; `POST /v1/admin/reset-circuit-breaker` exists at `apps/api/src/routes/admin.ts:661`.
   Confirmed.
10. **DEC-20260513-E, lines 87-92** — `manifests/croatian-company-data.yaml` and
    `manifests/swiss-company-data.yaml` both price at `price_cents: 5`; commit `86b04be` resolves.
    Confirmed.

Bonus (not one of the ten, checked while reading DEC-20260518-A): "no `evidence_tier` field...
anywhere in code, manifests, or docs/company/claims.yaml" — confirmed zero matches; "`ubo_availability`
is live... for roughly thirty countries" — confirmed 32 executor files reference it.

### Gates run

`node --test scripts/decision-records.test.mjs` — 32/32 pass, including "the repository decision
candidates and merge-base immutability checks pass" (whole-corpus validation, not partition-scoped).
`node --test scripts/m2-closure-register.test.mjs` — 74/74 pass. `npm run context:check` — clean,
zero warnings.

### Unverifiable

Nothing in this partition was left unverifiable. The one item that could not be checked against a
live external service (`gh pr view 131`'s exact merge metadata, since `gh` was not invoked) was
independently confirmed a different way, through the local merge commit and branch name in git
history, so it is reported as verified rather than unverifiable.

### Worktree

C:/tmp/strale-closing3-P4 was created detached at the pinned commit, `npm ci` succeeded there,
nothing was edited or committed inside it, and it was removed with `git worktree remove --force`
after confirming (via PowerShell `Get-ChildItem -Recurse -Force -Attributes ReparsePoint`) that
every reparse point inside it (six `node_modules` junctions) targeted a path inside that same
directory before the leftover directory contents were deleted.

PARTITION VERDICT: PASS

### P5

# Closing review round 3, partition P5

Commit: 4318cbeca3b2f934930df1dedb473702adff33c3
Record count: 34 formal candidate records, all in `docs/decisions/records/`

### Method and script

Setup: detached worktree at the pinned commit (`C:/tmp/strale-closing3-P5`),
`npm ci`, read-only throughout, removed at the end (junction targets under
`node_modules` all pointed inside the worktree itself, confirmed with
PowerShell `Get-ChildItem -Recurse -Force -Attributes ReparsePoint` before
`rm -rf`; the worktree no longer appears in `git worktree list`).

Before checking anything, I read `DEC-20260905-B.md` and `DEC-20260905-C.md`
in full to know which statements in my partition are already withdrawn (not
findings) versus new. Of my 34 records, the following carry a statement
withdrawn by one of those two records, verified word-for-word against the
withdrawal text: `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038`
(item 13 of DEC-20260905-B, both spans), `DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a`
(item 9 of -C), `DEC-20260304-C--notion-31867c87082c810197f9efa520332024` (item 10),
`DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a` (items 11-13),
`DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3` (item 29),
`DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce` (item 31),
`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600` (item 34),
`DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086` (item 35),
`DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f` (items 36-37, and
confirmed the sibling record `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6`
does include the word "data" that item 37 says is dropped only in the other
record). All matched exactly; none of the corrections were themselves wrong.

For structural checks (frontmatter parse, `record_key`/`id`/filename
agreement, CAUTION banner, five protected sections) I wrote a short Python
script that parses each file's frontmatter block with a regex, derives the
expected filename from `record_key`, and greps for the banner text and the
five `## ` section headers. Zero problems across all 34 files.

For the collision-registry and closure-register bindings (item 8 of the
partition checklist, since every one of my 34 records is `--notion-`
qualified) I wrote a Python script using PyYAML: it loads
`docs/decisions/id-collisions.yaml`, indexes every collision record by
`source_page_id`, and checks that each of my 34 page ids has
`disposition: formal_record` and a `record_key` equal to my file's own key. A
second script does the same against `docs/project/m2-closure-register.yaml`'s
`decision_rows`, checking `disposition: formally_migrated` and matching
`record_key`. Both came back clean for all 34.

For Notion-row quotation fidelity I read rows through `dump_rows.py` in
batches (`PAGE:<id>` args) and diffed the record's quoted spans against the
row's `Decision`/`Rationale` fields returned as JSON, plus confirmed which
fields are genuinely `null` (three title-only rows in my partition —
`DEC-20260420-E--notion-...d5a898...`, `DEC-20260420-F--notion-...8df1e8...`,
`DEC-20260420-G--notion-...dcafe3...`, `DEC-20260420-H--notion-...b58b36...` —
all confirmed `Rationale`/`Outcome`/`Source` null, matching each record's own
"title only, no Rationale exported" claim; `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac`'s
Rationale is also confirmed null).

I ran the operator checker:
`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --json <scratchpad>/closing3-fidelity-full.json`
over the whole corpus (233 records, 1042 spans, 933 faithful, 109 residual),
then filtered the JSON output to my 34 files.

### Checker residuals for my partition

Only one residual span in my 34 files:

- `DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md:65`: the quote
  "Part 2, the cross-validation layer, was built as a standalone module
  but... file is itself orphaned: no capability executor under [wired into
  the solution executor]; the cross-validation half is dead code." (source:
  `docs/decisions/records/DEC-20260409-B.md`).
  **Classification: checker miss, not a finding.** Both halves either side
  of the ellipsis are genuine substrings of `DEC-20260409-B.md` (the first
  clause verbatim from its "Part 2" paragraph; "the cross-validation half is
  dead code" verbatim from its later "Net effect" paragraph), and the
  bracketed clause "[wired into the solution executor]" is a marked
  editorial insertion, not a claim of literal contiguous source text — the
  same convention `DEC-20260905-C`'s own Consequences section blesses for
  this exact page id and source pair ("ellipsis-plus-bracket compression of
  `DEC-20260409-B.md`... each side of the ellipsis is a genuine substring
  and the bracket marks an insertion rather than claiming literal source
  text"). One caveat, not a finding against my record: `DEC-20260905-C`
  names this precedent under the key `DEC-20260320-G--notion-34867c87082c81dcafe3dea59cc119b1`,
  which does not exist anywhere in the repository (no `DEC-20260320-G` file
  or id exists); the only record with that page id is
  `DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1`, the one in my
  partition. This looks like a decision-id-prefix typo inside
  `DEC-20260905-C` (320 vs 420), not a defect in my record, and
  `DEC-20260905-C` is outside my partition so I do not correct it here;
  I flag it as an observation for the consolidating reviewer.

### Findings

None. All 34 records pass every check in the partition's checklist:
frontmatter/filename agreement, CAUTION banner and five protected sections,
quotation fidelity (accounting for the two withdrawal records), no
null-field-quoted-as-populated or populated-field-called-null defects,
evidence-path existence (local and cross-repo), relation-target existence
and substantiation, and the collision/closure-register bindings.

### Ten "status on" code-claim spot checks

1. `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038`:
   `apps/api/src/db/schema.ts:678-697` — `failedRequests` table exists with
   comment `// ─── failed_requests (DEC-20260225-P-c5d6) ───`. Confirmed.
2. `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3`:
   `apps/api/src/capabilities/auto-register.ts:1-15` — header comment states
   manifest-driven registration replacing the old filesystem-glob discovery,
   as the record describes. Confirmed.
3. `DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7`:
   `manifests/pep-check.yaml:136` — `transparency_tag: algorithmic`, matching
   the record's claim that production differs from the row's `mixed`/
   `commercial_data` discussion. Confirmed.
4. `DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed`:
   `apps/api/src/db/solution-catalogue.ts:1-10` — header states it was split
   out of `seed-solutions.ts` on 2026-08-16. Confirmed.
5. `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8`:
   `apps/api/src/lib/solution-executor.ts:217-219` — `StepTiming` interface
   with `latencyMs: number`, and a `Date.now() - stepStartMs` computation at
   line 620. Confirmed.
6. `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319`:
   `apps/api/src/lib/solution-executor.ts:76,110` — `parsePath()` and
   `walkPath()` both exported exactly as the record names. Confirmed.
7. `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`:
   `apps/api/src/lib/onboarding-gates.ts:242-259` — `PII_CATEGORY_ENUM` has
   14 entries (the 12 the row named plus `nationality` and
   `political_affiliation`, added 2026-04-30 per inline comment), and
   `apps/api/src/lib/audit-helpers.ts:40` — "SA.2b.d: heuristic
   `detectPersonalData` was removed after migration 0050". Both confirmed
   (this is also the specific claim `DEC-20260905-C` item 34 withdrew as
   overstated — "exactly as this row specifies, unconditionally" — the
   enum's live growth beyond the row's 12 values is real and the record
   text I read still asserts the stronger claim, correctly flagged as
   withdrawn, not re-flagged here).
8. `DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b`:
   `apps/api/src/lib/audit-token.ts` — comments "F-A-007: optional rotation
   fallback", "F-A-006: default token TTL. 90 days...", "F-A-006 + F-A-007:
   verify with expiry check and two-key ring fallback" all present.
   Confirmed.
9. `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef`:
   `apps/api/src/routes/verify.ts:24` — `const MAX_DEPTH = 50;` with the
   "F-A-012: tighter caps than the original 200/50 (30 req/min)" comment at
   line 19. Confirmed.
10. `DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35` (and sibling
    `DEC-20260420-G--...dcafe3...`): `apps/` contains only `api` — no
    `apps/web` directory exists at this commit, matching both records'
    claim that the named "site rebuild"/product framing has not yet
    happened in-repo. Confirmed (`ls apps/` → `api` only).

Also verified as part of general quotation-fidelity checking (not counted
in the ten above but load-bearing): the `docs/company/CHARTER.md` quotes
"AMENDS DEC-20260812-A's escalation contract" and "if they ever diverge,
this file is the text and the other two are pointers to it" (both exact,
`CHARTER.md:5-8`); `docs/programs/README.md`'s "Programs are execution
records, not project truth... Project truth lives in `docs/project/`
(candidate until M4) and `docs/decisions/`" (exact, line 4-6); CLAUDE.md's
DEC-20260813-A bullet naming `DEC-20260420-H` for the social-platform
ToS-prohibition (exact); `DEC-20260427-H.md` and `DEC-20260427-I.md`'s
own quotes attributing the same doctrine to `DEC-20260420-H` (both exact,
matching what my `DEC-20260420-H` records cite them as saying); and several
`strale-io/strale-frontend@04c9fca9` cross-repo quotes (`RecommendationCard.tsx`'s
"Not what you need? Tell me more →", `StatsStrip.tsx`'s stat labels and its
"Cert-audit Y-1+Y-3..." comment, `trust-display.ts`'s
`getTrustDisplayState()` header comment, `types/index.ts`'s
`price_cents`/`component_sum_cents` fields) — all confirmed by direct
`git show <sha>:<path>` reads against the sibling checkout.

### Unverifiable

Nothing in my partition's records asserts a claim I could not check from the
repository, the sibling frontend checkout, or the parsed Notion export. Each
record's own text is explicit about what it could and could not confirm
(e.g. whether the GTM launch outputs shipped outside version control,
whether the ~90-page Notion archive still holds, whether the 42 unaccounted
KYB/Invoice-Verify solution rows are still `is_active` in production) and
does not assert those as facts, so there is nothing further for me to flag
as unverifiable beyond what the records themselves already disclose.

One non-finding observation for the consolidating reviewer: `DEC-20260905-C`'s
Consequences section cites the record key
`DEC-20260320-G--notion-34867c87082c81dcafe3dea59cc119b1` when discussing the
bracket-ellipsis convention; no such id exists in the repository. The
record it is clearly referring to (same page id, same quote, same source)
is `DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1`, in my
partition. This is outside my partition to fix (my job is the 34 records
listed, not `DEC-20260905-C`), but it should be corrected in a future
withdrawal record since a reader relying on the id as given would fail to
find the precedent.

PARTITION VERDICT: PASS

### P6

# Closing-review round 3, partition P6

Commit: 4318cbeca3b2f934930df1dedb473702adff33c3
Record count: 34 (32 candidate records under review, plus DEC-20260905-B and
DEC-20260905-C, the round 1 and round 2/sweep correction records, checked
like any other candidate record per this round's rules).

### Script used

`node scripts/m2-quote-fidelity.mjs --export decisions-export-raw.txt
--frontend strale-frontend --only <file> ...` run once per file across the
partition (excluding DEC-20260905-B/C, whose own bodies quote prior review
output and would produce noise). Logic in one sentence: for every
double-quoted span of 25+ characters in a record's body, normalize both the
span and every candidate source (Notion row field via a pre-parsed export,
a repo file at the pinned commit, or a sibling record) per the stated
convention, then test the span as an ordered substring (ellipsis-split)
of at least one source; anything that matches no source is reported as
residual. I additionally hand-verified frontmatter identity, protected
sections, evidence-file existence, relation-target existence, and at least
ten "status on" code claims by reading the named files directly.

Totals: 33 records (excluding DEC-20260905-B/C), 206 quoted spans checked,
203 faithful, 3 residual.

#### Residual-mismatch list and my classification

1. `DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md`, line 80:
   span "if nothing, say the plan is not tracked". **Checker miss, not a
   finding.** This phrase is not attributed to a Notion row, a repo file,
   or a sibling record — it quotes an instruction given to whoever wrote
   this batch of records (visible in context as "satisfying this batch's
   own instruction to check ..."), which is outside the candidate set the
   checker searches. It is meta-commentary about the reviewing method, not
   a claim requiring source verification under rule 3.

2. `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md`, line 80:
   span "migrated to a direct API or a licensed aggregator", presented as
   "this row's ... cannot be verified ...". **Real finding.** I read the
   Notion row directly (page `34967c87082c81bd8c6bf8e92e901711`): its
   Decision field reads "must be migrated to direct APIs or licensed
   aggregator contracts before launch" and its Rationale field reads
   "Every scraping country must migrate to a direct government-registry
   API or a licensed commercial aggregator before v1 launch." Neither
   contains the quoted phrase: "government-registry" is dropped before
   "API" and "commercial" is dropped before "aggregator," changing a
   specific sourcing requirement into a vaguer one. This is a
   changed/dropped-word misquotation under the stated convention, not
   style. See finding 1 below.

3. `DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md`, line 87:
   span "strip DB-canonical fields from backfill payloads", presented in
   Consequences as "the row's own narrower ... framing". **Real finding
   (minor).** The Notion row's Rationale reads "it strips DB-canonical
   fields from backfill payloads" (page `34867c87082c81a2a12cc95010bf25bf`).
   The record's quotation changes the verb form "strips" to "strip." Under
   the stated convention a changed word is a finding regardless of size;
   the substance (what 4a did) is otherwise accurately described. See
   finding 2 below.

### Findings

1. **File:** `docs/decisions/records/DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md`,
   Consequences section (the "migrated to a direct API or a licensed
   aggregator" sentence).
   **Evidence:** row page `34967c87082c81bd8c6bf8e92e901711`, Decision
   field "must be migrated to direct APIs or licensed aggregator contracts
   before launch"; Rationale field "Every scraping country must migrate to
   a direct government-registry API or a licensed commercial aggregator
   before v1 launch."
   **Nature:** the record's quotation drops "government-registry" and
   "commercial" from the row's actual wording, presenting a narrower,
   looser paraphrase inside quotation marks as if verbatim. This is not
   withdrawn by DEC-20260905-B or -C.

2. **File:** `docs/decisions/records/DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md`,
   Consequences section (the "strip DB-canonical fields from backfill
   payloads" quotation).
   **Evidence:** row page `34867c87082c81a2a12cc95010bf25bf`, Rationale
   field: "it strips DB-canonical fields from backfill payloads."
   **Nature:** the quoted span changes "strips" to "strip." Minor
   (a verb-form change, not a substantive misrepresentation of what 4a
   did), but a changed word under the stated convention. Not withdrawn by
   DEC-20260905-B or -C.

No other findings in this partition. Everything else checked — frontmatter
identity, the CAUTION banner and five protected sections on all 34 records,
evidence-file existence (including the cross-repo `strale-frontend` entries
and the git-commit evidence on `DEC-20260422-A--git-3b256587`), relation
targets (including on DEC-20260905-B and -C themselves), null-field
handling, and the collision-registry / closure-register entries for every
`--notion-` qualified record in this partition — was correct.

One item worth naming explicitly, not a finding: `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md`'s
Consequences section states "eight `HMRC_*` rows" and lists exactly seven
names. `DEC-20260905-B` (item 7) withdraws this exact statement and states
the correct count is seven. I independently verified `config/env-manifest.yaml`
carries exactly seven `HMRC_*` rows matching the named list, so the
correction is right. Per this round's rule (a), this is not a finding
against the original record.

### Code-claim spot checks (ten, file and line)

1. `manifests/estonian-company-data.yaml:57` — `registry_code: "17449106"`
   confirmed (DEC-20260420-I, backfill record).
2. `apps/api/src/lib/audit-helpers.ts:40` — comment confirms
   `detectPersonalData` heuristic removed; `grep -rn detectPersonalData
   apps/api/src` returns only this comment, no live code (DEC-20260420-J).
3. `apps/api/scripts/onboard.ts:147,151,1603` — `--force-override-authority`
   guard, refused in `--batch` mode and non-TTY (DEC-20260420-K, OQ session).
4. `apps/api/src/lib/platform-facts.ts:134-144` — `STALE_VENDORS` list
   contains SurePay, MonitorPay, Movitz, Banfico, iPiD, Bottomline, Yapily
   (DEC-20260420-K, launch-gate record).
5. `apps/api/src/lib/capability-persistence.ts:303` — "OUTSIDE the
   transaction. Design doc §4.3" confirmed (DEC-20260421-A/B, hook
   relocation).
6. `apps/api/src/jobs/onboarding-retry.ts:1-14` — header confirms the
   `hook_failed` marker was write-only until this file built the sweeper
   (DEC-20260421-B).
7. `apps/api/src/lib/x402-gateway.ts:43` — `EUR_USD_RATE` single conversion
   confirmed, no separate USD tier (DEC-20260502-A).
8. `apps/api/src/lib/platform-facts.ts:164,171` and
   `apps/api/scripts/check-platform-facts-drift.ts:30-42` — exact line
   numbers for `getActiveVendorNames`/`getStaleVendorNames` confirmed
   (DEC-20260507-A).
9. `apps/api/src/lib/trust-helpers.ts:367,386` — `manifest_drift` category
   and `guaranteed_field_missing:` classification at the exact cited lines;
   the code comment's attribution to "DEC-20260513-B + DEC-20260513-C" is
   confirmed as a misattribution (those two records cover Swiss and Slovak
   subjects, not this classification) — the record's own correction of the
   code comment is accurate (DEC-20260513-F).
10. `config/env-manifest.yaml:776-778` — `OPENAPI_ENABLED` kill-switch and
    "resale addendum... case 151296" gating language confirmed verbatim
    (DEC-20260507-C).

Also separately confirmed: commit shas `cf33028`, `6dfb47f`, `8f6eff9`
(+483/-44, 4 files), `a070ba0` (+668/-214, 6 files), `bfe763f`, `2f8b17a`,
and the git-qualified record's commit `3b25658736bfed53eec52c8acf2619dacd54d1f5`
(ancestor of HEAD, matches its key prefix and its own evidence[0] URL).

### Structural checks

All 34 records: frontmatter parses; `record_key`/`id`/filename agree
(qualified records reduce to the same id with the qualifier stripped; bare
records equal their id); CAUTION banner present; all five protected
sections (Decision, Context, Rationale, Consequences, Reversal conditions)
present. Every `evidence` entry in this partition resolves to a file that
exists at the pinned commit, a resolvable cross-repo entry (`strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx`,
confirmed twice against two different records), or a Notion URL. Every
relation target in this partition (including all 13 in DEC-20260905-B's
frontmatter and all 32 in DEC-20260905-C's) exists as a record file at the
pinned commit; none targets a bare collided id. For every `--notion-`
qualified record in this partition I confirmed the collision-registry entry
in `docs/decisions/id-collisions.yaml` names the same page id with
`disposition: formal_record` and the same `record_key`, and the
`m2-closure-register.yaml` row for that page id carries
`disposition: formally_migrated` with the same key. The git-qualified
record `DEC-20260422-A--git-3b256587` has no `source_kind`/`source_rows`/
`git_provenance` in its own frontmatter (those live on the register's
`formal_records` entry per the actual validator in
`scripts/m2-closure-register-lib.mjs`, not on the record file itself); the
register row for it correctly carries `source_kind: git-native`,
`source_rows: []`, and `git_provenance` equal to the record's own evidence[0].

Also ran `node --test scripts/decision-records.test.mjs` (32/32 pass,
including the repository-wide immutability check) and `npm run
context:check` (zero warnings) against the pinned commit as additional
corroboration; both are green.

### Unverifiable

- Whether InfoCamere ever responded to the Distributore Ufficiale
  application (DEC-20260505-D), whether HMRC's compliance review concluded
  (DEC-20260505-E), whether the CrimiMail/Datavisie NL paths have
  progressed since 2026-05-12 (DEC-20260512-A), and whether the specific
  mtime-based cross-worktree check or `stop-conditions.md` tripwire still
  runs (DEC-20260508-C, both instances) — all correctly flagged as
  unverifiable inside the records themselves rather than asserted as
  fact, so not findings.
- The DEC-20260420-I doctrine record's account of what the bare,
  unresolved `DEC-20260420-H` id's text actually said is sourced entirely
  from that record's own reading of the two now-qualified sibling
  records; I did not re-derive this independently beyond confirming both
  sibling records exist and are as described.

### PARTITION VERDICT: FAIL

## Gate run

```
M2 closing review round 3 gate run at 4318cbeca3b2f934930df1dedb473702adff33c3, 2026-09-05T15:37:49Z
HEAD=4318cbeca3b2f934930df1dedb473702adff33c3
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (1221.0382ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (405.1213ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (10.3279ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (154.6021ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 133847.1717
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (515.27ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (366.8563ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (195.7921ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (523.8427ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 116348.7494
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
checked 18 archive/receipts/*.json files
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
check-no-committed-secrets: clean (2928 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still 4318cbeca3b2f934930df1dedb473702adff33c3
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Outcome

Round 3 found fresh confirmed defects in P1, P2, P3, and P6, and one
minor byte-level quote-fidelity defect in P4 that P4 itself judged not
verdict-determining (P4 and P5 passed on substance). Every confirmed
defect from this round that the quotation convention counts as a defect,
plus every residual from the operator checker's full run at this commit
that this record's own reconciliation could not locate a faithful source
for, is corrected by `DEC-20260905-D`
(`docs/decisions/records/DEC-20260905-D.md`), which withdraws each false,
fabricated, or misattributed statement from its record without editing
that record, and substantiates the two relation gaps this round raised
(`DEC-20260409-D` to `DEC-20260409-B`, and `DEC-20260428-B` to
`DEC-20260428-A`) rather than withdrawing them. The final closing round
runs at the commit that merges this file and `DEC-20260905-D` into
`main`, and treats a statement withdrawn here, in `DEC-20260905-B`, or in
`DEC-20260905-C` as corrected, and a relation substantiated in
`DEC-20260905-D` as substantiated.

VERDICT: FAIL
