/** Shared reporting/payment conversion. Existing x402 default and validation unchanged. */
export const EUR_USD_RATE = parseFloat(process.env.EUR_USD_RATE ?? "1.08");
if (!Number.isFinite(EUR_USD_RATE) || EUR_USD_RATE <= 0) {
  // Fail fast at module load: a malformed env value ("1,085", "") would
  // otherwise emit maxAmountRequired: "NaN" on every 402.
  throw new Error(`EUR_USD_RATE is not a positive number: "${process.env.EUR_USD_RATE}"`);
}
