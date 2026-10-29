# Directory submissions prepared 2026-10-29 (distribution T12)

Four client catalogues where an install happens inside the tool a builder
already uses. Each submission below is **prepared, not opened**: this cloud
session has no access to repositories outside `strale-io`, and Cursor's form
needs a signed-in account. Whoever opens them needs a GitHub account (Docker,
Cline, awesome-remote-mcp-servers) and a Cursor account (Cursor).

Source: `docs/research/2026-10-27-distribution-strategy.md` §8 (housekeeping)
and `docs/research/2026-10-27-distribution-strategy-sweeps/directories.md`
§12–16. Register rows: `docs/operations/distribution-registry.yaml`
(`docker-mcp-registry-pr`, `cline-marketplace-submission`,
`awesome-remote-mcp-servers-pr`, `cursor-plugin-submission`).

## What production serves today (checked 2026-10-29)

Every submission references only these. Each was checked with a live request.

| Item | Check | Result |
| --- | --- | --- |
| Remote MCP server `https://api.strale.io/mcp` | `initialize` | 200, `serverInfo` `strale` 0.2.9 |
| Its tools | `tools/list` | 9 tools, each with a `title` and annotations: `strale_ping`, `strale_getting_started`, `strale_execute`, `strale_search`, `strale_balance`, `strale_methodology`, `strale_trust_profile`, `strale_transaction`, `strale_web3_assurance` |
| A free call without a key | `tools/call strale_execute iban-validate` with no header, and with `Authorization: Bearer ` (empty) | valid result, `price_cents: 0` |
| A placeholder key | the same call with `Authorization: Bearer ${STRALE_API_KEY}` (unexpanded) or `Bearer bogus` | refused: `Invalid API key format` |
| npm `strale-mcp` | `npx -y strale-mcp@0.2.9` over stdio: initialize, tools/list, free call with `STRALE_API_KEY` empty | works; stderr `Loaded 297 capabilities, 96 solutions, 297 cap trust, 96 sol trust` |
| `https://strale.dev/signup`, `/docs` | GET | 200 |
| `https://strale.dev/apple-touch-icon.png` | GET | 200, PNG 180×180 |
| `https://strale.dev/strale.jpg` (used by the April Docker PR) | GET | 200 but `text/html`: the site's fallback page, not an image |
| Glama connector `io.github.strale-io/strale` | GET page and `badges/score.svg` | 200, 200 `image/svg+xml` |
| Free allowance | `GET /v1/platform/facts` → `static.free_tier_monthly_limit` | 300 |

The placeholder finding shapes two submissions: an unexpanded `${VAR}` header
turns an anonymous caller into a refused one. The Cursor plugin therefore
ships without a header, and the Docker entry marks the key optional so the
gateway can omit it. If the server treated a `Bearer ${...}` or `Bearer <...>`
value as no key, both could carry the header by default; that is an auth-path
change for a separate batch, not this one.

Copy for every submission was checked against `docs/company/claims.yaml`: no
counts of tools, countries or catalogue size, no trial-credit amount, no
quality score or "trust layer" wording, no "sign in", no "native" framework
claim.

## Recommended order

1. **awesome-remote-mcp-servers.** Smallest change (three README lines), CI
   checks the endpoint and badge automatically, and an agent fast-track
   exists. Both preconditions (public endpoint, Glama connector) hold today.
2. **Docker MCP registry.** Update the open PR #2202 rather than open a new
   one. It has waited since April with no review, and its current files carry
   retired claims and a broken icon, so fixing it is worth doing whether or
   not it gets merged soon.
3. **Cursor plugin.** Reaches the most builders of the four, but needs this
   PR merged first (the plugin lives in this repo), a local install test in
   Cursor, and a manual review with a backlog.
4. **Cline marketplace.** Reviewed slowly (newest addition 2026-03-27) and
   applies "increased scrutiny" to financial and crypto tools. Needs a local
   Cline install test that only a person can tick.

---

## 1. punkpeye/awesome-remote-mcp-servers

**Target:** `https://github.com/punkpeye/awesome-remote-mcp-servers`, PR
against `main`.

**Rules (read from `CONTRIBUTING.md`, 2026-10-29):**

- remote servers only, public URL that answers MCP `initialize` (CI checks);
- usable by anyone (public sign-up is fine);
- must be listed as a Glama connector, and the entry carries its badge (CI
  checks the connector exists);
- three-line entry: name linked to homepage (not a GitHub repo), endpoint in
  backticks, badge on line two, auth marker then ` - ` then one sentence
  ending in a period, at most 120 characters;
- alphabetical within the category, case-insensitive;
- **the account opening the PR must have starred the repository**;
- agent PRs may add `🤖🤖🤖` to the end of the title for a fast track.

**Diff** (category *Aggregators*, between `Store API` and `Superpowers`,
README line 236 at commit cloned 2026-10-29):

```diff
 - [Store API](https://store-api.com/mcp-guide) `https://store-api.com/mcp`
   [![Store API MCP connector](https://glama.ai/mcp/connectors/com.store-api/store-api/badges/score.svg)](https://glama.ai/mcp/connectors/com.store-api/store-api)
   🔓 - Ask 58 models, including GPT, Claude and Gemini, and generate images; calls need a prepaid key.
+- [Strale](https://strale.dev?utm_source=awesome-remote-mcp-servers&utm_medium=listing&utm_campaign=distribution-t12) `https://api.strale.io/mcp?src=awesome-remote`
+  [![Strale MCP connector](https://glama.ai/mcp/connectors/io.github.strale-io/strale/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.strale-io/strale)
+  🔓 - Company records, EU VAT checks, sanctions and PEP screening, validators and web page reading; free tools need no key.
 - [Superpowers](https://superpowers.tools) `https://superpowers.tools/mcp`
```

The sentence is 117 characters. 🔓 because `initialize`, search and the free
tools need no authentication (the CI's auth detection will see the same);
neighbours with paid calls use 🔓 and say so in the sentence.

**PR title:** `Add Strale 🤖🤖🤖`

**PR body:**

> Adds Strale, a hosted MCP server with pay-per-call tools for agents:
> company records from official registries, EU VAT checks, sanctions and PEP
> screening, validators and web page reading. Search and the free tools work
> without a key; paid tools take an API key as a Bearer header. Listed on
> Glama as `io.github.strale-io/strale`.

**DEC-20260422-A pre-flight:**

1. Imports resolve: no code or imports in the entry. The endpoint answers
   `initialize` and `tools/list` (table above). **Pass.**
2. Approved package: no package referenced; the hosted server only. **Pass.**
3. Description matches the code: company records (`*-company-data` tools),
   VAT (`vat-validate`), sanctions/PEP (`sanctions-check`, `pep-check`),
   validators (`iban-validate` etc.) and web page reading (`url-to-markdown`)
   are all reachable through `strale_search` and `strale_execute`. **Pass.**
4. Neighbours: matches `Store API` and `Superpowers` (one key-based
   aggregator sentence, no counts). **Pass.**

---

## 2. docker/mcp-registry (update PR #2202)

**Target:** `https://github.com/docker/mcp-registry/pull/2202` ("Add Strale
(remote MCP server)", opened 2026-04-01 by `petterlindstrom79`, head commit
`56e0556`). State on 2026-10-29: **open, no reviews**; only the author's two
follow-up comments (2026-04-03, 2026-04-07).

**Why update rather than open a new PR:** a second PR for the same server
would be a duplicate. The open one needs fixing anyway:

- `about.icon` points at `https://strale.dev/strale.jpg`, which returns the
  site's HTML fallback page; Docker's validator (`cmd/validate isIconValid`)
  decodes the image and fails on HTML;
- `tools.json` is missing, which `CONTRIBUTING.md` lists as required for
  remote servers;
- `readme.md` claims "27 countries", "€2.00 trial credits" and "quality
  scores", which `claims.yaml` forbids or holds for evidence
  (`static-distribution-counts`, `trial-credit-amount`,
  `retired-distribution-framing`).

**Rules (read from `CONTRIBUTING.md`, 2026-10-29):** remote servers need
`servers/<name>/server.yaml`, `tools.json` (always `[]` for remote) and
`readme.md` (documentation link); no Dockerfile; MIT or Apache licence
preferred; every PR is reviewed by the Docker team, and test credentials go
through their form (`https://forms.gle/6Lw3nsvu2d6nFg8e6`); title has every
word capitalised and no "MCP" or "Server"; YAML must pass `prettier`;
commits are squashed into the PR title on merge.

**Exact files** (in this folder, copy as-is):
`docker-mcp-registry/servers/strale/server.yaml`,
`docker-mcp-registry/servers/strale/tools.json`,
`docker-mcp-registry/servers/strale/readme.md`. Checked here: `server.yaml`
passes `prettier --check` (3.3.3); icon is a 180×180 PNG (under the 512×512
limit); `required: false` on the secret follows `servers/context7`, the
existing entry with an optional key.

**Steps for whoever holds the fork** (`petterlindstrom79/mcp-registry`, the
PR's head branch):

1. Merge `docker/mcp-registry` `main` into the PR branch (the branch is from
   April).
2. Replace `servers/strale/server.yaml` and `servers/strale/readme.md`, add
   `servers/strale/tools.json`, commit "Strale: update entry to current
   server", push.
3. Optionally test with `task catalog -- strale` and
   `docker mcp catalog import $PWD/catalogs/strale/catalog.yaml` in Docker
   Desktop: enable it without a key, call `strale_search`; then with a key.
4. Comment once on the PR:

> Updated the entry: current description, a working PNG icon, and the
> `tools.json` the contributing guide asks for. The API key is optional;
> search and the free tools work without one. Happy to share a test key
> through your form if that helps review.

**DEC-20260422-A pre-flight:**

1. Imports resolve: none. Endpoint and the three tool names in the files
   are live. **Pass.**
2. Approved package: none referenced. **Pass.**
3. Description matches: as for awesome-remote above. **Pass.**
4. Neighbours: matches `servers/apify` (Bearer header) and
   `servers/context7` (optional key, one-line `readme.md`). **Pass.**

---

## 3. Cursor plugin (marketplace submission)

**Target:** `cursor.com/marketplace/publish` (form, needs a Cursor account).
The plugin source is in this repository: `packages/cursor-plugin/`.

**Rules (read from Cursor's plugin docs and `cursor/plugin-template`,
2026-10-29):** a plugin is a Git repository with
`.cursor-plugin/plugin.json` (only `name` is required; kebab-case), optional
`rules/*.mdc` (frontmatter with `description`), `skills/`, and `mcp.json`
for MCP servers; logos committed and referenced by relative path; all
plugins must be open source; every plugin and every update is reviewed by
hand. The template's checklist also asks that `node
scripts/validate-template.mjs` passes and names Cursor's Slack or
`kniparko@anysphere.com` as the submission contact besides the form.

**What is in `packages/cursor-plugin/`:**

- `.cursor-plugin/plugin.json`: validated against Cursor's own
  `schemas/plugin.schema.json` (from `cursor/plugins`) with `jsonschema`:
  valid;
- `mcp.json`: one `http` server, `https://api.strale.io/mcp?src=cursor`, no
  header (see the placeholder finding above), same shape as
  `third_party/quickbooks-online` in `cursor/plugins`;
- `rules/strale-tools.mdc`: when to search for a Strale tool, how to read
  `provenance`, and three don'ts (regex-only IBAN/VAT "validation",
  screening results presented as decisions, keys in source);
- `assets/logo.png` (400×400, the production favicon mark from
  `strale.dev/favicon.svg`) and `assets/logo.svg`;
- `README.md`, `LICENSE` (MIT, Moonlighter AB).

Not run: the template's `validate-template.mjs` (external code; this session
does not execute it). The submitter should run it once from a checkout of
the template against a copy of the folder, and install the plugin locally
(`~/.cursor/plugins/local/strale`, then **Developer: Reload Window**) to see
the rule and the server under **Customize**.

**Open question for the submitter:** Cursor's examples put the plugin at a
repository root (single plugin) or list it from a root
`.cursor-plugin/marketplace.json`. This repository's root is fixed by
CLAUDE.md, so the form gets
`https://github.com/strale-io/strale/tree/main/packages/cursor-plugin`. If
Cursor's review needs a root-level plugin, the fallback is a separate public
repository `strale-io/strale-cursor-plugin` with these files at its root
(creating it is a founder action).

**Form text:**

- Name: Strale
- Repository: `https://github.com/strale-io/strale/tree/main/packages/cursor-plugin`
- Description: Pay-per-call tools for agents: company records, EU VAT
  checks, sanctions and PEP screening, validation and web page reading.
  Search and the free tools work without a key.
- Category: Integrations

**DEC-20260422-A pre-flight:**

1. Imports resolve: no code; every tool named in the rule and README is in
   today's `tools/list`. **Pass.**
2. Approved package: none; the plugin uses the hosted server. **Pass.**
3. Description matches: the plugin adds exactly one MCP server and one
   rule, which is what the README and manifest say. **Pass.**
4. Neighbours: matches `third_party/brex` and `third_party/hubspot`
   manifests (displayName, short description, `category: integrations`,
   `mcpServers: ./mcp.json`). **Pass.**

---

## 4. cline/mcp-marketplace

**Target:** `https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml`
(an issue, not a PR).

**Rules (read from `README.md` and the issue template, 2026-10-29):** GitHub
repository URL (nested links allowed); a 400×400 PNG logo; two required
checkboxes: *"I have tested that Cline can successfully set up this server
using only the README.md and/or llms-install.md file"* and *"The server is
stable and ready for public use"*. Review weighs community adoption,
maintainer credibility, maturity, and applies "increased scrutiny" to
financial services and extra verification to crypto-related tools.

**Prepared here:**

- `packages/mcp-server/llms-install.md`: remote setup for Cline with
  `?src=cline`, a free test call, and how to add a key only when the user
  gives one; stdio fallback with `npx -y strale-mcp`. Both paths were run
  today (remote with no key, stdio with an empty key).
- Logo: `packages/cursor-plugin/assets/logo.png` (400×400). After this PR
  merges it is at
  `https://raw.githubusercontent.com/strale-io/strale/main/packages/cursor-plugin/assets/logo.png`;
  or drag the file into the issue.

**Issue fields:**

- Title: `[Server Submission]: Strale`
- GitHub Repository URL: `https://github.com/strale-io/strale/tree/main/packages/mcp-server`
- Logo Image: the URL above, or the attached file.
- Installation Testing: tick both **only after** opening a fresh Cline,
  pasting the repository URL, and watching it set the server up from
  `llms-install.md`. This session cannot run Cline, so that box is not
  ticked by it.
- Additional Information:

> Strale is a hosted MCP server (`https://api.strale.io/mcp`) with
> pay-per-call tools for agents: company records from official registries,
> EU VAT checks, sanctions and PEP screening, validators and web page
> reading. No install is needed; `llms-install.md` gives Cline the remote
> configuration and a free test call. Search and the free tools work
> without a key; paid tools take an API key as a Bearer header. A local
> stdio option is published on npm as `strale-mcp`. Maintained by
> Moonlighter AB (Sweden).

**DEC-20260422-A pre-flight:**

1. Imports resolve: `npx -y strale-mcp@0.2.9` runs and answers; the remote
   config in `llms-install.md` answers. **Pass.**
2. Approved package: `strale-mcp`, added to the approved list in
   `docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md` today on the
   strength of that smoke test. **Pass.**
3. Description matches: as above. **Pass.**
4. Neighbours: the form has no free-text neighbours to match; the text
   follows the README's own example ("briefly explain"). **Pass.**
