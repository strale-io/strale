Intent: Codex builder brief: let the PyPI release workflow publish composio-strale.

# Brief: composio-strale on the PyPI release path

- **Requester:** the Strale master (session_01CR5YPrMeBAwfKDjk6t8L9H), baseline item A8 (`docs/plan/BASELINE-2026-11-11.md`, strale-io/strale PR 1012).
- **Branch:** push only `codex/pypi-composio-release`. Never push `main`, and never label, approve, merge or comment.
- **Data:** the repository only. There are no secrets. Publish nothing; every test runs offline.

## Why

PyPI still serves `composio-strale` 0.1.4, with strale.dev links and an old tool count. The repository has a newer version in `packages/composio-strale`. It cannot be released, because the release path only knows three packages:
- `.github/workflows/release-pypi.yml`: `workflow_dispatch` `options`;
- `apps/api/scripts/pypi-release.py`: `PACKAGES`.

The founder registers the PyPI trusted publisher separately.

## Do

1. Add `packages/composio-strale` to `PACKAGES` in `apps/api/scripts/pypi-release.py`:
   - `name` is `composio-strale`;
   - `module` is `composio_strale`;
   - model `client_prefix` on the existing entries. Read how `smoke` uses each field and set them so the smoke test exercises the composio package's real entry point. Read `packages/composio-strale/composio_strale/__init__.py` and its tests first.
2. Add `packages/composio-strale` to the `workflow_dispatch` `options` in `.github/workflows/release-pypi.yml`. Change nothing else in that file. Its path, filename and environment name are part of the trusted-publisher configuration.
3. Confirm `node apps/api/scripts/check-framework-packages.mjs` passes for composio-strale (DEC-20260422-A). If it fails, stop and say so in the report. Do not change the package to make it pass.
4. If `docs/release/pypi-publishing.md` lists the publishable packages, add composio-strale to that list, with the tag `pypi/composio-strale/v<version>`.
5. Tests:
   - If `pypi-release.py` has tests, add a case that `resolve --dir packages/composio-strale` and `resolve --tag pypi/composio-strale/v<the version in its pyproject.toml>` both resolve.
   - If it has none, run both commands and paste their output in the report.
   - Build the package offline with `python -m build` and run its offline tests against the built wheel, the way the workflow's build job does.

## Done when

- Both resolve commands work, the framework check passes, and the package builds and its offline tests pass.
- `docs/lanes/codex/pypi-composio-release-report.md` lists each change and the command output.
