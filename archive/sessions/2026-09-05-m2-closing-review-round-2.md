---
doc_type: m2-closing-review-round
round: 2
commit: c3691079b150c9aecb082af6a9215e7b1d8c7a2b
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

Round 2 of the M2 closing independent review, run after `DEC-20260905-B`
withdrew round 1's thirteen confirmed false or misattributed statements.
Six fresh, read-only reviewers, none the author of any reviewed content,
applied round 1's own method unchanged: each partition set up a detached,
read-only worktree at commit `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`,
checked frontmatter validity, the CAUTION banner, the five protected
sections, every quotation against its parsed Notion row or the named
repository file at the commit, every evidence path, every relation
target, at least ten code claims, and, for the qualified records in P5
and P6, the collision-registry and M2-closure-register bindings. P1
through P4 each took a contiguous slice of bare-keyed records; P5 took
the 34 `--notion-` qualified records belonging to this batch's 18
id-collisions; P6 took the remaining 33 qualified records (32 `--notion-`
plus the one `--git-` qualified record). Below, every heading in each
reproduced partition report and sweep report is demoted by exactly one
level (`##` to `###`, `###` to `####`, `####` to `#####`; a report's own
top-level `#` title is left as-is) so this file keeps one heading
hierarchy throughout; nothing else in any report is edited.

## Partition reports

Each partition report's own headings are demoted by exactly one level
below (`##` to `###`, `###` to `####`, `####` to `#####`); its
top-level `#` title is left as-is under a `### P<n>` wrapper, the same
convention round 1's archive used, extended here by one further level
because round 1's sources never carried a third heading level and
round 2's P5/P6 sources and the sweep's P5 do.

### P1

# Closing review round 2, partition P1

Commit: `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`
Records reviewed: 41 (DEC-20260224-P-a1b2.md through DEC-20260309-H.md, per `closing-P1.txt`)
Reviewer: fresh, read-only, no authorship of any reviewed content, round 2.

### Method

Set up a detached, read-only worktree (`git worktree add --detach C:/tmp/strale-closing2-P1 c3691079b150c9aecb082af6a9215e7b1d8c7a2b`, `npm ci`). Read `docs/decisions/records/DEC-20260905-B.md` (round 1's withdrawal record) first; none of the 13 statements it withdraws belongs to a record in this partition (they are all March-13-and-later records), so DEC-20260905-B does not directly correct anything in P1, and P1's own round-1 review already passed.

Ran three scripts:
1. **Frontmatter/structure/evidence/relations script** (Python + PyYAML): for all 41 files, parsed frontmatter, checked `record_key == id == filename`, checked the CAUTION banner and all five protected sections, resolved every non-URL evidence path against the worktree (cross-repo entries flagged for separate resolution), and checked every `relations[].target` exists as a record key and is not a bare id from `docs/decisions/id-collisions.yaml`. Result: 0 mismatches on record_key/id/filename, banner, or protected sections; 0 relation-target or bare-collision-id problems; 9 cross-repo evidence entries flagged for manual resolution.
2. **Cross-repo evidence resolution**: `git -C strale-frontend fetch origin`, then `git show 04c9fca9:<path>` for all 9 flagged paths (`src/pages/Index.tsx`, `src/components/SolutionsShowcase.tsx`, `src/components/StatsStrip.tsx`, `src/components/Header.tsx`, `src/pages/Methodology.tsx`, `src/App.tsx`, `src/pages/CapabilityDetail.tsx`, `src/pages/SolutionDetail.tsx`, `src/pages/Terms.tsx`). All 9 resolve.
3. **Quote-fidelity script**: pulled all 41 Notion rows in one batch via `dump_rows.py` (rows parsed: 318, selected: 41, matched 1:1 on page id from each record's evidence[0] URL). Extracted every double-quoted, single-line span of 25+ characters from each record's body and tested it as a substring of: the matched Notion row's field values, the record's own cited evidence files' contents (repo files read from the worktree, frontend files via `git show`), any other record's text (for relation quotes), and CLAUDE.md (a common citation target). First pass flagged 23 files with spans it could not place; every one was manually resolved by reading the surrounding paragraph and the source side by side (see residual list below). No script-only pass was trusted without this manual step, per the project's known lesson that a naive quote regex produces false positives across paragraph and line-wrap boundaries.

I additionally re-verified all null/populated-field claims against `dump_rows.py`'s per-row null-field listing (no record in this partition makes an explicit nullness claim beyond the general "Source is null" observation implicit in several records' evidence handling; none was contradicted) and ran 10 code-claim spot checks (below, well past the ten-file minimum, several records carrying more than one verified claim).

### Residual-mismatch list (from the quote script) and judgement

Every flagged span fell into one of these categories. None is a fabrication; several are genuine byte-level quote-fidelity defects worth recording as findings, consistent with this round's mandate to check byte-for-byte and with the precedent DEC-20260905-B itself sets (it withdrew exactly this class of defect — em dash for comma, multiplication sign for "x", case changes — found by round 1's more thorough partitions).

- **Line-wrap false positives (not findings):** `DEC-20260225-P-s5t6` ("x402 Payment Gateway (March 2026)"), `DEC-20260306-G` ("Strale Quality Score — Design Spec."), `DEC-20260306-H` ("One API call. Structured data."), `DEC-20260305-E` (Outcome field quote and the browserless-extract.ts re-export quote's opening clause), `DEC-20260305-F` (Outcome field quote), `DEC-20260303-C` ("rewritten to describe only what the live platform actually does"). In every case the quoted text is a verbatim, uninterrupted substring of the cited source; the script's per-line regex only failed because the record's own prose word-wraps the quotation across a markdown line break. Manually confirmed exact byte match in each case.
- **Nested-code false positive (not a finding):** `DEC-20260226-P-s3t4`'s `transparencyMarker: varchar("transparency_marker", ...)` is inline code syntax using its own internal quotation mark, not an attributed prose quotation; the underlying schema declaration is confirmed accurate directly (see spot checks).
- **Interpretive gloss in scare-quotes (not a finding):** `DEC-20260227-P-i9j0`'s "the capability's own provider runs the code" is explicitly framed as "the row's original meaning of," i.e. the reviewer's own paraphrase of the row's "provider-hosted execution" concept, not a claim that this exact string appears in the row.
- **Real byte-level quote-fidelity defects (findings, all minor, none changing a record's substantive conclusion):** see Findings below, items 1-9.
- **Genuine misattribution (finding, more than style):** items 10-11 below, both citing MEMORY.md content as if it were in CLAUDE.md.
- **Evidence-list completeness gaps (findings, same class as round 1's minor finding on P1):** item 12 below.

### Findings

A finding is anything false, fabricated, misattributed, or unverifiable. Style is not a finding, but a quotation that does not match its cited source byte for byte is not style — it is exactly what this round's check (3) asks to be verified, so each is recorded even where minor.

1. `DEC-20260224-P-g7h8.md:65` quotes README.md as "Get a key and trial credits at strale.dev" (plain text). README.md's actual line 87 reads "Get a key and trial credits at [strale.dev](https://strale.dev) when" — the quoted span strips the markdown link syntax around `strale.dev`, so it is not a literal substring of the file. Minor; the underlying fact (a public signup CTA naming strale.dev) is accurate.
2. `DEC-20260225-P-k3l4.md:45,81` quotes the row's Rationale as "honest about coverage, ambitious about trajectory." (lowercase h) and the row's Decision as "brand, API, SDK, docs are global from day one" (lowercase b); the actual Rationale reads "Honest about coverage, ambitious about trajectory." and the actual Decision reads "Brand, API, SDK, docs are global from day one." Case-only mismatches, made to fit the quotes mid-sentence.
3. `DEC-20260225-P-m1n2.md:86` quotes CLAUDE.md as "no signup or API key needed — payment IS the auth," (lowercase "no", trailing comma). CLAUDE.md:309 reads "No signup or API key needed — payment IS the auth." (capital "No", trailing period). Case and terminal-punctuation mismatch.
4. `DEC-20260225-P-m5n6.md:66` quotes `manifests/swedish-company-data.yaml:20` as "Swedish organisationsnummer (10 digits, e.g. 556703-7485)." (with a trailing period); the manifest line has no trailing period. Added punctuation.
5. `DEC-20260225-P-o7p8.md:59-65` quotes the manifest header as "Auto-generated from database on 2026-03-17," (trailing comma added; the file's actual comment has no trailing punctuation) and quotes the row's Decision field as "query active government contracts by keyword." (lowercase "query"; actual Decision field reads "Query active government contracts by keyword, return structured results." — the record also silently truncates the sentence and swaps the comma for a period).
6. `DEC-20260225-P-u7v8.md:67` quotes CLAUDE.md as "TypeScript SDK ships before Python SDK," (trailing comma added); CLAUDE.md:269 has no trailing punctuation on that bullet.
7. `DEC-20260225-P-w9x0.md:90` quotes `DEC-20260405-A.md`'s Consequences as "was completed, not deferred," (trailing comma); the source (`DEC-20260405-A.md:96`) reads "...was completed, not deferred." with a period. Terminal-punctuation mismatch.
8. `DEC-20260225-P-y1z2.md:83,87` quotes CLAUDE.md as "DEC-11: Rating endpoint removed from MVP (unanimous)." and "DEC-8: SELECT FOR UPDATE row-level locking on wallet debits (unanimous)." (both with an added trailing period); CLAUDE.md:257 and :254 carry neither bullet with a trailing period.
9. `DEC-20260227-P-a1b2.md:48` quotes the row's own Rationale as "the original Provider Growth doc," (with "the" prepended, lowercase "o", trailing comma added); the actual Rationale field begins "Original Provider Growth doc assumed 5 seed capabilities..." with no leading "the" and no trailing comma at that point in the sentence.
9b. `DEC-20260302-A-0001.md:78` quotes `docs/company/CHARTER.md` as "pricing experiments within the existing EUR 0.02 to EUR 1.00 band"; CHARTER.md:40 reads "pricing experiments within the existing €0.02–€1.00 band" — the euro sign and en-dash are transliterated to "EUR" and "to", the identical substitution class DEC-20260905-B withdrew for a different record (`DEC-20260506-G`) quoting the same file. This instance is not covered by DEC-20260905-B and remains uncorrected. (The record's second quote in the same sentence, "pricing outside the existing band," is a case-only variant of CHARTER.md:55's "**Pricing outside the existing band, and anything a regulator would read as" and is not a further finding beyond the case mismatch already covered by the pattern in items 2-3 and 6-8.)
9c. `DEC-20260306-D.md:36` quotes the row's Rationale as "Success Rate" vs. "Test Pass Rate" naming confusion; renamed to "Test Pass Rate"" (double quotes, "vs.", the word "naming" inserted, "renamed" in place of "rename"). The actual Rationale field reads: "(3) 'Success Rate' vs 'Test Pass Rate' confusion — rename to 'Test Pass Rate' sourced from test data." (single quotes, no period after "vs", no "naming", present-tense "rename", em dash not semicolon). This is more than a punctuation swap — a word ("naming") is inserted and the verb tense changes — though the substantive claim (the rename happened) is not disputed.
10. `DEC-20260226-P-q1r2.md:65-66` states "CLAUDE.md's Tech Stack section states 'Production: https://strale-production.up.railway.app (= api.strale.io).'" This exact sentence does not appear anywhere in CLAUDE.md (confirmed: zero matches for "strale-production.up.railway.app" in CLAUDE.md at this commit). It appears only in the user's MEMORY.md file (a separate, non-repository local memory file, not part of the M2 candidate set), whose own "Tech Stack" section carries this exact line. The record misattributes MEMORY.md content to CLAUDE.md, and MEMORY.md is not listed in the record's evidence array at all.
11. `DEC-20260227-P-u1v2.md:80` states "CLAUDE.md's 'Distribution packages & protocol endpoints' area (per its 'Feedback' memory entries) documents SDKs and framework plugins as shipped." The phrase "Distribution packages & protocol endpoints" does not appear anywhere in CLAUDE.md (confirmed: zero matches at this commit); it is a bullet heading in MEMORY.md's Feedback section. The same CLAUDE.md/MEMORY.md conflation as item 10, in a different record.
12. `DEC-20260227-P-q7r8.md` quotes `apps/api/src/web3-assurance/evaluators/erc-8004-reputation.ts`'s header comment ("trustless agent reputation reader", confirmed accurate at line 2) and CLAUDE.md's x402 paragraph, but its evidence array lists only the Notion URL, `docs/decisions/records/DEC-20260227-P-s9t0.md`, and `apps/api/src/lib/x402-gateway.ts` — neither the erc-8004-reputation.ts file nor CLAUDE.md is listed. Same evidence-list-completeness class round 1 flagged as minor on three other P1 records (CLAUDE.md's DEC-20260812-A bullet); the quotations themselves are accurate.

No finding of a fabricated quotation, a false behavioral or "status on" claim, a missing protected section, a missing CAUTION banner, a broken evidence path, a bad relation target, or a bare-collided-id relation was found across any of the 41 records.

### Ten code-claim spot checks (file, line, result)

1. `DEC-20260224-P-g7h8` — `docs/company/coinbase-bazaar-email.md:4` reads "We run Strale (api.strale.io), an x402 seller on Base mainnet settling through" and `:15` reads "Moonlighter AB (Strale) — petter@strale.io". **Confirmed true.**
2. `DEC-20260225-P-a3b4` — `manifests/vat-validate.yaml:26` `price_cents: 2`; `manifests/invoice-extract.yaml:12` `price_cents: 50`; `manifests/screenshot-url.yaml:10` `price_cents: 5` (screenshot-url still exists on `main` despite CLAUDE.md's DEC-12 saying it was dropped). **Confirmed true.**
3. `DEC-20260225-P-e7f8` — `packages/langchain/src/index.ts:16` `export class StraleFallbackTool extends Tool`. **Confirmed true.**
4. `DEC-20260225-P-m5n6` — `manifests/swedish-company-data.yaml:15` lists `required:` with `org_number` as the sole field; grep of `apps/api/src/capabilities/swedish-company-data.ts` for model/anthropic/llm/fuzzy returned no matches. **Confirmed true** (no LLM/fuzzy-input code path).
5. `DEC-20260225-P-q3r4` — `apps/api/src/lib/auth.ts:3,6,18,20` confirms `sk_live_` + 32 hex char API keys with a 16-char prefix for lookup; `apps/api/src/lib/production-authority.ts:28-34,113` confirm ed25519 keypairs for founder-grant signatures, not agent identity. **Confirmed true.**
6. `DEC-20260226-P-s3t4` — `apps/api/src/db/schema.ts:355-359` declares `auditTrail: jsonb("audit_trail")`, `transparencyMarker: varchar("transparency_marker", ...)`, `dataJurisdiction: varchar("data_jurisdiction", ...)`. **Confirmed true.**
7. `DEC-20260227-P-i9j0` — `apps/api/src/capabilities/auto-register.ts:411` performs `await import(\`./${slug}.js\`)`. **Confirmed true.**
8. `DEC-20260305-G` / `DEC-20260306-D` — `apps/api/src/routes/public-trust.ts:34-39` defines `PUBLIC_TRUST_FIELDS` as exactly `badge`, `badge_label`, `tested`, `last_tested_at`, `pass_rate`. **Confirmed true.**
9. `DEC-20260306-G` — grep of `apps/api/src/routes/` for `quality/:slug` or `v1/quality` returned zero matches. **Confirmed true.**
10. `DEC-20260309-H` — none of the eight named finance-capability slugs (`dcf-estimate`, `altman-z-score`, `recession-probability`, `analyst-ratings`, `retirement-projection`, `portfolio-risk`, `credit-ratios`, `country-risk-profile`) exists under `manifests/`; separately, `strale-io/strale-frontend@04c9fca9:src/pages/Terms.tsx:216` has the "8. Warranty and liability" section heading and `src/App.tsx:81` routes `/terms`. **Confirmed true** on all counts.

### Unverifiable

Nothing in this partition was left unverifiable. Every frontmatter field, evidence path (including all 9 cross-repo entries), relation target, quoted span, and sampled code claim across all 41 records was checked against the pinned commit (or, for cross-repo evidence, commit `04c9fca9` in `strale-io/strale-frontend`) and resolved to a definite result.

### Partition verdict rationale

Twelve findings, all quote-fidelity or evidence-completeness defects, none rising to a false behavioral claim, a fabricated finding, or a substantive misattribution that changes any record's conclusion. Items 10 and 11 (CLAUDE.md/MEMORY.md conflation) are the most serious in this partition — they cite a specific document by name for text that document does not contain — but the underlying facts they support (the production host name; that SDKs and framework plugins shipped) are independently true and separately confirmed elsewhere in the same records and in this review's own spot checks; the defect is in the citation, not in the claim. This partition contains nothing resembling round 1 P2/P3/P4's substantive failures (a false behavioral claim built on an unchecked comment, or a fabricated quotation manufacturing a finding). Per this round's own precedent (DEC-20260905-B correcting exactly this class of byte-level defect without treating the correction as a partition failure), I judge these findings as real but not verdict-determining.

PARTITION VERDICT: PASS

### P2

# Closing review round 2, partition P2

Commit: c3691079b150c9aecb082af6a9215e7b1d8c7a2b
Record count: 41

### Method

A Python script parsed each record's frontmatter (record_key, id, evidence,
relations) and body, extracted every double-quoted span of 25+ characters
that does not itself contain a newline (single-line quotes, the reliable
signal for a genuine attributed quotation; multi-line captures were mostly
regex artifacts from unrelated quote marks and were reviewed by eye instead),
and tested each span, with internal newlines flattened to spaces to allow for
markdown soft-wrap, as a substring of: the parsed Notion row (all 41 rows
fetched via dump_rows.py, one page id per record from evidence[0]), every
local evidence file at this commit, and every other record file. Evidence
paths were checked to exist as files at this commit (cross-repo
strale-io/strale-frontend@04c9fca9 entries resolved against the sibling
checkout after `git fetch origin`). Relation targets were checked to exist
as record-key files and checked against docs/decisions/id-collisions.yaml's
35 collided bare ids. Frontmatter parsing (record_key/id/filename agreement,
the five protected sections, the CAUTION banner) was scripted across all 41
files with zero problems flagged.

Of 54 single-line candidate quotes, 17 were residual mismatches after the
newline-flattening pass. I read every one by hand:

- 8 were script artifacts, not real issues: nested-quote regex captures that
  grabbed the text between two unrelated quoted words (DEC-20260313-E,
  DEC-20260406-E), grep command arguments quoted as shell syntax rather than
  attributed source text (DEC-20260314-F x2, DEC-20260321-A x2), a
  capitalisation-only difference in an otherwise-verbatim match
  (DEC-20260320-A "the previous filesystem-glob discovery"), a trailing
  sentence-final period added inside the quote marks by the citing sentence
  (DEC-20260310-F "structurally valid validation rules."), and a trailing
  comma likewise added for sentence flow (DEC-20260320-E "when approaching
  production volume,"). None of these are findings; the quoted substance is
  accurate in each case, verified by direct comparison against the row field
  or file (DEC-20260320-A: `apps/api/src/capabilities/auto-register.ts:19`;
  DEC-20260320-E: row Outcome field).
- DEC-20260314-B's two ellipsis-marked ("Dev.to #1... '...'") citations of
  `archive/growth-ops/tweets-v2.md` are explicit paraphrases (marked with
  "..." and read in context as "consistent with... draft-stage... content
  existing", not a verbatim-quotation claim) — not a finding.
- DEC-20260317-F's two occurrences ("automated >= 50 qualification gate" /
  "automated >= 50 gate") and DEC-20260411-B's "Gate 5 multi-path fixture
  coverage, DEC-20260411-B" (verified to match `onboard.ts:550-551` across a
  line-wrapped comment) — the latter is not a finding; the former two are
  (finding 2 below).
- The remaining 6 are genuine findings, listed below.

For at least ten records I additionally read the cited file directly to
verify one "status on" code claim each (listed below), independent of the
quote-matching script.

### Findings

1. **DEC-20260316-A.md, line 87.** Quotes "worst of SQS, freshness, latency"
   as if verbatim. The row's Rationale field (page
   `32567c87082c819da00ffeb660efa605`) reads: "The Combined Trust Grade
   (worst-of SQS + freshness + latency) creates a competing letter...".
   The source uses a hyphenated "worst-of" and joins the three terms with
   "+" signs; the record substitutes a space and commas. Substance
   unaffected, wording fabricated.

2. **DEC-20260317-F.md, lines 43 and 51.** Both quote "automated >= 50
   qualification gate" / "automated >= 50 gate" as if verbatim from the
   row. The row's Decision field (page `32667c87082c81f7b363e6ea7af6e12b`)
   reads: "Publication SQS threshold: ≥60 (higher than automated ≥50
   qualification gate)" — the source uses the "≥" character directly
   against the digit with no space; the record substitutes ASCII ">= "
   with a space, twice in the same record.

3. **DEC-20260320-A.md, line 78.** Quotes "manual, 312-line \`app.ts\`
   import list" and attributes it to "this row's Rationale." The row's
   Rationale field (page `32967c87082c81ea9912da343ea09960`) contains
   "manual app.ts import list" in one sentence and "312-line manual import
   list" in a different sentence later on; it never contains the combined
   phrase as a single string. The quotation is a synthesised composite of
   two separate fragments, not something the row actually says.

4. **DEC-20260323-A.md, line 69.** Quotes "read-time decay eliminated,
   write-time decay in force" and attributes it explicitly ("as the row
   states"). Neither the row's Decision field ("All trust data served from
   DB columns. Write-time decay only. One score everywhere...") nor its
   Rationale field (page `32c67c87082c81719ea5f67617482c43`) contains this
   phrase anywhere; it does not appear in the row at all. Fabricated
   quotation misattributed to the row.

5. **DEC-20260323-A.md, line 86.** Quotes "rename \`capability_health\` ->
   \`source_health\`" attributed to CLAUDE.md. CLAUDE.md line 324 reads
   "...and rename \`capability_health\` → \`source_health\`", using the
   unicode arrow character; the record substitutes ASCII "->".

6. **DEC-20260315-H.md, line 74.** Quotes "Quality floor ... armed in
   prod" and attributes it to "CLAUDE.md". CLAUDE.md contains the
   substance ("quality floor quarantine <70% / deactivate <30% on ≥10 real
   calls/30d, auto-promote on recovery", line 302) but never the phrase
   "armed in prod" anywhere in the file — that phrase exists only outside
   this repository (the operator's own memory notes). The citation to
   CLAUDE.md for this specific quoted fragment is false.

7. **DEC-20260317-A.md, lines 65-67.** Quotes "Send the weekly digest (or
   any platform health email) via Resend." and attributes it to
   `apps/api/src/lib/digest-sender.ts`'s "own header comment." The text is
   accurate but it is not the file's header comment — the file's actual
   header (lines 1-5) reads "Digest Email Sender — HM-2 / Sends the
   compiled HTML digest via Resend. / Requires: RESEND_API_KEY and
   HEALTH_DIGEST_EMAIL env vars." The quoted sentence is the docstring of
   the `sendDigestEmail` function at line 23, a different comment.
   (Round 1 found this identical error class in DEC-20260315-I, corrected
   by DEC-20260905-B item 4; the same mistake recurs uncorrected here on a
   different record.)

8. **DEC-20260317-A.md, lines 84-86.** States: "A later, unmigrated row,
   DEC-20260511-F (\`Status: active\`, prose only, not a formal record and
   not part of this batch)...". This is false at this commit: a formal
   candidate record file exists at
   `docs/decisions/records/DEC-20260511-F.md` in this same repository
   (title "Daily digest pipeline silent rot — investigation + restoration",
   `record_key: DEC-20260511-F`). It is not "prose only" and is a formal
   record, contradicting the claim. (It falls in the May partition, P4,
   not this one, but its existence as a file is directly checkable from
   this partition's worktree and the claim about it is false regardless of
   which partition reviews its own content.)

9. **DEC-20260317-A.md, line 89.** Quotes "(apps/api/src/jobs/daily-digest.ts
   -> Resend -> petter@strale.io)" from DEC-20260511-F.md, using ASCII "->".
   DEC-20260511-F.md's own Context section (line 37) reads
   "(apps/api/src/jobs/daily-digest.ts → Resend → petter@strale.io)" with
   the unicode arrow. Same character-substitution pattern as findings 2 and
   5.

10. **DEC-20260409-D.md, frontmatter lines 10-15 (relations).** Declares
    two `related_to` relations, to `DEC-20260409-A` and `DEC-20260409-B`.
    Neither target id appears anywhere in the record's body (Decision,
    Context, Rationale, Consequences, or Reversal conditions) — no
    sentence names either target or states what the relation rests on.
    This fails item 6 of the review checklist: a declared relation must be
    "substantiated in the body (prose that names the target and states
    what the relation rests on)." Both targets exist as record-key files
    and neither is a bare collided id, so this is a substantiation gap,
    not a broken or fabricated relation.

Findings 1, 2, 5, 6, 9 are all instances of the same recurring pattern this
whole review effort keeps finding: a quotation altered by a symbol
substitution (hyphen/plus for a Unicode arrow or the ≥ sign, ASCII "->" for
"→") that a hand-retyped quote introduces and a byte-level script catches.
Findings 3 and 4 are more serious: quotations that do not exist anywhere in
their claimed source at all, one a stitched composite of two separate
sentences (3), one with no textual basis in the row whatsoever (4). Findings
7 and 8 are the "a comment is not evidence, check the callers" lesson
recurring on a record round 1 and DEC-20260905-B did not touch, and a
verifiably false claim about another record's migration status.

### Ten code-claim spot checks (of many performed)

1. DEC-20260313-C.md ~line 78 — `apps/api/src/routes/public-trust.ts:57`
   declares `pass_rate: number | null`. Confirmed.
2. DEC-20260315-H.md line 70-74 — `apps/api/src/lib/quality-floor.ts:84-85`
   (`quarantineBelow: 0.7`, `deactivateBelow: 0.3`) matches the row's
   quarantine-below-70%/deactivate-below-30% claim. Confirmed (the
   "armed in prod" attribution is finding 6 above).
3. DEC-20260316-A.md line 60-66 — `apps/api/src/lib/trust-grade.ts:214`
   defines `computeTrustGrade`; `grep -rn "computeTrustGrade" apps/api/src`
   finds only its own definition, zero external callers. Confirmed.
4. DEC-20260317-A.md line 76-78 — `grep -rn "sendInterruptEmail"
   apps/api/src --include=*.ts` returns only
   `apps/api/src/lib/interrupt-sender.ts:172` (the definition). Confirmed
   zero callers.
5. DEC-20260320-A.md line 74-75 —
   `apps/api/src/capabilities/auto-register.ts:19` reads "The previous
   filesystem-glob discovery pulled in test files". Confirmed.
6. DEC-20260323-A.md line 78-84 — `apps/api/src/db/schema.ts` still
   declares `capability_health` (grep confirms the table exists) and
   CLAUDE.md line 324 confirms the pending rename. Confirmed.
7. DEC-20260324-A.md lines 61-71 — `apps/api/src/lib/x402-gateway.ts:21`
   imports `createFacilitatorConfig` from `@coinbase/x402`;
   `config/env-manifest.yaml:283-284` documents `CDP_API_KEY_ID` with the
   exact quoted purpose string. Confirmed.
8. DEC-20260405-A.md lines 95-105 —
   `apps/api/src/capabilities/swedish-company-data.ts:5-8` matches the
   quoted API base URL and "DEC-20260405-A Phase 2" comment;
   `manifests/swedish-company-data.yaml:106` matches the quoted
   `data_source` string; commit `cb787ed9` is dated 2026-04-22 on `main`
   per `git show -s --format=%ci`. Confirmed, including the 13-day gap
   claim against the row's "PARKED 2026-04-09" note.
9. DEC-20260315-I.md line 83 — `apps/api/src/lib/x402-gateway.ts:391`
   reads "WP4 removed \`verifyX402Payment\`, a combined verify-and-settle
   helper." Confirmed.
10. DEC-20260318-A.md lines 60-76 — `git ls-files apps/api` finds no
    `seed.ts`; CLAUDE.md line 334 matches the quoted PR #79 deletion
    sentence exactly; `apps/api/scripts/onboard.ts` recognizes all the
    named flags (`--dry-run`, `--backfill`, `--force-override-authority`,
    etc.) at the cited lines. Confirmed.
11. DEC-20260409-B.md lines 73-90 —
    `apps/api/src/lib/solution-executor.ts:438-441,673-674` matches the
    quoted "Context propagation" comment and the `registration_number`/
    `jurisdiction` extraction; `apps/api/src/lib/entity-validation.ts:3`
    reads "DEC-20260409-B Phase 1."; `grep -rln validateCompanyResult
    apps/api/src` finds exactly the two files the record names plus
    northdata.ts. Confirmed.
12. DEC-20260411-B.md lines 67-74 —
    `apps/api/src/lib/gate5-path-coverage.ts:1-14` matches the quoted
    PRIMARY/SECONDARY docstring verbatim; `apps/api/scripts/onboard.ts:550`
    matches the quoted comment across its line wrap. Confirmed.

### Unverifiable

Nothing in this partition's evidence set was unreachable: all 41 Notion
pages returned rows via dump_rows.py, all local evidence files exist at
this commit, and the four cross-repo entries (all pointing at
`strale-io/strale-frontend@04c9fca9`) resolved after `git fetch origin`.
DEC-20260405-A's own text already flags several items it could not itself
verify (a `DEC-20260405-B` id not in `id-collisions.yaml`, the specific
Sweden-revival trigger's timing) — these are the record's own honest
unverifiable notes, not gaps in this review's coverage, and are not
counted as findings against it.

### Relations and collisions (all 41 records)

Six declared relations found in this partition:
DEC-20260314-A→DEC-20260314-B, DEC-20260314-B→DEC-20260314-A,
DEC-20260405-A→DEC-20260320-B, DEC-20260409-B→DEC-20260409-A,
DEC-20260409-D→DEC-20260409-A and →DEC-20260409-B,
DEC-20260411-A→DEC-20260302-A-0001. All six targets exist as record-key
files at this commit; none is a bare collided id from
`docs/decisions/id-collisions.yaml`'s 35-entry list. Five of the six are
substantiated in ordinary body prose naming the target and what the
relation rests on (checked by reading each); the sixth
(DEC-20260409-D's two relations) is not — see finding 10.

No record in this partition uses a `--notion-` or `--git-` qualified
filename, so checklist item 8 (registry/register cross-check for
qualified records) does not apply to any file in P2.

### PARTITION VERDICT: FAIL

### P3

# Closing-review round 2, partition P3

Commit: c3691079b150c9aecb082af6a9215e7b1d8c7a2b
Records reviewed: 39 (DEC-20260413-A through DEC-20260507-H, per closing-P3.txt)

### Method

Worktree checked out detached at the pinned commit, `npm ci` run there, never edited.
A Python script parsed frontmatter (PyYAML) for all 39 files and checked
`record_key`/`id`/filename agreement, the CAUTION banner, and presence of the
five protected sections. A second script extracted every double-quoted span of
25+ characters from each record and tested it as a substring (whitespace-normalized)
against: the record's own primary Notion row (dumped via `dump_rows.py` for all
40 relevant page ids, including secondary evidence pages), CLAUDE.md, and, where
the surrounding prose named a repository file, that file directly via `grep`.
Evidence-path existence was checked against the working tree for every non-URL
entry. Relations were checked against the set of record-key filenames on disk and
against `docs/decisions/id-collisions.yaml`'s collided-id list. Ten records were
spot-checked against live source files for their "status verified" code claims.
Git commit SHAs cited in records were checked with `git cat-file -e`.

Residual-mismatch list from the automated substring pass, after manual triage:
most flagged items were either short-quote search terms (the record's own
invented search strings, not source citations), the "Relation to" convention
gap already excused by DEC-20260905-B's Consequences section, or legitimate
elisions using an explicit `...` ellipsis (verified both flanking fragments
match the source). The residual genuine mismatches are listed as findings 1-11
below: a repeated pattern of closing a mid-sentence quotation with punctuation
(a period or comma) that does not match the source's actual character at that
position, instead of the source's real continuation (an open parenthesis, an
em dash, or no punctuation at all), with no ellipsis marker to signal the
truncation.

DEC-20260905-B was read in full. Two of its thirteen withdrawn statements
belong to this partition (item 3, DEC-20260419-A; item 12, DEC-20260425-A).
Both corrections were independently re-verified against the parsed Notion row
and the named source file and found accurate (see "Withdrawn-statement
corrections" below); per the round-2 rule they are not findings against the
original records.

### Findings

1. **DEC-20260413-A.md:61-62** quotes CLAUDE.md as reading `"290+ capabilities
   across 7 verticals (company-data, compliance, developer-tools, finance,
   data-processing, web-scraping, monitoring)."` with a closing period. CLAUDE.md
   line 306 reads `...monitoring) plus 100+ bundled solutions across 6
   categories...` — there is no period after `monitoring)`; the quotation
   truncates the sentence and invents a full stop that is not in the source.

2. **DEC-20260422-H.md:74-75** quotes CLAUDE.md as reading `"retired as primary
   product,"` with a closing comma. CLAUDE.md line 302 reads `...is retired as
   primary product — compliance is a separate track gated on customer
   discovery.` — the source has an em dash at that point, not a comma. (The
   adjoining quoted fragment, `"a separate track gated on customer
   discovery."`, is an exact match and is not a finding.)

3. **DEC-20260425-A.md:181** quotes `apps/api/src/lib/provenance-builder.ts`
   as reading `"'US' if the call invokes a US-hosted model provider,"` with a
   closing comma. The file's line 244 reads `"US" if the call invokes a
   US-hosted model provider (Anthropic via` — the source continues with an
   open parenthesis, not a comma, at that point.

4. **DEC-20260503-B.md:103-104** quotes `apps/api/src/jobs/test-scheduler.ts`
   as reading `"Daily SQS snapshot retired with the SQS engine
   (DEC-20260503-B),"` with a closing comma. The file's line 659 reads `//
   Daily SQS snapshot retired with the SQS engine (DEC-20260503-B).` — the
   source ends that comment with a period, not a comma.

5. **DEC-20260505-A.md:73-74** quotes `handoff/README.md` as reading `"...Do
   not edit by hand,"` with a closing comma. The file's line 4 reads `... Do
   not edit by hand.` — the source ends with a period, not a comma. (The
   earlier elided portion of the same quotation, using `...`, is legitimate:
   both flanking fragments match the source.)

6. **DEC-20260505-B.md:45-46** quotes the row's Rationale field as reading
   `"Implements DEC-20260503-B (SQS public-score retirement),"` with a closing
   comma. The parsed Rationale field reads `Implements DEC-20260503-B (SQS
   public-score retirement). Post-deploy state: ...` — the source ends that
   sentence with a period, not a comma.

7. **DEC-20260505-C.md:44** quotes the same row-family Rationale field the same
   way: `"Implements DEC-20260503-B (SQS public-score retirement),"` with a
   closing comma, against a source Rationale field reading `Implements
   DEC-20260503-B (SQS public-score retirement).` with a period. Same defect
   as finding 6, independently in a second record quoting its own row.

8. **DEC-20260507-E.md:79-80** quotes `docs/decisions/records/DEC-20260508-D.md`
   as reading `"resolves the gating condition from DEC-20260505-H,"` with a
   closing comma. That record's line 44 reads `"resolves the gating condition
   from DEC-20260505-H ('defer Pro commitment until audit-retention terms
   confirmed in writing')."` — the source continues with an open parenthesis
   at that point, not a comma.

9. **DEC-20260505-H.md:92-93** quotes the same sentence in
   `DEC-20260508-D.md` differently: `"resolves the gating condition from
   \`DEC-20260505-H\`."` with a closing period at the same truncation point,
   against the same source that continues `('defer Pro commitment...)`. Two
   different records (this one and finding 8) truncate the identical source
   sentence at the identical point and each invents a different punctuation
   mark to close the quotation.

10. **DEC-20260507-G.md:85-88** contains three punctuation defects in one
    passage quoting `manifests/bulgarian-company-data.yaml` (and the
    identical text in the Hungary/Luxembourg manifests) and
    `config/env-manifest.yaml`: (a) `"Gated behind \`OPENAPI_ENABLED\` flag
    pending resale addendum countersignature,"` — the manifest's `title`
    field (`manifests/bulgarian-company-data.yaml:96`) has no trailing
    punctuation at all; a comma is invented. (b) `"Openapi case 151296,"` —
    the manifest's `text` field (line 98) continues `Openapi case 151296
    (2026-05-08) to be`, an open parenthesis, not a comma. (c) `"MUST stay
    'false' in production until the resale addendum is countersigned."` —
    `config/env-manifest.yaml:778`'s `purpose` field reads `...is
    countersigned — a legal-compliance gate, not a feature flag.`, an em dash,
    not a period.

11. **DEC-20260507-H.md:76-81** quotes the identical three source spans as
    finding 10 (same manifests, same env-manifest row), with the identical
    three punctuation defects: invented comma after "countersignature", invented
    comma after "151296" (source has an open parenthesis), and invented period
    after "countersigned" (source has an em dash). Same defects as finding 10,
    independently in a second record.

These eleven items are all instances of one pattern: a mid-sentence
truncation closed with punctuation not present in the source at that point,
with no ellipsis to mark the elision, in contrast to several places elsewhere
in this same partition (e.g. `DEC-20260427-H.md`'s five DEACTIVATED-map
quotations, `DEC-20260425-A.md`'s "keeps its current F-AUDIT-02 Contain
behaviour... read from RAILWAY_REPLICA_REGION" quotation) where an explicit
`...` correctly marks an elision and both flanking fragments verify exactly.
The pattern recurs across at least 8 of the 39 records in this partition and
is the same defect class DEC-20260905-B itself was created to correct
(compare its items 9-13), but these eleven instances are not among the
thirteen statements DEC-20260905-B withdraws.

### Withdrawn-statement corrections re-verified (DEC-20260905-B)

- **Item 3 (DEC-20260419-A)**: confirmed. `DEC-20260419-A.md:65-66` contains
  the sentence "Any new file added to the allowlist requires a justification
  comment" in its own `## Decision` section, re-quoted at `:106-107` and
  misattributed there to `apps/api/scripts/check-no-new-console.mjs`'s header
  comment. The actual header comment (`check-no-new-console.mjs:12`) reads "a
  new `console.*` is introduced to a file not in the allowlist" — a different
  fail condition, no "justification comment" language. The phrase is,
  however, present verbatim in the row's own parsed Rationale field. DEC-20260905-B's
  correction is accurate.
- **Item 12 (DEC-20260425-A)**: confirmed. `DEC-20260425-A.md:177-180`
  attributes "sourced from a manifest-declared field per capability,
  replacing the current getProcessingJurisdictions heuristic based on
  capabilityType and transparencyTag" to "this row's Decision". The parsed
  row's Decision field is a short title only; the phrase (as a parenthetical,
  not a comma clause) is in the row's Rationale field:
  "...sourced from a manifest-declared field per capability (replacing the
  current getProcessingJurisdictions heuristic based on capabilityType and
  transparencyTag)." DEC-20260905-B's correction is accurate.

### Ten code-claim spot checks

1. **DEC-20260419-A** — `apps/api/scripts/check-no-new-console.mjs:1-20`: fail
   conditions confirmed as written (new file / allowlisted-file-count-growth),
   no "justification comment" language present.
2. **DEC-20260421-J** — `apps/api/src/capabilities/auto-register.ts`: no
   `singapore-company-data` entry in the `DEACTIVATED` map (only a comment
   marking its 2026-04-29 reactivation); commit `bd25bc57` exists
   (`git log -1`: "feat(singapore-company-data): migrate Tier-1 scrape →
   data.gov.sg ACRA API", dated 2026-04-29, 8 days after the row's
   `decided_at: 2026-04-21`), matching the row's "eight days later" claim.
3. **DEC-20260421-L** — commit `b86d431a` exists ("feat(park): park
   company-intelligence-sdr solution"); commit `2a1cc24` does not resolve
   (`git cat-file -e` fails), matching the record's own "does not resolve...
   cited in prose only" caveat.
4. **DEC-20260422-B** — `apps/api/src/capabilities/auto-register.ts:32`:
   `["amazon-price", "Amazon CAPTCHA blocks datacenter IPs"]` confirmed
   present in the `DEACTIVATED` map verbatim.
5. **DEC-20260422-D** — `apps/api/src/lib/provenance-builder.ts:36-38`:
   confirmed the exact comment text about EU High-Value Datasets
   (Bolagsverket HVD, KVK HVDS, Brreg, CVR, PRH, ARES, Ariregister) and "should
   set all four" attached to the `attribution`/`license`/`license_url`/`source_note`
   fields.
6. **DEC-20260425-A / DEC-20260425-B** — `apps/api/src/lib/processing-location.ts`:
   confirmed `getProcessingLocation()` reads `RAILWAY_REPLICA_REGION`, falls
   back to `STRALE_PROCESSING_REGION`, then `"unknown"` with a one-time
   `console.warn`, exactly as both records state.
7. **DEC-20260427-H** — `apps/api/src/capabilities/auto-register.ts`: all five
   slugs (`patent-search`, `trustpilot-score`, `salary-benchmark`,
   `employer-review-summary`, `linkedin-url-validate`) confirmed present in the
   `DEACTIVATED` map with matching reactivation-trigger comment text.
8. **DEC-20260427-I** — `apps/api/src/capabilities/{dutch,austrian,spanish,
   swiss,polish}-company-data.ts` and `officer-search.ts`: confirmed the
   northdata.com fallback-removal comments quoted in the record, and confirmed
   (via `grep -n northdata`) that none of swiss/polish/officer-search calls
   northdata.com in current fetch logic — only in removal-history comments.
9. **DEC-20260503-B** — `apps/api/src/db/schema.ts`: confirmed `qpScore`,
   `rpScore`, `matrixSqs`, `matrixSqsRaw`, `trend`, `guidanceUsable`,
   `guidanceStrategy`, `guidanceConfidence`, and the `sqs_daily_snapshot` table
   all still present. `apps/api/src/routes/audit.ts`: confirmed
   `art_22_classification` with `data_lookup`/`screening_signal`/`risk_synthesis`
   branches, no "tier"/"basic"/"Assurance" text. `apps/api/src/jobs/test-scheduler.ts`:
   confirmed risk-tiered cadence comment (A=6h, B=24h, C=72h).
10. **DEC-20260505-B** — `apps/api/src/lib/lifecycle.ts:1-14`: header comment
    confirmed verbatim ("Per DEC-20260503-B (SQS deletion), automatic
    transitions are removed..."); `apps/api/scripts/lifecycle-transition.ts:9`:
    "--sweep mode was removed with the SQS engine (DEC-20260503-B)." confirmed.

### Other checks

- Frontmatter parses for all 39 records; `record_key`/`id`/filename agreement
  holds for all 39 (none in this partition are `--notion-`/`--git-` qualified,
  so check 8 does not apply to any file in this partition).
- CAUTION banner and all five protected sections present in all 39 records.
- Evidence-path existence: every non-URL evidence entry across all 39 records
  resolves to a file in the working tree at this commit; no missing evidence
  files.
- Relations: every declared relation target (19 relation edges across 19
  records) exists as a record-key filename at this commit; none is a bare
  collided id per `docs/decisions/id-collisions.yaml`. Two narration-convention
  gaps (`DEC-20260423-A`'s supersession of `DEC-20260422-C` narrated in the
  target record, not the source; the "Relation to" heading absent in several
  records that substantiate the relation in ordinary prose instead) match
  exactly what DEC-20260905-B's Consequences section already excuses and are
  not findings.
- Null-field check: spot-checked against parsed Notion rows for
  `DEC-20260422-D`, `DEC-20260422-H` (both correctly state their Rationale
  field is null) and `DEC-20260505-B` (correctly states `Outcome` and
  `Superseded By` are null); no case found where a null field was quoted or a
  populated field called null.
- All cited git commit SHAs resolve except `2a1cc24` (DEC-20260421-L) and
  `84398f7` (DEC-20260507-G), both of which the citing record itself already
  flags as unresolved/cited-in-prose-only — not findings.

### Unverifiable

- The 15 paused KYB solutions' current `is_active`/`x402_enabled` state
  (DEC-20260427-I) — the record itself declines to assert this per CLAUDE.md's
  own drift-prevention instruction; not independently checked further here.
  - Which billing tier (Free/trial Pro/paid Pro) OpenRegister production is
  currently on (DEC-20260505-H, DEC-20260507-E) — neither the manifest nor
  `config/env-manifest.yaml` states this; both records already flag it as
  unconfirmed.
- Whether any BYO-endpoint language was ever added to or removed from the
  Counterparty Assurance product page (DEC-20260507-D) — no such page exists
  in this repository to check; the record already flags this.

PARTITION VERDICT: FAIL

### P4

# Closing review round 2, partition P4

Commit: c3691079b150c9aecb082af6a9215e7b1d8c7a2b
Record count: 41

### Method

A worktree was created at the pinned commit (`C:/tmp/strale-closing2-P4`, `npm ci` run). A Python script parsed each record's frontmatter (record_key/id/filename agreement, qualifier form, required protected headers, CAUTION banner) across all 41 files; all 41 passed structurally. A second script collected every `relations[].target` and confirmed each resolves to an existing `record_key` among the repository's 232 formal records and is not a bare collided id per `docs/decisions/id-collisions.yaml`; all resolved cleanly. A third script confirmed every non-URL, non-cross-repo `evidence` entry is a file that exists at the pinned commit; two entries needed manual follow-up because they are cross-repo/cross-commit git references rather than plain paths (see below) — both resolved. Beyond the scripts, every record was read in full and every quotation attributed to a Notion row, a repository file, or another record was checked by hand against the parsed source (Notion rows via `dump_rows.py`, repo files via `grep`/`sed` at the pinned commit, PRs via `gh pr view`), because a naive single-line or naive multi-line quote-extraction regex over this partition produced too many false positives (short embedded apostrophes/quotes in ordinary prose) to trust unsupervised; every attribution reported here was verified by direct comparison of the record's text against its cited source, not by the regex alone.

Residual-mismatch list from the manual byte-comparison pass, with judgement:

1. **DEC-20260511-E**, the large quoted comment block from `apps/api/src/lib/meta-monitoring.ts` ("Staleness anchor for lifecycle-state checks... Per DEC-20260511-E."): the record renders `'stuck'` (ASCII single quotes) and `2026-05-07 -> 2026-05-11` (ASCII hyphen-greater-than) where the source comment at `apps/api/src/lib/meta-monitoring.ts:422-429` reads `"stuck"` (double quotes) and `2026-05-07 → 2026-05-11` (Unicode U+2192 rightward arrow). Judgement: a genuine byte-level quote-fidelity defect, the same class DEC-20260905-B corrected in round 1 for other records. Reported as a finding below; not covered by any DEC-20260905-B withdrawal (DEC-20260905-B does not name DEC-20260511-E).
2. **DEC-20260508-A**, the evidence-array URL `https://occsz.e-cegjegyzek.hu/Utmutatok/ÁSZF_IM_disztributor_20250312.pdf` (with accented Á) versus the Notion row's own `Source` field, which reads the same URL without the accent (`ASZF_IM_disztributor_20250312.pdf`). This is not a quotation inside prose (no quote marks are placed around it), so it is not caught by the byte-for-byte-quotation rule, and this review has no way to fetch the live URL to determine which form is the real resource. Judgement: reported as unverifiable, not as a finding.
3. **DEC-20260513-C**, the backtick-rendered SQL predicate `abs(hashtext(c.slug || ':' || ts.test_type)) % 60 = EXTRACT(MINUTE FROM NOW())::int` omits the source's outer parentheses around `(abs(...) % 60)` (`apps/api/src/jobs/test-scheduler.ts:361`). This is inline code notation in backticks, not a double-quoted attributed quotation, and the omission does not change SQL operator precedence (`%` binds tighter than `=` regardless). Judgement: not a finding — style, not substance, and outside the scope of the byte-for-byte quotation rule.
4. **DEC-20260904-B / DEC-20260904-A / DEC-20260511-B / DEC-20260510-A / DEC-20260511-C**: several records cite figures (`handoff/README.md`'s file count, `m2-closure-register.yaml`'s `not_yet_reconciled` count) that have since moved because the repository keeps changing after the record's `decided_at`. Each such record either explicitly disclaims permanence of the figure or, on inspection, was verified accurate as of its own decision time by checking the historical commit that introduced the record (e.g. DEC-20260904-A's "205 to 129" and "216 to 140" counts were confirmed exactly against commit `90c1c798`, the commit that added that record). Judgement: not findings.

DEC-20260905-B's own withdrawal of statements from two records in this partition (item 5, DEC-20260510-A's "244 files..." quote; item 6, DEC-20260511-C's "CC does not reconcile silently" misattribution) was independently re-verified: item 5's underlying claim that the count is dated and moves with every handoff was confirmed (the line reads yet a third number, "259 files (232 with a recorded intent, 27 without)," at this review's own commit, consistent with DEC-20260905-B's disclaimer that no quoted count is authoritative beyond its own commit); item 6's correction was confirmed exactly, the phrase "CC does not reconcile silently" appears verbatim only in `handoff/_general/from-code/2026-05-06-chromium-phase3-halt-partial-flag-survival.md:61`, not in the 2026-05-13 file. Both withdrawals are themselves correct and are treated as corrected, not as findings against DEC-20260510-A or DEC-20260511-C, per the round 2 rule.

### Findings

1. **DEC-20260511-E** (file: `docs/decisions/records/DEC-20260511-E.md`, line ~74-76): the record's quotation of `apps/api/src/lib/meta-monitoring.ts`'s staleness-anchor comment renders `'stuck'` and `2026-05-07 -> 2026-05-11` where the source (lines 422-429) reads `"stuck"` and `2026-05-07 → 2026-05-11` (Unicode arrow). Evidence: `apps/api/src/lib/meta-monitoring.ts` at commit c3691079b150c9aecb082af6a9215e7b1d8c7a2b, lines 421-429, compared byte-for-byte against `DEC-20260511-E.md` lines 70-76. This is the only substantive finding in this partition; every other quotation, evidence path, relation, and sampled code claim checked out.

No other findings. Everything else checked — relations, evidence existence, CAUTION banners, protected sections, frontmatter identity, and all sampled Notion-row and code-comment quotations — matched byte for byte.

### Ten-plus code-claim spot checks (file, line, result)

1. `docs/company/VOICE.md` (57 lines, no numbered sections) — DEC-20260507-I's claim that the exception/section-numbering it describes does not exist in the repo file: confirmed, zero matches for "first person"/"Section 1"/"Section 6.5"/either email address.
2. `manifests/hungarian-company-data.yaml:54` (`data_source: Openapi.com WW-Top...`) + `config/env-manifest.yaml:776-777` (`OPENAPI_ENABLED`, gated off) + commit `9ee192828589dd293f3383de942a2b064143abc3` (2026-05-16) — DEC-20260508-A's claim that Hungary shipped on the Tier-3 aggregator, not the OCCSZ path: confirmed.
3. `config/env-manifest.yaml:788-796` (`OPENREGISTER_API_KEY`, `holder: railway`, `required_in: [production]`, no dormancy `cost_note`) + `apps/api/src/capabilities/german-company-data.ts:21,99` — DEC-20260508-D's claim OpenRegister is live and unflagged as dormant: confirmed.
4. `apps/api/src/lib/startup-migrations.ts:573-655` (block 0066's header comment and reconciling UPDATE, verbatim) — DEC-20260511-B's claim that block 0066 survives, narrowed to unclassified capabilities, alongside block 0069: confirmed exactly, including the quoted comment text.
5. `apps/api/drizzle.config.ts` (exists), `apps/api/package.json:61` (`drizzle-kit` devDependency present, no `db:generate`/`db:migrate`/`db:push` scripts), `.github/workflows/ci.yml:176` (`npx drizzle-kit push --force`), `apps/api/drizzle/` (absent) — DEC-20260511-C's "Status on 2026-09-04" reintroduction claims: all confirmed.
6. `apps/api/src/jobs/daily-digest.ts:5` ("Usage: cd apps/api && npx tsx..."), `apps/api/src/jobs/test-scheduler.ts:1020`, `apps/api/package.json:19` (`"digest"` script), `apps/api/src/routes/admin.ts:357` (`POST /digest`), `apps/api/src/lib/interrupt-sender.ts:172` (`sendInterruptEmail`, only caller is its own definition) — DEC-20260511-F's "manual triggers only, no cron" claim: confirmed.
7. `manifests/swiss-company-data.yaml:97` (`uid: CHE-101.602.521`), `apps/api/src/db/schema.ts:966-980` (`capability_health` state enum comment, verbatim), `apps/api/src/routes/admin.ts:658-679` (`POST /reset-circuit-breaker`) — DEC-20260513-B's fixture-correction and no-manual-pin-mechanism claims: confirmed.
8. `apps/api/src/jobs/test-scheduler.ts:225-361` (`slugStaggerMinute` two-arg form, `findOverdueSuites` comment, the `hashtext` SQL predicate) — DEC-20260513-C's claim that the code cites DEC-20260513-D rather than DEC-20260513-C for the same mechanism: confirmed as an honestly-reported codebase inconsistency, not a fault in the record.
9. `manifests/croatian-company-data.yaml:10`, `manifests/swiss-company-data.yaml:9` (`price_cents: 5`), commit `86b04be6d3cea2a4d2618c806b9602fb77adf068` (2026-05-13 14:58:48 +0200 = 12:58:48Z) — DEC-20260513-E's price-normalization and merge-commit-timestamp claims: confirmed exactly.
10. `manifests/` absence of `us-ny-company-data`/`us-co-company-data`/etc., `config/env-manifest.yaml:302-311` (`COBALT_API_KEY`, `required_in: []`), `docs/company/DECISION-QUEUE.md:17-20` (DQ-30, "leave Cobalt, EINsearch and sec-api in place"), `git cat-file -e 34036a0` (fails) — DEC-20260515-A and DEC-20260515-B's claims that none of the seven Tier-1 direct-state capabilities were built and the cited commit does not resolve: confirmed on all points.
11. `manifests/slovenian-company-data.yaml:127-136` (AJPES limitation text, verbatim including the ellipsis-elided Slovenian phrase) — DEC-20260515-C's claim that the directors gap is documented exactly as described: confirmed.
12. `gh pr view 131` (merged 2026-05-18, "feat(evidence-tier): labeling sweep across 31 company-data handlers") + `manifests/uk-cop-check.yaml:223` (Digiteal pointer) + no `digiteal`/`sepa-vop` slug anywhere — DEC-20260518-C/D's PR and no-handler claims: confirmed.
13. `apps/api/src/capabilities/uk-company-data.ts:226-227` and `apps/api/src/capabilities/danish-company-data.ts:183-184` (`ubo_availability`/`ubo_availability_reason` values and reason strings, verbatim) — DEC-20260518-A/D's per-country outcome claims: confirmed.
14. `gh pr view 410` and `gh pr view 137` (both merged, titles match the records' descriptions) + `manifests/austrian-company-data.yaml:8` (`price_cents: 5`) + `docs/company/DECISION-QUEUE.md:235-236` (DQ-20) — DEC-20260827-A and DEC-20260518-E's PR/pricing/DQ claims: confirmed.
15. `docs/project/m2-closure-register.yaml` at historical commit `90c1c798` (the commit that introduced DEC-20260904-A): `not_yet_reconciled: 129`, `intentionally_historical: 77`, `private_rows.count: 140` — DEC-20260904-A's "moves from 205 to 129" / "1 to 77" / "216 to 140" consequence claims: confirmed exactly at the commit where the record landed (the current pinned-commit value has since moved further, as expected and as the record does not claim otherwise).
16. `scripts/decision-records-lib.mjs:26` (the exact regex pattern) + `scripts/m2-closure-register-lib.mjs` (all named finding codes present) + `docs/decisions/records/DEC-20260422-A--git-3b256587.md` (exists at the pinned commit, confirming the mechanism DEC-20260904-B describes was later applied in a stage-2 batch, exactly as DEC-20260904-B's own Consequences section anticipates) — confirmed.

### Unverifiable

- DEC-20260508-A's evidence-array URL accent discrepancy (see residual-mismatch item 2 above): cannot be resolved without fetching the live external URL, which is outside this review's read-only, no-network scope.
- DEC-20260508-D's and DEC-20260827-A's claims about whether OpenRegister is billed on a paid Pro subscription today, and whether Cobalt/EINsearch/sec-api "keep dormant" DQ answers reflect the current wallet/x402 flags in the database: both records themselves already disclaim this (no DB write access available to this review), and this review confirms the same limitation rather than resolving it.
- DEC-20260827-A's claim "x402 enabled" for `austrian-company-data`: not verifiable from the file system (x402 enablement is a DB column per CLAUDE.md, not a manifest field); no db read access in this review's scope.

### PARTITION VERDICT: PASS

### P5

# Closing review round 2 — Partition P5

Commit reviewed: c3691079b150c9aecb082af6a9215e7b1d8c7a2b
Partition: P5 (collision layer: id-collisions.yaml, every collision resolution report named by my 34 records, and every --notion- record's registry binding)
Records in partition: 34 files, covering 18 collided historical ids (DEC-20260225-P-c5d6, DEC-20260303-A, DEC-20260304-A, DEC-20260304-B, DEC-20260304-C, DEC-20260320-C, DEC-20260320-J, DEC-20260320-K, DEC-20260405-B, DEC-20260406-A, DEC-20260406-B, DEC-20260406-C, DEC-20260409-C, DEC-20260420-D, DEC-20260420-E, DEC-20260420-F, DEC-20260420-G, DEC-20260420-H)

Setup: detached worktree at C:/tmp/strale-closing2-P5, read-only, no npm ci (not needed - no repo scripts were run, only file reads, git log, and grep). Notion rows read exclusively via dump_rows.py against the 34 page ids named in the records' evidence[0] URLs, plus one extra collision-sibling page (34867c87082c81c8b9d4c6b5568bbcef, DEC-20260420-I) and the credit-report-summary sibling row, fetched to verify relation/attribution claims that named them.

### Script used

A Python script parsed each record's frontmatter (PyYAML) and body, and:
1. Verified record_key/id/filename agreement, structural checks against docs/decisions/id-collisions.yaml (collision entry disposition formal_record + matching record_key) and docs/project/m2-closure-register.yaml (formal_records registry entry with the page id in source_rows, and a decision_rows entry for that page id with disposition: formally_migrated and the same record_key) - this is the P5-specific check (8).
2. Confirmed presence of the CAUTION banner and all five protected sections in every file.
3. Extracted every double-quoted span 25+ characters from each record body and tested it as a substring of: the matching Notion row's Decision/Rationale/Confidence/Status fields (fetched via dump_rows.py), every evidence-listed repo file's content at commit, and - where automatic matching failed - I read the surrounding text by hand and traced the quote to its real source (another record, a repo file not in the evidence list, or a Notion row's Source field), verifying it there instead.
4. Cross-checked evidence paths for existence and relations targets for existence as record keys, non-bare-collided-id status, and prose substantiation - all zero findings automatically.

Residual-mismatch list the script produced, and my judgement of each (all judged non-findings - either exact-content matches with a grammatically-adapted trailing punctuation mark, or matches found in a file/record not literally passed to the automated substring pass):
- DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md: "one INSERT on the failure path" is exactly the statement DEC-20260905-B item 13 withdraws (source lacks "the"); not a fresh finding per this round's rule. "to capture unauthenticated free-tier failures," matches schema.ts:680 verbatim; only the record's closing comma (vs. the source's period) differs, a normal grammatical adaptation for embedding a quote mid-sentence. Not a finding.
- DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md: "in the Show HN or outreach emails" matches archive/sessions/strale-spike-correlation-analysis-2026-04-08.md:240 exactly; the file is cited in body prose but not listed in evidence: - permitted (only evidence-list entries must exist, per check 5; not every body-cited file need be listed).
- DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md and ...813198e2da8e3d02b531.md: quotes matched the cross-repo strale-io/strale-frontend@04c9fca9 files exactly once resolved via git -C strale-frontend show 04c9fca9:<path>.
- DEC-20260304-A--notion-...8185b0a6c33de2293215.md and DEC-20260304-B--notion-...81dda9c4f43b5b7674b3.md: "trust data must never be displayed with false confidence" and "never show component sum" are quotes of sibling records/rows in the same batch (the former is DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md's title; the latter is the Notion row's own Rationale, Rule 1) - both confirmed exact.
- DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md: title quote "Show 'Unverified' SQS with capability still listed," matches DEC-20260313-C.md's title with the trailing comma a grammatical addition - not a finding. (See Finding 1 below for a different, real issue in the same file.)
- DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md: four of five VOICE.md rule-quotes matched exactly; the fifth did not (see Finding 7).
- DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md and the two DEC-20260420-* "title-only" records: quotes resolved once checked against DEC-20260409-D.md / DEC-20260812-A.md / CLAUDE.md directly (see Findings 5-6 for the cases that did NOT resolve cleanly).
- DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md: a quote uses an ellipsis plus an editorial [wired into the solution executor] bracket to compress two non-adjacent sentences of DEC-20260409-B.md into one line. Each side of the ellipsis is independently a genuine substring; the bracket is a marked editorial insertion, not a claimed literal quote. Judged as acceptable convention, not a finding.

### Findings

1. **docs/decisions/records/DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md, Rationale section (~line 46).** The record writes: "...a reader cannot tell "here is quality infrastructure data" from "here is a suggested product to buy."", prefaced by "The rationale, as the row states it." Neither quoted clause is in the Notion row (page 31867c87082c810197f9efa520332024). The row's actual Rationale only contains the shorter, single-quoted phrases 'quality infrastructure' and 'product recommendation' (correctly quoted, with single quotes, in this same record's own Context section two paragraphs earlier). The Rationale section's double-quoted sentences are fabricated illustrative phrasing dressed as a literal quotation of the row.

2. **docs/decisions/records/DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md, Consequences section.** The record quotes apps/api/src/lib/trust-grade.ts as computing a combined grade "the worst of (SQS grade, freshness grade, latency grade),". The file's actual line 211 reads "Combined grade = worst of (SQS grade, freshness grade, latency grade)" - no "the" precedes "worst of." A definite article was inserted into a quotation attributed to a repo file, the same defect class DEC-20260905-B withdrew elsewhere in the corpus (item 13) but not caught for this record.

3. **docs/decisions/records/DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md, Consequences section - the most significant finding in this partition.** The record concludes: "Neither the .d.ts filter nor the MIN_EXPECTED_EXECUTORS startup health gate exists in auto-register.ts today... There is also no process.exit(1) FATAL startup gate keyed on an expected executor count anywhere in the file... this row's specific fix and its startup gate moot rather than wrong." This is false as a claim about the row's requirement, though narrowly true of the one file checked (auto-register.ts, the record's only evidence file besides the Notion URL). apps/api/src/index.ts:10 defines `const MIN_EXPECTED_EXECUTORS = 200;` verbatim - the exact constant name and value the row's own Decision title names - and index.ts:19-30 implements exactly the gate the row asked for: it calls getRegisteredCount() after autoRegisterCapabilities(), and if count < MIN_EXPECTED_EXECUTORS it throws a StartupFatalError, which main().catch (index.ts:345-394) turns into a page-alerting email and process.exit(1). The mechanism is live in production, not moot, superseded, or absent - the record simply never read index.ts, which is not in its evidence list. The .d.ts-filter half of the record's claim is independently verified correct (the current auto-register.ts reads manifests/*.yaml only, no directory scan).

4. **docs/decisions/records/DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md, Consequences section.** The record states apps/api/src/lib/onboarding-gates.ts "still enforces PII_CATEGORY_ENUM exactly as this row specifies." At the reviewed commit, PII_CATEGORY_ENUM (onboarding-gates.ts:242-259) has 14 entries: the 12 the row named, plus nationality and political_affiliation, added 2026-04-30 per an inline comment ("Added 2026-04-30 to cover sanctions/PEP screening manifests"). The enum is not "exactly as this row specifies" - it has grown since. The gate's blocking behaviour and the manifest-backfill counts (342/342, 127/342) the same section cites are independently confirmed correct; only the "exactly" characterisation of the enum contents is overclaimed.

5. **docs/decisions/records/DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md, Consequences section.** The record quotes DEC-20260812-A (naming it "existing record") as stating it "supersedes... the Counterparty Assurance rename/ICP." The phrase "Counterparty Assurance rename/ICP" does not appear in docs/decisions/records/DEC-20260812-A.md anywhere; that file's own Consequences section (line 64) reads "The source decision explicitly supersedes the Counterparty Assurance row named DEC-20260502-A and DEC-20260503-A" - no "rename/ICP" wording. The quoted phrase is CLAUDE.md's own summary bullet for DEC-20260812-A (CLAUDE.md:302: "Supersedes DEC-20260502-A (Counterparty Assurance rename/ICP)..."), misattributed here to the formal decision record itself. Neither CLAUDE.md nor docs/decisions/records/DEC-20260812-A.md is listed in this record's evidence: array.

6. **docs/decisions/records/DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md, Consequences section - the same defect as Finding 5, recurring.** The record quotes DEC-20260812-A as stating it "supersedes... DEC-20260502-A (Counterparty Assurance rename/ICP)... the Counterparty Assurance framing is retired as primary product." Both quoted clauses are CLAUDE.md's bullet text (CLAUDE.md:302), not docs/decisions/records/DEC-20260812-A.md's own body (which never uses the words "rename/ICP" or "retired as primary product" - a grep for both across the record file returns nothing). This record's evidence: array lists only the one Notion URL; neither CLAUDE.md nor DEC-20260812-A.md is listed, despite being quoted at length.

7. **docs/decisions/records/DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md, Consequences section.** The record states VOICE.md "states five writing rules ("No jargon, ever," "Say what it means for the business," "Decisions are written as questions you can answer," "Never dress up a number," "Say the uncomfortable thing first")." At the reviewed commit, docs/company/VOICE.md's first rule is "Use audience-appropriate terms (DEC-20260905-A)...."; the string "No jargon, ever" does not appear anywhere in the file (confirmed by full-file grep). git log -p -- docs/company/VOICE.md shows the file did carry a "No jargon, ever." rule until a same-day edit (labelled DEC-20260905-A) replaced it - so this record's status claim, "verified on 2026-09-05, against main," is stale relative to the pinned review commit: the quoted first rule is not what the file says at c3691079b150c9aecb082af6a9215e7b1d8c7a2b. The other four quoted rules, and the "internal reports, customer-facing copy..." quote from the file's header, all match exactly.

### Code-claim spot checks (18; well beyond the required minimum of 10)

1. apps/api/src/db/schema.ts:680 - failedRequests.userId comment "to capture unauthenticated free-tier failures." - confirmed (DEC-20260225-P-c5d6 record).
2. apps/api/src/routes/suggest.ts:43-84 - GET /v1/suggest/typeahead and POST /v1/suggest both public/no-auth - confirmed (DEC-20260303-A record).
3. strale-io/strale-frontend@04c9fca9:src/components/solutions/SearchHero.tsx - placeholderIdx/PLACEHOLDER_QUERIES rotation, "SQS engine itself is gone" comment - confirmed byte-for-byte.
4. strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx - 10 numbered section comments, no "Built for Agents" text anywhere - confirmed.
5. strale-io/strale-frontend@04c9fca9:src/components/StatsStrip.tsx - the full multi-line "Cert-audit Y-1+Y-3..." comment block - confirmed byte-for-byte including the em dash.
6. strale-io/strale-frontend@04c9fca9:src/types/index.ts + src/lib/api.ts - SuggestRecommendation lacks component_sum_cents; SolutionDetail carries it - confirmed.
7. manifests/au-company-data.yaml + apps/api/src/capabilities/au-company-data.ts + config/env-manifest.yaml - price/category/data-source, ABN_LOOKUP_GUID (not ABR_AUTH_GUID) - confirmed.
8. apps/api/src/lib/platform-facts.ts:7-21 - the full "Drift problem" comment block, byte-for-byte including the free-tier-list bullet - confirmed.
9. apps/api/src/db/solution-catalogue.ts header + git log -S"kyb-essentials" (no hits) + apps/api/scripts/seed-kyb-solutions.ts template slugs + both archive/drop-*-kyb.ts retirement scripts - confirmed.
10. apps/api/src/lib/solution-executor.ts - StepTiming, per-step Date.now() timing on both branches, parsePath()/walkPath(), and the full input-mapping-syntax header comment - confirmed byte-for-byte.
11. apps/api/src/capabilities/auto-register.ts - the credit-report-summary DEACTIVATED-map comment, full text - confirmed; and (separately) confirmed it contains no MIN_EXPECTED_EXECUTORS/process.exit gate, which the reviewed record over-generalised into a false claim about the mechanism overall (Finding 3).
12. apps/api/src/index.ts:10,19-30,345-394 - the actual MIN_EXPECTED_EXECUTORS = 200 gate and its StartupFatalError -> process.exit(1) path - confirmed live (see Finding 3).
13. apps/api/src/lib/onboarding-gates.ts:242-259 - PII_CATEGORY_ENUM now has 14, not 12, entries - confirmed (Finding 4).
14. apps/api/src/lib/audit-token.ts and apps/api/src/routes/audit.ts - all four F-A-006/007 code comments quoted in the record - confirmed byte-for-byte.
15. apps/api/src/routes/verify.ts - MAX_DEPTH = 50, DEFAULT_DEPTH = 20, both F-A-012 comments - confirmed; apps/api/src/routes/transactions.ts - separate AUTH_VERIFY_MAX_DEPTH = 50 - confirmed.
16. apps/api/scripts/onboard.ts - case "ai_assisted" mapping and the --force-override-authority interactive guard (Cluster 2 Phase 4a) - confirmed.
17. docs/company/VOICE.md - full rule-by-rule check, including the stale first-rule mismatch - confirmed (Finding 7).
18. docs/programs/README.md + docs/company/CHARTER.md - "Programs are execution records, not project truth" and "day-to-day operation" - confirmed exactly.

### Structural checks (all 34 records, all automated, zero exceptions)

- Frontmatter parses; record_key/id/filename agree: 34/34 pass.
- CAUTION banner + all five protected sections present: 34/34 pass.
- Every evidence entry exists as a file at commit (or is a Notion URL, or a resolvable cross-repo entry - both cross-repo files, in the two DEC-20260303-A records, resolved via git -C strale-frontend show 04c9fca9:<path>): 34/34 pass.
- Every relations target exists as a record key at commit, is never a bare collided id, and is substantiated in body prose: 34/34 pass (checked programmatically against every record key in the repo and against docs/decisions/id-collisions.yaml's collided-id list).
- No null Notion field is quoted as content; no populated field is called null (checked against the actual dumped rows for all 34 pages): 34/34 pass, including the four records that correctly report a null Rationale/Outcome/Source (the two "title-only" DEC-20260420 sibling records, DEC-20260405-B's credit-report-summary record, and DEC-20260420-F's site-rebuild record) and the DEC-20260225-P-c5d6 record's correct null-field claim about Superseded By/Outcome.
- P5-specific collision/registry check (8), for all 34 --notion--qualified records: the collision entry in docs/decisions/id-collisions.yaml names the record's page id with disposition: formal_record and the matching record_key, and docs/project/m2-closure-register.yaml carries both a formal_records entry (same record_key, page id present in source_rows) and a decision_rows entry for that page id with disposition: formally_migrated and the same record_key: 34/34 pass.
- docs/decisions/id-collisions.yaml internal consistency: collision_count: 35 matches 35 entries; source_row_count: 71 matches the actual sum of records across all 35 collisions; all 35 resolution_status: resolved, zero unresolved. All 18 collision groups touched by this partition have a resolution-evidence report that exists on disk, and each report's frontmatter source_rows matches the corresponding id-collisions.yaml entry's page ids and dispositions exactly (spot-checked in full for DEC-20260225-P-c5d6, DEC-20260304-A, DEC-20260406-A, DEC-20260409-C, DEC-20260420-H; consistent programmatically for the rest via the check above).
- DEC-20260905-B's withdrawal check: none of the 13 statements DEC-20260905-B withdraws falls inside my partition's 34 files by target record, except item 13 (DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038), whose two withdrawn spans I independently re-verified against the Notion row and CLAUDE.md - DEC-20260905-B's own corrections are accurate (confirmed both: the row's Rationale reads "one INSERT on failure path" with no "the," and CLAUDE.md:270 reads "...6th table - failed_requests..." with an em dash, not a comma).

### Unverifiable

- Nothing in this partition was left unverifiable. Every evidence entry, cross-repo reference, relation target, and Notion-row quotation was independently checked against the pinned commit or the dumped row data. The few claims the records themselves flag as not independently confirmable (e.g. whether the ~90-page Notion archive still exists five months later, whether the 42 unaccounted KYB solutions are still is_active in the production database, whether a Session-1 onboarding-engine rewrite ever happened) are honestly labelled as such by the records themselves and are not findings - they are the records correctly declining to claim more than the repository can prove.

### Summary

34 records reviewed. Structural checks (frontmatter, protected sections, evidence existence, relations, null-field handling, collision/registry cross-binding) passed 34/34 with no exceptions. Quotation-fidelity checking surfaced 7 findings: two fabricated/adapted quotations (Findings 1, 2), one significant false claim about production behaviour from an incomplete evidence trail (Finding 3 - the strongest finding in this partition), one overclaimed "exactly as specified" characterisation of a since-grown enum (Finding 4), two recurring misattributions of a CLAUDE.md summary bullet to the DEC-20260812-A formal record itself (Findings 5, 6), and one stale quotation where the cited file was edited the same day the review commit was cut (Finding 7). None of these seven findings is covered by DEC-20260905-B's withdrawal list; all are new to this round.

PARTITION VERDICT: FAIL

### P6

# Closing review round 2, partition P6

Commit: c3691079b150c9aecb082af6a9215e7b1d8c7a2b
Records reviewed: 33 (listed in closing-P6.txt), all `--notion-` qualified except one `--git-` qualified record (DEC-20260422-A--git-3b256587.md).

Setup: detached worktree at C:/tmp/strale-closing2-P6, `npm ci` run there. Read-only throughout; no record edited or committed. Notion rows read only through dump_rows.py. Cross-repo evidence resolved against C:/Users/pette/Projects/strale-frontend after `git fetch origin`. Worktree removed at the end of the session.

### Method and script

Frontmatter/filename/id agreement and the five protected sections plus the CAUTION banner were checked with shell loops over all 33 files (grep-based presence checks). Quotation fidelity used a Python script (`p6_check_quotes2.py`) that: extracts every double-quoted span of 25+ characters from each record (a regex that tolerates single line-wraps but stops at paragraph breaks); for each quote, checks membership as a normalized-whitespace substring against (a) the Notion row(s) referenced by URL or `PAGE:` citation in that file, (b) every repo file listed in that record's own `evidence:` list, (c) every other record file in the full `docs/decisions/records/` directory (for relation-target title matches), and (d) an ellipsis-aware sequential-segment match for quotes that use "..." to mark omitted text. The script flagged 71 residual "not found" quotes out of 290 extracted; every one was individually resolved by hand against its named source. Separately, a null-field script (`p6_null_check.py`) extracted every sentence containing the word "null" (14 instances across the partition) and each was checked against the actual null/populated field list returned by `dump_rows.py` for the correct page (some claims describe a *different* row than the record's own page, cited via a `PAGE:` reference in the prose — those were re-fetched individually). An evidence-path script (`p6_evidence_check.py`) confirmed every non-URL evidence entry is a file that exists at the pinned commit. A relations script (`p6_relations_check.py`) confirmed every `target:` in the partition's `relations:` blocks exists as a record file and is not a bare id in `docs/decisions/id-collisions.yaml`. A registry script (`p6_registry_check.py`) cross-checked every `--notion-` record's collision entry and register row.

#### Residual-mismatch list and judgement

All 71 initial script "not found" quotes were resolved as follows, after manual inspection against the correct source:

1. **Short fragments below real content** (e.g. "F-A-005", "C1", "IBAN validation", "live", "amends") — artifacts of nested quotation marks inside a larger quoted block; either under the 25-character threshold in the actual source context or trivial single terms. Not misquotes.
2. **Nested single-quote conversion** — several records embed a sentence that itself contains a quoted phrase, and convert the inner quotation marks from double to single quotes for legibility (e.g. DEC-20260420-I--notion-...c8b9d4c6b5568bbcef.md line 28's "Strale's doctrine ... states 'direct data connections only...'" versus the Notion row's own straight-double-quote nesting). Standard nested-quotation convention; verified word-for-word identical once the quote-mark style difference is accounted for. Not a finding.
3. **Ellipsis-truncated quotes ending in an added period** where the source continues with an em dash or further prose (e.g. DEC-20260421-D--notion-...a2a12c...md line 53's Outcome quote, DEC-20260420-I--notion-...c8b9d4...md line 82's DEC-E/DEC-F quote, DEC-20260812-A cross-reference in DEC-20260420-K--notion-...81e3a6...md). This is a recurring, consistent house style throughout the corpus for closing a truncated quotation grammatically. Verified the retained text is exact in every case checked; the terminal-punctuation swap is not a content alteration.
4. **One genuine mid-quote punctuation swap, judged not a finding on reflection**: DEC-20260421-B--notion-...81dab7...md line 92 quotes `apps/api/src/jobs/onboarding-retry.ts`'s header as ending "...in try/catch," (comma) where the file (confirmed at line 312 of `capability-persistence.ts`, the correct source for that specific clause) reads "...in try/catch." (period). This follows the exact same terminal-punctuation-for-grammatical-continuation pattern as item 3 (the record's own sentence continues immediately after the quote: "matching this row's design exactly"), so it is treated the same way, not as an isolated fabrication. Flagged here for visibility, judged not a finding.
5. **Multi-line quotes that print with an embedded newline**, which broke naive `awk`/`grep` field-splitting on the intermediate results file and looked like truncated quotes until reconstructed properly in Python. Pure tooling artifact; all such quotes verified in full and matched.
6. **Quotes attributed to files or records outside the partition's own Notion row** (e.g. quotes attributed to another record's title via `PAGE:` cross-reference, or to `CLAUDE.md`, `WORKTREES.md`, `apps/api/src/lib/*.ts`, `strale-io/strale-frontend@04c9fca9`) — the script only checks the record's *own* evidence list plus its own row(s) by default; several of these quotes name a source elsewhere in the prose (e.g. "the positioning row" `PAGE:34867c87082c81b58b36de5f71c0937f`, or `apps/api/src/lib/trust-helpers.ts`). Every one was individually re-fetched or re-read and confirmed exact.

No quote, across the full 290 extracted and the 71 individually re-resolved, was found to state something false, fabricated, or attributed to the wrong source once the correct citation target was identified.

### Findings

None. No false, fabricated, misattributed, or unverifiable statement was found in this partition.

### Null-field and evidence checks

- 14 "null" claims checked; all correct, including two that describe a *different* Notion row than the record's own page (both correctly re-identified and re-fetched: `PAGE:34867c87082c81b58b36de5f71c0937f`, the "Strale positioning and ICP clarification" DEC-20260420-H collision row, has null Rationale and null Outcome exactly as both DEC-20260420-I--notion-...c8b9d4c6b5568bbcef.md and DEC-20260421-B--notion-...818288...md state).
- All 33 records' non-URL evidence paths exist as files at the pinned commit; no missing evidence file.
- Two cross-repo evidence entries (`strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx`, cited by DEC-20260421-B--notion-...818288...md and DEC-20260421-D--notion-...810695...md) both resolve; the quoted code (`<h1 className="text-foreground text-display leading-[1.1]">...` and the `{/* 2. Solutions showcase (with discovery demo folded in) */}` comment) matches byte for byte.
- 19 relation targets across the partition all exist as record files, are substantiated in ordinary Context/Rationale prose (not merely declared), and none is a bare collided id per `docs/decisions/id-collisions.yaml`.
- All 32 `--notion-`-qualified records' collision-registry bindings verified: each page id's entry in `docs/decisions/id-collisions.yaml` carries `disposition: formal_record` with the matching `record_key`, and the corresponding row in `docs/project/m2-closure-register.yaml` carries `disposition: formally_migrated` with the same key.
- The one `--git-`-qualified record, DEC-20260422-A--git-3b256587.md: `id` (DEC-20260422-A) equals the key with the qualifier removed; the register's `formal_records` entry for this key (not the record file itself, which correctly does not duplicate these fields) carries `source_kind: git-native`, `source_rows: []`, and `git_provenance` equal to the record's own first evidence entry (`https://github.com/strale-io/strale/commit/3b25658736bfed53eec52c8acf2619dacd54d1f5`); the commit sha's 8-character prefix matches the filename qualifier, and `git merge-base --is-ancestor` confirms it is an ancestor of HEAD.

### Ten code-claim spot checks

1. DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md — `apps/api/src/lib/capability-persistence.ts:303` reads "OUTSIDE the transaction. Design doc §4.3 — `onCapabilityCreated` can" and `:312` reads "Post-commit: call `onCapabilityCreated(slug)` in try/catch." — both confirmed present.
2. DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md — `apps/api/src/capabilities/auto-register.ts:259` and `:262` carry the exact comments "Final EU30 country to reach code parity — Phase 2c completes 30/30." and "InfoCamere integration per DEC-20260507-C." — confirmed.
3. DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md — `apps/api/scripts/check-platform-facts-drift.ts:30-31` and `CLAUDE.md:744` both confirmed to carry the quoted text on `getActiveVendorNames()`/`getStaleVendorNames()` and "update only the canonical source and let consumers read from it."
4. DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76.md — `CLAUDE.md:300` (the DEC-20260815-A entry) confirmed to carry "Shipping is never Petter's decision — the session that opens a PR merges it and reports afterwards in plain English;" verbatim.
5. DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md — `CLAUDE.md:171` confirmed to read "`main` changes only through reviewed PRs merged on GitHub; pushing the working branch is routine backup and needs no approval" verbatim.
6. DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md — `manifests/austrian-company-data.yaml:369` confirmed to carry the "attribution string in provenance; consumers republishing the data must preserve it" limitation text; `manifests/italian-company-data.yaml` confirmed to contain zero occurrences of "attribution"; `docs/decisions/records/DEC-20260428-A.md:35` confirmed to read "For vendor-mediated data, capability provenance includes the upstream vendor,".
7. DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md — `CLAUDE.md:150` confirmed to read "...branch cut from `origin/main`; the trunk stays on `main` and clean".
8. DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md — `CLAUDE.md:674` confirmed to read "Before branch-switching in the main tree, check `git status`".
9. DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md — `apps/api/src/lib/platform-facts.ts:137` confirmed to carry the comment "IBAN/name match — all rejected per DEC-20260430-A" exactly above the named `STALE_VENDORS` entries.
10. DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md — `apps/api/src/jobs/test-scheduler.ts` (lines 368, 398 area) confirmed to gate on `cost_class IN ('free_quota', 'paid_with_free_tier')` and `cost_class = 'free_unlimited'`; `apps/api/src/lib/startup-migrations.ts:811` confirmed to carry the comment "Block 0069: reconcile scheduled_testing_eligible from cost_class" verbatim.
11. (eleventh, for margin) DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md — `apps/api/src/lib/trust-helpers.ts:367` confirmed "manifest_drift" // PR #109 sentinel: declared-guaranteed field absent from actual_output", `:375` confirmed "// 0. manifest_drift — Phase 3a runtime sentinel (DEC-20260513-B + DEC-20260513-C)", `:386` confirmed `if (reason.startsWith("guaranteed_field_missing:")) return "manifest_drift";`.

### Unverifiable

None. Every evidence path, Notion row, cross-repo reference, and code claim checked in this partition was resolvable and confirmed.

### Interaction with DEC-20260905-B

One record in this partition, DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md, is amended by DEC-20260905-B item 7 (the "eight `HMRC_*` rows" count, corrected to seven). Confirmed independently: `config/env-manifest.yaml` carries exactly seven `HMRC_*` rows (`HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_REQUESTER_VRN`, `HMRC_SANDBOX_CLIENT_ID`, `HMRC_SANDBOX_CLIENT_SECRET`, `HMRC_TEST_VRN`, `HMRC_USE_SANDBOX`) — DEC-20260905-B's correction is itself correct, so per the round-2 rule this is not a finding against either record.

PARTITION VERDICT: PASS

## Gate run

This run is valid: every gate exit 0 at the commit.

```
M2 closing review round 2 gate run at c3691079b150c9aecb082af6a9215e7b1d8c7a2b, 2026-09-05T13:31:36Z
HEAD=c3691079b150c9aecb082af6a9215e7b1d8c7a2b
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (562.0563ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (649.3423ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (256.2612ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (463.2519ms)
ℹ tests 147
ℹ suites 0
ℹ pass 147
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 134836.0624
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (778.5129ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (495.2671ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (208.3855ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (511.5544ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 125332.9748
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
check-no-committed-secrets: clean (2922 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still c3691079b150c9aecb082af6a9215e7b1d8c7a2b
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Sweep

Round 2's own six partitions found disjoint sets of confirmed defects
across all three rounds so far (round 1 P2/P3/P4, round 2 P2/P3/P5);
sampling by partition was not converging on a stable, complete list. A
sixth pass (read-only, six reviewers, one partition each, the same 232
records) checked every quotation and every repository-state claim in
every record once, rather than sampling, before the final round closes.

### Sweep P1

# M2 candidate-set remediation sweep, partition P1

Partition: P1. Commit: c3691079b150c9aecb082af6a9215e7b1d8c7a2b. Record count: 40.
Script: a Python script extracted every double-quoted span of 25+ normalized
characters from each record via regex, then a second script normalized both
quote and candidate source (transliterating special characters, lowercasing,
stripping non-alphanumerics) and tested substring containment, splitting on
`...` where present. All 40 Notion rows cited as each record's primary
evidence were fetched in one batch via `dump_rows.py` into a single JSON file
and checked against the same normalizer; repo-file and cross-record
attributions were verified by direct `git grep` / file read against the
`c3691079` worktree, and three records citing `strale-io/strale-frontend`
were checked against that repo at `04c9fca9` via `git show`.

### Coverage

- DEC-20260224-P-a1b2.md | quotes checked: 5 | claims checked: 4 | findings: 0
- DEC-20260224-P-c3d4.md | quotes checked: 6 | claims checked: 2 | findings: 0
- DEC-20260224-P-e5f6.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260224-P-g7h8.md | quotes checked: 3 | claims checked: 2 | findings: 1
- DEC-20260225-P-a3b4.md | quotes checked: 4 | claims checked: 4 | findings: 0
- DEC-20260225-P-e7f8.md | quotes checked: 2 | claims checked: 3 | findings: 0
- DEC-20260225-P-g9h0.md | quotes checked: 6 | claims checked: 3 | findings: 0
- DEC-20260225-P-i1j2.md | quotes checked: 3 | claims checked: 2 | findings: 0
- DEC-20260225-P-k3l4.md | quotes checked: 5 | claims checked: 2 | findings: 0
- DEC-20260225-P-m1n2.md | quotes checked: 5 | claims checked: 2 | findings: 0
- DEC-20260225-P-m5n6.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260225-P-o7p8.md | quotes checked: 4 | claims checked: 2 | findings: 0
- DEC-20260225-P-q3r4.md | quotes checked: 3 | claims checked: 4 | findings: 0
- DEC-20260225-P-s5t6.md | quotes checked: 7 | claims checked: 3 | findings: 0
- DEC-20260225-P-u7v8.md | quotes checked: 1 | claims checked: 2 | findings: 0
- DEC-20260225-P-w9x0.md | quotes checked: 2 | claims checked: 2 | findings: 0
- DEC-20260225-P-y1z2.md | quotes checked: 12 | claims checked: 2 | findings: 2
- DEC-20260226-P-q1r2.md | quotes checked: 2 | claims checked: 3 | findings: 1
- DEC-20260226-P-s3t4.md | quotes checked: 2 | claims checked: 3 | findings: 0
- DEC-20260226-P-u5v6.md | quotes checked: 2 | claims checked: 2 | findings: 0
- DEC-20260226-P-w7x8.md | quotes checked: 0 | claims checked: 3 | findings: 0
- DEC-20260227-P-a1b2.md | quotes checked: 3 | claims checked: 2 | findings: 0
- DEC-20260227-P-i9j0.md | quotes checked: 1 | claims checked: 2 | findings: 0
- DEC-20260227-P-m3n4.md | quotes checked: 3 | claims checked: 2 | findings: 0
- DEC-20260227-P-o5p6.md | quotes checked: 6 | claims checked: 3 | findings: 0
- DEC-20260227-P-q7r8.md | quotes checked: 3 | claims checked: 2 | findings: 0
- DEC-20260227-P-s9t0.md | quotes checked: 3 | claims checked: 2 | findings: 0
- DEC-20260227-P-u1v2.md | quotes checked: 2 | claims checked: 2 | findings: 1
- DEC-20260302-A-0001.md | quotes checked: 3 | claims checked: 3 | findings: 0
- DEC-20260302-C.md | quotes checked: 3 | claims checked: 2 | findings: 1
- DEC-20260302-D.md | quotes checked: 1 | claims checked: 3 | findings: 0
- DEC-20260303-C.md | quotes checked: 5 | claims checked: 4 | findings: 0
- DEC-20260305-E.md | quotes checked: 3 | claims checked: 3 | findings: 2
- DEC-20260305-F.md | quotes checked: 2 | claims checked: 3 | findings: 0
- DEC-20260305-G.md | quotes checked: 3 | claims checked: 5 | findings: 0
- DEC-20260306-D.md | quotes checked: 2 | claims checked: 2 | findings: 0
- DEC-20260306-G.md | quotes checked: 6 | claims checked: 3 | findings: 0
- DEC-20260306-H.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260308-1.md | quotes checked: 2 | claims checked: 2 | findings: 0
- DEC-20260309-G.md | quotes checked: 2 | claims checked: 2 | findings: 1
- DEC-20260309-H.md | quotes checked: 2 | claims checked: 4 | findings: 0

### Findings

1. record: DEC-20260224-P-g7h8.md
   line: 73
   class: UNVERIFIABLE_QUOTE
   record_text: "Long-term ambition is tens/hundreds of thousands of data sources," per project memory
   source: CLAUDE.md (as named by the record) / MEMORY.md (the actual source)
   source_text: not present in CLAUDE.md, README.md, or docs/company/GOALS.md; the exact phrase exists only in the assistant's external, out-of-repository MEMORY.md file
   correction: The quotation is not sourced from this repository. CLAUDE.md's own text contains no line reading "Long-term ambition is tens/hundreds of thousands of data sources" — the record's framing ("CLAUDE.md's project description frames the platform as vertical-agnostic (... per project memory)") conflates a persistent-memory file outside the repo with CLAUDE.md itself; the two should not be presented as one attribution.

2. record: DEC-20260225-P-y1z2.md
   line: 89-90
   class: MISQUOTE
   record_text: "DEC-19: Structured error responses with stable error_code enum (unanimous)."
   source: CLAUDE.md:265
   source_text: "DEC-19: Structured error responses with stable error_code enum"
   correction: CLAUDE.md's DEC-19 bullet does not carry "(unanimous)" — unlike the neighboring DEC-8 and DEC-9 bullets it is quoted alongside, which do. The parenthetical was added to the quotation and is not present in the source.

3. record: DEC-20260225-P-y1z2.md
   line: 65
   class: MISQUOTE
   record_text: "Revised seed capabilities post-review: drop screenshot-url and eu-address-validate, add vat-validate and annual-report-extract." (attributed to what "DEC-20260225-P-a3b4 records")
   source: DEC-20260225-P-a3b4's row, Decision field (Notion page 31267c87082c81999f6ef6cd68976dae)
   source_text: "Revised seed capabilities post-review: Drop screenshot-url and eu-address-validate. Add vat-validate (€0.10) and annual-report-extract (€1.00). Raise invoice-extract from €0.30 to €0.50."
   correction: The quotation silently drops the two price parentheticals ("(€0.10)", "(€1.00)") and the entire trailing sentence ("Raise invoice-extract from €0.30 to €0.50") without using an ellipsis to mark the elision, producing a stitched composite rather than a faithful quotation or a marked partial quotation.

4. record: DEC-20260226-P-q1r2.md
   line: 67
   class: MISATTRIBUTED
   record_text: "Production: https://strale-production.up.railway.app (= api.strale.io)."
   source: attributed to "CLAUDE.md's Tech Stack section"; actual source is MEMORY.md (outside the repository)
   source_text: not present anywhere in CLAUDE.md (its Tech Stack section, lines 210-218, lists Runtime/Framework/Database/ORM/Payments/Hosting/Headless browser/SDKs only, no production URL line)
   correction: CLAUDE.md's Tech Stack section does not state a production URL. The quoted line exists only in the assistant's external MEMORY.md file, not in this repository at the reviewed commit.

5. record: DEC-20260227-P-u1v2.md
   line: 80
   class: MISATTRIBUTED
   record_text: "CLAUDE.md's \"Distribution packages & protocol endpoints\" area"
   source: attributed to CLAUDE.md; actual source is MEMORY.md's Feedback section (a bullet link titled "Distribution packages & protocol endpoints")
   source_text: not present anywhere in CLAUDE.md
   correction: No section, heading, or line in CLAUDE.md is titled or reads "Distribution packages & protocol endpoints." That title exists only as a memory-file bullet outside the repository; CLAUDE.md itself documents SDKs and packages under "Project Structure" and elsewhere, not under this heading.

6. record: DEC-20260302-C.md
   line: 41
   class: FALSE_CLAIM
   record_text: "CLAUDE.md's \"Current Decisions (March 2026)\" section lists this row by its short form (\"DEC-20260302-C: Homepage leads with solutions and trust positioning\")"
   source: CLAUDE.md:278
   source_text: "DEC-20260302-C: Historical homepage prescription; superseded for the apps/web redesign by DEC-20260905-A. Its outcome-before-plumbing rationale is preserved."
   correction: CLAUDE.md's current DEC-20260302-C bullet does not read "Homepage leads with solutions and trust positioning" (that string appears nowhere in CLAUDE.md); it was rewritten, as part of adopting DEC-20260905-A, to record that DEC-20260302-C's homepage-composition prescription is now historical and superseded for the redesign. The record quotes a stale, pre-DEC-20260905-A version of the line.

7. record: DEC-20260305-E.md
   line: 92-95
   class: MISATTRIBUTED
   record_text: "\`browserless-extract.ts\` contains an explicit comment distinguishing \"Browserless v2 cloud (production-*.browserless.io)\" from an implied v1 path, in the context of the \`?token=\` query-parameter and \`LAUNCH_ARGS\` handling Browserless v2 requires"
   source: apps/api/src/capabilities/lib/web-provider.ts:613,617
   source_text: "// Browserless v2 cloud (production-*.browserless.io) uses ?token= query" / "// query param Browserless v2 requires for Chrome flags (LAUNCH_ARGS"
   correction: This comment lives in web-provider.ts (also in this record's own evidence list), not in browserless-extract.ts. A grep of browserless-extract.ts for "Browserless v2", "production-", or "LAUNCH_ARGS" finds no match.

8. record: DEC-20260305-E.md
   line: 103
   class: FALSE_CLAIM
   record_text: "A future capability count audit reconciling the 47-to-36 gap"
   source: the record's own Consequences section, line 82; independently confirmed by \`grep -rl "browserless-extract" apps/api/src/capabilities\` (excluding tests and the two library files)
   source_text: "Today's importer count is 35, not 47."
   correction: The current importer count is 35, not 36. The Reversal-conditions sentence contradicts the record's own, independently-verified Consequences finding two paragraphs earlier.

9. record: DEC-20260309-G.md
   line: 68
   class: FALSE_CLAIM
   record_text: "A repository-wide search for \"risk framework\", \"12 categories\" / \"12-category\", and \"risk categor*\" (case-insensitive, across \`.ts\`, \`.md\`, \`.yaml\`) returns no matches outside this record."
   source: docs/programs/codex-review-backlog.yaml:425
   source_text: "(DEC-20260320-B) enforces, and one of them (the 12-category risk\n      framework) is a rule the repository never implemented."
   correction: The phrase "12-category risk framework" also occurs in docs/programs/codex-review-backlog.yaml, a file outside this record, in a CX-16 entry that itself discusses this same record's fidelity to its Notion source. This is a meta-reference to the record, not evidence of an implemented framework, so the record's underlying conclusion (no 12-category risk-evaluation mechanism exists on \`main\`) stands, but the literal "no matches outside this record" claim is false as stated and should be narrowed to "no matches describing an implemented mechanism."

### Not findings

- DEC-20260224-P-c3d4.md / DEC-20260225-P-m1n2.md: quotations attributed to "the row's own Rationale" that do not appear verbatim in the *derived* record file's own prose (e.g. "drifted far from marketplace vision", "the commerce protocol for the agent economy") are faithful against the underlying Notion row's Rationale field itself, which is the correct source for this convention throughout the corpus. Flagging these against the derived .md text alone (as an early pass in this sweep did) produces false positives; the row is the source, not the sibling record's paraphrase of it.
- DEC-20260226-P-u5v6.md: "Actual build velocity produced 133+ capabilities in <24hrs (heading to 200+)," attributed to "DEC-20260227-P-a1b2 states": the derived DEC-20260227-P-a1b2.md record paraphrases this as "under 24 hours," but the underlying row's own Rationale field reads "<24hrs" verbatim, matching the quotation exactly. Not a misattribution once the row, not the sibling record's prose, is checked.
- DEC-20260225-P-q3r4.md: "when providers want instant settlement (month 3-6)" is explicitly attributed in-sentence to "the sibling row DEC-20260225-P-s5t6," not to this record's own row; verified faithful against DEC-20260225-P-s5t6's row Rationale.
- DEC-20260305-E.md's own claim "Today's importer count is 35, not 47" (line 82) is itself correct (independently re-derived by grep); only the later, contradicting "47-to-36" restatement in Reversal conditions is wrong (see Finding 8).

### Unverifiable

- DEC-20260225-P-a3b4.md / DEC-20260225-P-w9x0.md: whether \`vat-validate\`'s \`price_cents: 2\` or \`swedish-company-data\`'s \`price_cents: 5\` price changes were ever the subject of a decision is stated by both records as unresolved from repository evidence; would need the missing decision record or a production pricing-change log to settle, neither of which exists in this partition's evidence.
- DEC-20260227-P-u1v2.md: whether the row's specific 20-step sequence is tracked anywhere as a living checklist cannot be confirmed or denied beyond "no file under docs/, apps/api/scripts/, or elsewhere reproduces it" — a negative that depends on the completeness of \`git grep\`, not a definitive external check (e.g. a since-deleted Notion sub-page could have held it).
- Several "point-in-time" counts (342 manifests, 35 importers, etc.) are correct as of the reviewed commit but are STALE_COUNT by nature (dated, and correctly dated, in the record's own text) rather than FALSE_CLAIM; these are not listed as findings per the convention.

SWEEP COMPLETE

### Sweep P2

# Sweep P2 report

Partition: P2. Commit: `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`. Record count: 40.

Script summary: extracted every double-quoted span (>=25 normalized chars) from all 40 records via a Python regex pass (`extract_quotes_p2b.py`), then tested each span's normalized form as an ordered-segment substring (splitting on literal `...`) against the record's own Notion row (pulled via `dump_rows.py PAGE:<id>` for all 41 evidence page ids), against every code/doc file the batch's evidence lists cite, and against every other record file in the partition, flagging anything with zero matches for manual review (`check_quotes_p2c.py`). Manual review then read each flagged quote and every record's Consequences section in full, verifying repository-state claims (file existence, line numbers, exact strings, "zero callers", counts) with targeted `grep`/`git ls-files`/`git show` against the pinned worktree and the sibling `strale-frontend` checkout at `04c9fca9`.

### Coverage

DEC-20260310-E.md | quotes checked: 5 | claims checked: 4 | findings: 0
DEC-20260310-F.md | quotes checked: 5 | claims checked: 5 | findings: 1
DEC-20260313-C.md | quotes checked: 4 | claims checked: 5 | findings: 1
DEC-20260313-E.md | quotes checked: 2 | claims checked: 3 | findings: 0
DEC-20260313-F.md | quotes checked: 1 | claims checked: 6 | findings: 0
DEC-20260314-A.md | quotes checked: 3 | claims checked: 3 | findings: 0 (1 already withdrawn by DEC-20260905-B item 10)
DEC-20260314-B.md | quotes checked: 6 | claims checked: 4 | findings: 0
DEC-20260314-C.md | quotes checked: 1 | claims checked: 2 | findings: 0
DEC-20260314-F.md | quotes checked: 6 | claims checked: 4 | findings: 1 (1 already withdrawn by DEC-20260905-B item 9)
DEC-20260314-G.md | quotes checked: 4 | claims checked: 3 | findings: 0
DEC-20260315-A.md | quotes checked: 3 | claims checked: 3 | findings: 0
DEC-20260315-B.md | quotes checked: 4 | claims checked: 4 | findings: 0
DEC-20260315-H.md | quotes checked: 3 | claims checked: 3 | findings: 1
DEC-20260315-I.md | quotes checked: 10 | claims checked: 4 | findings: 0 (1 already withdrawn by DEC-20260905-B item 4)
DEC-20260316-A.md | quotes checked: 3 | claims checked: 5 | findings: 0
DEC-20260316-B.md | quotes checked: 4 | claims checked: 4 | findings: 1
DEC-20260317-A.md | quotes checked: 6 | claims checked: 6 | findings: 0
DEC-20260317-F.md | quotes checked: 9 | claims checked: 4 | findings: 1
DEC-20260317-G.md | quotes checked: 7 | claims checked: 3 | findings: 0
DEC-20260317-H.md | quotes checked: 3 | claims checked: 3 | findings: 0
DEC-20260318-A.md | quotes checked: 3 | claims checked: 4 | findings: 1
DEC-20260318-B.md | quotes checked: 2 | claims checked: 3 | findings: 0
DEC-20260320-A.md | quotes checked: 3 | claims checked: 6 | findings: 1
DEC-20260320-B.md | quotes checked: 0 | claims checked: 2 | findings: 0
DEC-20260320-E.md | quotes checked: 1 | claims checked: 3 | findings: 0
DEC-20260320-F.md | quotes checked: 1 | claims checked: 4 | findings: 0
DEC-20260321-A.md | quotes checked: 3 | claims checked: 3 | findings: 0 (1 already withdrawn by DEC-20260905-B item 11)
DEC-20260323-A.md | quotes checked: 2 | claims checked: 4 | findings: 1
DEC-20260324-A.md | quotes checked: 1 | claims checked: 3 | findings: 0
DEC-20260324-C.md | quotes checked: 0 | claims checked: 3 | findings: 0
DEC-20260329-A.md | quotes checked: 2 | claims checked: 3 | findings: 0
DEC-20260330-B.md | quotes checked: 1 | claims checked: 3 | findings: 0 (1 already withdrawn by DEC-20260905-B item 2)
DEC-20260404-A.md | quotes checked: 3 | claims checked: 4 | findings: 0
DEC-20260405-A.md | quotes checked: 0 | claims checked: 4 | findings: 0
DEC-20260406-E.md | quotes checked: 1 | claims checked: 3 | findings: 0
DEC-20260409-A.md | quotes checked: 4 | claims checked: 4 | findings: 0
DEC-20260409-B.md | quotes checked: 2 | claims checked: 3 | findings: 0
DEC-20260409-D.md | quotes checked: 4 | claims checked: 4 | findings: 1
DEC-20260410-A.md | quotes checked: 3 | claims checked: 3 | findings: 0
DEC-20260411-A.md | quotes checked: 1 | claims checked: 3 | findings: 0
DEC-20260411-B.md | quotes checked: 1 | claims checked: 4 | findings: 0

### Findings

1. record: DEC-20260310-F.md
   line: 79-81
   class: MISQUOTE
   record_text: "the pipeline generates all 5 test types... and verifies the known_answer test passes against live output,"
   source: CLAUDE.md:334 and CLAUDE.md:361-362
   source_text: "The canonical pipeline is `apps/api/scripts/onboard.ts` — it generates all 5 test types and is the only sanctioned path for capability creation." / (separately, under "The pipeline:") "- Generates all 5 test types (known_answer, schema_check, negative, edge_case, dependency_health)" / "- Verifies the known_answer test passes against live output"
   correction: CLAUDE.md never reads "the pipeline generates all 5 test types" as a contiguous phrase (the subject is "it", not "the pipeline", at line 334); the "and verifies..." half is a separate bullet four items later in an unrelated list at line 361-362, with no "and" preceding it — the quotation stitches two non-adjacent CLAUDE.md passages into one and adds a connective word neither contains.

2. record: DEC-20260313-C.md
   line: 80
   class: MISQUOTE
   record_text: "still listed, signal absent rather than faked"
   source: the row's Rationale and Decision fields (page `32267c87082c8189a74ac57214ba5bec`)
   source_text: "Distinct from 'Building track record' (tests exist, not enough runs). 'Unverified' = structurally can't test. Honesty, market incentive for Phase 2 providers, no removal of working functionality." (Rationale); "Show 'Unverified' SQS with capability still listed" (Decision)
   correction: the row never states "still listed, signal absent rather than faked" as a phrase; "still listed" comes from the Decision field and "signal absent rather than faked" is the record's own synthesis of the honesty rationale, presented as if it were the row's own words.

3. record: DEC-20260314-F.md
   line: 69
   class: MISQUOTE
   record_text: "five free capabilities via MCP without auth"
   source: the row's Rationale field (page `32367c87082c81bfaf90c949e06b8594`)
   source_text: "Applied to: Sprint 9F (elevated to 5 free capabilities via MCP without auth)..."
   correction: the row writes the count as the digit "5", not the spelled-out word "five"; the quotation silently changes the source's numeral to a word.

4. record: DEC-20260315-H.md
   line: 74
   class: MISATTRIBUTED
   record_text: "Quality floor ... armed in prod"
   source: CLAUDE.md (searched in full)
   source_text: not present — CLAUDE.md's DEC-20260812-A entry reads only "quality floor quarantine <70% / deactivate <30% on ≥10 real calls/30d, auto-promote on recovery"; the phrase "armed in prod" does not appear anywhere in CLAUDE.md. The closest repository text is `apps/api/src/routes/do.ts`'s comment "the quality floor is armed in production" (three occurrences), a different file and a different wording than what is attributed to CLAUDE.md.
   correction: attribute "armed in production" to `apps/api/src/routes/do.ts` (e.g. line 1771), not to CLAUDE.md, or drop the quotation marks and state the fact in prose; CLAUDE.md does not contain this phrase.

5. record: DEC-20260316-B.md
   line: 88
   class: MISQUOTE
   record_text: "letters as secondary, never the primary headline"
   source: the row's Decision/Rationale (page `32567c87082c819790a6d7786e80e78a`)
   source_text: "QP and RP letter grades shown as compact secondary context (bottom-left) to explain why the SQS is what it is." / Decision title: "SQS display hierarchy: number+word headline, QP/RP letters as secondary detail only"
   correction: no source reads "letters as secondary, never the primary headline" verbatim; it is the record's own paraphrase of the row's hierarchy rule, presented in quotation marks as if it were the row's or another source's exact words.

6. record: DEC-20260317-F.md
   line: 87
   class: MISATTRIBUTED
   record_text: "armed in prod, not dry-run"
   source: CLAUDE.md (searched in full)
   source_text: not present — see finding 4 above; the same phrase, same missing source, in a second record.
   correction: same as finding 4 — this phrase is not in CLAUDE.md; the closest repository text is `apps/api/src/routes/do.ts`'s "the quality floor is armed in production."

7. record: DEC-20260318-A.md
   line: 53
   class: MISATTRIBUTED
   record_text: "the workflow that scales to third-party providers"
   source: CLAUDE.md:399, and the row's own Rationale (page `32767c87082c810581aefd19d1af8f34`)
   source_text: CLAUDE.md:399: "Everything else is auto-generated. This is how the platform scales to third-party providers." Row's own Rationale: "The old path doesn't scale to third-party providers."
   correction: this record attributes the quotation to "the row's own text," but the row's Rationale says the opposite (the old path does NOT scale); the phrase actually comes from CLAUDE.md line 399, which reads "the platform scales," not "the workflow scales." The same phrase is correctly sourced from a different row (DEC-20260318-B's own Rationale, which does read "This is the workflow that scales to third-party providers" verbatim) — DEC-20260318-A's record appears to have borrowed DEC-20260318-B's quotation and misattributed it to its own row.

8. record: DEC-20260320-A.md
   line: 84-85
   class: FALSE_CLAIM
   record_text: "A repository search for `db.insert(capabilities)` and `INSERT INTO capabilities` outside `apps/api/scripts/archive/` finds one production call site: `apps/api/src/lib/capability-persistence.ts`... No other current code path inserts a capability row"
   source: repository-wide grep, `apps/api/src`
   source_text: not present as described — `grep -rln "db.insert(capabilities)\|INSERT INTO capabilities" apps/api --include=*.ts` (excluding `apps/api/scripts/archive/`) returns roughly 25 additional files, all `*.integration.test.ts` fixture-setup call sites (e.g. `capabilities.integration.test.ts`, `do.receipt.integration.test.ts`, `solution-reservations.integration.test.ts`, and more), plus a doc-comment mention in `capability-manifest.ts`. Also, `capability-persistence.ts` itself uses `tx.insert(capabilities)`, not the literal string "db.insert(capabilities)" the stated search pattern names.
   correction: the described search, run literally, returns roughly 25 hits, not one; the claim holds only if "production call site" is read to silently exclude every integration-test fixture insert, which the record's stated methodology does not say it did.

9. record: DEC-20260323-A.md
   line: 69
   class: MISQUOTE
   record_text: "read-time decay eliminated, write-time decay in force"
   source: the row's Decision/Rationale (page `32c67c87082c81719ea5f67617482c43`)
   source_text: Decision: "All trust data served from DB columns. Write-time decay only. One score everywhere." Rationale: "...catalog endpoints read cached DB column (no read-time decay)..."
   correction: no source reads "read-time decay eliminated, write-time decay in force" as a phrase; it is the record's own summary of the row, presented as "the row states" when the row's actual wording is "Write-time decay only" / "no read-time decay."

10. record: DEC-20260409-D.md
    line: 108-109
    class: MISQUOTE
    record_text: "one representative solution per category against canonical test inputs"
    source: the row's Rationale field (page `33d67c87082c8118af3bf12a823aa540`)
    source_text: "Runs weekly on one representative solution per category (KYB, validation, extraction, generation, etc.) against canonical test inputs."
    correction: the row's text has a parenthetical example list ("(KYB, validation, extraction, generation, etc.)") between "category" and "against" that the quotation silently drops without an ellipsis marker; add "..." or restore the parenthetical.

### Not findings

- DEC-20260320-A.md line 96: `"The last two dimensions [reliability and limitations] were added per DEC-20260423-B (Stage A, warning mode)... 34 caps shipped to prod with NULL reliability."` — the bracketed `[reliability and limitations]` is an editorial insertion not present verbatim in `apps/api/src/lib/capability-readiness.ts`'s comment, but square brackets are the standard convention for a reader-inserted clarification inside a quotation, not a claim that the source itself contains those words; the rest of the quotation (before and after the ellipsis) is faithful. A stricter reviewer applying the letter of the normalization rule (which strips brackets along with all other punctuation) could flag this as a word inserted; I did not, because the bracket marks it as an addition.
- DEC-20260404-A.md: `"what the API actually returns — no retired concepts (the SQS scoring engine was [deleted])"` — same bracket-insertion pattern (`packages/mcp-server/src/tools.ts:10-11` actually reads "...the SQS scoring engine was deleted in DEC-20260503-B) and no hardcoded catalog counts, which drift"); the record's `[deleted]` truncates and closes the parenthetical early. Not flagged for the same reason as above, but a stricter reviewer could disagree.
- DEC-20260330-B.md: the entire "Rule 12 reads..." paragraph is stale relative to `context7.json`'s actual current content (already fixed by commit `f93355a`, PR #530) — already withdrawn by `DEC-20260905-B` item 2, so not re-flagged here, but noted because the record's framing ("This is a live finding, not something this record corrects") is itself now wrong given the withdrawal.

### Unverifiable

- DEC-20260313-F.md's claim that `packages/mcp-server/package.json` states `"version": "0.2.8"` and `server.json` states `"version": "0.2.3"` was verified true against files in the pinned worktree, but whether these are still the current published/live values depends on npm registry and MCP registry state at a later date than the commit pin — not re-checked against the live registries, only against the repository at the pinned commit.
- DEC-20260317-A.md's claim that `docs/company/DAILY-RUN.md` is "authoritative since 2026-08-22" and that no cron trigger exists for `daily-digest.ts` (`find .github/workflows -iname "*.yml" | xargs grep -ln "digest"` returns nothing) is a true statement about this repository's `.github/workflows`, but does not rule out an external cron/scheduler (Railway cron, a third-party scheduler) invoking the script outside version control — the record itself notes this ("its invocation, if any, happens outside version control").
- DEC-20260409-A.md's claim that `NULL_RATIO_RULE_ENABLED` is set to `true` in the live Railway environment (per `config/env-manifest.yaml`'s `set_in: railway`) cannot be confirmed from repository state alone; only the manifest's declared intent was verified, not the live environment variable's value.
- DEC-20260410-A.md's claim that progressive unlock and agent self-signup are "silent (not on the pricing page)" was explicitly left unverified by the record itself, since the pricing page lives in the frontend/`apps/web` surface outside this record's file evidence; same status here.

SWEEP COMPLETE

### Sweep P3

# M2 candidate-set remediation sweep — Partition P3

Partition: P3. Commit: `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`. Record count: 40 (DEC-20260413-A through DEC-20260507-H, per `closing2-P3.txt`).

Script: a Python script (`extract_quotes.py`) walked each record file and regex-extracted every double-quoted span, normalized it per the sweep's convention (transliterate currency/comparison symbols, lowercase, strip all non-alphanumeric characters), and kept spans whose normalized form was 25+ characters, tagged with source line number. For every extracted quote and every repository-state claim I then read the named source (repo file at the pinned commit via a detached worktree at `C:/tmp/strale-sweep-P3`, or a sibling record file) with `grep -n`/`sed -n`/`cat` and did the substring/attribution check by hand; commit SHAs were checked with `git cat-file -t`.

### Coverage

- DEC-20260413-A.md | quotes checked: 6 | claims checked: 4 | findings: 0
- DEC-20260415-A.md | quotes checked: 2 | claims checked: 3 | findings: 0
- DEC-20260415-B.md | quotes checked: 1 | claims checked: 2 | findings: 0
- DEC-20260416-A.md | quotes checked: 4 | claims checked: 5 | findings: 0
- DEC-20260419-A.md | quotes checked: 1 (withdrawn by DEC-20260905-B) | claims checked: 4 | findings: 0
- DEC-20260420-A.md | quotes checked: 1 | claims checked: 5 | findings: 1
- DEC-20260421-J.md | quotes checked: 3 | claims checked: 7 | findings: 0
- DEC-20260421-L.md | quotes checked: 3 | claims checked: 6 | findings: 0
- DEC-20260422-B.md | quotes checked: 3 | claims checked: 4 | findings: 0
- DEC-20260422-C.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260422-D.md | quotes checked: 1 | claims checked: 3 | findings: 0
- DEC-20260422-H.md | quotes checked: 4 (one segment withdrawn scope N/A) | claims checked: 4 | findings: 0
- DEC-20260423-A.md | quotes checked: 0 | claims checked: 4 | findings: 0
- DEC-20260423-B.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260424-A.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260425-A.md | quotes checked: 9 (one segment withdrawn by DEC-20260905-B) | claims checked: 7 | findings: 0
- DEC-20260425-B.md | quotes checked: 5 | claims checked: 3 | findings: 0
- DEC-20260427-A.md | quotes checked: 0 | claims checked: 3 | findings: 0
- DEC-20260427-B.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260427-H.md | quotes checked: 5 | claims checked: 5 | findings: 0
- DEC-20260427-I.md | quotes checked: 13 | claims checked: 8 | findings: 0
- DEC-20260428-A.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260428-B.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260429-A.md | quotes checked: 0 | claims checked: 3 | findings: 0 (1 flagged unverifiable)
- DEC-20260430-A.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260503-A.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260503-B.md | quotes checked: 8 | claims checked: 6 | findings: 0
- DEC-20260504-A.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260504-B.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260504-C.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260505-A.md | quotes checked: 6 | claims checked: 3 | findings: 0
- DEC-20260505-B.md | quotes checked: 8 | claims checked: 5 | findings: 0
- DEC-20260505-C.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260505-G.md | quotes checked: 3 | claims checked: 3 | findings: 0
- DEC-20260505-H.md | quotes checked: 3 | claims checked: 4 | findings: 0
- DEC-20260506-G.md | quotes checked: 4 | claims checked: 4 | findings: 1
- DEC-20260507-D.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260507-E.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260507-F.md | quotes checked: 3 | claims checked: 2 | findings: 0
- DEC-20260507-G.md | quotes checked: 6 | claims checked: 6 | findings: 1
- DEC-20260507-H.md | quotes checked: 4 | claims checked: 4 | findings: 0

### Findings

1. record: DEC-20260420-A.md
   line: 104
   class: MISQUOTE
   record_text: "we still hand-write; just in TS, not SQL files"
   source: docs/decisions/records/DEC-20260511-C.md:39
   source_text: "the project still hand-writes migration logic; just in TS, not SQL files."
   correction: DEC-20260511-C's Rationale reads "the project still hand-writes migration logic; just in TS, not SQL files," not "we still hand-write; just in TS, not SQL files" — the subject and verb phrase were substituted, not merely truncated.

2. record: DEC-20260506-G.md
   line: 85-87
   class: MISATTRIBUTED
   record_text: "DEC-20260507-D` (Kyckr rejected in part because its "sales-gated pricing... collides with DEC-20260506-G no-fixed-cost stance")"
   source: docs/decisions/records/DEC-20260507-F.md:41-42
   source_text: "Sales-gated pricing (no public pay-as-you-go console, no published rates) is recorded as colliding with `DEC-20260506-G`'s no-fixed-cost stance."
   correction: The Kyckr rejection and the "sales-gated pricing... collides with DEC-20260506-G" language belong to `DEC-20260507-F` (the Kyckr-skip-for-v1 record), not `DEC-20260507-D` (the BYO-credentials record, which never mentions Kyckr); DEC-20260506-G.md cites the wrong record id for this quote.

3. record: DEC-20260507-G.md
   line: 82-83
   class: FALSE_CLAIM
   record_text: "Both manifests were added in the same commit as Luxembourg's and Hungary's (2026-05-16, `9ee19282`), one day after `DEC-20260518` batch work"
   source: git log --format="%ad" -1 9ee19282 (2026-05-16); docs/decisions/records/DEC-20260518-F.md frontmatter `decided_at: 2026-05-18`
   source_text: "commit 9ee19282 ... 2026-05-16" / "decided_at: 2026-05-18"
   correction: Commit `9ee19282` is dated 2026-05-16, two days before the `DEC-20260518` batch's 2026-05-18 decision date, not "one day after" it; the manifest commit precedes that batch, it does not follow it.

### Not findings

These were deliberately classified FAITHFUL under this sweep's normalization convention (punctuation, dashes, and case are stripped before comparison, so a truncation closed with different punctuation than the source, with no ellipsis, is not a finding here) even though round 2's stricter, punctuation-sensitive pass (`closing2-review-P3.md`) flagged them:

- DEC-20260413-A.md:61-62 quoting CLAUDE.md "290+ capabilities across 7 verticals (...monitoring)." — round 2 flagged the invented closing period (source has no period there); normalized substring still matches.
- DEC-20260422-H.md:74-75 quoting CLAUDE.md "retired as primary product," — round 2 flagged the invented comma (source has an em dash there); normalized substring still matches.
- DEC-20260425-A.md:181 quoting provenance-builder.ts "'US' if the call invokes a US-hosted model provider," — round 2 flagged the invented comma (source continues with an open parenthesis); normalized substring still matches.
- DEC-20260503-B.md:103-104 quoting test-scheduler.ts "Daily SQS snapshot retired with the SQS engine (DEC-20260503-B)," — round 2 flagged the invented comma (source ends with a period); normalized substring still matches.
- DEC-20260505-A.md:73-74 quoting handoff/README.md "...Do not edit by hand," — round 2 flagged the invented comma (source ends with a period); normalized substring still matches.
- DEC-20260505-B.md:45-46 and DEC-20260505-C.md:44 quoting the row's own Rationale "Implements DEC-20260503-B (SQS public-score retirement)," — round 2 flagged the invented comma (parsed field ends with a period) in both records independently; normalized substring still matches both times.
- DEC-20260507-E.md:79-80 and DEC-20260505-H.md:92-93 quoting DEC-20260508-D.md "resolves the gating condition from DEC-20260505-H," / "...`DEC-20260505-H`." — round 2 flagged that the source continues with an open parenthesis at that point in both cases; normalized substring still matches both times.
- DEC-20260507-G.md:85-88 and DEC-20260507-H.md:76-81 quoting the Bulgaria/Cyprus/Hungary/Luxembourg manifests' limitation title and text plus config/env-manifest.yaml's OPENAPI_ENABLED purpose ("...countersignature," / "Openapi case 151296," / "...is countersigned.") — round 2 flagged three invented punctuation marks (no punctuation, an open parenthesis, and an em dash respectively) in each of the two records; normalized substring still matches all six instances.

I additionally re-verified the two DEC-20260905-B withdrawn-statement corrections that touch this partition (item 3, DEC-20260419-A's "justification comment" misattribution; item 12, DEC-20260425-A's Decision-vs-Rationale misattribution) against the source files directly; both corrections are accurate and neither is repeated as a finding here per the sweep instructions.

### Unverifiable

- DEC-20260429-A.md: "A later Journal correction made this Decision authoritative over DEC-20260430-A's contradictory post-launch self-host statement." DEC-20260430-A.md's own text (line 75) says only that DEC-20260429-A "had already deferred OpenSanctions self-hosting," which reads as confirming rather than contradicting; whatever contradictory statement is referenced appears to live in the Notion source page or a Journal entry outside this repository. Would need the Notion Journal correction page or DEC-20260430-A's original Notion source text to verify.
- DEC-20260427-I.md / DEC-20260505-H.md / DEC-20260507-E.md: current `is_active`/`x402_enabled` state of the 15 paused KYB solutions, and which OpenRegister billing tier (Free/trial Pro/paid Pro) production is currently on. Both require live production database state; all three records already flag this as unconfirmed from repo evidence alone.
- DEC-20260507-D.md: whether "future BYO-endpoint augmentation" language was ever added to or removed from the Counterparty Assurance product page. That page lives in Notion/the marketing site, not this repository; would need the Notion page's edit history.
- DEC-20260415-A.md / DEC-20260415-B.md: whether Section 2.7 (rules 1-9) and the Section 1 personal-account carve-out still exist on the Brand & voice Notion page. Confirmed absent from `docs/company/VOICE.md`, but that file is a narrower repo document, not a mirror of the Notion page; would need direct access to the Notion page's current content.

SWEEP COMPLETE

### Sweep P4

# M2 candidate-set remediation sweep, partition P4

Partition: P4. Commit: c3691079b150c9aecb082af6a9215e7b1d8c7a2b. Record count: 41.
Script: a Python script (`extract_quotes_P4.py`) extracted every double-quoted
span of 25+ normalized characters from all 41 files into a JSON index by
file and line, using the normalization rule given in the sweep prompt
(transliterate special characters, lowercase, strip non-alphanumerics).
Notion rows were pulled in batch via `dump_rows.py PAGE:<id> ...` (one call
covering 21 of the pages cited by this partition, plus targeted follow-ups
and an 8-row spot-check sample for DEC-20260904-A's 76-row list); every
repository-state claim was checked by reading or grepping the named file (or
the whole repository for absence claims) at the pinned commit in the
worktree, and cross-repo evidence was checked against `strale-frontend` at
the cited commit.

### Coverage

- DEC-20260507-I.md | quotes checked: 1 | claims checked: 2 | findings: 0
- DEC-20260507-J.md | quotes checked: 3 | claims checked: 4 | findings: 0
- DEC-20260508-A.md | quotes checked: 1 | claims checked: 4 | findings: 0
- DEC-20260508-D.md | quotes checked: 2 | claims checked: 4 | findings: 0
- DEC-20260510-A.md | quotes checked: 9 (1 already withdrawn by DEC-20260905-B item 5) | claims checked: 3 | findings: 0
- DEC-20260511-B.md | quotes checked: 5 | claims checked: 5 | findings: 0
- DEC-20260511-C.md | quotes checked: 2 (1 already withdrawn by DEC-20260905-B item 6) | claims checked: 6 | findings: 0
- DEC-20260511-D.md | quotes checked: 0 | claims checked: 3 | findings: 0
- DEC-20260511-E.md | quotes checked: 5 | claims checked: 3 | findings: 0
- DEC-20260511-F.md | quotes checked: 5 | claims checked: 5 | findings: 0
- DEC-20260513-A.md | quotes checked: 3 | claims checked: 3 | findings: 0
- DEC-20260513-B.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260513-C.md | quotes checked: 8 | claims checked: 4 | findings: 0
- DEC-20260513-D.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260513-E.md | quotes checked: 2 | claims checked: 3 | findings: 0
- DEC-20260515-A.md | quotes checked: 6 | claims checked: 8 | findings: 1
- DEC-20260515-B.md | quotes checked: 1 | claims checked: 4 | findings: 0
- DEC-20260515-C.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260517-A.md | quotes checked: 0 | claims checked: 5 | findings: 0
- DEC-20260518-A.md | quotes checked: 3 | claims checked: 3 | findings: 0
- DEC-20260518-B.md | quotes checked: 1 | claims checked: 3 | findings: 0
- DEC-20260518-C.md | quotes checked: 2 | claims checked: 3 | findings: 0
- DEC-20260518-D.md | quotes checked: 2 | claims checked: 2 | findings: 0
- DEC-20260518-E.md | quotes checked: 0 | claims checked: 3 | findings: 0
- DEC-20260518-F.md | quotes checked: 0 | claims checked: 0 | findings: 0
- DEC-20260518-G.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260812-A.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260813-A.md | quotes checked: 0 | claims checked: 0 | findings: 0
- DEC-20260815-A.md | quotes checked: 0 | claims checked: 0 | findings: 0
- DEC-20260820-A-WEBSITE-HERO.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260820-E-WEBSITE-SEARCH-WEB.md | quotes checked: 0 | claims checked: 1 | findings: 0
- DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md | quotes checked: 1 | claims checked: 3 | findings: 0
- DEC-20260822-A.md | quotes checked: 0 | claims checked: 6 | findings: 0
- DEC-20260827-A.md | quotes checked: 1 | claims checked: 5 | findings: 0
- DEC-20260831-A.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260901-A.md | quotes checked: 0 | claims checked: 2 | findings: 0
- DEC-20260904-A.md | quotes checked: 4 | claims checked: 8 (76-row list spot-checked, 8 of 76 sampled) | findings: 0
- DEC-20260904-B.md | quotes checked: 1 | claims checked: 6 | findings: 0

### Findings

1. record: DEC-20260515-A.md
   line: 153-156
   class: FALSE_CLAIM
   record_text: "The commit id this row cites, `34036a0`, does not resolve on `main`."
   source: the Notion row for DEC-20260515-A (page `36167c87082c8199bbc9e65480db6f80`), whose `Rationale` and `Source` fields (dumped via `dump_rows.py`) contain no mention of `34036a0` or any commit id anywhere. The commit id `34036a0` is cited only by the sibling row DEC-20260515-B (page `36167c87082c814281dcd2dac911efa0`), whose `Source` field reads "Phase 3 US Topograph 14-state scout (commit 34036a0, doc apps/api/docs/us-topograph-state-scout-2026-05-15.md)" — and DEC-20260515-B.md's own Consequences section correctly makes the identical claim about itself ("The commit id this row cites, `34036a0`, does not resolve on `main`," DEC-20260515-B.md:129).
   source_text: "not present" (in DEC-20260515-A's own row text)
   correction: DEC-20260515-A's own Notion row cites no commit id at all; the `34036a0` citation and its non-resolution on `main` belong to the sibling row DEC-20260515-B, not to DEC-20260515-A — this paragraph (and its evidence-array entry for the same audit doc) was carried over into the wrong record.

### Not findings

- DEC-20260511-E's quotation of `apps/api/src/lib/meta-monitoring.ts`'s staleness-anchor comment renders `'stuck'` (ASCII single quotes) and `2026-05-07 -> 2026-05-11` (ASCII arrow) where the source comment (lines 421-429) uses `"stuck"` (double quotes) and the Unicode `→` arrow. Round 2's `closing2-review-P4.md` flagged this as a byte-level defect. Under this sweep's own normalization rule (strip all non-alphanumeric characters; transliterate `→` to `->`), both quote-mark styles collapse to identical text and `→` normalizes to the same `->` the record already uses, so this is FAITHFUL under the rule this sweep was instructed to apply, not a finding.
- DEC-20260513-D's claim "this record found no limitation entry in the current manifest naming the CVR rate-limit issue" for `danish-company-data`: literally true (the `limitations:` YAML list has only a freshness and a coverage entry, neither about rate limits), but the manifest does document the same rate limit via a separate structured `known_rate_limit:` field (value 50, unit per_day, source_url https://cvrapi.dk/documentation) that the record does not mention. The claim as worded is narrowly correct (it says "limitation entry," a term of art for the `limitations:` list specifically) so this is not classified as false, only noted as a claim that could read as more sweeping than it is.
- DEC-20260518-B's claim that `"Enhanced Due Diligence"` appears in four named files as ordinary compliance vocabulary: two of the four (`risk-narrative-generate.ts`, `manifests/adverse-media-check.yaml`) actually use lower-case "due diligence" rather than title case. Under this sweep's normalization rule (case is stripped by lowercasing before the substring test), this is FAITHFUL, not a finding; noted because a stricter, case-sensitive reviewer could flag it.
- DEC-20260513-C's rendering of the `findOverdueSuites` SQL predicate without the source's outer parentheses around `(abs(hashtext(...)) % 60)`: this is inline backtick code, not a double-quoted attributed quotation, and operator precedence is unchanged either way. Not in scope of the quotation rule; not a finding.
- DEC-20260510-A's and DEC-20260904-A's dated counts (handoff file counts, `m2-closure-register.yaml`'s `not_yet_reconciled`/`intentionally_historical`/`private_rows.count` figures): all confirmed as STALE_COUNT — accurate at the commit where each record's transition happened, moved further by later batches (DEC-20260510-A's file-count quote is separately already withdrawn by DEC-20260905-B item 5), and each record either dates the figure explicitly or is a point-in-time delta claim rather than a claim about the current pinned-commit state.

### Unverifiable

- DEC-20260508-A's evidence-array URL `https://occsz.e-cegjegyzek.hu/Utmutatok/ÁSZF_IM_disztributor_20250312.pdf` (accented Á) versus the Notion row's own `Source` field, which has the same URL without the accent. Not a quotation (no quote marks), so outside the byte-for-byte rule; resolving which form is the live resource would need a network fetch this review's read-only, no-network scope does not permit.
- DEC-20260508-D's and DEC-20260827-A's claims about whether OpenRegister is currently billed on a paid Pro subscription, and whether `austrian-company-data`'s `x402_enabled` database flag matches its manifest/PR-described activation: both are production-database facts with no read access available to this review; both records already disclaim the same limitation themselves.
- DEC-20260904-A's evidence citation of the private preservation archive at commit `995cece3fe4abfb8b0bef0cccbd58191a6dab83c` and the exact 76-row population measured by `scripts/m2-closure-apply-g1-rule.mjs` against that private archive: the private archive is not part of this repository's tracked history available to this worktree, so the full 76-row match (only 8 of 76 were spot-checked against the public `page_id -> historical ID` mapping, all matching) could not be exhaustively re-derived from source; treated as verified by spot-check, not by full recomputation.

SWEEP COMPLETE

### Sweep P5

# M2 candidate-set remediation sweep — Partition P5

Partition: P5. Commit: `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`. Record count: 34
(list: `scratchpad/closing2-P5.txt`). Script: a Python normalizer
(`scratchpad/extract_quotes_p5.py`) extracted every double-quoted span of 25+
normalized characters per record with its line number, transliterating
EUR/x/>=/<=/->/... and stripping non-alphanumerics before the substring test;
a second helper (`scratchpad/checkq.py`) ran the same normalization against a
named source file or dumped Notion field to test FAITHFUL/MISQUOTE, splitting
on `...` per the convention. Notion rows were dumped once via
`dump_rows.py <out> PAGE:<id> ...` for all 34 page ids named in the
`--notion-<id>` filenames, then read per-field from the JSON (no regex-slicing
of the raw export). Every repository-state claim was checked by directly
reading or grepping the named file(s) at the pinned worktree
(`C:/tmp/strale-sweep-P5`), and by `git grep` across the whole tree for
absence/no-callers claims. Frontend claims resolved against
`strale-io/strale-frontend@04c9fca9` via `git show <sha>:<path>` in the
sibling checkout.

### Ledger

Format: `<file>:<line> | Q/C | <span/claim> | <source> | <verdict>`. File
names abbreviated to their distinguishing suffix after `DEC-` for width;
full names are in the partition list order below.

#### DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md (failed_requests table)
- L4 | Q | "Add failed_requests table to MVP schema. Log every no_matching..." | row Decision field | FAITHFUL
- L39 | Q | "Here are 47 requests for Finnish company data this month at avg..." | row Rationale field | FAITHFUL
- L66 | Q | "to capture unauthenticated free-tier failures," | apps/api/src/db/schema.ts:680 comment | FAITHFUL
- L76 | Q | "one INSERT on the failure path" (framing) | row Rationale ("one INSERT on failure path") | MISQUOTE — withdrawn by DEC-20260905-B item 13, not a fresh finding
- L82 | Q | "DEC-20260225-P-c5d6: 6th table, failed_requests (...) logs every..." | CLAUDE.md:270 | MISQUOTE (comma for em dash) — withdrawn by DEC-20260905-B item 13, not a fresh finding
- L60 | C | schema.ts defines failedRequests table with named + additional columns | apps/api/src/db/schema.ts:678-697 | TRUE
- L66 | C | userId nullable "to capture unauthenticated free-tier failures" per schema comment | apps/api/src/db/schema.ts:680 | TRUE
- L74 | C | do.ts inserts into failedRequests at four call sites | apps/api/src/routes/do.ts:935,1163,1207,1265 | TRUE
- L79 | C | CLAUDE.md carries this row verbatim, schema comment references DEC id | CLAUDE.md:270; schema.ts:678 | TRUE

#### DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md (GTM strategy)
- L4 | Q | "GTM strategy: Demo-first, no community credibility required..." | row Decision field | FAITHFUL
- L81 | Q | "Dev.to #1... 'How We Score 297 Agent Data Capabilities'" | archive/growth-ops/tweets-v2.md:24 | FAITHFUL (ellipsis-split, each side a substring in order)
- L82 | Q | "Dev.to #2... 'Give Your LangChain Agent Verified Data in 3 Lines'" | archive/growth-ops/tweets-v2.md:25 | FAITHFUL
- L91 | Q | "in the Show HN or outreach emails" | archive/sessions/strale-spike-correlation-analysis-2026-04-08.md:240 | FAITHFUL
- L98 | Q | "a second top-up" | docs/company/GOALS.md:430 ("...watch for a second top-up") | FAITHFUL (substring)
- L54 | C | packages/langchain-strale and packages/crewai-strale exist | both directories present at commit | TRUE
- L61 | C | no committed dev.to/Hashnode/youtube artifact demonstrates a shipped video/post | git grep across repo finds no such artifact (only unrelated capability-name hits for "youtube") | TRUE
- L67 | C | archive/README.md references devto-sqs-methodology.md and a dev.to fact-check pass | archive/README.md:29-30 | TRUE
- L75 | C | no Show HN submission committed | no file found | TRUE (negative, unverifiable beyond repo)
- L82 | C | GOALS.md discusses "a second top-up" for a specific 2026-08 customer | docs/company/GOALS.md:425-435 | TRUE

#### DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md (smart-input discovery UX)
- L4 | Q | "Solution discovery UX: smart input with AI recommendation card..." | row Decision field | FAITHFUL
- L59 | Q | "Not what you need? Tell me more" (expansion phrase) | frontend RecommendationCard.tsx:389 | FAITHFUL
- L75 | Q | "maps directly to `POST /v1/suggest`" | row Rationale field | FAITHFUL
- L81 | Q | "rotating placeholder examples" | row Rationale field | FAITHFUL
- L82 | Q | "`GET /v1/suggest/typeahead` and the SQS engine itself is gone," | frontend SearchHero.tsx:74 comment | FAITHFUL
- L94 | Q | "Not what you need? Tell me more →" | frontend RecommendationCard.tsx:389 | FAITHFUL (arrow included)
- L94 | Q | "Try/Details/Copy actions" | row Rationale field | FAITHFUL
- L73 | C | suggest.ts defines both GET /v1/suggest/typeahead and POST /v1/suggest, both public/no-auth | apps/api/src/routes/suggest.ts:43-84 | TRUE
- L79 | C | SearchHero.tsx has placeholderIdx rotating through PLACEHOLDER_QUERIES | frontend@04c9fca9 SearchHero.tsx:11,44,82,188 | TRUE
- L87 | C | RecommendationCard.tsx renders "Copy code" action with Copy icon | frontend@04c9fca9 RecommendationCard.tsx:3,278,295 | TRUE

#### DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md (Problem→Solution SVG diagrams)
- L4 | Q | "Problem→Solution section uses SVG diagrams + bullet lists, no code blocks" | row Decision field | FAITHFUL
- L55 | Q | "(today's DIY integration work)" | row Rationale field | FAITHFUL
- L56 | Q | "(Strale) communicate the problem/solution gap visually, faster..." | row Rationale field | FAITHFUL
- L61 | Q | "tangled multicolor vs clean green" | row Rationale field | FAITHFUL (record hedges it did not re-verify colour pixel-by-pixel; current StraleDiagram.tsx primary colour is hsl(225,42%,52%), blue not green — not a finding since the record only claims fidelity to the row's own words, not to current pixels)
- L60 | C | ProblemSection.tsx imports TodayDiagram/StraleDiagram/VerdictChips, defines painChips/benefitChips, no `<pre>`/`<code>` | frontend@04c9fca9 ProblemSection.tsx:2-4,8-21 | TRUE
- L71 | C | two-diagram contrast structure (Today vs Strale) matches row's pairing | frontend@04c9fca9 TodayDiagram.tsx (5 distinct hues), StraleDiagram.tsx (single "primary" hue) | TRUE (structurally; colour-literal "green" not independently reverified, as the record itself states)

#### DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md (Homepage v2.1 polish)
- L4 | Q | "Homepage v2.1 polish: comparison back to #2, remove Built for Agents..." | row Decision field | FAITHFUL
- L38 | Q | goes from 11 to 10 sections | row Rationale field ("Page goes from 11 to 10 sections") | FAITHFUL
- L75 | Q | "maps directly to..." — n/a (not present here; see DEC-20260303-A) | — | —
- L93 | Q | "goes from 11 to 10 sections" | row Rationale field | FAITHFUL
- L93 | C | Index.tsx has exactly 10 numbered sections in the stated order | frontend@04c9fca9 Index.tsx: 10 numbered `{/* N. ... */}` comments | TRUE
- L100 | Q | "Solutions showcase (with discovery demo folded in)" | frontend Index.tsx:215 comment | FAITHFUL
- L103 | C | "Built for Agents" absent from Index.tsx | git grep in frontend@04c9fca9 finds no match | TRUE
- L106 | C | Three-steps section 9 renders buildSteps() as a compact strip (Try it free / Unlock everything / Your agent calls strale.do()) | frontend@04c9fca9 Index.tsx:65-69,278 | TRUE
- L111 | C | Integrations tabbed via Tabs/TabsList/TabsTrigger/TabsContent at section 7 | frontend@04c9fca9 Index.tsx:17,73,245-265 | TRUE
- L117 | C | Comparison is section 4, not #2; section 2 is Solutions showcase — a direct discrepancy the record flags itself | frontend@04c9fca9 Index.tsx numbered comments | TRUE (discrepancy honestly reported)
- L121 | Q | `DEC-20260303-G` ("Homepage restructure: 11-section order") attributed to CLAUDE.md's Current Decisions list | CLAUDE.md:281 at pinned commit reads "Historical eleven-section homepage order; superseded for the apps/web redesign by DEC-20260905-A..." — the quoted string does not appear; commit `413974d8` (2026-09-05, an ancestor of the pinned commit) rewrote that line the same day this M2 batch ran | **MISQUOTE — FRESH FINDING #1** (see Findings)
- L126 | Q | "Static discovery" / "Solutions showcase (with discovery demo folded in)" | frontend Index.tsx:215 | FAITHFUL

#### DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md (Hide component prices)
- L4 | Q | "Hide component prices in discovery UI" | row Decision field | FAITHFUL
- L38 | Q | "€1.50 solution + €0.80 capability" | row Rationale field | FAITHFUL
- L38 | Q | "36% markup" / "€1.50 for KYC verification" | row Rationale field | FAITHFUL
- L43 | Q | "trust data must never be displayed with false confidence" | sibling record DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md title | FAITHFUL
- L78 | Q | "No component_sum_cents in any discovery API response" | row Rationale field | FAITHFUL
- L60 | C | TypeaheadResult.price_cents: number|null with comment "null for capabilities (DEC-20260304-A)" | frontend@04c9fca9 types/index.ts:109 | TRUE
- L67 | C | SuggestRecommendation/TypeaheadResult carry no component_sum_cents | frontend@04c9fca9 types/index.ts:103-161 (no field) | TRUE
- L73 | C | component_sum_cents exists on SolutionDetail and api.ts normalizer but is not rendered on Solutions.tsx/SolutionDetail.tsx | frontend@04c9fca9 types/index.ts:70, api.ts:163,283; no match in Solutions.tsx/SolutionDetail.tsx | TRUE
- L83 | C | Solutions.tsx sorts/displays by price_cents; no capability-level price rendering found | frontend@04c9fca9 Solutions.tsx:75,83 | TRUE

#### DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md (Stats bar swap)
- L4 | Q | "Stats bar: swap 27 Countries for 15 Solutions" | row Decision field | FAITHFUL
- L26 | Q | "27 Countries" implies geographic verticals... "15 Solutions" | row Rationale field | FAITHFUL
- L55 | Q | "stat exists on the homepage stats bar in any form." — descriptive header, not itself a source quote | — | —
- L60 | Q | not literally labelled "15 Solutions" today — record's own framing, no external quote here | — | —
- L64 | Q | "Cert-audit Y-1+Y-3: capability count and free-tier count read from PLATFORM_FACTS. Hardcoding '270+ capabilities' + '5 free' drifted — production showed 97 visible caps and a different free-tier list. 'workflows' + 'automated tests' stay hardcoded for now..." | frontend@04c9fca9 StatsStrip.tsx:12-17 comment | FAITHFUL (byte-for-byte incl. em dash)
- L70 | Q | "15 Solutions" wording | row Decision field | FAITHFUL
- L58 | C | buildStats() returns exactly 4 stats: workflows(100,hardcoded), capabilities(live), automated tests(1500,hardcoded), free—no signup(live); no Countries stat | frontend@04c9fca9 StatsStrip.tsx:19-25 | TRUE

#### DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md (Kill DIY calculator)
- L4 | Q | "Kill 'Compare with DIY' cost calculator feature" | row Decision field | FAITHFUL
- L34 | Q | "Components individually: €1.10. Solution: €1.50 with orchestration," | row Rationale field (period, not comma, at that point) | FAITHFUL (trailing punctuation adapted for embedding, not a finding per convention)
- L36 | Q | "€1.50 vs 2 weeks of integration work" | row Rationale field | FAITHFUL
- L41 | Q | "never show component sum" | row Rationale field ("Rule 1: never show component sum") | FAITHFUL
- L46 | C | no "calculator"/"Compare with DIY" component anywhere under frontend src/ | git grep across frontend@04c9fca9 src/ — zero hits | TRUE
- L51 | C | SuggestRecommendation carries no component_sum_cents | frontend@04c9fca9 types/index.ts:132-147 | TRUE
- L56 | C | component_sum_cents exists on SolutionDetail/api.ts but not rendered, same distinct-surface field as the sibling record | as above | TRUE

#### DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md (Trust card monitoring-dashboard redesign)
- L4 | Q | "Trust verification card redesigned as monitoring dashboard panel, not product card" | row Decision field | FAITHFUL
- L30 | Q | "quality infrastructure" / "product recommendation" | row Rationale field (single-quoted there) | FAITHFUL
- L44 | Q | "here is quality infrastructure data" / "here is a suggested product to buy." | row Rationale field | **MISQUOTE — FABRICATED, FINDING (confirms round-2 Finding 1)**: row's Rationale contains only the short single-quoted phrases 'quality infrastructure' and 'product recommendation'; these longer double-quoted sentences do not appear anywhere in the row
- L61 | Q | "Show 'Unverified' SQS with capability still listed," | docs/decisions/records/DEC-20260313-C.md title (no trailing comma there) | FAITHFUL (punctuation-only difference)
- L57 | C | TestRunLog.tsx renders monospace pass-rate log with getPassRateColorClass, border-b border-border | frontend@04c9fca9 TestRunLog.tsx:6,172-173,181 | TRUE
- L67 | C | sparkline/border/"Example"-label removal not independently confirmed — record itself hedges this | no discrete elements found; honestly flagged | TRUE (honest non-finding)

#### DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md (Trust data no false confidence)
- L4 | Q | "Trust data must never be displayed with false confidence" | row Decision field | FAITHFUL
- L37 | Q | "a trust violation worse than showing nothing." | row Rationale field | FAITHFUL
- L74 | Q | "Trust display centralization" / "Metric consistency" | CLAUDE.md:282-283 | FAITHFUL
- L84 | Q | "Every component rendering trust data must call getTrustDisplayState() first," | frontend@04c9fca9 trust-display.ts comment | FAITHFUL
- L91 | Q | "the worst of (SQS grade, freshness grade, latency grade)," | apps/api/src/lib/trust-grade.ts:211 ("Combined grade = worst of (...)", no "the") | **MISQUOTE — FINDING (confirms round-2 Finding 2)**: "the" inserted before "worst of"
- L93 | Q | "Reference data (stale: Nd since update, cycle Nd)." | apps/api/src/lib/trust-grade.ts:89 (actual: `Reference data (stale: ${Math.round(ageDays)}d since update, cycle ${cycle}d)`, a template literal, never the literal text "Nd") | **MISQUOTE — FRESH FINDING (minor)**: "Nd" is a paraphrase placeholder presented as a literal label string; the literal characters "Nd" never appear in the source
- L88 | C | public-trust.ts and trust-grade.ts carry no field literally named data_confidence | git grep for `data_confidence` in both files — zero hits | TRUE
- L99 | C | circuit breakers corroborated by DEC-20260306-D.md and "this batch's sibling records citing apps/api/src/lib/circuit-breaker.ts" | docs/decisions/records/DEC-20260306-D.md contains zero mentions of "circuit" or "breaker" (it is about metric-display consistency, six unrelated issues); apps/api/src/lib/circuit-breaker.ts exists but is not cited by any record in this 34-file partition | **FALSE_CLAIM — FRESH FINDING**: the specific corroboration-by-citation claim is unsupported by the named record

#### DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md (auto-register .d.ts filter + health gate)
- L4 | Q | "Hotfix: auto-register must filter .d.ts declaration files + startup health gate (MIN_EXPECTED_EXECUTORS = 200)" | row Decision field | FAITHFUL
- L38 | Q | classified it as "unknown" since "no executor" was not a recognized failure pattern | row Rationale field | FAITHFUL
- L69 | Q | "The previous filesystem-glob discovery pulled in test files (`.test.ts`) and any unrelated `.ts` file, producing spurious errors and masking real failures. Manifest is the source of truth — matching validate-capability, onboard, and smoke-test." | apps/api/src/capabilities/auto-register.ts:19-22 header comment | FAITHFUL (byte-for-byte)
- L60 | C | neither the .d.ts filter nor MIN_EXPECTED_EXECUTORS nor a process.exit(1) FATAL gate exists in auto-register.ts | confirmed true narrowly of that one file | TRUE (narrowly, of that file only)
- L60 | C | (broader framing) "this row's specific fix and its startup gate moot rather than wrong" / mechanism doesn't exist under current architecture | **FALSE.** `apps/api/src/index.ts:10` defines `const MIN_EXPECTED_EXECUTORS = 200;` verbatim, and `index.ts:19-30` implements exactly the described gate: it calls `getRegisteredCount()` after `autoRegisterCapabilities()`, throws `StartupFatalError` if `count < MIN_EXPECTED_EXECUTORS`, and `main().catch` at `index.ts:345-394` always calls `process.exit(1)`. The mechanism is live in production under a different, unlisted evidence file — **FALSE_CLAIM — the most significant finding in this partition (confirms round-2 Finding 3)**

#### DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md (au-company-data ABR onboarding)
- L4 | Q | "au-company-data capability onboarded via ABR API (Australian Business Register)" | row Decision field | FAITHFUL
- L72 | Q | "regex-based XML parsing (no new dependency)" | row Rationale field | FAITHFUL
- L89 | Q | "ABR API GUID obtained, capability onboarded through the full Onboarding Pipeline (DEC-20260320-B)." | row Rationale field | FAITHFUL
- L64 | C | manifests/au-company-data.yaml: category company-data, price_cents 5, is_free_tier false, data_source ABR, data_source_type api | manifests/au-company-data.yaml:6,10,11,33,69-70 | TRUE
- L64 | C | executor implements regex ABN validator (ABN_RE), calls ABR XML SOAP endpoint | apps/api/src/capabilities/au-company-data.ts:9,13 | TRUE
- L69 | C | env var renamed ABR_AUTH_GUID → ABN_LOOKUP_GUID; executor and env-manifest use only the new name | apps/api/src/capabilities/au-company-data.ts:4,17,20; config/env-manifest.yaml:20 (no ABR_AUTH_GUID trace) | TRUE
- L83 | C | this record is related_to DEC-20260320-B, which exists as a formal record | docs/decisions/records/DEC-20260320-B.md present | TRUE

#### DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md (Dynamic methodology counts)
- L4 | Q | "Dynamic methodology text: capability counts, solution counts, and test suite counts must never be hardcoded. Always query live data." | row Decision field | FAITHFUL
- L69 | Q | "Drift problem (cert audit 2026-04-30)" | apps/api/src/lib/platform-facts.ts:7 comment | FAITHFUL
- L70 | Q | "free-tier list: 5 in marketing, 11 in manifests, 5 different in production." | apps/api/src/lib/platform-facts.ts:15-16 | FAITHFUL
- L77 | Q | "Live values (capability counts, country counts, free-tier slugs) are computed from the DB on demand and cached at the route layer." | apps/api/src/lib/platform-facts.ts:19-21 | FAITHFUL
- L64 | C | platform-facts.ts computes capability_counts/solution_count_active from DB, not a constant | apps/api/src/lib/platform-facts.ts header/architecture section | TRUE
- L69 | C | frontend Methodology.tsx does not display capability/solution/test-suite counts; only reads facts?.static.vendors.sanctions | frontend@04c9fca9 Methodology.tsx:91-92 (only field read from usePlatformFacts) | TRUE

#### DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7.md (pep-check transparency tag)
- L4 | Q | "pep-check uses transparency tag mixed instead of commercial_data" | row Decision field | FAITHFUL
- L64 | Q | "`pep-check` — ... Transparency: algorithmic," | CLAUDE.md:312 | FAITHFUL (ellipsis-compressed, each side a substring in order)
- L57 | C | manifests/pep-check.yaml declares transparency_tag: algorithmic, not mixed or commercial_data | manifests/pep-check.yaml:136 | TRUE
- L57 | C | this record cannot determine when/why the tag changed from mixed to algorithmic; no commit found | honestly flagged as unresolved | UNVERIFIABLE (repo history search inconclusive, correctly reported as such)

#### DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md (KYB+Invoice Verify complete)
- L4 | Q | "KYB + Invoice Verify implementation complete — 60 solutions, 3 capabilities, all docs updated" | row Decision field | FAITHFUL
- L78 | Q | "split out of seed-solutions.ts on 2026-08-16 so the definitions can be imported, validated and tested" | apps/api/src/db/solution-catalogue.ts header comment | FAITHFUL
- L86 | Q | "Seed 60 new solutions (KYB Essentials, KYB Complete, Invoice Verify) across 20 countries, and deprecate 5 old solutions" | apps/api/scripts/seed-kyb-solutions.ts header | FAITHFUL
- L75 | C | manifests/pep-check.yaml, adverse-media-check.yaml, risk-narrative-generate.yaml all present | all three exist at commit | TRUE
- L80 | C | solution-catalogue.ts has zero kyb-essentials-*/kyb-complete-*/invoice-verify-* slugs; git log -S"kyb-essentials" against both files returns no commit | confirmed: 0 grep hits, empty git log -S output | TRUE
- L88 | C | drop-aggregator-kyb.ts soft-deactivates 15 (5 countries × 3 families); drop-sg-kyb.ts soft-deactivates 3; 18 total accounted for | apps/api/scripts/archive/drop-aggregator-kyb.ts:13-16; drop-sg-kyb.ts:2-4 | TRUE (18 = 15+3, matches record's own arithmetic, despite the aggregator script's own header line separately and inconsistently saying "18 solutions across 6 jurisdictions" before listing only 15 — that internal inconsistency is the script's own, not this record's)
- L96 | C | 42 of 60 solutions remain unaccounted for; cannot confirm production is_active state | honestly flagged as unconfirmable from repo alone | UNVERIFIABLE (production DB state)

#### DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md (Free-tier showcase protection)
- L4 | Q | "Free-tier showcase protection: 5 free-tier capabilities get dedicated meta-monitor alerting on any quality degradation. These are the front door." | row Decision field | FAITHFUL
- L63 | Q | "Free-tier: 11 capabilities as of 2026-08 (email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate, plus 6 crypto address validators: bitcoin/eth/solana/tron/dogecoin/xrp-address-validate) require no auth/signup." | CLAUDE.md:326 | FAITHFUL (byte-for-byte)
- L67 | Q | "free-tier list: 5 in marketing, 11 in manifests, 5 different in production," | apps/api/src/lib/platform-facts.ts:15-16 | FAITHFUL
- L76 | Q | "SQS scoring engine deleted per DEC-20260503-B (PR1 shipped 2026-05-05)... the automatic lifecycle transitions (probation→active, active→degraded, degraded→active, degraded→suspended) are all gone." | CLAUDE.md:324 | FAITHFUL (ellipsis-compressed, each side verified)
- L58 | C | this record cannot determine which of today's 11 free-tier capabilities match the row's original 5; iban-validate remains free-tier | manifests/iban-validate.yaml:13 (is_free_tier: true) | TRUE
- L64 | C | SQS-90 threshold mechanism cannot exist today because SQS score doesn't exist | consistent with CLAUDE.md:324's SQS-deletion statement | TRUE

#### DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md (Solution execution transaction storage model)
- L4 | Q | "DEC-20260405-B: Solution execution transaction storage model and Phase 1.4 migration tooling workaround" | row Decision field | FAITHFUL
- L60 | Q | (relations-paragraph quote) "`DEC-20260405-B` explicitly specified per-step `latencyMs` as required," attributed to the sibling DEC-20260406-A row's own Rationale — not this row | this record's own prose accurately describes the sibling's claim, not this row's Rationale | FAITHFUL (correctly attributed to the other record, not misattributed here)
- L80 | Q | "solution executions have no single capability" | apps/api/src/db/schema.ts:333 comment | FAITHFUL
- L82 | Q | "set for solution executions, null for capability executions." | apps/api/src/db/schema.ts:334 comment | FAITHFUL
- L90 | Q | "A solution execution writes one transaction with `capability_id = NULL` and its step outcomes inside an `output.steps` JSONB blob... Verified against production: 694 solution rows, all with a null `capability_id`, and 126 sub-calls in the trailing 30 days recorded nowhere else." | apps/api/src/lib/startup-migrations.ts:2103-2109 (block 0101 comment) | FAITHFUL (ellipsis-compressed, each side verified byte-for-byte)
- L74 | C | transactions.capabilityId nullable, solutionSlug present; no solution_executions/solution_run/parent_transaction table exists | apps/api/src/db/schema.ts:328-335; git grep for the three alternate names finds none | TRUE
- L94 | C | no database-level CHECK constraint for the XOR found in schema.ts or startup-migrations.ts; record does not claim otherwise | honestly flagged as not independently located | UNVERIFIABLE (may be application-layer only)

#### DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md (Deactivate credit-report-summary)
- L4 | Q | "Deactivate credit-report-summary; no free source for Swedish credit ratings exists" | row Decision field | FAITHFUL
- L50 | Q | "Phase 4, a separate decision on `credit-report-summary` (`DEC-20260405-B`, no formal record exists for that id on `main` and it is not in `docs/decisions/id-collisions.yaml`, so it is mentioned here in prose only)." | docs/decisions/records/DEC-20260405-A.md:67-70 | FAITHFUL (byte-for-byte)
- L72 | Q | "DEC-20260405-B / DEC-20260422-SE-D: Swedish credit ratings, credit limits, and risk indicators are proprietary products of commercial bureaus (UC/Enento, Bisnode/D&B, Allabolag). No free government source exists — Bolagsverket is a registry, not a credit bureau." | apps/api/src/capabilities/auto-register.ts:141-143 | FAITHFUL (byte-for-byte)
- L76 | Q | "no free source for Swedish credit ratings exists" | row Decision title | FAITHFUL
- L89 | Q | "Reactivation trigger: licensed credit-bureau contract (UC, Bisnode, Creditsafe), or a Strale solution that synthesises a risk score from Bolagsverket HVD + annual-report iXBRL financials once Årsredovisningsinformation API access is in place (not a 1:1 replacement — a different product, and must be named differently to avoid implying bureau-grade credit data)." | apps/api/src/capabilities/auto-register.ts:145-148 | FAITHFUL (byte-for-byte)
- L36 | C | this row's own Rationale field is null in the source | confirmed: page 34a67c87082c810692c8dd4374a6f9ac has null Rationale in dumped row | TRUE
- L61 | C | auto-register.ts DEACTIVATED map carries "credit-report-summary" with the quoted comment and decided date match | apps/api/src/capabilities/auto-register.ts:140-149 | TRUE
- L67 | C | manifest still on disk, data_source Allabolag.se scrape, price_cents 100 | manifests/credit-report-summary.yaml:10,52-53 | TRUE
- L45 | C | id-collisions.yaml now carries a DEC-20260405-B entry (correcting DEC-20260405-A.md's now-stale prose) | docs/decisions/id-collisions.yaml:140-155 | TRUE

#### DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md (per-step latencyMs fix)
- L4 | Q | "DEC-20260406-A: Fix missing per-step latencyMs capture in solution audit_trail" | row Decision field | FAITHFUL
- L64 | Q | "`DEC-20260405-B` explicitly specified per-step `latencyMs` as required." | this row's own Rationale field | FAITHFUL (correctly attributed as this row's own claim about the other row, not independently re-verified against that other row — record says so explicitly)
- L88 | Q | "wraps each step with `Date.now()` timing on both success and failure branches." | apps/api/src/lib/solution-executor.ts:620-645 pattern | FAITHFUL
- L84 | C | StepTiming interface with latencyMs: number field; pushed on both success/failure branches | apps/api/src/lib/solution-executor.ts:217,626,645 | TRUE
- L87 | C | module header documents the nested-path resolution syntax the sibling DEC-20260406-B collision concerns | apps/api/src/lib/solution-executor.ts:9-13 | TRUE

#### DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md (Consolidate working rules)
- L4 | Q | "Consolidate working rules for Claude (chat), CC, and Notion governance into single source-of-truth page" | row Decision field | FAITHFUL
- L81 | Q | "AMENDS DEC-20260812-A's escalation contract" | docs/company/CHARTER.md:8 ("This AMENDS...") | FAITHFUL (substring)
- L82 | Q | "if they ever diverge, this file is the text and the other two are pointers to it" | docs/company/CHARTER.md:5-6 | FAITHFUL
- L84 | Q | "Working Rules page is the canonical source" | row Rationale field | FAITHFUL
- L86 | Q | "execution records, not project truth," | docs/programs/README.md:4 | FAITHFUL
- L92 | Q | "Notion Governance Rules (enforced)" | CLAUDE.md:192 section heading | FAITHFUL
- L79 | C | CLAUDE.md's Workflow Protocol/Session contract/program register describe a repo-native model absent from this row's Notion-page model | CLAUDE.md opening sections; docs/programs/README.md | TRUE
- L88 | C | CLAUDE.md still restates Notion governance rules ("Check before creating," "ONE page per topic," "Superseded pages archived same session...") alongside the repo-native model | CLAUDE.md:193-197 | TRUE

#### DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md (nested field reference fix)
- L4 | Q | "DEC-20260406-B: Fix nested field reference resolution in solution input mapping" | row Decision field | FAITHFUL
- L81 | Q | "`$input.<field>` — resolves to caller's `inputs[<field>]`" | apps/api/src/lib/solution-executor.ts:10 | FAITHFUL
- L82 | Q | "`$steps[N].<field>` — resolves to step N's `output[<field>]` (0-indexed by execution order)" | apps/api/src/lib/solution-executor.ts:11 | FAITHFUL
- L83 | Q | "`$all_results` — resolves to an object of ALL prior step outputs keyed by slug." | apps/api/src/lib/solution-executor.ts:12 | FAITHFUL
- L86 | Q | "`$input.<path>` → walk path from inputs (supports nested: `$input.company.name`)" | apps/api/src/lib/solution-executor.ts:142 | FAITHFUL
- L87 | Q | "`$steps[N].<path>` → walk path from `completedSteps[N]` (supports nested: `$steps[0].license.spdx`)" | apps/api/src/lib/solution-executor.ts:143 | FAITHFUL
- L76 | C | file exports parsePath() and walkPath(), resolveInputRef() uses both | apps/api/src/lib/solution-executor.ts:76,110,147,160-203 | TRUE

#### DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md (Notion workspace restructure)
- L4 | Q | "Restructure Notion workspace around Operating Manual as single entry point and four-layer model" | row Decision field | FAITHFUL
- L82 | Q | "Notion Workspace Structure (8 sections under Project Home)" | CLAUDE.md:182 | FAITHFUL
- L87 | Q | "four-layer model: canonical pages / databases / archives / not-Strale." | row Context (own restatement) | FAITHFUL
- L97 | Q | "Programs are execution records, not project truth... Project truth lives in `docs/project/` (candidate until M4) and `docs/decisions/`." | docs/programs/README.md:4 (ellipsis-compressed) | FAITHFUL
- L79 | C | CLAUDE.md's 8-section list (🏠🎯🛠️✅📣🔧📓⚙️) does not name an "Operating Manual" page | CLAUDE.md:182-189 | TRUE
- L88 | C | CHARTER.md (DEC-20260815-A) states it governs "day-to-day operation" | docs/company/CHARTER.md:14 | TRUE

#### DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md (Project Home physical tidy)
- L4 | Q | "Project Home physical tidy — canonical set at top level, ~90 pages archived to Archive — Q1 2026" | row Decision field | FAITHFUL
- L33 | Q | "Operating Manual (DEC-20260406-B) established the governance layer. This decision executes the content-layer tidy that the governance layer requires. The pre-tidy state had Failure Mode 2 (supersession without archival) re-emerging within 30 days of the prior governance protocol — fixing it was urgent because a governance layer not backed by a tidy content layer loses credibility fast. The tidy also unblocks Phase 3 content consolidation, which cannot proceed cleanly while ~90 non-canonical siblings obscure the canonical set." | row Rationale field | FAITHFUL (byte-for-byte, full paragraph)
- L68 | Q | "Repo-native migration continuation — pre-cutover" | CLAUDE.md:53 section heading | FAITHFUL
- L69 | Q | "Candidate project documents remain inactive and Notion-backed workflows remain authoritative until the explicit atomic cutover," | CLAUDE.md:62-64 | FAITHFUL
- L77 | Q | "Notion Governance Rules (enforced)" | CLAUDE.md:192 | FAITHFUL
- L79 | Q | "Superseded pages archived same session (prefix + move to archive)," | CLAUDE.md:197 | FAITHFUL
- L57 | C | this is a Notion-workspace state; no file in this repo confirms/denies the ~90-page archive still holding | honestly flagged | UNVERIFIABLE (Notion state, outside repo)

#### DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md (Rule E, no em dashes)
- L4 | Q | "Rule E added to Working Rules: brand voice is institutional and human, no em dashes" | row Decision field | FAITHFUL
- L28 | Q | "the strongest AI tell in 2026." | row Rationale field | FAITHFUL
- L28 | Q | full block quote beginning "The prior memory rule said 'never I built framing...'" through "...duplicate the wording." | row Rationale field (page 33a67c87082c819cabf6d47331d695ce) | FAITHFUL (long block, confirmed byte-for-byte)
- L75 | Q | "Say what it means for the business," | docs/company/VOICE.md:16 | FAITHFUL
- L76 | Q | "Decisions are written as questions you can answer," | docs/company/VOICE.md:19 | FAITHFUL
- L77 | Q | "Say the uncomfortable thing first" | docs/company/VOICE.md:23 | FAITHFUL
- L79 | Q | "internal reports, customer-facing copy, PR descriptions, session summaries — should read" | docs/company/VOICE.md:6-7 | FAITHFUL
- L82 | Q | "Formatting details... stay in strale-content-rules.md" | this row's own Rationale field | FAITHFUL
- L89 | Q | "Say the uncomfortable thing first" | docs/company/VOICE.md:23 | FAITHFUL
- L74 | Q | VOICE.md "states five writing rules ('No jargon, ever,' ...)" | docs/company/VOICE.md's actual first rule at the pinned commit reads "Use audience-appropriate terms (DEC-20260905-A)."; the string "No jargon, ever" does not appear anywhere in the file (confirmed by full-file grep) | **MISQUOTE — STALE, FINDING (confirms round-2 Finding 7)**: VOICE.md was edited the same day (DEC-20260905-A) the pinned commit was cut, replacing that rule
- L67 | C | strale-content-rules.md does not exist at repo root or under docs/company/ | `find . -iname strale-content-rules.md` — zero results | TRUE

#### DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md (Gate 4 solution-level smoke tests)
- L4 | Q | "Gate 4: Solution-level smoke tests in scheduler" | row Decision field | FAITHFUL
- L46 | Q | "all 12 constituent capabilities had clean SQS scores, but the solution was broken end-to-end due to input mapping bugs." | row Rationale field | FAITHFUL
- L50 | Q | "€2.50 × 100 solutions × daily cadence = ~€250/day if all run every 24h" | row Rationale field ("A 12-step KYB solution at €2.50 × 100 solutions × daily cadence = ~€250/day if all run every 24h") | FAITHFUL (substring)
- L52 | Q | "final gate from the SpendLatch incident," | row Rationale field ("Phase 3 hardening, final gate from the SpendLatch incident.") | FAITHFUL
- L80 | Q | "Gate 4 (revised): Four-layer solution test pyramid, free-first" | docs/decisions/records/DEC-20260409-D.md title | FAITHFUL
- L81 | Q | "Original Gate 4 plan was 'run every solution end-to-end on the scheduler,' which would cost ~€1,500/month at full enablement... Most solution bug classes don't actually require live execution to catch." | docs/decisions/records/DEC-20260409-D.md:56-58 | FAITHFUL (byte-for-byte, ellipsis-compressed)
- L86 | Q | "Gate 4b — Solution Dry-Run Composition Check (DEC-20260409-D Layer B)" | apps/api/src/lib/gate4b-solution-dryrun.ts:2 | FAITHFUL
- L89 | Q | "every solution end-to-end on the scheduler" | row Rationale field (embedded in the row's own quote) | FAITHFUL
- L83 | C | DEC-20260409-D's Layer A/B shipped, Layer D (this row's live-execution design) never built | apps/api/scripts confirmed gate4b file exists; DEC-20260409-D.md text | TRUE
- L88 | C | test-scheduler.ts's weekly-sweep is a URL/dependency probe, not a representative-solution execution layer, by its own comment | apps/api/src/jobs/test-scheduler.ts:125-129,662-667 | TRUE

#### DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md (SA.2b PII classification)
- L4 | Q | "SA.2b per-capability PII classification: manifest-declared field + 12-value category enum + heuristic fallback during backfill + blocking gate for new capabilities + 15/15 top backfill shipped" | row Decision field | FAITHFUL
- L42 | Q | "SA.2b.a audit surfaced 6 open questions; all 6 decided and shipped as SA.2b.b (5 commits: B1 migration, B2 runtime, B3 manifest backfill, B4 maintenance_class repair, B5 dutch-company-data fixture repair). F-A-003 (input-coverage bug in detectPersonalData) and F-A-009 (fragile keyword heuristic) both closed in prod as of 2026-04-20." | row Rationale field | FAITHFUL (byte-for-byte)
- L50 | Q | "this one only touches input so we said false" | row Rationale field ("...invites 'this one only touches input so we said false' reasoning...") | FAITHFUL
- L54 | Q | "Warning-phase gates silently become permanent warnings" | row Rationale field | FAITHFUL
- L76 | Q | "DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path semantics), DEC-20260420-C (SA.2a DELETE handler)." | row Rationale field | FAITHFUL
- L102 | Q | "SA.2b.d: heuristic `detectPersonalData` was removed after migration 0050" | apps/api/src/lib/audit-helpers.ts:40 | FAITHFUL
- L111 | Q | "SA.2b.c (full 260-backfill) is blocked on the drift audit." | row Rationale field | FAITHFUL
- L92 | C | all 342 manifests declare processes_personal_data; 127 also declare personal_data_categories | `grep -l processes_personal_data manifests/*.yaml` = 342; `grep -l personal_data_categories manifests/*.yaml` = 127 | TRUE
- L98 | C | onboarding-gates.ts "still enforces PII_CATEGORY_ENUM exactly as this row specifies" | apps/api/src/lib/onboarding-gates.ts:242-259 defines 14 entries (the 12 the row named plus `nationality` and `political_affiliation`, added 2026-04-30 per an inline comment) | **FALSE_CLAIM — FINDING (confirms round-2 Finding 4)**: not "exactly" — the enum has grown by 2 entries since this row
- L96 | C | only DEC-20260420-A has a formal record among DEC-20260420-A/B/C | DEC-20260420-A.md exists; -B.md and -C.md do not | TRUE

#### DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md (F-A-005 free-tier redaction)
- L4 | Q | "F-A-005 free-tier transaction lookup redaction: always-redact (path a), asymmetric marker (unauth-only), single commit, 200 + body_redacted envelope, verify endpoint untouched" | row Decision field | FAITHFUL
- L41 | Q | "F-A-005.a audit surfaced 6 open questions; all 6 decided and shipped as F-A-005.b (single commit a253d91)." | row Rationale field | FAITHFUL
- L44 | Q | "inherits the manifest-drift surface SA.2b.b discovered" | row Rationale field | FAITHFUL
- L48 | Q | "breaks the no-signup-no-auth free-tier UX that makes the endpoint valuable." | row Rationale field | FAITHFUL
- L54 | Q | "requires Content-Range per RFC 7233 which doesn't map to field-level redaction" | row Rationale field | FAITHFUL
- L58 | Q | "Adding body_redacted marker would confuse API clients that handle this response as a hash receipt." | row Rationale field | FAITHFUL
- L62 | Q | "DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path), DEC-20260420-C (SA.2a DELETE handler), DEC-20260420-D (SA.2b PII classific[ation])" | row Rationale field | FAITHFUL
- L95 | Q | "F-A-005: explicit body redaction marker. input, output, error, ..." | apps/api/src/routes/transactions.ts:142 | FAITHFUL
- L98 | Q | "F-A-005: Unauthenticated lookups return a redacted envelope — body fields" | apps/api/src/routes/transactions.ts:168 | FAITHFUL
- L89 | C | verify endpoint carve-out preserved under DEC-20260420-G (F-A-012), still hash-only | apps/api/src/routes/verify.ts (F-A-012 hardening, verified separately below) | TRUE

#### DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md (Product architecture and first wedge)
- L4 | Q | title-only row, "Product architecture and first wedge" | row Decision title | FAITHFUL
- L60 | Q | "Part Two — The compliance vertical, as a separate brand from scratch" | docs/strategy/2026-08-05-direction-plan.md section heading | FAITHFUL (not independently re-verified against the strategy doc's exact text in this pass beyond the record's own citation; treated as plausible per file existing)
- L62 | Q | "Not "a KYB API" — Trulioo, Creditsafe, Kyckr, and Moody's own that phrase. Three viable wedges:" | docs/strategy/2026-08-05-direction-plan.md (Positioning subsection) | FAITHFUL (not independently re-verified byte-for-byte in this pass; not evidence-listed either — record's evidence array carries only the Notion URL)
- L68 | Q | "supersedes... the Counterparty Assurance rename/ICP," attributed to `DEC-20260812-A` (existing record) | docs/decisions/records/DEC-20260812-A.md contains no such phrase; line 64 reads "The source decision explicitly supersedes the Counterparty Assurance row named DEC-20260502-A and DEC-20260503-A." The exact wording "(Counterparty Assurance rename/ICP)" and "retired as primary product" is CLAUDE.md's own summary bullet (CLAUDE.md:302), not this record's evidence list (which names only the Notion URL) | **MISATTRIBUTED — FINDING (confirms round-2 Finding 5)**
- L57 | C | this row's title/Rationale/Outcome are all null except title | confirmed: row's null-field list includes Rationale, Outcome, Source | TRUE

#### DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md (F-A-006+F-A-007 HMAC token lifecycle)
- L4 | Q | "F-A-006 + F-A-007 HMAC audit token lifecycle: 90-day bounded expiry, two-key rotation ring, separate query params encoding, 180-day legacy grace, auth-gated re-issue endpoint. Two commits shipped." | row Decision field | FAITHFUL
- L45 | Q | "F-A-006/007.a audit surfaced 9 open questions; all 9 decided and shipped as F-A-006/007.b across 2 commits." | row Rationale field | FAITHFUL
- L48 | Q | "matches compliance-archive norms... and the existing retention grace period" | row Rationale field (ellipsis-compressed) | FAITHFUL
- L50 | Q | "cleaner parsing... trivial backwards-compat distinction" | row Rationale field (ellipsis-compressed) | FAITHFUL
- L52 | Q | "signals to clients that re-issue is the right next action, not retry-with-new-credentials" | row Rationale field | FAITHFUL
- L54 | Q | "(...) over a hard break or a permanent dual path" and "throwing at module load on a too-short `AUDIT_HMAC_SECRET_PREVIOUS`" | row Rationale field | FAITHFUL
- L57 | Q | "Silent-failure on key validation is the worst outcome for a rotation mechanism." | row Rationale field | FAITHFUL
- L59 | Q | "there's only one truncation reason today." — n/a, belongs to sibling F-A-012 record, not present here | — | —
- L67 | Q | "DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path), DEC-20260420-C (SA.2a DELETE handler), DEC-20260420-D (SA.2b PII classification), DEC-20260420-E (F-A-005 free-tier redaction)." | row Rationale field | FAITHFUL
- L98 | Q | "F-A-007: optional rotation fallback," | apps/api/src/lib/audit-token.ts:21 | FAITHFUL
- L99 | Q | "F-A-006: default token TTL. 90 days...," | apps/api/src/lib/audit-token.ts:43 | FAITHFUL
- L99 | Q | "F-A-006 + F-A-007: verify with expiry check and two-key ring fallback" | apps/api/src/lib/audit-token.ts:100 | FAITHFUL
- L101 | Q | "F-A-006: expires_at is the new-format discriminator. Absent = legacy token (pre-F-A-006 deploy), accepted during sunset window" | apps/api/src/routes/audit.ts:419-420 | FAITHFUL
- L104 | Q | "This audit URL was issued under a pre-F-A-006 format that has been sunset. Re-issue via POST /v1/transactions/:id/audit-token" | apps/api/src/routes/audit.ts:446 | FAITHFUL
- L96 | C | lifecycle mechanism still live at named functions | apps/api/src/lib/audit-token.ts and apps/api/src/routes/audit.ts, all four F-A-006/007 comments confirmed | TRUE
- L100 | C | re-issue endpoint's ownership/rate-limit design unchanged since; no later narrowing/widening found | not independently falsified in this pass beyond the record's own search | UNVERIFIABLE (absence claim, reasonable)

#### DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35.md (Capability rationalization and site rebuild)
- L4 | Q | title-only row, "Capability rationalization and site rebuild" | row Decision title | FAITHFUL
- L62 | Q | "The website redesign is built inside this repository as `apps/web` (monorepo)... `strale-frontend` was swept and its design material preserved... and is kept, not extended, until the `apps/web` site serves production." | CLAUDE.md:296 (DEC-20260902-A bullet, ellipsis-compressed) | FAITHFUL
- L69 | Q | "Hosting plan in DEC-20260503-C partially superseded: strale-frontend on Cloudflare Pages (not Railway as planned); sibling-repo structure retained (monorepo deferred); payment rails portion of DEC-20260503-C remains active" | docs/decisions/records/DEC-20260513-A.md title | FAITHFUL
- L57 | C | apps/ contains only api; no apps/web directory exists at this commit | `ls apps/` = api only | TRUE
- L57 | C | this row's Rationale/Outcome/Source all null | confirmed in dumped row | TRUE

#### DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md (F-A-012 verify DoS hardening)
- L4 | Q | "F-A-012 verify endpoint DoS hardening: MAX_DEPTH 200→50, DEFAULT_DEPTH 50→20, rate limit 30→10/min per IP, explicit truncated marker. Single commit shipped." | row Decision field | FAITHFUL
- L43 | Q | "F-A-012.a audit surfaced 7 open questions; all 7 decided and shipped as F-A-012.b in commit b26addc. Tightens pre-existing DoS mitigations that were insufficient at prod's observed chain-length distribution (median 25, P95 1,308, max 1,592)." | row Rationale field | FAITHFUL
- L47 | Q | "any sane cap truncates P95-day walks, so the cap choice is about per-request memory cost, not genesis-reachability" | row Rationale field | FAITHFUL
- L51 | Q | "Legitimate human usage is one-off verification of specific transactions" | row Rationale field | FAITHFUL
- L54 | Q | "N-cap bounds wall-clock; rate limit bounds aggregate; Railway platform catches stuck handlers" | row Rationale field | FAITHFUL
- L57 | Q | "there's only one truncation reason today." | row Rationale field | FAITHFUL
- L63 | Q | "DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path), DEC-20260420-C (SA.2a DELETE handler), DEC-20260420-D (SA.2b PII classific[ation])" | row Rationale field | FAITHFUL
- L97 | Q | "F-A-012: tighter caps than the original 200/50 (30 req/min). Prod chain..." | apps/api/src/routes/verify.ts:19 | FAITHFUL
- L98 | Q | "F-A-012: 10 req/min per IP (was 30). See archive/sessions/audit-reports/F_A_012_a_audit.md," | apps/api/src/routes/verify.ts:29 | FAITHFUL
- L100 | Q | "F-A-012: true when the walk stopped at maxDepth before reaching..." | apps/api/src/routes/verify.ts:256 | FAITHFUL
- L101 | Q | "F-A-012: loop exited due to the depth cap (rather than genesis...)." | apps/api/src/routes/verify.ts:362-363 | FAITHFUL
- L94 | C | MAX_DEPTH=50, DEFAULT_DEPTH=20 in verify.ts; AUTH_VERIFY_MAX_DEPTH=50 separately in transactions.ts | apps/api/src/routes/verify.ts:24-25; apps/api/src/routes/transactions.ts:200 | TRUE

#### DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md (Entity resolution priority investment)
- L4 | Q | title-only row, "Entity resolution as priority engineering investment" | row Decision title | FAITHFUL
- L61 | Q | "Part 2, the cross-validation layer, was built as a standalone module but... file is itself orphaned: no capability executor under [wired into the solution executor]; the cross-validation half is dead code," | docs/decisions/records/DEC-20260409-B.md:86,96,104 (three non-adjacent sentences compressed via `...` plus an editorial `[...]` bracket) | FAITHFUL — each side of the `...` is independently a genuine substring in order; the bracket is a marked editorial insertion, not claimed as literal source text (judged not a finding, consistent with round-2's identical judgment on this record)
- L57 | C | company-name-match.ts exists as a fuzzy company-name matching module | apps/api/src/lib/company-name-match.ts present | TRUE
- L57 | C | this row's Rationale/Outcome are both null | confirmed in dumped row | TRUE

#### DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md (Strale positioning and ICP clarification)
- L4 | Q | title-only row, "Strale positioning and ICP clarification" | row Decision title | FAITHFUL
- L57 | Q | "direct connections only. No scraping. Full ToS compliance with every provider" attributed to DEC-20260420-I's own text | docs/decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:28-29 actually reads "direct data connections only. No scraping. Full ToS compliance with every provider." (the same file's own Decision-field quote elsewhere is "direct connections only" describing the doctrine's *name*, not this quoted sentence) | **MISQUOTE — FRESH FINDING #2**: the word "data" is dropped from the DEC-20260420-I row's actual sentence ("direct data connections only"), producing a quotation that is not a substring of its named source
- L57 | Q | "Amends DEC-20260420-H" | docs/decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md title | FAITHFUL
- L83 | Q | "supersedes... DEC-20260502-A (Counterparty Assurance rename/ICP)... the Counterparty Assurance framing is retired as primary product." attributed to `DEC-20260812-A` | same defect as the sibling DEC-20260420-E record above: this exact wording is CLAUDE.md:302's bullet, not present anywhere in docs/decisions/records/DEC-20260812-A.md (confirmed zero grep hits for "rename/ICP" or "retired as primary product" in that file); this record's evidence list carries only the one Notion URL, no CLAUDE.md or DEC-20260812-A.md | **MISATTRIBUTED — FINDING (confirms round-2 Finding 6, recurrence of Finding 5's defect)**
- L36 | C | this row's Rationale/Outcome are both null | confirmed in dumped row | TRUE
- L86 | C | this row's own title names the same subject area as the later-superseded DEC-20260502-A framing, four months earlier — hedged as inference only, not a claim of identity | honestly hedged | TRUE (non-finding, properly qualified)

#### DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md (Option C for 238-slug manifest drift)
- L4 | Q | "Option C for 238-slug manifest drift: fix Class 5.2 mapping + add backfill safety banner, defer full Class 4 cleanup to Session 1 onboarding engine rewrite. SA.2b.c will use direct-SQL backfill to avoid the pipeline entirely." | row Decision field | FAITHFUL
- L50 | Q | "DB is serving correct values for all classes — drift is invisible to users, only blocks the onboarding pipeline." | row Rationale field | FAITHFUL
- L53 | Q | "Option A," rejected... given a planned Session-1 onboarding rewrite | row Rationale field | FAITHFUL
- L54 | Q | "Option B," ... "Session 1 is the natural rewrite point" | row Rationale field | FAITHFUL
- L58 | Q | "CC's investigation during implementation showed the mapping only fires on INSERT (net-new), not UPDATE (backfill). The actual SA.2b.b blocker was `maintenance_class` (Class 1)," | row Rationale field | FAITHFUL
- L61 | Q | "the single highest-priority fix." | row Rationale field | FAITHFUL
- L63 | Q | "causes onboard.ts --backfill to execute the capability live, hitting prod APIs," | row Rationale field | FAITHFUL
- L64 | Q | "a billing event and rate-limit risk," | row Rationale field | FAITHFUL
- L69 | Q | "DEC-20260420-A through DEC-20260420-G (complete SA.2 + F-A series)." | row Rationale field (References section) | FAITHFUL
- L92 | Q | "ToS-prohibited targets (DEC-20260420-H social platforms, DEC-20260427-H-4 Google)" | CLAUDE.md:299 (DEC-20260813-A bullet) | FAITHFUL
- L93 | Q | "DEC-20260420-H established that capabilities sourcing data via ToS-prohibited scraping are banned" | docs/decisions/records/DEC-20260427-H.md:44 | FAITHFUL
- L95 | Q | "the social-platform targets prohibited by `DEC-20260420-H`" | docs/decisions/records/DEC-20260427-H.md:103 | FAITHFUL
- L97 | Q | "the same legal reasoning as `DEC-20260420-H` (ToS-prohibited commercial-aggregator scraping)." | docs/decisions/records/DEC-20260427-I.md:69 | FAITHFUL
- L106 | Q | "Strale's doctrine under DEC-20260420-H states \"direct data connections only. No scraping. Full ToS compliance with every provider.\"" | docs/decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:28-29 | FAITHFUL (byte-for-byte, correctly includes "data" — contrast with the sibling record's dropped-word defect above)
- L108 | Q | "Adopt split-by-data-source-type as the operable form of the \"direct connections only\" doctrine. Amends DEC-20260420-H." | docs/decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md title | FAITHFUL
- L130 | Q | "for anyone who runs `--backfill` on a Class-4 slug before that rewrite happens." | this record's own Rationale summary, not an external quote | FAITHFUL (self-referential)
- L143 | Q | "Cluster 2 Phase 4a: --force-override-authority interactive guard" | apps/api/scripts/onboard.ts:135 | FAITHFUL
- L162 | Q | "Session 1 onboarding engine rewrite" | row Rationale field (own phrase) | FAITHFUL
- L136 | C | onboard.ts maps case "ai_assisted": return "ai_assisted"; exactly, and carries --force as documented override | apps/api/scripts/onboard.ts:105 | TRUE
- L138 | C | --force-override-authority exists, gated to interactive TTY, refused in batch mode | apps/api/scripts/onboard.ts:135,147,151,158 | TRUE
- L145 | C | all 342 manifests now declare processes_personal_data (per DEC-20260420-D record); heuristic fallback removed after migration 0050 | confirmed above under DEC-20260420-D | TRUE

### Coverage

| Record | quotes | claims | findings |
|---|---|---|---|
| DEC-20260225-P-c5d6--notion-...81279b14f3859f6f2038.md | 5 | 4 | 0 (2 already withdrawn by DEC-20260905-B) |
| DEC-20260225-P-c5d6--notion-...818e9d46cd25ac0236a8.md | 5 | 5 | 0 |
| DEC-20260303-A--notion-...812dba47c52f4f36ca33.md | 7 | 3 | 0 |
| DEC-20260303-A--notion-...813198e2da8e3d02b531.md | 4 | 2 | 0 |
| DEC-20260304-A--notion-...812c9ccef7f58256f40a.md | 5 | 5 | 1 |
| DEC-20260304-A--notion-...8185b0a6c33de2293215.md | 5 | 4 | 0 |
| DEC-20260304-B--notion-...81a4b2f7ccdd52b99b1e.md | 6 | 1 | 0 |
| DEC-20260304-B--notion-...81dda9c4f43b5b7674b3.md | 4 | 3 | 0 |
| DEC-20260304-C--notion-...810197f9efa520332024.md | 5 | 2 | 1 |
| DEC-20260304-C--notion-...815cb440e586e783df0a.md | 6 | 2 | 3 |
| DEC-20260320-C--notion-...81178c7acc8b5c396aa3.md | 3 | 2 | 1 |
| DEC-20260320-C--notion-...81bfa5d1ee04b7d753dc.md | 3 | 4 | 0 |
| DEC-20260320-J--notion-...8177a82be21d48f57411.md | 4 | 2 | 0 |
| DEC-20260320-J--notion-...8192b920f8d8cfb40aa7.md | 2 | 2 | 0 |
| DEC-20260320-K--notion-...818e8cbbc29a3a0c1bed.md | 3 | 4 | 0 |
| DEC-20260320-K--notion-...81e890bfe564a3c2e917.md | 4 | 2 | 0 |
| DEC-20260405-B--notion-...810c920dd09d78aa06b6.md | 5 | 2 | 0 |
| DEC-20260405-B--notion-...810692c8dd4374a6f9ac.md | 5 | 4 | 0 |
| DEC-20260406-A--notion-...816b825cdf812ef006b8.md | 3 | 2 | 0 |
| DEC-20260406-A--notion-...81bdb38fd9eeaa556d98.md | 6 | 2 | 0 |
| DEC-20260406-B--notion-...8103becfe4900a1ff319.md | 6 | 1 | 0 |
| DEC-20260406-B--notion-...81629339d9f208f65f52.md | 4 | 2 | 0 |
| DEC-20260406-C--notion-...814b8afafb2e1c6ca317.md | 6 | 1 | 0 |
| DEC-20260406-C--notion-...819cabf6d47331d695ce.md | 10 | 1 | 1 |
| DEC-20260409-C--notion-...81c19655cb04fb7d3ecf.md | 8 | 2 | 0 |
| DEC-20260420-D--notion-...81f0827eedf29d133600.md | 7 | 3 | 1 |
| DEC-20260420-E--notion-...81b590b4e8bee4b59228.md | 9 | 1 | 0 |
| DEC-20260420-E--notion-...81d5a898f48cc1554086.md | 3 | 1 | 1 |
| DEC-20260420-F--notion-...810b8547fccb3e75c61b.md | 13 | 2 | 0 |
| DEC-20260420-F--notion-...810b8df1e8e459039d35.md | 3 | 2 | 0 |
| DEC-20260420-G--notion-...81c38c3acaca5d01d6ef.md | 11 | 1 | 0 |
| DEC-20260420-G--notion-...81dcafe3dea59cc119b1.md | 2 | 2 | 0 |
| DEC-20260420-H--notion-...81b58b36de5f71c0937f.md | 3 | 2 | 2 |
| DEC-20260420-H--notion-...81c6a58dfbc5f46ed3f6.md | 17 | 3 | 0 |

### Findings

1. **record:** `DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md`
   **line:** 121
   **class:** MISQUOTE
   **record_text:** `DEC-20260303-G` ("Homepage restructure: 11-section order")
   **source:** `CLAUDE.md:281` at commit `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`
   **source_text:** "DEC-20260303-G: Historical eleven-section homepage order; superseded for the apps/web redesign by DEC-20260905-A. Evidence still belongs near the claim it supports."
   **correction:** At the pinned commit, CLAUDE.md's DEC-20260303-G bullet no longer reads "Homepage restructure: 11-section order" (that text was replaced by commit `413974d8`, 2026-09-05, an ancestor of the pinned commit, as part of the DEC-20260905-A brand-application rollout); the record's quotation is stale relative to the commit it claims to be verified against.

2. **record:** `DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md`
   **line:** 44
   **class:** MISQUOTE
   **record_text:** "here is quality infrastructure data" from "here is a suggested product to buy."
   **source:** row Rationale field, page `31867c87082c810197f9efa520332024`
   **source_text:** "...distinguishes it and communicates 'quality infrastructure' vs 'product recommendation'. Remove 'Example' label."
   **correction:** The row's Rationale contains only the short single-quoted phrases 'quality infrastructure' and 'product recommendation'; the longer double-quoted sentences the record attributes to "the row states it" are fabricated illustrative phrasing, not a quotation of the row.

3. **record:** `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`
   **line:** 91
   **class:** MISQUOTE
   **record_text:** "the worst of (SQS grade, freshness grade, latency grade),"
   **source:** `apps/api/src/lib/trust-grade.ts:211`
   **source_text:** "Combined grade = worst of (SQS grade, freshness grade, latency grade)"
   **correction:** The source reads "worst of", not "the worst of" — no definite article precedes "worst of" in the code comment.

4. **record:** `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`
   **line:** 93
   **class:** MISQUOTE
   **record_text:** "Reference data (stale: Nd since update, cycle Nd)."
   **source:** `apps/api/src/lib/trust-grade.ts:89`
   **source_text:** `` label = `Reference data (stale: ${Math.round(ageDays)}d since update, cycle ${cycle}d)`; ``
   **correction:** The source is a template literal with `${...}` expressions; the literal characters "Nd" never appear anywhere in the file. "Nd" is the record's own illustrative placeholder, presented in quotes as if it were the literal label text.

5. **record:** `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`
   **line:** 99
   **class:** FALSE_CLAIM
   **record_text:** "Capability circuit breakers exist as a source-side layer... its presence is corroborated by `docs/decisions/records/DEC-20260306-D.md` and by this batch's sibling records citing `apps/api/src/lib/circuit-breaker.ts` in other trust-related capacities."
   **source:** `docs/decisions/records/DEC-20260306-D.md` (full text)
   **source_text:** "not present" — the file's title is "Metric display consistency across all surfaces: 6 issues identified and fixed" and it contains zero occurrences of "circuit" or "breaker" anywhere in its body.
   **correction:** `DEC-20260306-D.md` does not corroborate the circuit-breaker mechanism; it is an unrelated metric-display-consistency record. The general topical grouping under CLAUDE.md's "Trust display centralization" bullet does not extend to a specific claim that this record discusses circuit breakers.

6. **record:** `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`
   **line:** 60
   **class:** FALSE_CLAIM
   **record_text:** "Neither the `.d.ts` filter nor the `MIN_EXPECTED_EXECUTORS` startup health gate exists in `auto-register.ts` today... There is also no `process.exit(1)` FATAL startup gate keyed on an expected executor count anywhere in the file... this row's specific fix and its startup gate moot rather than wrong."
   **source:** `apps/api/src/index.ts:10,19-30,345-394`
   **source_text:** "const MIN_EXPECTED_EXECUTORS = 200;" ... "if (count < MIN_EXPECTED_EXECUTORS) { const { StartupFatalError } = await import(\"./lib/startup-fatal.js\"); throw new StartupFatalError(...)" ... "process.exit(1);" (in `main().catch`)
   **correction:** `MIN_EXPECTED_EXECUTORS = 200` and the startup health gate the row specified are both live in production today, verbatim, in `apps/api/src/index.ts` (a file this record never read and did not list as evidence) — not moot, not superseded, not absent. The narrow claim ("not in `auto-register.ts`") is true; the broader conclusion drawn from it ("this row's specific fix and its startup gate moot") is false.

7. **record:** `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`
   **line:** 98
   **class:** FALSE_CLAIM
   **record_text:** "`apps/api/src/lib/onboarding-gates.ts` still enforces `PII_CATEGORY_ENUM` exactly as this row specifies, unconditionally"
   **source:** `apps/api/src/lib/onboarding-gates.ts:242-259`
   **source_text:** "\"nationality\",\n  \"political_affiliation\",\n] as const;" preceded by the comment "// Added 2026-04-30 to cover sanctions/PEP screening manifests."
   **correction:** The enum has grown to 14 entries (the 12 the row named plus `nationality` and `political_affiliation`, added 2026-04-30); it is not "exactly as this row specifies." The gate's blocking behaviour and the manifest-backfill counts (342/342, 127/342) the same section cites are independently confirmed correct.

8. **record:** `DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md`
   **line:** 68
   **class:** MISATTRIBUTED
   **record_text:** `DEC-20260812-A` (existing record) states it "supersedes... the Counterparty Assurance rename/ICP,"
   **source:** `docs/decisions/records/DEC-20260812-A.md:64`
   **source_text:** "The source decision explicitly supersedes the Counterparty Assurance row named DEC-20260502-A and DEC-20260503-A."
   **correction:** The phrase "(Counterparty Assurance rename/ICP)" is `CLAUDE.md:302`'s own summary bullet for DEC-20260812-A, not the formal decision record's own text; `DEC-20260812-A.md` never uses the words "rename/ICP." Neither `CLAUDE.md` nor `DEC-20260812-A.md` is listed in this record's `evidence:` array.

9. **record:** `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`
   **line:** 83
   **class:** MISATTRIBUTED
   **record_text:** `DEC-20260812-A` states it "supersedes... DEC-20260502-A (Counterparty Assurance rename/ICP)... the Counterparty Assurance framing is retired as primary product."
   **source:** `docs/decisions/records/DEC-20260812-A.md` (full text)
   **source_text:** "not present" — a full-text grep for "rename/ICP" and "retired as primary product" against `DEC-20260812-A.md` returns zero hits.
   **correction:** Both quoted clauses are `CLAUDE.md:302`'s bullet text, not `DEC-20260812-A.md`'s own body. This record's `evidence:` array lists only the one Notion URL; neither `CLAUDE.md` nor `DEC-20260812-A.md` is listed, despite being quoted at length. This is the same misattribution as Finding 8, recurring in the sibling collision record.

10. **record:** `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`
    **line:** 57
    **class:** MISQUOTE
    **record_text:** `DEC-20260420-I`'s own text attributes a "direct connections only. No scraping. Full ToS compliance with every provider" doctrine to `DEC-20260420-H`
    **source:** `docs/decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:28-29`
    **source_text:** "The row's own text: \"Strale's doctrine under DEC-20260420-H states 'direct data connections only. No scraping. Full ToS compliance with every provider.'\""
    **correction:** The word "data" is missing from the quotation; `DEC-20260420-I`'s own text (and the row it quotes) reads "direct **data** connections only," not "direct connections only." The sibling record in this same partition, `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:106`, quotes the same source correctly with "data" included, confirming this is a dropped word in this record specifically, not an ambiguity in the source.

### Not findings

- `DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:61` — "tangled multicolor vs clean green" is a faithful quotation of the row's own Rationale; the record explicitly hedges that it did not independently re-verify the colour treatment pixel-by-pixel, and `StraleDiagram.tsx`'s actual `primary` colour (`hsl(225 42% 52%)`, blue) does not literally match "green." Not a finding because the record only claims fidelity to the row's words, never asserts the current pixel colour matches "green."
- `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md:76,82` and the CLAUDE.md quote at the same record — both spans are exactly what `DEC-20260905-B` item 13 already withdraws (dropped "the," comma-for-em-dash). Not re-listed as a fresh finding per the sweep instructions.
- `DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md:61` — the ellipsis-plus-bracket compression of two non-adjacent `DEC-20260409-B.md` sentences with an editorial `[wired into the solution executor]` insertion. Round 2 (`closing2-review-P5.md`) judged this acceptable convention, not a finding, because each side of the `...` is independently a genuine substring and the bracket is marked as an insertion rather than claimed as literal quoted text; this sweep concurs.
- `DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md:70` and similar "not literally labelled" framings — these are the record's own descriptive prose, not quotations requiring a source check, and were not miscounted as quotes in the ledger.

### Unverifiable

- `DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7.md` — when or why `pep-check`'s `transparency_tag` changed from `mixed` to `algorithmic` between the row's decision date and today. Would need commit history beyond what a repo-wide grep/`git log` search surfaced (the record itself reports this search came up empty); Railway deploy logs or a Notion session log from that window might resolve it.
- `DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md` — whether the 42 of 60 KYB/Invoice-Verify solutions unaccounted for by the two retirement scripts are still `is_active` in the production database, and whether the 20-country coverage still holds. Needs read access to the production `solutions` table.
- `DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md` — whether the ~90-page Notion archive from the 2026-Q1 tidy still exists five months later. Needs Notion API access; nothing in this repository can confirm or deny Notion-side page state.
- `DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md` — whether the XOR constraint between `capability_id` and `solution_slug` is enforced as a named SQL `CHECK` constraint anywhere, versus only at the application layer. Needs a live schema dump (`\d transactions`) against the actual database, which this read-only worktree sweep cannot reach.
- `DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md` — whether the staging HMAC-key rotation drill named as an "Operational follow-up" has since run in production. Needs an operations log or a Railway deploy/runbook record outside this repository.

SWEEP COMPLETE

### Sweep P6

# M2 candidate-set remediation sweep — Partition P6

Partition: P6. Commit: `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`. Record count: 34 (including `DEC-20260905-B.md`, the withdrawal record itself). Script: quotations were extracted with a small Python script (`extract_quotes.py`) that normalizes `€→EUR`, `×→x`, `≥→>=`, `≤→<=`, `→→->`, `…→...`, lowercases, and strips non-alphanumerics, then flags quoted spans of 25+ normalized characters; the extraction was unreliable on quotes containing nested single/curly quotes, so every record was also read in full and every double-quoted span checked by hand against its named source (Notion row JSON dumped via `dump_rows.py`, repository files at the pinned commit via a detached worktree at `C:/tmp/strale-sweep-P6`, and the sibling frontend checkout for two cross-repo citations).

### Coverage

- DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md | quotes checked: 4 | claims checked: 4 | findings: 0
- DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md | quotes checked: 10 | claims checked: 3 | findings: 0
- DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md | quotes checked: 6 | claims checked: 3 | findings: 0
- DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md | quotes checked: 11 | claims checked: 2 | findings: 0
- DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md | quotes checked: 12 | claims checked: 4 | findings: 0
- DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md | quotes checked: 6 | claims checked: 3 | findings: 0
- DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md | quotes checked: 8 | claims checked: 1 | findings: 0
- DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md | quotes checked: 6 | claims checked: 2 | findings: 0
- DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md | quotes checked: 5 | claims checked: 2 | findings: 0
- DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md | quotes checked: 5 | claims checked: 1 | findings: 0
- DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md | quotes checked: 6 | claims checked: 2 | findings: 0
- DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md | quotes checked: 8 | claims checked: 2 | findings: 0
- DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md | quotes checked: 5 | claims checked: 1 | findings: 0
- DEC-20260422-A--git-3b256587.md | quotes checked: 0 (technical/policy prose, no long quoted spans beyond direct excerpts already checked against CLAUDE.md) | claims checked: 4 | findings: 0
- DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md | quotes checked: 0 | claims checked: 3 | findings: 0
- DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md | quotes checked: 4 | claims checked: 2 | findings: 0
- DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md | quotes checked: 5 | claims checked: 5 | findings: 0
- DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md | quotes checked: 4 | claims checked: 1 (already withdrawn) | findings: 0 new (1 pre-withdrawn, correction re-verified correct)
- DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md | quotes checked: 4 | claims checked: 1 | findings: 0
- DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9.md | quotes checked: 1 | claims checked: 2 | findings: 0
- DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md | quotes checked: 4 | claims checked: 4 | findings: 0
- DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76.md | quotes checked: 2 | claims checked: 1 | findings: 0
- DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md | quotes checked: 3 | claims checked: 6 | findings: 0
- DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md | quotes checked: 3 | claims checked: 1 | findings: 0
- DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md | quotes checked: 3 | claims checked: 3 | findings: 0
- DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md | quotes checked: 4 | claims checked: 3 | findings: 0
- DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md | quotes checked: 2 | claims checked: 2 | findings: 0
- DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md | quotes checked: 5 | claims checked: 4 | findings: 0
- DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md | quotes checked: 3 | claims checked: 1 | findings: 0
- DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958.md | quotes checked: 3 | claims checked: 1 | findings: 0
- DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md | quotes checked: 3 | claims checked: 4 | findings: 0
- DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md | quotes checked: 3 | claims checked: 3 | findings: 0
- DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md | quotes checked: 4 | claims checked: 2 | findings: 0
- DEC-20260905-B.md | quotes checked: 13 corrections (self-consistency check) | claims checked: 1 (item 7, the only correction touching this partition) | findings: 0

### Findings

None. Every quoted span in every record (Rationale/Outcome quotes attributed to Notion rows, code/file quotes, CLAUDE.md quotes, cross-record quotes) was verified FAITHFUL against its named source under the normalization rule. Every repository-state claim checked (manifest field counts, `data_source_type` distributions, commit existence, file existence, line-number citations, code logic descriptions) was verified TRUE. No MISQUOTE, MISATTRIBUTED, UNVERIFIABLE_QUOTE, or FALSE_CLAIM was found in this partition.

Notably solid patterns across the partition:
- The `342/342` manifest-field-coverage claim (`DEC-20260420-I` backfill row and `DEC-20260420-J`) is exactly right: `grep -lE "processes_personal_data|personal_data_categories" manifests/*.yaml | wc -l` returns 342 of 342.
- The `data_source_type` distribution claim (224 `api` + 1 quoted `"api"`, 81 `computed`, 32 `scrape`, 3 `reference`, 1 `ai_assisted` = 342) repeated across `DEC-20260420-I`'s doctrine row and `DEC-20260421-C`'s no-scraping row is exactly right both times.
- `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438`'s "eight `HMRC_*` rows" is the one statement in this partition already withdrawn by `DEC-20260905-B` item 7 (correct count is seven). The correction was re-verified: `config/env-manifest.yaml` carries exactly seven `HMRC_*` rows (`HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_REQUESTER_VRN`, `HMRC_SANDBOX_CLIENT_ID`, `HMRC_SANDBOX_CLIENT_SECRET`, `HMRC_TEST_VRN`, `HMRC_USE_SANDBOX`). `DEC-20260905-B`'s own correction is correct.
- `DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46`'s claim that `apps/api/src/lib/trust-helpers.ts`'s code comment misattributes the `manifest_drift` mechanism to "DEC-20260513-B + DEC-20260513-C" was checked against both cited records' actual titles (a Swiss circuit-breaker-pin release and a Slovak scheduler hash-stagger fix, both unrelated subjects) — the record's misattribution claim holds.
- `DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77` correctly and cautiously flags — without asserting a verdict — that `CLAUDE.md`'s description of the `scheduled_testing_eligible` reconciliation rule (`external_cost_cents = 0`) differs from the `cost_class`-based rule that `startup-migrations.ts` Block 0069 (which runs after Block 0066 in file order) actually implements today; this is left as an open reversal condition rather than a false claim, and is correctly hedged.

### Not findings

Nothing was deliberately classified FAITHFUL or STALE_COUNT in this partition that round 2's `closing2-review-P6.md` flagged — no such document was found in the scratchpad at review time (only `closing2-P6.txt`, the file list, was present); if a round-2 review document exists elsewhere it was not available to this sweep, so this section is empty by lack of round-2 findings to reconcile against, not by an active decision to overrule any.

### Unverifiable

- `DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de`'s specific `pii_true`/`pii_false` production counts (84/191/32) — point-in-time database figures, not verifiable from repository files. (The record itself already marks this unverifiable; no independent finding needed.)
- `DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98`'s claim about whether the single-field sandbox input shipped on the current production strale-frontend site — the record itself scopes this out as requiring a read of the frontend's sandbox component, which this sweep did not perform (out of scope for this partition's evidence set as the record itself states).
- `DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072`'s question of whether the "Counterparty verification for AI agents, in one call." H1 was ever deployed and later reverted, or never deployed — no repository evidence resolves this either way; would require deploy/production history beyond git.
- `DEC-20260502-A`'s "drift-open" rounding-precision claim (well-known manifest rounds to two decimals, OpenAPI to three, versus six-decimal charged value) is corroborated by its own cited archive session file but this sweep could not locate the exact rounding call sites in `x402-gateway-v2.ts` to independently re-derive the precision figures from first principles — would need to trace the well-known-manifest and OpenAPI-spec generation code paths directly.
- `DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa`'s and `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438`'s InfoCamere/HMRC application outcomes — both records already flag these as unresolved (no vendor response recorded anywhere in this repository); consistent with `DEC-20260905-B`'s Consequences item (d), which names the same InfoCamere/HMRC outcome questions as deliberately left open.
- `DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9`'s SI/RO manifest existence and MT's MBR-outreach status — the record itself scopes verification to SK only; this sweep did not independently check SI/RO manifests or MT's status either, consistent with the record's own stated scope limit.
- `DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77`'s open question of whether `CLAUDE.md`'s `external_cost_cents`-based description of `scheduled_testing_eligible` reconciliation is now stale relative to `startup-migrations.ts` Block 0069's `cost_class`-based rule — resolving this would require confirming Block execution order and runtime boot behavior in production, which is outside this sweep's read-only repository scope.

SWEEP COMPLETE

## Outcome

Round 2 found fresh confirmed defects in P2, P3, and P5 (P1, P4 and P6
passed on substance, though P1 and P4 each recorded minor quote-fidelity
findings judged not verdict-determining). The follow-up sweep, run
because round 1 and round 2 kept finding disjoint sets rather than
converging, found further confirmed defects distributed across P1
through P5 (P6's sweep found none). Every confirmed defect from both
round 2 and the sweep that the quotation convention still counts as a
defect is corrected by `DEC-20260905-C`
(`docs/decisions/records/DEC-20260905-C.md`), which withdraws each false,
fabricated, or misattributed statement from its record without editing
that record. The final closing round runs at the commit that merges this
file and `DEC-20260905-C` into `main`, and treats a statement withdrawn
here or in `DEC-20260905-B` as corrected.

VERDICT: FAIL
