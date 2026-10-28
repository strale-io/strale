Intent: keep the official MCP registry entry in step with strale-mcp releases, and finish the 0.2.9 release clean-up.

- strale-mcp 0.2.9 is on npm (approved by Petter 2026-10-28). The post-publish smoke test of the npm artefact against production: 298 capabilities, 95 solutions, 298 cap trust, 95 sol trust, 9 tools, provenance present.
- The official registry (registry.modelcontextprotocol.io, io.github.strale-io/strale) still listed 0.2.4 as latest; 0.2.5 to 0.2.8 were never published there because nothing automated it.
- New `.github/workflows/publish-mcp-registry.yml`: runs after a successful `strale-mcp@*` release and on demand; GitHub OIDC login, pinned and cosign-verified mcp-publisher v1.8.1; publishes only when both server.json copies agree, name the released version, the version is on npm and the registry lacks it.
- Both server.json copies bumped to 0.2.9. The start-up log line no longer claims "6 meta-tools" (the server registers 9 tools); ships with the next strale-mcp release.
- Procedure: docs/release/npm-publishing.md, "Real release" and "The official MCP registry entry".

Post-merge check (DEC-20260504-C): run Actions → Publish (MCP registry) once by hand (Petter; this session cannot dispatch workflows), then confirm the registry search lists 0.2.9 as latest.
