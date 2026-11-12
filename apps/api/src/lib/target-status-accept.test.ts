import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

// Promise-audit T1 follow-up 41. targetUnavailable(site, status) files a
// site's 4xx as the target's answer: unbilled and never counted against the
// capability. That is only true when Strale's request could not have caused
// the 4xx. The one request header a page fetcher chooses that a site can
// reject is Accept (a 406). Every fetch in a tool that calls targetUnavailable
// (whatever its status variable is named) must therefore accept any content
// type: Accept unset
// (Node's fetch sends */*) or a value that includes */*. A 406 under */* is
// the site's own refusal, usually a firewall rule. Any other request-caused
// 4xx cannot come from these calls: safeFetch keeps Host and SNI on the
// requested name (421), a GET carries no body (411, 413, 417), and the
// request headers are a few hundred bytes (431).
const dir = new URL("../capabilities/", import.meta.url);

function nodes<T extends ts.Node>(root: ts.Node, predicate: (n: ts.Node) => n is T): T[] {
  const found: T[] = [];
  const walk = (n: ts.Node) => { if (predicate(n)) found.push(n); ts.forEachChild(n, walk); };
  walk(root); return found;
}
function prop(obj: ts.ObjectLiteralExpression, name: string, src: ts.SourceFile) {
  return obj.properties.find((p): p is ts.PropertyAssignment =>
    ts.isPropertyAssignment(p) && p.name.getText(src).replace(/["']/g, "").toLowerCase() === name);
}

const files = readdirSync(dir).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts")).flatMap(file => {
  const src = ts.createSourceFile(file, readFileSync(new URL(file, dir), "utf8"), ts.ScriptTarget.Latest, true);
  const calls = nodes(src, ts.isCallExpression);
  const callsTarget = calls.some(c => c.expression.getText(src) === "targetUnavailable");
  return callsTarget ? [{ file, src, fetches: calls.filter(c => c.expression.getText(src) === "safeFetch") }] : [];
});

describe("a tool that files a site's status as the target's sends an Accept the site cannot refuse", () => {
  it("finds the tools that call targetUnavailable", () => {
    expect(files.map(f => f.file)).toEqual(expect.arrayContaining(["og-image-check.ts", "website-carbon-estimate.ts", "domain-contact-extract.ts", "page-exists.ts", "cookie-scan.ts"]));
  });
  for (const { file, src, fetches } of files) {
    it(`${file}: every safeFetch accepts */*`, () => {
      for (const call of fetches) {
        const where = `${file}:${src.getLineAndCharacterOfPosition(call.getStart()).line + 1}`;
        const init = call.arguments[1];
        if (!init) continue;
        expect(ts.isObjectLiteralExpression(init), `${where}: options must be an object literal to verify`).toBe(true);
        const headers = prop(init as ts.ObjectLiteralExpression, "headers", src);
        if (!headers) continue;
        expect(ts.isObjectLiteralExpression(headers.initializer), `${where}: headers must be an object literal to verify`).toBe(true);
        const accept = prop(headers.initializer as ts.ObjectLiteralExpression, "accept", src);
        if (!accept) continue;
        expect(ts.isStringLiteralLike(accept.initializer), `${where}: Accept must be a string literal to verify`).toBe(true);
        expect((accept.initializer as ts.StringLiteralLike).text, where).toContain("*/*");
      }
    });
  }
});
