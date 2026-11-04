// Display formatting. The API sends integer cents and numbers (wire-shape rule);
// formatting is the page's job.

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatEur(cents: number): string {
  return eur.format(cents / 100);
}

/** x402 prices are USDC with up to six decimals; show at least two, at most four. */
export function formatUsd(usd: number): string {
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/** USDC atomic units (six decimals), as the 402 challenge states the amount. */
export function usdcAtomic(usd: number): string {
  return String(Math.round(usd * 1e6));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Stockholm" });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
