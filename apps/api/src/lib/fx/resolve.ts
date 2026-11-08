import { inputRefusal } from "../capability-refusal.js";
import { FxCurrencyUnavailableError, getEcbReferenceRates, getFrankfurterCurrencies, getFrankfurterRate, isEcbReferenceCurrency } from "./rates.js";

export interface ResolvedFxRate {
  rate: number;
  date: string;
  stale?: true;
  rateSource: "ECB euro reference rate" | "Frankfurter blended central-bank rate";
  provenance: { source: string; [key: string]: string };
}

function unavailable(currency: string, field: "from" | "to"): never {
  throw inputRefusal(`'${field}' must be a currency with a published reference rate; ${currency} has no published reference rate.`, field, `Send '${field}' as a currency with a published reference rate.`);
}

export async function resolveFxRate(from: string, to: string): Promise<ResolvedFxRate> {
  if (isEcbReferenceCurrency(from) && isEcbReferenceCurrency(to)) {
    const ecb = await getEcbReferenceRates();
    // The static list routes here before the file is read; a code the file no
    // longer carries (the ECB has suspended codes before) goes to Frankfurter
    // rather than producing NaN as a success.
    if (ecb.rates.has(from) && ecb.rates.has(to)) return {
      rate: ecb.rates.get(to)! / ecb.rates.get(from)!, date: ecb.date,
      ...(ecb.stale ? { stale: true as const } : {}), rateSource: "ECB euro reference rate",
      provenance: { source: "ecb.europa.eu", attribution: "Source: European Central Bank (euro foreign exchange reference rates, available free of charge at ecb.europa.eu)", acquisition_method: "direct_api", data_access_lane: "preferred" },
    };
  }
  try {
    const result = await getFrankfurterRate(from, to);
    return {
      rate: result.rate, date: result.date, rateSource: "Frankfurter blended central-bank rate",
      provenance: { source: "frankfurter.dev", attribution: "Source: Frankfurter (blended central-bank rates, frankfurter.dev)", acquisition_method: "vendor_api", data_access_lane: "allowed_with_checks", upstream_vendor: "Frankfurter" },
    };
  } catch (error) {
    if (error instanceof FxCurrencyUnavailableError) {
      let currencies: Set<string>;
      try {
        currencies = await getFrankfurterCurrencies();
      } catch {
        throw inputRefusal(`'from' and 'to' must be currencies with published reference rates; ${from} and ${to} could not be confirmed.`, "from", "Send 'from' and 'to' as currencies with published reference rates.");
      }
      if (!currencies.has(from)) unavailable(from, "from");
      unavailable(to, "to");
    }
    throw error;
  }
}
