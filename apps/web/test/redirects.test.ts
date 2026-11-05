// Every path of today's strale.dev (strale-frontend src/App.tsx routes and public/sitemap.xml) must
// end in a page of the new site or a redirect to one (SWITCH-OVER-READINESS item 4). Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRedirects, resolveRedirect } from "../src/lib/redirects.ts";

const web = resolve(import.meta.dirname, "..");
const rules = parseRedirects(readFileSync(resolve(web, "public/_redirects"), "utf8"));

/** A page the build emits: src/pages/<path>.astro or <path>/index.astro, or a generated family. */
function hasPage(path: string): boolean {
  if (path === "/") return true;
  const p = path.replace(/^\//, "");
  if (existsSync(resolve(web, "src/pages", `${p}.astro`)) || existsSync(resolve(web, "src/pages", p, "index.astro"))) return true;
  return /^\/(tools|solutions|company-data|use-cases)\/[^/]+$/.test(path);
}
// /guides/* is built in another lane; it counts as a page here so the redirect can point at it.
const planned = (path: string) => path === "/guides" || /^\/guides\/[^/]+$/.test(path);

function outcome(path: string): { kind: "page" | "rewrite" | "redirect" | "none"; to?: string } {
  const r = resolveRedirect(rules, path);
  if (r) {
    if (r.status === 200) return hasPage(r.to) ? { kind: "rewrite", to: r.to } : { kind: "none" };
    return hasPage(r.to) || planned(r.to) ? { kind: "redirect", to: r.to } : { kind: "none", to: r.to };
  }
  return hasPage(path) || planned(path) ? { kind: "page" } : { kind: "none" };
}

// Today's routes (App.tsx) with a representative slug for each parameter.
const OLD_PATHS: [string, string][] = [
  ["/", "page"], ["/topup", "page"], ["/integrations", "redirect"], ["/capabilities", "redirect"],
  ["/capabilities/iban-validate", "redirect"], ["/solutions", "redirect"], ["/solutions/kyb-essentials-se", "page"],
  ["/pricing", "page"], ["/docs", "page"], ["/security", "page"], ["/privacy", "page"], ["/terms", "page"],
  ["/signup", "page"], ["/trust", "redirect"], ["/trust/methodology", "redirect"], ["/design-system", "redirect"],
  ["/learn", "redirect"], ["/learn/swedish-company-lookup", "redirect"], ["/guides", "page"],
  ["/guides/swedish-company-lookup-api", "page"], ["/audit/0b7f2a9e-1c3d-4e5f-8a6b-7c8d9e0f1a2b", "rewrite"],
  ["/logo-explorations", "redirect"],
];

test("every path of today's site resolves to a page, a rewrite or a redirect to a page", () => {
  for (const [path, kind] of OLD_PATHS) assert.equal(outcome(path).kind, kind, path);
});

test("the redirect targets are the ones SITE-STRUCTURE.md names", () => {
  assert.deepEqual(outcome("/capabilities"), { kind: "redirect", to: "/tools" });
  assert.deepEqual(outcome("/capabilities/iban-validate"), { kind: "redirect", to: "/tools/iban-validate" });
  assert.deepEqual(outcome("/trust/methodology"), { kind: "redirect", to: "/security" });
  assert.deepEqual(outcome("/integrations"), { kind: "redirect", to: "/docs" });
  assert.deepEqual(outcome("/learn/x402-guide"), { kind: "redirect", to: "/guides/x402-guide" });
  assert.deepEqual(outcome("/design-system"), { kind: "redirect", to: "/" });
});

test("redirects are permanent and /audit/* is a rewrite that keeps the address", () => {
  for (const r of rules) assert.ok(r.status === 301 || (r.status === 200 && r.from === "/audit/*"), r.from);
  assert.deepEqual(resolveRedirect(rules, "/audit/abc"), { status: 200, to: "/audit" });
});

test("no rule shadows a page the new site serves", () => {
  for (const p of ["/tools", "/pricing", "/docs", "/security", "/about", "/audit", "/topup", "/solutions/kyb-complete-se"]) {
    const r = resolveRedirect(rules, p);
    assert.ok(!r, `${p} is redirected to ${r?.to}`);
  }
});
