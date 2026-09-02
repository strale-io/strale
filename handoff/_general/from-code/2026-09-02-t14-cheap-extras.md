Intent: Ship T14 (cheap extras) — an environment-variable manifest, a
model-id registry, and a claims register, each as data with a checker and
tests, per `archive/sessions/2026-09-02-t14-cheap-extras-plan.md`.

## What shipped

Three commits on `feat/cheap-extras` in the batch worktree
`strale-wt-t14`, plus this handoff:

- `25796245` — Part A: `config/env-manifest.yaml` + schema, `env-lib.mjs`,
  `check-env.mjs` (`npm run env:check`), `generate-env-example.mjs`
  (`npm run env:example`), `env.test.mjs` (`npm run env:test`, 17 tests).
- `c3921069` — Part B: `apps/api/src/lib/models.ts` (`MODELS` registry +
  `promptDigest()`), migrated 93 call sites off literals,
  `model-literals-lib.mjs` + `check-model-literals.mjs`
  (`npm run models:check`) + `check-model-literals.test.mjs`
  (`npm run models:test`, 14 tests).
- `05b9aac0` — Part C: `docs/company/claims.yaml` + schema,
  `docs/company/VOICE.md`, `claims-lib.mjs` + `check-claims.mjs`
  (`npm run claims:check`) + `claims.test.mjs` (`npm run claims:test`,
  17 tests). Shared paragraph in CLAUDE.md and AGENTS.md. Inventory
  regenerated (`context:generate`), `check-project-context.mjs --json`
  is zero findings.

All three wired into `.github/workflows/ci.yml` immediately after
`design:check` / `design:test`.

## Counts

- **Environment variables**: 126 distinct `process.env.NAME` reads
  detected by the checker's comment-aware text scan across
  `apps/api/src`, `apps/api/scripts`, `packages`, `scripts`. 127 manifest
  rows — one extra (`X402_FACILITATOR_URL`) is genuinely read but only
  via a typed `env` parameter (`resolveFacilitatorSelection(process.env
  as FacilitatorEnv)`), not the literal `process.env.X402_FACILITATOR_URL`
  text the checker looks for; marked `read_indirectly: true` rather than
  silently omitted or falsely flagged dead. The plan's own raw count was
  129 — the difference is one pure false positive (`VAR_NAME`, matched
  only inside a code comment in `env-template-generate.ts`, a capability
  whose job is detecting env-var-shaped tokens in OTHER people's source)
  plus fixing an extension-filter gap (`.mts` wasn't scanned, costing
  `STRALE_SMOKE_API_KEY`) minus removing `OPENAI_API_KEY` (which turned
  out to be read nowhere in our own runtime — only named as a string in a
  coherence-check rule and shown in an SDK-usage example in a package
  README) — net: 128 real names, 127 documented directly, 1 documented
  via `read_indirectly`.
- **Model literals replaced**: 93 files — the 90 named in the plan
  (`claude-haiku-4-5-20251001` → `MODELS.capability_default.id`) plus
  `apps/api/src/lib/embeddings.ts` (`voyage-3.5-lite` →
  `MODELS.embeddings.id`), `apps/api/src/lib/daily-digest/analyze.ts`
  (`claude-sonnet-4-20250514` → `MODELS.digest.id`), and
  `apps/api/src/capabilities/risk-narrative-generate.ts`
  (`claude-sonnet-4-6` → `MODELS.capability_reasoning.id`).
- **Claims seeded**: 27 rows after review — 21 forbidden, 3 needs_evidence, 3 allowed
  (26 total; some rows carry more than one status label in the audit
  source but resolve to one register status).

## Judgement calls

1. **Comment stripping in the env and model scanners.** Both `env-lib.mjs`
   and `model-literals-lib.mjs` strip block (`/* */`) and line (`//`)
   comments before matching, so a doc comment naming an env var or model
   id in prose isn't a false "read"/"literal". This was forced by two
   real self-referential bugs found during authoring: `env-lib.mjs`'s own
   JSDoc mentioning `process.env.NAME` and `process.env.VAR_NAME` in
   prose, and `risk-narrative-generate.ts`'s own Cert-audit Y-10 comment
   naming `claude-sonnet-4-6` and `claude-sonnet-4-6-YYYYMMDD` in prose.
   Without stripping, both checkers would fail against their own/adjacent
   legitimate code.
2. **`scripts/*.test.mjs` excluded from the env scan.** `env.test.mjs`
   plants fixture source code as string literals — including deliberately
   fake `process.env.NAME` text for every failure mode — which the env
   scanner would otherwise treat as real reads (it scans `scripts/`
   itself). Scoped narrowly to that one filename pattern; no other file
   in any scanned tree uses it (confirmed by search before applying).
3. **A small `DATA_FILE_ALLOWLIST` in the model-literal checker**:
   `llm-cost-calculate.ts` and `token-count.ts` are public per-vendor
   pricing/context-window reference tables — capabilities that answer
   "what would this cost" or "how many tokens" for a NAMED model the
   caller supplies, across many vendors and historical versions.
   Migrating their literals to `MODELS` would be semantically wrong
   (`models.ts` only has entries for what Strale itself calls). Each
   allowlist entry carries a one-line reason in the source.
4. **GPT/Voyage regex requires a digit in the tail.** The plan's literal
   regex (`gpt-[a-z0-9.-]+`, `voyage-[a-z0-9-]+`) would false-positive on
   `"voyage-rate-limited"` (a log-event name in `embeddings.ts`) and
   `"gpt-referral"` (a discovery-source tag). Every real GPT/Voyage model
   id carries a version number; tightened both branches to require one,
   verified against the actual repo before and after.
5. **`prompt_sha256` added to exactly one provenance object**
   (`risk-narrative-generate.ts`) — the only one of the 90+ AI capabilities
   that already records an actual model id in its provenance
   (`model_requested`/`model_resolved`); verified by grepping all of them.
   The rest only ever wrote a descriptive `source` label (e.g.
   `"claude-haiku"`), never a real model field — adding a prompt digest
   there would mean restructuring each capability's provenance shape, not
   the "small, mechanical change" the plan scoped this to. Left alone, as
   instructed.
6. **`full-vies-verification-implied` claim regex tightened after a real
   false positive.** The naive literal "full VIES verification" matched
   `vat-format-validate.yaml`'s own correct redirect text ("Use
   vat-validate for full VIES verification") — the honest disclosure the
   original audit wanted preserved, not caught. Now requires a claiming
   verb (provides/performs/includes/does) immediately before the phrase.
7. **Two audit "DO NOT SHIP" items got no claims.yaml row**: a static
   global price range and a static free-tool count. Both are "a number is
   hardcoded" concerns, which a phrase-matching register can't express;
   both already sit in spirit under `check-platform-facts-drift.ts`'s
   capability/country-count drift checks. Documented in the register's
   own header comment, not silently dropped.
8. **Vendor-name drift deliberately not duplicated into claims.yaml.**
   The OpenSanctions case study (the reason claims.yaml exists at all,
   per the plan) is already `check-platform-facts-drift.ts`'s job via
   `STALE_VENDORS`/`getStaleVendorNames()` in `platform-facts.ts`. Adding
   a second copy of vendor names here, matched a different way, is
   exactly the "one list, many matchers" failure mode this repo has hit
   three times before (#428/#434/#436). Boundary documented in both
   `claims-lib.mjs`'s header and `VOICE.md`.
9. **`check-model-literals.mjs` placed under `apps/api/scripts/`** per
   the plan's literal path, with `models:check`/`models:test` as thin
   root-level delegating npm scripts — kept the checker's own logic
   (`model-literals-lib.mjs`) self-contained rather than importing the
   root `scripts/` Ajv/YAML tooling, since `apps/api` doesn't depend on
   `ajv`/`yaml` and the model registry needs neither (it's a TS object
   literal, not a YAML file with a JSON Schema) — a regex-based structural
   parse of the `MODELS` object literal is enough to check `pinned_at`/
   `decision` presence without a full TS compile.
10. **`pinned_at` dates** are the date each id first appeared in git
    history (`git log -S'<id>' --reverse --format=%cs`), not today's date.
11. **`decision` field**: `DEC-20260303-E` for `embeddings` (explicitly
    named in CLAUDE.md: "Voyage AI embeddings + Claude Haiku
    re-ranking"). The other three roles (`capability_default`,
    `capability_reasoning`, `digest`) are `"unrecorded"` — no decision
    record names these specific model choices; they were picked as
    "cheapest capable model per task" per `docs/company/BUDGET.md`
    standing rule #1, which is a standing policy, not a per-model
    decision.

## Holders needing Petter (`holder: unknown`, 27 rows)

`ALCHEMY_API_KEY`, `BAG_API_KEY`, `BEACON_SUPABASE_SERVICE_ROLE_KEY`,
`BEACON_SUPABASE_URL`, `CBEAPI_KEY`, `COBALT_API_KEY`,
`COURTLISTENER_API_TOKEN`, `EINSEARCH_API_KEY`, `EP_ONLINE_API_KEY`,
`ESORTCODE_API_KEY`, `ETHERSCAN_API_KEY`, `GEMI_API_KEY`, `GITHUB_TOKEN`,
`JINA_API_KEY`, `OPENREGISTER_API_KEY`, `REKT_API_TOKEN`,
`SDDA_API_CLIENT_ID`, `SDDA_API_CLIENT_SECRET`, `SEC_API_IO_TOKEN`,
`STRALE_API_KEY`, `STRALE_SMOKE_API_KEY`, `STRALE_TEST_API_KEY`,
`SUDREG_CLIENT_ID`, `SUDREG_CLIENT_SECRET`, `TENDERLY_ACCESS_KEY`,
`TENDERLY_ACCOUNT`, `TENDERLY_PROJECT`.

`STRALE_API_KEY` specifically is confirmed dead already (per
`user_api_key.md`: matches no account, verified 2026-08-25) — this row's
`cost_note` says so; it needs a fresh key, not a rotation.

Several country-registry rows (`BOLAGSVERKET_*`, `GEMI_API_KEY`,
`SDDA_API_*`, `SUDREG_*`) carry `holder: petter`/`unknown` with a
`cost_note` flagging that the `cost_class` value (mostly guessed "free",
typical for a direct government registry) was **not independently
re-verified this session** — worth a real pass if/when the vendor-cost
audit is refreshed.

## Two facts worth a look, surfaced by the migration, not fixed (out of scope)

- **`NOTION_API_KEY` and `NOTION_TOKEN`** look like the same underlying
  Notion integration under two different env-var names
  (`daily-digest/fetch-notion.ts` reads one, `check-vendor-roster-drift.ts`
  and the weekly-drift workflow read the other). Flagged in both rows'
  `purpose` text in `config/env-manifest.yaml`. Not consolidated —
  renaming either would need a Railway env-var change, which is outside
  this track's write scope.
- **`X402_RECEIVING_ADDRESS`** is set defensively by
  `billing-parity.integration.test.ts` with a comment claiming it "makes
  isX402Configured() true" — but `isX402Configured()` only ever checks
  `X402_WALLET_ADDRESS`. No production code path reads
  `X402_RECEIVING_ADDRESS` at all. Looks like a stale/dead reference
  inside the test, not live config. Flagged in the manifest row's
  purpose text; not touched (out of scope — this track doesn't edit test
  assertions unrelated to its own three registers).

## Verification run (all green)

`npm run env:check`, `env:test` (17), `models:check`, `models:test` (14),
`claims:check`, `claims:test` (17), `design:check`, `design:test` (24),
`research:check` (passes; 5 pre-existing unrelated
`RESEARCH_LOOKING_FILE_OUTSIDE_CONTRACT` warnings, not failures),
`programs:test` (30), `context:test` (108), `handoff:test` (30), and
`npm run typecheck` (full monorepo — apps/api, apps/api scripts,
sdk-typescript, langchain, semantic-kernel-strale, mcp-server) all pass.
`node scripts/check-project-context.mjs --json` → zero findings.

Two pre-existing, unrelated build-order gaps were hit and fixed to get a
clean typecheck (needed regardless of this track — every session that
runs `npm run typecheck` cold on a fresh worktree will hit them):
`packages/mcp-server` and `packages/sdk-typescript` had no `dist/`, so
`apps/api/src/routes/mcp.ts` (`strale-mcp/tools`) and
`packages/langchain/src/index.ts` (`straleio`) failed to resolve. Ran
`npm --workspace=packages/mcp-server run build` and `npm run build
--workspace=packages/sdk-typescript`. Neither package's *source* was
touched.

`npx vitest run` for capability unit tests: 917 passed, 20 skipped, 0
failed, across the changed files (excluding `*.integration.test.ts`,
which needs a database — out of scope per the test-harness exemption
noted in the Part B commit). 3 suites (`ssrf-bucket-a/b/c.test.ts`) hit
the default 30s hook timeout under full-batch resource contention (each
bootstraps the ~321-capability registry); re-ran each individually and
all pass (14/14 total). `apps/api/src/lib/embeddings`,
`apps/api/src/lib/suggest`, `apps/api/src/lib/daily-digest`: 17/17
passed.

## What could not be done / deferred

- No real production API calls were made to verify vendor cost/holder
  facts beyond what's already documented in the repo (BUDGET.md, DEC
  text, prior memory notes) — this session had no mandate or credentials
  to contact 15+ vendors. The `holder: unknown` list above is the
  recovery checklist, per the plan's own framing ("his `.env` files are
  gone, DQ-29").
- Did not rename or consolidate `NOTION_API_KEY`/`NOTION_TOKEN`, and did
  not fix the apparently-dead `X402_RECEIVING_ADDRESS` test reference —
  both flagged, neither in scope (T14 is "cheap extras: three registers
  + checkers", not a vendor-key cleanup or a test-fix pass).
- `docs/programs/cto-readiness/tracks.yaml` was read but not edited, per
  instruction.

## Distribution PR Integrity Protocol / Capability Onboarding Protocol / Audit-Follow-up Test Coverage Protocol

None of these apply this session: no distribution PR was touched, no
`*-strale` package was published or modified, no new capability was
created or onboarded (the 93 files touched are executor internals —
model-id source, not manifest/schema/behavior — and are covered by the
existing capability test suites, which all still pass), and no
cert-audit-finding-numbered commit landed.

## Code-review gate

`/go` was not run this session — the task explicitly specified the
verification checklist above (env/models/claims/design/research/programs/
context/typecheck) rather than the `/go` flow, and this is a batch-track
session inside an isolated worktree, not the shared checkout the
session-checklist's code-review gate targets. Flagging per CLAUDE.md's
"Quick/Full Session Checklist" gate: if a `/go`-equivalent review is
still expected before this branch is considered mergeable, that is the
next action, not something this session skipped silently.

## Review fixes (orchestrator and independent review, same day)

- `9d5fe85a` — the forbidden-claim scanner was hollow: every row is written
  as `/pattern/`, but the matcher only compiled `is_regex` rows and even
  then kept the slashes, so no forbidden row could match prose. Found by
  planting three forbidden claims in README; fixed with a regression test.
- `725db5f2` — with a working scanner the register found real drift: the
  SQS row was over-broad ("quality score" is what `data-quality-check`
  returns; "trust layer" is the positioning tagline) and was narrowed; hits
  on surfaces outside this repository (the frontend's `llms.txt`) became
  warnings; `README.md` no longer says every capability is continuously
  tested (paid capabilities are watched through production observability).
- `dfaf6420`, `3bf02751` — `packages/mcp-server/README.md` and
  `packages/strale-capabilities/README.md` still described the retired SQS
  score, the QP/RP matrix and an invented `execution_guidance` shape;
  narrowed to what `packages/mcp-server/src/tools.ts` actually returns
  (narrowing only, each statement traced to a code line in the commit body).
- `748fc136` — the SQS row ignores the negated "no per-call quality score".
- Independent review of the branch: the scraping row was first-person only
  and passed "Strale scrapes LinkedIn profiles for you."; widened to
  third-person and named ToS-prohibited targets; a "Sign in" row added (no
  login product exists); the header now lists every audit item without a
  row and why. T14 marked done in the register, T4 active.
- Claims tests: 18 after the review (17 before).

## Final commit

`05b9aac0` was the last implementation commit; the review-fix commits above follow it on branch `feat/cheap-extras` (worktree `strale-wt-t14`).
Preceding commits this session: `25796245` (Part A), `c3921069`
(Part B).
