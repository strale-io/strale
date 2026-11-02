/**
 * Paid-call guard: Strale's own test traffic never spends money upstream.
 *
 * The dispatcher gate (`capabilities/guarded-executor.ts`, ALLOW_MATRIX)
 * refuses non-customer invocations of capabilities whose `cost_class` is
 * paid. That check is per capability and trusts the classification. It
 * misses two shapes, both found 2026-11-02:
 *
 *   1. A capability classified free whose executor still makes a paid call
 *      on some inputs. `canadian-company-data` (free_unlimited) and
 *      `danish-company-data` (free_quota) call Claude Haiku to pull a company
 *      name out of free text whenever the input is not a registration
 *      number; `canadian-company-data`'s second known_answer suite looks up
 *      "Shopify" by name, so every scheduled run paid Anthropic.
 *   2. A composite capability (`company-status-check`, free_quota) calls
 *      sub-executors through `getExecutor`, which bypasses the gate by
 *      design, so a paid sub-capability can run under a free parent.
 *
 * This guard closes both at the point where money is spent instead of where
 * the capability is classified. These call `assertPaidCallAllowed`, which
 * refuses while a non-customer invocation scope is active:
 *
 *   - `createAnthropicClient` (every Anthropic request);
 *   - `meteredVendorFetch` for BILLABLE_METERED_VENDORS (Serper, Dilisense,
 *     eSortCode);
 *   - the raw fetches to openapi.com (`capabilities/lib/openapi-resolver.ts`
 *     product calls), Cobalt, sec-api.io and EINsearch.
 *
 * A billable vendor added later must call `assertPaidCallAllowed` too.
 *
 * The scope wraps the automated non-customer executor paths: scheduled and
 * regression tests (`test-runner.ts`), `guardedExecute` for non-customer
 * contexts (onboard.ts, smoke-test, onboarding pipeline), onboarding
 * calibration (`capability-onboarding.ts`), admin recalibrate
 * (`routes/internal-tests.ts`), fixture verification (`db/seed-tests.ts`)
 * and `db/audit-tests.ts`. Customer calls never enter a scope, so they are
 * unaffected.
 *
 * Not wrapped, deliberately: operator scripts a person runs by hand to
 * exercise live upstreams (`scripts/sweep-paid-fixtures.ts`, which spends on
 * purpose under the EUR 25 sweep cap of DEC-20260812-A;
 * `scripts/capture-tier-fixtures.ts`, `scripts/smoke-openapi-resolver.ts`,
 * `src/scripts/audit-live-registries.ts`,
 * `src/scripts/dk-cvr-retry-2026-05-06.ts`). Running one is a human
 * decision, not background test traffic.
 *
 * A blocked scheduled run is skipped like an exhausted test budget (no
 * test_results row). For free_quota capabilities the dispatcher still takes
 * a budget slot before the executor runs, so a blocked run uses one test
 * slot while spending nothing.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** Invocation kinds that are Strale's own traffic, never a customer's. */
export type NonCustomerKind = "internal_test" | "health_probe" | "ci";

const scope = new AsyncLocalStorage<{ kind: NonCustomerKind }>();

/**
 * Stable marker in the error message. The failure classifier and the test
 * runner match on it, because the error crosses executor boundaries that
 * re-wrap errors as plain strings.
 */
export const PAID_CALL_BLOCKED_MARKER = "paid upstream call blocked during Strale's own testing";

export class PaidCallBlockedError extends Error {
  constructor(public provider: string, public kind: NonCustomerKind) {
    super(
      `${PAID_CALL_BLOCKED_MARKER}: provider '${provider}', context '${kind}'. ` +
        `Customer traffic is unaffected.`,
    );
    this.name = "PaidCallBlockedError";
  }
}

/** Run `fn` as Strale's own (non-customer) traffic: paid upstream calls refuse. */
export function runWithoutPaidCalls<T>(kind: NonCustomerKind, fn: () => T): T {
  return scope.run({ kind }, fn);
}

/** Throws `PaidCallBlockedError` inside a non-customer scope; no-op otherwise. */
export function assertPaidCallAllowed(provider: string): void {
  const store = scope.getStore();
  if (store) throw new PaidCallBlockedError(provider, store.kind);
}

/** True when an error message (possibly re-wrapped) came from this guard. */
export function isPaidCallBlockedMessage(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes(PAID_CALL_BLOCKED_MARKER);
}

/**
 * Data vendors that bill per call (or per unit) with no free allowance
 * Strale relies on. `openregister` (free quota) and `browserless`
 * (self-hosted on Railway, no per-call bill) are deliberately absent:
 * those calls cost nothing, and their quotas are budget-tracked by the
 * dispatcher gate.
 */
export const BILLABLE_METERED_VENDORS: ReadonlySet<string> = new Set([
  "serper",
  "dilisense",
  "esortcode",
]);
