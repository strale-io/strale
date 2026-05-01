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
 * Run modes
 * ─────────
 *
 *   --check        Read-only audit. Print findings, exit 0.
 *   --strict       Same as --check but exit 1 on any drift (CI / cron).
 *   --doc          Print the manual procedure (no API call needed).
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
 *
 * Wire into existing weekly cron alongside check-platform-facts-drift.
 *
 * Database IDs (Strale workspace, 2026-04-30):
 *   Vendor Roster collection: 638d0bf6-39de-4310-a0cd-b8e791878f33
 *   Decisions DB collection:  5e1a81ee-7b9f-4d3c-b58d-c8d97ae6386c
 *
 * If those IDs change, update them here.
 */

const VENDOR_ROSTER_DS = "638d0bf6-39de-4310-a0cd-b8e791878f33";
const DECISIONS_DS = "5e1a81ee-7b9f-4d3c-b58d-c8d97ae6386c";
const ACTIVE_VENDOR_STACK_PAGE = "https://app.notion.com/p/35367c87082c812e88d1dc6bdbfbd4f5";

const args = process.argv.slice(2);
const wantDoc = args.includes("--doc");
const wantStrict = args.includes("--strict");
const days = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30);

function printManualProcedure() {
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

Step 8. Run check-platform-facts-drift.mjs to verify no consumer page
        names a now-Rejected vendor in prose.

Done. Drift sweep complete.

─── Why this exists ────────────────────────────────────────────────────

On 2026-04-30, a session canonicalizing the v1 vendor stack into
DEC-20260430-A read the Vendor Roster verbatim — but the Roster row
for OpenSanctions still said Status=Self-built (a "planned migration")
even though DEC-20260429-A had deferred it indefinitely the day before
on a CC-BY-NonCommercial licensing finding. The stale Roster state
propagated into the canonicalizing DEC, the Payee Assurance product
page, and the session-end summary. Petter caught it; cleanup took
~30 minutes.

The fix: this drift check, run periodically, plus the Primary DEC
relation column on the Vendor Roster (added 2026-04-30). Together they
make Vendor Roster ↔ Decisions DB drift visible.
`);
}

async function fetchNotionDB(dataSourceId, token, filter, sorts) {
  const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
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
  return await res.json();
}

function getProp(props, name) {
  const p = props?.[name];
  if (!p) return null;
  if (p.type === "title") return p.title?.map((t) => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map((t) => t.plain_text).join("") ?? "";
  if (p.type === "select") return p.select?.name ?? null;
  if (p.type === "date") return p.date?.start ?? null;
  if (p.type === "relation") return p.relation?.map((r) => r.id) ?? [];
  return null;
}

async function runCheck() {
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
  const vendorByName = new Map();
  for (const row of roster.results ?? []) {
    const name = getProp(row.properties, "Vendor")?.toLowerCase().trim();
    if (name) vendorByName.set(name, row);
  }

  let driftFound = 0;
  const findings = [];

  for (const dec of decisions.results ?? []) {
    const decTitle = getProp(dec.properties, "Decision") ?? "";
    const decDate = getProp(dec.properties, "Date");
    if (!decDate) continue;

    // Crude vendor-name match: any vendor name appearing in the title is a candidate.
    for (const [vendorName, row] of vendorByName) {
      if (decTitle.toLowerCase().includes(vendorName)) {
        const rowLastEval = getProp(row.properties, "Last evaluated");
        if (!rowLastEval || rowLastEval < decDate) {
          findings.push({
            vendor: getProp(row.properties, "Vendor"),
            decision: decTitle,
            decDate,
            rowLastEval: rowLastEval ?? "(never)",
            rowUrl: row.url,
            decUrl: dec.url,
          });
          driftFound++;
        }
      }
    }
  }

  if (findings.length === 0) {
    console.log(`✓ No drift detected. ${roster.results.length} vendor rows checked against ${decisions.results.length} Decisions in the last ${days} days.`);
    return 0;
  }

  console.log(`⚠ ${findings.length} potential drift case(s) found:\n`);
  for (const f of findings) {
    console.log(`  - ${f.vendor}: row Last evaluated ${f.rowLastEval} < decision date ${f.decDate}`);
    console.log(`    Decision: ${f.decision}`);
    console.log(`    Row: ${f.rowUrl}`);
    console.log(`    Decision: ${f.decUrl}`);
    console.log("");
  }
  console.log(`Recommended action: open each row, verify Status / Reason / Primary DEC reflect the Decision; update Last evaluated to today.`);
  return wantStrict ? 1 : 0;
}

if (wantDoc) {
  printManualProcedure();
  process.exit(0);
} else {
  runCheck().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`Error: ${err.message}`);
      process.exit(2);
    },
  );
}
