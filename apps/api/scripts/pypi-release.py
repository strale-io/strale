#!/usr/bin/env python3
"""Resolve, check and smoke-test a PyPI release for .github/workflows/release-pypi.yml.

Usage:
  python apps/api/scripts/pypi-release.py resolve --tag pypi/langchain-strale/v0.2.0
  python apps/api/scripts/pypi-release.py resolve --dir packages/langchain-strale
  python apps/api/scripts/pypi-release.py unpublished --name langchain-strale --version 0.2.0
  python apps/api/scripts/pypi-release.py smoke --dir packages/langchain-strale --version 0.2.0

`resolve` writes `dir`, `name`, `version` to $GITHUB_OUTPUT when set, and prints
them either way, so it runs the same on a laptop as in CI (the npm resolver,
npm-release-resolve.mjs, has the same contract).

`smoke` must run in an environment where the package is INSTALLED (the built
wheel, or the published version), not on the source tree. It imports the
package, checks the installed distribution's version, and makes one call
through the package's own client against a loopback HTTP server, asserting the
X-Strale-Client header the API attributes calls by. No key, no network.

Python >= 3.11 (tomllib); stdlib only, so it runs in a clean venv.
"""

from __future__ import annotations

import argparse
import http.server
import importlib
import json
import os
import re
import sys
import threading
import tomllib
import urllib.error
import urllib.request
from importlib.metadata import version as installed_version
from pathlib import Path

# The packages this workflow may publish. Each entry says how the smoke test
# drives the package: the import name, the X-Strale-Client prefix its client
# sends, and the call to make. Adding a package here is a reviewed change, and
# its PyPI project needs the trusted publisher added (docs/release/pypi-publishing.md).
PACKAGES = {
    "packages/langchain-strale": {
        "name": "langchain-strale",
        "module": "langchain_strale",
        "client_prefix": "langchain-strale",
    },
    "packages/sdk-python": {
        "name": "straleio",
        "module": "straleio",
        "client_prefix": "straleio-python",
    },
    "packages/crewai-strale": {
        "name": "crewai-strale",
        "module": "crewai_strale",
        "client_prefix": "crewai-strale",
    },
}

TAG_RE = re.compile(r"^pypi/(?P<name>[A-Za-z0-9._-]+)/v(?P<version>.+)$")
# PEP 440 public versions, the shapes these packages use (1.2.3, 1.2.3rc1, 1.2.3.post1, 1.2.3.dev1).
VERSION_RE = re.compile(r"^\d+(\.\d+)*((a|b|rc)\d+)?(\.post\d+)?(\.dev\d+)?$")
REPOSITORY = "https://github.com/strale-io/strale"


def fail(msg: str) -> None:
    print(f"pypi-release: {msg}", file=sys.stderr)
    sys.exit(1)


def normalize_dir(d: str) -> str:
    return d.replace("\\", "/").rstrip("/")


def read_project(pkg_dir: str) -> dict:
    path = Path(pkg_dir) / "pyproject.toml"
    if not path.is_file():
        fail(f"{path} not found")
    with path.open("rb") as f:
        return tomllib.load(f).get("project", {})


def cmd_resolve(args: argparse.Namespace) -> None:
    expected_version = None
    if args.tag:
        m = TAG_RE.match(args.tag)
        if not m:
            fail(f'tag "{args.tag}" is not pypi/<package-name>/v<version>')
        name, expected_version = m["name"], m["version"]
        matches = [d for d, p in PACKAGES.items() if p["name"] == name]
        if not matches:
            known = ", ".join(p["name"] for p in PACKAGES.values())
            fail(f'tag names package "{name}", which this workflow does not publish. Known: {known}')
        pkg_dir = matches[0]
    else:
        pkg_dir = normalize_dir(args.dir)
        if pkg_dir not in PACKAGES:
            fail(f'"{args.dir}" is not a package this workflow publishes. Known: {", ".join(PACKAGES)}')

    project = read_project(pkg_dir)
    name, version = project.get("name"), project.get("version")
    if name != PACKAGES[pkg_dir]["name"]:
        fail(f'{pkg_dir}/pyproject.toml names "{name}", expected "{PACKAGES[pkg_dir]["name"]}"')
    if not version or not VERSION_RE.match(version):
        fail(f'{pkg_dir}/pyproject.toml has no usable static version ("{version}")')
    if expected_version is not None and expected_version != version:
        fail(f"tag version {expected_version} != pyproject.toml version {version}. Versions are immutable on PyPI; fix one before publishing.")
    # Trusted publishing attests the repository; a package whose metadata points
    # elsewhere would publish a misleading project page.
    if project.get("urls", {}).get("Repository") != REPOSITORY:
        fail(f"{pkg_dir}/pyproject.toml [project.urls] Repository must be {REPOSITORY}")

    out = {"dir": pkg_dir, "name": name, "version": version, "module": PACKAGES[pkg_dir]["module"]}
    for k, v in out.items():
        print(f"{k}={v}")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            for k, v in out.items():
                f.write(f"{k}={v}\n")


def cmd_unpublished(args: argparse.Namespace) -> None:
    url = f"https://pypi.org/pypi/{args.name}/{args.version}/json"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        status = e.code
    except urllib.error.URLError as e:
        fail(f"could not reach PyPI ({e.reason}); cannot confirm {args.name}=={args.version} is unpublished")
    if status == 200:
        fail(f"{args.name}=={args.version} is already on PyPI. Versions are immutable; bump and re-tag.")
    if status != 404:
        fail(f"PyPI answered {status} for {url}; cannot confirm the version is unpublished")
    print(f"{args.name}=={args.version} is unpublished; proceeding")


class _CatalogHandler(http.server.BaseHTTPRequestHandler):
    seen: list[dict] = []

    def do_GET(self) -> None:  # noqa: N802 (stdlib name)
        _CatalogHandler.seen.append({"path": self.path, "headers": dict(self.headers)})
        body = json.dumps({"capabilities": []}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_: object) -> None:
        pass


def cmd_smoke(args: argparse.Namespace) -> None:
    pkg = PACKAGES.get(normalize_dir(args.dir))
    if not pkg:
        fail(f'"{args.dir}" is not a package this workflow publishes')

    got = installed_version(pkg["name"])
    if got != args.version:
        fail(f"installed {pkg['name']} is {got}, expected {args.version}")
    module = importlib.import_module(pkg["module"])
    origin = Path(module.__file__).resolve()
    # The installed artefact is what is under test, never the source tree.
    if Path(sys.prefix).resolve() not in origin.parents:
        fail(f"{pkg['module']} imported from {origin}, outside this environment ({sys.prefix}); run smoke in the venv the artefact was installed into")
    print(f"imported {pkg['module']} {got} from {origin}")

    # Loopback only: keep any proxy configured on the machine out of the call.
    os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"
    server = http.server.HTTPServer(("127.0.0.1", 0), _CatalogHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    try:
        if pkg["module"] == "straleio":
            client = module.Strale(api_key="sk_smoke_fixture", base_url=base_url, timeout=10)
            try:
                result = client.capabilities()
            finally:
                client.close()
        else:
            client = importlib.import_module(f"{pkg['module']}.client").StraleClient(api_key="sk_smoke_fixture", base_url=base_url)
            result = client.list_capabilities()
    finally:
        server.shutdown()

    if result != []:
        fail(f"list call returned {result!r}, expected []")
    if len(_CatalogHandler.seen) != 1 or _CatalogHandler.seen[0]["path"] != "/v1/capabilities":
        fail(f"expected one GET /v1/capabilities, saw {[s['path'] for s in _CatalogHandler.seen]}")
    header = _CatalogHandler.seen[0]["headers"].get("X-Strale-Client")
    want = f"{pkg['client_prefix']}/{args.version}"
    if header != want:
        fail(f"X-Strale-Client was {header!r}, expected {want!r}")
    print(f"smoke ok: GET /v1/capabilities sent X-Strale-Client: {header}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("resolve")
    g = r.add_mutually_exclusive_group(required=True)
    g.add_argument("--tag")
    g.add_argument("--dir")
    u = sub.add_parser("unpublished")
    u.add_argument("--name", required=True)
    u.add_argument("--version", required=True)
    s = sub.add_parser("smoke")
    s.add_argument("--dir", required=True)
    s.add_argument("--version", required=True)
    args = parser.parse_args()
    {"resolve": cmd_resolve, "unpublished": cmd_unpublished, "smoke": cmd_smoke}[args.cmd](args)


if __name__ == "__main__":
    main()
