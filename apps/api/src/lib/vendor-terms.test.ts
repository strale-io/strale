/**
 * No live code path may reach an upstream whose terms forbid Strale's use.
 *
 * The 2026-09-10 audit found the database switch was not enough: web3-assurance
 * runs executors through getDirectExecutor, which never reads
 * capabilities.is_active, and three of its evaluators call the Etherscan client
 * directly. So this holds the source to PROHIBITED_UPSTREAM_HOSTS: an executor
 * naming a prohibited host must be DEACTIVATED (never registered), a shared
 * client must refuse behind a licence gate, and nothing else may name one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PROHIBITED_UPSTREAM_HOSTS, prohibitedHostsIn } from "./vendor-terms.js";
import { getDeactivatedCapabilities } from "../capabilities/auto-register.js";
import { getEthRpcEndpoints } from "./eth-rpc-endpoints.js";
import { PROVIDERS } from "./dependency-manifest.js";
import { etherscanFetch } from "../capabilities/lib/etherscan-client.js";

const SRC = resolve(import.meta.dirname, "..");
const rel = (p: string) => relative(SRC, p).replace(/\\/g, "/");

/** Files that name a prohibited host without calling it for a customer. */
const EXEMPT: Record<string, string> = {
  "lib/vendor-terms.ts": "the list itself",
  "lib/dependency-manifest.ts": "reachability probes only; no data is served (fallback pools are checked separately below)",
};

/** Shared clients that may name a prohibited host only behind a licence gate. */
const GATED: Record<string, RegExp> = {
  "capabilities/lib/etherscan-client.ts": /if \(!etherscanCommercialUseLicensed\(\)\) \{\s*throw new Error/,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "node_modules") walk(full, out); }
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Strip comments so an explanation of why a host is gone is not a reference. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const references = walk(SRC)
  .map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }))
  .map(({ file, src }) => ({ file, src, hosts: prohibitedHostsIn(codeOnly(src)) }))
  .filter((r) => r.hosts.length > 0);

describe("prohibitedHostsIn", () => {
  it("finds a prohibited host only as a URL", () => {
    expect(prohibitedHostsIn('fetch("https://api.gopluslabs.io/api/v1/x")')).toEqual(["api.gopluslabs.io"]);
    expect(prohibitedHostsIn("const b = `https://hub.docker.com`;")).toEqual(["hub.docker.com"]);
    expect(prohibitedHostsIn('sources: ["api.gopluslabs.io"]')).toEqual([]);
    expect(prohibitedHostsIn("https://api.gopluslabs.io.example.com/")).toEqual([]);
  });
});

describe("no live code path reaches a prohibited upstream", () => {
  it("sees the references it must see, so it cannot pass by scanning nothing", () => {
    const files = references.map((r) => r.file);
    expect(files).toContain("capabilities/approval-security-check.ts");
    expect(files).toContain("capabilities/lib/etherscan-client.ts");
    expect(files).toContain("capabilities/host-exposure-lookup.ts");
    // Plain http:// — proves the matcher still sees non-TLS references.
    expect(files).toContain("capabilities/ip-risk-score.ts");
  });

  const deactivated = getDeactivatedCapabilities();
  for (const r of references) {
    if (r.file in EXEMPT) continue;
    it(`${r.file} (${r.hosts.join(", ")})`, () => {
      if (r.file in GATED) {
        expect(r.src, `${r.file} must refuse before calling ${r.hosts.join(", ")}`).toMatch(GATED[r.file]);
        return;
      }
      const slugs = [...codeOnly(r.src).matchAll(/registerCapability\(\s*["']([a-z0-9-]+)["']/g)].map((m) => m[1]);
      expect(slugs.length, `${r.file} names ${r.hosts.join(", ")} but is not a capability executor; route it through a gated client`).toBeGreaterThan(0);
      for (const slug of slugs) {
        expect(deactivated.has(slug), `${slug} calls ${r.hosts.join(", ")} (${PROHIBITED_UPSTREAM_HOSTS.get(r.hosts[0])}) and must be in DEACTIVATED`).toBe(true);
      }
    });
  }

  it("no exemption covers capability code — an exempt executor would sell the data unchecked", () => {
    for (const f of Object.keys(EXEMPT)) {
      expect(f.startsWith("capabilities/") || f.startsWith("web3-assurance/"), `${f} may not be exempt`).toBe(false);
      const src = readFileSync(join(SRC, f), "utf8");
      expect(/registerCapability\(/.test(codeOnly(src)), `${f} registers a capability and may not be exempt`).toBe(false);
    }
  });

  it("every exemption and gate still names a prohibited host (no stale entries)", () => {
    const named = new Set(references.map((r) => r.file));
    for (const f of [...Object.keys(EXEMPT).filter((f) => f !== "lib/vendor-terms.ts"), ...Object.keys(GATED)]) {
      expect(named.has(f), `${f} no longer names a prohibited host; drop its entry`).toBe(true);
    }
  });

  it("no dependency probe falls back to a prohibited host", () => {
    for (const p of PROVIDERS) {
      for (const u of p.fallbackBaseUrls ?? []) {
        expect(prohibitedHostsIn(u), `${p.name} falls back to ${u}`).toEqual([]);
      }
    }
  });
});

describe("the licensed paths", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); });

  it("Ethereum RPC is Alchemy or nothing", () => {
    delete process.env.ALCHEMY_API_KEY;
    expect(getEthRpcEndpoints()).toEqual([]);
    process.env.ALCHEMY_API_KEY = "k";
    const eps = getEthRpcEndpoints();
    expect(eps).toEqual(["https://eth-mainnet.g.alchemy.com/v2/k"]);
    expect(eps.flatMap(prohibitedHostsIn)).toEqual([]);
  });

  it("the Etherscan client refuses without a commercial plan and makes no request", async () => {
    delete process.env.ETHERSCAN_COMMERCIAL_PLAN;
    process.env.ETHERSCAN_API_KEY = "k";
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(etherscanFetch({ module: "account" })).rejects.toThrow(/does not permit commercial use/);
    process.env.ETHERSCAN_COMMERCIAL_PLAN = "yes";
    await expect(etherscanFetch({ module: "account" })).rejects.toThrow(/does not permit commercial use/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fear-greed-index carries Alternative.me's attribution beside the data", async () => {
    await import("../capabilities/fear-greed-index.js");
    const { getDirectExecutor } = await import("../capabilities/index.js");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      data: [{ value: "40", value_classification: "Fear", timestamp: "1789000000" }],
    })));
    const { output, provenance } = (await getDirectExecutor("fear-greed-index")!({})) as {
      output: Record<string, unknown>; provenance: Record<string, unknown>;
    };
    expect(output.current_value).toBe(40);
    expect(output.attribution).toMatch(/Alternative\.me .*https:\/\/alternative\.me\/crypto\/fear-and-greed-index\//);
    expect(provenance.source_url).toBe("https://alternative.me/crypto/fear-and-greed-index/");
  });

  it("the Etherscan client calls through once the plan is declared", async () => {
    process.env.ETHERSCAN_COMMERCIAL_PLAN = "true";
    process.env.ETHERSCAN_API_KEY = "k";
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "1", result: [] })));
    await expect(etherscanFetch({ module: "account" })).resolves.toEqual({ status: "1", result: [] });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
