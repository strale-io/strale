#!/usr/bin/env node
/**
 * Detect drift between the Vendor Roster Notion DB and recent Decisions DB
 * entries. Catches the 2026-04-30 failure mode where DEC-20260429-A
 * deferred OpenSanctions self-host but the Vendor Roster row stayed at
 * Status=Self-built for an extra day, propagating the stale state into
 * DEC-20260430-A.
 *
 * What this script does
 * ─────────────────────
 *
 * For every Decision created in Decisions DB in the last N days
 * (default 30), extracts vendor name mentions, looks up the matching
 * Vendor Roster row, and flags it if the row's `Last evaluated` date is
 * older than the Decision's `Date` field. A flagged row is one where a
 * Decision touched the vendor more recently than the Roster row was
 * last updated — likely drift.
 *
 * Additionally (T6 batch 4b, shadow mode), when the Vendor Roster is read
 * it is also compared against the repo-owned shadow register
 * `config/vendors.yaml` (scripts/vendors-lib.mjs's compareRosterWithRegister)
 * and printed in a separate, clearly-labelled section. This comparison is
 * report only: it never changes this script's exit code, in --check or
 * --strict, and it never writes to Notion, the register, the database, or
 * production. The Notion Vendor Roster remains the authority until the
 * founder-gated M4 cutover (see docs/strategy/2026-09-10-m3-vendor-state-model.md,
 * "Batch 4 rescoped"). If config/vendors.yaml cannot be loaded or parsed,
 * that is printed as a line in the section and the script carries on.
 *
 * Run modes
 * ─────────
 *
 *   --check                    Read-only audit. Print findings, exit 0.
 *   --strict                   Same as --check but exit 1 on any drift (CI / cron).
 *   --doc                      Print the manual procedure (no API call needed).
 *   --roster-fixture <path>    Skip the Notion fetch for the roster only and
 *                              run just the shadow register comparison
 *                              against the JSON array at <path> (each
 *                              element `{ vendor, status, url? }`). Needs no
 *                              NOTION_TOKEN and makes no Decisions DB call;
 *                              exits 0. For exercising the comparison
 *                              locally or in a PR body without live Notion
 *                              access.
 *
 * Notion API access
 * ─────────────────
 *
 * Requires NOTION_TOKEN in env (a Notion integration token with read
 * access to both databases). For local runs, register an internal
 * integration at https://www.notion.so/my-integrations and share both
 * databases with it. For the Strale workspace this is a one-time setup.
 *
 * Without NOTION_TOKEN the script falls back to --doc mode and prints
 * the manual procedure so the check can still be performed by hand.
 * --roster-fixture works without NOTION_TOKEN (see above).
 *
 * Wire into existing weekly cron alongside check-platform-facts-drift.
 *
 * Database IDs (Strale workspace, 2026-05-05):
 *   Vendor Roster database: af5a164bdea948379835210ae69b4283
 *   Decisions database:     ea57671f-7167-44e4-a254-c0a1de79e7f9
 *
 * Use database IDs (not data-source IDs) — `/v1/databases/{id}/query`
 * under Notion-Version 2022-06-28 only resolves database IDs. If you
 * copy a data-source ID by mistake, the API returns 404 object_not_found
 * with the integration ID embedded, making it look like a permissions error.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareRosterWithRegister, loadRegister } from "../../../scripts/vendors-lib.mjs";

const VENDOR_ROSTER_DS = "af5a164bdea948379835210ae69b4283";
const DECISIONS_DS = "ea57671f-7167-44e4-a254-c0a1de79e7f9";
const ACTIVE_VENDOR_STACK_PAGE = "https://app.notion.com/p/35367c87082c812e88d1dc6bdbfbd4f5";

// This file is apps/api/scripts/check-vendor-roster-drift.ts; the repository
// root is three levels up (scripts -> api -> apps -> root). Resolved from
// the script's own location, never from process.cwd(), because
// weekly-drift.yml job runs this with
// `cd apps/api && npx tsx scripts/check-vendor-roster-drift.ts`, so cwd is
// apps/api, not the repository root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const args = process.argv.slice(2);
const wantDoc = args.includes("--doc");
const wantStrict = args.includes("--strict");
const days = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30);
const rosterFixturePath = args.find((a) => a.startsWith("--roster-fixture="))?.split("=")[1];

interface NotionPage {
  url: string;
  properties: Record<string, unknown>;
}

interface NotionQueryResult {
  results?: NotionPage[];
}

function printManualProcedure(): void {
  console.log(`
─── Vendor Roster Drift Check — Manual Procedure ───────────────────────

Run this monthly OR after any session that creates a vendor-affecting
Decision. Source-of-truth precedence: Decisions DB > Vendor Roster >
Active Vendor Stack page > consumer pages.

Step 1. Open Decisions DB:
  https://app.notion.com/p/ea57671f716744e4a254c0a1de79e7f9

Step 2. Filter to Date >= today minus ${days} days. Sort by Date desc.

Step 3. For each Decision, identify any vendor name(s) it touches.
        Common pattern: any DEC titled "<vendor name>" or that supersedes
        a vendor's status (e.g. DEC-20260429-A deferred OpenSanctions).

Step 4. For each vendor mentioned, open the Vendor Roster:
  https://app.notion.com/p/af5a164bdea948379835210ae69b4283

Step 5. Find the row for that vendor. Check:
        (a) Status field reflects the Decision (Active / Rejected /
            Deferred / Pending eval / Backup / Self-built)
        (b) Reason / rationale text references the Decision
        (c) Notes column updated if the Decision changed terms or
            evaluation triggers
        (d) Primary DEC column links to the Decision page
        (e) Last evaluated date is on or after the Decision's Date

Step 6. If any are stale → update the row in the same session and add
        a course-correction Journal entry citing both the Decision and
        the row.

Step 7. Verify the Active Vendor Stack page (${ACTIVE_VENDOR_STACK_PAGE})
        does not contradict the updated row. Update if it does.

Step 8. Run check-platform-facts-drift.ts to verify no consumer page
        names a now-Rejected vendor in prose.

Done. Drift sweep complete.

─── Why this exists ────────────────────────────────────────────────────

On 2026-04-30, a session canonicalizing the v1 vendor stack into
DEC-20260430-A read the Vendor Roster verbatim — but the Roster row
for OpenSanctions still said Status=Self-built (a "planned migration")
even though DEC-20260429-A had deferred it indefinitely the day before
on a CC-BY-NonCommercial licensing finding. The stale Roster state
propagated into the canonicalizing DEC, the Counterparty Assurance product
page, and the session-end summary. Petter caught it; cleanup took
~30 minutes.

The fix: this drift check, run periodically, plus the Primary DEC
relation column on the Vendor Roster (added 2026-04-30). Together they
make Vendor Roster ↔ Decisions DB drift visible.
`);
}

async function fetchNotionDB(
  dataSourceId: string,
  token: string,
  filter: unknown,
  sorts: unknown,
): Promise<NotionQueryResult> {
  const res = await fetch(`https://api.notion.com/v1/databases/${dataSourceId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({ filter, sorts, page_size: 100 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return (await res.json()) as NotionQueryResult;
}

function getProp(props: Record<string, unknown> | undefined, name: string): unknown {
  const p = (props as Record<string, any> | undefined)?.[name];
  if (!p) return null;
  if (p.type === "title") return p.title?.map((t: any) => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  if (p.type === "select") return p.select?.name ?? null;
  if (p.type === "date") return p.date?.start ?? null;
  if (p.type === "relation") return p.relation?.map((r: any) => r.id) ?? [];
  return null;
}

interface RosterRow {
  vendor: string;
  status: string | null;
  url?: string;
}

/**
 * Loads and parses config/vendors.yaml from the repository root. Returns the
 * parsed document, or an error message when the file cannot be read or
 * parsed - never throws, so a broken register never fails this script.
 */
function loadRegisterSafely(): { register: unknown; error: string | null } {
  try {
    return { register: loadRegister(REPO_ROOT), error: null };
  } catch (err) {
    return { register: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Prints the shadow comparison between the Notion Vendor Roster and
 * config/vendors.yaml (T6 batch 4b). Never throws, never changes any exit
 * code the caller computes - this section is report only. The header makes
 * clear the Notion Vendor Roster, not this register, remains the authority
 * until the founder-gated M4 cutover.
 */
function printShadowComparison(rosterRows: RosterRow[]): void {
  console.log(`\n─── Shadow comparison with config/vendors.yaml (report only; the Notion Vendor Roster remains the authority until the M4 cutover) ───\n`);
  const { register, error } = loadRegisterSafely();
  if (error) {
    console.log(`  config/vendors.yaml could not be loaded: ${error}`);
    return;
  }
  const disagreements = compareRosterWithRegister(rosterRows, register as Parameters<typeof compareRosterWithRegister>[1]);
  if (disagreements.length === 0) {
    console.log(`  no disagreements (${rosterRows.length} roster row(s) compared against config/vendors.yaml).`);
    return;
  }
  console.log(`  ${disagreements.length} disagreement(s) (${rosterRows.length} roster row(s) compared):\n`);
  for (const d of disagreements) {
    console.log(`  - [${d.kind}] ${d.vendor}: ${d.detail}`);
  }
}

/**
 * --roster-fixture mode: reads a JSON array of { vendor, status, url? } rows
 * from the given path, skips the Notion fetch for the roster entirely (no
 * NOTION_TOKEN needed, no Decisions DB call), and runs just the shadow
 * comparison against the real config/vendors.yaml. Exits 0 unconditionally -
 * this mode is for exercising the comparison, never for CI gating.
 */
function runRosterFixtureMode(fixturePath: string): number {
  const absolutePath = resolve(process.cwd(), fixturePath);
  let rosterRows: RosterRow[];
  try {
    const raw = JSON.parse(readFileSync(absolutePath, "utf8"));
    if (!Array.isArray(raw)) throw new Error("fixture file must contain a JSON array");
    rosterRows = raw;
  } catch (err) {
    console.error(`Error reading --roster-fixture ${fixturePath}: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  console.log(`--roster-fixture mode: ${rosterRows.length} row(s) read from ${fixturePath}, no Notion call made.`);
  printShadowComparison(rosterRows);
  return 0;
}

async function runCheck(): Promise<number> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.log("NOTION_TOKEN not set — falling back to manual procedure.\n");
    printManualProcedure();
    return 0;
  }

  const sinceIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Fetch recent decisions
  const decisions = await fetchNotionDB(
    DECISIONS_DS,
    token,
    {
      property: "Date",
      date: { on_or_after: sinceIso },
    },
    [{ property: "Date", direction: "descending" }],
  );

  // Fetch vendor roster
  const roster = await fetchNotionDB(VENDOR_ROSTER_DS, token, undefined, undefined);

  // Build name → row index for vendors
  const vendorByName = new Map<string, NotionPage>();
  for (const row of roster.results ?? []) {
    const name = (getProp(row.properties, "Vendor") as string | null)?.toLowerCase().trim();
    if (name) vendorByName.set(name, row);
  }

  // Shadow comparison rows (T6 batch 4b): every roster row's Vendor title
  // and Status select, independent of the Decisions-DB drift logic below.
  const rosterRows = (roster.results ?? []).map((row) => ({
    vendor: (getProp(row.properties, "Vendor") as string | null) ?? "",
    status: getProp(row.properties, "Status") as string | null,
    url: row.url,
  }));

  const findings: Array<{
    vendor: unknown;
    decision: string;
    decDate: unknown;
    rowLastEval: unknown;
    rowUrl: string;
    decUrl: string;
  }> = [];

  for (const dec of decisions.results ?? []) {
    const decTitle = (getProp(dec.properties, "Decision") as string | null) ?? "";
    const decDate = getProp(dec.properties, "Date") as string | null;
    if (!decDate) continue;

    // Crude vendor-name match: any vendor name appearing in the title is a candidate.
    for (const [vendorName, row] of vendorByName) {
      if (decTitle.toLowerCase().includes(vendorName)) {
        const rowLastEval = getProp(row.properties, "Last evaluated") as string | null;
        if (!rowLastEval || rowLastEval < decDate) {
          findings.push({
            vendor: getProp(row.properties, "Vendor"),
            decision: decTitle,
            decDate,
            rowLastEval: rowLastEval ?? "(never)",
            rowUrl: row.url,
            decUrl: dec.url,
          });
        }
      }
    }
  }

  let exitCode: number;
  if (findings.length === 0) {
    console.log(`✓ No drift detected. ${roster.results?.length ?? 0} vendor rows checked against ${decisions.results?.length ?? 0} Decisions in the last ${days} days.`);
    exitCode = 0;
  } else {
    console.log(`⚠ ${findings.length} potential drift case(s) found:\n`);
    for (const f of findings) {
      console.log(`  - ${f.vendor}: row Last evaluated ${f.rowLastEval} < decision date ${f.decDate}`);
      console.log(`    Decision: ${f.decision}`);
      console.log(`    Row: ${f.rowUrl}`);
      console.log(`    Decision: ${f.decUrl}`);
      console.log("");
    }
    console.log(`Recommended action: open each row, verify Status / Reason / Primary DEC reflect the Decision; update Last evaluated to today.`);
    exitCode = wantStrict ? 1 : 0;
  }

  // Shadow comparison (T6 batch 4b): printed after the existing drift
  // report, in every case above. Report only - never allowed to change
  // exitCode, computed and fixed above this point.
  printShadowComparison(rosterRows);

  return exitCode;
}

if (wantDoc) {
  printManualProcedure();
  process.exit(0);
} else if (rosterFixturePath) {
  process.exit(runRosterFixtureMode(rosterFixturePath));
} else {
  runCheck().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    },
  );
}
