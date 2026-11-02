Intent: distribution T2 (D1) — take the hygiene work as far as it goes without Petter's npm and PyPI sessions: repair the Pipedream and Activepieces listings upstream, establish what the registry and descriptor state actually is, and record precisely what is prepared and waiting.

# D1 — the two upstream repairs, and what is actually blocked (2026-10-30)

## Done this session

### 1. Pipedream — [PipedreamHQ/pipedream#22383](https://github.com/PipedreamHQ/pipedream/pull/22383)

`components/strale/strale.app.mjs` defined `getQuality()`, which called
`GET /v1/quality/${slug}` — deleted with the SQS engine under DEC-20260503-B
and now a 404 in production (probed). No action used the method, so nothing
in the registry was failing, but the descriptions that advertised it were
inaccurate on three surfaces.

Changed: the method is gone; the app description no longer says "290+
quality-tested data capabilities"; **Execute Capability** no longer promises a
"quality score and audit trail" (it now says structured results with
provenance, which is what `/v1/do` returns); **Search Capabilities** no longer
says "290+" or "quality scores". Component versions bumped (`0.0.1` → `0.0.2`
on both changed actions, package `0.1.1` → `0.1.2`), which Pipedream requires.
**Search and Execute** was already accurate and is untouched.

### 2. Activepieces — [activepieces/activepieces#17060](https://github.com/activepieces/activepieces/pull/17060)

The **Trust Profile** action called `/v1/internal/trust/capabilities/{slug}`.
Those routes went with the SQS engine too; what answers now is the admin wall
on the `/v1/internal` prefix, which returns 401 to *any* caller, a valid
customer API key included — verified:

```
$ curl -s https://api.strale.io/v1/internal/trust/capabilities/iban-validate
{"error_code":"unauthorized","message":"Admin authentication required.", ...}
```

So the action could never succeed. There is nothing to repoint it at, so the
PR removes it, along with four stale descriptions: the piece's ("Trust layer
for AI agents. 271 quality-scored API capabilities ... across 27 countries ...
Every result includes a quality score and audit trail"), the auth hint that
named Trust Profile as key-free, and the Search and Execute descriptions.
Package `0.2.0` → `0.3.0`, since removing an action is breaking.

The i18n files are keyed by the English source string, so the nine keys
belonging to removed or reworded strings are dropped from `translation.json`
and all eight locales; the three keys the remaining actions still use are kept.

### CI on the two PRs

Pipedream's "Ensure component commits modify component versions" failed on the
first push and is fixed: changing `strale.app.mjs` counts as changing every
action that imports it, so **Search and Execute** needed a bump too even though
its own file was untouched (`0.0.2` → `0.0.3`). Worth remembering for the next
Pipedream PR — bump every action in the component when the app file changes,
not only the ones whose text you edited. Everything else on that PR passes,
CodeRabbit included.

Activepieces' "Linear ticket check" fails and cannot be made to pass from a
fork: it runs a maintainer script against a `LINEAR_API_KEY` secret, which
GitHub does not expose to pull requests from forks. Every other check passes,
the CLA is signed, and `mergefreeze` says ok to merge.

Both PRs wait on their maintainers. Neither repository is `strale-io/*`, so the
Distribution PR Integrity Protocol (DEC-20260422-A) applied: every imported
symbol was checked before the edit (`axios` from `@pipedream/platform`, already
a dependency; the Activepieces piece imports only framework symbols it already
imported), `node --check` passes on the changed `.mjs` files, every i18n file
still parses, no reference to the removed action or method is left, the three
endpoints the surviving actions call were probed against production, and the
tone follows each repository's neighbouring components.

### 3. `check-framework-packages.mjs`

6 active framework-named packages verified (each imports the framework it
claims), 4 skipped as deprecated with a `DEPRECATED.md`.

## Already done, so the track's `next_action` was stale

- **`server.json`:** both copies (root and `packages/mcp-server/`) already read
  `0.2.9`, which matches `packages/mcp-server/package.json`.
- **npm `strale-mcp`:** `0.2.9` is published.
- **The official MCP registry:** `io.github.strale-io/strale` version `0.2.9`
  is live and `isLatest`, published `2026-10-28T14:57:47Z`, carrying the
  current description. Nothing to republish.

## Blocked on Petter, precisely — and why each one is

Three npm packages are prepared in the repository and not on npm. All three are
blocked for the same reason, which is narrower than "he has to publish them":
**the trusted-publisher entry is missing or points at the wrong repository**,
and that entry can only be created from a logged-in session on npmjs.com.

| package | repo | npm | what is missing |
|---|---|---|---|
| `straleio` | 0.1.4 | 0.1.3 | the published 0.1.3 carries **no provenance attestation**, so no trusted publisher is configured |
| `straleio-langchain` | 0.1.1 | 0.1.0 | same — 0.1.0 has no attestation |
| `n8n-nodes-strale` | 1.0.0 | 0.1.4 | 0.1.4 *does* have provenance, but its attestation names `strale-io/n8n-nodes-strale` and `.github/workflows/publish.yml` — the **old standalone repository**, not this monorepo's `release-npm.yml` |

That last one matters and is easy to get wrong: "the package has provenance"
does not mean "this repository can publish it". The attestation has to be read.

Once the entry exists (organisation `strale-io`, repository `strale`, workflow
`release-npm.yml`, environment `npm-release`), publishing needs no further
login from him: a session pushes the tag and he only approves the `npm-release`
environment, because that environment's required reviewer is the gate.

Also his, unchanged and already on the bus queue: the PyPI trusted publisher
for `langchain-strale` (bus 6506170239), the first `strale-cli` publish and the
`strale-semantic-kernel` deprecation (6503452948), and the Smithery duplicate
listing `strale/agent-tools`, which is still live beside `strale-io/strale` and
needs account access to resolve.

## Not done, and why

- **Smithery and 402 Index listing edits.** Both are directory-side settings
  behind an account. The in-repository copy they would be refreshed from is
  already clean (`claims:check` passes over the listing configs).
- **`npm deprecate` on `n8n-nodes-strale` 0.1.x and archiving
  `strale-io/n8n-nodes-strale`**: both need his npm or GitHub permissions, and
  neither should happen before 1.0.0 is actually published.
- **Post-publish production smoke tests** (DEC-20260422-A step 6): nothing was
  published, so none were run. They are owed on each package the moment it is.

## Carried follow-up, found on the way

`apps/api/src/lib/email-templates.ts:124` links a customer-facing email to
`https://api.strale.io/v1/internal/trust/capabilities/batch` under the label
"Trust API". That is the same deleted route family as the Activepieces action —
a live 401 in outbound mail. It is one line, out of scope for a distribution
PR, and belongs in the next platform batch.

## A note on routing

The implementation here was done in Claude rather than handed to Codex CLI.
The edits were eleven files of one-line text substitutions plus a deletion, all
applied through the GitHub API against two external repositories; writing the
brief and granting the access would have cost more than the edits did. The
judgement that is worth recording is which claims had to go and why, and that
is in the two PR bodies and in `docs/company/claims.yaml`.
