/**
 * WP12 batch 4 (CR-19): the forwarded-IP trusted-hop rule.
 *
 * Hop structure: archive/receipts/2026-09-02-audit-verify-ip-proxy-hops.json
 * (one trusted hop, Railway's edge; no CDN). The rule is "the entry the one
 * trusted hop appended, i.e. the right-most X-Forwarded-For entry", and
 * X-Real-IP / CF-Connecting-IP are never read.
 *
 * Planted failure: the call-site tests below drive the REAL getClientIp
 * (middleware.ts), consumeIpRate (rate-limit.ts) and the discovery-hit
 * extractor. Against the pre-batch code, which read the LEFT-most entry
 * (and fell back to X-Real-IP / CF-Connecting-IP), the spoof tests fail:
 * a client varying only its left-most entry got a fresh identity every time.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import ts from "typescript";

import { clientIpFromHeaders, normalizeIp, TRUSTED_PROXY_HOPS } from "./client-ip.js";
import { getClientIp } from "./middleware.js";
import { rateLimitByIp } from "./rate-limit.js";

const fromHeaders = (h: Record<string, string>) =>
  clientIpFromHeaders((n) => h[n.toLowerCase()]);

describe("clientIpFromHeaders: the trusted-hop rule", () => {
  it("assumes exactly one trusted hop (receipt 2026-09-02)", () => {
    expect(TRUSTED_PROXY_HOPS).toBe(1);
  });

  it("a single entry is the client", () => {
    expect(fromHeaders({ "x-forwarded-for": "198.51.100.7" })).toBe("198.51.100.7");
  });

  it("ignores a client-typed left-most entry and takes the one the edge appended", () => {
    expect(fromHeaders({ "x-forwarded-for": "1.2.3.4, 198.51.100.7" })).toBe("198.51.100.7");
    expect(fromHeaders({ "x-forwarded-for": "8.8.8.8, 1.1.1.1, 9.9.9.9, 198.51.100.7" })).toBe("198.51.100.7");
  });

  it("multiple X-Forwarded-For header lines (joined with a comma) still resolve to the last entry", () => {
    const h = new Headers();
    h.append("x-forwarded-for", "1.2.3.4");
    h.append("x-forwarded-for", "5.6.7.8, 198.51.100.7");
    expect(clientIpFromHeaders((n) => h.get(n))).toBe("198.51.100.7");
  });

  it("never reads X-Real-IP or CF-Connecting-IP, alone or beside XFF", () => {
    expect(fromHeaders({ "x-real-ip": "1.2.3.4" })).toBeNull();
    expect(fromHeaders({ "cf-connecting-ip": "1.2.3.4" })).toBeNull();
    expect(
      fromHeaders({ "x-forwarded-for": "198.51.100.7", "x-real-ip": "1.2.3.4", "cf-connecting-ip": "5.6.7.8" }),
    ).toBe("198.51.100.7");
  });

  it("missing or empty header gives null (no shared 'unknown' identity)", () => {
    expect(fromHeaders({})).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "   " })).toBeNull();
  });

  it("a garbage right-most entry gives null rather than falling back to a client-typed one to its left", () => {
    expect(fromHeaders({ "x-forwarded-for": "1.2.3.4, not-an-ip" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "1.2.3.4," })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "1.2.3.4, 999.1.1.1" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "unknown" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "<script>, 198.51.100.7;drop" })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": "a".repeat(5000) })).toBeNull();
    expect(fromHeaders({ "x-forwarded-for": ":::" })).toBeNull();
  });

  it("IPv6: accepted, lower-cased, zone and brackets dropped", () => {
    expect(fromHeaders({ "x-forwarded-for": "2001:DB8::1" })).toBe("2001:db8::1");
    expect(fromHeaders({ "x-forwarded-for": "9.9.9.9, 2001:db8:0:0:0:0:0:1" })).toBe("2001:db8:0:0:0:0:0:1");
    expect(fromHeaders({ "x-forwarded-for": "fe80::1%eth0" })).toBe("fe80::1");
    expect(fromHeaders({ "x-forwarded-for": "[2001:db8::1]:443" })).toBe("2001:db8::1");
  });

  it("IPv4-mapped IPv6 is the same identity as the IPv4 address", () => {
    expect(fromHeaders({ "x-forwarded-for": "::ffff:198.51.100.7" })).toBe("198.51.100.7");
    expect(fromHeaders({ "x-forwarded-for": "::FFFF:198.51.100.7" })).toBe("198.51.100.7");
    expect(fromHeaders({ "x-forwarded-for": "0:0:0:0:0:ffff:198.51.100.7" })).toBe("198.51.100.7");
    expect(fromHeaders({ "x-forwarded-for": "::ffff:c633:6407" })).toBe("198.51.100.7");
    expect(fromHeaders({ "x-forwarded-for": "198.51.100.7:51234" })).toBe("198.51.100.7");
  });

  it("normalizeIp rejects non-IPs", () => {
    for (const bad of ["", "abc", "1.2.3", "1.2.3.4.5", "256.0.0.1", "::g", "1:2:3:4:5:6:7:8:9"]) {
      expect(normalizeIp(bad)).toBeNull();
    }
  });
});

describe("call sites go through the rule (planted failure: left-most / X-Real-IP read)", () => {
  it("getClientIp ignores a spoofed left-most entry", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(getClientIp(c)));
    const res = await app.request("/", { headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.7" } });
    expect(await res.text()).toBe("198.51.100.7");
  });

  it("getClientIp does not fall back to X-Real-IP", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(getClientIp(c)));
    const res = await app.request("/", { headers: { "x-real-ip": "6.6.6.6" } });
    expect(await res.text()).toBe("unknown");
  });

  it("a client varying only the left of X-Forwarded-For (or X-Real-IP / CF-Connecting-IP) stays in one rate-limit bucket", async () => {
    const app = new Hono();
    app.use("*", rateLimitByIp(3, 60_000, "client-ip-test"));
    app.get("/", (c) => c.text("ok"));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.request("/", {
        headers: {
          "x-forwarded-for": `10.${i}.0.1, 198.51.100.77`,
          "x-real-ip": `10.${i}.9.9`,
          "cf-connecting-ip": `10.${i}.8.8`,
        },
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
  });

  it("a request with no usable client IP is not rate limited into a shared bucket", async () => {
    const app = new Hono();
    app.use("*", rateLimitByIp(1, 60_000, "client-ip-test-null"));
    app.get("/", (c) => c.text("ok"));
    for (let i = 0; i < 3; i++) {
      expect((await app.request("/", { headers: { "x-real-ip": "10.0.0.1" } })).status).toBe(200);
    }
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
      if (rel.includes("test-helpers/") || rel.includes("test-support/")) continue;
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
