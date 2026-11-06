Intent: record the 2026-11-06 npm releases after the strale.io switch-over, and what is left.

# npm releases, 2026-11-06

Petter approved each publish in session: strale-mcp ("yes"), then the four packages ("Yes, publish all four"). Every release ran in GitHub Actions with trusted publishing and provenance. The PC jobs approved the `npm-release` environment through Petter's GitHub login.

## What was released

| Package | Version | Release run | Production smoke check |
|---|---|---|---|
| strale-mcp | 0.2.11 | 42203249324 | pass: `archive/receipts/2026-11-06-check-strale-mcp-0-2-11-production-smoke.json` |
| straleio | 0.1.4 | 42205787095 | pass: `archive/receipts/2026-11-06-check-npm-four-packages-production-smoke.json` |
| straleio-langchain | 0.1.1 | 42208364833 | pass: same receipt |
| n8n-nodes-strale | 1.0.0 | 42205800264 | pass: same receipt |
| strale-capabilities | 0.1.1 | 42208184364 | **fail** (stale catalog): same receipt |

- **MCP registry:** it lists 0.2.11 as the latest version. The automatic registry publish skips a release that was started by hand rather than by a tag, so it was run by hand from `main`.
- **Not checked for n8n:** the `client_meta.client_header` of a first paid call through the node. That needs a funded key in n8n.

## npm account (PC job, Petter signed in on the npm page)

- `strale-semantic-kernel` 0.1.0 to 0.1.4 are deprecated.
- Trusted publishers are set (`strale-io/strale`, `release-npm.yml`, env `npm-release`) on straleio, strale-capabilities, straleio-langchain and n8n-nodes-strale.
- The PC was signed out of npm afterwards.

## Lessons

- **A PC session's permission check refuses a release approval that only a peer session asked for.** The first release job failed this way ("Create Public Surface"). A PC brief for an outward action must ask Petter one Yes/No question in that PC session.
- **The release workflow allows one running and one pending run per ref.** A newer pending dispatch cancels the older one, so releases are dispatched one at a time.

## Next

1. **strale-capabilities 0.1.2: published** (run 42212692002) and matches production (298, no differences): `archive/receipts/2026-11-06-check-strale-capabilities-0-1-2-production-smoke.json`.
2. **Remaining founder or account steps:**
   - PyPI trusted publishers for straleio, langchain-strale, crewai-strale and composio-strale; composio-strale is also missing from `release-pypi.yml`;
   - the Smithery homepage and the duplicate `strale/agent-tools` listing;
   - first publishes of strale-cli and strale-ai-sdk.
3. **Follow-up:** let `publish-mcp-registry.yml` also run after a successful hand-started strale-mcp release, so the manual run is not needed.
