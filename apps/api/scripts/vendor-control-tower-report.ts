/**
 * Read-only morning report for vendor billing, allowances and auto-suspensions.
 * Run from apps/api: npx tsx scripts/vendor-control-tower-report.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../.env") });

import { openOperatorDb } from "../src/lib/operator-db.js";
import { getActiveProviders } from "../src/lib/dependency-manifest.js";
import {
  registeredBalanceAdapterNames,
  registeredRecoveryAdapterNames,
} from "../src/lib/vendor-control-tower.js";
import {
  deriveVendorInventoryIssues,
  deriveVendorMorningIssues,
} from "../src/lib/vendor-morning-status.js";

interface AccountRow {
  provider_name: string;
  display_name: string;
  billing_model: string;
  plan_name: string | null;
  payment_method: string | null;
  monitor_mode: string;
  status: string;
  status_reason: string | null;
  included_units: number | null;
  used_units: number | null;
  remaining_units: number | null;
  usage_unit: string | null;
  reset_at: string | null;
  expires_at: string | null;
  last_checked_at: string | null;
  consecutive_check_failures: number;
  affected_capabilities: string[];
  dependency_edges: Array<{ capability_slug: string; dependency_kind: "required" | "fallback" }>;
  active_suspensions: string[];
  active_solution_suspensions: string[];
}

function units(row: AccountRow): string {
  if (row.remaining_units == null) return "not balance-limited";
  return `${row.remaining_units}/${row.included_units ?? "?"} ${row.usage_unit ?? "units"} remaining`;
}

async function main(): Promise<void> {
  const operator = openOperatorDb();
  try {
    const accounts = await operator<AccountRow[]>`
    SELECT va.provider_name, va.display_name, va.billing_model, va.plan_name,
           va.payment_method, va.monitor_mode, va.status, va.status_reason,
           va.included_units, va.used_units, va.remaining_units, va.usage_unit,
           va.reset_at, va.expires_at, va.last_checked_at,
           va.consecutive_check_failures,
           COALESCE(array_agg(DISTINCT d.capability_slug)
             FILTER (WHERE d.capability_slug IS NOT NULL), '{}') AS affected_capabilities,
           COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
             'capability_slug', d.capability_slug,
             'dependency_kind', d.dependency_kind
           )) FILTER (WHERE d.capability_slug IS NOT NULL), '[]'::jsonb) AS dependency_edges,
           COALESCE(array_agg(DISTINCT s.capability_slug)
             FILTER (WHERE s.restored_at IS NULL AND s.capability_slug IS NOT NULL), '{}') AS active_suspensions
           ,COALESCE(array_agg(DISTINCT vs.solution_slug)
             FILTER (WHERE vs.restored_at IS NULL AND vs.solution_slug IS NOT NULL), '{}') AS active_solution_suspensions
      FROM vendor_accounts va
      LEFT JOIN vendor_capability_dependencies d ON d.provider_name = va.provider_name
      LEFT JOIN vendor_capability_suspensions s ON s.provider_name = va.provider_name
      LEFT JOIN vendor_solution_suspensions vs ON vs.provider_name = va.provider_name
     GROUP BY va.provider_name
     ORDER BY va.provider_name
    `;
    const adapters = registeredBalanceAdapterNames();
    const inventoryIssues = deriveVendorInventoryIssues(accounts, getActiveProviders());
    const issues = [
      ...deriveVendorMorningIssues(accounts, adapters, new Date(), registeredRecoveryAdapterNames()),
      ...inventoryIssues,
    ];

    console.log("Vendor Control Tower");
    console.log(`Status: ${issues.length === 0 ? "CLEAR" : "ACTION NEEDED"}`);
    for (const row of accounts) {
      const reset = row.reset_at ? `; resets ${new Date(row.reset_at).toISOString()}` : "";
      const expiry = row.expires_at ? `; expires ${new Date(row.expires_at).toISOString()}` : "";
      console.log(
        `- ${row.display_name}: ${row.status}; ${units(row)}; ${row.billing_model}; ` +
        `payment-option=${row.payment_method ?? "unknown"}; monitor=${row.monitor_mode}${reset}${expiry}`,
      );
    }
    for (const issue of issues) {
      console.log(`- ${issue.severity.toUpperCase()} ${issue.provider}: ${issue.message}`);
    }
  } finally {
    await operator.end({ timeout: 5 });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
