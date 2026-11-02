import { AsyncLocalStorage } from "node:async_hooks";
/**
 * Data-access lane and acquisition method on every answer (DEC-20261023-A,
 * "On adoption" item: "acquisition method and lane in provenance").
 *
 * Each manifest declares how its capability gets its data:
 *
 *   data_access:
 *     lane: preferred | allowed_with_checks | not_applicable
 *     acquisition_method: <AcquisitionMethod>
 *     upstream_vendor: "serper"     # optional; set when a vendor sits between Strale and the source
 *     checks: recorded | pending    # required on allowed_with_checks, forbidden elsewhere
 *     checks_note: "…"              # required when checks is recorded
 *
 * `not_applicable` is for capabilities that fetch nothing (computation over
 * the caller's input, or an LLM transformation of it). The rule's third lane,
 * "never", has no value here: a capability in it is deactivated, not labelled.
 *
 * "Allowed with checks" is conditional: the rule allows the source only once
 * its checks are recorded (vendor terms that permit resale; a source's terms
 * permitting per-call access; a fetch that honours robots.txt and stops at a
 * block). `checks: pending` says the lane applies but the checks are not yet
 * recorded, so an answer never claims more than has been verified.
 * `checks_note` is the rule's one-paragraph note ("Recording the lane"): what
 * is fetched, why it may be, whose terms were checked, how blocks are honoured.
 *
 * auto-register reads the block once at startup and `getExecutor` stamps it
 * onto provenance. The executor's own value wins, because only the executor
 * knows which path a call took (a fallback vendor, a cached answer); the
 * manifest is the default for the common path.
 */

export const DATA_ACCESS_LANES = ["preferred", "allowed_with_checks", "not_applicable"] as const;
export type DataAccessLane = (typeof DATA_ACCESS_LANES)[number];

export const ACQUISITION_METHODS = [
  // Introduced under DEC-20260428-A.
  "direct_api", //              authoritative source's own API (registry, agency, protocol endpoint)
  "licensed_bulk", //           bulk feed or bundled dataset under licence
  "vendor_aggregation", //      multi-source aggregator with mixed methods
  "vendor_scraping", //         vendor scrapes a public-records portal
  "primary_source", //          primary record or protocol answer itself (DNS, filing, document)
  // Added with DEC-20261023-A.
  "vendor_api", //              a vendor's API over data the vendor holds or collects
  "customer_directed_fetch", // a single fetch of a URL or host the caller named
  "public_page_read", //        a per-call read of a public page Strale chose
  "computed", //                no external data: computed from the caller's input
] as const;
export type AcquisitionMethod = (typeof ACQUISITION_METHODS)[number];

export const DATA_ACCESS_CHECKS = ["recorded", "pending"] as const;
export type DataAccessChecks = (typeof DATA_ACCESS_CHECKS)[number];

/** Shortest checks_note accepted: a sentence, not a placeholder. */
const MIN_CHECKS_NOTE_CHARS = 40;

const KNOWN_KEYS = new Set(["lane", "acquisition_method", "upstream_vendor", "checks", "checks_note"]);

export interface DataAccess {
  lane: DataAccessLane;
  acquisition_method: AcquisitionMethod;
  upstream_vendor?: string;
  checks?: DataAccessChecks;
  checks_note?: string;
}

/**
 * Validate a manifest's `data_access` block. Returns the typed value, or the
 * list of problems. Unknown keys are refused so a typo cannot pass silently.
 */
export function parseDataAccess(raw: unknown): { ok: true; value: DataAccess } | { ok: false; errors: string[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["data_access must be a mapping"] };
  }
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(r)) {
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`data_access.${key} is not a known field`);
    }
  }
  if (!DATA_ACCESS_LANES.includes(r.lane as DataAccessLane)) {
    errors.push(`data_access.lane must be one of ${DATA_ACCESS_LANES.join(", ")}`);
  }
  if (!ACQUISITION_METHODS.includes(r.acquisition_method as AcquisitionMethod)) {
    errors.push(`data_access.acquisition_method must be one of ${ACQUISITION_METHODS.join(", ")}`);
  }
  if (r.upstream_vendor !== undefined && (typeof r.upstream_vendor !== "string" || r.upstream_vendor.length === 0)) {
    errors.push("data_access.upstream_vendor must be a non-empty string when set");
  }
  // Consistency: "computed" fetches nothing, so it has no lane, and the reverse.
  if ((r.lane === "not_applicable") !== (r.acquisition_method === "computed")) {
    errors.push("data_access.lane is not_applicable exactly when acquisition_method is computed");
  }
  if (r.acquisition_method === "computed" && r.upstream_vendor !== undefined) {
    errors.push("data_access.upstream_vendor cannot be set when acquisition_method is computed");
  }
  if (r.lane === "allowed_with_checks") {
    if (!DATA_ACCESS_CHECKS.includes(r.checks as DataAccessChecks)) {
      errors.push(`data_access.checks must be one of ${DATA_ACCESS_CHECKS.join(", ")} on the allowed_with_checks lane`);
    }
  } else if (r.checks !== undefined || r.checks_note !== undefined) {
    errors.push("data_access.checks and checks_note apply only to the allowed_with_checks lane");
  }
  if (r.checks_note !== undefined && typeof r.checks_note !== "string") {
    errors.push("data_access.checks_note must be a string");
  }
  if (r.checks === "recorded" && (typeof r.checks_note !== "string" || r.checks_note.trim().length < MIN_CHECKS_NOTE_CHARS)) {
    errors.push(
      `data_access.checks_note is required when checks is recorded (at least ${MIN_CHECKS_NOTE_CHARS} characters: what is fetched, whose terms were checked, how blocks are honoured)`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };
  const value: DataAccess = {
    lane: r.lane as DataAccessLane,
    acquisition_method: r.acquisition_method as AcquisitionMethod,
  };
  if (typeof r.upstream_vendor === "string") value.upstream_vendor = r.upstream_vendor;
  if (r.checks !== undefined) value.checks = r.checks as DataAccessChecks;
  if (typeof r.checks_note === "string") value.checks_note = r.checks_note;
  return { ok: true, value };
}

const registry = new Map<string, DataAccess>();

export function registerDataAccess(slug: string, value: DataAccess): void {
  registry.set(slug, value);
}

export function getDataAccess(slug: string): DataAccess | undefined {
  return registry.get(slug);
}

/** Test-only. */
export function __resetDataAccessForTests(): void {
  registry.clear();
}

/**
 * Fill `acquisition_method`, `data_access_lane`, `upstream_vendor` and
 * `data_access_checks` from the manifest where the executor left them unset.
 * Never overwrites an executor value: the executor knows which path the call
 * took. `upstream_vendor` is filled only when the executor also left
 * `acquisition_method` unset, so a call the executor labelled as taking
 * another path never inherits the manifest's vendor.
 *
 * `data_access_checks` can only be lowered, never raised. It is "recorded"
 * only when the manifest records the checks AND the call took the path the
 * record covers: an executor that names another method or vendor took a path
 * the record does not cover, so the call is stamped "pending". An executor's
 * own value can lower the claim but not raise it above the manifest's, and
 * on a lane without checks it is removed. A capability with no data_access
 * block is not stamped at all (getExecutor returns the plain executor).
 */
export function stampDataAccess<P extends Record<string, unknown>>(provenance: P, access: DataAccess | undefined): P {
  if (!access || provenance === null || typeof provenance !== "object") return provenance;
  const out: Record<string, unknown> = { ...provenance };
  const executorSetMethod = out.acquisition_method !== undefined;
  if (!executorSetMethod) out.acquisition_method = access.acquisition_method;
  if (out.data_access_lane === undefined) out.data_access_lane = access.lane;
  if (!executorSetMethod && out.upstream_vendor === undefined && access.upstream_vendor) {
    out.upstream_vendor = access.upstream_vendor;
  }
  if (access.checks) {
    const otherMethod = out.acquisition_method !== access.acquisition_method;
    const otherVendor = out.upstream_vendor !== undefined && out.upstream_vendor !== access.upstream_vendor;
    const covered = access.checks === "recorded" && !otherMethod && !otherVendor;
    out.data_access_checks = covered && out.data_access_checks !== "pending" ? "recorded" : "pending";
  } else {
    // A lane without checks carries no checks claim, whatever the executor said.
    delete out.data_access_checks;
  }
  return out as P;
}

/** Propagate the manifest method through nested executor helpers without cross-call leakage. */
const acquisitionContext = new AsyncLocalStorage<AcquisitionMethod>();
export function withAcquisitionMethod<T>(method: AcquisitionMethod | undefined, run: () => T): T {
  return method ? acquisitionContext.run(method, run) : run();
}
export function currentAcquisitionMethod(): AcquisitionMethod | undefined {
  return acquisitionContext.getStore();
}
