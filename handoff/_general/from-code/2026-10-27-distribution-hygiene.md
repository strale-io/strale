Intent: Implement the in-repository D0 attribution and D1 distribution-copy hygiene work; leave the reviewed changes uncommitted for the orchestrator. No publish, push, PR, merge, production database write or production-setting change occurred.

## What changed

- Tagged complete entry URLs in both MCP registry files, Smithery's remote guidance, Context7, the root and package READMEs, package website metadata, x402 listing copy, the static skill, public IDE guidance, dynamic llms/skill guidance and discovery cards. API URLs carry only `src`; website links carry `src` and `utm_source=<venue>&utm_medium=listing&utm_campaign=distribution-d0-d1`. API base origins, schema identifiers and repository identities stay plain because they are configuration/identifiers rather than complete entry URLs.
- Fixed HTTP MCP funnel/rejection capture and forwarded `/v1/do` calls to preserve `src`; MCP-to-x402 handoff URLs preserve it too. A2A also forwards its source. Existing `/v1/do` transaction branches and all four x402 recording branches already extract and persist the query source. Expanded venue signatures where an identifiable host or agent needle exists; no invented needles for indistinguishable README/llms sources.
- Added metadata-derived `X-Strale-Client` to the Python LangChain, CrewAI and Composio packages, TypeScript LangChain and Semantic Kernel packages, and corrected the Python/TypeScript SDK defaults. Existing User-Agent values were preserved. The TS SDK accepts a framework client-header override; its browser-compatible default is generated from package metadata at build time.
- Both signup routes pass the source into the shared account-creation transaction. Precedence is query `src`, body `src`, query/body `utm_source`, then referer host. Invalid explicit input stays null rather than falling through. Case and whitespace are normalized; overlong labels, URLs, email addresses, IPs and non-channel payloads are rejected. Referers lose paths and queries, known hosts map to venue slugs, and otherwise dots become hyphens. Numeric-only labels are rejected to avoid numeric IP representations. Nothing is backfilled from customer evidence.
- Added `users.signup_src` and append-only startup block `0126_signupSource`, ledger row `M069`. It adds nullable text with a 64-character CHECK, guarded by `information_schema` so later boots do no ALTER. The ledger generator now accepts uncommitted appended source beyond HEAD's line count, with a regression test. The rollup groups API-key signups by source, including an explicit unknown bucket.
- Replaced retired listing descriptions with the approved job-first copy. Removed the universal audit-record promise: x402 transaction recording and authenticated audit retrieval are different contracts, and cached/early responses do not establish that promise on every rail. Removed retired Payee Assurance advertising from the MCP card; card/server versions read MCP package metadata. Updated the distribution register: three yanked packages are withdrawn, Flowise remains open, Pipedream is listed with its repair still outstanding.
- All nine MCP tools have titles and four safety hints. Execution is non-read-only, destructive from the wallet's perspective, non-idempotent and open-world. Search is read-only. The legacy names `strale_trust_profile` and `strale_methodology` remain compatible: the former reads the current public batch projection (badge/label/tested/last-tested/pass-rate), and the latter explains testing and rail-specific limitations without resurrecting a score.
- Extended claims checks to listing configs, package descriptions, agent guidance, discovery-card strings and MCP definitions. Listing-specific retired-framing/count rules have explicit `scan_paths`, so a legitimate dataset quality calculation is not mistaken for the removed catalogue score. Added planted regressions for stale copy, generic plus totals, pre-built totals, tool-heading totals, universal x402 wording and malformed/duplicate attribution links.

## Source verification and evidence

Evidence: [verification receipt](../../../archive/receipts/2026-10-27-test-run-distribution-hygiene.json).

- Full API Vitest: **6,442 passed, 346 skipped**, 348 passing files and 33 skipped files. Initial runs found the expected migration-list update and a test requiring the now-removed guaranteed trial amount; both were corrected before the green full run.
- Attribution/signup regression coverage passes: MCP forwarding and x402 handoff, Hono query extraction for `/v1/do` and `/x402/*`, real transaction-writer call-site wiring, venue resolution, signup normalization, actual Drizzle-encoded insert binds and migration binds. No Date or Buffer reaches the tested database parameter arrays. Source recording is proven locally; no claim is made that undeployed code is already recording production traffic.
- TypeScript SDK: 7 tests; MCP: 2; TS LangChain: 1; Semantic Kernel: 1 local test (credential-dependent suites skipped). Python framework/SDK tests: 8 passed, 18 skipped. All four Python wheels build without publishing. The offline catalogue loads and finds the sample validation slug; it has no build/test script and its snapshot was not regenerated.
- `npm run typecheck` passes across API, API scripts and TS packages. The requested bare root `npx tsc --noEmit` also ran: it reports 282 errors in untouched files, including existing test typing, optional example dependencies and an audit script; no errors are in changed files. The canonical API `npx tsc --noEmit` passes.
- Every command in the root CI check job was exercised, including lint/security guards, manifest/shape/cost guards and all register tests. The CEO-brief command initially hit a Unix-socket path-length limit when TMPDIR was kept inside this deep clone; the equivalent `node --import tsx` invocation passes. Vendor fixtures pass with `GIT_CEILING_DIRECTORIES` preventing nested fixtures from inheriting the clone's Git repository. Counts and command exit statuses are in the receipt. Disposable-Postgres integration suites remain skipped because no `DATABASE_URL_TEST` is provided; no database materialization command was pointed at an unknown target.
- Two independent read-only reviews ran under the `go` skill, two rounds each. Both finished GO with nits; their remaining link/tool-list nits were fixed. No high finding remains. No simplify skill is installed; the author applied the local simplification pass without widening the architecture.

## D0 deploy verification plan (DEC-20260504-C)

The deployment dependency is API startup, not an unused migration script. Root `Dockerfile` copies API/MCP sources, builds `packages/mcp-server` and `apps/api`, then executes `node apps/api/dist/index.js`. `apps/api/src/index.ts` imports and awaits `runStartupMigrations` at lines 173–177 before schema validation at 181–184 and before serving at 320. `BLOCKS` includes `runMigration0126_signupSource`; its ledger hash and `users.signup_src` write are checked by `migrations:check`.

After the orchestrator deploys, use an authorized database session for these **read-only** checks:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'users' AND column_name = 'signup_src';
-- Expect signup_src | text | YES.

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'users'::regclass AND conname = 'users_signup_src_length';
-- Expect the char_length(signup_src) <= 64 check.

SELECT signup_src, count(*)
FROM users
WHERE created_at >= '<deployment timestamp>'::timestamptz
GROUP BY signup_src;
```

Run tagged signup and invalid-label scenarios in a disposable/staging database first. Observe naturally arriving post-deploy production signups with the aggregate query; do not create production accounts or make paid calls as part of this handoff. After a second boot, repeat the column/constraint checks. Run the attribution rollup in its authorized read-only environment and confirm the signup-source section. Check deployed MCP `tools/list` titles/hints and a tagged free-call fixture in staging, then inspect stored transaction `client_meta.src` there. A clean migration log alone is not sufficient proof. No production query in this plan was run by this build agent.

## Publish list — only after founder approval

| Artifact | Prepared version | Why / order |
|---|---|---|
| npm `straleio` | 0.1.4 | Metadata-derived default header and framework header override; publish before TS LangChain. |
| npm `straleio-langchain` | 0.1.1 | Package/version attribution; requires straleio ^0.1.4. |
| npm `strale-semantic-kernel` | 0.1.5 | Attribution and honest community-port disclosure. This session does not deprecate it. |
| npm `strale-mcp` | 0.2.9 | Source forwarding, annotations, titles, current descriptions and legacy-tool wording. |
| npm `strale-capabilities` | 0.1.1 | Current description and README; no refreshed catalogue snapshot is implied. |
| PyPI `straleio` | 0.1.5 | Metadata-derived client header/exported version, current README/type prose. |
| PyPI `langchain-strale` | 0.1.5 | Metadata-derived attribution and current copy. |
| PyPI `crewai-strale` | 0.1.5 | Metadata-derived attribution and current copy. |
| PyPI `composio-strale` | 0.1.5 | Attribution on search, fallback, execute and balance; current copy. |
| Official MCP registry, both `server.json` sources | 0.2.8 currently | `npm view strale-mcp version` returned 0.2.8. Repo descriptors match that published version as requested. After publishing 0.2.9, update both descriptor versions to 0.2.9 before the registry refresh so it installs the changed package. |
| Smithery | unversioned listing/config refresh | Use the current copy and `https://api.strale.io/mcp?src=smithery`; rebuild from the approved package if stdio is used. |
| Glama | unversioned listing refresh | Its actual transport setting must use `https://api.strale.io/mcp?src=glama`; see limitation below. |
| Context7 | unversioned re-index | Refresh tagged guidance and omit all three yanked packages. |
| x402 directory copy | unversioned text refresh | Draft G is in docs/x402-listing.md; its example source is x402scan. Substitute the destination's venue slug when the orchestrator submits the generic copy elsewhere. |

After each package publication, run the Distribution PR Integrity Protocol's published-artifact smoke tests from `docs/release/npm-publishing.md` and record observed values. This build did not run a post-publish smoke test because nothing was published. Do not republish the three yanked packages; only their in-repo forwarding guidance/links were maintained. No external distribution PR was touched. GitHub's repo description/topics and third-party directory settings remain orchestrator work.

## Intentionally left alone / limitations

- `glama.json` remains its supported maintainers-only configuration. Its published schema at `https://glama.ai/mcp/schemas/server.json` defines no transport URL field; adding an arbitrary ignored `url` property would not prove attribution. Existing Glama referer/agent signatures remain active, and the claims guard now scans this file. The tagged external endpoint is in the publish list for the orchestrator.
- `strale-frontend` website llms.txt and other repositories/directories are outside this repository-only authorization. The website copy still needs its separate maintenance edit.
- Archive files, handoffs, dated research/strategy, immutable decision records and historical audit/diligence reports remain historical. Internal retirement comments, compatibility identifiers and governance documents quoting old claims are not current marketing text. The internal manifests/CLASSIFICATION.md mention of SQS was left as internal authoring guidance, not a listing source; it should be corrected in an authoring-protocol maintenance batch.
- `data-quality-check` really computes a dataset quality score. Its manifest and the offline catalogue's corresponding description were preserved; they do not advertise the retired platform score. Offline catalogue count fields are dated generated data, not listing claims.
- Schema/repository identity URLs and API base configuration values intentionally carry no query tags. They must remain valid identifiers/origins.
- Root context generation assumes every standalone primary clone is shared and refused this orchestrator-provided private clone. The stale generated entry was a docs/company reference removed from the rewritten x402 listing. Only `docs/project/legacy-authority-inventory.json` was refreshed from the canonical generator's exported output, after confirming its changed entry is docs/company; the shared-checkout guard was not modified. The orchestrator must regenerate context again after staging the new docs/company content, because inventory hashes use indexed blobs.
- `handoff:check` cannot pass this session's explicit leave-uncommitted/no-push contract. It also classifies this standalone clone as trunk and lists inherited merged branches. No branch switching, branch deletion or push was performed to satisfy it. The orchestrator owns those steps and must run its normal commit/worktree/upstream gate before merge.
- [BACKFILL] No Notion Journal write was attempted; this session is repository-only. This handoff is the session record.

## Round 2

This section corrects the Round 1 descriptions and evidence above. Changes remain uncommitted for the orchestrator. No push, PR, merge, package publication or production write occurred. All work stayed in the supplied checkout; no bundle or clone was created. No absolute workspace paths were added to source, handoff or receipt files.

### Findings resolved

1. **Signup privacy:** a referer now contributes only a recognized venue tag from `resolveDiscoverySource`. Unknown domains and strale.dev/strale.io (including api.strale.io and all subdomains) produce null. Empty/whitespace source fields are absent; resolution continues through body `src`, query/body `utm_source`, then a known referer. Invalid nonempty explicit fields still produce null. Tests cover these cases and the real Drizzle insert encoding.

   **Website follow-up required:** `apps/web`, and `strale-frontend` until the replacement ships, must retain landing-page `src` / `utm_source` and forward them in the signup request body. A browser signup's referer is strale.dev; without forwarding, website signups record null. Do not restore a hostname fallback to compensate.

2. **Migration lock:** unmerged block `0126_signupSource` adds bare nullable `text` with no default, then adds `users_signup_src_format CHECK (signup_src ~ '^[a-z0-9-]{1,64}$') NOT VALID`, guarded by `pg_constraint`. The constraint enforces new writes without scanning existing users. Only unmerged ledger row M069's hash was regenerated using `computeCurrentBlocks`; historical rows were unchanged. The signup migration test checks the bare column, named constraint, NOT VALID and empty bind array. `migrations:check` passes.

3. **Public copy:** removed fixed catalogue totals from `/v1/do`, welcome/activation emails, quickstart and agent snippet. Removed the quickstart's retired quality endpoint and universal score claim. MCP README descriptions now match `tools.ts`: methodology explains testing modes/source context/retrieval, and the legacy trust-profile tool exposes current badge/tested/pass-rate/last-tested signals; limitations and sources belong to the catalogue. The workflow no longer promises a full audit trail for every execution. Composio and IDE signup copy use conditional trial wording. The sweep also narrowed trial promises in A2A, other `/v1/do` errors and activation emails. Welcome-email balances remain derived from the actual grant.

   Every specifically requested surface is in the claims loader and both distribution rows' `scan_paths`: do.ts, welcome-email.ts, activation-emails.ts, claude-md-snippet.md, api-quickstart.md, MCP README, Composio toolkit and IDE rule.

4. **Guard reliability:** plus counts require at least three digits and cannot start after a word character or decimal point. Tests reject catalogue totals while allowing Python 3.10+, Python 3.100+, Node 18+ and Node.js 20+. Missing `SOURCE_TARGETS` or row `scan_paths` now produce a failing `SCAN_PATH_MISSING` finding; planted tests cover both. Extra tests prohibit decorative tags on unrecorded discovery GET links and keep the skill's channel distinct.

5. **Real route evidence:** replaced the fake Hono app and source-regex assertions. The tests mount the real MCP route with its real SDK transport/tools, the real `/v1/do` route, and the real x402 gateway. Discovery/metadata consumers and infrastructure boundaries are mocked. MCP tests assert initialize recording, rejection callback recording and actual REST forwarding. x402 tests assert transaction metadata and input values for capability success/failure and solution success/gated failure, plus catalogue recording. The paid `/v1/do` harness also checks the actual transaction insert's `clientMeta.src`. No route required the narrow-seam exemption or a live database.

   GET `extractInputs` now strips `src` and every `utm_*` key before coercion, with and without a schema. Actual x402 transaction-write tests prove these fields never enter stored capability inputs.

6. **Python import safety:** every metadata version lookup in langchain-strale, crewai-strale, composio-strale and straleio catches `PackageNotFoundError` and uses `unknown`. Tests simulate missing distributions for all four clients and reimport straleio with missing metadata to prove the exported version cannot break import.

### Nits resolved

- SDK headers remain distinguishable: `straleio-js/<version>` and `straleio-python/<version>`. The backend client classifier uses the `straleio` substring rather than either full new name; attribution accepts the supplied header rather than requiring an exact SDK id.
- Restored canonical `402-index` in venue signatures and its test. The strategy's section 5 says `402index`; keep `402-index` in code so existing rows remain joined. That historical research spelling was not rewritten.
- Static and dynamic skill links use `skill`; llms guidance retains `llms-txt`.
- Confirmed `/SKILL.md`, `/.well-known/mcp.json`, `/v1/capabilities` and `/v1/platform/facts` have no discovery recorder. Removed their decorative tags, along with unrecorded AI catalogue/x402 manifest/tool-detail/solution-list/suggest/Web3 links. Recorded links remain tagged: MCP, llms, A2A agent card, x402 catalogue/execution and REST execution/signup. Removed tags from solution execution examples too: that standalone handler does not consume attribution.
- Composio's conditional header builder already omits Authorization for an empty key. Added a real registered-search test that forces the public fallback and checks both HTTP requests have no Authorization header.
- **Deliberate A2A provider domain correction:** origin/main used `https://strale.io`; retained `https://strale.dev` without a query. Read-only HTTP checks returned `200 https://strale.dev/` and `404 https://strale.io/`. The company site is [strale.dev](https://strale.dev/).

### Fail-before evidence

Evidence: [fresh Round 2 receipt](../../../archive/receipts/2026-10-27-test-run-distribution-hygiene-round-2.json). The Round 1 receipt is unchanged.

Baseline: the real-route suite plus paid `/v1/do` harness passed **31 tests**. Independently replacing each source read with undefined produced:

| Source read removed | Expected failing assertion |
|---|---|
| MCP tool options | Actual REST execution URL loses src |
| MCP rejection callback | Recorded rejection loses src |
| MCP arrival peek | Recorded initialize loses src |
| `/v1/do` handler | Metadata-consumer test and paid transaction-insert test both fail |
| x402 catalogue | Recorded catalogue hit loses src |
| x402 gated solution | Recorded transaction loses src |
| x402 successful solution | Recorded transaction loses src |
| x402 failed capability | Recorded transaction loses src |
| x402 successful capability | Recorded transaction loses src |

All nine mutations exited 1 for the named assertion; restored code exited 0 with all 31 tests passing. No mutation survived. Because the user explicitly required an uncommitted checkout, the clean-tree-only mutation utility could not run: originals were retained in process memory and restored byte-for-byte in `finally`, without stash, checkout, temporary clones or temporary files.

### Remaining grep matches deliberately preserved

Repeated the requested counts/retired-phrases sweep across apps/api/src, packages and docs, excluding generated dependencies/builds, dated research/strategy, archives and handoffs. Current catalogue totals and retired scoring promises on the requested customer surfaces are removed. Remaining matches have these meanings:

- `packages/strale-capabilities/capabilities.json`: tool-specific upstream/data coverage, not a Strale catalogue total. Entries include phone validation, adverse media, DeFi fees/TVL, skills, ports, dangerous goods, public holidays/holiday lookup, language detection, PEP, crypto prices, address validation and company news. The data-quality-check entry computes a dataset quality score; it does not advertise the retired platform score. This dated snapshot was not regenerated or presented as current coverage.
- `apps/api/src/lib/catalogue-copy-0123.ts`, `public-descriptions-0124.ts`, `startup-migrations.ts`: immutable ledgered migration evidence, including old descriptions and tool-specific vendor coverage. Do not edit merged blocks to clean up grep output.
- `docs/dpia/sanctions-and-pep-check.md` and `docs/programs/brand-website/MESSAGING-LEVELS.md`: vendor-specific sanctions-list/PEP-territory coverage, not a Strale catalogue count. `docs/diligence/payee-assurance-v1-section-1-iban-name-match.md` records dated third-party vendor research.
- `docs/company/drafts/distribution/01-listing-texts.md` and `02-outreach-emails.md`, `docs/company/DIRECTORY-MAP.md`, `docs/operations/distribution-registry.yaml`: unpublished historical drafts or dated observations of third-party listings, not approved publication copy. Publish the revised package/listing surfaces below, never these old drafts.
- `docs/onboarding-improvements.md`, execution-receipt design specs, `docs/programs/brand-website/SITE-STRUCTURE.md`, cto-readiness track/backlog records, decision records, company lessons/decision queue, generated project context and inactive governance mirrors: internal/history records, including quotations of what was retired. Decisions are immutable.
- Other source matches are comments explaining retirement, compatibility symbols, internal admin/diagnostic/job/digest/interrupt/email-template code, technical fixtures, AWS SQS as a technology name, and tool-specific source datasets (sanctions, PEP, ports, skills, dangerous goods, company news, DeFi). Internal digest/interrupt score labels are not customer-facing distribution copy and remain outside this batch. No additional customer-facing Strale catalogue-total or universal platform-score promise was left knowingly active.

### Round 2 publish list (nothing published)

| Artifact | Version / action |
|---|---|
| npm straleio | 0.1.4 — metadata-derived `straleio-js` header and override; publish before TS LangChain |
| npm straleio-langchain | 0.1.1 — metadata attribution; requires straleio ^0.1.4 |
| npm strale-semantic-kernel | 0.1.5 — metadata attribution and current copy |
| npm strale-mcp | 0.2.9 — src forwarding/handoff, annotations, titles and honest methodology/profile descriptions |
| npm strale-capabilities | 0.1.1 — distribution copy; snapshot coverage unchanged |
| PyPI straleio | 0.1.5 — `straleio-python`, safe metadata fallback and import |
| PyPI langchain-strale | 0.1.5 — attribution with safe metadata fallback |
| PyPI crewai-strale | 0.1.5 — attribution with safe metadata fallback |
| PyPI composio-strale | 0.1.5 — attribution with safe metadata fallback, conditional trial copy, no-key fallback verified |
| Both official MCP registry descriptors | Currently 0.2.8; change to 0.2.9 only after publishing that artifact |
| Smithery / Glama / Context7 | Refresh approved copy and recorded MCP endpoints; re-index Context7 |
| x402 listings | Use docs/x402-listing.md and the venue's canonical source; `402-index` stays canonical |
| Skill and IDE guidance | Refresh skill/llms source tags and conditional trial wording |
| API deployment | Signup privacy, nullable column + NOT VALID constraint, input stripping and narrowed email/response copy |
| Website | Separate required src/utm_source body forwarding; maintain strale-frontend until apps/web ships |

Founder approval and published-artifact smoke tests remain required before package publication. No yanked framework package is on the publish list. No distribution PR was touched. The orchestrator owns review, staging, commit, push, PR and merge; this Round 2 has no new independent-review verdict.

### Updated post-deploy read-only proof

Use the column query above and replace the obsolete length-constraint query with:

```sql
SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'users'::regclass AND conname = 'users_signup_src_format';
-- Expect the regex CHECK with convalidated = false (NOT VALID).
```

Startup reach remains Dockerfile → compiled API index → awaited `runStartupMigrations` → block 0126 before serving. No production proof has been run. Test tagged and untagged signups, known/unknown/own referers and repeated boot in disposable staging, then observe aggregate natural production signups under the orchestrator's authority. The migration itself needs no separate production command: API startup applies it.

### Round 2 verification results

Evidence: [Round 2 receipt](../../../archive/receipts/2026-10-27-test-run-distribution-hygiene-round-2.json).

- Full API Vitest ran twice successfully: **6,455 passed, 346 skipped** each time; 348 passing files, 33 skipped files. Targeted signup, real-route, paid-do, agent-surface, MCP and actionable-error follow-up: **151 passed**.
- Route fail-before run: **31 passed → nine independently caught mutations → 31 passed** after restoration. Signup source tests: **19 passed**. Claims guard: **33 passed**. Migration ledger tests: **24 passed**. Context tests: **180 passed**.
- Package tests: TS SDK **7 passed**; MCP **2 passed**; TS LangChain and Semantic Kernel **2 passed** together through the tsx loader. Python **13 passed, 18 skipped** (credentials unavailable). All active TS packages build. The catalogue imports; no test scripts exist for that snapshot/static skill/yanked forwarding packages.
- `npm run typecheck` and API `npx tsc --noEmit`: PASS. Bare root `npx tsc --noEmit`: exit 2, **282 existing errors, zero in changed files**, confirmed against the changed/untracked path set. Unrelated root test/example/audit typing was not changed.
- Every check-job command below ran. The tsx CEO-brief CLI and both TS framework test-script CLIs encountered the existing Unix-socket path-length issue; `node --import tsx apps/api/scripts/check-ceo-brief.ts` and `node --import tsx --test packages/langchain/tests/*.test.ts packages/semantic-kernel-strale/tests/*.test.ts` ran the same code successfully. No shortened scratch checkout or outside temporary directory was created. Dependency installation was already complete before this round; `npm ci` was not repeated.
- `git diff --check`: PASS. Final claims/env/docs/distribution/migration and receipt checks rerun after closeout edits. Framework integrity: **4 active verified, 3 deprecated skipped**. Shape-contract guard exits 0 with the sibling frontend absent; no cross-repo shape proof is claimed.
- `npm run handoff:check`: exit 1, as expected under the orchestrator's explicit same-checkout/uncommitted/no-push contract; dirty tree, clone classified as trunk on a feature branch, upstream and inherited merged-branch findings. No git cleanup or push attempted. No disposable PostgreSQL was provided; no schema materialisation, integration-job database writes or production commands ran.

| Root CI check-job command | Real result |
|---|---|
| `npm --workspace=packages/mcp-server run build` | PASS |
| `npm --workspace=packages/sdk-typescript run build` | PASS |
| `npm run typecheck` | PASS |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-new-console` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | CLI path limit; equivalent invocation PASS |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run programs:check` | PASS |
| `npm run programs:test` | PASS |
| `npm run research:check` | PASS |
| `npm run research:test` | PASS |
| `npm run design:check` | PASS |
| `npm run design:test` | PASS |
| `npm run env:check` | PASS |
| `npm run env:test` | PASS |
| `npm run vendors:check` | PASS |
| `npm run vendors:test` | PASS |
| `npm run distribution:check` | PASS |
| `npm run distribution:test` | PASS |
| `npm run digest:shadow:test` | PASS |
| `npm run candidates:test` | PASS |
| `npm run protocols:check` | PASS |
| `npm run protocols:test` | PASS |
| `npm run protocols:coverage` | PASS |
| `npm run protocols:coverage:test` | PASS |
| `npm run scheduled:check` | PASS |
| `npm run scheduled:test` | PASS |
| `npm run scheduled:outcomes:test` | PASS |
| `npm run models:check` | PASS |
| `npm run models:test` | PASS |
| `npm run claims:check` | PASS |
| `npm run claims:test` | PASS |
| `npm run docs:check` | PASS |
| `npm run docs:test` | PASS |
| `archive/handoff index warning step` | PASS |
| `npm run archive:index:test` | PASS |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS |
| `npm run handoff:test` | PASS |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS |

The check-job's `npm test` ran separately and passed with the API totals above. Root CI's separate disposable-database job could not run without a supplied disposable database. Required production follow-up remains read-only schema/constraint/source aggregation after orchestrator deployment; package publication requires approved published-artifact smoke tests. This receipt does not claim an independent-review GO, production deployment or publication.
