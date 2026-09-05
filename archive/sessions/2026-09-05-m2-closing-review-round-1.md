---
doc_type: m2-closing-review-round
round: 1
commit: 3a7089c5b48432a3dd359acefdd048a63af5034f
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

Route: fresh read-only Claude agents per the 2026-09-03 amendment
(DEC-20260903-A). Six partitions covered the 231 records at commit
`3a7089c5b48432a3dd359acefdd048a63af5034f`: P1 through P4 each took a
contiguous slice of bare-keyed records, P5 took the 34 `--notion-`
qualified records belonging to this batch's 17 id-collisions, and P6 took
the remaining 33 qualified records (32 `--notion-` plus the one `--git-`
qualified record). Each reviewer checked frontmatter validity, the
CAUTION banner, the five protected sections, every quotation against its
parsed Notion row or the named repository file at the commit, every
evidence path, every relation target, at least ten code claims, and, for
the qualified records in P5 and P6, the collision-registry and
M2-closure-register bindings. Every reviewer worked in a detached,
read-only worktree and made no edits. Below, each partition report's own
`##` headings are demoted to `###` so this file keeps one heading
hierarchy; nothing else in any report is edited.

## Partition reports

### P1

# Closing review, partition P1

Commit: `3a7089c5b48432a3dd359acefdd048a63af5034f`
Records reviewed: 41 (DEC-20260224-P-a1b2 through DEC-20260309-H, per `closing-P1.txt`)
Reviewer: fresh, read-only, no authorship of any reviewed content.

### Method

Set up a detached worktree at the pinned commit (`git worktree add --detach C:/tmp/strale-closing-P1 3a7089c5b48432a3dd359acefdd048a63af5034f`), read every one of the 41 record files in full, and ran three scripted checks plus manual reading:

1. **Frontmatter/filename check** (Python + PyYAML): parsed every record's frontmatter, confirmed `record_key == id` and that the filename (minus `.md`) equals `record_key` for all 41 (all bare keys in this partition; no `--notion-`/`--git-` qualified files). Result: 0 mismatches.
2. **Structural check**: confirmed the `[!CAUTION]` banner and all five protected sections (`## Decision`, `## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`) are present in every file. Result: 0 missing.
3. **Evidence-existence check**: for every non-URL evidence entry, resolved it either as a file under the worktree root or, for `strale-io/strale-frontend@<sha>:<path>` entries, via `git -C C:/Users/pette/Projects/strale-frontend show <sha>:<path>`. Result: 0 missing (all evidence files/cross-repo paths resolve).
4. **Relations check**: confirmed every `relations[].target` exists as a `.md` filename in `docs/decisions/records/` at the pinned commit (231 records present there), and cross-checked all 35 ids in `docs/decisions/id-collisions.yaml` against every relation target in this partition — none of P1's relation targets is a bare collided id (the one collided id referenced, `DEC-20260502-A`, is always used in its qualified form `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`, matching the existing record file of that exact name).
5. **Notion quote fidelity**: dumped all 41 referenced Notion pages in one batch via `dump_rows.py` (rows parsed: 318, selected: 41 — one per record, matched 1:1 by `userDefined:ID`). I first wrote an automated quote-extraction script (regex for double-quoted spans ≥25 chars, tested as substrings of the row's fields / evidence files / relation-target records) but it produced a large number of false "unmatched" results — these were artifacts of the regex mis-pairing literal `"` characters used as scare-quotes across paragraph boundaries (compounded by console cp1252 rendering turning em dashes into `�` in the printed diagnostic, a display artifact only, not a data issue). Given that noise, I abandoned the automated pairing and instead read all 41 records in full against the corresponding Notion row JSON (Rationale/Decision/Scope/Source/Confidence fields) side by side. Every attributed quotation I checked this way — including the longest verbatim block quotes (`DEC-20260225-P-q3r4`'s five-part crypto rationale, `DEC-20260225-P-s5t6`'s Gemini-fee-analysis quote, `DEC-20260225-P-e5f6`'s "Honest assessment" quote, `DEC-20260224-P-g7h8`'s seven-point naming rationale, `DEC-20260305-E`'s and `DEC-20260305-F`'s quoted Outcome fields) — matches the row's field content. No fabricated or misattributed quotation was found.
6. **Null-field check**: `dump_rows.py`'s per-row "null fields" listing was cross-checked against each record's own claims about null/populated fields. Two records make an explicit claim about a specific field's nullness: `DEC-20260225-P-m1n2` states "The row's own Source field is null, unlike most rows in this batch" — confirmed true (its dump lists `Source` among null fields; the four `DEC-20260224-P-*` rows do not list `Source` as null). No record quotes a field the dump lists as null, and no record calls a populated field null.
7. **Code-claim spot checks**: 10 performed (list below), all confirmed true at the pinned commit.

### Residual-mismatch list (from the abandoned automated script) and judgement

The regex script flagged ~140 "unmatched" spans; on manual inspection every one was a false positive of one of two kinds, not a real finding:
- **Multi-clause quoting artifacts**: the script paired a `"` opening a short scare-quote (e.g. `"library-as-product, x402 primary rail"`) with a later, unrelated `"` several sentences on, producing a garbage multi-sentence "quote" that was never intended as a single quotation. Manually isolating the real quoted phrase in each case (e.g. `"library-as-product, x402 primary rail"` and `"is retired as primary product."` in `DEC-20260224-P-a1b2`) and grepping it against `CLAUDE.md` confirmed both are verbatim substrings of CLAUDE.md's `DEC-20260812-A` bullet, even though `CLAUDE.md` is not listed in that record's `evidence` array (the record cites CLAUDE.md by name in prose instead). This is worth flagging as a minor evidence-completeness gap (see Findings, item 1) but the quotation itself is accurate.
- **Under-inclusive search blob**: several evidence-attributed quotes (e.g. `DEC-20260225-P-w9x0`'s "Bolagsverket Värdefulla datamängder API..." and "DEC-20260405-A Phase 2: replaced Allabolag scraping with direct Bolagsverket API") were verified by direct grep against the named files (`manifests/swedish-company-data.yaml`, `apps/api/src/capabilities/swedish-company-data.ts`) and matched exactly; the script's failure was purely an artifact of the regex, not a real discrepancy.

No quotation across the 41 records was found to be fabricated, altered, or misattributed to a source that does not contain it.

### Findings

1. **Minor — evidence-list completeness, not a fidelity problem.** `DEC-20260224-P-a1b2.md`, `DEC-20260224-P-e5f6.md`, and `DEC-20260224-P-c3d4.md` each quote or closely paraphrase `CLAUDE.md`'s `DEC-20260812-A` bullet in their Consequences sections (e.g. "library-as-product, x402 primary rail", "is retired as primary product.") but do not list `CLAUDE.md` in their frontmatter `evidence` array (only `docs/company/GOALS.md` / `docs/strategy/2026-08-12-platform-readiness-program.md` / `docs/decisions/records/DEC-20260812-A.md` are listed, depending on the record). The quoted text is verbatim-accurate against `CLAUDE.md` at the pinned commit (confirmed by grep), so this is not a fabrication or misattribution — the review brief's fidelity checks (frontmatter validity, quote-byte-match, evidence-path-existence, relation-target-existence) all still pass for these three records. It is noted here only because a stricter evidence-list convention would have added `CLAUDE.md` to the array; it does not affect this partition's verdict.

No other findings. No false, fabricated, misattributed, or unverifiable claim was found in any of the 41 records' Decision/Context/Rationale/Consequences/Reversal-conditions text, frontmatter, evidence list, or relations.

### Ten code-claim spot checks (file, line, result)

1. `DEC-20260224-P-g7h8` — `docs/company/coinbase-bazaar-email.md:83` reads "We run Strale (api.strale.io)" and `:128` reads "Moonlighter AB (Strale) — petter@strale.io". **Confirmed true.**
2. `DEC-20260225-P-a3b4` — `manifests/vat-validate.yaml:26` `price_cents: 2`; `manifests/invoice-extract.yaml:12` `price_cents: 50`; `manifests/screenshot-url.yaml:10` `price_cents: 5` with header comment at line 1 "Auto-generated from database on 2026-03-17". **Confirmed true** (matches the record's claim that screenshot-url exists on `main` despite CLAUDE.md's DEC-12 saying it was dropped, and that invoice-extract matches the €0.50 figure).
3. `DEC-20260225-P-e7f8` — `packages/langchain/src/index.ts:16` `export class StraleFallbackTool extends Tool`. **Confirmed true.**
4. `DEC-20260225-P-m5n6` — `manifests/swedish-company-data.yaml:15-16` lists `required: - org_number` as the sole required field; grep of `apps/api/src/capabilities/swedish-company-data.ts` for model/anthropic/llm/fuzzy returned no matches. **Confirmed true** (no LLM/fuzzy-input code path exists).
5. `DEC-20260225-P-q3r4` — `apps/api/src/lib/auth.ts:3-20` confirms `sk_live_` + 32 hex char API keys with a 16-char prefix for lookup; `apps/api/src/lib/production-authority.ts:28,113` confirm ed25519 keypairs are used for founder-grant signatures, not agent identity. **Confirmed true.**
6. `DEC-20260226-P-s3t4` — `apps/api/src/db/schema.ts:355-359` declares `auditTrail: jsonb("audit_trail")`, `transparencyMarker: varchar("transparency_marker", ...)`, `dataJurisdiction: varchar("data_jurisdiction", ...)`. **Confirmed true.**
7. `DEC-20260227-P-i9j0` — `apps/api/src/capabilities/auto-register.ts:411` performs `await import(\`./${slug}.js\`)`, i.e. every capability executor is a first-party dynamic import, not externally hosted. **Confirmed true.**
8. `DEC-20260305-G` / `DEC-20260306-D` — `apps/api/src/routes/public-trust.ts:34-39` defines `PUBLIC_TRUST_FIELDS` as exactly `badge`, `badge_label`, `tested`, `last_tested_at`, `pass_rate`. **Confirmed true.**
9. `DEC-20260306-G` — grep of `apps/api/src/routes/` for `quality/:slug` or `v1/quality` returned zero matches, confirming the retired SQS endpoint does not exist in code (not just per CLAUDE.md prose). **Confirmed true.**
10. `DEC-20260309-H` — none of the eight named finance-capability slugs (`dcf-estimate`, `altman-z-score`, `recession-probability`, `analyst-ratings`, `retirement-projection`, `portfolio-risk`, `credit-ratios`, `country-risk-profile`) exists under `manifests/`; separately, `strale-io/strale-frontend@04c9fca9:src/pages/Terms.tsx:254,262` (verified via `git show`) carries the quoted liability-limitation language. **Confirmed true** on both counts.

### Unverifiable

Nothing in this partition was left unverifiable. Every frontmatter field, evidence path, relation target, quotation, and sampled code claim across all 41 records was checked against the pinned commit (or, for cross-repo evidence, the named commit in `strale-io/strale-frontend`) and resolved to a definite true/false/exists/absent result.

### Partition verdict

PARTITION VERDICT: PASS

### P2

# M2 Closing Independent Review — Partition P2

Commit reviewed: `3a7089c5b48432a3dd359acefdd048a63af5034f`
Records in partition: 41 (DEC-20260310-E through DEC-20260411-B, per `closing-P2.txt`)
Reviewer: fresh, read-only agent; authored none of the reviewed content.

### Method

Set up a detached worktree at the pinned commit
(`git worktree add --detach C:/tmp/strale-closing-P2 3a7089c5b48432a3dd359acefdd048a63af5034f`)
and read every one of the 41 record files in full. Notion rows were pulled
in bulk via `dump_rows.py` using each record's evidence[0] page id (all 41
resolved on the first pass). Frontmatter (record_key/id/filename agreement,
required sections, CAUTION banner, evidence-path existence) was checked with
a small Python script that parses each file's YAML frontmatter, confirms the
five protected sections and the caution banner are present, and resolves
every non-URL evidence entry against the working tree (frontend cross-repo
entries resolved against a `git show <sha>:<path>` snapshot of
`strale-frontend`). Quoted spans (double-quoted runs of 25+ characters) were
extracted with a regex script and checked as substrings of: the matching
Notion row's field values, the cited evidence files' contents, or (for
relation paragraphs) the sibling record's text. Everything the automated
pass could not cleanly classify (title-field quotes, quotes split by
nested `"Foo"`/`"Bar"` pairs, quotes wrapped across markdown line breaks)
was resolved by hand, reading the surrounding paragraph and the source
field/file directly. Beyond the quote check, I hand-verified specific
"status on 2026-09-0x, against main" code claims by grepping/reading the
named files at the pinned commit — 21 distinct claims across 15 different
records, well past the ten-record minimum.

**Residual-mismatch list produced by the automated quote script, and my
judgement on each:**

- All `L4: '<title>'` matches — these are YAML frontmatter title fields
  (quoted only because they contain a colon or embedded quotes), not
  quotations attributed to a source. Not a finding.
- `DEC-20260313-E` "to the top-level navbar, distinct from and alongside" —
  false positive: the sentence is `Add "Trust" ... alongside "Docs."`; the
  regex captured the plain-prose text between two unrelated quoted words.
  Not a finding.
- `DEC-20260314-F` L82/84 grep-pattern quotes, `DEC-20260321-A` L67/73
  grep-pattern quotes — these are the reviewing session's own quoted grep
  commands, not attributed source quotations. I additionally re-ran both
  greps against the pinned commit and got the same zero-match / match
  results the records report. Not a finding.
- `DEC-20260310-F` "structurally valid validation rules." — real quote,
  matches the Notion Rationale field except for a trailing period added for
  grammar. Judged: acceptable, not a finding.
- `DEC-20260314-B` "Dev.to #1... 'How We Score 297 Agent Data
  Capabilities'" / "Dev.to #2..." — verified byte-for-byte against
  `archive/growth-ops/tweets-v2.md` (the title text and the ellipsis-joined
  fragments are each exact). Not a finding.
- All remaining short fragments (`DEC-20260317-F` "finds none of them is
  the", `DEC-20260406-E` "page, so its status as a", `DEC-20260409-A` "and
  its rules list matches the row field for field:", etc.) are prose lead-ins
  immediately followed by the actual quoted material one line later; the
  actual quotes were checked and matched (see findings/spot-checks below).
  Not findings on their own.

### Findings

A finding is something false, fabricated, misattributed, or unverifiable.
Style is not a finding.

1. **`docs/decisions/records/DEC-20260313-C.md`, lines 68-71 — a claim
   built on a stale comment, not a checked behavior, contradicting the
   platform's own current decision.** The Consequences section asserts:
   "It does not hold on the website: the header comment of
   `apps/api/src/routes/capabilities.integration.test.ts` records that the
   frontend's `isSQSUnqualified` filter hides capabilities labelled
   'Unverified', the opposite of what this row decided (status on
   2026-09-04; the frontend repository is outside this record's
   evidence)." The quoted comment text is accurate (verified verbatim in
   the file), but the behavioral conclusion is false: `isSQSUnqualified`
   (`strale-frontend/src/components/solutions/sqs-display.ts:71` and its
   duplicate under `design/candidates/`) has zero callers in the frontend
   repository — I grepped it directly. `CLAUDE.md`'s own
   **DEC-20260904-C**, dated the day before this record's stated
   verification date, states exactly this: the filter "has had no callers
   since the 2026-08 audit follow-up," and capabilities labelled Unverified
   are listed dimmed with an "Awaiting traffic" badge, not hidden. The
   project's own memory record (`feedback_comments_are_not_evidence_check_callers.md`)
   names this precise mistake — treating a comment as evidence of
   behavior instead of checking callers — as a live lesson. This record
   repeats it, and explicitly disclaims checking the one repository
   (`strale-frontend`) that would have caught it. This is a false claim
   about production behavior, not merely a stale figure.

2. **`docs/decisions/records/DEC-20260330-B.md`, lines 68-71 — a fabricated
   quotation attributed to `context7.json`, producing a false finding.**
   The record states: "One of `context7.json`'s 12 rules cites a deleted
   endpoint. Rule 12 reads: 'Every capability has a Strale Quality Score
   (SQS) from 0-100. Check via `GET /v1/quality/:slug`.'" I read
   `context7.json`'s `rules` array in full at the pinned commit. Rule 12's
   actual text is: "There is no single 0-100 quality score anymore (the
   SQS engine and GET /v1/quality/:slug were removed 2026-05-05).
   Per-capability trust data (tested, pass_rate, last_tested_at) is public
   at GET /v1/public/ops/trust/capabilities/batch?slugs=slug1,slug2, and
   every /v1/do response carries a provenance + audit trail. Platform-wide
   counts and facts: GET /v1/platform/facts." No rule in the file contains
   the text the record quotes; the file already reflects the SQS deletion
   correctly. The record's entire "stale public copy" finding is
   therefore false, built on a quotation that does not exist in the source
   at the reviewed commit.

3. **A recurring punctuation-substitution pattern breaks byte-for-byte
   quotation fidelity in at least three places.** When quoting text that
   contains an em-dash or a multiplication sign, the record substitutes
   ASCII punctuation instead of reproducing the character:
   - `DEC-20260314-F`, Context section: quotes the Rationale as "...Strale's
     primary consumers are AI agents, AX is not a nice-to-have..." — the
     actual Notion Rationale field reads "...Strale's primary consumers are
     AI agents — AX is not a nice-to-have..." (em-dash replaced with a
     comma).
   - `DEC-20260314-A`, Consequences section: quotes
     `archive/growth-ops/tweets-v2.md` as "Dev.to #1 (week of Apr 21):
     'How We Score 297 Agent Data Capabilities', SQS methodology" — the
     file's actual text is `**Dev.to #1 (week of Apr 21)**: "How We Score
     297 Agent Data Capabilities" — SQS methodology` (em-dash replaced
     with a comma, markdown bold dropped).
   - `DEC-20260321-A`, Context section: quotes the Rationale's "4x
     overdue" — the actual Notion field reads "4× overdue" (multiplication
     sign replaced with the letter x).
   None of these alter the substantive meaning, and I judge them minor
   relative to findings 1-2, but they are real byte-level mismatches
   against the check's own "matches the row field byte for byte"
   standard, plausibly a side effect of the no-em-dash prose rule these
   sessions operate under bleeding into literal quotation.

4. **`DEC-20260315-I.md`, Consequences section — a quote correctly sourced
   to `apps/api/src/routes/do.ts` but misattributed to the wrong function.**
   The record states: "The same file's x402 settlement helper
   `settleReceiptFor` carries the comment 'the settle step runs only after
   the capability has produced output (DEC-14)'." The quoted text is
   accurate and is in `do.ts`, but it sits at line 877-878, attached to the
   `verifyX402PaymentOnly` call site inside the x402 branch of the sync
   handler — not to `settleReceiptFor`'s own definition (line 601, which
   carries an unrelated docstring about MCP/A2A rail forgeability). The
   underlying substantive claim (verify-then-settle ordering) is correct;
   the attribution of which function "carries" the comment is not.

5. **`DEC-20260314-A.md` / `DEC-20260314-B.md` — asymmetric relation
   substantiation.** Both records carry `relations: [{type: related_to,
   target: <each other>}]`. `DEC-20260314-B`'s body has a properly labeled
   "**Relation to `DEC-20260314-A`**" paragraph quoting a source sentence
   from row A's own Rationale byte-for-byte ("Blog Post #1 must be ready
   so launch day isn't just tweets into the void," — verified against the
   Notion export). `DEC-20260314-A`'s reciprocal paragraph, however, does
   not quote a source sentence from either row naming the other decision;
   it justifies the link through an external evidence file
   (`tweets-v2.md`) instead. Given the batch's own stated rule elsewhere
   ("edges must be source-stated, quoting the sentence naming the
   target"), this is an inconsistency, though a minor one — the pair as a
   whole is adequately substantiated by DEC-20260314-B's paragraph, and
   the underlying relation (both records concern the same March 24
   blog-launch sequencing) is genuinely plausible, not fabricated.

No other id-collision, filename/record_key/id, missing-section,
missing-CAUTION-banner, missing-evidence-file, or null/populated-field
mismatch was found across the 41 records. All frontmatter parsed cleanly
and every `record_key`/`id`/filename triple agreed for all 41 files (all
bare-key records in this partition — no `--notion-` or `--git-` qualified
filenames land in P2 except `DEC-20260313-F.md`, which cites but is not
itself qualified by, `DEC-20260422-A--git-3b256587.md` as evidence; that
cited file exists at the pinned commit). Every non-URL evidence path
resolved, including the four cross-repo `strale-io/strale-frontend@04c9fca9`
entries (`Header.tsx`, `App.tsx`, `Index.tsx`, `index.css`), each fetched
directly via `git show 04c9fca9:<path>` in the sibling checkout. Every
`relations` target that appears in this partition (`DEC-20260314-A`↔`B`,
`DEC-20260405-A`→`DEC-20260320-B`, `DEC-20260409-B`→`DEC-20260409-A`,
`DEC-20260409-D`→`DEC-20260409-A`/`B`, `DEC-20260411-A`→`DEC-20260302-A-0001`)
resolves to an existing record key at the pinned commit, and none targets a
bare collided id.

### Code-claim spot checks (21 total; ten is the minimum)

1. `DEC-20260314-F` — `grep -rn "completion_rate\|autonomous"
   apps/api/src/lib/metrics*` and the repo-wide variant: zero matches, as
   claimed.
2. `DEC-20260314-F` — `packages/mcp-server/README.md:78` and `:147` quote
   text (`strale_ping`/`strale_search`/... work without an API key;
   "*Free-tier capabilities work without an API key.") matches exactly.
3. `DEC-20260313-F` — `server.json:10,15` (`"version": "0.2.3"`),
   `packages/mcp-server/package.json:4` (`"version": "0.2.8"`), transport
   fields (`stdio` for the npm package, `streamable-http` /
   `api.strale.io/mcp` for the remote) all match exactly.
4. `DEC-20260314-G` — `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx`
   lines 145-147 match the record's cited `<h1>` block character for
   character.
5. `DEC-20260314-G` — `find apps/web -iname "*.tsx"` returns nothing;
   `apps/` contains only `api/` — confirmed `apps/web` does not exist yet.
6. `DEC-20260314-C` — `grep -rli "multi-llm|multi_llm|multiLLM|ChatGPT
   evaluation" docs/ apps/api/src/ apps/api/scripts/ scripts/` returns only
   the decision record itself and the generated `DECISIONS.md` index — no
   actual implementation, as claimed.
7. `DEC-20260315-B` — `test -f docs/decisions/records/DEC-20260311-A.md`
   fails (file absent), matching the record's claim.
8. `DEC-20260315-B` — `context7.json`'s `folders` array matches the quoted
   list verbatim (docs, sdk-typescript, sdk-python, mcp-server,
   langchain-strale, crewai-strale, semantic-kernel-strale,
   openai-agents-strale, pydantic-ai-strale, google-adk-strale).
9. `DEC-20260316-A` — `computeTrustGrade` in `trust-grade.ts` has zero call
   sites anywhere else under `apps/api/src`; `do.ts` imports only
   `computeFreshnessGrade` from `trust-grade.js` — both confirmed by grep.
10. `DEC-20260316-A` — `public-trust.ts` header comment ("The retired SQS
    grades, guidance strategy, and raw sub-scores are deliberately NOT
    projected...") matches verbatim at lines 27-29.
11. `DEC-20260316-B` — `test-runner.ts`'s "Removed" section
    (`persistDualProfileScores` named alongside `computeAdaptiveInterval`,
    etc., "retired with the SQS engine (DEC-20260503-B)") matches verbatim.
12. `DEC-20260317-A` — `interrupt-sender.ts`'s `sendInterruptEmail` has
    zero callers outside its own definition file; `intelligent-alerts.ts`
    imports `sendDigestEmail` from `digest-sender.ts`, not
    `interrupt-sender.ts` — both confirmed.
13. `DEC-20260317-F`/`G`/`H` — `apps/api/src/app.ts:513` comment
    ("/v1/quality/:slug retired with the SQS engine (DEC-20260503-B)")
    matches verbatim; `onboard.ts` comments near lines 6 and 244 match as
    quoted.
14. `DEC-20260317-H` — `grep -rn "0\.5" apps/api/src/lib` returns only the
    Jaccard threshold, balance threshold, ratio checks, and CSS
    letter-spacing values the record lists — no evidence-weighting
    factor, as claimed.
15. `DEC-20260318-A`/`B` — `seed.ts` is absent from `apps/api` (no
    `git ls-files` match); `onboard.ts` flag parsing recognizes
    `--dry-run`, `--backfill`, `--strict`, `--fix`, `--discover`,
    `--batch`, `--force`; the "Execute-and-Verify (Enhancement 1)" header
    exists at line 228 — all confirmed.
16. `DEC-20260320-A` — `capability-readiness.ts`'s `ReadinessCheck.dimensions`
    carries exactly the 8 named fields (`has_executor` through
    `has_limitations`); `auto-register.ts` comment reads "the previous
    filesystem-glob discovery" (not "312-line app.ts import list," as the
    record itself flags as a wording discrepancy) — confirmed both ways.
17. `DEC-20260320-E`/`F` — manifest prices (`sanctions-check.yaml`:20,
    `pep-check.yaml`:5, `adverse-media-check.yaml`:20 cents),
    `config/env-manifest.yaml`'s `OPENSANCTIONS_API_KEY` row, and
    `docs/company/DECISION-QUEUE.md`'s DQ-30 quote all match exactly.
18. `DEC-20260321-A` — no `ORDER BY schedule_tier` exists in either
    `solutions.ts` or `internal-tests.ts`; `solutions.ts:96` calls
    `worstFreshnessLevel(steps.map(...))` from `trust-labels.ts` — both
    confirmed.
19. `DEC-20260323-A` — `legacy_score` has zero matches under
    `apps/api/src`; `capability_health` table still defined in
    `schema.ts:966`; `source_health` appears only in `lifecycle.ts:148`'s
    future-tense comment — all three confirmed.
20. `DEC-20260324-A`/`C` — `x402-gateway.ts` imports
    `createFacilitatorConfig` from `@coinbase/x402` and documents the
    `auto`/`cdp`/`legacy` `X402_FACILITATOR` switch;
    `x402-gateway-v2.ts` contains the `@agentcash/discovery`,
    `x-payment-info`, and `x402scan` references cited — confirmed.
21. `DEC-20260405-A` — `swedish-company-data.ts` comment ("DEC-20260405-A
    Phase 2: replaced Allabolag scraping with direct Bolagsverket API"),
    the manifest's `data_source` line, `config/env-manifest.yaml`'s
    `BOLAGSVERKET_CLIENT_ID`/`SECRET` rows, and the migration commit date
    (`cb787ed9` → 2026-04-22, thirteen days after the row's stated
    2026-04-09 park date) all confirmed exactly.

### Unverifiable

- `DEC-20260314-B`'s note that `DEC-20260402-C` (a separate, `unclear`
  disposition row outside this batch) "was not found in the raw export
  snapshot available to this verification" — I did not have reason or
  scope to re-pull that row independently; taking the record's own
  disclosure at face value, this is correctly reported as unverifiable
  by the record itself, not a gap in my review.
- `DEC-20260410-A`'s "Silent (not on the pricing page)" claim — the
  pricing page lives in the frontend/website surface, which the record
  itself flags as outside its file-only evidence scope; I did not have a
  live pricing-page snapshot to check this against either, so it remains
  unverifiable from repository evidence alone (as the record itself
  states).
- Whether Glama's own TDQS re-scan (`DEC-20260404-A`) confirmed the
  platform's self-scored 6/6 — no such document exists in the repository
  to check, as the record itself notes; I could not independently verify
  Glama's external verdict.
- The live value of `NULL_RATIO_RULE_ENABLED` on Railway (`DEC-20260409-A`)
  — this is a deployed environment variable, not something a static
  repository checkout can confirm one way or the other; the record
  correctly frames this as unconfirmed from repo evidence.

### Partition verdict rationale

Findings 1 and 2 are substantive: one is a false behavioral claim built on
a comment instead of checked callers (contradicting the platform's own
current, dated decision on the exact subject), and the other is a
fabricated quotation that manufactures a "stale public copy" finding where
none exists. Both fail the "false, fabricated, or misattributed" bar this
review is checking for, on records that otherwise (across the other 39
files, and across 21 separately spot-checked code claims) show careful,
accurate, well-sourced work. Findings 3-5 are real but minor
quotation-fidelity and relation-substantiation issues that do not change
any record's substantive conclusion.

PARTITION VERDICT: FAIL

### P3

# M2 Closing Independent Review — Partition P3

Partition: P3
Commit: 3a7089c5b48432a3dd359acefdd048a63af5034f
Record count: 41 (DEC-20260413-A through DEC-20260507-H, per `closing-P3.txt`)

### Method

Set up a detached, read-only worktree at the pinned commit
(`C:/tmp/strale-closing-P3`) via `git worktree add --detach`, ran `npm ci`
there, and never edited or committed anything in it. Note: `closing-P3.txt`
has CRLF line endings; a naive `[ -f "$f" ]` check against the raw lines
reports every file as missing because of the trailing `\r`. Stripped `\r`
first; all 41 files exist.

Checks performed with small Python/Bash scripts, never by hand-editing
anything:

1. A YAML frontmatter parser split each file on the `---` delimiters,
   parsed the frontmatter block, and asserted `record_key == id` and
   `record_key == filename` (minus `.md`), the presence of the five
   protected `##` headings (Decision, Context, Rationale, Consequences,
   Reversal conditions), and the `> [!CAUTION]` banner in the body.
2. A relation-target script collected every `relations[].target` across the
   41 files, verified each target exists as a `record_key` somewhere under
   `docs/decisions/records/` at the pinned commit, and cross-referenced the
   full target list against `docs/decisions/id-collisions.yaml`'s bare
   collided ids to confirm none is used unqualified as a relation target.
   For each record with relations, its Context/Rationale/Consequences
   prose was read to confirm a paragraph documents the relationship (the
   literal string "Relation to" is not a heading convention used in this
   corpus — instead each record explains the relation in prose, e.g.
   "so `affirms DEC-20260424-A` is recorded" or "This decision supersedes
   `DEC-20260320-B` and is `related_to` `DEC-20260423-A`").
3. A quote-extraction script scanned each record body for double-quoted
   spans of 25+ characters immediately preceded by an attribution signal
   ("states", "reads", "quoted as", "confirms", "docstring", "comment",
   etc.), producing a candidate list of attributed quotations. Each
   candidate was then checked by hand against its named source: the
   Notion row (pulled once via `dump_rows.py` for all 40 unique page ids
   referenced in this partition's evidence[0] fields, in a single batch),
   the named repository file at the pinned commit, or the named sibling
   record.
4. A separate script walked every non-URL `evidence` entry across the 41
   files and confirmed the path exists as a file at the pinned commit; all
   resolved (no cross-repo or Notion-URL-only entries needed special
   handling in this partition — DEC-20260504-A's evidence[0] is a GitHub
   commit URL, not a Notion page).
5. Every `https://github.com/strale-io/strale/commit/<sha>` evidence entry
   (8 short and long shas) was checked with `git merge-base --is-ancestor
   <sha> HEAD` inside the pinned worktree; every `.../pull/<n>` entry (#44,
   #51, #52) was checked with `gh pr view <n> --json state,mergeCommit`.
6. Ten "status on" code claims were spot-checked by reading the named file
   at the pinned commit (listed below).

### Residual-mismatch list from the quote script and my judgement

- **DEC-20260419-A, lines 106-107: fabricated quotation.** The record
  states the CI console-call guard's "stated purpose is exactly to let one
  file grow or shrink over time as it migrates, per its own header comment
  (\"a new file added to the allowlist requires a justification
  comment\")." I read the full header comment of
  `apps/api/scripts/check-no-new-console.mjs` (lines 1-24) and grepped the
  whole file plus `console-allowlist.json`, `log.ts`, and
  `request-context.ts` for the word "justification": no match anywhere.
  The actual header comment describes a phased migration strategy and the
  guard's fail conditions; it says nothing about a justification comment
  requirement. The quoted sentence does appear, near-verbatim and
  unquoted, earlier in the same record's own `## Decision` section (lines
  65-66, "Any new file added to the allowlist requires a justification
  comment") as the record's own restated policy, not as code. The record
  then re-quotes its own prose and misattributes it to the script's header
  comment. Judgement: this is a genuine finding, not style — the record
  cites code evidence that does not exist to support a specific factual
  claim about how the guard's file-growth tolerance is documented in
  source.
- **DEC-20260506-G, lines 69-70 and 71: currency-symbol quote drift.** The
  record quotes `docs/company/CHARTER.md` as stating "External spend: EUR
  50/week" (line 399) and "spending inside the EUR 50/week envelope" (line
  43). I read both lines in `CHARTER.md` at the pinned commit: line 399 is
  `- **External spend: €50/week**` and line 43 is `spending inside the
  €50/week envelope`. The quoted text is not a byte-for-byte substring of
  the file — the record's ASCII "EUR " transliteration for "€" also adds a
  space the source does not have ("EUR 50" vs "€50"). The substance is
  accurate (same number, same commitment) and "EUR" for "€" is used
  throughout this record's own unquoted prose as a house convention, but
  here it is inside quotation marks presented as the file's own words.
  Judgement: a minor finding — the quotation is not literally exact,
  though not misleading about the fact it supports.
- **DEC-20260425-A, lines 177-180: punctuation-only quote drift.** The
  record quotes the Notion row's Decision field as "sourced from a
  manifest-declared field per capability, replacing the current
  getProcessingJurisdictions heuristic based on capabilityType and
  transparencyTag." I read the Notion row (page
  34967c87082c8127bb80fb885c4d8f23) via `dump_rows.py`: the actual text is
  "...sourced from a manifest-declared field per capability (replacing the
  current getProcessingJurisdictions heuristic based on capabilityType and
  transparencyTag)." The record silently converts the parenthetical clause
  to a comma-separated clause. Judgement: trivial, does not change meaning
  — noted for completeness, not counted as a substantive finding.
- All other candidate quotations from the extraction script (attributed to
  Notion rows in `DEC-20260415-B`, `DEC-20260427-H`, `DEC-20260427-I`
  (Rationale and Outcome fields), `DEC-20260505-A`, `DEC-20260505-B`,
  `DEC-20260505-C`, `DEC-20260507-E`; to repository files `CLAUDE.md`,
  `docs/strategy/2026-08-05-direction-plan.md`,
  `docs/decisions/records/DEC-20260812-A.md`,
  `apps/api/src/lib/provenance-builder.ts`,
  `apps/api/src/capabilities/swiss-company-data.ts`,
  `apps/api/src/capabilities/polish-company-data.ts`,
  `apps/api/src/capabilities/officer-search.ts`,
  `apps/api/src/jobs/test-scheduler.ts`, `config/env-manifest.yaml`; and to
  the sibling record `docs/decisions/records/DEC-20260508-D.md`) all
  matched byte for byte as substrings of their named source. No null field
  was found quoted, and no populated field was called null in any of the
  Notion rows pulled (each row's own null-field list, printed by
  `dump_rows.py`, was checked against what each record claims is null —
  every record in this partition correctly reports `Outcome` and
  `Superseded By` as null except `DEC-20260427-I`, whose `Outcome` is
  populated and is quoted, matching the row).

### Findings

1. **DEC-20260419-A.md, lines 106-107 — fabricated code-comment
   attribution.** The record quotes `check-no-new-console.mjs`'s "own
   header comment" as containing the sentence "a new file added to the
   allowlist requires a justification comment." That sentence does not
   appear anywhere in `apps/api/scripts/check-no-new-console.mjs`,
   `apps/api/scripts/console-allowlist.json`, `apps/api/src/lib/log.ts`,
   or `apps/api/src/middleware/request-context.ts` at the pinned commit
   (checked by reading the file and by `grep -rn "justification"` across
   all four). The sentence is the record's own restated policy from its
   `## Decision` section (lines 65-66), re-quoted and misattributed to
   source code that does not contain it.
2. **DEC-20260506-G.md, lines 69-71 — quotation not byte-for-byte.** The
   record quotes `docs/company/CHARTER.md` as saying "External spend: EUR
   50/week" and "spending inside the EUR 50/week envelope." The file
   (lines 43 and 399 at the pinned commit) reads "€50/week" and
   "€50/week", not "EUR 50/week" — the quoted string is not a literal
   substring of the file. Minor: the fact asserted (a €50/week envelope)
   is correct; only the presented "quotation" deviates.
3. **DEC-20260423-A.md — declared relation not documented in the source
   record's own body.** Frontmatter records `relations: [{type:
   supersedes, target: DEC-20260422-C}]`, but nowhere in
   `DEC-20260423-A.md`'s body does the text state or quote a source
   sentence establishing that this record supersedes `DEC-20260422-C`; the
   only mention of `DEC-20260422-C` is in Context, describing an audit
   finding, not the supersession itself. The reciprocal statement exists
   in the *target* record instead (`DEC-20260422-C.md`'s Consequences:
   "`DEC-20260423-A` superseded this record with the corrected diagnosis,
   larger scope, and staged implementation"), so the relation itself is
   true and independently confirmed, but the source record carrying the
   `relations` entry does not itself narrate or justify it, unlike its
   sibling `DEC-20260423-B.md` which explicitly states in its own
   Consequences: "This decision supersedes `DEC-20260320-B` and is
   `related_to` `DEC-20260423-A`." Judgement: a documentation-consistency
   gap, not a false or fabricated claim — the relation is correct, just
   asymmetrically documented.
4. **DEC-20260425-A.md, lines 177-180 — quotation altered punctuation.**
   See residual-mismatch note above; recorded here for completeness. Not
   counted as a material finding.

No other false, fabricated, misattributed, or unverifiable claims were
found in this partition. Every frontmatter parsed cleanly; every
`record_key`/`id`/filename triple agreed; every CAUTION banner and all
five protected sections were present in all 41 files; every evidence path
resolved (file, ancestor commit, or merged PR); every relation target
exists as a record key at the pinned commit and is never a bare collided
id.

### Ten code-claim spot checks

1. `DEC-20260504-A.md` — claims `claude-md-protocols.test.ts` enforces this
   protocol. `apps/api/src/lib/claude-md-protocols.test.ts:25` lists
   `"DEC-20260504-A", // Audit-Follow-up Test Coverage Protocol`. Confirmed.
2. `DEC-20260421-J.md` — claims `auto-register.ts` implements a
   `DEACTIVATED` map for retired capabilities. `auto-register.ts:31`
   declares `const DEACTIVATED = new Map<string, string>([...`. Confirmed.
3. `DEC-20260427-H.md` — claims 5 named capabilities (patent-search,
   trustpilot-score, salary-benchmark, employer-review-summary,
   linkedin-url-validate) are deactivated in `auto-register.ts`. All 5
   slugs appear inside the `DEACTIVATED` map (lines 153, 204, 213, 222,
   231). Confirmed.
4. `DEC-20260427-I.md` — claims the reversal condition ("a licensed
   registry or aggregator contract") has fired for all six named
   countries. `auto-register.ts` comments show
   `dutch-company-data REACTIVATED 2026-05-16`,
   `portuguese-company-data REACTIVATED 2026-05-16`,
   `lithuanian-company-data REACTIVATED 2026-04-29`,
   `spanish-company-data REACTIVATED 2026-05-16`,
   `german-company-data REACTIVATED 2026-05-06`, and
   `austrian-company-data MIGRATED 2026-08-27`. Confirmed.
5. `DEC-20260505-B.md` — claims `lifecycle.ts` retains
   `transitionCapability` and a `STATE_VISIBILITY` map post-rip-out.
   `apps/api/src/lib/lifecycle.ts:50` declares `const STATE_VISIBILITY`
   and `:76` declares `export async function transitionCapability`.
   Confirmed.
6. `DEC-20260505-C.md` — claims `matching.ts` uses `priceCents` ASC then
   `slug` ASC as the tiebreaker. `apps/api/src/lib/matching.ts:179-180`:
   `if (a.priceCents !== b.priceCents) return a.priceCents < b.priceCents;
   return a.slug < b.slug;` with a comment naming the SQS-DESC tiebreaker
   it replaces per `DEC-20260503-B`. Confirmed.
7. `DEC-20260503-B.md` — claims `test-scheduler.ts` still carries a
   comment about the retired SQS snapshot job.
   `apps/api/src/jobs/test-scheduler.ts:659`: `// Daily SQS snapshot
   retired with the SQS engine (DEC-20260503-B).` Confirmed.
8. `DEC-20260427-I.md` — claims `swiss-company-data.ts`,
   `polish-company-data.ts`, and `officer-search.ts` carry comments about
   the northdata fallback removal. Confirmed at
   `swiss-company-data.ts:6`, `polish-company-data.ts:18`,
   `officer-search.ts:12`.
9. `DEC-20260419-A.md` — claims the console guard is wired into CI via
   `apps/api/scripts/check-no-new-console.mjs`. `.github/workflows/ci.yml`
   line 299 runs `npm --workspace=apps/api run lint:no-new-console`, and
   `apps/api/package.json:17` maps that script to `node
   scripts/check-no-new-console.mjs`. Confirmed.
10. `DEC-20260428-B.md` / `DEC-20260428-A.md` — claim supporting research
    documents exist. `docs/research/2026-04-28-payee-assurance-build-vs-buy.md`
    (218 lines) and `docs/research/2026-04-28-us-business-data-vendor-longlist.md`
    both exist at the pinned commit. Confirmed.

### Unverifiable

- Nothing in this partition was left unverifiable. Every evidence entry,
  relation target, quoted Notion field, quoted repository file, and
  sampled code claim resolved to a definite true/false result at the
  pinned commit.

PARTITION VERDICT: FAIL

### P4

# M2 Closing Independent Review — Partition P4

Commit reviewed: `3a7089c5b48432a3dd359acefdd048a63af5034f`
Record count: 41 (DEC-20260507-I through DEC-20260904-B, per `closing-P4.txt`)
Reviewer: fresh read-only Claude agent, no authorship of any candidate record.

Setup note: `closing-P4.txt` has CRLF line endings; a naive line read on
Windows/Git-Bash leaves a trailing `\r` on every filename and every file
"appears missing." Stripped with `tr -d '\r'` before use; all 41 files exist
at the pinned commit.

### Method

1. Parsed frontmatter of all 41 records with a small Python script: verified
   `record_key`/`id` match each other and match the filename (bare key = its
   id; none of my 41 files are `--notion-`/`--git-`-qualified), the CAUTION
   banner is present, and all five protected sections (`## Decision`,
   `## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`)
   are present. Zero structural failures.
2. Parsed the `relations:` block of each record, confirmed every target key
   exists as a file under `docs/decisions/records/` at the pinned commit,
   and checked for a `**Relation to \`TARGET\`.**`-style paragraph in the
   body (the convention used pervasively elsewhere in the corpus, confirmed
   by grep against February/March-batch records). Cross-checked every
   relation target against `docs/decisions/id-collisions.yaml`'s collided-id
   list (none of my targets are bare collided ids).
3. Parsed the `evidence:` block of each record: local repo paths checked
   with `os.path.exists` at the pinned worktree; GitHub PR/commit URLs
   checked with `gh pr view` / `git cat-file -t` + `git merge-base
   --is-ancestor`; cross-repo `strale-io/strale-frontend@<sha>:<path>`
   entries were only partially checked (see Unverifiable).
4. Extracted every double-quoted span of 25+ characters from each record
   body (113 raw matches; my regex over-splits some multi-clause sentences
   at internal quote marks, so several "matches" below are artifacts of the
   extraction, not real quotes — resolved by reading the surrounding
   prose). For quotes attributed to "the row's own X states", fetched the
   corresponding Notion rows once via `dump_rows.py` (36 page ids, all
   resolved, 36/36 rows returned) and substring-matched against the
   row's actual field text. For quotes attributed to repo files (code
   comments, other decision records, manifests, CLAUDE.md, program docs),
   grepped the named file directly. Elisions marked with `...` in a quote
   were checked by confirming both sides of the elision are contiguous in
   the source field, not by literal substring match.
5. Selected ten "status on" code claims (listed below) and verified each by
   reading the named file at the pinned commit.
6. Removed the worktree with `git worktree remove` (never `rm -rf`).

### Residual-mismatch list (from the automated substring pass) and judgement

My first-pass automated substring matcher (whitespace-normalized) flagged
roughly 65 of 113 quoted spans as "not found." Reviewing each by hand:

- The large majority are artifacts of extracting quotes at 25+ characters
  across sentences containing multiple short quoted terms (e.g. `"Commerce
  Amber"`, `"Execution Coral"`, `"we"`) — my regex grabbed the unquoted text
  between two separate quoted terms as if it were itself quoted. Manually
  re-reading each of these confirmed the actual quoted terms are present
  and accurate (verified against Notion rows and files individually; see
  the code-claim spot checks below for the technical ones).
- Several are legitimate abridgements marked with an internal `...`
  (DEC-20260511-B's and DEC-20260511-F's Rationale quotes) — both sides of
  the ellipsis are contiguous in the source Rationale field; not a
  misquote.
- One is a genuine mismatch: **DEC-20260510-A** quotes
  `handoff/README.md` as currently reporting `"244 files (217 with a
  recorded intent, 27 without)"`. At the pinned commit, `handoff/README.md`
  line 12 reads `"257 files (230 with a recorded intent, 27 without)."`
  The record itself flags the count as one "that moves with every handoff,"
  which is true, but the specific figures quoted are not the figures in the
  file at `REVIEW_COMMIT`. See Finding 1.
- One is unresolved and reported as unverifiable: **DEC-20260511-C**'s
  quote `"CC does not reconcile silently"` attributed to "the 2026-05-13
  cleanup prompt." See Finding 2.
- One is a trivial capitalization mismatch from mid-sentence quoting
  (DEC-20260515-A quotes CLAUDE.md's `"supersedes DEC-20260502-A..."`
  lowercase; the source sentence begins `"Supersedes DEC-20260502-A..."`
  with a capital S because it opens a new sentence in CLAUDE.md). Style,
  not a finding, noted for completeness.

### Findings

1. **DEC-20260510-A.md, line 75-76: stale quoted figures from an
   auto-generated file, false at the pinned commit.** The record's
   Consequences section states: `handoff/README.md` currently reports
   `"244 files (217 with a recorded intent, 27 without),"` a count that
   moves with every handoff. At `3a7089c5b48432a3dd359acefdd048a63af5034f`,
   `handoff/README.md` line 12 actually reads `257 files (230 with a
   recorded intent, 27 without).` The record's own text acknowledges the
   figure is a moving target and says it "cites it only as of this
   verification," but the verification method for this review is the
   pinned commit, and the quoted string is not a substring of the file
   there. This is the kind of drift the record itself warns about,
   materialized against the actual review commit.

2. **18 records in this partition carry a `relations:` frontmatter entry
   (21 edges total) with no "Relation to" paragraph anywhere in the body,**
   contrary to the convention used pervasively elsewhere in this corpus
   (confirmed present, e.g., in `DEC-20260225-P-m5n6.md`,
   `DEC-20260314-B.md`, `DEC-20260406-A--notion-...md`). Affected records
   and their un-narrated targets:
   - `DEC-20260508-A.md` → `DEC-20260507-H` (amends)
   - `DEC-20260508-D.md` → `DEC-20260505-H` (amends)
   - `DEC-20260511-B.md` → `DEC-20260503-B` (amends)
   - `DEC-20260511-C.md` → `DEC-20260420-A` (affirms)
   - `DEC-20260511-E.md` → `DEC-20260511-F` (related_to)
   - `DEC-20260515-A.md` → `DEC-20260430-A` (amends)
   - `DEC-20260515-B.md` → `DEC-20260515-A` (affirms)
   - `DEC-20260518-B.md` → `DEC-20260518-A` (related_to)
   - `DEC-20260518-C.md` → `DEC-20260518-B` (amends)
   - `DEC-20260518-F.md` → `DEC-20260428-A` (interprets)
   - `DEC-20260518-G.md` → `DEC-20260518-E` (amends)
   - `DEC-20260812-A.md` → `DEC-20260503-A` (supersedes)
   - `DEC-20260813-A.md` → `DEC-20260518-F` (affirms), `DEC-20260428-A`
     (interprets)
   - `DEC-20260815-A.md` → `DEC-20260812-A` (amends)
   - `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md` →
     `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH` (related_to)
   - `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md` → three `related_to`
     targets (the other three homepage use-case worlds)
   - `DEC-20260822-A.md` → `DEC-20260815-A` (amends)
   - `DEC-20260901-A.md` → `DEC-20260831-A` (supersedes)

   All 21 targets do exist as record keys at the pinned commit (checked
   programmatically; none are bare collided ids per
   `docs/decisions/id-collisions.yaml`), so the relation edges themselves
   are not fabricated — the content substantiating each relation is present
   in ordinary Context/Rationale prose in every case I read (e.g.
   `DEC-20260508-A` discusses `DEC-20260507-H`'s "imprecise rationale" at
   length in its `## Context` section), but never under the corpus's
   established "Relation to" citation convention the closing-review method
   asks reviewers to check for. This is a consistent, partition-wide gap
   rather than an isolated slip, and it is the kind of structural
   compliance gap the review method treats as a checked item, not a style
   nit.

### Unverifiable

- **DEC-20260511-C.md**: the quote `"CC does not reconcile silently"`
  attributed to "the 2026-05-13 cleanup prompt" cannot be confirmed. The
  only committed evidence artifact for that session,
  `handoff/_general/from-code/2026-05-13-drizzle-quirks-verification.md`,
  does not contain this phrase anywhere. The exact phrase does appear
  verbatim, but in a different, unrelated file:
  `handoff/_general/from-code/2026-05-06-chromium-phase3-halt-partial-flag-survival.md`
  (a Chromium-boot halt, one week earlier, unconnected to the drizzle
  topic). It is plausible this is a recurring idiom used across multiple
  live chat halts that was never separately committed for the 2026-05-13
  session, in which case the quote is honest but its specific citation is
  unverifiable from repo state; it is equally possible this is a
  misattributed borrowing from the wrong file. I cannot resolve which from
  read-only repo inspection alone.
- **Cross-repo evidence in `strale-io/strale-frontend`**: I did not
  independently clone/fetch `strale-io/strale-frontend` to confirm
  `strale-io/strale-frontend@04c9fca970d82b2c98145973816d52086b3b91d7:public/_headers`
  (cited by `DEC-20260513-A.md`) or the seven
  `strale-io/strale-frontend@f704cb2:docs/website-redesign/...` paths cited
  by the six `DEC-20260820-*-WEBSITE-*` records. These were not resolved
  against the sibling repository in this session; reported as unverifiable
  rather than passed.
- Full byte-for-byte verification of every one of the 113 extracted quoted
  spans against source, beyond the ten code-claim spot checks and the
  Notion-row cross-check described above, was not exhaustively re-run
  after the residual-mismatch triage; the triage itself, however, covered
  every flagged span by hand.

### Ten "status on" code-claim spot checks

1. **DEC-20260507-J**, Consequences: `apps/api/src/lib/test-runner.ts` never
   calls `recordFailure` (confirmed — it calls `recordTestEvidence` at line
   866); `recordFailure(` has exactly four call sites, all in
   `apps/api/src/routes/do.ts` (lines 1773, 1955, 2305, 2868). Comment
   quotes at `apps/api/src/lib/circuit-breaker.ts:190` ("Until now nothing
   routed them here...") and `:196` ("91 such refusals across 8
   capabilities...") match verbatim.
2. **DEC-20260511-B**, Consequences: `apps/api/src/lib/startup-migrations.ts`
   defines `runMigration0066_ensureEligibilityColumnAndReconcile` at line
   610 and its comments at lines 574/601/623 confirm the 0066/0069
   partition the record describes (0066 owns unclassified capabilities;
   0069 owns classified ones).
3. **DEC-20260511-C**, Consequences: `apps/api/drizzle.config.ts` exists;
   `drizzle-kit` is a devDependency at `apps/api/package.json:61`;
   `.github/workflows/ci.yml:176` runs `npx drizzle-kit push --force` in
   the integration-db lane only. All three claims true at the pinned
   commit.
4. **DEC-20260513-B** / **DEC-20260513-D**, Consequences: `apps/api/src/db/
   schema.ts` lines 971/973/980 confirm `capability_health` has `state`,
   `consecutive_failures`, `backoff_minutes` columns and no `pinned` /
   `manual_override` column (grep for both terms across `schema.ts`
   returns nothing).
5. **DEC-20260513-C**, Rationale/Consequences: `apps/api/src/jobs/
   test-scheduler.ts` comments at lines 230 ("Two-arg form...") and 310
   ("Per DEC-20260503-B + DEC-20260513-D (per-suite spread)") match
   verbatim.
6. **DEC-20260515-A**, Consequences: `manifests/us-sec-filings-extended.yaml`
   states "Extended SEC EDGAR filings search via sec-api.io." and
   `docs/company/DECISION-QUEUE.md:18` states "leave Cobalt, EINsearch and
   sec-api in place" — both match the record's quotes verbatim.
7. **DEC-20260515-C**, Consequences: `manifests/slovenian-company-data.yaml`
   lines 121-136 (limitations block) match the record's quotes verbatim,
   including the "Reactivation trigger: paid AJPES restPrsInfo contract
   with redistribution rights, or a future EU High-Value-Dataset
   expansion" sentence.
8. **DEC-20260518-A** / **DEC-20260518-D**, Consequences:
   `apps/api/src/capabilities/uk-company-data.ts:227` and
   `apps/api/src/capabilities/danish-company-data.ts` set
   `ubo_availability_reason` strings matching the record's quotes verbatim
   ("Beneficial ownership data available via UK PSC register." /
   "Danish beneficial ownership data integration in progress; coverage in
   v1.1.").
9. **DEC-20260518-B**, Consequences: a grep for `use_case_tier` across
   `apps/api/src`, `manifests/`, `docs/company/claims.yaml` returns zero
   matches (confirmed); "Continuity" occurrences in
   `apps/api/src/lib/dependency-manifest.ts`,
   `apps/api/src/routes/transactions.ts`, `apps/api/src/routes/verify.ts`
   are all audit-chain-hash continuity language, not a product-tier label
   (confirmed by reading each cited line).
10. **DEC-20260904-B**, Decision: the exact regex
    `^DEC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:--notion-[0-9a-f]{32}|--git-[0-9a-f]{7,40})?$`
    appears verbatim in `docs/project/schemas/decision-record.schema.json`
    (lines 25 and 91) and `scripts/decision-records-lib.mjs` (line 26).

### Additional evidence checks performed

- All 41 records: frontmatter valid, `record_key`/`id`/filename agree, all
  bare-key (none `--notion-`/`--git-`-qualified in this partition), CAUTION
  banner and all five protected sections present.
- All local-repo `evidence:` file paths across all 41 records exist at the
  pinned commit (programmatic check, zero misses).
- GitHub commit evidence (`e04601e2f...`, `5eeff8baf8...`,
  `ef9f6649c59...`, `86b04be6d3...`, `3f7f650ff0...`) all resolve as real
  commits and are ancestors of `HEAD` in the pinned worktree.
- GitHub PR evidence (#60, #65, #83, #88, #116, #131, #137, #361, #362,
  #410) all resolve to real PRs on `strale-io/strale`. One caveat: **PR #60**
  (cited by `DEC-20260507-J.md`) is `CLOSED`, not merged
  (`mergedAt: null`). The record's actual code claims do not depend on PR
  #60 having merged — they are independently verified against
  `test-runner.ts`/`circuit-breaker.ts` at the pinned commit (see spot
  check 1) — but the PR itself never shipped as cited.
- Relation targets: all 21 edges resolve to real record keys at the pinned
  commit; none are bare collided ids per `id-collisions.yaml`.
- Notion row cross-check: 36 page ids resolved via `dump_rows.py`, 36/36
  rows returned. Spot-verified null-field claims (e.g. `DEC-20260507-J`'s
  "the row's own Rationale field is null" — confirmed `Rationale: None` in
  the row) and populated-field quotes (11 direct verbatim matches plus 2
  legitimate ellipsis-abridged matches, manually confirmed).

### Partition verdict

Two findings: one stale/false quoted figure from an auto-generated file
against the pinned commit (DEC-20260510-A), and a corpus-wide compliance
gap where 18 of 41 records declare relation edges without the required
"Relation to" narrating paragraph. One further item (DEC-20260511-C's
"CC does not reconcile silently" quote) is unverifiable rather than
confirmed. Cross-repo frontend evidence for 7 entries across 7 records was
not independently resolved.

PARTITION VERDICT: FAIL

### P5

# Closing review — Partition P5

Commit: `3a7089c5b48432a3dd359acefdd048a63af5034f`
Partition: P5 (collision layer — 17 collisions, 34 source-qualified records, `DEC-20260225-P-c5d6` through `DEC-20260420-H`)
Record count: 34 files, exactly as listed in `closing-P5.txt`.

### Method

Set up a detached worktree at `C:/tmp/strale-closing-P5` pinned to the review commit (no `npm ci` was needed since nothing in this partition's checks executes application code; all checks are static reads). For each of the 34 records: parsed frontmatter with a small Python script (regex-based, no YAML edge cases hit) and checked `record_key`/`id`/filename agreement, the CAUTION banner, and the five protected sections. Checked every `evidence` path (local repo paths via `git cat-file -e <commit>:<path>`, cross-repo `strale-io/strale-frontend@04c9fca9:<path>` via `git show` in the sibling checkout) exists. Checked every `relations` target exists as a record key at the commit (via `git ls-tree -r` over `docs/decisions/records/`) and is never a bare collided id from `docs/decisions/id-collisions.yaml`.

For quotation verification (check 3), wrote a Python script that extracts every double-quoted span ≥25 characters from each record's body and tests it as a substring of: the record's own attributed Notion row (dumped via `dump_rows.py` for all 34 page ids), every evidence-listed repo/frontend file, any inline-referenced sibling decision record, and CLAUDE.md — after normalizing whitespace (markdown line-wrap), smart quotes, and em/en-dashes, and splitting on literal `...` elisions to check each fragment as an ordered substring. The first two passes produced many false "unmatched" results that were markdown-formatting artifacts (backticks around code identifiers inside a quote, whitespace reflow, ellipsis truncation) rather than real mismatches; each was manually re-verified with a targeted `grep` against the specific file the record claimed as the source before being accepted as correct. Two residual mismatches survived manual re-verification and are recorded as findings below.

For check (8), extracted the collision entry for each of the 17 ids from `docs/decisions/id-collisions.yaml` and cross-referenced every `source_page_id`/`disposition`/`record_key` triple against the corresponding row in `docs/project/m2-closure-register.yaml`'s `decision_rows`, and read all 17 `archive/sessions/2026-09-05-decision-collision-resolution-DEC-*.md` reports in full, checking their frontmatter `source_rows` against the registry and their "Implementation reconciliation" section's file citations against the checked-out tree.

### Residual-mismatch list (from the quote-verification script) and judgement

After the automated pass, 32 of 172 quotes (≥25 chars) remained unresolved against my candidate set. I individually re-verified all 32 by grepping the specific source the record names. Judgement:
- 30 were false positives of my matcher (markdown backticks around an inline code term inside an otherwise-correct quote, a line-wrap splitting a quoted phrase across a newline, an elision using `...` that my parser mis-split, or single-quote marks nested inside the outer double-quote pair). All 30, on manual re-check, are byte-correct against their named source once the incidental markdown formatting is discounted. Not findings.
- 2 are genuine, both in the same record, `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`. See findings 1 and 2 below.

### Findings

1. **Misquotation of the Notion row's Rationale (minor, word insertion).** `docs/decisions/records/DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`, line 77, quotes the row as saying `"one INSERT on the failure path"`. The row's actual `Rationale` field (confirmed via `dump_rows.py PAGE:31267c87082c81279b14f3859f6f2038`) reads: `"...Costs 1 hour to implement (one table, one INSERT on failure path)..."` — no "the". The quoted span in the record inserts a word not present in the source. Non-substantive (does not change meaning) but fails the byte-for-byte requirement.

2. **Misquotation of CLAUDE.md (minor, punctuation substitution).** Same file, line 81, quotes CLAUDE.md as: `"DEC-20260225-P-c5d6: 6th table, failed_requests (id, user_id, task, category, max_price_cents, created_at) logs every no_matching_capability response,"`. `CLAUDE.md` line 270 (confirmed by direct read at the review commit) actually reads `"...6th table — failed_requests..."` with an em dash, not a comma, between "6th table" and "failed_requests". The quoted span in the record silently substitutes an em dash for a comma. Non-substantive but fails the byte-for-byte requirement.

No other false, fabricated, or misattributed content found across the 34 records. No null field is quoted as populated or vice versa anywhere in the partition (checked all 34 rows' null-field lists from `dump_rows.py` against every record's explicit null-field claims — all consistent, see spot list below). No relation target is a bare collided id; all relation targets resolve to an existing record key at the commit. All 34 records have the CAUTION banner and all five protected sections. All `record_key`/`id`/filename triples agree.

**Structural observation, not counted as a finding (style/format, per the instructions):** ten of the 34 records (the multi-relation `DEC-20260420-D` through `DEC-20260420-H` chain, plus `DEC-20260406-C` and `DEC-20260409-C`) declare `relations` targets in frontmatter but do not use the literal `"Relation to \`X\`."` template sentence in the body for every target. Instead they discuss the row's own "References" field (quoted verbatim, e.g. "DEC-20260420-A through DEC-20260420-G (complete SA.2 + F-A series)") and reason about which named ids the collapsed range actually covers. This substantively satisfies the intent of check (6) — the relation is sourced and quoted — but departs from the template phrasing used by the other 24 records in the partition. Every relations target in these records was independently confirmed to exist as a record key and is discussed with an accurate, sourced quotation; I did not treat this as a finding since content is not false or fabricated, only differently formatted.

**Minor evidence-completeness observation, not a finding:** `DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md` quotes and cites `archive/sessions/strale-spike-correlation-analysis-2026-04-08.md` in its body (confirmed correct against that file) but does not list that path in its frontmatter `evidence:` array. The check requires every listed evidence entry to exist (it does, for all listed entries), not that every file discussed be listed; noted for completeness only.

### Check (8): registry and register binding — all 34 records, PASS

For all 17 collisions in this partition, `docs/decisions/id-collisions.yaml` records `resolution_status: resolved` and, for every one of the 34 records, an entry with `disposition: formal_record` and a `record_key` matching the record's filename exactly. Cross-referenced against `docs/project/m2-closure-register.yaml`'s `decision_rows`: all 34 corresponding rows (matched by `page_id`) carry `disposition: formally_migrated`, the same `record_key`, a `collision` block with `resolution_status: resolved` and `row_disposition: formal_record`, and an `evidence` entry equal to `docs/decisions/records/<record_key>.md`. Zero mismatches found by script (verified programmatically, 34/34 clean).

All 17 resolution reports (`archive/sessions/2026-09-05-decision-collision-resolution-DEC-*.md` for the 17 ids in this partition) exist. Each report's frontmatter `source_rows` list (checked all 17 in full) matches the corresponding `id-collisions.yaml` collision entry exactly on `source_page_id`, `disposition`, and `record_key` for every row, including the non-formal-record sibling rows (`documented_only` rows for `DEC-20260409-C`'s superseded sibling and `DEC-20260420-D`'s duplicate-title sibling, correctly reflected with matching `rationale` text in both places).

Every "Implementation reconciliation" section's code-file citations were checked to exist at the review commit (see the file list verified below); no citation named a file absent from the tree.

### Ten code-claim spot checks (file, line)

1. `apps/api/src/db/schema.ts` — `failedRequests` table definition exists with `task`, `category`, `maxPriceCents`, `userId` columns (DEC-20260225-P-c5d6, first sibling). Confirmed present.
2. `apps/api/src/capabilities/au-company-data.ts` — reads `process.env.ABN_LOOKUP_GUID` (DEC-20260320-C). Confirmed, line reads `process.env.ABN_LOOKUP_GUID`.
3. `apps/api/src/capabilities/auto-register.ts`, line 19 — header comment: "The previous filesystem-glob discovery pulled in test files..." (DEC-20260320-C, second sibling). Confirmed verbatim.
4. `apps/api/src/lib/platform-facts.ts`, line 14 — "free-tier list: 5 in marketing, 11 in manifests, 5 different in production" header comment (DEC-20260320-J / DEC-20260320-K). Confirmed verbatim.
5. `apps/api/src/lib/solution-executor.ts` — exports `parsePath`/`walkPath`, `resolveInputRef` doc comment describing `$input.<path>` / `$steps[N].<path>` (DEC-20260406-B). Confirmed present.
6. `apps/api/src/routes/transactions.ts`, line 142 — `// F-A-005: explicit body redaction marker. input, output, error,` (DEC-20260420-E). Confirmed verbatim (record's quote elides the rest with "...").
7. `apps/api/src/lib/audit-token.ts` — carries "F-A-007: optional rotation fallback" and "F-A-006: default token TTL. 90 days" comments (DEC-20260420-F). Confirmed present.
8. `apps/api/src/routes/verify.ts`, line 24 — `const MAX_DEPTH = 50;` (DEC-20260420-G). Confirmed.
9. `apps/api/scripts/onboard.ts`, line 105 — `case "ai_assisted": return "ai_assisted";` (DEC-20260420-H). Confirmed.
10. `apps/api/src/lib/audit-helpers.ts` — comment states the `detectPersonalData` heuristic "was removed after migration 0050" (SA.2b.d) (DEC-20260420-D and DEC-20260420-H, cross-referenced). Confirmed verbatim, line 40.

Additional cross-repo spot check: `strale-io/strale-frontend@04c9fca9:src/lib/trust-display.ts`, line 2 — "Every component rendering trust data must call getTrustDisplayState() first." (DEC-20260304-C). Confirmed.

### Unverifiable

Nothing in this partition was left unverifiable. All 34 evidence lists, all relation targets, all collision/registry bindings, and all 17 resolution reports were fully readable at the pinned commit and cross-checked. The only items not independently confirmable are the ones the records themselves already flag as such (e.g. whether a Dev.to post or Show HN submission was ever published outside version control, whether production database rows for the ~42 unaccounted KYB solutions are still `is_active`) — these are correctly reported as unconfirmed by the records under review, not gaps in this review.

### Partition summary

34/34 records structurally valid (frontmatter, banner, sections, key/id/filename agreement). All evidence paths exist at the commit (local and cross-repo). All relation targets exist as record keys and are never bare collided ids. No null-field misattribution found. 2 minor, non-substantive misquotation findings (both in the same record, both punctuation/word-level, neither changing meaning) out of 172 quoted spans checked. All 17 collisions in this partition are `resolved` with clean registry/register/resolution-report bindings across all three artifacts (id-collisions.yaml, m2-closure-register.yaml, resolution reports).

PARTITION VERDICT: PASS

### P6

# Closing review — Partition P6

Commit reviewed: `3a7089c5b48432a3dd359acefdd048a63af5034f`
Record count: 33 (32 `--notion-` qualified records plus 1 `--git-` qualified record, `DEC-20260422-A--git-3b256587`)
List source: `closing-P6.txt`

### Method

Set up a detached, read-only worktree at the review commit (`C:/tmp/strale-closing-P6`) and ran `npm ci` there; made no edits. Read every one of the 33 record files in full, plus every relation target they point to, plus `docs/decisions/id-collisions.yaml` in full, plus the relevant sections of `docs/project/m2-closure-register.yaml`.

Scripts used, one sentence each:

- `p6_verify.py` — for every record: parses frontmatter, checks `record_key`/`id`/filename agreement per the qualifier grammar, checks the CAUTION banner and the five protected sections are present, and checks every non-URL `evidence` entry resolves to a file at the review commit (cross-repo entries checked separately against `strale-frontend`). Result: zero findings across all 33 files.
- `p6_quotes.py` — extracts every double-quoted span of 25+ characters from each record's body and tests it (after whitespace normalization) as a substring of: the record's own Notion row (all string fields concatenated), any of the 32 fetched Notion rows, or the concatenated text of every record file in `docs/decisions/records/`. Result: 243 quotes checked, 0 residual (no quote failed to match somewhere). I then manually re-verified a sample of the most consequential of these against the actual authoritative source file (not just "matched somewhere") — code files (`capability-persistence.ts`, `onboard.ts`, `trust-helpers.ts`, `test-scheduler.ts`, `platform-facts.ts`), the cross-repo frontend file, and sibling decision records (`DEC-20260812-A.md`, `DEC-20260428-A.md`, `DEC-20260314-G.md`) — all confirmed correct on direct inspection (see residual-mismatch judgement below and the ten spot checks).
- `p6_collisions.py` — parses `id-collisions.yaml`, and for each of its 35 collisions checks `resolution_status: resolved`, that the `resolution_evidence` file exists at the review commit, and that its frontmatter `source_rows` list (page id, disposition, record_key triples) matches the collision entry's `records` list exactly (as sets). Result: 0 issues, all 35 pass.
- `p6_check8.py` — for each of the 32 `--notion-` records in my list, finds the `id-collisions.yaml` entry for the bare id, confirms the matching `source_page_id` row has `disposition: formal_record` and the same `record_key`, then finds the matching page id in `m2-closure-register.yaml`'s `decision_rows:` block and confirms `disposition: formally_migrated` with the same `record_key`. Result: 0 issues, all 32 pass.
- Manual checks (not scripted): the `--git-` record's provenance commit is a real, full 40-hex-sha commit and an ancestor of the review commit (`git merge-base --is-ancestor` — confirmed); the register's `formal_records:` entry for that record carries `source_kind: git-native`, `source_rows: []`, and `git_provenance` matching the record's own `evidence[0]` exactly (confirmed); the register's cross-surface `decision_rows` entry for the Notion-row twin of `DEC-20260422-A` is `resolved_collision` / `row_disposition: documented_only` with a cited gap report naming the page id (confirmed, per DEC-20260904-B's mechanism).

### Residual-mismatch list and judgement

The quote script produced zero unmatched quotes. During spot-checking I hit two apparent mismatches on manual grep that turned out to be tooling artefacts, not record errors, and I record my judgement on both:

1. `DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md`'s Context section states the documented-only twin row's "own `Superseded By` content is fully captured by this row's own text." The twin row's formal Notion `Superseded By` *property* is in fact `null` (confirmed via `dump_rows.py PAGE:34867c87082c81dc803bc3709bd5fdd6`); what is captured is the informal supersession statement embedded in that row's own `Decision` field text ("SUPERSEDED 2026-04-20 by DEC-20260420-K..."). The phrase is not inside quotation marks and is not presented as a quote of the property field, so I judge this a defensible paraphrase, not a violation of check (4) — but it is worded loosely enough that a reader could mistake "Superseded By content" for the named property. Not counted as a finding.
2. A first-pass `grep`/`tr` attempt to verify "Retire Counterparty Assurance as Strale's primary framing; compliance work becomes a separate track that requires customer evidence" (quoted identically in three of my records) against `DEC-20260812-A.md` failed because the quote spans a line-wrap in the source Markdown and my shell quoting mangled the apostrophe. A Python substring check with whitespace normalization confirms the quote is exact and present in that record's Decision section. Not a finding; recorded here because it worried me on first pass.

### Findings

1. **File:** `docs/decisions/records/DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md`, **line 43.** **Evidence:** the Consequences section states `config/env-manifest.yaml` "carries eight `HMRC_*` rows (`HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_REQUESTER_VRN`, `HMRC_SANDBOX_CLIENT_ID`, `HMRC_SANDBOX_CLIENT_SECRET`, `HMRC_TEST_VRN`, `HMRC_USE_SANDBOX`)". The parenthetical lists exactly seven names, and `grep -n "^- name: HMRC" config/env-manifest.yaml` at the review commit returns exactly those same seven rows and no eighth. The record's own prose ("eight") contradicts both its own enumerated list and the actual file. This is a small but genuine internal/factual inconsistency — the count should read "seven."

No other false, fabricated, misattributed, or unverifiable claims were found across the 33 records, their frontmatter, their evidence, their relations, or the collision/register bindings.

### Ten code-claim spot checks (file and line)

1. `apps/api/src/lib/capability-persistence.ts:303` — "OUTSIDE the transaction. Design doc §4.3" confirmed verbatim. (Claimed by `DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md`.)
2. `apps/api/src/jobs/onboarding-retry.ts:4` — header states the hook was moved outside the transaction "since the DEC-20260421-B correction," confirmed verbatim. (Same record.)
3. `apps/api/scripts/onboard.ts:135,147,151,158,1597-1607` — `--force-override-authority` guard, "Cluster 2 Phase 4a" label, batch-mode refusal, interactive-TTY requirement, all confirmed present. (Claimed by `DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md` and `DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md`.)
4. `manifests/*.yaml` `data_source_type` distribution — `grep -h "^data_source_type:" manifests/*.yaml | sort | uniq -c` returns exactly api 224+1, computed 81, scrape 32, reference 3, ai_assisted 1 (342 total), confirmed exactly as claimed. (Claimed by `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md`.)
5. `manifests/*.yaml` PII-field coverage — `grep -lE "processes_personal_data|personal_data_categories" manifests/*.yaml | wc -l` returns 342 of 342, confirmed. (Claimed by `DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md` and `DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md`.)
6. `manifests/estonian-company-data.yaml:54-57` — `registry_code: "17449106"`, `company_name: Bolt App Services AS`, confirmed exact match. `manifests/spanish-company-data.yaml:62-63` — `company_name: CONSTRUCCIONES AMENABAR SA`, `nif: A20072302`, no `cif` field and no "Inditex" anywhere, confirmed the claimed drift. (Both claimed by `DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md`.)
7. `apps/api/src/lib/trust-helpers.ts:367,375,386` — `"manifest_drift"` category, the "DEC-20260513-B + DEC-20260513-C" attribution comment, and the `guaranteed_field_missing:` branch, all confirmed verbatim as claimed (including the record's own claim that the code comment's attribution is a misattribution — `DEC-20260513-B.md`/`DEC-20260513-C.md` do describe unrelated subjects on inspection). (Claimed by `DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md`.)
8. `apps/api/src/lib/platform-facts.ts:137-138` (`STALE_VENDORS`) — comment "IBAN/name match — all rejected per DEC-20260430-A" followed by `SurePay, MonitorPay, Movitz, Banfico, iPiD, Bottomline, Yapily`, confirmed exactly as claimed, including all four launch-gate vendors plus the three extra ones the record notes. (Claimed by `DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md`.)
9. `apps/api/src/jobs/test-scheduler.ts:368,398-399` — `c.cost_class IN ('free_quota', 'paid_with_free_tier')` and `c.cost_class = 'free_unlimited' OR c.cost_class IS NULL`, confirmed exactly as claimed. (Claimed by `DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md`.)
10. `config/env-manifest.yaml:776-778` — `OPENAPI_ENABLED` "MUST stay 'false' in production until the resale addendum is countersigned" and the `OPENAPI_COM_EMAIL` cost_note referencing "Openapi case 151296," confirmed verbatim. (Claimed by `DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md`.)

Two additional checks beyond the required ten, performed because they carried cross-repo evidence: `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` — the live H1 ("One API call.<br />Verified data your agent can trust.") and the section-2 `SolutionsShowcase` comment/component, both confirmed exactly as claimed against the frontend commit (claimed by `DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md` and `DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md`).

### Collision registry and register audit (id-collisions.yaml, 35 collisions)

- `collision_count: 35` matches the actual length of the `collisions:` list (35).
- All 35 have `resolution_status: resolved`.
- All 35 `resolution_evidence` paths exist as files at the review commit, and every one's frontmatter `source_rows` list matches its collision entry's `records` list exactly (page id, disposition, record_key triples, checked as sets) — 0 mismatches.
- All 5 `documented_only` records across the file carry a non-empty `rationale` field.
- For my 32 `--notion-` records specifically: each has a matching `id-collisions.yaml` entry with `disposition: formal_record` and the same `record_key`, and a matching `m2-closure-register.yaml` `decision_rows:` row with `disposition: formally_migrated` and the same `record_key` — 0 issues across all 32 (check (8) satisfied for every record in my partition).
- Register `counts.decision_rows`: `unresolved_collision: 0`, `not_yet_reconciled: 0`, `formally_migrated: 224`, `resolved_collision: 6`, `intentionally_historical: 77`, `obsolete_or_superseded: 6`, `unclear: 5`, `total: 318`. Direct enumeration of the public `decision_rows:` block (lines 1479-4991, immediately before `plan_statements:`) found exactly 307 rows with dispositions `formally_migrated` (224), `intentionally_historical` (77), `resolved_collision` (6) — 307 total, zero rows with `unresolved_collision` or `not_yet_reconciled`. The remaining 11 (`obsolete_or_superseded: 6`, `unclear: 5`) are declared in the register's `private_rows:` block (external repo `strale-io/strale-context-archive`, `counts_by_disposition` matching, `not_yet_reconciled: 0` there too) with its own verification script named (`scripts/m2-closure-verify-private-rows.mjs`) — I did not run that script myself (it is layer-2 gate-run territory per the brief, not a partition-reviewer task), but the public+private split is internally consistent (307+11=318) and both halves report zero `unresolved_collision`/`not_yet_reconciled`. **Counts agree with the rows.**
- The `--git-` record's cross-surface handling: `DEC-20260422-A`'s Notion-row twin (page id `34967c87082c81ffacfbd04b59df64fe`) is `disposition: resolved_collision`, `collision.kind: cross-surface`, `collision.row_disposition: documented_only`, citing `archive/sessions/2026-09-04-m2-cross-surface-DEC-20260422-A-gaps.md` — consistent with `DEC-20260904-B`'s stated mechanism (a git-qualified record exists with the matching id, and the row's page id is named by the cited gap report). The bare id `DEC-20260422-A` is never used as a relation target anywhere in my partition.

### Relations audit

Every relation target across the 33 records (14 non-empty relation lists, 18 total edges) resolves to an existing record file at the review commit. Every one is backed by Context-section prose quoting the specific sentence that identifies the target (either literally headed "Relation to `<target>`:" or, more commonly in this batch, phrased as "the row's own text... names the exact subject of `<target>`, so the relation above targets that specific qualified record"). No relation targets a bare collided id; every target used in this partition is itself qualified (`--notion-` suffixed).

### Unverifiable

- Whether the specific point-in-time production database counts several records cite (e.g., `pii_true`/`pii_false` 84/191/32 in `DEC-20260420-I`; "287 caps classified" in `DEC-20260512-A`; individual production transaction ids in `DEC-20260420-J`) still hold today — these are historical point-in-time DB snapshots the records themselves flag as unconfirmable from static files, and I have read-only, no-DB access consistent with that.
- Whether HMRC ever rendered a compliance verdict on the redistribution disclosure (`DEC-20260505-E`, page `35767...481a8efa27ea37438`) — the record itself states this is unresolved in the source data; I found no repository file that would resolve it either.
- Whether the InfoCamere Distributore Ufficiale application outcome (`DEC-20260505-D`, page `35767...81059f67e756f5c5eefa`) was ever answered — same as above, flagged unresolved by the record itself and unconfirmable from files.
- Whether the current KVK Datavisie legislative process or CrimiMail outreach (`DEC-20260512-A`, page `35e67...8122a29ef35f256d5958`) has progressed since 2026-05-12 — outside the evidence set available to a static-file read.
- Whether `strale-frontend`'s current (non-`04c9fca9`) sandbox input surface still matches the single-field spec in `DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md` — the record itself scopes this out, and I did not independently re-derive it since the record's own claim was narrower (absence of a dedicated entity-resolution module in `apps/api/src`) and that narrower claim I did verify.

### Partition verdict

PARTITION VERDICT: PASS

## Gate run

The gate run recorded at the reviewed commit is void: its worktree lost
its tracked files partway through, immediately after `context:check` and
`context:test` both recorded exit 0, and every gate invoked after that
point recorded exit 1 with no diagnostic output. Round 2 repeats the full
gate sequence at the commit that merges this file and `DEC-20260905-B`.

```
M2 closing review gate run at 3a7089c5b48432a3dd359acefdd048a63af5034f, 2026-09-05T12:03:22Z
npm ci: ok
=== npm run context:check
project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ the checked-in repository context is warning-clean (72312.1757ms)
✔ a clean closing_review releases plan.review_route and clears the track gate (973.1919ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (744.528ms)
ℹ pass 147
ℹ fail 0
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✖ a clean closing_review releases plan.review_route and clears the track gate (8.4247ms)
✖ plan.review_route stays a blocking requirement when closing_review is present but not clean (1.9668ms)
ℹ pass 75
ℹ fail 31
✖ a clean closing_review releases plan.review_route and clears the track gate (8.4247ms)
✖ plan.review_route stays a blocking requirement when closing_review is present but not clean (1.9668ms)
exit=1
=== node scripts/m2-closure-verify-private-rows.mjs
exit=1
=== npm run programs:check
exit=1
=== npm run codex:check
exit=1
=== npm run receipts:check
exit=1
=== node apps/api/scripts/check-pii.mjs --strict
exit=1
=== node apps/api/scripts/check-no-committed-secrets.mjs
exit=1
```

## Outcome

Three of six partitions failed: P2, P3, and P4. The confirmed findings
across those partitions, and the two minor findings P5 recorded in an
otherwise passing partition, are corrected by `DEC-20260905-B`
(`docs/decisions/records/DEC-20260905-B.md`), which withdraws each false
or misattributed statement from its record without editing that record.
Round 2 of the closing review runs at the commit that merges this file
and `DEC-20260905-B` into `main`, and treats a statement withdrawn there
as corrected.

VERDICT: FAIL
