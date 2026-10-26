import { registerCapability, getExecutor, type CapabilityInput } from "./index.js";
import { isCircuitOpen } from "../lib/composite-breaker.js";
import { runCompanyStatusCheck } from "../lib/company-status/compose.js";

// "Is this company still alive?" (portfolio plan 1C.1, DEC-20261024-B).
// Composes the registry and insolvency executors listed in
// lib/company-status/routing.ts; no fetch code lives here. A data lookup:
// it returns the registry's status and any official insolvency notices, never
// a recommendation.

registerCapability("company-status-check", (input: CapabilityInput) =>
  runCompanyStatusCheck(input, { getExecutor, isCircuitOpen, now: () => new Date() }),
);
