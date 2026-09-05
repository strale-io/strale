Intent: land T10 (M2 exit-gap closure) batch 10, six distribution-and-x402-rail Decision rows (DEC-20260313-F Official MCP Registry publication, DEC-20260324-A Stripe x402 US-only / Coinbase CDP facilitator rail choice, DEC-20260324-C AgentCash positioning, DEC-20260330-B Context7/IDE-rules/vibe-coding-SEO distribution shift, DEC-20260404-A Glama TDQS adoption, DEC-20260416-A strale-mcp vs x402/Bazaar audience split) as active formal candidate records, contradiction-checked against the live distribution surfaces (`server.json`, `glama.json`, `context7.json`, `smithery.yaml`, `packages/mcp-server/`, the x402 gateway), with the register's counts and digests made true again against the private archive.

## What this batch is

Six rows resolved from the private projection at archive commit
`efb96d69f8db210d050132008dbd255b909179d3` (115 rows, the commit recorded
in the register at launch time). All six matched exactly on `id` in the
private file: `historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`, and their `title_sha256`/`decided_at`
values matched the brief's page-id table exactly (all six title hashes
recomputed independently from the raw Notion export text and verified
equal to the private projection's `title_sha256`). None collided
(`docs/decisions/id-collisions.yaml` has no entry for any of the six
ids), none was a Git-native protocol label, none had an existing record
(`ls docs/decisions/records/DEC-2026{0313-F,0324-A,0324-C,0330-B,0404-A,0416-A}.md`
all "no such file"). Each is now a formal candidate record under
`docs/decisions/records/`, five protected sections (Decision, Context,
Rationale, Consequences, Reversal conditions), scope `technical` for the
three publication/rail-mechanics rows (DEC-20260313-F, DEC-20260324-A,
DEC-20260404-A) and scope `product` for the three positioning/distribution
rows (DEC-20260324-C, DEC-20260330-B, DEC-20260416-A), per the brief's
classification. `owner: petter`, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Scope`,
`Confidence`, `Source`) was read read-only from
`strale-io/strale-context-archive` at commit `efb96d69f8db210d050132008dbd255b909179d3`
(the commit the register's `private_rows.commit` names on `origin/main` at
launch time), matching each row by page id with dashes stripped against
the four `decisions-rows*.json` export files (fetched via `git show
<commit>:<path>` into a local read-only checkout at
`C:/Users/pette/Projects/strale-context-archive`, never modified or
committed there). All six page ids resolved to exactly one row each; no
other row's content was read into any of the six records. `Outcome` was
empty for five of six rows; only DEC-20260404-A had a non-empty Outcome
("Pending Glama re-scan. Will update once TDQS grades are visible on the
listing."), quoted verbatim in its record's Consequences. Two rows
(DEC-20260404-A, DEC-20260416-A) had a non-null `Source` field
(`https://glama.ai/mcp/servers/strale-io/strale` and
`https://www.notion.so/34267c87082c81778568e9606826b243` respectively);
the Glama URL is cited in DEC-20260404-A's prose (not its `evidence` array,
since the register's evidence-URL pattern accepts only `app.notion.com`
and `github.com/strale-io/*` URLs); the Notion `Source` URL on
DEC-20260416-A is not one of this batch's six rows and was not read.

## Per-record fidelity: what was kept, what was compressed

- **DEC-20260313-F** (MCP registry publication): kept "v0.1.1", both
  transports (stdio `strale-mcp` npm package, remote
  `https://api.strale.io/mcp`), and the "GitHub org membership set to
  public for namespace authentication" requirement verbatim. Compressed
  nothing substantive.
- **DEC-20260324-A** (Stripe x402 US-only, CDP facilitator): kept Ben
  Berke's name and affiliation (Stripe Crypto, Chicago), the Stripe
  account id `acct_1T6JQKFVB83qVk59`, the Atlas cost estimate ($500,
  weeks of setup), and all four numbered rejection reasons verbatim.
- **DEC-20260324-C** (AgentCash complementary): kept "250+ endpoints,
  near-zero traction, and zero quality/trust infrastructure," the named
  risk (wallet friction if AgentCash becomes default) and opportunity
  (trusted provider inside their ecosystem) verbatim.
- **DEC-20260330-B** (Context7/IDE-rules/vibe-coding SEO): kept "60+
  surfaces, 17 open PRs," the Context7 "47K stars, 2x views of #2" claim,
  and all four vibe-coding statistics (92% dev adoption, 53% of AI code
  has vulnerabilities, IBAN/PII exposure in 5,600+ apps) verbatim.
- **DEC-20260404-A** (Glama TDQS adoption): kept Frank Fiegel/punkpeye's
  name, the launch date (2026-04-03), all six TDQS criteria, the pre-work
  scores (License F, Quality not tested, 8 exposed meta-tools), the three
  numbered goals, all 8 meta-tool names, all 8 parameter names, the
  `strale-mcp@0.2.4` shipped version, and the "24-48 hours" re-scan
  expectation verbatim.
- **DEC-20260416-A** (MCP vs x402/Bazaar audiences): kept the full
  distribution list for `strale-mcp` (Claude Desktop, Cursor, Windsurf,
  VS Code, ChatGPT connectors), the "no per-transaction USDC plus gas"
  wallet-advantage framing, and the rejected curated-Bazaar-wrapper option
  verbatim.

## Contradictions found and how they are stated

All stated as dated "status on 2026-09-04" notes in each record's
Consequences section, never editing the Decision/Rationale/Outcome text:

1. **(a) The MCP registry version has moved past v0.1.1, and the registry
   manifest and the npm package manifest disagree with each other
   (DEC-20260313-F).** `server.json` (root) states `"version": "0.2.3"`
   for both the server entry and the `strale-mcp` npm package entry.
   `packages/mcp-server/package.json` states `"version": "0.2.8"` — five
   patch versions ahead of `server.json`. Both transports this row named
   (stdio, remote `https://api.strale.io/mcp`) are still declared in
   `server.json`.
2. **(b) The x402 rail today: Coinbase CDP facilitator, Base mainnet
   USDC, DB-driven (DEC-20260324-A).** `apps/api/src/lib/x402-gateway.ts`
   imports `createFacilitatorConfig` from `@coinbase/x402` and documents
   an `X402_FACILITATOR` selection switch (`auto`/`cdp`/`legacy`) whose
   `cdp` mode "always" uses the Coinbase CDP facilitator and refuses to
   start without `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`, both documented in
   `config/env-manifest.yaml`. CLAUDE.md's "x402 Payment Gateway (March
   2026)" paragraph confirms Base mainnet USDC settlement and that adding
   a capability to x402 needs only `UPDATE capabilities SET x402_enabled
   = true`. A repository document (`handoff/_general/from-code/2026-08-14-settlement-outage-and-monitoring.md`)
   names the 2026-08-14 CDP settlement free-tier outage directly: the CDP
   facilitator allows 1,000 free settlements per calendar month, Strale
   crossed that threshold mid-month, and the result was a 21-hour revenue
   outage — a real, later cost of the rail this row chose, not a reason
   to reverse it.
3. **(c) AgentCash has a live, production-verified anchor in the
   codebase (DEC-20260324-C) — stronger than the brief's anticipated
   default.** `apps/api/src/routes/x402-gateway-v2.ts` contains explicit
   `@agentcash/discovery` decoder-compatibility handling and names the
   "x402scan/agentcash discovery spec." A repository document
   (`handoff/_general/from-code/2026-09-01-x402-agentcash-discovery-contract.md`,
   PR #461, merged as commit `b4e3904f2e982dcd9e7bad83f4da8c21eb3621e7`)
   records that paid operations now emit canonical `protocols: [{ x402:
   {} }]` for `@agentcash/discovery@1.7.5` compatibility, with production
   verification of correctly parsed paid calls. This is not "the
   positioning claim has no live anchor" (the brief's anticipated
   fallback); it is a shipped, production-verified integration, dated
   2026-09-01, well after this row's 2026-03-24 decision date.
4. **(d) Context7 and IDE-rules artefacts exist and are live
   (DEC-20260330-B), but one of Context7's rules cites a deleted
   endpoint.** `context7.json` (root) carries a 12-entry `rules` array;
   `docs/ide-rules/strale-compliance.mdc` and `.windsurfrules` cover
   trust-sensitive data handling. Rule 12 of `context7.json` reads "Every
   capability has a Strale Quality Score (SQS) from 0-100. Check via `GET
   /v1/quality/:slug`." — that endpoint was deleted with the SQS engine
   on 2026-05-05 (DEC-20260503-B; CLAUDE.md). This is a live, unswept
   stale-copy finding; not corrected in this batch (editing `context7.json`
   is outside this batch's scope — it is one of the four root manifests
   CLAUDE.md's "Root contains exactly" paragraph requires in place), and
   flagged separately as a spawn-task suggestion (see below).
5. **(e) DEC-20260404-A's Outcome ("pending Glama re-scan") is still
   unresolved in this repository; only the platform's own self-scoring is
   recorded.** A repo-wide grep for `TDQS` finds only
   `archive/sessions/audit/2026-04-04-strale-mcp-tdqs-rewrite.md`, the
   platform's own before/after self-scoring (all 8 tools 4.0/6 average ->
   6.0/6 average) — not Glama's independent re-scan verdict. Separately,
   `packages/mcp-server/src/tools.ts` was rewritten again for an unrelated
   reason (removing SQS references after the 2026-05-05 engine deletion),
   so the exact tool-description text this row's TDQS rewrite produced no
   longer exists verbatim.
6. **(f) The Combined-Trust-Grade-adjacent split named in this batch
   holds structurally: no signup, payment IS the auth, DB-driven
   (DEC-20260416-A).** CLAUDE.md's x402 paragraph confirms this directly.
   The "full SQS/provenance metadata" claim this row makes for `strale-mcp`
   is partly stale (SQS itself is gone; provenance metadata survives).
7. **(g) The 2026-08-23 MCP trust incident postdates both DEC-20260313-F
   and DEC-20260416-A and bears on both.** CLAUDE.md's Distribution PR
   Integrity Protocol records that `strale-mcp` shipped `0 cap trust, 0
   sol trust` for roughly 3.5 months (trust routes deleted in May, admin
   wall answered 401 not 404, client logged to invisible stderr and
   carried on). Named explicitly in both records' Consequences: it means
   the "differentiated metadata" claim both rows rest on was not actually
   true in production for most of the interval between them.

None of these change a Decision's recorded meaning, so none required a
STOP; all are within the fidelity-and-contradiction-surfacing mandate.

## Relations: none added

None of the six rows' extracted Notion text (Decision, Rationale, Outcome,
Source) names another `DEC-2026...` id string anywhere, checked by literal
string search over each field, including across the six rows themselves.
DEC-20260416-A's `Source` field is a bare Notion URL to a page outside this
batch, not a decision-id string, so it does not create a relation either.
Per the brief's relation rules (edges only where source-stated), no
`relations` entries were added on any of the six records, including no
edge to `DEC-20260422-A--git-3b256587` (the Distribution PR Integrity
Protocol record) — none of the six rows' text names the protocol or the
pydantic-ai incident, so it is cited only as prose/evidence context in
three records (DEC-20260313-F, DEC-20260404-A, DEC-20260416-A), never as a
`relations` entry. All six records carry `relations: []`.

## Register changes

Targeted string edits only, per batch 4-9 method:

- Six new rows appended to `decision_rows` (the public array), shape
  matching existing `formally_migrated` rows: `page_id`, `id`,
  `title_sha256` copied verbatim from the private projection,
  `historical_status: active`, `source_url`, `record_key`, `disposition:
  formally_migrated`, `evidence: [docs/decisions/records/DEC-....md]`,
  the standard rationale string, inserted immediately before
  `private_rows:` (batch 9's insertion point).
- `formal_records` += six `notion-row` entries (appended after
  `DEC-20260323-A`, the prior tail).
- `sources.formal_records.record_count`: 62 -> 68.
- `counts.decision_rows.formally_migrated`: 55 -> 61.
- `counts.decision_rows.not_yet_reconciled`: 104 -> 98.
- `digests.public_rows.count`: 203 -> 209.
- `digests.public_rows.digest`:
  `daf02f8f883c0da8091d7c949ba23f8e391d5046c9cd9232923d45766dc92b24` ->
  `d5d0713343651c8ce863b2f913f7d5ac96026df81827efdd90a1b6c568c68b98`.
- `digests.public_rows.scope_date_digest`:
  `7742c8632dc09a58c1a71fa286b14f7d751bf98c4dfceedec3396d6e1c36a837` ->
  `f9b2012784ac59f1f474df7c6eaa574c2f2ae2f2400d2edf301849a9cb7af2e7`
  (recomputed over all 209 public rows' `Scope`/`date:Date:start` triples
  from the raw export at commit `efb96d69`, using `scopeDateDigest`; all
  209 rows matched an export row, zero missing).
- `digests.all_rows.digest`:
  `5582ff5e07bd8b2ab9d625b7c497182825d51c4d7e33c062fc1016a2f0039aa7` ->
  `719bdad929c51f542d9d81e66145252d63631bcc5599b48aaaaa689a1a2225bb`
  (count stays 318: 209 public + 109 private).
- `private_rows.count`: 115 -> 109; `private_rows.digest`:
  `7fbcf9446adf639de5539cd3e12fa477095ea1a2ecb8baa7a8d000e6d7f4995c` ->
  `193e43c6ead8bde9bd826fd0285c5b9ca10ec0997092229424ad3cb797e0bd45`;
  `counts_by_disposition.not_yet_reconciled`: 104 -> 98.
  `private_rows.commit` is left at `efb96d69f8db210d050132008dbd255b909179d3`
  in this PR; the orchestrator commits the new private half (below) to the
  archive repository and bumps this field afterward.
- Gap `G1`'s `gap` text: "104 preserved Decision rows (103 global, 1
  temporary)..." -> "98 preserved Decision rows (97 global, 1 temporary)...",
  with this batch's six record ids appended to both the narrative and
  `evidence`.

No line was deleted from the register except as part of the in-place text
replacements above. Specifically, the deleted lines are:
- `count: 203` / `digest: daf02f8f88...` / `scope_date_digest: 7742c8632d...` (public_rows, replaced)
- `digest: 5582ff5e07...` (all_rows, digest replaced, count unchanged at 318)
- `formally_migrated: 55` / `not_yet_reconciled: 104` (counts.decision_rows, replaced)
- `record_count: 62` (sources.formal_records, replaced)
- `count: 115` / `digest: 7fbcf9446a...` / `not_yet_reconciled: 104` (private_rows, replaced)
- the old G1 `gap:` paragraph (104/103 preserved rows, replaced with the
  98/97 paragraph naming this batch)

No row, gap, or evidence entry was removed.

## Digests computed (all shown above); collected here for convenience

- `public_rows.digest`: `d5d0713343651c8ce863b2f913f7d5ac96026df81827efdd90a1b6c568c68b98`
- `public_rows.scope_date_digest`: `f9b2012784ac59f1f474df7c6eaa574c2f2ae2f2400d2edf301849a9cb7af2e7`
- `all_rows.digest`: `719bdad929c51f542d9d81e66145252d63631bcc5599b48aaaaa689a1a2225bb`
- `private_rows.digest` (new 109-row projection): `193e43c6ead8bde9bd826fd0285c5b9ca10ec0997092229424ad3cb797e0bd45`

Computed with `scripts/m2-closure-register-lib.mjs`'s own
`canonicalDigest`/`scopeDateDigest` functions, imported directly (via a
throwaway `.mjs` script run inside the worktree and deleted before commit,
never staged), over the 109-row private file plus the register's 209
public rows plus the full 318-row raw export (all four
`decisions-rows*.json` files fetched read-only from the private archive at
commit `efb96d69`, same commit the register names).

## Private half for the orchestrator

New 109-row private projection (six rows removed, nothing else changed,
same layout as the source) written to (NOT committed, per the brief):
`C:/Users/pette/AppData/Local/Temp/claude/C--Users-pette-Projects-strale/4f68dcca-de52-4ade-b2b2-8341f736268e/scratchpad/2026-09-02-m2-closure-private-rows.batch10.yaml`

## Checks run

- `npm run archive:index` (before `context:generate`, per the brief), run
  twice (before and after this handoff file existed, per batch 9's
  pattern) so the archive/handoff indexes include it: final run "Wrote
  archive/README.md and handoff/README.md (233 handoff files indexed)."
- `npm run context:generate`: 13 non-authoritative project-context files
  regenerated; five protected sections present on all six new records.
- `npm run context:check`: warning-only mode; "no warnings," exit 0, run
  after staging every generated file.
- `npm run context:test`: green, 133/133, including "the checked-in
  repository context is warning-clean." CI is the gate.
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched by this batch, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`; 16 pre-existing
  rows awaiting Codex, none added or touched by this batch (per the
  constraint not to touch `docs/programs/**`; the orchestrator adds this
  batch's row after merge, as observed for batches 4-9).
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs, unrelated to this
  batch; this handoff itself avoids a bare count.
- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`: green, 92/92. CI is the gate.
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md
  and handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 43 `FAIL` lines, all
  in the expected private count/digest classes and their direct
  consequences (the archive-repo file at the recorded commit
  `efb96d69` still holds 115 rows, six of which are now also public, so
  the operator script correctly reports `EXPORT_ROW_DUPLICATE` x6,
  `PRIVATE_ROW_ALSO_PUBLIC`/`PRIVATE_ROW_ALREADY_PUBLIC` x6,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (x2 forms per row, x6),
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` x6, the two
  `PRIVATE_COUNT_MISMATCH` lines, `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`). None is a schema, evidence, derivation-rule,
  or record-citation failure: every failure traces to the private file at
  the archive commit not yet reflecting this batch's six removed rows,
  exactly what the brief says to expect until the orchestrator commits the
  private half and bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`, positional signature
  `(register, privateRows, { collisions, context })`) run against this
  PR's register plus the new 109-row private file plus
  `docs/decisions/id-collisions.yaml`: **0 findings.**

## Out-of-scope finding flagged separately

`context7.json` rule 12 cites the deleted `GET /v1/quality/:slug` endpoint
(SQS engine, retired 2026-05-05 per DEC-20260503-B). This is stale public
copy in a root-required registry manifest; correcting it is out of this
batch's scope (constraints forbid touching the root registry manifests),
so it is flagged via a spawned background-task suggestion rather than
fixed here.

## Deviations from the brief

None identified. Every deliverable, check, and constraint in the brief was
met as specified. The `.mjs` digest-computation and validation scripts
used during this batch were run inside the worktree and deleted before
the final `git add`, never staged or committed (verified: `git status
--short` before commit shows only the six new record files and the
register-derived generated-file changes plus this handoff, matching the
constraint list exactly).
