Intent: land T10 (M2 exit-gap closure) batch 13, fourteen founding Decision
rows from the company's first two days (2026-02-24/25: strategic priority
hierarchy, first vertical, platform differentiator, company name, revised
seed capabilities, LangChain fallback tool, provider-lite model, capability
bundles, global/EU-Nordic positioning, the CI-to-commerce-protocol pivot,
crypto/keypair design, payment architecture, backend language, MVP seed
capabilities) as active formal candidate records, contradiction-checked
against the live capability manifests, the LangChain/x402/MCP-server code,
the readiness-program strategy documents, and CLAUDE.md, with the register's
counts and digests (including the scope/date digest) made true again against
the private archive.

## What this batch is

Fourteen rows resolved from the private projection at archive commit
`8a852ff7c2f601ad464ebbbbe8aa214c701f6d70` (90 rows, the commit recorded on
`origin/main` after PR #537). All fourteen matched exactly on `id` in the
private file: `historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`, `decided_at` 2026-02-24 (four rows) or
2026-02-25 (ten rows), and page ids matching the brief's table exactly.
None collided (`docs/decisions/id-collisions.yaml` has no
`DEC-20260224-P-*` or `DEC-20260225-P-a3b4/e7f8/g9h0/i1j2/k3l4/m1n2/q3r4/
s5t6/u7v8/w9x0` entry; `DEC-20260225-P-c5d6`, the one collision id in this
family, was excluded per the brief and untouched), none was a Git-native
protocol label, none had an existing record (`ls docs/decisions/records/`
grepped for each id: all "no such file" before this batch). Each is now a
formal candidate record under `docs/decisions/records/`, five protected
sections (Decision, Context, Rationale, Consequences, Reversal conditions),
scope `product` for a1b2, c3d4, e5f6, g7h8, e7f8, g9h0, i1j2, k3l4, m1n2,
w9x0 (strategy/positioning/product scope, per the brief) and scope
`technical` for a3b4, q3r4, s5t6, u7v8 (capability set, identity, payment
architecture, language). `owner: petter`, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Confidence`,
`Source`, `date:Date:start`) was read read-only from
`strale-io/strale-context-archive` at commit
`24713c48f0b10e1399a72a37a55d30f2dd8fff9f` (the register's
`sources.decision_archive.commit`; the four `decisions-rows*.json` export
files, byte-identical to the older `995cece3` commit used by batches 4-12,
via a local read-only checkout at
`C:/Users/pette/Projects/strale-context-archive`, never modified or
committed there). All fourteen page ids resolved to exactly one row each
(matched by dashed UUID against each row's `id` field); no other row's
content was read into any of the fourteen records. Every title's SHA-256 was
independently recomputed from the raw `Decision` field and matched the
private projection's `title_sha256` for all fourteen rows before any record
was drafted. `Outcome` and `Superseded By` were `null` for all fourteen
rows; `m1n2`'s `Source` field is also `null` (unlike the other thirteen,
which cite the shared strategy page).

## Per-record fidelity: what was kept, what was compressed

- **DEC-20260224-P-a1b2** (strategic priority hierarchy): kept the full
  three-part ordering (marketplace > agent quality > seeding volume) and the
  "agents are temporary but their reputation impact is permanent" closing
  line verbatim in Context.
- **DEC-20260224-P-c3d4** (first vertical): kept the five-point rationale
  (definable/verifiable outcomes, B2B value, founder-buildable supply, high
  consulting price point, hard-to-replicate complexity) verbatim.
- **DEC-20260224-P-e5f6** (platform differentiator): kept the full Rationale
  quote verbatim, including "If we position as 'we prompt Claude for you' we
  die."
- **DEC-20260224-P-g7h8** (company/platform name): kept all seven naming
  reasons verbatim, including the Italian "arrow" meaning and the
  distinctness-from-strales.io point.
- **DEC-20260225-P-a3b4** (revised seed capabilities): kept every dropped/
  added capability, every named cheaper alternative (Screenshotone, Urlbox,
  Google at $0.005, Nominatim), and all three prices (vat-validate €0.10,
  annual-report-extract €1.00, invoice-extract raised €0.30→€0.50) verbatim.
- **DEC-20260225-P-e7f8** (LangChain fallback tool): kept the "all three
  external LLMs converged" rationale and the week 5-6 target verbatim.
- **DEC-20260225-P-g9h0** (provider-lite model): kept the 5-10 developer
  count, "no escrow, no Connect, no provider dashboard," and the month 3-4
  target verbatim; the row's own `Confidence: medium` was preserved in
  Context rather than upgraded.
- **DEC-20260225-P-i1j2** (capability bundles): kept the EU-vendor-onboarding
  example and the month 2 target verbatim; `Confidence: medium` noted.
- **DEC-20260225-P-k3l4** (positioning): kept the Gemini/ChatGPT pivot
  narrative and the "honest about coverage, ambitious about trajectory"
  closing line verbatim.
- **DEC-20260225-P-m1n2** (the pivot): kept all four named CI prototypes
  (ICE Beauty, Gilion, Nordic HR-tech, Design System Tooling), the three
  discoveries, and the full build/don't-build/GTM lists verbatim.
- **DEC-20260225-P-q3r4** (crypto/keypair design): kept the full five-part
  design (keypair identity, signed transaction records, abstracted escrow,
  Merkle anchoring, deferred on-chain identity) verbatim, including "kills
  the '20 lines of code' promise."
- **DEC-20260225-P-s5t6** (payment architecture): kept the exact Stripe fee
  figures (~€0.25 + 1.5%, 27%/52% fee erosion), the stablecoin cost range
  (€0.001-0.01), and the month 3-6 trigger verbatim.
- **DEC-20260225-P-u7v8** (backend language): kept the MCP-SDK-native
  rationale and the week 3-4 Python SDK target verbatim.
- **DEC-20260225-P-w9x0** (MVP seed capabilities): kept all five original
  capabilities and prices (Swedish company data €0.80, screenshot €0.05,
  invoice/receipt €0.30, structured extraction €0.15, EU address €0.10), the
  discarded-original-five list, and the Puppeteer/EU-Nordic rationale
  verbatim.

No mojibake or garbled characters were found in any of the fourteen source
`Decision`/`Rationale` fields; every euro sign, quotation mark, and en/em
dash in the raw JSON rendered cleanly and was reproduced exactly.

## Contradictions surfaced (Consequences, "status on 2026-09-04")

- **a1b2 / e5f6** (hierarchy and differentiator): no later record found that
  explicitly restates or supersedes either by name (grepped
  `docs/decisions/records/` and `docs/strategy/` for the rows' own phrases:
  no match). Both are superseded in substance by `docs/company/GOALS.md`'s
  mission ("The data layer for AI agents: independently tested,
  audit-logged data sources, purchasable by agents without human ceremony")
  and by `DEC-20260812-A`'s "library-as-product, x402 primary rail," neither
  of which describes a marketplace of specialized operators with escrow and
  buyer-facing reputation.
- **c3d4** (first vertical: market research/CI) is `amends`-superseded the
  next day by **m1n2**'s pivot, which itself no longer matches today's
  shape: CLAUDE.md's capability catalogue lists 7 verticals
  (company-data, compliance, developer-tools, finance, data-processing,
  web-scraping, monitoring), none of them market research/CI.
- **g7h8** (name/domain): held. `strale.io` is confirmed as both API host
  and email domain (`docs/company/coinbase-bazaar-email.md`: "We run Strale
  (api.strale.io)", "petter@strale.io"); README.md additionally shows a
  second domain, `strale.dev`, for the public site, a later addition and
  not a contradiction, since the row only committed to registering
  `strale.io`.
- **a3b4 / w9x0** (seed capabilities): vat-validate and annual-report-extract
  manifests exist; invoice-extract is `price_cents: 50` matching CLAUDE.md's
  DEC-13. **`manifests/screenshot-url.yaml` still exists** (header:
  "Auto-generated from database on 2026-03-17"), contradicting CLAUDE.md's
  own DEC-12 claim that it was dropped (no reinstatement decision found); no
  EU-specific address-validate manifest exists (`address-validate.yaml` is a
  200+-country generic Nominatim validator under a different scope).
  `swedish-company-data.yaml` is `price_cents: 5` (€0.05), not this row's
  €0.80, and its `data_source` is now Bolagsverket, not whatever stood
  behind the €0.80 figure; `DEC-20260405-A`'s own Consequences confirm that
  migration "was completed, not deferred" (code comment: "DEC-20260405-A
  Phase 2: replaced Allabolag scraping with direct Bolagsverket API"). No
  record found documenting the €0.80 to €0.05 price change specifically;
  flagged, not resolved.
- **e7f8** (LangChain fallback tool): `packages/langchain/src/index.ts`
  exports `StraleFallbackTool` almost exactly as specified, published to npm
  as `straleio-langchain` (not `langchain-strale`). `packages/langchain-strale/`
  is a separate PyPI package with no fallback-tool equivalent (`Fallback`
  hit is only an input-schema docstring). CLAUDE.md's Project Structure
  attributes "LangChain" to the `-strale`-suffixed package only, which
  understates which package actually carries this row's design.
- **g9h0** (provider-lite model): no third-party provider of any kind has
  been onboarded (CLAUDE.md's DEC-4, "founder is the only provider for
  first 3 months," has never been recorded amended); `docs/company/WORKFORCE.md`
  and `docs/strategy/2026-08-12-platform-readiness-program.md` both return
  zero hits for "provider"; `docs/strategy/2026-08-05-direction-plan.md`
  states outright "Not a third-party provider marketplace." Stripe Connect
  remains off (CLAUDE.md Tech Stack), consistent with this row's clause but
  for the wallet/x402 architecture's own reasons, not a contractor-payout
  consideration.
- **i1j2** (capability bundles): shipped and scaled well past the row's
  single illustrative example, as the "solutions" layer (`apps/api/src/routes/solutions.ts`;
  CLAUDE.md's "100+ bundled solutions across 6 categories," the KYB
  Essentials/Complete and Invoice Verify families across 20 countries each).
- **k3l4** (positioning): "global"/"EU/Nordic" as a public claim was not
  found registered in `docs/company/VOICE.md` or `docs/company/claims.yaml`
  (grep returned zero relevant hits); CLAUDE.md's vertical-agnostic framing
  is consistent with the row's "brand global from day one" in substance,
  though the present-day wedge is by vertical (KYB/compliance), not by this
  row's geography. The "external providers from other regions" clause has
  not materialized (see g9h0 above).
- **m1n2** (the pivot): `packages/mcp-server/` exists, matching the "MCP
  server + SDK" build item, but `DEC-20260812-A` names x402, not the MCP
  server, as the primary commerce rail; no escrow or agent-reputation system
  was found (the quality floor scores capabilities, not counterparty
  agents); Stripe Connect remains explicitly off. `docs/decisions/records/DEC-20260416-A.md`
  ("strale-mcp and x402/Bazaar are complementary: developer vs runtime
  audiences") is the closest existing reconciliation of the two, though it
  predates this migration and was not written to target this row.
- **q3r4 / s5t6** (crypto and payment architecture): the wallet exists
  (CLAUDE.md DEC-2) and the stablecoin rail shipped as x402/USDC on Base
  mainnet in March 2026, inside the row's own month 3-6 window, in fact
  faster than it. **Keypair agent identity was never built**: grepping
  `apps/api/src/` for `keypair`/`ed25519`/`secp256k1` found only crypto
  address *validators* and `production-authority.ts`'s ed25519 mechanism,
  which authorizes founder grants (`DEC-20260822-B`), not agent/customer
  identity; `apps/api/src/lib/auth.ts` confirms customer identity is a
  hashed `sk_live_` API key. No Merkle-root anchoring of transaction/
  reputation records was found (`DEC-20260428-B`'s "Merkle-rooted ingest" is
  a dataset-integrity requirement for a different kind of build, not this).
- **u7v8** (backend language): held without contradiction; the MCP server
  and both SDKs (TypeScript first, per DEC-23) exist as the row anticipated.

## Relations

Two edges, both source-stated and quoted on the amending/superseding
record per the graph-identity rule (relations live on the source record,
targeting `record_key`):

- `DEC-20260225-P-a3b4 amends DEC-20260225-P-w9x0`: a3b4's own text
  ("Revised seed capabilities post-review: Drop screenshot-url and
  eu-address-validate...") directly names and replaces two of w9x0's five
  capabilities and reprices a third.
- `DEC-20260225-P-m1n2 amends DEC-20260224-P-c3d4`: m1n2's own Rationale
  ("CI product drifted far from marketplace vision," "Don't build: CI
  reports...") directly reverses c3d4's chosen first vertical.

Every other row's `relations: []`. No row in this batch names any other
row in this batch or DEC-1-through-DEC-23-style CLAUDE.md ids by a formal
relation; where a row's text touches a DEC-1..23 line, it is named in prose
only, per the brief (those are not records).

## Register diff (`docs/project/m2-closure-register.yaml`)

- `formal_records.record_count`: 87 → 101 (101 files now under
  `docs/decisions/records/`, verified by `ls | wc -l`).
- `formal_records`: +14 `notion-row` entries (one per new record, each
  `source_rows: [<page id>]`).
- `decision_rows`: +14 rows appended (page_id, id, `title_sha256` copied
  verbatim from the private projection, `historical_status: active`,
  `source_url`, `record_key`, `disposition: formally_migrated`, evidence
  pointing at the new record file, standard rationale sentence). None
  carries `historical_scope`, `decided_at`, or a plaintext title.
- `counts.decision_rows.formally_migrated`: 80 → 94.
- `counts.decision_rows.not_yet_reconciled`: 79 → 65.
- `private_rows.count`: 90 → 76; `private_rows.counts_by_disposition.not_yet_reconciled`:
  79 → 65. **Deleted lines**: the old `count: 90` and old `digest:
  0aa61fe37252924ce775efbc08f1ff0ceee045e6d2a2c16993f1d55c4c553895` lines,
  and the old `not_yet_reconciled: 79` line under `counts_by_disposition`.
  `private_rows.commit` stays `8a852ff7c2f601ad464ebbbbe8aa214c701f6d70` in
  this PR, per the brief; the orchestrator commits the new 76-row private
  file and bumps it after merge.
- `digests.public_rows.count`: 228 → 242. **Deleted line**: the old
  `digest: 492a17a37d2cdf5b11423ff51ff01a97d66c895f99906524326384a6d56d8aa0`.
- `digests.public_rows.scope_date_digest`: recomputed from the archive
  (`recompute-scope-date.mjs`, 242 public rows bound). **Deleted line**: the
  old `scope_date_digest: 55643675e7a2d801533712c5ba8097d1b07cd35407f8554bb6c19aded368bb81`.
- `digests.all_rows`: count stays 318 (total row count is unchanged; rows
  moved disposition, none were added or removed from the export).
  **Deleted line**: the old `digest: e80c7e4ad14d53bcb2eb8d99a63b202230fea05e758dbf6299c2166653925918`.
- G1 gap text: leading count "79 preserved Decision rows (78 global, 1
  temporary)" → "65 preserved Decision rows (64 global, 1 temporary)"; new
  sentence appended naming T10 batch 13 and all fourteen ids; G1 `evidence`
  += the fourteen new record paths.

## Digests (all recomputed and verified matching)

- `private_rows.digest`: `a7757530846bbc72cfbfb9136e511e740ea91ee794f15ab93e6c57252a393fc2`
  (canonicalDigest of the new 76-row private file).
- `digests.public_rows.digest`: `c1125869fbe193bf94eac321d22c650d97e9818a10e9e2c0f825d90cfdc98fb8`
  (canonicalDigest of the register's 242 public rows).
- `digests.public_rows.scope_date_digest`: `e1fbbdc653af70eebcf4e6ba1ea97e869e50d8157e8fb0470d1338bb9a4680e9`
  (recomputed via `scripts/m2-closure-register-lib.mjs`'s `scopeDateDigest`
  over the 242 public (page_id, scope, decided_at) triples read from the
  archive export at `sources.decision_archive.commit`; `recompute-scope-date.mjs`
  confirms computed == registered after the edit; this is the digest
  batch 12 got wrong and had to fix after review, so it was computed and
  verified twice here, before and after the edit).
- `digests.all_rows.digest`: `1c5fd9cce786327488c3d21e7a492b69059b342e366968ef6b3aa82cb1d85fcd`
  (canonicalDigest of public rows + the new 76-row private set; count
  unchanged at 318).

## Checks (all commands run in this worktree; new files staged before
context:test/context:check so the git-index public-boundary scan sees them,
matching what a real merged commit would show)

- `npm run archive:index`: "Wrote archive/README.md and handoff/README.md
  (236 handoff files indexed)", run before `context:generate`, per the
  brief.
- `npm run context:generate`: regenerated 13 non-authoritative files
  (`docs/project/DECISIONS.md` etc.), staged.
- `npm run context:check`: 0 warnings once the new files were `git add`ed
  (before staging: ~196 `REGISTER_IDENTITY_NOT_PUBLIC`/`DECISION_ROW_NOT_PUBLIC`
  warnings, expected: the check's public-boundary scan reads the git index,
  so a new page id/record only counts as "published" once staged).
- `npm run context:test`: green, exit 0 (one test,
  "the checked-in repository context is warning-clean," failed before
  staging for the same reason, then passed).
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`; pre-existing rows
  (CX-1 through CX-19) unaffected; the orchestrator adds this batch's row
  after merge, as for batches 4-12.
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs, unrelated to this
  batch; this handoff avoids a bare count.
- `node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`:
  green, 92/92. CI is the gate.
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md and
  handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 91 `FAIL` lines, all in
  the expected private count/digest classes and their direct, mechanical
  consequences: the archive-repo file at the recorded commit `8a852ff7`
  still holds 90 rows, fourteen of which are now also public, so the
  operator script correctly reports `PRIVATE_ROW_ALSO_PUBLIC` x14,
  `PRIVATE_ROW_ALREADY_PUBLIC` x14, `PRIVATE_ROW_MUST_BE_PUBLIC` (2 forms
  per row) x28, `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` x14,
  `EXPORT_ROW_DUPLICATE` x14 (the same each-row-appears-twice mechanism,
  since the export-comparison pass runs over public+private rows
  combined), the two `PRIVATE_COUNT_MISMATCH` lines, `PRIVATE_DIGEST_MISMATCH`,
  and `ALL_ROWS_DIGEST_MISMATCH`. None is a schema, evidence,
  derivation-rule, or record-citation failure; none is
  `PRIVATE_NEXT_BATCH_COUNT_MISMATCH`/`_DIGEST_MISMATCH` (the next-batch
  cutoff pointer is untouched by this batch and still matches the old
  90-row file). Every failure traces to the private file at the archive
  commit not yet reflecting this batch's fourteen removed rows, exactly
  what the brief says to expect until the orchestrator commits the private
  half and bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`, positional signature `(register,
  privateRows, { schema, collisions, context })`) run against this PR's
  register plus the new 76-row private file plus
  `docs/decisions/id-collisions.yaml`: **0 findings.**
- `node apps/api/scripts/check-pii.mjs --strict`: "PII guard: clean, no
  unredacted person names or checksum-valid identifiers found."
- `node apps/api/scripts/check-no-committed-secrets.mjs`: "clean (2677
  tracked files scanned)."

## Anything not verified / deviations

- One process deviation to disclose: mid-session, before staging the new
  files, this agent ran `git stash -u` to compare `context:check` output
  against a clean tree, in direct violation of CLAUDE.md's Shared-Checkout
  Rule ("Never use `git stash` in any worktree of this clone"; `refs/stash`
  is repo-wide). The stash was popped back immediately (`git stash pop`,
  clean apply, `git stash list` empty afterward) and `git status` confirmed
  no file was lost; all fourteen new record files and the register edit
  were intact and unchanged. No data was lost and no other session's work
  was touched (verified via `git stash list` being empty both before and
  after), but the action itself should not have been taken and is reported
  per the rule's intent.
- `swedish-company-data`'s €0.80 → €0.05 price change (row w9x0/a3b4) has no
  decision record found documenting it specifically; flagged in both
  records' Consequences rather than resolved.
- `vat-validate`'s manifest price (€0.02) does not match this row's stated
  launch price (€0.10); the manifest's own header note says its metadata is
  "intentionally stale relative to the multi-provider executor," so this
  verification flags rather than resolves the discrepancy (recorded in
  a3b4's Consequences).
- Whether the "3 of 5 use Puppeteer" property held for w9x0's *revised*
  five-item list (after a3b4's same-day swap) was not addressed by either
  row's own text and is noted as unresolved in w9x0's Consequences.

## Code-review gate

No application code was touched this session (docs/decisions and the M2
register only); per CLAUDE.md's Quick/Full Session Checklist, docs/decision-record
sessions are exempt from the `/go` code-review gate. Not run.
