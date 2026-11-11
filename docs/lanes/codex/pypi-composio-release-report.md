# Report: composio-strale on the PyPI release path

Date: 2026-11-11

## Changes

- Added `packages/composio-strale` to the allowlisted packages in `apps/api/scripts/pypi-release.py` with project name `composio-strale`, import module `composio_strale`, and client prefix `composio-strale`.
- Extended the installed-artifact smoke test to exercise the package's exported `StraleToolkit` entry point: it registers the custom tools, invokes `strale_search`, and verifies the loopback request path and `X-Strale-Client` header.
- Added only `packages/composio-strale` to the manual-dispatch choices in `.github/workflows/release-pypi.yml`; the workflow path, filename, environment, and all other workflow content are unchanged.
- Corrected the package repository metadata to the canonical repository URL required by the release resolver. Before that correction, both resolve commands stopped with `pyproject.toml [project.urls] Repository must be https://github.com/strale-io/strale`.
- Updated `docs/release/pypi-publishing.md` to list the fourth publishable package, its client header, and its `pypi/composio-strale/v<version>` tag.

No tests exist for `pypi-release.py`, so the two required resolver commands and their output are recorded below.

## Required verification

### Framework-package integrity (DEC-20260422-A)

Command:

```text
node apps/api/scripts/check-framework-packages.mjs
```

Output (relevant lines, with the final summary):

```text
ok    composio-strale  (import found in packages/composio-strale/composio_strale/toolkit.py)
framework-packages check: 6 package(s) verified, 4 deprecated (skipped) — every active framework-named package imports from the framework it claims.
```

Result: PASS.

### Resolve by directory

Command:

```text
python apps/api/scripts/pypi-release.py resolve --dir packages/composio-strale
```

Output:

```text
dir=packages/composio-strale
name=composio-strale
version=0.1.5
module=composio_strale
```

Result: PASS.

### Resolve by tag

Command:

```text
python apps/api/scripts/pypi-release.py resolve --tag pypi/composio-strale/v0.1.5
```

Output:

```text
dir=packages/composio-strale
name=composio-strale
version=0.1.5
module=composio_strale
```

Result: PASS.

### Offline package build

The base interpreter did not contain the `build` or `hatchling` tooling, and this environment's PyPI proxy returned HTTP 403. To keep the build offline, I used the already-installed `build` frontend plus a source checkout of Hatch from GitHub, disabled build isolation, and skipped only the installed-distribution metadata check. The backend and all its dependencies were local during the build.

Command (with the local tool paths supplied through `PATH` and `PYTHONPATH`):

```text
python -m build --no-isolation --skip-dependency-check --outdir /tmp/composio-dist-exact packages/composio-strale
```

Output:

```text
* Building sdist...
* Building wheel from sdist
* Building wheel...
Successfully built composio_strale-0.1.5.tar.gz and composio_strale-0.1.5-py3-none-any.whl
```

Result: PASS. The build produced exactly the expected sdist and universal wheel.

### Offline tests against the built wheel

The wheel was installed with `--no-index --no-deps` into a clean test virtual environment. Existing locally installed test/runtime dependencies were exposed to that environment; no package index or Strale API was contacted.

Command:

```text
PYTHONPATH=/opt/codex/mcp/.venv/lib/python3.12/site-packages /tmp/composio-test-venv/bin/python -m pytest packages/composio-strale/tests -q -rs --import-mode=importlib -p no:cacheprovider
```

Output:

```text
.......                                                                  [100%]
7 passed in 0.25s
```

Result: PASS.

### Installed-wheel smoke test

Command (run from `/tmp`, outside the repository, so the import can only resolve from the virtual environment):

```text
PYTHONPATH=/opt/codex/mcp/.venv/lib/python3.12/site-packages /tmp/composio-test-venv/bin/python /workspace/strale/apps/api/scripts/pypi-release.py smoke --dir packages/composio-strale --version 0.1.5
```

Output:

```text
imported composio_strale 0.1.5 from /tmp/composio-test-venv/lib/python3.12/site-packages/composio_strale/__init__.py
smoke ok: GET /v1/suggest/typeahead?q=smoke&limit=10 sent X-Strale-Client: composio-strale/0.1.5
```

Result: PASS. This is the package's real public `StraleToolkit` registration/search path, not a synthetic client module.

## Outcome

All brief-specific completion gates pass: both resolution modes, the framework-package integrity check, the offline sdist/wheel build, the package's seven offline tests against the installed wheel, and the installed-wheel loopback smoke test. Nothing was published.
