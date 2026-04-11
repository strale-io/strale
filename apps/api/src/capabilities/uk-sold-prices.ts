import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK sold property prices from HM Land Registry Price Paid Data.
 * Free API, no key required. Returns recent transactions for a postcode.
 */

registerCapability("uk-sold-prices", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!postcode) {
    throw new Error("'postcode' is required. Provide a UK postcode (e.g. 'SW1A 1AA').");
  }

  const limit = Math.min(Number(input.limit ?? 20), 50);

  // Use Land Registry Linked Data API
  const url = `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?_pageSize=${limit}&_sort=-transactionDate&propertyAddress.postcode=${encodeURIComponent(postcode)}`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`Land Registry API returned HTTP ${resp.status}.`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | undefined;
  const items = ((result?.items ?? []) as Array<Record<string, unknown>>);

  if (items.length === 0) {
    throw new Error(`No sold price records found for postcode '${postcode}'.`);
  }

  const transactions = items.map((item) => {
    const addr = item.propertyAddress as Record<string, unknown> | undefined;
    const txn = item.hasTransaction as Record<string, unknown> | undefined;

    const pricePaid = Number(
      item.pricePaid ?? txn?.pricePaid ?? 0,
    );
    const date = String(
      item.transactionDate ?? txn?.transactionDate ?? "",
    ).slice(0, 10);

    const estateType = item.estateType as Record<string, unknown> | undefined;
    const estateLabel = extractLabel(estateType);

    const propType = item.propertyType as Record<string, unknown> | undefined;
    const propLabel = extractLabel(propType);

    const newBuild = item.newBuild as Record<string, unknown> | undefined;
    const isNew = extractLabel(newBuild)?.toLowerCase() === "y";

    return {
      price: pricePaid,
      date,
      address: addr
        ? [addr.paon, addr.saon, addr.street, addr.town, addr.county, addr.postcode]
            .filter(Boolean)
            .join(", ")
        : null,
      property_type: propLabel,
      estate_type: estateLabel,
      new_build: isNew,
    };
  });

  // Compute summary statistics
  const prices = transactions.map((t) => t.price).filter((p) => p > 0);
  const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  return {
    output: {
      postcode,
      total_transactions: transactions.length,
      average_price: avgPrice,
      min_price: minPrice,
      max_price: maxPrice,
      currency: "GBP",
      transactions,
    },
    provenance: { source: "landregistry.data.gov.uk", fetched_at: new Date().toISOString() },
  };
});

function extractLabel(obj: Record<string, unknown> | undefined): string | null {
  if (!obj) return null;
  const label = obj.label ?? obj.prefLabel;
  if (typeof label === "string") return label;
  if (Array.isArray(label) && label.length > 0) {
    const first = label[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first !== null) return (first as Record<string, unknown>)._value as string ?? null;
  }
  return null;
}
