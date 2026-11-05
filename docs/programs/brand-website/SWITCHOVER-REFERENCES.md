# strale.dev references: switch-over inventory

Written 2026-11-05 for DEC-20261105-A (strale.io is the main site; strale.dev 301s to it).
Branch `feat/switchover-strale-io-references` carries every session-side change, so switch-over
day is "merge one PR" (SWITCH-OVER-READINESS items 9 and 11). Counts are occurrences from
`git grep -n "strale\.dev"` on `origin/main` (790 in 330 files) and on the branch (512 remain).

Classes: **(a)** changed to strale.io in this branch; **(b)** deliberately kept; **(c)** needs Petter
or lives outside the repo.

## (a) Changed in this branch (278 occurrences, 120 files)

| Path | Count | Note |
|---|---|---|
| `apps/api/src/routes/welcome.ts` | 29 | docs/signup/pricing links, redirect map, sitemap; tagline switched to L1 |
| `apps/api/src/lib/activation-emails.ts`, `welcome-email.ts`, `conversion-emails.ts`, `email-templates.ts` | 20 | transactional email links and sign-offs |
| `apps/api/src/routes/a2a.ts`, `ai-catalog.ts`, `llms-txt.ts`, `mcp-server-card.ts`, `skill.ts`, `openapi.ts` | 24 | cards, docs links; old headline switched to "New tools for your agent. No new accounts." (readiness row 9) |
| `apps/api/src/routes/oauth.ts`, `lib/oauth.ts`, `auth.ts`, `do.ts`, `lib/do/upgrade.ts`, `lib/errors.ts`, `lib/free-tier-allowance.ts` | 13 | error fix/docs_url, sign-up links, OAuth metadata, connector sign-up link |
| `apps/api/src/routes/verify.ts`, `transactions.ts`, `audit.ts`, `dispute.ts`, `lib/audit-token.ts` | 9 | methodology_url, audit URLs, hard-coded fallbacks |
| `apps/api/src/routes/x402-gateway-v2.ts` | 1 | Bazaar `iconUrl` |
| `apps/api/src/web3-assurance/methodology.ts`, `lib/daily-digest/{analyze,fetch-traffic,render-email}.ts` | 4 | docs link, digest copy and dashboard link |
| `apps/api/src/app.ts` | +2 added | CORS list gains `strale.io` and `www.strale.io`; the strale.dev entries stay (b) |
| `apps/api/src` tests, snapshots, `test-env-setup.ts`, `test-support/crash-child.ts` | 26 | `FRONTEND_URL` fallbacks and assertions of the changed strings; intent unchanged |
| `.github/workflows/ci.yml`, `weekly-drift.yml` | 3 | `FRONTEND_URL` env |
| `config/env-manifest.yaml` | 1 | example value (regenerates `.env.example`) |
| `packages/*` READMEs, `package.json`, `pyproject.toml`, `plugin.json`, `llms-install.md`, DEPRECATED.md, `cli/src/main.ts`, `composio-strale/toolkit.py`, `mcp-server/src/tools.ts` | 105 | metadata, links, user-facing strings. The sign-up matcher in `tools.ts` still accepts both domains. |
| `manifests/*.yaml` (11 files) | 17 | example and health-check URLs |
| `examples/`, `README.md`, `smithery.yaml`, `docs/claude-connector*.md`, `docs/claude-md-snippet.md`, `docs/api-quickstart.md`, `docs/ide-rules/*` | 40 | listing and example text |
| `apps/web/src/pages/terms.astro` | 2 | link text "strale.dev/capabilities" becomes "strale.io/tools" (DQ-45); "strale.dev/pricing" becomes "strale.io/pricing" (same class, no decision needed) |

`server.json`, `glama.json` and `context7.json` carry no strale.dev text today.

Link paths: every strale.io link points at a page the new site has (`/tools`, `/security`, `/topup`, `/docs`, `/docs/api`). The API's `/changelog` redirect and sitemap entry now point at `/docs` because the new site has no changelog page.

## (b) Deliberately kept

| Path | Count | Note |
|---|---|---|
| Outbound User-Agent URLs: `lib/site-access.ts`, `capabilities/*.ts`, `lib/brreg-fetch.ts`, `lib/daily-digest/fetch-ecosystem.ts`, `scripts/production-watch/watch.mjs` | about 25 | still resolve through the 301 (decision doc) |
| `manifests/{meta-extract,url-to-text}.yaml` | 9 | example outputs carry the old site's title and copy; revert to strale.dev, re-record after the switch |
| `apps/api/src/routes/dispute.ts` `/admin/disputes` fallback | 1 | internal link; `ADMIN_DASHBOARD_URL` overrides it, and it was swapped to strale.io with the rest |
| `apps/api/src/app.ts` CORS entries | 2 | strale.dev origins stay allowed during the transition |
| `apps/api/src/lib/signup-source.ts`, `internal-accounts.ts`, `daily-digest/fetch-platform.ts` | 3 | own-host and own-mailbox matching: both domains must count |
| Replay fixtures `apps/api/src/capabilities/__fixtures__/**`, `cert-transparency-search*`, `db/seed-tests.ts`, `db/backfill-synthetic-examples.ts`, `scripts/verify-new-capabilities.ts` | about 70 | recorded against live strale.dev; `upstream-replay-contract.test.ts` pins manifest inputs to them |
| `manifests/{base64-encode-url,og-image-check,page-exists,website-carbon-estimate}.yaml` | 17 | known_answer inputs are bound to recorded fixtures; change with a re-recording |
| `manifests/{sitemap-parse,robots-txt-parse,cert-transparency-search}.yaml` | 29 | expected values are strale.dev's live sitemap, robots and certificates |
| Code comments citing "strale.dev surfacing per DEC-20260503-A" and similar | about 20 | decision names, not URLs |
| `config/*.schema.json` `$id` | 3 | identifiers, not fetched |
| `packages/mcp-server/tests/tools.test.mjs`, `tools.ts` comment | 3 | assert the matcher accepts both domains |
| Tests that assert strale.dev behaviour (`signup-source.test.ts`, `quality-floor.test.ts`) | 3 | both domains must keep working |
| `apps/web` `_redirects`, tests and comments that name strale.dev | 10 | the redirect rules and their tests must name it |
| `docs/strategy`, `docs/decisions`, `docs/research`, `docs/programs` (other files), `docs/release`, `docs/operations`, `docs/company`, `docs/audits`, `docs/remediation`, `docs/project`, `design/`, `CLAUDE.md` | about 150 | dated records, programme text, canonical-domain docs |
| `archive/`, `handoff/` | about 200 | historical, never edited |
| `apps/api/audit-*.txt/json`, `railway-config.md`, `coverage-matrix/schema.json` | 10 | generated or historical |

## (c) Needs Petter or lives outside the repo

1. Railway: `FRONTEND_URL` to `https://strale.io`; confirm `AUDIT_FRONTEND_URL` is unset (else set it to strale.io too).
2. Cloudflare: zone move, Pages domains, strale.dev redirect rule (path and query preserved), Search Console change of address.
3. Registry listings outside the repo: Smithery, Glama, Context7, the official MCP registry, the Claude connector directory, npm and PyPI project pages (they refresh only on release).
4. The sibling `strale-frontend` `llms.txt` and its own references (kept in maintenance, DEC-20260902-A).
5. After the switch: re-record the four fixture-bound manifests and re-point the three content-bound ones at strale.io.

## Packages that need a release after merge

Version bumps are deliberately not in this branch. Publishing refreshes the registry pages.

- npm: `strale-mcp`, `straleio` (sdk-typescript), `strale-cli`, `strale-semantic-kernel`, `strale-capabilities`, `strale-ai-sdk`, `n8n-nodes-strale`
- Plugin and skill listings (no npm package): `packages/cursor-plugin`, `packages/skill`
- PyPI: `straleio` (sdk-python), `langchain-strale`, `crewai-strale`, `composio-strale`
- Deprecated, metadata only, no release: `google-adk-strale`, `openai-agents-strale`, `pydantic-ai-strale`

Each release follows the Distribution PR Integrity Protocol, including the production contract smoke test.
