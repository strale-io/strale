Intent: add a PyPI trusted-publishing release workflow mirroring release-npm.yml (distribution D1, strale-planning lane).

## What landed (branch ci/release-pypi-trusted-publishing)

- `.github/workflows/release-pypi.yml`: runs only on a `pypi/<project>/v<version>` tag or a manual
  dispatch from `main` (dry run by default); never on a branch push. Jobs: `build` (no OIDC: commit
  must be on main, resolve, DEC-20260422-A framework check, refuse a version already on PyPI, build
  sdist+wheel with pinned build/twine, `twine check --strict`, offline tests against the installed
  wheel, smoke on the wheel) → `publish` (environment `pypi-release`, `id-token: write`,
  `pypa/gh-action-pypi-publish` pinned to v1.14.2 by full SHA) → `post-publish-smoke` (clean venv,
  `pip install <name>==<version>` from PyPI with retry, import, one loopback call checking
  `X-Strale-Client`). All actions pinned by SHA.
- `apps/api/scripts/pypi-release.py`: resolve / unpublished / smoke, stdlib only; holds the allowlist
  (langchain-strale, straleio from packages/sdk-python, crewai-strale).
- `docs/release/pypi-publishing.md`: setup, release, the production contract smoke, troubleshooting;
  linked from npm-publishing.md and the REVIEW.md published-packages row.

## Verified locally (not in CI; nothing was dispatched or published)

- actionlint clean; all three packages build, pass `twine check --strict`, pass their offline tests
  against the installed wheel (langchain 12 passed/9 skipped, straleio 2 passed, crewai 2 passed/8
  skipped), and pass the smoke (`langchain-strale/0.2.0`, `straleio-python/0.1.5`,
  `crewai-strale/0.1.5`). The documented production contract returned 297 capabilities for each.
- PyPI today: all three projects stop at 0.1.4; the repo carries 0.2.0 / 0.1.5 / 0.1.5, unpublished.

## Next (Petter, then a session)

1. Create GitHub environment `pypi-release` with required reviewer, limited to `main` and `pypi/*/v*` tags.
2. On pypi.org, add the trusted publisher on `langchain-strale` (strale-io / strale / release-pypi.yml /
   pypi-release). Steps in docs/release/pypi-publishing.md.
3. Dry-run dispatch, then tag `pypi/langchain-strale/v0.2.0` on main; approve; run the production
   contract and record values in distribution T2. Then delete any PyPI upload tokens.
