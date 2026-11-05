/**
 * WP12 batch 3, review round 1 (B1): popular npm packages must still work.
 *
 * A full npm packument is 30-75 MB for packages people use (measured
 * 2026-11-05, decompressed: renovate 74.3 MB, vite 39.0 MB, next 31.5 MB,
 * npm 26.1 MB). The first cut of this batch read it under a 20 MiB cap and
 * so refused next and vite, which main served. These tests use packument-
 * shaped streams of 45 MB (bigger than the old cap, smaller than the new
 * one) and require SUCCESS, the right output, the smaller endpoints actually
 * requested, and a refusal only past the new work bound.
 *
 * Loopback only: `fetch` is a stub, the "registry" is a lazy in-memory stream.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "./npm-package-info.js";
import "./package-security-audit.js";
import "./package-docs.js";
import { getExecutor } from "./index.js";
import { MAX_PACKUMENT_BYTES } from "../lib/resource-limits.js";

const MIB = 1024 * 1024;
const encoder = new TextEncoder();

/** A packument-shaped body of about `target` bytes, generated lazily. */
function packument(target: number): { response: Response; versions: () => number; pulls: () => number } {
  const pad = "x".repeat(2000); // stands in for dist, dependencies, etc.
  let phase: "head" | "versions" | "tail" | "done" = "head";
  let n = 0;
  let sent = 0;
  let pulls = 0;
  const name = (i: number) => `1.0.${i}`;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(ctrl) {
        pulls++;
        let out = "";
        if (phase === "head") {
          out = `{"name":"big","description":"A big package","license":"MIT","keywords":["a","b"],` +
            `"readme":"# big readme","readmeFilename":"README.md","maintainers":[{"name":"m1"}],` +
            `"dist-tags":{"latest":"LATEST"},"versions":{`;
          phase = "versions";
        } else if (phase === "versions") {
          while (out.length < 60_000 && sent + out.length < target) {
            out += (n ? "," : "") +
              `"${name(n)}":{"name":"big","version":"${name(n)}","description":"d","license":"MIT",` +
              `"scripts":{"test":"x"${n === 7 ? ',"postinstall":"node i.js"' : ""}},` +
              `"_npmUser":{"name":"${n < 3 ? "alice" : "bob"}","email":"e@x"},` +
              `"dist":{"tarball":"${pad}"},"dependencies":{"a":"1"}}`;
            n++;
          }
          if (sent + out.length >= target) phase = "tail";
        } else if (phase === "tail") {
          const times = Array.from({ length: n }, (_, i) => `"${name(i)}":"2024-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z"`);
          out = `},"time":{"created":"2020-01-01T00:00:00.000Z","modified":"2024-06-01T00:00:00.000Z",${times.join(",")}},"ignored":{"deep":[1,2,{"a":"}"}]}}`;
          phase = "done";
        } else {
          ctrl.close();
          return;
        }
        if (out.includes("LATEST")) out = out.replace("LATEST", "1.0.3"); // latest tag, early in the body
        sent += out.length;
        ctrl.enqueue(encoder.encode(out));
      },
    },
    { highWaterMark: 0 },
  );
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    versions: () => n,
    pulls: () => pulls,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const requested: string[] = [];
let big: ReturnType<typeof packument>;
const fetchMock = vi.fn();

beforeEach(() => {
  requested.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function registry(target: number) {
  big = packument(target);
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    requested.push(u);
    if (u === "https://registry.npmjs.org/big") return big.response;
    if (u === "https://registry.npmjs.org/big/latest")
      return json({ name: "big", version: "1.0.3", license: "MIT", homepage: "https://big.example", dependencies: { a: "1", b: "2" }, devDependencies: { t: "1" } });
    if (u.startsWith("https://api.npmjs.org/downloads/")) return json({ downloads: 42 });
    return json({}, 404);
  });
}

describe("a 45 MB packument (larger than the old 20 MiB cap) is served", () => {
  it("npm-package-info: succeeds with the same output shape, from the packument plus /latest", async () => {
    registry(45 * MIB);
    const r = (await getExecutor("npm-package-info")!({ package: "big" })) as { output: Record<string, any> };
    expect(big.versions()).toBeGreaterThan(15_000); // the body really was past the old cap
    expect(r.output).toMatchObject({
      name: "big",
      description: "A big package",
      latest_version: "1.0.3",
      license: "MIT",
      homepage: "https://big.example",
      keywords: ["a", "b"],
      dependencies: ["a", "b"],
      dev_dependencies: ["t"],
      weekly_downloads: 42,
      created: "2020-01-01T00:00:00.000Z",
      last_modified: "2024-06-01T00:00:00.000Z",
      dist_tags: { latest: "1.0.3" },
      total_versions: big.versions(),
    });
    expect(r.output.recent_versions).toHaveLength(5);
    expect(r.output.recent_versions[0].version).toBe(`1.0.${big.versions() - 1}`);
    expect(r.output.recent_versions[0].published).toMatch(/^2024-01-\d\dT/);
    expect(Object.keys(r.output).sort()).toEqual(
      ["author", "created", "dependencies", "description", "dev_dependencies", "dist_tags", "homepage", "keywords",
        "last_modified", "latest_version", "license", "name", "recent_versions", "repository", "total_versions", "weekly_downloads"].sort(),
    );
    // The smaller document is what carries license/homepage/dependencies.
    expect(requested).toContain("https://registry.npmjs.org/big/latest");
  }, 60_000);

  it("package-security-audit (npm): succeeds and reads publisher, scripts and previous release from the cut-down packument", async () => {
    registry(45 * MIB);
    const r = (await getExecutor("package-security-audit")!({ name: "big", ecosystem: "npm", version: "1.0.8" })) as {
      output: Record<string, any>;
    };
    expect(big.versions()).toBeGreaterThan(15_000);
    expect(r.output.name).toBe("big");
    expect(r.output.version).toBe("1.0.8");
    expect(r.output.freshness.latest_version).toBe("1.0.3");
    expect(JSON.stringify(r.output)).toContain("bob"); // _npmUser of 1.0.8 was read
  }, 60_000);

  it("package-docs (unpinned): succeeds, takes the top-level README and the version list", async () => {
    registry(45 * MIB);
    const r = (await getExecutor("package-docs")!({ ecosystem: "npm", package: "big" })) as { output: Record<string, any> };
    expect(r.output.latest_version).toBe("1.0.3");
    expect(JSON.stringify(r.output)).toContain("big readme");
    expect(requested).toEqual(["https://registry.npmjs.org/big"]);
  }, 60_000);
});

describe("the packument work bound", () => {
  it("is 128 MiB and a body past it is refused in the repo's style, pulling no more than the bound", async () => {
    expect(MAX_PACKUMENT_BYTES).toBe(128 * MIB);
    registry(MAX_PACKUMENT_BYTES + 8 * MIB);
    const err = await getExecutor("npm-package-info")!({ package: "big" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as Error).message).toMatch(/'package' must be a registry record of 128\.0MB or less/);
    expect(big.pulls() * 60_000).toBeLessThan(MAX_PACKUMENT_BYTES + 4 * MIB);
  }, 120_000);

  it("a non-OK registry answer cancels the body it will not read", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    fetchMock.mockImplementation(async (u: string) =>
      String(u).endsWith("/latest") ? json({}, 404) : new Response(body, { status: 503 }),
    );
    await expect(getExecutor("npm-package-info")!({ package: "big" })).rejects.toThrow(/HTTP 503/);
    expect(cancel).toHaveBeenCalled();
  });
});
