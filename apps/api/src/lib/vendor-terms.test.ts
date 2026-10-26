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
import { dirname, join, relative, resolve } from "node:path";
import { PROHIBITED_UPSTREAM_HOSTS, VENDOR_TERMS_RECORDS, prohibitedHostsIn } from "./vendor-terms.js";
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

  it("no operator script under apps/api/scripts calls a prohibited upstream", () => {
    // Review of #633: scripts run against production too, and are not executors,
    // so no DEACTIVATED entry or gate can cover them — any reference fails.
    const SCRIPTS = resolve(SRC, "..", "scripts");
    const scan = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { if (name !== "archive" && name !== "node_modules") scan(full, out); }
        else if (/\.(ts|mjs|js)$/.test(name) && !/\.test\./.test(name)) out.push(full);
      }
      return out;
    };
    const files = scan(SCRIPTS);
    expect(files.length, "scanned no scripts").toBeGreaterThan(20);
    const hits = files
      .map((f) => ({ f: relative(SCRIPTS, f).replace(/\\/g, "/"), hosts: prohibitedHostsIn(codeOnly(readFileSync(f, "utf8"))) }))
      .filter((h) => h.hosts.length > 0)
      .map((h) => `${h.f}: ${h.hosts.join(", ")}`);
    expect(hits).toEqual([]);
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

describe("recorded vendor terms (DEC-20261023-A: resale terms verified and recorded)", () => {
  const CAPS = resolve(SRC, "capabilities");
  // Every source file under capabilities/, recursively, with comments stripped
  // so an explanation that names a host is not mistaken for a call.
  const files = walk(CAPS).map((f) => {
    const src = readFileSync(f, "utf8");
    const code = codeOnly(src);
    return { path: f, file: rel(f), code, slug: code.match(/registerCapability\(\s*["'`]([^"'`]+)["'`]/)?.[1] };
  });
  const directlyCallsVendor = (code: string, record: (typeof VENDOR_TERMS_RECORDS)[number]) =>
    record.hosts.some((h) => code.includes(h)) || code.includes(`meteredVendorFetch("${record.metered_id ?? "\u0000"}"`);
  // Follow literal static/dynamic imports of shared capability helpers, so factoring a fetch
  // into lib/ does not hide its callers or require an exemption allowlist.
  const byPath = new Map(files.map(f => [f.path, f]));
  function sharedImports(file: (typeof files)[number]) {
    return [...file.code.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'`](\.[^"'`]+)["'`]/g)]
      .map(m => byPath.get(resolve(dirname(file.path), m[1].replace(/\.js$/, ".ts"))))
      .filter((f): f is (typeof files)[number] => !!f && !f.slug);
  }
  function reaches(from: (typeof files)[number], target: (typeof files)[number], seen = new Set<string>()): boolean {
    if (from === target) return true;
    if (seen.has(from.path)) return false;
    seen.add(from.path);
    return sharedImports(from).some(f => reaches(f, target, seen));
  }
  const callsVendor = (file: (typeof files)[number], record: (typeof VENDOR_TERMS_RECORDS)[number]) =>
    files.some(target => directlyCallsVendor(target.code, record) && reaches(file, target));

  for (const record of VENDOR_TERMS_RECORDS) {
    it(`${record.vendor}: lists exactly the executors that call it`, () => {
      const callers = files
        .filter((f) => f.slug && callsVendor(f, record))
        .map((f) => f.slug as string)
        .sort();
      expect([...record.capabilities].sort()).toEqual(callers);
    });

    it(`${record.vendor}: no shared client outside an executor calls it unrecorded`, () => {
      // An imported helper is accounted for through every executor that uses
      // it. Orphan clients still fail: their callers have not been recorded.
      const shared = files.filter(f => !f.slug && directlyCallsVendor(f.code, record)
        && !files.some(caller => caller.slug && record.capabilities.includes(caller.slug) && reaches(caller, f)))
        .map(f => f.file);
      expect(shared).toEqual([]);
    });

    it(`${record.vendor}: carries its evidence`, () => {
      expect(record.terms_url).toMatch(/^https:\/\//);
      expect(record.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.how_read.length).toBeGreaterThan(20);
      expect(record.findings.length).toBeGreaterThan(0);
      expect(record.decision_ref.length).toBeGreaterThan(0);
    });
  }

  it("an unverified vendor still in use names a decision-queue entry that is OPEN and your_call", () => {
    const queue = readFileSync(resolve(SRC, "../../../docs/company/DECISION-QUEUE.md"), "utf8");
    const open = queue.slice(queue.indexOf("## OPEN"), queue.indexOf("## DECIDED"));
    for (const r of VENDOR_TERMS_RECORDS.filter((x) => x.resale === "unverified" && x.capabilities.length > 0)) {
      const dq = r.decision_ref.match(/DQ-\d+/)?.[0];
      expect(dq, `${r.vendor} has no DQ reference`).toBeDefined();
      const line = open.split("\n").find((l) => l.startsWith(`**${dq}**`));
      expect(line, `${dq} is not in the OPEN section`).toBeDefined();
      expect(line).toContain("`your_call`");
    }
  });

  it("a vendor recorded as removed is also a prohibited host, so it cannot quietly return", () => {
    for (const r of VENDOR_TERMS_RECORDS.filter((x) => x.capabilities.length === 0)) {
      for (const h of r.hosts) expect(PROHIBITED_UPSTREAM_HOSTS.has(h), h).toBe(true);
    }
  });
});
