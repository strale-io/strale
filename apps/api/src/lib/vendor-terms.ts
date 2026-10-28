import records from "./vendor-terms.data.json" with { type: "json" };

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
  ["suggestqueries.google.com", "Google — direct Google access is never lane item 4 under DEC-20261023-A (formerly an absolute prohibited target under DEC-20260813-A)"],
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
  // 2026-10-24 (DEC-20261023-A; see VENDOR_TERMS_RECORDS below). Listed for the
  // rule's never lane item 2 (getting around blocks) as much as for its terms,
  // which are unrecorded: this list also holds hosts barred for HOW they fetch.
  ["r.jina.ai", "Jina Reader retries a blocked fetch through its own proxy pool by default and was used on an anonymous tier whose commercial terms were never recorded"],
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

/**
 * What a vendor's terms say about Strale reselling its data, as read, with the
 * evidence (DEC-20261023-A: vendor data is allowed only when "the vendor's
 * terms permit resale, verified and recorded").
 *
 * `resale` is what the terms SAY, not what Strale would like: "unverified"
 * means nobody has read a current copy that settles it. Being unverified does
 * not by itself put a vendor on `PROHIBITED_UPSTREAM_HOSTS` (Jina is there
 * for how it fetches, see above); a vendor still in use with unverified terms
 * is an open decision, and the entry names where that decision is queued.
 *
 * `vendor-terms.test.ts` holds `capabilities` to the source tree: every
 * executor that calls one of `hosts` must be listed, so the record cannot
 * silently understate who depends on a vendor.
 */
interface VendorTermsFields {
  vendor: string;
  hosts: readonly string[];
  /** Restrict a host-wide record to these service URL prefixes, if set. */
  url_prefixes?: readonly string[];
  /** Vendor id passed to meteredVendorFetch, when calls go through it. */
  metered_id?: string;
  /** Executors that call one of `hosts`. */
  capabilities: readonly string[];
  terms_url: string;
  /** ISO date the terms were read (or the read was attempted). */
  accessed: string;
  /** How the text was obtained, and its limits. */
  how_read: string;
  findings: readonly string[];
  /** Where the open question or the decision lives. */
  decision_ref: string;
}

/** A founder-accepted permission; evidence is archived once and never edited. */
export interface VendorPermission {
  received_on: string;
  from: string;
  evidence_path: string;
  condition: string;
  accepted_by: "petter";
  accepted_on: string;
  decision_ref: string;
  reopen_only_if: readonly string[];
}

export interface SupersededPermission {
  decision_ref: string;
  reason: string;
  evidence_path: string;
}

export type VendorTermsRecord = VendorTermsFields & {
  superseded?: SupersededPermission;
} & (
  | { resale: "permitted"; basis: "published_terms"; permission?: never }
  | { resale: "permitted"; basis: "written_permission"; permission: VendorPermission }
  | { resale: "prohibited" | "unverified"; basis?: "published_terms"; permission?: never }
  | { resale: "prohibited" | "unverified"; basis: "written_permission"; permission: VendorPermission }
);

// JSON strings widen on import. The register tests and vendor-terms:check
// validate the data contract, including repository evidence and Git history.
export const VENDOR_TERMS_RECORDS: readonly VendorTermsRecord[] = records as readonly VendorTermsRecord[];
