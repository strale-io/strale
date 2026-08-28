/**
 * CI gate + local check for CEO morning briefs.
 *
 * With no arguments it lints every brief in docs/company/briefs/, which is how
 * it runs in CI: a later session cannot regress one brief back into an
 * engineering activity log without the gate saying so. With a path it lints
 * that file, which is how a session checks its own brief before presenting it.
 *
 * Exit 0 clean or warnings only, 1 on any error, 2 on a usage problem.
 *
 * The rules live in src/lib/ceo-brief-lint.ts and are unit-tested there. This
 * file is I/O only, deliberately — a gate whose logic lives in the CLI is a
 * gate nobody can test, and this repo has shipped three of those.
 *
 * Run:  cd apps/api && npx tsx scripts/check-ceo-brief.ts [path...]
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lintBrief, formatFindings } from "../src/lib/ceo-brief-lint.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const BRIEFS = join(REPO, "docs", "company", "briefs");

/**
 * Terms a specific brief was allowed to keep, with the reason. Kept here rather
 * than as an inline directive in the brief itself, so that adding one is a
 * visible edit to a shared file rather than a comment nobody reviews.
 */
const ALLOWED: Record<string, { terms: string[]; why: string }> = {};

function briefPaths(argv: string[]): string[] {
  if (argv.length > 0) return argv.map((p) => resolve(process.cwd(), p));
  if (!existsSync(BRIEFS)) return [];
  // Every markdown file in the directory, not only date-named ones. Filtering
  // on `YYYY-MM-DD.md` meant a brief saved as `2026-08-22-morning.md` was
  // skipped in silence, which is a gate that reports success for work it never
  // looked at — the hollow-gate family in LESSONS.md.
  return readdirSync(BRIEFS)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => join(BRIEFS, f));
}

function main(): number {
  const paths = briefPaths(process.argv.slice(2));
  if (paths.length === 0) {
    // No briefs yet is not a failure — the guard is for briefs that exist.
    console.log("check-ceo-brief: no briefs found in docs/company/briefs/, nothing to check");
    return 0;
  }
  let errors = 0;
  let warnings = 0;
  for (const path of paths) {
    if (!existsSync(path)) {
      console.error(`check-ceo-brief: no such file: ${path}`);
      return 2;
    }
    const name = path.split(/[\\/]/).pop()!;
    const allow = ALLOWED[name.replace(/\.md$/, "")];
    // The leading YYYY-MM-DD of the filename, when it has one. Gates the
    // settled-matter check so it never fires on a brief written before the
    // matter was settled.
    const briefDate = /^(\d{4}-\d{2}-\d{2})/.exec(name)?.[1];
    const result = lintBrief(readFileSync(path, "utf8"), {
      allowTerms: allow?.terms,
      briefDate,
    });
    errors += result.findings.filter((f) => f.severity === "error").length;
    warnings += result.findings.filter((f) => f.severity === "warning").length;
    console.log(formatFindings(name, result));
  }
  console.log(
    `\nchecked ${paths.length} brief(s): ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) {
    console.log(
      "\nA brief fails this gate when it reads as engineering rather than as business.\n" +
      "The fix is to say what the thing meant for customers, revenue or risk — not to\n" +
      "delete the sentence. See docs/company/DAILY-RUN.md § Part 3.");
  }
  return errors > 0 ? 1 : 0;
}

process.exit(main());
