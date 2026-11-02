/**
 * Which URLs in a capability's source are Strale-chosen pages whose robots.txt
 * can be checked before a customer ever calls it?
 *
 * The distinction this module exists to draw is DEC-20261023-A's:
 *
 *   - The customer names the page (`https://${url}`) — a caller-directed
 *     fetch. The target is unknown until the call, a block is a refusal and not
 *     a fault, and there is nothing to check in advance.
 *   - Strale chose the source (`https://euipo.europa.eu/eSearch/#basic/${q}`) —
 *     the host is in the executor. A block means the capability cannot do what
 *     it is sold to do, which `site-access.ts` reports as `SourceBlockedError`.
 *
 * Only the second kind is statically knowable, and it is the kind that can kill
 * a listed capability. The test for a dynamic host is a placeholder in the HOST,
 * not anywhere in the URL: a placeholder in the path (a query, an id, a
 * container number) still leaves the source Strale's choice.
 *
 * Used by `scripts/check-source-robots-access.ts`. Kept here, beside
 * `site-access.ts` and `robots-txt.ts`, because it encodes the same rule they
 * enforce, and so it is covered by the api test suite rather than by nothing.
 */

/** A placeholder is spelled distinctively so a dynamic host is recognisable. */
export const PLACEHOLDER = "STRALEPLACEHOLDER";

/** Hosts that are ours, or a schema/example, and never a fetched source. */
const NOT_A_SOURCE =
  /(^|\.)strale\.(dev|io)$|(^|\.)schema\.org$|(^|\.)w3\.org$|(^|\.)json-schema\.org$|(^|\.)example\.(com|test)$|^localhost$/;

export interface SourceCandidate {
  /** The URL with every `${…}` replaced by {@link PLACEHOLDER}. */
  url: string;
  host: string;
  /** Path and query only: robots.txt matching ignores the fragment (RFC 9309 §2.2.2). */
  pathAndQuery: string;
  /**
   * The host is built from a closed set Strale chose, not from input: a
   * placeholder sits beside a literal registrable name, as in
   * `www.pricerunner.${tld}`. Strale chose the source, but which origin is
   * fetched is decided per call, so the sweep cannot check it statically and
   * reports it as unverified rather than skipping it.
   */
  templatedHost?: true;
}

/**
 * A host with a placeholder is caller-directed when nothing literal names the
 * site: `${url}`, `${domain}`, `${sub}.${domain}`. It is Strale's choice when
 * a literal label of at least three characters other than `www` is present.
 * Review of #855 (2026-11-02): skipping every templated host hid
 * `price-compare`, one of the two incidents the sweep was built for.
 */
function hasLiteralSiteLabel(host: string): boolean {
  return host
    .split(".")
    .some((label) => !label.toUpperCase().includes(PLACEHOLDER) && label !== "www" && label.length >= 3);
}

/**
 * Literal URL templates in a source file that name a Strale-chosen source.
 *
 * Excluded, in order: multi-line strings and prompt-example ellipses, anything
 * with a placeholder in the host, non-http schemes, and our own and schema
 * hosts.
 */
export function sourceCandidates(text: string): SourceCandidate[] {
  const out = new Map<string, SourceCandidate>();
  for (const raw of text.match(/`https?:\/\/[^`]+`|"https?:\/\/[^"]+"/g) ?? []) {
    let u = raw.slice(1, -1);
    if (u.includes("\n") || u.includes("...") || u.includes("…")) continue;
    u = u.replace(/\$\{[^}]*\}/g, PLACEHOLDER);
    if (/[<>\s]/.test(u)) continue;
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    // URL lower-cases the host, so compare case-insensitively.
    const templated = parsed.host.toUpperCase().includes(PLACEHOLDER);
    if (templated && !hasLiteralSiteLabel(parsed.host)) continue;
    if (NOT_A_SOURCE.test(parsed.host)) continue;
    out.set(u, {
      url: u,
      host: parsed.host,
      pathAndQuery: `${parsed.pathname}${parsed.search}`,
      ...(templated ? { templatedHost: true as const } : {}),
    });
  }
  return [...out.values()];
}
