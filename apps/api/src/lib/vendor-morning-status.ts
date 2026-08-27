export interface VendorAccountMorningRow {
  provider_name: string;
  monitor_mode: string;
  status: string;
  status_reason: string | null;
  expires_at: string | null;
  last_checked_at: string | null;
  active_suspensions: string[];
  active_solution_suspensions?: string[];
}

export interface VendorMorningIssue {
  severity: "critical" | "warning";
  provider: string;
  message: string;
}

export interface ExpectedVendorDependency {
  name: string;
  tier: "free" | "paid" | "self-hosted";
  capabilities: string[];
  fallbackCapabilities?: string[];
}

/** Pure policy used by the morning routine and pinned by unit tests. */
export function deriveVendorMorningIssues(
  accounts: VendorAccountMorningRow[],
  adapterNames: string[],
  now = new Date(),
  _recoveryAdapterNames: string[] = [],
): VendorMorningIssue[] {
  const issues: VendorMorningIssue[] = [];
  const adapters = new Set(adapterNames);
  for (const account of accounts) {
    if (["exhausted", "auth_error", "disabled"].includes(account.status)) {
      issues.push({
        severity: "critical",
        provider: account.provider_name,
        message: account.status_reason ?? `account is ${account.status}`,
      });
    } else if (["low", "rate_limited", "unavailable", "unknown"].includes(account.status)) {
      issues.push({
        severity: "warning",
        provider: account.provider_name,
        message: account.status_reason ?? `account is ${account.status}`,
      });
    }
    if (account.monitor_mode === "api_balance" && !adapters.has(account.provider_name)) {
      issues.push({
        severity: "critical",
        provider: account.provider_name,
        message: "declares an account-balance API but has no registered balance adapter",
      });
    }
    if (
      account.status === "exhausted" &&
      account.monitor_mode !== "api_balance"
    ) {
      issues.push({
        severity: "critical",
        provider: account.provider_name,
        message: "vendor exposes no zero-cost balance/recovery endpoint; reconcile the top-up from its dashboard (synthetic paid probes are prohibited)",
      });
    }
    if (account.monitor_mode === "api_balance" && account.last_checked_at) {
      const ageHours = (now.getTime() - new Date(account.last_checked_at).getTime()) / 3_600_000;
      if (ageHours > 3) {
        issues.push({
          severity: "warning",
          provider: account.provider_name,
          message: `balance reading is stale (${ageHours.toFixed(1)}h old)`,
        });
      }
    }
    if (account.monitor_mode === "spend" && !account.last_checked_at) {
      issues.push({
        severity: "warning",
        provider: account.provider_name,
        message: "spend monitoring is declared but has not reported a reading",
      });
    }
    if (account.expires_at) {
      const days = (new Date(account.expires_at).getTime() - now.getTime()) / 86_400_000;
      if (days <= 30) {
        issues.push({
          severity: days <= 7 ? "critical" : "warning",
          provider: account.provider_name,
          message: days < 0
            ? `prepaid allowance expired ${Math.abs(Math.ceil(days))} day(s) ago`
            : `prepaid allowance expires in ${Math.max(0, Math.ceil(days))} day(s)`,
        });
      }
    }
    for (const slug of account.active_suspensions ?? []) {
      if (!slug) continue;
      issues.push({
        severity: "critical",
        provider: account.provider_name,
        message: `${slug} is automatically suspended`,
      });
    }
    for (const slug of account.active_solution_suspensions ?? []) {
      if (!slug) continue;
      issues.push({
        severity: "critical",
        provider: account.provider_name,
        message: `${slug} solution is automatically suspended`,
      });
    }
  }
  return issues;
}

/** Checks the canonical provider manifest against account and dependency rows. */
export function deriveVendorInventoryIssues(
  accounts: Array<VendorAccountMorningRow & {
    affected_capabilities?: string[];
    dependency_edges?: Array<{ capability_slug: string; dependency_kind: "required" | "fallback" }>;
  }>,
  providers: ExpectedVendorDependency[],
): VendorMorningIssue[] {
  const accountByName = new Map(accounts.map((account) => [account.provider_name, account]));
  const issues: VendorMorningIssue[] = [];
  for (const provider of providers) {
    if (provider.tier !== "paid" && provider.tier !== "self-hosted") continue;
    const account = accountByName.get(provider.name);
    if (!account) {
      issues.push({
        severity: "warning",
        provider: provider.name,
        message: "paid/finite provider has no vendor account record",
      });
      continue;
    }
    const expected = new Map<string, "required" | "fallback">([
      ...provider.capabilities.map((slug) => [slug, "required"] as const),
      ...(provider.fallbackCapabilities ?? []).map((slug) => [slug, "fallback"] as const),
    ]);
    const actual = new Map(
      (account.dependency_edges ?? []).map((edge) => [edge.capability_slug, edge.dependency_kind]),
    );
    const drift = [...expected.entries()]
      .filter(([slug, kind]) => actual.get(slug) !== kind)
      .map(([slug, kind]) => `${slug} (${kind})`);
    const extras = [...actual.keys()].filter((slug) => !expected.has(slug));
    if (drift.length > 0) {
      issues.push({
        severity: "warning",
        provider: provider.name,
        message: `dependency inventory is missing or has the wrong kind: ${drift.join(", ")}`,
      });
    }
    if (extras.length > 0) {
      issues.push({
        severity: "warning",
        provider: provider.name,
        message: `dependency inventory has stale extra edges: ${extras.join(", ")}`,
      });
    }
  }
  return issues;
}
