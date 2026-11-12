import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

// Promise-audit T1 follow-up 41. targetUnavailable(site, status) files a
// site's 4xx as the target's answer: unbilled and never counted against the
// capability. That is only true when Strale's request could not have caused
// the 4xx. The one request header a page fetcher chooses that a site can
// reject is Accept (a 406). Every safeFetch in a tool that calls
// targetUnavailable must therefore accept any content type: Accept unset
// (Node's fetch sends */*) or a value that lists */* with a q above 0.
// Any other request-caused 4xx cannot come from these calls: safeFetch keeps
// Host and SNI on the requested name (421), a GET carries no body (411, 413,
// 417), and the request headers are a few hundred bytes (431).
//
// The check is fail-closed: options or headers it cannot read statically (a
// variable, a spread, a computed key, a shorthand `headers` or `Accept`) fail
// the test rather than pass it, and so does any use of safeFetch other than a
// direct call (an alias, .call, an element access, spread arguments). Both
// functions are found through their import declarations, so importing under
// another name or as a namespace is still seen.
const dir = new URL("../capabilities/", import.meta.url);

/** Every capability that calls targetUnavailable today. A tool added or removed changes this list on purpose. */
// How many direct safeFetch calls each file makes. Pinned so a call the
// checker cannot see (through another module, or a pattern it does not parse)
// shows up as a count that no longer matches; update a count only after
// reading the new call.
const EXPECTED_CALLS: Record<string, number> = {
  "cookie-scan.ts": 1,
  "domain-contact-extract.ts": 2,
  "domain-reputation.ts": 1,
  "gdpr-website-check.ts": 1,
  "header-security-check.ts": 1,
  "link-extract.ts": 1,
  "meta-extract.ts": 1,
  "og-image-check.ts": 3,
  "page-exists.ts": 1,
  "port-check.ts": 0,
  "website-carbon-estimate.ts": 1,
};
const EXPECTED_FILES = Object.keys(EXPECTED_CALLS);

function nodes<T extends ts.Node>(root: ts.Node, predicate: (n: ts.Node) => n is T): T[] {
  const found: T[] = [];
  const walk = (n: ts.Node) => { if (predicate(n)) found.push(n); ts.forEachChild(n, walk); };
  walk(root); return found;
}

/** Local names under which `name` from `module` is reachable: direct bindings and namespace aliases. */
function importedAs(src: ts.SourceFile, module: string, name: string) {
  const direct = new Set<string>();
  const namespaces = new Set<string>();
  for (const stmt of src.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== module) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    else for (const el of bindings.elements) {
      if ((el.propertyName ?? el.name).text === name) direct.add(el.name.text);
    }
  }
  const isCall = (call: ts.CallExpression) => {
    const callee = call.expression;
    if (ts.isIdentifier(callee)) return direct.has(callee.text);
    return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
      && namespaces.has(callee.expression.text) && callee.name.text === name;
  };
  /**
   * Every use of the binding that is NOT a direct call `name(...)` or
   * `ns.name(...)`: an alias (`const f = safeFetch`), `.call`/`.apply`, an
   * element access, parentheses or `!` around the callee. Each one could call
   * the function out of the checker's sight, so each one fails the test.
   */
  const indirectUses = (root: ts.SourceFile): ts.Node[] => nodes(root, ts.isIdentifier).filter(id => {
    if (ts.findAncestor(id, ts.isImportDeclaration)) return false;
    const parent = id.parent;
    if (direct.has(id.text)) return !(ts.isCallExpression(parent) && parent.expression === id);
    if (!namespaces.has(id.text)) return false;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === id) {
      if (parent.name.text !== name) return false; // another export of the module
      return !(ts.isCallExpression(parent.parent) && parent.parent.expression === parent);
    }
    return true; // the namespace object itself escapes: an element access, a spread, an argument
  });
  return { isCall, indirectUses };
}

function keyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
    return name.text.toLowerCase();
  }
  return null; // computed or numeric: not readable as a header name
}

/**
 * The value of `name` in an object literal, or why it cannot be read.
 * A spread or a computed key might set `name` without the checker seeing it,
 * so either one makes the whole literal unreadable.
 */
function member(obj: ts.ObjectLiteralExpression, name: string): { value?: ts.Expression; unreadable?: string } {
  let value: ts.Expression | undefined;
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) return { unreadable: "a spread" };
    if (ts.isShorthandPropertyAssignment(p)) {
      if (p.name.text.toLowerCase() === name) return { unreadable: `a shorthand ${p.name.text}` };
      continue;
    }
    if (!p.name) continue;
    const key = keyName(p.name);
    if (key === null) return { unreadable: "a computed key" };
    if (key !== name) continue;
    if (!ts.isPropertyAssignment(p)) return { unreadable: `a ${name} accessor or method` };
    value = p.initializer;
  }
  return { value };
}

/** Does this Accept value let the site answer with any content type? */
function acceptsAnything(accept: string): boolean {
  return accept.split(",").some(part => {
    const [range, ...params] = part.split(";").map(s => s.trim());
    if (range !== "*/*") return false;
    const q = params.find(p => /^q\s*=/i.test(p));
    if (q === undefined) return true;
    const value = Number(q.split("=")[1]);
    return value > 0 && value <= 1; // RFC 9110 §12.4.2: q is 0 to 1
  });
}

const files = readdirSync(dir).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort().flatMap(file => {
  const src = ts.createSourceFile(file, readFileSync(new URL(file, dir), "utf8"), ts.ScriptTarget.Latest, true);
  const target = importedAs(src, "../lib/upstream-result.js", "targetUnavailable");
  const safeFetch = importedAs(src, "../lib/safe-fetch.js", "safeFetch");
  const calls = nodes(src, ts.isCallExpression);
  return calls.some(target.isCall)
    ? [{ file, src, fetches: calls.filter(safeFetch.isCall), indirect: safeFetch.indirectUses(src) }]
    : [];
});

describe("a tool that files a site's status as the target's sends an Accept the site cannot refuse", () => {
  it("finds exactly the tools that call targetUnavailable", () => {
    expect(files.map(f => f.file)).toEqual(EXPECTED_FILES);
  });

  it("reads an Accept value the way a server does", () => {
    expect(acceptsAnything("*/*")).toBe(true);
    expect(acceptsAnything("text/html, */*;q=0.8")).toBe(true);
    expect(acceptsAnything("text/html,application/xhtml+xml,*/*; q=0.1")).toBe(true);
    expect(acceptsAnything("text/html")).toBe(false);
    expect(acceptsAnything("text/html, */*;q=0")).toBe(false);
    expect(acceptsAnything("text/html, */*;q=0.0")).toBe(false);
    expect(acceptsAnything("text/*")).toBe(false);
    expect(acceptsAnything("text/html, */*;q=5")).toBe(false);
  });

  for (const { file, src, fetches, indirect } of files) {
    const at = (n: ts.Node) => `${file}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    it(`${file}: every safeFetch accepts */*`, () => {
      expect(fetches.length, `${file}: direct safeFetch calls`).toBe(EXPECTED_CALLS[file]);
      for (const use of indirect) {
        expect.fail(`${at(use)}: safeFetch is used other than as a direct call, so its Accept cannot be verified`);
      }
      for (const call of fetches) {
        const where = at(call);
        expect(call.arguments.some(ts.isSpreadElement), `${where}: spread arguments hide the options`).toBe(false);
        const init = call.arguments[1];
        if (!init) continue;
        expect(ts.isObjectLiteralExpression(init), `${where}: options must be an object literal to verify`).toBe(true);
        const headers = member(init as ts.ObjectLiteralExpression, "headers");
        expect(headers.unreadable, `${where}: options contain ${headers.unreadable}, which hides the headers`).toBeUndefined();
        if (!headers.value) continue;
        expect(ts.isObjectLiteralExpression(headers.value), `${where}: headers must be an object literal to verify`).toBe(true);
        const accept = member(headers.value as ts.ObjectLiteralExpression, "accept");
        expect(accept.unreadable, `${where}: headers contain ${accept.unreadable}, which hides Accept`).toBeUndefined();
        if (!accept.value) continue;
        expect(ts.isStringLiteralLike(accept.value), `${where}: Accept must be a string literal to verify`).toBe(true);
        expect(acceptsAnything((accept.value as ts.StringLiteralLike).text), `${where}: Accept must allow */*`).toBe(true);
      }
    });
  }
});
