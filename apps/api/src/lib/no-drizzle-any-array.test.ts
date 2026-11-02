/**
 * No `ANY(${jsArray})` inside a drizzle `sql` template.
 *
 * drizzle's `sql` tag expands a JS array into a row tuple, `ANY(($1, $2))`,
 * which Postgres rejects with "op ANY/ALL (array) requires array on right
 * side". The call site does not fail until the query runs, and every one so
 * far ran inside a try/catch that turned the error into a quiet log line:
 *   - 4bf58d0: loadCatalog on every /v1/suggest request;
 *   - auto-register.ts and test-scheduler.ts (comments at those sites);
 *   - meta-monitoring.ts free_tier_health: errored on every daily run for
 *     months, so the meta-daily heartbeat never recorded a success;
 *   - digest-compiler.ts tier-3 proposals.
 * Per-site comments did not stop the fifth, so this scans for the shape.
 *
 * The `postgres` package's own tag serialises arrays correctly
 * (jobs/quality-floor.ts); files that do not import drizzle's `sql` are out of
 * scope. An interpolation that is already a SQL fragment (an `ARRAY[...]`
 * built with sql.raw) is safe and listed in FRAGMENTS with its reason.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const apiRoot = resolve(import.meta.dirname, "../..");
const ROOTS = ["src", "scripts"].map((d) => join(apiRoot, d));

/** file (relative to apps/api) → interpolated names that are SQL fragments, not JS arrays. */
const FRAGMENTS: Record<string, string[]> = {
  // sql.raw(`ARRAY[...]::uuid[]`), built a few lines above its use.
  "src/lib/daily-digest/fetch-platform.ts": ["internalUserIdList"],
};

// ALL() fails the same way; SQL keywords are case-insensitive and may take a space.
const ANY_INTERPOLATION = /\b(?:ANY|ALL)\s*\(\s*\$\{\s*([A-Za-z_$][\w$.]*)\s*\}\s*\)/gi;
const IMPORTS_DRIZZLE_SQL = /import\s*\{[^}]*\bsql\b[^}]*\}\s*from\s*["']drizzle-orm["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|mts)$/.test(name) && !/\.test\.(ts|mts)$/.test(name) ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** `file:name` for every drizzle-sql `ANY(${name})` not known to be a fragment. */
export function findDrizzleAnyArrays(files: readonly string[], read: (f: string) => string): string[] {
  const found: string[] = [];
  for (const file of files) {
    const source = read(file);
    if (!IMPORTS_DRIZZLE_SQL.test(source)) continue;
    const rel = relative(apiRoot, file);
    for (const match of stripComments(source).matchAll(ANY_INTERPOLATION)) {
      if (!(FRAGMENTS[rel] ?? []).includes(match[1])) found.push(`${rel}:${match[1]}`);
    }
  }
  return found;
}

describe("drizzle sql templates never interpolate a JS array into ANY()", () => {
  const files = ROOTS.flatMap(sourceFiles);
  const read = (f: string) => readFileSync(f, "utf8");

  it("scans a non-empty set of drizzle files", () => {
    expect(files.filter((f) => IMPORTS_DRIZZLE_SQL.test(read(f))).length).toBeGreaterThan(50);
  });

  it("finds no ANY(${array}) in a drizzle file", () => {
    expect(findDrizzleAnyArrays(files, read)).toEqual([]);
  });

  it("has no stale FRAGMENTS entry", () => {
    const stale = Object.entries(FRAGMENTS).flatMap(([rel, names]) => {
      const source = stripComments(read(join(apiRoot, rel)));
      return names.filter((n) => !source.includes(`ANY(\${${n}})`)).map((n) => `${rel}:${n}`);
    });
    expect(stale).toEqual([]);
  });

  it("catches the shape and ignores comments and the postgres tag", () => {
    const fake = (body: string) => () => body;
    const drizzle = 'import { sql } from "drizzle-orm";\n';
    expect(findDrizzleAnyArrays([join(apiRoot, "src/x.ts")], fake(`${drizzle}sql\`WHERE slug = ANY(\${slugs})\``))).toEqual(["src/x.ts:slugs"]);
    expect(findDrizzleAnyArrays([join(apiRoot, "src/x.ts")], fake(`${drizzle}sql\`x <> all (\${ids})\``))).toEqual(["src/x.ts:ids"]);
    expect(findDrizzleAnyArrays([join(apiRoot, "src/x.ts")], fake(`${drizzle}// never ANY(\${slugs})\n/* ANY(\${ids}) */`))).toEqual([]);
    expect(findDrizzleAnyArrays([join(apiRoot, "src/x.ts")], fake('import postgres from "postgres";\nsql`x = ANY(${slugs})`'))).toEqual([]);
  });
});
