#!/usr/bin/env node
/**
 * Shadow comparison, report only; Notion remains the authority until the
 * M4 cutover.
 *
 * Prints the repo-native digest priorities (docs/company/DECISION-QUEUE.md)
 * and the repo-native handoff activity
 * (handoff/_general/from-code/*.md), and, only when NOTION_API_KEY is set,
 * also loads the live Notion getPriorities() result
 * (apps/api/src/lib/daily-digest/fetch-notion.ts) and prints a comparison.
 *
 * This changes nothing: no Notion write, no production write, no exit code
 * other than 0. It is meant to be run daily by
 * .github/workflows/m3-digest-shadow.yml and locally by
 * `npm run digest:shadow`. See scripts/digest-repo-native-lib.mjs's header
 * for the full mapping and design notes.
 *
 * The Notion half needs TypeScript loaded (fetch-notion.ts imports
 * ./types.js under Node's ESM resolution, which needs a TS-aware loader).
 * Run this script with `npx tsx scripts/digest-shadow.mjs`, the same way
 * apps/api/scripts/*.ts entrypoints are run elsewhere in this repository,
 * so the dynamic import below resolves under tsx's loader. Loading it is
 * lazy and wrapped in a try, the way
 * apps/api/scripts/check-vendor-roster-drift.ts's printShadowComparison
 * lazily loads scripts/vendors-lib.mjs: any failure in the Notion half
 * prints one line and the rest of the report still prints.
 */
import { repoRootFrom, repoNativePriorities, recentHandoffActivity, comparePriorities } from "./digest-repo-native-lib.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const REPO_ROOT = repoRootFrom(import.meta.url);
const FETCH_NOTION_PATH = resolve(REPO_ROOT, "apps/api/src/lib/daily-digest/fetch-notion.ts");

function printHeader() {
  console.log("Shadow comparison, report only; Notion remains the authority until the M4 cutover.\n");
}

function printRepoPriorities(priorities) {
  console.log("-- Repo-native priorities (docs/company/DECISION-QUEUE.md) --\n");
  console.log(`decided entries in the last 14 days: ${priorities.unreviewedDecisions.length} (older: ${priorities.olderUnreviewedCount})`);
  for (const d of priorities.unreviewedDecisions) {
    console.log(`  - [${d.id}] ${d.date} ${d.title}`);
  }
  console.log(`your_call entries in the last 14 days: ${priorities.actionRequired.length} (older: ${priorities.olderActionRequiredCount})`);
  for (const a of priorities.actionRequired) {
    console.log(`  - ${a.createdAt} ${a.title}`);
  }
}

function printHandoffActivity(activity) {
  console.log("\n-- Repo-native handoff activity, last 14 days (handoff/_general/from-code/) --\n");
  if (activity.length === 0) {
    console.log("  none in the window.");
    return;
  }
  for (const h of activity) {
    const suffix = h.intent ? ` -- ${h.intent}` : "";
    console.log(`  - ${h.date} ${h.file}${suffix}`);
  }
}

function printComparisonSection(title, comparison) {
  console.log(`  ${title}: repo ${comparison.repoCount}, notion ${comparison.notionCount}`);
  if (comparison.repoOnly.length > 0) {
    console.log(`    repo only: ${comparison.repoOnly.join(" | ")}`);
  }
  if (comparison.notionOnly.length > 0) {
    console.log(`    notion only: ${comparison.notionOnly.join(" | ")}`);
  }
  if (comparison.repoOnly.length === 0 && comparison.notionOnly.length === 0) {
    console.log("    no disagreements by title.");
  }
}

async function runNotionComparison(repoPriorities) {
  console.log("\n-- Comparison against the live Notion digest priorities --\n");
  try {
    const notionModule = await import(pathToFileURL(FETCH_NOTION_PATH).href);
    const notionPriorities = await notionModule.getPriorities();
    const comparison = comparePriorities(repoPriorities, notionPriorities);
    printComparisonSection("unreviewed decisions", comparison.unreviewedDecisions);
    printComparisonSection("action required", comparison.actionRequired);
  } catch (err) {
    console.log(`  Notion comparison unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  printHeader();

  const now = new Date();
  const repoPriorities = repoNativePriorities(REPO_ROOT, { now });
  printRepoPriorities(repoPriorities);

  const handoffActivity = recentHandoffActivity(REPO_ROOT, { now, days: 14 });
  printHandoffActivity(handoffActivity);

  if (!process.env.NOTION_API_KEY) {
    console.log("\nNOTION_API_KEY not set: skipping the Notion comparison half.");
    return;
  }

  await runNotionComparison(repoPriorities);
}

// This CLI is report only and must always exit 0. It sets the exit code and
// lets Node exit on its own rather than calling process.exit(), which can cut
// off buffered stdout (on Windows it has crashed in libuv after printing).
// Anything unexpected that escapes the per-section try blocks above still
// prints and the process still exits 0.
process.exitCode = 0;
main().catch((err) => {
  console.log(`digest-shadow: unexpected error, reported and ignored: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 0;
});
