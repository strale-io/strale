# Distribution surfaces register

M3 batch 3 (T6). This document explains
`docs/operations/distribution-registry.yaml`, the sources it was populated
from, its check, and the social-media-post tracking decision this batch
was also asked to make.

## What this is, and what it is not

`docs/operations/distribution-registry.yaml` is a shadow register:
`authority_active: false` and stays false until the founder-gated M4
cutover. The Notion Distribution Registry (Notion page
`32e67c87-082c-81de-861f-dcc53576304c`) stays the authority for
distribution status until then. This register exists so a repo-native
reader can be shadow-compared against it in the meantime, the same shape
the vendor register (`config/vendors.yaml`) and the digest priority readers
(`scripts/digest-repo-native-lib.mjs`) already use. See
`archive/sessions/2026-09-11-m3-remaining-scope-inventory.md`, section 1c,
for why this registry did not exist before this batch: it is a genuine gap,
not a mapping exercise.

## Sources and searches (with hit counts)

Every row cites a URL or a repository path as `evidence`. No row was
populated from memory.

**The rule (added review round 1):** a repository document is a
population source when it records evidence for a distribution surface's
status. `docs/company/DIRECTORY-MAP.md` already backed the Glama and
Smithery rows below before this rule was written down -- the original
version of this document cited it as evidence there while separately
refusing to add a Coinbase x402 Bazaar row on the ground that
`DIRECTORY-MAP.md` was not one of the named sources. That was
inconsistent: the document was already doing the job of a source for two
rows. Review round 1 corrects it: `DIRECTORY-MAP.md` is now the fifth
named source, every surface it documents with evidence gets a row, and
the document itself stays the analysis behind the status -- cited as
`evidence`, never copied into the row.

1. **The four root discovery manifests.** Read in full: `context7.json`,
   `glama.json`, `server.json`, `smithery.yaml`. One `registry-listing` row
   each. Status came from what the repository can prove:
   - Glama: `listed`, evidenced by `docs/company/DIRECTORY-MAP.md`, which
     records `glama.ai/mcp/servers/@strale-io/strale` returning 200 ("live,
     confirmed by page load") as of 2026-08-16.
   - Smithery: `unknown`. The same document records `smithery-probe`
     crawling 110 times in the trailing 30 days, but the expected listing
     URL (`smithery.ai/server/strale-mcp`) returns 404 -- the repository
     cannot confirm the real listing URL.
   - The official MCP registry (`io.github.strale-io/strale`, `server.json`):
     `unknown`. `handoff/_general/from-code/2026-09-04-m2-batch-10-distribution-rails.md`
     found `server.json` states version `0.2.3` while
     `packages/mcp-server/package.json` states `0.2.8` -- five patch
     versions ahead -- so the repository cannot confirm the live registry
     entry matches the current manifest.
   - Context7: `unknown`. `context7.json` exists and is kept current, but
     no in-repo evidence confirms a live listing at context7.com.

2. **Every published package under `packages/`.** Twelve packages carry a
   publishable manifest (`package.json` or `pyproject.toml`); one
   (`packages/skill/`) does not and was excluded, see "What was
   considered and excluded" below. Each of the twelve was confirmed live
   with a read-only `npm view <name> version` or a PyPI JSON fetch
   (`https://pypi.org/pypi/<name>/json`), run on 2026-09-11, and every one
   matched its manifest's version exactly:
   - npm (`npm view`): `straleio` (0.1.3), `strale-mcp` (0.2.8),
     `strale-semantic-kernel` (0.1.4), `strale-capabilities` (0.1.0),
     `straleio-langchain` (0.1.0) -- 5/5 confirmed.
   - PyPI (JSON fetch): `composio-strale` (0.1.4), `crewai-strale` (0.1.4),
     `google-adk-strale` (0.1.1), `langchain-strale` (0.1.4),
     `openai-agents-strale` (0.1.1), `pydantic-ai-strale` (0.1.1),
     `straleio` (0.1.4, the Python SDK, a different registry from the
     npm `straleio`) -- 7/7 confirmed.
   All twelve are `package` rows, `status: published`.

3. **Pull requests on repositories outside `strale-io`, authored by the
   project's GitHub account.**
   - `gh search prs --author petterlindstrom79 --limit 200`: 200 hits, 14
     outside `strale-io/*`. All 14 are unrelated personal/client projects
     (`tilja-io/tilja` x8, `petterlindstrom79/brandkit-lab` x5,
     `petterlindstrom79/coopreclaim-app` x1) -- zero Strale distribution
     surfaces among them.
   - `gh search prs "strale" --author petterlindstrom79 --limit 50`: 13
     hits outside `strale-io/*` on this run (relevance-sorted search
     result sets are not stable across limits/queries; a second run at
     `--limit 200` with the bare author filter did not surface these,
     which is why the keyword search was also run). Of the 13: 7 are
     directory/awesome-list PRs, 5 are framework-integration PRs, 1
     (`docker/mcp-registry#2202`) is a registry submission.
   - Targeted per-repo searches (`gh search prs "repo:<name>" --author
     petterlindstrom79`) for every framework repo `fetch-notion.ts`'s own
     `SURFACE_KEYWORDS` list names: `langflow-ai/langflow` (1 hit, already
     counted above), `pydantic/pydantic-ai` (1 hit, closed, not in the
     13-hit keyword run), `agno-agi/agno` (1 hit, already counted),
     `langchain-ai/langchain` (0), `crewAIInc/crewAI` (0),
     `ComposioHQ/composio` (0), `microsoft/semantic-kernel` (0),
     `google/adk-python` (0), `openai/openai-agents-python` (0).
   - `pydantic/pydantic-ai#4866` ("docs: add pydantic-ai-strale to
     third-party toolsets") is the incident CLAUDE.md's Distribution PR
     Integrity Protocol background section names: closed by the
     maintainer, not merged, after the published package was found to
     contain zero pydantic-ai-specific code. Recorded here as
     `status: rejected`.
   - Total distinct external PRs from this source: 14 (7 directory, 6
     framework-pr, 1 registry-listing).

4. **`handoff/_general/from-code/` for distribution sessions naming a
   surface the other three sources missed.**
   `rg -il distribution handoff/_general/from-code/`: 32 files. The one
   most directly on point,
   `handoff/_general/from-code/2026-04-27-x402scan-indexing-and-pr-cleanup.md`,
   names four surfaces this batch's own PR search did not surface (most
   likely because they are now closed, and relevance-sorted search results
   are not exhaustive for old, inactive items):
   - `PatrickJS/awesome-cursorrules#212` -- confirmed closed, not merged,
     via a read-only `gh pr view`.
   - `IBM/mcp-context-forge#3974` -- confirmed closed, not merged.
   - `agentic-community/mcp-gateway-registry#723` -- confirmed closed, not
     merged.
   - `detailobsessed/awesome-windsurf#283` as named in the handoff
     resolves, via `gh pr view`, to the same PR already in this register as
     `detailobsessed/awesome-devin#283` (the repository was renamed) -- no
     new row.
   - x402scan paid-route registration -- not a pull request at all: the
     handoff records 358/358 paid endpoints registered with zero failures,
     verified via x402scan's own `registerFromOrigin` endpoint and its
     public listings. Added as a `registry-listing` row, evidenced by the
     handoff path, since no root manifest or package covers it.
   - The same handoff also names `crewAIInc/crewAI-examples#358`'s
     repository as archived (read-only) as of 2026-04-27, confirmed here
     by a read-only `gh api repos/crewAIInc/crewAI-examples --jq
     '.archived'` (`true`). Recorded as a note on that row rather than a
     new one, since the PR itself was already registered from source 3.

5. **`docs/company/DIRECTORY-MAP.md`, the fifth named source (added
   review round 1).** Read in full. It records two kinds of evidence: a
   30-day crawler-hit table (ten venues) and a resolved finding on the
   Coinbase x402 Bazaar. One `registry-listing` row per venue the table or
   the finding names, evidence `docs/company/DIRECTORY-MAP.md` on every
   row, status_date `2026-08-15` (the document's own compile date and the
   date of its Coinbase Bazaar finding -- not today's date):
   - **Coinbase x402 Bazaar**: `listed`. The document verifies 95 of our
     resources listed against a complete walk of all 14,946 index
     entries, and explains listing there is earned by settlement (the
     index holds exactly the resources that settled an x402 payment in
     the trailing 30 days), not by submission.
   - **Glimind, Szerverbank, MCPBeat, YellowMCP, agent-tools.cloud,
     x402 Observatory, AISec Registry, Waggle**: `unknown`, one row each.
     The document records real crawler-hit counts for all eight (552,
     413, 232, 146, 114, 67, 63, and 60 hits respectively in the trailing
     30 days), but -- unlike Glama, which it separately confirms live by a
     direct 200 page load -- it does not probe a specific listing URL for
     any of these eight, so the repository can prove crawling, not a
     confirmed live listing. `unknown` is the same standard the document
     already applies to Smithery, whose 110 crawler hits did not save it
     from `unknown` once its expected listing URL returned 404.
   - **402 Index domain verification**: `submitted`. The document records
     `/.well-known/402index-verify.txt` served (confirmed live in
     `apps/api/src/app.ts`) with the venue's own status recorded as
     "domain verified." That is evidence of a completed verification
     step, not a probed live listing page, so `submitted` is the closest
     honest value rather than `listed`.
   - The document's other served verification files
     (`/.well-known/glama.json`, `/.well-known/mcp.json`,
     `/.well-known/agent.json`, `/.well-known/ai-catalog.json`,
     `/.well-known/x402.json` + `/x402`) name generic protocol
     conventions or indexer categories, not a single named venue the way
     402 Index and Glama are named, so they do not get their own row --
     `x402.json`/`/x402`'s named venue, x402scan, already has an evidenced
     row (`x402scan-registration`, from source 4 above) and the document
     itself records x402scan's presence as unconfirmed, not this file's
     to resolve.

## What was considered and excluded

- **`packages/skill/`** (a `SKILL.md` file distributed via the universal
  agent-skill convention, referenced against `agentskills.io`) carries no
  `package.json` or `pyproject.toml`, so it does not fit "published package
  under `packages/`" -- there is no manifest to read a name, version or
  registry from, and no evidence in the repository of a submission to
  `agentskills.io` or any other directory. Left out of this population
  rather than guessed; a future batch can add it once a submission exists
  to cite.

## Population summary

44 surfaces (34 from sources 1-4, plus 10 from `DIRECTORY-MAP.md`, source
5, added review round 1): 16 `registry-listing`, 10 `directory`, 6
`framework-pr`, 12 `package`. By status: 12 `published`, 13 `open`, 3
`closed`, 11 `unknown`, 3 `listed`, 1 `rejected`, 1 `submitted`. `npm run
distribution:check` confirms these counts against the committed file at
every run.

## The check

`scripts/distribution-lib.mjs` + `scripts/check-distribution.mjs`
(`npm run distribution:check`), wired into `.github/workflows/ci.yml`
next to `vendors:check`/`vendors:test`, blocking like the vendor register
(it guards the repository's own data, not a live external fetch):

- **Schema validity** (Ajv 2020, `docs/operations/distribution-registry.schema.json`).
- **Unique ids.**
- **`authority_active: false`** -- enforced by the schema's own `const`
  and given its own finding code so a caller reading the register directly
  can assert on it too.
- **Every `evidence` path exists.** A URL is format-checked only (never
  fetched in CI, per the design); a repository path must exist on disk.
- **`status_date` is not in the future.**

`npm run distribution:test` (`scripts/distribution.test.mjs`) plants one
failure per finding in a throwaway fixture, proves the clean fixture
passes, exercises the comparison function on fixtures (case-insensitive,
trimmed matching), and runs a real-repo test asserting the committed
register passes today.

## The shadow comparison

`scripts/distribution-lib.mjs` exports `repoNativeDistributionSurfaces(root)`
(the register's own rows, `{ name, status }`) and
`compareDistributionSurfaces(repo, notion)` (counts and names on only one
side, matched case-insensitively after trimming -- report data only, no
verdict). `scripts/digest-shadow.mjs` now also prints the repo-native
surfaces and, only when `NOTION_API_KEY` is set, loads
`fetch-notion.ts`'s `getDistributionSurfaces()` and prints the comparison,
the same lazy-load-inside-a-try pattern already used for the priorities
comparison. `.github/workflows/m3-digest-shadow.yml` needed no change: it
already runs `scripts/digest-shadow.mjs` daily and on `workflow_dispatch`,
so the new comparison is reached by the same step. This never changes what
the production digest reads or renders, and never writes to Notion.

## The social-media-post tracking decision

**Decision: social-media-post tracking is dropped from the digest at the
M4 cutover. This registry carries no `social-post` rows.**

The design named this as the architect's call inside this batch, made on
the evidence the batch itself gathers -- not a founder escalation.

**Searches run**, covering code, scripts, workflows, `.claude/`/`.agents/`
skills and commands, and handoffs:

- `rg -n "SOCIAL_DB_ID|extractSocialPosts|socialPosts|7d0819c8-...|Social Media Posts"`,
  whole repository: every hit is either (a) the read-only digest code path
  (`apps/api/src/lib/daily-digest/fetch-shiplog.ts`'s `extractSocialPosts`
  and its three consumers -- `analyze.ts`, `render-email.ts`, `index.ts` --
  which only read what Notion returns, never write), (b) an unrelated
  capability product (`social-post-generate`, a Strale capability a
  customer calls, unrelated to whether Strale itself has posted), or (c) a
  reference document naming the Notion database by name
  (`CLAUDE.md`, `.claude/NOTION.md`,
  `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md`).
- `rg -il "social" .claude/ .agents/`: 1 file, `.claude/NOTION.md`, a
  reference document naming the Social Media Posts DB -- not a writer.
- `rg -il "social.*post|social media" handoff/_general/from-code/`: 5
  files. Of the 4 within the last 60 days (`2026-08-11`, `2026-08-25` x2,
  `2026-08-29`), none names an active social-post writer:
  `2026-08-11-manifest-pii-and-credential-rotation.md` names
  `archive/growth-ops/upload-graphics.sh` (see below); the other three only
  mention the unrelated `social-post-generate` capability.
- The one near-miss: `archive/growth-ops/upload-graphics.sh`, committed
  2026-04-18, is a script that uploaded media to Typefully drafts (which
  fed the Notion Social Media Posts DB). It is under `archive/`, is not
  invoked by any CI workflow, `package.json` script, or other repository
  code (`rg -n "upload-graphics" --glob '!archive/**'`: 0 hits), and its
  only activity since 2026-04-18 is a credential-scrub edit on 2026-08-11
  (PR #169, removing the plaintext key without rotating it) -- a security
  fix, not a post. No evidence of an actual write in the last 60 days, or
  of any live code path that could produce one.
- `archive/sessions/digest-preview.html` (committed 2026-04-18) shows a
  sample digest render naming one Reddit post captured in the Notion
  Social Media Posts DB -- but the sample itself is from 2026-04-18, far
  outside the 60-day window, and is a rendered example, not evidence of
  current activity.

**What these searches can and cannot see (added review round 1):** every
search above covers code, scripts, workflows, skills, commands, and
handoffs in this repository. It cannot see a person adding rows to the
Notion Social Media Posts DB by hand, or a Notion automation or
integration that writes to it from outside this repository -- neither
would leave a trace here for `rg` to find.

**Conclusion:** no path in this repository writes the social-posts
database, and none has in the last 60 days. Per the design's rule,
social-post tracking is recorded as dropped from the digest at the M4
cutover, and this registry carries no `social-post` rows, on that basis.
If social posts matter to the founder's digest, the M4 cutover decision
should confirm in Notion that nothing else writes that database before
dropping it -- this batch's searches establish the repository is clean,
not that Notion itself has no other writer. If Strale resumes posting
through some future mechanism, that mechanism's own onboarding is the
place to add a `social-post` kind to this registry, not a retroactive
edit here.

## Boundaries this batch kept

Shadow mode throughout: nothing under `apps/api/src`, the `Dockerfile`, or
the rendered digest changed. No write to Notion, no production write, no
change of authority. No pull request outside `strale-io/*` was opened,
edited, commented on, or closed -- every PR reference above came from a
read-only `gh search prs` / `gh pr view` / `gh api` GET. No package was
published; the twelve `package` rows were confirmed with read-only
`npm view` / PyPI JSON reads only.
