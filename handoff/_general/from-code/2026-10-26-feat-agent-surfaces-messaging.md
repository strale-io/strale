Intent: Retire API agent-facing trust/score framing and serve live-facts SKILL.md; build, verify and commit locally for orchestrator review and shipping.

Implemented:

- Narrowed llms.txt/full, welcome JSON/Markdown, AI catalog, MCP card, OpenAPI info/tag copy, legacy x402 challenge, and company-intelligence-sdr seed long description. Used adopted L1/L2 descriptions; removed blanket testing claims, fixed coverage and unsupported assurance promotion from llms.txt. The MCP card now consumes platform facts for both counts. Preserved existing protocol/wire keys.
- Added public GET /SKILL.md and /.well-known/skill.md with name/description front matter and triggers, API-key/free/x402 auth, /v1/do fields, discovery and pricing. Markdown Content-Type, five-minute renderer cache, one-hour public cache and stale-good fallback match llms.txt. Added public CORS/rate limiting and discovery links where lists already exist (llms.txt and welcome JSON).
- Added integer-or-null price_floor_cents to platform facts, using active/visible, non-free tools with positive prices. Free-tier facts now reuse getFreeTierSlugs() so advertisements use canonical serving eligibility. Shared the unchanged MIN_TOPUP_CENTS constant between wallet validation and the skill renderer. Trial amount comes from TRIAL_CREDITS_CENTS, with eligibility qualification.
- No packages files edited, no production writes/settings changes, no credentials sought, no push/PR/merge/publish. Already isolated clone and branch supplied by orchestrator; no branch switching or extra worktree.

Verification:

- Final Vitest command (from apps/api): npx vitest run src/routes/agent-surfaces.test.ts src/routes/public-surface-visibility.test.ts src/lib/x402-gateway.test.ts src/routes/wallet.test.ts src/lib/platform-facts.test.ts src/lib/platform-facts-live.test.ts src/lib/free-tier.test.ts --reporter=json --outputFile=/tmp/surfaces-vitest.json — PASS. Evidence: archive/receipts/2026-10-26-test-run-agent-surfaces-messaging.json.
- Initial targeted run failed because the updated visibility harness captured raw execute queries together with select predicates. Separated the captures and reran successfully. No unresolved test failure.
- npm --workspace=packages/mcp-server run build — PASS (build only, no tracked package edits).
- cd apps/api && npx tsc --noEmit — PASS.
- npm run claims:check — PASS before and after; zero reported forbidden hits in either run, equal. The register's sqs-quality-score-trust-layer row is forbidden; no exact rows match the other retired phrases. Its scanner covers README/package README/manifests/platform-facts, not the updated route templates; new surface tests explicitly reject retired phrases in rendered responses.
- npm run models:check, env:check, docs:check, programs:check, receipts:check — PASS.
- npx tsx apps/api/scripts/check-platform-facts-drift.ts — PASS: scanned four configured backend surfaces, no drift; sibling frontend absent and skipped. New skill template has its own guard against literal digit counts and euro prices.
- git diff --check — PASS.
- npm run handoff:orient — completed. Exact founder-assigned scope takes precedence over unrelated active program pointers.
- Independent technical and product reviews: GO after two rounds; archive/sessions/2026-10-26-agent-surfaces-messaging-review.md. No remaining high/medium findings. go skill applied locally; simplify skill unavailable, manual simplification pass completed. Exact-commit review/PR/merge belongs to orchestrator.

Packages carrying search matches (unchanged; schedule separately under distribution protocol):

- packages/skill/SKILL.md — stale quality-scored copy, fixed capability count, SQS instructions.
- packages/composio-strale/README.md — quality-scored opening.
- packages/mcp-server/server.json — independently tested claim.
- packages/mcp-server/src/tools.ts — independently tested onboarding copy; also historical retirement explanations.
- packages/sdk-typescript/src/types.ts — trust-layer/quality-score metadata comment.
- packages/strale-capabilities/README.md and packages/mcp-server/README.md — neutral historical SQS retirement explanations, not positive scoring claims.

Production follow-up (orchestrator only):

1. Review, push, PR, merge and deploy through normal gates. No migration or environment variable is required.
2. Apply this bounded persisted-copy correction through the approved production-authority path; do not run broad seed-solutions reseeding:

```sql
UPDATE solutions
SET long_description = replace(long_description, ' Every data point is quality-scored and sourced.', '')
WHERE slug = 'company-intelligence-sdr'
  AND long_description LIKE '% Every data point is quality-scored and sourced.%'
RETURNING slug, long_description;
```

3. After deploy check GET /SKILL.md and /.well-known/skill.md for 200, Markdown headers and matching facts; check /llms.txt, /llms-full.txt, /, /api (JSON and Markdown), /.well-known/ai-catalog.json, /.well-known/mcp.json and /openapi.json for retired phrases. Inspect /v1/solutions/company-intelligence-sdr long_description after the bounded correction. Verify an eligible unpaid x402 challenge has the new description without executing or paying for a tool.
4. Coordinate website/sibling frontend llms.txt and package updates separately; this clone contains neither sibling frontend nor package authorization.

Limitations:

- No authenticated or paid live execution, production database query/update, or deployed new endpoint verification. Runtime route/cache behavior was verified with mocked facts and local tests.
- Existing unrelated internal/admin/email SQS retirement references and explanatory code comments are retained. Amazon SQS skill names and honest output limitations are not marketing framing.
- The session handoff gate will report the lack of a pushed branch under this local-only assignment; pushing is explicitly forbidden. The orchestrator completes that obligation.
- [BACKFILL] Journal entry: no Notion tools available; this handoff records the session for orchestrator backfill. No Notion/Linear mutations attempted. No new decisions or supersessions; copy narrows existing claims. External spend: none.

Read-only production baseline (before this change is deployed):

- /llms.txt: HTTP 200; opening still says “Verified data your agent can trust. 298+ independently tested data capabilities across 25 countries.”
- /SKILL.md and /.well-known/skill.md: HTTP 404.
- /.well-known/mcp.json: HTTP 200; old description advertises 298 independently tested/scored capabilities and hardcoded 27 countries.
- /.well-known/ai-catalog.json: HTTP 200; publisher description still says “Verified data your agent can trust.”
- /openapi.json: HTTP 200; old trust-layer description still hardcodes 250+ and 27 countries.
- /v1/platform/facts: HTTP 200; active_visible 298; company_data_active_iso contains 25 countries. These are observations, not template literals.

Additional gate results:

- npm run context:generate — REFUSED: its isolation guard treats this orchestrator-supplied independent clone as a shared primary worktree. Did not change topology, switch branches or bypass the guard. The standard pre-commit hook regenerates staged archive/handoff indexes and the inventory itself.
- npm run context:check — PASS before staging.
- npm run handoff:check before commit — failed on dirty files, clone classified as trunk on a feature branch, and no own upstream. Commit resolves dirty state; trunk classification and pushing cannot be fixed within the supplied clone/no-switch/no-push constraints. These are environment/assignment limitations, not passing gates.

Commit blocker (final):

- git add and git commit both failed with “Unable to create .../.git/index.lock: Read-only file system”. This environment grants read-only access to .git; no approval/escalation is available. Nothing was staged or committed, and pre-commit hooks could not run.
- Therefore the standard hook did not regenerate the staged indexes/inventory. The orchestrator must stage, run the standard pre-commit hook, commit and perform its normal checks in its writable checkout.
- Full tracked and new-file change preserved in /tmp/agent-surfaces-messaging.patch. The original working tree also retains all changes. No push, PR or merge was attempted.
