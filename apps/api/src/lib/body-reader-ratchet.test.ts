/**
 * WP12 batch 3 (CR-12): a ratchet on the readers that are not yet bounded.
 *
 * `lib/resource-limits.ts` is the platform's one place that reads a response
 * body, decodes an image or collects a socket reply under a byte or pixel cap.
 * Batch 3 routed the readers whose upstream a caller chooses (a URL, a repo,
 * a package, a WHOIS server's reply) through it. What remains are reads of
 * FIXED vendor APIs (a raw `res.json()` on api.example.com with a caller value
 * in the path or query): 222 reads in 131 files at 2026-11-05. They are
 * FROZEN here, not capped. Converting them in one sweep would also rewrite the
 * many tests that hand those capabilities a bare `{ ok, json() }` object
 * instead of a Response, so they are counted instead.
 *
 * ## What is counted (TypeScript AST, not text)
 *
 *   - raw response reads: any zero-argument call of `json`, `text`,
 *     `arrayBuffer`, `blob` or `formData`, by property (`r.json()`,
 *     `r?.json()`) or by string-literal element access (`r["json"]()`),
 *     awaited or not, on one line or several. Receivers named `req` /
 *     `request` (the inbound request, bounded at the rail in app.ts) are not
 *     counted;
 *   - hand-rolled streams: any `getReader()` call outside resource-limits.ts;
 *   - image decodes: any `sharp(...)` call whose options do not carry
 *     `limitInputPixels` as a number or `MAX_INPUT_PIXELS` /
 *     `IMAGE_MAX_INPUT_PIXELS`. `false` is allowed only on a `.metadata()`
 *     chain (a header parse, whose result is checked with
 *     `assertInputPixelsWithinLimit`);
 *   - socket reads: every `on` / `once` / `addListener` / `prependListener` of
 *     `"data"`, minus one per `createCappedTextSink(` call in the same file,
 *     so a second listener beside a sink is counted.
 *
 * Files are skipped only if they are real test files (`*.test.ts`) or live in
 * `test-helpers/` / `test-support/`, which only tests import.
 *
 * ## What is not counted
 *
 * A NEW CALLER of an existing raw-read helper (a local function that wraps
 * `res.json()`) is not counted: the read inside the helper is, and it is
 * already in the baseline. Review that. Nor is anything that is not spelled as
 * the calls above (for example `await new Response(stream).text()` passes the
 * rule only because the `.text()` is counted; reading a body through a
 * library's own client is outside this check).
 *
 * ## Updating
 *
 * A file that gains a reader fails; a file that loses one must lower its
 * number in `body-reader-baseline.json` (the failure prints the current map).
 * Raising a number needs a reviewer to agree the upstream is fixed and its
 * answer cannot be made large by a caller.
 */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_INPUT_PIXELS } from "./resource-limits.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const BASELINE = JSON.parse(readFileSync(join(HERE, "body-reader-baseline.json"), "utf8")) as {
  raw_response_reads: Record<string, number>;
  unlimited_sharp_calls: Record<string, number>;
  socket_data_listeners: Record<string, number>;
};

const RAW_METHODS = new Set(["json", "text", "arrayBuffer", "blob", "formData"]);
const LISTEN_METHODS = new Set(["on", "once", "addListener", "prependListener"]);
const PIXEL_CAPS = new Set(["MAX_INPUT_PIXELS", "IMAGE_MAX_INPUT_PIXELS"]);
// Inbound request bodies are bounded at the rail (app.ts). Only Hono's own
// `c.req` / `ctx.req` is exempt everywhere; a bare `req` / `request` receiver
// (which `const request = await fetch(u)` also produces) is exempt only in the
// files that handle the incoming Request, listed here.
const HONO_REQ = /^(c|ctx)\.req$/;
const BARE_REQ = /^(req|request)(\.clone\(\))?$/;
const INBOUND_FILES = new Set(["routes/mcp.ts"]);

export interface Findings {
  testImports: number;
  rawReads: number;
  getReaders: number;
  unlimitedSharp: number;
  socketListeners: number;
}

/** The method name a call invokes, by property or string-literal element access. */
function calledMember(call: ts.CallExpression): { name: string; receiver: ts.Expression } | null {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) return { name: callee.name.text, receiver: callee.expression };
  if (
    ts.isElementAccessExpression(callee) &&
    (ts.isStringLiteral(callee.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(callee.argumentExpression))
  ) {
    return { name: callee.argumentExpression.text, receiver: callee.expression };
  }
  return null;
}

function isSharpCallee(expr: ts.Expression, names: Set<string>): boolean {
  if (ts.isIdentifier(expr)) return names.has(expr.text);
  if (ts.isPropertyAccessExpression(expr)) return ts.isIdentifier(expr.expression) && names.has(expr.expression.text) && expr.name.text === "default";
  return false;
}

/** Every local name the sharp module is bound to: default, namespace or require. */
function sharpNames(sf: ts.SourceFile): Set<string> {
  const names = new Set(["sharp"]);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text === "sharp") {
      const c = st.importClause;
      if (c?.name) names.add(c.name.text);
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) names.add(c.namedBindings.name.text);
    }
    if (
      ts.isImportEqualsDeclaration(st) &&
      ts.isExternalModuleReference(st.moduleReference) &&
      ts.isStringLiteral(st.moduleReference.expression) &&
      st.moduleReference.expression.text === "sharp"
    ) {
      names.add(st.name.text);
    }
  }
  return names;
}

const TEST_SUPPORT = /(^|\/)test-(helpers|support)(\/|$)/;

/** Is `limitInputPixels` in this options object a number or the shared cap? */
function limitOption(opts: ts.Expression | undefined): "ok" | "false" | "missing" | "bad" {
  if (!opts || !ts.isObjectLiteralExpression(opts)) return "missing";
  for (const p of opts.properties) {
    const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
    if (name !== "limitInputPixels") continue;
    if (ts.isShorthandPropertyAssignment(p)) return PIXEL_CAPS.has(p.name.text) ? "ok" : "bad";
    if (!ts.isPropertyAssignment(p)) return "bad";
    const v = p.initializer;
    if (v.kind === ts.SyntaxKind.FalseKeyword) return "false";
    // A literal must itself be a real cap: sharp treats 0 as "no limit", and a
    // number above the platform's own bound is no bound at all.
    if (ts.isNumericLiteral(v)) {
      const n = Number(v.text.replace(/_/g, ""));
      return n > 0 && n <= MAX_INPUT_PIXELS ? "ok" : "bad";
    }
    if (ts.isIdentifier(v) && PIXEL_CAPS.has(v.text)) return "ok";
    return "bad";
  }
  return "missing";
}

export function scan(fileName: string, text: string): Findings {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const f: Findings = { testImports: 0, rawReads: 0, getReaders: 0, unlimitedSharp: 0, socketListeners: 0 };
  const sharps = sharpNames(sf);
  const inboundFile = INBOUND_FILES.has(fileName);
  let sinks = 0;
  let listeners = 0;
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      TEST_SUPPORT.test(node.moduleSpecifier.text)
    ) {
      f.testImports++;
    }
    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        TEST_SUPPORT.test(node.arguments[0].text)
      ) {
        f.testImports++;
      }
      const member = calledMember(node);
      if (member) {
        const recv = member.receiver.getText(sf);
        const inbound = HONO_REQ.test(recv) || (inboundFile && BARE_REQ.test(recv));
        if (node.arguments.length === 0 && RAW_METHODS.has(member.name) && !inbound) f.rawReads++;
        if (node.arguments.length === 0 && member.name === "getReader") f.getReaders++;
        const first = node.arguments[0];
        if (LISTEN_METHODS.has(member.name) && first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && first.text === "data") listeners++;
      }
      if (isSharpCallee(node.expression, sharps)) {
        const lim = limitOption(node.arguments[1]);
        const parent = node.parent;
        const metadataChain =
          ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "metadata";
        if (!(lim === "ok" || (lim === "false" && metadataChain))) f.unlimitedSharp++;
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === "createCappedTextSink") sinks++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  f.socketListeners = Math.max(0, listeners - sinks);
  return f;
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // test-helpers/ and test-support/ hold only code that tests import.
      if (!["node_modules", "test-helpers", "test-support"].includes(name)) sources(full, out);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function inventory() {
  const raw: Record<string, number> = {};
  const sharp: Record<string, number> = {};
  const sockets: Record<string, number> = {};
  const readers: Record<string, number> = {};
  const testImports: Record<string, number> = {};
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file).split(sep).join("/");
    const f = scan(rel, readFileSync(file, "utf8"));
    if (f.testImports) testImports[rel] = f.testImports;
    // resource-limits.ts is the reader: its own stream consumption and its
    // bodyless-response fallback are the point.
    if (rel !== "lib/resource-limits.ts") {
      if (f.rawReads) raw[rel] = f.rawReads;
      if (f.getReaders) readers[rel] = f.getReaders;
    }
    if (f.unlimitedSharp) sharp[rel] = f.unlimitedSharp;
    if (f.socketListeners) sockets[rel] = f.socketListeners;
  }
  return { raw, sharp, sockets, readers, testImports };
}

function compare(kind: string, found: Record<string, number>, baseline: Record<string, number>, how: string, key: string) {
  const grew: string[] = [];
  const shrank: string[] = [];
  for (const f of new Set([...Object.keys(found), ...Object.keys(baseline)])) {
    const now = found[f] ?? 0;
    const was = baseline[f] ?? 0;
    if (now > was) grew.push(`${f}: ${was} -> ${now}`);
    if (now < was) shrank.push(`${f}: ${was} -> ${now}`);
  }
  const current = `Current "${key}" map: ${JSON.stringify(Object.fromEntries(Object.entries(found).sort(([x], [y]) => x.localeCompare(y))))}`;
  expect(grew, `${kind} added. ${how} ${current}`).toEqual([]);
  expect(
    shrank,
    `${kind} removed: lower the number in lib/body-reader-baseline.json so the ratchet holds. ${current}`,
  ).toEqual([]);
}

describe("unbounded readers only ever go down (resource-limits.ts is the body reader)", () => {
  const inv = inventory();

  it("raw .json() / .text() / .arrayBuffer() / .blob() / .formData() reads", () => {
    compare(
      "raw response reads",
      inv.raw,
      BASELINE.raw_response_reads,
      "Read it with readJsonWithLimit / readTextWithLimit / readBodyWithLimit / readJsonPickWithLimit from lib/resource-limits.ts.",
      "raw_response_reads",
    );
    expect(Object.values(inv.raw).reduce((a, b) => a + b, 0)).toBe(217);
  });

  it("no production file imports from test-helpers/ or test-support/ (those directories are not scanned)", () => {
    expect(inv.testImports).toEqual({});
  });

  it("response streams are only consumed inside resource-limits.ts", () => {
    expect(inv.readers, "use the readers in lib/resource-limits.ts instead of reading a stream by hand").toEqual({});
  });

  it("every sharp( decode carries limitInputPixels, except on the platform's own output", () => {
    compare(
      "sharp decodes without limitInputPixels",
      inv.sharp,
      BASELINE.unlimited_sharp_calls,
      "Pass { limitInputPixels: MAX_INPUT_PIXELS } and check the header with assertInputPixelsWithinLimit.",
      "unlimited_sharp_calls",
    );
  });

  it("raw socket reads", () => {
    compare(
      "socket data listeners",
      inv.sockets,
      BASELINE.socket_data_listeners,
      "Collect through createCappedTextSink from lib/resource-limits.ts (one listener per sink).",
      "socket_data_listeners",
    );
  });
});

describe("the counting cannot be bypassed by spelling", () => {
  const raw = (src: string, file = "x.ts") => scan(file, src).rawReads;
  it.each([
    ["awaited property call", "async function f(r: Response) { return await r.json(); }"],
    ["returned without await", "function f(r: Response) { return r.json(); }"],
    ["string-literal element access", 'function f(r: Response) { return r["json"](); }'],
    ["template-literal element access", "function f(r: Response) { return r[`text`](); }"],
    ["optional chain", "function f(r?: Response) { return r?.arrayBuffer(); }"],
    ["split over two lines", "function f(r: Response) {\n  return r\n    .json\n    ();\n}"],
    ["a promise chain", "function f(p: Promise<Response>) { return p.then((r) => r.blob()); }"],
    ["formData", "function f(r: Response) { return r.formData(); }"],
  ])("counts a raw read: %s", (_name, src) => {
    expect(raw(src)).toBe(1);
  });

  it("does not count calls with arguments, inbound requests or other methods", () => {
    expect(raw("const x = c.json({ a: 1 });")).toBe(0);
    expect(raw("const x = await c.req.json();")).toBe(0);
    expect(raw("const x = await ctx.req.text();")).toBe(0);
    expect(raw("const x = await req.clone().json();", "routes/mcp.ts")).toBe(0);
    expect(raw("const x = r.jsonp();")).toBe(0);
  });

  it("a fetched response named request is still counted", () => {
    expect(raw("const request = await fetch(u); return await request.json();")).toBe(1);
    expect(raw("function f(req: Response) { return req.text(); }")).toBe(1);
    expect(raw("function f(req: Request) { return req.json(); }", "capabilities/anything.ts")).toBe(1);
  });

  const sharp = (src: string) => scan("x.ts", src).unlimitedSharp;
  it.each([
    ["no options", "const s = sharp(buf);"],
    ["limitInputPixels: false on a decode", "const s = sharp(buf, { limitInputPixels: false });"],
    ["false on a pipeline that is not .metadata()", "const s = sharp(buf, { limitInputPixels: false }).resize(1).toBuffer();"],
    ["a variable of unknown size", "const s = sharp(buf, { limitInputPixels: n });"],
    ["zero (sharp treats it as no limit)", "const s = sharp(buf, { limitInputPixels: 0 });"],
    ["options elsewhere", "const s = sharp(buf, opts);"],
    ["sharp.default", "const s = sharp.default(buf);"],
    ["a literal above the platform's cap", "const s = sharp(buf, { limitInputPixels: 268_402_689 });"],
    ["a negative literal", "const s = sharp(buf, { limitInputPixels: -1 });"],
    ["an import alias", 'import s from "sharp";\nconst x = s(buf);'],
    ["a namespace import", 'import * as sh from "sharp";\nconst x = sh(buf, { limitInputPixels: false });'],
    ["a require alias", 'import s = require("sharp");\nconst x = s(buf);'],
    ["an aliased import's .default", 'import s from "sharp";\nconst x = s.default(buf);'],
  ])("counts an unlimited decode: %s", (_name, src) => {
    expect(sharp(src)).toBe(1);
  });

  it("accepts a numeric cap, the shared constants, and false only on .metadata()", () => {
    expect(sharp("const s = sharp(buf, { limitInputPixels: 60_000_000 });")).toBe(0);
    expect(sharp("const s = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS });")).toBe(0);
    expect(sharp("const s = sharp(buf, { limitInputPixels: IMAGE_MAX_INPUT_PIXELS, page });")).toBe(0);
    expect(sharp("const m = await sharp(buf, { limitInputPixels: false }).metadata();")).toBe(0);
  });

  const sock = (src: string) => scan("x.ts", src).socketListeners;
  it.each([
    ["on", 'socket.on("data", (c) => { d += c; });'],
    ["once", 'socket.once("data", (c) => { d += c; });'],
    ["addListener", 'socket.addListener("data", (c) => { d += c; });'],
    ["prependListener", 'socket.prependListener("data", f);'],
  ])("counts a data listener: %s", (_name, src) => {
    expect(sock(src)).toBe(1);
  });

  it("allows exactly one listener per createCappedTextSink call", () => {
    const one = 'const s = createCappedTextSink(10); socket.on("data", (c) => s.push(c));';
    expect(sock(one)).toBe(0);
    expect(sock(one + ' socket.on("data", (c) => { extra += c; });')).toBe(1);
    expect(sock(one + ' socket.addListener("data", (c) => { extra += c; });')).toBe(1);
    expect(sock('const s = createCappedTextSink(10); const t = createCappedTextSink(10); a.on("data", f); b.on("data", g);')).toBe(0);
  });

  it("scans production files whatever their name, including *testutil.ts", () => {
    const names = sources(SRC).map((f) => relative(SRC, f).split(sep).join("/"));
    expect(names).toContain("capabilities/lib/streaming-response-testutil.ts");
    expect(names.some((n) => n.endsWith(".test.ts"))).toBe(false);
  });

  it("accepts an aliased sharp import that carries the cap", () => {
    expect(sharp('import s from "sharp";\nconst x = s(buf, { limitInputPixels: MAX_INPUT_PIXELS });')).toBe(0);
  });

  it("counts imports from test-helpers/ and test-support/", () => {
    const t = (src: string) => scan("x.ts", src).testImports;
    expect(t('import { a } from "../test-helpers/upstream-replay.js";')).toBe(1);
    expect(t('export * from "./test-support/crash-child.js";')).toBe(1);
    expect(t('const m = await import("../test-support/x.js");')).toBe(1);
    expect(t('import { a } from "../lib/test-helpful.js";')).toBe(0);
  });

  it("counts getReader() and ignores comments and strings", () => {
    expect(scan("x.ts", "const r = res.body.getReader();").getReaders).toBe(1);
    expect(raw('// await res.json()\nconst s = "r.json()";\n/* r.text() */')).toBe(0);
  });
});
