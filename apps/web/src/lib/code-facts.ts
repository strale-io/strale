// Facts the public API does not publish but the site must state correctly,
// read from the API source at build time so the code stays the one source.
// A constant that moves or is renamed fails the build instead of going stale.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./site-data.ts";

const read = (file: string) => readFileSync(resolve(REPO_ROOT, file), "utf8");

function match(file: string, re: RegExp, what: string): RegExpMatchArray {
  const m = read(file).match(re);
  if (!m) throw new Error(`apps/web expected ${what} in ${file}; update src/lib/code-facts.ts if it moved`);
  return m;
}

function constant(file: string, name: string): number {
  return Number(match(file, new RegExp(`const ${name}\\s*=\\s*([\\d_]+)`), name)[1].replace(/_/g, ""));
}

/** Anonymous calls a day to free tools, per identified IP (apps/api/src/routes/do.ts). */
export const FREE_TIER_DAILY_LIMIT = constant("apps/api/src/routes/do.ts", "FREE_TIER_DAILY_LIMIT");
/** Smallest wallet top-up, in EUR cents (apps/api/src/routes/wallet.ts). */
export const MIN_TOPUP_CENTS = constant("apps/api/src/routes/wallet.ts", "MIN_TOPUP_CENTS");
/** Hard ceiling on max_price_cents for one API call, in EUR cents (apps/api/src/routes/do.ts). */
export const MAX_PRICE_CAP_CENTS = constant("apps/api/src/routes/do.ts", "MAX_PRICE_CAP_CENTS");
/** Trial credit granted once per email address on signup, in EUR cents (apps/api/src/lib/trial-eligibility.ts). */
export const TRIAL_CREDITS_CENTS = constant("apps/api/src/lib/trial-eligibility.ts", "TRIAL_CREDITS_CENTS");
/** When a tool’s declared mean run time is above this, /v1/do answers 202 and runs the tool in the background (DEC-22). */
export const ASYNC_THRESHOLD_MS = constant("apps/api/src/lib/execution-routing.ts", "ASYNC_THRESHOLD_MS");

/** The default hourly spend limit on an account, in EUR cents (users.max_spend_per_hour_cents, DEC-21). */
export const DEFAULT_HOURLY_SPEND_CAP_CENTS = Number(
  match("apps/api/src/db/schema.ts", /maxSpendPerHourCents:[^;]*?\.default\((\d+)\)/, "the maxSpendPerHourCents default")[1],
);

/** Requests per window on /v1/do per API key (rateLimitByKey(count, windowMs) in do.ts). */
export const KEY_RATE_LIMIT = (() => {
  const m = match("apps/api/src/routes/do.ts", /rateLimitByKey\((\d+),\s*([\d_]+)\)/, "rateLimitByKey on /v1/do");
  return { requests: Number(m[1]), windowMs: Number(m[2].replace(/_/g, "")) };
})();

/** The user agent Strale's page-fetch path sends (apps/api/src/lib/site-access.ts). */
export const STRALE_USER_AGENT = match("apps/api/src/lib/site-access.ts", /export const STRALE_USER_AGENT = "([^"]+)"/, "STRALE_USER_AGENT")[1];

/** The provenance.source string an executor writes, when it is a literal. */
export function executorSource(slug: string): string | null {
  try {
    return read(`apps/api/src/capabilities/${slug}.ts`).match(/provenance:\s*\{[^}]*?source:\s*"([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The public error codes (the ErrorCode union in apps/api/src/lib/errors.ts), minus the internal admin one. */
export const ERROR_CODES: string[] = (() => {
  const src = read("apps/api/src/lib/errors.ts").replace(/\/\/.*$/gm, "");
  const union = src.match(/export type ErrorCode =([\s\S]*?);/)?.[1];
  if (!union) throw new Error("apps/web expected the ErrorCode union in apps/api/src/lib/errors.ts");
  return [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).filter((c) => c !== "migration_failed");
})();

/**
 * HTTP statuses each error code is returned with on the call routes (/v1/do,
 * bundled checks, and the auth middleware), read from the
 * `apiError("code", …), status` call sites. A code not returned there maps to [].
 */
export const ERROR_STATUSES: Map<string, number[]> = (() => {
  const src = ["apps/api/src/routes/do.ts", "apps/api/src/routes/solution-execute.ts", "apps/api/src/lib/middleware.ts"].map(read).join("\n");
  const out = new Map<string, Set<number>>();
  for (const m of src.matchAll(/apiError\(\s*"([a-z_]+)"[\s\S]{0,700}?\)\s*,\s*(\d{3})\s*,?\s*\)/g)) {
    if (!out.has(m[1])) out.set(m[1], new Set());
    out.get(m[1])!.add(Number(m[2]));
  }
  return new Map(ERROR_CODES.map((c) => [c, [...(out.get(c) ?? [])].sort()]));
})();

/** MCP tool names the server registers (packages/mcp-server/src/tools.ts). */
export const MCP_TOOLS: string[] = [...read("packages/mcp-server/src/tools.ts").matchAll(/registerTool\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);

/** The MCP server's default max_price_cents when the client sets none (packages/mcp-server/src/server.ts). */
export const MCP_DEFAULT_MAX_PRICE_CENTS = Number(
  match("packages/mcp-server/src/server.ts", /STRALE_MAX_PRICE_CENTS\s*\?\?\s*"(\d+)"/, "the STRALE_MAX_PRICE_CENTS default")[1],
);

/** timeout_seconds on /v1/do: the default, and the most a caller may ask for (apps/api/src/routes/do.ts). */
export const TIMEOUT_SECONDS = {
  default: constant("apps/api/src/routes/do.ts", "DEFAULT_TIMEOUT_SECONDS"),
  max: constant("apps/api/src/routes/do.ts", "MAX_TIMEOUT_SECONDS"),
};

export interface FrameworkPackage { dir: string; name: string; registry: "npm" | "PyPI" }

/**
 * Framework packages that may be listed (SITE-STRUCTURE page 10; DEC-20260422-A):
 * the `packages/*-strale` packages that apps/api/scripts/check-framework-packages.mjs
 * verifies, which are those without a DEPRECATED.md. Name and registry come from
 * the package's own manifest.
 */
export const FRAMEWORK_PACKAGES: FrameworkPackage[] = readdirSync(resolve(REPO_ROOT, "packages"))
  .filter((d) => d.endsWith("-strale") && !existsSync(resolve(REPO_ROOT, "packages", d, "DEPRECATED.md")))
  .sort()
  .map((dir) => {
    const pkg = resolve(REPO_ROOT, "packages", dir, "package.json");
    if (existsSync(pkg)) return { dir, name: (JSON.parse(readFileSync(pkg, "utf8")) as { name: string }).name, registry: "npm" as const };
    return { dir, name: match(`packages/${dir}/pyproject.toml`, /^name\s*=\s*"([^"]+)"/m, "the package name")[1], registry: "PyPI" as const };
  });

/** The transaction columns cleared when call content is redacted (CUSTOMER_CONTENT_COLUMNS, apps/api/src/lib/customer-content.ts). */
export const CONTENT_COLUMNS: string[] = (() => {
  const block = match("apps/api/src/lib/customer-content.ts", /CUSTOMER_CONTENT_COLUMNS:[^=]*=\s*\[([\s\S]*?)\n\]/, "CUSTOMER_CONTENT_COLUMNS")[1];
  return [...block.matchAll(/column:\s*"([a-z_]+)"/g)].map((m) => m[1]);
})();
