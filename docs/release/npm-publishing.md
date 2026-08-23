# Publishing the npm packages

Strale publishes five npm packages out of this monorepo:

| package | workspace | notes |
|---|---|---|
| `strale-mcp` | `packages/mcp-server` | MCP server, consumed via `npx` |
| `straleio` | `packages/sdk-typescript` | TypeScript SDK |
| `straleio-langchain` | `packages/langchain` | builds against `straleio` |
| `strale-semantic-kernel` | `packages/semantic-kernel-strale` | |
| `strale-capabilities` | `packages/strale-capabilities` | generated, no build step |

Publishing runs through [`.github/workflows/release-npm.yml`](../../.github/workflows/release-npm.yml)
using **npm trusted publishing (OIDC)**. There is no `NPM_TOKEN` secret and no
long-lived credential anywhere in the pipeline: the workflow presents a GitHub
OIDC identity, npm verifies it against the trusted-publisher configuration
registered on each package, and issues a short-lived publish credential. npm
attaches a provenance attestation automatically, so every future release is
cryptographically linked to the commit and workflow run that produced it.

> The **path and filename** of the release workflow are part of that trust
> configuration. Renaming or moving `release-npm.yml` breaks publishing until
> the npm-side config is updated to match.

## One-time setup

### 1. Create the protected GitHub environment (do this first)

The release job runs in an environment called `npm-release`. Publishing is
irreversible and a tag can point at any commit on any branch, so this is the
approval gate:

1. Repo → **Settings** → **Environments** → **New environment** → `npm-release`.
2. Enable **Required reviewers** and add yourself.

Without this the environment is auto-created on first use with no protection,
and a tag push publishes unattended.

### 2. Enable trusted publishing on npmjs.com

Trusted publishing has to be enabled per package by the package owner. This
cannot be done from CI — it needs a logged-in session on npmjs.com.

For **each** of the five packages above:

1. Sign in to <https://www.npmjs.com> as the package owner (`petter_lindstrom`).
2. Open the package page → **Settings**.
3. Find **Trusted Publisher** and choose **GitHub Actions**.
4. Enter exactly:
   - **Organization or user:** `strale-io`
   - **Repository:** `strale`
   - **Workflow filename:** `release-npm.yml`
   - **Environment:** `npm-release`
5. Save.

Setting the Environment field pins npm to releases that passed the approval gate
above. Leaving it empty also works, but then npm accepts a publish from this
workflow regardless of which environment it ran in.

Run a dry run (below) before cutting a real release to check the packaging.

> **A green dry run does not prove trusted publishing is configured correctly.**
> The dry-run path never authenticates against the registry — it packs the tarball
> and skips the publish step — so a mistyped organization, repository, or workflow
> filename in the npm-side config still passes. The OIDC exchange is first exercised
> by a real publish. Expect the first release of each package to be the actual test,
> and if it fails, delete the tag, fix the npm-side config, and re-cut it.

### Token hygiene after setup

- Leave the expired `publish-strale` token expired. Do not renew it.
- Delete any other publish-capable tokens on the account once trusted publishing
  is confirmed working — an unused token is only a liability.
- Do not create a replacement long-lived token. If one is ever genuinely needed
  as a fallback, it should be a **granular access token**, read-write, scoped to
  exactly these five packages, no organization access, shortest workable expiry.

## Why the workflow looks the way it does

Two details are load-bearing and easy to "tidy" into breakage:

- **No `registry-url:` on `actions/setup-node`.** With it, setup-node writes
  `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into an `.npmrc` and points
  `NPM_CONFIG_USERCONFIG` at it. With no token set that line is empty, npm decides
  authentication is already configured, and never performs the OIDC exchange — the
  publish fails `ENEEDAUTH`/`E404` even though trusted publishing is set up correctly.
  `registry.npmjs.org` is npm's default, so omitting it costs nothing.
  (npm's own documented example carries this defect — see actions/setup-node#1551.)
- **Node 22, not 20.** npm documents trusted publishing as requiring npm >= 11.5.1
  *and* Node >= 22.14.0. npm 11 installs fine on Node 20, so the mismatch would only
  appear at publish time.

## Releasing

### Dry run (always do this first for a package)

Actions → **Release (npm)** → *Run workflow*:

- **package:** the workspace directory
- **dry_run:** `true`

This installs, builds, runs the framework-package integrity check, refuses if
the version already exists, and prints the exact tarball contents — without
publishing.

### Real release

1. Bump `version` in the package's `package.json` on a branch, and merge it.
2. Tag the merge commit `<package-name>@<version>` and push the tag:

```bash
git tag strale-mcp@0.2.7 && git push origin strale-mcp@0.2.7
```

The tag trigger publishes. The tag name is authoritative: the workflow refuses
to run if the tag version and the manifest version disagree, which is the one
mistake that cannot be undone — npm versions are immutable.

You can also run the workflow manually with `dry_run: false` for a release
without a tag, but the tag is preferred: it leaves a permanent marker of what
shipped, and the provenance attestation points back at it.

## What the workflow checks before it publishes

- Tag and `package.json` versions agree.
- The package has a `repository` field resolving to `strale-io/strale`.
  Provenance is rejected otherwise, so this is checked early with a useful message.
- The version is not already on the registry.
- `check-framework-packages.mjs` passes (DEC-20260422-A — a framework-named
  package must actually import the framework it claims to integrate with).
- The tarball contents are printed for inspection on every run, dry or not.

## Local verification

The resolver runs the same way on a laptop as in CI:

```bash
node apps/api/scripts/npm-release-resolve.mjs --tag strale-mcp@0.2.7
```

It prints the resolved directory, name, and version, or exits non-zero with the
reason. Use it before cutting a tag.

## Required post-release check: the production contract smoke test

**Mandatory for every externally distributed package.** A release is not done
when CI is green, when the tarball looks right, or even when the publish
succeeds with provenance. It is done when the *published artefact* has been run
against *production* and observed to work.

Immediately after publishing, install the published version the way a stranger
would -- not from the repo, not from a local build -- and check the startup
output and one real call path:

```bash
npx -y <package>@<version>
```

Read the output. Specifically look for errors the program logged and then
carried on from. A dependency that fails into a caught, logged, non-fatal
degradation is exactly what CI cannot see and what a user will never report,
because it does not look like a crash.

Record the observed values, not "looks fine". For `strale-mcp` the contract is
the startup line: capability count, solution count, capability trust count,
solution trust count -- all four non-zero and consistent with the catalog.

### Why this is a required step

On 2026-08-22 this check, run once by hand after a release, found that
`strale-mcp` had been starting with `0 cap trust, 0 sol trust` for roughly three
and a half months. The trust routes it called had been deleted in May; the admin
wall on their URL prefix answered 401 instead of 404; the client caught the
error, logged it to stderr and continued. Inside an MCP client stderr is
invisible, so no user could have reported it.

Nothing in CI would ever have caught this, for a structural reason worth stating
plainly: **CI tests the source against test doubles; it never runs the published
artefact against production.** Those are different systems. The gap between them
is exactly where this class of defect lives.

## Troubleshooting

**`npm error need auth` / OIDC exchange fails.** The trusted-publisher entry on
npm does not match. Check the org, repo, and workflow filename character for
character, and that the run came from `strale-io/strale` rather than a fork.

**`npm error Package must have a repository field`.** The workspace lost its
`repository` block. The resolver catches this before the publish step.

**Provenance missing on a published version.** The publish did not go through
this workflow. Provenance cannot be added retroactively — cut a new patch version.
