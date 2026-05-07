#!/usr/bin/env node
/**
 * Detect drift between the Provider-Coverage matrix Notion DB, the
 * Vendor Roster (the operational view of who's serving traffic), and
 * the Decisions DB (the source of truth for status changes).
 *
 * What this script does
 * ─────────────────────
 *
 * For every Provider-Coverage row, two checks:
 *
 *   1. STATUS DRIFT — if the row's Provider matches a Vendor Roster
 *      row whose Status is anything other than Active (Rejected,
 *      Deferred, Pending eval, Backup, Self-built), the matrix row
 *      should not be Live/Committed/In discovery. If it is, that's
 *      drift. Surfaces the 2026-04-30 failure mode where the matrix
 *      kept naming Banfico/SurePay/MonitorPay/Movitz/Socure as v1
 *      candidates after the Vendor Roster had moved them to Rejected.
 *
 *   2. STALE-VERIFIED DRIFT — if the row's `Last verified` date is
 *      older than the most recent Decision (within the window) that
 *      mentions the row's Provider in its title, the row may need
 *      re-verification. Surfaces the case where a DEC changes a
 *      vendor's commercial terms but the matrix row's verified date
 *      isn't refreshed.
 *
 * Many Provider-Coverage rows reference government registries
 * (Bolagsverket, Brreg, CVR, INSEE, etc.) that have no Vendor Roster
 * entry. Those rows are correctly skipped — they're not vendor
 * relationships, they're direct gov API integrations.
 *
 * Run modes
 * ─────────
 *
 *   --check        Read-only audit. Print findings, exit 0.
 *   --strict       Same as --check but exit 1 on any drift (CI / cron).
 *   --doc          Print the manual procedure (no API call needed).
 *   --days=N       Window for Decisions search (default 30).
 *
 * Notion API access
 * ─────────────────
 *
 * Requires NOTION_TOKEN in env (a Notion integration token with read
 * access to all three databases). Same token as
 * check-vendor-roster-drift.ts uses. Without it, falls back to --doc
 * mode and prints the manual procedure.
 *
 * Wired into the weekly drift sweep workflow (.github/workflows/
 * weekly-drift.yml) alongside check-vendor-roster-drift.ts.
 *
 * Database IDs (Strale workspace, 2026-05-05):
 *   Provider-Coverage matrix database: 396c619280ef4397adcbcdc067ead321
 *   Vendor Roster database:            af5a164bdea948379835210ae69b4283
 *   Decisions database:                ea57671f-7167-44e4-a254-c0a1de79e7f9
 *
 * Use database IDs (not data-source IDs) — `/v1/databases/{id}/query`
 * under Notion-Version 2022-06-28 only resolves database IDs. If you
 * copy a data-source ID by mistake, the API returns 404 object_not_found
 * with the integration ID embedded, making it look like a permissions error.
 */

const PROVIDER_COVERAGE_DS = "396c619280ef4397adcbcdc067ead321";
const VENDOR_ROSTER_DS = "af5a164bdea948379835210ae69b4283";
const DECISIONS_DS = "ea57671f-7167-44e4-a254-c0a1de79e7f9";
const PROVIDER_COVERAGE_PAGE = "https://app.notion.com/p/34867c87082c81879391ebc05a9b3d90";
const VENDOR_ROSTER_PAGE = "https://app.notion.com/p/af5a164bdea948379835210ae69b4283";

const args = process.argv.slice(2);
const wantDoc = args.includes("--doc");
const wantStrict = args.includes("--strict");
const days = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30);

interface NotionPage {
  url: string;
  properties: Record<string, unknown>;
}

function printManualProcedure(): void {
  console.log(`
─── Provider-Coverage Drift Check — Manual Procedure ────────────────────

Run this monthly OR after any Decision that changes a vendor's status.
Source-of-truth precedence: Decisions DB > Vendor Roster > Provider-
Coverage matrix > Active Vendor Stack page > consumer pages.

Step 1. Open Vendor Roster, filter Status != Active. Note the names.
  ${VENDOR_ROSTER_PAGE}

Step 2. Open Provider-Coverage matrix:
  ${PROVIDER_COVERAGE_PAGE}

Step 3. For each non-Active vendor name from Step 1, search the matrix
        for rows whose Provider = that vendor. If any such row has
        Status = Live / Committed / In discovery, it's drift — the
        matrix is still routing through a vendor the Roster has
        moved off of.

Step 4. For each drift case:
        (a) Set matrix row Status = Deprecated.
        (b) Bump Last verified to today.
        (c) Append a Notes line citing the superseding DEC.
        (d) If the matrix is missing a row for the replacement
            vendor, create it (Provider = new vendor, Status = Live,
            Sourcing pattern, Cost per call, etc.).

Step 5. Open Decisions DB, filter Date >= today minus ${days} days.
        For each Decision, identify any vendor name it touches. Open
        the matrix rows for that vendor. If row's Last verified < the
        Decision date, refresh the row (verify provider state, bump
        Last verified, update Notes if terms changed).

Step 6. Verify the Active Vendor Stack page reflects whatever changed.

Done.

─── Why this exists ────────────────────────────────────────────────────

On 2026-04-30, the Provider-Coverage matrix description named SurePay
and Socure as committed v1 vendors, even though both had been moved
to Rejected on the Vendor Roster two days earlier (DEC-20260428-A and
follow-on Roster updates). The drift propagated into the Counterparty
Assurance product page's narrative and only got caught by a manual
audit. This script catches the same shape of drift automatically.
`);
}

async function fetchNotionDB(
  dataSourceId: string,
  token: string,
  filter: unknown,
  sorts: unknown,
): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined = undefined;
  for (;;) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string };
    out.push(...(json.results ?? []));
    if (!json.has_more || !json.next_cursor) break;
    cursor = json.next_cursor;
  }
  return out;
}

function getProp(props: Record<string, unknown> | undefined, name: string): unknown {
  const p = (props as Record<string, any> | undefined)?.[name];
  if (!p) return null;
  if (p.type === "title") return p.title?.map((t: any) => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  if (p.type === "select") return p.select?.name ?? null;
  if (p.type === "multi_select") return p.multi_select?.map((o: any) => o.name) ?? [];
  if (p.type === "date") return p.date?.start ?? null;
  if (p.type === "number") return p.number ?? null;
  if (p.type === "relation") return p.relation?.map((r: any) => r.id) ?? [];
  return null;
}

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

interface RosterMatch {
  vendor: unknown;
  status: string | null;
  lastEvaluated: string | null;
  url: string;
}

interface DecisionMatch {
  decTitle: string;
  decDate: string;
  decUrl: string;
}

async function runCheck(): Promise<number> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.log("NOTION_TOKEN not set — falling back to manual procedure.\n");
    printManualProcedure();
    return 0;
  }

  const sinceIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const [coverageRows, rosterRows, decisions] = await Promise.all([
    fetchNotionDB(PROVIDER_COVERAGE_DS, token, undefined, undefined),
    fetchNotionDB(VENDOR_ROSTER_DS, token, undefined, undefined),
    fetchNotionDB(
      DECISIONS_DS,
      token,
      { property: "Date", date: { on_or_after: sinceIso } },
      [{ property: "Date", direction: "descending" }],
    ),
  ]);

  // Build vendor → {status, lastEvaluated, url} map keyed on normalised name.
  const rosterByName = new Map<string, RosterMatch>();
  for (const row of rosterRows) {
    const name = normalizeName(getProp(row.properties, "Vendor") as string | null);
    if (!name) continue;
    rosterByName.set(name, {
      vendor: getProp(row.properties, "Vendor"),
      status: getProp(row.properties, "Status") as string | null,
      lastEvaluated: getProp(row.properties, "Last evaluated") as string | null,
      url: row.url,
    });
  }

  // Build provider-name → most-recent-decision-date map. Title-substring
  // match is intentionally loose: any Decision whose title contains a
  // Vendor Roster vendor name (case-insensitive) is "touching" that vendor.
  const decisionByVendor = new Map<string, DecisionMatch>();
  for (const dec of decisions) {
    const decTitle = (getProp(dec.properties, "Decision") as string | null) ?? "";
    const decDate = getProp(dec.properties, "Date") as string | null;
    if (!decDate) continue;
    const titleLower = decTitle.toLowerCase();
    for (const [vendorName] of rosterByName) {
      if (titleLower.includes(vendorName)) {
        const prev = decisionByVendor.get(vendorName);
        if (!prev || prev.decDate < decDate) {
          decisionByVendor.set(vendorName, {
            decTitle,
            decDate,
            decUrl: dec.url,
          });
        }
      }
    }
  }

  const liveStatuses = new Set(["Live", "Committed", "In discovery"]);
  type Finding =
    | {
        kind: "status";
        entry: unknown;
        country: unknown;
        evidenceType: unknown;
        provider: unknown;
        matrixStatus: string | null;
        rosterStatus: string | null;
        rosterUrl: string;
        rowUrl: string;
      }
    | {
        kind: "stale-verified";
        entry: unknown;
        country: unknown;
        evidenceType: unknown;
        provider: unknown;
        matrixStatus: string | null;
        lastVerified: string;
        decTitle: string;
        decDate: string;
        decUrl: string;
        rowUrl: string;
      };
  const findings: Finding[] = [];

  for (const row of coverageRows) {
    const props = row.properties;
    const provider = getProp(props, "Provider");
    const status = getProp(props, "Status") as string | null;
    const lastVerified = getProp(props, "Last verified") as string | null;
    const country = getProp(props, "Country");
    const evidenceType = getProp(props, "Evidence Type");
    const entry = getProp(props, "Entry") ?? "(untitled row)";
    if (!provider) continue;

    const providerKey = normalizeName(provider as string);
    const rosterMatch = rosterByName.get(providerKey);

    // Check 1: status drift — matrix Live/Committed/In discovery while
    // Roster says non-Active.
    if (rosterMatch && rosterMatch.status && rosterMatch.status !== "Active" && status && liveStatuses.has(status)) {
      findings.push({
        kind: "status",
        entry,
        country,
        evidenceType,
        provider,
        matrixStatus: status,
        rosterStatus: rosterMatch.status,
        rosterUrl: rosterMatch.url,
        rowUrl: row.url,
      });
    }

    // Check 2: stale-verified drift — Last verified older than the most
    // recent Decision touching this provider. Skip rows already in
    // Deprecated/Gap (no point re-verifying decommissioned routes) and
    // rows with no Last verified set.
    if (status !== "Deprecated" && status !== "Gap") {
      const decMatch = decisionByVendor.get(providerKey);
      if (decMatch && (!lastVerified || lastVerified < decMatch.decDate)) {
        findings.push({
          kind: "stale-verified",
          entry,
          country,
          evidenceType,
          provider,
          matrixStatus: status,
          lastVerified: lastVerified ?? "(never)",
          decTitle: decMatch.decTitle,
          decDate: decMatch.decDate,
          decUrl: decMatch.decUrl,
          rowUrl: row.url,
        });
      }
    }
  }

  const summary = `${coverageRows.length} matrix rows checked against ${rosterRows.length} Roster vendors and ${decisions.length} Decisions in the last ${days} days.`;

  if (findings.length === 0) {
    console.log(`✓ No drift detected. ${summary}`);
    return 0;
  }

  const statusFindings = findings.filter((f): f is Extract<Finding, { kind: "status" }> => f.kind === "status");
  const staleFindings = findings.filter((f): f is Extract<Finding, { kind: "stale-verified" }> => f.kind === "stale-verified");

  console.log(`⚠ ${findings.length} potential drift case(s) found. ${summary}\n`);

  if (statusFindings.length > 0) {
    console.log(`── Status drift (${statusFindings.length}) — matrix row Live/Committed/In-discovery but Roster status != Active:\n`);
    for (const f of statusFindings) {
      console.log(`  - [${f.evidenceType} / ${f.country}] ${f.entry}`);
      console.log(`    Provider '${f.provider}' has Roster Status = ${f.rosterStatus}, matrix Status = ${f.matrixStatus}`);
      console.log(`    Row:    ${f.rowUrl}`);
      console.log(`    Roster: ${f.rosterUrl}`);
      console.log("");
    }
  }

  if (staleFindings.length > 0) {
    console.log(`── Stale-verified drift (${staleFindings.length}) — matrix row Last verified < most recent Decision touching the provider:\n`);
    for (const f of staleFindings) {
      console.log(`  - [${f.evidenceType} / ${f.country}] ${f.entry}`);
      console.log(`    Provider '${f.provider}', Last verified = ${f.lastVerified}, Decision date = ${f.decDate}`);
      console.log(`    Decision: ${f.decTitle}`);
      console.log(`    Row:      ${f.rowUrl}`);
      console.log(`    DEC:      ${f.decUrl}`);
      console.log("");
    }
  }

  console.log(`Recommended action: open each row, verify Provider / Status / Notes / Last verified reflect the source-of-truth Decision; update Last verified to today.`);
  return wantStrict ? 1 : 0;
}

if (wantDoc) {
  printManualProcedure();
  process.exit(0);
} else {
  runCheck().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    },
  );
}
