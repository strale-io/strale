/** Shared fetch wrapper for APIs whose calls consume credits or cash. */
import {
  assertVendorAvailable,
  recordVendorHttpFailure,
  recordVendorUsage,
} from "./vendor-control-tower.js";
import { logWarn } from "./log.js";

export async function meteredVendorFetch(
  providerName: string,
  url: string | URL,
  init: RequestInit,
  units = 1,
  fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response> = fetch,
  classifyHttpFailures = true,
): Promise<Response> {
  // Unit capability tests replace fetch with a local spy and intentionally run
  // without DATABASE_URL. Requiring a database before reaching that spy would
  // make input-validation tests fail without strengthening production. The
  // explicit force flag keeps this wrapper's own control-path tests live.
  const unitTestWithoutDb =
    process.env.NODE_ENV === "test" &&
    !process.env.DATABASE_URL &&
    process.env.VENDOR_CONTROL_TOWER_FORCE !== "1";
  if (unitTestWithoutDb) return fetchImpl(url, init);

  await assertVendorAvailable(providerName);
  const response = await fetchImpl(url, init);
  try {
    if (response.ok) await recordVendorUsage(providerName, units);
    else if (classifyHttpFailures) {
      if (providerName === "esortcode" && response.status === 403) {
        const detail = await response.clone().text().catch(() => "");
        await recordVendorHttpFailure(providerName, response.status, detail);
      } else {
        await recordVendorHttpFailure(providerName, response.status);
      }
    }
  } catch (error) {
    // Accounting/control-plane persistence must be visible, but it must not
    // replace the vendor response the capability needs to classify.
    logWarn("vendor-control-record-failed", "could not record metered vendor response", {
      provider: providerName,
      http_status: response.status,
      err: error instanceof Error ? error.message : String(error),
    });
  }
  return response;
}

/** Zero-unit reachability probe: preflight account state, but never interpret
 * an intentionally unauthenticated 401/403 as an authenticated account error. */
export function vendorReachabilityFetch(
  providerName: string,
  url: string | URL,
  init: RequestInit,
  fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  return meteredVendorFetch(providerName, url, init, 0, fetchImpl, false);
}

export function browserlessFetch(
  url: string | URL,
  init: RequestInit,
  units = 1,
  fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  return meteredVendorFetch("browserless", url, init, units, fetchImpl);
}
