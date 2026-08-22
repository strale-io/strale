#!/usr/bin/env node
/**
 * Resolve and validate an npm release target for .github/workflows/release-npm.yml.
 *
 * Usage:
 *   node apps/api/scripts/npm-release-resolve.mjs --tag strale-mcp@0.2.7
 *   node apps/api/scripts/npm-release-resolve.mjs --dir packages/mcp-server
 *
 * Writes `dir`, `name`, `version` to $GITHUB_OUTPUT when set, and prints them
 * either way so the script is runnable locally before you cut a tag.
 *
 * Why a script and not inline YAML: the tag->directory mapping is real logic
 * (package name != directory name for straleio-langchain), and CLAUDE.md's
 * "verify a gate actually ran" rule is unenforceable against a shell one-liner
 * buried in a workflow. This runs the same way on a laptop and in CI.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const PACKAGES_DIR = "packages";

function fail(msg) {
  console.error(`npm-release-resolve: ${msg}`);
  process.exit(1);
}

/** Every workspace directory under packages/ that is an npm package. */
function npmPackages() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${PACKAGES_DIR}/${e.name}`)
    .filter((dir) => existsSync(`${dir}/package.json`))
    .map((dir) => {
      const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
      return { dir, name: pkg.name, version: pkg.version, private: pkg.private === true };
    })
    .filter((p) => p.name && !p.private);
}

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const tag = argOf("--tag");
const dirArg = argOf("--dir");
if (!tag && !dirArg) fail("pass --tag <name@version> or --dir <packages/x>");

const all = npmPackages();
let target;
let expectedVersion;

if (tag) {
  // Tag format is `<package-name>@<version>`. Package names here are all
  // unscoped, so the last '@' is the separator.
  const at = tag.lastIndexOf("@");
  if (at <= 0) fail(`tag "${tag}" is not <package-name>@<version>`);
  const name = tag.slice(0, at);
  expectedVersion = tag.slice(at + 1);
  target = all.find((p) => p.name === name);
  if (!target) {
    fail(`tag names package "${name}", which is not a publishable workspace. Known: ${all.map((p) => p.name).join(", ")}`);
  }
} else {
  const normalizeDir = (s) => { let t = s.split(String.fromCharCode(92)).join("/"); while (t.endsWith("/")) t = t.slice(0, -1); return t; };
  target = all.find((p) => p.dir === normalizeDir(dirArg));
  if (!target) {
    fail(`"${dirArg}" is not a publishable workspace. Known: ${all.map((p) => p.dir).join(", ")}`);
  }
}

if (expectedVersion && expectedVersion !== target.version) {
  fail(
    `tag says ${expectedVersion} but ${target.dir}/package.json says ${target.version}. ` +
      `Bump the manifest and re-tag — publishing the wrong version is not recoverable.`,
  );
}

// Provenance requires a repository field that resolves to the building repo.
// npm rejects the publish otherwise, so catch it here where the message is useful.
const pkg = JSON.parse(readFileSync(`${target.dir}/package.json`, "utf8"));
const repoUrl = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
if (!repoUrl) fail(`${target.dir}/package.json has no "repository" field; provenance attestation requires one`);
if (!/github\.com[/:]strale-io\/strale(\.git)?$/.test(repoUrl.replace(/^git\+/, ""))) {
  fail(`${target.dir}/package.json repository "${repoUrl}" does not point at strale-io/strale; provenance would be rejected`);
}

const out = { dir: target.dir, name: target.name, version: target.version };
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { flag: "a" });
}
