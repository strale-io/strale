# DEPRECATED (2026-10-29)

`strale-semantic-kernel` gets no further features or fixes.

## Why

It is built on [`semantic-kernel` on npm](https://www.npmjs.com/package/semantic-kernel),
an unofficial community port of Semantic Kernel to JavaScript
(`afshinm/semantic-kernel-js`), not a Microsoft package. The README did not
say so. Decided in the distribution strategy
(`docs/research/2026-10-27-distribution-strategy.md`, §1 and §8).

## What to use instead

Semantic Kernel for Python and .NET can load MCP servers as plugins. Point it
at the Strale MCP server:

- remote: `https://api.strale.io/mcp`
- local: `npx strale-mcp`

The npm deprecation command is in
`docs/release/directory-submissions/package-housekeeping.md`.
