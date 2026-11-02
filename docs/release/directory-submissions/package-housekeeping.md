# Package housekeeping, 2026-10-29 (distribution T12)

## strale-semantic-kernel (npm): deprecate

**Why:** it is built on `semantic-kernel` on npm (0.3.0), which is an
unofficial community port of Semantic Kernel to JavaScript
(`afshinm/semantic-kernel-js`, single maintainer), not a Microsoft package.
Its README did not say so. The distribution strategy (§1, §8) drops it; MCP
covers Semantic Kernel for Python and .NET.

**Done in the repository:** deprecation notice at the top of
`packages/semantic-kernel-strale/README.md`; package description starts
with "Deprecated: use strale-mcp"; moved to the deprecated list in
`docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md`. No version bump
and no new release: deprecating does not need one.

**Still to do (an npm owner of `strale-semantic-kernel`; one command):**

```bash
npm deprecate strale-semantic-kernel@"*" "Deprecated: built on an unofficial community port of Semantic Kernel (npm semantic-kernel), not a Microsoft package. Use the Strale MCP server instead: https://api.strale.io/mcp or npx strale-mcp"
```

Check afterwards: `npm view strale-semantic-kernel deprecated` prints the
message. Then set the register row `pkg-semantic-kernel-strale` to
`withdrawn`. A deprecation can be undone with the same command and an empty
message (`""`), so this is not a one-way act. The npm page keeps showing the
0.1.4 README until a new version is published; the deprecation banner shows
regardless.

## crewai-strale and composio-strale (PyPI): freeze

**Meaning:** maintenance only. Fixes for breakage are allowed; no new
features, no new tools, no new framework surface. New distribution work goes
through the MCP server.

**Done in the repository:** a "Maintenance only (frozen 2026-10-29)" notice
at the top of each README; noted on the approved list in
`DISTRIBUTION_PR_PREFLIGHT.md` and on the register rows. PyPI shows the
notice at the next release; nothing is published for this.
