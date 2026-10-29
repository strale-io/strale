# Publishing the PyPI packages

Strale publishes three Python packages out of this monorepo through
[`.github/workflows/release-pypi.yml`](../../.github/workflows/release-pypi.yml):

| PyPI project | directory | X-Strale-Client | notes |
|---|---|---|---|
| `langchain-strale` | `packages/langchain-strale` | `langchain-strale/<version>` | LangChain tools; the first package through this workflow |
| `straleio` | `packages/sdk-python` | `straleio-python/<version>` | Python SDK |
| `crewai-strale` | `packages/crewai-strale` | `crewai-strale/<version>` | CrewAI tools; most of its tests need a key and skip here |

The workflow uses **PyPI trusted publishing (OIDC)**. There is no `PYPI_TOKEN`
secret and no long-lived credential anywhere in the pipeline: the publish job
presents a GitHub OIDC identity, PyPI checks it against the trusted publisher
registered on the project, and issues a short-lived upload token.
`pypa/gh-action-pypi-publish` also uploads digital attestations, so each file on
PyPI is linked to the commit and workflow run that built it.

> The **path and filename** of the workflow (`release-pypi.yml`) and the
> **environment name** (`pypi-release`) are part of that trust configuration.
> Renaming either breaks publishing until the PyPI-side entry is updated.

The npm packages have their own workflow and guide:
[`npm-publishing.md`](npm-publishing.md).

## One-time setup (Petter)

### 1. Create the protected GitHub environment (do this first)

1. Open <https://github.com/strale-io/strale/settings/environments>.
2. Click **New environment**, type `pypi-release`, click **Configure environment**.
3. Tick **Required reviewers**, add yourself, click **Save protection rules**.
4. Under **Deployment branches and tags**, choose **Selected branches and tags**
   and add two rules: branch `main` and tag `pypi/*`. Save.

Without this the environment is created on first use with no protection, and a
tag push publishes without anyone approving it.

### 2. Add the trusted publisher on pypi.org (once per project)

This needs a logged-in session on pypi.org as an owner of the project; it
cannot be done from CI. All three projects already exist on PyPI (0.1.x was
published before this workflow), so this is the "existing project" form.

For **each** of `langchain-strale`, `straleio` and `crewai-strale` (start with
`langchain-strale`; the others can wait until their first release here):

1. Sign in at <https://pypi.org> with two-factor authentication.
2. Go to **Your projects** → the project → **Manage** → **Publishing** in the
   left-hand menu. (Direct link:
   `https://pypi.org/manage/project/<project>/settings/publishing/`.)
3. Under **Add a new publisher**, stay on the **GitHub** tab and enter exactly:
   - **Owner:** `strale-io`
   - **Repository name:** `strale`
   - **Workflow name:** `release-pypi.yml`
   - **Environment name:** `pypi-release`
4. Click **Add**. The publisher appears in the list above the form.

Setting the environment name pins PyPI to runs that passed the approval gate in
step 1.

> **A green dry run does not prove the trusted publisher is right.** The dry run
> never talks to PyPI's upload endpoint, so a typo in the owner, repository,
> workflow or environment still passes. The first real publish is the test. If
> it fails with `invalid-publisher`, compare the four fields character for
> character, fix them on pypi.org, and re-run the failed job; nothing was
> uploaded.

### 3. Token hygiene after the first trusted publish

Once one release of a project has gone through this workflow, delete any PyPI
API token that can upload to it (**Account settings** → **API tokens**). Do not
create a replacement; an unused token is only a liability.

## Releasing

### Dry run (always first)

Actions → **Release (PyPI)** → **Run workflow**, on branch `main`:

- **package:** the directory, e.g. `packages/langchain-strale`
- **dry_run:** ticked (the default)

It checks the commit is on `main`, resolves the name and version from
`pyproject.toml`, runs the framework-package integrity check
(DEC-20260422-A), refuses a version already on PyPI, builds the sdist and
wheel, runs `twine check --strict`, runs the package's offline tests against the
installed wheel, and runs the smoke test (below) on the wheel. Nothing is
published.

### Real release

1. Bump `version` in the package's `pyproject.toml` (and its `CHANGELOG.md`
   where it has one) on a branch, and merge it.
2. Tag the merge commit and push the tag:

   ```bash
   git tag pypi/langchain-strale/v0.2.0 <merge-commit-sha>
   git push origin pypi/langchain-strale/v0.2.0
   ```

3. Approve the `pypi-release` deployment when GitHub asks.

The tag is authoritative: the run stops if the tag's version and
`pyproject.toml` disagree, or if the tagged commit is not on `main`. PyPI
versions are immutable; a mistake costs a version number.

The tag has no `@`, on purpose: `release-npm.yml` fires on `*@*` tags, and the
two must never trigger each other.

You can also dispatch from `main` with `dry_run` unticked, but the tag is
preferred: it leaves a permanent marker of what shipped.

### What runs after the upload

`post-publish-smoke` installs `<name>==<version>` from PyPI into a clean venv
(retrying while PyPI's index catches up), imports it, checks the installed
version, and makes one call through the package's own client to a loopback
server, checking the `X-Strale-Client` header the API attributes calls by. It
needs no key and no network beyond PyPI.

`apps/api/scripts/pypi-release.py` holds that logic and the list of packages
this workflow may publish. It runs the same on a laptop:

```bash
python3 apps/api/scripts/pypi-release.py resolve --tag pypi/langchain-strale/v0.2.0
python3 apps/api/scripts/pypi-release.py unpublished --name langchain-strale --version 0.2.0
# in a venv where the package is installed, from outside the repo:
python apps/api/scripts/pypi-release.py smoke --dir packages/langchain-strale --version 0.2.0
```

Adding a package means a reviewed change to that list and to the workflow's
`options`, plus step 2 above on its PyPI project.

## Required post-release check: the production contract smoke test

The workflow's smoke test is offline. DEC-20260422-A step 6 still requires a
check of the published artefact against production, by hand, recorded with
observed values rather than "looks fine":

```bash
python3 -m venv /tmp/pypi-contract && cd /tmp
/tmp/pypi-contract/bin/pip install --no-cache-dir "langchain-strale==0.2.0"
/tmp/pypi-contract/bin/python -c "
from langchain_strale.client import StraleClient
c = StraleClient()
caps = c.list_capabilities()
print(c.client_id, len(caps))
"
```

The contract, per package, with no key (the catalogue is public):

- **`langchain-strale`:** prints `langchain-strale/<version>` and a capability
  count consistent with `GET https://api.strale.io/v1/platform/facts`.
- **`straleio`:** `Strale(api_key="sk_none").capabilities()` returns a non-empty
  list (the constructor insists on a key; the catalogue route ignores it).
- **`crewai-strale`:** `crewai_strale.client.StraleClient(api_key="").list_capabilities()`
  returns a non-empty list.

Read the whole output, including warnings the package prints and then carries
on from; that is the class of defect CI cannot see. After the first real call
through the package, the transaction's `client_meta.client_header` should read
the package's `X-Strale-Client` value.

## Troubleshooting

**`invalid-publisher` / `Trusted publishing exchange failure`.** The PyPI-side
entry does not match. Check owner, repository, workflow filename and
environment, and that the run came from `strale-io/strale`, not a fork.

**`is already on PyPI`.** Bump the version, merge, and tag again. A deleted
PyPI release still burns its version number.

**`is not on main`.** The tag points at a branch commit. Delete the tag
(`git push origin :refs/tags/<tag>`), merge first, and tag the merge commit.
