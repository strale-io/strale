/**
 * Upstream hosts whose terms forbid how Strale would use them.
 *
 * Strale resells lookups. "Free and keyless" answers whether Strale can call
 * an upstream, not whether it may sell what comes back, and a commercial
 * vendor's free tier is usually the tier that excludes exactly this. Two
 * vendor-terms audits found fifteen capabilities on the wrong side of that
 * line, some live and paid for months:
 *   docs/security/2026-09-06-vendor-terms-audit.md
 *   docs/security/2026-09-10-vendor-terms-audit-batch-2.md
 *
 * vendor-terms.test.ts holds the source tree to this list: a live code path
 * may not reach any of these hosts. An executor that does must be in
 * auto-register's DEACTIVATED map, and a shared client must refuse the call
 * behind a licence gate. Removing a host from this list is a licence
 * decision — record the plan or permission that changed the answer.
 *
 * When the M3 vendor-state model lands `config/vendors.yaml` with its terms /
 * redistribution verification record (docs/strategy/2026-09-10-m3-vendor-state-model.md,
 * gap G4, batch 3), derive this list from that file's verdicts instead of
 * keeping both — two lists for one fact is how the drift in these audits began.
 */
export const PROHIBITED_UPSTREAM_HOSTS: ReadonlyMap<string, string> = new Map([
  // 2026-09-06
  ["suggestqueries.google.com", "Google — an absolute prohibited target under DEC-20260813-A"],
  ["api.coingecko.com", "CoinGecko free Demo plan excludes commercial use"],
  ["ip-api.com", "ip-api.com free endpoint is non-commercial only"],
  ["internetdb.shodan.io", "Shodan InternetDB is licensed for non-commercial use only"],
  ["api.etherscan.io", "Etherscan API content is for personal, non-commercial use; resale for commercial purposes prohibited"],
  // 2026-09-10
  ["api.gopluslabs.io", "GoPlus bars commercial use of its data without explicit written permission"],
  ["api.aviationstack.com", "AviationStack free plan is personal, non-commercial use"],
  ["api.adzuna.com", "Adzuna permits publishing listings with branding; other commercial use is a 14-day trial"],
  ["hub.docker.com", "Docker bars replicating content for an unauthorized commercial service"],
  ["ethereum-rpc.publicnode.com", "PublicNode bars selling or re-using Service Content commercially"],
  ["rpc.ankr.com", "Ankr bars commercial exploitation of the Service without written consent"],
  ["eth.llamarpc.com", "terms unreadable and the endpoint answered HTTP 525 when checked"],
  ["cloudflare-eth.com", "Cloudflare's anonymous Ethereum gateway is discontinued"],
]);

/** Every prohibited host named in `text` as a URL (scheme://host). */
export function prohibitedHostsIn(text: string): string[] {
  const found: string[] = [];
  for (const host of PROHIBITED_UPSTREAM_HOSTS.keys()) {
    const re = new RegExp(`\\bhttps?://${host.replace(/\./g, "\\.")}(?=[/:?"'\`\\s]|$)`, "i");
    if (re.test(text)) found.push(host);
  }
  return found;
}
