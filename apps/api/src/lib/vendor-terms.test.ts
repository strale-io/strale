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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
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
  function sourceFile(path: string, src = readFileSync(path, "utf8")) {
    const code = codeOnly(src);
    return { path, file: rel(path), code, slug: code.match(/registerCapability\(\s*["'`]([a-z0-9-]+)["'`]/)?.[1] };
  }
  const files = walk(CAPS).map(f => sourceFile(f));
  const withoutMetadata = new Map<string, string>();
  const directlyCallsVendor = (code: string, record: (typeof VENDOR_TERMS_RECORDS)[number]) => {
    // Remove literal provenance/label values only. Every remaining host counts,
    // regardless of which HTTP helper (or alias) performs the request.
    const original = code;
    const cached = withoutMetadata.get(code);
    if (cached !== undefined) code = cached;
    else {
      // A label is stripped only if this file never reads that property back:
      // a value that is read (cfg.source_url, t["label"]) may feed a request.
      const labels = new Set(["source", "source_url", "upstream_vendor", "primary_source_reference", "label", "name"]
        .filter(p => !new RegExp(`\\.${p}\\b|\\[\\s*["'\x60]${p}["'\x60]\\s*\\]`).test(code)));
      const tree = ts.createSourceFile("vendor-client.ts", code, ts.ScriptTarget.Latest, true);
      const spans: Array<[number, number]> = [];
      function visit(node: ts.Node) {
        const value = ts.isPropertyAssignment(node) && labels.has(node.name.getText(tree).replace(/^['"]|['"]$/g, ""))
          ? node.initializer
          : ts.isLabeledStatement(node) && labels.has(node.label.text) && ts.isExpressionStatement(node.statement)
            ? node.statement.expression : undefined;
        if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) {
          spans.push([value.getStart(tree), value.getEnd()]);
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
      for (const [start, end] of spans.sort((a, b) => b[0] - a[0])) code = code.slice(0, start) + '""' + code.slice(end);
      withoutMetadata.set(original, code);
    }
    return record.hosts.some(host => code.includes(host)) ||
      code.includes(`meteredVendorFetch("${record.metered_id ?? "\u0000"}"`);
  };
  // Follow literal imports and re-exports into capability helpers and reachable
  // src/lib helpers. Do not scan unrelated lib clients (e.g. health probes).
  const byPath = new Map(files.map(f => [f.path, f]));
  const importCache = new Map<string, (typeof files)>();
  function sharedImports(file: (typeof files)[number]) {
    // Registration infrastructure is a graph boundary, just like other
    // executors: importing registerCapability/getDirectExecutor is not a
    // customer call into every provider and its operational health probes.
    if (/export\s+function\s+registerCapability\s*\(/.test(file.code)) return [];
    const cached = importCache.get(file.path);
    if (cached) return cached;
    const imports: string[] = [];
    const tree = ts.createSourceFile(file.path, file.code, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
        const typeOnly = ts.isExportDeclaration(node) ? node.isTypeOnly : clause?.isTypeOnly ||
          (clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name &&
            clause.namedBindings.elements.every(e => e.isTypeOnly));
        if (!typeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) imports.push(arg.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    const helpers = imports.filter(specifier => specifier.startsWith("."))
      .map(specifier => {
        const path = resolve(dirname(file.path), specifier.replace(/\.js$/, ".ts"));
        if (!byPath.has(path) && rel(path).startsWith("lib/") && path.endsWith(".ts")
          && !path.endsWith(".test.ts") && existsSync(path)) {
          const helper = sourceFile(path);
          byPath.set(path, helper);
          files.push(helper);
        }
        return byPath.get(path);
      })
      .filter((f): f is (typeof files)[number] => !!f && !f.slug);
    importCache.set(file.path, helpers);
    return helpers;
  }
  // Expand only from executors. Capability helpers remain in files for orphan
  // detection, but their unrelated operational imports do not seed a lib scan.
  const queue = files.filter(f => f.slug);
  const visited = new Set<string>();
  for (const file of queue) {
    if (visited.has(file.path)) continue;
    visited.add(file.path);
    queue.push(...sharedImports(file));
  }
  function reaches(from: (typeof files)[number], target: (typeof files)[number], seen = new Set<string>()): boolean {
    if (from === target) return true;
    if (seen.has(from.path)) return false;
    seen.add(from.path);
    return (importCache.get(from.path) ?? (from.slug ? sharedImports(from) : [])).some(f => reaches(f, target, seen));
  }
  const callsVendor = (file: (typeof files)[number], record: (typeof VENDOR_TERMS_RECORDS)[number]) =>
    files.some(target => directlyCallsVendor(target.code, record) && reaches(file, target));

  function exactCallers(record: (typeof VENDOR_TERMS_RECORDS)[number], candidates = files) {
    return candidates.filter(f => f.slug && callsVendor(f, record)).map(f => f.slug as string).sort();
  }
  function assertExactCallers(record: (typeof VENDOR_TERMS_RECORDS)[number], candidates = files) {
    expect([...record.capabilities].sort()).toEqual(exactCallers(record, candidates));
  }

  it.each([
    'import { brregFetch } from "../lib/brreg-fetch.js";',
    'export { brregFetch } from "../lib/brreg-fetch.js";',
    'const helper = import("../lib/brreg-fetch.js");',
  ])("rejects an unrecorded executor reaching src/lib/brreg-fetch.ts: %s", imports => {
    const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Brønnøysundregistrene")!;
    const extra = sourceFile(join(CAPS, "unrecorded-brreg-fixture.ts"),
      `${imports} registerCapability("unrecorded-brreg-fixture", handler);`);
    importCache.delete(extra.path);
    expect(exactCallers(record, [...files, extra])).toContain("unrecorded-brreg-fixture");
    expect(() => assertExactCallers(record, [...files, extra])).toThrow();
    importCache.delete(extra.path);
  });

  it.each([
    'const HOST = "data.brreg.no"; fetch(`https://${HOST}/x`);',
    'fetch(`https://data.brreg.no${path}`);',
    'getDirectExecutor("other"); fetch(`https://data.brreg.no${path}`);',
    'import { request } from "undici"; getDirectExecutor("other"); request("https://data.brreg.no/x");',
  ])("rejects an unrecorded executor constructing a vendor URL: %s", code => {
    const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Brønnøysundregistrene")!;
    const extra = sourceFile(join(CAPS, "unrecorded-url-probe.ts"),
      `${code} registerCapability("unrecorded-url-probe", handler);`);
    // Direct probes must participate in the same reachability/exact-callers guard.
    files.push(extra);
    try {
      expect(exactCallers(record)).toContain("unrecorded-url-probe");
      expect(() => assertExactCallers(record)).toThrow();
    } finally {
      files.splice(files.indexOf(extra), 1);
      importCache.delete(extra.path);
    }
  });

  function unrecordedShared(record: (typeof VENDOR_TERMS_RECORDS)[number], candidates = files) {
    return candidates.filter(f => !f.slug && directlyCallsVendor(f.code, record)
      && !candidates.some(caller => caller.slug && record.capabilities.includes(caller.slug) && reaches(caller, f)))
      .map(f => f.file);
  }

  it("still rejects an orphan capability helper, and does not mistake provenance for a call", () => {
    const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Brønnøysundregistrene")!;
    const orphan = sourceFile(join(CAPS, "lib/orphan-brreg-fixture.ts"), 'fetch("https://data.brreg.no/enhetsregisteret/api/enheter/123456789");');
    expect(unrecordedShared(record, [...files, orphan])).toEqual([orphan.file]);
    expect(directlyCallsVendor('getDirectExecutor("norwegian-company-data"); source: "data.brreg.no"', record)).toBe(false);
    expect(directlyCallsVendor('fetch("https://dataXbrregYno/")', record)).toBe(false);
  });

  it.each(["fetchPage", "fetchWithRetry", "browserlessFetch", "gleifFetch", "aliasedFetch", "new Request"])(
    "delegation cannot hide an HTTP helper: %s", helper => {
      const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Brønnøysundregistrene")!;
      expect(directlyCallsVendor(`getDirectExecutor("x"); ${helper}("https://data.brreg.no/x")`, record)).toBe(true);
    },
  );
  it.each(["source", "source_url", "upstream_vendor", "primary_source_reference", "label", "name"])(
    "ignores only literal %s metadata", property => {
      const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Brønnøysundregistrene")!;
      expect(directlyCallsVendor(`const metadata = { "${property}": "data.brreg.no" };`, record)).toBe(false);
      expect(directlyCallsVendor(`const metadata = { ${property}: "data.brreg.no" }; fetchPage("https://data.brreg.no/x")`, record)).toBe(true);
    },
  );
  it.each(["source", "source_url", "upstream_vendor", "primary_source_reference", "label", "name"])(
    "counts a %s value that the file reads back, since it may feed a request", property => {
      const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Brønnøysundregistrene")!;
      expect(directlyCallsVendor(`const cfg = { ${property}: "https://data.brreg.no/x" }; fetch(cfg.${property});`, record)).toBe(true);
      expect(directlyCallsVendor(`const t = { ${property}: "data.brreg.no" }; fetch(\`https://\${t["${property}"]}/x\`);`, record)).toBe(true);
    },
  );

  it("does not treat the delegating Norway provider as a vendor client or orphan", () => {
    const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Brønnøysundregistrene")!;
    const provider = files.find(f => f.file === "capabilities/providers/norwegian-company-data.ts")!;
    expect(provider.code).toContain("getDirectExecutor");
    expect(callsVendor(provider, record)).toBe(false);
    expect(files.map(f => f.file)).not.toContain("lib/dependency-manifest.ts");
    expect(files.map(f => f.file)).not.toContain("lib/situation-assessment.ts");
  });

  for (const record of VENDOR_TERMS_RECORDS) {
    it(`${record.vendor}: lists exactly the executors that call it`, () => {
      assertExactCallers(record);
    });

    it(`${record.vendor}: no shared client outside an executor calls it unrecorded`, () => {
      // An imported helper is accounted for through every executor that uses
      // it. Orphan clients still fail: their callers have not been recorded.
      const shared = unrecordedShared(record);
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
