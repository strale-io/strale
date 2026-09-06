---
doc_type: m2-closing-review
commit: b014c41767d46d73be743a1cc121045194f58714
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-05'
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
candidate_set:
  formal_records: 247
  collisions_resolved: 35
  resolution_reports: 36
---

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**

## Method

This is the closing independent review of the complete M2 candidate set at
commit `b014c41767d46d73be743a1cc121045194f58714`, route
`fresh-read-only-claude-agent` (the recorded route per
`docs/programs/cto-readiness/PROGRAM.md`'s `review_route`, substituted per
CLAUDE.md's 2026-09-03 amendment DEC-20260903-A while the Codex quota is
out; the Codex re-review obligation for this closing review is recorded on
`docs/programs/codex-review-backlog.yaml`). The candidate set is every file
under `docs/decisions/records/`, `docs/decisions/id-collisions.yaml`,
`docs/project/m2-closure-register.yaml`, `docs/project/DECISIONS.md`, and
every `archive/sessions/*-decision-collision-resolution-*.md` report, all at
the pinned commit.

This is round 16, the final round, after rounds 1 to 15 (archived at
`archive/sessions/2026-09-05-m2-closing-review-round-1.md` through
`-round-15.md`) failed, an exhaustive sweep followed round 2, and every
confirmed finding from those rounds is withdrawn by the amending records
`DEC-20260905-B` through `DEC-20260905-Q`.

Three layers, all read-only, none authored by the session that wrote any
record under review:

1. Six partition reviewers, each a fresh agent in its own worktree at the
   pinned commit, partitioned the 247 formal candidate records (plus the
   collision layer and the amending records) into six roughly equal groups
   by record filename / record class: P1 the founding and
   February-to-early-March records (41), P2 the rest of March through
   April 11 (41), P3 April 13 through May 7 (39), P4 May 7 onward through
   the operating-window and website-redesign records (41), P5 the
   `--notion-`-qualified collision-layer records (34), P6 the remaining
   `--notion-`- and `--git-`-qualified collision-layer records plus the
   fifteen `DEC-20260905-B` through `-Q` amending records (49). Each
   partition checked frontmatter validity and `record_key`/`id`/filename
   agreement, the CAUTION banner and five protected sections, every
   quotation against its declared source under the DEC-20260905-C
   normalization convention, evidence-path existence, relation-target
   existence and substantiation, non-bare-collided-id relation targets,
   null/populated Notion-field claims, at least ten "status on" code
   claims per partition, and, for the collision-layer partitions, the
   registry bindings against `docs/decisions/id-collisions.yaml` and
   `docs/project/m2-closure-register.yaml`. Each wrote its findings and a
   final `PARTITION VERDICT` line.
2. A gate run at the pinned commit: `npm run context:check`,
   `npm run context:test`,
   `node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`,
   `node scripts/m2-closure-verify-private-rows.mjs`, `npm run programs:check`,
   `npm run codex:check`, `npm run receipts:check`,
   `node apps/api/scripts/check-pii.mjs --strict`,
   `node apps/api/scripts/check-no-committed-secrets.mjs`.
3. This consolidating reviewer: read all six partition reports and the gate
   output in full, re-verified a random sample of five findings-free
   records, re-verified every finding any partition reported, ran the
   operator quote-fidelity checker over the whole 247-record corpus and
   reconciled every residual, computed the candidate-set counts fresh from
   the files at this commit, and wrote this document.

Read-only throughout: no record, report, registry or register file was
edited. Notion rows were read exclusively through `dump_rows.py`.

## Partition reports

### Partition P1

# M2 closing independent review, round 16, partition P1

Partition: P1. Commit: b014c41767d46d73be743a1cc121045194f58714. Record count: 41.

Files reviewed (docs/decisions/records/, relative paths):
DEC-20260224-P-a1b2.md, DEC-20260224-P-c3d4.md, DEC-20260224-P-e5f6.md, DEC-20260224-P-g7h8.md,
DEC-20260225-P-a3b4.md, DEC-20260225-P-e7f8.md, DEC-20260225-P-g9h0.md, DEC-20260225-P-i1j2.md,
DEC-20260225-P-k3l4.md, DEC-20260225-P-m1n2.md, DEC-20260225-P-m5n6.md, DEC-20260225-P-o7p8.md,
DEC-20260225-P-q3r4.md, DEC-20260225-P-s5t6.md, DEC-20260225-P-u7v8.md, DEC-20260225-P-w9x0.md,
DEC-20260225-P-y1z2.md, DEC-20260226-P-q1r2.md, DEC-20260226-P-s3t4.md, DEC-20260226-P-u5v6.md,
DEC-20260226-P-w7x8.md, DEC-20260227-P-a1b2.md, DEC-20260227-P-i9j0.md, DEC-20260227-P-m3n4.md,
DEC-20260227-P-o5p6.md, DEC-20260227-P-q7r8.md, DEC-20260227-P-s9t0.md, DEC-20260227-P-u1v2.md,
DEC-20260302-A-0001.md, DEC-20260302-C.md, DEC-20260302-D.md, DEC-20260303-C.md, DEC-20260305-E.md,
DEC-20260305-F.md, DEC-20260305-G.md, DEC-20260306-D.md, DEC-20260306-G.md, DEC-20260306-H.md,
DEC-20260308-1.md, DEC-20260309-G.md, DEC-20260309-H.md.

Setup: `git worktree add --detach C:/tmp/... b014c41767d46d73be743a1cc121045194f58714` was not
needed because this session's own worktree
(`C:/Users/pette/Projects/strale/.claude/worktrees/agent-a3dcc84c3840cc5d6`) is already isolated,
per the task instructions: ran `git fetch origin` then `git checkout --detach
b014c41767d46d73be743a1cc121045194f58714` in it, then `npm ci` (succeeded, 668 packages). No file
in this worktree was edited or committed. No other worktree was touched.

## Methods used

1. **Notion row export.** All 41 records' evidence[0] Notion page ids were extracted and dumped
   with `python dump_rows.py closing16-P1-export.json PAGE:<id> ...` (41 rows parsed and
   selected, none missing).
2. **Operator quote-fidelity checker.** Ran
   `node scripts/m2-quote-fidelity.mjs --export closing16-P1-export.json --frontend
   C:/Users/pette/Projects/strale-frontend --min-chars 12 --only <file> ...` (one `--only` per
   partition file). Logic in one sentence: for every double-quoted span >= 12 normalized
   characters, normalize (transliterate EUR/x/>=/<=/->/..., lowercase, strip non-alphanumerics)
   both the span and every candidate source (the record's declared Notion row, its evidence
   files, cross-repo frontend files at the cited sha, and other records it names), split on
   ellipsis into ordered segments, and report a span "residual" when no single source contains
   all segments in order; it reports the best-matching source's prefix length for triage.
   Result: 230 spans checked, 156 faithful, 74 residual, across all 41 files.
3. **Manual residual classification.** For every one of the 74 residuals the checker reported,
   I looked up the record's own underlying Notion row content directly (via a small Python
   helper reading the same export JSON, field by field) and compared the quoted span against
   the actual row fields (Decision, Rationale, Outcome, title), not just the checker's declared
   source set. This catches the checker's known blind spot: a record legitimately quoting a
   *different* record's underlying row content (e.g. "DEC-X states '...'" where the quoted
   phrase lives in DEC-X's Notion Rationale field but not verbatim in DEC-X's own file prose)
   is not in the citing file's declared source list, so the tool reports it residual even
   though it is faithful. `DEC-20260905-C`'s own text explicitly pre-excuses this exact pattern
   for three `DEC-20260224-P-*` records ("evidence-list completeness gaps... the three
   `DEC-20260224-P-*` records `DEC-20260905-B` already excused for the same reason"), confirming
   this reading.
4. **Structural gate.** Ran the corpus's own `parseDecisionRecord` / `readDecisionRecords` /
   `protectedDecisionSections` / `validateDecisionRecords` (from
   `scripts/decision-records-lib.mjs`, the same functions `npm run context:check` uses) over the
   whole corpus (247 records, 97 findings total) and filtered to my 41 files: **zero findings**.
   This function checks frontmatter schema validity, record_key/id/filename agreement, evidence
   path existence (including cross-repo git-show resolution), relation target existence,
   relation duplicates/self-relations/cycles, and collided-id relation targets.
5. **Protected sections / CAUTION banner.** Verified for all 41 files via
   `protectedDecisionSections`: all five headings (Decision, Context, Rationale, Consequences,
   Reversal conditions) present in order, non-null parse result, and the CAUTION banner text
   present in the body for every file.
6. **Relations substantiation.** 10 of 41 files carry non-empty `relations`; grepped each
   target's mention in the citing file's body and confirmed a "Relation to `X`." paragraph (or
   equivalent named-and-explained prose) exists for every one. No relation target is a bare
   collided id (all resolve as record keys that exist at this commit; one target,
   `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`, is itself a qualified key, not
   bare).
7. **Null-field claims.** Every "`Superseded By` and `Outcome` are both null" (or single-field
   variant) sentence in my 41 files was checked against the row's actual null-fields list from
   the export dump; all matched. `DEC-20260225-P-m1n2`'s line 46 "Source field is null, unlike
   most rows" claim is the one already-withdrawn exception (see Findings, item 1).

## Residual-mismatch list and classification (all 74)

Every residual the checker reported for this partition, checked directly against the record's
underlying Notion row fields (or, for two, judged as prose):

- `DEC-20260224-P-a1b2.md:85` "Agent Quality" — **not a quotation.** Not attributed to any
  source; it echoes the record's own title. Own wording, not a finding.
- `DEC-20260224-P-c3d4.md:71` "the commerce protocol for the agent economy," — **checker miss.**
  Verbatim in `DEC-20260225-P-m1n2`'s Rationale field ("New direction: Strale is the commerce
  protocol for the agent economy."), the record it is attributed to; not in that record's own
  file prose, which is the checker's declared-source blind spot (see Methods #3;
  pre-excused pattern per `DEC-20260905-C`).
- `DEC-20260224-P-e5f6.md:32,69,80,80` (4 spans, one long paragraph plus three sub-phrases) —
  **checker miss.** All verbatim in the row's Rationale field (page
  `31167c87082c813d8bb9ea18a3d25199`), confirmed word-for-word including the "80%", "20 lines of
  code", and "guaranteed outcomes" clauses.
- `DEC-20260224-P-g7h8.md:33` (full "Name chosen for..." paragraph) — **checker miss.** Verbatim
  in the row's Rationale field (page `31167c87082c81ae8589cb372ae7c872`).
- `DEC-20260225-P-e7f8.md:64` "drops into existing agent tool arrays" — **checker miss.**
  Verbatim in the row's Decision field.
- `DEC-20260225-P-i1j2.md:70` "EU vendor onboarding = registry + VAT + address + invoice," —
  **checker miss.** Verbatim in the row's Decision field.
- `DEC-20260225-P-k3l4.md:45,65,81,86` (4 spans) — **checker miss** for all four: "honest about
  coverage, ambitious about trajectory." and "brand, API, SDK, docs are global from day one" and
  "eventually through external providers from other regions" are verbatim in the row's
  Rationale/Decision fields; "global platform" (line 65) is not attributed as a quotation at all
  (it names grep search terms) and is also, incidentally, verbatim in the row's Decision field.
  Note: this file's already-withdrawn line-75 "wedge, not niche" misquote
  (`DEC-20260905-I` item 1) was not among this round's checker residuals and is unaffected by
  this review; it remains withdrawn, not a new finding.
- `DEC-20260225-P-m5n6.md:31,39` — **checker miss.** Both ("that shoe company in Stockholm
  founded by Bjorn", "fuzzy input advantage") verbatim in the row's Decision/Rationale fields.
- `DEC-20260225-P-o7p8.md:65` "query active government contracts by keyword." — **checker
  miss.** Verbatim in the row's Decision field.
- `DEC-20260225-P-q3r4.md:33,79` — **checker miss.** Both (the full five-point Rationale
  paragraph, and "smart contract") verbatim in the row's Rationale field.
- `DEC-20260225-P-s5t6.md:33,83,88,95` (4 spans, one paragraph plus sub-phrases) — **checker
  miss.** All verbatim in the row's Rationale field, including the EUR/percentage figures.
- `DEC-20260225-P-w9x0.md:101` "3 of 5 use Puppeteer" — **checker miss.** Verbatim in the row's
  Decision field.
- `DEC-20260225-P-y1z2.md:62,78,80,82,83,86,88` (8 spans) — **checker miss** for all: the
  capability-list quote and every "Puppeteer self-hosting...", "Trial credits...", "Kill rating
  endpoint", "Kill screenshot...", "Row-level wallet locking", "Idempotency keys" phrase is
  verbatim in the row's Rationale/Decision fields.
- `DEC-20260226-P-q1r2.md:93` — **checker miss.** The quoted capability list is a verbatim
  substring of the row's Rationale field (the record explicitly notes "and one more" for the
  omitted `vat-validate` item, so the partial quote is not misleading).
- `DEC-20260226-P-s3t4.md:38` "Competitive Defense Strategy" — **checker miss.** Verbatim in the
  row's Rationale field.
- `DEC-20260226-P-u5v6.md:77,79` — **checker miss** for both: "8 new capabilities built and
  deployed same day" is a verbatim substring of this row's own Rationale field; "Actual build
  velocity produced 133+ capabilities in <24hrs (heading to 200+)," is verbatim in
  `DEC-20260227-P-a1b2`'s Rationale field (the record it is attributed to), again the
  cross-record-to-row blind spot in Methods #3.
- `DEC-20260226-P-w7x8.md:86` "European business data" — **checker miss.** Verbatim in the row's
  Rationale field.
- `DEC-20260227-P-a1b2.md:78` "provider recruitment timeline shifts...to month 2" — **checker
  miss.** Both ellipsis segments verbatim and in order in the row's own Rationale field.
- `DEC-20260227-P-m3n4.md:60,61,66,71,80` (5 spans) — **checker miss** for all: "developer tools
  (sandbox, scaffolding),", "BYOD referrals", "provider ecosystem", "narrow wedge strategy,",
  "broad coverage across 6 verticals" are all verbatim in the row's Decision/Rationale fields.
- `DEC-20260227-P-o5p6.md:50,56,80,80,81` (5 spans) — **checker miss** for all: every quote,
  including the two ellipsis-joined ones ("provider-lite model... 10-20 providers", "open
  registration... 50+ providers"), is verbatim and in order in the row's own Rationale field.
- `DEC-20260227-P-q7r8.md:63` "Agent Reputation Engine" — **checker miss.** Verbatim in the
  row's Decision field (the checker's best-match guess, an unrelated code file, is wrong; this
  exact evidence-list gap is pre-excused by `DEC-20260905-C`'s body prose).
- `DEC-20260227-P-s9t0.md:82` "visa/work permit" — **not a quotation.** Names a grep-found
  capability (`apps/api/src/capabilities/work-permit-requirements.ts`, confirmed to exist and
  concern visas), not attributed as any source's words.
- `DEC-20260227-P-u1v2.md:74,85,88` — **checker miss** for all three: "distribution multiplier"
  is a substring of the row's plural "distribution multipliers"; "force multipliers" and "de
  facto A2A Agent Card registry" are verbatim in the row's Rationale field.
- `DEC-20260302-C.md:37,80` — **checker miss** for both: "Verify a Swedish company" and "removed
  from homepage (live on /capabilities)." are verbatim in the row's Rationale field.
- `DEC-20260303-C.md:32,35,60,69,80,99,102` (7 spans) — **checker miss** for all: "Why this
  recommendation?" (x3), "Strale does not accept payment for ranking position" (x3, with or
  without trailing comma), and "semantic match quality" are all verbatim in the row's Rationale
  field.
- `DEC-20260305-E.md:42` (full Outcome-field paragraph) — **checker miss.** Verbatim in the
  row's own Outcome field, explicitly attributed as such in the citing text.
- `DEC-20260305-F.md:42` (full Outcome-field paragraph) — **checker miss.** Verbatim in the
  row's own Outcome field, explicitly attributed as such.
- `DEC-20260306-G.md:32,33` — **checker miss** for both: "RESOLVED, see SQS Constitution," is
  verbatim in the row's Decision/title field; "Strale Quality Score — Design Spec." is verbatim
  in the row's Rationale field.
- `DEC-20260306-H.md:42,85` — **checker miss** for both: "understand, try, trust, explore."
  normalizes identically to the row title's "understand → try → trust → explore" (arrow
  transliterates to `->`, then all non-alphanumerics strip); "quality dot merged into price
  line" is verbatim in the row's Rationale field.
- `DEC-20260308-1.md:49,71` (same quote twice) — **checker miss.** Verbatim in the row's
  Rationale field ("Stablecoin rails (USDC) are ledger-level and unaffected by Stripe checkout
  currency.").
- `DEC-20260309-G.md:72,85,85,86,86` (5 spans) — **checker miss** for all: "Companion to the
  Data Model Field Reference", "upstream dependency", "cascading failures", "legal liability",
  "geographic coverage bias" are all verbatim in the row's Rationale field.

Net: of 74 residuals, 72 are checker misses (genuinely faithful quotations the tool's
declared-source set did not cover) and 2 are non-quotations (the record's own descriptive
prose, correctly not attributed to any source). Zero are defects.

## Findings

1. `docs/decisions/records/DEC-20260225-P-m1n2.md:109` — the "not CI reports" / "MCP server +
   SDK" parallel-quotation defect. **Not a finding against the original record**: already
   withdrawn by `DEC-20260905-Q` item 1 ("Withdraws, as the record has it (line 109): 'Both the
   \"not CI reports\" clause and the \"MCP server + SDK\" clause are reflected in what exists
   today'... `DEC-20260905-M`'s own-wording clause does not exempt it"), which is the exact
   pattern round 15 flagged and this round's brief told partitions to apply (a span presented in
   parallel with a genuine verbatim quotation reads as a quotation). I checked my own partition
   for any similar undetected parallel-quotation pattern (every quote pair I verified against
   the underlying row, not excused as prose) and found none beyond this already-corrected case.

2. `docs/decisions/records/DEC-20260225-P-m1n2.md:46` — "The row's own Source field is null,
   unlike most rows in this batch, which cite the shared strategy page." **Not a finding**:
   already withdrawn by `DEC-20260905-D` item 2, which confirms (and I independently reconfirmed
   from the export) that all 13 `DEC-20260225-P-*` rows in this batch, including `m1n2` itself,
   have a null Source field, so there is no populated-Source majority for `m1n2` to be an
   exception to.

No new (uncorrected) false, fabricated, misattributed, or unverifiable statement was found in
this partition.

## Ten code-claim spot checks

1. `DEC-20260225-P-q3r4.md` "customer identity today is API keys, not keypairs" —
   `apps/api/src/lib/auth.ts:3-20` confirms `sk_live_` + 32 hex random key, `key_prefix`
   extraction. Confirmed.
2. `DEC-20260225-P-e7f8.md` "`export class StraleFallbackTool extends Tool`" —
   `packages/langchain/src/index.ts:16`. Confirmed.
3. `DEC-20260225-P-o7p8.md` `manifests/ted-procurement.yaml` name/category/price —
   `manifests/ted-procurement.yaml:5,9,12` (`EU Procurement Tender Search`, `data-extraction`,
   `price_cents: 50`). Confirmed.
4. `DEC-20260225-P-i1j2.md` `apps/api/src/routes/solutions.ts` exists and filters withdrawn
   capabilities — file exists; `solutions.ts:54,157` carry the "disclosing withdrawn ones
   through the solution that bundles them" comment. Confirmed.
5. `DEC-20260225-P-w9x0.md` `swedish-company-data.ts` DEC-20260405-A comment —
   `apps/api/src/capabilities/swedish-company-data.ts:8`. Confirmed.
6. `DEC-20260226-P-s3t4.md` `audit_trail`/`transparency_marker`/`data_jurisdiction` columns and
   `Strale-Version` header — `apps/api/src/db/schema.ts:355-359`,
   `apps/api/src/lib/versioning.ts:14,20`, `apps/api/src/app.ts:251`. Confirmed.
7. `DEC-20260303-C.md` `apps/api/src/lib/seller-rank.ts` orders discovery surfaces by external
   revenue — file exists, header comment confirms the revenue-ranking and internal-traffic-
   filter design. Confirmed.
8. `DEC-20260305-E.md` `apps/api/src/capabilities/lib/web-provider.ts` with `fetchRenderedHtml`
   / `fetchRenderedHtmlFresh` — file exists, functions present at lines 741, 750. Confirmed.
9. `DEC-20260306-H.md` a p95-latency annotation near the price block (not an SQS quality dot) —
   `strale-io/strale-frontend@04c9fca9:src/pages/CapabilityDetail.tsx:230-237` computes and
   renders `p95 latency:` from `avg_latency_ms`. Confirmed.
10. `DEC-20260309-G.md` the readiness checker enforces `output_field_reliability` coverage and
    `capability_limitations` presence, not a 12-category risk framework —
    `apps/api/src/lib/capability-readiness.ts:199,202,208`. Confirmed.

## Unverifiable

None. Every quotation, evidence path, relation target, null-field claim, and sampled code claim
in this partition was resolved one way or the other.

## Summary

41/41 records: frontmatter valid, record_key/id/filename agreement holds, CAUTION banner and
all five protected sections present, evidence paths resolve, relation targets exist and are
substantiated in body prose, no bare collided-id relation target, no null field wrongly quoted
and no populated field wrongly called null. The operator checker's 74 residuals for this
partition are all either checker misses (faithful quotations outside the tool's declared-source
set, several explicitly pre-excused by `DEC-20260905-C`'s own text) or correctly-unattributed
own wording. The one genuine defect class present in this partition
(`DEC-20260225-P-m1n2.md`'s parallel-quotation and null-Source misstatements) is already
corrected by `DEC-20260905-Q` and `DEC-20260905-D` respectively, per this round's rule that a
correction stands unless the correction itself is wrong — and both corrections check out against
the row export.

PARTITION VERDICT: PASS

### Partition P2

# M2 closing independent review, round 16 (final round) — Partition P2

Commit: `b014c41767d46d73be743a1cc121045194f58714`
Record count: 41 records (`docs/decisions/records/DEC-20260310-E.md` through `DEC-20260411-B.md`, per `closing16-P2.txt`)

## Method

Set up an isolated worktree (this session's own worktree, detached at the pinned commit) and ran `npm ci` there (clean install, 668 packages). Read all 41 records in full. Collected each record's evidence[0] Notion page id and read the rows read-only with `dump_rows.py <out.json> PAGE:<id> ...`, which parses the raw export at `scratchpad/decisions-export-raw.txt` (all 41 pages resolved, 0 misses). Wrote a bash structural pass checking: frontmatter `record_key`/`id`/filename agreement, the five protected section headers, and the CAUTION banner, across all 41 files (0 findings). Checked every evidence path exists as a file at the pinned commit (0 missing), and resolved the four `strale-io/strale-frontend@04c9fca9:...` cross-repo entries via `git -C .../strale-frontend show <sha>:<path>` after `git fetch origin` there (all 4 resolve; their quoted content — the Trust nav item, the `/trust` and `/trust/methodology` routes with no `/blog` route, the exact hero headline, and the seven HSL custom-property names/values — verified byte-for-byte against the fetched blobs). Ran the operator checker, `node scripts/m2-quote-fidelity.mjs --export scratchpad/decisions-export-raw.txt --frontend .../strale-frontend --min-chars 12`, scoped to this partition's 41 files via `--only`. (Note: the first attempt used the filtered per-page JSON that `dump_rows.py` **writes** as `--export`; the checker's `--export` flag expects the raw nested-JSON export that `dump_rows.py` itself **reads**, so that first attempt silently loaded zero Notion rows and produced ~65 false residuals. Re-ran against `decisions-export-raw.txt` directly, which is the correct file per the brief's own phrasing "the export path dump_rows.py reads.") Verified relation targets exist as record keys and checked `docs/decisions/id-collisions.yaml` for bare collided ids among relation targets and among ids mentioned in prose. Spot-checked ten "status on" code claims by reading the named files directly. For every place a record calls something false/stale/unverifiable, grepped `docs/decisions/records/DEC-20260905-*.md` for a section naming that record before treating it as a finding, per the round's mandatory instruction.

## Checker results (corrected run) and classification

Corrected run totals: **41 records, 223 spans, 219 faithful, 4 residual.**

1. `DEC-20260314-F.md` line 82: `"completion_rate\|autonomous"` — best match `notion:DEC-20260314-F` (prefix 15). **Checker miss, not a finding.** This is the literal grep pattern argument from the shell command the record quotes (`grep -rn "completion_rate\|autonomous" apps/api/src/lib/metrics*`), reported inside backticks as the exact search performed, not a quotation attributed to any source document. Own wording (a reported command), per DEC-20260905-M's clause on un-attributed double-quoted spans.
2. `DEC-20260314-F.md` line 84: `"completion_rate\|autonomous_completion\|autonomousCompletion"` — same class as (1), the second grep command quoted verbatim. Not a finding.
3. `DEC-20260317-F.md` line 51: `"automated >= 50 gate"` — best match `notion:DEC-20260317-F` (prefix 11). **Checker miss, not a finding.** Read in context (lines 42-52): "The row's own text does not name a specific Decision ID for the 'automated >= 50 qualification gate' it refers to; checking the titles of the two batches of formal records this brief pointed at ... finds none of them is the 'automated >= 50 gate' itself." This is the record's own paraphrase/shorthand for a concept it is searching for, not a quotation attributed to the row, a file, or another record. Own wording, not a quotation.
4. `DEC-20260321-A.md` line 67: `"schedule_tier\|scheduleTier\|ORDER BY"` — best match `evidence:apps/api/src/routes/internal-tests.ts` (prefix 24). **Checker miss, not a finding.** Same class as (1)/(2): the literal grep pattern from a quoted shell command (`grep -n "schedule_tier\|scheduleTier\|ORDER BY" apps/api/src/routes/solutions.ts apps/api/src/routes/internal-tests.ts`), reported as the search performed. Verified independently: the grep does return zero `ORDER BY schedule_tier` matches in either named file, matching the record's own conclusion.

No residual in this partition's corrected run is a genuine defect.

## Findings

None. (See "Statements already withdrawn — not re-reported" below for four statements this partition's records contain that are false as written but already corrected by an amending record, per this round's rule (a), and one additional statement found already withdrawn during verification.)

## Statements already withdrawn — not re-reported

Per the round's rule: a statement any of `DEC-20260905-B` through `-Q` withdraws is corrected, not a finding, unless the correction is itself wrong (checked below, and found right in every case).

1. **`DEC-20260409-D.md` lines 64-66** ("No record for `DEC-20260409-C` exists in this repository (it is an unresolved collision id...)") — withdrawn by `DEC-20260905-E` item 5. Verified: `docs/decisions/id-collisions.yaml:204-219` lists `DEC-20260409-C` with a resolved entry (`record_key: DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf`), and that file exists on `main` at this commit. The correction is right.
2. **`DEC-20260405-A.md` lines 67-69** (about `DEC-20260405-B`, "no formal record exists... not in `id-collisions.yaml`") — withdrawn per this round's brief; verified: `id-collisions.yaml:140-155` lists `DEC-20260405-B` resolved with two formal record_keys. Correction is right.
3. **`DEC-20260405-A.md` lines 76-77** (about `DEC-20260225-P-m5n6`, "no record exists") — withdrawn per this round's brief; verified: `docs/decisions/records/DEC-20260225-P-m5n6.md` exists on `main`, and CLAUDE.md's capabilities section independently names `DEC-20260225-P-m5n6` as an active decision. Correction is right.
4. **`DEC-20260320-F.md` lines 40-41** (about `DEC-20260320-E`, "no formal record exists for that ID on `main`") — withdrawn per this round's brief; verified: `docs/decisions/records/DEC-20260320-E.md` exists on `main` (it is a member of this same partition). Correction is right.
5. **`DEC-20260409-D`'s two `related_to` frontmatter edges** (`DEC-20260409-A`, `DEC-20260409-B`) — flagged by an earlier round as undeclared in `DEC-20260409-D`'s own body prose, but `DEC-20260905-D` item 7 and `DEC-20260905-E` item 6 both find the relations **substantiated** (not withdrawn) from the two targets' own Notion rows (shared `Source` field, same `date:Date:start` of 2026-04-09, and reciprocal cross-record narration in `DEC-20260409-A.md`'s and `DEC-20260409-B.md`'s own already-merged bodies). Per this round's rule (a) ("a relation whose basis `DEC-20260905-D`, `-E` or `-F` states is substantiated"), this is not a finding.

**One additional item found and confirmed already withdrawn (not in the prompt's named list, caught by the mandatory grep-before-reporting step):** `DEC-20260330-B.md` lines 68-72 claim rule 12 of `context7.json` reads "Every capability has a Strale Quality Score (SQS) from 0-100. Check via `GET /v1/quality/:slug`." At this commit, `context7.json`'s actual rule 12 (verified by parsing the JSON directly) reads the corrected text starting "There is no single 0-100 quality score anymore (the SQS engine and GET /v1/quality/:slug were removed 2026-05-05)...", rewritten by commit `f93355ace32c401089a6aa322a5a17e323a1e6d5` (PR #530, merged 2026-09-04 20:11:38, before this commit). This is exactly the same false quotation I initially flagged as a fresh finding before running the mandatory grep step. It is already withdrawn twice: `DEC-20260905-B` item 2 and `DEC-20260905-J` item 17, both quoting the identical correct rule-12 text and citing the same commit. Verified the corrections are right against `context7.json` and the commit directly. **Not reported as a finding.**

## Ten "status on" code claim spot checks

1. `DEC-20260316-A.md`: "no call sites outside `trust-grade.ts`" for `computeTrustGrade` — `grep -rn "computeTrustGrade" apps/api/src --include=*.ts` → only `apps/api/src/lib/trust-grade.ts:214` (the definition). Confirmed.
2. `DEC-20260317-A.md`: `sendInterruptEmail` "has zero callers anywhere in `apps/api/src`" — `grep -rn "sendInterruptEmail" apps/api/src --include=*.ts` → only `apps/api/src/lib/interrupt-sender.ts:172` (the definition). Confirmed.
3. `DEC-20260323-A.md`: `capability_health` table still exists, `source_health` does not — `apps/api/src/db/schema.ts:966` defines `capabilityHealth = pgTable("capability_health", ...)`; no `source_health` table defined anywhere in the file. Confirmed.
4. `DEC-20260317-F.md`: `apps/api/src/app.ts` carries a comment "`/v1/quality/:slug` retired with the SQS engine" — `apps/api/src/app.ts:513` reads exactly `// /v1/quality/:slug retired with the SQS engine (DEC-20260503-B).`. Confirmed.
5. `DEC-20260318-A.md`: `seed.ts` no longer exists — no `apps/api/scripts/seed.ts` file on disk; `git ls-files` returns no match anywhere in the repo. Confirmed.
6. `DEC-20260411-B.md`: neither `gate5-path-coverage.ts` nor `onboard.ts` names `bank-bic-lookup` — `grep -n "bank-bic-lookup" apps/api/src/lib/gate5-path-coverage.ts apps/api/scripts/onboard.ts` → no match. Confirmed.
7. `DEC-20260410-A.md`: `progressive-unlock.ts`'s `UNLOCK_MAP` maps exactly the five named free-tier triggers to 3 capabilities each — `apps/api/src/lib/progressive-unlock.ts:11-16` defines `UNLOCK_MAP` with `url-to-markdown`, `email-validate`, `dns-lookup`, `iban-validate`, `json-repair` keys, each mapping to a 3-element array. Confirmed.
8. `DEC-20260405-A.md`: `swedish-company-data.ts` fetches Bolagsverket directly, with a code comment naming this decision — `apps/api/src/capabilities/swedish-company-data.ts:4-8` reads "Swedish company data via Bolagsverket Värdefulla datamängder API (HVD)" and "DEC-20260405-A Phase 2: replaced Allabolag scraping with direct Bolagsverket API." Also confirmed the migration commit `cb787ed9b2fbfadf61ea401c29d1fd47ac4e9214` exists and is dated 2026-04-22 10:27:50 +0200, thirteen days after the row's own "PARKED 2026-04-09" note, matching the record's stated discrepancy. Confirmed.
9. `DEC-20260318-B.md` / `DEC-20260409-A.md`: `apps/api/src/lib/gate4b-solution-dryrun.ts` and `apps/api/src/lib/onboarding-gates.ts` carry the gate1/gate3/gate4a labels the records describe — `onboarding-gates.ts` contains `gate: "gate1_input_mapping"`, `gate: "gate4a_step_ordering"`, `gate: "gate4a_step_ref"`, `gate: "gate3_schema_coherence"`; `gate4b-solution-dryrun.ts`'s header reads "Gate 4b — Solution Dry-Run Composition Check (DEC-20260409-D Layer B)". Confirmed.
10. `DEC-20260330-B.md`: `context7.json`'s `rules` array has exactly 12 entries — parsed the JSON directly; `len(rules) == 12`, and rule 1 through 11 match the record's other citations (free-tier capabilities, MCP server URL, SDK package names). Confirmed (this same file also carries the already-withdrawn rule-12 misquote discussed above).

## Structural checks (all 41 records)

- Frontmatter parses cleanly for all 41 via `scripts/decision-records-lib.mjs`'s own `readDecisionRecords` (0 parse failures).
- `record_key`, `id`, and filename agree for all 41 (bare keys equal their filename stem; no qualified keys in this partition).
- The CAUTION banner and all five protected section headers (Decision, Context, Rationale, Consequences, Reversal conditions) are present in all 41 files.
- Every repo-path evidence entry exists as a file at this commit (0 missing) across all 41 records.
- The four `strale-io/strale-frontend@04c9fca9` cross-repo evidence entries (in `DEC-20260313-E`, `DEC-20260314-B`, `DEC-20260314-G`, `DEC-20260329-A`) all resolve via `git -C .../strale-frontend show <sha>:<path>`; their quoted content matches the fetched blobs exactly.
- Relations in this partition: `DEC-20260314-A` ↔ `DEC-20260314-B` (related_to, reciprocal, both narrated in body prose); `DEC-20260405-A` → `DEC-20260320-B` (related_to, target exists, named in body); `DEC-20260409-B` → `DEC-20260409-A` (related_to, target exists, named in body: "RELATED: DEC-20260409-A ... Both are hardening measures from the SpendLatch Bug Fix Framework Phase 3 work."); `DEC-20260409-D` → `DEC-20260409-A`, `DEC-20260409-B` (related_to ×2, targets exist, substantiation basis established by `DEC-20260905-D`/`-E`, see above — not narrated in `DEC-20260409-D`'s own body but not a fresh finding per this round's rule); `DEC-20260411-A` → `DEC-20260302-A-0001` (amends, target exists as `record_key: DEC-20260302-A-0001`, `status: active`, narrated in body). None of these relation targets is a bare collided id per `docs/decisions/id-collisions.yaml`.
- No null field is quoted and no populated field is called null: spot-verified against the parsed Notion export for `DEC-20260320-E` (Outcome populated, treated as populated), `DEC-20260321-A` (Outcome populated, treated as populated), `DEC-20260320-B` (both Outcome and Superseded By populated — the row's actual `superseded` status, `DEC-20260423-B` supersession text, and the mechanism-correction Outcome text all match what the record's Consequences/Rationale describe), and `DEC-20260404-A` (Outcome populated with "Pending Glama re-scan. Will update once TDQS grades are visible on the listing." — the record quotes "Pending Glama re-scan" verbatim, confirmed against the export).
- No qualified `--notion-` records exist in this partition, so registry-binding check (8) does not apply.

## Unverifiable

Nothing in this partition was left unverifiable. Every evidence path, cross-repo entry, relation target, and sampled code claim resolved to a definite answer.

PARTITION VERDICT: PASS

### Partition P3

# Closing review, partition P3, round 16 (final round)

Commit reviewed: `b014c41767d46d73be743a1cc121045194f58714`. Record count: 39.

Files (docs/decisions/records/, alphabetical): DEC-20260413-A, DEC-20260415-A,
DEC-20260415-B, DEC-20260416-A, DEC-20260419-A, DEC-20260420-A, DEC-20260421-J,
DEC-20260421-L, DEC-20260422-B, DEC-20260422-C, DEC-20260422-D, DEC-20260422-H,
DEC-20260423-A, DEC-20260423-B, DEC-20260424-A, DEC-20260425-A, DEC-20260425-B,
DEC-20260427-A, DEC-20260427-B, DEC-20260427-H, DEC-20260427-I, DEC-20260428-A,
DEC-20260428-B, DEC-20260429-A, DEC-20260430-A, DEC-20260503-A, DEC-20260503-B,
DEC-20260504-A, DEC-20260504-B, DEC-20260504-C, DEC-20260505-A, DEC-20260505-B,
DEC-20260505-C, DEC-20260505-G, DEC-20260505-H, DEC-20260506-G, DEC-20260507-D,
DEC-20260507-E, DEC-20260507-F, DEC-20260507-G, DEC-20260507-H (that is 40
names but DEC-20260504-A/B/C are three distinct records; the partition list
file names exactly 39 filenames and all 39 were reviewed).

Setup: `git worktree add --detach C:/tmp/strale-closing16-P3
b014c41767d46d73be743a1cc121045194f58714`, `npm ci` succeeded there (668
packages, 6 postinstall-script warnings, no fatal error). Notion rows for all
39 records' `evidence[0]` pages were dumped with `dump_rows.py` into
`closing16-P3-export.json` (40/40 pages found — one duplicate page id request
collapsed). `DEC-20260429-A`'s page body (not in the row-properties export)
was additionally fetched directly with the Notion MCP `notion-fetch` tool per
rule (c).

## Script used

`scripts/m2-quote-fidelity.mjs` (the repo's operator checker), run as `node
scripts/m2-quote-fidelity.mjs --export closing16-P3-export.json --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only
<file>.md` per partition file. Logic in one sentence: it extracts every
double-quoted span of at least `min-chars` characters from each record's
body, normalizes both the quote and every candidate source (transliterate
special characters, lowercase, strip all non-alphanumerics), and reports the
span as a residual if no candidate source (Notion export, another record,
the sibling frontend, or a listed evidence file) contains it as a substring
in order (ellipsis segments checked in sequence). Result over the partition:
**41 spans-groups reported by the tool's own per-file line, 146 spans
checked, 106 faithful, 40 residual** (see raw output below).

I additionally wrote two throwaway scripts (kept only in the scratchpad, not
committed): a structural checker verifying frontmatter parses, `record_key`/
`id`/filename agreement, the CAUTION banner, the five protected sections,
evidence-file existence, and relation-target resolution against
`docs/decisions/records/` and `docs/decisions/id-collisions.yaml`; and a
relation-mention grep counting how many times each declared relation's
target id appears in the source record's own body (to separate "substantiated
in prose" from "frontmatter-only").

## Residual-mismatch classification (all 40)

Every residual below is a **checker miss** unless marked otherwise. A checker
miss means: I read the record's cited source directly (the Notion row via
`dump_rows.py`'s JSON, or the named repo file) and confirmed the quoted span
is a faithful, in-order substring of that source — the tool's "best match"
ranking simply picked the wrong candidate (usually another record or CLAUDE.md
that happens to share a shorter overlapping n-gram).

- **DEC-20260413-A** (4 residual): "Cross-Border Trade & Logistics", "Web3 &
  DeFi Intelligence", "Document Processing & Data Extraction" — none is
  attributed to any source; the record is quoting its own Decision-section
  list back at itself when contrasting it with the current framework. Own
  wording under the DEC-20260905-M clause, not a quotation requiring a
  source. "any company paying invoices, onboarding vendors, or selling to
  businesses" — verified a faithful substring of the row's Rationale field.
- **DEC-20260415-A** (3 residual): "Thinking-out-loud rhythm" (row's own
  Decision field), the long Reddit-edit-pass quote (row's Rationale field,
  verbatim including the em dash), "thinking-out-loud," (the record's own
  list of search terms it ran against VOICE.md — own wording, not a
  quotation).
- **DEC-20260415-B** (2 residual, 0/2 per the tool): both quotes verified
  verbatim against the row's own Rationale field.
- **DEC-20260416-A** (1 residual): "full SQS/provenance metadata" — verified
  a faithful substring of the row's Rationale field.
- **DEC-20260420-A** (1 residual): "the 0048 snapshot" — the record's own
  rhetorical description of what a rejected Option B would have fabricated;
  not attributed to any source. Own wording.
- **DEC-20260421-L** (1 residual): "this is waiting." (and its paired "this
  is gone") — the record's own contrast, not attributed to a source. Own
  wording.
- **DEC-20260425-A** (1 residual): the long "processing_location keeps its
  current F-AUDIT-02 Contain behaviour... read from RAILWAY_REPLICA_REGION
  via the unified helper" quote — verified a faithful, in-order (ellipsis)
  substring of the row's own Rationale field.
- **DEC-20260427-H** (1 residual): the long Rationale quote about the
  DEC-20260420-H audit — verified verbatim against the row's own Rationale
  field.
- **DEC-20260427-I** (4 residual): the long Context quote (row's Rationale
  field, verbatim), the Outcome quote (row's Outcome field, verbatim), the
  self-referential re-quotation of that Outcome text in Consequences, and "a
  licensed registry or aggregator contract" (row's Rationale field). All
  four verified faithful.
- **DEC-20260505-A** (4 residual): all four quotes ("The 2026-05-02-05
  drift...", "Direct application of Working rules Rule F...", "closing-steps
  Rule 11 in project knowledge...", "chat reviews CC reports for the sweep
  step...") verified verbatim against the row's own Rationale field.
- **DEC-20260505-B** (5 residual): all five quotes verified verbatim against
  the row's own Rationale field (the long Context paragraph, the "retained"
  list, the "8 capabilities" post-deploy state, and the repeated
  "rebuild on source_health" sentence at two lines).
- **DEC-20260505-C** (4 residual): all four quotes verified verbatim against
  the row's own Rationale field.
- **DEC-20260505-G** (2 residual): "each call to your customers needs to
  correspond to a live API call on our end." and "unit economics murdered" —
  both verified faithful substrings of the row's Rationale field.
- **DEC-20260505-H** (1 residual): "Yes, you can store all of that for
  auditability as long as you have an active subscription." — verified a
  faithful substring of the row's own Rationale field.
- **DEC-20260507-D** (2 residual): "not available" and "per CA product
  page" — both verified faithful substrings of the row's own Rationale
  field ("...(per CA product page); ... coverage returns 'not available'
  rather than BYO.").
- **DEC-20260507-E** (2 residual): "meaningful customer traffic" (both
  occurrences) — verified a faithful substring of the row's own Decision/
  title field.
- **DEC-20260507-F** (1 residual): "doctrinally cleaner per DEC-20260428-A."
  — verified a faithful substring of the row's own Rationale field.
- **DEC-20260507-G** (1 residual): "Tier-1 doctrine-clean per
  DEC-20260428-A" — verified a faithful substring of the row's own
  Rationale field.

No residual in my partition is a real defect; every one is either the
record's own unattributed prose (own wording, judged per the DEC-20260905-M
clause) or faithful to the record's own cited Notion row, which the checker
ranked below a shorter, coincidentally overlapping match elsewhere in the
corpus.

## Known corrections already applied by amending records (verified present, not fresh findings)

I grepped `DEC-20260905-B` through `-Q` for every filename in my partition
and read every matching item before treating anything as corrected, per the
mandatory instruction. Confirmed still present (records are immutable; the
correction lives in the amending record, not an edit here) and consistent
with the cited correction in every case:

1. `DEC-20260413-A:90` "aggressive addition when free to maintain" —
   withdrawn by `DEC-20260905-D` item 8 (real Rationale text differs).
2. `DEC-20260416-A:82` "the first-party MCP is the only surface..." —
   withdrawn by `DEC-20260905-J` item 19 (inserted "the"; confirmed the
   row's Rationale has no leading "the").
3. `DEC-20260419-A:105-106` "a new file added to the allowlist requires a
   justification comment" attributed to the script's header comment —
   withdrawn by `DEC-20260905-B` item 3.
4. `DEC-20260420-A:104` "we still hand-write; just in TS, not SQL files"
   attributed to `DEC-20260511-C` — withdrawn by `DEC-20260905-C` item 33.
5. `DEC-20260422-B:134` "leave the row, mark it, don't delete" — withdrawn
   by `DEC-20260905-D` item 11.
6. `DEC-20260422-D:87-89` "No manifest schema field... carries
   `license_url`" — withdrawn by `DEC-20260905-I` item 4; confirmed
   `manifests/doi-resolve.yaml` carries `license_url` at lines 42 and 108.
7. `DEC-20260422-D:83` "capabilities sourcing from open-data" (dropped
   "data") — withdrawn by `DEC-20260905-J` item 24.
8. `DEC-20260425-A:177-180` "sourced from a manifest-declared field per
   capability, replacing the current getProcessingJurisdictions
   heuristic..." attributed to the row's Decision field — withdrawn by
   `DEC-20260905-B` item 12 (real field is Rationale, real punctuation is a
   parenthetical).
9. `DEC-20260427-H:54` "No record for `DEC-20260420-H` exists in this
   repository" — withdrawn by `DEC-20260905-D` item 12
   (`id-collisions.yaml` lists it resolved).
10. `DEC-20260427-I:83-84` "(Phase 2a/2b)" composite and the reordered
    northdata.com/KRS-by-number quotation — withdrawn by `DEC-20260905-D`
    items 13-14.
11. `DEC-20260427-I:96` "REPLACES the prior northdata.com... scraper" —
    withdrawn by `DEC-20260905-J` item 25 (file says "scraping path", not
    "scraper"); confirmed against `apps/api/src/capabilities/
    dutch-company-data.ts:4`.
12. `DEC-20260427-I:94` attribution of the reactivation-trigger quote to
    `DEC-20260427-I-6` — withdrawn by `DEC-20260905-J` item 31 (no such id
    is in this candidate set; confirmed absent from `id-collisions.yaml`).
13. `DEC-20260429-A` "four review triggers" — NOT withdrawn; independently
    re-verified by me via a direct `notion-fetch` of page
    `35167c87082c8172bff8f3485699c961`: its "Re-evaluation triggers" section
    lists exactly the four triggers this record states (>EUR1.5k/month,
    customer/regulator replay demand, April 2027 annual review,
    Dilisense-initiated terms change), consistent with `DEC-20260905-E`'s
    and `-H`'s own prior verification.
14. `DEC-20260430-A` "partially superseded... `DEC-20260420-K`, whose
    display ID is an unresolved collision, and... the unique but
    unmigrated `DEC-20260422-H`" — withdrawn by `DEC-20260905-G` item 6
    (both are actually resolved/migrated at this commit).
15. `DEC-20260503-A:60-62` "preserved as unresolved source-ID collisions"
    (re: `DEC-20260502-A`/`DEC-20260420-E`/`-F`/`-H`) — withdrawn by
    `DEC-20260905-I` item 7 (all four now resolved).
16. `DEC-20260503-B` "tiered audit trail (basic on capabilities, full on
    *-Assurance products)" — withdrawn by `DEC-20260905-D` item 16 (real
    row/title order is "audit trail tiered").
17. `DEC-20260505-H:80-81` "not set in production" attributed to
    `OPENSANCTIONS_API_KEY`'s `cost_note` — withdrawn by `DEC-20260905-F`
    item 3 (boilerplate on 43 other rows, not that one's actual
    `cost_note`).
18. `DEC-20260506-G:37-38` "no formal record exists for that id" re:
    `DEC-20260422-H` — withdrawn by `DEC-20260905-H` item 4 (the file
    exists in this repository); the paired `DEC-20260506-F` half of the
    same sentence remains true (no such file, not in `id-collisions.yaml`
    — I re-verified both facts directly).
19. `DEC-20260506-G:86-87` Kyckr sales-gated-pricing quotation attributed to
    `DEC-20260507-D` — withdrawn by `DEC-20260905-C` item 38 (the language
    and the Kyckr rejection belong to `DEC-20260507-F`, confirmed by
    reading both records).
20. `DEC-20260507-G:83` "one day after `DEC-20260518` batch work" —
    withdrawn by `DEC-20260905-C` item 39 (commit is two days before, not
    one day after).

Relation-substantiation gaps already closed by amending records (verified
present, frontmatter-only mention counts confirmed by my relation-mention
script):
- `DEC-20260428-B` -> `DEC-20260428-A` (`related_to`, frontmatter-only,
  1 mention) — substantiated by `DEC-20260905-D` item 15 via CLAUDE.md's
  "Pairs with DEC-20260428-A" plus the complementary-scope argument.
- `DEC-20260430-A` -> `DEC-20260428-A` and -> `DEC-20260428-B` (both
  `related_to`, frontmatter-only, 1 mention each) — substantiated by
  `DEC-20260905-F` items 1-2 (restated in `-H`, `-I`, `-J`) via
  `DEC-20260430-A`'s own Context sentence naming "the third-party sourcing
  doctrine and the engineering bar" read against each target's unique
  `title`/`topic`.

I also independently re-verified `DEC-20260507-D`'s own two flagged spans
against `DEC-20260905-L`'s correction: `DEC-20260905-J` item 28 had wrongly
claimed the "future
BYO-endpoint augmentation" quote was attributed to an out-of-evidence Notion
page; `DEC-20260905-L` shows the quote is a faithful, correctly-attributed
substring of the row's own Rationale field (which is `DEC-20260507-D`'s
`evidence[0]`). I confirmed this myself against the dumped row: nothing in
`DEC-20260507-D` is withdrawn or otherwise defective.

## Relations check (rule 6)

Every `relations:` target in the partition resolves to an existing record
key at this commit and is never a bare collided id (checked against
`docs/decisions/id-collisions.yaml`). Substantiation in body prose:

| source | target | type | substantiated |
|---|---|---|---|
| DEC-20260415-B | DEC-20260415-A | amends | yes, named + discussed |
| DEC-20260421-L | DEC-20260421-J | related_to | yes |
| DEC-20260422-B | DEC-20260421-J | amends | yes |
| DEC-20260423-A | DEC-20260422-C | supersedes | yes, bidirectional |
| DEC-20260423-B | DEC-20260320-B | related_to | yes |
| DEC-20260423-B | DEC-20260423-A | related_to | yes |
| DEC-20260425-A | DEC-20260425-B | related_to | yes |
| DEC-20260427-B | DEC-20260427-A | related_to | yes |
| DEC-20260428-B | DEC-20260428-A | related_to | frontmatter-only in this record; substantiated by amending record DEC-20260905-D item 15 (see above) |
| DEC-20260429-A | DEC-20260428-A, DEC-20260428-B | related_to | yes, both named and discussed |
| DEC-20260430-A | DEC-20260428-A, DEC-20260428-B | related_to | frontmatter-only in this record; substantiated by amending records (see above) |
| DEC-20260504-C | DEC-20260504-B | related_to | yes |
| DEC-20260505-A | DEC-20260424-A | affirms | yes |
| DEC-20260505-B | DEC-20260503-B | affirms | yes |
| DEC-20260505-C | DEC-20260503-B | affirms | yes |
| DEC-20260505-G | DEC-20260505-H | related_to | yes |
| DEC-20260507-E | DEC-20260506-G | affirms | yes |
| DEC-20260507-F | DEC-20260506-G, DEC-20260428-A | related_to, affirms | yes, both |
| DEC-20260507-G | DEC-20260428-A | affirms | yes |
| DEC-20260507-H | DEC-20260506-G, DEC-20260507-F | (declared in frontmatter) | yes, both named 3-4 times each |

No relation target is a bare collided id. No qualified `--notion-` record
is in my partition (P4 owns the git-qualified record per the brief's
partition description), so check (8) does not apply here.

## Structural checks (rules 1, 2, 4, 5)

All 39 records: frontmatter parses; `record_key` = `id` (bare keys, no
`--notion-`/`--git-` qualifier in this partition) and `record_key`.md equals
the filename; the CAUTION banner and all five protected sections (Decision,
Context, Rationale, Consequences, Reversal conditions) are present; every
non-URL `evidence:` entry resolves to a file that exists at this commit
(spot-checked file existence for every evidence path in the partition via a
script pass, no misses); no null Notion field is quoted as if populated and
no populated field is called null (I read every row I dumped in full; none
of the 39 rows shows this pattern). Two rows (`DEC-20260422-D`,
`DEC-20260430-A`) have a genuinely null `Rationale` field on the Notion
side; both records correctly avoid quoting a null Rationale and instead
cite the Decision field or, for `DEC-20260430-A`, note the null field
explicitly when substantiating the relation basis.

## Ten "status on" code-claim spot checks

1. `DEC-20260503-B` — `apps/api/src/db/schema.ts` still declares
   `qpScore`, `rpScore`, `matrixSqs`, `matrixSqsRaw`, `trend`,
   `guidanceUsable/Strategy/Confidence`, and a full `sqs_daily_snapshot`
   table (lines 220-235, 1003-1028). Confirmed true — PR2 has not shipped.
2. `DEC-20260503-B` — `apps/api/src/jobs/test-scheduler.ts` still filters
   `ts.scheduled_testing_eligible = TRUE` at two query sites (lines 383,
   487) and carries the risk-tiered-cadence comment verbatim (lines 8-10)
   plus the "Daily SQS snapshot retired..." comment (line 683). Confirmed.
3. `DEC-20260503-B` — `apps/api/src/routes/audit.ts` has no "tier",
   "basic", or "Assurance" match; it does have `art_22_classification`
   with `risk_synthesis`/`screening_signal`/`data_lookup` branches.
   Confirmed both halves.
4. `DEC-20260504-A` — commit `31ca662e92d996d9d8a3ee150ce6f924d5419707`
   resolves at this commit (`git cat-file -e`); `apps/api/src/lib/
   claude-md-protocols.test.ts` exists. Confirmed.
5. `DEC-20260427-I` — none of the six slugs (dutch/portuguese/
   lithuanian/spanish/german/austrian-company-data) appears as a key in
   `auto-register.ts`'s `DEACTIVATED` map; each appears only in a
   `REACTIVATED`/`MIGRATED` comment. Confirmed.
6. `DEC-20260427-I` — `dutch-company-data.ts:4` reads "REPLACES the prior
   northdata.com scraping path", not "scraper". Confirmed (this is the
   withdrawn defect, item 11 above).
7. `DEC-20260419-A` — `check-no-new-console.mjs` lives at
   `apps/api/scripts/check-no-new-console.mjs` (not repo-root `scripts/`);
   `apps/api/scripts/console-allowlist.json` has exactly 24 top-level keys.
   Confirmed both.
8. `DEC-20260416-A` — `packages/mcp-server/` ships as `strale-mcp`
   (package.json present); `apps/api/src/routes/x402-gateway-v2.ts`
   defines `toBazaarFields`/`buildBazaarDiscovery` under a "Bazaar
   discovery extension builder" comment (line 335). Confirmed.
9. `DEC-20260505-B` — `apps/api/src/lib/lifecycle.ts`'s header comment
   matches the quoted text verbatim, including the three-item bulleted
   list of surviving transition call sites. Confirmed.
10. `DEC-20260425-A`/`DEC-20260425-B` — `config/env-manifest.yaml`'s
    `RAILWAY_REPLICA_REGION` row has `required_in: [production, test]`,
    `set_in: [railway]`, and the exact purpose text quoted; its
    `STRALE_PROCESSING_REGION` row has `required_in: []`, `set_in:
    [none]`, and a `cost_note` reading "Not set in production on
    2026-09-02 (Railway audit): the code path falls back or the feature
    is off. Setting it is a vendor/spend decision, not a deploy fix." —
    both records quote this correctly and correctly, and attribute it to
    the right named field of the right named row (unlike the
    `DEC-20260505-H`/`OPENSANCTIONS_API_KEY` misattribution above).
    Confirmed.

## Unverifiable claims (listed as unverifiable, not as findings)

- `DEC-20260429-A`'s Consequences: "A later Journal correction made this
  Decision authoritative over `DEC-20260430-A`'s contradictory post-launch
  self-host statement." I could not locate the specific Journal entry
  making this correction from repository evidence (Journal is a Notion DB
  outside this candidate set); the underlying substantive relationship
  (both records address the same OpenSanctions self-host question, and
  `DEC-20260430-A`'s Consequences do independently note "`DEC-20260429-A`
  had already deferred OpenSanctions self-hosting" as one of its own four
  named defects) is consistent with the claim, but the specific "later
  Journal correction" artifact itself is unverifiable from this candidate
  set. Not a finding: the record does not present this as a repo-verifiable
  claim, and DB/production/Notion-Journal state claims are, per prior
  rounds' own convention, left as stated.
- `DEC-20260505-A`'s and other records' claims about historical
  chat-memory/project-knowledge sync state (e.g. "didn't sync to memory or
  project knowledge for 2-3 days") are, by the records' own framing,
  events outside this repository's version control and are correctly
  presented as unverifiable-from-repo rather than as a repo fact.

## Findings

None. Every checker residual in this partition is a checker miss (own
wording per the DEC-20260905-M clause, or faithful to the record's own
cited Notion row/file, misranked by the tool); every statement I located
that matches a defect pattern is already withdrawn/corrected by a named
`DEC-20260905-B` through `-Q` amending record, verified present and
verified consistent with the correction; all structural checks pass; all
relations resolve and are substantiated (directly or via an amending
record's substantiation); ten code-claim spot checks all confirmed true.

PARTITION VERDICT: PASS

### Partition P4

# Closing review round 16, partition P4

Partition P4, commit b014c41767d46d73be743a1cc121045194f58714, 41 records.

Files reviewed (relative to docs/decisions/records/): DEC-20260507-I.md, DEC-20260507-J.md, DEC-20260508-A.md, DEC-20260508-D.md, DEC-20260510-A.md, DEC-20260511-B.md, DEC-20260511-C.md, DEC-20260511-D.md, DEC-20260511-E.md, DEC-20260511-F.md, DEC-20260513-A.md, DEC-20260513-B.md, DEC-20260513-C.md, DEC-20260513-D.md, DEC-20260513-E.md, DEC-20260515-A.md, DEC-20260515-B.md, DEC-20260515-C.md, DEC-20260517-A.md, DEC-20260518-A.md, DEC-20260518-B.md, DEC-20260518-C.md, DEC-20260518-D.md, DEC-20260518-E.md, DEC-20260518-F.md, DEC-20260518-G.md, DEC-20260812-A.md, DEC-20260813-A.md, DEC-20260815-A.md, DEC-20260820-A-WEBSITE-HERO.md, DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md, DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md, DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md, DEC-20260820-E-WEBSITE-SEARCH-WEB.md, DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md, DEC-20260822-A.md, DEC-20260827-A.md, DEC-20260831-A.md, DEC-20260901-A.md, DEC-20260904-A.md, DEC-20260904-B.md.

Setup: `git fetch origin` then `git checkout --detach b014c41767d46d73be743a1cc121045194f58714` in the agent's own isolated worktree (`C:\Users\pette\Projects\strale\.claude\worktrees\agent-a29a8a9ac351bd495`), then `npm ci` (succeeded, 668 packages). No new worktree was created since this agent's worktree was already isolated per the task instructions; nothing was committed, pushed, stashed, or removed.

## Method

1. Read the round-16 method brief and the fifteen prior amending records (`DEC-20260905-B` through `-Q`), then grepped each for every P4 filename to identify which P4 records already have corrections on file, and read those corrections in context before judging anything as a new finding.
2. Ran `node scripts/decision-records-lib.mjs`'s `validateDecisionRecords()` (via a small driver script) against the full corpus, filtered to the 41 P4 files, to check frontmatter schema validity, `record_key`/`id`/filename agreement, the CAUTION banner, the five protected sections, evidence-path existence (repo-relative), and relation-target existence against the collision registry.
3. Ran the operator checker: `node scripts/m2-quote-fidelity.mjs --export <decisions-export-raw.txt> --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` with one `--only <file>` per P4 record.
4. Manually read every one of the 41 records in full, cross-checking every quotation against its stated source (Notion row via `dump_rows.py`, a repo file at the pinned commit, or another record), verifying evidence entries (including cross-repo and same-repo-commit entries) resolve, verifying relation targets are substantiated in prose and are not bare collided ids, and spot-checking ten-plus "status on" code claims against the named files.

## Script and residuals

The operator checker (`scripts/m2-quote-fidelity.mjs`) extracts every double-quoted span of at least the given length, normalizes both the span and each candidate source (transliterate €/×/≥/≤/→/…, lowercase, strip all non-alphanumerics), and reports the span faithful if it (or, for an ellipsis-split span, each ordered segment) is a substring of some source's normalized text (Notion row fields, evidence-listed repo files, backticked paths and commit shas in the same paragraph, and every other record file). Run over the 41 P4 files at `--min-chars 12`:

`Totals: 41 records, 118 spans, 112 faithful, 6 residual`

Residual list and my classification of each:

1. `DEC-20260518-A.md:100` — `"Evidence Tier 1/2/3"`. **Checker miss classified as own wording, not a quotation.** Reading the sentence: "No `evidence_tier` field or "Evidence Tier 1/2/3" label was found anywhere in code, manifests, or `docs/company/claims.yaml`." The quoted phrase is the record's own label for the framework it names in its Decision section (not the actual title, which is "Evidence Tier framework for Counterparty Assurance v1..."), used here as a negative-search term, not attributed to any file, row, or person's words. Per DEC-20260905-M's clause this is prose, not a finding.
2. `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md:26` — `"The burden collapses"`. **Own wording.** "Adopt "The burden collapses" as the second homepage proof section." — the record is naming its own adopted design direction, not quoting an external source.
3. `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md:28` — `"Selection Violet"`. **Own wording**, same pattern: "Adopt the Enrichment & Validation chapter in "Selection Violet" as the second homepage use-case world."
4. `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:28` — `"not a live ranking"`. **Checker miss, faithful.** The record's evidence array cites the whole directory `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/`, and `use-case-search-web-intelligence-v1.6.md:35` inside that directory reads: "The card is labelled **Documented output example** and **not a live ranking**." Verified directly against the frontend checkout at that commit. The checker does not crawl directory-shaped evidence entries, hence the miss.
5. `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:63` — same phrase, in the Rationale/Reversal-conditions sections. **Checker miss, faithful**, same source as item 4.
6. `DEC-20260904-A.md:180` — the multi-line quote "Every row reaches formally_migrated, intentionally_historical, or obsolete_or_superseded through contradiction-checked batches, or an explicitly reviewed rule classifies pre-readiness feature-scope rows as evidence-only." **Checker miss, faithful.** `docs/project/m2-closure-register.yaml:5194-5196` (G1's `closes_when` clause) reads word for word: "Every row reaches formally_migrated, intentionally_historical, or obsolete_or_superseded through contradiction-checked batches, or an explicitly reviewed rule classifies pre-readiness feature-scope rows as evidence-only." The checker's own match trace shows it found a "faithful" match against `docs/decisions/records/DEC-20260905-C.md` instead (a coincidental match, since that record also discusses the same clause) rather than against the `.yaml` file; the true source is the register file, verified directly.

Additional note on a defect the checker did **not** surface as a residual at all, because it matched (falsely, via a self-referential hit against another decision record that reproduces the defect verbatim while describing it) rather than flagging a residual:

- `DEC-20260515-C.md:96-97` — "a paid AJPES restPrsInfo contract with redistribution rights, or a future EU High-Value-Dataset expansion" inserts a word ("a") not present in `manifests/slovenian-company-data.yaml:135-136` ("Reactivation trigger: paid AJPES restPrsInfo contract..."). The checker reported this span "faithful" only because `docs/decisions/records/DEC-20260905-D.md` (which withdraws this exact defect) itself quotes the same wrong text while describing it, and the checker treats every other record as a candidate source. **This is not a new finding**: the defect is already withdrawn, twice over, by `DEC-20260905-D` item 18 and `DEC-20260905-J` item 29 (both correctly identify the same single occurrence at line 96 and withdraw the inserted "a"). I verified both amending items describe the one real occurrence in `DEC-20260515-C.md` accurately.
- `DEC-20260518-D.md:43` — "does Strale return this today" (dropping "UBO data" and "for this country" from the row's actual Rationale wording) is likewise already withdrawn by `DEC-20260905-J` item 30. Verified the quote is present in the record exactly as the amending record describes, and the correction is accurate against the row's Rationale field as I independently confirmed.

## Findings

None. Every record in P4 that carries a defect already has that defect withdrawn by an earlier-round amending record (`DEC-20260905-B` through `-M`), and in every case I independently verified the correction itself is right:

- `DEC-20260510-A.md:75` "244 files (217 with a recorded intent, 27 without)" — withdrawn by `DEC-20260905-B` item 5 (stale count against a regenerated file). Verified: quote present, correctly identified as a moving figure.
- `DEC-20260510-A.md:86-87` "promote a useful handoff note to tracked" — withdrawn by `DEC-20260905-M` item 1 as own wording wrongly quotation-marked. Verified: phrase present, not in the row's Notion fields, `handoff/README.md`, or `docs/programs/cto-readiness/PROGRAM.md`; the row's Rationale does carry the "PROMOTE-TO-TRACKED" classification the record paraphrases.
- `DEC-20260511-C.md:85-86` "CC does not reconcile silently" misattributed to "the 2026-05-13 cleanup prompt" — withdrawn by `DEC-20260905-B` item 6. Verified: the phrase is absent from the named 2026-05-13 handoff file and present instead in an unrelated 2026-05-06 file.
- `DEC-20260508-A.md` Rationale, the "no Tier-1 path exists" composite quotation attributed to "the prior row" (`DEC-20260507-H`) — withdrawn by `DEC-20260905-I` item 8 as a composite/misattributed paraphrase. Verified: neither `DEC-20260507-H.md` nor its Notion Rationale field contains that exact phrasing; the record's own row does carry a related, correctly-quoted phrase earlier in the same record.
- `DEC-20260904-B.md:102` "where did this id's authority come from" — withdrawn by `DEC-20260905-M` item 2 as an unsourced quotation-marked rhetorical framing. Verified: absent from every evidence entry checked.
- A separate finding in `DEC-20260905-C` items 23-24 concerns `DEC-20260511-F` only insofar as another record (`DEC-20260317-A`, outside P4) falsely claimed no formal record exists for it; I independently confirmed `docs/decisions/records/DEC-20260511-F.md` does exist with `record_key: DEC-20260511-F` and the title the amending record names.

No new false, fabricated, misattributed, or unverifiable statement was found anywhere else across the 41 records.

## Ten (plus) code-claim spot checks

1. `DEC-20260508-D.md` — "`apps/api/src/capabilities/german-company-data.ts` fetches `https://api.openregister.de` using `OPENREGISTER_API_KEY`", "`config/env-manifest.yaml`'s `OPENREGISTER_API_KEY` row records `holder: railway`... with no dormancy `cost_note` (unlike `OPENSANCTIONS_API_KEY`)". Verified: `apps/api/src/capabilities/german-company-data.ts:22,100,103`; `config/env-manifest.yaml:788-796` (no `cost_note`) vs. `config/env-manifest.yaml:797-806` (`OPENSANCTIONS_API_KEY` does carry a dormancy `cost_note`).
2. `DEC-20260511-B.md` — block 0066's comment on its narrowed scope and the partition with block 0069. Verified: `apps/api/src/lib/startup-migrations.ts:574,577,600,610` carry exactly the quoted comment text.
3. `DEC-20260518-C.md` — "No Digiteal handler exists on `main`... no `sepa-vop` or `digiteal` slug exists." Verified: `grep -ril digiteal` under `apps/api/src/capabilities/` and `manifests/` returns only `manifests/uk-cop-check.yaml`'s pointer text at line 223; no `sepa-vop` hits anywhere.
4. `DEC-20260513-C.md` — the code-comment DEC-ID discrepancy (comments in `test-scheduler.ts` cite `DEC-20260513-D` for the per-suite stagger, though the Notion source row is `DEC-20260513-C`). Verified against `apps/api/src/jobs/test-scheduler.ts:251-256,334` (note: the record's evidence array cites the file without the `jobs/` segment implicitly resolved by its actual path; the listed evidence path `apps/api/src/jobs/test-scheduler.ts` is correct and exists).
5. `DEC-20260518-D.md` — `danish-company-data.ts` and `uk-company-data.ts` `ubo_availability`/`ubo_availability_reason` per-country outcomes. Verified verbatim at `apps/api/src/capabilities/danish-company-data.ts:183-184` and `apps/api/src/capabilities/uk-company-data.ts:226-227`.
6. `DEC-20260518-D.md` — "PR #131 is confirmed merged 2026-05-18". Verified: `git log` shows merge commit `117b3868b...` dated 2026-05-18, subject "Merge pull request #131 from strale-io/feat/evidence-tier-labeling-sweep".
7. `DEC-20260904-B.md` — the record-key regex is verbatim in `scripts/decision-records-lib.mjs`. Verified: `DECISION_RECORD_KEY_PATTERN` in that file is character-for-character the pattern the record quotes in a fenced code block.
8. `DEC-20260904-B.md` — the five error codes (`RECORD_GIT_KEY_ID_MISMATCH`, `_SOURCE_KIND`, `_PROVENANCE_MISMATCH`, `_NOT_ANCESTOR`, `COMMIT_UNVERIFIABLE`) and their semantics. Verified: all five live in `scripts/m2-closure-register-lib.mjs` (not `decision-records-lib.mjs`, which the record does not claim they live in) and are covered by `scripts/m2-closure-register.test.mjs`.
9. `DEC-20260904-A.md` — `scripts/m2-closure-apply-g1-rule.mjs` exists and the measured population (76 of 216 private rows) is internally consistent (216 − 129 − 11 = 76) and matches `archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md`'s own stated "76 rows matched" at line 47.
10. `DEC-20260827-A.md` — PR #410 merged 2026-08-27, and `apps/api/src/capabilities/austrian-company-data.ts` migrated to the JustizOnline IWG/HVD API, citing `DEC-20260813-A`. Verified: `git log` shows commit `67dd1ffa4...` dated 2026-08-27 with subject naming PR #410 and the Firmenbuch HVD migration; the file's header comment and `JUSTIZONLINE_API_KEY` requirement match; it cites `DEC-20260813-A` (also in this partition) by name.
11. (bonus, tenth distinct record beyond the eight already covered by 1-10) `DEC-20260507-I.md` — "Neither the exception this row creates nor the Section 1/6.5 numbering it amends exists in this repository's voice document... `docs/company/VOICE.md` (57 lines)". Verified: `docs/company/VOICE.md` is exactly 57 lines and contains none of "Section 1", "Section 6.5", "first person", `petter@strale.io`, or `hello@strale.io`.
12. (bonus) `DEC-20260513-A.md` — CLAUDE.md's `DEC-20260902-A` bullet ("The website redesign is built inside this repository as `apps/web` (monorepo)... `strale-frontend` was swept and its design material preserved... and is kept, not extended, until the `apps/web` site serves production.") and "`apps/web` does not yet exist... `ls apps/` lists only `api`". Verified against `CLAUDE.md:311` and `ls apps/` (only `api` present, `test -d apps/web` fails).

All twelve code claims verified true against the pinned commit; no discrepancy found.

## Structural checks (all 41 records)

Ran `validateDecisionRecords()` (from `scripts/decision-records-lib.mjs`) against the full corpus and filtered to the P4 files: zero validator findings for any of the 41 records. For every record: `record_key` == `id` == filename base; the CAUTION banner is present verbatim; all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) are present; every relation target (`DEC-20260812-A`→`DEC-20260503-A`, `DEC-20260815-A`→`DEC-20260812-A`, `DEC-20260822-A`→`DEC-20260815-A`, `DEC-20260813-A`→`DEC-20260518-F`/`DEC-20260428-A`, `DEC-20260901-A`→`DEC-20260831-A`, `DEC-20260518-G`→`DEC-20260518-E`, `DEC-20260511-E`→`DEC-20260511-F`, plus a handful of empty `relations: []` arrays) exists as a record key at this commit, is substantiated in ordinary prose (verified by grep + read for each), and none is a bare collided id (checked against `docs/decisions/id-collisions.yaml`, which lists no collision for any of these ids). No quotation of a null Notion field, and no populated field called null, was found in any manually-read record (spot-checked via `dump_rows.py` against `DEC-20260507-I`, `DEC-20260507-J`, `DEC-20260508-D`, `DEC-20260511-D`, `DEC-20260511-E`, `DEC-20260513-B`, `DEC-20260513-D`, `DEC-20260513-E`, `DEC-20260515-C`).

Evidence-path check: every repo-relative evidence path in the 41 records resolves to a real file at this commit. Two evidence-array shapes needed manual (not purely path-existence) verification and both resolved correctly: (a) same-repo bare commit-sha entries with no path (`DEC-20260822-A`'s `strale-io/strale@3f7f650f...` — confirmed an ancestor of HEAD via `git merge-base --is-ancestor`, and matches PR #362's merge commit) and `DEC-20260901-A`'s `codex/repo-native-operating-model@b2951094...` (confirmed a real commit in this repository's history, with `archive/imports/context-pack/2026-08-31/manifest.json` resolving at that commit); (b) cross-repo directory-shaped entries (all six `DEC-20260820-*` records' `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/` and `DEC-20260820-F`'s three specific file paths, plus `DEC-20260513-A`'s `strale-io/strale-frontend@04c9fca9...:public/_headers`) — all confirmed to resolve in `C:/Users/pette/Projects/strale-frontend` after `git fetch origin` there.

## Unverifiable

Nothing in this partition was left unverifiable. Every quotation, evidence entry, relation, and sampled code claim was traced to a source and confirmed or (for the six checker residuals and two already-withdrawn defects discussed above) explained.

PARTITION VERDICT: PASS

### Partition P5

# Closing review, round 16, partition P5

Commit reviewed: b014c41767d46d73be743a1cc121045194f58714
Record count: 34

## Setup

Worked in the session's own isolated worktree (already pinned per the task's
instructions, not a fresh `C:/tmp/strale-closing16-P5` worktree): `git fetch
origin` then `git checkout --detach b014c41767d46d73be743a1cc121045194f58714`,
then `npm ci` (succeeded on the first attempt, no ENOTEMPTY/EPERM retry
needed). The sibling `strale-frontend` checkout was fetched
(`git -C C:/Users/pette/Projects/strale-frontend fetch origin`) and read via
`git show <sha>:<path>` for every cross-repo evidence entry. Notion rows were
read exclusively through `dump_rows.py <out> PAGE:<page id>`, output written
under the scratchpad's `p5work/` subdirectory (Git Bash `/tmp` is not the
Windows scratchpad, so all outputs were written there).

## Partition list

The 34 files are all `--notion-` qualified collision-layer records, in 17
pairs (one collision id per pair) plus one singleton pair where the second
Notion row has no formal record (`DEC-20260409-C`, whose twin is
`documented_only`) and one pair where the "second" row also has no
`record_key` in the registry (`DEC-20260420-D`, whose twin is
`documented_only`). All 34 ids were cross-checked against
`docs/decisions/id-collisions.yaml` (every collision `resolution_status:
resolved`, both listed `disposition: formal_record` matching the two files
in the pair) and against `docs/project/m2-closure-register.yaml`'s
`decision_rows` (every one of the 34 page ids has `disposition:
formally_migrated` and a `record_key` identical to the file's own
`record_key` — check (8) passes for all 34).

## Script used

Wrote a small Python check (inline, not saved as a standalone file) that:
parses each record's frontmatter with PyYAML, confirms `record_key`/`id`
agree with the filename (`<record_key>.md`), confirms the CAUTION banner
and all five protected section headings (`## Decision`, `## Context`,
`## Rationale`, `## Consequences`, `## Reversal conditions`) are present in
the body, confirms every `relations[].target` exists as a `.md` file under
`docs/decisions/records/`, and confirms no relation target is a bare
collided id per `docs/decisions/id-collisions.yaml`. Result: zero issues
across all 34 files.

Also ran the operator checker exactly as specified:
```
node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt \
  --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 \
  --only <file1> --only <file2> ... (34 --only flags, one per partition file)
```
Logic in one sentence: it extracts every double-quoted span of >= 12
characters from each record, normalizes both the span and every candidate
source (the record's own evidence files, every other record, CLAUDE.md, and
the frontend checkout) under the stated transliteration/lowercase/strip-
punctuation convention, and reports a span "residual" only if no candidate
source contains it as a substring.

**Result: 34 records, 243 spans checked, 243 faithful, 0 residual.** No
residual list to classify for this partition; every quoted span the checker
could locate at all, it located.

Note on a checker blind spot (not a script defect, just its scope): the
checker matches a quoted span against ANY source in the corpus, not
specifically against the source the record's prose attributes the quote to.
Two records in this partition (below, items covered under "already
withdrawn") attribute a quotation to `DEC-20260812-A`'s own text when the
exact wording actually lives only in `CLAUDE.md`; the checker reports these
as faithful (0 residual) because the phrase does exist verbatim in
`CLAUDE.md`, which is also in its search corpus. That is a real
misattribution defect, but it is invisible to a byte-fidelity checker by
design, and — as detailed below — it was already caught by the review
process itself (`DEC-20260905-C`, findings 35 and 36) and withdrawn from
the formal record before this round.

## Findings

None. Extensive per-record verification (below) found the record text,
including every quotation, evidence citation, and "status verified on
2026-09-05" code claim, either exactly correct or already corrected by a
named amending record per the round's rule (a).

Two items are worth naming explicitly because they would be findings under
a naive reading, but are not findings under this round's rules:

1. `DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086` quotes
   `DEC-20260812-A` as stating it "supersedes... the Counterparty Assurance
   rename/ICP". Independent check: `docs/decisions/records/DEC-20260812-A.md`
   contains no such phrase anywhere in its 84 lines (no "rename", no "ICP");
   the wording is `CLAUDE.md:302`'s summary bullet for DEC-20260812-A, not
   the formal record's own text. This exact statement is withdrawn by
   `DEC-20260905-C`, finding 35 ("Withdraws, as the record has it:
   `DEC-20260812-A` (existing record) states it 'supersedes... the
   Counterparty Assurance rename/ICP,'. Fact: `docs/decisions/records/
   DEC-20260812-A.md` contains no such phrase..."). My independent read of
   both files confirms the withdrawal's own fact-check is itself correct.
   Per rule (a), corrected, not a finding.
2. `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f` quotes the same
   `DEC-20260812-A` phrase in its Consequences section. Withdrawn by
   `DEC-20260905-C`, finding 36, on the identical basis. Independently
   confirmed correct in the same pass. Per rule (a), corrected, not a
   finding.

No other misquotation, fabrication, misattribution, or unverifiable claim
was found across the 34 records. `DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce`'s
stale "five writing rules" quotation from `VOICE.md` (naming a "No jargon,
ever" rule that does not exist in the file at this commit — the file's
actual first rule is "Use audience-appropriate terms (DEC-20260905-A)") is
likewise already withdrawn, by `DEC-20260905-C` finding 31, verbatim
matching what I found independently.

## Checker residuals for this partition

None reported (0 of 243 spans flagged). Nothing to classify.

## Ten code-claim spot checks

1. `DEC-20260225-P-c5d6--notion-...f6f2038.md` — `failedRequests` table
   fields. File: `apps/api/src/db/schema.ts:681-698`. Confirmed: `id`,
   `userId`, `ipHash`, `task`, `category`, `maxPriceCents`, `failureType`,
   `errorDetail`, `userAgent`, `createdAt` all present; 4 insert call sites
   in `apps/api/src/routes/do.ts` (lines 935, 1163, 1207, 1265).
2. `DEC-20260303-A--notion-...4f36ca33.md` — smart-input discovery
   endpoints. File: `apps/api/src/routes/suggest.ts:44` (`GET
   /suggest/typeahead`) and `:84` (`POST /suggest`). Both confirmed live,
   public, no-auth.
3. `DEC-20260304-A--notion-...58256f40a.md` — homepage section count and
   order. File: `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx`.
   Confirmed exactly 10 numbered section comments (lines 138-318) matching
   the record's list; comparison at section 4, not 2 (record's own noted
   discrepancy, confirmed accurate).
4. `DEC-20260304-B--notion-...ccdd52b99b1e.md` — stats bar contents. File:
   `strale-io/strale-frontend@04c9fca9:src/components/StatsStrip.tsx`.
   `buildStats()` returns exactly `workflows`, `capabilities`, `automated
   tests`, `free — no signup`; no "Countries" stat; header comment matches
   record's quotation verbatim.
5. `DEC-20260304-C--notion-...97f9efa520332024.md` — trust-display
   dashboard component. File: `strale-io/strale-frontend@04c9fca9:
   src/components/solutions/TestRunLog.tsx`. Confirmed `font-mono`,
   `passRate`/`getPassRateColorClass`, `border-b border-border` all
   present.
6. `DEC-20260320-C--notion-...178c7acc8b5c396aa3.md` — auto-register
   mechanism replacement. File:
   `apps/api/src/capabilities/auto-register.ts:1-22`. Confirmed no `.d.ts`
   filter, no `MIN_EXPECTED_EXECUTORS`, no `process.exit`; header comment
   and the three named error labels (`auto-register-executor-file-missing`,
   `auto-register-import-failed`, `auto-register-no-executor-after-import`)
   match verbatim.
7. `DEC-20260320-J--notion-...7a82be21d48f57411.md` — Methodology page's
   use of platform facts. File: `strale-io/strale-frontend@04c9fca9:
   src/pages/Methodology.tsx:92,374`. Confirmed the only `facts?.` usage is
   `facts?.static.vendors.sanctions`; no capability/solution/test count is
   read or rendered on the page.
8. `DEC-20260405-B--notion-...920dd09d78aa06b6.md` — transactions storage
   shape and the block-0101 verification comment. Files:
   `apps/api/src/db/schema.ts:332-334` (nullable `capabilityId` +
   `solutionSlug`, no separate solution-execution table) and
   `apps/api/src/lib/startup-migrations.ts:2100-2109` (exact quoted
   comment, "694 solution rows... 126 sub-calls").
9. `DEC-20260406-B--notion-...becfe4900a1ff319.md` — nested path resolution.
   File: `apps/api/src/lib/solution-executor.ts:11-13,138-145`. Confirmed
   `parsePath()`/`walkPath()` exist and the doc-comment quote (including the
   `$steps[0].license.spdx` example) matches verbatim.
10. `DEC-20260420-G--notion-...38c3acaca5d01d6ef.md` — verify-endpoint
    hardening constants. File: `apps/api/src/routes/verify.ts:19-29,256,362`
    (`MAX_DEPTH = 50`, the two named comments) and
    `apps/api/src/routes/transactions.ts:200` (`AUTH_VERIFY_MAX_DEPTH = 50`,
    a separate constant, as the record states).

All ten confirmed exactly as the record states.

## Additional verification performed beyond the minimum

Every one of the 34 records was read in full (not sampled), and every
double-quoted evidentiary claim of substance was independently checked
against the cited file, the cited Notion row (via `dump_rows.py`), or the
cited sibling-repo path — not only the ten listed above. This included:
manifest field checks for `au-company-data`, `pep-check`,
`credit-report-summary`; the `ABN_LOOKUP_GUID`/`ABR_AUTH_GUID` rename;
the KYB/Invoice-Verify 60-solution seeding script and its two retirement
scripts (`drop-aggregator-kyb.ts`, `drop-sg-kyb.ts`), where the record's
"15" and "3" paused-solution counts were verified against the scripts'
own header comments; the `processes_personal_data`/
`personal_data_categories` manifest-count claims in
`DEC-20260420-D` and `DEC-20260420-H`, where the record's "342"/"127"
figures differ from the current "350"/"129" — traced to a specific later
commit (`4529f778`, 2026-09-06, "eight agent-data capabilities...") that
added exactly 8 manifests, 2 of which declare `personal_data_categories`,
fully accounting for the drift; per rule (e) this is a dated observation
whose movement from unrelated later work is not a finding.

## Unverifiable

None. Every claim in this partition resolved one way or the other: correct,
or already corrected by a cited amending record.

## Conclusion

All 34 records in partition P5 are structurally sound (frontmatter,
filename agreement, CAUTION banner, five protected sections), have
consistent registry bindings (`id-collisions.yaml` and
`m2-closure-register.yaml` agree with each record's `record_key` and
`disposition`), have zero relation-target problems (no missing target, no
bare collided id), pass the operator quote-fidelity checker at 243/243, and
pass full manual re-verification of every quotation and every "status
verified" code/file claim, either directly or via a correctly-applied
amending-record withdrawal (rule a).

PARTITION VERDICT: PASS

### Partition P6

# Closing review round 16, partition P6

Commit: b014c41767d46d73be743a1cc121045194f58714
Record count: 49 (33 `--notion-` qualified records across DEC-20260420-I through DEC-20260513-F; 1 `--git-` qualified record, DEC-20260422-A; 15 amending records DEC-20260905-B through DEC-20260905-Q)

## Setup

`git fetch origin` then `git checkout --detach b014c41767d46d73be743a1cc121045194f58714` in this session's own isolated worktree (per the launching agent's explicit override of the template's separate-worktree instruction), followed by `npm ci` (succeeded, 668 packages). No worktree was created or removed beyond this session's own; nothing was edited or committed.

## Script used

Ran the operator checker `scripts/m2-quote-fidelity.mjs` against the private Notion export (`scratchpad/decisions-export-raw.txt`, the same raw text `dump_rows.py` reads) with `--frontend C:/Users/pette/Projects/strale-frontend --min-chars 12` and one `--only <file>` per record in this partition. Logic in one sentence: for every double-quoted span of at least 12 normalized characters, normalize both the span and every candidate source (Notion row fields, repository files at this commit, sibling-record files) under the stated convention, split on ellipses into ordered segments, and report the span as faithful only if every segment is found as an in-order substring of some one source; otherwise it reports the best partial-prefix match found and calls it residual.

Totals for this partition: 49 records, 849 quoted spans checked, 757 faithful, 92 residual.

### Residual-mismatch list and classification

All 92 residuals fall in the five `DEC-20260905-*` amending records that carry heavy nested quotation (`-C`: 83, `-D`: 2, `-F`: 6, `-G`: 1). None is a fresh defect; all are checker misses of two kinds:

1. **A single escaped-quote parsing defect at `DEC-20260905-C.md:373`** (`"... armed in prod\")"`), which throws off the naive `/"([^"]*)"/g` quote-pairing regex for every subsequent quote mark in that file, producing spurious "spans" that are actually the record's own connective prose sitting between two genuine quotations rather than quotations themselves. This is 82 of `DEC-20260905-C`'s 83 residuals and 1 of `DEC-20260905-D`'s 2. `DEC-20260905-F` documents this exact class and count in its own Consequences section ("The 83 self-referential parsing artifacts inside `DEC-20260905-C.md` (82) and `DEC-20260905-D.md` (1)... downstream of a single escaped-quote parsing defect at `DEC-20260905-C.md:373`"), which I independently confirmed by reading line 373 directly. I spot-verified several of the genuine quotations inside these artifact-adjacent passages against their real sources: item 21's "quality floor quarantine <70% / deactivate <30% on >=10 real calls/30d, auto-promote on recovery" matches `CLAUDE.md:317` verbatim; "the quality floor is armed in production" matches `apps/api/src/routes/do.ts` at three lines (1771, 1953, 2866); "... armed in prod")" matches `docs/decisions/records/DEC-20260315-H.md:74`. All confirmed faithful to their named sources; the residual flag is the extractor's artifact, not a content defect.
2. **Own-wording, not a quotation** (`DEC-20260905-M`'s clause): `DEC-20260905-D`'s remaining residual ("checker missed it" / "checker miss, faithful to a source", lines 429-451) is the record's own illustrative phrasing about the reconciliation methodology, attributed to no source; `DEC-20260905-G`'s residual ("Rule (a) cross-check", line 348) is the record's own label for its round-6 P3 partition's table entry. Neither is presented as anyone's words. Judged as prose, not findings.

No residual in this partition is a real defect.

## Findings

None. Every quotation checked against a source (Notion row field via `dump_rows.py`, repository file at this commit, or sibling record) was faithful or was a checker-artifact/own-wording case classified above. Every evidence path resolved, every relation target exists as a record key and is never a bare collided id, and every collision-registry / M2-closure-register binding matched for the 33 `--notion-` qualified records and the 1 `--git-` qualified record.

### `DEC-20260905-Q` (the newest record in this partition, checked with particular care per instruction)

Verified all four items:

1. **Item 1** (withdraws a claim about `DEC-20260225-P-m1n2.md:109`): confirmed the record's line 109 reads "Both the \"not CI reports\" clause and the \"MCP server + SDK\" clause are reflected in what exists today"; confirmed via `dump_rows.py PAGE:31267c87082c811f932fe2a2220dd9af` that the row's Rationale field contains "MCP server + SDK" verbatim but its actual do-not-build text is "Don't build: CI reports, PDF engines, domain-specific pipelines, enterprise sales" — never "not CI reports" as a standalone clause. `DEC-20260905-Q`'s withdrawal is correct.
2. **Item 2** (a resolution report repeating an already-withdrawn misattribution): confirmed `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md:159` carries the quoted sentence; confirmed `git grep -c "Counterparty Assurance rename/ICP" HEAD -- CLAUDE.md docs/decisions/records/DEC-20260812-A.md` returns 1 hit in `CLAUDE.md` and 0 in `DEC-20260812-A.md`; confirmed `DEC-20260812-A.md:64` reads "The source decision explicitly supersedes the Counterparty Assurance row named..."; confirmed `DEC-20260905-C.md` items 35-36 (headed `### DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086` and `### DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f`) already withdraw this identical misattribution from the two formal records, naming only those records; confirmed `DEC-20260905-G` item 5 already names this same resolution report at its line 82 for a different statement, matching the text there. `DEC-20260905-Q`'s reasoning and citations check out.
3. **Item 3 clause scoping** (the general rule that a resolution report's stale statement is governed by whatever amending record withdrew it, wherever it appears): the clause as written is explicitly conditioned — "where it carries a statement that an amending record has withdrawn from the formal record for the same collision id, that withdrawal governs the statement... This clause does not excuse any false statement: the statement stays withdrawn... regardless of whether any record names the report by path." This scoping requires an actual prior withdrawal by an amending record; it cannot be read to excuse a report statement no amending record ever withdrew, and nothing in the record's Consequences or Context sections stretches it that way — item 4 in Context explicitly says a separate, newly-found error (the round-12 partition count) is stated as a fresh item rather than folded under this clause, which is consistent behavior.
4. **Item 4** (the round-12 archive's partition count): confirmed `archive/sessions/2026-09-05-m2-closing-review-round-12.md` line 1139 reads "Five partitions passed and the gates were clean; the consolidated verdict is FAIL on P5's one item and P6's two items" in its "Consolidated findings" section, while `grep -n "PARTITION VERDICT"` on the same file shows exactly four PASS lines (P1, P2, P3, P4) and two FAIL lines (P5, P6) — confirmed by partition heading proximity. The file's own method-summary line 43 ("Four partitions passed clean: P1, P2, P3, and P4") already states the correct count, directly contradicting its own later "Consolidated findings" sentence — exactly the self-contradiction `DEC-20260905-Q` describes. Four partitions passed, not five; the record's correction is true, and its account that the false sentence originated in the commissioning brief and was carried forward into round 15 is plausible and not contradicted by anything I read.

All four items of `DEC-20260905-Q` verified true; no defect found in this newest record.

## Structural checks (all 49 records)

- Frontmatter parses; `record_key`, `id`, and filename agree for every record (qualified filenames match `<key>.md`; bare keys equal their id). No exceptions.
- CAUTION banner present and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present in every record.
- Every `evidence:` entry resolves to an existing file at this commit (or a Notion URL, or a resolvable `strale-io/strale-frontend@<sha>:<path>` cross-repo entry — none of this partition's records used a cross-repo entry). No missing evidence paths.
- Every `relations:` target exists as a record key in `docs/decisions/records/` at this commit. Cross-checked every relation target in every P6 record against `docs/decisions/id-collisions.yaml`'s 35 collided bare ids: no relation target in this partition is a bare collided id.
- All 33 `--notion-` qualified records: verified against `docs/decisions/id-collisions.yaml` (the collision entry for the record's page id carries `disposition: formal_record` and the matching `record_key`) and `docs/project/m2-closure-register.yaml` (the register row for the same page id carries `disposition: formally_migrated` and the same `record_key`). All 33 matched.
- `DEC-20260422-A--git-3b256587` (the sole `--git-` qualified record in this partition): `id: DEC-20260422-A` equals the key with the qualifier removed; evidence[0] is `https://github.com/strale-io/strale/commit/3b25658736bfed53eec52c8acf2619dacd54d1f5`, whose prefix `3b256587` matches the key qualifier; `git cat-file -t` confirms the commit exists and `git merge-base --is-ancestor` confirms it is an ancestor of HEAD. The record file itself carries no `source_kind`/`git_provenance` fields (these are register-level fields, not record-file fields per `scripts/m2-closure-register-lib.mjs`); the `docs/project/m2-closure-register.yaml` entry at line 349-353 carries `source_kind: git-native`, `source_rows: []`, and `git_provenance` equal exactly to the record's evidence[0] URL. Consistent with DEC-20260904-B's mechanism.

## Ten code-claim spot checks

1. `DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:39-40` — "migration 0050 flips `processes_personal_data` to `NOT NULL DEFAULT false` (commit `cf33028`)": `git show cf33028` confirms commit `cf33028a2bad340a8c379ab26a1bc26cc5de9468`, "feat: flip processes_personal_data to NOT NULL (migration 0050)". Verified.
2. Same file, line 40 — "deletes the `detectPersonalData` heuristic from `audit-helpers.ts` and all three call sites in `do.ts` (commit `6dfb47f`)": `git show 6dfb47f` confirms commit `6dfb47f1aa137bb3878925ae6f3bad80a5a94edd`, "feat: delete detectPersonalData heuristic fallback (SA.2b.d...)", touching `apps/api/src/lib/audit-helpers.ts` and `apps/api/src/routes/do.ts`. Verified.
3. Same file's underlying claim that the heuristic is gone today: `grep -rn "detectPersonalData" apps/api/src/` finds only a comment noting its removal, no live implementation. Verified.
4. `DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:88-90` — `apps/api/src/lib/capability-persistence.ts` "confirms the hook fires outside the transaction today (\"OUTSIDE the transaction. Design doc §4.3\")": `grep -n "OUTSIDE the.*transaction"` finds it verbatim at line 303. Verified.
5. `DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md:47-49` — `apps/api/src/jobs/test-scheduler.ts` "gates on `c.cost_class IN ('free_quota', 'paid_with_free_tier')`... and separately on `c.cost_class = 'free_unlimited' OR c.cost_class IS NULL`": both clauses found verbatim at lines 392/495 and 422. Verified.
6. Same file, line 50 — `apps/api/src/lib/startup-migrations.ts` "carries a comment \"Block 0069: reconcile scheduled_testing_eligible from cost_class\"": found at line 811 (as a section header comment) and referenced again at 623 and 1130. Verified.
7. Same file's claim of a per-cost-class scheduler gate still in force: confirmed by the same grep above; no contradicting removal found.
8. `DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md` — "Per the v1 Identity coverage audit completed 2026-05-13 (PR #116 merged 21:04 UTC, commit 4553b75)" and "`apps/api/docs/v1-identity-coverage-matrix-2026-05-13.md`... still exists in this repository at that exact path": `git show 4553b75` confirms commit `4553b7535bcb46c1af757728d6ca6f3575a0507f`, dated 2026-05-13 23:04:04 +0200 (21:04 UTC); the named file exists at that exact path. Verified.
9. `DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md` — manifest `data_source` claims for all five named countries: `manifests/italian-company-data.yaml`, `dutch-company-data.yaml`, `portuguese-company-data.yaml` each declare an Openapi.com Tier-3 source; `spanish-company-data.yaml` declares "OpenMercantil.es — BORME-derived register..., Tier-2 vendor aggregation"; `austrian-company-data.yaml` declares "Firmenbuch (Republik Österreich, BMJ) via JustizOnline IWG/HVD API". All five `grep`-confirmed verbatim. Verified.
10. `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md:43` — "`config/env-manifest.yaml` carries eight `HMRC_*` rows", enumerating seven names: `grep -c "name: HMRC_" config/env-manifest.yaml` returns 7, matching the seven names listed, not eight. This is a genuine miscount in the original record, but it is already withdrawn by `DEC-20260905-N` item 2 (which independently confirms the same count of 7 via `git grep -c`), so per this round's rule (a) it is a correction, not a finding against `DEC-20260505-E`. I additionally verified `DEC-20260905-N`'s companion item 3 (withdrawing the reading of `DEC-20260505-D`'s `decided_at` frontmatter field as the row's own `Date` property, since the row's `Date` is 2026-05-04 but `decided_at` reads 2026-05-05) against `dump_rows.py PAGE:35767c87082c81d3897fe47a2ec7a4c1`, confirming `Date` there is not equal to `decided_at`; both corrections are accurate.

Also verified via `dump_rows.py` that `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md`'s claim of a null `Outcome` field, and `DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md`'s claim of a populated `Outcome` field, both match the parsed rows (no null-field-quoted or populated-field-called-null defects in either).

## Unverifiable

Nothing in this partition was left unverifiable. Every quotation, evidence path, relation, registry binding, and sampled code claim was checked against a live source at this commit or a `dump_rows.py`-parsed Notion row.

PARTITION VERDICT: PASS

## Gate run

```
M2 closing review round 16 gate run at b014c41767d46d73be743a1cc121045194f58714, 2026-09-06T20:11:17Z
HEAD=b014c41767d46d73be743a1cc121045194f58714
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (443.3492ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (115.5051ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (11.5037ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (151.0016ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 217049.8995
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (1112.7538ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (700.3116ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (477.4315ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (1470.3309ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 218090.4006
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
check-no-committed-secrets: clean (3223 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still b014c41767d46d73be743a1cc121045194f58714
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Consolidator re-verification

### Step 2: sampled re-verification of five findings-free records

Seed stated: `random.seed(20260916)` applied to
`random.sample(sorted(os.listdir("docs/decisions/records")), 5)` over the
247-file corpus. The five records drawn: `DEC-20260505-H.md` (partition
P3), `DEC-20260225-P-k3l4.md` (partition P1),
`DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md` (partition
P5), `DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md`
(partition P5), `DEC-20260905-L.md` (partition P6).

For each: frontmatter `record_key`/`id`/filename agreement, all five
protected sections in order, the CAUTION banner, every evidence path, and
every relation target were checked directly against the files at this
commit; at least one quotation per record was checked against its
declared Notion row via `dump_rows.py`.

- `DEC-20260505-H.md`: frontmatter and sections correct; all four evidence
  paths exist (`manifests/german-company-data.yaml`,
  `apps/api/src/capabilities/german-company-data.ts`,
  `config/env-manifest.yaml`); no relations declared. The quotation "Yes,
  you can store all of that for auditability as long as you have an
  active subscription." is verbatim in the row's Rationale field (Notion
  page `35767c87082c8135a0ace75e6c33a3dd`, confirmed via `dump_rows.py`).
  No defect.
- `DEC-20260225-P-k3l4.md`: frontmatter and sections correct; all four
  evidence paths exist (`docs/company/VOICE.md`,
  `docs/company/claims.yaml`, `CLAUDE.md`); no relations declared. Four
  quotations ("honest about coverage, ambitious about trajectory.",
  "brand, API, SDK, docs are global from day one", "eventually through
  external providers from other regions", "global platform") all
  confirmed verbatim in the row's Rationale/Decision fields (Notion page
  `31267c87082c81b5b0d6cb9764dd5228`). No defect.
- `DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md`:
  frontmatter and sections correct; all seven evidence paths exist; no
  relations declared. The Context-section quotation (the full "Mid-rebuild
  verification spike" Rationale paragraph, including "Supersedes
  IT/ES/PT/AT rows in DEC-20260427-I.") is verbatim in the row's own
  Rationale field (Notion page `35967c87082c817cad56ec58c707d895`,
  confirmed via `dump_rows.py`). The record's own Rationale narrates a
  supersession of rows in `DEC-20260427-I` while its `relations:`
  frontmatter is empty; this omission is already named and explicitly not
  adopted as a finding by `DEC-20260905-F`'s "Not adopted" section
  (reasoning: incomplete is not false, fabricated, misattributed or
  unverifiable, and editing the frontmatter would violate the
  active-record immutability rule). No new defect.
- `DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md`: frontmatter
  and sections correct; its one evidence path (the Notion URL) resolves;
  its one relation (`related_to` -> `DEC-20260406-B--notion-...`) resolves
  to an existing file and is substantiated in body prose ("Operating
  Manual (DEC-20260406-B) established the governance layer."). Three
  quotations checked: the Rationale paragraph verbatim in the row's own
  Rationale field; "Candidate project documents remain inactive and
  Notion-backed workflows remain authoritative until the explicit atomic
  cutover" verbatim at `CLAUDE.md:72-73`; "Check before creating," "ONE
  page per topic," and "Superseded pages archived same session (prefix +
  move to archive)" verbatim at `CLAUDE.md:208,209,212`. No defect.
- `DEC-20260905-L.md`: frontmatter and sections correct; all seven
  evidence paths exist; all three `amends` relation targets
  (`DEC-20260905-C`, `DEC-20260320-A`, `DEC-20260905-J`) exist as files at
  this commit. No defect.

No finding in the sample of five.

### Step 3: re-verification of every finding a partition reported

Only P1 named candidate findings (two items); the other five partitions
reported none. Both of P1's items were independently re-verified:

1. `docs/decisions/records/DEC-20260225-P-m1n2.md:109` (`Both the "not CI
   reports" clause and the "MCP server + SDK" clause are reflected in
   what exists today`): confirmed the line reads exactly this text;
   confirmed via `dump_rows.py PAGE:31267c87082c811f932fe2a2220dd9af` that
   the row's Rationale field contains "MCP server + SDK" verbatim
   ("Product is MCP server + SDK enabling agent-to-agent transactions.")
   but its actual do-not-build clause reads "Don't build: CI reports, PDF
   engines, domain-specific pipelines, enterprise sales." (never "not CI
   reports" as a standalone clause). This is already withdrawn by
   `DEC-20260905-Q` item 1, whose own text states the identical fact.
   Correction confirmed right; not a confirmed finding against the
   original record.
2. `docs/decisions/records/DEC-20260225-P-m1n2.md:46` (`The row's own
   Source field is null, unlike most rows in this batch, which cite the
   shared strategy page.`): confirmed the line reads exactly this text;
   confirmed via `dump_rows.py` that the row's `Source` field is null.
   Already withdrawn by `DEC-20260905-D` item 2, which states all 13
   `DEC-20260225-P-*` rows in this batch, including `m1n2` itself, have a
   null `Source` field, so there is no populated-Source majority for
   `m1n2` to be an exception to. Independently re-confirmed against the
   parsed export. Correction confirmed right; not a confirmed finding
   against the original record.

No confirmed finding remains from either item.

### Checker run

The operator checker was run over the whole corpus at this commit:
`node scripts/m2-quote-fidelity.mjs --export decisions-export-raw.txt
--frontend strale-frontend --min-chars 12 --json <scratch file>`.

Summary line reproduced: `Totals: 247 records, 1809 spans, 1706 faithful,
103 residual.`

Every one of the 103 full-corpus residuals was reconciled: all 103 fall in
thirteen files (`DEC-20260227-P-s9t0.md`: 1, `DEC-20260314-F.md`: 2,
`DEC-20260317-F.md`: 1, `DEC-20260321-A.md`: 1, `DEC-20260518-A.md`: 1,
`DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md`: 1,
`DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md`: 1,
`DEC-20260820-E-WEBSITE-SEARCH-WEB.md`: 2, `DEC-20260904-A.md`: 1,
`DEC-20260905-C.md`: 83, `DEC-20260905-D.md`: 2, `DEC-20260905-F.md`: 6,
`DEC-20260905-G.md`: 1), and every one of these thirteen files' residuals
is already classified by the owning partition report (P1, P2, P4 or P6
above) as either own wording (not a quotation, per `DEC-20260905-M`'s
clause) or a checker miss faithful to a named source, with the single
exception of `DEC-20260905-F.md`'s own six residuals, which this
consolidator independently read: they are the record's own prose
describing the checker's parsing-artifact and own-wording classes (the
same subject its Consequences section names), not quotations attributed
to any source, and so fall under the same own-wording class the owning
partition (P6) already applies to the sibling amending records. No
residual anywhere in the full-corpus run is a confirmed finding.

## Unverifiable items

Two items, both from partition P3, both stated limitations rather than
claims this review can resolve, and both judged not to prevent a PASS:

1. `DEC-20260429-A`'s Consequences state a later Journal correction made
   that Decision authoritative over `DEC-20260430-A`'s contradictory
   post-launch self-host statement. The specific Journal entry is a
   Notion Journal-DB artifact outside the candidate set and cannot be
   confirmed or denied from repository evidence. Consistent with the
   convention every prior round of this review has applied to
   Notion-Journal, database and production state claims (left as stated,
   not treated as a repo-verifiable claim this review can fail on): does
   not prevent PASS.
2. `DEC-20260505-A`'s and related records' claims about historical
   chat-memory/project-knowledge sync state (for example, not syncing to
   memory or project knowledge for 2-3 days) are, by the records' own
   framing, events outside this repository's version control, explicitly
   presented as unverifiable-from-repo rather than as a repo fact: does
   not prevent PASS.

VERDICT: PASS
