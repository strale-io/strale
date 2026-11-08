import { inputRefusal } from "../lib/capability-refusal.js";
import { resolveFxRate } from "../lib/fx/resolve.js";
import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("currency-convert", async (input: CapabilityInput) => {
  const amount = Number(input.amount ?? 1);
  const from = ((input.from as string) ?? "USD").toUpperCase().trim();
  const to = ((input.to as string) ?? "EUR").toUpperCase().trim();
  if (!Number.isFinite(amount) || amount <= 0) throw inputRefusal("'amount' must be a positive number.", "amount", "Send 'amount' as a positive number.");
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    throw inputRefusal("'from' and 'to' must be valid 3-letter ISO 4217 currency codes.", "from", "Send 'from' and 'to' as valid 3-letter ISO 4217 currency codes.");
  }

  const result = await resolveFxRate(from, to);
  const rate = result.rate;
  return {
    output: {
      amount, from, to,
      converted_amount: Math.round(amount * rate * 100) / 100,
      rate: Math.round(rate * 1_000_000) / 1_000_000,
      date: result.date,
      rate_source: result.rateSource,
      rate_date: result.date,
      ...(result.stale ? { stale: true } : {}),
    },
    provenance: { ...result.provenance, fetched_at: new Date().toISOString() },
  };
});
