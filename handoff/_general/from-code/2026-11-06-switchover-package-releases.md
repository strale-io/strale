Intent: prepare the package releases that carry the strale.io switch-over (DEC-20261105-A, PR #917), as a lane of the Strale orchestrator.

# Switch-over package releases: what can ship now and what waits (2026-11-06)

## Sorting, from registry evidence (read 2026-11-06)

Trusted publishing was checked from the npm provenance attestations and the
PyPI integrity API, not from prose.

| package | registry | published | repo | publisher today | group |
|---|---|---|---|---|---|
| strale-mcp | npm | 0.2.10 (built from 3b13b39, before #917) | 0.2.11 in this PR | strale-io/strale release-npm.yml | (a) releasable now |
| straleio | npm | 0.1.3, no attestation | 0.1.4 | none | (b) |
| strale-capabilities | npm | 0.1.0, no attestation | 0.1.1 | none | (b), new finding |
| straleio-langchain | npm | 0.1.0, no attestation | 0.1.1 | none | (b) |
| n8n-nodes-strale | npm | 0.1.4, attested to strale-io/n8n-nodes-strale publish.yml | 1.0.0 | retired repository | (b) |
| strale-cli | npm | never | 0.1.0 | none, first publish | (b) |
| strale-ai-sdk | npm | never | 0.1.0 | none, first publish | (b) |
| strale-semantic-kernel | npm | 0.1.4 | 0.1.5 | none | (b) deprecation |
| straleio | PyPI | 0.1.4, no provenance | 0.1.5 | none | (b) |
| langchain-strale | PyPI | 0.1.4, no provenance | 0.2.0 | none | (b) |
| crewai-strale | PyPI | 0.1.4, no provenance | 0.1.5 | none | (b) |
| composio-strale | PyPI | 0.1.4, no provenance | 0.1.5 | none; also not in release-pypi.yml | (b) plus a workflow change |
| google-adk-strale, openai-agents-strale, pydantic-ai-strale | PyPI | deprecated | metadata only | n/a | (c) skip |
| packages/cursor-plugin, packages/skill | none | read from this repository | n/a | n/a | nothing to publish |

The group (b) packages already carry an unpublished version above the
registry's, so they need no further bump: once a publisher exists, a session
pushes the tag.

## strale-mcp 0.2.11

The packed tarball differs from published 0.2.10 only in the version and the
URL changes from #917: strale.dev to strale.io, and the methodology links
(`/trust/methodology`, `/methodology`) moved to `https://strale.io/security`
(README, dist/tools.js and its map, package.json homepage and author). The
independent review confirmed nothing else changed. After merge: tag `strale-mcp@0.2.11` on the
merge commit; the run waits in `npm-release` for Petter's approval; then the
production contract smoke test and a receipt.
