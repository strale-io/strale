# PC job: npm deprecation and trusted publishers (one sign-in)

**Requester:** Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw).

Petter asked for this in session on 2026-11-06 ("npm job"). **Petter is present.** He approves the npm sign-in in his browser, and any two-factor prompt npm shows.

This is a light job.

## Why this runs on the PC

npm account settings need Petter's npm login, which exists only through his own sign-in on his machine. The earlier run of `account-steps-1106-brief.md` found npm logged out (E401), and found that npm 11.19.0 has `npm trust`.

## One sign-in, one process

Open ONE PowerShell process and do every step below inside it, including any fix or rerun. A restarted process would ask Petter to sign in again.

1. Run `npm login --auth-type=web`. npm prints a URL and opens a browser. Petter signs in there and answers any 2FA. Then confirm with `npm whoami`. **Never print a token or the contents of `.npmrc`.**
2. Run `npm help trust`, or `npm trust github --help`, and use the exact flags it documents. Do not guess flags.

## Steps

### 1. Deprecate strale-semantic-kernel

```
npm deprecate strale-semantic-kernel "Deprecated: built on an unofficial community port of Semantic Kernel (npm semantic-kernel), not a Microsoft package. Use the Strale MCP server instead: https://api.strale.io/mcp or npx strale-mcp"
```

Verify with `npm view strale-semantic-kernel deprecated`.

### 2. Trusted publishers

Set a GitHub Actions trusted publisher on each of these packages:
- `straleio`
- `strale-capabilities`
- `straleio-langchain`
- `n8n-nodes-strale`

Use these values:
- repository `strale-io/strale`
- workflow file `release-npm.yml`
- environment `npm-release`

For `n8n-nodes-strale`, first run `npm trust list n8n-nodes-strale` (or the documented equivalent). Then revoke the existing entry, which names `strale-io/n8n-nodes-strale` with `publish.yml`, and only then add the new one.

Show each package's resulting list.

### 3. Sign out

Run `npm logout` at the end, so no npm session stays on the PC beyond this job.

## Report

Comment on strale-io/strale#924, starting with `To orchestrator:`. Give one line per package: done, skipped or failed, with the verify output. Include no tokens, emails or OTPs.

## Stop conditions

- Petter does not complete the sign-in: report, and end.
- A step would publish a package version: never run it.
- `npm trust` rejects the values: report the exact message, and do not try other repositories or workflows.
- Edit, commit and push nothing.
