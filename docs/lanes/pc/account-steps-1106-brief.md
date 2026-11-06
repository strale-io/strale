# PC job: account-side cleanups after the strale.io switch-over (2026-11-06)

**Requester:** Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw). Petter asked in session on 2026-11-06 for these changes to be made for him ("i want you to do all these changes").

## Why this runs on the PC

Every step needs Petter's existing logins: GitHub CLI, npm CLI and git credentials. A cloud session has none of them and may not sign in with a password or 2FA (DEC-20261027-C).

## Before anything else

1. Run `gh auth status` and `npm whoami`, and record what each prints. **Never print a token.**
2. If a tool is not logged in, skip every step that needs it and report it. Never run `gh auth login`, `npm login`, or any command that prompts for a password or one-time code.

Work in `C:\Users\pette\Projects\strale`. Do not edit, commit or push any file. Only the commands below are allowed.

## Steps

### 1. GitHub repository description and website

The current "About" text uses claims that `docs/company/claims.yaml` forbids (quality-scored, SQS, a fixed count, EU AI Act).

```
gh repo edit strale-io/strale --description "New tools for your agent. No new accounts. One connection to a growing library of tools agents can pay for per call." --homepage "https://strale.io"
```

Verify with `gh repo view strale-io/strale --json description,homepageUrl`.

### 2. Deprecate the npm package strale-semantic-kernel

This was decided in the distribution track T2.

```
npm deprecate strale-semantic-kernel "Deprecated: built on an unofficial community port of Semantic Kernel (npm semantic-kernel), not a Microsoft package. Use the Strale MCP server instead: https://api.strale.io/mcp or npx strale-mcp"
```

Verify with `npm view strale-semantic-kernel deprecated`.

### 3. npm trusted publishers

Run this step only if the installed npm has a trusted-publisher command. Check `npm help trust`, or `npm trust --help`.

- **If no such command exists,** skip this step and report "no CLI route".
- **If it exists,** configure GitHub Actions trusted publishing for each of `straleio`, `strale-capabilities`, `straleio-langchain` and `n8n-nodes-strale`, with:
  - repository `strale-io/strale`
  - workflow `release-npm.yml`
  - environment `npm-release`
- For `n8n-nodes-strale`, first remove the existing publisher, which names the retired `strale-io/n8n-nodes-strale` with `publish.yml`.
- Show each package's resulting configuration.

### 4. Delete merged branches

Delete each branch only after confirming, with `git merge-base --is-ancestor <branch tip> origin/main` or by content, that its content is on main.

- `claude/site-structure-messaging-f667b6`. Its content was squash-merged as #706 (147ad606). The orchestrator verified that `SITE-STRUCTURE.md` and `MESSAGING-LEVELS.md` are identical to #706, and the handoff note is on main. Because it was a squash merge, the branch tip is not an ancestor of main; confirm the two files with `git diff <tip> 147ad606 -- docs/programs/brand-website/` showing no output.

  ```
  git push origin --delete claude/site-structure-messaging-f667b6
  ```

- The local worktree for that branch, if `git worktree list` shows one. Use `git worktree remove --force <path>`. **Never delete the folder by hand.**

## Report

Comment on the PR that carries this brief. Start the comment with `To orchestrator:` and give one line per step:
- done, skipped or failed;
- what was verified;
- the exact message for any failure.

Include no tokens and no account emails.

## Stop conditions

- Any prompt for a password, one-time code or browser login: stop that step and report it.
- Any command that would publish a package version: never run it.
- A branch whose content is not on main: leave it and report it.
