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
    if (parsed.host.toUpperCase().includes(PLACEHOLDER)) continue;
    if (NOT_A_SOURCE.test(parsed.host)) continue;
    out.set(u, {
      url: u,
      host: parsed.host,
      pathAndQuery: `${parsed.pathname}${parsed.search}`,
    });
  }
  return [...out.values()];
}
