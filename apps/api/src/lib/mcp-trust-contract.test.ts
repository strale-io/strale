/**
 * Contract tests for the published `strale-mcp` client, covering the two
 * defects a clean-user smoke test of 0.2.7 exposed.
 *
 * 1. Startup collapsed to `0 cap trust, 0 sol trust` because the client asked
 *    for `/v1/internal/trust/*` — routes deleted with the SQS engine, sitting
 *    behind the `adminOnly` wall on the whole `/v1/internal/*` prefix, so the
 *    wall answered 401 before routing could 404. The client logged and carried
 *    on, which is why nobody noticed for months.
 *
 * 2. `STRALE_CLIENT_ID` was the literal `"strale-mcp/0.2.6"` while 0.2.7 was on
 *    the registry, so every attribution datapoint was mislabelled by a release.
 *
 * These read the SOURCE rather than mocking fetch: the failure mode was "which
 * URL do we ask for", and a mock would have been written against whatever URL
 * the code already used.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STRALE_CLIENT_ID } from "strale-mcp/tools";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const TOOLS_SRC = readFileSync(`${REPO_ROOT}packages/mcp-server/src/tools.ts`, "utf8");
const MCP_PKG = JSON.parse(
  readFileSync(`${REPO_ROOT}packages/mcp-server/package.json`, "utf8"),
) as { version: string };

describe("startup cannot silently collapse to zero trust", () => {
  it("asks for no path under the admin-walled /v1/internal prefix", () => {
    // `adminOnly` is mounted on /v1/internal/* in app.ts. An unauthenticated
    // public install can never satisfy it, so any such path here is guaranteed
    // to fail at runtime -- and the failure is swallowed into empty trust maps.
    const offenders = [...TOOLS_SRC.matchAll(/["'`](\/v1\/internal\/[^"'`]*)/g)].map((m) => m[1]);
    expect(offenders).toEqual([]);
  });

  it("reads trust from the public projection", () => {
    expect(TOOLS_SRC).toContain("/v1/public/ops/trust/capabilities/batch");
    expect(TOOLS_SRC).toContain("/v1/public/ops/trust/solutions/batch");
  });

  it("fetches solution trust in batches rather than one request per solution", () => {
    // The old implementation issued one request per solution -- 104 on a cold
    // start -- which made the outage 104 log lines wide and would be a
    // thundering herd against the new public route if left as-is.
    const fn = TOOLS_SRC.slice(
      TOOLS_SRC.indexOf("export async function fetchSolutionTrust("),
      TOOLS_SRC.indexOf("// ─── Register all tools on an McpServer"),
    );
    expect(fn).toContain("slice(i, i + 50)");
  });
});

describe("client attribution reports the real package version", () => {
  it("matches package.json rather than a hardcoded literal", () => {
    expect(STRALE_CLIENT_ID).toBe(`strale-mcp/${MCP_PKG.version}`);
  });

  it("carries no hand-maintained version string", () => {
    // Discriminating: the pre-fix source contained `strale-mcp/0.2.6` as a
    // literal. Any future literal of that shape fails here.
    expect(TOOLS_SRC).not.toMatch(/["'`]strale-mcp\/\d+\.\d+\.\d+["'`]/);
  });

  it("derives the version from package metadata at runtime", () => {
    expect(TOOLS_SRC).toContain('new URL("../package.json", import.meta.url)');
  });
});
