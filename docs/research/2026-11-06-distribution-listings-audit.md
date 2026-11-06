---
doc_type: research
type: product
topic: distribution-listings-audit
question: Which places where agents and developers find Strale still show stale or untrue text after the move to strale.io and the 2026-11-06 npm releases, and what can the repository, a session or only Petter fix?
date: "2026-11-06"
status: current
sources:
  - https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.strale-io/strale
  - https://registry.smithery.ai/servers/strale-io/strale
  - https://registry.smithery.ai/servers/strale/agent-tools
  - https://glama.ai/mcp/servers/strale-io/strale
  - https://glama.ai/mcp/connectors/io.github.strale-io/strale
  - https://402index.io/api/v1/services?q=strale
  - https://402index.io/api/v1/docs.md
  - https://mcp.so/servers/strale
  - https://context7.com/strale-io/strale
  - https://www.pulsemcp.com/submit
  - https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/
  - https://registry.npmjs.org/strale-mcp
  - https://pypi.org/pypi/straleio/json
  - docs/company/claims.yaml
  - docs/programs/brand-website/MESSAGING-LEVELS.md
  - docs/strategy/2026-10-27-platform-and-distribution-adoption.md
  - docs/release/pypi-publishing.md
  - handoff/_general/from-code/2026-11-06-npm-releases.md
  - archive/receipts/2026-11-06-check-strale-mcp-0-2-11-production-smoke.json
  - archive/receipts/2026-11-06-check-npm-four-packages-production-smoke.json
  - archive/receipts/2026-11-06-check-strale-capabilities-0-1-2-production-smoke.json
decisions:
  - DEC-20261105-A
  - DEC-20261027-B
  - DEC-20261027-C
---

# Distribution listings audit, 2026-11-06

Every listing was fetched on the afternoon of 2026-11-06 (Swedish time) with
curl and an honest user agent (`StraleAudit/1.0 (+https://strale.io)`). Where a
site answered with a bot challenge it is marked "not checked": the challenge was
not worked around. "True" means the text passes `docs/company/claims.yaml`
(no typed counts, no quality score or trust layer, no trial amount, no
unqualified framework claim) and `MESSAGING-LEVELS.md` (a library of tools,
paid per call, one connection). The audit is evidence, not authority: it
changes no claim ruling.

## What changed since the listings were written

- **2026-11-05, DEC-20261105-A:** `strale.io` is the main site. On 2026-11-06
  `strale.dev` answers **302**, not the permanent 301 the decision describes
  (checked for `/`, `/docs?x=1`, `www.strale.dev/` and `/audit/abc`; the path
  and query are kept). Every place that still links `strale.dev` works for now.
  The 301 is Petter's (DNS and redirect rule).
- **2026-11-06 releases:** strale-mcp 0.2.11 (also in the official MCP
  registry, `isLatest`), straleio 0.1.4, straleio-langchain 0.1.1,
  n8n-nodes-strale 1.0.0, strale-capabilities 0.1.2.
- **Server, same day:** `serverInfo` 0.2.11, 9 tools, `free_tier_monthly_limit`
  300, 298 visible tools. An unexpanded `Bearer ${STRALE_API_KEY}` or
  `Bearer <STRALE_API_KEY>` header now gets an anonymous result (on 2026-10-29
  it was refused); `Bearer bogus` is still refused.

## Listings

"Fix" says who can fix it: **repo** (changed in this branch), **release** (the
repo is ready or changed here, a package release carries it), **Petter**
(account-side; steps below), **session** (an API route needs no account).

| # | Listing | Live URL | Homepage link shown | Version shown | Text true? | Fix |
|---|---|---|---|---|---|---|
| 1 | Official MCP registry | `registry.modelcontextprotocol.io/v0.1/servers?search=io.github.strale-io/strale` | none: the entry has no `websiteUrl`, only the repository | 0.2.11 `isLatest` (10 versions; 0.1.1 to 0.2.10 stay active) | Latest: yes ("Hundreds of pay-per-call tools for agents: company records, screening, validation, web reading."). Old versions are not: 0.1.x say "Trust and quality infrastructure", "225+ quality-scored capabilities", `strale.dev/signup` | **repo + release:** `websiteUrl` added to both `server.json` copies (takes effect with the next strale-mcp version). Old versions are immutable; `isLatest` is what readers see. The three narrow servers (company-check, eu-vat-check, web-reader) are **not** in the registry: built, not published (T8) |
| 2 | Smithery `strale-io/strale` | `smithery.ai/servers/strale-io/strale` (page answers 404 to curl on 2026-11-06; data from `registry.smithery.ai/servers/strale-io/strale`) | none returned by the API (the 2026-10-30 handoff lists the homepage as an open account-side edit) | none returned | **No.** Description "270+ quality-scored API capabilities ... across 27 countries"; display name `strale`; tool list is an 8-tool snapshot (live has 9: `strale_web3_assurance` missing) whose descriptions carry "SQS quality score" and "270+" | **Petter** (steps A). Account-side: `smithery.yaml` cannot carry these fields (comment added) |
| 3 | Smithery `strale/agent-tools` (duplicate) | `smithery.ai/servers/strale/agent-tools` (same 404; API 200) | none; icon is `google.com/s2/favicons?domain=strale.dev` | none returned | **No.** "verified data capabilities ... independently tested with dual-profile quality scoring ... SQS confidence score"; 8-tool snapshot with 5 "SQS" mentions | **Petter** (steps A). It holds the usage history (T8 baseline: useCount 989 on 2026-10-28), so keep-or-remove is a choice, see A |
| 4 | Glama server page | `glama.ai/mcp/servers/strale-io/strale` | `strale.dev` (README copy, several `strale.dev` links tagged `src=gh-readme`) | not shown | **No.** Title "strale-mcp by strale-io"; description "Trust and quality infrastructure ... 250+ quality-scored capabilities ... dual-profile SQS quality score ... no signup needed"; README is a March snapshot | **Petter** (steps B). `glama.json` only carries maintainers, so the repo cannot change it. The GitHub description and homepage are already current ("New tools for your agent. No new accounts.", `https://strale.io`) |
| 5 | Glama connector page | `glama.ai/mcp/connectors/io.github.strale-io/strale` | `strale.io` | follows the registry (0.2.11) | Yes (registry description; remote `api.strale.io/mcp?src=mcp-registry`) | none. `api.strale.io/.well-known/glama.json` already lists petter@strale.io as maintainer; the badge used by awesome-remote-mcp-servers is served |
| 6 | 402 Index | `402index.io/api/v1/services?q=strale` (168 Strale endpoints) | no homepage field exists | n/a | Yes for the 166 descriptions without counts; two carry a vendor dataset size ("200+ substances", "200+ countries covered by Nager.Date"), true of those datasets. **But:** `domain_verified` is 0 on all 168; provider spelled `strale` (147) and `Strale` (21); 93 legacy `/x402/<slug>` URLs, 3 `/x402/solutions/<slug>` and 72 v2 URLs; source `bazaar` for 163, `self-registered` for 5; last probe 2026-10-31 | **session via API, no account** (steps C), after Petter's yes because the token is a credential |
| 7 | mcp.so | `mcp.so/servers/strale` | `strale.dev` (README copy) | not shown | **No.** Title "Trust And Quality Infrastructure For Ai Agents"; "233+ quality-scored capabilities ... transparent SQS quality score ... web scraping ... EU AI Act support"; "271 paid capabilities" in the tool text; submitted by petterlindstrom79 | **Petter** (steps D): the page shows a "Claim Repository" control that needs a sign-in |
| 8 | PulseMCP | `pulsemcp.com/servers/strale-io-strale` | not checked | not checked | **Not checked:** Cloudflare challenge (403). Its submit page says submissions and edits are paused and that it picks up servers from the official MCP registry, so row 1 is the lever | none possible now |
| 9 | Docker MCP catalogue | `hub.docker.com/mcp/server/strale` | n/a | n/a | Not listed (404). PR `docker/mcp-registry#2202` was open with no review on 2026-10-29; this session cannot read it (repository access not enabled, github.com refused) | **repo:** entry files moved to `strale.io` in `docs/release/directory-submissions/docker-mcp-registry/`; pushing them to the PR branch is a GitHub-account act |
| 10 | Context7 | `context7.com/strale-io/strale` | `strale.dev` and `strale.io` | "Latest" | **No.** "250+ verified capabilities with continuous quality scoring"; indexed docs still show `/v1/quality/eu-vat-validate` | **repo:** `context7.json` folders updated (deprecated Semantic Kernel package out, `packages/langchain` and `packages/n8n-nodes-strale` in; its description was already current). **Petter** to trigger a re-index (steps E) |
| 11 | npm `strale-mcp` | `npmjs.com/package/strale-mcp` | `strale.io?src=npm-readme` | 0.2.11 | Yes (README has 0 `strale.dev`; description has no count) | none |
| 12 | npm `straleio` | `npmjs.com/package/straleio` | `strale.io?src=npm-readme` | 0.1.4 | Yes. Description still says "let AI agents buy capabilities at runtime" (not a ruled claim; the new line is "New tools for your agent. No new accounts.") | optional wording at the next release |
| 13 | npm `straleio-langchain` | `npmjs.com/package/straleio-langchain` | **GitHub repo only** (npm default, none set) | 0.1.1 | **README is empty** ("ERROR: No README data found!", 28 bytes): the package ships no README | **repo + release:** `README.md` written against `src/index.ts`, `homepage` and description set. Needs **0.1.2** to appear on npm |
| 14 | npm `n8n-nodes-strale` | `npmjs.com/package/n8n-nodes-strale` | GitHub package directory | 1.0.0 | Yes ("official registries", three fixed operations, scanner passed) | none; homepage could point at `strale.io` at the next release |
| 15 | npm `strale-capabilities` | `npmjs.com/package/strale-capabilities` | `strale.io?src=npm-readme` | 0.1.2 (catalogue matches production: 298, no differences) | Yes. Keywords `aml`, `gdpr`, `kyb` are regulator-adjacent; no claims row covers keywords | optional |
| 16 | npm `strale-semantic-kernel` | `npmjs.com/package/strale-semantic-kernel` | `strale.dev` | 0.1.4 | Deprecated 2026-11-06 (message present); README still shows "250+", "27 countries", trial amount behind the deprecation banner | none: a new version would be needed to change the README, and the package is withdrawn |
| 17 | PyPI `straleio` | `pypi.org/project/straleio/` | `strale.dev` | **0.1.4** (repo has 0.1.5) | Mostly: no counts; 6 `strale.dev` links | **release:** 0.1.5 + trusted publisher |
| 18 | PyPI `langchain-strale` | `pypi.org/project/langchain-strale/` | `strale.dev` | **0.1.4** (repo has 0.2.0) | **No.** Summary "250+ business capabilities as agent tools"; "All 250+ ... capabilities"; "web scraping" | **release:** 0.2.0 + trusted publisher |
| 19 | PyPI `crewai-strale` | `pypi.org/project/crewai-strale/` | `strale.dev` | **0.1.4** (repo has 0.1.5, frozen) | **No.** Same "250+" text | **release:** 0.1.5 + trusted publisher |
| 20 | PyPI `composio-strale` | `pypi.org/project/composio-strale/` | `strale.dev` | **0.1.4** (repo has 0.1.5, frozen) | **No.** "270+ quality-scored API capabilities" | **release:** 0.1.5 + trusted publisher; the package is **missing from `release-pypi.yml`** (inputs list only langchain-strale, sdk-python, crewai-strale) |
| 21 | PyPI `google-adk-strale`, `openai-agents-strale`, `pydantic-ai-strale` | `pypi.org/project/<name>/` | `strale.dev` | 0.1.1, all files yanked | Yanked with a reason ("package lacked the framework-specific integration its name implies"); old "250+ independently tested" text remains in the page body | none; leave yanked (DEC-20260422-A) |
| 21b | npm `n8n-nodes-strale` 0.1.0 to 0.1.4 | same package page | GitHub | not deprecated | 0.1.4 fails the current n8n scanner (T9 baseline); the old standalone repository `strale-io/n8n-nodes-strale` is not yet archived | **Petter** (step I) |
| 22 | npm `strale-cli`, `strale-ai-sdk` | not published (404) | n/a | n/a | n/a | first publishes wait on Petter (handoff 2026-11-06) |

Row 12's wording and rows 14 to 16 are noted, not fixed: none breaks a claim row.

### Checked and fine

- The repository's own surfaces already name `strale.io`: `smithery.yaml`,
  `glama.json`, both `server.json` copies, `context7.json`, every package README
  and `pyproject.toml`/`package.json` homepage (except
  `straleio-langchain`), and the directory-submission files except the two
  Docker lines fixed here. `npm run claims:check` passes.
- Remote server `https://api.strale.io/mcp`: `initialize` 200 and `serverInfo`
  `strale` 0.2.11; `tools/list` returns 9 tools; a free `iban-validate` call
  with no key and with an empty Bearer returns `price_cents: 0`.
- `strale.io/`, `/llms.txt`, `/docs`, `/signup`, `/tools`, `/apple-touch-icon.png`
  (PNG 180x180) and `/favicon.svg` answer 200. `strale.io/strale.jpg` is 404 (the
  April Docker PR's icon, `strale.dev/strale.jpg`, was an HTML page).

### Not verified

- PulseMCP page (bot challenge).
- Smithery, Glama, mcp.so and npmjs.com web pages beyond what curl returned
  (Smithery pages answer 404 to curl, so its API was used); dashboard layouts
  below are from product documentation and memory of the products, not from a
  signed-in session, and are marked.
- Docker PR #2202 state today (no access to the repository).
- Whether the GitHub environment `pypi-release` exists (the environments API is
  not permitted through this session's proxy).
- Whether 402 Index keeps edits when its Bazaar sync runs again.
- The `client_meta.client_header` of a first paid call through the n8n node
  (the receipt says it needs a funded key in n8n).

## Account-side steps (not performed)

DEC-20261027-C: a session creates no accounts, accepts no terms, signs in
nowhere. Each step below is one click or one paste for Petter.

### A. Smithery: homepage, description, tool list, duplicate

An API route exists: Smithery documents `PATCH /servers/{qualifiedName}` (slash
URL-encoded as `%2F`) with an API key as Bearer token, covering display name,
description, icon and visibility. It needs a Smithery API key, which only an
account holder can create, and the docs page for the body fields could not be
fetched on 2026-11-06, so whether `homepage` is a field is **unverified**. Use
the dashboard:

1. Open <https://smithery.ai> and click **Sign in** (GitHub, as petterlindstrom79).
2. Click your avatar, then **Servers**.
3. Click `strale-io/strale`.
4. Click **Settings** (or **Edit**).
5. Paste into **Display name**: `Strale`.
6. Paste into **Description**: `New tools for your agent. No new accounts. One connection to a growing library of tools agents can pay for per call.`
7. Paste into **Homepage**: `https://strale.io?src=smithery`.
8. Check the upstream URL field reads `https://api.strale.io/mcp?src=smithery`, so Smithery calls stay attributed.
9. Click **Save**, then **Rescan** / **Release** so the tool list refreshes to the live nine (the stored list carries "SQS quality score").
10. Open `strale/agent-tools` and repeat steps 4 to 9. Recommendation: keep both edited until Smithery's counters show which one agents use; then, if the dashboard offers it, click **Unpublish** on the one with the lower use count. Do not delete the 989-use entry first.

### B. Glama server page

1. Open <https://glama.ai/mcp/servers/strale-io/strale> and click **Sign in** (GitHub).
2. Click **Claim** / **Admin** on the page.
3. Click **Sync** / **Refresh from GitHub** so the README and description are re-read (the repo description and README are current).
4. If the description still reads "Trust and quality infrastructure", click **Edit** and paste the Smithery description above.

Unverified: I could not see Glama's admin controls.

### C. 402 Index: verify the domain, then correct the listings (session route, one yes needed)

402 Index documents a domain claim that needs no account and no sign-in
(`/api/v1/docs.md`, `openapi.json`). **Not performed**; it needs one yes from
Petter because the returned `verification_token` is "an ongoing credential" that
must be stored in Bitwarden (`STRALE_402INDEX_CLAIM_TOKEN`) by Petter or the PC
session, and the token file has to be served from `api.strale.io` (a small
route plus a deploy by PR):

1. `POST https://402index.io/api/v1/claim` with `{"domain":"api.strale.io","contact_email":"petter@strale.io"}` returns a `verification_token` and the `verification_url` where a token file must be placed.
2. Serve that file from `api.strale.io` (repo change, PR, deploy, check the URL answers 200 with the file).
3. `POST https://402index.io/api/v1/claim/verify` with `{"domain":"api.strale.io"}` (72-hour window).
4. `PATCH https://402index.io/api/v1/services/{id}` with `domain` and `verification_token` for each Strale service id (list: `GET /api/v1/services?q=strale`): correct provider spelling, names; `DELETE` or bulk-delete (max 25) the legacy `/x402/<slug>` duplicates only if Petter says the v1 paths are retired.

If a click-path is preferred, none is documented; the API is the only route.

### D. mcp.so

1. Open <https://mcp.so/servers/strale> and click **Sign In** (top right).
2. Click **Claim Repository**.
3. Click **Edit**, paste the Smithery description, replace the README text with a link to `https://strale.io`, and click **Save**.

Unverified: the edit controls are behind the sign-in.

### E. Context7

1. Open <https://context7.com/strale-io/strale> and click **Sign in**.
2. Click **Refresh** (or **Update**) on the project. `context7.json` in `main` is current, including the public key.

Unverified: I could not see the control.

### F. PyPI trusted publishers (straleio, langchain-strale, crewai-strale, composio-strale)

Per `docs/release/pypi-publishing.md`; only a signed-in owner can add them.

0. Open <https://github.com/strale-io/strale/settings/environments> and check `pypi-release` is listed; if not, do step 1 of `pypi-publishing.md`.
1. Open <https://pypi.org/manage/project/straleio/settings/publishing/> and sign in with two-factor.
2. Click the **GitHub** tab under **Add a new publisher**.
3. Enter Owner `strale-io`, Repository `strale`, Workflow `release-pypi.yml`, Environment `pypi-release`.
4. Click **Add**.
5. Repeat 1 to 4 for `langchain-strale`, `crewai-strale` and `composio-strale` (replace the project name in the address).

`composio-strale` also needs `release-pypi.yml` to list it; a session does that
once the publisher exists.

### G. n8n Creator Portal

n8n's guide: sign up or log in to the Creator Portal and submit; reviews take up
to four weeks; the package must be published from GitHub Actions with provenance
(it was).

1. Open <https://creators.n8n.io/nodes> and click **Sign in**.
2. Click **Submit a node**.
3. Paste the fields from `docs/company/drafts/distribution/05-n8n-creator-portal-submission.md` and click **Submit**.

### H. strale.dev redirect

1. Open the Cloudflare dashboard, click the `strale.dev` zone, then **Rules**, then **Redirect Rules**.
2. Click **Edit** on the rule that sends to `strale.io`, change the status code from 302 to **301**, and click **Save**.

Unverified: the rule's name and place in the dashboard.

### I. n8n 0.1.x deprecation and the old repository

The npm registry shows 0.1.0 to 0.1.4 of `n8n-nodes-strale` without a
deprecation notice. Deprecating needs a signed-in npm session (as on
2026-11-06, a PC job with Petter signed in). The old repository
`strale-io/n8n-nodes-strale` is archived in GitHub:

1. Open `https://github.com/strale-io/n8n-nodes-strale/settings` and scroll to **Danger Zone**.
2. Click **Archive this repository**.
3. Type the repository name and click **I understand, archive this repository**.

Do it after the Creator Portal submission is accepted, so reviewers do not find
an archived source repository first.

## What the publish grant lets a session do

DEC-20261027-B §9 item 7 approves "one-way package and registry publishes" for
the plan: new npm packages, official MCP registry entries, an n8n major release,
a `langchain-strale` refresh and "package releases that add the client header",
each passing the Distribution PR Integrity Protocol and the production smoke
test, reported afterwards. Item 3 approves integration listings on Zapier and
n8n, with copy checked against `claims.yaml`. DEC-20261027-C keeps accounts,
terms and sign-ins with Petter.

| Submission | A session may? | Reason |
|---|---|---|
| Official MCP registry, new strale-mcp version with `websiteUrl` | Yes | Named class (registry entries); the registry publish is automated from a release; report after |
| Official MCP registry, the three narrow servers | Yes, but blocked | Named class; the dispatch of `publish-mcp-entry-points.yml` returns 403 for a session (T8) |
| npm `straleio-langchain` 0.1.2 (README, homepage) | Ask first | A metadata-only release is not named in the grant; Petter approved the 2026-11-06 releases one by one |
| PyPI releases (straleio, langchain-strale, crewai-strale, composio-strale) | Yes after F | `langchain-strale` refresh is named; the others are the same class, but no trusted publisher exists yet |
| n8n Creator Portal | No | Needs a Creator Portal account and sign-in (DEC-20261027-C), though item 3 approves the listing itself |
| 402 Index domain claim and edits | Ask first | Not a one-way act and needs no account, but it stores a credential and deploys a route; not named in the grant |
| awesome-remote-mcp-servers PR, Docker PR #2202 update, Cline issue | Not as set up | Removable, so not caught by the one-way reservation; but each is a public act under a GitHub account (the Docker PR belongs to petterlindstrom79, awesome-remote needs the account to star the repository, the Cline form needs a Cline install test no session can tick) and this session has no access to repositories outside `strale-io` |
| Cursor plugin form | No | Needs a Cursor account (DEC-20261027-C) |
| Smithery, Glama, mcp.so, Context7 edits | No | Sign-in required |
