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

## What was considered and excluded

- **`packages/skill/`** (a `SKILL.md` file distributed via the universal
  agent-skill convention, referenced against `agentskills.io`) carries no
  `package.json` or `pyproject.toml`, so it does not fit "published package
  under `packages/`" -- there is no manifest to read a name, version or
  registry from, and no evidence in the repository of a submission to
  `agentskills.io` or any other directory. Left out of this population
  rather than guessed; a future batch can add it once a submission exists
  to cite.
- **Coinbase x402 Bazaar** (`docs/company/DIRECTORY-MAP.md`: "95 of our
  resources are listed... verified against a complete walk of all 14,946
  index entries") is real, evidenced distribution status, but that
  document is a strategy/ops note, not a handoff under
  `handoff/_general/from-code/`, so it falls outside this batch's four
  named population sources. Not added, to keep the population rule
  mechanical rather than "any document that happens to mention a
  surface." A future batch can add it explicitly if the design is widened
  to cover `docs/company/*` evidence generally.

## Population summary

34 surfaces: 6 `registry-listing`, 10 `directory`, 6 `framework-pr`, 12
`package`. By status: 12 `published`, 13 `open`, 3 `closed`, 3 `unknown`, 2
`listed`, 1 `rejected`. `npm run distribution:check` confirms these counts
against the committed file at every run.

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
  files. Of the 3 within the last 60 days (`2026-08-11`, `2026-08-25` x2,
  `2026-08-29`), none names an active social-post writer:
  `2026-08-11-manifest-pii-and-credential-rotation.md` names
  `archive/growth-ops/upload-graphics.sh` (see below); the other two only
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

**Conclusion:** nothing in this repository writes to the Notion Social
Media Posts DB, and the one script that ever did is dead, uninvoked, and
untouched (other than a credential scrub) for well over 60 days. Per the
design's rule, social-post tracking is recorded as dropped from the digest
at the M4 cutover, and this registry carries no `social-post` rows. If
Strale resumes posting through some future mechanism, that mechanism's own
onboarding is the place to add a `social-post` kind to this registry, not
a retroactive edit here.

## Boundaries this batch kept

Shadow mode throughout: nothing under `apps/api/src`, the `Dockerfile`, or
the rendered digest changed. No write to Notion, no production write, no
change of authority. No pull request outside `strale-io/*` was opened,
edited, commented on, or closed -- every PR reference above came from a
read-only `gh search prs` / `gh pr view` / `gh api` GET. No package was
published; the twelve `package` rows were confirmed with read-only
`npm view` / PyPI JSON reads only.
