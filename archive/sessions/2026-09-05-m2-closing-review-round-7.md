---
doc_type: m2-closing-review-round
round: 7
commit: f15bbdd9e7cb88401771cedb62c5907636bf7477
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-06'
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

Round 7 (final round) of the M2 closing independent review, run after
`DEC-20260905-G` withdrew round 6's confirmed statements and the
corpus-wide sibling-state sweep finding that round raised, at commit
`f15bbdd9e7cb88401771cedb62c5907636bf7477`. Six fresh, read-only reviewers,
none the author of any reviewed content, applied the quotation convention
`DEC-20260905-D`/`-E`/`-F`/`-G` state unchanged (normalize quotation and
source before comparing: transliterate symbols, lowercase, strip
non-alphanumerics; an ellipsis splits a quotation into ordered segments; a
relation substantiated by an amending record, or narrated in the target
record's own body rather than the source record's, is substantiated, not a
defect) and ran the operator checker, `scripts/m2-quote-fidelity.mjs`,
against the parsed Notion export and the sibling `strale-frontend`
checkout, in addition to the prior rounds' own method: each partition set
up a detached, read-only worktree at commit
`f15bbdd9e7cb88401771cedb62c5907636bf7477`, checked frontmatter validity,
the CAUTION banner, the five protected sections, every quotation, every
evidence path, every relation target, at least ten code claims, and, for
`--notion-` and `--git-` qualified records, the collision-registry and
M2-closure-register bindings. P1 through P4 each took a contiguous slice
of bare-keyed records; P5 took the `--notion-` qualified records belonging
to this batch's id-collisions; P6 took the remaining qualified records for
this batch plus the six prior withdrawal records `DEC-20260905-B` through
`DEC-20260905-G` themselves, checked like any other candidate record.
Reviewers could additionally verify Notion page bodies read-only, beyond
the parsed row-property export, where a partition needed to. There is no
sweep section in this archive: each partition covered its own slice in
full rather than by sample, per the method above (the corpus-wide
residual reconciliation, the broader sibling-state re-sweep, and the
short-quotation reconciliation this round's findings prompted live in
`DEC-20260905-H`, not here). Below, every heading in each reproduced
partition report is demoted by exactly one level (`##` to `###`, `###` to
`####`; a report's own top-level `#` title is left as-is under a `### P<n>`
wrapper) so this file keeps one heading hierarchy throughout; nothing else
in any report is edited.

## Partition reports

### P1

# Closing review, round 7 (final), partition P1

Commit reviewed: f15bbdd9e7cb88401771cedb62c5907636bf7477
Record count: 41 files (docs/decisions/records/, per closing7-P1.txt)

### Method

Worktree: detached checkout at the pinned commit, `npm ci` run there, read-only,
removed at the end via `git worktree remove` (a handful of node_modules junctions
inside the worktree's own directory were cleared first; none pointed outside it).

Checks performed:
1. Structural: a Python script parsed frontmatter for all 41 files and verified
   `record_key`/`id`/filename agreement, the CAUTION banner, and the five
   protected sections (Decision, Context, Rationale, Consequences, Reversal
   conditions). Zero problems.
2. Evidence paths: every non-URL, non-cross-repo evidence entry checked with
   `os.path.exists` at the pinned commit; all resolved. Every
   `strale-io/strale-frontend@...` entry resolved with `git show <sha>:<path>`
   against a freshly fetched `strale-frontend` checkout (sha `04c9fca9`
   resolves for every path cited).
3. Quote fidelity: ran `node scripts/m2-quote-fidelity.mjs --export
   <scratchpad>/decisions-export-raw.txt --frontend
   C:/Users/pette/Projects/strale-frontend` with one `--only` per file in
   the partition. The script extracts every double-quoted span of 25+
   characters, applies the stated normalization (transliterate EUR/x/>=/<=/->/...,
   lowercase, strip non-alphanumerics), splits on ellipsis into ordered
   segments, and checks each segment is a substring of the attributed
   source (a parsed Notion row field, a repository file, or another record).
   Result: 41 records, 141 quoted spans, 141 faithful, 0 residual.
4. All 41 Notion rows (evidence[0] page ids) dumped via `dump_rows.py` and
   spot-checked against the record's own quotations, paraphrases, and
   null-field claims.
5. Relations: every target's file existence checked at the pinned commit;
   none of the 9 distinct targets is a bare collided id per
   `docs/decisions/id-collisions.yaml`; every relation's substantiating
   prose ("Relation to X" paragraph or equivalent) read and confirmed to
   name the target and state the basis, matching DEC-20260905-D/E/F where
   those records established a relation's basis.
6. Cross-checked all six withdrawal records (DEC-20260905-B through -G)
   for any statement targeting a P1 record; every one found was verified
   against its cited source and confirmed accurate (see Findings section).
7. No `--notion-` or `--git-` qualified record exists in this partition, so
   check (8) (collision registry / register-row cross-check) does not apply
   to any P1 file.

### Findings

None. No false, fabricated, misattributed, or unverifiable statement was
found in any of the 41 records that is not already withdrawn by name in
DEC-20260905-B through -G, with the withdrawing correction itself verified
true against the cited source.

Eleven statements across nine P1 records remain in the original record text
exactly as the withdrawal records describe (this is expected: original
records are protected and are never edited in place; the withdrawal is a
separate record). Each was re-verified here, independent of the withdrawal
record's own claim, against the primary source:

- `DEC-20260224-P-g7h8` (line ~375): "Long-term ambition is tens/hundreds
  of thousands of data sources" attributed via "per project memory," not
  claimed as CLAUDE.md's own text — confirmed CLAUDE.md contains no such
  string; withdrawn correctly by DEC-20260905-C item 1.
- `DEC-20260225-P-y1z2` (line ~90): quotes "DEC-19: ... (unanimous)." —
  confirmed CLAUDE.md:265 has no "(unanimous)" on the DEC-19 bullet;
  withdrawn correctly by DEC-20260905-C item 2.
- `DEC-20260225-P-y1z2` (line ~68): composite quote of `DEC-20260225-P-a3b4`'s
  Decision field, joining two sentences and dropping price parentheticals —
  confirmed against the row's Decision field; withdrawn correctly by
  DEC-20260905-C item 3.
- `DEC-20260226-P-q1r2` (line ~67): quotes a "Production: ..." line as
  CLAUDE.md's Tech Stack text — confirmed zero matches for that string in
  CLAUDE.md; withdrawn correctly by DEC-20260905-C item 4.
- `DEC-20260227-P-a1b2` (line ~48): quotes "the original Provider Growth
  doc," with an inserted "the" and comma — confirmed against the row's
  Rationale field ("Original Provider Growth doc..."); withdrawn correctly
  by DEC-20260905-C item 5.
- `DEC-20260227-P-u1v2` (line ~80): attributes a "Distribution packages &
  protocol endpoints" heading to CLAUDE.md — confirmed no such heading
  exists in CLAUDE.md; withdrawn correctly by DEC-20260905-C item 6.
- `DEC-20260225-P-m1n2` (line ~49): misquotes `DEC-20260224-P-c3d4`'s title/
  body with reordered clauses — confirmed against DEC-20260224-P-c3d4.md's
  actual title and body sentence; withdrawn correctly by DEC-20260905-D
  item 1.
- `DEC-20260225-P-m1n2` (line ~46): claims its own Source field is an
  exception among the batch — confirmed all 13 `DEC-20260225-P-*` rows have
  a null Source field; withdrawn correctly by DEC-20260905-D item 2.
- `DEC-20260226-P-s3t4` (line ~78): attributes "Date-based API versioning
  via `Strale-Version` header" to CLAUDE.md — confirmed no such line exists
  in CLAUDE.md; withdrawn correctly by DEC-20260905-D item 3.
- `DEC-20260227-P-i9j0` (line ~68): fabricated quotation "the capability's
  own provider runs the code." — confirmed neither the row's Decision nor
  Rationale field contains this sentence; withdrawn correctly by
  DEC-20260905-D item 4.
- `DEC-20260227-P-s9t0` (lines ~98-99): two fabricated quotations about
  Unit 3 — confirmed neither appears in the row's Decision or Rationale
  fields; withdrawn correctly by DEC-20260905-D items 5-6.
- `DEC-20260305-E` (lines ~93-96): misattributes the Browserless v1/v2
  comment to `browserless-extract.ts` — confirmed the comment is in
  `web-provider.ts` (line 613), not `browserless-extract.ts`; withdrawn
  correctly by DEC-20260905-C item 14.
- `DEC-20260305-E` (Reversal conditions, "47-to-36 gap"): confirmed the
  record's own Consequences section correctly derives 35 (not 36); grep
  confirms 35 non-test importers; withdrawn correctly by DEC-20260905-C
  item 15.
- `DEC-20260306-D` (line ~78): misquotes the Rationale's "(3)" item with
  inserted word "naming" and changed tense/punctuation — confirmed against
  the row's actual Rationale field; withdrawn correctly by DEC-20260905-C
  item 16.
- `DEC-20260309-G` (lines ~66-68): overclaims "no matches outside this
  record" for a repo-wide search — confirmed `docs/programs/codex-review-backlog.yaml`
  contains a meta-reference to "12-category risk framework"; withdrawn
  correctly by DEC-20260905-C item 17.
- `DEC-20260302-A-0001` (Context): quotes CHARTER.md with "to" joining the
  two price amounts — confirmed CHARTER.md uses an en dash
  ("EUR0.02–EUR1.00"), not the word "to"; withdrawn correctly by
  DEC-20260905-C item 7.
- `DEC-20260302-C` (Context): quotes a stale CLAUDE.md bullet form —
  confirmed CLAUDE.md's current DEC-20260302-C bullet reads "Historical
  homepage prescription; superseded for the apps/web redesign by
  DEC-20260905-A..."; withdrawn correctly by DEC-20260905-C item 8.

All sixteen corrections above were independently re-derived from the
primary source in this session, not merely accepted on the withdrawal
record's word, and all were found accurate. None is counted as a finding
against the original P1 record per this round's rule (a).

### Operator checker residuals

Zero residuals reported for this partition (141/141 faithful). No
classification judgement was required.

### Ten code-claim spot checks (of many performed)

1. `DEC-20260224-P-g7h8` — `docs/company/coinbase-bazaar-email.md:83`:
   "We run Strale (api.strale.io)" — confirmed present.
2. `DEC-20260224-P-e5f6` — `docs/company/GOALS.md:7`: "The data layer for AI
   agents: independently tested, audit-logged data sources..." — confirmed.
3. `DEC-20260225-P-a3b4` — `manifests/invoice-extract.yaml:12`:
   `price_cents: 50` — confirmed matches CLAUDE.md's DEC-13 (€0.50).
4. `DEC-20260225-P-q3r4` — `apps/api/src/lib/auth.ts:3-20`: `sk_live_` +
   32 hex char key format, 16-char prefix — confirmed, no keypair identity.
5. `DEC-20260225-P-s5t6` — `apps/api/src/lib/x402-gateway.ts:63-64`:
   `USDC_CONTRACTS` with a Base mainnet address — confirmed.
6. `DEC-20260226-P-s3t4` — `apps/api/src/db/schema.ts:355-359`:
   `auditTrail`/`transparencyMarker`/`dataJurisdiction` jsonb/varchar
   columns — confirmed.
7. `DEC-20260227-P-i9j0` — `apps/api/src/capabilities/auto-register.ts`:
   dynamic-import registration mechanism, every one of 350 manifests at
   this commit resolves to a first-party executor — confirmed (record's
   dated count of 342 is a 2026-09-05 session snapshot; ordinary catalog
   growth to 350 by this later commit is not a fidelity defect).
8. `DEC-20260302-D` — `apps/api/src/lib/dependency-manifest.ts` and
   `apps/api/src/jobs/daily-digest.ts` both exist; CLAUDE.md:459 reads
   "Probes run ~4x/day per provider" — confirmed.
9. `DEC-20260305-G` — `apps/api/src/routes/public-trust.ts`:
   `PUBLIC_TRUST_FIELDS` array includes `badge_label` — confirmed.
10. `DEC-20260309-H` — grep of `manifests/*.yaml` for a `disclaimer` field:
    exactly `competitor-compare.yaml`, `contract-extract.yaml`,
    `email-finder.yaml`, `landing-page-roast.yaml` — confirmed, none of the
    eight named finance capabilities exists as a manifest slug.
11. (extra) `DEC-20260225-P-o7p8` — `git log --follow --diff-filter=A` on
    `apps/api/src/capabilities/ted-procurement.ts` shows introduction
    2026-02-26 — confirmed one day after the row's decision date.
12. (extra) `DEC-20260306-G` — grep of `apps/api/src/routes` for
    `quality/:slug` returns nothing — confirmed the endpoint is gone in
    code, not only in CLAUDE.md prose.

### Unverifiable

Nothing in this partition was left unverifiable. Every quotation, evidence
path, relation target, and sampled code claim resolved to a definite true
or false answer against the pinned commit, the Notion export, or the
sibling frontend checkout.

### Notes

- `DEC-20260302-A-0001` has `relations: []`; no relation checks apply.
- No P1 record's bare `record_key` appears in `docs/decisions/id-collisions.yaml`.
- No P1 record is `--notion-`/`--git-` qualified, so the collision-registry
  cross-check (item 8 of the brief) does not apply to this partition.

PARTITION VERDICT: PASS

### P2

# Closing review, round 7 (final), partition P2

Commit: f15bbdd9e7cb88401771cedb62c5907636bf7477
Record count: 40 files, as listed in `closing7-P2.txt`.

### Script used

`node scripts/m2-quote-fidelity.mjs --export <decisions-export-pretty.json> --frontend <strale-frontend checkout> --only <each of the 40 files>`. Logic in one sentence: for every double-quoted span of 25+ characters in a record's body, normalize both the span and every candidate source (transliterate special characters, lowercase, strip non-alphanumerics) and report a residual whenever the span is not found as a substring of the source it names, together with the checker's own best-guess alternate source. I then read each residual's cited source directly (the parsed Notion row via the shared export, the named repository file, or the sibling frontend checkout) to judge whether it is a real defect or a checker miss.

Structural checks (frontmatter parse, `record_key`/`id`/filename agreement, CAUTION banner, five protected sections) were run with a small Python script over all 40 files. Evidence-path existence and relation-target existence were checked with a second script against the working tree at the pinned commit. `node --test scripts/decision-records.test.mjs` was run in the worktree and passed (32/32), confirming the corpus-wide invariants (no cycles, superseded records have a formal incoming supersession, active bodies immutable, etc.) hold with this partition included.

### Checker residuals for P2 (51 residuals across 21 files) with classification

Every residual below is a **checker miss**: in each case I read the cited Notion row (via the shared export `decisions-export-pretty.json`, which is the same data `dump_rows.py` would return) or the named repository/frontend file directly, and the quoted span is verbatim (under the stated normalization) in the source the record actually names. The checker's "best match" column pointed at an unrelated file or record purely because the quoted span is short, generic, or appears as a near-duplicate phrase elsewhere in the corpus; none of the 51 is a new defect, and none was already withdrawn by DEC-20260905-B through -G (they are a different class: short/common phrases the checker's fuzzy matcher mis-ranked, not the false/misattributed statements those records name).

- DEC-20260310-E line 84 ("Prerequisite: test suite audit") — verbatim in the row's own Rationale field.
- DEC-20260310-F lines 67, 69 ("fields must exist in all output paths"; "structurally valid validation rules.") — both verbatim in the row's own Rationale field; the record attributes them to "this row['s requirement/that the row calls]", not to CLAUDE.md.
- DEC-20260314-B lines 37, 81 — "a Lovable session that produces zero readers." verbatim in this row's own Rationale; "Blog Post #1 must be ready so launch day isn't just tweets into the void," verbatim in `DEC-20260314-A`'s row Rationale, which is exactly what the record attributes it to.
- DEC-20260314-F lines 33, 84 — the long "2027.dev Agent Arena research..." passage is verbatim in this row's own Rationale field; the `grep` pattern string is the record's own quoted search pattern, not a sourced quotation (convention-covered, not a defect).
- DEC-20260314-G lines 26, 38 — the headline text is a verbatim character-for-character quote of `strale-frontend@04c9fca9:src/pages/Index.tsx` lines 146-147 (independently re-verified against the sibling checkout); "tested best for clarity + differentiation balance." is verbatim in the row's own Rationale.
- DEC-20260315-B line 33 — the DEC-20260311-A/GitHub-gists passage is verbatim in this row's own Rationale field.
- DEC-20260315-H line 33 — verbatim in this row's own Rationale field.
- DEC-20260315-I line 33 — verbatim in this row's own Rationale field (the euro sign renders as a mojibake byte in the terminal dump but is the same character in both source and record).
- DEC-20260316-A line 87 ("worst of SQS, freshness, latency") — the row's Rationale reads "worst-of SQS + freshness + latency"; under the stated normalization (strip all non-alphanumerics) both reduce to the same string, so this is faithful, not a defect.
- DEC-20260317-A line 37 — verbatim in the row's own Rationale field.
- DEC-20260317-F lines 34, 43 — the SQS-50/60 passage is verbatim in the row's own Rationale; "automated >= 50 qualification gate" is the record's own descriptive phrase in its Context section, not attributed to any specific source.
- DEC-20260317-G line 33 — verbatim in the row's own Rationale field.
- DEC-20260317-H line 33 — verbatim in the row's own Rationale field.
- DEC-20260318-A line 81 — verbatim in the row's own Rationale field ("phone-type-detect shipped with SQS 39.3 because known_answer tests were never generated").
- DEC-20260318-B line 58 — verbatim in the row's own Rationale field.
- DEC-20260320-A lines 96, 113 — the `capability-readiness.ts` comment (confirmed by direct grep: "The last two dimensions were added per DEC-20260423-B (Stage A, warning..." / "...34 caps shipped to prod with NULL reliability", with the record's bracketed `[reliability and limitations]` correctly marking the elided subject); the 4-tier ordering phrase is verbatim in the row's own Rationale.
- DEC-20260320-E line 95 — verbatim in the row's own Outcome field.
- DEC-20260320-F line 49 — verbatim in the row's own Outcome field.
- DEC-20260321-A lines 35, 42, 67, 97 — the long Rationale passage and both Outcome-field quotes are verbatim in the row; the `grep` pattern string is the record's own quoted search pattern, not a sourced quotation (convention-covered).
- DEC-20260324-C line 70 — verbatim in the row's own Rationale field.
- DEC-20260329-A line 34 — verbatim in the row's own Rationale field (confirmed against the full untruncated field).
- DEC-20260330-B line 61 — verbatim in the row's own Rationale field.
- DEC-20260405-A lines 37, 73 — both verbatim in the row's own Rationale field (confirmed against the full untruncated field, including the "STRUCTURAL GATE" paragraph).
- DEC-20260406-E lines 33, 72, 75 — all three verbatim in the row's own Rationale field.
- DEC-20260409-A lines 41, 47, 58 — all three verbatim in the row's own Rationale field (confirmed against the full untruncated field).
- DEC-20260409-B lines 47, 52, 55, 61 — all four verbatim in the row's own Rationale field (confirmed against the full untruncated field, including the "RELATED: DEC-20260409-A..." sentence).
- DEC-20260409-D lines 55, 62, 63, 73, 126 — all five verbatim in the row's own Rationale field (confirmed against the full untruncated field).
- DEC-20260410-A lines 37, 62 — the long passage is verbatim in the row's own Rationale field; "3 related capabilities per use" is verbatim in the row's own Decision field.
- DEC-20260411-B line 81 — verbatim in the row's own Rationale field.

### Numbered findings

No findings. Every statement checked — quotations, evidence paths, relation targets, null-field claims, and the ten sampled code claims — was faithful to its named source, already-corrected by DEC-20260905-B through -G, or explicitly judged non-disqualifying by DEC-20260905-G's own "Not adopted" list (which this round's rule (a) binds me to).

Two items worth recording as observations, not findings, because the round-7 rules explicitly resolve them:

1. `DEC-20260313-C` (line 270-271, "the same 'still listed, signal absent rather than faked' principle this row states"), `DEC-20260314-F` (Context, "AX is not a nice-to-have" comma), `DEC-20260314-A` (Consequences, the Dev.to tweets-v2 quote), `DEC-20260321-A` (Context, "4x overdue"), `DEC-20260315-H`/`DEC-20260317-F` ("armed in prod" attributed to CLAUDE.md), `DEC-20260317-A` (digest-sender.ts header-comment attribution, and the DEC-20260511-F "prose only" claim), `DEC-20260318-A` ("the workflow that scales" attribution), `DEC-20260320-A` (the "manual, 312-line app.ts import list" composite, and the "one... no other" insert-capabilities framing), `DEC-20260320-F`/`DEC-20260405-A` (the "no formal record exists"/"mentioned in prose only" claims about `DEC-20260320-E` and `DEC-20260405-B`/`DEC-20260225-P-m5n6`), `DEC-20260404-A` ("finds only" TDQS search claim), `DEC-20260314-C` ("found no match" multi-LLM search claim), `DEC-20260315-A` (misattributed "free capabilities via MCP without auth" quote), `DEC-20260315-B` (the false 16-day interval) all carry statements that `DEC-20260905-B`, `-C`, `-E` or `-G` name as withdrawn. I verified each amending record's own correction against the same sources (Notion rows via the export, `apps/api/src/routes/do.ts`, `context/*.json`, `id-collisions.yaml`, frontend checkout) and found every correction itself accurate — none of the six withdrawal records misstates the fact it corrects.
2. `DEC-20260321-A`'s repo-wide `schedule_tier`/`scheduleTier` grep and `DEC-20260406-E`'s "Market Context"/"Competitive Landscape" search claim are both named in `DEC-20260905-G`'s "Not adopted" list as non-disqualifying (a defensible scope reading in the first case, one incidental unrelated hit in the second); consistent with that disposition, I do not re-raise them.

### Ten status-on code claims verified (file + line)

1. `DEC-20260315-H` — `apps/api/src/lib/quality-floor.ts:9-11,75-77,86` — quarantine <70%, deactivate <30% (never automatic), minCalls 10/30d. Confirmed.
2. `DEC-20260316-A`/`DEC-20260317-F` — `apps/api/src/lib/trust-grade.ts:214` — `computeTrustGrade` exists with zero callers outside its own file (`grep -rn` across `apps/api/src` returns only its own definition). Confirmed.
3. `DEC-20260317-A` — `apps/api/src/lib/interrupt-sender.ts:172` — `sendInterruptEmail` has zero callers anywhere in `apps/api/src`. Confirmed.
4. `DEC-20260318-A` — no `seed.ts` file exists anywhere under `apps/api` (`find` returns nothing). Confirmed.
5. `DEC-20260320-A` — `apps/api/src/lib/capability-readiness.ts:53-69,229-242` — the readiness object carries exactly the 8 named dimensions (`has_executor`, `has_db_row`, `has_test_suites`, `has_latency_estimate`, `has_transparency_tag`, `has_input_schema`, `has_output_schema`, `has_reliability`, `has_limitations`). Confirmed.
6. `DEC-20260324-A` — `apps/api/src/lib/x402-gateway.ts:21,222,224` — imports and calls `createFacilitatorConfig` from `@coinbase/x402`. Confirmed.
7. `DEC-20260405-A` — `apps/api/src/capabilities/swedish-company-data.ts:4-10` — fetches Bolagsverket's HVD API directly at `gw.api.bolagsverket.se`, header comment cites "DEC-20260405-A Phase 2". Confirmed.
8. `DEC-20260409-A` — `apps/api/src/lib/test-runner.ts:1603-1604` — `NULL_RATIO_RULE_ENABLED` feature flag, "defaults to disabled" comment, `process.env.NULL_RATIO_RULE_ENABLED === "true"`. (The record's evidence list includes `test-runner.ts` alongside `null-field-ratio.ts`; the flag itself lives in the former.) Confirmed.
9. `DEC-20260410-A` — `apps/api/src/lib/progressive-unlock.ts:11-16` — `UNLOCK_MAP` with exactly the five named trigger capabilities (`url-to-markdown`, `email-validate`, `dns-lookup`, `iban-validate`, `json-repair`), each mapping to 3 related capabilities. Confirmed.
10. `DEC-20260411-B` — `apps/api/src/lib/gate5-path-coverage.ts` exists; `apps/api/scripts/onboard.ts:550,728,1015,1190,1200` references "Gate 5" and "DEC-20260411-B" by name at multiple points. Confirmed.

Additional spot checks (not counted in the ten, done to verify frontend cross-repo evidence): `strale-io/strale-frontend@04c9fca9:src/components/Header.tsx:10` (Trust nav item), `:src/App.tsx:83-84` (`/trust`, `/trust/methodology` routes; no `/blog` route anywhere in the file), `:src/pages/Index.tsx:146-147` (hero headline verbatim), `:src/index.css:29-53` (the seven named CSS custom properties, all matching the record's stated HSL triples exactly). All confirmed.

### Structural and relational checks (all 40 records)

- Frontmatter parses and `record_key`/`id`/filename agree for all 40 (script-checked; all bare keys, `id` = `record_key` = filename stem).
- CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present in all 40 (script-checked).
- Every `evidence:` entry that is a repository-relative path exists at the pinned commit (script-checked against the working tree; Notion URLs and the one cross-repo frontend entry checked separately, see above).
- Every `relations:` target (`DEC-20260314-A`→`DEC-20260314-B`; `DEC-20260405-A`→`DEC-20260320-B`; `DEC-20260409-B`→`DEC-20260409-A`; `DEC-20260409-D`→`DEC-20260409-A`,`DEC-20260409-B`; `DEC-20260411-A`→`DEC-20260302-A-0001`) exists as a record key at the pinned commit and is none of them a bare collided id per `docs/decisions/id-collisions.yaml` (script-checked).
- All declared relations are substantiated: `DEC-20260314-A`↔`DEC-20260314-B` narrated in `DEC-20260314-B`'s own body; `DEC-20260405-A`→`DEC-20260320-B` narrated directly ("RELATED: ... DEC-20260320-B") in the row's own Rationale, itself quoted in the record's body; `DEC-20260409-B`→`DEC-20260409-A` narrated verbatim in the record's own Context section ("RELATED: DEC-20260409-A..."); `DEC-20260411-A`→`DEC-20260302-A-0001` narrated by name in Consequences. `DEC-20260409-D`'s two `related_to` edges (to `DEC-20260409-A` and `DEC-20260409-B`) are not narrated by ID in its own body — this is exactly the gap `DEC-20260905-D` item 7 and `DEC-20260905-E` item 6 substantiate from the underlying Notion rows and from `DEC-20260409-A.md`'s own already-merged prose; per this round's rule (a) that basis makes the relation substantiated, not a finding.
- No null field is quoted and no populated field is called null anywhere in the partition (spot-checked nine records' `Superseded By`/`Outcome` claims directly against the export; `DEC-20260321-A` is the one record in the sample with a populated `Outcome`, and the record correctly quotes it rather than calling it null).
- `node --test scripts/decision-records.test.mjs` passes 32/32 in the pinned-commit worktree, confirming corpus-wide invariants (no relation cycles, active bodies immutable, superseded records have a formal incoming supersession, etc.) hold with this partition present. `DEC-20260320-B` (the one `status: superseded` record in P2) has a formal incoming supersession per this test and per its own Consequences text (`DEC-20260423-B` superseded it).

### Unverifiable

- `DEC-20260317-A`'s claim about whether `daily-digest.ts` has "no cron trigger or scheduled workflow… found in this repository" is a negative-search claim I did not independently re-run; it is stated as a repo-search result, not attributed to a specific quoted source, so it carries no fidelity risk, but I did not re-verify the search itself.
- `DEC-20260405-A`'s and `DEC-20260320-E`'s claims about live Railway environment variable values (`BOLAGSVERKET_CLIENT_ID`/`SECRET`, `OPENSANCTIONS_API_KEY` cost tier) are explicitly stated by the records themselves as not independently re-verified from inside the repository; consistent with that, I did not attempt to verify them either.
- Whether Glama's own TDQS re-scan (as opposed to the platform's self-scoring) ever confirmed 6/6 for `strale-mcp`'s tools (`DEC-20260404-A`) — the record itself states this is unrecorded in the repository, and I found no additional evidence either way.

PARTITION VERDICT: PASS

### P3

# M2 closing-review round 7, partition P3

Commit reviewed: f15bbdd9e7cb88401771cedb62c5907636bf7477
Partition: P3 (April 2026 records)
Record count: 40 files, listed in closing7-P3.txt (DEC-20260413-A through DEC-20260507-H)

### Method

Worktree `C:/tmp/strale-closing7-P3` created detached at the pinned commit, `npm ci` run there. Read every one of the 40 record files in full at that commit. Extracted every Notion page id referenced as evidence[0] (44 ids; 40 resolved as Decisions-DB rows via `dump_rows.py`, 4 were secondary citations outside the row export) and dumped them in one batch. Read DEC-20260905-B through -G in full to identify which false, misattributed, or unfaithful statements in my partition are already corrected by name (per round 7 rule (a)) rather than being fresh findings. Ran the operator script `node scripts/m2-quote-fidelity.mjs --export <export> --frontend C:/Users/pette/Projects/strale-frontend` with one `--only` per file in my partition. For every quoted claim not resolvable from the export, tried `notion-fetch` before calling it unverifiable. Spot-checked 12 "status on" code claims by reading the named files at the pinned commit (more than the required 10). Checked every `relations` target for existence as a record key and against `docs/decisions/id-collisions.yaml` for bare-collision status. Checked frontmatter/`record_key`/`id`/filename agreement, the CAUTION banner, and the five protected sections across all 40 files with a script (all OK).

### Operator script residuals (1 of 115 spans)

- `DEC-20260416-A.md` line 82: the quoted span `"the first-party MCP is the only surface that exposes Strale's differentiated metadata"` was reported against best-match `DEC-20260901-A.md` (prefix 12, i.e. essentially no match). **Checker miss, not a defect.** The quote is a faithful self-reference to this same record's own earlier Rationale-section paraphrase at lines 48-49 ("the first-party MCP is the only surface that exposes Strale's differentiated metadata (SQS, limitations, structured errors)"), which itself faithfully restates the row's Rationale field (page `34467c87082c81208727dab42331cae4`, verified via dump_rows.py: "...first-party MCP is the only surface that exposes Strale's differentiated metadata (SQS, limitations, structured errors)"). The checker's best-match search apparently did not consider the record's own prior prose as a match target. No finding.

All other 39 files in the partition returned 0 residuals (many returned 0 spans checked because they are written in indirect/reported style with no double-quoted spans at all: DEC-20260422-C, DEC-20260423-A, DEC-20260423-B, DEC-20260424-A, DEC-20260427-A, DEC-20260427-B, DEC-20260428-A, DEC-20260428-B, DEC-20260429-A, DEC-20260430-A, DEC-20260503-A, DEC-20260504-A, DEC-20260504-B, DEC-20260504-C — I manually spot-checked their factual claims against the parsed rows and repository files instead; see findings below and the code-claim table).

### Findings

1. **`DEC-20260506-G.md`, Context section (the paragraph naming DEC-20260422-H and DEC-20260506-F): false claim that no formal record exists for `DEC-20260422-H`.** The record states: "a pricing benchmark study (`DEC-20260422-H`, no formal record exists for that id on `main` and it is not in `docs/decisions/id-collisions.yaml`, mentioned in prose only)". Fact: `docs/decisions/records/DEC-20260422-H.md` exists in this repository at the pinned commit (it is itself one of this partition's 40 records, "Defer Payee Assurance v1 pricing commitment..."), confirmed by `ls`. The "not in `id-collisions.yaml`" half is true (confirmed, no match), but the "no formal record exists for that id" half is false — the same class of defect DEC-20260905-E withdrew twice for `DEC-20260405-A` (items 3-4, re: `DEC-20260405-B` and `DEC-20260225-P-m5n6`) and once for `DEC-20260409-D` (item 5, re: `DEC-20260409-C`), but this specific instance, on this specific record and target id, is not named by any of DEC-20260905-B through -G and is therefore a fresh, unwithdrawn finding. (The companion claim in the same sentence, that no formal record exists for `DEC-20260506-F` either, is true — no such file exists and it is not in the collision registry — so that half is not a finding.) Evidence: `docs/decisions/records/DEC-20260422-H.md` (exists); `docs/decisions/id-collisions.yaml` (no `DEC-20260422-H` or `DEC-20260506-F` entry).

2. **`DEC-20260429-A.md` line 69, Consequences: the "four review triggers" enumeration does not faithfully match either cited source.** The record states: "The source listed four review triggers: a monthly bill above EUR 1,500; customer or regulator demand for Strale-controlled dataset replay; an annual review in April 2027; or a Dilisense-initiated material terms change." I checked this against both of the record's Notion citations. The row itself (page `35167c87082c8172bff8f3485699c961`) contains no trigger list of any kind. The second Notion citation (`35367c87082c8147a642e5fe3ac006a0`) is not in the parsed export; per round-7 rule (c) I fetched it directly via `notion-fetch` (it is a Journal course-correction page) and it does state "Reseller SA + DPA triggered reactively when bill > EUR 1.5k/mo or customer requires it" — this substantiates the "EUR 1,500" figure and loosely the "customer... demand" clause, but nothing in it mentions "regulator demand," "dataset replay," "April 2027," or "material terms change." The record's third cited evidence file, `handoff/_general/from-code/2026-04-29-dilisense-reseller-correspondence.md`, instead lists **five** distinct triggers (bill > EUR 100 — not EUR 1,500; regulated customer asks for Strale's DPA; Mirko-initiated upgrade conversation; a quality/outage incident; and 12 months elapsed/April 2027), none of which uses the phrases "dataset replay" or "material terms change" verbatim. So of the four items claimed: the EUR-1,500 figure and the April-2027 date are each independently attested (in different sources, not stated together as "four triggers" anywhere), but "customer or regulator demand for Strale-controlled dataset replay" and "a Dilisense-initiated material terms change" do not match either source's actual language, and the record undercounts the handoff file's own trigger list (five, not four, once the EUR-100/EUR-1,500 discrepancy the record itself flags is set aside). This is a composite/synthesized claim, not a faithful representation of a named source. Finding, not fully unverifiable (I did try `notion-fetch` per rule (c) before concluding this).

### Checker-residual classification

Covered above (1 residual, classified as checker miss).

### Ten (here: twelve) code-claim spot checks

| # | Record | Claim | File(s) checked | Result |
|---|--------|-------|------------------|--------|
| 1 | DEC-20260422-D | `RichProvenance` carries `attribution?`, `license?`, `license_url?`, `source_note?` | `apps/api/src/lib/provenance-builder.ts:42-45` | Confirmed |
| 2 | DEC-20260419-A | Console allowlist now 24 files, `index.ts` reduced to 8 | `apps/api/scripts/console-allowlist.json` (24 keys; `"apps/api/src/index.ts": 8`) | Confirmed |
| 3 | DEC-20260420-A | `drizzle.config.ts` exists again, `drizzle-kit` a devDependency, CI runs `drizzle-kit push --force` | `apps/api/drizzle.config.ts`, `apps/api/package.json:61`, `.github/workflows/ci.yml:176` | Confirmed |
| 4 | DEC-20260421-J | `drop-sg-kyb.ts` exists under `archive/`; commit `be0c7888` resolves | `apps/api/scripts/archive/drop-sg-kyb.ts`; `git log -1 be0c7888` | Confirmed |
| 5 | DEC-20260421-L | Park scripts exist under `archive/`; commit `b86d431a` resolves | `apps/api/scripts/archive/park-company-intelligence-sdr.ts`, `.../phase-dec-b-park.ts`; `git log -1 b86d431a` | Confirmed |
| 6 | DEC-20260427-H | All 5 named slugs still in the `DEACTIVATED` map | `apps/api/src/capabilities/auto-register.ts` (patent-search, trustpilot-score, salary-benchmark, employer-review-summary, linkedin-url-validate all present) | Confirmed |
| 7 | DEC-20260427-I | `austrian-company-data.ts` uses the JustizOnline Firmenbuch endpoint | `apps/api/src/capabilities/austrian-company-data.ts:35` (`FBW_ENDPOINT = "https://justizonline.gv.at/..."`) | Confirmed |
| 8 | DEC-20260503-B | Residual SQS schema columns and `sqs_daily_snapshot` table still present (PR2 not shipped) | `apps/api/src/db/schema.ts:220-224,1003-1024` | Confirmed |
| 9 | DEC-20260505-B | `lifecycle.ts` header states automatic transitions removed per DEC-20260503-B | `apps/api/src/lib/lifecycle.ts:6` | Confirmed |
| 10 | DEC-20260505-C | `matching.ts` tiebreaker comment cites DEC-20260503-B, price-then-slug order | `apps/api/src/lib/matching.ts:177-179` | Confirmed |
| 11 | DEC-20260507-G / -H | BG/CY/LU/HU manifests use Openapi.com WW-Top, `OPENAPI_ENABLED` gated false | `manifests/bulgarian-company-data.yaml:54`, `.../cypriot-company-data.yaml:83`, `.../luxembourgish-company-data.yaml:54`, `.../hungarian-company-data.yaml:54`, `config/env-manifest.yaml:776-777` | Confirmed |
| 12 | DEC-20260507-F | Cobalt manifest/capability exist, separate from Kyckr | `manifests/us-company-data-cobalt.yaml`, `apps/api/src/capabilities/us-company-data-cobalt.ts` | Confirmed |

Additionally verified: `DEC-20260428-A`'s Consequences claim that `DEC-20260518-F` is "later affirmed by `DEC-20260813-A`" — `docs/decisions/records/DEC-20260813-A.md` frontmatter carries `target: DEC-20260518-F` and its body opens "Affirm `DEC-20260518-F` as the operative interpretation of..." Confirmed.

### Relations check

Every `relations` target in the partition resolves to an existing record file at the pinned commit: `DEC-20260415-A`, `DEC-20260421-J` (x2), `DEC-20260422-C`, `DEC-20260320-B`, `DEC-20260425-B`, `DEC-20260427-A`, `DEC-20260428-A` (x4), `DEC-20260428-B` (x2), `DEC-20260504-B`, `DEC-20260424-A`, `DEC-20260503-B` (x2), `DEC-20260505-H`, `DEC-20260506-G` (x3), `DEC-20260507-F` (x1, plus the reciprocal), `DEC-20260423-A`. None of these target ids appears in `docs/decisions/id-collisions.yaml` (checked individually), so none is a bare collided id. Every relation is narrated in its own record's body except `DEC-20260428-B`'s `related_to DEC-20260428-A` and `DEC-20260430-A`'s two `related_to` edges (to `DEC-20260428-A` and `DEC-20260428-B`) — all three are exactly the relations DEC-20260905-D item 15 and DEC-20260905-F items 1-2 substantiate by name from the amending records; per round-7 rule (a) these are corrections, not findings against the original records, and I re-checked the corrections themselves are accurate (both target records' frontmatter `title`/`topic` do uniquely identify them from the source record's own Context-section phrasing, e.g. "the third-party sourcing doctrine" / "the engineering bar").

### Withdrawn statements re-verified as correct (not findings against the original)

Confirmed present, unedited, in the protected originals (as expected — the withdrawal records correct them externally without editing the protected files) and confirmed the corrections themselves are accurate:
- `DEC-20260413-A.md` line 90-91 ("aggressive addition when free to maintain") — DEC-20260905-D item 8. Row's actual Rationale (page `34167c87082c81319338d956e3649d4c`) reads "Capabilities are added aggressively across all 7 verticals when they cost nothing to maintain," confirming the correction.
- `DEC-20260419-A.md` lines 424-426, 465-466 (the allowlist-justification sentence misattributed to the script's header comment) — DEC-20260905-B item 3. Confirmed `apps/api/scripts/check-no-new-console.mjs` header does not contain this sentence; it is the record's own restated Decision-section policy re-quoted.
- `DEC-20260422-B.md` line 134-135 ("leave the row, mark it, don't delete") — DEC-20260905-D item 11. Confirmed no source contains this exact phrase; the record's own Variant-2 description reads differently.
- `DEC-20260425-A.md` lines 177-180 (manifest-declared-field quotation, mis-attributed to the Decision field) — DEC-20260905-B item 12. Confirmed via dump_rows.py: the exact wording ("...replacing the current getProcessingJurisdictions heuristic based on capabilityType and transparencyTag)") with the parenthetical form lives in the row's Rationale field, not Decision.
- `DEC-20260427-H.md` lines 54-57 (false claim that no record exists for `DEC-20260420-H`) — DEC-20260905-D item 12. Confirmed `docs/decisions/id-collisions.yaml:287-302` lists it resolved with a `formal_record` disposition and the file exists.
- `DEC-20260427-I.md` lines 72-84, 85-93 (two composite/reordered quotations from `auto-register.ts` and `polish-company-data.ts`) — DEC-20260905-D items 13-14. Confirmed both source comments read differently (order/phrasing) than quoted.
- `DEC-20260428-B.md` (undeclared `related_to DEC-20260428-A` relation) — DEC-20260905-D item 15, discussed above.
- `DEC-20260430-A.md` lines 81-83 (false "unresolved"/"unmigrated" characterization of `DEC-20260420-K`/`DEC-20260422-H`) — DEC-20260905-G item 6. Confirmed `id-collisions.yaml`'s `DEC-20260420-K` entry is `resolution_status: resolved` and `DEC-20260422-H.md` exists as a migrated bare-keyed record. Also confirmed `DEC-20260422-H.md`'s own quotation of this same sentence from `DEC-20260430-A` (in its Consequences section) is byte-faithful to `DEC-20260430-A`'s actual text — not a fresh defect, per the withdrawal record's own note.
- `DEC-20260430-A.md` (two undeclared `related_to` relations to `DEC-20260428-A`/`DEC-20260428-B`) — DEC-20260905-F items 1-2, discussed above.
- `DEC-20260503-B.md` (title/Consequences transposition "tiered audit trail" vs "audit trail tiered") — DEC-20260905-D item 16. Confirmed the record's own frontmatter title and the row's Decision field both read "audit trail tiered," not "tiered audit trail" as quoted in Consequences.
- `DEC-20260506-G.md` (EUR vs "EUR " transliteration of the CHARTER.md quotations) — DEC-20260905-B item 8. Confirmed `docs/company/CHARTER.md:399` and `:43` use the euro sign, not "EUR " with a trailing space; correction is accurate.
- `DEC-20260507-D.md` (the "the readiness program adopted" quotation, leading "the" inserted) — DEC-20260905-D item 17. Confirmed `CLAUDE.md:302` reads "**Readiness program adopted.**" with no leading "the."

### Unverifiable

None outright, beyond what is discussed above (finding 2's composite claim was chased to a resolution, not left unverifiable, per rule (c)).

### Minor observation (not a finding)

`DEC-20260422-H.md`'s Context section describes the row's 2026-05-31 expiry as "a 5-week expiry window from its 2026-04-22 decision date." The actual interval (2026-04-22 to 2026-05-31 inclusive of the full window) is 39 days, i.e. roughly 5.6 weeks, not a clean 5 weeks. This is an approximate descriptive characterization, not a quotation, and the underlying dates (`date:Expiry Date:start: 2026-05-31`, `date:Date:start: 2026-04-22`) are both quoted/cited correctly from the row. Noting it for completeness; I am not counting it as a finding given its purely descriptive, non-quoted nature and small size, consistent with how DEC-20260905-G item 3 treated a similar day-count issue as worth a formal withdrawal for a stated arithmetic fact but this instance is a looser characterization ("a 5-week... window") rather than an asserted exact day count.

Two fresh, unwithdrawn findings were identified above (finding 1: a false "no formal record exists" claim in `DEC-20260506-G.md` about `DEC-20260422-H`; finding 2: a composite/inaccurate "four review triggers" claim in `DEC-20260429-A.md`). Neither is named by any of DEC-20260905-B through -G, so neither is excused under round-7 rule (a). Everything else in the partition (structure, 39 of 40 files' quotations, evidence paths, relations, ten-plus code-claim spot checks) checked out clean.

PARTITION VERDICT: FAIL

### P4

# Closing review, round 7 (final), partition P4

Commit: f15bbdd9e7cb88401771cedb62c5907636bf7477
Record count: 42

### Method

Checked out a detached worktree at the pinned commit and ran `npm ci` there.
For every record: parsed frontmatter and confirmed `record_key`/`id`/filename
agreement; confirmed the CAUTION banner and the five protected sections
(Decision, Context, Rationale, Consequences, Reversal conditions); resolved
every `evidence` path against the worktree (a special
`<branch>@<sha>:<path>` entry was resolved with `git show <sha>:<path>`
rather than a plain file-existence check); resolved every `relations`
target against the records directory and confirmed each is substantiated by
body prose naming the target; ran the operator checker
`node scripts/m2-quote-fidelity.mjs --export
.../scratchpad/decisions-export-raw.txt --frontend
C:/Users/pette/Projects/strale-frontend` over the whole corpus (matches the
round-6 total of 237 records / 1147 spans / 99 residual exactly, confirming
the tool ran correctly) and read every residual attributed to my 42 files
directly against its true source; before treating any residual as a defect,
checked whether DEC-20260905-B through -G already withdrew or explained it;
grepped every P4 file for the fourteen sibling-state patterns the round-6
sweep used (`no record`, `unresolved`, `not part of this batch`, etc.) and
checked every hit against `docs/decisions/id-collisions.yaml` and the
records directory at this commit; and read ten code claims directly against
the named files.

### Residual-mismatch list (7 in my partition) and classification

All seven are checker misses, not defects — none is a fresh finding.

1. **`DEC-20260508-A.md:78`** — `"a Tier-1 path exists but has a fixed
   floor,"`. This is the record's own Rationale paraphrasing its own
   Decision correction ("the prior row's 'no Tier-1 path exists' finding is
   corrected to 'a Tier-1 path exists but has a fixed floor,'"), not a quote
   attributed to any external source. Checker miss.
2. **`DEC-20260510-A.md:86`** — `"promote a useful handoff note to
   tracked,"`. Same class: the record's own descriptive phrase for the
   Notion row's PROMOTE-TO-TRACKED classification, not claimed as a literal
   quotation. Checker miss. (This record separately contains the "244 files
   (217 with a recorded intent, 27 without)" count that `DEC-20260905-B`
   item 5 already withdrew — see Known-correction cross-checks below; not a
   fresh finding.)
3. **`DEC-20260518-B.md:55`** — `"can this country deliver T1/T2/T3"`. An
   illustrative rhetorical question in the record's own Rationale, not
   attributed to a source. Checker miss.
4. **`DEC-20260518-D.md:43`** — `"does Strale return this today"`. Same
   class, illustrative phrasing in Context, not attributed. Checker miss.
5. **`DEC-20260827-A.md:40`** — `"licensed contract with the Austrian
   Justizministerium for direct Firmenbuch API access"`. Verified verbatim
   at `apps/api/src/capabilities/auto-register.ts:199-200` (a comment
   citing "DEC-20260427-I-6"), which is not listed in the record's own
   `evidence:` array — an evidence-list-completeness gap, not a withdrawal
   target under the established convention. Checker miss (identical to
   round 6's own finding on this same span).
6. **`DEC-20260904-A.md:180`** — the "Every row reaches formally_migrated,
   intentionally_historical, or obsolete_or_superseded..." quotation.
   Verified verbatim at `docs/project/m2-closure-register.yaml:5144-5146`
   (the `closes_when` clause), which is likewise not in this record's own
   `evidence:` array (evidence-list-completeness gap, not a withdrawal
   target). Checker miss.
7. **`DEC-20260904-B.md:102`** — `"where did this id's authority come
   from"`. Illustrative rhetorical phrasing in the record's own Rationale,
   not attributed to a source. Checker miss.

### Known-correction cross-checks (not fresh findings)

Cross-referenced my partition against `DEC-20260905-B` through `-G`'s
Decision lists. Six of my files carry statements those records already
withdraw; I confirmed the withdrawn text is present exactly as described
and did not re-flag it:

- `DEC-20260510-A.md` — carries "244 files (217 with a recorded intent, 27
  without)", withdrawn by `DEC-20260905-B` item 5.
- `DEC-20260511-C.md` — carries the "CC does not reconcile silently"
  attribution to "the 2026-05-13 cleanup prompt", withdrawn by
  `DEC-20260905-B` item 6. Separately verified this record's own quotation
  "the project still hand-writes migration logic; just in TS, not SQL
  files." is verbatim correct (the *wrong* "we still hand-write" variant
  belongs to `DEC-20260420-A`, outside my partition, per `DEC-20260905-C`
  item 33).
- `DEC-20260511-F.md` — quotes `DEC-20260317-A`'s (false, since-withdrawn
  by `DEC-20260905-B` item 24) characterization of itself as "not a formal
  record and not part of this batch." `DEC-20260511-F.md` is quoting a
  sibling record faithfully; the false content is `DEC-20260317-A`'s own
  and already corrected there. Confirmed `DEC-20260511-F.md`'s own
  frontmatter (`record_key`/`id`: `DEC-20260511-F`, `status: active`,
  title "Daily digest pipeline silent rot — investigation + restoration")
  matches the withdrawal record's description exactly.
- `DEC-20260515-A.md` — carries "The commit id this row cites, `34036a0`,
  does not resolve on `main`.", a misattributed paragraph per
  `DEC-20260905-C` item 40 (the commit is only cited by sibling row
  `DEC-20260515-B`). Verified `git cat-file -e 34036a0` fails (true as a
  bare code claim) and that `DEC-20260515-B.md` correctly cites and
  discusses the same commit id in both its Context and Consequences.
- `DEC-20260515-C.md` — carries "a paid AJPES restPrsInfo contract with
  redistribution rights..." (inserted "a"), withdrawn by `DEC-20260905-D`
  item 18. Verified the manifest's actual text
  (`manifests/slovenian-company-data.yaml:135-136`) has no leading "a", and
  `git cat-file -e 8eb8c0e` fails (that record's other code claim, true).

None of these six is reported as a fresh finding.

### Deep-dive: DEC-20260904-B's collision-state claim (checked, not a defect)

`DEC-20260904-B`'s Context states the M2 closure register "holds this row
[`DEC-20260422-A`] as `unresolved_collision`" — but at the reviewed commit
the register shows `disposition: resolved_collision` /
`resolution_status: resolved` for that page id
(`docs/project/m2-closure-register.yaml:2426-2444`). This looked like the
same "sibling-state aged past truth" defect class rounds 2-6 kept finding.
Checked `git log`: PR #509 ("cross-surface identity mechanism (G3 stage
1)", `88d8c0c0`) is `DEC-20260904-B` itself; PR #511 ("resolve the
DEC-20260422-A cross-surface collision (G3 stage 2)", `cf20869f`) landed
later the same day. `DEC-20260904-B`'s own Consequences section explicitly
says "This batch lands and verifies the mechanism only... it does not
change the `DEC-20260422-A` row's collision payload or disposition. A
later, independently reviewed batch (stage 2...) applies the mechanism to
that specific collision" — an explicit, correct forward disclaimer, unlike
the flatly-asserted-as-final claims earlier rounds withdrew. Not a finding.

### Numbered findings

None. No false, fabricated, misattributed, or unverifiable statement was
found in this partition beyond what `DEC-20260905-B` through `-G` already
withdraw (see Known-correction cross-checks) and beyond the
evidence-list-completeness gaps noted as checker misses above (both
explicitly non-disqualifying under the established convention).

### Ten code-claim spot checks

1. `DEC-20260827-A.md:40-41` — `apps/api/src/capabilities/auto-register.ts:199-200`:
   comment reads "...named in DEC-20260427-I-6 ('licensed contract with the
   Austrian Justizministerium for direct Firmenbuch API access')..." Match.
2. `DEC-20260515-A.md` ("The commit id this row cites, `34036a0`, does not
   resolve on `main`") — `git cat-file -e 34036a0` exits 128, "Not a valid
   object name". Match.
3. `DEC-20260515-C.md` ("`8eb8c0e`, does not resolve") — `git cat-file -e
   8eb8c0e` exits 128, same error; and
   `manifests/slovenian-company-data.yaml:135` reads "Reactivation trigger:
   paid AJPES restPrsInfo contract with redistribution rights...". Match.
4. `DEC-20260518-D.md` — `apps/api/src/capabilities/danish-company-data.ts:183-184`
   sets `ubo_availability = "unavailable_no_registry"`;
   `apps/api/src/capabilities/uk-company-data.ts:226-227` sets
   `ubo_availability = "available"`. Match.
5. `DEC-20260511-C.md` Consequences — `apps/api/drizzle.config.ts` exists;
   `apps/api/package.json:61` lists `"drizzle-kit": "^0.31.10"`;
   `apps/api/drizzle/` is absent; `.github/workflows/ci.yml:176` runs `npx
   drizzle-kit push --force`. Match on all four.
6. `DEC-20260904-A.md` — `scripts/m2-closure-apply-g1-rule.mjs` exists at
   this commit. Match.
7. `DEC-20260822-A.md` ("shapes enforced by
   `apps/api/src/lib/production-authority.ts`") —
   `apps/api/src/lib/charter-authorization-binding.test.ts` confirms
   `SYSTEM_ACTING`/`FOUNDER_DECISION`/`AUTHORIZATION_UNAVAILABLE` are
   deliberately-not-exported charter vocabulary bound by test to the
   module's real `Authority` union (`AUTONOMOUS_POLICY`/`FOUNDER_GATED`);
   the record's careful "shapes enforced by," not "exported by," phrasing
   matches this design. Match.
8. `DEC-20260507-J.md` — repository-wide `recordFailure(` search (excluding
   tests) returns exactly four call sites, all in `apps/api/src/routes/do.ts`
   (lines 1773, 1955, 2305, 2868), none in `test-runner.ts`; and
   `apps/api/src/lib/circuit-breaker.ts:191` and `:196` carry the two quoted
   comments ("...which is what made them inert..." and "91 such refusals
   across 8 capabilities..."). Match.
9. `DEC-20260513-B.md` — `manifests/swiss-company-data.yaml:97` (the
   `test_fixtures.known_answer.input.uid` field) reads `CHE-101.602.521`.
   Match.
10. `DEC-20260513-B.md` — `apps/api/src/db/schema.ts:964-983`'s
    `capabilityHealth` table has `state`, `consecutiveFailures`,
    `totalFailures`, `totalSuccesses`, timestamps, and `backoffMinutes`; no
    `pinned` or `manual_override` column. Match.

### Structural results (all 42 records)

Frontmatter parses on all 42; `record_key`/`id`/filename agree on all 42
(no `--notion-` or `--git-` qualified record in this partition, so item 8
of the review protocol does not apply to any file here); the CAUTION banner
and all five protected sections are present on all 42. All `evidence`
entries resolve (one non-obvious case, `DEC-20260901-A.md`'s
`codex/repo-native-operating-model@b295109...:archive/imports/context-pack/2026-08-31/manifest.json`,
is a same-repo branch-qualified commit reference, confirmed resolvable via
`git show b295109...:archive/imports/context-pack/2026-08-31/manifest.json`
in the strale repo itself — not a broken path). All `relations` targets
exist as record keys at this commit and are substantiated by body prose
naming the target (checked explicitly: `DEC-20260508-A`→`DEC-20260507-H`,
`DEC-20260508-D`→`DEC-20260505-H`, `DEC-20260511-B`→`DEC-20260503-B`,
`DEC-20260511-C`→`DEC-20260420-A`, `DEC-20260511-E`→`DEC-20260511-F`,
`DEC-20260515-A`→`DEC-20260430-A`, `DEC-20260515-B`→`DEC-20260515-A`,
`DEC-20260518-B`→`DEC-20260518-A`, `DEC-20260518-C`→`DEC-20260518-B`,
`DEC-20260518-F`→`DEC-20260428-A`, `DEC-20260518-G`→`DEC-20260518-E`,
`DEC-20260812-A`→`DEC-20260503-A`, `DEC-20260813-A`→`DEC-20260518-F` and
`DEC-20260428-A`, `DEC-20260815-A`→`DEC-20260812-A`,
`DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`→`DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`,
`DEC-20260820-F-WEBSITE-RISK-RESPONSIVE`→ its three website siblings,
`DEC-20260822-A`→`DEC-20260815-A`, `DEC-20260901-A`→`DEC-20260831-A`; none
is a bare collided id per `docs/decisions/id-collisions.yaml`). No null
field is quoted and no populated field is called null in any record
checked. `DEC-20260831-A` (`status: superseded`) and `DEC-20260901-A`
(its stated superseding record) agree on the supersession in both
directions.

### Sibling-state sweep (my partition)

Grepped all 42 files for the fourteen patterns the round-6 sweep used
(`no record`, `no formal record`, `unresolved`, `not part of this batch`,
`pending`, `documented_only`, etc.) and checked every genuine cross-record
existence/state claim against the records directory and
`docs/decisions/id-collisions.yaml` at this commit:

- `DEC-20260513-A.md` — "`DEC-20260503-C` is itself a superseded row with
  no formal record in this repository... verified: no record exists" —
  confirmed true, no `DEC-20260503-C.md` file and no collision-registry
  entry.
- `DEC-20260513-D.md` — same claim, twice, for `DEC-20260506-D` — confirmed
  true, no file, no collision-registry entry.
- `DEC-20260511-F.md` — quotes `DEC-20260317-A`'s claim about itself; see
  Known-correction cross-checks above (the false content is
  `DEC-20260317-A`'s, already withdrawn there, and the quotation in
  `DEC-20260511-F` is faithful to what `DEC-20260317-A` actually says).
- `DEC-20260904-B.md` — the `unresolved_collision` claim for
  `DEC-20260422-A`; see the Deep-dive section above (checked, correctly
  forward-disclaimed, not a defect).

No other genuine cross-record existence/state claim in this partition was
found false.

### Unverifiable

- The exact "76" pre-readiness feature-row population figure and its
  underlying per-row classifications in `DEC-20260904-A.md` (and the ~76
  Notion page-id evidence entries it cites) depend on
  `scripts/m2-closure-apply-g1-rule.mjs`'s measurement against a private
  archive projection at a pinned commit; that private projection file is
  not present in this worktree and the script refuses to run without a
  `--private` input. I confirmed the script exists and its documented
  predicate matches the record's stated predicate, and confirmed the cited
  gap report `archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md`
  exists, but I could not independently re-derive the 76-row count or spot
  check individual rows among the ~76 Notion URLs beyond the ones already
  checked structurally (existence of the page-id format, not their field
  content). Reported as unverifiable, not passed.
- The InfoCamere/HMRC/OpenRegister/Cobalt vendor-response and
  billing-tier outcomes referenced in passing by `DEC-20260515-A` (Cobalt
  dormancy via DQ-30) are production/database-state claims outside what a
  read-only repository review can confirm; consistent with prior rounds'
  treatment, not re-litigated here since `DEC-20260515-A`'s own text
  already cites `config/env-manifest.yaml` and `docs/company/DECISION-QUEUE.md`
  as its evidence for the dormancy claim, which I confirmed resolve as
  files, without independently confirming current production flag values.

PARTITION VERDICT: PASS

### P5

# Closing review round 7, partition P5

Commit reviewed: f15bbdd9e7cb88401771cedb62c5907636bf7477
Record count: 34 (17 collision groups, 2 records each), all `--notion-` qualified

### Method

Detached worktree at the reviewed commit (`C:/tmp/strale-closing7-P5`), `npm ci`,
never edited or committed anything in it; removed at the end (junctions all
pointed inside the worktree itself, confirmed with PowerShell
`Get-ChildItem -Recurse -Force -Attributes ReparsePoint` before deletion).

For every record in the partition: parsed frontmatter and checked
`record_key`/`id`/filename agreement; checked the CAUTION banner and the five
protected sections; read the full body; dumped the underlying Notion row via
`dump_rows.py PAGE:<id>` for all 34 page ids in one batch and normalized every
double-quoted span of 25+ characters (transliterate `€`->EUR, `×`->x, `≥`->>=,
`≤`-><=, `→`->->, `…`->..., lowercase, strip non-alphanumeric, substring test,
ellipsis splits into ordered segments) against the row field, the named repo
file, the named sibling record, or the named frontend file at the pinned
frontend commit `04c9fca9`; checked no null field is quoted and no populated
field is called null (cross-checked against the row's own null-field list);
verified every `evidence` path exists at the reviewed commit or resolves in
the sibling `strale-frontend` checkout; checked every `relations` target
exists as a record key, is substantiated in body prose, and is never a bare
collided id (checked against `docs/decisions/id-collisions.yaml`); for every
qualified record, checked the collision registry (`id-collisions.yaml`) names
that page id with `disposition: formal_record` and the same `record_key`, and
`docs/project/m2-closure-register.yaml`'s public row for that page id carries
`disposition: formally_migrated` with the same key. Ran
`node --test scripts/decision-records.test.mjs` (32/32 pass) as a corroborating
corpus-wide check. Cross-checked every DEC-20260905-B/-C/-D/-E/-G withdrawal
touching a record in this partition against the file it corrects, per rule
(a) of the round-7 brief.

### Operator checker

`node scripts/m2-quote-fidelity.mjs --export <export> --frontend
C:/Users/pette/Projects/strale-frontend` run once over the full corpus,
filtered to this partition's 34 files. Logic: for every double-quoted
span >=25 chars in a record, normalize both the span and its named source
(Notion row field, repo file, sibling record, or frontend file) and test
the span as a substring; report anything that fails as a residual with its
best-match guess.

**Residual list for this partition: none.** All 34 files reported "N spans
checked, N faithful, 0 residual." There is therefore nothing to classify
as real-defect-vs-checker-miss for this partition from the checker's own
output. This does not mean the partition is clean — see Finding 1 below,
a genuine defect on a 19-character quotation (`"library-as-product"`),
which falls under the checker's 25-character extraction floor and was
found only by reading the cited source directly, the same class
`DEC-20260905-F` already documented for `DEC-20260505-H`.

### Findings

1. **`DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`, line
   79-82 (Consequences section).** The record states:
   > `docs/strategy/2026-08-05-direction-plan.md` states Part One
   > ("library-as-product") is the adopted operating strategy per
   > `DEC-20260812-A` (existing record)...

   The quoted phrase `"library-as-product"` is attributed to
   `docs/strategy/2026-08-05-direction-plan.md`, which is not listed in
   this record's `evidence:` array. A case-insensitive, hyphen-insensitive
   search of that file (`grep -in "library"`) finds no occurrence of the
   literal compound "library-as-product": the file's own wording at the
   relevant points is "commits to the library as the product" (line 14)
   and the section heading "Part One — The library, built properly"
   (line 64). Neither is the same string under the stated normalization
   (the source has an extra "the" between "as" and "product/library").
   The phrase "library-as-product" does exist verbatim in the repository,
   but in `CLAUDE.md:302`'s own summary bullet for `DEC-20260812-A`
   ("The 2026-08-05 Direction Plan Part One (library-as-product, x402
   primary rail)"), not in the direction-plan document itself. This is a
   quotation attributed to the wrong source document (`CLAUDE.md`'s own
   gloss, presented as the direction-plan file's wording), the same class
   of defect DEC-20260905-C/-D/-E/-G corrected repeatedly this round for
   sibling records but did not catch here (this exact record is not named
   in any of those six records' Decision lists). At 19 characters, the
   quoted span falls under `scripts/m2-quote-fidelity.mjs`'s 25-character
   extraction threshold, so the checker reported 0 residuals for this file
   even though the misattribution is real, the same failure mode
   `DEC-20260905-F` documented for `DEC-20260505-H`'s 22-character
   "not set in production" misattribution.

   Everything else in this same record checks out: the Rationale/Outcome
   null-field handling is correct, the `DEC-20260812-A` "Counterparty
   Assurance rename/ICP" misattribution at the same paragraph is already
   correctly withdrawn by `DEC-20260905-C` item 36 (verified against
   `docs/decisions/records/DEC-20260812-A.md`, which contains neither
   "rename/ICP" nor "retired as primary product"), and `apps/` containing
   only `api` (no `apps/web`) is confirmed at this commit.

No other findings. Every other candidate defect I located while reading
this partition's 34 records was already withdrawn, and correctly so, by
one of `DEC-20260905-B`, `-C`, `-D`, or `-G` (see "Corrections verified"
below); none of those is counted as a finding against the original record
per rule (a) of the round-7 brief.

### Corrections verified (not findings, per rule (a))

- **`DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`**:
  `DEC-20260905-B` item 13 withdraws "one INSERT on the failure path" (the
  source row's Rationale has no definite article) and a comma-for-em-dash
  substitution in a CLAUDE.md quotation. Verified: the row's Rationale
  field reads "...one table, one INSERT on failure path)..." (no "the"),
  and `CLAUDE.md:270` uses an em dash where the record had a comma. Both
  corrections confirmed accurate.
- **`DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md`**:
  `DEC-20260905-C` item 9 withdraws the attribution of "Homepage
  restructure: 11-section order" to CLAUDE.md's Current Decisions list.
  Verified: `CLAUDE.md:281`'s current `DEC-20260303-G` bullet reads
  "Historical eleven-section homepage order; superseded for the apps/web
  redesign by DEC-20260905-A. Evidence still belongs near the claim it
  supports." — the quoted string is not present. Confirmed accurate.
- **`DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md`**:
  `DEC-20260905-C` item 10 withdraws a fabricated composite ("a reader
  cannot tell 'here is quality infrastructure data' from 'here is a
  suggested product to buy.'") presented as the row's own words. Verified:
  the row's Rationale contains only the short phrases 'quality
  infrastructure' and 'product recommendation'; the longer sentence does
  not appear anywhere in the row. Confirmed accurate.
- **`DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md`**:
  `DEC-20260905-C` items 11-13 withdraw "the worst of (...)" (source has
  no leading "the"), the "Nd" literal-label mischaracterization of a
  template literal, and a circuit-breaker corroboration claim attributed
  to `DEC-20260306-D.md`. Verified against `apps/api/src/lib/trust-grade.ts`
  lines 89 and 211 (confirms both defects) and a full-text search of
  `DEC-20260306-D.md` (zero "circuit"/"breaker" matches). Confirmed
  accurate.
- **`DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`**:
  `DEC-20260905-C` item 29 withdraws the claim that `MIN_EXPECTED_EXECUTORS`
  and its startup gate are moot. Verified: `apps/api/src/index.ts:10-30`
  defines `MIN_EXPECTED_EXECUTORS = 200` and a startup gate that throws
  `StartupFatalError`, caught by `main().catch` which calls
  `process.exit(1)` at line 394. Confirmed accurate (the mechanism lives
  in `index.ts`, a file this record's own evidence array never cites).
- **`DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md`**:
  `DEC-20260905-C` item 31 withdraws a stale "five writing rules" quotation
  from `VOICE.md`, whose first rule is claimed as "No jargon, ever."
  Verified: `docs/company/VOICE.md:13` reads "Use audience-appropriate
  terms (DEC-20260905-A)." today; "No jargon, ever" does not appear.
  Confirmed accurate.
- **`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`**:
  `DEC-20260905-C` item 34 withdraws the claim that `PII_CATEGORY_ENUM` is
  enforced "exactly as this row specifies," 12 values. Verified:
  `apps/api/src/lib/onboarding-gates.ts:242-260` defines 14 entries (the
  12 named plus `nationality` and `political_affiliation`, added
  2026-04-30). Confirmed accurate.
- **`DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md`**:
  `DEC-20260905-C` item 35 withdraws the attribution of "supersedes... the
  Counterparty Assurance rename/ICP" to `DEC-20260812-A`'s own text.
  Verified: `docs/decisions/records/DEC-20260812-A.md` contains no such
  phrase; its own body reads "The source decision explicitly supersedes
  the Counterparty Assurance row named `DEC-20260502-A` and
  `DEC-20260503-A`." The withdrawn phrase is `CLAUDE.md:302`'s own bullet
  text. Confirmed accurate.
- **`DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`**:
  `DEC-20260905-C` item 36 withdraws the same rename/ICP misattribution
  (confirmed above); this record still carries the fresh, uncorrected
  defect in Finding 1 above.
- **`DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`**:
  `DEC-20260905-G` item 5 withdraws the claim that `DEC-20260420-I` is "an
  unresolved collision id in a later G2 batch." Verified:
  `docs/decisions/id-collisions.yaml:303-318` lists `DEC-20260420-I` as
  `resolution_status: resolved` with two rows both `disposition:
  formal_record`, and both formal-record files exist on disk. Confirmed
  accurate. This sibling record's own quotation of the "direct data
  connections only" doctrine correctly includes the word "data" (verified
  against `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md`
  line 29), confirming `DEC-20260905-C` item 37's claim that only the
  *other* record in this collision (the `...0937f.md` file, Finding 1's
  file) dropped that word.
- **`DEC-20260405-B--notion-...` / `DEC-20260409-C--notion-...`**:
  `DEC-20260905-D`/`-E` cite these collisions as evidence for withdrawing
  false "no record exists" claims made in *other*, out-of-partition
  records (`DEC-20260427-H`, `DEC-20260405-A`, `DEC-20260409-D`). Verified
  the underlying fact those withdrawals depend on: `id-collisions.yaml`
  lists both `DEC-20260405-B` and `DEC-20260409-C` as `resolved` with
  formal-record dispositions, and all four corresponding files in this
  partition exist. Confirmed accurate; not a finding against this
  partition's own records (which never made the false "no record" claim
  themselves).

### Ten code-claim spot checks

1. `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md`:
   `apps/api/src/routes/suggest.ts:43,83` define `GET /v1/suggest/typeahead`
   and `POST /v1/suggest` as claimed. Confirmed.
2. `DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md`:
   `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` has exactly
   the ten numbered section comments (2, 4, 6, 7, 8, 9, 10) the record
   names, and no "Built for Agents" match anywhere in the file. Confirmed.
3. `DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md`:
   `strale-io/strale-frontend@04c9fca9:src/components/StatsStrip.tsx`'s
   `buildStats()` returns exactly the four stats (workflows/capabilities/
   automated tests/free) the record describes, with the cert-audit
   comment quoted verbatim. Confirmed.
4. `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`:
   `apps/api/src/index.ts:10,19-30` define `MIN_EXPECTED_EXECUTORS = 200`
   and the `StartupFatalError`/`process.exit(1)` gate. Confirmed.
5. `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md`:
   `apps/api/src/capabilities/au-company-data.ts` reads
   `process.env.ABN_LOOKUP_GUID` exclusively (no `ABR_AUTH_GUID` trace),
   and `config/env-manifest.yaml` carries an `ABN_LOOKUP_GUID` row.
   Confirmed.
6. `DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md`:
   `apps/api/src/db/schema.ts:328-334` defines the nullable
   `capabilityId`/`solutionSlug` pair with the exact quoted comments; no
   `solution_executions`/`solution_run`/`parent_transaction` table exists.
   Confirmed.
7. `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md`:
   `apps/api/src/lib/solution-executor.ts` defines `StepTiming` with
   `latencyMs: number` and pushes `{capabilitySlug, latencyMs: Date.now()
   - stepStartMs}` on both success and failure branches. Confirmed.
8. `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md`:
   `apps/api/src/lib/solution-executor.ts:11-13,140-146` documents
   `$input.<path>`, `$steps[N].<path>`, `$all_results` exactly as quoted,
   and exports `parsePath()`/`walkPath()`. Confirmed.
9. `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`:
   `apps/api/src/lib/onboarding-gates.ts:242-260` has 14
   `PII_CATEGORY_ENUM` entries, not 12 (see Corrections above). Confirmed.
10. `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md`:
    `apps/api/src/routes/verify.ts:19,24,29,256,362` define `MAX_DEPTH =
    50` with the exact quoted comments; `apps/api/src/routes/
    transactions.ts:200` defines a separate `AUTH_VERIFY_MAX_DEPTH = 50`.
    Confirmed.

### Structural checks (all 34 records)

- Frontmatter parses; `record_key` == filename (minus `.md`); `id` ==
  `record_key` with the `--notion-<hex>` qualifier stripped. All pass.
- CAUTION banner and all five protected sections (Decision, Context,
  Rationale, Consequences, Reversal conditions) present in every record.
  All pass.
- Every `evidence:` path (excluding URLs and cross-repo entries) exists
  at the reviewed commit. All pass (scripted check).
- Every cross-repo `strale-io/strale-frontend@04c9fca9:<path>` evidence
  entry resolves in the sibling checkout (14 distinct paths across the
  partition, all confirmed to exist via `git cat-file -e`).
- Every `relations` target (`DEC-20260320-B`, `DEC-20260405-B--notion-...`,
  `DEC-20260406-B--notion-...`, `DEC-20260409-A`, `DEC-20260409-B`,
  `DEC-20260420-A` x5, `DEC-20260420-D/-E/-F/-G--notion-...` chained
  across the F-A series) exists as a file, is substantiated in body
  prose (a "Relation to..." paragraph or equivalent narration in every
  case), and none is a bare collided id per `id-collisions.yaml`. All
  pass.
- Null-field handling: cross-checked every row's actual null fields
  against dump_rows.py output; the five records whose row Rationale is
  genuinely null (`DEC-20260420-E/-F/-G/-H`'s title-only rows and
  `DEC-20260405-B--notion-34a67c87...`) all correctly state "Not recorded
  on the row" rather than fabricating content. No null field is quoted;
  no populated field is called null.
- Registry/register binding (check 8, all 17 collision groups / 34
  qualified records): `docs/decisions/id-collisions.yaml` lists every
  collision as `resolution_status: resolved` with both rows
  `disposition: formal_record` and `record_key` matching the file exactly;
  `docs/project/m2-closure-register.yaml`'s public row for every one of
  the 34 page ids carries `disposition: formally_migrated` with the
  identical `record_key`. All pass (scripted extraction, manual
  line-by-line comparison).
- `node --test scripts/decision-records.test.mjs`: 32/32 pass at this
  commit (corroborating corpus-wide gate).

### Unverifiable

Nothing in this partition was left unverifiable. Every quotation, evidence
path, relation target, and registry binding in the 34 records was checked
against a reachable source (repository file at the reviewed commit,
sibling frontend checkout, or dumped Notion row).

### Checker residuals for this partition

None reported (see "Operator checker" above). Finding 1 is a genuine
defect the checker cannot see because its quoted span is 19 characters,
under the tool's 25-character extraction floor.

PARTITION VERDICT: FAIL

### P6

# Closing review, round 7 (final), partition P6

Commit: f15bbdd9e7cb88401771cedb62c5907636bf7477
Record count: 39 (33 candidate records, all `--notion-` or `--git-` qualified except the six amending records DEC-20260905-B through -G, which are bare-keyed and unqualified)

### Method

Set up a detached worktree at the pinned commit (`C:/tmp/strale-closing7-P6`), ran `npm ci` there, and never edited or committed anything in it. For every record in the list I: (1) parsed frontmatter and checked `record_key`/`id`/filename agreement with a small Python script; (2) confirmed the CAUTION banner and the five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) by string search; (3) ran the operator checker `scripts/m2-quote-fidelity.mjs` against the parsed Notion export (`decisions-export-raw.txt`) and the sibling frontend checkout, with one `--only` per file in my partition; (4) checked every `evidence` path resolves as a file at the pinned commit (script), and resolved every cross-repo `strale-io/strale-frontend@<sha>:<path>` entry directly against the sibling checkout after `git fetch origin`; (5) checked every `relations` target exists as a record key in `docs/decisions/records/` at the pinned commit and is not a bare id in `docs/decisions/id-collisions.yaml`'s collision list; (6) for every `--notion-` qualified record in my list, checked the collision registry entry (`disposition: formal_record`, matching `record_key`) and the closure register entry (`disposition: formally_migrated`, matching `record_key`/`id`) by page id; (7) for the one `--git-` qualified record, checked `id` equals the key without qualifier, the closure register carries `source_kind: git-native`/`source_rows: []`/`git_provenance` equal to the record's first evidence entry, and that the cited commit is a full 40-hex sha and an ancestor of the pinned commit; (8) hand-verified null/populated field claims against four Notion rows dumped with `dump_rows.py`; (9) spot-checked ten or more "status on" code claims by reading the named files directly.

### Checker run

`node scripts/m2-quote-fidelity.mjs --export .../decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend` with `--only` for all 39 files in my partition. Result: 481 spans checked, 393 faithful, **88 residual**, all 88 confined to three of the six amending records:

- `DEC-20260905-C.md`: 134 spans, 82 residual.
- `DEC-20260905-D.md`: 54 spans, 1 residual.
- `DEC-20260905-F.md`: 12 spans, 5 residual.
- All 33 candidate records and `DEC-20260905-B.md`, `-E.md`, `-G.md`: 0 residual each.

#### Residual classification

Read every one of the 88 residuals directly. All are checker misses (not defects): the checker's span extractor lands its boundary inside the connective prose of the recurring `"<quote>" ... Fact: ... reads "<quote>"` sentence shape these withdrawal records use, producing a fragment that is not a genuine quotation at all rather than a misquoted one. This is exactly the class `DEC-20260905-D`, `-E`, `-F` and `-G` each describe and quantify in their own Consequences sections (82 inside `-C.md`, 1 inside `-D.md`, 5 inside `-F.md` newly appearing this round because `-F` was merged after round 5 and the checker parses it for the first time). Spot-checked several of the residual lines directly (e.g. `DEC-20260905-C.md:375`, `:380`, `:382`; `DEC-20260905-D.md:451`; `DEC-20260905-F.md:213`, `:249`, `:259`, `:275`, `:283`) and confirmed each is a mid-sentence fragment of this connective shape, not a quotation with a defect. None is a real defect and none is a finding against the original record it sits inside.

### Findings

None. Every record in the partition passed all checks:

- Frontmatter, `record_key`/`id`/filename agreement, CAUTION banner, and the five protected sections: all 39 records OK.
- Evidence paths: every non-URL, non-cross-repo evidence entry exists as a file at the pinned commit (scripted check, zero misses).
- Cross-repo evidence: two entries in this partition cite `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` (in `DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md` and `DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md`) and one cites `strale-io/strale-frontend@8e01fbc56afc390b23a3d11d6588d434cab2c5f3:src/components/solutions/sqs-display.ts` (in `DEC-20260905-B.md`); all three resolved after `git fetch origin` in the sibling checkout, and the quoted/claimed content in each case matched the file byte for byte (H1 text "One API call.<br />Verified data your agent can trust." at `Index.tsx:145-148`; `isSQSUnqualified` defined at `sqs-display.ts:80`, duplicated under `design/candidates/quiet-material-v0.7/`, imported only by its own test file).
- Relations: every declared relation target in every record in the partition exists as a record key in `docs/decisions/records/` at the pinned commit; none targets a bare collided id (checked against `docs/decisions/id-collisions.yaml`'s 35 collided ids); every relation is substantiated either by a "Relation to" paragraph or by ordinary Context/Rationale prose naming the target and stating the relation's basis (e.g. `DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md` names `DEC-20260420-D` by ID in its References-section quotation without the "Relation to" heading, which is explicitly not a finding per `DEC-20260905-B`'s Consequences (c) and `DEC-20260905-D`'s relation rule).
- Collision-registry and closure-register bindings: all 32 `--notion-` qualified records in the partition (16 collision ids: DEC-20260420-I, -J, -K, -421-A, -B, -C, -D, -502-A, -505-D, -505-E, -507-A, -507-B, -507-C, -508-B, -508-C, -512-A, -513-F) checked against both `docs/decisions/id-collisions.yaml` (all `disposition: formal_record`, matching `record_key`) and `docs/project/m2-closure-register.yaml` (all `disposition: formally_migrated`, matching `record_key` and `id`) — zero mismatches.
- `DEC-20260422-A--git-3b256587.md`: `id: DEC-20260422-A` matches the key minus qualifier; the closure register entry carries `source_kind: git-native`, `source_rows: []`, and `git_provenance` equal to the record's own first evidence URL; the cited commit `3b25658736bfed53eec52c8acf2619dacd54d1f5` is a full 40-hex sha, is an ancestor of the pinned commit, and its subject line ("chore(dist): containment + guardrails for hollow framework packages") is consistent with the record's Context.
- Null-field claims: hand-verified four Notion rows via `dump_rows.py` (`34867c87082c81babd35eba5856ded79`, `34867c87082c81a2a12cc95010bf25bf`, `35767c87082c81059f67e756f5c5eefa`, `35767c87082c813481a8efa27ea37438`) plus two more (`34867c87082c81c6a58dfbc5f46ed3f6`, `34867c87082c81b58b36de5f71c0937f` cited by `DEC-20260420-I--notion-...bbcef.md`). Every "field X is null" / "field X is not null" claim in the partition matched the parsed export exactly; no populated field was called null and no null field was quoted with content.
- The withdrawal records' own quotations (item-by-item in `DEC-20260905-B`) were re-verified against their named sources: `context7.json` rule index 12 (0-based 11) reads exactly as quoted; the cited commit `f93355ace32c401089a6aa322a5a17e323a1e6d5` is a full-length sha and an ancestor of the pinned commit; `apps/api/scripts/check-no-new-console.mjs:12` reads as quoted; `apps/api/src/routes/do.ts:876-877` carries the quoted comment attached to the stated call site; `docs/company/CHARTER.md:399` and `:43` use the euro sign as the correction states.

### The relations:[] observation on DEC-20260507-C and DEC-20260508-C (not findings)

Two records in this partition declare `relations: []` while their own prose describes a supersession relationship:

- `DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md` — this exact gap was already raised by a prior round's P6 report and `DEC-20260905-F`'s Consequences (c) explicitly rules it "not withdrawn; not substantiated as a new relation either" because P6 itself classified it as an omission, not a false or unverifiable claim, and this round's rule requires a finding to be false, fabricated, misattributed, or unverifiable, not merely incomplete. Not re-flagged here, per that ruling.
- `DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md`'s title states "Supersedes DEC-20260507-B for the eligibility question," and its Context section explains why `relations: []` is nonetheless correct: `DEC-20260507-B` is a collided id (verified against `docs/decisions/id-collisions.yaml`); one row (self-merge rule) has a formal record in this partition, the other (NL KVK eligibility row, page id `35967c87082c81f38091f6afba337a8a`) is `documented_only`, its own registry rationale confirming it names `DEC-20260508-C--notion-...67b` as its `Superseded By` target. Since the superseded row has no formal record, no relation edge can target it — the record says so directly ("No formal relation is recorded here because that superseded row's disposition is documented_only: no record exists at PR head for a relation to target"). Verified true; not a finding.

### Ten-plus code-claim spot checks

1. `apps/api/src/lib/capability-persistence.ts:303,312` — "OUTSIDE the transaction... Post-commit: call `onCapabilityCreated(slug)` in try/catch" — confirmed verbatim (`DEC-20260421-B--notion-...2034aa5d.md`).
2. `apps/api/src/jobs/onboarding-retry.ts:1-8` header — confirmed verbatim, including "since the DEC-20260421-B correction" phrasing (same record).
3. `manifests/*.yaml` all-342 claim: 350 manifest files exist at the pinned commit, and all 350 declare `processes_personal_data` or `personal_data_categories` (0 without either) — the qualitative claim holds; the "342" count is dated "Status verified on 2026-09-05" in the record's own text, a point-in-time count that grew as later manifests were added, the same STALE_COUNT class every one of `DEC-20260905-C` through `-G` explicitly treats as not-a-finding (`DEC-20260420-J--notion-...cb6985d10137.md`).
4. `manifests/italian-company-data.yaml:70-71` — `data_source: Openapi.com IT-Advanced (Tier-3 vendor aggregator; Italian company-data product line)` — confirmed verbatim (`DEC-20260505-D--notion-...f6e756f5c5eefa.md`).
5. `apps/api/src/capabilities/auto-register.ts:259,262` — "Final EU30 country to reach code parity — Phase 2c completes 30/30." and "InfoCamere integration per DEC-20260507-C." — both confirmed verbatim (same record).
6. `manifests/austrian-company-data.yaml:366-369` — attribution obligation limitation text confirmed verbatim; `manifests/italian-company-data.yaml` confirmed to contain no occurrence of "attribution" (`DEC-20260508-B--notion-...1414e307e5f.md`).
7. `apps/api/src/lib/trust-helpers.ts:367` — `"manifest_drift" // PR #109 sentinel: declared-guaranteed field absent from actual_output` — confirmed verbatim at the exact cited line (`DEC-20260513-F--notion-...9b79cb7d0367dc46.md`).
8. `config/env-manifest.yaml` and `manifests/*.yaml` — confirmed zero `TOPOGRAPH*` rows and zero manifests naming Topograph as a data_source (`DEC-20260505-E--notion-...e2ba50d630d0b95f9d.md`).
9. `apps/api/src/lib/platform-facts.ts`'s `STALE_VENDORS` array — confirmed the exact comment "IBAN/name match — all rejected per DEC-20260430-A" and all seven named vendors (SurePay, MonitorPay, Movitz, Banfico, iPiD, Bottomline, Yapily) present in that order (`DEC-20260420-K--notion-...051cc0575c4.md`).
10. `docs/decisions/records/DEC-20260812-A.md`'s Decision section — "Retire Counterparty Assurance as Strale's primary framing; compliance work becomes a separate track that requires customer evidence" — confirmed verbatim (`DEC-20260421-A--notion-...c825cc3e4dca30a98.md`).
11. `apps/api/scripts/onboard.ts:135` and `:147,151` — "Cluster 2 Phase 4a: --force-override-authority interactive guard" and the batch-mode/TTY refusal messages — confirmed; `archive/sessions/audit-reports/2026-04-20-phase-4b-audit.md` confirmed to exist (`DEC-20260421-D--notion-...a2a12cc95010bf25bf.md`).
12. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx:145-148` — H1 "One API call.<br />Verified data your agent can trust." — confirmed verbatim, cross-repo (`DEC-20260421-B--notion-...81828e3fe183dd5e8072.md`).
13. `manifests/dutch-company-data.yaml:55` and `config/env-manifest.yaml` — `data_source: Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries)` confirmed verbatim; zero `COMPANY_INFO*`/`KVK*` rows confirmed (`DEC-20260508-C--notion-...b9b5d491786dc67b.md`).
14. `CLAUDE.md`'s DEC-20260815-A entry — "Shipping is never Petter's decision — the session that opens a PR merges it and reports afterwards in plain English" — confirmed verbatim (`DEC-20260507-B--notion-...cba5b6fecb76.md`).

### Unverifiable

Nothing in this partition's own claims was left unverifiable. Two items carried over from prior rounds as explicitly not-adopted (the `relations: []` observations above) are resolved by the amending records' own rulings, not left open by me.

### Notes

`DEC-20260905-F`'s own Consequences (c) names a P6 observation about `DEC-20260507-C--notion-...58c707d895` and rules on it; I did not need to re-raise or re-verify it as a fresh finding, only confirm the underlying `relations: []` fact still holds at the pinned commit, which it does.

PARTITION VERDICT: PASS

## Gate run

```
M2 closing review round 7 gate run at f15bbdd9e7cb88401771cedb62c5907636bf7477, 2026-09-05T23:04:41Z
HEAD=f15bbdd9e7cb88401771cedb62c5907636bf7477
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (278.0299ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (79.4007ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (6.2405ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (47.8098ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 661352.0894
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (2249.4407ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (1657.232ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (843.59ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (2629.1942ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 542250.913
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
check-no-committed-secrets: clean (3077 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still f15bbdd9e7cb88401771cedb62c5907636bf7477
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Outcome

Round 7 found confirmed defects in partitions P3 and P5, and no confirmed
defects in P1, P2, P4, or P6. The confirmed findings are: (1)
`DEC-20260506-G`'s Context section falsely states that no formal record
exists for `DEC-20260422-H` ("no formal record exists for that id on
`main` and it is not in `docs/decisions/id-collisions.yaml`"), when
`docs/decisions/records/DEC-20260422-H.md` exists in this repository as
one of this same batch's own reviewed records (the companion claim in the
same sentence, about `DEC-20260506-F`, is true and is not withdrawn); and
(2) `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`'s
Consequences section attributes the 19-character quoted phrase
`"library-as-product"` to `docs/strategy/2026-08-05-direction-plan.md`,
when that file's own wording is "commits to the library as the product"
and "The library, built properly"; the exact compound phrase belongs to
`CLAUDE.md:302`'s own summary bullet for `DEC-20260812-A` instead, not the
direction-plan document the record names. Every gate ran clean at this
commit (exit 0 each; `npm run context:check`, `npm run context:test`,
`node --test scripts/decision-records.test.mjs
scripts/m2-closure-register.test.mjs`, `node
scripts/m2-closure-verify-private-rows.mjs`, `npm run programs:check`,
`npm run codex:check`, `npm run receipts:check` (warn-only findings noted
in the gate output, exit 0), `node apps/api/scripts/check-pii.mjs
--strict`, `node apps/api/scripts/check-no-committed-secrets.mjs`); the
run is valid. The operator checker's full run at this commit (237
records, 1147 spans, 1048 faithful, 99 residual) reconciles entirely as
checker misses, each faithful to a located and quoted source; none is a
new withdrawal target
(`scratchpad/residual-reconciliation-round7.md`, not committed). A second
checker run at `--min-chars 12` (122 residual, 23 beyond the default
run's 99) likewise reconciles entirely as checker misses
(`scratchpad/residual-reconciliation-round7-short.md`, not committed); the
"library-as-product" misattribution above is not among either run's
residuals at any threshold tested and was found only by reading the cited
source directly, the same class `DEC-20260905-F` documented for
`DEC-20260505-H`. A broader re-sweep of every sibling-state statement in
the corpus (56 raw hits of a wider grep pattern than round 6 used, judged
individually against `docs/decisions/records/` and
`docs/decisions/id-collisions.yaml` at this commit) found exactly one
false, previously unwithdrawn statement: finding (1) above, independently
corroborating P3's own reading
(`scratchpad/sibling-state-sweep-round7.md`, not committed). Both
confirmed findings, plus P3's separately-flagged but not-adopted "four
review triggers" observation on `DEC-20260429-A` (already recorded as
verified from the page body by `DEC-20260905-E`, not a fresh finding), are
addressed by `DEC-20260905-H`
(`docs/decisions/records/DEC-20260905-H.md`), which withdraws each false
statement without editing the record it corrects. The final closing round
runs at the commit that merges this file and `DEC-20260905-H` into
`main`, and treats a statement withdrawn here, in `DEC-20260905-B` through
`-G`, or in `DEC-20260905-H`, as corrected, and a relation substantiated
in any of those records as substantiated.

VERDICT: FAIL
