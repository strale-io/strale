/** Request-local marginal upstream cost. No customer prices are changed here. */
import { AsyncLocalStorage } from "node:async_hooks";
import { MODEL_PRICES, MODELS } from "./models.js";

export interface CostItem {
  provider: string;
  cost_cents: number | null;
  reason?: string;
  units?: number;
  credit_assumption?: string;
  native_currency?: string;
  native_cost?: number;
  source?: string;
  pinned_at?: string;
}
export interface CallCost {
  llm: Array<CostItem & { model: string; usage: Record<string, unknown> }>;
  vendors: CostItem[];
  unknowns: string[];
  deadline?: number;
  llm_in_flight: number;
  llm_unmetered_scopes: number;
  /** Explicit, recorded reporting conversion; no effect on charge prices. */
  usd_per_eur: number;
}
const scope = new AsyncLocalStorage<CallCost>();
export function withCallCost<T>(run: () => T, usdPerEur: number): T {
  return scope.run({ llm: [], vendors: [], unknowns: [], llm_in_flight: 0, llm_unmetered_scopes: 0, usd_per_eur: usdPerEur }, run);
}
export function currentCallCost(): CallCost | undefined { return scope.getStore(); }
/** Return a settlement callback tied to the original context, including late SDK results. */
export function startLlmRequest(): () => void {
  const cost = scope.getStore();
  if (cost) cost.llm_in_flight++;
  return () => { if (cost) cost.llm_in_flight--; };
}
const llmScope = new AsyncLocalStorage<{ recorded: boolean }>();
/** Per-capability usage expectation, isolated across parallel solution steps. */
export async function withExpectedLlmUsage<T>(run: () => Promise<T>): Promise<T> {
  const cost = scope.getStore();
  if (!cost) return run();
  const expectation = { recorded: false };
  cost.llm_unmetered_scopes++;
  return llmScope.run(expectation, async () => {
    try { return await run(); }
    finally {
      if (!expectation.recorded) {
        expectation.recorded = true; // Late SDK completion must not decrement twice.
        cost.llm_unmetered_scopes--;
        noteUnknownCost("llm_in_flight_or_unmetered");
      }
    }
  });
}
export function setCostDeadline(timeoutMs: number): void {
  const cost = scope.getStore();
  if (cost) cost.deadline = Date.now() + timeoutMs;
}
export function remainingCallMs(defaultMs = 30_000): number {
  const deadline = scope.getStore()?.deadline;
  const ms = deadline === undefined ? defaultMs : Math.min(defaultMs, deadline - Date.now());
  if (ms <= 0) throw new Error("Execution timeout: caller budget exhausted");
  return Math.max(1, Math.floor(ms));
}
export function noteUnknownCost(reason: string): void {
  const cost = scope.getStore();
  if (cost && !cost.unknowns.includes(reason)) cost.unknowns.push(reason);
}
export function recordLlmUsage(model: string, usage?: Record<string, unknown>): void {
  const cost = scope.getStore();
  if (!cost) return;
  const expectation = llmScope.getStore();
  if (expectation && !expectation.recorded) {
    expectation.recorded = true;
    cost.llm_unmetered_scopes--;
  }
  const role = Object.keys(MODELS).find((key) => MODELS[key as keyof typeof MODELS].id === model) as keyof typeof MODELS | undefined;
  const price = role ? MODEL_PRICES[role] : undefined;
  let dollars: number | null = null;
  if (price && usage && typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number") {
    const input = usage.input_tokens;
    const output = usage.output_tokens;
    const cache = Number(usage.cache_creation_input_tokens ?? 0);
    const read = Number(usage.cache_read_input_tokens ?? 0);
    const creation = usage.cache_creation as { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } | undefined;
    const hour = creation?.ephemeral_1h_input_tokens ?? 0;
    const rates = price.long_prompt && input + cache + read > price.long_prompt.threshold ? price.long_prompt : price;
    dollars = (input * rates.input + output * rates.output + (cache - hour) * rates.cache_write_5m + hour * rates.cache_write_1h + read * rates.cache_read) / 1_000_000;
    if (!Number.isFinite(dollars) || dollars < 0) dollars = null;
  }
  if (dollars === null) noteUnknownCost("llm_price_or_usage_unavailable");
  cost.llm.push({ provider: "anthropic", model, usage: usage ?? {}, native_currency: "USD", native_cost: dollars ?? undefined,
    cost_cents: dollars === null ? null : dollars * 100 / cost.usd_per_eur });
  if (usage?.server_tool_use && Object.values(usage.server_tool_use as object).some((v) => Number(v) > 0)) noteUnknownCost("llm_server_tool_cost_unpriced");
}
export function recordVendorCost(provider: string, units: number, outcome: "success" | "failure" | "uncertain" = "uncertain"): void {
  const cost = scope.getStore();
  if (!cost || units === 0) return; // Explicit zero-unit unauthenticated probe.
  // Starter plan recorded by block 0105; source read 2026-10-27.
  // Serper deducts credits only for successful responses (vendor FAQ).
  // Assumption: 1 credit per call, regardless of num. Public pricing/FAQ and
  // playground checked 2026-10-27; no readable official num-to-credit schedule.
  // adverse-media-check requests num:20; google-search permits 100. Depth may
  // cost extra: this estimate can understate actual cost until documented.
  if (provider === "serper" && outcome !== "uncertain") {
    const dollars = outcome === "success" ? units * 0.001 : 0;
    cost.vendors.push({ provider, units, cost_cents: dollars * 100 / cost.usd_per_eur,
      native_currency: "USD", native_cost: dollars, reason: "starter_prepaid_unit_cost",
      credit_assumption: "1 credit per call; num-dependent billing unverified (20/100 results may cost more)",
      source: "https://serper.dev/", pinned_at: "2026-10-27" });
    return;
  }
  // Test-suite external_cost_cents are conservative scheduling floors, not invoices.
  const reason = provider === "browserless" || provider === "openregister" || provider === "dilisense"
    ? "allowance_or_plan_unit_price_unknown" : provider === "esortcode" ? "gbp_conversion_unavailable" : "vendor_unit_price_unverified";
  cost.vendors.push({ provider, units, cost_cents: null, reason,
    ...(provider === "esortcode" ? { native_currency: "GBP", native_cost: units * 0.15 } : {}) });
  noteUnknownCost(`${provider}:${reason}`);
}
export function snapshotCallCost(): { cost_cents: string | null; cost_breakdown: Record<string, unknown> } {
  const cost = scope.getStore();
  if (!cost) return { cost_cents: null, cost_breakdown: { unknowns: ["cost_context_missing"] } };
  // Snapshot-local: a late response cannot turn this already-written unknown into zero.
  const unknowns = [...cost.unknowns];
  if (cost.llm_in_flight > 0 || cost.llm_unmetered_scopes > 0) {
    if (!unknowns.includes("llm_in_flight_or_unmetered")) unknowns.push("llm_in_flight_or_unmetered");
  }
  const { deadline: _deadline, ...breakdown } = cost;
  const items = [...cost.llm, ...cost.vendors];
  const known = items.reduce((sum, item) => sum + (item.cost_cents ?? 0), 0);
  return { cost_cents: unknowns.length || items.some((i) => i.cost_cents === null) ? null : known.toFixed(9),
    cost_breakdown: { ...structuredClone(breakdown), unknowns, currency: "EUR", known_cost_cents: known,
      fx_basis: "reporting estimate; EUR_USD_RATE used by x402, not invoice FX" } };
}
