/**
 * WP12 batch 4 (CR-19): the forwarded-IP trusted-hop rule.
 *
 * Header shape: archive/receipts/2026-11-05-audit-xff-shape-production.json.
 * Production X-Forwarded-For is exactly `<client>, <railway-edge>` (two public
 * IPv4 entries; the edge address comes from a pool; a client-supplied header
 * is replaced, not appended to). The rule is "the entry one public hop left
 * of the trusted edge", and X-Real-IP / CF-Connecting-IP are never read.
 *
 * Planted failures, both directions:
 *   - #910's rule (right-most public entry; reverted in #912, incident
 *     docs/incidents/2026-11-05-client-ip-identity-collapse.md) fails the
 *     "receipt shape" tests: distinct clients behind one edge address
 *     collapse into one identity, and one client behind the edge pool gets
 *     a new identity per edge address.
 *   - The pre-batch rule (left-most entry, falling back to X-Real-IP /
 *     CF-Connecting-IP) fails the "append" and call-site spoof tests: a
 *     client varying only what it typed got a fresh identity every time.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import ts from "typescript";

import {
  isLoopbackPeer, clientIpFromHeaders, normalizeIp, TRUSTED_PROXY_HOPS,
  noteXffShape, publicEntryCount, resetXffShapeWarning, SHAPE_WARN_INTERVAL_MS,
} from "./client-ip.js";
import { getClientIp } from "./middleware.js";
import { rateLimitByIp } from "./rate-limit.js";

const fromHeaders = (h: Record<string, string>) =>
  clientIpFromHeaders((n) => h[n.toLowerCase()]);

/** Railway edge addresses: documentation ranges standing in for the receipt's edge pool. */
const EDGES = ["192.0.2.10", "192.0.2.11", "192.0.2.12", "192.0.2.13"];
/** Distinct callers, as in the incident's probe from rotating egress. */
const CLIENTS = ["198.51.100.7", "198.51.100.8", "203.0.113.20", "203.0.113.21", "2001:db8::42"];
const xff = (...entries: string[]) => ({ "x-forwarded-for": entries.join(", ") });

describe("clientIpFromHeaders: the receipt's production shape", () => {
  it("assumes exactly one trusted hop (Railway's edge)", () => {
    expect(TRUSTED_PROXY_HOPS).toBe(1);
  });

  it("<client>, <edge>: the client is the left entry, not the edge", () => {
    expect(fromHeaders(xff("198.51.100.7", "192.0.2.10"))).toBe("198.51.100.7");
  });

  it("distinct clients behind ONE edge address keep distinct identities (the #910 collapse)", () => {
    const ids = CLIENTS.map((client) => fromHeaders(xff(client, EDGES[0]!)));
    expect(ids).toEqual(CLIENTS);
    expect(new Set(ids).size).toBe(CLIENTS.length);
  });

  it("one client behind the whole edge pool keeps ONE identity", () => {
    const ids = EDGES.map((edge) => fromHeaders(xff("198.51.100.7", edge)));
    expect(new Set(ids)).toEqual(new Set(["198.51.100.7"]));
  });

  it("every client x edge pair resolves to the client", () => {
    for (const client of CLIENTS) {
      for (const edge of EDGES) expect(fromHeaders(xff(client, edge))).toBe(client);
    }
  });

  it("the edge replaces a forged header, so a forged value never reaches the app shape; if it were appended instead, the forged part is ignored", () => {
    // The receipt's forged call: "198.51.100.7, 10.0.0.1" sent, two public entries received.
    expect(fromHeaders(xff("203.0.113.20", "192.0.2.10"))).toBe("203.0.113.20");
    // Hypothetical append: <client-typed...>, <client>, <edge>.
    expect(fromHeaders(xff("198.51.100.7", "10.0.0.1", "203.0.113.20", "192.0.2.10"))).toBe("203.0.113.20");
    expect(fromHeaders(xff("8.8.8.8", "1.1.1.1", "9.9.9.9", "203.0.113.20", "192.0.2.10"))).toBe("203.0.113.20");
  });
});

describe("clientIpFromHeaders: other shapes", () => {
  it("a single public entry is the client (an edge that overwrites without adding itself)", () => {
    expect(fromHeaders(xff("198.51.100.7"))).toBe("198.51.100.7");
  });

  it("multiple X-Forwarded-For header lines (joined with a comma) are one list", () => {
    const h = new Headers();
    h.append("x-forwarded-for", "1.2.3.4");
    h.append("x-forwarded-for", "198.51.100.7, 192.0.2.10");
    expect(clientIpFromHeaders((n) => h.get(n))).toBe("198.51.100.7");
  });

  it("never reads X-Real-IP or CF-Connecting-IP, alone or beside XFF", () => {
    expect(fromHeaders({ "x-real-ip": "1.2.3.4" })).toBeNull();
    expect(fromHeaders({ "cf-connecting-ip": "1.2.3.4" })).toBeNull();
    expect(
      fromHeaders({ ...xff("198.51.100.7", "192.0.2.10"), "x-real-ip": "1.2.3.4", "cf-connecting-ip": "5.6.7.8" }),
    ).toBe("198.51.100.7");
  });

  it("missing or empty header gives null (no shared 'unknown' identity)", () => {
    expect(fromHeaders({})).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "   " })).toBeNull();
  });

  it("a garbage entry at or right of the client gives null rather than reaching further left", () => {
    expect(fromHeaders({ "x-forwarded-for": "1.2.3.4, not-an-ip" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "1.2.3.4," })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "1.2.3.4, 999.1.1.1" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "not-an-ip, 192.0.2.10" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "unknown" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "<script>, 198.51.100.7;drop" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "a".repeat(5000) })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": ":::" })).toBeNull();
  });

  it("garbage left of the client is never reached", () => {
    expect(fromHeaders(xff("junk", "198.51.100.7", "192.0.2.10"))).toBe("198.51.100.7");
  });

  it("IPv6: accepted, lower-cased, zone and brackets dropped", () => {
    expect(fromHeaders(xff("2001:DB8::1", "192.0.2.10"))).toBe("2001:db8::1");
    expect(fromHeaders(xff("2001:db8:0:0:0:0:0:1", "192.0.2.10"))).toBe("2001:db8:0:0:0:0:0:1");
    expect(fromHeaders(xff("2001:db8::5%eth0", "192.0.2.10"))).toBe("2001:db8::5");
    expect(fromHeaders(xff("[2001:db8::1]:443", "192.0.2.10"))).toBe("2001:db8::1");
    expect(fromHeaders(xff("2001:DB8::1"))).toBe("2001:db8::1");
  });

  it("IPv4-mapped IPv6 is the same identity as the IPv4 address", () => {
    expect(fromHeaders(xff("::ffff:198.51.100.7", "192.0.2.10"))).toBe("198.51.100.7");
    expect(fromHeaders(xff("::FFFF:198.51.100.7", "192.0.2.10"))).toBe("198.51.100.7");
    expect(fromHeaders(xff("0:0:0:0:0:ffff:198.51.100.7", "192.0.2.10"))).toBe("198.51.100.7");
    expect(fromHeaders(xff("::ffff:c633:6407", "192.0.2.10"))).toBe("198.51.100.7");
    expect(fromHeaders(xff("198.51.100.7:51234", "192.0.2.10"))).toBe("198.51.100.7");
  });

  it("skips internal hops on either side of the edge: they are never the client or the edge", () => {
    expect(fromHeaders(xff("203.0.113.7", "192.0.2.10", "10.0.0.5"))).toBe("203.0.113.7");
    expect(fromHeaders(xff("203.0.113.7", "100.64.1.2", "192.0.2.10"))).toBe("203.0.113.7");
    expect(fromHeaders(xff("203.0.113.7", "192.0.2.10", "172.16.0.1", "192.168.1.1", "169.254.1.1", "127.0.0.1"))).toBe("203.0.113.7");
    expect(fromHeaders(xff("203.0.113.7", "192.0.2.10", "fd00::1", "fe80::1", "::1"))).toBe("203.0.113.7");
    // A lone public entry with internal hops after it is still the single-entry case.
    expect(fromHeaders(xff("203.0.113.7", "10.0.0.5"))).toBe("203.0.113.7");
  });

  it("an internal entry LEFT of a lone public one: the public one is the edge, so null, never the edge (review M3)", () => {
    expect(fromHeaders(xff("100.64.1.2", "192.0.2.10"))).toBeNull();
    expect(fromHeaders(xff("10.0.0.5", "192.0.2.10"))).toBeNull();
    expect(fromHeaders(xff("10.0.0.5", "192.0.2.10", "10.0.0.9"))).toBeNull();
  });

  it("only internal entries means no public client", () => {
    expect(fromHeaders(xff("10.0.0.5"))).toBeNull();
    expect(fromHeaders(xff("10.0.0.5", "192.168.0.1"))).toBeNull();
    expect(fromHeaders(xff("::1"))).toBeNull();
    expect(fromHeaders(xff("::ffff:10.0.0.5"))).toBeNull();
  });

  it("IPv4-mapped internal addresses are internal", () => {
    expect(fromHeaders(xff("203.0.113.7", "192.0.2.10", "::ffff:10.0.0.5"))).toBe("203.0.113.7");
    expect(fromHeaders(xff("203.0.113.7", "::ffff:a00:5", "192.0.2.10"))).toBe("203.0.113.7");
  });

  it("an unparseable entry stops the walk instead of exposing one further left", () => {
    expect(fromHeaders(xff("198.51.100.9", "junk", "192.0.2.10"))).toBeNull();
    expect(fromHeaders(xff("198.51.100.9", "junk", "10.0.0.5"))).toBeNull();
  });

  it("normalizeIp rejects non-IPs", () => {
    for (const bad of ["", "abc", "1.2.3", "1.2.3.4.5", "256.0.0.1", "::g", "1:2:3:4:5:6:7:8:9"]) {
      expect(normalizeIp(bad)).toBeNull();
    }
  });
});

describe("shape alarm: a header that is not <client>, <edge> is logged, address-free and throttled", () => {
  it("publicEntryCount counts public entries; null on garbage", () => {
    expect(publicEntryCount("198.51.100.7, 192.0.2.10")).toBe(2);
    expect(publicEntryCount("198.51.100.7, 192.0.2.10, 10.0.0.1")).toBe(2);
    expect(publicEntryCount("198.51.100.7, 192.0.2.10, 192.0.2.11")).toBe(3);
    expect(publicEntryCount("198.51.100.7")).toBe(1);
    expect(publicEntryCount("junk, 192.0.2.10")).toBeNull();
  });

  it("the measured shape never warns; another shape warns once per interval, with no address in the payload", () => {
    resetXffShapeWarning();
    const calls: Array<[object, string]> = [];
    const warn = (o: object, m: string) => { calls.push([o, m]); };
    expect(noteXffShape("198.51.100.7, 192.0.2.10", 1_000, warn)).toBe(false);
    expect(noteXffShape(undefined, 1_000, warn)).toBe(false);
    expect(noteXffShape("198.51.100.7, 192.0.2.10, 192.0.2.11", 1_000, warn)).toBe(true);
    expect(noteXffShape("198.51.100.7", 2_000, warn)).toBe(false);
    expect(noteXffShape("198.51.100.7", 1_000 + SHAPE_WARN_INTERVAL_MS, warn)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toMatchObject({ label: "xff-shape-unexpected", public_entries: 3, total_entries: 3, expected_public_entries: 2 });
    for (const [o, m] of calls) expect(JSON.stringify(o) + m).not.toMatch(/\d+\.\d+\.\d+\.\d+|[0-9a-f]+:[0-9a-f:]+/i);
    resetXffShapeWarning();
  });
});

describe("call sites go through the rule (planted failure: left-most / X-Real-IP read)", () => {
  it("getClientIp ignores a spoofed left-most entry", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(getClientIp(c)));
    const res = await app.request("/", { headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.7, 192.0.2.10" } });
    expect(await res.text()).toBe("198.51.100.7");
  });

  it("getClientIp does not fall back to X-Real-IP", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(getClientIp(c)));
    const res = await app.request("/", { headers: { "x-real-ip": "6.6.6.6" } });
    expect(await res.text()).toBe("unknown");
  });

  it("getClientIp returns the client, not the edge, for the production shape", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(getClientIp(c)));
    const res = await app.request("/", { headers: { "x-forwarded-for": "198.51.100.7, 192.0.2.10" } });
    expect(await res.text()).toBe("198.51.100.7");
  });

  it("two clients behind one edge address get separate rate-limit buckets (the #910 collapse)", async () => {
    const app = new Hono();
    app.use("*", rateLimitByIp(2, 60_000, "client-ip-test-edge"));
    app.get("/", (c) => c.text("ok"));
    const statuses: number[] = [];
    for (const client of ["198.51.100.7", "198.51.100.7", "203.0.113.20", "203.0.113.20"]) {
      statuses.push((await app.request("/", { headers: { "x-forwarded-for": `${client}, 192.0.2.10` } })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200]);
  });

  it("a client varying only the left of X-Forwarded-For (or X-Real-IP / CF-Connecting-IP) stays in one rate-limit bucket", async () => {
    const app = new Hono();
    app.use("*", rateLimitByIp(3, 60_000, "client-ip-test"));
    app.get("/", (c) => c.text("ok"));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.request("/", {
        headers: {
          "x-forwarded-for": `6.6.${i}.1, 198.51.100.77, ${EDGES[i % EDGES.length]}`,
          "x-real-ip": `10.${i}.9.9`,
          "cf-connecting-ip": `10.${i}.8.8`,
        },
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
  });

  it("a request with no usable client IP shares one fail-closed 'unknown' bucket", async () => {
    const app = new Hono();
    app.use("*", rateLimitByIp(2, 60_000, "client-ip-test-null"));
    app.get("/", (c) => c.text("ok"));
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await app.request("/", { headers: { "x-real-ip": "10.0.0.1" } })).status);
    expect(statuses).toEqual([200, 200, 429, 429]);
  });
});

describe("loopback self-calls (MCP trust prewarm)", () => {
  const env = (addr: string) => ({ incoming: { socket: { remoteAddress: addr, remotePort: 1, remoteFamily: "IPv4" } } });
  const mk = (scope: string) => {
    const app = new Hono();
    app.use("*", rateLimitByIp(120, 60_000, scope));
    app.get("/v1/public/ops/trust/x", (c) => c.text("ok"));
    return app;
  };
  const call = (app: Hono, addr: string | null, headers: Record<string, string> = {}) =>
    app.request("/v1/public/ops/trust/x", { headers }, addr === null ? undefined : env(addr)).then((r) => r.status);

  it("isLoopbackPeer: 127/8, ::1, mapped 127; not private or public; false without a socket", () => {
    const c = (a: string) => ({ env: env(a) }) as never;
    expect(isLoopbackPeer(c("127.0.0.1"))).toBe(true);
    expect(isLoopbackPeer(c("::1"))).toBe(true);
    expect(isLoopbackPeer(c("::ffff:127.0.0.1"))).toBe(true);
    expect(isLoopbackPeer(c("10.0.0.5"))).toBe(false);
    expect(isLoopbackPeer(c("203.0.113.7"))).toBe(false);
    expect(isLoopbackPeer({ env: undefined } as never)).toBe(false);
  });

  it("(a)(d) loopback peer, no X-Forwarded-For: 300 calls (> 120/min) are never limited", async () => {
    const app = mk("lo-a");
    for (let i = 0; i < 300; i++) expect(await call(app, "127.0.0.1")).toBe(200);
  });

  it("(b) non-loopback peer, no X-Forwarded-For: shared unknown bucket, 429 past the limit", async () => {
    const app = mk("lo-b");
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push(await call(app, "10.1.2.3"));
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(120)).toEqual([429, 429, 429, 429, 429]);
    expect(await call(mk("lo-b2"), null)).toBe(200); // no socket info: still counted, fresh scope
  });

  it("(c) loopback peer: internal-only X-Forwarded-For is still a self-call; a public one is keyed on that IP", async () => {
    const app = mk("lo-c");
    for (let i = 0; i < 150; i++) expect(await call(app, "127.0.0.1", { "x-forwarded-for": "10.0.0.5" })).toBe(200);
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push(await call(app, "127.0.0.1", { "x-forwarded-for": "198.51.100.20" }));
    expect(statuses.slice(120)).toEqual([429, 429, 429, 429, 429]);
  });
});

// ─── Structural ratchet ────────────────────────────────────────────────────

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HEADER_RE = /x-forwarded-for|x-real-ip|cf-connecting-ip|x-client-ip|true-client-ip|forwarded-for/i;
/** Only client-ip.ts may name these headers. nginx-config-generate.ts writes them into a customer's nginx prompt. */
const ALLOWED = new Set(["src/lib/client-ip.ts", "src/capabilities/nginx-config-generate.ts"]);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
}

describe("single-function ratchet", () => {
  it("no production file outside lib/client-ip.ts names a client-IP header in code", () => {
    const files: string[] = [];
    walk(SRC_ROOT, files);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(API_ROOT, f).split(sep).join("/");
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(f, "utf8");
      if (!HEADER_RE.test(text)) continue;
      const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
      const visit = (n: ts.Node): void => {
        if (
          (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) ||
            ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) &&
          HEADER_RE.test(n.text)
        ) {
          offenders.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(offenders).toEqual([]);
  });
});
